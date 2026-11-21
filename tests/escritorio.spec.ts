import { describe, expect, it } from "vitest";
import { dondeEspera, esperanEn, etiquetaEscritorio, filaDeSalas, haceFila, MAX_FILA, type AgenteFila } from "../src/escritorio.js";
import { ANCHO_TV, ANCHO_WIDGET, anchoCelular, armarPiso, armarPisoComputador, armarPisoTv, armarSalaAcercada, DESCANSO_ESCRITORIO, type EntradaSala } from "../src/plano.js";
import { piesAsiento, rejillaDe, libre, ruta, salidaPuesto } from "../src/caminos.js";

const ag = (id: string, prefijo: string, st: AgenteFila["st"], need: boolean, minutosEsperando: number | null = null): AgenteFila => ({
  id,
  prefijo,
  st,
  need,
  esperaDesde: minutosEsperando === null ? null : new Date(Date.UTC(2026, 9, 22, 18, 0) - minutosEsperando * 60_000).toISOString(),
});

describe("la fila de tu escritorio (JST-163 §14): quién entra", () => {
  it("solo quien te espera sin trabajar (estado «te necesita»); quien trabaja, tiene error o está en pausa y te espera, no", () => {
    expect(haceFila({ st: "toca", need: true })).toBe(true);
    expect(haceFila({ st: "trabaja", need: true })).toBe(false);
    expect(haceFila({ st: "error", need: true })).toBe(false);
    expect(haceFila({ st: "pausa", need: true })).toBe(false);
    expect(haceFila({ st: "libre", need: false })).toBe(false);
    const fila = filaDeSalas([ag("t", "BET", "trabaja", true, 90), ag("e", "BET", "error", true, 80), ag("p", "BET", "pausa", true, 70), ag("l", "BET", "libre", false), ag("x", "BET", "toca", true, 5)], () => 3);
    expect([...fila]).toEqual([["x", 0]]);
  });

  it("una tarea bloqueada no levanta la mano (JST-135), así que tampoco hace fila: sin espera no hay «te necesita»", () => {
    // Un bloqueado que no te pide nada está libre (o trabajando) y sin `need`.
    expect(filaDeSalas([ag("b", "BET", "libre", false)], () => 3).size).toBe(0);
  });

  it("orden: el que espera hace más, adelante; el id desempata; sin fecha, al final", () => {
    const fila = filaDeSalas([ag("c", "MIG", "toca", true, 5), ag("a", "MIG", "toca", true, 60), ag("b", "MIG", "toca", true, 30), ag("z", "MIG", "toca", true, null)], () => 4);
    expect(fila.get("a")).toBe(0);
    expect(fila.get("b")).toBe(1);
    expect(fila.get("c")).toBe(2);
    // Caben 3 aunque la sala tenga más lugares.
    expect(fila.has("z")).toBe(false);
    const empate = filaDeSalas([ag("b2", "MIG", "toca", true, 10), ag("a2", "MIG", "toca", true, 10)], () => 3);
    expect([...empate]).toEqual([["a2", 0], ["b2", 1]]);
  });

  it("tope de 3 por sala (o los lugares que tenga): los que sobran esperan en su puesto; cada sala tiene la suya", () => {
    const lista = [
      ...["b1", "b2", "b3", "b4", "b5"].map((id, i) => ag(id, "BET", "toca", true, 50 - i)),
      ag("j1", "JST", "toca", true, 10),
      ag("j2", "JST", "toca", true, 20),
      ag("e1", "ELM", "toca", true, 99),
    ];
    const lugares: Record<string, number> = { BET: 3, JST: 2, ELM: 0 };
    const fila = filaDeSalas(lista, (p) => lugares[p] ?? 0);
    expect(MAX_FILA).toBe(3);
    expect(["b1", "b2", "b3"].map((id) => fila.get(id))).toEqual([0, 1, 2]);
    expect(fila.has("b4")).toBe(false);
    expect(fila.has("b5")).toBe(false);
    expect(fila.get("j2")).toBe(0);
    expect(fila.get("j1")).toBe(1);
    // Sin escritorio (el celular, un descanso angosto, una sala a oscuras): no hay fila.
    expect(fila.has("e1")).toBe(false);
    expect(filaDeSalas(lista, () => 9).get("b3")).toBe(2);
  });

  it("quien está entregando una tarea no va a la fila; el siguiente toma su lugar", () => {
    const lista = [ag("a", "BET", "toca", true, 30), ag("b", "BET", "toca", true, 20)];
    expect([...filaDeSalas(lista, () => 3, new Set(["a"]))]).toEqual([["b", 0]]);
  });

  it("tu globo cuenta a todos los de la sala que te esperan, estén en la fila o no", () => {
    const lista = [ag("a", "BET", "toca", true, 30), ag("b", "BET", "trabaja", true, 20), ag("c", "BET", "libre", false), ag("d", "MIG", "toca", true, 1)];
    expect(esperanEn(lista, "BET")).toBe(2);
    expect(esperanEn(lista, "MIG")).toBe(1);
    expect(esperanEn(lista, "ELM")).toBe(0);
  });

  it("la ventanita: dónde espera cada uno, y la etiqueta de tu escritorio", () => {
    expect(dondeEspera({ st: "toca" }, 0)).toEqual({ texto: "1.º en la fila", codigo: null, fila: true });
    expect(dondeEspera({ st: "toca" }, 2).texto).toBe("3.º en la fila");
    expect(dondeEspera({ st: "trabaja", codigo: "BET-432" }, undefined)).toEqual({ texto: "sigue trabajando en", codigo: "BET-432", fila: false });
    expect(dondeEspera({ st: "toca" }, undefined).texto).toBe("en su puesto");
    expect(dondeEspera({ st: "error" }, undefined).texto).toBe("con error");
    expect(dondeEspera({ st: "pausa" }, undefined).texto).toBe("en pausa");
    expect(etiquetaEscritorio(3, "Betalandia")).toBe("Tu escritorio: 3 te esperan en Betalandia. Clic para ver la lista y responder.");
    expect(etiquetaEscritorio(1, "Migo")).toBe("Tu escritorio: 1 te espera en Migo. Clic para ver la lista y responder.");
    expect(etiquetaEscritorio(0, "JSTM")).toBe("Tu escritorio en JSTM: nadie te espera.");
  });
});

const HOY: EntradaSala[] = [
  { prefijo: "BET", agentes: 9 },
  { prefijo: "ELM", agentes: 4 },
  { prefijo: "JST", agentes: 5 },
  { prefijo: "MIG", agentes: 8 },
];

describe("tu escritorio en el plano (JST-163 §14)", () => {
  it("va arriba a la izquierda del descanso de cada sala en la página, el TV y el widget del computador", () => {
    for (const piso of [armarPisoComputador(HOY, 1440, 900), armarPisoTv(HOY), armarPiso(HOY, ANCHO_WIDGET, "widget")]) {
      for (const s of piso.salas) {
        expect(s.descanso.w).toBeGreaterThanOrEqual(DESCANSO_ESCRITORIO);
        expect(s.escritorio, `${piso.escena} ${s.prefijo}`).toEqual({ x: s.descanso.x + 2, y: s.descanso.y });
        expect(s.fila.length).toBeGreaterThanOrEqual(2);
        expect(s.fila.length).toBeLessThanOrEqual(3);
        // El primero, de espaldas mirando tu escritorio: sus pies 62 bajo la esquina; cada uno 13 más atrás; dentro de la sala.
        s.fila.forEach((p, k) => expect(p).toEqual({ x: s.descanso.x + 18, y: s.descanso.y + 62 + 13 * k }));
        expect(s.fila.at(-1)!.y).toBeLessThanOrEqual(s.h - 6);
      }
    }
  });

  it("en el celular (piso y sala acercada) y con un descanso de menos de 70 no hay escritorio ni fila", () => {
    for (const piso of [armarPiso(HOY, anchoCelular(390), "celular"), armarPiso(HOY, 340, "widget-celular"), ...HOY.map((s) => armarSalaAcercada(s, 366))]) {
      for (const s of piso.salas) {
        expect(s.escritorio).toBeNull();
        expect(s.fila).toEqual([]);
      }
    }
    // Página de 1440 × 900 (piso de 576): el descanso de JSTM mide 76 y no lleva (con el escritorio, la alfombra y el
    // sofá se saldrían de la sala); el de Migo, 106, sí. Con un descanso de 90 ya cabe.
    const angosta = armarPiso(HOY, 576, "computador");
    const jst = angosta.salas.find((s) => s.prefijo === "JST")!;
    expect(jst.descanso.w).toBe(76);
    expect(jst.escritorio).toBeNull();
    expect(angosta.salas.find((s) => s.prefijo === "MIG")!.escritorio).not.toBeNull();
    expect(DESCANSO_ESCRITORIO).toBe(90);
  });

  it("el sofá y la alfombra empiezan al menos 30 a la derecha de donde empieza el descanso, sin salirse de él, y la planta de la izquierda se va", () => {
    for (const piso of [armarPisoTv(HOY), armarPiso(HOY, 600, "computador"), armarPiso(HOY, 480, "widget")]) {
      for (const s of piso.salas) {
        if (!s.escritorio) continue;
        const alfombra = s.muebles.find((m) => m.nombre === "alfombra-sala")!;
        expect(alfombra.x).toBeGreaterThanOrEqual(s.descanso.x + 30);
        expect(alfombra.x + 60).toBeLessThanOrEqual(s.descanso.x + s.descanso.w);
        expect(s.muebles.some((m) => m.nombre === "planta" && m.x === s.descanso.x + 1)).toBe(false);
      }
    }
  });

  it("ningún asiento del descanso cae en tu escritorio ni en tu fila, y desde cada lugar de la fila se llega a cada escritorio", () => {
    // JST-410: también con las salas bajas (2 filas de escritorios) de una ventana ancha y baja, donde el puff no va.
    const computador = [armarPisoComputador(HOY, 1440, 900), armarPisoComputador(HOY, 1900, 800), armarPisoComputador(HOY, 2700, 1200, [], 2), armarPisoComputador(HOY, 3400, 500)];
    expect(computador.at(-1)!.salas.every((s) => s.h === 130 && !s.muebles.some((m) => m.nombre === "puff"))).toBe(true);
    for (const piso of [...computador, armarPisoTv(HOY), armarPiso(HOY, ANCHO_TV, "computador")]) {
      for (const s of piso.salas) {
        const u = s.escritorio!;
        for (const a of s.asientos) {
          const pie = piesAsiento(a);
          const enFila = pie.x > u.x + 2 && pie.x < u.x + 30 && pie.y > u.y + 13 && pie.y < s.fila.at(-1)!.y + 14;
          expect(enFila, `${piso.escena} ${s.prefijo} asiento ${a.x},${a.y}`).toBe(false);
        }
        const r = rejillaDe(s);
        for (const p of s.fila) expect(libre(r, p), `${s.prefijo} fila ${p.x},${p.y}`).toBe(true);
        for (const puesto of s.puestos) expect(ruta(r, salidaPuesto(puesto), s.fila.at(-1)!, {}), `${s.prefijo} → fila`).not.toBeNull();
        // Tu escritorio choca como el de un agente.
        expect(libre(r, { x: u.x + 14, y: u.y + 20 })).toBe(false);
      }
    }
  });

  it("la mesa del descanso es la mesita, delante del sofá", () => {
    for (const s of armarPisoTv(HOY).salas) {
      const mesita = s.muebles.find((m) => m.nombre === "mesita")!;
      expect(s.mesa).toEqual({ x: mesita.x, y: mesita.y, w: 18, h: 10 });
    }
  });
});
