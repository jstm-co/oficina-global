// El botón «Resumen» y su menú (0.9.0, design-spec de JST-245 §1, §2 y §7, A ·
// Menú y reproductor): el primero del encabezado, antes de «Avisos» y «Voces»;
// en el celular, un ícono en la barra de arriba de Paperclip, antes de «Modo
// TV», que abre una hoja inferior. No va en el modo TV.
//
// El menú: desde cuándo, de qué empresas, qué te cuento y el largo (se guardan
// en el navegador), los números con lo elegido y «Leer el resumen». Al abrirlo
// se piden lo terminado y la cola (lo demás ya lo tiene la Oficina).
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode, type TouchEvent } from "react";
import { NOMBRE_SECCION, alternarEmpresa, alternarParte, type Largo, type Parte } from "../resumen/frases.js";
import { DESDES, type Desde } from "../resumen/tiempo.js";
import { Capa, useEsc } from "./capas.js";
import { IA_CHROME, NOMBRE_IA } from "./ia.js";
import { abrirMenu, Popover, useMenuAbierto } from "./paneles.js";
import { cx, EtiquetaEmpresa, Icono } from "./piso.js";
import { empresasDe, resumen, useResumen } from "./resumen.js";
import { iaParaResumen } from "./resumenIa.js";

const TEXTO_DESDE: Readonly<Record<Desde, string>> = { nuevo: "Lo nuevo", hoy: "Hoy", "24h": "24 h", "7d": "7 días" };
const PARTES_MENU: ReadonlyArray<{ k: Parte; texto: string; icono: string }> = [
  { k: "toca", texto: "Te esperan", icono: "hand" },
  { k: "hecho", texto: "Terminadas", icono: "circle-check" },
  { k: "trabajan", texto: "Trabajando", icono: "keyboard" },
  { k: "cola", texto: "En cola", icono: "hourglass" },
];
const LARGOS: ReadonlyArray<{ k: Largo; texto: string; dura: string }> = [
  { k: "corto", texto: "Corto", dura: "~1 min" },
  { k: "completo", texto: "Completo", dura: "~3 min" },
];

const Esqueleto = () => <span className="of-rs-sk is-num" aria-label="Leyendo" />;
/** Lo que no se pudo leer (no responde ninguna empresa): sin número, no un 0 (JST-262). */
const SinDato = () => (
  <span title="No pude leerlo">
    <span aria-hidden="true">—</span>
    <span className="of-sr">sin dato</span>
  </span>
);

/** Un control segmentado como grupo de radios: las flechas cambian la opción. */
function Segmentado<K extends string>({ opciones, valor, etiqueta, onCambiar }: { opciones: ReadonlyArray<{ k: K; texto: ReactNode }>; valor: K; etiqueta: string; onCambiar: (k: K) => void }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const i = Math.max(0, opciones.findIndex((o) => o.k === valor));
  const flechas = (e: KeyboardEvent<HTMLButtonElement>) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const j = (i + d + opciones.length) % opciones.length;
    onCambiar(opciones[j]!.k);
    refs.current[j]?.focus();
  };
  return (
    <div className="of-rs-seg" role="radiogroup" aria-label={etiqueta}>
      {opciones.map((o, j) => (
        <button
          key={o.k}
          ref={(el) => {
            refs.current[j] = el;
          }}
          type="button" role="radio" aria-checked={o.k === valor} tabIndex={o.k === valor ? 0 : -1} onClick={() => onCambiar(o.k)} onKeyDown={flechas}>
          {o.texto}
        </button>
      ))}
    </div>
  );
}

/** El contenido del menú (§2). */
export function PanelResumen({ celular }: { celular: boolean }) {
  const r = useResumen();
  const kDesde = useId();
  const kCo = useId();
  const kPartes = useId();
  const kLargo = useId();
  const n = r.numeros();
  const op = r.op;
  const empresas = r.oficina ? empresasDe(r.oficina) : [];
  const prefijos = empresas.map((e) => e.prefijo);
  const leyendo = r.sonando();
  const numero: Record<Parte, number | null> = { toca: n?.toca ?? null, hecho: n?.hecho ?? null, trabajan: n?.trabajan ?? null, cola: n?.cola ?? null };
  // No responde ninguna: guion en vez de número (con «Reintentar» en camino, el esqueleto).
  const sinDato = !!n?.ninguna && !n.pidiendo;
  const leer = () => {
    abrirMenu(null);
    resumen.leer();
  };
  const ia = celular ? "celular" : iaParaResumen() ? "lista" : "no";
  return (
    <div className="of-avp of-rsp">
      <div className="of-avp-h">
        <Icono nombre="audio-lines" tam={14} />
        <b>Resumen</b>
        <span className="of-sp" />
        <span className="of-rs-dur" title="Lo que dura leído">
          {sinDato ? "—" : (n?.dura ?? "…")}
        </span>
      </div>
      <p>Te lo leo en voz alta, con lo que te toca primero.</p>
      <span className="of-rs-k" id={kDesde}>
        Desde cuándo
      </span>
      <Segmentado opciones={DESDES.map((k) => ({ k, texto: TEXTO_DESDE[k] }))} valor={op.desde} etiqueta="Desde cuándo" onCambiar={(desde) => r.cambiarOpciones({ desde })} />
      <div className="of-rs-hint">
        {n?.explicacion ?? ""}
        {n?.ninguna ? null : (
          <>
            {" · "}
            <b>{n?.hecho === null || !n ? <Esqueleto /> : n.hecho === 1 ? "1 terminada" : `${n.hecho} terminadas`}</b>
          </>
        )}
      </div>
      <span className="of-rs-k" id={kCo}>
        De qué empresas
      </span>
      <div className="of-rs-chips" role="group" aria-labelledby={kCo}>
        <button type="button" className="of-rs-chip is-todas" aria-pressed={op.co.length === 0} onClick={() => r.cambiarOpciones({ co: [] })}>
          Todas
        </button>
        {empresas.map((e) => {
          const falla = n?.fallan.includes(e.prefijo) ?? false;
          return (
            <button
              key={e.id}
              type="button"
              className={cx("of-rs-chip", falla && "is-falla")}
              aria-pressed={op.co.includes(e.prefijo)}
              title={falla ? "No responde" : e.nombre}
              aria-label={celular ? `${e.nombre}${falla ? ", no responde" : ""}` : undefined}
              onClick={() => r.cambiarOpciones({ co: alternarEmpresa(op.co, e.prefijo, prefijos) })}
            >
              <EtiquetaEmpresa prefijo={e.prefijo} />
              {celular ? null : <span>{e.nombre}</span>}
            </button>
          );
        })}
      </div>
      <span className="of-rs-k" id={kPartes}>
        Qué te cuento
      </span>
      <div className="of-rs-partes" role="group" aria-labelledby={kPartes}>
        {PARTES_MENU.map((p) => {
          const on = op.partes.includes(p.k);
          const v = numero[p.k];
          return (
            <button
              key={p.k}
              type="button"
              role="checkbox"
              aria-checked={on}
              className={cx("of-rs-parte", `is-${p.k}`)}
              title={on && op.partes.length === 1 ? "Siempre queda al menos una" : NOMBRE_SECCION[p.k]}
              onClick={() => r.cambiarOpciones({ partes: alternarParte(op.partes, p.k) })}
            >
              <span className="of-rs-ck" aria-hidden="true">
                {on ? <Icono nombre="check" tam={12} /> : null}
              </span>
              <Icono nombre={p.icono} tam={14} className="of-rs-pi" />
              <span className="of-rs-pt">{p.texto}</span>
              <span className="of-rs-pn">{v === null ? sinDato ? <SinDato /> : <Esqueleto /> : v > 999 ? "999+" : v}</span>
            </button>
          );
        })}
      </div>
      <span className="of-rs-k" id={kLargo}>
        Largo
      </span>
      <Segmentado
        opciones={LARGOS.map((l) => ({
          k: l.k,
          texto: (
            <>
              {l.texto}
              <em>{l.dura}</em>
            </>
          ),
        }))}
        valor={op.largo}
        etiqueta="Largo"
        onCambiar={(largo) => r.cambiarOpciones({ largo })}
      />
      {n?.ninguna ? (
        <div className="of-rs-error" role="alert">
          <span>
            <b>No pude leer Paperclip.</b> Revisa la conexión y vuelve a probar.
          </span>
          <button type="button" className="of-btn is-sm" onClick={() => r.reintentar()}>
            <Icono nombre="refresh" tam={14} />
            Reintentar
          </button>
        </div>
      ) : (
        <button type="button" className="of-btn is-primary of-rs-go" onClick={leer}>
          <Icono nombre={leyendo ? "rotate-ccw" : "play"} tam={14} className={leyendo ? undefined : "of-rs-fill"} />
          {leyendo ? "Volver a leer con esto" : "Leer el resumen"}
        </button>
      )}
      <div className="of-avp-note">
        {ia === "lista" ? (
          <>
            <Icono nombre="sparkles" tam={12} />
            <span>Lo escribe la {NOMBRE_IA} con los datos de Paperclip. Si cambia un número, esa parte va con frases armadas.</span>
          </>
        ) : (
          <>
            <Icono nombre="info" tam={12} />
            <span>{ia === "celular" ? "Frases armadas con los datos: la IA de Chrome es solo del computador." : `Frases armadas con los datos: la ${NOMBRE_IA} no está lista (${IA_CHROME ? "se baja" : "mira"} en «Conversaciones»).`}</span>
          </>
        )}
      </div>
    </div>
  );
}

/** Al abrir el menú se piden lo terminado y la cola (§2); Esc lo cierra y el foco vuelve al botón. */
function useMenuResumen(boton: { current: HTMLElement | null }) {
  const abierto = useMenuAbierto() === "resumen";
  useEffect(() => {
    if (abierto) resumen.pedirParaMenu();
  }, [abierto]);
  useEsc(abierto, () => {
    abrirMenu(null);
    boton.current?.focus();
  });
  return abierto;
}

/** El botón del encabezado en el computador (§1): `btn sm` como «Voces», el primero. Mientras lee, las barras se mueven. */
export function BotonResumen() {
  const r = useResumen();
  const boton = useRef<HTMLButtonElement>(null);
  const grupo = useRef<HTMLSpanElement>(null);
  const abierto = useMenuResumen(boton);
  const lee = r.sonando();
  const cerrar = () => abrirMenu(null);
  return (
    <span ref={grupo} className="of-rsw">
      <button
        ref={boton}
        type="button"
        className={cx("of-btn is-sm of-hbtn of-rsbtn", lee && "is-lee", abierto && "is-open")}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        title={lee ? "Resumen · leyendo" : "Resumen: te lo leo en voz alta"}
        onClick={() => abrirMenu(abierto ? null : "resumen")}
      >
        <Icono nombre="audio-lines" tam={14} />
        Resumen
        <Icono nombre={abierto ? "chevron-up" : "chevron-down"} tam={12} className="of-rs-cv" />
      </button>
      {abierto ? (
        <Capa>
          <Popover ancla={boton.current} botones={grupo.current} onCerrar={cerrar} resumen>
            <PanelResumen celular={false} />
          </Popover>
        </Capa>
      ) : null}
    </span>
  );
}

/** Celular (§1 y §7): el ícono en la barra de arriba de Paperclip, antes de «Modo TV», y la hoja inferior. */
export function BotonResumenArriba() {
  const r = useResumen();
  const boton = useRef<HTMLButtonElement>(null);
  const abierto = useMenuResumen(boton);
  const lee = r.sonando();
  const cerrar = () => abrirMenu(null);
  // §7: la hoja se cierra deslizando hacia abajo (desde arriba de todo) o tocando el fondo.
  const desde = useRef<number | null>(null);
  const deslizar = {
    onTouchStart: (e: TouchEvent<HTMLDivElement>) => {
      desde.current = e.currentTarget.scrollTop <= 0 ? (e.touches[0]?.clientY ?? null) : null;
    },
    onTouchEnd: (e: TouchEvent<HTMLDivElement>) => {
      const y = e.changedTouches[0]?.clientY;
      if (desde.current !== null && y !== undefined && y - desde.current > 70) cerrar();
      desde.current = null;
    },
  };
  return (
    <>
      <button
        ref={boton}
        type="button"
        className={cx("of-rstop of-rsbtn", lee && "is-lee")}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-label="Resumen"
        title="Resumen"
        onClick={() => abrirMenu(abierto ? null : "resumen")}
      >
        <Icono nombre="audio-lines" tam={18} />
      </button>
      {abierto ? (
        <Capa>
          <div className="of-sheet-bg" onClick={cerrar} />
          <div className="of-sheet of-hsheet of-rssheet" role="dialog" aria-label="Resumen" {...deslizar}>
            <div className="of-grab" />
            <div className="of-hsheet-b">
              <PanelResumen celular />
            </div>
          </div>
        </Capa>
      ) : null}
    </>
  );
}
