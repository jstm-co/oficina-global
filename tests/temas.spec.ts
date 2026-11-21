import { afterEach, describe, expect, it, vi } from "vitest";
import type { EventoVivo, TareaRef } from "../src/shared.js";
import { TitulosConocidos } from "../src/rotulo.js";
import { CACHE_TEMAS_MS, LectorTemas, TERMINADA_MS, bloqueadaDeCola, primeraDeCola, terminadaDeEvento } from "../src/temas.js";

describe("lo primero de la cola", () => {
  const t = (identifier: string | null, status: string): TareaRef => ({ id: identifier ?? "x", identifier, title: "Una tarea", status });
  it("el primero de todo; si no hay, de in_review; si no, de blocked", () => {
    // Con el nombre de la tarea, para el rótulo de la sala (JST-138 §2).
    expect(primeraDeCola([t("A-1", "blocked"), t("A-2", "in_review"), t("A-3", "todo")])).toEqual({ codigo: "A-3", estado: "todo", titulo: "Una tarea" });
    expect(primeraDeCola([t("A-1", "blocked"), t("A-2", "in_review")])).toEqual({ codigo: "A-2", estado: "in_review", titulo: "Una tarea" });
    expect(primeraDeCola([t("A-1", "blocked")])).toEqual({ codigo: "A-1", estado: "blocked", titulo: "Una tarea" });
    expect(primeraDeCola([t("A-1", "todo"), t("A-4", "todo")])).toEqual({ codigo: "A-1", estado: "todo", titulo: "Una tarea" });
  });
  it("sin tareas, sin código o con otros estados: nada", () => {
    expect(primeraDeCola([])).toBeNull();
    expect(primeraDeCola([t(null, "todo")])).toBeNull();
    expect(primeraDeCola([t("A-1", "backlog"), t("A-2", "in_progress")])).toBeNull();
  });
});

function evento(payload: Record<string, unknown>, createdAt = new Date().toISOString(), type = "activity.logged"): EventoVivo {
  return { id: 1, companyId: "c1", type, createdAt, payload };
}

describe("lo que terminó un agente, por el canal en vivo", () => {
  const terminada = { action: "issue.updated", agentId: "a1", details: { identifier: "JST-91", changes: { status: { from: "in_review", to: "done" } } } };

  it("issue.updated a done, hecho por un agente: quién y qué", () => {
    const en = "2026-10-21T12:00:00.000Z";
    expect(terminadaDeEvento(evento(terminada, en))).toEqual({ agenteId: "a1", codigo: "JST-91", en: Date.parse(en) });
  });

  it("no cuenta si no la terminó un agente, si no pasó a done, sin código u otro evento", () => {
    expect(terminadaDeEvento(evento({ ...terminada, agentId: null }))).toBeNull();
    expect(terminadaDeEvento(evento({ ...terminada, details: { identifier: "JST-91", changes: { status: { to: "in_review" } } } }))).toBeNull();
    expect(terminadaDeEvento(evento({ ...terminada, details: { changes: { status: { to: "done" } } } }))).toBeNull();
    expect(terminadaDeEvento(evento({ ...terminada, details: { identifier: "JST-91", changes: { assigneeAgentId: { from: "a1", to: "a2" } } } }))).toBeNull();
    expect(terminadaDeEvento(evento({ ...terminada, action: "issue.created" }))).toBeNull();
    expect(terminadaDeEvento(evento(terminada, undefined, "heartbeat.run.status"))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Lector con caché (fetch simulado)
// ---------------------------------------------------------------------------

const AHORA = Date.parse("2026-10-21T18:00:00.000Z");
const URL_TERMINADA = "/api/companies/c1/issues?assigneeAgentId=a1&status=done&sortField=updated&sortDir=desc&limit=1&view=compact";
const URL_COLA = "/api/companies/c1/issues?assigneeAgentId=a1&status=todo,blocked,in_review&view=compact&limit=3";

function api(o: { terminadaHace?: number | null; falla?: string } = {}) {
  const { terminadaHace = 60 * 60_000 } = o;
  return vi.fn(async (url: string, _init?: RequestInit) => {
    const responder = (cuerpo: unknown, status = 200) => ({ ok: status < 400, status, json: async () => cuerpo });
    if (o.falla && url.includes(o.falla)) return responder({ error: "falló" }, 500);
    if (url.includes("status=done")) {
      if (terminadaHace === null) return responder([]);
      return responder([{ id: "t1", identifier: "JST-91", title: "Lo que terminó", status: "done", completedAt: new Date(AHORA - terminadaHace).toISOString(), updatedAt: new Date(AHORA - terminadaHace).toISOString() }]);
    }
    if (url.includes("status=todo,blocked,in_review")) {
      return responder([
        { id: "t2", identifier: "JST-90", title: "Bloqueada", status: "blocked" },
        { id: "t3", identifier: "JST-98", title: "En cola", status: "todo" },
      ]);
    }
    return responder({ error: "no" }, 404);
  });
}

const urls = (f: ReturnType<typeof api>) => f.mock.calls.map((c) => c[0] as string);

afterEach(() => vi.unstubAllGlobals());

describe("lector de temas con caché de 10 min", () => {
  it("la primera vez lee 2 cosas con las rutas del diseño: lo último que terminó y la cola", async () => {
    const f = api();
    vi.stubGlobal("fetch", f);
    const lector = new LectorTemas({ base: "" }, () => AHORA);
    const temas = await lector.leer({ id: "a1", companyId: "c1" });
    expect(temas).toMatchObject({ hecho: "JST-91", tituloHecho: "Lo que terminó", sigue: { codigo: "JST-98", estado: "todo", titulo: "En cola" }, enCola: 2 });
    expect(urls(f).sort()).toEqual([URL_COLA, URL_TERMINADA].sort());
    // Con la sesión del usuario, en el mismo origen.
    expect(f.mock.calls[0]![1]).toMatchObject({ credentials: "include" });
  });

  it("dentro de 10 min no vuelve a leer nada; después sí", async () => {
    const f = api();
    vi.stubGlobal("fetch", f);
    let t = AHORA;
    const lector = new LectorTemas({ base: "" }, () => t);
    await lector.leer({ id: "a1", companyId: "c1" });
    t += CACHE_TEMAS_MS - 1_000;
    expect(lector.guardado("a1")).toMatchObject({ hecho: "JST-91", tituloHecho: "Lo que terminó", sigue: { codigo: "JST-98", estado: "todo", titulo: "En cola" }, enCola: 2 });
    await lector.leer({ id: "a1", companyId: "c1" });
    expect(f).toHaveBeenCalledTimes(2);
    t += 2_000;
    expect(lector.guardado("a1")).toBeNull();
    await lector.leer({ id: "a1", companyId: "c1" });
    expect(f).toHaveBeenCalledTimes(4);
  });

  it("dos lecturas a la vez del mismo agente comparten las llamadas", async () => {
    const f = api();
    vi.stubGlobal("fetch", f);
    const lector = new LectorTemas({ base: "" }, () => AHORA);
    const [x, y] = await Promise.all([lector.leer({ id: "a1", companyId: "c1" }), lector.leer({ id: "a1", companyId: "c1" })]);
    expect(x).toEqual(y);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("si llegó por el canal en vivo que terminó algo en las últimas 24 h, solo lee la cola", async () => {
    const f = api();
    vi.stubGlobal("fetch", f);
    const lector = new LectorTemas({ base: "" }, () => AHORA);
    lector.alEvento(evento({ action: "issue.updated", agentId: "a1", details: { identifier: "JST-120", changes: { status: { to: "done" } } } }, new Date(AHORA - 5 * 60_000).toISOString()));
    const temas = await lector.leer({ id: "a1", companyId: "c1" });
    expect(temas.hecho).toBe("JST-120");
    expect(urls(f)).toEqual([URL_COLA]);
  });

  it("un evento en vivo de hace más de 24 h no cuenta: se lee lo terminado", async () => {
    const f = api();
    vi.stubGlobal("fetch", f);
    const lector = new LectorTemas({ base: "" }, () => AHORA);
    lector.alEvento(evento({ action: "issue.updated", agentId: "a1", details: { identifier: "JST-1", changes: { status: { to: "done" } } } }, new Date(AHORA - TERMINADA_MS - 60_000).toISOString()));
    const temas = await lector.leer({ id: "a1", companyId: "c1" });
    expect(temas.hecho).toBe("JST-91");
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("un evento en vivo pone al día lo guardado: la pareja tiene algo nuevo que contar", async () => {
    vi.stubGlobal("fetch", api());
    const lector = new LectorTemas({ base: "" }, () => AHORA);
    await lector.leer({ id: "a1", companyId: "c1" });
    lector.alEvento(evento({ action: "issue.updated", agentId: "a1", details: { identifier: "JST-130", changes: { status: { to: "done" } } } }, new Date(AHORA).toISOString()));
    expect(lector.guardado("a1")?.hecho).toBe("JST-130");
    // Los eventos que no son «terminó» no cambian nada.
    lector.alEvento(evento({ action: "issue.updated", agentId: "a1", details: { identifier: "JST-131", changes: { status: { to: "todo" } } } }));
    expect(lector.guardado("a1")?.hecho).toBe("JST-130");
  });

  it("lo que terminó hace más de 24 h no cuenta; sin nada terminado, tampoco", async () => {
    vi.stubGlobal("fetch", api({ terminadaHace: TERMINADA_MS + 60_000 }));
    const viejo = new LectorTemas({ base: "" }, () => AHORA);
    expect((await viejo.leer({ id: "a1", companyId: "c1" })).hecho).toBeNull();
    vi.stubGlobal("fetch", api({ terminadaHace: null }));
    const sin = new LectorTemas({ base: "" }, () => AHORA);
    expect(await sin.leer({ id: "a1", companyId: "c1" })).toMatchObject({ hecho: null, tituloHecho: null, sigue: { codigo: "JST-98", estado: "todo", titulo: "En cola" }, enCola: 2 });
  });

  it("si una lectura falla, la promesa falla y no se guarda nada (el próximo turno vuelve a leer)", async () => {
    for (const falla of ["status=done", "status=todo"]) {
      const f = api({ falla });
      vi.stubGlobal("fetch", f);
      const lector = new LectorTemas({ base: "" }, () => AHORA);
      await expect(lector.leer({ id: "a1", companyId: "c1" })).rejects.toThrow();
      expect(lector.guardado("a1")).toBeNull();
      vi.stubGlobal("fetch", api());
      await expect(lector.leer({ id: "a1", companyId: "c1" })).resolves.toMatchObject({ hecho: "JST-91" });
    }
  });
});

describe("nombres de las tareas para el rótulo (JST-138 §2)", () => {
  it("las mismas 2 lecturas llenan los nombres conocidos de la página: ninguna lectura más", async () => {
    const f = api();
    vi.stubGlobal("fetch", f);
    const titulos = new TitulosConocidos();
    const lector = new LectorTemas({ base: "" }, () => AHORA, titulos);
    await lector.leer({ id: "a1", companyId: "c1" });
    expect(f).toHaveBeenCalledTimes(2);
    expect(titulos.titulo("JST-91")).toBe("Lo que terminó");
    expect(titulos.titulo("JST-90")).toBe("Bloqueada");
    expect(titulos.titulo("JST-98")).toBe("En cola");
    expect(titulos.titulo("JST-1")).toBeNull();
  });

  it("lo que llega por el canal en vivo trae solo el código: el nombre sale de los conocidos, si está", async () => {
    vi.stubGlobal("fetch", api());
    const titulos = new TitulosConocidos();
    titulos.conocer("JST-130", "Arreglar el sobre");
    const lector = new LectorTemas({ base: "" }, () => AHORA, titulos);
    await lector.leer({ id: "a1", companyId: "c1" });
    lector.alEvento(evento({ action: "issue.updated", agentId: "a1", details: { identifier: "JST-130", changes: { status: { to: "done" } } } }, new Date(AHORA).toISOString()));
    expect(lector.guardado("a1")).toMatchObject({ hecho: "JST-130", tituloHecho: "Arreglar el sobre" });
    lector.alEvento(evento({ action: "issue.updated", agentId: "a1", details: { identifier: "JST-131", changes: { status: { to: "done" } } } }, new Date(AHORA).toISOString()));
    expect(lector.guardado("a1")).toMatchObject({ hecho: "JST-131", tituloHecho: null });
  });

  it("«enCola» es el largo de lo que ya trae la lectura «cola» (0 a 3), sin leer nada más (JST-162 §1.2)", async () => {
    const f = api();
    vi.stubGlobal("fetch", f);
    const lector = new LectorTemas({ base: "" }, () => AHORA);
    expect((await lector.leer({ id: "a1", companyId: "c1" })).enCola).toBe(2);
    expect(f).toHaveBeenCalledTimes(2);
    // Un evento en vivo pone al día lo terminado, y la cola sigue igual.
    lector.alEvento(evento({ action: "issue.updated", agentId: "a1", details: { identifier: "JST-130", changes: { status: { to: "done" } } } }, new Date(AHORA).toISOString()));
    expect(lector.guardado("a1")).toMatchObject({ hecho: "JST-130", enCola: 2 });
  });

  it("los nombres conocidos también miran las tareas que ya guarda el sincronizador", () => {
    const tareas = [{ identifier: "BET-432", title: "Backend — reset token" }];
    const titulos = new TitulosConocidos(() => tareas);
    expect(titulos.titulo("BET-432")).toBe("Backend — reset token");
    titulos.conocer("BET-432", "Otro nombre");
    expect(titulos.titulo("BET-432")).toBe("Otro nombre");
    titulos.conocer("BET-1", null);
    expect(titulos.titulo("BET-1")).toBeNull();
  });
});

describe("temas nuevos de JST-415: bloqueada, cuándo empezó y racha del día", () => {
  it("la tarea bloqueada sale de la misma lectura de la cola: la primera bloqueada, aunque haya otra antes", async () => {
    expect(bloqueadaDeCola([{ id: "i1", identifier: "JST-1", title: "A", status: "todo" }, { id: "i2", identifier: "JST-2", title: "B", status: "blocked" }])).toEqual({ codigo: "JST-2", titulo: "B" });
    expect(bloqueadaDeCola([{ id: "i1", identifier: "JST-1", title: "A", status: "todo" }])).toBeNull();
    const f = api();
    vi.stubGlobal("fetch", f);
    const lector = new LectorTemas({ base: "" }, () => AHORA);
    expect(await lector.leer({ id: "a1", companyId: "c1" })).toMatchObject({ bloqueada: { codigo: "JST-90", titulo: "Bloqueada" } });
    // Sin lecturas de más: las mismas 2 de siempre.
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("cuánto tardó: la lectura de lo terminado trae el inicio si la API lo da; si no, queda sin inicio y no se inventa", async () => {
    const inicio = new Date(AHORA - 3 * 3_600_000).toISOString();
    const fin = new Date(AHORA - 60 * 60_000).toISOString();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        status: 200,
        json: async () => (url.includes("status=done") ? [{ id: "t1", identifier: "JST-91", title: "X", status: "done", startedAt: inicio, completedAt: fin }] : []),
      })),
    );
    const con = await new LectorTemas({ base: "" }, () => AHORA).leer({ id: "a1", companyId: "c1" });
    expect(con).toMatchObject({ hecho: "JST-91", hechoEn: Date.parse(fin), hechoInicio: Date.parse(inicio) });
    vi.stubGlobal("fetch", api());
    const sin = await new LectorTemas({ base: "" }, () => AHORA).leer({ id: "a1", companyId: "c1" });
    expect(sin.hechoInicio).toBeNull();
  });

  it("la racha cuenta solo lo que la página vio terminar hoy por el canal en vivo, sin repetir una tarea", async () => {
    vi.stubGlobal("fetch", api());
    const lector = new LectorTemas({ base: "" }, () => AHORA);
    await lector.leer({ id: "a1", companyId: "c1" });
    expect(lector.guardado("a1")?.racha).toBeUndefined();
    const fin = (codigo: string, min: number) => lector.alEvento(evento({ action: "issue.updated", agentId: "a1", details: { identifier: codigo, changes: { status: { to: "done" } } } }, new Date(AHORA - min * 60_000).toISOString()));
    fin("JST-1", 30);
    fin("JST-2", 20);
    fin("JST-2", 10);
    expect(lector.guardado("a1")?.racha).toBe(2);
    fin("JST-3", 5);
    expect(lector.guardado("a1")?.racha).toBe(3);
  });
});
