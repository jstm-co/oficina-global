import { describe, expect, it } from "vitest";
import { ALTO_PISO_TV, ANCHO_TV, ANCHO_WIDGET, anchoCelular, anchoComputador, anchoWidgetCelular, armarPiso, armarPisoComputador, armarPisoTv, armarSalaAcercada, claseEscala, escalasComputador, filasDeSalas, RESERVA_PAGINA, type EntradaSala, type PisoPlano } from "../src/plano.js";

// Las 4 empresas de hoy (BET 9, ELM 4, JST 5, MIG 8), en desorden: el plano las ordena.
const HOY: EntradaSala[] = [
  { prefijo: "MIG", agentes: 8 },
  { prefijo: "JST", agentes: 5 },
  { prefijo: "BET", agentes: 9 },
  { prefijo: "ELM", agentes: 4 },
];

// JST-77: la 5.ª empresa (Personal) con 3 agentes de ejemplo.
const CINCO: EntradaSala[] = [...HOY, { prefijo: "PER", agentes: 3 }];

const medidas = (piso: PisoPlano) => Object.fromEntries(piso.salas.map((s) => [s.prefijo, `${s.w}×${s.h}`]));

describe("ancho del piso (design-spec §2)", () => {
  it("computador: 1200 → 576; ≥ 1328 → 640; 768 a 1087 → 520", () => {
    expect(anchoComputador(1200)).toBe(576);
    expect(anchoComputador(1328)).toBe(640);
    expect(anchoComputador(1500)).toBe(640);
    expect(anchoComputador(768)).toBe(520);
    expect(anchoComputador(1087)).toBe(520);
  });
  it("celular 390 → 366; widget en celular 390 → 340", () => {
    expect(anchoCelular(390)).toBe(366);
    expect(anchoWidgetCelular(390)).toBe(340);
  });
});

describe("plano de la tabla del design-spec", () => {
  it("computador (576, 2x): BET 330×174 · ELM 214×174 · JST 234×130 · MIG 310×130, piso 1152 × 672 en pantalla", () => {
    const piso = armarPiso(HOY, 576, "computador");
    expect(piso.salas.map((s) => s.prefijo)).toEqual(["BET", "ELM", "JST", "MIG"]);
    expect(medidas(piso)).toEqual({ BET: "330×174", ELM: "214×174", JST: "234×130", MIG: "310×130" });
    expect([piso.w * piso.escala, piso.h * piso.escala]).toEqual([1152, 672]);
  });
  it("computador ancho (640) y contenedor angosto (520)", () => {
    expect(armarPiso(HOY, 640, "computador").salas.map((s) => s.w)).toEqual([370, 238, 262, 346]);
    expect(armarPiso(HOY, 520, "computador").salas.map((s) => s.w)).toEqual([296, 192, 210, 278]);
  });
  it("celular (366, 1x): BET 202 · ELM 132 · JST 159 · MIG 175, todas de 162, piso 366 × 356", () => {
    const piso = armarPiso(HOY, anchoCelular(390), "celular");
    expect(medidas(piso)).toEqual({ BET: "202×162", ELM: "132×162", JST: "159×162", MIG: "175×162" });
    expect([piso.w, piso.h, piso.escala]).toEqual([366, 356, 1]);
  });
  it("modo TV (624, 3x): BET 360×156 · ELM 232×156 · JST 255×118 · MIG 337×118, piso 1872 × 918", () => {
    const piso = armarPiso(HOY, ANCHO_TV, "tv");
    expect(medidas(piso)).toEqual({ BET: "360×156", ELM: "232×156", JST: "255×118", MIG: "337×118" });
    expect([piso.w * 3, piso.h * 3]).toEqual([1872, 918]);
  });
  it("widget: 560 × 336 en computador y 340 × 356 en celular", () => {
    const pc = armarPiso(HOY, ANCHO_WIDGET, "widget");
    const cel = armarPiso(HOY, anchoWidgetCelular(390), "widget-celular");
    expect([pc.w, pc.h]).toEqual([560, 336]);
    expect([cel.w, cel.h]).toEqual([340, 356]);
  });
  it("sala acercada (celular): 183 de ancho; BET y MIG 174 de alto, ELM y JST 132", () => {
    const alto = (prefijo: string, agentes: number) => armarSalaAcercada({ prefijo, agentes }, 366).h;
    expect(armarSalaAcercada({ prefijo: "BET", agentes: 9 }, 366).w).toBe(183);
    expect([alto("BET", 9), alto("MIG", 8), alto("ELM", 4), alto("JST", 5)]).toEqual([174, 174, 132, 132]);
  });
});

describe("puestos y sala de descanso", () => {
  it("el puesto i va en x = 8 + (i mod cols)·px + round((px − 34)/2), y = 36 + floor(i / cols)·py", () => {
    const bet = armarPiso(HOY, 576, "computador").salas[0]!;
    expect(bet.puestos[0]).toEqual({ x: 14, y: 36 });
    expect(bet.puestos[4]).toEqual({ x: 60, y: 80 });
    expect(bet.puestos[8]).toEqual({ x: 106, y: 124 });
  });

  it("«todos libres» cabe en todas las escalas: cada sala tiene al menos un asiento por agente", () => {
    const pisos = [
      armarPiso(HOY, 576, "computador"),
      armarPiso(HOY, 520, "computador"),
      armarPiso(HOY, 640, "computador"),
      armarPiso(HOY, anchoCelular(390), "celular"),
      armarPiso(HOY, ANCHO_WIDGET, "widget"),
      armarPiso(HOY, 480, "widget"),
      armarPiso(HOY, anchoWidgetCelular(390), "widget-celular"),
      armarPiso(HOY, ANCHO_TV, "tv"),
      ...HOY.map((s) => armarSalaAcercada(s, 366)),
    ];
    for (const piso of pisos) {
      for (const sala of piso.salas) {
        const agentes = HOY.find((s) => s.prefijo === sala.prefijo)!.agentes;
        expect(sala.asientos.length, `${piso.escena} ${sala.prefijo}`).toBeGreaterThanOrEqual(agentes);
      }
    }
  });

  it("los asientos de pie no se pisan entre sí y quedan dentro de la sala de descanso", () => {
    const sala = armarPiso(HOY, 576, "computador").salas[0]!;
    const dePie = sala.asientos.filter((a) => !a.sofa);
    for (const [i, a] of dePie.entries()) {
      expect(a.x).toBeGreaterThanOrEqual(sala.descanso.x);
      expect(a.x + 16).toBeLessThanOrEqual(sala.descanso.x + sala.descanso.w);
      for (const b of dePie.slice(i + 1)) expect(Math.abs(a.x - b.x) >= 16 || Math.abs(a.y - b.y) >= 14).toBe(true);
    }
  });

  it("una empresa nueva sin columnas en la tabla igual tiene sala", () => {
    const piso = armarPiso([...HOY, { prefijo: "NEW", agentes: 3 }], 576, "computador");
    expect(piso.salas.map((s) => s.prefijo)).toEqual(["BET", "ELM", "JST", "MIG", "NEW"]);
    expect(piso.salas[4]!.puestos).toHaveLength(3);
  });
});

describe("5 o más empresas (JST-77)", () => {
  const prefijos = (filas: EntradaSala[][]) => filas.map((f) => f.map((s) => s.prefijo).join(" "));
  const de = (n: number) => Array.from({ length: n }, (_, i) => ({ prefijo: `E${i}`, agentes: 2 }));

  it("filas de 2 (página, celular y widget): 4 → 2 + 2, 5 → 2 + 2 + 1, 3 → 2 + 1", () => {
    expect(prefijos(filasDeSalas(CINCO))).toEqual(["BET ELM", "JST MIG", "PER"]);
    expect(filasDeSalas(de(4)).map((f) => f.length)).toEqual([2, 2]);
    expect(filasDeSalas(de(3)).map((f) => f.length)).toEqual([2, 1]);
    expect(filasDeSalas([])).toEqual([]);
  });

  it("filas parejas de hasta 3 (TV a 2x): 4 → 2 + 2, 5 → 3 + 2, 6 → 3 + 3, 7 → 3 + 2 + 2", () => {
    expect(prefijos(filasDeSalas(CINCO, 3))).toEqual(["BET ELM JST", "MIG PER"]);
    expect([4, 6, 7].map((n) => filasDeSalas(de(n), 3).map((f) => f.length))).toEqual([[2, 2], [3, 3], [3, 2, 2]]);
  });

  it("página (576, 2x): PER va sola en una 3.ª fila, a lo ancho (560 × 130), y el piso mide 1152 × 964", () => {
    const piso = armarPiso(CINCO, 576, "computador");
    const per = piso.salas.find((s) => s.prefijo === "PER")!;
    expect([per.x, per.w, per.h]).toEqual([8, 560, 130]);
    expect(medidas(piso)).toMatchObject({ BET: "330×174", ELM: "214×174", JST: "234×130", MIG: "310×130" });
    expect([piso.w * 2, piso.h * 2]).toEqual([1152, 964]);
  });

  it("celular y widget: PER también va sola y a lo ancho", () => {
    expect(armarPiso(CINCO, 366, "celular").salas.find((s) => s.prefijo === "PER")!.w).toBe(350);
    expect(armarPiso(CINCO, ANCHO_WIDGET, "widget").salas.find((s) => s.prefijo === "PER")!.w).toBe(544);
  });

  it("TV con las 4 de hoy: 3x, 1872 × 918, dentro de los 921 que deja el banner reservado", () => {
    const piso = armarPisoTv(HOY);
    expect(piso.escala).toBe(3);
    expect(medidas(piso)).toEqual({ BET: "360×156", ELM: "232×156", JST: "255×118", MIG: "337×118" });
    expect([piso.w * 3, piso.h * 3]).toEqual([1872, 918]);
    expect(piso.h * 3).toBeLessThanOrEqual(ALTO_PISO_TV);
  });

  it("TV con 5: baja a 2x con filas BET · ELM · JST / MIG · PER, piso 1872 × 672", () => {
    const piso = armarPisoTv(CINCO);
    expect(piso.escala).toBe(2);
    expect(medidas(piso)).toEqual({ BET: "361×174", ELM: "232×174", JST: "295×174", MIG: "579×130", PER: "325×130" });
    expect(piso.salas.filter((s) => s.y === 8).map((s) => s.prefijo)).toEqual(["BET", "ELM", "JST"]);
    expect([piso.w * 2, piso.h * 2]).toEqual([1872, 672]);
  });

  it("TV: 6 empresas del tamaño de las de hoy todavía caben a 2x; si ni así cabe, 1x en filas de 4", () => {
    expect(armarPisoTv([...CINCO, { prefijo: "ZZZ", agentes: 9 }]).escala).toBe(2);
    const grande = armarPisoTv(de(12).map((e) => ({ ...e, agentes: 16 })));
    expect(grande.escala).toBe(1);
    expect(filasDeSalas(de(12), 4).map((f) => f.length)).toEqual([4, 4, 4]);
  });

  it("una empresa sin color propio usa el cuadro de JSTM (la UI lo pone en gris)", () => {
    const per = armarPiso(CINCO, 576, "computador").salas.find((s) => s.prefijo === "PER")!;
    expect(per.muebles.map((m) => m.nombre)).toContain("cuadro-jst");
    expect(per.sofaCalido).toBe(false);
  });

  it("«todos libres» cabe también con 5 empresas, en todas las escalas", () => {
    const pisos = [armarPiso(CINCO, 576, "computador"), armarPiso(CINCO, 366, "celular"), armarPiso(CINCO, ANCHO_WIDGET, "widget"), armarPisoTv(CINCO)];
    for (const piso of pisos) {
      for (const sala of piso.salas) {
        const agentes = CINCO.find((s) => s.prefijo === sala.prefijo)!.agentes;
        expect(sala.asientos.length, `${piso.escena} x${piso.escala} ${sala.prefijo}`).toBeGreaterThanOrEqual(agentes);
      }
    }
  });
});

describe("piso del computador: la escala más grande con la que cabe entero (JST-410)", () => {
  // Página del host (sin el menú lateral ni la barra de arriba), ancho × alto visible. La cabecera de la oficina
  // termina unos 150 más abajo de donde empieza la página.
  const pagina = (salas: readonly EntradaSala[], ancho: number, alto: number, dpr = 1, previas?: readonly EntradaSala[]) =>
    armarPisoComputador(salas, ancho, alto - 150, previas, dpr);
  const cabe = (piso: PisoPlano, ancho: number, alto: number) => piso.w * piso.escala <= ancho - 48 && piso.h * piso.escala + RESERVA_PAGINA <= alto - 150;
  // Las salas de cada fila, con sus columnas de escritorios: «BET 3 · ELM 2 / JST 3 · MIG 4».
  const forma = (piso: PisoPlano) => {
    const filas = new Map<number, string[]>();
    for (const s of piso.salas) filas.set(s.y, [...(filas.get(s.y) ?? []), `${s.prefijo} ${s.cols}`]);
    return [...filas.values()].map((f) => f.join(" · ")).join(" / ");
  };

  it("de un notebook a una pantalla grande, el piso cabe entero a lo ancho y a lo alto", () => {
    for (const salas of [HOY, CINCO]) {
      for (const [ancho, alto] of [[1200, 844], [1440, 900], [1920, 930], [1920, 1080], [2560, 1300], [2750, 1490], [3600, 2000], [5000, 2800]] as const) {
        expect(cabe(pagina(salas, ancho, alto), ancho, alto), `${salas.length} empresas en ${ancho} × ${alto}`).toBe(true);
      }
    }
  });

  it("la escala sube con la pantalla: 1,5x · 2x · 3x · 4x · 6x", () => {
    const escala = (salas: readonly EntradaSala[], ancho: number, alto: number) => pagina(salas, ancho, alto).escala;
    expect([[1200, 844], [1920, 1080], [2560, 1300], [2750, 1490], [5000, 2800]].map(([a, h]) => escala(HOY, a!, h!))).toEqual([1.5, 2, 3, 4, 6]);
    expect([[1440, 900], [1920, 1080], [2750, 1490], [3600, 2000], [5000, 2800]].map(([a, h]) => escala(CINCO, a!, h!))).toEqual([1.5, 2, 3, 4, 6]);
  });

  it("2750 × 1490 (la pantalla del usuario) con 5 empresas: 3x en dos filas, 2700 × 1008 en pantalla", () => {
    const piso = pagina(CINCO, 2750, 1490);
    expect([piso.escala, piso.w * 3, piso.h * 3]).toEqual([3, 2700, 1008]);
    expect(forma(piso)).toBe("BET 3 · ELM 2 · JST 2 / MIG 4 · PER 2");
  });

  it("las salas van siempre en orden de prefijo, de izquierda a derecha y de arriba abajo", () => {
    for (const [ancho, alto] of [[1000, 700], [1440, 900], [2750, 1490], [5000, 2800]] as const) {
      const piso = pagina(CINCO, ancho, alto);
      const leidas = [...piso.salas].sort((a, b) => a.y - b.y || a.x - b.x).map((s) => s.prefijo);
      expect(leidas, `${ancho} × ${alto}`).toEqual(["BET", "ELM", "JST", "MIG", "PER"]);
    }
  });

  it("si la pantalla es baja, las salas llevan más columnas y menos filas de escritorios", () => {
    expect(forma(pagina(HOY, 1200, 844))).toBe("BET 3 · ELM 2 / JST 3 · MIG 4");
    const baja = pagina(HOY, 1200, 700);
    expect(forma(baja)).toBe("BET 5 · ELM 2 / JST 3 · MIG 4");
    expect(cabe(baja, 1200, 700)).toBe(true);
  });

  it("las escalas medias solo se eligen donde caen en pixeles enteros; con densidad 1, 1,5x es el último recurso", () => {
    expect(escalasComputador(1)).toEqual([6, 5, 4, 3, 2]);
    expect(escalasComputador(2)).toEqual([6, 5, 4, 3.5, 3, 2.5, 2, 1.5]);
    expect(escalasComputador(1.25)).toEqual([6, 5, 4, 3, 2]);
    // 2560 × 1300 con las 5: a 3x cabe con densidad 1 y con 2; nunca se elige una media si la entera de arriba cabe.
    expect([pagina(CINCO, 2560, 1300, 1).escala, pagina(CINCO, 2560, 1300, 2).escala]).toEqual([3, 3]);
    // 1440 × 900 con las 5: a 2x no cabe; a 1,5x sí, también en una pantalla de densidad 1.
    expect([pagina(CINCO, 1440, 900, 1).escala, pagina(CINCO, 1440, 900, 2).escala]).toEqual([1.5, 1.5]);
  });

  it("si ni a 1,5x cabe a lo alto, queda a 1,5x con una forma baja y la página se baja para verlo", () => {
    const piso = pagina(CINCO, 1000, 700);
    expect(piso.escala).toBe(1.5);
    expect(piso.w * piso.escala).toBeLessThanOrEqual(1000 - 48);
    expect(cabe(piso, 1000, 700)).toBe(false);
    expect(piso.salas.map((s) => s.prefijo)).toEqual(["BET", "ELM", "JST", "MIG", "PER"]);
  });

  it("«todos libres» cabe en cualquier pantalla: cada sala tiene al menos un asiento por agente, y tu escritorio", () => {
    const muchas: EntradaSala[] = [...CINCO, { prefijo: "ZZZ", agentes: 14 }, { prefijo: "AAA", agentes: 1 }];
    for (const salas of [HOY, CINCO, muchas]) {
      for (const [ancho, alto] of [[1000, 700], [1200, 844], [1440, 900], [1920, 1080], [2750, 1490], [3440, 1300], [5000, 2800]] as const) {
        for (const sala of pagina(salas, ancho, alto, 2).salas) {
          expect(sala.asientos.length, `${sala.prefijo} en ${ancho} × ${alto}`).toBeGreaterThanOrEqual(sala.puestos.length);
          expect(sala.escritorio, `tu escritorio en ${sala.prefijo}, ${ancho} × ${alto}`).not.toBeNull();
        }
      }
    }
  });

  it("los libres se reparten por el descanso: donde hay espacio, nadie queda pegado ni le tapa la cabeza al de atrás", () => {
    const bet = pagina(CINCO, 2750, 1490).salas[0]!;
    const dePie = bet.asientos.filter((a) => !a.sofa);
    expect(dePie.length).toBeGreaterThanOrEqual(bet.puestos.length);
    for (const a of dePie) for (const b of dePie) if (a !== b) expect(Math.abs(a.x - b.x) >= 34 || Math.abs(a.y - b.y) >= 32, `${a.x},${a.y} y ${b.x},${b.y}`).toBe(true);
  });

  it("los tamaños de letra del piso van por tramos: 1,5x y 2x como 2x; de 2,5x para arriba, como 3x", () => {
    expect([1, 1.5, 2, 2.5, 3, 3.5, 4, 6].map(claseEscala)).toEqual([1, 2, 2, 3, 3, 3, 3, 3]);
  });
});

describe("escala del piso vacío, mientras se leen las empresas (JST-89)", () => {
  const pagina = (salas: readonly EntradaSala[], ancho: number, alto: number, previas?: readonly EntradaSala[]) =>
    armarPisoComputador(salas, ancho, alto - 150, previas);

  it("con las salas de la última vez sale a la escala y con el ancho que tendrá cuando lleguen", () => {
    for (const [ancho, alto, salas] of [[2560, 1080, HOY], [2750, 1490, HOY], [2976, 1498, CINCO], [2750, 1700, CINCO], [1920, 1080, HOY], [1440, 900, CINCO]] as const) {
      const vacio = pagina([], ancho, alto, salas);
      const lleno = pagina(salas, ancho, alto);
      expect([vacio.escala, vacio.w], `${ancho} × ${alto}, ${salas.length} empresas`).toEqual([lleno.escala, lleno.w]);
      expect([vacio.h, vacio.salas]).toEqual([16, []]);
    }
  });

  it("sin nada guardado queda a 2x, como la 0.1.3, aunque a más escala quepa", () => {
    expect(pagina([], 4000, 3000).escala).toBe(2);
    expect(pagina([], 4000, 3000, []).escala).toBe(2);
  });

  it("con salas, las de la última vez no cuentan", () => {
    expect(pagina(HOY, 2750, 1490, CINCO)).toEqual(pagina(HOY, 2750, 1490));
    expect(pagina(CINCO, 2750, 1490, HOY)).toEqual(pagina(CINCO, 2750, 1490));
  });

  it("el TV vacío también elige con las de la última vez; sin ellas, 3x como siempre", () => {
    const tv = (salas: readonly EntradaSala[], previas?: readonly EntradaSala[]) => {
      const p = armarPisoTv(salas, previas);
      return [p.escala, p.w];
    };
    expect(tv([], CINCO)).toEqual(tv(CINCO));
    expect(tv([], CINCO)).toEqual([2, 936]);
    expect(tv([], HOY)).toEqual([3, ANCHO_TV]);
    expect(tv([])).toEqual([3, ANCHO_TV]);
    expect(tv(HOY, CINCO)).toEqual([3, ANCHO_TV]);
  });
});
