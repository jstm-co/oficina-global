// Modal de tarea (JST-411): la tarea se ve encima de la Oficina, sin salir de la
// página. Portado del modal de Board global (JST-408). Muestra descripción,
// comentarios (con caja para comentar), estado, responsable y fechas; lo demás
// (documentos, corridas, aprobaciones) sigue en la página de la tarea, a un clic.
import { Component, useCallback, useEffect, useMemo, useRef, useState, type AnchorHTMLAttributes, type CSSProperties, type KeyboardEvent as TeclaReact, type ReactNode } from "react";
import { MarkdownBlock } from "@paperclipai/plugin-sdk/ui";
import { hace } from "../vista.js";
import type { AgenteVista } from "../vista.js";
import {
  ESTADOS_TAREA,
  ICONO_ESTADO,
  TOPE_COMENTARIOS,
  autorComentario,
  comentariosVisibles,
  cuerpoComentario,
  esEstadoTarea,
  nombreEstado,
  nombrePrioridad,
  responsableTarea,
  type ComentarioTarea,
} from "../tarea.js";
import { Capa, useAtraparFoco, useEsc } from "./capas.js";
import { cx, EtiquetaEmpresa, Icono } from "./piso.js";
import { cambiarEstado, comentar, leerComentarios, leerTarea, marcarLeida, type DetalleTarea } from "./tareaDatos.js";

export interface PropsTareaModal {
  tarea: { prefijo: string; ref: string };
  /** Todos los agentes: el nombre del responsable y de quien comenta, por id. */
  agentes: readonly AgenteVista[];
  /** Usuario de la sesión: sus comentarios dicen «Tú»; los de otros usuarios, «Usuario». */
  usuarioId: string | null;
  /** < 768 px: pantalla entera, en una columna. */
  celular: boolean;
  ahora: number;
  /** Dirección de la página completa de la tarea. */
  hrefPagina: string;
  /** Props del `<a>` de «Página completa» (navega normal, como el resto de los enlaces del host). */
  enlacePagina?: AnchorHTMLAttributes<HTMLAnchorElement>;
  onCerrar: () => void;
  /** Aviso breve de la página (errores al cambiar el estado). */
  avisar?: (contenido: ReactNode) => void;
  /** El usuario comentó o cambió el estado: la página puede volver a leer. */
  onCambio?: () => void;
}

/** Alto de la descripción antes de «Mostrar toda la descripción». */
const TOPE_DESCRIPCION = 260;

/** Borradores de comentario por tarea: cerrar el modal sin enviar no pierde lo escrito (en memoria). */
const borradores = new Map<string, string>();

interface Hilo {
  clave: string;
  tarea: DetalleTarea | null;
  errorTarea: string | null;
  comentarios: ComentarioTarea[] | null;
  errorComentarios: string | null;
}

const hiloVacio = (clave: string): Hilo => ({ clave, tarea: null, errorTarea: null, comentarios: null, errorComentarios: null });

/** Lee la tarea y sus comentarios; al abrirla queda leída, como en su página. */
function useHilo(clave: string, ref: string) {
  const [hilo, setHilo] = useState<Hilo>(() => hiloVacio(clave));
  const [intento, setIntento] = useState(0);
  useEffect(() => {
    let viva = true;
    const parchar = (cambio: Partial<Hilo>) => {
      if (viva) setHilo((h) => (h.clave === clave ? { ...h, ...cambio } : h));
    };
    setHilo(hiloVacio(clave));
    leerTarea(ref).then(
      (tarea) => {
        parchar({ tarea });
        leerComentarios(tarea.id, TOPE_COMENTARIOS).then(
          (comentarios) => parchar({ comentarios }),
          (e: Error) => parchar({ errorComentarios: e.message }),
        );
        void marcarLeida(tarea.id).catch(() => undefined);
      },
      (e: Error) => parchar({ errorTarea: e.message }),
    );
    return () => {
      viva = false;
    };
  }, [clave, ref, intento]);
  const agregar = useCallback((c: ComentarioTarea) => setHilo((h) => (h.clave === clave ? { ...h, comentarios: [c, ...(h.comentarios ?? [])] } : h)), [clave]);
  const cambiarEstadoLocal = useCallback(
    (status: string) => setHilo((h) => (h.clave === clave && h.tarea ? { ...h, tarea: { ...h.tarea, status } } : h)),
    [clave],
  );
  return { hilo: hilo.clave === clave ? hilo : hiloVacio(clave), agregar, cambiarEstadoLocal, reintentar: () => setIntento((n) => n + 1) };
}

/** Si el renderizador de Markdown del host falla, queda el texto tal cual, con sus saltos de línea. */
class GuardaMarkdown extends Component<{ texto: string; children: ReactNode }, { fallo: boolean }> {
  state = { fallo: false };
  static getDerivedStateFromError() {
    return { fallo: true };
  }
  render() {
    return this.state.fallo ? <div className="of-tk-plano">{this.props.texto}</div> : this.props.children;
  }
}

function Markdown({ texto }: { texto: string }) {
  return (
    <GuardaMarkdown key={texto} texto={texto}>
      <MarkdownBlock content={texto} className="of-tk-md" />
    </GuardaMarkdown>
  );
}

function Descripcion({ texto }: { texto: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [larga, setLarga] = useState(false);
  const [abierta, setAbierta] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Con margen: no vale la pena cortar por un par de líneas.
    const medir = () => setLarga(el.scrollHeight > TOPE_DESCRIPCION + 60);
    medir();
    // El renderizador del host puede pintar después del primer pase.
    const timer = window.setTimeout(medir, 300);
    const observador = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(medir);
    observador?.observe(el);
    if (el.firstElementChild) observador?.observe(el.firstElementChild);
    return () => {
      window.clearTimeout(timer);
      observador?.disconnect();
    };
  }, [texto]);
  const cortada = larga && !abierta;
  return (
    <>
      <div ref={ref} className={cx("of-tk-desc", cortada && "is-cortada")} style={cortada ? { maxHeight: TOPE_DESCRIPCION } : undefined}>
        <Markdown texto={texto} />
      </div>
      {larga ? (
        <button type="button" className="of-tk-mas" aria-expanded={abierta} onClick={() => setAbierta(!abierta)}>
          {abierta ? "Mostrar menos" : "Mostrar toda la descripción"}
        </button>
      ) : null}
    </>
  );
}

export function TareaModal({ tarea, agentes, usuarioId, celular, ahora, hrefPagina, enlacePagina, onCerrar, avisar, onCambio }: PropsTareaModal): ReactNode {
  const clave = `${tarea.prefijo}/${tarea.ref}`;
  const ref = useRef<HTMLDivElement>(null);
  const cuerpoRef = useRef<HTMLDivElement>(null);
  const { hilo, agregar, cambiarEstadoLocal, reintentar } = useHilo(clave, tarea.ref);
  const [menu, setMenu] = useState(false);
  const [cambiando, setCambiando] = useState(false);
  const botonEstado = useRef<HTMLButtonElement>(null);
  const alCambio = useRef(onCambio);
  alCambio.current = onCambio;
  const alAvisar = useRef(avisar);
  alAvisar.current = avisar;
  const montado = useRef(true);
  useEffect(
    () => () => {
      montado.current = false;
    },
    [],
  );

  // El foco entra al modal al abrir y vuelve a donde estaba al cerrar.
  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => antes?.focus?.();
  }, []);
  useAtraparFoco(ref, true);
  // Esc: si el menú de estado está abierto, ese Esc es del menú (queda encima en la pila).
  useEsc(menu, () => {
    setMenu(false);
    botonEstado.current?.focus();
  });
  useEsc(true, onCerrar);

  const detalle = hilo.tarea;
  const idTitulo = `of-tk-t-${tarea.ref.replace(/[^a-z0-9_-]/gi, "")}`;
  const codigo = detalle?.identifier ?? (/^[a-z]+-\d+$/i.test(tarea.ref) ? tarea.ref.toUpperCase() : null);
  const estado = detalle?.status ?? null;
  const responsable = detalle ? responsableTarea(agentes, detalle, usuarioId) : null;
  const visibles = useMemo(() => (hilo.comentarios ? comentariosVisibles(hilo.comentarios) : []), [hilo.comentarios]);

  const elegirEstado = async (nuevo: string) => {
    setMenu(false);
    botonEstado.current?.focus();
    if (!detalle || nuevo === detalle.status || cambiando) return;
    const anterior = detalle.status;
    cambiarEstadoLocal(nuevo);
    setCambiando(true);
    try {
      await cambiarEstado(detalle.id, nuevo);
      alCambio.current?.();
    } catch (e) {
      if (montado.current) cambiarEstadoLocal(anterior);
      alAvisar.current?.(
        <>
          <Icono nombre="triangle-alert" tam={14} />
          <span>No se pudo cambiar el estado de {codigo ?? "la tarea"}: {(e as Error).message}</span>
        </>,
      );
    } finally {
      if (montado.current) setCambiando(false);
    }
  };

  return (
    <Capa>
      <div
        className="of-tk-bg"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onCerrar();
        }}
      >
        <div ref={ref} className={cx("of-tk", celular && "is-m")} role="dialog" aria-modal="true" aria-labelledby={idTitulo} tabIndex={-1} data-oficina-ventana="">
          <div className="of-tk-h">
            <EtiquetaEmpresa prefijo={tarea.prefijo} solida />
            <span className="of-tk-cod">{codigo ?? tarea.ref}</span>
            <span className="of-sp" />
            <a className="of-btn is-sm is-ghost" title="Abrir la página de la tarea, con todo su detalle" {...enlacePagina} href={hrefPagina}>
              <Icono nombre="external-link" tam={14} />
              <span className="of-tk-full">Página completa</span>
            </a>
            <button type="button" className="of-ibtn is-ghost" title="Cerrar (Esc)" aria-label="Cerrar" onClick={onCerrar}>
              <Icono nombre="x" tam={14} />
            </button>
          </div>

          {hilo.errorTarea ? (
            <div className="of-tk-b">
              <div className="of-tk-main">
                <div className="of-tk-fallo" role="alert">
                  <Icono nombre="triangle-alert" tam={14} />
                  <span>
                    <b>No se pudo leer la tarea.</b> {hilo.errorTarea}
                  </span>
                </div>
                <div className="of-tk-acciones">
                  <button type="button" className="of-btn is-sm" onClick={reintentar}>
                    <Icono nombre="refresh" tam={14} />
                    Reintentar
                  </button>
                  <a className="of-btn is-sm" {...enlacePagina} href={hrefPagina}>
                    Abrir la página completa
                    <Icono nombre="arrow-up-right" tam={14} />
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <div ref={cuerpoRef} className="of-tk-b">
              <div className="of-tk-main">
                {detalle ? (
                  <h3 id={idTitulo} className="of-tk-titulo">
                    {detalle.title}
                  </h3>
                ) : (
                  <h3 id={idTitulo} className="of-tk-titulo">
                    <span className="of-sr">Cargando la tarea</span>
                    <span className="of-sk of-tk-sk" style={{ width: "70%", height: 20 }} aria-hidden="true" />
                  </h3>
                )}

                <section className="of-tk-sec" aria-label="Descripción">
                  <h4>Descripción</h4>
                  {detalle ? (
                    detalle.description?.trim() ? (
                      <Descripcion key={detalle.id} texto={detalle.description} />
                    ) : (
                      <p className="of-tk-quieto">Sin descripción.</p>
                    )
                  ) : (
                    <Esqueleto lineas={3} />
                  )}
                </section>

                <section className="of-tk-sec" aria-label="Comentarios">
                  <h4>
                    Comentarios
                    {hilo.comentarios ? <span className="of-tk-n">{visibles.length}</span> : null}
                  </h4>
                  {detalle ? (
                    <Caja clave={clave} idTarea={detalle.id} codigo={codigo} usuarioId={usuarioId} onEnviado={(c) => {
                      if (montado.current) agregar(c);
                      alCambio.current?.();
                    }} />
                  ) : null}
                  {hilo.comentarios ? (
                    visibles.length === 0 ? (
                      <p className="of-tk-quieto of-tk-sinc">Todavía no hay comentarios.</p>
                    ) : (
                      <div className="of-tk-coms">
                        {visibles.map((c) => {
                          const autor = autorComentario(agentes, c, usuarioId);
                          return (
                            <article key={c.id} className={cx("of-tk-com", autor.yo && "is-yo")}>
                              <span className="of-tk-ini" aria-hidden="true">
                                {inicial(autor.nombre)}
                              </span>
                              <div className="of-tk-cb">
                                <div className="of-tk-ch">
                                  <b>{autor.nombre}</b>
                                  {autor.agente ? <Icono nombre="sparkles" tam={12} /> : null}
                                  <span title={new Date(c.createdAt).toLocaleString("es")}>{hace(c.createdAt, ahora)}</span>
                                </div>
                                <Markdown texto={c.body} />
                              </div>
                            </article>
                          );
                        })}
                        {hilo.comentarios.length >= TOPE_COMENTARIOS ? (
                          <a className="of-tk-enlace" {...enlacePagina} href={hrefPagina}>
                            Los comentarios anteriores están en la página de la tarea
                            <Icono nombre="chevron-right" tam={12} />
                          </a>
                        ) : null}
                      </div>
                    )
                  ) : hilo.errorComentarios ? (
                    <p className="of-tk-err" role="alert">
                      No se pudieron cargar los comentarios: {hilo.errorComentarios}.{" "}
                      <button type="button" className="of-tk-mas" onClick={reintentar}>
                        Reintentar
                      </button>
                    </p>
                  ) : (
                    <Esqueleto lineas={2} />
                  )}
                </section>
              </div>

              <aside className="of-tk-lado" aria-label="Detalles">
                <div className="of-tk-campo">
                  <span>Estado</span>
                  {estado ? (
                    <div className="of-tk-estado">
                      <button
                        ref={botonEstado}
                        type="button"
                        className={cx("of-btn is-sm of-tk-estbtn", menu && "is-on")}
                        aria-haspopup="menu"
                        aria-expanded={menu}
                        disabled={cambiando}
                        onClick={() => setMenu(!menu)}
                      >
                        <Punto estado={estado} />
                        {nombreEstado(estado)}
                        <Icono nombre="chevron-down" tam={12} />
                      </button>
                      {menu ? <MenuEstado actual={estado} onElegir={elegirEstado} onCerrar={() => setMenu(false)} /> : null}
                    </div>
                  ) : (
                    <span className="of-sk of-tk-sk" style={{ width: 96, height: 24 }} aria-hidden="true" />
                  )}
                </div>
                <div className="of-tk-campo">
                  <span>Responsable</span>
                  {detalle ? (
                    <b>
                      {responsable ? <Icono nombre={responsable.agente ? "sparkles" : "user-check"} tam={14} /> : null}
                      {responsable?.nombre ?? "Sin asignar"}
                    </b>
                  ) : (
                    <span className="of-sk of-tk-sk" style={{ width: 80, height: 14 }} aria-hidden="true" />
                  )}
                </div>
                <div className="of-tk-campo">
                  <span>Prioridad</span>
                  {detalle ? <b>{nombrePrioridad(detalle.priority)}</b> : <span className="of-sk of-tk-sk" style={{ width: 56, height: 14 }} aria-hidden="true" />}
                </div>
                {detalle ? (
                  <div className="of-tk-fechas">
                    {detalle.createdAt ? <span>Creada {hace(detalle.createdAt, ahora)}</span> : null}
                    {detalle.updatedAt ? <span>Actualizada {hace(detalle.updatedAt, ahora)}</span> : null}
                  </div>
                ) : null}
              </aside>
            </div>
          )}
        </div>
      </div>
    </Capa>
  );
}

function inicial(nombre: string): string {
  return (nombre.trim()[0] ?? "?").toUpperCase();
}

function Punto({ estado }: { estado: string }) {
  return (
    <span className="of-tk-punto" style={{ "--stc": `var(--of-st-${esEstadoTarea(estado) ? estado : "backlog"})` } as CSSProperties}>
      <Icono nombre={esEstadoTarea(estado) ? ICONO_ESTADO[estado] : "circle"} tam={14} />
    </span>
  );
}

/** Menú de los 7 estados; las flechas se mueven, Enter elige y Esc lo cierra (lo atiende `useEsc` del modal). */
function MenuEstado({ actual, onElegir, onCerrar }: { actual: string; onElegir: (estado: string) => void; onCerrar: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  }, []);
  // Un clic fuera del menú lo cierra.
  useEffect(() => {
    const fuera = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as Element).closest(".of-tk-estbtn")) onCerrar();
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [onCerrar]);
  const mover = (e: TeclaReact<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  };
  return (
    <div ref={ref} className="of-tk-menu" role="menu" aria-label="Cambiar estado" onKeyDown={mover}>
      {ESTADOS_TAREA.map((s) => (
        <button key={s} type="button" role="menuitemradio" aria-checked={s === actual} className="of-tk-mi" onClick={() => onElegir(s)}>
          <Punto estado={s} />
          <span>{nombreEstado(s)}</span>
          {s === actual ? <Icono nombre="check" tam={14} /> : null}
        </button>
      ))}
    </div>
  );
}

/** La caja para comentar; el borrador se conserva (en memoria) si se cierra el modal sin enviar. */
function Caja({ clave, idTarea, codigo, usuarioId, onEnviado }: { clave: string; idTarea: string; codigo: string | null; usuarioId: string | null; onEnviado: (c: ComentarioTarea) => void }) {
  const [borrador, setBorrador] = useState(() => borradores.get(clave) ?? "");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const escribir = (texto: string) => {
    setBorrador(texto);
    if (texto) borradores.set(clave, texto);
    else borradores.delete(clave);
  };
  const cuerpo = cuerpoComentario(borrador);
  const enviar = async () => {
    if (!cuerpo || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const c = await comentar(idTarea, cuerpo, usuarioId);
      // Si lo escrito cambió mientras se enviaba, se conserva lo nuevo.
      if (borradores.get(clave) === borrador) borradores.delete(clave);
      setBorrador((actual) => (actual === borrador ? "" : actual));
      onEnviado(c);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };
  return (
    <div className="of-tk-caja">
      <textarea
        value={borrador}
        rows={borrador.includes("\n") || borrador.length > 90 ? 4 : 2}
        placeholder="Escribe un comentario…"
        aria-label={`Comentario para ${codigo ?? "la tarea"}`}
        disabled={enviando}
        onChange={(e) => escribir(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void enviar();
          }
        }}
      />
      <div className="of-tk-pie">
        {error ? (
          <span className="of-tk-err" role="alert">
            No se pudo comentar: {error}
          </span>
        ) : (
          <span className="of-tk-quieto">Acepta Markdown · Ctrl o ⌘ + Enter para enviar</span>
        )}
        <span className="of-sp" />
        <button type="button" className="of-btn is-sm is-primary" disabled={!cuerpo || enviando} onClick={() => void enviar()}>
          {enviando ? "Enviando…" : "Comentar"}
        </button>
      </div>
    </div>
  );
}

function Esqueleto({ lineas }: { lineas: number }) {
  return (
    <div className="of-tk-esq" aria-hidden="true">
      {Array.from({ length: lineas }, (_, i) => (
        <span key={i} className="of-sk" style={{ width: i === lineas - 1 ? "60%" : "100%", height: 12 }} />
      ))}
    </div>
  );
}
