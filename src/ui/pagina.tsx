// Página «Oficina global» (design-spec de JST-65 §9 a §12): encabezado con
// estado en vivo, contadores y filtro; el piso con las salas de todas las
// empresas; la leyenda; la ficha; y el modo TV. En el celular, el piso entero
// a 1x y, al tocar una sala, esa sala acercada a 2x.
//
// 0.2.0 (design-spec de JST-95): bajo el piso, la lista de agentes (§3); la
// ventana para responder (§5), que abren el personaje o la fila de quien solo
// te espera, el botón «Responder» y `?responder=<agente>`; los botones
// «Avisos» y «Voces» del encabezado (§6) y el subtítulo de la voz (§8).
//
// 0.3.0 (design-spec de JST-96): el piso tiene vida (caminan, sobres,
// conversaciones y mascotas, ver `piso.tsx`) y el encabezado suma «Mascotas».
//
// 0.5.0 (design-spec de JST-163 §14): un clic en tu escritorio de una sala abre
// la ventanita con quiénes te esperan ahí, con el botón para responder.
//
// 0.9.0 (design-spec de JST-245, A · Menú y reproductor): «Resumen», el primero
// del encabezado (en el celular, en la barra de arriba), y mientras lee, la
// sala de la que habla encendida. El reproductor lo dibuja la barra de arriba.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { copyTextToClipboard, useHostLocation, useHostNavigation, usePluginToast, type PluginPageProps } from "@paperclipai/plugin-sdk/ui";
import { nombreCorto } from "../avisos.js";
import { idInstalacion } from "../fuentes.js";
import { abreVentana } from "../lista.js";
import { anchoCelular, anchoComputador, armarPiso, armarPisoComputador, armarSalaAcercada } from "../plano.js";
import type { Vida } from "../vida.js";
import { PLUGIN_KEY } from "../shared.js";
import { contarVista, type AgenteVista } from "../vista.js";
import { Avisos, Capa, Tooltip, useAvisos, useEsc, useTooltip } from "./capas.js";
import { Banners, BotonMascotas, ChipAnimacionReducida, Contadores, ContadoresCelular, ConteoEmpresas, EstadoVivo, FiltroEmpresas, Leyenda, Menores, type Resaltado } from "./encabezado.js";
import { BotonConversaciones } from "./menuConversaciones.js";
import { BotonResumen } from "./menuResumen.js";
import { abrirMenu } from "./paneles.js";
import { ReproductorResumen } from "./reproductorResumen.js";
import { resumen, useResumenAbierto } from "./resumen.js";
import { asegurarEstilos } from "./estilos.js";
import { anchoFicha, Ficha, FichaFlotante, FichaHoja, type Enlazar } from "./ficha.js";
import { filaDelPlano, VentanitaEscritorio } from "./escritorio.js";
import { ListaAgentes } from "./listaAgentes.js";
import { BotonesAvisos, SubtituloVoz } from "./paneles.js";
import { cx, EtiquetaEmpresa, Icono, Piso } from "./piso.js";
import { todosLibres, useAhora, useAnchoVentana, useCelular, useMovimientoReducido, useOficina, usePestanaOculta, useSalasPrevias, useTemaOscuro, type Oficina } from "./useOficina.js";
import { VentanaResponder } from "./ventana.js";
import { useVigia } from "./vigia.js";
import { VistaTv } from "./vistaTv.js";
import { Vista3D } from "./vista3d.js";

/** Evento con el que el botón de la barra de arriba (celular) abre el modo TV de la página. */
export const EVENTO_TV = "jstm-oficina-pixel:tv";

/**
 * Enlaces a páginas del host, siempre con la ruta completa (`/PRE/issues/…`).
 * Si es de la empresa activa, se navega sin recargar; si es de otra, se
 * recarga, como en Board global (la navegación del host antepone la empresa
 * activa a una ruta de otra: `/JST/BET/issues/…`).
 */
export function useEnlazar(prefijoActivo: string | null): Enlazar {
  const navigation = useHostNavigation();
  return useCallback(
    (href: string) => {
      const m = /^\/([^/]+)\//.exec(href);
      if (m && prefijoActivo && decodeURIComponent(m[1]!).toUpperCase() === prefijoActivo.toUpperCase()) {
        const { href: h, onClick } = navigation.linkProps(href);
        return { href: h, onClick };
      }
      return { href };
    },
    [navigation, prefijoActivo],
  );
}

/**
 * Prefijo de la empresa activa. El widget del Dashboard recibe el contexto sin
 * `companyPrefix` (2026.824.1), así que se busca por `companyId` o en la URL.
 */
export function usePrefijoActivo(context: { companyId: string | null; companyPrefix: string | null }, empresas: readonly { id: string; prefijo: string }[]): string | null {
  const location = useHostLocation();
  if (context.companyPrefix) return context.companyPrefix.toUpperCase();
  const porId = empresas.find((e) => e.id === context.companyId)?.prefijo;
  if (porId) return porId;
  const primero = location.pathname.split("/").filter(Boolean)[0];
  return primero ? decodeURIComponent(primero).toUpperCase() : null;
}

/** La ventana para responder abierta: de qué agente y en qué espera. */
export interface Respuesta {
  id: string;
  indice: number;
}

/**
 * Abrir la ventana y la ficha, y devolver el foco a quien la abrió al cerrar
 * (design-spec de JST-95 §5). Lo usan la página, el widget y el TV.
 */
export function useVentana(oficina: Oficina) {
  const [resp, setResp] = useState<Respuesta | null>(null);
  const origen = useRef<HTMLElement | null>(null);
  const abrir = useCallback((id: string, indice = 0, desde?: HTMLElement | null) => {
    origen.current = desde ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setResp({ id, indice });
  }, []);
  const cerrar = useCallback(() => {
    setResp((actual) => {
      const el = origen.current;
      requestAnimationFrame(() => {
        // Si quien la abrió ya no está (la ficha se cerró), el foco va al personaje.
        if (el && el.isConnected) el.focus();
        else if (actual) document.querySelector<HTMLElement>(`[data-agente="${actual.id}"]`)?.focus();
      });
      return null;
    });
  }, []);
  // Si el agente deja de estar en la oficina (su empresa no responde), la ventana sigue con lo último que se supo:
  // se cierra solo con `cerrar`, para no perder «Listo» ni «Ya está respondida».
  const ultimo = useRef<AgenteVista | null>(null);
  const vivo = resp ? oficina.agentes.find((a) => a.id === resp.id) : undefined;
  if (vivo) ultimo.current = vivo;
  const agente = resp ? (vivo ?? (ultimo.current?.id === resp.id ? ultimo.current : undefined)) : undefined;
  return { resp, agente, abrir, cerrar };
}

/** Ruta de `tv.html`: el host la sirve con el UUID de la instalación (con la clave da 500 en 2026.824.1). */
export function useUrlTv(): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    void idInstalacion({ base: "" }, PLUGIN_KEY)
      .then((id) => {
        if (vivo && id) setUrl(`/_plugins/${encodeURIComponent(id)}/ui/tv.html`);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);
  return url;
}

/**
 * La página ocupa el ancho del contenedor del host sin su padding (el diseño
 * trae el suyo: 16/24/12 arriba, 24 a los lados). Devuelve el ancho resultante.
 *
 * En tema oscuro el host dibuja una barra de scroll fija de 8 px (en claro es
 * superpuesta), que dejaría la página en 1192 px a 1440 y escondería los
 * nombres del filtro (JST-73). La barra se descuenta del margen derecho
 * (`--of-sb`, hasta 16 px) y el ancho cuenta como si no estuviera, así que a
 * 1440 se ve igual en los dos temas.
 *
 * También devuelve el alto que se ve bajo la cabecera (`.of-hd`) con el scroll
 * arriba (JST-86): con él se decide si el piso va a 3x. No depende de la
 * escala, del scroll ni de los banners (van después de la cabecera), así que
 * la escala no salta cuando cambian.
 */
function useContenedor() {
  const ref = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(0);
  const [altoLibre, setAltoLibre] = useState(0);
  const [margen, setMargen] = useState<CSSProperties>({});
  const [barra, setBarra] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let padre: HTMLElement | null = el.parentElement;
    while (padre && !/(auto|scroll)/.test(getComputedStyle(padre).overflowY)) padre = padre.parentElement;
    let pegada = false;
    if (padre) {
      const s = getComputedStyle(padre);
      const pl = parseFloat(s.paddingLeft) || 0;
      const pr = parseFloat(s.paddingRight) || 0;
      const pt = parseFloat(s.paddingTop) || 0;
      const dx = el.getBoundingClientRect().left - padre.getBoundingClientRect().left - padre.clientLeft;
      // Solo si la página empieza justo en el borde interior del contenedor (no hay otro envoltorio con su propio margen).
      pegada = Math.abs(dx - pl) < 2;
      if (pegada) setMargen({ marginLeft: -pl, marginRight: -pr, marginTop: -pt });
    }
    const medir = () => {
      let sb = 0;
      if (padre && pegada) {
        const s = getComputedStyle(padre);
        const bordes = (parseFloat(s.borderLeftWidth) || 0) + (parseFloat(s.borderRightWidth) || 0);
        sb = Math.max(0, Math.min(padre.offsetWidth - padre.clientWidth - bordes, 16));
      }
      setBarra(sb);
      setAncho(el.clientWidth + sb);
      const hd = el.querySelector<HTMLElement>(":scope > .of-hd");
      if (hd) {
        const fin = hd.getBoundingClientRect().bottom;
        setAltoLibre(padre ? padre.clientHeight - (fin - padre.getBoundingClientRect().top - padre.clientTop + padre.scrollTop) : window.innerHeight - (fin + window.scrollY));
      }
    };
    // La barra aparece o desaparece con el alto del contenido: cambia el ancho de la página y se vuelve a medir.
    // El contenedor cambia de alto con la ventana, y la página con la cabecera.
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    if (padre) obs.observe(padre);
    window.addEventListener("resize", medir);
    medir();
    return () => {
      obs.disconnect();
      window.removeEventListener("resize", medir);
    };
  }, []);
  return { ref, ancho, altoLibre, estilo: { ...margen, "--of-sb": `${barra}px` } as CSSProperties };
}

export function OficinaGlobalPage({ context }: PluginPageProps) {
  useLayoutEffect(() => asegurarEstilos(), []);
  useVigia(usePluginToast());
  const oficina = useOficina();
  const celular = useCelular();
  const rm = useMovimientoReducido();
  const oculta = usePestanaOculta();
  const oscuro = useTemaOscuro();
  const ahora = useAhora();
  const ventana = useAnchoVentana();
  const location = useHostLocation();
  // Con todas las empresas: la activa puede ser una sin agentes, que no se dibuja.
  const enlazar = useEnlazar(usePrefijoActivo(context, [...oficina.empresas, ...oficina.ocultas]));
  const urlTv = useUrlTv();
  const { ref, ancho, altoLibre, estilo } = useContenedor();
  const previas = useSalasPrevias();
  // 0.9.0: el Resumen usa lo que la Oficina ya tiene (no pide nada por su cuenta hasta abrir su menú).
  useEffect(() => resumen.fijarOficina(oficina), [oficina]);
  useEffect(
    () => () => {
      // Al salir de la página, su menú se cierra (el reproductor sigue: lo dibuja la barra de arriba).
      if (resumen.oficina) abrirMenu(null);
    },
    [],
  );
  const conResumen = useResumenAbierto();

  const [filtro, setFiltro] = useState<string[]>([]);
  const [hl, setHl] = useState<Resaltado>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [sala, setSala] = useState<string | null>(() => new URLSearchParams(location.search).get("sala")?.toUpperCase() ?? null);
  const [tv, setTv] = useState(false);
  // La vista 3D (en el computador): la misma oficina en primera persona, con la vida del piso de la página.
  const [en3d, setEn3d] = useState(false);
  const [vidaPiso, setVidaPiso] = useState<Vida | null>(null);
  /** La ficha abierta desde una fila de la lista se ancla a la fila (el personaje puede estar fuera de la vista). */
  const [anclaFila, setAnclaFila] = useState<HTMLElement | null>(null);
  const { tip, handlers, ocultar } = useTooltip(!celular);
  const vr = useVentana(oficina);
  const { avisos, mostrar } = useAvisos();
  /** Tu escritorio abierto (JST-163 §14): de qué sala, y el botón desde donde se abrió. */
  const [escritorio, setEscritorio] = useState<{ prefijo: string; el: HTMLElement } | null>(null);

  // `?sala=BET` (lo usa el widget en el celular) acerca esa sala.
  useEffect(() => {
    const pedida = new URLSearchParams(location.search).get("sala");
    if (pedida) setSala(pedida.toUpperCase());
  }, [location.search]);

  // `?hl=toca` y `?responder=` se quitan de la dirección al usarlos: así el mismo aviso se puede volver a tocar.
  const navegacion = useHostNavigation();
  const quitarDeLaDireccion = useCallback(
    (claves: string[]) => {
      const q = new URLSearchParams(location.search);
      for (const k of claves) q.delete(k);
      const resto = q.toString();
      navegacion.navigate(`${location.pathname}${resto ? `?${resto}` : ""}`, { replace: true });
    },
    [location.pathname, location.search, navegacion],
  );

  // `?hl=toca` (el aviso agrupado, «y 3 más →» del widget) resalta a los que te necesitan.
  useEffect(() => {
    if (new URLSearchParams(location.search).get("hl") !== "toca") return;
    setHl("toca");
    quitarDeLaDireccion(["hl"]);
  }, [location.search, quitarDeLaDireccion]);

  // `?responder=<agente>` (el aviso, el widget en el celular) abre su ventana en la primera espera, cuando ya se leyó la oficina.
  const procesado = useRef<string | null>(null);
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("responder");
    if (!id) {
      procesado.current = null;
      return;
    }
    if (procesado.current === location.search) return;
    const a = oficina.agentes.find((x) => x.id === id);
    if (!a && (oficina.cargando || oficina.iniciando)) return;
    procesado.current = location.search;
    quitarDeLaDireccion(["responder"]);
    if (a?.need) {
      setSel(null);
      vr.abrir(a.id, 0, null);
    } else {
      mostrar(
        <>
          <Icono nombre="info" tam={14} />
          <span>{a ? `${nombreCorto(a.nombre)} ya no te espera.` : "Ese agente ya no te espera."}</span>
        </>,
      );
    }
  }, [location.search, oficina, vr, mostrar, quitarDeLaDireccion]);

  // El botón «Modo TV» de la barra de arriba del host (celular). En el TV no hay Resumen: se cierra.
  useEffect(() => {
    const abrir = () => {
      setSel(null);
      resumen.cerrar();
      setTv(true);
    };
    window.addEventListener(EVENTO_TV, abrir);
    return () => window.removeEventListener(EVENTO_TV, abrir);
  }, []);

  // Esc cierra la ficha y devuelve el foco al personaje (o a la fila de la lista que la abrió).
  const cerrarFicha = useCallback(() => {
    setSel((actual) => {
      const fila = anclaFila;
      if (actual) requestAnimationFrame(() => (fila?.isConnected ? fila : ref.current?.querySelector<HTMLElement>(`[data-agente="${actual}"]`))?.focus());
      return null;
    });
    setAnclaFila(null);
  }, [ref, anclaFila]);
  useEsc(!!sel && !tv, cerrarFicha);
  const cerrarEscritorio = useCallback(() => {
    setEscritorio((actual) => {
      if (actual) requestAnimationFrame(() => actual.el.isConnected && actual.el.focus());
      return null;
    });
  }, []);
  useEsc(!!escritorio && !tv, cerrarEscritorio);

  const empresasSala = oficina.empresas.map((e) => ({ prefijo: e.prefijo, agentes: e.agentes }));
  const anchoPiso = celular ? anchoCelular(ventana) : anchoComputador(ancho || 1200);
  const salaAcercada = celular && sala ? oficina.empresas.find((e) => e.prefijo === sala) : undefined;
  const clave = empresasSala.map((e) => `${e.prefijo}:${e.agentes}`).join(",");
  const plano = useMemo(
    () =>
      salaAcercada
        ? armarSalaAcercada({ prefijo: salaAcercada.prefijo, agentes: salaAcercada.agentes }, anchoPiso)
        : celular
          ? armarPiso(empresasSala, anchoPiso, "celular")
          : armarPisoComputador(empresasSala, ancho || 1200, altoLibre, previas),
    // `clave` resume las empresas y sus agentes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clave, anchoPiso, celular, salaAcercada?.prefijo, salaAcercada?.agentes, ancho, altoLibre, previas],
  );

  // Contadores: solo las empresas del filtro (o la sala acercada).
  const visibles = oficina.agentes.filter((a) => (salaAcercada ? a.prefijo === salaAcercada.prefijo : filtro.length === 0 || filtro.includes(a.prefijo)));
  const c = contarVista(visibles);
  const cargandoCont = oficina.cargando && oficina.agentes.length === 0;
  const pCont = { c, hl, onHl: (st: NonNullable<Resaltado>) => setHl((h) => (h === st ? null : st)), cargando: cargandoCont, sinAtencion: oficina.sinAtencion };
  const libres = todosLibres(oficina);
  const agente = sel ? oficina.agentes.find((a) => a.id === sel) : undefined;
  // Tocar al personaje (o su fila): quien solo te espera abre la ventana; los demás, su ficha (JST-95 §3).
  const seleccionar = useCallback(
    (id: string) => {
      ocultar();
      setAnclaFila(null);
      const a = oficina.agentes.find((x) => x.id === id);
      if (a && abreVentana(a)) {
        setSel(null);
        vr.abrir(id, 0, ref.current?.querySelector<HTMLElement>(`[data-agente="${id}"]`) ?? null);
        return;
      }
      setSel((s) => (s === id ? null : id));
    },
    [ocultar, oficina.agentes, vr, ref],
  );
  const abrirDesdeFila = useCallback(
    (id: string, fila: HTMLElement) => {
      const a = oficina.agentes.find((x) => x.id === id);
      if (a && abreVentana(a)) {
        setSel(null);
        vr.abrir(id, 0, fila);
        return;
      }
      setAnclaFila(fila);
      setSel(id);
    },
    [oficina.agentes, vr],
  );
  const responderDesde = useCallback(
    (id: string, desde: HTMLElement | null, indice = 0) => {
      setSel(null);
      vr.abrir(id, indice, desde);
    },
    [vr],
  );
  const abrirTv = () => {
    setSel(null);
    setEscritorio(null);
    resumen.cerrar();
    setTv(true);
  };
  const abrir3d = () => {
    setSel(null);
    setEscritorio(null);
    setEn3d(true);
  };
  // Al salir, se cierra también lo que se abrió desde ella (la ficha y tu fila iban pegadas a su ancla).
  const cerrar3d = useCallback(() => {
    setEn3d(false);
    setSel(null);
    setAnclaFila(null);
    setEscritorio(null);
  }, []);
  // Clic en tu escritorio: su ventanita (otra vez, la cierra); cierra la ficha.
  const tocarEscritorio = useCallback(
    (prefijo: string, el: HTMLElement) => {
      ocultar();
      setSel(null);
      setEscritorio((actual) => (actual?.prefijo === prefijo ? null : { prefijo, el }));
    },
    [ocultar],
  );
  const avisar = useCallback((contenido: ReactNode) => mostrar(contenido), [mostrar]);

  const ficha = agente ? (
    <Ficha
      agente={agente}
      agentes={oficina.agentes}
      sync={oficina.sync}
      ahora={ahora}
      rm={rm}
      enlazar={enlazar}
      onCerrar={cerrarFicha}
      onSeleccionar={setSel}
      onResponder={(i) => responderDesde(agente.id, anclaFila, i)}
      copiar={copyTextToClipboard}
      avisar={avisar}
    />
  ) : null;

  const filtradas = oficina.empresas.filter((e) => filtro.includes(e.prefijo));
  const listaDe = (soloSala: string | null) => (
    <ListaAgentes
      oficina={oficina}
      agentes={oficina.agentes.filter((a) => (soloSala ? a.prefijo === soloSala : filtro.length === 0 || filtro.includes(a.prefijo)))}
      total={soloSala ? oficina.agentes.filter((a) => a.prefijo === soloSala).length : oficina.agentes.length}
      filtro={soloSala ? [] : filtradas}
      onQuitarFiltro={() => setFiltro([])}
      hl={hl}
      celular={celular}
      rm={rm}
      ahora={ahora}
      seleccionado={sel ?? vr.resp?.id ?? null}
      onAbrir={abrirDesdeFila}
      onResponder={(id, fila) => responderDesde(id, fila)}
      ultima={(id) => {
        const t = oficina.sync?.ultimaConocida(id);
        return t?.identifier ? { identifier: t.identifier, titulo: t.title } : null;
      }}
      codigoError={(id) => oficina.sync?.codigoErrorConocido(id) ?? null}
    />
  );

  const raiz = cx("of", celular && "is-m", rm && "of-rm", oculta && "of-oculta", conResumen && !tv && "of-rs-on");
  const hlAttr = hl ? { "data-hl": hl } : {};

  let cuerpo;
  if (celular && salaAcercada) {
    const lista = oficina.empresas.map((e) => e.prefijo);
    const i = lista.indexOf(salaAcercada.prefijo);
    const ir = (d: number) => setSala(lista[(i + d + lista.length) % lista.length]!);
    cuerpo = (
      <>
        <div className="of-zh">
          <button type="button" className="of-btn is-sm is-ghost" onClick={() => { setSel(null); setSala(null); }}>
            <Icono nombre="chevron-left" tam={14} />
            Todo el piso
          </button>
          <span className="of-sp" />
          <button type="button" className="of-ibtn" aria-label="Sala anterior" onClick={() => ir(-1)}>
            <Icono nombre="chevron-left" tam={14} />
          </button>
          <span className="of-zname">
            <EtiquetaEmpresa prefijo={salaAcercada.prefijo} />
            {salaAcercada.nombre}
          </span>
          <button type="button" className="of-ibtn" aria-label="Sala siguiente" onClick={() => ir(1)}>
            <Icono nombre="chevron-right" tam={14} />
          </button>
        </div>
        <ContadoresCelular {...pCont} />
        <div className="of-scroll">
          <Piso plano={plano} empresas={oficina.empresas} agentes={oficina.agentes} filtro={[]} o={{ chico: false, rm, oscuro, seleccionado: sel, onSeleccionar: seleccionar }} onReintentar={oficina.reintentar} sync={oficina.sync} pausado={tv} voz />
          <p className="of-hint">Toca a alguien para ver su ficha.</p>
          <Leyenda celular />
          {listaDe(salaAcercada.prefijo)}
        </div>
      </>
    );
  } else if (celular) {
    cuerpo = (
      <>
        <div className="of-hd is-m">
          <div className="of-hdr">
            <EstadoVivo oficina={oficina} corto />
            <span className="of-sp" />
            {rm ? <ChipAnimacionReducida soloIcono /> : null}
            <BotonMascotas celular />
            <BotonConversaciones celular />
            <Menores {...pCont} xs />
            <BotonesAvisos celular agentes={oficina.agentes} rm={rm} />
          </div>
          <ContadoresCelular {...pCont} />
          <FiltroEmpresas oficina={oficina} filtro={filtro} onFiltro={setFiltro} celular />
        </div>
        <div className="of-msgs">
          <Banners oficina={oficina} corto c={c} libres={libres} />
        </div>
        <div className="of-scroll">
          <Piso
            plano={plano}
            empresas={oficina.empresas}
            agentes={oficina.agentes}
            filtro={filtro}
            o={{ chico: true, rm, oscuro, seleccionado: null, onSeleccionar: null }}
            onAcercar={(p) => setSala(p)}
            onReintentar={oficina.reintentar}
            sync={oficina.sync}
            pausado={tv}
            voz
          />
          <p className="of-hint">
            <Icono nombre="zoom-in" tam={14} />
            Toca una sala para acercarte.
          </p>
          <Leyenda celular />
          {listaDe(null)}
        </div>
      </>
    );
  } else {
    cuerpo = (
      <>
        <div className="of-hd">
          <div className="of-hdr">
            <h1>Oficina global</h1>
            <ConteoEmpresas oficina={oficina} conAgentes className="of-sub" />
            <EstadoVivo oficina={oficina} />
            <span className="of-sp" />
            {rm ? <ChipAnimacionReducida /> : null}
            {/* Con la vista 3D abierta, va en su barra (el menú abierto es uno para los dos botones). */}
            {en3d ? null : <BotonResumen />}
            <BotonesAvisos celular={false} agentes={oficina.agentes} rm={rm} />
            <BotonMascotas celular={false} />
            <BotonConversaciones celular={false} />
            <button type="button" className="of-btn is-sm" title="Pantalla completa para dejar en un televisor (1920 × 1080)" onClick={abrirTv}>
              <Icono nombre="tv" tam={14} />
              Modo TV
            </button>
          </div>
          <div className="of-hdr">
            <Contadores modo="pagina" {...pCont} />
            <FiltroEmpresas oficina={oficina} filtro={filtro} onFiltro={setFiltro} celular={false} />
            {/* En esta fila, que tiene espacio: en la de arriba haría saltar los botones a otra línea y le quitaría alto al piso. */}
            <span className="of-sp" />
            <button type="button" className="of-btn is-sm" title="Camina por la oficina en primera persona, desde tu escritorio" onClick={abrir3d} disabled={!vidaPiso}>
              <Icono nombre="box" tam={14} />
              Vista 3D
            </button>
          </div>
        </div>
        <div className="of-msgs">
          <Banners oficina={oficina} corto={false} c={c} libres={libres} />
        </div>
        <div className="of-scroll" {...handlers}>
          <Piso
            plano={plano}
            empresas={oficina.empresas}
            agentes={oficina.agentes}
            filtro={filtro}
            o={{ chico: false, rm, oscuro, seleccionado: sel ?? vr.resp?.id ?? null, onSeleccionar: seleccionar }}
            onReintentar={oficina.reintentar}
            sync={oficina.sync}
            pausado={tv}
            onEscritorio={tocarEscritorio}
            voz
            ia
            onVida={setVidaPiso}
          />
          <Leyenda celular={false} />
          {listaDe(null)}
        </div>
      </>
    );
  }

  const ancla = sel ? (anclaFila?.querySelector<HTMLElement>(".of-av") ?? anclaFila ?? ref.current?.querySelector<HTMLElement>(`[data-agente="${sel}"]`) ?? null) : null;

  return (
    <div ref={ref} className={raiz} style={estilo} {...hlAttr} data-oficina-pagina="">
      {cuerpo}
      {ficha && !tv ? (
        <Capa>
          {celular ? (
            <FichaHoja onCerrar={cerrarFicha}>{ficha}</FichaHoja>
          ) : (
            <FichaFlotante ancla={ancla} onCerrar={cerrarFicha} ancho={agente ? anchoFicha(agente) : undefined} seguir={en3d}>
              {ficha}
            </FichaFlotante>
          )}
        </Capa>
      ) : null}
      {escritorio && !tv && !celular ? (
        <Capa>
          <FichaFlotante ancla={escritorio.el} onCerrar={cerrarEscritorio} ancho={380} seguir={en3d}>
            <VentanitaEscritorio
              prefijo={escritorio.prefijo}
              empresa={oficina.empresas.find((e) => e.prefijo === escritorio.prefijo)?.nombre ?? escritorio.prefijo}
              agentes={oficina.agentes}
              fila={filaDelPlano(plano, oficina.agentes)}
              ahora={ahora}
              onCerrar={cerrarEscritorio}
              onResponder={(id) => {
                const desde = escritorio.el;
                setEscritorio(null);
                responderDesde(id, desde);
              }}
            />
          </FichaFlotante>
        </Capa>
      ) : null}
      {tip && !agente && !escritorio ? <Tooltip tip={tip} /> : null}
      {vr.agente && !tv ? (
        <Capa>
          <VentanaResponder
            key={vr.resp!.id}
            agente={vr.agente}
            inicial={vr.resp!.indice}
            sync={oficina.sync}
            agentes={oficina.agentes}
            celular={celular}
            rm={rm}
            enlazar={enlazar}
            ahora={ahora}
            onCerrar={vr.cerrar}
            avisar={avisar}
          />
        </Capa>
      ) : null}
      {!tv ? <SubtituloVoz agentes={oficina.agentes} rm={rm} /> : null}
      {!tv ? <ReproductorResumen /> : null}
      <Avisos avisos={avisos} />
      {en3d && vidaPiso && !tv && !celular ? (
        <Capa>
          <Vista3D
            plano={plano}
            agentes={oficina.agentes}
            empresas={oficina.empresas}
            vida={vidaPiso}
            oscuro={oscuro}
            rm={rm}
            onCerrar={cerrar3d}
            onAgente={abrirDesdeFila}
            onEscritorio={tocarEscritorio}
            abierto={!!agente || !!escritorio || !!vr.agente}
          />
        </Capa>
      ) : null}
      {tv ? (
        <Capa>
          <VistaTv
            oficina={oficina}
            enlazar={enlazar}
            urlTv={urlTv}
            copiar={copyTextToClipboard}
            onSalir={() => {
              if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
              setTv(false);
            }}
            pantallaCompleta
          />
        </Capa>
      ) : null}
    </div>
  );
}
