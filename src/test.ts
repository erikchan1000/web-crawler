import fs from "fs";
import path from "path";
import { sanitize } from "./parsingAlgo";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const htmlPath = path.join(__dirname, "Stackline_Beacon.html");
const html = fs.readFileSync(htmlPath, "utf-8");
const res = sanitize(html);

console.log(res);
