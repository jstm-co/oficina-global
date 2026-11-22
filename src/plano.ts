// Plano del piso de la propuesta A («Piso abierto», design-spec de JST-65 §2,
// §6 y §7), sin React ni DOM: dónde va cada sala, cada escritorio, cada mueble
// y cada asiento de la sala de descanso. Todo en pixeles de arte; la UI los
// multiplica por la escala entera (1x, 2x o 3x).
import MUEBLES from "./ui/assets/muebles.json" with { type: "json" };

export const MURO = 22;
export const PASILLO = 16;
export const BORDE = 8;

/** Medidas de las piezas del atlas de muebles. */
const PIEZAS: Readonly<Record<string, { w: number; h: number }>> = MUEBLES.piezas;

/** Muebles del suelo que no se pisan. La alfombra, el muro y lo colgado (ventana, cuadro, reloj, pizarra) no chocan. */
export const MUEBLES_SOLIDOS: ReadonlySet<string> = new Set(["cafetera", "planta", "planta-grande", "arcade", "pingpong", "estante", "puff", "dispensador", "mesita", "sofa", "sofa-calido"]);

export type Escena = "computador" | "tv" | "celular" | "acercada" | "widget" | "widget-celular";

interface Plan {
  /** Paso horizontal y vertical entre escritorios. */
  px: number;
  py: number;
  /** Paso vertical con el que se calcula el alto de cada fila (el widget usa el de la página). */
  pyFila: number;
  /** Columnas de escritorios por prefijo (§2). */
  columnas: Readonly<Record<string, number>>;
}

const COLUMNAS: Readonly<Record<string, number>> = { BET: 3, ELM: 2, JST: 3, MIG: 4 };
const COLUMNAS_CELULAR: Readonly<Record<string, number>> = { ...COLUMNAS, MIG: 3 };

const PLANES: Readonly<Record<Exclude<Escena, "acercada">, Plan>> = {
  computador: { px: 46, py: 44, pyFila: 44, columnas: COLUMNAS },
  tv: { px: 46, py: 38, pyFila: 38, columnas: COLUMNAS },
  celular: { px: 34, py: 40, pyFila: 40, columnas: COLUMNAS_CELULAR },
  widget: { px: 34, py: 38, pyFila: 44, columnas: COLUMNAS },
  "widget-celular": { px: 34, py: 38, pyFila: 40, columnas: COLUMNAS_CELULAR },
};

/** Escala entera de cada escena (§2). El computador sube a 3x si cabe (`armarPisoComputador`, JST-86). */
export const ESCALA: Readonly<Record<Escena, 1 | 2 | 3>> = {
  computador: 2,
  tv: 3,
  celular: 1,
  acercada: 2,
  widget: 1,
  "widget-celular": 1,
};

/** Columnas de una empresa que no está en la tabla del diseño. */
export function columnasDe(prefijo: string, escena: Escena, agentes: number): number {
  const tabla = escena === "celular" || escena === "widget-celular" || escena === "acercada" ? COLUMNAS_CELULAR : COLUMNAS;
  return tabla[prefijo] ?? Math.min(4, Math.max(2, Math.ceil(agentes / 2)));
}

/** Empresas con baldosas, silla y cuadro propios. Las demás usan las de JSTM en gris (§8, `of-co-none`). */
export const CON_COLOR: readonly string[] = ["BET", "ELM", "JST", "MIG"];

/** Prefijo de los sprites de la empresa (`silla-<pre>`, `cuadro-<pre>`): el suyo o el de JSTM. */
export function spriteDe(prefijo: string): string {
  return CON_COLOR.includes(prefijo) ? prefijo.toLowerCase() : "jst";
}

// ---------------------------------------------------------------------------
// Ancho del piso según la pantalla (§2)
// ---------------------------------------------------------------------------

/** Computador: el contenedor es el ancho de la página sin el menú lateral. */
export function anchoComputador(contenedor: number): number {
  return Math.max(520, Math.min(Math.floor((contenedor - 48) / 2), 640));
}

export function anchoCelular(ventana: number): number {
  return Math.min(ventana - 24, 366);
}

export function anchoWidgetCelular(ventana: number): number {
  return Math.min(ventana - 50, 340);
}

export const ANCHO_WIDGET = 560;
export const ANCHO_TV = 624;

// ---------------------------------------------------------------------------
// Piezas
// ---------------------------------------------------------------------------

export interface Pieza {
  nombre: string;
  x: number;
  y: number;
  z: number;
}

export interface Asiento {
  x: number;
  y: number;
  /** En el sofá (animación `sofa`) o de pie con su taza (`libre`). */
  sofa: boolean;
}

export interface Caja {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SalaPlano {
  prefijo: string;
  /** Posición y tamaño de la sala en el piso. */
  x: number;
  y: number;
  w: number;
  h: number;
  cols: number;
  /** Ancho de la zona de escritorios. */
  anchoEscritorios: number;
  /** Esquina del personaje en cada puesto, en el orden de los agentes (relativa a la sala). */
  puestos: Array<{ x: number; y: number }>;
  /** Muebles quietos, relativos a la sala. Las ventanas se nombran `ventana` y la UI elige día o noche. */
  muebles: Pieza[];
  /** Asientos de la sala de descanso, primero los del sofá y después los más cercanos a él. */
  asientos: Asiento[];
  descanso: Caja;
  sofaCalido: boolean;
  /**
   * El rótulo de la sala (JST-138 §3.1): 10 de alto en la franja de alfombra
   * bajo la última fila de escritorios, desde x = 5 hasta el primer mueble del
   * descanso que toque la franja. Es un mueble más: nadie camina por encima.
   * `null` a 1x (ahí va un solo rótulo bajo el piso).
   */
  rotulo: Caja | null;
  /**
   * Tu escritorio (0.5.0, JST-163 §14): la esquina del puesto, como en
   * `puestos`, arriba a la izquierda del descanso, contra el muro. `null` donde
   * no va: el celular (piso y sala acercada) y un descanso de menos de 70.
   */
  escritorio: { x: number; y: number } | null;
  /** Los pies de cada lugar de la fila de tu escritorio, hacia abajo (hasta 3; ninguno sin escritorio). */
  fila: Array<{ x: number; y: number }>;
  /**
   * La mesa de bloqueadas (JST-428): una mesita contra el muro derecho del descanso, sobre la planta grande o el
   * dispensador, con la pila de carpetas de las tareas bloqueadas. Pieza aparte (no está en `muebles`). `null` donde
   * no va: sin tu escritorio (el celular), con un descanso de menos de 98 o una sala de menos de 96 de alto.
   */
  mesaBloqueos: Caja | null;
  /** La mesita del descanso, donde se juntan para una entrega (0.5.0, JST-163 §10). */
  mesa: Caja;
}

export interface PisoPlano {
  escena: Escena;
  /** Pixeles de pantalla por pixel de arte. Entera, salvo en el computador, que también usa medias (1,5 · 2,5 · 3,5; JST-410). */
  escala: number;
  w: number;
  h: number;
  salas: SalaPlano[];
}

export interface EntradaSala {
  prefijo: string;
  agentes: number;
}

function pieza(nombre: string, x: number, y: number, z: number): Pieza {
  return { nombre, x, y, z };
}

export function medida(nombre: string): { w: number; h: number } {
  const m = PIEZAS[nombre];
  if (!m) throw new Error(`Falta la pieza ${nombre} en muebles.json`);
  return m;
}

/**
 * Sala de descanso (§7): alfombra con sofá y mesita, cafetera contra el muro,
 * plantas y, si hay espacio, ping-pong y arcade. Devuelve los muebles y los
 * asientos: 2 en el sofá y el resto de pie en una rejilla de 17×16 que evita
 * los muebles, ordenada desde lo más cercano al sofá.
 *
 * Con tu escritorio (0.5.0, `izq`): va arriba a la izquierda en vez de la
 * planta, la alfombra y el sofá empiezan al menos `izq` más a la derecha, y en
 * las cajas de `apartado` (el frente de tu escritorio y tu fila) no hay asientos.
 */
export function salaDescanso(
  x: number,
  y: number,
  w: number,
  h: number,
  opciones: {
    cafetera: boolean;
    sofaCalido: boolean;
    izq?: number;
    apartado?: ReadonlyArray<readonly [number, number, number, number]>;
    /** Lo menos que se separan dos lugares de pie, a lo ancho o a lo alto (por omisión 16 × 14: uno por casilla). */
    separacion?: readonly [number, number];
  },
): { muebles: Pieza[]; asientos: Asiento[]; mesa: Caja } {
  const muebles: Pieza[] = [];
  const cajas: Array<readonly [number, number, number, number]> = [];
  const poner = (nombre: string, px: number, py: number, solido = true) => {
    const m = medida(nombre);
    muebles.push(pieza(nombre, px, py, py + m.h));
    if (solido) cajas.push([px, py, px + m.w, py + m.h]);
  };
  const izq = opciones.izq ?? 0;
  if (opciones.cafetera && w >= 60) poner("cafetera", x + w - 22, y - 6);
  if (!izq) poner("planta", x + 1, y);
  if (opciones.apartado) cajas.push(...opciones.apartado);
  if (w >= 150) poner("arcade", x + w - 42, y - 8);
  const anchoAlfombra = 60;
  const rx = Math.max(x + Math.max(0, Math.round((w - anchoAlfombra) / 2) - (w >= 90 ? 6 : 0)), x + izq);
  const ry = y + 22;
  if (w >= 66) muebles.push(pieza("alfombra-sala", rx, ry, 1));
  const sx = rx + Math.round((anchoAlfombra - 34) / 2);
  const sy = ry - 2;
  muebles.push(pieza(opciones.sofaCalido ? "sofa-calido" : "sofa", sx, sy, sy + 2));
  cajas.push([sx, sy, sx + 34, sy + 15]);
  poner("mesita", sx + 8, sy + 19);
  if (w >= 110 && h >= 104) poner("pingpong", x + Math.round((w - 40) / 2) + 10, y + h - 26);

  const candidatos: Asiento[] = [];
  for (let cy = y + 4; cy + 24 <= y + h; cy += 16) {
    for (let cx = x + 2; cx + 16 <= x + w; cx += 17) {
      const pie = [cx + 3, cy + 17, cx + 13, cy + 24] as const;
      if (cajas.some((c) => pie[0] < c[2] + 1 && pie[2] > c[0] - 1 && pie[1] < c[3] + 1 && pie[3] > c[1] - 1)) continue;
      if (cy + 24 > sy - 2 && cy < sy + 14 && cx + 16 > sx && cx < sx + 34) continue;
      candidatos.push({ x: cx, y: cy, sofa: false });
    }
  }
  const ccx = sx + 17;
  const ccy = sy + 20;
  const distancia = (a: Asiento) => Math.hypot(a.x + 8 - ccx, (a.y + 20 - ccy) * 1.3);
  candidatos.sort((a, b) => distancia(a) - distancia(b));
  const asientos: Asiento[] = [
    { x: sx + 2, y: sy - 9, sofa: true },
    { x: sx + 16, y: sy - 9, sofa: true },
  ];
  const [sepX, sepY] = opciones.separacion ?? [16, 14];
  const tomados: Asiento[] = [];
  for (const c of candidatos) {
    if (tomados.some((t) => Math.abs(t.x - c.x) < sepX && Math.abs(t.y - c.y) < sepY)) continue;
    tomados.push(c);
    asientos.push(c);
  }
  const mesita = medida("mesita");
  return { muebles, asientos, mesa: { x: sx + 8, y: sy + 19, w: mesita.w, h: mesita.h } };
}

/**
 * El descanso tiene que medir al menos esto para que quepan tu escritorio (30)
 * y, a su derecha, la alfombra con el sofá (60). La spec de JST-163 §14 dice 70,
 * pero entre 70 y 89 la alfombra y el sofá, corridos 30, se salen de la sala
 * (en el prototipo, el sofá de JSTM queda cortado a 1440 × 900): ahí no va.
 */
export const DESCANSO_ESCRITORIO = 90;
/**
 * Separaciones de los lugares de pie cuando el descanso va holgado (JST-410),
 * de la más amplia a la de siempre: una casilla libre entre dos a lo ancho y a
 * lo alto; solo a lo alto (nadie le tapa la cabeza al de atrás); solo a lo ancho.
 */
const SEPARACIONES: ReadonlyArray<readonly [number, number]> = [
  [34, 32],
  [17, 32],
  [34, 16],
  [16, 14],
];

/** La mesa de bloqueadas (JST-428) pide un descanso de al menos 98 de ancho y una sala de al menos 96 de alto. */
const MESA_BLOQUEOS_DESCANSO = 98;
const MESA_BLOQUEOS_ALTO = 96;

/** Tu fila: el primero a 8 de arte del frente de tu escritorio (sus pies, 62 bajo su esquina) y cada uno 13 más atrás. */
const FILA_PRIMERO = 62;
const FILA_PASO = 13;

/**
 * Una sala (§2): muro con ventanas, escritorios sobre la alfombra de la empresa
 * y sala de descanso a la derecha. `conRotulo`: lleva el rótulo de la sala
 * (JST-138 §3.1; a 2x y 3x, no a 1x).
 */
export function armarSala(
  prefijo: string,
  agentes: number,
  x: number,
  y: number,
  w: number,
  h: number,
  cols: number,
  px: number,
  py: number,
  conRotulo = false,
  conEscritorio = false,
  /** JST-410: los libres se reparten por el descanso en vez de juntarse en torno al sofá. */
  holgado = false,
): SalaPlano {
  const pre = spriteDe(prefijo);
  const anchoEscritorios = 8 + cols * px;
  const muebles: Pieza[] = [];
  for (let wx = 70; wx + 24 < anchoEscritorios - 4; wx += 56) muebles.push(pieza("ventana", wx, 1, 2));
  if (w - anchoEscritorios > 120) muebles.push(pieza("pizarra", anchoEscritorios + 10, 2, 2));
  muebles.push(pieza(`cuadro-${pre}`, w - 46, 3, 2), pieza("reloj", w - 30, 4, 2));

  const puestos: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < agentes; i++) {
    puestos.push({ x: 8 + (i % cols) * px + Math.round((px - 34) / 2), y: MURO + 14 + Math.floor(i / cols) * py });
  }

  const lx = anchoEscritorios + 6;
  const lw = w - lx - 6;
  const sofaCalido = prefijo === "ELM" || prefijo === "MIG";
  // Tu escritorio (0.5.0, JST-163 §14): arriba a la izquierda del descanso, y tu fila hacia abajo.
  let escritorio: SalaPlano["escritorio"] = null;
  const fila: SalaPlano["fila"] = [];
  let apartado: Array<readonly [number, number, number, number]> | undefined;
  if (conEscritorio && lw >= DESCANSO_ESCRITORIO) {
    const ux = lx + 2;
    const uy = MURO + 4;
    escritorio = { x: ux, y: uy };
    for (let k = 0; k < 3 && uy + FILA_PRIMERO + FILA_PASO * k <= h - 6; k++) fila.push({ x: ux + 16, y: uy + FILA_PRIMERO + FILA_PASO * k });
    apartado = [
      [ux - 1, uy + 13, ux + 29, uy + 29],
      [ux + 6, uy + 30, ux + 26, uy + FILA_PRIMERO + 2 + FILA_PASO * Math.max(0, fila.length - 1)],
    ];
  }
  // La mesa de bloqueadas (JST-428): misma escena que tu escritorio, y solo si el descanso y la sala dan para ella.
  let mesaBloqueos: Caja | null = null;
  if (escritorio && lw >= MESA_BLOQUEOS_DESCANSO && h >= MESA_BLOQUEOS_ALTO) {
    const m = medida("mesita");
    mesaBloqueos = { x: w - 24, y: h - 44, w: m.w, h: m.h };
  }
  // Con 1 de margen y el espacio de los pies delante, ahí no hay lugares de pie. Se quitan al final, sin pasar la
  // caja a `salaDescanso`: así el resto del descanso queda igual que sin mesa (la separación elegida no cambia).
  const sinMesa = (lista: Asiento[]) => {
    const m = mesaBloqueos;
    if (!m) return lista;
    return lista.filter((a) => a.sofa || !(a.x + 13 > m.x - 2 && a.x + 3 < m.x + m.w + 2 && a.y + 24 > m.y - 2 && a.y + 17 < m.y + m.h + 5));
  };
  const armarDescanso = (separacion?: readonly [number, number]) => salaDescanso(lx, MURO + 4, lw, h - MURO - 8, { cafetera: lw > 64, sofaCalido, izq: escritorio ? 30 : 0, apartado, separacion });
  let descanso = armarDescanso();
  muebles.push(...descanso.muebles);
  if (lw > 110) muebles.push(pieza("estante", w - 26, MURO - 8, MURO + 18));
  if (lw > 150) {
    muebles.push(pieza("planta-grande", w - 18, h - 30, h));
    // En una sala baja del computador (2 filas de escritorios, JST-410) tu fila llega hasta donde iría el puff: ahí
    // no va. El TV y el widget quedan como estaban.
    const ultimo = fila.at(-1);
    if (!holgado || !ultimo || ultimo.y <= h - 36) muebles.push(pieza("puff", lx + 4, h - 22, h - 10));
  }
  else if (lw > 90) muebles.push(pieza("dispensador", w - 14, h - 30, h));

  let rotulo: Caja | null = null;
  let finRotulo = 0;
  if (conRotulo) {
    // Hasta el primer mueble del descanso que toque la franja de abajo, con 3 de aire; nunca más angosto que los escritorios.
    let fin = w - 5;
    for (const m of muebles) {
      if (!MUEBLES_SOLIDOS.has(m.nombre)) continue;
      const t = medida(m.nombre);
      if (m.x >= anchoEscritorios - 2 && m.y + t.h > h - 13 && m.y < h) fin = Math.min(fin, m.x - 3);
    }
    fin = Math.max(fin, anchoEscritorios - 4);
    rotulo = { x: 5, y: h - 12, w: fin - 5, h: 10 };
    finRotulo = fin;
  }
  // Los lugares de pie del descanso que caen en la franja del rótulo se quitan (hay de sobra).
  const sinFranja = (lista: Asiento[]) => (rotulo ? lista.filter((a) => a.sofa || !(a.x + 12 > 4 && a.x + 4 < finRotulo && a.y + 24 > h - 15)) : lista);
  let asientos = sinFranja(descanso.asientos);
  if (holgado) {
    // De la separación más amplia a la de siempre: la primera con la que cada agente tiene su lugar y sobra alguno.
    for (const separacion of SEPARACIONES) {
      const d = armarDescanso(separacion);
      const lugares = sinFranja(d.asientos);
      if (lugares.length >= agentes + 2 || separacion === SEPARACIONES[SEPARACIONES.length - 1]) {
        descanso = d;
        asientos = lugares;
        break;
      }
    }
  }
  asientos = sinMesa(asientos);

  return {
    prefijo,
    x,
    y,
    w,
    h,
    cols,
    anchoEscritorios,
    puestos,
    muebles,
    asientos,
    descanso: { x: lx, y: MURO + 4, w: lw, h: h - MURO - 8 },
    sofaCalido,
    rotulo,
    escritorio,
    fila,
    mesaBloqueos,
    mesa: descanso.mesa,
  };
}

/** Las escenas con tu escritorio (JST-163 §14): la página, el TV y el widget del computador. En el celular no va. */
export function llevaEscritorio(escena: Escena): boolean {
  return escena === "computador" || escena === "tv" || escena === "widget";
}

/**
 * Filas de hasta `porFila` salas, en orden alfabético por prefijo (§2 y §14):
 * el menor número de filas, parejas, y si no da exacto las de arriba llevan
 * una sala más. Con 2 por fila: 4 → 2 + 2 y 5 → 2 + 2 + 1 (la última sola y a
 * lo ancho). Con 3: 5 → 3 + 2, 7 → 3 + 2 + 2.
 */
export function filasDeSalas(salas: readonly EntradaSala[], porFila = 2): EntradaSala[][] {
  const ordenadas = [...salas].sort((a, b) => a.prefijo.localeCompare(b.prefijo));
  const nf = Math.max(1, Math.ceil(ordenadas.length / porFila));
  const base = Math.floor(ordenadas.length / nf);
  const extra = ordenadas.length % nf;
  const filas: EntradaSala[][] = [];
  for (let f = 0, i = 0; f < nf && i < ordenadas.length; f++) {
    const m = base + (f < extra ? 1 : 0);
    filas.push(ordenadas.slice(i, i + m));
    i += m;
  }
  return filas;
}

/**
 * Piso completo (§2) de ancho `w`: filas de salas separadas por un pasillo de
 * 16 y un borde de 8. Lo que sobra de cada fila se reparte entre las salas de
 * descanso en proporción a (agentes + 4).
 */
export function armarPiso(salas: readonly EntradaSala[], w: number, escena: Exclude<Escena, "acercada">): PisoPlano {
  return armarPisoCon(salas, w, escena, PLANES[escena], ESCALA[escena], 2);
}

/**
 * Alto que la página guarda bajo la cabecera además del piso (JST-86): un
 * banner de 44 siempre reservado (el más alto, con el botón «Reintentar» de
 * 28), los 10 que lo separan del piso y 16 abajo para el contorno del piso a
 * 3x (6) y algo de aire. Así la escala no cambia cuando aparece un aviso.
 */
export const RESERVA_PAGINA = 44 + 10 + 16;

/**
 * Escalas del computador, de mayor a menor (JST-410). Las medias solo valen
 * donde un pixel de arte cae en pixeles enteros de pantalla (una pantalla de
 * densidad 2: 1,5 son 3 pixeles); en las demás, solo las enteras.
 */
const ESCALAS_COMPUTADOR: readonly number[] = [6, 5, 4, 3.5, 3, 2.5, 2, 1.5];

const ESCALA_MINIMA = 1.5;

/** Cuánto más angosto que la pantalla (en arte) puede quedar el piso para que todos tengan asiento. */
const MARGEN_ASIENTOS = 24;

export function escalasComputador(dpr = 1): number[] {
  return ESCALAS_COMPUTADOR.filter((e) => Number.isInteger(e) || Math.abs(e * dpr - Math.round(e * dpr)) < 0.01);
}

/** Cómo se llama en el CSS la escala del piso (`is-x1`, `is-x2`, `is-x3`): los tamaños de letra van por tramos. */
export function claseEscala(escala: number): 1 | 2 | 3 {
  return escala >= 2.5 ? 3 : escala >= 1.5 ? 2 : 1;
}

/** Lo menos que mide el descanso de una sala para que quepan tu escritorio, el sofá y todos sus agentes de pie. */
function descansoMinimo(agentes: number): number {
  return Math.max(104, 60 + 10 * agentes);
}

/** Todas las formas de cortar la lista en filas sin cambiar el orden (2^(n−1)); con muchas salas, solo las parejas. */
function repartos(salas: readonly EntradaSala[]): EntradaSala[][][] {
  const n = salas.length;
  if (n > 9) return Array.from({ length: n }, (_, i) => filasDeSalas(salas, i + 1));
  const todos: EntradaSala[][][] = [];
  for (let cortes = 0; cortes < 1 << (n - 1); cortes++) {
    const filas: EntradaSala[][] = [[]];
    salas.forEach((s, i) => {
      if (i > 0 && cortes & (1 << (i - 1))) filas.push([]);
      filas[filas.length - 1]!.push(s);
    });
    todos.push(filas);
  }
  return todos;
}

interface Reparto {
  filas: EntradaSala[][];
  /** Filas de escritorios de cada fila de salas. */
  alturas: number[];
  alto: number;
  /** Lo que se aparta de la forma preferida (menos es mejor). */
  nota: number;
  /** El ancho en arte con el que las salas de descanso no quedan vacías. */
  comodo: number;
}

const FILAS_ESCRITORIOS_MAX = 6;

/** Columnas de una sala con `r` filas de escritorios: nunca una sola columna si hay más de un agente. */
function columnasCon(agentes: number, r: number): number {
  return Math.max(Math.min(2, agentes), Math.ceil(agentes / r), 1);
}

/**
 * La mejor forma de repartir las salas en un piso de `w` × `h` de arte
 * (JST-410): en qué filas van (sin cambiar el orden) y cuántas filas de
 * escritorios lleva cada fila de salas. `null` si de ninguna forma cabe a lo
 * ancho; con `h` infinito, la más baja.
 *
 * `sinAsiento` dice en qué filas de una forma hay una sala donde no se sientan
 * todos: a esas se les suman filas de escritorios (la sala queda más alta y su
 * descanso más ancho) mientras quepa, y la forma que ni así sirve se descarta.
 * Sin eso, la forma ganadora podía no servir y se perdía la escala entera: una
 * ventana 2 px más ancha daba un piso más chico.
 */
function mejorReparto(salas: readonly EntradaSala[], w: number, h: number, sinAsiento?: (r: Reparto) => number[]): Reparto | null {
  const plan = PLANES.computador;
  const ordenadas = [...salas].sort((a, b) => a.prefijo.localeCompare(b.prefijo));
  const preferidas = (s: EntradaSala) => Math.min(columnasDe(s.prefijo, "computador", s.agentes), Math.max(1, s.agentes));
  const altoFila = (r: number) => MURO + 14 + r * plan.pyFila + 6;
  const anchoFila = (fila: readonly EntradaSala[], r: number) =>
    BORDE * 2 + PASILLO * (fila.length - 1) + fila.reduce((a, s) => a + 8 + columnasCon(s.agentes, r) * plan.px + descansoMinimo(s.agentes), 0);
  const desvio = (fila: readonly EntradaSala[], r: number) => fila.reduce((a, s) => a + Math.abs(columnasCon(s.agentes, r) - preferidas(s)), 0);
  let mejor: Reparto | null = null;
  for (const filas of repartos(ordenadas)) {
    // De cada fila, las alturas que caben a lo ancho, de la que más se parece a la preferida a la que menos.
    const opciones = filas.map((fila) => {
      const tope = Math.min(FILAS_ESCRITORIOS_MAX, Math.max(1, ...fila.map((s) => s.agentes)));
      const caben: number[] = [];
      for (let r = 1; r <= tope; r++) if (anchoFila(fila, r) <= w) caben.push(r);
      return caben.sort((a, b) => desvio(fila, a) - desvio(fila, b) || a - b);
    });
    if (opciones.some((o) => o.length === 0)) continue;
    // Sin tope de alto se busca la forma más baja: cada fila con las menos filas de escritorios que quepan a lo ancho.
    const alturas = opciones.map((o) => (Number.isFinite(h) ? o[0]! : Math.min(...o)));
    const alto = () => BORDE * 2 + PASILLO * (filas.length - 1) + alturas.reduce((a, r) => a + altoFila(r), 0);
    // Si no cabe a lo alto, se baja de a una la fila a la que menos le cuesta.
    while (alto() > h) {
      let cual = -1;
      let costo = Infinity;
      opciones.forEach((o, f) => {
        const menores = o.filter((r) => r < alturas[f]!);
        if (menores.length === 0) return;
        const r = Math.max(...menores);
        const c = desvio(filas[f]!, r) - desvio(filas[f]!, alturas[f]!);
        if (c < costo) {
          costo = c;
          cual = f;
        }
      });
      if (cual < 0) break;
      alturas[cual] = Math.max(...opciones[cual]!.filter((r) => r < alturas[cual]!));
    }
    if (alto() > h && Number.isFinite(h)) continue;
    const parejo = salas.length / filas.length;
    const armar = (): Reparto => {
      const anchos = filas.map((fila, f) => anchoFila(fila, alturas[f]!));
      // El descanso puede crecer hasta un poco más del doble de lo mínimo; más ancho, queda vacío.
      const comodos = filas.map((fila, f) => anchos[f]! + fila.reduce((a, s) => a + Math.round(descansoMinimo(s.agentes) * 1.2), 0));
      const comodo = Math.max(...comodos);
      // Lo que una fila se estira más allá de eso para alcanzar el ancho del piso (una sala sola en una fila larga)
      // pesa como columnas de escritorios cambiadas.
      const estirado = comodos.reduce((a, c) => a + Math.max(0, Math.min(w, comodo) - c), 0) / plan.px;
      const nota =
        filas.reduce((a, fila, f) => a + desvio(fila, alturas[f]!), 0) +
        filas.reduce((a, fila) => a + Math.abs(fila.length - parejo), 0) * 0.5 +
        (Math.max(...anchos) - Math.min(...anchos)) / 100 +
        estirado +
        (filas.length - 1) * 0.25;
      return { filas, alturas: [...alturas], alto: alto(), nota, comodo };
    };
    const gana = (c: Reparto) =>
      !mejor || (Number.isFinite(h) ? c.nota < mejor.nota : c.alto < mejor.alto || (c.alto === mejor.alto && c.nota < mejor.nota));
    let candidato = armar();
    if (!gana(candidato)) continue;
    if (sinAsiento) {
      let faltan = sinAsiento(candidato);
      while (faltan.length > 0) {
        let subio = false;
        for (const f of faltan) {
          const mayores = opciones[f]!.filter((r) => r > alturas[f]!);
          if (mayores.length === 0) continue;
          const antes = alturas[f]!;
          alturas[f] = Math.min(...mayores);
          if (alto() > h) alturas[f] = antes;
          else subio = true;
        }
        if (!subio) break;
        candidato = armar();
        faltan = sinAsiento(candidato);
      }
      if (faltan.length > 0 || !gana(candidato)) continue;
    }
    mejor = candidato;
  }
  return mejor;
}

/**
 * Piso del computador (JST-410): la escala más grande con la que el piso
 * **entero** cabe en lo que se ve bajo la cabecera, a lo ancho (la página con
 * sus márgenes de 24) y a lo alto (`altoLibre`), de 6x en una pantalla grande a
 * 1,5x en un notebook. Para que quepa, el plano se acomoda a la forma de la
 * pantalla: cuántas salas van por fila y cuántas filas de escritorios lleva
 * cada una (`mejorReparto`), siempre en orden de prefijo. Si ni a la escala
 * más chica cabe a lo alto, queda a esa escala con la forma más baja y la
 * página se baja para verlo.
 *
 * El piso vacío (mientras se leen las empresas) se mide con `previas`, las
 * salas de la última vez, y sin ellas queda a 2x (JST-89). Así la escala del
 * primer cuadro es la misma que cuando llegan las salas.
 */
export function armarPisoComputador(salas: readonly EntradaSala[], contenedor: number, altoLibre: number, previas: readonly EntradaSala[] = [], dpr = 1): PisoPlano {
  const medidas = salas.length > 0 ? salas : previas;
  if (medidas.length === 0) return armarPiso(salas, anchoComputador(contenedor), "computador");
  const escalas = escalasComputador(dpr);
  const anchoArte = (e: number) => Math.floor((contenedor - 48) / e);
  let elegido: { escala: number; reparto: Reparto; ancho: number } | null = null;
  const probar = (escala: number): boolean => {
    const alto = Math.floor((altoLibre - RESERVA_PAGINA) / escala);
    // Los lugares del descanso van en una grilla y el sofá al centro: con 1 px más de ancho una sala puede perder un
    // asiento. Si a este ancho las formas que caben fallan solo por eso, se prueba un piso un poco más angosto (hasta
    // una vuelta y media de la grilla): así una ventana más ancha nunca da una escala menor.
    for (let menos = 0; menos <= MARGEN_ASIENTOS; menos++) {
      const ancho = anchoArte(escala) - menos;
      let porAsientos = false;
      const reparto = mejorReparto(medidas, ancho, alto, (r) => {
        const faltan = filasSinAsiento(r, Math.min(ancho, r.comodo));
        if (faltan.length > 0) porAsientos = true;
        return faltan;
      });
      if (reparto) {
        elegido = { escala, reparto, ancho };
        return true;
      }
      if (!porAsientos) return false;
    }
    return false;
  };
  // Antes de obligar a bajar la página, 1,5x aunque no caiga en pixeles enteros: se ve la oficina completa.
  if (!escalas.some(probar) && !escalas.includes(ESCALA_MINIMA)) probar(ESCALA_MINIMA);
  if (!elegido) {
    // No cabe a lo alto ni a la escala más chica: a 1,5x (hay que bajar la página lo menos posible), una forma poco
    // más alta que la más baja; si ni a lo ancho cabe, la de siempre. Se prueba con algo más de alto hasta que cada
    // agente tenga su asiento.
    for (const escala of [ESCALA_MINIMA, ...[...escalas].reverse()]) {
      const bajo = mejorReparto(medidas, anchoArte(escala), Infinity);
      if (!bajo) continue;
      let reparto = bajo;
      for (const holgura of [1.15, 1.35, 1.6, 2]) {
        const r = mejorReparto(medidas, anchoArte(escala), Math.round(bajo.alto * holgura));
        if (r && cabenTodos(r, Math.min(anchoArte(escala), r.comodo))) {
          reparto = r;
          break;
        }
      }
      elegido = { escala, reparto, ancho: anchoArte(escala) };
      break;
    }
  }
  if (!elegido) return armarPiso(salas, anchoComputador(contenedor), "computador");
  const w = Math.min(elegido.ancho, elegido.reparto.comodo);
  if (salas.length === 0) return { escena: "computador", escala: elegido.escala, w, h: BORDE * 2, salas: [] };
  return armarPisoRepartido(elegido.reparto, w, elegido.escala);
}

function armarPisoRepartido(reparto: Reparto, w: number, escala: number): PisoPlano {
  const plan = PLANES.computador;
  return armarFilas(reparto.filas, (s, f) => columnasCon(s.agentes, reparto.alturas[f]!), reparto.alturas, w, "computador", plan, escala, descansoMinimo, true);
}

/** Las filas de salas donde, con todos libres, a alguna sala le falta un asiento por agente. */
function filasSinAsiento(reparto: Reparto, w: number): number[] {
  const salas = armarPisoRepartido(reparto, w, 2).salas;
  const cortas = new Set(salas.filter((s) => s.asientos.length < s.puestos.length).map((s) => s.prefijo));
  return reparto.filas.flatMap((fila, f) => (fila.some((s) => cortas.has(s.prefijo)) ? [f] : []));
}

/** Con todos libres, cada sala tiene un asiento por agente. */
function cabenTodos(reparto: Reparto, w: number): boolean {
  return filasSinAsiento(reparto, w).length === 0;
}

/** Alto del lienzo del TV que queda para el piso: 1080 − 113 de cabecera − 46 reservados para un banner (§14). */
export const ALTO_PISO_TV = 1080 - 113 - 46;

/** Escalas del TV, de mayor a menor (§14, JST-77 · 2A): gana la primera cuyo piso cabe en `ALTO_PISO_TV`. */
const OPCIONES_TV: ReadonlyArray<{ escala: 1 | 2 | 3; porFila: number; w: number; py: number }> = [
  { escala: 3, porFila: 2, w: ANCHO_TV, py: 38 },
  { escala: 2, porFila: 3, w: 936, py: 44 },
  { escala: 1, porFila: 4, w: 1872, py: 44 },
];

/**
 * Piso del modo TV: la escala entera más grande que cabe, medida sin el banner
 * (su lugar queda siempre reservado, así la escala no cambia cuando aparece un
 * aviso). Hoy, con 4 empresas, 3x; con 5, 2x en filas de 3; si ni así cabe, 1x.
 * El piso vacío se mide con `previas`, como en el computador (JST-89).
 */
export function armarPisoTv(salas: readonly EntradaSala[], previas: readonly EntradaSala[] = []): PisoPlano {
  const medidas = salas.length > 0 ? salas : previas;
  const con = (lista: readonly EntradaSala[], op: (typeof OPCIONES_TV)[number]) =>
    armarPisoCon(lista, op.w, "tv", { ...PLANES.tv, py: op.py, pyFila: op.py }, op.escala, op.porFila);
  const op = OPCIONES_TV.find((o) => con(medidas, o).h * o.escala <= ALTO_PISO_TV) ?? OPCIONES_TV[OPCIONES_TV.length - 1]!;
  return con(salas, op);
}

function armarPisoCon(salas: readonly EntradaSala[], w: number, escena: Exclude<Escena, "acercada">, plan: Plan, escala: number, porFila: number): PisoPlano {
  const cols = (s: EntradaSala) => plan.columnas[s.prefijo] ?? columnasDe(s.prefijo, escena, s.agentes);
  return armarFilas(filasDeSalas(salas, porFila), cols, null, w, escena, plan, escala);
}

/**
 * El piso con las salas ya repartidas en filas. `alturas`: cuántas filas de
 * escritorios lleva cada fila de salas; sin ellas, las que pida la sala con más.
 */
function armarFilas(
  filas: readonly (readonly EntradaSala[])[],
  columnas: (s: EntradaSala, fila: number) => number,
  alturas: readonly number[] | null,
  w: number,
  escena: Exclude<Escena, "acercada">,
  plan: Plan,
  escala: number,
  /** Lo menos que mide el descanso de cada sala; lo que sobra después se reparte como siempre. */
  minimo: (agentes: number) => number = () => 0,
  holgado = false,
): PisoPlano {
  const altos = filas.map((fila, fi) => {
    const maxFilas = alturas ? alturas[fi]! : Math.max(1, ...fila.map((s) => Math.ceil(s.agentes / columnas(s, fi))));
    return MURO + 14 + maxFilas * plan.pyFila + 6;
  });
  const h = BORDE * 2 + altos.reduce((a, b) => a + b, 0) + PASILLO * Math.max(0, filas.length - 1);
  const resultado: SalaPlano[] = [];
  let y = BORDE;
  filas.forEach((fila, fi) => {
    const cols = (s: EntradaSala) => columnas(s, fi);
    const escritorios = fila.map((s) => 8 + cols(s) * plan.px);
    const minimos = fila.map((s) => minimo(s.agentes));
    const sobra = w - BORDE * 2 - PASILLO * (fila.length - 1) - escritorios.reduce((a, b) => a + b, 0) - minimos.reduce((a, b) => a + b, 0);
    const pesoTotal = fila.reduce((a, s) => a + s.agentes + 4, 0);
    let x = BORDE;
    fila.forEach((s, ci) => {
      const descanso = minimos[ci]! + Math.round((sobra * (s.agentes + 4)) / pesoTotal);
      const ancho = escritorios[ci]! + descanso;
      resultado.push(armarSala(s.prefijo, s.agentes, x, y, ancho, altos[fi]!, cols(s), plan.px, plan.py, escala > 1, llevaEscritorio(escena), holgado));
      x += ancho + PASILLO;
    });
    y += altos[fi]! + PASILLO;
  });
  return { escena, escala, w, h, salas: resultado };
}

/** Sala acercada del celular (§2 y §10): la mitad del ancho del piso, a 2x, con paso 36 × 42. */
export function armarSalaAcercada(sala: EntradaSala, anchoPiso: number): PisoPlano {
  const cols = columnasDe(sala.prefijo, "acercada", sala.agentes);
  const w = Math.floor(anchoPiso / 2);
  const filas = Math.max(1, Math.ceil(sala.agentes / cols));
  const h = MURO + 14 + filas * 42 + 12;
  return { escena: "acercada", escala: 2, w, h, salas: [armarSala(sala.prefijo, sala.agentes, 0, 0, w, h, cols, 36, 42, true)] };
}
