/**
 * Deferred cleanup registry for CLI-invoked services.
 *
 * The CLI's SQLite stores may still be in use when the response has been
 * printed: the upstream SWR cache serves stale data while a background
 * refresh is still running (stale-while-revalidate), and closing the
 * database in a `finally` right after the response can race with that
 * write — the reported exit-134 native abort (`RemoveEnvironmentCleanupHook`
 * assertion in Node) happened in exactly this window.
 *
 * Instead of closing eagerly, services register their `close` here and
 * the process closes them once the event loop has drained (`beforeExit`):
 * any pending background refresh completes first, then the database is
 * closed exactly once. Library consumers of `wireService()` keep explicit
 * close semantics; this registry is only wired up by the CLI.
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
      console.error("[cleanup] deferred close failed:", error);
    }
  }
}
