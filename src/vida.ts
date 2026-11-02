// «Vida en la oficina» (0.3.0, design-spec de JST-96, propuesta C · Pasillo),
// sin React ni DOM: dónde está cada personaje (en su escritorio, en el
// descanso o caminando), los sobres de las tareas entregadas, las
// conversaciones del descanso y las mascotas del pasillo.
//
// Hay una `Vida` por piso dibujado (la página, el widget, el TV), porque cada
// uno tiene su plano. La UI le pasa en cada dibujo el plano, los agentes y las
// opciones (`sincronizar`), le avisa de las entregas (`entrega`) y la hace
// avanzar con un solo bucle de cuadros (`paso`), que corre solo mientras algo
// se mueve (`seMueve`); si no, espera hasta `proximo`. Lo que cambia la forma
// de una sala (alguien llega, dobla, un sobre cambia de fase) sube su versión
// y la UI la vuelve a dibujar; lo que solo cambia de lugar lo mueve
// `pintarPosiciones` sin volver a montar nada.
//
// 0.3.4 (design-spec de JST-138, C · Rótulo de la sala): qué cuenta el rótulo
// de cada sala (o el de 1x, bajo el piso) en cada instante. Cambia con el
// mismo reloj: el próximo cambio entra en `proximo` y `paso` sube la versión de
// la sala cuando cambia lo que cuenta.
//
// 0.4.0 (design-spec de JST-162, B · Pregunta y respuesta): las conversaciones
// salen más seguido (ritmo «Intermedio»: cada libre del descanso busca con quién
// hablar cada 15–30 s), dicen de verdad algo de la oficina (`charlas.ts`) y se
// ven como un hilo de 2 globos: la frase anterior se queda arriba mientras llega
// la respuesta. Quien está solo dice de vez en cuando una frase suelta, y las
// mascotas responden al clic (o solas en el TV). El rótulo de la sala ya no
// cuenta la tarea de la conversación: la trae el hilo.
//
// 0.5.0 (design-spec de JST-163, A · En cada sala): quien termina bien su run
// muestra «✓ listo» 6 s en su puesto antes de irse al descanso; quien te espera
// sin trabajar hace fila frente a tu escritorio, en el descanso de su sala
// (hasta 3, el que espera hace más adelante); y una tarea que pasa a alguien
// libre en el descanso se entrega en la mesa: los dos se juntan, quien entrega
// con el sobre en la mano, y lo dicen («BET-434 → Diseño», «🤝»). Dónde tiene
// que estar cada uno sale de `deseado`: la entrega, el «✓ listo», la fila y,
// si no, su escritorio o el descanso.
//
// 0.6.0 (design-spec de JST-225, opción C del spike de JST-224): con la voz
// de las conversaciones prendida, la vida prepara la próxima conversación con
// voz un minuto antes (una pareja libre de una sala que se ve y su guion), la
// voz pide sus audios y la vida la empieza cuando están y le toca el turno
// (`VozVida`). Si no llegan en el minuto, o la pareja ya no está libre, o lo
// que iban a decir cambió, se descarta y se prepara otra. Las demás siguen
// como hoy, sin voz. También le cuenta a la voz las frases sueltas, lo que
// dicen las mascotas y las entregas.
//
// 0.7.0 (JST-232, spike de JST-230): con la IA de Chrome elegida y lista, el
// Guionista toma el final de las conversaciones y la mitad de las frases
// sueltas de la reserva que escribe la IA (`fijarIa`), y la vida le dice a la IA
// qué se puede pedir con las salas de ahora (`pedidosIa`).
//
// Solo lee: nada de esto cambia tareas ni agentes.
import {
  camaDe,
  cubierta,
  duracionSobre,
  easeInOutQuad,
  enRecorrido,
  libre,
  pasillosDe,
  piesAsiento,
  piesJunto,
  piesPuesto,
  puntosDeCharla,
  recorrido,
  rejillaDe,
  ruta,
  rutaSobre,
  salidaPuesto,
  type Direccion,
  type Pasillo,
  type Punto,
  type Recorrido,
  type Rejilla,
} from "./caminos.js";
import type { PisoPlano, SalaPlano } from "./plano.js";
import {
  ENTRE_CAMBIOS_MS,
  esAviso,
  itemDeAgente,
  nombreCorto,
  PASO_PISO_MS,
  PASO_SALA_MS,
  proximoPaso,
  QUIETO_TOQUE_MS,
  rotuloEn,
  SOBRE_MS,
  vueltaDelPiso,
  vueltaDeSala,
  type AgenteRotulo,
  type ItemRotulo,
} from "./rotulo.js";
import {
  BUSCA_MS,
  duracionFrase,
  ENTRE_FRASES_MS,
  PRIMERA_FRASE_MS,
  fraseEn,
  Guionista,
  MASCOTA_DICE_MS,
  MAX_CHARLAS,
  PAREJA_MS,
  PEDIR_TEMAS_MS,
  PRIMERA_MS,
  SALA_MS,
  SUELTA_MS,
  nombreDeCharla,
  type AgenteCharla,
  type ContextoCharla,
  type FuenteIa,
  type Guion,
  type Linea,
  type MuestraFinal,
} from "./charlas.js";
import { nombreCorto as nombreCortoVoz } from "./avisos.js";
import type { TipoEspera } from "./estado.js";
import { filaDeSalas } from "./escritorio.js";
import { altoEntrega, cajaHilo, cajasEntrega, cruzan, subirEntrega, tamanoHilo, tapaA, type CajaHilo, type CajasEntrega } from "./hilo.js";
import { CACHE_TEMAS_MS, type Temas } from "./temas.js";
import type { Dibujo } from "./vista.js";

/** Pixeles de arte por segundo al caminar (80 px/s a 2x, 120 a 3x). */
export const VELOCIDAD = 40;
/** Cuántos caminan a la vez en todo el piso y por sala. Con el cupo lleno, el que sigue espera su turno donde está (JST-137). */
export const MAX_PISO = 8;
export const MAX_SALA = 3;

const LLEGA_MS = 270;
const ABRE_MS = 340;
/** El sobre espera en un escritorio vacío hasta 60 s desde que llegó. */
export const ESPERA_SOBRE_MS = 60_000;
/** Con movimiento reducido, el sobre se va 4 s después de que quien recibe está sentado. */
const RM_SOBRE_MS = 4_000;

/** Al abrir (o al volver a la pestaña), los que ya están en el descanso buscan pareja a los 5–10 s (JST-162 §2.1). */
const ABRIR_MS = 2_000;
/**
 * Al volver a la pestaña, lo que trae la relectura del sincronizador (lo que
 * cambió mientras estaba oculta) aparece en su lugar. Se espera esa lectura
 * (`releyendo`), que con la red lenta del celular puede tardar unos segundos;
 * lo que cambia después camina (JST-137). Si la lectura se cuelga, a los 10 s
 * se deja de esperar.
 */
const VUELTA_QUIETA_MS = 10_000;
/** Con movimiento reducido solo conversan vecinos a 40 px o menos. */
const VECINOS_PX = 40;
/** 0.7.0: cuántas parejas de cada sala se miran para saber qué finales se le pueden pedir a la IA. */
const PAREJAS_IA = 6;

/** «✓ listo» (JST-163 §7): 6 s en su puesto; si en esos 6 s toma otra tarea, al menos 2 s. */
export const LISTO_MS = 6_000;
export const LISTO_MIN_MS = 2_000;
/** Quien entregó una tarea hace menos de esto no muestra «✓ listo»: lo cuenta la entrega. */
const ENTREGO_MS = 10_000;

/** La entrega en la mesa (JST-163 §10): 9 s juntos; quien recibe dice «🤝» desde los 1,5 s. Si en 25 s no se juntaron, se corta. */
export const JUNTOS_MS = 9_000;
export const RESPONDE_MS = 1_500;
export const JUNTARSE_MAX_MS = 25_000;
/** Cuánto dura la animación de hablar: quien entrega, 4 s; quien recibe, 2,5 s desde que responde. */
const HABLA_ENTREGA_MS = 4_000;
const HABLA_RECIBE_MS = 2_500;

export const MASCOTAS = ["gato", "perro", "conejo", "robot"] as const;
export type TipoMascota = (typeof MASCOTAS)[number];
const VEL_MASCOTA: Record<TipoMascota, number> = { gato: 22, perro: 30, conejo: 26, robot: 14 };

/** 0.6.0 (spike de JST-224): la conversación con voz se prepara un minuto antes; si sus audios no llegan en ese minuto, se descarta. */
export const PLAZO_PREPARADA_MS = 60_000;
/** Con sus audios listos, espera su turno (un aviso, otra conversación en su sala) como mucho 30 s más. */
export const GRACIA_PREPARADA_MS = 30_000;
/** Cada globo dura lo de siempre o su audio + 0,4 s, lo que sea más largo (punto 5 del spike). */
export const VOZ_EXTRA_MS = 400;
/** Un audio de más de 8 s: esa conversación no se lee (punto 5 del spike). */
export const MAX_AUDIO_MS = 8_000;
/** Sin con quién preparar una (nadie libre en el descanso), se vuelve a mirar a los 5 s. */
const REINTENTO_PREPARAR_MS = 5_000;

/** Lo que pasa en la vida y puede sonar (0.6.0). `plazo`/`ms`: ms desde ahora. */
export type HechoVoz =
  /** Que pida los audios de la próxima conversación con voz; responde con `preparadaLista` o `preparadaNo`. */
  | { tipo: "preparar"; id: number; companyId: string; lineas: readonly Linea[]; plazo: number }
  /** Ya no se espera esa conversación (se descartó): lo pedido se puede soltar. */
  | { tipo: "soltar"; id: number }
  /** Empieza la conversación con voz (se juntan y hablan): dura `ms` como mucho. */
  | { tipo: "charla"; id: number; ms: number }
  /** Aparece la frase `i` de la conversación con voz (su globo dura `ms`). */
  | { tipo: "frase"; id: number; i: number; ms: number }
  /** Terminó o se cortó la conversación con voz. */
  | { tipo: "fin-charla"; id: number }
  | { tipo: "suelta"; id: number; quien: string; companyId: string; linea: Linea; ms: number }
  /** Una mascota dice lo suyo: al tocarla o, en el TV, sola al despertar. */
  | { tipo: "mascota"; id: TipoMascota; texto: string; sola: boolean }
  /** Una entrega: `sale` con el evento (en la mesa o con sobre); `hablan` cuando se juntan en la mesa. */
  | { tipo: "entrega"; id: number; como: "mesa" | "sobre"; fase: "sale" | "hablan"; de: string; a: string; companyId: string; para: string; titulo: string | null };

/** Lo que la vida necesita de la voz (0.6.0): la UI la pone (`fijarVoz`) con las voces prendidas, la oficina a la vista y el audio desbloqueado. */
export interface VozVida {
  /** Ese tipo se lee (su casilla prendida y a la vista). */
  lee(t: "charlas" | "entregas" | "mascotas" | "sueltas"): boolean;
  /** Ya puede empezar una conversación con voz: una por minuto, 10 s después de un aviso y nadie hablando. */
  libreParaCharla(): boolean;
  hecho(h: HechoVoz): void;
}

/** Lo que la vida necesita de cada agente. */
export interface AgenteVida {
  id: string;
  companyId: string;
  prefijo: string;
  st: Dibujo;
  need: boolean;
  /** El código de la tarea de su run (el que dice su globo), para no repetirlo en el sobre. */
  codigo: string | null;
  /** Para el rótulo de la sala (JST-138): su nombre, lo primero que te pide y su run, con los nombres de las tareas. */
  nombre?: string;
  espera?: AgenteRotulo["espera"];
  run?: AgenteRotulo["run"];
  /** Para las conversaciones (JST-162 §1.2): su empresa, su cargo, su motivo, lo que te pide y desde cuándo trabaja. */
  empresa?: string;
  rol?: string | null;
  rolApi?: string | null;
  motivo?: string | null;
  esperaTipo?: TipoEspera | null;
  esperaDesde?: string | null;
  runDesde?: string | null;
  /** El run que va (0.5.0): si es el mismo que terminó, el «✓ listo» sigue sus 6 s aunque todavía se vea trabajando. */
  runId?: string | null;
}

export interface OpcionesVida {
  rm: boolean;
  /** Conversaciones y frases sueltas (el widget no tiene; el botón «Conversaciones» las apaga, JST-162 §4). */
  charlas: boolean;
  mascotas: boolean;
  /** El TV (sin mouse): las mascotas dicen lo suyo solas al despertar (JST-162 §3). */
  mascotasSolas?: boolean;
  /** La oficina todavía carga: no hay sobres, conversaciones ni mascotas. */
  cargando: boolean;
  /** Pestaña oculta: todo en pausa; al volver, cada uno aparece donde iba. */
  oculta: boolean;
  /** Al volver a la pestaña, el sincronizador todavía relee todo (`Sincronizador.releyendo`). */
  releyendo?: boolean;
  /** Prefijos del filtro por empresa (vacío: todas). El rótulo va solo en las salas que se ven (JST-138 §7). */
  filtro?: readonly string[];
}

/** Los nombres de las tareas que la página ya conoce (`TitulosConocidos`). */
export interface FuenteTitulos {
  titulo(codigo: string): string | null;
}

/** De dónde salen los temas de las conversaciones (`LectorTemas` en la página). */
export interface FuenteTemas {
  leer(agente: { id: string; companyId: string }): Promise<Temas>;
  guardado(agenteId: string): Temas | null;
}

type Lugar = "escritorio" | "descanso" | "junto" | "camino" | "charla" | "fila" | "mesa";
/** A dónde tiene que ir: su escritorio, el descanso, un lugar de tu fila (`fila:0` es el primero) o la mesa de una entrega (`mesa:<id>`). */
export type Destino = "escritorio" | "descanso" | `fila:${number}` | `mesa:${number}`;
type Hacia = Destino | "charla" | "vuelta";

const esFila = (d: string): d is `fila:${number}` => d.startsWith("fila:");
const esMesa = (d: string): d is `mesa:${number}` => d.startsWith("mesa:");

interface Camino {
  rec: Recorrido;
  d: number;
  hacia: Hacia;
}

/** Espera su turno para caminar (cupo lleno): hacia dónde, a qué asiento y si vuelve de una conversación. */
interface Turno {
  hacia: Destino;
  preferido: number | null;
  vuelta: boolean;
}

/**
 * Una entrega en la mesa (JST-163 §10): quien entrega (`de`, a la derecha de
 * la mesa, con el sobre en la mano) y quien recibe (`a`, a la izquierda) se
 * juntan, hablan 9 s y después quien recibe se lleva el sobre a su escritorio.
 */
interface Junta {
  id: number;
  prefijo: string;
  de: string;
  a: string;
  codigo: string;
  fase: "juntarse" | "hablar";
  /** Cuándo salió (25 s para juntarse) y cuándo llegaron los dos. */
  t0: number;
  tf: number;
  spots: Record<string, Punto>;
  mira: Record<string, "izq" | "der">;
  /**
   * Cuánto suben sus globos para no taparle la cabeza a nadie (JST-190) y
   * dónde quedan: se elige al llamarlos a la mesa y otra vez al juntarse.
   * Mientras dura, nadie se sienta debajo.
   */
  alto: number;
  cajas: CajasEntrega;
}

/** El sobre de una entrega en la mesa: en la mano de alguien (`con`) o sobre la mesa mientras hablan. */
interface SobreMano {
  junta: number;
  prefijo: string;
  codigo: string;
  con: string | null;
  enMesa: boolean;
  mesa: Punto;
}

interface Persona {
  id: string;
  companyId: string;
  prefijo: string;
  /** Su puesto en la sala. */
  i: number;
  st: Dibujo;
  need: boolean;
  codigo: string | null;
  nombre: string;
  espera: AgenteRotulo["espera"];
  run: AgenteRotulo["run"];
  /**
   * JST-192: la hora que decía la pastilla del rótulo antes de la última que
   * llegó (`run.hora`), y desde cuándo vale esa (−Infinity: desde siempre). El
   * globo la dice al tiro; el rótulo, recién en su próximo paso.
   */
  horaAntes: string | null;
  horaDesde: number;
  empresa: string;
  rol: string | null;
  rolApi: string | null;
  motivo: string | null;
  esperaTipo: TipoEspera | null;
  esperaDesde: string | null;
  runDesde: string | null;
  runId: string | null;
  lugar: Lugar;
  /** En la fila o en la mesa: en qué lugar (`fila:1`, `mesa:7`). */
  en: Destino | null;
  /** Pies, en pixeles de arte de la sala. */
  pos: Punto;
  dir: Direccion;
  asiento: number | null;
  camino: Camino | null;
  /** Espera su turno donde está (sentado en su escritorio, en el descanso o donde conversaba). */
  turno: Turno | null;
  charla: Charla | null;
  /** El asiento que soltó para conversar: vuelve a él si sigue libre. */
  volverA: number | null;
}

interface Charla {
  id: number;
  prefijo: string;
  a: string;
  b: string;
  lineas: Linea[];
  /** Cuánto dura cada frase (JST-162 §2.2). */
  durs: number[];
  fase: "juntarse" | "hablar";
  /** Cuándo llegaron los dos (empieza a correr la primera frase). */
  desde: number;
  mira: Record<string, "izq" | "der">;
  /** Con movimiento reducido: conversan donde están, sin caminar. */
  quieta: boolean;
  /** Qué frase se ve ahora (−1: todavía ninguna), para saber cuándo cambia. */
  viendo: number;
  /** Dónde va a ir su hilo, lo más grande que mida (JST-172): quien llega al descanso no se sienta debajo. */
  caja: CajaHilo;
  /** 0.6.0: se lee con voz (la preparada); un aviso que la corta la deja sin voz. */
  voz: boolean;
}

/** La próxima conversación con voz (0.6.0): la pareja y su guion, preparados un minuto antes. */
interface Preparada {
  id: number;
  prefijo: string;
  a: string;
  b: string;
  guion: Guion;
  desde: number;
  plazo: number;
  /** Cuánto dura el audio de cada frase, cuando están todos. */
  ms: number[] | null;
}

/** Una frase suelta de alguien solo en el descanso (JST-162 §1.6). */
interface Suelta {
  id: number;
  prefijo: string;
  quien: string;
  linea: Linea;
  t0: number;
  dur: number;
}

type FaseSobre = "vuela" | "llega" | "espera" | "abre";

interface Sobre {
  id: number;
  prefijo: string;
  a: string;
  codigo: string;
  fase: FaseSobre;
  t0: number;
  dur: number;
  rec: Recorrido | null;
  pos: Punto;
  /** Cuándo empezó la fase actual. */
  tf: number;
  /** Hasta cuándo espera (60 s desde que llegó). */
  tMax: number;
  rm: boolean;
  tSentado: number | null;
  /** Mientras vuela: por el muro (con su código abajo) o por los pasillos (sin código). */
  tramo: "muro" | "pasillo";
  /** 0.6.0: no se va antes de esto: lo que dura el audio de quien entrega + 0,4 s (JST-240). */
  vozHasta: number;
}

type ModoMascota = "caminar" | "quieto" | "gesto" | "dormir";

interface Mascota {
  id: TipoMascota;
  pasillo: Pasillo;
  cama: Punto;
  pos: Punto;
  dir: "der" | "izq";
  modo: ModoMascota;
  hasta: number;
  meta: number;
  paseos: number;
  aCama: boolean;
  /** Lo que dice al tocarla (o sola en el TV), hasta cuándo (JST-162 §3). */
  dice: { texto: string; hasta: number } | null;
}

interface SalaVida {
  plano: SalaPlano;
  rejilla: Rejilla | null;
  activa: boolean;
  /** Quién ocupa cada asiento del descanso. Estables: nadie se cambia cuando llega o se va otro. */
  asientos: Array<string | null>;
  /** Ids de los agentes en el orden de sus puestos. */
  ids: string[];
}

// ---------------------------------------------------------------------------
// Lo que lee la UI
// ---------------------------------------------------------------------------

/** Un personaje fuera de su escritorio: en el descanso, de pie junto a su escritorio, caminando o conversando. */
export interface VistaFuera {
  /** Pies, redondeados a pixeles de arte. */
  pos: Punto;
  anim: string;
  caminando: boolean;
  /** Hacia dónde camina (para el `aria-label`): «a su escritorio», «a la sala de descanso», a tu fila o a la mesa (0.5.0). */
  hacia: "escritorio" | "descanso" | "fila" | "mesa" | null;
  /** Sentado en el sofá (el globo de la conversación va 4 px más abajo). */
  sofa: boolean;
  /** Quieto en el primer cuadro de su animación: de espaldas en tu fila (JST-163 §14). */
  quieto: boolean;
  /** En tu fila: en qué lugar (0 = el primero, el único con globo). */
  fila: number | null;
  /** En una entrega en la mesa: no lleva el globo de su estado (hablan). */
  junta: boolean;
}

export interface VistaSobre {
  id: number;
  pos: Punto;
  fase: FaseSobre;
  codigo: string;
  /** Dónde va la etiqueta con el código: debajo (en el muro), arriba (esperando) o no va. */
  etiqueta: "muro" | "arriba" | null;
  /** El nombre corto de quien lo recibe, si la etiqueta lo lleva («BET-434 → Ingeniero frontend», JST-163 §10). */
  para: string | null;
}

/** El sobre de una entrega en la mesa: en la mano de quien lo lleva o sobre la mesa (JST-163 §10). */
export interface VistaSobreMano {
  id: number;
  pos: Punto;
  z: number;
  /** Lo lleva alguien que camina: se mueve en cada cuadro con él. */
  mueve: boolean;
}

/** Una entrega en la mesa mientras hablan (JST-163 §10): la frase de quien entrega y, desde los 1,5 s, el «🤝» de quien recibe. */
export interface VistaJunta {
  id: number;
  codigo: string;
  /** El nombre corto de quien recibe. */
  para: string;
  de: { id: string; pos: Punto; lado: "izq" | "der" };
  a: { id: string; pos: Punto; lado: "izq" | "der" };
  responde: boolean;
  /** Cuánto suben los dos globos (pixeles de arte) para no taparle la cabeza a quien está en el sofá o al lado (JST-190); 0: sobre los dos, con su cola. */
  alto: number;
  /** Si la frase no cabe hasta el borde del descanso: cuánto se corre a la izquierda (≤ 0) y cuánto sube sola, sobre el «🤝» (JST-214). */
  corre: number;
  encima: number;
}

/** Un globo del hilo: la frase, de quién es, a qué lado va y dónde están los pies de quien la dijo (su cola apunta ahí). */
export interface GloboHilo {
  clave: string;
  quien: string;
  linea: Linea;
  /** Como en un chat: hacia el lado de quien la dice. */
  lado: "izq" | "der";
  piesX: number;
}

/** La conversación de una sala (JST-162 §5): el hilo de hasta 2 globos sobre la pareja. */
export interface VistaCharla {
  /** La conversación (el hilo sigue montado entre una frase y otra). */
  id: number;
  /** Cambia con cada frase. */
  clave: string;
  /** Quien habla ahora (a 1x, el «…» va sobre él). */
  quien: string;
  /** Sus pies. */
  pos: Punto;
  sofa: boolean;
  /** Dónde va el hilo: al medio de los dos, sobre la cabeza más alta (pixeles de arte). */
  centro: Punto;
  /** La frase anterior, atenuada arriba (`null` en la primera). */
  anterior: GloboHilo | null;
  actual: GloboHilo;
}

/** Una frase suelta (globo de pensamiento) sobre quien está solo. */
export interface VistaSuelta {
  clave: string;
  quien: string;
  linea: Linea;
  pos: Punto;
  sofa: boolean;
}

/** Lo que muestra un rótulo (el de una sala o el de 1x). */
export interface VistaRotulo {
  item: ItemRotulo;
  /** Hay más de una cosa en la vuelta: ‹ › (o un toque) sirven. */
  navegable: boolean;
  /** No avanza solo: mouse o foco en el rótulo, o movimiento reducido (‹ › a la vista). */
  quieto: boolean;
  /** El agente cuyo globo lleva el anillo dorado (no en una conversación). */
  anillo: string | null;
}

/** Lo que el usuario hizo con un rótulo: de quién tiene el mouse encima la sala, si está quieto y en qué posición. */
interface EstadoRotulo {
  pin: string | null;
  /** El mouse está sobre el rótulo, o el foco del teclado adentro. */
  mouse: boolean;
  foco: boolean;
  /** Posición elegida en la vuelta (la que se veía al pausar, ‹ › o un toque). */
  manual: number | null;
  /** Hasta cuándo queda quieto después de un toque. */
  quietoHasta: number;
  /** El sobre o la frase que se veía al quedar quieto: sigue a la vista hasta ‹ ›, un toque o que se suelte. */
  retenido: ItemRotulo | null;
  /** Lo último que se dibujó, para saber cuándo cambia. */
  visto: string;
  /** Lo último que se dibujó: lo que sigue a la vista con la pestaña oculta (JST-158). */
  dibujado: RotuloCalculado | null;
  /** Desde cuándo se ve lo dibujado (si cambió desde otra cosa): lo que el usuario no pidió espera `ENTRE_CAMBIOS_MS` (JST-191). */
  dibujadoDesde: number;
  /** Al volver a la pestaña: lo que contaba, que sigue hasta el próximo paso de su reloj (JST-155). */
  alVolver: { item: ItemRotulo; hasta: number } | null;
}

/** Lo que cuenta un rótulo y en qué posición de la vuelta va. */
type RotuloCalculado = VistaRotulo & { indice: number | null };

/** La clave del rótulo de 1x, bajo el piso (los de las salas van por prefijo). */
export const ROTULO_PISO = "*";

export interface VistaMascota {
  id: TipoMascota;
  pos: Punto;
  cama: Punto;
  anim: string;
  dormida: boolean;
  /** Lo que dice ahora (al tocarla o sola en el TV), y a qué lado va su globo. */
  dice: string | null;
  lado: "izq" | "der";
}

/** Lo que la vida mueve sin volver a dibujar (un elemento con `style`). */
export interface ElementoMovible {
  style: { transform: string; zIndex: string };
}

const redondo = (p: Punto): Punto => ({ x: Math.round(p.x), y: Math.round(p.y) });
const ANIM_CAMINAR: Record<Direccion, string> = { der: "caminar-der", izq: "caminar-izq", arriba: "caminar-arriba", abajo: "caminar" };

export function claveDePlano(plano: PisoPlano): string {
  return `${plano.escena}:${plano.escala}:${plano.w}x${plano.h}:${plano.salas.map((s) => `${s.prefijo}@${s.x},${s.y},${s.w},${s.h},${s.puestos.length}`).join(";")}`;
}

export interface OpcionesConstructor {
  ahora?: () => number;
  /** La hora de verdad (`Date.now()`), para «lleva una hora esperando» (JST-162). */
  reloj?: () => number;
  azar?: () => number;
  temas?: FuenteTemas | null;
}

export class Vida {
  private clave = "";
  private plano: PisoPlano | null = null;
  private salas = new Map<string, SalaVida>();
  private personas = new Map<string, Persona>();
  private sobres: Sobre[] = [];
  private charlas: Charla[] = [];
  private mascotasVivas: Mascota[] = [];
  private pasillos: Pasillo[] = [];
  private op: OpcionesVida = { rm: false, charlas: true, mascotas: true, cargando: true, oculta: false };
  private sigId = 1;
  private ultimo: number | null = null;
  /** Cuándo busca con quién hablar cada libre del descanso (JST-162 §2.1). */
  private readonly busca = new Map<string, number>();
  /** Cuándo puede decir una frase suelta cada libre del descanso. */
  private readonly proxSuelta = new Map<string, number>();
  private sueltas: Suelta[] = [];
  /** Cuándo se abrió (o se volvió a la pestaña): los que están en el descanso buscan pareja antes. */
  private abierta = -Infinity;
  private readonly salaLibre = new Map<string, number>();
  private readonly ultimaPareja = new Map<string, number>();
  /** Cuándo se pidieron los temas de cada agente: como mucho una vez cada 10 min, aunque la lectura falle. */
  private readonly pedidos = new Map<string, number>();
  /** Cuándo se pidieron los últimos temas en todo el piso: una pareja por minuto como mucho. */
  private ultimoPedido = -Infinity;
  private readonly guionista = new Guionista();
  /**
   * Al volver a la pestaña, el sincronizador vuelve a leer todo y lo que cambió
   * mientras estaba oculta aparece en su lugar (§3): nadie camina hasta que
   * llega esa lectura (`trasVolver`), y como mucho hasta `quietoHasta`.
   */
  private trasVolver = false;
  private quietoHasta = -Infinity;
  /** Los que esperan su turno para caminar, en orden de llegada (JST-137). */
  private cola: string[] = [];
  /** Sube con cada `reiniciar`: una lectura de temas que vuelve tarde no arma nada sobre un plano nuevo. */
  private generacion = 0;
  private readonly versiones = new Map<string, number>();
  private versionMascotas = 0;
  private readonly oyentes = new Set<() => void>();
  /** El bucle de cuadros: se le avisa siempre, también desde `sincronizar` (que corre mientras React dibuja). */
  private despertador: (() => void) | null = null;
  private readonly elementos = new Map<string, ElementoMovible>();
  private readonly escritos = new Map<string, string>();
  private readonly ahora: () => number;
  private readonly reloj: () => number;
  private readonly azar: () => number;
  private temas: FuenteTemas | null;
  /** Lo que el usuario hizo con cada rótulo (por prefijo, o `ROTULO_PISO`). */
  private readonly rotulos = new Map<string, EstadoRotulo>();
  /** Las entregas de los últimos 6 s: el rótulo las cuenta aunque el sobre ya se haya abierto (JST-138 §1). */
  private entregas: Array<{ id: number; prefijo: string; a: string; codigo: string; t0: number }> = [];
  private versionPiso = 0;
  private titulos: FuenteTitulos | null = null;
  /** 0.5.0: quién hace fila frente a tu escritorio y en qué lugar (JST-163 §14). */
  private fila = new Map<string, number>();
  /** 0.5.0: las entregas en la mesa que van, y los sobres que se llevan en la mano (JST-163 §10). */
  private juntas: Junta[] = [];
  private sobresMano: SobreMano[] = [];
  /** 0.5.0: quién terminó bien su run, cuándo, qué tarea y qué run (JST-163 §7). */
  private readonly listos = new Map<string, { t0: number; codigo: string | null; runId: string | null }>();
  /** Cuándo entregó cada uno su última tarea: quien recién entregó no muestra «✓ listo». */
  private readonly entrego = new Map<string, number>();
  /** Los «✓ listo» que se están viendo (`id:t0`), para saber cuándo empieza o termina uno. */
  private readonly listosVistos = new Set<string>();
  /** El instante del último paso de las entregas (para ver cuándo cambian de etapa). */
  private ultimoPaso = 0;
  /** 0.6.0: la voz (o `null`: no se lee nada), la conversación preparada y cuándo preparar otra. */
  private voz: VozVida | null = null;
  private preparada: Preparada | null = null;
  private proxPreparar = -Infinity;
  /** Las parejas de una conversación con voz descartada: no se vuelven a preparar en 2 min. */
  private readonly descartadas = new Map<string, number>();
  /** 0.7.0: la reserva de la IA de Chrome que usa el Guionista (o `null`), para contarle lo que se mostró. */
  private fuenteIa: FuenteIa | null = null;

  constructor(o: OpcionesConstructor = {}) {
    this.ahora = o.ahora ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
    this.reloj = o.reloj ?? Date.now;
    this.azar = o.azar ?? Math.random;
    this.temas = o.temas ?? null;
  }

  fijarTemas(temas: FuenteTemas | null): void {
    this.temas = temas;
  }

  /** Los nombres de las tareas que la página ya conoce, para el sobre en el rótulo y la tarea dentro del hilo. */
  fijarTitulos(titulos: FuenteTitulos | null): void {
    this.titulos = titulos;
  }

  /**
   * 0.7.0 (JST-232): la reserva de la IA de Chrome (con la IA elegida y lista),
   * o `null` (las frases de siempre: el celular, el widget, el enlace para un TV,
   * la IA sin bajar, en pausa o «Frases de siempre»).
   */
  fijarIa(fuente: FuenteIa | null): void {
    this.fuenteIa = fuente;
    this.guionista.fijarIa(fuente);
  }

  /**
   * 0.7.0: lo que la IA puede escribir para este piso ahora: las frases fijas de
   * cada variante que se puede decir en sus salas (con unas parejas de cada
   * sala, porque «terminó algo» o «su cola» dependen de la pareja), los nombres
   * que no puede decir y una empresa (para las acciones del worker).
   */
  pedidosIa(): { muestras: MuestraFinal[]; nombres: string[]; empresa: string | null } {
    const nombres = new Set<string>();
    for (const p of this.personas.values()) {
      nombres.add(p.nombre);
      nombres.add(nombreDeCharla(p.nombre));
      if (p.empresa) nombres.add(p.empresa);
    }
    const muestras: MuestraFinal[] = [];
    const ahora = this.ahora();
    for (const sala of this.salas.values()) {
      if (!sala.activa) continue;
      const ids = sala.ids.filter((id) => this.personas.has(id));
      const parejas: Array<[string, string]> = [];
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) parejas.push([ids[i]!, ids[j]!]);
      for (const [x, y] of barajar(parejas, this.azar).slice(0, PAREJAS_IA)) {
        muestras.push(...this.guionista.muestras(this.contextoCharla(sala, this.personas.get(x)!, this.personas.get(y)!, ahora)));
      }
    }
    return { muestras, nombres: [...nombres], empresa: this.unaEmpresa() };
  }

  /**
   * 0.6.0: la voz de este piso, o `null` (voces apagadas, el widget, la
   * pestaña oculta, sin audio desbloqueado). Sin voz, la conversación
   * preparada se descarta y la que sonaba sigue sin voz.
   */
  fijarVoz(voz: VozVida | null): void {
    if (voz === this.voz) return;
    const antes = this.voz;
    this.voz = voz;
    if (!antes) {
      this.despertador?.();
      return;
    }
    if (this.preparada) {
      antes.hecho({ tipo: "soltar", id: this.preparada.id });
      this.preparada = null;
    }
    for (const ch of this.charlas) {
      if (!ch.voz) continue;
      ch.voz = false;
      antes.hecho({ tipo: "fin-charla", id: ch.id });
    }
    this.despertador?.();
  }

  // -------------------------------------------------------------------------
  // Suscripción (la UI vuelve a dibujar una sala cuando cambia su versión)
  // -------------------------------------------------------------------------

  suscribir = (oyente: () => void): (() => void) => {
    this.oyentes.add(oyente);
    return () => this.oyentes.delete(oyente);
  };

  version(prefijo: string): number {
    return this.versiones.get(prefijo) ?? 0;
  }

  versionDeMascotas(): number {
    return this.versionMascotas;
  }

  /** Sube cuando cambia lo que cuenta el rótulo de 1x, bajo el piso. */
  versionDelPiso(): number {
    return this.versionPiso;
  }

  private tocar(prefijo: string): void {
    this.versiones.set(prefijo, (this.versiones.get(prefijo) ?? 0) + 1);
  }

  /** Avisa a la UI (vuelve a dibujar) y al bucle. No se llama mientras React dibuja: ahí basta con subir las versiones. */
  private avisar(): void {
    for (const o of this.oyentes) o();
    this.despertador?.();
  }

  fijarDespertador(fn: (() => void) | null): void {
    this.despertador = fn;
  }

  // -------------------------------------------------------------------------
  // Entrada: plano, agentes y opciones
  // -------------------------------------------------------------------------

  /**
   * Pone al día la vida con lo que se dibuja. `activas`: las salas que se ven
   * y respondieron (ni cargando ni a oscuras). Cualquier cambio del plano, de
   * «reducir movimiento» o de la pestaña hace que todos aparezcan en su lugar.
   * Una sala que se apaga y vuelve no mueve a nadie: quien cambió mientras
   * estaba a oscuras camina cuando vuelve (JST-137).
   */
  sincronizar(plano: PisoPlano, agentes: readonly AgenteVida[], activas: ReadonlySet<string>, op: OpcionesVida): void {
    const ahora = this.ahora();
    const clave = claveDePlano(plano);
    const antes = this.op;
    this.op = op;
    let cambio = false;
    if (clave !== this.clave) {
      this.reiniciar(plano, clave, ahora);
      cambio = true;
    } else if (antes.rm !== op.rm) {
      this.ubicarTodos(ahora);
      cambio = true;
    } else if (antes.oculta && !op.oculta) {
      this.volver(ahora);
      cambio = true;
    }
    if (op.oculta && !antes.oculta) this.ultimo = null;

    // Tu fila (JST-163 §14), antes de ubicar a nadie: quien llega (al cargar, al volver) aparece en su lugar de la fila.
    if (this.calcularFila(agentes, activas)) cambio = true;

    const vistos = new Set<string>();
    for (const sala of this.salas.values()) {
      const estaba = sala.activa;
      sala.activa = activas.has(sala.plano.prefijo);
      if (estaba !== sala.activa) {
        this.tocar(sala.plano.prefijo);
        cambio = true;
        if (!sala.activa) this.apagarSala(sala);
      }
      // A oscuras (o cargando) no se sabe nada de sus agentes y la sala no los dibuja: los que
      // estaban se quedan donde estaban, para que al volver nadie cambie de lugar sin caminar.
      if (!sala.activa) {
        for (const id of sala.ids) vistos.add(id);
        continue;
      }
      const lista = agentes.filter((a) => a.prefijo === sala.plano.prefijo);
      sala.ids = lista.slice(0, sala.plano.puestos.length).map((a) => a.id);
      lista.forEach((a, i) => {
        if (i >= sala.plano.puestos.length) return;
        vistos.add(a.id);
        const p = this.personas.get(a.id);
        if (!p || p.prefijo !== a.prefijo || p.i !== i) {
          if (p) this.quitar(p);
          this.nueva(a, i, sala);
          cambio = true;
          return;
        }
        const st = p.st;
        // Lo que cuenta el rótulo cambia su vuelta: el bucle vuelve a calcular cuándo le toca cambiar.
        if (p.need !== a.need || p.codigo !== a.codigo || firmaAgenteRotulo(p) !== firmaAgenteRotulo(a)) cambio = true;
        p.need = a.need;
        p.codigo = a.codigo;
        p.companyId = a.companyId;
        p.nombre = a.nombre ?? "";
        p.espera = a.espera ?? null;
        this.cambiarHora(p, a.run ?? null, ahora);
        p.run = a.run ?? null;
        p.runId = a.runId ?? null;
        datosDeCharla(p, a);
        if (st !== a.st) {
          p.st = a.st;
          this.tocar(p.prefijo);
          cambio = true;
        }
      });
    }
    for (const p of [...this.personas.values()]) {
      if (!vistos.has(p.id)) {
        this.quitar(p);
        cambio = true;
      }
    }
    // Una entrega se corta si a alguno le cambia el estado; después, cada uno va a donde le toca (su estado, la fila, la mesa).
    if (this.moverJuntas(ahora)) cambio = true;
    if (this.reacomodar(ahora)) cambio = true;
    // Una sala que entra o sale del filtro gana o pierde su rótulo (y su próximo cambio).
    const otroFiltro = (antes.filtro ?? []).join(",") !== (op.filtro ?? []).join(",");
    if (otroFiltro) cambio = true;
    // Lo que elige el usuario (el filtro, movimiento reducido) cambia los rótulos al tiro, aunque recién hayan cambiado (JST-191).
    if (otroFiltro || antes.rm !== op.rm) for (const st of this.rotulos.values()) st.dibujadoDesde = -Infinity;
    if (antes.mascotas !== op.mascotas || antes.cargando !== op.cargando || antes.rm !== op.rm) {
      this.armarMascotas(ahora);
      cambio = true;
    }
    // «Conversaciones» apagado: las que hay se cortan al tiro (vuelven a su asiento) y no salen más (JST-162 §4).
    if (antes.charlas && !op.charlas) {
      for (const c of [...this.charlas]) this.terminarCharla(c, ahora, true);
      this.callarSueltas();
      cambio = true;
    }
    // Termina de cargar o se vuelve a prender: los que están en el descanso buscan pareja a los 5–10 s.
    if ((antes.cargando && !op.cargando) || (!antes.charlas && op.charlas)) this.abrir(ahora);
    // La relectura de la vuelta ya está en lo que se acaba de aplicar: desde ahora, quien cambia camina.
    if (this.trasVolver && !op.releyendo) this.trasVolver = false;
    if (cambio) {
      // Se llama mientras React dibuja el piso: las salas se dibujan en esta misma pasada con lo nuevo.
      for (const p of this.salas.keys()) this.tocar(p);
      this.despertador?.();
    }
  }

  private reiniciar(plano: PisoPlano, clave: string, ahora: number): void {
    this.generacion += 1;
    this.clave = clave;
    this.plano = plano;
    // 0.6.0: la conversación con voz no sigue en otro plano, y la preparada tampoco.
    for (const ch of this.charlas) if (ch.voz) this.voz?.hecho({ tipo: "fin-charla", id: ch.id });
    if (this.preparada) this.voz?.hecho({ tipo: "soltar", id: this.preparada.id });
    this.preparada = null;
    for (const p of this.personas.values()) p.charla = null;
    this.personas.clear();
    this.cola = [];
    this.charlas = [];
    // Los sobres que esperaban en un escritorio no sobreviven a otro plano: ese escritorio ya no está donde estaba.
    this.sobres = [];
    this.entregas = [];
    // Tampoco las entregas en la mesa ni la fila (es otra mesa y otro escritorio); el «✓ listo» sigue su reloj.
    this.juntas = [];
    this.sobresMano = [];
    this.fila = new Map();
    this.rotulos.clear();
    this.salas = new Map(
      plano.salas.map((s) => [s.prefijo, { plano: s, rejilla: null, activa: false, asientos: s.asientos.map(() => null), ids: [] }]),
    );
    this.pasillos = pasillosDe(plano);
    this.sueltas = [];
    this.abrir(ahora);
    this.armarMascotas(ahora);
    this.elementos.clear();
    this.escritos.clear();
  }

  private rejilla(sala: SalaVida): Rejilla {
    sala.rejilla ??= rejillaDe(sala.plano);
    return sala.rejilla;
  }

  private nueva(a: AgenteVida, i: number, sala: SalaVida): void {
    const p: Persona = {
      id: a.id,
      companyId: a.companyId,
      prefijo: a.prefijo,
      i,
      st: a.st,
      need: a.need,
      codigo: a.codigo,
      nombre: a.nombre ?? "",
      espera: a.espera ?? null,
      run: a.run ?? null,
      horaAntes: null,
      horaDesde: -Infinity,
      empresa: "",
      rol: null,
      rolApi: null,
      motivo: null,
      esperaTipo: null,
      esperaDesde: null,
      runDesde: null,
      runId: a.runId ?? null,
      lugar: "escritorio",
      en: null,
      pos: piesPuesto(sala.plano.puestos[i]!),
      dir: "abajo",
      asiento: null,
      camino: null,
      turno: null,
      charla: null,
      volverA: null,
    };
    datosDeCharla(p, a);
    this.personas.set(a.id, p);
    this.ubicar(p, this.deseado(p));
  }

  private quitar(p: Persona): void {
    if (p.charla) this.terminarCharla(p.charla, this.ahora(), true);
    for (const j of this.juntas.filter((x) => x.de === p.id || x.a === p.id)) this.cerrarJunta(j, false);
    this.sobresMano = this.sobresMano.filter((s) => s.con !== p.id);
    this.listos.delete(p.id);
    this.soltarTurno(p);
    this.soltarAsiento(p);
    this.sueltas = this.sueltas.filter((s) => s.quien !== p.id);
    this.busca.delete(p.id);
    this.proxSuelta.delete(p.id);
    this.personas.delete(p.id);
  }

  /** Abre (o vuelve a la pestaña): cada libre del descanso vuelve a elegir cuándo buscar pareja y cuándo decir una frase suelta. */
  private abrir(ahora: number): void {
    this.abierta = ahora;
    this.busca.clear();
    this.proxSuelta.clear();
  }

  /**
   * La sala se apaga (no respondió): sin conversaciones ni sobres, y todo
   * queda quieto como estaba. Quien caminaba sigue desde ahí cuando vuelve
   * (`moverPersonas` no lo mueve), y quien conversaba vuelve a su asiento
   * caminando, también cuando vuelve (JST-137).
   */
  private apagarSala(sala: SalaVida): void {
    const pre = sala.plano.prefijo;
    for (const c of this.charlas.filter((x) => x.prefijo === pre)) this.terminarCharla(c, this.ahora(), true);
    this.sueltas = this.sueltas.filter((s) => s.prefijo !== pre);
    this.sobres = this.sobres.filter((s) => s.prefijo !== pre);
    this.entregas = this.entregas.filter((e) => e.prefijo !== pre);
    for (const j of this.juntas.filter((x) => x.prefijo === pre)) this.cerrarJunta(j, false);
    this.sobresMano = this.sobresMano.filter((s) => s.prefijo !== pre);
  }

  /** Su sala no se ve (a oscuras): ni camina ni le toca el turno hasta que vuelve. */
  private enPausa(p: Persona): boolean {
    return !this.salas.get(p.prefijo)?.activa;
  }

  /** Alguien de una sala que se ve espera su turno para caminar. */
  private esperanTurno(): boolean {
    return this.cola.some((id) => {
      const p = this.personas.get(id);
      return !!p && !this.enPausa(p);
    });
  }

  /** Todos en su lugar, sin caminar (cambio de «reducir movimiento»). */
  private ubicarTodos(ahora: number): void {
    for (const c of [...this.charlas]) this.terminarCharla(c, ahora, true, false);
    // Una entrega en la mesa no se ve sin caminar: se corta (con movimiento reducido es el sobre quieto).
    for (const j of [...this.juntas]) this.cerrarJunta(j, false);
    this.sobresMano = [];
    for (const p of this.personas.values()) this.ubicar(p, this.deseado(p, ahora), p.turno?.preferido ?? null);
    this.sobres = this.op.rm ? this.sobres.filter((s) => s.fase === "espera").map((s) => ({ ...s, rm: true })) : this.sobres.filter((s) => s.fase === "espera");
  }

  /**
   * La pestaña vuelve a la vista: cada uno aparece donde iba, sin repetir el
   * camino. Los sobres en vuelo se descartan; los que esperaban en un
   * escritorio siguen hasta 60 s desde que llegaron. Las conversaciones
   * empiezan de cero.
   */
  private volver(ahora: number): void {
    this.ultimo = null;
    this.trasVolver = true;
    this.quietoHasta = ahora + VUELTA_QUIETA_MS;
    for (const c of [...this.charlas]) this.terminarCharla(c, ahora, true, false);
    // Las entregas en la mesa tampoco: quien iba o estaba en la mesa aparece en su lugar.
    for (const j of [...this.juntas]) this.cerrarJunta(j, false);
    this.sobresMano = [];
    for (const p of this.personas.values()) {
      if (p.camino || p.turno || p.lugar === "mesa" || destino(p) !== this.deseado(p, ahora)) this.ubicar(p, this.deseado(p, ahora), p.turno?.preferido ?? null);
    }
    this.sobres = this.sobres.flatMap((s): Sobre[] => {
      if (s.fase === "vuela" || s.fase === "abre") return [];
      if (s.fase === "llega") return [{ ...s, fase: "espera", tMax: s.tf + ESPERA_SOBRE_MS }];
      return [s];
    });
    this.sueltas = [];
    for (const m of this.mascotasVivas) {
      m.dice = null;
      if (m.modo !== "caminar") continue;
      m.pos = { x: m.meta, y: m.pos.y };
      this.llegaMascota(m, ahora);
    }
    this.abrir(ahora);
    this.versionMascotas += 1;
    this.retenerRotulos(ahora);
  }

  // -------------------------------------------------------------------------
  // Asientos y lugares
  // -------------------------------------------------------------------------

  private tomarAsiento(p: Persona, preferido: number | null = null): number | null {
    const sala = this.salas.get(p.prefijo);
    if (!sala) return null;
    const ya = sala.asientos.indexOf(p.id);
    if (ya >= 0) return ya;
    // Mientras hay una entrega en la mesa, nadie se sienta bajo sus globos, ni aunque fuera su asiento de antes (JST-190).
    const entrega = this.juntas.filter((j) => j.prefijo === p.prefijo).flatMap((j) => [j.cajas.de, j.cajas.a]);
    const tapan = (cajas: readonly CajaHilo[], k: number) => cajas.some((c) => tapaA(c, [piesAsiento(sala.plano.asientos[k]!)]));
    if (preferido !== null && preferido < sala.asientos.length && sala.asientos[preferido] === null && !tapan(entrega, preferido)) {
      sala.asientos[preferido] = p.id;
      return preferido;
    }
    // Si en su sala hay una conversación, primero los asientos donde su hilo no le tapa la cabeza (JST-172).
    const caja = this.charlas.find((c) => c.prefijo === p.prefijo)?.caja;
    const cajas = caja ? [caja, ...entrega] : entrega;
    const sinTapar = cajas.length > 0 ? sala.asientos.findIndex((x, k) => x === null && !tapan(cajas, k)) : -1;
    const libre = sinTapar >= 0 ? sinTapar : sala.asientos.indexOf(null);
    if (libre < 0) return null;
    sala.asientos[libre] = p.id;
    return libre;
  }

  private soltarAsiento(p: Persona): void {
    const sala = this.salas.get(p.prefijo);
    if (sala) {
      const i = sala.asientos.indexOf(p.id);
      if (i >= 0) sala.asientos[i] = null;
    }
    p.asiento = null;
  }

  private asientoDe(p: Persona) {
    return p.asiento === null ? null : (this.salas.get(p.prefijo)?.plano.asientos[p.asiento] ?? null);
  }

  /**
   * En su lugar, sin caminar: su escritorio, su asiento del descanso (o, si no
   * queda ninguno, de pie junto a su escritorio), su lugar en tu fila (de
   * espaldas) o su lugar en la mesa de una entrega.
   */
  private ubicar(p: Persona, hacia: Destino, preferido: number | null = null): void {
    const sala = this.salas.get(p.prefijo)!;
    const puesto = sala.plano.puestos[p.i]!;
    this.soltarTurno(p);
    p.camino = null;
    p.dir = "abajo";
    p.en = null;
    if (esFila(hacia) || esMesa(hacia)) {
      const punto = this.puntoDe(p, hacia);
      if (punto) {
        this.soltarAsiento(p);
        p.lugar = esFila(hacia) ? "fila" : "mesa";
        p.en = hacia;
        p.pos = { ...punto };
        if (esFila(hacia)) p.dir = "arriba";
        return;
      }
      hacia = p.st === "libre" ? "descanso" : "escritorio";
    }
    if (hacia === "escritorio") {
      this.soltarAsiento(p);
      p.lugar = "escritorio";
      p.pos = piesPuesto(puesto);
      return;
    }
    p.asiento = this.tomarAsiento(p, preferido);
    const a = this.asientoDe(p);
    if (a) {
      p.lugar = "descanso";
      p.pos = piesAsiento(a);
    } else {
      p.lugar = "junto";
      p.pos = piesJunto(puesto);
    }
  }

  private caminando(prefijo?: string): number {
    let n = 0;
    for (const p of this.personas.values()) if (p.camino && (!prefijo || p.prefijo === prefijo)) n += 1;
    return n;
  }

  /**
   * Nadie lo vería caminar: «reducir movimiento», pestaña oculta o recién
   * vuelta (hasta que llega la relectura). Aparece en su lugar.
   */
  private sinCaminar(): boolean {
    return this.op.rm || this.op.oculta || (this.trasVolver && this.ahora() < this.quietoHasta);
  }

  /**
   * Hay cupo para `cuantos` más (8 en el piso, 3 por sala), o ya camina. Con
   * su sala a oscuras no hay: espera su turno hasta que vuelve. Los que se
   * quedaron quietos a mitad de camino en una sala a oscuras siguen contando.
   */
  private hayCupo(p: Persona, cuantos = 1): boolean {
    if (p.camino) return true;
    if (this.enPausa(p)) return false;
    return this.caminando() + cuantos <= MAX_PISO && this.caminando(p.prefijo) + cuantos <= MAX_SALA;
  }

  private soltarTurno(p: Persona): void {
    if (!p.turno) return;
    p.turno = null;
    this.cola = this.cola.filter((id) => id !== p.id);
  }

  /** Cambió dónde tiene que estar: camina a su escritorio, al descanso, a la fila o a la mesa (o espera su turno), o aparece ahí si no puede caminar. */
  private acomodar(p: Persona, ahora: number): void {
    const quiere = this.deseado(p, ahora);
    // Quien deja de estar libre, o lo llaman a la fila o a una entrega, deja la conversación.
    if (p.charla && (p.st !== "libre" || quiere !== "descanso")) this.terminarCharla(p.charla, ahora, true);
    if (destino(p) === quiere) return;
    this.irA(p, quiere);
  }

  /**
   * Dónde tiene que estar (JST-163): en la mesa si está en una entrega; en su
   * escritorio mientras dura su «✓ listo»; en tu fila si te espera sin trabajar
   * y le tocó lugar; si no, en el descanso si está libre o en su escritorio.
   */
  private deseado(p: Persona, ahora = this.ahora()): Destino {
    const j = this.juntas.find((x) => x.de === p.id || x.a === p.id);
    if (j) return `mesa:${j.id}`;
    if (this.enListo(p, ahora)) return "escritorio";
    const k = this.fila.get(p.id);
    if (k !== undefined) return `fila:${k}`;
    return p.st === "libre" ? "descanso" : "escritorio";
  }

  /** Cada uno donde tiene que estar: si cambió (su estado, la fila, una entrega, el «✓ listo»), camina o aparece ahí. */
  private reacomodar(ahora: number): boolean {
    let cambio = false;
    for (const p of this.personas.values()) {
      if (this.enPausa(p) || destino(p) === this.deseado(p, ahora)) continue;
      this.acomodar(p, ahora);
      this.tocar(p.prefijo);
      cambio = true;
    }
    return cambio;
  }

  /** Los pies en un lugar de tu fila o en la mesa de su entrega (`null` si ya no existe). */
  private puntoDe(p: Persona, hacia: `fila:${number}` | `mesa:${number}`): Punto | null {
    if (esFila(hacia)) return this.salas.get(p.prefijo)?.plano.fila[Number(hacia.slice(5))] ?? null;
    const j = this.juntas.find((x) => x.id === Number(hacia.slice(5)));
    return j?.spots[p.id] ?? null;
  }

  /** Ya está (quieto) en ese lugar. */
  private estaEn(p: Persona, hacia: Destino): boolean {
    if (p.camino) return false;
    if (hacia === "escritorio") return p.lugar === "escritorio";
    if (hacia === "descanso") return p.lugar === "descanso" || p.lugar === "junto";
    return p.en === hacia && (p.lugar === "fila" || p.lugar === "mesa");
  }

  /**
   * Va a su escritorio, al descanso, a la fila o a la mesa: camina si hay
   * cupo; si no, espera su turno donde está, y camina cuando alguien llega
   * (JST-137). A la fila y a la mesa se camina aunque el cupo esté lleno (no se
   * vería mejor que aparezcan). Si nadie lo vería caminar, o no hay camino ni
   * asiento, aparece ahí.
   */
  private irA(p: Persona, hacia: Destino, preferido: number | null = null, vuelta = false): void {
    this.soltarTurno(p);
    if (this.estaEn(p, hacia)) return;
    if (this.sinCaminar()) {
      this.ubicar(p, hacia, preferido);
      return;
    }
    const apura = esFila(hacia) || esMesa(hacia);
    if (this.enPausa(p) || (!apura && !this.hayCupo(p))) {
      p.turno = { hacia, preferido, vuelta };
      this.cola.push(p.id);
      return;
    }
    if (!this.caminar(p, hacia, preferido, vuelta)) this.ubicar(p, hacia, preferido);
  }

  /** Cuando alguien llega y deja cupo, camina el que sigue en la cola (en su orden; uno de otra sala no espera al de una sala llena). */
  private atenderCola(): boolean {
    let cambio = false;
    for (const id of [...this.cola]) {
      const p = this.personas.get(id);
      const t = p?.turno;
      if (!p || !t) {
        this.cola = this.cola.filter((x) => x !== id);
        continue;
      }
      if (!this.sinCaminar() && !this.hayCupo(p)) continue;
      this.irA(p, t.hacia, t.preferido, t.vuelta);
      this.tocar(p.prefijo);
      cambio = true;
    }
    return cambio;
  }

  /** Arma el camino de `p` hacia su escritorio, un asiento del descanso, su lugar en la fila o en la mesa. `false` si no hay camino o asiento. */
  private caminar(p: Persona, hacia: Destino, preferido: number | null = null, comoVuelta = false): boolean {
    const sala = this.salas.get(p.prefijo)!;
    const r = this.rejilla(sala);
    const puesto = sala.plano.puestos[p.i]!;
    const sentado = piesPuesto(puesto);
    const salida = salidaPuesto(puesto);
    // Entre la silla y el pasillo de atrás (levantándose o sentándose) vuelve primero al pasillo.
    const enSalida = Math.round(p.pos.x) === salida.x && p.pos.y > salida.y && p.pos.y <= sentado.y;
    const desdeEscritorio = p.lugar === "escritorio" || enSalida;
    const asientoActual = p.lugar === "descanso" ? this.asientoDe(p) : null;
    // Del sofá se sale (y se llega) por la franja libre que queda entre el sofá y la mesita, 2 px bajo los pies.
    const pre = desdeEscritorio ? [salida] : asientoActual?.sofa ? [{ x: p.pos.x, y: p.pos.y + 2 }] : [];
    let puntos: Punto[] | null;
    if (hacia === "escritorio") {
      puntos = enSalida ? [p.pos, sentado] : ruta(r, p.pos, sentado, { pre, post: [salida] });
      if (!puntos) return false;
      this.soltarAsiento(p);
    } else if (esFila(hacia) || esMesa(hacia)) {
      const meta = this.puntoDe(p, hacia);
      puntos = meta ? ruta(r, p.pos, meta, { pre }) : null;
      if (!puntos) return false;
      this.soltarAsiento(p);
    } else {
      const k = this.tomarAsiento(p, preferido);
      if (k === null) return false;
      p.asiento = k;
      const a = sala.plano.asientos[k]!;
      const meta = piesAsiento(a);
      puntos = ruta(r, p.pos, meta, { pre, post: a.sofa ? [{ x: meta.x, y: meta.y + 2 }] : [] });
      if (!puntos) {
        this.soltarAsiento(p);
        return false;
      }
    }
    p.camino = { rec: recorrido(puntos), d: 0, hacia: hacia === "descanso" && comoVuelta ? "vuelta" : hacia };
    p.lugar = "camino";
    p.en = null;
    return true;
  }

  // -------------------------------------------------------------------------
  // Sobres
  // -------------------------------------------------------------------------

  /**
   * Una tarea pasó de un agente a otro (`issue.updated` con
   * `changes.assigneeAgentId`). Los dos están en la misma sala (una tarea no
   * cambia de empresa). No hay sobre si esa sala no se ve, está a oscuras o
   * cargando, o con la pestaña oculta.
   *
   * 0.5.0 (JST-163 §10): si quien recibe está libre en el descanso, se juntan
   * en la mesa (`juntar`); si no (trabaja, está en pausa o en la fila, la mesa
   * está ocupada, a 1x o con movimiento reducido), el sobre de siempre.
   */
  entrega(de: string, a: string, codigo: string): boolean {
    if (this.op.oculta || this.op.cargando || de === a) return false;
    const pd = this.personas.get(de);
    const pa = this.personas.get(a);
    if (!pd || !pa || pd.prefijo !== pa.prefijo) return false;
    const sala = this.salas.get(pa.prefijo);
    if (!sala?.activa) return false;
    const ahora = this.ahora();
    // Quien recién entregó no muestra «✓ listo»: lo cuenta la entrega.
    this.entrego.set(de, ahora);
    if (this.listos.delete(de)) this.tocar(pd.prefijo);
    // 0.6.0: lo que dice la entrega se pide con el evento, antes de que caminen a la mesa.
    const decir = (como: "mesa" | "sobre", id: number) => {
      if (this.voz?.lee("entregas")) this.voz.hecho({ tipo: "entrega", id, como, fase: "sale", de, a, companyId: pd.companyId, para: nombreCortoVoz(pa.nombre), titulo: this.titulos?.titulo(codigo) ?? null });
    };
    if (this.juntar(pd, pa, codigo, sala, ahora)) {
      decir("mesa", this.juntas.at(-1)!.id);
      this.tocar(pa.prefijo);
      this.avisar();
      return true;
    }
    const desde = sala.plano.puestos[pd.i]!;
    const hasta = sala.plano.puestos[pa.i]!;
    const base = { id: this.sigId++, prefijo: pa.prefijo, a, codigo, tf: ahora, t0: ahora, tSentado: null, tramo: "pasillo" as const, vozHasta: 0 };
    if (this.op.rm) {
      this.sobres.push({ ...base, fase: "espera", dur: 0, rec: null, pos: cubierta(hasta), tMax: ahora + ESPERA_SOBRE_MS, rm: true });
    } else {
      const rec = recorrido(rutaSobre(desde, hasta));
      this.sobres.push({ ...base, fase: "vuela", dur: duracionSobre(rec.largo), rec, pos: cubierta(desde), tMax: Infinity, rm: false });
    }
    this.entregas.push({ id: base.id, prefijo: pa.prefijo, a, codigo, t0: ahora });
    decir("sobre", base.id);
    this.tocar(pa.prefijo);
    this.avisar();
    return true;
  }

  /** Libre en el descanso: sentado, de pie, conversando o caminando hacia allá (no de pie junto a su escritorio). */
  private enElDescanso(p: Persona): boolean {
    if (p.turno) return false;
    if (p.camino) return p.camino.hacia === "descanso" || p.camino.hacia === "vuelta" || p.camino.hacia === "charla";
    return p.lugar === "descanso" || p.lugar === "charla";
  }

  /**
   * La entrega en la mesa (JST-163 §10): se juntan si quien entrega está
   * trabajando o libre (no en la fila), quien recibe está libre en el descanso,
   * no hay otra entrega en la sala y el piso está a 2x o 3x, sin movimiento
   * reducido. Quien entrega va a la derecha de la mesa (a la izquierda están tu
   * escritorio y tu fila) con el sobre en la mano. Si alguno conversaba, la
   * conversación se corta. Sus globos suben lo justo para no taparle la cabeza
   * a nadie (JST-190). `false`: va el sobre de siempre (también si para eso
   * tendrían que salir de la sala).
   */
  private juntar(pd: Persona, pa: Persona, codigo: string, sala: SalaVida, ahora: number): boolean {
    if (this.op.rm || (this.plano?.escala ?? 1) < 2 || this.sinCaminar()) return false;
    if (this.juntas.some((j) => j.prefijo === sala.plano.prefijo)) return false;
    if ((pd.st !== "trabaja" && pd.st !== "libre") || pd.need || this.fila.has(pd.id) || pd.lugar === "fila") return false;
    if (pa.st !== "libre" || pa.need || this.fila.has(pa.id) || !this.enElDescanso(pa)) return false;
    const m = sala.plano.mesa;
    const der = { x: m.x + m.w + 7, y: m.y + m.h + 1 };
    const izq = { x: m.x - 7, y: m.y + m.h + 1 };
    const r = this.rejilla(sala);
    if (!libre(r, der) || !libre(r, izq)) return false;
    const j: Junta = { id: this.sigId++, prefijo: sala.plano.prefijo, de: pd.id, a: pa.id, codigo, fase: "juntarse", t0: ahora, tf: 0, spots: { [pd.id]: der, [pa.id]: izq }, mira: { [pd.id]: "izq", [pa.id]: "der" }, alto: 0, cajas: { de: [0, 0, 0, 0], a: [0, 0, 0, 0], corre: 0, encima: 0 } };
    if (!this.alzarJunta(j, sala, pa)) return false;
    this.juntas.push(j);
    for (const p of [pd, pa]) if (p.charla) this.terminarCharla(p.charla, ahora, true);
    for (const p of [pd, pa]) this.irA(p, `mesa:${j.id}`);
    // Si alguno no tiene cómo llegar a la mesa, no se juntan: el sobre de siempre.
    const llega = (p: Persona) => p.en === `mesa:${j.id}` || p.camino?.hacia === `mesa:${j.id}`;
    if (!llega(pd) || !llega(pa)) {
      this.juntas = this.juntas.filter((x) => x !== j);
      for (const p of [pd, pa]) this.irA(p, this.deseado(p, ahora));
      return false;
    }
    this.sobresMano.push({ junta: j.id, prefijo: j.prefijo, codigo, con: pd.id, enMesa: false, mesa: { x: m.x + Math.round(m.w / 2), y: m.y + 2 } });
    return true;
  }

  /**
   * Cuánto suben los globos de la entrega `j` para no taparle la cabeza a
   * nadie más de la sala (de quien camina, donde llega), ni el hilo de una
   * conversación ni tu escritorio (JST-190). `false` si tendrían que salir de
   * la sala o si en el descanso no cabe ni el código (JST-214): queda como estaba.
   */
  private alzarJunta(j: Junta, sala: SalaVida, pa: Persona): boolean {
    const d = sala.plano.descanso;
    const base = cajasEntrega(j.spots[j.de]!, j.spots[j.a]!, j.codigo, nombreCortoVoz(pa.nombre), d, this.plano?.escala ?? 2);
    if (!base) return false;
    const otros: Punto[] = [];
    for (const p of this.personas.values()) {
      if (p.prefijo !== j.prefijo || p.id === j.de || p.id === j.a || p.lugar === "escritorio") continue;
      // En el sofá, los pies de su asiento (el camino termina 2 más abajo).
      const a = p.lugar === "descanso" || p.camino ? this.asientoDe(p) : null;
      otros.push(a ? piesAsiento(a) : (p.camino?.rec.puntos.at(-1) ?? p.pos));
    }
    const cajas: CajaHilo[] = [];
    const ch = this.charlas.find((c) => c.prefijo === j.prefijo && c.a !== j.de && c.a !== j.a && c.b !== j.de && c.b !== j.a);
    if (ch) cajas.push(ch.caja);
    const e = sala.plano.escritorio;
    if (e) cajas.push([e.x - 2, e.y - 2, e.x + 30, e.y + 30]);
    const alto = altoEntrega(base, otros, cajas);
    if (alto === null) return false;
    j.alto = alto;
    j.cajas = subirEntrega(base, alto);
    return true;
  }

  /** Cuándo cambia algo que se ve en una entrega: responde «🤝» (1,5 s), deja de hablar quien entrega (4 s), quien recibe (4 s) y termina (9 s). */
  private static etapaJunta(t: number): number {
    return t < RESPONDE_MS ? 0 : t < HABLA_ENTREGA_MS ? 1 : 2;
  }

  /**
   * Las entregas en la mesa: se ponen a hablar cuando llegan los dos, terminan
   * a los 9 s y se cortan si a alguno le cambia el estado (te necesita, error,
   * pausa), si su sala se apaga o si en 25 s no se juntaron.
   */
  private moverJuntas(ahora: number): boolean {
    let cambio = false;
    const corta = (p: Persona | undefined) => !p || p.need || p.st === "error" || p.st === "pausa" || p.st === "toca";
    for (const j of [...this.juntas]) {
      const pd = this.personas.get(j.de);
      const pa = this.personas.get(j.a);
      if (corta(pd) || corta(pa) || !this.salas.get(j.prefijo)?.activa || (j.fase === "juntarse" && ahora - j.t0 > JUNTARSE_MAX_MS)) {
        this.cerrarJunta(j, false);
        cambio = true;
        continue;
      }
      if (j.fase === "juntarse") {
        if (pd!.en === `mesa:${j.id}` && pa!.en === `mesa:${j.id}`) {
          j.fase = "hablar";
          j.tf = ahora;
          // Mientras caminaban pudo irse o volver alguien: se mide otra vez (si no hay cómo, queda lo de antes), y la frase suelta de la sala termina.
          this.alzarJunta(j, this.salas.get(j.prefijo)!, pa!);
          this.callarSueltas(j.prefijo);
          // 0.6.0: quien entrega lo dice (si el canal está libre) y quien recibe responde «¡Dale!».
          if (this.voz?.lee("entregas")) this.voz.hecho({ tipo: "entrega", id: j.id, como: "mesa", fase: "hablan", de: j.de, a: j.a, companyId: pd!.companyId, para: nombreCortoVoz(pa!.nombre), titulo: this.titulos?.titulo(j.codigo) ?? null });
          const s = this.sobresMano.find((x) => x.junta === j.id);
          // Frente a frente, el sobre queda sobre la mesa.
          if (s) {
            s.con = null;
            s.enMesa = true;
          }
          this.tocar(j.prefijo);
          cambio = true;
        }
        continue;
      }
      const t = ahora - j.tf;
      if (t >= JUNTOS_MS) {
        this.cerrarJunta(j, true);
        cambio = true;
      } else if (Vida.etapaJunta(t) !== Vida.etapaJunta(Math.max(0, this.ultimoPaso - j.tf))) {
        this.tocar(j.prefijo);
        cambio = true;
      }
    }
    // El sobre en la mano: si quien lo lleva ya no va a su escritorio (o se fue), desaparece.
    const antes = this.sobresMano.length;
    this.sobresMano = this.sobresMano.filter((s) => {
      if (s.enMesa || this.juntas.some((j) => j.id === s.junta)) return true;
      const p = s.con ? this.personas.get(s.con) : undefined;
      return !!p && this.deseado(p, ahora) === "escritorio";
    });
    if (this.sobresMano.length !== antes) cambio = true;
    this.ultimoPaso = ahora;
    return cambio;
  }

  /**
   * Termina una entrega. Si hablaron (`bien`), quien recibe se lleva el sobre a
   * su escritorio y lo abre ahí; si no va a su escritorio, el sobre desaparece.
   * Cada uno vuelve a lo suyo (`reacomodar`).
   */
  private cerrarJunta(j: Junta, bien: boolean): void {
    this.juntas = this.juntas.filter((x) => x !== j);
    const s = this.sobresMano.find((x) => x.junta === j.id);
    if (s) {
      s.enMesa = false;
      const pa = this.personas.get(j.a);
      if (bien && pa && this.deseado(pa) === "escritorio") s.con = j.a;
      else this.sobresMano = this.sobresMano.filter((x) => x !== s);
    }
    this.tocar(j.prefijo);
  }

  /**
   * Tu fila (JST-163 §14): quién la hace en cada sala que se ve y en qué lugar,
   * con lo que llega de cada agente. Quien está entregando una tarea no va.
   * `true` si cambió (las salas afectadas se vuelven a dibujar).
   */
  private calcularFila(agentes: readonly AgenteVida[], activas: ReadonlySet<string>): boolean {
    const entregan = new Set(this.juntas.map((j) => j.de));
    const lugares = (prefijo: string) => (activas.has(prefijo) ? (this.salas.get(prefijo)?.plano.fila.length ?? 0) : 0);
    const nueva = filaDeSalas(
      agentes.map((a) => ({ id: a.id, prefijo: a.prefijo, st: a.st, need: a.need, esperaDesde: a.esperaDesde ?? null })),
      lugares,
      entregan,
    );
    const firma = (m: ReadonlyMap<string, number>) => [...m].map(([id, k]) => `${id}:${k}`).sort().join(",");
    if (firma(nueva) === firma(this.fila)) return false;
    const prefijo = new Map(agentes.map((a) => [a.id, a.prefijo]));
    for (const id of new Set([...this.fila.keys(), ...nueva.keys()])) {
      const pre = prefijo.get(id) ?? this.personas.get(id)?.prefijo;
      if (pre) this.tocar(pre);
    }
    this.fila = nueva;
    return true;
  }

  // -------------------------------------------------------------------------
  // «✓ listo» (JST-163 §7)
  // -------------------------------------------------------------------------

  /**
   * Un run terminó (`heartbeat.run.status` del canal en vivo, 0 lecturas). Si
   * terminó bien, «✓ listo» 6 s en su puesto antes de irse al descanso; no si
   * recién entregó la tarea (lo cuenta la entrega). Si falló, nada: sale «Error».
   */
  terminoRun(agenteId: string, runId: string | null, status: string): void {
    const p = this.personas.get(agenteId);
    if (!p || this.op.oculta || this.op.cargando) return;
    const ahora = this.ahora();
    if (status !== "succeeded") {
      if (this.listos.delete(agenteId)) {
        this.tocar(p.prefijo);
        this.avisar();
      }
      return;
    }
    if (p.st !== "trabaja" || (this.entrego.get(agenteId) ?? -Infinity) > ahora - ENTREGO_MS || this.juntas.some((j) => j.de === agenteId)) return;
    this.listos.set(agenteId, { t0: ahora, codigo: p.codigo ?? p.run?.codigo ?? null, runId });
    this.tocar(p.prefijo);
    this.avisar();
  }

  /**
   * Muestra «✓ listo» ahora: libre y sin «te necesita», hasta 6 s después de
   * terminar; si ya tomó otra tarea, hasta 2 s (si todavía se ve el run que
   * terminó, los 6 s). Si pasa a «te necesita», a error o a pausa, se corta.
   * Trabajando sin run (el run que terminó ya salió de la lista y el agente
   * todavía dice que trabaja, o el nuevo todavía no llega) no es otra tarea:
   * si no, se cortaba y volvía 1 s después (JST-191).
   */
  private enListo(p: Persona, t: number): boolean {
    const l = this.listos.get(p.id);
    if (!l || p.need) return false;
    const edad = t - l.t0;
    if (p.st === "libre") return edad < LISTO_MS;
    if (p.st === "trabaja") return edad < (p.runId && p.runId !== l.runId ? LISTO_MIN_MS : LISTO_MS);
    return false;
  }

  /** Los «✓ listo» que se ven cambiaron (empezó o terminó alguno): sus salas se vuelven a dibujar y cada uno va a su lugar. */
  private revisarListos(ahora: number): boolean {
    let cambio = false;
    for (const [id, l] of [...this.listos]) {
      const p = this.personas.get(id);
      const vivo = !!p && this.enListo(p, ahora);
      if (!p || (!vivo && ahora - l.t0 >= LISTO_MIN_MS)) this.listos.delete(id);
      const clave = `${id}:${l.t0}`;
      if (vivo !== this.listosVistos.has(clave)) {
        if (vivo) this.listosVistos.add(clave);
        else this.listosVistos.delete(clave);
        if (p) this.tocar(p.prefijo);
        cambio = true;
      }
    }
    for (const clave of [...this.listosVistos]) {
      const [id, t0] = clave.split(":");
      if (this.listos.get(id!)?.t0 !== Number(t0)) {
        this.listosVistos.delete(clave);
        const p = this.personas.get(id!);
        if (p) this.tocar(p.prefijo);
        cambio = true;
      }
    }
    return cambio;
  }

  // -------------------------------------------------------------------------
  // Conversaciones
  // -------------------------------------------------------------------------

  /** Libres de la sala que pueden conversar: en el descanso (sentados o de pie), sin caminar y sin otra conversación. */
  private candidatos(sala: SalaVida): Persona[] {
    return sala.ids.map((id) => this.personas.get(id)).filter((p): p is Persona => !!p && p.st === "libre" && p.lugar === "descanso" && !p.camino && !p.charla);
  }

  /** Se puede conversar (o decir una frase suelta): prendidas, sin cargar y con la pestaña a la vista. */
  private conCharlas(): boolean {
    return this.op.charlas && !this.op.cargando && !this.op.oculta;
  }

  /**
   * Cada libre del descanso busca con quién hablar cada 15–30 s (al abrir, a
   * los 5–10 s). Si su sala no tiene otra conversación, ya descansó 20 s y en
   * el piso hay menos de 3, arma una con alguien de su sala con quien no haya
   * hablado en los últimos 2 min (JST-162 §2.1).
   */
  private programarCharlas(ahora: number): boolean {
    if (!this.conCharlas()) return false;
    let cambio = false;
    for (const sala of this.salas.values()) {
      if (!sala.activa) continue;
      const pre = sala.plano.prefijo;
      for (const a of this.candidatos(sala)) {
        const t = this.busca.get(a.id);
        if (t === undefined) {
          this.busca.set(a.id, ahora + this.entre(ahora - this.abierta < ABRIR_MS ? PRIMERA_MS : BUSCA_MS));
          continue;
        }
        if (ahora < t) continue;
        this.busca.set(a.id, ahora + this.entre(BUSCA_MS));
        if (this.charlas.length >= MAX_CHARLAS || this.charlas.some((c) => c.prefijo === pre) || (this.salaLibre.get(pre) ?? -Infinity) > ahora) continue;
        // 0.6.0: la pareja de la conversación con voz espera su turno, y con sus audios listos su sala también.
        if (this.reservado(a.id) || (this.preparada?.ms && this.preparada.prefijo === pre)) continue;
        if (this.armarCharla(sala, a, ahora)) {
          cambio = true;
          break;
        }
      }
    }
    return cambio;
  }

  /** `a` busca pareja en su sala: alguien libre del descanso (con movimiento reducido, a 40 px o menos) que no haya hablado con él hace menos de 2 min. */
  private armarCharla(sala: SalaVida, a: Persona, ahora: number): boolean {
    const otros = this.parejasDe(sala, a, ahora).filter((x) => !this.reservado(x.id));
    if (otros.length === 0) return false;
    const b = otros[Math.floor(this.azar() * otros.length)]!;
    this.pedirTemasDe(a, b, ahora);
    const ok = this.empezarCharla(sala, a, b, ahora, () => this.guionista.armar(this.contextoCharla(sala, a, b, ahora)));
    if (!ok) return false;
    this.ultimaPareja.set(clavePareja(a.id, b.id), ahora);
    // Si arranca una conversación, la frase suelta de su sala termina (§1.6).
    this.callarSueltas(sala.plano.prefijo);
    this.tocar(sala.plano.prefijo);
    return true;
  }

  /** Con quién puede conversar `a` en su sala: libres del descanso (con movimiento reducido, a 40 px o menos) con quienes no habló hace menos de 2 min. */
  private parejasDe(sala: SalaVida, a: Persona, ahora: number): Persona[] {
    return this.candidatos(sala).filter((x) => {
      if (x === a) return false;
      if (this.op.rm && Math.hypot(a.pos.x - x.pos.x, a.pos.y - x.pos.y) > VECINOS_PX) return false;
      return !((this.ultimaPareja.get(clavePareja(a.id, x.id)) ?? -Infinity) > ahora - PAREJA_MS);
    });
  }

  /**
   * La conversación no espera la lectura: si sus temas no están guardados, se piden (cada agente, como mucho cada
   * 10 min; en todo el piso, una pareja por minuto) y esta vez hablan de la oficina.
   */
  private pedirTemasDe(a: Persona, b: Persona, ahora: number): void {
    if (ahora - this.ultimoPedido < PEDIR_TEMAS_MS) return;
    const pedidos = [this.pedirTemas(a, ahora), this.pedirTemas(b, ahora)];
    if (pedidos.some(Boolean)) this.ultimoPedido = ahora;
  }

  /** Lo que el guionista necesita para que `a` y `b` conversen en `sala` ahora. */
  private contextoCharla(sala: SalaVida, a: Persona, b: Persona, ahora: number): ContextoCharla {
    return {
      prefijo: sala.plano.prefijo,
      a: this.agenteCharla(a),
      b: this.agenteCharla(b),
      agentes: this.agentesCharla(),
      filtro: this.op.filtro,
      temas: (id) => this.temas?.guardado(id) ?? null,
      titulo: (codigo) => this.titulos?.titulo(codigo) ?? null,
      reloj: this.reloj(),
      ahora,
      azar: this.azar,
    };
  }

  /** Pide los temas de un agente si no están guardados: una vez cada 10 min como mucho, aunque la lectura falle (2 lecturas por agente cada 10 min). `true` si los pidió. */
  private pedirTemas(p: Persona, ahora: number): boolean {
    if (!this.temas || this.temas.guardado(p.id)) return false;
    if ((this.pedidos.get(p.id) ?? -Infinity) > ahora - CACHE_TEMAS_MS) return false;
    this.pedidos.set(p.id, ahora);
    this.temas.leer({ id: p.id, companyId: p.companyId }).catch(() => undefined);
    return true;
  }

  private agenteCharla(p: Persona): AgenteCharla {
    return {
      id: p.id,
      prefijo: p.prefijo,
      nombre: p.nombre,
      empresa: p.empresa,
      st: p.st,
      need: p.need,
      rol: p.rol,
      rolApi: p.rolApi,
      motivo: p.motivo,
      espera: p.need ? { tipo: p.esperaTipo, codigo: p.espera?.codigo ?? null, desde: p.esperaDesde } : null,
      run: p.run ? { codigo: p.run.codigo, desde: p.runDesde, enCola: p.run.enCola } : null,
    };
  }

  /** Los del piso que se ven (las salas que respondieron), para hablar de toda la oficina (§1.2). */
  private agentesCharla(): AgenteCharla[] {
    const out: AgenteCharla[] = [];
    for (const sala of this.salas.values()) {
      if (!sala.activa) continue;
      for (const id of sala.ids) {
        const p = this.personas.get(id);
        if (p) out.push(this.agenteCharla(p));
      }
    }
    return out;
  }

  /**
   * Los pies de los demás de la sala que no están en su escritorio, para no
   * juntarse encima de nadie ni taparle la cabeza con el hilo (JST-172); de
   * quien camina, donde termina su camino.
   */
  private vecinosDeCharla(sala: SalaVida, a: Persona, b: Persona): Punto[] {
    const out: Punto[] = [];
    for (const p of this.personas.values()) {
      if (p.prefijo !== sala.plano.prefijo || p.id === a.id || p.id === b.id || p.lugar === "escritorio") continue;
      out.push(p.camino?.rec.puntos.at(-1) ?? p.pos);
    }
    return out;
  }

  /**
   * Los junta (o, con movimiento reducido, conversan donde están) y les da el
   * guion. El guion va antes que el lugar (JST-172): el hilo mide según lo que
   * dicen, y se juntan donde no le tapa la cabeza a nadie que no conversa ni
   * sale de la sala. Si no hay dónde, no conversan, y lo que no se dijo no
   * cuenta para no repetirlo.
   */
  private empezarCharla(sala: SalaVida, a: Persona, b: Persona, ahora: number, guion: () => Guion | null, conVoz: { id: number; durs: number[] } | null = null): boolean {
    const izq = a.pos.x <= b.pos.x ? a : b;
    const der = izq === a ? b : a;
    // Una conversación no le quita el cupo a quien espera su turno.
    if (!this.puedenCaminarA(a)) return false;
    const olvidar = this.guionista.recuerdo();
    const g = guion();
    if (!g) return false;
    const d = sala.plano.descanso;
    const tam = tamanoHilo(g.lineas, d.w);
    const otros = this.vecinosDeCharla(sala, a, b);
    let caminos: Array<Punto[] | null> | null = null;
    let caja: CajaHilo;
    if (!this.op.rm) {
      const r = this.rejilla(sala);
      const puntos = puntosDeCharla(sala.plano, r, otros, tam);
      caminos = puntos && [izq, der].map((p, k) => {
        const asiento = this.asientoDe(p);
        return ruta(r, p.pos, puntos[k]!, { pre: asiento?.sofa ? [{ x: p.pos.x, y: p.pos.y + 2 }] : [] });
      });
      if (!puntos || !caminos?.[0] || !caminos[1]) {
        olvidar();
        return false;
      }
      // Llegan de pie: la cabeza, 25 sobre los pies.
      caja = cajaHilo(d, { x: puntos[0].x + 8, y: puntos[0].y - 25 }, tam);
    } else {
      caja = cajaHilo(d, { x: (a.pos.x + b.pos.x) / 2, y: Math.min(this.cabeza(a), this.cabeza(b)) }, tam);
      if (tapaA(caja, otros)) {
        olvidar();
        return false;
      }
    }
    // Tampoco donde el hilo toca los globos de una entrega en la mesa (JST-190).
    if (this.juntas.some((j) => j.prefijo === sala.plano.prefijo && (cruzan(caja, j.cajas.de) || cruzan(caja, j.cajas.a)))) {
      olvidar();
      return false;
    }
    const ch: Charla = {
      id: conVoz?.id ?? this.sigId++,
      prefijo: sala.plano.prefijo,
      a: a.id,
      b: b.id,
      lineas: g.lineas,
      // 0.6.0: con voz, cada globo dura lo de siempre o su audio + 0,4 s.
      durs: conVoz?.durs ?? g.lineas.map((l) => duracionFrase(l)),
      fase: "hablar",
      desde: ahora,
      mira: { [izq.id]: "der", [der.id]: "izq" },
      quieta: true,
      viendo: -1,
      caja,
      voz: !!conVoz && !!this.voz,
    };
    if (caminos) {
      [izq, der].forEach((p, k) => {
        p.volverA = p.asiento;
        this.soltarAsiento(p);
        p.camino = { rec: recorrido(caminos[k]!), d: 0, hacia: "charla" };
        p.lugar = "camino";
      });
      ch.fase = "juntarse";
      ch.quieta = false;
    }
    a.charla = ch;
    b.charla = ch;
    this.charlas.push(ch);
    this.fuenteIa?.usado?.("final", g.lineas, g.variante, ch.prefijo, g.ia);
    // 0.6.0: el turno de la voz, desde que salen a juntarse hasta la última frase.
    if (ch.voz) {
      const camino = caminos ? Math.max(...caminos.map((c) => recorrido(c!).largo)) / VELOCIDAD * 1000 : 0;
      this.voz!.hecho({ tipo: "charla", id: ch.id, ms: Math.round(camino + this.duracionHablando(ch)) });
    }
    return true;
  }

  /** Cuánto dura una conversación desde que se juntan: la primera frase a los 300 ms y cada una su duración + 350 ms. */
  private duracionHablando(ch: Charla): number {
    return PRIMERA_FRASE_MS + ch.durs.reduce((s, d) => s + d + ENTRE_FRASES_MS, 0);
  }

  /** Pueden salir a conversar (con movimiento reducido, conversan donde están): nadie espera turno y hay cupo para dos. */
  private puedenCaminarA(a: Persona): boolean {
    return this.op.rm || (!this.sinCaminar() && !this.esperanTurno() && this.hayCupo(a, 2));
  }

  /**
   * Termina una conversación: al terminar las frases, o al tiro si a uno le
   * cambia el estado, su sala queda a oscuras o se apagan las conversaciones
   * (`corte`). Quien sigue libre vuelve caminando a su asiento (el mismo, si
   * sigue libre; con el cupo lleno, espera su turno donde conversaba); a quien
   * cambió lo lleva `acomodar` a su escritorio. `caminar = false`: vuelven sin
   * caminar. La sala descansa 20 s, y los dos buscan pareja de nuevo en 15–30 s.
   */
  private terminarCharla(ch: Charla, ahora: number, corte: boolean, caminar = true): void {
    this.charlas = this.charlas.filter((c) => c !== ch);
    if (ch.voz) {
      ch.voz = false;
      this.voz?.hecho({ tipo: "fin-charla", id: ch.id });
    }
    this.salaLibre.set(ch.prefijo, ahora + SALA_MS);
    this.tocar(ch.prefijo);
    for (const id of [ch.a, ch.b]) {
      const p = this.personas.get(id);
      if (!p || p.charla !== ch) continue;
      p.charla = null;
      this.busca.set(id, ahora + this.entre(BUSCA_MS));
      if (ch.quieta) continue;
      const volverA = p.volverA;
      p.volverA = null;
      if (p.st !== "libre") {
        if (corte) this.acomodarSinCharla(p);
        continue;
      }
      if (caminar) this.irA(p, "descanso", volverA, true);
      else this.ubicar(p, "descanso", volverA);
    }
  }

  private acomodarSinCharla(p: Persona): void {
    this.irA(p, this.deseado(p));
  }

  private moverCharlas(ahora: number): boolean {
    let cambio = false;
    for (const ch of [...this.charlas]) {
      const a = this.personas.get(ch.a);
      const b = this.personas.get(ch.b);
      if (!a || !b || a.st !== "libre" || b.st !== "libre" || !this.salas.get(ch.prefijo)?.activa) {
        this.terminarCharla(ch, ahora, true);
        cambio = true;
        continue;
      }
      if (ch.fase === "juntarse") {
        if (a.lugar === "charla" && b.lugar === "charla") {
          ch.fase = "hablar";
          ch.desde = ahora;
          // El turno de la voz, ahora justo: lo que falta desde que se juntaron.
          if (ch.voz) this.voz?.hecho({ tipo: "charla", id: ch.id, ms: this.duracionHablando(ch) });
          this.tocar(ch.prefijo);
          cambio = true;
        }
        continue;
      }
      const { indice, fin } = fraseEn(ahora - ch.desde, ch.durs);
      if (fin) {
        this.terminarCharla(ch, ahora, false);
        cambio = true;
      } else if (indice !== ch.viendo) {
        ch.viendo = indice;
        if (ch.voz && indice >= 0) this.voz?.hecho({ tipo: "frase", id: ch.id, i: indice, ms: ch.durs[indice]! });
        this.tocar(ch.prefijo);
        cambio = true;
      }
    }
    return cambio;
  }

  // -------------------------------------------------------------------------
  // La conversación con voz (0.6.0, opción C del spike de JST-224)
  // -------------------------------------------------------------------------

  /** Está en la pareja de la conversación con voz que espera su turno. */
  private reservado(id: string): boolean {
    return !!this.preparada && (this.preparada.a === id || this.preparada.b === id);
  }

  /** La sala se ve (entra en el filtro por empresa; en el celular con una sala acercada, el plano es solo esa). */
  private salaQueSeVe(prefijo: string): boolean {
    const filtro = this.op.filtro ?? [];
    return !!this.salas.get(prefijo)?.activa && (filtro.length === 0 || filtro.includes(prefijo));
  }

  /** Si `p` puede conversar ahora («si»), si es cosa de esperar (vuelve caminando a su asiento) o si ya no («no»). */
  private paraHablar(p: Persona | undefined): "si" | "espera" | "no" {
    if (!p || p.st !== "libre" || p.need || this.fila.has(p.id) || this.juntas.some((j) => j.de === p.id || j.a === p.id) || p.charla) return "no";
    if (p.turno || (p.camino && (p.camino.hacia === "descanso" || p.camino.hacia === "vuelta"))) return "espera";
    return p.lugar === "descanso" && !p.camino ? "si" : "no";
  }

  /**
   * Prepara la próxima conversación con voz: una pareja libre de una sala que
   * se ve (no una descartada hace menos de 2 min) y su guion, sin empezarla. La
   * voz pide sus audios; tiene un minuto para tenerlos todos.
   */
  private prepararCharla(ahora: number): void {
    this.proxPreparar = ahora + REINTENTO_PREPARAR_MS;
    for (const [k, t] of this.descartadas) if (ahora - t > PAREJA_MS) this.descartadas.delete(k);
    const salas = barajar([...this.salas.values()].filter((s) => this.salaQueSeVe(s.plano.prefijo)), this.azar);
    for (const sala of salas) {
      for (const a of barajar(this.candidatos(sala), this.azar)) {
        if (this.paraHablar(a) !== "si") continue;
        const otros = this.parejasDe(sala, a, ahora).filter((x) => this.paraHablar(x) === "si" && !this.descartadas.has(clavePareja(a.id, x.id)));
        if (otros.length === 0) continue;
        const b = otros[Math.floor(this.azar() * otros.length)]!;
        this.pedirTemasDe(a, b, ahora);
        const g = this.guionista.armar(this.contextoCharla(sala, a, b, ahora));
        if (!g) continue;
        const id = this.sigId++;
        this.preparada = { id, prefijo: sala.plano.prefijo, a: a.id, b: b.id, guion: g, desde: ahora, plazo: ahora + PLAZO_PREPARADA_MS, ms: null };
        this.voz!.hecho({ tipo: "preparar", id, companyId: a.companyId, lineas: g.lineas, plazo: PLAZO_PREPARADA_MS });
        return;
      }
    }
  }

  /** Se descarta la preparada (y su pareja no vuelve en 2 min): se prepara otra al tiro. */
  private descartar(ahora: number): void {
    const pr = this.preparada;
    if (!pr) return;
    this.preparada = null;
    this.descartadas.set(clavePareja(pr.a, pr.b), ahora);
    this.proxPreparar = ahora;
    this.voz?.hecho({ tipo: "soltar", id: pr.id });
  }

  /**
   * La conversación con voz: prepara una si no hay; si la que hay ya no puede
   * ser (la pareja no está libre, se pasó el minuto sin sus audios o lo que iban
   * a decir cambió), la descarta; si tiene sus audios y le toca el turno, la
   * empieza. `true` si empezó una.
   */
  private atenderVoz(ahora: number): boolean {
    const voz = this.voz;
    if (!voz || !this.conCharlas() || !voz.lee("charlas")) {
      if (this.preparada) {
        voz?.hecho({ tipo: "soltar", id: this.preparada.id });
        this.preparada = null;
      }
      return false;
    }
    const pr = this.preparada;
    if (!pr) {
      if (ahora >= this.proxPreparar) this.prepararCharla(ahora);
      return false;
    }
    const sala = this.salas.get(pr.prefijo);
    const a = this.personas.get(pr.a);
    const b = this.personas.get(pr.b);
    const estados = [this.paraHablar(a), this.paraHablar(b)];
    if (!sala || !this.salaQueSeVe(pr.prefijo) || estados.includes("no")) {
      this.descartar(ahora);
      return false;
    }
    // Si el audio de alguno no llegó en el minuto, se lee otra conversación (tarjeta de JST-224).
    if (!pr.ms) {
      if (ahora > pr.plazo) this.descartar(ahora);
      return false;
    }
    if (ahora > pr.plazo + GRACIA_PREPARADA_MS) {
      this.descartar(ahora);
      return false;
    }
    if (estados.includes("espera") || !voz.libreParaCharla() || !this.puedenCaminarA(a!)) return false;
    if (this.charlas.length >= MAX_CHARLAS || this.charlas.some((c) => c.prefijo === pr.prefijo)) return false;
    // Lo que iban a decir, con los datos de ahora: si cambió, lo nuevo no tiene sus audios.
    const ahoraDicen = this.guionista.rearmar(this.contextoCharla(sala, a!, b!, ahora), pr.guion);
    if (!ahoraDicen || !mismasLineas(ahoraDicen.lineas, pr.guion.lineas)) {
      this.descartar(ahora);
      return false;
    }
    const durs = pr.guion.lineas.map((l, i) => Math.max(duracionFrase(l), (pr.ms![i] ?? 0) + VOZ_EXTRA_MS));
    this.preparada = null;
    if (!this.empezarCharla(sala, a!, b!, ahora, () => pr.guion, { id: pr.id, durs })) {
      // No hay dónde juntarse sin taparle la cabeza a nadie: otra pareja.
      this.preparada = pr;
      this.descartar(ahora);
      return false;
    }
    this.ultimaPareja.set(clavePareja(pr.a, pr.b), ahora);
    this.callarSueltas(pr.prefijo);
    this.tocar(pr.prefijo);
    // Mientras suena una, se prepara la siguiente.
    this.proxPreparar = ahora;
    return true;
  }

  /** La voz tiene todos los audios de la preparada (`ms`: cuánto dura cada uno). Uno de más de 8 s: no se lee. */
  preparadaLista(id: number, ms: readonly number[]): void {
    const pr = this.preparada;
    if (!pr || pr.id !== id) return;
    if (ms.length !== pr.guion.lineas.length || ms.some((x) => !(x >= 0) || x > MAX_AUDIO_MS)) {
      this.descartar(this.ahora());
      this.despertador?.();
      return;
    }
    pr.ms = [...ms];
    this.despertador?.();
  }

  /** La voz no puede hacer algún audio de la preparada (un clon con la Mac cargada, un texto que no sale): otra. */
  preparadaNo(id: number): void {
    if (this.preparada?.id !== id) return;
    this.descartar(this.ahora());
    this.despertador?.();
  }

  /** Un aviso (o la mascota que tocas) cortó la conversación con voz: lo que le queda se ve sin voz. */
  callarCharla(id: number): void {
    const ch = this.charlas.find((c) => c.id === id);
    if (ch) ch.voz = false;
  }

  /** La conversación preparada, para las pruebas y el banco: su id, la pareja, si tiene sus audios y su plazo. */
  vozPreparada(): { id: number; prefijo: string; a: string; b: string; lista: boolean; plazo: number; lineas: readonly Linea[] } | null {
    const pr = this.preparada;
    return pr ? { id: pr.id, prefijo: pr.prefijo, a: pr.a, b: pr.b, lista: !!pr.ms, plazo: pr.plazo, lineas: pr.guion.lineas } : null;
  }

  /** La empresa de alguien del piso (las acciones del worker van con una que el usuario ve), o `null`. */
  unaEmpresa(): string | null {
    for (const p of this.personas.values()) return p.companyId;
    return null;
  }

  /** La conversación de la sala se lee con voz (para el banco y las pruebas). */
  charlaConVoz(prefijo: string): boolean {
    return this.charlas.some((c) => c.prefijo === prefijo && c.voz);
  }

  // -------------------------------------------------------------------------
  // Frases sueltas (JST-162 §1.6)
  // -------------------------------------------------------------------------

  /** Las frases sueltas de una sala (o de todas) terminan. */
  private callarSueltas(prefijo?: string): void {
    for (const s of this.sueltas) if (!prefijo || s.prefijo === prefijo) this.tocar(s.prefijo);
    this.sueltas = prefijo ? this.sueltas.filter((s) => s.prefijo !== prefijo) : [];
  }

  /**
   * Cada libre que está en el descanso sin conversar dice una frase suelta cada
   * 45–90 s: como mucho 1 por sala y nunca mientras su sala tiene una
   * conversación. A 1x no se ven: ni se dicen.
   */
  private programarSueltas(ahora: number): boolean {
    let cambio = false;
    const quedan = this.sueltas.filter((s) => {
      const p = this.personas.get(s.quien);
      return ahora < s.t0 + s.dur && !!p && p.st === "libre" && p.lugar === "descanso" && !p.camino && !p.charla && !!this.salas.get(s.prefijo)?.activa && !this.charlas.some((c) => c.prefijo === s.prefijo);
    });
    if (quedan.length !== this.sueltas.length) {
      for (const s of this.sueltas) if (!quedan.includes(s)) this.tocar(s.prefijo);
      this.sueltas = quedan;
      cambio = true;
    }
    if (!this.conCharlas() || this.plano?.escala === 1) return cambio;
    for (const sala of this.salas.values()) {
      if (!sala.activa) continue;
      const pre = sala.plano.prefijo;
      for (const a of this.candidatos(sala)) {
        const t = this.proxSuelta.get(a.id);
        if (t === undefined) {
          this.proxSuelta.set(a.id, ahora + this.entre(SUELTA_MS));
          continue;
        }
        if (ahora < t) continue;
        this.proxSuelta.set(a.id, ahora + this.entre(SUELTA_MS));
        if (this.charlas.some((c) => c.prefijo === pre) || this.sueltas.some((s) => s.prefijo === pre) || this.juntas.some((j) => j.prefijo === pre)) continue;
        const linea = this.guionista.suelta(a.id, this.temas?.guardado(a.id) ?? null, this.azar, (codigo) => this.titulos?.titulo(codigo) ?? null);
        const su: Suelta = { id: this.sigId++, prefijo: pre, quien: a.id, linea, t0: ahora, dur: duracionFrase(linea, true) };
        this.sueltas.push(su);
        this.fuenteIa?.usado?.("suelta", [linea], null, pre);
        // 0.6.0: la voz ve si le toca (solo en un hueco y una por minuto).
        if (this.voz?.lee("sueltas")) this.voz.hecho({ tipo: "suelta", id: su.id, quien: a.id, companyId: a.companyId, linea, ms: su.dur });
        this.tocar(pre);
        cambio = true;
      }
    }
    return cambio;
  }

  // -------------------------------------------------------------------------
  // Mascotas
  // -------------------------------------------------------------------------

  private armarMascotas(ahora: number): void {
    this.versionMascotas += 1;
    if (!this.op.mascotas || this.op.cargando || this.pasillos.length === 0) {
      this.mascotasVivas = [];
      return;
    }
    // Se conservan las que ya estaban (al volver a mostrarlas o al cambiar «reducir movimiento» parten de su cama).
    this.mascotasVivas = MASCOTAS.map((id, i) => {
      const pasillo = this.pasillos[i % this.pasillos.length]!;
      const cama = camaDe(pasillo, i, MASCOTAS.length);
      return {
        id,
        pasillo,
        cama,
        pos: { ...cama },
        dir: "der" as const,
        modo: this.op.rm ? ("dormir" as const) : ("quieto" as const),
        hasta: ahora + this.entre([1_500, 4_000]),
        meta: cama.x,
        paseos: 0,
        aCama: false,
        dice: null,
      };
    });
  }

  /**
   * Un clic o un toque en una mascota (JST-162 §3): dice lo suyo 1,8 s; si
   * caminaba, se detiene y hace su gesto esos 1,8 s (con movimiento reducido,
   * solo el globo). Una a la vez: la que hablaba se calla.
   */
  tocarMascota(id: TipoMascota): void {
    const m = this.mascotasVivas.find((x) => x.id === id);
    if (!m || this.op.oculta) return;
    this.hablarMascota(m, this.ahora());
    if (!this.op.rm) {
      m.modo = "gesto";
      m.hasta = this.ahora() + MASCOTA_DICE_MS;
    }
    // 0.6.0: la que tocas suena al tiro (si un aviso está sonando, responde sin voz).
    if (this.voz?.lee("mascotas") && m.dice) this.voz.hecho({ tipo: "mascota", id, texto: m.dice.texto, sola: false });
    this.versionMascotas += 1;
    this.avisar();
  }

  /**
   * A qué mascota iba un clic o un toque en `p` (en px de arte del piso,
   * JST-174): entre las que tienen `p` dentro de su zona de `zona` px, la que
   * tiene el dibujo (16 px, como se ve) más cerca; si el punto cae en dos
   * dibujos, la del centro más cerca. A 1x las zonas de 44 px se pisan, y sin
   * esto respondía la que va después en el HTML. `null`: ninguna.
   */
  mascotaEn(p: Punto, zona: number): TipoMascota | null {
    const mitad = Math.max(8, zona / 2);
    let mejor: { id: TipoMascota; borde: number; centro: number } | null = null;
    for (const m of this.mascotasVivas) {
      // Lo dibujado: 16 × 16 con los pies en `pos` (como `escribir` y `CapaMascotas`).
      const { x, y } = redondo(m.pos);
      const dx = Math.abs(p.x - x);
      const dy = Math.abs(p.y - (y - 8));
      if (dx > mitad || dy > mitad) continue;
      const borde = Math.hypot(Math.max(0, dx - 8), Math.max(0, dy - 8));
      const centro = Math.hypot(dx, dy);
      if (!mejor || borde < mejor.borde || (borde === mejor.borde && centro < mejor.centro)) mejor = { id: m.id, borde, centro };
    }
    return mejor?.id ?? null;
  }

  private hablarMascota(m: Mascota, ahora: number): void {
    for (const q of this.mascotasVivas) q.dice = null;
    const texto = this.guionista.mascota(m.id, this.azar);
    m.dice = { texto, hasta: ahora + MASCOTA_DICE_MS };
    this.fuenteIa?.usado?.("mascota", [{ quien: m.id, texto, codigo: null, titulo: null }], m.id, "pasillo");
  }

  /**
   * A qué lado va el globo de una mascota (§3): hacia donde mira, dentro del
   * pasillo. Si no cabe (a menos de 52 px del borde) o hay otra mascota a menos
   * de 44 px de ese lado, va al otro.
   */
  private ladoMascota(m: Mascota): "izq" | "der" {
    const p = m.pasillo;
    const x = m.pos.x;
    const cabe = (l: "izq" | "der") => (l === "izq" ? x - p.x > 52 : p.x + p.w - x > 52);
    const vecina = (l: "izq" | "der") =>
      this.mascotasVivas.some((q) => q !== m && q.pasillo === p && Math.abs(q.pos.y - m.pos.y) < 14 && Math.abs(q.pos.x - x) < 44 && (l === "der" ? q.pos.x > x : q.pos.x < x));
    const otro = (l: "izq" | "der") => (l === "izq" ? "der" : "izq");
    let lado: "izq" | "der" = cabe(m.dir) ? m.dir : otro(m.dir);
    if (vecina(lado) && cabe(otro(lado)) && !vecina(otro(lado))) lado = otro(lado);
    return lado;
  }

  private llegaMascota(m: Mascota, ahora: number): void {
    if (m.aCama) {
      m.aCama = false;
      m.modo = "dormir";
      m.pos = { ...m.cama };
      m.hasta = ahora + this.entre([30_000, 90_000]);
    } else {
      m.modo = this.azar() < 0.35 ? "gesto" : "quieto";
      m.hasta = ahora + this.entre([2_500, 6_000]);
    }
  }

  private moverMascotas(ahora: number, dt: number): boolean {
    let cambio = false;
    for (const m of this.mascotasVivas) {
      if (m.dice && ahora >= m.dice.hasta) {
        m.dice = null;
        cambio = true;
      }
    }
    if (this.op.rm) {
      if (cambio) this.versionMascotas += 1;
      return cambio;
    }
    for (const m of this.mascotasVivas) {
      if (m.modo === "caminar") {
        const paso = (VEL_MASCOTA[m.id] * dt) / 1000;
        const falta = m.meta - m.pos.x;
        if (Math.abs(falta) <= paso) {
          m.pos = { x: m.meta, y: m.pos.y };
          this.llegaMascota(m, ahora);
          cambio = true;
        } else m.pos = { x: m.pos.x + Math.sign(falta) * paso, y: m.pos.y };
        continue;
      }
      if (ahora < m.hasta) continue;
      cambio = true;
      if (m.modo === "dormir") {
        m.modo = "quieto";
        m.paseos = 0;
        m.hasta = ahora + this.entre([1_500, 3_000]);
        // En el TV no hay mouse: al despertar dicen lo suyo solas, una a la vez.
        if (this.op.mascotasSolas && !this.mascotasVivas.some((q) => q.dice)) {
          this.hablarMascota(m, ahora);
          // 0.6.0: con voz, como mucho una cada 5 min y solo si nadie habla.
          if (this.voz?.lee("mascotas") && m.dice) this.voz.hecho({ tipo: "mascota", id: m.id, texto: m.dice.texto, sola: true });
        }
        continue;
      }
      m.paseos += 1;
      if (m.paseos > 3) {
        m.aCama = true;
        m.meta = m.cama.x;
      } else {
        const p = m.pasillo;
        m.meta = Math.round(Math.max(p.x + 10, Math.min(p.x + p.w - 10, m.cama.x + this.entre([-90, 90]))));
      }
      if (m.meta === Math.round(m.pos.x)) {
        this.llegaMascota(m, ahora);
        continue;
      }
      m.dir = m.meta > m.pos.x ? "der" : "izq";
      m.modo = "caminar";
    }
    if (cambio) this.versionMascotas += 1;
    return cambio;
  }

  // -------------------------------------------------------------------------
  // Bucle
  // -------------------------------------------------------------------------

  /** Algo se mueve: alguien camina (o espera su turno), un sobre vuela o una mascota pasea. Si no, el bucle de cuadros se detiene. */
  seMueve(): boolean {
    if (this.op.oculta) return false;
    // Lo de una sala a oscuras está quieto hasta que vuelve.
    for (const p of this.personas.values()) if ((p.camino || p.turno) && !this.enPausa(p)) return true;
    if (this.sobres.some((s) => s.fase === "vuela")) return true;
    return !this.op.rm && this.mascotasVivas.some((m) => m.modo === "caminar");
  }

  /** Cuándo hay que volver a mirar aunque nada se mueva (frases, sobres que esperan, mascotas, quién busca pareja). `null`: nunca. */
  proximo(): number | null {
    if (this.op.oculta) return null;
    let t = Infinity;
    const ahora = this.ahora();
    if (this.conCharlas()) {
      // Cada libre del descanso: cuándo busca pareja y cuándo dice una frase suelta (sin hora todavía: ya).
      const sueltas = this.plano?.escala !== 1;
      for (const sala of this.salas.values()) {
        if (!sala.activa) continue;
        for (const p of this.candidatos(sala)) {
          t = Math.min(t, this.busca.get(p.id) ?? ahora);
          if (sueltas) t = Math.min(t, this.proxSuelta.get(p.id) ?? ahora);
        }
      }
    }
    for (const ch of this.charlas) {
      if (ch.fase !== "hablar") continue;
      t = Math.min(t, ch.desde + fraseEn(ahora - ch.desde, ch.durs).cambia);
    }
    for (const s of this.sueltas) t = Math.min(t, s.t0 + s.dur);
    for (const m of this.mascotasVivas) if (m.dice) t = Math.min(t, m.dice.hasta);
    for (const s of this.sobres) {
      if (s.fase === "llega") t = Math.min(t, s.tf + LLEGA_MS);
      else if (s.fase === "abre") t = Math.min(t, Math.max(s.tf + ABRE_MS, s.vozHasta));
      else if (s.fase === "espera") {
        t = Math.min(t, Math.max(s.tMax, s.vozHasta));
        if (s.tSentado !== null) t = Math.min(t, Math.max(s.tSentado + RM_SOBRE_MS, s.vozHasta));
        if (this.personas.get(s.a)?.lugar === "escritorio") t = Math.min(t, ahora);
      }
    }
    if (!this.op.rm) for (const m of this.mascotasVivas) if (m.modo !== "caminar") t = Math.min(t, m.hasta);
    for (const clave of this.clavesRotulo()) t = Math.min(t, this.proximoRotulo(clave, ahora) ?? Infinity);
    // 0.5.0: cuándo responde, deja de hablar o termina una entrega (o se corta por no juntarse), y cuándo termina un «✓ listo».
    for (const j of this.juntas) {
      const marcas = j.fase === "hablar" ? [RESPONDE_MS, HABLA_ENTREGA_MS, JUNTOS_MS].map((d) => j.tf + d) : [j.t0 + JUNTARSE_MAX_MS + 1];
      for (const m of marcas) if (m > ahora) t = Math.min(t, m);
    }
    for (const l of this.listos.values()) for (const m of [l.t0 + LISTO_MIN_MS, l.t0 + LISTO_MS]) if (m > ahora) t = Math.min(t, m);
    // 0.6.0: cuándo preparar la próxima conversación con voz, su plazo y, con sus audios listos, cada medio segundo (el turno lo da la voz).
    if (this.voz && this.conCharlas() && this.voz.lee("charlas")) {
      const pr = this.preparada;
      if (!pr) t = Math.min(t, Math.max(ahora, this.proxPreparar));
      else if (!pr.ms) t = Math.min(t, pr.plazo + 1);
      else t = Math.min(t, ahora + 500, pr.plazo + GRACIA_PREPARADA_MS + 1);
    }
    return Number.isFinite(t) ? t : null;
  }

  /** Avanza hasta `ahora`. Devuelve `true` si cambió la forma de algo (la UI vuelve a dibujar). */
  paso(ahora = this.ahora()): boolean {
    if (this.op.oculta) {
      this.ultimo = null;
      return false;
    }
    // Un cuadro que tarda (o la vuelta de una espera) no hace saltar a nadie: como mucho 100 ms por paso.
    const dt = this.ultimo === null ? 16 : Math.max(0, Math.min(100, ahora - this.ultimo));
    this.ultimo = ahora;
    let cambio = false;
    cambio = this.moverPersonas(dt) || cambio;
    cambio = this.atenderCola() || cambio;
    cambio = this.moverSobres(ahora) || cambio;
    // 0.5.0: las entregas en la mesa y el «✓ listo» cambian dónde tiene que estar cada uno.
    cambio = this.moverJuntas(ahora) || cambio;
    cambio = this.revisarListos(ahora) || cambio;
    cambio = this.reacomodar(ahora) || cambio;
    cambio = this.moverCharlas(ahora) || cambio;
    // 0.6.0: la conversación con voz va antes que las demás (toma su sala).
    cambio = this.atenderVoz(ahora) || cambio;
    cambio = this.programarCharlas(ahora) || cambio;
    cambio = this.programarSueltas(ahora) || cambio;
    cambio = this.moverMascotas(ahora, dt) || cambio;
    cambio = this.revisarRotulos(ahora) || cambio;
    if (!this.seMueve()) this.ultimo = null;
    if (cambio) this.avisar();
    return cambio;
  }

  private moverPersonas(dt: number): boolean {
    let cambio = false;
    for (const p of this.personas.values()) {
      const c = p.camino;
      if (!c || this.enPausa(p)) continue;
      c.d = Math.min(c.rec.largo, c.d + (VELOCIDAD * dt) / 1000);
      const { pos, dir } = enRecorrido(c.rec, c.d);
      p.pos = pos;
      if (dir !== p.dir) {
        p.dir = dir;
        this.tocar(p.prefijo);
        cambio = true;
      }
      if (c.d >= c.rec.largo) {
        p.camino = null;
        p.pos = { ...c.rec.puntos.at(-1)! };
        p.dir = "abajo";
        if (esFila(c.hacia) || esMesa(c.hacia)) {
          p.lugar = esFila(c.hacia) ? "fila" : "mesa";
          p.en = c.hacia;
          // En la fila, de espaldas: mira tu escritorio.
          if (esFila(c.hacia)) p.dir = "arriba";
        } else p.lugar = c.hacia === "charla" ? "charla" : c.hacia === "vuelta" ? (p.asiento === null ? "junto" : "descanso") : c.hacia;
        if (p.lugar === "escritorio") this.abrirSobreMano(p);
        this.tocar(p.prefijo);
        cambio = true;
      }
    }
    return cambio;
  }

  /** Quien recibe una entrega llega a su escritorio con el sobre en la mano: lo abre ahí (la animación de siempre, 340 ms). */
  private abrirSobreMano(p: Persona): void {
    const s = this.sobresMano.find((x) => x.con === p.id);
    if (!s) return;
    this.sobresMano = this.sobresMano.filter((x) => x !== s);
    const puesto = this.salas.get(p.prefijo)?.plano.puestos[p.i];
    if (!puesto) return;
    const ahora = this.ahora();
    this.sobres.push({ id: this.sigId++, prefijo: p.prefijo, a: p.id, codigo: s.codigo, fase: "abre", t0: ahora, dur: 0, rec: null, pos: cubierta(puesto), tf: ahora, tMax: Infinity, rm: false, tSentado: null, tramo: "pasillo", vozHasta: 0 });
  }

  private moverSobres(ahora: number): boolean {
    let cambio = false;
    const quedan: Sobre[] = [];
    for (const s of this.sobres) {
      const quien = this.personas.get(s.a);
      const sala = this.salas.get(s.prefijo);
      if (!quien || !sala?.activa) {
        this.tocar(s.prefijo);
        cambio = true;
        continue;
      }
      const sentado = quien.lugar === "escritorio";
      const fase = s.fase;
      const tramoAntes = s.tramo;
      let fin = false;
      if (s.fase === "vuela" && s.rec) {
        const f = (ahora - s.t0) / s.dur;
        s.pos = enRecorrido(s.rec, easeInOutQuad(f) * s.rec.largo).pos;
        // Con la `y` que se dibuja (redondeada): a 19,6 ya se ve en el pasillo y ahí no va el código.
        s.tramo = Math.round(s.pos.y) < 20 ? "muro" : "pasillo";
        if (f >= 1) {
          s.fase = "llega";
          s.tf = ahora;
          s.pos = { ...s.rec.puntos.at(-1)! };
        }
      } else if (s.fase === "llega") {
        if (ahora - s.tf >= LLEGA_MS) {
          if (sentado) {
            s.fase = "abre";
            s.tf = ahora;
          } else {
            s.fase = "espera";
            s.tMax = s.tf + ESPERA_SOBRE_MS;
            s.tf = ahora;
          }
        }
      } else if (s.fase === "espera") {
        if (s.rm) {
          if (sentado && s.tSentado === null) s.tSentado = ahora;
          fin = (s.tSentado !== null && ahora - s.tSentado >= RM_SOBRE_MS) || ahora >= s.tMax;
        } else if (sentado) {
          s.fase = "abre";
          s.tf = ahora;
        } else fin = ahora >= s.tMax;
      } else if (s.fase === "abre") {
        fin = ahora - s.tf >= ABRE_MS;
      }
      // 0.6.0 (JST-240): mientras suena lo que dice quien entrega, el sobre sigue ahí (abierto, en su último cuadro).
      if (fin && ahora < s.vozHasta) fin = false;
      if (fin || s.fase !== fase || s.tramo !== tramoAntes) {
        this.tocar(s.prefijo);
        cambio = true;
      }
      if (!fin) quedan.push(s);
    }
    this.sobres = quedan;
    return cambio;
  }

  // -------------------------------------------------------------------------
  // Lo que se dibuja
  // -------------------------------------------------------------------------

  /** Está sentado en su escritorio (o no se conoce todavía: entonces se dibuja como siempre). */
  enEscritorio(id: string): boolean {
    const p = this.personas.get(id);
    return !p || p.lugar === "escritorio";
  }

  fuera(id: string): VistaFuera | null {
    const p = this.personas.get(id);
    if (!p || p.lugar === "escritorio") return null;
    const asiento = this.asientoDe(p);
    const sofa = p.lugar === "descanso" && !!asiento?.sofa;
    let anim: string;
    let quieto = false;
    const j = this.juntas.find((x) => x.de === p.id || x.a === p.id);
    if (p.camino) anim = ANIM_CAMINAR[p.dir];
    else if (p.lugar === "fila") {
      // De espaldas, mirando tu escritorio, quieto (JST-163 §14).
      anim = ANIM_CAMINAR.arriba;
      quieto = true;
    } else if (p.lugar === "mesa" && j) {
      // Frente a frente en la mesa: quien entrega habla los primeros 4 s; quien recibe, de 1,5 a 4 s.
      const t = j.fase === "hablar" ? this.ahora() - j.tf : -1;
      const habla = p.id === j.de ? t >= 0 && t < HABLA_ENTREGA_MS : t >= RESPONDE_MS && t < RESPONDE_MS + HABLA_RECIBE_MS;
      anim = `${habla && !this.op.rm ? "charlar" : "escuchar"}-${j.mira[p.id] ?? "der"}`;
    } else if (p.charla) {
      const ch = p.charla;
      const habla = ch.fase === "hablar" && ch.viendo >= 0 && ch.lineas[ch.viendo]?.quien === p.id;
      anim = sofa ? "sofa" : `${habla ? "charlar" : "escuchar"}-${ch.mira[p.id] ?? "der"}`;
    } else anim = sofa ? "sofa" : "libre";
    const h = p.camino?.hacia;
    const hacia: VistaFuera["hacia"] = !h ? null : h === "escritorio" ? "escritorio" : esFila(h) ? "fila" : esMesa(h) ? "mesa" : "descanso";
    const enFila = p.lugar === "fila" && p.en && esFila(p.en) ? Number(p.en.slice(5)) : null;
    return { pos: redondo(p.pos), anim, caminando: !!p.camino, hacia, sofa, quieto, fila: enFila, junta: !!j };
  }

  /** «✓ listo» (JST-163 §7): si se ve ahora, la tarea que terminó. */
  listo(id: string): { codigo: string | null } | null {
    const p = this.personas.get(id);
    if (!p || !this.enListo(p, this.ahora())) return null;
    return { codigo: this.listos.get(id)?.codigo ?? null };
  }

  /** Su lugar en tu fila (0 = el primero), si le tocó uno, aunque todavía vaya caminando. */
  lugarEnFila(id: string): number | undefined {
    return this.fila.get(id);
  }

  /** La entrega en la mesa de la sala, mientras hablan (JST-163 §10). A 1x no hay. */
  juntaDe(prefijo: string): VistaJunta | null {
    const j = this.juntas.find((x) => x.prefijo === prefijo && x.fase === "hablar");
    const pd = j ? this.personas.get(j.de) : undefined;
    const pa = j ? this.personas.get(j.a) : undefined;
    if (!j || !pd || !pa) return null;
    return {
      id: j.id,
      codigo: j.codigo,
      para: nombreCortoVoz(pa.nombre),
      de: { id: pd.id, pos: redondo(pd.pos), lado: j.mira[pd.id] ?? "izq" },
      a: { id: pa.id, pos: redondo(pa.pos), lado: j.mira[pa.id] ?? "der" },
      responde: this.ahora() - j.tf >= RESPONDE_MS,
      alto: j.alto,
      corre: j.cajas.corre,
      encima: j.cajas.encima,
    };
  }

  /** Lo que les queda juntos en la mesa a los de la entrega `id` (ms), o 0 si ya se separaron o se cortó: la voz espera su audio mientras tanto (JST-237). */
  restoJunta(id: number): number {
    const j = this.juntas.find((x) => x.id === id && x.fase === "hablar");
    return j ? Math.max(0, j.tf + JUNTOS_MS - this.ahora()) : 0;
  }

  /** El sobre de cada entrega en la mesa de la sala: en la mano de quien lo lleva o sobre la mesa. */
  sobresManoDe(prefijo: string): VistaSobreMano[] {
    const out: VistaSobreMano[] = [];
    for (const s of this.sobresMano) {
      if (s.prefijo !== prefijo) continue;
      if (s.enMesa) {
        out.push({ id: s.junta, pos: { ...s.mesa }, z: s.mesa.y + 9, mueve: false });
        continue;
      }
      const p = s.con ? this.personas.get(s.con) : undefined;
      if (!p || p.lugar === "escritorio") continue;
      const m = this.enMano(p);
      out.push({ id: s.junta, pos: m, z: m.z, mueve: !!p.camino });
    }
    return out;
  }

  /** Dónde va el sobre en la mano: al lado de hacia donde camina, a la altura de la mano. */
  private enMano(p: Persona): Punto & { z: number } {
    const { x, y } = redondo(p.pos);
    return { x: x + (p.dir === "izq" ? -7 : 7), y: y - 9, z: y + 1 };
  }

  sobresDe(prefijo: string, chico: boolean): VistaSobre[] {
    return this.sobres
      .filter((s) => s.prefijo === prefijo)
      .map((s) => {
        const quien = this.personas.get(s.a);
        const sentado = quien?.lugar === "escritorio";
        const viene = !!quien?.camino && quien.camino.hacia === "escritorio" && quien.codigo === s.codigo;
        let etiqueta: VistaSobre["etiqueta"] = null;
        if (!chico) {
          if (s.fase === "vuela") etiqueta = s.tramo === "muro" ? "muro" : null;
          else if ((s.fase === "llega" || s.fase === "espera") && !sentado && !viene) etiqueta = "arriba";
        }
        // 0.5.0 (JST-163 §10): mientras vuela por el muro (o quieto, con movimiento reducido), dice para quién va.
        const para = etiqueta && (s.fase === "vuela" || s.rm) && quien ? nombreCortoVoz(quien.nombre) : null;
        return { id: s.id, pos: redondo(s.pos), fase: s.fase, codigo: s.codigo, etiqueta, para };
      });
  }

  /** Sentado en el sofá: su globo va 4 px más abajo. */
  private enSofa(p: Persona): boolean {
    return p.lugar === "descanso" && !!this.asientoDe(p)?.sofa;
  }

  /** Dónde empieza su globo: sobre la cabeza (en el sofá, 4 px más abajo). */
  private cabeza(p: Persona): number {
    return Math.round(p.pos.y) - (this.enSofa(p) ? 21 : 25);
  }

  /**
   * El hilo de la conversación de la sala (JST-162 §5.1): la frase que se dice
   * y, desde la segunda, la anterior arriba. Va al medio de los dos, sobre la
   * cabeza más alta; cada globo hacia el lado de quien lo dice.
   */
  charlaDe(prefijo: string): VistaCharla | null {
    const ch = this.charlas.find((c) => c.prefijo === prefijo);
    if (!ch || ch.fase !== "hablar" || ch.viendo < 0) return null;
    const a = this.personas.get(ch.a);
    const b = this.personas.get(ch.b);
    const linea = ch.lineas[ch.viendo];
    const p = linea ? this.personas.get(linea.quien) : undefined;
    if (!a || !b || !linea || !p) return null;
    const globo = (i: number): GloboHilo | null => {
      const l = ch.lineas[i];
      const q = l ? this.personas.get(l.quien) : undefined;
      if (!l || !q) return null;
      return { clave: `${ch.id}:${i}`, quien: q.id, linea: l, lado: ch.mira[q.id] === "izq" ? "der" : "izq", piesX: Math.round(q.pos.x) };
    };
    return {
      id: ch.id,
      clave: `${ch.id}:${ch.viendo}`,
      quien: p.id,
      pos: redondo(p.pos),
      sofa: this.enSofa(p),
      centro: { x: Math.round((a.pos.x + b.pos.x) / 2), y: Math.min(this.cabeza(a), this.cabeza(b)) },
      anterior: ch.viendo > 0 ? globo(ch.viendo - 1) : null,
      actual: globo(ch.viendo)!,
    };
  }

  /** 0.6.0: el audio de la frase suelta dura más que su globo: el globo dura lo que el audio + 0,4 s. */
  alargarSuelta(id: number, ms: number): void {
    const s = this.sueltas.find((x) => x.id === id);
    if (!s || this.ahora() + ms <= s.t0 + s.dur) return;
    s.dur = this.ahora() + ms - s.t0;
    this.despertador?.();
  }

  /** 0.6.0: lo mismo con lo que dice una mascota. */
  alargarMascota(id: TipoMascota, ms: number): void {
    const m = this.mascotasVivas.find((x) => x.id === id);
    if (!m?.dice) return;
    m.dice.hasta = Math.max(m.dice.hasta, this.ahora() + ms);
    this.despertador?.();
  }

  /** 0.6.0 (JST-240): el sobre de una entrega sigue a la vista (y con él su 🔊) mientras suena lo que dice quien entrega. */
  alargarSobre(id: number, ms: number): void {
    const s = this.sobres.find((x) => x.id === id);
    if (!s) return;
    s.vozHasta = Math.max(s.vozHasta, this.ahora() + ms);
    this.despertador?.();
  }

  /** El sobre de esa entrega todavía se ve: si ya se fue, su audio no suena (no habría nada a la vista). */
  haySobre(id: number): boolean {
    return this.sobres.some((x) => x.id === id);
  }

  /** La frase suelta de la sala, si alguien está diciendo una (JST-162 §1.6). */
  sueltaDe(prefijo: string): VistaSuelta | null {
    const s = this.sueltas.find((x) => x.prefijo === prefijo);
    const p = s ? this.personas.get(s.quien) : undefined;
    if (!s || !p) return null;
    return { clave: `t:${s.id}`, quien: p.id, linea: s.linea, pos: redondo(p.pos), sofa: this.enSofa(p) };
  }

  /** Hay un globo de conversación (o una frase suelta) a la vista en la sala y alguien camina con su globo (hay que revisar si se tocan). */
  hayQueRevisarGlobos(prefijo: string): boolean {
    const ch = this.charlas.find((c) => c.prefijo === prefijo);
    const hay = (!!ch && ch.fase === "hablar" && ch.viendo >= 0) || this.sueltas.some((s) => s.prefijo === prefijo) || this.juntas.some((j) => j.prefijo === prefijo && j.fase === "hablar");
    if (!hay) return false;
    for (const p of this.personas.values()) if (p.prefijo === prefijo && p.camino && p.st !== "libre") return true;
    return false;
  }

  mascotas(): VistaMascota[] {
    return this.mascotasVivas.map((m) => ({
      id: m.id,
      pos: redondo(m.pos),
      cama: m.cama,
      anim: m.modo === "dormir" ? "dormir" : `${m.modo}-${m.dir}`,
      dormida: m.modo === "dormir",
      dice: m.dice?.texto ?? null,
      lado: m.dice ? this.ladoMascota(m) : m.dir,
    }));
  }

  // -------------------------------------------------------------------------
  // Rótulo de la sala (JST-138)
  // -------------------------------------------------------------------------

  /** Los rótulos de este piso: uno por sala a 2x y 3x, o uno solo bajo el piso a 1x. */
  private clavesRotulo(): string[] {
    if (!this.plano) return [];
    return this.plano.escala === 1 ? [ROTULO_PISO] : this.plano.salas.map((s) => s.prefijo);
  }

  private estadoRotulo(clave: string): EstadoRotulo {
    let st = this.rotulos.get(clave);
    if (!st) {
      st = { pin: null, mouse: false, foco: false, manual: null, quietoHasta: -Infinity, retenido: null, visto: "", dibujado: null, dibujadoDesde: -Infinity, alVolver: null };
      this.rotulos.set(clave, st);
    }
    return st;
  }

  /** La sala respondió (ni cargando ni a oscuras) y entra en el filtro (§3.1 y §7). */
  private salaConRotulo(prefijo: string): boolean {
    const filtro = this.op.filtro ?? [];
    return !!this.salas.get(prefijo)?.activa && (filtro.length === 0 || filtro.includes(prefijo));
  }

  /** Lo que el rótulo sabe de `p` en el instante `t`, con la hora que dice su pastilla en ese paso (JST-192). */
  private agenteRotulo(p: Persona, t = this.ahora()): AgenteRotulo {
    const hora = this.horaRotulo(p, t);
    const run = p.run && hora !== (p.run.hora ?? null) ? { ...p.run, hora } : p.run;
    return { id: p.id, prefijo: p.prefijo, nombre: p.nombre, st: p.st, espera: p.espera, run };
  }

  /** Los agentes de la sala, en el orden de sus escritorios. */
  private agentesDeSala(prefijo: string, t = this.ahora()): AgenteRotulo[] {
    return (this.salas.get(prefijo)?.ids ?? []).flatMap((id) => {
      const p = this.personas.get(id);
      return p ? [this.agenteRotulo(p, t)] : [];
    });
  }

  /** La vuelta de un rótulo y su reloj: la de la sala (6 s, con su desfase) o la de 1x (5 s, todas las empresas). `null`: no hay rótulo. */
  private vueltaDe(clave: string, t = this.ahora()): { vuelta: ItemRotulo[]; indiceSala: number; nSalas: number; paso: number } | null {
    const plano = this.plano;
    if (!plano) return null;
    if (clave === ROTULO_PISO) {
      // No sale mientras la oficina carga (§3.6).
      if (plano.escala !== 1 || this.op.cargando) return null;
      const agentes = plano.salas.filter((s) => this.salaConRotulo(s.prefijo)).flatMap((s) => this.agentesDeSala(s.prefijo, t));
      return { vuelta: vueltaDelPiso(agentes), ...this.relojRotulo(clave) };
    }
    const i = plano.salas.findIndex((s) => s.prefijo === clave);
    if (plano.escala === 1 || i < 0 || !plano.salas[i]!.rotulo || !this.salaConRotulo(clave)) return null;
    return { vuelta: vueltaDeSala(this.agentesDeSala(clave, t)), ...this.relojRotulo(clave) };
  }

  /** El reloj de un rótulo: el de su sala (cada 6 s, con su desfase) o el de 1x (cada 5 s). */
  private relojRotulo(clave: string): { indiceSala: number; nSalas: number; paso: number } {
    const salas = this.plano?.salas ?? [];
    if (clave === ROTULO_PISO) return { indiceSala: 0, nSalas: 1, paso: PASO_PISO_MS };
    return { indiceSala: Math.max(0, salas.findIndex((s) => s.prefijo === clave)), nSalas: salas.length, paso: PASO_SALA_MS };
  }

  /** Cuándo empezó el paso que va en `t` del rótulo que cuenta a `p` (el de su sala o, a 1x, el del piso). */
  private inicioDePaso(p: Persona, t: number): number {
    const r = this.relojRotulo(this.plano?.escala === 1 ? ROTULO_PISO : p.prefijo);
    return proximoPaso(t, 2, r.indiceSala, r.nSalas, { paso: r.paso })! - r.paso;
  }

  /**
   * JST-192: llega otra hora para el globo de `p` (en su instante del minuto,
   * `HorasDeGlobos`). Su pastilla en el rótulo la dice recién en el próximo
   * paso del rótulo, así no cambian los dos en el mismo instante. Con otro run
   * (otro código, o deja la cola) el rótulo cambia de todos modos: va al tiro.
   */
  private cambiarHora(p: Persona, run: AgenteRotulo["run"], t: number): void {
    const antes = p.run?.hora ?? null;
    if ((run?.hora ?? null) === antes) return;
    if (!p.run || !run || p.run.codigo !== run.codigo || p.run.enCola !== run.enCola) {
      p.horaDesde = -Infinity;
      return;
    }
    // Si la pastilla todavía no decía la anterior, sigue con la de antes de esa.
    if (!this.horaPendiente(p, t)) p.horaAntes = antes;
    p.horaDesde = t;
  }

  /** La hora nueva de `p` todavía no llega a su pastilla: llegó después de que empezó el paso que va. */
  private horaPendiente(p: Persona, t: number): boolean {
    return t - p.horaDesde < Math.max(PASO_SALA_MS, PASO_PISO_MS) && p.horaDesde > this.inicioDePaso(p, t);
  }

  /** La hora que dice la pastilla de `p` en el instante `t`. */
  private horaRotulo(p: Persona, t: number): string | null {
    return this.horaPendiente(p, t) ? p.horaAntes : (p.run?.hora ?? null);
  }

  /** Está quieto (mouse o foco encima, después de un toque o con movimiento reducido): en qué posición de la vuelta. */
  private quietoEn(st: EstadoRotulo | undefined, t: number): number | null {
    if (!st) return null;
    return st.mouse || st.foco || st.quietoHasta > t || this.op.rm ? st.manual : null;
  }

  /** El usuario lo tiene quieto: mouse o foco en el rótulo, o un toque hace menos de 15 s (no el movimiento reducido). */
  private sostenido(st: EstadoRotulo | undefined, t: number): boolean {
    return !!st && (st.mouse || st.foco || st.quietoHasta > t);
  }

  /** Se suelta: sigue la vuelta según el reloj (con movimiento reducido, en la posición elegida). */
  private soltar(st: EstadoRotulo): void {
    st.retenido = null;
    if (!this.op.rm) st.manual = null;
  }

  /** El sobre más nuevo de la sala que salió hace menos de 6 s. Sin nombre conocido, dice para quién va (§2). */
  private itemSobre(prefijo: string, t: number): ItemRotulo | null {
    const e = this.entregas.filter((x) => x.prefijo === prefijo && t - x.t0 < SOBRE_MS).at(-1);
    if (!e) return null;
    const quien = nombreCorto(this.personas.get(e.a)?.nombre ?? "");
    const titulo = this.titulos?.titulo(e.codigo) ?? null;
    return { clave: `s:${e.id}`, tipo: "sobre", prefijo, agente: e.a, quien, codigo: e.codigo, mas: 0, texto: titulo ?? (quien ? `para ${quien}` : "") };
  }

  /** La entrega en la mesa de la sala, mientras dura: «🤝 BET-434 para Ingeniero frontend: Maqueta…» (JST-163 §10). */
  private itemEntrega(prefijo: string): ItemRotulo | null {
    const j = this.juntas.find((x) => x.prefijo === prefijo);
    if (!j) return null;
    const para = nombreCortoVoz(this.personas.get(j.a)?.nombre ?? "");
    const titulo = this.titulos?.titulo(j.codigo) ?? null;
    return { clave: `e:${j.id}`, tipo: "entrega", prefijo, agente: j.de, quien: nombreCorto(this.personas.get(j.de)?.nombre ?? ""), codigo: j.codigo, mas: 0, texto: `para ${para}${titulo ? `: ${titulo}` : ""}` };
  }

  /**
   * El «✓ listo» más nuevo de la sala, mientras se ve su globo: «✓ BET-414
   * Listo: QA — gate en solitario…» (JST-163 §7). Desde el fin del run, aunque
   * todavía se vea trabajando, y al menos 2 s si toma otra tarea: antes
   * esperaba a verlo libre y el rótulo pasaba primero a otro (JST-191).
   */
  private itemListo(prefijo: string, t: number): ItemRotulo | null {
    let mejor: { p: Persona; t0: number; codigo: string | null } | null = null;
    for (const [id, l] of this.listos) {
      const p = this.personas.get(id);
      if (!p || p.prefijo !== prefijo || !this.enListo(p, t)) continue;
      if (!mejor || l.t0 > mejor.t0) mejor = { p, t0: l.t0, codigo: l.codigo };
    }
    if (!mejor) return null;
    const titulo = mejor.codigo ? (this.titulos?.titulo(mejor.codigo) ?? null) : null;
    return { clave: `ok:${mejor.p.id}:${mejor.t0}`, tipo: "listo", prefijo, agente: mejor.p.id, quien: nombreCorto(mejor.p.nombre), codigo: mejor.codigo, mas: 0, texto: titulo ? `Listo: ${titulo}` : "Listo" };
  }

  private calcularRotulo(clave: string, t: number): RotuloCalculado | null {
    const v = this.vueltaDe(clave, t);
    if (!v) return null;
    const st = this.rotulos.get(clave);
    const enSala = clave !== ROTULO_PISO;
    const fijo = enSala && st?.pin ? this.personas.get(st.pin) : undefined;
    const r = rotuloEn(t, v.vuelta, v.indiceSala, v.nSalas, {
      pin: fijo && fijo.prefijo === clave ? itemDeAgente(this.agenteRotulo(fijo, t)) : null,
      // 0.5.0 (JST-163): mientras dura una entrega en la mesa, la cuenta; si no, un «✓ listo» que se ve.
      sobre: enSala ? (this.itemSobre(clave, t) ?? this.itemEntrega(clave) ?? this.itemListo(clave, t)) : null,
      // 0.4.0 (JST-162 §5.3): mientras hay una conversación, el rótulo sigue su vuelta; la tarea va en el hilo.
      frase: null,
      quieto: this.quietoEn(st, t),
      sostenido: this.sostenido(st, t),
      retenido: st?.retenido ?? null,
      rm: this.op.rm,
      paso: v.paso,
    });
    const { item, indice } = this.loDeAntes(st, t, v.vuelta, r);
    if (!item) return null;
    // En una conversación no hay anillo: el globo de la frase ya está a la vista (§3.2).
    const anillo = enSala && item.tipo !== "charla" && item.tipo !== "entrega" ? item.agente : null;
    const nuevo = { item, indice, navegable: v.vuelta.length > 1, quieto: this.op.rm || !!st?.mouse || !!st?.foco, anillo };
    // JST-191: si recién cambió, lo que el usuario no pidió espera (lo que el usuario hace borra `dibujadoDesde`).
    if (st?.dibujado && t - st.dibujadoDesde < ENTRE_CAMBIOS_MS && firmaRotulo(nuevo) !== firmaRotulo(st.dibujado)) return st.dibujado;
    return nuevo;
  }

  /**
   * Al volver a la pestaña (o al cerrarse el TV), cada rótulo sigue con lo que
   * contaba hasta el próximo paso de su reloj. Si no, los que avanzaron
   * mientras no se veía cambiarían todos en el mismo instante, y otra vez al
   * llegar la relectura (§3.4, JST-155).
   */
  private retenerRotulos(ahora: number): void {
    for (const clave of this.clavesRotulo()) {
      const st = this.rotulos.get(clave);
      if (!st) continue;
      st.alVolver = null;
      const v = this.vueltaDe(clave);
      if (!v || !st.dibujado || this.op.rm) continue;
      // Su próximo paso, aunque hoy cuente una sola cosa: la relectura puede traer más.
      st.alVolver = { item: st.dibujado.item, hasta: proximoPaso(ahora, 2, v.indiceSala, v.nSalas, { paso: v.paso })! };
    }
  }

  /**
   * Lo que contaba el rótulo al volver a la pestaña, al día si sigue en la
   * vuelta, o lo que toca ahora. Termina en su próximo paso, con lo que se
   * adelanta (el mouse sobre un agente, un sobre, una frase) o si el usuario
   * lo deja quieto (JST-155).
   */
  private loDeAntes(st: EstadoRotulo | undefined, t: number, vuelta: readonly ItemRotulo[], r: { item: ItemRotulo | null; indice: number | null; adelantado: boolean }): { item: ItemRotulo | null; indice: number | null } {
    const antes = st?.alVolver;
    if (!st || !antes) return r;
    if (t >= antes.hasta || r.adelantado || st.mouse || st.foco || st.quietoHasta > t) {
      st.alVolver = null;
      return r;
    }
    const i = vuelta.findIndex((x) => x.clave === antes.item.clave);
    return i >= 0 ? { item: vuelta[i]!, indice: i } : { item: antes.item, indice: r.indice };
  }

  /**
   * Qué cuenta ahora el rótulo de la sala `prefijo` (§3.3), o `null` si no
   * lleva: cargando, a oscuras, fuera del filtro, a 1x o sin nada que contar.
   * Con `ROTULO_PISO`, el de 1x bajo el piso (§3.6). Con la pestaña oculta
   * (o el piso tapado por el TV) la página vuelve a dibujar igual, por la hora:
   * el rótulo sigue con lo que se veía al irse, y al volver cambia recién en su
   * paso (JST-158).
   */
  rotuloDe(clave: string): VistaRotulo | null {
    const st = this.estadoRotulo(clave);
    if (this.op.oculta && st.dibujado && this.vueltaDe(clave)) return st.dibujado;
    const ahora = this.ahora();
    const v = this.calcularRotulo(clave, ahora);
    st.visto = firmaRotulo(v);
    // Aparecer (desde nada) no cuenta como cambio.
    if (st.dibujado && st.visto !== firmaRotulo(st.dibujado)) st.dibujadoDesde = ahora;
    st.dibujado = v;
    return v;
  }

  private tocarRotulo(clave: string): void {
    if (clave === ROTULO_PISO) this.versionPiso += 1;
    else this.tocar(clave);
  }

  /** Cambió lo que cuenta algún rótulo (su reloj, un sobre que se va, el fin de un toque): sube la versión de su sala. */
  private revisarRotulos(t: number): boolean {
    let cambio = false;
    for (const clave of this.clavesRotulo()) {
      const st = this.estadoRotulo(clave);
      if (st.quietoHasta !== -Infinity && st.quietoHasta <= t) {
        st.quietoHasta = -Infinity;
        if (!st.mouse && !st.foco) this.soltar(st);
      }
      const firma = firmaRotulo(this.calcularRotulo(clave, t));
      if (firma === st.visto) continue;
      st.visto = firma;
      this.tocarRotulo(clave);
      cambio = true;
    }
    this.entregas = this.entregas.filter((e) => t - e.t0 < SOBRE_MS);
    return cambio;
  }

  /**
   * Cuándo cambia solo un rótulo: el próximo paso de su vuelta, el fin de un
   * toque o el de un sobre, lo que esperaba porque recién cambió o la hora
   * nueva de su pastilla.
   */
  private proximoRotulo(clave: string, ahora: number): number | null {
    const v = this.vueltaDe(clave, ahora);
    if (!v) return null;
    const st = this.rotulos.get(clave);
    let t = proximoPaso(ahora, v.vuelta.length, v.indiceSala, v.nSalas, { quieto: this.quietoEn(st, ahora), rm: this.op.rm, paso: v.paso }) ?? Infinity;
    // JST-192: la pastilla dice la hora nueva en el próximo paso, aunque la vuelta no avance (una sola tarea, quieta).
    for (const p of this.personas.values()) {
      if ((clave === ROTULO_PISO || p.prefijo === clave) && this.horaPendiente(p, ahora)) {
        t = Math.min(t, proximoPaso(ahora, 2, v.indiceSala, v.nSalas, { paso: v.paso })!);
        break;
      }
    }
    if (st && st.quietoHasta > ahora) t = Math.min(t, st.quietoHasta);
    if (st && st.dibujadoDesde + ENTRE_CAMBIOS_MS > ahora) t = Math.min(t, st.dibujadoDesde + ENTRE_CAMBIOS_MS);
    if (st?.alVolver && st.alVolver.hasta > ahora) t = Math.min(t, st.alVolver.hasta);
    for (const e of this.entregas) if (e.prefijo === clave && e.t0 + SOBRE_MS > ahora) t = Math.min(t, e.t0 + SOBRE_MS);
    return Number.isFinite(t) ? t : null;
  }

  /** El mouse o el foco entra a un agente (`id`) o sale (`null`): el rótulo de su sala cuenta lo suyo y su globo lleva el anillo (§4). */
  fijarPin(prefijo: string, id: string | null): void {
    const st = this.estadoRotulo(prefijo);
    if (st.pin === id) return;
    st.pin = id;
    st.dibujadoDesde = -Infinity;
    this.tocarRotulo(prefijo);
    this.avisar();
  }

  /**
   * El mouse sobre el rótulo o el foco adentro: queda quieto en lo que se ve y
   * aparecen ‹ › (§3.5). Si se veía un sobre o una frase, sigue a la vista;
   * mientras tanto no se adelanta ninguno nuevo (JST-152). Al salir los dos,
   * sigue la vuelta según el reloj.
   */
  pausarRotulo(clave: string, por: "mouse" | "foco", quieto: boolean): void {
    const st = this.estadoRotulo(clave);
    if (st[por] === quieto) return;
    const t = this.ahora();
    if (quieto && !this.sostenido(st, t)) {
      const r = this.calcularRotulo(clave, t);
      if (!this.op.rm) st.manual = r?.indice ?? null;
      st.retenido = esAviso(r?.item) ? r!.item : null;
    }
    st[por] = quieto;
    if (!this.sostenido(st, t)) this.soltar(st);
    st.dibujadoDesde = -Infinity;
    this.tocarRotulo(clave);
    this.avisar();
  }

  /**
   * La posición de la vuelta a `paso` de lo que se ve. Desde un sobre o una
   * frase, la siguiente es la de la vuelta que tapaban.
   */
  private posicionDesde(clave: string, t: number, paso: number): number {
    const r = this.calcularRotulo(clave, t);
    return (r?.indice ?? 0) + (paso > 0 && esAviso(r?.item) ? 0 : paso);
  }

  /** ‹ ›: la anterior (−1) o la siguiente (+1) de la vuelta (§3.5). */
  moverRotulo(clave: string, paso: number): void {
    const st = this.estadoRotulo(clave);
    st.manual = this.posicionDesde(clave, this.ahora(), paso);
    st.retenido = null;
    st.dibujadoDesde = -Infinity;
    this.tocarRotulo(clave);
    this.avisar();
  }

  /** Un toque en una pantalla táctil: pasa a la siguiente y queda quieto 15 s (§3.5), sin que lo cambie un sobre ni una frase. */
  toqueRotulo(clave: string): void {
    const st = this.estadoRotulo(clave);
    const t = this.ahora();
    st.manual = this.posicionDesde(clave, t, 1);
    st.retenido = null;
    st.quietoHasta = t + QUIETO_TOQUE_MS;
    st.dibujadoDesde = -Infinity;
    this.tocarRotulo(clave);
    this.avisar();
  }

  // -------------------------------------------------------------------------
  // Posiciones en cada cuadro, sin volver a dibujar
  // -------------------------------------------------------------------------

  /**
   * La UI registra lo que se mueve: `p:<id>` (personaje), `b:<id>` (su globo),
   * `fa:`/`fd:` (marcas a 1x), `s:<n>` (sobre), `sm:<n>` (sobre en la mano,
   * 0.5.0), `m:<tipo>` (mascota). Cada
   * dibujo de React lo vuelve a registrar: ahí la posición vuelve a ser la que
   * dibujó React (`--x`, `--y`), y se borra lo escrito en el último cuadro.
   */
  registrar(clave: string, el: ElementoMovible | null): void {
    if (el) {
      this.elementos.set(clave, el);
      el.style.transform = "";
    } else this.elementos.delete(clave);
    this.escritos.delete(clave);
  }

  /**
   * Escribe `transform` directo (no `--x`/`--y`): cambiar variables CSS, que se
   * heredan, hace recalcular los estilos de todo lo de abajo en cada cuadro.
   */
  private escribir(clave: string, x: number, y: number, z?: number): void {
    const el = this.elementos.get(clave);
    if (!el) return;
    const valor = `${x},${y},${z ?? ""}`;
    if (this.escritos.get(clave) === valor) return;
    this.escritos.set(clave, valor);
    const px = this.plano?.escala ?? 1;
    el.style.transform = `translate(${x * px}px, ${y * px}px)`;
    if (z !== undefined) el.style.zIndex = String(z);
  }

  /**
   * Mueve lo que camina, vuela o pasea a su posición de ahora (pixeles enteros
   * de arte). Solo eso: lo demás está quieto donde lo dibujó React.
   */
  pintarPosiciones(): void {
    for (const p of this.personas.values()) {
      if (!p.camino) continue;
      const { x, y } = redondo(p.pos);
      this.escribir(`p:${p.id}`, x - 8, y - 24, y);
      this.escribir(`b:${p.id}`, x, y - 23);
      this.escribir(`fa:${p.id}`, x - 8, y - 36);
      this.escribir(`fd:${p.id}`, x + 3, y - 26);
    }
    for (const s of this.sobres) {
      if (s.fase !== "vuela") continue;
      const { x, y } = redondo(s.pos);
      this.escribir(`s:${s.id}`, x, y);
    }
    // El sobre en la mano de quien camina a la mesa (o de quien se lo lleva a su escritorio).
    for (const s of this.sobresMano) {
      const p = s.con ? this.personas.get(s.con) : undefined;
      if (!p?.camino || s.enMesa) continue;
      const m = this.enMano(p);
      this.escribir(`sm:${s.junta}`, m.x, m.y, m.z);
    }
    for (const m of this.mascotasVivas) {
      if (m.modo !== "caminar") continue;
      const { x, y } = redondo(m.pos);
      this.escribir(`m:${m.id}`, x - 8, y - 16);
    }
  }

  private entre([a, b]: readonly [number, number]): number {
    return a + this.azar() * (b - a);
  }
}

// ---------------------------------------------------------------------------
// Ayudantes
// ---------------------------------------------------------------------------

/** A dónde va (caminando o esperando su turno) o dónde está: su escritorio, el descanso, su lugar en la fila o en la mesa. */
function destino(p: Persona): Destino {
  if (p.turno) return p.turno.hacia;
  if (p.camino) return p.camino.hacia === "charla" || p.camino.hacia === "vuelta" ? "descanso" : p.camino.hacia;
  if (p.lugar === "escritorio") return "escritorio";
  if ((p.lugar === "fila" || p.lugar === "mesa") && p.en) return p.en;
  return "descanso";
}

/** Lo que el rótulo cuenta de un agente (sin los nombres): si cambia, cambia su vuelta. */
function firmaAgenteRotulo(a: { espera?: AgenteRotulo["espera"]; run?: AgenteRotulo["run"] }): string {
  return `${a.espera?.codigo ?? ""}:${a.espera?.mas ?? ""}|${a.run?.codigo ?? ""}:${a.run?.enCola ? 1 : 0}:${a.run?.hora ?? ""}`;
}

/** Lo que se ve de un rótulo: si cambia, se vuelve a dibujar. */
function firmaRotulo(v: VistaRotulo | null): string {
  return v ? `${v.item.clave}|${v.item.texto}|${v.item.hora ?? ""}|${v.navegable ? 1 : 0}|${v.quieto ? 1 : 0}|${v.anillo ?? ""}` : "";
}

/** Las mismas frases, dichas por los mismos y con la misma tarea (lo que se dice en voz alta). */
function mismasLineas(x: readonly Linea[], y: readonly Linea[]): boolean {
  return x.length === y.length && x.every((l, i) => l.quien === y[i]!.quien && l.texto === y[i]!.texto && l.codigo === y[i]!.codigo && l.titulo === y[i]!.titulo);
}

function barajar<T>(lista: readonly T[], azar: () => number): T[] {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function clavePareja(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Lo que las conversaciones saben de cada agente (JST-162 §1.2), sin lecturas nuevas. */
function datosDeCharla(p: Persona, a: AgenteVida): void {
  p.empresa = a.empresa ?? "";
  p.rol = a.rol ?? null;
  p.rolApi = a.rolApi ?? null;
  p.motivo = a.motivo ?? null;
  p.esperaTipo = a.esperaTipo ?? null;
  p.esperaDesde = a.esperaDesde ?? null;
  p.runDesde = a.runDesde ?? null;
}

/** Lo que sirve de un evento del canal en vivo para el sobre: quién le pasó qué tarea a quién (`null` si no es una entrega entre dos agentes). */
export function entregaDeEvento(evento: { type: string; payload: Record<string, unknown> }): { de: string; a: string; codigo: string } | null {
  if (evento.type !== "activity.logged" || evento.payload.action !== "issue.updated") return null;
  const d = evento.payload.details as { identifier?: unknown; changes?: { assigneeAgentId?: { from?: unknown; to?: unknown } } } | null | undefined;
  const c = d?.changes?.assigneeAgentId;
  if (!c || typeof c.from !== "string" || typeof c.to !== "string" || !c.from || !c.to || typeof d?.identifier !== "string") return null;
  return { de: c.from, a: c.to, codigo: d.identifier };
}
