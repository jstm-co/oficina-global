import { describe, expect, it } from "vitest";
import { libre, pasillosDe, piesAsiento, piesPuesto, rejillaDe, salidaPuesto, type Punto } from "../src/caminos.js";
import { cajaHilo, tamanoHilo, tapaA, type CajaHilo } from "../src/hilo.js";
import { armarPiso, armarSalaAcercada, type EntradaSala, type PisoPlano } from "../src/plano.js";
import { DICEN, ENTRE_FRASES_MS, MASCOTA_DICE_MS, PAREJA_MS, PEDIR_TEMAS_MS, PRIMERA_FRASE_MS, SALA_MS, SUELTAS, duracionFrase, type ContextoCharla, type Guion, type Linea, type Tema } from "../src/charlas.js";
import { CACHE_TEMAS_MS, type Temas } from "../src/temas.js";
import { MAX_PISO, MAX_SALA, MASCOTAS, VELOCIDAD, Vida, type AgenteVida, type FuenteTemas, type OpcionesVida, type VistaCharla } from "../src/vida.js";
import type { Dibujo } from "../src/vista.js";

// Las 4 empresas de hoy (BET 9, ELM 4, JST 5, MIG 8) en el computador a 576: 2 filas y 1 pasillo.
const HOY: EntradaSala[] = [
  { prefijo: "BET", agentes: 9 },
  { prefijo: "ELM", agentes: 4 },
  { prefijo: "JST", agentes: 5 },
  { prefijo: "MIG", agentes: 8 },
];
const PISO = armarPiso(HOY, 576, "computador");
const TODAS: ReadonlySet<string> = new Set(HOY.map((s) => s.prefijo));
const OP: OpcionesVida = { rm: false, charlas: false, mascotas: false, cargando: false, oculta: false };
const sala = (pre: string, piso: PisoPlano = PISO) => piso.salas.find((s) => s.prefijo === pre)!;

/** Todos trabajando salvo los que se indican (`BET-0` es el primer agente de BET, en su primer puesto). */
function agentes(cambios: Record<string, Dibujo> = {}, codigos: Record<string, string> = {}): AgenteVida[] {
  return HOY.flatMap((s) =>
    Array.from({ length: s.agentes }, (_, i) => {
      const id = `${s.prefijo}-${i}`;
      const st = cambios[id] ?? "trabaja";
      return { id, companyId: `c-${s.prefijo}`, prefijo: s.prefijo, st, need: st === "toca", codigo: codigos[id] ?? null };
    }),
  );
}

function semilla(n = 7): () => number {
  let s = n;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Una vida con reloj propio: `t` avanza solo con `avanzar`. */
function banco(temas: FuenteTemas | null = null, reloj = { t: 1_000 }) {
  const vida = new Vida({ ahora: () => reloj.t, azar: semilla(), temas });
  let estado = agentes();
  let op = OP;
  let plano = PISO;
  let activas = TODAS;
  const sync = (o: { cambios?: Record<string, Dibujo>; codigos?: Record<string, string>; op?: Partial<OpcionesVida>; plano?: PisoPlano; activas?: ReadonlySet<string> } = {}) => {
    if (o.cambios || o.codigos) estado = agentes(o.cambios ?? {}, o.codigos ?? {});
    if (o.op) op = { ...op, ...o.op };
    if (o.plano) plano = o.plano;
    if (o.activas) activas = o.activas;
    vida.sincronizar(plano, estado, activas, op);
  };
  /** Avanza `ms` en cuadros de 16 ms; `cada` se llama después de cada cuadro. */
  const avanzar = (ms: number, cada?: () => void) => {
    for (let k = 0; k < ms; k += 16) {
      reloj.t += 16;
      vida.paso(reloj.t);
      cada?.();
    }
  };
  /**
   * Como `avanzar`, pero como el bucle de verdad: cuadros de 16 ms mientras algo se mueve y, si no, salta
   * hasta `proximo()`. Deja correr las promesas (las lecturas de temas) después de cada salto y cada 10 cuadros.
   */
  const avanzarAsync = async (ms: number, cada?: () => void) => {
    const fin = reloj.t + ms;
    let n = 0;
    while (reloj.t < fin) {
      const prox = vida.seMueve() ? null : vida.proximo();
      const salto = prox !== null && prox > reloj.t + 16;
      reloj.t = Math.min(fin, salto ? prox : reloj.t + 16);
      vida.paso(reloj.t);
      cada?.();
      if (salto || ++n % 10 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    await new Promise((r) => setTimeout(r, 0));
  };
  /** Avanza hasta que `listo()` (como mucho `max` ms); devuelve cuántos ms pasaron. */
  const hasta = (listo: () => boolean, max = 60_000) => {
    let ms = 0;
    while (!listo() && ms < max) {
      reloj.t += 16;
      ms += 16;
      vida.paso(reloj.t);
    }
    return ms;
  };
  /** Como `hasta`, dejando correr las promesas. */
  const hastaAsync = async (listo: () => boolean, max = 60_000) => {
    let ms = 0;
    while (!listo() && ms < max) {
      reloj.t += 16;
      ms += 16;
      vida.paso(reloj.t);
      if (ms % 160 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    return ms;
  };
  return { vida, reloj, sync, avanzar, avanzarAsync, hasta, hastaAsync };
}

const camina = (v: Vida, id: string) => !!v.fuera(id)?.caminando;

/**
 * 0.5.0 (JST-163 §10): una entrega a alguien libre en el descanso se hace en la mesa. Para probar ahí el sobre de
 * siempre, la mesa de su sala ya está ocupada por otra entrega (`de` → `a`, con `a` libre en el descanso).
 */
function ocuparMesa(vida: Vida, de: string, a: string): void {
  expect(vida.entrega(de, a, "XX-1")).toBe(true);
  expect(vida.fuera(a)?.junta).toBe(true);
}
const todos = () => agentes().map((a) => a.id);
/** Las conversaciones vivas (en curso o juntándose). Es interno: solo para contar. */
const charlas = (v: Vida) => (v as unknown as { charlas: Array<{ prefijo: string; a: string; b: string; fase: string }> }).charlas;

describe("aparecer en su lugar (JST-96 §3 y §4)", () => {
  it("al sincronizar por primera vez, cada uno está en su lugar y nadie camina", () => {
    const { vida, sync } = banco();
    sync({ cambios: { "BET-1": "libre", "BET-4": "libre", "BET-8": "libre" } });
    for (const id of todos().filter((x) => !["BET-1", "BET-4", "BET-8"].includes(x))) {
      expect(vida.enEscritorio(id)).toBe(true);
      expect(vida.fuera(id)).toBeNull();
    }
    const asientos = sala("BET").asientos;
    // Los libres toman los asientos en orden: primero los 2 del sofá.
    const quieto = { quieto: false, fila: null, junta: false };
    expect(vida.fuera("BET-1")).toEqual({ pos: piesAsiento(asientos[0]!), anim: "sofa", caminando: false, hacia: null, sofa: true, ...quieto });
    expect(vida.fuera("BET-4")).toEqual({ pos: piesAsiento(asientos[1]!), anim: "sofa", caminando: false, hacia: null, sofa: true, ...quieto });
    expect(vida.fuera("BET-8")).toEqual({ pos: piesAsiento(asientos[2]!), anim: "libre", caminando: false, hacia: null, sofa: false, ...quieto });
    expect(vida.enEscritorio("BET-1")).toBe(false);
    expect(vida.seMueve()).toBe(false);
  });

  it("un agente que no conoce se dibuja en su escritorio, como siempre", () => {
    const { vida } = banco();
    expect(vida.enEscritorio("nadie")).toBe(true);
    expect(vida.fuera("nadie")).toBeNull();
  });

  it("sin asiento libre en el descanso, queda de pie junto a su escritorio y no camina", () => {
    const { vida, sync } = banco();
    const s = sala("JST");
    const vacia: PisoPlano = { ...PISO, salas: PISO.salas.map((x) => (x.prefijo === "JST" ? { ...x, asientos: s.asientos.slice(0, 1) } : x)) };
    sync({ plano: vacia, cambios: { "JST-0": "libre" } });
    sync({ cambios: { "JST-0": "libre", "JST-1": "libre" } });
    const f = vida.fuera("JST-1")!;
    expect(f.caminando).toBe(false);
    expect(f.pos).toEqual({ x: s.puestos[1]!.x + 18, y: s.puestos[1]!.y + 22 });
    expect(f.anim).toBe("libre");
  });
});

describe("caminar (JST-96 §4)", () => {
  it("quien queda libre camina del escritorio al descanso a 40 px/s y su puesto queda vacío", () => {
    const { vida, sync, hasta } = banco();
    sync();
    sync({ cambios: { "BET-0": "libre" } });
    const f = vida.fuera("BET-0")!;
    expect(f.caminando).toBe(true);
    expect(f.hacia).toBe("descanso");
    expect(f.pos).toEqual(piesPuesto(sala("BET").puestos[0]!));
    expect(vida.enEscritorio("BET-0")).toBe(false);
    expect(vida.seMueve()).toBe(true);
    let recorrido = 0;
    let antes: Punto = f.pos;
    const anims = new Set<string>();
    const ms = hasta(() => {
      const g = vida.fuera("BET-0")!;
      recorrido += Math.abs(g.pos.x - antes.x) + Math.abs(g.pos.y - antes.y);
      antes = g.pos;
      anims.add(g.anim);
      return !g.caminando;
    });
    // 40 px de arte por segundo (con el redondeo a pixeles enteros).
    expect(Math.abs(recorrido / (ms / 1000) - VELOCIDAD)).toBeLessThan(3);
    expect(ms / 1000).toBeGreaterThan(2);
    expect(ms / 1000).toBeLessThan(10);
    const fin = vida.fuera("BET-0")!;
    expect(fin).toEqual({ pos: piesAsiento(sala("BET").asientos[0]!), anim: "sofa", caminando: false, hacia: null, sofa: true, quieto: false, fila: null, junta: false });
    expect(vida.seMueve()).toBe(false);
    // Camina en las 4 direcciones de los sprites: de espalda al levantarse y de perfil por el pasillo.
    expect(anims.has("caminar-arriba")).toBe(true);
    expect(anims.has("caminar-der")).toBe(true);
  });

  it("quien empieza a trabajar vuelve caminando a su escritorio y se sienta", () => {
    const { vida, sync, hasta } = banco();
    sync({ cambios: { "MIG-5": "libre" } });
    sync({ cambios: {} });
    expect(vida.fuera("MIG-5")?.hacia).toBe("escritorio");
    hasta(() => vida.enEscritorio("MIG-5"));
    expect(vida.enEscritorio("MIG-5")).toBe(true);
    expect(vida.fuera("MIG-5")).toBeNull();
  });

  it("mientras camina se mueve de a poco: nunca salta más de 1 px por cuadro", () => {
    const { vida, sync, avanzar } = banco();
    sync();
    sync({ cambios: { "ELM-3": "libre" } });
    let antes = vida.fuera("ELM-3")!.pos;
    avanzar(8_000, () => {
      const p = vida.fuera("ELM-3")!.pos;
      expect(Math.abs(p.x - antes.x) + Math.abs(p.y - antes.y)).toBeLessThanOrEqual(2);
      antes = p;
    });
  });

  it("los pies van por suelo libre salvo al levantarse y al sentarse", () => {
    const { vida, sync, avanzar } = banco();
    // BET-0 y BET-1 ya ocupan el sofá (ver la prueba del sofá, más abajo): los demás van a asientos de pie.
    sync({ cambios: { "BET-0": "libre", "BET-1": "libre" } });
    sync({ cambios: { "BET-0": "libre", "BET-1": "libre", "BET-2": "libre", "BET-3": "libre", "BET-7": "libre" } });
    const s = sala("BET");
    const r = rejillaDe(s);
    const fuera: string[] = [];
    avanzar(12_000, () => {
      for (const [id, k] of [
        ["BET-2", 2],
        ["BET-3", 3],
        ["BET-7", 7],
      ] as const) {
        const f = vida.fuera(id);
        if (!f?.caminando) continue;
        const sentado = piesPuesto(s.puestos[k]!);
        const salida = salidaPuesto(s.puestos[k]!);
        const levantandose = f.pos.x === salida.x && f.pos.y >= salida.y && f.pos.y <= sentado.y;
        if (!levantandose && !libre(r, f.pos)) fuera.push(`${id} ${f.pos.x},${f.pos.y}`);
      }
    });
    expect(fuera).toEqual([]);
  });

  // El frente del sofá es la franja libre entre el sofá y la mesita, 2 px bajo los pies (10 px más abajo ya es la mesita).
  it("quien va al sofá no pisa la mesita (entra por la franja libre de delante)", () => {
    const { vida, sync, avanzar } = banco();
    sync();
    sync({ cambios: { "BET-0": "libre", "BET-1": "libre" } });
    const s = sala("BET");
    const r = rejillaDe(s);
    const fuera: string[] = [];
    avanzar(12_000, () => {
      for (const [id, k] of [
        ["BET-0", 0],
        ["BET-1", 1],
      ] as const) {
        const f = vida.fuera(id);
        if (!f?.caminando) continue;
        const sentado = piesPuesto(s.puestos[k]!);
        const salida = salidaPuesto(s.puestos[k]!);
        const asiento = piesAsiento(s.asientos[k]!);
        const levantandose = f.pos.x === salida.x && f.pos.y >= salida.y && f.pos.y <= sentado.y;
        const sentandose = f.pos.x === asiento.x && f.pos.y >= asiento.y && f.pos.y <= asiento.y + 2;
        if (!levantandose && !sentandose && !libre(r, f.pos)) fuera.push(`${id} ${f.pos.x},${f.pos.y}`);
      }
    });
    expect(fuera).toEqual([]);
  });

  it("si el estado cambia a mitad de camino, se da vuelta desde donde está", () => {
    const { vida, sync, avanzar, hasta } = banco();
    sync();
    sync({ cambios: { "JST-1": "libre" } });
    avanzar(1_500);
    const medio = vida.fuera("JST-1")!.pos;
    expect(medio).not.toEqual(piesPuesto(sala("JST").puestos[1]!));
    sync({ cambios: {} });
    const vuelta = vida.fuera("JST-1")!;
    expect(vuelta.caminando).toBe(true);
    expect(vuelta.hacia).toBe("escritorio");
    expect(vuelta.pos).toEqual(medio);
    avanzar(16);
    const p = vida.fuera("JST-1")!.pos;
    expect(Math.abs(p.x - medio.x) + Math.abs(p.y - medio.y)).toBeLessThanOrEqual(2);
    const ms = hasta(() => vida.enEscritorio("JST-1"));
    expect(ms).toBeLessThan(3_000);
  });

  it("y al revés: a mitad de camino al escritorio, vuelve al descanso", () => {
    const { vida, sync, avanzar, hasta } = banco();
    sync({ cambios: { "MIG-0": "libre" } });
    const asiento = vida.fuera("MIG-0")!.pos;
    sync({ cambios: {} });
    avanzar(2_000);
    const medio = vida.fuera("MIG-0")!.pos;
    sync({ cambios: { "MIG-0": "libre" } });
    expect(vida.fuera("MIG-0")!.pos).toEqual(medio);
    expect(vida.fuera("MIG-0")!.hacia).toBe("descanso");
    hasta(() => !camina(vida, "MIG-0"));
    expect(vida.fuera("MIG-0")!.pos).toEqual(asiento);
  });

  it(`caminan hasta ${MAX_PISO} a la vez en el piso y ${MAX_SALA} por sala; el resto espera su turno en su escritorio (JST-137)`, () => {
    const { vida, sync } = banco();
    sync();
    sync({ cambios: Object.fromEntries(todos().map((id) => [id, "libre" as Dibujo])) });
    const andan = todos().filter((id) => camina(vida, id));
    expect(andan.length).toBe(MAX_PISO);
    for (const pre of TODAS) expect(andan.filter((id) => id.startsWith(pre)).length).toBeLessThanOrEqual(MAX_SALA);
    // Los demás siguen sentados en su escritorio, sin caminar: ninguno apareció en el descanso.
    for (const id of todos().filter((x) => !andan.includes(x))) {
      expect(vida.enEscritorio(id)).toBe(true);
      expect(vida.fuera(id)).toBeNull();
    }
  });

  it("los asientos son estables: nadie se cambia cuando otro se va, y el que llega toma el primero libre", () => {
    const { vida, sync, hasta } = banco();
    const libres = { "BET-1": "libre", "BET-2": "libre", "BET-3": "libre", "BET-4": "libre" } as Record<string, Dibujo>;
    sync({ cambios: libres });
    const antes = Object.fromEntries(Object.keys(libres).map((id) => [id, vida.fuera(id)!.pos]));
    // BET-2 (asiento 1) se va a trabajar: los demás no se mueven.
    const sin2 = { ...libres };
    delete sin2["BET-2"];
    sync({ cambios: sin2 });
    for (const id of ["BET-1", "BET-3", "BET-4"]) expect(vida.fuera(id)!.pos).toEqual(antes[id]);
    hasta(() => vida.enEscritorio("BET-2"));
    // BET-6 queda libre: toma el asiento 1, el que soltó BET-2.
    sync({ cambios: { ...sin2, "BET-6": "libre" } });
    hasta(() => !camina(vida, "BET-6"));
    expect(vida.fuera("BET-6")!.pos).toEqual(piesAsiento(sala("BET").asientos[1]!));
    for (const id of ["BET-1", "BET-3", "BET-4"]) expect(vida.fuera(id)!.pos).toEqual(antes[id]);
  });

  it("con «reducir movimiento» nadie camina: aparecen en su lugar", () => {
    const { vida, sync, avanzar } = banco();
    sync({ op: { rm: true } });
    sync({ cambios: { "BET-0": "libre", "ELM-1": "libre" } });
    expect(camina(vida, "BET-0")).toBe(false);
    expect(vida.fuera("BET-0")!.pos).toEqual(piesAsiento(sala("BET").asientos[0]!));
    expect(vida.seMueve()).toBe(false);
    sync({ cambios: { "ELM-1": "libre" } });
    expect(vida.enEscritorio("BET-0")).toBe(true);
    avanzar(1_000);
    expect(vida.seMueve()).toBe(false);
  });

  it("al activar «reducir movimiento» a mitad de camino, quien caminaba aparece en su lugar", () => {
    const { vida, sync, avanzar } = banco();
    sync();
    sync({ cambios: { "BET-0": "libre" } });
    avanzar(1_000);
    sync({ op: { rm: true } });
    expect(vida.fuera("BET-0")).toMatchObject({ caminando: false, pos: piesAsiento(sala("BET").asientos[0]!) });
  });

  it("con la pestaña oculta todo se pausa; al volver, quien caminaba aparece donde iba", () => {
    const { vida, sync, avanzar } = banco();
    sync();
    sync({ cambios: { "BET-0": "libre" } });
    avanzar(800);
    sync({ op: { oculta: true } });
    const quieto = vida.fuera("BET-0")!.pos;
    expect(vida.seMueve()).toBe(false);
    expect(vida.proximo()).toBeNull();
    expect(vida.paso(99_999)).toBe(false);
    expect(vida.fuera("BET-0")!.pos).toEqual(quieto);
    // Mientras está oculta, los cambios aparecen en su lugar.
    sync({ cambios: { "BET-0": "libre", "BET-5": "libre" } });
    expect(camina(vida, "BET-5")).toBe(false);
    sync({ op: { oculta: false } });
    expect(vida.fuera("BET-0")).toMatchObject({ caminando: false, pos: piesAsiento(sala("BET").asientos[0]!) });
  });

  it("con un plano nuevo (otro ancho, otra vista) todos aparecen en su lugar", () => {
    const { vida, sync, avanzar } = banco();
    sync();
    sync({ cambios: { "BET-0": "libre" } });
    avanzar(800);
    const ancho = armarPiso(HOY, 640, "computador");
    sync({ plano: ancho });
    expect(vida.fuera("BET-0")).toMatchObject({ caminando: false, pos: piesAsiento(sala("BET", ancho).asientos[0]!) });
    expect(vida.seMueve()).toBe(false);
  });

  it("una sala que no se ve, carga o está a oscuras no tiene a nadie (ni camina ni recibe sobres)", () => {
    const { vida, sync } = banco();
    const sinElm = new Set(["BET", "JST", "MIG"]);
    sync({ activas: sinElm, cambios: { "ELM-0": "libre" } });
    expect(vida.fuera("ELM-0")).toBeNull();
    expect(vida.enEscritorio("ELM-0")).toBe(true);
    expect(vida.entrega("ELM-1", "ELM-2", "ELM-9")).toBe(false);
    expect(vida.sobresDe("ELM", false)).toEqual([]);
    // Vuelve: aparecen en su lugar, sin caminar.
    sync({ activas: TODAS });
    expect(vida.fuera("ELM-0")).toMatchObject({ caminando: false, anim: "sofa" });
    // Un sobre en vuelo en una sala que se apaga desaparece.
    expect(vida.entrega("ELM-1", "ELM-2", "ELM-9")).toBe(true);
    sync({ activas: sinElm });
    expect(vida.sobresDe("ELM", false)).toEqual([]);
  });

  it("avisa a la UI: sube la versión de la sala y despierta al bucle", () => {
    const { vida, sync, avanzar } = banco();
    let despiertos = 0;
    let avisos = 0;
    vida.fijarDespertador(() => (despiertos += 1));
    const quitar = vida.suscribir(() => (avisos += 1));
    sync();
    const v0 = vida.version("BET");
    sync({ cambios: { "BET-0": "libre" } });
    expect(vida.version("BET")).toBeGreaterThan(v0);
    expect(despiertos).toBeGreaterThan(0);
    // `sincronizar` corre mientras React dibuja: no avisa a la UI, solo sube las versiones.
    expect(avisos).toBe(0);
    avanzar(3_000);
    expect(avisos).toBeGreaterThan(0);
    quitar();
  });
});

/** Dónde se ve cada uno (los pies): fuera de su escritorio, o sentado en él. `BET-3` está en el puesto 3 de BET. */
function pies(v: Vida, id: string, piso: PisoPlano = PISO): Punto {
  const f = v.fuera(id);
  if (f) return f.pos;
  const [pre, i] = id.split("-");
  return piesPuesto(sala(pre!, piso).puestos[Number(i)]!);
}

describe("JST-137: quien deja de trabajar siempre camina si la oficina se ve", () => {
  const TODOS = todos();
  /** Avanza cuadro a cuadro y falla si alguien se mueve más de 2 px de arte entre dos cuadros o si caminan más de los que caben. */
  function sinSaltos(b: ReturnType<typeof banco>, ms: number, ids: readonly string[] = TODOS) {
    const antes = new Map(ids.map((id) => [id, pies(b.vida, id)]));
    const caminaron = new Set<string>();
    let maxPiso = 0;
    const saltos: string[] = [];
    b.avanzar(ms, () => {
      const andan = TODOS.filter((id) => camina(b.vida, id));
      maxPiso = Math.max(maxPiso, andan.length);
      for (const pre of TODAS) if (andan.filter((id) => id.startsWith(pre)).length > MAX_SALA) saltos.push(`más de ${MAX_SALA} en ${pre}`);
      for (const id of ids) {
        const p = pies(b.vida, id);
        const a = antes.get(id)!;
        if (Math.abs(p.x - a.x) + Math.abs(p.y - a.y) > 2) saltos.push(`${id} ${JSON.stringify(a)} → ${JSON.stringify(p)}`);
        antes.set(id, p);
        if (camina(b.vida, id)) caminaron.add(id);
      }
    });
    expect(saltos).toEqual([]);
    expect(maxPiso).toBeLessThanOrEqual(MAX_PISO);
    return caminaron;
  }

  it("con el cupo lleno, cada uno espera su turno y después camina: nadie aparece de golpe en el descanso", () => {
    const b = banco();
    b.sync();
    const libres = Object.fromEntries(todos().map((id) => [id, "libre" as Dibujo]));
    b.sync({ cambios: libres });
    const caminaron = sinSaltos(b, 40_000);
    // Los 26 caminaron y terminaron en el descanso.
    expect([...caminaron].sort()).toEqual([...TODOS].sort());
    for (const id of TODOS) {
      expect(b.vida.enEscritorio(id)).toBe(false);
      expect(camina(b.vida, id)).toBe(false);
    }
    expect(b.vida.seMueve()).toBe(false);
  }, 30_000);

  it("con el cupo lleno, quien vuelve a trabajar espera en su asiento del descanso y después camina a su escritorio", () => {
    const b = banco();
    const cinco = ["BET-0", "BET-1", "BET-2", "BET-3", "BET-4"];
    b.sync({ cambios: Object.fromEntries(cinco.map((id) => [id, "libre" as Dibujo])) });
    const asientos = Object.fromEntries(cinco.map((id) => [id, b.vida.fuera(id)!.pos]));
    b.sync({ cambios: {} });
    const andan = cinco.filter((id) => camina(b.vida, id));
    expect(andan).toHaveLength(MAX_SALA);
    // Los otros 2 siguen en su asiento (sentados o de pie), sin caminar.
    for (const id of cinco.filter((x) => !andan.includes(x))) expect(b.vida.fuera(id)).toMatchObject({ caminando: false, pos: asientos[id] });
    const caminaron = sinSaltos(b, 20_000, cinco);
    expect([...caminaron].sort()).toEqual(cinco);
    for (const id of cinco) expect(b.vida.enEscritorio(id)).toBe(true);
  });

  it("si el estado vuelve mientras espera su turno, deja de esperar y se queda donde está", () => {
    const b = banco();
    b.sync();
    const jst = { "JST-0": "libre", "JST-1": "libre", "JST-2": "libre", "JST-3": "libre", "JST-4": "libre" } as Record<string, Dibujo>;
    b.sync({ cambios: jst });
    const esperan = ["JST-3", "JST-4"].filter((id) => !camina(b.vida, id));
    expect(esperan).toHaveLength(2);
    // Uno vuelve a trabajar antes de que le toque: sigue en su escritorio y nunca camina.
    const vuelve = esperan[1]!;
    const resto = { ...jst };
    delete resto[vuelve];
    b.sync({ cambios: resto });
    let camino = false;
    b.avanzar(20_000, () => {
      if (camina(b.vida, vuelve)) camino = true;
    });
    expect(camino).toBe(false);
    expect(b.vida.enEscritorio(vuelve)).toBe(true);
    expect(b.vida.enEscritorio(esperan[0]!)).toBe(false);
  });

  it("una sala que se apaga y vuelve no mueve a nadie: queda quieta como estaba y quien cambió mientras camina al volver", () => {
    const b = banco();
    b.sync({ cambios: { "ELM-0": "libre", "ELM-1": "libre" } });
    // ELM-2 queda libre y camina; a mitad de camino, la lectura de ELM falla y la sala se apaga.
    b.sync({ cambios: { "ELM-0": "libre", "ELM-1": "libre", "ELM-2": "libre" } });
    b.avanzar(800);
    expect(camina(b.vida, "ELM-2")).toBe(true);
    const sinElm = new Set(["BET", "JST", "MIG"]);
    b.sync({ activas: sinElm });
    const antes = Object.fromEntries(["ELM-0", "ELM-1", "ELM-2", "ELM-3"].map((id) => [id, pies(b.vida, id)]));
    // Mientras está a oscuras nada se mueve (ni ELM-2, que iba caminando) y el bucle no corre por ella.
    expect(b.vida.seMueve()).toBe(false);
    b.avanzar(5_000);
    for (const id of Object.keys(antes)) expect(pies(b.vida, id)).toEqual(antes[id]);
    // ELM-3 deja de trabajar con la sala a oscuras (no se sabe hasta que vuelve).
    b.sync({ cambios: { "ELM-0": "libre", "ELM-1": "libre", "ELM-2": "libre", "ELM-3": "libre" } });
    b.sync({ activas: TODAS });
    // Vuelve: cada uno donde estaba; ELM-2 sigue caminando desde ahí y ELM-3 sale de su escritorio.
    for (const id of Object.keys(antes)) expect(pies(b.vida, id)).toEqual(antes[id]);
    expect(b.vida.fuera("ELM-2")).toMatchObject({ caminando: true, hacia: "descanso" });
    expect(b.vida.fuera("ELM-3")).toMatchObject({ caminando: true, hacia: "descanso" });
    sinSaltos(b, 10_000, ["ELM-0", "ELM-1", "ELM-2", "ELM-3"]);
    expect(b.vida.fuera("ELM-2")).toMatchObject({ caminando: false, pos: piesAsiento(sala("ELM").asientos[2]!) });
    expect(b.vida.fuera("ELM-3")!.caminando).toBe(false);
  });

  it("si el estado cambia con la sala a oscuras, quien caminaba se da vuelta desde donde quedó cuando vuelve", () => {
    const b = banco();
    b.sync();
    b.sync({ cambios: { "MIG-2": "libre" } });
    b.avanzar(1_000);
    const sinMig = new Set(["BET", "ELM", "JST"]);
    b.sync({ activas: sinMig });
    const quedo = pies(b.vida, "MIG-2");
    // Vuelve a trabajar mientras la sala está a oscuras.
    b.sync({ cambios: {} });
    b.sync({ activas: TODAS });
    expect(b.vida.fuera("MIG-2")).toMatchObject({ caminando: true, hacia: "escritorio", pos: quedo });
    sinSaltos(b, 10_000, ["MIG-2"]);
    expect(b.vida.enEscritorio("MIG-2")).toBe(true);
  });

  it("si la sala se apaga mientras alguien espera su turno, sigue esperando y camina cuando vuelve", () => {
    const b = banco();
    b.sync();
    const jst = { "JST-0": "libre", "JST-1": "libre", "JST-2": "libre", "JST-3": "libre" } as Record<string, Dibujo>;
    b.sync({ cambios: jst });
    const espera = Object.keys(jst).find((id) => !camina(b.vida, id))!;
    expect(b.vida.enEscritorio(espera)).toBe(true);
    b.sync({ activas: new Set(["BET", "ELM", "MIG"]) });
    b.avanzar(10_000);
    // Quieto en su escritorio mientras la sala está a oscuras (los otros 3, quietos a mitad de camino).
    expect(b.vida.enEscritorio(espera)).toBe(true);
    b.sync({ activas: TODAS });
    expect(b.vida.enEscritorio(espera)).toBe(true);
    const caminaron = sinSaltos(b, 20_000, Object.keys(jst));
    expect(caminaron.has(espera)).toBe(true);
    for (const id of Object.keys(jst)) expect(b.vida.enEscritorio(id)).toBe(false);
  });

  it("una conversación cortada porque la sala se apaga: al volver, cada uno camina de vuelta a su asiento", () => {
    const b = banco();
    b.sync({ cambios: { "JST-0": "libre", "JST-1": "libre" } });
    const asientos = { "JST-0": pies(b.vida, "JST-0"), "JST-1": pies(b.vida, "JST-1") };
    // Se arma a mano: los dos caminan al lugar de la conversación.
    const v = b.vida as unknown as { empezarCharla: (s: unknown, a: unknown, c: unknown, t: number, g: () => unknown) => boolean; salas: Map<string, unknown>; personas: Map<string, unknown> };
    const lineas = [{ quien: "JST-0", texto: "a", codigo: null, titulo: null }, { quien: "JST-1", texto: "b", codigo: null, titulo: null }];
    expect(v.empezarCharla(v.salas.get("JST"), v.personas.get("JST-0"), v.personas.get("JST-1"), b.reloj.t, () => ({ tema: "broma", variante: "broma-1", lineas }))).toBe(true);
    b.hasta(() => !camina(b.vida, "JST-0") && !camina(b.vida, "JST-1"));
    const juntos = { "JST-0": pies(b.vida, "JST-0"), "JST-1": pies(b.vida, "JST-1") };
    expect(juntos["JST-0"]).not.toEqual(asientos["JST-0"]);
    b.sync({ activas: new Set(["BET", "ELM", "MIG"]) });
    expect(charlas(b.vida)).toHaveLength(0);
    // Quedan donde conversaban; al volver, caminan a su asiento.
    b.sync({ activas: TODAS });
    for (const id of ["JST-0", "JST-1"] as const) expect(pies(b.vida, id)).toEqual(juntos[id]);
    sinSaltos(b, 10_000, ["JST-0", "JST-1"]);
    for (const id of ["JST-0", "JST-1"] as const) expect(b.vida.fuera(id)).toMatchObject({ caminando: false, pos: asientos[id] });
  });

  it("al volver a la pestaña, lo que trae la relectura aparece en su lugar y lo que cambia después camina, aunque no hayan pasado 2,5 s", () => {
    const b = banco();
    b.sync();
    b.sync({ op: { oculta: true } });
    // Vuelve: el sincronizador relee todo. Mientras esa lectura no llega, nadie camina.
    b.sync({ op: { oculta: false, releyendo: true } });
    b.avanzar(160);
    b.sync({ cambios: { "BET-0": "libre" } });
    expect(b.vida.fuera("BET-0")).toMatchObject({ caminando: false });
    // Llega la relectura con lo que cambió mientras estaba oculta: aparece en su lugar.
    b.avanzar(160);
    b.sync({ cambios: { "BET-0": "libre", "BET-1": "libre" }, op: { releyendo: false } });
    expect(b.vida.fuera("BET-1")).toMatchObject({ caminando: false });
    // 300 ms después (a menos de 2,5 s de volver), BET-2 deja de trabajar: camina.
    b.avanzar(300);
    b.sync({ cambios: { "BET-0": "libre", "BET-1": "libre", "BET-2": "libre" } });
    expect(b.vida.fuera("BET-2")).toMatchObject({ caminando: true, hacia: "descanso" });
  });

  it("sin relectura (la vigía dejó el canal abierto, o se cerró el modo TV), lo que cambia justo después de volver camina", () => {
    const b = banco();
    b.sync();
    b.sync({ op: { oculta: true } });
    b.sync({ op: { oculta: false, releyendo: false } });
    b.avanzar(100);
    b.sync({ cambios: { "MIG-0": "libre" } });
    expect(b.vida.fuera("MIG-0")).toMatchObject({ caminando: true });
  });

  it("si la relectura tarda (red lenta), lo que trae aparece igual en su lugar; si se cuelga, a los 10 s lo que cambia camina", () => {
    const b = banco();
    b.sync();
    b.sync({ op: { oculta: true } });
    b.sync({ op: { oculta: false, releyendo: true } });
    b.avanzar(4_000);
    b.sync({ cambios: { "JST-0": "libre" }, op: { releyendo: false } });
    expect(b.vida.fuera("JST-0")).toMatchObject({ caminando: false });
    // Otra vuelta, y la relectura no llega nunca.
    b.sync({ op: { oculta: true } });
    b.sync({ op: { oculta: false, releyendo: true } });
    b.avanzar(10_100);
    b.sync({ cambios: { "JST-0": "libre", "JST-1": "libre" } });
    expect(b.vida.fuera("JST-1")).toMatchObject({ caminando: true });
  });

  it("con la pestaña oculta, quien esperaba su turno aparece donde iba al volver (como quien caminaba)", () => {
    const b = banco();
    b.sync();
    b.sync({ cambios: { "JST-0": "libre", "JST-1": "libre", "JST-2": "libre", "JST-3": "libre" } });
    const espera = ["JST-0", "JST-1", "JST-2", "JST-3"].find((id) => !camina(b.vida, id))!;
    b.sync({ op: { oculta: true } });
    b.sync({ op: { oculta: false } });
    expect(b.vida.fuera(espera)).toMatchObject({ caminando: false });
    expect(b.vida.enEscritorio(espera)).toBe(false);
    expect(b.vida.seMueve()).toBe(false);
  });

  it("con «reducir movimiento» nadie espera: quien esperaba su turno aparece en su lugar", () => {
    const b = banco();
    b.sync();
    b.sync({ cambios: { "JST-0": "libre", "JST-1": "libre", "JST-2": "libre", "JST-3": "libre" } });
    b.sync({ op: { rm: true } });
    for (const id of ["JST-0", "JST-1", "JST-2", "JST-3"]) expect(b.vida.fuera(id)).toMatchObject({ caminando: false });
    expect(b.vida.seMueve()).toBe(false);
  });
});

describe("el sobre (JST-96 §5)", () => {
  it("sube por el pasillo, recorre el muro con su código debajo y baja; dura de 1 a 1,8 s; si quien recibe está sentado, se abre", () => {
    const { vida, sync, hasta, avanzar } = banco();
    sync();
    expect(vida.entrega("BET-0", "BET-7", "BET-50")).toBe(true);
    const s0 = vida.sobresDe("BET", false)[0]!;
    expect(s0).toMatchObject({ fase: "vuela", codigo: "BET-50", etiqueta: null });
    const etiquetas: Array<[number, string | null]> = [];
    const ms = hasta(() => {
      const s = vida.sobresDe("BET", false)[0]!;
      if (s.fase === "vuela") etiquetas.push([s.pos.y, s.etiqueta]);
      return s.fase !== "vuela";
    });
    expect(ms).toBeGreaterThanOrEqual(1_000);
    expect(ms).toBeLessThanOrEqual(1_800 + 32);
    // El código solo se ve en el muro (y < 20), debajo del sobre; por los pasillos no.
    expect(etiquetas.some(([, e]) => e === "muro")).toBe(true);
    for (const [y, e] of etiquetas) expect(e).toBe(y < 20 ? "muro" : null);
    const llega = vida.sobresDe("BET", false)[0]!;
    expect(llega.fase).toBe("llega");
    // Quien recibe está sentado: su globo dice el código, el sobre no lo repite.
    expect(llega.etiqueta).toBeNull();
    expect(llega.pos).toEqual({ x: sala("BET").puestos[7]!.x + 15, y: sala("BET").puestos[7]!.y + 15 });
    avanzar(272);
    expect(vida.sobresDe("BET", false)[0]!.fase).toBe("abre");
    avanzar(352);
    expect(vida.sobresDe("BET", false)).toEqual([]);
  });

  it("si quien recibe está en el descanso (y la mesa, ocupada), el sobre lo espera en su escritorio con el código arriba, y se abre cuando se sienta", () => {
    const { vida, sync, hasta, avanzar } = banco();
    sync({ cambios: { "MIG-6": "libre", "MIG-5": "libre" } });
    ocuparMesa(vida, "MIG-1", "MIG-5");
    vida.entrega("MIG-0", "MIG-6", "MIG-21");
    hasta(() => vida.sobresDe("MIG", false)[0]?.fase === "espera");
    const s = vida.sobresDe("MIG", false)[0]!;
    expect(s.etiqueta).toBe("arriba");
    avanzar(5_000);
    expect(vida.sobresDe("MIG", false)[0]!.fase).toBe("espera");
    // Le dan esa tarea: vuelve caminando con ese código en su globo, y el sobre no lo repite.
    sync({ cambios: {}, codigos: { "MIG-6": "MIG-21" } });
    expect(camina(vida, "MIG-6")).toBe(true);
    expect(vida.sobresDe("MIG", false)[0]!.etiqueta).toBeNull();
    hasta(() => vida.enEscritorio("MIG-6"));
    avanzar(32);
    expect(vida.sobresDe("MIG", false)[0]?.fase).toBe("abre");
    avanzar(400);
    expect(vida.sobresDe("MIG", false)).toEqual([]);
  });

  it("si viene caminando con otro código en su globo, el sobre sí muestra el suyo", () => {
    const { vida, sync, hasta } = banco();
    sync({ cambios: { "MIG-6": "libre", "MIG-5": "libre" } });
    ocuparMesa(vida, "MIG-1", "MIG-5");
    vida.entrega("MIG-0", "MIG-6", "MIG-21");
    hasta(() => vida.sobresDe("MIG", false)[0]?.fase === "espera");
    sync({ cambios: { "MIG-5": "libre" }, codigos: { "MIG-6": "MIG-3" } });
    expect(camina(vida, "MIG-6")).toBe(true);
    expect(vida.sobresDe("MIG", false)[0]!.etiqueta).toBe("arriba");
  });

  it("a los 60 s de llegar, el sobre que espera desaparece igual", () => {
    const { vida, sync, hasta, avanzar } = banco();
    sync({ cambios: { "JST-3": "libre", "JST-4": "libre" } });
    ocuparMesa(vida, "JST-1", "JST-4");
    vida.entrega("JST-0", "JST-3", "JST-98");
    hasta(() => vida.sobresDe("JST", false)[0]?.fase === "espera");
    avanzar(59_000);
    expect(vida.sobresDe("JST", false)).toHaveLength(1);
    avanzar(1_500);
    expect(vida.sobresDe("JST", false)).toEqual([]);
  });

  it("a 1x no hay etiqueta en ninguna fase", () => {
    const { vida, sync, avanzar } = banco();
    sync({ cambios: { "BET-7": "libre", "BET-6": "libre" } });
    ocuparMesa(vida, "BET-3", "BET-6");
    vida.entrega("BET-0", "BET-7", "BET-50");
    avanzar(4_000, () => {
      for (const s of vida.sobresDe("BET", true)) expect(s.etiqueta).toBeNull();
    });
    expect(vida.sobresDe("BET", true)[0]!.fase).toBe("espera");
  });

  it("no hay sobre entre salas distintas, a uno mismo, mientras carga, con la pestaña oculta ni con agentes que no están", () => {
    const { vida, sync } = banco();
    sync();
    expect(vida.entrega("BET-0", "ELM-0", "BET-1")).toBe(false);
    expect(vida.entrega("BET-0", "BET-0", "BET-1")).toBe(false);
    expect(vida.entrega("BET-0", "nadie", "BET-1")).toBe(false);
    sync({ op: { cargando: true } });
    expect(vida.entrega("BET-0", "BET-1", "BET-1")).toBe(false);
    sync({ op: { cargando: false, oculta: true } });
    expect(vida.entrega("BET-0", "BET-1", "BET-1")).toBe(false);
    for (const pre of TODAS) expect(vida.sobresDe(pre, false)).toEqual([]);
  });

  it("varios sobres van cada uno por su cuenta", () => {
    const { vida, sync } = banco();
    sync();
    vida.entrega("BET-0", "BET-7", "BET-50");
    vida.entrega("BET-1", "BET-2", "BET-51");
    vida.entrega("BET-3", "BET-8", "BET-52");
    expect(vida.sobresDe("BET", false).map((s) => s.codigo)).toEqual(["BET-50", "BET-51", "BET-52"]);
  });

  it("con «reducir movimiento» no vuela: aparece quieto en el escritorio de quien recibe y se va 4 s después de que se siente", () => {
    const { vida, sync, avanzar } = banco();
    sync({ op: { rm: true }, cambios: { "ELM-2": "libre" } });
    vida.entrega("ELM-0", "ELM-2", "ELM-5");
    const s = vida.sobresDe("ELM", false)[0]!;
    expect(s.fase).toBe("espera");
    expect(s.etiqueta).toBe("arriba");
    expect(s.pos).toEqual({ x: sala("ELM").puestos[2]!.x + 15, y: sala("ELM").puestos[2]!.y + 15 });
    expect(vida.seMueve()).toBe(false);
    avanzar(10_000);
    expect(vida.sobresDe("ELM", false)).toHaveLength(1);
    sync({ cambios: {} });
    expect(vida.sobresDe("ELM", false)[0]!.etiqueta).toBeNull();
    avanzar(3_800);
    expect(vida.sobresDe("ELM", false)).toHaveLength(1);
    avanzar(400);
    expect(vida.sobresDe("ELM", false)).toEqual([]);
  });

  it("al volver a la pestaña, los sobres en vuelo se descartan y los que esperaban siguen", () => {
    const { vida, sync, hasta } = banco();
    sync({ cambios: { "BET-7": "libre", "BET-6": "libre" } });
    ocuparMesa(vida, "BET-3", "BET-6");
    vida.entrega("BET-0", "BET-7", "BET-50");
    hasta(() => vida.sobresDe("BET", false)[0]?.fase === "espera");
    vida.entrega("BET-1", "BET-2", "BET-51");
    sync({ op: { oculta: true } });
    sync({ op: { oculta: false } });
    expect(vida.sobresDe("BET", false).map((s) => [s.codigo, s.fase])).toEqual([["BET-50", "espera"]]);
  });
});

describe("conversaciones en el descanso (0.4.0, JST-162 · B · Pregunta y respuesta)", () => {
  const T: Record<string, Temas> = {
    "JST-0": { hecho: "JST-91", tituloHecho: "Re-QA de «Oficina global» 0.1.5 en la copia", sigue: { codigo: "JST-98", estado: "todo" }, enCola: 1 },
    "JST-1": { hecho: "JST-77", sigue: { codigo: "JST-90", estado: "blocked" }, enCola: 2 },
    "JST-2": { hecho: null, sigue: null, enCola: 0 },
    "BET-0": { hecho: "BET-1", sigue: null, enCola: 0 },
    "BET-1": { hecho: null, sigue: { codigo: "BET-2", estado: "in_review" }, enCola: 1 },
  };
  /**
   * Como el `LectorTemas` de la página: lo leído se guarda 10 min y `guardado` no lee nada. Cuenta las lecturas
   * (cada `leer` son como mucho 2 llamadas: la terminada y la cola).
   */
  function temasFalsos(datos: Record<string, Temas> = T, reloj?: { t: number }, falla = false) {
    const leidos: Array<{ id: string; t: number }> = [];
    const cache = new Map<string, number>();
    const fuente: FuenteTemas & { leidos: typeof leidos; datos: Record<string, Temas> } = {
      leidos,
      datos,
      leer: async (a) => {
        leidos.push({ id: a.id, t: reloj?.t ?? 0 });
        if (falla) throw new Error("500");
        cache.set(a.id, (reloj?.t ?? 0) + CACHE_TEMAS_MS);
        return fuente.datos[a.id] ?? { hecho: null, sigue: null };
      },
      guardado: (id) => ((cache.get(id) ?? -Infinity) > (reloj?.t ?? 0) ? (fuente.datos[id] ?? { hecho: null, sigue: null }) : null),
    };
    return fuente;
  }
  /** Una fuente que ya tiene todo guardado (no lee nada). */
  const guardados = (datos: Record<string, Temas> = T): FuenteTemas & { leidos: string[] } => {
    const leidos: string[] = [];
    return { leidos, leer: async (a) => (leidos.push(a.id), datos[a.id] ?? { hecho: null, sigue: null }), guardado: (id) => datos[id] ?? null };
  };
  const CON: Partial<OpcionesVida> = { charlas: true };
  const dosLibres = { "JST-0": "libre", "JST-1": "libre" } as Record<string, Dibujo>;
  const tresLibres = { ...dosLibres, "JST-2": "libre" } as Record<string, Dibujo>;

  it("al abrir, dos libres de la sala se juntan a los 5–10 s al medio del descanso, conversan por turnos y vuelven a su asiento", async () => {
    const temas = guardados();
    const { vida, sync, hastaAsync, hasta, reloj } = banco(temas);
    sync({ op: CON, cambios: dosLibres });
    const asientos = { "JST-0": vida.fuera("JST-0")!.pos, "JST-1": vida.fuera("JST-1")!.pos };
    const ms = await hastaAsync(() => charlas(vida).length > 0, 30_000);
    expect(ms).toBeGreaterThanOrEqual(5_000);
    expect(ms).toBeLessThanOrEqual(10_000 + 32);
    // Tenían sus temas guardados: no se leyó nada.
    expect(temas.leidos).toEqual([]);
    hasta(() => !camina(vida, "JST-0") && !camina(vida, "JST-1"));
    const p0 = vida.fuera("JST-0")!.pos;
    const p1 = vida.fuera("JST-1")!.pos;
    expect(Math.abs(p0.x - p1.x)).toBe(16);
    expect(p0.y).toBe(p1.y);
    // Más abajo que antes: a 44 px de arte del techo del descanso o más (caben los 2 globos del hilo).
    expect(p0.y - sala("JST").descanso.y).toBeGreaterThanOrEqual(44);
    const [izq, der] = p0.x < p1.x ? ["JST-0", "JST-1"] : ["JST-1", "JST-0"];
    expect(vida.fuera(izq)!.anim.endsWith("-der")).toBe(true);
    expect(vida.fuera(der)!.anim.endsWith("-izq")).toBe(true);
    // Las frases: la primera 300 ms después de llegar; cada una su duración + 350 ms; nunca un cuadro sin globo.
    const llegada = reloj.t;
    const vistos: Array<{ clave: string; desde: number; v: VistaCharla }> = [];
    let huecos = 0;
    hasta(() => {
      const c = vida.charlaDe("JST");
      if (c && vistos.at(-1)?.clave !== c.clave) vistos.push({ clave: c.clave, desde: reloj.t - llegada, v: c });
      if (!c && vistos.length > 0 && charlas(vida).length > 0) huecos += 1;
      if (c) expect(vida.fuera(c.quien)!.anim.startsWith("charlar-")).toBe(true);
      return charlas(vida).length === 0;
    }, 30_000);
    const fin = reloj.t - llegada;
    expect(huecos).toBe(0);
    expect(vistos.length).toBeGreaterThanOrEqual(2);
    expect(vistos.length).toBeLessThanOrEqual(4);
    expect(Math.abs(vistos[0]!.desde - PRIMERA_FRASE_MS)).toBeLessThanOrEqual(16);
    const durs = vistos.map((x) => duracionFrase(x.v.actual.linea));
    for (let i = 1; i < vistos.length; i++) expect(Math.abs(vistos[i]!.desde - vistos[i - 1]!.desde - durs[i - 1]! - ENTRE_FRASES_MS)).toBeLessThanOrEqual(16);
    expect(Math.abs(fin - vistos.at(-1)!.desde - durs.at(-1)! - ENTRE_FRASES_MS)).toBeLessThanOrEqual(16);
    // El hilo: la primera va sola; desde la segunda, la anterior arriba. Se turnan, y cada globo va al lado de quien lo dice.
    expect(vistos[0]!.v.anterior).toBeNull();
    for (let i = 1; i < vistos.length; i++) {
      expect(vistos[i]!.v.anterior).toEqual(vistos[i - 1]!.v.actual);
      expect(vistos[i]!.v.actual.quien).not.toBe(vistos[i - 1]!.v.actual.quien);
    }
    for (const { v } of vistos) {
      expect(v.actual.lado).toBe(v.actual.quien === izq ? "izq" : "der");
      expect(v.centro.x).toBe(Math.round((p0.x + p1.x) / 2));
      expect(v.centro.y).toBe(p0.y - 25);
    }
    // Vuelven caminando al mismo asiento.
    expect(vida.fuera("JST-0")!.hacia).toBe("descanso");
    hasta(() => !camina(vida, "JST-0") && !camina(vida, "JST-1"));
    expect(vida.fuera("JST-0")!.pos).toEqual(asientos["JST-0"]);
    expect(vida.fuera("JST-1")!.pos).toEqual(asientos["JST-1"]);
  });

  it("como mucho 3 a la vez en el piso y 1 por sala", async () => {
    const { vida, sync, avanzarAsync } = banco(guardados());
    sync({ op: CON, cambios: { "BET-0": "libre", "BET-1": "libre", "BET-2": "libre", "ELM-0": "libre", "ELM-1": "libre", "MIG-0": "libre", "MIG-1": "libre", ...tresLibres } });
    let max = 0;
    const salas = new Set<string>();
    await avanzarAsync(5 * 60_000, () => {
      const c = charlas(vida);
      for (const x of c) salas.add(x.prefijo);
      max = Math.max(max, c.length);
      expect(c.length).toBeLessThanOrEqual(3);
      expect(new Set(c.map((x) => x.prefijo)).size).toBe(c.length);
    });
    expect(max).toBe(3);
    expect(salas).toEqual(new Set(["BET", "ELM", "JST", "MIG"]));
  }, 30_000);

  /** Cuándo empieza y termina cada conversación en `ms` de reloj, y con quiénes. */
  async function conversaciones(ms: number, libres: Record<string, Dibujo>, temas: FuenteTemas = guardados()) {
    const b = banco(temas);
    b.sync({ op: CON, cambios: libres });
    const inicios: Array<{ t: number; par: string }> = [];
    const fines: number[] = [];
    let antes = 0;
    await b.avanzarAsync(ms, () => {
      const c = charlas(b.vida);
      if (c.length > antes) inicios.push({ t: b.reloj.t, par: [c[0]!.a, c[0]!.b].sort().join("|") });
      if (c.length < antes) fines.push(b.reloj.t);
      antes = c.length;
    });
    return { inicios, fines, ...b };
  }

  it("la misma pareja vuelve a hablar a los 2 min o más (hoy, 10 min)", async () => {
    const { inicios } = await conversaciones(10 * 60_000, dosLibres);
    expect(inicios.length).toBeGreaterThanOrEqual(4);
    for (let k = 1; k < inicios.length; k++) {
      expect(inicios[k]!.t - inicios[k - 1]!.t).toBeGreaterThanOrEqual(PAREJA_MS);
      // Y no mucho más: después de los 2 min, a los 15–30 s de que vuelva a buscar.
      expect(inicios[k]!.t - inicios[k - 1]!.t).toBeLessThanOrEqual(PAREJA_MS + 30_000 + 32);
    }
  }, 30_000);

  it("con 3 libres sale una cada ~35–50 s en su sala: la sala descansa 20 s y otra pareja busca cada 15–30 s (en un descanso ancho, JST-172)", async () => {
    // En el descanso angosto de JSTM, la pareja que le taparía la cabeza al tercero no conversa (la prueba que sigue).
    const { inicios, fines } = await conversaciones(10 * 60_000, { "BET-0": "libre", "BET-1": "libre", "BET-2": "libre" });
    expect(inicios.length).toBeGreaterThanOrEqual(10);
    for (let k = 1; k < inicios.length; k++) {
      const pausa = inicios[k]!.t - fines[k - 1]!;
      expect(pausa).toBeGreaterThanOrEqual(SALA_MS);
      expect(pausa).toBeLessThanOrEqual(SALA_MS + 30_000 + 32);
    }
    // Se turnan las 3 parejas.
    expect(new Set(inicios.map((x) => x.par)).size).toBe(3);
  }, 30_000);

  /** Las conversaciones vivas con su hilo (interno: para medir). */
  const conCaja = (v: Vida) => charlas(v) as unknown as Array<{ prefijo: string; a: string; b: string; fase: string; caja: CajaHilo; lineas: Linea[] }>;

  it("el hilo no le tapa la cabeza a quien no conversa: 3 libres en el descanso angosto de JSTM, desde la 2.ª frase (JST-172)", async () => {
    const b = banco(guardados());
    b.sync({ op: CON, cambios: tresLibres });
    const d = sala("JST").descanso;
    const vistas = new Set<number>();
    let cuadros = 0;
    await b.avanzarAsync(10 * 60_000, () => {
      const c = b.vida.charlaDe("JST");
      const ch = conCaja(b.vida).find((x) => x.prefijo === "JST");
      if (!c || !ch) return;
      vistas.add(c.id);
      // Lo que mide el hilo de esta frase (con la anterior arriba) cabe en lo que se reservó al juntarse.
      const ahora = cajaHilo(d, c.centro, tamanoHilo(c.anterior ? [c.anterior.linea, c.actual.linea] : [c.actual.linea], d.w));
      expect(ahora[1]).toBeGreaterThanOrEqual(ch.caja[1]);
      for (const id of Object.keys(tresLibres)) {
        if (id === ch.a || id === ch.b) continue;
        expect(tapaA(ahora, [b.vida.fuera(id)!.pos]), `${id} bajo «${c.actual.linea.texto}»`).toBe(false);
        cuadros += 1;
      }
    });
    expect(cuadros).toBeGreaterThan(0);
    // Siguen conversando (como mucho, 2 parejas que se turnan cada 2 min: la del sofá le taparía la cabeza a quien está de pie detrás).
    expect(vistas.size).toBeGreaterThanOrEqual(6);
  }, 30_000);

  it("si no hay dónde juntarse sin tapar a nadie, no conversan: no caminan y el guion no cuenta (JST-172)", () => {
    const b = banco(guardados());
    b.sync({ op: CON, cambios: tresLibres });
    // JST-0 y JST-1 en el sofá; JST-2 de pie detrás (196, 86): en el descanso de 76 no hay dónde.
    expect(b.vida.fuera("JST-2")!.pos).toEqual({ x: 196, y: 86 });
    const v = b.vida as unknown as { empezarCharla: (s: unknown, a: unknown, c: unknown, t: number, g: () => unknown) => boolean; salas: Map<string, unknown>; personas: Map<string, unknown> };
    const lineas = [{ quien: "JST-0", texto: "¿Otra reunión?", codigo: null, titulo: null }, { quien: "JST-1", texto: "Pudo haber sido un correo.", codigo: null, titulo: null }];
    let pedidos = 0;
    expect(v.empezarCharla(v.salas.get("JST"), v.personas.get("JST-0"), v.personas.get("JST-1"), b.reloj.t, () => (pedidos++, { tema: "broma", variante: "broma-4", lineas }))).toBe(false);
    expect(pedidos).toBe(1);
    expect(charlas(b.vida)).toHaveLength(0);
    expect(camina(b.vida, "JST-0") || camina(b.vida, "JST-1")).toBe(false);
    // Con JST-2 en su escritorio, sí.
    b.sync({ op: CON, cambios: dosLibres });
    expect(v.empezarCharla(v.salas.get("JST"), v.personas.get("JST-0"), v.personas.get("JST-1"), b.reloj.t, () => ({ tema: "broma", variante: "broma-4", lineas }))).toBe(true);
  });

  it("quien llega al descanso mientras conversan no se sienta donde el hilo le taparía la cabeza (JST-172)", () => {
    const b = banco(guardados());
    b.sync({ op: CON, cambios: dosLibres });
    const v = b.vida as unknown as { empezarCharla: (s: unknown, a: unknown, c: unknown, t: number, g: () => unknown) => boolean; salas: Map<string, unknown>; personas: Map<string, unknown> };
    const lineas = [{ quien: "JST-0", texto: "¿Otra reunión?", codigo: null, titulo: null }, { quien: "JST-1", texto: "Pudo haber sido un correo.", codigo: null, titulo: null }];
    expect(v.empezarCharla(v.salas.get("JST"), v.personas.get("JST-0"), v.personas.get("JST-1"), b.reloj.t, () => ({ tema: "broma", variante: "broma-4", lineas }))).toBe(true);
    const ch = conCaja(b.vida)[0]!;
    // El primer asiento libre es el del sofá que dejó JST-0, y el hilo le taparía la cabeza a quien se siente ahí.
    const sofa = piesAsiento(sala("JST").asientos[0]!);
    expect(tapaA(ch.caja, [sofa])).toBe(true);
    b.sync({ op: CON, cambios: tresLibres });
    b.hasta(() => !camina(b.vida, "JST-2"));
    const llego = b.vida.fuera("JST-2")!.pos;
    expect(llego).not.toEqual(sofa);
    expect(tapaA(ch.caja, [llego])).toBe(false);
  });

  it("las lecturas no se multiplican: cada agente se lee como mucho una vez cada 10 min y en el piso, una pareja por minuto (como la 0.3.8)", async () => {
    const reloj = { t: 1_000 };
    const temas = temasFalsos(T, reloj);
    const b = banco(temas, reloj);
    // 20 libres en las 4 salas: hablan casi todo el tiempo.
    const muchos = Object.fromEntries(
      [...["BET-0", "BET-1", "BET-2", "BET-3", "BET-4", "BET-5"], ...["ELM-0", "ELM-1", "ELM-2"], ...["JST-0", "JST-1", "JST-2", "JST-3"], ...["MIG-0", "MIG-1", "MIG-2", "MIG-3", "MIG-4", "MIG-5", "MIG-6"]].map((id) => [id, "libre" as Dibujo]),
    );
    b.sync({ op: CON, cambios: muchos });
    let n = 0;
    let antes = 0;
    await b.avanzarAsync(30 * 60_000, () => {
      const c = charlas(b.vida).length;
      if (c > antes) n += c - antes;
      antes = c;
    });
    expect(n).toBeGreaterThanOrEqual(80);
    // Cada agente, como mucho una vez cada 10 min.
    const porAgente = new Map<string, number[]>();
    for (const l of temas.leidos) porAgente.set(l.id, [...(porAgente.get(l.id) ?? []), l.t]);
    for (const ts of porAgente.values()) {
      expect(ts.length).toBeLessThanOrEqual(3);
      for (let k = 1; k < ts.length; k++) expect(ts[k]! - ts[k - 1]!).toBeGreaterThanOrEqual(CACHE_TEMAS_MS);
    }
    // En el piso: como mucho una pareja por minuto (2 agentes, 4 llamadas), en cualquier minuto.
    const ts = temas.leidos.map((l) => l.t).sort((x, y) => x - y);
    for (const t of ts) expect(ts.filter((x) => x >= t && x < t + PEDIR_TEMAS_MS).length).toBeLessThanOrEqual(2);
    expect((ts.length * 2) / 30).toBeLessThanOrEqual(4);
    // Con el tiempo se leen casi todos (sus temas llegan a las conversaciones).
    expect(porAgente.size).toBeGreaterThanOrEqual(16);
  }, 60_000);

  it("si la lectura falla, no se vuelve a pedir antes de 10 min, y siguen conversando (de la oficina o con una broma)", async () => {
    const reloj = { t: 1_000 };
    const temas = temasFalsos(T, reloj, true);
    const b = banco(temas, reloj);
    b.sync({ op: CON, cambios: tresLibres });
    let n = 0;
    let antes = 0;
    const temasDichos = new Set<string>();
    await b.avanzarAsync(12 * 60_000, () => {
      const c = charlas(b.vida);
      if (c.length > antes) n += 1;
      antes = c.length;
      for (const x of c as unknown as Array<{ lineas: Array<{ codigo: string | null }> }>) for (const l of x.lineas) if (l.codigo) temasDichos.add(l.codigo);
    });
    expect(n).toBeGreaterThanOrEqual(8);
    // Sin temas guardados, nunca hablan de lo que terminaron ni de su cola.
    expect([...temasDichos].filter((c) => c.startsWith("JST-9") || c.startsWith("JST-7"))).toEqual([]);
    const porAgente = new Map<string, number[]>();
    for (const l of temas.leidos) porAgente.set(l.id, [...(porAgente.get(l.id) ?? []), l.t]);
    for (const ts of porAgente.values()) {
      expect(ts.length).toBeLessThanOrEqual(2);
      for (let k = 1; k < ts.length; k++) expect(ts[k]! - ts[k - 1]!).toBeGreaterThanOrEqual(CACHE_TEMAS_MS);
    }
  }, 30_000);

  it("la conversación no espera la lectura: la primera sale igual y pide los temas de los dos para la próxima", async () => {
    const reloj = { t: 1_000 };
    const temas = temasFalsos(T, reloj);
    const b = banco(temas, reloj);
    b.sync({ op: CON, cambios: dosLibres });
    await b.hastaAsync(() => charlas(b.vida).length > 0, 30_000);
    expect(temas.leidos.map((l) => l.id).sort()).toEqual(["JST-0", "JST-1"]);
    const primera = charlas(b.vida)[0] as unknown as { lineas: Array<{ codigo: string | null }> };
    expect(primera.lineas.some((l) => l.codigo === "JST-91" || l.codigo === "JST-98")).toBe(false);
  });

  it("con «Conversaciones» apagado, las que hay se cortan al tiro (vuelven caminando a su asiento) y no salen más, ni frases sueltas", async () => {
    const { vida, sync, hastaAsync, avanzarAsync, hasta } = banco(guardados());
    sync({ op: CON, cambios: dosLibres });
    const asiento0 = vida.fuera("JST-0")!.pos;
    await hastaAsync(() => vida.charlaDe("JST") !== null, 30_000);
    sync({ op: { charlas: false } });
    expect(charlas(vida)).toHaveLength(0);
    expect(vida.charlaDe("JST")).toBeNull();
    expect(camina(vida, "JST-0")).toBe(true);
    hasta(() => !camina(vida, "JST-0") && !camina(vida, "JST-1"));
    expect(vida.fuera("JST-0")!.pos).toEqual(asiento0);
    await avanzarAsync(5 * 60_000, () => {
      expect(charlas(vida)).toHaveLength(0);
      expect(vida.sueltaDe("JST")).toBeNull();
    });
    // Al prenderlo de nuevo, vuelven a buscar pareja a los 5–10 s.
    sync({ op: { charlas: true } });
    const ms = await hastaAsync(() => charlas(vida).length > 0, 30_000);
    expect(ms).toBeLessThanOrEqual(10_000 + 32);
  }, 30_000);

  it("con las conversaciones apagadas (el widget) no hay ninguna ni se lee nada", async () => {
    const temas = guardados();
    const { vida, sync, avanzarAsync } = banco(temas);
    sync({ op: { charlas: false }, cambios: dosLibres });
    await avanzarAsync(4 * 60_000);
    expect(charlas(vida)).toHaveLength(0);
    expect(temas.leidos).toEqual([]);
    expect(vida.proximo()).toBeNull();
  }, 30_000);

  it("se corta al tiro si a uno le cambia el estado: camina a su escritorio y el otro vuelve a su asiento", async () => {
    const { vida, sync, hastaAsync, hasta } = banco(guardados());
    sync({ op: CON, cambios: dosLibres });
    const asiento1 = vida.fuera("JST-1")!.pos;
    await hastaAsync(() => vida.charlaDe("JST") !== null, 30_000);
    sync({ cambios: { "JST-1": "libre" } });
    expect(charlas(vida)).toHaveLength(0);
    expect(vida.charlaDe("JST")).toBeNull();
    expect(vida.fuera("JST-0")!.hacia).toBe("escritorio");
    expect(vida.fuera("JST-1")!.hacia).toBe("descanso");
    hasta(() => vida.enEscritorio("JST-0") && !camina(vida, "JST-1"));
    expect(vida.fuera("JST-1")!.pos).toEqual(asiento1);
  }, 30_000);

  it("con «reducir movimiento» solo conversan vecinos (a 40 px o menos) y sin moverse", async () => {
    const { vida, sync, hastaAsync } = banco(guardados());
    sync({ op: { ...CON, rm: true }, cambios: dosLibres });
    const p0 = vida.fuera("JST-0")!.pos;
    await hastaAsync(() => vida.charlaDe("JST") !== null, 30_000);
    expect(camina(vida, "JST-0")).toBe(false);
    const c = vida.charlaDe("JST")!;
    // En el sofá: el globo va 4 px más abajo.
    expect(c.sofa).toBe(true);
    expect(vida.fuera("JST-0")!.pos).toEqual(p0);
    expect(vida.seMueve()).toBe(false);
  }, 30_000);

  it("con «reducir movimiento», dos libres lejos (más de 40 px) no conversan ni se lee nada", async () => {
    const temas = guardados({ "BET-5": T["JST-0"]!, "BET-6": T["JST-1"]! });
    const { vida, sync, avanzarAsync } = banco(temas);
    const siete = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((i) => [`BET-${i}`, "libre" as Dibujo]));
    sync({ op: { ...CON, rm: true }, cambios: siete });
    sync({ cambios: { "BET-5": "libre", "BET-6": "libre" } });
    const a = vida.fuera("BET-5")!.pos;
    const b = vida.fuera("BET-6")!.pos;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(40);
    await avanzarAsync(3 * 60_000);
    expect(charlas(vida)).toHaveLength(0);
    expect(temas.leidos).toEqual([]);
  }, 30_000);

  it("el rótulo de la sala sigue su vuelta mientras conversan: ya no cuenta la tarea de la conversación (§5.3)", async () => {
    const { vida, sync, hastaAsync, hasta } = banco(guardados());
    sync({ op: CON, cambios: { ...dosLibres, "JST-3": "trabaja" }, codigos: { "JST-3": "JST-164" } });
    await hastaAsync(() => vida.charlaDe("JST") !== null, 30_000);
    hasta(() => {
      const r = vida.rotuloDe("JST");
      expect(r?.item.tipo).not.toBe("charla");
      return charlas(vida).length === 0;
    }, 30_000);
  }, 30_000);

  it("con el filtro de una empresa, «cuántos trabajan» cuenta solo las salas del filtro, como el encabezado (JST-176)", async () => {
    // Todos trabajan salvo 2 de JST: en el piso hay 24 trabajando y en JST, 3.
    for (const [filtro, primera] of [[[], /^(Hay )?24 trabajando/], [["JST"], /^¿Cuántos están trabajando\?$/], [["BET", "JST"], /^(Hay )?12 trabajando/]] as const) {
      const { vida, sync, hastaAsync } = banco(guardados());
      const g = (vida as unknown as { guionista: { armar: (c: ContextoCharla, f?: Tema | null) => Guion | null } }).guionista;
      const armar = g.armar.bind(g);
      let guion: Guion | null = null;
      g.armar = (c) => (guion = armar(c, "trabajan"));
      sync({ op: { ...CON, filtro }, cambios: dosLibres });
      await hastaAsync(() => guion !== null, 30_000);
      const textos = guion!.lineas.map((l) => l.texto);
      expect(textos.find((t) => /trabajando|Un día normal/.test(t))).toMatch(primera);
      if (filtro.length === 1) expect(textos[1]).toBe("3. Un día normal.");
    }
  }, 30_000);
});

describe("frases sueltas (JST-162 §1.6)", () => {
  const CON: Partial<OpcionesVida> = { charlas: true };

  it("quien está solo en el descanso dice una frase suelta cada 45–90 s, en un globo de pensamiento", async () => {
    const { vida, sync, avanzarAsync, reloj } = banco();
    sync({ op: CON, cambios: { "JST-0": "libre" } });
    const inicios: number[] = [];
    const duraciones: number[] = [];
    let antes: { clave: string; t: number } | null = null;
    await avanzarAsync(10 * 60_000, () => {
      const s = vida.sueltaDe("JST");
      if (antes && s?.clave !== antes.clave) {
        duraciones.push(reloj.t - antes.t);
        antes = null;
      }
      if (s && !antes) {
        antes = { clave: s.clave, t: reloj.t };
        inicios.push(reloj.t);
        expect(s.quien).toBe("JST-0");
        expect(SUELTAS).toContain(s.linea.texto);
      }
    });
    expect(inicios.length).toBeGreaterThanOrEqual(6);
    for (let k = 1; k < inicios.length; k++) {
      expect(inicios[k]! - inicios[k - 1]!).toBeGreaterThanOrEqual(45_000);
      expect(inicios[k]! - inicios[k - 1]!).toBeLessThanOrEqual(90_000 + 32);
    }
    // Lo mismo que una frase, 0,5 s menos (mínimo 2,5 s).
    expect(duraciones.length).toBeGreaterThanOrEqual(5);
    for (const d of duraciones) {
      expect(d).toBeGreaterThanOrEqual(2_500);
      expect(d).toBeLessThanOrEqual(4_500 + 32);
    }
  }, 30_000);

  it("como mucho 1 por sala, nunca mientras su sala tiene una conversación, y a 1x no se dicen", async () => {
    const { vida, sync, avanzarAsync } = banco();
    sync({ op: CON, cambios: { "JST-0": "libre", "JST-1": "libre", "JST-2": "libre", "JST-3": "libre" } });
    let vistas = 0;
    await avanzarAsync(8 * 60_000, () => {
      const s = vida.sueltaDe("JST");
      if (s) vistas += 1;
      if (charlas(vida).some((c) => c.prefijo === "JST")) expect(s).toBeNull();
      const sueltas = (vida as unknown as { sueltas: Array<{ prefijo: string }> }).sueltas;
      expect(sueltas.filter((x) => x.prefijo === "JST").length).toBeLessThanOrEqual(1);
    });
    expect(vistas).toBeGreaterThan(0);
    const chico = banco();
    chico.sync({ op: CON, plano: armarPiso(HOY, 366, "celular"), cambios: { "JST-0": "libre" } });
    await chico.avanzarAsync(4 * 60_000, () => expect(chico.vida.sueltaDe("JST")).toBeNull());
  }, 30_000);
});

describe("mascotas del pasillo (JST-96 §7)", () => {
  const CON: Partial<OpcionesVida> = { mascotas: true };

  it("las 4 aparecen quietas en su cama, en el pasillo", () => {
    const { vida, sync } = banco();
    sync({ op: CON });
    const p = pasillosDe(PISO)[0]!;
    const m = vida.mascotas();
    expect(m.map((x) => x.id)).toEqual([...MASCOTAS]);
    for (const x of m) {
      expect(x.pos).toEqual(x.cama);
      expect(x.cama.y).toBe(p.y + 14);
      expect(x.anim).toBe("quieto-der");
      expect(x.dormida).toBe(false);
    }
  });

  it("pasean solo en horizontal, dentro del pasillo, a ±90 px de su cama, y después de 3 paseos duermen en su cama", () => {
    const { vida, sync, avanzar } = banco();
    sync({ op: CON });
    const p = pasillosDe(PISO)[0]!;
    const camas = Object.fromEntries(vida.mascotas().map((x) => [x.id, x.cama]));
    const caminaron = new Set<string>();
    const durmieron = new Set<string>();
    const anims = new Set<string>();
    let antes = Object.fromEntries(vida.mascotas().map((x) => [x.id, x.pos]));
    avanzar(3 * 60_000, () => {
      for (const x of vida.mascotas()) {
        anims.add(x.anim.replace(/-(der|izq)$/, ""));
        expect(x.pos.y).toBe(camas[x.id]!.y);
        expect(x.pos.x).toBeGreaterThanOrEqual(p.x + 10);
        expect(x.pos.x).toBeLessThanOrEqual(p.x + p.w - 10);
        expect(Math.abs(x.pos.x - camas[x.id]!.x)).toBeLessThanOrEqual(91);
        // Velocidad: el perro es el más rápido (30 px/s): nunca más de 1 px por cuadro de 16 ms.
        expect(Math.abs(x.pos.x - antes[x.id]!.x)).toBeLessThanOrEqual(1);
        if (x.anim.startsWith("caminar-")) {
          caminaron.add(x.id);
          if (x.pos.x !== antes[x.id]!.x) expect(x.anim).toBe(x.pos.x > antes[x.id]!.x ? "caminar-der" : "caminar-izq");
        }
        if (x.dormida) {
          durmieron.add(x.id);
          expect(x.pos).toEqual(camas[x.id]);
          expect(x.anim).toBe("dormir");
        }
      }
      antes = Object.fromEntries(vida.mascotas().map((x) => [x.id, x.pos]));
    });
    expect(caminaron.size).toBe(4);
    expect(durmieron.size).toBe(4);
    expect(anims).toEqual(new Set(["quieto", "gesto", "caminar", "dormir"]));
    // 3 min de cuadros con varias revisiones cada uno: con la Mac ocupada pasa de los 5 s de siempre.
  }, 30_000);

  it("solo hacen andar el bucle mientras caminan; si no, avisan cuándo mirar de nuevo", () => {
    const { vida, sync, hasta } = banco();
    sync({ op: CON });
    expect(vida.seMueve()).toBe(false);
    const prox = vida.proximo()!;
    expect(prox).toBeGreaterThan(1_000);
    hasta(() => vida.seMueve(), 10_000);
    expect(vida.mascotas().some((x) => x.anim.startsWith("caminar-"))).toBe(true);
  });

  it("con «reducir movimiento» duermen en su cama y no se mueven", () => {
    const { vida, sync, avanzar } = banco();
    sync({ op: { ...CON, rm: true } });
    avanzar(30_000);
    for (const x of vida.mascotas()) {
      expect(x.dormida).toBe(true);
      expect(x.pos).toEqual(x.cama);
    }
    expect(vida.seMueve()).toBe(false);
  });

  it("al tocarla dice lo suyo 1,8 s (en su orden, rotando); si caminaba, se detiene y hace su gesto (JST-162 §3)", () => {
    const { vida, sync, hasta, avanzar, reloj } = banco();
    sync({ op: CON });
    hasta(() => vida.mascotas().some((x) => x.id === "perro" && x.anim.startsWith("caminar-")), 30_000);
    const pos = vida.mascotas().find((x) => x.id === "perro")!.pos;
    const t0 = reloj.t;
    vida.tocarMascota("perro");
    let m = vida.mascotas().find((x) => x.id === "perro")!;
    expect(m.dice).toBe(DICEN.perro[0]);
    expect(m.anim.startsWith("gesto-")).toBe(true);
    expect(m.pos).toEqual(pos);
    hasta(() => vida.mascotas().find((x) => x.id === "perro")!.dice === null, 5_000);
    expect(Math.abs(reloj.t - t0 - MASCOTA_DICE_MS)).toBeLessThanOrEqual(16);
    // La próxima vez dice lo siguiente; nunca lo mismo 2 veces seguidas.
    vida.tocarMascota("perro");
    expect(vida.mascotas().find((x) => x.id === "perro")!.dice).toBe(DICEN.perro[1]);
    // Una a la vez: si tocas otra, la anterior se calla.
    vida.tocarMascota("gato");
    const todas = vida.mascotas();
    expect(todas.filter((x) => x.dice !== null).map((x) => x.id)).toEqual(["gato"]);
    avanzar(2_000);
    m = vida.mascotas().find((x) => x.id === "gato")!;
    expect(m.dice).toBeNull();
  });

  it("su globo va hacia donde mira, salvo que no quepa en el pasillo o haya otra mascota cerca de ese lado", () => {
    const { vida, sync } = banco();
    sync({ op: CON });
    const p = pasillosDe(PISO)[0]!;
    const v = vida as unknown as { mascotasVivas: Array<{ id: string; pos: { x: number; y: number }; dir: "izq" | "der" }> };
    const lado = (id: string) => vida.mascotas().find((x) => x.id === id)!.lado;
    const [gato, perro, conejo, robot] = v.mascotasVivas;
    // Lejos de las otras y de los bordes: hacia donde mira.
    for (const o of [perro!, conejo!, robot!]) o.pos = { x: p.x + p.w - 20, y: o.pos.y };
    gato!.pos = { x: p.x + Math.round(p.w / 2), y: gato!.pos.y };
    gato!.dir = "izq";
    vida.tocarMascota("gato");
    expect(lado("gato")).toBe("izq");
    // Pegada al borde izquierdo (a menos de 52 px): va a la derecha.
    gato!.pos = { x: p.x + 30, y: gato!.pos.y };
    vida.tocarMascota("gato");
    expect(lado("gato")).toBe("der");
    // Otra mascota a menos de 44 px a la izquierda: va a la derecha.
    gato!.pos = { x: p.x + 200, y: gato!.pos.y };
    perro!.pos = { x: p.x + 170, y: gato!.pos.y };
    vida.tocarMascota("gato");
    expect(lado("gato")).toBe("der");
  });

  it("un toque va a la mascota con el dibujo más cerca aunque las zonas de 44 px se pisen (JST-174)", () => {
    const { vida, sync } = banco();
    sync({ op: CON });
    const p = pasillosDe(PISO)[0]!;
    const v = vida as unknown as { mascotasVivas: Array<{ id: string; pos: { x: number; y: number } }> };
    const [gato, perro, conejo, robot] = v.mascotasVivas;
    const y = gato!.pos.y;
    for (const o of [conejo!, robot!]) o.pos = { x: p.x + p.w - 20, y };
    // Lo de la QA, a 1x: el perro a 24 px del gato. El dibujo es 16 × 16 con los pies en `pos`.
    gato!.pos = { x: p.x + 100, y };
    perro!.pos = { x: p.x + 124, y };
    const centro = (o: { pos: { x: number; y: number } }, dx = 0, dy = 0) => ({ x: o.pos.x + dx, y: o.pos.y - 8 + dy });
    expect(vida.mascotaEn(centro(gato!), 44)).toBe("gato");
    expect(vida.mascotaEn(centro(perro!), 44)).toBe("perro");
    // Fuera de los dibujos, la del borde más cerca: entre los dos, cada mitad; afuera, la zona de la que queda.
    expect(vida.mascotaEn(centro(gato!, 11), 44)).toBe("gato");
    expect(vida.mascotaEn(centro(gato!, 13), 44)).toBe("perro");
    expect(vida.mascotaEn(centro(gato!, -21, 21), 44)).toBe("gato");
    expect(vida.mascotaEn(centro(gato!, -23), 44)).toBeNull();
    // Dibujos encimados: la del centro más cerca.
    perro!.pos = { x: p.x + 106, y };
    expect(vida.mascotaEn(centro(gato!, 2), 44)).toBe("gato");
    expect(vida.mascotaEn(centro(gato!, 4), 44)).toBe("perro");
    // A 3x la zona (44 px de pantalla) es más chica que el dibujo: cuenta el dibujo.
    perro!.pos = { x: p.x + 124, y };
    expect(vida.mascotaEn(centro(gato!, 7.5), 44 / 3)).toBe("gato");
    expect(vida.mascotaEn(centro(gato!, 9), 44 / 3)).toBeNull();
    // Al azar, como la QA: tocando cualquier punto del dibujo de una, responde esa, con otra a 16–30 px.
    let s = 7;
    const azar = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    for (let k = 0; k < 200; k++) {
      const [a, b] = azar() < 0.5 ? [gato!, perro!] : [perro!, gato!];
      a.pos = { x: p.x + 100, y };
      b.pos = { x: p.x + 100 + (azar() < 0.5 ? -1 : 1) * (16 + Math.round(azar() * 14)), y };
      const t = centro(a, azar() * 15 - 7.5, azar() * 15 - 7.5);
      expect(vida.mascotaEn(t, 44)).toBe(a.id);
    }
  });

  it("con «reducir movimiento» al tocarla solo sale el globo: sigue durmiendo, sin gesto", () => {
    const { vida, sync, avanzar } = banco();
    sync({ op: { ...CON, rm: true } });
    vida.tocarMascota("robot");
    const m = vida.mascotas().find((x) => x.id === "robot")!;
    expect(m.dice).toBe("Bip bup");
    expect(m.dormida).toBe(true);
    expect(vida.proximo()).not.toBeNull();
    avanzar(2_000);
    expect(vida.mascotas().find((x) => x.id === "robot")!.dice).toBeNull();
  });

  it("en el TV (sin mouse) dicen lo suyo solas al despertar, una a la vez", () => {
    const { vida, sync, avanzar } = banco();
    sync({ op: { ...CON, mascotasSolas: true } });
    const dichas: string[] = [];
    let antes: string | null = null;
    avanzar(5 * 60_000, () => {
      const hablan = vida.mascotas().filter((x) => x.dice !== null);
      expect(hablan.length).toBeLessThanOrEqual(1);
      const d = hablan[0] ? `${hablan[0].id}:${hablan[0].dice}` : null;
      if (d && d !== antes) dichas.push(d);
      antes = d;
    });
    expect(dichas.length).toBeGreaterThan(0);
    // Sin el TV, no hablan solas.
    const pagina = banco();
    pagina.sync({ op: CON });
    pagina.avanzar(5 * 60_000, () => expect(pagina.vida.mascotas().every((x) => x.dice === null)).toBe(true));
  }, 30_000);

  it("ocultas, mientras carga o sin pasillo (una sala acercada) no hay mascotas", () => {
    const { vida, sync } = banco();
    sync({ op: { mascotas: false } });
    expect(vida.mascotas()).toEqual([]);
    sync({ op: { mascotas: true, cargando: true } });
    expect(vida.mascotas()).toEqual([]);
    sync({ op: { cargando: false } });
    expect(vida.mascotas()).toHaveLength(4);
    sync({ plano: armarSalaAcercada(HOY[0]!, 366), activas: new Set(["BET"]) });
    expect(vida.mascotas()).toEqual([]);
  });
});

describe("posiciones en cada cuadro, sin volver a dibujar (JST-96 §14)", () => {
  /** Un elemento falso que anota cada `transform` que se le escribe. */
  function elemento() {
    const escritos: string[] = [];
    let t = "";
    const style = {
      zIndex: "",
      get transform() {
        return t;
      },
      set transform(v: string) {
        t = v;
        escritos.push(v);
      },
    };
    return { escritos, style };
  }
  const tr = (x: number, y: number, px = 2) => `translate(${x * px}px, ${y * px}px)`;

  it("escribe transform (y el orden por los pies) en lo que camina, y no repite lo que ya escribió", () => {
    const { vida, sync, avanzar } = banco();
    sync();
    sync({ cambios: { "BET-0": "libre" } });
    const p = elemento();
    const b = elemento();
    vida.registrar("p:BET-0", p);
    vida.registrar("b:BET-0", b);
    // Registrar borra lo escrito en el último cuadro: la posición vuelve a ser la que dibujó React.
    expect(p.escritos).toEqual([""]);
    avanzar(400);
    vida.pintarPosiciones();
    const f = vida.fuera("BET-0")!;
    expect(f.caminando).toBe(true);
    expect(p.style.transform).toBe(tr(f.pos.x - 8, f.pos.y - 24));
    expect(p.style.zIndex).toBe(String(f.pos.y));
    expect(b.style.transform).toBe(tr(f.pos.x, f.pos.y - 23));
    const n = p.escritos.length;
    vida.pintarPosiciones();
    expect(p.escritos.length).toBe(n);
    // Al volver a registrarlo (React lo volvió a dibujar), se borra y se escribe de nuevo.
    vida.registrar("p:BET-0", p);
    vida.pintarPosiciones();
    expect(p.escritos.length).toBe(n + 2);
    vida.registrar("p:BET-0", null);
    avanzar(400);
    vida.pintarPosiciones();
    expect(p.escritos.length).toBe(n + 2);
  });

  it("no escribe nada en lo que está quieto (los libres sentados, las mascotas que no pasean)", () => {
    const { vida, sync } = banco();
    sync({ op: { mascotas: true } });
    const p = elemento();
    const m = elemento();
    vida.registrar("p:BET-5", p);
    vida.registrar("m:gato", m);
    vida.pintarPosiciones();
    expect(p.escritos).toEqual([""]);
    expect(m.escritos).toEqual([""]);
  });

  it("mueve la mascota que pasea", () => {
    const { vida, sync, avanzar } = banco();
    sync({ op: { mascotas: true } });
    const m = elemento();
    vida.registrar("m:gato", m);
    for (let i = 0; i < 400 && !vida.mascotas()[0]!.anim.startsWith("caminar"); i++) avanzar(50);
    avanzar(200);
    vida.pintarPosiciones();
    const gato = vida.mascotas()[0]!;
    expect(gato.anim.startsWith("caminar")).toBe(true);
    expect(m.style.transform).toBe(tr(gato.pos.x - 8, gato.pos.y - 16));
  });

  it("también mueve el sobre en vuelo", () => {
    const { vida, sync, avanzar } = banco();
    sync();
    vida.entrega("BET-0", "BET-7", "BET-50");
    const s = elemento();
    const id = vida.sobresDe("BET", false)[0]!.id;
    vida.registrar(`s:${id}`, s);
    avanzar(500);
    vida.pintarPosiciones();
    const pos = vida.sobresDe("BET", false)[0]!.pos;
    expect(s.style.transform).toBe(tr(pos.x, pos.y));
  });
});
