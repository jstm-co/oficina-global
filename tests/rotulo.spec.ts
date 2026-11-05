import { describe, expect, it } from "vitest";
import { libre, rejillaDe } from "../src/caminos.js";
import { armarPiso, armarPisoTv, armarSalaAcercada, type EntradaSala, type PisoPlano } from "../src/plano.js";
import {
  cortarNombre,
  desfase,
  ENTRE_CAMBIOS_MS,
  itemDeAgente,
  nombreCorto,
  PASO_PISO_MS,
  PASO_SALA_MS,
  proximoPaso,
  QUIETO_TOQUE_MS,
  rotuloEn,
  SOBRE_MS,
  vueltaDelPiso,
  vueltaDeSala,
  type AgenteRotulo,
  type ItemRotulo,
  type Medidor,
} from "../src/rotulo.js";
import type { Temas } from "../src/temas.js";
import { ROTULO_PISO, Vida, type AgenteVida, type FuenteTemas, type OpcionesVida } from "../src/vida.js";
import type { Dibujo } from "../src/vista.js";

// ---------------------------------------------------------------------------
// Cómo se corta un nombre largo (design-spec de JST-138 §5)
// ---------------------------------------------------------------------------

/** Una letra = 6 px (como una monoespaciada): así cada ancho dice cuántas letras caben. */
const seis: Medidor = (t) => t.length * 6;
const corta = (titulo: string, letras: number) => cortarNombre(titulo, "500 11px Inter", letras * 6, seis);

describe("cortar un nombre largo (§5)", () => {
  it("los ejemplos del prototipo: palabras enteras con «…»", () => {
    expect(corta("Diseño de «Oficina global»: mostrar de qué se trata cada tarea, no solo su código", 40)).toBe("Diseño de «Oficina global»: mostrar…");
    expect(corta("Backend — reset token y SendResetMail con el correo de la cuenta", 30)).toBe("Backend — reset token…");
    expect(corta("Aprobar el plan de permisos de lectura por equipo", 42)).toBe("Aprobar el plan de permisos de lectura…");
  });

  it("no deja colgando un conector («de», «la», «con»…)", () => {
    expect(corta("Documentar el flujo de magic links del login", 40)).toBe("Documentar el flujo de magic links…");
    expect(corta("Revisar la migración de la tabla de sesiones", 26)).toBe("Revisar la migración…");
    expect(corta("Arreglar con el equipo de la oficina", 18)).toBe("Arreglar…");
  });

  it("no deja colgando un signo (: , ; · — – - ( «)", () => {
    expect(corta("Backend — reset token", 12)).toBe("Backend…");
    expect(corta("Diseño de «Oficina global»: mostrar de qué se trata", 28)).toBe("Diseño de «Oficina global»…");
    expect(corta("Uno, dos, tres y cuatro", 10)).toBe("Uno, dos…");
  });

  it("un paréntesis que quedaría abierto se saca entero", () => {
    expect(corta("Re-QA de «Oficina global» 0.1.5 (JST-89: sin paso por 2x en la recarga)", 50)).toBe("Re-QA de «Oficina global» 0.1.5…");
    // Cerrado, se queda.
    expect(corta("Re-QA (JST-89) de la oficina global con el piso", 26)).toBe("Re-QA (JST-89)…");
  });

  it("un nombre que entra se deja entero, sin «…»", () => {
    expect(corta("Aplicaciones en la tablet de la sala", 40)).toBe("Aplicaciones en la tablet de la sala");
    expect(corta("  Espacios   de   más  ", 40)).toBe("Espacios de más");
    expect(corta("", 40)).toBe("");
  });

  it("solo si la primera palabra ya no cabe, se corta adentro de ella", () => {
    expect(corta("Supercalifragilisticoespialidoso de prueba", 10)).toBe("Supercali…");
    expect(corta("Supercalifragilisticoespialidoso de prueba", 34)).toBe("Supercalifragilisticoespialidoso…");
  });

  it("nunca pasa del ancho, con cualquier ancho", () => {
    const nombres = [
      "Diseño de «Oficina global»: mostrar de qué se trata cada tarea, no solo su código",
      "Backend — reset token y SendResetMail con el correo de la cuenta",
      "Re-QA de «Oficina global» 0.1.5 (JST-89: sin paso por 2x en la recarga)",
    ];
    for (const n of nombres) {
      for (let letras = 2; letras < 90; letras++) {
        const c = corta(n, letras);
        expect(c.length, `${n} @ ${letras}`).toBeLessThanOrEqual(letras);
        expect(c === n.replace(/\s+/g, " ").trim() || c.endsWith("…")).toBe(true);
        // Nunca termina en un conector antes del «…».
        const ultima = c.replace(/…$/, "").split(" ").at(-1)!.toLowerCase();
        if (c.includes(" ") && c.endsWith("…")) expect(["de", "la", "con", "el", "y", "a", "para", "por", "en"]).not.toContain(ultima);
      }
    }
  });

  it("el nombre corto del agente no lleva lo que va entre paréntesis", () => {
    expect(nombreCorto("Documentación Técnica (Betalandia)")).toBe("Documentación Técnica");
    expect(nombreCorto("CEO")).toBe("CEO");
  });
});

// ---------------------------------------------------------------------------
// Qué cuenta el rótulo y cuándo cambia (§3.3 y §3.4)
// ---------------------------------------------------------------------------

function ag(id: string, st: Dibujo, o: { pre?: string; espera?: [string, string, number?]; run?: [string, string, boolean?] } = {}): AgenteRotulo {
  return {
    id,
    prefijo: o.pre ?? id.split("-")[0]!,
    nombre: `Agente ${id} (Empresa)`,
    st,
    espera: o.espera ? { codigo: o.espera[0], titulo: o.espera[1], mas: o.espera[2] ?? 0 } : null,
    run: o.run ? { codigo: o.run[0], titulo: o.run[1], enCola: o.run[2] ?? false } : null,
  };
}

const SALA = [
  ag("BET-0", "trabaja", { run: ["BET-10", "Backend — reset token"] }),
  ag("BET-1", "libre"),
  ag("BET-2", "trabaja", { run: ["BET-12", "Frontend"], espera: ["BET-20", "Aprobar el plan", 2] }),
  ag("BET-3", "toca", { espera: ["BET-21", "Revisar la migración"] }),
  ag("BET-4", "pausa"),
  ag("BET-5", "trabaja", { run: ["BET-15", "En cola", true] }),
];
const claves = (v: readonly ItemRotulo[]) => v.map((i) => `${i.tipo}:${i.codigo}`);

describe("la vuelta de la sala (§3.3)", () => {
  it("primero lo que te espera, después quien trabaja o está en cola, en el orden de los escritorios", () => {
    expect(claves(vueltaDeSala(SALA))).toEqual(["toca:BET-20", "toca:BET-21", "trabaja:BET-10", "trabaja:BET-12", "cola:BET-15"]);
    const v = vueltaDeSala(SALA);
    // Quien trabaja y además te espera sale 2 veces; lo que te pide lleva «+N».
    expect(v.filter((i) => i.agente === "BET-2").map((i) => i.tipo)).toEqual(["toca", "trabaja"]);
    expect(v[0]).toMatchObject({ texto: "Aprobar el plan", mas: 2, quien: "Agente BET-2" });
  });

  it("a 1x se turnan las empresas: la primera de cada una, después la segunda…", () => {
    const piso = [
      ag("BET-0", "trabaja", { run: ["BET-1", "a"] }),
      ag("BET-1", "trabaja", { run: ["BET-2", "b"] }),
      ag("ELM-0", "toca", { espera: ["ELM-6", "c"] }),
      ag("JST-0", "trabaja", { run: ["JST-1", "d"] }),
      ag("MIG-0", "trabaja", { run: ["MIG-1", "e"] }),
      ag("MIG-1", "libre"),
    ];
    expect(claves(vueltaDelPiso(piso))).toEqual(["trabaja:BET-1", "toca:ELM-6", "trabaja:JST-1", "trabaja:MIG-1", "trabaja:BET-2"]);
  });

  it("con el mouse encima: lo que te pide; si no, su tarea; si no, su error; si no, «Libre» o «En pausa» sin código", () => {
    expect(itemDeAgente(SALA[2]!)).toMatchObject({ tipo: "toca", codigo: "BET-20" });
    expect(itemDeAgente(SALA[0]!)).toMatchObject({ tipo: "trabaja", codigo: "BET-10" });
    expect(itemDeAgente(ag("BET-9", "error"))).toMatchObject({ tipo: "error", codigo: null, texto: "Con error" });
    expect(itemDeAgente(SALA[1]!)).toMatchObject({ tipo: "libre", codigo: null, texto: "Libre" });
    expect(itemDeAgente(SALA[4]!)).toMatchObject({ tipo: "pausa", codigo: null, texto: "En pausa" });
  });

  it.each([
    ["timer", "Latido"],
    ["on_demand", "A pedido"],
    ["issue_assigned", "Sin tarea"],
  ])("un run sin tarea con origen %s cuenta «%s», nunca «run»", (invocationSource, texto) => {
    const a = ag("BET-9", "trabaja");
    a.run = { codigo: null, titulo: null, enCola: false, invocationSource };
    expect(itemDeAgente(a)).toMatchObject({ tipo: "trabaja", codigo: null, texto });
  });
});

describe("cada cuánto cambia (§3.4)", () => {
  const vuelta = vueltaDeSala(SALA);

  it("avanza cada 6 s según el reloj", () => {
    const en = (t: number) => rotuloEn(t, vuelta, 0, 4).item!.codigo;
    expect([0, 5_999, 6_000, 12_000, 18_000, 24_000, 30_000].map(en)).toEqual(["BET-20", "BET-20", "BET-21", "BET-10", "BET-12", "BET-15", "BET-20"]);
  });

  it("el desfase de cada sala: con 4 salas, 1,5 s; dos salas nunca cambian en el mismo instante", () => {
    expect([0, 1, 2, 3].map((i) => desfase(i, 4))).toEqual([0, 1_500, 3_000, 4_500]);
    const cambios = new Map<number, number>();
    for (let sala = 0; sala < 4; sala++) {
      for (let t = 0, k = 0; k < 20; k++) {
        t = proximoPaso(t, vuelta.length, sala, 4)!;
        expect(cambios.has(t), `sala ${sala} y ${cambios.get(t)} a los ${t} ms`).toBe(false);
        cambios.set(t, sala);
      }
    }
    // Y cada sala cambia justo cuando su reloj lo dice.
    const t = proximoPaso(10_000, vuelta.length, 1, 4)!;
    expect(t).toBe(10_500);
    expect(rotuloEn(t - 1, vuelta, 1, 4).indice).not.toBe(rotuloEn(t, vuelta, 1, 4).indice);
  });

  it("si la vuelta cambia, sigue con la misma cuenta: no vuelve al comienzo", () => {
    const t = 7 * PASO_SALA_MS + 100;
    expect(rotuloEn(t, vuelta.slice(0, 3), 0, 4).indice).toBe(1);
    expect(rotuloEn(t, vuelta.slice(0, 4), 0, 4).indice).toBe(3);
    expect(rotuloEn(t + PASO_SALA_MS, vuelta.slice(0, 4), 0, 4).indice).toBe(0);
  });

  it("se adelantan, en orden: el agente con el mouse encima, un sobre y la frase de la conversación", () => {
    const pin = itemDeAgente(SALA[1]!);
    const sobre: ItemRotulo = { clave: "s:1", tipo: "sobre", prefijo: "BET", agente: "BET-1", quien: "x", codigo: "BET-30", mas: 0, texto: "Documentar" };
    const frase: ItemRotulo = { ...sobre, clave: "c:1:0", tipo: "charla", codigo: "BET-31" };
    expect(rotuloEn(0, vuelta, 0, 4, { pin, sobre, frase })).toMatchObject({ item: pin, adelantado: true, indice: 0 });
    expect(rotuloEn(0, vuelta, 0, 4, { sobre, frase }).item).toBe(sobre);
    expect(rotuloEn(0, vuelta, 0, 4, { frase }).item).toBe(frase);
    expect(rotuloEn(0, vuelta, 0, 4, {}).item).toBe(vuelta[0]);
    // Sin vuelta igual cuenta lo que se adelanta; sin nada, no hay rótulo.
    expect(rotuloEn(0, [], 0, 4, { sobre }).item).toBe(sobre);
    expect(rotuloEn(0, [], 0, 4)).toEqual({ item: null, indice: null, adelantado: false });
  });

  it("quieto (mouse, foco, ‹ › o un toque): no avanza solo y se queda en la posición elegida", () => {
    for (const t of [0, 6_000, 60_000]) expect(rotuloEn(t, vuelta, 0, 4, { quieto: 3 }).item!.codigo).toBe("BET-12");
    expect(rotuloEn(0, vuelta, 0, 4, { quieto: -1 }).item!.codigo).toBe("BET-15");
    expect(rotuloEn(0, vuelta, 0, 4, { quieto: 7 }).item!.codigo).toBe("BET-10");
    expect(proximoPaso(0, vuelta.length, 0, 4, { quieto: 3 })).toBeNull();
  });

  it("con movimiento reducido no avanza solo: muestra lo primero de la vuelta", () => {
    for (const t of [0, 6_000, 60_000]) expect(rotuloEn(t, vuelta, 2, 4, { rm: true }).item!.codigo).toBe("BET-20");
    expect(rotuloEn(0, vuelta, 2, 4, { rm: true, quieto: 2 }).item!.codigo).toBe("BET-10");
    expect(proximoPaso(0, vuelta.length, 2, 4, { rm: true })).toBeNull();
  });

  it("con una sola cosa que contar no hay nada que esperar", () => {
    expect(proximoPaso(0, 1, 0, 4)).toBeNull();
    expect(proximoPaso(0, 2, 0, 1, { paso: PASO_PISO_MS })).toBe(5_000);
  });

  it("sostenido por el usuario, ni un sobre ni una frase se adelantan; lo retenido sigue a la vista (JST-152)", () => {
    const pin = itemDeAgente(SALA[1]!);
    const sobre: ItemRotulo = { clave: "s:1", tipo: "sobre", prefijo: "BET", agente: "BET-1", quien: "x", codigo: "BET-30", mas: 0, texto: "Documentar" };
    const frase: ItemRotulo = { ...sobre, clave: "c:1:0", tipo: "charla", codigo: "BET-31" };
    expect(rotuloEn(0, vuelta, 0, 4, { quieto: 3, sostenido: true, sobre, frase }).item).toBe(vuelta[3]);
    expect(rotuloEn(0, vuelta, 0, 4, { quieto: 3, sostenido: true, retenido: frase, sobre }).item).toBe(frase);
    // El agente con el mouse o el foco encima sí se adelanta: lo pide el usuario.
    expect(rotuloEn(0, vuelta, 0, 4, { quieto: 3, sostenido: true, pin, sobre }).item).toBe(pin);
    // Con movimiento reducido y sin sostenerlo, el sobre lo cambia (§3.7).
    expect(rotuloEn(0, vuelta, 0, 4, { rm: true, sobre }).item).toBe(sobre);
  });
});

// ---------------------------------------------------------------------------
// El rótulo en el plano (§3.1)
// ---------------------------------------------------------------------------

const HOY: EntradaSala[] = [
  { prefijo: "BET", agentes: 9 },
  { prefijo: "ELM", agentes: 4 },
  { prefijo: "JST", agentes: 5 },
  { prefijo: "MIG", agentes: 8 },
];

describe("el rótulo en el plano (§3.1)", () => {
  const pisos: PisoPlano[] = [armarPiso(HOY, 576, "computador"), armarPisoTv(HOY), armarSalaAcercada(HOY[0]!, 366)];

  it("va en la franja bajo la última fila de escritorios, 10 de alto, desde x = 5 y nunca más angosto que los escritorios", () => {
    for (const piso of pisos) {
      for (const s of piso.salas) {
        const r = s.rotulo!;
        expect(r, `${piso.escena} ${s.prefijo}`).not.toBeNull();
        expect(r).toMatchObject({ x: 5, y: s.h - 12, h: 10 });
        expect(r.x + r.w).toBeGreaterThanOrEqual(s.anchoEscritorios - 4);
        expect(r.x + r.w).toBeLessThanOrEqual(s.w - 5);
        // No tapa ningún escritorio.
        for (const p of s.puestos) expect(p.y + 28).toBeLessThanOrEqual(r.y);
      }
    }
  });

  it("a 1x no hay rótulo de sala (va uno solo bajo el piso)", () => {
    for (const escena of ["celular", "widget", "widget-celular"] as const) for (const s of armarPiso(HOY, 340, escena).salas) expect(s.rotulo).toBeNull();
  });

  it("es un mueble más: nadie camina por encima ni queda de pie en su franja, y siguen sobrando asientos", () => {
    for (const piso of pisos) {
      for (const s of piso.salas) {
        const r = s.rotulo!;
        const rej = rejillaDe(s);
        for (let x = r.x; x < r.x + r.w; x += 2) for (let y = r.y; y < r.y + r.h; y += 2) expect(libre(rej, { x, y }), `${s.prefijo} ${x},${y}`).toBe(false);
        for (const a of s.asientos.filter((x) => !x.sofa)) expect(a.x + 12 > 4 && a.x + 4 < r.x + r.w && a.y + 24 > s.h - 15).toBe(false);
        expect(s.asientos.length).toBeGreaterThanOrEqual(s.puestos.length);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// La vida con el rótulo: el mismo reloj (§8)
// ---------------------------------------------------------------------------

const OP: OpcionesVida = { rm: false, charlas: false, mascotas: false, cargando: false, oculta: false };
const TODAS: ReadonlySet<string> = new Set(HOY.map((s) => s.prefijo));

/** Cada sala: el 0 trabaja en `<PRE>-100`, el 1 te espera en `<PRE>-200`, el 2 trabaja en `<PRE>-102`; el resto libre. */
function agentesVida(cambios: Record<string, Partial<AgenteVida>> = {}): AgenteVida[] {
  return HOY.flatMap((s) =>
    Array.from({ length: s.agentes }, (_, i): AgenteVida => {
      const id = `${s.prefijo}-${i}`;
      const st: Dibujo = i === 0 || i === 2 ? "trabaja" : i === 1 ? "toca" : "libre";
      return {
        id,
        companyId: `c-${s.prefijo}`,
        prefijo: s.prefijo,
        st,
        need: i === 1,
        codigo: st === "trabaja" ? `${s.prefijo}-${100 + i}` : null,
        nombre: `Agente ${id} (${s.prefijo})`,
        espera: i === 1 ? { codigo: `${s.prefijo}-200`, titulo: `Lo que te pide ${id}`, mas: 0 } : null,
        run: st === "trabaja" ? { codigo: `${s.prefijo}-${100 + i}`, titulo: `Tarea de ${id}`, enCola: false } : null,
        ...cambios[id],
      };
    }),
  );
}

function bancoRotulo(o: { plano?: PisoPlano; op?: Partial<OpcionesVida>; temas?: FuenteTemas | null; agentes?: AgenteVida[] } = {}) {
  const reloj = { t: 0 };
  const vida = new Vida({ ahora: () => reloj.t, azar: () => 0.5, temas: o.temas ?? null });
  const titulos = new Map<string, string>([["BET-300", "Documentar el flujo de magic links"]]);
  vida.fijarTitulos({ titulo: (c) => titulos.get(c) ?? null });
  const plano = o.plano ?? armarPiso(HOY, 576, "computador");
  let op = { ...OP, ...o.op };
  let lista = o.agentes ?? agentesVida();
  const sync = (cambio: { op?: Partial<OpcionesVida>; agentes?: AgenteVida[]; activas?: ReadonlySet<string> } = {}) => {
    if (cambio.op) op = { ...op, ...cambio.op };
    if (cambio.agentes) lista = cambio.agentes;
    vida.sincronizar(plano, lista, cambio.activas ?? TODAS, op);
  };
  /** Lo que hace React al dibujar: cada rótulo queda como visto. */
  const dibujar = () => {
    for (const s of HOY) vida.rotuloDe(s.prefijo);
    vida.rotuloDe(ROTULO_PISO);
  };
  sync();
  dibujar();
  /**
   * Como el bucle de verdad: cuadros de 16 ms mientras algo se mueve y, si no, salta de `proximo()` en `proximo()`.
   * Anota cuándo cambia cada rótulo (sube la versión de su sala) y llama a `cada` justo ahí.
   */
  const correr = (ms: number, cada?: (c: { t: number; sala: string }) => void) => {
    const cambios: Array<{ t: number; sala: string }> = [];
    const fin = reloj.t + ms;
    const versiones = () => Object.fromEntries([...HOY.map((s) => [s.prefijo, vida.version(s.prefijo)]), [ROTULO_PISO, vida.versionDelPiso()]]);
    while (reloj.t < fin) {
      const prox = vida.seMueve() ? reloj.t + 16 : (vida.proximo() ?? fin);
      reloj.t = Math.min(fin, Math.max(prox, reloj.t + 1));
      const antes = versiones();
      vida.paso(reloj.t);
      const despues = versiones();
      for (const k of Object.keys(antes)) {
        if (antes[k] === despues[k]) continue;
        cambios.push({ t: reloj.t, sala: k });
        cada?.({ t: reloj.t, sala: k });
      }
    }
    return cambios;
  };
  return { vida, reloj, sync, correr, plano };
}

const cuenta = (v: Vida, sala: string) => {
  const r = v.rotuloDe(sala);
  return r ? `${r.item.tipo}:${r.item.codigo}` : null;
};

describe("el rótulo en la vida", () => {
  it("cuenta la vuelta de cada sala y cambia cada 6 s con el reloj de la vida; dos salas nunca a la vez", () => {
    const { vida, correr } = bancoRotulo();
    expect(cuenta(vida, "BET")).toBe("toca:BET-200");
    const cambios = correr(60_000);
    // Cada sala cambia una vez cada 6 s (10 veces en 60 s), con 1,5 s entre una sala y la siguiente.
    for (const s of HOY) expect(cambios.filter((c) => c.sala === s.prefijo)).toHaveLength(10);
    const instantes = cambios.map((c) => c.t);
    expect(new Set(instantes).size).toBe(instantes.length);
    expect(cambios.filter((c) => c.sala === "ELM").map((c) => c.t % PASO_SALA_MS)).toEqual(Array(10).fill(PASO_SALA_MS - 1_500));
  });

  it("el anillo va en el globo del que habla", () => {
    const { vida } = bancoRotulo();
    expect(vida.rotuloDe("BET")).toMatchObject({ anillo: "BET-1", navegable: true, quieto: false });
  });

  it("con el mouse sobre un agente cuenta lo suyo, y vuelve a la vuelta al salir", () => {
    const { vida, reloj } = bancoRotulo();
    vida.fijarPin("BET", "BET-4");
    expect(vida.rotuloDe("BET")!.item).toMatchObject({ tipo: "libre", codigo: null, texto: "Libre" });
    vida.fijarPin("BET", "BET-2");
    expect(cuenta(vida, "BET")).toBe("trabaja:BET-102");
    reloj.t += 30_000;
    expect(cuenta(vida, "BET")).toBe("trabaja:BET-102");
    vida.fijarPin("BET", null);
    expect(cuenta(vida, "BET")).not.toBeNull();
    // Un agente de otra sala no cambia este rótulo.
    vida.fijarPin("BET", "ELM-0");
    expect(vida.rotuloDe("BET")!.item.agente).not.toBe("ELM-0");
  });

  it("un sobre se adelanta 6 s con el nombre conocido (o para quién va) y el anillo en quien lo recibe", () => {
    const { vida, reloj, correr } = bancoRotulo();
    expect(vida.entrega("BET-0", "BET-2", "BET-300")).toBe(true);
    expect(vida.rotuloDe("BET")).toMatchObject({ item: { tipo: "sobre", codigo: "BET-300", texto: "Documentar el flujo de magic links" }, anillo: "BET-2" });
    const cambios = correr(SOBRE_MS + 100);
    expect(cambios.some((c) => c.sala === "BET" && c.t === SOBRE_MS)).toBe(true);
    expect(vida.rotuloDe("BET")!.item.tipo).not.toBe("sobre");
    // Sin nombre conocido, dice para quién va (sin lo que va entre paréntesis). Medio segundo después del cambio anterior (JST-191).
    reloj.t += ENTRE_CAMBIOS_MS;
    vida.entrega("BET-0", "BET-2", "BET-301");
    expect(vida.rotuloDe("BET")!.item).toMatchObject({ tipo: "sobre", codigo: "BET-301", texto: "para Agente BET-2" });
    reloj.t += SOBRE_MS;
    expect(vida.rotuloDe("BET")!.item.tipo).not.toBe("sobre");
  });

  it("lo que el usuario no pidió no lo cambia dos veces en menos de 500 ms: espera; lo que hace el usuario, al tiro (JST-191)", () => {
    const { vida, reloj, correr } = bancoRotulo();
    const vistos: Array<{ t: number; k: string | null }> = [];
    const mirar = () => {
      const k = cuenta(vida, "BET");
      if (k !== vistos.at(-1)?.k) vistos.push({ t: reloj.t, k });
    };
    mirar();
    correr(PASO_SALA_MS - 100, mirar);
    // Un sobre que dura hasta 100 ms antes del paso de BET (cada 6 s desde 0).
    vida.entrega("BET-0", "BET-2", "BET-300");
    mirar();
    correr(SOBRE_MS + 1_000, mirar);
    expect(vistos).toEqual([
      { t: 0, k: "toca:BET-200" },
      { t: PASO_SALA_MS - 100, k: "sobre:BET-300" },
      { t: PASO_SALA_MS - 100 + SOBRE_MS, k: "trabaja:BET-100" },
      // El paso de las 12 s espera hasta 500 ms después del fin del sobre.
      { t: PASO_SALA_MS - 100 + SOBRE_MS + ENTRE_CAMBIOS_MS, k: "trabaja:BET-102" },
    ]);
    // Un sobre 100 ms después de un cambio también espera.
    reloj.t = 3 * PASO_SALA_MS;
    vida.paso(reloj.t);
    mirar();
    expect(vistos.at(-1)).toEqual({ t: 3 * PASO_SALA_MS, k: "toca:BET-200" });
    reloj.t += 100;
    vida.entrega("BET-0", "BET-2", "BET-301");
    mirar();
    expect(vistos.at(-1)!.k).toBe("toca:BET-200");
    correr(ENTRE_CAMBIOS_MS, mirar);
    expect(vistos.at(-1)).toEqual({ t: 3 * PASO_SALA_MS + ENTRE_CAMBIOS_MS, k: "sobre:BET-301" });
    // El mouse sobre un agente, al tiro aunque recién cambió.
    reloj.t += 50;
    vida.fijarPin("BET", "BET-4");
    expect(cuenta(vida, "BET")).toBe("libre:null");
    vida.fijarPin("BET", null);
    expect(cuenta(vida, "BET")).toBe("sobre:BET-301");
  });

  it("con el mouse encima queda quieto; ‹ › recorren la vuelta; al salir, sigue el reloj", () => {
    const { vida, reloj, correr } = bancoRotulo();
    const antes = cuenta(vida, "BET");
    vida.pausarRotulo("BET", "mouse", true);
    expect(vida.rotuloDe("BET")!.quieto).toBe(true);
    expect(correr(30_000).filter((c) => c.sala === "BET")).toHaveLength(0);
    expect(cuenta(vida, "BET")).toBe(antes);
    vida.moverRotulo("BET", 1);
    expect(cuenta(vida, "BET")).toBe("trabaja:BET-100");
    vida.moverRotulo("BET", -1);
    vida.moverRotulo("BET", -1);
    expect(cuenta(vida, "BET")).toBe("trabaja:BET-102");
    // El foco del teclado también lo deja quieto; recién al salir los dos sigue el reloj.
    vida.pausarRotulo("BET", "foco", true);
    vida.pausarRotulo("BET", "mouse", false);
    expect(vida.rotuloDe("BET")!.quieto).toBe(true);
    vida.pausarRotulo("BET", "foco", false);
    expect(vida.rotuloDe("BET")!.quieto).toBe(false);
    expect(vida.proximo()).toBeGreaterThan(reloj.t);
    expect(correr(PASO_SALA_MS).filter((c) => c.sala === "BET")).toHaveLength(1);
  });

  it("un toque (pantalla táctil) pasa al siguiente y lo deja quieto 15 s", () => {
    const { vida, reloj, correr } = bancoRotulo();
    reloj.t = 100;
    expect(cuenta(vida, "BET")).toBe("toca:BET-200");
    vida.toqueRotulo("BET");
    expect(cuenta(vida, "BET")).toBe("trabaja:BET-100");
    const cambios = correr(QUIETO_TOQUE_MS + 6_000).filter((c) => c.sala === "BET");
    expect(cambios[0]!.t).toBe(100 + QUIETO_TOQUE_MS);
  });

  it("con movimiento reducido no cambia solo ni pide despertar; ‹ › se ven siempre", () => {
    const { vida, correr } = bancoRotulo({ op: { rm: true } });
    expect(vida.rotuloDe("BET")).toMatchObject({ item: { codigo: "BET-200" }, quieto: true });
    expect(vida.proximo()).toBeNull();
    expect(correr(60_000)).toHaveLength(0);
    vida.moverRotulo("BET", 1);
    expect(cuenta(vida, "BET")).toBe("trabaja:BET-100");
  });

  // JST-152: quieto es quieto, aunque llegue un sobre o una frase; ‹ › se ven al momento.
  /** Lo que muestra el rótulo de la sala cada vez que cambia mientras corre la vida (el vuelo del sobre también sube la versión). */
  const mirar = (b: ReturnType<typeof bancoRotulo>, sala: string, ms: number) => {
    const vistos: Array<{ t: number; ve: string | null }> = [];
    let antes = cuenta(b.vida, sala);
    b.correr(ms, (c) => {
      const ve = c.sala === sala ? cuenta(b.vida, sala) : antes;
      if (ve !== antes) vistos.push({ t: c.t, ve });
      antes = ve;
    });
    return vistos;
  };

  it("con el mouse o el foco encima, un sobre no lo cambia y ‹ › cambian lo que se ve; al soltarlo, el sobre se ve lo que le queda", () => {
    const b = bancoRotulo();
    const { vida, reloj } = b;
    vida.pausarRotulo("BET", "mouse", true);
    expect(vida.entrega("BET-0", "BET-2", "BET-300")).toBe(true);
    expect(vida.rotuloDe("BET")).toMatchObject({ item: { tipo: "toca", codigo: "BET-200" }, anillo: "BET-1" });
    expect(mirar(b, "BET", 1_000)).toEqual([]);
    vida.moverRotulo("BET", 1);
    expect(cuenta(vida, "BET")).toBe("trabaja:BET-100");
    vida.moverRotulo("BET", 1);
    expect(cuenta(vida, "BET")).toBe("trabaja:BET-102");
    // Al irse el sobre no salta nada.
    expect(mirar(b, "BET", SOBRE_MS)).toEqual([]);
    // Con el foco del teclado, igual.
    vida.pausarRotulo("BET", "foco", true);
    vida.pausarRotulo("BET", "mouse", false);
    const t0 = reloj.t;
    vida.entrega("BET-0", "BET-2", "BET-300");
    expect(mirar(b, "BET", 2_000)).toEqual([]);
    expect(cuenta(vida, "BET")).toBe("trabaja:BET-102");
    // Al soltarlo, el sobre se ve lo que le queda de sus 6 s.
    vida.pausarRotulo("BET", "foco", false);
    expect(cuenta(vida, "BET")).toBe("sobre:BET-300");
    expect(mirar(b, "BET", SOBRE_MS)[0]).toMatchObject({ t: t0 + SOBRE_MS });
  });

  it("si se veía un sobre al poner el mouse encima, sigue a la vista hasta ›, que muestra la de la vuelta que tapaba", () => {
    const b = bancoRotulo();
    const { vida } = b;
    vida.entrega("BET-0", "BET-2", "BET-300");
    vida.pausarRotulo("BET", "mouse", true);
    expect(mirar(b, "BET", 3 * SOBRE_MS)).toEqual([]);
    expect(cuenta(vida, "BET")).toBe("sobre:BET-300");
    vida.moverRotulo("BET", 1);
    expect(cuenta(vida, "BET")).toBe("toca:BET-200");
    vida.moverRotulo("BET", 1);
    expect(cuenta(vida, "BET")).toBe("trabaja:BET-100");
    // Al soltarlo, ya no vuelve.
    vida.pausarRotulo("BET", "mouse", false);
    expect(cuenta(vida, "BET")).not.toBe("sobre:BET-300");
  });

  it("después de un toque, ni un sobre ni una frase lo cambian hasta que pasan los 15 s", async () => {
    const b = bancoRotulo();
    b.reloj.t = 100;
    b.vida.toqueRotulo("BET");
    expect(cuenta(b.vida, "BET")).toBe("trabaja:BET-100");
    b.reloj.t += QUIETO_TOQUE_MS - 3_000;
    b.vida.entrega("BET-0", "BET-2", "BET-300");
    expect(mirar(b, "BET", 6_000)[0]).toMatchObject({ t: 100 + QUIETO_TOQUE_MS, ve: "sobre:BET-300" });
    // Una conversación (con «JST-91», de nombre conocido) no cambia el rótulo de JST mientras está quieto.
    const T: Record<string, Temas> = {
      "JST-3": { hecho: "JST-91", tituloHecho: "Re-QA de «Oficina global» 0.1.5", sigue: null },
      "JST-4": { hecho: "JST-77", sigue: { codigo: "JST-90", estado: "blocked" } },
    };
    const temas: FuenteTemas = { leer: async (a) => T[a.id] ?? { hecho: null, sigue: null }, guardado: (id) => T[id] ?? null };
    const agentes = agentesVida().map((a): AgenteVida => (a.st === "libre" && a.prefijo !== "JST" ? { ...a, st: "trabaja", codigo: `${a.id}-x`, run: { codigo: null, titulo: null, enCola: false } } : a));
    const { vida, reloj } = bancoRotulo({ op: { charlas: true }, temas, agentes });
    let dicha = false;
    let quieto: string | null = null;
    const cambios: Array<string | null> = [];
    for (let ms = 0; ms < 80_000; ms += 16) {
      reloj.t += 16;
      vida.paso(reloj.t);
      if (ms % 160 === 0) await new Promise((r) => setTimeout(r, 0));
      // Un toque cada 10 s: siempre quieto.
      if (ms % 10_000 === 0) {
        vida.toqueRotulo("JST");
        quieto = cuenta(vida, "JST");
      }
      if (vida.charlaDe("JST")) dicha = true;
      if (cuenta(vida, "JST") !== quieto) cambios.push(cuenta(vida, "JST"));
    }
    expect(dicha).toBe(true);
    expect(cambios).toEqual([]);
  }, 30_000);

  it("no hay rótulo en una sala a oscuras, fuera del filtro, ni sin nada que contar", () => {
    const { vida, sync } = bancoRotulo();
    sync({ activas: new Set(["BET", "ELM", "MIG"]) });
    expect(vida.rotuloDe("JST")).toBeNull();
    sync({ activas: TODAS, op: { filtro: ["BET"] } });
    expect(vida.rotuloDe("ELM")).toBeNull();
    expect(vida.rotuloDe("BET")).not.toBeNull();
    sync({ op: { filtro: [] }, agentes: agentesVida().map((a) => ({ ...a, st: "libre", need: false, espera: null, run: null })) });
    for (const s of HOY) expect(vida.rotuloDe(s.prefijo)).toBeNull();
    // Con la pestaña oculta, nada cambia.
    sync({ agentes: agentesVida(), op: { oculta: true } });
    expect(vida.proximo()).toBeNull();
  });

  it("una sala que vuelve a verse (filtro) o cuya vuelta cambia avisa al bucle: su próximo paso no se pierde", () => {
    const { vida, sync } = bancoRotulo();
    let despertado = 0;
    vida.fijarDespertador(() => (despertado += 1));
    sync({ op: { filtro: ["BET"] } });
    expect(despertado).toBe(1);
    expect(vida.rotuloDe("ELM")).toBeNull();
    sync({ op: { filtro: [] } });
    expect(despertado).toBe(2);
    expect(vida.rotuloDe("ELM")).not.toBeNull();
    // Nada cambió: no se despierta.
    sync();
    expect(despertado).toBe(2);
    // Alguien empieza a esperar tu respuesta (o cambia la tarea de su run): la vuelta cambia.
    sync({ agentes: agentesVida({ "JST-0": { espera: { codigo: "JST-300", titulo: "Algo", mas: 0 } } }) });
    expect(despertado).toBe(3);
  });

  it("a 1x: un solo rótulo bajo el piso que turna las empresas cada 5 s, sin sobres; no sale mientras carga", () => {
    const { vida, correr, sync } = bancoRotulo({ plano: armarPiso(HOY, 340, "widget-celular") });
    for (const s of HOY) expect(vida.rotuloDe(s.prefijo)).toBeNull();
    const vistos: string[] = [cuenta(vida, ROTULO_PISO)!];
    correr(5 * PASO_PISO_MS, (c) => c.sala === ROTULO_PISO && vistos.push(cuenta(vida, ROTULO_PISO)!));
    expect(vistos).toEqual(["toca:BET-200", "toca:ELM-200", "toca:JST-200", "toca:MIG-200", "trabaja:BET-100", "trabaja:ELM-100"]);
    expect(vida.rotuloDe(ROTULO_PISO)!.item.quien).toBe("Agente ELM-0");
    vida.entrega("BET-0", "BET-2", "BET-300");
    expect(vida.rotuloDe(ROTULO_PISO)!.item.tipo).not.toBe("sobre");
    sync({ op: { filtro: ["MIG"] } });
    expect(vida.rotuloDe(ROTULO_PISO)!.item.prefijo).toBe("MIG");
    sync({ op: { cargando: true } });
    expect(vida.rotuloDe(ROTULO_PISO)).toBeNull();
  });

  // 0.4.0 (JST-162 §5.3): la tarea de la conversación va en el hilo; el rótulo ya no la cuenta (en la 0.3.8 se adelantaba).
  it.each([false, true])("mientras conversan, el rótulo sigue su vuelta y no cuenta la tarea de la conversación (movimiento reducido: %s)", async (rm) => {
    const T: Record<string, Temas> = {
      "JST-3": { hecho: "JST-91", tituloHecho: "Re-QA de «Oficina global» 0.1.5", sigue: { codigo: "JST-90", estado: "todo", titulo: "Instalar la 0.1.5" } },
      "JST-4": { hecho: "JST-77", tituloHecho: "Probar el sobre", sigue: { codigo: "JST-92", estado: "todo", titulo: "Instalar la 0.2.0" } },
    };
    const temas: FuenteTemas = { leer: async (a) => T[a.id] ?? { hecho: null, sigue: null }, guardado: (id) => T[id] ?? null };
    // Solo JST tiene 2 libres en el descanso (JST-3 y JST-4): ahí va la conversación.
    const agentes = agentesVida().map((a): AgenteVida => (a.st === "libre" && a.prefijo !== "JST" ? { ...a, st: "trabaja", codigo: `${a.id}-x`, run: { codigo: null, titulo: null, enCola: false } } : a));
    const { vida, reloj } = bancoRotulo({ op: { charlas: true, rm }, temas, agentes });
    let frases = 0;
    const vistos = new Set<string>();
    for (let ms = 0; ms < 80_000; ms += 16) {
      reloj.t += 16;
      vida.paso(reloj.t);
      if (ms % 160 === 0) await new Promise((r) => setTimeout(r, 0));
      if (!vida.charlaDe("JST")) continue;
      frases += 1;
      const r = vida.rotuloDe("JST")!;
      expect(r.item.tipo === "toca" || r.item.tipo === "trabaja").toBe(true);
      // El anillo sigue en el globo de quien cuenta el rótulo.
      expect(r.anillo).toBe(r.item.agente);
      vistos.add(r.item.clave);
    }
    expect(frases).toBeGreaterThan(0);
    // Con movimiento reducido el rótulo no avanza solo; si no, sigue su vuelta mientras conversan.
    if (!rm) expect(vistos.size).toBeGreaterThan(1);
  }, 30_000);

  // JST-155: al volver, las salas que avanzaron mientras no se veía cambiaban todas en el mismo instante.
  it.each([3_000, 15_000])("al volver a la pestaña (oculta %i ms) cada rótulo sigue con lo que contaba y cambia en su propio paso", (oculta) => {
    const { vida, reloj, sync, correr } = bancoRotulo();
    const salas = HOY.map((s) => s.prefijo);
    correr(10_000);
    const antes = salas.map((s) => cuenta(vida, s));
    sync({ op: { oculta: true } });
    reloj.t += oculta;
    sync({ op: { oculta: false, releyendo: true } });
    // React vuelve a dibujar todas las salas: cada una cuenta lo mismo que al ocultarse.
    expect(salas.map((s) => cuenta(vida, s))).toEqual(antes);
    // Llega la relectura: lo que contaba BET ya no está en su vuelta. Tampoco cambia todavía.
    sync({ op: { releyendo: false }, agentes: agentesVida({ "BET-0": { st: "libre", codigo: null, run: null } }) });
    expect(salas.map((s) => cuenta(vida, s))).toEqual(antes);
    expect(antes[0]).toBe("trabaja:BET-100");
    // Cada sala cambia (si le toca otra cosa) en el próximo paso de su reloj: nunca dos a la vez.
    const cambios = correr(PASO_SALA_MS).filter((c) => c.sala !== ROTULO_PISO);
    expect(cambios.map((c) => c.sala)).toContain("BET");
    expect(new Set(cambios.map((c) => c.sala)).size).toBe(cambios.length);
    expect(new Set(cambios.map((c) => c.t)).size).toBe(cambios.length);
    for (const c of cambios) expect((c.t + desfase(salas.indexOf(c.sala), salas.length)) % PASO_SALA_MS).toBe(0);
    expect(cuenta(vida, "BET")).not.toBe("trabaja:BET-100");
  });

  it("al volver a la pestaña, si el usuario deja quieto el rótulo, al soltarlo sigue el reloj (JST-155)", () => {
    const { vida, reloj, sync } = bancoRotulo();
    reloj.t = 10_000;
    expect(cuenta(vida, "BET")).toBe("trabaja:BET-100");
    sync({ op: { oculta: true } });
    reloj.t += 3_000;
    sync({ op: { oculta: false } });
    expect(cuenta(vida, "BET")).toBe("trabaja:BET-100");
    // Entra y sale el mouse (React dibuja entre uno y otro).
    vida.pausarRotulo("BET", "mouse", true);
    expect(cuenta(vida, "BET")).toBe("trabaja:BET-100");
    vida.pausarRotulo("BET", "mouse", false);
    expect(cuenta(vida, "BET")).toBe("trabaja:BET-102");
  });

  // JST-158: con la pestaña oculta la página vuelve a dibujar cada 30 s (la hora), y al volver ya contaban otra cosa todos juntos.
  it.each<[string, PisoPlano, string[]]>([
    ["las salas", armarPiso(HOY, 576, "computador"), HOY.map((s) => s.prefijo)],
    ["el de 1x", armarPiso(HOY, 340, "widget-celular"), [ROTULO_PISO]],
  ])("con la pestaña oculta, aunque la página vuelva a dibujar, sigue lo que se veía al irse: %s (JST-158)", (_, plano, claves) => {
    const { vida, reloj, sync, correr } = bancoRotulo({ plano });
    correr(10_000);
    const antes = claves.map((c) => cuenta(vida, c));
    sync({ op: { oculta: true } });
    for (const ms of [30_000, 10_000]) {
      reloj.t += ms;
      sync();
      expect(claves.map((c) => cuenta(vida, c))).toEqual(antes);
    }
    sync({ op: { oculta: false, releyendo: true } });
    expect(claves.map((c) => cuenta(vida, c))).toEqual(antes);
    // Y después cada uno cambia en su propio paso.
    const cambios = correr(PASO_SALA_MS).filter((c) => claves.includes(c.sala));
    expect(cambios.length).toBeGreaterThan(0);
    expect(new Set(cambios.map((c) => c.t)).size).toBe(cambios.length);
  });
});
