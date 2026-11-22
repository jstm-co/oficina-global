// «Bloqueadas N» (JST-426): botón discreto al final de la franja «Te necesitan» y su panel flotante con las tareas que
// Paperclip marca como bloqueadas sin nadie moviéndolas. No es «te necesita»: sin colores de alerta, sin voz, sin sumar
// a los contadores. El motivo se lee de la tarea solo de lo que se está mostrando (`LectorMotivos`).
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { nombreCorto } from "../avisos.js";
import { claveMotivo, MAX_BLOQUEOS_MOSTRADAS, recortarBloqueos, recortarMotivo, type Bloqueada, type LectorMotivos } from "../bloqueos.js";
import { hrefTarea, tituloVisible } from "../estado.js";
import { t } from "../i18n.js";
import { hace, type AgenteVista } from "../vista.js";
import { Capa, useEsc } from "./capas.js";
import { contexto } from "./contextoBarra.js";
import { soltarDe } from "./contextoLugar.js";
import type { Enlazar } from "./ficha.js";
import { EtiquetaEmpresa, Icono } from "./piso.js";

/** Los motivos de lo que se muestra, a medida que llegan. */
function useMotivos(lector: LectorMotivos | null, ids: readonly string[]): (id: string) => string | null | undefined {
  const [, setN] = useState(0);
  useEffect(() => lector?.alCambiar(() => setN((n) => n + 1)), [lector]);
  const clave = ids.join(" ");
  useEffect(() => {
    if (clave) lector?.pedir(clave.split(" "));
  }, [lector, clave]);
  return (id) => lector?.motivo(id);
}

export function BotonBloqueadas({ bloqueadas, agentes, lector, enlazar, ahora }: {
  /** Ya filtradas por las empresas visibles. */
  bloqueadas: readonly Bloqueada[];
  agentes: readonly AgenteVista[];
  lector: LectorMotivos | null;
  /** El mismo `enlazar` de «Abrir tarea» de la ficha: abre el modal de la tarea. */
  enlazar: Enlazar;
  ahora: number;
}) {
  const [abierto, setAbierto] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CSSProperties | null>(null);
  const n = bloqueadas.length;
  const { vistas, mas } = recortarBloqueos(bloqueadas, MAX_BLOQUEOS_MOSTRADAS);
  const motivo = useMotivos(lector, abierto ? vistas.map(claveMotivo) : []);
  const cerrar = (devolverFoco: boolean) => {
    setAbierto(false);
    if (devolverFoco) boton.current?.focus();
  };
  useEsc(abierto, () => cerrar(true));
  // Si ya no queda ninguna, el botón desaparece y el panel con él.
  useEffect(() => {
    if (n === 0) setAbierto(false);
  }, [n]);
  useLayoutEffect(() => {
    if (!abierto) return;
    const medir = () => {
      const r = boton.current?.getBoundingClientRect();
      if (!r) return;
      const ancho = document.documentElement.clientWidth || window.innerWidth;
      const top = Math.round(r.bottom + 8);
      const nuevo: CSSProperties = { top, right: Math.max(8, Math.round(ancho - r.right)), maxHeight: Math.max(160, Math.min(560, window.innerHeight - top - 110)) };
      setPos((x) => (x && x.top === nuevo.top && x.right === nuevo.right && x.maxHeight === nuevo.maxHeight ? x : nuevo));
    };
    medir();
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, true);
    return () => {
      window.removeEventListener("resize", medir);
      window.removeEventListener("scroll", medir, true);
    };
  }, [abierto]);
  // El foco entra al panel cuando ya está dibujado (la primera vez se dibuja después de medir).
  const dibujado = abierto && pos != null;
  useEffect(() => {
    if (dibujado) panel.current?.focus();
  }, [dibujado]);
  useEffect(() => {
    if (!abierto) return;
    // Tocar afuera cierra (tocar otra vez el botón lo maneja el botón).
    const fuera = (e: PointerEvent) => {
      const x = e.target as Node;
      if (panel.current?.contains(x) || boton.current?.contains(x)) return;
      cerrar(false);
    };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, [abierto]);
  if (n === 0) return null;
  const nombres = new Map(agentes.map((a) => [a.id, a.nombre]));
  return (
    <>
      <button ref={boton} type="button" className={`of-bq-b${abierto ? " is-open" : ""}`} aria-expanded={abierto} aria-haspopup="dialog" aria-label={t("Bloqueadas sin nadie moviéndolas: {n}", { n })} onClick={() => {
        // El informe de «Leer contexto» sale en el mismo lugar: se cierra para que no queden encimados.
        if (!abierto) soltarDe(contexto, "franja");
        setAbierto(!abierto);
      }}>
        <Icono nombre="circle-pause" tam={12} />
        {t("Bloqueadas")}
        <b>{n}</b>
      </button>
      {abierto && pos ? (
        <Capa>
          <div ref={panel} className="of-hpop of-bq" role="dialog" aria-label={t("Bloqueadas sin nadie moviéndolas")} tabIndex={-1} style={{ ...pos, zIndex: 970 }}>
            <h3 className="of-bq-h">{t("Bloqueadas sin nadie moviéndolas")}</h3>
            <p className="of-bq-p">{t("Paperclip las marca porque no avanzan solas y frenan a otras. No siempre te toca a ti.")}</p>
            <ul className="of-bq-l">
              {vistas.map((b) => {
                const agente = b.agenteId ? nombres.get(b.agenteId) : undefined;
                const m = motivo(claveMotivo(b));
                const href = b.identifier ? hrefTarea(b.prefijo, b.identifier) : b.href;
                const props = href ? enlazar(href) : null;
                return (
                  <li key={b.issueId} className="of-bq-it">
                    <div className="of-bq-t">
                      <EtiquetaEmpresa prefijo={b.prefijo} />
                      {b.identifier ? <span className="of-tid">{b.identifier}</span> : null}
                      <span className="of-bq-ti">{b.titulo ? tituloVisible(b.titulo) : t("la tarea")}</span>
                    </div>
                    <div className="of-bq-s">
                      {[
                        b.estado === "todo" ? t("Sin empezar") : b.estado === "backlog" ? t("En pendientes") : b.estado === "in_review" ? t("En revisión") : b.estado === "cancelled" ? t("Cancelada") : null,
                        agente ? t("A cargo: {nombre}", { nombre: nombreCorto(agente) }) : b.dePersona ? t("A cargo: una persona") : t("sin agente"),
                        b.desde != null ? hace(new Date(b.desde).toISOString(), ahora) : null,
                        b.frena === 1 ? t("frena 1 tarea") : b.frena > 1 ? t("frena {n} tareas", { n: b.frena }) : null,
                      ].filter(Boolean).join(" · ")}
                    </div>
                    {m ? <div className="of-bq-m">{recortarMotivo(m)}</div> : null}
                    {props ? (
                      <a
                        className="of-btn is-xs of-bq-a"
                        {...props}
                        aria-label={t("Abrir tarea {codigo}", { codigo: b.identifier ?? b.titulo })}
                        onClick={(e) => {
                          props.onClick?.(e);
                          // Si la tarea se abrió aquí (modal), el panel se cierra; si va al navegador, también.
                          cerrar(false);
                        }}
                      >
                        {t("Abrir tarea")}
                      </a>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {mas > 0 ? <p className="of-bq-mas">{t("y {n} más", { n: mas })}</p> : null}
          </div>
        </Capa>
      ) : null}
    </>
  );
}
