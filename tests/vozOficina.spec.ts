// 0.6.0 (JST-226): lo que la voz lee de la oficina. Qué textos acepta el worker
// (solo los que pudo armar el plugin), cómo se dice cada uno, cuánto dura un MP3
// y quién habla cuando (una voz a la vez, lo que se bota).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DICEN, fraseDeCharla, Guionista, nombreDeCharla, SUELTAS, type AgenteCharla, type Tema } from "../src/charlas.js";
import type { Temas } from "../src/temas.js";
import { ESPERA_HORA_MS, TOPE_CHARLA_MS, TOPE_MASCOTA_SOLA_MS, TOPE_SUELTA_MS, TRAS_AVISO_MS, TurnoVoz } from "../src/turnoVoz.js";
import { duracionMp3 } from "../src/voces.js";
import { conTarea, horaParaVoz, paraLeer, pedidosDeCharla, sinBarras, textoHora, textoOficina, validarPedidoOficina, type PedidoOficina } from "../src/vozOficina.js";

// ---------------------------------------------------------------------------
// Las frases del plugin (punto 8 del spike de JST-224)
// ---------------------------------------------------------------------------

/** Nombres como los de la real (con «/», paréntesis, siglas y tildes) en las 4 empresas. */
const NOMBRES: Record<string, { empresa: string; nombres: string[] }> = {
  BET: { empresa: "Betalandia", nombres: ["Ingeniero Backend", "Ingeniero de Integracion y CI", "QA Engineer", "Revisor de Codigo", "Diseñador/a de Producto (UX/UI)", "Hermes", "CEO", "Ingeniero Frontend React + Expo", "Documentador"] },
  ELM: { empresa: "El Mirador", nombres: ["CMO", "Creador de Contenido", "Líder técnico", "Especialista en specs"] },
  JST: { empresa: "JSTM", nombres: ["Chief of staff", "Ingeniero/a Full-stack de Plugins", "QA Engineer", "Diseñador/a de Producto (UX/UI)", "CTO"] },
  MIG: { empresa: "Migo", nombres: ["Speckit", "Ingeniero de software", "Investigador", "Product Manager", "DevOps", "Diseñadora", "Analista de datos", "Tester"] },
};

function semilla(n: number): () => number {
  let s = n;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Los agentes con estados al azar: libres, trabajando (recién o hace horas), con error, en pausa o esperándote. */
function agentesAlAzar(azar: () => number, reloj: number): AgenteCharla[] {
  const uno = <T,>(l: readonly T[]) => l[Math.floor(azar() * l.length)]!;
  return Object.entries(NOMBRES).flatMap(([prefijo, e]) =>
    e.nombres.map((nombre, i): AgenteCharla => {
      const r = azar();
      const st = r < 0.5 ? "libre" : r < 0.8 ? "trabaja" : r < 0.92 ? "error" : "pausa";
      const need = azar() < 0.3;
      const hace = (h: number) => new Date(reloj - azar() * h * 3_600_000).toISOString();
      return {
        id: `${prefijo}-${i}`,
        prefijo,
        nombre,
        empresa: e.empresa,
        st,
        need,
        rol: null,
        rolApi: uno([null, "engineer", "designer", "qa", "ceo", "cto", "cmo", "pm", "devops"]),
        motivo: uno(["usage limit", "timed out", "tests failed", "auth 401", "exit code 1", "otro", "budget", "manual", "approval", null]),
        espera: need ? { tipo: uno(["tarjeta", "decision", "aprobacion", "revision"] as const), codigo: `${prefijo}-${1 + Math.floor(azar() * 900)}`, desde: hace(azar() < 0.5 ? 0.5 : 500) } : null,
        run: st === "trabaja" ? { codigo: `${prefijo}-${1 + Math.floor(azar() * 900)}`, desde: hace(azar() < 0.5 ? 0.05 : 8), enCola: azar() < 0.2 } : null,
      };
    }),
  );
}

function temasAlAzar(azar: () => number): Temas {
  return {
    hecho: azar() < 0.6 ? "XX-1" : null,
    tituloHecho: "Una tarea",
    sigue: azar() < 0.7 ? { codigo: "XX-2", estado: (["todo", "in_review", "blocked"] as const)[Math.floor(azar() * 3)]!, titulo: "Otra tarea" } : null,
    enCola: Math.floor(azar() * 5),
  };
}

const TEMAS: Tema[] = ["termino", "cola", "revision", "espera-otra", "te-espera", "error", "pausa", "trabajan", "rol", "sala", "empresa", "broma"];

describe("el worker solo hace audios de lo que el plugin pudo armar (punto 8 del spike de JST-224)", () => {
  it("toda frase de una conversación (miles al azar, todos los temas) es fija o de una plantilla", () => {
    const azar = semilla(2026);
    const reloj = Date.UTC(2026, 9, 23, 15, 0);
    const vistas = new Set<string>();
    const fuera: string[] = [];
    const conBarra: string[] = [];
    for (let k = 0; k < 4_000; k++) {
      const ags = agentesAlAzar(azar, reloj);
      const prefijo = Object.keys(NOMBRES)[Math.floor(azar() * 4)]!;
      const deSala = ags.filter((x) => x.prefijo === prefijo);
      const a = deSala[Math.floor(azar() * deSala.length)]!;
      const b = deSala.filter((x) => x !== a)[Math.floor(azar() * (deSala.length - 1))]!;
      const tm = new Map(ags.map((x) => [x.id, temasAlAzar(azar)]));
      const g = new Guionista().armar(
        { prefijo, a, b, agentes: ags, temas: (id) => tm.get(id) ?? null, titulo: () => "Una tarea", reloj, ahora: 0, azar, filtro: azar() < 0.2 ? [prefijo] : undefined },
        azar() < 0.8 ? TEMAS[Math.floor(azar() * TEMAS.length)]! : null,
      );
      for (const l of g?.lineas ?? []) {
        vistas.add(l.texto);
        if (!fraseDeCharla(l.texto)) fuera.push(l.texto);
        // JST-239: lo que va al motor no lleva la barra de «Ingeniero/a» ni la de «UX/UI».
        if (/\p{L}\/|\/\p{L}/u.test(textoOficina({ clase: "charla", agenteId: "a", texto: l.texto, tarea: l.titulo }) ?? "")) conBarra.push(l.texto);
      }
    }
    expect([...new Set(fuera)]).toEqual([]);
    expect([...new Set(conBarra)]).toEqual([]);
    expect([...vistas].some((t) => t.includes("Ingeniero/a"))).toBe(true);
    // Que la prueba haya visto harto: las 115 fijas y muchas con nombre o número.
    expect(vistas.size).toBeGreaterThan(250);
  });

  it("rechaza lo que no es del plugin: un texto inventado (con un nombre), un número de 5 cifras, un nombre con símbolos raros o un control", () => {
    for (const t of ["Hola, esto lo escribió Pedro.", "Hay 12345 trabajando ahora.", "<script> está esperando una respuesta.", "Ana\u0007 sigue en pausa.", "Acabo de terminar esta", "Nadie está trabajando. Bueno."]) {
      expect(fraseDeCharla(t)).toBe(false);
      expect(validarPedidoOficina({ clase: "charla", agenteId: "a", texto: t })).toBeNull();
    }
    expect(fraseDeCharla("Ingeniero/a de Betalandia está esperando una decisión.")).toBe(true);
    expect(fraseDeCharla("CMO lleva 453 horas esperando.")).toBe(true);
    expect(fraseDeCharla("¿Cómo están en El Mirador?")).toBe(true);
    // 0.7.0 (JST-232): lo que no es del plugin pero pasa la revisión de la IA de Chrome (sin nombres, números, códigos
    // ni estados) se acepta como de la IA, sin tarea, para que el worker le ponga su tope por minuto.
    expect(validarPedidoOficina({ clase: "charla", agenteId: "a", texto: "Hola, esto lo escribió otro.", tarea: "JST-1: algo" })).toEqual({ clase: "charla", agenteId: "a", texto: "Hola, esto lo escribió otro.", tarea: null, ia: true });
    expect(validarPedidoOficina({ clase: "suelta", agenteId: "a", texto: "Este café me salva." })).toMatchObject({ ia: true, tarea: null });
    expect(validarPedidoOficina({ clase: "charla", agenteId: "a", texto: "Bacán." })).not.toHaveProperty("ia");
  });

  it("una apertura de la IA solo lleva los datos de sus huecos y una mascota generada pasa la misma revisión", () => {
    const apertura = { plantilla: "¡Qué lata por {agente}!", datos: { agente: "CEO" } };
    expect(validarPedidoOficina({ clase: "charla", agenteId: "a", texto: "¡Qué lata por CEO!", apertura })).toEqual({ clase: "charla", agenteId: "a", texto: "¡Qué lata por CEO!", tarea: null, apertura, ia: true });
    expect(validarPedidoOficina({ clase: "charla", agenteId: "a", texto: "¡Qué lata por Ana!", apertura })).toBeNull();
    expect(validarPedidoOficina({ clase: "charla", agenteId: "a", texto: "¡Qué lata por CEO!", apertura: { plantilla: "Son 4 con {agente}.", datos: { agente: "CEO" } } })).toBeNull();
    expect(validarPedidoOficina({ clase: "mascota", agenteId: null, mascota: "gato", texto: "Qué rico el sol." })).toMatchObject({ ia: true, mascota: "gato" });
    expect(validarPedidoOficina({ clase: "mascota", agenteId: null, mascota: "gato", texto: "Somos 4." })).toBeNull();
  });

  it("valida cada clase: la suelta es una de las suyas, la mascota dice lo suyo, la entrega lleva un nombre acotado y la hora números de verdad", () => {
    expect(validarPedidoOficina({ clase: "suelta", agenteId: "a", texto: "Pausa para el café." })).toMatchObject({ clase: "suelta", texto: "Pausa para el café." });
    // Sin letras no hay nada que decir; una suelta sin tarea en la línea de abajo no la lleva.
    expect(validarPedidoOficina({ clase: "suelta", agenteId: "a", texto: "☕" })).toBeNull();
    expect(validarPedidoOficina({ clase: "suelta", agenteId: "a", texto: "Mmm…", tarea: "Otra cosa" })!.tarea).toBeNull();
    expect(validarPedidoOficina({ clase: "suelta", agenteId: "a", texto: "Esta ya está. Me gané el café.", tarea: "Prueba de login" })!.tarea).toBe("Prueba de login");
    expect(validarPedidoOficina({ clase: "mascota", agenteId: null, mascota: "gato", texto: "¡Miau! ♥" })).toMatchObject({ mascota: "gato" });
    expect(validarPedidoOficina({ clase: "mascota", agenteId: null, mascota: "gato", texto: "¡Guau!" })).toBeNull();
    expect(validarPedidoOficina({ clase: "mascota", agenteId: null, mascota: "dragón", texto: "¡Miau!" })).toBeNull();
    expect(validarPedidoOficina({ clase: "entrega", agenteId: "a", para: "QA", tarea: "QA de Oficina global 0.5.0" })).toMatchObject({ para: "QA" });
    expect(validarPedidoOficina({ clase: "entrega", agenteId: "a", para: "QA; rm -rf /" })).toBeNull();
    expect(validarPedidoOficina({ clase: "sobre", agenteId: "a", para: "Diseño", tarea: "x\u0000y" })).toBeNull();
    expect(validarPedidoOficina({ clase: "dale", agenteId: "b" })).toEqual({ clase: "dale", agenteId: "b" });
    expect(validarPedidoOficina({ clase: "hora", agenteId: "a", hora: { h: 15, m: 40, dia: null } })).toMatchObject({ hora: { h: 15, m: 40, dia: null } });
    for (const hora of [{ h: 24, m: 0, dia: null }, { h: 9, m: 60, dia: null }, { h: 9.5, m: 0, dia: null }, { h: 9, m: 0, dia: "el viernes" }]) expect(validarPedidoOficina({ clase: "hora", agenteId: "a", hora })).toBeNull();
    expect(validarPedidoOficina({ clase: "otra", agenteId: "a", texto: "¿Por esta?" })).toBeNull();
    expect(validarPedidoOficina({ clase: "charla", agenteId: "", texto: "¿Por esta?" })).toBeNull();
  });
});

describe("qué dice la voz (JST-225 §4)", () => {
  it("con la tarea, la primera vez, sin el código: «Acabo de terminar esta: Re-QA de la Oficina global.»", () => {
    expect(conTarea("Acabo de terminar esta.", "JST-91: Re-QA de la Oficina global")).toBe("Acabo de terminar esta: Re-QA de la Oficina global.");
    expect(conTarea("¿Por esta?", "Instalar la Oficina global en la real")).toBe("¿Por esta? Instalar la Oficina global en la real.");
    expect(conTarea("Esta ya está. Me gané el café.", "Prueba de login en la app")).toBe("Esta ya está. Me gané el café: Prueba de login en la app.");
    expect(conTarea("Bacán.", null)).toBe("Bacán.");
    const p = pedidosDeCharla([
      { quien: "a", texto: "Me toca esta.", codigo: "BET-1", titulo: "Una tarea" },
      { quien: "b", texto: "¿Harta pega?", codigo: null, titulo: null },
      { quien: "a", texto: "Por esta.", codigo: "BET-1", titulo: "Una tarea" },
    ]);
    expect(p.map((x) => x.tarea)).toEqual(["Una tarea", null, null]);
    expect(p.map((x) => textoOficina(x))).toEqual(["Me toca esta: Una tarea.", "¿Harta pega?", "Por esta."]);
  });

  it("la entrega, «¡Dale!», el sobre y la mascota (sin «♥», «🤝» ni «*»)", () => {
    const t = (p: PedidoOficina) => textoOficina(p);
    expect(t({ clase: "entrega", agenteId: "a", para: "QA", tarea: "QA de Oficina global 0.5.0" })).toBe("QA, te paso QA de Oficina global 0.5.0.");
    expect(t({ clase: "entrega", agenteId: "a", para: "QA", tarea: null })).toBe("QA, te paso una tarea.");
    expect(t({ clase: "dale", agenteId: "b" })).toBe("¡Dale!");
    expect(t({ clase: "sobre", agenteId: "a", para: "QA", tarea: "Prueba de login en la app" })).toBe("Para QA: Prueba de login en la app.");
    expect(t({ clase: "mascota", agenteId: null, mascota: "gato", texto: "¡Miau! ♥" })).toBe("¡Miau!");
    expect(t({ clase: "mascota", agenteId: null, mascota: "conejo", texto: "*snif, snif*" })).toBe("snif, snif");
    expect(t({ clase: "mascota", agenteId: null, mascota: "conejo", texto: "♥ ♥" })).toBeNull();
    expect(paraLeer("♪ ♫")).toBe("");
    // Lo que dicen las 4 mascotas: 9 con letras.
    expect(Object.values(DICEN).flat().filter((x) => /\p{L}{2,}/u.test(paraLeer(x)))).toHaveLength(9);
    expect(SUELTAS.filter((x) => /\p{L}{2,}/u.test(x))).toHaveLength(7);
  });

  it("sin la barra (JST-239): «¿En qué anda Ingeniero/a?» se dice «¿En qué anda Ingeniero?», y el worker sigue aceptando lo que dice el globo", () => {
    const dice = (p: Partial<PedidoOficina>) => {
      const v = validarPedidoOficina({ agenteId: "a", ...p });
      expect(v).not.toBeNull();
      return textoOficina(v!);
    };
    const charla = (texto: string, tarea: string | null = null) => dice({ clase: "charla", texto, tarea });
    // Los nombres de la real con «/», como los deja el globo (`nombreDeCharla`).
    const globo = ["Ingeniero/a Full-stack de Plugins", "Diseñador/a de Producto (UX/UI)", "Creador/a de Contenido", "Coordinador/a de Operaciones Comerciales para Latinoamérica (piloto)", "Disenador UX/UI"].map(nombreDeCharla);
    expect(globo).toEqual(["Ingeniero/a", "Diseñador/a", "Creador/a", "Coordinador/a", "Disenador UX/UI"]);
    expect(globo.map((n) => charla(`¿En qué anda ${n}?`))).toEqual(["¿En qué anda Ingeniero?", "¿En qué anda Diseñador?", "¿En qué anda Creador?", "¿En qué anda Coordinador?", "¿En qué anda Disenador UX UI?"]);
    expect(charla("Coordinador/a sigue en pausa.")).toBe("Coordinador sigue en pausa.");
    expect(charla("A Ingeniero/a de Betalandia le falló el run.")).toBe("A Ingeniero de Betalandia le falló el run.");
    // La tarea y quien recibe la entrega, igual; los números y «// algún día» no cambian.
    expect(charla("Acabo de terminar esta.", "JST-90: Revisar el panel UX/UI de Jefes/as")).toBe("Acabo de terminar esta: Revisar el panel UX UI de Jefes.");
    expect(charla("Me toca esta.", "Soporte 24/7 y/o guardia")).toBe("Me toca esta: Soporte 24/7 y o guardia.");
    expect(charla("// algún día")).toBe("// algún día");
    expect(dice({ clase: "entrega", para: "Coordinador/a de operaciones", tarea: null })).toBe("Coordinador de operaciones, te paso una tarea.");
    expect(dice({ clase: "sobre", para: "Ingeniero/a", tarea: "Diseño UX/UI" })).toBe("Para Ingeniero: Diseño UX UI.");
    // Sin barra, el mismo texto de la 0.6.0 (sus audios en `vivo/` siguen sirviendo).
    expect(charla("¿En qué anda CMO?")).toBe("¿En qué anda CMO?");
    // Solo la «/a» (o «/as», «/o», «/os») pegada a una palabra en minúscula se saca; otra barra entre letras es un espacio.
    expect(sinBarras("Ingenieros/as, Front/Back, CI/OS, A/B, y/o")).toBe("Ingenieros, Front Back, CI OS, A B, y o");
  });

  it("la hora: hoy, mañana o el día, y «a la 1:05»", () => {
    expect(textoHora({ h: 15, m: 40, dia: null })).toBe("Termino como a las 15:40.");
    expect(textoHora({ h: 1, m: 5, dia: null })).toBe("Termino como a la 1:05.");
    expect(textoHora({ h: 9, m: 10, dia: "mañana" })).toBe("Termino mañana, como a las 9:10.");
    expect(textoHora({ h: 9, m: 10, dia: "viernes" })).toBe("Termino el viernes, como a las 9:10.");
    const ahora = new Date(2026, 9, 23, 14, 0).getTime();
    expect(horaParaVoz(new Date(2026, 9, 23, 15, 40).getTime(), ahora)).toEqual({ h: 15, m: 40, dia: null });
    expect(horaParaVoz(new Date(2026, 9, 24, 9, 10).getTime(), ahora)).toEqual({ h: 9, m: 10, dia: "mañana" });
    expect(horaParaVoz(new Date(2026, 9, 27, 9, 10).getTime(), ahora)).toEqual({ h: 9, m: 10, dia: "martes" });
  });
});

describe("cuánto dura un MP3 (el globo dura lo que su audio + 0,4 s)", () => {
  /** Cuadros de MPEG-2 capa III, 48 kbps, 24 kHz, mono: 144 bytes y 24 ms cada uno (como los de ffmpeg). */
  const cuadro = () => Uint8Array.from([0xff, 0xf3, 0x64, 0xc0, ...new Array(140).fill(0)]);
  const mp3 = (n: number, o: { id3?: boolean; info?: number } = {}) => {
    const partes: number[] = [];
    if (o.id3) partes.push(0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 20, ...new Array(20).fill(0));
    if (o.info !== undefined) {
      const c = cuadro();
      // «Info» después de la información lateral (9 bytes en MPEG-2 mono), con la marca de «cuántos cuadros».
      c.set([0x49, 0x6e, 0x66, 0x6f, 0, 0, 0, 1, (o.info >>> 24) & 255, (o.info >>> 16) & 255, (o.info >>> 8) & 255, o.info & 255], 13);
      partes.push(...c);
    }
    for (let i = 0; i < n; i++) partes.push(...cuadro());
    return Uint8Array.from(partes);
  };

  it("cuenta los cuadros (24 ms cada uno), saltándose la etiqueta ID3", () => {
    expect(duracionMp3(mp3(100))).toBe(2_400);
    expect(duracionMp3(mp3(50, { id3: true }))).toBe(1_200);
  });

  it("con el cuadro «Info» al comienzo usa cuántos cuadros dice (y ese no suena)", () => {
    expect(duracionMp3(mp3(100, { info: 100 }))).toBe(2_400);
  });

  it("la campanita de la Oficina (un MP3 de verdad) dura ~0,94 s; algo que no es MP3, `null`", () => {
    const campana = readFileSync(fileURLToPath(new URL("../src/ui/assets/aviso-campana.mp3", import.meta.url)));
    expect(Math.abs(duracionMp3(campana)! - 940)).toBeLessThan(80);
    expect(duracionMp3(new Uint8Array([1, 2, 3, 4, 5, 6]))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Una voz a la vez (JST-225 §5, punto 4 del spike de JST-224)
// ---------------------------------------------------------------------------

function turno() {
  const reloj = { t: 1_000_000 };
  return { t: new TurnoVoz(() => reloj.t), reloj };
}

describe("quién habla: los avisos primero, lo que llega tarde se bota", () => {
  it("un aviso corta lo de la oficina (devuelve lo que había que callar) y mientras suena no empieza nada", () => {
    const { t, reloj } = turno();
    expect(t.puede("charla")).toBe(true);
    t.empieza("charla", "c:1", reloj.t + 20_000);
    expect(t.avisos(true)).toMatchObject({ lo: "charla", clave: "c:1" });
    expect(t.actual()).toBeNull();
    for (const lo of ["charla", "entrega", "suelta", "hora"] as const) expect(t.puede(lo)).toBe(false);
    // Con un aviso sonando, la mascota que tocas responde sin voz.
    expect(t.puede("mascota")).toBe(false);
  });

  it("después de un aviso la próxima conversación espera 10 s; lo demás puede al tiro", () => {
    const { t, reloj } = turno();
    t.avisos(true);
    reloj.t += 4_000;
    t.avisos(false);
    expect(t.puede("charla")).toBe(false);
    expect(t.puede("entrega")).toBe(true);
    reloj.t += TRAS_AVISO_MS - 1;
    expect(t.puede("charla")).toBe(false);
    reloj.t += 1;
    expect(t.puede("charla")).toBe(true);
  });

  it("una conversación con voz por minuto como mucho, contando las de otra pestaña", () => {
    const { t, reloj } = turno();
    t.empieza("charla", "c:1", reloj.t + 15_000);
    reloj.t += 15_000;
    t.termina("c:1");
    expect(t.puede("charla")).toBe(false);
    reloj.t += TOPE_CHARLA_MS - 15_000;
    expect(t.puede("charla")).toBe(true);
    // Otra pestaña empezó una hace 10 s: espera hasta que se cumpla su minuto (y mientras suena, nada).
    t.ajeno({ lo: "charla", clave: "c:9", hasta: reloj.t + 5_000, desde: reloj.t - 10_000 });
    expect(t.puede("charla")).toBe(false);
    expect(t.puede("suelta")).toBe(false);
    reloj.t += 5_000;
    t.ajeno(null);
    expect(t.puede("suelta")).toBe(true);
    expect(t.puede("charla")).toBe(false);
    reloj.t += TOPE_CHARLA_MS - 15_000;
    expect(t.puede("charla")).toBe(true);
  });

  it("lo que llega mientras alguien habla se bota: la entrega, la frase suelta y la hora no pasan encima", () => {
    const { t, reloj } = turno();
    t.empieza("charla", "c:1", reloj.t + 12_000);
    for (const lo of ["entrega", "suelta", "hora"] as const) expect(t.puede(lo)).toBe(false);
    // La conversación terminó (o se le pasó la hora): el canal queda libre.
    reloj.t += 12_001;
    expect(t.puede("entrega")).toBe(true);
    expect(t.puede("hora")).toBe(true);
    expect(ESPERA_HORA_MS).toBe(30_000);
  });

  it("la respuesta de la misma entrega («¡Dale!») va dentro de su turno; otra entrega no", () => {
    const { t, reloj } = turno();
    t.empieza("entrega", "e:4", reloj.t + 9_000);
    expect(t.puede("entrega", { clave: "e:4" })).toBe(true);
    expect(t.puede("entrega", { clave: "e:5" })).toBe(false);
    expect(t.puede("entrega")).toBe(false);
  });

  it("la mascota que tocas corta lo de la oficina; la que despierta sola en el TV espera un hueco y sus 5 min", () => {
    const { t, reloj } = turno();
    t.empieza("charla", "c:1", reloj.t + 10_000);
    expect(t.puede("mascota")).toBe(true);
    expect(t.puede("mascota", { sola: true })).toBe(false);
    expect(t.empieza("mascota", "m:gato", reloj.t + 2_000)).toMatchObject({ clave: "c:1" });
    reloj.t += 2_500;
    expect(t.puede("mascota", { sola: true })).toBe(true);
    t.empieza("mascota", "m:robot", reloj.t + 2_000, { sola: true });
    reloj.t += 2_500;
    expect(t.puede("mascota", { sola: true })).toBe(false);
    reloj.t += TOPE_MASCOTA_SOLA_MS;
    expect(t.puede("mascota", { sola: true })).toBe(true);
  });

  it("frases sueltas: solo en un hueco y una por minuto", () => {
    const { t, reloj } = turno();
    t.empieza("suelta", "t:1", reloj.t + 3_000);
    reloj.t += 3_000;
    t.termina("t:1");
    expect(t.puede("suelta")).toBe(false);
    reloj.t += TOPE_SUELTA_MS - 3_000;
    expect(t.puede("suelta")).toBe(true);
  });
});
