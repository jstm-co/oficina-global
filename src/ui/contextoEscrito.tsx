// El informe de «Leer contexto» escrito (JST-414): se deja a la vista siempre que se
// lee, con las secciones del informe y sus rótulos, la frase que va marcada, y se
// queda hasta que la persona lo cierra. Una frase se toca para saltar a ella.
//
// Va en cuatro lugares (`contextoLugar.ts`): flotando bajo el botón de la barra de
// arriba, dentro de la ventana de responder, dentro del modal de tarea y flotando en
// la página de la Oficina cuando se lee desde la franja «Te necesitan». Es el mismo
// componente; cambia solo dónde se pone (`estilo`, `dentro`).
//
// Lo que se oye va en español (no se traduce); los rótulos, los botones y el resto
// sí (`t()`).
import { useEffect, useRef, type CSSProperties } from "react";
import { t } from "../i18n.js";
import type { Informe } from "./contextoInforme.js";
import { segundosDeInforme } from "./contextoInforme.js";
import { cambiarNivelEn, codigoDeTarea, duracionDicha, segundosDeFrases, soltarDe, visibleEn, type LugarContexto } from "./contextoLugar.js";
import type { LectorContexto } from "./contextoLector.js";
import { useNivelContexto } from "./contextoNivel.js";
import { cx, Icono } from "./piso.js";

interface Contenido {
  informe: Informe | null;
  frases: string[];
}

/** Las partes con el número de frase de cada una (el de la lista plana del lector). */
function partesDe(d: Contenido): Array<{
  clave: string;
  titulo: string | null;
  frases: Array<{ f: string; k: number }>;
}> {
  let k = 0;
  if (!d.informe)
    return [
      {
        clave: "texto",
        titulo: null,
        frases: d.frases.map((f) => ({ f, k: k++ })),
      },
    ];
  return d.informe.secciones.map((s) => ({
    clave: s.clave,
    titulo: s.titulo,
    frases: s.frases.map((f) => ({ f, k: k++ })),
  }));
}

export function PanelContexto({
  c,
  tarea,
  lugar,
  celular,
  estilo,
  dentro = false,
}: {
  c: LectorContexto;
  tarea: string;
  lugar: LugarContexto;
  celular: boolean;
  estilo?: CSSProperties;
  dentro?: boolean;
}) {
  const nivel = useNivelContexto();
  const corre = useRef<HTMLDivElement>(null);
  // Al cambiar de nivel el lector suelta las frases mientras carga: el panel sigue con lo último para no parpadear.
  const ultimo = useRef<Contenido | null>(null);
  if (c.frases.length > 0) ultimo.current = { informe: c.informe, frases: c.frases };
  const cargando = c.frases.length === 0;
  const datos: Contenido | null = cargando ? ultimo.current : { informe: c.informe, frases: c.frases };
  const visible = visibleEn(c, lugar, tarea) && !!datos;
  useEffect(() => {
    const el = corre.current;
    const cur = el?.querySelector<HTMLElement>(".is-cur");
    if (!el || !cur) return;
    const arriba = cur.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop;
    if (arriba < el.scrollTop + 40 || arriba + cur.offsetHeight > el.scrollTop + el.clientHeight - 8) el.scrollTop = Math.max(0, arriba - 48);
  }, [c.k, c.estado, visible]);
  if (!visible || !datos) return null;

  const codigo = codigoDeTarea(tarea);
  const leyendo = c.estado === "leyendo";
  const activo = c.activo();
  // Con las frases a la vista y el audio en camino, la frase de partida también se marca.
  const marca = leyendo || c.estado === "fin" || (c.estado === "cargando" && c.frases.length > 0);
  // Detenida a medias, sigue desde donde iba; terminada (o sin empezar), vuelve a la primera.
  const seguir = c.estado === "listo" && c.k > 0;
  const seg = datos.informe ? segundosDeInforme(datos.informe) : segundosDeFrases(datos.frases);
  const ib = celular ? 18 : 14;
  return (
    <div
      className={cx("of-ctx-esc", dentro && "is-in", celular && "is-m")}
      style={estilo}
      role="region"
      aria-label={codigo ? t("Contexto de {codigo}", { codigo }) : t("Contexto de la tarea")}
      aria-busy={cargando ? true : undefined}
      onKeyDown={(ev) => {
        // Esc con el foco dentro cierra el panel flotante; en la ventana y el modal es del diálogo que los contiene.
        if (ev.key !== "Escape" || dentro) return;
        ev.stopPropagation();
        soltarDe(c, lugar);
      }}
    >
      <div className="of-ctx-ph">
        <b className="of-ctx-pt">{codigo ? t("Contexto de {codigo}", { codigo }) : t("Contexto de la tarea")}</b>
        <span className="of-ctx-dur">{duracionDicha(seg)}</span>
        <div className="of-ctx-niv" role="group" aria-label={t("Nivel del informe")}>
          <button type="button" aria-pressed={nivel === "corto"} disabled={cargando} onClick={() => nivel !== "corto" && cambiarNivelEn(c, lugar, tarea, "corto")}>
            {t("Corto")}
          </button>
          <button type="button" aria-pressed={nivel === "completo"} disabled={cargando} onClick={() => nivel !== "completo" && cambiarNivelEn(c, lugar, tarea, "completo")}>
            {t("Completo")}
          </button>
        </div>
        {/* Los cuatro botones van juntos: si no caben al lado del título, bajan los cuatro a la fila de abajo. */}
        <div className="of-ctx-bts">
          <button type="button" className="of-ibtn is-ghost of-ctx-ib" aria-label={t("Frase anterior")} title={t("Frase anterior")} disabled={cargando} onClick={() => c.anterior()}>
            <Icono nombre="skip-back" tam={ib} />
          </button>
          <button type="button" className="of-ibtn is-ghost of-ctx-ib" aria-label={t("Frase siguiente")} title={t("Frase siguiente")} disabled={cargando} onClick={() => c.siguiente()}>
            <Icono nombre="skip-forward" tam={ib} />
          </button>
          <button
            type="button"
            className="of-ibtn is-ghost of-ctx-ib"
            aria-label={activo ? t("Detener lectura") : seguir ? t("Seguir leyendo") : t("Leer de nuevo")}
            title={activo ? t("Detener") : seguir ? t("Seguir leyendo") : t("Leer de nuevo")}
            disabled={cargando}
            onClick={() => (activo ? c.detener() : c.irA(seguir ? c.k : 0))}
          >
            <Icono nombre={activo ? "square" : "play"} tam={ib} />
          </button>
          <button type="button" className="of-ibtn is-ghost of-ctx-ib" aria-label={t("Cerrar el informe")} title={t("Cerrar el informe")} onClick={() => soltarDe(c, lugar)}>
            <Icono nombre="x" tam={ib} />
          </button>
        </div>
      </div>
      {c.sinVoz && !cargando ? (
        <div className="of-ctx-sv">
          <Icono nombre="volume-x" tam={14} />
          <span>
            <b>{t("Este navegador no tiene voz en español.")}</b> {t("Te lo dejo escrito.")}
          </span>
        </div>
      ) : null}
      <div ref={corre} className="of-ctx-pc">
        {partesDe(datos).map((s) => (
          <section key={s.clave} className="of-ctx-s">
            {s.titulo ? <h4 className="of-ctx-sh">{t(s.titulo)}</h4> : null}
            {s.frases.map(({ f, k }) => {
              const cur = marca && k === c.k;
              return (
                <button
                  key={k}
                  type="button"
                  className={cx("of-ctx-fr", cur && "is-cur", leyendo && k > c.k && "is-fut")}
                  aria-current={cur ? "true" : undefined}
                  title={t("Leer desde aquí")}
                  // El teclado usa «Frase anterior» y «Frase siguiente»: 25 frases no son 25 paradas de Tab.
                  tabIndex={-1}
                  disabled={cargando}
                  onClick={() => c.irA(k)}
                >
                  {f}
                </button>
              );
            })}
          </section>
        ))}
      </div>
      <span className="of-sr" role="status">
        {cargando ? t("Cargando…") : ""}
      </span>
    </div>
  );
}
