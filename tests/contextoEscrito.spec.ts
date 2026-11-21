// El informe escrito de «Leer contexto» (JST-414), dibujado en el servidor (sin navegador): las partes con su rótulo, la
// frase que va marcada, la cabecera con la duración y los botones, y cuándo no se dibuja nada.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Informe } from "../src/ui/contextoInforme.js";
import { LectorContexto, type VozContexto } from "../src/ui/contextoLector.js";
import { olvidarLugar, tocarEn } from "../src/ui/contextoLugar.js";
import { olvidarNivel } from "../src/ui/contextoNivel.js";

vi.mock("../src/ui/piso.js", () => ({
  cx: (...a: unknown[]) => a.filter(Boolean).join(" "),
  Icono: ({ nombre }: { nombre: string }) => `[${nombre}]`,
}));
const { PanelContexto } = await import("../src/ui/contextoEscrito.js");

const INFORME: Informe = {
  secciones: [
    { clave: "pide", titulo: "Quién te espera", frases: ["Marta te espera desde hace 3 horas.", "Es por la tarea ABC-1: Publicar la guía."] },
    { clave: "pregunta", titulo: "Qué te pregunta", frases: ["Te pregunta: ¿publico hoy?"] },
  ],
};
const leido = (informe: Informe | null = INFORME) => ({ informe, frases: informe ? informe.secciones.flatMap((s) => s.frases) : ["Una suelta.", "Otra suelta."] });

let hayVoz = true;
const voz: VozContexto = { hayVoz: async () => hayVoz, decir: () => () => undefined };
const nuevo = () => new LectorContexto({ voz, programar: (fn, ms) => (setTimeout(fn, ms), () => undefined) });
const pausa = () => new Promise((ok) => setTimeout(ok, 5));
const dibujar = (c: LectorContexto, tarea = "ABC-1", lugar: "barra" | "ventana" | "modal" | "franja" = "barra", extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(PanelContexto, { c, tarea, lugar, celular: false, ...extra }));

beforeEach(() => {
  hayVoz = true;
  olvidarLugar();
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  olvidarNivel();
});
afterEach(() => {
  vi.unstubAllGlobals();
  olvidarNivel();
});

describe("el panel del informe escrito", () => {
  it("no dibuja nada si no se leyó nada, si es de otra tarea o de otro lugar", async () => {
    const c = nuevo();
    expect(dibujar(c)).toBe("");
    tocarEn(c, "barra", "ABC-1", "completo", async () => leido());
    await pausa();
    expect(dibujar(c, "ABC-2")).toBe("");
    expect(dibujar(c, "ABC-1", "ventana")).toBe("");
    expect(dibujar(c)).not.toBe("");
    c.detener();
  });

  it("muestra cada parte con su rótulo y sus frases; la que va, marcada; las que faltan, apagadas", async () => {
    const c = nuevo();
    tocarEn(c, "barra", "ABC-1", "completo", async () => leido());
    await pausa();
    const html = dibujar(c);
    expect(html).toContain('<h4 class="of-ctx-sh">Quién te espera</h4>');
    expect(html).toContain('<h4 class="of-ctx-sh">Qué te pregunta</h4>');
    expect(html).toContain("Marta te espera desde hace 3 horas.");
    // La primera frase va marcada; las otras, por leer.
    expect(html).toMatch(/class="of-ctx-fr is-cur"[^>]*aria-current="true"[^>]*>Marta te espera/);
    expect(html).toMatch(/class="of-ctx-fr is-fut"[^>]*>Es por la tarea/);
    expect(html).toMatch(/class="of-ctx-fr is-fut"[^>]*>Te pregunta/);
    expect((html.match(/aria-current/g) ?? []).length).toBe(1);
    c.detener();
  });

  it("la marca sigue a la frase que va, y el número de frase es el de la lista plana", async () => {
    const c = nuevo();
    tocarEn(c, "barra", "ABC-1", "completo", async () => leido());
    await pausa();
    c.irA(2);
    const html = dibujar(c);
    expect(html).toMatch(/is-cur"[^>]*aria-current="true"[^>]*>Te pregunta: ¿publico hoy\?/);
    expect(html).not.toMatch(/is-fut"[^>]*>Te pregunta/);
    c.detener();
  });

  it("detenido: las frases siguen a la vista y ninguna queda marcada", async () => {
    const c = nuevo();
    tocarEn(c, "barra", "ABC-1", "completo", async () => leido());
    await pausa();
    c.detener();
    const html = dibujar(c);
    expect(html).toContain("Es por la tarea ABC-1: Publicar la guía.");
    expect(html).not.toContain("is-cur");
    expect(html).not.toContain("is-fut");
  });

  it("la cabecera: «Contexto de {código}», la duración, el selector Corto | Completo y los botones", async () => {
    const c = nuevo();
    tocarEn(c, "barra", "ABC-1", "completo", async () => leido());
    await pausa();
    const html = dibujar(c);
    expect(html).toContain("Contexto de ABC-1");
    expect(html).toContain("~5 s");
    expect(html).toMatch(/aria-pressed="false"[^>]*>Corto</);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Completo</);
    for (const nombre of ["Frase anterior", "Frase siguiente", "Detener lectura", "Cerrar el informe"]) expect(html).toContain(`aria-label="${nombre}"`);
    expect(html).toContain("[square]");
    c.detener();
    // Detenido, el botón lee de nuevo.
    const quieto = dibujar(c);
    expect(quieto).toContain('aria-label="Leer de nuevo"');
    expect(quieto).toContain("[play]");
  });

  it("una tarea sin código dice «Contexto de la tarea»", async () => {
    const c = nuevo();
    const id = "2f0c1a3e-1111-4222-8333-944455556666";
    tocarEn(c, "modal", id, "completo", async () => leido());
    await pausa();
    expect(dibujar(c, id, "modal")).toContain("Contexto de la tarea");
    c.detener();
  });

  it("el texto suelto (sin informe) cae a la lista plana, sin rótulos", async () => {
    const c = nuevo();
    tocarEn(c, "barra", "ABC-1", "completo", async () => leido(null));
    await pausa();
    const html = dibujar(c);
    expect(html).toContain("Una suelta.");
    expect(html).toContain("Otra suelta.");
    expect(html).not.toContain("of-ctx-sh");
    c.detener();
  });

  it("sin voz en español lo avisa dentro del panel; con voz, no", async () => {
    hayVoz = false;
    const c = nuevo();
    tocarEn(c, "barra", "ABC-1", "completo", async () => leido());
    await pausa();
    expect(dibujar(c)).toContain("Este navegador no tiene voz en español.");
    expect(dibujar(c)).toContain("Te lo dejo escrito.");
    c.detener();
    hayVoz = true;
    tocarEn(c, "barra", "ABC-1", "completo", async () => leido());
    await pausa();
    expect(dibujar(c)).not.toContain("no tiene voz");
    c.detener();
  });

  it("dentro de la ventana o del modal lleva `is-in`; en el celular, `is-m`; el estilo flotante se aplica", async () => {
    const c = nuevo();
    tocarEn(c, "ventana", "ABC-1", "completo", async () => leido());
    await pausa();
    expect(dibujar(c, "ABC-1", "ventana", { dentro: true })).toContain("of-ctx-esc is-in");
    expect(dibujar(c, "ABC-1", "ventana", { celular: true })).toContain("of-ctx-esc is-m");
    expect(dibujar(c, "ABC-1", "ventana", { estilo: { top: 40, right: 12 } })).toContain('style="top:40px;right:12px"');
    c.detener();
  });
});

describe("seguir, esperar el audio y el teclado", () => {
  it("detenida a medias dice «Seguir leyendo»; sin empezar o terminada, «Leer de nuevo»", async () => {
    const c = nuevo();
    tocarEn(c, "barra", "ABC-1", "completo", async () => leido());
    await pausa();
    c.irA(2);
    c.detener();
    expect(c.k).toBe(2);
    const html = dibujar(c);
    expect(html).toContain('aria-label="Seguir leyendo"');
    expect(html).not.toContain('aria-label="Leer de nuevo"');
    c.irA(0);
    c.detener();
    expect(dibujar(c)).toContain('aria-label="Leer de nuevo"');
  });

  it("mientras llega el audio, con las frases a la vista, la frase de partida va marcada", async () => {
    const esperando: VozContexto = { hayVoz: async () => true, decir: () => () => undefined, preparar: () => new Promise<void>(() => undefined) };
    const c = new LectorContexto({ voz: esperando, programar: (fn, ms) => (setTimeout(fn, ms), () => undefined) });
    tocarEn(c, "barra", "ABC-1", "completo", async () => leido());
    await pausa();
    expect(c.estado).toBe("cargando");
    c.irA(1);
    const html = dibujar(c);
    expect(html).toMatch(/is-cur"[^>]*aria-current="true"[^>]*>Es por la tarea/);
    expect(html).toContain('aria-label="Detener lectura"');
    c.detener();
  });

  it("las frases no son paradas de Tab: se tocan, y el teclado usa «frase anterior» y «siguiente»", async () => {
    const c = nuevo();
    tocarEn(c, "barra", "ABC-1", "completo", async () => leido());
    await pausa();
    const html = dibujar(c);
    expect((html.match(/class="of-ctx-fr[^"]*"[^>]*tabindex="-1"/g) ?? []).length).toBe(3);
    expect(html).toMatch(/aria-label="Frase anterior"(?![^>]*tabindex)/);
    c.detener();
  });
});
