// El rótulo de la sala (0.3.4, design-spec de JST-138, C · Rótulo de la sala),
// sin React: de qué tarea habla cada rótulo en cada instante, cómo se corta un
// nombre largo y los nombres de las tareas que la página ya conoce.
//
// Los globos siguen con el código. Abajo de cada sala, un rótulo cuenta el
// nombre de una tarea a la vez, cada 6 s: primero lo que te espera y después lo
// que se está haciendo (la «vuelta»). Se adelantan el agente con el mouse o el
// foco encima, un sobre recién entregado y la frase de una conversación. A 1x
// (el widget y el piso entero del celular) va un solo rótulo bajo el piso, que
// turna las empresas cada 5 s. Nada de esto lee: los nombres salen de lo que la
// página ya leyó (§2).
import { textoSinTarea } from "./estado.js";
import type { Dibujo } from "./vista.js";

/** Cada cuánto pasa a la siguiente tarea el rótulo de una sala, y el de 1x (§3.4 y §3.6). */
export const PASO_SALA_MS = 6_000;
export const PASO_PISO_MS = 5_000;
/** Lo que el rótulo cuenta un sobre desde que sale (§1). */
export const SOBRE_MS = 6_000;
/** Tocar el rótulo en una pantalla táctil pasa al siguiente y lo deja quieto 15 s (§3.5). */
export const QUIETO_TOQUE_MS = 15_000;
/** Lo que el usuario no pidió (su paso, un estado, un aviso que empieza o termina) no cambia el rótulo antes de esto desde el cambio anterior: espera (JST-191). */
export const ENTRE_CAMBIOS_MS = 500;

export type TipoRotulo = "toca" | "trabaja" | "cola" | "sobre" | "charla" | "error" | "libre" | "pausa" | "listo" | "entrega";

/** Lo que cuenta el rótulo: ícono (por el tipo), código, «+N» y nombre. */
export interface ItemRotulo {
  /** Cambia cuando cambia lo que cuenta (el fundido va con ella). */
  clave: string;
  tipo: TipoRotulo;
  prefijo: string;
  /** De quién habla: su globo lleva el anillo. En un sobre, quien lo recibe. */
  agente: string;
  /** El nombre corto del agente (lo muestra el rótulo de 1x). */
  quien: string;
  codigo: string | null;
  /** Otras cosas que te pide el mismo agente. */
  mas: number;
  /** Lo que va después del código, sin cortar: el nombre de la tarea, «para …», «Libre» o «En pausa». */
  texto: string;
  /** 0.5.0 (JST-163 §9): cuando cuenta lo que hace alguien, su hora estimada, en una pastilla a la derecha («≈vie 9:10»). */
  hora?: string | null;
}

/** Lo que el rótulo necesita de cada agente. */
export interface AgenteRotulo {
  id: string;
  prefijo: string;
  nombre: string;
  st: Dibujo;
  /** Lo primero que te pide (lo más antiguo): el código y lo que te pide; `mas`, cuántas cosas más. */
  espera: { codigo: string | null; titulo: string | null; mas: number } | null;
  /** Su run: el código y el nombre de la tarea, si espera turno y (0.5.0) su hora estimada, ya dicha («≈15:05», «lleva 2 h»). */
  run: { codigo: string | null; titulo: string | null; enCola: boolean; invocationSource?: string | null; hora?: string | null } | null;
}

/** El nombre del agente sin lo que va entre paréntesis: «Documentación Técnica (Betalandia)» → «Documentación Técnica». */
export function nombreCorto(nombre: string): string {
  return nombre.replace(/\s*\([^)]*\)\s*$/, "").trim() || nombre;
}

const base = (a: AgenteRotulo) => ({ prefijo: a.prefijo, agente: a.id, quien: nombreCorto(a.nombre), mas: 0 });

function itemEspera(a: AgenteRotulo): ItemRotulo | null {
  const e = a.espera;
  if (!e || (!e.codigo && !e.titulo)) return null;
  return { ...base(a), clave: `t:${a.id}:${e.codigo ?? ""}`, tipo: "toca", codigo: e.codigo, mas: Math.max(0, e.mas), texto: e.titulo ?? "" };
}

function itemTrabajo(a: AgenteRotulo): ItemRotulo | null {
  const r = a.run;
  if (a.st !== "trabaja" || !r || (!r.codigo && !r.titulo)) return null;
  return { ...base(a), clave: `w:${a.id}:${r.codigo ?? ""}`, tipo: r.enCola ? "cola" : "trabaja", codigo: r.codigo, texto: r.titulo ?? "", hora: r.enCola ? null : (r.hora ?? null) };
}

/**
 * La vuelta de una sala (§3.3): primero lo que te espera (cada agente con algo
 * para ti, en el orden de los escritorios) y después quien trabaja o está en
 * cola. Quien trabaja y además te espera sale 2 veces.
 */
export function vueltaDeSala(agentes: readonly AgenteRotulo[]): ItemRotulo[] {
  const esperas = agentes.map(itemEspera).filter((x): x is ItemRotulo => x !== null);
  const trabajos = agentes.map(itemTrabajo).filter((x): x is ItemRotulo => x !== null);
  return [...esperas, ...trabajos];
}

/**
 * La vuelta del rótulo de 1x (§3.6): la primera de cada empresa, en el orden
 * en que llegan, después la segunda de cada una, y así. Dentro de cada empresa,
 * el orden de la sala.
 */
export function vueltaDelPiso(agentes: readonly AgenteRotulo[]): ItemRotulo[] {
  const porEmpresa = new Map<string, AgenteRotulo[]>();
  for (const a of agentes) porEmpresa.set(a.prefijo, [...(porEmpresa.get(a.prefijo) ?? []), a]);
  const vueltas = [...porEmpresa.values()].map(vueltaDeSala);
  const largo = Math.max(0, ...vueltas.map((v) => v.length));
  const mezcla: ItemRotulo[] = [];
  for (let i = 0; i < largo; i++) for (const v of vueltas) if (v[i]) mezcla.push(v[i]!);
  return mezcla;
}

const ESTADO_SIN_TAREA: Record<Dibujo, string> = { trabaja: "Trabajando", toca: "Libre", error: "Con error", pausa: "En pausa", libre: "Libre" };

/**
 * Lo que cuenta el rótulo del agente con el mouse o el foco encima (§3.3): lo
 * que te pide; si no, su tarea; si no, su error; si no, «Libre» o «En pausa»
 * (sin código).
 */
export function itemDeAgente(a: AgenteRotulo): ItemRotulo {
  const lo = itemEspera(a) ?? itemTrabajo(a);
  if (lo) return lo;
  const b = { ...base(a), clave: `a:${a.id}:${a.st}` };
  if (a.st === "error") return { ...b, tipo: "error", codigo: a.run?.codigo ?? null, texto: a.run?.titulo ?? ESTADO_SIN_TAREA.error };
  if (a.st === "trabaja") return { ...b, tipo: "trabaja", codigo: null, texto: a.run ? textoSinTarea(a.run.invocationSource) : ESTADO_SIN_TAREA.trabaja };
  return { ...b, tipo: a.st === "pausa" ? "pausa" : "libre", codigo: null, texto: ESTADO_SIN_TAREA[a.st] };
}

// ---------------------------------------------------------------------------
// Lo que cambia con el tiempo
// ---------------------------------------------------------------------------

const mod = (i: number, n: number) => ((i % n) + n) % n;

/** Desfase de la sala `indiceSala` de `nSalas` (§3.4): con 4 salas, 1,5 s entre una y otra. Así nunca cambian dos a la vez. */
export function desfase(indiceSala: number, nSalas: number, paso = PASO_SALA_MS): number {
  return nSalas > 0 ? (indiceSala * paso) / nSalas : 0;
}

export interface OpcionesRotulo {
  /** El agente con el mouse o el foco encima: lo suyo se adelanta a todo. */
  pin?: ItemRotulo | null;
  /** Un sobre que salió hace menos de 6 s en la sala (0.5.0: o la entrega en la mesa que va, o un «✓ listo»). */
  sobre?: ItemRotulo | null;
  /** La frase de la conversación que va, si nombra una tarea con nombre conocido. */
  frase?: ItemRotulo | null;
  /** Quieto en esa posición de la vuelta (mouse o foco en el rótulo, ‹ ›, un toque): no avanza solo. */
  quieto?: number | null;
  /** El usuario lo tiene quieto (mouse o foco en el rótulo, o un toque): ni el sobre ni la frase se adelantan (§3.5). */
  sostenido?: boolean;
  /** Mientras está sostenido, el sobre o la frase que se veía al quedar quieto: sigue a la vista hasta ‹ › o un toque. */
  retenido?: ItemRotulo | null;
  /** Movimiento reducido: no avanza solo; sin `quieto`, lo primero de la vuelta (§3.7). */
  rm?: boolean;
  paso?: number;
}

export interface Rotulo {
  /** Lo que cuenta ahora, o `null` si no hay nada que contar (sin rótulo). */
  item: ItemRotulo | null;
  /** La posición de la vuelta en este instante (aunque se adelante otra cosa), o `null` si la vuelta está vacía. */
  indice: number | null;
  /** Lo que cuenta no es de la vuelta: el agente con el mouse encima, un sobre o una conversación. */
  adelantado: boolean;
}

/**
 * Qué cuenta el rótulo en el instante `t` (§3.3 y §3.4). Se adelantan, en este
 * orden, el agente con el mouse o el foco encima, un sobre y la frase de la
 * conversación; si no, la vuelta, que avanza cada `paso` según el reloj:
 * `floor((t + desfase) / paso) mod n`. Si la vuelta cambia, se sigue con la
 * misma cuenta (puede saltarse uno, pero no vuelve al comienzo). Sostenido por
 * el usuario, el sobre y la frase no se adelantan: se queda lo que se veía
 * (§3.5, JST-152).
 */
export function rotuloEn(t: number, vuelta: readonly ItemRotulo[], indiceSala: number, nSalas: number, o: OpcionesRotulo = {}): Rotulo {
  const n = vuelta.length;
  const paso = o.paso ?? PASO_SALA_MS;
  let indice: number | null = null;
  if (n > 0) {
    if (o.quieto !== null && o.quieto !== undefined) indice = mod(o.quieto, n);
    else if (o.rm) indice = 0;
    else indice = mod(Math.floor((t + desfase(indiceSala, nSalas, paso)) / paso), n);
  }
  const aviso = o.sostenido ? (o.retenido ?? null) : (o.sobre ?? o.frase ?? null);
  const adelantado = o.pin ?? aviso;
  if (adelantado) return { item: adelantado, indice, adelantado: true };
  return { item: indice === null ? null : vuelta[indice]!, indice, adelantado: false };
}

/** Un sobre, una entrega en la mesa, un «✓ listo» o la frase de una conversación: lo que se adelanta solo, sin que el usuario lo pida. */
export function esAviso(item: ItemRotulo | null | undefined): item is ItemRotulo {
  return item?.tipo === "sobre" || item?.tipo === "charla" || item?.tipo === "entrega" || item?.tipo === "listo";
}

/** Cuándo pasa sola a la siguiente (el próximo paso de su reloj), o `null` si no cambia sola (una sola tarea, quieta o con movimiento reducido). */
export function proximoPaso(t: number, n: number, indiceSala: number, nSalas: number, o: Pick<OpcionesRotulo, "quieto" | "rm" | "paso"> = {}): number | null {
  if (n < 2 || o.rm || (o.quieto !== null && o.quieto !== undefined)) return null;
  const paso = o.paso ?? PASO_SALA_MS;
  const d = desfase(indiceSala, nSalas, paso);
  return (Math.floor((t + d) / paso) + 1) * paso - d;
}

// ---------------------------------------------------------------------------
// Cómo se corta un nombre largo (§5)
// ---------------------------------------------------------------------------

/** Lo que no puede quedar colgando antes del «…». */
const CONECTORES = new Set("a al con de del e el en la las lo los o para por que se sin su sus u un una unos unas y".split(" "));
const SIGNO_SUELTO = /^[:,;·—–\-(«]+$/;
const SIGNOS_AL_FINAL = /[\s:,;·—–\-(«]+$/;

const limpia = (palabra: string) =>
  palabra
    .toLowerCase()
    .replace(/^[«(¿¡"“]+/, "")
    .replace(/[»),.;:"”]+$/, "");

/** Saca un paréntesis que quedaría abierto, entero (§5.5): desde la palabra que lo abre. */
function sinParentesisAbierto(palabras: string[]): string[] {
  let abre = -1;
  let hondo = 0;
  palabras.forEach((p, i) => {
    for (const c of p) {
      if (c === "(") {
        if (hondo === 0) abre = i;
        hondo += 1;
      } else if (c === ")" && hondo > 0) hondo -= 1;
    }
  });
  return hondo > 0 && abre > 0 ? palabras.slice(0, abre) : palabras;
}

/** Las palabras que quedan, sin paréntesis abiertos ni un conector o signo colgando, con «…». */
function conPuntos(palabras: readonly string[]): string {
  let w = [...palabras];
  for (;;) {
    const antes = w.length;
    w = sinParentesisAbierto(w);
    while (w.length > 1 && (CONECTORES.has(limpia(w[w.length - 1]!)) || SIGNO_SUELTO.test(w[w.length - 1]!))) w.pop();
    if (w.length === antes) break;
  }
  return `${w.join(" ").replace(SIGNOS_AL_FINAL, "")}…`;
}

/** Mide un texto con una fuente CSS (`500 11px Inter`), en pixeles CSS. */
export type Medidor = (texto: string, fuente: string) => number;

let lienzo: CanvasRenderingContext2D | null = null;

/** Con `canvas.measureText` (en el navegador). */
export const medirConCanvas: Medidor = (texto, fuente) => {
  lienzo ??= document.createElement("canvas").getContext("2d");
  if (!lienzo) return texto.length * 7;
  lienzo.font = fuente;
  return lienzo.measureText(texto).width;
};

const cortes = new Map<string, string>();

/**
 * El nombre que cabe en `anchoPx` con esa fuente (§5): palabras enteras hasta
 * llenar el ancho y, si sobra, «…» sin dejar colgando un conector, un signo ni
 * un paréntesis abierto. Solo si la primera palabra ya no cabe, se corta
 * adentro de ella.
 */
export function cortarNombre(titulo: string, fuente: string, anchoPx: number, medir: Medidor = medirConCanvas): string {
  const t = titulo.replace(/\s+/g, " ").trim();
  if (!t) return "";
  const clave = `${fuente}|${Math.round(anchoPx * 2)}|${t}`;
  const guardado = medir === medirConCanvas ? cortes.get(clave) : undefined;
  if (guardado !== undefined) return guardado;
  const corte = cortar(t, fuente, anchoPx, medir);
  if (medir === medirConCanvas) {
    if (cortes.size > 400) cortes.clear();
    cortes.set(clave, corte);
  }
  return corte;
}

function cortar(t: string, fuente: string, anchoPx: number, medir: Medidor): string {
  if (medir(t, fuente) <= anchoPx) return t;
  const palabras = t.split(" ");
  for (let k = palabras.length - 1; k >= 1; k--) {
    const c = conPuntos(palabras.slice(0, k));
    if (medir(c, fuente) <= anchoPx) return c;
  }
  const primera = palabras[0]!;
  for (let n = primera.length - 1; n >= 1; n--) {
    const c = `${primera.slice(0, n)}…`;
    if (medir(c, fuente) <= anchoPx) return c;
  }
  return "…";
}

// ---------------------------------------------------------------------------
// Nombres conocidos (§2)
// ---------------------------------------------------------------------------

/** Una tarea ya leída: su código y su nombre. */
export interface TareaConocida {
  identifier: string | null;
  title: string;
}

/**
 * Los nombres de las tareas que la página ya leyó (runs, «te necesita» y las
 * lecturas de las conversaciones), `código → nombre`, mientras la página está
 * abierta. El canal en vivo trae solo el código: el sobre y lo que alguien
 * terminó buscan aquí su nombre, sin leer nada.
 */
export class TitulosConocidos {
  private readonly mapa = new Map<string, string>();

  /** `tareas`: otra fuente que se mira si no está en el mapa (las tareas que guarda el sincronizador). */
  constructor(private readonly tareas: () => Iterable<TareaConocida> = () => []) {}

  conocer(codigo: string | null | undefined, titulo: string | null | undefined): void {
    if (codigo && titulo) this.mapa.set(codigo, titulo);
  }

  titulo(codigo: string): string | null {
    const t = this.mapa.get(codigo);
    if (t) return t;
    for (const x of this.tareas()) {
      if (x.identifier === codigo && x.title) {
        this.mapa.set(codigo, x.title);
        return x.title;
      }
    }
    return null;
  }
}
