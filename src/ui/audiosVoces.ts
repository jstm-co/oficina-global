// Los audios de las voces (JST-124): los genera una vez el generador en la Mac
// y quedan junto a la UI del plugin, en `/_plugins/<uuid>/ui/voces/`, con su
// `indice.json`. La página solo los lee y los toca: no carga modelos ni sale a
// internet. Solo con las voces encendidas (o al tocar «▶ Probar»).
import { useSyncExternalStore } from "react";
import { idInstalacion } from "../fuentes.js";
import { PLUGIN_KEY } from "../shared.js";
import { archivoVivo, audioDe, leerIndice, vozDeAgente, type IndiceVoces } from "../voces.js";

/** El índice se vuelve a leer cada 10 min (si se corrió el generador para un agente nuevo, sin recargar). */
const RELEER_MS = 10 * 60_000;

let base: Promise<string | null> | null = null;

/** `/_plugins/<uuid>/ui/`: en el TV está en la dirección; en Paperclip se pregunta una vez. La vista 3D carga su visor de ahí. */
export function baseUi(): Promise<string | null> {
  const m = typeof location !== "undefined" ? /^\/_plugins\/[^/]+\/ui\//.exec(location.pathname) : null;
  if (m) return Promise.resolve(m[0]);
  base ??= idInstalacion({ base: "" }, PLUGIN_KEY)
    .then((id) => (id ? `/_plugins/${encodeURIComponent(id)}/ui/` : null))
    .catch(() => null);
  return base;
}

let indice: IndiceVoces | null = null;
let leidoEn = 0;
let leyendo: Promise<IndiceVoces | null> | null = null;
const oyentes = new Set<() => void>();

/** El índice (lo lee si hace falta; `forzar`: otra vez, porque una voz nueva quedó lista). `null` si todavía no se generaron audios. */
export function cargarIndice(forzar = false): Promise<IndiceVoces | null> {
  if (!forzar && indice && Date.now() - leidoEn < RELEER_MS) return Promise.resolve(indice);
  leyendo ??= baseUi()
    .then(async (b) => {
      if (!b) return null;
      // Sin caché: el generador lo reescribe al sumar agentes.
      const r = await fetch(`${b}voces/indice.json?t=${Date.now()}`, { credentials: "include", cache: "no-store" });
      return r.ok ? leerIndice(await r.json()) : null;
    })
    .catch(() => null)
    .then((i) => {
      leyendo = null;
      leidoEn = Date.now();
      if (i) indice = i;
      for (const o of oyentes) o();
      return indice;
    });
  return leyendo;
}

/** Para el panel «Voces»: el índice ya leído (o `null`). */
export function useIndiceVoces(): IndiceVoces | null {
  return useSyncExternalStore(
    (o) => {
      oyentes.add(o);
      return () => oyentes.delete(o);
    },
    () => indice,
  );
}

const pedidos = new Map<string, { promesa: Promise<Blob | null>; desde: number }>();

/**
 * El audio de la frase de ese agente (o del resumen, sin agente), o `null` si
 * no está generado o no se pudo leer. Lo pedido hace menos de 30 s se reusa.
 */
export function pedirAudio(agenteId: string | null, texto: string): Promise<Blob | null> {
  const clave = `${agenteId ?? ""}|${texto}`;
  const ahora = Date.now();
  for (const [k, p] of pedidos) if (ahora - p.desde > 30_000) pedidos.delete(k);
  const ya = pedidos.get(clave);
  if (ya) return ya.promesa;
  const promesa = cargarIndice().then(async (i) => {
    const archivo = i ? audioDe(i, agenteId, texto) : null;
    const b = archivo ? await baseUi() : null;
    if (!archivo || !b) return null;
    try {
      const r = await fetch(`${b}voces/${archivo}`, { credentials: "include" });
      return r.ok ? await r.blob() : null;
    } catch {
      return null;
    }
  });
  pedidos.set(clave, { promesa, desde: ahora });
  void promesa.then((blob) => {
    if (!blob) pedidos.delete(clave);
  });
  return promesa;
}

/**
 * 0.5.0 (JST-167): el audio de una frase que dice de qué se trata. Si es de las
 * que se graban al instalar (el motivo de un error, la muestra de «Probar»),
 * está en el índice; si lleva el nombre de una tarea, lo preparó el worker en
 * `voces/vivo/` con un nombre que sale de la voz y el texto. Una sola lectura
 * (el MP3): si no está, `null` y se dice la frase de siempre.
 */
export function pedirAudioDetalle(agenteId: string | null, texto: string): Promise<Blob | null> {
  const clave = `${agenteId ?? ""}|${texto}`;
  const ahora = Date.now();
  const ya = pedidos.get(clave);
  if (ya && ahora - ya.desde <= 30_000) return ya.promesa;
  const promesa = cargarIndice().then(async (i) => {
    const voz = i ? vozDeAgente(i, agenteId) : null;
    const archivo = i ? (audioDe(i, agenteId, texto) ?? (voz ? archivoVivo(voz, texto) : null)) : null;
    const b = archivo ? await baseUi() : null;
    if (!archivo || !b) return null;
    try {
      const r = await fetch(`${b}voces/${archivo}`, { credentials: "include", cache: "no-store" });
      return r.ok ? await r.blob() : null;
    } catch {
      return null;
    }
  });
  pedidos.set(clave, { promesa, desde: ahora });
  void promesa.then((blob) => {
    if (!blob) pedidos.delete(clave);
  });
  return promesa;
}

const vivos = new Map<string, Promise<Blob | null>>();
/** De qué archivo es cada audio bajado (el registro de lo que suena, para las pruebas en la copia). */
const archivos = new WeakMap<Blob, string>();

export function archivoDeBlob(b: Blob): string | null {
  return archivos.get(b) ?? null;
}

/**
 * 0.6.0 (JST-226): un audio de `voces/vivo/` por su nombre (`archivoVivo`), o
 * `null` si todavía no está. Lo que llegó se guarda en esta pestaña (como
 * mucho 300): la conversación que se repite suena al tiro. Lo que falta se
 * vuelve a buscar la próxima vez.
 */
export function pedirArchivo(archivo: string): Promise<Blob | null> {
  const ya = vivos.get(archivo);
  if (ya) return ya;
  const promesa = baseUi().then(async (b) => {
    if (!b) return null;
    try {
      const r = await fetch(`${b}voces/${archivo}`, { credentials: "include", cache: "no-store" });
      const blob = r.ok ? await r.blob() : null;
      if (blob) archivos.set(blob, archivo);
      return blob;
    } catch {
      return null;
    }
  });
  vivos.set(archivo, promesa);
  void promesa.then((blob) => {
    if (!blob) vivos.delete(archivo);
    else if (vivos.size > 300) vivos.delete(vivos.keys().next().value!);
  });
  return promesa;
}

/** El audio de `vivo/` si esta pestaña ya lo bajó (o lo está bajando), sin pedirlo; `null` si no. */
export function yaBajado(archivo: string): Promise<Blob | null> | null {
  return vivos.get(archivo) ?? null;
}

/** El UUID de la instalación (para las acciones del worker), o `null`. */
export async function instalacion(): Promise<string | null> {
  const b = await baseUi();
  return b ? decodeURIComponent(b.split("/")[2] ?? "") || null : null;
}

/** Cuándo se pidió el audio de esa frase (el pedido que `pedirAudio` reusa), o `null` si no hay. */
export function pedidoDesde(agenteId: string | null, texto: string): number | null {
  return pedidos.get(`${agenteId ?? ""}|${texto}`)?.desde ?? null;
}
