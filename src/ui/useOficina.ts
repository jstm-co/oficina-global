// Datos en vivo de la oficina para React: un solo sincronizador por pestaña,
// compartido por la página, el widget y el modo TV (JST-66). Con la pestaña
// oculta se cierran los canales y, al volver, se recarga una vez.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Bloqueada } from "../bloqueos.js";
import { prefijoDe } from "../estado.js";
import type { Conexion } from "../fuentes.js";
import { HistorialRuns, HorasDeGlobos, textoGlobo } from "../hora.js";
import type { EntradaSala } from "../plano.js";
import { Sincronizador, type EstadoCarga } from "../sincronizador.js";
import { TitulosConocidos } from "../rotulo.js";
import { LectorTemas } from "../temas.js";
import { vistaDe, type AgenteVista } from "../vista.js";
import { alLlegarInstanciaTarde, cargarInstancia } from "./instanciaUi.js";

export interface EmpresaVista {
  id: string;
  prefijo: string;
  nombre: string;
  estado: EstadoCarga;
  /** Agentes de la última lectura buena, o los que había la última vez que se abrió (para dibujar la sala mientras carga). */
  agentes: number;
  /** `agentes` sale de una lectura de esta sesión (si no, es lo guardado de la vez anterior o 3). */
  conocidos: boolean;
}

export interface Oficina {
  /** `null` en el primer render, antes de conectar. */
  sync: Sincronizador | null;
  /** Todavía no se conocen las empresas. */
  iniciando: boolean;
  errorEmpresas: string | null;
  /** Empresas que se dibujan: las que tienen al menos 1 agente, o las que nunca se pudieron leer (§2, JST-77 · 1A). */
  empresas: EmpresaVista[];
  /** Empresas sin agentes: no tienen sala ni cuentan en «N empresas», pero se siguen leyendo en vivo. */
  ocultas: EmpresaVista[];
  /** Agentes de las empresas que respondieron. */
  agentes: AgenteVista[];
  /** Empresas que no respondieron (salas a oscuras). */
  caidas: EmpresaVista[];
  /** JST-426: tareas bloqueadas sin nadie moviéndolas (de todas las empresas; la página filtra). No cuentan como «te necesita». */
  bloqueadas: Bloqueada[];
  /** Alguna empresa no pudo leer «Te toca». */
  sinAtencion: boolean;
  cargando: boolean;
  reintentar(): void;
}

// ---------------------------------------------------------------------------
// Sincronizador compartido
// ---------------------------------------------------------------------------

let compartido: Sincronizador | null = null;
let usuarios = 0;
let version = 0;
const oyentes = new Set<() => void>();
let quitarVisibilidad: (() => void) | null = null;

const CLAVE_FORMA = "jstm.oficina-pixel.forma";
const CLAVE_SALAS = "jstm.oficina-pixel.salas";

/** Cuántos agentes tenía cada empresa la última vez: la estructura de las salas aparece enseguida al cargar (§12). */
function formaGuardada(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_FORMA) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

/** Lo leído en esta sesión; de una empresa que no respondió se conserva lo último que se guardó (JST-82). */
export function formaNueva(sync: Sincronizador, anterior: Record<string, number>): Record<string, number> {
  const forma: Record<string, number> = {};
  for (const empresa of sync.empresas) {
    const n = sync.numAgentes(empresa.id) ?? anterior[empresa.id];
    if (typeof n === "number") forma[empresa.id] = n;
  }
  return forma;
}

/**
 * Las salas que `armar` dibuja con esa forma (prefijo y agentes). Se guardan
 * para elegir la escala del piso mientras se leen las empresas, porque la
 * forma va por id y sin la lista de empresas no se sabe su prefijo (JST-89).
 */
export function salasDeForma(sync: Sincronizador, forma: Record<string, number>): EntradaSala[] {
  return sync.empresas.map((e) => ({ prefijo: prefijoDe(e), agentes: forma[e.id] ?? 3 })).filter((s) => s.agentes > 0);
}

function salasGuardadas(): EntradaSala[] {
  try {
    const salas: unknown = JSON.parse(localStorage.getItem(CLAVE_SALAS) ?? "[]");
    return Array.isArray(salas) ? salas.filter((s): s is EntradaSala => typeof s?.prefijo === "string" && typeof s?.agentes === "number") : [];
  } catch {
    return [];
  }
}

/** Las salas de la última vez, leídas al montar: con ellas se elige la escala del piso vacío (JST-89). */
export function useSalasPrevias(): EntradaSala[] {
  return useState(salasGuardadas)[0];
}

function guardarForma(sync: Sincronizador): void {
  // Si `/api/companies` falló no hay empresas: se conserva lo de la vez anterior.
  if (sync.empresas.length === 0) return;
  try {
    const forma = formaNueva(sync, formaGuardada());
    localStorage.setItem(CLAVE_FORMA, JSON.stringify(forma));
    localStorage.setItem(CLAVE_SALAS, JSON.stringify(salasDeForma(sync, forma)));
  } catch {
    // Sin almacenamiento local, la próxima carga parte con 3 escritorios por sala.
  }
}

/**
 * La vigía de los avisos (0.2.0) necesita los canales abiertos aunque la
 * pestaña esté oculta: mientras esto diga `true`, ocultarla no pausa el
 * sincronizador (las animaciones se pausan igual, por CSS).
 */
let mantenerVivo: () => boolean = () => false;

export function fijarMantenerVivo(fn: () => boolean): void {
  mantenerVivo = fn;
}

/** El sincronizador de la pestaña (uno solo para la página, el widget, el TV y la vigía). */
export function conectarCompartido(cx: Conexion): Sincronizador {
  usuarios += 1;
  if (compartido) return compartido;
  // Con la pestaña oculta, Chrome frena los temporizadores: los eventos se aplican sin la ventana de espera.
  const sync = new Sincronizador({ cx, sinEspera: () => document.hidden });
  compartido = sync;
  sync.alCambiar(() => {
    version += 1;
    if (!sync.empresas.some((e) => sync.estadoEmpresa(e.id).cargando)) guardarForma(sync);
    for (const oyente of oyentes) oyente();
  });
  const visibilidad = () => (document.hidden && !mantenerVivo() ? sync.pausar() : sync.reanudar());
  document.addEventListener("visibilitychange", visibilidad);
  // Si los datos de la instancia llegan después del tope, lo ya dibujado se vuelve a calcular con ellos.
  const quitarTarde = alLlegarInstanciaTarde(() => {
    version += 1;
    for (const oyente of oyentes) oyente();
  });
  quitarVisibilidad = () => {
    document.removeEventListener("visibilitychange", visibilidad);
    quitarTarde();
  };
  // Primero los datos de la instancia (aspecto, nombres cortos): ningún agente se dibuja ni se nombra antes de tenerlos.
  // Si mientras tanto se soltó el sincronizador (o se armó otro), no se inicia uno detenido.
  void cargarInstancia().then(() => {
    if (compartido !== sync) return;
    return sync.iniciar().then(() => {
      if (compartido === sync && document.hidden && !mantenerVivo()) sync.pausar();
    });
  });
  return sync;
}

export function soltarCompartido(): void {
  usuarios -= 1;
  if (usuarios > 0 || !compartido) return;
  compartido.detener();
  compartido = null;
  quitarVisibilidad?.();
  quitarVisibilidad = null;
}

/** Vuelve a aplicar la regla de la pestaña oculta (cuando la vigía empieza o deja de vigilar). */
export function revisarPausa(): void {
  if (!compartido || typeof document === "undefined") return;
  if (document.hidden && !mantenerVivo()) compartido.pausar();
  else compartido.reanudar();
}

let lector: { sync: Sincronizador; temas: LectorTemas } | null = null;
let titulos: { sync: Sincronizador; titulos: TitulosConocidos } | null = null;

/**
 * Los nombres de las tareas que la página ya leyó, uno por pestaña (JST-138
 * §2): las tareas de los runs que guarda el sincronizador, lo que te piden los
 * agentes y las lecturas de las conversaciones. Ninguna lectura nueva.
 */
export function titulosDe(sync: Sincronizador | null): TitulosConocidos | null {
  if (!sync) return null;
  if (titulos?.sync !== sync) titulos = { sync, titulos: new TitulosConocidos(() => sync.tareas.values()) };
  return titulos.titulos;
}

/**
 * Los temas de las conversaciones del descanso (0.3.0), uno por pestaña: oye
 * en el canal en vivo quién termina qué, y lee la cola de un agente con la
 * sesión del usuario solo al armar una conversación (JST-96 §6).
 */
export function temasDe(sync: Sincronizador | null): LectorTemas | null {
  if (!sync) return null;
  if (lector?.sync === sync) return lector.temas;
  const temas = new LectorTemas({ base: "" }, Date.now, titulosDe(sync));
  sync.alEventoVivo((_, evento) => temas.alEvento(evento));
  lector = { sync, temas };
  return temas;
}

let historial: { sync: Sincronizador; horas: HistorialRuns } | null = null;

/**
 * Los runs terminados de cada agente, para la hora estimada (0.5.0, spike de
 * JST-161), uno por pestaña: 1 lectura por agente al cargar (la pide el piso
 * después de dibujarse), y después lo que llega por el canal en vivo. Se
 * vuelve a leer un agente solo si su empresa reconecta, como mucho 1 vez por hora.
 */
export function horasDe(sync: Sincronizador | null): HistorialRuns | null {
  if (!sync) return null;
  if (historial?.sync === sync) return historial.horas;
  const horas = new HistorialRuns((companyId, agentId) => sync.runsDelAgente(companyId, agentId));
  sync.alEventoVivo((_, evento) => horas.alEvento(evento));
  sync.alReconectar((companyId) => horas.reconecto(companyId));
  historial = { sync, horas };
  return horas;
}

const sinHoras = () => () => undefined;
const versionCero = () => 0;

/**
 * La hora estimada de cada agente al día (0.5.0): se vuelve a calcular cada
 * minuto y cuando llega un run nuevo. Devuelve el historial y la hora con la
 * que se calcula (avanza de minuto en minuto).
 */
export function useHoras(sync: Sincronizador | null): { horas: HistorialRuns | null; ahora: number } {
  const horas = horasDe(sync);
  useSyncExternalStore(horas?.suscribir ?? sinHoras, horas?.version ?? versionCero);
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    let intervalo: ReturnType<typeof setInterval> | undefined;
    // Al cambiar el minuto, y desde ahí cada minuto.
    const primero = setTimeout(() => {
      setAhora(Date.now());
      intervalo = setInterval(() => setAhora(Date.now()), 60_000);
    }, 60_000 - (Date.now() % 60_000) + 50);
    return () => {
      clearTimeout(primero);
      if (intervalo) clearInterval(intervalo);
    };
  }, []);
  return { horas, ahora: Math.max(ahora, Date.now()) };
}

/** Quien trabaja en un run que empezó en `desde`: su globo lleva la hora estimada. */
export interface ConHora {
  id: string;
  desde: string | null | undefined;
}

/**
 * La hora estimada de los globos del piso (JST-192): cada agente la vuelve a
 * decir en su instante del minuto (`HorasDeGlobos`), no todos al cambiar el
 * minuto ni cada vez que el piso se vuelve a dibujar por otra cosa. El piso se
 * vuelve a dibujar justo cuando a alguno de `trabajan` le toca decir otra
 * cosa. Devuelve el historial, la hora de verdad y con qué hora se dice la de
 * cada uno.
 */
export function useHorasDelPiso(
  sync: Sincronizador | null,
  ids: readonly string[],
  nSalas: number,
  oculta: boolean,
  trabajan: readonly ConHora[],
): { horas: HistorialRuns | null; ahora: number; ahoraDe: (id: string, desde: string | null | undefined) => number } {
  const horas = horasDe(sync);
  useSyncExternalStore(horas?.suscribir ?? sinHoras, horas?.version ?? versionCero);
  const [, setVuelta] = useState(0);
  const ref = useRef<HorasDeGlobos | null>(null);
  ref.current ??= new HorasDeGlobos();
  const globos = ref.current;
  const t = performance.now();
  const ahora = Date.now();
  globos.fijarPiso(ids, nSalas);
  globos.fijarOculta(oculta, t);
  const ahoraDe = (id: string, desde: string | null | undefined) => globos.ahoraDe(id, desde ?? "", t, ahora);
  useEffect(() => {
    if (oculta || !horas) return;
    const desdeDe = new Map(trabajan.map((a) => [a.id, a.desde]));
    const cuando = globos.proximo(
      trabajan.map((a) => ({ id: a.id, run: a.desde ?? "" })),
      (id, real) => textoGlobo(horas.estimacion(id, desdeDe.get(id), real), real),
      t,
      ahora,
    );
    if (cuando === null) return;
    // 2 ms de más: así un temporizador que se adelanta no llega antes de su instante.
    const espera = setTimeout(() => setVuelta((n) => n + 1), Math.max(0, Math.ceil(cuando - performance.now())) + 2);
    return () => clearTimeout(espera);
  });
  return { horas, ahora, ahoraDe };
}

/** El sincronizador de la pestaña, si hay uno (la ventana para responder lo usa para leer y refrescar). */
export function sincronizadorCompartido(): Sincronizador | null {
  return compartido;
}

const suscribir = (oyente: () => void) => {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
};

export function armar(sync: Sincronizador, forma: Record<string, number> = formaGuardada()): Oficina {
  // Orden fijo por prefijo, como Board global (BET, ELM, JST, MIG).
  const ordenadas = [...sync.empresas].sort((a, b) => prefijoDe(a).localeCompare(prefijoDe(b)));
  const todas: EmpresaVista[] = ordenadas.map((empresa) => ({
    id: empresa.id,
    prefijo: prefijoDe(empresa),
    nombre: empresa.name,
    estado: sync.estadoEmpresa(empresa.id),
    agentes: sync.numAgentes(empresa.id) ?? forma[empresa.id] ?? 3,
    conocidos: sync.numAgentes(empresa.id) !== null,
  }));
  // Con 0 agentes en la última lectura buena (o en la forma guardada, mientras carga) no se dibuja.
  // Sin ninguno de los dos datos no se sabe: se dibuja (con 3 escritorios, o a oscuras si no responde).
  const empresas = todas.filter((e) => e.agentes > 0);
  const ocultas = todas.filter((e) => e.agentes === 0);
  const nombres = new Map(sync.empresas.map((e) => [e.id, e.name]));
  const orden = new Map(empresas.map((e, i) => [e.id, i]));
  const agentes = sync
    .agentes()
    .map((a) => vistaDe(a, nombres.get(a.companyId) ?? a.prefijo))
    .sort((a, b) => (orden.get(a.companyId) ?? 0) - (orden.get(b.companyId) ?? 0));
  return {
    sync,
    iniciando: sync.empresas.length === 0 && !sync.errorEmpresas,
    errorEmpresas: sync.errorEmpresas,
    empresas,
    ocultas,
    agentes,
    bloqueadas: sync.bloqueos(),
    // Una empresa que no se dibuja no avisa si falla: no tiene sala que se apague (§9).
    caidas: empresas.filter((e) => e.estado.error !== null),
    sinAtencion: empresas.some((e) => !e.estado.error && !e.estado.cargando && e.estado.sinAtencion),
    cargando: sync.empresas.length === 0 ? !sync.errorEmpresas : empresas.some((e) => e.estado.cargando),
    reintentar: () => void sync.reintentar(),
  };
}

/**
 * Banner «Todos libres» (§12): solo si se sabe de toda la oficina. Sin «Te toca» los que esperaban
 * se ven libres, y una empresa que no responde no cuenta, así que no se puede decir que nadie espera (JST-83).
 */
export function todosLibres(oficina: Oficina): boolean {
  if (oficina.cargando || oficina.errorEmpresas || oficina.caidas.length > 0 || oficina.sinAtencion) return false;
  return oficina.agentes.length > 0 && oficina.agentes.every((a) => a.st === "libre");
}

const VACIA: Oficina = {
  sync: null,
  iniciando: true,
  errorEmpresas: null,
  empresas: [],
  ocultas: [],
  agentes: [],
  bloqueadas: [],
  caidas: [],
  sinAtencion: false,
  cargando: true,
  reintentar: () => undefined,
};

let cache: { version: number; sync: Sincronizador; oficina: Oficina } | null = null;

/** Estado de la oficina; se vuelve a pintar con cada cambio del sincronizador. */
export function useOficina(cx: Conexion = { base: "" }): Oficina {
  const [sync, setSync] = useState<Sincronizador | null>(null);
  useEffect(() => {
    setSync(conectarCompartido(cx));
    return () => soltarCompartido();
    // La conexión es la misma durante toda la vida del componente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const v = useSyncExternalStore(suscribir, () => version);
  if (!sync) return VACIA;
  if (!cache || cache.version !== v || cache.sync !== sync) cache = { version: v, sync, oficina: armar(sync) };
  return cache.oficina;
}

// ---------------------------------------------------------------------------
// Entorno
// ---------------------------------------------------------------------------

function useMedia(consulta: string): boolean {
  return useSyncExternalStore(
    (oyente) => {
      const mq = window.matchMedia(consulta);
      mq.addEventListener("change", oyente);
      return () => mq.removeEventListener("change", oyente);
    },
    () => window.matchMedia(consulta).matches,
  );
}

/** Celular: menos de 768 px de ventana, como Paperclip. */
export function useCelular(): boolean {
  return useMedia("(max-width: 767px)");
}

export function useMovimientoReducido(): boolean {
  return useMedia("(prefers-reduced-motion: reduce)");
}

export function usePestanaOculta(): boolean {
  return useSyncExternalStore(
    (oyente) => {
      document.addEventListener("visibilitychange", oyente);
      return () => document.removeEventListener("visibilitychange", oyente);
    },
    () => document.hidden,
  );
}

/** Tema del host: la clase `.dark` de `<html>`. */
export function useTemaOscuro(): boolean {
  return useSyncExternalStore(
    (oyente) => {
      const obs = new MutationObserver(oyente);
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      return () => obs.disconnect();
    },
    () => document.documentElement.classList.contains("dark"),
  );
}

/** La hora, que avanza cada `cadaMs` (para «hace X min» y el reloj del modo TV). */
export function useAhora(cadaMs = 30_000): number {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), cadaMs);
    return () => clearInterval(t);
  }, [cadaMs]);
  return ahora;
}

export function useAnchoVentana(): number {
  return useSyncExternalStore(
    (oyente) => {
      window.addEventListener("resize", oyente);
      return () => window.removeEventListener("resize", oyente);
    },
    () => window.innerWidth,
  );
}
