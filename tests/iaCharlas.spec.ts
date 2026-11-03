// 0.13.0 (JST-345): aperturas con datos reales, finales, sueltas, bromas y mascotas
// de la reserva; sin una variante o sin IA, la conversación de siempre.
import { describe, expect, it } from "vitest";
import {
  aperturaDe,
  claveDeFinal,
  DICEN,
  fijasDe,
  Guionista,
  MAX_FRASES_IA,
  rellenarApertura,
  unirFinal,
  type AgenteCharla,
  type ContextoCharla,
  type FuenteIa,
  type Guion,
  type IdMascota,
  type Linea,
} from "../src/charlas.js";
import type { Temas } from "../src/temas.js";

const RELOJ = Date.parse("2026-10-24T03:00:00.000Z");
function semilla(n = 7): () => number {
  let s = (n * 48271) % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
const ag = (id: string, o: Partial<AgenteCharla> = {}): AgenteCharla => ({ id, prefijo: "JST", nombre: id, empresa: "JSTM", st: "libre", need: false, rol: null, rolApi: null, motivo: null, espera: null, run: null, ...o });
function ctx(o: { otros?: AgenteCharla[]; temas?: Record<string, Temas>; azar?: () => number; ahora?: number } = {}): ContextoCharla {
  const a = ag("Ana");
  const b = ag("Beto");
  return { prefijo: "JST", a, b, agentes: [a, b, ...(o.otros ?? [])], temas: (id) => o.temas?.[id] ?? null, titulo: () => null, reloj: RELOJ, ahora: o.ahora ?? 0, azar: o.azar ?? semilla() };
}
const conError = (nombre = "CEO", motivo = "Claude usage limit reached") => ag(nombre, { st: "error", motivo });
const lineas = (...t: string[]): Linea[] => t.map((texto, i) => ({ quien: i % 2 ? "Beto" : "Ana", texto, codigo: null, titulo: null }));
const textos = (g: Guion | null) => g?.lineas.map((l) => l.texto) ?? [];

function fuente(o: { finales?: Record<string, string[]>; sueltas?: string[]; aperturas?: Record<string, string>; bromas?: string[][]; mascotas?: Partial<Record<IdMascota, string>>; dichas?: Set<string> } = {}) {
  const pedidos: Array<{ clave: string; evitar: string | null }> = [];
  const f: FuenteIa = {
    apertura: (variante) => o.aperturas?.[variante] ?? null,
    final: (clave, _azar, evitar) => {
      pedidos.push({ clave, evitar });
      return o.finales?.[clave] ?? null;
    },
    suelta: (_azar, recientes) => o.sueltas?.find((s) => !recientes.includes(s)) ?? null,
    broma: (azar) => (o.bromas?.length ? o.bromas[Math.floor(azar() * o.bromas.length)]! : null),
    mascota: (id) => o.mascotas?.[id] ?? null,
    dicha: (texto) => o.dichas?.has(texto) ?? false,
  };
  return { f, pedidos };
}

const CLAVE_ERROR = "error-1|P3()/¿Qué le pasó?/Se quedó sin cupo, parece.";
const APERTURA_ERROR = "¡Qué lata por {agente}!";

describe("qué frases de hoy quedan fijas", () => {
  it("hasta la última que trae un dato y, si es pregunta, su respuesta", () => {
    expect(fijasDe(lineas("A CEO le falló el run.", "¿Qué le pasó?", "Se quedó sin cupo, parece.", "Uf. Ojalá lo vean luego."))).toBe(3);
    expect(fijasDe(lineas("¿Cuántos están trabajando?", "5. Un día normal."))).toBe(2);
    const l = lineas("Catalina está esperando una respuesta.", "¿Por esta?", "Esa. Ojalá le contesten luego.");
    l[1]!.codigo = "JST-91";
    expect(fijasDe(l)).toBe(3);
  });

  it("una broma no trae datos (0) y lo que ya tiene 4 fijas no lleva final", () => {
    expect(fijasDe(lineas("¿Deploy el viernes?", "Ni en broma."))).toBe(0);
    const cola = lineas("¿Tienes mucho en cola?", "Tres, por lo menos.", "¡Uf! ¿Por cuál partes?", "Por esta.");
    cola[3]!.codigo = "JST-9";
    expect(fijasDe(cola)).toBe(MAX_FRASES_IA);
  });
});

describe("la clave de la reserva de finales", () => {
  it("le sirve a cualquiera con el mismo motivo y separa los tramos de números", () => {
    expect(claveDeFinal("error-1", lineas("A CEO le falló el run.", "¿Qué le pasó?", "Se quedó sin cupo, parece."))).toBe(CLAVE_ERROR);
    expect(claveDeFinal("error-1", lineas("A Ingeniero de Betalandia le falló el run.", "¿Qué le pasó?", "Se quedó sin cupo, parece."))).toBe(CLAVE_ERROR);
    expect(claveDeFinal("error-1", lineas("A CEO le falló el run.", "¿Qué le pasó?", "Le fallaron las pruebas."))).not.toBe(CLAVE_ERROR);
    const c = (n: number) => claveDeFinal("te-espera-3", lineas(`Hay ${n} esperando respuesta.`));
    expect(c(3)).toBe(c(5));
    expect(c(3)).not.toBe(c(12));
    expect(claveDeFinal("error-1", lineas("Esto no lo dijo la Oficina."))).toBeNull();
  });
});

describe("las aperturas con huecos", () => {
  it("saca tarea, agente, empresa, rol y números de la frase actual", () => {
    expect(aperturaDe({ texto: "Acabo de terminar esta.", codigo: "JST-91" })).toEqual({ plantilla: "Acabo de terminar {tarea}.", datos: { tarea: "esta" } });
    expect(aperturaDe({ texto: "A CEO le falló el run.", codigo: null })).toEqual({ plantilla: "A {agente} le falló el run.", datos: { agente: "CEO" } });
    expect(aperturaDe({ texto: "¿Cómo están en Betalandia?", codigo: null })).toEqual({ plantilla: "¿Cómo están en {empresa}?", datos: { empresa: "Betalandia" } });
    expect(aperturaDe({ texto: "¿Cómo va el código?", codigo: null })).toEqual({ plantilla: "¿Cómo va {rol}?", datos: { rol: "el código" } });
    expect(aperturaDe({ texto: "8 trabajando y 3 esperando respuesta.", codigo: null })).toEqual({ plantilla: "{n} trabajando y {esperando} esperando respuesta.", datos: { n: "8", esperando: "3" } });
  });

  it("rellena solo si la variante tiene exactamente los huecos actuales", () => {
    expect(rellenarApertura(APERTURA_ERROR, { texto: "A CEO le falló el run.", codigo: null })).toEqual({ texto: "¡Qué lata por CEO!", apertura: { plantilla: APERTURA_ERROR, datos: { agente: "CEO" } } });
    expect(rellenarApertura("Sin huecos.", { texto: "A CEO le falló el run.", codigo: null })).toBeNull();
  });
});

describe("el Guionista con la reserva de la IA", () => {
  it("rellena la apertura con el dato actual y mantiene las fijas y el turno del final", () => {
    const g = new Guionista();
    g.fijarIa(fuente({ aperturas: { "error-1": APERTURA_ERROR }, finales: { [CLAVE_ERROR]: ["Uf, qué mal momento."] } }).f);
    const r = g.armar(ctx({ otros: [conError()] }), "error")!;
    expect(textos(r)).toEqual(["¡Qué lata por CEO!", "¿Qué le pasó?", "Se quedó sin cupo, parece.", "Uf, qué mal momento."]);
    expect(r.lineas[0]).toMatchObject({ codigo: null, aperturaIa: { plantilla: APERTURA_ERROR, datos: { agente: "CEO" } } });
    expect(r.lineas[3]!.quien).not.toBe(r.lineas[2]!.quien);
    expect(r.ia).toEqual({ clave: CLAVE_ERROR, fijas: 3, frases: ["Uf, qué mal momento."], apertura: APERTURA_ERROR });
  });

  it("vuelta a las plantillas: sin IA o sin variantes; una apertura sola también sirve", () => {
    const deHoy = ["A CEO le falló el run.", "¿Qué le pasó?", "Se quedó sin cupo, parece.", "Uf. Ojalá lo vean luego."];
    expect(textos(new Guionista().armar(ctx({ otros: [conError()] }), "error"))).toEqual(deHoy);
    const sinReserva = new Guionista();
    sinReserva.fijarIa(fuente().f);
    expect(textos(sinReserva.armar(ctx({ otros: [conError()] }), "error"))).toEqual(deHoy);
    const apertura = new Guionista();
    apertura.fijarIa(fuente({ aperturas: { "error-1": APERTURA_ERROR } }).f);
    expect(textos(apertura.armar(ctx({ otros: [conError()] }), "error"))).toEqual(["¡Qué lata por CEO!", "¿Qué le pasó?", "Se quedó sin cupo, parece."]);
  });

  it("no repite el último final de esa clave", () => {
    const g = new Guionista();
    const { f, pedidos } = fuente({ finales: { [CLAVE_ERROR]: ["Uf, qué mal momento."] } });
    g.fijarIa(f);
    g.armar(ctx({ otros: [conError()] }), "error");
    for (let i = 0; i < 8; i++) g.armar(ctx({ ahora: i }), "broma");
    expect(g.armar(ctx({ otros: [conError()], ahora: 3_600_000 }), "error")?.variante).toBe("error-1");
    expect(pedidos.map((p) => p.evitar)).toEqual([null, "Uf, qué mal momento."]);
  });

  it("las bromas salen enteras de la IA; sin reserva, una de siempre", () => {
    const g = new Guionista();
    g.fijarIa(fuente({ bromas: [["¿Café o té?", "Café, por favor."]] }).f);
    const r = g.armar(ctx(), "broma")!;
    expect(textos(r)).toEqual(["¿Café o té?", "Café, por favor."]);
    expect(r.ia).toMatchObject({ broma: true, fijas: 0 });
    const fija = new Guionista();
    fija.fijarIa(fuente().f);
    expect(fija.armar(ctx(), "broma")?.ia).toBeUndefined();
  });

  it("rearmar conserva apertura, final y broma; sin IA o con otro motivo, descarta", () => {
    const g = new Guionista();
    g.fijarIa(fuente({ aperturas: { "error-1": APERTURA_ERROR }, finales: { [CLAVE_ERROR]: ["Uf, qué mal momento."] } }).f);
    const r = g.armar(ctx({ otros: [conError()] }), "error")!;
    expect(textos(g.rearmar(ctx({ otros: [conError()] }), r))).toEqual(textos(r));
    expect(g.rearmar(ctx({ otros: [conError("CEO", "tests failed")] }), r)).toBeNull();
    g.fijarIa(null);
    expect(g.rearmar(ctx({ otros: [conError()] }), r)).toBeNull();
  });

  it("las sueltas salen siempre de la IA si hay reserva; sin ella, conserva las de datos", () => {
    const g = new Guionista();
    g.fijarIa(fuente({ sueltas: ["Este café me salva.", "Un respiro y sigo."] }).f);
    const z = semilla(11);
    expect(g.suelta("Ana", null, z)?.texto).toBe("Este café me salva.");
    expect(g.suelta("Ana", null, z)?.texto).toBe("Un respiro y sigo.");
    const temas: Temas = { hecho: "JST-91", tituloHecho: "Re-QA", sigue: null, enCola: 0 };
    const hoy = new Guionista();
    hoy.fijarIa(fuente().f);
    expect(hoy.suelta("Ana", temas, () => 0)).toMatchObject({ texto: "Esta ya está. Me gané el café.", codigo: "JST-91" });
  });

  it("con la IA elegida no repite sueltas fijas en la hora: se calla cuando se agotan", () => {
    const dichas = new Set<string>();
    const { f } = fuente({ dichas });
    const g = new Guionista();
    g.fijarIa(f);
    const dichasAhora: string[] = [];
    for (let i = 0; i < 30; i++) {
      const linea = g.suelta("Ana", null, semilla(i + 1));
      if (!linea) continue;
      expect(dichas).not.toContain(linea.texto);
      dichas.add(linea.texto);
      dichasAhora.push(linea.texto);
    }
    expect(dichasAhora).toHaveLength(9);
    expect(new Set(dichasAhora).size).toBe(9);
    expect(g.suelta("Ana", null, semilla(31))).toBeNull();
  });

  it("con la IA elegida tampoco repite una conversación ni una mascota fija ya dicha", () => {
    const conversacion = new Guionista();
    conversacion.fijarIa(fuente({ dichas: new Set(["¿Qué le pasó?"]) }).f);
    expect(conversacion.armar(ctx({ otros: [conError()] }), "error")).toBeNull();
    const mascota = new Guionista();
    mascota.fijarIa(fuente({ dichas: new Set([DICEN.gato[0]!]) }).f);
    expect(mascota.mascota("gato", () => 0)).toBeNull();
  });

  it("las mascotas usan la variante de su especie y el respaldo rota como hoy", () => {
    const g = new Guionista();
    g.fijarIa(fuente({ mascotas: { gato: "Qué rico el sol." } }).f);
    expect(g.mascota("gato", () => 0)).toBe("Qué rico el sol.");
    expect(g.mascota("perro", () => 0)).toBe(DICEN.perro[0]);
    expect(g.mascota("perro", () => 0)).toBe(DICEN.perro[1]);
  });
});

describe("lo que se le puede pedir a la IA ahora", () => {
  it("incluye la apertura con huecos, sus fijas y clave; no recuerda nada", () => {
    const g = new Guionista();
    const m = g.muestras(ctx({ otros: [conError()] }));
    const error = m.find((x) => x.variante === "error-1")!;
    expect(error.clave).toBe(CLAVE_ERROR);
    expect(error.apertura).toBe("A {agente} le falló el run.");
    expect(error.fijas.map((l) => l.texto)).toEqual(["A CEO le falló el run.", "¿Qué le pasó?", "Se quedó sin cupo, parece."]);
    expect(m.some((x) => x.variante.startsWith("broma"))).toBe(false);
    for (const muestra of m) expect(rellenarApertura(muestra.apertura, muestra.fijas[0]!)?.texto, muestra.variante).toBe(muestra.fijas[0]!.texto);
    expect(g.armar(ctx({ otros: [conError()] }), "error")?.variante).toBe("error-1");
  });
});

describe("unir el final", () => {
  it("se turnan desde la última fija", () => {
    const u = unirFinal(lineas("Uno.", "Dos."), ["Tres.", "Cuatro."], "Ana", "Beto");
    expect(u.map((l) => l.quien)).toEqual(["Ana", "Beto", "Ana", "Beto"]);
  });
});
