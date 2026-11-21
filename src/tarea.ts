// Modal de tarea (JST-411): ver una tarea sin salir de la Oficina. Portado del
// modal de Board global (JST-408); aquí va la parte sin React.

/** Comentarios que el modal pide de una vez; los anteriores quedan en la página de la tarea. */
export const TOPE_COMENTARIOS = 50;

/** Los estados de una tarea, en el orden del menú. */
export const ESTADOS_TAREA = ["backlog", "todo", "in_progress", "in_review", "blocked", "done", "cancelled"] as const;
export type EstadoTarea = (typeof ESTADOS_TAREA)[number];

const NOMBRES_ESTADO: Record<EstadoTarea, string> = {
  backlog: "Backlog",
  todo: "Por hacer",
  in_progress: "En curso",
  in_review: "En revisión",
  blocked: "Bloqueada",
  done: "Hecha",
  cancelled: "Cancelada",
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

const NOMBRES_PRIORIDAD: Record<string, string> = { critical: "Crítica", high: "Alta", medium: "Media", low: "Baja" };

export function esEstadoTarea(valor: unknown): valor is EstadoTarea {
  return typeof valor === "string" && (ESTADOS_TAREA as readonly string[]).includes(valor);
}

/** «En curso», «Hecha»…; un estado que no se conoce se muestra tal cual. */
export function nombreEstado(estado: string | null | undefined): string {
  if (!estado) return "—";
  return esEstadoTarea(estado) ? NOMBRES_ESTADO[estado] : estado;
}

/** «Alta», «Media»…; sin prioridad, «—». */
export function nombrePrioridad(prioridad: string | null | undefined): string {
  if (!prioridad) return "—";
  return NOMBRES_PRIORIDAD[prioridad] ?? prioridad;
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
    return { nombre: nombre ?? "Agente desconocido", yo: false, agente: true };
  }
  if (comentario.authorUserId) {
    const yo = usuarioId !== null && comentario.authorUserId === usuarioId;
    return { nombre: yo ? "Tú" : "Usuario", yo, agente: false };
  }
  return { nombre: "Sistema", yo: false, agente: false };
}

/** Quién lleva la tarea: un agente, tú, otra persona, o nadie (`null`). */
export function responsableTarea(
  agentes: readonly { id: string; nombre: string }[],
  tarea: { assigneeAgentId?: string | null; assigneeUserId?: string | null },
  usuarioId: string | null,
): { nombre: string; agente: boolean } | null {
  if (tarea.assigneeAgentId) return { nombre: agentes.find((a) => a.id === tarea.assigneeAgentId)?.nombre ?? "Agente desconocido", agente: true };
  if (tarea.assigneeUserId) return { nombre: usuarioId !== null && tarea.assigneeUserId === usuarioId ? "Tú" : "Usuario", agente: false };
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
