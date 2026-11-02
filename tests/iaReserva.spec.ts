// 0.7.0 (JST-232): el pedido a la IA de Chrome (prompt v4 con su esquema), lo que se lee de su respuesta y la reserva
// que se guarda en el navegador (hasta 4 finales por clave y 30 sueltas, revisada otra vez al leerla).
import { describe, expect, it } from "vitest";
import type { Linea, MuestraFinal } from "../src/charlas.js";
import { armarPaquete, leerPaquete, SISTEMA, VERSION_PROMPT } from "../src/ia/prompt.js";
import { CADA_MS, fuenteDe, leerReserva, MAX_SUELTAS, POR_CLAVE, reservaVacia, sumarFinal, sumarSuelta, tocaRafaga, vacia, VENCE_MS } from "../src/ia/reserva.js";

const l = (quien: string, texto: string, codigo: string | null = null): Linea => ({ quien, texto, codigo, titulo: null });
const ERROR: MuestraFinal = { clave: "error-1|P3()/¿Qué le pasó?/Se quedó sin cupo, parece.", variante: "error-1", fijas: [l("a", "A CEO le falló el run."), l("b", "¿Qué le pasó?"), l("a", "Se quedó sin cupo, parece.")] };
const TERMINO: MuestraFinal = { clave: "termino-1|Acabo de terminar esta.", variante: "termino-1", fijas: [l("b", "Acabo de terminar esta.", "JST-91")] };

describe("el pedido (prompt v4 del spike, solo el final)", () => {
  it("el comienzo de cada conversación tal como lo dice hoy, sin la tarea, y cuántas sueltas", () => {
    const p = armarPaquete([ERROR, TERMINO], 2);
    expect(p.texto).toBe(["Conversaciones:", "- c1 · A: «A CEO le falló el run.» / B: «¿Qué le pasó?» / A: «Se quedó sin cupo, parece.»", "- c2 · A: «Acabo de terminar esta.»", "Frases sueltas:", "- s1", "- s2"].join("\n"));
    expect(p.texto).not.toContain("JST-91");
    expect([...p.finales.keys()]).toEqual(["c1", "c2"]);
  });

  it("el esquema pide objetos {texto} (las desbocadas del spike fueron con listas de textos), 1 o 2 frases, solo letras y signos", () => {
    const e = armarPaquete([ERROR], 1).esquema as any;
    expect(e.required).toEqual(["charlas", "sueltas"]);
    const frases = e.properties.charlas.items.properties.frases;
    expect(frases).toMatchObject({ minItems: 1, maxItems: 2, items: { type: "object", required: ["texto"] } });
    expect(new RegExp(frases.items.properties.texto.pattern).test("¡Buena! ¿Te costó?")).toBe(true);
    expect(new RegExp(frases.items.properties.texto.pattern).test("Somos 4 🎉")).toBe(false);
    expect(e.properties.charlas.items.properties.id.enum).toEqual(["c1"]);
    expect(e.properties.sueltas.items.properties.texto.pattern).toMatch(/\{1,30\}\$$/);
  });

  it("el prompt dice las reglas que revisa el código: sin datos, sin «voy a…», sin cuándo y las sueltas de 24 letras", () => {
    expect(SISTEMA).toContain("ningún nombre, cargo, empresa, número");
    expect(SISTEMA).toContain("«voy a…»");
    expect(SISTEMA).toContain("«hoy», «ayer», «antes», «mañana» ni «luego»");
    expect(SISTEMA).toContain("hasta 24 letras");
  });
});

describe("lo que se lee de la respuesta", () => {
  const p = armarPaquete([ERROR, TERMINO], 2);

  it("pasa lo bueno y bota cada frase o final malo (no el paquete)", () => {
    const salida = JSON.stringify({
      charlas: [
        { id: "c1", frases: [{ texto: "Uf, qué mal momento." }] },
        { id: "c2", frases: [{ texto: "¡Buena! ¿Fue para la QA?" }] },
      ],
      sueltas: [{ id: "s1", texto: "Qué rico el sofá." }, { id: "s2", texto: "Ojalá termine pronto." }],
    });
    const r = leerPaquete(salida, p, ["Catalina"]);
    expect(r.error).toBeNull();
    expect(r.finales).toEqual([{ clave: ERROR.clave, frases: ["Uf, qué mal momento."], muestra: ERROR }]);
    expect(r.sueltas).toEqual(["Qué rico el sofá."]);
    expect(r.botadas.map((b) => [b.id, b.motivos[0]])).toEqual([
      ["c2", "nombra a alguien por su cargo"],
      ["s2", "dice un estado"],
    ]);
  });

  it("un id que no se pidió o repetido se bota; también acepta frases como texto suelto", () => {
    const salida = JSON.stringify({ charlas: [{ id: "c9", frases: ["Hola."] }, { id: "c1", frases: ["Uf, qué lata."] }, { id: "c1", frases: ["Otra."] }], sueltas: [] });
    const r = leerPaquete(salida, p, []);
    expect(r.finales.map((f) => f.frases)).toEqual([["Uf, qué lata."]]);
    expect(r.botadas.map((b) => b.id)).toEqual(["c9", "c1"]);
  });

  it("bota lo que copia una frase del ejemplo (un modelo chico lo hace)", () => {
    const salida = JSON.stringify({
      charlas: [
        { id: "c1", frases: [{ texto: "¡Buena! ¿Te costó mucho?" }] },
        { id: "c2", frases: [{ texto: "Uf, qué alivio." }, { texto: "Un poco, pero quedó bien." }] },
      ],
      sueltas: [{ id: "s1", texto: "Este café me salva." }, { id: "s2", texto: "Qué rico el sofá." }],
    });
    const r = leerPaquete(salida, p, []);
    expect(r.finales).toEqual([]);
    expect(r.sueltas).toEqual(["Qué rico el sofá."]);
    expect(r.botadas.map((b) => [b.id, b.motivos])).toEqual([
      ["c1", ["copia el ejemplo"]],
      ["c2", ["copia el ejemplo"]],
      ["s1", ["copia el ejemplo"]],
    ]);
  });

  it("un JSON roto bota todo el paquete (se reintenta en la próxima ráfaga)", () => {
    expect(leerPaquete('{"charlas": [', p, []).error).toMatch(/^JSON malo/);
    expect(leerPaquete("null", p, []).error).toMatch(/^JSON malo/);
  });
});

describe("la reserva (en localStorage, la misma para todas las pestañas)", () => {
  it("hasta 4 finales por clave y 30 sueltas: al llegar uno nuevo se va el más viejo; lo repetido no entra", () => {
    const r = reservaVacia();
    for (let i = 0; i < 6; i++) sumarFinal(r, ERROR.clave, [`Uf, mal día ${"a".repeat(i)}.`], i);
    expect(r.finales[ERROR.clave]).toHaveLength(POR_CLAVE);
    expect(r.finales[ERROR.clave]![0]!.en).toBe(2);
    sumarFinal(r, ERROR.clave, ["uf, mal día aaaaa."], 10);
    expect(r.finales[ERROR.clave]).toHaveLength(POR_CLAVE);
    for (let i = 0; i < 35; i++) sumarSuelta(r, `Café número ${"x".repeat(i)}`, i);
    expect(r.sueltas).toHaveLength(MAX_SUELTAS);
    sumarSuelta(r, r.sueltas[0]!.f[0]!.toUpperCase(), 99);
    expect(r.sueltas).toHaveLength(MAX_SUELTAS);
  });

  it("al leerla se revisa otra vez: lo que no pasa, lo vencido o lo de otra versión del prompt no se usa", () => {
    const ahora = 10 * VENCE_MS;
    const guardada = {
      version: 1,
      prompt: VERSION_PROMPT,
      rafaga: ahora - 1000,
      finales: {
        [ERROR.clave]: [
          { f: ["Uf, qué mal momento."], en: ahora - 1000 },
          { f: ["Ahora somos 4."], en: ahora - 1000 },
          { f: ["Uf, otra vez."], en: ahora - VENCE_MS - 1 },
        ],
        "sin-clave": [{ f: ["Bacán."], en: ahora }],
      },
      sueltas: [{ f: ["Este café me salva."], en: ahora }, { f: ["Hola, Catalina."], en: ahora }, { f: ["Un respiro."], en: ahora }],
    };
    const r = leerReserva(JSON.stringify(guardada), ahora, ["Un respiro"]);
    expect(r.finales).toEqual({ [ERROR.clave]: [{ f: ["Uf, qué mal momento."], en: ahora - 1000 }] });
    expect(r.sueltas.map((s) => s.f[0])).toEqual(["Este café me salva."]);
    expect(r.rafaga).toBe(ahora - 1000);
    expect(vacia(leerReserva(JSON.stringify({ ...guardada, prompt: "v3" }), ahora))).toBe(true);
    expect(vacia(leerReserva("{roto", ahora))).toBe(true);
    expect(vacia(leerReserva(null, ahora))).toBe(true);
  });

  it("lo que guardó la 0.7.x con una palabra que no existe se bota al leerla, y lo demás se queda (0.8.1, JST-251)", () => {
    const ahora = 10 * VENCE_MS;
    const clave = "rol-1|¿Cómo va lo de las revisiones?/Ahí vamos, de a poco.";
    const guardada = {
      version: 1,
      prompt: VERSION_PROMPT,
      rafaga: ahora - 1000,
      finales: { [clave]: [{ f: ["Sí, un poco lento.", "Espero que se solven."], en: ahora - 2000 }, { f: ["¿Qué más?", "Nada especial."], en: ahora - 1000 }] },
      sueltas: [{ f: ["Ah, qué bueno. ¡Descanza!"], en: ahora }, { f: ["Me estiro un rato."], en: ahora }],
    };
    const r = leerReserva(JSON.stringify(guardada), ahora);
    expect(r.finales).toEqual({ [clave]: [{ f: ["¿Qué más?", "Nada especial."], en: ahora - 1000 }] });
    expect(r.sueltas.map((s) => s.f[0])).toEqual(["Me estiro un rato."]);
  });

  it("una ráfaga cada 15 min, contando la última de cualquier pestaña", () => {
    const r = reservaVacia();
    expect(tocaRafaga(r, 1_000)).toBe(true);
    r.rafaga = 1_000;
    expect(tocaRafaga(r, 1_000 + CADA_MS - 1)).toBe(false);
    expect(tocaRafaga(r, 1_000 + CADA_MS)).toBe(true);
    // Un reloj que volvió atrás no deja la reserva sin escribir para siempre.
    expect(tocaRafaga(r, 500)).toBe(true);
  });

  it("lo que usa el Guionista: un final de esa clave que no sea el último dicho, y una suelta que no se dijo hace poco", () => {
    const r = reservaVacia();
    sumarFinal(r, ERROR.clave, ["Uf, qué mal momento."], 1);
    sumarFinal(r, ERROR.clave, ["Ánimo, ya pasará."], 2);
    sumarSuelta(r, "Este café me salva.", 1);
    const f = fuenteDe(() => r);
    expect(f.final(ERROR.clave, () => 0, "Uf, qué mal momento.")).toEqual(["Ánimo, ya pasará."]);
    expect(f.final("otra|clave", () => 0, null)).toBeNull();
    expect(f.suelta(() => 0, ["Este café me salva."])).toBeNull();
    expect(f.suelta(() => 0, [])).toBe("Este café me salva.");
  });
});
