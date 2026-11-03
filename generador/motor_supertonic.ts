// Supertonic 3 (la versión int8 de sherpa-onnx), en Node: las 10 voces de
// Supertonic (0.13.0, issue #9), sin Python, `uv` ni ffmpeg. Lo corren el
// worker (con «-»: un trabajo por línea de la entrada estándar, hasta que se
// cierre) y `npm run voces` (con el archivo de trabajos), como los motores de
// Python: cada trabajo es {texto, salida, voz} (la voz es su número, «0» a
// «9») y por cada uno responde una línea {salida, s} o {salida, error}.
//
// Deja en `salida` el WAV listo para la página (`src/audio.ts`): sin silencio
// en las puntas, a −19 LUFS y a 22,05 kHz.
//
// Uso: node dist/motor_supertonic.mjs <trabajos.json | -> <carpeta del modelo>
//      node dist/motor_supertonic.mjs --probar   (solo carga sherpa-onnx-node: si se puede en este computador)
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { cpus } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { audioDeVoz } from "../src/audio.js";

interface Audio {
  samples: Float32Array;
  sampleRate: number;
}

interface Sherpa {
  version?: string;
  OfflineTts: new (c: unknown) => { sampleRate: number; numSpeakers: number; generateAsync(o: { text: string; generationConfig: unknown }): Promise<Audio> };
  GenerationConfig: new (c: unknown) => unknown;
}

/** Como lo probó el usuario (issue #9): ~0,55 s por frase en una Mac con Apple Silicon. */
const VELOCIDAD = 1.05;
const PASOS = 8;

const cargar = () => createRequire(import.meta.url)("sherpa-onnx-node") as Sherpa;
const linea = (x: Record<string, unknown>) => process.stdout.write(`${JSON.stringify(x)}\n`);

interface Trabajo {
  texto: string;
  salida: string;
  voz: string;
}

async function* trabajos(fuente: string): AsyncGenerator<Trabajo> {
  if (fuente !== "-") {
    yield* JSON.parse(readFileSync(fuente, "utf8")) as Trabajo[];
    return;
  }
  for await (const l of createInterface({ input: process.stdin })) if (l.trim()) yield JSON.parse(l) as Trabajo;
}

async function main(): Promise<void> {
  if (process.argv[2] === "--probar") {
    linea({ ok: true, version: cargar().version ?? null });
    return;
  }
  const [fuente, dir] = process.argv.slice(2);
  if (!fuente || !dir) throw new Error("uso: motor_supertonic.mjs <trabajos.json | -> <carpeta del modelo>");
  const sherpa = cargar();
  const f = (n: string) => join(dir, n);
  const t0 = Date.now();
  const tts = new sherpa.OfflineTts({
    model: {
      supertonic: {
        durationPredictor: f("duration_predictor.int8.onnx"),
        textEncoder: f("text_encoder.int8.onnx"),
        vectorEstimator: f("vector_estimator.int8.onnx"),
        vocoder: f("vocoder.int8.onnx"),
        ttsJson: f("tts.json"),
        unicodeIndexer: f("unicode_indexer.bin"),
        voiceStyle: f("voice.bin"),
      },
      // La mitad de los núcleos, hasta 4: el worker lo corre con prioridad baja, al lado de Paperclip y sus agentes.
      numThreads: Math.max(1, Math.min(4, Math.floor(cpus().length / 2))),
      provider: "cpu",
    },
    maxNumSentences: 1,
  });
  linea({ carga_s: Math.round((Date.now() - t0) / 100) / 10 });
  for await (const t of trabajos(fuente)) {
    const t1 = Date.now();
    try {
      const sid = Number(t.voz);
      if (!Number.isInteger(sid) || sid < 0 || sid >= tts.numSpeakers) throw new Error(`no hay voz ${t.voz}`);
      const a = await tts.generateAsync({ text: t.texto, generationConfig: new sherpa.GenerationConfig({ sid, speed: VELOCIDAD, numSteps: PASOS, extra: { lang: "es" } }) });
      const { wav, ms } = audioDeVoz(a.samples, a.sampleRate);
      if (ms === 0) throw new Error("salió en silencio");
      // Escrito aparte y renombrado: nadie lee un WAV a medias.
      writeFileSync(`${t.salida}.parcial`, wav);
      renameSync(`${t.salida}.parcial`, t.salida);
      linea({ salida: t.salida, s: Math.round((Date.now() - t1) / 10) / 100, audio_s: Math.round(ms / 10) / 100 });
    } catch (e) {
      linea({ salida: t.salida, error: String((e as Error).message ?? e).slice(0, 300) });
    }
  }
}

main()
  // Sin trabajos (se cerró la entrada): se va al terminar de escribir, aunque sherpa deje hilos abiertos.
  .then(() => process.stdout.write("", () => process.exit(0)))
  .catch((e: unknown) => {
    process.stderr.write(`${String((e as Error).message ?? e)}\n`);
    process.exit(1);
  });
