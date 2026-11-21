// Lo que te preguntan en una tarea, para «Leer contexto» (JST-273), con tarjetas y comentarios reales de JSTM
// (leídos de la real el 25-10, solo con GET).
import { describe, expect, it } from "vitest";
import { dichoDeTarjeta, preguntaPendiente, TE_TOCA, teTocaDelHilo, type ComentarioHilo } from "../src/ui/contextoPregunta.js";
import type { Interaccion } from "../src/shared.js";

let n = 0;
const tarjeta = (kind: string, payload: Record<string, unknown>, extra: Partial<Interaccion> = {}): Interaccion => ({
  id: `i${++n}`,
  companyId: "jstm",
  issueId: "t1",
  kind,
  status: "pending",
  payload,
  createdAt: "2026-10-25T10:00:00.000Z",
  ...extra,
});
const comentario = (body: string, createdAt: string, extra: Partial<ComentarioHilo> = {}): ComentarioHilo => ({ id: `c${++n}`, body, createdAt, authorType: "agent", ...extra });

describe("la tarjeta pendiente", () => {
  it("JST-256: la pregunta de la confirmación, sin el correo entre paréntesis", () => {
    const t = tarjeta("request_confirmation", { prompt: "¿Ya está conectado Microsoft 365 (usuario@ejemplo.cl) en claude.ai?" });
    expect(preguntaPendiente([t])).toBe("Te pregunta: ¿Ya está conectado Microsoft 365 en claude.ai?");
  });

  it("JST-181: la pregunta de ask_user_questions", () => {
    const t = tarjeta("ask_user_questions", { questions: [{ id: "q1", prompt: "¿Cómo quieres pasar tu lista a la 0.1.12 en cada perfil?", options: [] }] });
    expect(preguntaPendiente([t])).toBe("Te pregunta: ¿Cómo quieres pasar tu lista a la 0.1.12 en cada perfil?");
  });

  it("varias preguntas: cuántas y cada una", () => {
    const t = tarjeta("ask_user_questions", {
      questions: [
        { id: "a", prompt: "¿Qué pasó al conectar Google Drive en Persona 1?" },
        { id: "b", prompt: "¿Enviaste la 0.1.12 a la tienda?" },
      ],
    });
    expect(preguntaPendiente([t])).toBe("Te pregunta 2 cosas: ¿Qué pasó al conectar Google Drive en Persona 1? ¿Enviaste la 0.1.12 a la tienda?");
  });

  it("más de 3 preguntas: las 3 primeras y cuántas faltan", () => {
    const t = tarjeta("ask_user_questions", { questions: ["¿Uno?", "¿Dos?", "¿Tres?", "¿Cuatro?"].map((prompt, i) => ({ id: `q${i}`, prompt })) });
    expect(preguntaPendiente([t])).toBe("Te pregunta 4 cosas: ¿Uno? ¿Dos? ¿Tres? Y una más.");
  });

  it("JST-269: un prompt largo se dice con su primera oración y la pregunta", () => {
    const t = tarjeta("request_confirmation", {
      prompt:
        "El botón «🔊 Leer contexto» quedó listo en la barra de herramientas de cada tarea. Al apretarlo lee en voz alta el título, el padre, la descripción y los últimos comentarios del hilo.\n\nCommit: 198723e (0.9.4). Las tareas hijas JST-270 (QA) y JST-271 (instalar) ya están creadas.\n\n¿Envío al QA?",
    });
    expect(preguntaPendiente([t])).toBe("Te pregunta: El botón Leer contexto quedó listo en la barra de herramientas de cada tarea. ¿Envío al QA?");
  });

  it("un prompt corto con la pregunta al final se dice entero", () => {
    const t = tarjeta("request_confirmation", { prompt: "Dejo la portada y la privacidad en Google Sites, en pestanas.jstm.co, como ya están, y no creo nada en GitHub. ¿De acuerdo?" });
    expect(preguntaPendiente([t])).toBe("Te pregunta: Dejo la portada y la privacidad en Google Sites, en pestanas.jstm.co, como ya están, y no creo nada en GitHub. ¿De acuerdo?");
  });

  it("un prompt largo con una lista: la pregunta del principio", () => {
    const t = tarjeta("request_confirmation", {
      prompt:
        "¿Cuál de las 3 propuestas de diseño para «Respaldo» quieres usar como base?\n\n- **A · Una sección más** — al final de Ajustes, copias en filas, confirmación en diálogo.\n- **B · Panel aparte** — un panel con su propio botón en la barra, más espacio para el historial de copias.\n- **C · Asistente** — pasos guiados la primera vez y después una línea en Ajustes con el estado.",
    });
    expect(preguntaPendiente([t])).toBe("Te pregunta: ¿Cuál de las 3 propuestas de diseño para Respaldo quieres usar como base?");
  });

  it("una confirmación sin pregunta y una de casillas", () => {
    const c = tarjeta("request_confirmation", { prompt: "Cuando hayas reiniciado Chrome (chrome://restart), confirma aquí y vuelvo a medir la memoria para comparar con antes." });
    expect(preguntaPendiente([c])).toBe("Te pide confirmar: Cuando hayas reiniciado Chrome, confirma aquí y vuelvo a medir la memoria para comparar con antes.");
    const k = tarjeta("request_checkbox_confirmation", { prompt: "Marca las funciones de Cubicle que quieres en la Oficina global.", options: [] });
    expect(preguntaPendiente([k])).toBe("Te pide: Marca las funciones de Cubicle que quieres en la Oficina global.");
  });

  it("tareas sugeridas: cuántas y de qué se trata", () => {
    const t = tarjeta("suggest_tasks", { tasks: [{ clientKey: "a", title: "Diseño" }, { clientKey: "b", title: "Programar" }, { clientKey: "c", title: "QA" }] }, { title: "Tareas para la 0.10.0" });
    expect(preguntaPendiente([t])).toBe("Te propone 3 tareas para que elijas cuáles crear: Tareas para la 0.10.0.");
    expect(preguntaPendiente([tarjeta("suggest_tasks", { tasks: [{ clientKey: "a", title: "Diseño" }] })])).toBe("Te propone una tarea para que elijas cuáles crear.");
  });

  it("solo las pendientes, la más nueva primero, y avisa si hay otra", () => {
    const vieja = tarjeta("request_confirmation", { prompt: "¿Sigo con este plan?" }, { createdAt: "2026-10-24T10:00:00.000Z" });
    const nueva = tarjeta("request_confirmation", { prompt: "¿Instalo la 0.9.5?" }, { createdAt: "2026-10-25T10:00:00.000Z" });
    const respondida = tarjeta("request_confirmation", { prompt: "¿Envío al QA?" }, { status: "accepted", createdAt: "2026-10-26T10:00:00.000Z" });
    expect(preguntaPendiente([respondida])).toBeNull();
    expect(preguntaPendiente([vieja, respondida, nueva])).toBe("Te pregunta: ¿Instalo la 0.9.5? Hay otra tarjeta esperando tu respuesta.");
    expect(preguntaPendiente([])).toBeNull();
  });

  it("no deja un signo suelto donde había un símbolo", () => {
    expect(dichoDeTarjeta("En ejemplo.cl y Camila: ↻. Tócalo cuando termines.")).toBe("En ejemplo.cl y Camila. Tócalo cuando termines.");
  });
});

describe("sin tarjeta: el último «🙋 Te toca»", () => {
  it("la primera frase del último comentario y lo que sigue", () => {
    const cs = [
      comentario("🙋 Te toca: revisar la implementación del botón «Leer contexto».\n\nQué se hizo:\n- Nuevo botón «🔊 Leer contexto» en la barra de herramientas de cada tarea.", "2026-10-25T20:07:00.000Z"),
      comentario("⏳ Avance: empecé.", "2026-10-25T19:00:00.000Z"),
    ];
    const r = teTocaDelHilo(cs);
    expect(r?.texto).toBe("Te toca: revisar la implementación del botón Leer contexto.");
    expect(r?.id).toBe(cs[0]!.id);
    expect(r?.resto).toMatch(/^Qué se hizo:/);
  });

  it("con negrita y sin emoji también", () => {
    expect(teTocaDelHilo([comentario("**🙋 Te toca:** hoy no pude leer tu Outlook. El conector no aparece.", "2026-10-25T10:03:40.124Z")])?.texto).toBe("Te toca: hoy no pude leer tu Outlook.");
    expect(teTocaDelHilo([comentario("Te toca: elegir una propuesta", "2026-10-25T10:03:40.124Z")])?.texto).toBe("Te toca: elegir una propuesta.");
  });

  it("JST-269: si después vino otro comentario, ya no te toca eso", () => {
    const cs = [
      comentario("⏳ Avance: recibí tu «Sí, enviar al QA».", "2026-10-26T00:50:00.000Z"),
      comentario("🙋 Te toca: revisar la implementación del botón «Leer contexto».", "2026-10-25T20:07:00.000Z"),
    ];
    expect(teTocaDelHilo(cs)).toBeNull();
  });

  it("un aviso de Paperclip después no cuenta, y el orden lo da la fecha", () => {
    const aviso = comentario("Paperclip automatically retried continuation for this assigned issue…", "2026-10-25T20:31:37.325Z", { authorType: "system", presentation: { kind: "system_notice" } });
    const toca = comentario("🙋 Te toca: hoy no pude leer tu Outlook.", "2026-10-25T10:03:40.124Z");
    const viejo = comentario("✅ Listo: el resumen salió.", "2026-10-24T10:00:00.000Z");
    expect(teTocaDelHilo([viejo, aviso, toca])?.texto).toBe("Te toca: hoy no pude leer tu Outlook.");
  });

  it("JST-256: el «Run completed» de Paperclip, que viene como de un agente, tampoco cuenta", () => {
    const run = comentario("Run completed. Agent did not post a summary comment this run (transcript withheld — see run log).", "2026-10-25T10:05:00.000Z");
    const toca = comentario("🙋 Te toca: hoy no pude leer tu Outlook.", "2026-10-25T10:03:40.124Z");
    expect(teTocaDelHilo([run, toca])?.id).toBe(toca.id);
  });

  it("un comentario que no es «Te toca», o ninguno: nada", () => {
    expect(teTocaDelHilo([comentario("Me toca revisar esto mañana: te toca después.", "2026-10-25T10:00:00.000Z")])).toBeNull();
    expect(teTocaDelHilo([])).toBeNull();
  });
});

describe("TE_TOCA no se queda rebuscando", () => {
  it("5.000 espacios al principio se resuelven en menos de 100 ms (con y sin «Te toca» al final)", () => {
    const t0 = performance.now();
    expect(TE_TOCA.test(`${" ".repeat(5000)}hola`)).toBe(false);
    expect(TE_TOCA.test(`${" ".repeat(5000)}**🙋 Te toca:** revisar`)).toBe(true);
    expect(TE_TOCA.test(`${" ".repeat(5000)}*_ 🙋 ${" ".repeat(5000)}te  toca`)).toBe(false);
    expect(performance.now() - t0).toBeLessThan(100);
  });

  it("sigue entendiendo el emoji, la negrita y los espacios de siempre", () => {
    for (const c of ["🙋 Te toca: x", "  **Te toca**: x", "_te toca_ : x", "🙋️ TE  TOCA :  x"]) expect(TE_TOCA.test(c), c).toBe(true);
    expect(TE_TOCA.exec("🙋 Te toca:   revisar")![0]).toBe("🙋 Te toca:   ");
    expect(TE_TOCA.test("Me toca revisar: x")).toBe(false);
  });
});
