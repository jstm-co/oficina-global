import { describe, expect, it } from "vitest";
import {
  AUSENCIA_MIN_MS,
  desdeDicho,
  CLAVE_RECORDADOS,
  ESPERA_MAX_RECORDAR_MS,
  ESPERA_RECORDAR_MS,
  esperanDesde,
  hayQueRecordar,
  horaDicha,
  InicioDeTareas,
  marcarRecordadas,
  nivelDeEspera,
  RachaErrores,
  rachaParaVoz,
  RecordadosEspera,
  RegistroSucesos,
  SinNadie,
  textoRacha,
  textoRecordatorio,
  textoSinNadie,
  textoVolver,
  tocaRecordar,
  unaPorAgente,
  VENTANA_RACHA_MS,
  vencidos,
} from "../src/dichos.js";

const MIN = 60_000;
const H = 60 * MIN;
// Un lunes a las 15:00 hora local, para que las horas dichas no dependan de la zona.
const AHORA = new Date(2026, 5, 15, 15, 0, 0).getTime();
const iso = (t: number) => new Date(t).toISOString();

describe("InicioDeTareas: cuándo empezó el agente la tarea", () => {
  const run = (id: string, issueId: string | null, desde: number | null, enCola = false) => ({ id, issueId, enCola, desde: desde == null ? null : iso(desde) });
  /** La vigía ve primero al agente libre y después trabajando: así sí vio el comienzo. */
  const vistoLibre = (x: InicioDeTareas, ...ids: string[]) => x.observar(ids.map((id) => ({ id, run: null })));

  it("guarda el inicio del run que empieza la tarea, si se vio empezar", () => {
    const x = new InicioDeTareas();
    vistoLibre(x, "ana");
    x.observar([{ id: "ana", run: run("r1", "T1", AHORA - 12 * MIN) }]);
    expect(x.inicioDe("ana", "T1")).toBe(AHORA - 12 * MIN);
    expect(x.vio("ana", "T1")).toBe(true);
  });

  it("no se pisa al leer otra vez el mismo run", () => {
    const x = new InicioDeTareas();
    vistoLibre(x, "ana");
    x.observar([{ id: "ana", run: run("r1", "T1", AHORA - 12 * MIN) }]);
    x.observar([{ id: "ana", run: run("r1", "T1", AHORA - 5 * MIN) }]);
    expect(x.inicioDe("ana", "T1")).toBe(AHORA - 12 * MIN);
  });

  it("un run nuevo de la MISMA tarea conserva el primer inicio (una tarea de 3 h en varios runs)", () => {
    const x = new InicioDeTareas();
    vistoLibre(x, "ana");
    x.observar([{ id: "ana", run: run("r1", "T1", AHORA - 180 * MIN) }]);
    x.observar([{ id: "ana", run: run("r2", "T1", AHORA - 3 * MIN) }]);
    expect(x.inicioDe("ana", "T1")).toBe(AHORA - 180 * MIN);
  });

  it("una tarea distinta empieza de nuevo", () => {
    const x = new InicioDeTareas();
    vistoLibre(x, "ana");
    x.observar([{ id: "ana", run: run("r1", "T1", AHORA - 90 * MIN) }]);
    x.observar([{ id: "ana", run: run("r2", "T2", AHORA - 10 * MIN) }]);
    expect(x.inicioDe("ana", "T2")).toBe(AHORA - 10 * MIN);
    expect(x.inicioDe("ana", "T1")).toBeNull();
  });

  it("si la primera vez que se ve al agente ya estaba en esa tarea, el comienzo no se vio: no se sabe", () => {
    const x = new InicioDeTareas();
    x.observar([{ id: "ana", run: run("r1", "T1", AHORA - 12 * MIN) }]);
    expect(x.inicioDe("ana", "T1")).toBeNull();
    // Aunque la vigía lo vio trabajando en ella (para «quedé bloqueado»).
    expect(x.vio("ana", "T1")).toBe(true);
    // Y un run nuevo de la misma tarea no inventa el comienzo.
    x.observar([{ id: "ana", run: run("r2", "T1", AHORA - 1 * MIN) }]);
    expect(x.inicioDe("ana", "T1")).toBeNull();
  });

  it("sin dato, nada: en cola, sin fecha, sin tarea, otra tarea u otro agente", () => {
    const x = new InicioDeTareas();
    vistoLibre(x, "ana", "beto", "caro", "dani");
    x.observar([
      { id: "ana", run: run("r1", "T1", AHORA - 12 * MIN, true) },
      { id: "beto", run: run("r2", "T2", null) },
      { id: "caro", run: run("r3", null, AHORA - MIN) },
      { id: "dani", run: null },
    ]);
    expect(x.inicioDe("ana", "T1")).toBeNull();
    expect(x.vio("ana", "T1")).toBe(false);
    expect(x.inicioDe("beto", "T2")).toBeNull();
    expect(x.inicioDe("caro", "T1")).toBeNull();
    x.observar([{ id: "ana", run: run("r1", "T1", AHORA - 12 * MIN) }]);
    expect(x.inicioDe("ana", "T9")).toBeNull();
    expect(x.inicioDe("zeta", "T1")).toBeNull();
    expect(x.vio("zeta", "T1")).toBe(false);
    // Una fecha ilegible no cuenta.
    vistoLibre(x, "eli");
    x.observar([{ id: "eli", run: { id: "r9", issueId: "T5", enCola: false, desde: "ayer" } }]);
    expect(x.inicioDe("eli", "T5")).toBeNull();
  });

  it("un run en cola que después empieza sí cuenta (se vio al agente antes)", () => {
    const x = new InicioDeTareas();
    x.observar([{ id: "ana", run: run("r1", "T1", AHORA, true) }]);
    x.observar([{ id: "ana", run: run("r1", "T1", AHORA + MIN) }]);
    expect(x.inicioDe("ana", "T1")).toBe(AHORA + MIN);
  });

  it("limpiar olvida todo", () => {
    const x = new InicioDeTareas();
    vistoLibre(x, "ana");
    x.observar([{ id: "ana", run: run("r1", "T1", AHORA - 12 * MIN) }]);
    x.limpiar();
    expect(x.vio("ana", "T1")).toBe(false);
  });
});

describe("racha de errores", () => {
  it("el texto: tercer, cuarto, quinto y de ahí «otro»; antes de 3 nada", () => {
    expect(textoRacha(1)).toBeNull();
    expect(textoRacha(2)).toBeNull();
    expect(textoRacha(3)).toBe("tercer error seguido");
    expect(textoRacha(4)).toBe("cuarto error seguido");
    expect(textoRacha(5)).toBe("quinto error seguido");
    expect(textoRacha(6)).toBe("otro error seguido");
    expect(textoRacha(40)).toBe("otro error seguido");
    expect(textoRacha(null)).toBeNull();
    expect(textoRacha(undefined)).toBeNull();
  });

  it("cuenta los seguidos dentro de 2 horas y un run exitoso la corta", () => {
    const r = new RachaErrores();
    expect(r.fallo("ana", AHORA, "r1")).toBe(1);
    expect(r.fallo("ana", AHORA + 10 * MIN, "r2")).toBe(2);
    expect(r.fallo("ana", AHORA + 20 * MIN, "r3")).toBe(3);
    // Otro agente va aparte.
    expect(r.fallo("beto", AHORA + 21 * MIN, "r4")).toBe(1);
    r.exito("ana");
    expect(r.fallo("ana", AHORA + 30 * MIN, "r5")).toBe(1);
  });

  it("a la voz solo pasa la racha desde el mínimo (con 1 y 2 el error va por el camino de siempre)", () => {
    expect(rachaParaVoz(1, true)).toBeNull();
    expect(rachaParaVoz(2, true)).toBeNull();
    expect(rachaParaVoz(3, true)).toBe(3);
    expect(rachaParaVoz(7, true)).toBe(7);
    expect(rachaParaVoz(5, false)).toBeNull();
    expect(rachaParaVoz(null, true)).toBeNull();
  });

  it("el mismo run avisado dos veces cuenta una", () => {
    const r = new RachaErrores();
    expect(r.fallo("ana", AHORA, "r1")).toBe(1);
    expect(r.fallo("ana", AHORA + 1000, "r1")).toBe(1);
  });

  it("los errores de hace más de 2 horas ya no cuentan", () => {
    const r = new RachaErrores();
    r.fallo("ana", AHORA, "r1");
    r.fallo("ana", AHORA + 10 * MIN, "r2");
    expect(r.fallo("ana", AHORA + VENTANA_RACHA_MS + 11 * MIN, "r3")).toBe(1);
  });
});

describe("empresa sin nadie trabajando", () => {
  const cuentas = (n: number, otra?: number) => new Map<string, number>([["emp1", n], ...(otra === undefined ? [] : ([["emp2", otra]] as Array<[string, number]>))]);

  /** Dos trabajando durante 12 minutos, y después cero. */
  const trabajoSostenido = (s: SinNadie, t0: number, emp = cuentas) => {
    s.observar(t0, emp(2));
    s.observar(t0 + 12 * MIN, emp(1));
  };

  it("avisa cuando una empresa con trabajo sostenido lleva 3 minutos seguidos en cero", () => {
    const s = new SinNadie();
    trabajoSostenido(s, AHORA);
    expect(s.observar(AHORA + 13 * MIN, cuentas(0))).toEqual([]);
    expect(s.observar(AHORA + 15 * MIN, cuentas(0))).toEqual([]);
    expect(s.observar(AHORA + 16 * MIN, cuentas(0))).toEqual(["emp1"]);
    // Y no repite mientras sigue en cero.
    expect(s.observar(AHORA + 20 * MIN, cuentas(0))).toEqual([]);
  });

  it("un latido que baja a 0 un instante y vuelve no cuenta", () => {
    const s = new SinNadie();
    trabajoSostenido(s, AHORA);
    s.observar(AHORA + 13 * MIN, cuentas(0));
    s.observar(AHORA + 14 * MIN, cuentas(2));
    expect(s.observar(AHORA + 15 * MIN, cuentas(0))).toEqual([]);
    expect(s.observar(AHORA + 17 * MIN, cuentas(0))).toEqual([]);
  });

  it("con uno solo (nunca llegó a 2) no dice nada", () => {
    const s = new SinNadie();
    s.observar(AHORA, cuentas(1));
    s.observar(AHORA + 20 * MIN, cuentas(1));
    expect(s.observar(AHORA + 21 * MIN, cuentas(0))).toEqual([]);
    expect(s.observar(AHORA + 30 * MIN, cuentas(0))).toEqual([]);
  });

  it("si el trabajo duró menos de 10 minutos no es sostenido", () => {
    const s = new SinNadie();
    s.observar(AHORA, cuentas(2));
    s.observar(AHORA + 5 * MIN, cuentas(1));
    s.observar(AHORA + 6 * MIN, cuentas(0));
    expect(s.observar(AHORA + 10 * MIN, cuentas(0))).toEqual([]);
  });

  it("de una misma empresa no se dice más de una vez cada 6 horas", () => {
    const s = new SinNadie();
    trabajoSostenido(s, AHORA);
    expect(s.observar(AHORA + 13 * MIN, cuentas(0))).toEqual([]);
    expect(s.observar(AHORA + 16 * MIN, cuentas(0))).toEqual(["emp1"]);
    // Otra tanda a la hora: no se dice.
    trabajoSostenido(s, AHORA + 60 * MIN);
    s.observar(AHORA + 73 * MIN, cuentas(0));
    expect(s.observar(AHORA + 77 * MIN, cuentas(0))).toEqual([]);
    // Pasadas las 6 horas, sí.
    trabajoSostenido(s, AHORA + 7 * H);
    s.observar(AHORA + 7 * H + 13 * MIN, cuentas(0));
    expect(s.observar(AHORA + 7 * H + 17 * MIN, cuentas(0))).toEqual(["emp1"]);
  });

  it("lo que ya estaba en 0 al empezar a mirar no avisa, y cada empresa va por su lado", () => {
    const s = new SinNadie();
    expect(s.observar(AHORA, cuentas(0, 3))).toEqual([]);
    s.observar(AHORA + 12 * MIN, cuentas(0, 2));
    s.observar(AHORA + 13 * MIN, cuentas(0, 0));
    expect(s.observar(AHORA + 17 * MIN, cuentas(0, 0))).toEqual(["emp2"]);
  });

  it("varias empresas en la misma revisión salen juntas (una sola frase)", () => {
    const s = new SinNadie();
    s.observar(AHORA, cuentas(2, 2));
    s.observar(AHORA + 12 * MIN, cuentas(1, 1));
    s.observar(AHORA + 13 * MIN, cuentas(0, 0));
    expect(s.observar(AHORA + 17 * MIN, cuentas(0, 0))).toEqual(["emp1", "emp2"]);
  });

  it("la frase: una empresa o varias", () => {
    expect(textoSinNadie("Betalandia")).toBe("Betalandia: ya no queda nadie trabajando.");
    expect(textoSinNadie(["Betalandia", "Gamalandia"])).toBe("Betalandia y Gamalandia: ya no queda nadie trabajando.");
    expect(textoSinNadie(["Alfa", "Beta", "Gama"])).toBe("Alfa, Beta y Gama: ya no queda nadie trabajando.");
  });
});

describe("recordatorio de espera", () => {
  const agente = (id: string, esperas: Array<number | null>, st = "toca", desde: string | null = null) => ({ id, st, desde, teNecesita: esperas.map((e) => ({ desde: e == null ? null : iso(AHORA - e) })) });
  const nuncaViejo = () => false;

  it("solo cuentan las esperas de entre 30 minutos y 24 horas, la más antigua primero", () => {
    const a = agente("ana", [40 * MIN, 3 * H]);
    const b = agente("beto", [31 * MIN]);
    const c = agente("caro", [10 * MIN]);
    const d = agente("dani", []);
    const e = agente("eli", [3 * 7 * 24 * H]); // 3 semanas: la persona ya la conoce
    const f = agente("fabi", [ESPERA_MAX_RECORDAR_MS + MIN]);
    const g = agente("gabo", [ESPERA_MAX_RECORDAR_MS - MIN]);
    const v = vencidos([b, c, d, e, f, a, g], AHORA, nuncaViejo);
    expect(v.map((x) => `${x.agente.id}:${x.i}`)).toEqual(["gabo:0", "ana:1", "ana:0", "beto:0"]);
    expect(v[1]).toMatchObject({ ms: 3 * H, nivel: 2 });
    expect(v[3]!.ms).toBeGreaterThanOrEqual(ESPERA_RECORDAR_MS);
    expect(unaPorAgente(v).map((x) => x.agente.id)).toEqual(["gabo", "ana", "beto"]);
  });

  it("una espera sin fecha no se sabe hace cuánto: no cuenta", () => {
    expect(vencidos([agente("ana", [null])], AHORA, nuncaViejo)).toEqual([]);
    expect(vencidos([{ id: "x", st: "toca", desde: null, teNecesita: [{ desde: "mañana" }] }], AHORA, nuncaViejo)).toEqual([]);
  });

  it("no cuenta a quien tiene un error viejo o silenciado (el criterio de la página)", () => {
    const a = agente("ana", [2 * H], "error");
    const b = agente("beto", [2 * H]);
    expect(vencidos([a, b], AHORA, (x) => x.id === "ana").map((x) => x.agente.id)).toEqual(["beto"]);
  });

  it("los umbrales: 30 min, 2 h y 6 h", () => {
    expect(nivelDeEspera(29 * MIN)).toBe(0);
    expect(nivelDeEspera(30 * MIN)).toBe(1);
    expect(nivelDeEspera(119 * MIN)).toBe(1);
    expect(nivelDeEspera(2 * H)).toBe(2);
    expect(nivelDeEspera(5 * H)).toBe(2);
    expect(nivelDeEspera(6 * H)).toBe(3);
    expect(nivelDeEspera(23 * H)).toBe(3);
  });

  it("cada espera se recuerda como mucho 3 veces; una vista por primera vez con 5 h recibe uno y después solo el de las 6 h", () => {
    const marcas = new Map<string, number>();
    const en = (ms: number) => vencidos([{ id: "ana", st: "toca", desde: null, teNecesita: [{ desde: iso(AHORA - ms), itemId: "i1" }] }], AHORA, nuncaViejo);
    // Vista por primera vez con 5 h: toca (nivel 2) y queda marcada hasta ahí.
    const v1 = en(5 * H);
    expect(hayQueRecordar(v1, marcas)).toBe(true);
    marcarRecordadas(v1, marcas);
    // Pasa una hora más (la misma espera, ahora de 5 h 59): no.
    expect(hayQueRecordar(vencidos([{ id: "ana", st: "toca", desde: null, teNecesita: [{ desde: iso(AHORA - 5 * H), itemId: "i1" }] }], AHORA + 59 * MIN, nuncaViejo), marcas)).toBe(false);
    // Cruza las 6 h: toca una vez más.
    const v2 = vencidos([{ id: "ana", st: "toca", desde: null, teNecesita: [{ desde: iso(AHORA - 5 * H), itemId: "i1" }] }], AHORA + 61 * MIN, nuncaViejo);
    expect(hayQueRecordar(v2, marcas)).toBe(true);
    marcarRecordadas(v2, marcas);
    // Y no más: 20 horas después sigue sin tocar.
    const v3 = vencidos([{ id: "ana", st: "toca", desde: null, teNecesita: [{ desde: iso(AHORA - 5 * H), itemId: "i1" }] }], AHORA + 15 * H, nuncaViejo);
    expect(hayQueRecordar(v3, marcas)).toBe(false);
  });

  it("al decirlo, todas las esperas que entran quedan marcadas; una nueva sola vuelve a tocar", () => {
    const marcas = new Map<string, number>();
    const esp = (itemId: string, ms: number) => ({ desde: iso(AHORA - ms), itemId });
    const ag = (...e: Array<ReturnType<typeof esp>>) => ({ id: "ana", st: "toca", desde: null, teNecesita: e });
    const v = vencidos([ag(esp("a", 40 * MIN), esp("b", 3 * H))], AHORA, nuncaViejo);
    expect(hayQueRecordar(v, marcas)).toBe(true);
    marcarRecordadas(v, marcas);
    expect(hayQueRecordar(v, marcas)).toBe(false);
    const w = vencidos([ag(esp("a", 40 * MIN), esp("b", 3 * H), esp("c", 31 * MIN))], AHORA, nuncaViejo);
    expect(hayQueRecordar(w, marcas)).toBe(true);
  });

  it("lo recordado se comparte por el almacenamiento, sobrevive a recargar y se poda a las 48 h", () => {
    const guardado: Record<string, string> = {};
    const almacen = { getItem: (k: string) => guardado[k] ?? null, setItem: (k: string, v: string) => void (guardado[k] = v) };
    const v = vencidos([{ id: "ana", st: "toca", desde: null, teNecesita: [{ desde: iso(AHORA - 3 * H), itemId: "i1" }] }], AHORA, nuncaViejo);
    const uno = new RecordadosEspera(() => almacen);
    expect(hayQueRecordar(v, uno.cargar(AHORA))).toBe(true);
    uno.guardar(v, AHORA);
    expect(guardado[CLAVE_RECORDADOS]).toBeTruthy();
    // Otra pestaña (o la misma tras recargar) lo ve.
    const otro = new RecordadosEspera(() => almacen);
    expect(hayQueRecordar(v, otro.cargar(AHORA + MIN))).toBe(false);
    // 48 h después se poda.
    expect(otro.cargar(AHORA + 49 * H).size).toBe(0);
    expect(JSON.parse(guardado[CLAVE_RECORDADOS]!)).toBeTruthy();
  });

  it("sin almacenamiento o con lo guardado roto, vale en memoria y no revienta", () => {
    const v = vencidos([{ id: "ana", st: "toca", desde: null, teNecesita: [{ desde: iso(AHORA - 3 * H), itemId: "i1" }] }], AHORA, nuncaViejo);
    const roto = new RecordadosEspera(() => ({
      getItem: () => {
        throw new Error("sin acceso");
      },
      setItem: () => {
        throw new Error("sin acceso");
      },
    }));
    expect(hayQueRecordar(v, roto.cargar(AHORA))).toBe(true);
    roto.guardar(v, AHORA);
    expect(hayQueRecordar(v, roto.cargar(AHORA + MIN))).toBe(false);
    const nulo = new RecordadosEspera(() => null);
    nulo.guardar(v, AHORA);
    expect(hayQueRecordar(v, nulo.cargar(AHORA + MIN))).toBe(false);
    const basura = new RecordadosEspera(() => ({ getItem: () => "{{no es json", setItem: () => {} }));
    expect(hayQueRecordar(v, basura.cargar(AHORA))).toBe(true);
  });

  it("cuándo toca: según el nivel, y no si hace poco se dijo un «te necesito»", () => {
    const base = { intervaloMs: 60 * MIN, ahora: AHORA, ultimoRecordatorio: AHORA - 61 * MIN, ultimoToca: AHORA - 20 * MIN };
    expect(tocaRecordar(base)).toBe(true);
    expect(tocaRecordar({ ...base, intervaloMs: null })).toBe(false);
    expect(tocaRecordar({ ...base, ultimoRecordatorio: AHORA - 30 * MIN })).toBe(false);
    expect(tocaRecordar({ ...base, ultimoToca: AHORA - 4 * MIN })).toBe(false);
    expect(tocaRecordar({ ...base, ultimoToca: AHORA - 6 * MIN })).toBe(true);
    // Conversador: cada 20 minutos.
    expect(tocaRecordar({ ...base, intervaloMs: 20 * MIN, ultimoRecordatorio: AHORA - 21 * MIN })).toBe(true);
  });

  it("la frase con varios y con uno", () => {
    expect(
      textoRecordatorio([
        { quien: "Diseño, de Betalandia", ms: 2 * H, por: "por Instalar la versión nueva" },
        { quien: "QA", ms: H, por: null },
        { quien: "Ceo", ms: 40 * MIN, por: null },
      ]),
    ).toBe("Siguen esperándote 3. El más antiguo, Diseño, de Betalandia, hace 2 horas, por Instalar la versión nueva.");
    expect(textoRecordatorio([{ quien: "Diseño", ms: 2 * H, por: "por Instalar la versión nueva" }])).toBe("Diseño sigue esperándote hace 2 horas, por Instalar la versión nueva.");
    expect(textoRecordatorio([{ quien: "QA", ms: 35 * MIN, por: null }])).toBe("QA sigue esperándote hace 35 minutos.");
  });

  it("una pregunta ya termina en «?»: no lleva otro punto. Y de 48 horas, en días, nunca «70 horas»", () => {
    expect(textoRecordatorio([{ quien: "QA", ms: 3 * H, por: "con la pregunta ¿Instalo ahora?" }])).toBe("QA sigue esperándote hace 3 horas, con la pregunta ¿Instalo ahora?");
    expect(textoRecordatorio([{ quien: "QA", ms: 70 * H, por: null }])).toBe("QA sigue esperándote hace 2 días.");
    expect(textoRecordatorio([{ quien: "QA", ms: 3 * 24 * H, por: null }])).toBe("QA sigue esperándote hace 3 días.");
  });

  it("sin nadie, nada", () => {
    expect(textoRecordatorio([])).toBeNull();
  });
});

describe("«mientras no estabas»", () => {
  it("la hora dicha", () => {
    const a = (h: number, m: number) => new Date(2026, 5, 15, h, m).getTime();
    expect(horaDicha(a(15, 30))).toBe("las 3 y media");
    expect(horaDicha(a(15, 0))).toBe("las 3");
    expect(horaDicha(a(13, 15))).toBe("la una y cuarto");
    expect(horaDicha(a(8, 45))).toBe("las 9 menos cuarto");
    expect(horaDicha(a(0, 5))).toBe("las 12 y 5");
    expect(horaDicha(a(23, 58))).toBe("las 12");
    expect(horaDicha(a(12, 40))).toBe("las 12 y 40");
  });

  it("desde cuándo: hoy, ayer, o hace días", () => {
    const hoy = new Date(2026, 5, 15, 18, 0).getTime();
    expect(desdeDicho(new Date(2026, 5, 15, 15, 30).getTime(), hoy)).toBe("las 3 y media");
    expect(desdeDicho(new Date(2026, 5, 14, 22, 0).getTime(), hoy)).toBe("ayer a las 10");
    expect(desdeDicho(new Date(2026, 5, 11, 22, 0).getTime(), hoy)).toBe("hace 3 días");
  });

  it("la frase con números reales; lo que es 0 no se dice", () => {
    const desde = new Date(2026, 5, 15, 15, 30).getTime();
    const ahora = new Date(2026, 5, 15, 18, 0).getTime();
    expect(textoVolver({ terminaron: 5, bloqueados: 0, esperan: 2, errores: 1 }, desde, ahora)).toBe("Desde las 3 y media: 5 terminaron, 2 te esperan y hubo 1 error.");
    expect(textoVolver({ terminaron: 1, bloqueados: 2, esperan: 0, errores: 0 }, desde, ahora)).toBe("Desde las 3 y media: 1 terminó y 2 quedaron bloqueados.");
    expect(textoVolver({ terminaron: 0, bloqueados: 1, esperan: 1, errores: 3 }, desde, ahora)).toBe("Desde las 3 y media: 1 quedó bloqueado, 1 te espera y hubo 3 errores.");
    expect(textoVolver({ terminaron: 0, bloqueados: 0, esperan: 4, errores: 0 }, desde, ahora)).toBe("Desde las 3 y media: 4 te esperan.");
  });

  it("sin nada que contar, no dice nada", () => {
    expect(textoVolver({ terminaron: 0, bloqueados: 0, esperan: 0, errores: 0 }, AHORA - H, AHORA)).toBeNull();
  });

  it("el registro cuenta lo de la ventana: las tareas una vez cada una", () => {
    const r = new RegistroSucesos();
    r.anotar("fin", AHORA - 50 * MIN, "T0"); // antes de la ventana
    r.anotar("fin", AHORA - 20 * MIN, "T1");
    r.anotar("fin", AHORA - 10 * MIN, "T1"); // en revisión y después terminada: una
    r.anotar("fin", AHORA - 9 * MIN, "T2");
    r.anotar("error", AHORA - 8 * MIN, "run1");
    r.anotar("error", AHORA - 7 * MIN, "run2");
    r.anotar("bloq", AHORA - 6 * MIN, "T3");
    expect(r.contar(AHORA - 30 * MIN, AHORA)).toEqual({ terminaron: 2, errores: 2, bloqueados: 1 });
    expect(r.contar(AHORA, AHORA + MIN)).toEqual({ terminaron: 0, errores: 0, bloqueados: 0 });
    r.limpiar();
    expect(r.contar(0, AHORA)).toEqual({ terminaron: 0, errores: 0, bloqueados: 0 });
  });

  it("el mismo run con error dos veces cuenta uno", () => {
    const r = new RegistroSucesos();
    r.anotar("error", AHORA - 8 * MIN, "run1");
    r.anotar("error", AHORA - 7 * MIN, "run1");
    r.anotar("error", AHORA - 6 * MIN, "run2");
    expect(r.contar(AHORA - 30 * MIN, AHORA).errores).toBe(2);
  });

  it("los que te esperan son solo las esperas nuevas desde el inicio de la ausencia", () => {
    const inicio = AHORA - 40 * MIN;
    const ag = (...e: Array<number | null>) => ({ teNecesita: e.map((m) => ({ desde: m == null ? null : iso(AHORA - m) })) });
    // Una espera de semanas, una de hace 2 h y una sin fecha: ninguna es novedad.
    expect(esperanDesde([ag(21 * 24 * H), ag(2 * H), ag(null), ag()], inicio)).toBe(0);
    // Una de hace 10 min sí; un agente con una vieja y una nueva cuenta una vez.
    expect(esperanDesde([ag(21 * 24 * H), ag(10 * MIN), ag(3 * H, 5 * MIN)], inicio)).toBe(2);
  });

  it("sin nada nuevo no dice nada, aunque haya esperas de semanas", () => {
    const inicio = AHORA - 40 * MIN;
    const esperan = esperanDesde([{ teNecesita: [{ desde: iso(AHORA - 21 * 24 * H) }] }], inicio);
    expect(textoVolver({ terminaron: 0, bloqueados: 0, esperan, errores: 0 }, inicio, AHORA)).toBeNull();
  });

  it("15 minutos de ausencia", () => {
    expect(AUSENCIA_MIN_MS).toBe(15 * MIN);
  });
});
