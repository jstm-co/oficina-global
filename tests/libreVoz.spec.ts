// JST-415: las frases armadas al momento (recordatorio, «mientras no estabas», hito, racha) suenan con la voz real elegida
// para el Resumen, pedida al worker con `voz-resumen`; si no hay voz elegida, worker o audio a tiempo, devuelve `null` y quien
// llama usa la voz del navegador (nunca queda mudo).
import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  voz: "catalina" as string | null,
  respuesta: { estados: ["lista"] } as { estados: string[] } | null,
  yaBajado: false,
  acciones: [] as Array<{ accion: string; companyId: string; cuerpo: Record<string, unknown> }>,
  archivo: new Blob(["mp3"]) as Blob | null,
}));

vi.mock("../src/ui/eleccion.js", () => ({ vozParaLeer: async () => estado.voz }));
vi.mock("../src/ui/audiosVoces.js", () => ({
  instalacion: async () => "inst-1",
  yaBajado: async () => estado.yaBajado,
  pedirArchivo: async () => estado.archivo,
}));
vi.mock("../src/fuentes.js", () => ({
  accionPlugin: async (_cx: unknown, _inst: string, accion: string, companyId: string, cuerpo: Record<string, unknown>) => {
    estado.acciones.push({ accion, companyId, cuerpo });
    if (!estado.respuesta) throw new Error("sin worker");
    return estado.respuesta;
  },
}));

import { audioDeFraseLibre } from "../src/ui/libreVoz.js";

let n = 0;
/** Un texto distinto cada vez: el módulo guarda los pedidos hechos 90 s. */
const frase = () => `Ana, de JSTM, lleva ${++n} horas esperando.`;

beforeEach(() => {
  estado.voz = "catalina";
  estado.respuesta = { estados: ["lista"] };
  estado.yaBajado = false;
  estado.acciones = [];
  estado.archivo = new Blob(["mp3"]);
});

describe("el audio de una frase libre con la voz del Resumen", () => {
  it("pide al worker `voz-resumen` con la voz elegida y baja el audio", async () => {
    const texto = frase();
    const blobs = await audioDeFraseLibre(texto, "c-jst", 2_000);
    expect(blobs).toHaveLength(1);
    expect(estado.acciones).toHaveLength(1);
    expect(estado.acciones[0]).toMatchObject({ accion: "voz-resumen", companyId: "c-jst", cuerpo: { voz: "catalina", frases: [texto] } });
  });

  it("sin voz elegida (la del navegador), sin empresa o sin nada que decir: `null`, sin pedir nada", async () => {
    estado.voz = null;
    expect(await audioDeFraseLibre(frase(), "c-jst", 500)).toBeNull();
    estado.voz = "catalina";
    expect(await audioDeFraseLibre(frase(), null, 500)).toBeNull();
    expect(await audioDeFraseLibre("   ", "c-jst", 500)).toBeNull();
    expect(estado.acciones).toHaveLength(0);
  });

  it("si el worker rechaza la frase o no responde, `null` y la voz del navegador toma su lugar", async () => {
    estado.respuesta = { estados: ["no"] };
    expect(await audioDeFraseLibre(frase(), "c-jst", 500)).toBeNull();
    estado.respuesta = null;
    expect(await audioDeFraseLibre(frase(), "c-jst", 500)).toBeNull();
  });

  it("si el audio ya estaba bajado en esta pestaña, no se pide de nuevo al worker", async () => {
    estado.yaBajado = true;
    expect(await audioDeFraseLibre(frase(), "c-jst", 1_000)).toHaveLength(1);
    expect(estado.acciones).toHaveLength(0);
  });

  it("si el audio no se puede bajar, `null`; la misma frase pedida dos veces seguidas sale de una sola lectura", async () => {
    estado.archivo = null;
    expect(await audioDeFraseLibre(frase(), "c-jst", 500)).toBeNull();
    estado.archivo = new Blob(["mp3"]);
    const texto = frase();
    const [a, b] = await Promise.all([audioDeFraseLibre(texto, "c-jst", 1_000), audioDeFraseLibre(texto, "c-jst", 1_000)]);
    expect(a).toEqual(b);
    expect(estado.acciones.filter((x) => (x.cuerpo.frases as string[])[0] === texto)).toHaveLength(1);
  });
});

describe("lo que espera su audio se cancela al callar los avisos", () => {
  it("la generación cambia con cada `cancelar` y lo anotado antes ya no es vigente", async () => {
    const { generacionDeAvisos } = await import("../src/ui/libreVoz.js");
    const g = generacionDeAvisos();
    const antes = g.actual();
    expect(g.vigente(antes)).toBe(true);
    g.cancelar();
    expect(g.vigente(antes)).toBe(false);
    expect(g.vigente(g.actual())).toBe(true);
  });
});
