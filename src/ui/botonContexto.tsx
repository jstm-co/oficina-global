// Lo que lee «Leer contexto» (JST-269): lo que hace falta para decidir sin leer
// todo el hilo. Desde la 0.9.6 (JST-276, design-spec de JST-282) el botón va en
// la barra de arriba (`contextoBarra.tsx`) y la lectura de a una frase en
// `contextoLector.ts`; aquí queda de dónde salen los datos.
//
// - Fetch de `/api/issues/:ref` (el código, «JST-181», o el id) con la sesión del
//   usuario (igual que el resto de la Oficina: `credentials: "include"`, URL relativa).
// - Fetch de los últimos comentarios de la tarea (20) y de sus tarjetas.
// - Fetch del nombre de los agentes que el informe nombra (quién pregunta, quién
//   tiene la tarea, quién escribió lo último): hasta 4, y si falla se lee sin nombres.
// - Qué se dice y en qué orden lo arma `contextoInforme.ts` (JST-414): la pregunta
//   entera con sus opciones, lo que la tarjeta explica, qué depende de la
//   respuesta y dónde va el trabajo.
import { componerInforme, frasesDeInforme, objetos, type ComentarioInforme, type Informe, type NivelInforme, type TareaInforme, type TareaRelacionada } from "./contextoInforme.js";
import { esComentarioAutomatico } from "./contextoVoz.js";
import type { Interaccion } from "../shared.js";

// ---------------------------------------------------------------------------
// Fetch de datos de la tarea
// ---------------------------------------------------------------------------

async function fetchIssue(issueId: string): Promise<TareaInforme> {
  const r = await fetch(`/api/issues/${encodeURIComponent(issueId)}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<TareaInforme>;
}

async function fetchComments(issueId: string): Promise<ComentarioInforme[]> {
  // 20: los avisos automáticos de Paperclip no se leen (JST-275) y pueden ser varios seguidos.
  const r = await fetch(`/api/issues/${encodeURIComponent(issueId)}/comments?limit=20&order=desc`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  }).catch(() => null);
  if (!r?.ok) return [];
  const d = await r.json().catch(() => null);
  return objetos<ComentarioInforme>(Array.isArray(d) ? d : d?.items);
}

/** Las tarjetas de la tarea (JST-273): la pendiente dice qué te preguntan. Si falla, se lee sin ella. */
async function fetchInteracciones(issueId: string): Promise<Interaccion[]> {
  const r = await fetch(`/api/issues/${encodeURIComponent(issueId)}/interactions`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  }).catch(() => null);
  if (!r?.ok) return [];
  const d = await r.json().catch(() => null);
  return objetos<Interaccion>(Array.isArray(d) ? d : d?.items);
}

/** Los agentes que el informe puede nombrar: quién pregunta, quién tiene la tarea, quién tiene la que la frena y quién escribió lo último. */
export function agentesDelInforme(tarea: TareaInforme, comentarios: readonly ComentarioInforme[], tarjetas: readonly Interaccion[]): string[] {
  const pendiente = objetos<Interaccion>(tarjetas).filter((i) => i.status === "pending").sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0))[0];
  const ultimos = objetos<ComentarioInforme>(comentarios)
    .filter((c) => c.body?.trim() && !esComentarioAutomatico(c))
    .slice()
    .sort((a, b) => (Date.parse(b.createdAt ?? "") || 0) - (Date.parse(a.createdAt ?? "") || 0))
    .slice(0, 2);
  const ids = [pendiente?.createdByAgentId, tarea.assigneeAgentId, ...ultimos.map((c) => c.authorAgentId), objetos<TareaRelacionada>(tarea.blockedBy).find((b) => b.status !== "done" && b.status !== "cancelled")?.assigneeAgentId];
  return [...new Set(ids.filter((x): x is string => !!x))].slice(0, 4);
}

/** El nombre de cada agente (`GET /api/agents/:id`). El que falle queda sin nombre: el informe dice «Te esperan». */
async function fetchNombres(ids: readonly string[]): Promise<Record<string, string>> {
  const pares = await Promise.all(
    ids.map(async (id) => {
      const r = await fetch(`/api/agents/${encodeURIComponent(id)}`, { credentials: "include", headers: { Accept: "application/json" } }).catch(() => null);
      const d = r?.ok ? ((await r.json().catch(() => null)) as { name?: unknown } | null) : null;
      return [id, typeof d?.name === "string" ? d.name : null] as const;
    }),
  );
  return Object.fromEntries(pares.filter((p): p is readonly [string, string] => !!p[1]));
}

/** Lo que se lee de una tarea: el informe (para dejarlo escrito) y sus frases, en orden. */
export interface Leido {
  informe: Informe;
  frases: string[];
}

/** El informe de esa tarea (el código o el id). Falla si no se pudo leer la tarea. */
export async function informeDeTarea(ref: string, nivel: NivelInforme = "completo", ahora: number = Date.now()): Promise<Leido> {
  const [tarea, comentarios, tarjetas] = await Promise.all([fetchIssue(ref), fetchComments(ref), fetchInteracciones(ref)]);
  const agentes = await fetchNombres(agentesDelInforme(tarea, comentarios, tarjetas)).catch(() => ({}));
  const informe = componerInforme({ tarea, comentarios, tarjetas, agentes, ahora }, nivel);
  return { informe, frases: frasesDeInforme(informe) };
}

/** Lo que dice «Leer contexto» de esa tarea, en un solo texto. */
export async function textoDeTarea(ref: string): Promise<string> {
  return (await informeDeTarea(ref)).frases.join(" ");
}
