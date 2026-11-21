// Adornos por fecha (JST-416, etapa 2): qué fiesta toca hoy, con la fecha local de quien mira. Sin React ni DOM.

export type Adorno = "navidad" | "dieciocho" | "halloween";

/** Zonas horarias de Chile (continente, Magallanes e Isla de Pascua). */
const ZONAS_CHILE: readonly string[] = ["America/Santiago", "America/Punta_Arenas", "Pacific/Easter"];

/** Está en Chile: la zona horaria del navegador es una de Chile, o su idioma es `es-CL` (el Dieciocho solo se pone ahí). */
export function esDeChile(zona: string | null | undefined, idioma: string | null | undefined): boolean {
  return (!!zona && ZONAS_CHILE.includes(zona)) || (!!idioma && idioma.toLowerCase() === "es-cl");
}

/** Lo del navegador de quien mira (sin fallar si no hay `Intl` ni `navigator`, como en Node). */
export function enChileAhora(): boolean {
  let zona: string | undefined;
  try {
    zona = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    zona = undefined;
  }
  const idioma = typeof navigator !== "undefined" ? navigator.language : undefined;
  return esDeChile(zona, idioma);
}

/**
 * El adorno de una fecha (local): Navidad del 1 al 26 de diciembre, las fiestas patrias de Chile del 11 al 20 de
 * septiembre (solo si `enChile`; JST-416: no tiene sentido para el resto del mundo) y Halloween del 24 al 31 de octubre.
 * El resto del año, ninguno.
 */
export function adornoDeHoy(fecha: Date, enChile: boolean): Adorno | null {
  const mes = fecha.getMonth() + 1;
  const dia = fecha.getDate();
  if (mes === 12 && dia >= 1 && dia <= 26) return "navidad";
  if (enChile && mes === 9 && dia >= 11 && dia <= 20) return "dieciocho";
  if (mes === 10 && dia >= 24 && dia <= 31) return "halloween";
  return null;
}

/**
 * Solo para pruebas: con estas claves de `sessionStorage` (se van al cerrar la pestaña, así no quedan prendidas para
 * siempre) se fuerza la fecha («2026-12-24») y la hora («22:30») que ve la oficina.
 */
export const CLAVE_PRUEBA_FECHA = "jstm.oficina-pixel.prueba-fecha";
export const CLAVE_PRUEBA_HORA = "jstm.oficina-pixel.prueba-hora";

/**
 * La fecha y hora que se usan para los adornos y la luz: las de `real`, salvo que las claves de prueba digan otra cosa
 * (solo se pisa lo que venga bien escrito; lo raro se ignora y vale lo real).
 */
export function fechaForzada(real: Date, fecha?: string | null, hora?: string | null): Date {
  const r = new Date(real.getTime());
  const f = fecha ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha.trim()) : null;
  if (f) {
    const a = Number(f[1]);
    const m = Number(f[2]);
    const d = Number(f[3]);
    const prueba = new Date(a, m - 1, d, r.getHours(), r.getMinutes(), r.getSeconds());
    // «2026-02-31» no existe: se descarta en vez de saltar a marzo.
    if (prueba.getFullYear() === a && prueba.getMonth() === m - 1 && prueba.getDate() === d) {
      r.setFullYear(a, m - 1, d);
    }
  }
  const h = hora ? /^(\d{1,2}):(\d{2})$/.exec(hora.trim()) : null;
  if (h && Number(h[1]) < 24 && Number(h[2]) < 60) r.setHours(Number(h[1]), Number(h[2]), 0, 0);
  return r;
}

let avisada = "";

/** Lo de `sessionStorage` para pruebas, sin fallar si no hay almacenamiento (widget, navegación privada). Si hay algo activo, lo dice UNA vez en la consola. */
export function pruebaGuardada(): { fecha: string | null; hora: string | null } {
  let r: { fecha: string | null; hora: string | null };
  try {
    r = { fecha: sessionStorage.getItem(CLAVE_PRUEBA_FECHA), hora: sessionStorage.getItem(CLAVE_PRUEBA_HORA) };
  } catch {
    return { fecha: null, hora: null };
  }
  const activa = [r.fecha ? `fecha ${r.fecha}` : "", r.hora ? `hora ${r.hora}` : ""].filter(Boolean).join(", ");
  if (activa && activa !== avisada) {
    avisada = activa;
    console.info(`Oficina global: la luz y los adornos usan una prueba (${activa}) hasta que cierres esta pestaña.`);
  }
  return r;
}

/** «Ahora» para la oficina: la hora del reloj, o la forzada por las claves de prueba. */
export function ahoraOficina(real: Date = new Date()): Date {
  const p = pruebaGuardada();
  return fechaForzada(real, p.fecha, p.hora);
}
