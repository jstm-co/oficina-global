// La voz que dice de qué se trata, en el worker (0.5.0, JST-167; opción B del spike de JST-161).
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { nombreCorto, textoVoz } from "../src/avisos.js";
import { archivoVivo, hash53, motorDe, type IndiceVoces } from "../src/voces.js";
import { maximoAudioMs } from "../generador/motores.js";
import { paraDecir } from "../generador/pronunciar.js";
import { clonesSeguros, clonSigue, ESPERA_OFICINA_MAX_MS, ESPERA_PERMISO_IA_MAX_MS, filaDe, LETRAS_NOMBRE, limpiarVivo, nucleosDe, PAUSA_CLONES_MS, PreparadorVoces, textoPedido, TOPE_IA_POR_MIN, validarPedido, VIGILAR_MS, VIVO_DIAS_MS, type PedidoVoz, type TrabajoVoz } from "../src/vozViva.js";

const pedido = (extra: Partial<PedidoVoz> = {}): PedidoVoz => ({
  agenteId: "a-edge",
  frase: "fin",
  corto: "Diseño",
  empresa: "JSTM",
  presentacion: "nombre-empresa",
  tarea: "Diseño de «Oficina global» 0.5.0: «✓ listo», hora estimada, entrega en la mesa y tu escritorio con fila",
  ...extra,
});

/** Una carpeta de plugin de mentira, con su índice de voces. */
function plugin(): string {
  const raiz = mkdtempSync(join(tmpdir(), "oficina-vivo-test-"));
  mkdirSync(join(raiz, "dist", "ui", "voces"), { recursive: true });
  const indice: IndiceVoces = { version: 1, generado: "", resumen: "catalina", agentes: { "a-edge": "lorenzo", "a-kokoro": "alex", "a-clon": "qwen3-mujer", "a-clon2": "chatterbox-hombre" }, audios: {} };
  writeFileSync(join(raiz, "dist", "ui", "voces", "indice.json"), JSON.stringify(indice));
  return raiz;
}

const espera = () => new Promise((ok) => setTimeout(ok, 5));

describe("los pedidos de la página", () => {
  it("solo con la forma esperada y dentro de los topes; «tengo un error» no (su motivo se graba al instalar)", () => {
    expect(validarPedido(pedido())).toEqual(pedido());
    expect(validarPedido(pedido({ frase: "error" as never }))).toBeNull();
    expect(validarPedido(pedido({ presentacion: "otra" as never }))).toBeNull();
    expect(validarPedido(pedido({ corto: "x".repeat(LETRAS_NOMBRE + 1) }))).toBeNull();
    expect(validarPedido(pedido({ empresa: "x".repeat(LETRAS_NOMBRE + 1) }))).toBeNull();
    expect(validarPedido(pedido({ corto: "a\u0007b" }))).toBeNull();
    expect(validarPedido(pedido({ tarea: "a\\u0000b".replace("\\u0000", "\u0000") }))).toBeNull();
    expect(validarPedido(pedido({ tarea: "" }))).toBeNull();
    expect(validarPedido(null)).toBeNull();
    expect(validarPedido("hola")).toBeNull();
  });

  it("el texto que se genera es el mismo que arma la página, con el nombre de la tarea cortado", () => {
    expect(textoPedido(pedido())).toBe("Diseño, de JSTM: terminé. Diseño de Oficina global 0.5.0: listo, hora estimada.");
    expect(textoPedido(pedido({ frase: "emp", presentacion: "frase", tarea: "QA de «Oficina global» con las 4 empresas, en computador y en celular" }))).toBe("Empecé. QA de Oficina global con las 4 empresas, en computador y en celular.");
    // Un nombre de tarea larguísimo no pasa de 90 letras en la frase (0.8.0; antes, 60).
    const larga = textoPedido(pedido({ tarea: "palabra ".repeat(40) }))!;
    expect(larga.length).toBeLessThan("Diseño, de JSTM: terminé. ".length + 92);
    // Sin nada que decir de la tarea (solo un código), no se hace.
    expect(textoPedido(pedido({ tarea: "(JST-12)" }))).toBeNull();
  });

  it("el nombre del audio sale de la voz y el texto: el mismo en el worker y en la página", () => {
    const t = "Diseño, de JSTM: terminé. Diseño de Oficina global 0.5.0.";
    expect(archivoVivo("lorenzo", t)).toBe(archivoVivo("lorenzo", t));
    expect(archivoVivo("lorenzo", t)).toMatch(/^vivo\/lorenzo-[0-9a-z]+\.mp3$/);
    expect(archivoVivo("lorenzo", t)).not.toBe(archivoVivo("catalina", t));
    expect(archivoVivo("lorenzo", t)).not.toBe(archivoVivo("lorenzo", `${t} `));
    expect(hash53("abc")).toBe(hash53("abc"));
    expect(Number.isSafeInteger(hash53("abc"))).toBe(true);
  });

  it("una fila para Edge, otra para Kokoro y una sola para los clones", () => {
    expect(filaDe(motorDe("lorenzo"))).toBe("edge");
    expect(filaDe(motorDe("dora"))).toBe("kokoro");
    expect(filaDe(motorDe("qwen3-hombre"))).toBe("clon");
    expect(filaDe(motorDe("chatterbox-mujer"))).toBe("clon");
  });

  it("un agente con un nombre corto de más de 60 letras también dice de qué se trata, en las 3 presentaciones (JST-195)", async () => {
    const corto = nombreCorto("Sonda QA168 Voz Especialista en Documentación Técnica y Procesos Internos (piloto)");
    expect(corto.length).toBe(73);
    const raiz = plugin();
    const hechos: string[] = [];
    const v = new PreparadorVoces({ raiz, revisar: () => null, clonesOk: () => true, generar: async (t, d) => (hechos.push(t.texto), writeFileSync(d, "mp3")) });
    const pedidos = (["nombre-empresa", "nombre", "frase"] as const).map((presentacion) => pedido({ corto, presentacion }));
    for (const p of pedidos) {
      expect(validarPedido(p)).toEqual(p);
      // El mismo texto (y el mismo MP3) que busca la página al hablar.
      expect(textoPedido(p)).toBe(textoVoz(corto, "JSTM", "fin", p.presentacion, { tarea: p.tarea }));
    }
    expect(v.preparar(pedidos)).toEqual({ listas: 0, enFila: 3, saltadas: 0 });
    await espera();
    await espera();
    expect(hechos).toEqual([
      `${corto}, de JSTM: terminé. Diseño de Oficina global 0.5.0: listo, hora estimada.`,
      `${corto}: terminé. Diseño de Oficina global 0.5.0: listo, hora estimada.`,
      "Terminé. Diseño de Oficina global 0.5.0: listo, hora estimada.",
    ]);
    // Con «Solo la frase» el nombre no se dice: su largo no importa.
    const largo = "x".repeat(LETRAS_NOMBRE + 1);
    expect(validarPedido(pedido({ corto: largo, empresa: largo, presentacion: "frase" }))).not.toBeNull();
    expect(validarPedido(pedido({ corto: largo, presentacion: "nombre" }))).toBeNull();
    expect(validarPedido(pedido({ corto: "x".repeat(LETRAS_NOMBRE), presentacion: "nombre" }))).not.toBeNull();
  });

  it("un pedido que no se entiende queda en el registro (antes se descartaba sin aviso, JST-195)", () => {
    const log: Array<[string, Record<string, unknown> | undefined]> = [];
    const v = new PreparadorVoces({ raiz: plugin(), revisar: () => null, generar: async () => undefined, log: (m, d) => log.push([m, d]) });
    v.preparar([pedido({ corto: "x".repeat(LETRAS_NOMBRE + 1) }), { raro: 1 }, pedido({ agenteId: "nuevo" })]);
    expect(log).toEqual([["voces: pedidos que no se entienden (forma o topes)", { raros: 2 }]]);
    log.length = 0;
    v.preparar([pedido({ agenteId: "nuevo" })]);
    expect(log).toEqual([]);
  });
});

describe("el worker prepara las frases", () => {
  it("cada voz y texto una sola vez, aunque lo pidan varias pantallas; lo hecho queda en vivo/ y en vivo.json", async () => {
    const raiz = plugin();
    const hechos: string[] = [];
    const v = new PreparadorVoces({
      raiz,
      revisar: () => null,
      clonesOk: () => true,
      generar: async (t: TrabajoVoz, destino: string) => {
        hechos.push(t.texto);
        await espera();
        writeFileSync(destino, "mp3");
      },
    });
    expect(v.preparar([pedido(), pedido()])).toEqual({ listas: 0, enFila: 2, saltadas: 0 });
    expect(v.preparar([pedido()])).toEqual({ listas: 0, enFila: 1, saltadas: 0 });
    await espera();
    await espera();
    expect(hechos).toEqual(["Diseño, de JSTM: terminé. Diseño de Oficina global 0.5.0: listo, hora estimada."]);
    const archivo = archivoVivo("lorenzo", hechos[0]!);
    expect(readdirSync(join(raiz, "dist", "ui", "voces", "vivo"))).toEqual([archivo.split("/")[1]]);
    const vivo = JSON.parse(readFileSync(join(raiz, "dist", "ui", "voces", "vivo.json"), "utf8"));
    expect(vivo.audios[archivo]).toMatchObject({ voz: "lorenzo", texto: hechos[0] });
    // Ya está: no se vuelve a hacer.
    expect(v.preparar([pedido()])).toEqual({ listas: 1, enFila: 0, saltadas: 0 });
  });

  it("un agente sin voz (nuevo) o un pedido raro no se hacen; Edge no espera a los clones", async () => {
    const raiz = plugin();
    const orden: string[] = [];
    let soltarClon: () => void = () => undefined;
    const v = new PreparadorVoces({
      raiz,
      revisar: () => null,
      clonesOk: () => true,
      generar: async (t, destino) => {
        if (t.voz.motor === "qwen3") await new Promise<void>((ok) => (soltarClon = ok));
        orden.push(t.voz.id);
        writeFileSync(destino, "mp3");
      },
    });
    const r = v.preparar([pedido({ agenteId: "nuevo" }), { raro: 1 }, pedido({ agenteId: "a-clon" }), pedido({ agenteId: "a-edge", frase: "toca" })]);
    expect(r).toEqual({ listas: 0, enFila: 2, saltadas: 2 });
    await espera();
    expect(orden).toEqual(["lorenzo"]);
    soltarClon();
    await espera();
    expect(orden).toEqual(["lorenzo", "qwen3-mujer"]);
  });

  it("sin clones con poco swap o mucha carga; sin uv o ffmpeg, nada (y lo dice)", async () => {
    const raiz = plugin();
    const hechos: string[] = [];
    const v = new PreparadorVoces({ raiz, revisar: () => null, clonesOk: () => false, generar: async (t, d) => (hechos.push(t.voz.id), writeFileSync(d, "x")) });
    v.preparar([pedido({ agenteId: "a-clon" }), pedido({ agenteId: "a-clon2" }), pedido()]);
    await espera();
    await espera();
    expect(hechos).toEqual(["lorenzo"]);
    expect(v.saltados).toBe(2);
    const sin = new PreparadorVoces({ raiz, revisar: () => "ffmpeg no funciona: dyld: Library not loaded", generar: async () => undefined });
    expect(sin.estado()).toEqual({ disponible: false, motivo: "ffmpeg no funciona: dyld: Library not loaded" });
    expect(sin.preparar([pedido()])).toEqual({ listas: 0, enFila: 0, saltadas: 1 });
  });

  it("si una frase falla, sigue con la siguiente", async () => {
    const raiz = plugin();
    const v = new PreparadorVoces({
      raiz,
      revisar: () => null,
      generar: async (t, d) => {
        if (t.texto.includes("terminé")) throw new Error("edge 403");
        writeFileSync(d, "x");
      },
    });
    v.preparar([pedido(), pedido({ frase: "emp" })]);
    await espera();
    await espera();
    expect(v.hechos).toBe(1);
    expect(v.saltados).toBe(1);
  });
});

describe("la carpeta vivo/: como mucho 7 días y ~200 MB", () => {
  it("borra lo de más de 7 días y, si se pasa del tope, lo más viejo", () => {
    const dir = mkdtempSync(join(tmpdir(), "oficina-vivo-limpiar-"));
    const ahora = Date.now();
    const poner = (f: string, diasAtras: number, bytes = 10) => {
      writeFileSync(join(dir, f), "x".repeat(bytes));
      const t = (ahora - diasAtras * 86_400_000) / 1000;
      utimesSync(join(dir, f), t, t);
    };
    poner("viejo.mp3", 8);
    poner("nuevo.mp3", 1);
    poner("hoy.mp3", 0);
    const borrados: string[] = [];
    limpiarVivo(dir, ahora, (f) => borrados.push(f));
    expect(borrados).toEqual(["viejo.mp3"]);
    expect(readdirSync(dir).sort()).toEqual(["hoy.mp3", "nuevo.mp3"]);
    expect(VIVO_DIAS_MS).toBe(7 * 86_400_000);
  });
});

describe("los clones con la Mac cargada (JST-198)", () => {
  it("para empezar uno, la carga de 1 min y la de 5 min bajo 2 por núcleo: que la de 1 baje un momento no basta", () => {
    // La QA de JST-168: 12 núcleos y la de 1 min que va y viene entre 22 y 40.
    expect(clonesSeguros([23, 30, 28], 12, 2000)).toBe(false);
    expect(clonesSeguros([30, 23, 20], 12, 2000)).toBe(false);
    expect(clonesSeguros([20, 24, 26], 12, 2000)).toBe(true);
    expect(clonesSeguros([10, 10, 10], 12, 400)).toBe(false);
    expect(clonesSeguros([10, 10, 10], 12, null)).toBe(true);
  });

  it("durante el clon cuenta la carga sin lo que suma él mismo", () => {
    expect(clonSigue(30, 8, 12, 2000)).toBe(true);
    expect(clonSigue(30, 2, 12, 2000)).toBe(false);
    expect(clonSigue(20, 0, 12, 300)).toBe(false);
  });

  it("lo que usa el motor: `uv`, su Python y los hijos de este (con punto o con coma)", () => {
    const ps = ["    1     0   3,0", "  500     1   0.4", "  501   500 612,5", "  502   501  80.0", "  600     1  99.0", ""].join("\n");
    expect(nucleosDe(ps, 500)).toBeCloseTo(6.929);
    expect(nucleosDe(ps, 501)).toBeCloseTo(6.925);
    expect(nucleosDe(ps, 999)).toBe(0);
  });

  it("si la Mac se carga durante un clon, se corta a los 10 s (no a los 3 min) y no se empieza otro en 5 min", async () => {
    vi.useFakeTimers();
    try {
      const raiz = plugin();
      let cargada = false;
      const cortes: string[] = [];
      const hechos: string[] = [];
      const log: string[] = [];
      const v = new PreparadorVoces({
        raiz,
        revisar: () => null,
        clonesOk: () => true,
        clonSigue: () => !cargada,
        log: (m) => log.push(m),
        // Un clon que tarda 2 min.
        generar: (t, d, cortar) =>
          new Promise<void>((ok, mal) => {
            const fin = setTimeout(() => (hechos.push(t.voz.id), writeFileSync(d, "x"), ok()), 120_000);
            cortar.addEventListener("abort", () => (clearTimeout(fin), cortes.push(t.voz.id), mal(cortar.reason)));
          }),
      });
      v.preparar([pedido({ agenteId: "a-clon" }), pedido({ agenteId: "a-clon2" })]);
      await vi.advanceTimersByTimeAsync(25_000);
      expect(cortes).toEqual([]);
      cargada = true;
      await vi.advanceTimersByTimeAsync(VIGILAR_MS);
      expect(cortes).toEqual(["qwen3-mujer"]);
      expect(log).toContain("voces: clon cortado (la Mac se cargó)");
      // El que seguía en la fila no empieza.
      expect(v.saltados).toBe(2);
      expect(hechos).toEqual([]);
      // Ya tranquila, en los 5 min siguientes al corte tampoco.
      cargada = false;
      await vi.advanceTimersByTimeAsync(PAUSA_CLONES_MS - 60_000);
      v.preparar([pedido({ agenteId: "a-clon2" })]);
      await vi.advanceTimersByTimeAsync(0);
      expect(v.saltados).toBe(3);
      // Pasados los 5 min, sí, y un clon de 2 min con la Mac tranquila no se corta.
      await vi.advanceTimersByTimeAsync(60_000);
      v.preparar([pedido({ agenteId: "a-clon2" })]);
      await vi.advanceTimersByTimeAsync(120_000);
      expect(hechos).toEqual(["chatterbox-hombre"]);
      expect(cortes).toEqual(["qwen3-mujer"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("al cortarlo se mata el motor entero: `uv` y lo que abrió (si no, su Python sigue solo)", async () => {
    const raiz = plugin();
    const bin = mkdtempSync(join(tmpdir(), "oficina-uv-falso-"));
    // Un «uv» de mentira que abre un hijo y no contesta nunca, como un clon con la Mac cargada.
    writeFileSync(join(bin, "uv"), `#!/bin/sh\nsleep 60 &\necho $$ $! > "${bin}/pids"\nwait\n`, { mode: 0o755 });
    const vivo = (pid: number) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    const hasta = async (listo: () => boolean) => {
      for (let i = 0; i < 250 && !listo(); i++) await new Promise((ok) => setTimeout(ok, 20));
      return listo();
    };
    const path = process.env.PATH;
    process.env.PATH = `${bin}:${path}`;
    let cargada = false;
    let pids: number[] = [];
    const v = new PreparadorVoces({ raiz, revisar: () => null, clonesOk: () => true, clonSigue: () => !cargada });
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      v.preparar([pedido({ agenteId: "a-clon2" })]);
      expect(await hasta(() => existsSync(join(bin, "pids")) && readFileSync(join(bin, "pids"), "utf8").includes("\n"))).toBe(true);
      pids = readFileSync(join(bin, "pids"), "utf8").trim().split(" ").map(Number);
      expect(pids.length).toBe(2);
      expect(pids.every(vivo)).toBe(true);
      cargada = true;
      vi.advanceTimersByTime(VIGILAR_MS);
      expect(await hasta(() => !pids.some(vivo))).toBe(true);
      expect(await hasta(() => v.saltados === 1)).toBe(true);
    } finally {
      vi.useRealTimers();
      process.env.PATH = path;
      v.cerrar();
      for (const p of pids.filter(vivo)) process.kill(p, "SIGKILL");
    }
  }, 20_000);
});

describe("«empecé» va delante y la página la puede esperar (JST-194)", () => {
  it("«empecé» pasa delante de «te necesito» y «terminé» en su fila; entre varias «empecé», por orden", async () => {
    const raiz = plugin();
    const orden: string[] = [];
    let soltar: () => void = () => undefined;
    const v = new PreparadorVoces({
      raiz,
      revisar: () => null,
      generar: async (t, d) => {
        orden.push(t.texto);
        if (orden.length === 1) await new Promise<void>((ok) => (soltar = ok));
        writeFileSync(d, "x");
      },
    });
    const toca = pedido({ frase: "toca" });
    const fin = pedido({ frase: "fin" });
    const emp2 = pedido({ frase: "emp", tarea: "Tarea dos" });
    const emp3 = pedido({ frase: "emp", tarea: "Tarea tres" });
    v.preparar([toca, fin]);
    v.preparar([emp2, emp3]);
    soltar();
    for (let i = 0; i < 6; i++) await espera();
    expect(orden).toEqual([toca, emp2, emp3, fin].map((p) => textoPedido(p)));
  });

  it("esperar: responde apenas está hecha o «tarde» a los ms; «no» sin voz o si falla; «lista» si ya estaba", async () => {
    const raiz = plugin();
    let soltar: () => void = () => undefined;
    const v = new PreparadorVoces({
      raiz,
      revisar: () => null,
      generar: async (t, d) => {
        if (t.texto.includes("falla")) throw new Error("edge 403");
        if (t.texto.includes("lenta")) await new Promise<void>((ok) => (soltar = ok));
        writeFileSync(d, "x");
      },
    });
    const emp = pedido({ frase: "emp" });
    expect(await v.esperar(emp, 5_000)).toBe("lista");
    expect(await v.esperar(emp, 5_000)).toBe("lista");
    expect(await v.esperar(pedido({ agenteId: "nuevo", frase: "emp" }), 5_000)).toBe("no");
    expect(await v.esperar(pedido({ frase: "emp", tarea: "Esta falla" }), 5_000)).toBe("no");
    const lenta = pedido({ frase: "emp", tarea: "Una lenta" });
    const t0 = Date.now();
    expect(await v.esperar(lenta, 600)).toBe("tarde");
    expect(Date.now() - t0).toBeLessThan(2_000);
    soltar();
    expect(await v.esperar(lenta, 600)).toBe("lista");
    const sin = new PreparadorVoces({ raiz, revisar: () => "falta uv (no está en el PATH)", generar: async () => undefined });
    // Sin uv o ffmpeg no espera nada (si el audio ya estaba, la página lo toca igual).
    expect(await sin.esperar(lenta, 5_000)).toBe("no");
  });
});

describe("0.8.0 (JST-241): «te necesito» con la pregunta, en el worker", () => {
  const pide = { tipo: "pregunta" as const, texto: "Qué IA escribe las conversaciones de la Oficina", mas: 0 };

  it("acepta `pide` solo con «te necesito» y dentro de los topes, y arma el mismo texto que la página", () => {
    const p = pedido({ frase: "toca", pide });
    expect(validarPedido(p)).toEqual(p);
    expect(textoPedido(p)).toBe("Diseño, de JSTM: te necesito. ¿Qué IA escribe las conversaciones de la Oficina?");
    expect(textoPedido(p)).toBe(textoVoz("Diseño", "JSTM", "toca", "nombre-empresa", { pide }));
    expect(textoPedido(pedido({ frase: "toca", presentacion: "frase", pide: { tipo: "plan", texto: "«Oficina global» 0.8.0", mas: 2 } }))).toBe("Te necesito para aprobar el plan de Oficina global 0.8.0. Y 2 más.");
    expect(validarPedido(pedido({ frase: "fin", pide }))).toBeNull();
    expect(validarPedido(pedido({ frase: "toca", pide: { ...pide, tipo: "otra" as never } }))).toBeNull();
    expect(validarPedido(pedido({ frase: "toca", pide: { ...pide, texto: "x".repeat(601) } }))).toBeNull();
    expect(validarPedido(pedido({ frase: "toca", pide: { ...pide, texto: "a\u0007b" } }))).toBeNull();
    expect(validarPedido(pedido({ frase: "toca", pide: { ...pide, mas: 100 } }))).toBeNull();
    expect(validarPedido(pedido({ frase: "toca", pide: { ...pide, mas: 1.5 } }))).toBeNull();
    expect(validarPedido(pedido({ frase: "toca", pide: null as never }))).toBeNull();
    // Sin nada que decir de lo que espera, no se hace (la página dice la frase con la tarea).
    expect(textoPedido(pedido({ frase: "toca", pide: { ...pide, texto: "(JST-12) 🔊" } }))).toBeNull();
  });

  it("va delante en su fila, como «empecé»: se pide recién cuando sube la mano", async () => {
    const raiz = plugin();
    const orden: string[] = [];
    let soltar: () => void = () => undefined;
    const v = new PreparadorVoces({
      raiz,
      revisar: () => null,
      generar: async (t, d) => {
        orden.push(t.texto);
        if (orden.length === 1) await new Promise<void>((ok) => (soltar = ok));
        writeFileSync(d, "x");
      },
    });
    const fin = pedido({ frase: "fin" });
    const toca = pedido({ frase: "toca" });
    const pregunta = pedido({ frase: "toca", pide });
    v.preparar([pedido({ frase: "emp", tarea: "Primera" }), fin, toca]);
    v.preparar([pregunta]);
    soltar();
    for (let i = 0; i < 6; i++) await espera();
    expect(orden).toEqual([pedido({ frase: "emp", tarea: "Primera" }), pregunta, fin, toca].map((p) => textoPedido(p)));
    expect(await v.esperar(pregunta, 5_000)).toBe("lista");
  });

  it("con la Mac cargada, un clon con la pregunta responde «no» al tiro: la página dice la frase con la tarea", async () => {
    const v = new PreparadorVoces({ raiz: plugin(), revisar: () => null, clonesOk: () => false, generar: async (_t, d) => writeFileSync(d, "x") });
    const t0 = Date.now();
    expect(await v.esperar(pedido({ agenteId: "a-clon", frase: "toca", pide }), 5_000)).toBe("no");
    expect(Date.now() - t0).toBeLessThan(2_000);
  });
});

describe("0.6.0 (JST-226): lo que se lee de la oficina, en el worker", () => {
  const charla = (agenteId: string, texto: string, tarea: string | null = null) => ({ clase: "charla", agenteId, texto, tarea });

  it("hace las frases de una conversación (cada voz y texto una vez) y responde cuando están todas", async () => {
    const raiz = plugin();
    const hechos: Array<{ voz: string; texto: string }> = [];
    const v = new PreparadorVoces({ raiz, revisar: () => null, clonesOk: () => true, generar: async (t, d) => (hechos.push({ voz: t.voz.id, texto: t.texto }), writeFileSync(d, "mp3")) });
    const pedidos = [charla("a-edge", "Terminé esta.", "JST-91: Re-QA de la Oficina global"), charla("a-clon", "Bien. ¿Fue complicado?"), charla("a-edge", "Tuvo lo suyo, pero salió.")];
    expect(await v.esperarOficina(pedidos, 5_000)).toEqual(["lista", "lista", "lista"]);
    // Edge y los clones van cada uno en su fila (a la vez): el orden entre filas no importa.
    expect(hechos.map((h) => `${h.voz}|${h.texto}`).sort()).toEqual(["lorenzo|Terminé el re-QA de la Oficina global.", "lorenzo|Tuvo lo suyo, pero salió.", "qwen3-mujer|Bien. ¿Fue complicado?"]);
    // Con su nombre de siempre (voz y texto) y su duración en `vivo.json`.
    const vivo = JSON.parse(readFileSync(join(raiz, "dist", "ui", "voces", "vivo.json"), "utf8"));
    expect(Object.keys(vivo.audios)).toContain(archivoVivo("lorenzo", "Tuvo lo suyo, pero salió."));
    // La segunda vez ya están: no se hace nada.
    expect(v.prepararOficina(pedidos)).toEqual(["lista", "lista", "lista"]);
    expect(hechos).toHaveLength(3);
  });

  it("rechaza lo que no es del plugin (ni pasa la revisión de la IA, 0.7.0) y lo de un agente sin voz: esa conversación se descarta (`no`)", async () => {
    const raiz = plugin();
    const hechos: string[] = [];
    const v = new PreparadorVoces({ raiz, revisar: () => null, clonesOk: () => true, generar: async (t, d) => (hechos.push(t.texto), writeFileSync(d, "mp3")) });
    expect(v.prepararOficina([charla("a-edge", "Lo escribió Pedro con 3 tareas."), charla("nadie", "Bacán."), { clase: "charla", agenteId: "a-edge" }, "hola"])).toEqual(["no", "no", "no", "no"]);
    expect(await v.esperarOficina([charla("a-edge", "Bacán."), charla("a-edge", "Lo escribió Pedro con 3 tareas.")], 5_000)).toEqual(["fila", "no"]);
    await espera();
    expect(hechos).toEqual(["Bacán."]);
  });

  it("si no puede empezar un clon (la Mac cargada), responde «no» al tiro: la página prepara otra", async () => {
    const raiz = plugin();
    const v = new PreparadorVoces({ raiz, revisar: () => null, clonesOk: () => false, generar: async (_t, d) => writeFileSync(d, "mp3") });
    const t0 = Date.now();
    const r = await v.esperarOficina([charla("a-edge", "Bacán."), charla("a-clon", "Ánimo.")], 20_000);
    expect(r[1]).toBe("no");
    expect(Date.now() - t0).toBeLessThan(5_000);
  });

  it("responde a los 20 s como mucho, por reloj, aunque pida más (el RPC de Paperclip corta a los 30 s)", async () => {
    vi.useFakeTimers();
    try {
      const v = new PreparadorVoces({ raiz: plugin(), revisar: () => null, clonesOk: () => true, generar: () => new Promise<void>(() => undefined) });
      let r: string[] | null = null;
      void v.esperarOficina([charla("a-edge", "Bacán.")], 60_000).then((x) => (r = x));
      await vi.advanceTimersByTimeAsync(ESPERA_OFICINA_MAX_MS - 1_000);
      expect(r).toBeNull();
      // Con la Mac cargada los timers se atrasan: lo que cuenta es la hora, no las vueltas.
      vi.setSystemTime(Date.now() + 5_000);
      await vi.advanceTimersByTimeAsync(300);
      expect(r).toEqual(["fila"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ese «no» va al tiro, aunque haya clones en su fila; si ya se puede, el clon va a la fila", () => {
    let ok = false;
    const v = new PreparadorVoces({ raiz: plugin(), revisar: () => null, clonesOk: () => ok, generar: async (_t, d) => writeFileSync(d, "mp3") });
    expect(v.prepararOficina([charla("a-clon", "Ánimo."), charla("a-edge", "Ánimo.")])).toEqual(["no", "fila"]);
    ok = true;
    expect(v.prepararOficina([charla("a-clon", "Ánimo.")])).toEqual(["fila"]);
  });

  it("las mascotas: una voz de Edge más aguda, propia de cada una", async () => {
    const raiz = plugin();
    const hechos: TrabajoVoz[] = [];
    const v = new PreparadorVoces({ raiz, revisar: () => null, clonesOk: () => true, generar: async (t, d) => (hechos.push(t), writeFileSync(d, "mp3")) });
    expect(await v.esperarOficina([{ clase: "mascota", agenteId: null, mascota: "gato", texto: "¡Miau! ♥" }], 5_000)).toEqual(["lista"]);
    expect(hechos[0]).toMatchObject({ texto: "¡Miau!", voz: { id: "mascota-gato", motor: "edge", clave: "es-CL-CatalinaNeural" } });
    expect(hechos[0]!.voz.pitch).toMatch(/^\+\d+Hz$/);
    expect(hechos[0]!.archivo).toBe(archivoVivo("mascota-gato", "¡Miau!"));
  });

  it("sin uv o ffmpeg no hace nada", () => {
    const v = new PreparadorVoces({ raiz: plugin(), revisar: () => "falta uv", generar: async () => undefined });
    expect(v.prepararOficina([charla("a-edge", "Bacán.")])).toEqual(["no"]);
  });
});

describe("0.7.0 (JST-232): lo que escribió la IA de Chrome, en el worker", () => {
  const charla = (agenteId: string, texto: string) => ({ clase: "charla", agenteId, texto, tarea: null });

  it("hace el audio del final o la suelta de la IA si pasa su revisión (sin nombres, números ni códigos); lo demás, no", async () => {
    const raiz = plugin();
    const hechos: string[] = [];
    const v = new PreparadorVoces({ raiz, revisar: () => null, clonesOk: () => true, generar: async (t, d) => (hechos.push(t.texto), writeFileSync(d, "mp3")) });
    expect(await v.esperarOficina([charla("a-edge", "Uf, qué mal momento."), { clase: "suelta", agenteId: "a-edge", texto: "Este café me salva." }], 5_000)).toEqual(["lista", "lista"]);
    expect(v.prepararOficina([charla("a-edge", "¡Bien ahí, Catalina!"), charla("a-edge", "Ahora somos 4."), charla("a-edge", "Lo de BET-12.")])).toEqual(["no", "no", "no"]);
    expect(hechos.sort()).toEqual(["Este café me salva.", "Uf, qué mal momento."]);
  });

  it("como mucho 8 frases nuevas de la IA por minuto; lo que ya está o ya está en la fila no cuenta", () => {
    let ahora = 1_000_000;
    const v = new PreparadorVoces({ raiz: plugin(), revisar: () => null, clonesOk: () => true, ahora: () => ahora, generar: () => new Promise<void>(() => undefined) });
    // Frases distintas con palabras que existen (desde la 0.8.1, JST-251, «Uf, qué lata aa.» se bota).
    const cosas = ["la taza", "la silla", "la mesa", "el sofá", "la planta", "la puerta", "la lámpara", "la ventana", "la pantalla", "el cojín", "la alfombra", "la cortina"];
    const frases = Array.from({ length: TOPE_IA_POR_MIN + 2 }, (_, i) => charla("a-edge", `Uf, qué lata ${cosas[i]}.`));
    const r = v.prepararOficina(frases);
    expect(r.filter((x) => x === "fila")).toHaveLength(TOPE_IA_POR_MIN);
    expect(r.slice(-2)).toEqual(["no", "no"]);
    // Las que ya están en la fila no gastan otra vez; las frases de siempre no tienen tope.
    expect(v.prepararOficina(frases.slice(0, 3))).toEqual(["fila", "fila", "fila"]);
    expect(v.prepararOficina([charla("a-edge", "Bien ahí.")])).toEqual(["fila"]);
    ahora += 60_000;
    expect(v.prepararOficina(frases.slice(-1))).toEqual(["fila"]);
  });

  it("le dice a la página si la IA puede escribir: la Mac no está cargada y no hay un clon generando", async () => {
    let carga = false;
    let soltar: () => void = () => undefined;
    const v = new PreparadorVoces({ raiz: plugin(), revisar: () => null, clonesOk: () => !carga, generar: (t, d) => (t.voz.motor === "edge" ? (writeFileSync(d, "mp3"), Promise.resolve()) : new Promise<void>((ok) => (soltar = () => (writeFileSync(d, "mp3"), ok())))) });
    expect(v.permisoIa()).toEqual({ escribir: true, motivo: null });
    carga = true;
    expect(v.permisoIa()).toEqual({ escribir: false, motivo: "carga" });
    carga = false;
    v.prepararOficina([charla("a-clon", "Ánimo.")]);
    await espera();
    expect(v.permisoIa()).toEqual({ escribir: false, motivo: "clon" });
    soltar();
    await espera();
    expect(v.permisoIa()).toEqual({ escribir: true, motivo: null });
  });

  it("0.8.1 (JST-249): con un clon generando, el permiso espera a que la fila de los clones quede libre (hasta `ms`, ≤ 15 s); con la Mac cargada responde al tiro", async () => {
    let carga = false;
    const pendientes: Array<() => void> = [];
    const v = new PreparadorVoces({
      raiz: plugin(),
      revisar: () => null,
      clonesOk: () => !carga,
      generar: (t, d) => new Promise<void>((ok) => pendientes.push(() => (writeFileSync(d, "mp3"), ok()))),
    });
    // Dos frases de clones: la fila va de a una, así que mientras quede alguna hay una generándose.
    v.prepararOficina([charla("a-clon", "Ánimo."), charla("a-clon2", "Bacán.")]);
    await espera();
    const pedido = v.esperarPermisoIa(5_000);
    pendientes.shift()!();
    await new Promise((ok) => setTimeout(ok, 300));
    expect(v.permisoIa()).toEqual({ escribir: false, motivo: "clon" });
    pendientes.shift()!();
    const t0 = Date.now();
    expect(await pedido).toEqual({ escribir: true, motivo: null });
    expect(Date.now() - t0).toBeLessThan(1_000);
    // Un clon que no termina a tiempo: «clon» a los `ms`.
    v.prepararOficina([charla("a-clon", "Qué rico el sofá.")]);
    await espera();
    const t1 = Date.now();
    expect(await v.esperarPermisoIa(300)).toEqual({ escribir: false, motivo: "clon" });
    expect(Date.now() - t1).toBeGreaterThanOrEqual(290);
    pendientes.shift()!();
    await espera();
    // Con la Mac cargada no espera nada: no se libera en unos segundos.
    carga = true;
    const t2 = Date.now();
    expect(await v.esperarPermisoIa(5_000)).toEqual({ escribir: false, motivo: "carga" });
    expect(Date.now() - t2).toBeLessThan(100);
    expect(ESPERA_PERMISO_IA_MAX_MS).toBe(15_000);
  });
});

describe("un clon que dura demasiado para su texto se bota (JST-255)", () => {
  /** Un MP3 de `ms` (cuadros de MPEG-2 capa III, 48 kbps, 24 kHz, mono: 24 ms cada uno, como los de ffmpeg). */
  const mp3 = (ms: number) => {
    const cuadro = [0xff, 0xf3, 0x64, 0xc0, ...new Array<number>(140).fill(0)];
    return Uint8Array.from(Array.from({ length: Math.ceil(ms / 24) }, () => cuadro).flat());
  };
  /** La frase de la QA de la 0.8.0 que el clon Qwen3 dijo en 36,6 s, repitiendo el comienzo al final. */
  const QA = "Sonda QA168 voz clon, de JSTM: terminé. Prueba QA242, elegir la IA de las conversaciones 040442.";

  it("el tope es 3 s más el doble de sus letras a 10 por segundo, con las letras de lo que se dice", () => {
    expect(maximoAudioMs("¿Y?")).toBe(3_200);
    // «QA168», «JSTM» y «040442» se dicen enteros: 152 letras, 33,4 s (lo normal, ~15 s; el clon malo, 36,6 s).
    expect(maximoAudioMs(paraDecir(QA, "qwen3"))).toBe(33_400);
    expect(maximoAudioMs(QA)).toBeLessThan(maximoAudioMs(paraDecir(QA, "qwen3")));
  });

  it("al hacerlo: el de 36,6 s se borra y no se anota (la página dice la de siempre); uno normal queda", async () => {
    const raiz = plugin();
    const dur = new Map<string, number>();
    const log: string[] = [];
    const v = new PreparadorVoces({
      raiz,
      revisar: () => null,
      clonesOk: () => true,
      clonSigue: () => true,
      log: (m) => log.push(m),
      generar: async (t, destino) => writeFileSync(destino, mp3(dur.get(t.voz.id) ?? 5_000)),
    });
    dur.set("qwen3-mujer", 36_600);
    const largo = pedido({ agenteId: "a-clon", corto: "Sonda QA168 voz clon", tarea: "Prueba QA242, elegir la IA de las conversaciones 040442" });
    expect(textoPedido(largo)).toBe(QA);
    expect(v.preparar([largo])).toEqual({ listas: 0, enFila: 1, saltadas: 0 });
    await espera();
    await espera();
    const archivo = archivoVivo("qwen3-mujer", QA);
    expect(existsSync(join(raiz, "dist", "ui", "voces", archivo))).toBe(false);
    expect(existsSync(join(raiz, "dist", "ui", "voces", "vivo.json"))).toBe(false);
    expect(v.saltados).toBe(1);
    expect(log).toContain("voces: un clon dura demasiado para su texto, se bota");
    // Si la página la vuelve a pedir, se hace otra vez (otra toma): ahora dura lo normal y queda.
    dur.set("qwen3-mujer", 14_000);
    expect(v.preparar([largo])).toEqual({ listas: 0, enFila: 1, saltadas: 0 });
    await espera();
    await espera();
    expect(existsSync(join(raiz, "dist", "ui", "voces", archivo))).toBe(true);
    const vivo = JSON.parse(readFileSync(join(raiz, "dist", "ui", "voces", "vivo.json"), "utf8"));
    expect(vivo.audios[archivo]).toMatchObject({ voz: "qwen3-mujer", texto: QA });
    expect(Math.abs(vivo.audios[archivo].ms - 14_000)).toBeLessThan(30);
    expect(v.preparar([largo])).toEqual({ listas: 1, enFila: 0, saltadas: 0 });
  });

  it("Edge no se bota (no repite: lo largo es de su texto)", async () => {
    const raiz = plugin();
    const v = new PreparadorVoces({ raiz, revisar: () => null, clonesOk: () => true, generar: async (_t, destino) => writeFileSync(destino, mp3(40_000)) });
    expect(v.preparar([pedido()])).toEqual({ listas: 0, enFila: 1, saltadas: 0 });
    await espera();
    await espera();
    expect(v.hechos).toBe(1);
    expect(v.saltados).toBe(0);
  });

  it("al arrancar el worker, bota los clones guardados que duran demasiado; los demás quedan", () => {
    const raiz = plugin();
    const dir = join(raiz, "dist", "ui", "voces");
    mkdirSync(join(dir, "vivo"), { recursive: true });
    const normal = "Diseño, de JSTM: terminé. Diseño de Oficina global 0.5.0: listo, hora estimada.";
    const guardados = [
      { voz: "qwen3-mujer", texto: QA, ms: 36_600 },
      { voz: "chatterbox-hombre", texto: QA, ms: 36_100 },
      { voz: "qwen3-hombre", texto: normal, ms: 13_900 },
      // Edge, aunque dure mucho, y una mascota (sin voz de las 9) no se tocan.
      { voz: "lorenzo", texto: QA, ms: 40_000 },
      { voz: "mascota-gato", texto: "¡Miau!", ms: 30_000 },
    ];
    const audios: Record<string, unknown> = {};
    for (const g of guardados) {
      const archivo = archivoVivo(g.voz, g.texto);
      writeFileSync(join(dir, archivo), "mp3");
      audios[archivo] = { voz: g.voz, texto: g.texto, creado: "2026-10-25T00:00:00.000Z", ms: g.ms };
    }
    writeFileSync(join(dir, "vivo.json"), JSON.stringify({ version: 1, audios }));
    const log: string[] = [];
    new PreparadorVoces({ raiz, revisar: () => null, log: (m) => log.push(m) });
    const quedan = guardados.filter((g) => existsSync(join(dir, archivoVivo(g.voz, g.texto)))).map((g) => g.voz);
    expect(quedan).toEqual(["qwen3-hombre", "lorenzo", "mascota-gato"]);
    const vivo = JSON.parse(readFileSync(join(dir, "vivo.json"), "utf8"));
    expect(Object.values(vivo.audios).map((a) => (a as { voz: string }).voz)).toEqual(quedan);
    expect(log.filter((m) => m === "voces: un clon dura demasiado para su texto, se bota")).toHaveLength(2);
    // Sin `vivo.json` (primera vez) no pasa nada.
    expect(() => new PreparadorVoces({ raiz: plugin(), revisar: () => null })).not.toThrow();
  });
});
