import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setImmediate } from "node:timers/promises";
import { describe, expect, it, vi } from "vitest";
import { SwrCache, generateCacheKey, type CacheEntry } from "tickerhub";
import { openSqliteStores } from "tickerhub/sqlite";

// Deterministic synthetic quotes; real SWR and SQLite, no live providers.
const oldQuote = { symbol: "SPY", price: 999.5 };
const newQuote = { symbol: "SPY", price: 123.45 };
const key = generateCacheKey("getQuote", "SPY");

describe("deterministic SWR/SQLite contract", () => {
  for (const mode of ["fresh", "expired", "forceRefresh", "miss", "stale"] as const) {
    it(`${mode}: cache behavior, request coalescing and durable writes`, async () => {
      const dir = mkdtempSync(join(tmpdir(), "tickerhub-swr-"));
      const path = join(dir, "cache.db");
      const { db, cache } = await openSqliteStores(path);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const fetcher = vi.fn(async () => { await gate; return newQuote; });
      let requests: Array<ReturnType<SwrCache["get"]>> = [];
      try {
        const now = Date.now();
        if (mode !== "miss") await cache.set(key, {
          data: oldQuote, fetchedAt: now - 120_000,
          staleAt: mode === "fresh" || mode === "forceRefresh" ? now + 60_000 : now - 60_000,
          expiresAt: mode === "expired" ? now - 1_000 : now + 180_000,
        }, 180);
        const swr = new SwrCache(cache);
        let settled = 0;
        requests = Array.from({ length: 5 }, () => swr.get("getQuote", ["SPY"], fetcher,
          { forceRefresh: mode === "forceRefresh" }).then((response) => { settled++; return response; }));
        await setImmediate();
        expect(fetcher).toHaveBeenCalledTimes(mode === "fresh" ? 0 : 1);
        expect(settled).toBe(mode === "fresh" || mode === "stale" ? 5 : 0);
        const refreshed = mode === "stale"
          ? swr.get("getQuote", ["SPY"], fetcher, { forceRefresh: true }) : undefined;
        release();
        const responses = await Promise.all(requests);
        // A foreground forced read joins the stale background refresh, and
        // resolves only after the real SQLite write has completed.
        await refreshed;
        for (const response of responses) {
          expect(response.data).toEqual(mode === "fresh" || mode === "stale" ? oldQuote : newQuote);
          expect(response.metadata).toMatchObject({
            cached: mode === "fresh" || mode === "stale", stale: mode === "stale",
            source: mode === "fresh" || mode === "stale" ? "cache" : "provider",
          });
        }
        expect(fetcher).toHaveBeenCalledTimes(mode === "fresh" ? 0 : 1);
        db.close();
        const reopened = await openSqliteStores(path);
        try {
          const entry = await reopened.cache.get<CacheEntry<typeof newQuote>>(key);
          expect(entry?.data).toEqual(mode === "fresh" ? oldQuote : newQuote);
          expect(entry?.staleAt).toBeGreaterThan(now);
          expect(entry?.expiresAt).toBeGreaterThan(entry!.staleAt);
        } finally { reopened.db.close(); }
      } finally {
        release();
        await Promise.allSettled(requests);
        if (db.open) db.close();
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }
});
