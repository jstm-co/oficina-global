// Adornos por fecha (JST-416, etapa 2): qué fiesta toca y cómo se fuerza la fecha para probar.
import { afterEach, describe, expect, it, vi } from "vitest";
import { CLAVE_PRUEBA_FECHA, CLAVE_PRUEBA_HORA, adornoDeHoy, ahoraOficina, enChileAhora, esDeChile, fechaForzada, pruebaGuardada } from "../src/fechas.js";

// Fechas locales (como las ve quien mira): año, mes (1 a 12), día.
const dia = (m: number, d: number, h = 12) => new Date(2026, m - 1, d, h, 0, 0);

describe("el adorno de hoy", () => {
  it("Navidad: del 1 al 26 de diciembre", () => {
    expect(adornoDeHoy(dia(11, 30, 23), true)).toBeNull();
    for (const d of [1, 2, 15, 24, 25, 26]) expect(adornoDeHoy(dia(12, d), true), `12-${d}`).toBe("navidad");
    expect(adornoDeHoy(dia(12, 27), true)).toBeNull();
    expect(adornoDeHoy(dia(12, 31), true)).toBeNull();
  });

  it("Dieciocho: del 11 al 20 de septiembre", () => {
    expect(adornoDeHoy(dia(9, 10, 23), true)).toBeNull();
    for (const d of [11, 12, 18, 19, 20]) expect(adornoDeHoy(dia(9, d), true), `9-${d}`).toBe("dieciocho");
    expect(adornoDeHoy(dia(9, 21), true)).toBeNull();
  });

  it("Halloween: del 24 al 31 de octubre", () => {
    expect(adornoDeHoy(dia(10, 23, 23), true)).toBeNull();
    for (const d of [24, 25, 30, 31]) expect(adornoDeHoy(dia(10, d), true), `10-${d}`).toBe("halloween");
    expect(adornoDeHoy(dia(11, 1, 0), true)).toBeNull();
  });

  it("el resto del año, ninguno", () => {
    for (const m of [1, 2, 3, 4, 5, 6, 7, 8]) for (const d of [1, 10, 15, 28]) expect(adornoDeHoy(dia(m, d), true)).toBeNull();
    expect(adornoDeHoy(dia(11, 15), true)).toBeNull();
  });

  it("cuenta el día local: a medianoche y a las 23:59 es el mismo día", () => {
    expect(adornoDeHoy(new Date(2026, 11, 26, 23, 59, 59), true)).toBe("navidad");
    expect(adornoDeHoy(new Date(2026, 11, 27, 0, 0, 0), true)).toBeNull();
    expect(adornoDeHoy(new Date(2026, 8, 11, 0, 0, 0), true)).toBe("dieciocho");
  });
});

describe("forzar la fecha y la hora para probar", () => {
  const real = new Date(2026, 5, 15, 10, 30, 0);

  it("sin claves vale la hora real", () => {
    expect(fechaForzada(real).getTime()).toBe(real.getTime());
    expect(fechaForzada(real, null, null).getTime()).toBe(real.getTime());
    expect(ahoraOficina(real).getTime()).toBe(real.getTime()); // sin almacenamiento (Node)
  });

  it("la fecha cambia el día y deja la hora", () => {
    const f = fechaForzada(real, "2026-12-24");
    expect([f.getFullYear(), f.getMonth() + 1, f.getDate(), f.getHours(), f.getMinutes()]).toEqual([2026, 12, 24, 10, 30]);
    expect(adornoDeHoy(f, true)).toBe("navidad");
  });

  it("la hora cambia la hora y deja el día", () => {
    const f = fechaForzada(real, null, "22:30");
    expect([f.getMonth() + 1, f.getDate(), f.getHours(), f.getMinutes()]).toEqual([6, 15, 22, 30]);
    expect(fechaForzada(real, null, "7:05").getHours()).toBe(7);
  });

  it("las dos juntas", () => {
    const f = fechaForzada(real, "2026-10-31", "23:00");
    expect([f.getMonth() + 1, f.getDate(), f.getHours(), f.getMinutes()]).toEqual([10, 31, 23, 0]);
    expect(adornoDeHoy(f, true)).toBe("halloween");
  });

  it("lo mal escrito o imposible se ignora (y no cambia el reloj real)", () => {
    for (const f of ["", "hoy", "2026-13-01", "2026-02-31", "26-12-24", "2026-12-24T10:00"]) expect(fechaForzada(real, f).getTime(), f).toBe(real.getTime());
    for (const h of ["", "25:00", "10:60", "tarde", "10"]) expect(fechaForzada(real, null, h).getTime(), h).toBe(real.getTime());
  });

  it("no toca la fecha que se le pasa", () => {
    const antes = real.getTime();
    fechaForzada(real, "2026-12-24", "22:30");
    expect(real.getTime()).toBe(antes);
  });
});

describe("el Dieciocho solo sale donde corresponde", () => {
  it("sin Chile no hay adorno del 11 al 20 de septiembre, y Navidad y Halloween salen igual", () => {
    for (const d of [11, 18, 20]) expect(adornoDeHoy(dia(9, d), false), `9-${d}`).toBeNull();
    expect(adornoDeHoy(dia(12, 24), false)).toBe("navidad");
    expect(adornoDeHoy(dia(10, 31), false)).toBe("halloween");
    expect(adornoDeHoy(dia(9, 18), true)).toBe("dieciocho");
  });

  it("es de Chile por la zona horaria o por el idioma es-CL", () => {
    for (const z of ["America/Santiago", "America/Punta_Arenas", "Pacific/Easter"]) expect(esDeChile(z, "en-US"), z).toBe(true);
    expect(esDeChile("Europe/Madrid", "es-CL")).toBe(true);
    expect(esDeChile("Europe/Madrid", "es-cl")).toBe(true);
    expect(esDeChile("Europe/Madrid", "es-ES")).toBe(false);
    expect(esDeChile("America/Argentina/Buenos_Aires", "es-AR")).toBe(false);
    expect(esDeChile(undefined, undefined)).toBe(false);
    expect(esDeChile("", "")).toBe(false);
  });

  it("la lectura del navegador no falla en Node", () => {
    expect(typeof enChileAhora()).toBe("boolean");
  });
});

describe("las claves de prueba viven en sessionStorage y avisan una vez", () => {
  afterEach(() => vi.unstubAllGlobals());
  const falso = (datos: Record<string, string>) => ({ getItem: (k: string) => datos[k] ?? null });

  it("se leen de sessionStorage y no de localStorage", () => {
    vi.stubGlobal("localStorage", falso({ [CLAVE_PRUEBA_FECHA]: "2026-12-24" }));
    vi.stubGlobal("sessionStorage", falso({ [CLAVE_PRUEBA_HORA]: "22:30" }));
    vi.spyOn(console, "info").mockImplementation(() => {});
    expect(pruebaGuardada()).toEqual({ fecha: null, hora: "22:30" });
  });

  it("deja una sola línea en la consola mientras la prueba no cambie", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.stubGlobal("sessionStorage", falso({ [CLAVE_PRUEBA_FECHA]: "2026-10-31", [CLAVE_PRUEBA_HORA]: "23:00" }));
    pruebaGuardada();
    pruebaGuardada();
    pruebaGuardada();
    expect(info).toHaveBeenCalledTimes(1);
    expect(String(info.mock.calls[0]![0])).toContain("2026-10-31");
    info.mockRestore();
  });

  it("sin claves no dice nada, y sin almacenamiento no falla", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.stubGlobal("sessionStorage", falso({}));
    expect(pruebaGuardada()).toEqual({ fecha: null, hora: null });
    vi.stubGlobal("sessionStorage", { getItem: () => { throw new Error("bloqueado"); } });
    expect(pruebaGuardada()).toEqual({ fecha: null, hora: null });
    expect(info).not.toHaveBeenCalled();
    info.mockRestore();
  });
});
