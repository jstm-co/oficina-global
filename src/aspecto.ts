// Qué personaje de `personajes.png` le toca a cada agente (design-spec de
// JST-65, §4). Sin React ni red.
//
// 1. Los agentes de la instancia tienen su aspecto fijo (mapa por ID en
//    `instancia.json`, ver `datosInstancia.ts`; gana a la regla).
// 2. Si no está en el mapa: adaptador Hermes → nombre o cargo → rol de Paperclip
//    → ingeniería. La variante (`-1`, `-2`…) sale de un hash del ID, así que es
//    la misma en cada recarga.
import { instancia } from "./datosInstancia.js";

/** Variantes que hay en la hoja de sprites por rol. Si se dibuja una nueva, se suma aquí. */
export const VARIANTES: Record<string, number> = {
  direccion: 4,
  ingenieria: 5,
  diseno: 3,
  qa: 3,
  revisor: 3,
  docs: 1,
  marketing: 1,
  contenido: 1,
  specs: 1,
  hermes: 1,
};

/** Hash estable de un texto (el mismo del prototipo): desfase de animaciones y variante del aspecto. */
export function hash(texto: string): number {
  let h = 0;
  for (const c of texto) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

export interface DatosAspecto {
  id: string;
  nombre: string;
  /** Cargo (`title`). */
  cargo: string | null;
  /** Rol de Paperclip (`ceo`, `engineer`…). */
  rolApi: string | null;
  adapterType: string;
}

/** Rol de la hoja de sprites según §4 (pasos 1 a 4). */
export function rolDeSprite(agente: DatosAspecto): string {
  if (agente.adapterType === "hermes_gateway") return "hermes";
  const texto = `${agente.nombre} ${agente.cargo ?? ""}`;
  if (/Revisor/.test(texto)) return "revisor";
  if (/QA|Qa/.test(texto)) return "qa";
  if (/Diseñ|Disen/.test(texto)) return "diseno";
  if (/Document/.test(texto)) return "docs";
  if (/Contenido/.test(texto)) return "contenido";
  if (/CMO|Marketing/.test(texto)) return "marketing";
  if (/Speckit|Spec/.test(texto)) return "specs";
  if (/Chief of staff/.test(texto)) return "direccion";
  switch (agente.rolApi) {
    case "ceo":
      return "direccion";
    case "engineer":
      return "ingenieria";
    case "designer":
      return "diseno";
    case "qa":
      return "qa";
    default:
      return "ingenieria";
  }
}

/** ¿Existe esta fila en la hoja de sprites (`direccion-3`)? Un aspecto fijo de la instancia que no existe se ignora. */
export function aspectoExiste(aspecto: string): boolean {
  const m = /^(.+)-([1-9]\d*)$/.exec(aspecto);
  return !!m && Object.hasOwn(VARIANTES, m[1]!) && Number(m[2]) <= VARIANTES[m[1]!]!;
}

/** Fila de `personajes.png` (`direccion-3`, `hermes-1`…) para un agente. */
export function aspectoDe(agente: DatosAspecto): string {
  const fijos = instancia().aspectoFijo;
  const fijo = Object.hasOwn(fijos, agente.id) ? fijos[agente.id] : undefined;
  if (fijo && aspectoExiste(fijo)) return fijo;
  const rol = rolDeSprite(agente);
  if (rol === "direccion" && /Chief of staff/.test(`${agente.nombre} ${agente.cargo ?? ""}`)) return "direccion-3";
  const variantes = VARIANTES[rol] ?? 1;
  return `${rol}-${(hash(agente.id) % variantes) + 1}`;
}
