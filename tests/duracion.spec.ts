import { describe, expect, it } from "vitest";
import { duracionDeTarea, duracionHablada, haceHablado } from "../src/duracion.js";

const MIN = 60_000;
const H = 60 * MIN;
const D = 24 * H;

describe("duracionHablada (JST-415)", () => {
  it("minutos", () => {
    expect(duracionHablada(20_000)).toBe("menos de un minuto");
    expect(duracionHablada(MIN)).toBe("un minuto");
    expect(duracionHablada(2 * MIN)).toBe("2 minutos");
    expect(duracionHablada(12 * MIN)).toBe("12 minutos");
    expect(duracionHablada(24 * MIN)).toBe("24 minutos");
  });

  it("media hora y los minutos de 5 en 5 hasta la hora", () => {
    expect(duracionHablada(30 * MIN)).toBe("media hora");
    expect(duracionHablada(34 * MIN)).toBe("media hora");
    expect(duracionHablada(40 * MIN)).toBe("40 minutos");
    expect(duracionHablada(47 * MIN)).toBe("45 minutos");
    expect(duracionHablada(54 * MIN)).toBe("55 minutos");
  });

  it("horas de media en media hasta las 5 y media, después enteras", () => {
    expect(duracionHablada(60 * MIN)).toBe("una hora");
    expect(duracionHablada(70 * MIN)).toBe("una hora");
    expect(duracionHablada(90 * MIN)).toBe("una hora y media");
    expect(duracionHablada(2 * H)).toBe("2 horas");
    expect(duracionHablada(2.5 * H)).toBe("2 horas y media");
    expect(duracionHablada(3 * H + 10 * MIN)).toBe("3 horas");
    expect(duracionHablada(5.4 * H)).toBe("5 horas y media");
    expect(duracionHablada(7 * H + 20 * MIN)).toBe("7 horas");
    expect(duracionHablada(30 * H)).toBe("30 horas");
  });

  it("de 48 horas hacia arriba, en días: nunca «70 horas»", () => {
    expect(duracionHablada(47.9 * H)).toBe("47 horas");
    expect(duracionHablada(48 * H)).toBe("2 días");
    expect(duracionHablada(70 * H)).toBe("2 días");
    expect(duracionHablada(3 * D + 5 * H)).toBe("3 días");
    expect(duracionHablada(10 * D)).toBe("10 días");
  });

  it("un valor que no sirve da vacío: jamás se inventa", () => {
    expect(duracionHablada(-5)).toBe("");
    expect(duracionHablada(Number.NaN)).toBe("");
    expect(duracionHablada(Infinity)).toBe("");
  });
});

describe("duracionDeTarea (JST-415)", () => {
  const fin = 1_000_000_000_000;
  it("dice cuánto tardó desde 2 minutos", () => {
    expect(duracionDeTarea(fin - 12 * MIN, fin)).toBe("12 minutos");
    expect(duracionDeTarea(fin - 90 * MIN, fin)).toBe("una hora y media");
    expect(duracionDeTarea(fin - 3 * H, fin)).toBe("3 horas");
  });
  it("menos de 2 minutos, sin inicio, inicio en el futuro o de hace más de 2 semanas: nada", () => {
    expect(duracionDeTarea(fin - 119_000, fin)).toBeNull();
    expect(duracionDeTarea(null, fin)).toBeNull();
    expect(duracionDeTarea(undefined, fin)).toBeNull();
    expect(duracionDeTarea(fin + MIN, fin)).toBeNull();
    expect(duracionDeTarea(fin - 15 * D, fin)).toBeNull();
    expect(duracionDeTarea(Number.NaN, fin)).toBeNull();
  });
});

describe("haceHablado", () => {
  it("hace 35 minutos, hace 2 horas, hace 3 días", () => {
    expect(haceHablado(35 * MIN)).toBe("hace 35 minutos");
    expect(haceHablado(2 * H)).toBe("hace 2 horas");
    expect(haceHablado(70 * H)).toBe("hace 2 días");
    expect(haceHablado(-1)).toBe("");
  });
});
