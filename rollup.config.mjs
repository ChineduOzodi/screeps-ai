/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
"use strict";

import clear from "rollup-plugin-clear";
import commonjs from "@rollup/plugin-commonjs";
import { createRequire } from "module";
import resolve from "@rollup/plugin-node-resolve";
import screeps from "rollup-plugin-screeps";
import typescript from "rollup-plugin-typescript2";
const require = createRequire(import.meta.url);

let cfg;
const dest = process.env.DEST;
if (!dest) {
    console.log("No destination specified - code will be compiled but not uploaded");
} else if ((cfg = require("./screeps.json")[dest]) == null) {
    throw new Error("Invalid upload destination");
}

export default {
    input: "src/main.ts",
    output: {
        file: "dist/main.js",
        format: "cjs",
        sourcemap: true,
    },

    plugins: [
        clear({ targets: ["dist"] }),
        resolve(),
        commonjs(),
        typescript({ tsconfig: "./tsconfig.json" }),
        screeps({ config: cfg, dryRun: cfg == null }),
    ],
};
