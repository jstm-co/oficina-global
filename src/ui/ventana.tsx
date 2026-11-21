// Ventana para responder sin salir (design-spec de JST-95 §5): un diálogo
// centrado de 600 px en computador y la pantalla entera en el celular, con
// una espera a la vez y pasos arriba si espera varias cosas. La montan la
// página, el widget y el TV (dentro de una capa).
//
// La Oficina escribe solo aquí y solo cuando el usuario toca enviar: antes
// vuelve a leer la espera (si ya no está pendiente, lo dice y no envía nada) y
// después hace un único POST con su sesión, sin reintentos automáticos.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { nombreCorto } from "../avisos.js";
import { hrefTarea, tituloVisible, type Espera } from "../estado.js";
import { enviar, leerAprobacion, listarInteracciones, type Conexion } from "../fuentes.js";
import {
  aTuNombre,
  borradorInicial,
  chipDe,
  claseDe,
  contenidoDe,
  elegir,
  falta,
  marcarCasilla,
  marcarTarea,
  motivoFuera,
  partesNegrita,
  peticion,
  respondidaEn,
  respuestaGuardada,
  resultadoDe,
  vigencia,
  type Accion,
  type Borrador,
  type Contenido,
  type Detalle,
  type Modo,
  type Pregunta,
} from "../responder.js";
import type { Sincronizador } from "../sincronizador.js";
import { t } from "../i18n.js";
import { hace, type AgenteVista } from "../vista.js";
import { useAtraparFoco, useEsc } from "./capas.js";
import type { Enlazar } from "./ficha.js";
import { CajaPersonaje, cx, EtiquetaEmpresa, Icono } from "./piso.js";
import { BotonContextoVentana, callarSiEsDeOtra, callarSiLee, ErrorVentana, EscritoVentana, leeEsta, tareaDeEspera } from "./contextoVentana.js";
import { contexto, useContexto } from "./contextoBarra.js";

export interface PropsVentana {
  /** El agente que espera, con sus esperas vivas (`teNecesita`, la más antigua primero). */
  agente: AgenteVista;
  /** Índice de la espera que se abre (en `agente.teNecesita`). */
  inicial: number;
  /** Para leer y volver a leer «Te toca» de la empresa (`refrescarAtencion`). */
  sync: Sincronizador | null;
  /** Todos los agentes (los nombres de «Para ‹agente›» en las tareas sugeridas). */
  agentes: readonly AgenteVista[];
  /** < 768 px: pantalla entera. */
  celular: boolean;
  rm: boolean;
  enlazar: Enlazar;
  ahora: number;
  /** Cerrar (✕, Esc, el velo, «Cerrar», o al no quedar nada). */
  onCerrar: () => void;
  /** Aviso breve de la página («✓ Listo: no queda nada que responder a ‹corto› aquí.»). */
  avisar: (contenido: ReactNode) => void;
  /** Conexión con Paperclip (por omisión, el mismo origen con la sesión del usuario). */
  cx?: Conexion;
}

/** Lo escrito y lo marcado, por espera, mientras la pestaña esté abierta (§5). */
const borradores = new Map<string, Borrador>();

/** Pasa sola a la siguiente espera 1,3 s después de «Listo, respondido». */
const PASA_SOLA_MS = 1_300;

/**
 * Cómo va cada espera en esta ventana. `envio`:
 *   - `ok`: la respondiste tú ahora;
 *   - `ya`: ya estaba respondida (desde otra pestaña o Telegram);
 *   - `vencida`: ya no espera (retirada, reemplazada o la tarea se cerró);
 *   - `fallo`: sin conexión o 5xx (no se guardó nada); `invalido`: 4xx con el mensaje del servidor.
 */
interface EstadoEspera {
  lectura: "nada" | "leyendo" | "ok" | "fallo";
  errorLectura: string | null;
  detalle: Detalle | null;
  envio: "" | "enviando" | "ok" | "ya" | "vencida" | "fallo" | "invalido";
  mensaje: string | null;
  /** Nota ámbar «Falta algo». */
  falta: string | null;
  ultimaAccion: Accion | null;
}

const NUEVO: EstadoEspera = { lectura: "nada", errorLectura: null, detalle: null, envio: "", mensaje: null, falta: null, ultimaAccion: null };

const terminada = (s: EstadoEspera | undefined) => !!s && (s.envio === "ok" || s.envio === "ya" || s.envio === "vencida");

/** Lee la espera (tarjeta o aprobación). `null`: ya no existe. */
async function leerEspera(cx: Conexion, e: Espera): Promise<Detalle | null> {
  if (!e.sujetoId) return null;
  if (e.tipo === "aprobacion") return { de: "aprobacion", a: await leerAprobacion(cx, e.sujetoId) };
  if (!e.issueId) return null;
  const i = (await listarInteracciones(cx, e.issueId)).find((x) => x.id === e.sujetoId);
  return i ? { de: "interaccion", i } : null;
}

function Negrita({ texto }: { texto: string }) {
  return (
    <>
      {partesNegrita(texto).map((p, i) => (p.b ? <b key={i}>{p.t}</b> : <span key={i}>{p.t}</span>))}
    </>
  );
}

function Nota({ tipo, icono, children }: { tipo: "info" | "ok" | "err" | "warn"; icono: string; children: ReactNode }) {
  return (
    <div className={`of-rnote is-${tipo}`} role={tipo === "err" || tipo === "warn" ? "alert" : "status"}>
      <Icono nombre={icono} tam={14} />
      <span>{children}</span>
    </div>
  );
}

const ESQUELETO = [88, 64, 92, 76];

export function VentanaResponder({ agente, inicial, sync, agentes, celular, rm, enlazar, ahora, onCerrar, avisar, cx: conexion }: PropsVentana): ReactNode {
  const cx_ = conexion ?? { base: "" };
  const conRef = useRef(cx_);
  conRef.current = cx_;
  const corto = nombreCorto(agente.nombre);

  // Los pasos quedan fijos mientras la ventana está abierta: los del momento de abrir y los que lleguen.
  const [pasos, setPasos] = useState<Espera[]>(() => [...agente.teNecesita]);
  const [indice, setIndice] = useState(() => Math.max(0, Math.min(inicial, agente.teNecesita.length - 1)));
  const [estados, setEstados] = useState<Record<string, EstadoEspera>>({});
  const [, setVersion] = useState(0);
  const estadosRef = useRef(estados);
  estadosRef.current = estados;
  const montada = useRef(true);
  useEffect(
    () => () => {
      montada.current = false;
    },
    [],
  );

  const cambiar = useCallback((itemId: string, cambio: Partial<EstadoEspera>) => {
    if (!montada.current) return;
    setEstados((todos) => ({ ...todos, [itemId]: { ...(todos[itemId] ?? NUEVO), ...cambio } }));
  }, []);

  // Llegan esperas nuevas del mismo agente: se suman al final.
  const vivas = agente.teNecesita;
  useEffect(() => {
    setPasos((actuales) => {
      const nuevas = vivas.filter((e) => !actuales.some((x) => x.itemId === e.itemId));
      if (nuevas.length === 0) {
        // Se actualizan los datos (título, código) de las que siguen.
        const porId = new Map(vivas.map((e) => [e.itemId, e]));
        return actuales.some((x) => porId.has(x.itemId) && porId.get(x.itemId) !== x) ? actuales.map((x) => porId.get(x.itemId) ?? x) : actuales;
      }
      return [...actuales, ...nuevas];
    });
  }, [vivas]);

  const i = Math.max(0, Math.min(indice, pasos.length - 1));
  const espera = pasos[i];
  const estado = (espera && estados[espera.itemId]) ?? NUEVO;
  const clase = espera ? claseDe(espera) : "fuera";
  const contenido: Contenido | null = espera && clase !== "fuera" && estado.detalle ? contenidoDe(clase, estado.detalle, espera) : null;

  /** Lee una espera y deja su estado: lista para responder, o ya respondida / ya no espera. */
  const leer = useCallback(
    async (e: Espera) => {
      cambiar(e.itemId, { lectura: "leyendo", errorLectura: null });
      try {
        const d = await leerEspera(conRef.current, e);
        if (!d) {
          cambiar(e.itemId, { lectura: "ok", detalle: null, envio: "vencida" });
          return;
        }
        const v = vigencia(d);
        cambiar(e.itemId, { lectura: "ok", detalle: d, ...(v === "pendiente" ? {} : { envio: v === "respondida" ? "ya" : "vencida" }) });
      } catch (error) {
        cambiar(e.itemId, { lectura: "fallo", errorLectura: error instanceof Error ? error.message : String(error) });
      }
    },
    [cambiar],
  );

  // Al abrir cada espera que se responde aquí, se lee (una vez).
  useEffect(() => {
    if (!espera || claseDe(espera) === "fuera") return;
    if ((estadosRef.current[espera.itemId] ?? NUEVO).lectura === "nada") void leer(espera);
  }, [espera, leer]);

  // «Te toca» ya no trae una espera y no la respondiste tú: se vuelve a leer (no escribe) para decir qué pasó.
  const revisadas = useRef(new Set<string>());
  useEffect(() => {
    for (const e of pasos) {
      if (vivas.some((x) => x.itemId === e.itemId) || revisadas.current.has(e.itemId)) continue;
      const s = estadosRef.current[e.itemId];
      if (terminada(s) || s?.envio === "enviando") continue;
      revisadas.current.add(e.itemId);
      if (claseDe(e) === "fuera") cambiar(e.itemId, { envio: "vencida" });
      else void leer(e);
    }
  }, [pasos, vivas, leer, cambiar]);

  // «Leer contexto» (JST-321): lee la tarea de la pestaña activa. Al pasar a una pestaña de otra tarea se calla (de la
  // misma tarea, sigue); al cerrar la ventana, también.
  useContexto();
  const tareaCtx = tareaDeEspera(espera);
  useEffect(() => callarSiEsDeOtra(tareaCtx), [tareaCtx]);
  useEffect(() => () => contexto.detener(), []);

  // El borrador de la espera (lo escrito y lo marcado).
  const borrador: Borrador | null = espera && contenido ? (borradores.get(espera.itemId) ?? borradorInicial(contenido)) : null;
  const guardar = (b: Borrador) => {
    if (!espera) return;
    borradores.set(espera.itemId, b);
    setVersion((v) => v + 1);
    if (estado.falta) cambiar(espera.itemId, { falta: null });
  };

  /** La siguiente espera sin terminar después de `desde` (dando la vuelta), o -1. */
  const siguienteDe = (desde: number, todos: Record<string, EstadoEspera>) => {
    for (let k = 1; k <= pasos.length; k += 1) {
      const j = (desde + k) % pasos.length;
      if (j === desde) continue;
      if (!terminada(todos[pasos[j]!.itemId])) return j;
    }
    return -1;
  };
  const hayOtra = siguienteDe(i, estados) >= 0;

  const irA = (j: number) => {
    enfocado.current = false;
    setIndice(j);
  };
  const siguiente = () => {
    const j = siguienteDe(i, estadosRef.current);
    if (j >= 0) irA(j);
    else onCerrar();
  };

  // Después de «Listo», a los 1,3 s pasa sola a la siguiente; si no queda ninguna, se cierra y avisa.
  const timerOk = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timerOk.current) clearTimeout(timerOk.current);
  }, []);
  const pasarSola = (desde: number) => {
    if (timerOk.current) clearTimeout(timerOk.current);
    timerOk.current = setTimeout(() => {
      if (!montada.current) return;
      const j = siguienteDe(desde, estadosRef.current);
      if (j >= 0) irA(j);
      else {
        onCerrar();
        avisar(
          <>
            <Icono nombre="check" tam={14} />
            <span>{t("Listo: no queda nada que responder a {corto} aquí.", { corto })}</span>
          </>,
        );
      }
    }, PASA_SOLA_MS);
  };

  /** Tocar enviar: validar, volver a leer, y si sigue pendiente, un solo POST. */
  const enviarAccion = async (accion: Accion) => {
    if (!espera || !contenido || !borrador || estado.envio === "enviando") return;
    const e = espera;
    const desde = i;
    const motivo = falta(contenido, borrador, accion);
    if (motivo) {
      cambiar(e.itemId, { falta: motivo });
      return;
    }
    // El envío sale: se calla lo que se lee de esa tarea (si falta algo, arriba, sigue leyendo).
    callarSiLee(tareaDeEspera(e));
    cambiar(e.itemId, { envio: "enviando", falta: null, mensaje: null, ultimaAccion: accion });
    // Antes de enviar, ¿sigue pendiente? (alguien pudo responderla desde Telegram u otra pestaña).
    let d: Detalle | null;
    try {
      d = await leerEspera(conRef.current, e);
    } catch {
      cambiar(e.itemId, { envio: "fallo", mensaje: t("Paperclip no respondió (sin conexión).") });
      return;
    }
    if (!d || vigencia(d) !== "pendiente") {
      cambiar(e.itemId, { envio: d && vigencia(d) === "respondida" ? "ya" : "vencida", detalle: d ?? estado.detalle });
      void sync?.refrescarAtencion(agente.companyId);
      return;
    }
    const { path, cuerpo } = peticion(contenido, d, borrador, accion);
    const r = resultadoDe(await enviar(conRef.current, path, cuerpo));
    if (r.tipo === "ok") {
      borradores.delete(e.itemId);
      cambiar(e.itemId, { envio: "ok", detalle: d });
      void sync?.refrescarAtencion(agente.companyId);
      pasarSola(desde);
      return;
    }
    if (r.tipo === "revisar" || r.tipo === "vencida") {
      // 409: no se guardó nada; se lee para saber si la respondieron o la retiraron.
      let despues: Detalle | null = null;
      try {
        despues = await leerEspera(conRef.current, e);
      } catch {
        despues = null;
      }
      const respondida = r.tipo === "revisar" && despues && vigencia(despues) === "respondida";
      cambiar(e.itemId, { envio: respondida ? "ya" : "vencida", detalle: despues ?? d });
      void sync?.refrescarAtencion(agente.companyId);
      return;
    }
    cambiar(e.itemId, { envio: r.tipo === "fallo" ? "fallo" : "invalido", mensaje: r.mensaje });
  };

  // Foco: al abrir (y al pasar sola), al primer control de la espera o al botón primario.
  const ref = useRef<HTMLDivElement>(null);
  const enfocado = useRef(false);
  const lista = clase === "fuera" || estado.lectura === "ok" || estado.lectura === "fallo";
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!el.contains(document.activeElement)) el.focus();
    if (enfocado.current || !lista) return;
    enfocado.current = true;
    const control = el.querySelector<HTMLElement>(".of-rw-b input:not([disabled]), .of-rw-b textarea:not([disabled])");
    const primario = el.querySelector<HTMLElement>(".of-rw-f .is-primary:not([disabled])");
    (control ?? primario)?.focus();
  }, [lista, i]);
  useAtraparFoco(ref, true);
  useEsc(true, onCerrar);

  // La píldora activa siempre se ve: la tira de pasos se corre lo justo (sin animación al abrir ni con «reducir movimiento»).
  const tira = useRef<HTMLDivElement>(null);
  const tiraMovida = useRef(false);
  useEffect(() => {
    const s = tira.current;
    const on = s?.querySelector<HTMLElement>(".of-rw-step.is-on");
    if (!s || !on) return;
    const m = parseFloat(getComputedStyle(s).paddingLeft) || 0;
    const a = s.getBoundingClientRect();
    const b = on.getBoundingClientRect();
    const dx = b.left < a.left + m ? b.left - a.left - m : b.right > a.right - m ? b.right - a.right + m : 0;
    if (dx) s.scrollBy({ left: dx, behavior: rm || !tiraMovida.current ? "auto" : "smooth" });
    tiraMovida.current = true;
  }, [i, pasos.length, rm]);

  if (!espera) return null;

  const enviando = estado.envio === "enviando";
  const chip = chipDe(espera);
  const prefijo = agente.prefijo;
  const hrefCodigo = espera.identifier ? `${hrefTarea(prefijo, espera.identifier)}#interaction` : espera.href;
  const titulo = contenido?.titulo || (espera.titulo ? tituloVisible(espera.titulo) : "") || t(chip.label);
  const idTitulo = `of-rw-t-${espera.itemId.replace(/[^a-z0-9_-]/gi, "")}`;

  // ---------------- Cuerpo y pie ----------------
  let cuerpo: ReactNode = null;
  let botones: ReactNode = null;
  let aNombre = false;

  const btnSiguiente = (primario = true) =>
    hayOtra ? (
      <button type="button" className={cx("of-btn", primario && "is-primary")} onClick={siguiente}>
        {t("Siguiente")}
        <Icono nombre="chevron-right" tam={14} />
      </button>
    ) : (
      <button type="button" className={cx("of-btn", primario && "is-primary")} onClick={onCerrar}>
        {t("Cerrar")}
      </button>
    );

  if (clase === "fuera") {
    // No se responde aquí: lleva a la tarea.
    const hrefAbrir = espera.identifier ? hrefTarea(prefijo, espera.identifier) : espera.href;
    cuerpo =
      estado.envio === "vencida" ? (
        <Nota tipo="info" icono="clock">
          <b>{t("Ya no espera respuesta.")}</b> {t("{corto} la retiró, la reemplazó por una más nueva o la tarea se cerró. No se envió nada.", { corto })}
        </Nota>
      ) : (
        <Nota tipo="info" icono="external-link">
          <b>{t("Esto se responde en Paperclip.")}</b> {motivoFuera(espera)}
        </Nota>
      );
    botones =
      estado.envio === "vencida" ? (
        btnSiguiente()
      ) : (
        <>
          {hayOtra ? (
            <button type="button" className="of-btn" onClick={siguiente}>
              {t("Saltar")}
            </button>
          ) : null}
          {hrefAbrir ? (
            <a className="of-btn is-primary" {...enlazar(hrefAbrir)}>
              {espera.identifier ? t("Abrir {id}", { id: espera.identifier }) : t("Abrir en Paperclip")}
              <Icono nombre="arrow-up-right" tam={14} />
            </a>
          ) : null}
        </>
      );
  } else if (estado.envio === "ya") {
    const d = estado.detalle;
    const cuando = d ? hace(respondidaEn(d), ahora) : "";
    const guardada = d ? respuestaGuardada(contenido ?? contenidoDe(clase, d, espera), d) : null;
    cuerpo = (
      <>
        <Nota tipo="info" icono="check-check">
          <b>{t("Ya está respondida.")}</b>{" "}
          {cuando
            ? t("Alguien la respondió {cuando}, desde otra pestaña o desde Telegram. No se envió nada más.", { cuando })
            : t("Alguien la respondió, desde otra pestaña o desde Telegram. No se envió nada más.")}
        </Nota>
        {guardada ? (
          <div className="of-rans">
            <span>{t("Respuesta guardada")}</span>
            <b>{guardada}</b>
          </div>
        ) : null}
      </>
    );
    botones = btnSiguiente();
  } else if (estado.envio === "vencida") {
    cuerpo = (
      <Nota tipo="info" icono="clock">
        <b>{t("Ya no espera respuesta.")}</b> {t("{corto} la retiró, la reemplazó por una más nueva o la tarea se cerró. No se envió nada.", { corto })}
      </Nota>
    );
    botones = btnSiguiente();
  } else if (estado.envio === "ok") {
    cuerpo = (
      <Nota tipo="ok" icono="check">
        <b>{t("Listo, respondido.")}</b>{" "}
        {espera.identifier
          ? hayOtra
            ? t("{corto} sigue con {id}; pasando a la siguiente…", { corto, id: espera.identifier })
            : t("{corto} sigue con {id}.", { corto, id: espera.identifier })
          : hayOtra
            ? t("{corto} sigue con su tarea; pasando a la siguiente…", { corto })
            : t("{corto} sigue con su tarea.", { corto })}
      </Nota>
    );
    botones = btnSiguiente();
  } else if (estado.lectura === "fallo") {
    cuerpo = (
      <Nota tipo="err" icono="cloud-off">
        <b>{t("No pude leer esta espera.")}</b> {estado.errorLectura ?? t("Paperclip no respondió.")}
      </Nota>
    );
    botones = (
      <button type="button" className="of-btn is-primary" onClick={() => void leer(espera)}>
        <Icono nombre="refresh" tam={14} />
        {t("Reintentar")}
      </button>
    );
  } else if (!contenido || !borrador) {
    // Cargando el detalle.
    cuerpo = (
      <div className={cx("of-rsk", rm && "is-quieto")} aria-busy="true" aria-label={t("Cargando")}>
        {ESQUELETO.map((w) => (
          <i key={w} className="of-sk" style={{ width: `${w}%` }} />
        ))}
        <i className="of-sk is-big" />
        <i className="of-sk is-big" />
      </div>
    );
    botones = (
      <button type="button" className="of-btn is-primary" disabled>
        <Icono nombre="loader" tam={14} className="of-spin" />
        {t("Cargando…")}
      </button>
    );
  } else {
    aNombre = true;
    const c = contenido;
    const b = borrador;
    const etiqueta = (texto: string) =>
      enviando ? (
        <>
          <Icono nombre="loader" tam={14} className="of-spin" />
          {t("Enviando…")}
        </>
      ) : estado.envio === "fallo" ? (
        <>
          <Icono nombre="refresh" tam={14} />
          {t("Reintentar")}
        </>
      ) : (
        texto
      );
    const modo = (m: Modo) => {
      guardar({ ...b, modo: m });
      cambiar(espera.itemId, { falta: null, mensaje: null, envio: "" });
    };
    const motivoCampo = (label: string, opcional: boolean, placeholder: string | null) => (
      <>
        <label className="of-rlbl" htmlFor={`${idTitulo}-motivo`}>
          {label}
          {opcional ? <em> {t("(opcional)")}</em> : null}
        </label>
        <textarea
          id={`${idTitulo}-motivo`}
          className="of-rtx"
          rows={3}
          value={b.motivo}
          disabled={enviando}
          placeholder={placeholder ?? t("Cuéntale qué cambiarías")}
          onChange={(ev) => guardar({ ...b, motivo: ev.target.value })}
        />
      </>
    );
    const detalle = c.detalle ? (
      <p className="of-rdet">
        <Negrita texto={c.detalle} />
      </p>
    ) : null;
    const volver = (
      <button type="button" className="of-btn" disabled={enviando} onClick={() => modo("")}>
        {t("Volver")}
      </button>
    );

    if (c.clase === "preguntas") {
      cuerpo = c.preguntas.map((q) => (
        <PreguntaCampo key={q.id} q={q} b={b} nombre={idTitulo} conLeyenda={c.preguntas.length > 1 || q.prompt !== c.titulo} enviando={enviando} guardar={guardar} />
      ));
      botones = (
        <button type="button" className="of-btn is-primary is-toca" disabled={enviando} onClick={() => void enviarAccion("enviar")}>
          {etiqueta(c.submit)}
        </button>
      );
    } else if (c.clase === "confirmacion") {
      cuerpo = (
        <>
          {detalle}
          {b.modo === "rechazo" ? motivoCampo(c.etiquetaMotivo, !c.motivoObligatorio, c.placeholderMotivo) : null}
        </>
      );
      botones =
        b.modo === "rechazo" ? (
          <>
            {volver}
            <button type="button" className="of-btn is-primary" disabled={enviando} onClick={() => void enviarAccion("rechazar")}>
              {etiqueta(t("Enviar y {accion}", { accion: c.rechazar.toLowerCase() }))}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="of-btn" disabled={enviando} onClick={() => (c.conMotivo ? modo("rechazo") : void enviarAccion("rechazar"))}>
              {c.rechazar}
            </button>
            <button type="button" className="of-btn is-primary is-toca" disabled={enviando} onClick={() => void enviarAccion("aceptar")}>
              {etiqueta(c.aceptar)}
            </button>
          </>
        );
    } else if (c.clase === "casillas" || c.clase === "tareas") {
      const tareas = c.clase === "tareas";
      const total = tareas ? c.tareas.length : c.opciones.length;
      const hijas = tareas && c.tareas.some((ta) => ta.madre);
      const extras = tareas
        ? [hijas ? t("una tarea hija va con su madre") : null]
        : [c.minimo ? t("al menos {n}", { n: c.minimo }) : null, c.maximo != null ? t("como máximo {n}", { n: c.maximo }) : null];
      const nota = [t("Marcadas {n} de {total}", { n: b.marcadas.length, total }), ...extras.filter(Boolean)].join(" · ");
      const nombreDe = (agenteId: string | null, usuarioId: string | null) =>
        agenteId ? (agentes.find((a) => a.id === agenteId)?.nombre ?? t("otro agente")) : usuarioId ? t("ti") : t("sin asignar");
      cuerpo = (
        <>
          {detalle}
          <fieldset className={cx("of-rq", enviando && "is-busy")} disabled={enviando}>
            <legend>
              <em>{nota}</em>
            </legend>
            {tareas
              ? c.tareas.map((ta) => (
                  <Opcion
                    key={ta.clave}
                    tipo="checkbox"
                    nombre={`${idTitulo}-t`}
                    marcada={b.marcadas.includes(ta.clave)}
                    hija={!!ta.madre}
                    titulo={`${ta.madre ? "↳ " : ""}${ta.titulo}`}
                    descripcion={ta.agenteId || ta.usuarioId ? t("Para {quien}", { quien: nombreDe(ta.agenteId, ta.usuarioId) }) : t("Sin asignar")}
                    alCambiar={() => guardar(marcarTarea(b, c, ta.clave))}
                  />
                ))
              : c.opciones.map((o) => (
                  <Opcion
                    key={o.id}
                    tipo="checkbox"
                    nombre={`${idTitulo}-c`}
                    marcada={b.marcadas.includes(o.id)}
                    titulo={o.label}
                    descripcion={o.descripcion}
                    alCambiar={() => guardar(marcarCasilla(b, c, o.id))}
                  />
                ))}
          </fieldset>
          {b.modo === "rechazo" ? motivoCampo(c.etiquetaMotivo, !c.motivoObligatorio, c.placeholderMotivo) : null}
        </>
      );
      const pocas = tareas ? b.marcadas.length === 0 : b.marcadas.length < c.minimo;
      botones =
        b.modo === "rechazo" ? (
          <>
            {volver}
            <button type="button" className="of-btn is-primary" disabled={enviando} onClick={() => void enviarAccion("rechazar")}>
              {etiqueta(t("Enviar «{accion}»", { accion: c.rechazar }))}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="of-btn" disabled={enviando} onClick={() => (c.conMotivo ? modo("rechazo") : void enviarAccion("rechazar"))}>
              {c.rechazar}
            </button>
            <button type="button" className="of-btn is-primary is-toca" disabled={enviando || pocas} onClick={() => void enviarAccion("aceptar")}>
              {etiqueta(tareas ? `${c.aceptar} (${b.marcadas.length})` : c.aceptar)}
            </button>
          </>
        );
    } else {
      // Aprobación `request_board_approval`: resumen, riesgos y lo que recomienda.
      cuerpo = (
        <>
          {detalle}
          {c.riesgos.length ? (
            <div className="of-rrisk">
              <div className="of-rrh">
                <Icono nombre="shield-alert" tam={14} />
                {t("Riesgos")}
              </div>
              <ul>
                {c.riesgos.map((r, k) => (
                  <li key={k}>{r}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {c.recomienda ? (
            <div className="of-rrec">
              <Icono nombre="thumbs-up" tam={14} />
              <span>
                <b>{t("Te recomienda:")}</b> {c.recomienda}
              </span>
            </div>
          ) : null}
          {b.modo === "cambios" ? motivoCampo(t("¿Qué cambiarías?"), false, null) : null}
          {b.modo === "rechazo" ? motivoCampo(t("¿Por qué la rechazas?"), true, null) : null}
        </>
      );
      botones = b.modo ? (
        <>
          {volver}
          <button
            type="button"
            className={cx("of-btn is-primary", b.modo === "rechazo" && "is-danger")}
            disabled={enviando}
            onClick={() => void enviarAccion(b.modo === "rechazo" ? "rechazar" : "cambios")}
          >
            {etiqueta(b.modo === "rechazo" ? t("Rechazar") : t("Pedir cambios"))}
          </button>
        </>
      ) : (
        <>
          <button type="button" className="of-btn" disabled={enviando} onClick={() => modo("cambios")}>
            {t("Pedir cambios")}
          </button>
          <button type="button" className="of-btn" disabled={enviando} onClick={() => modo("rechazo")}>
            {t("Rechazar")}
          </button>
          <button type="button" className="of-btn is-primary is-toca" disabled={enviando} onClick={() => void enviarAccion("aprobar")}>
            {etiqueta(t("Aprobar"))}
          </button>
        </>
      );
    }
    cuerpo = (
      <>
        {cuerpo}
        {estado.falta ? (
          <Nota tipo="warn" icono="circle-help">
            {estado.falta}
          </Nota>
        ) : null}
        {estado.envio === "invalido" && estado.mensaje ? (
          <Nota tipo="warn" icono="circle-help">
            {estado.mensaje}
          </Nota>
        ) : null}
        {estado.envio === "fallo" ? (
          <Nota tipo="err" icono="triangle-alert">
            <b>{t("No se pudo enviar.")}</b> {estado.mensaje ?? t("Paperclip no respondió (sin conexión).")} {t("Tu respuesta sigue aquí; no se guardó nada.")}
          </Nota>
        ) : null}
      </>
    );
  }

  return (
    <>
      <div className={cx("of-rw-bg", rm && "is-quieto")} onClick={onCerrar} />
      <div
        ref={ref}
        className={cx("of-rw", celular && "is-m", rm && "is-quieto")}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        data-oficina-ventana=""
      >
        <div className="of-rw-h">
          <CajaPersonaje agente={agente} px={2} mano rm={rm} clase="is-rw" />
          <div className="of-rw-id">
            <div className="of-rw-n">{agente.nombre}</div>
            <div className="of-rw-c">
              <EtiquetaEmpresa prefijo={agente.prefijo} />
              <span>{agente.empresa}</span>
              <span className="of-dotsep">·</span>
              <span>{pasos.length > 1 ? t("Espera {n} cosas", { n: pasos.length }) : t("Espera tu respuesta")}</span>
            </div>
          </div>
          <button type="button" className="of-ibtn is-ghost" aria-label={t("Cerrar (Esc)")} onClick={onCerrar}>
            <Icono nombre="x" tam={14} />
          </button>
        </div>
        {pasos.length > 1 ? (
          <div ref={tira} className="of-rw-steps" role="tablist" aria-label={t("Lo que espera")}>
            {pasos.map((e, k) => {
              const ch = chipDe(e);
              const s = estados[e.itemId];
              const ok = s?.envio === "ok" || s?.envio === "ya";
              const lee = leeEsta(tareaDeEspera(e));
              return (
                <button
                  key={e.itemId}
                  type="button"
                  role="tab"
                  aria-selected={k === i}
                  className={cx("of-rw-step", k === i && "is-on", ok && "is-ok", ch.fuera && "is-ext", lee && "is-lee")}
                  onClick={() => irA(k)}
                >
                  <span className="of-n">{ok ? <Icono nombre="check" tam={12} /> : k + 1}</span>
                  <span className="of-l">
                    {t(ch.label)}
                    <em>{e.identifier ?? ""}</em>
                  </span>
                  {ch.fuera ? <Icono nombre="arrow-up-right" tam={12} /> : null}
                  {lee ? <Icono nombre="volume-2" tam={12} className="of-ctx-pil" /> : null}
                </button>
              );
            })}
          </div>
        ) : null}
        <div className="of-rw-b" role={pasos.length > 1 ? "tabpanel" : undefined}>
          <div className="of-rmeta">
            <span className={cx("of-rk", chip.fuera && "is-fuera")}>
              <Icono nombre={chip.icono} tam={12} />
              {t(chip.label)}
            </span>
            {espera.identifier && hrefCodigo ? (
              <a className="of-rtid" title={t("Abrir {id} en Paperclip", { id: espera.identifier })} {...enlazar(hrefCodigo)}>
                {espera.identifier}
                <Icono nombre="arrow-up-right" tam={12} />
              </a>
            ) : null}
            <span className="of-rago">{hace(espera.desde, ahora)}</span>
            {tareaCtx ? <BotonContextoVentana tarea={tareaCtx} codigo={espera.identifier ?? t("la tarea")} celular={celular} /> : null}
          </div>
          {tareaCtx ? <EscritoVentana tarea={tareaCtx} celular={celular} /> : null}
          {tareaCtx ? <ErrorVentana tarea={tareaCtx} celular={celular} /> : null}
          <div>
            <h3 className="of-rtitle" id={idTitulo}>
              {titulo}
            </h3>
            {espera.tituloTarea ? <span className="of-rtt">{espera.tituloTarea}</span> : null}
          </div>
          {cuerpo}
        </div>
        <div className="of-rw-f">
          {aNombre ? (
            <span className="of-rwho">
              <Icono nombre="user-check" tam={12} />
              {aTuNombre(espera)}
            </span>
          ) : null}
          <span className="of-sp" />
          {botones}
        </div>
      </div>
    </>
  );
}

/** Una opción: `label` con su `input` real (radio o checkbox) y la marca de 16 px. */
function Opcion({
  tipo,
  nombre,
  marcada,
  titulo,
  descripcion,
  hija = false,
  alCambiar,
}: {
  tipo: "radio" | "checkbox";
  nombre: string;
  marcada: boolean;
  titulo: string;
  descripcion: string | null;
  hija?: boolean;
  alCambiar: () => void;
}) {
  return (
    <label className={cx("of-opt", tipo === "checkbox" && "is-multi", marcada && "is-on", hija && "is-child")}>
      <input type={tipo} name={nombre} checked={marcada} onChange={alCambiar} />
      <span className="of-mk" aria-hidden="true">
        {marcada ? <Icono nombre="check" tam={12} /> : null}
      </span>
      <span className="of-ol">
        <b>{titulo}</b>
        {descripcion ? <span>{descripcion}</span> : null}
      </span>
    </label>
  );
}

/** Una pregunta de `ask_user_questions` en su `fieldset`: opciones de una o de varias, y el texto libre. */
function PreguntaCampo({
  q,
  b,
  nombre,
  conLeyenda,
  enviando,
  guardar,
}: {
  q: Pregunta;
  b: Borrador;
  nombre: string;
  conLeyenda: boolean;
  enviando: boolean;
  guardar: (b: Borrador) => void;
}) {
  const elegidas = b.elegidas[q.id] ?? [];
  return (
    <fieldset className={cx("of-rq", enviando && "is-busy")} disabled={enviando}>
      <legend>
        {conLeyenda ? q.prompt : <span className="of-sr">{q.prompt}</span>}
        <em>
          {q.multiple ? t("Elige una o varias") : t("Elige una")}
          {q.requerida ? null : ` ${t("(opcional)")}`}
        </em>
      </legend>
      {q.ayuda ? <p className="of-rhelp">{q.ayuda}</p> : null}
      {q.opciones.map((o) => {
        const on = elegidas.includes(o.id);
        return (
          <div key={o.id} className="of-optw">
            <Opcion
              tipo={q.multiple ? "checkbox" : "radio"}
              nombre={`${nombre}-${q.id}`}
              marcada={on}
              titulo={o.label}
              descripcion={o.descripcion}
              alCambiar={() => guardar(elegir(b, q, o.id))}
            />
            {o.libre && on ? (
              <textarea
                className="of-rtx"
                rows={2}
                aria-label={t("{label}: escribe tu respuesta", { label: o.label })}
                placeholder={t("Escribe tu respuesta")}
                value={b.libres[q.id] ?? ""}
                onChange={(ev) => guardar({ ...b, libres: { ...b.libres, [q.id]: ev.target.value } })}
              />
            ) : null}
          </div>
        );
      })}
    </fieldset>
  );
}
