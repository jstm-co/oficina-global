// «🔊 Leer contexto» en la ventana de responder (JST-321, design-spec de JST-320 rev 2, A · En la fila de la tarea).
// Es el mismo lector de la barra de arriba (`contexto`, uno por pestaña del navegador) y el mismo texto
// (`informeDeTarea`): aquí solo cambia dónde va el botón y qué hace al cambiar de pestaña, enviar o cerrar.
//
// - Lee la tarea de la pestaña activa: `espera.identifier ?? espera.issueId` (`tareaDeEspera`).
// - Los mismos 5 estados y textos de la barra; «Detener» lleva ■ (`square`) y no ✕, porque la ventana ya
//   tiene una ✕ que la cierra.
// - Celular: solo el ícono (zona de 44 × 44, ficha de 32 × 32; la fila sigue en 22 px).
// - El informe va escrito dentro de la ventana, bajo la fila de la tarea (JST-414), siempre que se lee.
// - Si la ventana está abierta sobre la página de esa misma tarea, el botón de la barra y este muestran lo mismo:
//   es un solo lector.
import { contexto, ICONO, TEXTO, useContexto } from "./contextoBarra.js";
import { PanelContexto } from "./contextoEscrito.js";
import { lugarDeLectura, soltarDe, tocarEn, type LugarContexto } from "./contextoLugar.js";
import { useNivelContexto } from "./contextoNivel.js";
import { t } from "../i18n.js";
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
  // También suelta el informe escrito de la otra tarea (JST-414): al volver a esa pestaña no queda a medias.
  if (contexto.tarea !== tarea && (contexto.activo() || (contexto.frases.length > 0 && lugarDeLectura() === "ventana"))) contexto.soltar();
}

/** «Enviar» salió (pasó la revisión de «Falta algo»): se calla lo que se lee de esa tarea. */
export function callarSiLee(tarea: string | null): void {
  if (leeEsta(tarea)) contexto.detener();
}

/** La ventana se cierra: se calla lo que se lee y, si el informe escrito era de ella, se cierra. */
export function callarAlCerrar(): void {
  soltarDe(contexto, "ventana");
  contexto.detener();
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

/**
 * El botón, al final de la fila de la tarea (`.of-rmeta`). También va, con el mismo ícono y los mismos 5 estados, en
 * cada tarjeta de «Te necesitan» (`chico`: solo el ícono, 24 px) y en la cabecera del modal de tarea (JST-414): `lugar`
 * dice dónde se deja escrito el informe.
 */
export function BotonContextoVentana({ tarea, codigo, celular, lugar = "ventana", chico = false }: { tarea: string; codigo: string; celular: boolean; lugar?: LugarContexto; chico?: boolean }) {
  const c = useContexto();
  const nivel = useNivelContexto();
  const soloIcono = celular || chico;
  const e = estadoDe(tarea);
  const n = c.frases.length;
  return (
    <>
      <button
        type="button"
        className={cx("of-ctx", `is-${e}`, chico ? "of-ctx-chico" : lugar === "ventana" && "of-ctx-fila", !chico && celular && "is-m", chico && celular && "is-g")}
        aria-label={aria(e, codigo)}
        title={titulo(e, codigo)}
        aria-busy={e === "cargando" ? true : undefined}
        onClick={(ev) => {
          ev.stopPropagation();
          tocarEn(c, lugar, tarea, nivel);
        }}
      >
        {/* «Detener» lleva ■ (`square`); el tamaño lo da `of-ctx-stop` (15 px, 19 en el celular). */}
        <Icono nombre={e === "leyendo" ? "square" : ICONO[e]} tam={celular && !chico ? 18 : 14} className={cx(e === "cargando" && "of-spin", e === "leyendo" && "of-ctx-stop")} />
        {soloIcono ? null : <span className="of-ctx-t">{TEXTO[e]}</span>}
        {!soloIcono && e === "leyendo" && n > 0 ? <span className="of-ctx-n">{`${c.k + 1}/${n}`}</span> : null}
      </button>
      <span className="of-sr" role="status">
        {e === "fin" ? t("Leído") : e === "error" ? t("No se pudo cargar la tarea") : ""}
      </span>
    </>
  );
}

/** El informe escrito dentro de la ventana, bajo la fila de la tarea, con la frase que va marcada (JST-414). */
export function EscritoVentana({ tarea, celular }: { tarea: string; celular: boolean }) {
  const c = useContexto();
  return <PanelContexto c={c} tarea={tarea} lugar="ventana" celular={celular} dentro />;
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
