// Aviso y voces (design-spec de JST-95 §7 y §8), sin React ni navegador:
// quién pasa a «te necesita», los textos del aviso y de las voces, el nombre
// corto, la voz de cada agente y la cola de frases.
import { hash } from "./aspecto.js";
import { ETIQUETA_ROL, tituloVisible, type Espera } from "./estado.js";
import { t } from "./i18n.js";
import { CORTOS_INSTANCIA } from "./instancia.js";
import { analizarPregunta, normalizarRol, sinRolDelante, tareaParaVoz } from "./paraVoz.js";
import { chipDe } from "./responder.js";
import type { AgenteVista } from "./vista.js";

// ---------------------------------------------------------------------------
// Nombre corto («Líder técnico», «Ingeniero backend»)
// ---------------------------------------------------------------------------

/**
 * Los que la regla deja raros (por nombre del agente, como están en Paperclip).
 * Los nombres propios de la instancia, en `instancia.ts`.
 */
export const CORTOS: Readonly<Record<string, string>> = {
  "Líder Técnico": "Líder técnico",
  "Disenador UX/UI": "Diseñador",
  "Documentacion Tecnica": "Documentación",
  "Ingeniero Backend Java / REST": "Ingeniero backend",
  "Ingeniero Frontend React + Expo": "Ingeniero frontend",
  "Ingeniero de Integracion y CI": "Integración y CI",
  "QA & Automatizacion de Tests": "QA",
  "Revisor de Codigo (Codex)": "Revisor de código",
  "Creador/a de Contenido": "Contenido",
  "Diseñador/a de Producto (UX/UI)": "Diseño",
  "Ingeniero/a Full-stack de Plugins": "Plugins",
  "QA Engineer": "QA",
  "Ceo - cto": "CEO",
  Disenador: "Diseñador",
  Qa: "QA",
  RevisorCodigo: "Revisor de código",
  ...CORTOS_INSTANCIA,
};

/** Palabras que en Paperclip quedaron sin tilde. */
const TILDES: Readonly<Record<string, string>> = {
  tecnico: "técnico",
  tecnica: "técnica",
  lider: "líder",
  disenador: "diseñador",
  disenadora: "diseñadora",
  diseno: "diseño",
  integracion: "integración",
  documentacion: "documentación",
  automatizacion: "automatización",
  codigo: "código",
  analitica: "analítica",
  operacion: "operación",
  operaciones: "operaciones",
  comunicacion: "comunicación",
  investigacion: "investigación",
};

/**
 * El nombre hasta « / », « (», « + » o « & », con tildes y en minúscula
 * después de la primera palabra (las siglas y las letras sueltas en mayúscula, como la «A» de «Sonda A», quedan igual).
 */
export function nombreCorto(nombre: string): string {
  const fijo = CORTOS[nombre.trim()];
  if (fijo) return fijo;
  const corte = nombre.split(/\s+\/\s+|\s+\(|\s+\+\s+|\s+&\s+/)[0]!.trim() || nombre.trim();
  return corte
    .split(/\s+/)
    .map((p, i) => {
      const sigla = p === p.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(p);
      const base = TILDES[p.toLowerCase()] ?? (sigla ? p : p.toLowerCase());
      if (sigla && !TILDES[p.toLowerCase()]) return p;
      return i === 0 ? base.charAt(0).toUpperCase() + base.slice(1) : base;
    })
    .join(" ");
}

// ---------------------------------------------------------------------------
// Quién pasa a «te necesita»
// ---------------------------------------------------------------------------

/**
 * Lo que la vigía sabe de cada agente: cuántas esperas tiene. Un agente cuya
 * empresa todavía no se leyó, o sin «Te toca», no está: nunca «pasa» desde ahí.
 */
export type Foto = ReadonlyMap<string, number>;

export function fotoDe(agentes: readonly AgenteVista[], conocidas: (companyId: string) => boolean): Map<string, number> {
  const foto = new Map<string, number>();
  for (const a of agentes) if (conocidas(a.companyId)) foto.set(a.id, a.teNecesita.length);
  return foto;
}

/**
 * Los que pasaron de 0 esperas a 1 o más entre dos fotos (§7). Lo que ya
 * esperaba al tomar la primera foto no avisa, y un ítem nuevo de alguien que ya
 * esperaba tampoco.
 */
export function llegadas(antes: Foto, ahora: Foto): string[] {
  const ids: string[] = [];
  for (const [id, n] of ahora) if (n > 0 && antes.get(id) === 0) ids.push(id);
  return ids;
}

/**
 * La espera que avisa cuando un agente pasa a «te necesita» (JST-266): la más
 * antigua que no sea una revisión ya dicha en este paso a revisión (`dichas`,
 * por tarea). `-1`: ninguna, es la misma revisión que volvió al feed.
 */
export function esperaQueAvisa(esperas: readonly Espera[], dichas: ReadonlySet<string>): number {
  return esperas.findIndex((e) => e.tipo !== "revision" || !e.issueId || !dichas.has(e.issueId));
}

/**
 * Los que dicen «empecé» (§8): el primer run de una tarea nueva, no cada run.
 * `tareas` es la última tarea que se le vio trabajando a cada agente y se
 * anota aquí. Un run en cola no se anota: Paperclip crea el run `queued` y lo
 * pasa a `running`, y si se anotaba en cola, al arrancar ya no era nueva
 * (JST-119). Lo que trabaja la primera vez que se ve al agente no habla.
 */
export function empezaron<A extends Pick<AgenteVista, "id" | "run">>(tareas: Map<string, string | null>, agentes: readonly A[]): A[] {
  const quienes: A[] = [];
  for (const a of agentes) {
    if (a.run?.enCola) continue;
    const tarea = a.run?.issueId ?? null;
    if (!tareas.has(a.id)) {
      tareas.set(a.id, tarea);
      continue;
    }
    if (tarea && tarea !== tareas.get(a.id)) {
      tareas.set(a.id, tarea);
      quienes.push(a);
    }
  }
  return quienes;
}

// ---------------------------------------------------------------------------
// Textos del aviso
// ---------------------------------------------------------------------------

// JST-413: estos textos solo se ven (aviso del host, del sistema y banner del TV), así que
// siguen el idioma de la interfaz; los de las voces, más abajo, quedan en español.
const mas = (n: number) => (n > 1 ? ` ${t("(y {n} más)", { n: n - 1 })}` : "");
const pregunta = (e: Espera) => (e.titulo != null ? tituloVisible(e.titulo) : t(chipDe(e).label));
const enTarea = (que: string, e: Espera) => (e.identifier ? t("{que} en {tarea}", { que, tarea: e.identifier }) : que);

/** «Confirmación en BET-268: ¿Apruebas…? (y 2 más)» (aviso del host). */
export function cuerpoAviso(a: Pick<AgenteVista, "teNecesita">): string {
  const e = a.teNecesita[0];
  if (!e) return "";
  return `${enTarea(t(chipDe(e).label), e)}: ${pregunta(e)}${mas(a.teNecesita.length)}`;
}

export interface AvisoHost {
  /** El mismo en todas las pestañas: un aviso nuevo del grupo reemplaza al anterior. */
  id: string;
  dedupeKey: string;
  title: string;
  body: string;
  tone: "info";
  ttlMs: number;
  action: { label: string; href: string };
}

/** 15 s, el máximo del host. */
export const TTL_AVISO = 15_000;
/** Ventana para juntar avisos y sonidos. */
export const VENTANA_GRUPO_MS = 10_000;

/** Lo que llega a la vigía: el agente y lo que espera, con los nombres. */
export interface Llegada {
  agenteId: string;
  corto: string;
  empresa: string;
  prefijo: string;
  esperas: Espera[];
}

const lista = (nombres: string[]) =>
  nombres.length <= 1 ? (nombres[0] ?? "") : t("{varios} y {ultimo}", { varios: nombres.slice(0, -1).join(", "), ultimo: nombres.at(-1)! });

/** Nombres del aviso agrupado: «Speckit (Migo), CEO (El Mirador) y Chief of staff (JSTM)»; con más de 3, «… y 2 más». */
export function nombresGrupo(ls: readonly Llegada[]): string {
  const n = ls.map((l) => `${l.corto} (${l.empresa})`);
  if (n.length <= 3) return lista(n);
  return t("{nombres} y {n} más", { nombres: n.slice(0, 3).join(", "), n: n.length - 3 });
}

/**
 * El aviso del host (§7): uno por agente, o uno solo si llegan 2 o más en 10 s.
 * `prefijoPagina`: el de la página que está abierta (el enlace va a esa empresa).
 */
export function avisoHost(ls: readonly Llegada[], prefijoPagina: string, grupo: string): AvisoHost {
  const base = `/${encodeURIComponent(prefijoPagina)}/oficina-global`;
  if (ls.length === 1) {
    const l = ls[0]!;
    const e = l.esperas[0];
    return {
      id: `oficina:${grupo}`,
      dedupeKey: `oficina:${l.agenteId}:${e?.itemId ?? ""}`,
      title: t("✋ {nombre} ({empresa}) te necesita", { nombre: l.corto, empresa: l.empresa }),
      body: cuerpoAviso({ teNecesita: l.esperas }),
      tone: "info",
      ttlMs: TTL_AVISO,
      action: { label: t("Responder"), href: `${base}?responder=${encodeURIComponent(l.agenteId)}` },
    };
  }
  return {
    id: `oficina:${grupo}`,
    dedupeKey: `oficina:${grupo}:${ls.length}`,
    title: t("✋ {n} agentes te necesitan", { n: ls.length }),
    body: nombresGrupo(ls),
    tone: "info",
    ttlMs: TTL_AVISO,
    action: { label: t("Ver en la Oficina"), href: `${base}?hl=toca` },
  };
}

/** El aviso del sistema (solo con https y permitido): título, texto y `tag` por agente. */
export function avisoSistema(l: Llegada): { titulo: string; body: string; tag: string } {
  const e = l.esperas[0];
  const verbo = e?.tipo === "aprobacion" ? t("Te pide aprobar") : t("Te necesita");
  return {
    titulo: `${l.corto} · ${l.empresa}`,
    body: e ? `${enTarea(verbo, e)}: ${pregunta(e)}${mas(l.esperas.length)}` : verbo,
    tag: `oficina:${l.agenteId}`,
  };
}

/** El banner del TV (§10): «Speckit, de Migo, te necesita.» + «Pregunta en MIG-19: ‹pregunta›». */
export function bannerTv(l: Llegada): { fuerte: string; resto: string } {
  const e = l.esperas[0];
  return {
    fuerte: t("{nombre}, de {empresa}, te necesita.", { nombre: l.corto, empresa: l.empresa }),
    resto: e ? `${enTarea(t(chipDe(e).label), e)}: ${pregunta(e)}` : "",
  };
}

// ---------------------------------------------------------------------------
// Voces
// ---------------------------------------------------------------------------

export type Frase = "toca" | "error" | "fin" | "emp";

export const FRASES: Readonly<Record<Frase, { texto: string; resumen: (n: number) => string }>> = {
  toca: { texto: "te necesito", resumen: (n) => `${n} agentes te necesitan` },
  error: { texto: "tengo un error", resumen: (n) => `${n} agentes tienen un error` },
  fin: { texto: "terminé", resumen: (n) => `${n} agentes terminaron` },
  emp: { texto: "empecé", resumen: (n) => `${n} agentes empezaron` },
};

export type Presentacion = "nombre-empresa" | "nombre" | "frase";

/**
 * De qué se trata (0.5.0, design-spec de JST-163 «Qué dice la voz»): la tarea
 * (te necesito, terminé, empecé) o el motivo del error (tengo un error). Desde
 * la 0.8.0 (JST-241), «te necesito» dice lo que espera (`pide`): la pregunta
 * breve, o qué hay que aprobar o revisar; la tarea queda de respaldo.
 */
export interface DetalleVoz {
  /** El nombre de la tarea, entero: se corta con `tareaParaVoz`. */
  tarea?: string | null;
  /** Uno de los 6 motivos que se reconocen (`motivoDeError`). */
  motivo?: string | null;
  /** «Te necesito» (0.8.0): lo que espera. */
  pide?: PideVoz | null;
}

/**
 * Qué espera quien dice «te necesito» (0.8.0): una respuesta, una aprobación,
 * el plan o una revisión. 0.9.1 (JST-254): o que elijas entre las tareas que
 * sugiere, si su tarjeta no tiene título propio.
 */
export type TipoPide = "pregunta" | "aprobar" | "plan" | "revisar" | "elegir";
export const TIPOS_PIDE: readonly TipoPide[] = ["pregunta", "aprobar", "plan", "revisar", "elegir"];

export interface PideVoz {
  tipo: TipoPide;
  /**
   * Lo que espera, entero (como mucho `LETRAS_PIDE`): la pregunta o el título
   * de la tarjeta, el título de la aprobación, el nombre de la tarea (plan y
   * revisión) o la primera tarea sugerida (elegir). Se corta al decirlo
   * (`preguntaParaVoz` o `tareaParaVoz`).
   */
  texto: string;
  /** Cuántas más esperan además de esta: «… Y 2 más.». */
  mas: number;
}

/** Lo que se manda al worker de cada espera: de sobra para la primera pregunta (el feed corta las suyas en 160). */
export const LETRAS_PIDE = 600;
/** Más de esto no se dice («y 99 más»): el worker no acepta otra cosa. */
export const MAX_MAS = 99;

const may = (t: string) => t.replace(/^([¿¡]*)(\p{L})/u, (_m, signo: string, letra: string) => `${signo}${letra.toUpperCase()}`);
const punto = (t: string) => (/[.?!]$/.test(t) ? t : `${t}.`);

/**
 * Lo que dice «te necesito» con lo que espera, o `null` si de ahí no queda
 * nada que decir: «te necesito. ¿Qué IA escribe las conversaciones?»,
 * «te necesito para aprobar: Contratar un diseñador», «te necesito para
 * aprobar el plan de Oficina global 0.8.0», «te necesito para revisar:
 * Instalar la 0.8.0», «te necesito para elegir tareas: Revisar los audios de
 * la 0.8.0 en la real», con «Y 2 más.» al final si hay más esperando.
 */
export function partesPide(pide: PideVoz): { frase: string; extra: string } | null {
  const mas = pide.mas > 0 ? ` Y ${Math.min(pide.mas, MAX_MAS)} más.` : "";
  if (pide.tipo === "pregunta") {
    const q = analizarPregunta(pide.texto.slice(0, LETRAS_PIDE));
    return q ? { frase: "te necesito", extra: ` ${punto(q.texto)}${mas}` } : null;
  }
  const t = tareaParaVoz(pide.texto.slice(0, LETRAS_PIDE));
  if (!t) return null;
  const frase = { plan: `te necesito para aprobar el plan de ${t}`, aprobar: `te necesito para aprobar: ${t}`, revisar: `te necesito para revisar: ${t}`, elegir: `te necesito para elegir tareas: ${t}` }[pide.tipo];
  return { frase, extra: mas };
}

/**
 * «Líder técnico, de Betalandia: te necesito.» / «Líder técnico: te necesito.» / «Te necesito.»
 * Con `detalle` (0.5.0), la tarea va después de un punto («terminé. Diseño de
 * Oficina global 0.5.0.») y el motivo después de dos puntos («tengo un error:
 * límite de uso.»). Sin tarea o sin motivo conocido, la frase de siempre.
 * «Te necesito» con `pide` (0.8.0) dice lo que espera en vez de la tarea.
 */
export function textoVoz(corto: string, empresa: string, f: Frase, p: Presentacion, detalle?: DetalleVoz | null): string {
  let frase = FRASES[f].texto;
  let extra = "";
  const pide = f === "toca" && detalle?.pide ? partesPide(detalle.pide) : null;
  if (pide) {
    frase = pide.frase;
    extra = pide.extra;
  } else if (f === "error") {
    if (detalle?.motivo) frase = `${frase}: ${detalle.motivo}`;
  } else if (detalle?.tarea) {
    const t = tareaParaVoz(detalle.tarea);
    if (t) extra = ` ${punto(may(t))}`;
  }
  // Lo que espera puede terminar en «?» («…de la casilla ¿Es usuario invitado?»): sin otro punto (JST-266).
  if (p === "frase") return `${punto(may(frase))}${extra}`;
  if (p === "nombre") return `${corto}: ${punto(frase)}${extra}`;
  return `${corto}, de ${empresa}: ${punto(frase)}${extra}`;
}

export { tareaParaVoz, preguntaParaVoz, sinRolDelante } from "./paraVoz.js";

/**
 * Los nombres de los roles de una empresa, para `sinRolDelante` (0.8.0): el
 * nombre de cada agente, su cargo y su rol, cortos y largos, y la primera
 * palabra de cada uno («Ingeniero» de «Ingeniero Backend Java / REST»).
 */
export function rolesDeEmpresa(agentes: ReadonlyArray<{ companyId: string; nombre: string; rol: string | null; rolApi: string | null }>, companyId: string): Set<string> {
  const roles = new Set<string>();
  const poner = (x: string | null | undefined) => {
    if (!x || !x.trim()) return;
    for (const v of [x, nombreCorto(x), x.split(/\s+\/\s+|\s+\(|\s+\+\s+|\s+&\s+/)[0]!]) {
      const n = normalizarRol(v);
      if (!n) continue;
      roles.add(n);
      const primera = n.split(" ")[0];
      if (primera && primera.length >= 2 && n.includes(" ")) roles.add(primera);
    }
  };
  for (const a of agentes) {
    if (a.companyId !== companyId) continue;
    poner(a.nombre);
    poner(a.rol);
    poner(a.rolApi ? (ETIQUETA_ROL[a.rolApi] ?? a.rolApi) : null);
  }
  return roles;
}

/** Los títulos que pone Paperclip a una aprobación sin título propio: su tipo con espacios («hire agent»). */
const APROBACION_SIN_TITULO = /^[a-z]+(?: [a-z]+)+$/;

/**
 * Lo que dice «te necesito» de lo que espera un agente (0.8.0): la más antigua
 * (`esperas` ya viene ordenada) y cuántas más. `roles`: los de su empresa (el
 * nombre de la tarea va sin el «Ingeniero:» de adelante). `null` si no hay
 * nada que decir (se dice como antes, con la tarea).
 *
 * - Plan (la tarjeta apunta al documento `plan`): «para aprobar el plan de ‹tarea›».
 * - Aprobación: «para aprobar: ‹título›» (o la tarea, si el título es el tipo en inglés).
 * - Revisión: «para revisar: ‹tarea›».
 * - Tareas sugeridas sin título propio (JST-254): «para elegir tareas: ‹la primera›».
 * - Tarjeta o decisión: la pregunta. Si el título trae una, esa; si no, la
 *   primera pregunta del feed si cabe entera y se entiende sola (4 palabras o
 *   más, 6 si se le sacó lo de antes del «¿»); si no, el título (si no es el
 *   genérico del feed); si no, la del feed, cortada.
 */
export function pideDe(esperas: readonly Espera[], roles: ReadonlySet<string> = new Set()): PideVoz | null {
  const e = esperas[0];
  if (!e) return null;
  const mas = Math.min(esperas.length - 1, MAX_MAS);
  const tarea = e.tituloTarea ? sinRolDelante(e.tituloTarea, roles) : null;
  const de = (tipo: TipoPide, texto: string | null | undefined): PideVoz | null => {
    const t = texto ? texto.slice(0, LETRAS_PIDE) : "";
    return t && (tipo === "pregunta" ? analizarPregunta(t) : tareaParaVoz(t)) ? { tipo, texto: t, mas } : null;
  };
  if (e.plan) return de("plan", tarea ?? e.titulo?.replace(/^Aprobar el plan: /, ""));
  if (e.tipo === "revision") return de("revisar", tarea ?? e.titulo);
  if (e.tipo === "aprobacion") return de("aprobar", e.titulo && !APROBACION_SIN_TITULO.test(e.titulo) ? e.titulo : tarea);
  if (e.tareaSugerida) {
    const elegir = de("elegir", e.tareaSugerida);
    if (elegir) return elegir;
  }
  if (analizarPregunta(e.titulo)?.pregunta) return de("pregunta", e.titulo);
  // La del feed, si es una pregunta entera que se entiende sola («¿Cómo seguimos?» o «¿Se ve el botón?» no: el título dice más).
  const feed = analizarPregunta(e.pregunta);
  if (feed?.pregunta && !feed.cortada && feed.palabras >= (feed.desdeSigno ? 6 : 4)) return de("pregunta", e.pregunta);
  return de("pregunta", e.titulo) ?? de("pregunta", e.pregunta);
}

/** Los 6 motivos de error que se reconocen (spike de JST-161), con lo que trae `heartbeat.run.status`. */
export const MOTIVOS_ERROR = ["límite de uso", "problema con la carpeta de trabajo", "se cortó", "no pudo conectarse", "la Mac se durmió", "no alcanzó a empezar"] as const;
export type MotivoError = (typeof MOTIVOS_ERROR)[number];

/**
 * El motivo de un run que falló, con su `error` y su `errorCode` (los mismos
 * criterios del `spike`), o `null` si no se reconoce: dice «tengo un error»,
 * como antes. La hora del límite («vuelve a las 5:40») no se dice.
 * Un run que se pasa del tiempo queda `status: "timed_out"` con
 * `errorCode: "timeout"` (JST-193): se aceptan los dos nombres.
 */
export function motivoDeError(error: unknown, errorCode: unknown): MotivoError | null {
  const e = typeof error === "string" ? error : "";
  const c = typeof errorCode === "string" ? errorCode : "";
  if (c === "provider_quota" || /quota|rate.?limit|usage limit|session limit|hit your .*limit|\b429\b/i.test(e)) return "límite de uso";
  if (/asleep|went to sleep/i.test(e)) return "la Mac se durmió";
  if (c === "process_lost" || c === "orphaned_running_run" || /disconnected|process_exit/i.test(e)) return "se cortó";
  if (c === "workspace_validation_failed" || c === "setup_failed") return "problema con la carpeta de trabajo";
  if (c.includes("auth")) return "no pudo conectarse";
  if (c === "acpx_session_init_failed" || c === "timeout" || c === "timed_out") return "no alcanzó a empezar";
  return null;
}

/** La muestra fija de «▶ Probar» (se graba una vez por voz al instalar) y su motivo. */
export const MUESTRA_VOZ = { tarea: "Instalar la Oficina global en la real", motivo: "límite de uso" as MotivoError };
/** El audio de la muestra: se toca después del de la frase («Diseño, de JSTM: terminé.» + esto). */
export const TEXTO_MUESTRA = `${MUESTRA_VOZ.tarea}.`;
/** 0.8.0: la pregunta fija de «▶ Probar» con «Te necesito» (también se graba una vez por voz al instalar). */
export const MUESTRA_PREGUNTA = "¿Instalo la versión nueva ahora?";
export const PIDE_MUESTRA: PideVoz = { tipo: "pregunta", texto: MUESTRA_PREGUNTA, mas: 0 };

export interface VozElegible {
  name: string;
  lang: string;
}

/** Primero las voces `es-MX` (9 en Mac); si no hay, las `es-ES`; si no, cualquier español. */
export function vocesEspanol<V extends VozElegible>(voces: readonly V[]): V[] {
  const de = (l: string) => voces.filter((v) => v.lang.replace("_", "-").toLowerCase() === l);
  const mx = de("es-mx");
  if (mx.length) return mx;
  const es = de("es-es");
  if (es.length) return es;
  return voces.filter((v) => v.lang.toLowerCase().startsWith("es"));
}

/**
 * La voz del navegador, el tono y la velocidad de cada agente (§8), fijos por
 * su id. Desde la 0.3.1 es el respaldo: se usa si falta el audio generado de
 * la frase (JST-124).
 */
export function vozDe<V extends VozElegible>(agenteId: string, voces: readonly V[]): { voz: V | null; pitch: number; rate: number } {
  const h = hash(agenteId);
  return {
    voz: voces.length ? voces[h % voces.length]! : null,
    pitch: 0.85 + (h % 31) / 100,
    rate: 0.95 + (hash(`${agenteId}r`) % 16) / 100,
  };
}

/** Lo que espera su turno para hablar. Con 2 o más agentes es un resumen. */
export interface Pendiente {
  frase: Frase;
  agentes: Array<{ id: string; corto: string; empresa: string }>;
  creado: number;
  /** De qué se trata (0.5.0): solo si esa frase lo lleva prendido. Un resumen no lo dice. */
  detalle?: DetalleVoz | null;
}

export const COLA_MAX = 3;
export const COLA_VIEJA_MS = 20_000;
export const ENTRE_FRASES_MS = 3_000;
export const DESPUES_DEL_SONIDO_MS = 250;

/**
 * Cola de las voces (§8): 3 frases como máximo; las de más de 20 s se
 * descartan; si llegan más de 3 en 10 s, se juntan por frase («3 agentes
 * terminaron»). El tiempo lo pone quien la usa.
 */
export class ColaVoces {
  private cola: Pendiente[] = [];
  private llegadasRecientes: number[] = [];

  get largo(): number {
    return this.cola.length;
  }

  /** Lo que espera, en orden (para pedir por adelantado el audio de un resumen). */
  get pendientes(): readonly Pendiente[] {
    return this.cola;
  }

  poner(frase: Frase, agente: { id: string; corto: string; empresa: string }, ahora: number, detalle: DetalleVoz | null = null): void {
    this.llegadasRecientes = this.llegadasRecientes.filter((t) => ahora - t < VENTANA_GRUPO_MS);
    this.llegadasRecientes.push(ahora);
    this.limpiar(ahora);
    const iguales = this.cola.filter((p) => p.frase === frase);
    const resumen = this.llegadasRecientes.length > COLA_MAX || this.cola.length >= COLA_MAX;
    if (iguales.length > 0 && resumen) {
      // Todas las de esa frase que esperan pasan a ser una sola: «3 agentes terminaron».
      const [primera, ...resto] = iguales;
      for (const p of resto) for (const a of p.agentes) if (!primera!.agentes.some((x) => x.id === a.id)) primera!.agentes.push(a);
      if (!primera!.agentes.some((a) => a.id === agente.id)) primera!.agentes.push(agente);
      this.cola = this.cola.filter((p) => !resto.includes(p));
      return;
    }
    if (this.cola.length >= COLA_MAX) return;
    this.cola.push({ frase, agentes: [agente], creado: ahora, detalle });
  }

  /** La siguiente frase que toca decir, o `null`. */
  sacar(ahora: number): Pendiente | null {
    this.limpiar(ahora);
    return this.cola.shift() ?? null;
  }

  /** Bota lo que espera (0.9.0: empieza el Resumen). */
  vaciar(): void {
    this.cola = [];
  }

  private limpiar(ahora: number): void {
    this.cola = this.cola.filter((p) => ahora - p.creado <= COLA_VIEJA_MS);
  }
}

/** El texto de una frase de la cola: la del agente, o el resumen si son varios. */
export function textoPendiente(p: Pendiente, presentacion: Presentacion): string {
  if (p.agentes.length > 1) return `${FRASES[p.frase].resumen(p.agentes.length)}.`;
  const a = p.agentes[0]!;
  return textoVoz(a.corto, a.empresa, p.frase, presentacion);
}

/**
 * La frase de la cola con de qué se trata (0.5.0), o `null` si no lleva: un
 * resumen, sin detalle, o con una tarea o un motivo que no agregan nada.
 */
export function textoPendienteDetalle(p: Pendiente, presentacion: Presentacion): string | null {
  return cadenaDetalle(p, presentacion)?.cadena[0] ?? null;
}

/**
 * Los audios que se prueban, en orden, antes de la frase de siempre (0.8.0):
 * «te necesito» con la pregunta y, si no está, con la tarea (la de la 0.7.0);
 * las demás, con la tarea o el motivo. `subtitulo`: lo que se ve aunque suene
 * otra (la pregunta, JST-241); `null`: se ve lo que suena. `null` si no lleva
 * detalle.
 */
export function cadenaDetalle(p: Pendiente, presentacion: Presentacion): { cadena: string[]; subtitulo: string | null } | null {
  if (p.agentes.length !== 1 || !p.detalle) return null;
  const a = p.agentes[0]!;
  const base = textoVoz(a.corto, a.empresa, p.frase, presentacion);
  const cadena: string[] = [];
  const poner = (t: string) => t !== base && !cadena.includes(t) && cadena.push(t);
  poner(textoVoz(a.corto, a.empresa, p.frase, presentacion, p.detalle));
  const conPregunta = p.frase === "toca" && p.detalle.pide && cadena.length > 0;
  if (conPregunta) poner(textoVoz(a.corto, a.empresa, p.frase, presentacion, { tarea: p.detalle.tarea }));
  return cadena.length ? { cadena, subtitulo: conPregunta ? cadena[0]! : null } : null;
}
