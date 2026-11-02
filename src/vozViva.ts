// La voz que dice de qué se trata (0.5.0, JST-167; opción B del spike de
// JST-161), en el worker del plugin: prepara las frases con el nombre de la
// tarea («Diseño, de JSTM: terminé. Diseño de Oficina global 0.5.0.») con la
// voz de cada agente, cuando una Oficina con ese interruptor prendido se lo
// pide (al ver que el agente empieza la tarea). Si la frase no está lista a
// tiempo, la página dice la de siempre.
//
// - Responde al tiro y genera en segundo plano: una fila para Edge, otra para
//   Kokoro y una sola para los clones (Qwen3 y Chatterbox), de a una frase.
// - Cada voz y texto se hace una sola vez, aunque lo pidan varias pantallas.
// - «Empecé» va delante en su fila y la página puede esperarla un poco
//   (`esperar`): es la única que se dice apenas empieza la tarea (JST-194).
// - 0.8.0 (JST-241): «te necesito» con la pregunta (`pide`) se pide cuando sube
//   la mano, también delante, y la página la espera hasta 30 s.
// - El texto lo arma el plugin (`textoVoz` con la tarea cortada por
//   `tareaParaVoz`, ~60 letras) y va al motor por su entrada estándar, nunca en
//   la línea de comandos. El motor corre con prioridad baja (nice 10) y un tope
//   de 3 min por frase; si se pasa, se mata (`uv` y su Python, JST-198).
// - No empieza un clon si queda poco swap o la carga de la Mac está muy alta,
//   la de 1 min y también la de 5 (un respiro de un momento no basta). Durante
//   el clon la vuelve a mirar cada 10 s y lo corta apenas sube; después de
//   cortar uno, no empieza otro en 5 min (JST-198).
// - Deja los MP3 en `dist/ui/voces/vivo/` (con `vivo.json`), como mucho
//   ~200 MB, y borra lo que tenga más de 7 días.
// - Si falta `uv` o `ffmpeg`, no hace nada y lo dice (`estado`).
// - 0.6.0 (JST-226, opción C del spike de JST-224): también prepara lo que se
//   lee de la oficina (las frases de una conversación, juntas, un minuto antes;
//   la entrega, la mascota, la frase suelta y la hora) y la página puede
//   esperarlas (`esperarOficina`). Solo acepta lo que el plugin pudo haber
//   armado (`validarPedidoOficina`): lo demás se rechaza.
// - 0.7.0 (JST-232, puntos 5 y 7 del spike de JST-230): acepta también lo que
//   escribió la IA de Chrome si pasa su revisión, con un tope de frases nuevas
//   por minuto, y le dice a la página si la IA puede escribir (`permisoIa`: la
//   Mac no está cargada y no hay un clon generando, que también usa la GPU).
// - 0.9.0 (JST-246): lee el Resumen con la voz del Chief of staff (`esperarResumen`):
//   la página pide la frase que suena y las 2 que siguen; van delante en su
//   fila, con sus reglas (`src/resumen/voz.ts`): un largo máximo, solo letras y
//   signos, un tope por resumen y por minuto, y solo con Edge o Kokoro.
// - 0.9.1 (JST-255): un clon que dura demasiado para su texto (`maximoAudioMs`,
//   3 s más el doble de sus letras a 10 por segundo) se bota, al hacerlo y al
//   arrancar el worker con los que ya estaban guardados.
//
// - 0.11.0 (JST-325, design-spec de JST-324): el usuario elige la voz del
//   Resumen, la de «Leer contexto» y la de cada agente. La elección queda en
//   `voces/eleccion.json` (`elegir`). Cambiar la voz de un agente graba sus 20
//   frases con nombre y empresa **en segundo plano** y recién al terminar la
//   última escribe la voz nueva en `indice.json`: mientras tanto sigue con la
//   de antes (un grupo a la vez; los demás esperan). Lo mismo con los «3
//   agentes te necesitan» (100 frases) cuando cambia la voz del Resumen. Un
//   clon espera a que la Mac esté libre, sin fallar. Y `calentar` abre el motor
//   de la voz elegida antes de leer (el Resumen y «Leer contexto» esperan menos).
//
// - 0.13.0 (issue #9): «Preparar voces» desde la oficina, sin `npm run voces`
//   (`alDia`). La página manda los agentes que ve; el worker baja los modelos
//   que falten (Supertonic y Kokoro, una vez), le da voz a los nuevos (de los
//   motores elegidos) y graba lo que falta en segundo plano, después de todo lo
//   demás de su fila. Desde ahí, cada vez que la página ve un agente nuevo o con
//   otro nombre, se graba solo. Supertonic tiene su propia fila y corre con el
//   mismo Node (sin `uv` ni ffmpeg): cada motor se mira por separado.
// - 0.13.0: los audios viven fuera de la carpeta del plugin (`almacen`, ver
//   `src/almacenVoces.ts`) y se publican en `dist/ui/voces/`, de donde los sirve
//   Paperclip: una actualización desde npm ya no se los lleva.
//
// No lee ni escribe nada en Paperclip.
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { cpus, homedir, loadavg, setPriority, tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { LETRAS_PIDE, MAX_MAS, TIPOS_PIDE, tareaParaVoz, textoVoz, type Frase, type PideVoz, type Presentacion } from "./avisos.js";
import { bajarModelo, comandoMotor, datosDeVoz, dejarListo, hayModelo, maximoAudioMs, MODELO_KOKORO, MODELO_SUPERTONIC, motorSupertonic, pesoModelo, problemaCon, PRUEBA_FFMPEG, type Modelo } from "../generador/motores.js";
import { asignarVoces, plan as planVoces, trabajosAvisosJuntos, trabajosDeAgente, type AgentePlan } from "../generador/plan.js";
import { paraDecir } from "../generador/pronunciar.js";
import { despublicar as sacarPublico, prepararAlmacen, publicar as ponerPublico } from "./almacenVoces.js";
import { esAlMomento, esVozLectura, GRUPOS_MOTOR, grupoDe, hayCambios, inicialesPara, leerEleccion, leerMotores, vocesDe, type EleccionVoces, type GrabandoVoz, type GrupoMotor } from "./eleccionVoces.js";
import { archivoVivo, CARPETA_VIVO, claveAudio, duracionAudio, leerIndice, motorDe, vozPorId, type IndiceVoces, type Motor, type VozId } from "./voces.js";
import { textoOficina, validarPedidoOficina, VOCES_MASCOTA } from "./vozOficina.js";
import { CupoResumen, fraseResumenValida, leerPedidoResumen } from "./resumen/voz.js";

/** Lo que pide la página: la frase de un agente con el nombre de una tarea, con la presentación de ese navegador. */
export interface PedidoVoz {
  agenteId: string;
  frase: Exclude<Frase, "error">;
  corto: string;
  empresa: string;
  presentacion: Presentacion;
  /** El nombre de la tarea, entero (se corta con `tareaParaVoz`). Con `pide`, no se dice (va igual: el pedido es el mismo de siempre). */
  tarea: string;
  /** 0.8.0: «te necesito» dice lo que espera (la pregunta breve, o qué aprobar o revisar) en vez de la tarea. */
  pide?: PideVoz;
}

/** Como mucho, por pedido (la página manda las de los agentes que trabajan: unos 26 × 3). */
export const MAX_PEDIDOS = 120;
/** Tope de cada frase en su motor. */
export const TOPE_FRASE_MS = 3 * 60_000;
/** Durante un clon, cada cuánto se vuelve a mirar la carga de la Mac. */
export const VIGILAR_MS = 10_000;
/** Después de cortar un clon porque la Mac se cargó, no se empieza otro en este rato. */
export const PAUSA_CLONES_MS = 5 * 60_000;
/**
 * Un motor sin trabajo se cierra a los 10 min (JST-325, punto 3 del spike de JST-323: con el motor ya abierto la primera
 * frase del Resumen baja de 3–5 s a 2–3,5 s; antes se cerraba a los 2 min y casi cada lectura empezaba en frío).
 */
const INACTIVO_MS: Record<Fila, number> = { edge: 10 * 60_000, kokoro: 10 * 60_000, clon: 10 * 60_000, supertonic: 10 * 60_000 };
/** Si falla una frase de las que se graban al cambiar una voz, se vuelve a probar a los 30 s (hasta 3 veces); un clon que espera a la Mac, a los 60 s. */
const REINTENTO_MS = 30_000;
const REINTENTO_CLON_MS = 60_000;
const INTENTOS_GRUPO = 3;
/** Lo de más de 7 días se borra, y la carpeta no pasa de ~200 MB. */
export const VIVO_DIAS_MS = 7 * 24 * 60 * 60_000;
export const VIVO_MAX_BYTES = 200 * 1024 * 1024;
/** Si no hay `uv` o `ffmpeg`, se vuelve a mirar cada 5 min (por si se arregla sin reiniciar Paperclip). */
const REVISAR_MS = 5 * 60_000;

/**
 * Tope del nombre del agente y de la empresa (JST-195). El texto tiene que ser
 * el mismo que arma la página, así que el nombre no se corta acá: Paperclip no
 * le pone tope al nombre de un agente y antes, con 60, uno de 73 letras no
 * decía nunca de qué se trata.
 */
export const LETRAS_NOMBRE = 200;

const FRASES_DETALLE: ReadonlySet<string> = new Set(["toca", "fin", "emp"]);
const PRESENTACIONES: ReadonlySet<string> = new Set(["nombre-empresa", "nombre", "frase"]);
const corto = (v: unknown, max: number) => typeof v === "string" && v.length > 0 && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v);

/** Lo que espera (0.8.0) con la forma esperada y dentro de los topes, o `null`. Sin `pide` es `undefined` (un pedido de siempre). */
function validarPide(x: unknown): PideVoz | null | undefined {
  if (x === undefined) return undefined;
  const p = x as Partial<PideVoz> | null;
  if (!p || typeof p !== "object" || !TIPOS_PIDE.includes(p.tipo as PideVoz["tipo"]) || !corto(p.texto, LETRAS_PIDE)) return null;
  if (!Number.isInteger(p.mas) || p.mas! < 0 || p.mas! > MAX_MAS) return null;
  return { tipo: p.tipo!, texto: p.texto!, mas: p.mas! };
}

/** Un pedido con la forma esperada y dentro de los topes, o `null`. */
export function validarPedido(x: unknown): PedidoVoz | null {
  const p = x as Partial<PedidoVoz> | null;
  if (!p || typeof p !== "object") return null;
  if (!corto(p.agenteId, 80) || !FRASES_DETALLE.has(p.frase as string) || !PRESENTACIONES.has(p.presentacion as string)) return null;
  // Con «Solo la frase» el nombre y la empresa no se dicen: no cuenta su largo.
  const nombres = p.presentacion === "frase" ? Infinity : LETRAS_NOMBRE;
  if (!corto(p.corto, nombres) || !corto(p.empresa, nombres) || !corto(p.tarea, 400)) return null;
  // Lo que espera solo va con «te necesito».
  const pide = validarPide(p.pide);
  if (pide === null || (pide && p.frase !== "toca")) return null;
  return { agenteId: p.agenteId!, frase: p.frase!, corto: p.corto!, empresa: p.empresa!, presentacion: p.presentacion!, tarea: p.tarea!, ...(pide ? { pide } : {}) };
}

/**
 * El texto que se genera: el mismo que arma la página (la frase con la tarea,
 * o «te necesito» con lo que espera). `null` si no queda nada que decir.
 */
export function textoPedido(p: PedidoVoz): string | null {
  if (p.pide) {
    const con = textoVoz(p.corto, p.empresa, p.frase, p.presentacion, { pide: p.pide });
    return con === textoVoz(p.corto, p.empresa, p.frase, p.presentacion) ? null : con;
  }
  return tareaParaVoz(p.tarea) ? textoVoz(p.corto, p.empresa, p.frase, p.presentacion, { tarea: p.tarea }) : null;
}

export type Fila = "edge" | "kokoro" | "clon" | "supertonic";
export const FILAS: readonly Fila[] = ["edge", "kokoro", "clon", "supertonic"];
export const filaDe = (m: Motor): Fila => (m === "edge" || m === "kokoro" || m === "supertonic" ? m : "clon");

/** 0.13.0: como mucho, los agentes que la página manda para preparar sus voces. */
export const MAX_AGENTES = 500;

/** 0.13.0: los agentes que manda la página (los que ve quien abre la oficina) con la forma esperada y dentro de los topes, o `null`. */
export function validarAgentes(x: unknown): AgentePlan[] | null {
  if (!Array.isArray(x) || x.length > MAX_AGENTES) return null;
  const lista: AgentePlan[] = [];
  const vistos = new Set<string>();
  for (const a of x as Array<Partial<Record<"id" | "nombre" | "empresa", unknown>> | null>) {
    if (!a || typeof a !== "object" || !corto(a.id, 80) || !corto(a.nombre, LETRAS_NOMBRE) || !corto(a.empresa, LETRAS_NOMBRE)) return null;
    if (vistos.has(a.id as string)) continue;
    vistos.add(a.id as string);
    // Sin fecha: los nuevos eligen por su id (el reparto sigue siendo el mismo con los mismos agentes).
    lista.push({ id: a.id as string, nombre: a.nombre as string, empresa: a.empresa as string, creado: "" });
  }
  return lista;
}

/** La voz de un trabajo: una de las 9, o la de una mascota (0.6.0), que es una de Edge más aguda. */
export interface VozTrabajo {
  id: string;
  motor: Motor;
  clave: string;
  pitch?: string;
  rate?: string;
}

export interface TrabajoVoz {
  voz: VozTrabajo;
  texto: string;
  /** `vivo/<voz>-<hash>.mp3`, dentro de la carpeta de las voces. */
  archivo: string;
  /** «Empecé» (JST-194) y «te necesito» con la pregunta (0.8.0): van delante en su fila. */
  delante?: boolean;
  /** 0.11.0: el grupo de frases de una voz nueva al que pertenece (van en la carpeta de las voces, no en `vivo/`). */
  grupo?: string;
  /** 0.13.0: de «Preparar voces» (va en la carpeta de las voces, con su clave del índice): después de todo lo demás de su fila. */
  preparar?: string;
}

/**
 * Hace una frase y deja su MP3 en `destino` (el de verdad corre el motor y
 * ffmpeg; en las pruebas, uno de mentira). Si `cortar` se activa, deja la
 * frase, mata el motor y falla con su motivo.
 */
export type Generar = (t: TrabajoVoz, destino: string, cortar: AbortSignal) => Promise<void>;

export interface EstadoVoz {
  /** Se pueden preparar frases al momento (con algún motor). */
  disponible: boolean;
  /** Por qué no: «falta uv (no está en el PATH)», «ffmpeg no funciona: dyld…». */
  motivo: string | null;
}

/** 0.13.0: cómo va «Preparar voces». */
export interface EstadoPreparar {
  fase: "nada" | "bajando" | "grabando" | "listo" | "error";
  /** Bajando: qué modelo y cuánto lleva (bytes). */
  modelo: string | null;
  bajado: number;
  pesa: number;
  /** Grabando: las frases que faltaban al empezar, cuántas ya están y cuántas fallaron. */
  hechas: number;
  total: number;
  fallas: number;
  /** Frases de agentes con una voz de un motor que no se eligió o no se puede usar aquí (se dicen con la del navegador). */
  sinMotor: number;
  motivo: string | null;
}

/** 0.13.0: lo que el panel «Voces» necesita para «Preparar voces». */
export interface EstadoMotores {
  /** Por qué no se puede usar cada motor en este computador (`null`: se puede; a Supertonic y Kokoro les puede faltar bajar el modelo). */
  motores: Record<GrupoMotor, string | null>;
  /** Lo que pesa el modelo que falta bajar (bytes), o 0 si ya está. */
  porBajar: Record<"supertonic" | "kokoro", number>;
  preparar: EstadoPreparar;
}

export interface OpcionesPreparador {
  /** La carpeta del plugin (la de `package.json`). */
  raiz: string;
  /**
   * 0.13.0: dónde se guardan los audios (fuera del plugin, `carpetaAlmacen`); se publican en `dist/ui/voces/`.
   * Sin esto, se guardan directo en `dist/ui/voces/` (como hasta la 0.12, y en las pruebas).
   */
  almacen?: string;
  generar?: Generar;
  /** Revisa `uv` y `ffmpeg` (`null` si arrancan). */
  revisar?: () => string | null;
  /** 0.13.0: revisa que el motor de Supertonic arranque (`null` si arranca). */
  revisarSupertonic?: () => string | null;
  /** 0.13.0: si un modelo está bajado, y cómo se baja (en las pruebas, de mentira). */
  hayModelo?: (m: Modelo) => boolean;
  bajar?: (m: Modelo, alAvanzar: (bytes: number, total: number) => void) => Promise<void>;
  /** Se puede empezar un clon ahora (swap y carga de la Mac). */
  clonesOk?: () => boolean;
  /** 0.11.0: abre el motor de una voz para que la primera frase no tenga que esperarlo (las pruebas no abren ninguno). */
  calentar?: (fila: Fila, motor: Motor) => void;
  /** El clon que se está haciendo puede seguir (se mira cada 10 s). */
  clonSigue?: () => boolean;
  log?: (mensaje: string, datos?: Record<string, unknown>) => void;
  ahora?: () => number;
}

/** Lo más que `esperar` tiene abierta la respuesta (el RPC corta a los 30 s), y cada cuánto mira si la frase ya está. */
export const ESPERA_MAX_MS = 25_000;
const MIRAR_MS = 250;
/**
 * Lo de la oficina (0.6.0) responde a los 20 s como mucho, medidos con el reloj: con la Mac cargada, contar vueltas de
 * 250 ms se pasaba de los 30 s del RPC (502 en la página). La página vuelve a preguntar hasta su plazo.
 */
export const ESPERA_OFICINA_MAX_MS = 20_000;
/** 0.7.0: como mucho tantas frases nuevas de la IA por minuto en la fila (una conversación con voz por minuto trae 1 o 2). */
export const TOPE_IA_POR_MIN = 8;
/** 0.8.1 (JST-249): lo más que el permiso de la IA espera a que termine el clon que se está haciendo (el RPC corta a los 30 s). */
export const ESPERA_PERMISO_IA_MAX_MS = 15_000;

/** 0.7.0 (punto 5 del spike de JST-230): si la IA de Chrome puede escribir ahora, y si no, por qué. */
export interface PermisoIa {
  escribir: boolean;
  motivo: "carga" | "clon" | null;
}

interface IndiceVivo {
  version: 1;
  /** `ms`: cuánto dura (0.6.0). */
  audios: Record<string, { voz: string; texto: string; creado: string; ms?: number | null }>;
}

interface GrupoVoz {
  id: string;
  quien: "agente" | "resumen";
  agenteId: string | null;
  voz: VozId;
  anterior: VozId | null;
  trabajos: Array<{ voz: VozTrabajo; texto: string; archivo: string }>;
  /** Las que faltaban al empezar (las sueltas de cada voz ya estaban grabadas): lo que cuenta «Grabando 12 de 20». */
  nuevos: Set<string>;
  intentos: Map<string, number>;
  error: boolean;
  esperaMac: boolean;
  arrancado: boolean;
}

/** Lo que responde `elegir`: la elección que queda y, si no se pudo, por qué. */
export interface ResultadoElegir {
  ok: boolean;
  motivo?: "pedido" | "sin-mac" | "sin-voces";
  eleccion: EleccionVoces;
}

/** Cómo está cada frase pedida: ya está, en su fila o no se puede hacer (sin voz, pedido raro, sin clones ahora, falló). */
export type EstadoFrase = "lista" | "fila" | "no";

export class PreparadorVoces {
  /** Donde se guardan los audios (0.13.0: fuera del plugin) y donde los sirve Paperclip (`dist/ui/voces/`). */
  private readonly dirVoces: string;
  private readonly publico: string;
  private readonly filas: Record<Fila, TrabajoVoz[]> = { edge: [], kokoro: [], clon: [], supertonic: [] };
  private readonly corriendo: Record<Fila, boolean> = { edge: false, kokoro: false, clon: false, supertonic: false };
  /** Pedidos o en la fila: cada voz y texto, una vez. */
  private readonly enCurso = new Set<string>();
  private problema: { motivo: string | null; en: number } | null = null;
  private problemaSt: { motivo: string | null; en: number } | null = null;
  private readonly generar: Generar;
  private readonly revisarProgramas: () => string | null;
  private readonly revisarSupertonic: () => string | null;
  private readonly hayModelo: (m: Modelo) => boolean;
  private readonly bajar: (m: Modelo, alAvanzar: (bytes: number, total: number) => void) => Promise<void>;
  /** 0.13.0: «Preparar voces»: cómo va, los agentes que mandó la página y lo grabado que falta anotar en el índice. */
  private prep: EstadoPreparar = { fase: "nada", modelo: null, bajado: 0, pesa: 0, hechas: 0, total: 0, fallas: 0, sinMotor: 0, motivo: null };
  private agentesVistos = new Map<string, AgentePlan>();
  private preparando: Promise<void> | null = null;
  private otraVez = false;
  private porAnotar = new Map<string, string>();
  /** Lo de «Preparar voces» que todavía no termina (está en una fila o se está grabando). */
  private pendientesPrep = new Set<string>();
  private anotarLuego: ReturnType<typeof setTimeout> | null = null;
  private readonly clonesOk: () => boolean;
  private readonly clonSigue: () => boolean;
  /** Hasta cuándo no se empiezan clones (después de cortar uno por la carga). */
  private sinClonesHasta = 0;
  private readonly log: (mensaje: string, datos?: Record<string, unknown>) => void;
  private readonly ahora: () => number;
  private readonly motores: Motores;
  /** 0.7.0: cuándo entró a la fila cada frase nueva de la IA (el último minuto). */
  private nuevasIa: number[] = [];
  /** 0.9.0: las frases nuevas de cada resumen y del último minuto. */
  private readonly cupoResumen: CupoResumen;
  /** 0.11.0: las voces que se están grabando; la primera sin error graba y las demás esperan. */
  private grupos: GrupoVoz[] = [];
  private reintento: ReturnType<typeof setTimeout> | null = null;
  private readonly calentarMotor: (fila: Fila, motor: Motor) => void;
  /** Lo hecho (para las pruebas y el registro). */
  hechos = 0;
  saltados = 0;

  constructor(o: OpcionesPreparador) {
    this.publico = join(o.raiz, "dist", "ui", "voces");
    this.dirVoces = o.almacen ?? this.publico;
    this.ahora = o.ahora ?? Date.now;
    this.log = o.log ?? (() => undefined);
    if (this.dirVoces !== this.publico) {
      try {
        const r = prepararAlmacen(this.dirVoces, this.publico);
        this.log("voces: audios publicados", { almacen: this.dirVoces, ...r });
      } catch (e) {
        this.log("voces: no se pudieron publicar los audios", { error: (e as Error).message.slice(0, 300) });
      }
    }
    this.motores = new Motores(o.raiz, this.log);
    this.generar = o.generar ?? ((t, destino, cortar) => this.motores.generar(t, destino, cortar));
    this.revisarProgramas = o.revisar ?? (() => problemaCon("uv", ["--version"], entorno()) ?? problemaCon("ffmpeg", PRUEBA_FFMPEG, entorno()));
    this.revisarSupertonic = o.revisarSupertonic ?? (() => problemaSupertonic(o.raiz));
    this.hayModelo = o.hayModelo ?? hayModelo;
    this.bajar = o.bajar ?? ((m, alAvanzar) => bajarModelo(m, alAvanzar));
    this.clonesOk = o.clonesOk ?? (() => clonesSeguros());
    this.clonSigue = o.clonSigue ?? (() => clonSigue(loadavg()[0]!, nucleosDelMotor(this.motores.pid("clon")), cpus().length, swapLibreMb()));
    this.cupoResumen = new CupoResumen(this.ahora);
    this.calentarMotor = o.calentar ?? ((fila, motor) => this.motores.calentar(fila, motor, INACTIVO_MS[fila]));
    try {
      this.botarLargosGuardados();
    } catch (e) {
      this.log("voces: no se pudieron revisar los clones guardados", { error: (e as Error).message.slice(0, 300) });
    }
  }

  /** Si hay `uv` y `ffmpeg` (se mira al empezar y, si faltan, de nuevo cada 5 min): Edge, Kokoro y los clones. */
  private problemaPython(): string | null {
    const t = this.ahora();
    if (!this.problema || (this.problema.motivo && t - this.problema.en >= REVISAR_MS)) {
      const motivo = this.revisarProgramas();
      this.problema = { motivo, en: t };
      if (motivo) this.log("voces: no disponible", { motivo });
    }
    return this.problema.motivo;
  }

  /** 0.13.0: si el motor de Supertonic arranca (sherpa-onnx-node para este sistema); se mira igual que `uv`. */
  private problemaSupertonic(): string | null {
    const t = this.ahora();
    if (!this.problemaSt || (this.problemaSt.motivo && t - this.problemaSt.en >= REVISAR_MS)) {
      const motivo = this.revisarSupertonic();
      this.problemaSt = { motivo, en: t };
      if (motivo) this.log("voces: Supertonic no disponible", { motivo });
    }
    return this.problemaSt.motivo;
  }

  /** 0.13.0: ese motor puede grabar ahora (con su modelo bajado, si lleva uno). */
  motorListo(m: Motor): boolean {
    if (m === "supertonic") return !this.problemaSupertonic() && this.hayModelo(MODELO_SUPERTONIC);
    if (this.problemaPython()) return false;
    return m !== "kokoro" || this.hayModelo(MODELO_KOKORO);
  }

  /** Si se pueden preparar frases al momento con algún motor (con `uv` y `ffmpeg`, o con Supertonic ya bajado). */
  estado(): EstadoVoz {
    const python = this.problemaPython();
    if (!python) return { disponible: true, motivo: null };
    return this.motorListo("supertonic") ? { disponible: true, motivo: null } : { disponible: false, motivo: python };
  }

  private indice(): IndiceVoces | null {
    try {
      return leerIndice(JSON.parse(readFileSync(join(this.dirVoces, "indice.json"), "utf8")));
    } catch {
      return null;
    }
  }

  /**
   * Pone en su fila las frases que falten (al tiro: no espera a que se hagan).
   * Devuelve cuántas ya estaban, cuántas quedaron en fila y cuántas no se
   * pueden hacer (agente sin voz, tarea sin nombre, pedido raro).
   */
  preparar(pedidos: readonly unknown[]): { listas: number; enFila: number; saltadas: number } {
    const r = { listas: 0, enFila: 0, saltadas: 0 };
    if (!this.estado().disponible) return { ...r, saltadas: pedidos.length };
    const indice = this.indice();
    let raros = 0;
    for (const x of pedidos.slice(0, MAX_PEDIDOS)) {
      const p = validarPedido(x);
      const voz = p && indice ? vozPorId(indice.agentes[p.agenteId]) : null;
      const texto = p ? textoPedido(p) : null;
      if (!p || !voz || !texto) {
        if (!p) raros += 1;
        r.saltadas += 1;
        continue;
      }
      // «Empecé» se dice apenas empieza la tarea; «te necesito» y «terminé», minutos después: «empecé» pasa delante (JST-194).
      // «Te necesito» con la pregunta (0.8.0) también: se pide recién cuando sube la mano.
      const e = this.encolar(voz, texto, p.frase === "emp" || !!p.pide);
      if (e === "lista") r.listas += 1;
      else if (e === "fila") r.enFila += 1;
      else r.saltadas += 1;
    }
    // Antes se descartaban sin dejar rastro (JST-195).
    if (raros > 0) this.log("voces: pedidos que no se entienden (forma o topes)", { raros });
    for (const f of FILAS) void this.correr(f);
    return r;
  }

  /**
   * Pone una frase en su fila si falta (cada voz y texto, una vez). `delante`: antes de lo que no va delante. Lo de
   * «Preparar voces» (0.13.0) va al final, después de todo lo demás: las frases al momento no lo esperan.
   */
  private encolar(voz: VozTrabajo, texto: string, delante: boolean, destino?: { archivo: string; grupo?: string; preparar?: string }): EstadoFrase {
    const archivo = destino?.archivo ?? archivoVivo(voz.id, texto);
    if (existsSync(join(this.dirVoces, archivo))) return "lista";
    if (this.enCurso.has(archivo)) return "fila";
    if (!this.motorListo(voz.motor)) return "no";
    this.enCurso.add(archivo);
    const fila = this.filas[filaDe(voz.motor)];
    const preparar = destino?.preparar;
    const i = delante ? fila.findIndex((t) => !t.delante) : preparar ? -1 : fila.findIndex((t) => !!t.preparar);
    fila.splice(i < 0 ? fila.length : i, 0, { voz, texto, archivo, delante, ...(destino?.grupo ? { grupo: destino.grupo } : {}), ...(preparar ? { preparar } : {}) });
    return "fila";
  }

  /** La voz y el texto de un pedido de la oficina (0.6.0), o `null` si no se puede hacer. `ia`: lo escribió la IA de Chrome (0.7.0). */
  private trabajoOficina(x: unknown, indice: IndiceVoces | null): { voz: VozTrabajo; texto: string; ia: boolean } | null {
    const p = validarPedidoOficina(x);
    if (!p) return null;
    const voz: VozTrabajo | null = p.mascota ? VOCES_MASCOTA[p.mascota] : indice ? vozPorId(indice.agentes[p.agenteId!]) : null;
    const texto = textoOficina(p);
    return voz && texto ? { voz, texto, ia: !!p.ia } : null;
  }

  /**
   * 0.7.0 (punto 5 del spike de JST-230): la IA de Chrome escribe solo si la Mac
   * no está cargada (lo mismo que para empezar un clon, JST-198) y no hay un
   * clon generando (también usa la GPU). La fila de los clones va de a una
   * frase y empieza apenas llega algo: si hay frases esperando, es porque hay
   * una generándose (`corriendo`), y al terminar la última queda libre.
   */
  permisoIa(): PermisoIa {
    if (this.corriendo.clon || this.filas.clon.length > 0) return { escribir: false, motivo: "clon" };
    if (this.ahora() < this.sinClonesHasta || !this.clonesOk()) return { escribir: false, motivo: "carga" };
    return { escribir: true, motivo: null };
  }

  /**
   * 0.8.1 (JST-249): como `permisoIa`, pero si hay un clon generando espera
   * hasta `ms` (como mucho 15 s, por reloj) a que la fila de los clones quede
   * libre. Con las voces prendidas los clones se hacen casi todo el rato, con
   * huecos entre una conversación y otra: así la ráfaga cae en un hueco en vez
   * de saltarse cada vez. Con la Mac cargada responde al tiro (no se libera en
   * unos segundos).
   */
  async esperarPermisoIa(ms: number): Promise<PermisoIa> {
    const fin = Date.now() + Math.min(Math.max(0, ms), ESPERA_PERMISO_IA_MAX_MS);
    let p = this.permisoIa();
    while (p.motivo === "clon" && Date.now() < fin) {
      await new Promise((ok) => setTimeout(ok, Math.min(MIRAR_MS, fin - Date.now())));
      p = this.permisoIa();
    }
    return p;
  }

  /** 0.7.0: una frase nueva de la IA más en la fila, si no se pasa del tope del último minuto. */
  private cupoIa(): boolean {
    const t = this.ahora();
    this.nuevasIa = this.nuevasIa.filter((x) => t - x < 60_000);
    if (this.nuevasIa.length >= TOPE_IA_POR_MIN) return false;
    this.nuevasIa.push(t);
    return true;
  }

  /**
   * Lo que se lee de la oficina (0.6.0, JST-226): pone en su fila lo que falte,
   * al tiro, y devuelve cómo está cada pedido, en el mismo orden. Un pedido
   * raro o de un agente sin voz queda en «no».
   */
  prepararOficina(pedidos: readonly unknown[]): EstadoFrase[] {
    if (!this.estado().disponible) return pedidos.map(() => "no");
    const indice = this.indice();
    let raros = 0;
    const r = pedidos.slice(0, MAX_PEDIDOS).map((x): EstadoFrase => {
      const t = this.trabajoOficina(x, indice);
      if (!t) {
        if (!validarPedidoOficina(x)) raros += 1;
        return "no";
      }
      // Un clon que ahora no se puede empezar (la Mac cargada, JST-198) se dice al tiro, aunque haya otros en su fila:
      // la página prepara otra conversación en vez de esperar el minuto. Si se puede, se vuelve a mirar al empezarlo.
      const sinClon = filaDe(t.voz.motor) === "clon" && (this.ahora() < this.sinClonesHasta || !this.clonesOk());
      const archivo = archivoVivo(t.voz.id, t.texto);
      const hecho = existsSync(join(this.dirVoces, archivo));
      if (sinClon && !hecho) return "no";
      // 0.7.0: lo nuevo de la IA tiene su tope por minuto (lo que ya está o ya está en la fila no cuenta).
      if (t.ia && !hecho && !this.enCurso.has(archivo) && !this.cupoIa()) return "no";
      return this.encolar(t.voz, t.texto, false);
    });
    if (raros > 0) this.log("voces: frases de la oficina que no son del plugin", { raros });
    for (const f of FILAS) void this.correr(f);
    return r;
  }

  /**
   * Como `prepararOficina`, y responde cuando están todas, cuando alguna ya no
   * se puede hacer (un clon que no se empezó porque la Mac está cargada, o que
   * falló) o a los `ms` (como mucho 20 s, por reloj): la página vuelve a
   * preguntar hasta su plazo. Lo que el worker ya estaba haciendo se termina y
   * se guarda igual.
   */
  async esperarOficina(pedidos: readonly unknown[], ms: number): Promise<EstadoFrase[]> {
    let estados = this.prepararOficina(pedidos);
    const indice = this.indice();
    const archivos = pedidos.slice(0, MAX_PEDIDOS).map((x) => {
      const t = this.trabajoOficina(x, indice);
      return t ? archivoVivo(t.voz.id, t.texto) : null;
    });
    const mirar = (): EstadoFrase[] => archivos.map((a) => (!a ? "no" : existsSync(join(this.dirVoces, a)) ? "lista" : this.enCurso.has(a) ? "fila" : "no"));
    const fin = Date.now() + Math.min(ms, ESPERA_OFICINA_MAX_MS);
    while (Date.now() < fin && estados.includes("fila") && !estados.includes("no")) {
      await new Promise((ok) => setTimeout(ok, Math.min(MIRAR_MS, fin - Date.now())));
      estados = mirar();
    }
    return estados;
  }

  /**
   * 0.9.0 (JST-246): las frases del Resumen con la voz del Chief of staff. Pone
   * en su fila las que falten, delante y en orden (la que suena primero), y
   * responde cuando la primera está, cuando ya no se puede o a los `ms` (como
   * mucho 20 s, por reloj). Una frase que no pasa las reglas, de una voz que no
   * sea Edge o Kokoro o que no cabe en el cupo queda en «no»: la página la dice
   * con la voz del navegador.
   */
  async esperarResumen(x: unknown, ms: number): Promise<EstadoFrase[]> {
    const p = leerPedidoResumen(x);
    const n = Array.isArray((x as { frases?: unknown } | null)?.frases) ? Math.min(3, (x as { frases: unknown[] }).frases.length) : 0;
    if (!p) {
      this.log("voces: un resumen que no se entiende", {});
      return Array<EstadoFrase>(n).fill("no");
    }
    if (!this.estado().disponible) return p.frases.map(() => "no");
    const voz = vozPorId(p.voz)!;
    const archivos = p.frases.map((t) => (fraseResumenValida(t) ? archivoVivo(voz.id, t) : null));
    let estados = p.frases.map((t, i): EstadoFrase => {
      const archivo = archivos[i];
      if (!archivo) return "no";
      if (existsSync(join(this.dirVoces, archivo))) return "lista";
      if (this.enCurso.has(archivo)) return "fila";
      if (!this.cupoResumen.tomar(p.resumen, t)) return "no";
      return this.encolar(voz, t, true);
    });
    const malas = archivos.filter((a) => !a).length;
    if (malas > 0) this.log("voces: frases del resumen que no pasan sus reglas", { malas });
    for (const f of ["edge", "kokoro", "supertonic"] as const) void this.correr(f);
    const mirar = (): EstadoFrase[] => archivos.map((a) => (!a ? "no" : existsSync(join(this.dirVoces, a)) ? "lista" : this.enCurso.has(a) ? "fila" : "no"));
    const fin = Date.now() + Math.min(ms, ESPERA_OFICINA_MAX_MS);
    while (Date.now() < fin && estados[0] === "fila") {
      await new Promise((ok) => setTimeout(ok, Math.min(MIRAR_MS, fin - Date.now())));
      estados = mirar();
    }
    return estados;
  }

  /** Una fila: de a una frase. Edge y Kokoro no esperan a los clones. */
  private async correr(fila: Fila): Promise<void> {
    if (this.corriendo[fila]) return;
    this.corriendo[fila] = true;
    try {
      for (let t = this.filas[fila].shift(); t; t = this.filas[fila].shift()) {
        if (fila === "clon" && (this.ahora() < this.sinClonesHasta || !this.clonesOk())) {
          this.saltados += 1;
          this.log("voces: sin clones ahora (poco swap o mucha carga)", { voz: t.voz.id });
          this.enCurso.delete(t.archivo);
          this.trabajoTerminado(t, "sin-mac");
          if (t.preparar) this.preparada(t, false);
          continue;
        }
        const control = new AbortController();
        const inicio = this.ahora();
        let resultado: "ok" | "falla" | "sin-mac" = "falla";
        // Un clon: cada 10 s se vuelve a mirar la Mac y, si se cargó, se corta ahí (no a los 3 min).
        const vigia = fila === "clon" ? setInterval(() => this.clonSigue() || control.abort(new Error("la Mac se cargó")), VIGILAR_MS) : null;
        try {
          mkdirSync(join(this.dirVoces, CARPETA_VIVO), { recursive: true });
          await this.generar(t, join(this.dirVoces, t.archivo), control.signal);
          const ms = this.duracion(t.archivo);
          if (this.botarSiLargo(t.archivo, t.voz.motor, t.texto, ms)) this.saltados += 1;
          else {
            this.publicar(t.archivo);
            // Las frases de una voz nueva (0.11.0) y las de «Preparar voces» (0.13.0) no son de `vivo/`: no entran a
            // `vivo.json` ni se borran a los 7 días.
            if (!t.grupo && !t.preparar) this.anotar(t, ms);
            this.hechos += 1;
            resultado = "ok";
          }
        } catch (e) {
          this.saltados += 1;
          if (control.signal.aborted) {
            resultado = "sin-mac";
            this.sinClonesHasta = this.ahora() + PAUSA_CLONES_MS;
            this.log("voces: clon cortado (la Mac se cargó)", { voz: t.voz.id, segundos: Math.round((this.ahora() - inicio) / 1000) });
          } else this.log("voces: no se pudo hacer una frase", { voz: t.voz.id, error: (e as Error).message.slice(0, 300) });
        } finally {
          if (vigia) clearInterval(vigia);
          this.enCurso.delete(t.archivo);
        }
        this.trabajoTerminado(t, resultado);
        if (t.preparar) this.preparada(t, resultado === "ok");
      }
    } finally {
      this.corriendo[fila] = false;
      this.motores.dormir(fila, INACTIVO_MS[fila]);
    }
  }


  // -------------------------------------------------------------------------
  // Elegir las voces (0.11.0, JST-325)
  // -------------------------------------------------------------------------

  /** Lo que el usuario dejó elegido (`eleccion.json`); sin archivo, lo que queda al instalar. */
  eleccion(): EleccionVoces {
    try {
      return leerEleccion(JSON.parse(readFileSync(join(this.dirVoces, "eleccion.json"), "utf8")));
    } catch {
      return leerEleccion(null);
    }
  }

  private guardarEleccion(e: EleccionVoces): void {
    mkdirSync(this.dirVoces, { recursive: true });
    const ruta = join(this.dirVoces, "eleccion.json");
    writeFileSync(`${ruta}.parcial`, JSON.stringify(e));
    renameSync(`${ruta}.parcial`, ruta);
    this.publicar("eleccion.json");
  }

  private guardarIndice(i: IndiceVoces): void {
    mkdirSync(this.dirVoces, { recursive: true });
    const ruta = join(this.dirVoces, "indice.json");
    writeFileSync(`${ruta}.parcial`, JSON.stringify({ ...i, generado: new Date(this.ahora()).toISOString() }));
    renameSync(`${ruta}.parcial`, ruta);
    this.publicar("indice.json");
  }

  /** 0.13.0: lo que se escribió en el almacén queda donde lo sirve Paperclip (si son la misma carpeta, no hace nada). */
  private publicar(rel: string): void {
    if (this.dirVoces === this.publico) return;
    try {
      ponerPublico(this.dirVoces, this.publico, rel);
    } catch (e) {
      this.log("voces: no se pudo publicar un audio", { archivo: rel, error: (e as Error).message.slice(0, 300) });
    }
  }

  private despublicar(rel: string): void {
    if (this.dirVoces === this.publico) return;
    try {
      sacarPublico(this.publico, rel);
    } catch {
      // Ya no estaba.
    }
  }

  /**
   * Lo que la página pide al elegir una voz. `resumen` y `contexto` solo se
   * guardan (leen al momento, con una voz rápida o la del navegador); cambiar el
   * Resumen además pide los «3 agentes te necesitan» con la voz nueva. `agente`
   * graba sus frases en segundo plano y cambia la voz al terminar. Elegir la
   * voz que ya tiene lo cancela; volver a elegir una que falló lo reintenta.
   */
  elegir(x: unknown): ResultadoElegir {
    const p = (x && typeof x === "object" ? x : {}) as { quien?: unknown; voz?: unknown; agenteId?: unknown; corto?: unknown; empresa?: unknown };
    const e = this.eleccion();
    const mal = (motivo: NonNullable<ResultadoElegir["motivo"]>): ResultadoElegir => ({ ok: false, motivo, eleccion: e });
    if (p.quien === "resumen" && esVozLectura(p.voz)) {
      e.resumen = p.voz;
      this.guardarEleccion(e);
      this.alinearResumen();
      return { ok: true, eleccion: e };
    }
    if (p.quien === "contexto" && (p.voz === "igual" || esVozLectura(p.voz))) {
      e.contexto = p.voz;
      this.guardarEleccion(e);
      return { ok: true, eleccion: e };
    }
    if (p.quien !== "agente" || !corto(p.agenteId, 80) || !vozPorId(p.voz) || !corto(p.corto, LETRAS_NOMBRE) || !corto(p.empresa, LETRAS_NOMBRE)) return mal("pedido");
    const agenteId = p.agenteId as string;
    const voz = p.voz as VozId;
    const indice = this.indice();
    const actual = indice?.agentes[agenteId] ?? null;
    if (!indice || !actual) return mal("pedido");
    const ya = this.grupos.find((g) => g.agenteId === agenteId);
    // La de antes (o la que ya se está grabando): se cancela lo que se grababa, o no hay nada que hacer.
    if (voz === actual) {
      if (ya) this.quitarGrupo(ya);
      this.olvidarAgente(e, agenteId, actual);
      this.guardarEleccion(e);
      return { ok: true, eleccion: e };
    }
    if (ya && ya.voz === voz && !ya.error) return { ok: true, eleccion: e };
    const agente = { id: agenteId, nombre: p.corto as string, empresa: p.empresa as string };
    const trabajos = trabajosDeAgente(agente, voz).map((t) => ({ voz: t.voz as VozTrabajo, texto: t.texto, archivo: t.archivo }));
    // Si su motor no se puede usar aquí (sin `uv` o `ffmpeg`, o Supertonic sin bajar), solo las que ya tiene grabadas.
    if (!this.motorListo(motorDe(voz)) && trabajos.some((t) => !existsSync(join(this.dirVoces, t.archivo)))) return mal("sin-mac");
    if (ya) this.quitarGrupo(ya);
    if (!e.originales[agenteId]) e.originales[agenteId] = { voz: actual, corto: p.corto as string, empresa: p.empresa as string };
    e.pendientes[agenteId] = { voz, corto: p.corto as string, empresa: p.empresa as string };
    this.guardarEleccion(e);
    this.grupos.push({ id: `agente:${agenteId}`, quien: "agente", agenteId, voz, anterior: actual, trabajos, nuevos: this.faltan(trabajos), intentos: new Map(), error: false, esperaMac: false, arrancado: false });
    this.avanzar();
    return { ok: true, eleccion: this.eleccion() };
  }

  /** «Volver a como estaba»: Alex, Dora y cada agente con la voz que tenía. */
  reiniciar(): ResultadoElegir {
    const antes = this.eleccion();
    const inicial = inicialesPara(antes.motores);
    const e: EleccionVoces = { ...antes, resumen: inicial.resumen, contexto: inicial.contexto };
    this.guardarEleccion(e);
    this.alinearResumen();
    let ok = true;
    for (const [agenteId, o] of Object.entries(antes.originales)) {
      const r = this.elegir({ quien: "agente", agenteId, voz: o.voz, corto: o.corto, empresa: o.empresa });
      if (!r.ok) ok = false;
    }
    return { ok, ...(ok ? {} : { motivo: "sin-mac" as const }), eleccion: this.eleccion() };
  }

  /** El agente ya no tiene nada que deshacer: ni lo que se grababa ni la voz de antes si es la misma. */
  private olvidarAgente(e: EleccionVoces, agenteId: string, actual: VozId): void {
    delete e.pendientes[agenteId];
    if (e.originales[agenteId]?.voz === actual) delete e.originales[agenteId];
  }

  /** Al abrir el worker: sigue lo que quedó a medias (agentes que se estaban grabando) y pone los avisos juntos con la voz del Resumen. */
  reanudar(): void {
    try {
      for (const [agenteId, d] of Object.entries(this.eleccion().pendientes)) this.elegir({ quien: "agente", agenteId, voz: d.voz, corto: d.corto, empresa: d.empresa });
      this.alinearResumen();
    } catch (err) {
      this.log("voces: no se pudo reanudar la elección", { error: (err as Error).message.slice(0, 300) });
    }
  }

  /**
   * Los «3 agentes te necesitan» los dice la voz del Resumen: si la elegida es
   * otra que la del índice, se piden las 100 frases (de 2 a 26 agentes) y recién
   * al terminar el índice cambia. Sin la Mac (`uv`/`ffmpeg`) queda como estaba.
   */
  private alinearResumen(): void {
    const e = this.eleccion();
    const indice = this.indice();
    const ya = this.grupos.find((g) => g.quien === "resumen");
    if (!indice || !esAlMomento(e.resumen) || indice.resumen === e.resumen) {
      if (ya) this.quitarGrupo(ya);
      return;
    }
    if (ya && ya.voz === e.resumen && !ya.error) return;
    if (ya) this.quitarGrupo(ya);
    if (!this.motorListo(motorDe(e.resumen))) return;
    const trabajos = trabajosAvisosJuntos(Object.keys(indice.agentes).length, e.resumen).map((t) => ({ voz: t.voz as VozTrabajo, texto: t.texto, archivo: t.archivo }));
    this.grupos.push({ id: "resumen", quien: "resumen", agenteId: null, voz: e.resumen, anterior: indice.resumen, trabajos, nuevos: this.faltan(trabajos), intentos: new Map(), error: false, esperaMac: false, arrancado: false });
    this.avanzar();
  }

  /** Los archivos que todavía no están grabados. */
  private faltan(trabajos: ReadonlyArray<{ archivo: string }>): Set<string> {
    return new Set(trabajos.map((t) => t.archivo).filter((a) => !existsSync(join(this.dirVoces, a))));
  }

  /** Saca un grupo (se canceló): lo que no empezó sale de las filas. */
  private quitarGrupo(g: GrupoVoz): void {
    this.grupos = this.grupos.filter((x) => x !== g);
    for (const f of FILAS) {
      this.filas[f] = this.filas[f].filter((t) => {
        if (t.grupo !== g.id) return true;
        this.enCurso.delete(t.archivo);
        return false;
      });
    }
    this.avanzar();
  }

  /** El grupo que graba ahora: el primero que no falló. */
  private activo(): GrupoVoz | undefined {
    return this.grupos.find((g) => !g.error);
  }

  /** Arranca el grupo que toca y confirma los que ya están completos (cada voz nueva se escribe en el índice de una vez). */
  private avanzar(): void {
    for (let g = this.activo(); g; g = this.activo()) {
      if (!g.arrancado) {
        g.arrancado = true;
        for (const t of g.trabajos) {
          if (this.encolar(t.voz, t.texto, false, { archivo: t.archivo, grupo: g.id }) === "no") {
            g.error = true;
            this.log("voces: no se puede grabar una voz nueva", { voz: g.voz, agente: g.agenteId });
            break;
          }
        }
        if (g.error) continue;
        for (const f of FILAS) void this.correr(f);
      }
      if (!g.trabajos.every((t) => existsSync(join(this.dirVoces, t.archivo)))) return;
      this.confirmar(g);
      this.grupos = this.grupos.filter((x) => x !== g);
    }
  }

  /** Están todas las frases: la voz nueva se escribe en `indice.json` y el agente cambia de una vez. */
  private confirmar(g: GrupoVoz): void {
    const indice = this.indice();
    if (!indice) return;
    if (g.quien === "agente" && g.agenteId) indice.agentes[g.agenteId] = g.voz;
    else indice.resumen = g.voz;
    for (const t of g.trabajos) indice.audios[claveAudio(t.voz.id, t.texto)] = t.archivo;
    this.guardarIndice(indice);
    const e = this.eleccion();
    if (g.quien === "agente" && g.agenteId) this.olvidarAgente(e, g.agenteId, g.voz);
    this.guardarEleccion(e);
    this.log("voces: voz nueva lista", { voz: g.voz, agente: g.agenteId, frases: g.trabajos.length });
  }

  /** Terminó una frase de un grupo: se confirma si era la última; si falló, se vuelve a probar (hasta 3 veces); un clon sin la Mac, más tarde y sin contar. */
  private trabajoTerminado(t: TrabajoVoz, r: "ok" | "falla" | "sin-mac"): void {
    if (!t.grupo) return;
    const g = this.grupos.find((x) => x.id === t.grupo);
    if (!g) return;
    if (r === "ok") {
      this.avanzar();
      return;
    }
    if (r === "sin-mac") {
      g.esperaMac = true;
      this.reintentarLuego(REINTENTO_CLON_MS);
      return;
    }
    const n = (g.intentos.get(t.archivo) ?? 0) + 1;
    g.intentos.set(t.archivo, n);
    if (n >= INTENTOS_GRUPO) {
      g.error = true;
      this.log("voces: no se pudo grabar una voz nueva", { voz: g.voz, agente: g.agenteId, frase: t.texto.slice(0, 60) });
      this.avanzar();
    } else this.reintentarLuego(REINTENTO_MS);
  }

  private reintentarLuego(ms: number): void {
    if (this.reintento) return;
    this.reintento = setTimeout(() => {
      this.reintento = null;
      const g = this.activo();
      if (!g) return;
      g.esperaMac = false;
      for (const t of g.trabajos) if ((g.intentos.get(t.archivo) ?? 0) < INTENTOS_GRUPO) this.encolar(t.voz, t.texto, false, { archivo: t.archivo, grupo: g.id });
      for (const f of FILAS) void this.correr(f);
    }, ms);
    this.reintento.unref?.();
  }

  // -------------------------------------------------------------------------
  // «Preparar voces» desde la oficina (0.13.0, issue #9)
  // -------------------------------------------------------------------------

  /**
   * Lo que manda la página: con `empezar` (el botón «Preparar voces»), los
   * motores elegidos, que quedan en `eleccion.json` junto con «al día»; y
   * siempre, los agentes que ve. Si las voces están al día, baja lo que falte y
   * graba en segundo plano lo de los agentes nuevos o con otro nombre. Responde
   * al tiro, con cómo va (el panel lo vuelve a preguntar con `voz-estado`).
   */
  alDia(x: unknown): { ok: boolean; motivo?: "pedido"; eleccion: EleccionVoces } & EstadoMotores {
    const p = (x && typeof x === "object" ? x : {}) as { agentes?: unknown; motores?: unknown; empezar?: unknown };
    const e = this.eleccion();
    const lista = validarAgentes(p.agentes ?? []);
    const motores = p.empezar === true ? leerMotores(p.motores) : null;
    if (!lista || (p.empezar === true && !motores)) {
      if (!lista) this.log("voces: agentes que no se entienden (forma o topes)", {});
      return { ok: false, motivo: "pedido", eleccion: e, ...this.estadoMotores() };
    }
    if (motores) {
      e.motores = motores;
      e.alDia = true;
      // Quien lee el Resumen o «Leer contexto» con un motor que no se eligió pasa a uno de los elegidos.
      const inicial = inicialesPara(motores);
      if (e.resumen !== "navegador" && !motores.includes(grupoDe(motorDe(e.resumen)))) e.resumen = inicial.resumen;
      if (e.contexto !== "navegador" && e.contexto !== "igual" && !motores.includes(grupoDe(motorDe(e.contexto)))) e.contexto = inicial.contexto;
      this.guardarEleccion(e);
      if (this.prep.fase === "error" || this.prep.fase === "listo") this.prep = { ...this.prep, fase: "nada", motivo: null };
    }
    for (const a of lista) this.agentesVistos.set(a.id, a);
    if (e.alDia && e.motores) void this.prepararTodo();
    return { ok: true, eleccion: e, ...this.estadoMotores() };
  }

  /** Una pasada a la vez: si llega otro pedido mientras tanto, se hace otra al terminar. */
  private prepararTodo(): Promise<void> {
    if (this.preparando) {
      this.otraVez = true;
      return this.preparando;
    }
    this.preparando = this.unaPasada()
      .catch((err: unknown) => {
        this.prep = { ...this.prep, fase: "error", motivo: (err as Error).message.slice(0, 300) };
        this.log("voces: no se pudieron preparar", { error: (err as Error).message.slice(0, 300) });
      })
      .finally(() => {
        this.preparando = null;
        if (this.otraVez) {
          this.otraVez = false;
          void this.prepararTodo();
        }
      });
    return this.preparando;
  }

  private async unaPasada(): Promise<void> {
    const e = this.eleccion();
    const elegidos = e.motores;
    if (!e.alDia || !elegidos) return;
    // 1. Los modelos que falten (una vez): Supertonic (145 MB) y Kokoro (354 MB).
    for (const [grupo, modelo] of [["supertonic", MODELO_SUPERTONIC], ["kokoro", MODELO_KOKORO]] as const) {
      if (!elegidos.includes(grupo) || this.hayModelo(modelo)) continue;
      // Sin con qué correrlo, no se baja.
      if (grupo === "supertonic" ? this.problemaSupertonic() : this.problemaPython()) continue;
      this.prep = { ...this.prep, fase: "bajando", modelo: modelo.nombre, bajado: 0, pesa: pesoModelo(modelo), motivo: null };
      this.log("voces: bajando un modelo", { modelo: modelo.nombre, mb: Math.round(pesoModelo(modelo) / 1e6) });
      try {
        await this.bajar(modelo, (bajado, pesa) => (this.prep = { ...this.prep, bajado, pesa }));
      } catch (err) {
        this.prep = { ...this.prep, fase: "error", motivo: `No se pudo bajar ${modelo.nombre}: ${(err as Error).message.slice(0, 200)}` };
        this.log("voces: no se pudo bajar un modelo", { modelo: modelo.nombre, error: (err as Error).message.slice(0, 300) });
        return;
      }
    }
    // 2. A los nuevos, una voz de los motores elegidos que se pueden usar aquí; quien ya tiene una se queda con ella.
    const listos = elegidos.filter((g) => vocesDe([g]).some((v) => this.motorListo(v.motor)));
    if (listos.length === 0) {
      this.prep = { ...this.prep, fase: "error", motivo: GRUPOS_MOTOR.filter((g) => elegidos.includes(g)).map((g) => this.porQueNo(g)).filter(Boolean)[0] ?? "Ningún motor elegido se puede usar en este computador" };
      return;
    }
    const candidatas = vocesDe(listos);
    const previo = this.indice();
    const indice: IndiceVoces = previo ?? { version: 1, generado: "", resumen: candidatas.some((v) => v.id === e.resumen) ? (e.resumen as VozId) : inicialesPara(listos).resumen, agentes: {}, audios: {} };
    const agentes = [...this.agentesVistos.values()];
    const nuevas = asignarVoces(indice.agentes, agentes, candidatas);
    let cambio = !previo || Object.entries(nuevas).some(([id, v]) => indice.agentes[id] !== v);
    indice.agentes = { ...indice.agentes, ...nuevas };
    // 3. Las frases de los agentes que se ven, las sueltas de esas voces y los resúmenes. Lo que ya está entra al índice.
    const trabajos = planVoces(agentes, indice.agentes, indice.resumen, candidatas, Object.keys(indice.agentes).length);
    const faltan: typeof trabajos = [];
    let sinMotor = 0;
    for (const t of trabajos) {
      const k = claveAudio(t.voz.id, t.texto);
      if (existsSync(join(this.dirVoces, t.archivo))) {
        if (indice.audios[k] !== t.archivo) {
          indice.audios[k] = t.archivo;
          cambio = true;
        }
      } else if (!elegidos.includes(grupoDe(t.voz.motor)) || !this.motorListo(t.voz.motor)) sinMotor += 1;
      else faltan.push(t);
    }
    if (cambio) this.guardarIndice(indice);
    // Los «3 agentes te necesitan» con la voz elegida para el Resumen, si cambió.
    this.alinearResumen();
    let enFila = 0;
    for (const t of faltan) {
      // Ya lo está grabando otra cosa (una voz nueva elegida para un agente): entra al índice en la próxima pasada.
      if (this.enCurso.has(t.archivo)) continue;
      if (this.encolar(t.voz as VozTrabajo, t.texto, false, { archivo: t.archivo, preparar: claveAudio(t.voz.id, t.texto) }) !== "fila") continue;
      this.pendientesPrep.add(t.archivo);
      enFila += 1;
    }
    this.prep =
      this.prep.fase === "grabando"
        ? { ...this.prep, total: this.prep.hechas + this.prep.fallas + this.pendientesPrep.size, sinMotor }
        : { fase: this.pendientesPrep.size > 0 ? "grabando" : "listo", modelo: null, bajado: 0, pesa: 0, hechas: 0, total: this.pendientesPrep.size, fallas: 0, sinMotor, motivo: null };
    if (enFila > 0) this.log("voces: preparando", { frases: enFila, agentes: agentes.length, sinMotor });
    for (const f of FILAS) void this.correr(f);
  }

  /** Terminó una frase de «Preparar voces»: entra al índice (de a varias, cada 2 s) y cuenta para el avance. */
  private preparada(t: TrabajoVoz, ok: boolean): void {
    if (ok && t.preparar) this.porAnotar.set(t.preparar, t.archivo);
    this.pendientesPrep.delete(t.archivo);
    if (this.prep.fase === "grabando") {
      this.prep = ok ? { ...this.prep, hechas: this.prep.hechas + 1 } : { ...this.prep, fallas: this.prep.fallas + 1 };
      if (this.pendientesPrep.size === 0) {
        this.prep = { ...this.prep, fase: "listo" };
        this.log("voces: preparadas", { hechas: this.prep.hechas, fallas: this.prep.fallas });
      }
    }
    if (this.prep.fase !== "grabando") return this.anotarPreparadas();
    this.anotarLuego ??= setTimeout(() => this.anotarPreparadas(), 2_000);
    this.anotarLuego.unref?.();
  }

  private anotarPreparadas(): void {
    if (this.anotarLuego) clearTimeout(this.anotarLuego);
    this.anotarLuego = null;
    if (this.porAnotar.size === 0) return;
    const indice = this.indice();
    if (!indice) return;
    for (const [k, archivo] of this.porAnotar) indice.audios[k] = archivo;
    this.porAnotar.clear();
    this.guardarIndice(indice);
  }

  /** Por qué no se puede usar un motor aquí, o `null`. A Supertonic y Kokoro les puede faltar el modelo (se baja al preparar). */
  private porQueNo(g: GrupoMotor): string | null {
    if (g === "supertonic") return this.problemaSupertonic();
    return this.problemaPython();
  }

  /** Lo que el panel muestra en «Preparar voces». */
  estadoMotores(): EstadoMotores {
    const motores = Object.fromEntries(GRUPOS_MOTOR.map((g) => [g, this.porQueNo(g)])) as Record<GrupoMotor, string | null>;
    const falta = (m: Modelo) => (this.hayModelo(m) ? 0 : pesoModelo(m));
    return { motores, porBajar: { supertonic: falta(MODELO_SUPERTONIC), kokoro: falta(MODELO_KOKORO) }, preparar: { ...this.prep } };
  }

  /** Lo que se está grabando, en el orden de la cola, para que la página muestre «Grabando 12 de 20 · sigue con Alex». */
  grabando(): GrabandoVoz[] {
    const activo = this.activo();
    return this.grupos.map((g) => ({
      quien: g.quien,
      agenteId: g.agenteId,
      voz: g.voz,
      sigueCon: g.anterior,
      hechas: [...g.nuevos].filter((a) => existsSync(join(this.dirVoces, a))).length,
      total: g.nuevos.size,
      enCola: !g.error && g !== activo,
      esperaMac: g.esperaMac && g === activo,
      error: g.error,
    }));
  }

  /** Lo que ve el panel «Voces» de este worker: si se puede, lo elegido, lo que se está grabando y (0.13.0) cómo va «Preparar voces». */
  estadoElegir(): EstadoVoz & EstadoMotores & { eleccion: EleccionVoces; grabando: GrabandoVoz[]; cambios: boolean } {
    const eleccion = this.eleccion();
    return { ...this.estado(), ...this.estadoMotores(), eleccion, grabando: this.grabando(), cambios: hayCambios(eleccion, this.indice()?.agentes ?? null) };
  }

  /**
   * Abre el motor de esa voz antes de leer (punto 3 del spike de JST-323): la
   * página lo pide al abrir el menú del Resumen o al tocar «Leer contexto». Solo
   * las que leen al momento, y solo si se puede en esta Mac.
   */
  calentar(voz: unknown): boolean {
    const v = vozPorId(voz);
    if (!v || !esAlMomento(v.id) || !this.motorListo(v.motor)) return false;
    this.calentarMotor(filaDe(v.motor), v.motor);
    return true;
  }

  /** Cuánto dura un audio de la carpeta de las voces (ms), o `null` si no se sabe. */
  private duracion(archivo: string): number | null {
    try {
      return duracionAudio(readFileSync(join(this.dirVoces, archivo)));
    } catch {
      // Sin el archivo: sin duración.
      return null;
    }
  }

  /**
   * Un clon que dura demasiado para su texto (JST-255; Qwen3 a veces repite el
   * comienzo al final) se borra y no se anota: la página dice la frase de
   * siempre y, si la vuelve a pedir, se hace otra vez. `true` si se borró.
   */
  private botarSiLargo(archivo: string, motor: Motor, texto: string, ms: number | null): boolean {
    if (filaDe(motor) !== "clon" || ms === null) return false;
    const tope = maximoAudioMs(paraDecir(texto, motor));
    if (ms <= tope) return false;
    rmSync(join(this.dirVoces, archivo), { force: true });
    this.despublicar(archivo);
    this.log("voces: un clon dura demasiado para su texto, se bota", { archivo, segundos: ms / 1000, tope: tope / 1000 });
    return true;
  }

  private leerVivo(): IndiceVivo {
    try {
      const leido = JSON.parse(readFileSync(join(this.dirVoces, "vivo.json"), "utf8")) as IndiceVivo;
      if (leido?.version === 1 && leido.audios) return leido;
    } catch {
      // Primera vez, o roto: se arma de nuevo.
    }
    return { version: 1, audios: {} };
  }

  private escribirVivo(indice: IndiceVivo): void {
    const ruta = join(this.dirVoces, "vivo.json");
    writeFileSync(`${ruta}.parcial`, JSON.stringify(indice));
    renameSync(`${ruta}.parcial`, ruta);
    this.publicar("vivo.json");
  }

  /** Lo hecho queda en `vivo.json` (escrito aparte y renombrado), y se limpia lo viejo. */
  private anotar(t: TrabajoVoz, ms: number | null): void {
    const indice = this.leerVivo();
    indice.audios[t.archivo] = { voz: t.voz.id, texto: t.texto, creado: new Date(this.ahora()).toISOString(), ms };
    limpiarVivo(join(this.dirVoces, CARPETA_VIVO), this.ahora(), (archivo) => {
      delete indice.audios[`${CARPETA_VIVO}/${archivo}`];
      this.despublicar(`${CARPETA_VIVO}/${archivo}`);
    });
    this.escribirVivo(indice);
  }

  /**
   * Al arrancar (JST-255): los clones que ya estaban guardados y duran
   * demasiado para su texto (los de antes de este tope, como los de 36 s de
   * la QA de la 0.8.0) se borran; se vuelven a hacer cuando se pidan.
   */
  private botarLargosGuardados(): void {
    if (!existsSync(join(this.dirVoces, "vivo.json"))) return;
    const indice = this.leerVivo();
    let botados = 0;
    for (const [archivo, a] of Object.entries(indice.audios)) {
      const voz = vozPorId(a.voz);
      if (!voz || typeof a.ms !== "number" || !this.botarSiLargo(archivo, voz.motor, a.texto, a.ms)) continue;
      delete indice.audios[archivo];
      botados += 1;
    }
    if (botados > 0) this.escribirVivo(indice);
  }

  /**
   * «Empecé» con la tarea (JST-194) o «te necesito» con la pregunta (0.8.0): la
   * pone en su fila, delante, y responde cuando está hecha o a los `ms` (como
   * mucho 25 s: la página vuelve a preguntar si espera más). «lista»: ya está;
   * «no»: no se puede hacer (sin voz, sin uv o ffmpeg, falló o se saltó; un
   * clon con la Mac cargada); «tarde»: no alcanzó.
   */
  async esperar(x: unknown, ms: number): Promise<"lista" | "no" | "tarde"> {
    const r = this.preparar([x]);
    if (r.listas > 0) return "lista";
    if (r.enFila === 0) return "no";
    const p = validarPedido(x)!;
    const archivo = archivoVivo(vozPorId(this.indice()?.agentes[p.agenteId])!.id, textoPedido(p)!);
    const hecha = () => existsSync(join(this.dirVoces, archivo));
    for (let t = 0; t < Math.min(ms, ESPERA_MAX_MS); t += MIRAR_MS) {
      await new Promise((ok) => setTimeout(ok, MIRAR_MS));
      if (hecha()) return "lista";
      if (!this.enCurso.has(archivo)) return "no";
    }
    return hecha() ? "lista" : "tarde";
  }

  /** Paperclip se apaga o reinicia el worker: se cierran los motores (la fila se pierde; la página vuelve a pedir). */
  cerrar(): void {
    this.anotarPreparadas();
    for (const f of FILAS) this.filas[f] = [];
    if (this.reintento) clearTimeout(this.reintento);
    this.reintento = null;
    this.motores.cerrarTodos();
  }
}

/**
 * Borra lo de más de 7 días y, si la carpeta pasa de ~200 MB, lo más viejo
 * hasta quedar bajo el tope. `alBorrar`: el nombre de cada archivo que se va.
 */
export function limpiarVivo(dir: string, ahora: number, alBorrar: (archivo: string) => void = () => undefined): void {
  let lista: Array<{ f: string; t: number; b: number }>;
  try {
    lista = readdirSync(dir)
      .filter((f) => /\.(mp3|wav)$/.test(f))
      .map((f) => {
        const s = statSync(join(dir, f));
        return { f, t: s.mtimeMs, b: s.size };
      });
  } catch {
    return;
  }
  lista.sort((a, b) => a.t - b.t);
  let total = lista.reduce((s, x) => s + x.b, 0);
  for (const x of lista) {
    if (ahora - x.t <= VIVO_DIAS_MS && total <= VIVO_MAX_BYTES) continue;
    rmSync(join(dir, x.f), { force: true });
    total -= x.b;
    alBorrar(x.f);
  }
}

/** El entorno de los motores: el `PATH` con que arrancó Paperclip y lo que `uv` necesita (el worker no recibe `HOME`). */
function entorno(): NodeJS.ProcessEnv {
  return { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: homedir(), TMPDIR: tmpdir(), LANG: "en_US.UTF-8", PYTHONUNBUFFERED: "1" };
}

/**
 * 0.13.0: `null` si el motor de Supertonic arranca en este computador (carga
 * sherpa-onnx-node, sin el modelo); si no, por qué. sherpa-onnx-node es una
 * dependencia opcional: npm la instala con el binario de la Mac, Linux o
 * Windows (x64 y arm64) que corresponda, y en otro sistema falta.
 */
export function problemaSupertonic(raiz: string): string | null {
  const motor = motorSupertonic(raiz);
  if (!existsSync(motor)) return "falta dist/motor_supertonic.mjs (npm run build)";
  const p = problemaCon(process.execPath, [motor, "--probar"], entorno());
  if (!p) return null;
  return /sherpa-onnx/i.test(p) ? `sherpa-onnx-node no está instalado para ${process.platform}-${process.arch}` : p.replace(process.execPath, "node");
}

/** Swap libre (MB) según `sysctl vm.swapusage` (macOS), o `null` si no se sabe. */
function swapLibreMb(): number | null {
  try {
    const s = execFileSync("sysctl", ["-n", "vm.swapusage"], { encoding: "utf8", timeout: 2_000 });
    const m = /free = ([\d.]+)M/.exec(s);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

const swapAlcanza = (libre: number | null) => libre === null || libre >= 512;

/**
 * Se puede empezar un clon: la carga de 1 min **y** la de 5 min no pasan de 2
 * procesos por núcleo esperando, y quedan al menos 512 MB de swap libre. Con
 * la de 5 min, que la de 1 baje un momento del tope no basta (JST-198).
 */
export function clonesSeguros(carga: readonly number[] = loadavg(), nucleos = cpus().length, libre = swapLibreMb()): boolean {
  return Math.max(carga[0]!, carga[1]!) <= nucleos * 2 && swapAlcanza(libre);
}

/**
 * Un clon que ya empezó sigue mientras la carga de 1 min sin contarlo a él
 * (`propio`: los núcleos que usa su motor) no pase de 2 por núcleo y quede
 * swap. Así no se corta solo por lo que él mismo suma.
 */
export function clonSigue(carga1: number, propio: number, nucleos: number, libre: number | null): boolean {
  return carga1 - propio <= nucleos * 2 && swapAlcanza(libre);
}

/**
 * Los núcleos que usan un proceso y sus hijos (`uv` y su Python), de la salida
 * de `ps -A -o pid=,ppid=,%cpu=` (con el idioma en español, «66,0»).
 */
export function nucleosDe(ps: string, pid: number): number {
  const cpu = new Map<number, number>();
  const hijos = new Map<number, number[]>();
  for (const linea of ps.split("\n")) {
    const [p, padre, uso] = linea.trim().split(/\s+/).map((x) => Number(x.replace(",", ".")));
    if (!Number.isFinite(p) || !Number.isFinite(padre) || !Number.isFinite(uso)) continue;
    cpu.set(p!, uso!);
    hijos.set(padre!, [...(hijos.get(padre!) ?? []), p!]);
  }
  let total = 0;
  const vistos = new Set<number>();
  for (const pendientes = [pid]; pendientes.length > 0; ) {
    const p = pendientes.pop()!;
    if (vistos.has(p)) continue;
    vistos.add(p);
    total += cpu.get(p) ?? 0;
    pendientes.push(...(hijos.get(p) ?? []));
  }
  return total / 100;
}

/** Lo que usa ahora el motor de los clones, o 0 si no se sabe (entonces cuenta toda la carga). */
function nucleosDelMotor(pid: number | undefined): number {
  if (!pid) return 0;
  try {
    return nucleosDe(execFileSync("ps", ["-A", "-o", "pid=,ppid=,%cpu="], { encoding: "utf8", timeout: 2_000 }), pid);
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Los procesos de los motores
// ---------------------------------------------------------------------------

interface Abierto {
  motor: Motor;
  hijo: ChildProcessWithoutNullStreams;
  tmp: string;
  /** La frase que espera su respuesta. */
  espera: { salida: string; ok: () => void; mal: (e: Error) => void; reloj: ReturnType<typeof setTimeout> } | null;
  dormir: ReturnType<typeof setTimeout> | null;
}

/** Un proceso abierto por fila (el modelo queda cargado entre frases), que se cierra si no tiene trabajo. */
class Motores {
  private readonly abiertos = new Map<Fila, Abierto>();

  constructor(
    private readonly raiz: string,
    private readonly log: (m: string, d?: Record<string, unknown>) => void,
  ) {}

  private abrir(fila: Fila, motor: Motor): Abierto {
    const ya = this.abiertos.get(fila);
    if (ya && ya.motor === motor && ya.hijo.exitCode === null && !ya.hijo.killed) {
      if (ya.dormir) clearTimeout(ya.dormir);
      ya.dormir = null;
      return ya;
    }
    // La fila de los clones cambia de motor: el anterior se cierra (uno a la vez, por la memoria).
    if (ya) this.cerrar(fila);
    // En su propio grupo de procesos: al matarlo se mata también el Python que abre `uv` (si no, sigue andando solo).
    // En Windows no hay grupos (y `detached` le abriría una ventana): solo se oculta.
    const { programa, args } = comandoMotor(this.raiz, motor, "-");
    const hijo = spawn(programa, args, { stdio: ["pipe", "pipe", "pipe"], env: entorno(), detached: process.platform !== "win32", windowsHide: true });
    try {
      if (hijo.pid) setPriority(hijo.pid, 10);
    } catch {
      // Sin permiso para bajar la prioridad: sigue igual.
    }
    const a: Abierto = { motor, hijo, tmp: mkdtempSync(join(tmpdir(), `oficina-vivo-${motor}-`)), espera: null, dormir: null };
    let error = "";
    hijo.stderr.on("data", (b: Buffer) => (error = `${error}${b.toString()}`.slice(-1500)));
    createInterface({ input: hijo.stdout }).on("line", (linea) => {
      let r: { salida?: string; error?: string };
      try {
        r = JSON.parse(linea) as typeof r;
      } catch {
        return;
      }
      const e = a.espera;
      if (!e || r.salida !== e.salida) return;
      a.espera = null;
      clearTimeout(e.reloj);
      if (r.error) e.mal(new Error(r.error));
      else e.ok();
    });
    hijo.on("close", (codigo) => {
      if (this.abiertos.get(fila) === a) this.abiertos.delete(fila);
      rmSync(a.tmp, { recursive: true, force: true });
      if (a.espera) {
        clearTimeout(a.espera.reloj);
        a.espera.mal(new Error(`${motor} terminó con ${codigo}: ${error.trim().split("\n").slice(-2).join(" ")}`));
        a.espera = null;
      }
    });
    this.abiertos.set(fila, a);
    this.log("voces: motor abierto", { motor });
    return a;
  }

  /** Una frase: el motor la escribe en su carpeta temporal y ffmpeg la deja lista en `destino`. */
  async generar(t: TrabajoVoz, destino: string, cortar: AbortSignal): Promise<void> {
    const fila = filaDe(t.voz.motor);
    const a = this.abrir(fila, t.voz.motor);
    const salida = join(a.tmp, `${t.archivo.split("/").pop()!.replace(/\.(mp3|wav)$/, "")}${t.voz.motor === "edge" ? ".edge.mp3" : ".wav"}`);
    // Las mascotas (0.6.0): una voz de Edge más aguda y a su ritmo.
    const tono = t.voz.pitch || t.voz.rate ? { pitch: t.voz.pitch ?? "+0Hz", rate: t.voz.rate ?? "+0%" } : {};
    const trabajo = { texto: paraDecir(t.texto, t.voz.motor), salida, ...datosDeVoz(this.raiz, t.voz.motor, t.voz.clave), ...tono };
    await new Promise<void>((ok, mal) => {
      const listo = () => {
        clearTimeout(reloj);
        cortar.removeEventListener("abort", alCortar);
      };
      // Tope de 3 min por frase, o antes si se corta: se mata el proceso (la próxima frase abre otro).
      const matar = (e: Error) => {
        listo();
        a.espera = null;
        mal(e);
        matarGrupo(a.hijo);
      };
      const alCortar = () => matar(cortar.reason instanceof Error ? cortar.reason : new Error("cortada"));
      const reloj = setTimeout(() => matar(new Error(`más de ${TOPE_FRASE_MS / 1000} s`)), TOPE_FRASE_MS);
      cortar.addEventListener("abort", alCortar, { once: true });
      a.espera = { salida, ok: () => (listo(), ok()), mal: (e) => (listo(), mal(e)), reloj };
      a.hijo.stdin.write(`${JSON.stringify(trabajo)}\n`);
    });
    try {
      dejarListo(t.voz.motor, salida, destino, entorno());
    } finally {
      rmSync(salida, { force: true });
    }
  }

  /** Abre el motor (carga el modelo) y lo deja `ms` sin trabajo antes de cerrarlo. */
  calentar(fila: Fila, motor: Motor, ms: number): void {
    this.abrir(fila, motor);
    this.dormir(fila, ms);
  }

  /** Sin trabajo: se cierra a los `ms` (si no llega otra frase antes). */
  dormir(fila: Fila, ms: number): void {
    const a = this.abiertos.get(fila);
    if (!a) return;
    if (a.dormir) clearTimeout(a.dormir);
    a.dormir = setTimeout(() => this.cerrar(fila), ms);
    a.dormir.unref?.();
  }

  private cerrar(fila: Fila): void {
    const a = this.abiertos.get(fila);
    if (!a) return;
    this.abiertos.delete(fila);
    if (a.dormir) clearTimeout(a.dormir);
    a.hijo.stdin.end();
    // Si no termina solo en 10 s, se mata.
    setTimeout(() => a.hijo.exitCode === null && matarGrupo(a.hijo), 10_000).unref?.();
  }

  cerrarTodos(): void {
    for (const f of [...this.abiertos.keys()]) this.cerrar(f);
  }

  /** El proceso del motor abierto en esa fila (para medir lo que usa). */
  pid(fila: Fila): number | undefined {
    const a = this.abiertos.get(fila);
    return a && a.hijo.exitCode === null ? a.hijo.pid : undefined;
  }
}

/** Mata a `uv` y a todo lo que abrió (su grupo de procesos). */
function matarGrupo(hijo: ChildProcessWithoutNullStreams): void {
  try {
    if (hijo.pid && process.platform !== "win32") process.kill(-hijo.pid, "SIGKILL");
  } catch {
    // Ya no estaba el grupo.
  }
  // También a `uv` por su lado: así `killed` queda en true y la próxima frase abre otro motor.
  hijo.kill("SIGKILL");
}
