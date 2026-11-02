// Lo que la voz lee de la oficina (0.6.0, design-spec de JST-225 §4, con el
// método del `spike` de JST-224), sin React, navegador ni Node: lo usan la
// página (para pedir y tocar los audios) y el worker (que los hace).
//
// - La página manda lo que dice cada globo (la frase, la tarea, a quién se le
//   entrega, la hora) y el worker arma el texto con estas mismas funciones: el
//   nombre del audio (`archivoVivo`) sale de la voz y el texto, igual en los dos.
// - El worker solo acepta lo que el plugin pudo haber armado (punto 8 del
//   spike): las frases fijas y las plantillas de `charlas.ts`, las sueltas, lo
//   que dicen las mascotas, la entrega («QA, te paso …», «¡Dale!», «Para QA: …»)
//   y la hora, con los nombres acotados y la tarea pasada por `tareaParaVoz`
//   (desde la 0.8.0, JST-241, cortada en un límite natural, con los topes de
//   siempre: 8 palabras y 60 letras, `TOPES_OFICINA`).
// - Lo que solo son símbolos («☕», «♪ ♫», «♥») no se lee, y «🤝», «→» y «*»
//   tampoco: se dicen como palabras o se sacan.
// - La barra tampoco (JST-239): el globo dice «¿En qué anda Ingeniero/a?» y la
//   voz «¿En qué anda Ingeniero?» (`sinBarras`), sin «barra a».
// - También lo que escribe la IA: finales, sueltas, bromas y mascotas pasan la
//   revisión sin datos. Una apertura lleva su plantilla y los datos de sus huecos;
//   el worker la rellena y exige que coincida con el globo antes de aceptarla.
//   Va marcada (`ia`) para que el worker le ponga un tope por minuto.
import { sinBarras, tareaParaVoz, TOPES_OFICINA } from "./paraVoz.js";
import { DICEN, fraseDeCharla, fraseSuelta, NOMBRE_EN_FRASE, rellenarHuecos, SUELTAS_CON_DATO, type AperturaRellena, type IdMascota, type Linea } from "./charlas.js";
import { fraseIaParaVoz, revisarPlantillaApertura } from "./ia/revision.js";
import type { Motor } from "./voces.js";

/** Los 5 tipos del panel, por la clase de cada frase («dale» y «sobre» son de «Entregas»). */
export type ClaseOficina = "charla" | "suelta" | "mascota" | "entrega" | "dale" | "sobre" | "hora";

/** El día de la hora estimada: hoy (`null`), mañana o el día de la semana. */
export const DIAS_VOZ = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;

export interface HoraVoz {
  h: number;
  m: number;
  /** `null`: hoy. */
  dia: "mañana" | (typeof DIAS_VOZ)[number] | null;
}

/** Lo que la página le pide al worker para una frase de la oficina. */
export interface PedidoOficina {
  clase: ClaseOficina;
  /** Quien lo dice (una mascota no tiene: va `mascota`). */
  agenteId: string | null;
  mascota?: IdMascota | null;
  /** Lo que dice el globo (conversación, frase suelta o mascota), tal cual. */
  texto?: string | null;
  /** El nombre de la tarea, entero, si la frase la lleva y se dice (la primera vez en la conversación). */
  tarea?: string | null;
  /** A quién se le entrega la tarea (su nombre corto, el del globo). */
  para?: string | null;
  hora?: HoraVoz | null;
  /** Apertura generada: el worker vuelve a rellenarla y compara antes de aceptar datos reales. */
  apertura?: AperturaRellena;
  /** 0.7.0: la frase la escribió la IA de Chrome (la pone el worker al validar; lo que mande la página no cuenta). */
  ia?: boolean;
}

/** Sin símbolos que no se leen: «¡Miau! ♥» → «¡Miau!», «*snif, snif*» → «snif, snif». */
export function paraLeer(texto: string): string {
  return texto
    .replace(/[☕♪♫♥🤝→*]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Sin la barra, que el motor lee «barra» o se come (JST-239): «Ingeniero/a» →
 * «Ingeniero» (y «Coordinador/a», «Diseñador/a», «Jefes/as»…), y entre dos
 * letras va un espacio: «UX/UI» → «UX UI». Los números («24/7») y «// algún
 * día» quedan igual. Desde la 0.8.0 vive en `paraVoz.ts` (también lo usa el nombre de la tarea).
 */
export { sinBarras };

/** Tiene algo que decir (al menos una palabra de 2 letras). */
export function conLetras(texto: string): boolean {
  return /\p{L}{2,}/u.test(texto);
}

const may = (t: string) => `${t.charAt(0).toUpperCase()}${t.slice(1)}`;

/**
 * La frase con el nombre de la tarea, sin el código (§4): «Acabo de terminar
 * esta.» → «Acabo de terminar esta: Re-QA de la Oficina global.»; una pregunta
 * va seguida: «¿Por esta? Instalar la Oficina global en la real.». Sin nombre
 * (o si de él no queda nada que decir), la frase sola.
 */
export function conTarea(texto: string, tarea: string | null | undefined): string {
  const t = tareaParaVoz(tarea, TOPES_OFICINA);
  if (!t) return texto;
  if (/[?!]$/.test(texto)) return `${texto} ${may(t)}.`;
  return `${texto.replace(/[.…]+$/u, "")}: ${t}.`;
}

/** «a las 15:40», «a la 1:05». */
function aLas(h: number, m: number): string {
  return `${h === 1 ? "a la" : "a las"} ${h}:${String(m).padStart(2, "0")}`;
}

/** La hora estimada en voz (§4): «Termino como a las 15:40.», «Termino mañana, como a las 9:10.», «Termino el viernes, como a las 9:10.». */
export function textoHora(h: HoraVoz): string {
  if (!h.dia) return `Termino como ${aLas(h.h, h.m)}.`;
  return `Termino ${h.dia === "mañana" ? "mañana" : `el ${h.dia}`}, como ${aLas(h.h, h.m)}.`;
}

/** La hora de `fin` para decirla (en la hora local de este navegador, como la del globo). */
export function horaParaVoz(fin: number, ahora: number): HoraVoz {
  const f = new Date(fin);
  const dia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dias = Math.round((dia(f) - dia(new Date(ahora))) / 86_400_000);
  return { h: f.getHours(), m: f.getMinutes(), dia: dias <= 0 ? null : dias === 1 ? "mañana" : DIAS_VOZ[f.getDay()]! };
}

/** Las frases de una conversación como pedidos: la tarea se dice la primera vez que sale en la conversación (§4). */
export function pedidosDeCharla(lineas: readonly Linea[]): PedidoOficina[] {
  const dichas = new Set<string>();
  return lineas.map((l) => {
    const primera = !!l.codigo && !dichas.has(l.codigo);
    if (l.codigo) dichas.add(l.codigo);
    return { clase: "charla", agenteId: l.quien, texto: l.texto, tarea: primera ? l.titulo : null, ...(l.aperturaIa ? { apertura: l.aperturaIa } : {}) };
  });
}

/**
 * El texto que se genera y se toca, o `null` si no hay nada que decir. El mismo
 * en la página y en el worker, y sin barras (JST-239): el worker valida lo que
 * dice el globo, con su «/a», y el audio sale de este texto.
 */
export function textoOficina(p: PedidoOficina): string | null {
  const t = textoDelGlobo(p);
  return t === null ? null : sinBarras(t);
}

function textoDelGlobo(p: PedidoOficina): string | null {
  switch (p.clase) {
    case "charla":
    case "suelta":
      return p.texto ? conTarea(p.texto, p.tarea) : null;
    case "mascota": {
      const t = p.texto ? paraLeer(p.texto) : "";
      return conLetras(t) ? t : null;
    }
    case "entrega": {
      const t = tareaParaVoz(p.tarea, TOPES_OFICINA);
      return p.para ? `${p.para}, te paso ${t || "una tarea"}.` : null;
    }
    case "dale":
      return "¡Dale!";
    case "sobre": {
      const t = tareaParaVoz(p.tarea, TOPES_OFICINA);
      return p.para ? (t ? `Para ${p.para}: ${t}.` : `Una tarea para ${p.para}.`) : null;
    }
    case "hora":
      return p.hora ? textoHora(p.hora) : null;
  }
}

/**
 * La voz de cada mascota (§4: «con una voz aguda propia»): una de Edge, más
 * aguda y a su ritmo. Edge le manda a Microsoft solo lo que dice la mascota.
 */
export const VOCES_MASCOTA: Readonly<Record<IdMascota, { id: string; motor: Motor; clave: string; pitch: string; rate: string }>> = {
  gato: { id: "mascota-gato", motor: "edge", clave: "es-CL-CatalinaNeural", pitch: "+45Hz", rate: "+10%" },
  perro: { id: "mascota-perro", motor: "edge", clave: "es-CL-LorenzoNeural", pitch: "+35Hz", rate: "+15%" },
  conejo: { id: "mascota-conejo", motor: "edge", clave: "es-CL-CatalinaNeural", pitch: "+80Hz", rate: "+20%" },
  robot: { id: "mascota-robot", motor: "edge", clave: "es-CL-LorenzoNeural", pitch: "+25Hz", rate: "-5%" },
};

const MASCOTAS: ReadonlySet<string> = new Set(Object.keys(DICEN));
const NOMBRE = new RegExp(`^${NOMBRE_EN_FRASE}$`, "u");
const sinControl = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v);
const id = (v: unknown): v is string => sinControl(v, 80);
const CLASES: ReadonlySet<string> = new Set(["charla", "suelta", "mascota", "entrega", "dale", "sobre", "hora"]);
const DIAS: ReadonlySet<string> = new Set(["mañana", ...DIAS_VOZ]);

/**
 * Un pedido que el plugin pudo haber armado, o `null` (punto 8 del spike): la
 * frase tiene que ser una de `charlas.ts` (fija o de plantilla), una suelta o
 * lo que dice esa mascota; el nombre de quien recibe, uno acotado; la tarea,
 * un texto sin caracteres de control (se corta con `tareaParaVoz`); la hora,
 * números de verdad.
 */
export function validarPedidoOficina(x: unknown): PedidoOficina | null {
  const p = x as Partial<PedidoOficina> | null;
  if (!p || typeof p !== "object" || !CLASES.has(p.clase as string)) return null;
  const clase = p.clase!;
  const tarea = p.tarea === undefined || p.tarea === null ? null : sinControl(p.tarea, 400) ? p.tarea : undefined;
  if (tarea === undefined) return null;
  if (clase === "mascota") {
    if (!MASCOTAS.has(p.mascota as string) || typeof p.texto !== "string") return null;
    if (DICEN[p.mascota!].includes(p.texto)) return { clase, agenteId: null, mascota: p.mascota!, texto: p.texto };
    if (Object.values(DICEN).some((frases) => frases.includes(p.texto!))) return null;
    return fraseIaParaVoz(p.texto) ? { clase, agenteId: null, mascota: p.mascota!, texto: p.texto, ia: true } : null;
  }
  if (!id(p.agenteId)) return null;
  const agenteId = p.agenteId;
  switch (clase) {
    case "charla": {
      if (typeof p.texto !== "string") return null;
      if (fraseDeCharla(p.texto)) return { clase, agenteId, texto: p.texto, tarea };
      const a = p.apertura;
      if (a && sinControl(a.plantilla, 100) && a.datos && typeof a.datos === "object") {
        const datos: Record<string, string> = {};
        for (const [k, v] of Object.entries(a.datos)) {
          if (!/^[a-z]+$/.test(k) || !sinControl(v, 100)) return null;
          datos[k] = v;
        }
        if (rellenarHuecos(a.plantilla, datos) === p.texto && revisarPlantillaApertura(a.plantilla).length === 0) {
          return { clase, agenteId, texto: p.texto, tarea, apertura: { plantilla: a.plantilla, datos }, ia: true };
        }
      }
      // El final que escribió la IA no lleva tarea (la tarea va en las frases fijas).
      return fraseIaParaVoz(p.texto) ? { clase, agenteId, texto: p.texto, tarea: null, ia: true } : null;
    }
    case "suelta":
      if (typeof p.texto !== "string" || !conLetras(p.texto)) return null;
      if (fraseSuelta(p.texto)) return { clase, agenteId, texto: p.texto, tarea: SUELTAS_CON_DATO.includes(p.texto) ? tarea : null };
      return fraseIaParaVoz(p.texto) ? { clase, agenteId, texto: p.texto, tarea: null, ia: true } : null;
    case "entrega":
    case "sobre":
      return typeof p.para === "string" && NOMBRE.test(p.para) ? { clase, agenteId, para: p.para, tarea } : null;
    case "dale":
      return { clase, agenteId };
    case "hora": {
      const h = p.hora;
      if (!h || !Number.isInteger(h.h) || !Number.isInteger(h.m) || h.h < 0 || h.h > 23 || h.m < 0 || h.m > 59) return null;
      if (h.dia !== null && !DIAS.has(h.dia as string)) return null;
      return { clase, agenteId, hora: { h: h.h, m: h.m, dia: h.dia } };
    }
  }
  return null;
}
