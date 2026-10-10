#!/usr/bin/env node
// Install routing before evaluating tickerhub's module-level diagnostics.
import { installCliOutputRouting } from "./output.js";

installCliOutputRouting();

const { run } = await import("./main.js");

run(process.argv).catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
