// Idiomas (JST-413), portado de Board global (JST-409). El texto de origen es el español que está en el código:
// `t("Sin asignar")` devuelve ese mismo texto en español y su traducción en los
// demás idiomas. Cada idioma es un catálogo «texto en español → traducción»
// (`src/i18n/<idioma>/`); si falta una entrada, queda el español.
//
// El idioma se decide una vez, al cargar: el que la persona eligió en el
// selector (se guarda en este navegador) o, si no eligió, el del navegador.
// Cambiarlo recarga la página, así que `t()` se puede usar en cualquier parte,
// también en constantes de módulo.
//
// Solo se traduce la interfaz. Lo que se oye (las voces, el Resumen hablado,
// «Leer contexto») y las conversaciones de los agentes quedan en español: los
// audios están grabados en español y esos textos no pasan por `t()`.
import { en } from "./i18n/en/index.js";

export const LOCALES = [
  // «es» y no «es-CL»: la Oficina siempre formateó horas y fechas con «es» («18:05», «8 nov»), y así quedan igual.
  { id: "es", name: "Español", tag: "es" },
  { id: "en", name: "English", tag: "en-US" },
] as const;

export type Locale = (typeof LOCALES)[number]["id"];

/** El idioma del código: no tiene catálogo. */
export const SOURCE_LOCALE: Locale = "es";
/** Para un navegador en un idioma que no está en la lista. */
export const FALLBACK_LOCALE: Locale = "en";
export const LOCALE_STORAGE_KEY = "jstm.oficina-pixel.idioma";

/** Un catálogo por idioma; el del código no necesita. */
export const CATALOGS: Readonly<Record<Locale, Readonly<Record<string, string>> | null>> = { es: null, en };

/** Separa el texto de una nota de contexto: `t("Abrir§verbo")` se lee «Abrir». */
const CONTEXT_MARK = "§";

export function isLocale(value: unknown): value is Locale {
  return LOCALES.some((locale) => locale.id === value);
}

/**
 * El idioma a usar: el guardado si es válido; si no, el primero de los idiomas
 * del navegador que esté en la lista («es-CL» vale como «es»); si ninguno está,
 * inglés.
 */
export function pickLocale(stored: string | null | undefined, languages: readonly string[]): Locale {
  if (isLocale(stored)) return stored;
  for (const language of languages) {
    const base = language.toLowerCase().split("-")[0];
    if (isLocale(base)) return base;
  }
  return FALLBACK_LOCALE;
}

/** El idioma que la persona eligió en este navegador, si eligió alguno. */
export function storedLocale(): Locale | null {
  try {
    const value = globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY);
    return isLocale(value) ? value : null;
  } catch {
    return null;
  }
}

/** Guarda la elección; `null` vuelve a «el idioma del navegador». */
export function storeLocale(locale: Locale | null): void {
  try {
    if (locale) globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, locale);
    else globalThis.localStorage?.removeItem(LOCALE_STORAGE_KEY);
  } catch {
    // Sin almacenamiento (modo privado): la elección dura hasta recargar.
  }
}

export function detectLocale(): Locale {
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  return pickLocale(storedLocale(), nav?.languages?.length ? nav.languages : nav?.language ? [nav.language] : []);
}

// Fuera del navegador (pruebas y worker) queda el idioma del código.
let current: Locale = typeof window === "undefined" ? SOURCE_LOCALE : detectLocale();

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale): void {
  current = locale;
}

/** Etiqueta para `Intl` y `toLocale…`: fechas y números van en el idioma de la interfaz. */
export function localeTag(): string {
  return LOCALES.find((locale) => locale.id === current)!.tag;
}

/**
 * Opciones de hora para `Intl` (JST-413): en español, ninguna (queda como siempre); en los demás idiomas,
 * 24 h, como los globos y el registro. Sin esto «en-US» pone AM/PM.
 */
export function opcionesHora(): Intl.DateTimeFormatOptions {
  return current === SOURCE_LOCALE ? {} : { hourCycle: "h23" };
}

function fill(text: string, values: Readonly<Record<string, string | number>>): string {
  return text.replace(/\{(\w+)\}/g, (token, name: string) => (Object.hasOwn(values, name) ? String(values[name]) : token));
}

/**
 * Traduce un texto de la interfaz. `source` es el texto en español, siempre un
 * literal; los datos van en `{marcadores}`: `t("Ver {n} más", { n })`. Una
 * frase se traduce entera, nunca por pedazos, para que cada idioma la ordene a
 * su manera.
 */
export function t(source: string, values?: Readonly<Record<string, string | number>>): string {
  const catalog = CATALOGS[current];
  let text = catalog && Object.hasOwn(catalog, source) ? catalog[source]! : source;
  const mark = text.indexOf(CONTEXT_MARK);
  if (mark >= 0) text = text.slice(0, mark);
  return values ? fill(text, values) : text;
}

/**
 * Marca un texto para traducir sin traducirlo todavía: para tablas cuyo valor
 * pasa después por `t(valor)`. Sin la marca, la prueba del catálogo no lo ve.
 */
export function msg(source: string): string {
  return source;
}

/** «1 tarea», «3 tareas»: el número y la forma que le toca, ya traducida. */
export function plural(count: number, one: string, many: string): string {
  return `${count} ${t(count === 1 ? one : many)}`;
}
