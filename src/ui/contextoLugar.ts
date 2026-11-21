// Dónde se muestra el informe escrito de «Leer contexto» (JST-414). El lector es uno
// por pestaña (`contexto`), pero «Leer contexto» se toca desde cuatro lugares: la
// barra de arriba, la ventana de responder, el modal de tarea y la franja «Te
// necesitan». El informe escrito se ve solo donde se empezó a leer, para que la misma
// tarea no se muestre dos veces cuando dos lugares coinciden (la ventana abierta sobre
// la página de esa tarea, por ejemplo).
//
// Sin React: la parte que se puede probar sola.
import { t } from "../i18n.js";
import { informeDeTarea } from "./botonContexto.js";
import type { NivelInforme } from "./contextoInforme.js";
import type { LectorContexto, Lectura } from "./contextoLector.js";
import { fijarNivel } from "./contextoNivel.js";

export type LugarContexto = "barra" | "ventana" | "modal" | "franja";

interface Donde {
  lugar: LugarContexto | null;
  tarea: string | null;
  /** Ya había un informe escrito a la vista: al recargarlo (otro nivel) no desaparece mientras carga. */
  abierto: boolean;
}

let donde: Donde = { lugar: null, tarea: null, abierto: false };

export const lugarDeLectura = (): LugarContexto | null => donde.lugar;

/** Solo para las pruebas. */
export function olvidarLugar(): void {
  donde = { lugar: null, tarea: null, abierto: false };
}

type Cargar = (tarea: string, nivel: NivelInforme) => Promise<Lectura>;

/** ¿Se ve el informe escrito de `tarea` en ese lugar? Con frases cargadas, o recargándose si ya se veía. */
export function visibleEn(c: Pick<LectorContexto, "tarea" | "frases" | "estado">, lugar: LugarContexto, tarea: string | null): boolean {
  if (!tarea || donde.lugar !== lugar || c.tarea !== tarea) return false;
  return c.frases.length > 0 || (c.estado === "cargando" && donde.abierto);
}

function empezarEn(c: Pick<LectorContexto, "tarea" | "frases">, lugar: LugarContexto, tarea: string): void {
  donde = { lugar, tarea, abierto: donde.lugar === lugar && donde.tarea === tarea && c.tarea === tarea && c.frases.length > 0 };
}

/**
 * El toque de «Leer contexto» en ese lugar: si lee (o carga) esa tarea, detiene; si no, lee el informe de esa tarea y
 * lo deja escrito ahí. Si lo que suena es de otra tarea, un solo toque pasa a leer esta: el botón de una tarea que
 * no se lee dice «Leer», no «Detener». (De la misma tarea desde otro lugar sí detiene: su botón dice «Detener».)
 */
export function tocarEn(c: LectorContexto, lugar: LugarContexto, tarea: string, nivel: NivelInforme, cargar: Cargar = informeDeTarea): void {
  if (c.activo() && c.tarea === tarea) {
    c.detener();
    return;
  }
  empezarEn(c, lugar, tarea);
  // `leer` corta antes lo que suena de otra tarea; `tocar` lo detendría y no leería.
  void c.leer(tarea, () => cargar(tarea, nivel));
}

/** El selector «Corto | Completo» del panel: guarda la elección y vuelve a cargar y leer con ese nivel. */
export function cambiarNivelEn(c: LectorContexto, lugar: LugarContexto, tarea: string, nivel: NivelInforme, cargar: Cargar = informeDeTarea): void {
  fijarNivel(nivel);
  empezarEn(c, lugar, tarea);
  void c.leer(tarea, () => cargar(tarea, nivel));
}

/** Cierra el informe de ese lugar (✕, salir de la página, cerrar la ventana o el modal): calla y suelta lo cargado. */
export function soltarDe(c: LectorContexto, lugar: LugarContexto): void {
  if (donde.lugar !== lugar) return;
  c.soltar();
  donde = { lugar: null, tarea: null, abierto: false };
}

// ---------------------------------------------------------------------------
// Lo que se ve en la cabecera del panel
// ---------------------------------------------------------------------------

/** El código de la tarea («JST-414»); si lo que hay es un id, ninguno. */
export const codigoDeTarea = (ref: string | null): string | null => (ref && /^[A-Za-z]+-\d+$/.test(ref) ? ref.toUpperCase() : null);

/** Lo que dura leerlo, aproximado: «~40 s», «~1 min». */
export function duracionDicha(segundos: number): string {
  if (segundos < 50) return t("~{n} s", { n: Math.max(5, Math.round(segundos / 5) * 5) });
  return t("~{n} min", { n: Math.max(1, Math.round(segundos / 60)) });
}

/** Lo que tarda en leerse un texto suelto (unas 16 letras por segundo, como `segundosDeInforme`). */
export const segundosDeFrases = (frases: readonly string[]): number => Math.round(frases.reduce((n, f) => n + f.length, 0) / 16);
