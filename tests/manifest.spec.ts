import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import manifest from "../src/manifest.js";
import { PieVersion } from "../src/ui/pieVersion.js";
import { COMMIT_PLUGIN, VERSION_PLUGIN } from "../src/version.js";

describe("manifiesto", () => {
  it("el host lo acepta: la descripción tiene como mucho 500 letras (con más, `upgrade` responde 400)", () => {
    expect(manifest.description.length).toBeLessThanOrEqual(500);
  });

  it("usa la versión calculada para el build y no pide capacidades nuevas (se actualiza con `upgrade`)", () => {
    expect(manifest.version).toBe(VERSION_PLUGIN);
    expect(manifest.version).not.toBe("0.14.5");
    expect([...manifest.capabilities].sort()).toEqual(["ui.action.register", "ui.dashboardWidget.register", "ui.page.register", "ui.sidebar.register"]);
  });

  it("el pie muestra la versión y el commit del build", () => {
    const html = renderToStaticMarkup(createElement(PieVersion));
    expect(html.replace(/<!--.*?-->|<[^>]*>/g, "")).toBe(`Oficina ${VERSION_PLUGIN} · ${COMMIT_PLUGIN}`);
    expect(html).toContain(`data-oficina-version="${VERSION_PLUGIN}"`);
    expect(html).toContain(`data-oficina-commit="${COMMIT_PLUGIN}"`);
    expect(manifest.version).toBe(VERSION_PLUGIN);
  });
});
