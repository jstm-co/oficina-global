// JST-415: «mientras no estabas» al abrir la página: cuándo toca (última visita de hace una hora o más, nivel que lo deje) y
// los números del aviso.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUSENCIA_ABRIR_MS, CLAVE_VISITA, GUARDAR_VISITA_CADA_MS, MAX_ATRAS_MS, cuentaAlAbrir, datosAlAbrir, erroresDesde, guardadorDeVisita, guardarVisita, inicioDeAusencia, leerVisita, visitaGuardada } from "../src/visita.js";

const AHORA = new Date(2026, 9, 22, 9, 0).getTime();
const haceMin = (m: number) => AHORA - m * 60_000;

describe("la última visita guardada", () => {
  it("la clave es la del plugin y lo guardado se lee con cuidado", () => {
    expect(CLAVE_VISITA).toBe("jstm.oficina-pixel.visita");
    expect(leerVisita("1792602000000")).toBe(1792602000000);
    expect(leerVisita(1792602000000)).toBe(1792602000000);
    for (const raro of [null, undefined, "", "ayer", "-5", "0", NaN, {}, [], true]) expect(leerVisita(raro), String(raro)).toBeNull();
  });
});

describe("cuándo toca contar lo que pasó", () => {
  it("la primera vez no hay con qué comparar; con menos de 60 min, tampoco", () => {
    expect(AUSENCIA_ABRIR_MS).toBe(3_600_000);
    expect(cuentaAlAbrir({ ultima: null, ahora: AHORA, nivel: "normal" })).toBeNull();
    expect(cuentaAlAbrir({ ultima: haceMin(59), ahora: AHORA, nivel: "normal" })).toBeNull();
    expect(cuentaAlAbrir({ ultima: haceMin(60), ahora: AHORA, nivel: "normal" })).toEqual({ desde: haceMin(60) });
    expect(cuentaAlAbrir({ ultima: haceMin(600), ahora: AHORA, nivel: "conversador" })).toEqual({ desde: haceMin(600) });
  });

  it("en tranquilo no sale; una hora en el futuro (reloj cambiado) tampoco", () => {
    expect(cuentaAlAbrir({ ultima: haceMin(600), ahora: AHORA, nivel: "tranquilo" })).toBeNull();
    expect(cuentaAlAbrir({ ultima: AHORA + 60_000, ahora: AHORA, nivel: "normal" })).toBeNull();
  });

  it("no cuenta más de 7 días atrás", () => {
    expect(MAX_ATRAS_MS).toBe(7 * 86_400_000);
    expect(cuentaAlAbrir({ ultima: AHORA - 30 * 86_400_000, ahora: AHORA, nivel: "normal" })).toEqual({ desde: AHORA - MAX_ATRAS_MS });
  });
});

describe("los números del aviso", () => {
  const ag = (id: string, st: string, desde: string | null) => ({ id, st: st as never, desde });
  const iso = (min: number) => new Date(haceMin(min)).toISOString();

  it("errores: solo los que empezaron desde la visita, sin los viejos, silenciados ni los que no traen fecha", () => {
    const desde = haceMin(300);
    const agentes = [
      ag("nuevo", "error", iso(120)),
      ag("anterior", "error", iso(400)),
      ag("sin-fecha", "error", null),
      ag("silenciado", "error", iso(100)),
      ag("trabaja", "trabaja", iso(50)),
    ];
    expect(erroresDesde(agentes, desde, AHORA, { silenciado: iso(100) })).toBe(1);
    expect(erroresDesde(agentes, desde, AHORA)).toBe(2);
    // Un error de hace más de un día es antiguo, aunque sea posterior a la visita (visita de hace 3 días).
    expect(erroresDesde([ag("viejo", "error", new Date(AHORA - 2 * 86_400_000).toISOString())], AHORA - 3 * 86_400_000, AHORA)).toBe(0);
  });

  it("los datos del aviso: lo terminado, lo que te espera y los errores; lo bloqueado no se sabe sin otra lectura", () => {
    expect(datosAlAbrir({ hechas: 12, esperan: 3, errores: 2 })).toEqual({ terminaron: 12, bloqueados: 0, esperan: 3, errores: 2 });
  });
});

describe("con todo apagado no se lee nada (JST-415, revisión)", () => {
  it("sin avisos ni voces, o con la casilla «volver» apagada, no toca contar", () => {
    const base = { ultima: haceMin(600), ahora: AHORA, nivel: "normal" as const };
    expect(cuentaAlAbrir(base)).toEqual({ desde: haceMin(600) });
    expect(cuentaAlAbrir({ ...base, activo: false })).toBeNull();
    expect(cuentaAlAbrir({ ...base, activo: true, casilla: false })).toBeNull();
    expect(cuentaAlAbrir({ ...base, activo: true, casilla: true })).toEqual({ desde: haceMin(600) });
  });
});

describe("la visita compartida", () => {
  const almacen = () => {
    const datos: Record<string, string> = {};
    return { datos, getItem: (k: string) => datos[k] ?? null, setItem: (k: string, v: string) => void (datos[k] = v) };
  };

  it("se guarda y se lee por el almacenamiento; sin almacenamiento o si falla, no revienta", () => {
    const a = almacen();
    expect(visitaGuardada(a)).toBeNull();
    guardarVisita(AHORA, a);
    expect(visitaGuardada(a)).toBe(AHORA);
    expect(() => guardarVisita(AHORA, null)).not.toThrow();
    expect(visitaGuardada(null)).toBeNull();
    const roto = {
      getItem: () => {
        throw new Error("no");
      },
      setItem: () => {
        throw new Error("no");
      },
    };
    expect(() => guardarVisita(AHORA, roto)).not.toThrow();
    expect(visitaGuardada(roto)).toBeNull();
  });

  it("el inicio de la ausencia es el más tardío entre ocultarse, vigilar y la última visita", () => {
    const o = { ocultaDesde: haceMin(60), vigilandoDesde: haceMin(120), ultimaVisita: null as number | null, ahora: AHORA };
    expect(inicioDeAusencia(o)).toBe(haceMin(60));
    // Trabajaste en otra pestaña hasta hace 5 min: la ausencia empieza ahí (menos de 15 min: no dice nada).
    expect(inicioDeAusencia({ ...o, ultimaVisita: haceMin(5) })).toBe(haceMin(5));
    // La vigía empezó a vigilar después de ocultarse.
    expect(inicioDeAusencia({ ...o, vigilandoDesde: haceMin(30) })).toBe(haceMin(30));
    // Una visita en el futuro (reloj cambiado) no cuenta.
    expect(inicioDeAusencia({ ...o, ultimaVisita: AHORA + 60_000 })).toBe(haceMin(60));
  });
});

describe("cuándo se guarda la visita (M1)", () => {
  let visible = true;
  let guardados = 0;
  beforeEach(() => {
    vi.useFakeTimers();
    visible = true;
    guardados = 0;
  });
  afterEach(() => vi.useRealTimers());
  const nuevo = () => guardadorDeVisita({ guardar: () => void guardados++, visible: () => visible });

  it("cada minuto mientras la página se ve, con un solo reloj", () => {
    const g = nuevo();
    g.arrancar();
    g.arrancar();
    vi.advanceTimersByTime(GUARDAR_VISITA_CADA_MS * 3);
    expect(guardados).toBe(3);
    g.detener();
  });

  it("al ocultarse guarda al tiro y el reloj se limpia (oculta no guarda)", () => {
    const g = nuevo();
    g.arrancar();
    vi.advanceTimersByTime(GUARDAR_VISITA_CADA_MS);
    expect(guardados).toBe(1);
    visible = false;
    g.cambioDeVisibilidad();
    expect(guardados).toBe(2);
    vi.advanceTimersByTime(GUARDAR_VISITA_CADA_MS * 5);
    expect(guardados).toBe(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("al volver a verse guarda en un instante aparte (después de los demás oyentes) y retoma el reloj", () => {
    const g = nuevo();
    visible = false;
    g.arrancar(); // oculta: no arranca el reloj
    expect(vi.getTimerCount()).toBe(0);
    visible = true;
    g.cambioDeVisibilidad();
    expect(guardados).toBe(0); // todavía no: los demás oyentes del mismo cambio aún leen la visita anterior
    vi.advanceTimersByTime(0);
    expect(guardados).toBe(1);
    vi.advanceTimersByTime(GUARDAR_VISITA_CADA_MS * 2);
    expect(guardados).toBe(3);
    g.detener();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("varios cambios seguidos no dejan relojes de más", () => {
    const g = nuevo();
    g.arrancar();
    for (let i = 0; i < 5; i++) {
      visible = false;
      g.cambioDeVisibilidad();
      visible = true;
      g.cambioDeVisibilidad();
    }
    vi.advanceTimersByTime(0);
    expect(vi.getTimerCount()).toBe(1);
    g.detener();
    expect(vi.getTimerCount()).toBe(0);
  });
});
