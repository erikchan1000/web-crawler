import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import json from "@rollup/plugin-json";
import { strict } from "assert";

export default {
  input: "src/index.ts", // Entry file
  output: {
    dir: "dist",
    format: "esm",
    sourcemap: true,
    strict: false,
    intro: 'const global = globalThis;'

  },
  context: "globalThis",
  external: ["crawlee", "node:stream", "puppeteer", "encoding-sniffer"], // Exclude Node.js core modules
  plugins: [
    resolve({
      preferBuiltins: true,
      exportConditions: ["node"],
    }),
    commonjs({
      transformMixedEsModules: true,
    }),
    typescript({
      tsconfig: "./tsconfig.json",
    }),
    json(),
  ],
};
