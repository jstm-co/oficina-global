import { describe, expect, it } from "vitest";
import {
  BROMAS,
  BUSCA_MS,
  DICEN,
  ENTRE_FRASES_MS,
  Guionista,
  LETRAS_TAREA,
  MASCOTA_DICE_MS,
  MAX_CHARLAS,
  NO_SUELTA,
  NO_VARIANTE,
  PAREJA_MS,
  PEDIR_TEMAS_MS,
  PRIMERA_FRASE_MS,
  PRIMERA_MS,
  SALA_MS,
  SUELTA_MS,
  SUELTAS,
  VARIANTES,
  cortarTarea,
  duracionFrase,
  fraseEn,
  lineasDe,
  motivoError,
  motivoPausa,
  nombreDeCharla,
  nombreQueCabe,
  rolTema,
  unCorteMenos,
  type AgenteCharla,
  type ContextoCharla,
  type Guion,
  type Tema,
} from "../src/charlas.js";
import type { Temas } from "../src/temas.js";

const RELOJ = Date.parse("2026-10-22T18:00:00.000Z");
const haceMin = (m: number) => new Date(RELOJ - m * 60_000).toISOString();

function semilla(n = 7): () => number {
  let s = (n * 48271) % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const ag = (id: string, o: Partial<AgenteCharla> = {}): AgenteCharla => ({
  id,
  prefijo: "JST",
  nombre: id,
  empresa: "JSTM",
  st: "libre",
  need: false,
  rol: null,
  rolApi: null,
  motivo: null,
  espera: null,
  run: null,
  ...o,
});

interface OpcionesCtx {
  a?: AgenteCharla;
  b?: AgenteCharla;
  otros?: AgenteCharla[];
  temas?: Record<string, Temas>;
  titulos?: Record<string, string>;
  ahora?: number;
  azar?: () => number;
}

function ctx(o: OpcionesCtx = {}): ContextoCharla {
  const a = o.a ?? ag("Ana");
  const b = o.b ?? ag("Beto");
  return {
    prefijo: a.prefijo,
    a,
    b,
    agentes: [a, b, ...(o.otros ?? [])],
    temas: (id) => o.temas?.[id] ?? null,
    titulo: (c) => o.titulos?.[c] ?? null,
    reloj: RELOJ,
    ahora: o.ahora ?? 0,
    azar: o.azar ?? semilla(),
  };
}

const textos = (g: Guion | null) => g?.lineas.map((l) => l.texto) ?? [];

/** Todas las variantes de un tema que salen con este contexto (muchas semillas, un guionista nuevo cada vez). */
function variantesDe(tema: Tema, o: OpcionesCtx): Map<string, Guion> {
  const out = new Map<string, Guion>();
  for (let s = 1; s < 400; s++) {
    const g = new Guionista().armar(ctx({ ...o, azar: semilla(s) }), tema);
    if (g) out.set(g.variante, g);
  }
  return out;
}

describe("nombres, roles y motivos (JST-162 §1.1 y §1.3)", () => {
  it("el nombre para hablar: sin paréntesis, hasta « / », « + », « - » o «, », 20 letras por palabras y sin conector al final", () => {
    expect(nombreDeCharla("Ingeniero/a Full-stack de Plugins")).toBe("Ingeniero/a");
    expect(nombreDeCharla("Diseñador/a de Producto (UX/UI)")).toBe("Diseñador/a");
    expect(nombreDeCharla("Ingeniero Frontend React + Expo")).toBe("Ingeniero Frontend");
    expect(nombreDeCharla("Chief of staff")).toBe("Chief of staff");
    // «Documentación Técnica» tiene 21 letras: queda la primera palabra.
    expect(nombreDeCharla("Documentación Técnica (Betalandia)")).toBe("Documentación");
    expect(nombreDeCharla("Líder Técnico (Betalandia)")).toBe("Líder Técnico");
    expect(nombreDeCharla("QA - Pruebas")).toBe("QA");
    expect(nombreDeCharla("Hermes")).toBe("Hermes");
  });

  it("de qué se ocupa cada uno: por el cargo, después por el rol de Paperclip y si no, «la pega»", () => {
    expect(rolTema({ nombre: "Hermes", rol: null, rolApi: null })).toBe("lo de los servidores");
    expect(rolTema({ nombre: "Docs", rol: "Documentación Técnica", rolApi: "general" })).toBe("la documentación");
    expect(rolTema({ nombre: "QA", rol: "QA Engineer", rolApi: "qa" })).toBe("lo de las pruebas");
    expect(rolTema({ nombre: "Diseñador/a", rol: "Diseñador/a de Producto (UX/UI)", rolApi: "designer" })).toBe("el diseño");
    expect(rolTema({ nombre: "Ingeniero/a", rol: "Ingeniero/a Full-stack de Plugins", rolApi: "engineer" })).toBe("el código");
    expect(rolTema({ nombre: "CoS", rol: "Chief of staff", rolApi: "general" })).toBe("la coordinación");
    expect(rolTema({ nombre: "CEO", rol: "CEO", rolApi: "ceo" })).toBe("la empresa");
    expect(rolTema({ nombre: "X", rol: "Algo raro", rolApi: "pm" })).toBe("el producto");
    expect(rolTema({ nombre: "X", rol: null, rolApi: null })).toBe("la pega");
  });

  it("el motivo de un error y de una pausa, en corto", () => {
    expect(motivoError("Claude usage limit reached")).toBe("Se quedó sin cupo, parece.");
    expect(motivoError("Run timed out after 3600s")).toBe("Se le acabó el tiempo.");
    expect(motivoError("tests failed")).toBe("Le fallaron las pruebas.");
    expect(motivoError("HTTP 403 forbidden")).toBe("Un tema de permisos.");
    expect(motivoError("Process exited with exit code 1")).toBe("Se le cayó el proceso.");
    expect(motivoError(null)).toBe("No sé, hay que ver el detalle.");
    expect(motivoError("generate failed")).toBe("No sé, hay que ver el detalle.");
    expect(motivoPausa("budget_exceeded")).toBe("Por presupuesto.");
    expect(motivoPausa("awaiting approval")).toBe("Espera una aprobación.");
    expect(motivoPausa("manual")).toBe("Alguien le puso pausa.");
    expect(motivoPausa(null)).toBe("No sé, no dice.");
  });
});

describe("la tarea dentro del globo: el nombre cortado a 34 letras (JST-162 §1.4)", () => {
  it("por palabras, con «…», sin conector ni signo colgando y sin paréntesis abierto", () => {
    expect(LETRAS_TAREA).toBe(34);
    expect(cortarTarea("Re-QA de «Oficina global» 0.1.5 en la copia de prueba")).toBe("Re-QA de «Oficina global» 0.1.5…");
    expect(cortarTarea("Instalar la Oficina global en la instancia real")).toBe("Instalar la Oficina global…");
    expect(cortarTarea("Arreglar el sobre (cuando llega antes que el canal)")).toBe("Arreglar el sobre…");
    expect(cortarTarea("Probar el rótulo: corte y fundido al volver")).toBe("Probar el rótulo: corte y fundido…");
    for (const t of ["Diseño de «Oficina global»: mostrar de qué se trata cada tarea, no solo el código", "Una tarea con un nombre muy pero muy largo de verdad"]) {
      const c = cortarTarea(t);
      expect(c.endsWith("…")).toBe(true);
      expect(c.length - 1).toBeLessThanOrEqual(34);
      expect(t.startsWith(c.slice(0, -1))).toBe(true);
    }
  });

  it("un nombre de 34 letras o menos va entero", () => {
    expect(cortarTarea("Instalar la Oficina 0.4.0")).toBe("Instalar la Oficina 0.4.0");
    expect(cortarTarea("1234567890123456789012345678901234")).toBe("1234567890123456789012345678901234");
  });

  it("si no cabe en el ancho del globo, se corta antes, por palabras (el código va al comienzo de la línea)", () => {
    const medir = (t: string) => t.length * 5;
    const nombre = cortarTarea("Re-QA de «Oficina global» 0.1.5 en la copia");
    // Cabe en una línea de 200 px después de «JST-91: » (40 px).
    expect(nombreQueCabe(nombre, 200, 1, 40, medir)).toBe(nombre);
    // En 100 px y una línea, se corta antes: palabras enteras, con «…» y sin conector colgando («de»).
    const corto = nombreQueCabe(nombre, 100, 1, 40, medir);
    expect(corto).toBe("Re-QA…");
    expect(lineasDe(corto, 100, 40, medir)).toBe(1);
    // Con 2 líneas cabe más.
    expect(nombreQueCabe(nombre, 100, 2, 40, medir)).toBe("Re-QA de «Oficina global»…");
  });

  it("si lo estimado igual se dibuja en 2 líneas, el globo saca una palabra más, con las mismas reglas (JST-204)", () => {
    const cadena = (titulo: string) => {
      const nombre = cortarTarea(titulo);
      const cortes = [nombre];
      for (let c = unCorteMenos(nombre, nombre); c !== null; c = unCorteMenos(nombre, c)) cortes.push(c);
      return cortes;
    };
    // Los 2 del re-QA JST-177: sin «:» ni conector colgando; ya en la primera palabra, letra por letra hasta la última.
    expect(cadena("027 · Etapas 2 a 6: Entrega A, el reporte de la ficha en CSV (T011–T029, T064)")).toEqual([
      "027 · Etapas 2 a 6: Entrega…",
      "027 · Etapas 2 a 6…",
      "027 · Etapas 2…",
      "027 · Etapas…",
      "027…",
      "02…",
      "0…",
    ]);
    expect(cadena("Diseño de «Oficina global» 0.5.0: globos de estado y entrega").slice(0, 4)).toEqual([
      "Diseño de «Oficina global» 0.5.0…",
      "Diseño de «Oficina global»…",
      "Diseño de «Oficina…",
      "Diseño…",
    ]);
    // Un nombre entero (34 letras o menos) también se acorta.
    expect(unCorteMenos("Instalar la Oficina 0.4.0", "Instalar la Oficina 0.4.0")).toBe("Instalar la Oficina…");
  });

  it("lineasDe parte en los espacios, como el navegador", () => {
    const medir = (t: string) => t.length * 10;
    expect(lineasDe("uno dos tres", 200, 0, medir)).toBe(1);
    expect(lineasDe("uno dos tres", 80, 0, medir)).toBe(2);
    expect(lineasDe("uno dos tres", 80, 50, medir)).toBe(2);
    expect(lineasDe("palabralarguísima", 80, 0, medir)).toBe(99);
  });
});

describe("cuánto dura cada frase (JST-162 §2.2)", () => {
  it("2 s + 55 ms por letra (con el código y el nombre cortado), entre 2,5 y 5 s", () => {
    expect(duracionFrase({ texto: "Ánimo.", codigo: null, titulo: null })).toBe(2_500);
    expect(duracionFrase({ texto: "¡Bien! ¿Fue complicado?", codigo: null, titulo: null })).toBe(2_000 + 55 * 23);
    expect(Math.round(duracionFrase({ texto: "¡Bien! ¿Fue complicado?", codigo: null, titulo: null }) / 100) / 10).toBe(3.3);
    expect(duracionFrase({ texto: "Acabo de terminar esta.", codigo: "JST-91", titulo: "Re-QA de «Oficina global» 0.1.5 en la copia" })).toBe(5_000);
    // El nombre cuenta cortado: «Por esta.» + «JST-5: » + «Instalar la Oficina global…».
    expect(duracionFrase({ texto: "Por esta.", codigo: "JST-5", titulo: "Instalar la Oficina global en la instancia real" })).toBe(2_000 + 55 * (9 + 5 + 2 + 27));
    // Sin nombre conocido, solo el código.
    expect(duracionFrase({ texto: "Por esta.", codigo: "JST-5", titulo: null })).toBe(2_000 + 55 * (9 + 5 + 2));
  });

  it("una frase suelta dura 0,5 s menos, como mínimo 2,5 s", () => {
    expect(duracionFrase({ texto: "☕", codigo: null, titulo: null }, true)).toBe(2_500);
    expect(duracionFrase({ texto: "Esta ya está. Me gané el café.", codigo: "JST-9", titulo: null }, true)).toBe(2_000 + 55 * (30 + 5 + 2) - 500);
  });

  it("la primera llega 300 ms después de juntarse; cada una se queda su duración + 350 ms y no hay hueco sin globo", () => {
    expect(PRIMERA_FRASE_MS).toBe(300);
    expect(ENTRE_FRASES_MS).toBe(350);
    const durs = [2_500, 3_300, 5_000];
    expect(fraseEn(0, durs)).toEqual({ indice: -1, fin: false, cambia: 300 });
    expect(fraseEn(299, durs).indice).toBe(-1);
    expect(fraseEn(300, durs)).toEqual({ indice: 0, fin: false, cambia: 300 + 2_850 });
    expect(fraseEn(3_149, durs).indice).toBe(0);
    expect(fraseEn(3_150, durs).indice).toBe(1);
    expect(fraseEn(3_150 + 3_649, durs).indice).toBe(1);
    expect(fraseEn(3_150 + 3_650, durs).indice).toBe(2);
    expect(fraseEn(3_150 + 3_650 + 5_349, durs)).toMatchObject({ indice: 2, fin: false });
    expect(fraseEn(3_150 + 3_650 + 5_350, durs)).toMatchObject({ indice: -1, fin: true });
    // Siempre hay una frase a la vista entre la primera y el final.
    for (let t = 300; t < 3_150 + 3_650 + 5_350; t += 10) expect(fraseEn(t, durs).indice).toBeGreaterThanOrEqual(0);
    // Una de 4 frases dura ~14 s (la del ejemplo, con la tarea, 17 s) y una de 2, ~6 s.
    const d4 = ["Acabo de terminar esta.", "¡Bien! ¿Fue complicado?", "Tuvo lo suyo, pero salió.", "Genial, una menos en el tablero."].map((texto, i) => duracionFrase({ texto, codigo: i === 0 ? "JST-91" : null, titulo: i === 0 ? "Re-QA de «Oficina global» 0.1.5 en la copia" : null }));
    const total = (ds: number[]) => PRIMERA_FRASE_MS + ds.reduce((s, d) => s + d + ENTRE_FRASES_MS, 0);
    expect(d4).toEqual([5_000, 3_265, 3_375, 3_760]);
    expect(total(d4)).toBe(17_100);
    const d4b = ["¿Probaste apagarlo y prenderlo?", "Tres veces.", "¿Y?", "Ahora no prende."].map((texto) => duracionFrase({ texto, codigo: null, titulo: null }));
    expect(total(d4b)).toBeGreaterThan(12_000);
    expect(total(d4b)).toBeLessThan(15_000);
    const d2 = ["¿Quién rompió el build?", "Yo no, estaba en el descanso."].map((texto) => duracionFrase({ texto, codigo: null, titulo: null }));
    expect(total(d2)).toBeGreaterThan(5_500);
    expect(total(d2)).toBeLessThan(8_000);
  });
});

describe("las cifras del ritmo «Intermedio» (JST-162 §2.1)", () => {
  it("busca cada 15–30 s (al abrir, 5–10 s), la pareja a los 2 min, la sala descansa 20 s, hasta 3 a la vez, frase suelta cada 45–90 s", () => {
    expect(BUSCA_MS).toEqual([15_000, 30_000]);
    expect(PRIMERA_MS).toEqual([5_000, 10_000]);
    expect(PAREJA_MS).toBe(120_000);
    expect(SALA_MS).toBe(20_000);
    expect(MAX_CHARLAS).toBe(3);
    expect(SUELTA_MS).toEqual([45_000, 90_000]);
    expect(MASCOTA_DICE_MS).toBe(1_800);
    // Las lecturas no siguen al ritmo: los temas de una pareja, como mucho una vez por minuto en el piso.
    expect(PEDIR_TEMAS_MS).toBe(60_000);
  });
});

describe("qué dicen (JST-162 §1.3)", () => {
  const hecho: Temas = { hecho: "JST-91", tituloHecho: "Re-QA de «Oficina global» 0.1.5 en la copia", sigue: { codigo: "JST-98", estado: "todo", titulo: "QA de la 0.2.0" }, enCola: 3 };

  it("«Terminó algo»: empieza quien terminó; la frase no repite el código, la tarea va abajo con su nombre", () => {
    const vs = variantesDe("termino", { temas: { Ana: hecho } });
    expect([...vs.keys()].sort()).toEqual(["termino-1", "termino-2", "termino-3"]);
    const g1 = vs.get("termino-1")!;
    expect(textos(g1)).toEqual(["Acabo de terminar esta.", "¡Bien! ¿Fue complicado?", "Tuvo lo suyo, pero salió.", "Genial, una menos en el tablero."]);
    expect(g1.lineas.map((l) => l.quien)).toEqual(["Ana", "Beto", "Ana", "Beto"]);
    expect(g1.lineas[0]).toMatchObject({ codigo: "JST-91", titulo: "Re-QA de «Oficina global» 0.1.5 en la copia" });
    // «¿Y qué viene ahora?» → lo primero de su cola, si es `todo`.
    expect(textos(vs.get("termino-2")!)).toEqual(["Por fin cerré esta.", "¡Buena! ¿Y qué viene ahora?", "Esta otra."]);
    expect(vs.get("termino-2")!.lineas[2]).toMatchObject({ codigo: "JST-98", titulo: "QA de la 0.2.0" });
    // La 3: pregunta el otro.
    expect(vs.get("termino-3")!.lineas.map((l) => l.quien)).toEqual(["Beto", "Ana", "Beto"]);
    // Los dos terminaron algo: la 4.
    const dos = variantesDe("termino", { temas: { Ana: hecho, Beto: { hecho: "JST-77", sigue: null } } });
    expect(textos(dos.get("termino-4")!)).toEqual(["Cerré esta hace un rato.", "Yo también terminé una.", "Nos ganamos el café."]);
    expect(dos.get("termino-4")!.lineas.map((l) => l.codigo)).toEqual(["JST-91", "JST-77", null]);
    // Ninguna frase dice un código: siempre va en la línea de abajo.
    for (const g of [...vs.values(), ...dos.values()]) for (const l of g.lineas) expect(l.texto).not.toMatch(/[A-Z]+-\d+/);
  });

  it("«Terminó algo» sin cola en `todo`: «Nada por ahora. Café.»", () => {
    const vs = variantesDe("termino", { temas: { Beto: { hecho: "JST-91", sigue: { codigo: "JST-5", estado: "blocked" } } } });
    expect(textos(vs.get("termino-2")!).at(-1)).toBe("Nada por ahora. Café.");
    expect(vs.get("termino-2")!.lineas[0]!.quien).toBe("Beto");
  });

  it("«Su cola», «En revisión» y «Espera otra»; «Tres, por lo menos» solo con 3 en cola", () => {
    const cola = variantesDe("cola", { temas: { Ana: hecho } });
    expect([...cola.keys()].sort()).toEqual(["cola-1", "cola-2", "cola-3"]);
    expect(textos(cola.get("cola-3")!)).toEqual(["¿Tienes mucho en cola?", "Tres, por lo menos.", "¡Uf! ¿Por cuál partes?", "Por esta."]);
    expect([...variantesDe("cola", { temas: { Ana: { ...hecho, enCola: 2 } } }).keys()].sort()).toEqual(["cola-1", "cola-2"]);
    const rev = variantesDe("revision", { temas: { Ana: { hecho: null, sigue: { codigo: "JST-98", estado: "in_review" } } } });
    expect(textos(rev.get("revision-1")!)).toEqual(["Dejé esta en revisión.", "Ojalá pase a la primera."]);
    expect(textos(rev.get("revision-2")!)).toEqual(["¿En qué estás?", "Esperando que revisen esta.", "Paciencia, ya la van a ver."]);
    const otra = variantesDe("espera-otra", { temas: { Ana: { hecho: null, sigue: { codigo: "JST-90", estado: "blocked" } } } });
    expect(textos(otra.get("espera-otra-1")!)).toEqual(["Esta espera a que termine otra.", "Bueno, mientras tanto, café."]);
  });

  it("«Quién te espera»: qué espera, una hora o más, y 3 o más esperando; de otra empresa, con su empresa", () => {
    const lider = ag("lider", { prefijo: "BET", empresa: "Betalandia", nombre: "Líder Técnico (Betalandia)", st: "toca", need: true, espera: { tipo: "aprobacion", codigo: "BET-268", desde: haceMin(150) } });
    const vs = variantesDe("te-espera", { otros: [lider] });
    expect(textos(vs.get("te-espera-1")!)).toEqual(["Líder Técnico de Betalandia está esperando una aprobación.", "¿Por esta?", "Esa. Ojalá le contesten luego."]);
    expect(vs.get("te-espera-1")!.lineas[1]!.codigo).toBe("BET-268");
    expect(textos(vs.get("te-espera-2")!)).toEqual(["Líder Técnico de Betalandia lleva 2 horas esperando.", "¿Por cuál?", "Por esta.", "Ya le van a contestar."]);
    const reciente = { ...lider, prefijo: "JST", empresa: "JSTM", espera: { tipo: "tarjeta" as const, codigo: "JST-63", desde: haceMin(70) } };
    expect(textos(variantesDe("te-espera", { otros: [reciente] }).get("te-espera-2")!)[0]).toBe("Líder Técnico lleva una hora esperando.");
    const tres = [lider, { ...lider, id: "x" }, { ...lider, id: "y" }];
    expect(textos(variantesDe("te-espera", { otros: tres }).get("te-espera-3")!)).toEqual(["Hay 3 esperando respuesta.", "Uf, harta cola."]);
    // Menos de una hora: no hay «lleva una hora».
    expect(variantesDe("te-espera", { otros: [{ ...reciente, espera: { tipo: "tarjeta", codigo: "JST-63", desde: haceMin(20) } }] }).has("te-espera-2")).toBe(false);
  });

  it("«A quién le falló algo»: el motivo en corto, la tarea de su run y 2 o más con error", () => {
    const ing = ag("ing", { prefijo: "BET", empresa: "Betalandia", nombre: "Ingeniero", st: "error", motivo: "usage limit", run: { codigo: "BET-12", desde: null, enCola: false } });
    const vs = variantesDe("error", { otros: [ing] });
    expect(textos(vs.get("error-1")!)).toEqual(["A Ingeniero de Betalandia le falló el run.", "¿Qué le pasó?", "Se quedó sin cupo, parece.", "Uf. Ojalá lo vean luego."]);
    expect(textos(vs.get("error-2")!)).toEqual(["¿Viste que Ingeniero de Betalandia tiene un error?", "Sí, en esta.", "Ojalá se arregle luego."]);
    expect(vs.get("error-2")!.lineas[1]!.codigo).toBe("BET-12");
    const qa = ag("qa", { nombre: "QA", st: "error" });
    expect(textos(variantesDe("error", { otros: [ing, qa] }).get("error-3")!)).toEqual(["Hay 2 con error.", "Mal día para los runs."]);
    // Los de la misma sala, sin empresa; y primero los de su sala.
    expect(textos(variantesDe("error", { otros: [ing, qa] }).get("error-1")!)[0]).toBe("A QA le falló el run.");
  });

  it("«En pausa», «Cuántos trabajan» (según cuántos) y «Cómo están en otra empresa»", () => {
    const p = ag("p", { nombre: "Docs", st: "pausa", motivo: "budget" });
    expect(textos(variantesDe("pausa", { otros: [p] }).get("pausa-1")!)).toEqual(["Docs sigue en pausa.", "¿Y eso?", "Por presupuesto.", "Ya volverá."]);
    const trabajando = (n: number) => Array.from({ length: n }, (_, i) => ag(`t${i}`, { st: "trabaja" }));
    expect([...variantesDe("trabajan", { otros: trabajando(9) }).keys()].sort()).toEqual(["trabajan-1", "trabajan-2"]);
    expect(textos(variantesDe("trabajan", { otros: trabajando(9) }).get("trabajan-1")!)).toEqual(["Hay 9 trabajando ahora.", "Entonces es buen momento para un café."]);
    expect(textos(variantesDe("trabajan", { otros: trabajando(5) }).get("trabajan-3")!)).toEqual(["¿Cuántos están trabajando?", "5. Un día normal."]);
    expect(textos(variantesDe("trabajan", { otros: trabajando(1) }).get("trabajan-4")!)).toEqual(["Uno solo trabajando.", "Día tranquilo, entonces."]);
    expect(textos(variantesDe("trabajan", { otros: trabajando(2) }).get("trabajan-4")!)[0]).toBe("Solo dos trabajando.");
    expect(textos(variantesDe("trabajan", {}).get("trabajan-5")!)).toEqual(["Nadie está trabajando.", "Silencio total. Se escucha el refri."]);
    const mig = (n: number, k: number) => [...Array.from({ length: n }, (_, i) => ag(`m${i}`, { prefijo: "MIG", empresa: "Migo", st: "trabaja" })), ...Array.from({ length: k }, (_, i) => ag(`k${i}`, { prefijo: "MIG", empresa: "Migo", st: "toca", need: true }))];
    expect(textos(variantesDe("empresa", { otros: mig(3, 1) }).get("empresa-1")!)).toEqual(["¿Cómo están en Migo?", "3 trabajando y 1 esperando respuesta.", "Harta pega por allá."]);
    expect(textos(variantesDe("empresa", { otros: mig(1, 0) }).get("empresa-1")!)).toEqual(["¿Cómo están en Migo?", "1 trabajando.", "Mejor para ellos."]);
    expect(textos(variantesDe("empresa", { otros: [ag("z", { prefijo: "MIG", empresa: "Migo" })] }).get("empresa-1")!)[1]).toBe("Tranquilos. Nadie trabajando.");
    // Sin otra sala, no hay «otra empresa».
    expect(variantesDe("empresa", {}).size).toBe(0);
  });

  it("con el filtro de una empresa, «Hay {n} …» cuenta solo las salas del filtro, como el encabezado (JST-176)", () => {
    // El Mirador: 2 trabajando, 3 te necesitan y 2 con error; el resto del piso: 4 trabajando, 2 te necesitan y 1 con error.
    const elm = [
      ...["e0", "e1"].map((id) => ag(id, { prefijo: "ELM", empresa: "El Mirador", st: "trabaja" })),
      ...["e2", "e3", "e4"].map((id) => ag(id, { prefijo: "ELM", empresa: "El Mirador", st: "toca", need: true, espera: { tipo: "tarjeta", codigo: "ELM-9", desde: haceMin(5) } })),
      ...["e5", "e6"].map((id) => ag(id, { prefijo: "ELM", empresa: "El Mirador", st: "error" })),
    ];
    const resto = [
      ...["t0", "t1", "t2", "t3"].map((id) => ag(id, { st: "trabaja" })),
      ...["n0", "n1"].map((id) => ag(id, { st: "toca", need: true, espera: { tipo: "tarjeta", codigo: "JST-9", desde: haceMin(5) } })),
      ag("x0", { st: "error" }),
    ];
    const conFiltro = (filtro: string[]) => (tema: Tema) => {
      const out = new Map<string, Guion>();
      for (let s = 1; s < 400; s++) {
        const g = new Guionista().armar({ ...ctx({ otros: [...elm, ...resto], azar: semilla(s) }), filtro }, tema);
        if (g) out.set(g.variante, g);
      }
      return out;
    };
    const elMirador = conFiltro(["ELM"]);
    expect(textos(elMirador("trabajan").get("trabajan-4")!)).toEqual(["Solo dos trabajando.", "Día tranquilo, entonces."]);
    expect(elMirador("trabajan").has("trabajan-3")).toBe(false);
    expect(textos(elMirador("te-espera").get("te-espera-3")!)[0]).toBe("Hay 3 esperando respuesta.");
    expect(textos(elMirador("error").get("error-3")!)[0]).toBe("Hay 2 con error.");
    // Sin filtro (o con todas): todo el piso.
    for (const todas of [conFiltro([]), conFiltro(["ELM", "JST"])]) {
      expect(textos(todas("trabajan").get("trabajan-3")!)).toEqual(["¿Cuántos están trabajando?", "6. Un día normal."]);
      expect(textos(todas("te-espera").get("te-espera-3")!)[0]).toBe("Hay 5 esperando respuesta.");
      expect(textos(todas("error").get("error-3")!)[0]).toBe("Hay 3 con error.");
    }
    // Con el filtro de una sala con menos de 3 esperando, no hay «Hay {n} esperando respuesta».
    expect(conFiltro(["JST"])("te-espera").has("te-espera-3")).toBe(false);
  });

  it("«Cómo le va en su rol»: pregunta por lo suyo y responde con sus temas guardados (o «Ahí vamos» sin ellos)", () => {
    const b = ag("Beto", { rol: "QA Engineer" });
    const r = (t?: Temas) => textos(variantesDe("rol", { b, temas: t ? { Beto: t } : {} }).get("rol-1")!);
    expect(r()).toEqual(["¿Cómo va lo de las pruebas?", "Ahí vamos, de a poco.", "Ánimo."]);
    expect(r({ hecho: "JST-1", sigue: null })).toEqual(["¿Cómo va lo de las pruebas?", "Bien. Hoy cerré esta.", "Bacán."]);
    expect(r({ hecho: null, sigue: { codigo: "JST-2", estado: "todo" }, enCola: 3 })).toEqual(["¿Cómo va lo de las pruebas?", "Harta pega: tres en cola.", "Ánimo."]);
    expect(r({ hecho: null, sigue: { codigo: "JST-2", estado: "todo" }, enCola: 1 })).toEqual(["¿Cómo va lo de las pruebas?", "Bien, con esta en cola.", "Me alegro."]);
    expect(r({ hecho: null, sigue: null, enCola: 0 })).toEqual(["¿Cómo va lo de las pruebas?", "Tranqui. Sin nada en cola.", "Qué envidia."]);
  });

  it("«Qué hace alguien de su sala»: cuánto lleva (de a 5 min o en horas), recién empezó, en cola o en qué anda", () => {
    const y = (min: number | null, enCola = false) => ag("y", { nombre: "Ingeniero/a Full-stack de Plugins", st: "trabaja", run: { codigo: "JST-164", desde: min === null ? null : haceMin(min), enCola } });
    expect(textos(variantesDe("sala", { otros: [y(37)] }).get("sala-1")!)).toEqual(["Ingeniero/a lleva 35 minutos con esta.", "Mejor no interrumpir."]);
    expect(textos(variantesDe("sala", { otros: [y(150)] }).get("sala-1")!)[0]).toBe("Ingeniero/a lleva 2 horas con esta.");
    expect(textos(variantesDe("sala", { otros: [y(2)] }).get("sala-2")!)).toEqual(["Ingeniero/a recién empezó esta.", "Después le llevamos un café."]);
    expect(textos(variantesDe("sala", { otros: [y(2, true)] }).get("sala-3")!)).toEqual(["Ingeniero/a está en cola con esta.", "Le toca esperar su turno."]);
    expect(textos(variantesDe("sala", { otros: [y(12)] }).get("sala-4")!)).toEqual(["¿En qué anda Ingeniero/a?", "En esta.", "Ah, buena."]);
    // Sin saber desde cuándo, no dice que recién empezó.
    expect(variantesDe("sala", { otros: [y(null)] }).has("sala-2")).toBe(false);
    // Los de otra sala no cuentan.
    expect(variantesDe("sala", { otros: [{ ...y(40), prefijo: "BET" }] }).size).toBe(0);
  });

  it("hay 28 conversaciones con datos en 11 temas, 12 bromas y 9 frases sueltas fijas", () => {
    const conDatos = VARIANTES.filter((x) => x.tema !== "broma");
    expect(conDatos).toHaveLength(28);
    expect(new Set(conDatos.map((x) => x.tema)).size).toBe(11);
    expect(BROMAS).toHaveLength(12);
    expect(SUELTAS).toHaveLength(9);
  });
});

describe("cómo se eligen y que no se repitan seguido (JST-162 §1.7)", () => {
  /** Un piso con de todo para contar: así siempre hay varios temas. */
  const lleno: OpcionesCtx = {
    temas: { Ana: { hecho: "JST-91", sigue: { codigo: "JST-98", estado: "todo" }, enCola: 3 }, Beto: { hecho: null, sigue: { codigo: "JST-7", estado: "in_review" } } },
    otros: [
      ag("lider", { prefijo: "BET", empresa: "Betalandia", nombre: "Líder", st: "toca", need: true, espera: { tipo: "tarjeta", codigo: "BET-1", desde: haceMin(90) } }),
      ag("ing", { prefijo: "BET", empresa: "Betalandia", nombre: "Ingeniero", st: "error", motivo: "timeout", run: { codigo: "BET-2", desde: null, enCola: false } }),
      ag("doc", { nombre: "Docs", st: "pausa", motivo: "manual" }),
      ag("w1", { nombre: "Qa", st: "trabaja", run: { codigo: "JST-3", desde: haceMin(40), enCola: false } }),
      ag("w2", { prefijo: "MIG", empresa: "Migo", st: "trabaja", run: { codigo: "MIG-4", desde: haceMin(3), enCola: false } }),
    ],
  };

  it("ninguna variante vuelve antes de 8 conversaciones del piso, y un tema no se repite en las 2 siguientes de la sala (las bromas no cuentan)", () => {
    const g = new Guionista();
    const azar = semilla(3);
    const dichas: Guion[] = [];
    for (let i = 0; i < 200; i++) {
      const x = g.armar(ctx({ ...lleno, ahora: i * 30_000, azar }));
      expect(x).not.toBeNull();
      dichas.push(x!);
    }
    for (let i = 0; i < dichas.length; i++) {
      for (let k = 1; k <= NO_VARIANTE && i + k < dichas.length; k++) expect(dichas[i + k]!.variante).not.toBe(dichas[i]!.variante);
    }
    const temas = dichas.map((d) => d.tema).filter((t) => t !== "broma");
    for (let i = 0; i < temas.length; i++) for (let k = 1; k <= 2 && i + k < temas.length; k++) expect(temas[i + k]).not.toBe(temas[i]);
    // Salen muchos temas distintos, más los de más peso.
    expect(new Set(temas).size).toBeGreaterThanOrEqual(8);
  });

  it("el mismo tema sobre la misma persona espera 10 min (p. ej. el error de Ingeniero)", () => {
    const g = new Guionista();
    const azar = semilla(5);
    const veces: number[] = [];
    for (let i = 0; i < 120; i++) {
      const t = i * 15_000;
      const x = g.armar(ctx({ ...lleno, ahora: t, azar }));
      if (x?.variante === "error-1" || x?.variante === "error-2") veces.push(t);
    }
    expect(veces.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < veces.length; i++) expect(veces[i]! - veces[i - 1]!).toBeGreaterThanOrEqual(10 * 60_000);
  });

  it("nadie cuenta la misma tarea suya antes de 10 min: terminó, cola, revisión, espera otra y la respuesta de «rol» (JST-173)", () => {
    // Tres en el descanso, cada uno con lo suyo, que se juntan de a dos en todos los órdenes cada 15 s por 50 min.
    const temas: Record<string, Temas> = {
      Ana: { hecho: "JST-91", sigue: { codigo: "JST-98", estado: "todo" }, enCola: 3 },
      Beto: { hecho: "JST-77", sigue: { codigo: "JST-7", estado: "in_review" } },
      Caro: { hecho: null, sigue: { codigo: "JST-64", estado: "blocked" } },
    };
    const tres = ["Ana", "Beto", "Caro"].map((id) => ag(id));
    const [ana, beto, caro] = tres;
    const parejas = [[ana, beto], [beto, caro], [caro, ana], [beto, ana], [caro, beto], [ana, caro]] as const;
    const g = new Guionista();
    const azar = semilla(9);
    const cuando = new Map<string, number[]>();
    const anotar = (k: string, t: number) => cuando.set(k, [...(cuando.get(k) ?? []), t]);
    for (let i = 0; i < 200; i++) {
      const t = i * 15_000;
      const [a, b] = parejas[i % parejas.length]!;
      const x = g.armar(ctx({ a, b, otros: tres.filter((o) => o !== a && o !== b), temas, ahora: t, azar }));
      if (!x) continue;
      // Quien dice una tarea habla de la suya; cada persona y tarea una vez por conversación.
      for (const k of new Set(x.lineas.filter((l) => l.codigo).map((l) => `${l.quien} ${l.codigo}`))) anotar(k, t);
      if (x.tema === "rol") anotar(`rol ${x.lineas[1]!.quien}`, t);
    }
    expect([...cuando.keys()].sort()).toEqual(["Ana JST-91", "Ana JST-98", "Beto JST-7", "Beto JST-77", "Caro JST-64", "rol Ana", "rol Beto", "rol Caro"]);
    for (const [k, ts] of cuando) {
      // Cada tarea sale varias veces (la respuesta de «rol» de Ana casi nunca: su «terminó» la frena).
      if (!k.startsWith("rol")) expect(ts.length, k).toBeGreaterThanOrEqual(3);
      for (let i = 1; i < ts.length; i++) expect(ts[i]! - ts[i - 1]!, `${k} a los ${ts[i]! / 60_000} min`).toBeGreaterThanOrEqual(10 * 60_000);
    }
  });

  it("si uno de la pareja ya contó lo que terminó, se cuenta lo del otro (JST-173)", () => {
    const temas: Record<string, Temas> = { Ana: { hecho: "JST-91", sigue: null }, Beto: { hecho: "JST-77", sigue: null } };
    const luego: Guion[] = [];
    for (let s = 1; s <= 60; s++) {
      const g = new Guionista();
      const primero = g.armar(ctx({ temas: { Ana: temas.Ana! }, ahora: 0, azar: semilla(s) }), "termino")!;
      expect(primero.lineas.find((l) => l.codigo)).toMatchObject({ quien: "Ana", codigo: "JST-91" });
      // Dos conversaciones más en la sala, para que «terminó» pueda volver (§1.7), y 5 min después la misma pareja: lo de Beto sí, lo de Ana no.
      g.armar(ctx({ temas, ahora: 60_000 }), "trabajan");
      g.armar(ctx({ b: ag("Caro"), temas, ahora: 120_000 }), "rol");
      luego.push(g.armar(ctx({ temas, ahora: 5 * 60_000, azar: semilla(s + 100) }))!);
    }
    for (const x of luego) expect(x.lineas.map((l) => l.codigo)).not.toContain("JST-91");
    expect(luego.filter((x) => x.tema === "termino" && x.lineas.some((l) => l.quien === "Beto" && l.codigo === "JST-77")).length).toBeGreaterThan(5);
  });

  it("los temas salen según su peso (terminó 5, te espera 4, error 4… otra empresa 1)", () => {
    const cuenta = new Map<string, number>();
    for (let s = 1; s <= 3_000; s++) {
      const x = new Guionista().armar(ctx({ ...lleno, azar: semilla(s) }));
      cuenta.set(x!.tema, (cuenta.get(x!.tema) ?? 0) + 1);
    }
    const n = (t: Tema) => cuenta.get(t) ?? 0;
    expect(n("termino")).toBeGreaterThan(n("cola"));
    expect(n("te-espera")).toBeGreaterThan(n("pausa") * 2);
    expect(n("error")).toBeGreaterThan(n("empresa") * 2);
    expect(n("cola")).toBeGreaterThan(n("revision"));
    // 1 de cada 5 es broma aunque haya temas.
    expect(n("broma") / 3_000).toBeGreaterThan(0.15);
    expect(n("broma") / 3_000).toBeLessThan(0.25);
  });

  it("si no hay nada que contar, se cuentan una broma", () => {
    // Solo «trabajan» y «rol» (siempre hay): después de esos 2, en la misma sala no queda ningún tema.
    const g = new Guionista();
    const sinBromaAlAzar = () => 0.99;
    const temas = [0, 1, 2].map((i) => g.armar(ctx({ ahora: i * 30_000, azar: sinBromaAlAzar }))!.tema);
    expect(new Set(temas.slice(0, 2))).toEqual(new Set(["trabajan", "rol"]));
    expect(temas[2]).toBe("broma");
  });

  it("las bromas salen de un mazo: todas antes de repetir y nunca la misma 2 veces seguidas", () => {
    const g = new Guionista();
    const azar = semilla(11);
    const dichas = Array.from({ length: 60 }, (_, i) => g.armar(ctx({ ahora: i * 30_000, azar }), "broma")!.variante);
    expect(new Set(dichas.slice(0, 12)).size).toBe(12);
    for (let i = 1; i < dichas.length; i++) expect(dichas[i]).not.toBe(dichas[i - 1]);
    for (let i = 0; i + NO_VARIANTE < dichas.length; i++) expect(dichas.slice(i + 1, i + 1 + NO_VARIANTE)).not.toContain(dichas[i]);
    // Siempre entre 2 y 4 frases, por turnos.
    for (const id of new Set(dichas)) {
      const b = BROMAS[Number(id.split("-")[1]) - 1]!;
      expect(b.length).toBeGreaterThanOrEqual(2);
      expect(b.length).toBeLessThanOrEqual(4);
      b.forEach(([q], i) => expect(q).toBe(i % 2 === 0 ? "S" : "O"));
    }
  });

  it("una broma empieza quien buscó con quién hablar", () => {
    const x = new Guionista().armar(ctx({ azar: semilla(2) }), "broma")!;
    expect(x.lineas[0]!.quien).toBe("Ana");
    expect(x.lineas[1]!.quien).toBe("Beto");
  });
});

describe("frases sueltas (JST-162 §1.6)", () => {
  it("las fijas salen de un mazo y ninguna vuelve en las 5 siguientes", () => {
    const g = new Guionista();
    const azar = semilla(9);
    const dichas = Array.from({ length: 80 }, () => g.suelta("Ana", null, azar)?.texto);
    for (const d of dichas) expect(SUELTAS).toContain(d);
    for (let i = 0; i < dichas.length; i++) expect(dichas.slice(i + 1, i + 1 + NO_SUELTA)).not.toContain(dichas[i]);
    expect(new Set(dichas).size).toBe(SUELTAS.length);
  });

  it("1 de cada 3 sale de sus temas guardados (sin leer nada): «Después viene esta.» o «Esta ya está. Me gané el café.»", () => {
    const t: Temas = { hecho: "JST-91", tituloHecho: "Re-QA", sigue: { codigo: "JST-98", estado: "todo", titulo: "QA" } };
    let conDato = 0;
    const azar = semilla(13);
    for (let s = 1; s <= 600; s++) {
      const l = new Guionista().suelta("Ana", t, azar);
      if (l?.codigo) {
        conDato += 1;
        expect(["Después viene esta.", "Esta ya está. Me gané el café."]).toContain(l.texto);
        expect(l.titulo).toBe(l.codigo === "JST-91" ? "Re-QA" : "QA");
      }
    }
    expect(conDato / 600).toBeGreaterThan(0.25);
    expect(conDato / 600).toBeLessThan(0.42);
    // «Después viene esta» solo si lo primero de su cola es `todo`.
    const g = new Guionista();
    const bloqueada: Temas = { hecho: null, sigue: { codigo: "JST-5", estado: "blocked" } };
    for (let i = 0; i < 50; i++) expect(g.suelta("Ana", bloqueada, () => 0)?.codigo).toBeNull();
  });
});

describe("las mascotas responden (JST-162 §3)", () => {
  it("cada una dice lo suyo en su orden, rotando, y nunca lo mismo 2 veces seguidas", () => {
    const g = new Guionista();
    expect(Array.from({ length: 4 }, () => g.mascota("gato"))).toEqual(["¡Miau!", "Mrrr…", "¡Miau! ♥", "¡Miau!"]);
    expect(Array.from({ length: 3 }, () => g.mascota("perro"))).toEqual(["¡Guau!", "¡Guau, guau!", "♥"]);
    expect(g.mascota("conejo")).toBe("♥");
    expect(g.mascota("robot")).toBe("Bip bup");
    for (const id of ["gato", "perro", "conejo", "robot"] as const) {
      const l = DICEN[id];
      for (let i = 0; i < l.length; i++) expect(l[(i + 1) % l.length]).not.toBe(l[i]);
    }
  });
});
