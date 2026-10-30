// La luz de la vista 3D, sin DOM, según la hora de quien mira, en el reloj de
// su navegador, esté donde esté (cada uno ve su propia hora: de día en un país
// mientras en otro ya atardece):
//
// - lo que se tiñe la oficina: adentro las lámparas siguen encendidas, y de
//   noche se apaga un poco, no se queda a oscuras;
// - el cielo que se ve por las ventanas: celeste de día, naranja al atardecer,
//   oscuro y con estrellas de noche; las nubes y las estrellas aparecen poco a poco;
// - la luz del sol que entra por ellas y cae en el piso: de qué color es, cuánto
//   se ve y hacia dónde va (`rayo`). Todas las ventanas dan al sol, que sale por
//   la izquierda y se pone por la derecha: no sabemos hacia dónde mira tu
//   oficina, y así se ve igual en todas las salas.
//
// Sin saber dónde estás, cuándo sale y se pone el sol se estima con lo que dice
// el reloj: el mediodía cae ≈12:30 de la hora normal (una hora más tarde en
// horario de verano) y el día dura 12 h donde no se cambia la hora (cerca del
// ecuador, o donde no se usa), 14 h en verano y 10 h en invierno donde sí. En
// un verano largo del sur, la oficina no se oscurece con el sol afuera.

/** La hora local (en horas, con decimales) y si es horario de verano (`null`: allí no se cambia la hora). */
export interface Reloj {
  horas: number;
  verano: boolean | null;
}

/** Cuándo sale y se pone el sol, en horas del reloj local. */
export interface Sol {
  sale: number;
  pone: number;
}

export type Momento = "noche" | "amanecer" | "dia" | "atardecer";

/** Los colores de un momento (hex sRGB). */
export interface Tono {
  /** Lo que se multiplican los colores de la oficina (no hay luces en la escena: se tiñe). */
  tinte: string;
  /** El cielo por la ventana: el color de arriba y el de abajo (va de uno al otro, fila por fila). */
  cielo: { arriba: string; abajo: string };
  /** Lo que se ven las estrellas y la luna (0: nada; 1: de noche). Las nubes, al revés. Salen con el cielo ya oscuro, no en el amanecer ni el atardecer. */
  estrellas: number;
  /** La luz que entra por las ventanas: su color y cuánto se ve (0: nada, de noche). */
  sol: { color: string; fuerza: number };
}

/** Hacia dónde va la luz del sol (de largo 1, hacia abajo: `y` < 0). `z` hacia adentro de la sala, `x` a la derecha. */
export interface Rayo {
  x: number;
  y: number;
  z: number;
}

export interface Luz extends Tono {
  momento: Momento;
  rayo: Rayo;
}

/** El mediodía solar estimado, en hora normal. */
const MEDIODIA = 12.5;
/** Lo que dura el día: sin horario de verano, en verano y en invierno. */
const DURA = { parejo: 12, verano: 14, invierno: 10 };
/** El amanecer y el atardecer: lo que tarda en pasar de la noche al día (o al revés), con el sol en el medio. */
const CREPUSCULO = 1;
/**
 * El sol, en radianes: lo alto que llega a mediodía y lo bajo que entra al salir
 * y al ponerse (más bajo, la luz se estira y sale de la sala), y lo que se corre
 * a cada lado (de la izquierda al salir, de la derecha al ponerse).
 */
const SOL = { altoMax: (50 * Math.PI) / 180, altoMin: (15 * Math.PI) / 180, rumbo: (50 * Math.PI) / 180 };

// El cielo de día y el de noche salen del vidrio de las ventanas de la 2D (#9fd2f2 y #1d2a4d): arriba, más hondo.
export const TONOS: Readonly<Record<Momento, Tono>> = {
  dia: { tinte: "#ffffff", cielo: { arriba: "#7fbfeb", abajo: "#c6e7f8" }, estrellas: 0, sol: { color: "#fff3cf", fuerza: 1 } },
  amanecer: { tinte: "#ffeedd", cielo: { arriba: "#8c9ad4", abajo: "#ffc79c" }, estrellas: 0, sol: { color: "#ffd3a3", fuerza: 0.35 } },
  atardecer: { tinte: "#ffe2c8", cielo: { arriba: "#6b63ae", abajo: "#ff9d68" }, estrellas: 0, sol: { color: "#ffb273", fuerza: 0.6 } },
  noche: { tinte: "#c4c8e2", cielo: { arriba: "#0c1430", abajo: "#1d2a4d" }, estrellas: 1, sol: { color: "#ffb273", fuerza: 0 } },
};

/** La hora de una fecha en el reloj local del navegador, y si está en horario de verano. */
export function relojDe(fecha: Date): Reloj {
  const horas = fecha.getHours() + fecha.getMinutes() / 60 + fecha.getSeconds() / 3600;
  const enero = new Date(fecha.getFullYear(), 0, 1).getTimezoneOffset();
  const julio = new Date(fecha.getFullYear(), 6, 1).getTimezoneOffset();
  if (enero === julio) return { horas, verano: null };
  // En horario de verano el reloj va adelantado: la diferencia con UTC es la menor de las dos (en los dos hemisferios).
  return { horas, verano: fecha.getTimezoneOffset() === Math.min(enero, julio) };
}

/** Cuándo sale y se pone el sol, estimado con lo que dice el reloj. */
export function solDe(r: Reloj): Sol {
  const mediodia = MEDIODIA + (r.verano ? 1 : 0);
  const dura = r.verano === null ? DURA.parejo : r.verano ? DURA.verano : DURA.invierno;
  return { sale: mediodia - dura / 2, pone: mediodia + dura / 2 };
}

const canal = (hex: string, i: number) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);

/** Entre dos colores hex: `t` 0 es `a`, 1 es `b`. */
export function mezclar(a: string, b: string, t: number): string {
  const k = Math.max(0, Math.min(1, t));
  let s = "#";
  for (let i = 0; i < 3; i++) s += Math.round(canal(a, i) + (canal(b, i) - canal(a, i)) * k).toString(16).padStart(2, "0");
  return s;
}

const lineal = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t));

function entre(a: Tono, b: Tono, t: number): Tono {
  return {
    tinte: mezclar(a.tinte, b.tinte, t),
    cielo: { arriba: mezclar(a.cielo.arriba, b.cielo.arriba, t), abajo: mezclar(a.cielo.abajo, b.cielo.abajo, t) },
    estrellas: lineal(a.estrellas, b.estrellas, t),
    sol: { color: mezclar(a.sol.color, b.sol.color, t), fuerza: lineal(a.sol.fuerza, b.sol.fuerza, t) },
  };
}

/**
 * Hacia dónde va la luz a una hora: entre que sale y se pone el sol, de la
 * izquierda a la derecha, más alto a mediodía. Antes de que salga y después de
 * que se pone queda como al salir o al ponerse (de noche no se ve: `sol.fuerza` es 0).
 */
export function rayoDe(horas: number, sol: Sol): Rayo {
  const h = ((horas % 24) + 24) % 24;
  const t = Math.max(0, Math.min(1, (h - sol.sale) / (sol.pone - sol.sale)));
  const alto = SOL.altoMin + (SOL.altoMax - SOL.altoMin) * Math.sin(Math.PI * t);
  const rumbo = (0.5 - t) * 2 * SOL.rumbo;
  return { x: Math.cos(alto) * Math.sin(rumbo), y: -Math.sin(alto), z: Math.cos(alto) * Math.cos(rumbo) };
}

/**
 * La luz a una hora (del reloj local), con el sol que dice `solDe`: de noche;
 * al salir el sol, el amanecer (una hora antes viene de la noche, una hora
 * después ya es de día); al ponerse, el atardecer, igual. Pasa de un tono al
 * otro poco a poco.
 */
export function luzDe(horas: number, sol: Sol): Luz {
  const h = ((horas % 24) + 24) % 24;
  const paradas: Array<[number, Momento]> = [
    [sol.sale - CREPUSCULO, "noche"],
    [sol.sale, "amanecer"],
    [sol.sale + CREPUSCULO, "dia"],
    [sol.pone - CREPUSCULO, "dia"],
    [sol.pone, "atardecer"],
    [sol.pone + CREPUSCULO, "noche"],
  ];
  let tono: Tono = TONOS.noche;
  for (let i = 0; i < paradas.length - 1; i++) {
    const [t0, m0] = paradas[i]!;
    const [t1, m1] = paradas[i + 1]!;
    if (h >= t0 && h < t1) tono = entre(TONOS[m0], TONOS[m1], (h - t0) / (t1 - t0));
  }
  const momento: Momento =
    h < sol.sale - CREPUSCULO / 2 || h >= sol.pone + CREPUSCULO / 2 ? "noche" : h < sol.sale + CREPUSCULO / 2 ? "amanecer" : h < sol.pone - CREPUSCULO / 2 ? "dia" : "atardecer";
  return { ...tono, momento, rayo: rayoDe(h, sol) };
}

/** La luz de ahora, en el reloj del navegador. */
export function luzAhora(fecha = new Date()): Luz {
  const r = relojDe(fecha);
  return luzDe(r.horas, solDe(r));
}
