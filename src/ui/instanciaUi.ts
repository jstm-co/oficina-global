// Los datos de la instancia (`src/datosInstancia.ts`) en el navegador: el worker los publica en `<ui>/instancia.json`
// al arrancar. Se leen una vez por pestaña, antes de que el sincronizador empiece (useOficina.ts): ningún agente
// se dibuja ni se nombra sin ellos. Cualquier falla deja los datos vacíos, y pasados 4 s la oficina sigue igual.
import { leerDatosInstancia, ponerInstancia } from "../datosInstancia.js";
import { baseUi } from "./audiosVoces.js";

/** Lo máximo que la oficina espera por el archivo. */
export const TOPE_INSTANCIA_MS = 4000;

let cargada: Promise<void> | null = null;
const oyentes = new Set<() => void>();

/** Avisa cuando los datos llegan después de que la oficina ya partió (pasado el tope): hay que volver a dibujar. */
export function alLlegarInstanciaTarde(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

/**
 * Lee `instancia.json` de la interfaz y lo deja puesto en el registro. Nunca lanza ni tarda más de 4 s.
 * Memorizada solo si se pudo leer: si falló (el worker todavía no publicó, un error del servidor o de la red),
 * la próxima llamada vuelve a intentar. Si el archivo llega después del tope, igual se pone y se avisa.
 */
export function cargarInstancia(): Promise<void> {
  if (cargada) return cargada;
  let tarde = false;
  const intento = new Promise<void>((resolver) => {
    const reloj = setTimeout(() => {
      tarde = true;
      resolver();
    }, TOPE_INSTANCIA_MS);
    void (async () => {
      const base = await baseUi();
      if (!base) throw new Error("sin base");
      const r = await fetch(`${base}instancia.json?t=${Date.now()}`, { credentials: "include", cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      ponerInstancia(leerDatosInstancia(await r.json()));
      if (tarde) for (const oyente of oyentes) oyente();
    })()
      .catch(() => {
        if (cargada === intento) cargada = null; // no se pudo: la próxima vez se intenta de nuevo
      })
      .then(() => {
        clearTimeout(reloj);
        resolver();
      });
  });
  cargada = intento;
  return intento;
}

/** Solo para las pruebas: olvida lo memorizado. */
export function olvidarInstanciaCargada(): void {
  cargada = null;
}
