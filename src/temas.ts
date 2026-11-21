// De qué hablan dos agentes en el descanso (design-spec de JST-96 §6), sin
// React: datos reales, sin IA ni tokens.
//
// - Lo último que terminó en las últimas 24 h: del canal en vivo
//   (`issue.updated` con `changes.status.to = "done"` y `payload.agentId`) o, si
//   no llegó ningún evento, 1 lectura de `/issues?status=done…&limit=1`.
// - Lo que tiene en cola: 1 lectura de `/issues?status=todo,blocked,in_review…&limit=3`.
// Los datos de cada agente se guardan 10 min: como mucho 2 lecturas por agente
// cada 10 min, y casi siempre 0.
//
// 0.3.4 (JST-138 §2): las mismas lecturas traen el nombre de cada tarea. Va en
// los temas y en los nombres conocidos de la página, para el rótulo de la sala.
//
// 0.4.0 (JST-162): qué se dice con estos temas está en `charlas.ts`. Lo único
// nuevo aquí es `enCola`, el largo de lo que ya trae la lectura «cola».
import { colaDelAgente, terminadaDelAgente, type Conexion } from "./fuentes.js";
import type { TitulosConocidos } from "./rotulo.js";
import type { EventoVivo, TareaRef } from "./shared.js";

/** Lo que dura la caché de cada agente. */
export const CACHE_TEMAS_MS = 10 * 60_000;
/** Solo cuenta lo que terminó en las últimas 24 h. */
export const TERMINADA_MS = 24 * 60 * 60_000;

export type EstadoCola = "todo" | "in_review" | "blocked";

export interface Temas {
  /** Código de lo último que terminó (24 h), o `null`. */
  hecho: string | null;
  /** Nombre de lo último que terminó, si se conoce (del canal en vivo llega solo el código). */
  tituloHecho?: string | null;
  /** Lo primero de su cola: el primero de `todo`; si no hay, de `in_review`; si no, de `blocked`. */
  sigue: { codigo: string; estado: EstadoCola; titulo?: string | null } | null;
  /** Cuántas trae la lectura «cola» (0 a 3; 3 es «3 o más»), sin leer nada más (JST-162 §1.2). */
  enCola?: number;
  /** JST-415: la primera tarea bloqueada de su cola (la misma lectura «cola»), aunque haya otras primero. */
  bloqueada?: { codigo: string; titulo?: string | null } | null;
  /** JST-415: cuándo terminó lo último (ms) y, si se sabe, cuándo lo empezó: de ahí sale «esa me tomó dos horas». */
  hechoEn?: number | null;
  hechoInicio?: number | null;
  /** JST-415: cuántas tareas vio terminar este agente hoy con la página abierta (solo lo que llegó por el canal en vivo). */
  racha?: number;
}

/** De las tareas en cola (hasta 3), la primera de `todo`; si no hay, de `in_review`; si no, de `blocked`. */
export function primeraDeCola(tareas: readonly TareaRef[]): Temas["sigue"] {
  for (const estado of ["todo", "in_review", "blocked"] as const) {
    const t = tareas.find((x) => x.status === estado && x.identifier);
    if (t) return { codigo: t.identifier!, estado, titulo: t.title || null };
  }
  return null;
}

/** La primera tarea bloqueada de la cola (hasta 3), o `null`. */
export function bloqueadaDeCola(tareas: readonly TareaRef[]): Temas["bloqueada"] {
  const t = tareas.find((x) => x.status === "blocked" && x.identifier);
  return t ? { codigo: t.identifier!, titulo: t.title || null } : null;
}

export interface AgenteTemas {
  id: string;
  companyId: string;
}

interface Guardado {
  temas: Temas;
  hasta: number;
}

/** Lo que sirve de un evento del canal en vivo: quién terminó qué (`null` si no es eso). */
export function terminadaDeEvento(evento: EventoVivo): { agenteId: string; codigo: string; en: number } | null {
  if (evento.type !== "activity.logged" || evento.payload.action !== "issue.updated") return null;
  const agenteId = evento.payload.agentId;
  const detalles = evento.payload.details as { identifier?: unknown; changes?: { status?: { to?: unknown } } } | null | undefined;
  if (typeof agenteId !== "string" || detalles?.changes?.status?.to !== "done" || typeof detalles.identifier !== "string") return null;
  const en = Date.parse(evento.createdAt);
  return { agenteId, codigo: detalles.identifier, en: Number.isNaN(en) ? Date.now() : en };
}

/**
 * Los temas de cada agente, con caché de 10 min. `leer` falla si alguna
 * lectura falla (y no se guarda nada): ese turno no hay conversación.
 */
export class LectorTemas {
  private readonly cache = new Map<string, Guardado>();
  private readonly enVivo = new Map<string, { codigo: string; en: number }>();
  /** JST-415: lo que cada agente terminó hoy (código → cuándo), de los eventos que llegaron con la página abierta. */
  private readonly hoy = new Map<string, Map<string, number>>();
  private readonly pendientes = new Map<string, Promise<Temas>>();

  /** `titulos`: los nombres conocidos de la página, que estas lecturas también llenan (JST-138 §2). */
  constructor(
    private readonly cx: Conexion,
    private readonly ahora: () => number = Date.now,
    private readonly titulos: TitulosConocidos | null = null,
  ) {}

  /** Un evento del canal en vivo: si es una tarea terminada por un agente, pasa a ser lo último que terminó. */
  alEvento(evento: EventoVivo): void {
    const t = terminadaDeEvento(evento);
    if (!t) return;
    this.enVivo.set(t.agenteId, { codigo: t.codigo, en: t.en });
    const dia = new Date(this.ahora()).toDateString();
    const lista = this.hoy.get(t.agenteId) ?? new Map<string, number>();
    for (const [k, en] of lista) if (new Date(en).toDateString() !== dia) lista.delete(k);
    if (new Date(t.en).toDateString() === dia) lista.set(t.codigo, t.en);
    this.hoy.set(t.agenteId, lista);
    const g = this.cache.get(t.agenteId);
    if (g) {
      // El inicio solo sirve si es de la misma tarea que se leyó.
      g.temas = { ...g.temas, hecho: t.codigo, tituloHecho: this.titulos?.titulo(t.codigo) ?? null, hechoEn: t.en, hechoInicio: g.temas.hecho === t.codigo ? (g.temas.hechoInicio ?? null) : null };
    }
  }

  /** Cuántas vio terminar hoy ese agente (0 si ninguna). */
  private racha(agenteId: string): number {
    const dia = new Date(this.ahora()).toDateString();
    let n = 0;
    for (const en of this.hoy.get(agenteId)?.values() ?? []) if (new Date(en).toDateString() === dia) n += 1;
    return n;
  }

  private conRacha(agenteId: string, temas: Temas): Temas {
    const n = this.racha(agenteId);
    return n > 0 ? { ...temas, racha: n } : temas;
  }

  /** Lo guardado de un agente (sin leer nada), o `null` si no hay o ya venció. */
  guardado(agenteId: string): Temas | null {
    const g = this.cache.get(agenteId);
    if (!g || g.hasta <= this.ahora()) return null;
    return this.conRacha(agenteId, this.conVivo(agenteId, g.temas));
  }

  private conVivo(agenteId: string, temas: Temas): Temas {
    const v = this.enVivo.get(agenteId);
    if (v && this.ahora() - v.en <= TERMINADA_MS) {
      const mismo = v.codigo === temas.hecho;
      return { ...temas, hecho: v.codigo, tituloHecho: mismo ? temas.tituloHecho : (this.titulos?.titulo(v.codigo) ?? null), hechoEn: v.en, hechoInicio: mismo ? (temas.hechoInicio ?? null) : null };
    }
    return temas;
  }

  /** Los temas de un agente: lo guardado o, si venció, hasta 2 lecturas (la terminada solo si no llegó por el canal). */
  leer(agente: AgenteTemas): Promise<Temas> {
    const g = this.guardado(agente.id);
    if (g) return Promise.resolve(g);
    const pendiente = this.pendientes.get(agente.id);
    if (pendiente) return pendiente;
    const promesa = (async () => {
      const vivo = this.enVivo.get(agente.id);
      const conVivo = !!vivo && this.ahora() - vivo.en <= TERMINADA_MS;
      const [terminada, cola] = await Promise.all([
        conVivo ? Promise.resolve(null) : terminadaDelAgente(this.cx, agente.companyId, agente.id),
        colaDelAgente(this.cx, agente.companyId, agente.id),
      ]);
      const hecho = conVivo ? vivo!.codigo : terminada && terminada.identifier && this.ahora() - terminada.en <= TERMINADA_MS ? terminada.identifier : null;
      // Lo que se leyó también queda en los nombres conocidos (sin una lectura más).
      this.titulos?.conocer(terminada?.identifier, terminada?.titulo);
      for (const t of cola) this.titulos?.conocer(t.identifier, t.title);
      const tituloHecho = !hecho ? null : !conVivo ? (terminada?.titulo ?? null) : (this.titulos?.titulo(hecho) ?? null);
      const hechoEn = !hecho ? null : conVivo ? vivo!.en : (terminada?.en ?? null);
      // El inicio solo vale si la lectura es de esa misma tarea (con el canal en vivo no se leyó la terminada).
      const hechoInicio = hecho && !conVivo ? (terminada?.inicio ?? null) : null;
      const temas: Temas = { hecho, tituloHecho, sigue: primeraDeCola(cola), enCola: cola.length, bloqueada: bloqueadaDeCola(cola), hechoEn, hechoInicio };
      this.cache.set(agente.id, { temas, hasta: this.ahora() + CACHE_TEMAS_MS });
      return this.conRacha(agente.id, temas);
    })().finally(() => this.pendientes.delete(agente.id));
    this.pendientes.set(agente.id, promesa);
    return promesa;
  }
}
