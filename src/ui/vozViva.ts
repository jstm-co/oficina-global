// Lo que la página le pide al worker para las voces que dicen de qué se trata
// (0.5.0, JST-167, opción B del spike de JST-161): que prepare las frases con
// el nombre de la tarea de los agentes que empiezan a trabajar, y si en esta
// Mac se puede (`uv` y `ffmpeg`). Solo con las voces y ese interruptor
// prendidos: apagado no pide nada.
import { useEffect, useState } from "react";
import type { PedidoVoz } from "../vozViva.js";
import { ESPERA_EMPECE_MS } from "../empece.js";
import { accionPlugin } from "../fuentes.js";
import { instalacion } from "./audiosVoces.js";

/** Lo pedido hace menos de 10 min no se vuelve a pedir (si el worker se reinició, a los 10 min se pide de nuevo). */
const REPETIR_MS = 10 * 60_000;
const pedidos = new Map<string, number>();

const claveDe = (p: PedidoVoz) => `${p.agenteId}|${p.frase}|${p.presentacion}|${p.corto}|${p.empresa}|${p.tarea}${p.pide ? `|${p.pide.tipo}|${p.pide.mas}|${p.pide.texto}` : ""}${p.duracion ? `|${p.duracion}` : ""}`;

/** Lo más que el worker tiene abierta una espera (`ESPERA_MAX_MS`: el RPC corta a los 30 s); para esperar más, se le vuelve a preguntar. */
const POR_LLAMADA_MS = 25_000;

/**
 * Le pide al worker las frases que falten (una sola vez cada una en 10 min).
 * `companyId`: el host revisa que el usuario vea esa empresa. Devuelve cuántas
 * se pidieron.
 */
export async function prepararFrases(companyId: string, lista: readonly PedidoVoz[], ahora = Date.now()): Promise<number> {
  for (const [k, t] of pedidos) if (ahora - t > REPETIR_MS) pedidos.delete(k);
  const nuevos = lista.filter((p) => !pedidos.has(claveDe(p)));
  if (nuevos.length === 0) return 0;
  for (const p of nuevos) pedidos.set(claveDe(p), ahora);
  const id = await instalacion().catch(() => null);
  if (!id) {
    for (const p of nuevos) pedidos.delete(claveDe(p));
    return 0;
  }
  const r = await accionPlugin<{ listas: number; enFila: number; saltadas: number }>({ base: "" }, id, "voz-preparar", companyId, { pedidos: nuevos }).catch(() => null);
  // Si no respondió (el worker se reinicia), se puede volver a pedir.
  if (!r) for (const p of nuevos) pedidos.delete(claveDe(p));
  return nuevos.length;
}

/**
 * «Empecé» con la tarea (JST-194) o «te necesito» con la pregunta (0.8.0, con
 * `plazo` de `ESPERA_PREGUNTA_MS`): le pide al worker esa frase (delante en su
 * fila) y vuelve cuando está, o al `plazo` desde que se le pidió por primera
 * vez (en cola, al asignarla o recién ahora). Un plazo de más de 25 s se espera
 * en dos llamadas. `true` si está lista.
 */
export async function esperarFrase(companyId: string, p: PedidoVoz, ahora = Date.now(), plazo = ESPERA_EMPECE_MS): Promise<boolean> {
  const clave = claveDe(p);
  const desde = pedidos.get(clave) ?? ahora;
  let ms = desde + plazo - ahora;
  if (ms <= 0) return false;
  const fin = Date.now() + ms;
  // Así `prepararFrases` no la vuelve a pedir.
  pedidos.set(clave, desde);
  const id = await instalacion().catch(() => null);
  for (;;) {
    const pedidoMs = Math.min(ms, POR_LLAMADA_MS);
    const t0 = Date.now();
    const r = id ? await accionPlugin<{ estado: string }>({ base: "" }, id, "voz-esperar", companyId, { pedido: p, ms: pedidoMs }).catch(() => null) : null;
    if (!r) {
      pedidos.delete(clave);
      return false;
    }
    // Se vuelve a preguntar solo si el worker esperó lo pedido (un «tarde» antes de tiempo no deja dando vueltas).
    if (r.estado !== "tarde" || ms <= POR_LLAMADA_MS || Date.now() - t0 < pedidoMs - 1_000) return r.estado === "lista";
    ms = fin - Date.now();
    if (ms <= 0) return false;
  }
}

export interface EstadoVozViva {
  disponible: boolean;
  motivo: string | null;
}

let estado: Promise<EstadoVozViva | null> | null = null;
let estadoEn = 0;

/** Si el worker puede preparar las frases en esta Mac (se pregunta al abrir el panel, como mucho cada 5 min). */
export function estadoVozViva(companyId: string): Promise<EstadoVozViva | null> {
  if (!estado || Date.now() - estadoEn > 5 * 60_000) {
    estadoEn = Date.now();
    estado = instalacion()
      .then((id) => (id ? accionPlugin<EstadoVozViva>({ base: "" }, id, "voz-estado", companyId, {}) : null))
      .catch(() => null);
  }
  return estado;
}

/** Para el panel «Voces»: `null` mientras no se sabe (o si el worker no responde: se deja prender igual). */
export function useEstadoVozViva(companyId: string | null, activo: boolean): EstadoVozViva | null {
  const [e, setE] = useState<EstadoVozViva | null>(null);
  useEffect(() => {
    if (!activo || !companyId) return;
    let vivo = true;
    void estadoVozViva(companyId).then((x) => vivo && setE(x));
    return () => {
      vivo = false;
    };
  }, [companyId, activo]);
  return e;
}
