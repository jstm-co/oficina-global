// La entrega en la mesa con una frase nueva (JST-237, del QA de JST-227): si
// los dos ya estaban en el descanso, se juntan en 1–3 s y su audio llega
// después; la página lo espera mientras están juntos, si cabe antes de que se
// separen, el canal sigue libre y no se cortó. «¡Dale!» va después.
// Es la voz de la página de verdad (`VozDePiso`) con un worker, unas descargas
// y un parlante de mentira.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HechoVoz, Vida } from "../src/vida.js";
import type { IndiceVoces } from "../src/voces.js";

/** El worker de mentira: cuándo está cada audio (por su archivo), cuáles no se pueden hacer y cuánto dura cada uno. */
const m = vi.hoisted(() => ({
  listo: new Map<string, number>(),
  no: new Set<string>(),
  largo: new Map<string, number>(),
  llamadas: 0,
  bajados: new Map<string, Promise<Blob | null>>(),
  blobs: new WeakMap<object, { archivo: string; ms: number }>(),
  sonados: [] as Array<{ t: number; archivo: string }>,
}));

vi.mock("../src/fuentes.js", async () => {
  const { archivoVivo } = await import("../src/voces.js");
  const { textoOficina } = await import("../src/vozOficina.js");
  const VOZ: Record<string, string> = { E: "catalina", R: "dora" };
  return {
    accionPlugin: (_f: unknown, _id: string, _accion: string, _c: string, params: { pedidos: Array<Parameters<typeof textoOficina>[0]>; ms: number }) => {
      m.llamadas += 1;
      const archivos = params.pedidos.map((p) => archivoVivo(VOZ[p.agenteId!]!, textoOficina(p)!));
      const estados = () => archivos.map((a) => (m.no.has(a) ? "no" : Date.now() >= (m.listo.get(a) ?? Infinity) ? "lista" : "fila"));
      const fin = Date.now() + Math.min(params.ms, 20_000);
      return new Promise((ok) => {
        const mirar = () => {
          const e = estados();
          if (Date.now() >= fin || !e.includes("fila") || e.includes("no")) ok({ estados: e });
          else setTimeout(mirar, Math.min(250, fin - Date.now()));
        };
        mirar();
      });
    },
  };
});
vi.mock("../src/voces.js", async (original) => ({
  ...(await original<typeof import("../src/voces.js")>()),
  // El «MP3» de mentira lleva escrito cuánto dura.
  duracionAudio: (b: Uint8Array) => Number(new TextDecoder().decode(b)),
}));
vi.mock("../src/ui/audiosVoces.js", () => {
  const indice: IndiceVoces = { version: 1, generado: "", resumen: "dora", agentes: { E: "catalina", R: "dora" }, audios: {} };
  return {
    cargarIndice: async () => indice,
    instalacion: async () => "uuid-oficina",
    archivoDeBlob: (b: Blob) => m.blobs.get(b)?.archivo ?? null,
    yaBajado: (a: string) => m.bajados.get(a) ?? null,
    // Bajar un MP3 que ya está tarda 200 ms.
    pedirArchivo: (a: string) => {
      const ya = m.bajados.get(a);
      if (ya) return ya;
      const p = new Promise<Blob | null>((ok) =>
        setTimeout(() => {
          const ms = m.largo.get(a) ?? 1_000;
          const b = { arrayBuffer: async () => new TextEncoder().encode(String(ms)).buffer } as unknown as Blob;
          m.blobs.set(b, { archivo: a, ms });
          ok(b);
        }, 200),
      );
      m.bajados.set(a, p);
      return p;
    },
  };
});
vi.mock("../src/ui/sonido.js", () => ({
  alCambiarAvisos: () => () => undefined,
  alHablarAviso: () => () => undefined,
  audioDesbloqueado: () => true,
  avisoActivo: () => false,
  callarOficina: () => undefined,
  cuandoSeDesbloquee: () => () => undefined,
  // El parlante: anota cuándo empieza y avisa al terminar.
  tocarOficina: (b: Blob, alEmpezar: (ms: number | null) => void, alTerminar: () => void) => {
    const x = m.blobs.get(b)!;
    m.sonados.push({ t: Date.now(), archivo: x.archivo });
    alEmpezar(x.ms);
    setTimeout(alTerminar, x.ms);
    return true;
  },
}));
vi.mock("../src/ui/vigia.js", () => ({ escucharVoz: () => () => undefined, publicarVoz: () => undefined }));
vi.mock("../src/ui/vozViva.js", () => ({ estadoVozViva: async () => null }));
vi.mock("../src/ui/ajustes.js", async (original) => {
  const o = await original<typeof import("../src/ui/ajustes.js")>();
  const a = { ...o.AJUSTES_POR_OMISION, voces: true, leer: { charlas: false, entregas: true, mascotas: false, sueltas: false, hora: false } };
  return { ...o, ajustes: () => a, alCambiarAjustes: () => () => undefined };
});

const { archivoVivo } = await import("../src/voces.js");
const { VozDePiso, turno } = await import("../src/ui/vozOficina.js");

/** Lo que dice quien entrega (catalina) y lo que responde quien recibe (dora). */
const FRASE = archivoVivo("catalina", "Sonda QA216 recibe, te paso una tarea.");
const DALE = archivoVivo("dora", "¡Dale!");

/** Una entrega entre E y R: `sale` con el evento y `hablan` cuando se juntan en la mesa (están 9 s). */
function armar() {
  let juntosHasta = 0;
  let cortada = false;
  const vida = { restoJunta: () => (cortada ? 0 : Math.max(0, juntosHasta - Date.now())), unaEmpresa: () => "c" } as unknown as Vida;
  const voz = new VozDePiso(vida);
  voz.activar(true);
  const base = { tipo: "entrega", id: 7, como: "mesa", de: "E", a: "R", companyId: "c", para: "Sonda QA216 recibe", titulo: null } as const;
  return {
    voz,
    sale: () => voz.hecho({ ...base, fase: "sale" } as HechoVoz),
    hablan: () => {
      juntosHasta = Date.now() + 9_000;
      voz.hecho({ ...base, fase: "hablan" } as HechoVoz);
    },
    cortar: () => (cortada = true),
  };
}

/** Lo que sonó, en ms desde `t0`: `de` (quien entrega) y `dale`. */
const sono = (t0: number) => m.sonados.map((s) => ({ que: s.archivo === DALE ? "dale" : s.archivo === FRASE ? "de" : s.archivo, t: s.t - t0 }));

describe("la entrega en la mesa espera su audio mientras están juntos (JST-237)", () => {
  let piso: InstanceType<typeof VozDePiso> | null = null;
  /** Arma la entrega (y la deja para cerrarla al final). */
  const nueva = () => {
    const e = armar();
    piso = e.voz;
    return e;
  };
  let t0 = 0;
  beforeEach(() => {
    vi.useFakeTimers();
    t0 = Date.now();
    m.listo.clear();
    m.no.clear();
    m.largo.clear();
    m.largo.set(FRASE, 2_500);
    m.largo.set(DALE, 700);
    m.bajados.clear();
    m.sonados.length = 0;
    m.llamadas = 0;
  });
  afterEach(() => {
    piso?.activar(false);
    piso = null;
    vi.useRealTimers();
  });

  it("frase nueva: se juntan a los 1,25 s y su audio está a los 4,6 s: suena entonces, y «¡Dale!» cuando termina", async () => {
    m.listo.set(FRASE, t0 + 4_600);
    m.listo.set(DALE, t0 + 1_000);
    const e = nueva();
    e.sale();
    await vi.advanceTimersByTimeAsync(1_250);
    e.hablan();
    await vi.advanceTimersByTimeAsync(9_000);
    const s = sono(t0);
    expect(s.map((x) => x.que)).toEqual(["de", "dale"]);
    // El worker lo tiene a los 4,6 s (se le pregunta cada 250 ms) y se baja en 0,2 s.
    expect(s[0]!.t).toBeGreaterThanOrEqual(4_600);
    expect(s[0]!.t).toBeLessThanOrEqual(5_050);
    // «¡Dale!» justo cuando termina quien entrega (1 ms después: el `setTimeout` de 0), y los dos antes de que se separen (1,25 s + 9 s − 0,4 s).
    expect(s[1]!.t - s[0]!.t - 2_500).toBeGreaterThanOrEqual(0);
    expect(s[1]!.t - s[0]!.t - 2_500).toBeLessThanOrEqual(5);
    expect(s[1]!.t + 700).toBeLessThanOrEqual(1_250 + 9_000 - 400);
  });

  it("frase ya guardada: suena al juntarse y «¡Dale!» después, como antes", async () => {
    m.listo.set(FRASE, 0);
    m.listo.set(DALE, 0);
    const e = nueva();
    e.sale();
    await vi.advanceTimersByTimeAsync(2_700);
    e.hablan();
    await vi.advanceTimersByTimeAsync(9_000);
    const s = sono(t0);
    expect(s.map((x) => x.que)).toEqual(["de", "dale"]);
    expect(s[0]!.t).toBe(2_700);
    expect(s[1]!.t - 2_700 - 2_500).toBeGreaterThanOrEqual(0);
    expect(s[1]!.t - 2_700 - 2_500).toBeLessThanOrEqual(5);
  });

  it("desde el escritorio (caminan 12 s): lo pedido al salir espera 10 s y al juntarse se vuelve a preguntar", async () => {
    m.listo.set(FRASE, t0 + 13_000);
    m.listo.set(DALE, t0 + 13_000);
    const e = nueva();
    e.sale();
    await vi.advanceTimersByTimeAsync(12_000);
    e.hablan();
    await vi.advanceTimersByTimeAsync(9_000);
    const s = sono(t0);
    expect(s.map((x) => x.que)).toEqual(["de", "dale"]);
    expect(s[0]!.t).toBeGreaterThanOrEqual(13_000);
    expect(s[0]!.t).toBeLessThanOrEqual(13_450);
  });

  it("si su audio llega tan tarde que no alcanza a decirse antes de que se separen, no suena (ni «¡Dale!»)", async () => {
    // Se juntan a los 1,25 s y se separan a los 10,25 s: la frase (2,5 s) tiene que empezar antes de los 7,35 s.
    m.listo.set(FRASE, t0 + 7_400);
    m.listo.set(DALE, 0);
    const e = nueva();
    e.sale();
    await vi.advanceTimersByTimeAsync(1_250);
    e.hablan();
    await vi.advanceTimersByTimeAsync(12_000);
    expect(sono(t0)).toEqual([]);
  });

  it("si cabe la frase y «¡Dale!» no, suena solo quien entrega", async () => {
    // Suena a los 6,2 s; con 2,5 s termina a los 8,7 s y «¡Dale!» (0,7 s) cabe antes de los 9,85 s; con 3,2 s, no.
    m.listo.set(FRASE, t0 + 6_000);
    m.listo.set(DALE, 0);
    const e = nueva();
    e.sale();
    await vi.advanceTimersByTimeAsync(1_250);
    e.hablan();
    await vi.advanceTimersByTimeAsync(12_000);
    expect(sono(t0).map((x) => x.que)).toEqual(["de", "dale"]);

    piso!.activar(false);
    m.sonados.length = 0;
    m.bajados.clear();
    m.largo.set(FRASE, 3_200);
    const t1 = Date.now();
    m.listo.set(FRASE, t1 + 6_000);
    const e2 = nueva();
    e2.sale();
    await vi.advanceTimersByTimeAsync(1_250);
    e2.hablan();
    await vi.advanceTimersByTimeAsync(12_000);
    expect(sono(t1).map((x) => x.que)).toEqual(["de"]);
  });

  it("se cortó la entrega mientras esperaba (a alguien le cambió el estado): no suena", async () => {
    m.listo.set(FRASE, t0 + 4_600);
    m.listo.set(DALE, 0);
    const e = nueva();
    e.sale();
    await vi.advanceTimersByTimeAsync(1_250);
    e.hablan();
    await vi.advanceTimersByTimeAsync(2_000);
    e.cortar();
    await vi.advanceTimersByTimeAsync(9_000);
    expect(sono(t0)).toEqual([]);
  });

  it("si cuando llega su audio ya habla otro (una conversación), se bota: no queda en cola", async () => {
    m.listo.set(FRASE, t0 + 4_600);
    m.listo.set(DALE, 0);
    const e = nueva();
    e.sale();
    await vi.advanceTimersByTimeAsync(1_250);
    e.hablan();
    await vi.advanceTimersByTimeAsync(1_000);
    turno.empieza("charla", "c:99", Date.now() + 20_000);
    await vi.advanceTimersByTimeAsync(9_000);
    turno.termina("c:99");
    expect(sono(t0)).toEqual([]);
  });

  it("si el canal está ocupado al juntarse, no se pide nada", async () => {
    m.listo.set(FRASE, t0 + 4_600);
    const e = nueva();
    turno.empieza("charla", "c:98", Date.now() + 20_000);
    e.hablan();
    await vi.advanceTimersByTimeAsync(10_000);
    turno.termina("c:98");
    expect(m.llamadas).toBe(0);
    expect(m.sonados).toEqual([]);
  });

  it("un clon que no se puede hacer ahora («no»): no se espera ni suena", async () => {
    m.no.add(FRASE);
    m.listo.set(DALE, 0);
    const e = nueva();
    e.sale();
    await vi.advanceTimersByTimeAsync(1_000);
    const antes = m.llamadas;
    e.hablan();
    await vi.advanceTimersByTimeAsync(9_000);
    expect(sono(t0)).toEqual([]);
    // Al juntarse se le pregunta una vez por quien entrega (dice «no» al tiro); «¡Dale!» ya estaba bajado.
    expect(m.llamadas - antes).toBe(1);
  });
});
