// Lo que te preguntan en una tarea, para el botón «Leer contexto» (JST-273),
// sin React ni navegador. Va primero en la lectura; el porqué (el padre y lo
// último que pasó) viene después.
//
// - `preguntaPendiente`: la tarjeta que espera tu respuesta (la más nueva).
//   `request_confirmation`: su `prompt` entero si cabe (~220 letras); si no, su
//   primera oración y la pregunta, o solo la pregunta. `ask_user_questions`:
//   sus preguntas (hasta 3). `suggest_tasks`: cuántas tareas propone y el
//   título de la tarjeta.
// - `teTocaDelHilo`: si no hay tarjeta, la primera frase del último comentario
//   cuando es un «🙋 Te toca» (sin contar los avisos de Paperclip ni lo escrito
//   en inglés, como al leer el hilo). Si después vino otro comentario, ya no te
//   toca eso.
import { analizarPregunta, sinPreguntasCitadas, tareaParaVoz, type Topes } from "../paraVoz.js";
import type { Interaccion } from "../shared.js";
import { enIngles, esComentarioAutomatico, textoParaVoz } from "./contextoVoz.js";

/** Lo que se dice de una tarjeta: ~220 letras, unos 15 s de voz. */
const LETRAS_TARJETA = 220;
/** Con varias preguntas, cada una más corta. */
const LETRAS_CADA_PREGUNTA = 150;
/** Las preguntas que se dicen de una tarjeta con varias; las demás se cuentan. */
const MAX_PREGUNTAS = 3;
const SIN_TOPE: Topes = { palabras: 400, letras: 4000 };

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const lista = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : []);
const conPunto = (t: string) => (/[.?!]$/.test(t) ? t : `${t}.`);
/** Lo que quedó suelto antes de un punto al quitar un símbolo («Cristian: ↻.» → «Cristian:.»). */
const sinSignoSuelto = (t: string) => t.replace(/[,;:]+(?=[.?!](?:\s|$))/g, "");

/**
 * Cada línea es una oración: el fin de línea sin signo lleva su punto y las
 * viñetas («- », «1. ») se van. Así la lista de un `prompt` no se junta en una
 * sola oración.
 */
function porLineas(t: string): string {
  return t
    .replace(/^[ \t]*(?:[-*•]|\d{1,2}[.)])[ \t]+/gm, "")
    .replace(/([^\s.?!:;,])[ \t]*\n+/g, "$1.\n");
}

/** Las oraciones de un texto ya limpio («.», «?» o «!», un espacio y una mayúscula, «¿» o «¡»). */
function oraciones(t: string): string[] {
  return t.split(/(?<=[.?!])\s+(?=[¿¡\p{Lu}])/u).filter((x) => /\p{L}/u.test(x));
}

/**
 * Lo que la voz dice de un texto de una tarjeta (el `prompt` o una pregunta),
 * con lo de las comillas invertidas en palabras (`textoParaVoz`) y limpio como
 * el nombre de una tarea (`tareaParaVoz`): entero si cabe en
 * `letras`; si no, la primera oración y la pregunta («El botón quedó listo en
 * la barra de cada tarea. ¿Envío al QA?»), o solo la pregunta.
 */
export function dichoDeTarjeta(bruto: string, letras = LETRAS_TARJETA): string {
  const base = sinPreguntasCitadas(textoParaVoz(porLineas(bruto)));
  const entero = sinSignoSuelto(tareaParaVoz(base, SIN_TOPE));
  if (!entero) return "";
  if (entero.length <= letras) return conPunto(entero);
  const q = analizarPregunta(base, { palabras: 40, letras });
  if (!q) return "";
  const primera = conPunto(oraciones(entero)[0] ?? "");
  if (q.pregunta && !primera.includes("?") && !q.texto.startsWith(primera.replace(/[.]$/, "")) && primera.length + 1 + q.texto.length <= letras) {
    return `${primera} ${q.texto}`;
  }
  return conPunto(sinSignoSuelto(q.texto));
}

/** Lo que se dice de una tarjeta pendiente, o `null` si no queda nada que decir. */
function dichoDe(i: Interaccion): string | null {
  const p = i.payload ?? {};
  switch (i.kind) {
    case "request_confirmation":
    case "request_checkbox_confirmation": {
      const d = dichoDeTarjeta(texto(p.prompt) ?? texto(i.title) ?? "");
      if (!d) return null;
      if (d.includes("?")) return `Te pregunta: ${d}`;
      // «Marca las funciones que quieres…»: la de casillas ya dice qué hacer.
      return i.kind === "request_checkbox_confirmation" ? `Te pide: ${d}` : `Te pide confirmar: ${d}`;
    }
    case "ask_user_questions": {
      const preguntas = lista(p.questions)
        .map((q) => texto(q.prompt))
        .filter((q): q is string => !!q);
      if (preguntas.length === 0) break;
      if (preguntas.length === 1) {
        const d = dichoDeTarjeta(preguntas[0]!);
        return d ? `Te pregunta: ${d}` : null;
      }
      const dichas = preguntas
        .slice(0, MAX_PREGUNTAS)
        .map((q) => dichoDeTarjeta(q, LETRAS_CADA_PREGUNTA))
        .filter(Boolean);
      if (dichas.length === 0) return null;
      const mas = preguntas.length - MAX_PREGUNTAS;
      return `Te pregunta ${preguntas.length} cosas: ${dichas.join(" ")}${mas > 0 ? ` Y ${mas === 1 ? "una más" : `${mas} más`}.` : ""}`;
    }
    case "suggest_tasks": {
      const n = lista(p.tasks).length;
      const cuantas = n === 0 ? "tareas" : n === 1 ? "una tarea" : `${n} tareas`;
      const sobre = texto(i.title) ?? texto(i.summary);
      const d = sobre ? dichoDeTarjeta(sobre, LETRAS_CADA_PREGUNTA) : "";
      return `Te propone ${cuantas} para que elijas cuáles crear${d ? `: ${d}` : "."}`;
    }
  }
  // Otra clase de tarjeta: lo que diga su título.
  const d = dichoDeTarjeta(texto(i.title) ?? texto(i.summary) ?? texto(p.prompt) ?? "");
  return d ? `Espera tu respuesta: ${d}` : "Hay una tarjeta esperando tu respuesta.";
}

/**
 * Lo que te pregunta la tarjeta pendiente más nueva de la tarea: «Te pregunta:
 * ¿Ya está conectado Microsoft 365 en claude.ai?». Si hay más de una, lo dice.
 * `null` si no hay ninguna pendiente.
 */
export function preguntaPendiente(tarjetas: readonly Interaccion[]): string | null {
  const pendientes = tarjetas.filter((i) => i.status === "pending").sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
  for (const i of pendientes) {
    const d = dichoDe(i);
    if (!d) continue;
    const otras = pendientes.length - 1;
    return otras > 0 ? `${d} ${otras === 1 ? "Hay otra tarjeta" : `Hay ${otras} tarjetas más`} esperando tu respuesta.` : d;
  }
  return null;
}

/** Lo que se usa de un comentario del hilo. */
export interface ComentarioHilo {
  id: string;
  body: string;
  createdAt?: string | null;
  authorType?: string | null;
  presentation?: { kind?: string | null } | null;
}

/**
 * «🙋 Te toca:» al principio, con o sin el emoji y la negrita. Sin tramos de espacios seguidos que puedan quedar
 * vacíos: con miles de espacios al principio no se queda rebuscando (corre sobre cada comentario).
 */
export const TE_TOCA = /^[\s*_]*(?:\p{Extended_Pictographic}\uFE0F?[\s*_]*)?te\s+toca[\s*_]*:[\s*_]*/iu;
/** Donde termina la primera frase del comentario: un punto, «?» o «!» seguido de un espacio, o un fin de línea. */
const FIN_FRASE = /[.?!](?=\s|$)|\n/u;

export interface TeToca {
  /** «Te toca: revisar la implementación del botón Leer contexto.» */
  texto: string;
  /** El comentario de donde salió. */
  id: string;
  /** Lo que sigue a la primera frase (tal cual, para leerlo en «Lo último»), o «». */
  resto: string;
}

/**
 * La primera frase del último comentario si es un «🙋 Te toca», cuando no hay
 * tarjeta pendiente. Los avisos de Paperclip y lo escrito en inglés no cuentan
 * como lo último. `null` si el último no es un «Te toca».
 */
export function teTocaDelHilo(comentarios: readonly ComentarioHilo[]): TeToca | null {
  const ultimo = comentarios
    .filter((c) => typeof c.body === "string" && c.body.trim() && !esComentarioAutomatico(c) && !enIngles(c.body))
    .reduce<ComentarioHilo | null>((a, c) => (!a || (Date.parse(c.createdAt ?? "") || 0) > (Date.parse(a.createdAt ?? "") || 0) ? c : a), null);
  if (!ultimo) return null;
  const m = TE_TOCA.exec(ultimo.body);
  if (!m) return null;
  const cuerpo = ultimo.body.slice(m[0].length);
  const fin = FIN_FRASE.exec(cuerpo);
  const corte = fin ? fin.index + 1 : cuerpo.length;
  const frase = dichoDeTarjeta(cuerpo.slice(0, corte));
  if (!frase) return null;
  return { texto: `Te toca: ${frase}`, id: ultimo.id, resto: cuerpo.slice(corte).trim() };
}
