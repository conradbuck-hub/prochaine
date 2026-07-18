// Simple in-memory TTL cache. Real-time feeds get short TTLs, static/frequency
// data gets longer ones — callers pass the TTL per-call, this just tracks expiry.

export class TTLCache {
  #store = new Map();

  get(key) {
    const entry = this.#store.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.#store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key, value, ttlMs) {
    this.#store.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  }

  async getOrFetch(key, ttlMs, fetchFn) {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const value = await fetchFn();
    this.set(key, value, ttlMs);
    return value;
  }

  delete(key) {
    this.#store.delete(key);
  }

  clear() {
    this.#store.clear();
  }

  get size() {
    return this.#store.size;
  }
}

// TTL presets, in ms.
export const TTL = {
  LIVE_RT: 30_000,        // bus GTFS-RT, exo delay overlay
  FREQUENCY_TABLE: 3_600_000,   // métro/REM frequencies — changes with schedule updates only
  TIMETABLE: 3_600_000,   // exo static timetable
  ALERTS: 60_000,
  BIXI: 30_000,
  WEATHER: 600_000,
  STOP_INDEX: 86_400_000, // stop name index — rebuilt by the preprocessor, not refetched
};
