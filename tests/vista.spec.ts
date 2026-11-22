import { afterEach, describe, expect, it } from "vitest";
import { aspectoDe, rolDeSprite } from "../src/aspecto.js";
import { INSTANCIA_VACIA, leerDatosInstancia, ponerInstancia } from "../src/datosInstancia.js";
import type { AgenteOficina, Espera } from "../src/estado.js";
import { contarVista, desdeCuando, dibujo, etiqueta, hace, vistaDe } from "../src/vista.js";
import PERSONAJES from "../src/ui/assets/personajes.json" with { type: "json" };

function agente(extra: Partial<AgenteOficina> = {}): AgenteOficina {
  return {
    id: "a1",
    companyId: "c1",
    prefijo: "BET",
    nombre: "Ingeniero Backend Java / REST",
    rol: "Backend Java / REST",
    rolApi: "engineer",
    adapterType: "claude_local",
    esHermes: false,
    statusApi: "idle",
    base: "libre",
    run: null,
    runsExtra: 0,
    teNecesita: [],
    motivo: null,
    desde: null,
    ...extra,
  };
}

const espera = (identifier: string): Espera => ({ tipo: "tarjeta", itemId: identifier, sujetoId: null, clase: null, issueId: null, identifier, titulo: null, tituloTarea: null, href: null, desde: null });
const run = (identifier: string, enCola = false) => ({ id: "r1", issueId: "i1", identifier, titulo: null, enCola, desde: null, href: "/BET/agents/a1/runs/r1", tareaHref: null, tareaStatus: null });

describe("pose y frase (design-spec §5 y §11)", () => {
  it("libre que te necesita vuelve a su puesto y levanta la mano; trabajando sigue trabajando aunque te necesite", () => {
    expect(dibujo(agente({ teNecesita: [espera("BET-440")] }))).toBe("toca");
    expect(dibujo(agente({ base: "trabajando", teNecesita: [espera("BET-440")] }))).toBe("trabaja");
    expect(dibujo(agente({ base: "pausa" }))).toBe("pausa");
  });

  it("aria-label: «Nombre, Empresa: trabajando en BET-432; además te necesita en BET-440»", () => {
    const a = vistaDe(agente({ base: "trabajando", run: run("BET-432"), teNecesita: [espera("BET-440")] }), "Betalandia");
    expect(etiqueta(a)).toBe("Ingeniero Backend Java / REST, Betalandia: trabajando en BET-432; además te necesita en BET-440");
    const cola = vistaDe(agente({ base: "trabajando", run: run("BET-432", true) }), "Betalandia");
    expect(etiqueta(cola)).toBe("Ingeniero Backend Java / REST, Betalandia: trabajando (en cola) en BET-432");
    expect(etiqueta(vistaDe(agente({ teNecesita: [espera("BET-1"), espera("BET-2")] }), "Betalandia"))).toBe("Ingeniero Backend Java / REST, Betalandia: te necesita en BET-1, BET-2");
  });

  it("con el nombre completo de cada tarea, sin cortar (JST-138 §4): lo que te pide, o si no el nombre de la tarea", () => {
    const a = vistaDe(
      agente({
        base: "trabajando",
        run: { ...run("BET-432"), titulo: "Backend — enlace de descarga y ExportCsv con el rol de la cuenta" },
        teNecesita: [{ ...espera("BET-410"), titulo: "Revisar la migración de la tabla de sesiones", tituloTarea: "Migración de sesiones" }],
      }),
      "Betalandia",
    );
    expect(etiqueta(a)).toBe(
      "Ingeniero Backend Java / REST, Betalandia: trabajando en BET-432 · Backend — enlace de descarga y ExportCsv con el rol de la cuenta; además te necesita en BET-410 · Revisar la migración de la tabla de sesiones",
    );
    const soloTarea = vistaDe(agente({ teNecesita: [{ ...espera("ELM-6"), tituloTarea: "Plan de pruebas de noviembre" }] }), "El Mirador");
    expect(etiqueta(soloTarea)).toBe("Ingeniero Backend Java / REST, El Mirador: te necesita en ELM-6 · Plan de pruebas de noviembre");
  });

  it("contadores independientes: «te necesitan» suma a los que además trabajan o tienen error", () => {
    const lista = [
      vistaDe(agente({ id: "1", base: "trabajando", teNecesita: [espera("A")] }), "B"),
      vistaDe(agente({ id: "2", base: "error", teNecesita: [espera("B")] }), "B"),
      vistaDe(agente({ id: "3", teNecesita: [espera("C")] }), "B"),
      vistaDe(agente({ id: "4", base: "pausa" }), "B"),
      vistaDe(agente({ id: "5" }), "B"),
    ];
    expect(contarVista(lista)).toEqual({ trabaja: 1, toca: 3, error: 1, pausa: 1, libre: 1, erroresViejos: 0 });
  });
});

describe("tiempos", () => {
  const ahora = Date.parse("2026-10-20T18:00:00");
  it("hace X", () => {
    expect(hace("2026-10-20T17:59:50", ahora)).toBe("recién");
    expect(hace("2026-10-20T17:45:00", ahora)).toBe("hace 15 min");
    expect(hace("2026-10-20T15:00:00", ahora)).toBe("hace 3 h");
    expect(hace("2026-10-17T18:00:00", ahora)).toBe("hace 3 días");
  });
  it("en pausa: desde la hora, ayer o la fecha", () => {
    expect(desdeCuando("2026-10-20T09:05:00", ahora)).toMatch(/^desde las 0?9:05/);
    expect(desdeCuando("2026-10-19T22:00:00", ahora)).toBe("desde ayer");
    expect(desdeCuando("2026-10-15T10:00:00", ahora)).toMatch(/^desde el 15 oct/);
  });
});

describe("aspecto de cada agente (design-spec §4)", () => {
  const filas = new Set(PERSONAJES.filas.map((f) => f.id));

  afterEach(() => ponerInstancia(INSTANCIA_VACIA));

  it("el aspecto fijo de la instancia (por ID) existe en la hoja y gana a la regla; sin datos, manda la regla", () => {
    const x = { id: "agente-1", nombre: "X", cargo: null, rolApi: null, adapterType: "claude_local" };
    const regla = aspectoDe(x);
    ponerInstancia(leerDatosInstancia({ aspectoFijo: { "agente-1": "direccion-2", "agente-2": "hermes-1" } }));
    expect(filas.has("direccion-2")).toBe(true);
    expect(aspectoDe(x)).toBe("direccion-2");
    expect(aspectoDe({ ...x, id: "agente-2", nombre: "Chief of staff", rolApi: "ceo" })).toBe("hermes-1");
    expect(aspectoDe({ ...x, id: "agente-3" })).toMatch(/^ingenieria-[1-5]$/); // sin aspecto fijo: la regla
    ponerInstancia(INSTANCIA_VACIA);
    expect(aspectoDe(x)).toBe(regla);
  });

  it("un aspecto fijo que no existe en la hoja se ignora y manda la regla", () => {
    const x = { id: "agente-1", nombre: "X", cargo: null, rolApi: null, adapterType: "claude_local" };
    const regla = aspectoDe(x);
    for (const malo of ["", "inventado-1", "direccion-9", "direccion-0", "direccion", "constructor-1", "__proto__-1", "direccion-1x"]) {
      ponerInstancia(leerDatosInstancia({ aspectoFijo: { "agente-1": malo } }));
      expect(aspectoDe(x), malo).toBe(regla);
    }
    ponerInstancia(leerDatosInstancia({ aspectoFijo: {} }));
    expect(aspectoDe({ ...x, id: "constructor" })).toMatch(/^ingenieria-[1-5]$/); // un id que es una clave heredada no encuentra nada
  });

  it("regla para un agente nuevo: Hermes, luego nombre o cargo, luego rol, luego ingeniería", () => {
    const base = { id: "nuevo", nombre: "X", cargo: null, rolApi: null, adapterType: "claude_local" };
    expect(rolDeSprite({ ...base, adapterType: "hermes_gateway", nombre: "Revisor" })).toBe("hermes");
    expect(rolDeSprite({ ...base, nombre: "RevisorCodigo", rolApi: "qa" })).toBe("revisor");
    expect(rolDeSprite({ ...base, nombre: "Qa" })).toBe("qa");
    expect(rolDeSprite({ ...base, cargo: "Diseñador de producto" })).toBe("diseno");
    expect(rolDeSprite({ ...base, nombre: "CMO" })).toBe("marketing");
    expect(rolDeSprite({ ...base, rolApi: "ceo" })).toBe("direccion");
    expect(rolDeSprite({ ...base, rolApi: "pm" })).toBe("ingenieria");
    expect(aspectoDe({ ...base, nombre: "Chief of staff", rolApi: "ceo" })).toBe("direccion-3");
  });

  it("la variante es estable y siempre existe en la hoja", () => {
    for (const id of ["a", "b", "c", "d", "e", "f"]) {
      const aspecto = aspectoDe({ id, nombre: "Ingeniero", cargo: null, rolApi: "engineer", adapterType: "claude_local" });
      expect(filas.has(aspecto), aspecto).toBe(true);
      expect(aspectoDe({ id, nombre: "Ingeniero", cargo: null, rolApi: "engineer", adapterType: "claude_local" })).toBe(aspecto);
    }
  });
});
