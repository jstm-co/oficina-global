// La voz de las frases armadas al momento (JST-415): el recordatorio de espera, «mientras no estabas», «ya no queda nadie
// trabajando» y la racha de errores no tienen audio grabado (cada nombre y cada número serían otro audio por voz). Suenan
// con la voz elegida para el Resumen y por el mismo camino de las frases libres del Resumen y de «Leer contexto»: el
// worker graba cada trozo con `voz-resumen` (queda en `voces/vivo/`) y esta pestaña lo baja. Si el audio no llega en
// unos segundos, quien llama (`sonido.ts`) dice la frase con la voz del navegador, como antes: nunca queda mudo.
//
// Se lo pide el camino de «Leer contexto» (`trozosParaMotor` de `contextoMotor.ts`, que limpia lo que el worker rechaza y
// corta lo largo) pero sin el motor del Resumen, que está hecho para una lectura entera con su `<audio>`: aquí sale un
// solo audio por frase libre, que toca `tocarVoz` de `sonido.ts`.
import { accionPlugin } from "../fuentes.js";
import { FRASES_POR_PEDIDO } from "../resumen/voz.js";
import { archivoVivo, type VozId } from "../voces.js";
import { instalacion, pedirArchivo, yaBajado } from "./audiosVoces.js";
import { trozosParaMotor } from "./contextoMotor.js";
import { vozParaLeer } from "./eleccion.js";

/** Lo más que se espera el audio de una frase libre antes de decirla con la voz del navegador. */
export const ESPERA_VOZ_LIBRE_MS = 6_000;
/** Un audio pedido sirve este rato (lo pide `ponerLibre` al ponerla en la cola; la dice la cola unos segundos después). */
const VIGENCIA_MS = 90_000;

const espera = (ms: number) => new Promise<void>((ok) => setTimeout(ok, Math.max(0, ms)));
const conPlazo = <T>(p: Promise<T>, hasta: number): Promise<T | null> => Promise.race([p, espera(hasta - Date.now()).then(() => null)]);

/**
 * Un contador de generación: lo que espera su audio anota la generación en que empezó y, antes de sonar, mira si sigue
 * siendo la misma. `cancelar` (cuando se callan los avisos: empieza el Resumen o «Leer contexto») la cambia y lo pendiente
 * ya no suena, ni siquiera con la voz del navegador.
 */
export function generacionDeAvisos(): { actual(): number; cancelar(): void; vigente(g: number): boolean } {
  let g = 0;
  return { actual: () => g, cancelar: () => void g++, vigente: (x) => x === g };
}

const pedidos = new Map<string, { promesa: Promise<Blob[] | null>; desde: number }>();

/**
 * Pide al worker el audio de esa frase con la voz elegida para el Resumen y lo baja: los trozos en orden, o `null` si
 * eligieron la voz del navegador, no hay worker, la frase no se puede decir o el audio no llegó en `ms`.
 */
export function audioDeFraseLibre(texto: string, companyId: string | null, ms = ESPERA_VOZ_LIBRE_MS): Promise<Blob[] | null> {
  const ahora = Date.now();
  for (const [k, p] of pedidos) if (ahora - p.desde > VIGENCIA_MS) pedidos.delete(k);
  const clave = `${companyId ?? ""}|${texto}`;
  const ya = pedidos.get(clave);
  if (ya) return ya.promesa;
  const promesa = pedir(texto, companyId, ahora + ms).catch(() => null);
  pedidos.set(clave, { promesa, desde: ahora });
  void promesa.then((b) => {
    if (!b) pedidos.delete(clave);
  });
  return promesa;
}

async function pedir(texto: string, companyId: string | null, hasta: number): Promise<Blob[] | null> {
  const voz: VozId | null = await conPlazo(vozParaLeer("resumen", companyId).catch(() => null), hasta);
  const trozos = trozosParaMotor(texto).slice(0, FRASES_POR_PEDIDO);
  if (!voz || !companyId || trozos.length === 0) return null;
  const id = instalacion().catch(() => null);
  const resumen = `l${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const archivos = trozos.map((t) => archivoVivo(voz, t));
  // Lo que ya bajó esta pestaña no se vuelve a pedir; lo demás, al worker, hasta el plazo.
  let listos = (await Promise.all(archivos.map((a) => yaBajado(a)))).every(Boolean);
  const inst = await id;
  while (!listos && inst && Date.now() < hasta) {
    const r = await accionPlugin<{ estados: string[] }>({ base: "" }, inst, "voz-resumen", companyId, { voz, resumen, frases: trozos, ms: Math.max(0, Math.min(25_000, hasta - Date.now())) }).catch(() => null);
    if (!r || !Array.isArray(r.estados)) {
      await espera(Math.min(400, hasta - Date.now()));
      continue;
    }
    if (r.estados.includes("no")) return null;
    listos = r.estados.length >= trozos.length && r.estados.slice(0, trozos.length).every((e) => e === "lista");
  }
  if (!listos) return null;
  const blobs = await Promise.all(archivos.map((a) => conPlazo(pedirArchivo(a), hasta)));
  return blobs.every((b): b is Blob => !!b) ? blobs : null;
}
