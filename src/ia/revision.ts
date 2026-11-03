// La revisión de lo que escribe la IA de Chrome (0.7.0, JST-232; punto 4 del
// spike de JST-230, modo «hibrido4» de `validar.ts` y sus 3 reglas), sin React,
// navegador ni Node: la usan la página (antes de guardar o usar una frase) y el
// worker (antes de hacer su audio).
//
// Los finales, sueltas, bromas y mascotas no traen datos. Las aperturas solo
// pueden traer los huecos de su plantilla: el código los rellena con datos reales
// después de revisar el texto estático. Tampoco se aceptan palabras inexistentes,
// acciones futuras, textos que no caben ni variantes casi repetidas.
import { DICEN, FRASES_FIJAS, huecosDe, SUELTAS, SUELTAS_CON_DATO, type IdMascota, type Linea } from "../charlas.js";
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
const NUMEROS = palabras("dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce", "quince", "veinte", "treinta", "cien(to)?", "mil", "docenas?", "mill[óo]n(es)?");
/** Un estado de alguien (punto 4: falló, pausa, revisión, en cola, terminó, trabajando, esperando, bloqueado). */
const ESTADOS = palabras(
  "fall[óoa]~", "error~", "se cay[óo]", "rompi[óo]", "paus~", "revisi[óo]n", "revis(en|ar|ando)", "en cola", "me toca", "te toca", "le toca", "sigues? (con|en)",
  "termin~", "cerr[éeó]", "acab[éeó]", "list[ao]s?", "sali[óo]", "trabajand~", "esperand~", "espera", "esperan", "bloquead~", "aprobaci[óo]n", "ya no pued[oe]",
);
/** Un cargo o rol (en la v4 la IA no nombra a nadie). */
const CARGOS = palabras(
  "diseñador~", "disenador~", "ingenier~", "qa", "revisor~", "ceo", "cto", "cmo", "cfo", "hermes", "l[íi]der~", "jef[ea]~", "document~", "speckit", "creador~", "chief", "backend",
  "frontend", "usuari[oa]s?", "client[ea]~", "agente~", "empresa~", "equipo",
);
/** Regla 2 del punto 4: lo que alguien va a hacer. */
const VA_A = palabras("(voy|vamos|vas|va|van|iba|ibas|íbamos)\\s+a");
/** Regla 3 del punto 4: cuándo. */
const CUANDO = palabras("hoy", "ayer", "antes", "mañana", "luego", "anoche", "noche");
/** Al empezar una frase solo se admite mayúscula en una palabra común, no en un nombre propio. */
const INICIOS_COMUNES = new Set(
  "a ah ahí ahora aire al algo anímate ánimo aquí así bacán bien buena buenas bueno café caliente casi como completamente cómo con cuánto de del dijo el ella ellas ellos empieza en entiendo es eso esperemos espero está están este estirar fue guau harta hay hola je la las linda lo los mal mmm más me mismo mucho muy nada necesito no nos ojalá otro parece pasado paciencia pausa pensamientos pensando pensar pío por pues pura qué quién regresar se siempre sin solo somos son sí tal también tampoco te todavía todo todos treinta uf un una unos uy va ver vienes volvería y ya"
    .split(" "),
);

/** Lo que es «la misma frase»: sin mayúsculas, signos ni espacios de más. */
export const plano = (t: string) => t.toLowerCase().replace(/[^\p{L}\s]/gu, "").replace(/\s+/g, " ").trim();
export const normalizarFrase = plano;

/** Igual o con una coincidencia de palabras muy alta (Jaccard ≥ 0,8). */
export function casiIgual(a: string, b: string): boolean {
  const pa = plano(a);
  const pb = plano(b);
  if (pa === pb) return true;
  const wa = new Set(pa.split(" ").filter(Boolean));
  const wb = new Set(pb.split(" ").filter(Boolean));
  if (wa.size < 3 || wb.size < 3) return false;
  const comunes = [...wa].filter((w) => wb.has(w)).length;
  return comunes / new Set([...wa, ...wb]).size >= 0.8;
}

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
  for (const f of texto.split(/(?<=[.!?…])\s+/)) {
    if ((f.match(/¡/g)?.length ?? 0) !== (f.match(/!/g)?.length ?? 0) || (f.match(/¿/g)?.length ?? 0) !== (f.match(/\?/g)?.length ?? 0)) {
      mal.push("signos de apertura");
      break;
    }
  }
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
  // Un nombre: mayúscula dentro de una frase, o al inicio sin ser una palabra común («Ok» sí).
  for (const f of texto.split(/(?<=[.!?…])\s+/)) {
    for (const [i, w] of f.replace(/^[¿¡\s]+/, "").split(/\s+/).entries()) {
      const limpia = w.replace(/[^\p{L}]/gu, "");
      const inicioComun = i === 0 && INICIOS_COMUNES.has(plano(limpia));
      if (/^\p{Lu}/u.test(limpia) && limpia !== "Ok" && limpia !== "OK" && !inicioComun) {
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
    if (/^¿\s*cu[aá]nt(?:o|a|os|as)\s*\?$/iu.test(f.trim())) mal.push("pregunta sin contexto");
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

/** Revisa el texto estático de una plantilla, tapando sus huecos con una palabra inocua. */
export function revisarPlantillaApertura(texto: string, nombres: readonly string[] = []): string[] {
  const estatico = texto.replace(/\{[a-z]+\}/g, "cosa");
  return revisarTexto(estatico, { letras: 70, nombres });
}

const VECINOS = new Set(
  "a al algo así como con de del desde en entre es está están fin hace hacen hay la las le les lo los más menos muy no o para parece parecen pero por porque qué que queda quedan quedó se si sigue siguen sin son suena suenan tal también tampoco tiene tienen todavía un una va van y ya anda andan dice dicen espera esperan lleva llevan trabaja trabajan pendiente lista"
    .split(" "),
);

/** Una apertura con exactamente los huecos de la plantilla original y ningún dato fuera de ellos. */
export function revisarApertura(texto: string, plantilla: string, nombres: readonly string[] = []): string[] {
  const esperados = huecosDe(plantilla).sort();
  const dados = huecosDe(texto).sort();
  const mal: string[] = [];
  if (esperados.join(",") !== dados.join(",")) mal.push("huecos distintos de la plantilla");
  if (normalizarFrase(texto) === normalizarFrase(plantilla)) mal.push("es una de siempre");
  if (/\b(?:el|la|los|las)\s+\{rol\}/i.test(texto)) mal.push("artículo de más antes de {rol}");
  if (/,\s*\{rol\}/i.test(texto)) mal.push("{rol} usado como persona");
  if (texto.includes("{n}") && /\b(?:minutos?|horas?|días?|semanas?|meses?|años?)\b/i.test(texto)) mal.push("unidad de tiempo fuera de {n}");
  const vecinos = [
    ...[...texto.matchAll(/([\p{L}]+)\s+\{(agente|empresa|rol|tarea)\}/giu)].map((m) => ({ palabra: m[1]!, hueco: m[2]! })),
    ...[...texto.matchAll(/\{(agente|empresa|rol|tarea)\}\s+([\p{L}]+)/giu)].map((m) => ({ palabra: m[2]!, hueco: m[1]! })),
  ];
  for (const { palabra, hueco } of vecinos) if (!VECINOS.has(plano(palabra))) mal.push(`palabra pegada a {${hueco.toLowerCase()}}`);
  mal.push(...revisarPlantillaApertura(texto, nombres));
  return [...new Set(mal)];
}

/** Una broma completa de dos frases, sin reutilizar las fijas. */
export function revisarBroma(frases: readonly string[], nombres: readonly string[] = []): string[] {
  const mal = revisarFinal(frases, [], nombres);
  if (frases.length !== 2) mal.push("una broma tiene 2 frases");
  if (frases.some((f) => FRASES_FIJAS.has(f.trim()))) mal.push("es una de siempre");
  return [...new Set(mal)];
}

const SONIDOS: ReadonlyArray<readonly [IdMascota | "pájaro", RegExp]> = [
  ["gato", palabras("miau", "mrrr")],
  ["perro", palabras("guau")],
  ["conejo", palabras("snif")],
  ["robot", palabras("bip", "bup")],
  ["pájaro", palabras("p[íi]o")],
];

/** Lo que dice una mascota, sin números, nombres ni las frases fijas de respaldo. */
export function revisarMascota(id: IdMascota, texto: string, nombres: readonly string[] = []): string[] {
  const mal = revisarTexto(texto, { letras: LETRAS_SUELTA, px: MAX_SUELTA_PX, nombres });
  if (Object.values(DICEN).some((frases) => frases.includes(texto.trim()))) mal.push("es una de siempre");
  if (SONIDOS.some(([animal, re]) => animal !== id && re.test(texto))) mal.push("sonido de otra mascota");
  return mal;
}

/**
 * Una frase de la IA que el worker acepta para hacer su audio (punto 7 del
 * spike): las mismas reglas, sin nombres, números ni códigos, solo letras y
 * signos y hasta 50 letras. El worker no sabe los nombres de la oficina: le
 * basta con revisar las mayúsculas, incluidas las iniciales, y los cargos.
 */
export function fraseIaParaVoz(texto: string): boolean {
  return typeof texto === "string" && revisarTexto(texto, { letras: LETRAS_VOZ }).length === 0;
}
