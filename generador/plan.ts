// Qué audios hacen falta (JST-124): la voz de cada agente y todas las frases
// que la Oficina puede decir, con los mismos textos que arma la página.
import { createHash } from "node:crypto";
import { FRASES, MOTIVOS_ERROR, MUESTRA_PREGUNTA, nombreCorto, TEXTO_MUESTRA, textoVoz, type Frase, type Presentacion } from "../src/avisos.js";
import { textosAvisosJuntos } from "../src/eleccionVoces.js";
import { claveAudio, extensionDe, VOCES, VOZ_RESUMEN, vozPorId, type Voz, type VozId } from "../src/voces.js";
import { VERSION_PRONUNCIACION } from "./pronunciar.js";

export interface AgentePlan {
  id: string;
  nombre: string;
  empresa: string;
  /** `createdAt` del agente: los más antiguos eligen primero. */
  creado: string;
}

const sha1 = (t: string) => createHash("sha1").update(t).digest("hex");

/**
 * Reparte las voces. Quien ya tiene una se queda con ella; cada agente nuevo,
 * del más antiguo al más nuevo, recibe una de las menos usadas, y entre esas
 * una al azar pero fija (por su id). Así se usan todas y, con los mismos
 * agentes, sale el mismo reparto en la copia y en la real.
 *
 * 0.13.0 (issue #9): los nuevos reciben solo voces de `entre` (las de los
 * motores elegidos); quien ya tiene una de otro motor se queda con ella.
 */
export function asignarVoces(previas: Readonly<Record<string, VozId>>, agentes: readonly AgentePlan[], entre: readonly Voz[] = VOCES): Record<string, VozId> {
  const asignadas: Record<string, VozId> = {};
  const cuenta = new Map<VozId, number>(entre.map((v) => [v.id, 0]));
  const vivos = new Set(agentes.map((a) => a.id));
  for (const [id, voz] of Object.entries(previas)) {
    if (!vivos.has(id) || !vozPorId(voz)) continue;
    asignadas[id] = voz;
    if (cuenta.has(voz)) cuenta.set(voz, cuenta.get(voz)! + 1);
  }
  const nuevos = agentes.filter((a) => !asignadas[a.id]).sort((a, b) => a.creado.localeCompare(b.creado) || a.id.localeCompare(b.id));
  if (cuenta.size === 0) return asignadas;
  for (const a of nuevos) {
    const menos = Math.min(...cuenta.values());
    const candidatas = entre.filter((v) => cuenta.get(v.id) === menos).sort((x, y) => sha1(`${a.id}|${x.id}`).localeCompare(sha1(`${a.id}|${y.id}`)));
    const voz = candidatas[0]!.id;
    asignadas[a.id] = voz;
    cuenta.set(voz, menos + 1);
  }
  return asignadas;
}

export interface Trabajo {
  voz: Voz;
  texto: string;
  /** Nombre del MP3 en la carpeta de las voces. */
  archivo: string;
}

const ORDEN_FRASES: readonly Frase[] = ["toca", "error", "fin", "emp"];
/** Las que se dicen con nombre; «Solo la frase» va aparte, una por voz. */
const PRESENTACIONES: readonly Presentacion[] = ["nombre-empresa", "nombre"];

/** El audio de una frase: cambia si cambia la voz, el texto o cómo se pronuncia. MP3, o WAV con Supertonic (0.13.0). */
export function archivoDe(voz: VozId, texto: string): string {
  return `${sha1(`v${VERSION_PRONUNCIACION}|${claveAudio(voz, texto)}`).slice(0, 20)}.${extensionDe(voz)}`;
}

/**
 * Todas las frases: las 4 de cada agente con «Nombre y empresa» y con «Solo el
 * nombre», las 4 sueltas de cada voz («Solo la frase») y los resúmenes con la
 * voz fija, para cualquier número de agentes (de 2 a todos).
 *
 * 0.5.0 (JST-167): «tengo un error» con cada uno de los 6 motivos que se
 * reconocen («tengo un error: límite de uso»), con las 3 presentaciones, y la
 * muestra de «▶ Probar» de cada voz («Instalar la Oficina global en la real.»).
 * 0.8.0 (JST-241): también la pregunta de «▶ Probar» con «Te necesito»
 * («¿Instalo la versión nueva ahora?»). Las frases con el nombre de una tarea
 * o con una pregunta de verdad no van aquí: las prepara el worker.
 * 0.13.0 (issue #9): las sueltas, solo de las voces de `sueltas` (las de los
 * motores elegidos), y los resúmenes hasta `totalAgentes` (el worker no recibe
 * siempre a todos los agentes: solo los que ve quien abre la oficina).
 */
export function plan(agentes: readonly AgentePlan[], voces: Readonly<Record<string, VozId>>, vozResumen: VozId = VOZ_RESUMEN, sueltas: readonly Voz[] = VOCES, totalAgentes = agentes.length): Trabajo[] {
  const lista: Trabajo[] = [];
  const vistas = new Set<string>();
  const poner = (voz: Voz, texto: string) => {
    const k = claveAudio(voz.id, texto);
    if (vistas.has(k)) return;
    vistas.add(k);
    lista.push({ voz, texto, archivo: archivoDe(voz.id, texto) });
  };
  for (const a of agentes) {
    const voz = vozPorId(voces[a.id]);
    if (!voz) continue;
    for (const f of ORDEN_FRASES) for (const p of PRESENTACIONES) poner(voz, textoVoz(nombreCorto(a.nombre), a.empresa, f, p));
    for (const motivo of MOTIVOS_ERROR) for (const p of PRESENTACIONES) poner(voz, textoVoz(nombreCorto(a.nombre), a.empresa, "error", p, { motivo }));
  }
  for (const voz of sueltas) for (const f of ORDEN_FRASES) poner(voz, textoVoz("", "", f, "frase"));
  for (const voz of sueltas) for (const motivo of MOTIVOS_ERROR) poner(voz, textoVoz("", "", "error", "frase", { motivo }));
  for (const voz of sueltas) poner(voz, TEXTO_MUESTRA);
  for (const voz of sueltas) poner(voz, MUESTRA_PREGUNTA);
  const resumen = vozPorId(vozResumen)!;
  for (const f of ORDEN_FRASES) for (let n = 2; n <= Math.max(2, totalAgentes); n++) poner(resumen, `${FRASES[f].resumen(n)}.`);
  return lista;
}

/**
 * 0.11.0 (JST-325): lo que se graba al darle otra voz a un agente. Las 20 frases
 * con su nombre y empresa (4 frases × 2 presentaciones, y 6 motivos de error × 2);
 * las de «Solo la frase» y las muestras ya están grabadas para las 9 voces, pero
 * se piden igual por si falta alguna (las que ya existen no se vuelven a hacer).
 */
export function trabajosDeAgente(a: Pick<AgentePlan, "id" | "nombre" | "empresa">, voz: VozId): Trabajo[] {
  const v = vozPorId(voz);
  if (!v) return [];
  const lista: Trabajo[] = [];
  const vistas = new Set<string>();
  const poner = (texto: string) => {
    if (vistas.has(texto)) return;
    vistas.add(texto);
    lista.push({ voz: v, texto, archivo: archivoDe(v.id, texto) });
  };
  for (const f of ORDEN_FRASES) for (const p of PRESENTACIONES) poner(textoVoz(nombreCorto(a.nombre), a.empresa, f, p));
  for (const motivo of MOTIVOS_ERROR) for (const p of PRESENTACIONES) poner(textoVoz(nombreCorto(a.nombre), a.empresa, "error", p, { motivo }));
  for (const f of ORDEN_FRASES) poner(textoVoz("", "", f, "frase"));
  for (const motivo of MOTIVOS_ERROR) poner(textoVoz("", "", "error", "frase", { motivo }));
  poner(TEXTO_MUESTRA);
  poner(MUESTRA_PREGUNTA);
  return lista;
}

/** Los «3 agentes te necesitan.» con esa voz, para cualquier número de agentes (de 2 a `agentes`). */
export function trabajosAvisosJuntos(agentes: number, voz: VozId): Trabajo[] {
  return textosAvisosJuntos(agentes).map((texto) => ({ voz: vozPorId(voz)!, texto, archivo: archivoDe(voz, texto) }));
}
