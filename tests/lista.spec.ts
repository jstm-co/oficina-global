import { describe, expect, it } from "vitest";
import type { AgenteOficina, Espera, RunActual } from "../src/estado.js";
import { abiertoPorOmision, abreVentana, agrupar, alternarPlegado, chipsDe, comparar, cuandoFila, DIAS_SIN_USO, escribirPlegados, estaAbierto, grupoDe, leerPlegados, lineaDe, marcaSinUso, notaGrupo, PLEGADOS_CELULAR } from "../src/lista.js";
import { vistaDe, type AgenteVista } from "../src/vista.js";

const AHORA = Date.parse("2026-10-21T15:00:00Z");
const min = (m: number) => new Date(AHORA - m * 60_000).toISOString();

function agente(id: string, extra: Partial<AgenteOficina> = {}, empresa = "Betalandia"): AgenteVista {
  const base: AgenteOficina = {
    id,
    companyId: "c1",
    prefijo: "BET",
    nombre: id,
    rol: null,
    rolApi: "engineer",
    adapterType: "claude_local",
    esHermes: false,
    statusApi: "idle",
    base: "libre",
    run: null,
    runsExtra: 0,
    teNecesita: [],
    motivo: null,
    desde: min(10),
    ...extra,
  };
  return vistaDe(base, empresa);
}

const espera = (identifier: string, desde: string, extra: Partial<Espera> = {}): Espera => ({
  tipo: "tarjeta",
  itemId: `i-${identifier}-${desde}`,
  sujetoId: null,
  clase: "request_confirmation",
  issueId: null,
  identifier,
  titulo: `¿Seguimos con ${identifier}?`,
  tituloTarea: `Tarea ${identifier}`,
  href: null,
  desde,
  ...extra,
});

const run = (identifier: string | null, enCola = false, desde = min(3)): RunActual => ({
  id: "4f2a91c3-0000-0000-0000-000000000000",
  issueId: "t1",
  identifier,
  titulo: identifier ? `Título ${identifier}` : null,
  enCola,
  desde,
  href: "/BET/agents/a/runs/4f2a",
  tareaHref: null,
  tareaStatus: null,
});

describe("grupos de la lista (design-spec de JST-95 §3)", () => {
  it("van en orden fijo: te necesitan, con error, trabajando, en pausa, errores antiguos, libres; sin los vacíos", () => {
    const g = agrupar([
      agente("libre"),
      agente("pausa", { base: "pausa" }),
      agente("trabaja", { base: "trabajando", run: run("BET-1") }),
      agente("error", { base: "error" }),
    ], false, AHORA);
    expect(g.map((x) => x.k)).toEqual(["error", "trabaja", "pausa", "libre"]);
  });

  it("quien te espera va solo en «Te necesitan», en cualquier estado, y su sección dice «y N más arriba»", () => {
    const trabajaYEspera = agente("tb", { base: "trabajando", run: run("BET-2"), teNecesita: [espera("BET-3", min(5))] });
    const errorYEspera = agente("eb", { base: "error", teNecesita: [espera("BET-4", min(6))] });
    const g = agrupar([trabajaYEspera, errorYEspera, agente("e2", { base: "error" }), agente("t2", { base: "trabajando", run: run("BET-5") })], false, AHORA);
    expect(g.find((x) => x.k === "toca")!.agentes.map((a) => a.id)).toEqual(["eb", "tb"]);
    expect(g.find((x) => x.k === "error")!.agentes.map((a) => a.id)).toEqual(["e2"]);
    expect(g.find((x) => x.k === "error")!.arriba).toBe(1);
    expect(notaGrupo(g.find((x) => x.k === "error")!, false)).toBe("· y 1 más arriba, que además te necesita");
    expect(notaGrupo({ ...g.find((x) => x.k === "trabaja")!, arriba: 2 }, false)).toBe("· y 2 más arriba, que además te necesitan");
    // Los números de las secciones suman lo mismo que los agentes.
    expect(g.reduce((n, x) => n + x.agentes.length, 0)).toBe(4);
    expect(grupoDe(trabajaYEspera)).toBe("toca");
  });

  it("en «Te necesitan» la espera más antigua va arriba; en los demás, el más reciente; si empatan, prefijo y nombre", () => {
    const toca = agrupar([
      agente("nuevo", { teNecesita: [espera("BET-1", min(2))] }),
      agente("viejo", { teNecesita: [espera("BET-2", min(30)), espera("BET-3", min(1))] }),
    ])[0]!;
    expect(toca.agentes.map((a) => a.id)).toEqual(["viejo", "nuevo"]);
    const trabajando = agrupar([
      agente("antes", { base: "trabajando", run: run("BET-1"), desde: min(20) }),
      agente("despues", { base: "trabajando", run: run("BET-2"), desde: min(2) }),
    ])[0]!;
    expect(trabajando.agentes.map((a) => a.id)).toEqual(["despues", "antes"]);
    const mig = agente("zeta", { prefijo: "MIG", desde: min(5) }, "Migo");
    const betB = agente("b", { desde: min(5) });
    const betA = agente("a", { desde: min(5) });
    expect([mig, betB, betA].sort(comparar).map((a) => a.id)).toEqual(["a", "b", "zeta"]);
  });

  it("la pista del orden va solo en computador y con 2 o más", () => {
    const dos = agrupar([agente("x", { base: "error", desde: min(1) }), agente("y", { base: "error", desde: min(2) })], false, AHORA)[0]!;
    expect(notaGrupo(dos, false)).toBe("· el más reciente, arriba");
    expect(notaGrupo(dos, true)).toBeNull();
    const uno = agrupar([agente("x", { base: "error" })], false, AHORA)[0]!;
    expect(notaGrupo(uno, false)).toBeNull();
    // Con la hora fija: sin ella usa la de hoy, y a los 31 días de `AHORA` estos dos pasan a «sin uso hace más de 30 días».
    const libres = agrupar([agente("x"), agente("y")], false, AHORA)[0]!;
    expect(notaGrupo(libres, false)).toBeNull();
  });

  it("sin «Te toca», «Te necesitan» se muestra igual (con «?»), aunque nadie espere", () => {
    expect(agrupar([agente("x")], true).map((g) => g.k)).toEqual(["toca", "libre"]);
    expect(agrupar([agente("x")], false).map((g) => g.k)).toEqual(["libre"]);
  });

  it("en el celular vienen plegados «En pausa» y «Libres»", () => {
    expect(PLEGADOS_CELULAR).toEqual(["pausa", "libre"]);
  });
});

const dia = (d: number) => new Date(AHORA - d * 86_400_000).toISOString();

describe("errores antiguos (JST-410)", () => {
  const reciente = agente("rec", { base: "error", desde: min(30) });
  const viejo = agente("vie", { base: "error", desde: dia(12) });
  const silenciado = agente("sil", { base: "error", desde: min(40) });
  const sil = { sil: min(40) };

  it("el grupo va después de «En pausa» y antes de «Libres»; los recientes siguen en «Con error»", () => {
    const g = agrupar([agente("libre"), agente("pausa", { base: "pausa" }), viejo, reciente, silenciado], false, AHORA, sil);
    expect(g.map((x) => x.k)).toEqual(["error", "pausa", "viejos", "libre"]);
    expect(g.find((x) => x.k === "error")!.agentes.map((a) => a.id)).toEqual(["rec"]);
    expect(g.find((x) => x.k === "viejos")!.agentes.map((a) => a.id)).toEqual(["sil", "vie"]);
    expect(g.find((x) => x.k === "viejos")).toMatchObject({ label: "Errores antiguos", pista: "de hace más de un día o silenciados" });
  });

  it("quien te necesita va siempre en «Te necesitan», aunque su error sea viejo", () => {
    const a = agente("n", { base: "error", desde: dia(5), teNecesita: [espera("BET-1", min(5))] });
    expect(grupoDe(a, AHORA)).toBe("toca");
  });

  it("la fila de un error antiguo dice el error y pierde el tono rojo", () => {
    expect(lineaDe(viejo, AHORA, null, null, true)).toMatchObject({ tono: null });
    expect(lineaDe(viejo, AHORA, null, "adapter_failed", true).contexto).toMatch(/^adapter_failed · /);
    expect(lineaDe(viejo, AHORA).tono).toBe("error");
    expect(cuandoFila(viejo, AHORA)).toBe("hace 12 días");
  });

  it("«Libres» viene plegado en computador y «Errores antiguos» abierto; el celular sigue igual", () => {
    expect(abiertoPorOmision("libre", false)).toBe(false);
    expect(abiertoPorOmision("viejos", false)).toBe(true);
    expect(abiertoPorOmision("pausa", false)).toBe(true);
    expect(abiertoPorOmision("pausa", true)).toBe(false);
    expect(abiertoPorOmision("libre", true)).toBe(false);
    expect(abiertoPorOmision("viejos", true)).toBe(true);
  });

  it("lo que el usuario abre o pliega se recuerda por vista y se lee con tolerancia", () => {
    let p = leerPlegados(null);
    expect(estaAbierto(p, "libre", false)).toBe(false);
    p = alternarPlegado(p, "libre", false);
    expect(estaAbierto(p, "libre", false)).toBe(true);
    expect(estaAbierto(p, "libre", true)).toBe(false);
    p = alternarPlegado(p, "viejos", true);
    expect(estaAbierto(p, "viejos", true)).toBe(false);
    expect(leerPlegados(escribirPlegados(p))).toEqual(p);
    for (const malo of ["", "{", "[]", "null", '{"computador":3}', '{"computador":{"libre":"si","otro":true}}']) {
      expect(estaAbierto(leerPlegados(malo), "libre", false)).toBe(false);
      expect(estaAbierto(leerPlegados(malo), "viejos", false)).toBe(true);
    }
  });
});

describe("agentes sin uso (JST-410)", () => {
  it("la constante es de 30 días", () => {
    expect(DIAS_SIN_USO).toBe(30);
  });

  it("un libre sin tarea pendiente con más de 30 días lleva «Sin uso hace N días»", () => {
    expect(marcaSinUso(agente("a", { desde: dia(45) }), AHORA)).toBe("Sin uso hace 45 días");
    expect(lineaDe(agente("a", { desde: dia(45) }), AHORA).sinUso).toBe("Sin uso hace 45 días");
  });

  it("no lleva la marca con 30 días o menos, ni sin fecha, ni si te necesita, ni si no está libre", () => {
    expect(marcaSinUso(agente("a", { desde: dia(30) }), AHORA)).toBeNull();
    expect(marcaSinUso(agente("a", { desde: dia(31) }), AHORA)).toBe("Sin uso hace 31 días");
    expect(marcaSinUso(agente("a", { desde: null }), AHORA)).toBeNull();
    expect(marcaSinUso(agente("a", { desde: dia(60), teNecesita: [espera("BET-1", min(1))] }), AHORA)).toBeNull();
    expect(marcaSinUso(agente("a", { base: "pausa", desde: dia(60) }), AHORA)).toBeNull();
    expect(lineaDe(agente("a", { desde: dia(5) }), AHORA)).not.toHaveProperty("sinUso");
  });

  it("el encabezado de «Libres» cuenta los sin uso", () => {
    const g = agrupar([agente("a", { desde: dia(40) }), agente("b", { desde: dia(100) }), agente("c", { desde: dia(2) })], false, AHORA).find((x) => x.k === "libre")!;
    expect(g.sinUso).toBe(2);
    expect(notaGrupo(g, false)).toBe("· 2 sin uso hace más de 30 días");
    expect(notaGrupo(g, true)).toBe("· 2 sin uso hace más de 30 días");
    const sin = agrupar([agente("c", { desde: dia(2) })], false, AHORA).find((x) => x.k === "libre")!;
    expect(sin.sinUso).toBe(0);
    expect(notaGrupo(sin, false)).toBeNull();
  });
});

describe("lo que dice cada fila (§3)", () => {
  it("te necesita: la tarea de la espera y «Espera: ‹pregunta› (+N)» en violeta", () => {
    const a = agente("x", { teNecesita: [espera("BET-268", min(9)), espera("BET-270", min(4))] });
    expect(lineaDe(a, AHORA)).toEqual({ tarea: { identifier: "BET-268", titulo: "Tarea BET-268" }, contexto: "Espera: ¿Seguimos con BET-268? (+1)", tono: "toca" });
  });

  it("con error: «‹errorCode› · ‹motivo›» en rojo (sin el código si no se conoce)", () => {
    const a = agente("x", { base: "error", motivo: "El run terminó con error (exit code 1)." });
    expect(lineaDe(a, AHORA, null, "adapter_failed")).toMatchObject({ contexto: "adapter_failed · El run terminó con error (exit code 1).", tono: "error" });
    expect(lineaDe(a, AHORA).contexto).toBe("El run terminó con error (exit code 1).");
  });

  it("trabajando: «Run 4f2a · empezó hace 3 min», o «En cola, parte en segundos»", () => {
    expect(lineaDe(agente("x", { base: "trabajando", run: run("BET-1") }), AHORA)).toEqual({
      tarea: { identifier: "BET-1", titulo: "Título BET-1" },
      contexto: "Run 4f2a · empezó hace 3 min",
      tono: null,
    });
    expect(lineaDe(agente("x", { base: "trabajando", run: run("BET-1", true) }), AHORA).contexto).toBe("En cola, parte en segundos");
  });

  it("en pausa: el motivo y desde cuándo; libre: en la sala de descanso, con la última tarea si se leyó", () => {
    const pausa = agente("x", { base: "pausa", motivo: "manual", desde: new Date(AHORA - 30 * 3600_000).toISOString() });
    expect(lineaDe(pausa, AHORA).contexto).toBe("La pausaron a mano · desde ayer");
    const libre = agente("y", { desde: min(20) });
    expect(lineaDe(libre, AHORA)).toEqual({ tarea: null, contexto: "En la sala de descanso hace 20 min", tono: null });
    expect(lineaDe(libre, AHORA, { identifier: "BET-9", titulo: "Algo" })).toEqual({
      tarea: { identifier: "BET-9", titulo: "Algo" },
      contexto: "Última tarea · En la sala de descanso hace 20 min",
      tono: null,
    });
  });

  it("chips: el estado («En cola» si el run espera) más «Te necesita · N»; a la derecha, hace cuánto", () => {
    expect(chipsDe(agente("x", { base: "trabajando", run: run("BET-1", true), teNecesita: [espera("A", min(1)), espera("B", min(2))] }))).toEqual([
      { st: "trabaja", texto: "En cola" },
      { st: "toca", texto: "Te necesita · 2" },
    ]);
    expect(chipsDe(agente("x", { teNecesita: [espera("A", min(1)), espera("B", min(2))] }))).toEqual([{ st: "toca", texto: "Te necesita" }]);
    expect(cuandoFila(agente("x", { base: "error", desde: min(4) }), AHORA)).toBe("hace 4 min");
  });

  it("tocar abre la ventana solo si el agente únicamente te espera (libre y con algo pendiente)", () => {
    expect(abreVentana(agente("x", { teNecesita: [espera("A", min(1))] }))).toBe(true);
    expect(abreVentana(agente("x", { base: "trabajando", run: run("A"), teNecesita: [espera("A", min(1))] }))).toBe(false);
    expect(abreVentana(agente("x", { base: "error", teNecesita: [espera("A", min(1))] }))).toBe(false);
    expect(abreVentana(agente("x"))).toBe(false);
  });
});
