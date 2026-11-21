// Lo que la oficina dibuja de cada agente (design-spec de JST-65 §5), sin React:
// la pose, la frase para el lector de pantalla, los contadores y los tiempos.
import { aspectoDe } from "./aspecto.js";
import { textoSinTarea, tituloVisible, type AgenteOficina, type Espera, type TipoEspera } from "./estado.js";
import { esErrorViejo, silenciadosPorOmision, type Silenciados } from "./erroresViejos.js";
import { textoGlobo, type Estimacion } from "./hora.js";
import { getLocale, localeTag, opcionesHora, t } from "./i18n.js";

/** Lo que se dibuja: el estado base, salvo que esté libre y te necesite (vuelve a su puesto y levanta la mano). */
export type Dibujo = "trabaja" | "toca" | "error" | "pausa" | "libre";

export const ORDEN_LEYENDA: readonly Dibujo[] = ["toca", "error", "trabaja", "pausa", "libre"];

export const ESTADOS: Record<Dibujo, { label: string; corto: string; muchos: string; icono: string; leyenda: string }> = {
  trabaja: { label: t("Trabajando"), corto: t("trabajando"), muchos: t("trabajando"), icono: "keyboard", leyenda: t("teclea; globo con la tarea") },
  toca: { label: t("Te necesita"), corto: t("te necesita"), muchos: t("te necesitan"), icono: "hand", leyenda: t("levanta la mano, o la muestra en su globo") },
  error: { label: t("Con error"), corto: t("con error"), muchos: t("con error"), icono: "triangle-alert", leyenda: t("se pone rojo") },
  pausa: { label: t("En pausa"), corto: t("en pausa"), muchos: t("en pausa"), icono: "moon", leyenda: t("duerme") },
  libre: { label: t("Libre"), corto: t("libre"), muchos: t("libres"), icono: "coffee", leyenda: t("en la sala de descanso") },
};

/** Tipos de «te necesita» (§9): etiqueta, ícono y botón de la ficha. */
export const ESPERAS: Record<TipoEspera, { label: string; icono: string; boton: string }> = {
  tarjeta: { label: t("Tarjeta"), icono: "message-square", boton: t("Responder") },
  aprobacion: { label: t("Aprobación"), icono: "check-check", boton: t("Aprobar o rechazar") },
  revision: { label: t("Revisión"), icono: "eye", boton: t("Revisar") },
  decision: { label: t("Decisión"), icono: "list-checks", boton: t("Decidir") },
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
const conNombre = (codigo: string | null, titulo: string | null | undefined) => `${codigo ?? t("una tarea")}${titulo ? ` · ${titulo}` : ""}`;
/** Lo que te pide cada espera: el título de la tarjeta o de la aprobación; si no hay, el de la tarea. */
const codigos = (esperas: readonly Espera[]) => esperas.map((e) => conNombre(e.identifier, e.titulo != null ? tituloVisible(e.titulo) : e.tituloTarea)).join(", ");

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
  if (extra.listo && a.st === "libre") return t("{nombre}, {empresa}: terminó {tarea}; ahora va al descanso", { nombre: a.nombre, empresa: a.empresa, tarea: conNombre(extra.listo.codigo, extra.listo.titulo) });
  const estado = ESTADOS[a.st].corto;
  let detalle = "";
  if (a.st === "trabaja" && a.run) {
    const reserva = a.run.identifier ? [] : [textoSinTarea(a.run.invocationSource).toLocaleLowerCase("es")];
    if (a.run.enCola) reserva.unshift(t("en cola"));
    detalle = `${reserva.length ? ` (${reserva.join(", ")})` : ""}${a.run.identifier ? t(" en {tarea}", { tarea: conNombre(a.run.identifier, a.run.titulo) }) : ""}`;
  }
  if (a.st === "toca") detalle = t(" en {tarea}", { tarea: codigos(a.teNecesita) });
  const hora = a.st === "trabaja" && !a.run?.enCola && extra.hora ? `; ${extra.hora}` : "";
  const ademas = a.need && a.st !== "toca" ? t("; además te necesita en {tarea}", { tarea: codigos(a.teNecesita) }) : "";
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
  /** Con error de hace más de un día o silenciado (JST-410): ya no cuentan en `error`. */
  erroresViejos: number;
}

/**
 * Contadores independientes (§5): «te necesitan» cuenta a todos los que esperan, aunque trabajen o tengan error.
 * JST-410: los errores viejos no suman en «con error»; van en `erroresViejos`. `ahora` (por omisión, la hora de
 * ahora) y `silenciados` (por omisión, los del almacén del navegador, o ninguno) son opcionales.
 */
export function contarVista(agentes: readonly AgenteVista[], ahora: number = Date.now(), silenciados: Silenciados = silenciadosPorOmision()): ContadoresVista {
  const c: ContadoresVista = { trabaja: 0, toca: 0, error: 0, pausa: 0, libre: 0, erroresViejos: 0 };
  for (const a of agentes) {
    if (esErrorViejo(a, ahora, silenciados)) c.erroresViejos += 1;
    else if (a.st !== "toca") c[a.st] += 1;
    if (a.need) c.toca += 1;
  }
  return c;
}

/** «recién», «hace 4 min», «hace 2 h», «hace 3 días»; con `largo`, «desde ayer». */
export function hace(iso: string | null | undefined, ahora: number, largo = false): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const m = Math.max(0, Math.round((ahora - ms) / 60000));
  if (m < 1) return t("recién");
  if (m < 60) return t("hace {m} min", { m });
  const h = Math.round(m / 60);
  if (h < 24) return t("hace {h} h", { h });
  const d = Math.round(h / 24);
  if (largo && d === 1) return t("desde ayer");
  return d === 1 ? t("hace {d} día", { d }) : t("hace {d} días", { d });
}

/**
 * Etiqueta de las horas «18:52». En español queda «es» (24 h) como antes de JST-413: «es-CL» las dice «06:52 p. m.».
 * Los demás idiomas usan la suya.
 */
export const tagHora = (): string => (getLocale() === "es" ? "es" : localeTag());

/** «desde las 18:52», «desde ayer» o «desde el 15 oct» (en pausa, §9). */
export function desdeCuando(iso: string | null | undefined, ahora: number): string {
  if (!iso) return "";
  const f = new Date(iso);
  if (Number.isNaN(f.getTime())) return "";
  const hoy = new Date(ahora);
  const dia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dias = Math.round((dia(hoy) - dia(f)) / 86_400_000);
  if (dias <= 0) return t("desde las {hora}", { hora: f.toLocaleTimeString(tagHora(), { hour: "2-digit", minute: "2-digit", ...opcionesHora() }) });
  if (dias === 1) return t("desde ayer");
  return t("desde el {fecha}", { fecha: f.toLocaleDateString(tagHora(), { day: "numeric", month: "short" }).replace(".", "") });
}

/** `pauseReason` del servidor en palabras. */
export function motivoPausa(motivo: string): string {
  const conocidos: Record<string, string> = {
    manual: t("La pausaron a mano"),
    budget: t("Se le acabó el presupuesto"),
    budget_exceeded: t("Se le acabó el presupuesto"),
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
  if (e) return { tono: "toca", codigo: e.identifier, estado: t("te espera"), texto: e.titulo != null ? tituloVisible(e.titulo) : e.tituloTarea };
  if (a.st === "trabaja") return { tono: "trabaja", codigo: a.run?.identifier ?? null, estado: a.run?.enCola ? t("en cola") : t("trabajando"), texto: a.run?.titulo ?? (a.run ? textoSinTarea(a.run.invocationSource) : null) };
  if (a.st === "error") return { tono: "error", codigo: a.run?.identifier ?? null, estado: t("con error"), texto: a.motivo };
  if (a.st === "pausa") return { tono: "pausa", codigo: null, estado: t("en pausa"), texto: a.motivo ? motivoPausa(a.motivo) : null };
  return null;
}

/** Tu monitor: cuántos te esperan en esa sala (o que estás al día). */
export function pantallaTuya(esperan: number): Pantalla {
  if (esperan === 0) return { tono: "libre", codigo: null, estado: t("al día"), texto: t("Nadie te espera aquí.") };
  return { tono: "toca", codigo: null, estado: esperan === 1 ? t("1 te espera") : t("{n} te esperan", { n: esperan }), texto: t("Haz clic para ver la fila y responder.") };
}
