// Modo TV (design-spec de JST-65 §14): lienzo fijo de 1920×1080 escalado a la
// ventana sobre fondo negro, con el piso a la escala entera más grande que cabe
// (hoy 3x; con 5 empresas, 2x en filas de 3). Lo usan la página (con
// pantalla completa) y `tv.html` (página suelta, sin el menú de Paperclip).
// No usa el SDK ni la navegación del host: `tv.html` no los tiene.
//
// 0.2.0 (design-spec de JST-95 §10): con los avisos encendidos, el banner
// violeta de quien pasa a «te necesita» en el lugar reservado del banner (no
// mueve el piso); los botones «Avisos» y «Voces» abajo a la derecha; el
// subtítulo de la voz; el error completo en la ficha; y tocar a quien levanta
// la mano abre la misma ventana para responder.
//
// 0.3.0 (JST-96 §11): la misma vida del piso, a 3x (o 2x con 5 empresas).
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fotoDe, llegadas, nombreCorto, type Llegada } from "../avisos.js";
import { abreVentana } from "../lista.js";
import { armarPisoTv } from "../plano.js";
import { contarVista, type AgenteVista } from "../vista.js";
import { useErroresSilenciados } from "./erroresSilenciados.js";
import { useAjustes } from "./ajustes.js";
import { Banners, Contadores, ConteoEmpresas, EstadoVivo } from "./encabezado.js";
import { Ficha, FichaHoja, type Enlazar } from "./ficha.js";
import { Avisos, useAvisos, useEsc } from "./capas.js";
import { BannerTocaTv, BotonesTv, SubtituloVoz } from "./paneles.js";
import { cx, Icono, Piso } from "./piso.js";
import { todosLibres, useAhora, useAnchoVentana, useCelular, useMovimientoReducido, usePestanaOculta, useSalasPrevias, useTemaOscuro, type Oficina } from "./useOficina.js";
import { VentanaResponder } from "./ventana.js";
import { useVigia } from "./vigia.js";

export interface PropsVistaTv {
  oficina: Oficina;
  enlazar: Enlazar;
  /** Ruta de `tv.html` con el UUID de la instalación, para «Enlace para un TV». */
  urlTv: string | null;
  copiar: (texto: string) => Promise<void>;
  /** Salir del modo TV (en la página). En `tv.html` no hay a dónde salir: se ofrece pantalla completa. */
  onSalir: (() => void) | null;
  /** Pedir pantalla completa al abrir (la página, tras el clic en «Modo TV»). */
  pantallaCompleta: boolean;
}

function useEscala(): number {
  const ancho = useAnchoVentana();
  const [alto, setAlto] = useState(() => window.innerHeight);
  useEffect(() => {
    const r = () => setAlto(window.innerHeight);
    window.addEventListener("resize", r);
    return () => window.removeEventListener("resize", r);
  }, []);
  return Math.min(ancho / 1920, alto / 1080);
}

/** El banner de «te necesita» se queda mientras ese agente te espere, como máximo 60 s (§10). */
const BANNER_TOCA_MS = 60_000;

/**
 * Quién acaba de pasar a «te necesita», para el banner del TV. Lo ve el TV
 * mismo (no la vigía): en `tv.html` no hay aviso de Paperclip, el aviso es el
 * banner. Si llega otro, lo reemplaza.
 */
function useBannerToca(oficina: Oficina, activo: boolean): { llegada: Llegada; desde: number } | null {
  const foto = useRef<Map<string, number> | null>(null);
  const [banner, setBanner] = useState<{ llegada: Llegada; desde: number } | null>(null);
  useEffect(() => {
    const s = oficina.sync;
    if (!s) return;
    const conocida = (companyId: string) => {
      const e = s.estadoEmpresa(companyId);
      return !e.cargando && !e.error && !e.sinAtencion;
    };
    const nueva = fotoDe(oficina.agentes, conocida);
    const antes = foto.current;
    foto.current = nueva;
    if (!antes || !activo) return;
    const a = llegadas(antes, nueva)
      .map((id) => oficina.agentes.find((x) => x.id === id))
      .filter((x) => !!x)
      .at(-1);
    if (a) setBanner({ llegada: { agenteId: a.id, corto: nombreCorto(a.nombre), empresa: a.empresa, prefijo: a.prefijo, esperas: a.teNecesita }, desde: Date.now() });
  }, [oficina, activo]);
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), Math.max(0, banner.desde + BANNER_TOCA_MS - Date.now()));
    return () => clearTimeout(t);
  }, [banner]);
  if (!banner || !activo) return null;
  return oficina.agentes.find((a) => a.id === banner.llegada.agenteId)?.need ? banner : null;
}

/** En iPhone, Safari no da pantalla completa a una página (sí a un video). En iPad sí existe. */
const esIphone = () => /iPhone|iPod/.test(navigator.userAgent);

export function VistaTv({ oficina, enlazar, urlTv, copiar, onSalir, pantallaCompleta }: PropsVistaTv) {
  useVigia(null);
  const ref = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [resp, setResp] = useState<{ id: string; indice: number } | null>(null);
  const celular = useCelular();
  const { avisos: avisosOn } = useAjustes();
  const [completa, setCompleta] = useState(false);
  const escala = useEscala();
  const rm = useMovimientoReducido();
  const oculta = usePestanaOculta();
  const oscuro = useTemaOscuro();
  const ahora = useAhora(15_000);
  const { avisos, mostrar } = useAvisos();
  const salir = useRef(onSalir);
  salir.current = onSalir;
  const previas = useSalasPrevias();

  const plano = useMemo(
    () => armarPisoTv(oficina.empresas.map((e) => ({ prefijo: e.prefijo, agentes: e.agentes })), previas),
    [oficina.empresas, previas],
  );
  // JST-410: un error de hace más de un día, o silenciado, no cuenta en «con error».
  const silenciados = useErroresSilenciados();
  const c = contarVista(oficina.agentes, ahora, silenciados);
  const agente = sel ? oficina.agentes.find((a) => a.id === sel) : undefined;
  // La ventana sigue con lo último que se supo del agente hasta que se cierra (no pierde «Listo»).
  const ultimoResp = useRef<AgenteVista | null>(null);
  const vivoResp = resp ? oficina.agentes.find((a) => a.id === resp.id) : undefined;
  if (vivoResp) ultimoResp.current = vivoResp;
  const agenteResp = resp ? (vivoResp ?? (ultimoResp.current?.id === resp.id ? ultimoResp.current : undefined)) : undefined;
  const bannerToca = useBannerToca(oficina, avisosOn);
  const libres = todosLibres(oficina);

  // Pantalla completa al entrar; en iPhone no existe y se avisa cómo dejarlo en la pantalla de inicio.
  useLayoutEffect(() => {
    if (!pantallaCompleta) return;
    const el = ref.current;
    if (el && !esIphone() && document.fullscreenEnabled && el.requestFullscreen) {
      el.requestFullscreen().catch(() => undefined);
    } else if (esIphone()) {
      mostrar(
        <>
          <Icono nombre="smartphone" tam={14} />
          <span>
            En iPhone no hay pantalla completa: usa <b>Compartir → Agregar a inicio</b>.
          </span>
        </>,
        6000,
      );
    }
  }, [pantallaCompleta, mostrar]);

  // Al salir de la pantalla completa (Esc del navegador), se sale también del modo TV.
  useEffect(() => {
    const cambio = () => {
      const dentro = document.fullscreenElement === ref.current;
      setCompleta(dentro);
      if (!dentro && pantallaCompleta && salir.current) salir.current();
    };
    document.addEventListener("fullscreenchange", cambio);
    return () => document.removeEventListener("fullscreenchange", cambio);
  }, [pantallaCompleta]);

  // Esc cierra la capa de arriba (la ventana, después la ficha); el último Esc sale del modo TV.
  useEsc(true, () => salir.current?.());
  const cerrarFicha = useCallback(() => setSel(null), []);
  useEsc(!!sel, cerrarFicha);
  const avisar = useCallback((contenido: ReactNode) => mostrar(contenido), [mostrar]);
  const tocar = (id: string) => {
    const a = oficina.agentes.find((x) => x.id === id);
    if (a && abreVentana(a)) {
      setSel(null);
      setResp({ id, indice: 0 });
      return;
    }
    setSel((s) => (s === id ? null : id));
  };

  const copiarEnlace = () => {
    if (!urlTv) return;
    const url = `${location.origin}${urlTv}`;
    copiar(url).then(
      () => mostrar(<span>Enlace copiado. Ábrelo en el navegador del TV con tu sesión: <b className="of-mono">{url}</b></span>, 6000),
      () => mostrar(<span>No pude copiar. El enlace es <b className="of-mono">{url}</b></span>, 8000),
    );
  };

  const hora = new Date(ahora).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
  // Un solo lugar reservado: gana el error de lectura, después «te necesita», después «todos libres» (§10).
  const hayError = !!oficina.errorEmpresas || oficina.caidas.length > 0 || (oficina.sinAtencion && !oficina.cargando);
  const conToca = !hayError && !!bannerToca;
  const hayMensaje = hayError || conToca || libres;

  return (
    <div ref={ref} className={cx("of of-tvwrap", rm && "of-rm", oculta && "of-oculta", oscuro && "dark")}>
      <div className="of-tv" style={{ transform: `scale(${escala})` }}>
        <div className="of-tvh">
          <div className="of-tvt">
            <Icono nombre="building-2" />
            <span>Oficina global</span>
            <ConteoEmpresas oficina={oficina} conAgentes className="of-tvsub" dentro={ref.current} />
          </div>
          <Contadores modo="tv" c={c} hl={null} onHl={() => undefined} cargando={oficina.cargando && oficina.agentes.length === 0} sinAtencion={oficina.sinAtencion} />
          <div className="of-tvsm">
            {c.pausa} en pausa · {c.libre} {c.libre === 1 ? "libre" : "libres"}
          </div>
          <span className="of-sp" />
          <div className="of-tvclock">{hora}</div>
          <EstadoVivo oficina={oficina} />
        </div>
        <div className="of-tvb">
          {/* El lugar del banner está siempre, vacío o no: así el piso no se mueve cuando sale o se va un aviso (JST-122). */}
          <div className="of-tvmsg">
            {!hayMensaje ? null : conToca && bannerToca ? (
              <BannerTocaTv llegada={bannerToca.llegada} desde={bannerToca.desde} ahora={ahora} />
            ) : (
              <Banners oficina={oficina} corto={false} c={c} libres={libres} />
            )}
          </div>
          <Piso
            plano={plano}
            empresas={oficina.empresas}
            agentes={oficina.agentes}
            filtro={[]}
            o={{ chico: plano.escala === 1, rm, oscuro, seleccionado: sel ?? resp?.id ?? null, onSeleccionar: tocar }}
            onReintentar={oficina.reintentar}
            sync={oficina.sync}
            tv
            voz
            ia={onSalir !== null}
          />
        </div>
        <div className="of-tvbtns">
          <BotonesTv />
          {urlTv ? (
            <button type="button" className="of-tvexit" onClick={copiarEnlace} title="Página suelta, sin el menú de Paperclip, para dejarla abierta en un TV">
              <Icono nombre="link" tam={14} />
              Enlace para un TV
            </button>
          ) : null}
          {onSalir ? (
            <button type="button" className="of-tvexit" onClick={onSalir}>
              <Icono nombre="minimize-2" tam={14} />
              Salir <kbd>Esc</kbd>
            </button>
          ) : !completa && document.fullscreenEnabled ? (
            <button type="button" className="of-tvexit" onClick={() => void ref.current?.requestFullscreen().catch(() => undefined)}>
              <Icono nombre="maximize-2" tam={14} />
              Pantalla completa
            </button>
          ) : null}
        </div>
      </div>
      {agente ? (
        <div className="of-layer">
          <FichaHoja tv onCerrar={cerrarFicha}>
            <Ficha
              agente={agente}
              agentes={oficina.agentes}
              sync={oficina.sync}
              ahora={ahora}
              rm={rm}
              enlazar={enlazar}
              onCerrar={cerrarFicha}
              onSeleccionar={setSel}
              onResponder={(i) => {
                setSel(null);
                setResp({ id: agente.id, indice: i });
              }}
              copiar={copiar}
              avisar={avisar}
            />
          </FichaHoja>
        </div>
      ) : null}
      {agenteResp ? (
        <div className="of-layer">
          <VentanaResponder
            key={resp!.id}
            agente={agenteResp}
            inicial={resp!.indice}
            sync={oficina.sync}
            agentes={oficina.agentes}
            celular={celular}
            rm={rm}
            enlazar={enlazar}
            ahora={ahora}
            onCerrar={() => setResp(null)}
            avisar={avisar}
          />
        </div>
      ) : null}
      <div className="of-layer">
        <SubtituloVoz agentes={oficina.agentes} rm={rm} />
      </div>
      <Avisos avisos={avisos} dentro={ref.current} />
    </div>
  );
}
