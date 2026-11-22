// «Bloqueadas N» (JST-426): botón discreto al final de la franja «Te necesitan» y su panel flotante con las tareas que
// Paperclip marca como bloqueadas sin nadie moviéndolas. No es «te necesita»: sin colores de alerta, sin voz, sin sumar
// a los contadores. El motivo se lee de la tarea solo de lo que se está mostrando (`LectorMotivos`).
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { nombreCorto } from "../avisos.js";
import { agruparBloqueos, claveMotivo, recortarMotivo, type Bloqueada, type LectorMotivos } from "../bloqueos.js";
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

const ANCHO_PANEL = 400;
const MARGEN = 8;

/**
 * El panel flotante de bloqueadas (JST-426; JST-428: separado del botón para que lo abra también la mesa de cada
 * sala). Se pone bajo el `ancla`, alineado a su derecha si cabe y sin salirse de la ventana por ningún lado (con 8 de
 * margen); si bajo el ancla no queda sitio y arriba sí, va arriba. Se cierra con Escape (y devuelve el foco al ancla),
 * al tocar afuera (tocar el ancla no cuenta: la maneja quien la dibuja) y con «Abrir tarea». Si el ancla se desmonta, se
 * cierra solo. Con `agrupado`, un grupo por empresa con su encabezado (pegado arriba al desplazarse); sin él (el de una
 * sola empresa), la lista a secas.
 */
export function PanelBloqueadas({ bloqueadas, agentes, lector, enlazar, ahora, ancla, titulo, agrupado = true, onCerrar }: {
  /** Ya filtradas por lo que se quiere mostrar. */
  bloqueadas: readonly Bloqueada[];
  agentes: readonly AgenteVista[];
  lector: LectorMotivos | null;
  /** El mismo `enlazar` de «Abrir tarea» de la ficha: abre el modal de la tarea. */
  enlazar: Enlazar;
  ahora: number;
  ancla: HTMLElement;
  titulo?: string;
  agrupado?: boolean;
  onCerrar: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CSSProperties | null>(null);
  const grupos = agruparBloqueos(bloqueadas);
  const motivo = useMotivos(lector, grupos.flatMap((g) => g.vistas.map(claveMotivo)));
  const cerrar = (devolverFoco: boolean) => {
    if (devolverFoco) ancla.focus();
    onCerrar();
  };
  const cerrarRef = useRef(cerrar);
  cerrarRef.current = cerrar;
  useEsc(true, () => cerrar(true));
  useLayoutEffect(() => {
    const medir = () => {
      // El ancla se desmontó (cambió la escala, se acercó una sala): el panel ya no tiene de dónde colgar.
      if (!ancla.isConnected) return cerrarRef.current(false);
      const r = ancla.getBoundingClientRect();
      const vw = document.documentElement.clientWidth || window.innerWidth;
      const vh = window.innerHeight;
      const ancho = Math.min(ANCHO_PANEL, vw - MARGEN * 2);
      const left = Math.max(MARGEN, Math.min(Math.round(r.right - ancho), vw - ancho - MARGEN));
      const abajo = vh - r.bottom - MARGEN * 2;
      const arriba = r.top - MARGEN * 2;
      const nuevo: CSSProperties =
        abajo >= 240 || abajo >= arriba
          ? { left, width: ancho, top: Math.round(r.bottom + MARGEN), maxHeight: Math.max(120, Math.min(560, abajo)) }
          : { left, width: ancho, bottom: Math.round(vh - r.top + MARGEN), maxHeight: Math.max(120, Math.min(560, arriba)) };
      setPos((x) => (x && x.left === nuevo.left && x.width === nuevo.width && x.top === nuevo.top && x.bottom === nuevo.bottom && x.maxHeight === nuevo.maxHeight ? x : nuevo));
    };
    medir();
    const reloj = setInterval(medir, 400);
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, true);
    return () => {
      clearInterval(reloj);
      window.removeEventListener("resize", medir);
      window.removeEventListener("scroll", medir, true);
    };
  }, [ancla]);
  // El foco entra al panel cuando ya está dibujado (la primera vez se dibuja después de medir).
  const dibujado = pos != null;
  useEffect(() => {
    if (dibujado) panel.current?.focus();
  }, [dibujado]);
  useEffect(() => {
    // Tocar afuera cierra (tocar otra vez el ancla lo maneja quien la dibuja).
    const fuera = (e: PointerEvent) => {
      const x = e.target as Node;
      if (panel.current?.contains(x) || ancla.contains(x)) return;
      cerrarRef.current(false);
    };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, [ancla]);
  if (!pos) return null;
  const nombres = new Map(agentes.map((a) => [a.id, a.nombre]));
  const fila = (b: Bloqueada) => {
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
  };
  return (
    <Capa>
      <div ref={panel} className="of-hpop of-bq" role="dialog" aria-label={titulo ?? t("Bloqueadas sin nadie moviéndolas")} tabIndex={-1} style={{ ...pos, zIndex: 970 }}>
        <h3 className="of-bq-h">{titulo ?? t("Bloqueadas sin nadie moviéndolas")}</h3>
        {grupos.length === 0 ? (
          <p className="of-bq-p">{t("Nada bloqueado aquí.")}</p>
        ) : (
          <>
            <p className="of-bq-p">{t("Paperclip las marca porque no avanzan solas y frenan a otras. No siempre te toca a ti.")}</p>
            {grupos.map((g) => (
              <Fragment key={g.prefijo}>
                {agrupado ? (
                  <div className="of-bq-gh" data-grupo={g.prefijo}>
                    <EtiquetaEmpresa prefijo={g.prefijo} />
                    <span className="of-bq-gn">{g.empresa}</span>
                    <b>{g.total}</b>
                  </div>
                ) : null}
                <ul className="of-bq-l">{g.vistas.map(fila)}</ul>
                {g.mas > 0 ? <p className="of-bq-mas">{t("y {n} más", { n: g.mas })}</p> : null}
              </Fragment>
            ))}
          </>
        )}
      </div>
    </Capa>
  );
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
  const n = bloqueadas.length;
  // Si ya no queda ninguna, el botón desaparece y el panel con él.
  useEffect(() => {
    if (n === 0) setAbierto(false);
  }, [n]);
  if (n === 0) return null;
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
      {abierto && boton.current ? <PanelBloqueadas bloqueadas={bloqueadas} agentes={agentes} lector={lector} enlazar={enlazar} ahora={ahora} ancla={boton.current} onCerrar={() => setAbierto(false)} /> : null}
    </>
  );
}
