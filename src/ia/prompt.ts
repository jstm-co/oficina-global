// El pedido a Gemini Nano (0.13.0, JST-345): reescribe la apertura conservando
// exactamente sus huecos, escribe el final y crea sueltas, bromas y frases para
// cada mascota. El esquema separa cada parte para botar solo la que no pasa la
// revisión. Las últimas frases aceptadas se incluyen con la orden de no repetirlas.
import type { IdMascota, MuestraFinal } from "../charlas.js";
import { casiIgual, plano, revisarApertura, revisarBroma, revisarFinal, revisarMascota, revisarSuelta } from "./revision.js";

export const VERSION_PROMPT = "v5.4-jst345";
/** Cuatro conversaciones por paquete dejan espacio para el resto dentro del tope de 1.500 letras. */
export const FINALES_POR_PAQUETE = 4;
export const SUELTAS_POR_PAQUETE = 5;
/** Fuera de Chrome, el modelo de la página puede ser más chico; los paquetes van en proporción. */
export const FINALES_POR_PAQUETE_CHICO = 4;

export const SISTEMA = `Escribes lo que dicen los agentes de una oficina pixel. Son agentes de IA que trabajan en tareas de software. Cuando están libres van al descanso a tomar café y conversan de a dos. Escribe en español de Chile, cercano y con humor suave, como compañeros de pega: frases cortas y naturales («bacán», «harta pega», «¡buena!», «uf»), sin groserías.

Para cada conversación reescribes su apertura y escribes su final. Nunca copies la apertura original: usa otras palabras y otra estructura, no cambies solo signos ni agregues una palabra. Conserva exactamente los mismos huecos ({tarea}, {agente}, {empresa}, {rol}, {n}, {esperando}), sin borrar ninguno ni inventar otros. Esos huecos los rellena el código con datos reales. El valor de {rol} ya incluye su artículo: no pongas «el», «la», «los» ni «las» justo antes de {rol}. El valor de {n} ya incluye número y unidad cuando corresponde: no agregues «minutos», «horas», «días», «semanas», «meses» ni «años» fuera de {n}. Si ya hay cuatro frases fijas, el final va vacío; si no, escribe 1 o 2 frases que reaccionen con sentido a lo último dicho. La primera frase del final la dice quien no habló al último; si escribes 2, se turnan. Si el pedido dice «Solo reescribe aperturas», no escribas ningún final: frases va siempre vacío.

Reglas que no se rompen:
1. Fuera de los huecos no traes datos: ningún nombre, cargo, empresa, número, hora, día, tarea ni identificador. En finales, sueltas y bromas tampoco estados ni lo que alguien hizo, hace o va a hacer (nada de «voy a…»).
2. No juzgues a nadie: ni al usuario ni a un compañero. Si es una mala noticia, no digas «qué bueno».
3. Cada frase tiene como máximo 45 letras; las sueltas y mascotas, 24. Sin comillas, emojis ni palabras en inglés. No digas cuándo: nada de «hoy», «ayer», «antes», «mañana» ni «luego».
4. Las sueltas son lo que piensa alguien solo en el descanso: el café, el sofá, estirarse o la ventana. Las bromas tienen exactamente dos frases y las dicen A y B. Cada mascota habla como su animal: gato, perro, conejo o robot aspiradora.
5. No repitas las frases recientes incluidas en el pedido ni cambies solo una palabra. Varía también las sueltas entre sí.`;

export const EJEMPLO_PEDIDO = `Conversaciones:
- c1 · Apertura: «Acabo de terminar {tarea}.» · Huecos: {tarea} · Sigue: B: «¡Bien! ¿Fue complicado?»
- c2 · Apertura: «Hay {n} esperando respuesta.» · Huecos: {n} · Sigue: B: «Uf, harta cola.»
Frases sueltas:
- s1
Bromas:
- b1
Mascotas:
- m1: gato
No repitas estas frases recientes:
- «Este café me salva.»`;

const EJEMPLO = {
  charlas: [
    { id: "c1", primera: "Por fin quedó {tarea}.", frases: [{ texto: "¡Buena! ¿Te costó mucho?" }, { texto: "Un poco, pero quedó bien." }] },
    { id: "c2", primera: "Ahora son {n} los que esperan.", frases: [{ texto: "Nos toca cuidar el café." }] },
  ],
  sueltas: [{ id: "s1", texto: "Un respiro y sigo." }],
  bromas: [{ id: "b1", frases: [{ texto: "¿Café o té?" }, { texto: "Café, que el té no despierta." }] }],
  mascotas: [{ id: "m1", texto: "Miau, qué sol rico." }],
};
export const EJEMPLO_RESPUESTA = JSON.stringify(EJEMPLO);

const DEL_EJEMPLO: ReadonlySet<string> = new Set(
  [
    ...[...EJEMPLO_PEDIDO.matchAll(/«([^»]+)»/g)].map((m) => m[1]!),
    ...EJEMPLO.charlas.flatMap((c) => c.frases.map((f) => f.texto)),
    ...EJEMPLO.sueltas.map((s) => s.texto),
  ].map(plano),
);
const copiaEjemplo = (frases: readonly string[]): string[] => (frases.some((f) => DEL_EJEMPLO.has(plano(f))) ? ["copia el ejemplo"] : []);

const texto = (max: number, huecos = false) => ({
  type: "string",
  pattern: `^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ ¿?¡!.,;:…${huecos ? "{}" : ""}-]{1,${max}}$`,
});

export interface Paquete {
  texto: string;
  esquema: Record<string, unknown>;
  finales: ReadonlyMap<string, MuestraFinal>;
  sueltas: readonly string[];
  bromas: readonly string[];
  mascotas: ReadonlyMap<string, IdMascota>;
  soloAperturas: boolean;
}

function continuacion(m: MuestraFinal): string {
  const fijas = m.fijas.slice(1);
  if (!fijas.length) return "";
  const a = m.fijas[0]!.quien;
  return ` · Sigue: ${fijas.map((l) => `${l.quien === a ? "A" : "B"}: «${l.texto}»`).join(" / ")}`;
}

export function armarPaquete(muestras: readonly MuestraFinal[], nSueltas: number, recientes: readonly string[] = [], soloAperturas = false, soloSueltas = false): Paquete {
  const finales = new Map<string, MuestraFinal>();
  if (!soloSueltas) muestras.slice(0, FINALES_POR_PAQUETE).forEach((m, i) => finales.set(`c${i + 1}`, m));
  const sueltas = soloAperturas ? [] : Array.from({ length: Math.max(0, nSueltas) }, (_, i) => `s${i + 1}`);
  const bromas = sueltas.length > 0 && !soloSueltas ? ["b1"] : [];
  const mascotas = new Map<string, IdMascota>();
  if (bromas.length > 0) (["gato", "perro", "conejo", "robot"] as const).forEach((id, i) => mascotas.set(`m${i + 1}`, id));
  const lineas: string[] = soloAperturas ? ["Solo reescribe aperturas; en cada respuesta, frases debe ser []."] : [];
  const props: Record<string, unknown> = {};
  const req: string[] = [];
  if (finales.size > 0) {
    lineas.push("Conversaciones (reescribe cada apertura con otras palabras; no copies la original):");
    for (const [id, m] of finales) {
      const huecos = [...new Set([...m.apertura.matchAll(/\{([a-z]+)\}/g)].map((x) => `{${x[1]}}`))].join(", ") || "ninguno";
      lineas.push(`- ${id} · Apertura: «${m.apertura}» · Huecos: ${huecos}${continuacion(m)}`);
    }
    props.charlas = {
      type: "array",
      minItems: finales.size,
      maxItems: finales.size,
      items: {
        type: "object",
        required: ["id", "primera", "frases"],
        properties: {
          id: { type: "string", enum: [...finales.keys()] },
          primera: texto(70, true),
          frases: { type: "array", minItems: 0, maxItems: 2, items: { type: "object", required: ["texto"], properties: { texto: texto(50) } } },
        },
      },
    };
    req.push("charlas");
  }
  if (sueltas.length > 0) {
    lineas.push("Frases sueltas:", ...sueltas.map((id) => `- ${id}`));
    props.sueltas = {
      type: "array",
      minItems: sueltas.length,
      maxItems: sueltas.length,
      items: { type: "object", required: ["id", "texto"], properties: { id: { type: "string", enum: sueltas }, texto: texto(30) } },
    };
    req.push("sueltas");
    if (!soloSueltas) {
      lineas.push("Bromas:", ...bromas.map((id) => `- ${id}`));
      props.bromas = {
        type: "array",
        minItems: 1,
        maxItems: 1,
        items: {
          type: "object",
          required: ["id", "frases"],
          properties: {
            id: { type: "string", enum: bromas },
            frases: { type: "array", minItems: 2, maxItems: 2, items: { type: "object", required: ["texto"], properties: { texto: texto(50) } } },
          },
        },
      };
      req.push("bromas");
      lineas.push("Mascotas:", ...[...mascotas].map(([id, animal]) => `- ${id}: ${animal}`));
      props.mascotas = {
        type: "array",
        minItems: mascotas.size,
        maxItems: mascotas.size,
        items: {
          type: "object",
          required: ["id", "texto"],
          properties: { id: { type: "string", enum: [...mascotas.keys()] }, texto: texto(30) },
        },
      };
      req.push("mascotas");
    }
  }
  if (recientes.length) lineas.push("No repitas estas frases recientes:", ...recientes.map((t) => `- «${t}»`));
  return { texto: lineas.join("\n"), esquema: { type: "object", required: req, properties: props }, finales, sueltas, bromas, mascotas, soloAperturas };
}

export interface Botada {
  id: string;
  tipo: "apertura" | "final" | "suelta" | "broma" | "mascota";
  texto: string;
  motivos: string[];
}

export interface Leido {
  finales: Array<{ id: string; clave: string; frases: string[]; apertura: string | null; muestra: MuestraFinal }>;
  sueltas: string[];
  bromas: string[][];
  mascotas: Array<{ id: IdMascota; texto: string }>;
  botadas: Botada[];
  error: string | null;
}

const textoDe = (f: unknown): string | null => (typeof f === "string" ? f : f && typeof f === "object" && typeof (f as { texto?: unknown }).texto === "string" ? (f as { texto: string }).texto : null);
const frasesDe = (x: unknown): string[] => (Array.isArray(x) ? x : []).map(textoDe).filter((t: string | null): t is string => t !== null).map((t: string) => t.trim());

/** Revisa cada parte por separado: una apertura mala no bota un final bueno, y viceversa. */
export function leerPaquete(salida: string, p: Paquete, nombres: readonly string[]): Leido {
  const r: Leido = { finales: [], sueltas: [], bromas: [], mascotas: [], botadas: [], error: null };
  let j: { charlas?: unknown; sueltas?: unknown; bromas?: unknown; mascotas?: unknown };
  try {
    j = JSON.parse(salida) as typeof j;
  } catch (e) {
    return { ...r, error: `JSON malo: ${(e as Error).message.slice(0, 80)}` };
  }
  if (!j || typeof j !== "object") return { ...r, error: "JSON malo: no es un objeto" };
  const vistos = new Set<string>();
  const repetida = (lista: readonly string[], texto: string) => lista.some((t) => casiIgual(t, texto));
  const aperturas: string[] = [];
  const finales: string[] = [];
  for (const c of Array.isArray(j.charlas) ? j.charlas : []) {
    const id = typeof c?.id === "string" ? c.id : "";
    const m = p.finales.get(id);
    if (!m || vistos.has(id)) {
      r.botadas.push({ id, tipo: "final", texto: "", motivos: ["id que no se pidió"] });
      continue;
    }
    vistos.add(id);
    const primera = (textoDe(c?.primera) ?? "").trim();
    const frases = frasesDe(c?.frases);
    let apertura: string | null = primera;
    let malA = revisarApertura(primera, m.apertura, nombres);
    if (repetida(aperturas, primera)) malA = [...malA, "casi igual a otra del paquete"];
    if (malA.length) {
      r.botadas.push({ id, tipo: "apertura", texto: primera, motivos: [...new Set(malA)] });
      apertura = null;
    } else aperturas.push(primera);
    let malF = frases.length === 0 && (p.soloAperturas || m.fijas.length >= 4) ? [] : revisarFinal(frases, m.fijas, nombres);
    if (!malF.length) malF.push(...copiaEjemplo(frases));
    if (frases.length && repetida(finales, frases.join(" "))) malF = [...malF, "casi igual a otra del paquete"];
    if (malF.length) {
      r.botadas.push({ id, tipo: "final", texto: frases.join(" / "), motivos: [...new Set(malF)] });
      frases.length = 0;
    } else if (frases.length) finales.push(frases.join(" "));
    if (apertura || frases.length) r.finales.push({ id, clave: m.clave, frases, apertura, muestra: m });
  }
  const sueltas: string[] = [];
  for (const s of Array.isArray(j.sueltas) ? j.sueltas : []) {
    const id = typeof s?.id === "string" ? s.id : "";
    const t = (textoDe(s) ?? "").trim();
    const motivos = !p.sueltas.includes(id) || vistos.has(id) ? ["id que no se pidió"] : revisarSuelta(t, nombres);
    if (!motivos.length) motivos.push(...copiaEjemplo([t]));
    vistos.add(id);
    if (repetida(sueltas, t)) motivos.push("casi igual a otra del paquete");
    if (!motivos.length) {
      r.sueltas.push(t);
      sueltas.push(t);
    } else r.botadas.push({ id, tipo: "suelta", texto: t, motivos });
  }
  const bromas: string[] = [];
  for (const b of Array.isArray(j.bromas) ? j.bromas : []) {
    const id = typeof b?.id === "string" ? b.id : "";
    const frases = frasesDe(b?.frases);
    const motivos = !p.bromas.includes(id) || vistos.has(id) ? ["id que no se pidió"] : revisarBroma(frases, nombres);
    vistos.add(id);
    if (repetida(bromas, frases.join(" "))) motivos.push("casi igual a otra del paquete");
    if (!motivos.length) {
      r.bromas.push(frases);
      bromas.push(frases.join(" "));
    } else r.botadas.push({ id, tipo: "broma", texto: frases.join(" / "), motivos });
  }
  const mascotas: string[] = [];
  for (const m of Array.isArray(j.mascotas) ? j.mascotas : []) {
    const id = typeof m?.id === "string" ? m.id : "";
    const animal = p.mascotas.get(id);
    const t = (textoDe(m) ?? "").trim();
    const motivos = !animal || vistos.has(id) ? ["id que no se pidió"] : revisarMascota(animal, t, nombres);
    vistos.add(id);
    if (repetida(mascotas, t)) motivos.push("casi igual a otra del paquete");
    if (!motivos.length && animal) {
      r.mascotas.push({ id: animal, texto: t });
      mascotas.push(t);
    } else r.botadas.push({ id, tipo: "mascota", texto: t, motivos });
  }
  return r;
}
