// La reserva persistente de la IA de Chrome (0.13.0, JST-345): aperturas con
// huecos, finales, sueltas, bromas y mascotas. Se revisa de nuevo al leerla, se
// reemplazan primero las variantes más viejas y nada dicho en la última hora se
// vuelve a elegir. También guarda los contadores del panel y lo último escrito
// para que el próximo pedido pida explícitamente no repetirlo.
import type { FinalIa, FuenteIa, IdMascota, Linea } from "../charlas.js";
import { VERSION_PROMPT } from "./prompt.js";
import { casiIgual, normalizarFrase, revisarApertura, revisarBroma, revisarFinal, revisarMascota, revisarSuelta } from "./revision.js";

export const CLAVE_RESERVA = "jstm.oficina-pixel.ia";
export const POR_CLAVE = 12;
export const MAX_SUELTAS = 120;
export const MAX_CLAVES = 160;
export const VENCE_MS = 7 * 24 * 60 * 60_000;
export const CADA_MS = 15 * 60_000;
export const NO_REPITE_MS = 60 * 60_000;

interface Escrito {
  f: string[];
  en: number;
  /** La plantilla fija original, solo en aperturas: permite revisar sus huecos al recargar. */
  p?: string;
}

interface Uso {
  t: number;
  total: number;
  ia: number;
}

export interface DatosReserva {
  version: 1;
  prompt: string;
  aperturas: Record<string, Escrito[]>;
  finales: Record<string, Escrito[]>;
  sueltas: Escrito[];
  bromas: Escrito[];
  mascotas: Record<IdMascota, Escrito[]>;
  rafaga: number;
  /** Frases aceptadas desde que existe esta reserva (no variantes: una broma cuenta dos). */
  escritas: number;
  /** Cuándo se dijo cada texto generado, normalizado. */
  dichas: Record<string, number>;
  usos: Uso[];
}

const mascotasVacias = (): Record<IdMascota, Escrito[]> => ({ gato: [], perro: [], conejo: [], robot: [] });
export const reservaVacia = (): DatosReserva => ({
  version: 1,
  prompt: VERSION_PROMPT,
  aperturas: {},
  finales: {},
  sueltas: [],
  bromas: [],
  mascotas: mascotasVacias(),
  rafaga: 0,
  escritas: 0,
  dichas: {},
  usos: [],
});

function fijasDeClave(clave: string): Array<{ texto: string }> {
  const partes = clave.split("|")[1]?.split("/") ?? [];
  return partes.map((p) => ({ texto: p }));
}

const esEscrito = (e: unknown, ahora: number): e is Escrito =>
  !!e &&
  typeof e === "object" &&
  Array.isArray((e as Escrito).f) &&
  (e as Escrito).f.length > 0 &&
  (e as Escrito).f.every((t) => typeof t === "string") &&
  typeof (e as Escrito).en === "number" &&
  ahora - (e as Escrito).en <= VENCE_MS;

/** Lo guardado, revisado: una versión vieja o rota se bota; cada frase vuelve a pasar la revisión. */
export function leerReserva(texto: string | null, ahora: number, nombres: readonly string[] = []): DatosReserva {
  let g: Partial<DatosReserva> | null = null;
  try {
    g = texto ? (JSON.parse(texto) as Partial<DatosReserva>) : null;
  } catch {
    g = null;
  }
  const r = reservaVacia();
  if (!g || g.version !== 1 || g.prompt !== VERSION_PROMPT) return r;
  r.rafaga = typeof g.rafaga === "number" && Number.isFinite(g.rafaga) ? g.rafaga : 0;
  r.escritas = typeof g.escritas === "number" && Number.isFinite(g.escritas) ? Math.max(0, Math.floor(g.escritas)) : 0;
  if (g.dichas && typeof g.dichas === "object") {
    for (const [t, en] of Object.entries(g.dichas)) if (typeof en === "number" && ahora - en <= NO_REPITE_MS && en <= ahora) r.dichas[t] = en;
  }
  if (Array.isArray(g.usos)) {
    const hoy = new Date(ahora).toDateString();
    r.usos = g.usos.filter(
      (u): u is Uso => !!u && typeof u.t === "number" && new Date(u.t).toDateString() === hoy && typeof u.total === "number" && typeof u.ia === "number",
    ).slice(-2000);
  }
  const lista = (xs: unknown, max: number, vale: (e: Escrito) => boolean): Escrito[] => {
    const out: Escrito[] = [];
    if (!Array.isArray(xs)) return out;
    for (const e of xs) {
      if (!esEscrito(e, ahora) || !vale(e) || out.some((x) => casiIgual(x.f.join(" "), e.f.join(" ")))) continue;
      out.push({ f: [...e.f], en: e.en, ...(typeof e.p === "string" ? { p: e.p } : {}) });
    }
    return out.slice(-max);
  };
  if (g.aperturas && typeof g.aperturas === "object") {
    for (const [variante, xs] of Object.entries(g.aperturas)) {
      const ok = lista(xs, POR_CLAVE, (e) => e.f.length === 1 && typeof e.p === "string" && revisarApertura(e.f[0]!, e.p, nombres).length === 0);
      if (ok.length) r.aperturas[variante] = ok;
    }
  }
  if (g.finales && typeof g.finales === "object") {
    for (const [clave, xs] of Object.entries(g.finales)) {
      if (!clave.includes("|")) continue;
      const ok = lista(xs, POR_CLAVE, (e) => revisarFinal(e.f, fijasDeClave(clave), nombres).length === 0);
      if (ok.length) r.finales[clave] = ok;
    }
  }
  r.sueltas = lista(g.sueltas, MAX_SUELTAS, (e) => e.f.length === 1 && revisarSuelta(e.f[0]!, nombres).length === 0);
  r.bromas = lista(g.bromas, POR_CLAVE, (e) => revisarBroma(e.f, nombres).length === 0);
  for (const id of Object.keys(r.mascotas) as IdMascota[]) {
    r.mascotas[id] = lista(g.mascotas?.[id], POR_CLAVE, (e) => e.f.length === 1 && revisarMascota(id, e.f[0]!, nombres).length === 0);
  }
  return r;
}

function podarClaves(grupo: Record<string, Escrito[]>): void {
  const claves = Object.keys(grupo);
  for (const k of claves.slice(0, Math.max(0, claves.length - MAX_CLAVES))) delete grupo[k];
}

function todas(r: DatosReserva): Escrito[] {
  return [...Object.values(r.aperturas).flat(), ...Object.values(r.finales).flat(), ...r.sueltas, ...r.bromas, ...Object.values(r.mascotas).flat()];
}

function sumar(r: DatosReserva, grupo: Escrito[], frases: readonly string[], ahora: number, max: number, p?: string): { lista: Escrito[]; ok: boolean } {
  const texto = frases.join(" ");
  if (todas(r).some((e) => casiIgual(e.f.join(" "), texto))) return { lista: grupo, ok: false };
  return { lista: [...grupo, { f: [...frases], en: ahora, ...(p !== undefined ? { p } : {}) }].slice(-max), ok: true };
}

export function sumarApertura(r: DatosReserva, variante: string, plantilla: string, texto: string, ahora: number): boolean {
  const out = sumar(r, r.aperturas[variante] ?? [], [texto], ahora, POR_CLAVE, plantilla);
  if (!out.ok) return false;
  delete r.aperturas[variante];
  r.aperturas[variante] = out.lista;
  podarClaves(r.aperturas);
  r.escritas += 1;
  return true;
}

export function sumarFinal(r: DatosReserva, clave: string, frases: readonly string[], ahora: number): boolean {
  const out = sumar(r, r.finales[clave] ?? [], frases, ahora, POR_CLAVE);
  if (!out.ok) return false;
  delete r.finales[clave];
  r.finales[clave] = out.lista;
  podarClaves(r.finales);
  r.escritas += frases.length;
  return true;
}

export function sumarSuelta(r: DatosReserva, texto: string, ahora: number): boolean {
  const out = sumar(r, r.sueltas, [texto], ahora, MAX_SUELTAS);
  if (!out.ok) return false;
  r.sueltas = out.lista;
  r.escritas += 1;
  return true;
}

export function sumarBroma(r: DatosReserva, frases: readonly string[], ahora: number): boolean {
  const out = sumar(r, r.bromas, frases, ahora, POR_CLAVE);
  if (!out.ok) return false;
  r.bromas = out.lista;
  r.escritas += frases.length;
  return true;
}

export function sumarMascota(r: DatosReserva, id: IdMascota, texto: string, ahora: number): boolean {
  const out = sumar(r, r.mascotas[id], [texto], ahora, POR_CLAVE);
  if (!out.ok) return false;
  r.mascotas[id] = out.lista;
  r.escritas += 1;
  return true;
}

export function cuantos(r: DatosReserva, clave: string): number {
  return r.finales[clave]?.length ?? 0;
}

export function tocaRafaga(r: DatosReserva, ahora: number): boolean {
  return r.rafaga <= 0 || ahora - r.rafaga >= CADA_MS || r.rafaga > ahora;
}

export function vacia(r: DatosReserva): boolean {
  return Object.keys(r.aperturas).length === 0 && Object.keys(r.finales).length === 0 && r.sueltas.length === 0 && r.bromas.length === 0;
}

/** Mientras alguna categoría conocida esté corta, la ráfaga escribe 4 paquetes; llena, vuelve a 2. */
export function corta(r: DatosReserva): boolean {
  const corto = (xs: readonly Escrito[]) => xs.length < POR_CLAVE;
  return (
    r.sueltas.length < MAX_SUELTAS ||
    corto(r.bromas) ||
    Object.values(r.aperturas).some(corto) ||
    Object.values(r.finales).some(corto) ||
    Object.values(r.mascotas).some(corto)
  );
}

/** Lo último que escribió, para el pedido de no repetir (las aperturas conservan sus huecos). */
export function recientes(r: DatosReserva, limite = 24): string[] {
  const todos: Escrito[] = [
    ...Object.values(r.aperturas).flat(),
    ...Object.values(r.finales).flat(),
    ...r.sueltas,
    ...r.bromas,
    ...Object.values(r.mascotas).flat(),
  ];
  return todos.sort((a, b) => b.en - a.en).flatMap((e) => e.f).slice(0, limite);
}

const dicha = (r: DatosReserva, textos: readonly string[], ahora: number): boolean => textos.some((t) => (r.dichas[normalizarFrase(t)] ?? -Infinity) > ahora - NO_REPITE_MS);
const elegir = <T>(lista: readonly T[], azar: () => number): T | null => (lista.length ? lista[Math.floor(azar() * lista.length)]! : null);

export function fuenteDe(r: () => DatosReserva, ahora: () => number = Date.now): FuenteIa {
  return {
    apertura(variante, azar) {
      const lista = (r().aperturas[variante] ?? []).filter((e) => !dicha(r(), e.f, ahora()));
      return elegir(lista, azar)?.f[0] ?? null;
    },
    final(clave, azar, evitar) {
      const lista = (r().finales[clave] ?? []).filter((e) => e.f.join(" ") !== evitar && !dicha(r(), e.f, ahora()));
      return elegir(lista, azar)?.f ?? null;
    },
    suelta(azar, recientes) {
      const lista = r().sueltas.filter((e) => !recientes.includes(e.f[0]!) && !dicha(r(), e.f, ahora()));
      return elegir(lista, azar)?.f[0] ?? null;
    },
    broma(azar) {
      const lista = r().bromas.filter((e) => !dicha(r(), e.f, ahora()));
      return elegir(lista, azar)?.f ?? null;
    },
    mascota(id, azar) {
      const lista = r().mascotas[id].filter((e) => !dicha(r(), e.f, ahora()));
      return elegir(lista, azar)?.f[0] ?? null;
    },
  };
}

/** Guarda lo mostrado: las frases generadas no vuelven en una hora y el panel calcula su proporción de hoy. */
export function anotarUso(r: DatosReserva, lineas: readonly Linea[], ia: FinalIa | undefined, sueltaOMascota: boolean, ahora: number): number {
  let generadas: string[] = [];
  if (sueltaOMascota) generadas = lineas.map((l) => l.texto);
  else if (ia?.broma) generadas = [...ia.frases];
  else if (ia) generadas = [...(ia.apertura ? [ia.apertura] : []), ...ia.frases];
  for (const t of generadas) r.dichas[normalizarFrase(t)] = ahora;
  for (const [t, en] of Object.entries(r.dichas)) if (ahora - en > NO_REPITE_MS || en > ahora) delete r.dichas[t];
  r.usos = [...r.usos, { t: ahora, total: lineas.length, ia: generadas.length }].slice(-2000);
  return generadas.length;
}

export function conteoIa(r: DatosReserva, ahora: number): { escritas: number; dichas: number; deIa: number } {
  const hoy = new Date(ahora).toDateString();
  const usos = r.usos.filter((u) => new Date(u.t).toDateString() === hoy);
  return { escritas: r.escritas, dichas: usos.reduce((n, u) => n + u.total, 0), deIa: usos.reduce((n, u) => n + u.ia, 0) };
}
