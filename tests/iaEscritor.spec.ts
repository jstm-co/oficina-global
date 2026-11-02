// 0.7.0 (JST-232): la IA de Chrome escribe con un `LanguageModel` falso. Sin pedirlo no se abre ninguna sesión; las
// ráfagas van cada 15 min con la Oficina a la vista, el candado y el permiso del worker; cada pedido tiene su tope de 30 s
// y de 1.500 letras; y si algo falla, no se avisa (van las frases de siempre).
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Linea, MuestraFinal } from "../src/charlas.js";
import { Escritor, TOPE_PEDIDO_MS, usaReserva, type DepsEscritor, type Disponibilidad, type ModeloIa, type SesionIa } from "../src/ia/escritor.js";
import { CADA_MS, reservaVacia, type DatosReserva } from "../src/ia/reserva.js";

const l = (quien: string, texto: string): Linea => ({ quien, texto, codigo: null, titulo: null });
const MUESTRAS: MuestraFinal[] = [
  { clave: "error-1|P3()/¿Qué le pasó?/Se quedó sin cupo, parece.", variante: "error-1", apertura: "A {agente} le falló el run.", fijas: [l("a", "A CEO le falló el run."), l("b", "¿Qué le pasó?"), l("a", "Se quedó sin cupo, parece.")] },
  { clave: "trabajan-5|Nadie está trabajando.", variante: "trabajan-5", apertura: "Nadie está trabajando.", fijas: [l("a", "Nadie está trabajando.")] },
];

/** Lo que responde la IA falsa a un paquete completo. */
function respuesta(texto: string): string {
  const cs = [...texto.matchAll(/- (c\d+) · Apertura: «([^»]+)»/g)].map((m) => ({ id: m[1]!, apertura: m[2]! }));
  const ss = [...texto.matchAll(/- (s\d+)$/gm)].map((m) => m[1]!);
  const SUELTAS = ["Linda la ventana.", "Un sorbo y sigo.", "Qué rico el sofá.", "A estirar las piernas.", "Mmm, café de grano."];
  const MASCOTAS = ["Qué rico el sol.", "El sofá me llama.", "Qué lindo el jardín.", "Todo está limpio."];
  return JSON.stringify({
    charlas: cs.map(({ id, apertura }) => ({ id, primera: apertura.includes("{agente}") ? "¡Qué lata por {agente}!" : "Uf, qué mal momento.", frases: texto.includes("Solo reescribe aperturas") ? [] : [{ texto: "Ánimo, ya pasará." }] })),
    sueltas: ss.map((id, i) => ({ id, texto: SUELTAS[i % SUELTAS.length] })),
    bromas: texto.includes("Bromas:") ? [{ id: "b1", frases: [{ texto: "¿Café o té?" }, { texto: "Café, por favor." }] }] : [],
    mascotas: texto.includes("Mascotas:") ? MASCOTAS.map((t, i) => ({ id: `m${i + 1}`, texto: t })) : [],
  });
}

interface Falso {
  modelo: ModeloIa;
  creadas: number;
  copias: number;
  soltadas: number;
  pedidos: string[];
  temperaturas: Array<number | undefined>;
  disp: Disponibilidad;
  /** Cómo responde cada pedido: el texto (de a trozos), uno que no termina nunca o uno que no para. */
  modo: "bien" | "colgado" | "desbocado" | "falla";
  /** `create` falla (la bajada no se pudo). */
  crearFalla: boolean;
}

function falso(disp: Disponibilidad = "available"): Falso {
  const f: Falso = { creadas: 0, copias: 0, soltadas: 0, pedidos: [], temperaturas: [], disp, modo: "bien", crearFalla: false, modelo: null as unknown as ModeloIa };
  const sesion = (): SesionIa => ({
    async clone() {
      f.copias += 1;
      return sesion();
    },
    promptStreaming(texto, o) {
      f.pedidos.push(texto);
      return (async function* () {
        if (f.modo === "falla") throw new Error("InvalidStateError");
        if (f.modo === "colgado") {
          await new Promise((_, mal) => o.signal?.addEventListener("abort", () => mal(new DOMException("aborted", "AbortError"))));
        }
        if (f.modo === "desbocado") {
          for (;;) {
            if (o.signal?.aborted) throw new DOMException("aborted", "AbortError");
            yield "Bla bla bla bla bla bla bla bla bla. ";
            await Promise.resolve();
          }
        }
        const r = respuesta(texto);
        for (let i = 0; i < r.length; i += 40) yield r.slice(i, i + 40);
      })();
    },
    destroy() {
      f.soltadas += 1;
    },
  });
  f.modelo = {
    async availability() {
      return f.disp;
    },
    async create(o) {
      if (f.crearFalla) throw new Error("NotAllowedError");
      f.creadas += 1;
      f.temperaturas.push(o.temperature);
      if (o.monitor) {
        const t = new EventTarget();
        o.monitor(t);
        for (const p of [0, 0.42, 1]) {
          const e = new Event("downloadprogress") as Event & { loaded: number };
          e.loaded = p;
          t.dispatchEvent(e);
        }
      }
      f.disp = "available";
      return sesion();
    },
  };
  return f;
}

function armar(f: Falso, o: Partial<DepsEscritor> = {}) {
  let reserva: DatosReserva = reservaVacia();
  let ahora = 1_000_000;
  const estado = { quiere: true, visible: true, permiso: true, candadoLibre: true };
  const e = new Escritor({
    modelo: f.modelo,
    sinApi: "vieja",
    ahora: () => ahora,
    visible: () => estado.visible,
    quiere: () => estado.quiere,
    permiso: async () => estado.permiso,
    candado: async (fn) => (estado.candadoLibre ? fn() : null),
    pedidos: () => ({ muestras: MUESTRAS, nombres: ["Catalina"] }),
    leer: () => structuredClone(reserva),
    guardar: (r) => (reserva = structuredClone(r)),
    azar: () => 0.5,
    ...o,
  });
  return { e, estado, reserva: () => reserva, pasar: (ms: number) => (ahora += ms) };
}

afterEach(() => vi.useRealTimers());

describe("sin pedirlo, la IA no hace nada", () => {
  it("con «Frases de siempre» o las conversaciones ocultas no se abre ninguna sesión", async () => {
    const f = falso();
    const { e, estado } = armar(f);
    estado.quiere = false;
    await e.tic();
    await e.tic();
    expect(f.creadas).toBe(0);
    expect(e.estado()).toEqual({ k: "lista" });
    expect(e.escribe()).toBe(false);
  });

  it("con la pestaña oculta, tampoco", async () => {
    const f = falso();
    const { e, estado } = armar(f);
    estado.visible = false;
    await e.tic();
    expect(f.creadas).toBe(0);
  });

  it("el modelo no se baja solo: con «falta bajarla» no se crea nada hasta el clic", async () => {
    const f = falso("downloadable");
    const { e } = armar(f);
    await e.tic();
    await e.tic();
    expect(f.creadas).toBe(0);
    expect(e.estado()).toEqual({ k: "bajar" });
  });

  it("sin `LanguageModel`: «sin», con el motivo (celular, otro navegador, sin el flag), y nada más", async () => {
    const { e } = armar(falso(), { modelo: null, sinApi: "insegura" });
    await e.tic();
    expect(e.estado()).toEqual({ k: "sin", por: "insegura" });
    expect(e.escribe()).toBe(false);
  });

  it("Chrome sin la IA («unavailable»): no disponible", async () => {
    const { e } = armar(falso("unavailable"));
    await e.tic();
    expect(e.estado()).toEqual({ k: "sin", por: "no-disponible" });
  });
});

describe("las ráfagas", () => {
  it("con la reserva corta escribe 4 paquetes cada 15 min, sube la temperatura y suelta la sesión", async () => {
    const f = falso();
    const { e, reserva, pasar } = armar(f);
    await e.tic();
    expect(f.creadas).toBe(1);
    expect(f.copias).toBe(4);
    expect(f.soltadas).toBe(5);
    expect(f.temperaturas).toEqual([1.2]);
    const r = reserva();
    expect(r.aperturas["error-1"]!.map((x) => x.f)).toEqual([["¡Qué lata por {agente}!"]]);
    expect(r.finales[MUESTRAS[0]!.clave]!.map((x) => x.f)).toEqual([["Ánimo, ya pasará."]]);
    expect(r.sueltas.length).toBe(5);
    expect(r.bromas.length).toBe(1);
    expect(Object.values(r.mascotas).flat().length).toBe(4);
    expect(e.escritas.some((x) => x.tipo === "final" && x.fijas[0] === "A CEO le falló el run.")).toBe(true);
    pasar(CADA_MS - 1_000);
    await e.tic();
    expect(f.creadas).toBe(1);
    pasar(1_000);
    await e.tic();
    expect(f.creadas).toBe(2);
    expect(f.copias).toBe(8);
    expect(f.temperaturas).toEqual([1.2, 1.2]);
  });

  it("con un modelo más chico, mantiene la dedicada a aperturas y reparte el resto en paquetes proporcionales", async () => {
    const f = falso();
    const { e } = armar(f, { finalesPorPaquete: 2 });
    await e.tic();
    expect(f.copias).toBe(8);
    expect(f.pedidos[0]).toContain("Solo reescribe aperturas");
    expect(f.pedidos.slice(1).every((p) => [...p.matchAll(/^- s\d+$/gm)].length === 3)).toBe(true);
  });

  it("pide primero lo que tiene menos finales, sin repetir una clave en la ráfaga", async () => {
    const f = falso();
    const { e } = armar(f);
    await e.tic();
    // El 1.º pide solo aperturas; el 2.º, los finales de las mismas 2 muestras; los demás no repiten clave.
    expect(f.pedidos[0]).toContain("Solo reescribe aperturas");
    expect(f.pedidos[0]).toContain("c1 ·");
    expect(f.pedidos[0]).toContain("c2 ·");
    expect(f.pedidos.slice(0, 2).every((p) => p.includes("Conversaciones"))).toBe(true);
    expect(f.pedidos.slice(2).every((p) => !p.includes("Conversaciones"))).toBe(true);
  });

  it("con la Mac cargada o un clon generando (el worker no da permiso): «En pausa» y no se abre la sesión", async () => {
    const f = falso();
    const { e, estado, pasar } = armar(f);
    estado.permiso = false;
    await e.tic();
    expect(e.estado()).toEqual({ k: "pausa" });
    expect(e.escribe()).toBe(false);
    expect(f.creadas).toBe(0);
    // Sigue sola cuando se libera (se vuelve a preguntar en el tic siguiente).
    estado.permiso = true;
    pasar(30_000);
    await e.tic();
    expect(e.estado()).toEqual({ k: "lista" });
    expect(f.creadas).toBe(1);
  });

  it("0.8.1 (JST-249): en pausa se sigue usando lo que la IA ya escribió; solo se salta la ráfaga", () => {
    expect(usaReserva({ k: "lista" })).toBe(true);
    expect(usaReserva({ k: "pausa" })).toBe(true);
    for (const k of ["revisando", "bajar", "fallo"] as const) expect(usaReserva({ k })).toBe(false);
    expect(usaReserva({ k: "bajando", avance: 0.4 })).toBe(false);
    expect(usaReserva({ k: "sin", por: "celular" })).toBe(false);
  });

  it("0.8.1 (JST-249): una ráfaga en pausa vuelve a preguntar en cada tic (30 s), no cada minuto, y al worker solo se le pregunta si toca una ráfaga", async () => {
    const f = falso();
    let permiso = false;
    let preguntas = 0;
    const { e, pasar } = armar(f, { permiso: async () => (preguntas++, permiso) });
    await e.tic();
    expect(e.estado()).toEqual({ k: "pausa" });
    for (let i = 0; i < 3; i++) {
      pasar(30_000);
      await e.tic();
    }
    expect(preguntas).toBe(4);
    expect(f.creadas).toBe(0);
    // Un tic de más en menos de 20 s (volver a la pestaña, cambiar un ajuste) no pregunta otra vez.
    pasar(5_000);
    await e.tic();
    expect(preguntas).toBe(4);
    // Se libera: escribe con esa misma respuesta (sin preguntar dos veces) y sale de la pausa.
    permiso = true;
    pasar(30_000);
    await e.tic();
    expect(preguntas).toBe(5);
    expect(f.creadas).toBe(1);
    expect(e.estado()).toEqual({ k: "lista" });
    // Hasta la próxima ráfaga (15 min) no se le pregunta nada al worker.
    for (let t = 0; t < CADA_MS - 30_000; t += 30_000) {
      pasar(30_000);
      await e.tic();
    }
    expect(preguntas).toBe(5);
    expect(f.creadas).toBe(1);
  });

  it("0.8.1 (JST-249): si otra pestaña ya escribió la ráfaga que esperaba, no queda «En pausa»", async () => {
    const f = falso();
    const { e, estado, reserva, pasar } = armar(f);
    estado.permiso = false;
    await e.tic();
    expect(e.estado()).toEqual({ k: "pausa" });
    // La otra pestaña escribió (la reserva compartida dice cuándo).
    pasar(30_000);
    reserva().rafaga = 1_000_000 + 30_000;
    await e.tic();
    expect(e.estado()).toEqual({ k: "lista" });
  });

  it("0.8.1 (JST-249): mientras el worker no contesta (espera a que termine un clon), otro tic no le vuelve a preguntar", async () => {
    const f = falso();
    let preguntas = 0;
    let contestar: (ok: boolean) => void = () => undefined;
    const { e, pasar } = armar(f, { permiso: () => (preguntas++, new Promise<boolean>((ok) => (contestar = ok))) });
    const primero = e.tic();
    await new Promise((ok) => setTimeout(ok, 0));
    pasar(30_000);
    await e.tic();
    expect(preguntas).toBe(1);
    contestar(true);
    await primero;
    expect(f.creadas).toBe(1);
  });

  it("si todavía no se le puede preguntar al worker (el piso sin sus agentes), no queda «En pausa»: pregunta otra vez en el próximo tic", async () => {
    const f = falso();
    let permiso: boolean | null = null;
    let preguntas = 0;
    const { e, pasar } = armar(f, { permiso: async () => (preguntas++, permiso) });
    await e.tic();
    expect(e.estado()).toEqual({ k: "lista" });
    expect(f.creadas).toBe(0);
    expect(preguntas).toBe(1);
    permiso = true;
    pasar(30_000);
    await e.tic();
    expect(preguntas).toBe(2);
    expect(f.creadas).toBe(1);
  });

  it("una sola pestaña escribe: sin el candado, se salta", async () => {
    const f = falso();
    const { e, estado } = armar(f);
    estado.candadoLibre = false;
    await e.tic();
    expect(f.creadas).toBe(0);
    expect(e.registro.at(-1)).toMatchObject({ tipo: "saltada", por: "candado" });
  });

  it("si la pestaña se oculta en medio, no sigue con el paquete siguiente", async () => {
    const f = falso();
    let guardadas = 0;
    const { e, estado } = armar(f, {
      // Se guarda al empezar la ráfaga y después de cada paquete: después del 1.º, la pestaña se oculta.
      guardar: () => {
        guardadas += 1;
        if (guardadas === 2) estado.visible = false;
      },
    });
    await e.rafaga();
    expect(f.copias).toBe(1);
    expect(f.soltadas).toBe(2);
  });
});

describe("si falla o tarda, no se avisa: van las frases de siempre", () => {
  it("un pedido colgado se corta a los 30 s; la sesión se suelta", async () => {
    vi.useFakeTimers();
    const f = falso();
    f.modo = "colgado";
    const { e, reserva } = armar(f);
    const p = e.tic();
    await vi.advanceTimersByTimeAsync(TOPE_PEDIDO_MS * 4 + 1_000);
    await p;
    expect(e.registro.filter((x) => x.tipo === "paquete").every((x) => x.tipo === "paquete" && x.corte === "tope")).toBe(true);
    expect(f.soltadas).toBe(5);
    expect(reserva().sueltas).toEqual([]);
    expect(e.estado()).toEqual({ k: "lista" });
  });

  it("una respuesta desbocada se corta a las 1.500 letras y se bota", async () => {
    const f = falso();
    f.modo = "desbocado";
    const { e, reserva } = armar(f);
    await e.tic();
    expect(e.registro.some((x) => x.tipo === "paquete" && x.corte === "largo")).toBe(true);
    expect(reserva().sueltas).toEqual([]);
  });

  it("si el pedido falla, se anota y sigue igual (se reintenta en la próxima ráfaga)", async () => {
    const f = falso();
    f.modo = "falla";
    const { e } = armar(f);
    await e.tic();
    expect(e.registro.some((x) => x.tipo === "paquete" && !!x.error)).toBe(true);
    expect(e.estado()).toEqual({ k: "lista" });
  });

  it("si no se puede abrir la sesión, se salta esa ráfaga sin cambiar el estado", async () => {
    const f = falso();
    f.crearFalla = true;
    const { e } = armar(f);
    await e.tic();
    expect(e.registro.some((x) => x.tipo === "error" && x.donde === "sesión")).toBe(true);
    expect(e.estado()).toEqual({ k: "lista" });
  });
});

describe("«Bajar la IA» (con el clic)", () => {
  it("el avance llega de a poco y al terminar queda lista (y avisa para el toast)", async () => {
    const f = falso("downloadable");
    const { e } = armar(f);
    await e.revisar();
    const avances: Array<number | null> = [];
    e.suscribir(() => {
      const s = e.estado();
      if (s.k === "bajando") avances.push(s.avance);
    });
    let lista = 0;
    e.alLista(() => (lista += 1));
    expect(await e.bajar()).toBe(true);
    expect(avances).toEqual(expect.arrayContaining([0, 0.42, 1]));
    expect(e.estado()).toEqual({ k: "lista" });
    expect(lista).toBe(1);
    // La sesión de la bajada se suelta al tiro.
    expect(f.soltadas).toBe(1);
  });

  it("si no se pudo, «No se pudo bajar» con «Reintentar»", async () => {
    const f = falso("downloadable");
    f.crearFalla = true;
    const { e } = armar(f);
    await e.revisar();
    expect(await e.bajar()).toBe(false);
    expect(e.estado()).toEqual({ k: "fallo" });
    f.crearFalla = false;
    expect(await e.bajar()).toBe(true);
    expect(e.estado()).toEqual({ k: "lista" });
  });

  it("mientras la baja otra pestaña: «Bajando» con su avance; sin avance, «Bajando» a secas", async () => {
    const f = falso("downloading");
    const { e } = armar(f);
    await e.revisar();
    expect(e.estado()).toEqual({ k: "bajando", avance: null });
    e.avanceDeOtra(0.3);
    expect(e.estado()).toEqual({ k: "bajando", avance: 0.3 });
  });
});
