// El Resumen (0.9.0, JST-246; design-spec de JST-245, A · Menú y reproductor):
// el armado de cada parte, los números contra los datos, las frases armadas,
// «Lo nuevo» y la revisión de lo que escribe la IA.
import { describe, expect, it } from "vitest";
import type { AgenteOficina, Espera } from "../src/estado.js";
import type { FilaTarea } from "../src/fuentes.js";
import { Arbol, armarDatos, colaDe, completarArbol, contarPartes, elegidasDe, esperaDe, idsParaArbol, pideDeEspera, porPedido, tituloParaVoz, tocaDe, trabajanDe, type DatosResumen, type EmpresaRes, type Insumos } from "../src/resumen/datos.js";
import {
  alternarEmpresa,
  alternarParte,
  armarResumen,
  conQue,
  duracionFrase,
  fraseCierre,
  fraseNumeros,
  frasesCola,
  frasesHecho,
  frasesIntro,
  frasesToca,
  frasesTrabajan,
  leerOpciones,
  mmss,
  OPCIONES_OMISION,
  seccionesDe,
  textoDuracion,
  type Contexto,
  type OpcionesResumen,
  type Seccion,
  type Titulo,
} from "../src/resumen/frases.js";
import { citasDe, deTi, duenosDeVeces, EJEMPLO_PEDIDO_RESUMEN, EJEMPLO_RESPUESTA_RESUMEN, ideasDe, leerParteIa, numerosDe, numerosPegados, palabrasNuevasRaras, pedidoIa, revisarFraseIa } from "../src/resumen/ia.js";
import { desdeCuando, DIA_MS, explicacionDesde, hace, inicioDe, inicioDelDia, MINUTO_MS, nuevoDe, periodoFrase, periodoTexto } from "../src/resumen/tiempo.js";
import { problemasFraseResumen } from "../src/resumen/voz.js";

// Sábado 24 de octubre de 2026, 15:40 (en la zona de quien corre las pruebas).
const AHORA = new Date(2026, 9, 24, 15, 40).getTime();
const H = 60 * MINUTO_MS;
const iso = (t: number) => new Date(t).toISOString();

const EMPRESAS: EmpresaRes[] = [
  { id: "c-bet", prefijo: "BET", nombre: "Betalandia" },
  { id: "c-elm", prefijo: "ELM", nombre: "El Mirador" },
  { id: "c-jst", prefijo: "JST", nombre: "JSTM" },
  { id: "c-mig", prefijo: "MIG", nombre: "Migo" },
  { id: "c-per", prefijo: "PER", nombre: "Personal" },
];

function espera(x: Partial<Espera> & { itemId: string }): Espera {
  return { tipo: "tarjeta", sujetoId: null, clase: null, issueId: null, identifier: null, titulo: null, tituloTarea: null, href: null, desde: iso(AHORA - H), ...x };
}

function agente(x: Partial<AgenteOficina> & { id: string; companyId: string; prefijo: string; nombre: string }): AgenteOficina {
  return { rol: null, rolApi: null, adapterType: "claude_local", esHermes: false, statusApi: "idle", base: "libre", run: null, runsExtra: 0, teNecesita: [], motivo: null, desde: null, ...x };
}

function fila(x: Partial<FilaTarea> & { id: string; companyId: string }): FilaTarea {
  return { title: `Tarea ${x.id}`, status: "done", identifier: null, parentId: null, completedAt: iso(AHORA - H), updatedAt: iso(AHORA - H), ...x };
}

const run = (issueId: string, identifier: string, titulo: string, desde: number) => ({ id: `run-${issueId}`, issueId, identifier, titulo, enCola: false, desde: iso(desde), href: "", tareaHref: null, tareaStatus: "in_progress" });

const ctx = (op: Partial<OpcionesResumen> = {}, extra: Partial<Contexto> = {}): Contexto => ({ ahora: AHORA, ultima: AHORA - 7 * H - 28 * MINUTO_MS, op: { ...OPCIONES_OMISION, ...op }, ...extra });
const titulo: Titulo = (t) => tituloParaVoz(t);

// ---------------------------------------------------------------------------

describe("las horas y «Lo nuevo» (§3.3 y §9)", () => {
  it("dice las horas como la Oficina: hoy, ayer, el día de la semana o la fecha; «la 1:05»", () => {
    expect(desdeCuando(new Date(2026, 9, 24, 9, 20).getTime(), AHORA)).toBe("las 9:20");
    expect(desdeCuando(new Date(2026, 9, 24, 1, 5).getTime(), AHORA)).toBe("la 1:05");
    expect(desdeCuando(new Date(2026, 9, 23, 9, 20).getTime(), AHORA)).toBe("ayer a las 9:20");
    expect(desdeCuando(new Date(2026, 9, 20, 9, 20).getTime(), AHORA)).toBe("el martes a las 9:20");
    expect(desdeCuando(new Date(2026, 9, 10, 18, 3).getTime(), AHORA)).toBe("el 10 de octubre a las 18:03");
  });

  it("dice lo que lleva algo en palabras", () => {
    expect(hace(AHORA - MINUTO_MS, AHORA)).toBe("un minuto");
    expect(hace(AHORA - 50 * MINUTO_MS, AHORA)).toBe("50 minutos");
    expect(hace(AHORA - 65 * MINUTO_MS, AHORA)).toBe("una hora");
    expect(hace(AHORA - 95 * MINUTO_MS, AHORA)).toBe("una hora y media");
    expect(hace(AHORA - 3 * H, AHORA)).toBe("3 horas");
    expect(hace(AHORA - 30 * H, AHORA)).toBe("un día");
    expect(hace(AHORA - 50 * H, AHORA)).toBe("2 días");
  });

  it("«Lo nuevo» cuenta desde la última vez que se escuchó; la primera vez, lo de hoy; de más de 7 días, 7 días", () => {
    const hoy = inicioDelDia(AHORA);
    expect(new Date(hoy).getHours()).toBe(0);
    expect(nuevoDe(null, AHORA)).toEqual({ k: "primera" });
    expect(nuevoDe(AHORA + 5_000, AHORA)).toEqual({ k: "primera" });
    expect(nuevoDe(AHORA - 8 * DIA_MS, AHORA)).toEqual({ k: "semana" });
    expect(inicioDe("nuevo", AHORA, null)).toBe(hoy);
    expect(inicioDe("nuevo", AHORA, AHORA - 3 * H)).toBe(AHORA - 3 * H);
    expect(inicioDe("nuevo", AHORA, AHORA - 8 * DIA_MS)).toBe(AHORA - 7 * DIA_MS);
    expect(inicioDe("hoy", AHORA, AHORA - 3 * H)).toBe(hoy);
    expect(inicioDe("24h", AHORA, null)).toBe(AHORA - DIA_MS);
    expect(inicioDe("7d", AHORA, null)).toBe(AHORA - 7 * DIA_MS);
  });

  it("la explicación del menú y el período de la primera frase", () => {
    const ultima = new Date(2026, 9, 24, 8, 12).getTime();
    expect(explicacionDesde("nuevo", AHORA, ultima)).toBe("Desde las 8:12, la última vez que lo escuchaste");
    expect(explicacionDesde("nuevo", AHORA, new Date(2026, 9, 23, 18, 0).getTime())).toBe("Desde ayer a las 18:00, la última vez que lo escuchaste");
    expect(explicacionDesde("nuevo", AHORA, null)).toBe("Es la primera vez: te cuento lo de hoy");
    expect(explicacionDesde("nuevo", AHORA, AHORA - 9 * DIA_MS)).toBe("Hace más de una semana: te cuento los últimos 7 días");
    expect(explicacionDesde("hoy", AHORA, ultima)).toBe("Desde las 0:00 de hoy");
    expect(explicacionDesde("24h", AHORA, ultima)).toBe("Desde ayer a esta hora");
    expect(explicacionDesde("7d", AHORA, ultima)).toBe("Desde el sábado pasado a esta hora");
    expect(periodoFrase("nuevo", AHORA, ultima)).toBe("Desde las 8:12, la última vez que lo escuchaste");
    expect(periodoFrase("nuevo", AHORA, null)).toBe("Hoy");
    expect(periodoFrase("24h", AHORA, null)).toBe("En las últimas 24 horas");
    expect(periodoTexto("nuevo", AHORA, null)).toBe("Lo de hoy, la primera vez que lo escuchas");
  });
});

// ---------------------------------------------------------------------------

describe("el árbol de pedidos y lo que se hizo (§3.1)", () => {
  it("sube por `parentId` hasta el pedido de origen y lee una vez cada tarea de más arriba que falte", async () => {
    const a = new Arbol();
    a.sumarFila(fila({ id: "t1", companyId: "c-jst", parentId: "p1" }));
    a.sumarFila(fila({ id: "t2", companyId: "c-jst", parentId: "p1" }));
    a.sumarFila(fila({ id: "t3", companyId: "c-jst" }));
    expect(a.faltan(["t1", "t2", "t3"])).toEqual(["p1"]);
    const leidas: string[] = [];
    const n = await completarArbol({ base: "" }, a, ["t1", "t2", "t3"], 40, async (_cx, id) => {
      leidas.push(id);
      return [
        { id, identifier: "JST-100", titulo: "Hijo", parentId: "r1", rutina: false },
        { id: "r1", identifier: "JST-64", titulo: "pixel agent", parentId: null, rutina: false },
      ];
    });
    expect(n).toBe(1);
    expect(leidas).toEqual(["p1"]);
    expect(a.raiz("t1")?.identifier).toBe("JST-64");
    expect(a.raiz("t3")?.id).toBe("t3");
  });

  it("como mucho `max` lecturas; si una falla, el pedido es la que la nombra", async () => {
    const a = new Arbol();
    for (let i = 0; i < 6; i++) a.sumarFila(fila({ id: `t${i}`, companyId: "c-bet", parentId: `p${i}` }));
    const ids = Array.from({ length: 6 }, (_, i) => `t${i}`);
    const n = await completarArbol({ base: "" }, a, ids, 3, async () => {
      throw new Error("404");
    });
    expect(n).toBe(3);
    expect(a.faltan(ids)).toHaveLength(3);
  });

  it("agrupa lo terminado por pedido de origen, y una rutina repetida en una sola (los más grandes primero)", () => {
    const a = new Arbol();
    a.sumar({ id: "r64", identifier: "JST-64", titulo: "pixel agent", parentId: null, rutina: false });
    const hechas = [
      ...[1, 2, 3].map((i) => fila({ id: `jira${i}`, companyId: "c-bet", identifier: `BET-49${i}`, title: "Sincronizar Jira: CORE y épicas", originKind: "routine_execution", completedAt: iso(AHORA - i * H) })),
      fila({ id: "j1", companyId: "c-jst", identifier: "JST-232", title: "Oficina 0.7.0", parentId: "r64" }),
      fila({ id: "j2", companyId: "c-jst", identifier: "JST-241", title: "Oficina 0.8.0", parentId: "r64" }),
      fila({ id: "m1", companyId: "c-mig", identifier: "MIG-21", title: "Ordenar los ajustes" }),
    ];
    for (const f of hechas) a.sumarFila(f);
    const p = porPedido(
      hechas.map((f) => ({ fila: f, prefijo: f.companyId === "c-bet" ? "BET" : f.companyId === "c-jst" ? "JST" : "MIG" })),
      a,
    );
    expect(p.map((x) => [x.titulo, x.n, x.rutina, x.tid])).toEqual([
      ["Sincronizar Jira: CORE y épicas", 3, true, "BET-491"],
      ["pixel agent", 2, false, "JST-64"],
      ["Ordenar los ajustes", 1, false, "MIG-21"],
    ]);
  });

  it("con qué espera cada tarea de la cola", () => {
    const toca = new Set(["x-ti"]);
    expect(esperaDe(fila({ id: "a", companyId: "c", status: "todo" }), toca)).toBe("lista");
    expect(esperaDe(fila({ id: "x-ti", companyId: "c", status: "blocked" }), toca)).toBe("ti");
    expect(esperaDe(fila({ id: "b", companyId: "c", status: "todo", assigneeUserId: "u1" }), toca)).toBe("ti");
    expect(esperaDe(fila({ id: "c", companyId: "c", status: "blocked", blockedBy: [{ id: "z", status: "in_progress" }] }), toca)).toBe("curso");
    expect(esperaDe(fila({ id: "d", companyId: "c", status: "blocked", blockedBy: [{ id: "z", status: "todo" }] }), toca)).toBe("cola");
    expect(esperaDe(fila({ id: "e", companyId: "c", status: "blocked", blockedBy: [{ id: "x-ti", status: "in_review" }] }), toca)).toBe("ti");
    expect(esperaDe(fila({ id: "f", companyId: "c", status: "blocked", blockedBy: [{ id: "z", status: "done" }] }), toca)).toBe("sin");
  });

  it("los títulos van cortos, sin el rol de adelante ni el código (§3.3)", () => {
    expect(tituloParaVoz("QA — gate de la 0.9.0, con capturas en el celular")).toBe("gate de la 0.9.0");
    expect(tituloParaVoz("Ingeniero: endpoint del doble factor", new Set(["ingeniero"]))).toBe("endpoint del doble factor");
    expect(tituloParaVoz("BET-421 · Revisar el PR de enlaces mágicos")).toBe("Revisar el PR de enlaces mágicos");
    expect(tituloParaVoz("«Oficina global» 0.9.0: el botón «Resumen» arma qué se hizo, qué está pendiente y en qué se trabaja, y lo lee en voz alta")).toMatch(/^Oficina global 0\.9\.0/);
    expect(problemasFraseResumen(tituloParaVoz("Mover a in_review y blocked lo de 🚀 JST-12"))).toEqual([]);
  });

  it("antes de la coma cuentan las palabras que se dicen, sin el código ni el « · » (JST-272)", () => {
    const ci = new Set(["integracion y ci", "integracion"]);
    // Antes: «commit», una sola palabra.
    expect(tituloParaVoz("BET-500 · commit, rebase y PR hacia develop del respaldo cifrado semanal")).toBe("commit, rebase y PR hacia develop del respaldo cifrado semanal");
    expect(tituloParaVoz("BET-466 · Commit, rebase y PR hacia develop del arreglo de ColaReintentos + seguimiento del CI")).toBe("Commit, rebase y PR hacia develop del arreglo de ColaReintentos");
    expect(tituloParaVoz("BET-205 · Integración y CI — commit, rebase y PR hacia develop del arreglo de SaveProfile + seguimiento del CI", ci)).toBe("commit, rebase y PR hacia develop del arreglo de SaveProfile");
    expect(tituloParaVoz("BET-477 · Integración — commit, rebase y PR del parche 2.3.1 hacia master (BT-6927)", ci)).toBe("commit, rebase y PR del parche 2.3.1 hacia master");
    expect(tituloParaVoz("BET-224 · Integración y CI: commit, rebase y PR hacia develop del arreglo de TestHelpers", ci)).toBe("commit, rebase y PR hacia develop del arreglo de TestHelpers");
    // «de A» no se dice (no termina en «de» ni en «a»): antes de la coma se dice una.
    expect(tituloParaVoz("BT-7547 · Maqueta de A, pantalla de B y medidas (spike)")).toBe("Maqueta de A, pantalla de B y medidas");
    // Con 3 palabras dichas antes de la coma, se corta ahí como antes.
    expect(tituloParaVoz("BET-12 · Revisar el login, después el registro y el perfil")).toBe("Revisar el login");
    expect(tituloParaVoz("QA de la 0.9.4, con capturas en el celular")).toBe("QA de la 0.9.4");
  });

  it("«revisar» dice de qué tarea es en las de Integración y CI (JST-272)", () => {
    const ci = new Set(["integracion y ci", "integracion"]);
    const titulo = "BET-508 · Integración — commit, rebase y PR hacia develop de la opción «¿Es usuario invitado?» + seguimiento del CI";
    const p = pideDeEspera(espera({ itemId: "review:review:bet-627", tipo: "revision", issueId: "bet-627", identifier: "BET-627", titulo, tituloTarea: titulo }), ci);
    expect(p.pide).not.toBe("revisar commit");
    expect(p.pide).toMatch(/^revisar commit, rebase y PR hacia develop/);
    expect(problemasFraseResumen(p.pide)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

/** Una oficina chica: 2 te esperan en BET, 1 en MIG; trabajan 3; la cola en JST y MIG. */
function insumos(): Insumos {
  const agentes: AgenteOficina[] = [
    agente({
      id: "a-rev",
      companyId: "c-bet",
      prefijo: "BET",
      nombre: "Revisor de Codigo (Codex)",
      teNecesita: [espera({ itemId: "i1", tipo: "revision", issueId: "bet-421", identifier: "BET-421", titulo: "PR de enlaces mágicos", tituloTarea: "PR de enlaces mágicos", desde: iso(new Date(2026, 9, 23, 9, 20).getTime()) })],
    }),
    agente({
      id: "a-lider",
      companyId: "c-bet",
      prefijo: "BET",
      nombre: "Líder Técnico",
      base: "trabajando",
      run: run("bet-430", "BET-430", "Filtros guardados en la vista del reporte", AHORA - 2 * H),
      teNecesita: [espera({ itemId: "i2", issueId: "bet-419", identifier: "BET-419", titulo: "¿Redis o memoria para la caché de tokens?", tituloTarea: "Caché de tokens", desde: iso(AHORA - 4 * H) })],
    }),
    agente({
      id: "a-ing",
      companyId: "c-mig",
      prefijo: "MIG",
      nombre: "Ingeniero",
      base: "trabajando",
      run: run("mig-35", "MIG-35", "Spec: conexión real con Slack", AHORA - 3 * H),
      teNecesita: [espera({ itemId: "i3", tipo: "aprobacion", issueId: "mig-40", identifier: "MIG-40", titulo: "Contratar un diseñador", desde: iso(AHORA - 30 * MINUTO_MS) })],
    }),
    agente({ id: "a-plug", companyId: "c-jst", prefijo: "JST", nombre: "Ingeniero/a Full-stack de Plugins", base: "trabajando", run: run("jst-246", "JST-246", "Oficina global 0.9.0", AHORA - 50 * MINUTO_MS) }),
    agente({ id: "a-cos", companyId: "c-jst", prefijo: "JST", nombre: "Chief of staff" }),
  ];
  const arbol = new Arbol();
  const terminadas = new Map<string, FilaTarea[]>([
    ["c-bet", [1, 2, 3].map((i) => fila({ id: `jira${i}`, companyId: "c-bet", identifier: `BET-49${i}`, title: "Sincronizar Jira: CORE y épicas", originKind: "routine_execution" }))],
    ["c-jst", [fila({ id: "j1", companyId: "c-jst", identifier: "JST-232", title: "Oficina 0.7.0", parentId: "r64" }), fila({ id: "j2", companyId: "c-jst", identifier: "JST-241", title: "Oficina 0.8.0", parentId: "r64" })]],
    ["c-mig", [fila({ id: "m1", companyId: "c-mig", identifier: "MIG-21", title: "Ordenar los ajustes en la app por categorías" }), fila({ id: "viejo", companyId: "c-mig", completedAt: iso(AHORA - 3 * DIA_MS) })]],
  ]);
  const abiertas = new Map<string, FilaTarea[]>([
    ["c-jst", [fila({ id: "jst-246", companyId: "c-jst", status: "in_progress", parentId: "r64", title: "Oficina global 0.9.0" }), fila({ id: "q1", companyId: "c-jst", status: "todo", parentId: "r64" }), fila({ id: "q2", companyId: "c-jst", status: "blocked", parentId: "r64", blockedBy: [{ id: "jst-246", status: "in_progress" }] })]],
    ["c-mig", [fila({ id: "q3", companyId: "c-mig", status: "blocked", blockedBy: [{ id: "mig-40", status: "todo" }] }), fila({ id: "mig-40", companyId: "c-mig", status: "todo" })]],
  ]);
  arbol.sumar({ id: "r64", identifier: "JST-64", titulo: "pixel agent", parentId: null, rutina: false });
  for (const fs of [...terminadas.values(), ...abiertas.values()]) for (const f of fs) arbol.sumarFila(f);
  return {
    empresas: EMPRESAS,
    agentes,
    tareasVivas: (a) => (a.id === "a-plug" ? [{ id: "jst-246", identifier: "JST-246", titulo: "Oficina global 0.9.0" }, { id: "q1", identifier: "JST-247", titulo: "QA 0.9.0" }] : []),
    terminadas,
    abiertas,
    fallan: new Set(),
    arbol,
    inicio: AHORA - DIA_MS,
  };
}

describe("el armado de cada parte y los números contra los datos (§3.1)", () => {
  it("cuenta cada parte con lo que hay: te esperan (las esperas), trabajando, terminadas del período y la cola (por empezar o bloqueadas)", () => {
    const d = armarDatos(insumos(), []);
    expect(contarPartes(d)).toEqual({ toca: 3, hecho: 6, trabajan: 3, cola: 4 });
    // Lo terminado antes del período no cuenta.
    expect(d.hechas.map((h) => h.id)).not.toContain("viejo");
    expect(d.pedidos.map((p) => [p.titulo, p.n])).toEqual([
      ["Sincronizar Jira: CORE y épicas", 3],
      ["pixel agent", 2],
      ["Ordenar los ajustes en la app por categorías", 1],
    ]);
  });

  it("lo que te espera va de la más antigua a la más nueva, con lo que pide (0.8.0)", () => {
    const t = tocaDe(insumos().agentes);
    expect(t.map((x) => [x.agente, x.tid, x.pide, x.pregunta])).toEqual([
      ["Revisor de código", "BET-421", "revisar PR de enlaces mágicos", false],
      ["Líder técnico", "BET-419", "¿Redis o memoria para la caché de tokens?", true],
      ["Ingeniero", "MIG-40", "aprobar contratar un diseñador", false],
    ]);
  });

  it("quién trabaja, el que lleva más primero, con sus tareas y su pedido («2 de «pixel agent»»)", () => {
    const ins = insumos();
    const w = trabajanDe(ins.agentes, ins.tareasVivas, ins.arbol);
    expect(w.map((x) => x.agente)).toEqual(["Ingeniero", "Líder técnico", "Plugins"]);
    expect(conQue(w[2]!, titulo)).toBe("2 de «pixel agent»");
    expect(conQue(w[0]!, titulo)).toBe("«Spec: conexión real con Slack»");
  });

  it("la cola: por empezar y bloqueadas, con qué esperan y su pedido", () => {
    const ins = insumos();
    const teToca = new Set(["mig-40"]);
    const c = colaDe(
      [...ins.abiertas.get("c-jst")!.map((fila) => ({ fila, prefijo: "JST" })), ...ins.abiertas.get("c-mig")!.map((fila) => ({ fila, prefijo: "MIG" }))],
      ins.arbol,
      teToca,
    );
    expect(c.map((x) => [x.id, x.bloqueada, x.espera, x.raiz?.titulo])).toEqual([
      ["q1", false, "lista", "pixel agent"],
      ["q2", true, "curso", "pixel agent"],
      ["q3", true, "ti", "Tarea q3"],
      ["mig-40", false, "ti", "Tarea mig-40"],
    ]);
  });

  it("filtra por empresas: solo las elegidas, y las que no responden quedan fuera (y se dicen)", () => {
    const ins = insumos();
    const d = armarDatos(ins, ["MIG"]);
    expect(d.empresas.map((e) => e.prefijo)).toEqual(["MIG"]);
    expect(contarPartes(d)).toEqual({ toca: 1, hecho: 1, trabajan: 1, cola: 2 });
    const caida = armarDatos({ ...ins, fallan: new Set(["c-mig"]) }, []);
    expect(caida.fallan.map((e) => e.prefijo)).toEqual(["MIG"]);
    expect(contarPartes(caida)).toEqual({ toca: 2, hecho: 5, trabajan: 2, cola: 2 });
    expect(elegidasDe(EMPRESAS, ["ZZZ"]).length).toBe(EMPRESAS.length);
  });

  it("las tareas cuyo pedido hace falta: las terminadas, las que se hacen y las de la cola", () => {
    const d = armarDatos(insumos(), []);
    const ids = idsParaArbol(d);
    expect(ids).toEqual(expect.arrayContaining(["jira1", "j1", "m1", "jst-246", "q1", "q2", "q3", "mig-40", "bet-430", "mig-35"]));
  });
});

// ---------------------------------------------------------------------------

const datos = (): DatosResumen => armarDatos(insumos(), []);

describe("las frases armadas (§3.2 y §3.3)", () => {
  it("la primera frase: los números con los datos, con los singulares y sin las partes desmarcadas", () => {
    const d = datos();
    expect(fraseNumeros(d, ctx({ desde: "24h" }), EMPRESAS)).toBe("En las últimas 24 horas: 6 terminadas, 3 trabajando, 3 te esperan y 4 en cola.");
    expect(fraseNumeros(d, ctx({ desde: "24h" }, { conIa: true }), EMPRESAS)).toBe("Hola. En las últimas 24 horas: 6 terminadas, 3 trabajando, 3 te esperan y 4 en cola.");
    expect(fraseNumeros({ toca: [d.toca[0]!], trabajan: [d.trabajan[0]!], hechas: [d.hechas[0]!], cola: [d.cola[0]!] }, ctx({ desde: "hoy" }), EMPRESAS)).toBe("Hoy: una terminada, uno trabajando, una cosa te espera y una en cola.");
    expect(fraseNumeros({ toca: [], trabajan: [], hechas: [], cola: [] }, ctx({ desde: "7d" }), EMPRESAS)).toBe("En los últimos 7 días: nada terminado, nadie trabajando, nada te espera y nada en cola.");
    expect(fraseNumeros(d, ctx({ desde: "24h", partes: ["toca", "cola"] }), EMPRESAS)).toBe("En las últimas 24 horas: 3 te esperan y 4 en cola.");
    const ultima = new Date(2026, 9, 24, 8, 12).getTime();
    expect(fraseNumeros(d, ctx({ co: ["MIG"] }, { ultima }), [EMPRESAS[3]!])).toBe("En Migo, desde las 8:12, la última vez que lo escuchaste: 6 terminadas, 3 trabajando, 3 te esperan y 4 en cola.");
  });

  it("lo que te toca: en corto, las 2 más antiguas y «Y N más»; en completo, todas con lo que llevan", () => {
    const d = datos();
    const corto = frasesToca(d.toca, d, ctx());
    expect(corto.map((f) => f.texto)).toEqual([
      "Te esperan 3 cosas. La más antigua: Revisor de código de Betalandia te pide revisar PR de enlaces mágicos; espera desde ayer a las 9:20.",
      "Después, Líder técnico de Betalandia te pregunta: ¿Redis o memoria para la caché de tokens?",
      "Y una más, con la mano arriba en la Oficina.",
    ]);
    expect(corto[0]).toMatchObject({ co: "BET", ag: "a-rev", tid: "BET-421" });
    const completo = frasesToca(d.toca, d, ctx({ largo: "completo" }));
    expect(completo.map((f) => f.texto)).toEqual([
      "Te esperan 3 cosas. La más antigua: Revisor de código de Betalandia te pide revisar PR de enlaces mágicos; espera desde ayer a las 9:20.",
      "Después, Líder técnico de Betalandia te pregunta: ¿Redis o memoria para la caché de tokens? Desde hace 4 horas.",
      "Y Ingeniero de Migo: aprobar contratar un diseñador, desde hace 30 minutos.",
    ]);
    expect(frasesToca([], d, ctx())[0]!.texto).toBe("No te espera nada.");
    expect(frasesToca([d.toca[2]!], d, ctx())[0]!.texto).toBe("Te espera una cosa: Ingeniero de Migo te pide aprobar contratar un diseñador; espera desde las 15:10.");
  });

  it("lo que se hizo: por pedido, lo repetido en una frase; sin nada, «no se terminó nada nuevo»", () => {
    const d = datos();
    expect(frasesHecho(d, ctx(), titulo).map((f) => f.texto)).toEqual([
      "Se terminaron 6 tareas de 3 pedidos: 3 en Betalandia, 2 en JSTM y 1 en Migo.",
      "Los más grandes: «Sincronizar Jira: CORE y épicas», que corrió 3 veces; y «pixel agent», con 2 tareas.",
    ]);
    expect(frasesHecho(d, ctx({ largo: "completo" }), titulo).map((f) => f.texto)).toEqual([
      "Se terminaron 6 tareas de 3 pedidos.",
      "Betalandia, 3: «Sincronizar Jira: CORE y épicas», que corrió 3 veces.",
      "JSTM, 2: «pixel agent», con 2 tareas.",
      "Migo, 1: «Ordenar los ajustes en la app por categorías».",
    ]);
    const uno = { ...d, hechas: d.hechas.slice(0, 3), pedidos: d.pedidos.slice(0, 1) };
    expect(frasesHecho(uno, ctx(), titulo).map((f) => f.texto)).toEqual(["Se terminaron 3 tareas de un pedido: «Sincronizar Jira: CORE y épicas», que corrió 3 veces."]);
    const nada = { ...d, hechas: [], pedidos: [] };
    const ultima = new Date(2026, 9, 24, 12, 29).getTime();
    expect(frasesHecho(nada, ctx({}, { ultima }), titulo)[0]!.texto).toBe("Desde las 12:29 no se terminó nada nuevo.");
    expect(frasesHecho(nada, ctx({ desde: "hoy" }), titulo)[0]!.texto).toBe("No se terminó nada hoy.");
  });

  it("en qué trabajan: cuántos por empresa y el que lleva más; en completo, cada uno", () => {
    const d = datos();
    expect(frasesTrabajan(d.trabajan, d, ctx(), titulo).map((f) => f.texto)).toEqual([
      "Trabajan 3: 1 en Betalandia, 1 en JSTM y 1 en Migo.",
      "Lleva más: Ingeniero de Migo, 3 horas con «Spec: conexión real con Slack».",
    ]);
    expect(frasesTrabajan(d.trabajan, d, ctx({ largo: "completo" }), titulo).map((f) => f.texto)).toEqual([
      "Trabajan 3.",
      "En Betalandia: Líder técnico, 2 horas con «Filtros guardados en la vista del reporte».",
      "En JSTM: Plugins, 50 minutos con 2 de «pixel agent».",
      "En Migo: Ingeniero, 3 horas con «Spec: conexión real con Slack».",
    ]);
    expect(frasesTrabajan([d.trabajan[2]!], d, ctx(), titulo)[0]!.texto).toBe("Trabaja uno: Plugins de JSTM, 50 minutos con 2 de «pixel agent».");
    expect(frasesTrabajan([], d, ctx(), titulo)[0]!.texto).toBe("Ahora no hay nadie trabajando.");
  });

  it("lo que está en cola: cuántas, cuántas bloqueadas y cuántas esperan algo tuyo", () => {
    const d = datos();
    expect(frasesCola(d.cola, d, ctx(), titulo).map((f) => f.texto)).toEqual(["En cola quedan 4: 2 bloqueadas y 2 por empezar; 2 esperan algo tuyo."]);
    expect(frasesCola(d.cola, d, ctx({ largo: "completo" }), titulo).map((f) => f.texto)).toEqual([
      "En cola quedan 4: 2 bloqueadas y 2 por empezar; 2 esperan algo tuyo.",
      "Una espera a una que ya se está haciendo y una está lista para empezar.",
      "JSTM, 2, una bloqueada; lo que más espera es «pixel agent», con 2 tareas.",
      "Migo, 2, una bloqueada.",
    ]);
    expect(frasesCola([], d, ctx(), titulo)[0]!.texto).toBe("No queda nada en cola.");
    expect(frasesCola([d.cola[1]!], d, ctx(), titulo)[0]!.texto).toBe("En cola queda una, bloqueada.");
  });

  it("el total de la cola, de varias empresas, no enciende ninguna sala ni lleva chip; si toda la cola es de una, sí (JST-260, §6)", () => {
    const d = datos();
    const ti = d.cola.find((x) => x.espera === "ti")!;
    expect(ti.prefijo).toBe("MIG");
    expect(new Set(d.cola.map((x) => x.prefijo)).size).toBeGreaterThan(1);
    for (const largo of ["corto", "completo"] as const) {
      const total = frasesCola(d.cola, d, ctx({ largo }), titulo)[0]!;
      expect(total.texto).toMatch(/esperan algo tuyo\.$/);
      expect([total.co ?? null, total.ag ?? null, total.tid ?? null]).toEqual([null, null, null]);
    }
    // Las de cada empresa (completo) siguen encendiendo la suya.
    expect(frasesCola(d.cola, d, ctx({ largo: "completo" }), titulo).slice(2).map((f) => f.co)).toEqual(["JST", "MIG"]);
    const mig = d.cola.filter((x) => x.prefijo === "MIG");
    expect(frasesCola(mig, d, ctx(), titulo)[0]).toMatchObject({ co: "MIG", tid: mig.find((x) => x.espera === "ti")!.identifier });
    // Sin nada tuyo, tampoco (como antes).
    expect(frasesCola(d.cola.filter((x) => x.prefijo === "JST"), d, ctx(), titulo)[0]!.co ?? null).toBeNull();
  });

  it("el cierre: lo primero que te toca; sin nada, «Eso es todo.»", () => {
    const d = datos();
    expect(fraseCierre(d.toca, d, ctx()).texto).toBe("Eso es todo. Lo primero: revisar PR de enlaces mágicos.");
    expect(fraseCierre([d.toca[1]!], d, ctx()).texto).toBe("Eso es todo. Lo primero: responderle a Líder técnico de Betalandia.");
    expect(fraseCierre([], d, ctx()).texto).toBe("Eso es todo.");
    expect(fraseCierre(d.toca, d, ctx({ partes: ["hecho"] })).texto).toBe("Eso es todo.");
  });

  it("los números dicen la primera vez, más de una semana y la empresa que no respondió (§8)", () => {
    const d = { ...datos(), fallan: [EMPRESAS[3]!], empresas: EMPRESAS.filter((e) => e.prefijo !== "MIG") };
    const primera = frasesIntro(d, ctx({}, { ultima: null }), EMPRESAS).map((f) => f.texto);
    expect(primera[0]).toMatch(/^Hoy: /);
    expect(primera.slice(1)).toEqual(["No pude leer Migo; te cuento las otras.", "Es la primera vez que lo escuchas: te cuento lo de hoy."]);
    expect(frasesIntro(d, ctx({}, { ultima: AHORA - 10 * DIA_MS }), EMPRESAS).map((f) => f.texto).at(-1)).toBe("Hace más de una semana que no lo escuchas: te cuento los últimos 7 días.");
    expect(frasesIntro(d, ctx(), EMPRESAS)[1]).toMatchObject({ aviso: true });
  });

  it("ninguna frase dice un estado en inglés ni un código, y todas pasan las reglas del worker", () => {
    const d = datos();
    for (const largo of ["corto", "completo"] as const) {
      for (const desde of ["nuevo", "hoy", "24h", "7d"] as const) {
        const fr = armarResumen(d, ctx({ largo, desde }), titulo);
        for (const f of fr) expect(problemasFraseResumen(f.texto), f.texto).toEqual([]);
        expect(fr.map((f) => f.texto).join(" ")).not.toMatch(/in_review|in_progress|blocked|backlog|todo,|[A-Z]{2,}-\d+/);
      }
    }
  });

  it("las partes desmarcadas no se leen; siempre van los números y el cierre", () => {
    expect(seccionesDe({ partes: ["toca", "hecho", "trabajan", "cola"] })).toEqual(["intro", "toca", "hecho", "trabajan", "cola", "cierre"]);
    expect(seccionesDe({ partes: ["cola"] })).toEqual(["intro", "cola", "cierre"]);
    const fr = armarResumen(datos(), ctx({ partes: ["cola"] }), titulo);
    expect(new Set(fr.map((f) => f.sec))).toEqual(new Set(["intro", "cola", "cierre"]));
  });

  it("lo que dura: por frase, entre 1,6 y 16 s; «~1 min» bajo 90 s; «Listo · 1:02»", () => {
    expect(duracionFrase("Eso es todo.")).toBe(1600);
    expect(duracionFrase("x".repeat(100))).toBe(400 + 6400);
    expect(duracionFrase("x".repeat(400))).toBe(16_000);
    expect(duracionFrase("x".repeat(100), 1.25)).toBe((400 + 6400) / 1.25);
    expect(textoDuracion(60_000)).toBe("~1 min");
    expect(textoDuracion(170_000)).toBe("~3 min");
    expect(mmss(62_000)).toBe("1:02");
  });
});

describe("las opciones del menú (§2 y §9)", () => {
  it("por omisión: lo nuevo, todas, las 4 partes y corto; lo raro vuelve a lo de por omisión", () => {
    expect(leerOpciones(null)).toEqual({ co: [], desde: "nuevo", partes: ["toca", "hecho", "trabajan", "cola"], largo: "corto" });
    expect(leerOpciones({ co: ["MIG", "x y", 3, "MIG"], desde: "ayer", partes: ["cola", "nada"], largo: "completo" })).toEqual({ co: ["MIG"], desde: "nuevo", partes: ["cola"], largo: "completo" });
    expect(leerOpciones({ partes: [] }).partes).toEqual(["toca"]);
  });

  it("siempre queda al menos una parte, en el orden de siempre", () => {
    expect(alternarParte(["toca", "cola"], "toca")).toEqual(["cola"]);
    expect(alternarParte(["cola"], "cola")).toEqual(["cola"]);
    expect(alternarParte(["cola"], "toca")).toEqual(["toca", "cola"]);
  });

  it("elegir una empresa quita «Todas»; quitar la última, o elegirlas todas, vuelve a «Todas»", () => {
    const todas = EMPRESAS.map((e) => e.prefijo);
    expect(alternarEmpresa([], "MIG", todas)).toEqual(["MIG"]);
    expect(alternarEmpresa(["MIG"], "BET", todas)).toEqual(["BET", "MIG"]);
    expect(alternarEmpresa(["MIG"], "MIG", todas)).toEqual([]);
    expect(alternarEmpresa(["BET", "ELM", "JST", "MIG"], "PER", todas)).toEqual([]);
    expect(alternarEmpresa(["MIG"], null, todas)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe("la IA de Chrome (§3.4): cada frase se revisa contra su armada", () => {
  const nombres = ["Revisor de código", "Líder técnico", "Ingeniero", "Plugins", "Betalandia", "JSTM", "Migo", "El Mirador", "Personal"];
  const armada = "Se terminaron 15 tareas de 13 pedidos: 8 en Betalandia, 4 en JSTM y 3 en Migo.";

  it("saca los números, las horas y los títulos", () => {
    expect(numerosDe("Desde las 8:12: 15 terminadas, 0.9.0.")).toEqual(["8:12", "15", "0.9.0"]);
    expect(citasDe("Los más grandes: «A», con 2 y «B c».")).toEqual(["A", "B c"]);
  });

  it("sirve si dice lo mismo con otras palabras", () => {
    expect(revisarFraseIa(armada, "Se cerraron 15 tareas de 13 pedidos: 8 en Betalandia, 4 en JSTM y 3 en Migo.", nombres)).toEqual([]);
    expect(revisarFraseIa("Lleva más: Ingeniero de Migo, 3 horas con «Conexión real con Slack».", "El que lleva más es Ingeniero de Migo: 3 horas con «Conexión real con Slack».", nombres)).toEqual([]);
  });

  it("no sirve si cambia, sobra o falta un número, un nombre, un título o cuántos", () => {
    expect(revisarFraseIa(armada, "Se terminaron 16 tareas de 13 pedidos: 8 en Betalandia, 4 en JSTM y 3 en Migo.", nombres)).toContain("cambia un número o una hora");
    expect(revisarFraseIa(armada, "Se terminaron 15 tareas de 13 pedidos, sobre todo en Betalandia.", nombres)).toContain("cambia un número o una hora");
    expect(revisarFraseIa(armada, "Se terminaron 15 tareas de 13 pedidos: 8 en Betalandia, 4 en El Mirador y 3 en Migo.", nombres).join()).toMatch(/cambia un nombre/);
    expect(revisarFraseIa("Fue «pixel agent».", "Fue «Pixel Agent».", nombres)).toContain("cambia un título");
    expect(revisarFraseIa("Ahora no hay nadie trabajando.", "Ahora todos están trabajando.", nombres).join()).toMatch(/cambia cuántos/);
    expect(revisarFraseIa("Eso es todo.", "Eso es todo. Revisa JST-246 🚀", nombres).join()).toMatch(/código|signos/);
  });

  it("no sirve si cambia quién es quién (lo que hizo Gemini Nano en la copia)", () => {
    const grandes = "Los más grandes: «pixel agent», con 69 tareas; y «Sincronizar Jira: CORE y épicas», que corrió 48 veces.";
    expect(revisarFraseIa(grandes, "El agente «pixel agent» fue el que más trabajó, con 69 tareas, y «Sincronizar Jira: CORE y épicas» corrió 48 veces.", nombres)).toContain("llama agente a una tarea");
    expect(revisarFraseIa(grandes, "Lo que más avanzó: «pixel agent», con 69 tareas, y «Sincronizar Jira: CORE y épicas», que corrió 48 veces.", nombres, "hecho")).toEqual([]);
    const lleva = "Lleva más: Ingeniero de Migo, 3 días con su tarea.";
    expect(revisarFraseIa(lleva, "El proyecto que lleva más tiempo es de Ingeniero en Migo: 3 días.", nombres).join()).toMatch(/quién es quién/);
    // «4 agentes» trabajando está bien: ahí no hay tareas entre « ».
    expect(revisarFraseIa("Trabajan 4: 2 en JSTM y 2 en Migo.", "Están trabajando 4 agentes: 2 en JSTM y 2 en Migo.", nombres)).toEqual([]);
  });

  it("lee la respuesta: tantas frases como armadas, y cada una conserva su empresa, su agente y su tarea", () => {
    const armadas = [
      { sec: "hecho" as const, texto: armada },
      { sec: "hecho" as const, texto: "Los más grandes: «Sincronizar Jira», que corrió 8 veces y «pixel agent», con 2.", co: "BET", tid: "BET-491" },
    ];
    const ok = leerParteIa(JSON.stringify({ frases: ["Se cerraron 15 tareas de 13 pedidos: 8 en Betalandia, 4 en JSTM y 3 en Migo.", "Lo que más avanzó: «Sincronizar Jira», que corrió 8 veces, y «pixel agent», con 2."] }), armadas, nombres);
    expect(ok.mal).toEqual([]);
    expect(ok.frases![1]).toMatchObject({ co: "BET", tid: "BET-491", ia: true, sec: "hecho" });
    expect(leerParteIa("no es json", armadas, nombres).frases).toBeNull();
    expect(leerParteIa(JSON.stringify({ frases: ["Una sola."] }), armadas, nombres).mal[0]).toMatch(/son 1 frases/);
    expect(leerParteIa(JSON.stringify({ frases: [armada, "Lo que más avanzó: «Sincronizar Jira», que corrió 9 veces, y «pixel agent», con 2."] }), armadas, nombres).frases).toBeNull();
  });

  it("el pedido lleva las frases numeradas y un esquema con tantas como armadas", () => {
    const p = pedidoIa("toca", [{ sec: "toca", texto: "No te espera nada." }]);
    expect(p.texto).toBe("Parte: Lo que te toca.\nFrases:\n1. No te espera nada.");
    expect(p.esquema).toMatchObject({ properties: { frases: { minItems: 1, maxItems: 1 } } });
  });
});

// ---------------------------------------------------------------------------

describe("la IA de Chrome no cambia el sentido (JST-258: QA de la 0.9.0 con Gemini Nano)", () => {
  const nombres = ["CMO", "Contenido", "Chief of staff", "QA", "Líder técnico", "Integración y CI", "Betalandia", "JSTM", "Migo", "El Mirador"];
  const grandes = "Los más grandes: «pixel agent», con 120 tareas; y «Sincronizar Jira: CORE y épicas», que corrió 63 veces.";

  it("bota las frases de la QA: mismos números y nombres, pero otro sentido", () => {
    expect(revisarFraseIa("En cola quedan 63: 56 bloqueadas y 7 por empezar; 11 esperan algo tuyo.", "Quedan en espera 63 tareas: 56 están bloqueadas y 7 esperando que empieces; 11 tareas esperan tu acción.", nombres, "cola")).toEqual(["se lo atribuye al usuario"]);
    expect(revisarFraseIa("JSTM, 4, todas bloqueadas; lo que más espera es «pixel agent», con 2 tareas.", "En JSTM hay 4 tareas pendientes, todas bloqueadas. La prioridad es «pixel agent», con 2 tareas.", nombres, "cola")).toEqual(["agrega una idea («prioridad»)"]);
    expect(revisarFraseIa("Migo, 41, 37 bloqueadas; lo que más espera es «Sincronizar Migo con GitHub…», con 6 tareas.", "En Migo quedan 41 tareas pendientes, de las que 37 están bloqueadas. La tarea más esperada es «Sincronizar Migo con GitHub…», con 6 tareas.", nombres, "cola")).toEqual(["agrega una idea («más esperada»)"]);
    expect(revisarFraseIa(grandes, "El que más se ejecutó fue «pixel agent», con 120 tareas, y «Sincronizar Jira: CORE y épicas», que corrió 63 veces.", nombres, "hecho")).toEqual(["cambia qué corrió"]);
  });

  it("y las de la medición con Gemini Nano: un agente que pasa a ser una actividad, «una» que pasa a ser «algunas»", () => {
    const enBet = "En Betalandia: Integración y CI, 54 minutos con «Commit»; QA, 53 minutos con «Capturas T048: los 23 casos de prueba del login».";
    expect(revisarFraseIa(enBet, "En Betalandia se enfocaron en Integración y CI, usando «Commit» por 54 minutos, y en QA, con «Capturas T048: los 23 casos de prueba del login», durante 53 minutos.", nombres, "trabajan")).toEqual(["cambia quién es quién (hace «Integración y CI»)"]);
    expect(revisarFraseIa("En JSTM: QA, una hora y media con «QA de Oficina global 0.8.0».", "En JSTM, se dedicaron a QA por una hora y media con «QA de Oficina global 0.8.0».", nombres, "trabajan")).toEqual(["cambia quién es quién (hace «QA»)"]);
    expect(revisarFraseIa(enBet, "En Betalandia, Integración y CI lleva 54 minutos con «Commit» y QA, 53 minutos con «Capturas T048: los 23 casos de prueba del login».", nombres, "trabajan")).toEqual([]);
    expect(revisarFraseIa("En cola quedan 41: 37 bloqueadas y 4 por empezar; una espera algo tuyo.", "Quedan 41 tareas pendientes: 37 están bloqueadas y 4 están listas para empezar. Algunas esperan un poco de tu parte.", nombres, "cola")).toEqual(["cambia cuántos («algunas»)", "agrega una idea («lista»)"]);
  });

  it("deja pasar las otras frases reales de esas lecturas, que dicen lo mismo con otras palabras", () => {
    const reales: Array<[Seccion, string, string]> = [
      ["toca", "Te esperan 15 cosas. La más antigua: CMO de El Mirador te pregunta: ¿Con qué usuario quedó la cuenta de pruebas? Espera desde el 3 de octubre a las 19:32.", "Tienes 15 cosas pendientes. La más antigua es que el CMO de El Mirador pregunte: ¿Con qué usuario quedó la cuenta de pruebas? Espera desde el 3 de octubre a las 19:32."],
      ["toca", "Después, Contenido de El Mirador te pregunta: ¿Apruebas la versión 4 para publicarla desde el lunes 26?", "Luego, Contenido de El Mirador pregunta: ¿Apruebas la versión 4 para publicarla desde el lunes 26?"],
      ["hecho", "Se terminaron 464 tareas de 69 pedidos: 216 en JSTM, 198 en Betalandia y 50 en Migo.", "Completamos 464 tareas de 69 pedidos: 216 en JSTM, 198 en Betalandia y 50 en Migo."],
      ["hecho", grandes, "De las más grandes, destacaron «pixel agent», con 120 tareas, y «Sincronizar Jira: CORE y épicas», que se ejecutó 63 veces."],
      ["trabajan", "Trabajan 3: 2 en Betalandia y 1 en JSTM.", "Actualmente están 3 agentes trabajando: 2 en Betalandia y 1 en JSTM."],
      ["trabajan", "Lleva más: QA de JSTM, 3 horas con «QA de Oficina global 0.8.0».", "QA de JSTM lleva más tiempo, con 3 horas dedicadas a «QA de Oficina global 0.8.0»."],
      ["trabajan", "Lleva más: QA de JSTM, 2 horas con «QA de Oficina global 0.8.0».", "El que lleva más es QA de JSTM, 2 horas con «QA de Oficina global 0.8.0»."],
      ["cola", "En cola quedan 63: 56 bloqueadas y 7 por empezar; 11 esperan algo tuyo.", "Tenemos 63 tareas pendientes: 56 bloqueadas y 7 esperando a empezar. ¡Y 11 esperan tu toque!"],
      ["cola", "En cola quedan 63: 56 bloqueadas y 7 por empezar; 11 esperan algo tuyo.", "Quedan pendientes 63 tareas: 56 bloqueadas y 7 por empezar. 11 de ellas esperan tu atención."],
      ["cola", "7 esperan a una que ya se está haciendo, 32 a otra de la cola y una está lista para empezar.", "7 tareas están esperando una que ya se está realizando, y 32 más esperan su turno en la cola. Otra ya está lista para comenzar."],
      ["cola", "El Mirador, 2, todas bloqueadas; lo que más espera es «Paperclip onboarding», con 2 tareas.", "En El Mirador hay 2 tareas pendientes, todas bloqueadas. Está esperando «Paperclip onboarding», con 2 tareas."],
      ["cierre", "Eso es todo. Lo primero: responderle a CMO de El Mirador.", "Eso es todo por ahora. Lo primero es contestarle a CMO de El Mirador."],
      // De la medición con Gemini Nano (jst258/medir.py): una sola mención al usuario, y el consejo que ya era la armada.
      ["cola", "En cola quedan 63: 56 bloqueadas y 7 por empezar; 11 esperan algo tuyo.", "Quedan 63 tareas pendientes: 56 están bloqueadas y 7 esperan que comiencen. 11 esperan que tú hagas algo."],
      ["cierre", "Eso es todo. Lo primero: responderle a CMO de El Mirador.", "Y eso es todo por ahora. Primero, deberíamos responder a CMO de El Mirador."],
    ];
    for (const [sec, a, ia] of reales) expect(revisarFraseIa(a, ia, nombres, sec), ia).toEqual([]);
  });

  it("la 2.ª persona se cuenta fuera de los títulos y de las preguntas; en «Lo que te toca» y el cierre todo ya es del usuario", () => {
    expect(deTi("Te esperan 2 cosas. CMO te pregunta: ¿Apruebas la versión 4?")).toBe(2);
    expect(deTi("Lleva más: QA, con «Revisa tu PR».")).toBe(0);
    expect(deTi("Te cuento: se terminaron 15 tareas.")).toBe(0);
    expect(deTi("Estas 3 están listas.")).toBe(0);
    expect(deTi("Estás al día y tienes 3 por revisar.")).toBe(2);
    expect(deTi("11 esperan que tú hagas algo.")).toBe(1);
    expect(deTi("7 esperan que empieces; 11, algo tuyo.")).toBe(2);
    expect(revisarFraseIa("Trabajan 3: 2 en Betalandia y 1 en JSTM.", "Tienes 3 trabajando: 2 en Betalandia y 1 en JSTM.", nombres, "trabajan")).toContain("se lo atribuye al usuario");
    expect(revisarFraseIa("En cola quedan 20: 15 bloqueadas y 5 por empezar.", "Hay 20 en cola: 15 bloqueadas y 5 que debes empezar.", nombres, "cola")).toContain("se lo atribuye al usuario");
    expect(revisarFraseIa("Se terminaron 4 tareas de un pedido: «pixel agent».", "Terminaste 4 tareas de un pedido: «pixel agent».", nombres, "hecho")).toContain("se lo atribuye al usuario");
    expect(revisarFraseIa("Eso es todo. Lo primero: responderle a CMO de El Mirador.", "Eso es todo. Lo primero que tienes que hacer es responderle a CMO de El Mirador.", nombres, "cierre")).toEqual([]);
    expect(revisarFraseIa("Después, CMO de El Mirador: revisar la versión 4.", "Después, CMO de El Mirador te pide que revises la versión 4.", nombres, "toca")).toEqual([]);
    // Sin la parte, se revisa como si no fuera del usuario (lo más estricto).
    expect(revisarFraseIa("Eso es todo. Lo primero: responderle a CMO de El Mirador.", "Eso es todo. Lo primero que tienes que hacer es responderle a CMO de El Mirador.", nombres)).toContain("se lo atribuye al usuario");
  });

  it("no agrega una prioridad, una urgencia ni «la más esperada»; lo que ya decía la armada puede quedar", () => {
    expect(ideasDe("Lo más urgente es «Revisar lo importante», y es prioritario.")).toEqual(["urgente", "prioritario"]);
    expect(ideasDe("La tarea más esperada; lo que más espera.")).toEqual(["más esperada"]);
    expect(revisarFraseIa("Trabaja uno: QA de JSTM, 2 horas con «QA de Oficina global 0.8.0».", "Lo importante: QA de JSTM lleva 2 horas con «QA de Oficina global 0.8.0».", nombres, "trabajan")).toEqual(["agrega una idea («importante»)"]);
    expect(revisarFraseIa("Te espera una cosa: CMO de El Mirador te pregunta: ¿Es urgente la versión 4? Espera desde ayer.", "Tienes una cosa: CMO de El Mirador te pregunta: ¿Es urgente la versión 4? Espera desde ayer.", nombres, "toca")).toEqual([]);
    expect(revisarFraseIa("En cola quedan 4, todas bloqueadas.", "Quedan 4 en cola, todas bloqueadas: conviene revisarlas.", nombres, "cola")).toEqual(["agrega una idea («conviene»)"]);
    // En el cierre la armada ya es un consejo («Lo primero: …»); una prioridad, no.
    expect(revisarFraseIa("Eso es todo. Lo primero: responderle a CMO de El Mirador.", "Eso es todo. Te recomiendo responderle primero a CMO de El Mirador.", nombres, "cierre")).toEqual([]);
    expect(revisarFraseIa("Eso es todo. Lo primero: responderle a CMO de El Mirador.", "Eso es todo. Lo más urgente: responderle a CMO de El Mirador.", nombres, "cierre")).toEqual(["agrega una idea («urgente»)"]);
  });

  it("«corrió N veces» es de su rutina, y cada número sigue con su título", () => {
    expect(duenosDeVeces(grandes)).toEqual(["Sincronizar Jira: CORE y épicas", "Sincronizar Jira: CORE y épicas"]);
    expect(duenosDeVeces("Se ejecutó «A» 3 veces.")).toEqual(["", "A"]);
    expect(numerosPegados(grandes)).toEqual([["pixel agent", "120"], ["Sincronizar Jira: CORE y épicas", "63"]]);
    // Otro orden u otras palabras: sirve.
    expect(revisarFraseIa(grandes, "«Sincronizar Jira: CORE y épicas» se ejecutó 63 veces y «pixel agent» tuvo 120 tareas.", nombres, "hecho")).toEqual([]);
    expect(revisarFraseIa("JSTM, 216: «pixel agent», con 120 tareas; «problema de ram con chrome», con 44 tareas; y 12 pedidos más.", "En JSTM, 216: «pixel agent» con 120 tareas, «problema de ram con chrome» con 44, y 12 pedidos más.", nombres, "hecho")).toEqual([]);
    expect(revisarFraseIa("Migo, 50: «A», con 11 tareas; «B», con 10 tareas; y 16 pedidos más.", "En Migo, 50: hubo 11 tareas de «A», 10 de «B» y 16 pedidos más.", nombres, "hecho")).toEqual([]);
    // Los números cambiados de título, o las veces de otro: no.
    expect(revisarFraseIa(grandes, "Los más grandes: «pixel agent», con 63 tareas, y «Sincronizar Jira: CORE y épicas», que corrió 120 veces.", nombres, "hecho")).toEqual(["cambia de quién es un número (120)"]);
    expect(revisarFraseIa(grandes, "Se ejecutaron «pixel agent», con 120 tareas, y «Sincronizar Jira: CORE y épicas», 63 veces.", nombres, "hecho")).toContain("cambia qué corrió");
    expect(revisarFraseIa("Los más grandes: «A», con 7 tareas; y «B», con 6 tareas.", "Los más grandes: «A», con 7 tareas, y «B», que corrió con 6 tareas.", nombres, "hecho")).toEqual(["cambia qué corrió"]);
  });

  describe("«lista para empezar» y que algo avanza (JST-264: re-QA de la 0.9.2 con Gemini Nano)", () => {
    const cola = "En cola quedan 63: 56 bloqueadas y 7 por empezar; 13 esperan algo tuyo.";
    const lleva = "Lleva más: QA de JSTM, 4 horas con «QA de Oficina global 0.8.0».";
    const enCurso = "7 esperan a una que ya se está haciendo, 32 a otra de la cola y una está lista para empezar.";

    it("bota las 2 frases de la QA: «por empezar» no es «lista para empezar», y «lleva más» no es «avanza más»", () => {
      expect(revisarFraseIa(cola, "Quedan 63 tareas por hacer. Tenemos 56 bloqueadas y 7 que están listas para empezar. Además, 13 tareas esperan algo de tu parte.", nombres, "cola")).toEqual(["agrega una idea («lista»)"]);
      expect(revisarFraseIa(lleva, "QA de JSTM está avanzando más, lleva 4 horas con «QA de Oficina global 0.8.0».", nombres, "trabajan")).toEqual(["agrega una idea («avanza»)"]);
      // Y la de la medición de JST-258 que pasaba, con el otro prompt.
      expect(revisarFraseIa("En cola quedan 63: 56 bloqueadas y 7 por empezar; 11 esperan algo tuyo.", "Quedan 63 tareas pendientes: 56 están bloqueadas y 7 están listas para empezar. 11 de ellas esperan tu aprobación.", nombres, "cola")).toEqual(["agrega una idea («lista»)"]);
      // Otras palabras de lo mismo.
      expect(revisarFraseIa(cola, "Quedan 63: 56 bloqueadas y 7 preparadas para empezar; 13 esperan algo tuyo.", nombres, "cola")).toEqual(["agrega una idea («lista»)"]);
      expect(revisarFraseIa(lleva, "QA de JSTM progresa con «QA de Oficina global 0.8.0» hace 4 horas.", nombres, "trabajan")).toEqual(["agrega una idea («avanza»)"]);
      expect(revisarFraseIa(lleva, "El más rápido es QA de JSTM, 4 horas con «QA de Oficina global 0.8.0».", nombres, "trabajan")).toEqual(["agrega una idea («rapido»)"]);
    });

    it("deja pasar «lista» donde la armada ya lo decía, «avanzando» por «se está haciendo» y «avanzó» en «Lo que se hizo»", () => {
      expect(revisarFraseIa(enCurso, "7 tareas aguardan una que ya se está avanzando, y 32 esperan otro pedido de la cola. Una tarea ya está lista para comenzar.", nombres, "cola")).toEqual([]);
      expect(revisarFraseIa(enCurso, "Hay 7 tareas esperando una que ya está en proceso, 32 en la cola y una lista para comenzar.", nombres, "cola")).toEqual([]);
      expect(revisarFraseIa(cola, "Quedan 63 tareas: 56 bloqueadas y 7 esperando a empezar. Y 13 esperan algo de tu parte.", nombres, "cola")).toEqual([]);
      expect(revisarFraseIa(lleva, "QA de JSTM lleva más tiempo, con 4 horas dedicadas a «QA de Oficina global 0.8.0».", nombres, "trabajan")).toEqual([]);
      expect(revisarFraseIa(grandes, "Lo que más avanzó fue «pixel agent», con 120 tareas, y «Sincronizar Jira: CORE y épicas», que corrió 63 veces.", nombres, "hecho")).toEqual([]);
      // Una «lista» de más, no.
      expect(revisarFraseIa(enCurso, "7 esperan una que ya está en proceso, 32 están en la cola y hay una lista lista para empezar.", nombres, "cola")).toEqual(["agrega una idea («lista»)"]);
      expect(ideasDe("Una está lista y 2 listas; se está haciendo y avanza.")).toEqual(["lista", "lista", "avanza", "avanza"]);
      expect(ideasDe("Avanzó «Lista de avances».", true, false)).toEqual([]);
    });
  });

  it("el ejemplo del prompt pasa su propia revisión", () => {
    const armadas = EJEMPLO_PEDIDO_RESUMEN.split("\n").filter((l) => /^\d+\. /.test(l)).map((l) => l.replace(/^\d+\. /, ""));
    const frases = (JSON.parse(EJEMPLO_RESPUESTA_RESUMEN) as { frases: string[] }).frases;
    expect(frases).toHaveLength(armadas.length);
    armadas.forEach((a, i) => expect(revisarFraseIa(a, frases[i], nombres, "hecho")).toEqual([]));
  });
});

// ---------------------------------------------------------------------------

describe("la IA de Chrome no escribe palabras que no existen (JST-307: re-QA JST-280 con Gemini Nano)", () => {
  const nombres = ["QA", "Líder técnico", "Integración y CI", "Betalandia", "JSTM"];
  const titulo = "«respaldo semanal de ejemplo»";

  it("bota «Concluímos» y «Progremamos» (de la QA y de la medición), y deja «concluimos»", () => {
    expect(revisarFraseIa(`Se terminó una tarea de un pedido: ${titulo}.`, `Concluímos una tarea de un pedido: ${titulo}.`, nombres, "hecho")).toEqual(["palabra que no existe («Concluímos»)"]);
    expect(revisarFraseIa("Se terminaron 198 tareas de 36 pedidos.", "Progremamos 198 tareas de 36 pedidos.", nombres, "hecho")).toEqual(["palabra que no existe («Progremamos»)"]);
    expect(revisarFraseIa(`Se terminó una tarea de un pedido: ${titulo}.`, `Concluimos una tarea de un pedido: ${titulo}.`, nombres, "hecho")).toEqual([]);
    expect(palabrasNuevasRaras("Se terminaron 4 tareas.", "Concluímos y progremamos 4 tareas.")).toEqual(["Concluímos", "progremamos"]);
    // Y queda anotado en el registro de la IA, con la parte que vuelve a las armadas.
    const leido = leerParteIa(JSON.stringify({ frases: [`Concluímos una tarea de un pedido: ${titulo}.`] }), [{ sec: "hecho", texto: `Se terminó una tarea de un pedido: ${titulo}.` }], nombres);
    expect(leido).toEqual({ frases: null, mal: ["1: palabra que no existe («Concluímos»)"] });
  });

  it("lo que viene de la armada no cuenta: los títulos, los nombres, «reseed» o «mergeaste»", () => {
    expect(revisarFraseIa(`En Betalandia: Integración y CI, 25 minutos con ${titulo}.`, `En Betalandia, Integración y CI lleva 25 minutos con ${titulo}.`, nombres, "trabajan")).toEqual([]);
    expect(revisarFraseIa("Eso es todo. Lo primero: revisar el reseed del ambiente de pruebas.", "Eso es todo por ahora. Lo primero: revisar el reseed del ambiente de pruebas.", nombres, "cierre")).toEqual([]);
    expect(revisarFraseIa("Después, Líder técnico de Betalandia te pregunta: ¿Ya mergeaste el PR 31 en develop? Desde hace un día.", "Luego, Líder técnico de Betalandia te pregunta: ¿Ya mergeaste el PR 31 en develop? Desde hace un día.", nombres, "toca")).toEqual([]);
    // Pero no una que la armada no trae, aunque esté en otra frase.
    expect(palabrasNuevasRaras("Eso es todo.", "Eso es todo, reseed.")).toEqual(["reseed"]);
  });
});
