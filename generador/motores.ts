// Los motores de las voces y la conversión a MP3 (JST-124), compartidos por el
// generador (`npm run voces`, una vez en la Mac) y, desde la 0.5.0, por el
// worker del plugin, que prepara al momento las frases con el nombre de la
// tarea (JST-167). Cada motor corre en su propio proceso, con `uv`.
//
// 0.13.0 (issue #9): Supertonic corre con el mismo Node (`dist/motor_supertonic.mjs`,
// con sherpa-onnx-node), sin `uv` ni ffmpeg, y el worker baja los modelos de
// Supertonic y de Kokoro cuando se aprieta «Preparar voces».
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Motor } from "../src/voces.js";

export const LUFS = -19;

/** Un modelo que se baja una vez: de dónde, sus archivos con su SHA-256 y su tamaño, y dónde queda. */
export interface Modelo {
  nombre: string;
  dir: string;
  base: string;
  archivos: ReadonlyArray<{ archivo: string; sha: string; bytes: number }>;
}

export const KOKORO_DIR = join(homedir(), ".cache", "oficina-voces", "kokoro");
/** Los mismos archivos que se usaron en las pruebas del usuario (github.com/thewh1teagle/kokoro-onnx). */
export const MODELO_KOKORO: Modelo = {
  nombre: "Kokoro",
  dir: KOKORO_DIR,
  base: "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0",
  archivos: [
    { archivo: "kokoro-v1.0.onnx", sha: "7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5", bytes: 325_532_387 },
    { archivo: "voices-v1.0.bin", sha: "bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d", bytes: 28_214_398 },
  ],
};

export const SUPERTONIC_DIR = join(homedir(), ".cache", "oficina-voces", "supertonic-3-int8");
/**
 * 0.13.0: Supertonic 3 en int8 (`sherpa-onnx-supertonic-3-tts-int8-2026-05-11`,
 * 145 MB), del Hugging Face de Fangjun Kuang, el autor de sherpa-onnx, fijo en
 * un commit. Son los mismos archivos del release `tts-models` de sherpa-onnx en
 * GitHub (un .tar.bz2, que Node no abre sin otra dependencia). El modelo es de
 * Supertone, con licencia OpenRAIL-M (ver AVISOS.md).
 */
export const MODELO_SUPERTONIC: Modelo = {
  nombre: "Supertonic",
  dir: SUPERTONIC_DIR,
  base: "https://huggingface.co/csukuangfj2/sherpa-onnx-supertonic-3-tts-int8-2026-05-11/resolve/cca5a0e6c96e1d2c720986bf7e75fcc81dee3ae4",
  archivos: [
    { archivo: "tts.json", sha: "42078d3aef1cd43ab43021f3c54f47d2d75ceb4e75f627f118890128b06a0d09", bytes: 8_253 },
    { archivo: "unicode_indexer.bin", sha: "8402ca48e5189a8950138580b0fff64db6f072f24ac07cd54ba8b2fbb9883b30", bytes: 262_144 },
    { archivo: "voice.bin", sha: "67d5209b0ee8ce6c74105ffbe12fe6a7628aea3b4ba2fcb308a4a67938a93ce8", bytes: 517_168 },
    { archivo: "duration_predictor.int8.onnx", sha: "c3eb91414d5ff8a7a239b7fe9e34e7e2bf8a8140d8375ffb14718b1c639325db", bytes: 3_700_147 },
    { archivo: "text_encoder.int8.onnx", sha: "c7befd5ea8c3119769e8a6c1486c4edc6a3bc8365c67621c881bbb774b9902ff", bytes: 36_416_150 },
    { archivo: "vocoder.int8.onnx", sha: "e923d60f53f95eb1ce235f1dc33ec56d9c057823c96fa6f8acf98f32b0da6152", bytes: 25_991_073 },
    { archivo: "vector_estimator.int8.onnx", sha: "20cd86fa5c6effedfda0e7cffe5b0569ca401c440a0c3a1d72bf39286c0db3fd", bytes: 78_400_833 },
  ],
};

/** Lo que pesa un modelo entero, en bytes. */
export const pesoModelo = (m: Modelo) => m.archivos.reduce((s, a) => s + a.bytes, 0);

/** Están todos sus archivos, con su tamaño (el SHA-256 se revisa al bajarlos). */
export function hayModelo(m: Modelo): boolean {
  return m.archivos.every((a) => {
    try {
      return statSync(join(m.dir, a.archivo)).size === a.bytes;
    } catch {
      return false;
    }
  });
}

/**
 * Baja lo que falte de un modelo, de a un archivo, y revisa su SHA-256 antes de
 * dejarlo (escrito aparte y renombrado). `alAvanzar`: los bytes que ya están de
 * todo el modelo. Si `cortar` se activa, deja lo que estaba bajando.
 */
export async function bajarModelo(m: Modelo, alAvanzar: (bytes: number, total: number) => void = () => undefined, cortar?: AbortSignal): Promise<void> {
  mkdirSync(m.dir, { recursive: true });
  const total = pesoModelo(m);
  let listos = 0;
  for (const a of m.archivos) {
    const destino = join(m.dir, a.archivo);
    if (existsSync(destino) && statSync(destino).size === a.bytes) {
      listos += a.bytes;
      alAvanzar(listos, total);
      continue;
    }
    const r = await fetch(`${m.base}/${a.archivo}`, { signal: cortar });
    if (!r.ok || !r.body) throw new Error(`${a.archivo}: ${r.status}`);
    const h = createHash("sha256");
    let llegados = 0;
    const cuerpo = Readable.fromWeb(r.body as import("node:stream/web").ReadableStream<Uint8Array>);
    cuerpo.on("data", (b: Buffer) => {
      h.update(b);
      llegados += b.length;
      alAvanzar(listos + Math.min(llegados, a.bytes), total);
    });
    try {
      await pipeline(cuerpo, createWriteStream(`${destino}.parcial`));
      if (h.digest("hex") !== a.sha) throw new Error(`${a.archivo} llegó distinto (SHA-256)`);
      renameSync(`${destino}.parcial`, destino);
    } finally {
      rmSync(`${destino}.parcial`, { force: true });
    }
    listos += a.bytes;
    alAvanzar(listos, total);
  }
}

/** Baja el modelo de Kokoro si falta (`npm run voces`). */
export async function modeloKokoro(): Promise<void> {
  if (hayModelo(MODELO_KOKORO)) return;
  console.log(`bajando Kokoro (github.com/thewh1teagle/kokoro-onnx, ${Math.round(pesoModelo(MODELO_KOKORO) / 1e6)} MB, una vez)…`);
  await bajarModelo(MODELO_KOKORO);
}

/** El modelo de Kokoro ya está bajado. */
export function hayModeloKokoro(): boolean {
  return hayModelo(MODELO_KOKORO);
}

/** 0.13.0: el motor de Supertonic, ya armado (`npm run build`). */
export const motorSupertonic = (raiz: string) => join(raiz, "dist", "motor_supertonic.mjs");

/**
 * Los argumentos de `uv` para correr un motor. `trabajos`: el archivo JSON con
 * las frases, o «-» para leerlas de a una por la entrada estándar (el worker).
 * El texto nunca va en la línea de comandos.
 */
export function comando(raiz: string, m: Exclude<Motor, "supertonic">, trabajos: string): string[] {
  const py = (version: string, ...paquetes: string[]) => ["run", "--no-project", "--python", version, ...paquetes.flatMap((p) => ["--with", p]), "python", "-I", join(raiz, "generador", `motor_${m}.py`), trabajos];
  if (m === "edge") return py("3.11", "edge-tts==7.3.1");
  if (m === "kokoro") return [...py("3.11", "kokoro-onnx==0.6.1", "soundfile"), join(KOKORO_DIR, "kokoro-v1.0.onnx"), join(KOKORO_DIR, "voices-v1.0.bin")];
  if (m === "qwen3") return py("3.12", "qwen-tts==0.1.1");
  return py("3.11", "chatterbox-tts==0.1.7");
}

/** 0.13.0: el programa y sus argumentos para cualquier motor (Supertonic, con el mismo Node; los demás, con `uv`). */
export function comandoMotor(raiz: string, m: Motor, trabajos: string): { programa: string; args: string[] } {
  if (m === "supertonic") return { programa: process.execPath, args: [motorSupertonic(raiz), trabajos, SUPERTONIC_DIR] };
  return { programa: "uv", args: comando(raiz, m, trabajos) };
}

/**
 * 0.13.0: deja lo que hizo el motor en `destino`: con Supertonic ya viene listo
 * (se copia, porque puede estar en otro disco, y se renombra); los demás pasan
 * por ffmpeg (`convertir`).
 */
export function dejarListo(m: Motor, salida: string, destino: string, env?: NodeJS.ProcessEnv): void {
  if (m !== "supertonic") return convertir(salida, destino, env);
  copyFileSync(salida, `${destino}.parcial`);
  renameSync(`${destino}.parcial`, destino);
}

/** Lo que el motor necesita además del texto: la voz en su motor, o el audio (y su texto) que se clona. */
export function datosDeVoz(raiz: string, m: Motor, clave: string): { voz: string; referencia: string; referencia_texto?: string } {
  const ref = join(raiz, "generador", "referencias", clave);
  return { voz: clave, referencia: `${ref}.wav`, referencia_texto: m === "qwen3" ? readFileSync(`${ref}.txt`, "utf8").trim() : undefined };
}

/**
 * Lo más que puede durar el audio de un clon (JST-255): 3 s más el doble de lo
 * que tomaría a 10 letras por segundo, con las letras de lo que de verdad se
 * dice (`paraDecir`: «0.9.1» sale «cero punto nueve punto uno»). Lo normal es
 * ~0,1 s por letra (hasta 0,2 en las frases largas); Qwen3 a veces repite el
 * comienzo al final y llega a 0,24 (36,6 s una frase de 152 letras). El
 * `maximo` de `motor_qwen3.py` y `motor_chatterbox.py` es el mismo.
 */
export function maximoAudioMs(dicho: string): number {
  return 3_000 + 200 * [...dicho].filter((c) => /\p{L}/u.test(c)).length;
}

const RECORTE ="silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.08,areverse";

/**
 * Sin silencio en las puntas y a ~−19 LUFS (ganancia lineal, sin pasar −1 dB
 * de pico), MP3 mono 24 kHz 48 kbit/s. Se escribe aparte y se renombra al
 * final: nadie lee un MP3 a medias.
 */
export function convertir(entrada: string, salida: string, env?: NodeJS.ProcessEnv): void {
  const m = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", entrada, "-af", `${RECORTE},ebur128=framelog=quiet,volumedetect`, "-f", "null", "-"], { encoding: "utf8", env });
  const lufs = Number(/\bI:\s+(-?[\d.]+) LUFS/.exec(m.stderr)?.[1] ?? NaN);
  const pico = Number(/max_volume: (-?[\d.]+) dB/.exec(m.stderr)?.[1] ?? NaN);
  const ganancia = Number.isFinite(lufs) && Number.isFinite(pico) ? Math.min(LUFS - lufs, -1 - pico) : 0;
  const tmp = `${salida}.parcial.mp3`;
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", entrada, "-af", `${RECORTE},volume=${ganancia.toFixed(1)}dB`, "-ac", "1", "-ar", "24000", "-c:a", "libmp3lame", "-b:a", "48k", tmp], { encoding: "utf8", env });
  if (r.status !== 0) throw new Error(`ffmpeg: ${(r.stderr ?? "").slice(-300)}`);
  renameSync(tmp, salida);
}

/** `null` si el programa arranca bien; si no, por qué (JST-150: «falta uv», «ffmpeg no funciona: dyld…»). */
export function problemaCon(programa: string, argumentos: string[], env?: NodeJS.ProcessEnv): string | null {
  const r = spawnSync(programa, argumentos, { encoding: "utf8", env, timeout: 20_000 });
  if (r.status === 0) return null;
  if ((r.error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") return `falta ${programa} (no está en el PATH)`;
  const porque = r.error?.message ?? ((r.stderr ?? "").trim().split("\n")[0] || `terminó con ${r.status ?? r.signal}`);
  return `${programa} no funciona: ${porque}`;
}

/** Los argumentos para probar ffmpeg: un MP3 corto como los de `convertir`. */
export const PRUEBA_FFMPEG = ["-v", "error", "-f", "lavfi", "-i", "sine=duration=0.2", "-ac", "1", "-ar", "24000", "-c:a", "libmp3lame", "-b:a", "48k", "-f", "null", "-"];

/** Corta antes del primer motor si `uv` o `ffmpeg` no arrancan (JST-150). */
export function revisar(programa: string, argumentos: string[], arreglo: string): void {
  const p = problemaCon(programa, argumentos);
  if (p) throw new Error(`${p}. ${arreglo}`);
}
