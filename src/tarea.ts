// Modal de tarea (JST-411): ver una tarea sin salir de la Oficina. Portado del
// modal de Board global (JST-408); aquí va la parte sin React.
import { msg, t } from "./i18n.js";

/** Comentarios que el modal pide de una vez; los anteriores quedan en la página de la tarea. */
export const TOPE_COMENTARIOS = 50;

/** Los estados de una tarea, en el orden del menú. */
export const ESTADOS_TAREA = ["backlog", "todo", "in_progress", "in_review", "blocked", "done", "cancelled"] as const;
export type EstadoTarea = (typeof ESTADOS_TAREA)[number];

const NOMBRES_ESTADO: Record<EstadoTarea, string> = {
  backlog: msg("Backlog"),
  todo: msg("Por hacer"),
  in_progress: msg("En curso"),
  in_review: msg("En revisión"),
  blocked: msg("Bloqueada"),
  done: msg("Hecha"),
  cancelled: msg("Cancelada"),
};

/** Íconos de `iconos.ts` para cada estado (los mismos de la ficha). */
export const ICONO_ESTADO: Record<EstadoTarea, string> = {
  backlog: "circle-dashed",
  todo: "circle",
  in_progress: "rotate-cw",
  in_review: "circle-dot",
  blocked: "circle-minus",
  done: "circle-check",
  cancelled: "ban",
};

const NOMBRES_PRIORIDAD: Record<string, string> = { critical: msg("Crítica"), high: msg("Alta"), medium: msg("Media"), low: msg("Baja") };

export function esEstadoTarea(valor: unknown): valor is EstadoTarea {
  return typeof valor === "string" && (ESTADOS_TAREA as readonly string[]).includes(valor);
}

/** «En curso», «Hecha»…; un estado que no se conoce se muestra tal cual. */
export function nombreEstado(estado: string | null | undefined): string {
  if (!estado) return "—";
  return esEstadoTarea(estado) ? t(NOMBRES_ESTADO[estado]) : estado;
}

/** «Alta», «Media»…; sin prioridad, «—». */
export function nombrePrioridad(prioridad: string | null | undefined): string {
  if (!prioridad) return "—";
  const nombre = NOMBRES_PRIORIDAD[prioridad];
  return nombre ? t(nombre) : prioridad;
}

/**
 * Reconoce el enlace de una tarea, `/PRE/issues/CODIGO-o-id` (con o sin consulta o
 * ancla), y nada más: ni la lista `/PRE/issues`, ni rutas de agentes o corridas.
 */
export function tareaDeHref(href: string): { prefijo: string; ref: string } | null {
  if (typeof href !== "string") return null;
  const ruta = href.split(/[?#]/, 1)[0] ?? "";
  const m = /^\/([^/]+)\/issues\/([^/]+)\/?$/.exec(ruta);
  if (!m) return null;
  try {
    const prefijo = decodeURIComponent(m[1]!);
    const ref = decodeURIComponent(m[2]!);
    return prefijo && ref ? { prefijo, ref } : null;
  } catch {
    return null;
  }
}

/**
 * Un clic normal abre la tarea en el modal. Con Ctrl, ⌘, Mayús, Alt o el botón
 * del medio manda el navegador: la página de la tarea.
 */
export function abreAqui(evento: { button?: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }): boolean {
  return (evento.button ?? 0) === 0 && !evento.metaKey && !evento.ctrlKey && !evento.shiftKey && !evento.altKey;
}

export interface ComentarioTarea {
  id: string;
  body: string;
  authorAgentId?: string | null;
  authorUserId?: string | null;
  createdAt: string;
  deletedAt?: string | null;
}

export interface AutorComentario {
  nombre: string;
  /** Lo escribió la persona que mira la Oficina. */
  yo: boolean;
  agente: boolean;
}

/** Quién escribió el comentario: la persona que mira, un agente, otra persona o el sistema. */
export function autorComentario(agentes: readonly { id: string; nombre: string }[], comentario: Pick<ComentarioTarea, "authorAgentId" | "authorUserId">, usuarioId: string | null): AutorComentario {
  if (comentario.authorAgentId) {
    const nombre = agentes.find((a) => a.id === comentario.authorAgentId)?.nombre;
    return { nombre: nombre ?? t("Agente desconocido"), yo: false, agente: true };
  }
  if (comentario.authorUserId) {
    const yo = usuarioId !== null && comentario.authorUserId === usuarioId;
    return { nombre: yo ? t("Tú") : t("Usuario"), yo, agente: false };
  }
  return { nombre: t("Sistema"), yo: false, agente: false };
}

/** Quién lleva la tarea: un agente, tú, otra persona, o nadie (`null`). */
export function responsableTarea(
  agentes: readonly { id: string; nombre: string }[],
  tarea: { assigneeAgentId?: string | null; assigneeUserId?: string | null },
  usuarioId: string | null,
): { nombre: string; agente: boolean } | null {
  if (tarea.assigneeAgentId) return { nombre: agentes.find((a) => a.id === tarea.assigneeAgentId)?.nombre ?? t("Agente desconocido"), agente: true };
  if (tarea.assigneeUserId) return { nombre: usuarioId !== null && tarea.assigneeUserId === usuarioId ? t("Tú") : t("Usuario"), agente: false };
  return null;
}

/** Los comentarios que se muestran: sin borrados ni repetidos, del más nuevo al más antiguo. */
export function comentariosVisibles(comentarios: readonly ComentarioTarea[]): ComentarioTarea[] {
  const vistos = new Set<string>();
  return comentarios
    .filter((c) => {
      if (c.deletedAt || vistos.has(c.id)) return false;
      vistos.add(c.id);
      return true;
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/** El texto a enviar, recortado, o `null` si no hay nada que comentar. */
export function cuerpoComentario(borrador: string): string | null {
  const cuerpo = borrador.trim();
  return cuerpo ? cuerpo : null;
}

/**
 * La lista de comentarios que llega de la lectura, más los que el usuario agregó mientras tanto
 * (la lectura pudo salir antes de que existieran). Los locales que la lectura no trae, por id, van
 * primero y del más nuevo al más antiguo; el resto queda en el orden en que llegó.
 */
export function mezclarComentarios(recibidos: readonly ComentarioTarea[], locales: readonly ComentarioTarea[]): ComentarioTarea[] {
  const ids = new Set(recibidos.map((c) => c.id));
  const faltan = locales.filter((c) => !ids.has(c.id)).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return [...faltan, ...recibidos];
}
