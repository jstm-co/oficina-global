import { afterEach, describe, expect, it, vi } from "vitest";
import { Sincronizador } from "../src/sincronizador.js";

const EMPRESAS = [
  { id: "c1", name: "Betalandia", issuePrefix: "BET", status: "active" },
  { id: "c2", name: "Migo", issuePrefix: "MIG", status: "active" },
];
const agente = (id: string, companyId: string) => ({ id, companyId, name: id, status: "idle", adapterType: "claude_local" });

/** API falsa: `falla` dice qué rutas responden 500. */
function api(falla: (ruta: string) => boolean) {
  return vi.fn(async (url: string) => {
    const ruta = url.replace(/^\/api/, "");
    const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
    if (falla(ruta)) return json({ error: "caída" }, 500);
    if (ruta === "/companies") return json(EMPRESAS);
    const m = /^\/companies\/(c\d)\/(agents|live-runs|attention)/.exec(ruta);
    if (m?.[2] === "agents") return json([agente(`${m[1]}-a`, m[1]!), agente(`${m[1]}-b`, m[1]!)]);
    if (m?.[2] === "live-runs") return json([]);
    if (m?.[2] === "attention") return json({ items: [] });
    return json({}, 404);
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Sincronizador: una empresa que no responde no tumba a las demás", () => {
  it("Migo cae: Betalandia sigue con sus agentes y Migo queda con error y sin contar", async () => {
    vi.stubGlobal("fetch", api((ruta) => ruta.startsWith("/companies/c2/agents")));
    const sync = new Sincronizador({ cx: { base: "" }, usarCanal: false });
    await sync.iniciar();
    expect(sync.agentes().map((a) => a.id)).toEqual(["c1-a", "c1-b"]);
    expect(sync.estadoEmpresa("c1")).toEqual({ cargando: false, error: null, sinAtencion: false });
    expect(sync.estadoEmpresa("c2").error).toBe("caída");
    sync.detener();
  });

  it("al reintentar, si ya responde, vuelve a contar", async () => {
    let caida = true;
    vi.stubGlobal("fetch", api((ruta) => caida && ruta.startsWith("/companies/c2/")));
    const sync = new Sincronizador({ cx: { base: "" }, usarCanal: false });
    await sync.iniciar();
    expect(sync.agentes()).toHaveLength(2);
    caida = false;
    await sync.reintentar();
    expect(sync.agentes()).toHaveLength(4);
    expect(sync.estadoEmpresa("c2").error).toBeNull();
    sync.detener();
  });

  it("si falla «Te toca», la empresa sigue a la vista pero queda sin «te necesita»", async () => {
    vi.stubGlobal("fetch", api((ruta) => ruta.startsWith("/companies/c1/attention")));
    const sync = new Sincronizador({ cx: { base: "" }, usarCanal: false });
    await sync.iniciar();
    expect(sync.agentes()).toHaveLength(4);
    expect(sync.estadoEmpresa("c1")).toMatchObject({ error: null, sinAtencion: true });
    expect(sync.estadoEmpresa("c2").sinAtencion).toBe(false);
    sync.detener();
  });

  it("si no se pueden listar las empresas, queda el error general y no hay agentes", async () => {
    vi.stubGlobal("fetch", api((ruta) => ruta === "/companies"));
    const sync = new Sincronizador({ cx: { base: "" }, usarCanal: false });
    await sync.iniciar();
    expect(sync.errorEmpresas).toBe("caída");
    expect(sync.agentes()).toEqual([]);
    sync.detener();
  });
});

describe("Sincronizador: agent.status trae el motivo y la hora del error sin esperar la revisión", () => {
  const VIEJO = "2026-10-20T09:00:00.000Z";
  const FALLO = "2026-10-20T16:00:00.500Z";

  type SocketFalso = { onopen?: () => void; onmessage?: (m: { data: string }) => void; onclose?: () => void; close: () => void };

  /**
   * Oficina con canal falso y el agente `c1-a` que devuelve `/agents` en cada
   * momento (`hermes`). `emitir` manda un evento por el canal de Betalandia.
   */
  async function oficina(inicial: Record<string, unknown>) {
    vi.useFakeTimers({ now: Date.parse(FALLO) });
    const estado: { hermes: Record<string, unknown> } = { hermes: { ...agente("c1-a", "c1"), ...inicial } };
    const base = api(() => false);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url === "/api/companies/c1/agents" ? { ok: true, status: 200, json: async () => [estado.hermes] } : base(url),
      ),
    );
    const sockets = new Map<string, SocketFalso>();
    const crearSocket = (url: string) => {
      const socket: SocketFalso = { close: () => socket.onclose?.() };
      sockets.set(/companies\/(c\d)\//.exec(url)![1]!, socket);
      queueMicrotask(() => socket.onopen?.());
      return socket as unknown as WebSocket;
    };
    const sync = new Sincronizador({ cx: { base: "", crearSocket }, respaldoMs: 600_000, sinCanalMs: 600_000 });
    await sync.iniciar();
    await vi.advanceTimersByTimeAsync(0);
    const emitir = (payload: Record<string, unknown>) =>
      sockets.get("c1")!.onmessage!({ data: JSON.stringify({ id: 1, companyId: "c1", type: "agent.status", createdAt: FALLO, payload }) });
    const ver = () => sync.agentes().find((a) => a.id === "c1-a")!;
    return { sync, estado, emitir, ver };
  }

  it("la ficha pasa del texto de respaldo al errorReason en la ventana de 1 s, con «desde» de ahora", async () => {
    const { sync, estado, emitir, ver } = await oficina({ updatedAt: VIEJO, lastHeartbeatAt: VIEJO, errorReason: null });
    expect(ver()).toMatchObject({ base: "libre", desde: VIEJO });

    // El run falla: el servidor guarda el agente y después emite el evento.
    estado.hermes = { ...estado.hermes, status: "error", errorReason: "Secret decryption failed", updatedAt: FALLO, lastHeartbeatAt: FALLO };
    emitir({ agentId: "c1-a", status: "error", lastHeartbeatAt: FALLO, outcome: "failed" });

    // Al tiro: con error, desde la hora del evento (no la de hace 7 h) y sin motivo todavía.
    expect(ver()).toMatchObject({ base: "error", desde: FALLO, motivo: null });

    // En la ventana de la actividad (1 s) llega el motivo, sin esperar la revisión de 60 s.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(ver()).toMatchObject({ base: "error", desde: FALLO, motivo: "Secret decryption failed" });
    expect(sync.metricas.llamadas.get("/companies/c1/agents")).toBe(2);
    sync.detener();
  });

  it("al volver a libre, «desde» es el latido del evento y el motivo viejo se borra", async () => {
    const { sync, estado, emitir, ver } = await oficina({ status: "error", errorReason: "Secret decryption failed", updatedAt: VIEJO, lastHeartbeatAt: VIEJO });
    expect(ver()).toMatchObject({ base: "error", motivo: "Secret decryption failed" });

    estado.hermes = { ...estado.hermes, status: "idle", errorReason: null, updatedAt: FALLO, lastHeartbeatAt: FALLO };
    emitir({ agentId: "c1-a", status: "idle", lastHeartbeatAt: FALLO, outcome: "succeeded" });
    expect(ver()).toMatchObject({ base: "libre", desde: FALLO, motivo: null });
    sync.detener();
  });
});

describe("Sincronizador: error completo y responder (0.2.0, JST-97)", () => {
  const RUN = { id: "r1", agentId: "c1-a", status: "failed", createdAt: "", startedAt: null, finishedAt: null, logBytes: 40_000, lastOutputBytes: 30_000 };

  it("lee el final del log una sola vez por run, desde `tamaño − 16 KB`, y descarta la primera línea cortada", async () => {
    const pedidos: string[] = [];
    const contenido = ['ortada"}', JSON.stringify({ ts: "2026-10-21T14:38:20Z", stream: "stderr", chunk: "FAIL src/x.spec.ts\n" })].join("\n");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        pedidos.push(url);
        return { ok: true, status: 200, json: async () => ({ runId: "r1", content: contenido }) };
      }),
    );
    const sync = new Sincronizador({ cx: { base: "" }, usarCanal: false });
    const lineas = await sync.finalLog(RUN);
    await sync.finalLog(RUN);
    expect(pedidos).toEqual([`/api/heartbeat-runs/r1/log?offset=${30_000 - 16_384}&limitBytes=16384`]);
    expect(lineas).toEqual([{ ts: "2026-10-21T14:38:20Z", error: true, texto: "FAIL src/x.spec.ts" }]);
  });

  it("sin log (404 o 0 bytes) es `null`; si falla, se puede reintentar", async () => {
    let status = 500;
    const pedir = vi.fn(async () => ({ ok: status < 400, status, json: async () => ({ error: "x", content: "" }) }));
    vi.stubGlobal("fetch", pedir);
    const sync = new Sincronizador({ cx: { base: "" }, usarCanal: false });
    expect(await sync.finalLog({ ...RUN, id: "r0", logBytes: 0, lastOutputBytes: null })).toBeNull();
    expect(pedir).not.toHaveBeenCalled();
    await expect(sync.finalLog(RUN)).rejects.toThrow();
    status = 404;
    expect(await sync.finalLog(RUN)).toBeNull();
    expect(pedir).toHaveBeenCalledTimes(2);
  });

  it("después de responder, vuelve a leer solo «Te toca» de esa empresa", async () => {
    const fetch = api(() => false);
    vi.stubGlobal("fetch", fetch);
    const sync = new Sincronizador({ cx: { base: "" }, usarCanal: false });
    await sync.iniciar();
    fetch.mockClear();
    let avisos = 0;
    sync.alCambiar(() => (avisos += 1));
    await sync.refrescarAtencion("c2");
    expect(fetch.mock.calls.map((c) => c[0])).toEqual(["/api/companies/c2/attention"]);
    expect(avisos).toBe(1);
    sync.detener();
  });
});

describe("Sincronizador: «En vivo» recién con el canal abierto (JST-131)", () => {
  type SocketFalso = { onopen?: () => void; onmessage?: (m: { data: string }) => void; onclose?: () => void; close: () => void };

  /**
   * Oficina con canales que abren cuando la prueba dice (o solos, con
   * `abrenSolos`). `orden` anota cada canal creado y cada lectura de agentes;
   * `antes` puede retener una lectura.
   */
  function conCanales({ abrenSolos = false, antes }: { abrenSolos?: boolean; antes?: (url: string) => Promise<void> | undefined } = {}) {
    const orden: string[] = [];
    const base = api(() => false);
    const fetch = vi.fn(async (url: string) => {
      if (url.endsWith("/agents")) orden.push(`lee:${/companies\/(c\d)\//.exec(url)![1]}`);
      await antes?.(url);
      return base(url);
    });
    vi.stubGlobal("fetch", fetch);
    const sockets = new Map<string, SocketFalso>();
    const crearSocket = (url: string) => {
      const id = /companies\/(c\d)\//.exec(url)![1]!;
      const socket: SocketFalso = { close: () => undefined };
      sockets.set(id, socket);
      orden.push(`canal:${id}`);
      if (abrenSolos) queueMicrotask(() => socket.onopen?.());
      return socket as unknown as WebSocket;
    };
    const sync = new Sincronizador({ cx: { base: "", crearSocket }, respaldoMs: 600_000, sinCanalMs: 600_000 });
    const lecturas = (id: string) => fetch.mock.calls.filter((c) => c[0] === `/api/companies/${id}/agents`).length;
    return { sync, sockets, orden, lecturas };
  }

  it("cada canal se crea antes de leer su empresa, y la empresa sigue «cargando» hasta que su canal abre", async () => {
    const { sync, sockets, orden } = conCanales();
    await sync.iniciar();
    expect(orden).toEqual(["canal:c1", "canal:c2", "lee:c1", "lee:c2"]);
    // Leídas pero sin canal: una entrega no llegaría, así que la página no dice «En vivo».
    expect(sync.agentes()).toHaveLength(4);
    expect(sync.estadoEmpresa("c1").cargando).toBe(true);
    sockets.get("c1")!.onopen!();
    expect(sync.estadoEmpresa("c1")).toEqual({ cargando: false, error: null, sinAtencion: false });
    expect(sync.estadoEmpresa("c2").cargando).toBe(true);
    sync.detener();
  });

  it("si el canal abre después de que volvió la lectura, relee la empresa; si abre con la lectura en camino, no", async () => {
    let soltar!: () => void;
    const retenida = new Promise<void>((r) => (soltar = r));
    const { sync, sockets, lecturas } = conCanales({ antes: (url) => (url === "/api/companies/c2/agents" ? retenida : undefined) });
    const inicio = sync.iniciar();
    await vi.waitFor(() => expect(sync.datos.has("c1")).toBe(true));
    sockets.get("c2")!.onopen!();
    sockets.get("c1")!.onopen!();
    soltar();
    await inicio;
    await vi.waitFor(() => expect(lecturas("c1")).toBe(2));
    expect(lecturas("c2")).toBe(1);
    expect(sync.estadoEmpresa("c2").cargando).toBe(false);
    sync.detener();
  });

  it("al volver la pestaña se relee una sola vez, aunque los canales abran mientras", async () => {
    const { sync, lecturas } = conCanales({ abrenSolos: true });
    await sync.iniciar();
    await vi.waitFor(() => expect(sync.canalesAbiertos()).toBe(2));
    expect(sync.estadoEmpresa("c1").cargando).toBe(false);
    sync.pausar();
    sync.reanudar();
    await vi.waitFor(() => expect(sync.canalesAbiertos()).toBe(2));
    await new Promise((r) => setTimeout(r, 10));
    expect([lecturas("c1"), lecturas("c2")]).toEqual([2, 2]);
    sync.detener();
  });

  it("`releyendo` (JST-137): en pausa y hasta que llega la relectura de la vuelta; ya es `false` en el aviso que la trae", async () => {
    let soltar!: () => void;
    let retener = false;
    const retenida = new Promise<void>((r) => (soltar = r));
    const { sync } = conCanales({ abrenSolos: true, antes: (url) => (retener && url === "/api/companies/c2/agents" ? retenida : undefined) });
    await sync.iniciar();
    await vi.waitFor(() => expect(sync.canalesAbiertos()).toBe(2));
    // Cargó sin volver de ninguna parte: no relee nada.
    expect(sync.releyendo()).toBe(false);
    sync.pausar();
    expect(sync.releyendo()).toBe(true);
    retener = true;
    const enCadaAviso: boolean[] = [];
    sync.alCambiar(() => enCadaAviso.push(sync.releyendo()));
    sync.reanudar();
    // Los canales abren (y avisan) antes de que vuelva la relectura de c2: todavía relee.
    await vi.waitFor(() => expect(sync.canalesAbiertos()).toBe(2));
    expect(sync.releyendo()).toBe(true);
    expect(enCadaAviso.every((r) => r)).toBe(true);
    soltar();
    await vi.waitFor(() => expect(sync.releyendo()).toBe(false));
    // El aviso con la relectura ya la ve terminada.
    expect(enCadaAviso.at(-1)).toBe(false);
    sync.detener();
  });

  it("si el canal no abre, la empresa deja de «cargar»: al tiro si el intento falla, o a los 5 s de leída", async () => {
    vi.useFakeTimers();
    const { sync, sockets } = conCanales();
    await sync.iniciar();
    sockets.get("c2")!.onclose!();
    expect(sync.estadoEmpresa("c2").cargando).toBe(false);
    expect(sync.estadoEmpresa("c1").cargando).toBe(true);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(sync.estadoEmpresa("c1").cargando).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(sync.estadoEmpresa("c1").cargando).toBe(false);
    sync.detener();
  });
});

describe("Sincronizador: con la pestaña oculta (vigía de los avisos, JST-97)", () => {
  it("con `sinEspera`, un evento se aplica sin temporizador; cada evento llega también tal cual a `alEventoVivo`", async () => {
    const fetch = api(() => false);
    vi.stubGlobal("fetch", fetch);
    const sockets: Array<{ onopen?: () => void; onmessage?: (m: { data: string }) => void; onclose?: () => void; close: () => void }> = [];
    const crearSocket = () => {
      const s = { close: () => undefined } as (typeof sockets)[number];
      sockets.push(s);
      return s as unknown as WebSocket;
    };
    const sync = new Sincronizador({ cx: { base: "", crearSocket }, sinEspera: () => true });
    await sync.iniciar();
    const vistos: string[] = [];
    sync.alEventoVivo((companyId, ev) => vistos.push(`${companyId}:${ev.type}`));
    vi.useFakeTimers();
    fetch.mockClear();
    const evento = { id: 1, companyId: "c1", type: "activity.logged", createdAt: new Date().toISOString(), payload: { action: "issue.thread_interaction_created" } };
    sockets[0]!.onmessage?.({ data: JSON.stringify(evento) });
    await Promise.resolve();
    await Promise.resolve();
    expect(vistos).toEqual(["c1:activity.logged"]);
    expect(fetch.mock.calls.map((c) => c[0])).toEqual(["/api/companies/c1/attention"]);
    sync.detener();
  });
});

describe("Sincronizador: tarea tomada por un run que partió sin tarea (JST-374)", () => {
  const TAREA = { id: "i9", identifier: "BET-9", title: "Tarea tomada", status: "in_progress" };

  function oficinaSinTarea(campo: "executionRunId" | "checkoutRunId") {
    let ahora = Date.parse("2026-11-05T12:00:00Z");
    let tareas: Array<Record<string, unknown>> = [];
    const fetch = vi.fn(async (url: string) => {
      const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
      if (url === "/api/companies") return json([EMPRESAS[0]]);
      if (url === "/api/companies/c1/agents") return json([{ ...agente("c1-a", "c1"), status: "running" }]);
      if (url === "/api/companies/c1/live-runs") {
        return json([{ id: "r0", companyId: "c1", agentId: "c1-a", status: "running", issueId: null, invocationSource: "on_demand", createdAt: "2026-11-05T11:59:00Z", startedAt: "2026-11-05T11:59:01Z" }]);
      }
      if (url === "/api/companies/c1/attention") return json({ items: [] });
      if (url.startsWith("/api/companies/c1/issues?")) return json(tareas);
      return { ok: false, status: 404, json: async () => ({ error: "no existe" }) };
    });
    vi.stubGlobal("fetch", fetch);
    const sync = new Sincronizador({ cx: { base: "" }, usarCanal: false, ahora: () => ahora, respaldoMs: 600_000, sinCanalMs: 600_000 });
    const lecturas = () => fetch.mock.calls.filter((c) => c[0].startsWith("/api/companies/c1/issues?")).length;
    return {
      sync,
      lecturas,
      ponerTarea: () => (tareas = [{ ...TAREA, [campo]: "r0" }]),
      pasar: (ms: number) => (ahora += ms),
    };
  }

  it.each(["executionRunId", "checkoutRunId"] as const)("llena el globo y sus enlaces con la tarea encontrada por %s", async (campo) => {
    const banco = oficinaSinTarea(campo);
    banco.ponerTarea();
    await banco.sync.iniciar();
    expect(banco.sync.agentes()[0]?.run).toMatchObject({ issueId: "i9", identifier: "BET-9", titulo: "Tarea tomada", tareaHref: "/BET/issues/BET-9", tareaStatus: "in_progress" });
    expect(banco.lecturas()).toBe(1);
    banco.pasar(61_000);
    await banco.sync.recargar("c1", ["atencion"]);
    expect(banco.lecturas()).toBe(1);
    banco.sync.detener();
  });

  it("mientras no la encuentra lee como máximo una vez por minuto; al encontrarla deja de leer", async () => {
    const banco = oficinaSinTarea("executionRunId");
    await banco.sync.iniciar();
    expect(banco.lecturas()).toBe(1);
    banco.pasar(59_999);
    await banco.sync.recargar("c1", ["atencion"]);
    expect(banco.lecturas()).toBe(1);
    banco.ponerTarea();
    banco.pasar(1);
    await banco.sync.recargar("c1", ["atencion"]);
    expect(banco.lecturas()).toBe(2);
    expect(banco.sync.agentes()[0]?.run?.identifier).toBe("BET-9");
    banco.pasar(60_000);
    await banco.sync.recargar("c1", ["atencion"]);
    expect(banco.lecturas()).toBe(2);
    banco.sync.detener();
  });
});
