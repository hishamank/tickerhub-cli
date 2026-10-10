/** Route console diagnostics before importing the CLI program; leave stdout writes intact. */
import { Console } from "node:console";
import { format } from "node:util";

const YAHOO_NOTICE_PATTERNS = [
  /Please consider completing the survey at https:\/\/bit\.ly\/yahoo-finance-api-feedback/,
  /for more info see https:\/\/github\.com\/gadicc\/yahoo-finance2\/issues\/\d+#issuecomment-/,
  /\[Deprecated\] historical\(\) relies on an API that Yahoo have removed/,
  /We'll map this request to chart\(\) for convenience/,
  /please consider using chart\(\) directly instead/,
  /This will only be shown once, but you can suppress this message in future/,
];

export function installCliOutputRouting(): void {
  const diagnostics = new Console({ stdout: process.stderr, stderr: process.stderr });
  for (const method of ["log", "info", "debug", "warn", "error"] as const) {
    console[method] = (...args: unknown[]) => {
      const message = format(...args.map((arg) => Buffer.isBuffer(arg) ? arg.toString("utf8") : arg));
      if (!YAHOO_NOTICE_PATTERNS.some((pattern) => pattern.test(message))) {
        diagnostics[method](...args);
      }
    };
  }
}
