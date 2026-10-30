import { afterEach, describe, expect, it } from "vitest";
import { luzAhora, luzDe, mezclar, rayoDe, relojDe, solDe, TONOS } from "../src/luz.js";

// El reloj de cada uno: Node vuelve a leer la zona horaria cuando cambia `TZ`.
const zonaAntes = process.env.TZ;
const enZona = (tz: string) => {
  process.env.TZ = tz;
};
afterEach(() => {
  if (zonaAntes === undefined) delete process.env.TZ;
  else process.env.TZ = zonaAntes;
});

describe("el reloj de quien mira", () => {
  it("donde no se cambia la hora (Ecuador), no hay horario de verano", () => {
    enZona("America/Guayaquil");
    const r = relojDe(new Date("2026-10-29T19:30:00-05:00"));
    expect(r.verano).toBeNull();
    expect(r.horas).toBeCloseTo(19.5, 6);
  });

  it("en Chile, en octubre es horario de verano y en julio no; la hora es la de allá", () => {
    enZona("America/Santiago");
    const octubre = relojDe(new Date("2026-10-29T22:30:00Z"));
    expect(octubre.verano).toBe(true);
    expect(octubre.horas).toBeCloseTo(19.5, 6);
    expect(relojDe(new Date("2026-07-01T16:00:00Z")).verano).toBe(false);
  });

  it("en el norte el verano es en julio", () => {
    enZona("Europe/Madrid");
    expect(relojDe(new Date("2026-07-01T10:00:00Z")).verano).toBe(true);
    expect(relojDe(new Date("2026-01-15T10:00:00Z")).verano).toBe(false);
  });
});

describe("cuándo sale y se pone el sol", () => {
  it("12 h de día sin horario de verano, 14 en verano (una hora más tarde) y 10 en invierno", () => {
    expect(solDe({ horas: 0, verano: null })).toEqual({ sale: 6.5, pone: 18.5 });
    expect(solDe({ horas: 0, verano: true })).toEqual({ sale: 6.5, pone: 20.5 });
    expect(solDe({ horas: 0, verano: false })).toEqual({ sale: 7.5, pone: 17.5 });
  });
});

describe("la luz", () => {
  const parejo = solDe({ horas: 0, verano: null });

  it("de día, la oficina con sus colores; a medianoche, de noche", () => {
    const dia = luzDe(12, parejo);
    expect(dia.momento).toBe("dia");
    expect(dia.tinte).toBe("#ffffff");
    const noche = luzDe(0, parejo);
    expect(noche.momento).toBe("noche");
    expect(noche.tinte).toBe(TONOS.noche.tinte);
  });

  it("al salir el sol, el amanecer; al ponerse, el atardecer; y pasa poco a poco", () => {
    expect(luzDe(parejo.sale, parejo)).toMatchObject({ ...TONOS.amanecer, momento: "amanecer" });
    expect(luzDe(parejo.pone, parejo)).toMatchObject({ ...TONOS.atardecer, momento: "atardecer" });
    const casi = luzDe(parejo.sale - 0.5, parejo);
    expect(casi.tinte).toBe(mezclar(TONOS.noche.tinte, TONOS.amanecer.tinte, 0.5));
  });

  it("a las 19:30, en Ecuador ya es de noche y en Chile en verano todavía es de día", () => {
    enZona("America/Guayaquil");
    expect(luzAhora(new Date("2026-10-29T19:30:00-05:00")).momento).toBe("noche");
    enZona("America/Santiago");
    expect(luzAhora(new Date("2026-10-29T19:30:00-03:00")).momento).toBe("dia");
  });

  it("por la ventana: de día, el cielo celeste, sin estrellas y con sol; de noche, oscuro, con estrellas y sin sol", () => {
    const dia = luzDe(12, parejo);
    expect(dia).toMatchObject({ cielo: TONOS.dia.cielo, estrellas: 0, sol: { fuerza: 1 } });
    const noche = luzDe(0, parejo);
    expect(noche).toMatchObject({ cielo: TONOS.noche.cielo, estrellas: 1, sol: { fuerza: 0 } });
  });

  it("el cielo, las estrellas y la luz que entra cambian poco a poco", () => {
    const casi = luzDe(parejo.pone + 0.5, parejo);
    expect(casi.cielo.arriba).toBe(mezclar(TONOS.atardecer.cielo.arriba, TONOS.noche.cielo.arriba, 0.5));
    expect(casi.estrellas).toBeCloseTo((TONOS.atardecer.estrellas + TONOS.noche.estrellas) / 2);
    expect(casi.sol.fuerza).toBeCloseTo(TONOS.atardecer.sol.fuerza / 2);
  });

  it("las horas fuera de 0 a 24 dan la vuelta", () => {
    expect(luzDe(36, parejo)).toEqual(luzDe(12, parejo));
    expect(luzDe(-1, parejo)).toEqual(luzDe(23, parejo));
  });
});

describe("hacia dónde va el sol", () => {
  const parejo = solDe({ horas: 0, verano: null });
  const largo = (r: { x: number; y: number; z: number }) => Math.hypot(r.x, r.y, r.z);

  it("siempre baja y entra en la sala; a mediodía, de frente y más alto que nunca", () => {
    const mediodia = rayoDe((parejo.sale + parejo.pone) / 2, parejo);
    expect(mediodia.x).toBeCloseTo(0);
    for (let h = 0; h < 24; h += 0.5) {
      const r = rayoDe(h, parejo);
      expect(largo(r)).toBeCloseTo(1);
      expect(r.y).toBeLessThan(0);
      expect(r.z).toBeGreaterThan(0);
      expect(r.y).toBeGreaterThanOrEqual(mediodia.y - 1e-9);
    }
  });

  it("sale por la izquierda (la luz va a la derecha) y se pone por la derecha; antes y después, queda como al salir y al ponerse", () => {
    expect(rayoDe(parejo.sale + 2, parejo).x).toBeGreaterThan(0);
    expect(rayoDe(parejo.pone - 2, parejo).x).toBeLessThan(0);
    expect(rayoDe(parejo.sale - 3, parejo)).toEqual(rayoDe(parejo.sale, parejo));
    expect(rayoDe(parejo.pone + 3, parejo)).toEqual(rayoDe(parejo.pone, parejo));
  });

  it("la luz lo trae, para la hora que es", () => {
    expect(luzDe(9, parejo).rayo).toEqual(rayoDe(9, parejo));
  });
});

describe("mezclar colores", () => {
  it("de un color al otro, sin salirse", () => {
    expect(mezclar("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mezclar("#102030", "#405060", 0)).toBe("#102030");
    expect(mezclar("#102030", "#405060", 2)).toBe("#405060");
  });
});
