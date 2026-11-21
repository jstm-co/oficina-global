// El Resumen (0.9.0, design-spec de JST-245 §2.3, §3.3 y §9): desde cuándo
// cuenta y cómo se dicen las horas y lo que lleva algo, sin React, red ni
// navegador. Las horas van en la zona del navegador (la del usuario), como en
// la Oficina.

/** Desde cuándo cuenta lo terminado (§2.3). */
export type Desde = "nuevo" | "hoy" | "24h" | "7d";
export const DESDES: readonly Desde[] = ["nuevo", "hoy", "24h", "7d"];

export const MINUTO_MS = 60_000;
export const HORA_MS = 60 * MINUTO_MS;
export const DIA_MS = 24 * HORA_MS;
/** «Lo nuevo» de hace más de 7 días cuenta los últimos 7 días (§8). */
export const MAX_NUEVO_MS = 7 * DIA_MS;

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** Las 0:00 del día de `t`, en la zona del navegador. */
export function inicioDelDia(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** «8:12», «0:05», «13:40». */
export function horaCorta(t: number): string {
  const d = new Date(t);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** «las 8:12», «la 1:05» (como dice la hora la Oficina). */
export function laHora(t: number): string {
  return `${new Date(t).getHours() === 1 ? "la" : "las"} ${horaCorta(t)}`;
}

/** Días de calendario entre `t` y `ahora` (0: hoy, 1: ayer). */
export function diasAtras(t: number, ahora: number): number {
  return Math.round((inicioDelDia(ahora) - inicioDelDia(t)) / DIA_MS);
}

/**
 * «las 9:20», «ayer a las 9:20», «el martes a las 9:20» y, desde una semana,
 * «el 17 de octubre a las 9:20» (§3.3). Para después de «desde»: «espera desde
 * ayer a las 9:20».
 */
export function desdeCuando(t: number, ahora: number): string {
  const dd = diasAtras(t, ahora);
  if (dd <= 0) return laHora(t);
  if (dd === 1) return `ayer a ${laHora(t)}`;
  if (dd < 7) return `el ${DIAS[new Date(t).getDay()]} a ${laHora(t)}`;
  const d = new Date(t);
  return `el ${d.getDate()} de ${MESES[d.getMonth()]} a ${laHora(t)}`;
}

/** Lo que lleva algo: «un minuto», «50 minutos», «una hora», «una hora y media», «3 horas», «un día», «2 días» (§3.3). */
export function hace(t: number, ahora: number): string {
  const m = Math.max(1, Math.round((ahora - t) / MINUTO_MS));
  if (m < 60) return m === 1 ? "un minuto" : `${m} minutos`;
  const h = m / 60;
  if (h < 1.25) return "una hora";
  if (h < 1.75) return "una hora y media";
  if (h < 23.5) return `${Math.round(h)} horas`;
  const d = Math.round(h / 24);
  return d === 1 ? "un día" : `${d} días`;
}

/** Cómo quedó «Lo nuevo» (§9): desde la última vez que se escuchó, la primera vez (cuenta hoy) o hace más de 7 días (cuenta 7 días). */
export type Nuevo = { k: "desde"; ultima: number } | { k: "primera" } | { k: "semana" };

export function nuevoDe(ultima: number | null, ahora: number): Nuevo {
  if (ultima === null || !Number.isFinite(ultima) || ultima <= 0 || ultima > ahora) return { k: "primera" };
  if (ahora - ultima > MAX_NUEVO_MS) return { k: "semana" };
  return { k: "desde", ultima };
}

/** Desde cuándo cuenta lo terminado (§9): «Lo nuevo» desde la última vez; sin ella, desde las 0:00 de hoy; de más de 7 días, 7 días. */
export function inicioDe(desde: Desde, ahora: number, ultima: number | null): number {
  switch (desde) {
    case "nuevo": {
      const n = nuevoDe(ultima, ahora);
      return n.k === "desde" ? n.ultima : n.k === "primera" ? inicioDelDia(ahora) : ahora - MAX_NUEVO_MS;
    }
    case "hoy":
      return inicioDelDia(ahora);
    case "24h":
      return ahora - DIA_MS;
    case "7d":
      return ahora - 7 * DIA_MS;
  }
}

/**
 * La explicación del menú, sin el número (§2.3): «Desde las 8:12, la última vez
 * que lo escuchaste», «Es la primera vez: te cuento lo de hoy», «Desde las 0:00
 * de hoy», «Desde ayer a esta hora», «Desde el sábado pasado a esta hora».
 */
export function explicacionDesde(desde: Desde, ahora: number, ultima: number | null): string {
  switch (desde) {
    case "nuevo": {
      const n = nuevoDe(ultima, ahora);
      if (n.k === "primera") return "Es la primera vez: te cuento lo de hoy";
      if (n.k === "semana") return "Hace más de una semana: te cuento los últimos 7 días";
      return `Desde ${desdeCuando(n.ultima, ahora)}, la última vez que lo escuchaste`;
    }
    case "hoy":
      return "Desde las 0:00 de hoy";
    case "24h":
      return "Desde ayer a esta hora";
    case "7d":
      return `Desde el ${DIAS[new Date(ahora).getDay()]} pasado a esta hora`;
  }
}

/**
 * El período al comienzo de la primera frase (§3.2.1): «Desde las 8:12, la
 * última vez que lo escuchaste», «Hoy», «En las últimas 24 horas», «En los
 * últimos 7 días». La primera vez toma lo de hoy y, de hace más de una
 * semana, los últimos 7 días.
 */
export function periodoFrase(desde: Desde, ahora: number, ultima: number | null): string {
  if (desde === "nuevo") {
    const n = nuevoDe(ultima, ahora);
    if (n.k === "primera") return "Hoy";
    if (n.k === "semana") return "En los últimos 7 días";
    return explicacionDesde("nuevo", ahora, ultima);
  }
  return desde === "hoy" ? "Hoy" : desde === "24h" ? "En las últimas 24 horas" : "En los últimos 7 días";
}

/** «hoy», «en las últimas 24 horas», «en los últimos 7 días» (para «No se terminó nada …», §3.3). */
export function periodoCorto(desde: Desde, ahora: number, ultima: number | null): string {
  const p = periodoFrase(desde, ahora, ultima);
  return p.charAt(0).toLowerCase() + p.slice(1);
}

/** El encabezado de «Texto» (§5): la explicación del menú, o «Hoy», «Desde ayer a esta hora»… */
export function periodoTexto(desde: Desde, ahora: number, ultima: number | null): string {
  if (desde === "nuevo") {
    const n = nuevoDe(ultima, ahora);
    if (n.k === "primera") return "Lo de hoy, la primera vez que lo escuchas";
    if (n.k === "semana") return "Los últimos 7 días";
  }
  return explicacionDesde(desde, ahora, ultima);
}
