// JST-426: el botón «Bloqueadas N» de la franja «Te necesitan», pintado cerrado (sin navegador).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Bloqueada } from "../src/bloqueos.js";

vi.mock("../src/ui/piso.js", () => ({
  cx: (...a: unknown[]) => a.filter(Boolean).join(" "),
  Icono: ({ nombre }: { nombre: string }) => `[${nombre}]`,
  EtiquetaEmpresa: ({ prefijo }: { prefijo: string }) => prefijo,
}));
const { BotonBloqueadas } = await import("../src/ui/panelBloqueadas.js");

const b = (n: number): Bloqueada => ({ companyId: "c", prefijo: "AAA", empresa: "Empresa A", issueId: `i${n}`, identifier: `AAA-${n}`, titulo: "Tarea inventada", href: null, agenteId: null, desde: null, estado: "blocked", frena: 0, dePersona: false });
const enlazar = (href: string) => ({ href });
const pintar = (bloqueadas: Bloqueada[]) => renderToStaticMarkup(createElement(BotonBloqueadas, { bloqueadas, agentes: [], lector: null, enlazar, ahora: Date.now() }));

describe("botón «Bloqueadas» de la franja", () => {
  it("con bloqueadas: botón cerrado, con el número y sin panel", () => {
    const html = pintar([b(1), b(2)]);
    expect(html).toMatch(/class="of-bq-b"[^>]*aria-expanded="false"/);
    expect(html).toContain("<b>2</b>");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).not.toContain("of-bq-it");
  });
  it("sin bloqueadas no se dibuja nada", () => {
    expect(pintar([])).toBe("");
  });
});
