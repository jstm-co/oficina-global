// Tipos compartidos de «Oficina global». Las formas siguen las respuestas de la
// API nativa de Paperclip (2026.824.1) con solo los campos que usa la oficina;
// el resto de cada fila se ignora.

export const PLUGIN_KEY = "jstm.oficina-pixel";
export const PAGE_ROUTE = "oficina-global";

/** `GET /api/companies` (sin las archivadas). */
export interface Empresa {
  id: string;
  name: string;
  issuePrefix: string | null;
  brandColor?: string | null;
  status: string;
}

/** Fila de `GET /api/companies/:id/agents`. */
export interface AgenteApi {
  id: string;
  companyId: string;
  name: string;
  urlKey?: string | null;
  role?: string | null;
  title?: string | null;
  icon?: string | null;
  /** `active`, `idle`, `running`, `error`, `paused`, `pending_approval` o `terminated`. */
  status: string;
  adapterType: string;
  pauseReason?: string | null;
  errorReason?: string | null;
  pausedAt?: string | null;
  lastHeartbeatAt?: string | null;
  updatedAt?: string | null;
}

/** Fila de `GET /api/companies/:id/live-runs` (sin `minCount`: solo `queued` y `running`). */
export interface RunVivo {
  id: string;
  companyId: string;
  status: string;
  agentId: string;
  issueId: string | null;
  invocationSource?: string | null;
  createdAt: string;
  startedAt: string | null;
}

/** Referencia de una tarea en el feed del Inbox (`issueSubject` del servidor). */
export interface SujetoAtencion {
  kind?: string;
  id?: string;
  title?: string | null;
  identifier?: string | null;
  status?: string | null;
  href?: string | null;
  metadata?: {
    /** Tarjeta: `ask_user_questions`, `request_confirmation`, `request_checkbox_confirmation`, `suggest_tasks` o `request_item_verdicts`. */
    kind?: string;
    /** Aprobación: `request_board_approval`, `hire_agent`… */
    type?: string | null;
    /** Aprobación: la tarea a la que va unida (el feed no trae `relatedIssue`). */
    issueId?: string | null;
    assigneeAgentId?: string | null;
    assigneeUserId?: string | null;
    createdByAgentId?: string | null;
    requestedByAgentId?: string | null;
    /** Tarjeta: pide aprobar el documento `plan` de la tarea (0.8.0). */
    isPlanTarget?: boolean | null;
    /** Revisión: `stalled` si está «sin camino» (sin revisor, tarjeta, aprobación, monitor, run ni despertar; JST-266). */
    reviewAttentionState?: string | null;
  } | null;
}

/** Ítem de `GET /api/companies/:id/attention` (feed de «Te toca»). */
export interface ItemAtencion {
  id: string;
  sourceKind: string;
  subject?: SujetoAtencion | null;
  relatedIssue?: SujetoAtencion | null;
  originAgentName?: string | null;
  createdAt?: string | null;
  /** Lo que el feed resume de la tarjeta (la pregunta, la primera tarea sugerida…). */
  detail?: {
    kind?: string;
    promptExcerpt?: string | null;
    firstQuestionText?: string | null;
    firstTaskTitle?: string | null;
    summaryExcerpt?: string | null;
  } | null;
}

/** Una línea de `GET /api/issues/:id/activity`, o el `payload` de `activity.logged` (tienen la misma forma). */
export interface LineaActividad {
  actorType?: unknown;
  actorId?: unknown;
  agentId?: unknown;
  action?: unknown;
  entityId?: unknown;
  details?: unknown;
  createdAt?: unknown;
}

/** Tarjeta de una tarea (`GET /api/issues/:id/interactions`), con lo que usa la ventana para responder. */
export interface Interaccion {
  id: string;
  companyId: string;
  issueId: string;
  kind: string;
  /** `pending`, `answered`, `accepted`, `rejected`, `cancelled`, `expired` o `failed`. */
  status: string;
  title?: string | null;
  summary?: string | null;
  payload: Record<string, unknown>;
  result?: Record<string, unknown> | null;
  createdAt: string;
  /** El agente que la creó: quien pregunta (JST-414). */
  createdByAgentId?: string | null;
  resolvedAt?: string | null;
  resolvedByUserId?: string | null;
}

/** `GET /api/approvals/:id`. */
export interface Aprobacion {
  id: string;
  companyId: string;
  type: string;
  /** `pending`, `revision_requested`, `approved`, `rejected` o `cancelled`. */
  status: string;
  payload: Record<string, unknown>;
  decisionNote?: string | null;
  decidedByUserId?: string | null;
  decidedAt?: string | null;
  createdAt: string;
}

/** `GET /api/heartbeat-runs/:id/log`: un tramo del log en NDJSON (`{ts, stream, chunk}` por línea). */
export interface TramoLog {
  runId: string;
  content: string;
  nextOffset?: number;
}

/** Tarea mínima para mostrar el código del run (`GET /api/issues/:id`). */
export interface TareaRef {
  id: string;
  identifier: string | null;
  title: string;
  /** `backlog`, `todo`, `in_progress`, `in_review`, `blocked`, `done` o `cancelled`. */
  status?: string | null;
}

/** Fila de `GET /api/companies/:id/heartbeat-runs?agentId=…&summary=true` (último run de un agente). */
export interface RunResumen {
  id: string;
  agentId: string;
  status: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  contextSnapshot?: { issueId?: string | null } | null;
  /** Error completo (JST-94): «Process exited with code 3», `adapter_failed`, `exit 1` o `SIGTERM`. */
  error?: string | null;
  errorCode?: string | null;
  exitCode?: number | null;
  signal?: string | null;
  /** Tamaño del log: se lee el final con `offset = tamaño − 16 KB`. */
  logBytes?: number | null;
  lastOutputBytes?: number | null;
}

/** Mensaje del canal en vivo `ws(s)://…/api/companies/:id/events/ws`. */
export interface EventoVivo {
  id: number;
  companyId: string;
  type: string;
  createdAt: string;
  payload: Record<string, unknown>;
}
