import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import type { WiredService } from "./service.js";
import { runDeferredCloses } from "./lifecycle.js";

const harness = vi.hoisted(() => ({ opened: undefined as WiredService | undefined, close: vi.fn() }));
vi.mock("./service.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./service.js")>();
  return {
    ...actual,
    wireService: async (options: import("./service.js").ServiceOptions) => {
      const wired = await actual.wireService(options);
      harness.opened = wired;
      harness.close.mockImplementation(wired.close);
      return { ...wired, close: harness.close };
    },
    createService: () => { throw new Error("deterministic synthetic setup failure"); },
  };
});

it("registers real SQLite cleanup before aggregator setup can fail", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tickerhub-setup-"));
  try {
    const { run } = await import("./main.js");
    await expect(run(["node", "tickerhub", "--db", join(dir, "cache.db"), "quote", "SPY"]))
      .rejects.toThrow("deterministic synthetic setup failure");
    expect(harness.opened?.db.open).toBe(true);
    expect(harness.close).not.toHaveBeenCalled();
    runDeferredCloses();
    runDeferredCloses();
    expect(harness.close).toHaveBeenCalledTimes(1);
    expect(harness.opened?.db.open).toBe(false);
  } finally {
    runDeferredCloses();
    if (harness.opened?.db.open) harness.opened.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
