// Cuentas de pantalla de la vista 3D (`ui/vista3d.tsx`), sin DOM:
//
// - `homografia` y `matrizCss`: llevar un rectángulo de HTML a un cuadrilátero
//   de la pantalla (el monitor de un escritorio visto en perspectiva), para
//   escribir en él con letra nítida, como si estuviera encendido.
// - `flechaHacia` y `apilar`: dónde va la flecha hacia quien te necesita cuando
//   no está a la vista (en el borde, apuntando hacia él), sin que se monten.
// - `ladoVisto`: de qué lado queda alguien visto desde la cámara (cada globo del
//   hilo de una conversación va hacia el lado de quien lo dijo, como en un chat).

export interface Punto {
  x: number;
  y: number;
}

/** Una matriz de 3×3, por filas. */
export type Matriz3 = readonly [number, number, number, number, number, number, number, number, number];

function adjunta(m: Matriz3): Matriz3 {
  return [
    m[4] * m[8] - m[5] * m[7],
    m[2] * m[7] - m[1] * m[8],
    m[1] * m[5] - m[2] * m[4],
    m[5] * m[6] - m[3] * m[8],
    m[0] * m[8] - m[2] * m[6],
    m[2] * m[3] - m[0] * m[5],
    m[3] * m[7] - m[4] * m[6],
    m[1] * m[6] - m[0] * m[7],
    m[0] * m[4] - m[1] * m[3],
  ];
}

function por(a: Matriz3, b: Matriz3): Matriz3 {
  const c = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) c[3 * i + j]! += a[3 * i + k]! * b[3 * k + j]!;
  return c as unknown as Matriz3;
}

/** Lleva los puntos (1,0,0), (0,1,0), (0,0,1) y (1,1,1) a los cuatro dados (`null` si tres caen en línea). */
function desdeBase(p: readonly [Punto, Punto, Punto, Punto]): Matriz3 | null {
  const m: Matriz3 = [p[0].x, p[1].x, p[2].x, p[0].y, p[1].y, p[2].y, 1, 1, 1];
  const a = adjunta(m);
  const det = m[0] * a[0] + m[1] * a[3] + m[2] * a[6];
  if (Math.abs(det) < 1e-9) return null;
  const v = [a[0] * p[3].x + a[1] * p[3].y + a[2], a[3] * p[3].x + a[4] * p[3].y + a[5], a[6] * p[3].x + a[7] * p[3].y + a[8]] as const;
  return por(m, [v[0], 0, 0, 0, v[1], 0, 0, 0, v[2]]);
}

/**
 * La homografía que lleva un rectángulo de w×h (con el origen arriba a la
 * izquierda) a un cuadrilátero: arriba a la izquierda, arriba a la derecha,
 * abajo a la derecha y abajo a la izquierda. `null` si el cuadrilátero no
 * sirve (tres puntos en línea, o uno detrás de la cámara que lo da vuelta).
 */
export function homografia(w: number, h: number, q: readonly [Punto, Punto, Punto, Punto]): Matriz3 | null {
  const desde = desdeBase([{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }]);
  const hasta = desdeBase(q);
  if (!desde || !hasta) return null;
  const t = por(hasta, adjunta(desde));
  if (Math.abs(t[8]) < 1e-12) return null;
  const n = t.map((x) => x / t[8]) as unknown as Matriz3;
  // Ninguna esquina puede quedar con la división de la perspectiva en cero o negativa (se vería al revés).
  for (const [x, y] of [[0, 0], [w, 0], [w, h], [0, h]] as const) if (n[6] * x + n[7] * y + n[8] <= 0) return null;
  return n;
}

/** Dónde cae un punto (x, y) del rectángulo con la homografía `t`. */
export function aplicar(t: Matriz3, x: number, y: number): Punto {
  const z = t[6] * x + t[7] * y + t[8];
  return { x: (t[0] * x + t[1] * y + t[2]) / z, y: (t[3] * x + t[4] * y + t[5]) / z };
}

/** La homografía como `transform` de CSS (con `transform-origin: 0 0`). */
export function matrizCss(t: Matriz3): string {
  const f = (x: number) => (Math.abs(x) < 1e-12 ? 0 : Number(x.toPrecision(8)));
  return `matrix3d(${[t[0], t[3], 0, t[6], t[1], t[4], 0, t[7], 0, 0, 1, 0, t[2], t[5], 0, t[8]].map(f).join(",")})`;
}

/** La flecha hacia alguien: dónde va (en pixeles de la pantalla) y hacia dónde apunta (radianes; 0, a la derecha). */
export interface Flecha {
  x: number;
  y: number;
  angulo: number;
}

/**
 * La flecha hacia algo que no está a la vista. `punto`: dónde cae en la
 * pantalla, o `null` si queda detrás de ti; `derecha`: si queda a tu derecha
 * (para lo de detrás, que va al borde de ese lado). `null` si está a la vista,
 * a más de `margen` de los bordes.
 */
export function flechaHacia(punto: Punto | null, derecha: boolean, ancho: number, alto: number, margen: number): Flecha | null {
  const cx = ancho / 2;
  const cy = alto / 2;
  if (!punto) return { x: derecha ? ancho - margen : margen, y: cy, angulo: derecha ? 0 : Math.PI };
  if (punto.x >= margen && punto.x <= ancho - margen && punto.y >= margen && punto.y <= alto - margen) return null;
  const dx = punto.x - cx;
  const dy = punto.y - cy;
  const k = Math.min(dx === 0 ? Infinity : (cx - margen) / Math.abs(dx), dy === 0 ? Infinity : (cy - margen) / Math.abs(dy));
  return { x: cx + dx * k, y: cy + dy * k, angulo: Math.atan2(dy, dx) };
}

/**
 * Separa las flechas que se montan: cada una que choca con una ya puesta
 * (a menos de `paso` en los dos ejes) se corre por su borde, hacia abajo en los
 * costados y hacia la derecha arriba y abajo. Devuelve una lista nueva, en el mismo orden.
 */
export function apilar(flechas: readonly Flecha[], ancho: number, margen: number, paso: Punto): Flecha[] {
  const puestas: Flecha[] = [];
  for (const f of flechas) {
    const g = { ...f };
    const costado = g.x <= margen + 0.5 || g.x >= ancho - margen - 0.5;
    for (let i = 0; i < flechas.length && puestas.some((p) => Math.abs(p.x - g.x) < paso.x && Math.abs(p.y - g.y) < paso.y); i++) {
      if (costado) g.y += paso.y;
      else g.x += paso.x;
    }
    puestas.push(g);
  }
  return puestas;
}

/** Un punto en el suelo de la escena 3D. */
export interface PuntoSuelo {
  x: number;
  z: number;
}

/**
 * De qué lado de `centro` queda `p`, visto desde una cámara girada `giro`
 * (0: mirando hacia −z, con +x a la derecha; positivo: girando a la izquierda).
 * `null` si queda a menos de `margen` del medio (uno detrás del otro, o solo).
 */
export function ladoVisto(p: PuntoSuelo, centro: PuntoSuelo, giro: number, margen = 1): "izq" | "der" | null {
  // Hacia tu derecha, en el suelo.
  const k = (p.x - centro.x) * Math.cos(giro) - (p.z - centro.z) * Math.sin(giro);
  if (Math.abs(k) < margen) return null;
  return k < 0 ? "izq" : "der";
}
