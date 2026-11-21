// «Leer contexto» en la barra de arriba (JST-276, design-spec de JST-282 rev 2
// §5 a §7): los estados, las frases de a una, lo escrito sin voz, la ruta y una
// voz a la vez con el lector del Resumen. Voz y relojes de mentira.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ERROR_MS, FIN_MS, frasesDe, LectorContexto, MIN_FRASE_MS, msEscrita, tareaDeRuta, type VozContexto } from "../src/ui/contextoLector.js";
import type { Informe } from "../src/ui/contextoInforme.js";
import type { FraseResumen } from "../src/resumen/frases.js";
import { Lector, type Habla, type VozLector } from "../src/resumen/lector.js";

class VozFalsa implements VozContexto {
  hay = true;
  dichas: string[] = [];
  primeras: boolean[] = [];
  cortadas = 0;
  preparar?: VozContexto["preparar"];
  private abierta: ((cortada: boolean) => void) | null = null;
  hayVoz() {
    return Promise.resolve(this.hay);
  }
  decir(frase: string, alTerminar: (cortada: boolean) => void, primera: boolean) {
    this.dichas.push(frase);
    this.primeras.push(primera);
    this.abierta = alTerminar;
    return () => {
      this.cortadas += 1;
      this.abierta = null;
    };
  }
  /** Termina la frase que suena (o la corta otra voz). */
  termina(cortada = false) {
    const a = this.abierta;
    this.abierta = null;
    a?.(cortada);
  }
}

const TEXTO = "Te pregunta: ¿Cómo quieres pasar tu lista? Es de la tarea ABC-12: Publicar el catálogo. Es parte de ABC-10: revisar los precios.";

let voz: VozFalsa;
let pausas = 0;
let activos: boolean[] = [];
const nuevo = () =>
  new LectorContexto({
    voz,
    programar: (fn, ms) => {
      const t = setTimeout(fn, ms);
      return () => clearTimeout(t);
    },
    antesDeLeer: () => (pausas += 1),
    alActivo: (on) => activos.push(on),
  });

beforeEach(() => {
  vi.useFakeTimers();
  voz = new VozFalsa();
  pausas = 0;
  activos = [];
});
afterEach(() => vi.useRealTimers());

describe("frasesDe", () => {
  it("corta en las oraciones, también tras «?» y antes de «¿»", () => {
    expect(frasesDe(TEXTO)).toEqual(["Te pregunta: ¿Cómo quieres pasar tu lista?", "Es de la tarea ABC-12: Publicar el catálogo.", "Es parte de ABC-10: revisar los precios."]);
  });
  it("no corta en versiones, decimales ni en el número de una lista", () => {
    expect(frasesDe("Instala la 0.9.6 en la real. Pasos: 1. Abrir JST-181. 2. Buscar el botón.")).toEqual(["Instala la 0.9.6 en la real.", "Pasos: 1. Abrir JST-181.", "2. Buscar el botón."]);
  });
  it("«Lo último en el hilo:» va con el primer comentario, y lo vacío no es una frase", () => {
    expect(frasesDe("Tarea JST-1: algo. Lo último en el hilo: Sí, dale.")).toEqual(["Tarea JST-1: algo.", "Lo último en el hilo: Sí, dale."]);
    expect(frasesDe("   ")).toEqual([]);
  });
});

describe("msEscrita", () => {
  it("unas 16 letras por segundo, mínimo 1,8 s", () => {
    expect(msEscrita("Sí.")).toBe(MIN_FRASE_MS);
    expect(msEscrita("x".repeat(160))).toBe(10_000);
  });
});

describe("tareaDeRuta", () => {
  it("solo la página de una tarea", () => {
    expect(tareaDeRuta("/JST/issues/JST-181")).toBe("JST-181");
    expect(tareaDeRuta("/JST/issues/BET-693/")).toBe("BET-693");
    expect(tareaDeRuta("/JST/issues/2f0c1a3e-1111-4222-8333-944455556666")).toBe("2f0c1a3e-1111-4222-8333-944455556666");
    for (const p of ["/JST/issues", "/JST/issues/all", "/JST/issues/recent", "/JST/dashboard", "/JST/oficina-global", "/JST/projects/p1/issues/x", "/JST/execution-workspaces/w/issues", "/"]) expect(tareaDeRuta(p)).toBeNull();
  });
});

describe("LectorContexto", () => {
  it("Listo → Cargando al tiro → Leyendo de a una frase → Terminó 2,5 s → Listo", async () => {
    const c = nuevo();
    let pedir!: (t: string) => void;
    c.tocar("JST-181", () => new Promise((ok) => (pedir = ok)));
    expect(c.estado).toBe("cargando");
    expect(pausas).toBe(1);
    pedir(TEXTO);
    await vi.advanceTimersByTimeAsync(0);
    expect(c.estado).toBe("leyendo");
    expect(c.frases).toHaveLength(3);
    expect(voz.dichas).toEqual(["Te pregunta: ¿Cómo quieres pasar tu lista?"]);
    voz.termina();
    expect(c.k).toBe(1);
    voz.termina();
    voz.termina();
    expect(voz.dichas).toHaveLength(3);
    expect(voz.primeras).toEqual([true, false, false]);
    expect(c.estado).toBe("fin");
    await vi.advanceTimersByTimeAsync(FIN_MS - 1);
    expect(c.estado).toBe("fin");
    await vi.advanceTimersByTimeAsync(1);
    expect(c.estado).toBe("listo");
    expect(activos).toEqual([true, false]);
  });

  it("tocar mientras carga o lee lo detiene; lo que llega tarde no empieza a hablar", async () => {
    const c = nuevo();
    let pedir!: (t: string) => void;
    c.tocar("JST-181", () => new Promise((ok) => (pedir = ok)));
    c.tocar("JST-181", () => Promise.resolve(TEXTO));
    expect(c.estado).toBe("listo");
    pedir(TEXTO);
    await vi.advanceTimersByTimeAsync(0);
    expect(c.estado).toBe("listo");
    expect(voz.dichas).toEqual([]);

    c.tocar("JST-181", () => Promise.resolve(TEXTO));
    await vi.advanceTimersByTimeAsync(0);
    expect(c.estado).toBe("leyendo");
    c.tocar("JST-181", () => Promise.resolve(TEXTO));
    expect(c.estado).toBe("listo");
    expect(voz.cortadas).toBe(1);
  });

  it("si falla la carga: No se pudo por 4 s; tocar ahí lee otra vez", async () => {
    const c = nuevo();
    c.tocar("JST-181", () => Promise.reject(new Error("HTTP 500")));
    await vi.advanceTimersByTimeAsync(0);
    expect(c.estado).toBe("error");
    await vi.advanceTimersByTimeAsync(ERROR_MS - 1);
    expect(c.estado).toBe("error");
    c.tocar("JST-181", () => Promise.resolve(TEXTO));
    expect(c.estado).toBe("cargando");
    await vi.advanceTimersByTimeAsync(ERROR_MS);
    expect(c.estado).toBe("leyendo");
  });

  it("si otra voz corta la frase, se detiene (no salta a la siguiente)", async () => {
    const c = nuevo();
    c.tocar("JST-181", () => Promise.resolve(TEXTO));
    await vi.advanceTimersByTimeAsync(0);
    voz.termina(true);
    expect(c.estado).toBe("listo");
    expect(voz.dichas).toHaveLength(1);
  });

  it("sin voz en español: lo deja escrito, frase a frase, al ritmo de la lectura", async () => {
    voz.hay = false;
    const c = nuevo();
    c.tocar("JST-181", () => Promise.resolve(TEXTO));
    await vi.advanceTimersByTimeAsync(0);
    expect(c.estado).toBe("leyendo");
    expect(c.sinVoz).toBe(true);
    expect(voz.dichas).toEqual([]);
    await vi.advanceTimersByTimeAsync(msEscrita(c.frases[0]!));
    expect(c.k).toBe(1);
    c.detener();
    expect(c.estado).toBe("listo");
    expect(c.sinVoz).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(c.estado).toBe("listo");
  });

  it("detener desde Terminó vuelve a Listo y ya no cambia solo", async () => {
    const c = nuevo();
    c.tocar("JST-181", () => Promise.resolve("Sí."));
    await vi.advanceTimersByTimeAsync(0);
    voz.termina();
    expect(c.estado).toBe("fin");
    c.detener();
    expect(c.estado).toBe("listo");
    await vi.advanceTimersByTimeAsync(FIN_MS);
    expect(c.estado).toBe("listo");
  });
});

// JST-414: el informe con sus partes, saltar a una frase y soltarlo.
const INFORME: Informe = {
  secciones: [
    { clave: "pide", titulo: "Quién te espera", frases: ["Marta te espera.", "Es por la tarea ABC-1."] },
    { clave: "pregunta", titulo: "Qué te pregunta", frases: ["Te pregunta: ¿publico hoy?"] },
  ],
};
const LEIDO = { frases: INFORME.secciones.flatMap((s) => s.frases), informe: INFORME };

describe("la lectura con informe", () => {
  it("lee las frases del informe, en orden, y guarda el informe para dejarlo escrito", async () => {
    const c = nuevo();
    c.tocar("ABC-1", () => Promise.resolve(LEIDO));
    await vi.advanceTimersByTimeAsync(0);
    expect(c.estado).toBe("leyendo");
    expect(c.frases).toEqual(["Marta te espera.", "Es por la tarea ABC-1.", "Te pregunta: ¿publico hoy?"]);
    expect(c.informe).toBe(INFORME);
    voz.termina();
    voz.termina();
    voz.termina();
    expect(voz.dichas).toEqual(c.frases);
    expect(c.estado).toBe("fin");
    // Al terminar sigue a la vista (para que la persona lo cierre).
    expect(c.informe).toBe(INFORME);
    expect(c.frases).toHaveLength(3);
  });

  it("un texto suelto no tiene informe; un informe sin él tampoco", async () => {
    const c = nuevo();
    c.tocar("ABC-1", () => Promise.resolve(TEXTO));
    await vi.advanceTimersByTimeAsync(0);
    expect(c.informe).toBeNull();
    c.detener();
    c.tocar("ABC-1", () => Promise.resolve({ frases: ["Una frase."] }));
    await vi.advanceTimersByTimeAsync(0);
    expect(c.informe).toBeNull();
    expect(c.frases).toEqual(["Una frase."]);
  });

  it("al leer otra cosa, el informe anterior se suelta mientras carga", async () => {
    const c = nuevo();
    c.tocar("ABC-1", () => Promise.resolve(LEIDO));
    await vi.advanceTimersByTimeAsync(0);
    c.detener();
    expect(c.informe).toBe(INFORME);
    c.tocar("ABC-2", () => new Promise(() => undefined));
    expect(c.estado).toBe("cargando");
    expect(c.informe).toBeNull();
    expect(c.frases).toEqual([]);
  });

  it("un informe sin frases termina al tiro", async () => {
    const c = nuevo();
    c.tocar("ABC-1", () => Promise.resolve({ frases: [], informe: { secciones: [] } }));
    await vi.advanceTimersByTimeAsync(0);
    expect(c.estado).toBe("fin");
    expect(voz.dichas).toEqual([]);
  });
});

describe("saltar entre frases (irA, anterior, siguiente)", () => {
  const leyendo = async () => {
    const c = nuevo();
    c.tocar("ABC-1", () => Promise.resolve(LEIDO));
    await vi.advanceTimersByTimeAsync(0);
    return c;
  };

  it("irA salta a esa frase, corta la que suena y sigue leyendo desde ahí", async () => {
    const c = await leyendo();
    c.irA(2);
    expect(c.k).toBe(2);
    expect(c.estado).toBe("leyendo");
    expect(voz.cortadas).toBe(1);
    expect(voz.dichas).toEqual(["Marta te espera.", "Te pregunta: ¿publico hoy?"]);
    expect(voz.primeras).toEqual([true, false]);
    voz.termina();
    expect(c.estado).toBe("fin");
  });

  it("la frase que se corta ya no avisa que terminó (no salta dos veces)", async () => {
    const c = await leyendo();
    const antes = voz.dichas.length;
    c.irA(1);
    voz.termina();
    expect(c.k).toBe(2);
    expect(voz.dichas.length).toBe(antes + 2);
  });

  it("irA acota el número: nunca pasa de los extremos", async () => {
    const c = await leyendo();
    c.irA(99);
    expect(c.k).toBe(2);
    c.irA(-4);
    expect(c.k).toBe(0);
    c.irA(1.6);
    expect(c.k).toBe(2);
  });

  it("anterior repite la que va si es la primera; siguiente avanza y, en la última, termina", async () => {
    const c = await leyendo();
    c.anterior();
    expect(c.k).toBe(0);
    c.siguiente();
    expect(c.k).toBe(1);
    c.anterior();
    expect(c.k).toBe(0);
    c.irA(2);
    c.siguiente();
    expect(c.estado).toBe("fin");
    expect(c.k).toBe(2);
  });

  it("sirve también después de terminar o detener: vuelve a leer desde esa frase y pausa el Resumen", async () => {
    const c = await leyendo();
    expect(pausas).toBe(1);
    c.irA(2);
    voz.termina();
    expect(c.estado).toBe("fin");
    c.irA(1);
    expect(c.estado).toBe("leyendo");
    expect(c.k).toBe(1);
    expect(pausas).toBe(2);
    c.detener();
    expect(c.estado).toBe("listo");
    expect(c.frases).toHaveLength(3);
    c.irA(0);
    expect(c.estado).toBe("leyendo");
    expect(pausas).toBe(3);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(c.estado).toBe("leyendo");
  });

  it("mientras carga o sin frases no hace nada; siguiente fuera de lectura tampoco termina nada", async () => {
    const c = nuevo();
    c.irA(1);
    expect(c.estado).toBe("listo");
    c.tocar("ABC-1", () => new Promise(() => undefined));
    c.irA(1);
    c.siguiente();
    expect(c.estado).toBe("cargando");
    c.detener();
    // Ya detenido, «siguiente» desde la primera frase lee la segunda (no es lo mismo que «terminar»).
    const d = await leyendo();
    d.detener();
    d.siguiente();
    expect(d.estado).toBe("leyendo");
    expect(d.k).toBe(1);
  });

  it("sin voz, saltar mueve la frase marcada y el reloj sigue desde ahí", async () => {
    voz.hay = false;
    const c = await leyendo();
    expect(c.sinVoz).toBe(true);
    c.irA(2);
    expect(c.k).toBe(2);
    expect(voz.dichas).toEqual([]);
    await vi.advanceTimersByTimeAsync(msEscrita(c.frases[2]!));
    expect(c.estado).toBe("fin");
  });

  it("al repetir la última del informe que terminó, la lee otra vez y vuelve a terminar", async () => {
    const c = await leyendo();
    c.irA(2);
    voz.termina();
    expect(c.estado).toBe("fin");
    c.irA(2);
    voz.termina();
    expect(c.estado).toBe("fin");
    expect(voz.dichas.filter((f) => f === "Te pregunta: ¿publico hoy?")).toHaveLength(2);
  });
});

describe("soltar (cerrar la parte escrita)", () => {
  it("detiene, corta la voz y suelta las frases y el informe", async () => {
    const c = nuevo();
    c.tocar("ABC-1", () => Promise.resolve(LEIDO));
    await vi.advanceTimersByTimeAsync(0);
    const versionAntes = c.version;
    c.soltar();
    expect(c.estado).toBe("listo");
    expect(voz.cortadas).toBe(1);
    expect(c.frases).toEqual([]);
    expect(c.informe).toBeNull();
    expect(c.version).toBeGreaterThan(versionAntes);
    expect(activos).toEqual([true, false]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(voz.dichas).toHaveLength(1);
  });

  it("después de terminar también suelta; sin nada cargado no avisa a nadie", async () => {
    const c = nuevo();
    c.tocar("ABC-1", () => Promise.resolve("Sí."));
    await vi.advanceTimersByTimeAsync(0);
    voz.termina();
    c.soltar();
    expect(c.frases).toEqual([]);
    const v = c.version;
    c.soltar();
    expect(c.version).toBe(v);
  });

  it("quien mira se entera (suscribir)", async () => {
    const c = nuevo();
    let avisos = 0;
    const baja = c.suscribir(() => (avisos += 1));
    c.tocar("ABC-1", () => Promise.resolve(LEIDO));
    await vi.advanceTimersByTimeAsync(0);
    const antes = avisos;
    c.irA(1);
    expect(avisos).toBeGreaterThan(antes);
    baja();
    const despues = avisos;
    c.soltar();
    expect(avisos).toBe(despues);
  });
});

describe("una voz a la vez con el Resumen (§7)", () => {
  class VozResumenFalsa implements VozLector {
    dichas: string[] = [];
    decir(f: FraseResumen): Habla {
      this.dichas.push(f.texto);
      return { fin: new Promise<void>(() => undefined), cortar: () => undefined };
    }
  }

  it("el Resumen avisa antes de cada frase: al seguir con ▶, el contexto se calla antes de que hable", async () => {
    const vr = new VozResumenFalsa();
    const orden: string[] = [];
    const c = nuevo();
    const l = new Lector({
      voz: { decir: (f, v, e, s) => (orden.push(`resumen: ${f.texto}`), vr.decir(f)) },
      ahora: Date.now,
      programar: (fn, ms) => {
        const t = setTimeout(fn, ms);
        return () => clearTimeout(t);
      },
      alCambiar: () => undefined,
      antesDeHablar: () => {
        if (c.activo()) {
          orden.push("calla el contexto");
          c.detener();
        }
      },
    });
    l.empezar(["toca"], false);
    l.fijarArmadas("toca", [{ sec: "toca", texto: "Te toca JST-181." }]);
    l.fijarIa("toca", false);
    expect(l.fase).toBe("leyendo");
    l.pausar();
    c.tocar("JST-181", () => Promise.resolve(TEXTO));
    await vi.advanceTimersByTimeAsync(0);
    expect(c.estado).toBe("leyendo");
    l.seguir();
    expect(c.estado).toBe("listo");
    expect(orden).toEqual(["resumen: Te toca JST-181.", "calla el contexto", "resumen: Te toca JST-181."]);
  });
});

describe("sin voz, después de terminar (JST-414)", () => {
  it("saltar a una frase la deja escrita otra vez, sin llamar a la voz", async () => {
    const relojes: Array<() => void> = [];
    const decir = vi.fn(() => () => undefined);
    const c = new LectorContexto({
      voz: { hayVoz: async () => false, decir },
      programar: (fn) => {
        relojes.push(fn);
        return () => undefined;
      },
    });
    await c.leer("JST-1", async () => ({ frases: ["Uno.", "Dos."] }));
    expect(c.sinVoz).toBe(true);
    c.detener();
    expect(c.sinVoz).toBe(false);
    c.irA(1);
    expect(c.estado).toBe("leyendo");
    expect(c.sinVoz).toBe(true);
    expect(decir).not.toHaveBeenCalled();
  });
});

describe("frasesDe y las abreviaturas", () => {
  it("no corta tras «Sr.», «Dra.», «Ud.», «etc.», «EE. UU.», «p. ej.», «aprox.», «núm.» ni «pág.»", () => {
    expect(frasesDe("Habló con la Dra. Pérez y con el Sr. Rojas. Luego cerró.")).toEqual(["Habló con la Dra. Pérez y con el Sr. Rojas.", "Luego cerró."]);
    expect(frasesDe("Pregunte a Ud. Martínez sobre el pago. Responde hoy.")).toEqual(["Pregunte a Ud. Martínez sobre el pago.", "Responde hoy."]);
    expect(frasesDe("Hay pagos, cobros, etc. Revisar todo antes del viernes.")).toEqual(["Hay pagos, cobros, etc. Revisar todo antes del viernes."]);
    expect(frasesDe("Opera en EE. UU. Mañana abre otra sede.")).toEqual(["Opera en EE. UU. Mañana abre otra sede."]);
    expect(frasesDe("Hay opciones, p. ej. Quotex o IQ. Elige una.")).toEqual(["Hay opciones, p. ej. Quotex o IQ.", "Elige una."]);
    expect(frasesDe("Cuesta aprox. Doscientos pesos, ver pág. Cinco o núm. Tres. Fin.")).toEqual(["Cuesta aprox. Doscientos pesos, ver pág. Cinco o núm. Tres.", "Fin."]);
  });
});

describe("el audio todavía llega (cargando con las frases a la vista)", () => {
  const conPreparar = () => {
    let llega!: () => void;
    const v = new VozFalsa();
    v.preparar = () => new Promise<void>((ok) => (llega = ok));
    voz = v;
    return () => llega();
  };

  it("irA, anterior y siguiente cambian la frase de partida y avisan; la lectura parte de ahí", async () => {
    const llega = conPreparar();
    const c = nuevo();
    c.tocar("ABC-1", () => Promise.resolve(LEIDO));
    await vi.advanceTimersByTimeAsync(0);
    expect(c.estado).toBe("cargando");
    expect(c.frases).toHaveLength(3);
    const v0 = c.version;
    c.irA(2);
    expect(c.k).toBe(2);
    expect(c.version).toBeGreaterThan(v0);
    c.anterior();
    expect(c.k).toBe(1);
    c.siguiente();
    expect(c.k).toBe(2);
    c.siguiente();
    expect(c.k).toBe(2);
    expect(c.estado).toBe("cargando");
    expect(voz.dichas).toEqual([]);
    llega();
    await vi.advanceTimersByTimeAsync(0);
    expect(c.estado).toBe("leyendo");
    expect(voz.dichas).toEqual(["Te pregunta: ¿publico hoy?"]);
  });

  it("sin frases cargadas sigue sin hacer nada", async () => {
    conPreparar();
    const c = nuevo();
    c.tocar("ABC-1", () => new Promise(() => undefined));
    c.irA(2);
    expect(c.k).toBe(0);
    expect(c.estado).toBe("cargando");
  });
});

describe("detener conserva la posición", () => {
  const leyendo = async () => {
    const c = nuevo();
    c.tocar("ABC-1", () => Promise.resolve(LEIDO));
    await vi.advanceTimersByTimeAsync(0);
    return c;
  };

  it("detenida a medias, la frase sigue siendo la que iba y siguiente parte de ahí", async () => {
    const c = await leyendo();
    voz.termina();
    expect(c.k).toBe(1);
    c.detener();
    expect(c.estado).toBe("listo");
    expect(c.k).toBe(1);
    c.siguiente();
    expect(c.k).toBe(2);
    expect(c.estado).toBe("leyendo");
  });

  it("anterior después de detener parte de la frase conservada", async () => {
    const c = await leyendo();
    c.irA(2);
    c.detener();
    c.anterior();
    expect(c.k).toBe(1);
  });

  it("después de terminar, al volver a «listo» la frase vuelve a 0; detener desde «fin» también", async () => {
    const c = await leyendo();
    c.irA(2);
    voz.termina();
    expect(c.estado).toBe("fin");
    await vi.advanceTimersByTimeAsync(FIN_MS);
    expect(c.estado).toBe("listo");
    expect(c.k).toBe(0);
    const d = await leyendo();
    d.irA(2);
    voz.termina();
    d.detener();
    expect(d.k).toBe(0);
  });

  it("soltar deja todo en cero", async () => {
    const c = await leyendo();
    c.irA(2);
    c.soltar();
    expect(c.k).toBe(0);
    expect(c.frases).toEqual([]);
  });
});

describe("una voz que termina sin esperar", () => {
  it("su función de corte no pisa la de la frase siguiente, que es la que suena", async () => {
    const cortes: string[] = [];
    let abierta: ((cortada: boolean) => void) | null = null;
    const sincrona: VozContexto = {
      hayVoz: () => Promise.resolve(true),
      decir: (frase, alTerminar) => {
        if (frase === "Primera.") {
          // Nada que decir de esa frase: avisa al tiro, antes de devolver su corte.
          alTerminar(false);
          return () => cortes.push("corte de la primera");
        }
        abierta = alTerminar;
        return () => cortes.push(`corte de ${frase}`);
      },
    };
    const c = new LectorContexto({ voz: sincrona, programar: (fn, ms) => (setTimeout(fn, ms), () => undefined) });
    c.tocar("ABC-1", () => Promise.resolve({ frases: ["Primera.", "Segunda."] }));
    await vi.advanceTimersByTimeAsync(0);
    expect(c.k).toBe(1);
    expect(abierta).not.toBeNull();
    c.detener();
    expect(cortes).toEqual(["corte de Segunda."]);
  });
});
