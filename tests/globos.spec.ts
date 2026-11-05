// El globo de dos pisos (0.5.0, design-spec de JST-163 §8 y §9): arriba lo que hace; abajo la mano o la hora.
import { describe, expect, it } from "vitest";
import { textoRun, type Espera, type RunActual } from "../src/estado.js";
import type { Estimacion } from "../src/hora.js";
import { etiqueta, pisoDeAbajo, type AgenteVista } from "../src/vista.js";

const MIN = 60_000;
const AHORA = new Date(2026, 9, 22, 14, 42).getTime();
const HORA: Estimacion = { tipo: "hora", fin: new Date(2026, 9, 22, 15, 5).getTime(), n: 30 };
const LLEVA: Estimacion = { tipo: "lleva", edad: 125 * MIN, n: 30, menos: 26 };

const espera = (identifier: string): Espera => ({ tipo: "tarjeta", itemId: identifier, sujetoId: null, clase: null, issueId: null, identifier, titulo: "Confirmar", tituloTarea: null, href: null, desde: null });
const run = (extra: Partial<RunActual> = {}): RunActual => ({ id: "r1", issueId: "i1", identifier: "BET-432", titulo: "Backend — reset token", enCola: false, desde: null, href: "", tareaHref: null, tareaStatus: null, ...extra });
const ag = (st: AgenteVista["st"], esperas: Espera[] = [], r: RunActual | null = st === "trabaja" ? run() : null): Pick<AgenteVista, "st" | "need" | "teNecesita" | "run"> => ({ st, need: esperas.length > 0, teNecesita: esperas, run: r });

describe("el piso de abajo del globo: la mano gana a la hora y nada se da vuelta solo", () => {
  it("trabaja y no te espera: la hora estimada («≈15:05» o «lleva 2 h»); sin dato o en cola, un solo piso", () => {
    expect(pisoDeAbajo(ag("trabaja"), HORA, AHORA)).toEqual({ tipo: "hora", texto: "≈15:05", lleva: false });
    expect(pisoDeAbajo(ag("trabaja"), LLEVA, AHORA)).toEqual({ tipo: "hora", texto: "lleva 2 h", lleva: true });
    expect(pisoDeAbajo(ag("trabaja"), { tipo: "sin", n: 2 }, AHORA)).toBeNull();
    expect(pisoDeAbajo(ag("trabaja"), null, AHORA)).toBeNull();
    expect(pisoDeAbajo(ag("trabaja", [], run({ enCola: true })), HORA, AHORA)).toBeNull();
  });

  it("trabaja y te espera: la mano con el código de su primera espera y «+N»; la hora no se ve en el globo", () => {
    expect(pisoDeAbajo(ag("trabaja", [espera("BET-410"), espera("BET-411"), espera("BET-412")]), HORA, AHORA)).toEqual({ tipo: "mano", codigo: "BET-410", mas: 2 });
    expect(pisoDeAbajo(ag("trabaja", [espera("BET-410")]), LLEVA, AHORA)).toEqual({ tipo: "mano", codigo: "BET-410", mas: 0 });
  });

  it("error y te espera: abajo la mano; error solo, en pausa, libre o «te necesita» sin trabajar: un piso", () => {
    expect(pisoDeAbajo(ag("error", [espera("MIG-18")]), null, AHORA)).toEqual({ tipo: "mano", codigo: "MIG-18", mas: 0 });
    expect(pisoDeAbajo(ag("error"), HORA, AHORA)).toBeNull();
    expect(pisoDeAbajo(ag("pausa", [espera("MIG-19")]), null, AHORA)).toBeNull();
    expect(pisoDeAbajo(ag("toca", [espera("MIG-19")]), null, AHORA)).toBeNull();
    expect(pisoDeAbajo(ag("libre"), HORA, AHORA)).toBeNull();
  });

  it("no cambia con el tiempo (la vuelta cada 3 s era de la propuesta B): con lo mismo, cualquier instante da el mismo piso", () => {
    const a = ag("trabaja", [espera("BET-410")]);
    const vistos = new Set<string>();
    // Cada 250 ms durante 12 s (4 vueltas de B): siempre la mano.
    for (let t = 0; t <= 12_000; t += 250) vistos.add(JSON.stringify(pisoDeAbajo(a, HORA, AHORA + t)));
    expect([...vistos]).toEqual([JSON.stringify({ tipo: "mano", codigo: "BET-410", mas: 0 })]);
    const b = ag("trabaja");
    const horas = new Set<string>();
    for (let t = 0; t <= 12_000; t += 250) horas.add(pisoDeAbajo(b, HORA, AHORA + t)!.tipo);
    expect([...horas]).toEqual(["hora"]);
  });
});

describe("la frase del tooltip con la hora y el «✓ listo»", () => {
  const vista = (extra: Partial<AgenteVista>): AgenteVista =>
    ({ id: "a1", nombre: "QA", empresa: "Betalandia", st: "trabaja", need: false, teNecesita: [], run: run(), ...extra }) as AgenteVista;

  it("quien trabaja dice cuándo termina, antes de lo que te pide", () => {
    expect(etiqueta(vista({}), { hora: "termina ≈15:05, según sus últimos runs" })).toBe("QA, Betalandia: trabajando en BET-432 · Backend — reset token; termina ≈15:05, según sus últimos runs");
    expect(etiqueta(vista({ need: true, teNecesita: [espera("BET-410")] }), { hora: "lleva 2 h: más de lo habitual, no hay una hora confiable" })).toBe(
      "QA, Betalandia: trabajando en BET-432 · Backend — reset token; lleva 2 h: más de lo habitual, no hay una hora confiable; además te necesita en BET-410 · Confirmar",
    );
    // En cola no: todavía no empieza.
    expect(etiqueta(vista({ run: run({ enCola: true }) }), { hora: "termina ≈15:05, según sus últimos runs" })).toBe("QA, Betalandia: trabajando (en cola) en BET-432 · Backend — reset token");
  });

  it("«✓ listo»: terminó y ahora va al descanso", () => {
    expect(etiqueta(vista({ st: "libre", run: null }), { listo: { codigo: "BET-414", titulo: "QA — login en el celular" } })).toBe("QA, Betalandia: terminó BET-414 · QA — login en el celular; ahora va al descanso");
  });

  it.each([
    ["timer", "Latido", "trabajando (latido)"],
    ["on_demand", "A pedido", "trabajando (a pedido)"],
    ["issue_assigned", "Sin tarea", "trabajando (sin tarea)"],
  ])("sin tarea, el globo y la accesibilidad dicen qué hace el run %s", (invocationSource, texto, accesible) => {
    const actual = run({ issueId: null, identifier: null, titulo: null, invocationSource });
    expect(textoRun(actual)).toBe(texto);
    expect(etiqueta(vista({ run: actual }))).toBe(`QA, Betalandia: ${accesible}`);
  });
});
