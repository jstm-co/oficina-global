// «Conversaciones» (0.7.0, design-spec de JST-231, A · Menú en «Conversaciones»,
// con los textos que cambió la elección del spike de JST-230): el botón del
// encabezado ya no muestra u oculta con un clic, abre un menú como el de
// «Voces» con el interruptor de siempre (`charlas`), quién las escribe (la IA
// de Chrome o las frases de siempre) y el estado de la IA dentro de su tarjeta.
// En el botón, el estado: ✦ lista, «42 %» y una línea mientras baja, ⏸ en
// pausa, ⚠ si no se pudo bajar; y un punto violeta hasta abrir el menú la
// primera vez. En el celular, la hoja inferior, con la IA deshabilitada.
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { usePluginToast } from "@paperclipai/plugin-sdk/ui";
import type { EstadoIa } from "../ia/escritor.js";
import { cambiarAjustes, puntoIa, useAjustes } from "./ajustes.js";
import { Capa, useEsc } from "./capas.js";
import { bajarIa, escritorIa, IA_CHROME, NOMBRE_IA, useEstadoIa } from "./ia.js";
import { abrirMenu, Interruptor, Popover, useMenuAbierto } from "./paneles.js";
import { cx, Icono } from "./piso.js";

/** El avance en números: «42 %» (`null`: sin avance, Chrome baja sin que esta pestaña lo vea). */
const pct = (a: number | null) => (a === null ? null : Math.max(0, Math.min(100, Math.floor(a * 100))));

/** La IA no se puede elegir aquí (otro navegador, el celular, Chrome sin la IA o sin el flag de la dirección). */
const noDisponible = (e: EstadoIa) => e.k === "sin";

/** La barra de avance (§4): 6 px, sin brillo ni animación propia; con «reducir movimiento», salta. */
function Barra({ p }: { p: number }) {
  return (
    <span className="of-ia-bar" role="progressbar" aria-label={`Bajando la ${NOMBRE_IA}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={p}>
      <i style={{ width: `${p}%` }} />
    </span>
  );
}

/** El estado de la IA dentro de su tarjeta (§4), con su acción. */
function EstadoTarjeta({ e }: { e: EstadoIa }): ReactNode {
  const aj = useAjustes();
  const bajar = () => {
    if (aj.iaFuente === "hoy") cambiarAjustes({ iaFuente: "ia" });
    bajarIa();
  };
  switch (e.k) {
    case "revisando":
      return null;
    case "bajar":
      return (
        <div className="of-iaa-st is-col">
          <span>Chrome la baja una sola vez (unos 4&nbsp;GB). Mientras, van las frases de siempre.</span>
          <button type="button" className="of-btn is-xs is-primary" onClick={bajar}>
            <Icono nombre="download" tam={12} />
            Bajar la IA
          </button>
        </div>
      );
    case "bajando": {
      const p = pct(e.avance);
      return (
        <div className="of-iaa-st is-col">
          <span className="of-iaa-bt">
            <b>Bajando</b>
            {p === null ? null : <span className="of-ia-num">{p}&nbsp;%</span>}
          </span>
          {p === null ? <span>{IA_CHROME ? "Chrome sigue aunque cierres la pestaña." : "Sigue aunque cierres la Oficina."}</span> : <Barra p={p} />}
          <span>Puedes seguir usando la Oficina. Mientras, van las frases de siempre.</span>
        </div>
      );
    }
    case "lista":
      return (
        <div className="of-iaa-st">
          <Icono nombre="circle-check" tam={14} className="of-ia-ok" />
          <span>
            <b>Lista.</b> Gratis y nada sale de tu Mac.
          </span>
        </div>
      );
    case "pausa":
      return (
        <div className="of-iaa-st">
          <Icono nombre="circle-pause" tam={14} />
          <span>
            <b>En pausa:</b> la Mac está ocupada. Sigue sola cuando se libere.
          </span>
        </div>
      );
    case "fallo":
      return (
        <div className="of-iaa-st is-col">
          <span>
            <Icono nombre="triangle-alert" tam={14} className="of-ia-warn" />
            <b>No se pudo bajar.</b> Revisa que la Mac tenga espacio libre.
          </span>
          <button type="button" className="of-btn is-xs" onClick={bajar}>
            <Icono nombre="refresh" tam={12} />
            Reintentar
          </button>
        </div>
      );
    case "sin":
      return (
        <div className="of-iaa-st">
          <Icono nombre="ban" tam={14} />
          <span>{e.por === "insegura" ? "Falta permitir esta dirección en Chrome." : e.por === "otro" || e.por === "celular" ? "Solo funciona en Chrome del computador." : IA_CHROME ? "Este Chrome no la trae." : "Este computador no la tiene."}</span>
        </div>
      );
  }
}

/** El menú (§3): mostrar u ocultar, «Quién las escribe» con 2 tarjetas y la nota. */
function PanelConversaciones({ e, celular }: { e: EstadoIa; celular: boolean }) {
  const aj = useAjustes();
  const k = useId();
  const disp = !noDisponible(e);
  const elegidaIa = disp && aj.iaFuente === "ia";
  const bIa = useRef<HTMLButtonElement>(null);
  const bHoy = useRef<HTMLButtonElement>(null);
  const elegir = (f: "ia" | "hoy") => cambiarAjustes({ iaFuente: f });
  // Las flechas cambian de tarjeta, como un grupo de radios.
  const flechas = (ev: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(ev.key)) return;
    ev.preventDefault();
    if (!disp) return;
    const a = elegidaIa ? "hoy" : "ia";
    elegir(a);
    (a === "ia" ? bIa : bHoy).current?.focus();
  };
  return (
    <div className={cx("of-avp of-iaa", !aj.charlas && "is-ocultas")}>
      <div className="of-avp-h">
        <Icono nombre={aj.charlas ? "message-circle" : "message-circle-off"} tam={14} />
        <b>Conversaciones</b>
        <span className="of-sp" />
        <Interruptor on={aj.charlas} etiqueta="Mostrar las conversaciones" onCambiar={(on) => cambiarAjustes({ charlas: on })} />
      </div>
      <p>Pregunta y respuesta en el descanso, frases sueltas y lo que dicen las mascotas.</p>
      <span className="of-vz-k" id={k}>
        Quién las escribe
      </span>
      <div className="of-iaa-ops" role="radiogroup" aria-labelledby={k}>
        <div className={cx("of-iaa-op", elegidaIa && "is-on", !disp && "is-off")}>
          <button
            ref={bIa}
            type="button"
            className="of-iaa-r"
            role="radio"
            aria-checked={elegidaIa}
            aria-disabled={disp ? undefined : true}
            tabIndex={elegidaIa || !disp ? 0 : -1}
            onClick={disp ? () => elegir("ia") : undefined}
            onKeyDown={flechas}
          >
            <span className="of-iaa-rd" aria-hidden="true">
              <i />
            </span>
            <span className="of-iaa-tx">
              <b>
                <Icono nombre="sparkles" tam={14} />
                La {NOMBRE_IA}
              </b>
              <em>Con lo que pasa en la oficina, cambia cada 15&nbsp;min.</em>
              <span className="of-iaa-ej">«¡Bien hecho! ¿Otro café?»</span>
            </span>
          </button>
          <EstadoTarjeta e={e} />
        </div>
        <div className={cx("of-iaa-op", !elegidaIa && "is-on")}>
          <button ref={bHoy} type="button" className="of-iaa-r" role="radio" aria-checked={!elegidaIa} tabIndex={elegidaIa ? -1 : 0} onClick={() => elegir("hoy")} onKeyDown={flechas}>
            <span className="of-iaa-rd" aria-hidden="true">
              <i />
            </span>
            <span className="of-iaa-tx">
              <b>Frases de siempre</b>
              <em>{celular ? "Las de hoy." : "Las de hoy. Son las que van en el celular y la TV."}</em>
              <span className="of-iaa-ej">«¡Bien! ¿Fue complicado?»</span>
            </span>
          </button>
        </div>
      </div>
      <div className="of-avp-note">
        <Icono nombre="info" tam={12} />
        <span>
          Si la IA se demora o se equivoca en un dato, esa vez va la frase de siempre.
          {aj.charlas ? null : (
            <>
              {" "}
              <b>Ocultas:</b> no escribe nada.
            </>
          )}
        </span>
      </div>
    </div>
  );
}

/** Lo que va en el botón entre el texto y el chevron, y su tooltip (§2). */
function estadoBoton(charlas: boolean, fuente: "ia" | "hoy", e: EstadoIa): { extra: ReactNode; linea: ReactNode; tip: string } {
  if (!charlas) return { extra: null, linea: null, tip: "Conversaciones ocultas" };
  if (fuente === "hoy") return { extra: null, linea: null, tip: "Conversaciones · frases de siempre" };
  switch (e.k) {
    case "lista":
      return { extra: <Icono nombre="sparkles" tam={12} className="of-iaa-sp" />, linea: null, tip: `Conversaciones · las escribe la ${NOMBRE_IA}` };
    case "bajando": {
      const p = pct(e.avance);
      if (p === null) return { extra: null, linea: null, tip: `Conversaciones · ${NOMBRE_IA}: bajando` };
      return {
        extra: <span className="of-iaa-pc of-ia-num">{p}&nbsp;%</span>,
        linea: (
          <i className="of-iaa-bl" aria-hidden="true">
            <i style={{ width: `${p}%` }} />
          </i>
        ),
        tip: `Conversaciones · ${NOMBRE_IA}: bajando · ${p} %`,
      };
    }
    case "pausa":
      return { extra: <Icono nombre="circle-pause" tam={12} className="of-iaa-sp is-mut" />, linea: null, tip: `Conversaciones · ${NOMBRE_IA}: en pausa` };
    case "fallo":
      return { extra: <Icono nombre="triangle-alert" tam={12} className="of-iaa-sp of-ia-warn" />, linea: null, tip: `Conversaciones · ${NOMBRE_IA}: no se pudo bajar` };
    case "bajar":
      return { extra: null, linea: null, tip: `Conversaciones · ${NOMBRE_IA}: falta bajarla` };
    case "sin":
      return { extra: null, linea: null, tip: `Conversaciones · ${NOMBRE_IA}: no disponible` };
    case "revisando":
      return { extra: null, linea: null, tip: "Conversaciones" };
  }
}

/**
 * «Conversaciones» (§2): mismo lugar y estilo que hoy, entre «Mascotas» y «Modo
 * TV». Abre el menú; en el celular, solo el ícono y la hoja inferior.
 */
export function BotonConversaciones({ celular }: { celular: boolean }) {
  const aj = useAjustes();
  const e = useEstadoIa(!celular);
  const abierto = useMenuAbierto() === "charlas";
  const boton = useRef<HTMLButtonElement>(null);
  const grupo = useRef<HTMLSpanElement>(null);
  const toast = usePluginToast();
  const cerrar = () => abrirMenu(null);
  // §7: al abrir el menú la primera vez se apaga el punto violeta, para siempre.
  useEffect(() => {
    if (abierto && !aj.iaVisto) cambiarAjustes({ iaVisto: true });
  }, [abierto, aj.iaVisto]);
  // §4: al terminar la bajada pedida aquí, el toast de la página.
  useEffect(() => {
    if (celular) return;
    return escritorIa().alLista(() =>
      toast({ id: "oficina:ia-lista", title: `✦ La ${NOMBRE_IA} está lista.`, body: "Desde ahora escribe las conversaciones.", tone: "success", ttlMs: 8_000 }),
    );
  }, [celular, toast]);
  useEsc(abierto, () => {
    cerrar();
    boton.current?.focus();
  });
  const icono = aj.charlas ? "message-circle" : "message-circle-off";
  const { extra, linea, tip } = celular ? { extra: null, linea: null, tip: aj.charlas ? "Conversaciones" : "Conversaciones ocultas" } : estadoBoton(aj.charlas, aj.iaFuente, e);
  const punto = !celular && puntoIa(aj, e) ? <span className="of-hdot" /> : null;
  const panel = abierto ? <PanelConversaciones e={celular ? { k: "sin", por: "celular" } : e} celular={celular} /> : null;
  const alternar = () => abrirMenu(abierto ? null : "charlas");
  return (
    <span ref={grupo} className="of-iaw">
      {celular ? (
        <button
          ref={boton}
          type="button"
          className={cx("of-ibtn is-ghost of-petbtn of-chbtn is-m", !aj.charlas && "is-off", abierto && "is-open")}
          aria-haspopup="dialog"
          aria-expanded={abierto}
          aria-label={aj.charlas ? "Conversaciones" : "Conversaciones ocultas"}
          title={tip}
          onClick={alternar}
        >
          <Icono nombre={icono} tam={14} />
        </button>
      ) : (
        <button
          ref={boton}
          type="button"
          className={cx("of-btn is-sm of-petbtn of-chbtn of-hbtn of-iabtn", !aj.charlas && "is-off", abierto && "is-open")}
          aria-haspopup="dialog"
          aria-expanded={abierto}
          title={tip}
          onClick={alternar}
        >
          <Icono nombre={icono} tam={14} />
          {aj.charlas ? "Conversaciones" : "Conversaciones ocultas"}
          {extra}
          <Icono nombre={abierto ? "chevron-up" : "chevron-down"} tam={12} className="of-iaa-cv" />
          {linea}
          {punto}
        </button>
      )}
      {panel ? (
        <Capa>
          {celular ? (
            <>
              <div className="of-sheet-bg" onClick={cerrar} />
              <div className="of-sheet of-hsheet of-iasheet" role="dialog" aria-label="Conversaciones">
                <div className="of-grab" />
                <div className="of-hsheet-b">{panel}</div>
              </div>
            </>
          ) : (
            <Popover ancla={boton.current} botones={grupo.current} onCerrar={cerrar} charlas>
              {panel}
            </Popover>
          )}
        </Capa>
      ) : null}
    </span>
  );
}
