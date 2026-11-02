// Lo que el worker acepta para leer el Resumen en voz alta (0.9.0, JST-246),
// sin React, navegador ni Node: lo usan la página (arma frases que el worker no
// va a rechazar) y el worker (la acción `voz-resumen`).
//
// El resumen son ~15 frases en un minuto, con nombres de agentes, de empresas y
// de tareas: no se pueden rearmar como las de la oficina (0.6.0) ni pasan la
// revisión de la IA (0.7.0, que no deja ningún dato). Por eso tiene su acción y
// sus reglas:
// - un largo máximo por frase (`LETRAS_FRASE_RESUMEN`);
// - solo letras, números, espacios y signos de puntuación: sin emojis,
//   símbolos, enlaces, códigos de tarea (el código va escrito, como chip) ni
//   estados como los escribe Paperclip (`in_review`, `blocked`…);
// - un tope de frases por resumen (`MAX_FRASES_RESUMEN`) y de frases nuevas por
//   minuto entre todos (`TOPE_RESUMEN_POR_MIN`);
// - solo con una voz rápida (Edge o Kokoro): un clon tarda de 3 a 26 s por
//   frase y abre un motor de 3 a 5 GB.
import { sinDirecciones, tieneDireccion } from "../paraVoz.js";
import { vozPorId, type VozId } from "../voces.js";

/** Una frase del resumen dura como mucho 16 s (§4): 0,4 s + 64 ms por letra son ~240 letras. */
export const LETRAS_FRASE_RESUMEN = 240;
/** Un resumen completo de 7 días son ~45 frases. */
export const MAX_FRASES_RESUMEN = 60;
/** Cuántas frases se le piden al worker de una vez: la que toca y las 2 que siguen. */
export const FRASES_POR_PEDIDO = 3;
/** Frases nuevas por minuto entre todos los resúmenes (un corto son ~15 por minuto). */
export const TOPE_RESUMEN_POR_MIN = 45;
/** El id de un resumen: lo arma la página («r» + hora + azar). */
export const ID_RESUMEN = /^[a-z0-9-]{4,40}$/;

/** Letras (con tildes), números, espacios y estos signos. */
const PERMITIDOS = /^[\p{L}\p{N} .,;:¿?¡!«»"“”'’()…%/+\-–—]+$/u;
const NO_PERMITIDO = /[^\p{L}\p{N} .,;:¿?¡!«»"“”'’()…%/+\-–—]/gu;
/** Un código de tarea («BET-421», «JST-246»): se ve como chip, no se dice. */
const CODIGO = /(?<![\p{L}\p{N}])[A-Z][A-Z0-9]{1,9}-\d+(?![\p{L}\p{N}])/u;
/** Un estado como lo escribe Paperclip («todo» no: también es castellano, «Eso es todo»; «done» tampoco, sale en títulos). */
const ESTADO_INGLES = /(?<![\p{L}])(?:in[ _]progress|in[ _]review|blocked|backlog|cancelled)(?![\p{L}])/giu;

/** Por qué el worker no lee una frase del resumen (vacío: la lee). */
export function problemasFraseResumen(x: unknown): string[] {
  if (typeof x !== "string") return ["no es texto"];
  const t = x.trim();
  const mal: string[] = [];
  if (!t || !/\p{L}/u.test(t)) mal.push("vacía");
  if ([...t].length > LETRAS_FRASE_RESUMEN) mal.push("larga");
  if (t && !PERMITIDOS.test(t)) mal.push("signos, emojis o símbolos");
  // También sin el «://» (JST-259): «http 192.0.2.15:3100» se leía número por número.
  if (/:\/\/|www\./i.test(t) || tieneDireccion(t)) mal.push("un enlace");
  if (CODIGO.test(t)) mal.push("un código de tarea");
  if (/_/.test(t) || new RegExp(ESTADO_INGLES.source, "iu").test(t)) mal.push("un estado en inglés");
  if (x !== t) mal.push("espacios de más");
  return mal;
}

export function fraseResumenValida(x: unknown): x is string {
  return problemasFraseResumen(x).length === 0;
}

/**
 * Un nombre (de tarea, de agente o de empresa) que va dentro de una frase: sin
 * códigos, `_`, estados en inglés, direcciones web (JST-259) ni símbolos que el
 * worker no lee.
 */
export function limpiarParaResumen(t: string): string {
  return sinDirecciones(String(t ?? ""))
    .replace(new RegExp(CODIGO.source, "gu"), " ")
    .replace(/_/g, " ")
    .replace(ESTADO_INGLES, " ")
    .replace(/[:/]{2,}/g, " ")
    .replace(NO_PERMITIDO, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:?!…])/g, "$1")
    .replace(/^[\s.,;:—–\-]+/, "")
    .trim();
}

/** Lo que la página le pide al worker: la voz, de qué resumen y las frases (la que toca primero). */
export interface PedidoResumen {
  voz: VozId;
  resumen: string;
  frases: string[];
}

/** La voz del resumen es una rápida (Edge, Kokoro o, desde la 0.13.0, Supertonic); si no, `null`. */
export function vozParaResumen(id: unknown): VozId | null {
  const v = vozPorId(id);
  return v && (v.motor === "edge" || v.motor === "kokoro" || v.motor === "supertonic") ? v.id : null;
}

/** El pedido como llega a la acción, revisado (`null`: no se entiende). Las frases que no sirven quedan, para responder «no» en su lugar. */
export function leerPedidoResumen(x: unknown): PedidoResumen | null {
  const p = (x && typeof x === "object" ? x : null) as Partial<Record<keyof PedidoResumen, unknown>> | null;
  if (!p || typeof p.resumen !== "string" || !ID_RESUMEN.test(p.resumen)) return null;
  const voz = vozParaResumen(p.voz);
  if (!voz) return null;
  if (!Array.isArray(p.frases) || p.frases.length === 0 || p.frases.length > FRASES_POR_PEDIDO) return null;
  return { voz, resumen: p.resumen, frases: p.frases.map((f) => (typeof f === "string" ? f : "")) };
}

/**
 * Lleva la cuenta de las frases nuevas: por resumen (como mucho
 * `MAX_FRASES_RESUMEN` distintas) y por minuto entre todos. Lo que ya está
 * hecho o en la fila no se le pregunta.
 */
export class CupoResumen {
  private readonly porResumen = new Map<string, { frases: Set<string>; en: number }>();
  private nuevas: number[] = [];

  constructor(private readonly ahora: () => number = Date.now) {}

  /** Una frase nueva más de ese resumen, si cabe. */
  tomar(resumen: string, texto: string): boolean {
    const t = this.ahora();
    for (const [k, v] of this.porResumen) if (t - v.en > 3_600_000) this.porResumen.delete(k);
    const r = this.porResumen.get(resumen) ?? { frases: new Set<string>(), en: t };
    if (r.frases.has(texto)) return true;
    if (r.frases.size >= MAX_FRASES_RESUMEN) return false;
    this.nuevas = this.nuevas.filter((x) => t - x < 60_000);
    if (this.nuevas.length >= TOPE_RESUMEN_POR_MIN) return false;
    this.nuevas.push(t);
    r.frases.add(texto);
    r.en = t;
    this.porResumen.delete(resumen);
    this.porResumen.set(resumen, r);
    // Como mucho 50 resúmenes a la vez (los más viejos se olvidan).
    if (this.porResumen.size > 50) this.porResumen.delete(this.porResumen.keys().next().value!);
    return true;
  }
}
