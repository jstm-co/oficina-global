// El piso de la propuesta A (design-spec de JST-65 §2 a §7): salas con su muro,
// escritorios y sala de descanso, y en ellas los personajes con su pose, su
// pantalla, sus efectos y su globo. Todo en DOM/CSS: cada personaje es un
// botón (clic, teclado y lector de pantalla), y la animación es una tira de
// cuadros que se corre con `transform` (JST-66).
//
// 0.3.0 (design-spec de JST-96, C · Pasillo): la «vida» del piso (`../vida.ts`)
// dice quién está en su escritorio y quién fuera (en el descanso, de pie o
// caminando), los sobres de las tareas entregadas, el globo de la conversación
// del descanso y las mascotas del pasillo. Lo que camina se mueve en cada
// cuadro sin volver a montar nada (`Vida.pintarPosiciones`); cada sala se
// vuelve a dibujar solo cuando cambia su forma.
//
// 0.3.4 (design-spec de JST-138, C · Rótulo de la sala): abajo de cada sala, un
// rótulo cuenta el nombre de una tarea a la vez y un anillo dorado marca el
// globo del que habla; a 1x, un solo rótulo bajo el piso. Lo que cuenta en cada
// instante lo dice la vida (`Vida.rotuloDe`); aquí se dibuja y se corta.
//
// 0.5.0 (design-spec de JST-163, A · En cada sala): el globo de dos pisos
// (arriba lo que hace; abajo la mano con lo que te pide o la hora estimada),
// «✓ listo» al terminar, tu escritorio con su fila en el descanso de cada sala
// y la entrega en la mesa con el sobre en la mano. El rótulo suma la entrega,
// el «✓ listo» y la hora estimada en una pastilla.
//
// 0.6.0 (design-spec de JST-225, A · Dos listas): en la página y el TV (no en
// el widget), con las voces prendidas, la vida le cuenta a la voz lo que pasa
// (`VozDePiso`) y el globo que suena lleva un 🔊 en su esquina mientras suena.
import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type FocusEvent, type PointerEvent, type ReactNode } from "react";
import { hash } from "../aspecto.js";
import { spriteConPies } from "../caminos.js";
import { CON_COLOR, MURO, spriteDe, type PisoPlano, type SalaPlano } from "../plano.js";
import { lineasDe, nombreQueCabe, tituloDe, unCorteMenos, type Linea } from "../charlas.js";
import { esperanEn, etiquetaEscritorio } from "../escritorio.js";
import { textoGlobo, textoTooltip, type Estimacion } from "../hora.js";
import { cortarNombre, medirConCanvas, type TipoRotulo } from "../rotulo.js";
import type { Sincronizador } from "../sincronizador.js";
import { entregaDeEvento, ROTULO_PISO, Vida, type AgenteVida, type VistaCharla, type VistaFuera, type VistaJunta, type VistaMascota, type VistaRotulo, type VistaSobre, type VistaSobreMano, type VistaSuelta } from "../vida.js";
import { ESTADOS, etiqueta, pisoDeAbajo, type AgenteVista, type Dibujo, type PisoAbajo } from "../vista.js";
import { useAjustes } from "./ajustes.js";
import { fuenteIa, registrarPisoIa, useIaActiva } from "./ia.js";
import { PATHS, type NombreIcono } from "./iconos.js";
import { registrarVida } from "./reloj.js";
import { repartirGlobos } from "./repartir.js";
import { ANIMACIONES, EFECTOS_ANIM, MASCOTAS_ANIM, PIEZAS, TAM, animacionDe, filaDe, filaMascota, type Animacion, type AnimMascota, type Efecto } from "./sprites.js";
import { temasDe, titulosDe, useHorasDelPiso, usePestanaOculta, type EmpresaVista } from "./useOficina.js";
import { useAudioDesbloqueado, useMarcaVoz, VozDePiso, type MarcaVoz } from "./vozOficina.js";

export function cx(...nombres: Array<string | false | null | undefined>): string {
  return nombres.filter(Boolean).join(" ");
}

export function Icono({ nombre, tam = 16, className }: { nombre: NombreIcono | string; tam?: 12 | 14 | 16 | 18; className?: string }) {
  const paths = (PATHS as Record<string, string>)[nombre] ?? "";
  return (
    <svg
      className={cx("of-i", tam !== 16 && `of-s${tam}`, className)}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: paths }}
    />
  );
}

/** Clase de color de la empresa (paleta fija por prefijo, como Board global). */
/**
 * El 🔊 de quien habla (0.6.0, JST-225 §2): pegado a la esquina de arriba a la
 * izquierda del globo que suena, mientras suena su audio. Crece con la escala
 * del piso (18 px a 2x, 24 a 3x) y sus 2 ondas laten (quietas con movimiento
 * reducido).
 */
export function Parlante() {
  return (
    <i className="of-vzm" aria-hidden="true">
      <Icono nombre="volume-2" tam={12} />
    </i>
  );
}

export const esMarca = (m: MarcaVoz | null, tipo: MarcaVoz["tipo"], clave: string) => !!m && m.tipo === tipo && m.clave === clave;

export function claseEmpresa(prefijo: string): string {
  return CON_COLOR.includes(prefijo) ? `of-co-${prefijo.toLowerCase()}` : "of-co-none";
}

/** Silla de la empresa; una empresa sin color propio usa la de JSTM en gris (§8). */
function Silla({ prefijo }: { prefijo: string }) {
  return <Mueble nombre={`silla-${spriteDe(prefijo)}`} x={13} y={10} z={1} className={CON_COLOR.includes(prefijo) ? undefined : "of-gris"} />;
}

export function EtiquetaEmpresa({ prefijo, solida = false }: { prefijo: string; solida?: boolean }) {
  return <span className={cx("of-cotag", claseEmpresa(prefijo), solida && "is-solid")}>{prefijo}</span>;
}

// ---------------------------------------------------------------------------
// Sprites
// ---------------------------------------------------------------------------

type Hoja = "pj" | "mu" | "ef" | "ma";

interface OpcionesSpr {
  hoja: Hoja;
  x: number;
  y: number;
  w: number;
  h: number;
  sx: number;
  sy: number;
  z?: number;
  /** Cuadros de la animación (más de 1: se anima). */
  n?: number;
  ms?: number;
  /** Desfase de la animación en ms. */
  d?: number;
  className?: string;
  /** Se muestra una vez y queda en el último cuadro (`"bucle": false` en el JSON). */
  una?: boolean;
  /** Para lo que se mueve en cada cuadro (la vida escribe `--x` y `--y`). */
  refEl?: (el: HTMLElement | null) => void;
}

const TAM_HOJA: Record<Hoja, { w: number; h: number }> = { pj: TAM.personajes, mu: TAM.muebles, ef: TAM.efectos, ma: TAM.mascotas };

function Spr(o: OpcionesSpr) {
  const tam = TAM_HOJA[o.hoja];
  const estilo = {
    "--x": o.x,
    "--y": o.y,
    "--w": o.w,
    "--h": o.h,
    "--sx": o.sx,
    "--sy": o.sy,
    "--iw": tam.w,
    "--ih": tam.h,
    "--img": `var(--of-img-${o.hoja})`,
    zIndex: o.z,
  } as CSSProperties;
  const animado = (o.n ?? 1) > 1;
  if (!animado) return <i ref={o.refEl} className={cx("of-spr", o.className)} style={estilo} />;
  return (
    <i ref={o.refEl} className={cx("of-spr of-an", o.className)} style={estilo}>
      <i className={cx("of-tira", o.una && "of-una")} style={{ "--n": o.n, "--ms": o.ms, "--d": o.d ?? 0 } as CSSProperties} />
    </i>
  );
}

/** `quieto`: el primer cuadro de la animación, sin moverse (la lista, la ventana con movimiento reducido). */
export function Personaje({ aspecto, anim, x, y, z, d, className, quieto }: { aspecto: string; anim: Animacion; x: number; y: number; z?: number; d?: number; className?: string; quieto?: boolean }) {
  const a = ANIMACIONES[anim];
  return <Spr hoja="pj" x={x} y={y} w={16} h={24} sx={a.desde * 16} sy={filaDe(aspecto) * 24} n={quieto ? 1 : a.cuadros} ms={a.ms} d={d} z={z} className={className} />;
}

const ANIM_CAJA: Record<Dibujo, Animacion> = { trabaja: "teclear", toca: "mano", error: "error", pausa: "dormir", libre: "libre" };

/**
 * El personaje a escala entera dentro de una caja con el color de la empresa
 * (lista, ventana, widget; design-spec de JST-95 §3). Solo se anima el que
 * levanta la mano (`animar` y estado «te necesita»); los demás quedan en el
 * primer cuadro de su estado. `mano`: siempre con la mano arriba (la ventana).
 */
export function CajaPersonaje({ agente, px = 2, animar = false, mano = false, rm = false, clase }: { agente: Pick<AgenteVista, "id" | "aspecto" | "prefijo" | "st">; px?: 1 | 2; animar?: boolean; mano?: boolean; rm?: boolean; clase?: string }) {
  const anim: Animacion = mano ? "mano" : ANIM_CAJA[agente.st];
  const mueve = !rm && (mano || (animar && agente.st === "toca"));
  return (
    <span className={cx("of-av", claseEmpresa(agente.prefijo), px === 1 && "is-sm", clase)} style={{ "--px": px } as CSSProperties} aria-hidden="true">
      <span className="of-avs">
        <Personaje aspecto={agente.aspecto} anim={anim} x={0} y={0} d={hash(agente.id) % 900} quieto={!mueve} />
      </span>
    </span>
  );
}

export function Mueble({ nombre, x, y, z, className }: { nombre: string; x: number; y: number; z?: number; className?: string }) {
  const m = PIEZAS[nombre];
  if (!m) return null;
  return <Spr hoja="mu" x={x} y={y} w={m.w} h={m.h} sx={m.x} sy={m.y} z={z} className={className} />;
}

function EfectoSpr({ nombre, x, y, z, d }: { nombre: Efecto; x: number; y: number; z?: number; d?: number }) {
  const e = EFECTOS_ANIM[nombre];
  return <Spr hoja="ef" x={x} y={y} w={16} h={16} sx={e.desde * 16} sy={0} n={e.cuadros} ms={e.ms} d={d} z={z} una={e.bucle === false} />;
}

type TipoPantalla = "apagada" | "codigo" | "error" | "espera" | "dormida";
const CUADROS_PANTALLA: Record<TipoPantalla, number> = { apagada: 1, codigo: 5, error: 2, espera: 2, dormida: 1 };

/** Pantalla del escritorio: los cuadros están sueltos en el atlas y se turnan como capas. */
function Pantalla({ tipo, x, y, z, rm }: { tipo: TipoPantalla; x: number; y: number; z: number; rm: boolean }) {
  const n = CUADROS_PANTALLA[tipo];
  if (n === 1 || rm) return <Mueble nombre={`pantalla-${tipo}-0`} x={x} y={y} z={z} />;
  return (
    <>
      {Array.from({ length: n }, (_, f) => (
        <Mueble key={f} nombre={`pantalla-${tipo}-${f}`} x={x} y={y} z={z} className={`of-scr of-f${f} of-of${n}`} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Puesto, personaje en la sala de descanso y globo
// ---------------------------------------------------------------------------

// Libre en su escritorio solo mientras espera su turno para ir al descanso (cupo lleno, JST-137): sentado y quieto.
export const ANIM_PUESTO: Record<Dibujo, Animacion> = { trabaja: "teclear", toca: "mano", error: "error", pausa: "dormir", libre: "sentado" };
export const PANTALLA: Record<Dibujo, TipoPantalla> = { trabaja: "codigo", toca: "espera", error: "error", pausa: "dormida", libre: "apagada" };

export interface OpcionesPiso {
  /** Escala 1x (celular, widget): sin globos, con punto azul y efecto `aviso` (§2). */
  chico: boolean;
  rm: boolean;
  oscuro: boolean;
  seleccionado: string | null;
  /** `null`: los personajes no reciben clics (piso entero del celular). */
  onSeleccionar: ((id: string) => void) | null;
}

/** Lo que la 0.5.0 sabe de cada agente al dibujarlo: su hora estimada (ya calculada) y su «✓ listo». */
interface Extra050 {
  hora: Estimacion | null;
  listo: { codigo: string | null; titulo: string | null } | null;
}

/** La frase del tooltip y del lector de pantalla, con la hora estimada y el «✓ listo» (JST-163). */
function texto050(agente: AgenteVista, x: Extra050, ahora: number): string {
  return etiqueta(agente, { hora: textoTooltip(x.hora, ahora), listo: x.listo });
}

/** Puesto de trabajo (§6): botón de 32×32 desde (x − 2, y − 2). */
function Puesto({ agente, x, y, o, extra, ahora }: { agente: AgenteVista; x: number; y: number; o: OpcionesPiso; extra: Extra050; ahora: number }) {
  const st = agente.st;
  const anim = ANIM_PUESTO[st];
  const d = hash(agente.id) % 900;
  const texto = texto050(agente, extra, ahora);
  return (
    <button
      type="button"
      className={cx("of-ws", `of-st-${st}`, agente.need && "is-need", o.seleccionado === agente.id && "is-sel")}
      data-agente={agente.id}
      data-tip={texto}
      aria-label={texto}
      tabIndex={o.onSeleccionar ? 0 : -1}
      onClick={o.onSeleccionar ? () => o.onSeleccionar?.(agente.id) : undefined}
      style={{ "--x": x - 2, "--y": y - 2, "--w": 32, "--h": 32, zIndex: y + 28 } as CSSProperties}
    >
      <Silla prefijo={agente.prefijo} />
      {anim ? <Personaje aspecto={agente.aspecto} anim={anim} x={12} y={2} z={2} d={d} className="of-who" /> : null}
      <Mueble nombre="escritorio" x={2} y={10} z={3} />
      <Pantalla tipo={PANTALLA[st]} x={4} y={11} z={4} rm={o.rm} />
      {st === "pausa" ? <EfectoSpr nombre="zz" x={21} y={-8} z={5} d={d} /> : null}
      {st === "error" ? (
        <>
          <EfectoSpr nombre="humo" x={1} y={-2} z={5} d={d} />
          <EfectoSpr nombre="alerta" x={22} y={-8} z={5} />
        </>
      ) : null}
      {o.chico && agente.need ? <EfectoSpr nombre="aviso" x={st === "toca" ? 21 : 2} y={-11} z={6} /> : null}
      {/* A 1x, «✓ listo» es un cuadrito verde con el ✓ sobre el puesto (JST-163 §7); si no, el punto azul de quien trabaja. */}
      {o.chico && extra.listo ? (
        <i className={cx("of-listo1", !o.rm && "is-pop")} style={{ "--x": 19, "--y": -9 } as CSSProperties} />
      ) : o.chico && st === "trabaja" ? (
        <i className="of-dot" style={{ "--x": 24, "--y": -1 } as CSSProperties} />
      ) : null}
    </button>
  );
}

/** Escritorio vacío: el agente está en la sala de descanso, o su empresa no respondió. */
function EscritorioVacio({ prefijo, x, y }: { prefijo: string; x: number; y: number }) {
  return (
    <div className="of-desk" aria-hidden="true" style={{ "--x": x - 2, "--y": y - 2, "--w": 32, "--h": 32, zIndex: y + 28 } as CSSProperties}>
      <Silla prefijo={prefijo} />
      <Mueble nombre="escritorio" x={2} y={10} z={3} />
      <Mueble nombre="pantalla-apagada-0" x={4} y={11} z={4} />
    </div>
  );
}

/**
 * Fuera de su escritorio (§7 de JST-65 y §4 de JST-96): sentado en el sofá o
 * de pie con su taza en el descanso, de pie junto a su escritorio si no quedó
 * asiento, caminando o conversando. Sigue siendo un botón: abre su ficha
 * también mientras camina. La posición la mueve la vida en cada cuadro.
 */
const CAMINA_A: Record<NonNullable<VistaFuera["hacia"]>, string> = {
  escritorio: "; camina a su escritorio",
  descanso: "; camina a la sala de descanso",
  fila: "; camina a la fila de tu escritorio",
  mesa: "; camina a la mesa del descanso",
};

function Andante({ agente, f, o, vida, extra, ahora }: { agente: AgenteVista; f: VistaFuera; o: OpcionesPiso; vida: Vida; extra: Extra050; ahora: number }) {
  const camina = f.caminando && f.hacia ? CAMINA_A[f.hacia] : f.fila !== null ? `; ${f.fila + 1}.º en la fila de tu escritorio` : "";
  const texto = `${texto050(agente, extra, ahora)}${camina}`;
  const s = spriteConPies(f.pos);
  return (
    <button
      type="button"
      ref={(el) => vida.registrar(`p:${agente.id}`, el)}
      className={cx("of-lc", `of-st-${agente.st}`, agente.need && "is-need", f.caminando && "is-walk of-mov", o.seleccionado === agente.id && "is-sel")}
      data-agente={agente.id}
      data-anim={f.anim}
      data-tip={texto}
      aria-label={texto}
      tabIndex={o.onSeleccionar ? 0 : -1}
      onClick={o.onSeleccionar ? () => o.onSeleccionar?.(agente.id) : undefined}
      style={{ "--x": s.x, "--y": s.y, "--w": 16, "--h": 24, zIndex: f.pos.y } as CSSProperties}
    >
      <Personaje aspecto={agente.aspecto} anim={animacionDe(f.anim)} x={0} y={0} d={hash(agente.id) % 1500} className="of-who" quieto={f.quieto} />
    </button>
  );
}

/**
 * Globo con el código de la tarea (HTML, nítido), centrado en (x, y): (x + 8, y + 1) del puesto, o (pies.x, pies.y − 23)
 * de quien camina. `anillo`: el rótulo de la sala habla de él (JST-138 §3.2).
 */
export function Globo({ agente, x, y, refEl, anillo = false, listo = false, abajo = null, voz = false }: { agente: AgenteVista; x: number; y: number; refEl?: (el: HTMLElement | null) => void; anillo?: boolean; listo?: boolean; abajo?: PisoAbajo | null; voz?: boolean }) {
  const st = agente.st;
  const vz = voz ? <Parlante /> : null;
  const n = agente.teNecesita.length;
  const pos0 = { "--x": x, "--y": y } as CSSProperties;
  // «✓ listo» (JST-163 §7): verde, 6 s, con un salto al aparecer (sin salto con «reducir movimiento»).
  if (listo && (st === "libre" || st === "trabaja")) {
    return (
      <span ref={refEl} className={cx("of-bub of-b-listo", anillo && "is-anillo")} style={pos0} data-listo="">
        {vz}
        <Icono nombre="check" tam={12} />
        listo
      </span>
    );
  }
  // Dos pisos (JST-163 §8): arriba lo de siempre; abajo la mano con su código y «+N» (gana siempre), o la hora estimada.
  if (abajo && (st === "trabaja" || st === "error")) {
    const p2 =
      abajo.tipo === "mano" ? (
        <span className="of-p2 is-mano">
          <Icono nombre="hand" tam={12} />
          {abajo.codigo ?? "Te toca"}
          {abajo.mas > 0 ? <em>+{abajo.mas}</em> : null}
        </span>
      ) : (
        <span className={cx("of-p2 is-hora", abajo.lleva && "is-lleva")}>
          <Icono nombre="timer" tam={12} />
          {abajo.texto}
        </span>
      );
    const p1 =
      st === "trabaja" ? (
        <>
          {agente.run?.enCola ? <Icono nombre="hourglass" tam={12} /> : null}
          {agente.run?.identifier ?? "run"}
        </>
      ) : (
        <>
          <Icono nombre="triangle-alert" tam={12} />
          Error
        </>
      );
    return (
      <span
        ref={refEl}
        className={cx("of-bub is-2p", `of-st-${st}`, st === "trabaja" ? "of-b-trabaja" : "of-b-error", `p2-${abajo.tipo}`, agente.need && "is-need", agente.run?.enCola && st === "trabaja" && "is-q", anillo && "is-anillo")}
        style={pos0}
      >
        {vz}
        <span className="of-p1">{p1}</span>
        {p2}
      </span>
    );
  }
  const cabo = agente.need && st !== "toca" ? (
    <span className="of-bnd">
      <Icono nombre="hand" tam={12} />
      {n > 1 ? n : null}
    </span>
  ) : null;
  const clase = (extra: string) => cx("of-bub", `of-st-${st}`, agente.need && "is-need", anillo && "is-anillo", extra);
  const pos = { "--x": x, "--y": y } as CSSProperties;
  if (st === "trabaja") {
    const codigo = agente.run?.identifier ?? "run";
    return (
      <span ref={refEl} className={clase(cx("of-b-trabaja", agente.run?.enCola && "is-q"))} style={pos}>
        {vz}
        {agente.run?.enCola ? <Icono nombre="hourglass" tam={12} /> : null}
        {codigo}
        {cabo}
      </span>
    );
  }
  if (st === "toca") {
    return (
      <span ref={refEl} className={clase("of-b-toca")} style={pos}>
        {vz}
        <Icono nombre="hand" tam={12} />
        {agente.teNecesita[0]?.identifier ?? "Te toca"}
        {n > 1 ? <em>+{n - 1}</em> : null}
      </span>
    );
  }
  if (st === "error") {
    return (
      <span ref={refEl} className={clase("of-b-error")} style={pos}>
        {vz}
        <Icono nombre="triangle-alert" tam={12} />
        Error{cabo}
      </span>
    );
  }
  if (st === "pausa" && agente.need) {
    // «✋ MIG-xx» quieto (JST-163 §8).
    return (
      <span ref={refEl} className={clase("of-b-toca is-quieto")} style={pos}>
        {vz}
        <Icono nombre="hand" tam={12} />
        {agente.teNecesita[0]?.identifier ?? "Te toca"}
        {n > 1 ? <em>+{n - 1}</em> : null}
      </span>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// 0.5.0: tu escritorio, la entrega en la mesa y el sobre en la mano (JST-163)
// ---------------------------------------------------------------------------

/**
 * Tu escritorio (JST-163 §14): un puesto como el de los agentes, vacío, con la
 * placa «Tú»; la pantalla en «espera» si alguien te espera en la sala. A 1x,
 * sin placa y con una pastilla morada con el número. Al hacerle clic, la
 * ventanita con quiénes te esperan (`onClick`); en el TV no hay clic.
 */
function EscritorioTu({ sala, n, empresa, chico, rm, onClick }: { sala: SalaPlano; n: number; empresa: string; chico: boolean; rm: boolean; onClick: ((prefijo: string, el: HTMLElement) => void) | null }) {
  const e = sala.escritorio!;
  const texto = etiquetaEscritorio(n, empresa);
  return (
    <button
      type="button"
      className={cx("of-ws of-udesk", n > 0 && "is-con", !onClick && "is-fijo")}
      data-escritorio={sala.prefijo}
      data-tip={texto}
      aria-label={texto}
      tabIndex={onClick ? 0 : -1}
      onClick={onClick ? (ev) => onClick(sala.prefijo, ev.currentTarget) : undefined}
      style={{ "--x": e.x - 2, "--y": e.y - 2, "--w": 32, "--h": 32, zIndex: e.y + 28 } as CSSProperties}
    >
      <Silla prefijo={sala.prefijo} />
      <Mueble nombre="escritorio" x={2} y={10} z={3} />
      <Pantalla tipo={n > 0 ? "espera" : "apagada"} x={4} y={11} z={4} rm={rm} />
      {chico ? (
        n > 0 ? (
          <span className="of-ucnt" style={{ "--x": 24, "--y": 2 } as CSSProperties}>
            {n}
          </span>
        ) : null
      ) : (
        <span className="of-placa-tu" style={{ "--x": 16, "--y": 24 } as CSSProperties}>
          Tú
        </span>
      )}
    </button>
  );
}

/**
 * La entrega en la mesa mientras hablan (JST-163 §10): quien entrega dice
 * «BET-434 → Ingeniero frontend» (crece hacia afuera, sin tapar el «🤝») y,
 * desde los 1,5 s, quien recibe dice «🤝». Si la frase no cabe en el descanso,
 * se corta el nombre con «…» (el código nunca). Si le taparían la cabeza a
 * alguien (en el sofá o al lado), los dos suben `j.alto`, sin cola (JST-190);
 * y suben más si tocan un globo de estado (`revisar`). Si la frase no cabe
 * hasta el borde del descanso, se corre `j.corre` hacia adentro (su cola sigue
 * apuntando a quien entrega) o sube `j.encima`, sobre el «🤝» y sin cola (JST-214).
 */
function GlobosEntrega({ j, sala, marca }: { j: VistaJunta; sala: SalaPlano; marca: MarcaVoz | null }) {
  const fin = sala.descanso.x + sala.descanso.w - 2;
  const arriba = j.alto > 0 && "is-arriba";
  return (
    <>
      <span
        className={cx("of-ent is-de", (j.alto > 0 || j.encima > 0) && "is-arriba")}
        data-entrega={j.id}
        style={{ "--x": j.de.pos.x, "--y": j.de.pos.y - 25 - j.alto - j.encima, "--fin": fin, "--corre": j.corre } as CSSProperties}
        aria-hidden="true"
      >
        {esMarca(marca, "entrega", `e:${j.id}:de`) ? <Parlante /> : null}
        <b>{j.codigo}</b>
        <span className="of-ent-fl">→</span>
        <span className="of-ent-n">{j.para}</span>
      </span>
      {j.responde ? (
        <span className={cx("of-ent is-a", arriba)} data-entrega-a={j.id} style={{ "--x": j.a.pos.x, "--y": j.a.pos.y - 25 - j.alto } as CSSProperties} aria-hidden="true">
          {esMarca(marca, "entrega", `e:${j.id}:a`) ? <Parlante /> : null}
          <Icono nombre="handshake" tam={12} />
        </span>
      ) : null}
    </>
  );
}

/** El sobre de una entrega en la mesa: en la mano de quien camina (se mueve en cada cuadro) o sobre la mesa. */
function SobreMano({ s, vida }: { s: VistaSobreMano; vida: Vida }) {
  return (
    <span
      ref={(el) => vida.registrar(`sm:${s.id}`, el)}
      className={cx("of-sobre is-mano", s.mueve && "of-mov")}
      data-sobre-mano={s.id}
      style={{ "--x": s.pos.x, "--y": s.pos.y, zIndex: s.z } as CSSProperties}
      aria-hidden="true"
    >
      <EfectoSpr nombre="sobre-quieto" x={-8} y={-8} />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sala y piso
// ---------------------------------------------------------------------------

/** Lo quieto de una sala (muro, alfombra, muebles y placa): no se vuelve a dibujar cuando alguien camina. */
const FondoSala = memo(function FondoSala({ sala, nombre, numero, oscuro }: { sala: SalaPlano; nombre: string; numero: string; oscuro: boolean }) {
  const gris = !CON_COLOR.includes(sala.prefijo);
  return (
    <>
      <div className="of-zona of-alfombra" style={{ "--x": 0, "--y": MURO, "--w": sala.anchoEscritorios, "--h": sala.h - MURO } as CSSProperties} />
      <div className="of-zona of-madera" style={{ "--x": sala.anchoEscritorios, "--y": MURO, "--w": sala.w - sala.anchoEscritorios, "--h": sala.h - MURO } as CSSProperties} />
      <div className="of-muro" style={{ "--x": 0, "--y": 0, "--w": sala.w, "--h": MURO } as CSSProperties} />
      {sala.muebles.map((m, i) => (
        <Mueble
          key={i}
          nombre={m.nombre === "ventana" ? (oscuro ? "ventana-noche" : "ventana-dia") : m.nombre}
          x={m.x}
          y={m.y}
          z={m.z}
          className={gris && m.nombre.startsWith("cuadro-") ? "of-gris" : undefined}
        />
      ))}
      <div className="of-placa">
        <EtiquetaEmpresa prefijo={sala.prefijo} solida />
        <span>{nombre}</span>
        <em>{numero}</em>
      </div>
    </>
  );
});

const ANIM_SOBRE: Record<VistaSobre["fase"], Efecto> = { vuela: "sobre-vuela", llega: "sobre-llega", espera: "sobre-quieto", abre: "sobre-abre" };

/** El sobre de una tarea entregada (JST-96 §5): 16×16 centrado en su punto, con el código en el muro o mientras espera. */
function SobreVista({ s, vida, voz }: { s: VistaSobre; vida: Vida; voz: boolean }) {
  return (
    <span ref={(el) => vida.registrar(`s:${s.id}`, el)} className={cx("of-sobre", `is-${s.fase}`, s.fase === "vuela" && "of-mov")} data-sobre={s.codigo} style={{ "--x": s.pos.x, "--y": s.pos.y } as CSSProperties} aria-hidden="true">
      {/* Cada fase vuelve a montar su sprite: las que no se repiten (llega, abre) empiezan desde su primer cuadro. */}
      <EfectoSpr key={s.fase} nombre={ANIM_SOBRE[s.fase]} x={-8} y={-8} />
      {voz && !s.etiqueta ? <Parlante /> : null}
      {s.etiqueta ? (
        <span className={cx("of-sobre-tag", s.etiqueta === "muro" && "is-abajo")}>
          {voz ? <Parlante /> : null}
          {s.codigo}
          {/* 0.5.0 (JST-163 §10): para quién va, «BET-434 → Ingeniero frontend». */}
          {s.para ? (
            <>
              <span className="of-ent-fl">→</span>
              <span className="of-sobre-para">{s.para}</span>
            </>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

/** Una vez que cargan las fuentes, el nombre se vuelve a medir con la de verdad. */
function useFuentesListas(): boolean {
  const [listas, setListas] = useState(() => typeof document === "undefined" || !document.fonts || document.fonts.status === "loaded");
  useEffect(() => {
    if (listas || typeof document === "undefined" || !document.fonts) return;
    let vivo = true;
    void document.fonts.ready.then(() => vivo && setListas(true));
    return () => {
      vivo = false;
    };
  }, [listas]);
  return listas;
}

/** El alto de una línea con ese estilo, en pixeles CSS (`line-height` puede llegar como número). */
function altoDeLinea(cs: CSSStyleDeclaration): number {
  const fuente = parseFloat(cs.fontSize);
  const alto = parseFloat(cs.lineHeight);
  if (!Number.isFinite(alto)) return fuente * 1.2;
  return cs.lineHeight.endsWith("px") ? alto : alto * fuente;
}

/**
 * Un globo del hilo (JST-162 §5): la frase (hasta 2 líneas) y, si lleva, la
 * tarea en una línea aparte, con el código en monoespaciada y el nombre cortado
 * a 34 letras por palabras; si no cabe en el ancho del globo, se corta antes
 * (se estima con el canvas y, si igual se dibuja en 2 líneas, se acorta una
 * palabra más: JST-204). Al subir, la frase anterior sigue con el nombre que
 * tenía abajo (JST-175).
 * `data-px`: los pies de quien lo dijo (su cola apunta ahí).
 */
export function GloboFrase({ linea, clase, lado, piesX, quien, voz = false }: { linea: Linea; clase: "is-prev" | "is-cur" | "is-piensa"; lado: "izq" | "der" | null; piesX: number; quien: string; voz?: boolean }) {
  const tkRef = useRef<HTMLSpanElement>(null);
  const ntRef = useRef<HTMLSpanElement>(null);
  const nombre = tituloDe(linea);
  const [corte, setCorte] = useState<{ de: string; texto: string } | null>(null);
  const fuentes = useFuentesListas();
  useLayoutEffect(() => {
    const tk = tkRef.current;
    const nt = ntRef.current;
    const caja = tk?.closest<HTMLElement>(".of-hilo");
    const globo = tk?.closest<HTMLElement>(".of-chat");
    if (!tk || !nt || !caja || !globo || !nombre) return;
    const cs = getComputedStyle(globo);
    const ct = getComputedStyle(tk);
    const marco = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
    const ancho = parseFloat(getComputedStyle(caja).maxWidth) - marco;
    const fuente = `${ct.fontWeight} ${ct.fontSize} ${ct.fontFamily}`;
    // En el TV el lienzo va escalado: lo medido en pantalla se pasa a pixeles CSS.
    const escala = caja.offsetWidth > 0 ? caja.getBoundingClientRect().width / caja.offsetWidth : 1;
    const b = tk.querySelector("b");
    // El canvas no conoce las variantes de Inter: se calibra con lo que mide de verdad el nombre que se ve.
    const rango = document.createRange();
    rango.selectNodeContents(nt);
    const enPagina = Array.from(rango.getClientRects()).reduce((s, r) => s + r.width, 0) / (escala || 1);
    const enCanvas = medirConCanvas(nt.textContent ?? "", fuente);
    const k = enCanvas > 0 && enPagina > 0 ? enPagina / enCanvas : 1;
    const usado = b ? b.getBoundingClientRect().width / (escala || 1) + medirConCanvas(" ", fuente) * k : 0;
    const de = `${nombre}|${Math.round(ancho)}|${Math.round(usado)}|${fuentes ? 1 : 0}`;
    if (corte?.de === de) {
      // Lo dibujado manda (JST-204): si lo estimado igual se partió en 2 líneas, una palabra menos (antes de pintar).
      const menos = tk.offsetHeight > altoDeLinea(ct) * 1.5 ? unCorteMenos(nombre, corte.texto) : null;
      if (menos) setCorte({ de, texto: menos });
      return;
    }
    const medir = (t: string) => medirConCanvas(t, fuente) * k;
    // La anterior es el mismo globo que sube (misma clave), con la tarea a 0,85 em: lo de abajo le cabe.
    // Sin margen: si la estimación se pasa, lo corrige la revisión de arriba (con 1 px se cortaba de más, JST-204).
    const antes = clase === "is-prev" && corte?.de.startsWith(`${nombre}|`) ? corte.texto : null;
    setCorte({ de, texto: antes && lineasDe(antes, ancho, usado, medir) <= 1 ? antes : nombreQueCabe(nombre, ancho, 1, usado, medir) });
  });
  return (
    <span className={cx("of-chat", clase, lado && `a-${lado}`)} data-charla={quien} data-px={piesX}>
      {voz ? <Parlante /> : null}
      <span className="of-ch-f">{linea.texto}</span>
      {linea.codigo ? (
        <span ref={tkRef} className="of-ch-tk">
          <b>
            {linea.codigo}
            {nombre ? ":" : null}
          </b>
          {nombre ? " " : null}
          {nombre ? (
            <span ref={ntRef} className="of-ch-nt">
              {corte?.de.startsWith(`${nombre}|`) ? corte.texto : nombre}
            </span>
          ) : null}
        </span>
      ) : null}
      {clase === "is-piensa" ? (
        <>
          <i className="of-pz1" />
          <i className="of-pz2" />
        </>
      ) : null}
    </span>
  );
}

/**
 * El hilo de la conversación (JST-162 §5.1, B · Pregunta y respuesta): arriba
 * la frase anterior, atenuada; abajo la que se dice. Va sobre la pareja, se
 * corre entero para no salir del descanso y se esconde mientras toque un globo
 * de estado. Cada frase se vuelve a montar con su clave: la nueva entra con su
 * fundido y la anterior sube sin animación.
 */
function HiloCharla({ ch, ancho, marca }: { ch: VistaCharla; ancho: number; marca: MarcaVoz | null }) {
  return (
    <span className="of-hilo" data-hilo={ch.id} style={{ "--x": ch.centro.x, "--y": ch.centro.y, "--lw": ancho } as CSSProperties} aria-hidden="true">
      {ch.anterior ? <GloboFrase key={ch.anterior.clave} linea={ch.anterior.linea} clase="is-prev" lado={ch.anterior.lado} piesX={ch.anterior.piesX} quien={ch.anterior.quien} /> : null}
      <GloboFrase key={ch.actual.clave} linea={ch.actual.linea} clase="is-cur" lado={ch.actual.lado} piesX={ch.actual.piesX} quien={ch.actual.quien} voz={esMarca(marca, "charla", ch.actual.clave)} />
    </span>
  );
}

/** La frase suelta (JST-162 §1.6): un globo de pensamiento sobre la cabeza de quien está solo. */
function GloboSuelta({ s, ancho, voz }: { s: VistaSuelta; ancho: number; voz: boolean }) {
  return (
    <span className="of-hilo is-suelta" data-suelta={s.quien} style={{ "--x": s.pos.x, "--y": s.pos.y - (s.sofa ? 21 : 25) - 6, "--lw": ancho } as CSSProperties} aria-hidden="true">
      <GloboFrase linea={s.linea} clase="is-piensa" lado={null} piesX={s.pos.x} quien={s.quien} voz={voz} />
    </span>
  );
}

const ICONO_ROTULO: Record<TipoRotulo, NombreIcono> = {
  listo: "check",
  entrega: "handshake",
  toca: "hand",
  trabaja: "keyboard",
  cola: "hourglass",
  sobre: "mail",
  charla: "message-circle",
  error: "triangle-alert",
  libre: "coffee",
  pausa: "moon",
};

/**
 * Un rótulo (JST-138 §3): ícono, código, «+N» y el nombre de la tarea, cortado
 * por palabras al ancho que queda en la línea (§5). Con el mouse encima o el
 * foco del teclado adentro queda quieto y muestra ‹ ›; en una pantalla táctil,
 * tocarlo pasa al siguiente (§3.5). `piso`: el de 1x, con empresa y agente.
 */
function Rotulo({ clave, v, vida, piso = false, etiqueta, style }: { clave: string; v: VistaRotulo; vida: Vida; piso?: boolean; etiqueta: string; style: CSSProperties }) {
  const it = v.item;
  const nav = v.quieto && v.navegable;
  const raizRef = useRef<HTMLDivElement>(null);
  const nombreRef = useRef<HTMLSpanElement>(null);
  const [tope, setTope] = useState<number | null>(null);
  const [corte, setCorte] = useState<{ de: string; ancho: number; texto: string } | null>(null);
  const fuentes = useFuentesListas();
  const de = `${it.clave}|${it.texto}|${it.hora ?? ""}|${nav ? 1 : 0}|${fuentes ? 1 : 0}`;
  // El ancho que queda después del ícono, la ficha, el «+N» y ‹ › es el del nombre (flex: 1): se corta antes de pintar.
  useLayoutEffect(() => {
    const el = nombreRef.current;
    if (!el) return;
    const ancho = el.clientWidth;
    if (corte?.de === de && corte.ancho === ancho) return;
    // El canvas no conoce las variantes de la fuente de la página (la «a» de un solo piso de Inter, `cv11`): se
    // calibra con lo que mide de verdad el texto que se ve ahora (el nombre entero en la primera pasada).
    const cs = getComputedStyle(el);
    const fuente = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const visible = el.textContent ?? "";
    const enCanvas = visible ? medirConCanvas(visible, fuente) : 0;
    // El ancho del texto (no el del tramo, que ocupa todo lo que sobra), en pixeles CSS: en el TV el lienzo va escalado.
    const rango = document.createRange();
    rango.selectNodeContents(el);
    const escala = el.offsetWidth > 0 ? el.getBoundingClientRect().width / el.offsetWidth : 1;
    const enPagina = rango.getBoundingClientRect().width / (escala || 1);
    const k = enCanvas > 0 && enPagina > 0 ? enPagina / enCanvas : 1;
    setCorte({ de, ancho, texto: cortarNombre(it.texto, fuente, ancho - 1, (t, f) => medirConCanvas(t, f) * k) });
  });
  // En el TV, los botones de abajo a la derecha van sobre el piso: el rótulo de una sala termina antes, con 8 px de aire.
  useLayoutEffect(() => {
    const el = raizRef.current;
    const botones = piso ? null : el?.closest(".of-tv")?.querySelector<HTMLElement>(".of-tvbtns");
    let nuevo: number | null = null;
    if (el && botones && botones.offsetWidth > 0) {
      const r = el.getBoundingClientRect();
      const b = botones.getBoundingClientRect();
      const escala = el.offsetWidth > 0 ? r.width / el.offsetWidth : 1;
      const cs = getComputedStyle(el);
      const natural = parseFloat(cs.getPropertyValue("--w")) * parseFloat(cs.getPropertyValue("--px"));
      const aire = 8 * escala;
      if (r.top < b.bottom && r.bottom > b.top && r.left + natural * escala > b.left - aire) nuevo = Math.max(0, Math.floor((b.left - aire - r.left) / escala));
    }
    if (nuevo !== tope) setTope(nuevo);
  });
  // Si el rótulo se va con el mouse o el foco encima (la sala ya no tiene nada que contar), no queda quieto para la próxima.
  useEffect(
    () => () => {
      vida.pausarRotulo(clave, "mouse", false);
      vida.pausarRotulo(clave, "foco", false);
    },
    [vida, clave],
  );
  return (
    <div
      ref={raizRef}
      className={cx("of-ro", piso && "is-piso")}
      role="group"
      aria-label={etiqueta}
      aria-live="off"
      tabIndex={0}
      style={tope === null ? style : { ...style, maxWidth: tope }}
      data-rotulo={clave}
      onPointerEnter={(e) => e.pointerType === "mouse" && vida.pausarRotulo(clave, "mouse", true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && vida.pausarRotulo(clave, "mouse", false)}
      onFocus={(e) => (e.target as Element).matches(":focus-visible") && vida.pausarRotulo(clave, "foco", true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && vida.pausarRotulo(clave, "foco", false)}
      onPointerUp={(e) => e.pointerType !== "mouse" && !(e.target as Element).closest("button") && vida.toqueRotulo(clave)}
    >
      {/* Cada cosa que cuenta se vuelve a montar: así entra con su fundido de 250 ms (§3.4). */}
      <span key={it.clave} className={cx("of-ro-in", `is-${it.tipo}`)}>
        <Icono nombre={ICONO_ROTULO[it.tipo]} tam={12} />
        {piso ? (
          <>
            <EtiquetaEmpresa prefijo={it.prefijo} />
            <span className="of-ro-quien">{it.quien}</span>
          </>
        ) : null}
        {it.codigo ? <b className="of-ro-cod">{it.codigo}</b> : null}
        {it.mas > 0 ? <em>+{it.mas}</em> : null}
        <span ref={nombreRef} className="of-ro-t">
          {corte?.de === de ? corte.texto : it.texto}
        </span>
        {/* 0.5.0 (JST-163 §9): cuando cuenta lo que hace alguien, su hora estimada, a la derecha. */}
        {it.hora ? (
          <span className={cx("of-ro-eta", it.hora.startsWith("lleva") && "is-lleva")}>
            <Icono nombre="timer" tam={12} />
            {it.hora}
          </span>
        ) : null}
      </span>
      {nav ? (
        <span className="of-ro-nav">
          <button type="button" aria-label="Anterior" onClick={() => vida.moverRotulo(clave, -1)}>
            <Icono nombre="chevron-left" tam={12} />
          </button>
          <button type="button" aria-label="Siguiente" onClick={() => vida.moverRotulo(clave, 1)}>
            <Icono nombre="chevron-right" tam={12} />
          </button>
        </span>
      ) : null}
    </div>
  );
}

/** El agente (botón con `data-agente`) dentro de un elemento, o `null`. */
function agenteDe(el: EventTarget | null): string | null {
  return el instanceof Element ? (el.closest("[data-agente]")?.getAttribute("data-agente") ?? null) : null;
}

/**
 * El 🔊 en el globo de estado de un agente (JST-225 §2): para los avisos, en
 * «✓ listo» (terminé) o en la mano (te necesito); también en el de la hora.
 * «Terminé» suena cuando pasa su tarea a revisión o a terminada, y su run suele
 * seguir 26–98 s más (JST-238): mientras no sale su «✓ listo», va en el globo
 * que tiene a la vista, el de su tarea, como la mano.
 */
export function vozDelGlobo(m: MarcaVoz | null, agente: AgenteVista): boolean {
  if (!m || m.clave !== agente.id) return false;
  if (m.tipo === "mano") return agente.need;
  return m.tipo === "listo" || m.tipo === "hora";
}

interface PropsSala {
  sala: SalaPlano;
  empresa: EmpresaVista | undefined;
  agentes: readonly AgenteVista[];
  o: OpcionesPiso;
  atenuada: boolean;
  /** Celular, piso entero: la sala es el objetivo y se acerca al tocarla. */
  onAcercar?: (prefijo: string) => void;
  onReintentar: () => void;
  vida: Vida;
  /** La sala deja aquí cómo revisar su globo de conversación (el bucle lo llama mientras alguien camina con su globo). */
  revisores: Map<string, () => void>;
  /** 0.5.0: la hora estimada de cada agente (ya calculada) y con qué hora se dice (JST-192: la de su instante del minuto). */
  horaDe: (a: AgenteVista) => Estimacion | null;
  ahoraDe: (a: AgenteVista) => number;
  /** Los nombres de las tareas que la página ya leyó (el «✓ listo» en el tooltip). */
  titulo: (codigo: string) => string | null;
  /** Clic en tu escritorio (JST-163 §14): la ventanita con quiénes te esperan. `null`: sin clic (el TV). */
  onEscritorio: ((prefijo: string, el: HTMLElement) => void) | null;
}

function Sala({ sala, empresa, agentes, o, atenuada, onAcercar, onReintentar, vida, revisores, horaDe, ahoraDe, titulo, onEscritorio }: PropsSala) {
  // Se vuelve a dibujar cuando cambia la forma de esta sala (alguien llega, dobla, un sobre cambia de fase).
  useSyncExternalStore(vida.suscribir, () => vida.version(sala.prefijo));
  // 0.6.0: el globo que suena lleva el 🔊.
  const marca = useMarcaVoz();
  const salaRef = useRef<HTMLDivElement>(null);
  const nombre = empresa?.nombre ?? sala.prefijo;
  const cargando = !empresa || empresa.estado.cargando;
  const caida = !!empresa?.estado.error;
  // El rótulo de la sala y el globo del que habla (JST-138): solo en una sala que cargó bien.
  const rotulo = !cargando && !caida && sala.rotulo ? vida.rotuloDe(sala.prefijo) : null;
  const anillo = rotulo?.anillo ?? null;

  let contenido: ReactNode;
  const globos: ReactNode[] = [];
  let charla: ReactNode = null;
  let suelta: ReactNode = null;
  let entrega: ReactNode = null;
  if (cargando) {
    contenido = (
      <>
        {sala.puestos.map((p, i) => (
          <span key={i}>
            <i className="of-sk of-skd" style={{ "--x": p.x, "--y": p.y + 8, "--w": 28, "--h": 20 } as CSSProperties} />
            <i className="of-sk of-skc" style={{ "--x": p.x + 12, "--y": p.y + 1, "--w": 12, "--h": 12 } as CSSProperties} />
          </span>
        ))}
        <div className="of-cover is-load" />
      </>
    );
  } else if (caida) {
    contenido = (
      <>
        {sala.puestos.map((p, i) => (
          <EscritorioVacio key={i} prefijo={sala.prefijo} x={p.x} y={p.y} />
        ))}
        {sala.escritorio ? <EscritorioTu sala={sala} n={0} empresa={nombre} chico={o.chico} rm={o.rm} onClick={null} /> : null}
        <div className="of-cover is-off" role="status">
          <div className="of-offmsg">
            <Icono nombre="cloud-off" tam={18} />
            <b>No pude leer {nombre}</b>
            <span>Las luces quedan apagadas hasta que responda.</span>
            <button type="button" className="of-btn is-sm" onClick={onReintentar}>
              <Icono nombre="refresh" tam={14} />
              Reintentar
            </button>
          </div>
        </div>
      </>
    );
  } else {
    // En el orden de los escritorios (así el orden de Tab no cambia cuando alguien camina, §13).
    const piezas: ReactNode[] = [];
    agentes.forEach((agente, i) => {
      const p = sala.puestos[i];
      if (!p) return;
      // 0.5.0 (JST-163): su hora estimada, su «✓ listo» y lo que va en el piso de abajo de su globo.
      const ls = vida.listo(agente.id);
      const hora = horaDe(agente);
      const ahora = ahoraDe(agente);
      const extra: Extra050 = { hora, listo: ls ? { codigo: ls.codigo, titulo: ls.codigo ? titulo(ls.codigo) : null } : null };
      const abajo = pisoDeAbajo(agente, hora, ahora);
      if (vida.enEscritorio(agente.id)) {
        piezas.push(<Puesto key={agente.id} agente={agente} x={p.x} y={p.y} o={o} extra={extra} ahora={ahora} />);
        if (!o.chico) globos.push(<Globo key={agente.id} agente={agente} x={p.x + 8} y={p.y + 1} anillo={anillo === agente.id} listo={!!ls} abajo={abajo} voz={vozDelGlobo(marca, agente)} />);
        return;
      }
      // Mientras va o viene, su puesto se ve vacío con la pantalla apagada; el botón es el personaje.
      piezas.push(<EscritorioVacio key={`d-${agente.id}`} prefijo={sala.prefijo} x={p.x} y={p.y} />);
      const f = vida.fuera(agente.id);
      if (!f) return;
      piezas.push(<Andante key={`a-${agente.id}`} agente={agente} f={f} o={o} vida={vida} extra={extra} ahora={ahora} />);
      // El globo de su estado viaja con él («te necesita» nunca se esconde), también mientras espera su
      // turno en el descanso para volver a su escritorio (JST-137; sentado en el sofá, 4 px más abajo). A 1x, la mano y el punto azul.
      // 0.5.0: en una entrega no lleva globo (hablan); en tu fila, solo el primero, con lo que te pide.
      if (agente.st === "libre" || f.junta || (f.fila !== null && f.fila > 0)) return;
      const dy = f.sofa ? 4 : 0;
      if (!o.chico) {
        globos.push(
          <span key={`b-${agente.id}`} ref={(el) => vida.registrar(`b:${agente.id}`, el)} className="of-mov of-movb" style={{ "--x": f.pos.x, "--y": f.pos.y - 23 + dy } as CSSProperties}>
            <Globo agente={agente} x={0} y={0} anillo={anillo === agente.id} abajo={abajo} voz={vozDelGlobo(marca, agente)} />
          </span>,
        );
        return;
      }
      if (agente.need) {
        piezas.push(
          <span key={`fa-${agente.id}`} ref={(el) => vida.registrar(`fa:${agente.id}`, el)} className="of-vfx of-mov" style={{ "--x": f.pos.x - 8, "--y": f.pos.y - 36 + dy } as CSSProperties} aria-hidden="true">
            <EfectoSpr nombre="aviso" x={0} y={0} />
          </span>,
        );
      }
      if (agente.st === "trabaja") {
        piezas.push(<i key={`fd-${agente.id}`} ref={(el) => vida.registrar(`fd:${agente.id}`, el)} className="of-dot of-vdot of-mov" style={{ "--x": f.pos.x + 3, "--y": f.pos.y - 26 + dy } as CSSProperties} />);
      }
    });
    for (const s of vida.sobresDe(sala.prefijo, o.chico)) piezas.push(<SobreVista key={`s-${s.id}`} s={s} vida={vida} voz={esMarca(marca, "sobre", `s:${s.id}`)} />);
    // 0.5.0 (JST-163): tu escritorio con su globo, la entrega en la mesa y el sobre en la mano.
    if (sala.escritorio) {
      const n = esperanEn(agentes, sala.prefijo);
      const e = sala.escritorio;
      piezas.push(<EscritorioTu key="tu" sala={sala} n={n} empresa={nombre} chico={o.chico} rm={o.rm} onClick={onEscritorio} />);
      if (!o.chico && n > 0) {
        globos.push(
          <span key="yo" className="of-bub of-b-yo is-need" data-yo={sala.prefijo} style={{ "--x": e.x + 14, "--y": e.y + 7 } as CSSProperties}>
            <Icono nombre="hand" tam={12} />
            <b>{n}</b> esperándote
          </span>,
        );
      }
    }
    for (const s of vida.sobresManoDe(sala.prefijo)) piezas.push(<SobreMano key={`sm-${s.id}`} s={s} vida={vida} />);
    const jv = o.chico ? null : vida.juntaDe(sala.prefijo);
    if (jv) entrega = <GlobosEntrega key={`e-${jv.id}`} j={jv} sala={sala} marca={marca} />;
    const ch = vida.charlaDe(sala.prefijo);
    if (ch) {
      // A 1x, en lugar del hilo, el «…» sobre quien habla (JST-162 §5.4).
      charla = o.chico ? (
        <span key={ch.clave} className="of-vfx of-vchat" style={{ "--x": ch.pos.x - 4, "--y": ch.pos.y - 38 } as CSSProperties} aria-hidden="true">
          <EfectoSpr nombre="charla" x={0} y={0} />
          {esMarca(marca, "charla", ch.clave) ? <Parlante /> : null}
        </span>
      ) : (
        <HiloCharla key={`h-${ch.id}`} ch={ch} ancho={sala.descanso.w} marca={marca} />
      );
    }
    // La frase suelta: a 1x no se ve.
    const su = o.chico ? null : vida.sueltaDe(sala.prefijo);
    if (su) suelta = <GloboSuelta key={su.clave} s={su} ancho={sala.descanso.w} voz={esMarca(marca, "suelta", su.clave)} />;
    contenido = piezas;
  }

  // El hilo de la conversación (y la frase suelta) no sale del descanso: se corre entero hacia adentro, con 2 px
  // de margen, y la cola de cada globo sigue apuntando a quien lo dijo. Se esconde entero mientras toque un globo
  // de estado. Se revisa al aparecer y cuando cambia la sala (JST-162 §5.2).
  const revisar = useCallback(() => {
    const room = salaRef.current;
    if (!room) return;
    const rr = room.getBoundingClientRect();
    // Pixeles de pantalla por pixel de arte, y por pixel CSS (en el TV el lienzo va escalado a la ventana).
    const k = rr.width / sala.w;
    const pantalla = room.offsetWidth > 0 ? rr.width / room.offsetWidth : 1;
    // JST-197: los globos de estado de los escritorios (y el tuyo) no se tapan entre sí ni salen de la sala, con
    // 4 px entre ellos y del borde (lo que mide el anillo del rótulo, 3 px a 2x). Se corren hacia el lado (en la
    // sala acercada del celular, a 72 px de escritorio a escritorio, «✋ BET-502 +2» mide 84) y el piquito sigue
    // apuntando a su dueño. Los de quien camina no se corren.
    const fijos = Array.from(room.querySelectorAll<HTMLElement>(".of-globos > .of-bub"));
    if (fijos.length > 0) {
      for (const g of fijos) for (const v of ["--gx", "--gy", "--gc"]) g.style.removeProperty(v);
      const cajas = fijos.map((g) => {
        const q = g.getBoundingClientRect();
        return { l: q.left, r: q.right, t: q.top, b: q.bottom };
      });
      const corr = repartirGlobos(cajas, rr.left + 4 * pantalla, rr.right - 4 * pantalla, 4 * pantalla);
      fijos.forEach((g, i) => {
        const c = cajas[i]!;
        const dx = Math.round(corr[i]!.dx / pantalla);
        const dy = Math.round(corr[i]!.dy / pantalla);
        if (dx !== 0) g.style.setProperty("--gx", `${dx}px`);
        if (dy !== 0) g.style.setProperty("--gy", `${dy}px`);
        if (dx === 0) return;
        const antes = (rr.left + Number(g.style.getPropertyValue("--x")) * k - c.l) / pantalla;
        const ancho = (c.r - c.l) / pantalla;
        const ahora = Math.max(6, Math.min(ancho - 6, antes - dx));
        if (Math.abs(ahora - antes) > 0.5) g.style.setProperty("--gc", `${ahora - antes}px`);
      });
    }
    const hilos = Array.from(room.querySelectorAll<HTMLElement>(".of-hilo"));
    const ents = Array.from(room.querySelectorAll<HTMLElement>(".of-ent"));
    if (hilos.length === 0 && ents.length === 0) return;
    const izq = rr.left + sala.descanso.x * k + 2 * pantalla;
    const der = rr.left + (sala.descanso.x + sala.descanso.w) * k - 2 * pantalla;
    const estado = Array.from(room.querySelectorAll<HTMLElement>(".of-bub")).map((b) => b.getBoundingClientRect());
    for (const el of hilos) {
      el.style.setProperty("--dx", "0px");
      const r = el.getBoundingClientRect();
      let dx = 0;
      if (r.left < izq) dx = izq - r.left;
      else if (r.right > der) dx = Math.max(izq - r.left, der - r.right);
      el.style.setProperty("--dx", `${dx / pantalla}px`);
      for (const g of Array.from(el.querySelectorAll<HTMLElement>(".of-chat"))) {
        const q = g.getBoundingClientRect();
        const pies = rr.left + Number(g.dataset.px) * k;
        const ancho = q.width / pantalla;
        g.style.setProperty("--tx", `${Math.max(6, Math.min(ancho - 14, (pies - q.left) / pantalla - 4))}px`);
      }
      const caja = { left: r.left + dx, right: r.right + dx, top: r.top, bottom: r.bottom };
      const toca = estado.some((q) => !(q.right < caja.left || q.left > caja.right || q.bottom < caja.top || q.top > caja.bottom));
      el.classList.toggle("is-oculto", toca);
    }
    // 0.5.0 (JST-163 §10): lo de la entrega no se esconde: sube por encima de los globos de estado que toque, con 6 px de aire.
    for (const el of ents) {
      el.style.setProperty("--dy", "0px");
      const r = el.getBoundingClientRect();
      const tocan = estado.filter((q) => !(q.right < r.left || q.left > r.right || q.bottom < r.top || q.top > r.bottom));
      const arriba = tocan.length > 0 ? Math.min(...tocan.map((q) => q.top)) : null;
      if (arriba !== null) el.style.setProperty("--dy", `${(arriba - r.bottom - 6) / pantalla}px`);
      el.classList.toggle("is-alta", arriba !== null);
    }
  }, [sala]);
  useLayoutEffect(() => {
    revisar();
  });
  useEffect(() => {
    revisores.set(sala.prefijo, revisar);
    return () => {
      if (revisores.get(sala.prefijo) === revisar) revisores.delete(sala.prefijo);
    };
  }, [revisores, sala.prefijo, revisar]);

  // El mouse (o el foco del teclado) sobre un agente: el rótulo de su sala cuenta lo suyo (JST-138 §3.3).
  const pre = sala.prefijo;
  const fijar = sala.rotulo
    ? {
        onPointerOver: (e: PointerEvent) => {
          const id = e.pointerType === "mouse" ? agenteDe(e.target) : null;
          if (id) vida.fijarPin(pre, id);
        },
        onPointerOut: (e: PointerEvent) => {
          const de = e.pointerType === "mouse" ? agenteDe(e.target) : null;
          if (de && agenteDe(e.relatedTarget) !== de) vida.fijarPin(pre, null);
        },
        onFocus: (e: FocusEvent) => {
          const id = agenteDe(e.target);
          if (id && (e.target as Element).matches(":focus-visible")) vida.fijarPin(pre, id);
        },
        onBlur: (e: FocusEvent) => {
          if (agenteDe(e.target) && !(e.currentTarget.contains(e.relatedTarget as Node | null) && agenteDe(e.relatedTarget))) vida.fijarPin(pre, null);
        },
      }
    : {};
  const rotuloEl =
    rotulo && sala.rotulo ? (
      <Rotulo clave={pre} v={rotulo} vida={vida} etiqueta={`Qué se hace en ${nombre}`} style={{ "--x": sala.rotulo.x, "--y": sala.rotulo.y, "--w": sala.rotulo.w } as CSSProperties} />
    ) : null;

  const acercable = !!onAcercar && !cargando;
  return (
    <div
      ref={salaRef}
      className={cx("of-sala", claseEmpresa(sala.prefijo), atenuada && "is-dim", acercable && "is-zoom")}
      style={{ "--x": sala.x, "--y": sala.y, "--w": sala.w, "--h": sala.h } as CSSProperties}
      data-sala={sala.prefijo}
      {...fijar}
      {...(acercable
        ? {
            role: "button",
            tabIndex: 0,
            "aria-label": `Acercar ${nombre}`,
            onClick: () => onAcercar?.(sala.prefijo),
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onAcercar?.(sala.prefijo);
              }
            },
          }
        : {})}
    >
      <FondoSala sala={sala} nombre={nombre} numero={empresa?.conocidos ? String(empresa.agentes) : ""} oscuro={o.oscuro} />
      {contenido}
      {/* Después de los agentes de la sala en el orden del teclado (§3.5). */}
      {rotuloEl}
      {charla}
      {suelta}
      {entrega}
      <div className="of-globos">{globos}</div>
    </div>
  );
}

const NOMBRE_MASCOTA: Record<VistaMascota["id"], string> = { gato: "Gato", perro: "Perro", conejo: "Conejo", robot: "Robot aspiradora" };
/** La zona de cada mascota, en px de pantalla (la de `.of-pet::before`). */
const ZONA_MASCOTA = 44;

/**
 * A qué mascota iba el clic o el toque (JST-174): a 1x las zonas de 44 px se
 * pisan y el botón que lo recibe es el que va después en el HTML. Si el punto
 * cae en su dibujo (el botón mide lo dibujado), es esa: es la que se ve
 * encima. Si no, la que tiene el dibujo más cerca del punto. Con el teclado
 * (`detail` 0, sin punto), la del foco.
 */
function mascotaDelClic(vida: Vida, id: VistaMascota["id"], e: { currentTarget: HTMLElement; clientX: number; clientY: number; detail: number }): VistaMascota["id"] {
  const capa = e.currentTarget.parentElement;
  const r = e.currentTarget.getBoundingClientRect();
  const px = r.width / 16;
  const enDibujo = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  if (e.detail === 0 || enDibujo || !capa || !(px > 0)) return id;
  const c = capa.getBoundingClientRect();
  return vida.mascotaEn({ x: (e.clientX - c.left) / px, y: (e.clientY - c.top) / px }, ZONA_MASCOTA / px) ?? id;
}

/**
 * Las mascotas del pasillo (JST-96 §7), cada una con su cama debajo. 0.4.0
 * (JST-162 §3): son botones (zona de 44 px) y al clic o al toque dicen lo suyo
 * en un globo al lado. `tocables = false` (el TV, el widget en el celular):
 * decorativas, sin clics.
 */
function CapaMascotas({ vida, tocables }: { vida: Vida; tocables: boolean }) {
  useSyncExternalStore(vida.suscribir, () => vida.versionDeMascotas());
  const marca = useMarcaVoz();
  const lista = vida.mascotas();
  if (lista.length === 0) return null;
  const cama = MASCOTAS_ANIM.cama;
  return (
    <div className={cx("of-mascotas", tocables && "is-toca")} aria-hidden={tocables ? undefined : "true"}>
      {lista.map((m) => {
        const a = MASCOTAS_ANIM[(m.anim in MASCOTAS_ANIM ? m.anim : "quieto-der") as AnimMascota];
        const fila = filaMascota(m.id);
        const camina = m.anim.startsWith("caminar");
        const props = {
          ref: (el: HTMLElement | null) => vida.registrar(`m:${m.id}`, el),
          className: cx("of-pet", `of-pet-${m.id}`, camina && "of-mov", m.dice && "is-dice"),
          "data-mascota": m.id,
          style: { "--x": m.pos.x - 8, "--y": m.pos.y - 16 } as CSSProperties,
        };
        const contenido = (
          <>
            <Spr key={m.anim} hoja="ma" x={0} y={0} w={16} h={16} sx={a.desde * 16} sy={fila * 16} n={a.cuadros} ms={a.ms} d={hash(m.id) % 900} />
            {m.dice ? (
              <span key={m.dice} className={cx("of-pet-dice", `is-${m.lado}`)} aria-hidden="true">
                {esMarca(marca, "mascota", m.id) ? <Parlante /> : null}
                {m.dice}
              </span>
            ) : null}
          </>
        );
        return (
          <Fragment key={m.id}>
            <Spr hoja="ma" x={m.cama.x - 8} y={m.cama.y - 16} w={16} h={16} sx={cama.desde * 16} sy={fila * 16} className="of-cama" />
            {tocables ? (
              <button type="button" {...props} aria-label={NOMBRE_MASCOTA[m.id]} title={NOMBRE_MASCOTA[m.id]} onClick={(e) => vida.tocarMascota(mascotaDelClic(vida, m.id, e))}>
                {contenido}
              </button>
            ) : (
              <span {...props} aria-hidden="true">
                {contenido}
              </span>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

export interface PropsPiso {
  plano: PisoPlano;
  empresas: readonly EmpresaVista[];
  agentes: readonly AgenteVista[];
  o: OpcionesPiso;
  /** Prefijos del filtro; vacío = todas. Las salas fuera del filtro se atenúan, no se ocultan. */
  filtro: readonly string[];
  onAcercar?: (prefijo: string) => void;
  onReintentar: () => void;
  /** 0.3.0: el sincronizador, para los sobres (canal en vivo) y los temas de las conversaciones. */
  sync?: Sincronizador | null;
  /** Conversaciones en el descanso (el widget no tiene, JST-96 §10). */
  charlas?: boolean;
  /** El piso queda tapado (la página con el modo TV abierto): su vida se pausa como con la pestaña oculta. */
  pausado?: boolean;
  /** Las mascotas responden al clic o al toque (JST-162 §3); el widget del celular no (ahí tocar acerca la sala). */
  mascotasTocables?: boolean;
  /** El modo TV: sin mouse, las mascotas dicen lo suyo solas al despertar. */
  tv?: boolean;
  /** Clic en tu escritorio (0.5.0, JST-163 §14): en la página, la ventanita con quiénes te esperan; en el widget, abrir la página. Sin esto, no se puede hacer clic (el TV). */
  onEscritorio?: ((prefijo: string, el: HTMLElement) => void) | null;
  /** 0.6.0: la voz lee lo de la oficina (la página y el TV; el widget no habla, JST-225 §5). */
  voz?: boolean;
  /**
   * 0.7.0 (JST-231 §1): la IA de Chrome puede escribir sus conversaciones: la
   * página en el computador y su modo TV. El celular, el widget y el enlace para
   * un TV van siempre con las frases de siempre.
   */
  ia?: boolean;
  /** La vida de este piso, para quien la quiera leer: la vista 3D dibuja a cada uno donde esta vida dice. */
  onVida?: ((vida: Vida | null) => void) | null;
}

/** La vida de este piso: una por piso dibujado, al día con lo que se dibuja en cada pasada. */
function useVida(
  plano: PisoPlano,
  empresas: readonly EmpresaVista[],
  agentes: readonly AgenteVista[],
  o: OpcionesPiso,
  sync: Sincronizador | null,
  conCharlas: boolean,
  pausado: boolean,
  filtro: readonly string[],
  tv: boolean,
  horaDe: (a: AgenteVista) => Estimacion | null,
  ahoraDe: (a: AgenteVista) => number,
  conVoz: boolean,
  conIa: boolean,
) {
  const ref = useRef<Vida | null>(null);
  ref.current ??= new Vida();
  const vida = ref.current;
  const vozRef = useRef<VozDePiso | null>(null);
  vozRef.current ??= new VozDePiso(vida);
  const desbloqueado = useAudioDesbloqueado();
  const ajustes = useAjustes();
  const mascotas = ajustes.mascotas;
  // El botón «Conversaciones» (JST-162 §4): se guarda en el navegador y vale para la página y el TV.
  const charlas = conCharlas && ajustes.charlas;
  const oculta = usePestanaOculta() || pausado;
  const revisores = useRef(new Map<string, () => void>()).current;
  vida.fijarTemas(charlas ? temasDe(sync) : null);
  // 0.7.0 (JST-232): con la IA de Chrome elegida y lista, los finales y la mitad de las sueltas salen de su reserva.
  // 0.8.1 (JST-249): también en pausa (solo se saltan las ráfagas).
  const iaActiva = useIaActiva(conIa);
  vida.fijarIa(conIa && charlas && iaActiva ? fuenteIa(ajustes) : null);
  useEffect(() => (conIa ? registrarPisoIa(() => vida.pedidosIa()) : undefined), [conIa, vida]);
  // Los nombres de las tareas para el rótulo (JST-138 §2): los que la página ya leyó, sin lecturas nuevas.
  const titulos = titulosDe(sync);
  vida.fijarTitulos(titulos);
  const cargando = empresas.length === 0 || empresas.some((e) => e.estado.cargando);
  const activas = new Set(empresas.filter((e) => !e.estado.cargando && !e.estado.error).map((e) => e.prefijo));
  const lista: AgenteVida[] = agentes.map((a) => {
    titulos?.conocer(a.run?.identifier, a.run?.titulo);
    for (const e of a.teNecesita) titulos?.conocer(e.identifier, e.tituloTarea);
    const e = a.teNecesita[0];
    return {
      id: a.id,
      companyId: a.companyId,
      prefijo: a.prefijo,
      st: a.st,
      need: a.need,
      codigo: a.st === "trabaja" ? (a.run?.identifier ?? null) : null,
      nombre: a.nombre,
      // Lo que te pide: el título de la tarjeta o de la aprobación; si no hay, el de la tarea (§2).
      espera: e ? { codigo: e.identifier, titulo: e.titulo ?? e.tituloTarea, mas: a.teNecesita.length - 1 } : null,
      // 0.5.0 (JST-163 §9): la hora estimada va en el rótulo, en una pastilla (JST-192: la vida la cambia en el paso del rótulo).
      run: a.run ? { codigo: a.run.identifier, titulo: a.run.titulo, enCola: a.run.enCola, hora: textoGlobo(horaDe(a), ahoraDe(a)) } : null,
      runId: a.run?.id ?? null,
      // Para las conversaciones (JST-162 §1.2): lo que la Oficina ya sabe de cada uno.
      empresa: a.empresa,
      rol: a.rol,
      rolApi: a.rolApi,
      motivo: a.motivo,
      esperaTipo: e?.tipo ?? null,
      esperaDesde: e?.desde ?? null,
      runDesde: a.run?.desde ?? null,
    };
  });
  // Idempotente: lo que cambió (el estado de alguien, el plano, las opciones) se aplica en esta misma pasada.
  vida.sincronizar(plano, lista, activas, { rm: o.rm, charlas, mascotas, mascotasSolas: tv, cargando, oculta, releyendo: sync?.releyendo() ?? false, filtro });
  // 0.6.0: con las voces prendidas, la oficina a la vista y el audio desbloqueado (el primer clic), la vida le cuenta a la voz.
  const voz = conVoz && ajustes.voces && desbloqueado && !oculta && !cargando ? vozRef.current : null;
  vida.fijarVoz(voz);
  useEffect(() => {
    const v = vozRef.current!;
    v.activar(!!voz);
    return () => v.activar(false);
  }, [voz]);
  useEffect(() => {
    voz?.pedirMascotas();
  });
  useEffect(
    () =>
      registrarVida(vida, () => {
        for (const [prefijo, revisar] of revisores) if (vida.hayQueRevisarGlobos(prefijo)) revisar();
      }),
    [vida, revisores],
  );
  // El sobre sale con el evento de la entrega, que ya llega por el canal en vivo (0 llamadas extra). 0.5.0: también
  // el «✓ listo», con el fin de cada run (`heartbeat.run.status`).
  useEffect(() => {
    if (!sync) return;
    return sync.alEventoVivo((_, evento) => {
      const e = entregaDeEvento(evento);
      if (e) vida.entrega(e.de, e.a, e.codigo);
      const p = evento.payload;
      if (evento.type === "heartbeat.run.status" && typeof p.agentId === "string" && typeof p.status === "string" && TERMINADOS.has(p.status)) {
        vida.terminoRun(p.agentId, typeof p.runId === "string" ? p.runId : null, p.status);
      }
    });
  }, [sync, vida]);
  return { vida, revisores, voz, cargando };
}

/** Un run terminó (bien o mal): `heartbeat.run.status` con uno de estos. */
const TERMINADOS: ReadonlySet<string> = new Set(["succeeded", "failed", "timed_out", "cancelled"]);

/** El rótulo de 1x, bajo el piso (JST-138 §3.6): uno solo, del ancho del piso, que turna las empresas. */
function RotuloPiso({ vida, ancho }: { vida: Vida; ancho: number }) {
  useSyncExternalStore(vida.suscribir, () => vida.versionDelPiso());
  const v = vida.rotuloDe(ROTULO_PISO);
  if (!v) return null;
  return <Rotulo clave={ROTULO_PISO} v={v} vida={vida} piso etiqueta="Qué se hace en la oficina" style={{ width: ancho }} />;
}

export function Piso({ plano, empresas, agentes, o, filtro, onAcercar, onReintentar, sync = null, charlas = true, pausado = false, mascotasTocables = true, tv = false, onEscritorio = null, voz: conVoz = false, ia: conIa = false, onVida = null }: PropsPiso) {
  const porPrefijo = new Map(empresas.map((e) => [e.prefijo, e]));
  // 0.5.0 (JST-163 §9): la hora estimada de quien trabaja, con sus últimos runs; se vuelve a calcular cada minuto.
  // JST-192: cada uno en su instante del minuto, para que ningún globo la cambie a la vez que otro ni que un rótulo (§8).
  const conHora = (a: AgenteVista) => a.st === "trabaja" && !!a.run && !a.run.enCola;
  const trabajan = agentes.filter(conHora).map((a) => ({ id: a.id, desde: a.run!.desde }));
  const oculta = usePestanaOculta() || pausado;
  const reloj = useHorasDelPiso(sync, agentes.map((a) => a.id), plano.salas.length, oculta, trabajan);
  const horas = reloj.horas;
  const ahoraDe = (a: AgenteVista) => (conHora(a) ? reloj.ahoraDe(a.id, a.run!.desde) : reloj.ahora);
  const horaDe = (a: AgenteVista) => (conHora(a) ? (horas?.estimacion(a.id, a.run!.desde, ahoraDe(a)) ?? null) : null);
  const { vida, revisores, voz, cargando } = useVida(plano, empresas, agentes, o, sync, charlas, pausado, filtro, tv, horaDe, ahoraDe, conVoz, conIa);
  useEffect(() => {
    if (!onVida) return;
    onVida(vida);
    return () => onVida(null);
  }, [vida, onVida]);
  // 0.6.0 (JST-225 §4): la hora estimada en voz alta, una vez por tarea, cuando aparece en su globo. Las que ya estaban
  // cuando empezó a sonar la oficina (al abrir, o al prender las voces) no se dicen.
  useEffect(() => {
    if (!voz || cargando) return;
    const primera = !voz.horasDichas.has("");
    voz.horasDichas.add("");
    for (const a of agentes) {
      if (!conHora(a)) continue;
      const clave = `${a.id}:${a.run!.identifier ?? a.run!.id}`;
      if (voz.horasDichas.has(clave)) continue;
      if (primera) {
        voz.horasDichas.add(clave);
        continue;
      }
      const e = horaDe(a);
      if (e?.tipo !== "hora") continue;
      voz.horasDichas.add(clave);
      void voz.hora(a.id, a.companyId, e.fin);
    }
  });
  // Los últimos runs de cada agente se leen una vez, después de dibujar el piso (de a 4).
  useEffect(() => {
    horas?.cargar(agentes.map((a) => ({ id: a.id, companyId: a.companyId })));
  });
  const titulos = titulosDe(sync);
  const titulo = (codigo: string) => titulos?.titulo(codigo) ?? null;
  const suelo = (
    <div
      className={cx("of-piso", `is-x${plano.escala}`)}
      style={{ "--px": plano.escala, "--fw": plano.w, "--fh": plano.h, isolation: "isolate" } as CSSProperties}
    >
      <div className="of-pasillo" />
      {plano.salas.map((sala) => (
        <Sala
          key={sala.prefijo}
          sala={sala}
          empresa={porPrefijo.get(sala.prefijo)}
          agentes={agentes.filter((a) => a.prefijo === sala.prefijo)}
          o={o}
          atenuada={filtro.length > 0 && !filtro.includes(sala.prefijo)}
          onAcercar={onAcercar}
          onReintentar={onReintentar}
          vida={vida}
          revisores={revisores}
          horaDe={horaDe}
          ahoraDe={ahoraDe}
          titulo={titulo}
          onEscritorio={tv ? null : onEscritorio}
        />
      ))}
      <CapaMascotas vida={vida} tocables={mascotasTocables && !tv} />
    </div>
  );
  if (plano.escala !== 1) return suelo;
  return (
    <>
      {suelo}
      <RotuloPiso vida={vida} ancho={plano.w} />
    </>
  );
}

/** Ícono y color de un estado. */
export function IconoEstado({ st, tam = 14 }: { st: Dibujo; tam?: 12 | 14 | 16 | 18 }) {
  return (
    <span className={`of-sdot of-c-${st}`}>
      <Icono nombre={ESTADOS[st].icono} tam={tam} />
    </span>
  );
}
