import { describe, it, expect, beforeEach } from "vitest";
import {
  loadPersistedIncident,
  savePersistedIncident,
  clearPersistedIncident,
  createMemoryStorage,
  POS_INCIDENT_STORAGE_KEY,
  type PosRetryDescriptor,
} from "./pos-retry";
import type { NormalizedError } from "./error-handler";

const err = (): NormalizedError => ({
  message: "insufficient_stock",
  incidentId: "ERR-TEST-0001",
  original: null,
});

let storage: ReturnType<typeof createMemoryStorage>;
beforeEach(() => {
  storage = createMemoryStorage();
});

describe("pos-retry persistence", () => {
  it("round-trips a scan descriptor with the normalized error", () => {
    const descriptor: PosRetryDescriptor = {
      kind: "scan",
      code: "6291000123456",
      keepScannerOpen: true,
    };
    savePersistedIncident({ descriptor, error: err() }, storage);
    const loaded = loadPersistedIncident(storage);
    expect(loaded?.descriptor).toEqual(descriptor);
    expect(loaded?.error.incidentId).toBe("ERR-TEST-0001");
    expect(typeof loaded?.savedAt).toBe("number");
  });

  it("does NOT persist save descriptors (state cannot be rehydrated)", () => {
    savePersistedIncident({ descriptor: { kind: "save" }, error: err() }, storage);
    expect(storage.getItem(POS_INCIDENT_STORAGE_KEY)).toBeNull();
    expect(loadPersistedIncident(storage)).toBeNull();
  });

  it("returns null for corrupted payloads", () => {
    storage.setItem(POS_INCIDENT_STORAGE_KEY, "{not json");
    expect(loadPersistedIncident(storage)).toBeNull();
  });

  it("ignores and evicts stale entries older than 24h", () => {
    const stale = {
      descriptor: { kind: "scan", code: "111" },
      error: err(),
      savedAt: Date.now() - 25 * 60 * 60 * 1000,
    };
    storage.setItem(POS_INCIDENT_STORAGE_KEY, JSON.stringify(stale));
    expect(loadPersistedIncident(storage)).toBeNull();
    expect(storage.getItem(POS_INCIDENT_STORAGE_KEY)).toBeNull();
  });

  it("clearPersistedIncident removes the entry", () => {
    savePersistedIncident({ descriptor: { kind: "scan", code: "x" }, error: err() }, storage);
    clearPersistedIncident(storage);
    expect(loadPersistedIncident(storage)).toBeNull();
  });
});
