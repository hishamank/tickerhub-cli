/**
 * Close CLI stores once active event-loop handles drain. beforeExit does not
 * wait for unresolved promises that have no active handles.
 */
const pendingCloses: Array<() => void> = [];
let handlerInstalled = false;

/**
 * Register a close callback to run when the event loop drains.
 * Idempotent per process: installs the `beforeExit` handler once.
 */
export function registerDeferredClose(close: () => void): void {
  pendingCloses.push(close);
  installHandler();
}

function installHandler(): void {
  if (handlerInstalled) return;
  handlerInstalled = true;
  process.on("beforeExit", () => {
    runDeferredCloses();
  });
}

/**
 * Run all registered closes, each at most once. A throwing close is
 * reported on stderr and does not prevent the remaining closes.
 * `beforeExit` can fire more than once; later invocations are no-ops.
 */
export function runDeferredCloses(): void {
  const closers = pendingCloses.splice(0);
  for (const close of closers) {
    try {
      close();
    } catch (error) {
      process.exitCode = 1;
      console.error("[cleanup] deferred close failed:", error);
    }
  }
}
