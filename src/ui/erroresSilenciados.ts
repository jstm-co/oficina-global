// Los errores que el usuario silenció (JST-410): se guardan en `localStorage`,
// por navegador, con el patrón de `ajustes.ts`; las otras pestañas se enteran
// por el evento `storage`. La lógica pura está en `src/erroresViejos.ts`.
import { useSyncExternalStore } from "react";
import { escribirSilenciados, fijarProveedorSilenciados, leerSilenciados, limpiarSilenciados, reactivar, silenciar, type Silenciados } from "../erroresViejos.js";
import type { AgenteVista } from "../vista.js";

export const CLAVE_ERRORES_SILENCIADOS = "jstm.oficina-pixel.errores-silenciados";

let actuales: Silenciados | null = null;
const oyentes = new Set<() => void>();

function cargar(): Silenciados {
  try {
    return leerSilenciados(localStorage.getItem(CLAVE_ERRORES_SILENCIADOS));
  } catch {
    return leerSilenciados(null);
  }
}

export function erroresSilenciados(): Silenciados {
  actuales ??= cargar();
  return actuales;
}

function fijar(nuevos: Silenciados): void {
  if (nuevos === actuales) return;
  actuales = nuevos;
  try {
    localStorage.setItem(CLAVE_ERRORES_SILENCIADOS, escribirSilenciados(nuevos));
  } catch {
    // Sin almacenamiento local, vale solo para esta pestaña.
  }
  for (const o of oyentes) o();
}

export const silenciarError = (a: Pick<AgenteVista, "id" | "st" | "desde">): void => fijar(silenciar(erroresSilenciados(), a));
export const reactivarError = (agenteId: string): void => fijar(reactivar(erroresSilenciados(), agenteId));
/** Quita lo que ya no aplica (error arreglado o nuevo) de los agentes que están en la lista. */
export const limpiarErrores = (agentes: readonly Pick<AgenteVista, "id" | "st" | "desde">[]): void => fijar(limpiarSilenciados(erroresSilenciados(), agentes));

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== CLAVE_ERRORES_SILENCIADOS && e.key !== null) return;
    actuales = cargar();
    for (const o of oyentes) o();
  });
}

fijarProveedorSilenciados(erroresSilenciados);

export function alCambiarErroresSilenciados(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

export function useErroresSilenciados(): Silenciados {
  return useSyncExternalStore(alCambiarErroresSilenciados, erroresSilenciados);
}
