// Adornos por fecha (JST-416, etapa 2): qué piezas se suman a cada sala y que entran en el atlas de todas las hojas.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extrasAdorno, muebleAdorno, mueblesDeSala } from "../src/adornos.js";
import { DECORADOS, extrasDecorado, muebleDecorado } from "../src/decorado.js";
import type { Adorno } from "../src/fechas.js";
import { armarPiso, armarPisoComputador, armarPisoTv, armarSalaAcercada, type EntradaSala, type Pieza, type SalaPlano } from "../src/plano.js";
import { AJUSTES_POR_OMISION, leerAjustes } from "../src/ui/ajustes.js";
import MUEBLES from "../src/ui/assets/muebles.json" with { type: "json" };

const ASSETS = join(import.meta.dirname, "../src/ui/assets");
const PIEZAS: Record<string, { x: number; y: number; w: number; h: number }> = MUEBLES.piezas;
const ADORNOS: Adorno[] = ["navidad", "dieciocho", "halloween"];
const NUEVAS = ["arbol-navidad", "arbol-navidad-grande", "guirnalda-navidad", "guirnalda-dieciocho", "bandera-chile", "calabaza", "telarana", "murcielago"];
const TAMANO: Record<string, [number, number]> = {
  "arbol-navidad": [12, 18],
  "arbol-navidad-grande": [14, 24],
  "guirnalda-navidad": [28, 9],
  "guirnalda-dieciocho": [28, 10],
  "bandera-chile": [13, 10],
  calabaza: [12, 18],
  telarana: [23, 12],
  murcielago: [10, 6],
};
const enAtlas = (n: string) => PIEZAS[n === "ventana" ? "ventana-dia" : n];

const EMPRESAS: EntradaSala[] = [
  { prefijo: "MIG", agentes: 8 },
  { prefijo: "JST", agentes: 5 },
  { prefijo: "BET", agentes: 9 },
  { prefijo: "ELM", agentes: 4 },
  { prefijo: "PER", agentes: 3 },
];
const pisos: Record<string, SalaPlano[]> = {
  computador: armarPisoComputador(EMPRESAS, 1440, 900).salas,
  grande: armarPisoComputador(EMPRESAS, 1920, 1080).salas,
  notebook: armarPisoComputador(EMPRESAS, 1200, 800).salas,
  plano: armarPiso(EMPRESAS, 576, "computador").salas,
  tv: armarPisoTv(EMPRESAS).salas,
  widget: armarPiso(EMPRESAS, 560, "widget").salas,
  celular: armarPiso(EMPRESAS, 366, "celular").salas,
  "widget-celular": armarPiso(EMPRESAS, 340, "widget-celular").salas,
  acercada: armarSalaAcercada(EMPRESAS[0]!, 366).salas,
};
const salas = Object.entries(pisos).flatMap(([escena, ss]) => ss.map((s) => ({ escena, sala: s })));

describe("las piezas de los adornos", () => {
  it("están en el atlas con su tamaño, al final (las de antes no se movieron)", () => {
    const nombres = Object.keys(PIEZAS);
    expect(nombres.slice(-NUEVAS.length)).toEqual(NUEVAS);
    for (const n of NUEVAS) expect([PIEZAS[n]!.w, PIEZAS[n]!.h], n).toEqual(TAMANO[n]);
    // El mismo atlas para todas las hojas: la clásica y la de cada decorado miden lo mismo y llegan hasta el fondo.
    for (const ruta of ["muebles.png", ...DECORADOS.filter((d) => d.id !== "clasico").map((d) => `decorados/${d.id}/muebles.png`)]) {
      const b = readFileSync(join(ASSETS, ruta));
      expect({ w: b.readUInt32BE(16), h: b.readUInt32BE(20) }, ruta).toEqual({ w: MUEBLES.ancho, h: MUEBLES.alto });
    }
    expect(existsSync(join(ASSETS, "muebles.png"))).toBe(true);
  });

  it("la hoja se guarda con paleta (color indexado) y pesa poco", () => {
    for (const ruta of ["muebles.png", ...DECORADOS.filter((d) => d.id !== "clasico").map((d) => `decorados/${d.id}/muebles.png`)]) {
      const b = readFileSync(join(ASSETS, ruta));
      expect(b[25], `${ruta}: tipo de color 3 = paleta`).toBe(3);
      expect(b.length, ruta).toBeLessThan(6000);
    }
  });
});

describe("sin adorno no cambia nada", () => {
  it("muebleAdorno devuelve la misma pieza y no se cuelga nada", () => {
    for (const { sala } of salas) {
      for (const m of sala.muebles) expect(muebleAdorno(null, m)).toBe(m);
      expect(extrasAdorno(null, sala)).toEqual([]);
    }
  });
});

describe("con adorno", () => {
  for (const adorno of ADORNOS) {
    it(`${adorno}: lo que reemplaza a una planta tiene su misma huella y apoya en el mismo suelo`, () => {
      let cambiadas = 0;
      for (const { escena, sala } of salas) {
        for (const m of sala.muebles) {
          const d = muebleAdorno(adorno, m);
          if (d === m) continue;
          cambiadas++;
          expect(["planta", "planta-grande"], `${escena}: ${m.nombre}`).toContain(m.nombre);
          const a = enAtlas(m.nombre)!;
          const b = enAtlas(d.nombre)!;
          expect(b, d.nombre).toBeDefined();
          expect(d.z).toBe(m.z);
          expect(b.w).toBeLessThanOrEqual(a.w);
          expect(d.y + b.h).toBe(m.y + a.h);
          expect(d.x).toBeGreaterThanOrEqual(m.x);
          expect(d.x + b.w).toBeLessThanOrEqual(m.x + a.w);
        }
      }
      // Navidad y Halloween cambian las plantas; el Dieciocho cuelga banderines y no toca las plantas.
      if (adorno === "dieciocho") expect(cambiadas).toBe(0);
      else expect(cambiadas).toBeGreaterThan(0);
    });

    for (const id of DECORADOS.map((d) => d.id)) {
      it(`${adorno} sobre ${id}: lo que se cuelga existe, cabe en el muro y no pisa nada ni se pisa entre sí`, () => {
        let conAdorno = 0;
        for (const { escena, sala } of salas) {
          const extras = extrasDecorado(id, sala);
          const murales = extrasAdorno(adorno, sala, extras);
          if (murales.length) conAdorno++;
          expect(murales.length).toBeLessThanOrEqual(3);
          const cajas = [...sala.muebles.map((m) => muebleDecorado(id, m)), ...extras].filter((m) => !m.nombre.startsWith("alfombra"));
          const puestas: Pieza[] = [];
          for (const p of murales) {
            const a = enAtlas(p.nombre)!;
            expect(a, `${escena}: ${p.nombre}`).toBeDefined();
            expect(NUEVAS).toContain(p.nombre);
            expect(p.x).toBeGreaterThanOrEqual(64);
            expect(p.x + a.w).toBeLessThanOrEqual(sala.w);
            expect(p.y + a.h).toBeLessThanOrEqual(22); // dentro del muro
            for (const o of [...cajas, ...puestas]) {
              const b = enAtlas(o.nombre)!;
              const choca = p.x < o.x + b.w && p.x + a.w > o.x && p.y < o.y + b.h && p.y + a.h > o.y;
              expect(choca, `${escena} ${sala.prefijo}: ${p.nombre} pisa ${o.nombre}`).toBe(false);
            }
            puestas.push(p);
          }
        }
        // Las salas del computador, el TV y el widget llevan algo en el muro.
        expect(conAdorno).toBeGreaterThan(salas.length / 2);
      });
    }
  }

  it("los adornos no cambian el tamaño de la sala ni sus asientos: solo se dibujan piezas", () => {
    for (const { sala } of salas) {
      const antes = JSON.stringify([sala.w, sala.h, sala.asientos, sala.puestos]);
      for (const adorno of ADORNOS) {
        sala.muebles.map((m) => muebleAdorno(adorno, m));
        extrasAdorno(adorno, sala);
      }
      expect(JSON.stringify([sala.w, sala.h, sala.asientos, sala.puestos])).toBe(antes);
    }
  });

  it("navidad pone el árbol grande donde estaba la planta grande y la guirnalda en el muro; Halloween, la calabaza", () => {
    const sala = pisos.computador!.find((s) => s.muebles.some((m) => m.nombre === "planta-grande"))!;
    const grande = sala.muebles.find((m) => m.nombre === "planta-grande")!;
    expect(muebleAdorno("navidad", grande)).toMatchObject({ nombre: "arbol-navidad-grande", x: grande.x, y: grande.y });
    expect(muebleAdorno("halloween", grande).nombre).toBe("calabaza");
    expect(extrasAdorno("navidad", sala).every((p) => p.nombre === "guirnalda-navidad")).toBe(true);
    expect(extrasAdorno("dieciocho", sala).map((p) => p.nombre)).toContain("bandera-chile");
    expect(extrasAdorno("halloween", sala).map((p) => p.nombre)).toContain("telarana");
  });

  it("en la Madera la lámpara que reemplaza a la planta grande queda: el adorno no la pisa", () => {
    const sala = pisos.computador!.find((s) => s.muebles.some((m) => m.nombre === "planta-grande"))!;
    const grande = sala.muebles.find((m) => m.nombre === "planta-grande")!;
    const d = muebleDecorado("madera", grande);
    expect(d.nombre).toBe("lampara");
    // El piso mira primero al decorado y solo si no cambió la pieza deja que el adorno la cambie.
    expect(d).not.toBe(grande);
  });

  it("a escala 1 la placa no escala: no se cuelga nada del muro (y a escala 2 o más, sí)", () => {
    const sala = pisos.grande![0]!;
    for (const adorno of ADORNOS) {
      expect(extrasAdorno(adorno, sala, [], 1), adorno).toEqual([]);
      expect(extrasAdorno(adorno, sala, [], 2).length, adorno).toBeGreaterThan(0);
      expect(extrasAdorno(adorno, sala, [], 3).length, adorno).toBeGreaterThan(0);
    }
    // El widget y el celular dibujan a escala 1: sus salas siguen cambiando las plantas, pero sin nada colgado.
    expect(mueblesDeSala(pisos.widget![0]!, "clasico", "navidad", 1).some((p) => p.nombre.startsWith("guirnalda"))).toBe(false);
  });

  it("es estable: lo mismo una y otra vez", () => {
    const sala = pisos.grande![0]!;
    expect(extrasAdorno("navidad", sala)).toEqual(extrasAdorno("navidad", sala));
  });
});

describe("los ajustes de la luz y los adornos", () => {
  it("vienen encendidos por omisión y lo guardado de antes carga bien", () => {
    expect(AJUSTES_POR_OMISION.luz).toBe(true);
    expect(AJUSTES_POR_OMISION.fechas).toBe(true);
    const viejo = leerAjustes(JSON.stringify({ voces: true, decorado: "madera" }));
    expect(viejo.luz).toBe(true);
    expect(viejo.fechas).toBe(true);
    expect(viejo.decorado).toBe("madera");
  });

  it("se pueden apagar y lo raro vuelve al valor por omisión", () => {
    expect(leerAjustes(JSON.stringify({ luz: false })).luz).toBe(false);
    expect(leerAjustes(JSON.stringify({ fechas: false })).fechas).toBe(false);
    expect(leerAjustes(JSON.stringify({ luz: "no", fechas: 0 }))).toMatchObject({ luz: true, fechas: true });
  });
});

describe("qué pieza se dibuja: la del decorado o la del adorno (mueblesDeSala)", () => {
  const sala = pisos.computador!.find((s) => s.muebles.some((m) => m.nombre === "planta-grande"))!;
  const grande = sala.muebles.find((m) => m.nombre === "planta-grande")!;
  const indice = sala.muebles.indexOf(grande);

  it("clásico y sin adorno: las mismas piezas del plano, sin copiar", () => {
    expect(mueblesDeSala(sala, "clasico", null)).toBe(sala.muebles);
  });

  it("la Madera manda: con Navidad la lámpara que reemplaza a la planta grande no se vuelve árbol", () => {
    for (const adorno of ADORNOS) {
      const r = mueblesDeSala(sala, "madera", adorno);
      expect(r[indice]!.nombre, adorno).toBe("lampara");
      expect(r[indice]).toEqual(muebleDecorado("madera", grande));
    }
  });

  it("en el clásico el adorno sí cambia la planta, y en la Madera la planta chica (que el decorado no toca) también", () => {
    expect(mueblesDeSala(sala, "clasico", "navidad")[indice]!.nombre).toBe("arbol-navidad-grande");
    expect(mueblesDeSala(sala, "clasico", "halloween")[indice]!.nombre).toBe("calabaza");
    const con = pisos.computador!.flatMap((s) => s.muebles.map((m, i) => ({ s, m, i }))).find((x) => x.m.nombre === "planta");
    if (con) expect(mueblesDeSala(con.s, "madera", "navidad")[con.i]!.nombre).toBe("arbol-navidad");
  });

  it("suma lo del decorado (la chimenea de la Madera) y lo que cuelga el adorno, sin pisarse", () => {
    const r = mueblesDeSala(sala, "madera", "halloween");
    expect(r.length).toBeGreaterThan(sala.muebles.length);
    expect(r.filter((p) => p.nombre === "chimenea").length).toBeLessThanOrEqual(1);
    expect(r.slice(0, sala.muebles.length).map((p) => p.nombre).includes("lampara")).toBe(true);
  });

  it("no cambia el plano que recibe", () => {
    const antes = JSON.stringify(sala.muebles);
    for (const d of ["clasico", "madera"] as const) for (const a of [null, ...ADORNOS]) mueblesDeSala(sala, d, a);
    expect(JSON.stringify(sala.muebles)).toBe(antes);
  });
});
