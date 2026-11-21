// «Ahora» para la luz y los adornos (JST-416, etapa 2): un solo reloj para todas las salas, que avanza cada pocos
// minutos (`CADA_MS`) mientras alguna lo mire. Sin animaciones: lo que cambia entre una lectura y otra lo suaviza la
// hoja de estilos (y con «reducir movimiento» no se suaviza nada).
import { useSyncExternalStore } from "react";
import { CADA_MS } from "../luzSala.js";

let ahora = Date.now();
const oyentes = new Set<() => void>();
let reloj: ReturnType<typeof setInterval> | undefined;

/** Se exporta para probar el reloj compartido (que se limpia con el último suscriptor). */
export function suscribir(oyente: () => void): () => void {
  oyentes.add(oyente);
  if (oyentes.size === 1) {
    // Al volver a mirar, la hora puede haber quedado vieja (pestaña oculta mucho rato).
    ahora = Date.now();
    reloj = setInterval(() => {
      ahora = Date.now();
      for (const o of oyentes) o();
    }, CADA_MS);
  }
  return () => {
    oyentes.delete(oyente);
    if (oyentes.size === 0 && reloj !== undefined) {
      clearInterval(reloj);
      reloj = undefined;
    }
  };
}

/** La hora que tiene el reloj compartido (ms), tal como la lee `useAhora`. */
export function leerAhora(): number {
  return ahora;
}

/** La hora de ahora en ms, refrescada cada `CADA_MS`. */
export function useAhora(): number {
  return useSyncExternalStore(suscribir, leerAhora);
}
