// El nivel del informe de «Leer contexto» (JST-414): corto o completo. Lo elige la
// persona en el panel escrito y vale para todos los lugares donde se lee (la barra de
// arriba de Paperclip, la ventana de responder, el modal de tarea y la franja «Te
// necesitan»), que viven en componentes distintos a la vez: por eso es un valor
// compartido con suscripción (`useSyncExternalStore`) y no un estado de React.
//
// Se guarda en `localStorage`; si el navegador no deja guardar (ventana privada,
// datos bloqueados), sirve igual mientras la pestaña siga abierta.
import { useSyncExternalStore } from "react";
import type { NivelInforme } from "./contextoInforme.js";

export const CLAVE_NIVEL = "jstm.oficina-pixel.contexto";
export const NIVEL_INICIAL: NivelInforme = "completo";

const esNivel = (v: unknown): v is NivelInforme => v === "corto" || v === "completo";

let actual: NivelInforme | null = null;
const oyentes = new Set<() => void>();

function leerGuardado(): NivelInforme {
  try {
    const v = globalThis.localStorage?.getItem(CLAVE_NIVEL);
    if (esNivel(v)) return v;
  } catch {
    // Sin almacenamiento: queda el de siempre.
  }
  return NIVEL_INICIAL;
}

/** El nivel que se lee ahora. */
export function nivelContexto(): NivelInforme {
  actual ??= leerGuardado();
  return actual;
}

/** Cambia el nivel: lo guarda (si se puede) y avisa a quien lo mira. */
export function fijarNivel(n: NivelInforme): void {
  if (!esNivel(n)) return;
  const cambia = nivelContexto() !== n;
  actual = n;
  try {
    globalThis.localStorage?.setItem(CLAVE_NIVEL, n);
  } catch {
    // No se pudo guardar: vale en memoria.
  }
  if (cambia) for (const o of [...oyentes]) o();
}

export function suscribirNivel(o: () => void): () => void {
  oyentes.add(o);
  return () => oyentes.delete(o);
}

/** Otra pestaña cambió la elección: esta la toma. */
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("storage", (e) => {
    if (e.key !== CLAVE_NIVEL) return;
    const n = esNivel(e.newValue) ? e.newValue : NIVEL_INICIAL;
    if (n === actual) return;
    actual = n;
    for (const o of [...oyentes]) o();
  });
}

/** Solo para las pruebas: vuelve a leer lo guardado la próxima vez. */
export function olvidarNivel(): void {
  actual = null;
}

export function useNivelContexto(): NivelInforme {
  return useSyncExternalStore(suscribirNivel, nivelContexto, () => NIVEL_INICIAL);
}
