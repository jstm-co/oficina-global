// Visor de la vista 3D en primera persona, con three.js. Va en su propio bundle
// (`dist/ui/oficina3d.js`) y la página lo carga solo al abrir la vista
// (`../vista3d.tsx`), por su dirección completa: Paperclip importa la interfaz
// del plugin desde una URL `blob:`, y ahí el code splitting de esbuild no sirve.
//
// La escena sale del plano de la 2D (`../../escena3d.ts`): aquí solo se le pone
// textura a cada cara, se paran los personajes que dice la vida y se camina.
// Todo sin luces ni sombras, con las mismas hojas de sprites, dibujado en baja
// resolución y agrandado sin suavizar, para que siga siendo pixel art. La hora
// de quien mira (`../../luz.ts`) tiñe la oficina: de día, con sus colores; al
// atardecer, cálida; de noche, más apagada, con las pantallas y las lámparas del
// techo encendidas. Por las ventanas se ve el cielo de esa hora (con nubes de
// día y estrellas de noche), y de día entra el sol: una mancha de luz en el
// piso frente a cada una, con la forma de su vidrio, que se corre y se estira
// con la hora y se pone cálida al atardecer.
//
// Controles, como en un juego en primera persona (eres la cámara):
// - el mouse o un dedo en el trackpad miran alrededor, sin clic ni arrastre,
//   con el puntero capturado (Pointer Lock) y la aceleración del sistema, como
//   el cursor de siempre. Capturarlo pide un gesto tuyo (un clic en la oficina,
//   o una tecla para caminar) y Esc lo suelta; eso lo manda el navegador;
// - con el puntero capturado se apunta con una mira al centro, y el clic toca
//   lo que está en ella; suelto, se toca lo que está bajo el puntero (qué pasa
//   al tocarlo lo decide la página, como en la 2D);
// - W A S D o las flechas caminan y giran (Mayús para ir más rápido);
// - pellizcar (o Ctrl + rueda) acerca la vista;
// - si el navegador no deja capturar el puntero, arrastrar mira alrededor.
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  Fog,
  FrontSide,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  Texture,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
} from "three";
import PERSONAJES from "../assets/personajes.json" with { type: "json" };
import MUEBLES from "../assets/muebles.json" with { type: "json" };
import {
  animDesde,
  choquesDe,
  escenaDePiso,
  inicioEn,
  manchaDe,
  puestosDe,
  sePuede,
  sillaTuya,
  tapado,
  VENTANA,
  volumen,
  type Cara,
  type Choques,
  type Escena3d,
  type Lamina,
  type PantallaEscena,
  type Punto3d,
} from "../../escena3d.js";
import { mezclar, type Luz } from "../../luz.js";
import type { PisoPlano } from "../../plano.js";

const ANIMS: Readonly<Record<string, { desde: number; cuadros: number; ms: number }>> = PERSONAJES.animaciones;
const CUADRO = PERSONAJES.cuadro;
const PIEZAS: Readonly<Record<string, { x: number; y: number; w: number; h: number }>> = MUEBLES.piezas;

/** Cuadros de cada pantalla y cuánto dura cada uno (los de `.of-scr` en la 2D). */
const PANTALLAS: Readonly<Record<string, { cuadros: number; ms: number }>> = {
  apagada: { cuadros: 1, ms: 0 },
  codigo: { cuadros: 5, ms: 320 },
  error: { cuadros: 2, ms: 450 },
  espera: { cuadros: 2, ms: 450 },
  dormida: { cuadros: 1, ms: 0 },
};

/** Altura de tus ojos: de pie, la fila 8 de un personaje (sus pies van en la 22); sentado en tu escritorio, más abajo. */
const OJOS = 14;
const OJOS_SENTADO = 10;
/** Sentado, miras un poco hacia abajo: tu escritorio, tu pantalla y tu fila. */
const INCLINACION_SENTADO = -0.1;
/** Tu cuerpo, para no atravesar muebles ni muros. */
const RADIO = 3;
/** Pixeles de arte por segundo: caminando (los agentes van a 40) y con Mayús. */
const PASO = 52;
const PASO_RAPIDO = 100;
/** Radianes por segundo con las flechas; por pixel de mouse o de trackpad, con el puntero capturado; y por pixel al arrastrar. */
const GIRO = 1.9;
const GIRO_MOUSE = 0.0025;
const GIRO_ARRASTRE = 0.0055;
/** Tras soltar el puntero, el Esc que lo soltó llega a la página en estos ms: no es para salir. */
const ESC_DE_SOLTAR = 300;
/** Tras soltar Esc, lo que espera la captura pendiente: el navegador también mira el Esc que se suelta, y soltaría el puntero si ya estuviera capturado. */
const TRAS_ESC_MS = 50;
/** Hasta dónde miras hacia abajo y hacia arriba, en radianes. */
const INCLINACION = { min: -1.2, max: 1 };
/** Hasta dónde se agranda o se achica la vista al pellizcar. */
const FOV = { inicial: 68, min: 30, max: 90 };
/** Al acercarte a alguien con un clic, quedas a esta distancia de sus pies: de conversación, con su globo y su ficha a la vista. */
const FRENTE_A = 44;
/** Lo que se mueve el puntero antes de que un clic cuente como arrastre. */
const ARRASTRE_MIN = 5;
/** La sombra bajo cada personaje (una elipse de pixeles, en pixeles de arte) y lo oscura que es. */
const SOMBRA_PJ = { w: 12, h: 5, opacidad: 0.28 };
/** El anillo bajo quien te necesita: su radio, y cada cuánto late (como el punto que salta en la 2D). */
const ANILLO = { radio: 9, ms: 1100 };
/** Lo acostado en el piso va apenas encima, para no pelear con él. */
const SOBRE_PISO = 0.2;
/** Lo que se aclara el tinte de la luz: en los personajes (que se lean de noche) y con el tema oscuro (sus baldosas ya son oscuras). */
const ACLARA = { personajes: 0.45, oscuro: 0.5 };
/**
 * La luz que entra por las ventanas: lo que se suma al piso a pleno sol (en el
 * tema oscuro, algo más: su piso es oscuro) y a qué altura va (sobre la
 * alfombra, debajo de las sombras de los personajes).
 */
const MANCHA = { claro: 0.2, oscuro: 0.26, y: 0.12 };
/** Las nubes por la ventana toman algo del color de abajo del cielo (rosadas al atardecer). */
const NUBE_CIELO = 0.3;

export interface DatosVisor {
  plano: PisoPlano;
  oscuro: boolean;
  /** Las hojas como data-URL (las de `sprites.ts`, para no traerlas dos veces). */
  hojas: { muebles: string; personajes: string };
  baldosas: Readonly<Record<string, string>>;
  /** Colores del tema: las líneas (el contorno de las salas) y el de «te necesita». */
  colores: { linea: string; toca: string };
  /** La luz de la hora (después, con `fijarLuz`). */
  luz: Luz;
  /** La sala donde empiezas, en tu escritorio. */
  sala: string | null;
  /** Dónde quedó la cámara la vez anterior (si el plano cambió con la vista abierta). */
  camara?: Camara | null;
}

export interface Camara {
  x: number;
  z: number;
  giro: number;
  inclinacion: number;
  fov: number;
}

export interface PersonajeVisor {
  id: string;
  /** Fila de su aspecto en la hoja (`filaDe`). */
  fila: number;
  anim: string;
  /** Pies en el piso (x, z). */
  x: number;
  z: number;
  quieto: boolean;
  /** Desfase de su animación, en ms. */
  d: number;
  /** Te necesita: un anillo que late en el piso, bajo sus pies. */
  aviso: boolean;
}

export interface CuadroVisor {
  ahora: number;
  personajes: readonly PersonajeVisor[];
  /** Qué muestra cada pantalla: clave de `PantallaEscena` → tipo (`apagada`, `codigo`, `error`, `espera`, `dormida`). */
  pantallas: ReadonlyMap<string, string>;
  rm: boolean;
}

export interface Proyeccion {
  /** En pixeles CSS, desde la esquina del visor. */
  x: number;
  y: number;
  /** Pixeles CSS por pixel de arte a esa distancia (el `--px` de la 2D). */
  escala: number;
  distancia: number;
  /** Hay un muro en medio. */
  tapado: boolean;
}

/** Lo que hay bajo el puntero: alguien (su id) o un escritorio (la clave de su pantalla, `<prefijo>:<n.º>` o `<prefijo>:tu`). */
export type Objetivo = { tipo: "agente"; id: string } | { tipo: "puesto"; clave: string };

export interface Visor {
  cuadro(c: CuadroVisor): void;
  proyectar(p: Punto3d): Proyeccion | null;
  /** La luz de otra hora: el tinte de la oficina, el cielo por las ventanas y la luz que entra por ellas. */
  fijarLuz(luz: Luz): void;
  /** Un punto visto desde la cámara: x hacia tu derecha, y hacia arriba, z hacia adelante (negativo: detrás de ti). */
  relativo(p: Punto3d): Punto3d;
  camara(): Camara;
  /** A tu escritorio de esa sala (o a su medio, si no tiene). */
  irA(prefijo: string): void;
  /** Pone la cámara donde se pide (lo que no venga queda igual). */
  fijarCamara(c: Partial<Camara>): void;
  /** Camina hasta quedar frente a quien tiene los pies en (x, z), y lo mira. */
  acercarse(x: number, z: number): void;
  /** Un clic: qué se tocó. El visor no camina solo; lo decide quien lo usa. */
  alTocar(fn: ((o: Objetivo) => void) | null): void;
  /** Lo que queda bajo el puntero (o en la mira), cada vez que cambia (`null`: nada, o el puntero salió). Devuelve si se puede tocar. */
  alPasar(fn: ((o: Objetivo | null) => boolean) | null): void;
  /**
   * Captura el puntero para mirar con él; pide un gesto tuyo de hace poco (un
   * clic, una tecla), o que lo último haya sido soltarlo desde aquí (`soltar`).
   * Con Esc apretado, espera a que lo sueltes. Si no se puede, no pasa nada.
   */
  capturar(): void;
  /** Si una tecla para caminar captura el puntero (no, mientras se usa una ficha o una ventana). */
  capturaConTeclas(si: boolean): void;
  /** Suelta el puntero (para usar una ficha o una ventana). */
  soltar(): void;
  /** Cada vez que el puntero se captura o se suelta. */
  alCapturar(fn: ((si: boolean) => void) | null): void;
  /** El Esc de ahora fue el que soltó el puntero (lo hace el navegador), no uno para salir. */
  escDeSoltar(): boolean;
  destruir(): void;
}

// ---------------------------------------------------------------------------
// Texturas
// ---------------------------------------------------------------------------

function imagen(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = url;
  return img.decode().then(() => img);
}

/** En gris, como `filter: grayscale(1)` en la 2D (una empresa sin color propio, `of-gris`). */
function enGris(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const datos = ctx.getImageData(0, 0, c.width, c.height);
  const d = datos.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = Math.round(0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!);
    d[i] = d[i + 1] = d[i + 2] = l;
  }
  ctx.putImageData(datos, 0, 0);
  return c;
}

/** La sombra de un personaje: una elipse de pixeles negra, para acostarla en el piso. */
function sombraDe(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#000";
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) if (((x + 0.5 - w / 2) / (w / 2)) ** 2 + ((y + 0.5 - h / 2) / (h / 2)) ** 2 <= 1) ctx.fillRect(x, y, 1, 1);
  }
  return c;
}

/** Un anillo de pixeles de un pixel de grueso, del color que se pida. */
function anilloDe(radio: number, color: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  const n = radio * 2 + 3;
  c.width = c.height = n;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = color;
  const m = n / 2;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) if (Math.abs(Math.hypot(x + 0.5 - m, y + 0.5 - m) - radio) <= 0.5) ctx.fillRect(x, y, 1, 1);
  }
  return c;
}

/** Los pixeles de un recorte del atlas (RGBA, fila por fila). */
function pixeles(img: HTMLImageElement, r: { x: number; y: number; w: number; h: number }): Uint8ClampedArray {
  const c = document.createElement("canvas");
  c.width = r.w;
  c.height = r.h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  return ctx.getImageData(0, 0, r.w, r.h).data;
}

const hexDe = (d: Uint8ClampedArray, i: number) => `#${[d[i]!, d[i + 1]!, d[i + 2]!].map((x) => x.toString(16).padStart(2, "0")).join("")}`;

/**
 * La ventana de cada hora, del tamaño de su dibujo, y lo que es vidrio (por ahí
 * entra la luz: blanco; el marco, transparente). El marco es el de la ventana de
 * día con el tinte de la oficina (es parte de la pared); por el vidrio, el cielo
 * de arriba abajo, fila por fila, con las nubes de la de día y las estrellas y
 * la luna de la de noche, que aparecen poco a poco. El marco y el vidrio salen
 * del dibujo: el color de su esquina (y el de su repisa, abajo) es marco; el del
 * pixel siguiente, vidrio; lo demás, nubes o estrellas.
 */
function pintorVentana(img: HTMLImageElement): { lienzo: HTMLCanvasElement; vidrio: HTMLCanvasElement; pintar(luz: Luz, tinte: Color): void } {
  const { w, h } = VENTANA.dia;
  const dia = pixeles(img, VENTANA.dia);
  const noche = pixeles(img, VENTANA.noche);
  const igual = (d: Uint8ClampedArray, i: number, j: number) => d[i] === d[j] && d[i + 1] === d[j + 1] && d[i + 2] === d[j + 2];
  const esquina = 0;
  const repisa = (h - 1) * w * 4;
  const cielo = (w + 1) * 4;
  const marco = (i: number) => dia[i + 3]! < OPACO || igual(dia, i, esquina) || igual(dia, i, repisa);
  const vidrio = document.createElement("canvas");
  vidrio.width = w;
  vidrio.height = h;
  const cv = vidrio.getContext("2d")!;
  const mascara = cv.createImageData(w, h);
  for (let i = 0; i < w * h * 4; i += 4) mascara.data.set(marco(i) ? [0, 0, 0, 0] : [255, 255, 255, 255], i);
  cv.putImageData(mascara, 0, 0);
  const lienzo = document.createElement("canvas");
  lienzo.width = w;
  lienzo.height = h;
  const ctx = lienzo.getContext("2d")!;
  const salida = ctx.createImageData(w, h);
  const color = new Color();
  const pintar = (luz: Luz, tinte: Color) => {
    for (let y = 0; y < h; y++) {
      // El cielo va de la primera fila de vidrio (la 1) a la última (sobre la repisa).
      const fila = mezclar(luz.cielo.arriba, luz.cielo.abajo, (y - 1) / Math.max(1, h - 3));
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        let hex: string;
        if (marco(i)) {
          // Como el resto de la oficina: el color de su dibujo por el tinte (en el espacio lineal, como lo hace el material).
          hex = `#${color.set(hexDe(dia, i)).multiply(tinte).getHexString()}`;
        } else {
          hex = fila;
          if (!igual(dia, i, cielo)) hex = mezclar(hex, mezclar(hexDe(dia, i), luz.cielo.abajo, NUBE_CIELO), 1 - luz.estrellas);
          if (!igual(noche, i, cielo)) hex = mezclar(hex, hexDe(noche, i), luz.estrellas);
        }
        salida.data[i] = parseInt(hex.slice(1, 3), 16);
        salida.data[i + 1] = parseInt(hex.slice(3, 5), 16);
        salida.data[i + 2] = parseInt(hex.slice(5, 7), 16);
        salida.data[i + 3] = dia[i + 3]! < OPACO ? 0 : 255;
      }
    }
    ctx.putImageData(salida, 0, 0);
  };
  return { lienzo, vidrio, pintar };
}

function textura(fuente: HTMLImageElement | HTMLCanvasElement, repetir: boolean): Texture {
  const t = new Texture(fuente);
  t.magFilter = NearestFilter;
  t.minFilter = NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = SRGBColorSpace;
  if (repetir) t.wrapS = t.wrapT = RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------------------
// Geometría: cada vértice lleva de textura su lugar en el dibujo 2D, (x, z − y)
// ---------------------------------------------------------------------------

/** Lo que se corre hacia afuera cada capa (la pantalla sobre el monitor, el cuadro sobre el muro). */
const CAPA = 0.05;
/** Cuánto se oscurece el revés de una cara (la espalda del monitor, el muro visto desde atrás). */
const REVES = 0.55;
/** Cuánto se oscurecen los costados y las tapas de abajo de un mueble (las de arriba van como el dibujo), para que se lea el volumen sin luces. */
const SOMBRA: Readonly<Record<Lamina["tipo"], number>> = { espalda: 1, lado: 0.78, arriba: 1, abajo: 0.6 };
/** Un pixel del atlas se ve desde esta opacidad (la del `alphaTest`). */
const OPACO = 128;

interface Lote {
  pos: number[];
  uv: number[];
  ind: number[];
}

/**
 * Las esquinas de una cara (sin correr por su capa) y las mismas corridas, en
 * el orden que la deja de frente hacia donde mira (+z, +x o hacia arriba; al
 * revés si va `vuelta`).
 */
function esquinas(c: Cara): { reales: number[][]; corridas: number[][] } {
  const x0 = c.x;
  const x1 = c.x + c.w;
  const k = (c.vuelta ? -1 : 1) * c.capa * CAPA;
  const orden = (r: number[][]) => (c.vuelta ? [r[1]!, r[0]!, r[3]!, r[2]!] : r);
  if (c.plano === "pie") {
    const reales = orden([
      [x0, c.y, c.z],
      [x1, c.y, c.z],
      [x1, c.y + c.alto, c.z],
      [x0, c.y + c.alto, c.z],
    ]);
    return { reales, corridas: reales.map(([x, y, z]) => [x!, y!, z! + k]) };
  }
  if (c.plano === "lado") {
    const z0 = c.z;
    const z1 = c.z + c.w;
    const reales = orden([
      [c.x, c.y, z1],
      [c.x, c.y, z0],
      [c.x, c.y + c.alto, z0],
      [c.x, c.y + c.alto, z1],
    ]);
    return { reales, corridas: reales.map(([x, y, z]) => [x! + k, y!, z!]) };
  }
  const reales = orden([
    [x0, c.y, c.z + c.alto],
    [x1, c.y, c.z + c.alto],
    [x1, c.y, c.z],
    [x0, c.y, c.z],
  ]);
  return { reales, corridas: reales.map(([x, y, z]) => [x!, y! + k, z!]) };
}

/** La coordenada de textura (u, v) de un punto del mundo, según de dónde sale el dibujo de su cara. */
function uvDe(c: Cara, x: number, y: number, z: number, atlas: { w: number; h: number }): [number, number] {
  // De costado, el dibujo corre a lo largo de z, con la fila de su pie.
  const s = c.plano === "lado" ? z : x;
  const t = (c.plano === "lado" ? c.z : z) - y;
  const tx = c.textura;
  if (tx.tipo === "atlas") return [(tx.ax + s - tx.px) / atlas.w, 1 - (tx.ay + t - tx.py) / atlas.h];
  if (tx.tipo === "baldosa") return [(s - tx.ox) / tx.tw, 1 - (t - tx.oy) / tx.th];
  if (tx.tipo === "ventana") return [(s - tx.px) / VENTANA.dia.w, 1 - (t - tx.py) / VENTANA.dia.h];
  return [0, 0];
}

/** Suma la cara al lote; `atras`: corrida hacia el fondo sin cambiar su dibujo (la pantalla en la espalda del monitor). */
function sumarCara(l: Lote, c: Cara, atlas: { w: number; h: number }, atras = 0): void {
  const base = l.pos.length / 3;
  const { reales, corridas } = esquinas(c);
  for (let i = 0; i < 4; i++) {
    const [x, y, z] = corridas[i]!;
    l.pos.push(x!, y!, z! - atras);
    const [rx, ry, rz] = reales[i]!;
    l.uv.push(...uvDe(c, rx!, ry!, rz!, atlas));
  }
  l.ind.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

/** Suma una lámina del cuerpo de un mueble: cada esquina, con el color del punto del dibujo que le toca. */
function sumarLamina(l: Lote, lamina: Lamina, c: Cara, atlas: { w: number; h: number }): void {
  const t = c.textura;
  if (t.tipo !== "atlas") return;
  const base = l.pos.length / 3;
  for (let i = 0; i < 4; i++) {
    const e = lamina.esquinas[i]!;
    const d = lamina.dibujo[i]!;
    l.pos.push(e.x, e.y, e.z);
    l.uv.push((t.ax + d.x - t.px) / atlas.w, 1 - (t.ay + d.y - t.py) / atlas.h);
  }
  l.ind.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

/** Qué pixeles del atlas se ven: su opacidad, para sacar el borde de cada dibujo. */
function opacidad(img: HTMLImageElement): (x: number, y: number) => boolean {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  return (x, y) => x >= 0 && y >= 0 && x < c.width && y < c.height && d[(y * c.width + x) * 4 + 3]! >= OPACO;
}

function geometria(l: Lote): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(l.pos), 3));
  g.setAttribute("uv", new BufferAttribute(new Float32Array(l.uv), 2));
  g.setIndex(l.ind);
  g.computeBoundingSphere();
  return g;
}

/** Un rectángulo de la hoja de personajes o de muebles, en coordenadas de textura. */
function rectUv(g: BufferGeometry, sx: number, sy: number, w: number, h: number, hoja: { w: number; h: number }): void {
  const u0 = sx / hoja.w;
  const u1 = (sx + w) / hoja.w;
  const v1 = 1 - sy / hoja.h;
  const v0 = 1 - (sy + h) / hoja.h;
  // PlaneGeometry: arriba a la izquierda, arriba a la derecha, abajo a la izquierda, abajo a la derecha.
  const uv = g.getAttribute("uv") as BufferAttribute;
  uv.setXY(0, u0, v1);
  uv.setXY(1, u1, v1);
  uv.setXY(2, u0, v0);
  uv.setXY(3, u1, v0);
  uv.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// El visor
// ---------------------------------------------------------------------------

/** Pixeles de pantalla por pixel del dibujo: el visor se dibuja chico y se agranda sin suavizar. */
function pixelDe(alto: number): number {
  return Math.max(2, Math.round(alto / 450));
}

export async function montar(contenedor: HTMLElement, datos: DatosVisor): Promise<Visor> {
  const tema = datos.oscuro ? "oscuro" : "claro";
  const [imgMuebles, imgPersonajes] = await Promise.all([imagen(datos.hojas.muebles), imagen(datos.hojas.personajes)]);
  const atlas = { w: imgMuebles.naturalWidth, h: imgMuebles.naturalHeight };
  const hojaPj = { w: imgPersonajes.naturalWidth, h: imgPersonajes.naturalHeight };
  const escena: Escena3d = escenaDePiso(datos.plano);
  const choques: Choques = choquesDe(datos.plano, escena);

  const desechables: Array<{ dispose(): void }> = [];
  const guardar = <T extends { dispose(): void }>(x: T): T => {
    desechables.push(x);
    return x;
  };

  const texAtlas = guardar(textura(imgMuebles, false));
  const texAtlasGris = guardar(textura(enGris(imgMuebles), false));
  const texPj = guardar(textura(imgPersonajes, false));
  // La ventana de la hora (se vuelve a pintar con `fijarLuz`) y su vidrio, para la luz que entra.
  const ventana = pintorVentana(imgMuebles);
  const texVentana = guardar(textura(ventana.lienzo, false));
  const texVidrio = guardar(textura(ventana.vidrio, false));
  // Las baldosas, y de las que dan un color liso (la pared encima de la de la 2D), su dibujo para sacarlo.
  const baldosas = new Map<string, Texture>();
  const dibujos = new Map<string, HTMLImageElement | HTMLCanvasElement>();
  const claveBaldosa = (nombre: string, gris: boolean) => `${nombre}|${gris ? 1 : 0}`;
  const nombresBaldosa = new Set(escena.caras.flatMap((c) => (c.textura.tipo === "baldosa" || c.textura.tipo === "liso" ? [claveBaldosa(c.textura.nombre, c.textura.gris)] : [])));
  // La niebla, del color del techo (lo lejos se pierde en la oficina, no en el blanco de la página).
  const techo = claveBaldosa("piso-baldosa", false);
  nombresBaldosa.add(techo);
  await Promise.all(
    [...nombresBaldosa].map(async (clave) => {
      const [nombre, gris] = clave.split("|");
      const url = datos.baldosas[`${nombre}-${tema}`];
      if (!url) return;
      const img = await imagen(url);
      const dibujo = gris === "1" ? enGris(img) : img;
      dibujos.set(clave, dibujo);
      baldosas.set(clave, guardar(textura(dibujo, true)));
    }),
  );
  /** El color del pixel (x, y) de una baldosa (blanco si no está). */
  const colorEn = (clave: string, x: number, y: number): Color => {
    const d = dibujos.get(clave);
    if (!d) return new Color(0xffffff);
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(d, x, y, 1, 1, 0, 0, 1, 1);
    const [r = 255, g = 255, b = 255] = ctx.getImageData(0, 0, 1, 1).data;
    return new Color().setRGB(r / 255, g / 255, b / 255, SRGBColorSpace);
  };

  const scene = new Scene();
  const colorNiebla = colorEn(techo, 1, 1);
  const niebla = new Fog(colorNiebla.clone(), 260, 760);
  scene.fog = niebla;
  scene.background = niebla.color;
  /** Lo que tiñe la luz: cada material con su color de siempre, y lo que se aclara (los personajes). */
  const blanco = new Color(0xffffff);
  const tinte = new Color(0xffffff);
  const teñidos: Array<{ m: MeshBasicMaterial; base: Color; aclara: number }> = [];
  const teñirUno = (t: { m: MeshBasicMaterial; base: Color; aclara: number }) => t.m.color.copy(t.base).multiply(tinte.clone().lerp(blanco, t.aclara));
  const teñir = (m: MeshBasicMaterial, aclara = 0): MeshBasicMaterial => {
    const t = { m, base: m.color.clone(), aclara };
    teñidos.push(t);
    teñirUno(t);
    return m;
  };

  // Cada textura, con su frente y su revés (el revés, más oscuro: la espalda del monitor, el muro visto desde atrás).
  // Lo liso y las lámparas van sin dibujo, de su color.
  const mapaDe = (clave: string): Texture | null =>
    clave === "atlas"
      ? texAtlas
      : clave === "atlas-gris"
        ? texAtlasGris
        : clave === "ventana"
          ? texVentana
          : clave.startsWith("baldosa:")
            ? (baldosas.get(clave.slice(8)) ?? null)
            : null;
  const colorDe = (clave: string): Color => {
    if (clave === "linea") return new Color(datos.colores.linea);
    if (clave.startsWith("liso:")) {
      const [baldosa = "", x = "0", y = "0"] = clave.slice(5).split("@");
      return colorEn(baldosa, Number(x), Number(y));
    }
    return new Color(0xffffff);
  };
  const materiales = new Map<string, { frente: Material; reves: Material }>();
  const material = (clave: string): { frente: Material; reves: Material } => {
    let m = materiales.get(clave);
    if (m) return m;
    const map = mapaDe(clave);
    const color = colorDe(clave);
    // Las lámparas están encendidas: la luz de la hora no las tiñe. La ventana tampoco: su marco ya va teñido, y el cielo es el de afuera.
    const t = clave === "lampara" || clave === "ventana" ? (x: MeshBasicMaterial) => x : teñir;
    m = {
      frente: guardar(t(new MeshBasicMaterial({ map, color, alphaTest: 0.5, side: FrontSide }))),
      reves: guardar(t(new MeshBasicMaterial({ map, color: color.clone().multiplyScalar(REVES), alphaTest: 0.5, side: BackSide }))),
    };
    materiales.set(clave, m);
    return m;
  };
  const claveDe = (c: Cara): string => {
    const t = c.textura;
    if (t.tipo === "atlas") return t.gris ? "atlas-gris" : "atlas";
    if (t.tipo === "linea" || t.tipo === "lampara" || t.tipo === "ventana") return t.tipo;
    if (t.tipo === "liso") return `liso:${claveBaldosa(t.nombre, t.gris)}@${t.x}@${t.y}`;
    return `baldosa:${claveBaldosa(t.nombre, t.gris)}`;
  };

  // Lo quieto: un lote por textura.
  const lotes = new Map<string, Lote>();
  const loteDe = (mapa: Map<string, Lote>, clave: string): Lote => {
    let l = mapa.get(clave);
    if (!l) mapa.set(clave, (l = { pos: [], uv: [], ind: [] }));
    return l;
  };
  // Cada lote, con su grupo delante (`§`): lo de un grupo (tu silla) va en sus propias mallas.
  for (const c of escena.caras) sumarCara(loteDe(lotes, `${c.grupo ?? ""}§${claveDe(c)}`), c, atlas);
  // El cuerpo de lo que va de pie, con el borde de su dibujo: la espalda, con su frente y su revés como cualquier
  // cara; los costados y las tapas, por los dos lados y algo más oscuros (`SOMBRA`).
  const lleno = opacidad(imgMuebles);
  const volumenes = new Map<string, Lote>();
  for (const cu of escena.cuerpos) {
    const t = cu.cara.textura;
    if (t.tipo !== "atlas") continue;
    const clave = `${cu.cara.grupo ?? ""}§${claveDe(cu.cara)}`;
    for (const lamina of volumen(cu, (x, y) => lleno(t.ax + x - t.px, t.ay + y - t.py))) {
      sumarLamina(lamina.tipo === "espalda" ? loteDe(lotes, clave) : loteDe(volumenes, `${clave}#${lamina.tipo}`), lamina, cu.cara, atlas);
    }
  }
  const solidos: Mesh[] = [];
  const grupos = new Map<string, Mesh[]>();
  const sumarMallas = (grupo: string, ...mallas: Mesh[]) => {
    scene.add(...mallas);
    if (!grupo) return;
    const lista = grupos.get(grupo) ?? [];
    lista.push(...mallas);
    grupos.set(grupo, lista);
  };
  for (const [claveGrupo, l] of lotes) {
    const [grupo = "", clave = ""] = claveGrupo.split("§");
    const g = guardar(geometria(l));
    const m = material(clave);
    const frente = new Mesh(g, m.frente);
    sumarMallas(grupo, frente, new Mesh(g, m.reves));
    solidos.push(frente);
  }
  for (const [claveTipo, l] of volumenes) {
    const [claveGrupo = "", tipo] = claveTipo.split("#") as [string, Lamina["tipo"]];
    const [grupo = "", clave = ""] = claveGrupo.split("§");
    const mat = guardar(teñir(new MeshBasicMaterial({ map: mapaDe(clave), color: colorDe(clave).multiplyScalar(SOMBRA[tipo]), alphaTest: 0.5, side: DoubleSide })));
    const malla = new Mesh(guardar(geometria(l)), mat);
    sumarMallas(grupo, malla);
    solidos.push(malla);
  }

  // Las pantallas: una cara cada una, con el recorte que toque en cada cuadro.
  // Van por los dos lados del monitor: de frente, como en la 2D, y en su espalda, para quien está sentado (tú).
  // No se tiñen: de noche se ven encendidas.
  const pantallas = new Map<string, { malla: Mesh; cara: PantallaEscena["cara"]; fondo: number; visto: string }>();
  const matPantalla = guardar(new MeshBasicMaterial({ map: texAtlas, alphaTest: 0.5, side: DoubleSide }));
  for (const p of escena.pantallas) {
    const l: Lote = { pos: [], uv: [], ind: [] };
    sumarCara(l, p.cara, atlas);
    sumarCara(l, { ...p.cara, capa: -p.cara.capa }, atlas, p.fondo);
    const g = guardar(geometria(l));
    const malla = new Mesh(g, matPantalla);
    scene.add(malla);
    pantallas.set(p.clave, { malla, cara: p.cara, fondo: p.fondo, visto: "apagada-0" });
  }

  const puestos = puestosDe(datos.plano);

  // Lo que gira para mirarte: las plantas y los personajes.
  const figuras: Mesh[] = [];
  const matFigura = guardar(teñir(new MeshBasicMaterial({ map: texAtlas, alphaTest: 0.5, side: DoubleSide })));
  for (const f of escena.figuras) {
    const g = guardar(new PlaneGeometry(f.w, f.h));
    g.translate(0, f.h / 2, 0);
    rectUv(g, f.ax, f.ay, f.w, f.h, atlas);
    const malla = new Mesh(g, matFigura);
    malla.position.set(f.x, 0, f.z);
    scene.add(malla);
    figuras.push(malla);
  }
  const matPj = guardar(teñir(new MeshBasicMaterial({ map: texPj, alphaTest: 0.5, side: DoubleSide }), ACLARA.personajes));
  // Bajo cada personaje, su sombra; bajo quien te necesita, además, un anillo que late. Acostados en el piso.
  const geoSombra = guardar(new PlaneGeometry(SOMBRA_PJ.w, SOMBRA_PJ.h));
  geoSombra.rotateX(-Math.PI / 2);
  const matSombra = guardar(new MeshBasicMaterial({ map: guardar(textura(sombraDe(SOMBRA_PJ.w, SOMBRA_PJ.h), false)), transparent: true, opacity: SOMBRA_PJ.opacidad, depthWrite: false }));
  const ladoAnillo = ANILLO.radio * 2 + 3;
  const geoAnillo = guardar(new PlaneGeometry(ladoAnillo, ladoAnillo));
  geoAnillo.rotateX(-Math.PI / 2);
  const matAnillo = guardar(new MeshBasicMaterial({ map: guardar(textura(anilloDe(ANILLO.radio, datos.colores.toca), false)), transparent: true, depthWrite: false }));
  const personajes = new Map<string, { malla: Mesh; sombra: Mesh; anillo: Mesh; visto: string }>();

  // La luz que entra por cada ventana: acostada en el piso, con la forma de su vidrio. Se suma a lo que hay debajo, como la luz.
  const matMancha = guardar(new MeshBasicMaterial({ map: texVidrio, transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide }));
  const manchas = escena.ventanas.map((v) => {
    const malla = new Mesh(new BufferGeometry(), matMancha);
    malla.visible = false;
    scene.add(malla);
    return { v, malla };
  });
  const ponerManchas = (luz: Luz) => {
    matMancha.color.set(luz.sol.color);
    matMancha.opacity = luz.sol.fuerza * (datos.oscuro ? MANCHA.oscuro : MANCHA.claro);
    for (const { v, malla } of manchas) {
      const puntos = luz.sol.fuerza > 0 ? manchaDe(v, luz.rayo) : [];
      malla.geometry.dispose();
      const l: Lote = { pos: [], uv: [], ind: [] };
      for (const q of puntos) {
        l.pos.push(q.x, MANCHA.y, q.z);
        l.uv.push(q.s / VENTANA.dia.w, 1 - q.t / VENTANA.dia.h);
      }
      // Recortada sigue siendo convexa: en abanico desde el primer punto.
      for (let i = 1; i + 1 < puntos.length; i++) l.ind.push(0, i, i + 1);
      malla.geometry = puntos.length >= 3 ? geometria(l) : new BufferGeometry();
      malla.visible = puntos.length >= 3;
    }
  };
  const fijarLuz = (luz: Luz) => {
    tinte.set(luz.tinte);
    if (datos.oscuro) tinte.lerp(blanco, ACLARA.oscuro);
    for (const t of teñidos) teñirUno(t);
    niebla.color.copy(colorNiebla).multiply(tinte);
    ventana.pintar(luz, tinte);
    texVentana.needsUpdate = true;
    ponerManchas(luz);
  };
  fijarLuz(datos.luz);

  // Cámara, dibujo y tamaño.
  const camara = new PerspectiveCamera(datos.camara?.fov ?? FOV.inicial, 1, 0.5, 1600);
  camara.rotation.order = "YXZ";
  const renderer = new WebGLRenderer({ antialias: false, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = SRGBColorSpace;
  const lienzo = renderer.domElement;
  lienzo.setAttribute("aria-hidden", "true");
  contenedor.appendChild(lienzo);
  let ancho = 1;
  let alto = 1;
  const medir = () => {
    ancho = Math.max(1, contenedor.clientWidth);
    alto = Math.max(1, contenedor.clientHeight);
    const k = pixelDe(alto);
    renderer.setSize(Math.ceil(ancho / k), Math.ceil(alto / k), false);
    camara.aspect = ancho / alto;
    camara.updateProjectionMatrix();
  };
  medir();
  const observador = new ResizeObserver(medir);
  observador.observe(contenedor);

  // Dónde estás.
  const salaDe = (prefijo: string | null) => datos.plano.salas.find((s) => s.prefijo === prefijo) ?? datos.plano.salas[0];
  const sala0 = salaDe(datos.sala);
  const inicio = sala0 ? inicioEn(sala0) : { x: datos.plano.w / 2, z: datos.plano.h / 2 };
  // Si el plano cambió con la vista abierta (otro ancho de ventana) y donde quedaste ya no se puede estar, vuelves a tu escritorio.
  const antes = datos.camara && sePuede(choques, datos.camara.x, datos.camara.z, RADIO) ? datos.camara : null;
  const yo: Camara = antes ? { ...antes } : { x: inicio.x, z: inicio.z, giro: Math.PI, inclinacion: INCLINACION_SENTADO, fov: datos.camara?.fov ?? FOV.inicial };
  // Empiezas sentado en tu escritorio; al moverte, te paras. Mientras estás sentado, tu silla no se ve (estás en ella).
  let sentado = !antes;
  let sentadoEn = sala0?.escritorio ? sala0.prefijo : null;
  let ojos = sentado ? OJOS_SENTADO : OJOS;
  /** Adónde vas tras un clic en alguien: frente a él (x, z), mirándolo. */
  let destino: { x: number; z: number; mirar: { x: number; z: number } } | null = null;
  let ultimo: number | null = null;

  // ---- Entrada ------------------------------------------------------------
  const teclas = new Set<string>();
  const esTexto = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  const MIAS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight"]);
  const alBajar = (e: KeyboardEvent) => {
    // Esc suelta el puntero capturado (el navegador también lo hace; así no depende de él). Salir es con otro Esc.
    if (e.key === "Escape" && capturado) {
      document.exitPointerLock();
      return;
    }
    // Las flechas que ya usó otro (el reproductor del Resumen, con el foco) no giran la cámara.
    if (e.defaultPrevented || esTexto(e.target) || e.metaKey || e.ctrlKey || e.altKey || !MIAS.has(e.code)) return;
    e.preventDefault();
    teclas.add(e.code);
    destino = null;
    // Echar a andar es un gesto tuyo: sirve para volver a mirar con el puntero (Mayús sola, no).
    if (conTeclas && !capturado && !e.code.startsWith("Shift")) capturar();
  };
  const alSubir = (e: KeyboardEvent) => teclas.delete(e.code);
  const alSalir = () => {
    teclas.clear();
    clearTimeout(trasEsc);
    escApretado = false;
    capturaPendiente = false;
  };
  // Chrome suelta el puntero con el Esc que cierra una ficha si se captura
  // mientras se aprieta o se suelta: la captura espera a que lo sueltes, y un
  // poco más (`TRAS_ESC_MS`). Va antes que todo lo demás (en la captura del
  // evento), porque la ficha se cierra con el mismo Esc y pide mirar ahí mismo.
  let escApretado = false;
  let capturaPendiente = false;
  let trasEsc: number | undefined;
  const alBajarEsc = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    escApretado = true;
    clearTimeout(trasEsc);
  };
  const alSubirEsc = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    clearTimeout(trasEsc);
    trasEsc = window.setTimeout(() => {
      escApretado = false;
      if (!capturaPendiente) return;
      capturaPendiente = false;
      capturar();
    }, TRAS_ESC_MS);
  };
  window.addEventListener("keydown", alBajarEsc, true);
  window.addEventListener("keyup", alSubirEsc, true);
  window.addEventListener("keydown", alBajar);
  window.addEventListener("keyup", alSubir);
  window.addEventListener("blur", alSalir);

  let arrastre: { id: number; x: number; y: number; movido: number } | null = null;
  /** Dónde está el puntero sobre el lienzo, en pixeles de la ventana (`null`: salió), y si se movió desde el último cuadro. */
  let puntero: { x: number; y: number } | null = null;
  let punteroMovido = false;
  // El puntero capturado: se mira con él y se apunta con la mira del centro.
  let capturado = false;
  let soltadoEn = -Infinity;
  /** El primer movimiento tras capturar puede traer un salto (lo que el puntero andaba fuera): no cuenta. */
  let recienCapturado = false;
  let alCambiarCaptura: ((si: boolean) => void) | null = null;
  let conTeclas = true;
  const alCambiarBloqueo = () => {
    const ahora = document.pointerLockElement === lienzo;
    if (ahora === capturado) return;
    capturado = ahora;
    recienCapturado = ahora;
    if (!ahora) soltadoEn = performance.now();
    arrastre = null;
    contenedor.classList.remove("is-drag");
    punteroMovido = true;
    alCambiarCaptura?.(ahora);
  };
  const capturar = () => {
    if (capturado || !lienzo.isConnected) return;
    if (escApretado) {
      capturaPendiente = true;
      return;
    }
    // Sin un gesto tuyo reciente (ni haberlo soltado desde aquí), el navegador dice que no: queda suelto hasta el próximo clic o tecla.
    try {
      (lienzo.requestPointerLock() as Promise<void> | undefined)?.catch(() => {});
    } catch {
      // Un navegador viejo, sin promesa.
    }
  };
  const centro = () => {
    const r = lienzo.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  const alApretar = (e: PointerEvent) => {
    if (e.button !== 0) return;
    if (!capturado) lienzo.setPointerCapture(e.pointerId);
    arrastre = { id: e.pointerId, x: e.clientX, y: e.clientY, movido: 0 };
  };
  const alMover = (e: PointerEvent) => {
    if (capturado) {
      if (recienCapturado) {
        recienCapturado = false;
        return;
      }
      // Hacia donde mueves la mano: a la derecha, miras a la derecha; hacia arriba, hacia arriba.
      mirar(-e.movementX * GIRO_MOUSE, -e.movementY * GIRO_MOUSE);
      return;
    }
    puntero = { x: e.clientX, y: e.clientY };
    punteroMovido = true;
    if (!arrastre || arrastre.id !== e.pointerId) return;
    const dx = e.clientX - arrastre.x;
    const dy = e.clientY - arrastre.y;
    arrastre.x = e.clientX;
    arrastre.y = e.clientY;
    arrastre.movido += Math.abs(dx) + Math.abs(dy);
    if (arrastre.movido < ARRASTRE_MIN) return;
    contenedor.classList.add("is-drag");
    mirar(-dx * GIRO_ARRASTRE, -dy * GIRO_ARRASTRE);
  };
  const alSalirPuntero = () => {
    if (capturado) return;
    puntero = null;
    punteroMovido = true;
  };
  /** Gira y levanta la vista (en radianes; positivo: a la izquierda y hacia arriba). Mirar corta el camino hacia alguien. */
  const mirar = (giro: number, arriba: number) => {
    yo.giro += giro;
    yo.inclinacion = Math.max(INCLINACION.min, Math.min(INCLINACION.max, yo.inclinacion + arriba));
    destino = null;
  };

  // Lo que hay bajo un punto de la pantalla: alguien o un escritorio.
  let tocar: ((o: Objetivo) => void) | null = null;
  let alBajo: ((o: Objetivo | null) => boolean) | null = null;
  const rayo = new Raycaster();
  const v2 = new Vector2();
  const bajo = (cx: number, cy: number): Objetivo | null => {
    const r = lienzo.getBoundingClientRect();
    v2.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    rayo.setFromCamera(v2, camara);
    const pj = rayo.intersectObjects([...personajes.values()].map((p) => p.malla), false)[0];
    const mundo = rayo.intersectObjects(
      solidos.filter((m) => m.visible),
      false,
    )[0];
    if (pj && (!mundo || pj.distance <= mundo.distance)) {
      const id = [...personajes.entries()].find(([, p]) => p.malla === pj.object)?.[0];
      if (id) return { tipo: "agente", id };
    }
    if (!mundo) return null;
    const { x, z } = mundo.point;
    const puesto = puestos.find(({ caja: [x0, z0, x1, z1] }) => x >= x0 - 0.5 && x <= x1 + 0.5 && z >= z0 - 0.5 && z <= z1 + 0.5);
    return puesto ? { tipo: "puesto", clave: puesto.clave } : null;
  };

  const alSoltar = (e: PointerEvent) => {
    if (!arrastre || arrastre.id !== e.pointerId) return;
    const clic = arrastre.movido < ARRASTRE_MIN;
    arrastre = null;
    contenedor.classList.remove("is-drag");
    if (!clic) return;
    const en = capturado ? centro() : { x: e.clientX, y: e.clientY };
    const o = bajo(en.x, en.y);
    if (o && tocar) tocar(o);
    // Un clic en la oficina, sin nadie: a mirar con el puntero.
    else if (!o) capturar();
  };

  // La rueda y dos dedos no mueven nada (mirar va con el puntero); solo pellizcar acerca la vista. Tampoco desplazan la página.
  const alRueda = (e: WheelEvent) => {
    e.preventDefault();
    if (!e.ctrlKey) return;
    // Una rueda de mouse cuenta por líneas en algunos navegadores.
    const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? alto : 1;
    yo.fov = Math.max(FOV.min, Math.min(FOV.max, yo.fov * Math.exp(e.deltaY * k * 0.01)));
  };
  // Pellizcar en Safari (que no lo manda como Ctrl + rueda).
  let escalaGesto = 1;
  const alEmpezarGesto = (e: Event) => {
    e.preventDefault();
    escalaGesto = 1;
  };
  const alCambiarGesto = (e: Event) => {
    e.preventDefault();
    const s = (e as Event & { scale?: number }).scale ?? 1;
    if (s > 0) yo.fov = Math.max(FOV.min, Math.min(FOV.max, yo.fov * (escalaGesto / s)));
    escalaGesto = s;
  };
  lienzo.addEventListener("pointerdown", alApretar);
  lienzo.addEventListener("pointermove", alMover);
  lienzo.addEventListener("pointerup", alSoltar);
  lienzo.addEventListener("pointercancel", alSoltar);
  lienzo.addEventListener("pointerleave", alSalirPuntero);
  lienzo.addEventListener("wheel", alRueda, { passive: false });
  lienzo.addEventListener("gesturestart", alEmpezarGesto);
  lienzo.addEventListener("gesturechange", alCambiarGesto);
  document.addEventListener("pointerlockchange", alCambiarBloqueo);

  // ---- Moverse --------------------------------------------------------------
  /** Da un paso (dx, dz): si choca, se desliza por el lado que se pueda. Si ya estás encima de algo (al empezar, en tu silla), sales. */
  const pasar = (dx: number, dz: number): boolean => {
    if (!sePuede(choques, yo.x, yo.z, RADIO)) {
      yo.x += dx;
      yo.z += dz;
      return true;
    }
    if (sePuede(choques, yo.x + dx, yo.z + dz, RADIO)) {
      yo.x += dx;
      yo.z += dz;
      return true;
    }
    if (dx !== 0 && sePuede(choques, yo.x + dx, yo.z, RADIO)) {
      yo.x += dx;
      return true;
    }
    if (dz !== 0 && sePuede(choques, yo.x, yo.z + dz, RADIO)) {
      yo.z += dz;
      return true;
    }
    return false;
  };

  const mover = (dt: number) => {
    const s = dt / 1000;
    const t = (c: string) => (teclas.has(c) ? 1 : 0);
    yo.giro += (t("ArrowLeft") + t("KeyQ") - t("ArrowRight") - t("KeyE")) * GIRO * s;
    const rapido = teclas.has("ShiftLeft") || teclas.has("ShiftRight");
    const adelante = t("KeyW") + t("ArrowUp") - t("KeyS") - t("ArrowDown");
    const lado = t("KeyD") - t("KeyA");
    const fx = -Math.sin(yo.giro);
    const fz = -Math.cos(yo.giro);
    const rx = Math.cos(yo.giro);
    const rz = -Math.sin(yo.giro);
    let dx = 0;
    let dz = 0;
    if (adelante || lado) {
      const v = (rapido ? PASO_RAPIDO : PASO) * s;
      const n = Math.hypot(adelante, lado);
      dx += ((fx * adelante + rx * lado) / n) * v;
      dz += ((fz * adelante + rz * lado) / n) * v;
    }
    if (destino) {
      const ex = destino.x - yo.x;
      const ez = destino.z - yo.z;
      const d = Math.hypot(ex, ez);
      if (d >= 1) {
        const k = Math.min(1, (PASO_RAPIDO * s) / d);
        // Si algo lo ataja, ahí se queda, y igual lo mira.
        if (!pasar(ex * k, ez * k)) destino = { ...destino, x: yo.x, z: yo.z };
      }
      // Gira de a poco hasta mirarlo.
      const quiero = Math.atan2(-(destino.mirar.x - yo.x), -(destino.mirar.z - yo.z));
      let dif = quiero - yo.giro;
      dif = Math.atan2(Math.sin(dif), Math.cos(dif));
      yo.giro += dif * Math.min(1, s * 6);
      yo.inclinacion += (-0.08 - yo.inclinacion) * Math.min(1, s * 4);
      if (d < 1 && Math.abs(dif) < 0.01) destino = null;
    }
    if (dx || dz) {
      pasar(dx, dz);
      sentado = false;
    }
    ojos += ((sentado ? OJOS_SENTADO : OJOS) - ojos) * Math.min(1, s * 8);
  };

  // ---- Cada cuadro --------------------------------------------------------
  const cuadro = (c: CuadroVisor) => {
    const dt = ultimo === null ? 16 : Math.max(0, Math.min(100, c.ahora - ultimo));
    ultimo = c.ahora;
    mover(dt);
    camara.position.set(yo.x, ojos, yo.z);
    camara.rotation.set(yo.inclinacion, yo.giro, 0);
    if (camara.fov !== yo.fov) {
      camara.fov = yo.fov;
      camara.updateProjectionMatrix();
    }
    for (const f of figuras) f.rotation.y = yo.giro;
    const oculta = sentado && sentadoEn ? sillaTuya(sentadoEn) : null;
    for (const [grupo, mallas] of grupos) for (const m of mallas) m.visible = grupo !== oculta;
    // Personajes: uno por agente que se ve, de cara a ti, con el cuadro de su animación.
    const vistos = new Set<string>();
    // El anillo late: crece y se apaga en cada vuelta (quieto, si se pidió menos movimiento).
    const fase = c.rm ? 0.3 : (c.ahora % ANILLO.ms) / ANILLO.ms;
    const crece = 1 + 0.35 * fase;
    matAnillo.opacity = c.rm ? 0.9 : 1 - 0.75 * fase;
    for (const p of c.personajes) {
      vistos.add(p.id);
      let pj = personajes.get(p.id);
      if (!pj) {
        const g = new PlaneGeometry(CUADRO.ancho, CUADRO.alto);
        // Los pies (fila 22 del cuadro) en el suelo.
        g.translate(0, CUADRO.alto / 2 - (CUADRO.alto - 22), 0);
        pj = { malla: new Mesh(g, matPj), sombra: new Mesh(geoSombra, matSombra), anillo: new Mesh(geoAnillo, matAnillo), visto: "" };
        personajes.set(p.id, pj);
        scene.add(pj.malla, pj.sombra, pj.anillo);
      }
      // Un poco por delante de su silla, que tiene la base en la misma línea.
      pj.malla.position.set(p.x, 0, p.z + 0.3);
      pj.sombra.position.set(p.x, SOBRE_PISO, p.z + 0.3);
      pj.anillo.visible = p.aviso;
      if (p.aviso) {
        pj.anillo.position.set(p.x, SOBRE_PISO + 0.05, p.z + 0.3);
        pj.anillo.scale.set(crece, 1, crece);
      }
      pj.malla.rotation.y = yo.giro;
      const anim = animDesde(p.anim, { x: yo.x - p.x, y: yo.z - p.z });
      const a = ANIMS[anim] ?? ANIMS["libre"]!;
      const n = p.quieto || c.rm || a.cuadros <= 1 || a.ms <= 0 ? 0 : Math.floor((c.ahora + p.d) / a.ms) % a.cuadros;
      const clave = `${a.desde + n}:${p.fila}`;
      if (clave !== pj.visto) {
        pj.visto = clave;
        rectUv(pj.malla.geometry, (a.desde + n) * CUADRO.ancho, p.fila * CUADRO.alto, CUADRO.ancho, CUADRO.alto, hojaPj);
      }
    }
    for (const [id, pj] of personajes) {
      if (vistos.has(id)) continue;
      scene.remove(pj.malla, pj.sombra, pj.anillo);
      pj.malla.geometry.dispose();
      personajes.delete(id);
    }
    // Pantallas.
    for (const [clave, pt] of pantallas) {
      const tipo = c.pantallas.get(clave) ?? "apagada";
      const info = PANTALLAS[tipo] ?? PANTALLAS["apagada"]!;
      const f = c.rm || info.cuadros <= 1 ? 0 : Math.floor(c.ahora / info.ms) % info.cuadros;
      const nombre = `pantalla-${tipo}-${f}`;
      if (nombre === pt.visto) continue;
      const pieza = PIEZAS[nombre];
      if (!pieza) continue;
      pt.visto = nombre;
      const t = pt.cara.textura;
      if (t.tipo !== "atlas") continue;
      const cara: Cara = { ...pt.cara, textura: { ...t, ax: pieza.x, ay: pieza.y } };
      const l: Lote = { pos: [], uv: [], ind: [] };
      sumarCara(l, cara, atlas);
      sumarCara(l, { ...cara, capa: -cara.capa }, atlas, pt.fondo);
      const uv = pt.malla.geometry.getAttribute("uv") as BufferAttribute;
      (uv.array as Float32Array).set(l.uv);
      uv.needsUpdate = true;
    }
    renderer.render(scene, camara);
    mirarBajo();
  };

  // Lo que queda bajo el puntero: se vuelve a mirar si se movió él o la cámara, y cada tanto, por quien camina.
  let bajoVisto: string | null = null;
  let firmaCamara = "";
  let vueltas = 0;
  function mirarBajo(): void {
    vueltas++;
    const firma = `${yo.x.toFixed(1)},${yo.z.toFixed(1)},${yo.giro.toFixed(3)},${yo.inclinacion.toFixed(3)},${yo.fov.toFixed(1)},${ojos.toFixed(1)}`;
    if (!punteroMovido && firma === firmaCamara && vueltas % 10 !== 0) return;
    punteroMovido = false;
    firmaCamara = firma;
    const en = capturado ? centro() : puntero && !arrastre ? puntero : null;
    const o = en ? bajo(en.x, en.y) : null;
    const clave = !o ? null : o.tipo === "agente" ? `a:${o.id}` : `p:${o.clave}`;
    if (clave === bajoVisto) return;
    bajoVisto = clave;
    const tocable = alBajo ? alBajo(o) : o?.tipo === "agente";
    lienzo.style.cursor = tocable ? "pointer" : "";
  }

  const v3 = new Vector3();
  const enCamara = new Vector3();
  const proyectar = (p: Punto3d): Proyeccion | null => {
    v3.set(p.x, p.y, p.z);
    enCamara.copy(v3).applyMatrix4(camara.matrixWorldInverse);
    const fondoVista = -enCamara.z;
    if (fondoVista < 1) return null;
    v3.project(camara);
    if (v3.z > 1) return null;
    const escala = alto / (2 * Math.tan((camara.fov * Math.PI) / 360) * fondoVista);
    return {
      x: ((v3.x + 1) / 2) * ancho,
      y: ((1 - v3.y) / 2) * alto,
      escala,
      distancia: Math.hypot(p.x - yo.x, p.y - ojos, p.z - yo.z),
      tapado: tapado(escena.muros, { x: yo.x, y: ojos, z: yo.z }, p),
    };
  };

  const relativo = (p: Punto3d): Punto3d => {
    enCamara.set(p.x, p.y, p.z).applyMatrix4(camara.matrixWorldInverse);
    return { x: enCamara.x, y: enCamara.y, z: -enCamara.z };
  };

  return {
    cuadro,
    proyectar,
    relativo,
    fijarLuz,
    camara: () => ({ ...yo }),
    irA(prefijo) {
      const s = salaDe(prefijo);
      if (!s) return;
      const p = inicioEn(s);
      yo.x = p.x;
      yo.z = p.z;
      yo.giro = Math.PI;
      yo.inclinacion = INCLINACION_SENTADO;
      sentado = true;
      sentadoEn = s.escritorio ? s.prefijo : null;
      destino = null;
    },
    acercarse(x, z) {
      const dx = yo.x - x;
      const dz = yo.z - z;
      const d = Math.hypot(dx, dz) || 1;
      const k = Math.min(1, FRENTE_A / d);
      destino = { x: x + dx * k, z: z + dz * k, mirar: { x, z } };
    },
    fijarCamara(c) {
      Object.assign(yo, c);
      destino = null;
    },
    alTocar(fn) {
      tocar = fn;
    },
    alPasar(fn) {
      alBajo = fn;
      bajoVisto = null;
      punteroMovido = true;
    },
    capturar,
    capturaConTeclas(si) {
      conTeclas = si;
    },
    soltar() {
      if (capturado) document.exitPointerLock();
    },
    alCapturar(fn) {
      alCambiarCaptura = fn;
    },
    escDeSoltar: () => capturado || performance.now() - soltadoEn < ESC_DE_SOLTAR,
    destruir() {
      observador.disconnect();
      document.removeEventListener("pointerlockchange", alCambiarBloqueo);
      if (capturado) document.exitPointerLock();
      clearTimeout(trasEsc);
      window.removeEventListener("keydown", alBajarEsc, true);
      window.removeEventListener("keyup", alSubirEsc, true);
      window.removeEventListener("keydown", alBajar);
      window.removeEventListener("keyup", alSubir);
      window.removeEventListener("blur", alSalir);
      lienzo.removeEventListener("pointerdown", alApretar);
      lienzo.removeEventListener("pointermove", alMover);
      lienzo.removeEventListener("pointerup", alSoltar);
      lienzo.removeEventListener("pointercancel", alSoltar);
      lienzo.removeEventListener("pointerleave", alSalirPuntero);
      lienzo.removeEventListener("wheel", alRueda);
      lienzo.removeEventListener("gesturestart", alEmpezarGesto);
      lienzo.removeEventListener("gesturechange", alCambiarGesto);
      for (const pj of personajes.values()) pj.malla.geometry.dispose();
      for (const m of manchas) m.malla.geometry.dispose();
      for (const d of desechables) d.dispose();
      // Suelta el contexto de WebGL ya (el navegador tiene pocos), sin esperar a que se recoja.
      renderer.forceContextLoss();
      renderer.dispose();
      lienzo.remove();
    },
  };
}
