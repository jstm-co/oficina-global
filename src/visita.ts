// El aviso «mientras no estabas» al abrir la Oficina (JST-415), sin React ni navegador: cuándo toca y con qué números. La
// primera mitad lo hizo solo al volver a una pestaña oculta; aquí, al abrir la página después de una ausencia larga. Los
// números salen de la misma capa de datos del Resumen (`src/resumen/`), sin IA y con una lectura por empresa.
import type { DatosVolver } from "./dichos.js";
import { permiteExtras, type Nivel } from "./nivel.js";
import { esErrorViejo, SIN_SILENCIADOS, type Silenciados } from "./erroresViejos.js";
import type { AgenteVista } from "./vista.js";

/** Dónde se guarda la hora de la última visita (en este navegador). */
export const CLAVE_VISITA = "jstm.oficina-pixel.visita";
/** Desde cuántos minutos sin visitar la Oficina se cuenta lo que pasó. */
export const AUSENCIA_ABRIR_MS = 60 * 60_000;
/** Lo más atrás que se cuenta (como el Resumen: 7 días). */
export const MAX_ATRAS_MS = 7 * 24 * 60 * 60_000;

/** Lo guardado, tolerante: un número de ms o su texto; cualquier otra cosa es «no hay última visita». */
export function leerVisita(x: unknown): number | null {
  const n = typeof x === "string" ? Number(x) : x;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

/** Lo mínimo que se pide al almacenamiento (`localStorage` en el navegador, un objeto de mentira en las pruebas). */
export interface AlmacenVisita {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

const almacenLocal = (): AlmacenVisita | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

/** La última visita guardada por cualquier pestaña, o `null` (nunca, o sin almacenamiento). */
export function visitaGuardada(almacen: AlmacenVisita | null = almacenLocal()): number | null {
  try {
    return leerVisita(almacen?.getItem(CLAVE_VISITA));
  } catch {
    return null;
  }
}

/** Guarda la hora de esta visita. Sin almacenamiento no hay con qué comparar la próxima vez: simplemente no avisa. */
export function guardarVisita(ahora = Date.now(), almacen: AlmacenVisita | null = almacenLocal()): void {
  try {
    almacen?.setItem(CLAVE_VISITA, String(ahora));
  } catch {
    // Sin almacenamiento local.
  }
}

/** Cada cuánto se guarda la visita mientras la página se ve. */
export const GUARDAR_VISITA_CADA_MS = 60_000;

/**
 * Cuándo se guarda la visita (JST-415): al ocultarse la página, al volver a verse, y cada minuto mientras se ve
 * (un solo reloj, que se limpia al ocultarse y al detener). Así la última visita es la última vez que alguna
 * pestaña de la Oficina se vio de verdad, y ni «mientras no estabas» ni abrir otra pestaña cuentan dos veces lo mismo.
 * Al volver a verse guarda en un instante aparte (`setTimeout` 0): así los demás oyentes de ese mismo cambio
 * todavía leen la visita anterior.
 */
export function guardadorDeVisita(o: { guardar: () => void; visible: () => boolean }): { cambioDeVisibilidad(): void; arrancar(): void; detener(): void } {
  let reloj: ReturnType<typeof setInterval> | null = null;
  let pendiente: ReturnType<typeof setTimeout> | null = null;
  const parar = () => {
    if (reloj) clearInterval(reloj);
    reloj = null;
  };
  const arrancar = () => {
    if (reloj || !o.visible()) return;
    reloj = setInterval(() => {
      if (o.visible()) o.guardar();
    }, GUARDAR_VISITA_CADA_MS);
  };
  return {
    arrancar,
    cambioDeVisibilidad() {
      if (o.visible()) {
        if (pendiente) clearTimeout(pendiente);
        pendiente = setTimeout(() => {
          pendiente = null;
          o.guardar();
        }, 0);
        arrancar();
      } else {
        parar();
        o.guardar();
      }
    },
    detener() {
      parar();
      if (pendiente) clearTimeout(pendiente);
      pendiente = null;
    },
  };
}

/**
 * Desde cuándo cuenta «mientras no estabas» al volver a la pestaña: el más tardío entre cuándo se ocultó esta pestaña,
 * desde cuándo vigila y la última visita guardada (cualquier pestaña visible la guarda). Si trabajaste 30 min en otra
 * pestaña de la Oficina, la ausencia empieza ahí, no cuando esta se ocultó.
 */
export function inicioDeAusencia(o: { ocultaDesde: number; vigilandoDesde: number; ultimaVisita: number | null; ahora: number }): number {
  const v = o.ultimaVisita !== null && o.ultimaVisita <= o.ahora ? o.ultimaVisita : 0;
  return Math.max(o.ocultaDesde, o.vigilandoDesde, v);
}

/**
 * ¿Toca contar lo que pasó? Con una última visita de hace 60 minutos o más (la primera vez no hay con qué comparar), en
 * un nivel que deje los extras (en «tranquilo» no sale), con la casilla de «volver» prendida y con los avisos o las voces
 * encendidos (`activo`): con todo apagado, que es lo que viene por omisión, no se lee nada de la API. Devuelve desde cuándo
 * contar (nunca más de 7 días atrás).
 */
export function cuentaAlAbrir(o: { ultima: number | null; ahora: number; nivel: Nivel; activo?: boolean; casilla?: boolean }): { desde: number } | null {
  if (o.activo === false || o.casilla === false) return null;
  if (o.ultima === null || o.ultima > o.ahora || !permiteExtras(o.nivel)) return null;
  if (o.ahora - o.ultima < AUSENCIA_ABRIR_MS) return null;
  return { desde: Math.max(o.ultima, o.ahora - MAX_ATRAS_MS) };
}

/**
 * Cuántos agentes tienen un error que empezó desde `desde` (sin los viejos o silenciados). Un error sin fecha no cuenta:
 * no se sabe si es de este rato.
 */
export function erroresDesde(agentes: ReadonlyArray<Pick<AgenteVista, "id" | "st" | "desde">>, desde: number, ahora: number, silenciados: Silenciados = SIN_SILENCIADOS): number {
  return agentes.filter((a) => {
    if (a.st !== "error" || !a.desde || esErrorViejo(a, ahora, silenciados)) return false;
    const t = Date.parse(a.desde);
    return !Number.isNaN(t) && t >= desde;
  }).length;
}

/**
 * Los números del aviso: lo terminado desde entonces, lo que empezó a esperarte desde entonces (`esperanDesde`) y los
 * errores nuevos. Lo bloqueado no se sabe sin otra lectura: va en 0.
 */
export function datosAlAbrir(o: { hechas: number; esperan: number; errores: number }): DatosVolver {
  return { terminaron: o.hechas, bloqueados: 0, esperan: o.esperan, errores: o.errores };
}
