import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import esbuild from "esbuild";
import { createPluginBundlerPresets } from "@paperclipai/plugin-sdk/bundlers";

const presets = createPluginBundlerPresets({ uiEntry: "src/ui/index.tsx" });

// Los sprites y el sonido del aviso (JST-95) van dentro del bundle como data-URL (ver src/ui/sprites.ts).
const loader = { ".png": "dataurl", ".mp3": "dataurl" };

// Modo TV suelto, servido por el host en /_plugins/<uuid>/ui/tv.html. El host
// no le da React, así que este bundle trae el suyo.
const tv = {
  entryPoints: { tv: "src/tv/tv.tsx" },
  outdir: "dist/ui",
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  jsx: "automatic",
  minify: true,
  loader,
  define: { "process.env.NODE_ENV": '"production"' },
};

// Vista 3D (three.js), en su propio archivo: la página la carga solo al abrirla,
// por su dirección completa (`src/ui/vista3d.tsx`). Las hojas de sprites se las
// pasa la página, así que aquí no van.
const oficina3d = {
  entryPoints: { oficina3d: "src/ui/oficina3d/index.ts" },
  outdir: "dist/ui",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
};

// Generador de los audios de las voces (JST-124): se corre a mano en la Mac
// (`npm run voces -- --api …`), no lo carga Paperclip.
const voces = {
  entryPoints: { generar_voces: "generador/generar_voces.ts" },
  outdir: "dist",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
};

// Sonda de la prueba técnica JST-66 (Node, solo lectura). La copia pública no trae
// `spike/` (JST-284): ahí no se arma.
const sonda = {
  entryPoints: ["spike/sonda.ts"],
  outfile: "dist/spike/sonda.mjs",
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
};

await Promise.all([
  esbuild.build(presets.esbuild.worker),
  esbuild.build(presets.esbuild.manifest),
  esbuild.build({ ...presets.esbuild.ui, loader: { ...presets.esbuild.ui.loader, ...loader } }),
  esbuild.build(tv),
  esbuild.build(oficina3d),
  esbuild.build(voces),
  existsSync(sonda.entryPoints[0]) ? esbuild.build(sonda) : null,
]);
mkdirSync("dist/ui", { recursive: true });
copyFileSync("static/tv.html", "dist/ui/tv.html");
