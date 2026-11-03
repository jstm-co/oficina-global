// La IA de Chrome escribe (0.13.0, JST-345), sin React ni DOM: el estado de la
// IA, la bajada con el clic y las ráfagas que llenan la reserva. Todo lo de
// afuera llega en `DepsEscritor` (`src/ui/ia.ts` pone `LanguageModel`, el worker,
// el candado entre pestañas y `localStorage`; las pruebas, uno falso).
//
// - **Ráfagas:** cada 15 min (contando la última de cualquier pestaña), solo
//   con la Oficina a la vista, la IA elegida y lista, las conversaciones a la
//   vista, el candado `oficina-ia` (una sola pestaña escribe) y el permiso del
//   worker (la Mac no está cargada ni hay un clon generando). Cada ráfaga abre
//   la sesión, escribe 2 paquetes (4 mientras la reserva esté corta, los últimos 2 solo de sueltas) y la suelta.
//   Cada pedido tiene un tope de 30 s y de 1.500 letras.
// - **«En pausa»** (0.8.1, JST-249; punto 5 del spike): una ráfaga que toca y
//   no tiene permiso espera; se vuelve a preguntar en cada tic hasta que la Mac
//   se libera. Solo se salta la ráfaga: lo que la IA ya escribió se sigue
//   usando (`usaReserva`). Sin ráfaga pendiente no hay pausa.
// - **Sin pedirlo, nada:** con «Frases de siempre» o las conversaciones ocultas
//   no se abre ninguna sesión, y el modelo solo se baja con «Bajar la IA».
// - Si algo falla o tarda, no se avisa: van las frases de siempre y se vuelve a
//   intentar en la próxima ráfaga.
import type { MuestraFinal } from "../charlas.js";
import { armarPaquete, EJEMPLO_PEDIDO, EJEMPLO_RESPUESTA, FINALES_POR_PAQUETE, leerPaquete, SISTEMA, SUELTAS_POR_PAQUETE, type Botada } from "./prompt.js";
import { corta, cuantos, recientes, sumarApertura, sumarBroma, sumarFinal, sumarMascota, sumarSuelta, tocaRafaga, type DatosReserva } from "./reserva.js";

export type Disponibilidad = "unavailable" | "downloadable" | "downloading" | "available";

/** Lo que pide la Oficina: texto en español, de entrada y de salida. */
export const OPCIONES_MODELO = {
  expectedInputs: [{ type: "text", languages: ["es"] }],
  expectedOutputs: [{ type: "text", languages: ["es"] }],
} as const;

/** Lo que se usa de una sesión de `LanguageModel`. */
export interface SesionIa {
  clone(o?: { signal?: AbortSignal }): Promise<SesionIa>;
  promptStreaming(texto: string, o: { responseConstraint?: unknown; signal?: AbortSignal }): AsyncIterable<string> | ReadableStream<string>;
  destroy(): void;
}

/** Lo que se usa de `LanguageModel` (la Prompt API de Chrome). */
export interface ModeloIa {
  availability(o: typeof OPCIONES_MODELO): Promise<Disponibilidad>;
  create(o: typeof OPCIONES_MODELO & { initialPrompts?: ReadonlyArray<{ role: string; content: string }>; monitor?: (m: EventTarget) => void; signal?: AbortSignal; temperature?: number }): Promise<SesionIa>;
}

/** Por qué no hay IA: el celular, otro navegador, Chrome sin el flag de la dirección (http) o un Chrome que no la trae. */
export type SinApi = "celular" | "otro" | "insegura" | "vieja";

export type EstadoIa =
  | { k: "revisando" }
  | { k: "sin"; por: SinApi | "no-disponible" }
  | { k: "bajar" }
  | { k: "bajando"; avance: number | null }
  | { k: "fallo" }
  | { k: "pausa" }
  | { k: "lista" };

/**
 * Se usa lo que la IA ya escribió: lista o en pausa (0.8.1, JST-249). La pausa
 * solo frena las ráfagas nuevas (cuidan la GPU de la Mac); leer la reserva no
 * le cuesta nada.
 */
export const usaReserva = (e: EstadoIa): boolean => e.k === "lista" || e.k === "pausa";

/** Lo que va quedando, para `window.__oficinaIa()` (la QA y el banco). */
export type EventoIa =
  | { t: number; tipo: "rafaga"; paquetes: number }
  | { t: number; tipo: "sesion"; ms: number }
  | { t: number; tipo: "paquete"; ms: number; pedidos: number; aperturas: number; finales: number; sueltas: number; bromas: number; mascotas: number; botadas: Botada[]; corte: "tope" | "largo" | null; error: string | null }
  | { t: number; tipo: "saltada"; por: "pausa" | "candado" | "oculta" | "sin-permiso" }
  | { t: number; tipo: "error"; donde: string; mensaje: string }
  | { t: number; tipo: "bajada"; ok: boolean; ms: number };

/** Lo que escribió y pasó la revisión (para mostrar ejemplos con sus frases fijas). */
export interface Escrita {
  t: number;
  tipo: "apertura" | "final" | "suelta" | "broma" | "mascota";
  fijas: readonly string[];
  frases: readonly string[];
  variante: string | null;
}

export interface DepsEscritor {
  /** `LanguageModel`, o `null` si no está (`sinApi` dice por qué). */
  modelo: ModeloIa | null;
  sinApi: SinApi;
  ahora: () => number;
  /** La Oficina se ve (la pestaña a la vista y una página con la IA montada). */
  visible: () => boolean;
  /** Se eligió la IA y las conversaciones se ven: si no, no se abre ninguna sesión. */
  quiere: () => boolean;
  /**
   * El worker deja escribir: la Mac no está cargada y no hay un clon generando
   * (si hay uno, el worker espera unos segundos a que termine antes de decir que
   * no). `null`: todavía no se le puede preguntar (el piso aún no tiene sus
   * agentes): no cambia nada y se vuelve a preguntar en el próximo tic.
   */
  permiso: () => Promise<boolean | null>;
  /** Corre `fn` con el candado `oficina-ia` si está libre; `null` si lo tiene otra pestaña. */
  candado: <T>(fn: () => Promise<T>) => Promise<T | null>;
  /** Lo que se le puede pedir ahora (de la vida de la página) y los nombres que no puede decir. */
  pedidos: () => { muestras: readonly MuestraFinal[]; nombres: readonly string[] };
  /** La reserva de ahora (la guardada, al día con las otras pestañas) y guardarla. */
  leer: () => DatosReserva;
  guardar: (r: DatosReserva) => void;
  /** Hasta cuántos finales por paquete (de 1 a 8): menos con un modelo más chico que Gemini Nano. */
  finalesPorPaquete?: number;
  azar?: () => number;
}

/** Tope de cada pedido (3 de 67 llamadas se desbocaron en el spike; una siguió 5,5 min) y de lo que escribe. */
export const TOPE_PEDIDO_MS = 30_000;
export const TOPE_LETRAS = 1_500;
/** Cargar el modelo tardó 9–31 s (una vez 5 min con el swap lleno): más de 2 min, se salta la ráfaga. */
export const TOPE_SESION_MS = 120_000;
/**
 * Mientras una ráfaga espera el permiso («En pausa»), como mucho cada cuánto se vuelve a preguntar: en la práctica, en
 * cada tic (30 s). Antes era cada minuto y para todo; con las voces, casi siempre caía en un clon (JST-249).
 */
export const PERMISO_MS = 20_000;
/** Cada cuánto se vuelve a preguntar a Chrome si la IA está (por si se borró o la apagó una política). */
export const REVISAR_MS = 300_000;
/** Mientras Chrome baja el modelo sin que esta pestaña lo vea, cada cuánto se vuelve a mirar. */
export const REVISAR_BAJANDO_MS = 10_000;
/** Lo que se guarda para `window.__oficinaIa()`. */
const MAX_REGISTRO = 80;
const MAX_ESCRITAS = 60;

/** Lee lo que escribe la IA de a trozos (Chrome da un `ReadableStream`, que también se puede recorrer). */
async function* trozos(s: AsyncIterable<string> | ReadableStream<string>): AsyncGenerator<string> {
  if (Symbol.asyncIterator in s) {
    for await (const t of s as AsyncIterable<string>) yield t;
    return;
  }
  const r = (s as ReadableStream<string>).getReader();
  for (;;) {
    const { value, done } = await r.read();
    if (done) return;
    yield value;
  }
}

export class Escritor {
  private disp: Disponibilidad | null = null;
  private avance: number | null = null;
  private fallo = false;
  private pausa = false;
  private bajandoAqui = false;
  private escribiendo = false;
  /** Hay una pregunta al worker sin respuesta (el worker puede tardar hasta ~15 s si hay un clon generando). */
  private preguntando = false;
  private revisadoEn = -Infinity;
  private permisoEn = -Infinity;
  private readonly oyentes = new Set<() => void>();
  private readonly alListaOyentes = new Set<() => void>();
  private readonly azar: () => number;
  registro: EventoIa[] = [];
  escritas: Escrita[] = [];

  constructor(private readonly d: DepsEscritor) {
    this.azar = d.azar ?? Math.random;
  }

  /** El estado para el menú y el botón (design-spec de JST-231 §4). */
  estado(): EstadoIa {
    if (!this.d.modelo) return { k: "sin", por: this.d.sinApi };
    if (this.bajandoAqui) return { k: "bajando", avance: this.avance };
    if (this.fallo && this.disp !== "available") return { k: "fallo" };
    switch (this.disp) {
      case null:
        return { k: "revisando" };
      case "unavailable":
        return { k: "sin", por: "no-disponible" };
      case "downloadable":
        return { k: "bajar" };
      case "downloading":
        return { k: "bajando", avance: this.avance };
      case "available":
        return this.pausa ? { k: "pausa" } : { k: "lista" };
    }
  }

  /** La IA escribe: elegida, lista (no en pausa) y con las conversaciones a la vista. */
  escribe(): boolean {
    return this.d.quiere() && this.estado().k === "lista";
  }

  suscribir = (o: () => void): (() => void) => {
    this.oyentes.add(o);
    return () => this.oyentes.delete(o);
  };

  /** Al terminar una bajada pedida en esta pestaña (el toast «La IA de Chrome está lista»). */
  alLista(o: () => void): () => void {
    this.alListaOyentes.add(o);
    return () => this.alListaOyentes.delete(o);
  }

  private avisar(): void {
    for (const o of this.oyentes) o();
  }

  private anotar(e: EventoIa): void {
    this.registro = [...this.registro, e].slice(-MAX_REGISTRO);
  }

  /** Pregunta a Chrome si la IA está (`availability()` no abre ninguna sesión ni baja nada). */
  async revisar(): Promise<void> {
    const m = this.d.modelo;
    if (!m) return;
    this.revisadoEn = this.d.ahora();
    let disp: Disponibilidad;
    try {
      disp = await m.availability(OPCIONES_MODELO);
    } catch {
      disp = "unavailable";
    }
    if (disp === "available") this.fallo = false;
    if (disp !== this.disp) {
      this.disp = disp;
      if (disp !== "downloading") this.avance = null;
      this.avisar();
    }
  }

  /**
   * «Bajar la IA» (o «Reintentar»): con el clic del usuario, porque Chrome lo
   * pide para empezar la bajada. Abre una sesión solo para bajarla y la suelta
   * al tiro. `true` si quedó lista.
   */
  async bajar(): Promise<boolean> {
    const m = this.d.modelo;
    if (!m || this.bajandoAqui) return false;
    this.bajandoAqui = true;
    this.fallo = false;
    this.avance = 0;
    this.avisar();
    const t0 = this.d.ahora();
    try {
      const s = await m.create({
        ...OPCIONES_MODELO,
        monitor: (mon) =>
          mon.addEventListener("downloadprogress", (e) => {
            const p = (e as Event & { loaded?: number }).loaded;
            if (typeof p === "number" && Number.isFinite(p)) {
              this.avance = Math.max(0, Math.min(1, p));
              this.avisar();
            }
          }),
      });
      s.destroy();
      this.bajandoAqui = false;
      this.disp = "available";
      this.avance = null;
      this.anotar({ t: this.d.ahora(), tipo: "bajada", ok: true, ms: this.d.ahora() - t0 });
      this.avisar();
      for (const o of this.alListaOyentes) o();
      return true;
    } catch (e) {
      this.bajandoAqui = false;
      this.fallo = true;
      this.avance = null;
      this.anotar({ t: this.d.ahora(), tipo: "bajada", ok: false, ms: this.d.ahora() - t0 });
      this.anotar({ t: this.d.ahora(), tipo: "error", donde: "bajar", mensaje: String((e as Error)?.message ?? e).slice(0, 200) });
      await this.revisar();
      this.avisar();
      return false;
    }
  }

  /** El avance de una bajada que lleva otra pestaña (por `BroadcastChannel`). */
  avanceDeOtra(p: number | null): void {
    if (this.bajandoAqui || !this.d.modelo) return;
    this.disp = "downloading";
    this.avance = p;
    this.avisar();
  }

  /**
   * Lo que se hace cada ~30 s (y al volver a la pestaña): mirar el estado y, si
   * toca una ráfaga, pedir permiso al worker y escribir. Nunca abre una sesión
   * sin la IA elegida y las conversaciones a la vista. Al worker solo se le
   * pregunta cuando toca una ráfaga (antes, cada minuto aunque no tocara).
   */
  async tic(): Promise<void> {
    if (!this.d.modelo || this.bajandoAqui) return;
    const ahora = this.d.ahora();
    if (this.disp === null || (this.disp === "downloading" && ahora - this.revisadoEn >= REVISAR_BAJANDO_MS) || ahora - this.revisadoEn >= REVISAR_MS) await this.revisar();
    if (this.disp !== "available" || !this.d.quiere() || !this.d.visible() || this.escribiendo || this.preguntando) return;
    // «En pausa» es una ráfaga que espera a la Mac: sin ráfaga pendiente (otra pestaña ya escribió), no hay pausa.
    if (!tocaRafaga(this.d.leer(), this.d.ahora())) return this.fijarPausa(false);
    if (ahora - this.permisoEn < PERMISO_MS) return;
    if (!(await this.mirarPermiso())) return;
    await this.rafaga(true);
  }

  /** `null`: todavía no se le pudo preguntar al worker (sin «En pausa»: se pregunta otra vez en el próximo tic). */
  private async mirarPermiso(): Promise<boolean | null> {
    this.permisoEn = this.d.ahora();
    this.preguntando = true;
    let ok: boolean | null = false;
    try {
      ok = await this.d.permiso();
    } catch {
      ok = false;
    } finally {
      this.preguntando = false;
    }
    if (ok === null) {
      this.permisoEn = -Infinity;
      return null;
    }
    this.fijarPausa(!ok);
    return ok;
  }

  private fijarPausa(pausa: boolean): void {
    if (this.pausa === pausa) return;
    this.pausa = pausa;
    this.avisar();
  }

  /**
   * Una ráfaga: la sesión, 2 paquetes (4 mientras la reserva esté corta, los últimos 2 solo de sueltas) y soltarla.
   * `conPermiso`: el tic recién le preguntó al worker (no se le vuelve a preguntar).
   */
  async rafaga(conPermiso = false): Promise<void> {
    const m = this.d.modelo;
    if (!m || this.escribiendo) return;
    this.escribiendo = true;
    try {
      const hecho = await this.d.candado(async () => {
        // Otra pestaña pudo escribir mientras se esperaba el candado.
        if (!tocaRafaga(this.d.leer(), this.d.ahora()) || !this.d.quiere() || !this.d.visible()) return true;
        const ok = conPermiso || (await this.mirarPermiso());
        if (!ok) {
          this.anotar({ t: this.d.ahora(), tipo: "saltada", por: ok === null ? "sin-permiso" : "pausa" });
          return true;
        }
        const r = this.d.leer();
        const paquetes = Math.ceil(((corta(r, this.d.ahora()) ? 4 : 2) * FINALES_POR_PAQUETE) / this.finalesPorPaquete());
        r.rafaga = this.d.ahora();
        this.d.guardar(r);
        this.anotar({ t: this.d.ahora(), tipo: "rafaga", paquetes });
        const corte = new AbortController();
        const reloj = setTimeout(() => corte.abort(), TOPE_SESION_MS);
        const t0 = this.d.ahora();
        let base: SesionIa;
        try {
          base = await m.create({
            ...OPCIONES_MODELO,
            initialPrompts: [
              { role: "system", content: SISTEMA },
              { role: "user", content: EJEMPLO_PEDIDO },
              { role: "assistant", content: EJEMPLO_RESPUESTA },
            ],
            signal: corte.signal,
            temperature: 1.2,
          });
        } catch (e) {
          this.anotar({ t: this.d.ahora(), tipo: "error", donde: "sesión", mensaje: String((e as Error)?.message ?? e).slice(0, 200) });
          return true;
        } finally {
          clearTimeout(reloj);
        }
        this.anotar({ t: this.d.ahora(), tipo: "sesion", ms: this.d.ahora() - t0 });
        const pedidas = new Set<string>();
        try {
          for (let i = 0; i < paquetes; i++) {
            if (!this.d.quiere() || !this.d.visible()) {
              this.anotar({ t: this.d.ahora(), tipo: "saltada", por: "oculta" });
              break;
            }
            await this.paquete(base, pedidas, i === 0 ? "aperturas" : i >= 2 ? "sueltas" : "completo");
          }
        } finally {
          base.destroy();
        }
        return true;
      });
      if (hecho === null) this.anotar({ t: this.d.ahora(), tipo: "saltada", por: "candado" });
    } catch (e) {
      this.anotar({ t: this.d.ahora(), tipo: "error", donde: "ráfaga", mensaje: String((e as Error)?.message ?? e).slice(0, 200) });
    } finally {
      this.escribiendo = false;
      this.avisar();
    }
  }

  private finalesPorPaquete(): number {
    return Math.min(FINALES_POR_PAQUETE, Math.max(1, Math.round(this.d.finalesPorPaquete ?? FINALES_POR_PAQUETE)));
  }

  /** Los finales que se piden en un paquete: las claves que se pueden decir ahora con menos finales en la reserva, sin repetir en la ráfaga. */
  private elegir(muestras: readonly MuestraFinal[], pedidas: Set<string>, r: DatosReserva): MuestraFinal[] {
    const unicas = new Map<string, MuestraFinal>();
    for (const m of muestras) if (!pedidas.has(m.clave) && !unicas.has(m.clave)) unicas.set(m.clave, m);
    const lista = [...unicas.values()].map((m) => ({ m, n: cuantos(r, m.clave), z: this.azar() }));
    lista.sort((a, b) => a.n - b.n || a.z - b.z);
    return lista.slice(0, this.finalesPorPaquete()).map((x) => x.m);
  }

  /** Un paquete: una copia de la sesión, el pedido con su esquema (30 s y 1.500 letras como mucho), la revisión y a la reserva. */
  private async paquete(base: SesionIa, pedidas: Set<string>, modo: "aperturas" | "completo" | "sueltas"): Promise<void> {
    const { muestras, nombres } = this.d.pedidos();
    const actual = this.d.leer();
    const elegidas = modo === "sueltas" ? [] : this.elegir(muestras, pedidas, actual);
    if (modo === "completo") for (const m of elegidas) pedidas.add(m.clave);
    const porPaquete = modo === "sueltas" ? 20 : SUELTAS_POR_PAQUETE;
    const p = armarPaquete(elegidas, Math.ceil((porPaquete * this.finalesPorPaquete()) / FINALES_POR_PAQUETE), recientes(actual), modo === "aperturas", modo === "sueltas");
    const t0 = this.d.ahora();
    const corte = new AbortController();
    let por: "tope" | "largo" | null = null;
    const reloj = setTimeout(() => {
      por = "tope";
      corte.abort();
    }, TOPE_PEDIDO_MS);
    let salida = "";
    let error: string | null = null;
    let copia: SesionIa | null = null;
    try {
      copia = await base.clone({ signal: corte.signal });
      for await (const t of trozos(copia.promptStreaming(p.texto, { responseConstraint: p.esquema, signal: corte.signal }))) {
        salida += t;
        if (salida.length > TOPE_LETRAS) {
          por = "largo";
          corte.abort();
          break;
        }
      }
    } catch (e) {
      error = por ? null : String((e as Error)?.message ?? e).slice(0, 200);
    } finally {
      clearTimeout(reloj);
      copia?.destroy();
    }
    const leido = por || error ? null : leerPaquete(salida, p, nombres);
    const ahora = this.d.ahora();
    const botadas = [...(leido?.botadas ?? [])];
    const contador = { aperturas: 0, finales: 0, sueltas: 0, bromas: 0, mascotas: 0 };
    if (leido) {
      const r = this.d.leer();
      for (const f of leido.finales) {
        if (f.apertura) {
          if (sumarApertura(r, f.muestra.variante, f.muestra.apertura, f.apertura, ahora)) {
            contador.aperturas += 1;
            this.escritas.push({ t: ahora, tipo: "apertura", fijas: [f.muestra.fijas[0]!.texto], frases: [f.apertura], variante: f.muestra.variante });
          } else botadas.push({ id: f.id, tipo: "apertura", texto: f.apertura, motivos: ["casi igual a una de la reserva"] });
        }
        if (f.frases.length) {
          if (sumarFinal(r, f.clave, f.frases, ahora)) {
            contador.finales += 1;
            this.escritas.push({ t: ahora, tipo: "final", fijas: f.muestra.fijas.map((l) => l.texto), frases: f.frases, variante: f.muestra.variante });
          } else botadas.push({ id: f.id, tipo: "final", texto: f.frases.join(" / "), motivos: ["casi igual a una de la reserva"] });
        }
      }
      for (const s of leido.sueltas) {
        if (sumarSuelta(r, s, ahora)) {
          contador.sueltas += 1;
          this.escritas.push({ t: ahora, tipo: "suelta", fijas: [], frases: [s], variante: null });
        } else botadas.push({ id: "suelta", tipo: "suelta", texto: s, motivos: ["casi igual a una de la reserva"] });
      }
      for (const b of leido.bromas) {
        if (sumarBroma(r, b, ahora)) {
          contador.bromas += 1;
          this.escritas.push({ t: ahora, tipo: "broma", fijas: [], frases: b, variante: null });
        } else botadas.push({ id: "broma", tipo: "broma", texto: b.join(" / "), motivos: ["casi igual a una de la reserva"] });
      }
      for (const m of leido.mascotas) {
        if (sumarMascota(r, m.id, m.texto, ahora)) {
          contador.mascotas += 1;
          this.escritas.push({ t: ahora, tipo: "mascota", fijas: [], frases: [m.texto], variante: m.id });
        } else botadas.push({ id: m.id, tipo: "mascota", texto: m.texto, motivos: ["casi igual a una de la reserva"] });
      }
      this.escritas = this.escritas.slice(-MAX_ESCRITAS);
      this.d.guardar(r);
    }
    this.anotar({
      t: ahora,
      tipo: "paquete",
      ms: ahora - t0,
      pedidos: elegidas.length * 2 + p.sueltas.length + p.bromas.length + p.mascotas.size,
      ...contador,
      botadas,
      corte: por,
      error: error ?? leido?.error ?? null,
    });
  }
}
