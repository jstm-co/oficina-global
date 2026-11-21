// La lectura de «Leer contexto» (JST-276, design-spec de JST-282 §5 a §7): los
// estados del botón de la barra de arriba, las frases de a una (para saber cuál
// va, «2/5») y lo escrito cuando el navegador no tiene voz en español. Sin React
// ni navegador: la voz y los relojes llegan de afuera (las pruebas los simulan).
//
// - Listo → Cargando (al tiro, al tocar) → Leyendo → Terminó (2,5 s) → Listo.
// - Si falla la carga: No se pudo (4 s) → Listo.
// - Tocar en Cargando o Leyendo lo detiene; en Terminó o No se pudo, lee otra vez.
// - Una voz a la vez (§7): antes de leer se pausa el Resumen (`antesDeLeer`); si
//   otra voz corta la frase que suena, la lectura se detiene (no salta a la siguiente).

import type { Informe } from "./contextoInforme.js";

export type EstadoContexto = "listo" | "cargando" | "leyendo" | "fin" | "error";

/** Lo que se lee: un texto (se parte en frases) o el informe ya armado con sus frases (JST-414). */
export type Lectura = string | { frases: string[]; informe?: Informe | null };

/** Lo que dura «Terminó» y «No se pudo» antes de volver a «Listo» (§5). */
export const FIN_MS = 2_500;
export const ERROR_MS = 4_000;
/** Sin voz, cada frase queda marcada lo que tardaría en leerse: unas 16 letras por segundo, mínimo 1,8 s (§5). */
export const LETRAS_POR_SEGUNDO = 16;
export const MIN_FRASE_MS = 1_800;

export function msEscrita(frase: string): number {
  return Math.max(MIN_FRASE_MS, Math.round((frase.length * 1000) / LETRAS_POR_SEGUNDO));
}

const ABREVIATURA_CORTA = /(?<=[.!?…])(?<!(?<![\p{L}\p{N}])(?:Sr|Sra|Dr|Dra|Ud|Uds|etc|aprox|núm|pág|EE|UU|p\. ej)\.)\s+(?=[¿¡«"(\p{Lu}\p{N}])/u;

/**
 * Las frases del texto, para decirlas de a una (§5). Corta tras «.», «!», «?» o
 * «…» seguidos de un espacio y de una mayúscula, un número, «¿» o «¡». No corta
 * tras el número de una lista («1. Abrir…») ni tras una abreviatura («Sr.», «Dra.»,
 * «etc.», «EE. UU.», «p. ej.», «aprox.», «núm.», «pág.»).
 */
export function frasesDe(texto: string): string[] {
  const trozos = texto
    .replace(/\s+/g, " ")
    .trim()
    .split(ABREVIATURA_CORTA);
  const frases: string[] = [];
  for (const t of trozos) {
    const antes = frases.at(-1);
    if (antes !== undefined && /(?:^|\s)\d{1,2}\.$/.test(antes)) frases[frases.length - 1] = `${antes} ${t}`;
    else if (t) frases.push(t);
  }
  return frases;
}

export interface VozContexto {
  /** Si hay voz en español (puede esperar un poco a que el navegador cargue sus voces). */
  hayVoz(): Promise<boolean>;
  /**
   * Dice la frase. `alTerminar(cortada)`: `cortada` si otra voz la cortó (no llama
   * si la cortó la función que devuelve). `primera`: la primera frase de la lectura.
   */
  decir(frase: string, alTerminar: (cortada: boolean) => void, primera: boolean): () => void;
  /**
   * 0.11.0 (JST-325): con una voz de la lista, pide el audio de las primeras frases y espera el de la primera mientras
   * el estado sigue en «Cargando…» (el motor tarda 3 a 5 s en abrirse). La del navegador no lo necesita.
   */
  preparar?(frases: readonly string[]): Promise<void>;
}

export interface DepsContexto {
  voz: VozContexto;
  programar: (fn: () => void, ms: number) => () => void;
  /** Antes de leer: pausar el Resumen si suena (§7). */
  antesDeLeer?: () => void;
  /** Cambia si está activa (Cargando o Leyendo): el reproductor del Resumen dice «En pausa · lees el contexto». */
  alActivo?: (activo: boolean) => void;
}

export class LectorContexto {
  estado: EstadoContexto = "listo";
  /** La tarea que se lee o se leyó (la de la ruta). */
  tarea: string | null = null;
  frases: string[] = [];
  /** El informe de donde salen las frases (JST-414), para dejarlo escrito por partes; `null` si se leyó un texto suelto. */
  informe: Informe | null = null;
  /** La frase que va (0 a `frases.length - 1`). */
  k = 0;
  /** El navegador no tiene voz en español: lo deja escrito en el panel. */
  sinVoz = false;
  /** Lo que se supo al cargar: sin voz, «leer de nuevo» y saltar de frase siguen sin llamar a la voz (JST-414). */
  private sinVozAlCargar = false;
  /** Sube con cada cambio (para React). */
  version = 0;
  private lectura = 0;
  private reloj: (() => void) | null = null;
  private cortarVoz: (() => void) | null = null;
  private activoAntes = false;
  private readonly oyentes = new Set<() => void>();

  constructor(private readonly d: DepsContexto) {}

  suscribir = (o: () => void): (() => void) => {
    this.oyentes.add(o);
    return () => this.oyentes.delete(o);
  };

  /** Cargando o Leyendo. */
  activo(): boolean {
    return this.estado === "cargando" || this.estado === "leyendo";
  }

  /** El toque del botón: detiene si está activo; si no, lee (también desde Terminó o No se pudo). */
  tocar(tarea: string, cargar: () => Promise<Lectura>): void {
    if (this.activo()) this.detener();
    else void this.leer(tarea, cargar);
  }

  async leer(tarea: string, cargar: () => Promise<Lectura>): Promise<void> {
    this.parar();
    const n = ++this.lectura;
    this.d.antesDeLeer?.();
    this.tarea = tarea;
    this.frases = [];
    this.informe = null;
    this.k = 0;
    this.sinVoz = false;
    this.estado = "cargando";
    this.avisar();
    let texto: Lectura;
    let hayVoz: boolean;
    try {
      [texto, hayVoz] = await Promise.all([cargar(), this.d.voz.hayVoz().catch(() => false)]);
    } catch {
      if (n !== this.lectura) return;
      this.estado = "error";
      this.avisar();
      this.reloj = this.d.programar(() => this.volverListo(n, "error"), ERROR_MS);
      return;
    }
    if (n !== this.lectura) return;
    this.frases = typeof texto === "string" ? frasesDe(texto) : texto.frases.slice();
    this.informe = typeof texto === "string" ? null : (texto.informe ?? null);
    this.sinVoz = !hayVoz;
    this.sinVozAlCargar = !hayVoz;
    if (this.frases.length === 0) {
      this.terminar(n);
      return;
    }
    // El informe ya se puede leer con los ojos mientras llega el audio (JST-414): se avisa con las frases cargadas.
    this.avisar();
    // Con una voz de la lista, el audio de la primera frase se espera aquí, en «Cargando…».
    if (hayVoz && this.d.voz.preparar) {
      await this.d.voz.preparar(this.frases).catch(() => undefined);
      if (n !== this.lectura) return;
    }
    this.estado = "leyendo";
    this.avisar();
    this.decir(n);
  }

  /**
   * Salta a la frase `k` y sigue leyendo desde ahí (JST-414): repetir la que va, volver a la anterior o adelantar.
   * Sirve mientras lee y también después de terminar o detener, mientras las frases sigan cargadas.
   */
  irA(k: number): void {
    if (this.frases.length === 0) return;
    // Con las frases ya a la vista y el audio todavía en camino: se elige desde dónde parte, y la lectura sigue sola.
    if (this.estado === "cargando") {
      this.k = Math.min(this.frases.length - 1, Math.max(0, Math.round(k)));
      this.avisar();
      return;
    }
    const n = ++this.lectura;
    this.parar();
    if (this.estado !== "leyendo") this.d.antesDeLeer?.();
    this.sinVoz = this.sinVozAlCargar;
    this.k = Math.min(this.frases.length - 1, Math.max(0, Math.round(k)));
    this.estado = "leyendo";
    this.avisar();
    this.decir(n);
  }

  /** La frase anterior (o la misma, si es la primera) y la siguiente (si es la última, termina). */
  anterior(): void {
    this.irA(this.k - 1);
  }
  siguiente(): void {
    if (this.k + 1 >= this.frases.length) {
      if (this.estado === "leyendo") this.terminar(++this.lectura);
      return;
    }
    this.irA(this.k + 1);
  }

  /** Olvida lo leído (cerrar la parte escrita): detiene y suelta las frases y el informe. */
  soltar(): void {
    this.detener();
    if (this.frases.length === 0 && !this.informe) return;
    this.frases = [];
    this.informe = null;
    this.k = 0;
    this.avisar();
  }

  /**
   * Detener (la X, salir de la tarea o el Resumen que sigue): vuelve a Listo y corta lo que suena. Con las frases
   * cargadas conserva la frase que iba, para seguir desde ahí; después de terminar vuelve a la primera.
   */
  detener(): void {
    const habia = this.estado !== "listo";
    this.lectura += 1;
    this.parar();
    if (this.estado === "fin" || this.frases.length === 0) this.k = 0;
    this.estado = "listo";
    this.sinVoz = false;
    if (habia) this.avisar();
  }

  private decir(n: number): void {
    const f = this.frases[this.k]!;
    const sigue = () => {
      if (n !== this.lectura || this.estado !== "leyendo") return;
      this.reloj = null;
      this.cortarVoz = null;
      if (this.k + 1 >= this.frases.length) {
        this.terminar(n);
        return;
      }
      this.k += 1;
      this.avisar();
      this.decir(n);
    };
    if (this.sinVoz) {
      this.reloj = this.d.programar(sigue, msEscrita(f));
      return;
    }
    let terminada = false;
    const corte = this.d.voz.decir(
      f,
      (cortada) => {
        if (n !== this.lectura) return;
        terminada = true;
        this.cortarVoz = null;
        // Otra voz tomó el navegador: no se sigue leyendo encima.
        if (cortada) this.detener();
        else sigue();
      },
      this.k === 0,
    );
    // Si la frase ya terminó (la voz no tenía nada que decir y avisó sin esperar), su corte no se guarda: pisaría el de la que suena.
    if (!terminada) this.cortarVoz = corte;
  }

  private terminar(n: number): void {
    this.parar();
    this.estado = "fin";
    this.k = Math.max(0, this.frases.length - 1);
    this.avisar();
    this.reloj = this.d.programar(() => this.volverListo(n, "fin"), FIN_MS);
  }

  private volverListo(n: number, desde: EstadoContexto): void {
    if (n !== this.lectura || this.estado !== desde) return;
    this.reloj = null;
    this.estado = "listo";
    this.k = 0;
    this.sinVoz = false;
    this.avisar();
  }

  /** Corta el reloj y la voz de la lectura que va. */
  private parar(): void {
    this.reloj?.();
    this.reloj = null;
    const c = this.cortarVoz;
    this.cortarVoz = null;
    c?.();
  }

  private avisar(): void {
    this.version += 1;
    const activo = this.activo();
    if (activo !== this.activoAntes) {
      this.activoAntes = activo;
      this.d.alActivo?.(activo);
    }
    for (const o of this.oyentes) o();
  }
}

/** La tarea de la ruta `/{prefijo}/issues/{código o id}`; `null` en las demás páginas (también las listas de tareas). */
const LISTAS = new Set(["active", "all", "backlog", "done", "recent"]);
export function tareaDeRuta(pathname: string): string | null {
  const m = pathname.match(/^\/[^/]+\/issues\/([^/]+)\/?$/);
  if (!m) return null;
  let ref: string;
  try {
    ref = decodeURIComponent(m[1]!);
  } catch {
    return null;
  }
  return ref && !LISTAS.has(ref.toLowerCase()) ? ref : null;
}
