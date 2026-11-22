// La mesa de bloqueadas de cada sala (JST-428): una mesita contra el muro derecho del descanso con una pila de
// carpetas, y el número de tareas bloqueadas de la empresa. Imita a tu escritorio (`EscritorioTu`), pero es solo un
// mueble con un número: no suma a ningún contador, no habla y no levanta la mano de nadie. Un clic abre el panel de
// bloqueadas de esa empresa.
import type { CSSProperties } from "react";
import { etiquetaMesa } from "../bloqueos.js";
import type { SalaPlano } from "../plano.js";
import { tx } from "./i18n.js";
import { cx, Icono, Mueble } from "./piso.js";

/**
 * A 1x, una pastilla neutra con el número; a 2x y 3x, el número va en un globo aparte (`GloboMesa`). Con 0, la mesa
 * sola. Sin `onClick` (el TV) no se puede tocar.
 */
export function MesaBloqueos({ sala, n, empresa, chico, onClick }: { sala: SalaPlano; n: number; empresa: string; chico: boolean; onClick: ((prefijo: string, el: HTMLElement) => void) | null }) {
  const m = sala.mesaBloqueos!;
  const texto = etiquetaMesa(n, empresa);
  return (
    <button
      type="button"
      className={cx("of-ws of-mesab", n > 0 && "is-con", !onClick && "is-fijo")}
      data-mesa-bloqueos={sala.prefijo}
      data-tip={texto}
      aria-label={texto}
      tabIndex={onClick ? 0 : -1}
      onClick={onClick ? (ev) => onClick(sala.prefijo, ev.currentTarget) : undefined}
      style={{ "--x": m.x, "--y": m.y - 5, "--w": m.w, "--h": m.h + 5, zIndex: m.y + m.h } as CSSProperties}
    >
      <Mueble nombre="mesita" x={0} y={5} z={1} />
      <span className="of-carpetas" style={{ "--x": 5, "--y": 1 } as CSSProperties} />
      {chico && n > 0 ? (
        <span className="of-mcnt" style={{ "--x": 11, "--y": -2 } as CSSProperties}>
          {n}
        </span>
      ) : null}
    </button>
  );
}

/** El globo «⏸ N bloqueadas» sobre la mesa (2x y 3x), neutro: no es un aviso. */
export function GloboMesa({ sala, n }: { sala: SalaPlano; n: number }) {
  const m = sala.mesaBloqueos!;
  return (
    <span className="of-bub of-b-mesa" data-mesa-globo={sala.prefijo} style={{ "--x": m.x + 9, "--y": m.y - 6 } as CSSProperties}>
      <Icono nombre="circle-pause" tam={12} />
      {n === 1 ? tx("{n} bloqueada", { n: <b>{n}</b> }) : tx("{n} bloqueadas", { n: <b>{n}</b> })}
    </span>
  );
}
