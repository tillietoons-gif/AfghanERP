/**
 * Persistent queue for completed POS sales that couldn't reach the server
 * (offline or transient network failure). Drained automatically when the
 * browser comes back online.
 *
 * Each entry stores the full sale payload so it can be replayed verbatim
 * once connectivity returns. The server is expected to be idempotent on
 * `client_request_id` so retries don't double-charge.
 */

export interface QueuedSale {
  id: string;
  payload: unknown;
  enqueuedAt: number;
  attempts: number;
  lastError?: string;
}

const KEY = "pos.sales.queue.v1";

type Listener = (q: QueuedSale[]) => void;
const listeners = new Set<Listener>();

type Runner = (payload: unknown) => Promise<boolean>;
let runner: Runner | null = null;

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function read(): QueuedSale[] {
  const s = storage();
  if (!s) return [];
  try {
    const raw = s.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedSale[];
    return Array.isArray(parsed) ? parsed.filter((q) => q && q.id && q.payload) : [];
  } catch {
    return [];
  }
}

function write(q: QueuedSale[]): void {
  const s = storage();
  if (s) {
    try {
      s.setItem(KEY, JSON.stringify(q));
    } catch {
      /* quota */
    }
  }
  listeners.forEach((l) => l(q));
}

export function listSalesQueue(): QueuedSale[] {
  return read();
}

export function salesQueueSize(): number {
  return read().length;
}

export function subscribeSalesQueue(fn: Listener): () => void {
  listeners.add(fn);
  fn(read());
  return () => {
    listeners.delete(fn);
  };
}

export function enqueueSale(payload: unknown): QueuedSale {
  const rec: QueuedSale = {
    id: `sale_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    payload,
    enqueuedAt: Date.now(),
    attempts: 0,
  };
  write([...read(), rec]);
  return rec;
}

export function removeSale(id: string): void {
  write(read().filter((q) => q.id !== id));
}

export function clearSalesQueue(): void {
  write([]);
}

export function registerSalesRunner(fn: Runner | null): void {
  runner = fn;
}

/** Drain queued sales sequentially. Stops on first failure. */
export async function drainSalesQueue(): Promise<void> {
  if (!runner) return;
  for (const item of read()) {
    try {
      const ok = await runner(item.payload);
      if (ok) {
        removeSale(item.id);
      } else {
        item.attempts += 1;
        item.lastError = "runner returned false";
        write(read().map((q) => (q.id === item.id ? item : q)));
        break;
      }
    } catch (err) {
      item.attempts += 1;
      item.lastError = err instanceof Error ? err.message : String(err);
      write(read().map((q) => (q.id === item.id ? item : q)));
      break;
    }
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    void drainSalesQueue();
  });
}
