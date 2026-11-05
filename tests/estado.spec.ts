import { describe, expect, it } from "vitest";
import { agenteDeItem, armarEmpresa, contar, estadoBase, esperasPorAgente, tareasFaltantes, type DatosEmpresa } from "../src/estado.js";
import { partesPorEvento } from "../src/sincronizador.js";
import { contarVista, vistaDe } from "../src/vista.js";
import { fotoDe, llegadas } from "../src/avisos.js";
import type { AgenteApi, EventoVivo, ItemAtencion, RunVivo } from "../src/shared.js";

const EMPRESA = { id: "c1", name: "JSTM", issuePrefix: "JST", status: "active" };

function agente(id: string, extra: Partial<AgenteApi> = {}): AgenteApi {
  return { id, companyId: "c1", name: `Agente ${id}`, status: "idle", adapterType: "claude_local", ...extra };
}

function run(id: string, agentId: string, extra: Partial<RunVivo> = {}): RunVivo {
  return { id, companyId: "c1", agentId, status: "running", issueId: "i1", createdAt: "2026-10-20T10:00:00Z", startedAt: "2026-10-20T10:00:01Z", ...extra };
}

function tarjeta(agentId: string | null, extra: Partial<ItemAtencion> = {}): ItemAtencion {
  return {
    id: `issue_thread_interaction:${agentId}`,
    sourceKind: "issue_thread_interaction",
    subject: { kind: "interaction", id: "x1", title: "¿Apruebas?", href: "/JST/issues/JST-9#interaction-x1", metadata: { kind: "request_confirmation", createdByAgentId: agentId } },
    relatedIssue: { kind: "issue", id: "i9", identifier: "JST-9", metadata: { assigneeAgentId: agentId } },
    createdAt: "2026-10-20T09:00:00Z",
    ...extra,
  };
}

describe("estadoBase", () => {
  it("en pausa gana a todo, aunque quede un run", () => {
    expect(estadoBase(agente("a", { status: "paused" }), [run("r", "a")])).toBe("pausa");
  });
  it("con error gana a un run vivo (design-spec §5): el reintento en cola no lo tapa", () => {
    expect(estadoBase(agente("a", { status: "error" }), [run("r", "a", { status: "queued", startedAt: null })])).toBe("error");
    expect(estadoBase(agente("a", { status: "error" }), [run("r", "a")])).toBe("error");
  });
  it("cuando el reintento arranca, el host pasa el agente a running: trabajando", () => {
    expect(estadoBase(agente("a", { status: "running" }), [run("r", "a")])).toBe("trabajando");
  });
  it("status running sin run en la lista (carrera) también es trabajando", () => {
    expect(estadoBase(agente("a", { status: "running" }), [])).toBe("trabajando");
  });
  it("error sin runs es con error; idle o active es libre", () => {
    expect(estadoBase(agente("a", { status: "error" }), [])).toBe("error");
    expect(estadoBase(agente("a", { status: "idle" }), [])).toBe("libre");
    expect(estadoBase(agente("a", { status: "active" }), [])).toBe("libre");
  });
});

describe("«Te necesita»", () => {
  const agentes = [agente("a"), agente("b", { name: "Hermes", adapterType: "hermes_gateway" })];

  it("une la tarjeta con el responsable de la tarea relacionada", () => {
    expect(agenteDeItem(tarjeta("a"), agentes)).toBe("a");
  });

  it("si la tarea es de otro, usa quien creó la tarjeta; si no, el nombre de origen", () => {
    const item = tarjeta("a", { relatedIssue: { id: "i9", metadata: { assigneeAgentId: null } } });
    expect(agenteDeItem(item, agentes)).toBe("a");
    const decision: ItemAtencion = { id: "d", sourceKind: "decision", subject: { kind: "decision" }, originAgentName: "Hermes" };
    expect(agenteDeItem(decision, agentes)).toBe("b");
  });

  it("una revisión cuyo sujeto es la tarea se une por su responsable", () => {
    const revision: ItemAtencion = { id: "r", sourceKind: "review", subject: { kind: "issue", id: "i3", identifier: "JST-3", metadata: { assigneeAgentId: "b" } } };
    expect(esperasPorAgente([revision], agentes).porAgente.get("b")?.[0]).toMatchObject({ tipo: "revision", identifier: "JST-3" });
  });

  it("ignora errores de run y alertas (ya son el estado «con error») y separa lo que no tiene agente", () => {
    const items: ItemAtencion[] = [
      { id: "f", sourceKind: "failed_run", subject: { kind: "run", metadata: {} }, relatedIssue: { id: "i1", metadata: { assigneeAgentId: "a" } } },
      { id: "p", sourceKind: "approval", subject: { kind: "approval", title: "Contratar", metadata: {} } },
    ];
    const r = esperasPorAgente(items, agentes);
    expect(r.porAgente.size).toBe(0);
    expect(r.sinAgente).toHaveLength(1);
  });
});

describe("armarEmpresa", () => {
  const datos: DatosEmpresa = {
    empresa: EMPRESA,
    agentes: [agente("a"), agente("b", { status: "error", errorReason: "HTTP 401" }), agente("c", { status: "terminated" }), agente("h", { adapterType: "hermes_gateway" })],
    runs: [run("r2", "a", { status: "queued", issueId: "i2", createdAt: "2026-10-20T10:05:00Z", startedAt: null }), run("r1", "a"), run("rh", "h", { issueId: "i3" })],
    atencion: [tarjeta("a")],
  };
  const tareas = new Map([
    ["i1", { id: "i1", identifier: "JST-1", title: "Uno" }],
    ["i3", { id: "i3", identifier: "JST-3", title: "Tres" }],
  ]);
  const oficina = armarEmpresa(datos, tareas);

  it("deja fuera a los despedidos", () => {
    expect(oficina.map((a) => a.id)).toEqual(["a", "b", "h"]);
  });

  it("trabajando muestra el run que corre (no el de la cola), con código y enlaces", () => {
    const a = oficina.find((x) => x.id === "a")!;
    expect(a.base).toBe("trabajando");
    expect(a.run).toMatchObject({ id: "r1", identifier: "JST-1", enCola: false, href: "/JST/agents/a/runs/r1", tareaHref: "/JST/issues/JST-1" });
    expect(a.runsExtra).toBe(1);
    expect(a.teNecesita).toHaveLength(1);
  });

  it("usa la tarea que un run sin issueId tomó después", () => {
    const sinTareaInicial: DatosEmpresa = {
      ...datos,
      agentes: [agente("a")],
      runs: [run("r0", "a", { issueId: null, invocationSource: "on_demand" })],
      atencion: [],
    };
    const tomada = new Map([["i9", { id: "i9", identifier: "JST-9", title: "Tarea tomada", status: "in_progress" }]]);
    const [a] = armarEmpresa(sinTareaInicial, tomada, new Map(), new Map([["r0", "i9"]]));
    expect(a?.run).toMatchObject({
      id: "r0",
      issueId: "i9",
      identifier: "JST-9",
      titulo: "Tarea tomada",
      tareaHref: "/JST/issues/JST-9",
      tareaStatus: "in_progress",
      invocationSource: "on_demand",
    });
  });

  it("Hermes sale de los mismos runs que los demás", () => {
    const h = oficina.find((x) => x.id === "h")!;
    expect(h).toMatchObject({ esHermes: true, base: "trabajando" });
    expect(h.run?.identifier).toBe("JST-3");
  });

  it("con error trae el motivo; los contadores son independientes", () => {
    expect(oficina.find((x) => x.id === "b")).toMatchObject({ base: "error", motivo: "HTTP 401" });
    expect(contar(oficina)).toEqual({ agentes: 3, trabajando: 2, teNecesitan: 1, conError: 1, enPausa: 0, libres: 0 });
  });

  it("sin feed de «Te toca» (403) nadie te necesita, pero el resto sigue", () => {
    const sinFeed = armarEmpresa({ ...datos, atencion: null }, tareas);
    expect(sinFeed.every((a) => a.teNecesita.length === 0)).toBe(true);
    expect(sinFeed.find((x) => x.id === "a")?.base).toBe("trabajando");
  });

  it("cargo: el title; sin title, el rol como lo escribe Paperclip (JST-74)", () => {
    const cargos = armarEmpresa(
      { ...datos, agentes: [agente("t", { role: "ceo", title: "Líder Técnico" }), agente("c", { role: "ceo" }), agente("d", { role: "devops", title: "" }), agente("x", { role: "nuevo" }), agente("n")] },
      tareas,
    ).map((a) => [a.id, a.rol]);
    expect(Object.fromEntries(cargos)).toEqual({ t: "Líder Técnico", c: "CEO", d: "DevOps", x: "nuevo", n: null });
  });

  it("ordena por nombre, con el id para desempatar: el agente que se actualiza no mueve a los demás (JST-78)", () => {
    const nombres = (orden: string[]) =>
      armarEmpresa({ ...datos, agentes: orden.map((name) => agente(name, { name })), atencion: [] }, tareas).map((a) => a.nombre);
    // Orden de `/agents` antes y después de pausar y reanudar a Revisor (MIG, JST-76).
    const antes = nombres(["Revisor", "Ingeniero", "Qa", "Disenador", "RevisorCodigo", "Ceo - cto", "Hermes", "Speckit"]);
    const despues = nombres(["Ingeniero", "Qa", "Disenador", "RevisorCodigo", "Ceo - cto", "Hermes", "Speckit", "Revisor"]);
    expect(antes).toEqual(["Ceo - cto", "Disenador", "Hermes", "Ingeniero", "Qa", "Revisor", "RevisorCodigo", "Speckit"]);
    expect(despues).toEqual(antes);
    const gemelos = (ids: string[]) => armarEmpresa({ ...datos, agentes: ids.map((id) => agente(id, { name: "Qa" })), atencion: [] }, tareas).map((a) => a.id);
    expect(gemelos(["q2", "q1"])).toEqual(["q1", "q2"]);
    expect(gemelos(["q1", "q2"])).toEqual(["q1", "q2"]);
  });

  it("pide solo los códigos de tarea que faltan", () => {
    expect(tareasFaltantes([datos], tareas)).toEqual(["i2"]);
  });
});

describe("partesPorEvento", () => {
  const ev = (type: string, payload: Record<string, unknown> = {}): EventoVivo => ({ id: 1, companyId: "c1", type, createdAt: "2026-10-20T10:00:00Z", payload });

  it("runs por eventos de run; nada por logs ni progreso", () => {
    expect(partesPorEvento(ev("heartbeat.run.queued"))).toEqual(["runs"]);
    expect(partesPorEvento(ev("heartbeat.run.status"))).toEqual(["runs"]);
    expect(partesPorEvento(ev("heartbeat.run.log"))).toBeNull();
    expect(partesPorEvento(ev("heartbeat.run.progress"))).toBeNull();
  });

  it("actividad: tarjetas y tareas → «Te toca»; pausa de agente → agentes; comentarios → nada", () => {
    expect(partesPorEvento(ev("activity.logged", { action: "issue.thread_interaction_created" }))).toEqual(["atencion"]);
    expect(partesPorEvento(ev("activity.logged", { action: "issue.updated" }))).toEqual(["atencion"]);
    expect(partesPorEvento(ev("activity.logged", { action: "agent.paused" }))).toEqual(["agentes"]);
    expect(partesPorEvento(ev("activity.logged", { action: "approval.approved" }))).toEqual(["agentes", "atencion"]);
    expect(partesPorEvento(ev("activity.logged", { action: "issue.comment_added" }))).toBeNull();
  });
});

describe("«Te necesita» para responder sin salir (0.2.0, JST-97)", () => {
  const aprobacion = (agentId: string, extra: Partial<ItemAtencion> = {}): ItemAtencion => ({
    id: "approval:approval:ap1",
    sourceKind: "approval",
    subject: { kind: "approval", id: "ap1", title: "Aprobar el plan", href: "/JST/approvals/ap1", metadata: { type: "request_board_approval", issueId: "i7", requestedByAgentId: agentId } },
    relatedIssue: null,
    originAgentName: `Agente ${agentId}`,
    createdAt: "2026-10-20T08:00:00Z",
    ...extra,
  });

  it("guarda el id y la clase de la tarjeta, y el título de la tarea", () => {
    const { porAgente } = esperasPorAgente([tarjeta("a")], [agente("a")]);
    expect(porAgente.get("a")?.[0]).toMatchObject({ tipo: "tarjeta", sujetoId: "x1", clase: "request_confirmation", issueId: "i9", identifier: "JST-9", titulo: "¿Apruebas?" });
  });

  it("una aprobación no trae `relatedIssue`: la tarea sale de `metadata.issueId` y su código de lo ya leído", () => {
    const tareas = new Map([["i7", { id: "i7", identifier: "JST-7", title: "Plan de acceso" }]]);
    const { porAgente } = esperasPorAgente([aprobacion("a")], [agente("a")], tareas);
    expect(porAgente.get("a")?.[0]).toMatchObject({ tipo: "aprobacion", sujetoId: "ap1", clase: "request_board_approval", issueId: "i7", identifier: "JST-7", tituloTarea: "Plan de acceso" });
  });

  it("pide el código de la tarea de una aprobación que espera", () => {
    const datos: DatosEmpresa = { empresa: EMPRESA, agentes: [agente("a")], runs: [], atencion: [aprobacion("a")] };
    expect(tareasFaltantes([datos], new Map())).toEqual(["i7"]);
  });

  it("las esperas de un agente van de la más antigua a la más nueva (el orden de la ventana)", () => {
    const nueva = tarjeta("a", { id: "t2", createdAt: "2026-10-20T11:00:00Z" });
    const vieja = tarjeta("a", { id: "t1", createdAt: "2026-10-20T07:00:00Z" });
    const { porAgente } = esperasPorAgente([nueva, aprobacion("a"), vieja], [agente("a")]);
    expect(porAgente.get("a")?.map((e) => e.itemId)).toEqual(["t1", "approval:approval:ap1", "t2"]);
  });
});

describe("un bloqueo no levanta la mano (JST-135)", () => {
  // Como BET-414 en el feed real del 21-10: sin tareas que la bloqueen, el árbol
  // detenido y el mismo agente como responsable. Lo que el usuario tenía que
  // responder era una tarjeta en otra tarea.
  const bloqueo = (agentId: string): ItemAtencion => ({
    id: "blocker_attention:blocker:i14",
    sourceKind: "blocker_attention",
    subject: { kind: "issue", id: "i14", identifier: "JST-14", title: "QA de la ficha", href: "/JST/issues/JST-14", metadata: { assigneeAgentId: agentId } },
    relatedIssue: { kind: "issue", id: "i14", identifier: "JST-14", title: "QA de la ficha", metadata: { assigneeAgentId: agentId } },
    createdAt: "2026-10-17T05:09:11Z",
  });
  const agenteYVista = (atencion: ItemAtencion[]) => {
    const [a] = armarEmpresa({ empresa: EMPRESA, agentes: [agente("a")], runs: [], atencion }, new Map());
    return { a: a!, v: vistaDe(a!, "JSTM") };
  };

  it("con un `blocker_attention` el agente queda sin «te necesita»: sin mano, sin contar y sin aviso", () => {
    const { a, v } = agenteYVista([bloqueo("a")]);
    expect(a.teNecesita).toEqual([]);
    expect(v).toMatchObject({ need: false, st: "libre" });
    expect(contar([a]).teNecesitan).toBe(0);
    expect(contarVista([v]).toca).toBe(0);
    const antes = fotoDe([agenteYVista([]).v], () => true);
    expect(llegadas(antes, fotoDe([v], () => true))).toEqual([]);
    expect(esperasPorAgente([bloqueo("a")], [agente("a")]).sinAgente).toEqual([]);
  });

  it("con una tarjeta pendiente sigue con la mano arriba, aunque además tenga un bloqueo", () => {
    const { a, v } = agenteYVista([bloqueo("a"), tarjeta("a")]);
    expect(a.teNecesita.map((e) => e.tipo)).toEqual(["tarjeta"]);
    expect(v).toMatchObject({ need: true, st: "toca" });
    expect(contarVista([v]).toca).toBe(1);
    const antes = fotoDe([agenteYVista([bloqueo("a")]).v], () => true);
    expect(llegadas(antes, fotoDe([v], () => true))).toEqual(["a"]);
  });
});

describe("lo que espera, en palabras (JST-97)", () => {
  it("si la tarjeta no tiene título propio, la pregunta sale del resumen del feed", () => {
    const sinTitulo = tarjeta("a", { subject: { kind: "interaction", id: "x2", title: "Confirmation requested", metadata: { kind: "request_confirmation" } }, detail: { kind: "confirmation", promptExcerpt: "¿Sigo con la Fase 2?" } });
    const { porAgente } = esperasPorAgente([sinTitulo, tarjeta("a", { id: "t2" })], [agente("a")]);
    expect(porAgente.get("a")?.map((e) => e.titulo)).toEqual(["¿Sigo con la Fase 2?", "¿Apruebas?"]);
  });
  it("«Plan approval - …» va en español", () => {
    const plan = tarjeta("a", { subject: { kind: "interaction", id: "x3", title: "Plan approval - Board global", metadata: { kind: "request_confirmation" } } });
    expect(esperasPorAgente([plan], [agente("a")]).porAgente.get("a")?.[0]?.titulo).toBe("Aprobar el plan: Board global");
  });
});
