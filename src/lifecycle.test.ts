import { describe, expect, it, vi } from "vitest";
import {
  registerDeferredClose,
  runDeferredCloses,
} from "./lifecycle.js";

describe("deferred close registry", () => {
  it("runs registered closes once", () => {
    const a = vi.fn();
    const b = vi.fn();
    registerDeferredClose(a);
    registerDeferredClose(b);
    runDeferredCloses();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    // Second run (beforeExit can fire more than once) is a no-op.
    runDeferredCloses();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("a throwing close does not prevent the remaining closes", () => {
    const originalExitCode = process.exitCode;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = vi.fn(() => {
      throw new Error("boom");
    });
    const after = vi.fn();
    registerDeferredClose(failing);
    registerDeferredClose(after);
    expect(() => runDeferredCloses()).not.toThrow();
    expect(failing).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(1);
    process.exitCode = originalExitCode;
    log.mockRestore();
  });

  it("installs exactly one beforeExit handler for many registrations", () => {
    registerDeferredClose(vi.fn());
    const before = process.listenerCount("beforeExit");
    registerDeferredClose(vi.fn());
    registerDeferredClose(vi.fn());
    expect(process.listenerCount("beforeExit")).toBe(before);
  });
});
