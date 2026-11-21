// Widget del Dashboard (design-spec de JST-65 §13): los 3 contadores y el piso
// entero a 1x en modo chico, con las empresas que se dibujan (hoy, 4). En computador, el tooltip y la
// ficha; en el celular, tocar una sala abre la página con esa sala acercada.
//
// 0.2.0 (design-spec de JST-95 §9): debajo del piso, «Te esperan» con los 3
// que esperan hace más. En computador abre la ventana para responder sobre el
// Dashboard; en el celular, la página con `?responder=<agente>`.
//
// 0.3.0 (JST-96 §10): caminan y hay sobres y mascotas, pero no conversaciones.
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { copyTextToClipboard, useHostNavigation, usePluginToast, type PluginWidgetProps } from "@paperclipai/plugin-sdk/ui";
import { t } from "../i18n.js";
import { abreVentana } from "../lista.js";
import { ANCHO_WIDGET, anchoWidgetCelular, armarPiso } from "../plano.js";
import { PAGE_ROUTE } from "../shared.js";
import { contarVista } from "../vista.js";
import { useErroresSilenciados } from "./erroresSilenciados.js";
import { Avisos, Capa, Tooltip, useAvisos, useEsc, useTooltip } from "./capas.js";
import { Contadores, ContadoresCelular, ConteoEmpresas, type Resaltado } from "./encabezado.js";
import { asegurarEstilos } from "./estilos.js";
import { anchoFicha, Ficha, FichaFlotante } from "./ficha.js";
import { useEnlazar, usePrefijoActivo, useVentana } from "./pagina.js";
import { TeEsperan } from "./paneles.js";
import { cx, Icono, Piso } from "./piso.js";
import { useAhora, useAnchoVentana, useCelular, useMovimientoReducido, useOficina, usePestanaOculta, useTemaOscuro } from "./useOficina.js";
import { VentanaResponder } from "./ventana.js";
import { useVigia } from "./vigia.js";

/** Ancho mínimo del piso del widget en computador; si la tarjeta es más angosta, el piso se desplaza de lado. */
export const ANCHO_WIDGET_MIN = 480;

export function OficinaGlobalWidget({ context }: PluginWidgetProps) {
  useLayoutEffect(() => asegurarEstilos(), []);
  useVigia(usePluginToast());
  const oficina = useOficina();
  const celular = useCelular();
  const rm = useMovimientoReducido();
  const oculta = usePestanaOculta();
  const oscuro = useTemaOscuro();
  const ahora = useAhora();
  const ventana = useAnchoVentana();
  const navigation = useHostNavigation();
  const prefijo = usePrefijoActivo(context, [...oficina.empresas, ...oficina.ocultas]);
  const enlazar = useEnlazar(prefijo);
  const rutaPagina = prefijo ? `/${encodeURIComponent(prefijo)}/${PAGE_ROUTE}` : `/${PAGE_ROUTE}`;
  const [hl, setHl] = useState<Resaltado>(null);
  const [sel, setSel] = useState<string | null>(null);
  const { tip, handlers, ocultar } = useTooltip(!celular);
  const cuerpo = useRef<HTMLDivElement>(null);
  const [disponible, setDisponible] = useState(ANCHO_WIDGET);
  const vr = useVentana(oficina);
  const { avisos, mostrar } = useAvisos();
  const avisar = useCallback((contenido: ReactNode) => mostrar(contenido), [mostrar]);

  useLayoutEffect(() => {
    const el = cuerpo.current;
    if (!el) return;
    const medir = () => setDisponible(el.clientWidth - 32);
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    medir();
    return () => obs.disconnect();
  }, []);

  const ancho = celular ? anchoWidgetCelular(ventana) : Math.max(ANCHO_WIDGET_MIN, Math.min(ANCHO_WIDGET, disponible));
  const clave = oficina.empresas.map((e) => `${e.prefijo}:${e.agentes}`).join(",");
  const plano = useMemo(
    () => armarPiso(oficina.empresas.map((e) => ({ prefijo: e.prefijo, agentes: e.agentes })), ancho, celular ? "widget-celular" : "widget"),
    // `clave` resume las empresas y sus agentes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clave, ancho, celular],
  );
  // JST-410: un error de hace más de un día, o silenciado, no cuenta en «con error».
  const silenciados = useErroresSilenciados();
  const c = contarVista(oficina.agentes, ahora, silenciados);
  const pCont = {
    c,
    hl,
    onHl: (st: NonNullable<Resaltado>) => setHl((h) => (h === st ? null : st)),
    cargando: oficina.cargando && oficina.agentes.length === 0,
    sinAtencion: oficina.sinAtencion,
  };
  const agente = sel ? oficina.agentes.find((a) => a.id === sel) : undefined;
  const cerrar = useCallback(() => setSel(null), []);
  useEsc(!!agente && !celular, cerrar);
  // Computador: la ventana sobre el Dashboard. Celular: la página con esa ventana abierta.
  const responder = (id: string, desde?: HTMLElement | null) => {
    setSel(null);
    if (celular) navigation.navigate(`${rutaPagina}?responder=${encodeURIComponent(id)}`);
    else vr.abrir(id, 0, desde ?? null);
  };
  const abrir = navigation.linkProps(rutaPagina);
  const caidas = oficina.caidas.map((e) => e.nombre);

  return (
    <div className={cx("of of-wdg", rm && "of-rm", oculta && "of-oculta")} {...(hl ? { "data-hl": hl } : {})} data-oficina-widget="">
      <div className="of-wh">
        <span className="of-wt">
          <Icono nombre="building-2" tam={14} />
          Oficina global
        </span>
        <ConteoEmpresas oficina={oficina} conAgentes={false} className="of-wsub" />
        <span className="of-sp" />
        <a className="of-wlink" {...abrir}>
          {t("Abrir")}
          <Icono nombre="arrow-right" tam={14} />
        </a>
      </div>
      <div className="of-wb" ref={cuerpo} {...handlers}>
        {celular ? <ContadoresCelular {...pCont} /> : <Contadores modo="widget" {...pCont} />}
        {caidas.length > 0 ? (
          <div className="of-wmsg">
            <Icono nombre="triangle-alert" tam={12} />
            {t("No pude leer {nombres}", { nombres: caidas.join(", ") })}
          </div>
        ) : null}
        <Piso
          plano={plano}
          empresas={oficina.empresas}
          agentes={oficina.agentes}
          filtro={[]}
          o={{
            chico: true,
            rm,
            oscuro,
            seleccionado: sel,
            onSeleccionar: celular
              ? null
              : (id) => {
                  ocultar();
                  // Quien solo te espera abre la ventana, como en la página (JST-95 §3).
                  const a = oficina.agentes.find((x) => x.id === id);
                  if (a && abreVentana(a)) responder(id, cuerpo.current?.querySelector<HTMLElement>(`[data-agente="${id}"]`));
                  else setSel((s) => (s === id ? null : id));
                },
          }}
          onAcercar={celular ? (sala) => navigation.navigate(`${rutaPagina}?sala=${encodeURIComponent(sala)}`) : undefined}
          // Tu escritorio (0.5.0, JST-163 §14): en el widget, un clic abre la página, como el resto.
          onEscritorio={celular ? null : () => navigation.navigate(rutaPagina)}
          onReintentar={oficina.reintentar}
          sync={oficina.sync}
          charlas={false}
          mascotasTocables={!celular}
        />
        <TeEsperan
          agentes={oficina.agentes}
          cargando={oficina.cargando}
          celular={celular}
          hrefMas={`${rutaPagina}?hl=toca`}
          enlaceMas={navigation.linkProps(`${rutaPagina}?hl=toca`)}
          onResponder={(id) => responder(id)}
        />
      </div>
      {agente && !celular ? (
        <Capa>
          <FichaFlotante ancla={cuerpo.current?.querySelector<HTMLElement>(`[data-agente="${agente.id}"]`) ?? null} onCerrar={cerrar} ancho={anchoFicha(agente)}>
            <Ficha
              agente={agente}
              agentes={oficina.agentes}
              sync={oficina.sync}
              ahora={ahora}
              rm={rm}
              enlazar={enlazar}
              onCerrar={cerrar}
              onSeleccionar={setSel}
              onResponder={(i) => {
                setSel(null);
                vr.abrir(agente.id, i, cuerpo.current?.querySelector<HTMLElement>(`[data-agente="${agente.id}"]`) ?? null);
              }}
              copiar={copyTextToClipboard}
              avisar={avisar}
            />
          </FichaFlotante>
        </Capa>
      ) : null}
      {vr.agente && !celular ? (
        <Capa>
          <VentanaResponder
            key={vr.resp!.id}
            agente={vr.agente}
            inicial={vr.resp!.indice}
            sync={oficina.sync}
            agentes={oficina.agentes}
            celular={false}
            rm={rm}
            enlazar={enlazar}
            ahora={ahora}
            onCerrar={vr.cerrar}
            avisar={avisar}
          />
        </Capa>
      ) : null}
      <Avisos avisos={avisos} />
      {tip && !agente ? <Tooltip tip={tip} /> : null}
    </div>
  );
}
