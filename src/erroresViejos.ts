// Errores viejos (JST-410), sin React: un error de hace más de un día, o uno que
// el usuario silenció, deja de mantener rojo el contador «con error» y la lista
// lo baja a «Errores antiguos». Silenciar vale solo para ese error: se guarda
// con el `desde` del error silenciado, y si el agente entra en uno nuevo
// (otro `desde`) vuelve a alarmar.
import type { AgenteVista } from "./vista.js";

/** Desde cuándo un error cuenta como antiguo: más de 24 horas. */
export const UMBRAL_ERROR_VIEJO_MS = 24 * 60 * 60 * 1000;

/** Por agente, el `desde` del error silenciado («» si el error no traía fecha). */
export type Silenciados = Readonly<Record<string, string>>;

export const SIN_SILENCIADOS: Silenciados = Object.freeze({});

type DeError = Pick<AgenteVista, "id" | "st" | "desde">;

/** El error empezó hace más de 24 horas. Sin fecha legible no se sabe, y no cuenta como viejo. */
export function errorAntiguo(a: DeError, ahora: number): boolean {
  if (a.st !== "error" || !a.desde) return false;
  const t = Date.parse(a.desde);
  return !Number.isNaN(t) && ahora - t > UMBRAL_ERROR_VIEJO_MS;
}

/** El usuario silenció ESTE error: el agente sigue con el mismo `desde`. */
export function estaSilenciado(a: DeError, silenciados: Silenciados): boolean {
  return a.st === "error" && Object.hasOwn(silenciados, a.id) && silenciados[a.id] === (a.desde ?? "");
}

/** Error viejo: con error y (de hace más de un día o silenciado). */
export function esErrorViejo(a: DeError, ahora: number, silenciados: Silenciados = SIN_SILENCIADOS): boolean {
  return a.st === "error" && (errorAntiguo(a, ahora) || estaSilenciado(a, silenciados));
}

/** Silencia el error actual del agente. Sin cambios si no tiene error. */
export function silenciar(silenciados: Silenciados, a: DeError): Silenciados {
  if (a.st !== "error") return silenciados;
  return { ...silenciados, [a.id]: a.desde ?? "" };
}

/** Vuelve a avisar de ese agente. */
export function reactivar(silenciados: Silenciados, agenteId: string): Silenciados {
  if (!Object.hasOwn(silenciados, agenteId)) return silenciados;
  const { [agenteId]: _quitado, ...resto } = silenciados;
  return resto;
}

/**
 * Quita las entradas que ya no aplican: el agente está en la lista y ya no tiene
 * ese error (se arregló, o entró en otro). Los agentes que no aparecen (una
 * empresa que no respondió, un filtro) se dejan, para no perder lo silenciado
 * por una lectura incompleta.
 */
export function limpiarSilenciados(silenciados: Silenciados, agentes: readonly DeError[]): Silenciados {
  const porId = new Map(agentes.map((a) => [a.id, a]));
  let cambio = false;
  const salida: Record<string, string> = {};
  for (const [id, desde] of Object.entries(silenciados)) {
    const a = porId.get(id);
    if (a && !(a.st === "error" && (a.desde ?? "") === desde)) {
      cambio = true;
      continue;
    }
    salida[id] = desde;
  }
  return cambio ? salida : silenciados;
}

/** Lo guardado, tolerante: JSON inválido o de otra forma → nada silenciado; los valores que no son texto se descartan. */
export function leerSilenciados(texto: string | null | undefined): Silenciados {
  if (!texto) return SIN_SILENCIADOS;
  let v: unknown;
  try {
    v = JSON.parse(texto);
  } catch {
    return SIN_SILENCIADOS;
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return SIN_SILENCIADOS;
  const salida: Record<string, string> = {};
  for (const [id, desde] of Object.entries(v)) if (typeof desde === "string") salida[id] = desde;
  return salida;
}

export function escribirSilenciados(silenciados: Silenciados): string {
  return JSON.stringify(silenciados);
}

// Quién da los silenciados cuando quien llama no los pasa (`contarVista`, `grupoDe`…):
// el almacén del navegador se registra aquí al cargarse; sin él (pruebas, worker), ninguno.
let proveedor: () => Silenciados = () => SIN_SILENCIADOS;
export function fijarProveedorSilenciados(f: (() => Silenciados) | null): void {
  proveedor = f ?? (() => SIN_SILENCIADOS);
}
export function silenciadosPorOmision(): Silenciados {
  return proveedor();
}
