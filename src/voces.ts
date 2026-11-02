// Las voces de la Oficina (JST-124; 9 hasta la 0.12, 19 desde la 0.13.0), sin React, navegador ni Node: las usan
// el generador (`generador/`, que hace los audios una vez en la Mac) y la
// página (que solo los reproduce).
//
// - Lorenzo y Catalina: voces chilenas de Microsoft (Edge TTS).
// - Alex, Dora y Santa: Kokoro-82M.
// - 4 clones de un hombre y una mujer chilenos (Google Crowdsourced Chilean
//   Spanish, OpenSLR 71, CC BY-SA 4.0): 2 con Chatterbox y 2 con Qwen3-TTS.
//
// - 0.13.0 (issue #9): 10 voces de Supertonic 3 (5 de mujer y 5 de hombre), que
//   corren en Node con sherpa-onnx, sin Python ni ffmpeg. Sus audios son WAV.
//
// Qué voz tiene cada agente lo decide el generador (repartidas para que se usen
// todas) y queda en `indice.json`, junto a los audios.
//
// 0.5.0 (JST-167, opción B del spike de JST-161): las frases que dicen de qué
// se trata (con el nombre de la tarea) las prepara el worker del plugin cuando
// el agente empieza la tarea, en `voces/vivo/`. El nombre de cada audio sale de
// la voz y el texto (`archivoVivo`): la página lo calcula igual y lo pide; si no
// está, dice la frase de siempre.

import { duracionWav } from "./audio.js";

export type VozSupertonic = `supertonic-${"f" | "m"}${1 | 2 | 3 | 4 | 5}`;
export type VozId = "lorenzo" | "catalina" | "alex" | "dora" | "santa" | "chatterbox-hombre" | "chatterbox-mujer" | "qwen3-hombre" | "qwen3-mujer" | VozSupertonic;
export type Motor = "edge" | "kokoro" | "chatterbox" | "qwen3" | "supertonic";

export interface Voz {
  id: VozId;
  /** Cómo se nombra en el panel «Voces». */
  nombre: string;
  detalle: string;
  motor: Motor;
  /** La voz en su motor, o el audio de referencia que se clona (en Supertonic, su número: «0» a «9»). */
  clave: string;
}

/**
 * 0.13.0: F1 a F5 son las voces 0 a 4 del modelo y M1 a M5, de la 5 a la 9
 * (medido: ~155–195 Hz las primeras y ~85–120 Hz las otras).
 */
const SUPERTONIC: readonly Voz[] = (["f", "m"] as const).flatMap((g, i) =>
  ([1, 2, 3, 4, 5] as const).map((n) => ({
    id: `supertonic-${g}${n}` as const,
    nombre: `Supertonic ${g.toUpperCase()}${n}`,
    detalle: `${g === "f" ? "mujer" : "hombre"} · Supertonic`,
    motor: "supertonic" as const,
    clave: String(i * 5 + n - 1),
  })),
);

export const VOCES: readonly Voz[] = [
  { id: "lorenzo", nombre: "Lorenzo", detalle: "hombre, chileno · Edge", motor: "edge", clave: "es-CL-LorenzoNeural" },
  { id: "catalina", nombre: "Catalina", detalle: "mujer, chilena · Edge", motor: "edge", clave: "es-CL-CatalinaNeural" },
  { id: "alex", nombre: "Alex", detalle: "hombre · Kokoro", motor: "kokoro", clave: "em_alex" },
  { id: "dora", nombre: "Dora", detalle: "mujer · Kokoro", motor: "kokoro", clave: "ef_dora" },
  { id: "santa", nombre: "Santa", detalle: "hombre · Kokoro", motor: "kokoro", clave: "em_santa" },
  { id: "chatterbox-hombre", nombre: "Clon chileno (Chatterbox)", detalle: "clon de un hombre chileno · Chatterbox", motor: "chatterbox", clave: "ref_hombre_cl" },
  { id: "chatterbox-mujer", nombre: "Clon chilena (Chatterbox)", detalle: "clon de una mujer chilena · Chatterbox", motor: "chatterbox", clave: "ref_mujer_cl" },
  { id: "qwen3-hombre", nombre: "Clon chileno (Qwen3)", detalle: "clon del mismo hombre chileno · Qwen3", motor: "qwen3", clave: "ref_hombre_cl" },
  { id: "qwen3-mujer", nombre: "Clon chilena (Qwen3)", detalle: "clon de la misma mujer chilena · Qwen3", motor: "qwen3", clave: "ref_mujer_cl" },
  ...SUPERTONIC,
];

/** La voz de los resúmenes («3 agentes terminaron»): rápida de generar y clara. */
export const VOZ_RESUMEN: VozId = "catalina";

const POR_ID = new Map(VOCES.map((v) => [v.id, v]));

export function vozPorId(id: unknown): Voz | null {
  return typeof id === "string" ? (POR_ID.get(id as VozId) ?? null) : null;
}

/** Lo que deja el generador en `dist/ui/voces/indice.json`. */
export interface IndiceVoces {
  version: 1;
  generado: string;
  resumen: VozId;
  /** Id del agente → su voz. */
  agentes: Record<string, VozId>;
  /** `claveAudio(voz, texto)` → archivo (en la misma carpeta). */
  audios: Record<string, string>;
}

/** `voz` es una de las 9 (o, desde la 0.6.0, la de una mascota: «mascota-gato»). */
export const claveAudio = (voz: VozId | string, texto: string) => `${voz}|${texto}`;

/** La voz de un agente según el índice; sin agente, la de los resúmenes. `null` si el agente no tiene (es nuevo). */
export function vozDeAgente(indice: IndiceVoces, agenteId: string | null): VozId | null {
  if (!agenteId) return indice.resumen;
  return indice.agentes[agenteId] ?? null;
}

/** El archivo de la frase de ese agente (o del resumen), o `null` si no se generó. */
export function audioDe(indice: IndiceVoces, agenteId: string | null, texto: string): string | null {
  const voz = vozDeAgente(indice, agenteId);
  return voz ? (indice.audios[claveAudio(voz, texto)] ?? null) : null;
}

/** Un índice leído de la red, o `null` si no tiene la forma esperada. */
export function leerIndice(datos: unknown): IndiceVoces | null {
  const d = datos as Partial<IndiceVoces> | null;
  if (!d || d.version !== 1 || typeof d.agentes !== "object" || typeof d.audios !== "object" || !vozPorId(d.resumen)) return null;
  return d as IndiceVoces;
}

/** El motor de una voz. */
export function motorDe(voz: VozId): Motor {
  return vozPorId(voz)!.motor;
}

/** La carpeta (dentro de `voces/`) de las frases que prepara el worker al momento (0.5.0). */
export const CARPETA_VIVO = "vivo";
/** Súbelo si cambia cómo se dicen (los audios hechos antes ya no se usan). */
export const VERSION_VIVO = 1;

/**
 * cyrb53: un hash de 53 bits, igual en el worker (Node) y en la página. La
 * página no puede usar `crypto.subtle`: con http no existe.
 */
export function hash53(texto: string, semilla = 0): number {
  let h1 = 0xdeadbeef ^ semilla;
  let h2 = 0x41c6ce57 ^ semilla;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** 0.13.0: los audios de Supertonic son WAV (salen sin ffmpeg); los demás, MP3. Las mascotas son de Edge. */
export function extensionDe(voz: VozId | string): "wav" | "mp3" {
  return vozPorId(voz)?.motor === "supertonic" ? "wav" : "mp3";
}

/** El audio de una frase preparada al momento: `vivo/<voz>-<hash>.mp3` (o `.wav`), el mismo para el worker y la página. */
export function archivoVivo(voz: VozId | string, texto: string): string {
  return `${CARPETA_VIVO}/${voz}-${hash53(`v${VERSION_VIVO}|${claveAudio(voz, texto)}`).toString(36)}.${extensionDe(voz)}`;
}

const BITRATES: Readonly<Record<"1" | "2", readonly number[]>> = {
  "1": [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  "2": [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const MUESTREOS: Readonly<Record<number, readonly number[]>> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

/**
 * Cuánto dura un MP3 (ms), contando sus cuadros (0.6.0, JST-226): con eso el
 * globo de una conversación dura lo que su audio + 0,4 s si el audio es más
 * largo (punto 5 del spike de JST-224). Los de las voces son MP3 de 48 kbps a
 * 24 kHz que hace ffmpeg, con su cuadro «Info» al comienzo (que no suena: si
 * trae cuántos cuadros hay, se usa eso). `null` si no es un MP3.
 */
export function duracionMp3(b: Uint8Array): number | null {
  let i = 0;
  if (b.length >= 10 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) {
    const tam = ((b[6]! & 0x7f) << 21) | ((b[7]! & 0x7f) << 14) | ((b[8]! & 0x7f) << 7) | (b[9]! & 0x7f);
    i = 10 + tam + (b[5]! & 0x10 ? 10 : 0);
  }
  let cuadros = 0;
  let muestras = 0;
  let muestreo = 0;
  let primero = true;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff || (b[i + 1]! & 0xe0) !== 0xe0) {
      i += 1;
      continue;
    }
    const version = (b[i + 1]! >> 3) & 3;
    const capa = (b[i + 1]! >> 1) & 3;
    const br = (b[i + 2]! >> 4) & 0xf;
    const sr = (b[i + 2]! >> 2) & 3;
    if (version === 1 || capa !== 1 || br === 0 || br === 15 || sr === 3) {
      i += 1;
      continue;
    }
    const mpeg1 = version === 3;
    const kbps = BITRATES[mpeg1 ? "1" : "2"][br]!;
    const hz = MUESTREOS[version]![sr]!;
    const porCuadro = mpeg1 ? 1152 : 576;
    const largo = Math.floor(((mpeg1 ? 144 : 72) * kbps * 1000) / hz) + ((b[i + 2]! >> 1) & 1);
    if (primero) {
      primero = false;
      muestreo = hz;
      // El cuadro «Xing» o «Info» (después de la información lateral) trae cuántos cuadros hay.
      const mono = (b[i + 3]! >> 6) === 3;
      const lateral = mpeg1 ? (mono ? 17 : 32) : mono ? 9 : 17;
      const k = i + 4 + lateral;
      const marca = String.fromCharCode(...b.subarray(k, k + 4));
      if (marca === "Xing" || marca === "Info") {
        const flags = ((b[k + 4]! << 24) | (b[k + 5]! << 16) | (b[k + 6]! << 8) | b[k + 7]!) >>> 0;
        if (flags & 1) {
          const n = ((b[k + 8]! << 24) | (b[k + 9]! << 16) | (b[k + 10]! << 8) | b[k + 11]!) >>> 0;
          return Math.round((n * porCuadro * 1000) / hz);
        }
        i += largo;
        continue;
      }
    }
    cuadros += 1;
    muestras += porCuadro;
    i += Math.max(1, largo);
  }
  return cuadros > 0 && muestreo > 0 ? Math.round((muestras * 1000) / muestreo) : null;
}

/** 0.13.0: cuánto dura un audio de las voces (ms), sea WAV (Supertonic) o MP3; `null` si no es ninguno. */
export function duracionAudio(b: Uint8Array): number | null {
  return duracionWav(b) ?? duracionMp3(b);
}
