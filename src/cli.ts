#!/usr/bin/env node
/**
 * CLI entry point / bootstrap.
 *
 * Two jobs, in this order:
 * 1. Install output routing (diagnostics → stderr, stdout reserved for the
 *    single JSON result) BEFORE the rest of the program graph — and its
 *    transitive `tickerhub` import — is evaluated. See src/output.ts.
 * 2. Run the program (src/main.ts), reporting any rejection on stderr and
 *    setting `process.exitCode` — never `process.exit()` — so outstanding
 *    background work (SWR refresh) settles before the process ends instead
 *    of being torn down mid-flight. See src/lifecycle.ts.
 *
 * main.ts must be imported dynamically: a static import would evaluate the
 * library (and its module-level logging side effects) before this module's
 * body runs.
 */

import { installCliOutputRouting } from "./output.js";

installCliOutputRouting();

const { run } = await import("./main.js");

run(process.argv).catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
