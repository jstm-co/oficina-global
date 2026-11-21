// Final del log de un run para el error completo (design-spec de JST-95 §4),
// sin React ni red. El servidor da un tramo por bytes en NDJSON, una línea
// `{ts, stream, chunk}` por trozo (JST-94).
//   - Si el tramo no empieza en 0, la primera línea llega cortada y se descarta.
//   - Un trozo puede traer varias líneas, o media.
//   - En los agentes de Claude (`acpx`) cada línea del trozo es un evento JSON:
//     se muestra su `text`. Los `acpx.text_delta` seguidos llegan en pedacitos
//     («Est», «oy revisando c»…) y se juntan; los avisos de uso de tokens
//     (`usage_update`) no dicen nada del error y se saltan.
// Se muestran las últimas 20 líneas que no estén vacías.
import { localeTag, t } from "./i18n.js";

export interface LineaLog {
  /** `ts` del trozo, ISO. */
  ts: string;
  /** stderr va en rojo. */
  error: boolean;
  texto: string;
}

export const LINEAS_LOG = 20;

interface Trozo {
  ts: string;
  stream: string;
  chunk: string;
}

function leerTrozo(linea: string): Trozo | null {
  try {
    const t = JSON.parse(linea) as Partial<Trozo>;
    if (typeof t?.chunk !== "string") return null;
    return { ts: typeof t.ts === "string" ? t.ts : "", stream: typeof t.stream === "string" ? t.stream : "stdout", chunk: t.chunk };
  } catch {
    return null;
  }
}

interface EventoAcpx {
  type?: unknown;
  text?: unknown;
  tag?: unknown;
}

/** Un evento JSON de `acpx` («{"type":"acpx.…","text":…}»), o `null` si la línea es texto suelto. */
function eventoAcpx(linea: string): EventoAcpx | null {
  if (!linea.startsWith('{"type":"acpx.')) return null;
  try {
    return JSON.parse(linea) as EventoAcpx;
  } catch {
    return null;
  }
}

/** Las últimas `n` líneas no vacías del tramo. `cortado`: el tramo empieza a mitad del log. */
export function lineasDelLog(contenido: string, cortado: boolean, n = LINEAS_LOG): LineaLog[] {
  const crudas = contenido.split("\n");
  if (cortado) crudas.shift();
  const lineas: LineaLog[] = [];
  // Texto que todavía no termina en salto de línea (por trozo y flujo), y los pedacitos de `acpx.text_delta`.
  let pendiente: LineaLog | null = null;
  const cerrar = () => {
    if (pendiente && pendiente.texto.trim()) lineas.push({ ...pendiente, texto: pendiente.texto.replace(/\s+$/, "") });
    pendiente = null;
  };
  const sumar = (ts: string, error: boolean, texto: string) => {
    const partes = texto.split("\n");
    partes.forEach((parte, i) => {
      if (!pendiente) pendiente = { ts, error, texto: "" };
      pendiente.texto += parte;
      if (i < partes.length - 1) cerrar();
    });
  };
  for (const cruda of crudas) {
    if (!cruda.trim()) continue;
    const trozo = leerTrozo(cruda);
    if (!trozo) continue;
    const error = trozo.stream === "stderr";
    for (const linea of trozo.chunk.split("\n")) {
      const ev = eventoAcpx(linea.trim());
      if (ev) {
        if (ev.tag === "usage_update" || typeof ev.text !== "string") continue;
        if (ev.type === "acpx.text_delta") {
          sumar(trozo.ts, error, ev.text);
          continue;
        }
        cerrar();
        sumar(trozo.ts, error, ev.text);
        cerrar();
        continue;
      }
      if (!linea) continue;
      // Texto suelto (adaptador `process`, Hermes): cada línea del trozo es una línea del log.
      cerrar();
      sumar(trozo.ts, error, linea);
      cerrar();
    }
  }
  cerrar();
  return lineas.slice(-n);
}

/** «14:38:21», en hora local. */
export function horaLinea(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(localeTag(), { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

/** «hoy 14:38:21», «ayer 23:10:04» o «18 oct 09:12:40» (Cuándo, §4). */
export function diaYHora(iso: string | null | undefined, ahora: number): string {
  if (!iso) return "";
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "";
  const dia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dias = Math.round((dia(new Date(ahora)) - dia(fecha)) / 86_400_000);
  const hora = horaLinea(iso);
  if (dias <= 0) return t("hoy {hora}", { hora });
  if (dias === 1) return t("ayer {hora}", { hora });
  return `${fecha.toLocaleDateString(localeTag(), { day: "numeric", month: "short" }).replace(".", "")} ${hora}`;
}

/** «52 s», «4 min», «1 h 12 min»; `""` si falta una de las horas. */
export function duracion(desde: string | null | undefined, hasta: string | null | undefined): string {
  const a = desde ? Date.parse(desde) : NaN;
  const b = hasta ? Date.parse(hasta) : NaN;
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return "";
  const s = Math.round((b - a) / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}

export interface DatosCopia {
  empresa: string;
  agente: string;
  runId: string;
  errorCode: string | null;
  exitCode: number | null;
  signal: string | null;
  /** «hoy 14:38:21». */
  cuando: string;
  motivo: string | null;
  lineas: readonly LineaLog[];
}

/** El texto que copia «Copiar» (§4). */
export function textoCopia(d: DatosCopia): string {
  const extra = d.exitCode != null ? ` (exit ${d.exitCode})` : d.signal ? ` (${d.signal})` : "";
  const cabeza = [`${d.empresa} · ${d.agente} · run ${d.runId.slice(0, 8)}`, `${d.errorCode ?? "error"}${extra} · ${d.cuando}`];
  if (d.motivo) cabeza.push(d.motivo);
  const cuerpo = d.lineas.map((l) => `${horaLinea(l.ts)} ${l.error ? "[err] " : ""}${l.texto}`);
  return [...cabeza, "", ...cuerpo].join("\n");
}
