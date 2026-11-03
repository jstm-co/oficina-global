// Los audios de Supertonic (0.13.0, issue #9), sin ffmpeg: el motor entrega
// muestras (float, 44,1 kHz) y aquí quedan como los de los otros motores, que
// pasan por ffmpeg (`generador/motores.ts`, `convertir`): sin silencio en las
// puntas (con 0,05 s al comienzo y 0,08 s al final) y a ~−19 LUFS sin pasar
// −1 dB de pico. Se bajan a la mitad de muestras (22,05 kHz) y quedan en un WAV
// de 16 bits, que cualquier navegador toca. Sin React, navegador ni Node.

/** El mismo volumen que los MP3 de los otros motores (`LUFS` de `generador/motores.ts`). */
export const LUFS_VOZ = -19;
const PICO_MAX_DB = -1;
/** Lo que se considera silencio en las puntas (como `silenceremove` de ffmpeg, en ventanas de 20 ms). */
const SILENCIO_DB = -50;
const VENTANA_S = 0.02;
const ANTES_S = 0.05;
const DESPUES_S = 0.08;

const db = (x: number) => 20 * Math.log10(x);

/** Sin el silencio de las puntas: el primer y el último tramo de 20 ms que pasan −50 dB, con un respiro antes y después. */
export function recortarSilencio(s: Float32Array, hz: number): Float32Array {
  const ventana = Math.max(1, Math.round(hz * VENTANA_S));
  const umbral = 10 ** (SILENCIO_DB / 20);
  const suena = (i: number) => {
    let e = 0;
    const fin = Math.min(s.length, i + ventana);
    for (let k = i; k < fin; k++) e += s[k]! * s[k]!;
    return Math.sqrt(e / Math.max(1, fin - i)) > umbral;
  };
  let primero = -1;
  for (let i = 0; i < s.length; i += ventana) {
    if (suena(i)) {
      primero = i;
      break;
    }
  }
  if (primero < 0) return s.subarray(0, 0);
  let ultimo = primero;
  for (let i = Math.floor((s.length - 1) / ventana) * ventana; i >= primero; i -= ventana) {
    if (suena(i)) {
      ultimo = Math.min(s.length, i + ventana);
      break;
    }
  }
  return s.subarray(Math.max(0, primero - Math.round(hz * ANTES_S)), Math.min(s.length, ultimo + Math.round(hz * DESPUES_S)));
}

type Biquad = readonly [b0: number, b1: number, b2: number, a1: number, a2: number];

/** Los dos filtros de la ponderación K (UIT-R BS.1770), para cualquier frecuencia de muestreo (los de pyloudnorm). */
function filtrosK(hz: number): [Biquad, Biquad] {
  const estante = (() => {
    const A = 10 ** (4 / 40);
    const w = (2 * Math.PI * 1500) / hz;
    const alfa = Math.sin(w) / (2 / Math.SQRT2);
    const c = Math.cos(w);
    const r = 2 * Math.sqrt(A) * alfa;
    const a0 = A + 1 - (A - 1) * c + r;
    return [(A * (A + 1 + (A - 1) * c + r)) / a0, (-2 * A * (A - 1 + (A + 1) * c)) / a0, (A * (A + 1 + (A - 1) * c - r)) / a0, (2 * (A - 1 - (A + 1) * c)) / a0, (A + 1 - (A - 1) * c - r) / a0] as const;
  })();
  const pasaAltos = (() => {
    const w = (2 * Math.PI * 38) / hz;
    const alfa = Math.sin(w) / (2 * 0.5);
    const c = Math.cos(w);
    const a0 = 1 + alfa;
    return [(1 + c) / 2 / a0, -(1 + c) / a0, (1 + c) / 2 / a0, (-2 * c) / a0, (1 - alfa) / a0] as const;
  })();
  return [estante, pasaAltos];
}

function filtrar(s: Float32Array, [b0, b1, b2, a1, a2]: Biquad): Float64Array {
  const y = new Float64Array(s.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < s.length; i++) {
    const x = s[i]!;
    const v = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}

/**
 * La sonoridad integrada (LUFS) de un audio mono, como `ebur128` de ffmpeg:
 * ponderación K, bloques de 400 ms cada 100 ms y las dos compuertas (−70 LUFS
 * y 10 LU bajo el promedio). `-Infinity` si es silencio.
 */
export function sonoridad(s: Float32Array, hz: number): number {
  const [k1, k2] = filtrosK(hz);
  const y = filtrar(Float32Array.from(filtrar(s, k1)), k2);
  const bloque = Math.round(hz * 0.4);
  const paso = Math.round(hz * 0.1);
  const energias: number[] = [];
  const energia = (desde: number, hasta: number) => {
    let e = 0;
    for (let i = desde; i < hasta; i++) e += y[i]! * y[i]!;
    return e / Math.max(1, hasta - desde);
  };
  if (y.length < bloque) energias.push(energia(0, y.length));
  else for (let i = 0; i + bloque <= y.length; i += paso) energias.push(energia(i, i + bloque));
  const lufs = (z: number) => -0.691 + 10 * Math.log10(z);
  const promedio = (lista: readonly number[]) => lista.reduce((a, b) => a + b, 0) / lista.length;
  const absolutas = energias.filter((z) => z > 0 && lufs(z) > -70);
  if (absolutas.length === 0) return -Infinity;
  const relativa = lufs(promedio(absolutas)) - 10;
  const finales = absolutas.filter((z) => lufs(z) > relativa);
  return lufs(promedio(finales.length ? finales : absolutas));
}

/** Un filtro pasa bajos de 95 coeficientes (sinc con ventana de Blackman), con su corte en `corte` (fracción de `hz`). */
function pasaBajos(corte: number, n = 95): Float64Array {
  const h = new Float64Array(n);
  const m = (n - 1) / 2;
  let suma = 0;
  for (let i = 0; i < n; i++) {
    const x = i - m;
    const sinc = x === 0 ? 2 * corte : Math.sin(2 * Math.PI * corte * x) / (Math.PI * x);
    const blackman = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)) + 0.08 * Math.cos((4 * Math.PI * i) / (n - 1));
    h[i] = sinc * blackman;
    suma += h[i]!;
  }
  for (let i = 0; i < n; i++) h[i] = h[i]! / suma;
  return h;
}

const FILTRO_MITAD = pasaBajos(10_000 / 44_100);

/** La mitad de las muestras (44,1 → 22,05 kHz), con el filtro antes para que lo de arriba de ~10 kHz no se doble. */
export function aLaMitad(s: Float32Array): Float32Array {
  const h = FILTRO_MITAD;
  const m = (h.length - 1) / 2;
  const y = new Float32Array(Math.floor(s.length / 2));
  for (let k = 0; k < y.length; k++) {
    const centro = 2 * k;
    let v = 0;
    for (let i = 0; i < h.length; i++) {
      const j = centro + i - m;
      if (j >= 0 && j < s.length) v += h[i]! * s[j]!;
    }
    y[k] = v;
  }
  return y;
}

/** Un WAV mono de 16 bits (PCM), con lo que pase de ±1 recortado. */
export function wavPcm16(s: Float32Array, hz: number): Uint8Array {
  const datos = s.length * 2;
  const b = new Uint8Array(44 + datos);
  const v = new DataView(b.buffer);
  const texto = (en: number, t: string) => {
    for (let i = 0; i < t.length; i++) b[en + i] = t.charCodeAt(i);
  };
  texto(0, "RIFF");
  v.setUint32(4, 36 + datos, true);
  texto(8, "WAVE");
  texto(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, hz, true);
  v.setUint32(28, hz * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  texto(36, "data");
  v.setUint32(40, datos, true);
  for (let i = 0; i < s.length; i++) v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, s[i]!)) * 32767), true);
  return b;
}

/** Cuánto dura un WAV (ms), por su `fmt ` y su `data`, o `null` si no es un WAV. */
export function duracionWav(b: Uint8Array): number | null {
  const id = (en: number) => String.fromCharCode(b[en]!, b[en + 1]!, b[en + 2]!, b[en + 3]!);
  if (b.length < 12 || id(0) !== "RIFF" || id(8) !== "WAVE") return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let porSegundo = 0;
  for (let i = 12; i + 8 <= b.length; ) {
    const tam = v.getUint32(i + 4, true);
    if (id(i) === "fmt " && i + 16 <= b.length) porSegundo = v.getUint32(i + 16, true);
    if (id(i) === "data") return porSegundo > 0 ? Math.round((Math.min(tam, b.length - i - 8) * 1000) / porSegundo) : null;
    i += 8 + tam + (tam % 2);
  }
  return null;
}

/**
 * Lo que sale del motor, listo para la página: sin el silencio de las puntas,
 * a −19 LUFS (sin pasar −1 dB de pico), a 22,05 kHz si venía a 44,1 o más, en
 * WAV de 16 bits. `ms`: cuánto dura.
 */
export function audioDeVoz(muestras: Float32Array, hz: number): { wav: Uint8Array; ms: number } {
  const recortado = recortarSilencio(muestras, hz);
  const lufs = recortado.length ? sonoridad(recortado, hz) : -Infinity;
  const mitad = hz >= 44_100 && hz % 2 === 0 ? aLaMitad(recortado) : Float32Array.from(recortado);
  const hzSalida = mitad.length !== recortado.length ? hz / 2 : hz;
  let pico = 0;
  for (const x of mitad) pico = Math.max(pico, Math.abs(x));
  const ganancia = Number.isFinite(lufs) && pico > 0 ? Math.min(LUFS_VOZ - lufs, PICO_MAX_DB - db(pico)) : 0;
  const factor = 10 ** (ganancia / 20);
  for (let i = 0; i < mitad.length; i++) mitad[i] = mitad[i]! * factor;
  return { wav: wavPcm16(mitad, hzSalida), ms: Math.round((mitad.length * 1000) / hzSalida) };
}
