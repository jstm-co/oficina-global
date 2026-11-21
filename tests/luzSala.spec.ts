// La luz del piso 2D según la hora (JST-416, etapa 2): fase, tinte y halo. Usa la lógica de la vista 3D (`luz.ts`).
import { afterEach, describe, expect, it } from "vitest";
import { CADA_MS, luzDeSala, MAX_OSCURECER, oscurece } from "../src/luzSala.js";

const zonaAntes = process.env.TZ;
afterEach(() => {
  if (zonaAntes === undefined) delete process.env.TZ;
  else process.env.TZ = zonaAntes;
});
const a = (m: number, d: number, h: number, min = 0) => new Date(2026, m - 1, d, h, min, 0);

describe("la luz del piso según la hora", () => {
  it("a mediodía no hay tinte: ventana de día y lámparas apagadas", () => {
    process.env.TZ = "America/Santiago";
    for (const oscuro of [false, true]) {
      const l = luzDeSala(a(6, 15, 13), oscuro);
      expect(l).toMatchObject({ momento: "dia", tinte: "#ffffff", ventana: "dia", halo: 0 });
    }
  });

  it("de noche: ventana de noche, tinte azulado y lámparas y chimenea encendidas", () => {
    process.env.TZ = "America/Santiago";
    const l = luzDeSala(a(6, 15, 23), false);
    expect(l.momento).toBe("noche");
    expect(l.ventana).toBe("noche");
    expect(l.halo).toBe(1);
    expect(l.tinte).not.toBe("#ffffff");
    const [r, , b] = [1, 3, 5].map((i) => parseInt(l.tinte.slice(i, i + 2), 16));
    expect(b!).toBeGreaterThan(r!); // azulado
    expect(luzDeSala(a(6, 15, 3), false).momento).toBe("noche");
  });

  it("al amanecer y al atardecer: tinte cálido, ventana de día y las luces a medio encender", () => {
    process.env.TZ = "America/Santiago";
    // Invierno en Santiago: el sol sale ≈ 7:30 y se pone ≈ 17:30 (reloj local).
    const alba = luzDeSala(a(6, 15, 7, 30), false);
    expect(alba.momento).toBe("amanecer");
    expect(alba.ventana).toBe("dia");
    const tarde = luzDeSala(a(6, 15, 17, 30), false);
    expect(tarde.momento).toBe("atardecer");
    expect(tarde.ventana).toBe("dia");
    expect(tarde.halo).toBeGreaterThan(0);
    expect(tarde.halo).toBeLessThan(1);
    const [r, , b] = [1, 3, 5].map((i) => parseInt(tarde.tinte.slice(i, i + 2), 16));
    expect(r!).toBeGreaterThan(b!); // anaranjado
  });

  it("nunca oscurece más de un 25 %, a ninguna hora, en ninguna estación ni zona; en tema oscuro, menos", () => {
    for (const tz of ["America/Santiago", "Europe/Madrid", "America/Guayaquil", "Pacific/Auckland"]) {
      process.env.TZ = tz;
      for (const [m, d] of [[1, 15], [3, 21], [6, 21], [10, 29], [12, 24]] as const) {
        for (let min = 0; min < 24 * 60; min += 10) {
          const f = a(m, d, Math.floor(min / 60), min % 60);
          const claro = luzDeSala(f, false);
          const oscuro = luzDeSala(f, true);
          expect(oscurece(claro.tinte), `${tz} ${m}-${d} ${min}`).toBeLessThanOrEqual(MAX_OSCURECER);
          expect(oscurece(oscuro.tinte)).toBeLessThanOrEqual(oscurece(claro.tinte) + 1e-9);
          expect(oscurece(oscuro.tinte)).toBeLessThanOrEqual(MAX_OSCURECER / 2 + 0.01);
          expect(claro.halo).toBeGreaterThanOrEqual(0);
          expect(claro.halo).toBeLessThanOrEqual(1);
          // Solo de noche se ve la ventana de noche.
          expect(claro.ventana === "noche").toBe(claro.momento === "noche");
        }
      }
    }
  });

  it("cambia de a poco: entre una lectura y la siguiente (CADA_MS) el tinte no pega un salto", () => {
    process.env.TZ = "America/Santiago";
    const paso = CADA_MS / 60000;
    let antes = luzDeSala(a(6, 15, 0, 0), false);
    for (let min = paso; min < 24 * 60; min += paso) {
      const l = luzDeSala(a(6, 15, Math.floor(min / 60), min % 60), false);
      expect(Math.abs(oscurece(l.tinte) - oscurece(antes.tinte))).toBeLessThan(0.06);
      antes = l;
    }
  });

  it("se mira la hora cada pocos minutos", () => {
    expect(CADA_MS).toBeGreaterThanOrEqual(60_000);
    expect(CADA_MS).toBeLessThanOrEqual(5 * 60_000);
  });

  it("oscurece(): cuánto le quita al canal más oscuro", () => {
    expect(oscurece("#ffffff")).toBe(0);
    expect(oscurece("#000000")).toBe(1);
    expect(oscurece("#c0c0ff")).toBeCloseTo(1 - 192 / 255, 6);
  });
});
