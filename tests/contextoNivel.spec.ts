// El nivel de «Leer contexto», corto o completo (JST-414): se guarda en localStorage, sirve en memoria si el navegador
// no deja guardar, y avisa a quien lo mira (el botón de la barra y los paneles viven en componentes distintos).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLAVE_NIVEL, fijarNivel, nivelContexto, olvidarNivel, suscribirNivel } from "../src/ui/contextoNivel.js";

class Almacen {
  datos = new Map<string, string>();
  getItem = vi.fn((k: string) => this.datos.get(k) ?? null);
  setItem = vi.fn((k: string, v: string) => void this.datos.set(k, v));
}

let almacen: Almacen;
beforeEach(() => {
  almacen = new Almacen();
  vi.stubGlobal("localStorage", almacen);
  olvidarNivel();
});
afterEach(() => {
  vi.unstubAllGlobals();
  olvidarNivel();
});

describe("el nivel guardado", () => {
  it("la clave es la del plugin y por omisión es «completo»", () => {
    expect(CLAVE_NIVEL).toBe("jstm.oficina-pixel.contexto");
    expect(nivelContexto()).toBe("completo");
  });

  it("toma lo guardado, «corto» o «completo»", () => {
    almacen.datos.set(CLAVE_NIVEL, "corto");
    expect(nivelContexto()).toBe("corto");
    olvidarNivel();
    almacen.datos.set(CLAVE_NIVEL, "completo");
    expect(nivelContexto()).toBe("completo");
  });

  it("lo que no es un nivel se ignora", () => {
    almacen.datos.set(CLAVE_NIVEL, "larguísimo");
    expect(nivelContexto()).toBe("completo");
  });

  it("lo lee una vez: las demás veces sirve el de memoria", () => {
    nivelContexto();
    nivelContexto();
    expect(almacen.getItem).toHaveBeenCalledTimes(1);
  });
});

describe("fijarNivel", () => {
  it("cambia el nivel y lo guarda", () => {
    fijarNivel("corto");
    expect(nivelContexto()).toBe("corto");
    expect(almacen.setItem).toHaveBeenCalledWith(CLAVE_NIVEL, "corto");
    expect(almacen.datos.get(CLAVE_NIVEL)).toBe("corto");
    // Una pestaña nueva lo encuentra.
    olvidarNivel();
    expect(nivelContexto()).toBe("corto");
  });

  it("avisa a quien lo mira solo si cambia, y deja de avisar al darse de baja", () => {
    const oyente = vi.fn();
    const baja = suscribirNivel(oyente);
    fijarNivel("corto");
    expect(oyente).toHaveBeenCalledTimes(1);
    fijarNivel("corto");
    expect(oyente).toHaveBeenCalledTimes(1);
    fijarNivel("completo");
    expect(oyente).toHaveBeenCalledTimes(2);
    baja();
    fijarNivel("corto");
    expect(oyente).toHaveBeenCalledTimes(2);
  });

  it("un nivel inventado no cambia nada", () => {
    fijarNivel("a medias" as never);
    expect(nivelContexto()).toBe("completo");
    expect(almacen.setItem).not.toHaveBeenCalled();
  });

  it("varios lugares a la vez (la barra y un panel) se enteran del mismo cambio", () => {
    const barra = vi.fn();
    const panel = vi.fn();
    const bajas = [suscribirNivel(barra), suscribirNivel(panel)];
    fijarNivel("corto");
    expect(barra).toHaveBeenCalledTimes(1);
    expect(panel).toHaveBeenCalledTimes(1);
    bajas.forEach((b) => b());
  });
});

describe("si el navegador no deja guardar", () => {
  it("leer falla: vale el de siempre, sin romper", () => {
    almacen.getItem.mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(nivelContexto()).toBe("completo");
  });

  it("guardar falla: la elección sirve en memoria y avisa igual", () => {
    almacen.setItem.mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const oyente = vi.fn();
    suscribirNivel(oyente);
    expect(() => fijarNivel("corto")).not.toThrow();
    expect(nivelContexto()).toBe("corto");
    expect(oyente).toHaveBeenCalledTimes(1);
  });

  it("sin localStorage (ventana privada, vista previa): también", () => {
    vi.stubGlobal("localStorage", undefined);
    olvidarNivel();
    expect(nivelContexto()).toBe("completo");
    fijarNivel("corto");
    expect(nivelContexto()).toBe("corto");
  });
});
