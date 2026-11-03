import { describe, expect, it } from "vitest";
import { asignarVoces, archivoDe, plan, type AgentePlan } from "../generador/plan.js";
import { enPalabras, paraDecir } from "../generador/pronunciar.js";
import { PRONUNCIAR_KOKORO_INSTANCIA } from "../src/instancia.js";
import { vocesDe } from "../src/eleccionVoces.js";
import { archivoVivo, audioDe, claveAudio, duracionAudio, extensionDe, leerIndice, VOCES, VOZ_RESUMEN, vozDeAgente, vozPorId, type IndiceVoces, type VozId } from "../src/voces.js";
import { wavPcm16 } from "../src/audio.js";

/** Las 9 de hasta la 0.12 (Edge, Kokoro y los clones). */
const DE_SIEMPRE = vocesDe(["edge", "kokoro", "clones"]);

const agente = (i: number, empresa = "JSTM"): AgentePlan => ({ id: `id-${String(i).padStart(3, "0")}`, nombre: `Agente ${i}`, empresa, creado: `2026-10-${String(1 + (i % 28)).padStart(2, "0")}T00:00:${String(i % 60).padStart(2, "0")}Z` });

describe("reparto de las voces", () => {
  it("con 26 agentes se usan las 9, y ninguna tiene más de 1 agente que otra", () => {
    const lista = Array.from({ length: 26 }, (_, i) => agente(i));
    const voces = asignarVoces({}, lista, DE_SIEMPRE);
    const cuenta = DE_SIEMPRE.map((v) => Object.values(voces).filter((x) => x === v.id).length);
    expect(cuenta.every((n) => n >= 2 && n <= 3)).toBe(true);
    expect(cuenta.reduce((a, b) => a + b)).toBe(26);
  });

  it("es fijo: los mismos agentes dan el mismo reparto, sin importar el orden en que llegan", () => {
    const lista = Array.from({ length: 12 }, (_, i) => agente(i));
    expect(asignarVoces({}, lista)).toEqual(asignarVoces({}, [...lista].reverse()));
  });

  it("un agente nuevo no le cambia la voz a nadie y recibe una de las menos usadas", () => {
    const lista = Array.from({ length: 10 }, (_, i) => agente(i));
    const antes = asignarVoces({}, lista);
    const despues = asignarVoces(antes, [...lista, agente(99)]);
    for (const a of lista) expect(despues[a.id]).toBe(antes[a.id]);
    const usadas = Object.values(antes);
    const menos = Math.min(...VOCES.map((v) => usadas.filter((x) => x === v.id).length));
    expect(usadas.filter((x) => x === despues[agente(99).id]).length).toBe(menos);
  });

  it("los que ya no están dejan su voz libre", () => {
    const voces = asignarVoces({ "se-fue": "lorenzo" }, [agente(1)]);
    expect(voces["se-fue"]).toBeUndefined();
  });

  it("0.13.0: solo con Supertonic, los nuevos reciben sus 10 voces repartidas y quien tenía otra se queda con ella", () => {
    const lista = Array.from({ length: 21 }, (_, i) => agente(i));
    const voces = asignarVoces({ [agente(0).id]: "lorenzo" }, lista, vocesDe(["supertonic"]));
    expect(voces[agente(0).id]).toBe("lorenzo");
    const otras = lista.slice(1).map((a) => voces[a.id]!);
    expect(otras.every((v) => v.startsWith("supertonic-"))).toBe(true);
    const cuenta = vocesDe(["supertonic"]).map((v) => otras.filter((x) => x === v.id).length);
    expect(cuenta.every((n) => n === 2)).toBe(true);
  });

  it("0.13.0: sin voces para elegir, los nuevos quedan sin voz (y nadie pierde la suya)", () => {
    expect(asignarVoces({ [agente(0).id]: "dora" }, [agente(0), agente(1)], [])).toEqual({ [agente(0).id]: "dora" });
  });
});

describe("frases que se generan", () => {
  it("4 frases con «Nombre y empresa» y con «Solo el nombre» por agente, 4 sueltas por voz y los resúmenes de 2 a todos con Catalina", () => {
    const lista = [
      { id: "a", nombre: "Líder Técnico", empresa: "Betalandia", creado: "1" },
      { id: "b", nombre: "Speckit", empresa: "Migo", creado: "2" },
      { id: "c", nombre: "QA Engineer", empresa: "JSTM", creado: "3" },
    ];
    const voces = asignarVoces({}, lista, DE_SIEMPRE);
    const p = plan(lista, voces, VOZ_RESUMEN, DE_SIEMPRE);
    const de = (id: string) => p.filter((t) => t.voz.id === voces[id] && !/agentes/.test(t.texto)).map((t) => t.texto);
    expect(de("a")).toEqual(expect.arrayContaining([
      "Líder técnico, de Betalandia: te necesito.",
      "Líder técnico: te necesito.",
      "Líder técnico, de Betalandia: tengo un error.",
      "Líder técnico: terminé.",
      "Líder técnico, de Betalandia: empecé.",
      "Te necesito.",
    ]));
    expect(p.filter((t) => t.texto === "Te necesito.").length).toBe(9);
    const resumenes = p.filter((t) => /agentes/.test(t.texto));
    expect(resumenes.every((t) => t.voz.id === VOZ_RESUMEN)).toBe(true);
    expect(resumenes.map((t) => t.texto)).toEqual(expect.arrayContaining(["2 agentes te necesitan.", "3 agentes terminaron.", "3 agentes empezaron."]));
    expect(resumenes.length).toBe(4 * 2);
    // 0.5.0 (JST-167): «tengo un error» con cada uno de los 6 motivos (por agente con las 2 presentaciones con nombre, y
    // suelta en cada voz) y la muestra de «▶ Probar» de cada voz.
    expect(de("a")).toEqual(expect.arrayContaining([
      "Líder técnico, de Betalandia: tengo un error: límite de uso.",
      "Líder técnico: tengo un error: la Mac se durmió.",
      "Tengo un error: no alcanzó a empezar.",
      "Instalar la Oficina global en la real.",
    ]));
    expect(p.filter((t) => t.texto === "Instalar la Oficina global en la real.").length).toBe(9);
    // 0.8.0 (JST-241): y la pregunta de «▶ Probar» con «Te necesito», una por voz.
    expect(p.filter((t) => t.texto === "¿Instalo la versión nueva ahora?").length).toBe(9);
    expect(p.length).toBe(3 * 8 + 9 * 4 + 8 + 3 * 6 * 2 + 9 * 6 + 9 + 9);
    // Sin repetidos.
    expect(new Set(p.map((t) => claveAudio(t.voz.id, t.texto))).size).toBe(p.length);
  });

  it("el archivo cambia con la voz o el texto, y no con nada más", () => {
    expect(archivoDe("dora", "Te necesito.")).toBe(archivoDe("dora", "Te necesito."));
    expect(archivoDe("dora", "Te necesito.")).not.toBe(archivoDe("alex", "Te necesito."));
    expect(archivoDe("dora", "Te necesito.")).toMatch(/^[0-9a-f]{20}\.mp3$/);
  });
});

describe("pronunciación", () => {
  it("0.6.0: las conversaciones sin las barras de «// algún día» y con «build» como se dice", () => {
    expect(paraDecir("// algún día", "kokoro")).toBe("algún día");
    expect(paraDecir("¿Quién rompió el build?", "qwen3")).toBe("¿Quién rompió el bild?");
  });

  it("QA, CEO y CI se escriben como se dicen en todas; JSTM y CMO en todas menos Edge; Plugins solo en Kokoro", () => {
    expect(paraDecir("QA, de JSTM: terminé.", "edge")).toBe("cu a, de JSTM: terminé.");
    expect(paraDecir("QA, de JSTM: terminé.", "kokoro")).toBe("cu a, de jota ese te eme: terminé.");
    expect(paraDecir("CEO, de El Mirador: tengo un error.", "qwen3")).toBe("si i ou, de El Mirador: tengo un error.");
    expect(paraDecir("CMO: te necesito.", "chatterbox")).toBe("ce eme o: te necesito.");
    expect(paraDecir("CMO: te necesito.", "edge")).toBe("CMO: te necesito.");
    expect(paraDecir("Integración y CI, de Betalandia: terminé.", "edge")).toBe("Integración y ce i, de Betalandia: terminé.");
    expect(paraDecir("Plugins, de JSTM: empecé.", "kokoro")).toBe("Plaguins, de jota ese te eme: empecé.");
    expect(paraDecir("Plugins, de JSTM: empecé.", "chatterbox")).toBe("Plugins, de jota ese te eme: empecé.");
  });

  it("los nombres de la instancia (src/instancia.ts) se escriben como se dicen solo en Kokoro (vale con la lista llena o vacía)", () => {
    for (const [re, por] of PRONUNCIAR_KOKORO_INSTANCIA) {
      // Cada regla es una palabra suelta («\bNombre\b»): sin los «\b» queda el nombre tal cual se escribe.
      const nombre = re.source.replace(/\\b/g, "");
      const frase = `Líder técnico, de ${nombre}: te necesito.`;
      expect(paraDecir(frase, "kokoro")).toBe(`Líder técnico, de ${por}: te necesito.`);
      for (const motor of ["edge", "chatterbox", "qwen3"] as const) expect(paraDecir(frase, motor), motor).toBe(frase);
    }
  });

  it("en los clones los números van en palabras", () => {
    expect(paraDecir("12 agentes terminaron.", "chatterbox")).toBe("doce agentes terminaron.");
    expect(paraDecir("Sonda JST-100 A, de JSTM: empecé.", "qwen3")).toBe("Sonda JST- cien A, de jota ese te eme: empecé.");
    expect(paraDecir("12 agentes terminaron.", "edge")).toBe("12 agentes terminaron.");
    expect([2, 16, 21, 22, 30, 31, 45, 100, 101, 140, 500, 999, 1000, 2026, 21000].map(enPalabras)).toEqual([
      "dos",
      "dieciséis",
      "veintiuno",
      "veintidós",
      "treinta",
      "treinta y uno",
      "cuarenta y cinco",
      "cien",
      "ciento uno",
      "ciento cuarenta",
      "quinientos",
      "novecientos noventa y nueve",
      "mil",
      "dos mil veintiséis",
      "veintiún mil",
    ]);
  });
});

describe("la página busca el audio en el índice", () => {
  const indice: IndiceVoces = {
    version: 1,
    generado: "2026-10-21T23:00:00Z",
    resumen: "catalina",
    agentes: { a1: "dora" },
    audios: { [claveAudio("dora", "Líder técnico, de Betalandia: te necesito.")]: "x.mp3", [claveAudio("catalina", "3 agentes terminaron.")]: "y.mp3" },
  };

  it("el de cada agente con su voz, y el resumen con la de los resúmenes", () => {
    expect(vozDeAgente(indice, "a1")).toBe("dora");
    expect(audioDe(indice, "a1", "Líder técnico, de Betalandia: te necesito.")).toBe("x.mp3");
    expect(audioDe(indice, null, "3 agentes terminaron.")).toBe("y.mp3");
  });

  it("un agente nuevo (sin voz) o una frase sin audio dan null: esa vez habla la voz del navegador", () => {
    expect(vozDeAgente(indice, "nuevo")).toBeNull();
    expect(audioDe(indice, "nuevo", "Líder técnico, de Betalandia: te necesito.")).toBeNull();
    expect(audioDe(indice, "a1", "Líder técnico: te necesito.")).toBeNull();
    expect(audioDe(indice, null, "40 agentes terminaron.")).toBeNull();
  });

  it("un índice raro no se usa", () => {
    expect(leerIndice(indice)).toBe(indice);
    expect(leerIndice({ ...indice, version: 2 })).toBeNull();
    expect(leerIndice({ ...indice, resumen: "nadie" as VozId })).toBeNull();
    expect(leerIndice(null)).toBeNull();
  });

  it("las 19 voces tienen nombre y motor: las 9 de siempre y, desde la 0.13.0, las 10 de Supertonic", () => {
    expect(VOCES.length).toBe(19);
    expect(new Set(VOCES.map((v) => v.motor))).toEqual(new Set(["edge", "kokoro", "chatterbox", "qwen3", "supertonic"]));
    expect(vozPorId("qwen3-mujer")?.clave).toBe("ref_mujer_cl");
    const st = VOCES.filter((v) => v.motor === "supertonic");
    expect(st.map((v) => v.clave)).toEqual(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);
    expect(vozPorId("supertonic-f1")).toMatchObject({ nombre: "Supertonic F1", detalle: "mujer · Supertonic", clave: "0" });
    expect(vozPorId("supertonic-m5")).toMatchObject({ nombre: "Supertonic M5", detalle: "hombre · Supertonic", clave: "9" });
  });

  it("0.13.0: los audios de Supertonic son WAV (salen sin ffmpeg) y los demás siguen en MP3, con el mismo nombre de antes", () => {
    expect(extensionDe("supertonic-m2")).toBe("wav");
    expect(extensionDe("dora")).toBe("mp3");
    expect(extensionDe("mascota-gato")).toBe("mp3");
    expect(archivoDe("supertonic-f3", "Terminé.")).toMatch(/^[0-9a-f]{20}\.wav$/);
    expect(archivoVivo("supertonic-f3", "Terminé. Algo.")).toMatch(/^vivo\/supertonic-f3-[0-9a-z]+\.wav$/);
    // Los de siempre no cambian de nombre: lo ya grabado se sigue usando.
    expect(archivoDe("dora", "Terminé.")).toMatch(/^[0-9a-f]{20}\.mp3$/);
  });

  it("0.13.0: la duración de un audio, sea WAV o MP3", () => {
    expect(duracionAudio(wavPcm16(new Float32Array(22_050 * 2), 22_050))).toBe(2_000);
    expect(duracionAudio(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});
