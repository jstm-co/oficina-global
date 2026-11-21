import { describe, expect, it } from "vitest";
import { cadenaDetalle, ColaVoces, FRASES, porQueEspera, textoPendiente, textoVoz } from "../src/avisos.js";
import type { Espera } from "../src/estado.js";
import { setLocale } from "../src/i18n.js";
import { cuerpoVolver } from "../src/ui/avisoVolver.js";
import { textoPedido, validarPedido } from "../src/vozViva.js";

const A = { id: "a1", corto: "Diseño", empresa: "Betalandia" };

describe("«te lo dejo para revisar» y «terminé» con cuánto tardó", () => {
  it("revisar y terminar", () => {
    expect(textoVoz("Diseño", "Betalandia", "rev", "nombre-empresa")).toBe("Diseño, de Betalandia: te lo dejo para revisar.");
    expect(textoVoz("Diseño", "Betalandia", "rev", "nombre-empresa", { tarea: "Instalar la versión nueva" })).toBe("Diseño, de Betalandia: te lo dejo para revisar. Instalar la versión nueva.");
    expect(textoVoz("Diseño", "Betalandia", "fin", "nombre-empresa", { tarea: "Instalar la versión nueva" })).toBe("Diseño, de Betalandia: terminé. Instalar la versión nueva.");
  });

  it("con duración: «terminé en 12 minutos»", () => {
    expect(textoVoz("Diseño", "Betalandia", "fin", "nombre-empresa", { tarea: "Instalar la versión nueva", duracion: "12 minutos" })).toBe("Diseño, de Betalandia: terminé en 12 minutos. Instalar la versión nueva.");
    expect(textoVoz("Diseño", "Betalandia", "fin", "nombre", { duracion: "una hora y media" })).toBe("Diseño: terminé en una hora y media.");
    expect(textoVoz("Diseño", "Betalandia", "rev", "frase", { tarea: "Instalar la versión nueva", duracion: "3 horas" })).toBe("Te lo dejo para revisar. Instalar la versión nueva. Tardé 3 horas.");
  });

  it("la duración solo va con terminé y revisar", () => {
    expect(textoVoz("Diseño", "Betalandia", "emp", "nombre", { duracion: "3 horas" })).toBe("Diseño: empecé.");
    expect(textoVoz("Diseño", "Betalandia", "error", "nombre", { duracion: "3 horas" })).toBe("Diseño: tengo un error.");
  });

  it("el resumen de varios", () => {
    expect(FRASES.rev.resumen(3)).toBe("3 agentes te dejaron algo para revisar");
    expect(FRASES.fin.resumen(3)).toBe("3 agentes terminaron");
    expect(textoPendiente({ frase: "rev", agentes: [A, { ...A, id: "a2" }, { ...A, id: "a3" }], creado: 0 }, "nombre-empresa")).toBe("3 agentes te dejaron algo para revisar.");
  });

  it("si el audio con la duración no está, prueba el de la tarea y después la frase de siempre", () => {
    const p = { frase: "fin" as const, agentes: [A], creado: 0, detalle: { tarea: "Instalar la versión nueva", duracion: "12 minutos" } };
    const d = cadenaDetalle(p, "nombre-empresa")!;
    expect(d.cadena).toEqual(["Diseño, de Betalandia: terminé en 12 minutos. Instalar la versión nueva.", "Diseño, de Betalandia: terminé. Instalar la versión nueva."]);
    expect(d.subtitulo).toBeNull();
  });

  it("el worker acepta la duración solo con terminé y revisar, y arma el mismo texto", () => {
    const pedido = { agenteId: "a1", frase: "rev", corto: "Diseño", empresa: "Betalandia", presentacion: "nombre-empresa", tarea: "Instalar la versión nueva", duracion: "12 minutos" };
    const ok = validarPedido(pedido)!;
    expect(ok.duracion).toBe("12 minutos");
    expect(textoPedido(ok)).toBe(textoVoz("Diseño", "Betalandia", "rev", "nombre-empresa", { tarea: "Instalar la versión nueva", duracion: "12 minutos" }));
    expect(validarPedido({ ...pedido, frase: "toca" })).toBeNull();
    expect(validarPedido({ ...pedido, duracion: "12; rm -rf /" })).toBeNull();
    expect(validarPedido({ ...pedido, duracion: 12 })).toBeNull();
    // «Quedé bloqueado» también se puede preparar, sin duración.
    expect(validarPedido({ ...pedido, frase: "bloq", duracion: undefined })).not.toBeNull();
  });
});

describe("«quedé bloqueado»", () => {
  it("la frase, con y sin tarea", () => {
    expect(textoVoz("Diseño", "Betalandia", "bloq", "nombre-empresa")).toBe("Diseño, de Betalandia: quedé bloqueado.");
    expect(textoVoz("Diseño", "Betalandia", "bloq", "nombre-empresa", { tarea: "Instalar la versión nueva" })).toBe("Diseño, de Betalandia: quedé bloqueado en Instalar la versión nueva.");
    expect(textoVoz("Diseño", "Betalandia", "bloq", "frase", { tarea: "Instalar la versión nueva" })).toBe("Quedé bloqueado en Instalar la versión nueva.");
  });

  it("el resumen de varios", () => {
    expect(FRASES.bloq.resumen(3)).toBe("3 agentes quedaron bloqueados");
  });
});

describe("racha de errores en la frase", () => {
  it("«tercer error seguido: motivo.»", () => {
    expect(textoVoz("Diseño", "Betalandia", "error", "nombre-empresa", { motivo: "límite de uso", racha: 3 })).toBe("Diseño, de Betalandia: tercer error seguido: límite de uso.");
    expect(textoVoz("Diseño", "Betalandia", "error", "nombre", { racha: 4 })).toBe("Diseño: cuarto error seguido.");
    expect(textoVoz("Diseño", "Betalandia", "error", "nombre", { racha: 7, motivo: "se cortó" })).toBe("Diseño: otro error seguido: se cortó.");
    // Antes del tercero, la frase de siempre.
    expect(textoVoz("Diseño", "Betalandia", "error", "nombre", { racha: 2, motivo: "se cortó" })).toBe("Diseño: tengo un error: se cortó.");
  });

});

describe("frases libres en la cola", () => {
  it("se dicen tal cual, sin detalle", () => {
    const c = new ColaVoces();
    c.poner("fin", A, 0, null, "Siguen esperándote 3. El más antiguo, QA, hace 2 horas.");
    const p = c.sacar(1)!;
    expect(textoPendiente(p, "nombre-empresa")).toBe("Siguen esperándote 3. El más antiguo, QA, hace 2 horas.");
    expect(cadenaDetalle(p, "nombre-empresa")).toBeNull();
  });

  it("no se juntan con las demás frases y respetan el máximo de 3 en espera", () => {
    const c = new ColaVoces();
    c.poner("fin", A, 0);
    c.poner("fin", { ...A, id: "a2" }, 10);
    c.poner("fin", A, 20, null, "Betalandia: ya no queda nadie trabajando.");
    expect(c.largo).toBe(3);
    // Una cuarta, aunque sea libre, no entra.
    c.poner("fin", A, 30, null, "Desde las 3: 1 te espera.");
    expect(c.largo).toBe(3);
    // La libre no se mezcló en «2 agentes terminaron».
    expect(c.pendientes.filter((p) => p.libre)).toHaveLength(1);
    expect(c.pendientes.find((p) => !p.libre)!.agentes).toHaveLength(1);
  });

  it("en una ráfaga las que juntan siguen juntándose y las libres no cuentan como «terminaron»", () => {
    const c = new ColaVoces();
    c.poner("fin", A, 0);
    c.poner("fin", { ...A, id: "a2" }, 1);
    c.poner("fin", { ...A, id: "a3" }, 2);
    c.poner("fin", { ...A, id: "a4" }, 3);
    c.poner("fin", { ...A, id: "a5" }, 4);
    expect(c.pendientes.map((p) => p.agentes.length)).toEqual([5]);
  });
});

describe("lo que espera, para el recordatorio", () => {
  const espera = (extra: Partial<Espera>): Espera => ({ tipo: "tarjeta", itemId: "i1", sujetoId: "x1", clase: "request_confirmation", issueId: "t1", identifier: "BET-1", titulo: null, tituloTarea: null, href: null, desde: null, ...extra });

  it("una pregunta: «con la pregunta ¿…?»", () => {
    expect(porQueEspera([espera({ titulo: "¿Instalo la versión nueva ahora?" })])).toBe("con la pregunta ¿Instalo la versión nueva ahora?");
  });

  it("una aprobación o una revisión: «por ‹título›»", () => {
    expect(porQueEspera([espera({ tipo: "aprobacion", titulo: "Contratar un diseñador" })])).toBe("por Contratar un diseñador");
    expect(porQueEspera([espera({ tipo: "revision", titulo: "Instalar la versión nueva", tituloTarea: "Instalar la versión nueva" })])).toBe("por Instalar la versión nueva");
  });

  it("sin nada que decir, nada", () => {
    expect(porQueEspera([])).toBeNull();
    expect(porQueEspera([espera({ tipo: "revision", titulo: null, tituloTarea: null })])).toBeNull();
  });
});

describe("el aviso en pantalla de «mientras no estabas»", () => {
  it("en español sale como se dice, con la hora de inicio", () => {
    setLocale("es");
    const desde = new Date(2026, 5, 15, 15, 30).getTime();
    const ahora = new Date(2026, 5, 15, 18, 0).getTime();
    expect(cuerpoVolver({ terminaron: 5, bloqueados: 0, esperan: 2, errores: 1 }, desde, ahora)).toBe("Desde las 15:30: 5 terminaron, 2 te esperan y hubo 1 error.");
    expect(cuerpoVolver({ terminaron: 0, bloqueados: 0, esperan: 0, errores: 0 }, desde, ahora)).toBe("");
    // De 1:00 a 1:59 se dice «la» y no «las».
    const unaYCinco = new Date(2026, 9, 22, 1, 5).getTime();
    expect(cuerpoVolver({ terminaron: 2, bloqueados: 0, esperan: 0, errores: 0 }, unaYCinco, new Date(2026, 9, 22, 9, 0).getTime())).toBe("Desde la 1:05: 2 terminaron.");
    expect(cuerpoVolver({ terminaron: 2, bloqueados: 0, esperan: 0, errores: 0 }, new Date(2026, 9, 21, 1, 5).getTime(), new Date(2026, 9, 22, 9, 0).getTime())).toBe("Desde ayer a la 1:05: 2 terminaron.");
  });

  it("si fue otro día, dice hace cuánto", () => {
    setLocale("es");
    const ahora = new Date(2026, 5, 15, 18, 0).getTime();
    expect(cuerpoVolver({ terminaron: 1, bloqueados: 0, esperan: 0, errores: 0 }, ahora - 3 * 86_400_000, ahora)).toBe("Desde hace 3 días: 1 terminó.");
  });

  it("de ayer, «ayer a las 19:00» (JST-415), con su inglés; de antes de ayer, hace cuánto", () => {
    const ahora = new Date(2026, 5, 15, 9, 0).getTime();
    const ayer = new Date(2026, 5, 14, 19, 0).getTime();
    const datos = { terminaron: 12, bloqueados: 0, esperan: 3, errores: 2 };
    setLocale("es");
    expect(cuerpoVolver(datos, ayer, ahora)).toBe("Desde ayer a las 19:00: 12 terminaron, 3 te esperan y hubo 2 errores.");
    setLocale("en");
    expect(cuerpoVolver(datos, ayer, ahora)).toBe("Since yesterday at 19:00: 12 finished, 3 waiting for you and there were 2 errors.");
    setLocale("es");
    expect(cuerpoVolver(datos, new Date(2026, 5, 13, 19, 0).getTime(), ahora)).toMatch(/^Desde hace /);
  });
});
