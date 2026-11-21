import { describe, expect, it } from "vitest";
import {
  BROMAS,
  BUSCA_MS,
  DICEN,
  ENTREGA_RECIENTE_MS,
  MASCOTA_DE_REACCION,
  MIN_RACHA_TERMINADAS,
  REACCIONES,
  SUELTAS_CON_DATO_COLA,
  SUELTAS_CON_DATO_RECIEN,
  SUELTAS_GENERALES,
  SUELTAS_POR_ESTADO,
  FRASES_FIJAS,
  fraseDeCharla,
  fraseDeMascota,
  type EstadoSuelta,
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

/** Un jueves a las 18:00 hora local (ahí sale «ya se va la tarde»; las pruebas del reloj fijan su propia hora). */
const RELOJ = new Date(2026, 9, 22, 18, 0).getTime();
/** Un lunes a las 05:30: ninguna conversación del reloj corresponde. */
const SIN_RELOJ = new Date(2026, 9, 26, 5, 30).getTime();
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
  /** El reloj de verdad (ms); por defecto un jueves a mediodía, hora local. */
  reloj?: number;
  entregas?: ContextoCharla["entregas"];
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
    reloj: o.reloj ?? RELOJ,
    entregas: o.entregas,
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
    // Sin motivo conocido no se inventa uno (JST-415): las variantes que lo piden no salen.
    expect(motivoError(null)).toBeNull();
    expect(motivoError("generate failed")).toBeNull();
    expect(motivoPausa("budget_exceeded")).toBe("Por presupuesto.");
    expect(motivoPausa("awaiting approval")).toBe("Espera una aprobación.");
    expect(motivoPausa("manual")).toBe("Alguien le puso pausa.");
    expect(motivoPausa(null)).toBeNull();
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

describe("qué dicen (JST-162 §1.3, JST-415)", () => {
  const hecho: Temas = { hecho: "JST-91", tituloHecho: "Re-QA de «Oficina global» 0.1.5 en la copia", sigue: { codigo: "JST-98", estado: "todo", titulo: "QA de la 0.2.0" }, enCola: 3 };
  const ids = (m: Map<string, Guion>) => [...m.keys()].sort((a, b) => Number(a.split("-").at(-1)) - Number(b.split("-").at(-1)));

  it("«Terminó algo»: empieza quien terminó; la frase no repite el código, la tarea va abajo con su nombre", () => {
    const vs = variantesDe("termino", { temas: { Ana: hecho } });
    // La 3 pide que lo siguiente de su cola NO sea `todo`; la 5, que los dos hayan terminado algo.
    expect(ids(vs)).toEqual(["termino-1", "termino-2", "termino-4", "termino-6", "termino-7", "termino-8"]);
    const g1 = vs.get("termino-1")!;
    expect(textos(g1)).toEqual(["Terminé esta.", "Bien. ¿Fue complicado?", "Tuvo lo suyo, pero salió.", "Una menos en el tablero."]);
    expect(g1.lineas.map((l) => l.quien)).toEqual(["Ana", "Beto", "Ana", "Beto"]);
    expect(g1.lineas[0]).toMatchObject({ codigo: "JST-91", titulo: "Re-QA de «Oficina global» 0.1.5 en la copia" });
    // «¿Y qué viene ahora?» → lo primero de su cola, si es `todo`.
    expect(textos(vs.get("termino-2")!)).toEqual(["Por fin cerré esta.", "Buena. ¿Y qué viene ahora?", "Después viene esta."]);
    expect(vs.get("termino-2")!.lineas[2]).toMatchObject({ codigo: "JST-98", titulo: "QA de la 0.2.0" });
    // La 4: pregunta el otro.
    expect(vs.get("termino-4")!.lineas.map((l) => l.quien)).toEqual(["Beto", "Ana", "Beto"]);
    // Los dos terminaron algo: la 5.
    const dos = variantesDe("termino", { temas: { Ana: hecho, Beto: { hecho: "JST-77", sigue: null } } });
    expect(textos(dos.get("termino-5")!)).toEqual(["Cerré esta hace un rato.", "Yo también cerré esta.", "Buena racha, entonces."]);
    expect(dos.get("termino-5")!.lineas.map((l) => l.codigo)).toEqual(["JST-91", "JST-77", null]);
    // Ninguna frase dice un código: siempre va en la línea de abajo.
    for (const g of [...vs.values(), ...dos.values()]) for (const l of g.lineas) expect(l.texto).not.toMatch(/[A-Z]+-\d+/);
  });

  it("«Terminó algo» sin nada en la cola: la 3 («Nada en cola por ahora») y no la 2; con algo en cola que no es `todo`, ninguna de las dos", () => {
    const vs = variantesDe("termino", { temas: { Beto: { hecho: "JST-91", sigue: null } } });
    expect(vs.has("termino-2")).toBe(false);
    expect(textos(vs.get("termino-3")!)).toEqual(["Por fin cerré esta.", "¿Y ahora qué?", "Nada en cola por ahora. Un cafecito.", "Te lo ganaste."]);
    expect(vs.get("termino-3")!.lineas[0]!.quien).toBe("Beto");
    // Con algo bloqueado o en revisión en la cola, «nada en cola» sería falso.
    const conCola = variantesDe("termino", { temas: { Beto: { hecho: "JST-91", sigue: { codigo: "JST-5", estado: "blocked" } } } });
    expect(conCola.has("termino-2")).toBe(false);
    expect(conCola.has("termino-3")).toBe(false);
  });

  it("«Su cola», «En revisión» y «Espera otra»; las de «tres en cola», «un par» y «una sola» solo con esa cantidad", () => {
    const cola = variantesDe("cola", { temas: { Ana: hecho } });
    expect(ids(cola)).toEqual(["cola-1", "cola-2", "cola-3", "cola-4", "cola-5", "cola-6", "cola-7"]);
    expect(textos(cola.get("cola-3")!)).toEqual(["¿Tienes mucho en cola?", "Tres, por lo menos.", "Uf. ¿Por cuál partes?", "Por esta."]);
    expect(ids(variantesDe("cola", { temas: { Ana: { ...hecho, enCola: 2 } } }))).toEqual(["cola-1", "cola-2", "cola-4", "cola-5", "cola-6", "cola-7", "cola-8"]);
    expect(ids(variantesDe("cola", { temas: { Ana: { ...hecho, enCola: 1 } } }))).toContain("cola-9");
    const rev = variantesDe("revision", { temas: { Ana: { hecho: null, sigue: { codigo: "JST-98", estado: "in_review" } } } });
    expect(ids(rev)).toHaveLength(6);
    expect(textos(rev.get("revision-1")!)).toEqual(["Tengo esta en revisión.", "Ojalá pase a la primera."]);
    expect(textos(rev.get("revision-2")!)).toEqual(["¿En qué estás?", "Esperando que revisen esta.", "Paciencia, ya llegará su turno."]);
    const otra = variantesDe("espera-otra", { temas: { Ana: { hecho: null, sigue: { codigo: "JST-90", estado: "blocked" } } } });
    expect(ids(otra)).toHaveLength(6);
    expect(textos(otra.get("espera-otra-1")!)).toEqual(["Esta quedó en espera.", "Entonces toca esperar."]);
  });

  it("«Una tarea bloqueada» (JST-415): la dice quien la tiene, con su código y nombre; sin bloqueada, no sale", () => {
    const temas: Temas = { hecho: null, sigue: { codigo: "JST-98", estado: "todo" }, bloqueada: { codigo: "JST-64", titulo: "Migrar la base" } };
    const vs = variantesDe("bloqueada", { temas: { Beto: temas } });
    expect(ids(vs)).toHaveLength(7);
    expect(textos(vs.get("bloqueada-1")!)).toEqual(["Estoy trabado con esta.", "¿Qué te falta?", "Que se destrabe."]);
    expect(vs.get("bloqueada-1")!.lineas[0]).toMatchObject({ quien: "Beto", codigo: "JST-64", titulo: "Migrar la base" });
    expect(variantesDe("bloqueada", { temas: { Ana: { hecho: null, sigue: null } } }).size).toBe(0);
  });

  it("«Quién te espera»: qué espera, una hora o más, y 3 o más esperando; de otra empresa, con su empresa", () => {
    const lider = ag("lider", { prefijo: "BET", empresa: "Betalandia", nombre: "Líder Técnico (Betalandia)", st: "toca", need: true, espera: { tipo: "aprobacion", codigo: "BET-268", desde: haceMin(150) } });
    const vs = variantesDe("te-espera", { otros: [lider] });
    expect(textos(vs.get("te-espera-1")!)).toEqual(["Líder Técnico de Betalandia está esperando una aprobación.", "¿Por esta?", "Eso. Ojalá le contesten luego."]);
    expect(vs.get("te-espera-1")!.lineas[1]!.codigo).toBe("BET-268");
    expect(textos(vs.get("te-espera-2")!)).toEqual(["Líder Técnico de Betalandia lleva 2 horas y media esperando.", "¿Por cuál?", "Por esta.", "Se le está haciendo largo."]);
    expect(textos(vs.get("te-espera-5")!)[2]).toBe("Espera una aprobación, por esta.");
    expect(textos(vs.get("te-espera-6")!)[1]).toBe("2 horas y media, ni más ni menos.");
    const reciente = { ...lider, prefijo: "JST", empresa: "JSTM", espera: { tipo: "tarjeta" as const, codigo: "JST-63", desde: haceMin(70) } };
    expect(textos(variantesDe("te-espera", { otros: [reciente] }).get("te-espera-2")!)[0]).toBe("Líder Técnico lleva una hora esperando.");
    const tres = [lider, { ...lider, id: "x" }, { ...lider, id: "y" }];
    expect(textos(variantesDe("te-espera", { otros: tres }).get("te-espera-3")!)).toEqual(["Hay 3 esperando respuesta.", "Uf, harta cola."]);
    expect(textos(variantesDe("te-espera", { otros: tres }).get("te-espera-7")!)[1]).toBe("3, por lo que veo.");
    // Menos de una hora: no hay «lleva … esperando».
    const poco = variantesDe("te-espera", { otros: [{ ...reciente, espera: { tipo: "tarjeta", codigo: "JST-63", desde: haceMin(20) } }] });
    expect(poco.has("te-espera-2")).toBe(false);
    expect(poco.has("te-espera-6")).toBe(false);
  });

  it("«A quién le falló algo»: con motivo cuando se conoce, sin inventar uno cuando no", () => {
    const ing = ag("ing", { prefijo: "BET", empresa: "Betalandia", nombre: "Ingeniero", st: "error", motivo: "usage limit", run: { codigo: "BET-12", desde: null, enCola: false } });
    const vs = variantesDe("error", { otros: [ing] });
    expect(textos(vs.get("error-1")!)).toEqual(["A Ingeniero de Betalandia le falló el run.", "¿Qué le pasó?", "Se quedó sin cupo, parece.", "Uf. Ojalá lo vean luego."]);
    // Su run actual puede estar en cola y no ser el que falló: ninguna frase del error nombra una tarea.
    expect(textos(vs.get("error-2")!)).toEqual(["¿Viste que Ingeniero de Betalandia tiene un error?", "Sí, algo le falló.", "Ojalá se arregle luego."]);
    for (const g of vs.values()) for (const l of g.lineas) expect(l.codigo, g.variante).toBeNull();
    const qa = ag("qa", { nombre: "QA", st: "error" });
    expect(textos(variantesDe("error", { otros: [ing, qa] }).get("error-3")!)).toEqual(["Hay 2 con error.", "Mal día para los runs.", "Habrá que mirar qué pasó."]);
    // Sin motivo: solo las que no lo necesitan; y primero los de su sala.
    const sinDato = variantesDe("error", { otros: [qa] });
    expect(ids(sinDato).sort()).toEqual(["error-2", "error-4", "error-5", "error-6"]);
    expect(textos(sinDato.get("error-4")!)[0]).toBe("QA tiene un run con error.");
    for (const g of sinDato.values()) expect(g.lineas.map((l) => l.texto).join(" ")).not.toMatch(/No sé|no dice/i);
  });

  it("«En pausa», «Cuántos trabajan» (según cuántos) y «Cómo están en otra empresa»", () => {
    const p = ag("p", { nombre: "Docs", st: "pausa", motivo: "budget" });
    expect(textos(variantesDe("pausa", { otros: [p] }).get("pausa-1")!)).toEqual(["Docs sigue en pausa.", "¿Y eso?", "Por presupuesto.", "Ya volverá."]);
    // Sin motivo conocido, la de «¿Y eso?» no sale.
    expect(variantesDe("pausa", { otros: [ag("q", { nombre: "Docs", st: "pausa" })] }).has("pausa-1")).toBe(false);
    const trabajando = (n: number) => Array.from({ length: n }, (_, i) => ag(`t${i}`, { st: "trabaja" }));
    expect(ids(variantesDe("trabajan", { otros: trabajando(9) }))).toEqual(["trabajan-1", "trabajan-2", "trabajan-3"]);
    expect(textos(variantesDe("trabajan", { otros: trabajando(9) }).get("trabajan-1")!)).toEqual(["Hay 9 trabajando ahora.", "Harta actividad."]);
    expect(ids(variantesDe("trabajan", { otros: trabajando(5) }))).toEqual(["trabajan-4", "trabajan-5", "trabajan-6"]);
    expect(textos(variantesDe("trabajan", { otros: trabajando(5) }).get("trabajan-4")!)).toEqual(["¿Cuántos están trabajando?", "5. Un día normal."]);
    expect(textos(variantesDe("trabajan", { otros: trabajando(1) }).get("trabajan-7")!)).toEqual(["Uno solo trabajando.", "Día tranquilo, entonces."]);
    expect(textos(variantesDe("trabajan", { otros: trabajando(2) }).get("trabajan-7")!)[0]).toBe("Solo dos trabajando.");
    expect(ids(variantesDe("trabajan", {}))).toEqual(["trabajan-10", "trabajan-11", "trabajan-12"]);
    expect(textos(variantesDe("trabajan", {}).get("trabajan-10")!)).toEqual(["Nadie está trabajando.", "Silencio total. Se escucha el refri."]);
    const mig = (n: number, k: number) => [...Array.from({ length: n }, (_, i) => ag(`m${i}`, { prefijo: "MIG", empresa: "Migo", st: "trabaja" })), ...Array.from({ length: k }, (_, i) => ag(`k${i}`, { prefijo: "MIG", empresa: "Migo", st: "toca", need: true }))];
    expect(textos(variantesDe("empresa", { otros: mig(3, 1) }).get("empresa-2")!)).toEqual(["¿Cómo están en Migo?", "3 trabajando y 1 esperando respuesta.", "Harta pega por allá."]);
    expect(textos(variantesDe("empresa", { otros: mig(1, 0) }).get("empresa-5")!)).toEqual(["¿Cómo están en Migo?", "1 trabajando.", "Mejor para ellos."]);
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
    expect(textos(elMirador("trabajan").get("trabajan-7")!)).toEqual(["Solo dos trabajando.", "Día tranquilo, entonces."]);
    expect(elMirador("trabajan").has("trabajan-4")).toBe(false);
    expect(textos(elMirador("te-espera").get("te-espera-3")!)[0]).toBe("Hay 3 esperando respuesta.");
    expect(textos(elMirador("error").get("error-3")!)[0]).toBe("Hay 2 con error.");
    // Sin filtro (o con todas): todo el piso.
    for (const todas of [conFiltro([]), conFiltro(["ELM", "JST"])]) {
      expect(textos(todas("trabajan").get("trabajan-4")!)).toEqual(["¿Cuántos están trabajando?", "6. Un día normal."]);
      expect(textos(todas("te-espera").get("te-espera-3")!)[0]).toBe("Hay 5 esperando respuesta.");
      expect(textos(todas("error").get("error-3")!)[0]).toBe("Hay 3 con error.");
    }
    // Con el filtro de una sala con menos de 3 esperando, no hay «Hay {n} esperando respuesta».
    expect(conFiltro(["JST"])("te-espera").has("te-espera-3")).toBe(false);
  });

  it("«Cómo le va en su rol»: pregunta por lo suyo y responde con sus temas guardados (o «Ahí vamos» sin ellos)", () => {
    const b = ag("Beto", { rol: "QA Engineer" });
    const r = (id: string, t?: Temas) => textos(variantesDe("rol", { b, temas: t ? { Beto: t } : {} }).get(id)!);
    expect(r("rol-1")).toEqual(["¿Cómo va lo de las pruebas?", "Ahí vamos, de a poco.", "Eso es lo importante."]);
    expect(r("rol-2", { hecho: "JST-1", sigue: null })).toEqual(["¿Cómo va lo de las pruebas?", "Bien. Cerré esta.", "Excelente."]);
    expect(r("rol-3", { hecho: null, sigue: { codigo: "JST-2", estado: "todo" }, enCola: 3 })).toEqual(["¿Y lo de las pruebas, cómo viene?", "Harta pega: varias en cola.", "A ir de a una."]);
    expect(r("rol-4", { hecho: null, sigue: { codigo: "JST-2", estado: "todo" }, enCola: 1 })).toEqual(["¿Cómo va lo de las pruebas?", "Bien, con esta por delante.", "Me alegro."]);
    expect(r("rol-5", { hecho: null, sigue: null, enCola: 0 })).toEqual(["¿Cómo anda lo de las pruebas?", "Tranqui. Sin nada en cola.", "Qué envidia."]);
  });

  it("«Qué hace alguien de su sala»: cuánto lleva (de a 5 min o en horas), recién empezó, en cola o en qué anda", () => {
    const y = (min: number | null, enCola = false) => ag("y", { nombre: "Ingeniero/a Full-stack de Plugins", st: "trabaja", run: { codigo: "JST-164", desde: min === null ? null : haceMin(min), enCola } });
    expect(textos(variantesDe("sala", { otros: [y(37)] }).get("sala-1")!)).toEqual(["Ingeniero/a lleva 35 minutos con esta.", "Mejor no interrumpir."]);
    expect(textos(variantesDe("sala", { otros: [y(150)] }).get("sala-1")!)[0]).toBe("Ingeniero/a lleva 2 horas y media con esta.");
    expect(textos(variantesDe("sala", { otros: [y(2)] }).get("sala-2")!)).toEqual(["Ingeniero/a recién empezó esta.", "Que le vaya bien."]);
    expect(textos(variantesDe("sala", { otros: [y(2, true)] }).get("sala-3")!)).toEqual(["Ingeniero/a está en cola con esta.", "Le toca esperar su turno."]);
    expect(textos(variantesDe("sala", { otros: [y(12)] }).get("sala-4")!)).toEqual(["¿En qué anda Ingeniero/a?", "En esta.", "Ah, buena."]);
    // Sin saber desde cuándo, no dice que recién empezó.
    expect(variantesDe("sala", { otros: [y(null)] }).has("sala-2")).toBe(false);
    // Los de otra sala no cuentan.
    expect(variantesDe("sala", { otros: [{ ...y(40), prefijo: "BET" }] }).size).toBe(0);
  });

  it("«La hora y el día» (JST-415): según el reloj local, sin decir ninguna hora con números", () => {
    const en = (anio: number, mes: number, dia: number, h: number) => new Date(anio, mes, dia, h, 0).getTime();
    // «Ya hay movimiento» solo si alguien trabaja.
    expect(variantesDe("reloj", { reloj: en(2026, 9, 26, 9) }).has("reloj-1")).toBe(false);
    const lunes = variantesDe("reloj", { reloj: en(2026, 9, 26, 9), otros: [ag("obrero", { st: "trabaja" })] });
    expect(textos(lunes.get("reloj-1")!)).toEqual(["Lunes temprano y ya hay movimiento.", "Los lunes arrancan con todo."]);
    const viernes = variantesDe("reloj", { reloj: en(2026, 9, 23, 17) });
    expect(ids(viernes)).toEqual(["reloj-3", "reloj-4"]);
    expect(ids(variantesDe("reloj", { reloj: en(2026, 9, 26, 13) }))).toEqual(["reloj-5", "reloj-6"]);
    expect(ids(variantesDe("reloj", { reloj: en(2026, 9, 27, 23) }))).toEqual(["reloj-7", "reloj-8"]);
    expect(textos(variantesDe("reloj", { reloj: en(2026, 9, 24, 12) }).get("reloj-9")!)[0]).toBe("Sábado y la oficina sigue abierta.");
    expect(variantesDe("reloj", { reloj: SIN_RELOJ }).size).toBe(0);
    for (const g of [...lunes.values(), ...viernes.values()]) for (const l of g.lineas) expect(l.texto).not.toMatch(/\d/);
  });

  it("«Cuánto tardó» (JST-415): solo con inicio y fin conocidos, y la duración sale de ahí", () => {
    const fin = RELOJ - 10 * 60_000;
    const con: Temas = { hecho: "JST-91", sigue: null, hechoEn: fin, hechoInicio: fin - 3 * 3_600_000 };
    const vs = variantesDe("tardo", { temas: { Ana: con } });
    expect(ids(vs)).toHaveLength(7);
    expect(textos(vs.get("tardo-1")!)).toEqual(["Esa me tomó 3 horas.", "Es bueno saberlo."]);
    expect(vs.get("tardo-1")!.lineas[0]).toMatchObject({ quien: "Ana", codigo: "JST-91" });
    // Sin cuándo empezó (la API no lo trae), no se inventa.
    expect(variantesDe("tardo", { temas: { Ana: { ...con, hechoInicio: null } } }).size).toBe(0);
    expect(variantesDe("tardo", { temas: { Ana: { hecho: "JST-91", sigue: null } } }).size).toBe(0);
  });

  it("«Una racha» (JST-415): desde 3 terminadas hoy, con el número real", () => {
    expect(MIN_RACHA_TERMINADAS).toBe(3);
    const vs = variantesDe("racha", { temas: { Ana: { hecho: "JST-1", sigue: null, racha: 4 } } });
    expect(ids(vs)).toHaveLength(6);
    expect(textos(vs.get("racha-1")!)).toEqual(["Ya van 4 que cierro hoy.", "Estás en racha."]);
    expect(variantesDe("racha", { temas: { Ana: { hecho: "JST-1", sigue: null, racha: 2 } } }).size).toBe(0);
    expect(variantesDe("racha", { temas: { Ana: { hecho: "JST-1", sigue: null } } }).size).toBe(0);
  });

  it("«Una entrega» (JST-415): quien recibió o pasó una tarea hace poco; con el nombre del otro", () => {
    const ana = ag("Ana");
    const beto = ag("Beto");
    const entregas = [{ de: "Beto", a: "Ana", codigo: "JST-55", en: RELOJ - 5 * 60_000 }];
    const vs = variantesDe("entrega", { a: ana, b: beto, entregas });
    expect(textos(vs.get("entrega-1")!)).toEqual(["Beto me pasó esta.", "¿Ya sabes por dónde empezar?", "Primero me ubico."]);
    expect(vs.get("entrega-1")!.lineas[0]).toMatchObject({ quien: "Ana", codigo: "JST-55" });
    // Beto es quien la pasó: lo cuenta él.
    expect(textos(vs.get("entrega-4")!)[0]).toBe("Le pasé esta a Ana.");
    expect(vs.get("entrega-4")!.lineas[0]!.quien).toBe("Beto");
    // Una entrega vieja ya no es noticia.
    expect(variantesDe("entrega", { a: ana, b: beto, entregas: [{ ...entregas[0]!, en: RELOJ - ENTREGA_RECIENTE_MS - 1 }] }).size).toBe(0);
    expect(variantesDe("entrega", { a: ana, b: beto }).size).toBe(0);
  });
});

describe("las variantes: cuántas hay y cómo suenan (JST-415)", () => {
  const por = new Map<Tema, string[]>();
  for (const v of VARIANTES) por.set(v.tema, [...(por.get(v.tema) ?? []), v.id]);

  /** Pisos que dejan salir cada variante: mucha gente, 5, 2, 1 o ninguna trabajando; con y sin esperas, errores y pausas. */
  function pisos(): AgenteCharla[][] {
    const trab = (n: number, k = "t") => Array.from({ length: n }, (_, i) => ag(`${k}${i}`, { nombre: `${k}${i}`, st: "trabaja", run: { codigo: `JST-${100 + i}`, desde: haceMin(i === 0 ? 40 : i === 1 ? 2 : 12), enCola: i === 2 } }));
    const esp = (id: string, min: number, tipo: "aprobacion" | "tarjeta") => ag(id, { prefijo: "BET", empresa: "Betalandia", nombre: id, st: "toca", need: true, espera: { tipo, codigo: "BET-1", desde: haceMin(min) } });
    const fuera = (p: string, t: number, e: number) => [...Array.from({ length: t }, (_, i) => ag(`${p}t${i}`, { prefijo: p, empresa: `Emp${p}`, st: "trabaja" })), ...Array.from({ length: e }, (_, i) => ag(`${p}e${i}`, { prefijo: p, empresa: `Emp${p}`, st: "toca", need: true }))];
    const errores = [ag("ing", { prefijo: "BET", empresa: "Betalandia", nombre: "Ingeniero", st: "error", motivo: "usage limit", run: { codigo: "BET-2", desde: null, enCola: false } }), ag("qa", { nombre: "QA", st: "error" })];
    const pausas = [ag("p1", { nombre: "P1", st: "pausa", motivo: "budget" }), ag("p2", { nombre: "P2", st: "pausa", motivo: "manual" }), ag("p3", { nombre: "P3", st: "pausa", motivo: "approval" })];
    const empresas = [...fuera("AAA", 3, 1), ...fuera("BBB", 3, 0), ...fuera("CCC", 1, 1), ...fuera("DDD", 2, 0), ...fuera("EEE", 0, 0).concat(ag("eee", { prefijo: "EEE", empresa: "EmpEEE", st: "libre" }))];
    const esperas = [esp("e1", 150, "aprobacion"), esp("e2", 90, "tarjeta"), esp("e3", 10, "tarjeta")];
    return [[...trab(9), ...esperas, ...errores, ...pausas, ...empresas], [...trab(5), ...esperas.slice(0, 1), ...errores.slice(0, 1)], trab(2), trab(1), []];
  }

  function todas(): Map<string, Guion> {
    const fin = (r: number) => r - 5 * 60_000;
    const temasDe = (r: number): Array<Record<string, Temas>> => [
      { Ana: { hecho: "JST-91", sigue: { codigo: "JST-98", estado: "todo" }, enCola: 3, hechoEn: fin(r), hechoInicio: fin(r) - 3_600_000, racha: 4, bloqueada: { codigo: "JST-9" } }, Beto: { hecho: "JST-77", sigue: { codigo: "JST-7", estado: "in_review" }, enCola: 2, hechoEn: fin(r), hechoInicio: fin(r) - 1_800_000 } },
      { Ana: { hecho: "JST-91", sigue: { codigo: "JST-98", estado: "blocked" }, enCola: 1 }, Beto: { hecho: null, sigue: { codigo: "JST-7", estado: "todo" }, enCola: 2 } },
      { Ana: { hecho: null, sigue: { codigo: "JST-98", estado: "todo" }, enCola: 1 }, Beto: { hecho: null, sigue: null, enCola: 0 } },
      { Ana: { hecho: "JST-91", sigue: null }, Beto: { hecho: null, sigue: { codigo: "JST-7", estado: "blocked" } } },
      { Ana: { hecho: null, sigue: { codigo: "JST-98", estado: "todo" }, enCola: 3 }, Beto: { hecho: null, sigue: { codigo: "JST-7", estado: "todo" }, enCola: 3 } },
      {},
    ];
    const horas = [new Date(2026, 9, 26, 9), new Date(2026, 9, 23, 17), new Date(2026, 9, 26, 13), new Date(2026, 9, 27, 23), new Date(2026, 9, 24, 12), new Date(2026, 9, 25, 12), new Date(2026, 9, 21, 17), new Date(2026, 9, 28, 9)].map((d) => d.getTime());
    const quien = [{ a: ag("Ana"), b: ag("Beto", { rol: "QA Engineer" }) }, { a: ag("Beto", { rol: "QA Engineer" }), b: ag("Ana") }];
    const vistas = new Map<string, Guion>();
    const guardar = (g: Guion | null) => g && vistas.set(g.variante, g);
    for (const reloj of horas) {
      const entregas = [{ de: "Beto", a: "Ana", codigo: "JST-55", en: reloj - 60_000 }];
      for (const temas of temasDe(reloj)) {
        for (const o of quien) {
          for (const otros of pisos()) {
            for (let s = 1; s < 80; s++) {
              // «Otra empresa» elige la empresa al azar: necesita más intentos que los demás temas.
              for (const tema of por.keys()) if (tema !== "broma" && (s < 12 || tema === "empresa")) guardar(new Guionista().armar(ctx({ ...o, otros, temas, entregas, reloj, azar: semilla(s * 7919 + 13) }), tema));
            }
          }
        }
      }
    }
    // Las bromas salen de un mazo: un solo guionista las va sacando todas.
    const g = new Guionista();
    for (let i = 0; i < 90; i++) guardar(g.armar(ctx({ ahora: i * 30_000, azar: semilla(i + 1) }), "broma"));
    return vistas;
  }
  const vistas = todas();

  it("ninguna respuesta nombra la tarea con «Esa.» o «Esta.» sin llevarla: no concordaría con su género (JST-415)", () => {
    for (const g of vistas.values()) {
      g.lineas.forEach((l, i) => {
        if (l.codigo || i === 0) return;
        expect(l.texto, g.variante).not.toMatch(/^(Esa|Esta)( misma)?[.,]/);
      });
    }
  });

  it("los textos fijos no predicen ni asumen lo que no se sabe", () => {
    const todo = [...SUELTAS, ...Object.values(REACCIONES).flat(), ...[...vistas.values()].flatMap((g) => g.lineas.map((l) => l.texto))];
    for (const t of todo) {
      expect(t, t).not.toMatch(/campanita|pregunta pendiente|Esa misma|Eso es todo/i);
    }
  });

  it("cada tema con datos tiene 6 variantes o más; hay 16 temas, 24 bromas y 26 frases sueltas sin tarea", () => {
    const conDatos = [...por.entries()].filter(([t]) => t !== "broma");
    expect(conDatos).toHaveLength(16);
    for (const [tema, v] of conDatos) expect(v.length, tema).toBeGreaterThanOrEqual(6);
    expect(BROMAS).toHaveLength(24);
    expect(por.get("broma")).toHaveLength(24);
    expect(SUELTAS).toHaveLength(26);
    expect(SUELTAS.length).toBeGreaterThanOrEqual(20);
    for (const e of Object.keys(SUELTAS_POR_ESTADO) as EstadoSuelta[]) expect(SUELTAS_POR_ESTADO[e].length).toBeGreaterThanOrEqual(4);
    expect(new Set(SUELTAS).size).toBe(SUELTAS.length);
  });

  it("todas las variantes se pueden armar con un piso completo (la prueba de abajo mira todas)", () => {
    const faltan = VARIANTES.filter((v) => !vistas.has(v.id)).map((v) => v.id);
    expect(faltan).toEqual([]);
  });

  it("los cierres no se repiten más de 2 veces por tema, el café sale en 1 de cada 6 como mucho y las aperturas cambian", () => {
    const cafe = (t: string) => /caf[eé]|☕/i.test(t);
    for (const [tema, v] of por) {
      const gs = v.map((id) => vistas.get(id)!);
      const cierres = gs.map((g) => g.lineas.at(-1)!.texto);
      for (const c of new Set(cierres)) expect(cierres.filter((x) => x === c).length, `${tema}: «${c}»`).toBeLessThanOrEqual(2);
      expect(gs.filter((g) => g.lineas.some((l) => cafe(l.texto))).length, `café en ${tema}`).toBeLessThanOrEqual(Math.max(1, Math.floor(v.length / 6)));
      const aperturas = gs.map((g) => g.lineas[0]!.texto.replace(/\d+/g, "N"));
      expect(new Set(aperturas).size, `aperturas de ${tema}`).toBeGreaterThanOrEqual(Math.ceil(v.length * 0.6));
    }
  });

  it("toda frase armada es una que el worker aceptaría y las que llevan tarea dicen «esta» o «esa» (la voz pone el título ahí)", () => {
    for (const [id, g] of vistas) {
      for (const l of g.lineas) {
        expect(fraseDeCharla(l.texto), `${id}: ${l.texto}`).toBe(true);
        if (l.codigo) expect(l.texto, id).toMatch(/(?<![\p{L}])(esta|esa|Esta|Esa)(?![\p{L}])/u);
        // La tarea nunca se pega con «de esta» o «a esta» (daría «del» y «al» al nombrarla).
        if (l.codigo) expect(l.texto, id).not.toMatch(/\b(de|a) (esta|esa)\b/i);
      }
    }
    for (const f of FRASES_FIJAS) expect(fraseDeCharla(f), f).toBe(true);
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
    for (let i = 0; i < 480; i++) {
      const t = i * 15_000;
      const x = g.armar(ctx({ ...lleno, ahora: t, azar }));
      if (x?.tema === "error") veces.push(t);
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
    // Con más temas que antes, la respuesta de «rol» de Ana y de Beto casi no sale: su «terminó», su cola y lo demás la frenan.
    expect([...cuando.keys()].filter((k) => !k.startsWith("rol")).sort()).toEqual(["Ana JST-91", "Ana JST-98", "Beto JST-7", "Beto JST-77", "Caro JST-64"]);
    expect(cuando.has("rol Caro")).toBe(true);
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
    // Solo «trabajan» y «rol» (siempre hay; con un reloj que no dice nada): después de esos 2, en la misma sala no queda ningún tema.
    const g = new Guionista();
    const sinBromaAlAzar = () => 0.99;
    const temas = [0, 1, 2].map((i) => g.armar(ctx({ ahora: i * 30_000, azar: sinBromaAlAzar, reloj: SIN_RELOJ }))!.tema);
    expect(new Set(temas.slice(0, 2))).toEqual(new Set(["trabajan", "rol"]));
    expect(temas[2]).toBe("broma");
  });

  it("las bromas salen de un mazo: todas antes de repetir y nunca la misma 2 veces seguidas", () => {
    const g = new Guionista();
    const azar = semilla(11);
    const dichas = Array.from({ length: 80 }, (_, i) => g.armar(ctx({ ahora: i * 30_000, azar }), "broma")!.variante);
    expect(new Set(dichas.slice(0, 24)).size).toBe(24);
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


describe("frases que solo afirman lo que el dato dice (JST-415)", () => {
  it("«bloqueada» y «espera-otra» cuentan lo mismo: una no sale a continuación de la otra sobre la misma persona", () => {
    const temas: Temas = { hecho: null, sigue: { codigo: "JST-90", estado: "blocked" }, bloqueada: { codigo: "JST-90", titulo: "Migrar la base" } };
    const armar = (g: Guionista, ahora: number, s: number) => g.armar(ctx({ temas: { Ana: temas }, ahora, azar: semilla(s) }));
    for (const primero of ["bloqueada", "espera-otra"] as const) {
      const segundo = primero === "bloqueada" ? "espera-otra" : "bloqueada";
      // Sin forzar el tema (forzarlo se salta la memoria): una guionista nueva por intento hasta que sale el primero.
      let g: Guionista | null = null;
      for (let s = 1; s < 200 && !g; s++) {
        const probable = new Guionista();
        if (armar(probable, 1_000, s)?.tema === primero) g = probable;
      }
      expect(g, primero).not.toBeNull();
      // Durante los 10 min, el otro tema sobre la misma persona no sale nunca; pasados, sí.
      const dentro = new Set<string>();
      const despues = new Set<string>();
      for (let s = 1; s < 120; s++) {
        const copia = g!.recuerdo();
        dentro.add(armar(g!, 1_000 + 9 * 60_000, s)?.tema ?? "nada");
        copia();
        despues.add(armar(g!, 1_000 + 11 * 60_000, s)?.tema ?? "nada");
        copia();
      }
      expect(dentro.has(segundo), `${primero} → ${segundo} a los 9 min`).toBe(false);
      expect(dentro.has(primero), `${primero} a los 9 min`).toBe(false);
      expect(despues.has(segundo), `${primero} → ${segundo} a los 11 min`).toBe(true);
    }
  });

  it("«te espera»: las respuestas no adivinan el género de la tarea ni dicen «pregunta» sin saber que lo es", () => {
    const lider = ag("lider", { prefijo: "BET", empresa: "Betalandia", nombre: "Líder", st: "toca", need: true, espera: { tipo: "aprobacion", codigo: "BET-268", desde: haceMin(150) } });
    const vs = variantesDe("te-espera", { otros: [lider] });
    expect(textos(vs.get("te-espera-4")!)[1]).toBe("Sí, es por esta.");
    for (const g of vs.values()) for (const l of g.lineas) expect(l.texto).not.toMatch(/pregunta/i);
  });
});

describe("frases sueltas (JST-162 §1.6, JST-415)", () => {
  it("las generales salen de un mazo y ninguna vuelve en las 5 siguientes", () => {
    const g = new Guionista();
    const azar = semilla(9);
    const dichas = Array.from({ length: 80 }, () => g.suelta("Ana", null, azar)?.texto);
    for (const d of dichas) expect(SUELTAS_GENERALES).toContain(d);
    for (let i = 0; i < dichas.length; i++) expect(dichas.slice(i + 1, i + 1 + NO_SUELTA)).not.toContain(dichas[i]);
    expect(new Set(dichas).size).toBe(SUELTAS_GENERALES.length);
  });

  it("según su estado (libre hace mucho, recién terminó, espera a la persona, tiene cola) más de la mitad son de ese estado", () => {
    for (const estado of ["libre", "recien", "espera", "cola"] as const) {
      const propias = new Set(SUELTAS_POR_ESTADO[estado]);
      let delEstado = 0;
      const azar = semilla(21);
      for (let s = 0; s < 300; s++) {
        const l = new Guionista().suelta("Ana", null, azar, undefined, new Set([estado]));
        if (l && propias.has(l.texto)) delEstado += 1;
      }
      expect(delEstado / 300, estado).toBeGreaterThan(0.45);
      expect(delEstado / 300, estado).toBeLessThan(0.75);
    }
    // Sin estado conocido, solo las generales.
    const g = new Guionista();
    const azar = semilla(4);
    for (let i = 0; i < 60; i++) expect(SUELTAS_GENERALES).toContain(g.suelta("Ana", null, azar)!.texto);
  });

  it("1 de cada 3 sale de sus temas guardados (sin leer nada): terminó o cola; con estados, solo si el estado coincide", () => {
    const t: Temas = { hecho: "JST-91", tituloHecho: "Re-QA", sigue: { codigo: "JST-98", estado: "todo", titulo: "QA" } };
    let conDato = 0;
    const azar = semilla(13);
    for (let s = 1; s <= 600; s++) {
      const l = new Guionista().suelta("Ana", t, azar);
      if (l?.codigo) {
        conDato += 1;
        expect([...SUELTAS_CON_DATO_RECIEN, ...SUELTAS_CON_DATO_COLA]).toContain(l.texto);
        expect(l.texto).toMatch(/(?<![\p{L}])esta(?![\p{L}])/iu);
        expect(l.titulo).toBe(l.codigo === "JST-91" ? "Re-QA" : "QA");
        // Lo de la cola va con el código de la cola y lo de «terminé» con el de lo terminado.
        expect(SUELTAS_CON_DATO_COLA.includes(l.texto)).toBe(l.codigo === "JST-98");
      }
    }
    expect(conDato / 600).toBeGreaterThan(0.25);
    expect(conDato / 600).toBeLessThan(0.42);
    // «Después viene esta» solo si lo primero de su cola es `todo`.
    const g = new Guionista();
    const bloqueada: Temas = { hecho: null, sigue: { codigo: "JST-5", estado: "blocked" } };
    for (let i = 0; i < 50; i++) expect(g.suelta("Ana", bloqueada, () => 0)?.codigo).toBeNull();
    // Con estados que no son «recién» ni «cola», no se habla de tareas.
    for (let i = 0; i < 50; i++) expect(new Guionista().suelta("Ana", t, () => 0, undefined, new Set<EstadoSuelta>(["libre"]))?.codigo).toBeNull();
  });
});

describe("las mascotas responden (JST-162 §3, JST-415)", () => {
  const ids = ["gato", "perro", "conejo", "robot"] as const;

  it("cada una tiene 8 frases, todas distintas, y nunca dice lo mismo 2 veces seguidas", () => {
    for (const id of ids) {
      expect(DICEN[id], id).toHaveLength(8);
      expect(new Set(DICEN[id]).size).toBe(8);
      const g = new Guionista();
      const azar = semilla(3);
      const dichas = Array.from({ length: 200 }, () => g.mascota(id, azar));
      for (let i = 1; i < dichas.length; i++) expect(dichas[i]).not.toBe(dichas[i - 1]);
      for (const d of dichas) expect(DICEN[id]).toContain(d);
      expect(new Set(dichas).size).toBe(8);
    }
  });

  it("reaccionan a lo que pasa cerca: el perro celebra, el robot avisa del error, el gato nota a quien espera y el conejo ve la entrega", () => {
    expect(MASCOTA_DE_REACCION).toEqual({ termina: "perro", error: "robot", espera: "gato", entrega: "conejo" });
    const g = new Guionista();
    const azar = semilla(8);
    for (const tipo of ["termina", "error", "espera", "entrega"] as const) {
      let ultima: string | null = null;
      for (let i = 0; i < 40; i++) {
        const r = g.reaccion(tipo, azar)!;
        expect(r.id).toBe(MASCOTA_DE_REACCION[tipo]);
        expect(REACCIONES[r.id]).toContain(r.texto);
        expect(r.texto).not.toBe(ultima);
        ultima = r.texto;
      }
      // Sus frases sirven para la voz de esa mascota y de ninguna otra.
      for (const texto of REACCIONES[MASCOTA_DE_REACCION[tipo]]) {
        expect(fraseDeMascota(MASCOTA_DE_REACCION[tipo], texto)).toBe("propia");
        expect(fraseDeMascota(ids.find((x) => x !== MASCOTA_DE_REACCION[tipo])!, texto)).toBe("de otra");
      }
    }
    expect(fraseDeMascota("gato", "algo que no es de ninguna")).toBe("ninguna");
    for (const id of ids) for (const t of DICEN[id]) expect(fraseDeMascota(id, t)).toBe("propia");
  });
});
