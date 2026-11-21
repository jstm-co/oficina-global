// Los números del menú del Resumen (JST-262): lo que dura se cuenta con el
// pedido de origen de cada tarea, como al leer, y si no responde ninguna
// empresa van sin número (no 0).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FilaTarea } from "../src/fuentes.js";
import { Arbol, armarDatos, tituloParaVoz, type EmpresaRes } from "../src/resumen/datos.js";
import { armarResumen, duracionTotal, OPCIONES_OMISION, textoDuracion, type OpcionesResumen } from "../src/resumen/frases.js";
import { inicioDe } from "../src/resumen/tiempo.js";
import { ControlResumen } from "../src/ui/resumen.js";
import type { Oficina } from "../src/ui/useOficina.js";

const AHORA = Date.parse("2026-10-25T12:00:00Z");
const hace = (min: number) => new Date(AHORA - min * 60_000).toISOString();

const EMPRESAS: EmpresaRes[] = [
  { id: "c-bet", prefijo: "BET", nombre: "Betalandia" },
  { id: "c-jst", prefijo: "JST", nombre: "JSTM" },
];

/** Una Oficina sin agentes con estas empresas (lo único que el menú usa de ella). */
function oficina(caidas: string[] = []): Oficina {
  const vista = (e: EmpresaRes) => ({ ...e, color: "#888" });
  return {
    sync: null,
    iniciando: false,
    errorEmpresas: null,
    empresas: EMPRESAS.map(vista),
    ocultas: [],
    agentes: [],
    caidas: EMPRESAS.filter((e) => caidas.includes(e.id)).map(vista),
    sinAtencion: false,
    cargando: false,
    reintentar: () => {},
  } as unknown as Oficina;
}

const fila = (id: string, companyId: string, title: string, parentId: string | null, status: string, extra: Partial<FilaTarea> = {}): FilaTarea => ({
  id,
  companyId,
  identifier: id.toUpperCase(),
  title,
  status,
  parentId,
  completedAt: status === "done" ? hace(30) : null,
  updatedAt: hace(30),
  ...extra,
});

// Lo terminado y la cola cuelgan de pedidos que no están en ninguna de las dos listas: hay que subir con `/issues/:id`.
const TERMINADAS: Record<string, FilaTarea[]> = {
  "c-jst": [
    ...[1, 2, 3].map((i) => fila(`j${i}`, "c-jst", `Paso ${i} de la migración del portal de clientes`, "p-portal", "done")),
    ...[4, 5, 6].map((i) => fila(`j${i}`, "c-jst", `Revisar la maqueta número ${i} del tablero`, "p-tablero", "done")),
    ...[7, 8].map((i) => fila(`j${i}`, "c-jst", `Prueba ${i} de la voz en el celular`, "p-voz", "done")),
  ],
  "c-bet": [...[1, 2, 3, 4].map((i) => fila(`b${i}`, "c-bet", `Migrar la tabla ${i} del registro`, "p-datos", "done"))],
};
const ABIERTAS: Record<string, FilaTarea[]> = {
  "c-jst": [...[1, 2, 3, 4].map((i) => fila(`q${i}`, "c-jst", `Pendiente ${i} de la versión nueva`, "p-version", i === 4 ? "blocked" : "todo"))],
  "c-bet": [...[1, 2].map((i) => fila(`r${i}`, "c-bet", `Informe ${i} para el equipo`, "p-comite", "todo"))],
};
/** `/issues/:id`: la tarea y sus de más arriba (el padre primero). */
const CADENAS: Record<string, { id: string; identifier: string; title: string; parentId: string | null; ancestors: Array<{ id: string; identifier: string; title: string }> }> = {
  "p-portal": { id: "p-portal", identifier: "JST-10", title: "Portal de clientes nuevo", parentId: null, ancestors: [] },
  "p-tablero": { id: "p-tablero", identifier: "JST-11", title: "Tablero de métricas", parentId: null, ancestors: [] },
  "p-voz": { id: "p-voz", identifier: "JST-12", title: "Voz de la Oficina", parentId: "p-oficina", ancestors: [{ id: "p-oficina", identifier: "JST-1", title: "Oficina global" }] },
  "p-version": { id: "p-version", identifier: "JST-13", title: "Versión de diciembre", parentId: null, ancestors: [] },
  "p-datos": { id: "p-datos", identifier: "BET-20", title: "Migración de datos de octubre", parentId: null, ancestors: [] },
  "p-comite": { id: "p-comite", identifier: "BET-21", title: "Comité de arquitectura", parentId: null, ancestors: [] },
};

let llamadas: string[] = [];
let fallanListas = false;
let fallanCadenas = new Set<string>();
let frenarCadenas: Promise<void> | null = null;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AHORA);
  llamadas = [];
  fallanListas = false;
  fallanCadenas = new Set();
  frenarCadenas = null;
  vi.stubGlobal("fetch", async (url: string) => {
    llamadas.push(url);
    const u = new URL(url, "http://copia");
    const lista = /^\/api\/companies\/([^/]+)\/issues$/.exec(u.pathname);
    if (lista) {
      if (fallanListas) return json({ error: "caída" }, 503);
      const id = decodeURIComponent(lista[1]!);
      return json(u.searchParams.get("status") === "done" ? (TERMINADAS[id] ?? []) : (ABIERTAS[id] ?? []));
    }
    const una = /^\/api\/issues\/([^/]+)$/.exec(u.pathname);
    if (una) {
      if (frenarCadenas) await frenarCadenas;
      const id = decodeURIComponent(una[1]!);
      if (fallanCadenas.has(id) || !CADENAS[id]) return json({ error: "no" }, 404);
      return json(CADENAS[id]);
    }
    return json({ error: "ruta" }, 404);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const cadenasPedidas = () => llamadas.filter((u) => /\/api\/issues\/[^/?]+$/.test(u)).length;

function control(op: Partial<OpcionesResumen>, o = oficina()): ControlResumen {
  const r = new ControlResumen();
  r.op = { ...OPCIONES_OMISION, ...op };
  r.ultima = null;
  r.fijarOficina(o);
  return r;
}

/** Lo que dura leído (sin la IA) con un árbol dado: lo que dice «Listo · 3:42». */
function duraCon(arbol: Arbol, op: OpcionesResumen): number {
  const inicio = inicioDe(op.desde, AHORA, null);
  for (const f of [...Object.values(TERMINADAS), ...Object.values(ABIERTAS)].flat()) arbol.sumarFila(f);
  const d = armarDatos(
    { empresas: EMPRESAS, agentes: [], tareasVivas: () => [], terminadas: new Map(Object.entries(TERMINADAS)), abiertas: new Map(Object.entries(ABIERTAS)), fallan: new Set(), arbol, inicio },
    op.co,
  );
  return duracionTotal(armarResumen(d, { ahora: AHORA, ultima: null, op, conIa: false }, (t) => tituloParaVoz(t)));
}

function arbolEntero(): Arbol {
  const a = new Arbol();
  for (const c of Object.values(CADENAS)) {
    a.sumar({ id: c.id, identifier: c.identifier, titulo: c.title, parentId: c.parentId, rutina: false });
    c.ancestors.forEach((x, i) => a.sumar({ id: x.id, identifier: x.identifier, titulo: x.title, parentId: c.ancestors[i + 1]?.id ?? null, rutina: false }));
  }
  return a;
}

describe("lo que dura en el menú (JST-262)", () => {
  it("se cuenta con el pedido de origen de cada tarea, como al leer, y no con una frase por tarea", async () => {
    const op: OpcionesResumen = { ...OPCIONES_OMISION, desde: "7d", largo: "completo" };
    const r = control(op);
    r.pedirParaMenu();
    await vi.waitFor(() => expect(r.numeros()!.duraMs).not.toBeNull());
    const n = r.numeros()!;
    const lleno = duraCon(arbolEntero(), op);
    // Con el árbol vacío (lo de la 0.9.1) sale otra cosa: la prueba distingue los dos.
    expect(duraCon(new Arbol(), op)).not.toBe(lleno);
    expect(n.duraMs).toBe(lleno);
    expect(n.dura).toBe(textoDuracion(lleno));
    expect(n).toMatchObject({ hecho: 12, cola: 6, toca: 0, trabajan: 0, ninguna: false });
    // Una lectura por pedido que falta (la de «Voz de la Oficina» trae también «Oficina global»).
    expect(cadenasPedidas()).toBe(6);
  });

  it("mientras sube hasta el pedido de origen muestra «…», no la cifra de antes", async () => {
    let soltar!: () => void;
    frenarCadenas = new Promise<void>((ok) => (soltar = ok));
    const r = control({ desde: "7d", largo: "completo" });
    r.pedirParaMenu();
    await vi.waitFor(() => expect(cadenasPedidas()).toBeGreaterThan(0));
    const n = r.numeros()!;
    expect(n.hecho).toBe(12);
    expect(n.cola).toBe(6);
    expect(n.dura).toBeNull();
    soltar();
    await vi.waitFor(() => expect(r.numeros()!.dura).not.toBeNull());
  });

  it("lo leído de más arriba se guarda: cambiar el «desde» o las empresas no lo vuelve a pedir", async () => {
    const r = control({ desde: "7d", largo: "completo" });
    r.pedirParaMenu();
    await vi.waitFor(() => expect(r.numeros()!.duraMs).not.toBeNull());
    const antes = cadenasPedidas();
    r.cambiarOpciones({ desde: "hoy" });
    await vi.waitFor(() => expect(r.numeros()!.duraMs).not.toBeNull());
    r.cambiarOpciones({ co: ["JST"] });
    await vi.waitFor(() => expect(r.numeros()!.duraMs).not.toBeNull());
    expect(r.numeros()!.duraMs).toBe(duraCon(arbolEntero(), { ...r.op }));
    expect(cadenasPedidas()).toBe(antes);
  });

  it("si un pedido de origen no se puede leer, cuenta la tarea terminada y la cifra igual aparece", async () => {
    fallanCadenas = new Set(["p-tablero"]);
    const op: OpcionesResumen = { ...OPCIONES_OMISION, desde: "7d", largo: "completo" };
    const r = control(op);
    r.pedirParaMenu();
    await vi.waitFor(() => expect(r.numeros()!.duraMs).not.toBeNull());
    const a = arbolEntero();
    a.nodos.delete("p-tablero");
    a.sumar({ id: "p-tablero", identifier: null, titulo: "", parentId: null, rutina: false });
    expect(duraCon(a, op)).not.toBe(duraCon(arbolEntero(), op));
    expect(r.numeros()!.duraMs).toBe(duraCon(a, op));
  });
});

describe("no responde ninguna empresa (JST-262)", () => {
  it("los números van sin número, no en 0, y sin lo que dura", async () => {
    fallanListas = true;
    const r = control({ desde: "nuevo" });
    r.pedirParaMenu();
    await vi.waitFor(() => expect(r.numeros()!.ninguna).toBe(true));
    await vi.waitFor(() => expect(r.numeros()!.pidiendo).toBe(false));
    expect(r.numeros()).toMatchObject({ toca: null, trabajan: null, hecho: null, cola: null, dura: null, duraMs: null, ninguna: true, fallan: ["BET", "JST"] });
    expect(cadenasPedidas()).toBe(0);
  });

  it("con «Reintentar» en camino dice que está pidiendo, y vuelven los números si responde", async () => {
    fallanListas = true;
    const r = control({ desde: "7d" });
    r.pedirParaMenu();
    await vi.waitFor(() => expect(r.numeros()!.ninguna).toBe(true));
    await vi.waitFor(() => expect(r.numeros()!.pidiendo).toBe(false));
    fallanListas = false;
    r.reintentar();
    expect(r.numeros()!.pidiendo).toBe(true);
    await vi.waitFor(() => expect(r.numeros()!.duraMs).not.toBeNull());
    expect(r.numeros()).toMatchObject({ ninguna: false, hecho: 12, cola: 6, toca: 0, trabajan: 0 });
  });

  it("con las salas a oscuras también (la Oficina no las pudo leer)", () => {
    const r = control({ desde: "7d" }, oficina(["c-bet", "c-jst"]));
    expect(r.numeros()).toMatchObject({ toca: null, trabajan: null, hecho: null, cola: null, dura: null, ninguna: true });
  });

  it("si responde una, la otra sale en «fallan» y los números son los de la que responde", async () => {
    const r = control({ desde: "7d" }, oficina(["c-bet"]));
    r.pedirParaMenu();
    await vi.waitFor(() => expect(r.numeros()!.duraMs).not.toBeNull());
    expect(r.numeros()).toMatchObject({ ninguna: false, hecho: 8, cola: 4, fallan: ["BET"] });
  });
});

describe("«mientras no estabas» al abrir cuenta con la misma capa de datos (JST-415)", () => {
  it("cuántas se terminaron desde ese momento, por una lectura de lo terminado y otra de lo abierto por empresa", async () => {
    const r = control({});
    expect(await r.hechasDesde(AHORA - 2 * 3_600_000)).toBe(12);
    // Dos lecturas por empresa (2 empresas): ni una más, y sin las cadenas de padres (eso es para leer el Resumen).
    expect(llamadas.filter((u) => /\/issues\?/.test(u))).toHaveLength(4);
    expect(cadenasPedidas()).toBe(0);
    // Lo terminado hace 30 min no cuenta si la visita fue hace 10.
    expect(await control({}).hechasDesde(AHORA - 10 * 60_000)).toBe(0);
  });

  it("si no responde ninguna empresa, `null` (no 0); sin Oficina, tampoco", async () => {
    fallanListas = true;
    expect(await control({}).hechasDesde(AHORA - 3_600_000)).toBeNull();
    expect(await new ControlResumen().hechasDesde(AHORA - 3_600_000)).toBeNull();
  });
});
