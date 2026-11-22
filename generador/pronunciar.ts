// Cómo se le escribe a cada motor el texto de una frase para que se diga bien
// (JST-124, medido transcribiendo cada audio con Whisper). Solo cambia lo que
// se oye: el subtítulo y el índice usan el texto de siempre.
import { instancia } from "../src/datosInstancia.js";
import type { Motor } from "../src/voces.js";

/** Súbelo si cambia lo de aquí: los audios hechos con lo anterior se vuelven a generar. */
export const VERSION_PRONUNCIACION = 1;

/** Todos lo leen mal: «QA» sale «ka», «CEO» sale «seo» y «CI» de una sílaba («si»). */
const TODAS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bQA\b/g, "cu a"],
  [/\bCEO\b/g, "si i ou"],
  [/\bCI\b/g, "ce i"],
  // 0.6.0 (JST-226, spike de JST-224): las conversaciones. «// algún día» se leía con las barras y «build» salía «bil» o «weed».
  [/\/\/\s*/g, ""],
  [/\bbuild\b/g, "bild"],
];

/**
 * Todos menos Edge: «JSTM» de corrido no se entiende, y los clones se enredan y alargan la frase.
 * «CMO»: el clon de Chatterbox se la salta y repite el resto («necesito, necesito»).
 */
const SIGLAS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bJSTM\b/g, "jota ese te eme"],
  [/\bCMO\b/g, "ce eme o"],
];

/** Kokoro (espeak-ng): «Plugins» sale con jota. */
const KOKORO_FIJAS: ReadonlyArray<readonly [RegExp, string]> = [[/\bPlugins\b/g, "Plaguins"]];

/** Las fijas y después los nombres propios de la instancia (`instancia.json`, ver `src/datosInstancia.ts`): se arma al usarla, no al cargar el módulo. */
const kokoro = (): ReadonlyArray<readonly [RegExp, string]> => [...KOKORO_FIJAS, ...instancia().pronunciarKokoro];

const UNIDADES = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve", "veinte", "veintiuno", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve"];
const DECENAS = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
const CENTENAS = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];

/** 0 a 999 999 en palabras («140» → «ciento cuarenta»). */
export function enPalabras(n: number): string {
  if (n < 30) return UNIDADES[n]!;
  if (n < 100) return `${DECENAS[Math.floor(n / 10)]}${n % 10 ? ` y ${UNIDADES[n % 10]}` : ""}`;
  if (n === 100) return "cien";
  if (n < 1000) return `${CENTENAS[Math.floor(n / 100)]}${n % 100 ? ` ${enPalabras(n % 100)}` : ""}`;
  const miles = Math.floor(n / 1000);
  return `${miles === 1 ? "mil" : `${enPalabras(miles).replace(/uno$/, "ún")} mil`}${n % 1000 ? ` ${enPalabras(n % 1000)}` : ""}`;
}

/**
 * 0.8.0 (JST-241): los números que todos los motores dicen mal. Una versión
 * («0.6.0», «9.4.11») va con «punto» entre sus partes; un número con ceros
 * adelante («037», el de una spec), con sus «cero» y después el resto. Los
 * demás quedan como estaban. No cambia lo que se grabó al instalar (ninguna de
 * esas frases tiene números así): no hace falta subir `VERSION_PRONUNCIACION`.
 */
export function numerosParaDecir(texto: string): string {
  return texto
    // Con 2 partes, solo si la segunda tiene 1 o 2 cifras: «6.700 tests» y «100.000 CLP» son miles.
    .replace(/(?<![\d.,])\d{1,4}(?:(?:\.\d{1,4}){2,3}|\.\d{1,2})(?![\d]|[.,]\d)/g, (v) => v.split(".").map((n) => enPalabras(Number(n))).join(" punto "))
    // Una hora («a las 09:47») no.
    .replace(/(?<![\d.,:])0+\d+(?![\d:]|[.,]\d)/g, (n) => {
      const ceros = /^0+/.exec(n)![0].length;
      const resto = n.slice(ceros);
      return [...Array<string>(ceros).fill("cero"), ...(resto ? [enPalabras(Number(resto))] : [])].join(" ");
    });
}

export function paraDecir(texto: string, motor: Motor): string {
  let t = numerosParaDecir(texto);
  for (const [re, por] of TODAS) t = t.replace(re, por);
  if (motor !== "edge") for (const [re, por] of SIGLAS) t = t.replace(re, por);
  if (motor === "kokoro") for (const [re, por] of kokoro()) t = t.replace(re, por);
  // Chatterbox y Qwen3 leen mal los números («Sprint 140» → «Sprint 40»).
  // El punto de los miles («6.700») se saca antes: si no, sale «seis. setecientos».
  if (motor === "chatterbox" || motor === "qwen3") t = t.replace(/(?<=\d)\.(?=\d{3}(?!\d))/g, "").replace(/\d{1,6}/g, (d) => ` ${enPalabras(Number(d))} `).replace(/\s+/g, " ").replace(/ ([,.:;])/g, "$1").trim();
  return t;
}
