// Endpoints del host que usa la oficina. No son parte del SDK (como en
// `bridge.ts` de Board global): si cambian en una actualización de Paperclip,
// se ajusta solo este archivo.
//
// Todo se lee con la sesión del usuario, en el navegador y en el mismo origen:
//   - `GET /api/companies`                     empresas visibles (sin archivadas)
//   - `GET /api/companies/:id/agents`          agentes y su `status`
//   - `GET /api/companies/:id/live-runs`       runs `queued`/`running` (sin `minCount`)
//   - `GET /api/companies/:id/attention`       «Te toca» (403 con llave de agente)
//   - `GET /api/issues/:id`                    código de la tarea de un run
//   - `GET /api/companies/:id/heartbeat-runs`  último run de un agente (ficha) y sus últimos 30, para la hora estimada (0.5.0)
//   - `GET /api/heartbeat-runs/:id/log`        final del log, al abrir la ficha de un agente con error (0.2.0)
//   - `GET /api/issues/:id/interactions`       tarjetas de una tarea, al abrir la ventana para responder (0.2.0)
//   - `GET /api/approvals/:id`                 una aprobación, al abrir la ventana (0.2.0)
//   - `GET /api/companies/:id/issues`          lo último que terminó y la cola de un agente, para las conversaciones (0.3.0);
//                                              lo terminado del período y las abiertas, para el Resumen (0.9.0);
//                                              la tarea que tomó un run sin `issueId` (JST-374)
//   - `GET /api/issues/:id`                    también la cadena hacia arriba (`ancestors`) de una tarea terminada, para el Resumen
//   - `ws(s)://…/api/companies/:id/events/ws`  canal en vivo de la empresa
// El canal en vivo es el mismo que usa la app de Paperclip para refrescarse.
// Acepta la cookie de sesión (modo authenticated) o una llave de agente de esa
// empresa; no acepta el token de un run.
//
// Lo único que escribe es `enviar` (0.2.0, JST-97): un solo POST cuando el
// usuario toca enviar en la ventana para responder, con su sesión, así que la
// respuesta queda a su nombre. Nunca al cargar ni al actualizarse.
//
// 0.5.0 (JST-167): `accionPlugin` le habla al worker de este mismo plugin
// (`POST /api/plugins/:id/actions/:clave`) para que prepare las frases de las
// voces con el nombre de la tarea. No cambia nada en Paperclip.
import type { AgenteApi, Aprobacion, Empresa, EventoVivo, Interaccion, ItemAtencion, LineaActividad, RunResumen, RunVivo, TareaRef, TramoLog } from "./shared.js";

export interface Conexion {
  /** `""` en el navegador (mismo origen); `http://host:puerto` en Node. */
  base: string;
  /** Encabezados extra (en Node, la cookie de sesión). */
  headers?: Record<string, string>;
  /** Se llama una vez por petición HTTP, con la ruta sin IDs, para medir la carga. */
  alLlamar?: (ruta: string) => void;
  /** Cómo abrir el canal en vivo; por defecto `new WebSocket(url)`. */
  crearSocket?: (url: string) => WebSocket;
}

export class ErrorHttp extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export function rutaSinIds(path: string): string {
  return path.split("?")[0]!.replace(UUID, ":id");
}

async function pedir<T>(cx: Conexion, path: string): Promise<T> {
  cx.alLlamar?.(rutaSinIds(path));
  const response = await fetch(`${cx.base}/api${path}`, {
    credentials: "include",
    headers: { Accept: "application/json", ...cx.headers },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.message ?? body?.error ?? `HTTP ${response.status}`;
    throw new ErrorHttp(response.status, typeof message === "string" ? message : JSON.stringify(message));
  }
  return body as T;
}

export async function listarEmpresas(cx: Conexion): Promise<Empresa[]> {
  const empresas = await pedir<Empresa[]>(cx, "/companies");
  return empresas.filter((empresa) => empresa.status !== "archived");
}

/** Una empresa por ID (sirve con la llave de un agente, que no puede listar empresas). */
export function leerEmpresa(cx: Conexion, companyId: string): Promise<Empresa> {
  return pedir(cx, `/companies/${encodeURIComponent(companyId)}`);
}

export function listarAgentes(cx: Conexion, companyId: string): Promise<AgenteApi[]> {
  return pedir(cx, `/companies/${encodeURIComponent(companyId)}/agents`);
}

/** Sin `minCount` el servidor devuelve solo los runs vivos (`queued` y `running`). */
export function listarRunsVivos(cx: Conexion, companyId: string): Promise<RunVivo[]> {
  return pedir(cx, `/companies/${encodeURIComponent(companyId)}/live-runs`);
}

/** «Te toca». Devuelve `null` si el feed no está disponible para esta sesión (403). */
export async function listarAtencion(cx: Conexion, companyId: string): Promise<ItemAtencion[] | null> {
  try {
    const feed = await pedir<{ items?: ItemAtencion[] }>(cx, `/companies/${encodeURIComponent(companyId)}/attention`);
    return Array.isArray(feed.items) ? feed.items : [];
  } catch (error) {
    if (error instanceof ErrorHttp && error.status === 403) return null;
    throw error;
  }
}

export async function leerTarea(cx: Conexion, issueId: string): Promise<TareaRef> {
  const issue = await pedir<TareaRef>(cx, `/issues/${encodeURIComponent(issueId)}`);
  return { id: issue.id, identifier: issue.identifier ?? null, title: issue.title, status: issue.status ?? null };
}

/** La tarea en curso que tomó un run que partió sin `issueId` (JST-374). */
export async function tareaDelRun(cx: Conexion, companyId: string, agentId: string, runId: string): Promise<TareaRef | null> {
  const filas = await pedir<Array<TareaRef & { executionRunId?: string | null; checkoutRunId?: string | null }>>(
    cx,
    `/companies/${encodeURIComponent(companyId)}/issues?assigneeAgentId=${encodeURIComponent(agentId)}&status=in_progress`,
  );
  const tarea = filas.find((fila) => fila.executionRunId === runId || fila.checkoutRunId === runId);
  return tarea ? { id: tarea.id, identifier: tarea.identifier ?? null, title: tarea.title, status: tarea.status ?? null } : null;
}

/** Actividad de una tarea (`GET /api/issues/:id/activity`, la más nueva primero): quién la pasó a revisión (JST-252). */
export async function leerActividad(cx: Conexion, issueId: string): Promise<LineaActividad[]> {
  const lineas = await pedir<unknown>(cx, `/issues/${encodeURIComponent(issueId)}/activity`);
  return Array.isArray(lineas) ? lineas : [];
}

/** Último run de un agente (terminado o no), para la «última tarea» de la ficha. */
export async function ultimoRun(cx: Conexion, companyId: string, agentId: string): Promise<RunResumen | null> {
  const runs = await pedir<RunResumen[]>(
    cx,
    `/companies/${encodeURIComponent(companyId)}/heartbeat-runs?agentId=${encodeURIComponent(agentId)}&limit=1&summary=true`,
  );
  return runs[0] ?? null;
}

/** Los últimos 30 runs de un agente, para la hora estimada (0.5.0, JST-161): 1 lectura por agente al cargar (~27 KB). */
export function runsDelAgente(cx: Conexion, companyId: string, agentId: string): Promise<RunResumen[]> {
  return pedir<RunResumen[]>(cx, `/companies/${encodeURIComponent(companyId)}/heartbeat-runs?agentId=${encodeURIComponent(agentId)}&limit=30&summary=true`);
}

/** Un tramo del log de un run, por bytes (no hay «últimas N líneas»). 404 si el run no dejó log. */
export function leerLog(cx: Conexion, runId: string, offset: number, limitBytes: number): Promise<TramoLog> {
  return pedir(cx, `/heartbeat-runs/${encodeURIComponent(runId)}/log?offset=${Math.max(0, Math.floor(offset))}&limitBytes=${limitBytes}`);
}

/** Tarjetas de una tarea. No hay una lista de toda la empresa: se busca la de «Te toca» por id. */
export function listarInteracciones(cx: Conexion, issueId: string): Promise<Interaccion[]> {
  return pedir(cx, `/issues/${encodeURIComponent(issueId)}/interactions`);
}

/** Fila de `/issues?view=compact` con lo que usan las conversaciones (0.3.0). */
interface TareaCompacta {
  id: string;
  identifier?: string | null;
  title: string;
  status?: string | null;
  completedAt?: string | null;
  updatedAt?: string | null;
}

/**
 * Lo último que terminó un agente, para las conversaciones (JST-96 §6), con su
 * nombre para el rótulo (JST-138 §2). `en` es cuándo se terminó (o se
 * actualizó por última vez), para contar 24 h.
 */
export async function terminadaDelAgente(cx: Conexion, companyId: string, agentId: string): Promise<{ identifier: string | null; titulo: string | null; en: number } | null> {
  const filas = await pedir<TareaCompacta[]>(
    cx,
    `/companies/${encodeURIComponent(companyId)}/issues?assigneeAgentId=${encodeURIComponent(agentId)}&status=done&sortField=updated&sortDir=desc&limit=1&view=compact`,
  );
  const t = filas[0];
  if (!t) return null;
  const en = Date.parse(t.completedAt ?? t.updatedAt ?? "");
  return { identifier: t.identifier ?? null, titulo: t.title || null, en: Number.isNaN(en) ? 0 : en };
}

/** Las primeras 3 tareas de la cola de un agente (`todo`, `blocked` o `in_review`), para las conversaciones. */
export async function colaDelAgente(cx: Conexion, companyId: string, agentId: string): Promise<TareaRef[]> {
  const filas = await pedir<TareaCompacta[]>(
    cx,
    `/companies/${encodeURIComponent(companyId)}/issues?assigneeAgentId=${encodeURIComponent(agentId)}&status=todo,blocked,in_review&view=compact&limit=3`,
  );
  return filas.map((t) => ({ id: t.id, identifier: t.identifier ?? null, title: t.title, status: t.status ?? null }));
}

// ---------------------------------------------------------------------------
// El Resumen (0.9.0, JST-246): se lee solo al abrir su menú y al apretar «Leer»
// ---------------------------------------------------------------------------

/** Lo que usa el Resumen de una fila de `/issues?view=compact` (con `includeBlockedBy`, las abiertas). */
export interface FilaTarea {
  id: string;
  companyId: string;
  identifier?: string | null;
  title: string;
  status: string;
  parentId?: string | null;
  completedAt?: string | null;
  updatedAt?: string | null;
  assigneeAgentId?: string | null;
  assigneeUserId?: string | null;
  originKind?: string | null;
  blockedBy?: ReadonlyArray<{ id: string; identifier?: string | null; title?: string | null; status?: string | null; assigneeAgentId?: string | null; assigneeUserId?: string | null }>;
}

/** Una tarea en la cadena hacia arriba (`ancestors` de `/issues/:id`: el padre primero y el pedido de origen al final). */
export interface EslabonTarea {
  id: string;
  identifier: string | null;
  titulo: string;
  /** `null`: es la de más arriba. */
  parentId: string | null;
  rutina: boolean;
}

/** El tope de Paperclip por lectura (`ISSUE_LIST_MAX_LIMIT`, 2026.824.1) y cuántas páginas como mucho: 7 días son ~400 terminadas en las 5 empresas. */
export const FILAS_POR_PAGINA = 1000;
export const MAX_PAGINAS = 3;

async function paginas(cx: Conexion, base: string): Promise<FilaTarea[]> {
  const filas: FilaTarea[] = [];
  for (let p = 0; p < MAX_PAGINAS; p++) {
    const lote = await pedir<FilaTarea[]>(cx, `${base}&limit=${FILAS_POR_PAGINA}${p > 0 ? `&offset=${p * FILAS_POR_PAGINA}` : ""}`);
    filas.push(...lote);
    if (lote.length < FILAS_POR_PAGINA) break;
  }
  return filas;
}

/** Cuándo se terminó una tarea (o, si no lo dice, cuándo cambió por última vez). */
export function terminadaEn(f: Pick<FilaTarea, "completedAt" | "updatedAt">): number {
  const t = Date.parse(f.completedAt ?? f.updatedAt ?? "");
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Las que pasaron a terminadas desde `desde` (ms): se piden las terminadas que
 * cambiaron desde ahí (`updatedSince`, el servidor compara `updatedAt`) y quedan
 * las que se terminaron desde ahí. Las rutinas vienen incluidas.
 */
export async function leerTerminadas(cx: Conexion, companyId: string, desde: number): Promise<FilaTarea[]> {
  const filas = await paginas(cx, `/companies/${encodeURIComponent(companyId)}/issues?status=done&updatedSince=${encodeURIComponent(new Date(desde).toISOString())}&view=compact`);
  return filas.filter((f) => f.status === "done" && terminadaEn(f) >= desde);
}

/** Las abiertas de una empresa, con sus bloqueos: la cola (`todo` y `blocked`) y los pedidos de lo que se hace. */
export function leerAbiertas(cx: Conexion, companyId: string): Promise<FilaTarea[]> {
  return paginas(cx, `/companies/${encodeURIComponent(companyId)}/issues?status=backlog,todo,in_progress,in_review,blocked&view=compact&includeBlockedBy=true`);
}

/** Una tarea con toda su cadena hacia arriba: ella primero y el pedido de origen al final. */
export async function leerCadena(cx: Conexion, issueId: string): Promise<EslabonTarea[]> {
  const t = await pedir<{ id: string; identifier?: string | null; title: string; parentId?: string | null; originKind?: string | null; ancestors?: Array<{ id: string; identifier?: string | null; title: string }> }>(
    cx,
    `/issues/${encodeURIComponent(issueId)}`,
  );
  const anc = t.ancestors ?? [];
  const cadena: EslabonTarea[] = [{ id: t.id, identifier: t.identifier ?? null, titulo: t.title, parentId: t.parentId ?? null, rutina: t.originKind === "routine_execution" }];
  anc.forEach((a, i) => cadena.push({ id: a.id, identifier: a.identifier ?? null, titulo: a.title, parentId: anc[i + 1]?.id ?? null, rutina: false }));
  return cadena;
}

export function leerAprobacion(cx: Conexion, approvalId: string): Promise<Aprobacion> {
  return pedir(cx, `/approvals/${encodeURIComponent(approvalId)}`);
}

/** Lo que respondió el servidor a un envío. `status` 0: no hubo respuesta (sin conexión). */
export interface RespuestaEnvio {
  status: number;
  /** `interaction_already_resolved`, `interaction_issue_closed`… (en los 409). */
  code: string | null;
  mensaje: string | null;
  body: unknown;
}

/**
 * La única escritura del plugin: un POST con la sesión del usuario, sin
 * reintentos. El navegador manda el `Origin` solo (sin él, Paperclip responde
 * 403 «Board mutation requires trusted browser origin»).
 */
export async function enviar(cx: Conexion, path: string, cuerpo: unknown): Promise<RespuestaEnvio> {
  cx.alLlamar?.(`POST ${rutaSinIds(path)}`);
  let response: Response;
  try {
    response = await fetch(`${cx.base}/api${path}`, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json", "Content-Type": "application/json", ...cx.headers },
      body: JSON.stringify(cuerpo ?? {}),
    });
  } catch (error) {
    return { status: 0, code: null, mensaje: error instanceof Error ? error.message : String(error), body: null };
  }
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  const mensaje = body?.message ?? body?.error ?? null;
  return {
    status: response.status,
    code: typeof body?.code === "string" ? body.code : null,
    mensaje: typeof mensaje === "string" ? mensaje : mensaje ? JSON.stringify(mensaje) : null,
    body,
  };
}

/**
 * Una acción del worker de este plugin (0.5.0, las voces que dicen de qué se
 * trata). El host pide `companyId` para revisar que el usuario la vea. No
 * escribe nada en Paperclip.
 */
export async function accionPlugin<T>(cx: Conexion, pluginId: string, clave: string, companyId: string, params: Record<string, unknown>): Promise<T | null> {
  const r = await enviar(cx, `/plugins/${encodeURIComponent(pluginId)}/actions/${encodeURIComponent(clave)}`, { companyId, params });
  return r.status >= 200 && r.status < 300 ? ((r.body as { data?: T } | null)?.data ?? null) : null;
}

/**
 * UUID de la instalación del plugin. Las páginas sueltas (modo TV) se sirven en
 * `/_plugins/<uuid>/ui/…`: en 2026.824.1 la clave del plugin en esa ruta da 500
 * (el host la consulta como UUID antes de probar la clave).
 */
export async function idInstalacion(cx: Conexion, pluginKey: string): Promise<string | null> {
  const lista = await pedir<Array<{ pluginId: string; pluginKey: string }>>(cx, "/plugins/ui-contributions");
  return lista.find((item) => item.pluginKey === pluginKey)?.pluginId ?? null;
}

// ---------------------------------------------------------------------------
// Canal en vivo
// ---------------------------------------------------------------------------

export function urlCanal(cx: Conexion, companyId: string): string {
  const origen = cx.base || (typeof location !== "undefined" ? location.origin : "");
  return `${origen.replace(/^http/, "ws")}/api/companies/${encodeURIComponent(companyId)}/events/ws`;
}

export interface Canal {
  readonly abierto: boolean;
  cerrar(): void;
}

export interface OyentesCanal {
  evento(evento: EventoVivo, bytes: number): void;
  /** Se abrió (o se reabrió tras un corte): conviene recargar la empresa entera. */
  abierto(): void;
  cerrado(): void;
  /** Un intento no llegó a abrir (se reintenta solo). */
  fallo?(): void;
}

const ESPERAS_RECONEXION_MS = [1000, 2000, 5000, 10000, 30000];

/** Abre el canal en vivo de una empresa y lo reabre solo si se corta. */
export function abrirCanal(cx: Conexion, companyId: string, oyentes: OyentesCanal): Canal {
  let socket: WebSocket | null = null;
  let intentos = 0;
  let abierto = false;
  let cerrado = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const conectar = () => {
    const url = urlCanal(cx, companyId);
    socket = cx.crearSocket ? cx.crearSocket(url) : new WebSocket(url);
    socket.onopen = () => {
      intentos = 0;
      abierto = true;
      oyentes.abierto();
    };
    socket.onmessage = (message: MessageEvent) => {
      const texto = typeof message.data === "string" ? message.data : String(message.data);
      try {
        oyentes.evento(JSON.parse(texto) as EventoVivo, texto.length);
      } catch {
        // Un mensaje que no es JSON se ignora.
      }
    };
    socket.onclose = () => {
      const estaba = abierto;
      abierto = false;
      socket = null;
      if (estaba) oyentes.cerrado();
      else if (!cerrado) oyentes.fallo?.();
      if (cerrado) return;
      const espera = ESPERAS_RECONEXION_MS[Math.min(intentos, ESPERAS_RECONEXION_MS.length - 1)]!;
      intentos += 1;
      timer = setTimeout(conectar, espera);
    };
  };
  conectar();

  return {
    get abierto() {
      return abierto;
    },
    cerrar() {
      cerrado = true;
      if (timer) clearTimeout(timer);
      socket?.close();
    },
  };
}
