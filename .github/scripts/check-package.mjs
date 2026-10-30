// Checks what `npm pack` would ship: the files the plugin needs, and nothing else.
// Run it after `npm run build`.
import { execFileSync } from "node:child_process";

const required = [
  "package.json",
  "README.md",
  "README.es.md",
  "LICENSE",
  "AVISOS.md",
  "dist/manifest.js",
  "dist/worker.js",
  "dist/ui/index.js",
  "dist/ui/tv.html",
  "dist/ui/oficina3d.js",
  "dist/generar_voces.mjs",
  "generador/motor_kokoro.py",
  "generador/referencias/ref_hombre_cl.wav",
];
const allowed = (path) =>
  ["dist/", "generador/"].some((dir) => path.startsWith(dir)) ||
  ["package.json", "README.md", "README.es.md", "LICENSE", "AVISOS.md"].includes(path);

const [pack] = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json"], { encoding: "utf8" }));
const files = pack.files.map((f) => f.path);
const missing = required.filter((path) => !files.includes(path));
const extra = files.filter((path) => !allowed(path));

if (missing.length || extra.length) {
  if (missing.length) console.error(`Missing from the npm package: ${missing.join(", ")}`);
  if (extra.length) console.error(`Should not be in the npm package: ${extra.join(", ")}`);
  process.exit(1);
}
console.log(`${pack.name}@${pack.version}: ${files.length} files, ${Math.round(pack.size / 1024)} KB packed.`);
