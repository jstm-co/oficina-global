// `npm publish` solo desde GitHub Actions (JST-419). La carpeta de instalación de un mantenedor tiene un
// `dist/` compilado con los datos de su instancia (instancia.local.ts): desde ahí no se publica nunca.
import { existsSync } from "node:fs";

if (process.env.GITHUB_ACTIONS !== "true" || existsSync("instancia.local.ts")) {
  console.error("This package is only published by the «Publish to npm» workflow on GitHub Actions, never from a local checkout.");
  process.exit(1);
}
