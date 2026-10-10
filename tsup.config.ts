import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts", "src/index.ts"],
  format: ["esm"],
  target: "node18",
  splitting: true,
  sourcemap: true,
  clean: true,
  dts: true,
});
