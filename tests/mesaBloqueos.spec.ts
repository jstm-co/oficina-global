// La mesa de bloqueadas de cada sala (JST-428): dónde va, y que nunca se cruza con nada.
import { describe, expect, it } from "vitest";
import { CELDA, rejillaDe } from "../src/caminos.js";
import { ANCHO_WIDGET, anchoCelular, anchoWidgetCelular, armarPiso, armarPisoComputador, armarPisoTv, armarSalaAcercada, medida, MUEBLES_SOLIDOS, type Caja, type EntradaSala, type PisoPlano, type SalaPlano } from "../src/plano.js";

const hay = (a: readonly [number, number, number, number], b: readonly [number, number, number, number]) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
const de = (c: Caja): [number, number, number, number] => [c.x, c.y, c.x + c.w, c.y + c.h];

function salas(n: number, agentes: number): EntradaSala[] {
  return ["AAA", "BBB", "CCC", "DDD", "EEE", "FFF", "GGG", "HHH"].slice(0, n).map((prefijo, i) => ({ prefijo, agentes: Math.max(1, agentes - (i % 3)) }));
}

function pisos(): Array<{ nombre: string; piso: PisoPlano }> {
  const lista: Array<{ nombre: string; piso: PisoPlano }> = [];
  for (let n = 1; n <= 8; n++) {
    for (const agentes of [1, 3, 6, 12, 16]) {
      const e = salas(n, agentes);
      for (const [ancho, alto] of [[1000, 700], [1200, 844], [1440, 900], [1920, 1080], [2750, 1490], [3440, 1300], [5000, 2800]] as const) {
        for (const dpr of [1, 2]) lista.push({ nombre: `${n} salas × ${agentes} · ${ancho}×${alto} dpr ${dpr}`, piso: armarPisoComputador(e, ancho, alto - 150, [], dpr) });
      }
      for (const w of [480, 576, 700, ANCHO_WIDGET]) lista.push({ nombre: `${n} salas × ${agentes} · widget ${w}`, piso: armarPiso(e, w, "widget") });
      lista.push({ nombre: `${n} salas × ${agentes} · tv`, piso: armarPisoTv(e) });
    }
  }
  return lista;
}

function cruces(s: SalaPlano): string[] {
  const m = s.mesaBloqueos;
  if (!m) return [];
  const caja = de(m);
  const malos: string[] = [];
  if (caja[0] < 0 || caja[1] < 0 || caja[2] > s.w || caja[3] > s.h) malos.push("fuera de la sala");
  for (const p of s.muebles) {
    if (!MUEBLES_SOLIDOS.has(p.nombre)) continue;
    const t = medida(p.nombre);
    if (hay(caja, [p.x, p.y, p.x + t.w, p.y + t.h])) malos.push(p.nombre);
  }
  if (hay(caja, de(s.mesa))) malos.push("mesita del sofá");
  if (s.escritorio) {
    const { x, y } = s.escritorio;
    if (hay(caja, [x, y, x + 30, y + 29])) malos.push("tu escritorio");
    const ultima = s.fila.at(-1);
    if (ultima && hay(caja, [x + 6, y + 30, x + 26, ultima.y + 2])) malos.push("tu fila");
    for (const f of s.fila) if (hay(caja, [f.x - 5, f.y - 7, f.x + 5, f.y])) malos.push("pies de tu fila");
  }
  if (s.rotulo && hay(caja, de(s.rotulo))) malos.push("rótulo");
  for (const a of s.asientos) if (!a.sofa && hay(caja, [a.x + 3, a.y + 17, a.x + 13, a.y + 24])) malos.push(`pies del asiento ${a.x},${a.y}`);
  return malos;
}

// Recorren cientos de pisos: con la máquina cargada no alcanzan los 5 s de siempre.
describe("mesa de bloqueadas (JST-428)", { timeout: 60_000 }, () => {
  it("va en x = w − 24, y = h − 44, del tamaño de la mesita, y solo con el descanso ≥ 98 y la sala ≥ 96 de alto", () => {
    let con = 0;
    for (const { nombre, piso } of pisos()) {
      for (const s of piso.salas) {
        const m = medida("mesita");
        if (s.mesaBloqueos) {
          con++;
          expect(s.mesaBloqueos, `${nombre} ${s.prefijo}`).toEqual({ x: s.w - 24, y: s.h - 44, w: m.w, h: m.h });
          expect(s.escritorio, nombre).not.toBeNull();
          expect(s.descanso.w, nombre).toBeGreaterThanOrEqual(98);
          expect(s.h, nombre).toBeGreaterThanOrEqual(96);
        } else if (s.escritorio) {
          expect(s.descanso.w >= 98 && s.h >= 96, `${nombre} ${s.prefijo}: debía llevarla`).toBe(false);
        }
      }
    }
    expect(con).toBeGreaterThan(0);
  });

  it("nunca se cruza con un mueble sólido, el sofá y su mesita, tu escritorio y tu fila, el rótulo ni los pies de un asiento", () => {
    for (const { nombre, piso } of pisos()) for (const s of piso.salas) expect(cruces(s), `${nombre} ${s.prefijo} ${s.w}×${s.h}`).toEqual([]);
  });

  it("nadie camina ni conversa encima: la rejilla de caminos la da por ocupada y la cuenta como cuerpo", () => {
    let conMesa = 0;
    for (const { nombre, piso } of pisos()) {
      for (const sala of piso.salas) {
        const m = sala.mesaBloqueos;
        if (!m) continue;
        conMesa++;
        const r = rejillaDe(sala);
        for (let cy = Math.floor(m.y / CELDA); cy < Math.ceil((m.y + m.h) / CELDA); cy++) {
          for (let cx = Math.floor(m.x / CELDA); cx < Math.ceil((m.x + m.w) / CELDA); cx++) {
            const x = cx * CELDA + CELDA / 2;
            const y = cy * CELDA + CELDA / 2;
            if (x <= m.x || x >= m.x + m.w || y <= m.y || y >= m.y + m.h) continue;
            if (r.ocupada[cy * r.ancho + cx] !== 1) throw new Error(`${nombre} · ${sala.prefijo}: celda libre sobre la mesa en ${x},${y}`);
          }
        }
        expect(r.cuerpos.some((c) => c[0] === m.x && c[1] === m.y && c[2] === m.x + m.w && c[3] === m.y + m.h)).toBe(true);
      }
    }
    expect(conMesa).toBeGreaterThan(50);
  });
  it("no es un mueble: no aparece en `muebles`", () => {
    for (const { piso } of pisos().slice(0, 40)) for (const s of piso.salas) if (s.mesaBloqueos) expect(s.muebles.some((p) => p.x === s.mesaBloqueos!.x && p.y === s.mesaBloqueos!.y && p.nombre === "mesita")).toBe(false);
  });

  it("en el celular (piso, sala acercada y widget del celular) vale null", () => {
    const e = salas(4, 6);
    const celulares = [armarPiso(e, anchoCelular(390), "celular"), armarPiso(e, anchoWidgetCelular(390), "widget-celular"), ...e.map((s) => armarSalaAcercada(s, 366))];
    for (const piso of celulares) for (const s of piso.salas) expect(s.mesaBloqueos, piso.escena).toBeNull();
  });
});
