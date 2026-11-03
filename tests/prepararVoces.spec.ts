// «Preparar voces» desde la oficina (0.13.0, issue #9): el worker baja los modelos, le da voz a los agentes nuevos
// (de los motores elegidos) y graba lo que falta en segundo plano. Los audios quedan fuera del plugin y se publican.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pesoModelo, type Modelo } from "../generador/motores.js";
import { archivoDe } from "../generador/plan.js";
import { nombreCorto, textoVoz } from "../src/avisos.js";
import { leerEleccion, type EleccionVoces } from "../src/eleccionVoces.js";
import { archivoVivo, claveAudio, type IndiceVoces } from "../src/voces.js";
import { textoOficina, validarPedidoOficina } from "../src/vozOficina.js";
import { MAX_AGENTES, PreparadorVoces, validarAgentes, type TrabajoVoz } from "../src/vozViva.js";

const tmp = () => mkdtempSync(join(tmpdir(), "oficina-preparar-test-"));
const espera = (ms = 5) => new Promise((ok) => setTimeout(ok, ms));
async function hasta(f: () => boolean, ms = 3_000): Promise<void> {
  for (let t = 0; t < ms && !f(); t += 5) await espera(5);
  expect(f()).toBe(true);
}

const AGENTES = [
  { id: "a1", nombre: "Líder Técnico", empresa: "Betalandia" },
  { id: "a2", nombre: "Diseño", empresa: "JSTM" },
];

interface Prueba {
  raiz: string;
  almacen: string;
  publico: string;
  v: PreparadorVoces;
  hechos: TrabajoVoz[];
  bajados: Set<string>;
  soltar: () => void;
}

/** Un plugin de mentira con su almacén aparte: sin `uv` (solo Supertonic), con el modelo por bajar. */
function armar(o: { indice?: IndiceVoces; eleccion?: Partial<EleccionVoces>; python?: boolean; bajar?: (m: Modelo) => Promise<void>; frenar?: boolean } = {}): Prueba {
  const raiz = tmp();
  const almacen = join(tmp(), "voces", "plugin-0000");
  const publico = join(raiz, "dist", "ui", "voces");
  mkdirSync(publico, { recursive: true });
  if (o.indice) writeFileSync(join(publico, "indice.json"), JSON.stringify(o.indice));
  if (o.eleccion) writeFileSync(join(publico, "eleccion.json"), JSON.stringify({ version: 1, resumen: "alex", contexto: "dora", originales: {}, pendientes: {}, ...o.eleccion }));
  const hechos: TrabajoVoz[] = [];
  const bajados = new Set<string>();
  let frenos: Array<() => void> = [];
  const v = new PreparadorVoces({
    raiz,
    almacen,
    revisar: () => (o.python ? null : "falta uv (no está en el PATH)"),
    revisarSupertonic: () => null,
    hayModelo: (m) => bajados.has(m.nombre),
    bajar: async (m, alAvanzar) => {
      if (o.bajar) await o.bajar(m);
      alAvanzar(pesoModelo(m), pesoModelo(m));
      bajados.add(m.nombre);
    },
    clonesOk: () => true,
    generar: async (t, d) => {
      if (o.frenar) await new Promise<void>((ok) => frenos.push(ok));
      hechos.push(t);
      writeFileSync(d, "RIFF");
    },
  });
  const soltar = () => {
    const f = frenos;
    frenos = [];
    for (const x of f) x();
  };
  return { raiz, almacen, publico, v, hechos, bajados, soltar };
}

const leer = <T>(dir: string, archivo: string): T => JSON.parse(readFileSync(join(dir, archivo), "utf8")) as T;

describe("los agentes que manda la página", () => {
  it("solo con la forma esperada y dentro de los topes (sin repetir)", () => {
    expect(validarAgentes(AGENTES)).toEqual(AGENTES.map((a) => ({ ...a, creado: "" })));
    expect(validarAgentes([...AGENTES, AGENTES[0]])).toHaveLength(2);
    expect(validarAgentes([{ id: "a", nombre: "", empresa: "x" }])).toBeNull();
    expect(validarAgentes([{ id: "a", nombre: "x\u0007", empresa: "x" }])).toBeNull();
    expect(validarAgentes([{ id: "a".repeat(81), nombre: "x", empresa: "x" }])).toBeNull();
    expect(validarAgentes(Array.from({ length: MAX_AGENTES + 1 }, (_, i) => ({ id: `a${i}`, nombre: "x", empresa: "y" })))).toBeNull();
    expect(validarAgentes("hola")).toBeNull();
  });
});

describe("«Preparar voces»", () => {
  it("sin apretarlo, los agentes que manda la página no graban nada ni bajan nada", async () => {
    const p = armar();
    const r = p.v.alDia({ agentes: AGENTES });
    expect(r.ok).toBe(true);
    await espera(20);
    expect(p.bajados.size).toBe(0);
    expect(p.hechos).toHaveLength(0);
    expect(r.preparar.fase).toBe("nada");
    expect(r.porBajar.supertonic).toBeGreaterThan(100e6);
    expect(r.motores).toMatchObject({ supertonic: null, kokoro: expect.stringMatching(/uv/), edge: expect.stringMatching(/uv/), clones: expect.stringMatching(/uv/) });
  });

  it("al apretarlo con Supertonic: baja el modelo, le da una voz de Supertonic a cada uno y graba sus frases, que quedan en el índice", async () => {
    const p = armar();
    const r = p.v.alDia({ agentes: AGENTES, motores: ["supertonic"], empezar: true });
    expect(r.ok).toBe(true);
    expect(r.eleccion).toMatchObject({ motores: ["supertonic"], alDia: true });
    await hasta(() => p.v.estadoMotores().preparar.fase === "listo");
    expect(p.bajados).toEqual(new Set(["Supertonic"]));
    const indice = leer<IndiceVoces>(p.almacen, "indice.json");
    expect(Object.keys(indice.agentes).sort()).toEqual(["a1", "a2"]);
    expect(Object.values(indice.agentes).every((v) => v.startsWith("supertonic-"))).toBe(true);
    // Sin Kokoro, el Resumen y «Leer contexto» pasan a Supertonic (M1 y F1).
    expect(indice.resumen).toBe("supertonic-m1");
    expect(leerEleccion(leer(p.almacen, "eleccion.json"))).toMatchObject({ resumen: "supertonic-m1", contexto: "supertonic-f1" });
    const texto = textoVoz(nombreCorto("Líder Técnico"), "Betalandia", "toca", "nombre-empresa");
    const archivo = archivoDe(indice.agentes.a1!, texto);
    expect(archivo).toMatch(/\.wav$/);
    expect(indice.audios[claveAudio(indice.agentes.a1!, texto)]).toBe(archivo);
    // Las sueltas de las 10 voces, las de cada agente y los «2 agentes te necesitan» con la voz del Resumen.
    const st = p.v.estadoMotores().preparar;
    expect(st).toMatchObject({ hechas: p.hechos.length, fallas: 0, sinMotor: 0 });
    expect(p.hechos.length).toBe(10 * 12 + 2 * 20 + 4);
    // Todo publicado donde lo sirve Paperclip.
    expect(existsSync(join(p.publico, archivo))).toBe(true);
    expect(leer<IndiceVoces>(p.publico, "indice.json")).toEqual(indice);
  });

  it("después, un agente nuevo se graba solo, sin volver a bajar ni grabar lo que ya está", async () => {
    const p = armar();
    p.v.alDia({ agentes: AGENTES, motores: ["supertonic"], empezar: true });
    await hasta(() => p.v.estadoMotores().preparar.fase === "listo");
    const antes = p.hechos.length;
    p.v.alDia({ agentes: [...AGENTES, { id: "a3", nombre: "QA", empresa: "JSTM" }] });
    await hasta(() => p.v.estadoMotores().preparar.fase === "listo" && p.hechos.length > antes);
    // Sus 20 frases y los «3 agentes …» (4).
    expect(p.hechos.length - antes).toBe(20 + 4);
    expect(leer<IndiceVoces>(p.almacen, "indice.json").agentes.a3).toMatch(/^supertonic-/);
  });

  it("quien abre la oficina ve solo algunas empresas: los demás agentes no pierden su voz ni sus audios", async () => {
    const indice: IndiceVoces = { version: 1, generado: "", resumen: "supertonic-m1", agentes: { otro: "supertonic-f2" }, audios: { [claveAudio("supertonic-f2", "x")]: "x.wav" } };
    const p = armar({ indice });
    p.v.alDia({ agentes: AGENTES, motores: ["supertonic"], empezar: true });
    await hasta(() => p.v.estadoMotores().preparar.fase === "listo");
    const ahora = leer<IndiceVoces>(p.almacen, "indice.json");
    expect(ahora.agentes.otro).toBe("supertonic-f2");
    expect(ahora.audios[claveAudio("supertonic-f2", "x")]).toBe("x.wav");
  });

  it("un agente con una voz de un motor que no se eligió se queda con ella, y sus frases que faltan no se graban (no se manda nada a Microsoft)", async () => {
    const indice: IndiceVoces = { version: 1, generado: "", resumen: "supertonic-m1", agentes: { a1: "lorenzo" }, audios: {} };
    const p = armar({ indice, python: true });
    p.v.alDia({ agentes: AGENTES, motores: ["supertonic"], empezar: true });
    await hasta(() => p.v.estadoMotores().preparar.fase === "listo");
    expect(leer<IndiceVoces>(p.almacen, "indice.json").agentes.a1).toBe("lorenzo");
    expect(p.hechos.some((t) => t.voz.motor === "edge")).toBe(false);
    expect(p.v.estadoMotores().preparar.sinMotor).toBe(20);
  });

  it("si no se puede bajar el modelo, lo dice y no graba; apretarlo otra vez lo reintenta", async () => {
    let fallar = true;
    const p = armar({ bajar: async () => (fallar ? Promise.reject(new Error("sin internet")) : undefined) });
    p.v.alDia({ agentes: AGENTES, motores: ["supertonic"], empezar: true });
    await hasta(() => p.v.estadoMotores().preparar.fase === "error");
    expect(p.v.estadoMotores().preparar.motivo).toMatch(/No se pudo bajar Supertonic: sin internet/);
    expect(p.hechos).toHaveLength(0);
    fallar = false;
    p.v.alDia({ agentes: AGENTES, motores: ["supertonic"], empezar: true });
    await hasta(() => p.v.estadoMotores().preparar.fase === "listo");
    expect(p.hechos.length).toBeGreaterThan(0);
  });

  it("sin ningún motor elegido que funcione aquí, lo dice", async () => {
    const p = armar();
    p.v.alDia({ agentes: AGENTES, motores: ["edge"], empezar: true });
    await hasta(() => p.v.estadoMotores().preparar.fase === "error");
    expect(p.v.estadoMotores().preparar.motivo).toMatch(/uv/);
  });

  it("los motores tienen que venir bien al apretarlo", () => {
    const p = armar();
    expect(p.v.alDia({ agentes: AGENTES, motores: ["nada"], empezar: true }).ok).toBe(false);
    expect(p.v.alDia({ agentes: [{ id: "" }] }).ok).toBe(false);
  });

  it("lo que se prepara va después de lo que se lee al momento: una conversación no lo espera", async () => {
    const p = armar({ frenar: true });
    p.v.alDia({ agentes: AGENTES, motores: ["supertonic"], empezar: true });
    await hasta(() => p.v.estadoMotores().preparar.fase === "grabando");
    // Una frase de la oficina llega mientras se graba la primera de las preparadas.
    const indice = leer<IndiceVoces>(p.almacen, "indice.json");
    const pedido = { clase: "dale", agenteId: "a1" };
    const dicho = textoOficina(validarPedidoOficina(pedido)!)!;
    expect(p.v.prepararOficina([pedido])).toEqual(["fila"]);
    p.soltar();
    await hasta(() => p.hechos.length >= 1);
    await espera(10);
    p.soltar();
    await hasta(() => p.hechos.length >= 2);
    expect(p.hechos[1]!.archivo.startsWith("vivo/")).toBe(true);
    expect(p.hechos[1]!.voz.id).toBe(indice.agentes.a1);
    // El resto sigue solo.
    const vuelta = setInterval(p.soltar, 1);
    await hasta(() => p.v.estadoMotores().preparar.fase === "listo");
    clearInterval(vuelta);
    expect(existsSync(join(p.publico, archivoVivo(indice.agentes.a1!, dicho)))).toBe(true);
  });
});

describe("los audios fuera del plugin", () => {
  it("al arrancar adopta lo que había en dist/ui/voces (antes de la 0.13.0) y lo sigue publicando", () => {
    const indice: IndiceVoces = { version: 1, generado: "", resumen: "catalina", agentes: { a1: "lorenzo" }, audios: { [claveAudio("lorenzo", "Hola.")]: "abc.mp3" } };
    const p = armar({ indice });
    expect(leer<IndiceVoces>(p.almacen, "indice.json").agentes.a1).toBe("lorenzo");
    expect(existsSync(join(p.publico, "indice.json"))).toBe(true);
  });
});
