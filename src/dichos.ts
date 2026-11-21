// Lo que la oficina dice además de las frases de siempre (JST-415), sin React ni navegador: la duración de una
// tarea, el «quedé bloqueado», el recordatorio de espera, «mientras no estabas», las rachas de errores y la
// empresa sin nadie trabajando. Todo son funciones y clases puras: los tiempos los pone quien las usa (la
// vigía) y las pruebas (con relojes de mentira). Lo que se OYE va en español y sin `t()`.
import { duracionHablada, haceHablado } from "./duracion.js";

const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

// ---------------------------------------------------------------------------
// Cuándo empezó el agente la tarea (para «terminé en 12 minutos»)
// ---------------------------------------------------------------------------

interface RunMinimo {
  id: string;
  issueId: string | null;
  enCola: boolean;
  /** Cuándo empezó el run (`startedAt`; si falta, cuándo se creó). */
  desde: string | null;
}

/**
 * Recuerda, por agente, cuándo empezó a trabajar una tarea, mirando cada lectura de la página. La duración de
 * «terminé en…» va desde la PRIMERA vez que la vigía vio a ese agente empezar esa tarea y se conserva entre los
 * runs de la misma tarea (una tarea de 3 horas en varios runs no dice «terminé en 3 minutos»). Si la primera vez
 * que la vigía vio al agente ya estaba en esa tarea (la página se abrió a medias), el comienzo no se vio: no se
 * sabe y no se dice (`inicioDe` da `null`, jamás se inventa). Un run en cola no cuenta (todavía no empezó).
 */
export class InicioDeTareas {
  /** `desde: null`: el agente ya estaba en la tarea cuando se lo vio por primera vez. */
  private readonly porAgente = new Map<string, { issueId: string; desde: number | null }>();
  private readonly vistos = new Set<string>();

  observar(agentes: ReadonlyArray<{ id: string; run: RunMinimo | null }>): void {
    for (const a of agentes) {
      const primeraVez = !this.vistos.has(a.id);
      this.vistos.add(a.id);
      const r = a.run;
      if (!r || r.enCola || !r.issueId) continue;
      const ya = this.porAgente.get(a.id);
      if (ya && ya.issueId === r.issueId) continue;
      if (primeraVez) {
        // Ya trabajaba cuando se lo vio por primera vez: el comienzo no se vio.
        this.porAgente.set(a.id, { issueId: r.issueId, desde: null });
        continue;
      }
      const desde = r.desde ? Date.parse(r.desde) : NaN;
      if (Number.isNaN(desde)) continue;
      this.porAgente.set(a.id, { issueId: r.issueId, desde });
    }
  }

  /** Cuándo (ms) empezó ese agente esa tarea (visto de verdad), o `null` si no se sabe. */
  inicioDe(agenteId: string, issueId: string): number | null {
    const x = this.porAgente.get(agenteId);
    return x && x.issueId === issueId ? x.desde : null;
  }

  /** La vigía vio a ese agente trabajando en esa tarea (aunque no se sepa cuándo empezó). */
  vio(agenteId: string, issueId: string): boolean {
    return this.porAgente.get(agenteId)?.issueId === issueId;
  }

  limpiar(): void {
    this.porAgente.clear();
    this.vistos.clear();
  }
}

// ---------------------------------------------------------------------------
// Racha de errores
// ---------------------------------------------------------------------------

/** Los errores seguidos cuentan si caen dentro de este rato. */
export const VENTANA_RACHA_MS = 2 * HORA;
/** Desde cuántos errores seguidos se dice «tercer error seguido». */
export const MIN_RACHA = 3;

/** «tercer error seguido», «cuarto…», «quinto…» y de ahí «otro error seguido»; `null` con menos de 3 (o sin dato). */
export function textoRacha(n: number | null | undefined): string | null {
  if (!n || !Number.isInteger(n) || n < MIN_RACHA) return null;
  const ordinal = { 3: "tercer", 4: "cuarto", 5: "quinto" }[n];
  return ordinal ? `${ordinal} error seguido` : "otro error seguido";
}

/**
 * Qué racha pasa a la voz: solo desde `MIN_RACHA` (y con «hitos» permitidos). Con menos, `null`: el error va por el camino
 * de siempre (con su audio grabado, su 🔊 y agrupado con los demás), no por el de la frase libre.
 */
export function rachaParaVoz(n: number | null | undefined, hitos: boolean): number | null {
  return hitos && textoRacha(n) !== null ? (n as number) : null;
}

/**
 * Cuenta los errores seguidos de cada agente: los que caen dentro de `VENTANA_RACHA_MS` sin un run exitoso
 * entre medio. Solo ve lo que pasa con la página abierta.
 */
export class RachaErrores {
  private readonly fallos = new Map<string, Array<{ t: number; run: string | null }>>();

  /**
   * Un run falló: cuántos errores seguidos lleva ahora (1 es el primero). `runId`: el mismo run no cuenta dos veces
   * (Paperclip puede avisar su fallo más de una vez).
   */
  fallo(agenteId: string, ahora: number, runId: string | null = null): number {
    const lista = (this.fallos.get(agenteId) ?? []).filter((x) => ahora - x.t < VENTANA_RACHA_MS);
    if (!(runId && lista.some((x) => x.run === runId))) lista.push({ t: ahora, run: runId });
    this.fallos.set(agenteId, lista);
    return lista.length;
  }

  /** Un run terminó bien: se acabó la racha. */
  exito(agenteId: string): void {
    this.fallos.delete(agenteId);
  }

  limpiar(): void {
    this.fallos.clear();
  }
}

// ---------------------------------------------------------------------------
// Empresa sin nadie trabajando
// ---------------------------------------------------------------------------

export const MIN_TRABAJANDO = 2;
/** La empresa tuvo trabajo sostenido: pasaron al menos 10 min desde que empezó el primero hasta el último rato con alguien. */
export const TANDA_MIN_MS = 10 * MIN;
/** Y lleva al menos 3 min seguidos sin nadie (un latido que baja a 0 un instante no cuenta). */
export const CERO_MIN_MS = 3 * MIN;
/** De una misma empresa no se dice más de una vez cada 6 horas. */
export const SILENCIO_EMPRESA_MS = 6 * HORA;

/**
 * «Empresa: ya no queda nadie trabajando.» Se la mira con cuántos trabajan hoy en cada empresa (solo las que
 * se leyeron bien: una que no respondió no cuenta como vacía; un run en cola cuenta como alguien). Avisa si la empresa
 * tuvo trabajo sostenido (llegó a `MIN_TRABAJANDO` o más y duró 10 min), lleva 3 min seguidos en cero y no se dijo de
 * ella en las últimas 6 horas. Con latidos periódicos que suben y bajan, eso evita la frase cada hora.
 */
export class SinNadie {
  private readonly tandas = new Map<string, { inicio: number; ultimo: number; max: number }>();
  private readonly ceroDesde = new Map<string, number>();
  private readonly dicha = new Map<string, number>();

  /** `cuentas`: empresa → cuántos agentes trabajan ahora. Devuelve las empresas que acaban de quedar sin nadie. */
  observar(ahora: number, cuentas: ReadonlyMap<string, number>): string[] {
    const salen: string[] = [];
    for (const [empresa, n] of cuentas) {
      const tanda = this.tandas.get(empresa);
      if (n > 0) {
        this.ceroDesde.delete(empresa);
        if (!tanda) this.tandas.set(empresa, { inicio: ahora, ultimo: ahora, max: n });
        else {
          tanda.ultimo = ahora;
          tanda.max = Math.max(tanda.max, n);
        }
        continue;
      }
      // Sin tanda (ya estaba en cero al empezar a mirar): no hay nada que avisar.
      if (!tanda) continue;
      const desde = this.ceroDesde.get(empresa) ?? ahora;
      this.ceroDesde.set(empresa, desde);
      if (ahora - desde < CERO_MIN_MS) continue;
      this.tandas.delete(empresa);
      this.ceroDesde.delete(empresa);
      if (tanda.max < MIN_TRABAJANDO || tanda.ultimo - tanda.inicio < TANDA_MIN_MS) continue;
      const ultima = this.dicha.get(empresa);
      if (ultima !== undefined && ahora - ultima < SILENCIO_EMPRESA_MS) continue;
      this.dicha.set(empresa, ahora);
      salen.push(empresa);
    }
    return salen;
  }

  limpiar(): void {
    this.tandas.clear();
    this.ceroDesde.clear();
  }
}

/** «Alfa: ya no queda nadie trabajando.» Con varias empresas, una sola frase: «Alfa y Beta: ya no queda nadie trabajando.» */
export function textoSinNadie(empresas: string | readonly string[]): string {
  return `${lista(typeof empresas === "string" ? [empresas] : [...empresas])}: ya no queda nadie trabajando.`;
}

// ---------------------------------------------------------------------------
// Recordatorio de espera
// ---------------------------------------------------------------------------

/** Desde cuánto esperando se recuerda. */
export const ESPERA_RECORDAR_MS = 30 * MIN;
/** Las esperas de más de esto no se recuerdan nunca: la persona ya las conoce. */
export const ESPERA_MAX_RECORDAR_MS = DIA;
/** Cada espera se recuerda como mucho 3 veces: al pasar de 30 min, de 2 h y de 6 h esperando. */
export const UMBRALES_RECORDAR_MS: readonly number[] = [30 * MIN, 2 * HORA, 6 * HORA];
/** Si se acaba de decir un «te necesito», el recordatorio espera. */
export const SILENCIO_TRAS_TOCA_MS = 5 * MIN;
/** Dónde se guarda lo ya recordado (compartido entre pestañas y sobrevive a recargar). */
export const CLAVE_RECORDADOS = "jstm.oficina-pixel.recordados";
/** Lo recordado hace más de esto se olvida (una espera de más de 24 h ya no se recuerda de todos modos). */
export const PODA_RECORDADOS_MS = 48 * HORA;

interface AgenteConEspera {
  id: string;
  st: string;
  desde: string | null;
  teNecesita: ReadonlyArray<{ desde: string | null; itemId?: string; issueId?: string | null }>;
}

export interface Vencido<A> {
  agente: A;
  /** Hace cuánto espera esa espera. */
  ms: number;
  /** El lugar de esa espera en `agente.teNecesita`. */
  i: number;
  /** Cómo se identifica la espera: su ítem (o su tarea) más su `desde`. */
  clave: string;
  /** Cuántos umbrales de `UMBRALES_RECORDAR_MS` ya cumplió (1 a 3). */
  nivel: number;
}

/** Cuántos umbrales de recordatorio cumple una espera de `ms` (0 si todavía no llega al primero). */
export function nivelDeEspera(ms: number): number {
  return UMBRALES_RECORDAR_MS.filter((u) => ms >= u).length;
}

/** La espera se identifica por lo que traiga `teNecesita` (id del ítem o de la tarea) más su `desde`. */
export function claveDeEspera(agenteId: string, e: { desde: string | null; itemId?: string; issueId?: string | null }): string {
  return `${agenteId}|${e.itemId || e.issueId || ""}|${e.desde ?? ""}`;
}

/**
 * Las esperas que están en la ventana de recordatorio: de entre 30 minutos y 24 horas, la más antigua primero. Una
 * espera sin fecha no cuenta (no se sabe hace cuánto) ni las de más de 24 h. `viejo`: el criterio de «errores
 * viejos» de la página (un error de más de un día o silenciado no cuenta, y su espera tampoco).
 */
export function vencidos<A extends AgenteConEspera>(agentes: readonly A[], ahora: number, viejo: (a: A) => boolean): Array<Vencido<A>> {
  const salida: Array<Vencido<A>> = [];
  for (const agente of agentes) {
    if (viejo(agente)) continue;
    for (const [i, e] of agente.teNecesita.entries()) {
      const t = e.desde ? Date.parse(e.desde) : NaN;
      if (Number.isNaN(t)) continue;
      const ms = ahora - t;
      if (ms < ESPERA_RECORDAR_MS || ms > ESPERA_MAX_RECORDAR_MS) continue;
      salida.push({ agente, ms, i, clave: claveDeEspera(agente.id, e), nivel: nivelDeEspera(ms) });
    }
  }
  return salida.sort((a, b) => b.ms - a.ms);
}

/** ¿Alguna de esas esperas cruzó un umbral que aún no se le recordó? `recordados`: clave → hasta qué umbral (1 a 3). */
export function hayQueRecordar(ventana: ReadonlyArray<Pick<Vencido<unknown>, "clave" | "nivel">>, recordados: ReadonlyMap<string, number>): boolean {
  return ventana.some((v) => v.nivel > (recordados.get(v.clave) ?? 0));
}

/** Al decirlo, todas las esperas de la ventana quedan marcadas hasta el umbral que ya cumplieron. */
export function marcarRecordadas(ventana: ReadonlyArray<Pick<Vencido<unknown>, "clave" | "nivel">>, recordados: Map<string, number>): void {
  for (const v of ventana) recordados.set(v.clave, Math.max(v.nivel, recordados.get(v.clave) ?? 0));
}

/** De cada agente, su espera más antigua de la ventana (la que se nombra), la más antigua primero. */
export function unaPorAgente<A extends { id: string }>(ventana: ReadonlyArray<Vencido<A>>): Array<Vencido<A>> {
  const vistos = new Set<string>();
  return ventana.filter((v) => (vistos.has(v.agente.id) ? false : (vistos.add(v.agente.id), true)));
}

/** Dónde vive lo recordado: `localStorage` en el navegador, un objeto de mentira en las pruebas. */
export interface AlmacenTexto {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

/**
 * Lo ya recordado: clave de la espera → hasta qué umbral. Se comparte entre pestañas y sobrevive a recargar por el
 * almacenamiento (con try/catch: sin almacenamiento, queda en memoria de esta pestaña). Se poda lo de más de 48 h.
 */
export class RecordadosEspera {
  private memoria = new Map<string, { n: number; t: number }>();

  constructor(private readonly almacen: () => AlmacenTexto | null = () => (typeof localStorage === "undefined" ? null : localStorage)) {}

  /** Lee (fresco, por si otra pestaña lo cambió) y poda: clave → hasta qué umbral. */
  cargar(ahora: number): Map<string, number> {
    let guardado: Record<string, unknown> | null = null;
    try {
      const txt = this.almacen()?.getItem(CLAVE_RECORDADOS);
      if (txt != null) {
        const x = JSON.parse(txt) as unknown;
        guardado = x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
      }
    } catch {
      guardado = null;
    }
    if (guardado) {
      this.memoria = new Map();
      for (const [k, v] of Object.entries(guardado)) {
        const [n, t] = Array.isArray(v) ? v : [];
        if (typeof n === "number" && typeof t === "number" && ahora - t <= PODA_RECORDADOS_MS) this.memoria.set(k, { n, t });
      }
    } else {
      for (const [k, v] of this.memoria) if (ahora - v.t > PODA_RECORDADOS_MS) this.memoria.delete(k);
    }
    return new Map([...this.memoria].map(([k, v]) => [k, v.n]));
  }

  /** Guarda esas marcas (`desde`: de cuándo es cada espera, para podar). */
  guardar(ventana: ReadonlyArray<Pick<Vencido<unknown>, "clave" | "nivel">>, ahora: number): void {
    for (const v of ventana) {
      const ya = this.memoria.get(v.clave);
      this.memoria.set(v.clave, { n: Math.max(v.nivel, ya?.n ?? 0), t: ahora });
    }
    try {
      this.almacen()?.setItem(CLAVE_RECORDADOS, JSON.stringify(Object.fromEntries([...this.memoria].map(([k, v]) => [k, [v.n, v.t]]))));
    } catch {
      // Sin almacenamiento: vale en la memoria de esta pestaña.
    }
  }
}

/** ¿Toca recordar? `intervaloMs`: el del nivel (`null`: nunca). */
export function tocaRecordar(o: { intervaloMs: number | null; ahora: number; ultimoRecordatorio: number; ultimoToca: number }): boolean {
  if (o.intervaloMs == null) return false;
  return o.ahora - o.ultimoRecordatorio >= o.intervaloMs && o.ahora - o.ultimoToca >= SILENCIO_TRAS_TOCA_MS;
}

const cierra = (t: string) => (/[.?!]$/.test(t) ? t : `${t}.`);

/**
 * «Siguen esperándote 3. El más antiguo, Diseño, hace 2 horas, por Instalar la versión.» y, con uno solo,
 * «Diseño sigue esperándote hace 2 horas, por Instalar la versión.» `por`: lo que espera, ya armado («por …» o
 * «con la pregunta …»), o `null`. `items` va con el más antiguo primero.
 */
export function textoRecordatorio(items: ReadonlyArray<{ quien: string; ms: number; por: string | null }>): string | null {
  const primero = items[0];
  if (!primero) return null;
  const hace = haceHablado(primero.ms);
  if (!hace) return null;
  const por = primero.por ? `, ${primero.por}` : "";
  if (items.length === 1) return cierra(`${primero.quien} sigue esperándote ${hace}${por}`);
  return cierra(`Siguen esperándote ${items.length}. El más antiguo, ${primero.quien}, ${hace}${por}`);
}

// ---------------------------------------------------------------------------
// «Mientras no estabas»
// ---------------------------------------------------------------------------

/** Desde cuánto tiempo oculta la pestaña dice «mientras no estabas». */
export const AUSENCIA_MIN_MS = 15 * MIN;

export type TipoSuceso = "fin" | "error" | "bloq";

/**
 * Los sucesos que llegan por el canal en vivo mientras la pestaña está oculta (0 lecturas): una tarea que pasó a
 * terminada (cuenta una vez por tarea; las que pasan a revisión no), un run que falló (una vez por run) y una tarea
 * que quedó bloqueada (una vez por tarea).
 */
export class RegistroSucesos {
  private lista: Array<{ t: number; k: TipoSuceso; id: string }> = [];

  anotar(k: TipoSuceso, t: number, id: string): void {
    this.lista.push({ t, k, id });
    // Con la pestaña oculta días enteros no crece sin tope: se queda con lo de la última semana y 2000 sucesos.
    if (this.lista.length > 2000 || t - this.lista[0]!.t > 7 * DIA) this.lista = this.lista.filter((x) => t - x.t <= 7 * DIA).slice(-2000);
  }

  contar(desde: number, hasta: number): { terminaron: number; errores: number; bloqueados: number } {
    const fin = new Set<string>();
    const bloq = new Set<string>();
    const err = new Set<string>();
    for (const x of this.lista) {
      if (x.t < desde || x.t > hasta) continue;
      if (x.k === "fin") fin.add(x.id);
      else if (x.k === "bloq") bloq.add(x.id);
      else err.add(x.id);
    }
    return { terminaron: fin.size, errores: err.size, bloqueados: bloq.size };
  }

  limpiar(): void {
    this.lista = [];
  }
}

export interface DatosVolver {
  terminaron: number;
  bloqueados: number;
  /** Cuántos agentes empezaron a esperarte desde el inicio de la ausencia (`esperanDesde`); lo que ya esperaba no cuenta. */
  esperan: number;
  errores: number;
}

/**
 * Cuántos agentes tienen una espera NUEVA: con `desde` posterior a `inicio` (el comienzo de la ausencia o la última
 * visita). Las que ya esperaban antes no son novedad; una sin fecha tampoco (no se sabe si es de este rato).
 */
export function esperanDesde(agentes: ReadonlyArray<{ teNecesita: ReadonlyArray<{ desde: string | null }> }>, inicio: number): number {
  return agentes.filter((a) =>
    a.teNecesita.some((e) => {
      const t = e.desde ? Date.parse(e.desde) : NaN;
      return !Number.isNaN(t) && t > inicio;
    }),
  ).length;
}

export const hayQueContar = (d: DatosVolver): boolean => d.terminaron + d.bloqueados + d.esperan + d.errores > 0;

/** «las 3 y media», «las 3 menos cuarto», «la una y cuarto», «las 4» (la hora local, de 12 horas, a los 5 minutos). */
export function horaDicha(t: number): string {
  const d = new Date(t);
  let h = d.getHours();
  let m = Math.round(d.getMinutes() / 5) * 5;
  if (m === 60) {
    m = 0;
    h += 1;
  }
  const cual = (x: number) => ((x + 11) % 12) + 1;
  const art = (x: number) => (cual(x) === 1 ? "la una" : `las ${cual(x)}`);
  if (m === 0) return art(h);
  if (m === 15) return `${art(h)} y cuarto`;
  if (m === 30) return `${art(h)} y media`;
  if (m === 45) return `${art(h + 1)} menos cuarto`;
  return `${art(h)} y ${m}`;
}

/** Lo que va después de «desde»: «las 3 y media» (hoy), «ayer a las 3 y media», «hace 3 días» (antes). */
export function desdeDicho(t: number, ahora: number): string {
  const dia = (x: number) => new Date(new Date(x).getFullYear(), new Date(x).getMonth(), new Date(x).getDate()).getTime();
  const dias = Math.round((dia(ahora) - dia(t)) / DIA);
  if (dias <= 0) return horaDicha(t);
  if (dias === 1) return `ayer a ${horaDicha(t)}`;
  return `hace ${duracionHablada(ahora - t)}`;
}

const lista = (partes: string[]) => (partes.length <= 1 ? (partes[0] ?? "") : `${partes.slice(0, -1).join(", ")} y ${partes.at(-1)!}`);

/**
 * «Desde las 3 y media: 5 terminaron, 2 te esperan y hubo 1 error.» Solo con números reales: lo que es 0 no se
 * dice, y sin nada que contar da `null` (no dice nada).
 */
export function textoVolver(d: DatosVolver, desde: number, ahora: number): string | null {
  if (!hayQueContar(d)) return null;
  const partes: string[] = [];
  if (d.terminaron > 0) partes.push(d.terminaron === 1 ? "1 terminó" : `${d.terminaron} terminaron`);
  if (d.bloqueados > 0) partes.push(d.bloqueados === 1 ? "1 quedó bloqueado" : `${d.bloqueados} quedaron bloqueados`);
  if (d.esperan > 0) partes.push(d.esperan === 1 ? "1 te espera" : `${d.esperan} te esperan`);
  if (d.errores > 0) partes.push(d.errores === 1 ? "hubo 1 error" : `hubo ${d.errores} errores`);
  return `Desde ${desdeDicho(desde, ahora)}: ${lista(partes)}.`;
}
