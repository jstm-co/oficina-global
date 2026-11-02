// Lo que se le pide a la IA de Chrome (0.7.0, JST-232): el prompt v4 del spike
// de JST-230 con lo que eligió el usuario (solo el final de cada conversación y
// las frases sueltas) y lo que la revisión le exige (las 3 reglas del punto 4 y
// las sueltas de 24 letras). Sin React ni navegador.
//
// Un paquete es un pedido: hasta 8 finales y 5 sueltas (punto 10). A la IA le
// llega el comienzo de cada conversación tal como lo dice hoy la Oficina (sin
// las tareas: van abajo del globo) y escribe 1 o 2 frases para cerrarla. Responde
// en JSON con un esquema (`responseConstraint`): con objetos `{texto}`, porque
// las respuestas desbocadas del spike fueron con listas de textos sueltos.
import type { MuestraFinal } from "../charlas.js";
import { plano, revisarFinal, revisarSuelta } from "./revision.js";

/**
 * Si cambia el prompt o la revisión, la reserva guardada se bota (la escribió otra versión). La v4.2 bota lo que copia
 * el ejemplo y los finales que son una frase de siempre.
 */
export const VERSION_PROMPT = "v4.2";
/** Por paquete: 8 finales y 5 sueltas (punto 10 del spike). */
export const FINALES_POR_PAQUETE = 8;
export const SUELTAS_POR_PAQUETE = 5;
/**
 * Los finales por paquete con un modelo más chico que Gemini Nano (fuera de Chrome: el de Apple en Paperclip
 * Dispatch). Con 8, el de Apple copia las frases del pedido y pasan 45 finales de 192; con 4, 75 (las mismas
 * conversaciones, con esta revisión). Las sueltas y los paquetes de la ráfaga van en proporción.
 */
export const FINALES_POR_PAQUETE_CHICO = 4;

export const SISTEMA = `Escribes lo que dicen los agentes de una oficina pixel. Son agentes de IA que trabajan en tareas de software. Cuando están libres van al descanso a tomar café y conversan de a dos. Escribe en español de Chile, cercano y con humor suave, como compañeros de pega: frases cortas y naturales («bacán», «harta pega», «¡buena!», «uf»), sin groserías.

Te doy el comienzo de cada conversación, ya escrito. Tú escribes cómo termina: 1 o 2 frases más, que reaccionan a lo último que se dijo (un ánimo, una pregunta corta, una broma o algo del café). La primera frase tuya la dice el que no habló al último; si escribes 2, se turnan.

Reglas que no se rompen:
1. Tus frases no traen datos: ningún nombre, cargo, empresa, número, hora, día, tarea ni estado (nada de «terminó», «error», «pausa», «revisión», «cola», «trabajando», «esperando» ni «bloqueado»). Eso ya se dijo.
2. No inventes lo que alguien hizo, hace o va a hacer (nada de «voy a…»). No juzgues a nadie: ni al usuario ni a un compañero.
3. Tiene que tener sentido con lo último que se dijo: si es una mala noticia, no digas «qué bueno».
4. Cada frase tiene como máximo 45 letras. Sin comillas, sin emojis, sin palabras en inglés. No digas cuándo: nada de «hoy», «ayer», «antes», «mañana» ni «luego».
5. Las frases sueltas son lo que piensa alguien solo en el descanso: hasta 24 letras, sin datos y sin hablar de su trabajo: el café, el sofá, estirarse, la ventana, las ganas de volver. Que no se repitan entre ellas.`;

export const EJEMPLO_PEDIDO = `Conversaciones:
- c1 · A: «Acabo de terminar esta.»
- c2 · B: «¿Cuántos están trabajando?» / A: «6. Un día normal.»
- c3 · A: «A CEO le falló el run.» / B: «¿Qué le pasó?» / A: «Se quedó sin cupo, parece.»
Frases sueltas:
- s1
- s2`;

const EJEMPLO = {
  charlas: [
    { id: "c1", frases: [{ texto: "¡Buena! ¿Te costó mucho?" }, { texto: "Un poco, pero quedó bien." }] },
    { id: "c2", frases: [{ texto: "Entonces nos toca cuidar el café." }] },
    { id: "c3", frases: [{ texto: "Uf. Ojalá lo resuelvan pronto." }] },
  ],
  sueltas: [
    { id: "s1", texto: "Este café me salva." },
    { id: "s2", texto: "Un respiro y sigo." },
  ],
};
export const EJEMPLO_RESPUESTA = JSON.stringify(EJEMPLO);

/**
 * Las frases del ejemplo, pedido y respuesta (como `plano`): la IA no puede copiarlas (un modelo chico lo hace, y
 * pegan con cualquier conversación: «¡Buena! ¿Te costó mucho?» después de un error).
 */
const DEL_EJEMPLO: ReadonlySet<string> = new Set(
  [...[...EJEMPLO_PEDIDO.matchAll(/«([^»]+)»/g)].map((m) => m[1]!), ...EJEMPLO.charlas.flatMap((c) => c.frases.map((f) => f.texto)), ...EJEMPLO.sueltas.map((s) => s.texto)].map(plano),
);
const copiaEjemplo = (frases: readonly string[]): string[] => (frases.some((f) => DEL_EJEMPLO.has(plano(f))) ? ["copia el ejemplo"] : []);

/** Lo que el esquema deja escribir: letras y signos (sin números, comillas ni emojis), y un tope de largo. */
const texto = (max: number) => ({ type: "string", pattern: `^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ ¿?¡!.,;:…-]{1,${max}}$` });

export interface Paquete {
  /** Lo que se le manda a la IA. */
  texto: string;
  /** El `responseConstraint`. */
  esquema: Record<string, unknown>;
  /** Cada `cN` y su muestra. */
  finales: ReadonlyMap<string, MuestraFinal>;
  /** Los `sN` pedidos. */
  sueltas: readonly string[];
}

/** «A» es quien dice la primera frase de la conversación; «B», el otro. */
function comienzo(m: MuestraFinal): string {
  const a = m.fijas[0]!.quien;
  return m.fijas.map((l) => `${l.quien === a ? "A" : "B"}: «${l.texto}»`).join(" / ");
}

/** El pedido de un paquete: el comienzo de cada conversación (`c1`…) y cuántas sueltas (`s1`…). */
export function armarPaquete(muestras: readonly MuestraFinal[], nSueltas: number): Paquete {
  const finales = new Map<string, MuestraFinal>();
  muestras.slice(0, FINALES_POR_PAQUETE).forEach((m, i) => finales.set(`c${i + 1}`, m));
  const sueltas = Array.from({ length: Math.max(0, nSueltas) }, (_, i) => `s${i + 1}`);
  const lineas: string[] = [];
  const props: Record<string, unknown> = {};
  const req: string[] = [];
  if (finales.size > 0) {
    lineas.push("Conversaciones:");
    for (const [id, m] of finales) lineas.push(`- ${id} · ${comienzo(m)}`);
    props.charlas = {
      type: "array",
      minItems: finales.size,
      maxItems: finales.size,
      items: {
        type: "object",
        required: ["id", "frases"],
        properties: {
          id: { type: "string", enum: [...finales.keys()] },
          frases: { type: "array", minItems: 1, maxItems: 2, items: { type: "object", required: ["texto"], properties: { texto: texto(50) } } },
        },
      },
    };
    req.push("charlas");
  }
  if (sueltas.length > 0) {
    lineas.push("Frases sueltas:");
    for (const id of sueltas) lineas.push(`- ${id}`);
    props.sueltas = {
      type: "array",
      minItems: sueltas.length,
      maxItems: sueltas.length,
      items: { type: "object", required: ["id", "texto"], properties: { id: { type: "string", enum: sueltas }, texto: texto(30) } },
    };
    req.push("sueltas");
  }
  return { texto: lineas.join("\n"), esquema: { type: "object", required: req, properties: props }, finales, sueltas };
}

/** Una frase que la revisión botó: para el registro y la QA. */
export interface Botada {
  id: string;
  tipo: "final" | "suelta";
  texto: string;
  motivos: string[];
}

export interface Leido {
  /** Los finales que pasaron la revisión, con su muestra (las fijas que vio la IA). */
  finales: Array<{ clave: string; frases: string[]; muestra: MuestraFinal }>;
  sueltas: string[];
  botadas: Botada[];
  /** El JSON no se pudo leer (se bota todo el paquete). */
  error: string | null;
}

const textoDe = (f: unknown): string | null => (typeof f === "string" ? f : f && typeof f === "object" && typeof (f as { texto?: unknown }).texto === "string" ? (f as { texto: string }).texto : null);

/**
 * Lo que respondió la IA a un paquete, revisado: lo que no pasa se bota (esa
 * frase o ese final, no el paquete) y en su lugar queda la frase de siempre.
 * Un id que no se pidió o repetido, también se bota, y lo que copia una frase
 * del ejemplo.
 */
export function leerPaquete(salida: string, p: Paquete, nombres: readonly string[]): Leido {
  const r: Leido = { finales: [], sueltas: [], botadas: [], error: null };
  let j: { charlas?: unknown; sueltas?: unknown };
  try {
    j = JSON.parse(salida) as typeof j;
  } catch (e) {
    return { ...r, error: `JSON malo: ${(e as Error).message.slice(0, 80)}` };
  }
  if (!j || typeof j !== "object") return { ...r, error: "JSON malo: no es un objeto" };
  const vistos = new Set<string>();
  for (const c of Array.isArray(j.charlas) ? j.charlas : []) {
    const id = typeof c?.id === "string" ? c.id : "";
    const m = p.finales.get(id);
    const frases = (Array.isArray(c?.frases) ? c.frases : []).map(textoDe).filter((t: string | null): t is string => t !== null).map((t: string) => t.trim());
    const motivos = !m || vistos.has(id) ? ["id que no se pidió"] : revisarFinal(frases, m.fijas, nombres);
    if (motivos.length === 0) motivos.push(...copiaEjemplo(frases));
    vistos.add(id);
    if (motivos.length === 0 && m) r.finales.push({ clave: m.clave, frases, muestra: m });
    else r.botadas.push({ id, tipo: "final", texto: frases.join(" / "), motivos });
  }
  const dichas = new Set<string>();
  for (const s of Array.isArray(j.sueltas) ? j.sueltas : []) {
    const id = typeof s?.id === "string" ? s.id : "";
    const t = (textoDe(s) ?? "").trim();
    const motivos = !p.sueltas.includes(id) || vistos.has(id) ? ["id que no se pidió"] : revisarSuelta(t, nombres);
    if (motivos.length === 0) motivos.push(...copiaEjemplo([t]));
    vistos.add(id);
    if (motivos.length === 0 && dichas.has(t.toLowerCase())) motivos.push("repetida en el paquete");
    dichas.add(t.toLowerCase());
    if (motivos.length === 0) r.sueltas.push(t);
    else r.botadas.push({ id, tipo: "suelta", texto: t, motivos });
  }
  return r;
}
