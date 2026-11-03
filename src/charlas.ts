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
import type { TipoEspera } from "./estado.js";
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
  /** La hora de verdad (`Date.now()`), para «lleva una hora esperando». */
  reloj: number;
  /** El reloj de la vida (para lo que no se repite en 10 min). */
  ahora: number;
  azar: () => number;
}

export type Tema = "termino" | "cola" | "revision" | "espera-otra" | "te-espera" | "error" | "pausa" | "trabajan" | "rol" | "sala" | "empresa" | "broma";

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

/** El motivo de un error, en corto (§1.3). */
export function motivoError(m: string | null): string {
  const t = (m ?? "").toLowerCase();
  if (/limit|usage|quota|cupo|\brate\b/.test(t)) return "Se quedó sin cupo, parece.";
  if (/timeout|timed out|tiempo/.test(t)) return "Se le acabó el tiempo.";
  if (/\btests?\b|prueba/.test(t)) return "Le fallaron las pruebas.";
  if (/permis|\bauth|\b40[13]\b/.test(t)) return "Un tema de permisos.";
  if (/exit code|crash|se cayó/.test(t)) return "Se le cayó el proceso.";
  return "No sé, hay que ver el detalle.";
}

/** El motivo de una pausa, en corto. `manual` (la pausaron a mano) es «Alguien le puso pausa.». */
export function motivoPausa(m: string | null): string {
  const t = (m ?? "").toLowerCase();
  if (/budget|presupuesto/.test(t)) return "Por presupuesto.";
  if (/approval|aprobaci/.test(t)) return "Espera una aprobación.";
  if (/paus|manual/.test(t)) return "Alguien le puso pausa.";
  return "No sé, no dice.";
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
type Renglon = readonly [Rol, string, (string | null)?] | null;

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
  [k: string]: unknown;
}

interface Variante {
  id: string;
  tema: Tema;
  si: (c: Ctx) => Datos | null | false | undefined;
  lineas: (d: Datos & { S: Quien; O: Quien }, c: Ctx) => Renglon[];
}

const V: Variante[] = [];
const v = (id: string, tema: Tema, si: Variante["si"], lineas: Variante["lineas"]) => V.push({ id, tema, si, lineas });

/** Los que cuentan los contadores del encabezado: con filtro, solo las salas del filtro (JST-176). */
const contados = (c: Ctx) => (c.filtro?.length ? c.agentes.filter((x) => c.filtro!.includes(x.prefijo)) : c.agentes);

/** Quien tiene el dato es de quien se habla (§1.7). */
const deS = (S: Quien | undefined) => S && { S, sujeto: S.id };

// --- Terminó algo (peso 5): de los dos, quien no lo contó en los últimos 10 min
const conHecho = (c: Ctx) => [c.a, c.b].filter((x) => x.t?.hecho && c.nuevo("termino", x.id));
v("termino-1", "termino", (c) => deS(conHecho(c)[0]), ({ S }) => [
  ["S", "Acabo de terminar esta.", S.t!.hecho],
  ["O", "¡Bien! ¿Fue complicado?"],
  ["S", "Tuvo lo suyo, pero salió."],
  ["O", "Genial, una menos en el tablero."],
]);
v("termino-2", "termino", (c) => {
  const S = conHecho(c)[0];
  // «Esta otra.» cuenta también su cola.
  return S && { S, sujeto: S.id, tambien: S.t!.sigue?.estado === "todo" ? "cola" : null };
}, ({ S }) => [
  ["S", "Por fin cerré esta.", S.t!.hecho],
  ["O", "¡Buena! ¿Y qué viene ahora?"],
  S.t!.sigue?.estado === "todo" ? ["S", "Esta otra.", S.t!.sigue.codigo] : ["S", "Nada por ahora. Café."],
]);
v("termino-3", "termino", (c) => deS(conHecho(c)[0]), ({ S }) => [
  ["O", "¿Cómo te fue con la última?"],
  ["S", "Bien, ya está lista.", S.t!.hecho],
  ["O", "Bacán."],
]);
v("termino-4", "termino", (c) => conHecho(c).length === 2 && { S: c.a, O: c.b, sujeto: [c.a.id, c.b.id] }, ({ S, O }) => [
  ["S", "Cerré esta hace un rato.", S.t!.hecho],
  ["O", "Yo también terminé una.", O.t!.hecho],
  ["S", "Nos ganamos el café."],
]);

// --- Su cola (peso 3), en revisión (2) y espera otra (1): el tema de lo primero de su cola, según su estado
const TEMA_COLA: Readonly<Record<EstadoCola, Tema>> = { todo: "cola", in_review: "revision", blocked: "espera-otra" };
const conSigue = (c: Ctx, estado: EstadoCola) => [c.a, c.b].filter((x) => x.t?.sigue?.estado === estado && c.nuevo(TEMA_COLA[estado], x.id));
v("cola-1", "cola", (c) => deS(conSigue(c, "todo")[0]), ({ S }) => [
  ["O", "¿Qué te toca ahora?"],
  ["S", "Esta, apenas me llamen.", S.t!.sigue!.codigo],
  ["O", "Ánimo."],
]);
v("cola-2", "cola", (c) => deS(conSigue(c, "todo")[0]), ({ S }) => [
  ["S", "Me toca esta.", S.t!.sigue!.codigo],
  ["O", "¿Harta pega?"],
  ["S", "Ya veremos. Primero, café."],
]);
v("cola-3", "cola", (c) => deS(conSigue(c, "todo").find((x) => (x.t!.enCola ?? 0) >= 3)), ({ S }) => [
  ["O", "¿Tienes mucho en cola?"],
  ["S", "Tres, por lo menos."],
  ["O", "¡Uf! ¿Por cuál partes?"],
  ["S", "Por esta.", S.t!.sigue!.codigo],
]);
v("revision-1", "revision", (c) => deS(conSigue(c, "in_review")[0]), ({ S }) => [
  ["S", "Dejé esta en revisión.", S.t!.sigue!.codigo],
  ["O", "Ojalá pase a la primera."],
]);
v("revision-2", "revision", (c) => deS(conSigue(c, "in_review")[0]), ({ S }) => [
  ["O", "¿En qué estás?"],
  ["S", "Esperando que revisen esta.", S.t!.sigue!.codigo],
  ["O", "Paciencia, ya la van a ver."],
]);
v("espera-otra-1", "espera-otra", (c) => deS(conSigue(c, "blocked")[0]), ({ S }) => [
  ["S", "Esta espera a que termine otra.", S.t!.sigue!.codigo],
  ["O", "Bueno, mientras tanto, café."],
]);

// --- Quién te espera (peso 4)
const QUE_ESPERA: Record<TipoEspera, string> = { tarjeta: "una respuesta", decision: "una decisión", aprobacion: "una aprobación", revision: "una revisión" };
const esperando = (c: Ctx) => c.terceros.filter((x) => x.need && x.espera?.codigo);
v("te-espera-1", "te-espera", (c) => {
  const X = esperando(c)[0];
  return X && { X, sujeto: X.id };
}, ({ X }) => {
  const x = X as Quien;
  return [
    ["S", `${x.quien} está esperando ${x.espera?.tipo ? QUE_ESPERA[x.espera.tipo] : "una respuesta"}.`],
    ["O", "¿Por esta?", x.espera?.codigo],
    ["S", "Esa. Ojalá le contesten luego."],
  ];
});
v("te-espera-2", "te-espera", (c) => {
  const X = esperando(c).find((x) => x.minEsperando >= 60 && x.espera?.codigo);
  return X && { X, sujeto: X.id };
}, ({ X }) => {
  const x = X as Quien;
  return [
    ["S", `${x.quien} lleva ${x.minEsperando >= 120 ? `${Math.floor(x.minEsperando / 60)} horas` : "una hora"} esperando.`],
    ["O", "¿Por cuál?"],
    ["S", "Por esta.", x.espera!.codigo],
    ["O", "Ya le van a contestar."],
  ];
});
v("te-espera-3", "te-espera", (c) => {
  const n = contados(c).filter((x) => x.need).length;
  return n >= 3 && { n, sujeto: "n" };
}, ({ n }) => [
  ["S", `Hay ${n as number} esperando respuesta.`],
  ["O", "Uf, harta cola."],
]);

// --- A quién le falló algo (peso 4)
const conError = (c: Ctx) => c.terceros.filter((x) => x.st === "error");
v("error-1", "error", (c) => {
  const X = conError(c)[0];
  return X && { X, sujeto: X.id };
}, ({ X }) => {
  const x = X as Quien;
  return [
    ["S", `A ${x.quien} le falló el run.`],
    ["O", "¿Qué le pasó?"],
    ["S", motivoError(x.motivo)],
    ["O", "Uf. Ojalá lo vean luego."],
  ];
});
v("error-2", "error", (c) => {
  const X = conError(c).find((x) => x.run?.codigo);
  return X && { X, sujeto: X.id };
}, ({ X }) => {
  const x = X as Quien;
  return [
    ["O", `¿Viste que ${x.quien} tiene un error?`],
    ["S", "Sí, en esta.", x.run!.codigo],
    ["O", "Ojalá se arregle luego."],
  ];
});
v("error-3", "error", (c) => {
  const n = contados(c).filter((x) => x.st === "error").length;
  return n >= 2 && { n, sujeto: "n" };
}, ({ n }) => [
  ["S", `Hay ${n as number} con error.`],
  ["O", "Mal día para los runs."],
]);

// --- Quién está en pausa (peso 1)
v("pausa-1", "pausa", (c) => {
  const X = c.terceros.find((x) => x.st === "pausa");
  return X && { X, sujeto: X.id };
}, ({ X }) => {
  const x = X as Quien;
  return [
    ["S", `${x.quien} sigue en pausa.`],
    ["O", "¿Y eso?"],
    ["S", motivoPausa(x.motivo)],
    ["O", "Ya volverá."],
  ];
});

// --- Cuántos trabajan (peso 2): el contador «trabajando»
const trabajando = (c: Ctx) => contados(c).filter((x) => x.st === "trabaja").length;
v("trabajan-1", "trabajan", (c) => trabajando(c) >= 8 && { n: trabajando(c) }, ({ n }) => [
  ["S", `Hay ${n as number} trabajando ahora.`],
  ["O", "Entonces es buen momento para un café."],
]);
v("trabajan-2", "trabajan", (c) => trabajando(c) >= 8 && { n: trabajando(c) }, ({ n }) => [
  ["O", "¿Mucha pega hoy?"],
  ["S", `${n as number} trabajando, y nosotros acá.`],
  ["O", "Alguien tiene que cuidar el café."],
]);
v("trabajan-3", "trabajan", (c) => {
  const n = trabajando(c);
  return n >= 3 && n < 8 && { n };
}, ({ n }) => [
  ["S", "¿Cuántos están trabajando?"],
  ["O", `${n as number}. Un día normal.`],
]);
v("trabajan-4", "trabajan", (c) => {
  const n = trabajando(c);
  return n >= 1 && n <= 2 && { n };
}, ({ n }) => [
  ["S", `${n === 1 ? "Uno solo" : "Solo dos"} trabajando.`],
  ["O", "Día tranquilo, entonces."],
]);
v("trabajan-5", "trabajan", (c) => trabajando(c) === 0 && {}, () => [
  ["S", "Nadie está trabajando."],
  ["O", "Silencio total. Se escucha el refri."],
]);

// --- Cómo le va al otro en su rol (peso 2): la respuesta, de sus temas si están guardados
/** La respuesta (frase, tarea, lo que dice el otro) y el tema que también cuenta: lo que terminó o su cola. */
const comoVa = (t: Temas | null): readonly [string, string | null, string, Tema | null] =>
  !t
    ? ["Ahí vamos, de a poco.", null, "Ánimo.", null]
    : t.hecho
      ? ["Bien. Hoy cerré esta.", t.hecho, "Bacán.", "termino"]
      : (t.enCola ?? 0) >= 3
        ? ["Harta pega: tres en cola.", null, "Ánimo.", "cola"]
        : t.sigue
          ? ["Bien, con esta en cola.", t.sigue.codigo, "Me alegro.", TEMA_COLA[t.sigue.estado]]
          : ["Tranqui. Sin nada en cola.", null, "Qué envidia.", null];
v("rol-1", "rol", (c) => ({ S: c.b, O: c.a, sujeto: c.b.id, tambien: comoVa(c.b.t)[3] }), ({ S }) => {
  const r = comoVa(S.t);
  return [["O", `¿Cómo va ${rolTema(S)}?`], ["S", r[0], r[1]], ["O", r[2]]];
});

// --- Qué hace alguien de su sala (peso 2)
const enSuSala = (c: Ctx) => c.terceros.filter((x) => x.prefijo === c.prefijo && x.st === "trabaja" && x.run?.codigo);
const lleva = (min: number) => (min >= 120 ? `${Math.floor(min / 60)} horas` : `${Math.floor(min / 5) * 5} minutos`);
v("sala-1", "sala", (c) => {
  const Y = enSuSala(c).find((x) => x.minRun >= 30 && !x.run!.enCola);
  return Y && { Y, sujeto: Y.id };
}, ({ Y }) => {
  const y = Y as Quien;
  return [
    ["S", `${y.corto} lleva ${lleva(y.minRun)} con esta.`, y.run!.codigo],
    ["O", "Mejor no interrumpir."],
  ];
});
v("sala-2", "sala", (c) => {
  const Y = enSuSala(c).find((x) => x.minRun < 5 && !x.run!.enCola && x.run!.desde);
  return Y && { Y, sujeto: Y.id };
}, ({ Y }) => {
  const y = Y as Quien;
  return [
    ["S", `${y.corto} recién empezó esta.`, y.run!.codigo],
    ["O", "Después le llevamos un café."],
  ];
});
v("sala-3", "sala", (c) => {
  const Y = enSuSala(c).find((x) => x.run!.enCola);
  return Y && { Y, sujeto: Y.id };
}, ({ Y }) => {
  const y = Y as Quien;
  return [
    ["S", `${y.corto} está en cola con esta.`, y.run!.codigo],
    ["O", "Le toca esperar su turno."],
  ];
});
v("sala-4", "sala", (c) => {
  const Y = enSuSala(c).find((x) => !x.run!.enCola);
  return Y && { Y, sujeto: Y.id };
}, ({ Y }) => {
  const y = Y as Quien;
  return [
    ["O", `¿En qué anda ${y.corto}?`],
    ["S", "En esta.", y.run!.codigo],
    ["O", "Ah, buena."],
  ];
});

// --- Cómo están en otra empresa (peso 1): los contadores de esa sala
v("empresa-1", "empresa", (c) => {
  const otras = [...new Set(c.agentes.map((x) => x.prefijo))].filter((p) => p !== c.prefijo && c.empresa(p));
  if (otras.length === 0) return null;
  const p = c.eleccion && otras.includes(c.eleccion) ? c.eleccion : otras[Math.floor(c.azar() * otras.length)]!;
  const de = c.agentes.filter((x) => x.prefijo === p);
  return { E: c.empresa(p), n: de.filter((x) => x.st === "trabaja").length, k: de.filter((x) => x.need).length, sujeto: p };
}, ({ E, n, k }) => {
  const t = n as number;
  const e = k as number;
  return [
    ["S", `¿Cómo están en ${E as string}?`],
    ["O", t === 0 ? "Tranquilos. Nadie trabajando." : e > 0 ? `${t} trabajando y ${e} esperando respuesta.` : `${t} trabajando.`],
    ["S", t >= 3 ? "Harta pega por allá." : "Mejor para ellos."],
  ];
});

// --- Bromas fijas (§1.5): cuando no hay nada que contar, y 1 de cada 5 para variar
export const BROMAS: ReadonlyArray<ReadonlyArray<readonly [Rol, string]>> = [
  [["S", "¿Quién rompió el build?"], ["O", "Yo no, estaba en el descanso."]],
  [["S", "Funciona en mi máquina."], ["O", "Entonces mandemos tu máquina a producción."]],
  [["S", "¿Probaste apagarlo y prenderlo?"], ["O", "Tres veces."], ["S", "¿Y?"], ["O", "Ahora no prende."]],
  [["S", "¿Otra reunión?"], ["O", "Pudo haber sido un correo."]],
  [["S", "No es un bug."], ["O", "¿Ah, no?"], ["S", "Es una funcionalidad sorpresa."]],
  [["S", "¿Quién escribió este código?"], ["O", "Yo, hace un mes."], ["S", "¿Y qué hace?"], ["O", "Ya no me acuerdo."]],
  [["S", "Actualicé las dependencias."], ["O", "¿Y?"], ["S", "Ahora no compila nada."]],
  [["S", "¿Deploy el viernes?"], ["O", "Ni en broma."]],
  [["S", "Me falta un café para funcionar."], ["O", "A mí me faltan dos."]],
  [["S", "¿Comentaste el código?"], ["O", "// algún día"]],
  [["S", "¿Cuántas pestañas tienes abiertas?"], ["O", "Las suficientes para que suene el ventilador."]],
  [["S", "Este café está más cargado que el servidor."], ["O", "Por eso todos teclean tan rápido."]],
];
BROMAS.forEach((l, i) => v(`broma-${i + 1}`, "broma", () => ({}), () => [...l]));

/** Todas las variantes, para las pruebas. */
export const VARIANTES: ReadonlyArray<{ id: string; tema: Tema }> = V.map(({ id, tema }) => ({ id, tema }));

// --- Frases sueltas (§1.6)
export const SUELTAS: readonly string[] = ["☕", "Pausa para el café.", "Mmm…", "¿Y ahora qué?", "Un cafecito y vuelvo.", "A ver qué sale.", "Qué rico este café.", "Cinco minutos más…", "♪ ♫"];

// --- Mascotas (§3)
export type IdMascota = "gato" | "perro" | "conejo" | "robot";
export const DICEN: Readonly<Record<IdMascota, readonly string[]>> = {
  gato: ["¡Miau!", "Mrrr…", "¡Miau! ♥"],
  perro: ["¡Guau!", "¡Guau, guau!", "♥"],
  conejo: ["♥", "♥ ♥", "*snif, snif*"],
  robot: ["Bip bup", "Bip bip bup", "Limpiando…"],
};

// ---------------------------------------------------------------------------
// Lo que la voz puede decir (0.6.0, JST-226; punto 8 del spike de JST-224)
// ---------------------------------------------------------------------------

/**
 * Las frases fijas de las conversaciones, una por una, tal como las arman las
 * variantes de arriba (sin nombres ni números). El worker solo hace audios de
 * lo que puede rearmar: estas, las plantillas de abajo y las bromas. Si se
 * agrega o cambia una frase arriba, va aquí también (lo revisa
 * `tests/vozOficina.spec.ts`, que arma miles de conversaciones al azar).
 */
const FIJAS_VARIANTES: readonly string[] = [
  // terminó algo
  "Acabo de terminar esta.", "¡Bien! ¿Fue complicado?", "Tuvo lo suyo, pero salió.", "Genial, una menos en el tablero.",
  "Por fin cerré esta.", "¡Buena! ¿Y qué viene ahora?", "Esta otra.", "Nada por ahora. Café.",
  "¿Cómo te fue con la última?", "Bien, ya está lista.", "Bacán.",
  "Cerré esta hace un rato.", "Yo también terminé una.", "Nos ganamos el café.",
  // su cola, en revisión, espera otra
  "¿Qué te toca ahora?", "Esta, apenas me llamen.", "Ánimo.",
  "Me toca esta.", "¿Harta pega?", "Ya veremos. Primero, café.",
  "¿Tienes mucho en cola?", "Tres, por lo menos.", "¡Uf! ¿Por cuál partes?", "Por esta.",
  "Dejé esta en revisión.", "Ojalá pase a la primera.",
  "¿En qué estás?", "Esperando que revisen esta.", "Paciencia, ya la van a ver.",
  "Esta espera a que termine otra.", "Bueno, mientras tanto, café.",
  // quién te espera, a quién le falló algo, en pausa
  "¿Por esta?", "Esa. Ojalá le contesten luego.", "¿Por cuál?", "Ya le van a contestar.", "Uf, harta cola.",
  "¿Qué le pasó?", "Uf. Ojalá lo vean luego.", "Sí, en esta.", "Ojalá se arregle luego.", "Mal día para los runs.",
  "¿Y eso?", "Ya volverá.",
  // cuántos trabajan
  "Entonces es buen momento para un café.", "¿Mucha pega hoy?", "Alguien tiene que cuidar el café.", "¿Cuántos están trabajando?",
  "Uno solo trabajando.", "Solo dos trabajando.", "Día tranquilo, entonces.", "Nadie está trabajando.", "Silencio total. Se escucha el refri.",
  // cómo le va en su rol (las respuestas de `comoVa`)
  "Ahí vamos, de a poco.", "Bien. Hoy cerré esta.", "Harta pega: tres en cola.", "Bien, con esta en cola.", "Me alegro.", "Tranqui. Sin nada en cola.", "Qué envidia.",
  // qué hace alguien de su sala, cómo están en otra empresa
  "Mejor no interrumpir.", "Después le llevamos un café.", "Le toca esperar su turno.", "En esta.", "Ah, buena.",
  "Tranquilos. Nadie trabajando.", "Harta pega por allá.", "Mejor para ellos.",
];

/** Las frases sueltas que llevan una tarea en la línea de abajo (§1.6). */
export const SUELTAS_CON_DATO: readonly string[] = ["Después viene esta.", "Esta ya está. Me gané el café."];

const MOTIVOS: readonly string[] = [...new Set(["limit", "timeout", "test", "permiso", "crash", "otro"].map((m) => motivoError(m === "otro" ? null : m)).concat(["budget", "approval", "manual", "otro"].map((m) => motivoPausa(m === "otro" ? null : m))))];
const ROLES: readonly string[] = [...new Set([...ROL_TEMA.map(([, t]) => t), ...Object.values(ROL_API), "la pega"])];

/** Todas las frases fijas de una conversación: las de las variantes, los motivos, «¿Cómo va …?» y las bromas. */
export const FRASES_FIJAS: ReadonlySet<string> = new Set([...FIJAS_VARIANTES, ...MOTIVOS, ...ROLES.map((r) => `¿Cómo va ${r}?`), ...BROMAS.flatMap((b) => b.map(([, t]) => t))]);

/** Un nombre dentro de una frase («Ingeniero/a de Betalandia», «QA»): letras, números y pocos signos, hasta 80. */
export const NOMBRE_EN_FRASE = "[\\p{L}\\p{N}][\\p{L}\\p{N} .,'’/&+()\\-]{0,79}";
const N = NOMBRE_EN_FRASE;
const NUM = "\\d{1,4}";
/** Las frases con un nombre o un número (las de arriba con `${…}`), como expresiones. */
export const PLANTILLAS: readonly RegExp[] = [
  `${N} está esperando (?:una respuesta|una decisión|una aprobación|una revisión)\\.`,
  `${N} lleva (?:${NUM} horas|una hora) esperando\\.`,
  `Hay ${NUM} esperando respuesta\\.`,
  `A ${N} le falló el run\\.`,
  `¿Viste que ${N} tiene un error\\?`,
  `Hay ${NUM} con error\\.`,
  `${N} sigue en pausa\\.`,
  `Hay ${NUM} trabajando ahora\\.`,
  `${NUM} trabajando, y nosotros acá\\.`,
  `${NUM}\\. Un día normal\\.`,
  `${N} lleva (?:${NUM} horas|${NUM} minutos) con esta\\.`,
  `${N} recién empezó esta\\.`,
  `${N} está en cola con esta\\.`,
  `¿En qué anda ${N}\\?`,
  `¿Cómo están en ${N}\\?`,
  `${NUM} trabajando y ${NUM} esperando respuesta\\.`,
  `${NUM} trabajando\\.`,
].map((p) => new RegExp(`^${p}$`, "u"));

/** Los datos que reemplazan los huecos de una apertura generada por la IA. */
export interface AperturaRellena {
  plantilla: string;
  datos: Readonly<Record<string, string>>;
}

export const huecosDe = (plantilla: string): string[] => [...plantilla.matchAll(/\{([a-z]+)\}/g)].map((m) => m[1]!);

/** La apertura de hoy como plantilla y los valores actuales de sus huecos. */
export function aperturaDe(l: Pick<Linea, "texto" | "codigo">): AperturaRellena {
  let plantilla = l.texto;
  const datos: Record<string, string> = {};
  const poner = (nombre: string, valor: string) => {
    datos[nombre] = valor;
    plantilla = plantilla.replace(valor, `{${nombre}}`);
  };
  if (l.codigo) {
    const tarea = l.texto.match(/\besta\b/i)?.[0];
    if (tarea) poner("tarea", tarea);
  }
  const i = PLANTILLAS.findIndex((re) => re.test(l.texto));
  const m = (re: RegExp) => l.texto.match(re);
  let x: RegExpMatchArray | null = null;
  if (i === 0 && (x = m(/^(.+?) está esperando /))) poner("agente", x[1]!);
  else if (i === 1 && (x = m(/^(.+?) lleva (.+?) esperando\.$/))) {
    poner("agente", x[1]!);
    poner("n", x[2]!);
  } else if ((i === 2 || i === 5 || i === 7 || i === 8 || i === 9 || i === 16) && (x = m(/\d+/))) poner("n", x[0]);
  else if (i === 3 && (x = m(/^A (.+?) le falló /))) poner("agente", x[1]!);
  else if (i === 4 && (x = m(/^¿Viste que (.+?) tiene /))) poner("agente", x[1]!);
  else if (i === 6 && (x = m(/^(.+?) sigue /))) poner("agente", x[1]!);
  else if (i === 10 && (x = m(/^(.+?) lleva (.+?) con esta\.$/))) {
    poner("agente", x[1]!);
    poner("n", x[2]!);
  } else if (i === 11 && (x = m(/^(.+?) recién /))) poner("agente", x[1]!);
  else if (i === 12 && (x = m(/^(.+?) está /))) poner("agente", x[1]!);
  else if (i === 13 && (x = m(/^¿En qué anda (.+?)\?$/))) poner("agente", x[1]!);
  else if (i === 14 && (x = m(/^¿Cómo están en (.+?)\?$/))) poner("empresa", x[1]!);
  else if (i === 15 && (x = m(/^(\d+) trabajando y (\d+) /))) {
    poner("n", x[1]!);
    poner("esperando", x[2]!);
  } else if (i < 0 && (x = m(/^¿Cómo va (.+)\?$/)) && ROLES.includes(x[1]!)) poner("rol", x[1]!);
  return { plantilla, datos };
}

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
 * Las frases que traen un dato sin código, número ni nombre: el motivo de un
 * error o de una pausa, la respuesta de «¿Cómo va …?», lo de la cola y los
 * contadores dichos en palabras (el `CON_DATO` del prompt v4 del spike).
 */
const CON_DATO: ReadonlySet<string> = new Set([
  ...MOTIVOS,
  "Tranquilos. Nadie trabajando.", "Tres, por lo menos.", "Nada por ahora. Café.",
  "Ahí vamos, de a poco.", "Bien. Hoy cerré esta.", "Harta pega: tres en cola.", "Bien, con esta en cola.", "Tranqui. Sin nada en cola.",
  "Nadie está trabajando.", "Uno solo trabajando.", "Solo dos trabajando.",
]);

/** Una frase de hoy con un dato: con tarea, con un número, con un nombre (una plantilla) o una de `CON_DATO`. */
export function conDato(l: Pick<Linea, "texto" | "codigo">): boolean {
  return !!l.codigo || /\d/.test(l.texto) || CON_DATO.has(l.texto) || PLANTILLAS.some((re) => re.test(l.texto));
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
    const i = PLANTILLAS.findIndex((re) => re.test(l.texto));
    if (i < 0) return null;
    partes.push(`P${i}(${(l.texto.match(/\d+/g) ?? []).map((d) => cubeta(Number(d))).join(",")})`);
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

export const PESO: Readonly<Record<Tema, number>> = { termino: 5, "te-espera": 4, error: 4, cola: 3, revision: 2, trabajan: 2, rol: 2, sala: 2, broma: 2, "espera-otra": 1, pausa: 1, empresa: 1 };
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
  private mazoSueltas: string[] = [];
  private sueltasDichas: string[] = [];
  private readonly mascotas = new Map<IdMascota, number>();
  /** 0.7.0: la reserva de la IA de Chrome (`null`: las frases de siempre) y el último final dicho de cada clave. */
  private ia: FuenteIa | null = null;
  private readonly ultimoFinal = new Map<string, string>();

  /** Con la IA lista y elegida se usan primero sus variantes; `null`, las frases de siempre sin memoria persistente. */
  fijarIa(fuente: FuenteIa | null): void {
    this.ia = fuente;
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
      if (this.ia && lineas.some((l) => this.ia!.dicha(l.texto))) continue;
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
    if (deHoy.length < 2) return null;
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
      const n = fijasDe(lineas);
      if (lineas.length < 2 || n === 0) continue;
      const clave = claveDeFinal(x.id, lineas.slice(0, n));
      if (clave) out.push({ clave, variante: x.id, apertura: aperturaDe(lineas[0]!).plantilla, fijas: lineas.slice(0, n) });
    }
    return out;
  }

  /** Las frases de una variante con sus datos: quién dice cada una y la tarea de la línea de abajo. */
  private lineasDe(x: Variante, d: Datos, c: Ctx): Linea[] {
    const S = d.S ?? c.a;
    const O = d.O ?? (S.id === c.a.id ? c.b : c.a);
    return x
      .lineas({ ...d, S, O }, c)
      .filter((r): r is NonNullable<Renglon> => !!r)
      .map(([rol, texto, codigo]): Linea => {
        const q = rol === "S" ? S : O;
        const cod = codigo ?? null;
        return { quien: q.id, texto, codigo: cod, titulo: cod ? this.tituloDe(c, cod) : null };
      });
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
    if (lineas.length < 2) return null;
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
    }
    return c.titulo(codigo);
  }

  /**
   * Una frase suelta para alguien solo en el descanso (§1.6): 1 de cada 3, de
   * sus temas guardados (sin leer nada); si no, del mazo de las fijas. Con la IA
   * elegida no se repite nada dicho en la hora: sin otra variante, se calla.
   */
  suelta(quien: string, temas: Temas | null, azar: () => number, titulo: (codigo: string) => string | null = () => null): Linea | null {
    if (this.ia) {
      const t = this.ia.suelta(azar, this.sueltasDichas.slice(-NO_SUELTA));
      if (t) {
        this.sueltasDichas.push(t);
        if (this.sueltasDichas.length > 50) this.sueltasDichas = this.sueltasDichas.slice(-NO_SUELTA);
        return { quien, texto: t, codigo: null, titulo: null };
      }
    }
    if (azar() < SUELTA_CON_DATO) {
      const conDato: Array<[string, string | null | undefined, string | null | undefined]> = [
        ["Después viene esta.", temas?.sigue?.estado === "todo" ? temas.sigue.codigo : null, temas?.sigue?.titulo],
        ["Esta ya está. Me gané el café.", temas?.hecho, temas?.tituloHecho],
      ];
      for (const [texto, codigo, nombre] of conDato) {
        const clave = `${texto}:${codigo}`;
        if (!codigo || this.sueltasDichas.slice(-NO_SUELTA).includes(clave) || this.ia?.dicha(texto)) continue;
        this.sueltasDichas.push(clave);
        return { quien, texto, codigo, titulo: nombre ?? titulo(codigo) };
      }
    }
    for (let k = 0; k < SUELTAS.length * 3; k++) {
      if (this.mazoSueltas.length === 0) this.mazoSueltas = barajar(SUELTAS, azar);
      const s = this.mazoSueltas.shift()!;
      if (this.sueltasDichas.slice(-NO_SUELTA).includes(s) || this.ia?.dicha(s)) continue;
      this.sueltasDichas.push(s);
      if (this.sueltasDichas.length > 50) this.sueltasDichas = this.sueltasDichas.slice(-NO_SUELTA);
      return { quien, texto: s, codigo: null, titulo: null };
    }
    return this.ia ? null : { quien, texto: "☕", codigo: null, titulo: null };
  }

  /** Lo que dice una mascota: con la IA elegida tampoco repite una fija dicha en la hora. */
  mascota(id: IdMascota, azar: () => number = Math.random): string | null {
    const generada = this.ia?.mascota(id, azar);
    if (generada) return generada;
    const l = DICEN[id];
    const i = ((this.mascotas.get(id) ?? -1) + 1) % l.length;
    this.mascotas.set(id, i);
    const fija = l[i]!;
    return this.ia?.dicha(fija) ? null : fija;
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
