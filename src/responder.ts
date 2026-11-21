// Responder sin salir (design-spec de JST-95 §5), sin React: qué esperas se
// responden en la Oficina, qué se lee al abrirlas, qué se valida, qué POST se
// hace y cómo se lee la respuesta del servidor (todo medido en JST-94).
//
// La Oficina escribe solo cuando el usuario toca enviar: un único POST con su
// sesión. Antes de enviar se vuelve a leer la espera; si ya no está pendiente
// no se envía nada.
import type { Espera, TipoEspera } from "./estado.js";
import type { Aprobacion, Interaccion } from "./shared.js";
import type { RespuestaEnvio } from "./fuentes.js";
import { msg, t } from "./i18n.js";

/** Lo que se responde aquí, o `fuera` (se responde en Paperclip). */
export type Clase = "preguntas" | "confirmacion" | "casillas" | "tareas" | "aprobacion" | "fuera";

export function claseDe(e: Pick<Espera, "tipo" | "clase">): Clase {
  if (e.tipo === "tarjeta") {
    switch (e.clase) {
      case "ask_user_questions":
        return "preguntas";
      case "request_confirmation":
        return "confirmacion";
      case "request_checkbox_confirmation":
        return "casillas";
      case "suggest_tasks":
        return "tareas";
      default:
        return "fuera";
    }
  }
  if (e.tipo === "aprobacion" && e.clase === "request_board_approval") return "aprobacion";
  return "fuera";
}

export const seResponde = (e: Pick<Espera, "tipo" | "clase">) => claseDe(e) !== "fuera";

const CHIP_CLASE: Record<Exclude<Clase, "fuera">, { label: string; icono: string }> = {
  preguntas: { label: msg("Pregunta"), icono: "message-square" },
  confirmacion: { label: msg("Confirmación"), icono: "circle-check" },
  casillas: { label: msg("Lista de casillas"), icono: "list-checks" },
  tareas: { label: msg("Tareas sugeridas"), icono: "list-plus" },
  aprobacion: { label: msg("Aprobación"), icono: "check-check" },
};

const CHIP_FUERA: Record<TipoEspera, { label: string; icono: string }> = {
  tarjeta: { label: msg("Tarjeta"), icono: "message-square" },
  aprobacion: { label: msg("Aprobación"), icono: "check-check" },
  revision: { label: msg("Revisión"), icono: "eye" },
  decision: { label: msg("Decisión"), icono: "list-checks" },
};

/**
 * Chip de la espera (ventana, pasos, aviso): «Pregunta», «Confirmación»… En gris si se responde en Paperclip.
 * `label` queda en español porque también lo leen las voces (JST-413): quien lo muestra en pantalla lo pasa por `t()`.
 */
export function chipDe(e: Pick<Espera, "tipo" | "clase">): { label: string; icono: string; fuera: boolean } {
  const c = claseDe(e);
  if (c === "fuera") return { ...CHIP_FUERA[e.tipo], fuera: true };
  return { ...CHIP_CLASE[c], fuera: false };
}

/** Por qué no se responde aquí (va con el enlace a la tarea). */
export function motivoFuera(e: Pick<Espera, "tipo">): string {
  if (e.tipo === "revision") return t("Las revisiones se hacen en la tarea, donde están el diff y los comentarios.");
  return t("Esto se responde en la tarea.");
}

// ---------------------------------------------------------------------------
// Lo que se lee al abrir
// ---------------------------------------------------------------------------

export type Detalle = { de: "interaccion"; i: Interaccion } | { de: "aprobacion"; a: Aprobacion };

/** Sigue esperando, ya la respondió alguien, o ya no espera (retirada, vencida o la tarea se cerró). */
export type Vigencia = "pendiente" | "respondida" | "vencida";

export function vigencia(d: Detalle): Vigencia {
  if (d.de === "interaccion") {
    const st = d.i.status;
    if (st === "pending") return "pendiente";
    if (st === "answered" || st === "accepted" || st === "rejected") {
      // Una retirada o vencida por un comentario queda `rejected`/`expired` con un `outcome` propio.
      const outcome = typeof d.i.result?.outcome === "string" ? d.i.result.outcome : null;
      if (outcome && !["accepted", "rejected"].includes(outcome)) return "vencida";
      return "respondida";
    }
    return "vencida";
  }
  const st = d.a.status;
  if (st === "pending") return "pendiente";
  if (st === "approved" || st === "rejected" || st === "revision_requested") return "respondida";
  return "vencida";
}

/** Cuándo se respondió (`resolvedAt` o `decidedAt`). */
export function respondidaEn(d: Detalle): string | null {
  return d.de === "interaccion" ? (d.i.resolvedAt ?? null) : (d.a.decidedAt ?? null);
}

// Lectura tolerante del `payload` (viene como JSON del servidor).
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const lista = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : []);
const textos = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export interface Opcion {
  id: string;
  label: string;
  descripcion: string | null;
  /** Al elegirla se abre un texto libre (`otherText`). */
  libre: boolean;
}

export interface Pregunta {
  id: string;
  prompt: string;
  ayuda: string | null;
  multiple: boolean;
  requerida: boolean;
  opciones: Opcion[];
}

export interface TareaSugerida {
  clave: string;
  madre: string | null;
  titulo: string;
  agenteId: string | null;
  usuarioId: string | null;
}

/** Lo que muestra la ventana de una espera que se responde aquí. */
export interface Contenido {
  clase: Exclude<Clase, "fuera">;
  /** La pregunta (16/22, 600). */
  titulo: string;
  /** `details`, `summary` o el resumen de la aprobación (`**negrita**` se respeta). */
  detalle: string | null;
  preguntas: Pregunta[];
  /** Casillas (lista de casillas). */
  opciones: Opcion[];
  marcadasPorOmision: string[];
  minimo: number;
  maximo: number | null;
  tareas: TareaSugerida[];
  submit: string;
  aceptar: string;
  rechazar: string;
  /** Rechazar pide motivo (no se envía sin él). */
  motivoObligatorio: boolean;
  /** Rechazar abre el campo del motivo (si no, rechaza directo). */
  conMotivo: boolean;
  etiquetaMotivo: string;
  placeholderMotivo: string | null;
  riesgos: string[];
  recomienda: string | null;
}

function opcion(o: Record<string, unknown>): Opcion {
  return { id: String(o.id ?? ""), label: texto(o.label) ?? String(o.id ?? ""), descripcion: texto(o.description), libre: o.freeText === true };
}

/** Riesgos de una aprobación, sin el «- » del comienzo (JST-94). */
export function limpiarRiesgo(r: string): string {
  return r.replace(/^\s*[-*•]\s+/, "").trim();
}

export function contenidoDe(c: Exclude<Clase, "fuera">, d: Detalle, espera: Pick<Espera, "titulo">): Contenido {
  const base: Contenido = {
    clase: c,
    titulo: espera.titulo ?? "",
    detalle: null,
    preguntas: [],
    opciones: [],
    marcadasPorOmision: [],
    minimo: 0,
    maximo: null,
    tareas: [],
    submit: t("Enviar"),
    aceptar: t("Aceptar"),
    rechazar: t("Rechazar"),
    motivoObligatorio: false,
    conMotivo: true,
    etiquetaMotivo: t("¿Por qué?"),
    placeholderMotivo: null,
    riesgos: [],
    recomienda: null,
  };
  if (d.de === "aprobacion") {
    const p = d.a.payload;
    return {
      ...base,
      titulo: texto(p.title) ?? base.titulo,
      detalle: texto(p.summary),
      riesgos: textos(p.risks).map(limpiarRiesgo).filter(Boolean),
      recomienda: texto(p.recommendedAction),
    };
  }
  const i = d.i;
  const p = i.payload;
  const rechazo = {
    aceptar: texto(p.acceptLabel) ?? base.aceptar,
    rechazar: texto(p.rejectLabel) ?? base.rechazar,
    motivoObligatorio: p.rejectRequiresReason === true,
    conMotivo: p.rejectRequiresReason === true || p.allowDeclineReason !== false,
    etiquetaMotivo: texto(p.rejectReasonLabel) ?? base.etiquetaMotivo,
    placeholderMotivo: texto(p.declineReasonPlaceholder),
  };
  switch (c) {
    case "preguntas": {
      const preguntas = lista(p.questions).map((q) => ({
        id: String(q.id ?? ""),
        prompt: texto(q.prompt) ?? "",
        ayuda: texto(q.helpText),
        multiple: q.selectionMode === "multi",
        // Como en Paperclip: `required` es opcional y sin él la pregunta no se exige (JST-120).
        requerida: q.required === true,
        opciones: lista(q.options).map(opcion),
      }));
      return {
        ...base,
        titulo: texto(i.title) ?? texto(p.title) ?? preguntas[0]?.prompt ?? base.titulo,
        detalle: texto(i.summary),
        preguntas,
        submit: texto(p.submitLabel) ?? base.submit,
      };
    }
    case "confirmacion":
      return { ...base, ...rechazo, titulo: texto(p.prompt) ?? texto(i.title) ?? base.titulo, detalle: texto(p.detailsMarkdown) };
    case "casillas": {
      const opciones = lista(p.options).map(opcion);
      const ids = new Set(opciones.map((o) => o.id));
      return {
        ...base,
        ...rechazo,
        etiquetaMotivo: texto(p.rejectReasonLabel) ?? t("¿Por qué no?"),
        titulo: texto(p.prompt) ?? texto(i.title) ?? base.titulo,
        detalle: texto(p.detailsMarkdown),
        opciones,
        marcadasPorOmision: textos(p.defaultSelectedOptionIds).filter((id) => ids.has(id)),
        minimo: typeof p.minSelected === "number" ? p.minSelected : 0,
        maximo: typeof p.maxSelected === "number" ? p.maxSelected : null,
      };
    }
    case "tareas": {
      const tareas = lista(p.tasks).map((t) => ({
        clave: String(t.clientKey ?? ""),
        madre: texto(t.parentClientKey),
        titulo: texto(t.title) ?? String(t.clientKey ?? ""),
        agenteId: texto(t.assigneeAgentId),
        usuarioId: texto(t.assigneeUserId),
      }));
      return {
        ...base,
        aceptar: t("Crear las marcadas"),
        rechazar: t("No, gracias"),
        etiquetaMotivo: t("¿Por qué no?"),
        titulo: texto(i.title) ?? texto(i.summary) ?? base.titulo,
        detalle: texto(i.title) ? texto(i.summary) : null,
        tareas,
        marcadasPorOmision: tareas.map((t) => t.clave),
      };
    }
    default:
      return base;
  }
}

// ---------------------------------------------------------------------------
// Lo escrito y lo marcado (se guarda en memoria por espera)
// ---------------------------------------------------------------------------

/** Modo del pie: normal, con el motivo de rechazo abierto, o pidiendo cambios (aprobación). */
export type Modo = "" | "rechazo" | "cambios";

export interface Borrador {
  /** Preguntas: opciones elegidas por pregunta. */
  elegidas: Record<string, string[]>;
  /** Preguntas: texto libre por pregunta. */
  libres: Record<string, string>;
  /** Casillas o tareas sugeridas marcadas. */
  marcadas: string[];
  motivo: string;
  modo: Modo;
}

export function borradorInicial(c: Contenido): Borrador {
  return { elegidas: {}, libres: {}, marcadas: [...c.marcadasPorOmision], motivo: "", modo: "" };
}

/** Elegir una opción: en una pregunta de una sola, reemplaza; en una de varias, alterna. */
export function elegir(b: Borrador, q: Pregunta, opcionId: string): Borrador {
  const actual = b.elegidas[q.id] ?? [];
  const nueva = q.multiple ? (actual.includes(opcionId) ? actual.filter((x) => x !== opcionId) : [...actual, opcionId]) : [opcionId];
  return { ...b, elegidas: { ...b.elegidas, [q.id]: nueva } };
}

/** Marcar una casilla: con `maximo`, no deja pasar del máximo. */
export function marcarCasilla(b: Borrador, c: Contenido, id: string): Borrador {
  if (b.marcadas.includes(id)) return { ...b, marcadas: b.marcadas.filter((x) => x !== id) };
  if (c.maximo != null && b.marcadas.length >= c.maximo) return b;
  return { ...b, marcadas: [...b.marcadas, id] };
}

/** Tareas sugeridas: al marcar una hija se marca su madre; al desmarcar la madre se desmarcan sus hijas. */
export function marcarTarea(b: Borrador, c: Contenido, clave: string): Borrador {
  const madreDe = new Map(c.tareas.map((t) => [t.clave, t.madre]));
  const marcadas = new Set(b.marcadas);
  if (marcadas.has(clave)) {
    const quitar = (k: string) => {
      marcadas.delete(k);
      for (const t of c.tareas) if (t.madre === k && marcadas.has(t.clave)) quitar(t.clave);
    };
    quitar(clave);
  } else {
    let k: string | null | undefined = clave;
    while (k) {
      marcadas.add(k);
      k = madreDe.get(k);
    }
  }
  return { ...b, marcadas: c.tareas.map((t) => t.clave).filter((k) => marcadas.has(k)) };
}

// ---------------------------------------------------------------------------
// Enviar
// ---------------------------------------------------------------------------

/** Qué botón se tocó. */
export type Accion = "enviar" | "aceptar" | "rechazar" | "aprobar" | "cambios";

/** Lo que falta antes de enviar (nota ámbar «Falta algo»), o `null`. */
export function falta(c: Contenido, b: Borrador, accion: Accion): string | null {
  if (c.clase === "preguntas" && accion === "enviar") {
    const sinElegir = c.preguntas.some((q) => q.requerida && (b.elegidas[q.id] ?? []).length === 0);
    return sinElegir ? t("Falta elegir una opción en cada pregunta.") : null;
  }
  if (accion === "rechazar" && c.motivoObligatorio && !b.motivo.trim()) return t("Escribe el motivo para que sepa qué cambiar.");
  if (accion === "cambios" && !b.motivo.trim()) return t("Escribe el motivo para que sepa qué cambiar.");
  if (c.clase === "casillas" && accion === "aceptar" && b.marcadas.length < c.minimo) return t("Marca al menos {n}.", { n: c.minimo });
  if (c.clase === "tareas" && accion === "aceptar" && b.marcadas.length === 0) return t("Marca al menos una tarea.");
  return null;
}

/** El POST de la respuesta (ruta bajo `/api` y cuerpo), como lo probó JST-94. */
export function peticion(c: Contenido, d: Detalle, b: Borrador, accion: Accion): { path: string; cuerpo: Record<string, unknown> } {
  const motivo = b.motivo.trim();
  if (d.de === "aprobacion") {
    const id = encodeURIComponent(d.a.id);
    const nota = motivo ? { decisionNote: motivo } : {};
    if (accion === "rechazar") return { path: `/approvals/${id}/reject`, cuerpo: nota };
    if (accion === "cambios") return { path: `/approvals/${id}/request-revision`, cuerpo: nota };
    return { path: `/approvals/${id}/approve`, cuerpo: nota };
  }
  const base = `/issues/${encodeURIComponent(d.i.issueId)}/interactions/${encodeURIComponent(d.i.id)}`;
  if (c.clase === "preguntas") {
    const answers = c.preguntas
      .map((q) => {
        const optionIds = b.elegidas[q.id] ?? [];
        const libre = q.opciones.some((o) => o.libre && optionIds.includes(o.id)) ? (b.libres[q.id] ?? "").trim() : "";
        return libre ? { questionId: q.id, optionIds, otherText: libre } : { questionId: q.id, optionIds };
      })
      .filter((a) => a.optionIds.length > 0);
    return { path: `${base}/respond`, cuerpo: { answers } };
  }
  if (accion === "rechazar") return { path: `${base}/reject`, cuerpo: motivo ? { reason: motivo } : {} };
  if (c.clase === "casillas") return { path: `${base}/accept`, cuerpo: { selectedOptionIds: b.marcadas } };
  if (c.clase === "tareas") return { path: `${base}/accept`, cuerpo: { selectedClientKeys: b.marcadas } };
  return { path: `${base}/accept`, cuerpo: {} };
}

/** Cómo terminó el envío. `revisar`: 409 de una tarjeta ya resuelta; hay que leerla para saber si la respondieron o la retiraron. */
export type Resultado =
  | { tipo: "ok" }
  | { tipo: "revisar" }
  | { tipo: "vencida" }
  | { tipo: "invalido"; mensaje: string }
  | { tipo: "fallo"; mensaje: string };

export function resultadoDe(r: RespuestaEnvio): Resultado {
  if (r.status >= 200 && r.status < 300) return { tipo: "ok" };
  if (r.status === 409 && r.code === "interaction_issue_closed") return { tipo: "vencida" };
  if (r.status === 409) return { tipo: "revisar" };
  if (r.status === 404) return { tipo: "vencida" };
  if (r.status === 0) return { tipo: "fallo", mensaje: t("Paperclip no respondió (sin conexión).") };
  if (r.status >= 500) return { tipo: "fallo", mensaje: t("Paperclip respondió con un error ({status}).", { status: r.status }) };
  // 422 y los demás 4xx: el mensaje del servidor, tal cual.
  return { tipo: "invalido", mensaje: r.mensaje ?? t("Paperclip no aceptó la respuesta ({status}).", { status: r.status }) };
}

/** Lo que se respondió, para la caja «Respuesta guardada» (§5: «¿Dónde guardamos…? → Redis»). */
export function respuestaGuardada(c: Contenido | null, d: Detalle): string | null {
  if (d.de === "aprobacion") {
    const nota = d.a.decisionNote;
    if (d.a.status === "approved") return nota ? t("Aprobada: {nota}", { nota }) : t("Aprobada");
    if (d.a.status === "rejected") return nota ? t("Rechazada: {nota}", { nota }) : t("Rechazada");
    if (d.a.status === "revision_requested") return nota ? t("Pidió cambios: {nota}", { nota }) : t("Pidió cambios");
    return null;
  }
  const r = d.i.result ?? {};
  const outcome = typeof r.outcome === "string" ? r.outcome : null;
  const motivo = texto(r.reason) ?? texto(r.rejectionReason);
  if (d.i.status === "rejected" || outcome === "rejected") return `${c?.rechazar ?? t("Rechazada")}${motivo ? `: ${motivo}` : ""}`;
  if (d.i.kind === "ask_user_questions") {
    const respuestas = lista(r.answers);
    if (respuestas.length === 0) return null;
    return respuestas
      .map((a) => {
        const q = c?.preguntas.find((x) => x.id === a.questionId);
        const libre = texto(a.otherText);
        const partes = textos(a.optionIds).map((id) => {
          const o = q?.opciones.find((x) => x.id === id);
          if (o?.libre && libre) return `${o.label}: ${libre}`;
          return o?.label ?? id;
        });
        // Texto libre sin una opción de texto libre elegida (lo permite el servidor).
        if (libre && !q?.opciones.some((o) => o.libre && textos(a.optionIds).includes(o.id))) partes.push(libre);
        const respuesta = partes.join(", ");
        return q ? `${q.prompt} → ${respuesta}` : respuesta;
      })
      .join(" · ");
  }
  if (d.i.kind === "suggest_tasks") {
    const n = lista(r.createdTasks).length;
    return n === 1 ? t("Se creó 1 tarea") : t("Se crearon {n} tareas", { n });
  }
  if (d.i.kind === "request_checkbox_confirmation") {
    const ids = textos(r.selectedOptionIds);
    const labels = ids.map((id) => c?.opciones.find((o) => o.id === id)?.label ?? id);
    return `${c?.aceptar ?? t("Aceptada")}${labels.length ? `: ${labels.join(", ")}` : ""}`;
  }
  return c?.aceptar ?? t("Aceptada");
}

/** «Queda a tu nombre en BET-268». */
export function aTuNombre(e: Pick<Espera, "identifier">): string {
  return e.identifier ? t("Queda a tu nombre en {id}", { id: e.identifier }) : t("Queda a tu nombre");
}

/** Para separar `**negrita**` en partes (la ventana las dibuja sin HTML). */
export function partesNegrita(s: string): Array<{ b: boolean; t: string }> {
  const partes: Array<{ b: boolean; t: string }> = [];
  const re = /\*\*(.+?)\*\*/g;
  let i = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index > i) partes.push({ b: false, t: s.slice(i, m.index) });
    partes.push({ b: true, t: m[1]! });
    i = m.index + m[0].length;
  }
  if (i < s.length) partes.push({ b: false, t: s.slice(i) });
  return partes;
}
