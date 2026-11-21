// JST-415: las mascotas reaccionan a lo que pasa cerca (con su tope por nivel) y el nivel escala los intervalos de las
// conversaciones y de las frases sueltas, sin tocar los topes (cuántas a la vez, pausa por sala).
import { describe, expect, it } from "vitest";
import { BUSCA_MS, MAX_CHARLAS, REACCIONES, SUELTA_MS } from "../src/charlas.js";
import { escalarIntervalo, intervaloReaccionMascotaMs, type Nivel } from "../src/nivel.js";
import { armarPiso, type EntradaSala } from "../src/plano.js";
import { Vida, type AgenteVida, type HechoVoz, type OpcionesVida, type VozVida } from "../src/vida.js";
import type { Dibujo } from "../src/vista.js";

const HOY: EntradaSala[] = [{ prefijo: "BET", agentes: 9 }, { prefijo: "ELM", agentes: 4 }, { prefijo: "JST", agentes: 5 }, { prefijo: "MIG", agentes: 8 }];
const PISO = armarPiso(HOY, 576, "computador");
const TODAS: ReadonlySet<string> = new Set(HOY.map((s) => s.prefijo));
const OP: OpcionesVida = { rm: false, charlas: true, mascotas: true, cargando: false, oculta: false };
/** Un jueves a mediodía de mentira: el reloj de verdad de la vida (el que mira cuánto lleva esperando alguien). */
const RELOJ0 = new Date(2026, 9, 22, 12, 0).getTime();

function semilla(n = 7): () => number {
  let s = n;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

class VozFalsa implements VozVida {
  hechos: HechoVoz[] = [];
  leer = { charlas: true, entregas: true, mascotas: true, sueltas: true };
  lee(t: "charlas" | "entregas" | "mascotas" | "sueltas") {
    return this.leer[t];
  }
  reclamar?: (clave: string) => boolean;
  libreParaCharla() {
    return true;
  }
  hecho(h: HechoVoz) {
    this.hechos.push(h);
  }
}

function banco(nivel: Nivel, cambios: Record<string, Dibujo> = {}, extra: Partial<AgenteVida> = {}) {
  const reloj = { t: 1_000 };
  const vida = new Vida({ ahora: () => reloj.t, reloj: () => RELOJ0 + reloj.t, azar: semilla() });
  const voz = new VozFalsa();
  const estado = (): AgenteVida[] =>
    HOY.flatMap((s) =>
      Array.from({ length: s.agentes }, (_, i) => {
        const id = `${s.prefijo}-${i}`;
        const st = cambios[id] ?? "libre";
        return { id, companyId: `c-${s.prefijo}`, prefijo: s.prefijo, st, need: st === "toca", codigo: null, nombre: id, empresa: s.prefijo, ...(id === "JST-0" ? extra : {}) };
      }),
    );
  const sync = (o: Partial<OpcionesVida> = {}) => vida.sincronizar(PISO, estado(), TODAS, { ...OP, nivel, ...o });
  sync();
  vida.fijarVoz(voz);
  const avanzar = (ms: number) => {
    for (let k = 0; k < ms; k += 16) {
      reloj.t += 16;
      vida.paso(reloj.t);
    }
  };
  /** Lo que dice la mascota que habla ahora (`dice` es el texto del globo), o `null`. */
  const dice = (): string | null => vida.mascotas().find((m) => m.dice)?.dice ?? null;
  return { vida, voz, reloj, sync, avanzar, dice };
}

describe("el nivel escala los intervalos sin tocar los topes (JST-415)", () => {
  it("tranquilo, el doble de largo; normal, igual; conversador, la mitad; el rango no se invierte", () => {
    expect(escalarIntervalo(BUSCA_MS, "tranquilo")).toEqual([30_000, 60_000]);
    expect(escalarIntervalo(BUSCA_MS, "normal")).toEqual([15_000, 30_000]);
    expect(escalarIntervalo(BUSCA_MS, "conversador")).toEqual([7_500, 15_000]);
    expect(escalarIntervalo(SUELTA_MS, "conversador")).toEqual([22_500, 45_000]);
    for (const n of ["tranquilo", "normal", "conversador"] as const) {
      const [a, b] = escalarIntervalo(SUELTA_MS, n);
      expect(a).toBeLessThanOrEqual(b);
    }
  });

  it("las mascotas: ninguna en tranquilo, una cada 2 min en normal y una por minuto en conversador", () => {
    expect(intervaloReaccionMascotaMs("tranquilo")).toBeNull();
    expect(intervaloReaccionMascotaMs("normal")).toBe(120_000);
    expect(intervaloReaccionMascotaMs("conversador")).toBe(60_000);
  });

  it("con más gente conversando que el tope, el tope no cambia por el nivel", () => {
    for (const nivel of ["tranquilo", "normal", "conversador"] as const) {
      const { vida, avanzar } = banco(nivel);
      let maximo = 0;
      for (let k = 0; k < 120; k++) {
        avanzar(1_000);
        maximo = Math.max(maximo, (vida as unknown as { charlas: unknown[] }).charlas.length);
      }
      expect(maximo, nivel).toBeLessThanOrEqual(MAX_CHARLAS);
    }
  });

  it("en conversador se juntan más conversaciones que en tranquilo, en el mismo rato", () => {
    const cuenta = (nivel: Nivel) => {
      const { vida, avanzar } = banco(nivel);
      const vistas = new Set<number>();
      for (let k = 0; k < 600; k++) {
        avanzar(1_000);
        for (const c of (vida as unknown as { charlas: Array<{ id: number }> }).charlas) vistas.add(c.id);
      }
      return vistas.size;
    };
    expect(cuenta("conversador")).toBeGreaterThan(cuenta("tranquilo"));
  });
});

describe("las mascotas reaccionan a lo que pasa cerca (JST-415)", () => {
  it("el perro celebra cuando una TAREA termina, no con cualquier run exitoso; el robot avisa del error", () => {
    const a = banco("conversador", { "JST-0": "trabaja" });
    a.vida.tareaTerminada();
    expect(REACCIONES.perro).toContain(a.dice()!);
    expect(a.vida.mascotas().find((m) => m.dice)!.id).toBe("perro");
    // Un run exitoso sin tarea terminada (un latido) no hace celebrar, ni en el momento ni con los minutos.
    const latido = banco("conversador", { "JST-0": "trabaja" });
    for (let k = 0; k < 30; k++) {
      latido.vida.terminoRun("JST-0", null, "succeeded");
      latido.avanzar(10_000);
    }
    expect(latido.dice()).toBeNull();
    expect(latido.voz.hechos.filter((h) => h.tipo === "mascota")).toEqual([]);
    // Un evento de tarea terminada viejo (llegó tarde) tampoco celebra.
    const viejo = banco("conversador", { "JST-0": "trabaja" });
    viejo.vida.tareaTerminada(RELOJ0 - 60 * 60_000);
    expect(viejo.dice()).toBeNull();
    const b = banco("conversador", { "JST-0": "trabaja" });
    b.vida.terminoRun("JST-0", null, "failed");
    expect(REACCIONES.robot).toContain(b.dice()!);
    expect(b.vida.mascotas().find((m) => m.dice)!.id).toBe("robot");
  });

  it("el gato nota a quien ve cruzar los 30 min esperando, una vez por espera; con menos, o con una que ya era vieja, no dice nada", () => {
    const desde = (min: number) => new Date(RELOJ0 + 1_000 - min * 60_000).toISOString();
    const poco = banco("conversador", { "JST-0": "toca" }, { esperaDesde: desde(10), esperaTipo: "tarjeta" });
    poco.sync();
    expect(poco.dice()).toBeNull();
    // La vio con 10 min y pasan 21: cruzó los 30 con la página abierta.
    poco.avanzar(21 * 60_000);
    poco.sync();
    expect(REACCIONES.gato).toContain(poco.dice()!);
    expect(poco.vida.mascotas().find((m) => m.dice)!.id).toBe("gato");
    // Pasado el globo y el minuto, la misma espera no se vuelve a comentar.
    poco.avanzar(70_000);
    poco.sync();
    expect(poco.dice()).toBeNull();
    poco.avanzar(5 * 60_000);
    poco.sync();
    expect(poco.dice()).toBeNull();
  });

  it("una espera que ya tenía horas (o semanas) al cargar la página no hace reaccionar al gato", () => {
    const desde = (min: number) => new Date(RELOJ0 + 1_000 - min * 60_000).toISOString();
    for (const min of [45, 5 * 60, 20 * 24 * 60]) {
      const vieja = banco("conversador", { "JST-0": "toca" }, { esperaDesde: desde(min), esperaTipo: "tarjeta" });
      vieja.sync();
      expect(vieja.dice(), `${min} min`).toBeNull();
      vieja.avanzar(3 * 60_000);
      vieja.sync();
      expect(vieja.dice(), `${min} min, 3 min después`).toBeNull();
    }
  });

  it("el estado «espera» de las frases sueltas cuenta solo esperas de entre 30 min y 24 horas", () => {
    const desde = (min: number) => new Date(RELOJ0 + 1_000 - min * 60_000).toISOString();
    const estados = (min: number) => {
      const b = banco("conversador", { "JST-0": "toca" }, { esperaDesde: desde(min), esperaTipo: "tarjeta" });
      b.sync();
      const persona = (b.vida as unknown as { personas: Map<string, unknown> }).personas.get("BET-0");
      return [...(b.vida as unknown as { estadosSuelta(p: unknown, t: null): ReadonlySet<string> }).estadosSuelta(persona, null)];
    };
    expect(estados(10)).not.toContain("espera");
    expect(estados(45)).toContain("espera");
    expect(estados(23 * 60)).toContain("espera");
    expect(estados(25 * 60)).not.toContain("espera");
    expect(estados(30 * 24 * 60)).not.toContain("espera");
  });

  it("el conejo ve la entrega", () => {
    const { vida, dice } = banco("conversador", { "JST-0": "libre", "JST-1": "libre" });
    expect(vida.entrega("JST-0", "JST-1", "JST-12")).toBe(true);
    expect(REACCIONES.conejo).toContain(dice()!);
  });

  it("máximo 1 cada 2 minutos en normal; 1 por minuto en conversador; ninguna en tranquilo", () => {
    const contar = (nivel: Nivel, minutos: number) => {
      const { vida, avanzar, voz } = banco(nivel, { "JST-0": "trabaja" });
      for (let k = 0; k < minutos * 6; k++) {
        vida.tareaTerminada();
        avanzar(10_000);
      }
      return voz.hechos.filter((h) => h.tipo === "mascota").length;
    };
    expect(contar("tranquilo", 10)).toBe(0);
    const normal = contar("normal", 10);
    const conv = contar("conversador", 10);
    expect(normal).toBeGreaterThanOrEqual(4);
    expect(normal).toBeLessThanOrEqual(5);
    expect(conv).toBeGreaterThanOrEqual(9);
    expect(conv).toBeLessThanOrEqual(10);
  });

  it("no reaccionan con la oficina oculta, cargando o sin mascotas; y nunca encima de otra mascota que habla", () => {
    for (const op of [{ oculta: true }, { cargando: true }, { mascotas: false }] as const) {
      const b = banco("conversador", { "JST-0": "trabaja" });
      b.sync(op);
      b.vida.tareaTerminada();
      expect(b.dice(), JSON.stringify(op)).toBeNull();
    }
    const b = banco("conversador", { "JST-0": "trabaja" });
    b.vida.tocarMascota("gato");
    b.vida.tareaTerminada();
    expect(b.vida.mascotas().filter((m) => m.dice).map((m) => m.id)).toEqual(["gato"]);
  });

  it("la voz de una reacción pasa por el reclamo de pestaña: una clave por reacción y minuto; el globo sale igual", () => {
    const reclamos: string[] = [];
    let otraPestana = true;
    const b = banco("conversador", { "JST-0": "trabaja" });
    b.voz.reclamar = (clave: string) => {
      reclamos.push(clave);
      return !otraPestana;
    };
    b.vida.tareaTerminada();
    expect(reclamos).toHaveLength(1);
    expect(reclamos[0]).toMatch(/^voz:reaccion:termina:\d+$/);
    // Otra pestaña ya lo reclamó: el globo se ve, la voz no suena.
    expect(b.dice()).not.toBeNull();
    expect(b.voz.hechos).toEqual([]);
    // Con el reclamo a favor, suena.
    otraPestana = false;
    b.avanzar(70_000);
    b.vida.tareaTerminada();
    expect(b.voz.hechos.filter((h) => h.tipo === "mascota")).toHaveLength(1);
    expect(new Set(reclamos).size).toBe(2);
  });

  it("la voz solo suena si «Mascotas» está prendido en Voces; el globo sale igual", () => {
    const con = banco("conversador", { "JST-0": "trabaja" });
    con.vida.tareaTerminada();
    expect(con.voz.hechos).toEqual([{ tipo: "mascota", id: "perro", texto: expect.any(String), sola: true }]);
    const sin = banco("conversador", { "JST-0": "trabaja" });
    sin.voz.leer.mascotas = false;
    sin.vida.tareaTerminada();
    expect(sin.voz.hechos).toEqual([]);
    expect(sin.dice()).not.toBeNull();
  });
});
