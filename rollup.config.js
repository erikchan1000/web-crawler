import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import json from "@rollup/plugin-json";

export default {
  input: "src/index.ts", // Entry file
  output: {
    dir: "dist",
    format: "esm",
    sourcemap: true,
  },
  external: ["crawlee", "node:stream", "puppeteer"], // Exclude Node.js core modules
  plugins: [
    resolve({
      preferBuiltins: true,
    }),
    commonjs(),
    typescript(),
    json(),
  ],
};
