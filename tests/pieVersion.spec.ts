import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";

describe("pie de versión", () => {
  it("la página lo monta en el escritorio, el piso del celular y la sala acercada", () => {
    const pagina = readFileSync("src/ui/pagina.tsx", "utf8");
    expect(pagina).toContain('import { PieVersion } from "./pieVersion.js";');
    expect(pagina.match(/<PieVersion \/>/g)).toHaveLength(3);
  });

  it("queda en el bundle de la página, sin que el empaquetador lo elimine", async () => {
    const resultado = await build({
      entryPoints: ["src/ui/index.tsx"],
      bundle: true,
      write: false,
      format: "esm",
      platform: "browser",
      target: "es2022",
      jsx: "automatic",
      minify: true,
      loader: { ".png": "dataurl", ".mp3": "dataurl" },
      define: { __OFICINA_VERSION__: '"2026.1104.0-dev+a1b2c3d"', __OFICINA_SHA__: '"a1b2c3d"' },
    });
    expect(resultado.outputFiles).toHaveLength(1);
    expect(resultado.outputFiles[0]!.text).toContain("data-oficina-version");
  });
});
