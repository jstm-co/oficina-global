import { describe, expect, it } from "vitest";
import { apilar, aplicar, flechaHacia, homografia, ladoVisto, matrizCss } from "../src/perspectiva.js";
import { pantallaDe, pantallaTuya } from "../src/vista.js";

const cerca = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.y).toBeCloseTo(b.y, 6);
};

describe("el monitor en perspectiva (homografía)", () => {
  // Un monitor visto de lado: el borde izquierdo más cerca (más alto) que el derecho.
  const q = [
    { x: 100, y: 50 },
    { x: 260, y: 80 },
    { x: 255, y: 160 },
    { x: 98, y: 200 },
  ] as const;

  it("lleva cada esquina del rectángulo a la del cuadrilátero, y el centro adentro", () => {
    const t = homografia(160, 100, q)!;
    expect(t).not.toBeNull();
    cerca(aplicar(t, 0, 0), q[0]);
    cerca(aplicar(t, 160, 0), q[1]);
    cerca(aplicar(t, 160, 100), q[2]);
    cerca(aplicar(t, 0, 100), q[3]);
    const c = aplicar(t, 80, 50);
    expect(c.x).toBeGreaterThan(98);
    expect(c.x).toBeLessThan(260);
    expect(c.y).toBeGreaterThan(50);
    expect(c.y).toBeLessThan(200);
  });

  it("un rectángulo igual queda sin cambios (la identidad) y se escribe como `matrix3d`", () => {
    const t = homografia(160, 100, [{ x: 0, y: 0 }, { x: 160, y: 0 }, { x: 160, y: 100 }, { x: 0, y: 100 }])!;
    expect(matrizCss(t)).toBe("matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)");
  });

  it("un cuadrilátero aplastado (tres puntos en línea) o dado vuelta no sirve", () => {
    expect(homografia(160, 100, [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 0, y: 10 }])).toBeNull();
    // Cruzado: arriba y abajo intercambiados de un lado, como cuando una esquina cae detrás de la cámara.
    expect(homografia(160, 100, [{ x: 0, y: 0 }, { x: 160, y: 100 }, { x: 160, y: 0 }, { x: 0, y: 100 }])).toBeNull();
  });
});

describe("la flecha hacia quien te necesita", () => {
  const W = 1000;
  const H = 600;
  const M = 40;

  it("a la vista, no hay flecha", () => {
    expect(flechaHacia({ x: 500, y: 300 }, true, W, H, M)).toBeNull();
    expect(flechaHacia({ x: M, y: H - M }, false, W, H, M)).toBeNull();
  });

  it("fuera por un lado, va a ese borde, en la recta desde el centro, y apunta hacia allá", () => {
    const f = flechaHacia({ x: 1500, y: 300 }, true, W, H, M)!;
    expect(f).toEqual({ x: W - M, y: 300, angulo: 0 });
    const g = flechaHacia({ x: 500, y: -900 }, false, W, H, M)!;
    expect(g.x).toBeCloseTo(500);
    expect(g.y).toBeCloseTo(M);
    expect(g.angulo).toBeCloseTo(-Math.PI / 2);
    // En diagonal, toca primero el borde más cercano en su dirección.
    const d = flechaHacia({ x: 2500, y: 1300 }, true, W, H, M)!;
    expect(d.x).toBeCloseTo(W - M);
    expect(d.y).toBeGreaterThan(300);
    expect(d.y).toBeLessThanOrEqual(H - M);
  });

  it("detrás de ti, al costado de su lado, a media altura", () => {
    expect(flechaHacia(null, true, W, H, M)).toEqual({ x: W - M, y: H / 2, angulo: 0 });
    expect(flechaHacia(null, false, W, H, M)).toEqual({ x: M, y: H / 2, angulo: Math.PI });
  });

  it("las que se montan se corren por su borde; las que no, se quedan", () => {
    const paso = { x: 90, y: 30 };
    const lado = apilar([{ x: W - M, y: 300, angulo: 0 }, { x: W - M, y: 310, angulo: 0 }, { x: M, y: 300, angulo: Math.PI }], W, M, paso);
    expect(lado.map((f) => f.y)).toEqual([300, 340, 300]);
    const arriba = apilar([{ x: 500, y: M, angulo: 0 }, { x: 520, y: M, angulo: 0 }], W, M, paso);
    expect(arriba.map((f) => f.x)).toEqual([500, 610]);
  });
});

describe("lo que se lee en un monitor al acercarte", () => {
  const espera = { tipo: "tarjeta" as const, itemId: "x", sujetoId: null, clase: null, issueId: null, identifier: "JST-91", titulo: "¿Publico el plan?", tituloTarea: "Publicar el plan", href: null, desde: null };
  const run = { id: "r", issueId: "i", identifier: "JST-64", titulo: "Una tarea", enCola: false, desde: null, href: "", tareaHref: null, tareaStatus: null };

  it("lo que te espera va primero, aunque trabaje", () => {
    expect(pantallaDe({ st: "trabaja", need: true, teNecesita: [espera], run, motivo: null })).toEqual({ tono: "toca", codigo: "JST-91", estado: "te espera", texto: "¿Publico el plan?" });
  });

  it("trabajando, su tarea; en cola, lo dice; con error o en pausa, el motivo; libre, nada", () => {
    expect(pantallaDe({ st: "trabaja", need: false, teNecesita: [], run, motivo: null })).toEqual({ tono: "trabaja", codigo: "JST-64", estado: "trabajando", texto: "Una tarea" });
    expect(pantallaDe({ st: "trabaja", need: false, teNecesita: [], run: { ...run, enCola: true }, motivo: null })?.estado).toBe("en cola");
    expect(pantallaDe({ st: "error", need: false, teNecesita: [], run: null, motivo: "Se cayó el adaptador" })).toEqual({ tono: "error", codigo: null, estado: "con error", texto: "Se cayó el adaptador" });
    expect(pantallaDe({ st: "pausa", need: false, teNecesita: [], run: null, motivo: "budget" })?.texto).toBe("Se le acabó el presupuesto");
    expect(pantallaDe({ st: "libre", need: false, teNecesita: [], run: null, motivo: null })).toBeNull();
  });

  it("tu monitor: cuántos te esperan, o que estás al día", () => {
    expect(pantallaTuya(0)).toMatchObject({ tono: "libre", estado: "al día" });
    expect(pantallaTuya(1).estado).toBe("1 te espera");
    expect(pantallaTuya(3)).toMatchObject({ tono: "toca", estado: "3 te esperan" });
  });
});

describe("de qué lado queda alguien, visto desde la cámara", () => {
  const centro = { x: 100, z: 50 };

  it("mirando hacia −z, +x está a la derecha; mirando hacia +z, al revés", () => {
    expect(ladoVisto({ x: 108, z: 50 }, centro, 0)).toBe("der");
    expect(ladoVisto({ x: 92, z: 50 }, centro, 0)).toBe("izq");
    expect(ladoVisto({ x: 108, z: 50 }, centro, Math.PI)).toBe("izq");
  });

  it("mirando hacia +x (girado a la derecha), lo que está hacia +z queda a la derecha", () => {
    expect(ladoVisto({ x: 100, z: 58 }, centro, -Math.PI / 2)).toBe("der");
    expect(ladoVisto({ x: 100, z: 42 }, centro, -Math.PI / 2)).toBe("izq");
  });

  it("uno detrás del otro, o en el medio, no tiene lado", () => {
    expect(ladoVisto({ x: 100, z: 42 }, centro, 0)).toBeNull();
    expect(ladoVisto({ x: 100.5, z: 50 }, centro, 0)).toBeNull();
  });
});
