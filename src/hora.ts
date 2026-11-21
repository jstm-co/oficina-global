// Hora estimada (0.5.0, design-spec de JST-163 §9, con el método del `spike`
// de JST-161 «Qué usa la 0.5.0»), sin React ni DOM: cuándo termina lo que el
// agente hace ahora (su run), con sus propios runs anteriores.
//
// - De sus últimos 30 runs terminados (`prev`) se toman los que duraron más que
//   lo que lleva el actual (`edad`). Si son 5 o más: hora = ahora + la mediana
//   de lo que les faltó. Si no: «lleva 2 h» (más de lo habitual, no hay una hora
//   confiable). Con menos de 5 runs terminados: sin dato (solo el código).
// - Se recalcula cada minuto en la página, sin lecturas. Al cargar se leen los
//   últimos 30 runs de cada agente (de a 4 a la vez, después de dibujar el
//   piso); después cada `heartbeat.run.status` del canal en vivo trae el inicio
//   y el fin del run que termina, y entra en `prev`. Un agente se vuelve a leer
//   solo si su empresa reconecta el canal, y como mucho 1 vez por hora: el tope
//   es 1 lectura por agente al cargar + 1 por agente y hora. Ninguna por globo.
// - JST-192: cada agente vuelve a decir su hora en su propio instante del
//   minuto, entre dos pasos de los rótulos: ningún globo la cambia a la vez que
//   otro ni que un rótulo (§8).
import { getLocale, localeTag, plural, SOURCE_LOCALE, t } from "./i18n.js";
import { PASO_SALA_MS } from "./rotulo.js";
import type { EventoVivo, RunResumen } from "./shared.js";

/** Cuántos runs terminados se miran (los últimos). */
export const RUNS_PREVIOS = 30;
/** Con menos runs terminados no hay dato, y hacen falta al menos estos más largos que lo que lleva para dar una hora. */
export const MIN_RUNS = 5;
/** Un agente se vuelve a leer (al reconectar su empresa) como mucho una vez por hora. */
export const RELEER_MS = 60 * 60_000;
/** Lecturas a la vez al cargar. */
export const A_LA_VEZ = 4;

export type Estimacion =
  /** Termina ≈`fin` (ms), según sus últimos `n` runs. */
  | { tipo: "hora"; fin: number; n: number }
  /** Ya dura más que `menos` de sus últimos `n` runs: no hay una hora confiable. */
  | { tipo: "lleva"; edad: number; n: number; menos: number }
  /** Tiene menos de 5 runs terminados. */
  | { tipo: "sin"; n: number };

function mediana(xs: readonly number[]): number {
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m]! : (o[m - 1]! + o[m]!) / 2;
}

/**
 * La estimación con las duraciones de sus runs terminados (ms, del más viejo al
 * más nuevo; se usan los últimos 30) y lo que lleva el run actual. Un run que
 * duró exactamente `edad` no cuenta: tiene que haber durado más.
 */
export function estimar(duraciones: readonly number[], edad: number, ahora: number): Estimacion {
  const prev = duraciones.slice(-RUNS_PREVIOS);
  if (prev.length < MIN_RUNS) return { tipo: "sin", n: prev.length };
  const faltan = prev.filter((d) => d > edad).map((d) => d - edad);
  if (faltan.length >= MIN_RUNS) return { tipo: "hora", fin: ahora + mediana(faltan), n: prev.length };
  return { tipo: "lleva", edad: Math.max(0, edad), n: prev.length, menos: prev.length - faltan.length };
}

// ---------------------------------------------------------------------------
// Cómo se dice (§9)
// ---------------------------------------------------------------------------

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const DIAS_LARGOS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
// En español, las tablas de siempre (cada navegador abrevia a su manera); en otro idioma, `Intl` (JST-413).
const nombreDia = (d: Date, weekday: "short" | "long") =>
  getLocale() === SOURCE_LOCALE ? (weekday === "short" ? DIAS : DIAS_LARGOS)[d.getDay()]! : new Intl.DateTimeFormat(localeTag(), { weekday }).format(d);

const reloj = (d: Date) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
const diaDe = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const diasEntre = (a: Date, b: Date) => Math.round((diaDe(b) - diaDe(a)) / 86_400_000);

/** «15:05» (24 h, sin cero inicial: «9:10»), o con el día si no es hoy: «vie 9:10». En la hora local del navegador. */
export function horaCorta(fin: number, ahora: number): string {
  const f = new Date(fin);
  return diasEntre(new Date(ahora), f) === 0 ? reloj(f) : `${nombreDia(f, "short")} ${reloj(f)}`;
}

/** «15:05», «mañana viernes a las 9:10» o «el lunes a las 9:10» (tooltip y ficha). */
function horaLarga(fin: number, ahora: number): string {
  const f = new Date(fin);
  const dias = diasEntre(new Date(ahora), f);
  if (dias === 0) return reloj(f);
  const dia = nombreDia(f, "long");
  return dias === 1 ? t("mañana {dia} a las {hora}", { dia, hora: reloj(f) }) : t("el {dia} a las {hora}", { dia, hora: reloj(f) });
}

/** «50 min» (bajo 1 h), «2 h», «1 día», «3 días». */
export function cuantoLleva(ms: number): string {
  const m = Math.max(1, Math.floor(ms / 60_000));
  if (m < 60) return t("{n} min", { n: m });
  if (m < 1440) return t("{n} h", { n: Math.floor(m / 60) });
  const d = Math.floor(m / 1440);
  return plural(d, "día", "días");
}

/** Lo que va en el piso de abajo del globo y en la pastilla del rótulo (después del ⏱): «≈15:05», «≈vie 9:10», «lleva 2 h». Sin dato: nada. */
export function textoGlobo(e: Estimacion | null, ahora: number): string | null {
  if (!e || e.tipo === "sin") return null;
  if (e.tipo === "lleva") return t("lleva {tiempo}", { tiempo: cuantoLleva(e.edad) });
  return `≈${horaCorta(e.fin, ahora)}`;
}

/** La frase del tooltip y del lector de pantalla (nunca se corta). */
export function textoTooltip(e: Estimacion | null, ahora: number): string | null {
  if (!e) return null;
  if (e.tipo === "sin") return t("sin hora estimada (todavía tiene menos de 5 runs terminados)");
  if (e.tipo === "lleva") return t("lleva {tiempo}: más de lo habitual, no hay una hora confiable", { tiempo: cuantoLleva(e.edad) });
  return t("termina ≈{cuando}, según sus últimos runs", { cuando: horaLarga(e.fin, ahora) });
}

/** La línea de la ficha. */
export function textoFicha(e: Estimacion | null, ahora: number): string | null {
  if (!e) return null;
  if (e.tipo === "sin") return t("Sin hora estimada · todavía tiene menos de 5 runs terminados");
  if (e.tipo === "lleva") return t("Lleva {tiempo} · más que {menos} de sus últimos {n} runs: no hay una hora confiable", { tiempo: cuantoLleva(e.edad), menos: e.menos, n: e.n });
  return t("Termina ≈{cuando} · según sus últimos {n} runs (acierta a ±30 min 7 de cada 10 veces)", { cuando: horaLarga(e.fin, ahora), n: e.n });
}

// ---------------------------------------------------------------------------
// Cuándo la vuelve a decir cada globo (JST-192)
// ---------------------------------------------------------------------------

/** Cada globo vuelve a decir su hora una vez por minuto, cada uno en su instante. */
export const MINUTO_MS = 60_000;
/** Cuántos minutos adelante se mira si el globo va a decir otra cosa (si no, se vuelve a mirar entonces). */
const MIRAR_MINUTOS = 10;

const mod = (i: number, n: number) => ((i % n) + n) % n;

/**
 * El instante de cada agente dentro del minuto (ms, en el reloj de la vida:
 * `performance.now()`, el de los rótulos). Los rótulos de las `nSalas` salas
 * pasan cada `paso / nSalas` (con 4 salas, cada 1,5 s; JST-138 §3.4): cada
 * agente cae en la mitad de uno de esos huecos, uno distinto por agente,
 * repartidos en el minuto en el orden del piso. Con más agentes que huecos (40
 * con 4 salas), van varios por hueco, a la misma distancia entre ellos y de
 * los rótulos.
 */
export function instantesDeHora(ids: readonly string[], nSalas: number, paso = PASO_SALA_MS): Map<string, number> {
  const hueco = paso / Math.max(1, nSalas);
  const huecos = Math.max(1, Math.round(MINUTO_MS / hueco));
  const porHueco = Math.max(1, Math.ceil(ids.length / huecos));
  const lugares = huecos * porHueco;
  return new Map(
    ids.map((id, k) => {
      const q = Math.floor((k * lugares) / ids.length);
      return [id, Math.floor(q / porHueco) * hueco + (hueco * ((q % porHueco) + 1)) / (porHueco + 1)];
    }),
  );
}

/** Su próximo instante después de `t` (reloj de la vida). */
export function proximoInstante(t: number, instante: number): number {
  return t + MINUTO_MS - mod(t - instante, MINUTO_MS);
}

/**
 * Con qué hora se dice la hora estimada de cada globo del piso. Cada agente
 * la vuelve a decir solo en su instante del minuto, al empezar otro run o
 * cuando llegan sus runs anteriores (al cargar): la página se vuelve a dibujar
 * por muchas cosas (un «✓ listo», tu escritorio), y antes cada una cambiaba de
 * paso la hora de todos. Con la pestaña oculta (o
 * el piso tapado por el TV) no cambia, y al volver cada uno sigue con lo que
 * decía hasta su próximo instante; si no, los que cambiaron mientras no se
 * veía cambiarían todos a la vez (como los rótulos, JST-155).
 */
export class HorasDeGlobos {
  private instantes = new Map<string, number>();
  private piso = "";
  private readonly dichas = new Map<string, { run: string; ahora: number; hasta: number }>();
  private oculta = false;

  /** Los agentes del piso, en su orden, y cuántas salas tiene. */
  fijarPiso(ids: readonly string[], nSalas: number): void {
    const piso = `${nSalas}|${ids.join(",")}`;
    if (piso === this.piso) return;
    this.piso = piso;
    this.instantes = instantesDeHora(ids, nSalas);
  }

  /** Se oculta o vuelve a verse, en el instante `t` de la vida. */
  fijarOculta(oculta: boolean, t: number): void {
    if (this.oculta && !oculta) {
      for (const [id, d] of this.dichas) d.hasta = Math.max(d.hasta, proximoInstante(t, this.instantes.get(id) ?? 0));
    }
    this.oculta = oculta;
  }

  /** Con qué hora de verdad (`real`, la de `Date.now()` en el instante `t` de la vida) se dice la de `id`, que trabaja en `run`. */
  ahoraDe(id: string, run: string, t: number, real: number): number {
    const d = this.dichas.get(id);
    if (d && d.run === run && (this.oculta || t < d.hasta)) return d.ahora;
    const instante = this.instantes.get(id) ?? 0;
    const nueva = { run, ahora: real - mod(t - instante, MINUTO_MS), hasta: proximoInstante(t, instante) };
    this.dichas.set(id, nueva);
    return nueva.ahora;
  }

  /**
   * El próximo instante (reloj de la vida) en que el globo de alguno de
   * `quienes` va a decir otra cosa, o `null`. `texto(id, ahora)`: lo que diría
   * su globo con esa hora. Se mira cada uno hasta 10 minutos adelante.
   */
  proximo(quienes: ReadonlyArray<{ id: string; run: string }>, texto: (id: string, ahora: number) => string | null, t: number, real: number): number | null {
    let mejor = Infinity;
    for (const q of quienes) {
      const d = this.dichas.get(q.id);
      if (!d || d.run !== q.run) continue;
      const ya = texto(q.id, d.ahora);
      let cuando = d.hasta > t ? d.hasta : proximoInstante(t, this.instantes.get(q.id) ?? 0);
      for (let i = 0; i < MIRAR_MINUTOS && cuando < mejor && texto(q.id, real + (cuando - t)) === ya; i++) cuando += MINUTO_MS;
      mejor = Math.min(mejor, cuando);
    }
    return Number.isFinite(mejor) ? mejor : null;
  }
}

// ---------------------------------------------------------------------------
// Los runs terminados de cada agente
// ---------------------------------------------------------------------------

interface Terminado {
  id: string;
  inicio: number;
  fin: number;
}

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);

/** Un run que cuenta: con inicio y fin, y que no se canceló (como en el `spike`). */
function terminado(r: { id?: unknown; runId?: unknown; status?: unknown; startedAt?: unknown; finishedAt?: unknown }): Terminado | null {
  const id = typeof r.id === "string" ? r.id : typeof r.runId === "string" ? r.runId : null;
  if (!id || r.status === "cancelled" || r.status === "running" || r.status === "queued") return null;
  const inicio = ms(typeof r.startedAt === "string" ? r.startedAt : null);
  const fin = ms(typeof r.finishedAt === "string" ? r.finishedAt : null);
  if (!Number.isFinite(inicio) || !Number.isFinite(fin) || fin < inicio) return null;
  return { id, inicio, fin };
}

/** Lee los últimos 30 runs de un agente (`heartbeat-runs?agentId&limit=30&summary=true`). */
export type LeerRuns = (companyId: string, agentId: string) => Promise<RunResumen[]>;

/**
 * Los runs terminados de cada agente, para la hora estimada. Uno por pestaña
 * (lo comparten la página, el widget y el TV). Lee 1 vez por agente al cargar,
 * de a 4; después suma lo que llega por el canal en vivo.
 */
export class HistorialRuns {
  private readonly runs = new Map<string, Terminado[]>();
  /** Cuándo se leyó (o se pidió) cada agente, y de qué empresa es. */
  private readonly leidos = new Map<string, number>();
  private readonly empresaDe = new Map<string, string>();
  private readonly fila: Array<{ id: string; companyId: string }> = [];
  private corriendo = 0;
  private readonly oyentes = new Set<() => void>();
  private ver = 0;
  /** Lecturas hechas (para las pruebas y las mediciones). */
  lecturas = 0;

  constructor(
    private readonly leer: LeerRuns,
    private readonly ahora: () => number = Date.now,
  ) {}

  suscribir = (oyente: () => void): (() => void) => {
    this.oyentes.add(oyente);
    return () => this.oyentes.delete(oyente);
  };

  /** Sube cuando llega algo nuevo (la página vuelve a calcular las horas). */
  version = (): number => this.ver;

  private avisar(): void {
    this.ver += 1;
    for (const o of this.oyentes) o();
  }

  /** Los agentes que se ven: lee los que todavía no se leyeron (los que llegan después, también una vez). */
  cargar(agentes: ReadonlyArray<{ id: string; companyId: string }>): void {
    for (const a of agentes) {
      this.empresaDe.set(a.id, a.companyId);
      if (this.leidos.has(a.id)) continue;
      this.pedir(a);
    }
  }

  /** La empresa reconectó su canal (pudo perder eventos): se vuelven a leer sus agentes leídos hace más de 1 h. */
  reconecto(companyId: string): void {
    const t = this.ahora();
    for (const [id, empresa] of this.empresaDe) {
      if (empresa !== companyId) continue;
      const leido = this.leidos.get(id);
      if (leido !== undefined && t - leido >= RELEER_MS) this.pedir({ id, companyId });
    }
  }

  private pedir(a: { id: string; companyId: string }): void {
    this.leidos.set(a.id, this.ahora());
    if (!this.fila.some((x) => x.id === a.id)) this.fila.push(a);
    this.seguir();
  }

  private seguir(): void {
    while (this.corriendo < A_LA_VEZ && this.fila.length > 0) {
      const a = this.fila.shift()!;
      this.corriendo += 1;
      this.lecturas += 1;
      void this.leer(a.companyId, a.id)
        .then((lista) => {
          const nuevos = lista.map(terminado).filter((x): x is Terminado => x !== null);
          this.mezclar(a.id, nuevos);
          this.avisar();
        })
        .catch(() => undefined)
        .finally(() => {
          this.corriendo -= 1;
          this.seguir();
        });
    }
  }

  private mezclar(agenteId: string, nuevos: readonly Terminado[]): void {
    const porId = new Map((this.runs.get(agenteId) ?? []).map((r) => [r.id, r]));
    for (const r of nuevos) porId.set(r.id, r);
    this.runs.set(agenteId, [...porId.values()].sort((a, b) => a.fin - b.fin).slice(-RUNS_PREVIOS));
  }

  /** Un run que termina, del canal en vivo (`heartbeat.run.status` trae `startedAt` y `finishedAt`): entra en `prev`. 0 lecturas. */
  alEvento(evento: Pick<EventoVivo, "type" | "payload">): void {
    if (evento.type !== "heartbeat.run.status") return;
    const p = evento.payload;
    const agenteId = typeof p.agentId === "string" ? p.agentId : null;
    const r = terminado(p);
    // Solo de los agentes ya leídos: los demás traen el run al leerse.
    if (!agenteId || !r || !this.runs.has(agenteId)) return;
    if (this.runs.get(agenteId)!.some((x) => x.id === r.id)) return;
    this.mezclar(agenteId, [r]);
    this.avisar();
  }

  /** Las duraciones (ms) de sus últimos runs terminados, o `null` si todavía no se leyó. */
  duraciones(agenteId: string): number[] | null {
    const lista = this.runs.get(agenteId);
    return lista ? lista.map((r) => r.fin - r.inicio) : null;
  }

  /**
   * La estimación del run que va (desde `inicio`), o `null` si no se sabe
   * todavía. Con una hora de antes de que empezara (la del último instante de
   * su globo, JST-192), como si recién empezara.
   */
  estimacion(agenteId: string, inicio: string | null | undefined, ahora: number): Estimacion | null {
    const d = this.duraciones(agenteId);
    const t0 = ms(inicio);
    if (!d || !Number.isFinite(t0)) return null;
    const desde = Math.max(ahora, t0);
    return estimar(d, desde - t0, desde);
  }
}
