// Lista de agentes bajo la oficina (design-spec de JST-95 §3): en secciones
// por urgencia que se pliegan (te necesitan, con error, trabajando, en pausa,
// libres), con una fila por agente. Tocar una fila hace lo mismo que tocar al
// personaje en el piso. La lógica (grupos, orden, textos) está en `src/lista.ts`;
// no hace llamadas: usa lo que ya leyó el piso.
import { useEffect, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { t } from "../i18n.js";
import { esErrorViejo, type Silenciados } from "../erroresViejos.js";
import { agrupar, alternarPlegado, chipsDe, CLAVE_PLEGADOS, cuandoFila, escribirPlegados, estaAbierto, GRUPOS, grupoDe, leerPlegados, lineaDe, notaGrupo, type Grupo, type GrupoLista, type Plegados, type TareaFila } from "../lista.js";
import { tituloVisible } from "../estado.js";
import { ESTADOS, etiqueta, type AgenteVista } from "../vista.js";
import type { Resaltado } from "./encabezado.js";
import { limpiarErrores, useErroresSilenciados } from "./erroresSilenciados.js";
import { CajaPersonaje, cx, EtiquetaEmpresa, Icono } from "./piso.js";
import type { EmpresaVista, Oficina } from "./useOficina.js";

export interface PropsLista {
  oficina: Oficina;
  /** Los agentes que van en la lista: ya sin los de las empresas fuera del filtro. */
  agentes: readonly AgenteVista[];
  /** Agentes de las empresas que respondieron, sin filtro (el «de 26» de la cabecera). */
  total: number;
  /** Nombres de las empresas del filtro (vacío: «Todas»). */
  filtro: readonly EmpresaVista[];
  onQuitarFiltro: () => void;
  /** El contador resaltado: los que no calzan bajan a .35. */
  hl: Resaltado;
  celular: boolean;
  rm: boolean;
  ahora: number;
  /** Agente con la ficha o la ventana abierta (fila elegida). */
  seleccionado: string | null;
  /** Tocar la fila: lo mismo que tocar al personaje (la página decide ficha o ventana). `el`: la fila, para anclar la ficha y devolverle el foco. */
  onAbrir: (agenteId: string, el: HTMLElement) => void;
  /** El botón «Responder» de la fila: siempre la ventana. */
  onResponder: (agenteId: string, el: HTMLElement) => void;
  /** La última tarea de un agente libre o en pausa, si ya se leyó (0 llamadas extra). */
  ultima: (agenteId: string) => TareaFila | null;
  /** El código del último run de un agente con error, si ya se leyó («adapter_failed · ‹motivo›»). */
  codigoError?: (agenteId: string) => string | null;
}

/**
 * Lo que el usuario abrió o plegó (JST-410): se recuerda en este navegador
 * (`localStorage`, por vista: computador y celular no se pisan). Sin
 * almacenamiento, vale mientras la página esté abierta.
 */
let plegados: Plegados | null = null;
function plegadosActuales(): Plegados {
  if (!plegados) {
    try {
      plegados = leerPlegados(localStorage.getItem(CLAVE_PLEGADOS));
    } catch {
      plegados = leerPlegados(null);
    }
  }
  return plegados;
}
function guardarPlegados(p: Plegados): void {
  plegados = p;
  try {
    localStorage.setItem(CLAVE_PLEGADOS, escribirPlegados(p));
  } catch {
    // Sin almacenamiento local, vale solo para esta pestaña.
  }
}

const nombres = (lista: readonly { nombre: string }[]) =>
  lista.length <= 1 ? (lista[0]?.nombre ?? "") : t("{lista} y {ultimo}", { lista: lista.slice(0, -1).map((e) => e.nombre).join(", "), ultimo: lista.at(-1)!.nombre });

/** El contador resaltado deja a todos, pero los que no calzan bajan a .35 (§3). */
function calza(a: AgenteVista, hl: Resaltado, viejo: boolean): boolean {
  if (!hl) return true;
  // El error viejo ya no cuenta en «con error» (JST-410): no se resalta con ese contador.
  if (hl === "error" && viejo) return false;
  return hl === "toca" ? a.need : a.st === hl;
}

/** Enter y Espacio abren la fila, como un botón. */
function teclaFila(abrir: (el: HTMLElement) => void) {
  return (e: KeyboardEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      abrir(e.currentTarget);
    }
  };
}

function Fila({ a, p, silenciados }: { a: AgenteVista; p: PropsLista; silenciados: Silenciados }) {
  const viejo = esErrorViejo(a, p.ahora, silenciados);
  const tono = (clase: string | null) => (clase ? `is-${clase}` : null);
  const ultima = a.st === "libre" || a.st === "pausa" || a.st === "error" ? p.ultima(a.id) : null;
  const l = lineaDe(a, p.ahora, ultima, a.st === "error" ? (p.codigoError?.(a.id) ?? null) : null, viejo);
  const clase = cx("of-alr", p.celular && "is-m", p.seleccionado === a.id && "is-sel", !calza(a, p.hl, viejo) && "is-dim", viejo && "is-viejo");
  const abrir = (el: HTMLElement) => p.onAbrir(a.id, el);
  const comun = {
    role: "button",
    tabIndex: 0,
    "aria-label": etiqueta(a),
    "data-fila": a.id,
    onClick: (e: MouseEvent<HTMLElement>) => abrir(e.currentTarget),
    onKeyDown: teclaFila(abrir),
  } as const;
  const n = a.teNecesita.length;

  if (p.celular) {
    const g = grupoDe(a, p.ahora, silenciados);
    const texto = a.need ? (a.teNecesita[0]?.titulo != null ? tituloVisible(a.teNecesita[0].titulo) : l.contexto) : (l.tarea?.titulo ?? l.contexto);
    return (
      <div className={clase} {...comun}>
        <CajaPersonaje agente={a} animar rm={p.rm} />
        <span className="of-al-main">
          <span className="of-al-n">
            <b>{a.nombre}</b>
            <EtiquetaEmpresa prefijo={a.prefijo} />
          </span>
          <span className={cx("of-al-st", `of-c-${g}`, a.need && "is-toca")}>
            <Icono nombre={GRUPOS.find((x) => x.k === g)!.icono} tam={12} />
            {l.tarea ? <span className="of-tid">{l.tarea.identifier}</span> : null}
            <span className="of-al-ctx">{texto}</span>
            {l.sinUso ? <span className="of-al-sinuso">{l.sinUso}</span> : null}
          </span>
        </span>
        {a.need ? (
          <span className="of-al-go is-toca" aria-hidden="true">
            <Icono nombre="hand" tam={14} />
            {n > 1 ? n : null}
          </span>
        ) : (
          <span className="of-al-go" aria-hidden="true">
            <Icono nombre="chevron-right" tam={14} />
          </span>
        )}
      </div>
    );
  }

  let accion: ReactNode;
  if (a.need) {
    accion = (
      <button
        type="button"
        className="of-btn is-sm is-primary is-toca"
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation();
          const fila = (e.currentTarget as HTMLElement).closest<HTMLElement>(".of-alr");
          p.onResponder(a.id, fila ?? e.currentTarget);
        }}
      >
        <Icono nombre="hand" tam={14} />
        {n > 1 ? t("Responder · {n}", { n }) : t("Responder")}
      </button>
    );
  } else if (a.st === "error") {
    accion = (
      <span className={cx("of-al-when", !viejo && "is-error")}>
        <Icono nombre="triangle-alert" tam={12} />
        {cuandoFila(a, p.ahora)}
      </span>
    );
  } else {
    accion = <span className="of-al-when">{cuandoFila(a, p.ahora)}</span>;
  }

  return (
    <div className={clase} {...comun}>
      <CajaPersonaje agente={a} animar rm={p.rm} />
      <span className="of-al-who">
        <b>{a.nombre}</b>
        {a.rol ? <span>{a.rol}</span> : null}
      </span>
      <span className="of-al-co">
        <EtiquetaEmpresa prefijo={a.prefijo} />
        <span>{a.empresa}</span>
      </span>
      <span className="of-al-sts">
        {chipsDe(a).map((c) => (
          <span key={c.st} className={`of-nchip of-c-${c.st}`}>
            <Icono nombre={ESTADOS[c.st].icono} tam={12} />
            {c.texto}
          </span>
        ))}
      </span>
      <span className="of-al-task">
        <span className="of-al-t">
          {l.tarea ? (
            <>
              <span className="of-tid">{l.tarea.identifier}</span>
              {l.tarea.titulo ? <span className="of-tt">{l.tarea.titulo}</span> : null}
            </>
          ) : null}
        </span>
        <span className={cx("of-al-ctx", tono(l.tono))}>{l.contexto}</span>
        {l.sinUso ? <span className="of-al-sinuso">{l.sinUso}</span> : null}
      </span>
      <span className="of-al-act">{accion}</span>
    </div>
  );
}

function Seccion({ g, p, silenciados, sinToca, abierto, onAlternar }: { g: GrupoLista; p: PropsLista; silenciados: Silenciados; sinToca: boolean; abierto: boolean; onAlternar: () => void }) {
  const nota = notaGrupo(g, p.celular);
  return (
    <div className={cx("of-als", `is-${g.k}`)}>
      <button type="button" className="of-al-sh" aria-expanded={abierto} onClick={onAlternar}>
        <Icono nombre={abierto ? "chevron-down" : "chevron-right"} tam={14} />
        <span className={cx("of-al-si", `of-c-${g.k}`)}>
          <Icono nombre={g.icono} tam={14} />
        </span>
        {g.label}
        <b>{sinToca ? "?" : g.agentes.length}</b>
        {nota ? <em>{nota}</em> : null}
      </button>
      {sinToca ? (
        <div className="of-al-note" role="status">
          <Icono nombre="triangle-alert" tam={14} />
          {t("No pude leer «Te toca»: por ahora no sé quién te necesita.")}
        </div>
      ) : null}
      {abierto ? g.agentes.map((a) => <Fila key={a.id} a={a} p={p} silenciados={silenciados} />) : null}
    </div>
  );
}

export function ListaAgentes(p: PropsLista) {
  const [, setVersion] = useState(0);
  const { oficina, celular } = p;
  const silenciados = useErroresSilenciados();
  // JST-410: lo silenciado que ya no aplica (el error se arregló o cambió) se limpia solo.
  useEffect(() => {
    if (!oficina.cargando) limpiarErrores(oficina.agentes);
  }, [oficina.agentes, oficina.cargando]);
  const enFiltro = (e: EmpresaVista) => p.filtro.length === 0 || p.filtro.some((f) => f.id === e.id);
  const caidas = oficina.caidas.filter(enFiltro);
  const sumar = (lista: readonly EmpresaVista[]) => lista.reduce((n, e) => n + (e.conocidos ? e.agentes : 0), 0);
  const n = p.agentes.length;
  const cargando = oficina.cargando && oficina.agentes.length === 0;

  if (cargando) {
    const total = oficina.empresas.length;
    return (
      <section className={cx("of-al", celular && "is-m")} aria-busy="true" aria-label={t("Agentes")}>
        <div className="of-al-h">
          <h2>{t("Agentes")}</h2>
          <span className="of-al-sub">
            <Icono nombre="loader" tam={12} className="of-spin" />
            {total ? t("Leyendo las {n} empresas…", { n: total }) : t("Leyendo las empresas…")}
          </span>
        </div>
        {Array.from({ length: celular ? 5 : 6 }, (_, i) => (
          <div key={i} className={cx("of-alr of-al-skr", celular && "is-m")} aria-hidden="true">
            <i className="of-sk of-sk-av" />
            <i className="of-sk of-sk-l1" />
            <i className="of-sk of-sk-l2" />
            <i className="of-sk of-sk-l3" />
          </div>
        ))}
      </section>
    );
  }

  const grupos = agrupar(p.agentes, oficina.sinAtencion, p.ahora, silenciados);
  const conteo = caidas.length > 0 ? t("{n} de {total}", { n, total: n + sumar(caidas) }) : `${n}`;
  const totalTodas = p.total + sumar(oficina.caidas);
  const alternar = (k: Grupo) => {
    guardarPlegados(alternarPlegado(plegadosActuales(), k, celular));
    setVersion((v) => v + 1);
  };

  return (
    <section className={cx("of-al", celular && "is-m")} aria-label={t("Agentes")}>
      <div className="of-al-h">
        <h2>{t("Agentes")}</h2>
        <span className="of-al-sub">{t("{conteo} · primero los que te necesitan", { conteo })}</span>
        <span className="of-sp" />
        {p.filtro.length > 0 ? (
          <span className="of-al-f">
            <Icono nombre="filter" tam={12} />
            {t("Solo {nombres} · {n} de {total}", { nombres: nombres(p.filtro), n, total: totalTodas })}
            <button type="button" className="of-al-link" onClick={p.onQuitarFiltro}>
              {t("Ver todas")}
            </button>
          </span>
        ) : null}
      </div>
      {celular ? null : (
        <div className="of-al-cols" aria-hidden="true">
          <span />
          <span>{t("Agente")}</span>
          <span>{t("Empresa")}</span>
          <span>{t("Estado")}</span>
          <span>{t("Tarea")}</span>
          <span />
        </div>
      )}
      {grupos.map((g) => {
        const abierto = estaAbierto(plegadosActuales(), g.k, celular);
        return <Seccion key={g.k} g={g} p={p} silenciados={silenciados} sinToca={g.k === "toca" && oficina.sinAtencion} abierto={abierto} onAlternar={() => alternar(g.k)} />;
      })}
      {caidas.length > 0 ? (
        <div className="of-als is-off">
          {caidas.map((e) => (
            <div key={e.id} className="of-al-off" role="status">
              <Icono nombre="cloud-off" tam={14} />
              <span>
                <b>{t("{nombre} no responde.", { nombre: e.nombre })}</b>{" "}
                {e.conocidos
                  ? e.agentes === 1
                    ? t("Su agente vuelve a la lista cuando responda.")
                    : t("Sus {n} agentes vuelven a la lista cuando responda.", { n: e.agentes })
                  : t("Sus agentes vuelven a la lista cuando responda.")}
              </span>
              <button type="button" className="of-btn is-sm" onClick={oficina.reintentar}>
                <Icono nombre="refresh" tam={14} />
                {t("Reintentar")}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
