import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { mkdtempSync, openSync, closeSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("survives cross-context Statement GC with the database open in 20 subprocesses", () => {
  const addon = process.env.SQLITE_CONTROL_PATH ?? createRequire(import.meta.url).resolve("better-sqlite3");
  const fixture = fileURLToPath(new URL("../tests/fixtures/addon-context.cjs", import.meta.url));
  const results = Array.from({ length: 20 }, () => {
    // The shell limit is inherited by Node; an addon abort cannot kill Vitest.
    const dir = mkdtempSync(join(tmpdir(), "native-gc-"));
    const out = openSync(join(dir, "stdout"), "w");
    const err = openSync(join(dir, "stderr"), "w");
    const child = spawnSync("bash", ["-c", 'ulimit -c 0; exec "$@"', "native-probe", process.execPath, fixture, addon, "vm"], { timeout: 10_000, stdio: ["ignore", out, err] });
    closeSync(out); closeSync(err);
    const stdout = readFileSync(join(dir, "stdout"), "utf8");
    const stderr = readFileSync(join(dir, "stderr"), "utf8");
    rmSync(dir, { recursive: true });
    return { status: child.status, signal: child.signal, stdout, stderr, error: child.error?.message };
  });
  console.error(JSON.stringify({ runtime: process.version, addon, results }));
  for (const result of results) {
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("DONE\n");
    expect(result.stderr).toContain("STATEMENTS_CREATED_DB_OPEN\nVM_DONE\n");
  }
}, 240_000);
