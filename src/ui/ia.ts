// La IA de Chrome en la página (0.7.0, JST-232; spike de JST-230 y design-spec
// de JST-231): un solo `Escritor` por pestaña con lo del navegador: el
// `LanguageModel` de Chrome, la reserva en `localStorage` (las otras pestañas la
// reciben con el evento `storage`), el candado `oficina-ia` (Web Locks: una sola
// pestaña escribe), el avance de la bajada para las otras pestañas
// (`BroadcastChannel`) y el permiso del worker (`ia-permiso`).
//
// Escribe solo mientras hay un piso con la IA a la vista (la página en el
// computador o su modo TV; nunca el celular, el widget ni el enlace para un TV)
// y se eligió la IA con las conversaciones a la vista. `fuenteIa` es lo que usa
// el Guionista: con la IA lista o en pausa (0.8.1, JST-249: la pausa solo salta
// las ráfagas); si no, las frases de siempre.
import { useSyncExternalStore } from "react";
import { DICEN, fraseSuelta, type FuenteIa, type IdMascota, type MuestraFinal } from "../charlas.js";
import { accionPlugin } from "../fuentes.js";
import { Escritor, usaReserva, type EstadoIa, type ModeloIa, type SinApi } from "../ia/escritor.js";
import { FINALES_POR_PAQUETE, FINALES_POR_PAQUETE_CHICO } from "../ia/prompt.js";
import { anotarUso, CLAVE_RESERVA, conteoIa, fuenteDe, leerReserva, reservaVacia, type DatosReserva } from "../ia/reserva.js";
import { ajustes, alCambiarAjustes, type Ajustes } from "./ajustes.js";
import { instalacion } from "./audiosVoces.js";

/** Lo que da cada piso con la IA: lo que se le puede pedir (de su vida), los nombres que no puede decir y una empresa para las acciones del worker. */
export interface PedidosPiso {
  muestras: readonly MuestraFinal[];
  nombres: readonly string[];
  empresa: string | null;
}

/** Cada cuánto se mira si toca una ráfaga (y, si toca, el permiso del worker). */
const TIC_MS = 30_000;
/** 0.8.1 (JST-249): si hay un clon generando, el worker espera hasta tanto a que termine antes de decir que no. */
const ESPERA_PERMISO_MS = 15_000;

const pisos = new Set<() => PedidosPiso>();
let reserva: DatosReserva = reservaVacia();
let escritor: Escritor | null = null;
let canal: BroadcastChannel | null = null;
let reloj: ReturnType<typeof setInterval> | null = null;

/** Si la página corre en Google Chrome (no en otro navegador hecho con Chromium). */
function esChrome(): boolean {
  if (typeof navigator === "undefined") return false;
  const marcas = (navigator as Navigator & { userAgentData?: { brands?: Array<{ brand: string }> } }).userAgentData?.brands ?? [];
  return marcas.some((m) => m.brand === "Google Chrome") || (/Chrome\//.test(navigator.userAgent) && !/Edg\/|OPR\/|Brave/.test(navigator.userAgent));
}

/** Por qué no hay `LanguageModel` aquí: celular, otro navegador, Chrome sin el flag (http) o un Chrome que no la trae. */
export function sinApiAqui(): SinApi {
  if (typeof window === "undefined") return "otro";
  if (window.matchMedia?.("(max-width: 767px)").matches || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)) return "celular";
  if (!esChrome()) return "otro";
  return window.isSecureContext ? "vieja" : "insegura";
}

/**
 * Cómo se llama la IA en los textos. Fuera de Chrome también puede haber un `LanguageModel`: otro navegador que
 * lo trae, o una app que muestra Paperclip con el modelo de su sistema (Paperclip Dispatch, con el de Apple).
 * Ahí no es «la IA de Chrome» ni se baja con Chrome: es la IA del computador.
 */
export const IA_CHROME = esChrome();
export const NOMBRE_IA = IA_CHROME ? "IA de Chrome" : "IA del computador";

function modeloAqui(): ModeloIa | null {
  const lm = (globalThis as { LanguageModel?: ModeloIa }).LanguageModel;
  return lm && typeof lm.availability === "function" && typeof lm.create === "function" ? lm : null;
}

/** 0.9.0 (JST-246): el `LanguageModel` de Chrome, para el Resumen (o `null`). */
export const modeloIa = modeloAqui;

const nombresDeAhora = (): string[] => [...new Set([...pisos].flatMap((p) => p().nombres))];

function cargarReserva(): DatosReserva {
  try {
    return leerReserva(localStorage.getItem(CLAVE_RESERVA), Date.now(), nombresDeAhora());
  } catch {
    return reservaVacia();
  }
}

function guardarReserva(r: DatosReserva): void {
  reserva = r;
  try {
    localStorage.setItem(CLAVE_RESERVA, JSON.stringify(r));
  } catch {
    // Sin almacenamiento local: la reserva vale solo para esta pestaña.
  }
  avisar();
}

const visible = () => typeof document !== "undefined" && document.visibilityState === "visible" && pisos.size > 0;
const quiere = (a: Ajustes = ajustes()) => a.iaFuente === "ia" && a.charlas;

/** `null` mientras no se le puede preguntar al worker: el piso todavía no tiene sus agentes (no es «En pausa»). */
async function permiso(): Promise<boolean | null> {
  const empresa = [...pisos].map((p) => p().empresa).find((e) => !!e) ?? null;
  const id = await instalacion().catch(() => null);
  if (!id || !empresa) return null;
  const r = await accionPlugin<{ escribir: boolean }>({ base: "" }, id, "ia-permiso", empresa, { ms: ESPERA_PERMISO_MS }).catch(() => null);
  return !!r?.escribir;
}

async function candado<T>(fn: () => Promise<T>): Promise<T | null> {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  if (!locks) return fn();
  return locks.request("oficina-ia", { ifAvailable: true }, async (lock) => (lock ? fn() : null)) as Promise<T | null>;
}

/** 0.9.0: el mismo candado (una sola pestaña usa la IA a la vez); `null` si lo tiene otra pestaña o una ráfaga. */
export const candadoIa = candado;

/** El escritor de esta pestaña (se arma la primera vez que se pide). */
export function escritorIa(): Escritor {
  if (escritor) return escritor;
  reserva = cargarReserva();
  escritor = new Escritor({
    modelo: modeloAqui(),
    sinApi: sinApiAqui(),
    ahora: Date.now,
    visible,
    quiere: () => quiere(),
    permiso,
    candado,
    pedidos: () => {
      const todos = [...pisos].map((p) => p());
      return { muestras: todos.flatMap((p) => p.muestras), nombres: [...new Set(todos.flatMap((p) => p.nombres))] };
    },
    // Al día con lo que escribió otra pestaña (el evento `storage` ya la dejó en `reserva`).
    leer: () => structuredClone(reserva),
    guardar: guardarReserva,
    // Fuera de Chrome, la IA de la página es más chica que Gemini Nano (la de Apple en Paperclip Dispatch).
    finalesPorPaquete: IA_CHROME ? FINALES_POR_PAQUETE : FINALES_POR_PAQUETE_CHICO,
  });
  escritor.suscribir(avisar);
  if (typeof window !== "undefined") {
    window.addEventListener("storage", (e) => {
      if (e.key !== CLAVE_RESERVA) return;
      reserva = cargarReserva();
      avisar();
    });
    if (typeof BroadcastChannel !== "undefined") {
      canal = new BroadcastChannel("oficina-ia");
      canal.onmessage = (e: MessageEvent<{ avance?: number | null; lista?: boolean }>) => {
        if (e.data?.lista) void escritor?.revisar();
        else if (e.data && "avance" in e.data) escritor?.avanceDeOtra(e.data.avance ?? null);
      };
    }
    escritor.suscribir(() => {
      const s = escritor!.estado();
      if (s.k === "bajando" && esta.bajandoAqui) canal?.postMessage({ avance: s.avance });
    });
  }
  alCambiarAjustes(() => {
    avisar();
    void escritor?.tic();
  });
  void escritor.revisar();
  return escritor;
}

/** Lo que hace la bajada pedida en esta pestaña (para avisar a las otras). */
const esta = { bajandoAqui: false };

/** «Bajar la IA» / «Reintentar», desde el clic. Si estaba «Frases de siempre», elige la IA (JST-231 §3). */
export function bajarIa(): void {
  const e = escritorIa();
  esta.bajandoAqui = true;
  void e.bajar().then((ok) => {
    esta.bajandoAqui = false;
    canal?.postMessage(ok ? { lista: true } : { avance: null });
  });
}

/** Un piso con la IA (la página en el computador o su modo TV): mientras está montado, la pestaña puede escribir. */
export function registrarPisoIa(pedidos: () => PedidosPiso): () => void {
  const e = escritorIa();
  pisos.add(pedidos);
  if (!reloj && typeof window !== "undefined") {
    reloj = setInterval(() => void e.tic(), TIC_MS);
    document.addEventListener("visibilitychange", alVolver);
    setTimeout(() => void e.tic(), 0);
  }
  return () => {
    pisos.delete(pedidos);
    if (pisos.size > 0 || !reloj) return;
    clearInterval(reloj);
    reloj = null;
    document.removeEventListener("visibilitychange", alVolver);
  };
}

function alVolver(): void {
  if (document.visibilityState === "visible") void escritor?.tic();
}

// ---------------------------------------------------------------------------
// Para React
// ---------------------------------------------------------------------------

const oyentes = new Set<() => void>();
export interface ContadorIa {
  escritas: number;
  dichas: number;
  deIa: number;
}
let foto: { estado: EstadoIa; finales: number; sueltas: number; contador: ContadorIa } | null = null;

function avisar(): void {
  foto = null;
  for (const o of oyentes) o();
}

function fotoIa() {
  if (!foto) {
    const e = escritorIa();
    const otras = Object.values(reserva.aperturas).flat().length + reserva.bromas.length + Object.values(reserva.mascotas).flat().length;
    foto = {
      estado: e.estado(),
      finales: Object.values(reserva.finales).reduce((n, l) => n + l.length, otras),
      sueltas: reserva.sueltas.length,
      contador: conteoIa(reserva, Date.now()),
    };
  }
  return foto;
}

const suscribir = (o: () => void) => {
  oyentes.add(o);
  return () => oyentes.delete(o);
};

const SIN_IA: EstadoIa = { k: "sin", por: "celular" };

export function useEstadoIa(activo = true): EstadoIa {
  return useSyncExternalStore(suscribir, () => (activo ? fotoIa().estado : SIN_IA));
}

export function useIaActiva(activo = true): boolean {
  return useSyncExternalStore(suscribir, () => activo && usaReserva(fotoIa().estado));
}

const CONTADOR_SIN: ContadorIa = { escritas: 0, dichas: 0, deIa: 0 };
export function useContadorIa(activo = true): ContadorIa {
  return useSyncExternalStore(suscribir, () => (activo ? fotoIa().contador : CONTADOR_SIN));
}

/** Hay frases de la IA en la reserva (si no, aunque esté lista, van las de siempre hasta la primera ráfaga). */
export function hayReserva(): boolean {
  return fotoIa().finales + fotoIa().sueltas > 0;
}

/** Lo último que se mostró con algo de la IA, incluida la plantilla para revisar las aperturas ya rellenadas. */
interface Usada {
  t: number;
  tipo: "final" | "suelta" | "mascota";
  sala: string;
  variante: string | null;
  lineas: Array<{ texto: string; codigo: string | null }>;
  ia?: import("../charlas.js").FinalIa;
}
let usadas: Usada[] = [];

const fuente: FuenteIa = {
  ...fuenteDe(() => reserva),
  usado(tipo, lineas, variante, sala, ia) {
    const ahora = Date.now();
    const generada = tipo === "suelta" ? !fraseSuelta(lineas[0]?.texto ?? "") : tipo === "mascota" ? !DICEN[variante as IdMascota]?.includes(lineas[0]?.texto ?? "") : false;
    const r = structuredClone(reserva);
    const n = anotarUso(r, lineas, ia, generada, ahora);
    guardarReserva(r);
    if (n > 0) usadas = [...usadas, { t: ahora, tipo, sala, variante, lineas: lineas.map((l) => ({ texto: l.texto, codigo: l.codigo })), ...(ia ? { ia } : {}) }].slice(-60);
  },
};

/**
 * Lo que usa el Guionista de un piso con la IA: la reserva, si se eligió la
 * IA, las conversaciones se ven y la IA está lista o en pausa (la pausa solo
 * salta las ráfagas, JST-249); si no, `null` (las frases de siempre).
 */
export function fuenteIa(a: Ajustes = ajustes()): FuenteIa | null {
  return quiere(a) && usaReserva(escritorIa().estado()) ? fuente : null;
}

/** También registra y frena lo dicho con frases fijas mientras la IA elegida carga o no está disponible (JST-369). */
export function registroUsoIa(a: Ajustes = ajustes()): Pick<FuenteIa, "dicha" | "usado"> | null {
  return quiere(a) ? fuente : null;
}

/** Para la QA y el banco: el estado, lo que hay en la reserva, lo último que pasó y lo último que escribió. */
export function estadoIaParaPruebas() {
  const e = escritorIa();
  return {
    estado: e.estado(),
    escribe: e.escribe(),
    pisos: pisos.size,
    reserva: structuredClone(reserva),
    registro: e.registro,
    escritas: e.escritas,
    usadas,
    tic: () => e.tic(),
    rafaga: () => e.rafaga(),
  };
}

if (typeof window !== "undefined") (window as unknown as { __oficinaIa?: typeof estadoIaParaPruebas }).__oficinaIa = estadoIaParaPruebas;
