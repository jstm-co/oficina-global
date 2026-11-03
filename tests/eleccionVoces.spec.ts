// Elegir las voces (0.11.0, JST-325; design-spec de JST-324, números del spike JST-323).
import { describe, expect, it } from "vitest";
import { CONTEXTO_INICIAL, eleccionInicial, esAlMomento, hayCambios, leerEleccion, nombreEnLista, porqueNoAlcanza, RESUMEN_INICIAL, tardaGrabar, textosAvisosJuntos, vozDeContexto, VOCES_AL_MOMENTO } from "../src/eleccionVoces.js";
import { VOCES } from "../src/voces.js";
import { opcionesDe, etiquetaDe } from "../src/ui/vocesElegir.js";
import { trabajosAvisosJuntos, trabajosDeAgente } from "../generador/plan.js";
import { plan } from "../generador/plan.js";

describe("lo que se elige", () => {
  it("al instalar: Alex lee el Resumen y Dora, «Leer contexto» (la elección del usuario en JST-324)", () => {
    expect(RESUMEN_INICIAL).toBe("alex");
    expect(CONTEXTO_INICIAL).toBe("dora");
    expect(eleccionInicial()).toMatchObject({ resumen: "alex", contexto: "dora", originales: {}, pendientes: {} });
    expect(leerEleccion(null)).toEqual(eleccionInicial());
    expect(leerEleccion("basura")).toEqual(eleccionInicial());
  });

  it("solo 5 voces (y desde la 0.13.0 las 10 de Supertonic) y la del navegador leen al momento; un clon, no (14 a 28 s por la primera frase)", () => {
    expect(VOCES_AL_MOMENTO.slice(0, 5)).toEqual(["lorenzo", "catalina", "alex", "dora", "santa"]);
    expect(VOCES_AL_MOMENTO.slice(5)).toEqual(VOCES.filter((v) => v.motor === "supertonic").map((v) => v.id));
    expect(esAlMomento("supertonic-m1")).toBe(true);
    expect(porqueNoAlcanza("supertonic-f2")).toBeNull();
    expect(esAlMomento("alex")).toBe(true);
    expect(esAlMomento("qwen3-mujer")).toBe(false);
    expect(leerEleccion({ resumen: "chatterbox-hombre", contexto: "qwen3-mujer" })).toMatchObject({ resumen: "alex", contexto: "dora" });
    expect(leerEleccion({ resumen: "navegador", contexto: "igual" })).toMatchObject({ resumen: "navegador", contexto: "igual" });
    expect(porqueNoAlcanza("qwen3-hombre")).toMatch(/13 a 25 s/);
    expect(porqueNoAlcanza("chatterbox-mujer")).toMatch(/14 a 30 s/);
    expect(porqueNoAlcanza("dora")).toBeNull();
  });

  it("«Leer contexto» puede ser «igual» al Resumen", () => {
    expect(vozDeContexto({ ...eleccionInicial(), resumen: "santa", contexto: "igual" })).toBe("santa");
    expect(vozDeContexto({ ...eleccionInicial(), resumen: "santa", contexto: "dora" })).toBe("dora");
  });

  it("lo que tenía cada agente se lee con su nombre y empresa; lo roto se bota", () => {
    const e = leerEleccion({
      originales: { a1: { voz: "lorenzo", corto: "Diseño", empresa: "JSTM" }, a2: { voz: "no-existe", corto: "x", empresa: "y" }, a3: { voz: "dora", corto: "", empresa: "y" } },
      pendientes: { a1: { voz: "dora", corto: "Diseño", empresa: "JSTM" } },
    });
    expect(Object.keys(e.originales)).toEqual(["a1"]);
    expect(e.pendientes.a1!.voz).toBe("dora");
  });

  it("«Volver a como estaba» aparece solo si cambiaste algo", () => {
    const base = eleccionInicial();
    expect(hayCambios(base, { a1: "lorenzo" })).toBe(false);
    expect(hayCambios({ ...base, resumen: "dora" }, null)).toBe(true);
    expect(hayCambios({ ...base, contexto: "igual" }, null)).toBe(true);
    const o = { a1: { voz: "lorenzo" as const, corto: "Diseño", empresa: "JSTM" } };
    expect(hayCambios({ ...base, originales: o }, { a1: "dora" })).toBe(true);
    expect(hayCambios({ ...base, originales: o }, { a1: "lorenzo" })).toBe(false);
    expect(hayCambios({ ...base, pendientes: o }, { a1: "lorenzo" })).toBe(true);
  });

  it("los clones se llaman «Clon #42»… en el selector, y grabar un agente con un clon tarda ~10 min", () => {
    expect(nombreEnLista("alex")).toBe("Alex");
    expect(nombreEnLista("chatterbox-hombre")).toBe("Clon #42");
    expect(nombreEnLista("qwen3-mujer")).toBe("Clon #45");
    expect(tardaGrabar("dora")).toBe("~1 min");
    expect(tardaGrabar("qwen3-hombre")).toBe("~10 min");
  });
});

describe("lo que se graba", () => {
  it("al cambiar la voz de un agente: 20 frases con su nombre y empresa, más las 12 sueltas que ya estaban grabadas", () => {
    const t = trabajosDeAgente({ id: "a1", nombre: "Diseño de Producto", empresa: "JSTM" }, "dora");
    expect(t).toHaveLength(32);
    expect(new Set(t.map((x) => x.archivo)).size).toBe(32);
    expect(t.every((x) => x.voz.id === "dora")).toBe(true);
    // Las 12 sueltas son las mismas que graba `plan` para cada voz: mismo texto, mismo archivo.
    const todas = plan([{ id: "a1", nombre: "Diseño de Producto", empresa: "JSTM", creado: "2026-01-01" }], { a1: "dora" });
    const claves = new Set(todas.filter((x) => x.voz.id === "dora").map((x) => x.archivo));
    expect(t.filter((x) => claves.has(x.archivo))).toHaveLength(32);
  });

  it("«3 agentes te necesitan» para 26 agentes son 100 frases, y para 4, 12 (de 2 a 4 × 4)", () => {
    expect(textosAvisosJuntos(26)).toHaveLength(100);
    expect(textosAvisosJuntos(4)).toHaveLength(12);
    expect(textosAvisosJuntos(1)).toHaveLength(4);
    expect(textosAvisosJuntos(3)).toContain("3 agentes te necesitan.");
    expect(trabajosAvisosJuntos(26, "alex")).toHaveLength(100);
  });

  it("el generador sigue haciendo los avisos juntos con la voz del Resumen que ya eligió el usuario", () => {
    const con = plan([], {}, "alex").filter((t) => t.texto.includes("agentes"));
    expect(con.length).toBeGreaterThan(0);
    expect(con.every((t) => t.voz.id === "alex")).toBe(true);
    expect(plan([], {}).filter((t) => t.texto.includes("agentes")).every((t) => t.voz.id === "catalina")).toBe(true);
  });
});

describe("las listas del panel", () => {
  it("Resumen: las que leen al momento y la del navegador, y los 4 clones aparte, con su porqué", () => {
    const o = opcionesDe("resumen", "Alex");
    expect(o.filter((x) => x.grupo === "momento").map((x) => x.valor)).toEqual([...VOCES_AL_MOMENTO, "navegador"]);
    expect(o.find((x) => x.valor === "supertonic-m1")).toMatchObject({ nombre: "Supertonic M1", numero: null });
    const clones = o.filter((x) => x.grupo === "no");
    expect(clones).toHaveLength(4);
    expect(clones.every((c) => !!c.porque)).toBe(true);
    expect(o.find((x) => x.valor === "alex")!.numero).toBe(20);
  });

  it("«Leer contexto» suma «Igual que el Resumen» primero, y avisa que Lorenzo y Catalina mandan el texto a Microsoft", () => {
    const o = opcionesDe("contexto", "Alex", true);
    expect(o[0]).toMatchObject({ valor: "igual", nombre: "Igual que el Resumen", detalle: "Hoy: Alex" });
    expect(o.find((x) => x.valor === "lorenzo")!.detalle).toMatch(/Microsoft/);
    expect(o.find((x) => x.valor === "dora")!.detalle).not.toMatch(/Microsoft/);
  });

  it("cada agente puede tener cualquiera de las 9, sin grupos, y la lista dice cuánto tarda en grabarse", () => {
    const o = opcionesDe("agente", "");
    expect(o).toHaveLength(VOCES.length);
    expect(o.every((x) => !x.porque && x.grupo === null)).toBe(true);
    expect(o.find((x) => x.valor === "dora")!.detalle).toMatch(/~1 min/);
    expect(o.find((x) => x.valor === "qwen3-mujer")!.detalle).toMatch(/~10 min/);
    expect(o.find((x) => x.valor === "supertonic-f1")!.detalle).toMatch(/~15 s/);
  });

  it("el disparador dice «Igual · Alex» cuando sigue al Resumen", () => {
    expect(etiquetaDe("igual", "alex")).toBe("Igual · Alex");
    expect(etiquetaDe("navegador", "alex")).toBe("Navegador");
    expect(etiquetaDe("dora", "alex")).toBe("Dora");
  });
});
