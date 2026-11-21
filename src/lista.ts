// Lista de agentes bajo la oficina (design-spec de JST-95 §3), sin React:
// grupos por urgencia, orden dentro de cada grupo y la línea de contexto.
import { ESPERAS, ESTADOS, desdeCuando, hace, motivoPausa, runCorto, type AgenteVista, type Dibujo } from "./vista.js";
import { esErrorViejo, silenciadosPorOmision, type Silenciados } from "./erroresViejos.js";
import { tituloVisible, type Espera } from "./estado.js";
import { t } from "./i18n.js";

export type Grupo = "toca" | "error" | "trabaja" | "pausa" | "viejos" | "libre";

export const GRUPOS: ReadonlyArray<{ k: Grupo; label: string; icono: string; pista: string | null }> = [
  { k: "toca", label: t("Te necesitan"), icono: "hand", pista: t("el que espera hace más, arriba") },
  { k: "error", label: t("Con error"), icono: "triangle-alert", pista: t("el más reciente, arriba") },
  { k: "trabaja", label: t("Trabajando"), icono: "keyboard", pista: t("el que empezó último, arriba") },
  { k: "pausa", label: t("En pausa"), icono: "moon", pista: null },
  { k: "viejos", label: t("Errores antiguos"), icono: "triangle-alert", pista: t("de hace más de un día o silenciados") },
  { k: "libre", label: t("Libres"), icono: "coffee", pista: null },
];

/** En el celular vienen plegados «En pausa» y «Libres» (§3). */
export const PLEGADOS_CELULAR: readonly Grupo[] = ["pausa", "libre"];

/** JST-410: en el computador viene plegado «Libres» (son muchos y dicen lo mismo); «Errores antiguos» viene abierto. */
export const PLEGADOS_COMPUTADOR: readonly Grupo[] = ["libre"];

/** JST-410: un libre que lleva más de estos días en la sala de descanso es un agente sin uso. */
export const DIAS_SIN_USO = 30;

/** Si el grupo viene abierto sin que el usuario haya tocado nada (JST-410: en computador, solo «Libres» viene plegado). */
export function abiertoPorOmision(k: Grupo, celular: boolean): boolean {
  return !(celular ? PLEGADOS_CELULAR : PLEGADOS_COMPUTADOR).includes(k);
}

/** Lo que el usuario abrió (`true`) o plegó (`false`), por grupo y por vista: el celular y el computador no se pisan. */
export interface Plegados {
  computador: Partial<Record<Grupo, boolean>>;
  celular: Partial<Record<Grupo, boolean>>;
}

export const CLAVE_PLEGADOS = "jstm.oficina-pixel.lista-plegados";

const SIN_PLEGADOS = (): Plegados => ({ computador: {}, celular: {} });

/** Lo guardado, tolerante: JSON inválido, otra forma o un grupo desconocido → se ignora. */
export function leerPlegados(texto: string | null | undefined): Plegados {
  const salida = SIN_PLEGADOS();
  if (!texto) return salida;
  let v: unknown;
  try {
    v = JSON.parse(texto);
  } catch {
    return salida;
  }
  if (!v || typeof v !== "object") return salida;
  for (const vista of ["computador", "celular"] as const) {
    const m = (v as Record<string, unknown>)[vista];
    if (!m || typeof m !== "object") continue;
    for (const g of GRUPOS) {
      const x = (m as Record<string, unknown>)[g.k];
      if (typeof x === "boolean") salida[vista][g.k] = x;
    }
  }
  return salida;
}

export const escribirPlegados = (p: Plegados): string => JSON.stringify(p);

/** ¿Está abierto el grupo? Lo que eligió el usuario en esa vista, o lo de por omisión. */
export function estaAbierto(p: Plegados, k: Grupo, celular: boolean): boolean {
  return p[celular ? "celular" : "computador"][k] ?? abiertoPorOmision(k, celular);
}

/** Abre o pliega el grupo (al revés de como está) y lo recuerda. */
export function alternarPlegado(p: Plegados, k: Grupo, celular: boolean): Plegados {
  const vista = celular ? "celular" : "computador";
  return { ...p, [vista]: { ...p[vista], [k]: !estaAbierto(p, k, celular) } };
}

/**
 * Quien te espera va solo en «Te necesitan», en cualquier estado; los demás, en
 * el de su estado, salvo el error viejo (de hace más de un día o silenciado), que
 * va en «Errores antiguos» (JST-410). `ahora` y `silenciados` son opcionales.
 */
export function grupoDe(a: AgenteVista, ahora: number = Date.now(), silenciados: Silenciados = silenciadosPorOmision()): Grupo {
  if (a.need) return "toca";
  return esErrorViejo(a, ahora, silenciados) ? "viejos" : a.st;
}

/** Los días que lleva un agente libre (sin nada que te espere) en la sala de descanso, si pasan de `DIAS_SIN_USO`; si no, `null`. */
export function diasSinUso(a: Pick<AgenteVista, "st" | "need" | "desde">, ahora: number): number | null {
  if (a.st !== "libre" || a.need || !a.desde) return null;
  const inicio = Date.parse(a.desde);
  if (Number.isNaN(inicio)) return null;
  const dias = Math.floor((ahora - inicio) / 86_400_000);
  return dias > DIAS_SIN_USO ? dias : null;
}

/** La marca de la fila de un agente sin uso: «Sin uso hace 45 días» (el tiempo, con el formato de `hace`). */
export function marcaSinUso(a: Pick<AgenteVista, "st" | "need" | "desde">, ahora: number): string | null {
  return diasSinUso(a, ahora) === null ? null : t("Sin uso {cuando}", { cuando: hace(a.desde, ahora) });
}

const ms = (iso: string | null | undefined) => {
  const t0 = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t0) ? 0 : t0;
};

/** La espera más antigua (ms). */
export function primeraEspera(a: AgenteVista): number {
  const t = a.teNecesita.map((e) => ms(e.desde)).filter((x) => x > 0);
  return t.length ? Math.min(...t) : 0;
}

/**
 * Orden dentro de un grupo: en «Te necesitan», la espera más antigua primero;
 * en los demás, `since` más reciente primero (en «Trabajando», el que empezó
 * último). Si empatan, por prefijo de empresa y después por nombre.
 */
export function comparar(a: AgenteVista, b: AgenteVista): number {
  const orden = a.need ? primeraEspera(a) - primeraEspera(b) : ms(b.desde) - ms(a.desde);
  return orden || a.prefijo.localeCompare(b.prefijo) || a.nombre.localeCompare(b.nombre) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export interface GrupoLista {
  k: Grupo;
  label: string;
  icono: string;
  agentes: AgenteVista[];
  /** Los de este estado que van arriba porque además te necesitan («y 1 más arriba…»). */
  arriba: number;
  /** «el que espera hace más, arriba» (solo computador, con 2 o más). */
  pista: string | null;
  /** Solo en «Libres» (JST-410): cuántos llevan más de 30 días sin uso. */
  sinUso: number;
}

/**
 * Los 6 grupos en orden, sin los vacíos. `sinAtencion`: «Te toca» no
 * respondió; «Te necesitan» se muestra igual, con «?» (§3, estados).
 * JST-410: `ahora` y `silenciados` (opcionales) deciden quién va a «Errores antiguos».
 */
export function agrupar(agentes: readonly AgenteVista[], sinAtencion = false, ahora: number = Date.now(), silenciados: Silenciados = silenciadosPorOmision()): GrupoLista[] {
  return GRUPOS.map((g) => {
    const lista = agentes.filter((a) => grupoDe(a, ahora, silenciados) === g.k).sort(comparar);
    const arriba = g.k === "toca" ? 0 : agentes.filter((a) => a.need && a.st === g.k).length;
    const sinUso = g.k === "libre" ? lista.filter((a) => diasSinUso(a, ahora) !== null).length : 0;
    return { k: g.k, label: g.label, icono: g.icono, agentes: lista, arriba, pista: g.pista, sinUso };
  }).filter((g) => g.agentes.length > 0 || (g.k === "toca" && sinAtencion));
}

/** «· y 1 más arriba, que además te necesita», «· 4 sin uso hace más de 30 días» o la pista del orden. `null` si no va nada. */
export function notaGrupo(g: GrupoLista, celular: boolean): string | null {
  if (g.arriba > 0) return g.arriba === 1 ? t("· y {n} más arriba, que además te necesita", { n: g.arriba }) : t("· y {n} más arriba, que además te necesitan", { n: g.arriba });
  if (g.k === "libre" && g.sinUso > 0) return t("· {n} sin uso hace más de {dias} días", { n: g.sinUso, dias: DIAS_SIN_USO });
  if (!celular && g.pista && g.agentes.length > 1) return `· ${g.pista}`;
  return null;
}

/** La tarea que se muestra en la fila: la de la espera, la del run o la última (si se conoce). */
export interface TareaFila {
  identifier: string;
  titulo: string | null;
}

export interface LineaFila {
  tarea: TareaFila | null;
  contexto: string;
  /** Color de la línea de contexto: violeta (te espera) o rojo (error). */
  tono: "toca" | "error" | null;
  /** Solo un libre sin uso (JST-410): «Sin uso hace 45 días», atenuado. */
  sinUso?: string;
}

function preguntaDe(e: Espera): string {
  return e.titulo != null ? tituloVisible(e.titulo) : ESPERAS[e.tipo].label;
}

/**
 * Lo que dice la fila (§3): código y título de la tarea, y debajo una línea de
 * contexto. `ultima`: la última tarea de un agente libre o en pausa, si se leyó.
 * `errorCode`: el código del último run de un agente con error, si se conoce
 * («adapter_failed · ‹motivo›»). `viejo` (JST-410): el error va en «Errores
 * antiguos»: dice lo mismo pero sin el rojo de alarma.
 */
export function lineaDe(a: AgenteVista, ahora: number, ultima?: TareaFila | null, errorCode?: string | null, viejo = false): LineaFila {
  if (a.need) {
    const e = a.teNecesita[0]!;
    const n = a.teNecesita.length;
    return {
      tarea: e.identifier ? { identifier: e.identifier, titulo: e.tituloTarea } : null,
      contexto: n > 1 ? t("Espera: {pregunta} (+{mas})", { pregunta: preguntaDe(e), mas: n - 1 }) : t("Espera: {pregunta}", { pregunta: preguntaDe(e) }),
      tono: "toca",
    };
  }
  const delRun = a.run?.identifier ? { identifier: a.run.identifier, titulo: a.run.titulo } : null;
  switch (a.st) {
    case "error": {
      const motivo = a.motivo ?? t("El último run terminó con error.");
      return { tarea: delRun ?? ultima ?? null, contexto: errorCode ? `${errorCode} · ${motivo}` : motivo, tono: viejo ? null : "error" };
    }
    case "trabaja":
      return {
        tarea: delRun,
        contexto: a.run?.enCola ? t("En cola, parte en segundos") : t("Run {run} · empezó {cuando}", { run: runCorto(a.run?.id ?? ""), cuando: hace(a.run?.desde ?? a.desde, ahora) }),
        tono: null,
      };
    case "pausa": {
      const motivo = a.motivo ? motivoPausa(a.motivo) : ESTADOS.pausa.label;
      return { tarea: ultima ?? null, contexto: `${motivo} · ${desdeCuando(a.desde, ahora)}`, tono: null };
    }
    default: {
      const linea: LineaFila = { tarea: ultima ?? null, contexto: ultima ? t("Última tarea · En la sala de descanso {cuando}", { cuando: hace(a.desde, ahora) }) : t("En la sala de descanso {cuando}", { cuando: hace(a.desde, ahora) }), tono: null };
      const sinUso = marcaSinUso(a, ahora);
      return sinUso ? { ...linea, sinUso } : linea;
    }
  }
}

/** Lo que va a la derecha de la fila en computador: el botón «Responder», «⚠ hace 4 min» o «hace X». */
export function cuandoFila(a: AgenteVista, ahora: number): string {
  if (a.need) return hace(new Date(primeraEspera(a) || Date.now()).toISOString(), ahora);
  return hace(a.desde, ahora);
}

/**
 * Tocar una fila (o un personaje) hace lo mismo (§3): quien solo te espera
 * (libre y con algo pendiente, sin run) abre directo la ventana para
 * responder; en los demás casos se abre su ficha.
 */
export function abreVentana(a: AgenteVista): boolean {
  return a.st === "toca";
}

/** Los estados que se dibujan en la fila, con sus íconos (§3). */
export function chipsDe(a: AgenteVista): Array<{ st: Dibujo; texto: string }> {
  // Quien solo te espera lleva «Te necesita» (el número va en «Responder · 3»); quien además trabaja,
  // tiene error o está en pausa suma el violeta, con el número si espera 2 o más.
  if (a.st === "toca") return [{ st: "toca", texto: ESTADOS.toca.label }];
  const chips: Array<{ st: Dibujo; texto: string }> = [{ st: a.st, texto: a.st === "trabaja" && a.run?.enCola ? t("En cola") : ESTADOS[a.st].label }];
  if (a.need) chips.push({ st: "toca", texto: a.teNecesita.length > 1 ? t("Te necesita · {n}", { n: a.teNecesita.length }) : t("Te necesita") });
  return chips;
}
