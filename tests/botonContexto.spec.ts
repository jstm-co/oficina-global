// Lo que dice «Leer contexto» (JST-278): una descripción o un comentario corto también se lee
// («¿Lo publico hoy?», «Sí, dale.»), si después de limpiarlo queda algo que decir.
import { describe, expect, it, vi } from "vitest";
import { componerTexto } from "../src/ui/botonContexto.js";
import { enIngles } from "../src/ui/contextoVoz.js";

vi.mock("@paperclipai/plugin-sdk/ui", () => ({ useHostContext: () => ({}) }));
vi.mock("../src/ui/piso.js", () => ({ cx: () => "", Icono: () => null }));
vi.mock("../src/ui/sonido.js", () => ({ vocesDisponibles: () => [] }));

let n = 0;
const tarea = (description: string | null) => ({
  id: "t288",
  identifier: "JST-288",
  title: "Prueba QA270 hija con descripción corta",
  description,
  status: "in_review",
  ancestors: [{ id: "t181", identifier: "JST-181", title: "Pestañas guardadas: respaldo de la lista (¿Google Drive?)" }],
});
const comentario = (body: string, createdAt = "2026-10-25T10:00:00.000Z") => ({ id: `c${++n}`, body, createdAt, authorType: "user" });

describe("lo corto también se lee", () => {
  it("la descripción corta de la QA (JST-288): es la pregunta", () => {
    expect(componerTexto(tarea("¿Lo publico hoy?"), [], [])).toBe(
      "Tarea JST-288: Prueba QA270 hija con descripción corta. Es parte de JST-181: Pestañas guardadas: respaldo de la lista (¿Google Drive?). La tarea dice: ¿Lo publico hoy?",
    );
  });

  it("un comentario corto: lo último que pasó", () => {
    const texto = componerTexto(tarea("¿Lo publico hoy?"), [comentario("Sí, dale.")], []);
    expect(texto).toMatch(/ Lo último en el hilo: Sí, dale\.$/);
  });

  it("sin punto final se le pone, para que la voz pare antes del siguiente", () => {
    const texto = componerTexto(tarea(null), [comentario("Sí, dale", "2026-10-25T11:00:00.000Z"), comentario("¿Lo publico hoy?")], []);
    expect(texto).toMatch(/ Lo último en el hilo: Sí, dale\. ¿Lo publico hoy\?$/);
    expect(componerTexto(tarea("publicar hoy"), [], [])).toMatch(/ La tarea dice: publicar hoy\.$/);
  });

  it("lo que queda sin nada que decir no se lee ni ocupa un lugar", () => {
    const viejos = [comentario("Primero."), comentario("Segundo."), comentario("Tercero.")];
    const texto = componerTexto(tarea(null), [comentario("👍"), comentario("---"), ...viejos], []);
    expect(texto).toMatch(/ Lo último en el hilo: Primero\. Segundo\. Tercero\.$/);
    expect(componerTexto(tarea("![](captura.png)"), [comentario("🙌")], [])).not.toMatch(/La tarea dice|Lo último/);
  });

  it("una respuesta corta a un «🙋 Te toca» se lee después de la pregunta", () => {
    const pregunta = { ...comentario("🙋 Te toca: ¿lo publico hoy?", "2026-10-25T09:00:00.000Z"), authorType: "agent" };
    const texto = componerTexto(tarea(null), [comentario("Sí, dale.", "2026-10-25T10:00:00.000Z"), pregunta], []);
    expect(texto).toMatch(/ Lo último en el hilo: Sí, dale\. Te toca: ¿lo publico hoy\?$/);
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

  it("la descripción que empieza en inglés no se lee aunque termine en español", () => {
    expect(enIngles(plantilla)).toBe(false);
    const texto = componerTexto(tarea(plantilla), [comentario("Listo: el patrón es normal, la cierro como productiva.")], []);
    expect(texto).toBe(
      "Tarea JST-288: Prueba QA270 hija con descripción corta. Es parte de JST-181: Pestañas guardadas: respaldo de la lista (¿Google Drive?). Lo último en el hilo: Listo: el patrón es normal, la cierro como productiva.",
    );
  });

  it("un comentario que empieza en inglés tampoco; el siguiente en español sí", () => {
    const enInglesPrimero = comentario(
      "The agent moved this issue to review because the build was green and there was nothing else to do on it. " +
        "Después lo revisé yo: está bien, falta que la QA lo pruebe en la copia y que el usuario lo apruebe. ".repeat(4),
      "2026-10-25T11:00:00.000Z",
    );
    expect(enIngles(enInglesPrimero.body)).toBe(false);
    const texto = componerTexto(tarea(null), [enInglesPrimero, comentario("Sí, dale.")], []);
    expect(texto).toMatch(/ Lo último en el hilo: Sí, dale\.$/);
  });
});
