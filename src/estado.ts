// Estado de cada agente, sin React ni red: se arma con lo que devuelve la API
// de cada empresa. Lo usan la sonda (Node), la página de prueba y las pruebas.
//
// Fuentes (ver el documento `spike` de JST-66):
//   - Trabajando: run `running` o `queued` en `/live-runs`, con su tarea.
//   - Con error / En pausa / Libre: `status` del agente en `/agents`.
//   - Te necesita: feed de «Te toca» (`/attention`), unido al agente por la
//     tarea relacionada (`relatedIssue.metadata.assigneeAgentId`); una revisión
//     que quedó tuya, por quien pasó la tarea a revisión (JST-252). Una
//     revisión sin camino de una tarea que sigue del agente cuenta solo si
//     sigue ahí 1 min (`seguirSinCamino`, JST-266: el hueco de su monitor).
// «Te necesita» no reemplaza el estado base: un agente puede estar trabajando
// en una tarea y tener otra esperando tu respuesta. Se guarda aparte.
import type { AgenteApi, Empresa, ItemAtencion, LineaActividad, RunVivo, TareaRef } from "./shared.js";

export type EstadoBase = "trabajando" | "libre" | "error" | "pausa";

/**
 * Tipos de «te necesita» del diseño (JST-65 §9): tarjeta o pregunta, aprobación,
 * revisión y decisión. Un bloqueo no es uno de ellos desde JST-135 (ver `tipoEspera`).
 */
export type TipoEspera = "tarjeta" | "aprobacion" | "revision" | "decision";

export interface Espera {
  tipo: TipoEspera;
  itemId: string;
  /** Id de la tarjeta o de la aprobación (`subject.id`), para leerla y responderla (JST-94). */
  sujetoId: string | null;
  /** Clase de tarjeta (`ask_user_questions`…) o tipo de aprobación (`request_board_approval`…). */
  clase: string | null;
  issueId: string | null;
  identifier: string | null;
  /** Lo que espera: el título de la tarjeta o de la aprobación (o de la tarea, en una revisión). */
  titulo: string | null;
  /** El título de la tarea a la que va la espera. */
  tituloTarea: string | null;
  /** 0.8.0 (JST-241): la pregunta de la tarjeta según el feed (su primera pregunta, o el comienzo de lo que pregunta), para la voz. */
  pregunta?: string | null;
  /** 0.8.0: la tarjeta pide aprobar el plan de la tarea (apunta al documento `plan`). */
  plan?: boolean;
  /**
   * 0.9.1 (JST-254): la primera tarea que sugiere una tarjeta de tareas
   * sugeridas sin título propio (su `titulo` es esta misma tarea). La voz dice
   * «te necesito para elegir tareas: ‹esta›», no como si esa fuera la pregunta.
   */
  tareaSugerida?: string | null;
  /** Enlace del host a la tarjeta o la tarea (ya incluye el prefijo de la empresa). */
  href: string | null;
  desde: string | null;
}

export interface RunActual {
  id: string;
  issueId: string | null;
  identifier: string | null;
  titulo: string | null;
  /** `true` si el run espera turno (`queued`) y todavía no arranca. */
  enCola: boolean;
  /** Por qué partió (`timer`, `on_demand`…), para decir qué hace si no tiene tarea. */
  invocationSource?: string | null;
  desde: string | null;
  /** `/PREFIJO/agents/:agentId/runs/:runId`, la página nativa del run. */
  href: string;
  /** `/PREFIJO/issues/IDENT`, si se conoce el código de la tarea. */
  tareaHref: string | null;
  /** Estado de la tarea (`in_progress`…), si se conoce. */
  tareaStatus: string | null;
}

export interface AgenteOficina {
  id: string;
  companyId: string;
  prefijo: string;
  nombre: string;
  /** Cargo (`title`); si no tiene, el rol como lo escribe Paperclip («CEO», no `ceo`). */
  rol: string | null;
  /** Rol de Paperclip (`ceo`, `engineer`, `designer`, `qa`, `general`…). */
  rolApi: string | null;
  adapterType: string;
  esHermes: boolean;
  /** `status` crudo del agente, para depurar. */
  statusApi: string;
  base: EstadoBase;
  run: RunActual | null;
  /** Runs vivos además del actual (un agente puede tener varios en cola). */
  runsExtra: number;
  teNecesita: Espera[];
  /** Motivo del error o de la pausa, si el servidor lo da. */
  motivo: string | null;
  /**
   * Desde cuándo está en su estado: inicio del run (trabajando), `pausedAt`
   * (en pausa), último cambio del agente (con error) o último latido (libre).
   */
  desde: string | null;
}

/** Lo que se carga de una empresa. `atencion` es `null` si el feed no respondió (p. ej. 403 con una llave de agente). */
export interface DatosEmpresa {
  empresa: Empresa;
  agentes: AgenteApi[];
  runs: RunVivo[];
  atencion: ItemAtencion[] | null;
  /** Ítems de `atencion` que todavía no cuentan: revisiones sin camino del agente que pueden ser el hueco de su monitor (JST-266). */
  porConfirmar?: ReadonlySet<string>;
}

/**
 * Cómo escribe Paperclip cada rol en la página del agente y el organigrama
 * (`AGENT_ROLE_LABELS` de `@paperclipai/shared` 2026.824.1; el SDK no lo
 * exporta). Un rol que no esté aquí se muestra tal cual, como hace Paperclip.
 */
export const ETIQUETA_ROL: Readonly<Record<string, string>> = {
  ceo: "CEO",
  cto: "CTO",
  cmo: "CMO",
  cfo: "CFO",
  security: "Security",
  engineer: "Engineer",
  designer: "Designer",
  pm: "PM",
  qa: "QA",
  devops: "DevOps",
  researcher: "Researcher",
  general: "General",
};

/** Cargo que se muestra: el `title`; si no tiene, el rol como lo escribe Paperclip. */
export function cargoDe(agente: Pick<AgenteApi, "role" | "title">): string | null {
  if (agente.title) return agente.title;
  if (!agente.role) return null;
  return ETIQUETA_ROL[agente.role] ?? agente.role;
}

export function prefijoDe(empresa: Empresa): string {
  return (empresa.issuePrefix || empresa.name).toUpperCase();
}

/** Agentes que no aparecen en la oficina: los despedidos. */
export function agenteVisible(agente: AgenteApi): boolean {
  return agente.status !== "terminated";
}

/**
 * Orden de los agentes en su sala (design-spec de JST-65 §2): por nombre, como
 * los ordena Paperclip, y el `id` para desempatar. `/agents` no ordena: el
 * agente que se actualiza pasa al final y los demás cambiarían de escritorio (JST-78).
 */
export function porNombre(a: AgenteApi, b: AgenteApi): number {
  return a.name.localeCompare(b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * Estado base, en el orden del design-spec de JST-65 §5: en pausa > con error >
 * trabajando > libre. Un agente con error y un run en cola (un reintento) sigue
 * con error: el host lo pasa a `running` cuando el run arranca. Si el agente
 * dice `running` pero el run todavía no está en la lista (carrera entre
 * eventos), también cuenta como trabajando.
 */
export function estadoBase(agente: AgenteApi, runsDelAgente: readonly RunVivo[]): EstadoBase {
  if (agente.status === "paused" || agente.status === "pending_approval") return "pausa";
  if (agente.status === "error") return "error";
  if (runsDelAgente.length > 0 || agente.status === "running") return "trabajando";
  return "libre";
}

/** El run que se muestra: el que corre; si no, el más antiguo en cola. */
export function runPrincipal(runs: readonly RunVivo[]): RunVivo | null {
  const corriendo = runs.filter((run) => run.status === "running");
  const lista = corriendo.length > 0 ? corriendo : runs.filter((run) => run.status === "queued");
  if (lista.length === 0) return null;
  return [...lista].sort((a, b) => (a.startedAt ?? a.createdAt).localeCompare(b.startedAt ?? b.createdAt))[0] ?? null;
}

// ---------------------------------------------------------------------------
// «Te necesita»: el feed de «Te toca» unido a cada agente
// ---------------------------------------------------------------------------

/**
 * Tipos del feed que esperan una respuesta del usuario sobre una tarea. Quedan
 * fuera los que ya muestra otro estado (`failed_run`, `agent_error_alert`: con
 * error), los que no son de un agente (`budget_alert`, `join_request`…) y los
 * bloqueos (`blocker_attention`, JST-135): Paperclip los pone en «Te toca»
 * cuando el árbol de bloqueos no avanza solo, sin importar quién tiene que
 * actuar. Por la regla del equipo, un bloqueo no depende del usuario; si
 * depende, el agente deja una tarjeta, y esa sí levanta la mano.
 */
export function tipoEspera(item: ItemAtencion): TipoEspera | null {
  switch (item.sourceKind) {
    case "issue_thread_interaction":
      return "tarjeta";
    case "decision":
      return "decision";
    case "approval":
      return "aprobacion";
    case "review":
      return "revision";
    default:
      return null;
  }
}

/**
 * Quién pasó cada tarea a revisión, por empresa: tarea → agente (`null`: no
 * fue un agente). Una revisión que quedó del usuario (el agente se la asignó,
 * o tiene una etapa de revisión suya) llega al feed sin agente: el sujeto trae
 * `assigneeAgentId: null` y no hay `relatedIssue` (JST-252). Sale del evento
 * en vivo o, si no se vio, de la actividad de la tarea (`pasoARevision`).
 */
export type Entregas = ReadonlyMap<string, string | null>;

/**
 * Si esa línea pasa una tarea a revisión: la tarea y el agente que lo hizo
 * (`null` si fue el usuario o el sistema). Si no, `null`.
 */
export function pasoARevision(l: LineaActividad): { issueId: string; agenteId: string | null } | null {
  if (l.action !== "issue.updated" || typeof l.entityId !== "string") return null;
  const d = (l.details ?? {}) as { status?: unknown; changes?: { status?: { to?: unknown } } | null; _previous?: { status?: unknown } | null };
  const a = d.changes?.status ? d.changes.status.to : d._previous?.status !== undefined && d._previous.status !== "in_review" ? d.status : undefined;
  if (a !== "in_review") return null;
  const agente = l.actorType === "agent" ? (l.agentId ?? l.actorId) : null;
  return { issueId: l.entityId, agenteId: typeof agente === "string" ? agente : null };
}

/** La tarea de esa línea si cambió de estado (a revisión o a otro), o `null` (JST-266: su revisión puede volver a avisar). */
export function cambioDeEstado(l: LineaActividad): string | null {
  if (l.action !== "issue.updated" || typeof l.entityId !== "string") return null;
  const d = (l.details ?? {}) as { status?: unknown; changes?: { status?: unknown } | null; _previous?: { status?: unknown } | null };
  return d.changes?.status || (d._previous?.status !== undefined && d._previous.status !== d.status) ? l.entityId : null;
}

/** El agente que pasó la tarea a revisión la última vez, según su actividad (en cualquier orden), o `null`. */
export function agenteQuePasoARevision(actividad: readonly LineaActividad[]): string | null {
  const fecha = (l: LineaActividad) => (typeof l.createdAt === "string" ? l.createdAt : "");
  const ultima = [...actividad].sort((x, y) => fecha(y).localeCompare(fecha(x))).find((l) => pasoARevision(l));
  return ultima ? pasoARevision(ultima)!.agenteId : null;
}

/** La tarea de un ítem de revisión del feed (su sujeto), o `null` si no es una revisión. */
function tareaEnRevision(item: ItemAtencion): string | null {
  return item.sourceKind === "review" && item.subject?.kind === "issue" ? (item.subject.id ?? null) : null;
}

/**
 * Las tareas que te esperan por otra cosa además de la revisión (una tarjeta,
 * una aprobación). Su revisión no se une por `entregas`: lo que el agente te
 * pregunta es la tarjeta, y la tarea no cuenta dos veces.
 */
function conOtraEspera(items: readonly ItemAtencion[]): Set<string> {
  const ids = new Set<string>();
  for (const item of items) {
    const tipo = tipoEspera(item);
    const id = item.relatedIssue?.id ?? (item.subject?.kind === "issue" ? item.subject.id : null) ?? item.subject?.metadata?.issueId;
    if (tipo && tipo !== "revision" && id) ids.add(id);
  }
  return ids;
}

/** `entregas` sin las tareas que te esperan por otra cosa (`conOtraEspera`). */
function entregasLibres(items: readonly ItemAtencion[], entregas: Entregas): Entregas {
  if (entregas.size === 0) return entregas;
  const otras = conOtraEspera(items);
  return otras.size === 0 ? entregas : new Map([...entregas].filter(([id]) => !otras.has(id)));
}

/**
 * A qué agente le pertenece un ítem del feed, en este orden:
 *   1. el responsable de la tarea relacionada (lo trae el feed en `metadata`);
 *   2. el agente que creó la tarjeta;
 *   3. el responsable del sujeto cuando el sujeto es la tarea (revisión);
 *   4. en una revisión que quedó del usuario, el agente que pasó la tarea a revisión (`entregas`, JST-252;
 *      sin las tareas que además esperan una tarjeta o una aprobación, ver `esperasPorAgente`);
 *   5. el nombre del agente de origen (decisiones), dentro de la misma empresa.
 */
export function agenteDeItem(item: ItemAtencion, agentes: readonly AgenteApi[], entregas: Entregas = new Map()): string | null {
  const ids = new Set(agentes.map((agente) => agente.id));
  const revision = tareaEnRevision(item);
  const candidatos = [
    item.relatedIssue?.metadata?.assigneeAgentId,
    item.subject?.metadata?.createdByAgentId,
    item.subject?.kind === "issue" ? item.subject.metadata?.assigneeAgentId : null,
    revision ? entregas.get(revision) : null,
  ];
  for (const id of candidatos) if (id && ids.has(id)) return id;
  const porNombre = item.originAgentName ? agentes.find((agente) => agente.name === item.originAgentName) : undefined;
  return porNombre?.id ?? null;
}

export interface EsperasEmpresa {
  porAgente: Map<string, Espera[]>;
  /** Ítems de «Te toca» que no se pudieron unir a ningún agente. */
  sinAgente: Espera[];
}

/**
 * Títulos que Paperclip pone (en inglés) a una tarjeta sin título propio
 * (`interactionLabel` del feed, 2026.824.1). En ese caso la pregunta sale del
 * resumen del feed (`detail`).
 */
const TITULOS_GENERICOS = new Set(["Confirmation requested", "Selection confirmation requested", "Questions need answers", "Suggested tasks need a decision", "Item verdicts need a decision"]);

/** Lo que espera, en palabras: el título de la tarjeta o, si es el genérico del feed, su pregunta. */
export function tituloDeItem(item: ItemAtencion): string | null {
  const t = item.subject?.title ?? null;
  if (t && t.startsWith("Plan approval - ")) return `Aprobar el plan: ${t.slice("Plan approval - ".length)}`;
  if (t && !TITULOS_GENERICOS.has(t)) return t;
  const d = item.detail;
  return d?.promptExcerpt ?? d?.firstQuestionText ?? d?.firstTaskTitle ?? t;
}

/** La primera tarea sugerida, si la tarjeta de tareas sugeridas no tiene título propio (JST-254). */
function tareaSugeridaDe(item: ItemAtencion): string | null {
  const t = item.subject?.title ?? null;
  const d = item.detail;
  if (item.subject?.metadata?.kind !== "suggest_tasks" && d?.kind !== "suggested_tasks") return null;
  if (t && !TITULOS_GENERICOS.has(t)) return null;
  return d?.promptExcerpt || d?.firstQuestionText ? null : (d?.firstTaskTitle ?? null);
}

/** La más antigua primero, como la ventana para responder (design-spec de JST-95 §5). */
const porAntiguedad = (a: Espera, b: Espera) => (a.desde ?? "").localeCompare(b.desde ?? "") || a.itemId.localeCompare(b.itemId);

/**
 * `tareas`: códigos ya conocidos. Una aprobación no trae `relatedIssue`, solo
 * `subject.metadata.issueId`: su código sale de ahí (se lee con `/issues/:id`).
 * `entregas`: quién pasó cada tarea a revisión (JST-252). Una tarea que además
 * espera una tarjeta tuya no suma su revisión: «te necesito» dice la pregunta.
 */
export function esperasPorAgente(
  items: readonly ItemAtencion[],
  agentes: readonly AgenteApi[],
  tareas: ReadonlyMap<string, TareaRef> = new Map(),
  entregas: Entregas = new Map(),
): EsperasEmpresa {
  const porAgente = new Map<string, Espera[]>();
  const sinAgente: Espera[] = [];
  const libres = entregasLibres(items, entregas);
  for (const item of items) {
    const tipo = tipoEspera(item);
    if (!tipo) continue;
    const tarea = item.relatedIssue ?? (item.subject?.kind === "issue" ? item.subject : null);
    const issueId = tarea?.id ?? item.subject?.metadata?.issueId ?? null;
    const conocida = !tarea && issueId ? tareas.get(issueId) : undefined;
    const espera: Espera = {
      tipo,
      itemId: item.id,
      sujetoId: item.subject?.id ?? null,
      clase: tipo === "aprobacion" ? (item.subject?.metadata?.type ?? null) : tipo === "tarjeta" ? (item.subject?.metadata?.kind ?? null) : null,
      issueId,
      identifier: tarea?.identifier ?? conocida?.identifier ?? null,
      titulo: tituloDeItem(item) ?? tarea?.title ?? null,
      tituloTarea: tarea?.title ?? conocida?.title ?? null,
      pregunta: item.detail?.promptExcerpt ?? item.detail?.firstQuestionText ?? null,
      plan: item.subject?.metadata?.isPlanTarget === true || (item.subject?.title ?? "").startsWith("Plan approval - "),
      ...(tipo === "tarjeta" && tareaSugeridaDe(item) ? { tareaSugerida: tareaSugeridaDe(item) } : {}),
      href: item.subject?.href ?? tarea?.href ?? null,
      desde: item.createdAt ?? null,
    };
    const agenteId = agenteDeItem(item, agentes, libres);
    if (!agenteId) {
      sinAgente.push(espera);
      continue;
    }
    const lista = porAgente.get(agenteId) ?? [];
    lista.push(espera);
    porAgente.set(agenteId, lista);
  }
  for (const lista of porAgente.values()) lista.sort(porAntiguedad);
  return { porAgente, sinAgente };
}

/** Tareas de las aprobaciones de «Te toca» cuyo código todavía no se conoce. */
function tareasDeAprobaciones(items: readonly ItemAtencion[] | null): string[] {
  return (items ?? []).filter((i) => i.sourceKind === "approval" && !i.relatedIssue).map((i) => i.subject?.metadata?.issueId ?? "").filter(Boolean);
}

/** Tareas de las revisiones de «Te toca» que no tienen agente y cuya actividad no se ha leído (JST-252). */
export function revisionesSinAgente(items: readonly ItemAtencion[] | null, agentes: readonly AgenteApi[], entregas: Entregas): string[] {
  const visibles = agentes.filter(agenteVisible);
  const otras = conOtraEspera(items ?? []);
  const ids = new Set<string>();
  for (const item of items ?? []) {
    const id = tareaEnRevision(item);
    if (id && !entregas.has(id) && !otras.has(id) && !agenteDeItem(item, visibles)) ids.add(id);
  }
  return [...ids];
}

/** Tareas que están en revisión en «Te toca» (para olvidar quién pasó a revisión las que ya salieron). */
export function tareasEnRevision(items: readonly ItemAtencion[]): Set<string> {
  return new Set(items.map(tareaEnRevision).filter((id): id is string => !!id));
}

/**
 * Cuánto tiene que seguir en «Te toca» una revisión sin camino de una tarea que
 * sigue asignada a su agente para contar (JST-266). Paperclip la pone ahí
 * mientras el monitor del agente (el CI de GitHub…) ya venció y el planificador
 * todavía no lo dispara: corre cada 30 s, y en la real fueron de 6 a 27 s cada
 * 15 a 25 min, hasta que el agente lo vuelve a programar.
 */
export const REVISION_SIN_CAMINO_MS = 60_000;

/** Una revisión sin camino (`reviewAttentionState: stalled`) de una tarea que sigue asignada a un agente, no a ti. */
export function sinCaminoDelAgente(item: ItemAtencion): boolean {
  const m = item.subject?.metadata;
  return item.sourceKind === "review" && m?.reviewAttentionState === "stalled" && !!m.assigneeAgentId && !m.assigneeUserId;
}

/** Desde cuándo se ve una revisión sin camino del agente (ms) y si ya cuenta. */
export interface VistaSinCamino {
  desde: number;
  cuenta: boolean;
}

/**
 * Con cada lectura de «Te toca» de una empresa (JST-266): una revisión sin
 * camino del agente cuenta si se vio en las lecturas seguidas de los últimos
 * `REVISION_SIN_CAMINO_MS` o más; si falta en una, empieza de nuevo. `antes`:
 * lo de la lectura anterior, o `null` en la primera (al abrir o al volver a la
 * pestaña): ahí cuentan todas, porque no se sabe desde cuándo están (y lo que
 * ya esperaba no avisa). Devuelve lo que se sigue, las que todavía no cuentan
 * y en cuántos ms hay que volver a leer para ver si siguen (`null`: no hace falta).
 */
export function seguirSinCamino(
  items: readonly ItemAtencion[],
  antes: ReadonlyMap<string, VistaSinCamino> | null,
  ahora: number,
): { vistas: Map<string, VistaSinCamino>; porConfirmar: Set<string>; releerEn: number | null } {
  const vistas = new Map<string, VistaSinCamino>();
  const porConfirmar = new Set<string>();
  let releerEn: number | null = null;
  for (const item of items) {
    if (!sinCaminoDelAgente(item)) continue;
    const previa = antes?.get(item.id);
    const desde = previa?.desde ?? ahora;
    const cuenta = !antes || previa?.cuenta === true || ahora - desde >= REVISION_SIN_CAMINO_MS;
    vistas.set(item.id, { desde, cuenta });
    if (cuenta) continue;
    porConfirmar.add(item.id);
    const falta = desde + REVISION_SIN_CAMINO_MS - ahora;
    releerEn = releerEn === null ? falta : Math.min(releerEn, falta);
  }
  return { vistas, porConfirmar, releerEn };
}

// ---------------------------------------------------------------------------
// Oficina completa
// ---------------------------------------------------------------------------

function desdeEstado(base: EstadoBase, agente: AgenteApi, run: RunActual | null): string | null {
  switch (base) {
    case "trabajando":
      return run?.desde ?? agente.updatedAt ?? null;
    case "pausa":
      return agente.pausedAt ?? agente.updatedAt ?? null;
    case "error":
      return agente.updatedAt ?? null;
    case "libre":
      return agente.lastHeartbeatAt ?? agente.updatedAt ?? null;
  }
}

export function hrefRun(prefijo: string, agenteId: string, runId: string): string {
  return `/${encodeURIComponent(prefijo)}/agents/${encodeURIComponent(agenteId)}/runs/${encodeURIComponent(runId)}`;
}

export function hrefTarea(prefijo: string, identifier: string): string {
  return `/${encodeURIComponent(prefijo)}/issues/${encodeURIComponent(identifier)}`;
}

export function textoSinTarea(invocationSource: string | null | undefined): string {
  if (invocationSource === "timer") return "Latido";
  if (invocationSource === "on_demand") return "A pedido";
  return "Sin tarea";
}

/** El código de su tarea o, si no tiene, lo que hace el run; nunca el literal «run». */
export function textoRun(run: Pick<RunActual, "identifier" | "invocationSource"> | null | undefined): string {
  return run?.identifier ?? textoSinTarea(run?.invocationSource);
}

export function armarEmpresa(datos: DatosEmpresa, tareas: ReadonlyMap<string, TareaRef>, entregas: Entregas = new Map(), tareasTomadas: ReadonlyMap<string, string> = new Map()): AgenteOficina[] {
  const prefijo = prefijoDe(datos.empresa);
  const visibles = datos.agentes.filter(agenteVisible).sort(porNombre);
  const pc = datos.porConfirmar;
  const atencion = datos.atencion && pc?.size ? datos.atencion.filter((item) => !pc.has(item.id)) : datos.atencion;
  const esperas = atencion ? esperasPorAgente(atencion, visibles, tareas, entregas) : null;
  return visibles.map((agente) => {
    const runs = datos.runs.filter((run) => run.agentId === agente.id && (run.status === "running" || run.status === "queued"));
    const base = estadoBase(agente, runs);
    const principal = runPrincipal(runs);
    const issueId = principal ? (principal.issueId ?? tareasTomadas.get(principal.id) ?? null) : null;
    const tarea = issueId ? tareas.get(issueId) : undefined;
    const run: RunActual | null = principal
      ? {
          id: principal.id,
          issueId,
          identifier: tarea?.identifier ?? null,
          titulo: tarea?.title ?? null,
          enCola: principal.status === "queued",
          invocationSource: principal.invocationSource ?? null,
          desde: principal.startedAt ?? principal.createdAt,
          href: hrefRun(prefijo, agente.id, principal.id),
          tareaHref: tarea?.identifier ? hrefTarea(prefijo, tarea.identifier) : null,
          tareaStatus: tarea?.status ?? null,
        }
      : null;
    return {
      id: agente.id,
      companyId: agente.companyId,
      prefijo,
      nombre: agente.name,
      rol: cargoDe(agente),
      rolApi: agente.role ?? null,
      adapterType: agente.adapterType,
      esHermes: agente.adapterType === "hermes_gateway",
      statusApi: agente.status,
      base,
      run,
      runsExtra: Math.max(0, runs.length - 1),
      teNecesita: esperas?.porAgente.get(agente.id) ?? [],
      motivo: base === "error" ? (agente.errorReason ?? null) : base === "pausa" ? (agente.pauseReason ?? null) : null,
      desde: desdeEstado(base, agente, run),
    };
  });
}

export interface Contadores {
  agentes: number;
  trabajando: number;
  teNecesitan: number;
  conError: number;
  enPausa: number;
  libres: number;
}

/** Contadores independientes: un agente que trabaja y te necesita suma en los dos. */
export function contar(agentes: readonly AgenteOficina[]): Contadores {
  return {
    agentes: agentes.length,
    trabajando: agentes.filter((a) => a.base === "trabajando").length,
    teNecesitan: agentes.filter((a) => a.teNecesita.length > 0).length,
    conError: agentes.filter((a) => a.base === "error").length,
    enPausa: agentes.filter((a) => a.base === "pausa").length,
    libres: agentes.filter((a) => a.base === "libre").length,
  };
}

/** Tareas de los runs vivos (y de las aprobaciones que esperan) cuyo código todavía no se conoce. */
export function tareasFaltantes(empresas: readonly DatosEmpresa[], tareas: ReadonlyMap<string, TareaRef>): string[] {
  const ids = new Set<string>();
  for (const datos of empresas) {
    for (const run of datos.runs) if (run.issueId && !tareas.has(run.issueId)) ids.add(run.issueId);
    for (const id of tareasDeAprobaciones(datos.atencion)) if (!tareas.has(id)) ids.add(id);
  }
  return [...ids];
}
