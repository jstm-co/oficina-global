// Elegir las voces, en el worker (0.11.0, JST-325): la elección queda en `eleccion.json`; la voz de un agente
// se graba en segundo plano y cambia al terminar; la del Resumen cambia los «3 agentes te necesitan».
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { leerEleccion, type EleccionVoces } from "../src/eleccionVoces.js";
import { claveAudio, type IndiceVoces } from "../src/voces.js";
import { PreparadorVoces, type TrabajoVoz } from "../src/vozViva.js";

const AGENTE = { quien: "agente", agenteId: "a-edge", corto: "Diseño", empresa: "JSTM" };

function plugin(extra: Partial<IndiceVoces> = {}, eleccion?: Partial<EleccionVoces>): string {
  const raiz = mkdtempSync(join(tmpdir(), "oficina-elegir-test-"));
  const dir = join(raiz, "dist", "ui", "voces");
  mkdirSync(dir, { recursive: true });
  const indice: IndiceVoces = { version: 1, generado: "", resumen: "catalina", agentes: { "a-edge": "lorenzo", "a-otro": "catalina", "a-clon": "qwen3-mujer" }, audios: {}, ...extra };
  writeFileSync(join(dir, "indice.json"), JSON.stringify(indice));
  // Sin elegir nada, el Resumen queda con Alex (Kokoro): estas pruebas no dependen del modelo, así que parten con el Resumen ya en Catalina.
  writeFileSync(join(dir, "eleccion.json"), JSON.stringify({ version: 1, resumen: "catalina", contexto: "dora", originales: {}, pendientes: {}, ...eleccion }));
  return raiz;
}
const dirDe = (raiz: string) => join(raiz, "dist", "ui", "voces");
const indiceDe = (raiz: string): IndiceVoces => JSON.parse(readFileSync(join(dirDe(raiz), "indice.json"), "utf8"));
const eleccionDe = (raiz: string): EleccionVoces => leerEleccion(JSON.parse(readFileSync(join(dirDe(raiz), "eleccion.json"), "utf8")));
const espera = (ms = 5) => new Promise((ok) => setTimeout(ok, ms));
/** Espera a que se cumpla algo (la fila trabaja en segundo plano). */
async function hasta(f: () => boolean, ms = 2_000): Promise<void> {
  for (let t = 0; t < ms && !f(); t += 5) await espera(5);
  expect(f()).toBe(true);
}

const preparador = (raiz: string, o: { generar?: (t: TrabajoVoz, d: string) => Promise<void>; clonesOk?: () => boolean; revisar?: () => string | null; calentar?: (f: string, m: string) => void } = {}) =>
  new PreparadorVoces({
    raiz,
    revisar: o.revisar ?? (() => null),
    clonesOk: o.clonesOk ?? (() => true),
    calentar: o.calentar as never,
    generar: async (t, d) => (o.generar ? o.generar(t, d) : writeFileSync(d, "mp3")),
  });

afterEach(() => vi.useRealTimers());

describe("la voz del Resumen y la de «Leer contexto»", () => {
  it("se guardan en eleccion.json; sin archivo vale lo que queda al instalar (Alex y Dora)", () => {
    const raiz = mkdtempSync(join(tmpdir(), "oficina-elegir-test-"));
    mkdirSync(dirDe(raiz), { recursive: true });
    const v = preparador(raiz);
    expect(v.eleccion()).toMatchObject({ resumen: "alex", contexto: "dora" });
    expect(v.elegir({ quien: "contexto", voz: "igual" })).toMatchObject({ ok: true, eleccion: { contexto: "igual" } });
    expect(v.elegir({ quien: "contexto", voz: "navegador" }).eleccion.contexto).toBe("navegador");
    expect(eleccionDe(raiz)).toMatchObject({ contexto: "navegador", resumen: "alex" });
  });

  it("un clon no se puede elegir para leer al momento, ni algo que no es una voz", () => {
    const raiz = plugin();
    const v = preparador(raiz);
    expect(v.elegir({ quien: "resumen", voz: "qwen3-mujer" })).toMatchObject({ ok: false, motivo: "pedido" });
    expect(v.elegir({ quien: "contexto", voz: "chatterbox-hombre" }).ok).toBe(false);
    expect(v.elegir({ quien: "resumen", voz: "nadie" }).ok).toBe(false);
    expect(v.elegir(null).ok).toBe(false);
    expect(eleccionDe(raiz).resumen).toBe("catalina");
  });

  it("cambiar la del Resumen pide los «3 agentes te necesitan» con la voz nueva y recién al terminar el índice cambia (mientras, sigue Catalina)", async () => {
    const raiz = plugin();
    let soltar!: () => void;
    const puerta = new Promise<void>((ok) => (soltar = ok));
    const hechos: string[] = [];
    const v = preparador(raiz, { generar: async (t, d) => (await puerta, hechos.push(t.voz.id), writeFileSync(d, "mp3")) });
    expect(v.elegir({ quien: "resumen", voz: "lorenzo" }).ok).toBe(true);
    await espera();
    // 3 agentes → de 2 a 3 × 6 frases = 12 (JST-415 sumó «quedaron bloqueados» y «te dejaron algo para revisar»).
    const g = v.grabando();
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ quien: "resumen", voz: "lorenzo", sigueCon: "catalina", total: 12, enCola: false });
    expect(indiceDe(raiz).resumen).toBe("catalina");
    soltar();
    await hasta(() => indiceDe(raiz).resumen === "lorenzo");
    expect(hechos).toHaveLength(12);
    expect(hechos.every((x) => x === "lorenzo")).toBe(true);
    expect(indiceDe(raiz).audios[claveAudio("lorenzo", "3 agentes te necesitan.")]).toMatch(/\.mp3$/);
    expect(v.grabando()).toEqual([]);
  });

  it("con la voz del navegador no se graba nada: los avisos juntos siguen con la de antes", async () => {
    const raiz = plugin();
    const v = preparador(raiz);
    v.elegir({ quien: "resumen", voz: "navegador" });
    expect(v.grabando()).toEqual([]);
    expect(eleccionDe(raiz).resumen).toBe("navegador");
    expect(indiceDe(raiz).resumen).toBe("catalina");
  });

  it("al abrir el worker, si el Resumen ya está elegido pero el índice tiene otra voz, graba los avisos juntos", async () => {
    const raiz = plugin({}, { resumen: "lorenzo" });
    const v = preparador(raiz);
    v.reanudar();
    await hasta(() => indiceDe(raiz).resumen === "lorenzo");
  });
});

describe("la voz de cada agente", () => {
  it("sus frases se graban en segundo plano; mientras tanto sigue con la de antes y al terminar cambia de una vez", async () => {
    const raiz = plugin();
    let soltar!: () => void;
    const puerta = new Promise<void>((ok) => (soltar = ok));
    const v = preparador(raiz, { generar: async (_t, d) => (await puerta, writeFileSync(d, "mp3")) });
    const r = v.elegir({ ...AGENTE, voz: "catalina" });
    expect(r.ok).toBe(true);
    await espera();
    expect(v.grabando()).toEqual([{ quien: "agente", agenteId: "a-edge", voz: "catalina", sigueCon: "lorenzo", hechas: 0, total: 41, enCola: false, esperaMac: false, error: false }]);
    expect(indiceDe(raiz).agentes["a-edge"]).toBe("lorenzo");
    // Lo que tenía queda para «Volver a como estaba», y lo que se graba queda pendiente por si se apaga el worker.
    expect(eleccionDe(raiz).originales["a-edge"]).toEqual({ voz: "lorenzo", corto: "Diseño", empresa: "JSTM" });
    expect(eleccionDe(raiz).pendientes["a-edge"]!.voz).toBe("catalina");
    soltar();
    await hasta(() => indiceDe(raiz).agentes["a-edge"] === "catalina");
    const i = indiceDe(raiz);
    expect(Object.keys(i.audios).filter((k) => k.startsWith("catalina|"))).toHaveLength(41);
    expect(i.audios[claveAudio("catalina", "Diseño, de JSTM: terminé.")]).toMatch(/^[0-9a-f]{20}\.mp3$/);
    expect(v.grabando()).toEqual([]);
    expect(eleccionDe(raiz).pendientes).toEqual({});
    expect(v.estadoElegir().cambios).toBe(true);
  });

  it("las frases de una voz nueva no entran a vivo.json ni se borran a los 7 días", async () => {
    const raiz = plugin();
    const v = preparador(raiz);
    v.elegir({ ...AGENTE, voz: "catalina" });
    await hasta(() => indiceDe(raiz).agentes["a-edge"] === "catalina");
    expect(existsSync(join(dirDe(raiz), "vivo.json"))).toBe(false);
  });

  it("elegir la de antes (o volver a la que tenía) cancela lo que se grababa y deja todo como estaba", async () => {
    const raiz = plugin();
    const v = preparador(raiz, { generar: () => new Promise<void>(() => undefined) });
    v.elegir({ ...AGENTE, voz: "catalina" });
    await espera();
    expect(v.grabando()).toHaveLength(1);
    expect(v.elegir({ ...AGENTE, voz: "lorenzo" }).ok).toBe(true);
    expect(v.grabando()).toEqual([]);
    expect(eleccionDe(raiz).pendientes).toEqual({});
    expect(eleccionDe(raiz).originales).toEqual({});
    expect(indiceDe(raiz).agentes["a-edge"]).toBe("lorenzo");
    expect(v.grabando()).toEqual([]);
  });

  it("se graba de a un agente: el otro queda «en cola» y sigue con la suya", async () => {
    const raiz = plugin();
    const v = preparador(raiz, { generar: () => new Promise<void>(() => undefined) });
    v.elegir({ ...AGENTE, voz: "catalina" });
    v.elegir({ quien: "agente", agenteId: "a-otro", corto: "Líder", empresa: "JSTM", voz: "lorenzo" });
    await espera();
    const g = v.grabando();
    expect(g.map((x) => [x.agenteId, x.enCola, x.sigueCon])).toEqual([["a-edge", false, "lorenzo"], ["a-otro", true, "catalina"]]);
  });

  it("un agente que no está en el índice, un nombre raro o una voz que no existe: no", () => {
    const raiz = plugin();
    const v = preparador(raiz);
    expect(v.elegir({ ...AGENTE, agenteId: "nadie", voz: "catalina" })).toMatchObject({ ok: false, motivo: "pedido" });
    expect(v.elegir({ ...AGENTE, voz: "nadie" }).ok).toBe(false);
    expect(v.elegir({ ...AGENTE, corto: "a\u0007b", voz: "catalina" }).ok).toBe(false);
    expect(v.elegir({ ...AGENTE, corto: "x".repeat(201), voz: "catalina" }).ok).toBe(false);
    expect(v.grabando()).toEqual([]);
  });

  it("sin uv o ffmpeg solo se pueden elegir las voces que ese agente ya tiene grabadas", () => {
    const raiz = plugin();
    const v = preparador(raiz, { revisar: () => "falta uv" });
    expect(v.elegir({ ...AGENTE, voz: "catalina" })).toMatchObject({ ok: false, motivo: "sin-mac" });
    expect(eleccionDe(raiz).originales).toEqual({});
  });

  it("un clon espera a que la Mac esté libre, sin fallar, y el agente sigue con la suya", async () => {
    const raiz = plugin();
    const v = preparador(raiz, { clonesOk: () => false });
    expect(v.elegir({ ...AGENTE, voz: "qwen3-hombre" }).ok).toBe(true);
    await espera(30);
    const g = v.grabando();
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ voz: "qwen3-hombre", sigueCon: "lorenzo", esperaMac: true, error: false });
    expect(indiceDe(raiz).agentes["a-edge"]).toBe("lorenzo");
    v.cerrar();
  });

  it("si una frase falla 3 veces, no cambia la voz y el error se ve; elegirla otra vez lo reintenta", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const raiz = plugin();
    let falla = true;
    const v = preparador(raiz, {
      generar: async (_t, d) => {
        if (falla) throw new Error("se cayó el motor");
        writeFileSync(d, "mp3");
      },
    });
    v.elegir({ ...AGENTE, voz: "catalina" });
    for (let i = 0; i < 4; i++) await vi.advanceTimersByTimeAsync(31_000);
    const g = v.grabando();
    expect(g[0]).toMatchObject({ voz: "catalina", error: true });
    expect(indiceDe(raiz).agentes["a-edge"]).toBe("lorenzo");
    falla = false;
    expect(v.elegir({ ...AGENTE, voz: "catalina" }).ok).toBe(true);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(indiceDe(raiz).agentes["a-edge"]).toBe("catalina");
    expect(v.grabando()).toEqual([]);
    v.cerrar();
  });

  it("«Volver a como estaba»: Alex, Dora y cada agente con la que tenía", async () => {
    const raiz = plugin();
    const v = preparador(raiz);
    v.elegir({ ...AGENTE, voz: "catalina" });
    await hasta(() => indiceDe(raiz).agentes["a-edge"] === "catalina");
    v.elegir({ quien: "contexto", voz: "navegador" });
    expect(v.estadoElegir().cambios).toBe(true);
    const r = v.reiniciar();
    expect(r.ok).toBe(true);
    await hasta(() => indiceDe(raiz).agentes["a-edge"] === "lorenzo");
    expect(eleccionDe(raiz)).toMatchObject({ resumen: "alex", contexto: "dora", originales: {}, pendientes: {} });
    expect(v.estadoElegir().cambios).toBe(false);
  });

  it("si se apaga el worker a medias, al abrirlo sigue con lo que quedó grabándose", async () => {
    const raiz = plugin({}, { pendientes: { "a-edge": { voz: "catalina", corto: "Diseño", empresa: "JSTM" } }, originales: { "a-edge": { voz: "lorenzo", corto: "Diseño", empresa: "JSTM" } } });
    const v = preparador(raiz);
    v.reanudar();
    await hasta(() => indiceDe(raiz).agentes["a-edge"] === "catalina");
    expect(eleccionDe(raiz).pendientes).toEqual({});
  });
});

describe("abrir el motor antes de leer", () => {
  it("solo las voces que leen al momento, y solo si se puede en esta Mac", () => {
    const abiertos: string[] = [];
    const v = preparador(plugin(), { calentar: (f, m) => abiertos.push(`${f}:${m}`) });
    expect(v.calentar("lorenzo")).toBe(true);
    expect(abiertos).toEqual(["edge:edge"]);
    expect(v.calentar("qwen3-mujer")).toBe(false);
    expect(v.calentar("nadie")).toBe(false);
    const sin = preparador(plugin(), { revisar: () => "falta uv", calentar: (f, m) => abiertos.push(`${f}:${m}`) });
    expect(sin.calentar("lorenzo")).toBe(false);
    expect(abiertos).toHaveLength(1);
  });
});
