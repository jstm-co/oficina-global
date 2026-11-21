// El reloj compartido de la luz y los adornos (JST-416, `src/ui/ahora.ts`): uno solo para todas las salas, que se limpia con el último suscriptor.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CADA_MS } from "../src/luzSala.js";
import { leerAhora, suscribir } from "../src/ui/ahora.js";

describe("el reloj de «ahora»", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15, 10, 0, 0));
  });
  afterEach(() => vi.useRealTimers());

  it("con varios suscriptores hay un solo reloj, y se apaga con el último", () => {
    expect(vi.getTimerCount()).toBe(0);
    const a = vi.fn();
    const b = vi.fn();
    const sa = suscribir(a);
    expect(vi.getTimerCount()).toBe(1);
    const sb = suscribir(b);
    expect(vi.getTimerCount()).toBe(1);
    sa();
    expect(vi.getTimerCount()).toBe(1);
    sb();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("avanza cada CADA_MS, avisa a todos y entrega la hora nueva", () => {
    const a = vi.fn();
    const b = vi.fn();
    const sa = suscribir(a);
    const sb = suscribir(b);
    const inicio = leerAhora();
    vi.advanceTimersByTime(CADA_MS - 1);
    expect(a).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(leerAhora()).toBe(inicio + CADA_MS);
    sa();
    sb();
  });

  it("un suscriptor que se fue ya no recibe avisos, y al volver a suscribir la hora no queda vieja", () => {
    const a = vi.fn();
    const sa = suscribir(a);
    sa();
    vi.advanceTimersByTime(CADA_MS * 3);
    expect(a).not.toHaveBeenCalled();
    const b = vi.fn();
    const sb = suscribir(b);
    expect(leerAhora()).toBe(Date.now());
    expect(vi.getTimerCount()).toBe(1);
    sb();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("darse de baja dos veces no rompe a los demás", () => {
    const sa = suscribir(vi.fn());
    const sb = suscribir(vi.fn());
    sa();
    sa();
    expect(vi.getTimerCount()).toBe(1);
    sb();
    expect(vi.getTimerCount()).toBe(0);
  });
});
