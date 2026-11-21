// «Leer contexto» con una voz de la lista (0.11.0, JST-325; spike de JST-323 §3):
// en vez de la voz del navegador, lee con la que el usuario eligió en «Voces»
// (Dora al instalar), con el mismo camino del Resumen: el worker hace cada
// frase (`voz-resumen`) y esta pestaña la baja y la toca. El navegador queda
// como último recurso: si el audio de una frase no llega a tiempo, desde ahí lee
// la voz del navegador (`VozResumen`), y si eligió esa, lee solo ella.
//
// Las reglas del worker para el Resumen (`fraseResumenValida`) rechazaban 106 de
// 198 frases de 25 tareas reales: por el código de tarea (97), símbolos (16) y
// largas (3). Aquí se limpian antes de pedirlas: «JST-323» se dice «JST 323» (como
// la del navegador), se quitan símbolos y enlaces y lo largo se corta en comas.
import type { FraseResumen } from "../resumen/frases.js";
import { fraseResumenValida, LETRAS_FRASE_RESUMEN, limpiarParaResumen } from "../resumen/voz.js";
import type { VozContexto } from "./contextoLector.js";
import { vozParaLeer } from "./eleccion.js";
import { VozResumen } from "./resumenVoz.js";

/** Un código de tarea («JST-323»): se dice «JST 323». */
const CODIGO_TAREA = /(?<![\p{L}\p{N}])([A-Z][A-Z0-9]{1,9})-(\d+)(?![\p{L}\p{N}])/gu;
/** A qué velocidad se lee (la de siempre en «Leer contexto»). */
const VELOCIDAD = 1.05;

/** Corta un texto largo en trozos de hasta `max` letras: primero donde hay coma o punto y coma, y si no, en un espacio. */
function cortar(texto: string, max: number): string[] {
  if ([...texto].length <= max) return [texto];
  const trozos: string[] = [];
  let resto = texto;
  while ([...resto].length > max) {
    const cabe = [...resto].slice(0, max).join("");
    const coma = Math.max(cabe.lastIndexOf(", "), cabe.lastIndexOf("; "), cabe.lastIndexOf(": "));
    const espacio = cabe.lastIndexOf(" ");
    const en = coma > max * 0.3 ? coma + 1 : espacio > 0 ? espacio : cabe.length;
    trozos.push(resto.slice(0, en).trim());
    resto = resto.slice(en).trim();
  }
  if (resto) trozos.push(resto);
  return trozos;
}

/**
 * Los trozos que se le piden al worker para decir esta frase: limpios (que pasen
 * `fraseResumenValida`) y de hasta 240 letras. Vacío si no queda nada que decir.
 */
export function trozosParaMotor(frase: string): string[] {
  const limpia = limpiarParaResumen(frase.replace(CODIGO_TAREA, "$1 $2"));
  return cortar(limpia, LETRAS_FRASE_RESUMEN)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && fraseResumenValida(t));
}

export interface DepsVozContexto {
  /** La empresa con que se le habla al worker (el host revisa que el usuario la vea). */
  companyId: () => string | null;
  /** El `<audio>` desbloqueado dentro del toque. */
  audio: () => HTMLAudioElement | null;
  /** La voz del navegador de siempre: si no hay voz elegida (o no hay worker), lee ella. */
  navegador: VozContexto;
}

export class VozContextoElegida implements VozContexto {
  private motor: VozResumen | null = null;
  /** Todos los trozos de esta lectura, en orden, para pedir los que siguen junto con el que suena. */
  private todos: string[] = [];
  private pos = 0;

  constructor(private readonly d: DepsVozContexto) {}

  /** Lo que se lee ahora: la elegida (si el worker puede), o el navegador. Hay voz si sirve cualquiera de las dos. */
  async hayVoz(): Promise<boolean> {
    this.motor?.parar();
    this.motor = null;
    this.todos = [];
    this.pos = 0;
    const companyId = this.d.companyId();
    const audio = this.d.audio();
    const elegida = audio ? await vozParaLeer("contexto", companyId).catch(() => null) : null;
    if (elegida && audio) {
      const id = `c${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      this.motor = new VozResumen({ voz: Promise.resolve(elegida), resumen: id, companyId, audio, alCambiar: () => undefined });
      return true;
    }
    return this.d.navegador.hayVoz();
  }

  /** Pide el audio de las primeras frases y espera el de la primera (el estado queda en «Cargando…»; el motor se abre en 3 a 5 s). */
  async preparar(frases: readonly string[]): Promise<void> {
    if (!this.motor) return;
    this.todos = frases.flatMap(trozosParaMotor);
    this.pos = 0;
    const primero = this.todos[0];
    if (primero) await this.motor.preparar({ texto: primero } as FraseResumen, 10_000);
  }

  decir(frase: string, alTerminar: (cortada: boolean) => void, primera: boolean): () => void {
    const motor = this.motor;
    if (!motor) return this.d.navegador.decir(frase, alTerminar, primera);
    const trozos = trozosParaMotor(frase);
    let cortada = false;
    let hablando: { cortar(): void } | null = null;
    void (async () => {
      for (const t of trozos) {
        if (cortada) return;
        // Al repetir una frase anterior (JST-414) el trozo queda antes de `pos`: se busca desde el principio.
        const desde = this.todos.indexOf(t, this.pos);
        const i = desde >= 0 ? desde : this.todos.indexOf(t);
        const siguen = (i >= 0 ? this.todos.slice(i + 1, i + 3) : trozos.slice(trozos.indexOf(t) + 1, trozos.indexOf(t) + 3)).map((texto) => ({ texto }) as FraseResumen);
        if (i >= 0) this.pos = i + 1;
        const h = motor.decir({ texto: t } as FraseResumen, VELOCIDAD, () => undefined, siguen);
        hablando = h;
        await h.fin;
      }
      if (!cortada) alTerminar(false);
    })();
    return () => {
      cortada = true;
      hablando?.cortar();
    };
  }
}
