// «Leer contexto» con una voz de la lista (0.11.0, JST-325; spike de JST-323 §3): las frases se limpian antes de
// pedirlas al worker, que rechazaba 106 de 198 (97 por el código de tarea, 16 por símbolos, 3 por largas).
import { describe, expect, it, vi } from "vitest";
import { fraseResumenValida } from "../src/resumen/voz.js";
import { LectorContexto, type VozContexto } from "../src/ui/contextoLector.js";

// `elegida`: con una voz de la lista el motor lee; sin ella, el navegador. `pedidas` guarda lo que se le pidió al motor.
const falso = vi.hoisted(() => ({ elegida: false, pedidas: [] as Array<{ texto: string; siguen: string[] }> }));
vi.mock("../src/ui/eleccion.js", () => ({ vozParaLeer: async () => (falso.elegida ? { id: "voz-de-prueba" } : null) }));
vi.mock("../src/ui/resumenVoz.js", () => ({
  VozResumen: class {
    parar() {}
    async preparar() {}
    decir(f: { texto: string }, _v: number, _e: unknown, siguen: Array<{ texto: string }>) {
      falso.pedidas.push({ texto: f.texto, siguen: siguen.map((x) => x.texto) });
      return { fin: Promise.resolve(), cortar() {} };
    }
  },
}));
const { trozosParaMotor, VozContextoElegida } = await import("../src/ui/contextoMotor.js");

describe("las frases que se piden al worker", () => {
  it("el código de tarea se dice «JST 323», como lo decía el navegador", () => {
    expect(trozosParaMotor("Tarea JST-323: Spike de las voces.")).toEqual(["Tarea JST 323: Spike de las voces."]);
    expect(trozosParaMotor("Es parte de JST-64: pixel agent.")).toEqual(["Es parte de JST 64: pixel agent."]);
  });

  it("sin símbolos, enlaces ni estados en inglés", () => {
    const t = trozosParaMotor("Mira 🚀 el archivo src_ui/voz.ts → ya está in_review, listo https://ejemplo.cl/x.");
    expect(t).toHaveLength(1);
    expect(t[0]).not.toMatch(/🚀|→|_|https?:/);
    expect(fraseResumenValida(t[0])).toBe(true);
  });

  it("las largas se cortan en comas, hasta 240 letras cada trozo, y todas pasan las reglas del worker", () => {
    const larga = Array.from({ length: 14 }, (_, i) => `primero hacemos la cosa número ${i + 1} con cuidado`).join(", ") + ".";
    expect(larga.length).toBeGreaterThan(480);
    const t = trozosParaMotor(larga);
    expect(t.length).toBeGreaterThan(2);
    for (const x of t) {
      expect([...x].length).toBeLessThanOrEqual(240);
      expect(fraseResumenValida(x)).toBe(true);
    }
    // No se pierde nada: las mismas palabras, en el mismo orden.
    expect(t.join(" ").replace(/[,.]/g, "").split(/\s+/)).toEqual(larga.replace(/[,.]/g, "").split(/\s+/));
  });

  it("una sola palabra larguísima sin espacios también se parte", () => {
    const t = trozosParaMotor("a".repeat(500));
    expect(t.every((x) => [...x].length <= 240)).toBe(true);
  });

  it("lo que no tiene nada que decir (solo símbolos) no se pide", () => {
    expect(trozosParaMotor("🚀 → ✓")).toEqual([]);
  });
});

describe("el lector espera el audio de la primera frase en «Cargando…»", () => {
  it("con `preparar`, el estado sigue en «cargando» hasta que está; sin él, como siempre", async () => {
    let listo!: () => void;
    const hablado: string[] = [];
    const voz: VozContexto = {
      hayVoz: async () => true,
      preparar: () => new Promise<void>((ok) => (listo = ok)),
      decir: (f, fin) => (hablado.push(f), setTimeout(() => fin(false), 0), () => undefined),
    };
    const c = new LectorContexto({ voz, programar: (fn, ms) => (setTimeout(fn, ms), () => undefined) });
    const lectura = c.leer("JST-1", async () => "Primera frase. Segunda frase.");
    await new Promise((ok) => setTimeout(ok, 5));
    expect(c.estado).toBe("cargando");
    expect(hablado).toEqual([]);
    listo();
    await lectura;
    expect(c.estado).toBe("leyendo");
    expect(hablado[0]).toBe("Primera frase.");
    c.detener();
  });
});

describe("saltar hacia atrás con la voz elegida (JST-414)", () => {
  const navegador: VozContexto = { hayVoz: async () => false, decir: () => () => undefined };
  const flujo = async () => {
    falso.elegida = true;
    falso.pedidas = [];
    const voz = new VozContextoElegida({ companyId: () => "empresa-1", audio: () => ({}) as HTMLAudioElement, navegador });
    const frases = ["Primera frase de prueba.", "Segunda frase de prueba.", "Tercera frase de prueba.", "Cuarta frase de prueba."];
    expect(await voz.hayVoz()).toBe(true);
    await voz.preparar(frases);
    const decir = async (f: string) => {
      await new Promise<void>((ok) => voz.decir(f, () => ok(), false));
    };
    return { frases, decir };
  };

  it("al leer en orden, pide junto con cada trozo los dos que siguen", async () => {
    const { frases, decir } = await flujo();
    await decir(frases[0]!);
    await decir(frases[1]!);
    expect(falso.pedidas[0]).toEqual({ texto: "Primera frase de prueba.", siguen: ["Segunda frase de prueba.", "Tercera frase de prueba."] });
    expect(falso.pedidas[1]!.siguen).toEqual(["Tercera frase de prueba.", "Cuarta frase de prueba."]);
  });

  it("al repetir una frase anterior, busca el trozo desde el principio y pide los que le siguen (no los de la última)", async () => {
    const { frases, decir } = await flujo();
    for (const f of frases) await decir(f);
    await decir(frases[1]!);
    const repetida = falso.pedidas.at(-1)!;
    expect(repetida.texto).toBe("Segunda frase de prueba.");
    expect(repetida.siguen).toEqual(["Tercera frase de prueba.", "Cuarta frase de prueba."]);
    // Y sigue la lectura desde ahí: la próxima pide lo que sigue a la tercera.
    await decir(frases[2]!);
    expect(falso.pedidas.at(-1)!.siguen).toEqual(["Cuarta frase de prueba."]);
  });

  it("sin voz elegida, la dice el navegador", async () => {
    falso.elegida = false;
    const dichas: string[] = [];
    const voz = new VozContextoElegida({ companyId: () => null, audio: () => null, navegador: { hayVoz: async () => true, decir: (f) => (dichas.push(f), () => undefined) } });
    expect(await voz.hayVoz()).toBe(true);
    voz.decir("Una frase.", () => undefined, true);
    expect(dichas).toEqual(["Una frase."]);
  });
});
