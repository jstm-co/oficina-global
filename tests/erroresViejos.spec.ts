import { describe, expect, it } from "vitest";
import {
  UMBRAL_ERROR_VIEJO_MS,
  errorAntiguo,
  escribirSilenciados,
  esErrorViejo,
  estaSilenciado,
  fijarProveedorSilenciados,
  leerSilenciados,
  limpiarSilenciados,
  reactivar,
  silenciar,
} from "../src/erroresViejos.js";
import type { AgenteOficina } from "../src/estado.js";
import { contarVista, vistaDe, type AgenteVista } from "../src/vista.js";

const AHORA = Date.parse("2026-11-20T12:00:00Z");
const hace = (ms: number) => new Date(AHORA - ms).toISOString();
const H = 3_600_000;

function agente(id: string, extra: Partial<AgenteOficina> = {}): AgenteVista {
  return vistaDe(
    {
      id,
      companyId: "c1",
      prefijo: "BET",
      nombre: id,
      rol: null,
      rolApi: "engineer",
      adapterType: "claude_local",
      esHermes: false,
      statusApi: "idle",
      base: "error",
      run: null,
      runsExtra: 0,
      teNecesita: [],
      motivo: "Cuota agotada",
      desde: hace(H),
      ...extra,
    },
    "Betalandia",
  );
}

describe("error viejo (JST-410)", () => {
  it("es viejo si empezó hace más de 24 horas; justo 24 h o menos, no", () => {
    expect(errorAntiguo(agente("a", { desde: hace(UMBRAL_ERROR_VIEJO_MS + 1000) }), AHORA)).toBe(true);
    expect(errorAntiguo(agente("a", { desde: hace(UMBRAL_ERROR_VIEJO_MS) }), AHORA)).toBe(false);
    expect(errorAntiguo(agente("a", { desde: hace(2 * H) }), AHORA)).toBe(false);
  });

  it("sin fecha o con fecha ilegible no se sabe: no es viejo; y quien no tiene error, nunca", () => {
    expect(errorAntiguo(agente("a", { desde: null }), AHORA)).toBe(false);
    expect(errorAntiguo(agente("a", { desde: "no es fecha" }), AHORA)).toBe(false);
    expect(esErrorViejo(agente("a", { base: "libre", desde: hace(400 * H) }), AHORA, { a: hace(400 * H) })).toBe(false);
  });

  it("silenciar vale solo para ese error: si el agente entra en uno nuevo, vuelve a alarmar", () => {
    const a = agente("a", { desde: hace(2 * H) });
    const sil = silenciar({}, a);
    expect(sil).toEqual({ a: a.desde });
    expect(estaSilenciado(a, sil)).toBe(true);
    expect(esErrorViejo(a, AHORA, sil)).toBe(true);
    const nuevo = agente("a", { desde: hace(H) });
    expect(estaSilenciado(nuevo, sil)).toBe(false);
    expect(esErrorViejo(nuevo, AHORA, sil)).toBe(false);
  });

  it("silenciar no cambia nada si no hay error; reactivar quita la entrada", () => {
    const libre = agente("a", { base: "libre" });
    const vacio = {};
    expect(silenciar(vacio, libre)).toBe(vacio);
    const sil = silenciar({}, agente("a"));
    expect(reactivar(sil, "a")).toEqual({});
    expect(reactivar(sil, "otro")).toBe(sil);
    expect(sil).toHaveProperty("a");
  });

  it("limpiar quita lo que ya no aplica (arreglado o error nuevo) y deja a los que no aparecen", () => {
    const a = agente("a", { desde: hace(2 * H) });
    const sil = { a: a.desde!, b: hace(5 * H), c: hace(9 * H), d: hace(7 * H) };
    const limpio = limpiarSilenciados(sil, [a, agente("b", { base: "libre" }), agente("c", { desde: hace(H) })]);
    expect(limpio).toEqual({ a: a.desde, d: sil.d });
    expect(limpiarSilenciados(limpio, [a])).toBe(limpio);
  });

  it("leer es tolerante: JSON inválido o de otra forma da vacío; lo que no es texto se descarta", () => {
    for (const malo of [null, undefined, "", "{", "[]", "3", "null", '"texto"']) expect(leerSilenciados(malo)).toEqual({});
    expect(leerSilenciados('{"a":"2026-11-01T00:00:00Z","b":3,"c":null}')).toEqual({ a: "2026-11-01T00:00:00Z" });
    const sil = { a: "x", b: "" };
    expect(leerSilenciados(escribirSilenciados(sil))).toEqual(sil);
  });
});

describe("contadores con errores viejos (JST-410)", () => {
  const lista = [
    agente("rec", { desde: hace(2 * H) }),
    agente("vie", { desde: hace(12 * 24 * H) }),
    agente("sil", { desde: hace(3 * H) }),
    agente("tr", { base: "trabajando" }),
    agente("li", { base: "libre" }),
  ];

  it("los viejos y los silenciados dejan de contar en «con error» y se cuentan aparte", () => {
    const c = contarVista(lista, AHORA, { sil: lista[2]!.desde! });
    expect(c).toEqual({ trabaja: 1, toca: 0, error: 1, pausa: 0, libre: 1, erroresViejos: 2 });
  });

  it("sin silenciados, solo el de más de un día queda aparte", () => {
    expect(contarVista(lista, AHORA, {})).toMatchObject({ error: 2, erroresViejos: 1 });
  });

  it("«te necesitan» sigue contando a quien además tiene un error viejo", () => {
    const a = agente("n", { desde: hace(5 * 24 * H), teNecesita: [{ tipo: "tarjeta", itemId: "i", sujetoId: null, clase: null, issueId: null, identifier: "BET-1", titulo: null, tituloTarea: null, href: null, desde: null }] });
    expect(contarVista([a], AHORA, {})).toMatchObject({ toca: 1, error: 0, erroresViejos: 1 });
  });

  it("por omisión usa el proveedor registrado (el almacén del navegador) y la hora de ahora", () => {
    const viejoHoy = agente("z", { desde: new Date(Date.now() - 3 * 24 * H).toISOString() });
    expect(contarVista([viejoHoy])).toMatchObject({ error: 0, erroresViejos: 1 });
    const recienteHoy = agente("y", { desde: new Date(Date.now() - H).toISOString() });
    expect(contarVista([recienteHoy]).error).toBe(1);
    fijarProveedorSilenciados(() => ({ y: recienteHoy.desde! }));
    try {
      expect(contarVista([recienteHoy])).toMatchObject({ error: 0, erroresViejos: 1 });
    } finally {
      fijarProveedorSilenciados(null);
    }
  });
});
