// Decorados de las salas (JST-416): la lógica pura (`src/decorado.ts`), los ajustes que la guardan, el plano con
// el decorado puesto y las hojas de cada decorado (mismo tamaño que la clásica, un solo atlas).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DECORADOS,
  DECORADO_POR_OMISION,
  conEleccionDeEmpresa,
  decoradoRepartido,
  esDecorado,
  extrasDecorado,
  limpiarPorEmpresa,
  muebleDecorado,
  resolverDecorado,
  type DecoradoId,
} from "../src/decorado.js";
import { CON_COLOR, armarPiso, armarPisoComputador, armarPisoTv, armarSalaAcercada, type EntradaSala, type Pieza, type SalaPlano } from "../src/plano.js";
import { AJUSTES_POR_OMISION, leerAjustes } from "../src/ui/ajustes.js";
import MUEBLES from "../src/ui/assets/muebles.json" with { type: "json" };
import ANTES from "./muebles-72-piezas.json" with { type: "json" };

const ASSETS = join(import.meta.dirname, "../src/ui/assets");
const PIEZAS: Record<string, { x: number; y: number; w: number; h: number }> = MUEBLES.piezas;
/** `ventana` es el nombre del plano; en el atlas están `ventana-dia` y `ventana-noche`. */
const enAtlas = (nombre: string) => PIEZAS[nombre === "ventana" ? "ventana-dia" : nombre];
const NO_CLASICOS = DECORADOS.map((d) => d.id).filter((id) => id !== "clasico");

// Empresas inventadas de ejemplo: las 4 con color propio y una sin él.
const EMPRESAS: EntradaSala[] = [
  { prefijo: "MIG", agentes: 8 },
  { prefijo: "JST", agentes: 5 },
  { prefijo: "BET", agentes: 9 },
  { prefijo: "ELM", agentes: 4 },
  { prefijo: "PER", agentes: 3 },
];

describe("resolver el decorado de una sala", () => {
  it("por omisión es el clásico: nada cambia respecto de antes", () => {
    expect(DECORADO_POR_OMISION).toBe("clasico");
    expect(AJUSTES_POR_OMISION.decorado).toBe("clasico");
    expect(AJUSTES_POR_OMISION.decoradoPorEmpresa).toEqual({});
    for (const pre of [...CON_COLOR, "PER"]) expect(resolverDecorado(AJUSTES_POR_OMISION, pre)).toBe("clasico");
    expect(resolverDecorado({}, "BET")).toBe("clasico");
  });

  it("un decorado para toda la oficina", () => {
    for (const pre of [...CON_COLOR, "PER"]) expect(resolverDecorado({ decorado: "madera" }, pre)).toBe("madera");
  });

  it("«repartidos»: a cada empresa le toca uno fijo según su prefijo, y salen de los dos", () => {
    const a = { decorado: "repartidos" as const };
    const salio = CON_COLOR.map((pre) => resolverDecorado(a, pre));
    // Estable: lo mismo una y otra vez, y no depende de cuántas empresas haya ni en qué orden.
    expect(CON_COLOR.map((pre) => resolverDecorado(a, pre))).toEqual(salio);
    expect([...CON_COLOR].reverse().map((pre) => resolverDecorado(a, pre))).toEqual([...salio].reverse());
    expect(resolverDecorado(a, "BET")).toBe(decoradoRepartido("BET"));
    // Las 4 de hoy: variedad, dos y dos.
    expect(salio.filter((d) => d === "madera")).toHaveLength(2);
    expect(salio.filter((d) => d === "clasico")).toHaveLength(2);
    // Y una empresa nueva también recibe uno de los que existen.
    expect(esDecorado(decoradoRepartido("ZZZ"))).toBe(true);
  });

  it("la elección por empresa pisa a lo demás; un id que no existe se ignora", () => {
    const porEmpresa = { BET: "madera", ELM: "clasico" } as const;
    expect(resolverDecorado({ decorado: "clasico", decoradoPorEmpresa: porEmpresa }, "BET")).toBe("madera");
    expect(resolverDecorado({ decorado: "madera", decoradoPorEmpresa: porEmpresa }, "ELM")).toBe("clasico");
    expect(resolverDecorado({ decorado: "madera", decoradoPorEmpresa: porEmpresa }, "JST")).toBe("madera");
    expect(resolverDecorado({ decorado: "repartidos", decoradoPorEmpresa: porEmpresa }, "BET")).toBe("madera");
    expect(resolverDecorado({ decorado: "madera", decoradoPorEmpresa: { BET: "neon" as DecoradoId } }, "BET")).toBe("madera");
  });

  it("limpia lo guardado por empresa", () => {
    expect(limpiarPorEmpresa({ BET: "madera", ELM: "neon", JST: 3, MIG: "clasico" })).toEqual({ BET: "madera", MIG: "clasico" });
    expect(limpiarPorEmpresa(null)).toEqual({});
    expect(limpiarPorEmpresa(["madera"])).toEqual({});
    expect(limpiarPorEmpresa("madera")).toEqual({});
  });
});

describe("el decorado en los ajustes guardados", () => {
  it("lo que guardó una versión anterior carga con el decorado clásico", () => {
    const viejo = leerAjustes(JSON.stringify({ voces: true, mascotas: false, charlas: false }));
    expect(viejo.decorado).toBe("clasico");
    expect(viejo.decoradoPorEmpresa).toEqual({});
    expect(resolverDecorado(viejo, "BET")).toBe("clasico");
    expect(leerAjustes(null)).toEqual(AJUSTES_POR_OMISION);
  });

  it("lee el decorado y lo de cada empresa, y descarta lo raro", () => {
    expect(leerAjustes(JSON.stringify({ decorado: "madera" })).decorado).toBe("madera");
    expect(leerAjustes(JSON.stringify({ decorado: "repartidos" })).decorado).toBe("repartidos");
    expect(leerAjustes(JSON.stringify({ decorado: "neon" })).decorado).toBe("clasico");
    expect(leerAjustes(JSON.stringify({ decorado: 7 })).decorado).toBe("clasico");
    expect(leerAjustes(JSON.stringify({ decoradoPorEmpresa: { BET: "madera", ELM: "x" } })).decoradoPorEmpresa).toEqual({ BET: "madera" });
    expect(leerAjustes(JSON.stringify({ decoradoPorEmpresa: "madera" })).decoradoPorEmpresa).toEqual({});
  });
});

describe("el plano con el decorado puesto", () => {
  const pisos: Record<string, SalaPlano[]> = {
    computador: armarPisoComputador(EMPRESAS, 1440, 900).salas,
    grande: armarPisoComputador(EMPRESAS, 1920, 1080).salas,
    notebook: armarPisoComputador(EMPRESAS, 1200, 800).salas,
    plano: armarPiso(EMPRESAS, 576, "computador").salas,
    tv: armarPisoTv(EMPRESAS).salas,
    widget: armarPiso(EMPRESAS, 560, "widget").salas,
    celular: armarPiso(EMPRESAS, 366, "celular").salas,
    "widget-celular": armarPiso(EMPRESAS, 340, "widget-celular").salas,
    acercada: armarSalaAcercada(EMPRESAS[0]!, 366).salas,
  };

  for (const id of DECORADOS.map((d) => d.id)) {
    it(`${id}: ninguna pieza falta en el atlas y la sala no cambia de tamaño ni de asientos`, () => {
      for (const [escena, salas] of Object.entries(pisos)) {
        for (const sala of salas) {
          const piezas: Pieza[] = [...sala.muebles.map((m) => muebleDecorado(id, m)), ...extrasDecorado(id, sala)];
          for (const p of piezas) expect(enAtlas(p.nombre), `${escena} ${sala.prefijo}: ${p.nombre}`).toBeDefined();
          // Cada mueble del plano sigue ahí, con el mismo orden de dibujo, y a lo más se suma lo de la pared.
          expect(piezas.length - sala.muebles.length).toBeLessThanOrEqual(1);
          sala.muebles.forEach((m, i) => {
            const d = piezas[i]!;
            expect(d.z).toBe(m.z);
            const a = enAtlas(m.nombre)!;
            const b = enAtlas(d.nombre)!;
            // Lo que se dibuja cabe dentro de la huella de la original y apoya los pies en el mismo lugar.
            expect(b.w).toBeLessThanOrEqual(a.w);
            expect(d.y + b.h).toBe(m.y + a.h);
            expect(d.x).toBeGreaterThanOrEqual(m.x);
            expect(d.x + b.w).toBeLessThanOrEqual(m.x + a.w);
          });
        }
      }
    });
  }

  it("el clásico devuelve el plano tal cual, sin piezas de más", () => {
    for (const salas of Object.values(pisos)) {
      for (const sala of salas) {
        expect(sala.muebles.map((m) => muebleDecorado("clasico", m))).toEqual(sala.muebles);
        expect(extrasDecorado("clasico", sala)).toEqual([]);
      }
    }
  });

  it("madera: la lámpara de pie ocupa el lugar del dispensador y de la planta grande", () => {
    const sala = pisos.computador!.find((s) => s.muebles.some((m) => m.nombre === "planta-grande"))!;
    const planta = sala.muebles.find((m) => m.nombre === "planta-grande")!;
    const lampara = muebleDecorado("madera", planta);
    expect(lampara.nombre).toBe("lampara");
    expect(lampara.x).toBe(planta.x + 2); // 14 de ancho → 10 de ancho, centrada
    expect(lampara.y).toBe(planta.y);
    const otras = sala.muebles.filter((m) => m.nombre !== "planta-grande" && m.nombre !== "dispensador");
    for (const m of otras) expect(muebleDecorado("madera", m)).toBe(m);
  });

  it("madera: la chimenea va en el muro del descanso y no tapa nada", () => {
    let con = 0;
    let total = 0;
    for (const [escena, salas] of Object.entries(pisos)) {
      for (const sala of salas) {
        total++;
        const [c, ...mas] = extrasDecorado("madera", sala);
        expect(mas).toEqual([]);
        if (!c) continue;
        con++;
        const m = PIEZAS.chimenea!;
        expect(c).toMatchObject({ nombre: "chimenea", y: 0, z: 2 });
        // Dentro del descanso y sin pisar nada que cuelgue del muro o que le llegue (estante, cafetera, arcade…).
        expect(c.x, escena).toBeGreaterThanOrEqual(sala.descanso.x);
        expect(c.x + m.w, escena).toBeLessThanOrEqual(sala.descanso.x + sala.descanso.w);
        for (const o of sala.muebles) {
          const p = enAtlas(o.nombre)!;
          if (o.y >= m.h || o.nombre.startsWith("alfombra")) continue;
          expect(c.x + m.w <= o.x || c.x >= o.x + p.w, `${escena} ${sala.prefijo}: la chimenea pisa ${o.nombre}`).toBe(true);
        }
      }
    }
    // Las salas del computador, el TV y el widget la llevan todas; solo las angostas del celular se quedan sin ella.
    expect(con).toBeGreaterThan(total / 2);
    for (const e of ["computador", "grande", "notebook", "plano", "tv", "widget"]) for (const s of pisos[e]!) expect(extrasDecorado("madera", s)).toHaveLength(1);
  });
});

/** Ancho y alto de un PNG, de su cabecera (sin decodificarlo). */
function tamanoPng(ruta: string): { w: number; h: number } {
  const b = readFileSync(ruta);
  expect(b.subarray(1, 4).toString("latin1")).toBe("PNG");
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

describe("las hojas de cada decorado", () => {
  const clasica = tamanoPng(join(ASSETS, "muebles.png"));

  it("el atlas es uno solo (muebles.json) y la hoja clásica mide lo que dice", () => {
    expect(clasica).toEqual({ w: MUEBLES.ancho, h: MUEBLES.alto });
    expect(readdirSync(join(ASSETS, "decorados"), { recursive: true }).filter((f) => String(f).endsWith(".json"))).toEqual([]);
    for (const [nombre, p] of Object.entries(PIEZAS)) {
      expect(p.x + p.w, nombre).toBeLessThanOrEqual(MUEBLES.ancho);
      expect(p.y + p.h, nombre).toBeLessThanOrEqual(MUEBLES.alto);
    }
  });

  it("hay un decorado por carpeta, y viceversa", () => {
    expect(readdirSync(join(ASSETS, "decorados")).sort()).toEqual([...NO_CLASICOS].sort());
  });

  for (const id of NO_CLASICOS) {
    it(`${id}: su hoja mide lo mismo que la clásica`, () => {
      expect(tamanoPng(join(ASSETS, "decorados", id, "muebles.png"))).toEqual(clasica);
    });

    it(`${id}: tiene piso, descanso y muro de cada empresa (y de una sin color) en claro y oscuro, y el CSS los usa`, () => {
      const css = readFileSync(join(import.meta.dirname, "../src/ui/estilosDecorado.ts"), "utf8");
      const nombres = ["piso", "descanso", ...[...CON_COLOR, "none"].map((c) => `pared-${c.toLowerCase()}`)];
      for (const n of nombres) {
        for (const tema of ["claro", "oscuro"]) {
          const ruta = join(ASSETS, "decorados", id, "baldosas", `${id}-${n}-${tema}.png`);
          expect(existsSync(ruta), ruta).toBe(true);
        }
        expect(css, `${id}-${n}`).toContain(`--of-t-${id}-${n})`);
      }
      // Los tablones miden 64 × 16 (largos, con las juntas de punta alternadas); el muro, 16 × 22.
      expect(tamanoPng(join(ASSETS, "decorados", id, "baldosas", `${id}-piso-claro.png`))).toEqual({ w: 64, h: 16 });
      expect(tamanoPng(join(ASSETS, "decorados", id, "baldosas", `${id}-pared-jst-oscuro.png`))).toEqual({ w: 16, h: 22 });
    });

    it(`${id}: las piezas propias existen en el atlas`, () => {
      expect(PIEZAS.chimenea).toMatchObject({ w: 28, h: 22 });
      expect(PIEZAS.lampara).toMatchObject({ w: 10, h: 24 });
    });
  }
});

describe("el atlas no mueve lo que ya existía", () => {
  // `muebles-72-piezas.json`: posición y tamaño [x, y, w, h] de las 72 piezas de antes de JST-416 (la rama develop). Si una se mueve,
  // las hojas que ya están en la calle (cachés, otros decoradores) dibujarían otra cosa.
  const nombres = Object.keys(ANTES.piezas) as Array<keyof typeof ANTES.piezas>;

  it("son 72 y cada una sigue en su lugar y con su tamaño", () => {
    expect(nombres.length).toBe(72);
    for (const n of nombres) {
      const p = PIEZAS[n];
      expect(p, `${n} desapareció del atlas`).toBeDefined();
      expect([p!.x, p!.y, p!.w, p!.h], n).toEqual(ANTES.piezas[n]);
    }
    expect(MUEBLES.ancho).toBe(ANTES.ancho);
  });

  it("las piezas nuevas van todas después de las de antes", () => {
    expect(Object.keys(PIEZAS).slice(0, 72)).toEqual(nombres);
  });
});

describe("«Como la oficina» en «Por sala»", () => {
  it("borra la elección de esa empresa y no toca las demás ni el original", () => {
    const antes = { BET: "madera", ELM: "clasico" } as const;
    const r = conEleccionDeEmpresa(antes, "BET", "");
    expect(r).toEqual({ ELM: "clasico" });
    expect("BET" in r).toBe(false);
    expect(antes).toEqual({ BET: "madera", ELM: "clasico" });
    expect(resolverDecorado({ decorado: "clasico", decoradoPorEmpresa: r }, "BET")).toBe("clasico");
  });

  it("elegir un decorado la pone o la cambia; un valor que no existe también la borra", () => {
    expect(conEleccionDeEmpresa({}, "JST", "madera")).toEqual({ JST: "madera" });
    expect(conEleccionDeEmpresa({ JST: "madera" }, "JST", "clasico")).toEqual({ JST: "clasico" });
    expect(conEleccionDeEmpresa({ JST: "madera" }, "JST", "no-existe")).toEqual({});
  });
});
