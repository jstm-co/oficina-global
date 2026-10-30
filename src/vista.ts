// Lo que la oficina dibuja de cada agente (design-spec de JST-65 §5), sin React:
// la pose, la frase para el lector de pantalla, los contadores y los tiempos.
import { aspectoDe } from "./aspecto.js";
import type { AgenteOficina, Espera, TipoEspera } from "./estado.js";
import { textoGlobo, type Estimacion } from "./hora.js";

/** Lo que se dibuja: el estado base, salvo que esté libre y te necesite (vuelve a su puesto y levanta la mano). */
export type Dibujo = "trabaja" | "toca" | "error" | "pausa" | "libre";

export const ORDEN_LEYENDA: readonly Dibujo[] = ["toca", "error", "trabaja", "pausa", "libre"];

export const ESTADOS: Record<Dibujo, { label: string; corto: string; muchos: string; icono: string; leyenda: string }> = {
  trabaja: { label: "Trabajando", corto: "trabajando", muchos: "trabajando", icono: "keyboard", leyenda: "teclea; globo con la tarea" },
  toca: { label: "Te necesita", corto: "te necesita", muchos: "te necesitan", icono: "hand", leyenda: "levanta la mano, o la muestra en su globo" },
  error: { label: "Con error", corto: "con error", muchos: "con error", icono: "triangle-alert", leyenda: "se pone rojo" },
  pausa: { label: "En pausa", corto: "en pausa", muchos: "en pausa", icono: "moon", leyenda: "duerme" },
  libre: { label: "Libre", corto: "libre", muchos: "libres", icono: "coffee", leyenda: "en la sala de descanso" },
};

/** Tipos de «te necesita» (§9): etiqueta, ícono y botón de la ficha. */
export const ESPERAS: Record<TipoEspera, { label: string; icono: string; boton: string }> = {
  tarjeta: { label: "Tarjeta", icono: "message-square", boton: "Responder" },
  aprobacion: { label: "Aprobación", icono: "check-check", boton: "Aprobar o rechazar" },
  revision: { label: "Revisión", icono: "eye", boton: "Revisar" },
  decision: { label: "Decisión", icono: "list-checks", boton: "Decidir" },
};

export interface AgenteVista extends AgenteOficina {
  st: Dibujo;
  /** Tiene algo esperando tu respuesta (va aparte, encima de cualquier estado). */
  need: boolean;
  aspecto: string;
  empresa: string;
}

export function dibujo(agente: AgenteOficina): Dibujo {
  switch (agente.base) {
    case "trabajando":
      return "trabaja";
    case "error":
      return "error";
    case "pausa":
      return "pausa";
    case "libre":
      return agente.teNecesita.length > 0 ? "toca" : "libre";
  }
}

export function vistaDe(agente: AgenteOficina, empresa: string): AgenteVista {
  return {
    ...agente,
    st: dibujo(agente),
    need: agente.teNecesita.length > 0,
    aspecto: aspectoDe({ id: agente.id, nombre: agente.nombre, cargo: agente.rol, rolApi: agente.rolApi, adapterType: agente.adapterType }),
    empresa,
  };
}

/** El código y el nombre completo, sin cortar (JST-138 §4): «BET-432 · Backend — enlace de descarga…». */
const conNombre = (codigo: string | null, titulo: string | null | undefined) => `${codigo ?? "una tarea"}${titulo ? ` · ${titulo}` : ""}`;
/** Lo que te pide cada espera: el título de la tarjeta o de la aprobación; si no hay, el de la tarea. */
const codigos = (esperas: readonly Espera[]) => esperas.map((e) => conNombre(e.identifier, e.titulo ?? e.tituloTarea)).join(", ");

/** Lo que la 0.5.0 suma a la frase de un agente (JST-163): su hora estimada y su «✓ listo». */
export interface ExtraEtiqueta {
  /** La frase de la hora estimada («termina ≈15:05, según sus últimos runs»), si trabaja. */
  hora?: string | null;
  /** Terminó hace menos de 6 s: el código y el nombre de la tarea. */
  listo?: { codigo: string | null; titulo: string | null } | null;
}

/**
 * Frase del `aria-label` y del tooltip (§11), con el nombre completo de cada
 * tarea (JST-138 §4): «Nombre, Empresa: trabajando en BET-432 · Backend —
 * enlace de descarga…; además te necesita en BET-440 · Revisar la migración…».
 * 0.5.0 (JST-163): con la hora estimada («…; termina ≈15:05, según sus últimos
 * runs») y, mientras se ve, el «✓ listo» («QA, Betalandia: terminó BET-414 ·
 * QA — pruebas…; ahora va al descanso»).
 */
export function etiqueta(a: AgenteVista, extra: ExtraEtiqueta = {}): string {
  if (extra.listo && a.st === "libre") return `${a.nombre}, ${a.empresa}: terminó ${conNombre(extra.listo.codigo, extra.listo.titulo)}; ahora va al descanso`;
  const estado = ESTADOS[a.st].corto;
  let detalle = "";
  if (a.st === "trabaja") detalle = `${a.run?.enCola ? " (en cola)" : ""}${a.run?.identifier ? ` en ${conNombre(a.run.identifier, a.run.titulo)}` : ""}`;
  if (a.st === "toca") detalle = ` en ${codigos(a.teNecesita)}`;
  const hora = a.st === "trabaja" && !a.run?.enCola && extra.hora ? `; ${extra.hora}` : "";
  const ademas = a.need && a.st !== "toca" ? `; además te necesita en ${codigos(a.teNecesita)}` : "";
  return `${a.nombre}, ${a.empresa}: ${estado}${detalle}${hora}${ademas}`;
}

/** El piso de abajo del globo (JST-163 §8): la mano con lo que te pide, o la hora estimada. */
export type PisoAbajo = { tipo: "mano"; codigo: string | null; mas: number } | { tipo: "hora"; texto: string; lleva: boolean };

/**
 * Qué va en el piso de abajo del globo de dos pisos (JST-163 §8 y §9), o
 * `null` si va de un piso. Quien trabaja (o tiene error) y además te espera:
 * la mano con el código de su primera espera y «+N» — la mano gana siempre y
 * la hora queda en el tooltip, la ficha y el rótulo. Si no te espera, quien
 * trabaja lleva su hora estimada; en cola o sin dato, nada. Nada cambia solo:
 * con lo mismo, a cualquier hora, el mismo piso (la propuesta B daba vuelta el
 * globo cada 3 s; se eligió la A).
 */
export function pisoDeAbajo(a: Pick<AgenteVista, "st" | "need" | "teNecesita" | "run">, hora: Estimacion | null, ahora: number): PisoAbajo | null {
  if (a.st !== "trabaja" && a.st !== "error") return null;
  if (a.need) return { tipo: "mano", codigo: a.teNecesita[0]?.identifier ?? null, mas: Math.max(0, a.teNecesita.length - 1) };
  if (a.st !== "trabaja" || a.run?.enCola) return null;
  const texto = textoGlobo(hora, ahora);
  return texto ? { tipo: "hora", texto, lleva: hora?.tipo === "lleva" } : null;
}

export interface ContadoresVista {
  trabaja: number;
  toca: number;
  error: number;
  pausa: number;
  libre: number;
}

/** Contadores independientes (§5): «te necesitan» cuenta a todos los que esperan, aunque trabajen o tengan error. */
export function contarVista(agentes: readonly AgenteVista[]): ContadoresVista {
  const c: ContadoresVista = { trabaja: 0, toca: 0, error: 0, pausa: 0, libre: 0 };
  for (const a of agentes) {
    if (a.st !== "toca") c[a.st] += 1;
    if (a.need) c.toca += 1;
  }
  return c;
}

/** «recién», «hace 4 min», «hace 2 h», «hace 3 días»; con `largo`, «desde ayer». */
export function hace(iso: string | null | undefined, ahora: number, largo = false): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const m = Math.max(0, Math.round((ahora - t) / 60000));
  if (m < 1) return "recién";
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (largo && d === 1) return "desde ayer";
  return `hace ${d} ${d === 1 ? "día" : "días"}`;
}

/** «desde las 18:52», «desde ayer» o «desde el 15 oct» (en pausa, §9). */
export function desdeCuando(iso: string | null | undefined, ahora: number): string {
  if (!iso) return "";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  const hoy = new Date(ahora);
  const dia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dias = Math.round((dia(hoy) - dia(t)) / 86_400_000);
  if (dias <= 0) return `desde las ${t.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}`;
  if (dias === 1) return "desde ayer";
  return `desde el ${t.toLocaleDateString("es", { day: "numeric", month: "short" }).replace(".", "")}`;
}

/** `pauseReason` del servidor en palabras. */
export function motivoPausa(motivo: string): string {
  const conocidos: Record<string, string> = {
    manual: "La pausaron a mano",
    budget: "Se le acabó el presupuesto",
    budget_exceeded: "Se le acabó el presupuesto",
  };
  return conocidos[motivo] ?? motivo;
}

/** Los primeros 4 caracteres del run, como en la ficha («Run 4f2a»). */
export function runCorto(id: string): string {
  return id.slice(0, 4);
}

/** Lo que se lee en un monitor de la vista 3D al acercarte: un tono (el color del estado), el código, qué pasa y de qué se trata. */
export interface Pantalla {
  tono: Dibujo;
  codigo: string | null;
  estado: string;
  texto: string | null;
}

/**
 * El monitor de un agente: lo que te espera (va primero, como en su globo), en
 * qué trabaja (o qué tiene en cola), su error o su pausa. Libre, nada: la
 * pantalla queda como se dibuja.
 */
export function pantallaDe(a: Pick<AgenteVista, "st" | "need" | "teNecesita" | "run" | "motivo">): Pantalla | null {
  const e = a.need ? a.teNecesita[0] : undefined;
  if (e) return { tono: "toca", codigo: e.identifier, estado: "te espera", texto: e.titulo ?? e.tituloTarea };
  if (a.st === "trabaja") return { tono: "trabaja", codigo: a.run?.identifier ?? null, estado: a.run?.enCola ? "en cola" : "trabajando", texto: a.run?.titulo ?? null };
  if (a.st === "error") return { tono: "error", codigo: a.run?.identifier ?? null, estado: "con error", texto: a.motivo };
  if (a.st === "pausa") return { tono: "pausa", codigo: null, estado: "en pausa", texto: a.motivo ? motivoPausa(a.motivo) : null };
  return null;
}

/** Tu monitor: cuántos te esperan en esa sala (o que estás al día). */
export function pantallaTuya(esperan: number): Pantalla {
  if (esperan === 0) return { tono: "libre", codigo: null, estado: "al día", texto: "Nadie te espera aquí." };
  return { tono: "toca", codigo: null, estado: esperan === 1 ? "1 te espera" : `${esperan} te esperan`, texto: "Haz clic para ver la fila y responder." };
}
