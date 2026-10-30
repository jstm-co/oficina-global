// Ficha del personaje (design-spec de JST-65 §9): nombre, cargo, empresa,
// estado, tarea actual o última tarea, lo que espera tu respuesta y enlaces a
// la tarea, al run y al agente. Popover en computador; hoja inferior en el
// celular y en el modo TV. Ningún botón de la ficha cambia nada.
//
// 0.2.0 (design-spec de JST-95 §4): un agente con error muestra el error
// completo (código, hora, run y el final del log, que se lee solo al abrir la
// ficha, una vez por run), y a quien te espera se le responde en la ventana
// (`onResponder`) en vez de ir a la tarea.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type AnchorHTMLAttributes, type CSSProperties, type ReactNode } from "react";
import { hrefRun as rutaRun, hrefTarea } from "../estado.js";
import { textoFicha } from "../hora.js";
import { diaYHora, duracion, horaLinea, textoCopia, type LineaLog } from "../log.js";
import { chipDe } from "../responder.js";
import type { Sincronizador, UltimoTrabajo } from "../sincronizador.js";
import type { RunResumen, TareaRef } from "../shared.js";
import { desdeCuando, ESPERAS, ESTADOS, hace, motivoPausa, runCorto, type AgenteVista } from "../vista.js";
import { claseEmpresa, cx, EtiquetaEmpresa, Icono, Personaje } from "./piso.js";
import type { Animacion } from "./sprites.js";
import { useHoras } from "./useOficina.js";

/** Props de un enlace a una página del host (`/PRE/issues/…`). */
export type Enlazar = (href: string) => AnchorHTMLAttributes<HTMLAnchorElement>;

const ICONO_TAREA: Record<string, string> = {
  backlog: "circle-dashed",
  todo: "circle",
  in_progress: "rotate-cw",
  in_review: "circle-dot",
  blocked: "circle-minus",
  done: "circle-check",
  cancelled: "ban",
};

function FilaTarea({ prefijo, tarea, enlazar }: { prefijo: string; tarea: { identifier: string | null; title: string | null; status?: string | null } | null; enlazar: Enlazar }) {
  if (!tarea?.identifier) return null;
  const st = tarea.status ?? "in_progress";
  return (
    <a className="of-trow" {...enlazar(hrefTarea(prefijo, tarea.identifier))}>
      <span className="of-st" style={{ "--stc": `var(--of-st-${st})` } as CSSProperties}>
        <Icono nombre={ICONO_TAREA[st] ?? "circle"} tam={14} />
      </span>
      <span className="of-tid">{tarea.identifier}</span>
      <span className="of-tt">{tarea.title ?? ""}</span>
    </a>
  );
}

function Boton({ href, enlazar, children, clase }: { href: string | null; enlazar: Enlazar; children: ReactNode; clase?: string }) {
  if (!href) {
    return (
      <span className={cx("of-btn", clase)} aria-disabled="true">
        {children}
        <Icono nombre="arrow-up-right" tam={14} />
      </span>
    );
  }
  return (
    <a className={cx("of-btn", clase)} {...enlazar(href)}>
      {children}
      <Icono nombre="arrow-up-right" tam={14} />
    </a>
  );
}

const ANIM_FICHA: Record<AgenteVista["st"], Animacion> = { trabaja: "teclear", toca: "mano", error: "error", pausa: "dormir", libre: "libre" };

function hrefAgente(a: AgenteVista): string {
  return `/${encodeURIComponent(a.prefijo)}/agents/${encodeURIComponent(a.id)}`;
}

function hrefEspera(a: AgenteVista, i = 0): string | null {
  const e = a.teNecesita[i];
  if (!e) return null;
  return e.href ?? (e.identifier ? `${hrefTarea(a.prefijo, e.identifier)}#interaction` : null);
}

/** Último run y su tarea, pedido al abrir la ficha (en pausa, libre o con error). */
function useUltimoTrabajo(sync: Sincronizador | null, agente: AgenteVista): UltimoTrabajo | null | undefined {
  const [ultimo, setUltimo] = useState<UltimoTrabajo | null | undefined>(undefined);
  const necesita = agente.st !== "trabaja" && !agente.run;
  const actual = useRef(agente);
  actual.current = agente;
  // Se vuelve a pedir solo si cambia el agente o su estado, no en cada actualización de la oficina.
  const clave = `${agente.id}:${agente.statusApi}:${agente.desde ?? ""}`;
  useEffect(() => {
    if (!sync || !necesita) return;
    let vivo = true;
    void sync.ultimoTrabajo(actual.current).then((u) => vivo && setUltimo(u));
    return () => {
      vivo = false;
    };
  }, [sync, clave, necesita]);
  return ultimo;
}

// ---------------------------------------------------------------------------
// Error completo (§4)
// ---------------------------------------------------------------------------

type EstadoLog = { tipo: "leyendo" } | { tipo: "ok"; lineas: LineaLog[] } | { tipo: "sin" } | { tipo: "fallo" };

/** El final del log del run, una vez por run (el sincronizador lo guarda); «Reintentar» lo vuelve a pedir. */
function useFinalLog(sync: Sincronizador | null, run: RunResumen | null | undefined): { log: EstadoLog; reintentar: () => void } {
  const [log, setLog] = useState<EstadoLog>({ tipo: "leyendo" });
  const [intento, setIntento] = useState(0);
  const actual = useRef(run);
  actual.current = run;
  const id = run?.id ?? null;
  useEffect(() => {
    const r = actual.current;
    if (!sync || !r) return;
    let vivo = true;
    setLog({ tipo: "leyendo" });
    sync.finalLog(r).then(
      (lineas) => vivo && setLog(lineas && lineas.length > 0 ? { tipo: "ok", lineas } : { tipo: "sin" }),
      () => vivo && setLog({ tipo: "fallo" }),
    );
    return () => {
      vivo = false;
    };
  }, [sync, id, intento]);
  const reintentar = useCallback(() => setIntento((n) => n + 1), []);
  return { log, reintentar };
}

const ANCHOS_SK_LOG = [92, 70, 84, 58, 96, 66, 88, 44];

/** Lo que copia «Copiar» si la página no da con qué (la API del portapapeles o, en http, un textarea). */
async function copiarSolo(texto: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(texto);
    return;
  }
  const area = document.createElement("textarea");
  area.value = texto;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand("copy");
  area.remove();
  if (!ok) throw new Error("No se pudo copiar");
}

interface PropsError {
  a: AgenteVista;
  ultimo: UltimoTrabajo | null | undefined;
  sync: Sincronizador | null;
  ahora: number;
  enlazar: Enlazar;
  fila: ReactNode;
  copiar?: (texto: string) => Promise<void>;
  avisar?: (contenido: ReactNode) => void;
}

/** «Qué pasó», código, cuándo, run, el final del log y la tarea (§4). */
function ErrorCompleto({ a, ultimo, sync, ahora, enlazar, fila, copiar, avisar }: PropsError) {
  const run = ultimo?.run ?? null;
  const { log, reintentar } = useFinalLog(sync, run);
  // El log abre mostrando el final (ahí suele estar el error), una vez por run.
  const refLog = useRef<HTMLDivElement>(null);
  const lineas = log.tipo === "ok" ? log.lineas.length : 0;
  useLayoutEffect(() => {
    if (refLog.current) refLog.current.scrollTop = refLog.current.scrollHeight;
  }, [run?.id, lineas]);
  const [copiado, setCopiado] = useState(false);
  const fin = run?.finishedAt ?? null;
  const cuando = run ? diaYHora(fin ?? run.startedAt ?? run.createdAt, ahora) : "";
  const duro = run ? duracion(run.startedAt, fin) : "";
  const extra = run?.exitCode != null ? `exit ${run.exitCode}` : (run?.signal ?? null);

  const copiarLog = () => {
    if (!run || log.tipo !== "ok") return;
    const texto = textoCopia({
      empresa: a.empresa,
      agente: a.nombre,
      runId: run.id,
      errorCode: run.errorCode ?? null,
      exitCode: run.exitCode ?? null,
      signal: run.signal ?? null,
      cuando,
      motivo: a.motivo,
      lineas: log.lineas,
    });
    void (copiar ?? copiarSolo)(texto).then(
      () => {
        const n = log.lineas.length;
        const mensaje = `Copiado: código, hora y ${n} ${n === 1 ? "línea" : "líneas"} del log`;
        if (avisar) {
          avisar(
            <>
              <Icono nombre="check" tam={14} />
              <span>{mensaje}</span>
            </>,
          );
        } else {
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2000);
        }
      },
      () => avisar?.(<span>No pude copiar el log.</span>),
    );
  };

  let cajaLog: ReactNode = null;
  if (ultimo === undefined || (run && log.tipo === "leyendo")) {
    cajaLog = (
      <div className="of-logbox" aria-busy="true">
        <div className="of-logh">
          <span>Final del log</span>
        </div>
        <div className="of-sklog">
          {ANCHOS_SK_LOG.map((w, i) => (
            <i key={i} className="of-sk" style={{ width: `${w}%` }} />
          ))}
        </div>
      </div>
    );
  } else if (run && log.tipo === "fallo") {
    cajaLog = (
      <div className="of-logbox">
        <div className="of-logh">
          <span>Final del log</span>
        </div>
        <div className="of-lognote" role="status">
          <Icono nombre="cloud-off" tam={14} />
          <span>No pude leer el log.</span>
          <span className="of-sp" />
          <button type="button" className="of-btn is-xs" onClick={reintentar}>
            <Icono nombre="refresh" tam={12} />
            Reintentar
          </button>
        </div>
      </div>
    );
  } else if (run && log.tipo === "sin") {
    cajaLog = (
      <div className="of-logbox">
        <div className="of-logh">
          <span>Final del log</span>
        </div>
        <div className="of-lognote is-vacio" role="status">
          <Icono nombre="info" tam={14} />
          <span>Este run no dejó log.</span>
        </div>
      </div>
    );
  } else if (run && log.tipo === "ok") {
    cajaLog = (
      <div className="of-logbox">
        <div className="of-logh">
          <span>
            Final del log · {log.lineas.length} {log.lineas.length === 1 ? "línea" : "líneas"}
          </span>
          <span className="of-sp" />
          <button type="button" className="of-btn is-xs" title="Copia el código, la hora y estas líneas" onClick={copiarLog}>
            <Icono nombre={copiado ? "check" : "copy"} tam={12} />
            {copiado ? "Copiado" : "Copiar"}
          </button>
        </div>
        <div ref={refLog} className="of-log" role="log" tabIndex={0} aria-label={`Final del log del run ${runCorto(run.id)}`}>
          {log.lineas.map((l, i) => (
            <div key={i} className={cx("of-ll", l.error && "is-err")}>
              <i>{horaLinea(l.ts)}</i>
              <span>{l.texto}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="of-fk">Qué pasó</div>
      <div className="of-errbox">
        <Icono nombre="triangle-alert" tam={14} />
        <span>{a.motivo ?? run?.error ?? "El último run terminó con error."}</span>
      </div>
      {run ? (
        <div className="of-exm">
          {run.errorCode || extra ? (
            <div>
              <span className="of-exk">Código</span>
              {run.errorCode ? <code className="of-excode">{run.errorCode}</code> : null}
              {extra ? <code className="of-exsub">{extra}</code> : null}
            </div>
          ) : null}
          {cuando ? (
            <div>
              <span className="of-exk">Cuándo</span>
              <span>
                {cuando}
                {fin ? ` · ${hace(fin, ahora)}` : ""}
                {duro ? ` · duró ${duro}` : ""}
              </span>
            </div>
          ) : null}
          <div>
            <span className="of-exk">Run</span>
            <a className="of-exrun" {...enlazar(rutaRun(a.prefijo, a.id, run.id))}>
              <span className="of-mono">{run.id.slice(0, 8)}</span>
              <Icono nombre="arrow-up-right" tam={12} />
            </a>
          </div>
        </div>
      ) : null}
      {cajaLog}
      {fila ? (
        <>
          <div className="of-fk">Tarea</div>
          {fila}
        </>
      ) : null}
    </>
  );
}

export interface PropsFicha {
  agente: AgenteVista;
  /** Todos los agentes a la vista (para la franja de Hermes). */
  agentes: readonly AgenteVista[];
  sync: Sincronizador | null;
  ahora: number;
  rm: boolean;
  enlazar: Enlazar;
  onCerrar: () => void;
  onSeleccionar: (id: string) => void;
  /** Abrir la ventana para responder en esa espera (0.2.0). Sin esto, «Responder» y las esperas llevan a la tarea, como en la 0.1.x. */
  onResponder?: (indice: number) => void;
  /** Copiar el error completo («Copiar» del log). Sin esto, usa el portapapeles del navegador. */
  copiar?: (texto: string) => Promise<void>;
  /** Aviso breve («✓ Copiado: código, hora y 20 líneas del log»). */
  avisar?: (contenido: ReactNode) => void;
}

/** La ficha de un agente con error lleva el error completo: el popover pasa de 340 a 420 px (§4). */
export function anchoFicha(a: Pick<AgenteVista, "st" | "run">): number {
  return a.st === "error" && !a.run ? 420 : 340;
}

export function Ficha({ agente: a, agentes, sync, ahora, rm, enlazar, onCerrar, onSeleccionar, onResponder, copiar, avisar }: PropsFicha) {
  const ultimo = useUltimoTrabajo(sync, a);
  // 0.5.0 (JST-163 §9): cuándo termina lo que hace ahora, con sus últimos runs (sin lecturas nuevas).
  const { horas, ahora: ahoraHora } = useHoras(sync);
  const estimada = a.st === "trabaja" && a.run && !a.run.enCola ? (horas?.estimacion(a.id, a.run.desde, ahoraHora) ?? null) : null;
  const lineaHora = textoFicha(estimada, ahoraHora);
  const s = ESTADOS[a.st];
  const tareaUltima: TareaRef | null = ultimo?.tarea ?? null;
  const tarea = a.run ? { identifier: a.run.identifier, title: a.run.titulo, status: a.run.tareaStatus } : tareaUltima;
  const hrefTareaActual = a.run?.tareaHref ?? (tareaUltima?.identifier ? hrefTarea(a.prefijo, tareaUltima.identifier) : null);
  const hrefRun = a.run?.href ?? (ultimo ? `/${encodeURIComponent(a.prefijo)}/agents/${encodeURIComponent(a.id)}/runs/${encodeURIComponent(ultimo.runId)}` : null);
  const ademas = a.need && a.st !== "toca";
  const desde = a.st === "toca" ? (a.teNecesita.map((e) => e.desde).filter(Boolean).sort()[0] ?? a.desde) : a.desde;
  const cuando = a.st === "pausa" ? desdeCuando(desde, ahora) : hace(desde, ahora);
  const fila = (t: typeof tarea) => <FilaTarea prefijo={a.prefijo} tarea={t} enlazar={enlazar} />;

  let cuerpo: ReactNode = null;
  if (a.st === "trabaja") {
    cuerpo = (
      <>
        <div className="of-fk">Tarea actual</div>
        {fila(tarea)}
        {a.run ? (
          <div className="of-facts">
            <span>
              <Icono nombre={a.run.enCola ? "hourglass" : "activity"} tam={12} />
              Run {runCorto(a.run.id)} · {a.run.enCola ? "en cola, parte en segundos" : `empezó ${hace(a.run.desde, ahora)}`}
            </span>
            {lineaHora ? (
              <span className={cx("of-eta-f", estimada?.tipo === "sin" && "is-sin")}>
                <Icono nombre="timer" tam={12} />
                {lineaHora}
              </span>
            ) : null}
          </div>
        ) : null}
      </>
    );
  } else if (a.st === "toca") {
    cuerpo = (
      <div className="of-facts">
        <span>
          <Icono nombre="coffee" tam={12} />
          Sin run en curso: te espera en su puesto
        </span>
      </div>
    );
  } else if (a.st === "error" && !a.run) {
    cuerpo = <ErrorCompleto a={a} ultimo={ultimo} sync={sync} ahora={ahora} enlazar={enlazar} fila={tarea?.identifier ? fila(tarea) : null} copiar={copiar} avisar={avisar} />;
  } else if (a.st === "error") {
    // Con error y un reintento en cola: el run nuevo todavía no dice nada del error.
    cuerpo = (
      <>
        <div className="of-fk">Qué pasó</div>
        <div className="of-errbox">
          <Icono nombre="triangle-alert" tam={14} />
          <span>{a.motivo ?? "El último run terminó con error."}</span>
        </div>
        {fila(tarea)}
      </>
    );
  } else if (a.st === "pausa") {
    cuerpo = (
      <>
        <div className="of-fk">En pausa {cuando}</div>
        {a.motivo ? (
          <div className="of-facts">
            <span>
              <Icono nombre="pause" tam={12} />
              {motivoPausa(a.motivo)}
            </span>
          </div>
        ) : null}
        {tarea ? <div className="of-fk">Última tarea</div> : null}
        {fila(tarea)}
      </>
    );
  } else {
    cuerpo = (
      <>
        {tarea ? <div className="of-fk">Última tarea</div> : null}
        {fila(tarea)}
        <div className="of-facts">
          <span>
            <Icono nombre="coffee" tam={12} />
            En la sala de descanso {hace(a.desde, ahora)}
          </span>
        </div>
      </>
    );
  }

  const esperas = a.need ? (
    <>
      <div className="of-fk">Espera tu respuesta{a.teNecesita.length > 1 ? ` · ${a.teNecesita.length}` : ""}</div>
      <div className="of-qlist">
        {a.teNecesita.map((e, i) => {
          const tipo = onResponder ? chipDe(e) : ESPERAS[e.tipo];
          const contenido = (
            <>
              <span className="of-qk">
                <Icono nombre={tipo.icono} tam={12} />
                {tipo.label}
              </span>
              <span className="of-qq">{e.titulo ?? e.identifier ?? tipo.label}</span>
              <span className="of-qt">
                {e.identifier ? <span className="of-tid">{e.identifier}</span> : null}
                {hace(e.desde, ahora)}
              </span>
            </>
          );
          // 0.2.0: cada espera abre la ventana para responder, en esa espera (§4).
          if (onResponder) {
            return (
              <button key={e.itemId} type="button" className="of-qrow" onClick={() => onResponder(i)}>
                {contenido}
              </button>
            );
          }
          const href = hrefEspera(a, i);
          return (
            <a key={e.itemId} className="of-qrow" {...(href ? enlazar(href) : {})}>
              {contenido}
            </a>
          );
        })}
      </div>
    </>
  ) : null;

  const n = a.teNecesita.length;
  // 0.2.0: el botón violeta abre la ventana para responder (§4).
  const responder = onResponder && a.need ? (
    <button type="button" className="of-btn is-primary is-toca" onClick={() => onResponder(0)}>
      <Icono nombre="hand" tam={14} />
      {n > 1 ? `Responder · ${n}` : "Responder"}
    </button>
  ) : null;

  let botones: ReactNode;
  let tres = false;
  if (responder && (a.st === "toca" || a.st === "trabaja")) {
    botones = (
      <>
        {responder}
        {a.st === "trabaja" ? <Boton href={hrefRun} enlazar={enlazar}>Ver run</Boton> : <Boton href={hrefAgente(a)} enlazar={enlazar}>Ver agente</Boton>}
      </>
    );
  } else if (responder && a.st === "error") {
    tres = true;
    botones = (
      <>
        {responder}
        <Boton href={hrefRun} enlazar={enlazar}>Ver run</Boton>
        <Boton href={hrefTareaActual} enlazar={enlazar}>Abrir tarea</Boton>
      </>
    );
  } else if (responder) {
    botones = (
      <>
        {responder}
        <Boton href={hrefAgente(a)} enlazar={enlazar}>Ver agente</Boton>
      </>
    );
  } else if (a.st === "trabaja" && !a.need) {
    botones = (
      <>
        <Boton href={hrefTareaActual} enlazar={enlazar} clase="is-primary">Abrir tarea</Boton>
        <Boton href={hrefRun} enlazar={enlazar}>Ver run</Boton>
      </>
    );
  } else if (a.st === "toca" || (a.st === "trabaja" && a.need)) {
    const primero = a.teNecesita[0];
    botones = (
      <>
        <Boton href={hrefEspera(a)} enlazar={enlazar} clase="is-primary is-toca">{primero ? ESPERAS[primero.tipo].boton : "Responder"}</Boton>
        {a.st === "trabaja" ? <Boton href={hrefRun} enlazar={enlazar}>Ver run</Boton> : <Boton href={hrefAgente(a)} enlazar={enlazar}>Ver agente</Boton>}
      </>
    );
  } else if (a.st === "error") {
    botones = (
      <>
        <Boton href={hrefRun} enlazar={enlazar} clase="is-primary">Ver run</Boton>
        <Boton href={hrefTareaActual} enlazar={enlazar}>Abrir tarea</Boton>
      </>
    );
  } else {
    botones = (
      <>
        <Boton href={hrefTareaActual} enlazar={enlazar}>Abrir última tarea</Boton>
        <Boton href={hrefAgente(a)} enlazar={enlazar}>Ver agente</Boton>
      </>
    );
  }

  const hermes = a.esHermes ? agentes.filter((x) => x.esHermes) : [];

  return (
    <div className="of-ficha" role="dialog" aria-label={a.nombre}>
      <div className="of-fh">
        <div className={cx("of-fav", claseEmpresa(a.prefijo))}>
          <Personaje aspecto={a.aspecto} anim={rm ? "parado" : ANIM_FICHA[a.st]} x={0} y={0} />
        </div>
        <div className="of-fn">
          <div className="of-nm">{a.nombre}</div>
          {a.rol && a.rol !== a.nombre ? <div className="of-cg">{a.rol}</div> : null}
          <div className="of-fco">
            <EtiquetaEmpresa prefijo={a.prefijo} />
            <span>{a.empresa}</span>
          </div>
        </div>
        <button type="button" className="of-ibtn of-x" aria-label="Cerrar" onClick={onCerrar}>
          <Icono nombre="x" tam={14} />
        </button>
      </div>
      <div className="of-fsts">
        <div className={cx("of-fst", `of-c-${a.st}`)}>
          <Icono nombre={s.icono} tam={14} />
          <b>{a.st === "trabaja" && a.run?.enCola ? "En cola" : s.label}</b>
          {ademas || !cuando ? null : <span>· {cuando}</span>}
        </div>
        {ademas ? (
          <div className="of-fst is-also of-c-toca">
            <Icono nombre="hand" tam={14} />
            <b>Te necesita</b>
          </div>
        ) : null}
      </div>
      <div className="of-fb">
        {a.st === "toca" ? (
          <>
            {esperas}
            {cuerpo}
          </>
        ) : (
          <>
            {cuerpo}
            {esperas}
          </>
        )}
      </div>
      {hermes.length > 1 ? (
        <div className="of-herm">
          <div className="of-fk">Hermes en las {hermes.length} empresas</div>
          <div className="of-hrow">
            {hermes.map((h) => (
              <button key={h.id} type="button" className={cx("of-hpill", h.id === a.id && "is-on")} aria-pressed={h.id === a.id} onClick={() => onSeleccionar(h.id)}>
                <EtiquetaEmpresa prefijo={h.prefijo} />
                <span className={`of-sdot of-c-${h.st}`}>
                  <Icono nombre={ESTADOS[h.st].icono} tam={12} />
                </span>
                {ESTADOS[h.st].corto}
                {h.need && h.st !== "toca" ? (
                  <span className="of-sdot of-c-toca">
                    <Icono nombre="hand" tam={12} />
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className={cx("of-fbt", tres && "is-3")}>{botones}</div>
    </div>
  );
}

/**
 * Popover de la ficha en computador (§9): a la derecha del personaje (+12 px),
 * o a la izquierda si no cabe; al menos a 12 px del borde y a 60 px de arriba.
 * `seguir`: el ancla se mueve sola (la de la vista 3D), y la ficha va con ella en cada cuadro.
 */
export function FichaFlotante({ ancla, children, onCerrar, ancho = 340, seguir = false }: { ancla: HTMLElement | null; children: ReactNode; onCerrar: () => void; ancho?: number; seguir?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ubicar = () => {
      const r = ancla?.getBoundingClientRect() ?? { left: innerWidth / 2, right: innerWidth / 2, top: 200 };
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      let x = r.right + 12;
      if (x + w > innerWidth - 12) x = r.left - w - 12;
      if (x < 12) x = Math.max(12, Math.min(innerWidth - w - 12, r.left));
      // Un ancla pegada al borde derecho: la ficha a su izquierda tampoco se sale.
      x = Math.max(12, Math.min(innerWidth - w - 12, x));
      const y = Math.max(60, Math.min(innerHeight - h - 12, r.top - 20));
      const nx = Math.round(x);
      const ny = Math.round(y);
      setPos((p) => (p && p.left === nx && p.top === ny ? p : { left: nx, top: ny }));
    };
    ubicar();
    // La ficha crece cuando llega la última tarea: se vuelve a ubicar.
    const obs = new ResizeObserver(ubicar);
    obs.observe(el);
    window.addEventListener("resize", ubicar);
    let vuelta = 0;
    const cadaCuadro = () => {
      ubicar();
      vuelta = requestAnimationFrame(cadaCuadro);
    };
    if (seguir) vuelta = requestAnimationFrame(cadaCuadro);
    return () => {
      obs.disconnect();
      window.removeEventListener("resize", ubicar);
      cancelAnimationFrame(vuelta);
    };
  }, [ancla, seguir]);
  useEffect(() => {
    const fuera = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || ancla?.contains(t)) return;
      onCerrar();
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [ancla, onCerrar]);
  return (
    <div ref={ref} className="of-pop" style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0, width: ancho }}>
      {children}
    </div>
  );
}

/** Hoja inferior (celular y modo TV). */
export function FichaHoja({ children, onCerrar, tv = false }: { children: ReactNode; onCerrar: () => void; tv?: boolean }) {
  return (
    <>
      <div className="of-sheet-bg" onClick={onCerrar} />
      <div className={cx("of-sheet", tv && "is-tv")}>
        {tv ? null : <div className="of-grab" />}
        {children}
      </div>
    </>
  );
}
