// Cuánto tiempo, dicho en voz alta (JST-415), sin React ni navegador: «un minuto», «media hora»,
// «una hora y media», «3 horas», «2 días». Redondeo natural, nunca «70 horas»: de 48 horas hacia
// arriba se dice en días. Es lo que oyes, así que va en español y sin `t()`.

const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

/** Desde cuánto se dice «terminé en 12 minutos»: antes de esto, no se dice (JST-415). */
export const MIN_DURACION_DICHA_MS = 2 * MIN;
/** Un inicio de hace más de esto no es confiable (un run no dura 2 semanas): no se dice nada. */
export const MAX_DURACION_CONFIABLE_MS = 14 * DIA;

/**
 * El tiempo `ms` como se dice: «menos de un minuto», «un minuto», «12 minutos», «media hora», «40 minutos»,
 * «una hora», «una hora y media», «2 horas y media», «7 horas», «2 días». Un valor que no es un número
 * finito o es negativo da `""` (jamás se inventa).
 */
export function duracionHablada(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  const m = Math.round(ms / MIN);
  if (ms < MIN * 0.5) return "menos de un minuto";
  if (m <= 1) return "un minuto";
  if (m <= 24) return `${m} minutos`;
  if (m <= 34) return "media hora";
  if (m <= 54) return `${Math.round(m / 5) * 5} minutos`;
  if (ms >= 2 * DIA) return `${Math.floor(ms / DIA)} días`;
  // Hasta 5 horas y media, de media en media hora; después, horas enteras (sin pasar de 47).
  if (m < 330) {
    const medias = Math.round(m / 30);
    const horas = Math.floor(medias / 2);
    const y = medias % 2 === 1 ? " y media" : "";
    return horas === 1 ? `una hora${y}` : `${horas} horas${y}`;
  }
  return `${Math.min(47, Math.round(m / 60))} horas`;
}

/**
 * Cuánto tardó, para «terminé en 12 minutos»: `null` si no se sabe (sin inicio, un inicio en el futuro o
 * de hace más de 2 semanas) o si fue menos de 2 minutos.
 */
export function duracionDeTarea(inicio: number | null | undefined, fin: number): string | null {
  if (inicio == null || !Number.isFinite(inicio) || !Number.isFinite(fin)) return null;
  const ms = fin - inicio;
  if (ms < MIN_DURACION_DICHA_MS || ms > MAX_DURACION_CONFIABLE_MS) return null;
  return duracionHablada(ms);
}

/** «hace 35 minutos», «hace 2 horas», «hace 3 días». `""` si no se sabe. */
export function haceHablado(ms: number): string {
  const d = duracionHablada(ms);
  return d ? `hace ${d}` : "";
}
