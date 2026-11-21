// La vigía de los avisos y las voces (design-spec de JST-95 §7 y §8, JST-94).
//
// - Vive en el módulo de la UI: una por pestaña, sobrevive a la navegación. La
//   arrancan el enlace del menú lateral y el botón de la barra de arriba (el
//   menú se puede plegar y entonces se desmonta), la página, el widget y el TV.
// - Solo trabaja con los avisos o las voces encendidos (vienen apagados): sin
//   eso no lee nada ni abre canales, como la 0.1.5.
// - Con varias pestañas abiertas, avisa una sola. Cada pestaña dice «estoy»
//   por `BroadcastChannel` cada 2 s y la vigía es la primera que se abrió, con
//   preferencia por una donde ya se tocó la página (ahí el sonido puede sonar).
//   `navigator.locks` no existe en http (JST-94) y no deja elegir así, por eso
//   no se usa. Además, cada aviso y cada frase se «reclaman» en
//   `localStorage`: si dos pestañas se creen vigía un momento, sale una vez.
// - La vigía usa el mismo sincronizador de la página (si la Oficina está
//   abierta en esa pestaña, no hace llamadas extra). Mira cuándo un agente
//   PASA a «te necesita»: al arrancar toma una foto y no avisa de lo que ya
//   esperaba. Suena y habla ella, y le pasa el aviso a la pestaña que se está
//   mirando para que salga ahí con el aviso de Paperclip (`usePluginToast`).
// - Con la pestaña oculta, la vigía deja abiertos los canales (si no, no podría
//   avisar); las demás pestañas los cierran, como siempre.
// - 0.5.0 (JST-167): con las voces y «de qué se trata» prendidos, la frase lleva
//   la tarea (o el motivo del error), y la vigía le pide al worker que prepare
//   las frases de los que empiezan a trabajar (una vez por tarea). Apagado, dice
//   lo mismo que la 0.4.0 y no pide nada.
// - JST-194: «empecé» con la tarea espera su audio un poco, fuera de la cola
//   (`src/empece.ts`), y es la primera que se le pide al worker.
// - 0.8.0 (JST-241): «te necesito» dice la pregunta breve (o qué aprobar o
//   revisar): se le pide al worker cuando sube la mano y se espera hasta 30 s
//   (`src/pregunta.ts`); si no llega, la frase con la tarea, como antes. Una
//   tarea que pasa a revisión con una pregunta para ti en esa misma tarea dice
//   «te necesito» y no «terminé». El nombre de la tarea va sin el «Ingeniero:»
//   de adelante si es un rol de su empresa.
// - 0.6.0 (JST-226): por el mismo canal van cuándo suena un aviso (para que lo
//   de la oficina se calle en la pestaña que muestra la Oficina) y qué de la
//   oficina suena en cada pestaña (`publicarVoz` y `escucharVoz`).
// - JST-415: «te lo dejo para revisar» (la tarea pasa a revisión), «quedé bloqueado», cuánto tardó («terminé en 12
//   minutos», desde que la vigía vio empezar la tarea), el recordatorio de las esperas de entre 30 min y 24 h (a los
//   30 min, 2 h y 6 h, una vez cada una), «mientras no estabas» (de los sucesos que llegaron con la pestaña oculta y de
//   las esperas nuevas) y las rachas e hitos (`src/dichos.ts`). Todo pasa por la misma cola y se rige por el nivel
//   (`src/nivel.ts`) además de su casilla.
// - JST-266: una revisión avisa una vez por cada paso a revisión. Si sale del
//   feed y vuelve sin que la tarea cambie de estado, no avisa otra vez
//   (`revisionesDichas`).
import { useEffect, useSyncExternalStore } from "react";
import type { PluginToastFn } from "@paperclipai/plugin-sdk/ui";
import { avisoHost, avisoSistema, empezaron, esperaQueAvisa, llegadas, fotoDe, motivoDeError, nombreCorto, pideDe, porQueEspera, rolesDeEmpresa, sinRolDelante, textoVoz, VENTANA_GRUPO_MS, type DetalleVoz, type Frase, type Llegada } from "../avisos.js";
import { cambioDeEstado, type Espera } from "../estado.js";
import type { PedidoVoz } from "../vozViva.js";
import type { Sincronizador } from "../sincronizador.js";
import { PAGE_ROUTE } from "../shared.js";
import type { EventoVivo } from "../shared.js";
import { contarVista, type AgenteVista } from "../vista.js";
import { AUSENCIA_MIN_MS, esperanDesde, hayQueRecordar, InicioDeTareas, RachaErrores, rachaParaVoz, RecordadosEspera, RegistroSucesos, SinNadie, textoRecordatorio, textoSinNadie, textoVolver, tocaRecordar, unaPorAgente, vencidos } from "../dichos.js";
import { duracionDeTarea } from "../duracion.js";
import { intervaloRecordatorioMs } from "../nivel.js";
import { esErrorViejo } from "../erroresViejos.js";
import { inicioDeAusencia, visitaGuardada } from "../visita.js";
import { t } from "../i18n.js";
import { ajustes, alCambiarAjustes, conDetalle, suena } from "./ajustes.js";
import { cuerpoVolver } from "./avisoVolver.js";
import { erroresSilenciados } from "./erroresSilenciados.js";
import { cargarIndice } from "./audiosVoces.js";
import { alCambiarAvisos, audioDesbloqueado, cuandoSeDesbloquee, escucharPrimerToque, mostrarSubtitulo, ponerFrase, ponerLibre, tocarCampana, type Subtitulo } from "./sonido.js";
import { armar, conectarCompartido, fijarMantenerVivo, revisarPausa, soltarCompartido } from "./useOficina.js";
import { esperarFrase, prepararFrases } from "./vozViva.js";
import { EmpeceEnEspera } from "../empece.js";
import { ESPERA_PREGUNTA_MS, FinEnRevision, PreguntaEnEspera } from "../pregunta.js";

const CANAL = "jstm.oficina-pixel:vigia";
const LATIDO_MS = 2_000;
/**
 * Cuánto se espera a una pestaña que no dice «estoy»: 8 s si se estaba viendo.
 * Chrome frena a una vez por minuto los temporizadores de una pestaña oculta
 * hace más de 5 min: a una oculta se la espera 75 s, o la vigía oculta perdería
 * su lugar cada minuto. Al ocultarse, la pestaña lo dice al tiro.
 */
const VIDA_VISIBLE_MS = 8_000;
const VIDA_OCULTA_MS = 75_000;
/**
 * Al cerrarse o recargarse, la pestaña avisa («adiós») para que otra tome su
 * lugar al tiro. Por `BroadcastChannel` el mensaje se puede perder mientras la
 * página se descarga (pasó en la copia): también va por `localStorage`, cuyo
 * evento sí llega a las demás.
 */
const CLAVE_ADIOS = "jstm.oficina-pixel.adios";
const CLAVE_RECLAMOS = "jstm.oficina-pixel.reclamos";
const RECLAMO_MS = 60_000;

interface Par {
  id: string;
  desbloqueado: boolean;
  visible: boolean;
  foco: boolean;
  /** Puede mostrar el aviso de Paperclip (tiene montado el menú, la barra, la página o el widget). */
  toast: boolean;
  /** Lo dice la vigía: cuántos te necesitan (la marca del menú). */
  marca: number | null;
  visto: number;
}

/** 0.6.0: lo de la voz entre pestañas: si suena un aviso, y qué de la oficina suena (y desde cuándo). 0.9.0: hasta cuándo suena el Resumen (0: terminó). */
export type MensajeVoz =
  | { t: "avisos"; activo: boolean }
  | { t: "oficina"; o: { lo: "charla" | "mascota" | "entrega" | "suelta" | "hora"; clave: string; hasta: number; desde: number } | null }
  | { t: "resumen"; hasta: number };

type Mensaje =
  | ({ t: "estoy" } & Omit<Par, "visto">)
  | { t: "adios"; id: string }
  | { t: "aviso"; para: string; grupo: string; llegadas: Llegada[] }
  | { t: "habla"; s: Subtitulo }
  | MensajeVoz;

/** Id de esta pestaña: el más chico es el de la que se abrió primero. */
const nuevoId = () => `${Date.now().toString(36).padStart(9, "0")}-${Math.random().toString(36).slice(2, 8)}`;
let ID = nuevoId();
const pares = new Map<string, Par>();
/** Las que ya se despidieron: un «estoy» que llegue tarde (al ocultarse mientras se descarga) no las revive. */
const despedidas = new Set<string>();
let cerrando = false;
let canal: BroadcastChannel | null = null;
const toasts: PluginToastFn[] = [];

let arrancada = false;
let vigilando = false;
let sync: Sincronizador | null = null;
let quitar: Array<() => void> = [];

// ---------------------------------------------------------------------------
// Marca del menú («✋ 6»)
// ---------------------------------------------------------------------------

let marca = 0;
const oyentesMarca = new Set<() => void>();
function fijarMarca(n: number): void {
  if (n === marca) return;
  marca = n;
  for (const o of oyentesMarca) o();
}

/** Cuántos te necesitan, según la vigía (de esta pestaña o de otra). 0 con los avisos apagados. */
export function useMarca(): number {
  return useSyncExternalStore(
    (o) => {
      oyentesMarca.add(o);
      return () => oyentesMarca.delete(o);
    },
    () => marca,
  );
}

// ---------------------------------------------------------------------------
// Pestañas
// ---------------------------------------------------------------------------

function yo(): Omit<Par, "visto"> {
  return {
    id: ID,
    desbloqueado: audioDesbloqueado(),
    visible: typeof document !== "undefined" && !document.hidden,
    foco: typeof document !== "undefined" && document.hasFocus(),
    toast: toasts.length > 0,
    marca: vigilando ? marca : null,
  };
}

const rango = (p: Pick<Par, "desbloqueado" | "id">) => `${p.desbloqueado ? 0 : 1}:${p.id}`;

function activa(): boolean {
  const a = ajustes();
  return a.avisos || a.voces;
}

function vivos(): Par[] {
  const ahora = Date.now();
  for (const [id, p] of pares) if (ahora - p.visto > (p.visible ? VIDA_VISIBLE_MS : VIDA_OCULTA_MS)) pares.delete(id);
  return [...pares.values()];
}

/**
 * Al abrirse, la pestaña espera un latido para conocer a las demás antes de
 * decidir: si no, se creería vigía unos milisegundos y empezaría a leer de más.
 */
const CONOCER_MS = LATIDO_MS + 200;
let abiertaEn = 0;

/** Esta pestaña es la vigía: con los avisos o las voces encendidos, y la primera en la fila. */
function soyVigia(): boolean {
  if (!activa()) return false;
  if (!vigilando && Date.now() - abiertaEn < CONOCER_MS) return false;
  const mio = rango(yo());
  return vivos().every((p) => mio <= rango(p));
}

function publicar(m: Mensaje): void {
  try {
    canal?.postMessage(m);
  } catch {
    // Sin canal (navegador viejo): esta pestaña trabaja sola.
  }
}

function latido(): void {
  if (cerrando) return;
  if (activa()) publicar({ t: "estoy", ...yo() });
  revisar();
}

function despedir(id: string): void {
  despedidas.add(id);
  pares.delete(id);
  revisar();
}

function alMensaje(e: MessageEvent<Mensaje>): void {
  const m = e.data;
  if (!m || typeof m !== "object") return;
  if (m.t === "estoy") {
    if (despedidas.has(m.id)) return;
    const nuevo = !pares.has(m.id);
    pares.set(m.id, { ...m, visto: Date.now() });
    // Una pestaña nueva tiene que saber al tiro que esta existe (si no, se creería vigía 2 s).
    if (nuevo && activa()) publicar({ t: "estoy", ...yo() });
    if (!vigilando && typeof m.marca === "number") fijarMarca(m.marca);
    revisar();
  } else if (m.t === "adios") {
    despedir(m.id);
  } else if (m.t === "aviso") {
    if (m.para === ID) mostrarAviso(m.llegadas, m.grupo);
  } else if (m.t === "habla") {
    mostrarSubtitulo(m.s);
  } else if (m.t === "avisos" || m.t === "oficina" || m.t === "resumen") {
    for (const o of oyentesVoz) o(m);
  }
}

const oyentesVoz = new Set<(m: MensajeVoz) => void>();

/** 0.6.0: lo de la voz que llega de otra pestaña. */
export function escucharVoz(fn: (m: MensajeVoz) => void): () => void {
  oyentesVoz.add(fn);
  return () => oyentesVoz.delete(fn);
}

/** 0.6.0: le cuenta a las otras pestañas lo de la voz de esta. */
export function publicarVoz(m: MensajeVoz): void {
  publicar(m);
}

function revisar(): void {
  const debe = soyVigia();
  if (debe && !vigilando) empezar();
  else if (!debe && vigilando) parar();
  if (!activa() || (!vigilando && !vivos().some((p) => typeof p.marca === "number"))) fijarMarca(0);
}

/** Arranca la vigía de esta pestaña (una vez). `toast`: el aviso de Paperclip del componente que la llama. */
export function useVigia(toast: PluginToastFn | null): void {
  useEffect(() => {
    arrancar();
    if (!toast) return;
    toasts.push(toast);
    latido();
    return () => {
      const i = toasts.indexOf(toast);
      if (i >= 0) toasts.splice(i, 1);
    };
  }, [toast]);
}

function arrancar(): void {
  if (arrancada || typeof window === "undefined") return;
  arrancada = true;
  abiertaEn = Date.now();
  setTimeout(latido, CONOCER_MS + 50);
  escucharPrimerToque();
  if (typeof BroadcastChannel !== "undefined") {
    canal = new BroadcastChannel(CANAL);
    canal.addEventListener("message", alMensaje);
  }
  fijarMantenerVivo(() => vigilando);
  setInterval(latido, LATIDO_MS);
  window.addEventListener("pagehide", () => {
    cerrando = true;
    publicar({ t: "adios", id: ID });
    try {
      localStorage.setItem(CLAVE_ADIOS, `${ID}@${Date.now()}`);
    } catch {
      // Sin almacenamiento: las demás la dan por cerrada cuando deja de latir.
    }
  });
  // Si vuelve del caché de atrás/adelante, la pestaña sigue: con otro id (el anterior ya se despidió), vuelve a latir.
  window.addEventListener("pageshow", (e) => {
    if (!e.persisted) return;
    cerrando = false;
    ID = nuevoId();
    abiertaEn = Date.now();
    latido();
  });
  window.addEventListener("storage", (e) => {
    if (e.key !== CLAVE_ADIOS || !e.newValue) return;
    despedir(e.newValue.split("@")[0]!);
  });
  document.addEventListener("visibilitychange", latido);
  // JST-415: «mientras no estabas»: desde cuándo está oculta esta pestaña, y qué dice al volver.
  ocultaDesde = document.hidden ? Date.now() : null;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) ocultaDesde ??= Date.now();
    else alVolver();
  });
  window.addEventListener("focus", latido);
  window.addEventListener("blur", latido);
  alCambiarAjustes(() => {
    latido();
    if (vigilando) evaluar();
    leerIndiceVoces();
  });
  cuandoSeDesbloquee(latido);
  // 0.6.0: un aviso en esta pestaña calla lo de la oficina en las demás.
  alCambiarAvisos((activo) => publicar({ t: "avisos", activo }));
  // Para las pruebas en la copia (`pruebas/oficina020_copia.py`): quién es la vigía de cada pestaña.
  (window as unknown as { __oficinaVigia?: typeof estadoVigia }).__oficinaVigia = estadoVigia;
  latido();
}

// ---------------------------------------------------------------------------
// Vigilar
// ---------------------------------------------------------------------------

let foto: Map<string, number> | null = null;
/** La última tarea de cada agente (para «empecé»: el primer run de una tarea nueva). */
const tareas = new Map<string, string | null>();
let grupo: { id: string; inicio: number; llegadas: Llegada[] } | null = null;
// JST-415: lo que la vigía recuerda para decir más cosas útiles.
const inicios = new InicioDeTareas();
const rachas = new RachaErrores();
const sinNadie = new SinNadie();
const sucesos = new RegistroSucesos();
/** Quién trabajó por última vez en cada empresa (pone la voz de «ya no queda nadie trabajando»). */
const ultimoTrabajando = new Map<string, string>();
let vigilandoDesde = 0;
let ultimoToca = 0;
let ultimoRecordatorio = 0;
let relojRecordar: ReturnType<typeof setInterval> | null = null;
/** Desde cuándo está oculta esta pestaña (`null`: se ve). */
let ocultaDesde: number | null = null;
const RECORDAR_REVISAR_MS = 60_000;
/**
 * JST-266: las tareas cuya revisión ya avisó (o ya esperaba al empezar a
 * mirar), con su empresa, hasta que la tarea cambia de estado. Si el canal de
 * la empresa se cortó, se olvidan las suyas: pudo perderse ese cambio.
 */
const revisionesDichas = new Map<string, string>();

function anotarDicha(a: Pick<AgenteVista, "companyId">, e: Espera | undefined): void {
  if (e?.tipo === "revision" && e.issueId) revisionesDichas.set(e.issueId, a.companyId);
}

function empezar(): void {
  vigilando = true;
  foto = null;
  tareas.clear();
  grupo = null;
  revisionesDichas.clear();
  inicios.limpiar();
  rachas.limpiar();
  sinNadie.limpiar();
  ultimoTrabajando.clear();
  vigilandoDesde = Date.now();
  ultimoRecordatorio = vigilandoDesde;
  relojRecordar ??= setInterval(alReloj, RECORDAR_REVISAR_MS);
  const s = conectarCompartido({ base: "" });
  sync = s;
  quitar = [
    s.alCambiar(evaluar),
    s.alEventoVivo(alEvento),
    s.alReconectar((companyId) => {
      for (const [id, c] of revisionesDichas) if (c === companyId) revisionesDichas.delete(id);
    }),
  ];
  revisarPausa();
  evaluar();
  latido();
  leerIndiceVoces();
}

/**
 * Con las voces encendidas, la vigía lee el índice de los audios al empezar
 * (JST-148): así la primera frase solo espera su MP3, y no además el UUID de la
 * instalación y el índice, uno tras otro.
 */
function leerIndiceVoces(): void {
  if (vigilando && ajustes().voces) void cargarIndice();
}

function parar(): void {
  vigilando = false;
  if (relojRecordar) clearInterval(relojRecordar);
  relojRecordar = null;
  for (const q of quitar) q();
  quitar = [];
  sync = null;
  foto = null;
  soltarCompartido();
  revisarPausa();
  latido();
}

/**
 * `true` si nadie (otra pestaña que se creyó vigía) avisó ya de lo mismo hace menos de 1 min. También lo usan las
 * reacciones de las mascotas (`vozOficina.ts`), que salen en cada pestaña: así su voz suena en una sola.
 */
export function reclamar(clave: string): boolean {
  try {
    const ahora = Date.now();
    const todos = JSON.parse(localStorage.getItem(CLAVE_RECLAMOS) ?? "{}") as Record<string, number>;
    for (const k of Object.keys(todos)) if (ahora - todos[k]! > RECLAMO_MS) delete todos[k];
    if (todos[clave]) return false;
    todos[clave] = ahora;
    localStorage.setItem(CLAVE_RECLAMOS, JSON.stringify(todos));
    return true;
  } catch {
    return true;
  }
}

/** La empresa se leyó bien (con su «Te toca»): si no, nadie parece esperar nada ni estar libre. */
function conocidaEn(s: Sincronizador, companyId: string): boolean {
  const e = s.estadoEmpresa(companyId);
  return !e.cargando && !e.error && !e.sinAtencion;
}

function agentesDe(s: Sincronizador): AgenteVista[] {
  return armar(s).agentes;
}

/** `i`: la espera que avisa (va primero, como en la voz). */
function llegadaDe(a: AgenteVista, i = 0): Llegada {
  const esperas = i === 0 ? a.teNecesita : [a.teNecesita[i]!, ...a.teNecesita.filter((_, j) => j !== i)];
  return { agenteId: a.id, corto: nombreCorto(a.nombre), empresa: a.empresa, prefijo: a.prefijo, esperas };
}

const vozDe = (a: AgenteVista) => ({ id: a.id, corto: nombreCorto(a.nombre), empresa: a.empresa, aspecto: a.aspecto, companyId: a.companyId });
const pedidoDe = (a: AgenteVista, frase: PedidoVoz["frase"], tarea: string): PedidoVoz => ({ agenteId: a.id, frase, corto: nombreCorto(a.nombre), empresa: a.empresa, presentacion: ajustes().presentacion, tarea });

/** Los roles de cada empresa (0.8.0, para sacar el «Ingeniero:» de adelante del nombre de la tarea), de la última lectura. */
const rolesPorEmpresa = new Map<string, Set<string>>();

function rolesDe(companyId: string): Set<string> {
  let r = rolesPorEmpresa.get(companyId);
  if (!r) {
    r = sync ? rolesDeEmpresa(agentesDe(sync), companyId) : new Set<string>();
    rolesPorEmpresa.set(companyId, r);
  }
  return r;
}

/** El nombre de la tarea como lo dice la voz de ese agente: sin el «‹Rol›:» de adelante si es un rol de su empresa (0.8.0). */
function tareaDe(a: Pick<AgenteVista, "companyId">, titulo: string | null | undefined): string | null {
  return titulo ? sinRolDelante(titulo, rolesDe(a.companyId)) : null;
}

/** `detalle`: de qué se trata (0.5.0); solo va si esa frase lo tiene prendido. La racha de errores (JST-415) va aparte: no es «de qué se trata». */
function hablar(frase: Frase, a: AgenteVista, clave: string, detalle: DetalleVoz | null = null): void {
  const aj = ajustes();
  if (!aj.voces || !suena(aj, frase) || !reclamar(`voz:${clave}`)) return;
  // Si su «empecé» espera el audio con la tarea (JST-194), o su «te necesito» el de la pregunta (0.8.0), sale antes que esta frase.
  empece.soltar(a.id);
  if (frase !== "toca") pregunta.soltar(a.id);
  const con = conDetalle(aj, frase);
  const dicho: DetalleVoz | null = con ? detalle : detalle?.racha ? { racha: detalle.racha } : null;
  const poner = () => ponerFrase(frase, vozDe(a), aj.presentacion, (s) => publicar({ t: "habla", s }), dicho);
  // JST-415: «tercer error seguido» no tiene audio grabado (cada motivo y cada número serían otro audio por voz): sale como
  // frase libre, entera, con su voz si el audio existe y si no con la del navegador, en vez de perder la racha.
  if (frase === "error" && dicho?.racha) {
    const v = vozDe(a);
    ponerLibre(textoVoz(v.corto, v.empresa, "error", aj.presentacion, dicho), v, aj.presentacion, habla);
    return;
  }
  // JST-415: con la duración («terminé en 12 minutos») o con la tarea de «quedé bloqueado en …» el audio recién se pide
  // ahora, y se le da un respiro (4 s): si no llega, suena el de siempre (el de la tarea, que se preparó al empezar, o
  // «quedé bloqueado» a secas) y no se dice la duración.
  if (con && dicho?.tarea && (dicho.duracion || frase === "bloq") && audioDesbloqueado()) {
    void esperarFrase(a.companyId, { ...pedidoDe(a, frase as "fin" | "rev" | "bloq", dicho.tarea), ...(dicho.duracion ? { duracion: dicho.duracion } : {}) }, Date.now(), ESPERA_DURACION_MS)
      .catch(() => false)
      .then(poner);
    return;
  }
  poner();
}

/** Lo más que «terminé en 12 minutos» y «quedé bloqueado en …» esperan su audio antes de ponerse en la cola. */
const ESPERA_DURACION_MS = 4_000;

/** «Empecé» con la tarea (JST-194): espera su nombre y su audio, como mucho 20 s, sin frenar a las demás frases. */
const empece = new EmpeceEnEspera<AgenteVista>({
  esperar: (a, tarea) => esperarFrase(a.companyId, pedidoDe(a, "emp", tareaDe(a, tarea)!)),
  decir: (a, tarea) => {
    const aj = ajustes();
    if (aj.voces && suena(aj, "emp")) ponerFrase("emp", vozDe(a), aj.presentacion, (s) => publicar({ t: "habla", s }), conDetalle(aj, "emp") ? { tarea: tareaDe(a, tarea) } : null);
  },
});

function empezo(a: AgenteVista): void {
  const aj = ajustes();
  // Sin «la tarea», o si en esta pestaña no puede sonar un audio (solo el subtítulo), «empecé» sale al tiro, como en la 0.5.0.
  if (!aj.voces || !suena(aj, "emp") || !conDetalle(aj, "emp") || !audioDesbloqueado()) {
    hablar("emp", a, `emp:${a.id}:${a.run!.issueId}`, { tarea: tareaDe(a, a.run?.titulo) });
    return;
  }
  if (reclamar(`voz:emp:${a.id}:${a.run!.issueId}`)) empece.empezo(a);
}

/** El pedido de «te necesito» con lo que espera (0.8.0). La tarea va igual (el worker la pide); si no se sabe, lo que espera. */
const pedidoPregunta = (a: AgenteVista, d: DetalleVoz): PedidoVoz => ({ ...pedidoDe(a, "toca", (d.tarea || d.pide!.texto).slice(0, 400)), pide: d.pide! });

/** «Te necesito» con la pregunta (0.8.0): espera su audio hasta 30 s desde que sube la mano, sin frenar a las demás frases. */
const pregunta = new PreguntaEnEspera<AgenteVista, DetalleVoz>({
  esperar: (a, d) => esperarFrase(a.companyId, pedidoPregunta(a, d), Date.now(), ESPERA_PREGUNTA_MS),
  decir: (a, d) => {
    const aj = ajustes();
    if (!aj.voces || !suena(aj, "toca")) return;
    empece.soltar(a.id);
    ponerFrase("toca", vozDe(a), aj.presentacion, (s) => publicar({ t: "habla", s }), conDetalle(aj, "toca") ? d : null);
  },
});

/**
 * «Te necesito» por la espera `i` de ese agente (0.8.0): lo que espera (la
 * pregunta, o qué aprobar o revisar) y cuántas más; la tarea queda de
 * respaldo. Con la pregunta, espera su audio fuera de la cola. Sin «la
 * pregunta», sin nada que decir de lo que espera, o si en esta pestaña no puede
 * sonar un audio, al tiro, como antes.
 */
function decirToca(a: AgenteVista, i = 0): void {
  const e = a.teNecesita[i];
  if (!e) return;
  anotarDicha(a, e);
  const aj = ajustes();
  if (!aj.voces || !suena(aj, "toca")) return;
  // JST-415: el recordatorio de espera no repite si hace poco se dijo un «te necesito».
  ultimoToca = Date.now();
  const clave = `toca:${a.id}:${e.itemId}`;
  const esperas = [e, ...a.teNecesita.filter((_, j) => j !== i)];
  const detalle: DetalleVoz = { pide: pideDe(esperas, rolesDe(a.companyId)), tarea: tareaDe(a, e.tituloTarea) };
  if (!conDetalle(aj, "toca") || !detalle.pide || !audioDesbloqueado()) {
    hablar("toca", a, clave, detalle);
    return;
  }
  if (reclamar(`voz:${clave}`)) pregunta.subio(a, e.itemId, detalle);
}

/** «Terminé» de una tarea que pasó a revisión (0.8.0): si te dejó una pregunta en esa tarea, «te necesito» y no «terminé». */
const revision = new FinEnRevision<AgenteVista>({
  // JST-415: a revisión, «te lo dejo para revisar», con cuánto tardó si se sabe.
  terminar: (a, issueId, titulo) => hablar("rev", a, `fin:${issueId}:in_review`, { tarea: tareaDe(a, titulo), duracion: duracionDeTarea(inicios.inicioDe(a.id, issueId), Date.now()) }),
  preguntar: (a, i) => decirToca(a, i),
});

/**
 * 0.5.0 (JST-167, opción B): con las voces y «de qué se trata» prendidos, le
 * pide al worker las frases con el nombre de la tarea de quien trabaja o está
 * por empezar (en cola), una vez por tarea, con la presentación de este
 * navegador. Así, cuando dice «empecé», «te necesito» o «terminé», el audio
 * suele estar listo. Apagado (o sin tareas con nombre), no pide nada.
 */
function pedirFrases(agentes: readonly AgenteVista[], extra: ReadonlyArray<{ a: AgenteVista; tarea: string }> = []): void {
  const aj = ajustes();
  if (!aj.voces) return;
  // «Empecé» primero: es la única que se dice apenas empieza (JST-194). «Te necesito» con la tarea al final: desde la 0.8.0
  // dice la pregunta (se pide al subir la mano) y esta queda de respaldo, por si su audio no llega a tiempo.
  // JST-415: «te lo dejo para revisar» (`rev`) también se prepara al empezar (se sabe al terminar si va a revisión o a terminada).
  const frases = (["emp", "fin", "rev", "toca"] as const).filter((f) => suena(aj, f) && conDetalle(aj, f));
  if (frases.length === 0) return;
  const porEmpresa = new Map<string, PedidoVoz[]>();
  const poner = (a: AgenteVista, tarea: string) => {
    const lista = porEmpresa.get(a.companyId) ?? [];
    for (const frase of frases) lista.push(pedidoDe(a, frase, tarea));
    porEmpresa.set(a.companyId, lista);
  };
  for (const a of agentes) if (a.st === "trabaja" && a.run?.titulo) poner(a, tareaDe(a, a.run.titulo)!);
  for (const x of extra) poner(x.a, tareaDe(x.a, x.tarea)!);
  for (const [companyId, lista] of porEmpresa) void prepararFrases(companyId, lista);
}

/** El nombre de una tarea que la página ya leyó (por su id o su código), sin lecturas nuevas. */
function tituloConocido(s: Sincronizador, issueId: unknown, codigo: unknown): string | null {
  if (typeof issueId === "string") {
    const t = s.tareas.get(issueId);
    if (t?.title) return t.title;
  }
  if (typeof codigo === "string") for (const t of s.tareas.values()) if (t.identifier === codigo && t.title) return t.title;
  return null;
}

function evaluar(): void {
  const s = sync;
  if (!s || !vigilando) return;
  const agentes = agentesDe(s);
  inicios.observar(agentes);
  // Los roles se vuelven a armar con lo que se acaba de leer (un agente nuevo, un cargo que cambió).
  rolesPorEmpresa.clear();
  for (const cid of new Set(agentes.map((a) => a.companyId))) rolesPorEmpresa.set(cid, rolesDeEmpresa(agentes, cid));
  const conocida = (companyId: string) => conocidaEn(s, companyId);
  fijarMarca(ajustes().avisos ? contarVista(agentes).toca : 0);
  // Las ya dichas antes de esta vuelta: una que se dice ahora con «te necesito» y no «terminé» igual avisa al llegar (JST-266).
  const dichas = new Set(revisionesDichas.keys());

  for (const a of empezaron(tareas, agentes)) empezo(a);
  empece.revisar(agentes);
  // 0.8.0: si ya respondiste, su «te necesito» no se dice; si llegó la pregunta de una tarea que pasó a revisión, no dice
  // «terminé». Solo con las empresas cuyo «Te toca» se leyó bien (si no, nadie parece esperar nada).
  const leidos = agentes.filter((a) => conocida(a.companyId));
  pregunta.revisar(leidos);
  revision.revisar(leidos);
  pedirFrases(agentes);
  revisarVacias(leidos, Date.now());

  const nueva = fotoDe(agentes, conocida);
  // Lo que ya esperaba cuando se empieza a mirar al agente no avisa, y su revisión tampoco si sale y vuelve (JST-266).
  for (const a of agentes) if (nueva.has(a.id) && !foto?.has(a.id)) for (const e of a.teNecesita) anotarDicha(a, e);
  if (!foto) {
    foto = nueva;
    return;
  }
  const ids = llegadas(foto, nueva);
  foto = nueva;
  if (ids.length === 0) return;
  const porId = new Map(agentes.map((a) => [a.id, a]));
  for (const id of ids) {
    const a = porId.get(id);
    if (!a) continue;
    // La misma revisión que vuelve al feed (el monitor del agente, JST-266) no avisa otra vez.
    const i = esperaQueAvisa(a.teNecesita, dichas);
    const e = a.teNecesita[i];
    if (!e || !reclamar(`toca:${id}:${e.itemId}`)) continue;
    llego(a, i);
  }
}

/** Un agente pasó a «te necesita»: el aviso, el sonido, el aviso del sistema y la voz. `i`: la espera que avisa. */
function llego(a: AgenteVista, i: number): void {
  const aj = ajustes();
  if (aj.avisos) {
    const ahora = Date.now();
    const primero = !grupo || ahora - grupo.inicio >= VENTANA_GRUPO_MS;
    if (primero) grupo = { id: `${ID}:${ahora}`, inicio: ahora, llegadas: [] };
    grupo!.llegadas.push(llegadaDe(a, i));
    // Si se juntan varios en 10 s, suena una sola vez (y el aviso pasa a ser uno solo).
    if (primero && aj.sonido) tocarCampana();
    const para = destino();
    if (para === ID) mostrarAviso(grupo!.llegadas, grupo!.id);
    else publicar({ t: "aviso", para, grupo: grupo!.id, llegadas: grupo!.llegadas });
    avisarSistema(llegadaDe(a, i));
  }
  // De qué se trata (0.8.0): lo que espera la más antigua (sin las revisiones ya dichas), y cuántas más.
  decirToca(a, i);
}

/** La pestaña que muestra el aviso: la que tiene el foco; si no, la vigía si se ve; si no, otra que se vea. */
function destino(): string {
  const todas = [{ ...yo(), visto: Date.now() }, ...vivos()].filter((p) => p.toast);
  const elegida = todas.find((p) => p.foco) ?? todas.find((p) => p.id === ID && p.visible) ?? todas.find((p) => p.visible) ?? todas.find((p) => p.id === ID) ?? todas[0];
  return elegida?.id ?? ID;
}

function prefijoPagina(): string {
  const primero = location.pathname.split("/").filter(Boolean)[0];
  return primero && !primero.startsWith("_") ? decodeURIComponent(primero) : "";
}

function mostrarAviso(ls: Llegada[], grupoId: string): void {
  const toast = toasts.at(-1);
  if (!toast || ls.length === 0) return;
  const prefijo = prefijoPagina() || ls[0]!.prefijo;
  const { id, dedupeKey, title, body, tone, ttlMs, action } = avisoHost(ls, prefijo, grupoId);
  toast({ id, dedupeKey, title, body, tone, ttlMs, action });
}

function avisarSistema(l: Llegada): void {
  try {
    if (!window.isSecureContext || !("Notification" in window) || Notification.permission !== "granted") return;
    const t = avisoSistema(l);
    const n = new Notification(t.titulo, { body: t.body, tag: t.tag });
    n.onclick = () => {
      window.focus();
      location.href = `/${encodeURIComponent(prefijoPagina() || l.prefijo)}/${PAGE_ROUTE}?responder=${encodeURIComponent(l.agenteId)}`;
    };
  } catch {
    // El navegador no deja: queda el aviso dentro de Paperclip.
  }
}

/** «tengo un error», «terminé», «te lo dejo para revisar» y «quedé bloqueado» llegan por el canal en vivo (0 llamadas). */
function alEvento(_companyId: string, ev: EventoVivo): void {
  const s = sync;
  if (!s || !vigilando) return;
  const p = ev.payload;
  // JST-266: la tarea cambió de estado (salió de revisión o volvió a pasar): su revisión puede avisar otra vez.
  const cambio = ev.type === "activity.logged" ? cambioDeEstado(p) : null;
  if (cambio) revisionesDichas.delete(cambio);
  // JST-415: lo que se anota sin costo (sucesos, éxitos y fallos de las rachas) se anota con los avisos o las voces
  // encendidos, aunque las voces estén apagadas: así «mientras no estabas» (que también sale como aviso en pantalla) y
  // la racha no quedan viejos al volver a prender las voces. Lo que habla va después, solo con voces.
  if (!activa()) return;
  const voces = ajustes().voces;
  const ahora = Date.now();
  const agente = (id: unknown) => (typeof id === "string" ? agentesDe(s).find((a) => a.id === id) : undefined);
  if (ev.type === "heartbeat.run.status") {
    const quien = typeof p.agentId === "string" ? p.agentId : null;
    // JST-415: un run exitoso corta la racha de errores de ese agente.
    if (p.status === "succeeded" && quien) rachas.exito(quien);
    if (p.status === "failed" || p.status === "timed_out") {
      const run = String(p.runId ?? ev.id);
      sucesos.anotar("error", ahora, run);
      const n = quien ? rachas.fallo(quien, ahora, run) : 0;
      if (!voces) return;
      const a = agente(p.agentId);
      // De qué se trata: el motivo, de `error` y `errorCode` (0 lecturas); uno desconocido, la frase de siempre.
      // JST-415: «tercer error seguido: …» solo desde la racha mínima (3); con 1 o 2 el error va como siempre, con su audio.
      if (a) hablar("error", a, `error:${run}`, { motivo: motivoDeError(p.error, p.errorCode), racha: rachaParaVoz(n, suena(ajustes(), "hitos")) });
    }
    return;
  }
  if (ev.type === "activity.logged" && p.action === "issue.updated") {
    const detalles = (p.details ?? {}) as { identifier?: unknown; changes?: { status?: { to?: unknown }; assigneeAgentId?: { to?: unknown } } };
    const titulo = tituloConocido(s, p.entityId, detalles.identifier);
    if (voces) {
      // Una tarea que pasa a un agente: si ya se sabe su nombre, sus frases se piden ahora (para «empecé», que va justo al empezar).
      const nuevo = agente(detalles.changes?.assigneeAgentId?.to);
      if (nuevo && titulo) pedirFrases([], [{ a: nuevo, tarea: titulo }]);
    }
    const a_ = detalles.changes?.status?.to;
    if (a_ !== "in_review" && a_ !== "done" && a_ !== "blocked") return;
    const a = agente(p.agentId);
    if (!a) return;
    const issueId = typeof p.entityId === "string" ? p.entityId : null;
    // JST-415: «quedé bloqueado en ‹tarea›» solo si la vigía vio a ESE agente trabajando en ESA tarea: los agentes dejan
    // tareas bloqueadas a propósito (o las bloquea otro) y eso no es «quedé bloqueado». Tampoco se cuenta en «mientras no estabas».
    if (a_ === "blocked") {
      if (!issueId || !inicios.vio(a.id, issueId)) return;
      sucesos.anotar("bloq", ahora, issueId);
      if (voces) hablar("bloq", a, `bloq:${issueId}`, { tarea: tareaDe(a, titulo) });
      return;
    }
    // «Terminaron» cuenta las que pasaron a terminada: las que pasan a revisión esperan a la persona y no son un cierre.
    if (a_ === "done" && issueId) sucesos.anotar("fin", ahora, issueId);
    if (!voces) return;
    // A revisión: si te dejó una pregunta en esa tarea, no terminó (0.8.0); si no, «te lo dejo para revisar» (JST-415).
    if (a_ === "in_review" && issueId) revision.paso(a, issueId, titulo);
    // De qué se trata: la tarea que pasó a terminada, y cuánto tardó si se vio cuándo empezó.
    else hablar("fin", a, `fin:${String(p.entityId ?? "")}:${a_}`, { tarea: tareaDe(a, titulo), duracion: issueId ? duracionDeTarea(inicios.inicioDe(a.id, issueId), ahora) : null });
  }
}

// ---------------------------------------------------------------------------
// JST-415: recordatorio de espera, «mientras no estabas» y hitos
// ---------------------------------------------------------------------------

const habla = (s: Subtitulo) => publicar({ t: "habla", s });

/** El agente cuya voz dice las frases de la oficina entera: el «Chief of staff» si hay, si no el primero. */
function vozDeLaOficina(agentes: readonly AgenteVista[]): AgenteVista | undefined {
  return agentes.find((a) => nombreCorto(a.nombre) === "Chief of staff") ?? agentes[0];
}

/** Lo ya recordado de cada espera (compartido entre pestañas por `localStorage`, con respaldo en memoria). */
const recordados = new RecordadosEspera();

/** Cada minuto: el recordatorio de espera y la revisión de las empresas sin nadie (esta última no depende de que haya una lectura nueva). */
function alReloj(): void {
  const s = sync;
  if (!s || !vigilando) return;
  const ahora = Date.now();
  revisarVacias(agentesDe(s).filter((a) => conocidaEn(s, a.companyId)), ahora);
  revisarRecordatorio();
}

/**
 * Cada minuto: si hay esperas de entre 30 min y 24 h que cruzaron un umbral (30 min, 2 h, 6 h) que aún no se les recordó
 * y toca (según el nivel), un solo recordatorio agrupado que cuenta solo esas esperas. Al decirlo, todas las de la ventana
 * quedan marcadas hasta el umbral que ya cumplieron. Habla la voz de la oficina: el recordatorio está en tercera persona.
 */
function revisarRecordatorio(): void {
  const s = sync;
  if (!s || !vigilando) return;
  const aj = ajustes();
  if (!aj.voces || !suena(aj, "recordar")) return;
  const ahora = Date.now();
  const intervaloMs = intervaloRecordatorioMs(aj.nivel);
  if (!tocaRecordar({ intervaloMs, ahora, ultimoRecordatorio, ultimoToca })) return;
  const silenciados = erroresSilenciados();
  const leidos = agentesDe(s).filter((a) => conocidaEn(s, a.companyId));
  const ventana = vencidos(leidos, ahora, (a) => esErrorViejo(a, ahora, silenciados));
  if (!hayQueRecordar(ventana, recordados.cargar(ahora))) return;
  const items = unaPorAgente(ventana).map(({ agente: a, ms, i }) => {
    const esperas = [a.teNecesita[i]!, ...a.teNecesita.filter((_, j) => j !== i)];
    const corto = nombreCorto(a.nombre);
    return { quien: aj.presentacion === "nombre-empresa" ? `${corto}, de ${a.empresa}` : corto, ms, por: porQueEspera(esperas, rolesDe(a.companyId)) };
  });
  const texto = textoRecordatorio(items);
  const voz = vozDeLaOficina(leidos);
  if (!texto || !voz || !intervaloMs || !reclamar(`voz:recordar:${Math.floor(ahora / intervaloMs)}`)) return;
  ultimoRecordatorio = ahora;
  recordados.guardar(ventana, ahora);
  ponerLibre(texto, vozDe(voz), aj.presentacion, habla);
}

/**
 * Con cada lectura y cada minuto: las empresas que acaban de quedar sin nadie trabajando (el estado se sigue aunque la
 * frase esté apagada). Un run en cola cuenta como alguien (está por empezar). Varias en la misma revisión: una sola frase.
 */
function revisarVacias(agentes: readonly AgenteVista[], ahora: number): void {
  const cuentas = new Map<string, number>();
  for (const a of agentes) {
    const trabaja = a.st === "trabaja" || a.run?.enCola === true;
    cuentas.set(a.companyId, (cuentas.get(a.companyId) ?? 0) + (trabaja ? 1 : 0));
    if (trabaja) ultimoTrabajando.set(a.companyId, a.id);
  }
  const salen = sinNadie.observar(ahora, cuentas);
  const aj = ajustes();
  if (salen.length === 0 || !aj.voces || !suena(aj, "hitos")) return;
  const quienes = salen.map((cid) => agentes.find((a) => a.id === ultimoTrabajando.get(cid)) ?? agentes.find((a) => a.companyId === cid)).filter((a): a is AgenteVista => !!a);
  const primero = quienes[0];
  if (!primero || !reclamar(`voz:vacia:${[...salen].sort().join(",")}:${Math.floor(ahora / 3_600_000)}`)) return;
  ponerLibre(textoSinNadie([...new Set(quienes.map((a) => a.empresa))]), vozDe(primero), aj.presentacion, habla);
}

/**
 * Esta pestaña volvió a verse. Si desde el inicio de la ausencia pasaron 15 min o más, una frase con lo que llegó por el
 * canal en vivo mientras tanto (terminadas, errores, bloqueadas que la vigía vio) más los agentes que empezaron a esperarte
 * desde entonces (no los que ya esperaban), y el mismo texto como aviso en pantalla. El inicio es el más tardío entre cuándo
 * se ocultó esta pestaña, desde cuándo vigila y la última visita guardada por cualquier pestaña visible: si trabajaste en
 * otra pestaña de la Oficina, no hubo ausencia. Sin nada nuevo, no dice nada. El aviso en pantalla sale con los avisos o las
 * voces encendidos; la voz, solo con las voces encendidas y el audio desbloqueado. Al abrir la página lo hace
 * `avisoAlAbrir.tsx` (con una lectura de la API).
 */
function alVolver(): void {
  const desde = ocultaDesde;
  ocultaDesde = null;
  const s = sync;
  if (desde == null || !s || !vigilando) return;
  const aj = ajustes();
  if (!(aj.avisos || aj.voces) || !suena(aj, "volver")) return;
  const ahora = Date.now();
  // Lo que la vigía no vio (empezó a vigilar después de ocultarse) no se cuenta: no se inventa.
  const inicio = inicioDeAusencia({ ocultaDesde: desde, vigilandoDesde, ultimaVisita: visitaGuardada(), ahora });
  if (ahora - inicio < AUSENCIA_MIN_MS) return;
  const agentes = agentesDe(s);
  const datos = { ...sucesos.contar(inicio, ahora), esperan: esperanDesde(agentes, inicio) };
  const texto = textoVolver(datos, inicio, ahora);
  if (!texto || !reclamar(`voz:volver:${Math.floor(ahora / 60_000)}`)) return;
  if (aj.voces && audioDesbloqueado()) {
    const voz = vozDeLaOficina(agentes);
    if (voz) ponerLibre(texto, vozDe(voz), aj.presentacion, habla);
  }
  const toast = toasts.at(-1);
  if (toast) toast({ id: "oficina:volver", dedupeKey: "oficina:volver", title: t("Mientras no estabas"), body: cuerpoVolver(datos, inicio, ahora), tone: "info", ttlMs: 12_000 });
}

/**
 * JST-415: «mientras no estabas» al abrir la página. El aviso en pantalla lo arma `avisoAlAbrir.tsx`; aquí solo se dice, con
 * voces encendidas, la frase permitida por el nivel y el audio desbloqueado (si no, no suena: es un aviso, no una alarma).
 */
export function decirAlAbrir(texto: string): void {
  const s = sync;
  const aj = ajustes();
  if (!s || !aj.voces || !suena(aj, "volver") || !audioDesbloqueado() || !reclamar(`voz:abrir:${Math.floor(Date.now() / 60_000)}`)) return;
  const voz = vozDeLaOficina(agentesDe(s));
  if (voz) ponerLibre(texto, vozDe(voz), aj.presentacion, habla);
}

/** Para las pruebas en la copia: el estado de la vigía de esta pestaña. */
export function estadoVigia() {
  return { id: ID, vigilando, pares: vivos().map((p) => p.id), marca };
}
