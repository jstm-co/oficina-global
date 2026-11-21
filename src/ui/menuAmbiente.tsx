// «Ambiente» (JST-410): un solo botón del encabezado de computador que reúne «Voces», «Mascotas» y «Conversaciones»,
// que antes eran tres botones sueltos. Abre un menú de tres filas, cada una con su estado a la derecha. «Voces» y
// «Conversaciones» abren sus paneles de siempre (`PanelVoces`, `PanelConversaciones`) anclados a este botón, con el mismo
// menú abierto único de `paneles.tsx`; «Mascotas» es un interruptor que no cierra el menú. En celular no se usa.
import { useEffect, useRef, type KeyboardEvent } from "react";
import type { AgenteVista } from "../vista.js";
import { cambiarAjustes, puntoIa, puntoVoces, useAjustes } from "./ajustes.js";
import { Capa, useEsc } from "./capas.js";
import { useEstadoIa } from "./ia.js";
import { PanelConversaciones, resumenConversaciones, useEfectosConversaciones } from "./menuConversaciones.js";
import { abrirMenu, PanelVoces, Popover, useMenuAbierto } from "./paneles.js";
import { cx, Icono } from "./piso.js";

/** Lo que dicen las filas de «Voces» y «Mascotas» (la de «Conversaciones» sale de `resumenConversaciones`). */
export function estadoVoces(voces: boolean): string {
  return voces ? "Activadas" : "Apagadas";
}
export function estadoMascotas(mascotas: boolean): string {
  return mascotas ? "Visibles" : "Ocultas";
}

export function BotonAmbiente({ agentes }: { agentes: readonly AgenteVista[] }) {
  const aj = useAjustes();
  const e = useEstadoIa(true);
  const menu = useMenuAbierto();
  const abierto = menu === "ambiente" || menu === "voces" || menu === "charlas";
  const boton = useRef<HTMLButtonElement>(null);
  const grupo = useRef<HTMLSpanElement>(null);
  const filas = useRef<HTMLDivElement>(null);
  const cerrar = () => abrirMenu(null);
  useEfectosConversaciones(menu === "charlas", false);
  // Al abrir «Voces» una vez se apaga su punto violeta (JST-225 §6).
  useEffect(() => {
    if (menu === "voces" && !aj.vistoLeer) cambiarAjustes({ vistoLeer: true });
  }, [menu, aj.vistoLeer]);
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
  const puntoFila = <span className="of-amb-dot" title="Novedad" />;
  const estadoConv = resumenConversaciones(aj.charlas, aj.iaFuente, e);

  const flechas = (ev: KeyboardEvent<HTMLDivElement>) => {
    if (ev.key !== "ArrowDown" && ev.key !== "ArrowUp") return;
    const botones = Array.from(filas.current?.querySelectorAll<HTMLElement>("button") ?? []);
    if (botones.length === 0) return;
    const i = botones.indexOf(document.activeElement as HTMLElement);
    ev.preventDefault();
    botones[(i + (ev.key === "ArrowDown" ? 1 : -1) + botones.length) % botones.length]?.focus();
  };

  const contenido =
    menu === "voces" ? (
      <PanelVoces agentes={agentes} />
    ) : menu === "charlas" ? (
      <PanelConversaciones e={e} celular={false} />
    ) : menu === "ambiente" ? (
      <div ref={filas} className="of-amb" role="group" aria-label="Ambiente" onKeyDown={flechas}>
        <button type="button" className={cx("of-amb-row", !aj.voces && "is-off")} aria-haspopup="dialog" onClick={() => abrirMenu("voces")}>
          <Icono nombre={aj.voces ? "volume-2" : "volume-x"} tam={14} />
          <span className="of-amb-n">Voces</span>
          {dotVoces ? puntoFila : null}
          <span className="of-amb-st">{estadoVoces(aj.voces)}</span>
          <Icono nombre="chevron-right" tam={12} className="of-amb-cv" />
        </button>
        <button type="button" className={cx("of-amb-row", !aj.mascotas && "is-off")} role="switch" aria-checked={aj.mascotas} onClick={() => cambiarAjustes({ mascotas: !aj.mascotas })}>
          <Icono nombre="paw-print" tam={14} />
          <span className="of-amb-n">Mascotas</span>
          <span className="of-amb-st">{estadoMascotas(aj.mascotas)}</span>
          <span className={cx("of-amb-sw", aj.mascotas && "is-on")} aria-hidden="true">
            <i />
          </span>
        </button>
        <button type="button" className={cx("of-amb-row", !aj.charlas && "is-off")} aria-haspopup="dialog" onClick={() => abrirMenu("charlas")}>
          <Icono nombre={aj.charlas ? "message-circle" : "message-circle-off"} tam={14} />
          <span className="of-amb-n">Conversaciones</span>
          {dotConv ? puntoFila : null}
          <span className="of-amb-st">{estadoConv}</span>
          <Icono nombre="chevron-right" tam={12} className="of-amb-cv" />
        </button>
      </div>
    ) : null;

  return (
    <span ref={grupo} className="of-hbtns">
      <button
        ref={boton}
        type="button"
        className={cx("of-btn is-sm of-hbtn of-ambbtn", abierto && "is-open")}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        title="Ambiente: voces, mascotas y conversaciones"
        onClick={() => abrirMenu(abierto ? null : "ambiente")}
      >
        <Icono nombre="sliders-horizontal" tam={14} />
        Ambiente
        <Icono nombre={abierto ? "chevron-up" : "chevron-down"} tam={12} className="of-iaa-cv" />
        {punto}
      </button>
      {contenido ? (
        <Capa>
          <Popover ancla={boton.current} botones={grupo.current} onCerrar={cerrar} voces={menu === "voces"} charlas={menu === "charlas"} ambiente={menu === "ambiente"}>
            {contenido}
          </Popover>
        </Capa>
      ) : null}
    </span>
  );
}
