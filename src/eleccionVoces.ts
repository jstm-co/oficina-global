// Elegir las voces de la Oficina (0.11.0, JST-325; design-spec de JST-324, A ·
// Todo en «Voces»; números del spike JST-323). Sin React, navegador ni Node: lo
// usan el worker (que guarda la elección y graba las frases) y la página (que
// la muestra y la usa para leer).
//
// Qué se elige:
// - la voz del **Resumen** (también dice los avisos juntos, «3 agentes te necesitan»);
// - la de **«Leer contexto»** (una voz o «Igual que el Resumen»);
// - la de **cada agente** (las 9). Esa vive en `indice.json`, junto a sus audios.
//
// El Resumen y «Leer contexto» leen al momento, así que solo pueden usar una
// voz rápida (Edge o Kokoro) o la del navegador: un clon tarda 14 a 28 s por la
// primera frase (spike JST-323). Dónde queda lo elegido: `voces/eleccion.json`,
// en el servidor, para que el celular, el computador y el TV suenen igual.
//
// 0.13.0 (issue #9): las 10 de Supertonic también leen al momento (~0,6 s por
// frase). Y se elige con qué motores se graban las voces desde la oficina
// («Preparar voces»): Supertonic (lo que viene listo), Kokoro, Edge y los clones.
import { FRASES } from "./avisos.js";
import { VOCES, vozPorId, type Motor, type Voz, type VozId } from "./voces.js";

/** Las que alcanzan a leer al momento. */
export const VOCES_AL_MOMENTO: readonly VozId[] = ["lorenzo", "catalina", "alex", "dora", "santa", ...VOCES.filter((v) => v.motor === "supertonic").map((v) => v.id)];

/** 0.13.0: los motores como se eligen en «Preparar voces» (Qwen3 y Chatterbox van juntos, como «los clones»). */
export type GrupoMotor = "supertonic" | "kokoro" | "edge" | "clones";
export const GRUPOS_MOTOR: readonly GrupoMotor[] = ["supertonic", "kokoro", "edge", "clones"];

export function grupoDe(m: Motor): GrupoMotor {
  return m === "qwen3" || m === "chatterbox" ? "clones" : m;
}

/** Las voces de esos motores, en el orden de siempre. */
export function vocesDe(grupos: readonly GrupoMotor[]): readonly Voz[] {
  return VOCES.filter((v) => grupos.includes(grupoDe(v.motor)));
}

/** Quién lee el Resumen o «Leer contexto»: una voz de la lista o la del navegador. */
export type VozLectura = VozId | "navegador";

/** Lo que el usuario dejó elegido para leer al momento, y lo que tenía cada agente antes de que lo cambiara. */
export interface EleccionVoces {
  version: 1;
  resumen: VozLectura;
  /** `"igual"`: la misma del Resumen. */
  contexto: VozLectura | "igual";
  /** El agente → la voz con que estaba, con lo que hace falta para volver a grabar sus frases. */
  originales: Record<string, { voz: VozId; corto: string; empresa: string }>;
  /** Los agentes a los que se les está grabando otra voz (si se apaga el worker, sigue al volver a abrir). */
  pendientes: Record<string, { voz: VozId; corto: string; empresa: string }>;
  /** 0.13.0: con qué motores se graban las voces desde la oficina; `null` si todavía no se eligió (se preparan con `npm run voces`). */
  motores: GrupoMotor[] | null;
  /** 0.13.0: se prepararon desde la oficina, y las de los agentes nuevos (o con otro nombre) se graban solas. */
  alDia: boolean;
}

/** Lo que queda al instalar (la elección del usuario en JST-324): Alex lee el Resumen y Dora, «Leer contexto». */
export const RESUMEN_INICIAL: VozId = "alex";
export const CONTEXTO_INICIAL: VozId = "dora";
/** 0.13.0: con Supertonic y sin Kokoro, lo leen M1 y F1. */
export const RESUMEN_SUPERTONIC: VozId = "supertonic-m1";
export const CONTEXTO_SUPERTONIC: VozId = "supertonic-f1";

/** Quién lee el Resumen y «Leer contexto» al instalar, según los motores elegidos (sin elegir, Alex y Dora, como hasta la 0.12). */
export function inicialesPara(motores: readonly GrupoMotor[] | null): { resumen: VozId; contexto: VozId } {
  if (motores && !motores.includes("kokoro") && motores.includes("supertonic")) return { resumen: RESUMEN_SUPERTONIC, contexto: CONTEXTO_SUPERTONIC };
  return { resumen: RESUMEN_INICIAL, contexto: CONTEXTO_INICIAL };
}

export function eleccionInicial(): EleccionVoces {
  return { version: 1, resumen: RESUMEN_INICIAL, contexto: CONTEXTO_INICIAL, originales: {}, pendientes: {}, motores: null, alDia: false };
}

/** Los motores elegidos con la forma esperada (sin repetir, en el orden de siempre), o `null`. */
export function leerMotores(x: unknown): GrupoMotor[] | null {
  if (!Array.isArray(x)) return null;
  const lista = GRUPOS_MOTOR.filter((g) => x.includes(g));
  return lista.length > 0 ? lista : null;
}

/** La voz es una de las que leen al momento. */
export function esAlMomento(x: unknown): x is VozId {
  return typeof x === "string" && (VOCES_AL_MOMENTO as readonly string[]).includes(x);
}

export function esVozLectura(x: unknown): x is VozLectura {
  return x === "navegador" || esAlMomento(x);
}

const texto = (v: unknown, max: number) => typeof v === "string" && v.length > 0 && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v);

/** Lo leído de `eleccion.json`, o la inicial si falta o no tiene la forma (cada campo malo vuelve a lo de siempre). */
export function leerEleccion(datos: unknown): EleccionVoces {
  const d = (datos && typeof datos === "object" ? datos : {}) as Partial<Record<keyof EleccionVoces, unknown>>;
  const e = eleccionInicial();
  if (esVozLectura(d.resumen)) e.resumen = d.resumen;
  if (d.contexto === "igual" || esVozLectura(d.contexto)) e.contexto = d.contexto as EleccionVoces["contexto"];
  for (const campo of ["originales", "pendientes"] as const) {
    const lista = d[campo];
    if (!lista || typeof lista !== "object") continue;
    for (const [id, o] of Object.entries(lista as Record<string, unknown>)) {
      const x = o as { voz?: unknown; corto?: unknown; empresa?: unknown } | null;
      if (texto(id, 80) && x && vozPorId(x.voz) && texto(x.corto, 200) && texto(x.empresa, 200)) e[campo][id] = { voz: x.voz as VozId, corto: x.corto as string, empresa: x.empresa as string };
    }
  }
  e.motores = leerMotores(d.motores);
  e.alDia = d.alDia === true && e.motores !== null;
  return e;
}

/** Quién lee «Leer contexto» (si es «igual», el del Resumen). */
export function vozDeContexto(e: EleccionVoces): VozLectura {
  return e.contexto === "igual" ? e.resumen : e.contexto;
}

/** Cambió algo respecto de lo que queda al instalar o de lo que tenía algún agente: aparece «Volver a como estaba». */
export function hayCambios(e: EleccionVoces, agentes: Readonly<Record<string, VozId>> | null): boolean {
  const inicial = inicialesPara(e.motores);
  if (e.resumen !== inicial.resumen || e.contexto !== inicial.contexto) return true;
  if (Object.keys(e.pendientes).length > 0) return true;
  return Object.entries(e.originales).some(([id, o]) => (agentes?.[id] ?? o.voz) !== o.voz);
}

/** El número de la página donde el usuario comparó las voces (JST-324): «Alex #20». Las de Supertonic (0.13.0) no estaban. */
export const NUMERO_VOZ: Readonly<Partial<Record<VozId, number>>> = {
  lorenzo: 1,
  catalina: 2,
  alex: 20,
  dora: 21,
  santa: 22,
  "chatterbox-hombre": 42,
  "chatterbox-mujer": 43,
  "qwen3-hombre": 44,
  "qwen3-mujer": 45,
};

/** Cómo se llama una voz en el selector: los clones son «Clon #42». */
export function nombreEnLista(id: VozId): string {
  const v = vozPorId(id);
  return !v ? id : esAlMomento(id) ? v.nombre : `Clon #${NUMERO_VOZ[id]}`;
}

/** Por qué un clon no sirve para leer al momento (el panel lo dice bajo su nombre). */
export function porqueNoAlcanza(id: VozId): string | null {
  const v = vozPorId(id);
  if (!v || esAlMomento(id)) return null;
  return v.motor === "qwen3" ? "Tarda 13 a 25 s por frase; para leer al momento, menos de 4 s" : "Tarda 14 a 30 s por frase; para leer al momento, menos de 4 s";
}

/** Cuánto tarda en grabarse un agente con esa voz (20 frases), para decírselo al usuario antes de elegir. */
export function tardaGrabar(id: VozId): string {
  const v = vozPorId(id);
  if (!v) return "";
  return v.motor === "chatterbox" || v.motor === "qwen3" ? "~10 min" : v.motor === "supertonic" ? "~15 s" : "~1 min";
}

/**
 * Los «3 agentes te necesitan.» para cualquier número de agentes (de 2 a
 * `agentes`): 4 frases × hasta 26 agentes son 100 textos. Los pide el worker
 * cuando cambia la voz del Resumen (no todos de una vez al leer).
 */
export function textosAvisosJuntos(agentes: number): string[] {
  const lista: string[] = [];
  for (const f of ["toca", "error", "fin", "emp"] as const) for (let n = 2; n <= Math.max(2, agentes); n++) lista.push(`${FRASES[f].resumen(n)}.`);
  return lista;
}

/** 0.11.0: lo que se está grabando al cambiar una voz (lo que muestra «Grabando 12 de 20 · sigue con Alex»). */
export interface GrabandoVoz {
  quien: "agente" | "resumen";
  agenteId: string | null;
  voz: VozId;
  /** La voz con que sigue hablando mientras tanto. */
  sigueCon: VozId | null;
  hechas: number;
  total: number;
  /** Espera su turno: se graba de a un grupo. */
  enCola: boolean;
  /** Un clon que espera a que la Mac esté libre. */
  esperaMac: boolean;
  /** No se pudo grabar (3 intentos): sigue con la de antes. */
  error: boolean;
}

