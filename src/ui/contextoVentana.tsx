// «🔊 Leer contexto» en la ventana de responder (JST-321, design-spec de JST-320 rev 2, A · En la fila de la tarea).
// Es el mismo lector de la barra de arriba (`contexto`, uno por pestaña del navegador) y el mismo texto
// (`textoDeTarea`): aquí solo cambia dónde va el botón y qué hace al cambiar de pestaña, enviar o cerrar.
//
// - Lee la tarea de la pestaña activa: `espera.identifier ?? espera.issueId` (`tareaDeEspera`).
// - Los mismos 5 estados y textos de la barra; «Detener» lleva ■ (`square`) y no ✕, porque la ventana ya
//   tiene una ✕ que la cierra.
// - Celular: solo el ícono (zona de 44 × 44, ficha de 32 × 32; la fila sigue en 22 px).
// - Sin voz en español: las frases van dentro de la ventana, bajo la fila de la tarea.
// - Si la ventana está abierta sobre la página de esa misma tarea, el botón de la barra y este muestran lo mismo:
//   es un solo lector.
import { contexto, EscritoContexto, ICONO, TEXTO, useContexto } from "./contextoBarra.js";
import { t } from "../i18n.js";
import { textoDeTarea } from "./botonContexto.js";
import type { EstadoContexto } from "./contextoLector.js";
import { cx, Icono } from "./piso.js";

/** La tarea que lee «Leer contexto» en esa espera: su código (o su id). Sin tarea (una aprobación suelta), no hay botón. */
export const tareaDeEspera = (e: { identifier?: string | null; issueId?: string | null } | undefined): string | null => e?.identifier ?? e?.issueId ?? null;

/** El estado del botón para esa tarea: el del lector si lee (o leyó) esa tarea; si no, «Leer contexto». */
export function estadoDe(tarea: string | null): EstadoContexto {
  return tarea && contexto.tarea === tarea ? contexto.estado : "listo";
}

/** Lee esa tarea ahora (Cargando o Leyendo). */
export const leeEsta = (tarea: string | null): boolean => !!tarea && contexto.tarea === tarea && contexto.activo();

/**
 * Pasar a otra pestaña (`tarea` cambió) calla lo que se lee de otra tarea; de la misma tarea, sigue. Es lo que hace
 * el efecto de la ventana; aparte para probarlo sin React.
 */
export function callarSiEsDeOtra(tarea: string | null): void {
  if (contexto.activo() && contexto.tarea !== tarea) contexto.detener();
}

/** «Enviar» salió (pasó la revisión de «Falta algo»): se calla lo que se lee de esa tarea. */
export function callarSiLee(tarea: string | null): void {
  if (leeEsta(tarea)) contexto.detener();
}

const aria = (e: EstadoContexto, codigo: string): string =>
  ({
    listo: t("Leer contexto de {codigo}", { codigo }),
    cargando: t("Cargando el contexto de {codigo}", { codigo }),
    leyendo: t("Detener lectura de {codigo}", { codigo }),
    fin: t("Leer contexto de {codigo}", { codigo }),
    error: t("No se pudo cargar {codigo}. Leer contexto otra vez", { codigo }),
  })[e];
const titulo = (e: EstadoContexto, codigo: string): string =>
  ({ listo: t("Leer contexto de {codigo}", { codigo }), cargando: t("Cargando…"), leyendo: t("Detener"), fin: t("Leer contexto de {codigo}", { codigo }), error: t("No se pudo cargar {codigo}", { codigo }) })[e];

/** El botón, al final de la fila de la tarea (`.of-rmeta`). */
export function BotonContextoVentana({ tarea, codigo, celular }: { tarea: string; codigo: string; celular: boolean }) {
  const c = useContexto();
  const e = estadoDe(tarea);
  const n = c.frases.length;
  return (
    <>
      <button
        type="button"
        className={cx("of-ctx", `is-${e}`, "of-ctx-fila", celular && "is-m")}
        aria-label={aria(e, codigo)}
        title={titulo(e, codigo)}
        aria-busy={e === "cargando" ? true : undefined}
        onClick={() => c.tocar(tarea, () => textoDeTarea(tarea))}
      >
        {/* «Detener» lleva ■ (`square`); el tamaño lo da `of-ctx-stop` (15 px, 19 en el celular). */}
        <Icono nombre={e === "leyendo" ? "square" : ICONO[e]} tam={celular ? 18 : 14} className={cx(e === "cargando" && "of-spin", e === "leyendo" && "of-ctx-stop")} />
        {celular ? null : <span className="of-ctx-t">{TEXTO[e]}</span>}
        {!celular && e === "leyendo" && n > 0 ? <span className="of-ctx-n">{`${c.k + 1}/${n}`}</span> : null}
      </button>
      <span className="of-sr" role="status">
        {e === "fin" ? t("Leído") : e === "error" ? t("No se pudo cargar la tarea") : ""}
      </span>
    </>
  );
}

/** Sin voz en español: las frases escritas dentro de la ventana, bajo la fila de la tarea, con la que va marcada. */
export function EscritoVentana({ tarea, celular }: { tarea: string; celular: boolean }) {
  const c = useContexto();
  if (!(c.tarea === tarea && c.estado === "leyendo" && c.sinVoz && c.frases.length > 0)) return null;
  return <EscritoContexto c={c} celular={celular} dentro />;
}

/** En el celular, «No se pudo» no tiene texto en el botón: una nota bajo la fila de la tarea, los 4 s del estado. */
export function ErrorVentana({ tarea, celular }: { tarea: string; celular: boolean }) {
  useContexto();
  if (!celular || estadoDe(tarea) !== "error") return null;
  return (
    <div className="of-rnote is-err" role="alert">
      <Icono nombre="triangle-alert" tam={14} />
      <span>
        <b>{t("No se pudo cargar la tarea.")}</b> {t("Prueba otra vez.")}
      </span>
    </div>
  );
}
