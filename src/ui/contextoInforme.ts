// El informe de «Leer contexto» (JST-414), sin React ni navegador: lo que hace
// falta para decidir sin abrir el hilo. Antes se leían los primeros 150 letras de
// cada comentario y nada de lo que la tarjeta trae para decidir.
//
// Con una tarjeta pendiente (o un «🙋 Te toca»), en este orden:
// - Quién pide y desde cuándo, y de qué tarea es.
// - La pregunta entera, con su ayuda y las opciones para responder.
// - Lo que la tarjeta explica (`summary` y `detailsMarkdown`): es lo que el
//   agente escribió para que decidas.
// - El plan, si lo que pide es aprobarlo.
// - Qué depende de la respuesta (lo que la tarea bloquea) y de qué pedido viene.
// - Dónde va el trabajo: frases enteras de lo último del hilo.
//
// Sin pregunta: qué es la tarea, en qué está (quién la tiene, qué la frena) y
// dónde va.
//
// Nunca corta una frase a la mitad: de cada texto elige frases enteras (la
// entradilla y las que dicen qué falta, qué recomienda, riesgos y plazos) y deja
// fuera lo operativo (worktrees, ramas, comandos), las tablas y el código.
//
// `corto` deja quién pide, la pregunta con sus opciones, el resumen de la tarjeta, el
// plan en breve y una línea de qué depende; sin pregunta, qué es la tarea, en qué
// está y lo último del hilo (breve). El `completo` suma los detalles de la tarjeta, el
// plan entero, el estado y dónde va.
import { msg } from "../i18n.js";
import { tareaParaVoz, type Topes } from "../paraVoz.js";
import type { Interaccion } from "../shared.js";
import { frasesDe } from "./contextoLector.js";
import { dichoDeTarjeta, TE_TOCA, teTocaDelHilo } from "./contextoPregunta.js";
import { enIngles, esComentarioAutomatico, textoParaVoz } from "./contextoVoz.js";

// ---------------------------------------------------------------------------
// Lo que se usa de la tarea, del hilo y de las tarjetas
// ---------------------------------------------------------------------------

/** Otra tarea nombrada por esta: el padre, la que bloquea o la bloqueada. */
export interface TareaRelacionada {
  id?: string | null;
  identifier?: string | null;
  title?: string | null;
  status?: string | null;
  assigneeAgentId?: string | null;
}

/** Lo que se usa de `GET /api/issues/:ref`. */
export interface TareaInforme {
  id: string;
  identifier: string | null;
  title: string;
  description: string | null;
  status: string | null;
  assigneeAgentId?: string | null;
  assigneeUserId?: string | null;
  startedAt?: string | null;
  updatedAt?: string | null;
  blockedTransitionAt?: string | null;
  /** El padre primero; el pedido de origen, al final. */
  ancestors?: TareaRelacionada[] | null;
  blocks?: TareaRelacionada[] | null;
  blockedBy?: TareaRelacionada[] | null;
  blockerAttention?: { unresolvedBlockerCount?: number | null; terminalBlocker?: TareaRelacionada | null } | null;
  planDocument?: { title?: string | null; body?: string | null } | null;
}

export interface ComentarioInforme {
  id: string;
  body: string;
  createdAt?: string | null;
  authorType?: string | null;
  authorAgentId?: string | null;
  presentation?: { kind?: string | null } | null;
}

export interface DatosInforme {
  tarea: TareaInforme;
  comentarios: readonly ComentarioInforme[];
  tarjetas: readonly Interaccion[];
  /** El nombre de cada agente por su id; el que falte no se nombra. */
  agentes?: Readonly<Record<string, string>>;
  ahora: number;
}

export type NivelInforme = "corto" | "completo";

export type ClaveSeccion = "pide" | "pregunta" | "explica" | "plan" | "depende" | "tarea" | "estado" | "va";

export interface SeccionInforme {
  clave: ClaveSeccion;
  /** El rótulo de la parte escrita, en español: se muestra por `t()`. La voz no lo dice. */
  titulo: string;
  /** Lo que se lee, de a una frase. */
  frases: string[];
}

export interface Informe {
  secciones: SeccionInforme[];
}

const TITULOS: Record<ClaveSeccion | "dependeDeElla", string> = {
  pide: msg("Quién te espera"),
  pregunta: msg("Qué te pregunta"),
  explica: msg("Lo que te explica"),
  plan: msg("El plan"),
  depende: msg("Qué depende de ti"),
  dependeDeElla: msg("Qué depende de ella"),
  tarea: msg("La tarea"),
  estado: msg("En qué está"),
  va: msg("Dónde va"),
};

/** Las frases del informe, en orden: lo que lee la voz. */
export function frasesDeInforme(i: Informe): string[] {
  return i.secciones.flatMap((s) => s.frases);
}

/** Lo que tarda en leerse, en segundos (unas 16 letras por segundo). */
export function segundosDeInforme(i: Informe): number {
  return Math.round(frasesDeInforme(i).reduce((n, f) => n + f.length, 0) / 16);
}

// ---------------------------------------------------------------------------
// Tiempos dichos
// ---------------------------------------------------------------------------

const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** «20 minutos», «una hora», «3 horas», «5 días», «7 semanas», «3 meses». */
function lapso(ms: number): string {
  const min = Math.round(ms / MIN);
  if (min < 2) return "un momento";
  if (min < 60) return `${min} minutos`;
  const h = Math.round(ms / HORA);
  if (h < 2) return "una hora";
  if (h < 24) return `${h} horas`;
  const d = Math.round(ms / DIA);
  if (d < 2) return "un día";
  if (d < 14) return `${d} días`;
  if (d < 60) return `${Math.round(d / 7)} semanas`;
  return `${Math.round(d / 30)} meses`;
}

/** Los días de calendario entre dos momentos (en la hora del navegador): 1 es «ayer». */
function diasDeCalendario(desde: number, ahora: number): number {
  const a = new Date(desde);
  const b = new Date(ahora);
  return Math.round((new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime() - new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()) / DIA);
}

/** «hace 20 minutos», «ayer», «hace 5 días», «hace 7 semanas». */
export function haceCuanto(desde: number, ahora: number): string {
  const ms = Math.max(0, ahora - desde);
  if (ms < 12 * HORA) return `hace ${lapso(ms)}`;
  const d = diasDeCalendario(desde, ahora);
  if (d <= 0) return `hace ${lapso(ms)}`;
  if (d === 1) return "ayer";
  return `hace ${lapso(d * DIA)}`;
}

/** «desde hace 3 horas», «desde ayer», «desde hace 5 días», «desde el 3 de octubre, hace 7 semanas». */
export function desdeCuando(desde: number, ahora: number): string {
  const ms = Math.max(0, ahora - desde);
  if (ms < 12 * HORA) return `desde hace ${lapso(ms)}`;
  const d = diasDeCalendario(desde, ahora);
  if (d <= 0) return `desde hace ${lapso(ms)}`;
  if (d === 1) return "desde ayer";
  if (d < 14) return `desde hace ${d} días`;
  const f = new Date(desde);
  return `desde el ${f.getDate()} de ${MESES[f.getMonth()]}, hace ${lapso(d * DIA)}`;
}

const fecha = (v: string | null | undefined): number | null => {
  const n = Date.parse(v ?? "");
  return Number.isFinite(n) ? n : null;
};

// ---------------------------------------------------------------------------
// Frases enteras de un texto en markdown
// ---------------------------------------------------------------------------

/** Una lista que puede venir como cualquier cosa: sin lo que no sea un objeto (`null`, textos…). */
export const objetos = <T extends object>(v: unknown): T[] => (Array.isArray(v) ? v.filter((x): x is T => !!x && typeof x === "object") : []);
/** Las tareas relacionadas que se pueden nombrar: con código o con título. */
const relacionadas = (v: unknown): TareaRelacionada[] => objetos<TareaRelacionada>(v).filter((r) => (typeof r.identifier === "string" && r.identifier) || tareaParaVoz(r.title));
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const lista = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : []);
/** Le queda algo que decir después de limpiarlo: una letra o un número. */
const seDice = (t: string): boolean => /[\p{L}\p{N}]/u.test(t);
const conPunto = (t: string): string => (/[.!?…:;]$/.test(t) ? t : `${t}.`);
const sinPunto = (t: string): string => t.replace(/[.;:,\s]+$/, "");
/** Para comparar dos frases sin mirar mayúsculas ni signos. */
const huella = (t: string): string => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

interface Bloque {
  tipo: "titulo" | "parrafo" | "item";
  texto: string;
}

/** Las etiquetas HTML de un markdown (`<details>`, `<summary>`, `<br>`…): no se leen. */
const ETIQUETA_HTML = /<\/?(?:details|summary|br|p|div|span|b|i|u|em|strong|a|ul|ol|li|code|pre|h[1-6]|table|thead|tbody|tr|td|th|img|hr|blockquote|sup|sub|kbd|center)\b[^>\n]*>/gi;

/** Los bloques de un markdown: títulos, párrafos e ítems de lista. Las tablas, el código y las reglas no se leen. */
export function bloquesDe(md: string): Bloque[] {
  const lineas = md
    .replace(/```[\s\S]*?(?:```|$)/g, "\n")
    .replace(ETIQUETA_HTML, " ")
    .split(/\r?\n/);
  const out: Bloque[] = [];
  let parrafo: string[] = [];
  const cerrar = () => {
    if (parrafo.length > 0) out.push({ tipo: "parrafo", texto: parrafo.join(" ") });
    parrafo = [];
  };
  for (const bruta of lineas) {
    // Una cita («> …») se lee como su texto.
    const l = bruta.replace(/^\s*(?:>\s?)+/, "");
    if (!l.trim() || /^\s*\|/.test(l) || /^\s*(?:[-*_]\s*){3,}$/.test(l)) {
      cerrar();
      continue;
    }
    const h = /^\s*#{1,6}\s+(.*)$/.exec(l);
    if (h) {
      cerrar();
      out.push({ tipo: "titulo", texto: h[1]! });
      continue;
    }
    const it = /^\s*(?:[-*•]|\d{1,2}[.)])\s+(.*)$/.exec(l);
    if (it) {
      cerrar();
      out.push({ tipo: "item", texto: it[1]! });
      continue;
    }
    const ultimo = out.at(-1);
    // La línea con sangría que sigue a un ítem es su continuación.
    if (parrafo.length === 0 && ultimo?.tipo === "item" && /^\s{2,}\S/.test(bruta)) ultimo.texto += ` ${l.trim()}`;
    else parrafo.push(l.trim());
  }
  cerrar();
  return out;
}

/**
 * Una palabra o frase entera, sin `\b`: en JavaScript `\b` no ve las letras con tilde («faltó», «por qué») como
 * parte de la palabra.
 */
const palabras = (alternativas: string, banderas = "iu"): RegExp => new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternativas})(?![\\p{L}\\p{N}])`, banderas);
/** El título de una sección que empieza con una de estas palabras. */
const empiezaCon = (alternativas: string): RegExp => new RegExp(`^(?:${alternativas})(?![\\p{L}\\p{N}])`, "iu");

/** Lo que es del agente que trabaja y no de quien decide: dónde trabajar y con qué comandos. */
const OPERATIVO = palabras(
  "worktrees?|ramas?|branch|checkout|stash|rebase|merge-base|commite\\p{L}*|rutas absolutas|un comando|un bloque de código|Workspace Ready|git (?:diff|status|log|push|pull|reset|restore)",
);
/** Un bloque que solo nombra a alguien («[@QA](agent://…)») o los datos de la tarea en otro sistema. */
const SOLO_MENCION = /^\s*(?:\[@[^\]]+\]\([^)]*\)[\s,·]*)+$/;
const FICHA = /^\s*\**\s*(?:Jira|Asignado en Jira a|Reportó|Relacionados|Creado|Strategy|Branch|CWD)\s*:/i;
/** Lo que más pesa al decidir: qué falta, qué recomienda, riesgos, plazos y bloqueos. */
const CLAVE = palabras(
  "falt(?:a|an|ó|aron)|pendientes?|quedan?|bloquead[oa]s?|necesit[oa]n?|espero|recomiend[oa]|recomendad[oa]s?|riesgos?|ojo|importante|antes del?|plazo|vence|urgente|" +
    "decid(?:e|es|as|ir)|decisión|te toca|mientras tanto|(?:próximo|siguiente) paso|no pude|fall(?:ó|aron)|no funciona|cambios requeridos|costo",
);
/** Lo que quedó en lugar de un trozo de código: con dos o más, la frase no se entiende al oírla. */
const DE_CODIGO = palabras("un (?:código|commit|pedido a la API)", "giu");
/** Un bloque lleno de nombres de código (tres o más entre comillas invertidas, o rutas de archivos): solo se lee si es la entradilla. */
const tecnico = (bruto: string): boolean => (bruto.match(/`[^`\n]+`/g) ?? []).length >= 3 || /(?:^|[\s(`])(?:[\w.-]+\/[\w.-]+\/[\w./-]+|~\/[\w.-]+|\/[\w.-]+\/[\w.-]+)/.test(bruto);
/** Una exclamación suelta («¡Bien!», «¡Listo!»): no dice nada del trabajo. */
const SALUDO = /^¡[^!]{1,24}!$/;
const LARGO_FRASE = 260;

/** Una frase muy larga se corta donde hay una pausa (nunca en medio de una palabra) y lleva «…». */
function acortar(f: string, max = LARGO_FRASE): string {
  if (f.length <= max) return f;
  const cabe = f.slice(0, max);
  const pausa = Math.max(cabe.lastIndexOf("; "), cabe.lastIndexOf(": "), cabe.lastIndexOf(", "));
  const en = pausa > max * 0.5 ? pausa : cabe.lastIndexOf(" ");
  return `${sinPunto(cabe.slice(0, en > 0 ? en : max))}…`;
}

/** Un comando encadenado («a && b», «a || b») o una ruta absoluta del computador: es del agente que trabaja, no se lee. */
const COMANDO = /&&|\|\||(?<![\w.:/])(?:\/(?:Users|home)\/|~\/)/;

/** Las frases que se dicen de un texto ya sin bloques: limpias, enteras y con algo que decir. */
function oracionesDe(crudo: string): string[] {
  // Lo operativo se mira en el texto sin limpiar: al limpiarlo los «||» y las rutas dejan de verse.
  const bruto = COMANDO.test(crudo) ? frasesDe(crudo).filter((f) => !COMANDO.test(f)).join(" ") : crudo;
  return frasesDe(textoParaVoz(bruto).replace(/@(?=\p{L})/gu, ""))
    .map((f) => f.trim())
    .filter(seDice);
}

interface Candidata {
  f: string;
  /** El bloque de donde sale. */
  b: number;
  item: boolean;
  /** La primera frase de su bloque. */
  primera: boolean;
  clave: boolean;
}

/**
 * Las frases que se dicen de unos bloques, en su orden, sin pasar de
 * `letras`: la entradilla (el primer párrafo, que en los comentarios de los
 * agentes es el resumen), los ítems cortos de una lista que una frase elegida
 * anuncia («Cuando la crees:») y las frases que pesan al decidir (`CLAVE`).
 */
export function elegirFrases(bloques: readonly Bloque[], letras: number, conClave = true): string[] {
  const cs: Candidata[] = [];
  bloques.forEach((b, i) => {
    if (b.tipo === "titulo" || SOLO_MENCION.test(b.texto) || FICHA.test(b.texto)) return;
    let primera = true;
    for (const f of oracionesDe(b.texto)) {
      const era = primera;
      primera = false;
      if (OPERATIVO.test(f) || enIngles(f) || SALUDO.test(f) || (f.match(DE_CODIGO) ?? []).length >= 2) continue;
      // Lo que pesa al decidir va al principio de su párrafo («Falta solo…», «Recomiendo aprobar:…»); más adentro es detalle.
      cs.push({ f: acortar(f), b: i, item: b.tipo === "item", primera: era, clave: conClave && era && !tecnico(b.texto) && CLAVE.test(f) });
    }
  });
  if (cs.length === 0 || letras <= 0) return [];
  const elegidas = new Set<number>();
  let usado = 0;
  const cabe = (c: Candidata) => usado + c.f.length <= letras;
  const tomar = (k: number) => {
    elegidas.add(k);
    usado += cs[k]!.f.length + 1;
  };
  // La entradilla: la primera frase siempre (acortada a lo que hay), y las de su bloque que quepan.
  cs[0] = { ...cs[0]!, f: acortar(cs[0]!.f, Math.max(80, letras)) };
  cs.forEach((c, k) => {
    if (c.b === cs[0]!.b && (k === 0 || cabe(c))) tomar(k);
  });
  // El resto, en orden: los ítems que anuncia una frase elegida (hasta 3) y lo que pesa al decidir.
  let deLista = 0;
  cs.forEach((c, k) => {
    if (elegidas.has(k)) return;
    const antes = cs[k - 1];
    const anunciado = c.item && c.primera && !!antes && elegidas.has(k - 1) && (/:$/.test(antes.f) || (antes.item && deLista > 0));
    if (anunciado && deLista < 3 && c.f.length <= 160 && cabe(c)) {
      deLista += 1;
      tomar(k);
      return;
    }
    if (!anunciado) deLista = 0;
    if (c.clave && cabe(c)) tomar(k);
  });
  // Una frase que anuncia una lista («Lo revisé, solo leyendo:») sin nada de la lista después, sobra.
  const anunciaSola = (k: number): boolean => /:$/.test(cs[k]!.f) && !(cs[k + 1]?.item && elegidas.has(k + 1));
  const quedan = cs.map((_c, k) => k).filter((k) => elegidas.has(k) && !(anunciaSola(k) && elegidas.size > 1));
  return quedan.map((k) => conPunto(cs[k]!.f));
}

/** Las secciones de una descripción que dicen para qué es la tarea, y las que son para quien la trabaja. */
const SECCION_QUE = empiezaCon("por qué|para qué|qué pasa|qué es|qué|objetivo|contexto|problema|pedido|resumen|motivo|descripción");
const SECCION_COMO = empiezaCon("cómo trabajar|cómo|worktree|entorno|comandos|verificación|pruebas|notas|reglas|checklist|referencias|archivos|criterios|definición de hecho|estado");

/**
 * Lo que se dice de una descripción: la sección que explica el porqué («Por
 * qué», «Qué pasa», «Contexto»…) si la tiene; si no, lo que no sea para quien
 * la trabaja («Cómo trabajar», «Verificación»…).
 */
export function frasesDeDescripcion(md: string, letras: number): string[] {
  const secciones: Array<{ titulo: string; bloques: Bloque[] }> = [{ titulo: "", bloques: [] }];
  for (const b of bloquesDe(md)) {
    if (b.tipo === "titulo") secciones.push({ titulo: textoParaVoz(b.texto), bloques: [] });
    else secciones.at(-1)!.bloques.push(b);
  }
  for (const s of secciones) {
    if (!SECCION_QUE.test(s.titulo)) continue;
    const f = elegirFrases(s.bloques, letras, false);
    if (f.length > 0) return f;
  }
  return elegirFrases(
    secciones.filter((s) => !SECCION_COMO.test(s.titulo)).flatMap((s) => s.bloques),
    letras,
    false,
  );
}

// ---------------------------------------------------------------------------
// Las partes del informe
// ---------------------------------------------------------------------------

const ESTADO: Record<string, string> = {
  backlog: "en espera",
  todo: "por hacer",
  in_progress: "en curso",
  in_review: "en revisión",
  blocked: "bloqueada",
  done: "terminada",
  cancelled: "cancelada",
};
const CERRADA = new Set(["done", "cancelled"]);
const ORDINAL = ["Primera", "Segunda", "Tercera", "Cuarta", "Quinta"];
/** Lo que mide el informe completo, más o menos (unos 75 s): la pregunta va siempre entera y lo demás se ajusta a lo que queda. */
const TOPE_COMPLETO = 1_200;
/** El arranque que se le pone a la primera frase de una parte: no cuenta al mirar si ya se dijo. */
const CABEZA = /^(?:Te pregunta|Te pide confirmar|Te pide|Te explica|La tarea dice|Primera|Segunda|Tercera|Cuarta|Quinta):\s*/;
const TITULO_PROPIO: Topes = { palabras: 26, letras: 150 };
const TITULO_AJENO: Topes = { palabras: 16, letras: 90 };

/** «a», «a y b», «a, b y c» (o con «o»). */
function enumerar(xs: readonly string[], y = "y"): string {
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} ${y} ${xs.at(-1)}`;
}

/** «ABC-5: Publicar el catálogo», o solo el título si no tiene código. */
function nombrar(t: TareaRelacionada, topes: Topes = TITULO_AJENO): string {
  const titulo = tareaParaVoz(typeof t.title === "string" ? t.title : null, topes);
  const id = typeof t.identifier === "string" && t.identifier ? t.identifier : null;
  if (id && titulo) return `${id}: ${titulo}`;
  return id ?? titulo;
}

interface Ctx {
  d: DatosInforme;
  completo: boolean;
  agente: (id: string | null | undefined) => string | null;
}

/** Las opciones para responder, dichas: en una frase si son cortas; una por frase si son largas o traen explicación. */
function opcionesDichas(ops: readonly Record<string, unknown>[], cx: Ctx, verbo: string): string[] {
  const o = ops
    .map((x) => ({ e: sinPunto(textoParaVoz(texto(x.label) ?? "")), d: cx.completo ? oracionesDe(texto(x.description) ?? "").join(" ") : "" }))
    .filter((x) => seDice(x.e));
  if (o.length === 0) return [];
  const dichas = o.slice(0, cx.completo ? 5 : 4);
  const mas = o.length - dichas.length;
  const cola = mas > 0 ? [mas === 1 ? "Y una opción más." : `Y ${mas} opciones más.`] : [];
  if (dichas.some((x) => x.d) || dichas.some((x) => x.e.length > 70)) {
    return [o.length === 1 ? "Hay una opción." : `Hay ${o.length} opciones.`, ...dichas.map((x) => conPunto(acortar(x.d ? `${x.e}: ${x.d}` : x.e))), ...cola];
  }
  return [`${verbo} ${enumerar(dichas.map((x) => `«${x.e}»`), "o")}.`, ...cola];
}

/**
 * El texto de una pregunta, en frases enteras y con lo que trae entre paréntesis
 * (ahí suele ir lo que se aprueba). Si no cabe en `letras`: la primera frase, las
 * que preguntan y las que quepan.
 */
function promptDicho(bruto: string, letras: number): string[] {
  const fs = bloquesDe(bruto)
    .filter((b) => b.tipo !== "titulo")
    .flatMap((b) => oracionesDe(b.texto))
    .map((f) => conPunto(acortar(f, 320)));
  const total = fs.reduce((n, f) => n + f.length + 1, 0);
  if (total <= letras) return fs;
  const out: string[] = [];
  let usado = 0;
  fs.forEach((f, k) => {
    if (k > 0 && usado + f.length > (f.includes("?") ? letras * 2 : letras)) return;
    out.push(f);
    usado += f.length + 1;
  });
  return out;
}

/** Lo que pregunta una tarjeta pendiente, entero: la pregunta, su ayuda y las opciones. */
function preguntaDe(i: Interaccion, cx: Ctx): string[] {
  const p = i.payload ?? {};
  const letras = cx.completo ? 420 : 220;
  switch (i.kind) {
    case "request_confirmation":
    case "request_checkbox_confirmation": {
      const d = promptDicho(texto(p.prompt) ?? texto(i.title) ?? "", letras);
      if (d.length === 0) return [];
      const casillas = i.kind === "request_checkbox_confirmation";
      const out = [`${d.some((f) => f.includes("?")) ? "Te pregunta" : casillas ? "Te pide" : "Te pide confirmar"}: ${d[0]}`, ...d.slice(1)];
      if (casillas) out.push(...opcionesDichas(lista(p.options), cx, "Puedes marcar"));
      const si = texto(p.acceptLabel);
      const no = texto(p.rejectLabel);
      if (si && no) out.push(`Puedes responder «${sinPunto(textoParaVoz(si))}» o «${sinPunto(textoParaVoz(no))}».`);
      return out;
    }
    case "ask_user_questions": {
      const preguntas = lista(p.questions).filter((q) => texto(q.prompt));
      if (preguntas.length === 0) break;
      const una = preguntas.length === 1;
      const out = una ? [] : [`Te pregunta ${preguntas.length} cosas.`];
      const dichas = preguntas.slice(0, cx.completo ? ORDINAL.length : 3);
      dichas.forEach((q, k) => {
        const d = promptDicho(texto(q.prompt)!, una ? letras : 220);
        if (d.length === 0) return;
        out.push(`${una ? "Te pregunta" : ORDINAL[k]}: ${d[0]}`, ...d.slice(1));
        if (cx.completo) out.push(...elegirFrases(bloquesDe(texto(q.helpText) ?? ""), 260));
        out.push(...opcionesDichas(lista(q.options), cx, q.selectionMode === "multi" ? "Puedes marcar" : "Puedes responder"));
      });
      const mas = preguntas.length - dichas.length;
      if (mas > 0) out.push(mas === 1 ? "Y una pregunta más." : `Y ${mas} preguntas más.`);
      return out;
    }
    case "suggest_tasks": {
      const tareas = lista(p.tasks);
      const n = tareas.length;
      const sobre = texto(i.title) ?? texto(i.summary);
      const d = sobre ? dichoDeTarjeta(sobre, 150) : "";
      const out = [`Te propone ${n === 0 ? "tareas" : n === 1 ? "una tarea" : `${n} tareas`} para que elijas cuáles crear${d ? `: ${d}` : "."}`];
      const titulos = tareas
        .map((x) => tareaParaVoz(texto(x.title), TITULO_AJENO))
        .filter(Boolean)
        .slice(0, cx.completo ? 6 : 3);
      if (titulos.length > 0) out.push(conPunto(`${n > titulos.length ? "Entre ellas" : n === 1 ? "Es" : "Son"}: ${titulos.join("; ")}`));
      return out;
    }
  }
  const d = dichoDeTarjeta(texto(i.title) ?? texto(i.summary) ?? texto(p.prompt) ?? "", letras);
  return [d ? `Espera tu respuesta: ${d}` : "Hay una tarjeta esperando tu respuesta."];
}

/** La tarjeta pide aprobar el plan de la tarea. */
function esDePlan(i: Interaccion): boolean {
  const destino = i.payload?.target;
  const clave = destino && typeof destino === "object" ? (destino as Record<string, unknown>).key : null;
  return clave === "plan" || (i.title ?? "").startsWith("Plan approval - ");
}

/** Las secciones de un plan que dicen qué se va a hacer, en el orden en que se leen. */
const PLAN_QUE = empiezaCon("objetivo|qué|resumen|para qué|problema");
const PLAN_PASOS = empiezaCon("pasos|etapas|fases|cómo|plan|tareas|qué haría");
const PLAN_MAS = empiezaCon("alcance|fuera de alcance|riesgos?|costo|equipo");

/**
 * Lo que se dice del plan, sin pasar de `tope` letras: su nombre, su objetivo, cuántos pasos tiene y cuáles, y
 * (completo) el alcance y los riesgos. En ese orden: lo que no cabe se deja fuera.
 */
function planDicho(plan: NonNullable<TareaInforme["planDocument"]>, tarea: TareaInforme, cx: Ctx, tope: number): string[] {
  const cuerpo = texto(plan.body);
  if (!cuerpo) return [];
  const secciones: Array<{ titulo: string; bloques: Bloque[] }> = [{ titulo: "", bloques: [] }];
  for (const b of bloquesDe(cuerpo)) {
    if (b.tipo === "titulo") secciones.push({ titulo: sinPunto(textoParaVoz(b.texto)), bloques: [] });
    else secciones.at(-1)!.bloques.push(b);
  }
  const out: string[] = [];
  let usado = 0;
  let lleno = false;
  /** Agrega la frase si cabe (la primera siempre); la primera que no cabe cierra el plan. */
  const agregar = (f: string): boolean => {
    if (lleno) return false;
    if (out.length > 0 && usado + f.length + 1 > tope) {
      lleno = true;
      return false;
    }
    out.push(f);
    usado += f.length + 1;
    return true;
  };
  const resto = (max: number): number => Math.max(0, Math.min(max, tope - usado));
  const nombre = tareaParaVoz(plan.title, TITULO_PROPIO).replace(/^plan\s*:\s*/i, "");
  // Un plan titulado solo «Plan» no dice nada: «El plan: Plan.»
  if (nombre && huella(nombre) !== "plan" && huella(nombre) !== huella(tareaParaVoz(tarea.title, TITULO_PROPIO))) agregar(`El plan: ${conPunto(nombre)}`);
  // Una sección que calza con las dos listas («Qué haría») se dice una sola vez: como pasos si tiene ítems.
  const pasos = secciones.find((s) => PLAN_PASOS.test(s.titulo) && s.bloques.some((b) => b.tipo === "item"));
  const que = secciones.find((s) => s !== pasos && PLAN_QUE.test(s.titulo));
  if (que) for (const f of elegirFrases(que.bloques, resto(cx.completo ? 260 : 180))) agregar(f);
  if (pasos) {
    const items = pasos.bloques.filter((b) => b.tipo === "item").map((b) => oracionesDe(b.texto)[0] ?? "").filter(Boolean);
    if (items.length > 0 && agregar(items.length === 1 ? "Tiene un paso." : `Tiene ${items.length} pasos.`) && cx.completo) {
      for (const [k, p] of items.slice(0, 6).entries()) if (!agregar(conPunto(`${k + 1}: ${sinPunto(acortar(p, 160))}`))) break;
    }
  }
  if (cx.completo) {
    for (const s of secciones) {
      if (!PLAN_MAS.test(s.titulo)) continue;
      const f = elegirFrases(s.bloques.map((b) => ({ ...b, tipo: b.tipo === "item" ? ("parrafo" as const) : b.tipo })), resto(200));
      if (f.length === 0 || !agregar(`${s.titulo}: ${f[0]}`)) continue;
      for (const x of f.slice(1)) if (!agregar(x)) break;
    }
  }
  // Un plan sin secciones conocidas: lo que diga, como cualquier texto.
  if (out.length <= 1 && !que && !pasos) for (const f of elegirFrases(bloquesDe(cuerpo), resto(cx.completo ? 450 : 180))) agregar(f);
  return out;
}

/** Lo que la tarea tiene esperando: «De tu respuesta depende ABC-5: …, que está bloqueada.» */
function dependeDicho(cx: Ctx, conPregunta: boolean): string[] {
  const t = cx.d.tarea;
  const out: string[] = [];
  const abiertas = relacionadas(t.blocks).filter((b) => !CERRADA.has(b.status ?? ""));
  if (abiertas.length > 0) {
    const dichas = abiertas.slice(0, 2).map((b) => `${nombrar(b)}${b.status === "blocked" ? ", que está bloqueada" : ""}`);
    const mas = abiertas.length - dichas.length;
    const cola = mas > 0 ? `${dichas.length > 1 || dichas[0]!.includes(",") ? ";" : ""} y ${mas === 1 ? "otra tarea" : `otras ${mas} tareas`}` : "";
    const sujeto = conPregunta ? "De tu respuesta" : "De esta tarea";
    out.push(`${sujeto} ${abiertas.length === 1 ? "depende" : "dependen"} ${dichas.join("; ")}${cola}.`);
  }
  const ancestros = relacionadas(t.ancestors);
  const padre = ancestros[0];
  if (padre) {
    if (!abiertas.slice(0, 2).some((b) => b.identifier && b.identifier === padre.identifier)) out.push(`Es parte de ${nombrar(padre)}.`);
    const origen = ancestros.at(-1)!;
    if (cx.completo && ancestros.length > 1) out.push(`El pedido de origen es ${nombrar(origen)}.`);
  }
  return out;
}

/** En qué está la tarea: su estado, quién la tiene y qué la frena. */
function estadoDicho(cx: Ctx): string[] {
  const t = cx.d.tarea;
  const out: string[] = [];
  const estado = ESTADO[t.status ?? ""];
  const quien = cx.agente(t.assigneeAgentId);
  const desde = t.status === "blocked" ? fecha(t.blockedTransitionAt) : t.status === "in_progress" ? fecha(t.startedAt) : null;
  if (estado) {
    const tiene = quien ? `, la tiene ${quien}` : t.assigneeUserId && !t.assigneeAgentId ? ", la tiene una persona" : "";
    out.push(`Está ${estado}${desde ? ` ${desdeCuando(desde, cx.d.ahora)}` : ""}${tiene}.`);
  }
  const frenos = relacionadas(t.blockedBy).filter((b) => !CERRADA.has(b.status ?? ""));
  if (t.status === "blocked" || frenos.length > 0) {
    if (frenos.length > 0) {
      const b = frenos[0]!;
      const suEstado = ESTADO[b.status ?? ""];
      const suAgente = cx.agente(b.assigneeAgentId);
      const mas = frenos.length - 1;
      out.push(
        `La frena ${nombrar(b)}${suEstado ? `, que está ${suEstado}` : ""}${suAgente ? ` y la tiene ${suAgente}` : ""}${mas > 0 ? `; y ${mas === 1 ? "otra tarea" : `otras ${mas} tareas`}` : ""}.`,
      );
    }
    const fondo = t.blockerAttention?.terminalBlocker;
    if (fondo && typeof fondo === "object" && relacionadas([fondo]).length > 0 && fondo.identifier !== frenos[0]?.identifier) out.push(`En el fondo, todo espera a ${nombrar(fondo)}.`);
  }
  const quieta = fecha(t.updatedAt);
  if (cx.completo && quieta && !CERRADA.has(t.status ?? "") && cx.d.ahora - quieta >= 2 * DIA) out.push(`No se mueve ${desdeCuando(quieta, cx.d.ahora)}.`);
  return out;
}

/**
 * El inglés se mira en lo que se lee (JST-310): una descripción o un comentario que empieza en inglés no se lee, aunque
 * termine en español (las «Review productivity for …» de Paperclip). Sin esto, de sus frases en inglés se descartan
 * las que se reconocen y quedan sueltas las cortas («Source issue: JST-900»).
 */
const empiezaEnIngles = (bruto: string, letras: number): boolean => enIngles(textoParaVoz(bruto).slice(0, letras));

/** El hilo que se lee: sin los avisos de Paperclip ni lo vacío, el más nuevo primero. */
function hiloUtil(comentarios: readonly ComentarioInforme[]): ComentarioInforme[] {
  return comentarios
    .filter((c) => typeof c.body === "string" && c.body.trim() && !esComentarioAutomatico(c))
    .slice()
    .sort((a, b) => (fecha(b.createdAt) ?? 0) - (fecha(a.createdAt) ?? 0));
}

/** Dónde va: frases enteras de lo último del hilo (y de lo anterior, si lo último fue corto o lo escribió la persona). */
function vaDicho(cx: Ctx, hilo: readonly ComentarioInforme[], sinEste: string | null, letras: number, hayPregunta: boolean, yaDicha: (f: string) => boolean): string[] {
  // Con una pregunta pendiente (la tarjeta o el «🙋 Te toca» de ahora), un «Te toca» viejo del hilo ya se respondió y
  // repetirlo confunde. Sin pregunta, es lo que explica la respuesta que vino después («Sí, dale»).
  const utiles = hilo.filter((c) => c.id !== sinEste && !(hayPregunta && TE_TOCA.test(c.body)) && !empiezaEnIngles(c.body, 150));
  const out: string[] = [];
  const vistas = new Set<string>();
  let quedan = letras;
  let dichos = 0;
  for (const c of utiles) {
    if (quedan < 60 || dichos >= 2) break;
    // Lo ya dicho se saca ANTES de ponerle la cabeza a la primera frase: con la cabeza pegada, `yaDicha` no la reconoce
    // y la pregunta se leería dos veces; así la cabeza va en la primera frase que sobrevive.
    const f = elegirFrases(bloquesDe(c.body), dichos === 0 ? quedan : Math.min(quedan, 220)).filter((x) => {
      if (yaDicha(x) || vistas.has(huella(x))) return false;
      vistas.add(huella(x));
      return true;
    });
    if (f.length === 0) continue;
    const cuando = fecha(c.createdAt);
    const hace = cuando ? haceCuanto(cuando, cx.d.ahora) : null;
    const tuyo = c.authorType === "user";
    const quien = tuyo ? null : cx.agente(c.authorAgentId);
    const cabeza =
      dichos === 0
        ? tuyo
          ? `Lo último lo escribiste tú${hace ? `, ${hace}` : ""}:`
          : `Dónde va${quien ? `, según ${quien}` : ""}${hace && cuando && cx.d.ahora - cuando >= DIA ? `, ${hace}` : ""}:`
        : tuyo
          ? "Antes escribiste:"
          : `Antes${quien ? `, ${quien}` : ""} dijo:`;
    out.push(`${cabeza} ${f[0]}`, ...f.slice(1));
    const usado = f.reduce((n, x) => n + x.length + 1, 0);
    quedan -= usado;
    dichos += 1;
    // Con lo último ya dicho por el agente y con cuerpo, lo anterior sobra.
    if (!tuyo && usado >= 120) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// El informe
// ---------------------------------------------------------------------------

/**
 * El informe de la tarea. `nivel`: `completo` es todo; `corto`, quién pide, la
 * pregunta con sus opciones, el resumen de la tarjeta, el plan en breve y una línea
 * de qué depende (o, sin pregunta, qué es la tarea, en qué está y lo último, en breve).
 */
export function componerInforme(crudo: DatosInforme, nivel: NivelInforme = "completo"): Informe {
  // Los datos llegan de la red: los comentarios y las tarjetas pueden no ser una lista o traer `null` adentro.
  const d: DatosInforme = { ...crudo, comentarios: objetos<ComentarioInforme>(crudo.comentarios), tarjetas: objetos<Interaccion>(crudo.tarjetas) };
  const completo = nivel === "completo";
  const cx: Ctx = {
    d,
    completo,
    agente: (id) => {
      const n = id ? d.agentes?.[id] : null;
      return n ? sinPunto(textoParaVoz(n)) || null : null;
    },
  };
  const t = d.tarea;
  const descripcion = t.description && !empiezaEnIngles(t.description, 300) ? t.description : null;
  const secciones: SeccionInforme[] = [];
  /** Todo lo dicho, pegado y sin signos: para no repetir una frase (el resumen de la tarjeta suele repetir su pregunta). */
  let dicho = "";
  let letras = 0;
  const yaDicha = (f: string): boolean => {
    const h = huella(f.replace(CABEZA, ""));
    return !h || (h.length >= 12 ? dicho.includes(h) : dicho.split("|").includes(h));
  };
  const parte = (clave: ClaveSeccion, frases: readonly string[], titulo: string = TITULOS[clave]) => {
    const nuevas = frases.filter((f) => {
      if (yaDicha(f)) return false;
      dicho += `|${huella(f)}`;
      letras += f.length + 1;
      return true;
    });
    if (nuevas.length > 0) secciones.push({ clave, titulo, frases: nuevas });
  };
  /** Lo que queda para una parte que no es la pregunta: hasta `max` letras, y nunca menos de `min`. */
  const cupo = (max: number, min: number): number => Math.min(max, Math.max(min, TOPE_COMPLETO - letras));

  const pendientes = d.tarjetas.filter((i) => i.status === "pending").sort((a, b) => (fecha(b.createdAt) ?? 0) - (fecha(a.createdAt) ?? 0));
  let tarjeta: Interaccion | null = null;
  let pregunta: string[] = [];
  for (const i of pendientes) {
    pregunta = preguntaDe(i, cx);
    if (pregunta.length > 0) {
      tarjeta = i;
      break;
    }
  }
  const hilo = hiloUtil(d.comentarios);
  const teToca = tarjeta ? null : teTocaDelHilo(d.comentarios);
  const comentarioTeToca = teToca ? (hilo.find((c) => c.id === teToca.id) ?? null) : null;
  const tituloTarea = nombrar(t, TITULO_PROPIO) || "sin título";

  if (tarjeta || teToca) {
    // Quién pide y desde cuándo.
    const quien = cx.agente(tarjeta ? (tarjeta.createdByAgentId ?? t.assigneeAgentId) : (comentarioTeToca?.authorAgentId ?? t.assigneeAgentId));
    const desde = fecha(tarjeta ? tarjeta.createdAt : comentarioTeToca?.createdAt);
    const cuando = desde ? ` ${desdeCuando(desde, d.ahora)}` : "";
    const pide = [quien ? `${quien} te espera${cuando}.` : `Te esperan${cuando}.`, `Es por la tarea ${conPunto(tituloTarea)}`];
    const otras = pendientes.length - 1;
    if (tarjeta && otras > 0) pide.push(`${otras === 1 ? "Hay otra tarjeta" : `Hay ${otras} tarjetas más`} esperando tu respuesta.`);
    parte("pide", pide);
    parte("pregunta", tarjeta ? pregunta : [teToca!.texto]);

    // Lo que la tarjeta (o el resto del «Te toca») explica.
    const explica: string[] = [];
    if (tarjeta) {
      const p = tarjeta.payload ?? {};
      explica.push(...elegirFrases(bloquesDe(texto(tarjeta.summary) ?? ""), 220));
      if (completo) explica.push(...elegirFrases(bloquesDe(texto(p.detailsMarkdown) ?? ""), cupo(600, 220)));
    } else if (teToca?.resto) {
      explica.push(...elegirFrases(bloquesDe(teToca.resto), completo ? 500 : 180));
    }
    const nuevas = explica.filter((f) => !yaDicha(f));
    if (nuevas.length > 0) parte("explica", [`Te explica: ${nuevas[0]}`, ...nuevas.slice(1)]);

    if (tarjeta && esDePlan(tarjeta) && t.planDocument) parte("plan", planDicho(t.planDocument, t, cx, completo ? cupo(600, 220) : 220));
    parte("depende", completo ? dependeDicho(cx, true) : dependeDicho(cx, true).slice(0, 1));
    if (completo) {
      if (t.status === "blocked" || relacionadas(t.blockedBy).some((b) => !CERRADA.has(b.status ?? ""))) parte("estado", estadoDicho(cx));
      parte("va", vaDicho(cx, hilo, teToca?.id ?? null, cupo(450, 160), true, yaDicha));
      // Sin nada que lo explique (ni tarjeta con detalle ni hilo), queda lo que dice la tarea.
      if (!secciones.some((s) => s.clave === "explica" || s.clave === "va") && descripcion) {
        const f = frasesDeDescripcion(descripcion, 300).filter((x) => !yaDicha(x));
        if (f.length > 0) parte("tarea", [`La tarea dice: ${f[0]}`, ...f.slice(1)]);
      }
    }
    return { secciones };
  }

  // Sin pregunta: qué es, en qué está y dónde va.
  const es = [`Tarea ${conPunto(tituloTarea)}`];
  if (descripcion) {
    // Lo que repite el título («Publicar la guía») no se dice dos veces; la cabeza va en la primera frase que queda.
    const hTitulo = huella(es[0]!.replace(CABEZA, ""));
    const f = frasesDeDescripcion(descripcion, completo ? 300 : 200).filter((x) => !yaDicha(x) && !(huella(x).length >= 12 && hTitulo.includes(huella(x))));
    if (f.length > 0) es.push(`La tarea dice: ${f[0]}`, ...f.slice(1));
  }
  parte("tarea", es);
  parte("estado", estadoDicho(cx));
  parte("depende", completo ? dependeDicho(cx, false) : dependeDicho(cx, false).slice(0, 1), TITULOS.dependeDeElla);
  parte("va", vaDicho(cx, hilo, null, completo ? 450 : 200, false, yaDicha));
  return { secciones };
}
