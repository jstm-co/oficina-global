// Modal de tarea (JST-411): la parte sin React.
import { describe, expect, it } from "vitest";
import {
  ESTADOS_TAREA,
  abreAqui,
  autorComentario,
  comentariosVisibles,
  cuerpoComentario,
  nombreEstado,
  nombrePrioridad,
  responsableTarea,
  tareaDeHref,
  type ComentarioTarea,
} from "../src/tarea.js";

const normal = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
const agentes = [{ id: "ag-1", nombre: "Analista" }];

function comentario(id: string, createdAt: string, extra: Partial<ComentarioTarea> = {}): ComentarioTarea {
  return { id, body: `texto ${id}`, authorAgentId: null, authorUserId: null, createdAt, ...extra };
}

describe("tareaDeHref", () => {
  it("reconoce el código y el id, con consulta o ancla", () => {
    expect(tareaDeHref("/ABC/issues/ABC-12")).toEqual({ prefijo: "ABC", ref: "ABC-12" });
    expect(tareaDeHref("/ABC/issues/ABC-12/")).toEqual({ prefijo: "ABC", ref: "ABC-12" });
    expect(tareaDeHref("/ABC/issues/ABC-12?tab=a#comment-3")).toEqual({ prefijo: "ABC", ref: "ABC-12" });
    expect(tareaDeHref("/ABC/issues/11111111-2222-4333-8444-555555555555#interaction")).toEqual({ prefijo: "ABC", ref: "11111111-2222-4333-8444-555555555555" });
  });

  it("no reconoce listas, agentes, corridas ni rutas más largas", () => {
    expect(tareaDeHref("/ABC/issues")).toBeNull();
    expect(tareaDeHref("/ABC/issues/")).toBeNull();
    expect(tareaDeHref("/ABC/issues?x=1")).toBeNull();
    expect(tareaDeHref("/ABC/agents/ana")).toBeNull();
    expect(tareaDeHref("/ABC/agents/ana/runs/9")).toBeNull();
    expect(tareaDeHref("/ABC/issues/ABC-12/documents")).toBeNull();
    expect(tareaDeHref("https://otro.test/ABC/issues/ABC-12")).toBeNull();
    expect(tareaDeHref("ABC/issues/ABC-12")).toBeNull();
    expect(tareaDeHref("")).toBeNull();
  });
});

describe("abreAqui", () => {
  it("un clic normal abre aquí", () => {
    expect(abreAqui(normal)).toBe(true);
    expect(abreAqui({ ...normal, button: undefined })).toBe(true);
  });
  it("los gestos del navegador siguen el enlace", () => {
    expect(abreAqui({ ...normal, ctrlKey: true })).toBe(false);
    expect(abreAqui({ ...normal, metaKey: true })).toBe(false);
    expect(abreAqui({ ...normal, shiftKey: true })).toBe(false);
    expect(abreAqui({ ...normal, altKey: true })).toBe(false);
    expect(abreAqui({ ...normal, button: 1 })).toBe(false);
    expect(abreAqui({ ...normal, button: 2 })).toBe(false);
  });
});

describe("autor y responsable", () => {
  it("nombra a quien comentó: tú, un agente, otro usuario o el sistema", () => {
    expect(autorComentario(agentes, { authorUserId: "u1" }, "u1")).toEqual({ nombre: "Tú", yo: true, agente: false });
    expect(autorComentario(agentes, { authorUserId: "u2" }, "u1")).toEqual({ nombre: "Usuario", yo: false, agente: false });
    expect(autorComentario(agentes, { authorUserId: "u1" }, null).yo).toBe(false);
    expect(autorComentario(agentes, { authorAgentId: "ag-1" }, "u1")).toEqual({ nombre: "Analista", yo: false, agente: true });
    expect(autorComentario(agentes, { authorAgentId: "ag-9" }, "u1").nombre).toBe("Agente desconocido");
    expect(autorComentario(agentes, {}, "u1").nombre).toBe("Sistema");
  });

  it("dice quién lleva la tarea", () => {
    expect(responsableTarea(agentes, { assigneeAgentId: "ag-1" }, "u1")).toEqual({ nombre: "Analista", agente: true });
    expect(responsableTarea(agentes, { assigneeUserId: "u1" }, "u1")).toEqual({ nombre: "Tú", agente: false });
    expect(responsableTarea(agentes, { assigneeUserId: "u2" }, "u1")).toEqual({ nombre: "Usuario", agente: false });
    expect(responsableTarea(agentes, {}, "u1")).toBeNull();
  });
});

describe("comentarios", () => {
  it("muestra del más nuevo al más antiguo, sin borrados ni repetidos", () => {
    const vistos = comentariosVisibles([
      comentario("a", "2026-03-01T10:00:00.000Z"),
      comentario("c", "2026-03-03T10:00:00.000Z"),
      comentario("b", "2026-03-02T10:00:00.000Z", { deletedAt: "2026-03-02T11:00:00.000Z" }),
      comentario("c", "2026-03-03T10:00:00.000Z"),
    ]);
    expect(vistos.map((c) => c.id)).toEqual(["c", "a"]);
  });

  it("no envía vacíos y recorta los espacios", () => {
    expect(cuerpoComentario("  \n ")).toBeNull();
    expect(cuerpoComentario("  listo, sigue \n")).toBe("listo, sigue");
  });
});

describe("estados", () => {
  it("son siete, en orden, con nombre en español", () => {
    expect(ESTADOS_TAREA.map(nombreEstado)).toEqual(["Backlog", "Por hacer", "En curso", "En revisión", "Bloqueada", "Hecha", "Cancelada"]);
  });
  it("un estado o prioridad desconocidos se muestran tal cual", () => {
    expect(nombreEstado("raro")).toBe("raro");
    expect(nombreEstado(null)).toBe("—");
    expect(nombrePrioridad("high")).toBe("Alta");
    expect(nombrePrioridad("critical")).toBe("Crítica");
    expect(nombrePrioridad(null)).toBe("—");
  });
});
