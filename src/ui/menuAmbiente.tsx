// «Ambiente» (JST-410): un solo botón del encabezado de computador que reúne «Voces», «Mascotas» y «Conversaciones»,
// que antes eran tres botones sueltos. Abre un menú de tres filas, cada una con su estado a la derecha. «Voces» y
// «Conversaciones» abren sus paneles de siempre (`PanelVoces`, `PanelConversaciones`) anclados a este botón, con el mismo
// menú abierto único de `paneles.tsx`; «Mascotas» es un interruptor que no cierra el menú. Abajo, «Decorado» (JST-416):
// Clásico, Madera o Repartidos, que se ve al instante, y «Por sala» (una fila por empresa); y los interruptores de la luz
// según la hora y de los adornos por fecha. En el celular (`celular`) es solo un ícono que abre una hoja inferior con lo mismo,
// sin las filas «Voces» y «Conversaciones» (esas ya tienen su botón en la barra de arriba): ahí se apagan el tinte y los adornos.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { msg, t } from "../i18n.js";
import { conEleccionDeEmpresa, DECORADOS, esDecorado, type EleccionDecorado } from "../decorado.js";
import { NIVELES, type Nivel } from "../nivel.js";
import type { AgenteVista } from "../vista.js";
import { cambiarAjustes, puntoIa, puntoVoces, useAjustes } from "./ajustes.js";
import { Capa, useEsc } from "./capas.js";
import { useEstadoIa } from "./ia.js";
import { PanelConversaciones, resumenConversaciones, useEfectosConversaciones } from "./menuConversaciones.js";
import { abrirMenu, PanelVoces, Popover, useMenuAbierto } from "./paneles.js";
import { cx, EtiquetaEmpresa, Icono } from "./piso.js";

/** JST-415: cuánto habla la oficina: el nombre de cada nivel y su línea de ayuda. */
const NOMBRE_NIVEL: Readonly<Record<Nivel, string>> = { tranquilo: msg("Tranquilo"), normal: msg("Normal"), conversador: msg("Conversador") };
const AYUDA_NIVEL: Readonly<Record<Nivel, string>> = {
  tranquilo: msg("Solo lo importante: «te necesito», errores y «terminé»."),
  normal: msg("Lo de siempre, más bloqueos, recordatorios de quien te espera, el resumen al volver y las rachas."),
  conversador: msg("Todo lo de Normal, con conversaciones y mascotas más seguidas."),
};

/** Lo que dicen las filas de «Voces» y «Mascotas» (la de «Conversaciones» sale de `resumenConversaciones`). */
export function estadoVoces(voces: boolean): string {
  return voces ? t("Activadas") : t("Apagadas");
}
export function estadoMascotas(mascotas: boolean): string {
  return mascotas ? t("Visibles") : t("Ocultas");
}

/** El nombre visible de lo que se elige en «Decorado» (en inglés: Classic, Wood, Mixed). */
export function nombreDecorado(e: EleccionDecorado): string {
  switch (e) {
    case "clasico":
      return t("Clásico");
    case "madera":
      return t("Madera");
    default:
      return t("Repartidos");
  }
}

const OPCIONES_DECORADO: readonly EleccionDecorado[] = [...DECORADOS.map((d) => d.id), "repartidos"];

/** Lo que dicen las filas de la luz (femenino) y de los adornos (masculino plural). */
export function estadoLuz(on: boolean): string {
  return on ? t("Encendida") : t("Apagada");
}
export function estadoAdornos(on: boolean): string {
  return on ? t("Encendidos") : t("Apagados");
}

export function BotonAmbiente({ agentes, empresas = [], celular = false }: { agentes: readonly AgenteVista[]; empresas?: ReadonlyArray<{ prefijo: string; nombre: string }>; celular?: boolean }) {
  const aj = useAjustes();
  const [porSala, setPorSala] = useState(false);
  const idPorSala = useId();
  const idDecorado = useId();
  const idNivel = useId();
  const e = useEstadoIa(true);
  const menu = useMenuAbierto();
  // En el celular «Voces» y «Conversaciones» abren desde sus propios botones: aquí solo cuenta «Ambiente».
  const abierto = menu === "ambiente" || (!celular && (menu === "voces" || menu === "charlas"));
  const boton = useRef<HTMLButtonElement>(null);
  const grupo = useRef<HTMLSpanElement>(null);
  const filas = useRef<HTMLDivElement>(null);
  const cerrar = () => abrirMenu(null);
  useEfectosConversaciones(!celular && menu === "charlas", false);
  // Al abrir «Voces» una vez se apaga su punto violeta (JST-225 §6).
  useEffect(() => {
    if (!celular && menu === "voces" && !aj.vistoLeer) cambiarAjustes({ vistoLeer: true });
  }, [celular, menu, aj.vistoLeer]);
  // El menú vive en una capa aparte: el foco entra a la primera fila al abrirlo, para que el teclado llegue.
  useEffect(() => {
    if (menu === "ambiente") filas.current?.querySelector<HTMLElement>("button")?.focus();
  }, [menu]);
  useEsc(abierto, () => {
    cerrar();
    boton.current?.focus();
  });

  const dotVoces = puntoVoces(aj);
  const dotConv = puntoIa(aj, e);
  const punto = dotVoces || dotConv ? <span className="of-hdot" /> : null;
  const puntoFila = <span className="of-amb-dot" title={t("Novedad")} />;
  const estadoConv = resumenConversaciones(aj.charlas, aj.iaFuente, e);

  const flechas = (ev: KeyboardEvent<HTMLDivElement>) => {
    if (ev.key !== "ArrowDown" && ev.key !== "ArrowUp") return;
    // En un selector las flechas eligen la opción, no cambian de fila; a los selectores se llega con Tab.
    if ((ev.target as HTMLElement).tagName === "SELECT") return;
    const botones = Array.from(filas.current?.querySelectorAll<HTMLElement>("button") ?? []);
    if (botones.length === 0) return;
    const i = botones.indexOf(document.activeElement as HTMLElement);
    ev.preventDefault();
    botones[(i + (ev.key === "ArrowDown" ? 1 : -1) + botones.length) % botones.length]?.focus();
  };

  const contenido =
    celular && menu !== "ambiente" ? null : menu === "voces" ? (
      <PanelVoces agentes={agentes} />
    ) : menu === "charlas" ? (
      <PanelConversaciones e={e} celular={false} />
    ) : menu === "ambiente" ? (
      <div ref={filas} className="of-amb" role="group" aria-label={t("Ambiente")} onKeyDown={flechas}>
        {celular ? null : (
          <button type="button" className={cx("of-amb-row", !aj.voces && "is-off")} aria-haspopup="dialog" onClick={() => abrirMenu("voces")}>
            <Icono nombre={aj.voces ? "volume-2" : "volume-x"} tam={14} />
            <span className="of-amb-n">{t("Voces")}</span>
            {dotVoces ? puntoFila : null}
            <span className="of-amb-st">{estadoVoces(aj.voces)}</span>
            <Icono nombre="chevron-right" tam={12} className="of-amb-cv" />
          </button>
        )}
        <button type="button" className={cx("of-amb-row", !aj.mascotas && "is-off")} role="switch" aria-checked={aj.mascotas} onClick={() => cambiarAjustes({ mascotas: !aj.mascotas })}>
          <Icono nombre="paw-print" tam={14} />
          <span className="of-amb-n">{t("Mascotas")}</span>
          <span className="of-amb-st">{estadoMascotas(aj.mascotas)}</span>
          <span className={cx("of-amb-sw", aj.mascotas && "is-on")} aria-hidden="true">
            <i />
          </span>
        </button>
        {celular ? null : (
          <button type="button" className={cx("of-amb-row", !aj.charlas && "is-off")} aria-haspopup="dialog" onClick={() => abrirMenu("charlas")}>
            <Icono nombre={aj.charlas ? "message-circle" : "message-circle-off"} tam={14} />
            <span className="of-amb-n">{t("Conversaciones")}</span>
            {dotConv ? puntoFila : null}
            <span className="of-amb-st">{estadoConv}</span>
            <Icono nombre="chevron-right" tam={12} className="of-amb-cv" />
          </button>
        )}
        <div className="of-amb-nivel">
          <span className="of-vz-k" id={idNivel}>
            {t("Cuánto habla")}
          </span>
          <div className="of-seg" role="group" aria-labelledby={idNivel}>
            {NIVELES.map((n) => (
              <button key={n} type="button" aria-pressed={aj.nivel === n} onClick={() => cambiarAjustes({ nivel: n })}>
                {t(NOMBRE_NIVEL[n])}
              </button>
            ))}
          </div>
          <p className="of-amb-ayuda">{t(AYUDA_NIVEL[aj.nivel])}</p>
        </div>
        <button type="button" className={cx("of-amb-row", !aj.luz && "is-off")} role="switch" aria-checked={aj.luz} onClick={() => cambiarAjustes({ luz: !aj.luz })}>
          <Icono nombre="moon" tam={14} />
          <span className="of-amb-n">{t("Luz según la hora")}</span>
          <span className="of-amb-st">{estadoLuz(aj.luz)}</span>
          <span className={cx("of-amb-sw", aj.luz && "is-on")} aria-hidden="true">
            <i />
          </span>
        </button>
        <button type="button" className={cx("of-amb-row", !aj.fechas && "is-off")} role="switch" aria-checked={aj.fechas} onClick={() => cambiarAjustes({ fechas: !aj.fechas })}>
          <Icono nombre="sparkles" tam={14} />
          <span className="of-amb-n">{t("Adornos por fecha")}</span>
          <span className="of-amb-st">{estadoAdornos(aj.fechas)}</span>
          <span className={cx("of-amb-sw", aj.fechas && "is-on")} aria-hidden="true">
            <i />
          </span>
        </button>
        <div className="of-amb-sec" id={idDecorado}>
          {t("Decorado")}
        </div>
        <div role="group" aria-labelledby={idDecorado} className="of-amb-opc">
          {OPCIONES_DECORADO.map((o) => (
            <button
              key={o}
              type="button"
              aria-pressed={aj.decorado === o}
              className={cx("of-amb-row", aj.decorado === o && "is-on")}
              onClick={() => cambiarAjustes({ decorado: o })}
            >
              <span className="of-amb-n">{nombreDecorado(o)}</span>
              {o === "repartidos" ? <span className="of-amb-st">{t("Cada empresa tiene el suyo")}</span> : null}
              {aj.decorado === o ? <Icono nombre="check" tam={14} className="of-amb-ok" /> : null}
            </button>
          ))}
        </div>
        {empresas.length > 0 ? (
          <>
            <button type="button" className="of-amb-row" aria-expanded={porSala} aria-controls={idPorSala} onClick={() => setPorSala(!porSala)}>
              <span className="of-amb-n">{t("Por sala")}</span>
              <Icono nombre="chevron-right" tam={12} className={cx("of-amb-cv", porSala && "is-abierto")} />
            </button>
            {porSala ? (
              <div id={idPorSala} className="of-amb-opc" role="group" aria-label={t("Por sala")}>
                {empresas.map((e) => (
                  <div key={e.prefijo} className="of-amb-sala">
                    <EtiquetaEmpresa prefijo={e.prefijo} />
                    <span className="of-amb-n">{e.nombre}</span>
                    <select
                      className="of-amb-sel"
                      aria-label={t("Decorado de {nombre}", { nombre: e.nombre })}
                      value={esDecorado(aj.decoradoPorEmpresa[e.prefijo]) ? aj.decoradoPorEmpresa[e.prefijo] : ""}
                      onChange={(ev) => {
                        cambiarAjustes({ decoradoPorEmpresa: conEleccionDeEmpresa(aj.decoradoPorEmpresa, e.prefijo, ev.target.value) });
                      }}
                    >
                      <option value="">{t("Como la oficina")}</option>
                      {DECORADOS.map((d) => (
                        <option key={d.id} value={d.id}>
                          {nombreDecorado(d.id)}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    ) : null;

  const titulo = celular ? t("Ambiente: mascotas, decorado y luz") : t("Ambiente: voces, mascotas, conversaciones, decorado y luz");
  return (
    <span ref={grupo} className="of-hbtns">
      {celular ? (
        <button
          ref={boton}
          type="button"
          className={cx("of-ibtn is-ghost of-petbtn is-m", abierto && "is-open")}
          aria-haspopup="dialog"
          aria-expanded={abierto}
          aria-label={t("Ambiente")}
          title={titulo}
          onClick={() => abrirMenu(abierto ? null : "ambiente")}
        >
          <Icono nombre="sliders-horizontal" tam={14} />
        </button>
      ) : (
        <button
          ref={boton}
          type="button"
          className={cx("of-btn is-sm of-hbtn of-ambbtn", abierto && "is-open")}
          aria-haspopup="dialog"
          aria-expanded={abierto}
          title={titulo}
          onClick={() => abrirMenu(abierto ? null : "ambiente")}
        >
          <Icono nombre="sliders-horizontal" tam={14} />
          {t("Ambiente")}
          <Icono nombre={abierto ? "chevron-up" : "chevron-down"} tam={12} className="of-iaa-cv" />
          {punto}
        </button>
      )}
      {contenido ? (
        <Capa>
          {celular ? (
            <>
              <div className="of-sheet-bg" onClick={cerrar} />
              <div className="of-sheet of-hsheet of-ambsheet" role="dialog" aria-label={t("Ambiente")}>
                <div className="of-grab" />
                <div className="of-hsheet-b">{contenido}</div>
              </div>
            </>
          ) : (
            <Popover ancla={boton.current} botones={grupo.current} onCerrar={cerrar} voces={menu === "voces"} charlas={menu === "charlas"} ambiente={menu === "ambiente"}>
              {contenido}
            </Popover>
          )}
        </Capa>
      ) : null}
    </span>
  );
}
