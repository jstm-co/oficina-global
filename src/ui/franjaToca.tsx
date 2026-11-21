// Franja «Te necesitan» (JST-410): la tercera fila de la cabecera de computador. Siempre está y mide lo mismo (36 px),
// con esperas o sin ellas, para que el alto de la cabecera no cambie cuando alguien empieza o deja de necesitarte
// (la página mide dónde termina para decidir a qué escala cabe el piso). Cada agente que te necesita es un ítem de una
// línea con su botón «Responder»; si no caben, la franja se desplaza en horizontal.
import { nombreCorto } from "../avisos.js";
import { comparar } from "../lista.js";
import { chipDe } from "../responder.js";
import type { AgenteVista } from "../vista.js";
import { CajaPersonaje, EtiquetaEmpresa, Icono } from "./piso.js";

/** Los que te necesitan, el que espera hace más primero (el mismo orden de «Te esperan» y de la lista). */
export function esperanOrdenados(agentes: readonly AgenteVista[]): AgenteVista[] {
  return agentes.filter((a) => a.need).sort(comparar);
}

export function FranjaTeNecesitan({ agentes, cargando, sinAtencion, onResponder }: {
  /** Los mismos que cuentan los contadores (ya con el filtro por empresa). */
  agentes: readonly AgenteVista[];
  /** Primera lectura, sin agentes todavía: la franja queda vacía, del mismo alto. */
  cargando: boolean;
  /** «Te toca» no respondió: no se sabe quién te necesita. */
  sinAtencion: boolean;
  /** Abre la ventana de responder; `desde` es el ítem, de donde sale la ventana. */
  onResponder: (agenteId: string, desde: HTMLElement | null) => void;
}) {
  const esperan = esperanOrdenados(agentes);
  let contenido;
  if (esperan.length > 0) {
    const abrir = (id: string, el: HTMLElement) => onResponder(id, el.closest<HTMLElement>(".of-te-it") ?? el);
    contenido = (
      <>
        <span className="of-te-h">
          <Icono nombre="hand" tam={14} />
          Te necesitan
          <b>{esperan.length}</b>
        </span>
        <div className="of-te-l">
          {esperan.map((a) => {
            const e = a.teNecesita[0];
            const mas = a.teNecesita.length - 1;
            return (
              <div key={a.id} className="of-te-it">
                <button type="button" className="of-te-m" aria-label={`${a.nombre}, ${a.empresa}: te necesita. Responder`} onClick={(ev) => abrir(a.id, ev.currentTarget)}>
                  <CajaPersonaje agente={a} px={1} />
                  <b className="of-te-n">{nombreCorto(a.nombre)}</b>
                  <EtiquetaEmpresa prefijo={a.prefijo} />
                  <span className="of-te-t">
                    {e?.identifier ? <span className="of-tid">{e.identifier}</span> : null}
                    {e ? (e.titulo ?? chipDe(e).label) : null}
                  </span>
                  {mas > 0 ? <span className="of-te-mas">+{mas}</span> : null}
                </button>
                <button type="button" className="of-btn is-xs is-primary is-toca" aria-label={`Responder a ${nombreCorto(a.nombre)}`} onClick={(ev) => abrir(a.id, ev.currentTarget)}>
                  Responder
                </button>
              </div>
            );
          })}
        </div>
      </>
    );
  } else if (cargando) {
    contenido = null;
  } else if (sinAtencion) {
    contenido = (
      <span className="of-te-ok">
        <Icono nombre="triangle-alert" tam={14} />
        Por ahora no sé quién te necesita
      </span>
    );
  } else {
    contenido = (
      <span className="of-te-ok">
        <Icono nombre="circle-check" tam={14} />
        Nadie te necesita ahora
      </span>
    );
  }
  return (
    <div className="of-te" role="region" aria-label="Te necesitan">
      {contenido}
    </div>
  );
}
