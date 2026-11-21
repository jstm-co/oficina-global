// Dónde se muestra el informe escrito de «Leer contexto» (JST-414): el lector es uno por pestaña, pero se toca desde
// cuatro lugares; el informe escrito se ve solo en el que empezó a leer. También lo que dice la cabecera del panel.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Informe } from "../src/ui/contextoInforme.js";
import { LectorContexto, type VozContexto } from "../src/ui/contextoLector.js";
import { cambiarNivelEn, codigoDeTarea, duracionDicha, lugarDeLectura, olvidarLugar, segundosDeFrases, soltarDe, tocarEn, visibleEn } from "../src/ui/contextoLugar.js";
import { nivelContexto, olvidarNivel } from "../src/ui/contextoNivel.js";

vi.mock("@paperclipai/plugin-sdk/ui", () => ({ useHostContext: () => ({}) }));
vi.mock("../src/ui/piso.js", () => ({ cx: () => "", Icono: () => null }));
vi.mock("../src/ui/sonido.js", () => ({ vocesDisponibles: () => [] }));

const INFORME: Informe = { secciones: [{ clave: "pide", titulo: "Quién te espera", frases: ["Marta te espera.", "Es por la tarea ABC-1."] }] };
const leido = (informe: Informe = INFORME) => ({ informe, frases: informe.secciones.flatMap((s) => s.frases) });

let dichas: string[];
const voz: VozContexto = {
  hayVoz: async () => true,
  decir: (f) => (dichas.push(f), () => undefined),
};
const nuevo = () => new LectorContexto({ voz, programar: (fn, ms) => (setTimeout(fn, ms), () => undefined) });
const pausa = () => new Promise((ok) => setTimeout(ok, 5));

beforeEach(() => {
  dichas = [];
  olvidarLugar();
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
  olvidarNivel();
});
afterEach(() => {
  vi.unstubAllGlobals();
  olvidarNivel();
});

describe("tocarEn: el informe escrito queda en el lugar donde se tocó", () => {
  it("lee el informe de esa tarea con el nivel y lo deja a la vista solo ahí", async () => {
    const c = nuevo();
    const cargar = vi.fn(async () => leido());
    tocarEn(c, "ventana", "ABC-1", "corto", cargar);
    expect(cargar).toHaveBeenCalledWith("ABC-1", "corto");
    expect(lugarDeLectura()).toBe("ventana");
    await pausa();
    expect(c.estado).toBe("leyendo");
    expect(visibleEn(c, "ventana", "ABC-1")).toBe(true);
    // Otro lugar (la barra de la misma tarea) o otra tarea: no.
    expect(visibleEn(c, "barra", "ABC-1")).toBe(false);
    expect(visibleEn(c, "ventana", "ABC-2")).toBe(false);
    expect(visibleEn(c, "ventana", null)).toBe(false);
    c.detener();
  });

  it("tocar mientras lee esa tarea la detiene y no cambia de lugar", async () => {
    const c = nuevo();
    tocarEn(c, "barra", "ABC-1", "completo", async () => leido());
    await pausa();
    tocarEn(c, "franja", "ABC-1", "completo", async () => leido());
    expect(c.estado).toBe("listo");
    expect(lugarDeLectura()).toBe("barra");
  });

  it("el botón de otra tarea, con una lectura activa, la lee de una vez (no detiene)", async () => {
    const c = nuevo();
    tocarEn(c, "barra", "ABC-1", "completo", async () => leido());
    await pausa();
    expect(c.tarea).toBe("ABC-1");
    const cargar = vi.fn(async () => leido({ secciones: [{ clave: "pide", titulo: "Quién te espera", frases: ["Otra tarea."] }] }));
    tocarEn(c, "franja", "ABC-2", "completo", cargar);
    expect(cargar).toHaveBeenCalledWith("ABC-2", "completo");
    expect(c.tarea).toBe("ABC-2");
    expect(lugarDeLectura()).toBe("franja");
    await pausa();
    expect(c.estado).toBe("leyendo");
    expect(dichas.at(-1)).toBe("Otra tarea.");
    c.detener();
  });

  it("lo mismo si la lectura activa todavía está cargando", () => {
    const c = nuevo();
    tocarEn(c, "barra", "ABC-1", "completo", () => new Promise(() => undefined));
    tocarEn(c, "ventana", "ABC-2", "completo", () => new Promise(() => undefined));
    expect(c.estado).toBe("cargando");
    expect(c.tarea).toBe("ABC-2");
    c.detener();
  });

  it("detenido, el informe sigue a la vista (hasta que se cierra)", async () => {
    const c = nuevo();
    tocarEn(c, "modal", "ABC-1", "completo", async () => leido());
    await pausa();
    c.detener();
    expect(c.estado).toBe("listo");
    expect(visibleEn(c, "modal", "ABC-1")).toBe(true);
  });

  it("al leer desde otro lugar, el anterior deja de mostrarlo", async () => {
    const c = nuevo();
    tocarEn(c, "barra", "ABC-1", "completo", async () => leido());
    await pausa();
    c.detener();
    tocarEn(c, "franja", "ABC-1", "completo", async () => leido());
    await pausa();
    expect(visibleEn(c, "barra", "ABC-1")).toBe(false);
    expect(visibleEn(c, "franja", "ABC-1")).toBe(true);
    c.detener();
  });

  it("una lectura que falla no deja informe a la vista", async () => {
    const c = nuevo();
    tocarEn(c, "barra", "ABC-1", "completo", async () => Promise.reject(new Error("HTTP 500")));
    await pausa();
    expect(c.estado).toBe("error");
    expect(visibleEn(c, "barra", "ABC-1")).toBe(false);
    c.detener();
  });

  it("mientras carga por primera vez todavía no hay panel", () => {
    const c = nuevo();
    tocarEn(c, "barra", "ABC-1", "completo", () => new Promise(() => undefined));
    expect(c.estado).toBe("cargando");
    expect(visibleEn(c, "barra", "ABC-1")).toBe(false);
    c.detener();
  });
});

describe("cambiarNivelEn: «Corto | Completo»", () => {
  it("guarda el nivel, vuelve a cargar con él y el panel no desaparece mientras carga", async () => {
    const c = nuevo();
    tocarEn(c, "barra", "ABC-1", "completo", async () => leido());
    await pausa();
    expect(visibleEn(c, "barra", "ABC-1")).toBe(true);
    let llega!: (l: ReturnType<typeof leido>) => void;
    const cargar = vi.fn(() => new Promise<ReturnType<typeof leido>>((ok) => (llega = ok)));
    cambiarNivelEn(c, "barra", "ABC-1", "corto", cargar);
    expect(nivelContexto()).toBe("corto");
    expect(cargar).toHaveBeenCalledWith("ABC-1", "corto");
    expect(c.estado).toBe("cargando");
    expect(c.frases).toEqual([]);
    expect(visibleEn(c, "barra", "ABC-1")).toBe(true);
    llega(leido({ secciones: [{ clave: "pide", titulo: "Quién te espera", frases: ["Solo una."] }] }));
    await pausa();
    expect(c.estado).toBe("leyendo");
    expect(c.frases).toEqual(["Solo una."]);
    expect(dichas.at(-1)).toBe("Solo una.");
    c.detener();
  });

  it("si la carga falla, el panel se va (el botón dice «No se pudo»)", async () => {
    const c = nuevo();
    tocarEn(c, "barra", "ABC-1", "completo", async () => leido());
    await pausa();
    cambiarNivelEn(c, "barra", "ABC-1", "corto", () => Promise.reject(new Error("HTTP 500")));
    await pausa();
    expect(c.estado).toBe("error");
    expect(visibleEn(c, "barra", "ABC-1")).toBe(false);
    c.detener();
  });
});

describe("soltarDe: cerrar el informe", () => {
  it("calla, suelta las frases y el lugar; solo si el informe es de ese lugar", async () => {
    const c = nuevo();
    tocarEn(c, "ventana", "ABC-1", "completo", async () => leido());
    await pausa();
    soltarDe(c, "barra");
    expect(c.estado).toBe("leyendo");
    soltarDe(c, "ventana");
    expect(c.estado).toBe("listo");
    expect(c.frases).toEqual([]);
    expect(c.informe).toBeNull();
    expect(lugarDeLectura()).toBeNull();
    expect(visibleEn(c, "ventana", "ABC-1")).toBe(false);
  });
});

describe("la cabecera del panel", () => {
  it("el código de la tarea; un id no es un código", () => {
    expect(codigoDeTarea("abc-12")).toBe("ABC-12");
    expect(codigoDeTarea("JST-414")).toBe("JST-414");
    expect(codigoDeTarea("2f0c1a3e-1111-4222-8333-944455556666")).toBeNull();
    expect(codigoDeTarea(null)).toBeNull();
  });

  it("la duración aproximada: «~40 s» y «~1 min»", () => {
    expect(duracionDicha(40)).toBe("~40 s");
    expect(duracionDicha(42)).toBe("~40 s");
    expect(duracionDicha(2)).toBe("~5 s");
    expect(duracionDicha(49)).toBe("~50 s");
    expect(duracionDicha(50)).toBe("~1 min");
    expect(duracionDicha(75)).toBe("~1 min");
    expect(duracionDicha(150)).toBe("~3 min");
  });

  it("lo que dura un texto suelto: unas 16 letras por segundo", () => {
    expect(segundosDeFrases(["x".repeat(80), "x".repeat(80)])).toBe(10);
    expect(segundosDeFrases([])).toBe(0);
  });
});
