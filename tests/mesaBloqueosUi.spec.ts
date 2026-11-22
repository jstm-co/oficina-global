// JST-428: la mesa de bloqueadas pintada en el servidor (sin navegador): 0, 1 y varias, a 1x y a 2x/3x, y sin clic (TV).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { armarPiso } from "../src/plano.js";
import { setLocale } from "../src/i18n.js";

vi.mock("../src/ui/piso.js", () => ({
  cx: (...a: unknown[]) => a.filter(Boolean).join(" "),
  Icono: ({ nombre }: { nombre: string }) => `[${nombre}]`,
  Mueble: ({ nombre }: { nombre: string }) => `<mueble ${nombre}>`,
}));
const { GloboMesa, MesaBloqueos } = await import("../src/ui/mesaBloqueos.js");

const sala = armarPiso([{ prefijo: "AAA", agentes: 3 }], 1000, "widget").salas[0]!;
const mesa = (n: number, chico: boolean, onClick: (() => void) | null = () => {}) => renderToStaticMarkup(createElement(MesaBloqueos, { sala, n, empresa: "Empresa A", chico, onClick }));
const globo = (n: number) => renderToStaticMarkup(createElement(GloboMesa, { sala, n }));

describe("MesaBloqueos", () => {
  setLocale("es");
  it("la sala de la prueba lleva mesa", () => {
    expect(sala.mesaBloqueos).not.toBeNull();
  });
  it("con 0: la mesa sola, sin número ni globo", () => {
    for (const chico of [true, false]) {
      const html = mesa(0, chico);
      expect(html).toContain('data-mesa-bloqueos="AAA"');
      expect(html).toContain('aria-label="Nada bloqueado en Empresa A"');
      expect(html).toContain("of-carpetas");
      expect(html).not.toContain("of-mcnt");
      expect(html).not.toContain("is-con");
    }
  });
  it("a 1x con N > 0: pastilla neutra con el número; a 2x/3x no hay pastilla (el número va en el globo)", () => {
    const uno = mesa(1, true);
    expect(uno).toContain('aria-label="1 bloqueada en Empresa A"');
    expect(uno).toMatch(/class="of-mcnt"[^>]*>1</);
    const varias = mesa(7, true);
    expect(varias).toContain('data-tip="7 bloqueadas en Empresa A"');
    expect(varias).toMatch(/class="of-mcnt"[^>]*>7</);
    expect(mesa(7, false)).not.toContain("of-mcnt");
    expect(mesa(7, false)).toContain("is-con");
  });
  it("el globo dice «N bloqueadas», «1 bloqueada» con el ícono circle-pause, y es neutro (sin is-need de aviso ni morado)", () => {
    expect(globo(1)).toContain("[circle-pause]");
    expect(globo(1)).toContain("<b>1</b> bloqueada<");
    expect(globo(5)).toContain("<b>5</b> bloqueadas<");
    expect(globo(5)).toContain("of-b-mesa");
    expect(globo(5)).not.toContain("of-b-yo");
    expect(globo(5)).not.toContain("is-need");
  });
  it("sin onMesa (el TV) no se puede tocar", () => {
    const html = mesa(2, true, null);
    expect(html).toContain("is-fijo");
    expect(html).toContain('tabindex="-1"');
    expect(mesa(2, true)).toContain('tabindex="0"');
    expect(mesa(2, true)).not.toContain("is-fijo");
  });
});
