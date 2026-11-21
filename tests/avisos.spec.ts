import { describe, expect, it } from "vitest";
import {
  MOTIVOS_ERROR,
  motivoDeError,
  tareaParaVoz,
  TEXTO_MUESTRA,
  avisoHost,
  avisoSistema,
  bannerTv,
  ColaVoces,
  CORTOS,
  cuerpoAviso,
  empezaron,
  llegadas,
  nombreCorto,
  textoPendiente,
  textoVoz,
  vocesEspanol,
  vozDe,
  type Llegada,
} from "../src/avisos.js";
import type { Espera, RunActual } from "../src/estado.js";
import { AJUSTES_POR_OMISION, conDetalle, leeOficina, leerAjustes, puntoIa, puntoVoces } from "../src/ui/ajustes.js";

const espera = (extra: Partial<Espera> = {}): Espera => ({
  tipo: "tarjeta",
  itemId: "i1",
  sujetoId: "x1",
  clase: "request_confirmation",
  issueId: "t1",
  identifier: "BET-268",
  titulo: "¿Apruebas el plan de permisos de lectura por equipo?",
  tituloTarea: "Permisos de lectura",
  href: null,
  desde: null,
  ...extra,
});

const llegada = (corto: string, empresa: string, esperas: Espera[] = [espera()], agenteId = corto): Llegada => ({ agenteId, corto, empresa, prefijo: "BET", esperas });

describe("nombre corto (§8)", () => {
  it("los raros salen del mapa fijo", () => {
    for (const [nombre, corto] of Object.entries(CORTOS)) expect(nombreCorto(nombre)).toBe(corto);
    expect(nombreCorto("Ingeniero Backend Java / REST")).toBe("Ingeniero backend");
    expect(nombreCorto("Líder Técnico")).toBe("Líder técnico");
  });

  it("la regla: corta en « / », « (», « + » o « & », con tildes y minúscula después de la primera palabra; las siglas quedan", () => {
    expect(nombreCorto("Chief of staff")).toBe("Chief of staff");
    expect(nombreCorto("CEO")).toBe("CEO");
    expect(nombreCorto("Speckit")).toBe("Speckit");
    expect(nombreCorto("Lider Tecnico")).toBe("Líder técnico");
    expect(nombreCorto("Analista de Datos (BI)")).toBe("Analista de datos");
    expect(nombreCorto("Diseñador UX + Marca")).toBe("Diseñador UX");
    expect(nombreCorto("Ventas & Soporte")).toBe("Ventas");
    expect(nombreCorto("Integracion Continua / CI")).toBe("Integración continua");
  });
});

describe("quién pasa a «te necesita» (§7)", () => {
  it("de 0 a 1 avisa; de 1 a 2 no; un agente que no se conocía no avisa", () => {
    const antes = new Map([
      ["a", 0],
      ["b", 1],
    ]);
    const ahora = new Map([
      ["a", 1],
      ["b", 2],
      ["c", 1],
    ]);
    expect(llegadas(antes, ahora)).toEqual(["a"]);
    expect(llegadas(new Map([["a", 1]]), new Map([["a", 0]]))).toEqual([]);
  });
});

describe("quién dice «empecé» (§8)", () => {
  const ag = (issueId: string | null, enCola = false, id = "a") => ({ id, run: issueId ? ({ issueId, enCola } as RunActual) : null });
  const quienes = (tareas: Map<string, string | null>, ...agentes: ReturnType<typeof ag>[]) => empezaron(tareas, agentes).map((a) => `${a.id}:${a.run!.issueId}`);

  it("el primer run de una tarea nueva habla; el 2.º run de la misma tarea no; lo de la primera lectura tampoco", () => {
    const tareas = new Map<string, string | null>();
    expect(quienes(tareas, ag("t1"))).toEqual([]);
    expect(quienes(tareas, ag(null))).toEqual([]);
    expect(quienes(tareas, ag("t2"))).toEqual(["a:t2"]);
    expect(quienes(tareas, ag(null))).toEqual([]);
    expect(quienes(tareas, ag("t2"))).toEqual([]);
  });

  it("si se ve primero «En cola», habla al pasar a «Trabajando» (JST-119)", () => {
    const tareas = new Map<string, string | null>([["a", "t1"]]);
    expect(quienes(tareas, ag("t2", true))).toEqual([]);
    expect(quienes(tareas, ag("t2"))).toEqual(["a:t2"]);
    expect(quienes(tareas, ag(null))).toEqual([]);
    // El 2.º run de la misma tarea, también visto en cola, no habla.
    expect(quienes(tareas, ag("t2", true))).toEqual([]);
    expect(quienes(tareas, ag("t2"))).toEqual([]);
  });

  it("un agente que se ve por primera vez en cola no habla al arrancar: esa es su primera lectura", () => {
    const tareas = new Map<string, string | null>();
    expect(quienes(tareas, ag("t1", true))).toEqual([]);
    expect(quienes(tareas, ag("t1"))).toEqual([]);
    expect(quienes(tareas, ag("t2", true, "b"), ag("t3"))).toEqual(["a:t3"]);
  });
});

describe("textos del aviso", () => {
  it("uno solo: el nombre corto, la empresa, el tipo, la tarea, lo que espera y «(y 2 más)»", () => {
    const l = llegada("Líder técnico", "Betalandia", [espera(), espera({ itemId: "i2" }), espera({ itemId: "i3" })], "ag-1");
    const a = avisoHost([l], "JST", "g1");
    expect(a.title).toBe("✋ Líder técnico (Betalandia) te necesita");
    expect(a.body).toBe("Confirmación en BET-268: ¿Apruebas el plan de permisos de lectura por equipo? (y 2 más)");
    expect(a).toMatchObject({ tone: "info", ttlMs: 15000, id: "oficina:g1", dedupeKey: "oficina:ag-1:i1" });
    expect(a.action).toEqual({ label: "Responder", href: "/JST/oficina-global?responder=ag-1" });
  });

  it("una aprobación dice «Aprobación en …»", () => {
    const e = espera({ tipo: "aprobacion", clase: "request_board_approval", identifier: "ELM-6", titulo: "Publicar el plan" });
    expect(cuerpoAviso({ teNecesita: [e] })).toBe("Aprobación en ELM-6: Publicar el plan");
  });

  it("2 o más en 10 s: uno solo, con los nombres; con más de 3, «… y 2 más»", () => {
    const tres = [llegada("Speckit", "Migo"), llegada("CEO", "El Mirador"), llegada("Chief of staff", "JSTM")];
    const a = avisoHost(tres, "BET", "g2");
    expect(a.title).toBe("✋ 3 agentes te necesitan");
    expect(a.body).toBe("Speckit (Migo), CEO (El Mirador) y Chief of staff (JSTM)");
    expect(a.action).toEqual({ label: "Ver en la Oficina", href: "/BET/oficina-global?hl=toca" });
    expect(a.id).toBe("oficina:g2");
    const cinco = [...tres, llegada("QA", "Betalandia"), llegada("Hermes", "Migo")];
    expect(avisoHost(cinco, "BET", "g2").body).toBe("Speckit (Migo), CEO (El Mirador), Chief of staff (JSTM) y 2 más");
  });

  it("aviso del sistema: «Te pide aprobar» en una aprobación, «Te necesita» en lo demás, con `tag` por agente", () => {
    const aprob = llegada("CEO", "El Mirador", [espera({ tipo: "aprobacion", clase: "request_board_approval", identifier: "ELM-6", titulo: "Publicar el plan" })], "ag-2");
    expect(avisoSistema(aprob)).toEqual({ titulo: "CEO · El Mirador", body: "Te pide aprobar en ELM-6: Publicar el plan", tag: "oficina:ag-2" });
    expect(avisoSistema(llegada("QA", "Betalandia")).body).toBe("Te necesita en BET-268: ¿Apruebas el plan de permisos de lectura por equipo?");
  });

  it("banner del TV", () => {
    expect(bannerTv(llegada("Speckit", "Migo", [espera({ clase: "ask_user_questions", identifier: "MIG-19", titulo: "¿Sigo?" })]))).toEqual({
      fuerte: "Speckit, de Migo, te necesita.",
      resto: "Pregunta en MIG-19: ¿Sigo?",
    });
  });
});

describe("voces (§8)", () => {
  it("las 3 presentaciones", () => {
    expect(textoVoz("Líder técnico", "Betalandia", "toca", "nombre-empresa")).toBe("Líder técnico, de Betalandia: te necesito.");
    expect(textoVoz("Líder técnico", "Betalandia", "toca", "nombre")).toBe("Líder técnico: te necesito.");
    expect(textoVoz("Líder técnico", "Betalandia", "toca", "frase")).toBe("Te necesito.");
    expect(textoVoz("QA", "Migo", "error", "frase")).toBe("Tengo un error.");
  });

  it("primero las voces es-MX; si no hay, es-ES; si no, cualquier español", () => {
    const v = (name: string, lang: string) => ({ name, lang });
    const voces = [v("Mónica", "es-ES"), v("Paulina", "es-MX"), v("Alex", "en-US"), v("Eddy", "es_MX")];
    expect(vocesEspanol(voces).map((x) => x.name)).toEqual(["Paulina", "Eddy"]);
    expect(vocesEspanol([v("Mónica", "es-ES"), v("Alex", "en-US")]).map((x) => x.name)).toEqual(["Mónica"]);
    expect(vocesEspanol([v("Carlos", "es-AR"), v("Alex", "en-US")]).map((x) => x.name)).toEqual(["Carlos"]);
    expect(vocesEspanol([v("Alex", "en-US")])).toEqual([]);
  });

  it("cada agente tiene su voz, tono (0,85–1,15) y velocidad (0,95–1,10), siempre los mismos", () => {
    const voces = Array.from({ length: 9 }, (_, i) => ({ name: `v${i}`, lang: "es-MX" }));
    for (let i = 0; i < 60; i++) {
      const id = `agente-${i}`;
      const a = vozDe(id, voces);
      expect(a.pitch).toBeGreaterThanOrEqual(0.85);
      expect(a.pitch).toBeLessThanOrEqual(1.15 + 1e-9);
      expect(a.rate).toBeGreaterThanOrEqual(0.95);
      expect(a.rate).toBeLessThanOrEqual(1.1 + 1e-9);
      expect(vozDe(id, voces)).toEqual(a);
    }
    expect(vozDe("x", []).voz).toBeNull();
  });

  const ag = (id: string) => ({ id, corto: id, empresa: "Migo" });

  it("la cola guarda 3 frases como máximo y descarta las de más de 20 s", () => {
    const c = new ColaVoces();
    c.poner("toca", ag("a"), 0);
    c.poner("error", ag("b"), 10);
    c.poner("fin", ag("c"), 20);
    c.poner("emp", ag("d"), 30);
    expect(c.largo).toBe(3);
    expect(c.sacar(21_000)).toBeNull();
  });

  it("con más de 3 en 10 s, las de la misma frase se juntan en un resumen", () => {
    const c = new ColaVoces();
    for (const [i, id] of ["a", "b", "c", "d"].entries()) c.poner("fin", ag(id), i * 100);
    const p = c.sacar(500)!;
    expect(p.agentes.map((a) => a.id)).toEqual(["a", "b", "c", "d"]);
    expect(textoPendiente(p, "nombre-empresa")).toBe("4 agentes terminaron.");
    expect(c.sacar(500)).toBeNull();
  });

  it("una sola frase dice el nombre según la presentación", () => {
    const c = new ColaVoces();
    c.poner("toca", ag("Speckit"), 0);
    expect(textoPendiente(c.sacar(0)!, "nombre-empresa")).toBe("Speckit, de Migo: te necesito.");
  });
});

// JST-415: lo que un ajuste guardado de antes recibe por omisión.
const NUEVAS_FRASES = { bloq: true, recordar: true, volver: true, hitos: true };

describe("ajustes (§6)", () => {
  it("vienen apagados (el sonido encendido, «empecé» sin marcar)", () => {
    expect(leerAjustes(null)).toEqual(AJUSTES_POR_OMISION);
    expect(AJUSTES_POR_OMISION).toMatchObject({ avisos: false, voces: false, sonido: true, presentacion: "nombre-empresa" });
    expect(AJUSTES_POR_OMISION.frases).toEqual({ toca: true, error: true, fin: true, emp: false, bloq: true, recordar: true, volver: true, hitos: true });
    // JST-415: el nivel viene en «normal».
    expect(AJUSTES_POR_OMISION.nivel).toBe("normal");
  });

  it("un JSON roto o campos raros vuelven a lo de por omisión", () => {
    expect(leerAjustes("{roto")).toEqual(AJUSTES_POR_OMISION);
    expect(leerAjustes(JSON.stringify({ avisos: "sí", voces: true, presentacion: "otra", frases: { emp: true } }))).toEqual({
      ...AJUSTES_POR_OMISION,
      voces: true,
      frases: { ...AJUSTES_POR_OMISION.frases, emp: true },
    });
  });

  it("0.4.0 (JST-162 §4): «Conversaciones» viene encendido y lo que guardó la 0.3.8 se sigue leyendo igual", () => {
    expect(AJUSTES_POR_OMISION.charlas).toBe(true);
    // Lo que guarda la 0.3.8 en `localStorage` (sin `charlas`): todo igual, y las conversaciones encendidas.
    const de038 = { avisos: true, sonido: false, voces: true, frases: { toca: true, error: false, fin: true, emp: true }, presentacion: "nombre", mascotas: false };
    expect(leerAjustes(JSON.stringify(de038))).toEqual({ ...de038, frases: { ...de038.frases, ...NUEVAS_FRASES }, nivel: "normal", charlas: true, detalle: AJUSTES_POR_OMISION.detalle, leer: AJUSTES_POR_OMISION.leer, vozMas: false, vistoLeer: false, iaFuente: "ia", iaVisto: false, decorado: "clasico", decoradoPorEmpresa: {}, luz: true, fechas: true });
    // Apagado se guarda y se lee apagado; un valor raro vuelve a encendido.
    expect(leerAjustes(JSON.stringify({ ...de038, charlas: false })).charlas).toBe(false);
    expect(leerAjustes(JSON.stringify({ charlas: "no" })).charlas).toBe(true);
  });
});

describe("nombreCorto: letras sueltas (JST-97, en la copia)", () => {
  it("una letra mayúscula suelta queda igual", async () => {
    const { nombreCorto } = await import("../src/avisos.js");
    expect(nombreCorto("Sonda JST-97 A")).toBe("Sonda JST-97 A");
    expect(nombreCorto("Agente De Ventas")).toBe("Agente de ventas");
  });
});

describe("la voz dice de qué se trata (0.5.0, JST-163): el nombre de la tarea", () => {
  it("los casos de la spec de la 0.5.0, con el corte de la 0.8.0 (JST-241): más largo y en un límite natural", () => {
    expect(tareaParaVoz("Diseño de «Oficina global» 0.5.0: «✓ listo», hora estimada, entrega en la mesa y tu escritorio con fila")).toBe("Diseño de Oficina global 0.5.0: listo, hora estimada");
    expect(tareaParaVoz("QA de «Oficina global» con las 4 empresas, en computador y en celular")).toBe("QA de Oficina global con las 4 empresas, en computador y en celular");
    expect(tareaParaVoz("Instalar «Oficina global» 0.1.5 (arreglo de JST-89) cuando pase su re-QA")).toBe("Instalar Oficina global 0.1.5 cuando pase su re-QA");
    expect(tareaParaVoz("«Oficina global»: voces nuevas (Lorenzo, Catalina, Alex, Dora y Santa), una al azar por agente")).toBe("Oficina global: voces nuevas, una al azar por agente");
    expect(tareaParaVoz("Spec: exportar un reporte a CSV")).toBe("Spec: exportar un reporte a CSV");
    expect(tareaParaVoz("Backend — reset token y SendResetMail con el correo de la cuenta")).toBe("Backend — reset token y SendResetMail con el correo de la cuenta");
  });

  it("nombres largos: como mucho 16 palabras y 90 letras, sin terminar en conector ni signo y sin «…»", () => {
    const largos = [
      "Revisar el flujo completo de autenticación de los usuarios registrados con la nueva política de contraseñas del sitio",
      "Documentar el despliegue de la plataforma: base de datos, colas, workers, caché, CDN y monitoreo con alertas",
      "Supercalifragilisticoespialidoso extraordinariamente interminable denominación institucional de la cuenta principal",
      "«Oficina global» 0.3.4 (JST-139): rótulo con el nombre de cada tarea; calibrar canvas con Range, despertar el bucle",
      "Mmm… ¿qué pasa con ✓ ⏱ y ★ en el nombre? (prueba) — y de",
    ];
    for (const t of largos) {
      const v = tareaParaVoz(t);
      expect(v.length).toBeGreaterThan(0);
      expect(v.length).toBeLessThanOrEqual(90);
      expect(v.split(" ").length).toBeLessThanOrEqual(16);
      expect(v).not.toMatch(/…|[✓⏱★«»"“”()]/);
      expect(v).not.toMatch(/[\s,;:·—–\-]$/);
      expect(v.split(" ").at(-1)!.toLowerCase()).not.toMatch(/^(a|al|con|de|del|el|en|la|las|los|para|por|que|sin|su|un|una|y)$/);
    }
    expect(tareaParaVoz("Revisar el flujo completo de autenticación de los usuarios registrados con la nueva política de contraseñas del sitio")).toBe("Revisar el flujo completo de autenticación de los usuarios registrados");
    // Sin los símbolos, el «con» quedaba sin nada; la pregunta se queda con su «¿…?».
    expect(tareaParaVoz("Mmm… ¿qué pasa con ✓ ⏱ y ★ en el nombre? (prueba) — y de")).toBe("Mmm ¿qué pasa y en el nombre?");
    expect(tareaParaVoz("JST-12")).toBe("");
    expect(tareaParaVoz(null)).toBe("");
  });

  it("la frase entera, con las 3 presentaciones y la tarea o el motivo (tabla de la spec)", () => {
    const tarea = { tarea: "Respaldo semanal del Drive" };
    expect(textoVoz("Diseño", "JSTM", "toca", "nombre-empresa")).toBe("Diseño, de JSTM: te necesito.");
    expect(textoVoz("Diseño", "JSTM", "toca", "nombre-empresa", tarea)).toBe("Diseño, de JSTM: te necesito. Respaldo semanal del Drive.");
    expect(textoVoz("Diseño", "JSTM", "toca", "nombre", tarea)).toBe("Diseño: te necesito. Respaldo semanal del Drive.");
    expect(textoVoz("Diseño", "JSTM", "toca", "frase", tarea)).toBe("Te necesito. Respaldo semanal del Drive.");
    const motivo = { motivo: "límite de uso" };
    expect(textoVoz("Diseño", "JSTM", "error", "nombre-empresa", motivo)).toBe("Diseño, de JSTM: tengo un error: límite de uso.");
    expect(textoVoz("Diseño", "JSTM", "error", "nombre", motivo)).toBe("Diseño: tengo un error: límite de uso.");
    expect(textoVoz("Diseño", "JSTM", "error", "frase", motivo)).toBe("Tengo un error: límite de uso.");
    const fin = { tarea: "Diseño de «Oficina global» 0.5.0: «✓ listo», hora estimada, entrega en la mesa y tu escritorio con fila" };
    expect(textoVoz("Diseño", "JSTM", "fin", "nombre-empresa", fin)).toBe("Diseño, de JSTM: terminé. Diseño de Oficina global 0.5.0: listo, hora estimada.");
    expect(textoVoz("Diseño", "JSTM", "fin", "nombre", fin)).toBe("Diseño: terminé. Diseño de Oficina global 0.5.0: listo, hora estimada.");
    expect(textoVoz("Diseño", "JSTM", "fin", "frase", fin)).toBe("Terminé. Diseño de Oficina global 0.5.0: listo, hora estimada.");
    const emp = { tarea: "QA de «Oficina global» con las 4 empresas, en computador y en celular" };
    expect(textoVoz("Diseño", "JSTM", "emp", "nombre-empresa", emp)).toBe("Diseño, de JSTM: empecé. QA de Oficina global con las 4 empresas, en computador y en celular.");
    expect(textoVoz("Diseño", "JSTM", "emp", "frase", emp)).toBe("Empecé. QA de Oficina global con las 4 empresas, en computador y en celular.");
    // La tarea se dice con la primera letra en mayúscula.
    expect(textoVoz("QA", "Migo", "fin", "nombre", { tarea: "pagar la cuenta de luz" })).toBe("QA: terminé. Pagar la cuenta de luz.");
  });

  it("sin tarea, con una tarea que queda vacía o sin motivo conocido: la frase de la 0.4.0", () => {
    for (const p of ["nombre-empresa", "nombre", "frase"] as const) {
      for (const f of ["toca", "error", "fin", "emp"] as const) {
        const de040 = textoVoz("Líder técnico", "Betalandia", f, p);
        expect(textoVoz("Líder técnico", "Betalandia", f, p, null)).toBe(de040);
        expect(textoVoz("Líder técnico", "Betalandia", f, p, {})).toBe(de040);
        expect(textoVoz("Líder técnico", "Betalandia", f, p, { tarea: "(JST-12)", motivo: null })).toBe(de040);
      }
    }
    // El motivo va solo en «tengo un error»; la tarea, en las otras 3.
    expect(textoVoz("QA", "JSTM", "error", "nombre", { tarea: "Algo" })).toBe("QA: tengo un error.");
    expect(textoVoz("QA", "JSTM", "fin", "nombre", { motivo: "se cortó" })).toBe("QA: terminé.");
  });

  it("nombres de agente y de empresa largos: la frase no los corta, solo la tarea", () => {
    const t = textoVoz("Ingeniero de integración y despliegue continuo", "Fundación de Estudios Avanzados", "fin", "nombre-empresa", { tarea: "Revisar el flujo completo de autenticación de los usuarios registrados con la nueva política" });
    expect(t).toBe("Ingeniero de integración y despliegue continuo, de Fundación de Estudios Avanzados: terminé. Revisar el flujo completo de autenticación de los usuarios registrados.");
  });

  it("la muestra de «▶ Probar» es una frase sola", () => {
    expect(TEXTO_MUESTRA).toBe("Instalar la Oficina global en la real.");
  });
});

describe("la voz dice de qué se trata: el motivo del error (6 que se reconocen)", () => {
  it("con `error` y `errorCode` de heartbeat.run.status, como en el spike de JST-161", () => {
    expect(motivoDeError("You've hit your session limit · resets 5:40am", "adapter_failed")).toBe("límite de uso");
    expect(motivoDeError("Rate limit exceeded (429)", null)).toBe("límite de uso");
    expect(motivoDeError(null, "provider_quota")).toBe("límite de uso");
    expect(motivoDeError("Workspace validation failed", "workspace_validation_failed")).toBe("problema con la carpeta de trabajo");
    expect(motivoDeError(null, "setup_failed")).toBe("problema con la carpeta de trabajo");
    expect(motivoDeError("Process lost", "process_lost")).toBe("se cortó");
    expect(motivoDeError("agent disconnected", null)).toBe("se cortó");
    expect(motivoDeError("bad token", "hermes_gateway_auth_failed")).toBe("no pudo conectarse");
    expect(motivoDeError("The computer went to sleep", null)).toBe("la Mac se durmió");
    expect(motivoDeError(null, "acpx_session_init_failed")).toBe("no alcanzó a empezar");
    // JST-415: pasarse del tiempo es «se le acabó el tiempo» (como dicen las conversaciones), no «no alcanzó a empezar».
    expect(motivoDeError("Timed out", "timed_out")).toBe("se le acabó el tiempo");
    expect(MOTIVOS_ERROR).toHaveLength(7);
  });

  it("un run que se pasa del tiempo: Paperclip lo deja `timed_out` con `errorCode: \"timeout\"` (JST-193)", () => {
    // Como el run 7db54305 de la QA de JST-168 (sonda `sleep 100` con `timeoutSec: 3`).
    expect(motivoDeError("Timed out after 3s", "timeout")).toBe("se le acabó el tiempo");
    expect(motivoDeError(null, "timeout")).toBe("se le acabó el tiempo");
    expect(textoVoz("Chief of staff", "JSTM", "error", "nombre-empresa", { motivo: motivoDeError("Timed out after 3s", "timeout") })).toBe(
      "Chief of staff, de JSTM: tengo un error: se le acabó el tiempo.",
    );
  });

  it("uno desconocido, o sin nada: null (dice «tengo un error», como hoy)", () => {
    expect(motivoDeError("Process exited with code 3", "adapter_failed")).toBeNull();
    expect(motivoDeError(null, null)).toBeNull();
    expect(motivoDeError(undefined, 42)).toBeNull();
  });
});

describe("ajustes 0.5.0: «y de qué se trata» por frase", () => {
  it("viene prendido en las 4 y solo cuenta si su frase está prendida", () => {
    expect(AJUSTES_POR_OMISION.detalle).toEqual({ toca: true, error: true, fin: true, emp: true, bloq: true });
    expect(conDetalle(AJUSTES_POR_OMISION, "fin")).toBe(true);
    // «Empecé» viene apagada: su detalle no cuenta, pero conserva su valor.
    expect(conDetalle(AJUSTES_POR_OMISION, "emp")).toBe(false);
    expect(AJUSTES_POR_OMISION.detalle.emp).toBe(true);
  });

  it("lo que guardó la 0.4.0 (sin `detalle`) se lee igual, con las 4 prendidas", () => {
    const de040 = { avisos: true, sonido: false, voces: true, frases: { toca: true, error: false, fin: true, emp: true }, presentacion: "nombre", mascotas: false, charlas: false };
    expect(leerAjustes(JSON.stringify(de040))).toEqual({ ...de040, frases: { ...de040.frases, ...NUEVAS_FRASES }, nivel: "normal", detalle: { toca: true, error: true, fin: true, emp: true, bloq: true }, leer: AJUSTES_POR_OMISION.leer, vozMas: false, vistoLeer: false, iaFuente: "ia", iaVisto: false, decorado: "clasico", decoradoPorEmpresa: {}, luz: true, fechas: true });
  });

  it("apagado se guarda y se lee apagado; lo raro vuelve a prendido; lo demás no cambia", () => {
    const g = { ...AJUSTES_POR_OMISION, detalle: { toca: false, error: true, fin: false, emp: true, bloq: true } };
    expect(leerAjustes(JSON.stringify(g))).toEqual(g);
    expect(leerAjustes(JSON.stringify({ detalle: { toca: "no", fin: false } })).detalle).toEqual({ toca: true, error: true, fin: false, emp: true, bloq: true });
    expect(leerAjustes(JSON.stringify({ detalle: "todo" })).detalle).toEqual(AJUSTES_POR_OMISION.detalle);
    expect(leerAjustes(JSON.stringify({ detalle: null })).detalle).toEqual(AJUSTES_POR_OMISION.detalle);
    expect(conDetalle(leerAjustes(JSON.stringify(g)), "fin")).toBe(false);
  });
});

describe("ajustes 0.6.0: qué se lee de la oficina (JST-225 §6)", () => {
  // Lo que guarda la 0.5.3 en `localStorage`: sin `leer`, `vozMas` ni `vistoLeer`.
  const de053 = {
    avisos: true,
    sonido: true,
    voces: true,
    frases: { toca: true, error: true, fin: true, emp: false },
    presentacion: "nombre-empresa",
    mascotas: true,
    charlas: true,
    detalle: { toca: true, error: false, fin: true, emp: true },
  };

  it("viene prendido solo «Conversaciones del descanso», «Cómo se presentan y más» plegado y el panel sin ver", () => {
    expect(AJUSTES_POR_OMISION.leer).toEqual({ charlas: true, entregas: false, mascotas: false, sueltas: false, hora: false });
    expect(AJUSTES_POR_OMISION.vozMas).toBe(false);
    expect(AJUSTES_POR_OMISION.vistoLeer).toBe(false);
  });

  it("lo que guardó la 0.5.3 se lee igual y queda con `leer` por omisión: quien tenía las voces prendidas oye las conversaciones", () => {
    const a = leerAjustes(JSON.stringify(de053));
    expect(a).toEqual({ ...de053, frases: { ...de053.frases, ...NUEVAS_FRASES }, nivel: "normal", detalle: { ...de053.detalle, bloq: true }, leer: AJUSTES_POR_OMISION.leer, vozMas: false, vistoLeer: false, iaFuente: "ia", iaVisto: false, decorado: "clasico", decoradoPorEmpresa: {}, luz: true, fechas: true });
    expect(leeOficina(a, "charlas")).toBe(true);
    for (const t of ["entregas", "mascotas", "sueltas", "hora"] as const) expect(leeOficina(a, t)).toBe(false);
    // Con el punto violeta en «Voces» hasta que abra el panel.
    expect(puntoVoces(a)).toBe(true);
    expect(puntoVoces({ ...a, vistoLeer: true })).toBe(false);
  });

  it("quien tenía las voces apagadas: nada cambia, ni punto; al prenderlas, viene «Conversaciones»", () => {
    const a = leerAjustes(JSON.stringify({ ...de053, voces: false }));
    expect(puntoVoces(a)).toBe(false);
    expect(leeOficina(a, "charlas")).toBe(false);
    expect(leeOficina({ ...a, voces: true }, "charlas")).toBe(true);
  });

  it("lo guardado de la 0.6.0 se lee tal cual; un tipo raro o que falta vuelve a su valor por omisión", () => {
    const g = { ...AJUSTES_POR_OMISION, voces: true, leer: { charlas: false, entregas: true, mascotas: true, sueltas: false, hora: true }, vozMas: true, vistoLeer: true };
    expect(leerAjustes(JSON.stringify(g))).toEqual(g);
    expect(leerAjustes(JSON.stringify({ leer: { charlas: "no", hora: true } })).leer).toEqual({ charlas: true, entregas: false, mascotas: false, sueltas: false, hora: true });
    expect(leerAjustes(JSON.stringify({ leer: "todo" })).leer).toEqual(AJUSTES_POR_OMISION.leer);
    expect(leerAjustes(JSON.stringify({ leer: null, vozMas: "sí", vistoLeer: 1 }))).toMatchObject({ leer: AJUSTES_POR_OMISION.leer, vozMas: false, vistoLeer: false, iaFuente: "ia", iaVisto: false });
  });

  it("con las voces apagadas no se lee nada, y lo oculto tampoco", () => {
    const todo = { ...AJUSTES_POR_OMISION, voces: true, leer: { charlas: true, entregas: true, mascotas: true, sueltas: true, hora: true } };
    for (const t of ["charlas", "entregas", "mascotas", "sueltas", "hora"] as const) {
      expect(leeOficina(todo, t)).toBe(true);
      expect(leeOficina({ ...todo, voces: false }, t)).toBe(false);
    }
    // «Conversaciones ocultas»: ni conversaciones ni frases sueltas. «Mascotas ocultas»: ni mascotas.
    expect(leeOficina({ ...todo, charlas: false }, "charlas")).toBe(false);
    expect(leeOficina({ ...todo, charlas: false }, "sueltas")).toBe(false);
    expect(leeOficina({ ...todo, charlas: false }, "entregas")).toBe(true);
    expect(leeOficina({ ...todo, mascotas: false }, "mascotas")).toBe(false);
    expect(leeOficina({ ...todo, mascotas: false }, "hora")).toBe(true);
  });
});

describe("ajustes 0.7.0: quién escribe las conversaciones (JST-231 §7)", () => {
  // Lo que guarda la 0.6.0 en `localStorage`: sin `iaFuente` ni `iaVisto`.
  const de060 = { ...AJUSTES_POR_OMISION, voces: true, charlas: false, leer: { charlas: true, entregas: true, mascotas: false, sueltas: false, hora: false }, vozMas: true, vistoLeer: true } as Record<string, unknown>;
  delete de060.iaFuente;
  delete de060.iaVisto;

  it("viene elegida la IA y el punto violeta prendido; lo de la 0.6.0 se lee igual", () => {
    expect(AJUSTES_POR_OMISION).toMatchObject({ iaFuente: "ia", iaVisto: false });
    const a = leerAjustes(JSON.stringify(de060));
    expect(a).toEqual({ ...de060, iaFuente: "ia", iaVisto: false });
    // El mostrar u ocultar sigue en `charlas`, sin cambios.
    expect(a.charlas).toBe(false);
  });

  it("«Frases de siempre» se guarda y se lee; un valor raro vuelve a la IA; `iaVisto` se guarda", () => {
    expect(leerAjustes(JSON.stringify({ ...de060, iaFuente: "hoy" })).iaFuente).toBe("hoy");
    expect(leerAjustes(JSON.stringify({ iaFuente: "gemini" })).iaFuente).toBe("ia");
    expect(leerAjustes(JSON.stringify({ iaFuente: null, iaVisto: "sí" }))).toMatchObject({ iaFuente: "ia", iaVisto: false });
    expect(leerAjustes(JSON.stringify({ iaVisto: true })).iaVisto).toBe(true);
  });

  it("el punto violeta: sin abrir el menú, con la IA elegida y por bajar o lista; nunca sin la IA (celular, otro navegador)", () => {
    const a = leerAjustes(JSON.stringify(de060));
    expect(puntoIa(a, { k: "bajar" })).toBe(true);
    expect(puntoIa(a, { k: "lista" })).toBe(true);
    for (const k of ["bajando", "pausa", "fallo", "sin", "revisando"]) expect(puntoIa(a, { k })).toBe(false);
    expect(puntoIa({ ...a, iaVisto: true }, { k: "lista" })).toBe(false);
    expect(puntoIa({ ...a, iaFuente: "hoy" }, { k: "lista" })).toBe(false);
  });
});
