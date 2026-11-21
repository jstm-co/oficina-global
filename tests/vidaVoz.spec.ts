// 0.6.0 (JST-226, opción C del spike de JST-224): la vida prepara la próxima
// conversación con voz un minuto antes, la empieza cuando están sus audios y le
// toca el turno, y la descarta si no; y le cuenta a la voz las frases sueltas,
// las mascotas y las entregas, solo con su tipo prendido.
import { describe, expect, it } from "vitest";
import { DICEN, duracionFrase, Guionista, PAREJA_MS, type AgenteCharla, type ContextoCharla } from "../src/charlas.js";
import { armarPiso, type EntradaSala } from "../src/plano.js";
import { GRACIA_PREPARADA_MS, JUNTOS_MS, PLAZO_PREPARADA_MS, VOZ_EXTRA_MS, Vida, type AgenteVida, type HechoVoz, type OpcionesVida, type VozVida } from "../src/vida.js";
import type { Dibujo } from "../src/vista.js";

const HOY: EntradaSala[] = [
  { prefijo: "BET", agentes: 9 },
  { prefijo: "ELM", agentes: 4 },
  { prefijo: "JST", agentes: 5 },
  { prefijo: "MIG", agentes: 8 },
];
const PISO = armarPiso(HOY, 576, "computador");
const TODAS: ReadonlySet<string> = new Set(HOY.map((s) => s.prefijo));
const OP: OpcionesVida = { rm: false, charlas: true, mascotas: false, cargando: false, oculta: false };

/** Todos trabajando salvo los que se indican. */
function agentes(cambios: Record<string, Dibujo> = {}): AgenteVida[] {
  return HOY.flatMap((s) =>
    Array.from({ length: s.agentes }, (_, i) => {
      const id = `${s.prefijo}-${i}`;
      const st = cambios[id] ?? "trabaja";
      return { id, companyId: `c-${s.prefijo}`, prefijo: s.prefijo, st, need: st === "toca", codigo: st === "trabaja" ? `${id}T` : null, nombre: `Agente ${id}`, empresa: s.prefijo };
    }),
  );
}

const libres = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, "libre" as Dibujo]));

function semilla(n = 7): () => number {
  let s = n;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Una voz de mentira: anota lo que la vida le cuenta. `libre`: si le toca el turno a la conversación. */
class VozFalsa implements VozVida {
  hechos: HechoVoz[] = [];
  libre = true;
  leer = { charlas: true, entregas: true, mascotas: true, sueltas: true };
  lee(t: "charlas" | "entregas" | "mascotas" | "sueltas") {
    return this.leer[t];
  }
  libreParaCharla() {
    return this.libre;
  }
  hecho(h: HechoVoz) {
    this.hechos.push(h);
  }
  de<T extends HechoVoz["tipo"]>(tipo: T): Array<Extract<HechoVoz, { tipo: T }>> {
    return this.hechos.filter((h): h is Extract<HechoVoz, { tipo: T }> => h.tipo === tipo);
  }
}

function banco(cambios: Record<string, Dibujo>, op: Partial<OpcionesVida> = {}) {
  const reloj = { t: 1_000 };
  const vida = new Vida({ ahora: () => reloj.t, azar: semilla() });
  const voz = new VozFalsa();
  let estado = agentes(cambios);
  let opciones = { ...OP, ...op };
  const sync = (o: { cambios?: Record<string, Dibujo>; op?: Partial<OpcionesVida> } = {}) => {
    if (o.cambios) estado = agentes(o.cambios);
    if (o.op) opciones = { ...opciones, ...o.op };
    vida.sincronizar(PISO, estado, TODAS, opciones);
  };
  sync();
  vida.fijarVoz(voz);
  const avanzar = (ms: number) => {
    for (let k = 0; k < ms; k += 16) {
      reloj.t += 16;
      vida.paso(reloj.t);
    }
  };
  const hasta = (listo: () => boolean, max = 60_000) => {
    let ms = 0;
    while (!listo() && ms < max) {
      reloj.t += 16;
      ms += 16;
      vida.paso(reloj.t);
    }
    return ms;
  };
  return { vida, voz, reloj, sync, avanzar, hasta };
}

/** Las conversaciones vivas (es interno: solo para mirar quién conversa). */
const charlas = (v: Vida) => (v as unknown as { charlas: Array<{ id: number; prefijo: string; a: string; b: string; voz: boolean; durs: number[] }> }).charlas;

describe("la conversación con voz se prepara un minuto antes (opción C de JST-224)", () => {
  it("prepara una pareja libre de una sala que se ve, sin empezarla, y le pide sus audios a la voz", () => {
    const { vida, voz } = banco(libres("JST-0", "JST-1", "JST-2"));
    vida.paso(1_016);
    const [p] = voz.de("preparar");
    expect(p).toBeTruthy();
    expect(p!.plazo).toBe(PLAZO_PREPARADA_MS);
    expect(p!.companyId).toBe("c-JST");
    const pr = vida.vozPreparada()!;
    expect(pr.prefijo).toBe("JST");
    expect(["JST-0", "JST-1", "JST-2"]).toContain(pr.a);
    expect(["JST-0", "JST-1", "JST-2"]).toContain(pr.b);
    expect(p!.lineas).toEqual(pr.lineas);
    expect(pr.lista).toBe(false);
    expect(charlas(vida)).toHaveLength(0);
  });

  it("con el filtro por empresa, solo de esas salas", () => {
    const { vida, voz } = banco(libres("JST-0", "JST-1", "MIG-0", "MIG-1"), { filtro: ["MIG"] });
    vida.paso(1_016);
    expect(voz.de("preparar")).toHaveLength(1);
    expect(vida.vozPreparada()!.prefijo).toBe("MIG");
  });

  it("su pareja no conversa sin voz mientras espera; los demás de la sala sí", () => {
    const { vida, avanzar } = banco(libres("BET-0", "BET-1", "BET-2", "BET-3"));
    vida.paso(1_016);
    const pr = vida.vozPreparada()!;
    let otras = 0;
    for (let k = 0; k < 40; k++) {
      avanzar(1_000);
      for (const c of charlas(vida)) {
        expect([c.a, c.b]).not.toContain(pr.a);
        expect([c.a, c.b]).not.toContain(pr.b);
        otras += 1;
      }
    }
    expect(otras).toBeGreaterThan(0);
  });

  it("empieza cuando están sus audios y le toca el turno; cada globo dura lo de siempre o su audio + 0,4 s; cada frase se cuenta al aparecer", () => {
    const { vida, voz, avanzar, hasta } = banco(libres("JST-0", "JST-1"));
    vida.paso(1_016);
    const pr = vida.vozPreparada()!;
    const ms = pr.lineas.map((_, i) => (i === 0 ? 6_000 : 900));
    voz.libre = false;
    vida.preparadaLista(pr.id, ms);
    expect(vida.vozPreparada()!.lista).toBe(true);
    // No le toca el turno (un aviso, el minuto): espera.
    avanzar(5_000);
    expect(charlas(vida)).toHaveLength(0);
    voz.libre = true;
    avanzar(32);
    const ch = charlas(vida)[0]!;
    expect(ch).toBeTruthy();
    expect(ch.id).toBe(pr.id);
    expect(ch.voz).toBe(true);
    expect([ch.a, ch.b].sort()).toEqual([pr.a, pr.b].sort());
    expect(ch.durs).toEqual(pr.lineas.map((l, i) => Math.max(duracionFrase(l), ms[i]! + VOZ_EXTRA_MS)));
    expect(ch.durs[0]).toBe(6_400);
    expect(voz.de("charla")[0]).toMatchObject({ id: pr.id });
    // Mientras suena, ya se prepara la siguiente (con otra pareja: estos 2 conversan).
    hasta(() => charlas(vida).length === 0, 60_000);
    expect(voz.de("frase").map((f) => f.i)).toEqual(pr.lineas.map((_, i) => i));
    expect(voz.de("frase").map((f) => f.ms)).toEqual(ch.durs);
    expect(voz.de("fin-charla")).toEqual([{ tipo: "fin-charla", id: pr.id }]);
  });

  it("si sus audios no llegan en el minuto, se descarta y se prepara otra con otra pareja (tarjeta de JST-224)", () => {
    const { vida, voz, avanzar } = banco(libres("JST-0", "JST-1", "JST-2"));
    vida.paso(1_016);
    const pr = vida.vozPreparada()!;
    avanzar(PLAZO_PREPARADA_MS - 1_000);
    expect(voz.de("soltar")).toHaveLength(0);
    avanzar(1_100);
    expect(voz.de("soltar")).toEqual([{ tipo: "soltar", id: pr.id }]);
    const otra = vida.vozPreparada()!;
    expect(otra.id).not.toBe(pr.id);
    expect([otra.a, otra.b].sort()).not.toEqual([pr.a, pr.b].sort());
    expect(voz.de("preparar")).toHaveLength(2);
    // Nada se empezó con voz.
    expect(voz.de("charla")).toHaveLength(0);
  });

  it("si la voz no puede hacer algún audio (un clon con la Mac cargada), se descarta al tiro y esa pareja no vuelve en 2 min", () => {
    const { vida, voz, avanzar } = banco(libres("JST-0", "JST-1"));
    vida.paso(1_016);
    const pr = vida.vozPreparada()!;
    vida.preparadaNo(pr.id);
    expect(voz.de("soltar")).toEqual([{ tipo: "soltar", id: pr.id }]);
    // Son los únicos libres: en 2 min no se prepara ninguna (pueden conversar sin voz, como hoy).
    avanzar(PAREJA_MS - 2_000);
    expect(voz.de("preparar")).toHaveLength(1);
    // Después sí (cuando se cumplen 2 min desde que conversaron, si conversaron).
    for (let k = 0; k < 200 && !vida.vozPreparada(); k++) avanzar(1_000);
    expect(vida.vozPreparada()).not.toBeNull();
  });

  it("si alguno de la pareja deja de estar libre, se descarta", () => {
    const { vida, voz, sync, avanzar } = banco(libres("JST-0", "JST-1", "JST-2"));
    vida.paso(1_016);
    const pr = vida.vozPreparada()!;
    vida.preparadaLista(pr.id, pr.lineas.map(() => 1_000));
    voz.libre = false;
    const resto = ["JST-0", "JST-1", "JST-2"].filter((x) => x !== pr.a);
    sync({ cambios: libres(...resto) });
    avanzar(32);
    expect(voz.de("soltar")[0]).toEqual({ tipo: "soltar", id: pr.id });
  });

  it("con sus audios listos espera su turno como mucho 30 s más; después, se descarta", () => {
    const { vida, voz, avanzar } = banco(libres("JST-0", "JST-1", "JST-2"));
    vida.paso(1_016);
    const pr = vida.vozPreparada()!;
    vida.preparadaLista(pr.id, pr.lineas.map(() => 1_000));
    voz.libre = false;
    avanzar(PLAZO_PREPARADA_MS + GRACIA_PREPARADA_MS - 500);
    expect(voz.de("soltar")).toHaveLength(0);
    avanzar(1_000);
    expect(voz.de("soltar")[0]).toEqual({ tipo: "soltar", id: pr.id });
  });

  it("un audio de más de 8 s: esa conversación no se lee", () => {
    const { vida, voz } = banco(libres("JST-0", "JST-1"));
    vida.paso(1_016);
    const pr = vida.vozPreparada()!;
    vida.preparadaLista(pr.id, pr.lineas.map((_, i) => (i === 0 ? 8_500 : 1_000)));
    expect(voz.de("soltar")[0]).toEqual({ tipo: "soltar", id: pr.id });
  });

  it("un aviso la corta: lo que le queda se ve sin voz (no se cuentan más frases)", () => {
    const { vida, voz, avanzar, hasta } = banco(libres("JST-0", "JST-1"));
    vida.paso(1_016);
    const pr = vida.vozPreparada()!;
    vida.preparadaLista(pr.id, pr.lineas.map(() => 800));
    hasta(() => voz.de("frase").length > 0, 30_000);
    vida.callarCharla(pr.id);
    avanzar(2_000);
    const antes = voz.de("frase").length;
    hasta(() => charlas(vida).length === 0, 30_000);
    expect(voz.de("frase")).toHaveLength(antes);
    expect(voz.de("frase")).toHaveLength(1);
  });

  it("apagado no gasta nada: sin voz, con «Conversaciones» apagada o sin su casilla no se prepara ninguna", () => {
    const a = banco(libres("JST-0", "JST-1"));
    a.vida.fijarVoz(null);
    a.avanzar(5_000);
    expect(a.voz.hechos).toEqual([]);
    const b = banco(libres("JST-0", "JST-1"), { charlas: false });
    b.avanzar(5_000);
    expect(b.voz.de("preparar")).toHaveLength(0);
    const c = banco(libres("JST-0", "JST-1"));
    c.voz.leer.charlas = false;
    c.avanzar(5_000);
    expect(c.voz.de("preparar")).toHaveLength(0);
  });

  it("sin voz (se apagan las voces o se oculta la pestaña) la preparada se suelta y la que suena sigue sin voz", () => {
    const { vida, voz, hasta } = banco(libres("JST-0", "JST-1"));
    vida.paso(1_016);
    const pr = vida.vozPreparada()!;
    vida.preparadaLista(pr.id, pr.lineas.map(() => 800));
    hasta(() => voz.de("frase").length > 0, 30_000);
    vida.fijarVoz(null);
    expect(voz.de("fin-charla")).toEqual([{ tipo: "fin-charla", id: pr.id }]);
    expect(charlas(vida)[0]!.voz).toBe(false);
  });
});

describe("rearmar: lo preparado un minuto antes, con los datos de ahora", () => {
  const ag = (id: string, prefijo: string, o: Partial<AgenteCharla> = {}): AgenteCharla => ({ id, prefijo, nombre: id, empresa: prefijo, st: "libre", need: false, rol: null, rolApi: null, motivo: null, espera: null, run: null, ...o });
  const ctx = (agentes: AgenteCharla[], o: Partial<ContextoCharla> = {}): ContextoCharla => ({
    prefijo: "JST",
    a: agentes[0]!,
    b: agentes[1]!,
    agentes,
    temas: () => ({ hecho: "JST-9", tituloHecho: "Una tarea", sigue: null }),
    titulo: () => null,
    reloj: Date.UTC(2026, 9, 23, 15),
    ahora: 0,
    azar: semilla(3),
    ...o,
  });

  it("si nada cambió, dice lo mismo (y del mismo agente, aunque ahora el otro también tenga qué contar)", () => {
    const g = new Guionista();
    const xs = [ag("Ana", "JST"), ag("Beto", "JST")];
    const hecho = { hecho: "JST-9", tituloHecho: "Una tarea", sigue: null };
    // Al prepararla, solo Beto había terminado algo: habla de lo de Beto.
    const x = g.armar(ctx(xs, { temas: (id) => (id === "Beto" ? hecho : { hecho: null, sigue: null }) }), "termino")!;
    expect(x.sujeto).toBe("Beto");
    expect(g.rearmar(ctx(xs, { temas: (id) => (id === "Beto" ? hecho : { hecho: null, sigue: null }), ahora: 60_000 }), x)!.lineas).toEqual(x.lineas);
    // Ahora Ana también: sigue siendo lo de Beto.
    expect(g.rearmar(ctx(xs, { temas: () => hecho, ahora: 60_000 }), x)!.lineas).toEqual(x.lineas);
  });

  it("si cambió (quien esperaba ya no espera), no dice lo mismo", () => {
    const g = new Guionista();
    const espera = { tipo: "tarjeta" as const, codigo: "JST-5", desde: null };
    const xs = [ag("Ana", "JST"), ag("Beto", "JST"), ag("Caro", "JST", { need: true, st: "toca", espera })];
    const x = g.armar(ctx(xs), "te-espera")!;
    expect(x.lineas.map((l) => l.texto).join(" ")).toMatch(/Caro/);
    const ahora = g.rearmar(ctx([xs[0]!, xs[1]!, { ...xs[2]!, need: false, st: "libre", espera: null }]), x);
    expect(ahora?.lineas.map((l) => l.texto)).not.toEqual(x.lineas.map((l) => l.texto));
  });

  it("«¿Cómo están en …?» habla de la misma empresa", () => {
    const g = new Guionista();
    const xs = [ag("Ana", "JST"), ag("Beto", "JST"), ag("B1", "BET"), ag("E1", "ELM"), ag("M1", "MIG")];
    const x = g.armar(ctx(xs, { azar: semilla(11) }), "empresa")!;
    for (let s = 1; s < 30; s++) expect(g.rearmar(ctx(xs, { azar: semilla(s) }), x)!.lineas).toEqual(x.lineas);
  });
});

describe("lo demás que la vida le cuenta a la voz, solo con su tipo prendido", () => {
  it("una frase suelta de quien está solo en el descanso", () => {
    const { vida, voz, avanzar } = banco(libres("JST-0"));
    avanzar(100_000);
    const [s] = voz.de("suelta");
    expect(s).toMatchObject({ quien: "JST-0", companyId: "c-JST" });
    expect(s!.ms).toBeGreaterThanOrEqual(2_500);
    const b = banco(libres("JST-0"));
    b.voz.leer.sueltas = false;
    b.avanzar(100_000);
    expect(b.voz.de("suelta")).toHaveLength(0);
    // El globo dura lo que su audio + 0,4 s si el audio es más largo.
    vida.alargarSuelta(s!.id, 9_000);
    const antes = vida.sueltaDe("JST");
    if (antes) {
      avanzar(8_000);
      expect(vida.sueltaDe("JST")?.clave).toBe(antes.clave);
    }
  });

  it("la mascota que tocas (y, en el TV, la que despierta sola)", () => {
    const { vida, voz, avanzar } = banco({}, { mascotas: true });
    vida.tocarMascota("gato");
    expect(voz.de("mascota")).toEqual([{ tipo: "mascota", id: "gato", texto: expect.any(String), sola: false }]);
    expect(DICEN.gato).toContain((voz.de("mascota")[0] as { texto: string }).texto);
    voz.leer.mascotas = false;
    vida.tocarMascota("perro");
    expect(voz.de("mascota")).toHaveLength(1);
    const tv = banco({}, { mascotas: true, mascotasSolas: true });
    tv.avanzar(300_000);
    expect(tv.voz.de("mascota").length).toBeGreaterThan(0);
    expect(tv.voz.de("mascota").every((m) => m.sola)).toBe(true);
    void avanzar;
  });

  it("la entrega en la mesa: al salir (para pedir sus audios) y cuando se juntan; con sobre, al salir", () => {
    const { vida, voz, hasta } = banco(libres("JST-1"));
    expect(vida.entrega("JST-0", "JST-1", "JST-12")).toBe(true);
    expect(voz.de("entrega")[0]).toMatchObject({ como: "mesa", fase: "sale", de: "JST-0", a: "JST-1", companyId: "c-JST" });
    hasta(() => voz.de("entrega").length > 1, 30_000);
    expect(voz.de("entrega")[1]).toMatchObject({ como: "mesa", fase: "hablan", de: "JST-0", a: "JST-1" });
    // Quien recibe trabaja: va el sobre.
    expect(vida.entrega("BET-0", "BET-1", "BET-12")).toBe(true);
    expect(voz.de("entrega").at(-1)).toMatchObject({ como: "sobre", fase: "sale", de: "BET-0", a: "BET-1" });
    const b = banco(libres("JST-1"));
    b.voz.leer.entregas = false;
    b.vida.entrega("JST-0", "JST-1", "JST-12");
    expect(b.voz.de("entrega")).toHaveLength(0);
  });

  it("el sobre sigue a la vista mientras suena lo que dice quien entrega, hasta su audio + 0,4 s (JST-240)", () => {
    // Sin audio: vuela (1–1,8 s), llega (270 ms) y se abre (340 ms).
    const solo = banco({});
    solo.vida.entrega("BET-0", "BET-1", "BET-12");
    const idSolo = solo.voz.de("entrega").at(-1)!.id;
    expect(solo.vida.haySobre(idSolo)).toBe(true);
    const sinVoz = solo.hasta(() => !solo.vida.haySobre(idSolo), 10_000);
    expect(sinVoz).toBeLessThan(2_500);

    // Con la frase de la QA (3,13 s) desde que sale el sobre: se queda abierto en el escritorio hasta 3,53 s.
    const { vida, voz, reloj, hasta } = banco({});
    vida.entrega("BET-0", "BET-1", "BET-12");
    const id = voz.de("entrega").at(-1)!.id;
    const t0 = reloj.t;
    vida.alargarSobre(id, 3_130 + VOZ_EXTRA_MS);
    hasta(() => vida.sobresDe("BET", false)[0]?.fase === "abre", 10_000);
    // Sin nada que se mueva, la página despierta cuando le toca a la vida (`proximo`): el sobre se va justo a los 3,53 s.
    let antes = reloj.t;
    for (let k = 0; k < 20 && vida.haySobre(id); k++) {
      expect(vida.sobresDe("BET", false)[0]?.fase).toBe("abre");
      antes = reloj.t;
      const t = vida.proximo();
      expect(t).not.toBeNull();
      reloj.t = Math.max(reloj.t + 1, t!);
      vida.paso(reloj.t);
    }
    expect(vida.haySobre(id)).toBe(false);
    expect(antes - t0).toBeLessThan(3_130 + VOZ_EXTRA_MS);
    expect(reloj.t - t0).toBe(3_130 + VOZ_EXTRA_MS);

    // Con movimiento reducido (quieto en el escritorio, 4 s desde que está sentado), también.
    const rm = banco({}, { rm: true });
    rm.vida.entrega("BET-0", "BET-1", "BET-12");
    const idRm = rm.voz.de("entrega").at(-1)!.id;
    rm.vida.alargarSobre(idRm, 6_000);
    expect(rm.hasta(() => !rm.vida.haySobre(idRm), 10_000)).toBeGreaterThanOrEqual(6_000);
  });

  it("lo que les queda juntos en la mesa (JST-237): 9 s desde que se juntan; 0 mientras caminan, al separarse o si se corta", () => {
    const { vida, voz, avanzar, hasta } = banco(libres("JST-1"));
    vida.entrega("JST-0", "JST-1", "JST-12");
    const id = voz.de("entrega")[0]!.id;
    expect(vida.restoJunta(id)).toBe(0);
    hasta(() => voz.de("entrega").length > 1, 30_000);
    expect(vida.restoJunta(id)).toBe(JUNTOS_MS);
    avanzar(4_000);
    expect(vida.restoJunta(id)).toBe(JUNTOS_MS - 4_000);
    avanzar(5_000);
    expect(vida.restoJunta(id)).toBe(0);
    // A quien recibe le cambia el estado: se corta y ya no les queda nada.
    const b = banco(libres("JST-1"));
    b.vida.entrega("JST-0", "JST-1", "JST-12");
    b.hasta(() => b.voz.de("entrega").length > 1, 30_000);
    const id2 = b.voz.de("entrega")[0]!.id;
    expect(b.vida.restoJunta(id2)).toBe(JUNTOS_MS);
    b.sync({ cambios: { "JST-1": "toca" } });
    b.avanzar(16);
    expect(b.vida.restoJunta(id2)).toBe(0);
  });
});
