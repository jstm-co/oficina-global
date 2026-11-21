import { afterEach, describe, expect, it, vi } from "vitest";
import { contexto } from "../src/ui/contextoBarra.js";
import { lugarDeLectura, olvidarLugar, tocarEn, visibleEn } from "../src/ui/contextoLugar.js";
import { callarAlCerrar, callarSiEsDeOtra, callarSiLee, estadoDe, leeEsta, tareaDeEspera } from "../src/ui/contextoVentana.js";
import { resumenSonando } from "../src/ui/sonido.js";

// «Leer contexto» en la ventana de responder (JST-321, design-spec de JST-320 rev 2). Sin navegador: no hay voz, así que
// el lector deja las frases escritas (`sinVoz`) y las avanza con su reloj; lo que se prueba es de qué tarea es la lectura
// y cuándo se calla.
const TEXTO = "Primera frase de la tarea. Segunda frase de la tarea. Tercera frase de la tarea.";
// (la lectura de mentira va con `tocarEn`: el informe que se deja escrito es el del lugar que lo pidió)
const pausa = () => new Promise((ok) => setTimeout(ok, 5));

async function leyendo(tarea: string): Promise<void> {
  contexto.tocar(tarea, async () => TEXTO);
  await pausa();
  expect(contexto.estado).toBe("leyendo");
}

afterEach(() => {
  contexto.soltar();
  olvidarLugar();
});

describe("qué tarea lee la ventana", () => {
  it("el código de la tarea de la espera; si no lo tiene, su id; sin tarea (una aprobación suelta), ninguna", () => {
    expect(tareaDeEspera({ identifier: "BET-713", issueId: "uuid-1" })).toBe("BET-713");
    expect(tareaDeEspera({ identifier: null, issueId: "uuid-1" })).toBe("uuid-1");
    expect(tareaDeEspera({ identifier: null, issueId: null })).toBeNull();
    expect(tareaDeEspera(undefined)).toBeNull();
  });

  it("el estado del botón es el del lector solo en la tarea que lee; en las demás, «Leer contexto»", async () => {
    expect(estadoDe("BET-713")).toBe("listo");
    await leyendo("BET-713");
    expect(estadoDe("BET-713")).toBe("leyendo");
    expect(estadoDe("BET-714")).toBe("listo");
    expect(estadoDe(null)).toBe("listo");
    expect(leeEsta("BET-713")).toBe(true);
    expect(leeEsta("BET-714")).toBe(false);
    expect(leeEsta(null)).toBe(false);
  });
});

describe("cuándo se calla (§2)", () => {
  it("al pasar a una pestaña de otra tarea se calla; de la misma tarea, sigue", async () => {
    await leyendo("BET-713");
    callarSiEsDeOtra("BET-713");
    expect(contexto.estado).toBe("leyendo");
    callarSiEsDeOtra("MIG-5");
    expect(contexto.estado).toBe("listo");
    expect(contexto.activo()).toBe(false);
  });

  it("una pestaña sin tarea también calla lo que se lee", async () => {
    await leyendo("BET-713");
    callarSiEsDeOtra(null);
    expect(contexto.estado).toBe("listo");
  });

  it("sin nada leyendo, no hace nada (tampoco borra «Leído»)", async () => {
    await leyendo("BET-713");
    contexto.detener();
    callarSiEsDeOtra("MIG-5");
    expect(contexto.estado).toBe("listo");
  });

  // JST-414: lo escrito de la otra tarea tampoco queda a medias al volver a esa pestaña.
  it("lo que leyó la ventana y queda escrito de otra tarea se suelta; el de otro lugar (la franja) no", async () => {
    tocarEn(contexto, "ventana", "BET-713", "completo", async () => ({ frases: ["Una frase. "], informe: null }));
    await pausa();
    contexto.detener();
    expect(contexto.frases).toHaveLength(1);
    callarSiEsDeOtra("MIG-5");
    expect(contexto.frases).toEqual([]);

    tocarEn(contexto, "franja", "BET-713", "completo", async () => ({ frases: ["Una frase. "], informe: null }));
    await pausa();
    contexto.detener();
    callarSiEsDeOtra("MIG-5");
    expect(contexto.frases).toHaveLength(1);
    expect(visibleEn(contexto, "franja", "BET-713")).toBe(true);
  });

  it("al cerrar la ventana se calla y se cierra el informe que era suyo; el de otro lugar queda escrito", async () => {
    tocarEn(contexto, "ventana", "BET-713", "completo", async () => ({ frases: ["Una frase. "], informe: null }));
    await pausa();
    callarAlCerrar();
    expect(contexto.estado).toBe("listo");
    expect(contexto.frases).toEqual([]);
    expect(lugarDeLectura()).toBeNull();

    tocarEn(contexto, "modal", "BET-713", "completo", async () => ({ frases: ["Una frase. "], informe: null }));
    await pausa();
    callarAlCerrar();
    expect(contexto.estado).toBe("listo");
    expect(visibleEn(contexto, "modal", "BET-713")).toBe(true);
  });

  it("al enviar se calla lo que se lee de esa tarea, no lo de otra", async () => {
    await leyendo("BET-713");
    callarSiLee("MIG-5");
    expect(contexto.estado).toBe("leyendo");
    callarSiLee("BET-713");
    expect(contexto.estado).toBe("listo");
  });
});

describe("el informe escrito en la ventana (JST-414)", () => {
  it("se ve en la ventana mientras lee y después de terminar o detener, hasta que se cierra", async () => {
    tocarEn(contexto, "ventana", "BET-713", "completo", async () => ({ frases: ["Primera.", "Segunda."], informe: null }));
    await pausa();
    expect(visibleEn(contexto, "ventana", "BET-713")).toBe(true);
    contexto.detener();
    expect(visibleEn(contexto, "ventana", "BET-713")).toBe(true);
    // El botón de la barra, de la misma tarea, no lo repite.
    expect(visibleEn(contexto, "barra", "BET-713")).toBe(false);
  });
});

describe("una voz a la vez (§2.6)", () => {
  it("mientras lee el contexto la voz de la oficina no empieza frases (como con el Resumen); al terminar, vuelve", async () => {
    expect(resumenSonando()).toBe(false);
    await leyendo("BET-713");
    expect(resumenSonando()).toBe(true);
    contexto.detener();
    expect(resumenSonando()).toBe(false);
  });
});
