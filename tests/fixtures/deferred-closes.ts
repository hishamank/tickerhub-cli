// Deterministic subprocess harness: no provider calls.
import { appendFileSync } from "node:fs";
import { registerDeferredClose } from "../../src/lifecycle.js";
const [mode, marker] = process.argv.slice(2);
if (!marker) throw new Error("Missing marker");
const event = (name: string) => appendFileSync(marker, `${name}\n`);
registerDeferredClose(() => { event("close-a"); if (mode === "throwing") throw new Error("synthetic close failure"); });
registerDeferredClose(() => event("close-b"));
if (mode === "multiple" || mode === "throwing") {
  // Cause beforeExit to fire a second time, without re-registering closes.
  process.once("beforeExit", () => { setTimeout(() => event("drained-again"), 10); });
} else if (mode === "handleless") {
  void new Promise<void>(() => {}).then(() => event("promise-finished"));
  event("promise-pending");
} else if (mode === "forced") {
  event("forced-exit");
  process.exit(0);
} else throw new Error("Unknown fixture mode");
