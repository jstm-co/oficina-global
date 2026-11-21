// UI del plugin «Oficina global» (`jstm.oficina-pixel`), con el diseño
// aprobado en JST-65 (propuesta A · Piso abierto) y la 0.2.0 de JST-95 (A ·
// Lista y ventana): menú lateral, página, widget del Dashboard, botón del modo
// TV en la barra de arriba (celular) y modo TV. Todo se lee con la sesión del
// usuario (JST-66); solo escribe al responder una tarjeta o una aprobación,
// cuando el usuario toca enviar (JST-97).
//
// El enlace del menú y el botón de la barra arrancan la vigía de los avisos y
// las voces (`vigia.ts`): el menú se puede plegar y entonces se desmonta, la
// barra no (JST-94).
import { useLayoutEffect } from "react";
import { useHostLocation, useHostNavigation, usePluginToast, type PluginSidebarProps } from "@paperclipai/plugin-sdk/ui";
import { t } from "../i18n.js";
import { PAGE_ROUTE } from "../shared.js";
import { useAjustes } from "./ajustes.js";
import { BotonContextoBarra } from "./contextoBarra.js";
import { asegurarEstilos } from "./estilos.js";
import { BotonResumenArriba } from "./menuResumen.js";
import { EVENTO_TV } from "./pagina.js";
import { Icono } from "./piso.js";
import { ReproductorResumen } from "./reproductorResumen.js";
import { useSubtitulo } from "./sonido.js";
import { useCelular } from "./useOficina.js";
import { useMarca, useVigia } from "./vigia.js";

export { OficinaGlobalPage } from "./pagina.js";
export { OficinaGlobalWidget } from "./widget.js";

function IconoOficina() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
      <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
      <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
      <path d="M10 6h4" />
      <path d="M10 10h4" />
      <path d="M10 14h4" />
      <path d="M10 18h4" />
    </svg>
  );
}

/** Enlace del menú lateral. Replica las clases del ítem nativo del sidebar (como Board global). */
/**
 * Enlace del menú lateral. Replica las clases del ítem nativo del sidebar (como Board global).
 * Con los avisos encendidos y mientras alguien espere, lleva la marca «✋ 6» (JST-95 §7); las
 * frases de las voces se anuncian aquí al lector de pantalla (§8).
 */
export function OficinaGlobalSidebarLink(_props: PluginSidebarProps) {
  useLayoutEffect(() => asegurarEstilos(), []);
  useVigia(usePluginToast());
  const navigation = useHostNavigation();
  const location = useHostLocation();
  const { avisos } = useAjustes();
  const marca = useMarca();
  const subtitulo = useSubtitulo();
  const active = location.pathname.endsWith(`/${PAGE_ROUTE}`);
  return (
    <a
      {...navigation.linkProps(`/${PAGE_ROUTE}`)}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2.5 mx-2 rounded-lg px-2 py-1.5 font-medium transition-colors ${
        active ? "bg-accent text-foreground" : "text-foreground/80 hover:bg-accent/50 hover:text-foreground"
      }`}
    >
      <span className="relative shrink-0">
        <IconoOficina />
      </span>
      <span className="flex-1 truncate">Oficina global</span>
      {avisos && marca > 0 ? (
        <span className="of-marca" title={marca === 1 ? t("{n} te necesita", { n: marca }) : t("{n} te necesitan", { n: marca })}>
          <Icono nombre="hand" tam={12} />
          {marca}
        </span>
      ) : null}
      <span className="of-sr" aria-live="polite">
        {subtitulo?.texto ?? ""}
      </span>
    </a>
  );
}

/**
 * Botón «Modo TV» en la barra de arriba del host (§10): solo en el celular y
 * solo en la página de la oficina. En computador el botón va en el encabezado.
 * Está montado en todas las páginas (aunque no dibuje nada): desde aquí sale
 * el aviso si el menú lateral está plegado (JST-94).
 *
 * 0.9.0 (JST-245 §1 y §4): en el celular, «Resumen» va antes de «Modo TV». Y
 * desde aquí se dibuja el reproductor del Resumen, en todas las páginas: sigue
 * sonando al abrir una tarea desde su chip.
 *
 * 0.9.6 (JST-276, design-spec de JST-282): en la página de una tarea, «🔊 Leer
 * contexto» (computador y celular). Ya no va en la fila bajo el título.
 */
export function OficinaTvBoton() {
  useLayoutEffect(() => asegurarEstilos(), []);
  useVigia(usePluginToast());
  const location = useHostLocation();
  const celular = useCelular();
  const enLaOficina = location.pathname.endsWith(`/${PAGE_ROUTE}`);
  return (
    <>
      <ReproductorResumen />
      <BotonContextoBarra />
      {celular && enLaOficina ? (
        <>
          <BotonResumenArriba />
          <button type="button" className="of-tbtn" aria-label={t("Modo TV")} title={t("Modo TV")} onClick={() => window.dispatchEvent(new Event(EVENTO_TV))}>
            <Icono nombre="tv" tam={18} />
          </button>
        </>
      ) : null}
    </>
  );
}
