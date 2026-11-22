// JST-426: «Bloqueadas sin nadie moviéndolas», la lógica pura y que no se cuele en lo que sí te necesita.
import { afterEach, describe, expect, it, vi } from "vitest";
import { armarBloqueos, bloqueosDe, claveMotivo, LectorMotivos, recortarMotivo, agruparBloqueos, etiquetaMesa, type Bloqueada, type EmpresaBloqueos } from "../src/bloqueos.js";
import { armarEmpresa, contar, esperasPorAgente, tipoEspera } from "../src/estado.js";
import { setLocale } from "../src/i18n.js";
import type { AgenteApi, ItemAtencion } from "../src/shared.js";
import { Sincronizador } from "../src/sincronizador.js";
import { contarVista, vistaDe } from "../src/vista.js";
import { armar } from "../src/ui/useOficina.js";
import { fotoDe, llegadas } from "../src/avisos.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const tarea = (n: number, agente: string | null = id(900), status = "blocked") => ({ kind: "issue", id: id(n), identifier: `AAA-${n}`, title: `Tarea inventada ${n}`, status, href: `/AAA/issues/AAA-${n}`, metadata: { assigneeAgentId: agente } });
/** Un eslabón: la tarea `frena` tiene esperando a `espera`. */
const eslabon = (frena: number, espera: number, extra: Partial<ItemAtencion> = {}): ItemAtencion => ({ ...bloqueo(frena), id: `blocker_attention:${frena}:${espera}`, relatedIssue: tarea(espera), ...extra });

function bloqueo(n: number, extra: Partial<ItemAtencion> = {}, agente: string | null = id(900)): ItemAtencion {
  return {
    id: `blocker_attention:${n}`,
    sourceKind: "blocker_attention",
    companyId: id(1),
    subject: tarea(n, agente),
    relatedIssue: tarea(n, agente),
    dismissal: null,
    activityAt: "2026-10-20T10:00:00Z",
    detail: { kind: "blocker", blockedTaskCount: 0 },
    ...extra,
  };
}

const empresa = (items: ItemAtencion[], extra: Partial<EmpresaBloqueos> = {}): EmpresaBloqueos => ({ id: id(1), prefijo: "AAA", nombre: "Empresa A", atencion: items, ...extra });

describe("armarBloqueos", () => {
  it("solo blocker_attention con una tarea de sujeto", () => {
    const otro: ItemAtencion = { id: "x", sourceKind: "approval", subject: { kind: "issue", id: id(7) } };
    const sinTarea = bloqueo(8, { subject: { kind: "approval", id: id(8) }, relatedIssue: null });
    const lista = armarBloqueos([empresa([bloqueo(1), otro, sinTarea])]);
    expect(lista.map((b) => b.issueId)).toEqual([id(1)]);
  });
  it("descarta las descartadas vigentes; una que Paperclip vuelve a mostrar (isActive: false) se lista", () => {
    const lista = armarBloqueos([empresa([bloqueo(1, { dismissal: { isActive: true } }), bloqueo(2), bloqueo(3, { dismissal: { isActive: false } })])]);
    expect(lista.map((b) => b.identifier)).toEqual(["AAA-2", "AAA-3"]);
  });
  it("«frena» es lo que cuenta Paperclip (blockedTaskCount), aunque el feed solo nombre una de las que esperan", () => {
    const [b] = armarBloqueos([empresa([eslabon(1, 2, { detail: { kind: "blocker", blockedTaskCount: 12 } })])]);
    expect(b).toMatchObject({ identifier: "AAA-1", frena: 12 });
  });
  it("una tarea con bloqueo propio conserva su fila aunque además espere a otra", () => {
    // 2 espera a 1, y además tiene su propio bloqueo (pide algo a alguien): con y sin `relatedIssue`.
    for (const propio of [bloqueo(2), bloqueo(2, { relatedIssue: null })]) {
      const lista = armarBloqueos([empresa([eslabon(1, 2), propio])]);
      expect(lista.map((b) => b.identifier).sort()).toEqual(["AAA-1", "AAA-2"]);
    }
  });
  it("una por tarea, aunque llegue repetida o en dos empresas", () => {
    const lista = armarBloqueos([empresa([bloqueo(1), bloqueo(1, { id: "otro" })]), { ...empresa([bloqueo(1)]), id: id(2), prefijo: "BBB" }]);
    expect(lista).toHaveLength(1);
    expect(lista[0]!.prefijo).toBe("AAA");
  });
  it("la más antigua primero; fecha: activityAt, o updatedAt, o createdAt; sin fecha al final", () => {
    const lista = armarBloqueos([
      empresa([
        bloqueo(1, { activityAt: "2026-10-20T12:00:00Z" }),
        bloqueo(2, { activityAt: null, updatedAt: "2026-10-20T08:00:00Z" }),
        bloqueo(3, { activityAt: null, createdAt: "2026-10-20T09:00:00Z" }),
        bloqueo(4, { activityAt: null }),
      ]),
    ]);
    expect(lista.map((b) => b.identifier)).toEqual(["AAA-2", "AAA-3", "AAA-1", "AAA-4"]);
    expect(lista[3]!.desde).toBeNull();
  });
  it("guarda empresa, código, título, enlace y agente; sin agente queda en null", () => {
    const [b] = armarBloqueos([empresa([bloqueo(5, {}, null)])]);
    expect(b).toMatchObject({ companyId: id(1), prefijo: "AAA", empresa: "Empresa A", identifier: "AAA-5", titulo: "Tarea inventada 5", href: "/AAA/issues/AAA-5", agenteId: null });
    expect(armarBloqueos([empresa([bloqueo(5)])])[0]!.agenteId).toBe(id(900));
  });
  it("una cadena es una sola fila: la tarea que la frena, con cuántas esperan detrás", () => {
    // 1 frena a 2, 2 frena a 3 y a 4; 9 está bloqueada sola.
    const lista = armarBloqueos([empresa([eslabon(2, 3), eslabon(1, 2), eslabon(2, 4), bloqueo(9)])]);
    expect(lista.map((b) => [b.identifier, b.frena])).toEqual([["AAA-1", 3], ["AAA-9", 0]]);
  });
  it("la que frena puede no estar bloqueada: guarda su estado; y si es de una persona, lo dice", () => {
    const sinEmpezar = eslabon(1, 2, { subject: tarea(1, id(900), "todo") });
    const dePersona = eslabon(5, 6, { subject: { ...tarea(5, null), metadata: { assigneeAgentId: null, assigneeUserId: id(800) } } });
    const lista = armarBloqueos([empresa([sinEmpezar, dePersona])]);
    expect(lista.map((b) => [b.identifier, b.estado, b.dePersona, b.agenteId])).toEqual([["AAA-1", "todo", false, id(900)], ["AAA-5", "blocked", true, null]]);
  });
  it("primero la que más frena; la fecha de la fila es la del eslabón más antiguo de su cabeza", () => {
    const lista = armarBloqueos([
      empresa([
        bloqueo(9, { activityAt: "2026-10-01T00:00:00Z" }),
        eslabon(1, 2, { activityAt: "2026-10-20T12:00:00Z" }),
        eslabon(1, 3, { activityAt: "2026-10-19T12:00:00Z" }),
      ]),
    ]);
    expect(lista.map((b) => b.identifier)).toEqual(["AAA-1", "AAA-9"]);
    expect(lista[0]!.desde).toBe(Date.parse("2026-10-19T12:00:00Z"));
  });
  it("un ciclo no se pierde ni cuelga: sale una fila", () => {
    const lista = armarBloqueos([empresa([eslabon(1, 2), eslabon(2, 1)])]);
    expect(lista).toHaveLength(1);
    expect(lista[0]!.frena).toBe(1);
  });
  it("si la cabeza de la cadena tiene un run vivo, la cadena entera queda fuera", () => {
    expect(armarBloqueos([empresa([eslabon(1, 2), eslabon(2, 3)], { conRunVivo: new Set([id(1)]) })])).toEqual([]);
    // Un run en una tarea del medio no cambia la fila: la que frena sigue quieta.
    expect(armarBloqueos([empresa([eslabon(1, 2), eslabon(2, 3)], { conRunVivo: new Set([id(2)]) })]).map((b) => b.identifier)).toEqual(["AAA-1"]);
  });
  it("sin tarea con run vivo; una empresa sin lectura no aporta", () => {
    const lista = armarBloqueos([empresa([bloqueo(1), bloqueo(2)], { conRunVivo: new Set([id(1)]) }), { ...empresa([bloqueo(3)]), id: id(2), atencion: null }]);
    expect(lista.map((b) => b.identifier)).toEqual(["AAA-2"]);
  });
  it("filtra por empresas visibles (vacío: todas)", () => {
    const lista = armarBloqueos([empresa([bloqueo(1)]), { ...empresa([bloqueo(2)]), id: id(2), prefijo: "BBB" }]);
    expect(bloqueosDe(lista, ["BBB"]).map((b) => b.prefijo)).toEqual(["BBB"]);
    expect(bloqueosDe(lista, [])).toHaveLength(2);
  });
});

const fila = (n: number, prefijo: string, empresa: string): Bloqueada => ({ companyId: id(1), prefijo, empresa, issueId: id(n), identifier: `${prefijo}-${n}`, titulo: `Tarea ${n}`, href: null, agenteId: null, desde: null, estado: "blocked", frena: 0, dePersona: false });

describe("agruparBloqueos (JST-428)", () => {
  it("un grupo por empresa, en el orden en que aparece cada una, y dentro el orden de la lista", () => {
    const lista = [fila(1, "BBB", "Empresa B"), fila(2, "AAA", "Empresa A"), fila(3, "BBB", "Empresa B"), fila(4, "CCC", "Empresa C"), fila(5, "AAA", "Empresa A")];
    const g = agruparBloqueos(lista);
    expect(g.map((x) => x.prefijo)).toEqual(["BBB", "AAA", "CCC"]);
    expect(g.map((x) => x.empresa)).toEqual(["Empresa B", "Empresa A", "Empresa C"]);
    expect(g[0]!.vistas.map((b) => b.issueId)).toEqual([id(1), id(3)]);
    expect(g[1]!.vistas.map((b) => b.issueId)).toEqual([id(2), id(5)]);
    expect(g.map((x) => [x.total, x.mas])).toEqual([[2, 0], [2, 0], [1, 0]]);
  });
  it("cada grupo muestra hasta 8 y cuenta las que quedan fuera; el tope es por grupo, no global", () => {
    const lista = [...Array.from({ length: 11 }, (_, i) => fila(i + 1, "AAA", "Empresa A")), ...Array.from({ length: 9 }, (_, i) => fila(i + 20, "BBB", "Empresa B")), fila(40, "CCC", "Empresa C")];
    const g = agruparBloqueos(lista);
    expect(g.map((x) => [x.vistas.length, x.total, x.mas])).toEqual([[8, 11, 3], [8, 9, 1], [1, 1, 0]]);
    expect(g[0]!.vistas.map((b) => b.issueId)).toEqual(Array.from({ length: 8 }, (_, i) => id(i + 1)));
    expect(agruparBloqueos(lista, 2).map((x) => x.vistas.length)).toEqual([2, 2, 1]);
  });
  it("vacío: sin grupos", () => {
    expect(agruparBloqueos([])).toEqual([]);
  });
});

describe("etiquetaMesa (JST-428)", () => {
  it("0, 1 y varias", () => {
    setLocale("es");
    expect(etiquetaMesa(0, "Empresa A")).toBe("Nada bloqueado en Empresa A");
    expect(etiquetaMesa(1, "Empresa A")).toBe("1 bloqueada en Empresa A");
    expect(etiquetaMesa(3, "Empresa A")).toBe("3 bloqueadas en Empresa A");
  });
});

describe("recortarMotivo", () => {
  it("deja el corto y corta el largo con «…»", () => {
    expect(recortarMotivo("Espera al Líder:  OK\npara un push")).toBe("Espera al Líder: OK para un push");
    const r = recortarMotivo("x".repeat(500));
    expect(r).toHaveLength(240);
    expect(r.endsWith("…")).toBe(true);
  });
});

describe("LectorMotivos", () => {
  const siguiente = () => new Promise<void>((r) => setTimeout(r, 0));
  it("lee una vez por tarea y recuerda el resultado", async () => {
    const leer = vi.fn(async (i: string) => `motivo ${i}`);
    const lector = new LectorMotivos(leer);
    expect(lector.motivo("a")).toBeUndefined();
    lector.pedir(["a", "a"]);
    await siguiente();
    lector.pedir(["a"]);
    await siguiente();
    expect(leer).toHaveBeenCalledTimes(1);
    expect(lector.motivo("a")).toBe("motivo a");
  });
  it("sin motivo queda en null y no se vuelve a pedir; un fallo no se recuerda y se reintenta", async () => {
    const leer = vi.fn(async (i: string) => {
      if (i === "falla") throw new Error("500");
      return i === "vacio" ? "  " : null;
    });
    const lector = new LectorMotivos(leer);
    lector.pedir(["falla", "vacio", "nulo"]);
    await siguiente();
    expect(["falla", "vacio", "nulo"].map((i) => lector.motivo(i))).toEqual([undefined, null, null]);
    lector.pedir(["falla", "vacio", "nulo"]);
    await siguiente();
    expect(leer).toHaveBeenCalledTimes(4);
  });
  it("la clave cambia si el bloqueo se mueve: se vuelve a leer, y `leer` recibe solo el id de la tarea", async () => {
    const leer = vi.fn(async (i: string) => `motivo ${i}`);
    const lector = new LectorMotivos(leer);
    const antes = claveMotivo({ issueId: "a", desde: 1 });
    const despues = claveMotivo({ issueId: "a", desde: 2 });
    lector.pedir([antes]);
    await siguiente();
    expect(lector.motivo(antes)).toBe("motivo a");
    expect(lector.motivo(despues)).toBeUndefined();
    lector.pedir([despues]);
    await siguiente();
    expect(leer.mock.calls).toEqual([["a"], ["a"]]);
  });
  it("un pedido que no vuelve no traba al lector: suelta el cupo y no recuerda nada", async () => {
    const leer = vi.fn((i: string) => (i === "colgado" ? new Promise<string | null>(() => undefined) : Promise.resolve("ok")));
    const lector = new LectorMotivos(leer, 1, 5);
    lector.pedir(["colgado", "otro"]);
    await new Promise((r) => setTimeout(r, 30));
    expect(lector.motivo("colgado")).toBeUndefined();
    expect(lector.motivo("otro")).toBe("ok");
  });
  it("respeta el tope de pedidos simultáneos y avisa a los oyentes", async () => {
    let enCurso = 0;
    let maximo = 0;
    const leer = async (i: string) => {
      enCurso++;
      maximo = Math.max(maximo, enCurso);
      await siguiente();
      enCurso--;
      return `m${i}`;
    };
    const lector = new LectorMotivos(leer, 2);
    const aviso = vi.fn();
    lector.alCambiar(aviso);
    lector.pedir(["1", "2", "3", "4", "5"]);
    for (let i = 0; i < 20; i++) await siguiente();
    expect(maximo).toBe(2);
    expect(aviso).toHaveBeenCalledTimes(5);
    expect(lector.motivo("5")).toBe("m5");
  });
});

describe("los bloqueos no son «te necesita»", () => {
  afterEach(() => vi.unstubAllGlobals());
  const ag = (n: number): AgenteApi => ({ id: id(n), companyId: id(1), name: `Ingeniera de Datos ${n}`, status: "idle", adapterType: "claude_local" });
  const datos = (items: ItemAtencion[]) => ({ empresa: { id: id(1), name: "Empresa A", issuePrefix: "AAA", status: "active" }, agentes: [ag(900)], runs: [], atencion: items });

  it("tipoEspera(blocker_attention) sigue siendo null", () => {
    expect(tipoEspera(bloqueo(1))).toBeNull();
  });
  it("no levantan la mano ni cambian los contadores, el resumen de esperas ni la foto de la vigía", () => {
    const sin = armarEmpresa(datos([]), new Map());
    const con = armarEmpresa(datos([bloqueo(1), bloqueo(2)]), new Map());
    expect(con.map((a) => a.teNecesita)).toEqual([[]]);
    expect(contar(con)).toEqual(contar(sin));
    expect(esperasPorAgente([bloqueo(1)], [ag(900)]).porAgente.size).toBe(0);
    setLocale("es");
    const vistas = (l: typeof con) => l.map((a) => vistaDe(a, "Empresa A"));
    expect(contarVista(vistas(con))).toEqual(contarVista(vistas(sin)));
    expect(vistas(con).every((a) => !a.need)).toBe(true);
    const siempre = () => true;
    expect(llegadas(fotoDe(vistas(sin), siempre), fotoDe(vistas(con), siempre))).toEqual([]);
  });
  it("con bloqueadas en una sala (la mesa, JST-428) los contadores y `need` de los agentes no cambian", () => {
    setLocale("es");
    const sin = armarEmpresa(datos([]), new Map());
    const con = armarEmpresa(datos([bloqueo(1), bloqueo(2), bloqueo(3)]), new Map());
    const lista = armarBloqueos([empresa([bloqueo(1), bloqueo(2), bloqueo(3)])]);
    expect(lista).toHaveLength(3);
    expect(lista.filter((b) => b.prefijo === "AAA")).toHaveLength(3);
    const vistas = (l: typeof con) => l.map((a) => vistaDe(a, "Empresa A"));
    expect(contar(con)).toEqual(contar(sin));
    expect(contarVista(vistas(con))).toEqual(contarVista(vistas(sin)));
    expect(vistas(con).map((a) => a.need)).toEqual(vistas(sin).map((a) => a.need));
    expect(vistas(con).every((a) => !a.need)).toBe(true);
    expect(esperasPorAgente(lista.map((b) => bloqueo(Number(b.identifier!.slice(4)))), [ag(900)]).porAgente.size).toBe(0);
  });
  it("el sincronizador los expone aparte de agentes()", async () => {
    const empresas = [{ id: id(1), name: "Empresa A", issuePrefix: "AAA", status: "active" }];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const ruta = url.replace(/^\/api/, "");
        const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
        if (ruta === "/companies") return json(empresas);
        if (ruta.endsWith("/agents")) return json([ag(900)]);
        if (ruta.endsWith("/live-runs")) return json([{ id: id(50), companyId: id(1), status: "running", agentId: id(900), issueId: id(2), createdAt: "2026-10-20T10:00:00Z", startedAt: null }]);
        if (ruta.endsWith("/attention")) return json({ items: [bloqueo(1), bloqueo(2)] });
        return json({ id: ruta.split("/").pop(), title: "Tarea inventada", identifier: "AAA-1" });
      }),
    );
    const sync = new Sincronizador({ cx: { base: "" }, usarCanal: false });
    await sync.iniciar();
    // La 2 tiene un run vivo: no se lista.
    expect(sync.bloqueos().map((b) => b.identifier)).toEqual(["AAA-1"]);
    const oficina = armar(sync, {});
    expect(oficina.bloqueadas).toHaveLength(1);
    expect(oficina.agentes.every((a) => !a.need)).toBe(true);
    sync.detener();
  });
});
