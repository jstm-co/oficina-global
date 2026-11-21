// Decorados (JST-416): el «ambiente» de cada sala. Sin React ni DOM.
//
// Un decorado cambia cómo se ve la sala, no cómo está armada: el plano (`plano.ts`) y los caminos de los agentes
// son los mismos para todos. Cada decorado tiene su propia hoja de muebles con EXACTAMENTE la disposición del atlas
// clásico (un solo `muebles.json`) y sus propias baldosas; la pantalla solo elige qué hoja usa cada sala (la clase
// `of-dec-<id>`, `estilosDecorado.ts`). Lo que sí puede cambiar un decorado:
//   · qué pieza se dibuja en el lugar de otra de igual huella (`REEMPLAZOS`), y
//   · piezas que se suman en la pared (`extrasDecorado`).
// Así la sala nunca cambia de tamaño ni pierde asientos, y la vista 3D sigue con el clásico.
import MUEBLES from "./ui/assets/muebles.json" with { type: "json" };
import type { Pieza, SalaPlano } from "./plano.js";

export type DecoradoId = "clasico" | "madera";

/** Lo que se elige para toda la oficina: un decorado, o «repartidos» (a cada empresa le toca uno según su prefijo). */
export type EleccionDecorado = DecoradoId | "repartidos";

export interface InfoDecorado {
  id: DecoradoId;
}

/** Los decorados que hay (el nombre visible lo pone `nombreDecorado` en `menuAmbiente.tsx`, por `t()`). */
export const DECORADOS: readonly InfoDecorado[] = [{ id: "clasico" }, { id: "madera" }];

/** Por omisión nada cambia respecto de antes de JST-416. */
export const DECORADO_POR_OMISION: DecoradoId = "clasico";

export function esDecorado(x: unknown): x is DecoradoId {
  return typeof x === "string" && DECORADOS.some((d) => d.id === x);
}

export function esEleccion(x: unknown): x is EleccionDecorado {
  return x === "repartidos" || esDecorado(x);
}

/** Lo de los ajustes que decide el decorado de cada sala. */
export interface AjustesDecorado {
  decorado: EleccionDecorado;
  /** Un decorado por empresa (prefijo → id); pisa a `decorado`. Los ids que no existen se ignoran. */
  decoradoPorEmpresa: Readonly<Record<string, DecoradoId>>;
}

/** FNV-1a de 32 bits: el mismo prefijo da siempre lo mismo, recargues cuando recargues. */
function hash(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

/**
 * El decorado fijo de una empresa en «Repartidos». Depende solo de su prefijo (no de cuántas empresas hay ni de en
 * qué orden): con las 4 de hoy (BET, ELM, JST, MIG) salen dos y dos. Mirar el bit 5 del hash y no el último porque el
 * último deja a las empresas de nombres parecidos en el mismo decorado.
 */
export function decoradoRepartido(prefijo: string): DecoradoId {
  return DECORADOS[(hash(prefijo) >>> 5) % DECORADOS.length]!.id;
}

/** El decorado de una sala: el de su empresa si lo eligieron, si no el de toda la oficina (o el repartido). */
export function resolverDecorado(a: Partial<AjustesDecorado>, prefijo: string): DecoradoId {
  const propio = a.decoradoPorEmpresa?.[prefijo];
  if (esDecorado(propio)) return propio;
  const global = a.decorado;
  if (global === "repartidos") return decoradoRepartido(prefijo);
  return esDecorado(global) ? global : DECORADO_POR_OMISION;
}

/** El decorado por empresa con la elección de una: «Como la oficina» (`""` o un id que no existe) borra la suya; un decorado la pone. No toca el original. */
export function conEleccionDeEmpresa(porEmpresa: Readonly<Record<string, DecoradoId>>, prefijo: string, valor: string): Record<string, DecoradoId> {
  const otro = { ...porEmpresa };
  if (esDecorado(valor)) otro[prefijo] = valor;
  else delete otro[prefijo];
  return otro;
}

/** Lo guardado como `decoradoPorEmpresa`: solo prefijo → id válido (lo demás se descarta). */
export function limpiarPorEmpresa(x: unknown): Record<string, DecoradoId> {
  const r: Record<string, DecoradoId> = {};
  if (!x || typeof x !== "object" || Array.isArray(x)) return r;
  for (const [pre, id] of Object.entries(x as Record<string, unknown>)) if (esDecorado(id)) r[pre] = id;
  return r;
}

// ---------------------------------------------------------------------------
// Piezas por decorado
// ---------------------------------------------------------------------------

/** Medidas del atlas (el mismo para todos los decorados). */
const PIEZAS: Readonly<Record<string, { w: number; h: number }>> = MUEBLES.piezas;

/** Medida de una pieza del plano: `ventana` no está en el atlas con ese nombre (la pantalla elige la de día o la de noche, que miden igual). */
function medida(nombre: string): { w: number; h: number } | undefined {
  return PIEZAS[nombre === "ventana" ? "ventana-dia" : nombre];
}

interface Reemplazo {
  nombre: string;
}

/**
 * Qué pieza se dibuja en vez de otra (misma altura y a lo más igual de ancha: se centra en la huella de la original,
 * que sigue mandando para chocar y para el rótulo). La Madera pone una lámpara de pie donde iban el dispensador y la
 * planta grande.
 */
const REEMPLAZOS: Readonly<Record<DecoradoId, Readonly<Record<string, Reemplazo>>>> = {
  clasico: {},
  madera: { dispensador: { nombre: "lampara" }, "planta-grande": { nombre: "lampara" } },
};

/** La pieza `nombre` en el lugar de `m`, centrada en su huella y con los pies en el mismo lugar (la que sea de igual altura y a lo más igual de ancha). */
export function ponerPieza(m: Pieza, nombre: string): Pieza {
  const de = PIEZAS[m.nombre];
  const a = PIEZAS[nombre];
  if (!de || !a) return m;
  return { ...m, nombre, x: m.x + Math.floor((de.w - a.w) / 2), y: m.y + de.h - a.h };
}

/** Cómo se dibuja una pieza del plano en ese decorado (la misma, o su reemplazo centrado en su huella). */
export function muebleDecorado(id: DecoradoId, m: Pieza): Pieza {
  const r = REEMPLAZOS[id][m.nombre];
  return r ? ponerPieza(m, r.nombre) : m;
}

/** La chimenea de la Madera: 28 × 22, contra el muro, con su pie en la línea donde empieza el piso. */
const CHIMENEA = "chimenea";

/**
 * Piezas que un decorado suma a la sala además de las del plano. La Madera cuelga una chimenea en el muro del
 * descanso, lo más cerca que se pueda de encima del sofá sin tapar ni quedar tapada por la ventana, la pizarra, el
 * cuadro, el reloj, el estante ni la cafetera; si no hay dónde (una sala angosta), no va.
 */
export function extrasDecorado(id: DecoradoId, sala: Pick<SalaPlano, "muebles" | "descanso">): Pieza[] {
  if (id !== "madera") return [];
  const c = PIEZAS[CHIMENEA];
  if (!c) return [];
  const sofa = sala.muebles.find((m) => m.nombre === "sofa" || m.nombre === "sofa-calido");
  const centro = sofa ? sofa.x + 17 : sala.descanso.x + sala.descanso.w / 2;
  const ocupadas = sala.muebles.flatMap((m) => {
    const p = medida(m.nombre);
    if (!p || m.y >= c.h || m.nombre.startsWith("alfombra")) return [];
    return [{ x: m.x, w: p.w }];
  });
  const libre = (x: number) => ocupadas.every((o) => x + c.w + 1 <= o.x || x >= o.x + o.w + 1);
  let mejor: number | null = null;
  const desde = sala.descanso.x + 1;
  const hasta = sala.descanso.x + sala.descanso.w - c.w - 1;
  for (let x = desde; x <= hasta; x++) {
    if (!libre(x)) continue;
    if (mejor === null || Math.abs(x + c.w / 2 - centro) < Math.abs(mejor + c.w / 2 - centro)) mejor = x;
  }
  if (mejor === null) return [];
  return [{ nombre: CHIMENEA, x: mejor, y: 0, z: 2 }];
}
