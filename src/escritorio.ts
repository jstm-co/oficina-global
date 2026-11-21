// Tu escritorio con fila, en cada sala (0.5.0, design-spec de JST-163 §14), sin
// React ni DOM: quién hace fila y en qué lugar, cuántos te esperan en la sala y
// lo que dice la ventanita de tu escritorio. Dónde está el escritorio y cada
// lugar de la fila lo dice el plano (`plano.ts`); la vida los hace caminar.
//
// Solo hace fila quien dejó de trabajar para esperarte («te necesita» sin run:
// tarjetas, aprobaciones, revisiones y decisiones; nunca un bloqueo, JST-135).
// Quien sigue trabajando y además te espera muestra la mano en su globo. El que
// espera hace más va adelante; caben 3 por sala y los demás esperan en su
// puesto con la mano, como antes.
import { t } from "./i18n.js";
import type { Dibujo } from "./vista.js";

/** Como mucho, por sala. */
export const MAX_FILA = 3;

export interface AgenteFila {
  id: string;
  prefijo: string;
  st: Dibujo;
  need: boolean;
  /** Desde cuándo espera su primera espera (la más antigua). */
  esperaDesde: string | null;
}

const desde = (a: Pick<AgenteFila, "esperaDesde">) => {
  const t = a.esperaDesde ? Date.parse(a.esperaDesde) : NaN;
  return Number.isFinite(t) ? t : Infinity;
};

/** El que espera hace más, primero (como «Te necesitan»); el id desempata. */
export function porEspera(a: AgenteFila, b: AgenteFila): number {
  return desde(a) - desde(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Hace fila: te espera sin trabajar (estado «te necesita», sin run). */
export function haceFila(a: Pick<AgenteFila, "st" | "need">): boolean {
  return a.st === "toca" && a.need;
}

/**
 * Quién hace fila en cada sala y en qué lugar (0 = el primero). `lugares`: los
 * lugares de la fila de cada sala (0 si la sala no tiene escritorio tuyo: el
 * celular, un descanso angosto o una sala a oscuras). `fuera`: los que no
 * pueden ir (quien está entregando una tarea).
 */
export function filaDeSalas(agentes: readonly AgenteFila[], lugares: (prefijo: string) => number, fuera: ReadonlySet<string> = new Set()): Map<string, number> {
  const fila = new Map<string, number>();
  const porSala = new Map<string, AgenteFila[]>();
  for (const a of agentes) {
    if (!haceFila(a) || fuera.has(a.id)) continue;
    porSala.set(a.prefijo, [...(porSala.get(a.prefijo) ?? []), a]);
  }
  for (const [prefijo, lista] of porSala) {
    const cupo = Math.min(MAX_FILA, Math.max(0, lugares(prefijo)));
    [...lista].sort(porEspera).slice(0, cupo).forEach((a, k) => fila.set(a.id, k));
  }
  return fila;
}

/** Cuántos te esperan en la sala, estén en la fila o no (la suma de las salas es el contador «✋ te necesitan»). */
export function esperanEn(agentes: ReadonlyArray<Pick<AgenteFila, "prefijo" | "need">>, prefijo: string): number {
  return agentes.filter((a) => a.prefijo === prefijo && a.need).length;
}

/** El `aria-label` y el tooltip de tu escritorio. */
export function etiquetaEscritorio(n: number, empresa: string): string {
  if (n === 0) return t("Tu escritorio en {empresa}: nadie te espera.", { empresa });
  if (n === 1) return t("Tu escritorio: 1 te espera en {empresa}. Clic para ver la lista y responder.", { empresa });
  return t("Tu escritorio: {n} te esperan en {empresa}. Clic para ver la lista y responder.", { n, empresa });
}

/** Dónde está cada uno de los que te esperan, en la ventanita de tu escritorio: «1.º en la fila», «sigue trabajando en BET-432»… */
export function dondeEspera(a: { st: Dibujo; codigo?: string | null }, lugar: number | undefined): { texto: string; codigo: string | null; fila: boolean } {
  if (lugar !== undefined) return { texto: t("{n}.º en la fila", { n: lugar + 1 }), codigo: null, fila: true };
  if (a.st === "trabaja") return { texto: t("sigue trabajando en"), codigo: a.codigo ?? null, fila: false };
  if (a.st === "error") return { texto: t("con error"), codigo: null, fila: false };
  if (a.st === "pausa") return { texto: t("en pausa"), codigo: null, fila: false };
  return { texto: t("en su puesto"), codigo: null, fila: false };
}
