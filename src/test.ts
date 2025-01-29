import fs from "fs";
import path from "path";
import { sanitize } from "./parsingAlgo";
import { fileURLToPath } from "url";

const test = {
    key: "hello world"
}

const testMap = new Map([["hello", "world"], ["world", "test"]]);

console.log(JSON.stringify(test));
console.log(JSON.stringify(testMap));
