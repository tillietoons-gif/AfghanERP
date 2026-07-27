import type { PosRetryDescriptor } from "./pos-retry";

/**
 * Persistent POS action queue. Populated when a scan or save fails while the
 * browser is offline, drained automatically when connectivity returns.
 *
 * Only "scan" descriptors are safely re-runnable from persisted state — the
 * "save" case relies on the current in-memory cart and is enqueued for the
 * lifetime of the page only.
 */
export interface QueuedPosAction {
  id: string;
  descriptor: PosRetryDescriptor;
  savedAt: number;
}

const KEY = "pos.queue.v1";
type Runner = (d: PosRetryDescriptor) => Promise<boolean>;
let runner: Runner | null = null;

type Listener = (q: QueuedPosAction[]) => void;
const listeners = new Set<Listener>();

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function read(): QueuedPosAction[] {
  const s = storage();
  if (!s) return [];
  try {
    const raw = s.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedPosAction[];
    return Array.isArray(parsed)
      ? parsed.filter((it) => it && it.id && it.descriptor && typeof it.savedAt === "number")
      : [];
  } catch {
    return [];
  }
}

function write(q: QueuedPosAction[]): void {
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

export function listQueue(): QueuedPosAction[] {
  return read();
}
export function queueSize(): number {
  return read().length;
}
export function subscribeQueue(fn: Listener): () => void {
  listeners.add(fn);
  fn(read());
  return () => {
    listeners.delete(fn);
  };
}

export function enqueuePos(descriptor: PosRetryDescriptor): QueuedPosAction {
  const rec: QueuedPosAction = {
    id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    descriptor,
    savedAt: Date.now(),
  };
  // Save descriptors are meaningless once the tab reloads; ignore.
  if (descriptor.kind !== "scan") return rec;
  write([...read(), rec]);
  return rec;
}

export function removeFromQueue(id: string): void {
  write(read().filter((x) => x.id !== id));
}

export function clearQueue(): void {
  write([]);
}

export function registerPosRunner(fn: Runner | null): void {
  runner = fn;
}

/** Runs queued actions sequentially. Stops on the first failure to avoid burst-failing. */
export async function drainQueue(): Promise<void> {
  if (!runner) return;
  for (const item of read()) {
    if (item.descriptor.kind !== "scan") {
      removeFromQueue(item.id);
      continue;
    }
    try {
      const ok = await runner(item.descriptor);
      if (ok) removeFromQueue(item.id);
      else break;
    } catch {
      break;
    }
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    void drainQueue();
  });
}
