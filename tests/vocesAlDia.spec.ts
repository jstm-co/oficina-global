// «Preparar voces» y las voces al día, en la página (0.13.0, issue #9): qué se le manda al worker y cuándo.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eleccionInicial, type EleccionVoces } from "../src/eleccionVoces.js";
import type { EstadoMotores, EstadoPreparar } from "../src/vozViva.js";

const cargarIndice = vi.fn(async (_forzar?: boolean) => null);
const accionPlugin = vi.fn();

vi.mock("../src/ui/audiosVoces.js", () => ({ baseUi: async () => "/_plugins/x/ui/", cargarIndice: (f?: boolean) => cargarIndice(f), instalacion: async () => "x" }));
vi.mock("../src/fuentes.js", () => ({ accionPlugin: (...a: unknown[]) => accionPlugin(...a) }));
vi.mock("../src/ui/vozViva.js", () => ({ estadoVozViva: async () => null }));

const AL_DIA: EleccionVoces = { ...eleccionInicial(), motores: ["supertonic"], alDia: true };
const AGENTES = [
  { id: "a1", nombre: "Diseño", empresa: "Acme" },
  { id: "a2", nombre: "Backend", empresa: "Acme" },
];

const preparar = (fase: EstadoPreparar["fase"], hechas = 0, total = 0): EstadoPreparar => ({ fase, modelo: null, bajado: 0, pesa: 0, hechas, total, fallas: 0, sinMotor: 0, motivo: null });
const motores = (p: EstadoPreparar): EstadoMotores => ({ motores: { supertonic: null, kokoro: "falta uv", edge: "falta uv", clones: "falta uv" }, porBajar: { supertonic: 0, kokoro: 0 }, preparar: p });

/** Lo que guardó el worker (`eleccion.json`) y cómo va «Preparar voces». */
let guardada: EleccionVoces;
let estado: EstadoPreparar;

async function cargar() {
  vi.resetModules();
  return await import("../src/ui/eleccion.js");
}

const alDiaMandados = () => accionPlugin.mock.calls.filter((c) => c[2] === "voz-al-dia").map((c) => c[4] as Record<string, unknown>);

beforeEach(() => {
  cargarIndice.mockClear();
  accionPlugin.mockReset();
  guardada = eleccionInicial();
  estado = preparar("nada");
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify(guardada), { status: 200 }));
  accionPlugin.mockImplementation(async (_cx: unknown, _id: string, clave: string, _c: string, params: Record<string, unknown>) => {
    if (clave === "voz-al-dia" && params.empezar) guardada = { ...guardada, motores: params.motores as EleccionVoces["motores"], alDia: true };
    if (clave === "voz-al-dia") return { ok: true, eleccion: guardada, ...motores(estado) };
    return { disponible: true, motivo: null, eleccion: guardada, grabando: [], cambios: false, ...motores(estado) };
  });
});

describe("los agentes que se ven van al worker", () => {
  it("sin «Preparar voces» (no está al día), no se manda nada", async () => {
    const { mantenerAlDia } = await cargar();
    await mantenerAlDia("c1", AGENTES);
    expect(alDiaMandados()).toEqual([]);
  });

  it("al día: se mandan una vez, y otra cuando hay uno nuevo o cambia un nombre", async () => {
    guardada = AL_DIA;
    const { mantenerAlDia } = await cargar();
    await mantenerAlDia("c1", AGENTES);
    await mantenerAlDia("c1", [...AGENTES].reverse());
    expect(alDiaMandados()).toEqual([{ agentes: AGENTES }]);
    await mantenerAlDia("c1", [...AGENTES, { id: "a3", nombre: "QA", empresa: "Acme" }]);
    await mantenerAlDia("c1", [{ ...AGENTES[0]!, nombre: "Diseño UX" }, AGENTES[1]!]);
    expect(alDiaMandados()).toHaveLength(3);
    // Cada empresa lleva su cuenta.
    await mantenerAlDia("c2", [{ id: "b1", nombre: "CEO", empresa: "Beta" }]);
    expect(alDiaMandados()).toHaveLength(4);
  });
});

describe("el botón «Preparar voces»", () => {
  it("manda los motores elegidos y los agentes, y esos agentes no se vuelven a mandar enseguida", async () => {
    const { mantenerAlDia, prepararVoces, eleccionAhora } = await cargar();
    expect(await prepararVoces("c1", AGENTES, ["supertonic", "edge"])).toBe(true);
    expect(alDiaMandados()).toEqual([{ agentes: AGENTES, motores: ["supertonic", "edge"], empezar: true }]);
    expect(eleccionAhora().alDia).toBe(true);
    await mantenerAlDia("c1", AGENTES);
    expect(alDiaMandados()).toHaveLength(1);
  });

  it("si el worker no responde, lo dice (para volver a intentarlo)", async () => {
    accionPlugin.mockImplementation(async () => {
      throw new Error("sin red");
    });
    const { prepararVoces } = await cargar();
    expect(await prepararVoces("c1", AGENTES, ["supertonic"])).toBe(false);
  });

  it("al terminar de grabar se vuelve a leer el índice (los agentes hablan con las voces nuevas)", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    try {
      const { prepararVoces, refrescarEstado } = await cargar();
      estado = preparar("grabando", 0, 10);
      await prepararVoces("c1", AGENTES, ["supertonic"]);
      expect(cargarIndice).not.toHaveBeenCalled();
      estado = preparar("listo", 10, 10);
      await refrescarEstado("c1");
      expect(cargarIndice).toHaveBeenCalledWith(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
