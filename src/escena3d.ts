// La oficina en 3D, en primera persona, sacada del mismo plano que la 2D (sin
// React ni DOM). No es una segunda oficina: la 2D ya es una vista de 3/4 en la
// que cada fila de pantalla junta el fondo y la altura (fila = z − y). Aquí se
// deshace ese truco:
//
// - El suelo (alfombra, madera y pasillo) va acostado, y el muro, de pie.
// - Cada mueble se dobla como un papel por las filas que dice `muebles.json`
//   (`pliegues`, los escribe `fuente/muebles.py`): desde abajo, una franja de
//   pie (el frente), la siguiente acostada (la tapa) y así, alternando.
// - Lo que cuelga en el muro (ventanas, cuadros, reloj, pizarra) va pegado a él.
//   Por el vidrio de las ventanas se ve el cielo de la hora (lo pinta el visor),
//   y la luz del sol que entra por ellas cae en el piso de su sala (`manchaDe`).
// - Lo que la 2D no dibuja y en primera persona hace falta para que sea una
//   oficina: cada sala cerrada por sus cuatro paredes (la del fondo, con lo que
//   cuelga), con puertas al pasillo donde hay uno, los muros del edificio y un
//   techo con lámparas. La pared de la 2D va abajo; encima, lisa hasta el techo.
// - Los personajes y las plantas (`giran`) van de pie y te miran siempre.
// - Lo que va de pie tiene cuerpo (`Cuerpo`): se mete hacia atrás hasta donde
//   llega la tapa que lleva encima, y sus costados, su espalda y su tapa salen
//   del borde de su propio dibujo (`volumen`), como un sprite extruido.
//
// La textura de cada vértice es su lugar en el dibujo 2D: (x, z − y). Así, una
// cámara que mire desde arriba en diagonal (proyección oblicua) ve la 2D exacta,
// pixel por pixel (`tests/escena3d.spec.ts`).
//
// Ejes, en pixeles de arte: x a la derecha y z hacia abajo (los de la 2D, en el
// piso entero), y la altura hacia arriba.
import MUEBLES from "./ui/assets/muebles.json" with { type: "json" };
import { cajasDe, type Caja, type Punto } from "./caminos.js";
import type { Rayo } from "./luz.js";
import { CON_COLOR, MURO, PASILLO, spriteDe, type PisoPlano, type SalaPlano } from "./plano.js";

const PIEZAS: Readonly<Record<string, { x: number; y: number; w: number; h: number }>> = MUEBLES.piezas;
const PLIEGUES: Readonly<Record<string, readonly number[]>> = MUEBLES.pliegues;
const GIRAN: ReadonlySet<string> = new Set(MUEBLES.giran);

/** Ancho y alto de las baldosas que se repiten (las de `sprites.ts`, sin `-claro` ni `-oscuro`). */
const BALDOSA_ALFOMBRA = { w: 16, h: 16 };
const BALDOSA_MADERA = { w: 32, h: 16 };
const BALDOSA_PASILLO = { w: 16, h: 16 };
const BALDOSA_MURO = { w: 16, h: MURO };
/** El contorno de cada sala (`.of-sala`, 3 pixeles de arte con el color de las líneas). */
const CONTORNO = 3;
/**
 * El fondo de lo que va de pie sin una tapa encima: lo de más arriba de un mueble
 * doblado (el respaldo de una silla), y el monitor, que no puede pasar de la
 * silla (quien se sienta queda 0,7 detrás de él).
 */
const FONDO_ARRIBA = 2;
const FONDO_MONITOR = 0.5;
/** Un mueble que no se dobla (un estante) se mete hasta lo que mide su base en el piso (`huella` en `caminos.ts`). */
const FONDO_SOLO = 10;
/** Lo alto de las salas en la 3D: hasta el techo (quien está de pie mide 22; la pared de la 2D, `MURO`, va abajo). */
export const ALTO_3D = 36;
/** La cornisa contra el techo: el borde de arriba de la pared de la 2D (sus filas 0 y 1), que sube allá. */
const CORNISA = 2;
/** De qué fila de la pared de la 2D sale el color liso de arriba (la de la pared misma) y el de la cornisa. */
const FILA = { liso: 5, cornisa: 0 };
/**
 * Las puertas: su ancho y su alto; el pasillo al que dan, al menos así de ancho
 * (a un borde del piso más angosto, no); lo que se aparta de una esquina y de
 * los muebles, y hasta dónde, hacia adentro, un mueble tapa el paso.
 */
const PUERTA = { w: 18, alto: 28, pasillo: PASILLO, esquina: 6, holgura: 2, hondo: 12 };
/** Las lámparas del techo de cada sala: su tamaño, el del marco y cada cuánto va una. */
const LAMPARA = { w: 12, h: 6, marco: 1, paso: { x: 64, z: 48 } };
/** Los dibujos de la ventana en el atlas: de día y de noche (el visor saca de ellos el marco, las nubes y las estrellas). */
export const VENTANA: Readonly<Record<"dia" | "noche", { x: number; y: number; w: number; h: number }>> = { dia: PIEZAS["ventana-dia"]!, noche: PIEZAS["ventana-noche"]! };

/**
 * De dónde sale el dibujo de una cara: un recorte del atlas de muebles, una
 * baldosa que se repite, el color de un pixel de una baldosa (lo liso de la
 * pared), el color de las líneas, una lámpara (encendida: la luz de la hora no
 * la tiñe) o una ventana (con el cielo de la hora).
 */
export type Textura =
  /** `(ax, ay)`: la esquina de la pieza en el atlas; `(px, py)`: dónde está esa esquina en el dibujo 2D. */
  | { tipo: "atlas"; ax: number; ay: number; px: number; py: number; gris: boolean }
  /** `nombre` sin el tema; `(ox, oy)`: desde dónde se repite en el dibujo 2D (la esquina de su zona). */
  | { tipo: "baldosa"; nombre: string; tw: number; th: number; ox: number; oy: number; gris: boolean }
  /** El color del pixel `(x, y)` de la baldosa `nombre`. */
  | { tipo: "liso"; nombre: string; x: number; y: number; gris: boolean }
  | { tipo: "linea" }
  | { tipo: "lampara" }
  /** `(px, py)`: dónde está la esquina de la ventana en el dibujo 2D (su dibujo es del tamaño de `VENTANA`). */
  | { tipo: "ventana"; px: number; py: number };

/**
 * Un rectángulo del mundo. `pie`: vertical y de frente (mirando hacia +z), en
 * `z`, desde `y` hasta `y + alto`. `lado`: vertical y de costado (mirando hacia
 * +x), en `x`, desde `z` hasta `z + w` (las paredes de los costados); su dibujo
 * va con la fila `z − y` del pie de la cara en toda ella. `suelo`: acostado a
 * la altura `y` (mirando hacia arriba), desde `z` hasta `z + alto`. `vuelta`:
 * mira para el otro lado (−z, −x o hacia abajo: el techo). `capa`: lo que va
 * pegado encima de otra cara (la pantalla sobre el monitor, el cuadro sobre el
 * muro) se corre un poco hacia afuera. `grupo`: lo que el visor muestra u
 * oculta junto (tu silla, que no se ve mientras estás sentado en ella:
 * `silla:<prefijo>`).
 */
export interface Cara {
  plano: "pie" | "suelo" | "lado";
  vuelta?: boolean;
  x: number;
  y: number;
  z: number;
  w: number;
  alto: number;
  capa: number;
  textura: Textura;
  grupo?: string;
}

/** Lo que va de pie y te mira (una planta): el centro de su base y su recorte del atlas. */
export interface Figura {
  x: number;
  z: number;
  w: number;
  h: number;
  ax: number;
  ay: number;
}

/**
 * Un tramo de muro recto: a lo ancho (`z0 = z1`, de `x0` a `x1`) o a lo hondo
 * (`x0 = x1`, de `z0` a `z1`), de pie desde la altura `desde` hasta `alto`.
 * Tapa lo que hay detrás (los globos) y, si llega al suelo, no se cruza (el de
 * encima de una puerta se pasa por debajo).
 */
export interface Muro {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  desde: number;
  alto: number;
}

/** La pantalla de un escritorio, que cambia con el estado del agente: su cara (la del monitor) sin la textura. */
export interface PantallaEscena {
  /** `<prefijo>:<n.º de puesto>` o `<prefijo>:tu` (tu escritorio). */
  clave: string;
  cara: Cara;
  /** Lo que mide el monitor de fondo: por detrás, la pantalla va pegada a su espalda. */
  fondo: number;
}

/**
 * Una cara de pie con cuerpo: se mete `fondo` hacia atrás. `tapada`: encima
 * lleva una tapa acostada (la del escritorio), que ya la cierra por arriba.
 */
export interface Cuerpo {
  cara: Cara;
  fondo: number;
  tapada: boolean;
}

/** Una ventana en su muro (de pie, mirando hacia +z, como su `Cara`) y el piso de su sala, donde cae la luz que entra. */
export interface Ventana3d {
  x: number;
  y: number;
  z: number;
  w: number;
  alto: number;
  suelo: { x0: number; z0: number; x1: number; z1: number };
}

export interface Escena3d {
  caras: Cara[];
  cuerpos: Cuerpo[];
  figuras: Figura[];
  pantallas: PantallaEscena[];
  muros: Muro[];
  ventanas: Ventana3d[];
  ancho: number;
  fondo: number;
}

// ---------------------------------------------------------------------------
// Doblar un dibujo
// ---------------------------------------------------------------------------

/** Un dibujo en la 2D: su esquina, su alto y dónde se dobla. */
interface Molde {
  y: number;
  h: number;
  pliegues: readonly number[];
}

/** Un recorte del dibujo 2D que se pega sobre un molde (el mismo dibujo, o la pantalla sobre el escritorio). */
interface Recorte {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Dónde van los cuerpos de lo que se dobla, y cuánto fondo llevan (ver `doblarEn`). `tope`: no pasan de ahí hacia atrás (el muro). */
interface ConCuerpo {
  lista: Cuerpo[];
  solo: number;
  arriba: number;
  tope: number;
}

/**
 * Las caras de `recorte` doblado como `molde`. Desde abajo: la franja de pie
 * va en `z` (al principio, la base del dibujo) y sube; la acostada va a la
 * altura que llevan las de pie y se mete hacia el fondo. En toda franja vale
 * fila = z − y, la regla de la 2D.
 *
 * Con `cuerpo`, cada franja de pie lleva su fondo: hasta donde llega la tapa que
 * tiene encima; la de más arriba, `arriba`, y un mueble sin pliegues, `solo`.
 */
function doblarEn(molde: Molde, recorte: Recorte, textura: Textura, capa = 0, cuerpo: ConCuerpo | null = null): Cara[] {
  const cortes = [0, ...molde.pliegues, molde.h];
  const caras: Cara[] = [];
  let z = molde.y + molde.h;
  let y = 0;
  for (let i = cortes.length - 1, k = 0; i > 0; i--, k++) {
    const a = molde.y + cortes[i - 1]!;
    const b = molde.y + cortes[i]!;
    const r0 = Math.max(a, recorte.y);
    const r1 = Math.min(b, recorte.y + recorte.h);
    const pie = k % 2 === 0;
    if (r1 > r0) {
      const cara: Cara = pie
        ? { plano: "pie", x: recorte.x, y: z - r1, z, w: recorte.w, alto: r1 - r0, capa, textura }
        : { plano: "suelo", x: recorte.x, y, z: r0 + y, w: recorte.w, alto: r1 - r0, capa, textura };
      caras.push(cara);
      if (pie && cuerpo) {
        const tapada = i > 1;
        const fondo = Math.min(tapada ? cortes[i - 1]! - cortes[i - 2]! : cortes.length === 2 ? cuerpo.solo : cuerpo.arriba, z - cuerpo.tope);
        if (fondo > 0) cuerpo.lista.push({ cara, fondo, tapada });
      }
    }
    if (pie) y += Math.max(0, b - a);
    else z -= Math.max(0, b - a);
  }
  return caras;
}

// ---------------------------------------------------------------------------
// El cuerpo de lo que va de pie
// ---------------------------------------------------------------------------

/**
 * Un rectángulo del cuerpo de un mueble: sus esquinas en el mundo y, de cada
 * una, el punto del dibujo 2D del que toma el color. `lado`: un costado, que
 * desde la 2D se ve de canto; `espalda`; `arriba` y `abajo`: las tapas de un
 * tramo del dibujo.
 */
export interface Lamina {
  tipo: "lado" | "espalda" | "arriba" | "abajo";
  esquinas: [Punto3d, Punto3d, Punto3d, Punto3d];
  dibujo: [Punto, Punto, Punto, Punto];
}

/**
 * Los costados, la espalda y las tapas de un cuerpo, como un sprite extruido:
 * cada pixel del borde del dibujo (uno que se ve junto a uno vacío) se estira
 * hacia atrás con su color. `lleno(x, y)`: si se ve el pixel del dibujo 2D cuya
 * esquina está en (x, y). No van la tapa de arriba de lo que ya cierra la tapa
 * del mueble, ni la de abajo de lo que se apoya en el suelo o en una tapa.
 */
export function volumen(c: Cuerpo, lleno: (x: number, y: number) => boolean): Lamina[] {
  const { cara } = c;
  const z = cara.z;
  const atras = z - c.fondo;
  const x0 = Math.round(cara.x);
  const x1 = Math.round(cara.x + cara.w);
  // Filas del dibujo que cubre (fila = z − altura).
  const t0 = Math.round(z - (cara.y + cara.alto));
  const t1 = Math.round(z - cara.y);
  const ve = (x: number, t: number) => x >= x0 && x < x1 && t >= t0 && t < t1 && lleno(x, t);
  const laminas: Lamina[] = [
    {
      tipo: "espalda",
      esquinas: [
        { x: x0, y: z - t1, z: atras },
        { x: x1, y: z - t1, z: atras },
        { x: x1, y: z - t0, z: atras },
        { x: x0, y: z - t0, z: atras },
      ],
      dibujo: [
        { x: x0, y: t1 },
        { x: x1, y: t1 },
        { x: x1, y: t0 },
        { x: x0, y: t0 },
      ],
    },
  ];
  // Costados: por columna, los tramos de filas con un vacío al lado.
  for (let x = x0; x < x1; x++) {
    for (const lado of [-1, 1]) {
      const borde = x + (lado > 0 ? 1 : 0);
      const u = x + 0.5;
      let desde: number | null = null;
      for (let t = t0; t <= t1; t++) {
        const es = t < t1 && ve(x, t) && !ve(x + lado, t);
        if (es && desde === null) desde = t;
        if (!es && desde !== null) {
          laminas.push({
            tipo: "lado",
            esquinas: [
              { x: borde, y: z - t, z },
              { x: borde, y: z - t, z: atras },
              { x: borde, y: z - desde, z: atras },
              { x: borde, y: z - desde, z },
            ],
            dibujo: [
              { x: u, y: t },
              { x: u, y: t },
              { x: u, y: desde },
              { x: u, y: desde },
            ],
          });
          desde = null;
        }
      }
    }
  }
  // Tapas: por fila, los tramos de columnas con un vacío arriba (o abajo).
  for (let t = t0; t < t1; t++) {
    for (const tipo of ["arriba", "abajo"] as const) {
      if (tipo === "arriba" && t === t0 && c.tapada) continue;
      if (tipo === "abajo" && t === t1 - 1) continue;
      const vecina = tipo === "arriba" ? t - 1 : t + 1;
      const altura = tipo === "arriba" ? z - t : z - t - 1;
      const v = t + 0.5;
      let desde: number | null = null;
      for (let x = x0; x <= x1; x++) {
        const es = x < x1 && ve(x, t) && !ve(x, vecina);
        if (es && desde === null) desde = x;
        if (!es && desde !== null) {
          laminas.push({
            tipo,
            esquinas: [
              { x: desde, y: altura, z },
              { x, y: altura, z },
              { x, y: altura, z: atras },
              { x: desde, y: altura, z: atras },
            ],
            dibujo: [
              { x: desde, y: v },
              { x, y: v },
              { x, y: v },
              { x: desde, y: v },
            ],
          });
          desde = null;
        }
      }
    }
  }
  return laminas;
}

/** La textura de una pieza del atlas dibujada con su esquina en (x, y). */
function deAtlas(nombre: string, x: number, y: number, gris: boolean): Textura {
  const p = PIEZAS[nombre]!;
  return { tipo: "atlas", ax: p.x, ay: p.y, px: x, py: y, gris };
}

/** Un mueble entero, con su esquina en (x, y) del piso, doblado por sus pliegues. */
export function doblar(nombre: string, x: number, y: number, gris = false, capa = 0): Cara[] {
  const p = PIEZAS[nombre];
  if (!p) return [];
  return doblarEn({ y, h: p.h, pliegues: PLIEGUES[nombre] ?? [] }, { x, y, w: p.w, h: p.h }, deAtlas(nombre, x, y, gris), capa);
}

// ---------------------------------------------------------------------------
// La escena del piso
// ---------------------------------------------------------------------------

/** Esquina del personaje sentado en el puesto (x, y), como en la 2D (`Puesto`): (x + 10, y). */
const PERSONAJE_EN_PUESTO = { x: 10, y: 0 };

/** Un mueble entero, con su esquina en (x, y) del piso, doblado y con su cuerpo, en la escena. */
function poner(e: Escena3d, nombre: string, x: number, y: number, gris: boolean, fondos: Omit<ConCuerpo, "lista">, grupo?: string): void {
  const p = PIEZAS[nombre];
  if (!p) return;
  const caras = doblarEn({ y, h: p.h, pliegues: PLIEGUES[nombre] ?? [] }, { x, y, w: p.w, h: p.h }, deAtlas(nombre, x, y, gris), 0, { lista: e.cuerpos, ...fondos });
  // Sus cuerpos tienen las mismas caras: les llega el grupo también.
  if (grupo) for (const c of caras) c.grupo = grupo;
  e.caras.push(...caras);
}

/** Un escritorio con su silla (el de un agente o el tuyo, en la esquina (x, y) del puesto, relativa al piso). `tuyo`: la silla va en su grupo. */
function escritorio(e: Escena3d, prefijo: string, x: number, y: number, tuyo = false): void {
  const gris = !CON_COLOR.includes(prefijo);
  // Como en la 2D: la silla en (x + 11, y + 8), detrás del personaje, y el escritorio en (x, y + 8).
  poner(e, `silla-${spriteDe(prefijo)}`, x + 11, y + 8, gris, { solo: FONDO_SOLO, arriba: FONDO_ARRIBA, tope: -Infinity }, tuyo ? sillaTuya(prefijo) : undefined);
  poner(e, "escritorio", x, y + 8, false, { solo: FONDO_SOLO, arriba: FONDO_MONITOR, tope: -Infinity });
}

/** El grupo de tu silla en la sala (ver `Cara.grupo`). */
export function sillaTuya(prefijo: string): string {
  return `silla:${prefijo}`;
}

/** La pantalla del escritorio (x, y): en (x + 2, y + 9), doblada sobre el monitor del escritorio. */
function pantalla(clave: string, x: number, y: number): PantallaEscena {
  const molde = PIEZAS["escritorio"]!;
  const p = PIEZAS["pantalla-apagada-0"]!;
  const caras = doblarEn({ y: y + 8, h: molde.h, pliegues: PLIEGUES["escritorio"] ?? [] }, { x: x + 2, y: y + 9, w: p.w, h: p.h }, deAtlas("pantalla-apagada-0", x + 2, y + 9, false), 1);
  return { clave, cara: caras[0]!, fondo: FONDO_MONITOR };
}

function salaEnEscena(sala: SalaPlano, plano: PisoPlano, e: Escena3d): void {
  const sx = sala.x;
  const sy = sala.y;
  const pre = spriteDe(sala.prefijo);
  const gris = !CON_COLOR.includes(sala.prefijo);
  const piso = sala.h - MURO;
  // Suelo: la alfombra de la empresa bajo los escritorios y la madera en el descanso (`FondoSala`).
  e.caras.push({
    plano: "suelo",
    x: sx,
    y: 0,
    z: sy + MURO,
    w: sala.anchoEscritorios,
    alto: piso,
    capa: 0,
    textura: { tipo: "baldosa", nombre: `alfombra-${pre}`, tw: BALDOSA_ALFOMBRA.w, th: BALDOSA_ALFOMBRA.h, ox: sx, oy: sy + MURO, gris },
  });
  e.caras.push({
    plano: "suelo",
    x: sx + sala.anchoEscritorios,
    y: 0,
    z: sy + MURO,
    w: sala.w - sala.anchoEscritorios,
    alto: piso,
    capa: 0,
    textura: { tipo: "baldosa", nombre: "piso-madera", tw: BALDOSA_MADERA.w, th: BALDOSA_MADERA.h, ox: sx + sala.anchoEscritorios, oy: sy + MURO, gris: false },
  });
  // Las cuatro paredes: la del fondo, de pie sobre la línea donde empieza el suelo; las otras, en el borde de la sala.
  // Todas miran hacia adentro, con las puertas al pasillo.
  const pared: Pared = { nombre: `pared-${pre}`, gris };
  const puertas = puertasDe(plano, sala);
  const hondo = [sy + MURO, sy + sala.h] as const;
  levantar(e, { eje: "ancho", en: sy + MURO, a: sx, b: sx + sala.w, vuelta: false, pared, puertas: puertas.fondo });
  levantar(e, { eje: "ancho", en: sy + sala.h, a: sx, b: sx + sala.w, vuelta: true, pared, puertas: puertas.frente });
  levantar(e, { eje: "hondo", en: sx, a: hondo[0], b: hondo[1], vuelta: false, pared, puertas: puertas.izquierda });
  levantar(e, { eje: "hondo", en: sx + sala.w, a: hondo[0], b: hondo[1], vuelta: true, pared, puertas: puertas.derecha });
  lamparas(e, sx, hondo[0], sala.w, hondo[1] - hondo[0]);
  // El contorno de la sala, en el suelo por fuera.
  for (const [x, z, w, alto] of [
    [sx - CONTORNO, sy - CONTORNO, sala.w + CONTORNO * 2, CONTORNO],
    [sx - CONTORNO, sy + sala.h, sala.w + CONTORNO * 2, CONTORNO],
    [sx - CONTORNO, sy, CONTORNO, sala.h],
    [sx + sala.w, sy, CONTORNO, sala.h],
  ] as const) {
    e.caras.push({ plano: "suelo", x, y: 0, z, w, alto, capa: 0, textura: { tipo: "linea" } });
  }
  // Los muebles: lo que cabe en el muro cuelga de él; lo demás se dobla, o va de pie y te mira.
  const muro: Molde = { y: sy, h: MURO, pliegues: [] };
  for (const m of sala.muebles) {
    // La ventana: el visor le pinta el cielo de la hora, y la luz que entra por ella cae en el piso de la sala.
    if (m.nombre === "ventana") {
      const caras = doblarEn(muro, { x: sx + m.x, y: sy + m.y, w: VENTANA.dia.w, h: VENTANA.dia.h }, { tipo: "ventana", px: sx + m.x, py: sy + m.y }, 1);
      e.caras.push(...caras);
      const [c] = caras;
      if (c && caras.length === 1) e.ventanas.push({ x: c.x, y: c.y, z: c.z, w: c.w, alto: c.alto, suelo: { x0: sx, z0: sy + MURO, x1: sx + sala.w, z1: sy + sala.h } });
      continue;
    }
    // Como en `FondoSala`: el cuadro de una empresa sin color, en gris.
    const nombre = m.nombre;
    const pieza = PIEZAS[nombre];
    if (!pieza) continue;
    const x = sx + m.x;
    const y = sy + m.y;
    const textura = deAtlas(nombre, x, y, gris && nombre.startsWith("cuadro-"));
    if (m.y + pieza.h <= MURO) {
      e.caras.push(...doblarEn(muro, { x, y, w: pieza.w, h: pieza.h }, textura, 1));
      continue;
    }
    if (GIRAN.has(nombre)) {
      e.figuras.push({ x: x + pieza.w / 2, z: y + pieza.h, w: pieza.w, h: pieza.h, ax: pieza.x, ay: pieza.y });
      continue;
    }
    // La alfombra del descanso va bajo todo (z = 1 en la 2D): un poco por encima del suelo.
    const capa = nombre.startsWith("alfombra") ? 1 : 0;
    // Con cuerpo, sin meterse en el muro.
    const fondos = { solo: Math.min(FONDO_SOLO, pieza.h), arriba: FONDO_ARRIBA, tope: sy + MURO + 0.1 };
    e.caras.push(...doblarEn({ y, h: pieza.h, pliegues: PLIEGUES[nombre] ?? [] }, { x, y, w: pieza.w, h: pieza.h }, textura, capa, { lista: e.cuerpos, ...fondos }));
  }
  // Los escritorios de los agentes y el tuyo, cada uno con su pantalla.
  sala.puestos.forEach((p, i) => {
    escritorio(e, sala.prefijo, sx + p.x, sy + p.y);
    e.pantallas.push(pantalla(`${sala.prefijo}:${i}`, sx + p.x, sy + p.y));
  });
  if (sala.escritorio) {
    escritorio(e, sala.prefijo, sx + sala.escritorio.x, sy + sala.escritorio.y, true);
    e.pantallas.push(pantalla(`${sala.prefijo}:tu`, sx + sala.escritorio.x, sy + sala.escritorio.y));
  }
}

// ---------------------------------------------------------------------------
// Paredes, puertas y techo (lo que la 2D no dibuja)
// ---------------------------------------------------------------------------

/** La pared de una sala (o la del edificio): su baldosa de la 2D. */
interface Pared {
  nombre: string;
  gris: boolean;
}

/** Un tramo de pared recto, con su cara hacia adentro: a lo ancho (en z = `en`, de x = `a` a `b`) o a lo hondo (en x = `en`, de z = `a` a `b`). */
interface Tramo {
  eje: "ancho" | "hondo";
  en: number;
  a: number;
  b: number;
  /** Mira hacia −z (a lo ancho) o hacia −x (a lo hondo). */
  vuelta: boolean;
  pared: Pared;
  /** Los huecos de las puertas, de dónde a dónde. */
  puertas: ReadonlyArray<readonly [number, number]>;
}

function caraDe(t: Tramo, a: number, b: number, y: number, alto: number, textura: Textura): Cara {
  return t.eje === "ancho"
    ? { plano: "pie", vuelta: t.vuelta, x: a, y, z: t.en, w: b - a, alto, capa: 0, textura }
    : { plano: "lado", vuelta: t.vuelta, x: t.en, y, z: a, w: b - a, alto, capa: 0, textura };
}

function muroDe(t: Tramo, a: number, b: number, desde: number): Muro {
  return t.eje === "ancho" ? { x0: a, z0: t.en, x1: b, z1: t.en, desde, alto: ALTO_3D } : { x0: t.en, z0: a, x1: t.en, z1: b, desde, alto: ALTO_3D };
}

/**
 * Levanta un tramo: abajo, la pared de la 2D (sin su borde de arriba, que va de
 * cornisa contra el techo); encima, lisa del color de la pared. Sobre cada
 * puerta, solo lo de arriba (el dintel).
 */
function levantar(e: Escena3d, t: Tramo): void {
  const liso = (fila: number): Textura => ({ tipo: "liso", nombre: t.pared.nombre, x: 0, y: fila, gris: t.pared.gris });
  const bajo = MURO - CORNISA;
  const tope = ALTO_3D - CORNISA;
  const arriba = (a: number, b: number, desde: number) => {
    e.caras.push(caraDe(t, a, b, desde, tope - desde, liso(FILA.liso)), caraDe(t, a, b, tope, CORNISA, liso(FILA.cornisa)));
  };
  const puertas = [...t.puertas].sort((p, q) => p[0] - q[0]);
  let desde = t.a;
  const macizos: Array<[number, number]> = [];
  for (const [p0, p1] of puertas) {
    if (p0 > desde) macizos.push([desde, p0]);
    desde = Math.max(desde, p1);
  }
  if (desde < t.b) macizos.push([desde, t.b]);
  for (const [a, b] of macizos) {
    // La fila del dibujo en el pie de la cara: la pared de la 2D termina ahí (fila = z − y; a lo hondo, la de su principio).
    const pie = t.eje === "ancho" ? t.en : a;
    e.caras.push(caraDe(t, a, b, 0, bajo, { tipo: "baldosa", nombre: t.pared.nombre, tw: BALDOSA_MURO.w, th: BALDOSA_MURO.h, ox: 0, oy: pie - MURO, gris: t.pared.gris }));
    arriba(a, b, bajo);
    e.muros.push(muroDe(t, a, b, 0));
  }
  for (const [p0, p1] of puertas) {
    arriba(p0, p1, PUERTA.alto);
    e.muros.push(muroDe(t, p0, p1, PUERTA.alto));
  }
}

/** Las lámparas del techo sobre el rectángulo (x, z, w, hondo): cada una, con su marco del color de las líneas. */
function lamparas(e: Escena3d, x: number, z: number, w: number, hondo: number): void {
  const reparto = (largo: number, paso: number) => {
    const n = Math.max(1, Math.floor(largo / paso));
    return Array.from({ length: n }, (_, i) => (largo - (n - 1) * paso) / 2 + i * paso);
  };
  const m = LAMPARA.marco;
  for (const cx of reparto(w, LAMPARA.paso.x)) {
    for (const cz of reparto(hondo, LAMPARA.paso.z)) {
      const x0 = x + cx - LAMPARA.w / 2;
      const z0 = z + cz - LAMPARA.h / 2;
      e.caras.push(
        { plano: "suelo", vuelta: true, x: x0 - m, y: ALTO_3D, z: z0 - m, w: LAMPARA.w + 2 * m, alto: LAMPARA.h + 2 * m, capa: 1, textura: { tipo: "linea" } },
        { plano: "suelo", vuelta: true, x: x0, y: ALTO_3D, z: z0, w: LAMPARA.w, alto: LAMPARA.h, capa: 2, textura: { tipo: "lampara" } },
      );
    }
  }
}

/** Las puertas de una sala, por pared: de dónde a dónde va cada hueco. */
export interface PuertasSala {
  fondo: Array<[number, number]>;
  frente: Array<[number, number]>;
  izquierda: Array<[number, number]>;
  derecha: Array<[number, number]>;
}

const cruzan = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1;

/**
 * Dónde van las puertas de una sala. En la 2D no hay (nadie sale de su sala);
 * en la 3D se camina de una a otra por el pasillo. Va una en cada pared que da
 * a un pasillo de al menos `PUERTA.pasillo` (no a un borde del piso más
 * angosto), en el tramo libre más cerca del medio de la pared: sin un mueble
 * que tape el paso ni, en la del fondo, nada colgado. La del fondo, con lo que
 * cuelga, solo si ninguna otra da a un pasillo (la sala sola en su fila), y
 * nunca si la sala es la única del piso.
 */
export function puertasDe(plano: PisoPlano, sala: SalaPlano): PuertasSala {
  const sx = sala.x;
  const sy = sala.y;
  const fondo = sy + MURO;
  const frente = sy + sala.h;
  const otras = plano.salas.filter((s) => s !== sala);
  // Lo que hay del otro lado de cada pared, hasta la pared siguiente (la de otra sala) o el borde del piso.
  const ancho = (a: number, b: number) => (s: SalaPlano) => cruzan(s.x, s.x + s.w, a, b);
  const hondo = (s: SalaPlano) => cruzan(s.y + MURO, s.y + s.h, fondo, frente);
  const abajo = otras.filter((s) => ancho(sx, sx + sala.w)(s) && s.y >= frente);
  const arriba = otras.filter((s) => ancho(sx, sx + sala.w)(s) && s.y + s.h <= sy);
  const izq = otras.filter((s) => hondo(s) && s.x + s.w <= sx);
  const der = otras.filter((s) => hondo(s) && s.x >= sx + sala.w);
  const espacio = {
    frente: Math.min(plano.h, ...abajo.map((s) => s.y + MURO)) - frente,
    fondo: fondo - Math.max(0, ...arriba.map((s) => s.y + s.h)),
    izquierda: sx - Math.max(0, ...izq.map((s) => s.x + s.w)),
    derecha: Math.min(plano.w, ...der.map((s) => s.x)) - (sx + sala.w),
  };
  // Lo que tapa el paso junto a cada pared: los muebles sólidos y los escritorios (`cajasDe`), y en la del fondo, lo colgado y tu fila.
  const cajas = cajasDe({ ...sala, rotulo: null }).map((c): Caja => [sx + c[0], sy + c[1], sx + c[2], sy + c[3]]);
  const colgado = sala.muebles.flatMap((m) => {
    const p = PIEZAS[m.nombre === "ventana" ? "ventana-dia" : m.nombre];
    return p && m.y + p.h <= MURO ? [[sx + m.x, sx + m.x + p.w] as [number, number]] : [];
  });
  const fila = sala.fila.map((f): [number, number] => [sx + f.x - PUERTA.w / 2, sx + f.x + PUERTA.w / 2]);
  const h = PUERTA.holgura;
  const tapan = {
    frente: cajas.filter((c) => c[3] > frente - PUERTA.hondo).map((c): [number, number] => [c[0] - h, c[2] + h]),
    fondo: [...cajas.filter((c) => c[1] < fondo + PUERTA.hondo).map((c): [number, number] => [c[0] - h, c[2] + h]), ...colgado, ...fila],
    izquierda: cajas.filter((c) => c[0] < sx + PUERTA.hondo).map((c): [number, number] => [c[1] - h, c[3] + h]),
    derecha: cajas.filter((c) => c[2] > sx + sala.w - PUERTA.hondo).map((c): [number, number] => [c[1] - h, c[3] + h]),
  };
  const tramo = { frente: [sx, sx + sala.w], fondo: [sx, sx + sala.w], izquierda: [fondo, frente], derecha: [fondo, frente] } as const;
  const hueco = (lado: keyof PuertasSala): Array<[number, number]> => {
    const [a, b] = tramo[lado];
    const medio = (a + b) / 2;
    const libre = (c: number) => c - PUERTA.w / 2 >= a + PUERTA.esquina && c + PUERTA.w / 2 <= b - PUERTA.esquina && !tapan[lado].some(([t0, t1]) => cruzan(c - PUERTA.w / 2, c + PUERTA.w / 2, t0, t1));
    for (let d = 0; d <= (b - a) / 2; d++) {
      for (const c of [medio - d, medio + d]) if (libre(c)) return [[c - PUERTA.w / 2, c + PUERTA.w / 2]];
    }
    return [];
  };
  const da = (lado: keyof PuertasSala) => espacio[lado] >= PUERTA.pasillo;
  const p: PuertasSala = { fondo: [], frente: [], izquierda: [], derecha: [] };
  for (const lado of ["frente", "izquierda", "derecha"] as const) if (da(lado)) p[lado] = hueco(lado);
  if (otras.length > 0 && !p.frente.length && !p.izquierda.length && !p.derecha.length && da("fondo")) p.fondo = hueco("fondo");
  return p;
}

/** Los muros del edificio (por dentro, del gris de la pared de la primera sala) y el techo de todo el piso. */
function edificio(e: Escena3d, plano: PisoPlano): void {
  const primera = plano.salas[0];
  if (!primera) return;
  const pared: Pared = { nombre: `pared-${spriteDe(primera.prefijo)}`, gris: true };
  levantar(e, { eje: "ancho", en: 0, a: 0, b: plano.w, vuelta: false, pared, puertas: [] });
  levantar(e, { eje: "ancho", en: plano.h, a: 0, b: plano.w, vuelta: true, pared, puertas: [] });
  levantar(e, { eje: "hondo", en: 0, a: 0, b: plano.h, vuelta: false, pared, puertas: [] });
  levantar(e, { eje: "hondo", en: plano.w, a: 0, b: plano.h, vuelta: true, pared, puertas: [] });
  // El techo: las baldosas del pasillo, al doble (paneles de techo), mirando hacia abajo.
  e.caras.push({
    plano: "suelo",
    vuelta: true,
    x: 0,
    y: ALTO_3D,
    z: 0,
    w: plano.w,
    alto: plano.h,
    capa: 0,
    textura: { tipo: "baldosa", nombre: "piso-baldosa", tw: BALDOSA_PASILLO.w * 2, th: BALDOSA_PASILLO.h * 2, ox: 0, oy: -ALTO_3D, gris: false },
  });
}

/**
 * Todo lo quieto del piso: suelo, paredes, muebles, escritorios y techo. Los
 * personajes y las pantallas se ponen en cada cuadro.
 */
export function escenaDePiso(plano: PisoPlano): Escena3d {
  const e: Escena3d = { caras: [], cuerpos: [], figuras: [], pantallas: [], muros: [], ventanas: [], ancho: plano.w, fondo: plano.h };
  // El pasillo, bajo las salas (`.of-pasillo`).
  e.caras.push({
    plano: "suelo",
    x: 0,
    y: 0,
    z: 0,
    w: plano.w,
    alto: plano.h,
    capa: -1,
    textura: { tipo: "baldosa", nombre: "piso-baldosa", tw: BALDOSA_PASILLO.w, th: BALDOSA_PASILLO.h, ox: 0, oy: 0, gris: false },
  });
  for (const sala of plano.salas) salaEnEscena(sala, plano, e);
  edificio(e, plano);
  return e;
}

// ---------------------------------------------------------------------------
// La luz que entra por las ventanas
// ---------------------------------------------------------------------------

/** Un punto de la luz que entra por una ventana, en el piso: dónde cae y de qué punto del dibujo de la ventana viene (`s` desde su izquierda, `t` desde arriba). */
export interface PuntoMancha {
  x: number;
  z: number;
  s: number;
  t: number;
}

/**
 * La luz del sol que entra por una ventana y cae en el piso de su sala: la
 * ventana proyectada por el rayo (lo de arriba cae más lejos del muro),
 * recortada al piso de la sala (con el sol bajo se estira hasta la pared de
 * enfrente o la del costado). Vacía si el rayo no entra.
 */
export function manchaDe(v: Ventana3d, rayo: Rayo): PuntoMancha[] {
  if (rayo.y >= 0 || rayo.z <= 0) return [];
  // Lo que se corre cada punto, por cada pixel de altura.
  const kx = rayo.x / -rayo.y;
  const kz = rayo.z / -rayo.y;
  const arriba = v.y + v.alto;
  const en = (s: number, t: number): PuntoMancha => {
    const y = arriba - t;
    return { x: v.x + s + y * kx, z: v.z + y * kz, s, t };
  };
  const { x0, z0, x1, z1 } = v.suelo;
  let p = [en(0, v.alto), en(v.w, v.alto), en(v.w, 0), en(0, 0)];
  for (const dentro of [(q: PuntoMancha) => q.x - x0, (q: PuntoMancha) => x1 - q.x, (q: PuntoMancha) => q.z - z0, (q: PuntoMancha) => z1 - q.z]) p = recortar(p, dentro);
  return p;
}

/** Lo que queda de un polígono convexo del lado donde `dentro` es ≥ 0 (Sutherland–Hodgman): en cada corte, el punto del dibujo va en proporción. */
function recortar(p: readonly PuntoMancha[], dentro: (q: PuntoMancha) => number): PuntoMancha[] {
  const r: PuntoMancha[] = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[i]!;
    const b = p[(i + 1) % p.length]!;
    const da = dentro(a);
    const db = dentro(b);
    if (da >= 0) r.push(a);
    if (da >= 0 !== db >= 0) {
      const k = da / (da - db);
      r.push({ x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, s: a.s + (b.s - a.s) * k, t: a.t + (b.t - a.t) * k });
    }
  }
  return r;
}

/** Dónde va la textura de un punto del mundo: su lugar en el dibujo 2D. */
export function enDibujo(x: number, y: number, z: number): Punto {
  return { x, y: z - y };
}

// ---------------------------------------------------------------------------
// Personajes
// ---------------------------------------------------------------------------

/** Los pies de un personaje cuyo cuadro de 16×24 tiene la esquina en (x, y) del piso: la fila 22 del cuadro, al centro. */
export function piesDeCuadro(x: number, y: number): Punto {
  return { x: x + 8, y: y + 22 };
}

/** Los pies de quien está sentado en el puesto `i` de la sala, en el piso. */
export function piesSentado(sala: SalaPlano, p: Punto): Punto {
  return piesDeCuadro(sala.x + p.x + PERSONAJE_EN_PUESTO.x, sala.y + p.y + PERSONAJE_EN_PUESTO.y);
}

/** Los pies de quien está fuera de su escritorio (`VistaFuera.pos`, relativo a la sala): su cuadro va en (pos.x − 8, pos.y − 24). */
export function piesFuera(sala: SalaPlano, pos: Punto): Punto {
  return piesDeCuadro(sala.x + pos.x - 8, sala.y + pos.y - 24);
}

export type Lado = "abajo" | "arriba" | "izq" | "der";

/** Hacia dónde mira cada lado, en el suelo (x, z). `abajo` es hacia ti en la 2D. */
const FRENTE: Readonly<Record<Lado, Punto>> = { abajo: { x: 0, y: 1 }, arriba: { x: 0, y: -1 }, izq: { x: -1, y: 0 }, der: { x: 1, y: 0 } };

/**
 * La animación que se ve desde la cámara. Quien camina (o espera en tu fila, de
 * espaldas en la 2D) se ve de frente, de espaldas o de perfil según hacia dónde
 * mira respecto de ti. Quien conversa solo tiene perfiles: el que da hacia su
 * pareja. Lo demás (sentado, en el sofá, con su taza) solo tiene frente.
 * `aCamara`: de sus pies hacia la cámara, en el suelo (x, z).
 */
export function animDesde(anim: string, aCamara: Punto): string {
  const m = /^(caminar|charlar|escuchar)(?:-(abajo|arriba|izq|der))?$/.exec(anim);
  if (!m) return anim;
  const familia = m[1]!;
  const lado = (m[2] ?? "abajo") as Lado;
  const largo = Math.hypot(aCamara.x, aCamara.y);
  if (largo === 0) return anim;
  const c = { x: aCamara.x / largo, y: aCamara.y / largo };
  const f = FRENTE[lado];
  // A la derecha de la cámara, que mira hacia −c.
  const hacia = f.x * c.x + f.y * c.y;
  const derecha = f.x * c.y - f.y * c.x;
  if (familia !== "caminar") {
    if (derecha === 0) return anim;
    return `${familia}-${derecha > 0 ? "der" : "izq"}`;
  }
  if (Math.abs(hacia) >= Math.abs(derecha)) return hacia > 0 ? "caminar" : "caminar-arriba";
  return derecha > 0 ? "caminar-der" : "caminar-izq";
}

// ---------------------------------------------------------------------------
// Moverse y ver
// ---------------------------------------------------------------------------

/** Lo que no se pisa, en el piso: las cajas de cada sala (sin el rótulo, que en 3D no se dibuja) y una franja delante de cada muro. */
export interface Choques {
  cajas: Caja[];
  muros: Muro[];
  ancho: number;
  fondo: number;
}

export function choquesDe(plano: PisoPlano, escena: Escena3d): Choques {
  const cajas: Caja[] = [];
  for (const sala of plano.salas) {
    for (const c of cajasDe({ ...sala, rotulo: null })) cajas.push([sala.x + c[0], sala.y + c[1], sala.x + c[2], sala.y + c[3]]);
  }
  return { cajas, muros: escena.muros, ancho: plano.w, fondo: plano.h };
}

/** Cada escritorio del piso con su silla, en el suelo: `<prefijo>:<n.º de puesto>` o `<prefijo>:tu`, como las pantallas. */
export function puestosDe(plano: PisoPlano): Array<{ clave: string; caja: Caja }> {
  const lista: Array<{ clave: string; caja: Caja }> = [];
  for (const sala of plano.salas) {
    // La huella del escritorio de `caminos.ts`: (x, y + 8) a (x + 28, y + 28).
    const caja = (p: Punto): Caja => [sala.x + p.x, sala.y + p.y + 8, sala.x + p.x + 28, sala.y + p.y + 28];
    sala.puestos.forEach((p, i) => lista.push({ clave: `${sala.prefijo}:${i}`, caja: caja(p) }));
    if (sala.escritorio) lista.push({ clave: `${sala.prefijo}:tu`, caja: caja(sala.escritorio) });
  }
  return lista;
}

/** Se puede estar en (x, z) con un cuerpo de radio `r`: dentro del piso, sin tocar un mueble ni un muro. */
export function sePuede(ch: Choques, x: number, z: number, r: number): boolean {
  if (x < r || z < r || x > ch.ancho - r || z > ch.fondo - r) return false;
  // El muro de encima de una puerta se pasa por debajo.
  for (const m of ch.muros) if (m.desde === 0 && x > m.x0 - r && x < m.x1 + r && z > m.z0 - r && z < m.z1 + r) return false;
  for (const c of ch.cajas) if (x > c[0] - r && x < c[2] + r && z > c[1] - r && z < c[3] + r) return false;
  return true;
}

/** Un punto del mundo (x, altura, z). */
export interface Punto3d {
  x: number;
  y: number;
  z: number;
}

/** Algún muro se cruza entre `desde` y `hasta` (para no mostrar el globo de quien está detrás). */
export function tapado(muros: readonly Muro[], desde: Punto3d, hasta: Punto3d): boolean {
  for (const m of muros) {
    // A lo ancho, se mira dónde la línea cruza su z; a lo hondo, su x.
    const ancho = m.z0 === m.z1;
    const a = ancho ? desde.z - m.z0 : desde.x - m.x0;
    const b = ancho ? hasta.z - m.z0 : hasta.x - m.x0;
    if (a === 0 || b === 0 || a > 0 === b > 0) continue;
    const t = a / (a - b);
    const u = ancho ? desde.x + t * (hasta.x - desde.x) : desde.z + t * (hasta.z - desde.z);
    const y = desde.y + t * (hasta.y - desde.y);
    const [u0, u1] = ancho ? [m.x0, m.x1] : [m.z0, m.z1];
    if (u >= u0 && u <= u1 && y >= m.desde && y <= m.alto) return true;
  }
  return false;
}

/** Dónde te sientas en la sala: en tu escritorio, donde va la cabeza de quien se sienta ahí; si no tiene, en el medio, delante del muro. */
export function inicioEn(sala: SalaPlano): { x: number; z: number } {
  if (sala.escritorio) {
    const p = piesSentado(sala, sala.escritorio);
    return { x: p.x, z: p.y - 3 };
  }
  return { x: sala.x + sala.w / 2, z: sala.y + MURO + 10 };
}
