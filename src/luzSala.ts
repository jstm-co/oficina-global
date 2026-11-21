// La luz del piso normal, el widget y el modo TV según la hora (JST-416, etapa 2). Sin React ni DOM.
//
// Reutiliza la lógica de la vista 3D (`luz.ts`: cuándo sale y se pone el sol según el reloj de quien mira, y los
// tonos de cada momento) y la traduce a lo que necesita el piso 2D:
//   · qué ventana se ve (la de día o la de noche),
//   · un tinte que se multiplica sobre cada sala (nunca oscurece más de `MAX_OSCURECER`: los agentes, los globos, los
//     rótulos y los estados tienen que leerse igual que siempre; en el tema oscuro, que ya es oscuro, va a la mitad), y
//   · cuánto brillan las lámparas y la chimenea (de noche).
import { luzAhora, mezclar, type Momento } from "./luz.js";

/** Lo más que el tinte oscurece un canal (el 25 % que pide el diseño). */
export const MAX_OSCURECER = 0.25;

/** Cada cuánto se vuelve a mirar la hora (ms): la luz cambia de a poco, no hace falta más seguido. */
export const CADA_MS = 3 * 60 * 1000;

export interface LuzSala {
  momento: Momento;
  /** Color hex que se multiplica sobre la sala (`#ffffff`: sin tinte). */
  tinte: string;
  /** La ventana que se dibuja: la de noche solo cuando ya es de noche (el amanecer y el atardecer llevan la de día). */
  ventana: "dia" | "noche";
  /** Cuánto brillan las lámparas y la chimenea: 0 de día, 1 de noche, y va y viene en el atardecer y el amanecer. */
  halo: number;
}

/** Cuánto oscurece un tinte: lo que le quita al canal más oscuro (0 a 1). */
export function oscurece(tinte: string): number {
  const canales = [1, 3, 5].map((i) => parseInt(tinte.slice(i, i + 2), 16) / 255);
  return 1 - Math.min(...canales);
}

/** La luz del piso a esa fecha y hora (la del reloj local de quien mira); en tema oscuro el tinte es la mitad de fuerte. */
export function luzDeSala(fecha: Date, oscuro: boolean): LuzSala {
  const l = luzAhora(fecha);
  const base = l.tinte;
  const tinte = oscuro ? mezclar(base, "#ffffff", 0.5) : base;
  return {
    momento: l.momento,
    tinte,
    ventana: l.momento === "noche" ? "noche" : "dia",
    // `estrellas` ya va de 0 a 1 con el cielo oscureciéndose; el atardecer empieza a encender un poco antes.
    halo: l.momento === "atardecer" ? Math.max(l.estrellas, 0.35) : l.momento === "amanecer" ? Math.max(l.estrellas, 0.2) : l.estrellas,
  };
}
