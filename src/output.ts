/**
 * CLI output routing.
 *
 * Contract: stdout carries exactly one JSON document per invocation — the
 * result printed by `print()` in main.ts. All diagnostics (the library's
 * `[INFO]`/`[DEBUG]` logging, deprecation notices, warnings) go to stderr so
 * `tickerhub --no-metadata quote SPY | jq .price` never chokes on log noise.
 *
 * Node's `console.log/info/debug` write to stdout, and the upstream
 * `tickerhub` library logs through `console.*`, so those methods are
 * re-pointed at a stderr-bound `Console`. `console.warn/error` already
 * write to stderr and are left untouched. `print()` writes via
 * `process.stdout.write` directly and is unaffected, as is Commander's
 * help/version output (it writes to the stream, not the console).
 *
 * `installCliOutputRouting()` must run before the rest of the program graph
 * — and its transitive `tickerhub` import with module-level side effects —
 * is evaluated. cli.ts therefore keeps this module dependency-free and
 * loads main.ts dynamically.
 */

import { Console } from "node:console";

// Suppress noisy yahoo-finance2 survey/deprecation notices that are not
// useful in an agent-facing CLI. The notices are emitted via console.log/
// console.warn before we can configure the YahooFinance instance, so we
// filter the streams.
const YAHOO_NOTICE_PATTERNS = [
  /Please consider completing the survey at https:\/\/bit\.ly\/yahoo-finance-api-feedback/,
  /for more info see https:\/\/github\.com\/gadicc\/yahoo-finance2\/issues\/\d+#issuecomment-/,
  /\[Deprecated\] historical\(\) relies on an API that Yahoo have removed/,
  /We'll map this request to chart\(\) for convenience/,
  /please consider using chart\(\) directly instead/,
  /This will only be shown once, but you can suppress this message in future/,
];

function isYahooNotice(chunk: unknown): boolean {
  if (typeof chunk !== "string") return false;
  return YAHOO_NOTICE_PATTERNS.some((pattern) => pattern.test(chunk));
}

function filterStream(stream: NodeJS.WriteStream): void {
  const originalWrite = stream.write.bind(stream);
  stream.write = ((chunk: unknown, encoding?: unknown, cb?: unknown) => {
    if (isYahooNotice(chunk)) return true;
    return (originalWrite as (chunk: unknown, encoding?: unknown, cb?: unknown) => boolean)(
      chunk,
      encoding as BufferEncoding,
      cb as () => void,
    );
  }) as typeof stream.write;
}

/** Drop known yahoo-finance2 notices from both standard streams. */
function installYahooNoticeFilter(): void {
  filterStream(process.stdout);
  filterStream(process.stderr);
}

/** Route console.log/info/debug (diagnostics) to stderr. */
function routeConsoleToStderr(): void {
  const stderrConsole = new Console({
    stdout: process.stderr,
    stderr: process.stderr,
  });
  console.log = (...args: unknown[]) => stderrConsole.log(...args);
  console.info = (...args: unknown[]) => stderrConsole.info(...args);
  console.debug = (...args: unknown[]) => stderrConsole.debug(...args);
}

/** Install all CLI output routing. Call before loading main.ts. */
export function installCliOutputRouting(): void {
  installYahooNoticeFilter();
  routeConsoleToStderr();
}
