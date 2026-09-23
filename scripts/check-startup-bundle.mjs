import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const MAX_STARTUP_BYTES = 1_000_000;
const html = await readFile(resolve("dist/index.html"), "utf8");
const match = html.match(/<script[^>]+type=["']module["'][^>]+src=["']([^"']+\.js)["']/i)
  ?? html.match(/<script[^>]+src=["']([^"']+\.js)["'][^>]+type=["']module["']/i);

if (!match) {
  throw new Error("Could not find the production entry script in dist/index.html.");
}

const entryPath = resolve("dist", match[1].replace(/^\//, ""));
const bytes = (await stat(entryPath)).size;
const kb = (bytes / 1024).toFixed(1);

if (bytes > MAX_STARTUP_BYTES) {
  throw new Error(`Startup entry bundle is ${kb} KiB, over the ${(MAX_STARTUP_BYTES / 1024).toFixed(0)} KiB budget. Keep Babylon/GDTF and other heavy features out of the initial shell.`);
}

console.log(`Startup entry bundle: ${kb} KiB / ${(MAX_STARTUP_BYTES / 1024).toFixed(0)} KiB budget.`);
