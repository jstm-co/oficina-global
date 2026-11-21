// «🔊 Leer contexto» en la barra de arriba de Paperclip (JST-276, design-spec de
// JST-282 rev 2, A · En la barra de arriba). Lo dibuja `OficinaTvBoton` (slot
// `globalToolbarButton`), que está en todas las páginas y no se va al bajar: así
// se ve donde sea que abra la tarea, también en la tarjeta pendiente de abajo.
//
// - Solo en la página de una tarea (`/{prefijo}/issues/{código o id}`).
// - Computador: botón con texto (30 px, mínimo 132 de ancho, «Detener 2/5»).
//   Celular (≤ 767 px): solo el ícono, 44 × 44. Si es lo último de la barra,
//   su zona llega al borde de la pantalla (JST-290, design-spec de JST-294 §2).
// - Se calla al cambiar de tarea o de página y al cerrar la pestaña (§6): la
//   barra no se desmonta, así que se mira la ruta. Un ancla de la misma tarea no.
// - Una voz a la vez con el Resumen (§7): ver `resumen.ts`.
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type RefObject } from "react";
import { useHostContext, useHostLocation } from "@paperclipai/plugin-sdk/ui";
import { t } from "../i18n.js";
import { textoDeTarea } from "./botonContexto.js";
import { Capa } from "./capas.js";
import { LectorContexto, msEscrita, tareaDeRuta, type EstadoContexto, type VozContexto } from "./contextoLector.js";
import { VozContextoElegida } from "./contextoMotor.js";
import { calentarVoz } from "./eleccion.js";
import { cx, Icono } from "./piso.js";
import { resumen } from "./resumen.js";
import { audioDelResumen, fijarContextoSonando, vocesDisponibles } from "./sonido.js";
import { useCelular, useMovimientoReducido } from "./useOficina.js";

// ---------------------------------------------------------------------------
// La voz del navegador
// ---------------------------------------------------------------------------

/** Chrome carga sus voces un rato después de abrir la página: si todavía no hay ninguna, se espera hasta `ms`. */
function esperarVoces(ms: number): Promise<void> {
  return new Promise((ok) => {
    const s = window.speechSynthesis;
    const listo = () => {
      clearTimeout(t);
      s.removeEventListener("voiceschanged", listo);
      ok();
    };
    const t = setTimeout(listo, ms);
    s.addEventListener("voiceschanged", listo);
  });
}

/** Ya se esperó a las voces una vez: un navegador sin ninguna no hace esperar cada toque. */
let yaSeEsperoVoces = false;

const vozNavegador: VozContexto = {
  async hayVoz() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
    if (vocesDisponibles().length > 0) return true;
    // Recién abierto, Chrome puede tardar más de 1 s (el banco de JST-276 lo vio): hasta 2 s, solo la primera vez.
    if (!yaSeEsperoVoces && window.speechSynthesis.getVoices().length === 0) await esperarVoces(2_000);
    yaSeEsperoVoces = true;
    return vocesDisponibles().length > 0;
  },
  decir(frase, alTerminar, primera) {
    const synth = window.speechSynthesis;
    const u = new SpeechSynthesisUtterance(frase);
    const v = vocesDisponibles()[0];
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    } else u.lang = "es-MX";
    u.rate = 1.05;
    let sonando = true;
    const fin = (cortada: boolean) => {
      if (!sonando) return;
      sonando = false;
      clearTimeout(tope);
      alTerminar(cortada);
    };
    // Si el navegador no avisa que terminó (a veces Chrome se queda callado), sigue con la próxima.
    const tope = setTimeout(() => fin(false), msEscrita(frase) * 3 + 5_000);
    u.onend = () => fin(false);
    // Otra voz (la Oficina o el Resumen con la voz del navegador) la cortó.
    u.onerror = (e) => fin(e.error === "interrupted" || e.error === "canceled");
    try {
      // Al empezar, corta lo que el navegador estuviera diciendo; las frases que siguen van detrás de la anterior.
      if (primera) synth.cancel();
      synth.speak(u);
    } catch {
      setTimeout(() => fin(true), 0);
    }
    // Parar solo corta si esta frase sigue sonando: la voz del navegador es una sola para toda la pestaña (JST-277).
    return () => {
      if (!sonando) return;
      sonando = false;
      clearTimeout(tope);
      try {
        synth.cancel();
      } catch {
        // Ya no sonaba.
      }
    };
  },
};

// ---------------------------------------------------------------------------
// Una por pestaña
// ---------------------------------------------------------------------------

/** La empresa que ve el usuario en esta página (para hablarle al worker de las voces). */
let empresaDeVoz: string | null = null;

/** El `<audio>` desbloqueado dentro del toque (se toma al empezar a leer: `antesDeLeer` corre dentro del clic). */
let audioContexto: HTMLAudioElement | null = null;

export const contexto = new LectorContexto({
  // 0.11.0 (JST-325): la voz que el usuario eligió en «Voces» (Dora al instalar); la del navegador, si eligió esa o no hay worker.
  voz: new VozContextoElegida({ companyId: () => empresaDeVoz ?? resumen.empresaDeVoz(), audio: () => audioContexto, navegador: vozNavegador }),
  programar: (fn, ms) => {
    const t = setTimeout(fn, ms);
    return () => clearTimeout(t);
  },
  antesDeLeer: () => {
    audioContexto = audioDelResumen();
    resumen.pausarPorContexto();
  },
  alActivo: (on) => {
    resumen.fijarContextoLee(on);
    fijarContextoSonando(on);
  },
});

if (typeof window !== "undefined") {
  // ▶ del Resumen (o leerlo otra vez) mientras se lee el contexto: el contexto se detiene (§7).
  resumen.alHablar(() => {
    if (contexto.activo()) contexto.detener();
  });
  resumen.suscribir(() => {
    if (contexto.activo() && resumen.lector?.activo()) contexto.detener();
  });
  window.addEventListener("pagehide", () => contexto.detener());
  // Pedir la lista hace que Chrome empiece a cargar sus voces: al tocar el botón ya están.
  try {
    window.speechSynthesis?.getVoices();
  } catch {
    // Sin voces.
  }
  (window as unknown as { __oficinaContexto?: () => unknown }).__oficinaContexto = () => ({
    estado: contexto.estado,
    tarea: contexto.tarea,
    frases: contexto.frases.slice(),
    k: contexto.k,
    sinVoz: contexto.sinVoz,
  });
}

export function useContexto(): LectorContexto {
  useSyncExternalStore(contexto.suscribir, () => contexto.version);
  return contexto;
}

// ---------------------------------------------------------------------------
// El botón
// ---------------------------------------------------------------------------

export const ICONO: Readonly<Record<EstadoContexto, string>> = { listo: "volume-2", cargando: "loader", leyendo: "x", fin: "check", error: "triangle-alert" };
export const TEXTO: Readonly<Record<EstadoContexto, string>> = { listo: t("Leer contexto"), cargando: t("Leer contexto"), leyendo: t("Detener"), fin: t("Leído"), error: t("No se pudo") };
const ARIA: Readonly<Record<EstadoContexto, string>> = {
  listo: t("Leer contexto de la tarea"),
  cargando: t("Cargando el contexto de la tarea"),
  leyendo: t("Detener lectura"),
  fin: t("Leer contexto de la tarea"),
  error: t("No se pudo cargar la tarea. Leer contexto otra vez"),
};
const TITULO: Readonly<Record<EstadoContexto, string>> = { listo: t("Leer contexto"), cargando: t("Cargando…"), leyendo: t("Detener"), fin: t("Leer contexto"), error: t("No se pudo cargar la tarea") };

// ---------------------------------------------------------------------------
// Al borde de la pantalla, en el celular (JST-290, design-spec de JST-294 §2)
// ---------------------------------------------------------------------------

/** Lo que se mira de un elemento de la barra (un `HTMLElement`; las pruebas pasan uno de mentira). */
export interface NodoBarra {
  readonly nextElementSibling: NodoBarra | null;
  readonly parentElement: NodoBarra | null;
  getBoundingClientRect(): { readonly width: number; readonly right: number };
}

/** El margen derecho de la barra de Paperclip en el celular (`px-4`): el 🔊 se lo come para llegar al borde. */
export const MARGEN_BARRA = 16;
/** Hasta cuántos contenedores se sube buscando la barra (hoy son 3: los slots, el grupo de los plugins y la barra). */
const NIVELES = 6;

/**
 * ¿El botón (`el`, su envoltorio) es lo último de la barra de arriba y la barra llega al borde derecho de la pantalla
 * con sus 16 px de margen? Sube por los contenedores de Paperclip hasta el primero con margen a la derecha, que es la
 * barra, y en cada nivel no puede haber nada visible después. Paperclip ordena los botones por el `order` del slot y
 * después por el nombre del plugin: hoy el 🔊 («Oficina global») va último. Si otro plugin queda después, o la barra
 * cambia de margen o no llega al borde, no: el botón queda como en la 0.9.6.
 */
export function alBordeDeLaBarra(el: NodoBarra, margenDerecho: (n: NodoBarra) => number, anchoPantalla: number): boolean {
  let x = el;
  for (let i = 0; i < NIVELES; i++) {
    for (let s = x.nextElementSibling; s; s = s.nextElementSibling) if (s.getBoundingClientRect().width > 0) return false;
    const p = x.parentElement;
    if (!p) return false;
    const m = margenDerecho(p);
    if (m > 0) return Math.round(m) === MARGEN_BARRA && Math.abs(p.getBoundingClientRect().right - anchoPantalla) < 1;
    x = p;
  }
  return false;
}

/** La barra: el primer contenedor con margen a la derecha (ahí se mira si otro plugin aparece después). */
function barraDe(el: HTMLElement): HTMLElement | null {
  let p = el.parentElement;
  for (let i = 0; p && i < NIVELES; i++, p = p.parentElement) if ((parseFloat(getComputedStyle(p).paddingRight) || 0) > 0) return p;
  return null;
}

/**
 * En el celular, si el botón va al borde. Se vuelve a mirar al cambiar el ancho y cuando cambia algo en la barra
 * (un plugin que carga después y queda detrás).
 */
function useAlBorde(caja: RefObject<HTMLElement | null>, activo: boolean): boolean {
  const [borde, setBorde] = useState(false);
  useLayoutEffect(() => {
    const el = caja.current;
    if (!activo || !el) return;
    const mirar = () =>
      setBorde(alBordeDeLaBarra(el, (n) => parseFloat(getComputedStyle(n as Element).paddingRight) || 0, document.documentElement.clientWidth || window.innerWidth));
    mirar();
    const mo = new MutationObserver(mirar);
    mo.observe(barraDe(el) ?? el.parentElement ?? el, { childList: true, subtree: true });
    window.addEventListener("resize", mirar);
    return () => {
      mo.disconnect();
      window.removeEventListener("resize", mirar);
    };
  }, [activo, caja]);
  return activo && borde;
}

/**
 * Dónde va lo que sale bajo el botón: en el computador, 10 px bajo él y a su borde derecho; en el celular, a lo
 * ancho, 8 px bajo la barra. Se vuelve a medir con cada cambio de la lectura (`tic`), por si la barra se reacomoda.
 */
function useBajoBoton(boton: RefObject<HTMLElement | null>, activo: boolean, celular: boolean, tic: number): CSSProperties | null {
  const [pos, setPos] = useState<CSSProperties | null>(null);
  useLayoutEffect(() => {
    if (!activo) return;
    const medir = () => {
      const r = boton.current?.getBoundingClientRect();
      if (!r) return;
      // La barra de Paperclip mide 48 px y el botón va centrado en ella. El ancho, sin la barra de scroll.
      const ancho = document.documentElement.clientWidth || window.innerWidth;
      const n: CSSProperties = celular ? { top: Math.round(r.top + r.height / 2 + 24 + 8), left: 8, right: 8 } : { top: Math.round(r.bottom + 10), right: Math.max(8, Math.round(ancho - r.right)) };
      setPos((x) => (x && x.top === n.top && x.left === n.left && x.right === n.right ? x : n));
    };
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [activo, celular, boton, tic]);
  return activo ? pos : null;
}

/**
 * Sin voz en español (§5): todas las frases escritas, con la que va marcada; sigue a la que va. En la barra va flotando
 * (`estilo`); en la ventana de responder (JST-321) va `dentro`, bajo la fila de la tarea, sin flotar ni tapar.
 */
export function EscritoContexto({ c, celular, estilo, dentro = false }: { c: LectorContexto; celular: boolean; estilo?: CSSProperties; dentro?: boolean }) {
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = caja.current;
    const cur = el?.querySelector<HTMLElement>("p.is-cur");
    if (!el || !cur) return;
    const arriba = cur.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop;
    if (arriba < el.scrollTop + 40 || arriba + cur.offsetHeight > el.scrollTop + el.clientHeight - 8) el.scrollTop = Math.max(0, arriba - 48);
  }, [c.k]);
  return (
    <div ref={caja} className={cx("of-ctx-esc", dentro && "is-in", celular && "is-m")} style={estilo} role="region" aria-label={t("Contexto de la tarea, escrito")}>
      <div className="of-ctx-eh">
        <Icono nombre="volume-x" tam={14} />
        <span>
          <b>{t("Este navegador no tiene voz en español.")}</b> {t("Te lo dejo escrito.")}
        </span>
        <button type="button" className="of-ibtn is-ghost" aria-label={t("Detener lectura")} title={t("Detener")} onClick={() => c.detener()}>
          <Icono nombre="x" tam={celular ? 18 : 14} />
        </button>
      </div>
      {c.frases.map((f, i) => (
        <p key={i} className={i === c.k ? "is-cur" : i > c.k ? "is-fut" : undefined} aria-current={i === c.k ? "true" : undefined}>
          {f}
        </p>
      ))}
    </div>
  );
}

/** El botón de la barra de arriba; no dibuja nada fuera de la página de una tarea. */
export function BotonContextoBarra() {
  const location = useHostLocation();
  const tarea = tareaDeRuta(location.pathname);
  const celular = useCelular();
  const rm = useMovimientoReducido();
  const c = useContexto();
  const host = useHostContext();
  empresaDeVoz = host.companyId ?? empresaDeVoz;
  const boton = useRef<HTMLButtonElement>(null);
  const caja = useRef<HTMLSpanElement>(null);
  const borde = useAlBorde(caja, celular && !!tarea);
  // Al ir a otra tarea o a otra página (o si el host quita la barra), se calla (§6).
  useEffect(() => {
    if (!tarea) return;
    return () => contexto.detener();
  }, [tarea]);
  const propia = !!tarea && c.tarea === tarea;
  const e: EstadoContexto = propia ? c.estado : "listo";
  const escrito = propia && e === "leyendo" && c.sinVoz && c.frases.length > 0;
  const aviso = propia && e === "error" && celular;
  const bajo = useBajoBoton(boton, escrito || aviso, celular, c.version);
  if (!tarea) return null;
  const n = c.frases.length;
  return (
    <span ref={caja} className={cx("of-layer of-ctxw", rm && "of-rm")}>
      <button
        ref={boton}
        type="button"
        className={cx("of-ctx", `is-${e}`, celular && "is-m", borde && "is-borde")}
        aria-label={ARIA[e]}
        title={TITULO[e]}
        aria-busy={e === "cargando" ? true : undefined}
        onPointerEnter={() => calentarVoz("contexto", empresaDeVoz ?? resumen.empresaDeVoz())}
        onClick={() => {
          calentarVoz("contexto", empresaDeVoz ?? resumen.empresaDeVoz());
          c.tocar(tarea, () => textoDeTarea(tarea));
        }}
      >
        <Icono nombre={ICONO[e]} tam={celular ? 18 : 14} className={e === "cargando" ? "of-spin" : undefined} />
        {celular ? null : <span className="of-ctx-t">{TEXTO[e]}</span>}
        {!celular && e === "leyendo" && n > 0 ? <span className="of-ctx-n">{`${c.k + 1}/${n}`}</span> : null}
      </button>
      <span className="of-sr" role="status">
        {e === "fin" ? t("Leído") : e === "error" ? t("No se pudo cargar la tarea") : ""}
      </span>
      {escrito && bajo ? (
        <Capa>
          <EscritoContexto c={c} celular={celular} estilo={bajo} />
        </Capa>
      ) : null}
      {aviso && bajo ? (
        <Capa>
          <div className="of-ctx-toast" style={bajo}>
            <Icono nombre="triangle-alert" tam={14} />
            {t("No se pudo cargar la tarea. Prueba otra vez.")}
          </div>
        </Capa>
      ) : null}
    </span>
  );
}
