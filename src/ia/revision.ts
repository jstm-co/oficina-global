// La revisión de lo que escribe la IA de Chrome (0.7.0, JST-232; punto 4 del
// spike de JST-230, modo «hibrido4» de `validar.ts` y sus 3 reglas), sin React,
// navegador ni Node: la usan la página (antes de guardar o usar una frase) y el
// worker (antes de hacer su audio).
//
// La IA escribe solo el final de cada conversación y las frases sueltas, y la
// frase con el dato es la de hoy. Por eso aquí la regla es simple y estricta:
// lo que escribe no puede traer **ningún** dato: ni un nombre, cargo, empresa,
// número, código de tarea, estado ni cuándo. Tampoco lo que alguien va a hacer
// («voy a…»), ni nada que no quepa en el globo. Tampoco una palabra que no está
// en la lista de palabras en español (0.8.1, JST-251: «Espero que se solven.»).
// Lo que no pasa se bota y queda la frase de siempre. Lo que la revisión no ve es
// el sentido: eso lo lee la QA.
import { FRASES_FIJAS, SUELTAS, SUELTAS_CON_DATO, type Linea } from "../charlas.js";
import { anchoTexto } from "../hilo.js";
import { palabrasRaras } from "./palabras.js";

/** Hasta cuántas letras por frase del final (design-spec de JST-231 §5: la más larga de hoy tiene 45). */
export const LETRAS_FINAL = 45;
/** Las frases sueltas de la IA, hasta 24 letras (§5 y la elección del spike): más largas chocan con «2 esperándote». */
export const LETRAS_SUELTA = 24;
/** Lo más que acepta el worker para hacer un audio (punto 7 del spike). */
export const LETRAS_VOZ = 50;

/** La frase más ancha que puede salir hoy en un hilo (una plantilla con los nombres largos de la real, punto 4 del spike). */
const MAS_ANCHA = "Ingeniero Backend de Betalandia está esperando una aprobación.";
/** Ninguna frase del final mide más que la más ancha de hoy (con la Inter del globo): así el hilo cabe como hoy. */
export const MAX_FINAL_PX = Math.max(anchoTexto(MAS_ANCHA), ...[...FRASES_FIJAS].map((t) => anchoTexto(t)));
/** Ni una suelta más que la suelta más ancha de hoy. */
export const MAX_SUELTA_PX = Math.max(...[...SUELTAS, ...SUELTAS_CON_DATO].map((t) => anchoTexto(t)));

/** Solo letras, espacios y estos signos (el `pattern` del esquema): sin números, comillas, emojis ni símbolos. */
const PERMITIDOS = /^[\p{L} ¿?¡!.,;:…\-]+$/u;
const CODIGO = /\b[A-Z]{2,5}-\d+\b|\bT\d\b/;
/**
 * Palabras enteras, sin importar mayúsculas: `\b` de JavaScript no ve las letras
 * con tilde («cerré.» no tendría borde después de la «é»). `~` es «más letras».
 */
const palabras = (...alt: string[]) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${alt.join("|").replaceAll("~", "\\p{L}*")})(?![\\p{L}\\p{N}])`, "iu");
const INGLES = palabras("the", "and", "you", "your", "is", "are", "done", "task", "great", "nice", "coffee", "break", "meeting", "deploy", "lol", "yeah", "cool", "bug", "sorry", "please");
const GROSERIAS = palabras("cagad~", "cagó", "cago", "weón~", "weon~", "hueón~", "huevón~", "huevon~", "mierd~", "put[ao]~", "coño", "carajo", "joder", "conchetu~", "ctm", "chucha", "culia~", "pico", "raja", "bolud[oa]~", "pelotud[oa]~");
/** Lo que no es de Chile (punto 4: «chévere», «quilombo» o «cheekear»). */
const TONO = palabras("ch[eé]vere", "quilombo", "chido", "guay", "[oó]rale", "laburo", "pibe", "che", "cheque~", "cheek~", "chequ~", "tío", "tía");
/** «todos», «nadie», «cero»: un dato de cuántos. */
const CUANTOS = palabras("todos", "todas", "nadie", "ninguno", "ninguna", "cero");
const NUMEROS = palabras("dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce", "quince", "veinte", "treinta");
/** Un estado de alguien (punto 4: falló, pausa, revisión, en cola, terminó, trabajando, esperando, bloqueado). */
const ESTADOS = palabras(
  "fall[óoa]~", "error~", "se cay[óo]", "rompi[óo]", "paus~", "revisi[óo]n", "revis(en|ar|ando)", "en cola", "me toca", "te toca", "le toca", "sigues? (con|en)",
  "termin~", "cerr[éeó]", "acab[éeó]", "list[ao]s?", "sali[óo]", "trabajand~", "esperand~", "espera", "esperan", "bloquead~", "aprobaci[óo]n",
);
/** Un cargo o rol (en la v4 la IA no nombra a nadie). */
const CARGOS = palabras(
  "diseñador~", "disenador~", "ingenier~", "qa", "revisor~", "ceo", "cto", "cmo", "cfo", "hermes", "l[íi]der~", "jef[ea]~", "document~", "speckit", "creador~", "chief", "backend",
  "frontend", "usuari[oa]s?", "client[ea]~", "agente~", "empresa~", "equipo",
);
/** Regla 2 del punto 4: lo que alguien va a hacer. */
const VA_A = palabras("(voy|vamos|vas|va|van|iba|ibas|íbamos)\\s+a");
/** Regla 3 del punto 4: cuándo. */
const CUANDO = palabras("hoy", "ayer", "antes", "mañana", "luego", "anoche");

/** Lo que es «la misma frase»: sin mayúsculas, signos ni espacios de más. */
export const plano = (t: string) => t.toLowerCase().replace(/[^\p{L}\s]/gu, "").replace(/\s+/g, " ").trim();

export interface OpcionesRevision {
  /** Hasta cuántas letras. */
  letras: number;
  /** Hasta cuántos px de arte (con la Inter del globo); sin dar, no se mide. */
  px?: number;
  /** Los nombres de la oficina (agentes y empresas): no puede nombrar a ninguno. */
  nombres?: readonly string[];
}

/**
 * Por qué no sirve una frase de la IA (vacío: sirve). Todas las reglas son
 * contra «ningún dato», porque los datos ya los dice la frase de hoy.
 */
export function revisarTexto(t: string, o: OpcionesRevision): string[] {
  const mal: string[] = [];
  const texto = t.trim();
  if (!texto) return ["vacía"];
  if ([...texto].length > o.letras) mal.push(`largo (${[...texto].length} > ${o.letras} letras)`);
  if (o.px !== undefined && anchoTexto(texto) > o.px + 0.5) mal.push("largo (no cabe en el globo)");
  if (CODIGO.test(texto)) mal.push("código de tarea");
  if (/\d/.test(texto) || NUMEROS.test(texto)) mal.push("número");
  if (!PERMITIDOS.test(texto)) mal.push("signos, comillas o emojis");
  if (INGLES.test(texto)) mal.push("inglés");
  if (GROSERIAS.test(texto)) mal.push("grosería");
  if (TONO.test(texto)) mal.push("no es de Chile");
  if (/\bB\b|,\s*A[?!.]|\bA:/.test(texto)) mal.push("escribe A o B");
  if (CUANTOS.test(texto)) mal.push("dice cuántos");
  if (ESTADOS.test(texto)) mal.push("dice un estado");
  if (CARGOS.test(texto)) mal.push("nombra a alguien por su cargo");
  if (VA_A.test(texto)) mal.push("dice lo que alguien va a hacer");
  if (CUANDO.test(texto)) mal.push("dice cuándo");
  // Una palabra inventada o mal escrita («solven», «descanza») o de otro idioma
  // que no está en INGLES («run», «backlog»).
  const raras = palabrasRaras(texto);
  if (raras.length) mal.push(`${raras.length === 1 ? "palabra que no existe" : "palabras que no existen"} (${raras.map((w) => `«${w}»`).join(", ")})`);
  // Un nombre: una palabra con mayúscula que no empieza una frase («Ok» sí).
  for (const f of texto.split(/(?<=[.!?…])\s+/)) {
    for (const w of f.replace(/^[¿¡\s]+/, "").split(/\s+/).slice(1)) {
      const limpia = w.replace(/[^\p{L}]/gu, "");
      if (/^\p{Lu}/u.test(limpia) && limpia !== "Ok" && limpia !== "OK") {
        mal.push("un nombre");
        break;
      }
    }
  }
  const bajo = ` ${plano(texto)} `;
  for (const n of o.nombres ?? []) {
    const p = plano(n);
    if (p.length >= 3 && bajo.includes(` ${p} `)) {
      mal.push("nombra a alguien de la oficina");
      break;
    }
  }
  return [...new Set(mal)];
}

/** Las frases de siempre de una conversación, como `plano`: un final de la IA no puede ser una de ellas. */
const FIJAS_PLANAS: ReadonlySet<string> = new Set([...FRASES_FIJAS].map(plano));

/**
 * Por qué no sirve el final que escribió la IA para estas frases fijas (vacío:
 * sirve): de 1 a 2 frases, hasta 4 en total, cada una sin datos y del largo de
 * las de hoy, sin repetir una fija ni repetirse, y ninguna de las de siempre (un
 * modelo chico copia «Ahí vamos, de a poco.» de otra conversación).
 */
export function revisarFinal(frases: readonly string[], fijas: readonly Pick<Linea, "texto">[], nombres: readonly string[] = []): string[] {
  const mal: string[] = [];
  if (frases.length < 1 || frases.length > 2 || fijas.length + frases.length > 4) mal.push("frases: no son 1 o 2");
  const vistas = new Set(fijas.map((l) => plano(l.texto)));
  for (const f of frases) {
    mal.push(...revisarTexto(f, { letras: LETRAS_FINAL, px: MAX_FINAL_PX, nombres }));
    const p = plano(f);
    if (vistas.has(p)) mal.push("repite una frase");
    else if (FIJAS_PLANAS.has(p)) mal.push("es una de siempre");
    vistas.add(p);
  }
  return [...new Set(mal)];
}

/** Por qué no sirve una frase suelta de la IA (vacío: sirve). */
export function revisarSuelta(texto: string, nombres: readonly string[] = []): string[] {
  const mal = revisarTexto(texto, { letras: LETRAS_SUELTA, px: MAX_SUELTA_PX, nombres });
  if (SUELTAS.includes(texto.trim())) mal.push("es una de siempre");
  return mal;
}

/**
 * Una frase de la IA que el worker acepta para hacer su audio (punto 7 del
 * spike): las mismas reglas, sin nombres, números ni códigos, solo letras y
 * signos y hasta 50 letras. El worker no sabe los nombres de la oficina: le
 * basta con que no traiga ninguna mayúscula en medio ni un cargo.
 */
export function fraseIaParaVoz(texto: string): boolean {
  return typeof texto === "string" && revisarTexto(texto, { letras: LETRAS_VOZ }).length === 0;
}
