// Las conversaciones del descanso (0.4.0, design-spec de JST-162, B · Pregunta y
// respuesta), sin React ni DOM: de qué hablan, quién dice qué y cuánto dura
// cada frase. Las frases sueltas de quien está solo y lo que dicen las mascotas.
//
// Todo sale de lo que la Oficina ya sabe: el estado de cada agente, su run, lo
// que te pide, su motivo, los contadores y los temas guardados de `temas.ts`
// (lo último que terminó y su cola). Ninguna lectura nueva por globo (§1.1).
// Una frase con tarea no repite el código: dice «esta» y la tarea va en la
// línea de abajo del globo (§1.4). Las frases de relleno son opiniones, nunca
// datos inventados.
//
// 0.13.0 (JST-345): con la IA de Chrome lista y elegida, también reescribe la
// apertura con huecos (`{tarea}`, `{agente}`, `{n}`…), las sueltas, las bromas y
// las mascotas. El código rellena los huecos con los datos actuales; las frases
// fijas son respaldo solo si no se dijeron en la hora y, si no queda otra, se calla.
import { BROMAS, DICEN, MASCOTA_DE_REACCION, REACCIONES, SUELTAS, SUELTAS_CON_DATO, SUELTAS_CON_DATO_COLA, SUELTAS_CON_DATO_RECIEN, SUELTAS_GENERALES, SUELTAS_POR_ESTADO, fraseDeMascota, type EstadoSuelta, type IdMascota, type Reaccion } from "./charlasTextos.js";
import { duracionDeTarea, duracionHablada } from "./duracion.js";
import type { TipoEspera } from "./estado.js";
import { categoriaError, type CategoriaError } from "./motivoError.js";
import { cortarNombre } from "./rotulo.js";
import type { EstadoCola, Temas } from "./temas.js";
import type { Dibujo } from "./vista.js";

// ---------------------------------------------------------------------------
// Ritmo «Intermedio» (§2.1): fijo, no se elige en el panel
// ---------------------------------------------------------------------------

/** Cada libre del descanso busca con quién hablar cada 15–30 s; al abrir, a los 5–10 s. */
export const BUSCA_MS: readonly [number, number] = [15_000, 30_000];
export const PRIMERA_MS: readonly [number, number] = [5_000, 10_000];
/** La misma pareja vuelve a hablar a los 2 min. */
export const PAREJA_MS = 120_000;
/** La sala descansa 20 s después de una conversación. */
export const SALA_MS = 20_000;
/** Como mucho 3 conversaciones a la vez en el piso (y 1 por sala). */
export const MAX_CHARLAS = 3;
/**
 * Los temas de una pareja se piden como mucho una vez por minuto en todo el
 * piso, como en la 0.3.8 (que armaba una conversación cada 1 a 2 min): que
 * hablen más seguido no multiplica las lecturas (como mucho 4 por minuto).
 */
export const PEDIR_TEMAS_MS = 60_000;
/** Cada libre que está solo dice una frase suelta cada 45–90 s. */
export const SUELTA_MS: readonly [number, number] = [45_000, 90_000];

/** Cada frase se queda su duración y 350 ms más; la primera llega 300 ms después de que se juntan (§2.2). */
export const ENTRE_FRASES_MS = 350;
export const PRIMERA_FRASE_MS = 300;

/** El nombre de la tarea dentro del globo, cortado a 34 letras por palabras (§1.4). */
export const LETRAS_TAREA = 34;

/** Lo que dice una mascota al tocarla (o sola en el TV): 1,8 s (§3). */
export const MASCOTA_DICE_MS = 1_800;

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Una frase del hilo: quién la dice, el texto y, si lleva, la tarea de la línea de abajo. */
export interface Linea {
  quien: string;
  texto: string;
  codigo: string | null;
  /** El nombre de esa tarea, si se conoce (sin cortar). */
  titulo: string | null;
  /** Si la apertura la escribió la IA: su plantilla y los datos con que se rellenó (para validar también su audio). */
  aperturaIa?: AperturaRellena;
}

/** Lo que una conversación necesita de cada agente del piso. */
export interface AgenteCharla {
  id: string;
  prefijo: string;
  nombre: string;
  /** El nombre de su empresa («Betalandia»). */
  empresa: string;
  st: Dibujo;
  /** Tiene algo esperando tu respuesta. */
  need: boolean;
  rol: string | null;
  rolApi: string | null;
  /** El motivo de su error o de su pausa. */
  motivo: string | null;
  /** Lo primero que te pide: de qué tipo, su tarea y desde cuándo. */
  espera: { tipo: TipoEspera | null; codigo: string | null; desde: string | null } | null;
  /** Su run: la tarea, desde cuándo y si espera turno. */
  run: { codigo: string | null; desde: string | null; enCola: boolean } | null;
}

export interface ContextoCharla {
  /** La sala de la conversación. */
  prefijo: string;
  /** Quien buscó con quién hablar: empieza si el tema no es de uno de los dos. */
  a: AgenteCharla;
  b: AgenteCharla;
  /** Todos los del piso que se ven (también la pareja). */
  agentes: readonly AgenteCharla[];
  /** Prefijos del filtro por empresa (vacío o sin dar: todas). «Hay {n} …» cuenta solo esas salas, como el encabezado (JST-176). */
  filtro?: readonly string[];
  /** Los temas guardados de un agente, sin leer nada (`null` si no están). */
  temas: (id: string) => Temas | null;
  /** El nombre de una tarea que la página ya conoce. */
  titulo: (codigo: string) => string | null;
  /** La hora de verdad (`Date.now()`), para «lleva una hora esperando» y para decir el día y la hora (JST-415). */
  reloj: number;
  /** JST-415: las entregas que vio la oficina hace poco (quién le pasó qué a quién y cuándo, en la hora de verdad). */
  entregas?: ReadonlyArray<{ de: string; a: string; codigo: string; en: number }>;
  /** El reloj de la vida (para lo que no se repite en 10 min). */
  ahora: number;
  azar: () => number;
}

export type Tema =
  | "termino"
  | "cola"
  | "revision"
  | "espera-otra"
  | "bloqueada"
  | "te-espera"
  | "error"
  | "pausa"
  | "trabajan"
  | "rol"
  | "sala"
  | "empresa"
  | "entrega"
  | "reloj"
  | "tardo"
  | "racha"
  | "broma";

export interface Guion {
  tema: Tema;
  /** «termino-2», «broma-5»… */
  variante: string;
  lineas: Linea[];
  /** De quién (o de qué sala) se habla: con eso `rearmar` vuelve a decir lo mismo con los datos de ahora (0.6.0). */
  sujeto?: string | readonly string[];
  /** 0.7.0: el final lo escribió la IA de Chrome (las frases después de las fijas). */
  ia?: FinalIa;
}

// ---------------------------------------------------------------------------
// Nombres, roles y motivos
// ---------------------------------------------------------------------------

const CONECTORES = new Set("de del la el los las y e o u con para en of".split(" "));

/**
 * El nombre para hablar (§1.1): sin el paréntesis final, hasta el primer « / »,
 * « + », « - » o «, », hasta 20 letras por palabras y sin conector al final.
 * «Ingeniero/a Full-stack de Plugins» → «Ingeniero/a».
 */
export function nombreDeCharla(nombre: string): string {
  let n = nombre.replace(/\s*\([^)]*\)\s*$/, "").trim();
  n = n.split(/\s+(?:\/|\+|&|-|—|–)\s+|,\s*/)[0]!.trim();
  let w = n.split(/\s+/);
  while (w.length > 1 && w.join(" ").length > 20) w.pop();
  while (w.length > 1 && CONECTORES.has(w[w.length - 1]!.toLowerCase())) w.pop();
  return w.join(" ") || nombre;
}

/** De qué se ocupa cada uno, para «¿Cómo va …?» (§1.3): primero por el cargo, después por el rol de Paperclip. */
const ROL_TEMA: ReadonlyArray<readonly [RegExp, string]> = [
  [/hermes/i, "lo de los servidores"],
  [/document/i, "la documentación"],
  [/revisor/i, "lo de las revisiones"],
  [/\bqa\b|test/i, "lo de las pruebas"],
  [/diseñ|disen|\bux\b/i, "el diseño"],
  [/spec/i, "lo de las specs"],
  [/integraci|\bci\b|devops/i, "la integración"],
  [/ingenier|engineer|desarroll|developer/i, "el código"],
  [/contenido/i, "el contenido"],
  [/\bcmo\b|marketing/i, "el marketing"],
  [/chief of staff/i, "la coordinación"],
  [/\bceo\b|\bcto\b|director|líder|lider/i, "la empresa"],
];
const ROL_API: Readonly<Record<string, string>> = {
  engineer: "el código",
  designer: "el diseño",
  qa: "lo de las pruebas",
  ceo: "la empresa",
  cto: "la parte técnica",
  cmo: "el marketing",
  cfo: "las cuentas",
  pm: "el producto",
  researcher: "la investigación",
  devops: "la integración",
};

export function rolTema(a: Pick<AgenteCharla, "nombre" | "rol" | "rolApi">): string {
  const t = `${a.rol ?? ""} ${a.nombre}`;
  for (const [re, v] of ROL_TEMA) if (re.test(t)) return v;
  return (a.rolApi && ROL_API[a.rolApi]) || "la pega";
}

/** Lo que dicen las conversaciones de cada categoría de error (`motivoError.ts`); la voz usa otras palabras para lo mismo. */
export const TEXTO_ERROR: Readonly<Record<CategoriaError, string>> = {
  limite: "Se quedó sin cupo, parece.",
  tiempo: "Se le acabó el tiempo.",
  pruebas: "Le fallaron las pruebas.",
  acceso: "Un tema de permisos.",
  caida: "Se le cayó el proceso.",
  dormida: "Se durmió la Mac, parece.",
  carpeta: "Un problema con su carpeta.",
  inicio: "No alcanzó a empezar.",
};

/**
 * El motivo de un error, en corto (§1.3), o `null` si no se conoce (JST-415: las conversaciones que lo cuentan solo salen
 * con un motivo conocido; sin él, las otras variantes no lo necesitan). La categoría sale del clasificador común
 * (`motivoError.ts`), el mismo de la voz, para que las dos digan lo mismo.
 */
export function motivoError(m: string | null): string | null {
  const c = categoriaError(m, null);
  return c ? TEXTO_ERROR[c] : null;
}

/** El motivo de una pausa, en corto, o `null` si no se sabe. `manual` (la pausaron a mano) es «Alguien le puso pausa.». */
export function motivoPausa(m: string | null): string | null {
  const t = (m ?? "").toLowerCase();
  if (/budget|presupuesto/.test(t)) return "Por presupuesto.";
  if (/approval|aprobaci/.test(t)) return "Espera una aprobación.";
  if (/paus|manual/.test(t)) return "Alguien le puso pausa.";
  return null;
}

// ---------------------------------------------------------------------------
// La tarea dentro del globo y cuánto dura cada frase
// ---------------------------------------------------------------------------

const sinPuntos = (t: string) => t.replace(/…$/, "").length;

/** El nombre de la tarea cortado a 34 letras por palabras, con «…» (las reglas del rótulo, JST-138 §1.2). */
export function cortarTarea(titulo: string, letras = LETRAS_TAREA): string {
  return cortarNombre(titulo, "letras", letras, sinPuntos);
}

/** El nombre (ya cortado a 34 letras) de la tarea de una frase, o `null`. */
export function tituloDe(l: Pick<Linea, "codigo" | "titulo">): string | null {
  return l.codigo && l.titulo ? cortarTarea(l.titulo) : null;
}

/**
 * Cuántas líneas ocupa `t` en `ancho` px si la primera ya tiene `usado` px
 * (el código va al comienzo de la línea de la tarea). Se parte en los espacios,
 * como el navegador. 99: una palabra no cabe en una línea.
 */
export function lineasDe(t: string, ancho: number, usado: number, medir: (s: string) => number): number {
  let n = 1;
  let linea = "";
  let lim = ancho - usado;
  for (const w of t.split(" ")) {
    const con = linea ? `${linea} ${w}` : w;
    if (medir(con) <= lim) {
      linea = con;
      continue;
    }
    if (!linea && n === 1 && usado > 0) {
      // Ni la primera palabra cabe después del código: baja entera a la línea siguiente.
      n += 1;
      lim = ancho;
      if (medir(w) <= lim) {
        linea = w;
        continue;
      }
      return 99;
    }
    if (!linea) return 99;
    n += 1;
    linea = w;
    lim = ancho;
    if (medir(w) > lim) return 99;
  }
  return n;
}

/**
 * El nombre de la tarea (ya cortado a 34 letras) que cabe en `lineas` líneas
 * del globo; si no cabe, cortado antes, por palabras (§1.4).
 */
export function nombreQueCabe(nombre: string, ancho: number, lineas: number, usado: number, medir: (s: string) => number): string {
  let c = nombre;
  for (;;) {
    if (lineasDe(c, ancho, usado, medir) <= lineas) return c;
    const menos = unCorteMenos(nombre, c);
    if (menos === null) return c;
    c = menos;
  }
}

/**
 * El corte que sigue a `actual` (el nombre ya cortado a 34 letras, o uno de
 * sus cortes): una palabra menos, con las mismas reglas. `null` si ya no se
 * puede acortar más.
 */
export function unCorteMenos(nombre: string, actual: string): string | null {
  const base = nombre.replace(/…$/, "");
  for (let k = sinPuntos(actual) - 1; k >= 1; k--) {
    const c = cortarTarea(base, k);
    if (c !== actual) return c;
  }
  return null;
}

/**
 * Cuánto dura una frase (§2.2): 2 s + 55 ms por letra (la frase, más el código
 * y el nombre cortado si lleva tarea), entre 2,5 y 5 s. Una frase suelta, 0,5 s
 * menos (mínimo 2,5 s).
 */
export function duracionFrase(l: Pick<Linea, "texto" | "codigo" | "titulo">, suelta = false): number {
  const nombre = tituloDe(l);
  const letras = l.texto.length + (l.codigo ? l.codigo.length + 2 + (nombre?.length ?? 0) : 0);
  const d = Math.max(2_500, Math.min(5_000, 2_000 + 55 * letras));
  return suelta ? Math.max(2_500, d - 500) : d;
}

/**
 * Qué frase se ve a los `t` ms de que se juntaron (§2.2): la primera 300 ms
 * después; cada una se queda su duración y 350 ms más, y recién entonces llega
 * la siguiente. No hay un momento sin globo entre dos frases. `indice` −1:
 * todavía ninguna. `fin`: ya pasaron todas. `cambia`: a los cuántos ms cambia.
 */
export function fraseEn(t: number, duraciones: readonly number[]): { indice: number; fin: boolean; cambia: number } {
  if (t < PRIMERA_FRASE_MS) return { indice: -1, fin: false, cambia: PRIMERA_FRASE_MS };
  let hasta = PRIMERA_FRASE_MS;
  for (let i = 0; i < duraciones.length; i++) {
    hasta += duraciones[i]! + ENTRE_FRASES_MS;
    if (t < hasta) return { indice: i, fin: false, cambia: hasta };
  }
  return { indice: -1, fin: true, cambia: Infinity };
}

// ---------------------------------------------------------------------------
// Las conversaciones (§1.3)
//
// JST-415: cada tema tiene 6 variantes o más, con aperturas y cierres distintos. Las frases son datos (`Renglon`), no
// código: así el plugin sabe de antemano todo lo que puede decir (el worker solo hace audios de eso, ver más abajo) y las
// plantillas con huecos (`{q}`, `{n}`…) se convierten solas en expresiones. Una frase con tarea lleva «esta» (o «esa»): en
// pantalla el código y el título van en la línea de abajo; en voz, `src/nombrarTarea.ts` pone la tarea en lugar de «esta».
// ---------------------------------------------------------------------------

/** Un agente con lo que se dice de él en esta conversación. */
interface Quien extends AgenteCharla {
  t: Temas | null;
  /** Su nombre para hablar; si es de otra empresa, con su empresa: «Ingeniero de Betalandia». */
  quien: string;
  corto: string;
  minRun: number;
  minEsperando: number;
}

interface Ctx extends Omit<ContextoCharla, "a" | "b" | "agentes"> {
  a: Quien;
  b: Quien;
  agentes: Quien[];
  /** Los demás: primero los de su sala, después el resto del piso. */
  terceros: Quien[];
  /** El nombre de las otras empresas del piso. */
  empresa: (prefijo: string) => string;
  /** Si este tema sobre esta persona se puede contar ya (§1.7: espera 10 min); al forzar un tema, siempre. */
  nuevo: (tema: Tema, id: string) => boolean;
  /** Al rearmar (0.6.0): la empresa de la que se habló, para no elegir otra al azar. */
  eleccion?: string;
}

/** Quién dice cada frase: «S» tiene el dato; «O» es el otro. */
type Rol = "S" | "O";
/**
 * Una frase: quién la dice, su texto (con `{huecos}`), la clave de la tarea que lleva (se busca en `Datos.c`) y «d» si es una
 * frase fija con un dato (el motivo de algo, cuántos en la cola…) para que la IA no la trate como una frase cualquiera.
 */
type Renglon = readonly [Rol, string, string?, "d"?];

interface Datos {
  S?: Quien;
  O?: Quien;
  /**
   * De quién se habla: el mismo tema sobre la misma persona espera 10 min
   * (§1.7). En «terminó», «cola», «revisión», «espera otra» y «rol», quien
   * tiene el dato (S); en «terminó 4», los dos.
   */
  sujeto?: string | readonly string[];
  /** Otro tema que esta conversación también cuenta (la respuesta de «rol» trae lo que terminó o su cola): sobre el mismo sujeto, también espera 10 min. */
  tambien?: Tema | null;
  /** Lo que reemplaza a cada `{hueco}` del texto. */
  v?: Readonly<Record<string, string>>;
  /** El código de la tarea de cada clave de las frases. */
  c?: Readonly<Record<string, string | null | undefined>>;
}

interface Variante {
  id: string;
  tema: Tema;
  si: (c: Ctx) => Datos | null | false | undefined;
  lin: readonly Renglon[];
}

const V: Variante[] = [];
const u = (id: string, tema: Tema, si: Variante["si"], lin: readonly Renglon[]) => V.push({ id, tema, si, lin });

/** Los que cuentan los contadores del encabezado: con filtro, solo las salas del filtro (JST-176). */
const contados = (c: Ctx) => (c.filtro?.length ? c.agentes.filter((x) => c.filtro!.includes(x.prefijo)) : c.agentes);

// --- Terminó algo (peso 5): de los dos, quien no lo contó en los últimos 10 min
const conHecho = (c: Ctx) => [c.a, c.b].filter((x) => x.t?.hecho && c.nuevo("termino", x.id));
const deHecho = (c: Ctx, f: (S: Quien) => Partial<Datos> | false = () => ({})) => {
  const S = conHecho(c)[0];
  if (!S) return null;
  const extra = f(S);
  return extra ? { S, sujeto: S.id, ...extra, c: { hecho: S.t!.hecho, ...(extra.c ?? {}) } } : null;
};
u("termino-1", "termino", (c) => deHecho(c), [
  ["S", "Terminé esta.", "hecho"],
  ["O", "Bien. ¿Fue complicado?"],
  ["S", "Tuvo lo suyo, pero salió."],
  ["O", "Una menos en el tablero."],
]);
// «Después viene esta.» cuenta también su cola.
u("termino-2", "termino", (c) => deHecho(c, (S) => S.t!.sigue?.estado === "todo" && { tambien: "cola", c: { sigue: S.t!.sigue.codigo } }), [
  ["S", "Por fin cerré esta.", "hecho"],
  ["O", "Buena. ¿Y qué viene ahora?"],
  ["S", "Después viene esta.", "sigue"],
]);
u("termino-3", "termino", (c) => deHecho(c, (S) => !S.t!.sigue && {}), [
  ["S", "Por fin cerré esta.", "hecho"],
  ["O", "¿Y ahora qué?"],
  ["S", "Nada en cola por ahora. Un cafecito."],
  ["O", "Te lo ganaste."],
]);
u("termino-4", "termino", (c) => deHecho(c), [
  ["O", "¿Cómo te fue con la última?"],
  ["S", "Bien, ya cerré esta.", "hecho"],
  ["O", "Me alegro."],
]);
u("termino-5", "termino", (c) => conHecho(c).length === 2 && { S: c.a, O: c.b, sujeto: [c.a.id, c.b.id], c: { hecho: c.a.t!.hecho, hecho2: c.b.t!.hecho } }, [
  ["S", "Cerré esta hace un rato.", "hecho"],
  ["O", "Yo también cerré esta.", "hecho2"],
  ["S", "Buena racha, entonces."],
]);
u("termino-6", "termino", (c) => deHecho(c), [
  ["O", "Vi que cerraste una tarea."],
  ["S", "Sí, esta.", "hecho"],
  ["O", "¿Cuánto te costó?"],
  ["S", "Menos de lo que pensaba."],
]);
u("termino-7", "termino", (c) => deHecho(c), [
  ["S", "Listo, esta ya salió.", "hecho"],
  ["O", "Se siente bien tachar una, ¿no?"],
  ["S", "Es lo mejor de la pega."],
]);
u("termino-8", "termino", (c) => deHecho(c), [
  ["O", "¿Terminaste algo?"],
  ["S", "Esta, la última que cerré.", "hecho"],
  ["O", "Bien ahí."],
]);

// --- Su cola (peso 3), en revisión (2) y espera otra (1): el tema de lo primero de su cola, según su estado
const TEMA_COLA: Readonly<Record<EstadoCola, Tema>> = { todo: "cola", in_review: "revision", blocked: "espera-otra" };
const conSigue = (c: Ctx, estado: EstadoCola) => [c.a, c.b].filter((x) => x.t?.sigue?.estado === estado && c.nuevo(TEMA_COLA[estado], x.id));
const deSigue = (c: Ctx, estado: EstadoCola, ok: (S: Quien) => boolean = () => true) => {
  const S = conSigue(c, estado).find(ok);
  return S ? { S, sujeto: S.id, c: { sigue: S.t!.sigue!.codigo } } : null;
};
const COLA = (c: Ctx, ok?: (S: Quien) => boolean) => deSigue(c, "todo", ok);
u("cola-1", "cola", (c) => COLA(c), [
  ["O", "¿Qué te toca ahora?"],
  ["S", "Esta, apenas me llamen.", "sigue"],
  ["O", "Te avisan, entonces."],
]);
u("cola-2", "cola", (c) => COLA(c), [
  ["S", "Me toca esta.", "sigue"],
  ["O", "¿Mucha pega por delante?"],
  ["S", "Lo justo, nada más."],
]);
u("cola-3", "cola", (c) => COLA(c, (x) => (x.t!.enCola ?? 0) >= 3), [
  ["O", "¿Tienes mucho en cola?"],
  ["S", "Tres, por lo menos.", undefined, "d"],
  ["O", "Uf. ¿Por cuál partes?"],
  ["S", "Por esta.", "sigue"],
]);
u("cola-4", "cola", (c) => COLA(c), [
  ["S", "Tengo esta esperando turno.", "sigue"],
  ["O", "¿Y cuándo arrancas?"],
  ["S", "Apenas me asignen el run."],
]);
u("cola-5", "cola", (c) => COLA(c), [
  ["O", "¿Qué sigue en tu lista?"],
  ["S", "Esta.", "sigue"],
  ["O", "Suena a buen plan."],
]);
u("cola-6", "cola", (c) => COLA(c), [
  ["S", "Voy con esta apenas pueda.", "sigue"],
  ["O", "¿Ya sabes por dónde partir?"],
  ["S", "Todavía no, pero ahí vamos."],
]);
u("cola-7", "cola", (c) => COLA(c), [
  ["S", "Tengo la cola ordenada: primero esta.", "sigue"],
  ["O", "Eso es tener método."],
]);
u("cola-8", "cola", (c) => COLA(c, (x) => x.t!.enCola === 2), [
  ["O", "¿Cuántas tienes pendientes?"],
  ["S", "Un par, nada más.", undefined, "d"],
  ["O", "Se lleva bien."],
]);
u("cola-9", "cola", (c) => COLA(c, (x) => x.t!.enCola === 1), [
  ["O", "¿Mucho por delante?"],
  ["S", "Una sola: esta.", "sigue", "d"],
  ["O", "Eso es poco."],
]);

const REV = (c: Ctx) => deSigue(c, "in_review");
u("revision-1", "revision", REV, [
  ["S", "Tengo esta en revisión.", "sigue"],
  ["O", "Ojalá pase a la primera."],
]);
u("revision-2", "revision", REV, [
  ["O", "¿En qué estás?"],
  ["S", "Esperando que revisen esta.", "sigue"],
  ["O", "Paciencia, ya llegará su turno."],
]);
u("revision-3", "revision", REV, [
  ["S", "Esta quedó en revisión.", "sigue"],
  ["O", "¿Quién revisa?"],
  ["S", "Eso se decide aparte."],
]);
u("revision-4", "revision", REV, [
  ["O", "¿Algo pendiente por tu lado?"],
  ["S", "Que revisen esta.", "sigue"],
  ["O", "Entonces toca esperar la revisión."],
]);
u("revision-5", "revision", REV, [
  ["S", "Esta pasó a revisión.", "sigue"],
  ["O", "¿Quedó bien?"],
  ["S", "Eso lo dirá la revisión."],
]);
u("revision-6", "revision", REV, [
  ["S", "Esta ya está en revisión.", "sigue"],
  ["O", "Entonces te queda respirar."],
]);

// «Espera otra» y «bloqueada» cuentan lo mismo (la tarea bloqueada de su cola): cada una marca a la otra con `tambien`, para que
// una no salga a continuación de la otra sobre la misma persona (JST-415). Un bloqueo no dice por qué (puede esperar a otra tarea,
// a una persona o a algo de afuera): ninguna frase afirma el motivo.
const OTRA = (c: Ctx) => {
  const d = deSigue(c, "blocked");
  return d && { ...d, tambien: "bloqueada" as const };
};
u("espera-otra-1", "espera-otra", OTRA, [
  ["S", "Esta quedó en espera.", "sigue"],
  ["O", "Entonces toca esperar."],
]);
u("espera-otra-2", "espera-otra", OTRA, [
  ["O", "¿Cómo va lo tuyo?"],
  ["S", "Parado: esta no puede avanzar.", "sigue"],
  ["O", "Qué lata, pero así es."],
]);
u("espera-otra-3", "espera-otra", OTRA, [
  ["S", "Esta no se mueve por ahora.", "sigue"],
  ["O", "¿Esperando a quién?"],
  ["S", "Eso se ve en la tarea."],
]);
u("espera-otra-4", "espera-otra", OTRA, [
  ["O", "¿Algo te frena?"],
  ["S", "Esta, por ahora.", "sigue"],
  ["O", "Mejor no forzar."],
]);
u("espera-otra-5", "espera-otra", OTRA, [
  ["S", "No puedo avanzar con esta.", "sigue"],
  ["O", "¿Falta algo?"],
  ["S", "Eso parece."],
  ["O", "Que se acomoden las piezas."],
]);
u("espera-otra-6", "espera-otra", OTRA, [
  ["S", "Mientras siga bloqueada, esta no avanza.", "sigue"],
  ["O", "Así son los bloqueos."],
]);

// --- Una tarea bloqueada (peso 3, JST-415): lo dice quien la tiene, con la tarea bloqueada de su cola
const BLOQ = (c: Ctx) => {
  const S = [c.a, c.b].find((x) => x.t?.bloqueada && c.nuevo("bloqueada", x.id));
  return S ? { S, sujeto: S.id, tambien: "espera-otra" as const, c: { bloq: S.t!.bloqueada!.codigo } } : null;
};
u("bloqueada-1", "bloqueada", BLOQ, [
  ["S", "Estoy trabado con esta.", "bloq"],
  ["O", "¿Qué te falta?"],
  ["S", "Que se destrabe."],
]);
u("bloqueada-2", "bloqueada", BLOQ, [
  ["O", "Te noto frenado."],
  ["S", "Sí, con esta no avanzo.", "bloq"],
  ["O", "¿Se puede destrabar?"],
  ["S", "Cuando se destrabe, sigo."],
]);
u("bloqueada-3", "bloqueada", BLOQ, [
  ["S", "Esta se bloqueó.", "bloq"],
  ["O", "¿Por qué?"],
  ["S", "Eso se ve en la tarea."],
  ["O", "Entonces, a esperar."],
]);
u("bloqueada-4", "bloqueada", BLOQ, [
  ["O", "¿Qué tienes bloqueado?"],
  ["S", "Esta.", "bloq"],
  ["O", "¿Alguien puede ayudarte?"],
  ["S", "Si la destraban, listo."],
]);
u("bloqueada-5", "bloqueada", BLOQ, [
  ["S", "Con esta no puedo avanzar.", "bloq"],
  ["O", "¿Tiene solución rápida?"],
  ["S", "Ojalá, ya veremos."],
]);
u("bloqueada-6", "bloqueada", BLOQ, [
  ["S", "Tengo una bloqueada, y es esta.", "bloq"],
  ["O", "Esas son las más pesadas."],
]);
u("bloqueada-7", "bloqueada", BLOQ, [
  ["O", "¿Cómo vas con lo bloqueado?"],
  ["S", "Sigo esperando por esta.", "bloq"],
  ["O", "Paciencia, entonces."],
]);

// --- Quién te espera (peso 4)
const QUE_ESPERA: Record<TipoEspera, string> = { tarjeta: "una respuesta", decision: "una decisión", aprobacion: "una aprobación", revision: "una revisión" };
const esperando = (c: Ctx) => c.terceros.filter((x) => x.need && x.espera?.codigo);
const algoDe = (x: Quien) => (x.espera?.tipo ? QUE_ESPERA[x.espera.tipo] : "una respuesta");
const dichoMin = (min: number) => duracionHablada(min * 60_000);
const ESPERA = (c: Ctx, ok: (x: Quien) => boolean = () => true) => {
  const X = esperando(c).find(ok);
  return X && { sujeto: X.id, v: { q: X.quien, algo: algoDe(X), dur: dichoMin(X.minEsperando) }, c: { espera: X.espera!.codigo } };
};
const MUCHO = (x: Quien) => x.minEsperando >= 60;
const VARIOS = (c: Ctx) => {
  const n = contados(c).filter((x) => x.need).length;
  return n >= 3 && { sujeto: "n", v: { n: String(n) } };
};
u("te-espera-1", "te-espera", (c) => ESPERA(c), [
  ["S", "{q} está esperando {algo}."],
  ["O", "¿Por esta?", "espera"],
  ["S", "Eso. Ojalá le contesten luego."],
]);
u("te-espera-2", "te-espera", (c) => ESPERA(c, MUCHO), [
  ["S", "{q} lleva {dur} esperando."],
  ["O", "¿Por cuál?"],
  ["S", "Por esta.", "espera"],
  ["O", "Se le está haciendo largo."],
]);
u("te-espera-3", "te-espera", VARIOS, [
  ["S", "Hay {n} esperando respuesta."],
  ["O", "Uf, harta cola."],
]);
u("te-espera-4", "te-espera", (c) => ESPERA(c), [
  ["O", "¿Viste que {q} necesita algo?"],
  ["S", "Sí, es por esta.", "espera"],
  ["O", "Que alguien lo atienda."],
]);
u("te-espera-5", "te-espera", (c) => ESPERA(c), [
  ["S", "{q} levantó la mano."],
  ["O", "¿Para qué?"],
  ["S", "Espera {algo}, por esta.", "espera"],
  ["O", "Alguien debería atender eso."],
]);
u("te-espera-6", "te-espera", (c) => ESPERA(c, MUCHO), [
  ["O", "{q} lleva un buen rato esperando."],
  ["S", "{dur}, ni más ni menos."],
  ["O", "Eso ya es harto."],
]);
u("te-espera-7", "te-espera", VARIOS, [
  ["O", "¿Cuántos esperan respuesta?"],
  ["S", "{n}, por lo que veo."],
  ["O", "Que alguien se ponga al día."],
]);

// --- A quién le falló algo (peso 4). Sin el motivo (no se conoce) hay variantes que no lo necesitan.
const conError = (c: Ctx) => c.terceros.filter((x) => x.st === "error");
const ERROR = (c: Ctx, ok: (x: Quien) => boolean = () => true) => {
  const X = conError(c).find(ok);
  // Sin tarea: el run que se ve del agente puede estar en cola y no ser el que falló, así que ninguna frase nombra una tarea.
  return X && { sujeto: X.id, v: { q: X.quien, mot: motivoError(X.motivo) ?? "" } };
};
const CON_MOTIVO = (x: Quien) => !!motivoError(x.motivo);
const DOS_ERRORES = (c: Ctx) => {
  const n = contados(c).filter((x) => x.st === "error").length;
  return n >= 2 && { sujeto: "n", v: { n: String(n) } };
};
u("error-1", "error", (c) => ERROR(c, CON_MOTIVO), [
  ["S", "A {q} le falló el run."],
  ["O", "¿Qué le pasó?"],
  ["S", "{mot}"],
  ["O", "Uf. Ojalá lo vean luego."],
]);
u("error-2", "error", (c) => ERROR(c), [
  ["O", "¿Viste que {q} tiene un error?"],
  ["S", "Sí, algo le falló."],
  ["O", "Ojalá se arregle luego."],
]);
u("error-3", "error", DOS_ERRORES, [
  ["S", "Hay {n} con error."],
  ["O", "Mal día para los runs."],
  ["S", "Habrá que mirar qué pasó."],
]);
u("error-4", "error", (c) => ERROR(c), [
  ["S", "{q} tiene un run con error."],
  ["O", "¿Se sabe por qué?"],
  ["S", "Eso hay que mirarlo en el detalle."],
  ["O", "Entonces, a mirar."],
]);
u("error-5", "error", (c) => ERROR(c), [
  ["S", "Falló lo que hacía {q}."],
  ["O", "¿Se sabe cuál era?"],
  ["S", "Eso hay que mirarlo en su detalle."],
]);
u("error-6", "error", (c) => ERROR(c), [
  ["O", "¿Quién está con error?"],
  ["S", "Es {q}, con un error."],
  ["O", "Ah, ya veo."],
]);
u("error-7", "error", (c) => ERROR(c, CON_MOTIVO), [
  ["S", "{q} paró con un error."],
  ["O", "¿Cuál fue?"],
  ["S", "{mot}"],
  ["O", "Podría ser peor."],
]);
u("error-8", "error", DOS_ERRORES, [
  ["O", "¿Hay más de uno con error?"],
  ["S", "Sí, {n}."],
  ["O", "Alguien tiene pega."],
]);

// --- Quién está en pausa (peso 1)
const enPausa = (c: Ctx) => c.terceros.filter((x) => x.st === "pausa");
const PAUSA = (c: Ctx, ok: (motivo: string | null) => boolean = () => true) => {
  const X = enPausa(c).find((x) => ok(motivoPausa(x.motivo)));
  return X && { sujeto: X.id, v: { q: X.quien, motp: motivoPausa(X.motivo) ?? "" } };
};
u("pausa-1", "pausa", (c) => PAUSA(c, (m) => !!m), [
  ["S", "{q} sigue en pausa."],
  ["O", "¿Y eso?"],
  ["S", "{motp}"],
  ["O", "Ya volverá."],
]);
u("pausa-2", "pausa", (c) => PAUSA(c), [
  ["O", "¿{q} no está trabajando?"],
  ["S", "No, está en pausa."],
  ["O", "Por algo será."],
]);
u("pausa-3", "pausa", (c) => PAUSA(c, (m) => m === "Alguien le puso pausa."), [
  ["S", "Alguien le puso pausa a {q}."],
  ["O", "Algo habrá visto."],
]);
u("pausa-4", "pausa", (c) => PAUSA(c), [
  ["O", "¿Qué pasa con {q}?"],
  ["S", "Está en pausa."],
  ["O", "Qué raro tanta quietud."],
]);
u("pausa-5", "pausa", (c) => PAUSA(c, (m) => m === "Por presupuesto."), [
  ["S", "{q} está en pausa por presupuesto."],
  ["O", "Las cuentas mandan."],
]);
u("pausa-6", "pausa", (c) => PAUSA(c, (m) => m === "Espera una aprobación."), [
  ["S", "{q} espera una aprobación para seguir."],
  ["O", "Entonces está en manos de la persona."],
]);
u("pausa-7", "pausa", (c) => PAUSA(c), [
  ["S", "{q} sigue en pausa."],
  ["O", "Un descanso más largo, nomás."],
  ["S", "Ojalá vuelva pronto."],
]);

// --- Cuántos trabajan (peso 2): el contador «trabajando»
const trabajando = (c: Ctx) => contados(c).filter((x) => x.st === "trabaja").length;
const TRABAJAN = (c: Ctx, min: number, max: number) => {
  const n = trabajando(c);
  return n >= min && n <= max && { v: { n: String(n), poc: n === 1 ? "Uno solo" : "Solo dos" } };
};
u("trabajan-1", "trabajan", (c) => TRABAJAN(c, 8, Infinity), [
  ["S", "Hay {n} trabajando ahora."],
  ["O", "Harta actividad."],
]);
u("trabajan-2", "trabajan", (c) => TRABAJAN(c, 8, Infinity), [
  ["O", "¿Mucha pega?"],
  ["S", "{n} trabajando, y nosotros acá."],
  ["O", "Alguien tiene que cuidar el sofá."],
]);
u("trabajan-3", "trabajan", (c) => TRABAJAN(c, 8, Infinity), [
  ["S", "Se mueve la oficina: {n} trabajando."],
  ["O", "Nosotros, de descanso."],
]);
u("trabajan-4", "trabajan", (c) => TRABAJAN(c, 3, 7), [
  ["S", "¿Cuántos están trabajando?"],
  ["O", "{n}. Un día normal."],
]);
u("trabajan-5", "trabajan", (c) => TRABAJAN(c, 3, 7), [
  ["O", "¿Cómo está el movimiento?"],
  ["S", "{n} en acción."],
  ["O", "Ni mucho ni poco."],
]);
u("trabajan-6", "trabajan", (c) => TRABAJAN(c, 3, 7), [
  ["S", "Van {n} trabajando."],
  ["O", "Se nota que hay ritmo."],
]);
u("trabajan-7", "trabajan", (c) => TRABAJAN(c, 1, 2), [
  ["S", "{poc} trabajando."],
  ["O", "Día tranquilo, entonces."],
]);
u("trabajan-8", "trabajan", (c) => TRABAJAN(c, 1, 2), [
  ["O", "¿Cómo está el piso?"],
  ["S", "Bastante quieto."],
  ["O", "Se agradece la calma."],
]);
u("trabajan-9", "trabajan", (c) => TRABAJAN(c, 1, 2), [
  ["S", "Queda poca gente en acción."],
  ["O", "Aprovechemos el silencio."],
]);
u("trabajan-10", "trabajan", (c) => TRABAJAN(c, 0, 0), [
  ["S", "Nadie está trabajando."],
  ["O", "Silencio total. Se escucha el refri."],
]);
u("trabajan-11", "trabajan", (c) => TRABAJAN(c, 0, 0), [
  ["O", "¿Hay alguien trabajando?"],
  ["S", "Ni un alma."],
  ["O", "Qué quietud."],
]);
u("trabajan-12", "trabajan", (c) => TRABAJAN(c, 0, 0), [
  ["S", "La oficina está en calma."],
  ["O", "Hasta el sofá se aburre."],
]);

// --- Cómo le va al otro en su rol (peso 2): la respuesta, de sus temas si están guardados
type EstadoRol = "sin" | "hecho" | "mucha" | "sigue" | "nada";
const estadoRol = (t: Temas | null): EstadoRol => (!t ? "sin" : t.hecho ? "hecho" : (t.enCola ?? 0) >= 3 ? "mucha" : t.sigue ? "sigue" : "nada");
/** Otro tema que también cuenta la respuesta: lo que terminó o su cola. */
const tambienRol = (t: Temas | null): Tema | null => {
  const e = estadoRol(t);
  return e === "hecho" ? "termino" : e === "mucha" ? "cola" : e === "sigue" ? TEMA_COLA[t!.sigue!.estado] : null;
};
const ROL = (estado: EstadoRol) => (c: Ctx) => {
  const S = c.b;
  if (estadoRol(S.t) !== estado) return null;
  return { S, O: c.a, sujeto: S.id, tambien: tambienRol(S.t), v: { rol: rolTema(S) }, c: { hecho: S.t?.hecho, sigue: S.t?.sigue?.codigo } };
};
u("rol-1", "rol", ROL("sin"), [
  ["O", "¿Cómo va {rol}?"],
  ["S", "Ahí vamos, de a poco."],
  ["O", "Eso es lo importante."],
]);
u("rol-2", "rol", ROL("hecho"), [
  ["O", "¿Cómo va {rol}?"],
  ["S", "Bien. Cerré esta.", "hecho"],
  ["O", "Excelente."],
]);
u("rol-3", "rol", ROL("mucha"), [
  ["O", "¿Y {rol}, cómo viene?"],
  ["S", "Harta pega: varias en cola.", undefined, "d"],
  ["O", "A ir de a una."],
]);
u("rol-4", "rol", ROL("sigue"), [
  ["O", "¿Cómo va {rol}?"],
  ["S", "Bien, con esta por delante.", "sigue"],
  ["O", "Me alegro."],
]);
u("rol-5", "rol", ROL("nada"), [
  ["O", "¿Cómo anda {rol}?"],
  ["S", "Tranqui. Sin nada en cola.", undefined, "d"],
  ["O", "Qué envidia."],
]);
u("rol-6", "rol", ROL("sin"), [
  ["O", "¿En qué andas con {rol}?"],
  ["S", "Viendo qué sale."],
  ["O", "Ya aparecerá algo."],
]);
u("rol-7", "rol", ROL("hecho"), [
  ["O", "¿Cómo viene {rol}?"],
  ["S", "Cerré esta.", "hecho"],
  ["O", "Eso se celebra."],
]);
u("rol-8", "rol", ROL("sigue"), [
  ["O", "¿Cómo viene {rol}?"],
  ["S", "Tengo esta por delante.", "sigue"],
  ["O", "Suerte con esa."],
]);

// --- Qué hace alguien de su sala (peso 2)
const enSuSala = (c: Ctx) => c.terceros.filter((x) => x.prefijo === c.prefijo && x.st === "trabaja" && x.run?.codigo);
const SALA = (c: Ctx, ok: (y: Quien) => boolean) => {
  const Y = enSuSala(c).find(ok);
  return Y && { sujeto: Y.id, v: { q: Y.corto, dur: dichoMin(Y.minRun) }, c: { run: Y.run!.codigo } };
};
const LLEVA = (y: Quien) => y.minRun >= 30 && !y.run!.enCola;
u("sala-1", "sala", (c) => SALA(c, LLEVA), [
  ["S", "{q} lleva {dur} con esta.", "run"],
  ["O", "Mejor no interrumpir."],
]);
u("sala-2", "sala", (c) => SALA(c, (y) => y.minRun < 5 && !y.run!.enCola && !!y.run!.desde), [
  ["S", "{q} recién empezó esta.", "run"],
  ["O", "Que le vaya bien."],
]);
u("sala-3", "sala", (c) => SALA(c, (y) => y.run!.enCola), [
  ["S", "{q} está en cola con esta.", "run"],
  ["O", "Le toca esperar su turno."],
]);
u("sala-4", "sala", (c) => SALA(c, (y) => !y.run!.enCola), [
  ["O", "¿En qué anda {q}?"],
  ["S", "En esta.", "run"],
  ["O", "Ah, buena."],
]);
u("sala-5", "sala", (c) => SALA(c, (y) => !y.run!.enCola), [
  ["S", "{q} está a full con esta.", "run"],
  ["O", "Ese ritmo da gusto."],
]);
u("sala-6", "sala", (c) => SALA(c, LLEVA), [
  ["O", "{q} lleva un buen rato con lo suyo."],
  ["S", "Va {dur} con esta.", "run"],
  ["O", "Qué constancia."],
]);
u("sala-7", "sala", (c) => SALA(c, (y) => !y.run!.enCola), [
  ["O", "¿Quién anda ocupado?"],
  ["S", "{q}, con esta.", "run"],
  ["O", "Entonces, silencio."],
]);

// --- Cómo están en otra empresa (peso 1): los contadores de esa sala
const OTRA_EMPRESA = (ok: (t: number, e: number) => boolean) => (c: Ctx) => {
  const otras = [...new Set(c.agentes.map((x) => x.prefijo))].filter((p) => p !== c.prefijo && c.empresa(p));
  if (otras.length === 0) return null;
  const p = c.eleccion && otras.includes(c.eleccion) ? c.eleccion : otras[Math.floor(c.azar() * otras.length)]!;
  const de = c.agentes.filter((x) => x.prefijo === p);
  const t = de.filter((x) => x.st === "trabaja").length;
  const e = de.filter((x) => x.need).length;
  return ok(t, e) ? { sujeto: p, v: { emp: c.empresa(p), n: String(t), esp: String(e) } } : null;
};
u("empresa-1", "empresa", OTRA_EMPRESA((t) => t === 0), [
  ["S", "¿Cómo están en {emp}?"],
  ["O", "Tranquilos. Nadie trabajando.", undefined, "d"],
  ["S", "Qué suerte."],
]);
u("empresa-2", "empresa", OTRA_EMPRESA((t, e) => t >= 3 && e > 0), [
  ["S", "¿Cómo están en {emp}?"],
  ["O", "{n} trabajando y {esp} esperando respuesta."],
  ["S", "Harta pega por allá."],
]);
u("empresa-3", "empresa", OTRA_EMPRESA((t, e) => t >= 1 && t <= 2 && e > 0), [
  ["S", "¿Cómo están en {emp}?"],
  ["O", "{n} trabajando y {esp} esperando respuesta."],
  ["S", "Poco movimiento, pero con gente esperando."],
]);
u("empresa-4", "empresa", OTRA_EMPRESA((t, e) => t >= 3 && e === 0), [
  ["S", "¿Cómo están en {emp}?"],
  ["O", "{n} trabajando."],
  ["S", "Se mueven bien."],
]);
u("empresa-5", "empresa", OTRA_EMPRESA((t, e) => t >= 1 && t <= 2 && e === 0), [
  ["S", "¿Cómo están en {emp}?"],
  ["O", "{n} trabajando."],
  ["S", "Mejor para ellos."],
]);
u("empresa-6", "empresa", OTRA_EMPRESA((t) => t > 0), [
  ["S", "¿Qué se sabe de {emp}?"],
  ["O", "Se mueven: {n} trabajando."],
  ["S", "Buena señal."],
]);
u("empresa-7", "empresa", OTRA_EMPRESA((t) => t > 0), [
  ["O", "Me dicen que en {emp} hay movimiento."],
  ["S", "¿Cuánto?"],
  ["O", "{n} trabajando."],
]);
u("empresa-8", "empresa", OTRA_EMPRESA((_t, e) => e > 0), [
  ["S", "En {emp} hay gente esperando respuesta."],
  ["O", "¿Cuántos?"],
  ["S", "Son {esp}."],
]);
u("empresa-9", "empresa", OTRA_EMPRESA((t) => t === 0), [
  ["O", "En {emp} está todo quieto."],
  ["S", "¿Nadie trabajando?"],
  ["O", "Nadie."],
]);

// --- La hora y el día (peso 1, JST-415): según el reloj del navegador, sin decir ninguna hora con números
const reloj = (c: Ctx) => {
  const f = new Date(c.reloj);
  return { dia: f.getDay(), h: f.getHours() };
};
const RELOJ = (ok: (dia: number, h: number) => boolean) => (c: Ctx) => {
  const { dia, h } = reloj(c);
  return ok(dia, h) && c.nuevo("reloj", "reloj") ? { sujeto: "reloj" } : null;
};
const LABORAL = (dia: number) => dia >= 1 && dia <= 5;
const LUNES_TEMPRANO = RELOJ((d, h) => d === 1 && h >= 6 && h < 12);
const VIERNES_TARDE = RELOJ((d, h) => d === 5 && h >= 15 && h < 21);
const ALMUERZO = RELOJ((d, h) => LABORAL(d) && h >= 12 && h < 15);
const DE_NOCHE = RELOJ((_d, h) => h >= 22 || h < 5);
u("reloj-1", "reloj", (c) => trabajando(c) > 0 && LUNES_TEMPRANO(c), [
  ["S", "Lunes temprano y ya hay movimiento."],
  ["O", "Los lunes arrancan con todo."],
]);
u("reloj-2", "reloj", LUNES_TEMPRANO, [
  ["O", "¿Cómo se siente el lunes?"],
  ["S", "Con ganas de que sea martes."],
  ["O", "Eso dicen todos."],
]);
u("reloj-3", "reloj", VIERNES_TARDE, [
  ["S", "Viernes en la tarde: toca cerrar la semana."],
  ["O", "Ojalá sin sorpresas."],
]);
u("reloj-4", "reloj", VIERNES_TARDE, [
  ["O", "Se acerca el fin de semana."],
  ["S", "Mejor no desplegar nada hoy."],
  ["O", "Ni en broma."],
]);
u("reloj-5", "reloj", ALMUERZO, [
  ["S", "Ya va siendo hora de almuerzo."],
  ["O", "Se nota en el estómago."],
]);
u("reloj-6", "reloj", ALMUERZO, [
  ["O", "¿Qué hay de almuerzo?"],
  ["S", "Lo que haya, con tal de comer."],
]);
u("reloj-7", "reloj", DE_NOCHE, [
  ["S", "Qué tarde se hizo."],
  ["O", "Para los agentes, la noche también es pega."],
]);
u("reloj-8", "reloj", DE_NOCHE, [
  ["O", "A esta hora ya debería haber silencio."],
  ["S", "Los agentes no dormimos."],
]);
u("reloj-9", "reloj", RELOJ((d, h) => d === 6 && h >= 5 && h < 22), [
  ["S", "Sábado y la oficina sigue abierta."],
  ["O", "Al menos se trabaja tranquilo."],
]);
u("reloj-10", "reloj", RELOJ((d, h) => d === 0 && h >= 5 && h < 22), [
  ["S", "Domingo en la oficina."],
  ["O", "Se siente el silencio."],
]);
u("reloj-11", "reloj", RELOJ((d, h) => (d === 0 || d === 6) && h >= 5 && h < 22), [
  ["S", "Fin de semana y aquí seguimos."],
  ["O", "Alguien tiene que prender las luces."],
]);
u("reloj-12", "reloj", RELOJ((d, h) => d >= 2 && d <= 5 && h >= 6 && h < 12), [
  ["S", "Buenos días, oficina."],
  ["O", "Buenos días. ¿Ya despertaron todos?"],
]);
u("reloj-13", "reloj", RELOJ((d, h) => d >= 1 && d <= 4 && h >= 15 && h < 21), [
  ["O", "Ya se va la tarde."],
  ["S", "Se pasó volando."],
]);
u("reloj-14", "reloj", RELOJ((d, h) => d === 3 && h >= 6 && h < 22), [
  ["S", "Miércoles: la mitad de la semana."],
  ["O", "Cuesta abajo desde aquí."],
]);

// --- Cuánto tardó (peso 2, JST-415): solo si se sabe cuándo empezó y cuándo terminó
const tardo = (x: Quien) => (x.t?.hecho && x.t.hechoEn != null ? duracionDeTarea(x.t.hechoInicio, x.t.hechoEn) : null);
const TARDO = (c: Ctx) => {
  const S = [c.a, c.b].find((x) => tardo(x) && c.nuevo("tardo", x.id));
  return S ? { S, sujeto: S.id, tambien: "termino" as const, v: { dur: tardo(S)! }, c: { hecho: S.t!.hecho } } : null;
};
u("tardo-1", "tardo", TARDO, [
  ["S", "Esa me tomó {dur}.", "hecho"],
  ["O", "Es bueno saberlo."],
]);
u("tardo-2", "tardo", TARDO, [
  ["O", "¿Cuánto te demoraste en esta?", "hecho"],
  ["S", "Fueron {dur}."],
  ["O", "Quedó anotado."],
]);
u("tardo-3", "tardo", TARDO, [
  ["S", "Terminé esta en {dur}.", "hecho"],
  ["O", "Gracias por el dato."],
]);
u("tardo-4", "tardo", TARDO, [
  ["S", "Me costó {dur} cerrar esta.", "hecho"],
  ["O", "¿Valió la pena?"],
  ["S", "Siempre vale cerrar una."],
]);
u("tardo-5", "tardo", TARDO, [
  ["O", "Esa que cerraste, ¿cuánto tomó?", "hecho"],
  ["S", "Fueron {dur}."],
  ["O", "Ya veo."],
]);
u("tardo-6", "tardo", TARDO, [
  ["S", "Calculo que esta me llevó {dur}.", "hecho"],
  ["O", "Cifra para el registro."],
]);
u("tardo-7", "tardo", TARDO, [
  ["S", "Entre una cosa y otra, {dur} en esta.", "hecho"],
  ["O", "Cada tarea tiene su ritmo."],
]);

// --- Una racha (peso 2, JST-415): varias terminadas hoy que la página vio por el canal en vivo (nada se lee de más)
export const MIN_RACHA_TERMINADAS = 3;
const RACHA = (c: Ctx) => {
  const S = [c.a, c.b].find((x) => (x.t?.racha ?? 0) >= MIN_RACHA_TERMINADAS && c.nuevo("racha", x.id));
  return S ? { S, sujeto: S.id, tambien: "termino" as const, v: { n: String(S.t!.racha) } } : null;
};
u("racha-1", "racha", RACHA, [
  ["S", "Ya van {n} que cierro hoy."],
  ["O", "Estás en racha."],
]);
u("racha-2", "racha", RACHA, [
  ["O", "Te veo cerrando una tras otra."],
  ["S", "Van {n} hoy."],
  ["O", "Que no pare la racha."],
]);
u("racha-3", "racha", RACHA, [
  ["S", "{n} cerradas y sigo."],
  ["O", "Eso es ritmo."],
]);
u("racha-4", "racha", RACHA, [
  ["O", "¿Cuántas llevas?"],
  ["S", "{n} cerradas hoy."],
  ["O", "Buen día de pega."],
]);
u("racha-5", "racha", RACHA, [
  ["S", "Hoy me salieron {n}."],
  ["O", "Qué productivo."],
]);
u("racha-6", "racha", RACHA, [
  ["S", "Llevo {n} tareas listas."],
  ["O", "Entonces te mereces el sofá."],
]);

// --- Una entrega (peso 3, JST-415): alguien de la pareja acaba de recibir o de pasar una tarea (la mesa y el sobre)
/** Una entrega cuenta como «reciente» este rato. */
export const ENTREGA_RECIENTE_MS = 15 * 60_000;
const ENTREGA = (rol: "recibe" | "pasa") => (c: Ctx) => {
  for (const S of [c.a, c.b]) {
    if (!c.nuevo("entrega", S.id)) continue;
    const e = (c.entregas ?? []).find((x) => (rol === "recibe" ? x.a : x.de) === S.id && c.reloj - x.en >= 0 && c.reloj - x.en <= ENTREGA_RECIENTE_MS);
    if (!e) continue;
    const otro = c.agentes.find((x) => x.id === (rol === "recibe" ? e.de : e.a));
    if (!otro) continue;
    return { S, O: S.id === c.a.id ? c.b : c.a, sujeto: S.id, v: { q: otro.quien }, c: { entrega: e.codigo } };
  }
  return null;
};
u("entrega-1", "entrega", ENTREGA("recibe"), [
  ["S", "{q} me pasó esta.", "entrega"],
  ["O", "¿Ya sabes por dónde empezar?"],
  ["S", "Primero me ubico."],
]);
u("entrega-2", "entrega", ENTREGA("recibe"), [
  ["O", "Vi que te llegó algo nuevo."],
  ["S", "Sí, esta.", "entrega"],
  ["O", "Que te rinda."],
]);
u("entrega-3", "entrega", ENTREGA("recibe"), [
  ["S", "Recibí esta hace un rato.", "entrega"],
  ["O", "¿Con prisa?"],
  ["S", "Con calma, pero sin pausa."],
]);
u("entrega-4", "entrega", ENTREGA("pasa"), [
  ["S", "Le pasé esta a {q}.", "entrega"],
  ["O", "¿Con instrucciones?"],
  ["S", "Las que van en la tarea."],
]);
u("entrega-5", "entrega", ENTREGA("pasa"), [
  ["O", "¿Qué pasó con esta?", "entrega"],
  ["S", "Quedó en manos de {q}."],
  ["O", "Mejor en buenas manos."],
]);
u("entrega-6", "entrega", ENTREGA("pasa"), [
  ["S", "Ya entregué esta.", "entrega"],
  ["O", "Una preocupación menos."],
]);
u("entrega-7", "entrega", ENTREGA("recibe"), [
  ["O", "¿Quién te pasó algo?"],
  ["S", "{q}, esta.", "entrega"],
  ["O", "Buena señal que se coordinen."],
]);

// --- Bromas fijas (§1.5): cuando no hay nada que contar, y 1 de cada 5 para variar
export { BROMAS };
BROMAS.forEach((l, i) => u(`broma-${i + 1}`, "broma", () => ({}), l.map(([rol, texto]) => [rol, texto] as const)));

/** Todas las variantes, para las pruebas. */
export const VARIANTES: ReadonlyArray<{ id: string; tema: Tema }> = V.map(({ id, tema }) => ({ id, tema }));

// ---------------------------------------------------------------------------
// Lo que la voz puede decir (0.6.0, JST-226; punto 8 del spike de JST-224)
// ---------------------------------------------------------------------------

export { SUELTAS, SUELTAS_CON_DATO, SUELTAS_CON_DATO_COLA, SUELTAS_CON_DATO_RECIEN, SUELTAS_GENERALES, SUELTAS_POR_ESTADO, DICEN, REACCIONES, MASCOTA_DE_REACCION, fraseDeMascota };
export type { EstadoSuelta, IdMascota, Reaccion };

/** Un nombre dentro de una frase («Ingeniero/a de Betalandia», «QA»): letras, números y pocos signos, hasta 80. */
export const NOMBRE_EN_FRASE = "[\\p{L}\\p{N}][\\p{L}\\p{N} .,'’/&+()\\-]{0,79}";
const NUM = "\\d{1,4}";
const esc = (t: string) => t.replace(/[\\^$.*+?()[\]{}|/]/g, "\\$&");
const alt = (xs: readonly string[]) => `(?:${[...new Set(xs)].map(esc).join("|")})`;

const ROLES: readonly string[] = [...new Set([...ROL_TEMA.map(([, t]) => t), ...Object.values(ROL_API), "la pega"])];
export const MOTIVOS_ERROR: readonly string[] = Object.values(TEXTO_ERROR);
export const MOTIVOS_PAUSA: readonly string[] = ["Por presupuesto.", "Espera una aprobación.", "Alguien le puso pausa."];
const QUE_ESPERA_TEXTOS = Object.values(QUE_ESPERA);
/** Lo que dice `duracionHablada` (`src/duracion.ts`): «un minuto», «12 minutos», «media hora», «una hora y media», «2 días». */
const DURACION = "(?:menos de un minuto|un minuto|\\d{1,3} minutos|media hora|una hora(?: y media)?|\\d{1,3} horas(?: y media)?|\\d{1,3} días)";

/** Qué puede ir en cada `{hueco}` de una frase y cómo se llama para la IA (`null`: la IA no lo ve como hueco; sus valores son fijos). */
const TIPOS_HUECO: Readonly<Record<string, { re: string; hueco: string | null }>> = {
  q: { re: NOMBRE_EN_FRASE, hueco: "agente" },
  emp: { re: NOMBRE_EN_FRASE, hueco: "empresa" },
  n: { re: NUM, hueco: "n" },
  esp: { re: NUM, hueco: "esperando" },
  // JST-415: una duración con su unidad («2 horas») tiene su propio hueco: con `{n}` la IA la trataba como una cantidad («Hay {n} esperando» → «Hay 2 horas esperando»).
  dur: { re: DURACION, hueco: "tiempo" },
  rol: { re: alt(ROLES), hueco: "rol" },
  algo: { re: alt(QUE_ESPERA_TEXTOS), hueco: null },
  mot: { re: alt(MOTIVOS_ERROR), hueco: null },
  motp: { re: alt(MOTIVOS_PAUSA), hueco: null },
  poc: { re: alt(["Uno solo", "Solo dos"]), hueco: null },
};

interface Plantilla {
  texto: string;
  re: RegExp;
  /** Qué hueco va en cada grupo `g0`, `g1`… */
  huecos: string[];
}

/** La expresión de una frase con `{huecos}`; `null` si no tiene (es fija). */
function compilar(texto: string): Plantilla | null {
  if (!/\{[a-z]+\}/.test(texto)) return null;
  const huecos: string[] = [];
  const re = texto
    .split(/(\{[a-z]+\})/)
    .map((p) => {
      const m = /^\{([a-z]+)\}$/.exec(p);
      if (!m) return esc(p);
      const tipo = TIPOS_HUECO[m[1]!];
      if (!tipo) throw new Error(`Hueco desconocido {${m[1]}} en «${texto}»`);
      huecos.push(m[1]!);
      return `(?<g${huecos.length - 1}>${tipo.re})`;
    })
    .join("");
  return { texto, re: new RegExp(`^${re}$`, "u"), huecos };
}

const PLANTILLAS_TODAS: Plantilla[] = [];
const FIJAS_DE_VARIANTES = new Set<string>();
/** Frases fijas que traen un dato sin código ni número (cuántos en la cola, el motivo…). */
const FIJAS_CON_DATO = new Set<string>();
{
  const vistas = new Set<string>();
  for (const x of V) {
    for (const [, texto, , d] of x.lin) {
      const p = compilar(texto);
      if (p) {
        if (!vistas.has(texto)) PLANTILLAS_TODAS.push(p);
        vistas.add(texto);
      } else {
        FIJAS_DE_VARIANTES.add(texto);
        if (d === "d") FIJAS_CON_DATO.add(texto);
      }
    }
  }
}

/**
 * Las frases fijas de las conversaciones, una por una (sin nombres ni números). El worker solo hace audios de lo que puede
 * rearmar: estas, las plantillas de abajo y las bromas. Salen solas de las variantes de arriba: nada que mantener aparte
 * (`tests/vozOficina.spec.ts` arma miles de conversaciones al azar y revisa que todo esté aquí).
 */
export const FRASES_FIJAS: ReadonlySet<string> = new Set([...FIJAS_DE_VARIANTES, ...BROMAS.flatMap((b) => b.map(([, t]) => t))]);

/** Las frases con un nombre o un número (las de arriba con `{huecos}`), como expresiones. */
export const PLANTILLAS: readonly RegExp[] = PLANTILLAS_TODAS.map((p) => p.re);

/** Los datos que reemplazan los huecos de una apertura generada por la IA. */
export interface AperturaRellena {
  plantilla: string;
  datos: Readonly<Record<string, string>>;
}

export const huecosDe = (plantilla: string): string[] => [...plantilla.matchAll(/\{([a-z]+)\}/g)].map((m) => m[1]!);

const plantillaDe = (texto: string): { p: Plantilla; grupos: Record<string, string> } | null => {
  for (const p of PLANTILLAS_TODAS) {
    const m = p.re.exec(texto);
    if (m) return { p, grupos: { ...m.groups } as Record<string, string> };
  }
  return null;
};

/** La apertura de hoy como plantilla y los valores actuales de sus huecos. */
export function aperturaDe(l: Pick<Linea, "texto" | "codigo">): AperturaRellena {
  let plantilla = l.texto;
  const datos: Record<string, string> = {};
  const poner = (nombre: string, valor: string) => {
    if (datos[nombre] !== undefined) return;
    datos[nombre] = valor;
    plantilla = plantilla.replace(valor, `{${nombre}}`);
  };
  const t = plantillaDe(l.texto);
  if (t) {
    t.p.huecos.forEach((tipo, i) => {
      const hueco = TIPOS_HUECO[tipo]!.hueco;
      const valor = t.grupos[`g${i}`];
      if (hueco && valor) poner(hueco, valor);
    });
  }
  if (l.codigo) {
    const tarea = l.texto.match(DEMOSTRATIVO)?.[0];
    if (tarea) poner("tarea", tarea);
  }
  return { plantilla, datos };
}

/** El «esta» o «esa» de una frase con tarea (no «está»): lo que reemplaza el hueco `{tarea}`. */
const DEMOSTRATIVO = /(?<![\p{L}\p{N}])(?:esta|esa)(?![\p{L}\p{N}])/iu;

export function rellenarHuecos(plantilla: string, datos: Readonly<Record<string, string>>): string | null {
  let texto = plantilla;
  for (const h of new Set(huecosDe(plantilla))) {
    const valor = datos[h];
    if (typeof valor !== "string") return null;
    texto = texto.replaceAll(`{${h}}`, (_hueco, offset: number) => {
      if (h !== "tarea" || /(?:^|[.!?…]\s+)[¿¡]*$/.test(texto.slice(0, offset))) return valor;
      return valor.toLocaleLowerCase("es");
    });
  }
  return huecosDe(texto).length ? null : texto;
}

/** Rellena una apertura revisada con los datos de la conversación de ahora. */
export function rellenarApertura(plantilla: string, l: Pick<Linea, "texto" | "codigo">): { texto: string; apertura: AperturaRellena } | null {
  const actual = aperturaDe(l);
  const orden = (xs: readonly string[]) => [...new Set(xs)].sort().join(",");
  if (orden(huecosDe(plantilla)) !== orden(huecosDe(actual.plantilla))) return null;
  const texto = rellenarHuecos(plantilla, actual.datos);
  return texto === null ? null : { texto, apertura: { plantilla, datos: actual.datos } };
}

/** Una frase de conversación que el plugin pudo haber armado: fija o de una plantilla. Lo demás, el worker lo rechaza. */
export function fraseDeCharla(texto: string): boolean {
  return FRASES_FIJAS.has(texto) || PLANTILLAS.some((re) => re.test(texto));
}

/** Una frase suelta que el plugin pudo haber armado (§1.6). */
export function fraseSuelta(texto: string): boolean {
  return SUELTAS.includes(texto) || SUELTAS_CON_DATO.includes(texto);
}

// ---------------------------------------------------------------------------
// El final que escribe la IA de Chrome (0.7.0, JST-232; puntos 4 y 10 del spike de JST-230)
// ---------------------------------------------------------------------------

/**
 * Una frase de hoy con un dato: con tarea, con un número, con un nombre (una plantilla con huecos), una de las fijas que
 * traen un dato sin código ni número (cuántos hay en la cola, «Nadie trabajando»…, marcadas en las variantes) o una de las
 * frases del prompt v4 del spike.
 */
export function conDato(l: Pick<Linea, "texto" | "codigo">): boolean {
  return !!l.codigo || /\d/.test(l.texto) || FIJAS_CON_DATO.has(l.texto) || plantillaDe(l.texto) !== null;
}

/** Hasta cuántas frases en total tiene una conversación con el final de la IA. */
export const MAX_FRASES_IA = 4;

/**
 * Cuántas frases de hoy quedan fijas (v4 del spike): hasta la última que trae
 * un dato y, si esa es una pregunta, también su respuesta (regla 1 del punto
 * 4: «¿Por esta?» no lo contesta la IA). 0: no trae ningún dato (una broma).
 */
export function fijasDe(lineas: readonly Pick<Linea, "texto" | "codigo">[]): number {
  let k = -1;
  lineas.forEach((l, i) => {
    if (conDato(l)) k = i;
  });
  if (k < 0) return 0;
  if (/\?$/.test(lineas[k]!.texto) && k + 1 < lineas.length) k += 1;
  return k + 1;
}

/** Cómo se lee un número en la clave: lo que cambia la reacción (nadie, uno o dos, unos pocos, muchos). */
const cubeta = (n: number) => (n === 0 ? "0" : n < 3 ? "1" : n < 8 ? "3" : "8");

/**
 * La clave de la reserva de finales (punto 10 del spike): la variante y lo que
 * dicen sus frases fijas, con los nombres y los números de las plantillas
 * borrados. Un final escrito para «A CEO le falló el run. / ¿Qué le pasó? /
 * Se quedó sin cupo, parece.» le sirve a cualquiera con ese mismo motivo.
 * `null`: una frase que no es del plugin (no lleva final de la IA).
 */
export function claveDeFinal(variante: string, fijas: readonly Pick<Linea, "texto">[]): string | null {
  const partes: string[] = [];
  for (const l of fijas) {
    if (FRASES_FIJAS.has(l.texto)) {
      partes.push(l.texto);
      continue;
    }
    const t = plantillaDe(l.texto);
    if (!t) return null;
    // Los valores que no son datos (el motivo de un error, qué espera alguien) quedan en la clave; los nombres y los números, no.
    let id = t.p.texto;
    t.p.huecos.forEach((tipo, i) => {
      if (TIPOS_HUECO[tipo]!.hueco === null) id = id.replace(`{${tipo}}`, t.grupos[`g${i}`]!);
    });
    partes.push(`P[${id}](${(l.texto.match(/\d+/g) ?? []).map((d) => cubeta(Number(d))).join(",")})`);
  }
  return `${variante}|${partes.join("/")}`;
}

/** Lo que el Guionista necesita de la IA (la reserva de `src/ia/reserva.ts`): sin la IA, `null`. */
export interface FuenteIa {
  /** Una apertura con los mismos huecos de la variante, o `null`. */
  apertura(variante: string, azar: () => number): string | null;
  /** Un final escrito para esa clave (1 o 2 frases), que no sea `evitar`, o `null`. */
  final(clave: string, azar: () => number, evitar: string | null): readonly string[] | null;
  /** Una frase suelta escrita por la IA que no esté en `recientes`, o `null`. */
  suelta(azar: () => number, recientes: readonly string[]): string | null;
  /** Una broma completa (2 frases), o `null`. */
  broma(azar: () => number): readonly string[] | null;
  /** Algo nuevo que dice esa mascota, o `null`. */
  mascota(id: IdMascota, azar: () => number): string | null;
  /** Si ese texto exacto ya se mostró en la última hora. */
  dicha(texto: string): boolean;
  /** Lo que la vida mostró; `ia` identifica las frases generadas para calcular el contador. */
  usado?(tipo: "final" | "suelta" | "mascota", lineas: readonly Linea[], variante: string | null, sala: string, ia?: FinalIa): void;
}

/** Lo que la IA escribió en una conversación (para volver a armarla igual antes de leerla con voz). */
export interface FinalIa {
  clave: string | null;
  /** Cuántas frases de hoy quedaron fijas, incluida la apertura reemplazada. */
  fijas: number;
  frases: readonly string[];
  apertura?: string;
  broma?: boolean;
}

/** Lo que se le muestra a la IA: la apertura con huecos y las frases fijas que siguen. */
export interface MuestraFinal {
  clave: string;
  variante: string;
  apertura: string;
  fijas: readonly Linea[];
}

/** Las frases fijas y, después, las del final de la IA: quién dice cada una lo pone el código (se turnan desde la última fija). */
export function unirFinal(fijas: readonly Linea[], frases: readonly string[], a: string, b: string): Linea[] {
  let q = fijas.at(-1)?.quien ?? b;
  return [
    ...fijas,
    ...frases.map((texto): Linea => {
      q = q === a ? b : a;
      return { quien: q, texto, codigo: null, titulo: null };
    }),
  ];
}

// ---------------------------------------------------------------------------
// Elegir sin repetir (§1.7)
// ---------------------------------------------------------------------------

export const PESO: Readonly<Record<Tema, number>> = {
  termino: 5,
  "te-espera": 4,
  error: 4,
  cola: 3,
  bloqueada: 3,
  entrega: 3,
  revision: 2,
  trabajan: 2,
  rol: 2,
  sala: 2,
  tardo: 2,
  racha: 2,
  broma: 2,
  "espera-otra": 1,
  pausa: 1,
  empresa: 1,
  reloj: 1,
};
/** Cada variante espera 8 conversaciones del piso; un tema, 2 de su sala; el mismo tema sobre la misma persona, 10 min. */
export const NO_VARIANTE = 8;
export const NO_TEMA_SALA = 2;
export const NO_SUJETO_MS = 10 * 60_000;
/** 1 de cada 5 es broma aunque haya temas. */
export const BROMA_AL_AZAR = 1 / 5;
/** Una frase suelta fija no vuelve en las 5 siguientes; 1 de cada 3 sale de sus temas guardados. */
export const NO_SUELTA = 5;
export const SUELTA_CON_DATO = 1 / 3;

function barajar<T>(lista: readonly T[], azar: () => number): T[] {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const minutosDesde = (iso: string | null | undefined, reloj: number) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? 0 : Math.max(0, (reloj - t) / 60_000);
};

/** Lo que cuenta una conversación, «tema:sujeto»: su tema y el que también cuenta, por cada sujeto. */
const claves = (x: Variante, d: Datos): string[] => {
  const sujetos = d.sujeto === undefined ? [] : typeof d.sujeto === "string" ? [d.sujeto] : d.sujeto;
  const temas = d.tambien ? [x.tema, d.tambien] : [x.tema];
  return sujetos.flatMap((s) => temas.map((t) => `${t}:${s}`));
};

/**
 * Elige qué se dice y recuerda lo dicho, para que no se repita seguido. Hay uno
 * por piso (la vida de la página, la del TV): la memoria no se comparte.
 */
export class Guionista {
  private variantes: string[] = [];
  private readonly porSala = new Map<string, Tema[]>();
  private readonly sujetos = new Map<string, number>();
  private mazoBromas: string[] = [];
  private ultimaBroma: string | null = null;
  private sueltasDichas: string[] = [];
  /** Lo último que dijo cada mascota («t:gato» al tocarla, «r:gato» al reaccionar): no repite la anterior (JST-415). */
  private readonly ultimaMascota = new Map<string, string>();
  /** 0.7.0: la reserva de la IA de Chrome (`null`: las frases de siempre) y el último final dicho de cada clave. */
  private ia: FuenteIa | null = null;
  /** Con la IA elegida, lo ya dicho también frena las fijas mientras el modelo carga (JST-369). */
  private memoriaIa: FuenteIa["dicha"] | null = null;
  private readonly ultimoFinal = new Map<string, string>();

  /** Con la IA lista y elegida se usan primero sus variantes; `null`, no genera con IA. La memoria se configura aparte. */
  fijarIa(fuente: FuenteIa | null): void {
    this.ia = fuente;
  }

  fijarMemoriaIa(dicha: FuenteIa["dicha"] | null): void {
    this.memoriaIa = dicha;
  }

  private fueDicha(texto: string): boolean {
    return this.ia ? this.ia.dicha(texto) : (this.memoriaIa?.(texto) ?? false);
  }

  /** Si se contó hace menos de 10 min (§1.7). */
  private dicho(clave: string, ahora: number): boolean {
    return (this.sujetos.get(clave) ?? -Infinity) > ahora - NO_SUJETO_MS;
  }

  private preparar(ctx: ContextoCharla, forzar: Tema | null): Ctx {
    const empresas = new Map<string, string>();
    for (const x of ctx.agentes) if (x.empresa && !empresas.has(x.prefijo)) empresas.set(x.prefijo, x.empresa);
    const quien = (x: AgenteCharla): Quien => {
      const corto = nombreDeCharla(x.nombre);
      return {
        ...x,
        t: ctx.temas(x.id),
        corto,
        quien: x.prefijo !== ctx.prefijo && x.empresa ? `${corto} de ${x.empresa}` : corto,
        minRun: x.st === "trabaja" ? minutosDesde(x.run?.desde, ctx.reloj) : 0,
        minEsperando: x.need ? minutosDesde(x.espera?.desde, ctx.reloj) : 0,
      };
    };
    const agentes = ctx.agentes.map(quien);
    const a = agentes.find((x) => x.id === ctx.a.id) ?? quien(ctx.a);
    const b = agentes.find((x) => x.id === ctx.b.id) ?? quien(ctx.b);
    const otros = agentes.filter((x) => x.id !== a.id && x.id !== b.id);
    return {
      ...ctx,
      a,
      b,
      agentes,
      terceros: [...otros.filter((x) => x.prefijo === ctx.prefijo), ...otros.filter((x) => x.prefijo !== ctx.prefijo)],
      empresa: (p) => empresas.get(p) ?? "",
      nuevo: (tema, id) => !!forzar || !this.dicho(`${tema}:${id}`, ctx.ahora),
    };
  }

  /** Las variantes que se pueden decir ahora, con sus datos. `forzar`: solo ese tema (pruebas y banco). */
  private candidatas(c: Ctx, forzar: Tema | null): Array<{ x: Variante; d: Datos }> {
    const recientes = (this.porSala.get(c.prefijo) ?? []).slice(-NO_TEMA_SALA);
    const ultimas = this.variantes.slice(-NO_VARIANTE);
    const out: Array<{ x: Variante; d: Datos }> = [];
    for (const x of V) {
      if (forzar && x.tema !== forzar) continue;
      if (!forzar && x.tema !== "broma" && recientes.includes(x.tema)) continue;
      if (ultimas.includes(x.id)) continue;
      const d = x.si(c);
      if (!d) continue;
      if (!forzar && claves(x, d).some((k) => this.dicho(k, c.ahora))) continue;
      const lineas = this.lineasDe(x, d, c);
      if (!lineas || lineas.some((l) => this.fueDicha(l.texto))) continue;
      out.push({ x, d });
    }
    return out;
  }

  /** La próxima broma del mazo barajado (todas antes de repetir; nunca la misma 2 veces seguidas), entre las que se pueden decir. */
  private broma(posibles: ReadonlyArray<{ x: Variante; d: Datos }>, azar: () => number): { x: Variante; d: Datos } | null {
    if (posibles.length === 0) return null;
    for (let k = 0; k < BROMAS.length * 2; k++) {
      if (this.mazoBromas.length === 0) this.mazoBromas = barajar(BROMAS.map((_, i) => `broma-${i + 1}`), azar);
      const id = this.mazoBromas.shift()!;
      const o = posibles.find((p) => p.x.id === id);
      if (o && id !== this.ultimaBroma) return o;
      // La que no se puede decir ahora (se dijo hace poco) vuelve al final del mazo: sale antes de barajar otra vez.
      this.mazoBromas.push(id);
    }
    return posibles.find((p) => p.x.id !== this.ultimaBroma) ?? null;
  }

  /**
   * Una conversación entre `a` y `b` (§1.1): primero el tema, al azar según su
   * peso, y después una variante al azar del tema. Si no hay nada que contar,
   * o 1 de cada 5, una broma. `null` si no hay ninguna posible.
   */
  armar(ctx: ContextoCharla, forzar: Tema | null = null): Guion | null {
    const c = this.preparar(ctx, forzar);
    const todas = this.candidatas(c, forzar);
    const bromas = todas.filter((o) => o.x.tema === "broma");
    const temas = todas.filter((o) => o.x.tema !== "broma");
    let elegida: { x: Variante; d: Datos } | null = null;
    const quiereBroma = forzar === "broma" || temas.length === 0 || (!forzar && c.azar() < BROMA_AL_AZAR);
    if (quiereBroma) elegida = this.broma(bromas, c.azar);
    if (!elegida && temas.length > 0) {
      const lista = [...new Set(temas.map((o) => o.x.tema))];
      const total = lista.reduce((s, t) => s + PESO[t], 0);
      let r = c.azar() * total;
      let tema = lista[lista.length - 1]!;
      for (const t of lista) {
        r -= PESO[t];
        if (r < 0) {
          tema = t;
          break;
        }
      }
      const delTema = temas.filter((o) => o.x.tema === tema);
      elegida = delTema[Math.floor(c.azar() * delTema.length)]!;
    }
    if (!elegida) return null;
    const { x, d } = elegida;
    const deHoy = this.lineasDe(x, d, c);
    if (!deHoy || deHoy.length < 2) return null;
    const { lineas, ia } = this.conFinal(x, deHoy, c);
    this.variantes.push(x.id);
    if (this.variantes.length > 50) this.variantes = this.variantes.slice(-NO_VARIANTE);
    const sala = this.porSala.get(c.prefijo) ?? [];
    if (x.tema !== "broma") this.porSala.set(c.prefijo, [...sala, x.tema].slice(-NO_TEMA_SALA));
    for (const k of claves(x, d)) this.sujetos.set(k, c.ahora);
    if (x.tema === "broma") this.ultimaBroma = x.id;
    return { tema: x.tema, variante: x.id, lineas, ...(d.sujeto !== undefined ? { sujeto: d.sujeto } : {}), ...(ia ? { ia } : {}) };
  }

  /** Apertura con huecos y final de la reserva; lo que no tenga variante queda como hoy. */
  private conFinal(x: Variante, lineas: Linea[], c: Ctx): { lineas: Linea[]; ia?: FinalIa } {
    if (!this.ia) return { lineas };
    if (x.tema === "broma") {
      const broma = this.ia.broma(c.azar);
      if (!broma || broma.length === 0) return { lineas };
      let q = c.b.id;
      const generadas = broma.map((texto): Linea => {
        q = q === c.a.id ? c.b.id : c.a.id;
        return { quien: q, texto, codigo: null, titulo: null };
      });
      return { lineas: generadas, ia: { clave: null, fijas: 0, frases: [...broma], broma: true } };
    }
    const n = fijasDe(lineas);
    if (n === 0) return { lineas };
    const apertura = this.ia.apertura(x.id, c.azar);
    const rellena = apertura ? rellenarApertura(apertura, lineas[0]!) : null;
    const clave = n < MAX_FRASES_IA ? claveDeFinal(x.id, lineas.slice(0, n)) : null;
    const pedido = clave ? this.ia.final(clave, c.azar, this.ultimoFinal.get(clave) ?? null) : null;
    const frases = pedido && n + pedido.length <= MAX_FRASES_IA ? pedido : [];
    if (!rellena && frases.length === 0) return { lineas };
    const fijas = lineas.slice(0, n);
    if (rellena) fijas[0] = { ...fijas[0]!, texto: rellena.texto, aperturaIa: rellena.apertura };
    if (clave && frases.length) this.ultimoFinal.set(clave, frases.join(" "));
    return {
      lineas: unirFinal(fijas, frases, c.a.id, c.b.id),
      ia: { clave, fijas: n, frases: [...frases], ...(rellena ? { apertura: apertura! } : {}) },
    };
  }

  /** Una muestra por variante que se puede decir: su apertura con huecos, las fijas y la clave del final. */
  muestras(ctx: ContextoCharla): MuestraFinal[] {
    const c = this.preparar(ctx, "termino");
    const out: MuestraFinal[] = [];
    for (const x of V) {
      if (x.tema === "broma") continue;
      const d = x.si(c);
      if (!d) continue;
      const lineas = this.lineasDe(x, d, c);
      if (!lineas) continue;
      const n = fijasDe(lineas);
      if (lineas.length < 2 || n === 0) continue;
      const clave = claveDeFinal(x.id, lineas.slice(0, n));
      if (clave) out.push({ clave, variante: x.id, apertura: aperturaDe(lineas[0]!).plantilla, fijas: lineas.slice(0, n) });
    }
    return out;
  }

  /**
   * Las frases de una variante con sus datos: quién dice cada una y la tarea de la línea de abajo. `null` si falta un
   * dato (un hueco sin valor o una tarea sin código): esa variante no se puede decir.
   */
  private lineasDe(x: Variante, d: Datos, c: Ctx): Linea[] | null {
    const S = d.S ?? c.a;
    const O = d.O ?? (S.id === c.a.id ? c.b : c.a);
    const out: Linea[] = [];
    for (const [rol, plantilla, clave] of x.lin) {
      const texto = rellenarHuecos(plantilla, d.v ?? {});
      if (texto === null || texto.trim() === "") return null;
      const cod = clave ? (d.c?.[clave] ?? null) : null;
      if (clave && !cod) return null;
      out.push({ quien: (rol === "S" ? S : O).id, texto, codigo: cod, titulo: cod ? this.tituloDe(c, cod) : null });
    }
    return out;
  }

  /**
   * La misma conversación con los datos de ahora (0.6.0, JST-226): la que se
   * preparó un minuto antes para leerla con voz se revisa antes de empezar. No
   * recuerda nada (ya se recordó al armarla). `null` si esa variante ya no se
   * puede decir; si lo que dice cambió, la vida la descarta.
   */
  rearmar(ctx: ContextoCharla, g: Guion): Guion | null {
    const x = V.find((v) => v.id === g.variante);
    if (!x) return null;
    const c = this.preparar(ctx, x.tema);
    // De quien se habló: el mismo (si no, «terminó algo» podría elegir al otro de la pareja), y la misma empresa.
    if (g.sujeto !== undefined) {
      const sujetos = typeof g.sujeto === "string" ? [g.sujeto] : g.sujeto;
      c.nuevo = (_tema, id) => sujetos.includes(id);
      if (typeof g.sujeto === "string") c.eleccion = g.sujeto;
    }
    const d = x.si(c);
    if (!d) return null;
    const lineas = this.lineasDe(x, d, c);
    if (!lineas || lineas.length < 2) return null;
    const sujeto = d.sujeto !== undefined ? { sujeto: d.sujeto } : {};
    if (!g.ia) return { tema: x.tema, variante: x.id, lineas, ...sujeto };
    // La misma broma, apertura y final de la IA; sin la IA elegida, se descarta.
    if (!this.ia) return null;
    if (g.ia.broma) return { tema: x.tema, variante: x.id, lineas: g.lineas.map((l) => ({ ...l })), ...sujeto, ia: g.ia };
    const { clave, fijas, frases, apertura } = g.ia;
    if (fijasDe(lineas) !== fijas || (clave !== null && claveDeFinal(x.id, lineas.slice(0, fijas)) !== clave)) return null;
    const fijasAhora = lineas.slice(0, fijas);
    if (apertura) {
      const rellena = rellenarApertura(apertura, lineas[0]!);
      if (!rellena) return null;
      fijasAhora[0] = { ...fijasAhora[0]!, texto: rellena.texto, aperturaIa: rellena.apertura };
    }
    return { tema: x.tema, variante: x.id, lineas: unirFinal(fijasAhora, frases, c.a.id, c.b.id), ...sujeto, ia: g.ia };
  }

  /** El nombre de una tarea: el de los temas guardados (que lo traen) o el que la página ya conoce. */
  private tituloDe(c: Ctx, codigo: string): string | null {
    for (const x of [c.a, c.b]) {
      if (x.t?.hecho === codigo && x.t.tituloHecho) return x.t.tituloHecho;
      if (x.t?.sigue?.codigo === codigo && x.t.sigue.titulo) return x.t.sigue.titulo;
      if (x.t?.bloqueada?.codigo === codigo && x.t.bloqueada.titulo) return x.t.bloqueada.titulo;
    }
    return c.titulo(codigo);
  }

  /**
   * Una frase suelta para alguien solo en el descanso (§1.6): 1 de cada 3, de
   * sus temas guardados (sin leer nada); si no, de las fijas. JST-415: `estados` (cómo está quien habla: libre hace mucho,
   * recién terminó, hay quien espera a la persona, tiene cola) elige frases de su estado (6 de cada 10 veces) y deja las
   * con tarea solo para quien terminó hace poco o tiene cola; sin `estados`, no se mira (como antes). Con la IA elegida no
   * se repite nada dicho en la hora: sin otra variante, se calla.
   */
  suelta(quien: string, temas: Temas | null, azar: () => number, titulo: (codigo: string) => string | null = () => null, estados?: ReadonlySet<EstadoSuelta>): Linea | null {
    if (this.ia) {
      const t = this.ia.suelta(azar, this.sueltasDichas.slice(-NO_SUELTA));
      if (t) {
        this.sueltasDichas.push(t);
        if (this.sueltasDichas.length > 50) this.sueltasDichas = this.sueltasDichas.slice(-NO_SUELTA);
        return { quien, texto: t, codigo: null, titulo: null };
      }
    }
    const recientes = () => this.sueltasDichas.slice(-NO_SUELTA);
    const anotar = (clave: string) => {
      this.sueltasDichas.push(clave);
      if (this.sueltasDichas.length > 50) this.sueltasDichas = this.sueltasDichas.slice(-NO_SUELTA);
    };
    if (azar() < SUELTA_CON_DATO) {
      const hecho = !!temas?.hecho && (!estados || estados.has("recien"));
      const sigue = temas?.sigue?.estado === "todo" && (!estados || estados.has("cola"));
      const candidatas: Array<{ texto: string; codigo: string; nombre: string | null | undefined }> = [];
      if (sigue) for (const texto of SUELTAS_CON_DATO_COLA) candidatas.push({ texto, codigo: temas!.sigue!.codigo, nombre: temas!.sigue!.titulo });
      if (hecho) for (const texto of SUELTAS_CON_DATO_RECIEN) candidatas.push({ texto, codigo: temas!.hecho!, nombre: temas!.tituloHecho });
      const libres = candidatas.filter((x) => !recientes().includes(`${x.texto}:${x.codigo}`) && !this.fueDicha(x.texto));
      if (libres.length > 0) {
        const x = libres[Math.floor(azar() * libres.length)]!;
        anotar(`${x.texto}:${x.codigo}`);
        return { quien, texto: x.texto, codigo: x.codigo, titulo: x.nombre ?? titulo(x.codigo) };
      }
    }
    const delEstado = estados ? [...estados].flatMap((e) => SUELTAS_POR_ESTADO[e]) : [];
    const buenas = (lista: readonly string[]) => lista.filter((t) => !recientes().includes(t) && !this.fueDicha(t));
    const propias = buenas(delEstado);
    const generales = buenas(SUELTAS_GENERALES);
    const pool = propias.length > 0 && (generales.length === 0 || azar() < 0.6) ? propias : generales;
    if (pool.length > 0) {
      const t = pool[Math.floor(azar() * pool.length)]!;
      anotar(t);
      return { quien, texto: t, codigo: null, titulo: null };
    }
    return this.ia || this.memoriaIa ? null : { quien, texto: "☕", codigo: null, titulo: null };
  }

  /** Una frase de la lista que no es la última que dijo esa mascota (ni una dicha en la hora, con la IA elegida). */
  private fraseMascota(clave: string, lista: readonly string[], azar: () => number): string | null {
    const ultima = this.ultimaMascota.get(clave) ?? null;
    const libres = lista.filter((t) => t !== ultima && !this.fueDicha(t));
    if (libres.length === 0) return null;
    const t = libres[Math.floor(azar() * libres.length)]!;
    this.ultimaMascota.set(clave, t);
    return t;
  }

  /** Lo que dice una mascota al tocarla: una de sus 8 frases, sin repetir la anterior (con la IA elegida, también lo que ella escribe). */
  mascota(id: IdMascota, azar: () => number = Math.random): string | null {
    const generada = this.ia?.mascota(id, azar);
    if (generada) return generada;
    return this.fraseMascota(`t:${id}`, DICEN[id], azar);
  }

  /** Lo que dice una mascota al reaccionar a lo que pasa cerca (JST-415): quién es y qué dice, sin repetir su anterior. */
  reaccion(tipo: Reaccion, azar: () => number = Math.random): { id: IdMascota; texto: string } | null {
    const id = MASCOTA_DE_REACCION[tipo];
    const texto = this.fraseMascota(`r:${id}`, REACCIONES[id], azar);
    return texto ? { id, texto } : null;
  }

  /**
   * Para olvidar lo que se arme desde ahora (JST-172): la conversación se arma
   * antes de saber dónde se juntan, porque el hilo mide según lo que dicen, y si
   * no hay dónde, lo que no se dijo no cuenta para no repetirlo. Guarda una
   * copia de toda su memoria (listas, mapas y lo demás) y la devuelve al llamar.
   */
  recuerdo(): () => void {
    const copia = (v: unknown) => (v instanceof Map ? new Map(v) : v instanceof Set ? new Set(v) : Array.isArray(v) ? [...v] : v);
    const antes = Object.entries(this).map(([k, v]) => [k, copia(v)] as const);
    return () => {
      for (const [k, v] of antes) Reflect.set(this, k, copia(v));
    };
  }
}
