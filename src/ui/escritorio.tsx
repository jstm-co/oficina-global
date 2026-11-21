// La ventanita de tu escritorio (0.5.0, design-spec de JST-163 §14): al hacer
// clic en tu escritorio de una sala, quiénes te esperan en esa sala, el
// primero de la fila marcado, lo que pide cada uno y el botón de siempre, que
// abre la ventana de la 0.2.0 para responder sin salir. No lee nada: es lo que
// la página ya sabe. Se cierra con un clic afuera, Escape o ✕.
import type { ReactNode } from "react";
import { nombreCorto } from "../avisos.js";
import { t } from "../i18n.js";
import { dondeEspera, filaDeSalas } from "../escritorio.js";
import type { PisoPlano } from "../plano.js";
import { chipDe } from "../responder.js";
import { tituloVisible } from "../estado.js";
import { ESPERAS, hace, type AgenteVista } from "../vista.js";
import { CajaPersonaje, cx, Icono } from "./piso.js";

/** Quién hace fila en cada sala del plano (lo mismo que dibuja la vida), con lo que la página ya leyó. */
export function filaDelPlano(plano: PisoPlano, agentes: readonly AgenteVista[]): Map<string, number> {
  const lugares = new Map(plano.salas.map((s) => [s.prefijo, s.fila.length]));
  return filaDeSalas(
    agentes.map((a) => ({ id: a.id, prefijo: a.prefijo, st: a.st, need: a.need, esperaDesde: a.teNecesita[0]?.desde ?? null })),
    (prefijo) => lugares.get(prefijo) ?? 0,
  );
}

const desde = (a: AgenteVista) => {
  const ms = Date.parse(a.teNecesita[0]?.desde ?? "");
  return Number.isFinite(ms) ? ms : Infinity;
};

export function VentanitaEscritorio({ empresa, prefijo, agentes, fila, ahora, onResponder, onCerrar }: {
  empresa: string;
  prefijo: string;
  agentes: readonly AgenteVista[];
  fila: ReadonlyMap<string, number>;
  ahora: number;
  /** El botón de cada fila: abre la ventana para responder (desde ese botón). */
  onResponder: (agenteId: string, desde: HTMLElement) => void;
  onCerrar: () => void;
}): ReactNode {
  const lista = agentes.filter((a) => a.prefijo === prefijo && a.need).sort((a, b) => desde(a) - desde(b) || a.id.localeCompare(b.id));
  const enFila = lista.filter((a) => fila.has(a.id)).length;
  const primero = lista.find((a) => fila.get(a.id) === 0);
  return (
    <div className="of-up" role="dialog" aria-label={t("Te esperan en {empresa}", { empresa })}>
      <div className="of-up-h">
        <Icono nombre="hand" tam={14} />
        <b>{t("Te esperan en {empresa}", { empresa })}</b>
        <span className="of-up-n">{lista.length}</span>
        <span className="of-sp" />
        <button type="button" className="of-ibtn" aria-label={t("Cerrar")} onClick={onCerrar}>
          <Icono nombre="x" tam={14} />
        </button>
      </div>
      {lista.length === 0 ? (
        <div className="of-up-vacio">
          <Icono nombre="coffee" tam={14} />
          {t("Nadie te espera en {empresa}.", { empresa })}
        </div>
      ) : (
        lista.map((a) => {
          const e = a.teNecesita[0]!;
          const k = ESPERAS[e.tipo];
          const d = dondeEspera({ st: a.st, codigo: a.run?.identifier ?? null }, fila.get(a.id));
          const mas = a.teNecesita.length - 1;
          return (
            <div key={a.id} className={cx("of-up-r", a === primero && "is-fila1")} data-espera={a.id}>
              <CajaPersonaje agente={a} px={1} />
              <div className="of-up-m">
                <div className="of-up-who">
                  <b>{nombreCorto(a.nombre)}</b>
                  <span className={cx(d.fila && "is-fila", a.st === "error" && "is-error")}>
                    {d.texto}
                    {d.codigo ? (
                      <>
                        {" "}
                        <b className="of-tid">{d.codigo}</b>
                      </>
                    ) : null}
                  </span>
                </div>
                <div className="of-up-q">
                  <Icono nombre={k.icono} tam={12} />
                  <span>{e.titulo != null ? tituloVisible(e.titulo) : t(chipDe(e).label)}</span>
                </div>
                <div className="of-up-qt">
                  {e.identifier ? <span className="of-tid">{e.identifier}</span> : null}
                  <span>
                    {k.label}
                    {e.desde ? ` · ${hace(e.desde, ahora)}` : ""}
                    {mas > 0 ? (
                      <>
                        {" · "}
                        <em>{t("+{n} más", { n: mas })}</em>
                      </>
                    ) : null}
                  </span>
                </div>
              </div>
              <button type="button" className="of-btn is-xs is-primary is-toca" onClick={(ev) => onResponder(a.id, ev.currentTarget)}>
                {k.boton}
              </button>
            </div>
          );
        })
      )}
      {lista.length > 0 ? (
        <div className="of-up-pie">
          <Icono nombre="info" tam={12} />
          <span>
            {t("{fila} «{boton}» abre la ventana de siempre, sin salir de la Oficina.", {
              fila: enFila > 0 ? t("{n} en la fila; los que siguen trabajando te esperan en su puesto.", { n: enFila }) : t("Nadie en la fila: todos siguen en su puesto."),
              boton: ESPERAS[lista[0]!.teNecesita[0]!.tipo].boton,
            })}
          </span>
        </div>
      ) : null}
    </div>
  );
}
