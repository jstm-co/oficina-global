// La vista 3D en primera persona, encima de la página como el modo TV. No es
// otra oficina: es el mismo plano, con la misma vida (la del piso de la página,
// `Piso.onVida`) y los mismos globos, puestos sobre el visor de three.js
// (`./oficina3d/`), que se carga aparte solo al abrirla.
//
// Empiezas sentado en tu escritorio de la sala donde más te esperan. Los globos
// se ven del tamaño que tendrían a esa distancia: de lejos, solo un punto del
// color de su estado; para leer lo que dicen, hay que acercarse.
//
// Lo que dicen también va sobre su cabeza, con los globos de la 2D: el hilo de
// una conversación sobre la pareja (arriba la frase anterior, atenuada; cada una
// hacia el lado de quien la dijo, visto desde donde estás), la frase suelta y lo
// de una entrega en la mesa; de lejos, solo un «…». El 🔊 va en el globo que
// está sonando, como en la 2D.
//
// Se hace lo mismo que en la 2D: un clic en alguien (o en su globo) te lleva
// frente a él y la página abre su ficha, o la ventana para responder si solo te
// espera; un clic en tu escritorio abre la ventanita con tu fila. La ficha va
// pegada a un ancla que sigue a quien la tiene abierta por la pantalla.
//
// Para no perderse a nadie: bajo quien te necesita late un anillo en el piso,
// y si queda fuera de la vista (o detrás de un muro), una flecha en el borde
// apunta hacia él. De cerca, el monitor de cada escritorio se lee: en qué
// trabaja, lo que te espera o su error, escrito encima de la pantalla en
// perspectiva (y el tuyo, cuántos te esperan).
//
// Cada sala es un cuarto cerrado, con puertas al pasillo, y el piso tiene sus
// muros y su techo. La luz es la de la hora de quien mira, en el reloj de su
// navegador (`../luz.ts`): cada uno ve la suya, en la oficina y en las ventanas.
//
// Se mira con el puntero capturado (desde el clic que abre la vista, o con un
// clic en la oficina), apuntando con la mira del centro; al abrir una ficha, el
// puntero se suelta para usarla, y al cerrarla vuelve solo: con el clic que la
// cerró o, si fue con Esc, al soltar la tecla (el navegador deja volver a
// capturarlo sin otro gesto porque lo soltó la página). Esc lo suelta; otro Esc sale.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { hash } from "../aspecto.js";
import { escenaDePiso, piesFuera, piesSentado, type Punto3d } from "../escena3d.js";
import { esperanEn, etiquetaEscritorio } from "../escritorio.js";
import { luzAhora } from "../luz.js";
import { apilar, flechaHacia, homografia, ladoVisto, matrizCss, type Flecha, type Punto } from "../perspectiva.js";
import type { Linea } from "../charlas.js";
import type { PisoPlano, SalaPlano } from "../plano.js";
import { nombreCorto } from "../rotulo.js";
import type { Vida, VistaJunta, VistaSuelta } from "../vida.js";
import { etiqueta, pantallaDe, pantallaTuya, pisoDeAbajo, type AgenteVista, type Dibujo, type Pantalla, type PisoAbajo } from "../vista.js";
import { baseUi } from "./audiosVoces.js";
import { useEsc, useMarcarVista3d } from "./capas.js";
import { BotonResumen } from "./menuResumen.js";
import { useMarcaVoz, type MarcaVoz } from "./vozOficina.js";
import type { Camara, Objetivo, PersonajeVisor, Proyeccion, Visor } from "./oficina3d/index.js";
import { ANIM_PUESTO, EtiquetaEmpresa, Globo, GloboFrase, Icono, PANTALLA, Parlante, cx, esMarca, vozDelGlobo } from "./piso.js";
import { BALDOSAS, HOJAS, filaDe } from "./sprites.js";

type ModuloVisor = typeof import("./oficina3d/index.js");

let modulo: Promise<ModuloVisor> | null = null;

/** El visor, desde `/_plugins/<uuid>/ui/oficina3d.js` (por su dirección completa: la interfaz llega desde una URL `blob:`). */
function cargarVisor(): Promise<ModuloVisor> {
  modulo ??= baseUi().then((base) => {
    if (!base) throw new Error("No encontré dónde está la interfaz del plugin");
    return import(new URL(`${base}oficina3d.js`, location.href).href) as Promise<ModuloVisor>;
  });
  // Si falló, la próxima vez se vuelve a intentar.
  modulo.catch(() => {
    modulo = null;
  });
  return modulo;
}

/** Si el navegador puede dibujar en 3D (three.js pide WebGL 2): sin él, la vista no abre y se dice por qué. */
function conWebgl(): boolean {
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}

/** Desde esta escala (pixeles de pantalla por pixel de arte) el globo se lee; más lejos, solo su punto. */
const ESCALA_LEE = 2;
/** El globo no crece más que esto aunque estés encima. */
const ESCALA_MAX = 3;
/** El globo va sobre la cabeza: la fila 0 del cuadro de 16×24, cuyos pies van en la 22 (un poco más arriba en el sofá, como en la 2D). */
const SOBRE_CABEZA = 23;
const EN_SOFA = 4;
/** Lo que dice alguien con su globo de estado va encima de él: lo que mide ese globo (con su pico), en pixeles de arte. */
const SOBRE_GLOBO = 10;
/** El ancla de una ficha: el cuadro del personaje (16×24, con el centro a media altura) o tu escritorio (28×20). */
const CUADRO_ANCLA = { w: 16, h: 24, centro: 11 };
const ESCRITORIO_ANCLA = { w: 28, h: 20, centro: 8 };
/** La indicación al pasar el puntero va un poco por encima de él; con el puntero capturado, un poco por debajo de la mira, para no tapar a quien apuntas. */
const SOBRE_PUNTERO = 14;
const BAJO_MIRA = 16;
/** Con el puntero capturado, la ayuda se ve este rato y se va. */
const AYUDA_MS = 6000;
/** Las flechas hacia quien te necesita: a esta distancia del borde (cabe la etiqueta con su pico), y lo que se corren para no montarse. */
const MARGEN_FLECHA = 64;
const PASO_FLECHA = { x: 104, y: 32 };
/** La etiqueta de una flecha, para poner su pico fuera de ella: pixeles por letra, lo que suman la mano y los bordes, y su media altura. */
const CHIP = { letra: 7.2, resto: 34, medioAlto: 11, pico: 3 };
/** Cada cuánto se vuelve a mirar la hora para la luz. */
const LUZ_MS = 60_000;
/** El texto de un monitor: su caja (8×5, como la pantalla) y desde qué ancho en la pantalla, en pixeles, se lee. */
const MONITOR = { w: 160, h: 100 };
const LEE_MONITOR = 100;

interface GloboEscena {
  clave: string;
  punto: Punto3d;
  st: Dibujo;
  need: boolean;
  /** El globo de un agente, o el de tu escritorio («✋ n esperándote»). */
  agente: AgenteVista | null;
  listo: boolean;
  abajo: PisoAbajo | null;
  esperan: number;
  /** De qué sala es (para tu escritorio). */
  prefijo: string;
}

/** Una frase de la conversación: la de ahora o la anterior (atenuada). */
interface FraseEscena {
  clave: string;
  quien: string;
  linea: Linea;
  ahora: boolean;
}

/** Una parte de lo que se dice (una frase, o lo de quien entrega o recibe) y dónde están los pies de quien la dice. */
interface ParteDicho {
  clave: string;
  x: number;
  z: number;
}

/**
 * Lo que se dice en una sala, sobre la cabeza de quien habla: el hilo de la
 * conversación (sobre la pareja), la frase suelta o la entrega en la mesa (lo
 * de quien entrega y el «🤝» de quien recibe). `partes`: cada una va hacia el
 * lado de quien la dice, visto desde donde estás. `ancho`: lo más que mide, en
 * pixeles de arte (el descanso de su sala, como en la 2D).
 */
type DichoEscena = { clave: string; punto: Punto3d; ancho: number; partes: ParteDicho[] } & (
  | { tipo: "charla"; frases: FraseEscena[] }
  | { tipo: "suelta"; s: VistaSuelta }
  | { tipo: "entrega"; j: VistaJunta }
);

/** Quien te necesita, para su flecha: su id, lo que dice la flecha, el medio de su cuerpo (hacia donde apunta) y su cabeza. Si se ve una de las dos, no lleva flecha. */
interface AvisoEscena {
  id: string;
  texto: string;
  punto: Punto3d;
  cabeza: Punto3d;
}

interface Escena {
  personajes: PersonajeVisor[];
  avisos: AvisoEscena[];
  pantallas: Map<string, string>;
  globos: GloboEscena[];
  dichos: DichoEscena[];
  /** Quién está sentado en cada escritorio: la clave de su pantalla → su id. */
  sentados: Map<string, string>;
}

/**
 * Lo que se ve ahora, con las mismas reglas que la sala de la 2D (`Sala` en
 * `piso.tsx`): sentado en su puesto o donde la vida diga, la pantalla de cada
 * escritorio, qué globos van (quien está libre, en una entrega o detrás del
 * primero de tu fila, no lleva) y lo que dice cada uno.
 */
function escenaDe(plano: PisoPlano, agentes: readonly AgenteVista[], vida: Vida, ahora: number): Escena {
  const e: Escena = { personajes: [], avisos: [], pantallas: new Map(), globos: [], dichos: [], sentados: new Map() };
  /** Dónde está cada uno (sus pies), si está en el sofá y si lleva su globo de estado. */
  const donde = new Map<string, { x: number; z: number; sofa: boolean; globo: boolean }>();
  for (const sala of plano.salas) {
    const deSala = agentes.filter((a) => a.prefijo === sala.prefijo);
    deSala.forEach((a, i) => {
      const p = sala.puestos[i];
      if (!p) return;
      const clave = `${sala.prefijo}:${i}`;
      const globo = (punto: Punto3d) => {
        e.globos.push({ clave: a.id, punto, st: a.st, need: a.need, agente: a, listo: !!vida.listo(a.id), abajo: pisoDeAbajo(a, null, ahora), esperan: 0, prefijo: sala.prefijo });
        const d = donde.get(a.id);
        if (d) d.globo = true;
      };
      const avisar = (x: number, z: number, bajo = 0) => {
        if (!a.need) return;
        e.avisos.push({ id: a.id, texto: a.teNecesita[0]?.identifier ?? nombreCorto(a.nombre), punto: { x, y: CUADRO_ANCLA.centro - bajo, z }, cabeza: { x, y: SOBRE_CABEZA - bajo, z } });
      };
      if (vida.enEscritorio(a.id)) {
        const pies = piesSentado(sala, p);
        e.personajes.push({ id: a.id, fila: filaDe(a.aspecto), anim: ANIM_PUESTO[a.st], x: pies.x, z: pies.y, quieto: false, d: hash(a.id) % 900, aviso: a.need });
        e.pantallas.set(clave, PANTALLA[a.st]);
        e.sentados.set(clave, a.id);
        donde.set(a.id, { x: pies.x, z: pies.y, sofa: false, globo: false });
        globo({ x: pies.x, y: SOBRE_CABEZA, z: pies.y });
        avisar(pies.x, pies.y);
        return;
      }
      e.pantallas.set(clave, "apagada");
      const f = vida.fuera(a.id);
      if (!f) return;
      const pies = piesFuera(sala, f.pos);
      e.personajes.push({ id: a.id, fila: filaDe(a.aspecto), anim: f.anim, x: pies.x, z: pies.y, quieto: f.quieto, d: hash(a.id) % 1500, aviso: a.need });
      donde.set(a.id, { x: pies.x, z: pies.y, sofa: f.sofa, globo: false });
      avisar(pies.x, pies.y, f.sofa ? EN_SOFA : 0);
      if (a.st === "libre" || f.junta || (f.fila !== null && f.fila > 0)) return;
      globo({ x: pies.x, y: SOBRE_CABEZA - (f.sofa ? EN_SOFA : 0), z: pies.y });
    });
    if (sala.escritorio) {
      const n = esperanEn(deSala, sala.prefijo);
      e.pantallas.set(`${sala.prefijo}:tu`, n > 0 ? "espera" : "apagada");
      if (n > 0) {
        // Como en la 2D, (x + 14, y + 7) de tu escritorio: sobre el monitor.
        const pies = piesSentado(sala, sala.escritorio);
        e.globos.push({ clave: `yo:${sala.prefijo}`, punto: { x: sala.x + sala.escritorio.x + 14, y: SOBRE_CABEZA - 6, z: pies.y }, st: "toca", need: true, agente: null, listo: false, abajo: null, esperan: n, prefijo: sala.prefijo });
      }
    }
    dichosDe(e, sala, vida, donde);
  }
  return e;
}

/**
 * Lo que se dice en una sala, como en la 2D: el hilo de la conversación sobre
 * la pareja (en el medio de los dos), la frase suelta sobre quien está solo y
 * la entrega sobre la mesa. Sobre la cabeza más alta, y más arriba si alguno
 * lleva su globo de estado.
 */
function dichosDe(e: Escena, sala: SalaPlano, vida: Vida, donde: ReadonlyMap<string, { x: number; z: number; sofa: boolean; globo: boolean }>): void {
  const ancho = sala.descanso.w;
  const alto = (ids: readonly string[]) => {
    const ds = ids.flatMap((id) => donde.get(id) ?? []);
    const sofa = ds.length > 0 && ds.every((d) => d.sofa);
    return SOBRE_CABEZA - (sofa ? EN_SOFA : 0) + (ds.some((d) => d.globo) ? SOBRE_GLOBO : 0);
  };
  const ch = vida.charlaDe(sala.prefijo);
  if (ch) {
    const frases: FraseEscena[] = [];
    if (ch.anterior) frases.push({ clave: ch.anterior.clave, quien: ch.anterior.quien, linea: ch.anterior.linea, ahora: false });
    frases.push({ clave: ch.actual.clave, quien: ch.actual.quien, linea: ch.actual.linea, ahora: true });
    const medio = piesFuera(sala, { x: ch.centro.x, y: ch.pos.y });
    const partes = frases.flatMap((f) => {
      const d = donde.get(f.quien);
      return d ? [{ clave: f.clave, x: d.x, z: d.z }] : [];
    });
    e.dichos.push({ clave: `ch:${ch.id}`, punto: { x: medio.x, y: alto(frases.map((f) => f.quien)), z: medio.y }, ancho, partes, tipo: "charla", frases });
  }
  const su = vida.sueltaDe(sala.prefijo);
  if (su) {
    const pies = piesFuera(sala, su.pos);
    e.dichos.push({ clave: `su:${su.quien}`, punto: { x: pies.x, y: alto([su.quien]), z: pies.y }, ancho, partes: [], tipo: "suelta", s: su });
  }
  const j = vida.juntaDe(sala.prefijo);
  if (j) {
    const de = piesFuera(sala, j.de.pos);
    const a = piesFuera(sala, j.a.pos);
    const partes = [{ clave: "de", x: de.x, z: de.y }, ...(j.responde ? [{ clave: "a", x: a.x, z: a.y }] : [])];
    e.dichos.push({ clave: `en:${j.id}`, punto: { x: (de.x + a.x) / 2, y: alto([j.de.id, j.a.id]), z: (de.y + a.y) / 2 }, ancho, partes, tipo: "entrega", j });
  }
}

/** Cada parte va hacia el lado de quien la dice, visto desde la cámara (girada `giro`), como en un chat; al medio, si queda ahí. */
function ladosDe(nodo: HTMLElement, d: DichoEscena, giro: number): void {
  for (const el of Array.from(nodo.querySelectorAll<HTMLElement>("[data-parte]"))) {
    const p = d.partes.find((x) => x.clave === el.dataset.parte);
    const lado = (p && ladoVisto(p, d.punto, giro)) ?? "";
    if (el.dataset.lado !== lado) el.dataset.lado = lado;
  }
}

/** La sala donde empiezas: la que tiene más gente esperándote; si nadie espera, la primera con tu escritorio. */
function salaInicial(plano: PisoPlano, agentes: readonly AgenteVista[]): string | null {
  let mejor: { prefijo: string; n: number } | null = null;
  for (const s of plano.salas) {
    if (!s.escritorio) continue;
    const n = esperanEn(agentes, s.prefijo);
    if (!mejor || n > mejor.n) mejor = { prefijo: s.prefijo, n };
  }
  return mejor?.prefijo ?? plano.salas[0]?.prefijo ?? null;
}

/**
 * Lo que dice alguien, con los globos de la 2D (`GloboFrase`, `.of-ent`) puestos
 * en su punto. `ahora`: lleva la frase de ahora (de lejos, su «…»); `voz`: está sonando.
 */
function contenidoDicho(d: DichoEscena, marca: MarcaVoz | null): { ahora: boolean; voz: boolean; nodo: ReactNode } {
  const hilo = { "--x": 0, "--y": 0, "--lw": d.ancho } as CSSProperties;
  switch (d.tipo) {
    case "charla": {
      const suena = (f: FraseEscena) => f.ahora && esMarca(marca, "charla", f.clave);
      return {
        ahora: true,
        voz: d.frases.some(suena),
        nodo: (
          <span className="of-hilo" style={hilo}>
            {d.frases.map((f) => (
              <span key={f.clave} className="of-3d-parte" data-parte={f.clave}>
                <GloboFrase linea={f.linea} clase={f.ahora ? "is-cur" : "is-prev"} lado={null} piesX={0} quien={f.quien} voz={suena(f)} />
              </span>
            ))}
          </span>
        ),
      };
    }
    case "suelta": {
      const voz = esMarca(marca, "suelta", d.s.clave);
      return {
        ahora: true,
        voz,
        nodo: (
          <span className="of-hilo is-suelta" style={hilo}>
            <GloboFrase linea={d.s.linea} clase="is-piensa" lado={null} piesX={0} quien={d.s.quien} voz={voz} />
          </span>
        ),
      };
    }
    case "entrega": {
      const vozDe = esMarca(marca, "entrega", `e:${d.j.id}:de`);
      const vozA = esMarca(marca, "entrega", `e:${d.j.id}:a`);
      return {
        ahora: true,
        voz: vozDe || vozA,
        nodo: (
          <span className="of-hilo of-3d-ent" style={hilo}>
            <span className="of-3d-parte" data-parte="de">
              <span className="of-ent is-de" style={{ "--corre": 0 } as CSSProperties}>
                {vozDe ? <Parlante /> : null}
                <b>{d.j.codigo}</b>
                <span className="of-ent-fl">→</span>
                <span className="of-ent-n">{d.j.para}</span>
              </span>
            </span>
            {d.j.responde ? (
              <span className="of-3d-parte" data-parte="a">
                <span className="of-ent is-a">
                  {vozA ? <Parlante /> : null}
                  <Icono nombre="handshake" tam={12} />
                </span>
              </span>
            ) : null}
          </span>
        ),
      };
    }
  }
}

/** Pone el globo donde cae en la pantalla, con su tamaño a esa distancia (o lo esconde si está detrás de ti o de un muro). */
function colocar(el: HTMLElement, pr: Proyeccion | null, ancho: number, alto: number): void {
  const fuera = !pr || pr.tapado || pr.x < -200 || pr.x > ancho + 200 || pr.y < -100 || pr.y > alto + 200;
  if (fuera) {
    if (el.dataset.vista !== "no") el.dataset.vista = "no";
    return;
  }
  const vista = pr.escala >= ESCALA_LEE ? "cerca" : "lejos";
  if (el.dataset.vista !== vista) el.dataset.vista = vista;
  el.style.transform = `translate3d(${pr.x.toFixed(1)}px, ${pr.y.toFixed(1)}px, 0)`;
  el.style.setProperty("--px", Math.min(ESCALA_MAX, pr.escala).toFixed(2));
  el.style.zIndex = String(100000 - Math.round(pr.distancia * 10));
}

/** Las esquinas de la pantalla de cada monitor (arriba a la izquierda, arriba a la derecha, abajo a la derecha, abajo a la izquierda) y hacia dónde mira (su z). */
interface Monitor {
  clave: string;
  esquinas: readonly [Punto3d, Punto3d, Punto3d, Punto3d];
  z: number;
}

function monitoresDe(plano: PisoPlano): Monitor[] {
  return escenaDePiso(plano).pantallas.map(({ clave, cara: c }) => ({
    clave,
    esquinas: [
      { x: c.x, y: c.y + c.alto, z: c.z },
      { x: c.x + c.w, y: c.y + c.alto, z: c.z },
      { x: c.x + c.w, y: c.y, z: c.z },
      { x: c.x, y: c.y, z: c.z },
    ],
    z: c.z,
  }));
}

/**
 * El texto de un monitor, encima de su pantalla en perspectiva: solo de frente,
 * sin un muro en medio y cuando se ve lo bastante grande para leerse.
 */
function colocarMonitor(el: HTMLElement, m: Monitor, v: Visor, camaraZ: number): void {
  const esconder = () => {
    if (el.dataset.vista !== "no") el.dataset.vista = "no";
  };
  if (camaraZ <= m.z) return esconder();
  const q: Punto[] = [];
  for (const p of m.esquinas) {
    const pr = v.proyectar(p);
    if (!pr || pr.tapado) return esconder();
    q.push({ x: pr.x, y: pr.y });
  }
  if (Math.hypot(q[1]!.x - q[0]!.x, q[1]!.y - q[0]!.y) < LEE_MONITOR) return esconder();
  const t = homografia(MONITOR.w, MONITOR.h, q as [Punto, Punto, Punto, Punto]);
  if (!t) return esconder();
  el.style.transform = matrizCss(t);
  if (el.dataset.vista !== "si") el.dataset.vista = "si";
}

/**
 * Las flechas hacia quien te necesita: nada si se le ve; detrás de un muro, una
 * marca donde está; fuera de la vista, en el borde, apuntando hacia él.
 */
function colocarFlechas(avisos: readonly AvisoEscena[], nodos: ReadonlyMap<string, HTMLElement>, v: Visor, ancho: number, alto: number): void {
  const enBorde: Array<{ el: HTMLElement; f: Flecha; texto: string }> = [];
  // Se ve (en pantalla, lejos de los bordes, sin un muro en medio): no hace falta flecha.
  const seVe = (p: Punto3d) => {
    const pr = v.proyectar(p);
    return !!pr && !pr.tapado && v.relativo(p).z > 1 && !flechaHacia(pr, true, ancho, alto, MARGEN_FLECHA);
  };
  for (const a of avisos) {
    const el = nodos.get(a.id);
    if (!el) continue;
    if (seVe(a.punto) || seVe(a.cabeza)) {
      if (el.dataset.modo !== "no") el.dataset.modo = "no";
      continue;
    }
    const pr = v.proyectar(a.punto);
    const rel = v.relativo(a.punto);
    const f = flechaHacia(pr && rel.z > 1 ? pr : null, rel.x >= 0, ancho, alto, MARGEN_FLECHA);
    // En pantalla y sin verse: detrás de un muro.
    if (!f) {
      if (el.dataset.modo !== "muro") el.dataset.modo = "muro";
      if (pr) el.style.transform = `translate3d(${pr.x.toFixed(1)}px, ${pr.y.toFixed(1)}px, 0)`;
      continue;
    }
    enBorde.push({ el, f, texto: a.texto });
  }
  const puestas = apilar(
    enBorde.map((x) => x.f),
    ancho,
    MARGEN_FLECHA,
    PASO_FLECHA,
  );
  enBorde.forEach(({ el, texto }, i) => {
    const f = puestas[i]!;
    if (el.dataset.modo !== "borde") el.dataset.modo = "borde";
    el.style.transform = `translate3d(${f.x.toFixed(1)}px, ${f.y.toFixed(1)}px, 0)`;
    // El pico, justo fuera de la etiqueta, en la dirección de quien te necesita.
    const medioAncho = (texto.length * CHIP.letra + CHIP.resto) / 2;
    const c = Math.abs(Math.cos(f.angulo));
    const s = Math.abs(Math.sin(f.angulo));
    const d = Math.min(c > 1e-3 ? medioAncho / c : Infinity, s > 1e-3 ? CHIP.medioAlto / s : Infinity) + CHIP.pico;
    el.style.setProperty("--a", `${f.angulo.toFixed(3)}rad`);
    el.style.setProperty("--d", `${d.toFixed(1)}px`);
  });
}

/** Lo que dice cada monitor que tiene algo que decir: el de quien está sentado ahí, o el tuyo. */
function textosDeMonitores(e: Escena, agentes: readonly AgenteVista[], plano: PisoPlano): Map<string, Pantalla> {
  const textos = new Map<string, Pantalla>();
  for (const [clave, id] of e.sentados) {
    const a = agentes.find((x) => x.id === id);
    const t = a ? pantallaDe(a) : null;
    if (t) textos.set(clave, t);
  }
  for (const s of plano.salas) if (s.escritorio) textos.set(`${s.prefijo}:tu`, pantallaTuya(esperanEn(agentes, s.prefijo)));
  return textos;
}

/** Quien tiene abierta su ficha (o tu escritorio, con su ventanita): el ancla lo sigue por la pantalla. */
type Anclado = { tipo: "agente"; id: string } | { tipo: "yo"; prefijo: string };

/**
 * Pone el ancla sobre quien la tiene, del tamaño que se ve, sin salirse del
 * visor (tu escritorio, con lo cerca que estás sentado, cae fuera de la
 * pantalla). Si quedó detrás de ti, se queda donde estaba.
 */
function anclar(el: HTMLElement, a: Anclado, e: Escena, plano: PisoPlano, v: Visor, caja: DOMRect): void {
  let centro: Punto3d | null = null;
  let t = CUADRO_ANCLA;
  if (a.tipo === "agente") {
    const p = e.personajes.find((x) => x.id === a.id);
    if (p) centro = { x: p.x, y: CUADRO_ANCLA.centro, z: p.z };
  } else {
    const s = plano.salas.find((x) => x.prefijo === a.prefijo);
    if (s?.escritorio) {
      t = ESCRITORIO_ANCLA;
      centro = { x: s.x + s.escritorio.x + 14, y: ESCRITORIO_ANCLA.centro, z: piesSentado(s, s.escritorio).y };
    }
  }
  const pr = centro ? v.proyectar(centro) : null;
  if (!pr) return;
  const k = Math.min(6, pr.escala);
  const w = t.w * k;
  const h = t.h * k;
  const x = Math.max(0, Math.min(caja.width - w, pr.x - w / 2));
  const y = Math.max(0, Math.min(caja.height - h, pr.y - h / 2));
  el.style.transform = `translate3d(${(caja.left + x).toFixed(1)}px, ${(caja.top + y).toFixed(1)}px, 0)`;
  el.style.width = `${w.toFixed(1)}px`;
  el.style.height = `${h.toFixed(1)}px`;
}

export interface PropsVista3D {
  plano: PisoPlano;
  agentes: readonly AgenteVista[];
  /** Para la indicación de tu escritorio: el nombre de cada empresa. */
  empresas: ReadonlyArray<{ prefijo: string; nombre: string }>;
  vida: Vida;
  oscuro: boolean;
  rm: boolean;
  onCerrar: () => void;
  /** Un clic en alguien: como en la 2D, la página abre su ficha o, si solo te espera, la ventana para responder. `ancla` lo sigue en la pantalla. */
  onAgente: (id: string, ancla: HTMLElement) => void;
  /** Un clic en tu escritorio de una sala (o en su globo «✋ n esperándote»): la ventanita con tu fila. */
  onEscritorio: (prefijo: string, ancla: HTMLElement) => void;
  /** Hay una ficha, tu fila o la ventana para responder abierta encima: el puntero es para ella. */
  abierto: boolean;
}

export function Vista3D({ plano, agentes, empresas, vida, oscuro, rm, onCerrar, onAgente, onEscritorio, abierto }: PropsVista3D) {
  // El reproductor del Resumen va encima de la vista mientras está abierta.
  useMarcarVista3d();
  // El 🔊 en el globo que suena.
  const marca = useMarcaVoz();
  // El Esc que suelta el puntero no es para salir.
  useEsc(true, () => {
    if (!visor.current?.escDeSoltar()) onCerrar();
  });
  // Se vuelve a dibujar cuando cambia la forma de alguna sala (alguien se levanta, llega a tu fila, termina).
  useSyncExternalStore(vida.suscribir, () => plano.salas.map((s) => vida.version(s.prefijo)).join(","));
  const caja = useRef<HTMLDivElement>(null);
  const lienzo = useRef<HTMLDivElement>(null);
  const ancla = useRef<HTMLDivElement>(null);
  const pistaEl = useRef<HTMLDivElement>(null);
  const visor = useRef<Visor | null>(null);
  const camara = useRef<Camara | null>(null);
  const globos = useRef(new Map<string, HTMLElement>());
  const dichos = useRef(new Map<string, HTMLElement>());
  const flechas = useRef(new Map<string, HTMLElement>());
  const pantallasEl = useRef(new Map<string, HTMLElement>());
  const monitores = useMemo(() => monitoresDe(plano), [plano]);
  const monitoresRef = useRef(monitores);
  monitoresRef.current = monitores;
  const anclado = useRef<Anclado | null>(null);
  const puntero = useRef({ x: 0, y: 0 });
  const [estado, setEstado] = useState<"carga" | "lista" | "error" | "sinWebgl">("carga");
  const [ayuda, setAyuda] = useState(true);
  /** El puntero capturado (se mira con él), y si la mira está sobre algo que se puede tocar. */
  const [capturado, setCapturado] = useState(false);
  const [apuntando, setApuntando] = useState(false);
  const [pista, setPista] = useState<string | null>(null);
  const [inicio] = useState(() => salaInicial(plano, agentes));
  /** La luz de la hora de quien mira; se vuelve a mirar cada minuto. */
  const [luz, setLuz] = useState(() => luzAhora());
  const luzRef = useRef(luz);
  luzRef.current = luz;
  const datos = useRef({ plano, agentes, empresas, vida, rm, onAgente, onEscritorio, abierto });
  datos.current = { plano, agentes, empresas, vida, rm, onAgente, onEscritorio, abierto };

  /** Lo que pasa al tocar algo: alguien (o su escritorio, si está sentado) te lleva frente a él y abre su ficha; tu escritorio, tu fila. */
  const tocar = (o: Objetivo) => {
    const v = visor.current;
    const el = ancla.current;
    if (!v || !el) return;
    setAyuda(false);
    setPista(null);
    const d = datos.current;
    const e = escenaDe(d.plano, d.agentes, d.vida, Date.now());
    let id = o.tipo === "agente" ? o.id : null;
    if (o.tipo === "puesto") {
      const [prefijo = "", n] = o.clave.split(":");
      if (n === "tu") {
        v.soltar();
        anclado.current = { tipo: "yo", prefijo };
        anclar(el, anclado.current, e, d.plano, v, lienzo.current!.getBoundingClientRect());
        d.onEscritorio(prefijo, el);
        return;
      }
      id = e.sentados.get(o.clave) ?? null;
    }
    if (!id) return;
    // La ficha se usa con el puntero.
    v.soltar();
    const p = e.personajes.find((x) => x.id === id);
    if (p) v.acercarse(p.x, p.z);
    anclado.current = { tipo: "agente", id };
    anclar(el, anclado.current, e, d.plano, v, lienzo.current!.getBoundingClientRect());
    d.onAgente(id, el);
  };
  const tocarRef = useRef(tocar);
  tocarRef.current = tocar;

  /** Lo que queda bajo el puntero: su indicación (la misma frase de la 2D) y si se puede tocar. */
  const pasar = (o: Objetivo | null): boolean => {
    const d = datos.current;
    if (!o) {
      setPista(null);
      return false;
    }
    let id = o.tipo === "agente" ? o.id : null;
    if (o.tipo === "puesto") {
      const [prefijo = "", n] = o.clave.split(":");
      if (n === "tu") {
        const empresa = d.empresas.find((x) => x.prefijo === prefijo)?.nombre ?? prefijo;
        setPista(etiquetaEscritorio(esperanEn(d.agentes, prefijo), empresa));
        return true;
      }
      id = escenaDe(d.plano, d.agentes, d.vida, Date.now()).sentados.get(o.clave) ?? null;
    }
    const a = id ? d.agentes.find((x) => x.id === id) : undefined;
    const ls = a ? d.vida.listo(a.id) : null;
    setPista(a ? etiqueta(a, { listo: ls ? { codigo: ls.codigo, titulo: null } : null }) : null);
    return !!a;
  };
  const pasarRef = useRef(pasar);
  pasarRef.current = pasar;

  // El visor: se arma al abrir y de nuevo si cambia el plano o el tema (donde estabas, se queda).
  useEffect(() => {
    let vivo = true;
    let v: Visor | null = null;
    const cs = getComputedStyle(caja.current!);
    const color = (n: string) => cs.getPropertyValue(n).trim();
    cargarVisor()
      .then((m) =>
        m.montar(lienzo.current!, {
          plano,
          oscuro,
          hojas: { muebles: HOJAS.muebles, personajes: HOJAS.personajes },
          baldosas: BALDOSAS,
          colores: { linea: color("--of-room-line"), toca: color("--of-s-toca") },
          luz: luzRef.current,
          sala: inicio,
          camara: camara.current,
        }),
      )
      .then((montado) => {
        if (!vivo) return montado.destruir();
        v = montado;
        visor.current = montado;
        montado.alTocar((o) => tocarRef.current(o));
        montado.alPasar((o) => {
          const tocable = pasarRef.current(o);
          setApuntando(tocable);
          return tocable;
        });
        montado.alCapturar((si) => {
          // Un clic afuera que cierra una ficha y abre otra: si el puntero llega a capturarse, se suelta para ella.
          if (si && datos.current.abierto) montado.soltar();
          setCapturado(si);
        });
        setEstado("lista");
        // Con el gesto del clic que abrió la vista, si todavía vale; si no, con un clic en la oficina.
        montado.capturar();
      })
      .catch(() => vivo && setEstado(conWebgl() ? "error" : "sinWebgl"));
    return () => {
      vivo = false;
      if (v) {
        camara.current = v.camara();
        v.destruir();
      }
      visor.current = null;
    };
  }, [plano, oscuro, inicio]);

  // Con algo abierto encima, las teclas para caminar no capturan el puntero (es para usarlo). Al cerrarse, se vuelve a
  // mirar: con el gesto que lo cerró (un clic afuera, un botón) o, si fue Esc, al soltarlo (`Visor.capturar`).
  const abiertoAntes = useRef(abierto);
  useEffect(() => {
    const v = visor.current;
    if (!v) return;
    v.capturaConTeclas(!abierto);
    if (abiertoAntes.current && !abierto) v.capturar();
    abiertoAntes.current = abierto;
  }, [estado, abierto]);

  // La luz sigue la hora.
  useEffect(() => {
    const t = window.setInterval(() => setLuz(luzAhora()), LUZ_MS);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    visor.current?.fijarLuz(luz);
  }, [luz, estado]);

  // La ayuda se va un rato después de capturar el puntero por primera vez.
  useEffect(() => {
    if (!capturado || !ayuda) return;
    const t = window.setTimeout(() => setAyuda(false), AYUDA_MS);
    return () => clearTimeout(t);
  }, [capturado, ayuda]);

  // Un cuadro por vuelta de pantalla: los personajes donde dice la vida, cada globo y lo que dice cada uno sobre su cabeza, y el ancla de la ficha.
  useEffect(() => {
    let id = 0;
    const bucle = () => {
      id = requestAnimationFrame(bucle);
      const v = visor.current;
      const el = lienzo.current;
      if (!v || !el) return;
      const d = datos.current;
      const e = escenaDe(d.plano, d.agentes, d.vida, Date.now());
      v.cuadro({ ahora: performance.now(), personajes: e.personajes, pantallas: e.pantallas, rm: d.rm });
      const ancho = el.clientWidth;
      const alto = el.clientHeight;
      for (const g of e.globos) {
        const nodo = globos.current.get(g.clave);
        if (nodo) colocar(nodo, v.proyectar(g.punto), ancho, alto);
      }
      const giro = v.camara().giro;
      for (const d of e.dichos) {
        const nodo = dichos.current.get(d.clave);
        if (!nodo) continue;
        colocar(nodo, v.proyectar(d.punto), ancho, alto);
        ladosDe(nodo, d, giro);
      }
      const camaraZ = v.camara().z;
      for (const m of monitoresRef.current) {
        const nodo = pantallasEl.current.get(m.clave);
        if (nodo) colocarMonitor(nodo, m, v, camaraZ);
      }
      colocarFlechas(e.avisos, flechas.current, v, ancho, alto);
      if (anclado.current && ancla.current) anclar(ancla.current, anclado.current, e, d.plano, v, el.getBoundingClientRect());
    };
    id = requestAnimationFrame(bucle);
    return () => cancelAnimationFrame(id);
  }, []);

  // La indicación sigue al puntero (o queda sobre la mira, con el puntero capturado) sin volver a dibujar la vista.
  const ponerPista = (x: number, y: number, bajo = false) => {
    const el = pistaEl.current;
    if (!el) return;
    el.style.transform = bajo
      ? `translate3d(calc(${x.toFixed(0)}px - 50%), ${(y + BAJO_MIRA).toFixed(0)}px, 0)`
      : `translate3d(calc(${x.toFixed(0)}px - 50%), calc(${(y - SOBRE_PUNTERO).toFixed(0)}px - 100%), 0)`;
  };
  useEffect(() => {
    const r = lienzo.current?.getBoundingClientRect();
    if (capturado && r) ponerPista(r.left + r.width / 2, r.top + r.height / 2, true);
    else ponerPista(puntero.current.x, puntero.current.y);
  }, [pista, capturado]);

  const e = escenaDe(plano, agentes, vida, Date.now());
  const registrar = (clave: string, en = globos.current) => (nodo: HTMLElement | null) => {
    if (nodo) en.set(clave, nodo);
    else en.delete(clave);
  };
  const textos = textosDeMonitores(e, agentes, plano);
  return (
    <div ref={caja} className={cx("of-3d", rm && "of-rm")} role="dialog" aria-label="Oficina en 3D">
      <div
        ref={lienzo}
        className="of-3d-lienzo"
        onPointerMove={(ev) => {
          if (capturado) return;
          puntero.current = { x: ev.clientX, y: ev.clientY };
          ponerPista(ev.clientX, ev.clientY);
        }}
        onPointerLeave={() => setPista(null)}
      />
      <div className="of-3d-globos" aria-hidden="true">
        {monitores.map((m) => {
          const t = textos.get(m.clave);
          if (!t) return null;
          return (
            <div key={m.clave} ref={registrar(m.clave, pantallasEl.current)} className={cx("of-3d-pantalla", `of-st-${t.tono}`)} data-vista="no">
              <b>
                {t.codigo ? <span className="of-3d-pantalla-cod">{t.codigo}</span> : null}
                <span className="of-3d-pantalla-st">{t.estado}</span>
              </b>
              {t.texto ? <p>{t.texto}</p> : null}
              {t.tono === "trabaja" ? <i className="of-3d-pantalla-cursor" /> : null}
            </div>
          );
        })}
        {e.globos.map((g) => (
          <div
            key={g.clave}
            ref={registrar(g.clave)}
            className="of-3d-g"
            data-vista="no"
            onClick={() => tocar(g.agente ? { tipo: "agente", id: g.agente.id } : { tipo: "puesto", clave: `${g.prefijo}:tu` })}
          >
            <i className={cx("of-3d-punto", `of-st-${g.st}`, g.need && "is-need")} />
            {g.agente ? (
              <Globo agente={g.agente} x={0} y={0} listo={g.listo} abajo={g.abajo} voz={vozDelGlobo(marca, g.agente)} />
            ) : (
              <span className="of-bub of-b-yo is-need" style={{ "--x": 0, "--y": 0 } as CSSProperties}>
                <Icono nombre="hand" tam={12} />
                <b>{g.esperan}</b> esperándote
              </span>
            )}
          </div>
        ))}
        {e.dichos.map((d) => {
          const c = contenidoDicho(d, marca);
          return (
            <div key={d.clave} ref={registrar(d.clave, dichos.current)} className="of-3d-d" data-vista="no">
              {c.ahora ? (
                <i className={cx("of-3d-dice", c.voz && "is-voz")}>
                  <Icono nombre={c.voz ? "volume-2" : "message-circle"} tam={12} />
                </i>
              ) : null}
              {c.nodo}
            </div>
          );
        })}
      </div>
      <div className="of-3d-flechas" aria-hidden="true">
        {e.avisos.map((a) => (
          <div key={a.id} ref={registrar(a.id, flechas.current)} className="of-3d-flecha" data-modo="no">
            <i className="of-3d-flecha-pico" />
            <span className="of-3d-flecha-chip">
              <Icono nombre="hand" tam={12} />
              {a.texto}
            </span>
          </div>
        ))}
      </div>
      <div ref={ancla} className="of-3d-ancla" aria-hidden="true" />
      {capturado ? <i className={cx("of-3d-mira", apuntando && "is-on")} aria-hidden="true" /> : null}
      {pista ? (
        <div ref={pistaEl} className="of-tip of-3d-pista" role="tooltip">
          {pista}
        </div>
      ) : null}
      <div className="of-3d-barra">
        <span className="of-3d-salas" role="group" aria-label="Ir a tu escritorio de una sala">
          {plano.salas.map((s) => (
            <button key={s.prefijo} type="button" className="of-3d-sala" title={`Ir a tu escritorio en ${s.prefijo}`} onClick={() => visor.current?.irA(s.prefijo)}>
              <EtiquetaEmpresa prefijo={s.prefijo} solida />
            </button>
          ))}
        </span>
        <span className="of-sp" />
        {/* El de la página queda tapado: mientras la vista está abierta, va aquí (es uno solo, el menú es de los dos). */}
        <BotonResumen />
        <button type="button" className="of-tvexit" onClick={onCerrar}>
          <Icono nombre="x" tam={16} />
          Salir de la vista 3D
          <kbd>Esc</kbd>
        </button>
      </div>
      {estado === "carga" ? <p className="of-3d-aviso">Armando la oficina en 3D…</p> : null}
      {estado === "error" ? (
        <p className="of-3d-aviso" role="alert">
          No pude abrir la vista 3D. Vuelve a intentarlo en un rato.
        </p>
      ) : null}
      {estado === "sinWebgl" ? (
        <p className="of-3d-aviso" role="alert">
          Este navegador no puede dibujar la vista 3D: necesita WebGL 2. Prueba activando la aceleración por hardware o con otro navegador.
        </p>
      ) : null}
      {estado === "lista" && !capturado && !abierto ? (
        <p className="of-3d-ayuda">
          <span>Haz clic en la oficina o camina para mirar con el mouse</span>
        </p>
      ) : null}
      {estado === "lista" && capturado ? (
        <p className={cx("of-3d-ayuda", !ayuda && "is-off")}>
          <span>Mueve el mouse o un dedo: mira</span>
          <span>W A S D o flechas: camina</span>
          <span>Clic en alguien: su ficha</span>
          <span>Esc: suelta el mouse</span>
        </p>
      ) : null}
    </div>
  );
}
