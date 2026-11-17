import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webDir = resolve(root, "www");
const files = [
  "index.html",
  "styles.css",
  "app.js",
  "dds.js",
  "sw.js",
  "manifest.webmanifest"
];

await mkdir(resolve(webDir, "vendor"), { recursive: true });

for (const file of files) {
  await cp(resolve(root, file), resolve(webDir, file));
}

const htmlPath = resolve(webDir, "index.html");
let html = await readFile(htmlPath, "utf8");
const cdnScript = /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/jszip@3\.10\.1\/dist\/jszip\.min\.js" crossorigin="anonymous"><\/script>/;

if (!cdnScript.test(html)) {
  throw new Error("Could not find the expected JSZip CDN script in index.html");
}

html = html.replace(cdnScript, '<script src="./vendor/jszip.min.js"></script>');
await writeFile(htmlPath, html, "utf8");

await cp(
  resolve(root, "node_modules/jszip/dist/jszip.min.js"),
  resolve(webDir, "vendor/jszip.min.js")
);

console.log("Built offline-ready web assets in www/");
