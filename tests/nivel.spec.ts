import { describe, expect, it } from "vitest";
import { factorFrecuencia, intervaloRecordatorioMs, leerNivel, NIVELES, NIVEL_POR_OMISION, permiteExtras, permiteFrase } from "../src/nivel.js";
import { AJUSTES_POR_OMISION, leerAjustes, suena } from "../src/ui/ajustes.js";

describe("nivel de cuánto habla (JST-415)", () => {
  it("son tres y viene «normal»", () => {
    expect(NIVELES).toEqual(["tranquilo", "normal", "conversador"]);
    expect(NIVEL_POR_OMISION).toBe("normal");
    expect(AJUSTES_POR_OMISION.nivel).toBe("normal");
  });

  it("factor de frecuencia: tranquilo la mitad de seguido, conversador el doble", () => {
    expect(factorFrecuencia("tranquilo")).toBe(2);
    expect(factorFrecuencia("normal")).toBe(1);
    expect(factorFrecuencia("conversador")).toBe(0.5);
  });

  it("los extras solo en normal y conversador", () => {
    expect(permiteExtras("tranquilo")).toBe(false);
    expect(permiteExtras("normal")).toBe(true);
    expect(permiteExtras("conversador")).toBe(true);
  });

  it("en tranquilo solo suenan te necesito, error, terminé o revisar; bloqueado es un extra y no suena", () => {
    for (const f of ["toca", "error", "fin", "rev"] as const) expect(permiteFrase("tranquilo", f)).toBe(true);
    expect(permiteFrase("tranquilo", "bloq")).toBe(false);
    expect(permiteFrase("normal", "bloq")).toBe(true);
    expect(permiteFrase("tranquilo", "emp")).toBe(false);
    expect(permiteFrase("normal", "emp")).toBe(true);
  });

  it("recordatorio: tranquilo nunca, normal cada 60 min, conversador cada 20", () => {
    expect(intervaloRecordatorioMs("tranquilo")).toBeNull();
    expect(intervaloRecordatorioMs("normal")).toBe(60 * 60_000);
    expect(intervaloRecordatorioMs("conversador")).toBe(20 * 60_000);
  });

  it("lo guardado: lo raro vuelve a normal", () => {
    expect(leerNivel("conversador")).toBe("conversador");
    expect(leerNivel("mucho")).toBe("normal");
    expect(leerNivel(undefined)).toBe("normal");
  });

  it("ajustes: el nivel se lee, y uno guardado de antes (sin nivel ni frases nuevas) carga con lo de por omisión", () => {
    expect(leerAjustes(JSON.stringify({ nivel: "tranquilo" })).nivel).toBe("tranquilo");
    const viejo = leerAjustes(JSON.stringify({ voces: true, frases: { toca: true, error: false, fin: true, emp: true }, detalle: { toca: true, error: true, fin: true, emp: true } }));
    expect(viejo.nivel).toBe("normal");
    expect(viejo.frases).toEqual({ toca: true, error: false, fin: true, emp: true, bloq: true, recordar: true, volver: true, hitos: true });
    expect(viejo.detalle.bloq).toBe(true);
    // Apagar una de las nuevas se guarda.
    expect(leerAjustes(JSON.stringify({ frases: { bloq: false, recordar: "no" } })).frases).toMatchObject({ bloq: false, recordar: true });
  });

  it("suena: manda el nivel Y la casilla", () => {
    const aj = (nivel: "tranquilo" | "normal" | "conversador", frases: Partial<typeof AJUSTES_POR_OMISION.frases> = {}) => ({ nivel, frases: { ...AJUSTES_POR_OMISION.frases, ...frases } });
    expect(suena(aj("normal"), "rev")).toBe(true);
    expect(suena(aj("normal", { fin: false }), "rev")).toBe(false);
    expect(suena(aj("normal", { bloq: false }), "bloq")).toBe(false);
    expect(suena(aj("tranquilo", { emp: true }), "emp")).toBe(false);
    expect(suena(aj("normal", { emp: true }), "emp")).toBe(true);
    expect(suena(aj("tranquilo"), "recordar")).toBe(false);
    expect(suena(aj("normal"), "recordar")).toBe(true);
    expect(suena(aj("conversador", { volver: false }), "volver")).toBe(false);
    expect(suena(aj("tranquilo"), "bloq")).toBe(false);
    expect(suena(aj("normal"), "bloq")).toBe(true);
  });
});
