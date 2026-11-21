// Adornos por fecha (JST-416, etapa 2): qué piezas se suman a cada sala cuando toca una fiesta (`fechas.ts`). Sin React ni DOM.
//
// Van encima de cualquier decorado (clásico o Madera) y son piezas del atlas de todas las hojas. Como los decorados, no
// tocan el plano: una pieza reemplaza a otra de igual huella (el árbol o la calabaza ocupan el lugar de una planta) y lo
// de la pared se cuelga donde no hay nada (nunca sobre una ventana, la pizarra, el cuadro, el reloj, el estante…).
import MUEBLES from "./ui/assets/muebles.json" with { type: "json" };
import { extrasDecorado, muebleDecorado, ponerPieza, type DecoradoId } from "./decorado.js";
import type { Adorno } from "./fechas.js";
import type { Pieza, SalaPlano } from "./plano.js";

const PIEZAS: Readonly<Record<string, { w: number; h: number }>> = MUEBLES.piezas;

/** Qué se pone en el lugar de cada planta (la chica es 12 × 18; la grande, 14 × 24). */
const EN_LUGAR_DE_PLANTA: Readonly<Record<Adorno, Readonly<Record<string, string>> | null>> = {
  navidad: { planta: "arbol-navidad", "planta-grande": "arbol-navidad-grande" },
  halloween: { planta: "calabaza", "planta-grande": "calabaza" },
  dieciocho: null,
};

/** Lo que se cuelga del muro: la pieza, cuántas como máximo y a qué altura (el muro mide 22). */
const DEL_MURO: Readonly<Record<Adorno, ReadonlyArray<{ nombre: string; cuantas: number; y: number }>>> = {
  navidad: [{ nombre: "guirnalda-navidad", cuantas: 3, y: 3 }],
  dieciocho: [
    { nombre: "bandera-chile", cuantas: 1, y: 3 },
    { nombre: "guirnalda-dieciocho", cuantas: 2, y: 3 },
  ],
  halloween: [
    { nombre: "telarana", cuantas: 1, y: 2 },
    { nombre: "murcielago", cuantas: 2, y: 5 },
  ],
};

/**
 * Desde dónde se cuelga: la placa con el nombre de la sala (arriba a la izquierda) queda libre. 64 alcanza con la placa
 * de escala 2 en adelante; a escala 1 la placa no escala y con un nombre largo mide más (JST-416): ahí no se cuelga nada.
 */
const DESDE_X = 64;
const ESCALA_MINIMA = 2;

/** Cómo se dibuja una pieza del plano con el adorno puesto: la misma, o la del adorno en su lugar (una planta). */
export function muebleAdorno(adorno: Adorno | null, m: Pieza): Pieza {
  const nombre = adorno ? EN_LUGAR_DE_PLANTA[adorno]?.[m.nombre] : undefined;
  return nombre ? ponerPieza(m, nombre) : m;
}

/**
 * Lo que el adorno cuelga del muro de la sala, de izquierda a derecha en el primer hueco que quepa (con 1 px de aire).
 * `ya` son las piezas que otro decorado ya sumó (la chimenea de la Madera): tampoco se pisan. Si no hay hueco, no va.
 */
export function extrasAdorno(adorno: Adorno | null, sala: Pick<SalaPlano, "muebles" | "w">, ya: readonly Pieza[] = [], escala: number = ESCALA_MINIMA): Pieza[] {
  if (!adorno || escala < ESCALA_MINIMA) return [];
  const puestas: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (const m of [...sala.muebles, ...ya]) {
    const p = PIEZAS[m.nombre === "ventana" ? "ventana-dia" : m.nombre];
    if (p && !m.nombre.startsWith("alfombra")) puestas.push({ x: m.x, y: m.y, w: p.w, h: p.h });
  }
  const r: Pieza[] = [];
  for (const { nombre, cuantas, y } of DEL_MURO[adorno]) {
    const p = PIEZAS[nombre];
    if (!p) continue;
    let n = 0;
    for (let x = DESDE_X; x + p.w <= sala.w - 2 && n < cuantas; x++) {
      const libre = puestas.every((o) => x + p.w + 1 <= o.x || x >= o.x + o.w + 1 || y + p.h + 1 <= o.y || y >= o.y + o.h + 1);
      if (!libre) continue;
      puestas.push({ x, y, w: p.w, h: p.h });
      r.push({ nombre, x, y, z: 2 });
      n++;
      x += p.w;
    }
  }
  return r;
}

/**
 * Lo que se dibuja en una sala con ese decorado y ese adorno (la regla que usa el piso): el decorado manda sobre cada
 * pieza del plano (la Madera pone una lámpara donde iba la planta grande) y el adorno solo cambia la pieza que el decorado
 * dejó igual; después van lo que suma el decorado (la chimenea) y lo que cuelga el adorno del muro.
 */
export function mueblesDeSala(sala: Pick<SalaPlano, "muebles" | "w" | "descanso">, decorado: DecoradoId, adorno: Adorno | null, escala: number = ESCALA_MINIMA): Pieza[] {
  if (decorado === "clasico" && !adorno) return sala.muebles;
  const extras = extrasDecorado(decorado, sala);
  return [
    ...sala.muebles.map((m) => {
      const d = muebleDecorado(decorado, m);
      return d !== m ? d : muebleAdorno(adorno, m);
    }),
    ...extras,
    ...extrasAdorno(adorno, sala, extras, escala),
  ];
}
