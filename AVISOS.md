# Avisos de terceros

El código de Oficina global tiene licencia MIT (ver `LICENSE`). Estos archivos tienen otra licencia o se basan en obras de terceros.

## Referencias de voz

`generador/referencias/ref_hombre_cl.wav`, `ref_hombre_cl.txt`, `ref_mujer_cl.wav` y `ref_mujer_cl.txt`

Tres frases de un hombre y de una mujer del set **Google Crowdsourced Chilean Spanish** (OpenSLR 71; en Hugging Face, `ylacombe/google-chilean-spanish`), © Google. Licencia [Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/). Se concatenaron las frases; el `.txt` es lo que dicen. Los 4 clones de voz que arma el generador salen de estas referencias, y el panel «Voces» lo atribuye.

## Lista de palabras

`src/ia/palabrasFiltro.ts`

Filtro de Bloom con las 100.000 palabras más frecuentes de la lista de frecuencias de los subtítulos en español de OpenSubtitles 2018, de [FrequencyWords](https://github.com/hermitdave/FrequencyWords) de Hermit Dave (contenido CC BY-SA 4.0), filtradas con el corrector ortográfico de macOS y con las palabras de `generador/palabras/extra.txt`. Lo arma `generador/palabras/armar_palabras.mjs`. Por ser una adaptación, este archivo se distribuye con licencia [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

## Motores de voz

El generador no trae los motores ni sus modelos: los baja `uv` al correrlo. Cada uno tiene su licencia:

| Motor | Paquete | Licencia |
|---|---|---|
| Edge TTS (Microsoft) | `edge-tts` | LGPL-3.0 (la biblioteca); usa un servicio de Microsoft no oficial |
| Kokoro-82M | `kokoro-onnx` | MIT (la biblioteca); Apache 2.0 (el modelo) |
| Chatterbox Multilingual | `chatterbox-tts` | MIT |
| Qwen3-TTS | `qwen-tts` | Apache 2.0 |

## Dependencias de npm

`@paperclipai/plugin-sdk`, React, [three.js](https://github.com/mrdoob/three.js), esbuild, TypeScript y vitest, todas con licencia MIT (TypeScript, Apache 2.0). Solo se usan para armar y probar el plugin; el SDK y React van dentro de `dist/`, y three.js, en el visor de la vista 3D (`dist/ui/oficina3d.js`).
