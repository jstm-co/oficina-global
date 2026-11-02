// Botones y paneles «Avisos» y «Voces» (design-spec de JST-95 §6, §7 y §8),
// subtítulo de la voz, «Te esperan» del widget (§9) y piezas del TV (§10).
// 0.6.0 (design-spec de JST-225, A · Dos listas): «Voces» suma el grupo «La
// oficina» (qué más se lee en voz alta) y pliega «Cómo se presentan y más»; el
// botón lleva un punto violeta hasta que se abre el panel.
// Los ajustes están en `ajustes.ts`, el sonido y las voces en `sonido.ts`, los
// textos en `src/avisos.ts`. Nada de esto lee ni escribe en Paperclip: los
// avisos los da la vigía (`vigia.ts`) y los ajustes quedan en el navegador.
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type AnchorHTMLAttributes, type KeyboardEvent, type ReactNode } from "react";
import { usePluginToast } from "@paperclipai/plugin-sdk/ui";
import { bannerTv, cuerpoAviso, MUESTRA_PREGUNTA, MUESTRA_VOZ, nombreCorto, PIDE_MUESTRA, TEXTO_MUESTRA, textoVoz, TTL_AVISO, type DetalleVoz, type Frase, type Llegada, type Presentacion } from "../avisos.js";
import { comparar } from "../lista.js";
import { chipDe } from "../responder.js";
import { PAGE_ROUTE } from "../shared.js";
import { vozDeAgente, vozPorId } from "../voces.js";
import { hace, type AgenteVista } from "../vista.js";
import { cambiarAjustes, conDetalle, puntoVoces, useAjustes, type TipoLeer } from "./ajustes.js";
import { Capa, useEsc } from "./capas.js";
import { CajaPersonaje, cx, EtiquetaEmpresa, Icono, Personaje } from "./piso.js";
import { cargarIndice, useIndiceVoces, useVocesSinGenerar } from "./audiosVoces.js";
import { desbloquearAudio, probarVoz, probarVozDetalle, tocarCampana, useHayVoces, useSubtitulo } from "./sonido.js";
import { abrirPanelVoces } from "./eleccion.js";
import { useEstadoVozViva } from "./vozViva.js";
import { PaginaAgentes, QuienHabla } from "./vocesElegir.js";

// ---------------------------------------------------------------------------
// Piezas comunes
// ---------------------------------------------------------------------------

/** Interruptor de 34×20 (§6), violeta encendido. */
export function Interruptor({ on, etiqueta, onCambiar }: { on: boolean; etiqueta: string; onCambiar: (on: boolean) => void }) {
  return (
    <button type="button" className="of-sw" role="switch" aria-checked={on} aria-label={etiqueta} onClick={() => onCambiar(!on)}>
      <i />
    </button>
  );
}

/** El que espera hace más (el ejemplo de los paneles, con datos reales). */
function primeroQueEspera(agentes: readonly AgenteVista[]): AgenteVista | null {
  return [...agentes].filter((a) => a.need).sort(comparar)[0] ?? null;
}

/** Prefijo de la página abierta: los enlaces del aviso van a esa empresa. */
function prefijoActual(respaldo: string): string {
  const primero = typeof location !== "undefined" ? location.pathname.split("/").filter(Boolean)[0] : undefined;
  return primero && !primero.startsWith("_") ? decodeURIComponent(primero) : respaldo;
}

// ---------------------------------------------------------------------------
// Aviso del sistema: en qué estado está el permiso (§7)
// ---------------------------------------------------------------------------

type EstadoSistema = "http" | "permitir" | "preguntando" | "permitido" | "bloqueado" | "sin-api";

/** Sin `Notification` (iPhone) no hay; con http (como hoy) el navegador no deja; con https, según el permiso. */
function estadoSistema(preguntando: boolean): EstadoSistema {
  if (typeof window === "undefined" || !("Notification" in window)) return "sin-api";
  if (!window.isSecureContext) return "http";
  if (preguntando) return "preguntando";
  const p = Notification.permission;
  return p === "granted" ? "permitido" : p === "denied" ? "bloqueado" : "permitir";
}

function FilaSistema({ estado, onPermitir }: { estado: EstadoSistema; onPermitir: () => void }) {
  let st: ReactNode;
  let nota: ReactNode = null;
  switch (estado) {
    case "permitir":
      st = (
        <button type="button" className="of-btn is-xs" onClick={onPermitir}>
          Permitir…
        </button>
      );
      break;
    case "preguntando":
      st = (
        <span className="of-avp-st is-wait">
          <Icono nombre="loader" tam={12} className="of-spin" />
          Responde al navegador
        </span>
      );
      break;
    case "permitido":
      st = (
        <span className="of-avp-st is-ok">
          <Icono nombre="check" tam={12} />
          Permitido
        </span>
      );
      break;
    case "bloqueado":
      st = <span className="of-avp-st is-warn">Bloqueado</span>;
      nota = (
        <div className="of-avp-note is-box">
          <Icono nombre="bell-off" tam={12} />
          <span>
            Lo bloqueaste en este navegador. Para permitirlo: <b>Chrome</b>, el ícono <Icono nombre="settings-2" tam={12} /> junto a la dirección → Notificaciones → Permitir. <b>Safari</b>: Configuración → Sitios web → Notificaciones. Después, recarga.
          </span>
        </div>
      );
      break;
    case "sin-api":
      st = <span className="of-avp-st is-off">No disponible</span>;
      nota = (
        <div className="of-avp-note is-box">
          <Icono nombre="smartphone" tam={12} />
          <span>
            En el iPhone, Safari no deja que una página muestre avisos del sistema. El aviso sale dentro de Paperclip, con la página abierta. Con el teléfono bloqueado, te avisa <b>Telegram</b>.
          </span>
        </div>
      );
      break;
    default:
      st = <span className="of-avp-st is-off">No disponible</span>;
      nota = (
        <div className="of-avp-note is-box">
          <Icono nombre="lock-keyhole" tam={12} />
          <span>
            Paperclip se abre con <b>http://</b>, sin candado, y el navegador solo permite avisos del sistema con <b>https://</b>. Si algún día se publica con https (por ejemplo, con una red privada), aquí aparece el botón para permitirlos.
          </span>
        </div>
      );
  }
  return (
    <>
      <div className="of-avp-row">
        <span className="of-avp-l">
          <Icono nombre="monitor" tam={14} />
          <span>
            <b>Aviso del sistema</b>
            <em>Aunque el navegador esté minimizado.</em>
          </span>
        </span>
        {st}
      </div>
      {nota}
    </>
  );
}

// ---------------------------------------------------------------------------
// Panel «Avisos» (§7)
// ---------------------------------------------------------------------------

/** El ejemplo del aviso de Paperclip (abajo a la izquierda, celeste), con el que espera hace más. */
function EjemploAviso({ ejemplo }: { ejemplo: AgenteVista | null }) {
  const titulo = ejemplo ? `✋ ${nombreCorto(ejemplo.nombre)} (${ejemplo.empresa}) te necesita` : "✋ ‹Agente› (‹empresa›) te necesita";
  const cuerpo = ejemplo ? cuerpoAviso(ejemplo) : "‹Tipo› en ‹tarea›: lo que espera tu respuesta";
  return (
    <div className="of-hst" aria-hidden="true">
      <span className="of-hst-dot" />
      <div className="of-hst-tx">
        <div className="of-hst-ti">{titulo}</div>
        <div className="of-hst-b">{cuerpo}</div>
        <span className="of-hst-a">Responder</span>
      </div>
    </div>
  );
}

function PanelAvisos({ agentes }: { agentes: readonly AgenteVista[] }) {
  const aj = useAjustes();
  const toast = usePluginToast();
  const [preguntando, setPreguntando] = useState(false);
  const [, setVuelta] = useState(0);
  const ejemplo = primeroQueEspera(agentes);
  const sistema = estadoSistema(preguntando);

  const permitir = () => {
    setPreguntando(true);
    // Desde el mismo clic: el navegador solo pregunta si viene de un toque.
    void Promise.resolve(Notification.requestPermission())
      .catch(() => undefined)
      .finally(() => {
        setPreguntando(false);
        setVuelta((v) => v + 1);
      });
  };
  const activar = () => {
    cambiarAjustes({ avisos: true });
    if (aj.sonido) tocarCampana(true);
  };
  const probar = () => {
    if (aj.sonido) tocarCampana(true);
    const prefijo = prefijoActual(ejemplo?.prefijo ?? "");
    const base = `/${encodeURIComponent(prefijo)}/${PAGE_ROUTE}`;
    toast({
      id: "oficina:prueba",
      title: ejemplo ? `✋ ${nombreCorto(ejemplo.nombre)} (${ejemplo.empresa}) te necesita` : "✋ Así se ve el aviso",
      body: ejemplo ? cuerpoAviso(ejemplo) : "Cuando un agente empiece a necesitarte, sale aquí.",
      tone: "info",
      ttlMs: TTL_AVISO,
      action: ejemplo ? { label: "Responder", href: `${base}?responder=${encodeURIComponent(ejemplo.id)}` } : { label: "Ver en la Oficina", href: `${base}?hl=toca` },
    });
  };

  return (
    <div className="of-avp">
      <div className="of-avp-h">
        <Icono nombre={aj.avisos ? "bell-ring" : "bell"} tam={14} />
        <b>Avisos cuando alguien te necesita</b>
        <span className="of-sp" />
        <Interruptor on={aj.avisos} etiqueta="Avisos" onCambiar={(on) => cambiarAjustes({ avisos: on })} />
      </div>
      <p>
        Te aviso cuando un agente <b>empieza</b> a necesitarte. Al abrir la página no avisa de lo que ya esperaba. Así se ve:
      </p>
      <EjemploAviso ejemplo={ejemplo} />
      <div className={cx("of-avp-ch", !aj.avisos && "is-off")}>
        <div className="of-avp-row">
          <span className="of-avp-l">
            <Icono nombre="layout-grid" tam={14} />
            <span>
              <b>Dentro de Paperclip</b>
              <em>El aviso de Paperclip abajo a la izquierda (15 s) y ✋ N junto a «Oficina global» en el menú, en cualquier página.</em>
            </span>
          </span>
          <span className="of-avp-st is-ok">
            <Icono nombre="check" tam={12} />
            Siempre
          </span>
        </div>
        <div className="of-avp-row">
          <span className="of-avp-l">
            <Icono nombre={aj.sonido ? "volume-2" : "volume-x"} tam={14} />
            <span>
              <b>Sonido</b>
              <em>Campanita de 0,9 s, propia de la Oficina</em>
            </span>
          </span>
          <button type="button" className="of-btn is-xs" onClick={() => tocarCampana(true)}>
            <Icono nombre="play" tam={12} />
            Escuchar
          </button>
          <Interruptor on={aj.sonido} etiqueta="Sonido" onCambiar={(on) => cambiarAjustes({ sonido: on })} />
        </div>
        <FilaSistema estado={sistema} onPermitir={permitir} />
      </div>
      {aj.avisos ? (
        <div className="of-avp-note">
          <Icono nombre="info" tam={12} />
          <span>Con varias pestañas abiertas, avisa una sola. Al abrir o recargar Paperclip, el sonido empieza con tu primer clic.</span>
          <span className="of-sp" />
          <button type="button" className="of-btn is-xs" onClick={probar}>
            Probar
          </button>
        </div>
      ) : (
        <>
          <button type="button" className="of-btn is-toca is-wide" onClick={activar}>
            <Icono nombre="bell" tam={14} />
            Activar avisos
          </button>
          <div className="of-avp-note">
            <Icono nombre="info" tam={12} />
            <span>Se guarda en este navegador.</span>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel «Voces» (§8)
// ---------------------------------------------------------------------------

/** Las 4 frases y, en su misma fila (0.5.0, JST-163), el interruptor chico de «y de qué se trata»: la pregunta (0.8.0), la tarea o el motivo. */
const FRASES_PANEL: ReadonlyArray<{ k: Frase; texto: string; pista: string | null; det: string }> = [
  { k: "toca", texto: "Te necesito", pista: null, det: "la pregunta" },
  { k: "error", texto: "Tengo un error", pista: null, det: "el motivo" },
  { k: "fin", texto: "Terminé", pista: "Cuando su tarea pasa a revisión o a terminada", det: "la tarea" },
  { k: "emp", texto: "Empecé", pista: "Cuando toma una tarea nueva · pasa seguido", det: "la tarea" },
];
const ORDEN_EJEMPLO: readonly Frase[] = ["toca", "error", "fin", "emp"];

const PRESENTACIONES: ReadonlyArray<{ k: Presentacion; texto: string }> = [
  { k: "nombre-empresa", texto: "Nombre y empresa" },
  { k: "nombre", texto: "Solo el nombre" },
  { k: "frase", texto: "Solo la frase" },
];

/** Lo de la oficina que se puede leer (JST-225 §1.2): el nombre, el ejemplo de la derecha y el tooltip de la fila. */
const TIPOS_PANEL: ReadonlyArray<{ k: TipoLeer; texto: string; ejemplo: string; tip: string }> = [
  { k: "charlas", texto: "Conversaciones del descanso", ejemplo: "«¿Fue difícil?»", tip: "Pregunta y respuesta, cada uno con su voz. Se oye una por minuto como mucho; las demás se ven sin voz." },
  { k: "entregas", texto: "Entregas de tareas", ejemplo: "«QA, te paso…»", tip: "En la mesa («te paso…» y «¡dale!») o con el sobre." },
  { k: "mascotas", texto: "Mascotas", ejemplo: "«¡Miau!»", tip: "Cuando las tocas. En el TV despiertan solas: una cada 5 min como mucho." },
  { k: "sueltas", texto: "Frases sueltas", ejemplo: "«Un cafecito»", tip: "Quien está solo en el descanso, cuando nadie conversa: una por minuto como mucho." },
  { k: "hora", texto: "Hora estimada", ejemplo: "«A las 15:40»", tip: "Una vez por tarea, cuando aparece en su globo." },
];

/** El grupo «La oficina»: una casilla por tipo. Lo que está oculto con los botones del encabezado se ve al 50 % y se puede cambiar igual. */
function FilasOficina() {
  const aj = useAjustes();
  return (
    <div className="of-vz-list" role="group" aria-label="La oficina">
      {TIPOS_PANEL.map((t) => {
        const on = aj.leer[t.k];
        const oculta = ((t.k === "charlas" || t.k === "sueltas") && !aj.charlas) || (t.k === "mascotas" && !aj.mascotas);
        const tip = oculta ? `Están ocultas: muéstralas con «${t.k === "mascotas" ? "Mascotas" : "Conversaciones"}» arriba` : t.tip;
        return (
          <div key={t.k} className={cx("of-vz-fila of-vz-tf", on && "is-on", oculta && "is-oculta")} title={tip}>
            <button type="button" role="checkbox" aria-checked={on} className={cx("of-vz-ev", on && "is-on")} onClick={() => cambiarAjustes({ leer: { ...aj.leer, [t.k]: !on } })}>
              <span className="of-vz-mk">{on ? <Icono nombre="check" tam={12} /> : null}</span>
              <span>
                <b>{t.texto}</b>
              </span>
            </button>
            <span className="of-vz-ej">{t.ejemplo}</span>
          </div>
        );
      })}
    </div>
  );
}

function PanelVoces({ agentes }: { agentes: readonly AgenteVista[] }) {
  // 0.11.0 (JST-325): «Cada agente ›» abre una página dentro del mismo panel.
  const [pagina, setPagina] = useState<"voces" | "agentes">("voces");
  const aj = useAjustes();
  const hayVoces = useHayVoces();
  const ejemplo = primeroQueEspera(agentes) ?? agentes[0] ?? null;
  // 0.5.0 (JST-163): si en esta Mac se pueden preparar las frases con la tarea (`uv` y `ffmpeg`, en el worker).
  const vivo = useEstadoVozViva(ejemplo?.companyId ?? agentes[0]?.companyId ?? null, true);
  const sinMac = vivo?.disponible === false;
  const companyId = ejemplo?.companyId ?? agentes[0]?.companyId ?? null;
  // Lo elegido y lo que se está grabando, al abrir el panel.
  useEffect(() => {
    if (companyId) void abrirPanelVoces(companyId);
  }, [companyId]);
  // El ejemplo (y «Probar»): el primero que te espera, con «terminé» si está prendida (si no, la primera prendida), y su
  // detalle si está prendido. La tarea es una muestra fija; la pregunta (0.8.0), «¿Instalo la versión nueva ahora?»; el motivo, «límite de uso».
  const fraseEj: Frase = aj.frases.fin ? "fin" : (ORDEN_EJEMPLO.find((f) => aj.frases[f]) ?? "fin");
  const corto = ejemplo ? nombreCorto(ejemplo.nombre) : "Líder técnico";
  const empresa = ejemplo?.empresa ?? "Betalandia";
  const conDet = conDetalle(aj, fraseEj) && (fraseEj === "error" || !sinMac);
  const base = textoVoz(corto, empresa, fraseEj, aj.presentacion);
  const detalleEj: DetalleVoz = fraseEj === "error" ? { motivo: MUESTRA_VOZ.motivo } : fraseEj === "toca" ? { pide: PIDE_MUESTRA } : { tarea: MUESTRA_VOZ.tarea };
  const frase = conDet ? textoVoz(corto, empresa, fraseEj, aj.presentacion, detalleEj) : base;
  // Qué voz tiene el del ejemplo: del índice de los audios, que se lee solo con las voces encendidas.
  const indice = useIndiceVoces();
  const sinGenerar = useVocesSinGenerar();
  useEffect(() => {
    if (aj.voces) void cargarIndice();
  }, [aj.voces]);
  const voz = indice && aj.voces ? vozPorId(vozDeAgente(indice, ejemplo?.id ?? null)) : null;
  const probar = () => {
    const agente = ejemplo ? { id: ejemplo.id, corto: nombreCorto(ejemplo.nombre), empresa: ejemplo.empresa, aspecto: ejemplo.aspecto } : null;
    if (!conDet) probarVoz(frase, agente);
    // El motivo va dentro de la frase grabada; la tarea y la pregunta, en la muestra que sigue a la frase de siempre.
    else if (fraseEj === "error") probarVozDetalle(frase, [frase], agente);
    else probarVozDetalle(frase, [base, fraseEj === "toca" ? MUESTRA_PREGUNTA : TEXTO_MUESTRA], agente);
  };

  if (pagina === "agentes" && companyId) return <PaginaAgentes agentes={agentes} companyId={companyId} sinMac={sinMac} onVolver={() => setPagina("voces")} />;
  return (
    <div className={cx("of-avp of-vzp", !aj.voces && "is-apagadas")}>
      <div className="of-avp-h">
        <Icono nombre={aj.voces ? "volume-2" : "volume-x"} tam={14} />
        <b>Voces</b>
        <span className="of-sp" />
        <Interruptor on={aj.voces} etiqueta="Voces" onCambiar={(on) => cambiarAjustes({ voces: on })} />
      </div>
      <p>
        Cada agente lo dice en voz alta, con su propia voz. Por ejemplo{voz ? ` (${voz.nombre})` : ""}: <b>«{frase}»</b>
      </p>
      {/* Sin el generador, el panel no tiene qué voz le toca a cada uno y las listas quedan cargando. */}
      {aj.voces && sinGenerar ? (
        <div className="of-avp-note is-box">
          <Icono nombre="info" tam={12} />
          <span>
            Todavía no hay audios en este Paperclip: se graban una vez, en el computador donde corre, con <b>npm run voces</b> en la carpeta del plugin (ver «Voces» en el README). Mientras, {hayVoces ? "habla la voz del navegador" : "solo se ve el subtítulo"}.
          </span>
        </div>
      ) : null}
      <QuienHabla agentes={agentes} companyId={companyId} onAgentes={() => setPagina("agentes")} />
      <div className="of-vz-cab" aria-hidden="true">
        <span>Avisos</span>
        <span>Y de qué se trata</span>
      </div>
      <div className="of-vz-list" role="group" aria-label="Qué dicen y de qué se trata">
        {FRASES_PANEL.map((f) => {
          const on = aj.frases[f.k];
          const d = aj.detalle[f.k];
          // «La tarea» y «la pregunta» necesitan que el worker prepare la frase; «el motivo» se graba al instalar.
          const noMac = sinMac && f.k !== "error";
          const habil = on && !noMac;
          const tip = noMac ? `No disponible en esta Mac${vivo?.motivo ? `: ${vivo.motivo}` : ""}` : on ? `Que diga también ${f.det}` : `Prende «${f.texto}» para elegir esto`;
          return (
            <div key={f.k} className={cx("of-vz-fila", on && "is-on")}>
              <label className={cx("of-vz-ev", on && "is-on")}>
                <input type="checkbox" checked={on} onChange={() => cambiarAjustes({ frases: { ...aj.frases, [f.k]: !on } })} />
                <span className="of-vz-mk">{on ? <Icono nombre="check" tam={12} /> : null}</span>
                <span>
                  <b>«{f.texto}»</b>
                  {f.pista ? <em>{f.pista}</em> : null}
                </span>
              </label>
              <button
                type="button"
                role="switch"
                className={cx("of-vz-det", d && !noMac && "is-on")}
                aria-checked={d && !noMac}
                aria-label={`«${f.texto}» y de qué se trata: ${f.det}`}
                title={tip}
                disabled={!habil}
                onClick={() => cambiarAjustes({ detalle: { ...aj.detalle, [f.k]: !d } })}
              >
                <span className="of-vz-swm" aria-hidden="true">
                  <i />
                </span>
                <span>{noMac ? "no disponible" : f.det}</span>
              </button>
            </div>
          );
        })}
      </div>
      {/* 0.6.0 (JST-225 §1.2): lo de la oficina que también se lee, con un ejemplo a la derecha. */}
      <div className="of-vz-cab is-of" aria-hidden="true">
        <span>La oficina</span>
        <span>Por ejemplo</span>
      </div>
      <FilasOficina />
      <div className="of-avp-row">
        <span className="of-avp-l">
          <Icono nombre="volume-2" tam={14} />
          <span>
            <b>9 voces: Lorenzo, Catalina, Alex, Dora, Santa y 4 clones chilenos</b>
            <em>{hayVoces ? "Una para cada agente, que puedes cambiar arriba · si falta su audio, esa vez habla la del navegador" : "Una para cada agente, que puedes cambiar arriba · si falta su audio, esa vez solo se verá el subtítulo"}</em>
          </span>
        </span>
        <button type="button" className="of-btn is-xs" onClick={probar}>
          <Icono nombre="play" tam={12} />
          Probar
        </button>
      </div>
      {/* «Cómo se presentan y más», plegado (recuerda si lo dejaste abierto): adentro, la presentación y la nota. */}
      <button type="button" className="of-vz-mas" aria-expanded={aj.vozMas} onClick={() => cambiarAjustes({ vozMas: !aj.vozMas })}>
        <Icono nombre={aj.vozMas ? "chevron-down" : "chevron-right"} tam={14} />
        Cómo se presentan y más
      </button>
      {aj.vozMas ? <MasVoces sinMac={sinMac} motivo={vivo?.motivo ?? null} /> : null}
    </div>
  );
}

/** Lo que va dentro de «Cómo se presentan y más»: la presentación de hoy y la nota (JST-225 §1.4 y §1.5). */
function MasVoces({ sinMac, motivo }: { sinMac: boolean; motivo: string | null }) {
  const aj = useAjustes();
  return (
    <>
      <div className="of-vz-fmt">
        <span className="of-vz-k" id="of-vz-k">
          Cómo se presentan
        </span>
        <div className="of-seg" role="group" aria-labelledby="of-vz-k">
          {PRESENTACIONES.map((p) => (
            <button key={p.k} type="button" aria-pressed={aj.presentacion === p.k} onClick={() => cambiarAjustes({ presentacion: p.k })}>
              {p.texto}
            </button>
          ))}
        </div>
      </div>
      <div className="of-avp-note">
        <Icono nombre="info" tam={12} />
        <span>
          Habla uno por vez y los avisos pasan primero. Se oye una conversación por minuto como mucho; las demás, y lo que llega mientras alguien habla, se ven sin voz. «✓ listo» y la mano con su tarea van con «Terminé» y «Te necesito». Al abrir o recargar Paperclip, empiezan con tu primer clic. Voces clonadas a partir de Google Crowdsourced Chilean Spanish (OpenSLR 71), CC BY-SA 4.0.
          <br />
          <b>De qué se trata:</b> «Terminé» y «Empecé» dicen la tarea, que se prepara con su voz cuando empieza. «Te necesito» dice la pregunta (o qué hay que aprobar o revisar), que se prepara cuando levanta la mano y se espera hasta 30 s; si no alcanza, dice la tarea. Si no alcanza ninguna, dice solo la frase. Una tarea que pasa a revisión con una pregunta para ti dice «Te necesito», no «Terminé». Los resúmenes no lo dicen. Lorenzo y Catalina lo piden a Microsoft (va el nombre de la tarea o la pregunta).
          {sinMac ? (
            <>
              <br />
              «La tarea» y «la pregunta» no están disponibles en esta Mac{motivo ? ` (${motivo})` : ""}: se oye la frase sola.
            </>
          ) : null}
        </span>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Botones del encabezado (§6)
// ---------------------------------------------------------------------------

type Panel = "avisos" | "voces";

/** Los menús del encabezado: uno abierto a la vez (0.7.0, JST-231 §3: abrir «Conversaciones» cierra «Voces» y al revés). 0.9.0: también «Resumen». */
export type MenuEncabezado = Panel | "charlas" | "resumen";
let menuAbierto: MenuEncabezado | null = null;
const oyentesMenu = new Set<() => void>();

export function abrirMenu(m: MenuEncabezado | null): void {
  if (m === menuAbierto) return;
  menuAbierto = m;
  for (const o of oyentesMenu) o();
}

export function useMenuAbierto(): MenuEncabezado | null {
  return useSyncExternalStore(
    (o) => {
      oyentesMenu.add(o);
      return () => oyentesMenu.delete(o);
    },
    () => menuAbierto,
  );
}

/**
 * Popover de 364 px: 8 px bajo el botón, con su borde derecho alineado al del botón y a ≥ 12 px de los bordes.
 * El de «Voces» (0.5.0, JST-163) mide 392 y va a 6 px: suma la columna «Y de qué se trata». El de «Conversaciones»
 * (0.7.0, JST-231 §3), 360 a 6 px.
 */
export function Popover({ ancla, onCerrar, botones, children, voces = false, charlas = false, resumen = false }: { ancla: HTMLElement | null; onCerrar: () => void; botones: HTMLElement | null; children: ReactNode; voces?: boolean; charlas?: boolean; resumen?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ubicar = () => {
      const r = ancla?.getBoundingClientRect();
      if (!r) return;
      const w = el.offsetWidth;
      const left = Math.max(12, Math.min(innerWidth - w - 12, r.right - w));
      const top = r.bottom + (voces || charlas || resumen ? 6 : 8);
      setPos((p) => (p && p.left === left && p.top === top ? p : { left, top }));
    };
    ubicar();
    window.addEventListener("resize", ubicar);
    window.addEventListener("scroll", ubicar, true);
    return () => {
      window.removeEventListener("resize", ubicar);
      window.removeEventListener("scroll", ubicar, true);
    };
  }, [ancla, voces, charlas, resumen]);
  useEffect(() => {
    // Tocar afuera cierra (tocar otra vez el botón lo maneja el botón).
    const fuera = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || botones?.contains(t)) return;
      onCerrar();
    };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, [botones, onCerrar]);
  return (
    <div ref={ref} className={cx("of-hpop", voces && "is-voces", charlas && "is-charlas", resumen && "is-resumen")} role="dialog" aria-label={charlas ? "Conversaciones" : resumen ? "Resumen" : undefined} style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0 }}>
      {children}
    </div>
  );
}

/** Encabezado de la página: en computador, «🔔 Avisos» y «🔇 Voces» con texto (a la izquierda de «Modo TV»); en el celular, 2 íconos de 28 px. Cada uno abre su panel (popover de 364 px u hoja inferior). */
export function BotonesAvisos({ celular, agentes, rm: _rm }: {
  celular: boolean;
  /** Para el ejemplo del panel: el que espera hace más (datos reales). */
  agentes: readonly AgenteVista[];
  rm: boolean;
}): ReactNode {
  const aj = useAjustes();
  // 0.7.0: el menú abierto es uno para todo el encabezado (abrir «Conversaciones» cierra este y al revés).
  const menu = useMenuAbierto();
  const abierto: Panel | null = menu === "avisos" || menu === "voces" ? menu : null;
  const setAbierto = (p: Panel | null) => abrirMenu(p);
  const grupo = useRef<HTMLSpanElement>(null);
  const bAvisos = useRef<HTMLButtonElement>(null);
  const bVoces = useRef<HTMLButtonElement>(null);
  const cerrar = () => setAbierto(null);
  const alternar = (p: Panel) => setAbierto(abierto === p ? null : p);
  // 0.6.0 (JST-225 §6): al abrir «Voces» una vez, se apaga su punto violeta.
  useEffect(() => {
    if (abierto === "voces" && !aj.vistoLeer) cambiarAjustes({ vistoLeer: true });
  }, [abierto, aj.vistoLeer]);
  useEsc(abierto !== null, () => {
    const b = abierto === "voces" ? bVoces.current : bAvisos.current;
    setAbierto(null);
    b?.focus();
  });

  const sistema = aj.avisos && estadoSistema(false) === "permitido";
  const tAvisos = aj.avisos ? `Avisos activados dentro de Paperclip${sistema ? ", también del sistema" : ""}` : "Activar avisos cuando alguien te necesite";
  const tVoces = aj.voces ? "Voces activadas" : "Voces apagadas";
  const iAvisos = aj.avisos ? "bell-ring" : "bell";
  const iVoces = aj.voces ? "volume-2" : "volume-x";
  const punto = aj.avisos ? null : <span className="of-hdot" />;
  const puntoVz = puntoVoces(aj) ? <span className="of-hdot" /> : null;

  const botones = celular ? (
    <>
      <button ref={bAvisos} type="button" className={cx("of-ibtn of-hbtn", aj.avisos && "is-on", abierto === "avisos" && "is-open")} aria-label={tAvisos} title={tAvisos} aria-expanded={abierto === "avisos"} onClick={() => alternar("avisos")}>
        <Icono nombre={iAvisos} tam={14} />
        {punto}
      </button>
      <button ref={bVoces} type="button" className={cx("of-ibtn of-hbtn", aj.voces && "is-on", abierto === "voces" && "is-open")} aria-label={tVoces} title={tVoces} aria-expanded={abierto === "voces"} onClick={() => alternar("voces")}>
        <Icono nombre={iVoces} tam={14} />
        {puntoVz}
      </button>
    </>
  ) : (
    <>
      <button ref={bAvisos} type="button" className={cx("of-btn is-sm of-hbtn", aj.avisos && "is-on", abierto === "avisos" && "is-open")} title={tAvisos} aria-expanded={abierto === "avisos"} onClick={() => alternar("avisos")}>
        <Icono nombre={iAvisos} tam={14} />
        Avisos
        {punto}
      </button>
      <button ref={bVoces} type="button" className={cx("of-btn is-sm of-hbtn", aj.voces && "is-on", abierto === "voces" && "is-open")} title={tVoces} aria-expanded={abierto === "voces"} onClick={() => alternar("voces")}>
        <Icono nombre={iVoces} tam={14} />
        Voces
        {puntoVz}
      </button>
    </>
  );

  const contenido = abierto === "avisos" ? <PanelAvisos agentes={agentes} /> : abierto === "voces" ? <PanelVoces agentes={agentes} /> : null;
  return (
    <span ref={grupo} className={cx("of-hbtns", celular && "is-m")}>
      {botones}
      {contenido ? (
        <Capa>
          {celular ? (
            <>
              <div className="of-sheet-bg" onClick={cerrar} />
              <div className="of-sheet of-hsheet" role="dialog" aria-label={abierto === "avisos" ? "Avisos" : "Voces"}>
                <div className="of-grab" />
                <div className="of-hsheet-b">{contenido}</div>
              </div>
            </>
          ) : (
            <Popover ancla={abierto === "voces" ? bVoces.current : bAvisos.current} botones={grupo.current} onCerrar={cerrar} voces={abierto === "voces"}>
              {contenido}
            </Popover>
          )}
        </Capa>
      ) : null}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Subtítulo de la voz (§8)
// ---------------------------------------------------------------------------

/** Subtítulo de la voz, abajo al centro (página y TV), mientras habla (`useSubtitulo`). `agentes`: para la cabeza del personaje. */
export function SubtituloVoz({ agentes, rm }: { agentes: readonly AgenteVista[]; rm: boolean }): ReactNode {
  const s = useSubtitulo();
  const indice = useIndiceVoces();
  if (!s) return null;
  const a = s.agenteId ? agentes.find((x) => x.id === s.agenteId) : undefined;
  const aspecto = a?.aspecto ?? s.aspecto;
  // 0.11.0 (JST-325 §1.6): los avisos juntos («3 agentes te necesitan.») no tienen cabeza: el subtítulo dice quién los lee.
  const lee = !s.agenteId && !aspecto && indice && /^\d+ agentes /.test(s.texto) ? vozPorId(indice.resumen) : null;
  return (
    <div className={cx("of-subt", rm && "is-rm")} role="status">
      <Icono nombre="volume-2" tam={14} />
      {lee ? <span className="vz-subt-voz">Resumen · {lee.nombre}</span> : null}
      {aspecto ? (
        <span className="of-subt-c" aria-hidden="true">
          <Personaje aspecto={aspecto} anim="parado" x={0} y={0} quieto />
        </span>
      ) : null}
      <b>{s.texto}</b>
    </div>
  );
}

// ---------------------------------------------------------------------------
// «Te esperan» del widget (§9)
// ---------------------------------------------------------------------------

/** «Te esperan» bajo el piso del widget: los 3 que esperan hace más. Nada si nadie espera o si está cargando. */
export function TeEsperan({ agentes, cargando, celular, hrefMas, onResponder, enlaceMas }: {
  agentes: readonly AgenteVista[];
  cargando: boolean;
  celular: boolean;
  /** «y 3 más →»: la página con `?hl=toca`. */
  hrefMas: string;
  /** Computador: abre la ventana sobre el Dashboard. Celular: navega a la página con `?responder=`. */
  onResponder: (agenteId: string) => void;
  /** Props del enlace «y N más» (navegación del host); si no, `href` plano. */
  enlaceMas?: AnchorHTMLAttributes<HTMLAnchorElement>;
}): ReactNode {
  const esperan = agentes.filter((a) => a.need).sort(comparar);
  if (cargando || esperan.length === 0) return null;
  const tecla = (id: string) => (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onResponder(id);
    }
  };
  return (
    <div className="of-wl">
      <div className="of-wl-h">
        <Icono nombre="hand" tam={12} />
        Te esperan
        <span className="of-sp" />
        {esperan.length > 3 ? (
          <a className="of-wlink" {...(enlaceMas ?? { href: hrefMas })}>
            y {esperan.length - 3} más
            <Icono nombre="arrow-right" tam={12} />
          </a>
        ) : null}
      </div>
      {esperan.slice(0, 3).map((a) => {
        const e = a.teNecesita[0]!;
        const corto = nombreCorto(a.nombre);
        return (
          <div key={a.id} className="of-wl-row" role="button" tabIndex={0} aria-label={`${a.nombre}, ${a.empresa}: te necesita. Responder`} onClick={() => onResponder(a.id)} onKeyDown={tecla(a.id)}>
            <CajaPersonaje agente={a} px={1} />
            <span className="of-wl-m">
              <span className="of-wl-n">
                <b>{corto}</b>
                <EtiquetaEmpresa prefijo={a.prefijo} />
              </span>
              <span className="of-wl-q">
                {e.identifier ? <span className="of-tid">{e.identifier}</span> : null}
                {e.titulo ?? chipDe(e).label}
              </span>
            </span>
            {celular ? (
              <Icono nombre="chevron-right" tam={14} />
            ) : (
              <span className="of-btn is-xs is-primary is-toca" aria-hidden="true">
                Responder
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TV (§10)
// ---------------------------------------------------------------------------

/** Banner violeta del TV (en el lugar reservado de 38 px): «Speckit, de Migo, te necesita.» + «hace X». */
export function BannerTocaTv({ llegada, desde, ahora }: { llegada: Llegada; desde: number; ahora: number }): ReactNode {
  const t = bannerTv(llegada);
  const cuando = ahora - desde < 60_000 ? "ahora" : hace(new Date(desde).toISOString(), ahora);
  return (
    <div className="of-banner is-toca" role="status">
      <Icono nombre="hand" tam={14} />
      <span>
        <b>{t.fuerte}</b> {t.resto}
      </span>
      <span className="of-sp" />
      <span className="of-tvb-ago">{cuando}</span>
    </div>
  );
}

/** Botones del TV abajo a la derecha: «🔔 Avisos» / «🔕 Avisos apagados» y «🔊 Voces» / «🔇 Voces apagadas»; encienden o apagan directo. */
export function BotonesTv(): ReactNode {
  const aj = useAjustes();
  // El toque también desbloquea el sonido y las voces (§10).
  const alternar = (cambio: { avisos?: boolean; voces?: boolean }) => {
    desbloquearAudio();
    cambiarAjustes(cambio);
  };
  return (
    <>
      <button type="button" className={cx("of-tvexit of-tvi", aj.avisos && "is-on")} title="Avisos y sonido" aria-pressed={aj.avisos} onClick={() => alternar({ avisos: !aj.avisos })}>
        <Icono nombre={aj.avisos ? "bell-ring" : "bell-off"} tam={14} />
        {aj.avisos ? "Avisos" : "Avisos apagados"}
      </button>
      <button type="button" className={cx("of-tvexit of-tvi", aj.voces && "is-on")} title="Voces" aria-pressed={aj.voces} onClick={() => alternar({ voces: !aj.voces })}>
        <Icono nombre={aj.voces ? "volume-2" : "volume-x"} tam={14} />
        {aj.voces ? "Voces" : "Voces apagadas"}
      </button>
    </>
  );
}
