import { appendFileSync } from "node:fs";
import { installCliOutputRouting } from "../../src/output.js";
import { registerDeferredClose } from "../../src/lifecycle.js";

installCliOutputRouting();
const { SwrCache, generateCacheKey } = await import("tickerhub");
const { openSqliteStores } = await import("tickerhub/sqlite");
const [dbPath, marker, exitCode] = process.argv.slice(2);
if (!dbPath || !marker) throw new Error("Missing fixture paths");
const { db, cache } = await openSqliteStores(dbPath);
registerDeferredClose(() => {
  db.close();
  appendFileSync(marker, "close\n");
});
const now = Date.now();
await cache.set(generateCacheKey("getQuote", "SPY"), {
  data: { symbol: "SPY", price: 999.5 },
  fetchedAt: now - 120_000,
  staleAt: now - 60_000,
  expiresAt: now + 180_000,
}, 180);
let fetched = false;
const response = await new SwrCache(cache).get("getQuote", ["SPY"], async () => {
  await new Promise((resolve) => setTimeout(resolve, 250));
  fetched = true;
  appendFileSync(marker, "fetch\n");
  return { symbol: "SPY", price: 123.45 };
});
if (fetched || !response.metadata.stale) throw new Error("Stale response was not immediate");
process.stdout.write(JSON.stringify(response.data) + "\n");
appendFileSync(marker, "output\n");
process.exitCode = Number(exitCode ?? 0);
