// «Quién habla» en el panel «Voces» (0.11.0, JST-325; design-spec de JST-324 rev
// 2, A · Todo en «Voces»): la voz del Resumen, la de «Leer contexto» y, en una
// página dentro del mismo panel, la de cada agente. Cada voz tiene su ▶ para
// oírla antes. Los clones se ven pero no se pueden elegir para leer al momento
// (tardan 14 a 28 s por la primera frase). Cambiar la voz de un agente graba
// sus frases en la Mac; mientras tanto sigue con la de antes.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { nombreCorto, textoVoz } from "../avisos.js";
import { esAlMomento, grupoDe, nombreEnLista, NUMERO_VOZ, porqueNoAlcanza, tardaGrabar, VOCES_AL_MOMENTO, type GrabandoVoz, type VozLectura } from "../eleccionVoces.js";
import { claveAudio, VOCES, vozPorId, type IndiceVoces, type VozId } from "../voces.js";
import type { AgenteVista } from "../vista.js";
import { cargarIndice, useIndiceVoces } from "./audiosVoces.js";
import { descartarError, elegirLectura, elegirVozAgente, reiniciarVoces, reintentar, useEleccion, useErrorVoz, useEstadoMotores, useGrabando, useHayCambios } from "./eleccion.js";
import { motivoNoDisponible } from "./prepararVoces.js";
import { detenerMuestra, tocarMuestra, useMuestra } from "./muestraVoz.js";
import { cx, EtiquetaEmpresa, Icono, Personaje } from "./piso.js";

// ---------------------------------------------------------------------------
// Lo que se ofrece en cada lugar
// ---------------------------------------------------------------------------

type Lugar = "resumen" | "contexto" | "agente";

interface Opcion {
  /** Lo que se elige: una voz, `"navegador"` o `"igual"`. */
  valor: VozId | "navegador" | "igual";
  nombre: string;
  numero: number | null;
  detalle: string;
  /** Por qué no se puede elegir (los clones al leer al momento); se ve, y el ▶ sigue funcionando. */
  porque: string | null;
  grupo: "momento" | "no" | null;
}

const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Las opciones de cada lista, en orden (JST-324 §1.1). `edgeAviso`: «Leer contexto» manda el texto de la tarea a Microsoft con Lorenzo o Catalina. */
export function opcionesDe(lugar: Lugar, hoyResumen: string, edgeAviso = false): Opcion[] {
  const de = (id: VozId): Opcion => {
    const v = vozPorId(id)!;
    const porque = lugar === "agente" ? null : porqueNoAlcanza(id);
    const microsoft = edgeAviso && v.motor === "edge" ? " · manda el texto a Microsoft" : "";
    const graba = lugar === "agente" ? ` · graba sus frases en ${tardaGrabar(id)}` : "";
    return { valor: id, nombre: nombreEnLista(id), numero: esAlMomento(id) ? (NUMERO_VOZ[id] ?? null) : null, detalle: `${mayuscula(v.detalle)}${microsoft}${graba}`, porque, grupo: lugar === "agente" ? null : porque ? "no" : "momento" };
  };
  if (lugar === "agente") return VOCES.map((v) => de(v.id));
  const lista: Opcion[] = [];
  if (lugar === "contexto") lista.push({ valor: "igual", nombre: "Igual que el Resumen", numero: null, detalle: `Hoy: ${hoyResumen}`, porque: null, grupo: "momento" });
  for (const id of VOCES_AL_MOMENTO) lista.push(de(id));
  lista.push({ valor: "navegador", nombre: "Voz del navegador", numero: null, detalle: "No espera, pero suena robótica", porque: null, grupo: "momento" });
  for (const v of VOCES) if (!VOCES_AL_MOMENTO.includes(v.id)) lista.push(de(v.id));
  return lista;
}

/** Cómo se ve la voz en el disparador. */
export function etiquetaDe(valor: VozId | "navegador" | "igual", resumen: VozLectura): string {
  if (valor === "navegador") return "Navegador";
  if (valor === "igual") return `Igual · ${resumen === "navegador" ? "Navegador" : nombreEnLista(resumen)}`;
  return nombreEnLista(valor);
}

// ---------------------------------------------------------------------------
// El disparador y la lista
// ---------------------------------------------------------------------------

function Disparador({ texto, abierta, onClick, ancho = false, girando = false, deshabilitada = false, etiqueta, titulo }: { texto: string | null; abierta: boolean; onClick: () => void; ancho?: boolean; girando?: boolean; deshabilitada?: boolean; etiqueta: string; titulo?: string }) {
  return (
    <button type="button" className={cx("vz-sel", abierta && "is-open", ancho && "is-ancho", girando && "is-gira")} aria-haspopup="listbox" aria-expanded={abierta} aria-label={etiqueta} title={titulo} disabled={deshabilitada} onClick={onClick}>
      {girando ? <Icono nombre="loader" tam={12} className="of-spin" /> : null}
      {texto === null ? <span className="vz-sk" aria-hidden="true" /> : <span className="vz-sel-t">{texto}</span>}
      <Icono nombre="chevron-down" tam={12} />
    </button>
  );
}

/** Un ▶ por voz: suena una muestra a la vez; mientras suena, es un ■ (se detiene). */
function Reproducir({ voz, nombre, xs = false }: { voz: VozId | "navegador"; nombre: string; xs?: boolean }) {
  const suena = useMuestra() === voz;
  return (
    <button type="button" className={cx("vz-play", xs && "is-xs", suena && "is-on")} aria-label={suena ? `Detener la muestra de ${nombre}` : `Oír la muestra de ${nombre}`} title={suena ? "Detener" : "Oír la muestra"} onClick={() => void tocarMuestra(voz)}>
      <Icono nombre={suena ? "square" : "play"} tam={suena ? 12 : 14} />
    </button>
  );
}

/** La lista se abre bajo su fila (no flota) y el panel se desplaza lo justo para que se vea entera. */
function ListaVoces({ opciones, valor, cargando, onElegir, etiqueta, noDisponible }: { opciones: readonly Opcion[]; valor: string; cargando?: boolean; onElegir: (v: Opcion["valor"]) => void; etiqueta: string; noDisponible?: (o: Opcion) => string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    ref.current?.scrollIntoView?.({ block: "nearest" });
  }, []);
  if (cargando) {
    return (
      <div ref={ref} className="vz-lista" aria-busy="true" aria-label={etiqueta}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="vz-op is-sk">
            <span className="vz-rd" />
            <span className="vz-op-t">
              <span className="vz-sk is-l" />
              <span className="vz-sk is-s" />
            </span>
          </div>
        ))}
      </div>
    );
  }
  const filas: ReactNode[] = [];
  let grupo: Opcion["grupo"] | undefined;
  for (const o of opciones) {
    if (o.grupo && o.grupo !== grupo) filas.push(<div key={`g-${o.grupo}`} className="vz-gt">{o.grupo === "momento" ? "Leen al momento" : "No alcanzan a leer al momento"}</div>);
    grupo = o.grupo;
    const sin = noDisponible?.(o) ?? null;
    const porque = o.porque ?? sin;
    const on = o.valor === valor;
    filas.push(
      <div key={o.valor} className={cx("vz-op", on && "is-on", porque && "is-off")}>
        <button type="button" role="radio" aria-checked={on} aria-disabled={porque ? true : undefined} title={porque ?? undefined} className="vz-op-b" onClick={() => !porque && onElegir(o.valor)}>
          <span className="vz-rd" aria-hidden="true">{on ? <i /> : null}</span>
          <span className="vz-op-t">
            <b>
              {o.nombre}
              {o.numero ? <span className="vz-num">#{o.numero}</span> : null}
            </b>
            <em>
              {porque ? (
                <>
                  <Icono nombre="clock" tam={12} /> {porque}
                </>
              ) : (
                o.detalle
              )}
            </em>
          </span>
        </button>
        {o.valor === "igual" ? <span className="vz-play-x" /> : <Reproducir voz={o.valor} nombre={o.nombre} />}
      </div>,
    );
  }
  return (
    <div ref={ref} className="vz-lista" role="radiogroup" aria-label={etiqueta}>
      {filas}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Errores y «Volver a como estaba»
// ---------------------------------------------------------------------------

const MOTIVO: Record<string, string> = {
  red: "No pude hablar con la Mac.",
  pedido: "No pude guardar la voz.",
  "sin-mac": "No pude guardar la voz.",
  "sin-voces": "No pude guardar la voz.",
  grabar: "No pude grabar las frases.",
};

function ErrorFila({ donde, companyId }: { donde: string; companyId: string }) {
  const e = useErrorVoz();
  if (!e || e.donde !== donde) return null;
  return (
    <div className="vz-err" role="alert">
      <Icono nombre="triangle-alert" tam={14} />
      <span>
        <b>{MOTIVO[e.motivo] ?? MOTIVO.pedido}</b> Sigue la de antes.
      </span>
      <button type="button" className="of-btn is-xs" onClick={() => void reintentar(companyId)}>
        Reintentar
      </button>
      <button type="button" className="of-ibtn is-ghost" aria-label="Cerrar el aviso" onClick={descartarError}>
        <Icono nombre="x" tam={12} />
      </button>
    </div>
  );
}

/** «Volver a como estaba»: solo si cambiaste algo; pregunta antes, dentro del panel (JST-324 §1.4). */
function Volver({ companyId }: { companyId: string }) {
  const hay = useHayCambios();
  const [pregunta, setPregunta] = useState(false);
  if (!hay) return null;
  if (pregunta) {
    return (
      <div className="vz-conf" role="alertdialog" aria-label="Volver a las voces de antes">
        <span>
          <b>¿Volver a las voces de antes?</b> El Resumen con Alex, «Leer contexto» con Dora y cada agente con la que tenía.
        </span>
        <div className="vz-conf-b">
          <button type="button" className="of-btn is-sm is-ghost" onClick={() => setPregunta(false)}>
            Cancelar
          </button>
          <button
            type="button"
            className="of-btn is-sm"
            onClick={() => {
              setPregunta(false);
              void reiniciarVoces(companyId);
            }}
          >
            Volver
          </button>
        </div>
      </div>
    );
  }
  return (
    <button type="button" className="vz-volver" onClick={() => setPregunta(true)}>
      <Icono nombre="rotate-ccw" tam={12} />
      Volver a como estaba
    </button>
  );
}

// ---------------------------------------------------------------------------
// «Quién habla»
// ---------------------------------------------------------------------------

function FilaQuien({ icono, titulo, debajo, children, onClick }: { icono: string; titulo: string; debajo: string; children: ReactNode; onClick?: () => void }) {
  const cuerpo = (
    <>
      <Icono nombre={icono} tam={14} />
      <span className="vz-q-t">
        <b>{titulo}</b>
        <em>{debajo}</em>
      </span>
      {children}
    </>
  );
  return onClick ? (
    <button type="button" className="vz-q is-link" onClick={onClick}>
      {cuerpo}
    </button>
  ) : (
    <div className="vz-q">{cuerpo}</div>
  );
}

/** El grupo «Quién habla» de «Voces» (arriba de «Avisos»). */
export function QuienHabla({ agentes, companyId, onAgentes }: { agentes: readonly AgenteVista[]; companyId: string | null; onAgentes: () => void }) {
  const e = useEleccion();
  const indice = useIndiceVoces();
  const [abierta, setAbierta] = useState<"resumen" | "contexto" | null>(null);
  useEffect(() => {
    void cargarIndice();
  }, []);
  useEffect(() => () => detenerMuestra(), []);
  const hoy = e.resumen === "navegador" ? "Voz del navegador" : nombreEnLista(e.resumen);
  const elegir = (quien: "resumen" | "contexto", v: Opcion["valor"]) => {
    setAbierta(null);
    if (companyId) void elegirLectura(companyId, quien, v as VozLectura | "igual");
  };
  const voces = new Set(Object.values(indice?.agentes ?? {})).size;
  const nGrabando = useGrabando().filter((g) => g.quien === "agente" && !g.error).length;
  // Esc cierra la lista abierta antes de cerrar el panel.
  useEffect(() => {
    if (!abierta) return;
    const tecla = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      ev.stopPropagation();
      setAbierta(null);
    };
    document.addEventListener("keydown", tecla, true);
    return () => document.removeEventListener("keydown", tecla, true);
  }, [abierta]);
  return (
    <>
      <div className="of-vz-cab vz-cab1" aria-hidden="true">
        <span>Quién habla</span>
      </div>
      <div className="vz-qh" role="group" aria-label="Quién habla">
        <FilaQuien icono="audio-lines" titulo="Resumen" debajo="«Resumen» y «3 agentes te necesitan»">
          <Disparador texto={etiquetaDe(e.resumen, e.resumen)} abierta={abierta === "resumen"} etiqueta={`Voz del Resumen: ${hoy}`} onClick={() => setAbierta(abierta === "resumen" ? null : "resumen")} />
        </FilaQuien>
        {abierta === "resumen" ? <ListaVoces opciones={opcionesDe("resumen", hoy)} valor={e.resumen} etiqueta="Voz del Resumen" onElegir={(v) => elegir("resumen", v)} /> : null}
        <FilaQuien icono="volume-2" titulo="Leer contexto" debajo="El 🔊 de las tareas y de la ventana">
          <Disparador texto={etiquetaDe(e.contexto, e.resumen)} abierta={abierta === "contexto"} etiqueta={`Voz de Leer contexto: ${etiquetaDe(e.contexto, e.resumen)}`} onClick={() => setAbierta(abierta === "contexto" ? null : "contexto")} />
        </FilaQuien>
        {abierta === "contexto" ? <ListaVoces opciones={opcionesDe("contexto", hoy, true)} valor={e.contexto} etiqueta="Voz de Leer contexto" onElegir={(v) => elegir("contexto", v)} /> : null}
        <FilaQuien icono="message-circle" titulo="Cada agente" debajo={`${agentes.length} agentes${voces > 0 ? ` con ${voces} voces` : ""}${nGrabando > 0 ? ` · grabando ${nGrabando}` : ""}`} onClick={onAgentes}>
          <span className="vz-q-go">
            Elegir
            <Icono nombre="chevron-right" tam={12} />
          </span>
        </FilaQuien>
      </div>
      {companyId ? <ErrorFila donde="resumen" companyId={companyId} /> : null}
      {companyId ? <ErrorFila donde="contexto" companyId={companyId} /> : null}
      {companyId ? <Volver companyId={companyId} /> : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// «Voces de los agentes»
// ---------------------------------------------------------------------------

const CLAVE_ABIERTAS = "of-vz-co";

function leerAbiertas(): string[] {
  try {
    const x = JSON.parse(localStorage.getItem(CLAVE_ABIERTAS) ?? "[]") as unknown;
    return Array.isArray(x) ? x.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/** El agente tiene grabadas las frases con esa voz (para elegirla sin la Mac). */
function tieneGrabada(indice: IndiceVoces | null, a: AgenteVista, voz: VozId): boolean {
  return !!indice?.audios[claveAudio(voz, textoVoz(nombreCorto(a.nombre), a.empresa, "fin", "nombre-empresa"))];
}

function Grabando({ g }: { g: GrabandoVoz }) {
  const sigue = g.sigueCon ? nombreEnLista(g.sigueCon) : "la de antes";
  const texto = g.error ? "" : g.enCola ? `En cola · sigue con ${sigue}` : g.esperaMac ? `Esperando a que la Mac esté libre · sigue con ${sigue}` : `Grabando ${g.hechas} de ${g.total} · sigue con ${sigue}`;
  if (g.error) return null;
  return (
    <div className="vz-prep-f" role="status">
      <span className="vz-prep">{texto}</span>
      <span className="vz-barra" aria-hidden="true">
        <i style={{ width: `${g.total > 0 ? Math.round((g.hechas / g.total) * 100) : 0}%` }} />
      </span>
    </div>
  );
}

function FilaAgente({ a, indice, grabando, companyId, sinMac }: { a: AgenteVista; indice: IndiceVoces | null; grabando: GrabandoVoz | undefined; companyId: string; sinMac: boolean }) {
  const [abierta, setAbierta] = useState(false);
  const actual = indice?.agentes[a.id] ?? null;
  const cargando = indice === null;
  const elegir = (v: Opcion["valor"]) => {
    setAbierta(false);
    void elegirVozAgente(companyId, { id: a.id, corto: nombreCorto(a.nombre), empresa: a.empresa }, v as VozId);
  };
  // 0.13.0: por motor (Supertonic puede estar sin uv ni ffmpeg, y a Supertonic y Kokoro les puede faltar el modelo).
  const est = useEstadoMotores();
  const noDisponible = (o: Opcion) => {
    if (o.valor === actual || tieneGrabada(indice, a, o.valor as VozId)) return null;
    const v = vozPorId(o.valor as VozId);
    const motivo = est && v ? motivoNoDisponible(est, grupoDe(v.motor)) : sinMac ? "falta uv o ffmpeg" : null;
    return motivo ? `No disponible en este computador: ${motivo}` : null;
  };
  return (
    <>
      <div className="vz-ag">
        <span className="vz-ag-c" aria-hidden="true">
          <Personaje aspecto={a.aspecto} anim="parado" x={0} y={0} quieto />
        </span>
        <span className="vz-ag-t">
          <b title={a.nombre}>{a.nombre}</b>
        </span>
        <Disparador
          texto={cargando ? null : grabando && !grabando.error ? nombreEnLista(grabando.voz) : actual ? nombreEnLista(actual) : "Sin voz"}
          abierta={abierta}
          girando={!!grabando && !grabando.error}
          deshabilitada={!cargando && !actual}
          etiqueta={`Voz de ${a.nombre}`}
          titulo={!cargando && !actual ? "Todavía no tiene voz: se reparte con «Preparar voces», en el panel «Voces»" : undefined}
          onClick={() => setAbierta(!abierta)}
        />
        {actual ? <Reproducir voz={actual} nombre={nombreEnLista(actual)} xs /> : <span className="vz-play-x" />}
      </div>
      {grabando ? <Grabando g={grabando} /> : null}
      <ErrorFila donde={`agente:${a.id}`} companyId={companyId} />
      {abierta ? <ListaVoces opciones={opcionesDe("agente", "")} valor={grabando && !grabando.error ? grabando.voz : (actual ?? "")} cargando={cargando} onElegir={elegir} etiqueta={`Voz de ${a.nombre}`} noDisponible={noDisponible} /> : null}
    </>
  );
}

/** La página «Voces de los agentes»: 4 empresas plegadas y la voz de cada agente con su ▶. */
export function PaginaAgentes({ agentes, companyId, sinMac, onVolver }: { agentes: readonly AgenteVista[]; companyId: string; sinMac: boolean; onVolver: () => void }) {
  const indice = useIndiceVoces();
  const grabando = useGrabando();
  const [abiertas, setAbiertas] = useState<string[]>(leerAbiertas);
  useEffect(() => {
    void cargarIndice();
  }, []);
  useEffect(() => () => detenerMuestra(), []);
  const alternar = useCallback((id: string) => {
    setAbiertas((antes) => {
      const n = antes.includes(id) ? antes.filter((x) => x !== id) : [...antes, id];
      try {
        localStorage.setItem(CLAVE_ABIERTAS, JSON.stringify(n));
      } catch {
        // Sin almacenamiento local: vale mientras la página siga abierta.
      }
      return n;
    });
  }, []);
  // Esc (o ‹) vuelve a «Voces»; con una lista abierta, el Esc de la lista va primero.
  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape" || ev.defaultPrevented) return;
      ev.stopPropagation();
      onVolver();
    };
    document.addEventListener("keydown", tecla, true);
    return () => document.removeEventListener("keydown", tecla, true);
  }, [onVolver]);
  const empresas = useMemo(() => {
    const m = new Map<string, { id: string; prefijo: string; nombre: string; agentes: AgenteVista[] }>();
    for (const a of agentes) {
      const e = m.get(a.companyId) ?? { id: a.companyId, prefijo: a.prefijo, nombre: a.empresa, agentes: [] };
      e.agentes.push(a);
      m.set(a.companyId, e);
    }
    return [...m.values()].sort((x, y) => x.prefijo.localeCompare(y.prefijo)).map((e) => ({ ...e, agentes: e.agentes.sort((p, q) => p.nombre.localeCompare(q.nombre)) }));
  }, [agentes]);
  return (
    <div className="of-avp of-vzp vz-pag">
      <div className="of-avp-h vz-pag-h">
        <button type="button" className="of-ibtn is-ghost vz-atras" aria-label="Volver a «Voces»" onClick={onVolver}>
          <Icono nombre="chevron-left" tam={14} />
        </button>
        <b>Voces de los agentes</b>
      </div>
      <p>Abre una empresa y elige la voz de cada uno; ▶ para oírla. Con una voz nueva, sus frases se graban de nuevo (~1 min; ~10 min un clon) y mientras sigue con la de antes.</p>
      <div className="vz-cos">
        {empresas.map((e) => {
          const abierta = abiertas.includes(e.id);
          const usadas = new Set(e.agentes.map((a) => indice?.agentes[a.id]).filter(Boolean)).size;
          const grabandoAqui = e.agentes.some((a) => grabando.some((g) => g.agenteId === a.id && !g.error));
          return (
            <section key={e.id} className={cx("vz-co", abierta && "is-open")}>
              <button type="button" className="vz-co-h" aria-expanded={abierta} onClick={() => alternar(e.id)}>
                <Icono nombre={abierta ? "chevron-down" : "chevron-right"} tam={14} />
                <EtiquetaEmpresa prefijo={e.prefijo} />
                <b>{e.nombre}</b>
                <span className="vz-co-n">
                  {grabandoAqui ? <Icono nombre="loader" tam={12} className="of-spin" /> : null}
                  {e.agentes.length} agentes{usadas > 0 ? ` · ${usadas} voces` : ""}
                </span>
              </button>
              {abierta ? (
                <div className="vz-co-b">
                  {e.agentes.map((a) => (
                    <FilaAgente key={a.id} a={a} indice={indice} grabando={grabando.find((g) => g.agenteId === a.id)} companyId={companyId} sinMac={sinMac} />
                  ))}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
      <Volver companyId={companyId} />
      <p className="vz-nota">Vale en todos tus navegadores y en el TV.</p>
    </div>
  );
}

