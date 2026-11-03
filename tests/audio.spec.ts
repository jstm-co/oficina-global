// Los audios de Supertonic sin ffmpeg (0.13.0, issue #9).
import { describe, expect, it } from "vitest";
import { aLaMitad, audioDeVoz, duracionWav, LUFS_VOZ, recortarSilencio, sonoridad, wavPcm16 } from "../src/audio.js";

const HZ = 44_100;

/** Un tono de `hz` a `amp` por `s` segundos. */
function tono(s: number, hz = 220, amp = 0.1, muestreo = HZ): Float32Array {
  const x = new Float32Array(Math.round(s * muestreo));
  for (let i = 0; i < x.length; i++) x[i] = amp * Math.sin((2 * Math.PI * hz * i) / muestreo);
  return x;
}

function juntar(...partes: Float32Array[]): Float32Array {
  const x = new Float32Array(partes.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of partes) {
    x.set(p, i);
    i += p.length;
  }
  return x;
}

const silencio = (s: number) => new Float32Array(Math.round(s * HZ));

describe("el silencio de las puntas", () => {
  it("se saca, dejando 0,05 s antes y 0,08 s después (como silenceremove de ffmpeg)", () => {
    const x = juntar(silencio(0.5), tono(1), silencio(0.7));
    const y = recortarSilencio(x, HZ);
    expect(y.length / HZ).toBeGreaterThan(1.1);
    expect(y.length / HZ).toBeLessThan(1.2);
  });

  it("lo que no suena queda vacío", () => {
    expect(recortarSilencio(silencio(1), HZ).length).toBe(0);
  });
});

describe("la sonoridad (LUFS)", () => {
  it("un tono de 1 kHz a −20 dBFS mide ~−23 LUFS (la referencia de BS.1770 para mono es −3,01 dB)", () => {
    const l = sonoridad(tono(3, 1000, 0.1), HZ);
    expect(l).toBeGreaterThan(-23.5);
    expect(l).toBeLessThan(-22.5);
  });

  it("el silencio no tiene sonoridad", () => {
    expect(sonoridad(silencio(1), HZ)).toBe(-Infinity);
  });
});

describe("a la mitad de muestras", () => {
  it("un tono de 1 kHz pasa entero y uno de 15 kHz (que se doblaría) casi desaparece", () => {
    const rms = (x: Float32Array) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);
    const bajo = aLaMitad(tono(1, 1000, 0.5));
    const alto = aLaMitad(tono(1, 15_000, 0.5));
    expect(bajo.length).toBe(HZ / 2);
    expect(rms(bajo) / rms(tono(1, 1000, 0.5))).toBeGreaterThan(0.97);
    expect(rms(alto)).toBeLessThan(0.005);
  });
});

describe("el WAV", () => {
  it("es PCM de 16 bits mono, y su duración se lee de vuelta", () => {
    const b = wavPcm16(tono(1.5, 440, 0.2, 22_050), 22_050);
    expect(String.fromCharCode(...b.subarray(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...b.subarray(8, 12))).toBe("WAVE");
    expect(b.length).toBe(44 + 22_050 * 1.5 * 2);
    expect(duracionWav(b)).toBe(1_500);
    expect(duracionWav(new Uint8Array(8))).toBeNull();
  });

  it("lo que pasa de ±1 se recorta en vez de dar la vuelta", () => {
    const b = wavPcm16(Float32Array.from([2, -2]), 8_000);
    const v = new DataView(b.buffer);
    expect(v.getInt16(44, true)).toBe(32767);
    expect(v.getInt16(46, true)).toBe(-32767);
  });
});

describe("lo que sale del motor, listo para la página", () => {
  it("sin silencio en las puntas, a 22,05 kHz y a −19 LUFS", () => {
    const { wav, ms } = audioDeVoz(juntar(silencio(0.4), tono(2, 300, 0.02), silencio(0.4)), HZ);
    expect(ms).toBeGreaterThan(2_050);
    expect(ms).toBeLessThan(2_200);
    expect(duracionWav(wav)).toBe(ms);
    const v = new DataView(wav.buffer);
    expect(v.getUint32(24, true)).toBe(22_050);
    const muestras = new Float32Array((wav.length - 44) / 2);
    for (let i = 0; i < muestras.length; i++) muestras[i] = v.getInt16(44 + i * 2, true) / 32767;
    expect(Math.abs(sonoridad(muestras, 22_050) - LUFS_VOZ)).toBeLessThan(0.6);
  });

  it("sin pasar −1 dB de pico, aunque quede bajo −19 LUFS", () => {
    // Un clic fuerte en medio de algo muy bajo: subirlo a −19 LUFS lo saturaría.
    const x = juntar(tono(1, 300, 0.001), Float32Array.from([0.9, -0.9]), tono(1, 300, 0.001));
    const { wav } = audioDeVoz(x, HZ);
    const v = new DataView(wav.buffer);
    let pico = 0;
    for (let i = 44; i < wav.length; i += 2) pico = Math.max(pico, Math.abs(v.getInt16(i, true)) / 32767);
    expect(20 * Math.log10(pico)).toBeLessThanOrEqual(-0.99);
  });
});
