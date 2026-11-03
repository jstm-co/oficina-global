import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import manifest from "../src/manifest.js";
import { PieVersion } from "../src/ui/pieVersion.js";
import paquete from "../package.json" with { type: "json" };

describe("manifiesto", () => {
  it("el host lo acepta: la descripción tiene como mucho 500 letras (con más, `upgrade` responde 400)", () => {
    expect(manifest.description.length).toBeLessThanOrEqual(500);
  });

  it("la versión es la del paquete y no pide capacidades nuevas (se actualiza con `upgrade`)", () => {
    expect(manifest.version).toBe(paquete.version);
    expect([...manifest.capabilities].sort()).toEqual(["ui.action.register", "ui.dashboardWidget.register", "ui.page.register", "ui.sidebar.register"]);
  });

  it("el pie muestra la misma versión del paquete y del manifiesto", () => {
    const html = renderToStaticMarkup(createElement(PieVersion));
    expect(html.replace(/<!--.*?-->|<[^>]*>/g, "")).toBe(`Oficina ${paquete.version}`);
    expect(html).toContain(`data-oficina-version="${paquete.version}"`);
    expect(manifest.version).toBe(paquete.version);
  });
});
