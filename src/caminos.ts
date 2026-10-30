// Por dónde se camina en la 0.3.0 (design-spec de JST-96 §4 a §7), sin React
// ni DOM: la rejilla de cada sala, el camino entre el escritorio y la sala de
// descanso, los puntos de una conversación, el recorrido del sobre y los
// pasillos de las mascotas. Todo en pixeles de arte y relativo a la sala.
//
// La rejilla y los choques son los de la prueba técnica (`spike/caminar.ts`,
// JST-94): celdas de 2×2; chocan el muro, el escritorio de cada puesto, la base
// de cada mueble del suelo y el sofá entero; no chocan la alfombra ni lo
// colgado. Lo que choca son los pies, inflados ±4 a lo ancho y ±2 a lo alto.
// Lo único distinto: el A* va con 4 vecinos y suma 3 por cada vez que dobla,
// así los caminos salen en L, que es lo que dibujan los sprites.
import MUEBLES from "./ui/assets/muebles.json" with { type: "json" };
import { cajaHilo, tapaA, type TamanoHilo } from "./hilo.js";
import { BORDE, MUEBLES_SOLIDOS, MURO, PASILLO, type Asiento, type PisoPlano, type SalaPlano } from "./plano.js";

const PIEZAS: Readonly<Record<string, { w: number; h: number }>> = MUEBLES.piezas;

export const CELDA = 2;
/** Mitad del ancho y del alto de los pies. */
const PIE_X = 4;
const PIE_Y = 2;
/** Los pies no suben más que la fila de arriba de escritorios: la cabeza tapa un poco el muro, como en el sofá. */
const PIE_MIN_Y = MURO + 14;
/** Lo que se suma al costo cada vez que el camino dobla. */
const CASTIGO_DOBLAR = 3;


export interface Punto {
  x: number;
  y: number;
}

export type Direccion = "der" | "izq" | "arriba" | "abajo";

/** Caja en pixeles de arte, [x0, y0, x1, y1). */
export type Caja = readonly [number, number, number, number];

export interface Rejilla {
  ancho: number;
  alto: number;
  /** 1 = no se pisa. */
  ocupada: Uint8Array;
  /** Muebles sólidos enteros (no solo su base): un personaje de pie no puede quedar con uno encima del cuerpo (§6). */
  cuerpos: Caja[];
}

// ---------------------------------------------------------------------------
// Puntos de un puesto y de un asiento
// ---------------------------------------------------------------------------

/** Pies del personaje sentado en el puesto (x, y): (x + 18, y + 24) (§4). */
export function piesPuesto(p: Punto): Punto {
  return { x: p.x + 18, y: p.y + 24 };
}

/** El paso atrás al levantarse, al pasillo de detrás del escritorio: (x + 18, y + 4). */
export function salidaPuesto(p: Punto): Punto {
  return { x: p.x + 18, y: p.y + 4 };
}

/** De pie junto a su escritorio, cuando no queda asiento en el descanso (como hoy: el sprite en (x + 10, y − 2)). */
export function piesJunto(p: Punto): Punto {
  return { x: p.x + 18, y: p.y + 22 };
}

/** Pies en un asiento del descanso (el sprite de 16×24 en (x, y)). */
export function piesAsiento(a: Asiento): Punto {
  return { x: a.x + 8, y: a.y + 24 };
}

/** Esquina del sprite de 16×24 con los pies en `p`. */
export function spriteConPies(p: Punto): Punto {
  return { x: p.x - 8, y: p.y - 24 };
}

/** Cubierta del escritorio del puesto (x, y), donde aterriza el sobre: (x + 15, y + 15) (§5). */
export function cubierta(p: Punto): Punto {
  return { x: p.x + 15, y: p.y + 15 };
}

// ---------------------------------------------------------------------------
// Rejilla
// ---------------------------------------------------------------------------

/** Huella de un mueble en el suelo: su parte de abajo (la base), hasta 10 px de fondo. El sofá, entero. */
function huella(nombre: string, x: number, y: number): Caja {
  const m = PIEZAS[nombre]!;
  if (nombre.startsWith("sofa")) return [x, y, x + m.w, y + m.h];
  const fondo = Math.min(m.h, 10);
  return [x, y + m.h - fondo, x + m.w, y + m.h];
}

/** Escritorio y silla del puesto `p`: el escritorio va en (p.x, p.y + 8), 28×20. */
function huellaEscritorio(p: Punto): Caja {
  return [p.x, p.y + 8, p.x + 28, p.y + 28];
}

/** Lo que no se pisa en una sala (relativo a ella): los escritorios, el tuyo, la base de los muebles sólidos y el rótulo. */
export function cajasDe(sala: SalaPlano): Caja[] {
  const solidos = sala.muebles.filter((m) => MUEBLES_SOLIDOS.has(m.nombre) && PIEZAS[m.nombre]);
  const cajas: Caja[] = [...sala.puestos.map(huellaEscritorio), ...solidos.map((m) => huella(m.nombre, m.x, m.y))];
  // Tu escritorio (0.5.0) choca como el de un agente; tu fila, delante, se pisa.
  if (sala.escritorio) cajas.push(huellaEscritorio(sala.escritorio));
  // El rótulo de la sala es un mueble más (JST-138 §3.1): su caja, con 1 de aire, no se pisa.
  const r = sala.rotulo;
  if (r) cajas.push([r.x - 1, r.y - 1, r.x + r.w + 1, r.y + r.h + 2]);
  return cajas;
}

export function rejillaDe(sala: SalaPlano): Rejilla {
  const ancho = Math.ceil(sala.w / CELDA);
  const alto = Math.ceil(sala.h / CELDA);
  const ocupada = new Uint8Array(ancho * alto);
  const solidos = sala.muebles.filter((m) => MUEBLES_SOLIDOS.has(m.nombre) && PIEZAS[m.nombre]);
  const cajas = cajasDe(sala);
  for (let cy = 0; cy < alto; cy++) {
    for (let cx = 0; cx < ancho; cx++) {
      const x = cx * CELDA + CELDA / 2;
      const y = cy * CELDA + CELDA / 2;
      const fuera = x - PIE_X < 2 || x + PIE_X > sala.w - 2 || y < PIE_MIN_Y || y + PIE_Y > sala.h - 1;
      const choca = !fuera && cajas.some((c) => x + PIE_X > c[0] && x - PIE_X < c[2] && y + PIE_Y > c[1] && y - PIE_Y < c[3]);
      ocupada[cy * ancho + cx] = fuera || choca ? 1 : 0;
    }
  }
  const cuerpos: Caja[] = solidos.map((m) => {
    const t = PIEZAS[m.nombre]!;
    return [m.x, m.y, m.x + t.w, m.y + t.h];
  });
  return { ancho, alto, ocupada, cuerpos };
}

const celdaDe = (p: Punto) => ({ cx: Math.floor(p.x / CELDA), cy: Math.floor(p.y / CELDA) });
const centro = (cx: number, cy: number): Punto => ({ x: cx * CELDA + CELDA / 2, y: cy * CELDA + CELDA / 2 });

export function libre(r: Rejilla, p: Punto): boolean {
  const { cx, cy } = celdaDe(p);
  return cx >= 0 && cy >= 0 && cx < r.ancho && cy < r.alto && r.ocupada[cy * r.ancho + cx] === 0;
}

/** Hay paso en línea recta de `a` a `b` (se revisa cada pixel). */
export function hayPaso(r: Rejilla, a: Punto, b: Punto): boolean {
  const d = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  const pasos = Math.max(1, Math.ceil(d));
  for (let i = 0; i <= pasos; i++) {
    const t = i / pasos;
    if (!libre(r, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) return false;
  }
  return true;
}

/** Celda libre más cercana a `p` (para un punto que cae sobre un mueble, como el sofá). */
export function libreCercano(r: Rejilla, p: Punto): Punto | null {
  if (libre(r, p)) return p;
  const { cx, cy } = celdaDe(p);
  for (let radio = 1; radio < 20; radio++) {
    let mejor: Punto | null = null;
    let dm = Infinity;
    for (let dy = -radio; dy <= radio; dy++) {
      for (let dx = -radio; dx <= radio; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radio) continue;
        const c = centro(cx + dx, cy + dy);
        if (!libre(r, c)) continue;
        const d = Math.hypot(c.x - p.x, c.y - p.y);
        if (d < dm) {
          dm = d;
          mejor = c;
        }
      }
    }
    if (mejor) return mejor;
  }
  return null;
}

// ---------------------------------------------------------------------------
// A* de 4 vecinos con castigo por doblar
// ---------------------------------------------------------------------------

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Montículo binario de pares (prioridad, estado) en arreglos planos. */
class Monton {
  private f: number[] = [];
  private k: number[] = [];
  get vacio(): boolean {
    return this.f.length === 0;
  }
  empujar(f: number, k: number): void {
    const F = this.f;
    const K = this.k;
    F.push(f);
    K.push(k);
    let i = F.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (F[p]! <= F[i]!) break;
      [F[p], F[i]] = [F[i]!, F[p]!];
      [K[p], K[i]] = [K[i]!, K[p]!];
      i = p;
    }
  }
  sacar(): number {
    const F = this.f;
    const K = this.k;
    const tope = K[0]!;
    const uf = F.pop()!;
    const uk = K.pop()!;
    if (F.length > 0) {
      F[0] = uf;
      K[0] = uk;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const d = l + 1;
        let m = i;
        if (l < F.length && F[l]! < F[m]!) m = l;
        if (d < F.length && F[d]! < F[m]!) m = d;
        if (m === i) break;
        [F[m], F[i]] = [F[i]!, F[m]!];
        [K[m], K[i]] = [K[i]!, K[m]!];
        i = m;
      }
    }
    return tope;
  }
}

/**
 * Camino entre dos puntos libres, de celda en celda (4 vecinos), con 3 de
 * castigo por cada vez que dobla. Devuelve solo las esquinas (los centros de
 * celda donde dobla, más el primero y el último), o `null` si no hay camino.
 */
export function aEstrella(r: Rejilla, desde: Punto, hasta: Punto): Punto[] | null {
  const a = celdaDe(desde);
  const b = celdaDe(hasta);
  const n = r.ancho * r.alto;
  const inicio = a.cy * r.ancho + a.cx;
  const meta = b.cy * r.ancho + b.cx;
  if (!libre(r, desde) || !libre(r, hasta)) return null;
  if (inicio === meta) return [centro(a.cx, a.cy)];
  // Un estado por celda y dirección de llegada: k = celda * 4 + dirección.
  const g = new Float32Array(n * 4).fill(Infinity);
  const previo = new Int32Array(n * 4).fill(-1);
  const cerrado = new Uint8Array(n * 4);
  const h = (c: number) => Math.abs((c % r.ancho) - b.cx) + Math.abs(Math.floor(c / r.ancho) - b.cy);
  const monton = new Monton();
  for (let d = 0; d < 4; d++) {
    g[inicio * 4 + d] = 0;
    monton.empujar(h(inicio), inicio * 4 + d);
  }
  let fin = -1;
  while (!monton.vacio) {
    const k = monton.sacar();
    if (cerrado[k]) continue;
    cerrado[k] = 1;
    const c = k >> 2;
    const d = k & 3;
    if (c === meta) {
      fin = k;
      break;
    }
    const x = c % r.ancho;
    const y = (c - x) / r.ancho;
    for (let nd = 0; nd < 4; nd++) {
      const nx = x + DIRS[nd]![0];
      const ny = y + DIRS[nd]![1];
      if (nx < 0 || ny < 0 || nx >= r.ancho || ny >= r.alto) continue;
      const nc = ny * r.ancho + nx;
      if (r.ocupada[nc]) continue;
      const nk = nc * 4 + nd;
      if (cerrado[nk]) continue;
      const costo = g[k]! + 1 + (nd !== d && c !== inicio ? CASTIGO_DOBLAR : 0);
      if (costo < g[nk]!) {
        g[nk] = costo;
        previo[nk] = k;
        monton.empujar(costo + h(nc), nk);
      }
    }
  }
  if (fin < 0) return null;
  const celdas: number[] = [];
  for (let k = fin; k !== -1; k = previo[k]!) celdas.push(k >> 2);
  celdas.reverse();
  const puntos = celdas.map((c) => centro(c % r.ancho, Math.floor(c / r.ancho)));
  return esquinas(puntos);
}

/** Deja el primero, el último y los puntos donde cambia la dirección. */
function esquinas(puntos: readonly Punto[]): Punto[] {
  if (puntos.length <= 2) return [...puntos];
  const fuera: Punto[] = [puntos[0]!];
  for (let i = 1; i < puntos.length - 1; i++) {
    const a = fuera.at(-1)!;
    const b = puntos[i]!;
    const c = puntos[i + 1]!;
    if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) continue;
    fuera.push(b);
  }
  fuera.push(puntos.at(-1)!);
  return fuera;
}

/**
 * Corre el primer tramo del camino de celdas hasta la recta de `ancla` (un
 * punto exacto, como la salida del puesto), si se puede sin chocar: así no
 * queda un escalón de 1 px entre el punto exacto y el centro de la celda.
 */
function alinear(r: Rejilla, pts: Punto[], ancla: Punto): void {
  if (pts.length < 2) return;
  const p0 = pts[0]!;
  const p1 = pts[1]!;
  if (p0.x === p1.x && p0.x !== ancla.x) {
    const q0 = { x: ancla.x, y: p0.y };
    const q1 = { x: ancla.x, y: p1.y };
    const p2 = pts[2];
    if (hayPaso(r, q0, q1) && (!p2 || hayPaso(r, q1, { x: p2.x, y: q1.y }))) {
      pts[0] = q0;
      pts[1] = q1;
    }
  } else if (p0.y === p1.y && p0.y !== ancla.y) {
    const q0 = { x: p0.x, y: ancla.y };
    const q1 = { x: p1.x, y: ancla.y };
    const p2 = pts[2];
    if (hayPaso(r, q0, q1) && (!p2 || hayPaso(r, q1, { x: q1.x, y: p2.y }))) {
      pts[0] = q0;
      pts[1] = q1;
    }
  }
}

/** Tramos solo horizontales o verticales (dobla primero en x), sin puntos repetidos ni intermedios en línea. */
export function enL(puntos: readonly Punto[]): Punto[] {
  if (puntos.length === 0) return [];
  const con: Punto[] = [puntos[0]!];
  for (let i = 1; i < puntos.length; i++) {
    const p = con.at(-1)!;
    const q = puntos[i]!;
    if (p.x !== q.x && p.y !== q.y) con.push({ x: q.x, y: p.y });
    con.push(q);
  }
  const sinRepetir = con.filter((p, i) => i === 0 || p.x !== con[i - 1]!.x || p.y !== con[i - 1]!.y);
  return esquinas(sinRepetir);
}

/**
 * Camino de `desde` a `hasta`. `pre` y `post` son tramos fijos que no pasan
 * por la búsqueda (levantarse del escritorio, sentarse en el sofá desde el
 * frente); la búsqueda va del último de `pre` al primero de `post`.
 */
export function ruta(r: Rejilla, desde: Punto, hasta: Punto, o: { pre?: readonly Punto[]; post?: readonly Punto[] } = {}): Punto[] | null {
  const pre = o.pre ?? [];
  const post = o.post ?? [];
  const a = pre.at(-1) ?? desde;
  const b = post[0] ?? hasta;
  const a2 = libreCercano(r, a);
  const b2 = libreCercano(r, b);
  if (!a2 || !b2) return null;
  const medio = aEstrella(r, a2, b2);
  if (!medio) return null;
  if (medio.length >= 2) {
    alinear(r, medio, a2);
    const vuelta = [...medio].reverse();
    alinear(r, vuelta, b2);
    medio.splice(0, medio.length, ...vuelta.reverse());
  }
  return enL([desde, ...pre, a2, ...medio, b2, ...post, hasta]);
}

export function largo(camino: readonly Punto[]): number {
  let total = 0;
  for (let i = 1; i < camino.length; i++) total += Math.abs(camino[i]!.x - camino[i - 1]!.x) + Math.abs(camino[i]!.y - camino[i - 1]!.y);
  return total;
}

export interface Recorrido {
  puntos: Punto[];
  /** Dirección de cada tramo; los tramos de menos de 3 px toman la del siguiente (no gira por un escalón). */
  dirs: Direccion[];
  largos: number[];
  largo: number;
}

const dirDe = (p: Punto, q: Punto): Direccion => (q.x > p.x ? "der" : q.x < p.x ? "izq" : q.y < p.y ? "arriba" : "abajo");

export function recorrido(puntos: readonly Punto[]): Recorrido {
  const largos: number[] = [];
  const dirs: Direccion[] = [];
  for (let i = 1; i < puntos.length; i++) {
    largos.push(Math.abs(puntos[i]!.x - puntos[i - 1]!.x) + Math.abs(puntos[i]!.y - puntos[i - 1]!.y));
    dirs.push(dirDe(puntos[i - 1]!, puntos[i]!));
  }
  for (let i = dirs.length - 2; i >= 0; i--) if (largos[i]! < 3) dirs[i] = dirs[i + 1]!;
  if (dirs.length >= 2 && largos.at(-1)! < 3) dirs[dirs.length - 1] = dirs[dirs.length - 2]!;
  return { puntos: [...puntos], dirs, largos, largo: largos.reduce((a, b) => a + b, 0) };
}

/** Dónde va quien lleva `d` px recorridos, y hacia dónde mira. */
export function enRecorrido(r: Recorrido, d: number): { pos: Punto; dir: Direccion } {
  let resto = Math.max(0, d);
  for (let i = 0; i < r.largos.length; i++) {
    const l = r.largos[i]!;
    if (resto <= l || i === r.largos.length - 1) {
      const p = r.puntos[i]!;
      const q = r.puntos[i + 1]!;
      const f = l > 0 ? Math.min(1, resto / l) : 1;
      return { pos: { x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f }, dir: r.dirs[i]! };
    }
    resto -= l;
  }
  return { pos: { ...(r.puntos.at(-1) ?? { x: 0, y: 0 }) }, dir: "abajo" };
}

// ---------------------------------------------------------------------------
// Conversaciones (§6)
// ---------------------------------------------------------------------------

/**
 * El punto de la conversación (0.4.0, JST-162 §2.3): al medio del descanso y
 * más abajo que antes (que era delante de la cafetera), para que quepan encima
 * los 2 globos del hilo.
 */
export function objetivoCharla(sala: SalaPlano): Punto {
  const d = sala.descanso;
  return { x: d.x + d.w * 0.45, y: d.y + d.h * 0.72 };
}

/** Los pies de quienes conversan van a 44 px de arte del techo del descanso, o más abajo. */
export const CHARLA_DESDE_TECHO = 44;

/** La cabeza de quien está de pie va 25 px de arte sobre sus pies (como `cabeza` en vida.ts). */
const CABEZA_DE_PIE = 25;

/**
 * Dos puntos libres de la sala de descanso a 16 px uno del otro y a la misma
 * altura, lo más cerca posible del objetivo, sin un mueble encima del cuerpo
 * (±6 en x, 20 hacia arriba) y a más de 12×10 de `otros` (los pies de los
 * demás agentes). Con `hilo` (lo que va a medir, JST-172): solo donde ese hilo
 * no le tapa la cabeza a ninguno de `otros` ni sale de la sala por arriba.
 * `null` si no hay.
 */
export function puntosDeCharla(sala: SalaPlano, r: Rejilla, otros: readonly Punto[], hilo: TamanoHilo | null = null): [Punto, Punto] | null {
  const obj = objetivoCharla(sala);
  const d = sala.descanso;
  const cuerpoLibre = (p: Punto) => !r.cuerpos.some((c) => p.x - 6 < c[2] && p.x + 6 > c[0] && p.y - 20 < c[3] && p.y > c[1]);
  const ocupado = (p: Punto) => otros.some((o) => Math.abs(o.x - p.x) < 12 && Math.abs(o.y - p.y) < 10);
  let mejor: [Punto, Punto] | null = null;
  let dm = Infinity;
  for (let y = d.y + CHARLA_DESDE_TECHO; y <= d.y + d.h - 2; y += 2) {
    for (let x = d.x + 8; x + 16 <= d.x + d.w - 6; x += 2) {
      const p = { x, y };
      const q = { x: x + 16, y };
      if (!libre(r, p) || !libre(r, q) || !libre(r, { x: x + 8, y })) continue;
      if (!cuerpoLibre(p) || !cuerpoLibre(q) || ocupado(p) || ocupado(q)) continue;
      if (hilo) {
        const caja = cajaHilo(d, { x: x + 8, y: y - CABEZA_DE_PIE }, hilo);
        if (caja[1] < 0 || tapaA(caja, otros)) continue;
      }
      const dist = Math.hypot(x + 8 - obj.x, (y - obj.y) * 1.2);
      if (dist < dm) {
        dm = dist;
        mejor = [p, q];
      }
    }
  }
  return mejor;
}

// ---------------------------------------------------------------------------
// Sobre (§5)
// ---------------------------------------------------------------------------

/** Franja del muro por donde va el sobre. */
export const Y_MURO_SOBRE = 14;

/**
 * Recorrido del sobre de la propuesta C, del puesto (x, y) de quien entrega al
 * (x′, y′) de quien recibe: sube por el pasillo de la derecha del escritorio,
 * recorre el muro y baja por el pasillo de quien recibe.
 */
export function rutaSobre(de: Punto, a: Punto): Punto[] {
  const p = cubierta(de);
  const q = cubierta(a);
  const puntos = [p, { x: de.x + 38, y: p.y }, { x: de.x + 38, y: Y_MURO_SOBRE }, { x: a.x + 38, y: Y_MURO_SOBRE }, { x: a.x + 38, y: q.y }, q];
  return puntos.filter((pt, i) => i === 0 || pt.x !== puntos[i - 1]!.x || pt.y !== puntos[i - 1]!.y);
}

/** 400 ms + 4 ms por pixel de arte, entre 1000 y 1800 ms. */
export function duracionSobre(largoPx: number): number {
  return Math.max(1000, Math.min(1800, 400 + 4 * largoPx));
}

export function easeInOutQuad(t: number): number {
  const f = Math.max(0, Math.min(1, t));
  return f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
}

// ---------------------------------------------------------------------------
// Pasillos y camas de las mascotas (§7)
// ---------------------------------------------------------------------------

export interface Pasillo {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Los pasillos horizontales entre las filas de salas, de borde a borde. Con una sola fila (o una sala acercada), ninguno. */
export function pasillosDe(plano: PisoPlano): Pasillo[] {
  const filas = new Map<number, number>();
  for (const s of plano.salas) filas.set(s.y, Math.max(filas.get(s.y) ?? 0, s.h));
  const ys = [...filas.keys()].sort((a, b) => a - b);
  const pasillos: Pasillo[] = [];
  for (let i = 0; i < ys.length - 1; i++) pasillos.push({ x: BORDE, y: ys[i]! + filas.get(ys[i]!)!, w: plano.w - BORDE * 2, h: PASILLO });
  return pasillos;
}

/** Pie de la cama de la mascota `i` (0 a 3) en su pasillo. */
export function camaDe(p: Pasillo, i: number, total = 4): Punto {
  return { x: Math.round(p.x + 14 + ((p.w - 28) * (i + 0.5)) / Math.max(1, total)), y: p.y + 14 };
}
