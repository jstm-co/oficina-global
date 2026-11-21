// Llamadas a la API nativa de Paperclip para el modal de tarea (JST-411), con la
// sesión del usuario (`credentials: "include"`, mismo origen), como `botonContexto.tsx`.
import type { ComentarioTarea } from "../tarea.js";

export interface DetalleTarea {
  id: string;
  identifier: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  assigneeAgentId: string | null;
  assigneeUserId: string | null;
  projectId: string | null;
  companyId: string | null;
  parentId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  ancestors?: Array<{ id: string; identifier?: string | null; title: string }>;
}

async function pedir<T>(ruta: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`/api${ruta}`, {
    credentials: "include",
    ...init,
    headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  const cuerpo = await r.json().catch(() => null);
  if (!r.ok) {
    const mensaje = cuerpo?.message ?? cuerpo?.error ?? `HTTP ${r.status}`;
    throw new Error(typeof mensaje === "string" ? mensaje : JSON.stringify(mensaje));
  }
  return cuerpo as T;
}

/** La tarea completa; `ref` es el código («JST-12») o el id. */
export function leerTarea(ref: string): Promise<DetalleTarea> {
  return pedir(`/issues/${encodeURIComponent(ref)}`);
}

/** Los últimos comentarios, sin ordenar (el modal los ordena). */
export async function leerComentarios(id: string, limite: number): Promise<ComentarioTarea[]> {
  const d = await pedir<ComentarioTarea[] | { items?: ComentarioTarea[] }>(`/issues/${encodeURIComponent(id)}/comments?limit=${limite}`);
  return Array.isArray(d) ? d : (d?.items ?? []);
}

/** Comenta con la sesión del usuario (si la lleva un agente, lo despierta). Devuelve el comentario creado. */
export async function comentar(id: string, body: string, yo: string | null): Promise<ComentarioTarea> {
  const c = await pedir<Partial<ComentarioTarea> | null>(`/issues/${encodeURIComponent(id)}/comments`, { method: "POST", body: JSON.stringify({ body }) });
  return {
    id: c?.id ?? `local-${Date.now()}`,
    body: c?.body ?? body,
    authorAgentId: c?.authorAgentId ?? null,
    authorUserId: c?.authorUserId ?? (c?.authorAgentId ? null : yo),
    createdAt: c?.createdAt ?? new Date().toISOString(),
    deletedAt: null,
  };
}

/** Marca la tarea como leída en el Inbox del usuario, como al abrir su página. */
export function marcarLeida(id: string): Promise<unknown> {
  return pedir(`/issues/${encodeURIComponent(id)}/read`, { method: "POST", body: "{}" });
}

export function cambiarEstado(id: string, status: string): Promise<unknown> {
  return pedir(`/issues/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status }) });
}
