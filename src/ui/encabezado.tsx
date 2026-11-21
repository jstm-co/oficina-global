// Encabezado de la oficina (design-spec de JST-65 §9, §10 y §12): estado en
// vivo, contadores que resaltan, filtro por empresa, banners y leyenda. La
// 0.3.0 (JST-96 §8) suma el botón «Mascotas» y el sobre en la leyenda. La
// 0.4.0 (JST-162 §4) suma «Conversaciones», a la derecha de «Mascotas». JST-410: en computador, «Mascotas» y «Conversaciones»
// van dentro del menú «Ambiente» (`menuAmbiente.tsx`); aquí quedan para el celular.
import { useId, useState, type FocusEvent, type MouseEvent } from "react";
import { ESTADOS, ORDEN_LEYENDA, type ContadoresVista, type Dibujo } from "../vista.js";
import { cambiarAjustes, useAjustes } from "./ajustes.js";
import { Tooltip } from "./capas.js";
import { cx, EtiquetaEmpresa, Icono } from "./piso.js";
import type { EmpresaVista, Oficina } from "./useOficina.js";

export type Resaltado = Dibujo | null;

const nombres = (lista: readonly { nombre: string }[]) =>
  lista.length <= 1 ? (lista[0]?.nombre ?? "") : `${lista.slice(0, -1).map((e) => e.nombre).join(", ")} y ${lista.at(-1)!.nombre}`;

/** Por qué faltan las empresas sin agentes (tooltip de «N empresas», §9). `null` si no falta ninguna. */
export function porQueFaltan(ocultas: readonly EmpresaVista[]): string | null {
  if (ocultas.length === 0) return null;
  if (ocultas.length === 1) return `${ocultas[0]!.nombre} no aparece: todavía no tiene agentes. Su sala aparece sola cuando tenga el primero.`;
  return `${nombres(ocultas)} no aparecen: todavía no tienen agentes. Sus salas aparecen solas cuando tengan el primero.`;
}

/**
 * «26 agentes · 4 empresas» (§9): cuenta solo las empresas que se dibujan. Si
 * hay empresas sin agentes, lleva el tooltip de los personajes (también con el
 * teclado), que dice por qué faltan. No ocupa lugar en pantalla.
 */
export function ConteoEmpresas({ oficina, conAgentes, className, dentro }: { oficina: Oficina; conAgentes: boolean; className: string; dentro?: HTMLElement | null }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const id = useId();
  const empresas = oficina.empresas;
  const conocidos = empresas.length > 0 && empresas.every((e) => e.conocidos);
  const texto = `${conAgentes && conocidos ? `${empresas.reduce((n, e) => n + e.agentes, 0)} agentes · ` : ""}${empresas.length || ""} empresas`;
  const motivo = porQueFaltan(oficina.ocultas);
  if (!motivo) return <span className={className}>{texto}</span>;
  const mostrar = (e: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) => setRect(e.currentTarget.getBoundingClientRect());
  const ocultar = () => setRect(null);
  return (
    <>
      <span className={className} tabIndex={0} aria-describedby={id} onMouseEnter={mostrar} onMouseLeave={ocultar} onFocus={mostrar} onBlur={ocultar}>
        {texto}
      </span>
      <span id={id} className="of-sr">
        {motivo}
      </span>
      {rect ? <Tooltip tip={{ texto: motivo, rect }} dentro={dentro} /> : null}
    </>
  );
}

/** «En vivo · 4 de 4 empresas», «En vivo en 3 de 4 · Migo no responde…», «sin «Te toca»» o «Leyendo…». */
export function EstadoVivo({ oficina, corto = false }: { oficina: Oficina; corto?: boolean }) {
  const total = oficina.empresas.length;
  if (oficina.errorEmpresas) {
    return (
      <span className="of-live is-warn">
        <Icono nombre="triangle-alert" tam={12} />
        <span className="of-lt">{corto ? "Sin conexión" : "No pude leer las empresas, reintento en 20 s"}</span>
      </span>
    );
  }
  if (oficina.cargando) {
    return (
      <span className="of-live">
        <Icono nombre="loader" tam={12} className="of-spin" />
        <span className="of-lt">{total ? `Leyendo las ${total} empresas…` : "Leyendo las empresas…"}</span>
      </span>
    );
  }
  const caidas = oficina.caidas;
  if (caidas.length > 0) {
    const ok = total - caidas.length;
    const verbo = caidas.length === 1 ? "no responde" : "no responden";
    return (
      <span className="of-live is-warn">
        <Icono nombre="triangle-alert" tam={12} />
        <span className="of-lt">{corto ? `En vivo · ${ok} de ${total}` : `En vivo en ${ok} de ${total} · ${nombres(caidas)} ${verbo}, reintento en 20 s`}</span>
      </span>
    );
  }
  if (oficina.sinAtencion) {
    return (
      <span className="of-live is-warn">
        <Icono nombre="triangle-alert" tam={12} />
        <span className="of-lt">{corto ? "En vivo · sin «Te toca»" : "En vivo · sin «Te toca», reintento en 20 s"}</span>
      </span>
    );
  }
  return (
    <span className="of-live" title="Cada cambio llega en 1 s por el canal en vivo de cada empresa">
      <i className="of-pulse" />
      <span className="of-lt">{corto ? "En vivo" : `En vivo · ${total} de ${total} empresas`}</span>
    </span>
  );
}

const AYUDA: Partial<Record<Dibujo, string>> = {
  trabaja: "Resaltar a los que están trabajando",
  toca: "Resaltar a los que te necesitan (pueden estar además trabajando o con error)",
  error: "Resaltar a los que tienen error",
};

interface PropsContadores {
  c: ContadoresVista;
  hl: Resaltado;
  onHl: (st: Dibujo) => void;
  cargando: boolean;
  /** «Te toca» no respondió: «te necesitan» muestra «?». */
  sinAtencion: boolean;
}

function valor(p: PropsContadores, st: Dibujo): string | number {
  if (p.cargando) return "–";
  if (st === "toca" && p.sinAtencion) return "?";
  return p.c[st];
}

/** Pastillas de la página y del widget en computador; `resto`: «en pausa» y «libres» después de un separador. */
export function Contadores(p: PropsContadores & { modo: "pagina" | "widget" | "tv" }) {
  if (p.modo === "tv") {
    return (
      <>
        {(["trabaja", "toca", "error"] as const).map((st) => (
          <div key={st} className={`of-tvc of-c-${st}`}>
            <Icono nombre={ESTADOS[st].icono} />
            <b>{valor(p, st)}</b>
            <span>{ESTADOS[st].muchos}</span>
          </div>
        ))}
      </>
    );
  }
  return (
    <div className={cx("of-cnts", p.modo === "widget" && "is-w")}>
      {(["trabaja", "toca", "error"] as const).map((st) => (
        <button
          key={st}
          type="button"
          className={cx("of-cnt", `of-c-${st}`, p.hl === st && "is-on")}
          aria-pressed={p.hl === st}
          title={AYUDA[st]}
          onClick={() => p.onHl(st)}
        >
          <Icono nombre={ESTADOS[st].icono} tam={14} />
          <b>{valor(p, st)}</b>
          <span>{ESTADOS[st].muchos}</span>
        </button>
      ))}
      {p.modo === "pagina" ? (
        <>
          <span className="of-cnt-sep" />
          <Menores {...p} />
        </>
      ) : null}
    </div>
  );
}

/** «en pausa» y «libres»: pastillas chicas sin fondo. */
export function Menores(p: PropsContadores & { xs?: boolean }) {
  return (
    <>
      {(["pausa", "libre"] as const).map((st) => {
        const n = valor(p, st);
        return (
          <button
            key={st}
            type="button"
            className={cx("of-cnt is-sm", p.xs && "is-xs", `of-c-${st}`, p.hl === st && "is-on")}
            aria-pressed={p.hl === st}
            onClick={() => p.onHl(st)}
          >
            <Icono nombre={ESTADOS[st].icono} tam={12} />
            <b>{n}</b>
            <span>{st === "libre" ? (n === 1 ? "libre" : "libres") : "en pausa"}</span>
          </button>
        );
      })}
    </>
  );
}

/** Celular: 3 fichas iguales, número grande y etiqueta abajo. */
export function ContadoresCelular(p: PropsContadores) {
  return (
    <div className="of-cnts is-m">
      {(["trabaja", "toca", "error"] as const).map((st) => (
        <button key={st} type="button" className={cx("of-cnt is-tile", `of-c-${st}`, p.hl === st && "is-on")} aria-pressed={p.hl === st} onClick={() => p.onHl(st)}>
          <span className="of-tn">
            <Icono nombre={ESTADOS[st].icono} tam={14} />
            <b>{valor(p, st)}</b>
          </span>
          <span className="of-tl">{ESTADOS[st].muchos}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Filtro por empresa: selección múltiple; con todas elegidas vuelve a «Todas».
 * Con 5 o más empresas, en computador va solo el prefijo y el número (como en
 * el celular), y el nombre queda en `title` y `aria-label` (§9, JST-77).
 */
export function FiltroEmpresas({ oficina, filtro, onFiltro, celular }: { oficina: Oficina; filtro: readonly string[]; onFiltro: (f: string[]) => void; celular: boolean }) {
  const todas = oficina.empresas.map((e) => e.prefijo);
  const compacto = !celular && todas.length >= 5;
  const nombreLeido = (e: EmpresaVista) =>
    e.estado.error ? `${e.nombre}, no responde` : e.conocidos ? `${e.nombre}, ${e.agentes} ${e.agentes === 1 ? "agente" : "agentes"}` : e.nombre;
  const alternar = (prefijo: string) => {
    const siguiente = filtro.includes(prefijo) ? filtro.filter((p) => p !== prefijo) : [...filtro, prefijo];
    onFiltro(siguiente.length >= todas.length ? [] : siguiente.sort());
  };
  return (
    <div className={cx("of-cofs", celular && "is-m", compacto && "is-cmp")} role="group" aria-label="Filtrar por empresa">
      <button type="button" className={cx("of-cof is-all", filtro.length === 0 && "is-on")} aria-pressed={filtro.length === 0} onClick={() => onFiltro([])}>
        Todas
      </button>
      {oficina.empresas.map((e) => {
        const on = filtro.includes(e.prefijo);
        return (
          <button
            key={e.id}
            type="button"
            className={cx("of-cof", on && "is-on")}
            aria-pressed={on}
            title={e.nombre}
            aria-label={celular || compacto ? nombreLeido(e) : undefined}
            onClick={() => alternar(e.prefijo)}
          >
            <EtiquetaEmpresa prefijo={e.prefijo} solida={on} />
            {celular || compacto ? null : <span className="of-nm">{e.nombre}</span>}
            <span className="of-n">{e.estado.error ? <Icono nombre="triangle-alert" tam={12} /> : e.conocidos ? e.agentes : "–"}</span>
          </button>
        );
      })}
    </div>
  );
}

export function ChipAnimacionReducida({ soloIcono = false }: { soloIcono?: boolean }) {
  const ayuda = "Tu sistema pide menos animación: los personajes quedan quietos y solo cambian cuando cambia su estado";
  return (
    <span className={cx("of-rmchip", soloIcono && "is-ic")} title={ayuda}>
      <Icono nombre="pause" tam={12} />
      {soloIcono ? <span className="of-sr">Animación reducida</span> : "Animación reducida"}
    </span>
  );
}

/** Banners de arriba del piso (§12): empresas que no respondieron, sin «Te toca» y «todos libres». */
export function Banners({ oficina, corto, c, libres }: { oficina: Oficina; corto: boolean; c: ContadoresVista; libres: boolean }) {
  const caidas = oficina.caidas;
  const total = oficina.empresas.length;
  const reintentar = (
    <button type="button" className="of-btn is-sm" onClick={oficina.reintentar}>
      <Icono nombre="refresh" tam={14} />
      Reintentar
    </button>
  );
  const banners = [];
  if (oficina.errorEmpresas) {
    banners.push(
      <div key="emp" className="of-banner" role="alert">
        <Icono nombre="triangle-alert" tam={14} />
        <span>
          <b>No pude leer las empresas.</b> {oficina.errorEmpresas}
        </span>
        <span className="of-sp" />
        {reintentar}
      </div>,
    );
  }
  if (caidas.length > 0) {
    const n = total - caidas.length;
    const otras = n === 1 ? "La otra empresa está al día" : `Las otras ${n} empresas están al día`;
    const quedan = caidas.length === 1 ? "queda a oscuras" : "quedan a oscuras";
    const responda = caidas.length === 1 ? "responda" : "respondan";
    banners.push(
      <div key="caidas" className="of-banner" role="alert">
        <Icono nombre="triangle-alert" tam={14} />
        <span>
          <b>No pude leer {nombres(caidas)}.</b>{" "}
          {corto ? (n === 1 ? "La otra está al día." : `Las otras ${n} están al día.`) : `${otras}; ${nombres(caidas)} ${quedan} hasta que ${responda}.`}
        </span>
        <span className="of-sp" />
        {reintentar}
      </div>,
    );
  }
  if (oficina.sinAtencion && !oficina.cargando) {
    banners.push(
      <div key="toca" className="of-banner" role="alert">
        <Icono nombre="triangle-alert" tam={14} />
        <span>
          <b>No pude leer «Te toca».</b>{" "}
          {corto ? "No sé quién te necesita; lo demás está al día." : "Por ahora no sé quién te necesita; el resto de la oficina está al día."}
        </span>
        <span className="of-sp" />
        {reintentar}
      </div>,
    );
  }
  if (libres) {
    const n = c.libre;
    banners.push(
      <div key="libres" className="of-banner is-ok" role="status">
        <Icono nombre="coffee" tam={14} />
        <span>
          <b>Todos libres.</b> {corto ? "Nadie trabajando ni esperándote." : `Nadie trabajando ni esperándote: ${n === 1 ? "está en la sala de descanso" : `los ${n} están en la sala de descanso`}.`}
        </span>
      </div>,
    );
  }
  return <>{banners}</>;
}

/** Leyenda bajo el piso: centrada en computador, en una caja en el celular. */
export function Leyenda({ celular }: { celular: boolean }) {
  return (
    <div className={cx("of-leyenda", celular && "is-m")}>
      {ORDEN_LEYENDA.map((st) => (
        <span key={st} className={`of-c-${st}`}>
          <Icono nombre={ESTADOS[st].icono} tam={12} />
          {celular ? (
            <span>
              <b>{ESTADOS[st].label}</b> {ESTADOS[st].leyenda}
            </span>
          ) : (
            `${ESTADOS[st].label}: ${ESTADOS[st].leyenda}`
          )}
        </span>
      ))}
      {/* 0.3.0 (JST-96 §5): caminar, las conversaciones y las mascotas no van: no informan nada nuevo. */}
      <span className="of-ley-sobre">
        <Icono nombre="mail" tam={12} />
        {celular ? (
          <span>
            <b>Sobre</b> le pasaron una tarea
          </span>
        ) : (
          "Sobre: le pasaron una tarea"
        )}
      </span>
    </div>
  );
}

/**
 * «Mascotas» (JST-96 §8): muestra u oculta las 4 mascotas del pasillo. La
 * elección se guarda en el navegador y vale para la página, el widget y el TV.
 * En el celular, solo el ícono.
 */
export function BotonMascotas({ celular }: { celular: boolean }) {
  const { mascotas } = useAjustes();
  const titulo = mascotas ? "Ocultar las mascotas (se guarda en este navegador)" : "Mostrar las mascotas (se guarda en este navegador)";
  const alternar = () => cambiarAjustes({ mascotas: !mascotas });
  if (celular) {
    return (
      <button type="button" className={cx("of-ibtn is-ghost of-petbtn is-m", !mascotas && "is-off")} aria-pressed={mascotas} aria-label={mascotas ? "Mascotas" : "Mascotas ocultas"} title={titulo} onClick={alternar}>
        <Icono nombre="paw-print" tam={14} />
      </button>
    );
  }
  return (
    <button type="button" className={cx("of-btn is-sm of-petbtn", !mascotas && "is-off")} aria-pressed={mascotas} title={titulo} onClick={alternar}>
      <Icono nombre="paw-print" tam={14} />
      {mascotas ? "Mascotas" : "Mascotas ocultas"}
    </button>
  );
}

// «Conversaciones» (JST-162 §4) pasó a abrir un menú en la 0.7.0 (JST-231): `menuConversaciones.tsx`.
