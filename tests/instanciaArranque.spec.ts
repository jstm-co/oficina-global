// El orden de `conectarCompartido`: primero los datos de la instancia, después el sincronizador.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const eventos: string[] = [];
let liberar: () => void = () => undefined;

vi.mock("../src/ui/instanciaUi.js", () => ({
  alLlegarInstanciaTarde: () => () => undefined,
  cargarInstancia: () =>
    new Promise<void>((r) => {
      eventos.push("carga:pide");
      liberar = () => {
        eventos.push("carga:lista");
        r();
      };
    }),
}));
vi.mock("../src/sincronizador.js", () => ({
  Sincronizador: class {
    alCambiar() {
      return () => undefined;
    }
    async iniciar() {
      eventos.push("sync:inicia");
    }
    detener() {
      eventos.push("sync:detiene");
    }
    pausar() {}
    reanudar() {}
  },
}));

const documento = { hidden: false, addEventListener() {}, removeEventListener() {} };

beforeEach(() => {
  eventos.length = 0;
  vi.stubGlobal("document", documento);
});
afterEach(() => vi.unstubAllGlobals());

const asentar = () => new Promise((r) => setTimeout(r, 0));

describe("conectarCompartido y los datos de la instancia", () => {
  it("el sincronizador parte después de cargar la instancia", async () => {
    const { conectarCompartido, soltarCompartido } = await import("../src/ui/useOficina.js");
    conectarCompartido({ base: "" });
    await asentar();
    expect(eventos).toEqual(["carga:pide"]);
    liberar();
    await asentar();
    expect(eventos).toEqual(["carga:pide", "carga:lista", "sync:inicia"]);
    soltarCompartido();
  });

  it("si se suelta antes de que termine la carga, no inicia un sincronizador detenido", async () => {
    const { conectarCompartido, soltarCompartido } = await import("../src/ui/useOficina.js");
    conectarCompartido({ base: "" });
    soltarCompartido();
    liberar();
    await asentar();
    expect(eventos).toEqual(["carga:pide", "sync:detiene", "carga:lista"]);
  });

  it("si se suelta y se arma otro mientras carga, solo inicia el nuevo", async () => {
    const { conectarCompartido, soltarCompartido } = await import("../src/ui/useOficina.js");
    conectarCompartido({ base: "" });
    const primera = liberar;
    soltarCompartido();
    conectarCompartido({ base: "" });
    const segunda = liberar;
    primera();
    segunda();
    await asentar();
    expect(eventos.filter((e) => e === "sync:inicia")).toHaveLength(1);
    soltarCompartido();
  });
});
