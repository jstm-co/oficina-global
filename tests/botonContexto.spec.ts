// Lo que dice «Leer contexto» y de dónde salen los datos (JST-278, JST-414): una descripción o un comentario corto
// también se lee («¿Lo publico hoy?», «Sí, dale.»); lo que queda sin nada que decir no se lee; lo escrito en inglés
// tampoco. `informeDeTarea` baja la tarea, el hilo, las tarjetas y los nombres de los agentes (fetch de mentira).
import { afterEach, describe, expect, it, vi } from "vitest";
import { agentesDelInforme, informeDeTarea, textoDeTarea } from "../src/ui/botonContexto.js";
import { enIngles } from "../src/ui/contextoVoz.js";
import type { Interaccion } from "../src/shared.js";

vi.mock("@paperclipai/plugin-sdk/ui", () => ({ useHostContext: () => ({}) }));
vi.mock("../src/ui/piso.js", () => ({ cx: () => "", Icono: () => null }));
vi.mock("../src/ui/sonido.js", () => ({ vocesDisponibles: () => [] }));

const ahora = new Date(2026, 9, 25, 12, 0, 0).getTime();
const HORA = 3_600_000;
const iso = (ms: number) => new Date(ahora - ms).toISOString();

let n = 0;
const tarea = (description: string | null, extra: Record<string, unknown> = {}) => ({
  id: "t288",
  identifier: "JST-288",
  title: "Preparar el boletín del mes",
  description,
  status: "in_review",
  ancestors: [{ id: "t12", identifier: "ABC-12", title: "Publicar el catálogo: revisar la lista (¿Versión nueva?)" }],
  ...extra,
});
const comentario = (body: string, hace = 2 * HORA, extra: Record<string, unknown> = {}) => ({ id: `c${++n}`, body, createdAt: iso(hace), authorType: "user", ...extra });

interface Mundo {
  tarea: Record<string, unknown>;
  comentarios?: unknown[];
  tarjetas?: unknown[];
  agentes?: Record<string, string | null>;
  /** Estas rutas responden error. */
  caen?: RegExp[];
  /** Estas rutas ni responden: el `fetch` se rechaza (red caída). */
  rechazan?: RegExp[];
}

/** Un `fetch` que contesta como la API de Paperclip; devuelve las rutas pedidas. */
function mundo(m: Mundo): string[] {
  const pedidas: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      pedidas.push(url);
      const responde = (cuerpo: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => cuerpo });
      if (m.rechazan?.some((r) => r.test(url))) throw new TypeError("Failed to fetch");
      if (m.caen?.some((r) => r.test(url))) return responde(null, false);
      if (/\/api\/agents\//.test(url)) {
        const id = decodeURIComponent(url.split("/").pop()!);
        return m.agentes && id in m.agentes && m.agentes[id] ? responde({ name: m.agentes[id] }) : responde(null, false);
      }
      if (/\/comments\?/.test(url)) return responde(m.comentarios ?? []);
      if (/\/interactions$/.test(url)) return responde({ items: m.tarjetas ?? [] });
      return responde(m.tarea);
    }),
  );
  return pedidas;
}

afterEach(() => vi.unstubAllGlobals());

const leer = async (m: Mundo, nivel: "corto" | "completo" = "completo") => (await informeDeTarea("JST-288", nivel, ahora)).frases.join(" ");

describe("lo corto también se lee", () => {
  it("una descripción corta (JST-288): es la pregunta", async () => {
    mundo({ tarea: tarea("¿Lo publico hoy?") });
    const { informe, frases } = await informeDeTarea("JST-288", "completo", ahora);
    expect(informe.secciones.map((s) => s.clave)).toEqual(["tarea", "estado", "depende"]);
    expect(frases).toEqual([
      "Tarea JST-288: Preparar el boletín del mes.",
      "La tarea dice: ¿Lo publico hoy?",
      "Está en revisión.",
      // El paréntesis del título del padre no se dice.
      "Es parte de ABC-12: Publicar el catálogo: revisar la lista.",
    ]);
  });

  it("un comentario corto: lo último que pasó", async () => {
    mundo({ tarea: tarea("¿Lo publico hoy?"), comentarios: [comentario("Sí, dale.")] });
    expect(await leer({ tarea: {} })).toMatch(/Lo último lo escribiste tú, hace 2 horas: Sí, dale\.$/);
  });

  it("sin punto final se le pone, para que la voz pare antes del siguiente", async () => {
    mundo({ tarea: tarea(null), comentarios: [comentario("Sí, dale", 1 * HORA)] });
    expect(await leer({ tarea: {} })).toMatch(/Sí, dale\.$/);
    mundo({ tarea: tarea("publicar hoy") });
    expect(await leer({ tarea: {} })).toMatch(/La tarea dice: publicar hoy\./);
  });

  it("lo que queda sin nada que decir no se lee ni ocupa un lugar", async () => {
    mundo({ tarea: tarea(null), comentarios: [comentario("👍", 1 * HORA), comentario("---", 2 * HORA), comentario("Primero.", 3 * HORA)] });
    const texto = await leer({ tarea: {} });
    expect(texto).toMatch(/Lo último lo escribiste tú, hace 3 horas: Primero\./);
    expect(texto).not.toMatch(/👍|---/);
    mundo({ tarea: tarea("![](captura.png)"), comentarios: [comentario("🙌")] });
    expect(await leer({ tarea: {} })).not.toMatch(/La tarea dice|Lo último/);
  });

  it("una respuesta corta a un «🙋 Te toca» se lee después de la pregunta", async () => {
    const pregunta = comentario("🙋 Te toca: ¿lo publico hoy?", 3 * HORA, { authorType: "agent" });
    mundo({ tarea: tarea(null), comentarios: [comentario("Sí, dale.", 2 * HORA), pregunta] });
    const { informe } = await informeDeTarea("JST-288", "completo", ahora);
    // La respuesta vino después del «Te toca»: ya no te toca eso; se lee como lo último del hilo y lo anterior.
    expect(informe.secciones.map((s) => s.clave)).not.toContain("pregunta");
    const va = informe.secciones.find((s) => s.clave === "va")!.frases;
    expect(va[0]).toBe("Lo último lo escribiste tú, hace 2 horas: Sí, dale.");
    expect(va[1]).toMatch(/Te toca: ¿lo publico hoy\?$/);
  });
});

describe("el inglés se mira en lo que se lee (JST-310)", () => {
  // Como las «Review productivity for …» que crea Paperclip: la plantilla en inglés y, al final,
  // los comentarios del agente en español. Entera tiene más español que inglés.
  const avance = "- run `abc1234`: ⏳ Avance: ya está el arreglo del caso, falta que la QA lo vea en la copia y que el usuario lo apruebe en la tarjeta.";
  const plantilla = [
    "Paperclip detected an unusual productivity/progression pattern on an assigned issue.",
    "## Source",
    "- Source issue: [JST-900](/JST/issues/JST-900)\n- Assigned agent: Agente de prueba (qa)\n- Primary trigger: `high_churn` (High churn)",
    "- Trigger reasons: 11 runs/6 assignee-run comments in 1h; 11 runs/6 assignee-run comments in 6h",
    "## Latest Assignee Run Comments",
    Array(8).fill(avance).join("\n"),
  ].join("\n\n");

  it("la descripción que empieza en inglés no se lee aunque termine en español", async () => {
    expect(enIngles(plantilla)).toBe(false);
    mundo({ tarea: tarea(plantilla), comentarios: [comentario("Listo: el patrón es normal, la cierro como productiva.")] });
    const texto = await leer({ tarea: {} });
    expect(texto).not.toMatch(/La tarea dice|Paperclip detected|Source/);
    expect(texto).toMatch(/Listo: el patrón es normal, la cierro como productiva\.$/);
  });

  it("un comentario que empieza en inglés tampoco; el siguiente en español sí", async () => {
    const enInglesPrimero = comentario(
      "The agent moved this issue to review because the build was green and there was nothing else to do on it. " +
        "Después lo revisé yo: está bien, falta que la QA lo pruebe en la copia y que el usuario lo apruebe. ".repeat(4),
      1 * HORA,
    );
    expect(enIngles(enInglesPrimero.body)).toBe(false);
    mundo({ tarea: tarea(null), comentarios: [enInglesPrimero, comentario("Sí, dale.", 2 * HORA)] });
    const texto = await leer({ tarea: {} });
    expect(texto).toMatch(/Sí, dale\.$/);
    expect(texto).not.toContain("The agent moved");
  });
});

describe("informeDeTarea", () => {
  it("devuelve el informe y sus frases en el mismo orden (para leer y para dejar escrito)", async () => {
    mundo({
      tarea: tarea(null, { assigneeAgentId: "a1" }),
      tarjetas: [{ id: "i1", kind: "request_confirmation", status: "pending", createdAt: iso(3 * HORA), createdByAgentId: "a1", payload: { prompt: "¿Publico la guía hoy?" } }],
      agentes: { a1: "Marta Redacción" },
    });
    const { informe, frases } = await informeDeTarea("JST-288", "completo", ahora);
    expect(informe.secciones.map((s) => s.clave)).toEqual(["pide", "pregunta", "depende"]);
    expect(frases).toEqual(informe.secciones.flatMap((s) => s.frases));
    expect(frases[0]).toBe("Marta Redacción te espera desde hace 3 horas.");
  });

  it("el nivel corto es más corto que el completo", async () => {
    const datos: Mundo = {
      tarea: tarea("Hay que entregar la guía de inicio. Es importante hacerlo antes del viernes.", { updatedAt: iso(4 * 24 * HORA) }),
      comentarios: [comentario("Terminé el borrador de la guía y falta la revisión.", 2 * HORA, { authorType: "agent", authorAgentId: "a1" })],
      agentes: { a1: "Marta Redacción" },
    };
    mundo(datos);
    const corto = (await informeDeTarea("JST-288", "corto", ahora)).frases;
    const completo = (await informeDeTarea("JST-288", "completo", ahora)).frases;
    expect(corto.length).toBeLessThan(completo.length);
  });

  it("por omisión es el completo", async () => {
    mundo({ tarea: tarea("Hay que entregar la guía de inicio."), comentarios: [comentario("Terminé la guía.", 2 * HORA, { authorType: "agent" })] });
    expect((await informeDeTarea("JST-288")).frases.length).toBeGreaterThan(0);
  });

  it("si no se puede bajar la tarea, falla (el botón dice «No se pudo»)", async () => {
    mundo({ tarea: tarea(null), caen: [/\/api\/issues\/JST-288$/] });
    await expect(informeDeTarea("JST-288", "completo", ahora)).rejects.toThrow(/HTTP 500/);
  });

  it("si fallan el hilo, las tarjetas o los nombres, se lee igual con lo que hay", async () => {
    mundo({ tarea: tarea("Hay que entregar la guía de inicio."), caen: [/\/comments\?/, /\/interactions$/, /\/api\/agents\//], agentes: {} });
    const { frases } = await informeDeTarea("JST-288", "completo", ahora);
    expect(frases[0]).toBe("Tarea JST-288: Preparar el boletín del mes.");
  });

  it("si el hilo, las tarjetas o los nombres ni responden (red caída), se lee igual", async () => {
    mundo({ tarea: tarea("Hay que entregar la guía de inicio."), rechazan: [/\/comments\?/, /\/interactions$/, /\/api\/agents\//] });
    const { frases } = await informeDeTarea("JST-288", "completo", ahora);
    expect(frases[0]).toBe("Tarea JST-288: Preparar el boletín del mes.");
  });

  it("datos con forma rara en el hilo o las tarjetas no rompen la lectura", async () => {
    mundo({ tarea: tarea("Hay que entregar la guía de inicio."), comentarios: [null, comentario("Terminé la guía.")] as unknown[], tarjetas: [null, 5] as unknown[] });
    const { frases } = await informeDeTarea("JST-288", "completo", ahora);
    expect(frases.join(" ")).toContain("Terminé la guía.");
  });

  it("pide el código de la tarea con su ruta y los 20 últimos comentarios", async () => {
    const pedidas = mundo({ tarea: tarea(null) });
    await informeDeTarea("JST-288", "completo", ahora);
    expect(pedidas).toContain("/api/issues/JST-288");
    expect(pedidas).toContain("/api/issues/JST-288/comments?limit=20&order=desc");
    expect(pedidas).toContain("/api/issues/JST-288/interactions");
  });

  it("los comentarios pueden venir como lista o dentro de «items»", async () => {
    mundo({ tarea: tarea(null) });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        status: 200,
        json: async () => (/\/comments\?/.test(url) ? { items: [comentario("Sí, dale.", 1 * HORA)] } : /\/interactions$/.test(url) ? [] : tarea(null)),
      })),
    );
    expect(await leer({ tarea: {} })).toMatch(/Sí, dale\.$/);
  });

  it("textoDeTarea sigue dando todo en un solo texto", async () => {
    mundo({ tarea: tarea("Hay que entregar la guía de inicio.") });
    const texto = await textoDeTarea("JST-288");
    expect(texto).toBe((await informeDeTarea("JST-288")).frases.join(" "));
  });
});

describe("agentesDelInforme: los agentes que el informe puede nombrar", () => {
  const pendiente = (id: string, creada: number, quien: string | null): Interaccion =>
    ({ id, kind: "request_confirmation", status: "pending", createdAt: iso(creada), createdByAgentId: quien, payload: {} }) as unknown as Interaccion;
  const base = { id: "t1", identifier: "ABC-1", title: "x", description: null, status: "todo" };

  it("quien pregunta (la tarjeta más nueva), quien tiene la tarea, los dos últimos que escribieron y quien tiene la que la frena", () => {
    const ids = agentesDelInforme(
      { ...base, assigneeAgentId: "tiene", blockedBy: [{ status: "done", assigneeAgentId: "cerrada" }, { status: "in_progress", assigneeAgentId: "frena" }] },
      [
        comentario("Uno.", 5 * HORA, { authorAgentId: "viejo" }),
        comentario("Dos.", 2 * HORA, { authorAgentId: "ultimo" }),
        comentario("Tres.", 3 * HORA, { authorAgentId: "penultimo" }),
      ],
      [pendiente("i0", 9 * HORA, "antigua"), pendiente("i1", 1 * HORA, "pregunta")],
    );
    expect(ids).toEqual(["pregunta", "tiene", "ultimo", "penultimo"]);
  });

  it("sin repetir y con un tope de 4", () => {
    const ids = agentesDelInforme(
      { ...base, assigneeAgentId: "a" },
      [comentario("Uno.", 1 * HORA, { authorAgentId: "a" }), comentario("Dos.", 2 * HORA, { authorAgentId: "b" })],
      [pendiente("i1", 1 * HORA, "a")],
    );
    expect(ids).toEqual(["a", "b"]);
    const muchos = agentesDelInforme({ ...base, assigneeAgentId: "a", blockedBy: [{ status: "todo", assigneeAgentId: "e" }] }, [comentario("x.", HORA, { authorAgentId: "b" }), comentario("y.", 2 * HORA, { authorAgentId: "c" })], [pendiente("i", HORA, "d")]);
    expect(muchos).toHaveLength(4);
    expect(muchos).not.toContain("e");
  });

  it("los avisos automáticos y los comentarios vacíos no cuentan, ni lo que no tiene agente", () => {
    const ids = agentesDelInforme(
      base,
      [comentario("Aviso.", 1 * HORA, { authorAgentId: "sistema", presentation: { kind: "system_notice" } }), comentario("   ", 2 * HORA, { authorAgentId: "mudo" }), comentario("Persona.", 3 * HORA)],
      [],
    );
    expect(ids).toEqual([]);
  });

  it("una tarjeta ya respondida no cuenta", () => {
    const resuelta = { ...pendiente("i1", 1 * HORA, "respondida"), status: "accepted" } as Interaccion;
    expect(agentesDelInforme({ ...base, assigneeAgentId: "a" }, [], [resuelta])).toEqual(["a"]);
  });
});

describe("los nombres de los agentes", () => {
  it("se nombran los que se pudieron bajar; el que falla queda sin nombre («Te esperan…»)", async () => {
    mundo({
      tarea: tarea(null, { assigneeAgentId: "a2", status: "blocked" }),
      tarjetas: [{ id: "i1", kind: "request_confirmation", status: "pending", createdAt: iso(3 * HORA), createdByAgentId: "a1", payload: { prompt: "¿Publico la guía hoy?" } }],
      agentes: { a1: null, a2: "Lucho Revisor" },
    });
    const { frases } = await informeDeTarea("JST-288", "completo", ahora);
    expect(frases[0]).toBe("Te esperan desde hace 3 horas.");
    expect(frases.join(" ")).toContain("la tiene Lucho Revisor");
  });
});
