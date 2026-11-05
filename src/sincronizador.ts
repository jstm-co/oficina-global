// Mantiene al día el estado de los agentes de todas las empresas.
//
// 1. Al iniciar: empresas, y por cada una agentes + runs vivos + «Te toca»
//    (3 llamadas por empresa), más el código de las tareas de los runs.
// 2. Después, por evento: un canal en vivo por empresa. Cada evento pide solo
//    lo que cambió, agrupado en una ventana corta:
//      heartbeat.run.queued / heartbeat.run.status → runs vivos
//      agent.status                                 → se aplica al tiro, y agentes
//                                                     (motivo del error y horas)
//      activity.logged  agent.*                      → agentes (pausa, reanudar…)
//      activity.logged  tarjetas, aprobaciones,
//                       cambios de tarea            → «Te toca»
//    Los eventos de log y progreso del run se ignoran. Un `issue.updated` que
//    pasa una tarea a revisión anota quién lo hizo (JST-252). Una revisión sin
//    camino de una tarea que sigue del agente se vuelve a leer al minuto y
//    cuenta solo si sigue (JST-266, `seguirSinCamino`).
// 3. Revisión de respaldo: cada `respaldoMs` con el canal abierto (por si se
//    perdió un evento) y cada `sinCanalMs` para las empresas sin canal.
// 4. Con la pestaña oculta (`pausar`) se cierran los canales y los timers; al
//    volver (`reanudar`) se recarga todo una vez.
// 5. Cada empresa tiene su estado de carga: si una no responde, las demás
//    siguen al día y esa se reintenta con la revisión de `sinCanalMs` (20 s).
//    Lo mismo si falla «Te toca».
// 6. El canal de cada empresa se abre junto con su primera lectura, y la
//    empresa sigue «cargando» hasta que el canal abre (JST-131): antes, una
//    entrega no llega y la página diría «En vivo» sin sacar su sobre.
import { agenteQuePasoARevision, agenteVisible, armarEmpresa, contar, pasoARevision, revisionesSinAgente, seguirSinCamino, tareasEnRevision, tareasFaltantes, type AgenteOficina, type DatosEmpresa, type Entregas, type VistaSinCamino } from "./estado.js";
import { abrirCanal, ErrorHttp, leerActividad, leerEmpresa, leerLog, leerTarea, listarAgentes, listarAtencion, listarEmpresas, listarRunsVivos, runsDelAgente, tareaDelRun, ultimoRun, type Canal, type Conexion } from "./fuentes.js";
import { lineasDelLog, type LineaLog } from "./log.js";
import type { Empresa, EventoVivo, ItemAtencion, RunResumen, TareaRef } from "./shared.js";

/** Final del log de un run: las líneas, o `null` si el run no dejó log. */
export type FinalLog = LineaLog[] | null;

export type Parte = "agentes" | "runs" | "atencion";

/** Cómo está la lectura de una empresa. */
export interface EstadoCarga {
  /** Todavía no llegó la primera lectura, o su canal todavía no abre (JST-131). */
  cargando: boolean;
  /** La última lectura de agentes o runs falló: la sala queda a oscuras y sus agentes no cuentan. */
  error: string | null;
  /** «Te toca» no respondió: no se sabe quién de esta empresa te necesita. */
  sinAtencion: boolean;
}

/** Último run de un agente y su tarea, para la ficha (en pausa, libre o con error). */
export interface UltimoTrabajo {
  runId: string;
  runStatus: string;
  tarea: TareaRef | null;
  /** El run tal como llega (con `errorCode`, `exitCode`, `signal` y el tamaño del log, para el error completo). */
  run: RunResumen;
}

/** Bytes del final del log que se leen al abrir la ficha de un agente con error (JST-94: ~20 KB en JSON). */
export const BYTES_LOG = 16_384;

const TODO: readonly Parte[] = ["agentes", "runs", "atencion"];

type Lectura<T> = { ok: true; valor: T } | { ok: false; error: string };

async function intentar<T>(leer: () => Promise<T>): Promise<Lectura<T>> {
  try {
    return { ok: true, valor: await leer() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export interface OpcionesSincronizador {
  cx: Conexion;
  /** Solo estas empresas (por ID) en vez de `GET /api/companies`. Para la sonda con llave de agente. */
  soloEmpresas?: string[];
  /** Abrir el canal en vivo. Sin él, todo va por revisión cada `sinCanalMs`. */
  usarCanal?: boolean;
  respaldoMs?: number;
  sinCanalMs?: number;
  /** Ventana para agrupar eventos de runs antes de pedir `/live-runs`. */
  esperaRunsMs?: number;
  /** Ventana para agrupar eventos de actividad antes de pedir `/attention` o `/agents`. */
  esperaActividadMs?: number;
  /**
   * Cuánto sigue «cargando» una empresa ya leída si su canal no abre (un
   * intento que falla no espera: es un canal que se reconecta, JST-96 §5).
   */
  esperaCanalMs?: number;
  /**
   * Aplicar los eventos sin la ventana de espera (con la pestaña oculta: Chrome
   * frena sus temporizadores a 1 por segundo, o por minuto después de 5 min, y
   * la vigía de los avisos tardaría en ver lo que llega).
   */
  sinEspera?: () => boolean;
  ahora?: () => number;
}

/** Un cambio que llegó por evento y cuándo quedó visible. */
export interface Cambio {
  companyId: string;
  tipo: string;
  /** Cuándo el servidor creó el evento (ms). */
  creado: number;
  /** Desde que el servidor creó el evento hasta que llegó al cliente. */
  llegadaMs: number;
  /** Desde que el servidor creó el evento hasta que el estado quedó aplicado. */
  visibleMs: number | null;
}

export interface Metricas {
  inicio: number;
  llamadas: Map<string, number>;
  eventos: Map<string, { n: number; bytes: number }>;
  cambios: Cambio[];
  cargaInicialMs: number | null;
}

/** Acciones de actividad que pueden cambiar «Te toca». */
export function afectaAtencion(action: string): boolean {
  return (
    action.startsWith("issue.thread_interaction") ||
    action.startsWith("approval.") ||
    action.startsWith("decision") ||
    action === "issue.updated" ||
    action === "issue.created" ||
    action === "issue.blockers_updated"
  );
}

/** Acciones de actividad que cambian el `status` de un agente sin `agent.status`. */
export function afectaAgentes(action: string): boolean {
  return action.startsWith("agent.") || action.startsWith("hire") || action.startsWith("approval.");
}

/** Qué partes de la empresa hay que pedir de nuevo por un evento. `null`: se ignora. */
export function partesPorEvento(evento: EventoVivo): Parte[] | null {
  switch (evento.type) {
    case "heartbeat.run.queued":
    case "heartbeat.run.status":
      return ["runs"];
    case "activity.logged": {
      const action = String(evento.payload.action ?? "");
      const partes: Parte[] = [];
      if (afectaAgentes(action)) partes.push("agentes");
      if (afectaAtencion(action)) partes.push("atencion");
      return partes.length > 0 ? partes : null;
    }
    default:
      return null;
  }
}

interface Pendiente {
  partes: Set<Parte>;
  timer: ReturnType<typeof setTimeout> | null;
  cambios: Cambio[];
}

export const RELECTURA_RUN_SIN_TAREA_MS = 60_000;

interface BusquedaRun {
  companyId: string;
  leida: number;
  promesa: Promise<void> | null;
  timer: ReturnType<typeof setTimeout> | null;
}

export class Sincronizador {
  empresas: Empresa[] = [];
  /** Error al listar las empresas (sin eso no hay oficina). */
  errorEmpresas: string | null = null;
  readonly datos = new Map<string, DatosEmpresa>();
  readonly estados = new Map<string, EstadoCarga>();
  readonly tareas = new Map<string, TareaRef>();
  /** Tarea encontrada después para cada run que partió sin `issueId` (JST-374). */
  private readonly tareasTomadas = new Map<string, string>();
  private readonly busquedasRuns = new Map<string, BusquedaRun>();
  /**
   * Quién pasó cada tarea a revisión, por empresa (JST-252): del evento en vivo
   * o, para una revisión sin agente que llega en «Te toca», de la actividad de
   * la tarea (una vez). `entregasDesde`: el número de lectura desde el que vale
   * (una lectura pedida antes no lo borra).
   */
  private readonly entregas = new Map<string, Map<string, string | null>>();
  private readonly entregasDesde = new Map<string, number>();
  private readonly leyendoEntregas = new Map<string, Promise<void>>();
  /**
   * Las revisiones sin camino del agente que se están viendo, por empresa
   * (JST-266, `seguirSinCamino`; sin la empresa: todavía no se lee su «Te
   * toca»), y la relectura que mira si siguen.
   */
  private readonly sinCamino = new Map<string, Map<string, VistaSinCamino>>();
  private readonly releerSinCamino = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly ultimos = new Map<string, { clave: string; promesa: Promise<UltimoTrabajo | null> }>();
  /** Lo que ya llegó de `ultimoTrabajo` (la lista lo muestra sin pedir nada, JST-95 §3). */
  private readonly ultimosListos = new Map<string, UltimoTrabajo | null>();
  /** Final del log por run: se lee una sola vez por run (si falla, se puede reintentar). */
  private readonly logs = new Map<string, Promise<FinalLog>>();
  readonly metricas: Metricas;
  private readonly canales = new Map<string, Canal>();
  /**
   * Empresas sin leer cuyo canal todavía no abre: al llegar su lectura siguen
   * «cargando» (JST-131). El temporizador (`esperaCanalMs`) corre desde que
   * llega la lectura; `null` mientras no llega.
   */
  private readonly esperanCanal = new Map<string, ReturnType<typeof setTimeout> | null>();
  /** Lecturas pedidas, para saber si una se pidió después de crear un canal. */
  private pedidas = 0;
  /** Por empresa, el número de la última lectura completa que todavía no vuelve. */
  private readonly enCamino = new Map<string, number>();
  private readonly pendientes = new Map<string, Pendiente>();
  private readonly oyentes = new Set<() => void>();
  private readonly oyentesEventos = new Set<(companyId: string, evento: EventoVivo) => void>();
  /** Empresas cuyo canal ya abrió alguna vez, y quién oye cuando uno vuelve a abrir (la hora estimada, 0.5.0). */
  private readonly yaAbrieron = new Set<string>();
  private readonly oyentesReconexion = new Set<(companyId: string) => void>();
  private respaldo: ReturnType<typeof setInterval> | null = null;
  private sinCanal: ReturnType<typeof setInterval> | null = null;
  private activo = false;
  /** El número de la relectura de la vuelta que todavía no llega (0: ninguna). */
  private relectura = 0;
  private vueltas = 0;
  private readonly cx: Conexion;
  private readonly op: Required<Omit<OpcionesSincronizador, "cx" | "soloEmpresas">>;
  private readonly soloEmpresas: string[] | null;

  constructor(opciones: OpcionesSincronizador) {
    this.soloEmpresas = opciones.soloEmpresas ?? null;
    this.op = {
      usarCanal: opciones.usarCanal ?? true,
      respaldoMs: opciones.respaldoMs ?? 60_000,
      sinCanalMs: opciones.sinCanalMs ?? 20_000,
      esperaRunsMs: opciones.esperaRunsMs ?? 250,
      esperaActividadMs: opciones.esperaActividadMs ?? 1_000,
      esperaCanalMs: opciones.esperaCanalMs ?? 5_000,
      sinEspera: opciones.sinEspera ?? (() => false),
      ahora: opciones.ahora ?? Date.now,
    };
    this.metricas = { inicio: this.op.ahora(), llamadas: new Map(), eventos: new Map(), cambios: [], cargaInicialMs: null };
    const alLlamar = opciones.cx.alLlamar;
    this.cx = {
      ...opciones.cx,
      alLlamar: (ruta) => {
        this.metricas.llamadas.set(ruta, (this.metricas.llamadas.get(ruta) ?? 0) + 1);
        alLlamar?.(ruta);
      },
    };
  }

  /** Se llama cada vez que cambia el estado. Devuelve la función para dejar de escuchar. */
  alCambiar(oyente: () => void): () => void {
    this.oyentes.add(oyente);
    return () => this.oyentes.delete(oyente);
  }

  /** Cada evento del canal en vivo, tal cual llega (las voces, 0.2.0). Devuelve la función para dejar de escuchar. */
  alEventoVivo(oyente: (companyId: string, evento: EventoVivo) => void): () => void {
    this.oyentesEventos.add(oyente);
    return () => this.oyentesEventos.delete(oyente);
  }

  /**
   * El canal de una empresa vuelve a abrir después de haber abierto antes (se
   * cortó, o la pestaña estuvo oculta): pudo perder eventos (la hora estimada,
   * 0.5.0). Devuelve la función para dejar de escuchar.
   */
  alReconectar(oyente: (companyId: string) => void): () => void {
    this.oyentesReconexion.add(oyente);
    return () => this.oyentesReconexion.delete(oyente);
  }

  /** Agentes de las empresas leídas sin error (los de una empresa que no responde no cuentan). */
  agentes(): AgenteOficina[] {
    return this.empresas.flatMap((empresa) => {
      const datos = this.datos.get(empresa.id);
      return datos && !this.estados.get(empresa.id)?.error ? armarEmpresa(datos, this.tareas, this.entregasDe(empresa.id), this.tareasTomadas) : [];
    });
  }

  estadoEmpresa(companyId: string): EstadoCarga {
    return this.estados.get(companyId) ?? { cargando: true, error: null, sinAtencion: false };
  }

  /** Quién pasó cada tarea a revisión en esa empresa (JST-252). */
  entregasDe(companyId: string): Entregas {
    return this.entregas.get(companyId) ?? new Map();
  }

  /** Agentes visibles de una empresa según la última lectura buena (para dibujar la sala aunque esté a oscuras). */
  numAgentes(companyId: string): number | null {
    const datos = this.datos.get(companyId);
    return datos ? datos.agentes.filter(agenteVisible).length : null;
  }

  /** Último run del agente y su tarea. Se pide al abrir la ficha y se guarda hasta que el agente cambie. */
  ultimoTrabajo(agente: AgenteOficina): Promise<UltimoTrabajo | null> {
    const clave = `${agente.statusApi}:${agente.desde ?? ""}:${agente.run?.id ?? ""}`;
    const guardado = this.ultimos.get(agente.id);
    if (guardado && guardado.clave === clave) return guardado.promesa;
    const promesa = (async () => {
      const run = await ultimoRun(this.cx, agente.companyId, agente.id);
      if (!run) return null;
      const issueId = run.contextSnapshot?.issueId ?? null;
      let tarea = issueId ? (this.tareas.get(issueId) ?? null) : null;
      if (issueId && !tarea) {
        tarea = await leerTarea(this.cx, issueId).catch(() => null);
        if (tarea) this.tareas.set(tarea.id, tarea);
      }
      return { runId: run.id, runStatus: run.status, tarea, run };
    })().catch(() => null);
    this.ultimos.set(agente.id, { clave, promesa });
    void promesa.then((u) => this.ultimosListos.set(agente.id, u));
    return promesa;
  }

  /** Los últimos 30 runs de un agente, para la hora estimada (0.5.0): con la misma conexión, así cuenta en las mediciones. */
  runsDelAgente(companyId: string, agentId: string): Promise<RunResumen[]> {
    return runsDelAgente(this.cx, companyId, agentId);
  }

  /** La última tarea de un agente si ya se leyó al abrir su ficha (no pide nada). */
  ultimaConocida(agenteId: string): TareaRef | null {
    return this.ultimosListos.get(agenteId)?.tarea ?? null;
  }

  /** El código del error del último run (`adapter_failed`…) si ya se leyó al abrir la ficha (no pide nada). */
  codigoErrorConocido(agenteId: string): string | null {
    const u = this.ultimosListos.get(agenteId);
    return u && (u.run.status === "failed" || u.run.status === "timed_out") ? (u.run.errorCode ?? null) : null;
  }

  /**
   * Final del log de un run (error completo, JST-94): los últimos 16 KB, una vez
   * por run. Si falla, se olvida para poder reintentar. 404 o `logBytes` 0:
   * el run no dejó log (`null`).
   */
  finalLog(run: RunResumen): Promise<FinalLog> {
    const guardado = this.logs.get(run.id);
    if (guardado) return guardado;
    const tam = run.lastOutputBytes ?? run.logBytes ?? null;
    const promesa: Promise<FinalLog> =
      tam === 0
        ? Promise.resolve(null)
        : (async () => {
            const offset = tam ? Math.max(0, tam - BYTES_LOG) : 0;
            try {
              const tramo = await leerLog(this.cx, run.id, offset, BYTES_LOG);
              return lineasDelLog(tramo.content ?? "", offset > 0);
            } catch (error) {
              if (error instanceof ErrorHttp && error.status === 404) return null;
              this.logs.delete(run.id);
              throw error;
            }
          })();
    this.logs.set(run.id, promesa);
    return promesa;
  }

  /** Vuelve a leer «Te toca» de una empresa (después de responder, JST-95 §5) y avisa. */
  async refrescarAtencion(companyId: string): Promise<void> {
    await this.recargar(companyId, ["atencion"]);
    this.notificar();
  }

  contadores() {
    return contar(this.agentes());
  }

  /**
   * En pausa (pestaña oculta) o releyendo todo al volver: lo que cambió
   * mientras estaba oculta todavía no llega. Es `false` ya en el aviso que trae
   * esa lectura (la vida lo usa para que eso aparezca en su lugar y lo que
   * cambie después camine, JST-137).
   */
  releyendo(): boolean {
    return !this.activo || this.relectura > 0;
  }

  /** Empresas con el canal en vivo abierto. */
  canalesAbiertos(): number {
    return [...this.canales.values()].filter((canal) => canal.abierto).length;
  }

  async iniciar(): Promise<void> {
    const t0 = this.op.ahora();
    // Activo desde antes de listar: `cargarEmpresas` abre cada canal junto con
    // la lectura de su empresa, no después de leerlas todas (JST-131).
    this.reanudar(false);
    await this.cargarEmpresas();
    this.metricas.cargaInicialMs = this.op.ahora() - t0;
  }

  /** «Reintentar»: vuelve a leer lo que falló (las empresas, o las que no respondieron o sin «Te toca»). */
  async reintentar(): Promise<void> {
    if (this.errorEmpresas) {
      await this.cargarEmpresas();
      return;
    }
    await this.recargarTodo((id) => this.conProblema(id));
  }

  /** Pestaña oculta: sin canales ni revisiones. */
  pausar(): void {
    if (!this.activo) return;
    this.activo = false;
    for (const canal of this.canales.values()) canal.cerrar();
    this.canales.clear();
    // Sin canales no hay qué esperar; al volver, la recarga deja de «cargar».
    for (const timer of this.esperanCanal.values()) if (timer) clearTimeout(timer);
    this.esperanCanal.clear();
    for (const pendiente of this.pendientes.values()) if (pendiente.timer) clearTimeout(pendiente.timer);
    this.pendientes.clear();
    // Al volver no se sabe qué pasó mientras tanto: las revisiones sin camino que estén cuentan, como al abrir (JST-266).
    for (const timer of this.releerSinCamino.values()) clearTimeout(timer);
    this.releerSinCamino.clear();
    this.sinCamino.clear();
    for (const busqueda of this.busquedasRuns.values()) {
      if (busqueda.timer) clearTimeout(busqueda.timer);
      busqueda.timer = null;
    }
    if (this.respaldo) clearInterval(this.respaldo);
    if (this.sinCanal) clearInterval(this.sinCanal);
    this.respaldo = this.sinCanal = null;
  }

  /** Pestaña visible otra vez. `recargar`: pedir todo de nuevo (lo que cambió mientras estaba oculta). */
  reanudar(recargar = true): void {
    if (this.activo) return;
    this.activo = true;
    // Los canales antes que la recarga: así la recarga cubre lo que pase mientras abren.
    if (this.op.usarCanal) {
      for (const empresa of this.empresas) this.abrir(empresa.id);
    }
    if (recargar) {
      const n = ++this.vueltas;
      this.relectura = n;
      void this.recargarTodo(undefined, () => {
        if (this.relectura === n) this.relectura = 0;
      });
    }
    this.respaldo = setInterval(() => {
      void this.recargarTodo((id) => this.canales.get(id)?.abierto === true && !this.conProblema(id));
    }, this.op.respaldoMs);
    this.sinCanal = setInterval(() => {
      if (this.errorEmpresas) void this.cargarEmpresas();
      else void this.recargarTodo((id) => (this.op.usarCanal && this.canales.get(id)?.abierto !== true) || this.conProblema(id));
    }, this.op.sinCanalMs);
  }

  detener(): void {
    this.pausar();
    this.oyentes.clear();
    this.oyentesEventos.clear();
    this.oyentesReconexion.clear();
  }

  // -------------------------------------------------------------------------

  private notificar(): void {
    for (const oyente of this.oyentes) oyente();
  }

  private conProblema(companyId: string): boolean {
    const estado = this.estados.get(companyId);
    return !!estado && (estado.error !== null || estado.sinAtencion);
  }

  /** Lista las empresas y lee cada una; cada empresa avisa apenas llega (las demás no la esperan). */
  private async cargarEmpresas(): Promise<void> {
    const lista = await intentar(() =>
      this.soloEmpresas ? Promise.all(this.soloEmpresas.map((id) => leerEmpresa(this.cx, id))) : listarEmpresas(this.cx),
    );
    if (!lista.ok) {
      this.errorEmpresas = lista.error;
      this.notificar();
      return;
    }
    this.errorEmpresas = null;
    this.empresas = lista.valor;
    for (const empresa of this.empresas) if (!this.estados.has(empresa.id)) this.estados.set(empresa.id, { cargando: true, error: null, sinAtencion: false });
    this.notificar();
    if (this.activo && this.op.usarCanal) for (const empresa of this.empresas) if (!this.canales.has(empresa.id)) this.abrir(empresa.id);
    await Promise.all(this.empresas.map((empresa) => this.recargar(empresa.id, TODO).then(() => this.notificar())));
  }

  /** `alLlegar`: justo antes de avisar (el aviso ya lo ve hecho). */
  private async recargarTodo(filtro: (companyId: string) => boolean = () => true, alLlegar?: () => void): Promise<void> {
    const ids = this.empresas.map((empresa) => empresa.id).filter(filtro);
    if (ids.length === 0 && !alLlegar) return;
    await Promise.all(ids.map((id) => this.recargar(id, TODO)));
    alLlegar?.();
    this.notificar();
  }

  /**
   * Pide las partes indicadas de una empresa y los códigos de tarea que falten.
   * Si fallan los agentes o los runs, la empresa queda con `error` (y sus datos
   * anteriores no cuentan); si falla «Te toca», queda `sinAtencion`.
   */
  async recargar(companyId: string, partes: readonly Parte[]): Promise<void> {
    const empresa = this.empresas.find((item) => item.id === companyId);
    if (!empresa) return;
    const todo = !this.datos.has(companyId) || this.estados.get(companyId)?.error != null;
    const pide = (parte: Parte) => todo || partes.includes(parte);
    const numero = this.pedidas++;
    const completa = TODO.every(pide);
    if (completa) this.enCamino.set(companyId, numero);
    const [agentes, runs, atencion] = await Promise.all([
      pide("agentes") ? intentar(() => listarAgentes(this.cx, companyId)) : null,
      pide("runs") ? intentar(() => listarRunsVivos(this.cx, companyId)) : null,
      pide("atencion") ? intentar(() => listarAtencion(this.cx, companyId)) : null,
    ]);
    if (completa && this.enCamino.get(companyId) === numero) this.enCamino.delete(companyId);
    const estado = this.estadoEmpresa(companyId);
    const fallo = agentes && !agentes.ok ? agentes : runs && !runs.ok ? runs : null;
    if (fallo && !fallo.ok) {
      this.estados.set(companyId, { ...estado, cargando: false, error: fallo.error });
      return;
    }
    // Se mezcla con lo más reciente (no con lo que había al pedir): otra
    // recarga de la misma empresa pudo terminar mientras tanto.
    const actual = this.datos.get(companyId);
    const valor = <T>(lectura: Lectura<T> | null): T | undefined => (lectura?.ok ? lectura.valor : undefined);
    const atencionNueva = atencion ? (atencion.ok ? atencion.valor : null) : undefined;
    const datos: DatosEmpresa = {
      empresa,
      agentes: valor(agentes) ?? actual?.agentes ?? [],
      runs: valor(runs) ?? actual?.runs ?? [],
      atencion: atencionNueva !== undefined ? atencionNueva : (actual?.atencion ?? null),
      porConfirmar: atencionNueva ? this.seguirSinCamino(companyId, atencionNueva) : actual?.porConfirmar,
    };
    this.datos.set(companyId, datos);
    if (atencionNueva) this.olvidarEntregas(companyId, atencionNueva, numero);
    const espera = this.esperanCanal.has(companyId);
    this.estados.set(companyId, { cargando: espera, error: null, sinAtencion: datos.atencion === null });
    if (espera && this.esperanCanal.get(companyId) === null) {
      this.esperanCanal.set(companyId, setTimeout(() => this.soltarEspera(companyId), this.op.esperaCanalMs));
    }
    const faltan = tareasFaltantes([datos], this.tareas);
    const sinQuien = revisionesSinAgente(datos.atencion, datos.agentes, this.entregasDe(companyId));
    const [leidas] = await Promise.all([
      Promise.all(faltan.map((id) => leerTarea(this.cx, id).catch(() => null))),
      Promise.all(sinQuien.map((id) => this.leerEntrega(companyId, id))),
      this.buscarTareasTardias(companyId, datos),
    ]);
    for (const tarea of leidas) if (tarea) this.tareas.set(tarea.id, tarea);
  }

  /** Busca la tarea de cada run vivo sin `issueId`, como máximo una vez por minuto y run (JST-374). */
  private buscarTareasTardias(companyId: string, datos: DatosEmpresa): Promise<void> {
    const runs = datos.runs.filter((run) => run.status === "running" || run.status === "queued");
    const vivos = new Set(runs.map((run) => run.id));
    for (const [id, busqueda] of this.busquedasRuns) if (busqueda.companyId === companyId && !vivos.has(id)) this.olvidarBusquedaRun(id);
    const lecturas: Promise<void>[] = [];
    for (const run of runs) {
      if (run.issueId) {
        this.olvidarBusquedaRun(run.id);
        continue;
      }
      if (this.tareasTomadas.has(run.id)) continue;
      const lectura = this.buscarTareaTardia(run);
      if (lectura) lecturas.push(lectura);
    }
    return Promise.all(lecturas).then(() => undefined);
  }

  private buscarTareaTardia(run: DatosEmpresa["runs"][number]): Promise<void> | null {
    const ahora = this.op.ahora();
    const previa = this.busquedasRuns.get(run.id);
    if (previa?.promesa) return previa.promesa;
    const busqueda = previa ?? { companyId: run.companyId, leida: -Infinity, promesa: null, timer: null };
    const espera = busqueda.leida + RELECTURA_RUN_SIN_TAREA_MS - ahora;
    if (espera > 0) {
      this.programarBusquedaRun(run, busqueda);
      return null;
    }
    if (busqueda.timer) clearTimeout(busqueda.timer);
    busqueda.timer = null;
    busqueda.leida = ahora;
    this.busquedasRuns.set(run.id, busqueda);
    const promesa = tareaDelRun(this.cx, run.companyId, run.agentId, run.id)
      .then((tarea) => {
        const actual = this.datos.get(run.companyId)?.runs.find((item) => item.id === run.id && (item.status === "running" || item.status === "queued"));
        if (!actual || actual.issueId) return;
        if (tarea) {
          this.tareas.set(tarea.id, tarea);
          this.tareasTomadas.set(run.id, tarea.id);
        } else {
          this.programarBusquedaRun(run, busqueda);
        }
      })
      .catch(() => this.programarBusquedaRun(run, busqueda))
      .finally(() => {
        busqueda.promesa = null;
      });
    busqueda.promesa = promesa;
    return promesa;
  }

  private programarBusquedaRun(run: DatosEmpresa["runs"][number], busqueda: BusquedaRun): void {
    if (!this.activo || busqueda.timer || this.busquedasRuns.get(run.id) !== busqueda || this.tareasTomadas.has(run.id)) return;
    const actual = this.datos.get(run.companyId)?.runs.find((item) => item.id === run.id && (item.status === "running" || item.status === "queued"));
    if (!actual || actual.issueId) return;
    busqueda.timer = setTimeout(() => {
      busqueda.timer = null;
      if (this.busquedasRuns.get(run.id) !== busqueda || this.tareasTomadas.has(run.id)) return;
      const vigente = this.datos.get(run.companyId)?.runs.find((item) => item.id === run.id && (item.status === "running" || item.status === "queued"));
      if (!vigente || vigente.issueId) return;
      void this.buscarTareaTardia(vigente)?.then(() => this.notificar());
    }, Math.max(0, busqueda.leida + RELECTURA_RUN_SIN_TAREA_MS - this.op.ahora()));
  }

  private olvidarBusquedaRun(runId: string): void {
    const busqueda = this.busquedasRuns.get(runId);
    if (busqueda?.timer) clearTimeout(busqueda.timer);
    this.busquedasRuns.delete(runId);
    this.tareasTomadas.delete(runId);
  }

  /**
   * JST-266: sigue las revisiones sin camino del agente de esta lectura y
   * devuelve las que todavía no cuentan. Si queda alguna, vuelve a leer «Te
   * toca» cuando se cumpla su minuto (no con `programar`: sin espera, con la
   * pestaña oculta, releería al tiro una y otra vez).
   */
  private seguirSinCamino(companyId: string, items: readonly ItemAtencion[]): Set<string> {
    const { vistas, porConfirmar, releerEn } = seguirSinCamino(items, this.sinCamino.get(companyId) ?? null, this.op.ahora());
    this.sinCamino.set(companyId, vistas);
    const antes = this.releerSinCamino.get(companyId);
    if (antes) clearTimeout(antes);
    this.releerSinCamino.delete(companyId);
    if (releerEn !== null && this.activo) {
      const timer = setTimeout(() => {
        if (this.releerSinCamino.get(companyId) !== timer) return;
        this.releerSinCamino.delete(companyId);
        void this.refrescarAtencion(companyId);
      }, Math.max(0, releerEn) + 500);
      this.releerSinCamino.set(companyId, timer);
    }
    return porConfirmar;
  }

  private anotarEntrega(companyId: string, issueId: string, agenteId: string | null, desde: number): void {
    let m = this.entregas.get(companyId);
    if (!m) this.entregas.set(companyId, (m = new Map()));
    m.set(issueId, agenteId);
    this.entregasDesde.set(issueId, desde);
  }

  /** Olvida quién pasó a revisión las tareas que ya no están en revisión en «Te toca» (si vuelven, se lee de nuevo). */
  private olvidarEntregas(companyId: string, items: readonly ItemAtencion[], numero: number): void {
    const m = this.entregas.get(companyId);
    if (!m || m.size === 0) return;
    const siguen = tareasEnRevision(items);
    for (const id of [...m.keys()]) {
      if (siguen.has(id) || (this.entregasDesde.get(id) ?? 0) > numero) continue;
      m.delete(id);
      this.entregasDesde.delete(id);
    }
  }

  /** Lee de la actividad de la tarea quién la pasó a revisión, una vez (dos lecturas a la vez esperan la misma). */
  private leerEntrega(companyId: string, issueId: string): Promise<void> {
    const enCamino = this.leyendoEntregas.get(issueId);
    if (enCamino) return enCamino;
    const desde = this.pedidas;
    const promesa = leerActividad(this.cx, issueId)
      .then((actividad) => {
        // Si mientras tanto llegó el evento, vale el evento.
        if (!this.entregasDe(companyId).has(issueId)) this.anotarEntrega(companyId, issueId, agenteQuePasoARevision(actividad), desde);
      })
      .catch((error: unknown) => {
        // Sin permiso o sin la tarea: no se vuelve a pedir. Otro error: se intenta con la próxima lectura.
        if (error instanceof ErrorHttp && error.status >= 400 && error.status < 500) this.anotarEntrega(companyId, issueId, null, desde);
      })
      .finally(() => this.leyendoEntregas.delete(issueId));
    this.leyendoEntregas.set(issueId, promesa);
    return promesa;
  }

  private abrir(companyId: string): void {
    // Lo que pasó antes de que el canal abriera no llegó por él: al abrir se
    // relee la empresa. La primera vez no hace falta si su lectura completa se
    // pidió junto con el canal y todavía no vuelve (la carga inicial y la vuelta
    // de la pestaña la piden); sí, si ya volvió (el canal tardó más, JST-131).
    const desde = this.pedidas;
    if (!this.datos.has(companyId) && !this.esperanCanal.has(companyId)) this.esperanCanal.set(companyId, null);
    let primera = true;
    this.canales.set(
      companyId,
      abrirCanal(this.cx, companyId, {
        evento: (evento, bytes) => this.alEvento(companyId, evento, bytes),
        abierto: () => {
          const cubierta = primera && (this.enCamino.get(companyId) ?? -1) >= desde;
          if (!cubierta) this.programar(companyId, "actividad", TODO, null, 0);
          primera = false;
          this.soltarEspera(companyId);
          if (this.yaAbrieron.has(companyId)) for (const oyente of this.oyentesReconexion) oyente(companyId);
          this.yaAbrieron.add(companyId);
          this.notificar();
        },
        cerrado: () => this.notificar(),
        fallo: () => this.soltarEspera(companyId),
      }),
    );
  }

  /** La empresa deja de esperar su canal: si ya se leyó, deja de «cargar». */
  private soltarEspera(companyId: string): void {
    if (!this.esperanCanal.has(companyId)) return;
    const timer = this.esperanCanal.get(companyId);
    if (timer) clearTimeout(timer);
    this.esperanCanal.delete(companyId);
    const estado = this.estados.get(companyId);
    if (estado?.cargando && this.datos.has(companyId)) {
      this.estados.set(companyId, { ...estado, cargando: false });
      this.notificar();
    }
  }

  private alEvento(companyId: string, evento: EventoVivo, bytes: number): void {
    const ahora = this.op.ahora();
    const cuenta = this.metricas.eventos.get(evento.type) ?? { n: 0, bytes: 0 };
    cuenta.n += 1;
    cuenta.bytes += bytes;
    this.metricas.eventos.set(evento.type, cuenta);
    if (evento.type === "activity.logged") {
      const entrega = pasoARevision(evento.payload);
      if (entrega) this.anotarEntrega(companyId, entrega.issueId, entrega.agenteId, this.pedidas);
    }
    for (const oyente of this.oyentesEventos) oyente(companyId, evento);
    const creado = Date.parse(evento.createdAt);
    const cambio: Cambio = {
      companyId,
      tipo: evento.type === "activity.logged" ? `activity.logged:${String(evento.payload.action ?? "")}` : evento.type,
      creado,
      llegadaMs: ahora - creado,
      visibleMs: null,
    };

    if (evento.type === "agent.status") {
      // Trae el estado nuevo: se aplica al tiro. No trae el motivo del error ni
      // `updatedAt`, así que el agente se vuelve a pedir en la ventana de la
      // actividad. Mientras, «desde» es la hora del evento y el motivo viejo no
      // se muestra (el servidor lo borra al salir de error).
      const datos = this.datos.get(companyId);
      const agente = datos?.agentes.find((item) => item.id === evento.payload.agentId);
      if (agente && typeof evento.payload.status === "string") {
        agente.status = evento.payload.status;
        if (!Number.isNaN(creado)) agente.updatedAt = evento.createdAt;
        if (typeof evento.payload.lastHeartbeatAt === "string") agente.lastHeartbeatAt = evento.payload.lastHeartbeatAt;
        if (agente.status !== "error") agente.errorReason = null;
        cambio.visibleMs = this.op.ahora() - creado;
        this.metricas.cambios.push(cambio);
        this.notificar();
        this.programar(companyId, "actividad", ["agentes"], null, this.op.esperaActividadMs);
      }
      return;
    }
    const partes = partesPorEvento(evento);
    if (!partes) return;
    // Los runs van aparte y antes: no esperan la ventana de la actividad.
    if (partes.length === 1 && partes[0] === "runs") this.programar(companyId, "runs", partes, cambio, this.op.esperaRunsMs);
    else this.programar(companyId, "actividad", partes, cambio, this.op.esperaActividadMs);
  }

  /** Agrupa los eventos de una empresa: una sola recarga por grupo y ventana. */
  private programar(companyId: string, grupo: "runs" | "actividad", partes: readonly Parte[], cambio: Cambio | null, esperaMs: number): void {
    const clave = `${companyId}:${grupo}`;
    const pendiente = this.pendientes.get(clave);
    if (pendiente) {
      for (const parte of partes) pendiente.partes.add(parte);
      if (cambio) pendiente.cambios.push(cambio);
      return;
    }
    const correr = () => {
      if (this.pendientes.get(clave) !== nuevo) return;
      this.pendientes.delete(clave);
      void this.recargar(companyId, [...nuevo.partes]).then(() => {
        const listo = this.op.ahora();
        for (const item of nuevo.cambios) {
          item.visibleMs = listo - item.creado;
          this.metricas.cambios.push(item);
        }
        this.notificar();
      });
    };
    const nuevo: Pendiente = { partes: new Set(partes), cambios: cambio ? [cambio] : [], timer: null };
    this.pendientes.set(clave, nuevo);
    // Sin espera, los eventos del mismo instante se juntan igual (microtarea, sin temporizador).
    if (this.op.sinEspera()) queueMicrotask(correr);
    else nuevo.timer = setTimeout(correr, esperaMs);
  }
}
