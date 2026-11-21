// Franja «Te necesitan» y menú «Ambiente» (JST-410): la lógica pura que no necesita pintar nada.
import { describe, expect, it, vi } from "vitest";
import type { EstadoIa } from "../src/ia/escritor.js";
import type { AgenteVista } from "../src/vista.js";

vi.mock("@paperclipai/plugin-sdk/ui", () => ({ usePluginToast: () => () => undefined }));
const { esperanOrdenados } = await import("../src/ui/franjaToca.js");
const { estadoMascotas, estadoVoces } = await import("../src/ui/menuAmbiente.js");
const { resumenConversaciones } = await import("../src/ui/menuConversaciones.js");

function agente(id: string, nombre: string, espera: string | null): AgenteVista {
  return {
    id,
    nombre,
    prefijo: "AAA",
    need: espera !== null,
    desde: null,
    teNecesita: espera ? [{ identifier: id, titulo: "algo", tipo: "interaccion", clase: "pregunta", desde: espera }] : [],
    st: espera ? "toca" : "libre",
  } as unknown as AgenteVista;
}

describe("esperanOrdenados", () => {
  it("deja solo a los que te necesitan, el que espera hace más primero", () => {
    const lista = [agente("a3", "Carla", null), agente("a2", "Beto", "2026-01-01T10:05:00Z"), agente("a1", "Ana", "2026-01-01T10:00:00Z")];
    expect(esperanOrdenados(lista).map((a) => a.id)).toEqual(["a1", "a2"]);
  });
  it("no toca la lista que recibe", () => {
    const lista = [agente("a2", "Beto", "2026-01-01T10:05:00Z"), agente("a1", "Ana", "2026-01-01T10:00:00Z")];
    esperanOrdenados(lista);
    expect(lista.map((a) => a.id)).toEqual(["a2", "a1"]);
  });
  it("sin esperas, vacío", () => {
    expect(esperanOrdenados([agente("a1", "Ana", null)])).toEqual([]);
  });
});

describe("estados de las filas de «Ambiente»", () => {
  it("voces y mascotas", () => {
    expect(estadoVoces(true)).toBe("Activadas");
    expect(estadoVoces(false)).toBe("Apagadas");
    expect(estadoMascotas(true)).toBe("Visibles");
    expect(estadoMascotas(false)).toBe("Ocultas");
  });
  it("conversaciones: ocultas, frases de siempre o el estado de la IA", () => {
    const lista: EstadoIa = { k: "lista" } as EstadoIa;
    expect(resumenConversaciones(false, "ia", lista)).toBe("Ocultas");
    expect(resumenConversaciones(true, "hoy", lista)).toBe("Frases de siempre");
    expect(resumenConversaciones(true, "ia", lista)).toBe("Con la IA");
    expect(resumenConversaciones(true, "ia", { k: "bajando", avance: 0.426 } as EstadoIa)).toBe("Bajando · 42 %");
    expect(resumenConversaciones(true, "ia", { k: "bajando", avance: null } as EstadoIa)).toBe("Bajando la IA");
    expect(resumenConversaciones(true, "ia", { k: "sin", por: "otro" } as EstadoIa)).toBe("Frases de siempre");
    expect(resumenConversaciones(true, "ia", { k: "fallo" } as EstadoIa)).toBe("IA sin bajar");
  });
});
