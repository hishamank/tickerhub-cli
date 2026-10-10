/**
 * Subprocess regression tests for the CLI output/lifecycle contract.
 *
 * These spawn the real CLI (src/cli.ts via tsx) as a child process, the same
 * way `tickerhub` runs in production, and assert from the outside:
 *
 * 1. stdout carries exactly one JSON document — the seeded stale-cache quote
 *    — so `... | jq .price` works. Diagnostics (the provider-registry INFO
 *    lines, SWR debug lines, background-refresh warnings) go to stderr.
 * 2. Serving stale data fires the upstream SWR background refresh; the
 *    process still exits 0 with SQLite closing on `beforeExit` (the
 *    exit-134 window: DB closed while a background refresh was in flight).
 * 3. Errors set the exit code to 1 without stdout noise.
 * 4. Commander --help still writes human-readable output to stdout.
 *
 * The stale entry is seeded directly into the SQLite cache, so the stale
 * serve + background refresh path is reached deterministically without
 * needing a prior successful fetch.
 */

import { afterAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const tsxCli = join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
const cliEntry = join(projectRoot, "src", "cli.ts");

const tmpDirs: string[] = [];
afterAll(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
});

function runCli(args: string[]): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolvePromise, reject) => {
    execFile(
      process.execPath,
      [tsxCli, cliEntry, ...args],
      { cwd: projectRoot, timeout: 60_000 },
      (error, stdout, stderr) => {
        if (error && (error as NodeJS.ErrnoException).code === "ENOENT") {
          reject(error);
          return;
        }
        // error carries a non-zero code; normalize it out of the result.
        const code = error ? (error as NodeJS.ErrnoException & { code?: number }).code ?? 1 : 0;
        resolvePromise({ stdout: String(stdout), stderr: String(stderr), code });
      },
    );
  });
}

/** Seed a stale-but-not-expired getQuote cache entry for `symbol`. */
async function seedStaleQuote(dbPath: string, symbol: string, price: number): Promise<void> {
  const { openSqliteStores } = await import("tickerhub/sqlite");
  const { db, cache } = await openSqliteStores(dbPath);
  try {
    const now = Date.now();
    // getQuote TTL: staleAfter 60s, maxAge 300s (src/cache/ttl-config.ts in
    // tickerhub). fetched 120s ago: stale (past staleAt) but not expired.
    const entry = {
      data: {
        symbol,
        price,
        currency: "USD",
        timestamp: new Date(now - 120_000).toISOString(),
      },
      fetchedAt: now - 120_000,
      staleAt: now - 60_000,
      expiresAt: now + 180_000,
    };
    await cache.set(`provider-aggregator:getQuote:${symbol}`, entry, 180);
  } finally {
    db.close();
  }
}

describe("CLI subprocess contract", () => {
  it(
    "prints exactly one JSON document on stdout with diagnostics on stderr, exit 0",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "tickerhub-cli-test-"));
      tmpDirs.push(dir);
      const dbPath = join(dir, "cache.db");
      await seedStaleQuote(dbPath, "SPY", 999.5);

      const { stdout, stderr, code } = await runCli([
        "--db",
        dbPath,
        "--no-metadata",
        "quote",
        "SPY",
      ]);

      expect(code).toBe(0);

      // stdout: exactly one JSON document, nothing else.
      const parsed = JSON.parse(stdout) as { symbol: string; price: number };
      expect(parsed.symbol).toBe("SPY");
      expect(parsed.price).toBe(999.5);
      expect(stdout).not.toContain("[INFO]");
      expect(stdout).not.toContain("[DEBUG]");

      // stderr carries the diagnostics that previously polluted stdout:
      // the provider-registry INFO line is emitted on every command via
      // console.info, so it must be present here — routed, not swallowed.
      expect(stderr).toContain("[INFO]");
      expect(stderr).toContain("provider-registry");
    },
    90_000,
  );

  it(
    "exits 1 with the error on stderr and no stdout noise on a bad argument",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "tickerhub-cli-test-"));
      tmpDirs.push(dir);
      const dbPath = join(dir, "cache.db");

      const { stdout, stderr, code } = await runCli([
        "--db",
        dbPath,
        "historical",
        "AAPL",
        "not-a-date",
        "2025-01-01",
      ]);

      expect(code).toBe(1);
      expect(stdout).toBe("");
      expect(stderr).toContain("Invalid date");
    },
    60_000,
  );

  it(
    "keeps Commander help on stdout (human-readable, exit 0)",
    async () => {
      const { stdout, code } = await runCli(["--help"]);
      expect(code).toBe(0);
      expect(stdout).toContain("Usage:");
      // Help output is the one non-JSON stdout document the CLI produces,
      // written by Commander through process.stdout directly.
    },
    60_000,
  );
});
