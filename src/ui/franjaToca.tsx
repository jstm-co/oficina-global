// Franja «Te necesitan» (JST-410): la tercera fila de la cabecera de computador. Siempre está y mide lo mismo (36 px),
// con esperas o sin ellas, para que el alto de la cabecera no cambie cuando alguien empieza o deja de necesitarte
// (la página mide dónde termina para decidir a qué escala cabe el piso). Cada agente que te necesita es un ítem de una
// línea con su botón «Responder»; si no caben, la franja se desplaza en horizontal.
// JST-414: cada tarjeta lleva además «Leer contexto» (solo el ícono); el informe escrito de lo que se lee desde aquí
// se muestra en un panel que flota bajo la franja, a la derecha de la página: la franja queda a la vista y el
// reproductor del Resumen (abajo, al centro) no se tapa.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { nombreCorto } from "../avisos.js";
import { tituloVisible } from "../estado.js";
import { t } from "../i18n.js";
import { comparar } from "../lista.js";
import { chipDe } from "../responder.js";
import type { AgenteVista } from "../vista.js";
import { Capa } from "./capas.js";
import { contexto, useContexto } from "./contextoBarra.js";
import { PanelContexto } from "./contextoEscrito.js";
import { soltarDe, visibleEn } from "./contextoLugar.js";
import { BotonContextoVentana, tareaDeEspera } from "./contextoVentana.js";
import { CajaPersonaje, EtiquetaEmpresa, Icono } from "./piso.js";

/** El panel del informe escrito: 8 px bajo la franja, al borde derecho de la página, sin pasar de lo que cabe sobre el reproductor. */
function PanelDeLaFranja({ franja }: { franja: RefObject<HTMLElement | null> }) {
  const c = useContexto();
  const visible = visibleEn(c, "franja", c.tarea);
  const [pos, setPos] = useState<CSSProperties | null>(null);
  // Por debajo de la ventana de responder (1100), el modal (1090), el modo TV (980) y la vista 3D (975): el estilo en línea gana a la clase (1150).
  const estilo: CSSProperties | null = pos ? { ...pos, zIndex: 970 } : null;
  useLayoutEffect(() => {
    if (!visible) return;
    const medir = () => {
      const r = franja.current?.getBoundingClientRect();
      if (!r) return;
      const ancho = document.documentElement.clientWidth || window.innerWidth;
      const top = Math.round(r.bottom + 8);
      const n: CSSProperties = { top, right: Math.max(8, Math.round(ancho - r.right)), maxHeight: Math.max(160, Math.min(540, window.innerHeight - top - 110)) };
      setPos((x) => (x && x.top === n.top && x.right === n.right && x.maxHeight === n.maxHeight ? x : n));
    };
    medir();
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, true);
    const ro = typeof ResizeObserver === "undefined" || !franja.current ? null : new ResizeObserver(medir);
    if (ro && franja.current) ro.observe(franja.current);
    return () => {
      window.removeEventListener("resize", medir);
      window.removeEventListener("scroll", medir, true);
      ro?.disconnect();
    };
  }, [visible, franja]);
  if (!visible || !estilo || !c.tarea) return null;
  return (
    <Capa>
      <PanelContexto c={c} tarea={c.tarea} lugar="franja" celular={false} estilo={estilo} />
    </Capa>
  );
}

/** Los que te necesitan, el que espera hace más primero (el mismo orden de «Te esperan» y de la lista). */
export function esperanOrdenados(agentes: readonly AgenteVista[]): AgenteVista[] {
  return agentes.filter((a) => a.need).sort(comparar);
}

export function FranjaTeNecesitan({ agentes, cargando, sinAtencion, onResponder }: {
  /** Los mismos que cuentan los contadores (ya con el filtro por empresa). */
  agentes: readonly AgenteVista[];
  /** Primera lectura, sin agentes todavía: la franja queda vacía, del mismo alto. */
  cargando: boolean;
  /** «Te toca» no respondió: no se sabe quién te necesita. */
  sinAtencion: boolean;
  /** Abre la ventana de responder; `desde` es el ítem, de donde sale la ventana. */
  onResponder: (agenteId: string, desde: HTMLElement | null) => void;
}) {
  const esperan = esperanOrdenados(agentes);
  // La franja no muestra barra: con la rueda del mouse (sin trackpad) se desplaza a lo ancho cuando no caben todos.
  const lista = useRef<HTMLDivElement | null>(null);
  const raiz = useRef<HTMLDivElement | null>(null);
  // Salir de la página (o que la franja desaparezca) cierra el informe que se leía desde aquí.
  useEffect(
    () => () => {
      soltarDe(contexto, "franja");
    },
    [],
  );
  const hay = esperan.length > 0;
  useEffect(() => {
    const el = lista.current;
    if (!el) return;
    const rueda = (ev: WheelEvent) => {
      if (ev.ctrlKey || Math.abs(ev.deltaX) >= Math.abs(ev.deltaY) || el.scrollWidth <= el.clientWidth) return;
      const antes = el.scrollLeft;
      el.scrollLeft += ev.deltaY;
      if (el.scrollLeft !== antes) ev.preventDefault();
    };
    el.addEventListener("wheel", rueda, { passive: false });
    return () => el.removeEventListener("wheel", rueda);
  }, [hay]);
  let contenido;
  if (esperan.length > 0) {
    const abrir = (id: string, el: HTMLElement) => onResponder(id, el.closest<HTMLElement>(".of-te-it") ?? el);
    contenido = (
      <>
        <span className="of-te-h">
          <Icono nombre="hand" tam={14} />
          {t("Te necesitan")}
          <b>{esperan.length}</b>
        </span>
        <div className="of-te-l" ref={lista}>
          {esperan.map((a) => {
            const e = a.teNecesita[0];
            const mas = a.teNecesita.length - 1;
            const tarea = tareaDeEspera(e);
            return (
              <div key={a.id} className="of-te-it">
                <button type="button" className="of-te-m" aria-label={t("{nombre}, {empresa}: te necesita. Responder", { nombre: a.nombre, empresa: a.empresa })} onClick={(ev) => abrir(a.id, ev.currentTarget)}>
                  <CajaPersonaje agente={a} px={1} />
                  <b className="of-te-n">{nombreCorto(a.nombre)}</b>
                  <EtiquetaEmpresa prefijo={a.prefijo} />
                  <span className="of-te-t">
                    {e?.identifier ? <span className="of-tid">{e.identifier}</span> : null}
                    {e ? (e.titulo ? tituloVisible(e.titulo) : t(chipDe(e).label)) : null}
                  </span>
                  {mas > 0 ? <span className="of-te-mas">+{mas}</span> : null}
                </button>
                {tarea ? <BotonContextoVentana tarea={tarea} codigo={e?.identifier ?? t("la tarea")} celular={false} lugar="franja" chico /> : null}
                <button type="button" className="of-btn is-xs is-primary is-toca" aria-label={t("Responder a {nombre}", { nombre: nombreCorto(a.nombre) })} onClick={(ev) => abrir(a.id, ev.currentTarget)}>
                  {t("Responder")}
                </button>
              </div>
            );
          })}
        </div>
      </>
    );
  } else if (cargando) {
    contenido = null;
  } else if (sinAtencion) {
    contenido = (
      <span className="of-te-ok">
        <Icono nombre="triangle-alert" tam={14} />
        {t("Por ahora no sé quién te necesita")}
      </span>
    );
  } else {
    contenido = (
      <span className="of-te-ok">
        <Icono nombre="circle-check" tam={14} />
        {t("Nadie te necesita ahora")}
      </span>
    );
  }
  return (
    <div ref={raiz} className="of-te" role="region" aria-label={t("Te necesitan")}>
      {contenido}
      <PanelDeLaFranja franja={raiz} />
    </div>
  );
}
