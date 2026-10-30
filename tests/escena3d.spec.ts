import { describe, expect, it } from "vitest";
import MUEBLES from "../src/ui/assets/muebles.json" with { type: "json" };
import { ALTO_3D, animDesde, choquesDe, doblar, enDibujo, escenaDePiso, manchaDe, piesFuera, piesSentado, puertasDe, puestosDe, sePuede, sillaTuya, tapado, VENTANA, volumen, type Cara, type Ventana3d } from "../src/escena3d.js";
import { MURO, armarPiso, armarPisoTv, type PisoPlano } from "../src/plano.js";

const PIEZAS: Record<string, { x: number; y: number; w: number; h: number }> = MUEBLES.piezas;

/** Las filas del dibujo 2D que cubre una cara vista desde arriba en diagonal (fila = z − altura). */
function filas(c: Cara): [number, number] {
  return c.plano === "pie" ? [c.z - (c.y + c.alto), c.z - c.y] : [c.z - c.y, c.z + c.alto - c.y];
}

/** Las filas que cubren unas caras, juntas y ordenadas (sin huecos ni encimadas si salen una tras otra). */
function unidas(caras: readonly Cara[]): Array<[number, number]> {
  return caras.map(filas).sort((a, b) => a[0] - b[0]);
}

const piso = armarPiso(
  [
    { prefijo: "BET", agentes: 7 },
    { prefijo: "JST", agentes: 4 },
    { prefijo: "ZZZ", agentes: 2 },
  ],
  640,
  "computador",
);

describe("doblar un mueble", () => {
  it("el escritorio queda con su frente de pie, la tapa acostada y el monitor de pie detrás, y visto en diagonal es el dibujo", () => {
    const caras = doblar("escritorio", 10, 20);
    expect(caras.map((c) => c.plano)).toEqual(["pie", "suelo", "pie"]);
    const [frente, tapa, monitor] = caras;
    expect(frente).toMatchObject({ x: 10, z: 40, y: 0, alto: 6, w: 28 });
    expect(tapa).toMatchObject({ y: 6, z: 35, alto: 5 });
    expect(monitor).toMatchObject({ z: 35, y: 6, alto: 9 });
    expect(unidas(caras)).toEqual([
      [20, 29],
      [29, 34],
      [34, 40],
    ]);
  });

  it("sin pliegues va entero de pie, y con su alto como pliegue, entero en el suelo", () => {
    expect(doblar("arcade", 0, 0)).toEqual([expect.objectContaining({ plano: "pie", y: 0, z: 28, alto: 28 })]);
    expect(doblar("alfombra-sala", 5, 50)).toEqual([expect.objectContaining({ plano: "suelo", y: 0, z: 50, alto: 30 })]);
  });

  it("la textura de cada punto es su lugar en el dibujo", () => {
    const [frente] = doblar("escritorio", 10, 20);
    expect(frente!.textura).toEqual({ tipo: "atlas", ax: PIEZAS.escritorio!.x, ay: PIEZAS.escritorio!.y, px: 10, py: 20, gris: false });
    // La esquina de arriba a la izquierda del frente es la fila 14 del escritorio.
    expect(enDibujo(frente!.x, frente!.y + frente!.alto, frente!.z)).toEqual({ x: 10, y: 34 });
  });
});

describe("el piso entero", () => {
  const escena = escenaDePiso(piso);

  it("cada mueble de cada sala, visto en diagonal, cubre justo su dibujo: ni una fila más ni una menos", () => {
    for (const sala of piso.salas) {
      for (const m of sala.muebles) {
        const nombre = m.nombre === "ventana" ? "ventana-dia" : m.nombre;
        const p = PIEZAS[nombre]!;
        const x = sala.x + m.x;
        const y = sala.y + m.y;
        // La ventana lleva su propio dibujo (el visor le pinta el cielo), del tamaño de la de día.
        const suyas = escena.caras.filter((c) =>
          m.nombre === "ventana"
            ? c.textura.tipo === "ventana" && c.textura.px === x && c.textura.py === y
            : c.textura.tipo === "atlas" && c.textura.ax === p.x && c.textura.ay === p.y && c.textura.px === x && c.textura.py === y,
        );
        const figura = escena.figuras.find((f) => f.ax === p.x && f.ay === p.y && f.x === x + p.w / 2 && f.z === y + p.h);
        if (figura) continue;
        expect(suyas.length, `${sala.prefijo} ${m.nombre}`).toBeGreaterThan(0);
        const rangos = unidas(suyas);
        expect(rangos[0]![0], `${sala.prefijo} ${m.nombre}`).toBe(y);
        expect(rangos.at(-1)![1]).toBe(y + p.h);
        for (let i = 1; i < rangos.length; i++) expect(rangos[i]![0]).toBe(rangos[i - 1]![1]);
        for (const c of suyas) expect([c.x, c.w]).toEqual([x, p.w]);
      }
    }
  });

  it("lo que cuelga va pegado al muro y el muro va de pie donde empieza el suelo", () => {
    const sala = piso.salas[0]!;
    const reloj = sala.muebles.find((m) => m.nombre === "reloj")!;
    const cara = escena.caras.find((c) => c.textura.tipo === "atlas" && c.textura.px === sala.x + reloj.x && c.textura.py === sala.y + reloj.y)!;
    expect(cara).toMatchObject({ plano: "pie", z: sala.y + MURO, capa: 1 });
    expect(escena.muros).toContainEqual({ x0: sala.x, z0: sala.y + MURO, x1: sala.x + sala.w, z1: sala.y + MURO, desde: 0, alto: ALTO_3D });
  });

  it("hay un escritorio con su pantalla por puesto, más el tuyo", () => {
    const sala = piso.salas.find((s) => s.prefijo === "BET")!;
    const claves = escena.pantallas.filter((p) => p.clave.startsWith("BET:")).map((p) => p.clave);
    expect(claves).toEqual([...sala.puestos.map((_, i) => `BET:${i}`), ...(sala.escritorio ? ["BET:tu"] : [])]);
    // La pantalla va en el plano del monitor, un poco por delante.
    const p = sala.puestos[0]!;
    const pant = escena.pantallas.find((x) => x.clave === "BET:0")!.cara;
    expect(pant).toMatchObject({ plano: "pie", z: sala.y + p.y + 23, capa: 1, x: sala.x + p.x + 2 });
    expect(filas(pant)).toEqual([sala.y + p.y + 9, sala.y + p.y + 14]);
  });

  it("una empresa sin color lleva su silla, su cuadro, su alfombra y su muro en gris", () => {
    const zzz = piso.salas.find((s) => s.prefijo === "ZZZ")!;
    const deZzz = escena.caras.filter((c) => c.textura.tipo !== "linea" && c.x >= zzz.x && c.x < zzz.x + zzz.w && c.z >= zzz.y && c.z <= zzz.y + zzz.h + 30);
    const grises = deZzz.filter((c) => (c.textura.tipo === "atlas" || c.textura.tipo === "baldosa") && c.textura.gris);
    expect(grises.some((c) => c.textura.tipo === "baldosa" && c.textura.nombre === "alfombra-jst")).toBe(true);
    expect(grises.some((c) => c.textura.tipo === "baldosa" && c.textura.nombre === "pared-jst")).toBe(true);
    expect(grises.some((c) => c.textura.tipo === "atlas" && c.textura.ax === PIEZAS["silla-jst"]!.x)).toBe(true);
  });

  it("cada ventana cuelga una sola vez, con el piso de su sala para la luz que entra", () => {
    expect(VENTANA.noche).toMatchObject({ w: VENTANA.dia.w, h: VENTANA.dia.h });
    for (const sala of piso.salas) {
      const suyas = sala.muebles.filter((m) => m.nombre === "ventana");
      const caras = escena.caras.filter((c) => c.textura.tipo === "ventana" && c.x >= sala.x && c.x < sala.x + sala.w && c.z === sala.y + MURO);
      expect(caras.length, sala.prefijo).toBe(suyas.length);
      for (const c of caras) {
        expect(c).toMatchObject({ plano: "pie", w: VENTANA.dia.w, alto: VENTANA.dia.h, capa: 1 });
        expect(escena.ventanas).toContainEqual({ x: c.x, y: c.y, z: c.z, w: c.w, alto: c.alto, suelo: { x0: sala.x, z0: sala.y + MURO, x1: sala.x + sala.w, z1: sala.y + sala.h } });
      }
    }
    expect(escena.ventanas.length).toBe(escena.caras.filter((c) => c.textura.tipo === "ventana").length);
  });
});

describe("el cuerpo de lo que va de pie", () => {
  const escena = escenaDePiso(piso);
  const sala = piso.salas[0]!;
  const p = sala.puestos[0]!;

  it("el frente del escritorio se mete hasta el fondo de su tapa, y el monitor apenas, para no tapar a quien se sienta", () => {
    const x = sala.x + p.x;
    const z = sala.y + p.y + 28;
    const deEscritorio = escena.cuerpos.filter((c) => c.cara.x === x && c.cara.w === 28);
    expect(deEscritorio.find((c) => c.cara.z === z)).toMatchObject({ fondo: 5, tapada: true });
    const monitor = deEscritorio.find((c) => c.cara.z === z - 5)!;
    expect(monitor).toMatchObject({ fondo: 0.5, tapada: false });
    // Quien se sienta tiene los pies en la fila 22 del puesto (y va 0,3 por delante): el monitor no le llega.
    expect(monitor.cara.z - monitor.fondo).toBeGreaterThan(piesSentado(sala, p).y + 0.3);
  });

  it("tu silla va en su grupo (el visor la oculta mientras estás sentado en ella), y las de los agentes no", () => {
    const tu = sala.escritorio!;
    const silla = PIEZAS[`silla-bet`]!;
    const deTuSilla = escena.caras.filter((c) => c.textura.tipo === "atlas" && c.textura.ax === silla.x && c.textura.px === sala.x + tu.x + 11);
    expect(deTuSilla.length).toBeGreaterThan(0);
    expect(deTuSilla.every((c) => c.grupo === sillaTuya("BET"))).toBe(true);
    expect(escena.cuerpos.filter((c) => c.cara.grupo === sillaTuya("BET")).length).toBeGreaterThan(0);
    expect(escena.caras.filter((c) => c.grupo).every((c) => c.grupo!.startsWith("silla:"))).toBe(true);
    const deAgente = escena.caras.filter((c) => c.textura.tipo === "atlas" && c.textura.ax === silla.x && c.textura.px === sala.x + p.x + 11);
    expect(deAgente.every((c) => !c.grupo)).toBe(true);
  });

  it("nada se mete en el muro, y lo que no se dobla se mete lo que mide su base en el piso", () => {
    for (const c of escena.cuerpos) {
      const s = piso.salas.find((x) => c.cara.x >= x.x && c.cara.x < x.x + x.w && c.cara.z > x.y + MURO && c.cara.z <= x.y + x.h)!;
      expect(c.cara.z - c.fondo).toBeGreaterThan(s.y + MURO);
    }
    let vistos = 0;
    for (const s of piso.salas) {
      for (const m of s.muebles) {
        // La ventana cuelga del muro (y en el atlas va como `ventana-dia`).
        const pieza = PIEZAS[m.nombre];
        if (!pieza || MUEBLES.pliegues[m.nombre as keyof typeof MUEBLES.pliegues] || MUEBLES.giran.includes(m.nombre) || m.y + pieza.h <= MURO) continue;
        const c = escena.cuerpos.find((x) => x.cara.textura.tipo === "atlas" && x.cara.textura.ax === pieza.x && x.cara.textura.px === s.x + m.x && x.cara.textura.py === s.y + m.y)!;
        const z = s.y + m.y + pieza.h;
        expect(c.fondo, m.nombre).toBeCloseTo(Math.min(10, pieza.h, z - (s.y + MURO + 0.1)));
        vistos++;
      }
    }
    expect(vistos).toBeGreaterThan(0);
  });
});

describe("la luz que entra por una ventana", () => {
  // Una ventana de 24×16 en el muro del fondo (z = 30), de 5 a 21 de alto, y su sala de 0 a 200 por 30 a 130.
  const v: Ventana3d = { x: 60, y: 5, z: 30, w: 24, alto: 16, suelo: { x0: 0, z0: 30, x1: 200, z1: 130 } };
  const rayo = (alto: number, rumbo: number) => ({ x: Math.cos(alto) * Math.sin(rumbo), y: -Math.sin(alto), z: Math.cos(alto) * Math.cos(rumbo) });
  const cerca = (a: number, b: number) => Math.abs(a - b) < 1e-9;

  it("con el sol de frente, cae del ancho de la ventana; lo de arriba de la ventana, más lejos del muro", () => {
    const p = manchaDe(v, rayo(Math.PI / 4, 0));
    expect(p).toHaveLength(4);
    expect(Math.min(...p.map((q) => q.x))).toBeCloseTo(60);
    expect(Math.max(...p.map((q) => q.x))).toBeCloseTo(84);
    // A 45°, cada pixel de altura se corre uno hacia adentro: el borde de abajo (5) a 35 y el de arriba (21) a 51.
    expect(p.filter((q) => q.t === 0).every((q) => cerca(q.z, 51))).toBe(true);
    expect(p.filter((q) => q.t === 16).every((q) => cerca(q.z, 35))).toBe(true);
  });

  it("el sol de un costado la corre hacia el otro, y cada punto sigue siendo el de su lugar en la ventana", () => {
    const r = rayo(Math.PI / 4, Math.PI / 6);
    const p = manchaDe(v, r);
    expect(Math.min(...p.map((q) => q.x))).toBeGreaterThan(60);
    const kx = r.x / -r.y;
    const kz = r.z / -r.y;
    for (const q of p) {
      const y = v.y + v.alto - q.t;
      expect(q.x).toBeCloseTo(v.x + q.s + y * kx);
      expect(q.z).toBeCloseTo(v.z + y * kz);
    }
  });

  it("con el sol bajo se estira, pero no sale del piso de la sala", () => {
    for (const r of [rayo(0.1, 0), rayo(0.1, 1.2), rayo(0.1, -1.2)]) {
      const p = manchaDe(v, r);
      expect(p.length).toBeGreaterThanOrEqual(3);
      for (const q of p) {
        expect(q.x).toBeGreaterThanOrEqual(-1e-9);
        expect(q.x).toBeLessThanOrEqual(200 + 1e-9);
        expect(q.z).toBeGreaterThanOrEqual(30 - 1e-9);
        expect(q.z).toBeLessThanOrEqual(130 + 1e-9);
        expect(q.s).toBeGreaterThanOrEqual(-1e-9);
        expect(q.s).toBeLessThanOrEqual(24 + 1e-9);
      }
    }
    // De frente y bajo llega a la pared de enfrente.
    expect(Math.max(...manchaDe(v, rayo(0.1, 0)).map((q) => q.z))).toBeCloseTo(130);
  });

  it("si el rayo no baja o no entra en la sala, no hay luz", () => {
    expect(manchaDe(v, { x: 0, y: 0.5, z: 0.8 })).toEqual([]);
    expect(manchaDe(v, { x: 0, y: -0.7, z: -0.7 })).toEqual([]);
  });
});

describe("el volumen de un dibujo", () => {
  // Una mesita de 4×3 vista de frente: la tapa arriba y dos patas.
  const DIBUJO = ["XXXX", "X..X", "X..X"];
  const lleno = (x: number, t: number) => DIBUJO[t]?.[x] === "X";
  const cara: Cara = { plano: "pie", x: 0, y: 0, z: 3, w: 4, alto: 3, capa: 0, textura: { tipo: "linea" } };
  const resumen = (tipo: string, tapada: boolean) =>
    volumen({ cara, fondo: 2, tapada }, lleno)
      .filter((l) => l.tipo === tipo)
      .map((l) => (tipo === "lado" ? { x: l.esquinas[0].x, filas: [l.dibujo[2].y, l.dibujo[0].y] } : { y: l.esquinas[0].y, x: [l.esquinas[0].x, l.esquinas[1].x] }));

  it("los costados van por fuera de cada pata y por dentro, donde está el hueco", () => {
    expect(resumen("lado", false)).toEqual(
      expect.arrayContaining([
        { x: 0, filas: [0, 3] },
        { x: 1, filas: [1, 3] },
        { x: 3, filas: [1, 3] },
        { x: 4, filas: [0, 3] },
      ]),
    );
    expect(resumen("lado", false)).toHaveLength(4);
  });

  it("arriba la tapa y, entre las patas, la de abajo; con una tapa del mueble encima, sin la de arriba", () => {
    expect(resumen("arriba", false)).toEqual([{ y: 3, x: [0, 4] }]);
    expect(resumen("abajo", false)).toEqual([{ y: 2, x: [1, 3] }]);
    expect(resumen("arriba", true)).toEqual([]);
  });

  it("cada lámina se mete justo su fondo y toma el color del pixel de su borde", () => {
    const l = volumen({ cara, fondo: 2, tapada: false }, lleno);
    const espalda = l.find((x) => x.tipo === "espalda")!;
    expect(espalda.esquinas.map((e) => e.z)).toEqual([1, 1, 1, 1]);
    expect(espalda.dibujo).toEqual([
      { x: 0, y: 3 },
      { x: 4, y: 3 },
      { x: 4, y: 0 },
      { x: 0, y: 0 },
    ]);
    const izquierdo = l.find((x) => x.tipo === "lado" && x.esquinas[0].x === 0)!;
    expect(new Set(izquierdo.esquinas.map((e) => e.z))).toEqual(new Set([3, 1]));
    expect(izquierdo.dibujo.every((d) => d.x === 0.5)).toBe(true);
  });
});

describe("personajes", () => {
  const sala = piso.salas[0]!;

  it("sentado, sus pies van en la fila 22 de su cuadro, que en la 2D está en (x + 10, y) del puesto", () => {
    const p = sala.puestos[0]!;
    expect(piesSentado(sala, p)).toEqual({ x: sala.x + p.x + 18, y: sala.y + p.y + 22 });
  });

  it("fuera de su escritorio, con su cuadro en (pos.x − 8, pos.y − 24)", () => {
    expect(piesFuera(sala, { x: 100, y: 80 })).toEqual({ x: sala.x + 100, y: sala.y + 78 });
  });

  it("quien camina se ve de frente, de espaldas o de perfil según dónde estás", () => {
    // Desde abajo (donde mira la 2D), como siempre.
    expect(animDesde("caminar", { x: 0, y: 1 })).toBe("caminar");
    expect(animDesde("caminar-der", { x: 0, y: 1 })).toBe("caminar-der");
    expect(animDesde("caminar-arriba", { x: 0, y: 1 })).toBe("caminar-arriba");
    // Desde arriba, al revés: quien está en tu fila, de espaldas en la 2D, te mira.
    expect(animDesde("caminar-arriba", { x: 0, y: -1 })).toBe("caminar");
    expect(animDesde("caminar-der", { x: 0, y: -1 })).toBe("caminar-izq");
    // Desde su derecha, de frente si camina hacia ti.
    expect(animDesde("caminar-der", { x: 1, y: 0 })).toBe("caminar");
  });

  it("quien conversa solo tiene perfiles; lo demás no cambia", () => {
    expect(animDesde("charlar-der", { x: 0, y: -1 })).toBe("charlar-izq");
    expect(animDesde("escuchar-izq", { x: 0, y: 1 })).toBe("escuchar-izq");
    expect(animDesde("sofa", { x: 0, y: -1 })).toBe("sofa");
    expect(animDesde("teclear", { x: 1, y: 0 })).toBe("teclear");
  });
});

describe("moverse y ver", () => {
  const escena = escenaDePiso(piso);
  const ch = choquesDe(piso, escena);
  const sala = piso.salas[0]!;

  it("no se atraviesa un escritorio ni el muro, y el pasillo se pisa", () => {
    const p = sala.puestos[0]!;
    expect(sePuede(ch, sala.x + p.x + 14, sala.y + p.y + 20, 3)).toBe(false);
    expect(sePuede(ch, sala.x + 40, sala.y + MURO, 3)).toBe(false);
    expect(sePuede(ch, sala.x + 40, sala.y + MURO + 6, 3)).toBe(true);
    expect(sePuede(ch, sala.x + sala.w + 8, sala.y + 60, 3)).toBe(true);
    expect(sePuede(ch, -1, 10, 3)).toBe(false);
  });

  it("cada escritorio con su silla, con la clave de su pantalla y su huella en el piso", () => {
    const puestos = puestosDe(piso);
    expect(puestos.map((p) => p.clave)).toEqual(escena.pantallas.map((p) => p.clave));
    const p = sala.puestos[0]!;
    expect(puestos[0]!.caja).toEqual([sala.x + p.x, sala.y + p.y + 8, sala.x + p.x + 28, sala.y + p.y + 28]);
    // Quien se sienta ahí tiene los pies dentro.
    const pies = piesSentado(sala, p);
    const [x0, z0, x1, z1] = puestos[0]!.caja;
    expect(pies.x > x0 && pies.x < x1 && pies.y > z0 && pies.y < z1).toBe(true);
  });

  it("el muro tapa lo que está detrás", () => {
    const delante = { x: sala.x + 40, y: 14, z: sala.y + MURO + 30 };
    const detras = { x: sala.x + 40, y: 14, z: sala.y + 5 };
    expect(tapado(escena.muros, delante, detras)).toBe(true);
    expect(tapado(escena.muros, delante, { ...delante, z: delante.z + 40 })).toBe(false);
    // Por encima del muro, no.
    expect(tapado(escena.muros, { ...delante, y: ALTO_3D + 4 }, { ...detras, y: ALTO_3D + 4 })).toBe(false);
  });

  it("la pared del costado tapa lo de la sala de al lado", () => {
    const vecina = piso.salas.find((s) => s !== sala && s.y === sala.y)!;
    const z = sala.y + MURO + 40;
    // Lejos de la puerta del costado.
    const puerta = puertasDe(piso, sala).derecha[0];
    const zLibre = puerta && z > puerta[0] - 4 && z < puerta[1] + 4 ? puerta[1] + 10 : z;
    expect(tapado(escena.muros, { x: sala.x + sala.w - 20, y: 14, z: zLibre }, { x: vecina.x + 20, y: 14, z: zLibre })).toBe(true);
  });
});

describe("salas cerradas, con puertas al pasillo", () => {
  /** Pisos como los de distintas instancias: una sola empresa, dos, tres (la última sola en su fila), cuatro (como la de un jefe con 4 organizaciones), cinco y seis, y el del TV. */
  const pisos: Array<[string, PisoPlano]> = [
    ["una", armarPiso([{ prefijo: "JST", agentes: 5 }], 640, "computador")],
    ["dos", armarPiso([{ prefijo: "BET", agentes: 9 }, { prefijo: "ELM", agentes: 3 }], 640, "computador")],
    ["tres", piso],
    ["cuatro", armarPiso([{ prefijo: "BET", agentes: 9 }, { prefijo: "ELM", agentes: 4 }, { prefijo: "JST", agentes: 5 }, { prefijo: "MIG", agentes: 8 }], 640, "computador")],
    ["cinco", armarPiso(["AAA", "BBB", "CCC", "DDD", "EEE"].map((prefijo, i) => ({ prefijo, agentes: 2 + i })), 640, "computador")],
    ["seis", armarPiso(["AAA", "BBB", "CCC", "DDD", "EEE", "FFF"].map((prefijo, i) => ({ prefijo, agentes: 1 + 2 * i })), 640, "computador")],
    ["tv", armarPisoTv([{ prefijo: "BET", agentes: 9 }, { prefijo: "ELM", agentes: 4 }, { prefijo: "JST", agentes: 5 }, { prefijo: "MIG", agentes: 8 }])],
  ];

  it("cada sala tiene sus cuatro paredes hasta el techo, y el piso, sus muros y su techo", () => {
    for (const [nombre, p] of pisos) {
      const e = escenaDePiso(p);
      for (const sala of p.salas) {
        const puertas = puertasDe(p, sala);
        const largo = (filtro: (m: (typeof e.muros)[number]) => boolean) => e.muros.filter(filtro).reduce((a, m) => a + (m.x1 - m.x0) + (m.z1 - m.z0), 0);
        const hueco = (lista: ReadonlyArray<readonly [number, number]>) => lista.reduce((a, [p0, p1]) => a + (p1 - p0), 0);
        const enZ = (z: number) => (m: (typeof e.muros)[number]) => m.desde === 0 && m.z0 === z && m.z1 === z && m.x0 >= sala.x && m.x1 <= sala.x + sala.w;
        const enX = (x: number) => (m: (typeof e.muros)[number]) => m.desde === 0 && m.x0 === x && m.x1 === x && m.z0 >= sala.y + MURO && m.z1 <= sala.y + sala.h;
        const hondo = sala.h - MURO;
        expect(largo(enZ(sala.y + MURO)), `${nombre} ${sala.prefijo} fondo`).toBe(sala.w - hueco(puertas.fondo));
        expect(largo(enZ(sala.y + sala.h)), `${nombre} ${sala.prefijo} frente`).toBe(sala.w - hueco(puertas.frente));
        expect(largo(enX(sala.x)), `${nombre} ${sala.prefijo} izquierda`).toBe(hondo - hueco(puertas.izquierda));
        expect(largo(enX(sala.x + sala.w)), `${nombre} ${sala.prefijo} derecha`).toBe(hondo - hueco(puertas.derecha));
      }
      expect(e.muros.filter((m) => m.z0 === 0 && m.z1 === 0).reduce((a, m) => a + m.x1 - m.x0, 0), nombre).toBe(p.w);
      expect(e.caras.some((c) => c.plano === "suelo" && c.vuelta && c.y === ALTO_3D && c.w === p.w && c.alto === p.h), nombre).toBe(true);
      // Las paredes de los costados, de pie a lo hondo.
      expect(e.caras.some((c) => c.plano === "lado" && c.textura.tipo === "baldosa"), nombre).toBe(true);
    }
  });

  it("una sola empresa: su sala, cerrada; con más, de cada sala se llega caminando a todas las otras", () => {
    for (const [nombre, p] of pisos) {
      if (p.salas.length === 1) {
        expect(puertasDe(p, p.salas[0]!), nombre).toEqual({ fondo: [], frente: [], izquierda: [], derecha: [] });
        continue;
      }
      const ch = choquesDe(p, escenaDePiso(p));
      const paso = 2;
      const r = 3;
      const clave = (x: number, z: number) => `${x},${z}`;
      // Un lugar libre de la primera sala, y desde ahí, todo a lo que se llega.
      const primera = p.salas[0]!;
      let inicio: [number, number] | null = null;
      for (let z = primera.y + MURO + 4; z < primera.y + primera.h && !inicio; z += paso) {
        for (let x = primera.x + 4; x < primera.x + primera.w && !inicio; x += paso) if (sePuede(ch, x, z, r)) inicio = [x, z];
      }
      expect(inicio, nombre).not.toBeNull();
      const vistos = new Set([clave(...inicio!)]);
      const cola = [inicio!];
      while (cola.length) {
        const [x, z] = cola.pop()!;
        for (const [dx, dz] of [[paso, 0], [-paso, 0], [0, paso], [0, -paso]] as const) {
          const k = clave(x + dx, z + dz);
          if (vistos.has(k) || !sePuede(ch, x + dx, z + dz, r)) continue;
          vistos.add(k);
          cola.push([x + dx, z + dz]);
        }
      }
      for (const sala of p.salas) {
        let llega = false;
        for (const k of vistos) {
          const [x, z] = k.split(",").map(Number) as [number, number];
          if (x > sala.x && x < sala.x + sala.w && z > sala.y + MURO && z < sala.y + sala.h) llega = true;
          if (llega) break;
        }
        expect(llega, `${nombre}: se llega a ${sala.prefijo}`).toBe(true);
      }
    }
  });

  it("ninguna puerta cae sobre un mueble, un escritorio o lo que cuelga del muro", () => {
    for (const [nombre, p] of pisos) {
      const e = escenaDePiso(p);
      const ch = choquesDe(p, e);
      for (const sala of p.salas) {
        const puertas = puertasDe(p, sala);
        // Justo adentro de cada puerta, por el medio, se puede estar.
        for (const [p0, p1] of puertas.frente) expect(sePuede(ch, (p0 + p1) / 2, sala.y + sala.h - 5, 3), `${nombre} ${sala.prefijo} frente`).toBe(true);
        for (const [p0, p1] of puertas.fondo) expect(sePuede(ch, (p0 + p1) / 2, sala.y + MURO + 5, 3), `${nombre} ${sala.prefijo} fondo`).toBe(true);
        for (const [p0, p1] of puertas.izquierda) expect(sePuede(ch, sala.x + 5, (p0 + p1) / 2, 3), `${nombre} ${sala.prefijo} izquierda`).toBe(true);
        for (const [p0, p1] of puertas.derecha) expect(sePuede(ch, sala.x + sala.w - 5, (p0 + p1) / 2, 3), `${nombre} ${sala.prefijo} derecha`).toBe(true);
      }
    }
  });
});
