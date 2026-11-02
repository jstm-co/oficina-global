// 0.13.0 (JST-345): pedidos con aperturas y categorías nuevas, revisión por parte,
// reserva de 12/120, casi repeticiones, una hora sin repetir y contadores persistentes.
import { describe, expect, it } from "vitest";
import type { Linea, MuestraFinal } from "../src/charlas.js";
import { armarPaquete, leerPaquete, SISTEMA, VERSION_PROMPT } from "../src/ia/prompt.js";
import {
  anotarUso,
  CADA_MS,
  conteoIa,
  fuenteDe,
  leerReserva,
  MAX_SUELTAS,
  NO_REPITE_MS,
  POR_CLAVE,
  reservaVacia,
  sumarApertura,
  sumarBroma,
  sumarFinal,
  sumarMascota,
  sumarSuelta,
  tocaRafaga,
  vacia,
  VENCE_MS,
} from "../src/ia/reserva.js";

const l = (quien: string, texto: string, codigo: string | null = null): Linea => ({ quien, texto, codigo, titulo: null });
const ERROR: MuestraFinal = {
  clave: "error-1|P3()/¿Qué le pasó?/Se quedó sin cupo, parece.",
  variante: "error-1",
  apertura: "A {agente} le falló el run.",
  fijas: [l("a", "A CEO le falló el run."), l("b", "¿Qué le pasó?"), l("a", "Se quedó sin cupo, parece.")],
};
const TERMINO: MuestraFinal = {
  clave: "termino-1|Acabo de terminar esta.",
  variante: "termino-1",
  apertura: "Acabo de terminar {tarea}.",
  fijas: [l("b", "Acabo de terminar esta.", "JST-91")],
};
const RESPUESTA_BUENA = () => ({
  charlas: [
    { id: "c1", primera: "¡Qué lata por {agente}!", frases: [{ texto: "Uf, qué mal momento." }] },
    { id: "c2", primera: "Por fin {tarea}, qué alivio.", frases: [{ texto: "¡Buena! ¿Fue difícil?" }] },
  ],
  sueltas: [{ id: "s1", texto: "Linda la ventana azul." }, { id: "s2", texto: "Un sorbo y sigo." }],
  bromas: [{ id: "b1", frases: [{ texto: "¿Café o té?" }, { texto: "Café, por favor." }] }],
  mascotas: [
    { id: "m1", texto: "Qué rico el sol." },
    { id: "m2", texto: "El sofá me llama." },
    { id: "m3", texto: "Qué lindo el jardín." },
    { id: "m4", texto: "Todo está limpio." },
  ],
});

describe("el pedido con aperturas, bromas y mascotas", () => {
  it("manda la apertura con huecos, no el nombre ni el código, y las últimas frases para no repetir", () => {
    const p = armarPaquete([ERROR, TERMINO], 2, ["Este café me salva."]);
    expect(p.texto).toContain("Apertura: «A {agente} le falló el run.» · Huecos: {agente}");
    expect(p.texto).toContain("Apertura: «Acabo de terminar {tarea}.»");
    expect(p.texto).not.toContain("A CEO le falló el run.");
    expect(p.texto).not.toContain("JST-91");
    expect(p.texto).toContain("Bromas:\n- b1");
    expect(p.texto).toContain("Mascotas:\n- m1: gato");
    expect(p.texto).toContain("No repitas estas frases recientes:\n- «Este café me salva.»");
    expect([...p.finales.keys()]).toEqual(["c1", "c2"]);
  });

  it("el esquema permite huecos solo en la apertura y separa todas las categorías", () => {
    const e = armarPaquete([ERROR], 1).esquema as any;
    expect(e.required).toEqual(["charlas", "sueltas", "bromas", "mascotas"]);
    const charla = e.properties.charlas.items.properties;
    expect(new RegExp(charla.primera.pattern).test("¡Qué lata por {agente}!")).toBe(true);
    expect(new RegExp(charla.frases.items.properties.texto.pattern).test("Somos {agente}")).toBe(false);
    expect(charla.frases).toMatchObject({ minItems: 0, maxItems: 2 });
    expect(e.properties.bromas.items.properties.frases).toMatchObject({ minItems: 2, maxItems: 2 });
    expect(e.properties.mascotas.items.properties.id.enum).toEqual(["m1", "m2", "m3", "m4"]);
  });

  it("el prompt exige los mismos huecos, no repetir y frases de cada mascota", () => {
    expect(SISTEMA).toContain("exactamente los mismos huecos");
    expect(SISTEMA).toContain("No repitas las frases recientes");
    expect(SISTEMA).toContain("gato, perro, conejo o robot aspiradora");
  });

  it("un paquete solo de aperturas no pide finales ni otras categorías", () => {
    const dedicado = armarPaquete([ERROR], 5, [], true);
    expect(dedicado.texto).toContain("Solo reescribe aperturas");
    expect(dedicado.texto).not.toContain("Frases sueltas:");
    expect(dedicado.texto).not.toContain("Bromas:");
    expect(dedicado.texto).not.toContain("Mascotas:");
    const r = leerPaquete(JSON.stringify({ charlas: [{ id: "c1", primera: "¡Qué lata por {agente}!", frases: [] }] }), dedicado, []);
    expect(r.botadas).toEqual([]);
    expect(r.finales.map((f) => [f.apertura, f.frases])).toEqual([["¡Qué lata por {agente}!", []]]);
  });
});

describe("la respuesta se revisa por parte", () => {
  const p = armarPaquete([ERROR, TERMINO], 2);

  it("acepta todas las categorías buenas", () => {
    const r = leerPaquete(JSON.stringify(RESPUESTA_BUENA()), p, []);
    expect(r.error).toBeNull();
    expect(r.botadas).toEqual([]);
    expect(r.finales.map((f) => [f.apertura, f.frases])).toEqual([
      ["¡Qué lata por {agente}!", ["Uf, qué mal momento."]],
      ["Por fin {tarea}, qué alivio.", ["¡Buena! ¿Fue difícil?"]],
    ]);
    expect(r.sueltas).toHaveLength(2);
    expect(r.bromas).toEqual([["¿Café o té?", "Café, por favor."]]);
    expect(r.mascotas).toHaveLength(4);
  });

  it("bota una apertura con huecos faltantes, inventados o datos fuera de ellos, pero conserva el final bueno", () => {
    const salida = RESPUESTA_BUENA();
    salida.charlas[0]!.primera = "Qué lata, Catalina.";
    salida.charlas[1]!.primera = "Por fin {tarea} y {otro}, son 4.";
    const r = leerPaquete(JSON.stringify(salida), p, []);
    expect(r.finales.map((f) => [f.apertura, f.frases.length])).toEqual([
      [null, 1],
      [null, 1],
    ]);
    expect(r.botadas.filter((b) => b.tipo === "apertura").map((b) => b.motivos)).toEqual([
      expect.arrayContaining(["huecos distintos de la plantilla", "un nombre"]),
      expect.arrayContaining(["huecos distintos de la plantilla", "número"]),
    ]);
  });

  it("bota casi repeticiones dentro del paquete y respuestas con id desconocido", () => {
    const salida = RESPUESTA_BUENA();
    salida.sueltas[1]!.texto = "Linda la ventana azul, sí.";
    const r = leerPaquete(JSON.stringify(salida), p, []);
    expect(r.sueltas).toEqual(["Linda la ventana azul."]);
    expect(r.botadas.some((b) => b.tipo === "suelta" && b.motivos.includes("casi igual a otra del paquete"))).toBe(true);
    expect(leerPaquete(JSON.stringify({ charlas: [{ id: "c9", primera: "Hola.", frases: [] }] }), p, []).botadas[0]?.motivos).toEqual(["id que no se pidió"]);
  });

  it("bota finales y sueltas que copian el ejemplo, aunque conserva aperturas válidas", () => {
    const salida = RESPUESTA_BUENA();
    salida.charlas[0]!.frases = [{ texto: "¡Buena! ¿Te costó mucho?" }];
    salida.charlas[1]!.frases = [{ texto: "Uf, qué alivio." }, { texto: "Un poco, pero quedó bien." }];
    salida.sueltas[0]!.texto = "Este café me salva.";
    const r = leerPaquete(JSON.stringify(salida), p, []);
    expect(r.finales.map((f) => f.frases)).toEqual([[], []]);
    expect(r.sueltas).toEqual(["Un sorbo y sigo."]);
    expect(r.botadas.map((b) => [b.id, b.motivos])).toEqual([
      ["c1", ["copia el ejemplo"]],
      ["c2", ["copia el ejemplo"]],
      ["s1", ["copia el ejemplo"]],
    ]);
  });

  it("un JSON roto bota todo el paquete", () => {
    expect(leerPaquete('{"charlas": [', p, []).error).toMatch(/^JSON malo/);
    expect(leerPaquete("null", p, []).error).toMatch(/^JSON malo/);
  });
});

describe("la reserva persistente", () => {
  it("guarda 12 por plantilla y 120 sueltas, reemplaza las más viejas y bota las casi iguales", () => {
    const r = reservaVacia();
    for (let i = 0; i < 14; i++) sumarFinal(r, ERROR.clave, [`Uf, mal día ${"a".repeat(i)}.`], i);
    expect(r.finales[ERROR.clave]).toHaveLength(POR_CLAVE);
    expect(r.finales[ERROR.clave]![0]!.en).toBe(2);
    expect(sumarFinal(r, ERROR.clave, ["uf, mal día aaaaa."], 20)).toBe(false);
    for (let i = 0; i < 125; i++) sumarSuelta(r, `Café número ${"x".repeat(i)}`, i);
    expect(r.sueltas).toHaveLength(MAX_SUELTAS);
    expect(sumarSuelta(r, r.sueltas[0]!.f[0]!.toUpperCase(), 200)).toBe(false);
    expect(sumarApertura(r, ERROR.variante, ERROR.apertura, "¡Qué lata por {agente}!", 1)).toBe(true);
    expect(sumarApertura(r, ERROR.variante, ERROR.apertura, "Qué lata por {agente}", 2)).toBe(false);
    expect(sumarFinal(r, TERMINO.clave, ["¡Qué lata por {agente}!"], 2)).toBe(false);
    expect(sumarBroma(r, ["¿Café o té?", "Café, por favor."], 1)).toBe(true);
    expect(sumarMascota(r, "gato", "Qué rico el sol.", 1)).toBe(true);
    expect(r.escritas).toBe(14 + 125 + 1 + 2 + 1);
  });

  it("al recargar revisa huecos y todas las categorías; lo vencido o de otro prompt se bota", () => {
    const ahora = 10 * VENCE_MS;
    const guardada = {
      ...reservaVacia(),
      prompt: VERSION_PROMPT,
      rafaga: ahora - 1000,
      escritas: 8,
      aperturas: {
        [ERROR.variante]: [
          { f: ["¡Qué lata por {agente}!"], p: ERROR.apertura, en: ahora - 1000 },
          { f: ["Sin huecos."], p: ERROR.apertura, en: ahora - 1000 },
        ],
      },
      finales: { [ERROR.clave]: [{ f: ["Uf, qué mal momento."], en: ahora - 1000 }] },
      sueltas: [{ f: ["Este café me salva."], en: ahora }],
      bromas: [{ f: ["¿Café o té?", "Café, por favor."], en: ahora }],
      mascotas: { ...reservaVacia().mascotas, gato: [{ f: ["Qué rico el sol."], en: ahora }] },
    };
    const r = leerReserva(JSON.stringify(guardada), ahora);
    expect(r.aperturas[ERROR.variante]).toHaveLength(1);
    expect(r.finales[ERROR.clave]).toHaveLength(1);
    expect(r.sueltas).toHaveLength(1);
    expect(r.bromas).toHaveLength(1);
    expect(r.mascotas.gato).toHaveLength(1);
    expect(r.escritas).toBe(8);
    expect(vacia(leerReserva(JSON.stringify({ ...guardada, prompt: "v4" }), ahora))).toBe(true);
    expect(vacia(leerReserva("{roto", ahora))).toBe(true);
  });

  it("una ráfaga cada 15 min, contando la última de cualquier pestaña", () => {
    const r = reservaVacia();
    expect(tocaRafaga(r, 1_000)).toBe(true);
    r.rafaga = 1_000;
    expect(tocaRafaga(r, 1_000 + CADA_MS - 1)).toBe(false);
    expect(tocaRafaga(r, 1_000 + CADA_MS)).toBe(true);
    expect(tocaRafaga(r, 500)).toBe(true);
  });

  it("ninguna frase dicha en la última hora vuelve a salir; después sí", () => {
    const ahora = 1_000_000;
    const r = reservaVacia();
    sumarApertura(r, ERROR.variante, ERROR.apertura, "¡Qué lata por {agente}!", ahora);
    sumarFinal(r, ERROR.clave, ["Uf, qué mal momento."], ahora);
    sumarSuelta(r, "Este café me salva.", ahora);
    sumarBroma(r, ["¿Café o té?", "Café, por favor."], ahora);
    sumarMascota(r, "gato", "Qué rico el sol.", ahora);
    const ia = { clave: ERROR.clave, fijas: 3, frases: ["Uf, qué mal momento."], apertura: "¡Qué lata por {agente}!" };
    anotarUso(r, ERROR.fijas, ia, false, ahora);
    anotarUso(r, [l("a", "Este café me salva.")], undefined, true, ahora);
    anotarUso(r, [l("a", "¿Café o té?"), l("b", "Café, por favor.")], { clave: null, fijas: 0, frases: ["¿Café o té?", "Café, por favor."], broma: true }, false, ahora);
    anotarUso(r, [l("gato", "Qué rico el sol.")], undefined, true, ahora);
    let f = fuenteDe(() => r, () => ahora);
    expect(f.apertura(ERROR.variante, () => 0)).toBeNull();
    expect(f.final(ERROR.clave, () => 0, null)).toBeNull();
    expect(f.suelta(() => 0, [])).toBeNull();
    expect(f.broma(() => 0)).toBeNull();
    expect(f.mascota("gato", () => 0)).toBeNull();
    const despues = ahora + NO_REPITE_MS + 1;
    f = fuenteDe(() => r, () => despues);
    expect(f.apertura(ERROR.variante, () => 0)).toBe("¡Qué lata por {agente}!");
    expect(f.final(ERROR.clave, () => 0, null)).toEqual(["Uf, qué mal momento."]);
    expect(f.suelta(() => 0, [])).toBe("Este café me salva.");
    expect(f.broma(() => 0)).toEqual(["¿Café o té?", "Café, por favor."]);
    expect(f.mascota("gato", () => 0)).toBe("Qué rico el sol.");
    const c = conteoIa(r, ahora);
    expect(c.dichas).toBe(7);
    expect(c.deIa).toBe(6);
  });
});
