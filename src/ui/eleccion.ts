// Elegir las voces, en la página (0.11.0, JST-325; design-spec de JST-324).
// Guarda lo que el worker dejó en `voces/eleccion.json` (la voz del Resumen, la de
// «Leer contexto» y lo que tenía cada agente antes de cambiarlo) y lo que se está
// grabando al cambiar una voz, que se pregunta al worker (`voz-estado`) mientras
// dure. Cuando una voz nueva queda lista se vuelve a leer el índice de los audios,
// y los agentes ya hablan con ella.
//
// 0.13.0 (issue #9): «Preparar voces» (`voz-al-dia`): los motores elegidos, cómo
// va (bajando un modelo, grabando) y, con las voces al día, los agentes que se
// ven, para que el worker grabe lo de los nuevos o renombrados.
import { useSyncExternalStore } from "react";
import { accionPlugin } from "../fuentes.js";
import { eleccionInicial, leerEleccion, vozDeContexto, type EleccionVoces, type GrabandoVoz, type GrupoMotor, type VozLectura } from "../eleccionVoces.js";
import type { VozId } from "../voces.js";
import type { EstadoMotores } from "../vozViva.js";
import { baseUi, cargarIndice, instalacion } from "./audiosVoces.js";
import { estadoVozViva } from "./vozViva.js";

/** La elección se vuelve a leer a los 60 s (otra pestaña o el TV pudieron cambiarla). */
const RELEER_MS = 60_000;
/** Mientras se graba, el worker se pregunta cada 2,5 s. */
const SEGUIR_MS = 2_500;

let eleccion: EleccionVoces = eleccionInicial();
let leidaEn = 0;
let leyendo: Promise<EleccionVoces> | null = null;
let grabando: readonly GrabandoVoz[] = [];
let cambios = false;
let error: ErrorVoz | null = null;
/** 0.13.0: `null` hasta preguntar, o con un worker de antes de la 0.13.0 (no lo manda). */
let motores: EstadoMotores | null = null;
/** El botón «Preparar voces» no respondió (red, o el worker se reinicia). */
let errorPreparar = false;
const oyentes = new Set<() => void>();

/** Lo que falló al elegir, para decirlo bajo su fila y reintentar. */
export interface ErrorVoz {
  /** `resumen`, `contexto` o `agente:<id>`: bajo qué fila se muestra. */
  donde: string;
  motivo: "red" | "pedido" | "sin-mac" | "sin-voces" | "grabar";
  /** Para el botón «Reintentar». */
  pedido: Record<string, unknown>;
}

const avisar = () => {
  version += 1;
  for (const o of oyentes) o();
};
let version = 0;

const suscribir = (o: () => void) => {
  oyentes.add(o);
  return () => oyentes.delete(o);
};

/** Lo elegido, ya leído (o lo que queda al instalar). */
export function eleccionAhora(): EleccionVoces {
  return eleccion;
}

/** `eleccion.json` (sin caché: lo escribe el worker). Si no está o no se pudo leer, queda lo que había. */
export function cargarEleccion(forzar = false): Promise<EleccionVoces> {
  if (!forzar && leidaEn > 0 && Date.now() - leidaEn < RELEER_MS) return Promise.resolve(eleccion);
  leyendo ??= baseUi()
    .then(async (b) => {
      if (!b) return null;
      const r = await fetch(`${b}voces/eleccion.json?t=${Date.now()}`, { credentials: "include", cache: "no-store" });
      // Sin archivo: nadie eligió nada, vale lo que queda al instalar.
      return r.ok ? leerEleccion(await r.json()) : r.status === 404 ? eleccionInicial() : null;
    })
    .catch(() => null)
    .then((e) => {
      leyendo = null;
      leidaEn = Date.now();
      if (e) {
        eleccion = e;
        avisar();
      }
      return eleccion;
    });
  return leyendo;
}

export function useEleccion(): EleccionVoces {
  useSyncExternalStore(suscribir, () => version);
  return eleccion;
}

export function useGrabando(): readonly GrabandoVoz[] {
  useSyncExternalStore(suscribir, () => version);
  return grabando;
}

/** ¿Cambió algo respecto de lo que queda al instalar? (aparece «Volver a como estaba»). */
export function useHayCambios(): boolean {
  useSyncExternalStore(suscribir, () => version);
  return cambios;
}

/** 0.13.0: los motores que se pueden usar aquí y cómo va «Preparar voces» (`null`: todavía no se sabe). */
export function useEstadoMotores(): EstadoMotores | null {
  useSyncExternalStore(suscribir, () => version);
  return motores;
}

export function useErrorPreparar(): boolean {
  useSyncExternalStore(suscribir, () => version);
  return errorPreparar;
}

export function useErrorVoz(): ErrorVoz | null {
  useSyncExternalStore(suscribir, () => version);
  return error;
}

export function descartarError(): void {
  if (!error) return;
  error = null;
  avisar();
}

// ---------------------------------------------------------------------------
// Preguntarle al worker
// ---------------------------------------------------------------------------

interface EstadoElegir extends Partial<EstadoMotores> {
  disponible: boolean;
  motivo: string | null;
  eleccion: EleccionVoces;
  grabando: GrabandoVoz[];
  cambios: boolean;
}

/** Lo de «Preparar voces» que vino en una respuesta del worker (uno de antes de la 0.13.0 no lo manda). */
const motoresDe = (e: Partial<EstadoMotores>): EstadoMotores | null => (e.motores && e.porBajar && e.preparar ? { motores: e.motores, porBajar: e.porBajar, preparar: e.preparar } : null);

/** ¿Está bajando un modelo o grabando las frases que faltan? */
const preparando = (m: EstadoMotores | null) => m?.preparar.fase === "bajando" || m?.preparar.fase === "grabando";

/** Mientras se preparan, el índice se vuelve a leer cada 15 s como mucho: los agentes hablan con lo que ya está. */
const RELEER_INDICE_MS = 15_000;
let indiceLeidoEn = 0;

let reloj: ReturnType<typeof setTimeout> | null = null;
let seguirDe: string | null = null;

/** Lo que el worker tiene elegido y lo que está grabando; si terminó una voz, vuelve a leer el índice. */
export async function refrescarEstado(companyId: string): Promise<void> {
  const id = await instalacion().catch(() => null);
  const e = id ? await accionPlugin<EstadoElegir>({ base: "" }, id, "voz-estado", companyId, {}).catch(() => null) : null;
  if (!e) return;
  eleccion = leerEleccion(e.eleccion);
  leidaEn = Date.now();
  // Una voz nueva quedó lista: se lee el índice (que ya tiene al agente con ella) antes de dejar de mostrar «Grabando…»,
  // para que el selector no vuelva un instante a la voz de antes.
  if (grabando.length > (e.grabando?.length ?? 0)) await cargarIndice(true).catch(() => null);
  await alPreparar(motoresDe(e));
  grabando = e.grabando ?? [];
  cambios = !!e.cambios;
  avisar();
}

/** Lo nuevo de «Preparar voces»: al terminar (o de a poco, mientras graba), se vuelve a leer el índice. */
async function alPreparar(nuevo: EstadoMotores | null): Promise<void> {
  const antes = motores?.preparar;
  const ahora = Date.now();
  const termino = preparando(motores) && !preparando(nuevo);
  const avanzo = nuevo?.preparar.fase === "grabando" && nuevo.preparar.hechas > (antes?.hechas ?? 0) && ahora - indiceLeidoEn > RELEER_INDICE_MS;
  if (termino || avanzo) {
    indiceLeidoEn = ahora;
    await cargarIndice(true).catch(() => null);
  }
  motores = nuevo;
}

/** ¿Hay algo que seguir? (una voz que se graba, o «Preparar voces»). */
const hayQueSeguir = () => grabando.some((g) => !g.error) || preparando(motores);

/** Mientras haya algo grabándose, se vuelve a preguntar. */
function seguir(companyId: string): void {
  seguirDe = companyId;
  if (reloj) return;
  const vuelta = () => {
    reloj = null;
    if (!seguirDe) return;
    void refrescarEstado(seguirDe).then(() => {
      if (hayQueSeguir()) reloj = setTimeout(vuelta, SEGUIR_MS);
      else seguirDe = null;
    });
  };
  reloj = setTimeout(vuelta, SEGUIR_MS);
}

/** Al abrir el panel: lo que hay ahora y, si se está grabando, seguirlo. */
export async function abrirPanelVoces(companyId: string): Promise<void> {
  await refrescarEstado(companyId);
  if (hayQueSeguir()) seguir(companyId);
}

async function pedir<T>(companyId: string, accion: string, params: Record<string, unknown>): Promise<T | null> {
  const id = await instalacion().catch(() => null);
  return id ? accionPlugin<T>({ base: "" }, id, accion, companyId, params).catch(() => null) : null;
}

interface Respuesta {
  ok: boolean;
  motivo?: "pedido" | "sin-mac" | "sin-voces";
  eleccion: EleccionVoces;
}

/** ¿Esta acción puede cambiar la voz de un agente en `indice.json`? */
export function cambiaIndice(accion: string, params: Record<string, unknown>): boolean {
  return accion === "voz-reiniciar" || (accion === "voz-elegir" && params.quien === "agente");
}

async function mandar(companyId: string, accion: string, params: Record<string, unknown>, donde: string): Promise<boolean> {
  const r = await pedir<Respuesta>(companyId, accion, params);
  if (!r) {
    error = { donde, motivo: "red", pedido: { accion, params } };
    avisar();
    return false;
  }
  eleccion = leerEleccion(r.eleccion);
  leidaEn = Date.now();
  error = r.ok ? null : { donde, motivo: r.motivo ?? "pedido", pedido: { accion, params } };
  avisar();
  // Si no había nada que grabar (los audios de esa voz ya existían, o «Volver a como estaba»), el worker ya cambió el
  // índice y no habrá un fin de grabación que lo delate: se lee ahora, para que la fila y su ▶ muestren la voz guardada.
  if (r.ok && cambiaIndice(accion, params)) await cargarIndice(true).catch(() => null);
  await refrescarEstado(companyId);
  if (hayQueSeguir()) seguir(companyId);
  return r.ok;
}

/** La voz del Resumen o de «Leer contexto» (esta, también «igual» al Resumen). */
export function elegirLectura(companyId: string, quien: "resumen" | "contexto", voz: VozLectura | "igual"): Promise<boolean> {
  // Al tiro en la pantalla; el worker la guarda y lo confirma.
  eleccion = { ...eleccion, [quien]: voz } as EleccionVoces;
  avisar();
  return mandar(companyId, "voz-elegir", { quien, voz }, quien);
}

export interface AgenteVoz {
  id: string;
  corto: string;
  empresa: string;
}

/** La voz de un agente: sus frases se graban en la Mac y, mientras, sigue con la de antes. */
export function elegirVozAgente(companyId: string, a: AgenteVoz, voz: VozId): Promise<boolean> {
  return mandar(companyId, "voz-elegir", { quien: "agente", agenteId: a.id, voz, corto: a.corto, empresa: a.empresa }, `agente:${a.id}`);
}

export function reiniciarVoces(companyId: string): Promise<boolean> {
  return mandar(companyId, "voz-reiniciar", {}, "volver");
}

/** El botón «Reintentar» de un error. */
export function reintentar(companyId: string): Promise<boolean> {
  const e = error;
  if (!e) return Promise.resolve(false);
  return mandar(companyId, String(e.pedido.accion), e.pedido.params as Record<string, unknown>, e.donde);
}

// ---------------------------------------------------------------------------
// «Preparar voces» y voces al día (0.13.0, issue #9)
// ---------------------------------------------------------------------------

/** Lo que el worker necesita de cada agente para darle una voz y grabar sus frases. */
export interface AgenteParaVoz {
  id: string;
  nombre: string;
  empresa: string;
}

type RespuestaAlDia = EstadoMotores & { ok: boolean; eleccion: EleccionVoces };

async function alDia(companyId: string, params: Record<string, unknown>): Promise<RespuestaAlDia | null> {
  const r = await pedir<RespuestaAlDia>(companyId, "voz-al-dia", params);
  if (!r) return null;
  eleccion = leerEleccion(r.eleccion);
  leidaEn = Date.now();
  await alPreparar(motoresDe(r));
  avisar();
  if (hayQueSeguir()) seguir(companyId);
  return r;
}

/** El botón «Preparar voces»: guarda los motores elegidos y graba lo que falte de los agentes que se ven. */
export async function prepararVoces(companyId: string, agentes: readonly AgenteParaVoz[], elegidos: readonly GrupoMotor[]): Promise<boolean> {
  errorPreparar = false;
  avisar();
  const r = await alDia(companyId, { agentes, motores: elegidos, empezar: true });
  errorPreparar = !r?.ok;
  avisar();
  // Se cuentan como mandados: así la página no los vuelve a mandar enseguida.
  if (r?.ok) mandados.set(companyId, { firma: firmaDe(agentes), en: Date.now() });
  return !!r?.ok;
}

/** Los mismos agentes no se vuelven a mandar antes de 30 min (si el worker se reinició, ahí los vuelve a conocer). */
const REMANDAR_MS = 30 * 60_000;
const mandados = new Map<string, { firma: string; en: number }>();
const firmaDe = (agentes: readonly AgenteParaVoz[]) =>
  agentes
    .map((a) => `${a.id}|${a.nombre}|${a.empresa}`)
    .sort()
    .join("\n");

/**
 * Con las voces al día (se apretó «Preparar voces» alguna vez), la página le
 * manda al worker los agentes de cada empresa que ve cuando cambian (uno nuevo,
 * otro nombre) y cada 30 min: el worker graba lo que les falte. Sin «al día», no
 * manda nada.
 */
export async function mantenerAlDia(companyId: string, agentes: readonly AgenteParaVoz[]): Promise<void> {
  if (agentes.length === 0) return;
  const e = await cargarEleccion();
  if (!e.alDia) return;
  const firma = firmaDe(agentes);
  const antes = mandados.get(companyId);
  if (antes && antes.firma === firma && Date.now() - antes.en < REMANDAR_MS) return;
  mandados.set(companyId, { firma, en: Date.now() });
  // Si no respondió, se vuelve a intentar con el próximo cambio o a los 30 min.
  await alDia(companyId, { agentes });
}

// ---------------------------------------------------------------------------
// Quién lee
// ---------------------------------------------------------------------------

/**
 * La voz con que se lee ahora: la elegida, o `null` si eligió la del navegador, si no hay
 * `companyId` (no se puede pedir al worker) o si esta Mac no puede preparar voces (sin `uv` o `ffmpeg`),
 * para no esperar un audio que no va a llegar.
 */
export async function vozParaLeer(que: "resumen" | "contexto", companyId: string | null): Promise<VozId | null> {
  const e = await cargarEleccion();
  const v = que === "resumen" ? e.resumen : vozDeContexto(e);
  if (v === "navegador" || !companyId) return null;
  const est = await estadoVozViva(companyId).catch(() => null);
  return est && est.disponible === false ? null : v;
}

/** Abre el motor de la voz elegida antes de leer (el worker la mantiene lista 10 min). No espera ni falla. */
export function calentarVoz(que: "resumen" | "contexto", companyId: string | null): void {
  if (!companyId) return;
  void (async () => {
    const e = await cargarEleccion();
    const v = que === "resumen" ? e.resumen : vozDeContexto(e);
    if (v === "navegador") return;
    // El worker ya la mantiene abierta 10 min: no hace falta preguntar más de una vez por minuto por voz.
    const ahora = Date.now();
    if (ahora - (calentadas.get(v) ?? 0) < 60_000) return;
    calentadas.set(v, ahora);
    await pedir(companyId, "voz-calentar", { voz: v });
  })();
}

const calentadas = new Map<string, number>();

