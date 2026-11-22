// El cargador de la interfaz: lee `instancia.json` de la base de la UI, con tope de 4 s y sin lanzar nunca.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INSTANCIA_VACIA, instancia, ponerInstancia } from "../src/datosInstancia.js";
import { alLlegarInstanciaTarde, cargarInstancia, olvidarInstanciaCargada, TOPE_INSTANCIA_MS } from "../src/ui/instanciaUi.js";

const respuesta = (cuerpo: string, status = 200) => new Response(cuerpo, { status });

beforeEach(() => {
  olvidarInstanciaCargada();
  ponerInstancia(INSTANCIA_VACIA);
  vi.stubGlobal("location", { pathname: "/_plugins/00000000-0000-4000-8000-000000000001/ui/tv.html" });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  ponerInstancia(INSTANCIA_VACIA);
  olvidarInstanciaCargada();
});

describe("cargarInstancia", () => {
  it("lee instancia.json de la base de la UI, sin caché y con la sesión, y deja los datos puestos", async () => {
    const pedir = vi.fn(async () => respuesta(JSON.stringify({ aspectoFijo: { "agente-1": "qa-1" }, nombresCortos: { A: "B" } })));
    vi.stubGlobal("fetch", pedir);
    await cargarInstancia();
    expect(pedir).toHaveBeenCalledTimes(1);
    const [url, opciones] = pedir.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/^\/_plugins\/00000000-0000-4000-8000-000000000001\/ui\/instancia\.json\?t=\d+$/);
    expect(opciones).toMatchObject({ credentials: "include", cache: "no-store" });
    expect(instancia().aspectoFijo).toEqual({ "agente-1": "qa-1" });
    expect(instancia().nombresCortos).toEqual({ A: "B" });
  });

  it("está memorizada: una sola lectura aunque se llame varias veces", async () => {
    const pedir = vi.fn(async () => respuesta("{}"));
    vi.stubGlobal("fetch", pedir);
    await Promise.all([cargarInstancia(), cargarInstancia()]);
    await cargarInstancia();
    expect(pedir).toHaveBeenCalledTimes(1);
  });

  it("404: datos vacíos, sin lanzar", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respuesta("no está", 404)));
    await expect(cargarInstancia()).resolves.toBeUndefined();
    expect(instancia()).toEqual(INSTANCIA_VACIA);
  });

  it("JSON malo: datos vacíos, sin lanzar", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respuesta("{ no es json")));
    await expect(cargarInstancia()).resolves.toBeUndefined();
    expect(instancia()).toEqual(INSTANCIA_VACIA);
  });

  it("error de red: datos vacíos, sin lanzar", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("red caída"))));
    await expect(cargarInstancia()).resolves.toBeUndefined();
    expect(instancia()).toEqual(INSTANCIA_VACIA);
  });

  it("pasados 4 s se resuelve igual, con datos vacíos, aunque el servidor no responda; si el archivo llega después, se aplica", async () => {
    vi.useFakeTimers();
    let llegar: (r: Response) => void = () => undefined;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => (llegar = r))));
    let lista = false;
    const p = cargarInstancia().then(() => (lista = true));
    await vi.advanceTimersByTimeAsync(TOPE_INSTANCIA_MS - 1);
    expect(lista).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    await p;
    expect(lista).toBe(true);
    expect(instancia()).toEqual(INSTANCIA_VACIA);
    llegar(respuesta(JSON.stringify({ nombresCortos: { A: "B" } })));
    await vi.advanceTimersByTimeAsync(10);
    expect(instancia().nombresCortos).toEqual({ A: "B" });
  });

  it("si no se pudo leer (404), la próxima llamada vuelve a intentar; si se pudo, queda memorizada", async () => {
    const pedir = vi.fn(async () => respuesta("{}", 404));
    vi.stubGlobal("fetch", pedir);
    await cargarInstancia();
    pedir.mockImplementation(async () => respuesta(JSON.stringify({ nombresCortos: { A: "B" } })));
    await cargarInstancia();
    expect(pedir).toHaveBeenCalledTimes(2);
    expect(instancia().nombresCortos).toEqual({ A: "B" });
    await cargarInstancia();
    expect(pedir).toHaveBeenCalledTimes(2);
  });

  it("avisa a los oyentes solo cuando los datos llegan después del tope", async () => {
    vi.useFakeTimers();
    const oyente = vi.fn();
    const quitar = alLlegarInstanciaTarde(oyente);
    let llegar: (r: Response) => void = () => undefined;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => (llegar = r))));
    const p = cargarInstancia();
    await vi.advanceTimersByTimeAsync(TOPE_INSTANCIA_MS + 1);
    await p;
    expect(oyente).not.toHaveBeenCalled();
    llegar(respuesta(JSON.stringify({ nombresCortos: { A: "B" } })));
    await vi.advanceTimersByTimeAsync(10);
    expect(oyente).toHaveBeenCalledTimes(1);
    quitar();
  });
});
