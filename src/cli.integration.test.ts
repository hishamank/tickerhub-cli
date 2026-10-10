import { afterAll, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const cliEntry = join(projectRoot, "src", "cli.ts");

const tmpDirs: string[] = [];
afterAll(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
});

function runChild(entry: string, args: string[] = []): Promise<{ stdout: string; stderr: string; code: number | null; signal: string | null; killed: boolean }> {
  const dir = mkdtempSync(join(tmpdir(), "tickerhub-child-"));
  tmpDirs.push(dir);
  const stdoutPath = join(dir, "stdout");
  const stderrPath = join(dir, "stderr");
  const stdoutFd = openSync(stdoutPath, "w");
  const stderrFd = openSync(stderrPath, "w");
  return new Promise((resolvePromise, reject) => {
    // Files also work where sandboxed child-process pipes cannot be read.
    const child = spawn(process.execPath, ["--import", "tsx", entry, ...args], {
      cwd: projectRoot, timeout: 10_000, stdio: ["ignore", stdoutFd, stderrFd],
    });
    closeSync(stdoutFd);
    closeSync(stderrFd);
    child.once("error", reject);
    child.once("close", (code, signal) => {
      resolvePromise({ stdout: readFileSync(stdoutPath, "utf8"),
        stderr: readFileSync(stderrPath, "utf8"), code, signal, killed: child.killed });
    });
  });
}

async function runCli(args: string[]) {
  const result = await runChild(cliEntry, args);
  expect(result.signal).toBeNull();
  expect(result.killed).toBe(false);
  return result;
}

/** Seed a fresh quote so command tests never fetch from providers. */
async function seedFreshQuote(dbPath: string, symbol: string, price: number): Promise<void> {
  const { openSqliteStores } = await import("tickerhub/sqlite");
  const { db, cache } = await openSqliteStores(dbPath);
  try {
    const now = Date.now();
    const entry = {
      data: {
        symbol,
        price,
        currency: "USD",
        timestamp: new Date(now).toISOString(),
      },
      fetchedAt: now,
      staleAt: now + 60_000,
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
      await seedFreshQuote(dbPath, "SPY", 999.5);

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

      // Module diagnostics must be routed before tickerhub is imported.
      expect(stderr).toContain("[INFO]");
      expect(stderr).toContain("provider-registry");
    },
    15_000,
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
    15_000,
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
    15_000,
  );
});

describe("deterministic subprocess fixtures", () => {
  for (const exitCode of [0, 1]) {
    it(`persists delayed SWR refresh and closes once with exitCode ${exitCode}`, async () => {
      const dir = mkdtempSync(join(tmpdir(), "tickerhub-swr-test-"));
      tmpDirs.push(dir);
      const dbPath = join(dir, "cache.db");
      const marker = join(dir, "events");
      const result = await runChild(join(projectRoot, "tests/fixtures/swr-lifecycle.ts"), [dbPath, marker, String(exitCode)]);
      expect(result.signal).toBeNull();
      expect(result.killed).toBe(false);
      expect(result.code).toBe(exitCode);
      expect(JSON.parse(result.stdout)).toEqual({ symbol: "SPY", price: 999.5 });
      expect(readFileSync(marker, "utf8")).toBe("output\nfetch\nclose\n");
      expect(result.stderr).not.toMatch(/failed|error|cleanup/i);
      const { openSqliteStores } = await import("tickerhub/sqlite");
      const { generateCacheKey } = await import("tickerhub");
      const { db, cache } = await openSqliteStores(dbPath);
      try {
        const refreshed = await cache.get<import("tickerhub").CacheEntry<{ symbol: string; price: number }>>(generateCacheKey("getQuote", "SPY"));
        expect(refreshed?.data).toEqual({ symbol: "SPY", price: 123.45 });
        expect(refreshed?.staleAt).toBeGreaterThan(Date.now());
      } finally { db.close(); }
    }, 15_000);
  }

  it("filters console notices while preserving JSON and stream callbacks", async () => {
    const result = await runChild(join(projectRoot, "tests/fixtures/output.ts"));
    expect(result.code).toBe(0);
    expect(result.signal).toBeNull();
    expect(result.killed).toBe(false);
    const lines = result.stdout.trim().split("\n");
    expect(JSON.parse(lines[0]!)).toEqual({ notice: "Please consider completing the survey at https://bit.ly/yahoo-finance-api-feedback" });
    expect(lines[1]).toBe("callback");
    expect(result.stderr).toBe("diagnostic\nbuffer callback\n");
  });

  it("keeps version on stdout", async () => {
    const result = await runCli(["--version"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("0.1.0\n");
  });
});

it("preserves bootstrap order and diagnostics in the bundled CLI", async () => {
  const bundle = readFileSync(join(projectRoot, "dist/cli.js"), "utf8");
  expect(bundle.indexOf("installCliOutputRouting();")).toBeLessThan(bundle.indexOf('await import("./main-'));
  expect(bundle).not.toMatch(/from ["']tickerhub/);
  const dir = mkdtempSync(join(tmpdir(), "tickerhub-bundle-"));
  tmpDirs.push(dir);
  const dbPath = join(dir, "cache.db");
  await seedFreshQuote(dbPath, "SPY", 999.5);
  const result = await runChild(join(projectRoot, "dist/cli.js"), ["--db", dbPath, "--no-metadata", "quote", "SPY"]);
  expect(result.code).toBe(0);
  expect(result.signal).toBeNull();
  expect(result.killed).toBe(false);
  expect(JSON.parse(result.stdout).price).toBe(999.5);
  expect(result.stderr).toContain("provider-registry");
});
