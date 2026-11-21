// El informe de «Leer contexto» (JST-414), la parte pura: los tiempos dichos, las frases enteras que se eligen de un
// texto y el informe armado para cada caso (pregunta con ayuda y opciones, confirmación, plan, tareas sugeridas, un
// «🙋 Te toca» del hilo, tarea frenada, lo último que escribió la persona). Todo con agentes y tareas inventados.
import { describe, expect, it } from "vitest";
import {
  bloquesDe,
  componerInforme,
  desdeCuando,
  elegirFrases,
  frasesDeDescripcion,
  frasesDeInforme,
  haceCuanto,
  segundosDeInforme,
  type ComentarioInforme,
  type DatosInforme,
  type TareaInforme,
} from "../src/ui/contextoInforme.js";
import type { Interaccion } from "../src/shared.js";

// Mediodía en la hora del navegador: los días de calendario no dependen del huso de quien corre la prueba.
const ahora = new Date(2026, 10, 20, 12, 0, 0).getTime();
const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;
const antes = (ms: number) => ahora - ms;
const iso = (ms: number) => new Date(antes(ms)).toISOString();

describe("los tiempos dichos", () => {
  it("minutos, horas y «un momento» si fue recién", () => {
    expect(haceCuanto(antes(20 * MIN), ahora)).toBe("hace 20 minutos");
    expect(haceCuanto(antes(30_000), ahora)).toBe("hace un momento");
    expect(haceCuanto(antes(3 * HORA), ahora)).toBe("hace 3 horas");
    expect(desdeCuando(antes(20 * MIN), ahora)).toBe("desde hace 20 minutos");
    expect(desdeCuando(antes(3 * HORA), ahora)).toBe("desde hace 3 horas");
  });

  it("«ayer» es el día de calendario anterior, y de ahí «hace 5 días»", () => {
    // Las 12 del día 19 a las 12 del día 20, y 5 días antes.
    expect(haceCuanto(antes(DIA), ahora)).toBe("ayer");
    expect(desdeCuando(antes(DIA), ahora)).toBe("desde ayer");
    expect(haceCuanto(antes(5 * DIA), ahora)).toBe("hace 5 días");
    expect(desdeCuando(antes(5 * DIA), ahora)).toBe("desde hace 5 días");
  });

  it("pasadas dos semanas dice la fecha y cuánto hace: «desde el 3 de octubre, hace 7 semanas»", () => {
    const hoy = new Date(2026, 10, 21, 12, 0, 0).getTime();
    const desde = new Date(2026, 9, 3, 12, 0, 0).getTime();
    expect(desdeCuando(desde, hoy)).toBe("desde el 3 de octubre, hace 7 semanas");
    expect(haceCuanto(desde, hoy)).toBe("hace 7 semanas");
  });

  it("una fecha que viene del futuro (reloj corrido) se dice como «recién», no negativa", () => {
    expect(haceCuanto(ahora + 5 * MIN, ahora)).toBe("hace un momento");
  });
});

describe("bloquesDe", () => {
  const bloques = bloquesDe(
    [
      "# Un título",
      "",
      "Un párrafo que sigue",
      "en la línea de abajo.",
      "",
      "- primer ítem",
      "  que continúa con sangría",
      "- segundo ítem",
      "1. un ítem numerado",
      "",
      "> una cita se lee como su texto",
      "",
      "| col | col |",
      "|---|---|",
      "| 1 | 2 |",
      "",
      "```sh",
      "git status",
      "```",
      "",
      "---",
      "",
      "El final.",
    ].join("\n"),
  );

  it("títulos, párrafos (las líneas seguidas se juntan) e ítems (con su continuación)", () => {
    expect(bloques.map((b) => b.tipo)).toEqual(["titulo", "parrafo", "item", "item", "item", "parrafo", "parrafo"]);
    expect(bloques[0]!.texto).toBe("Un título");
    expect(bloques[1]!.texto).toBe("Un párrafo que sigue en la línea de abajo.");
    expect(bloques[2]!.texto).toBe("primer ítem que continúa con sangría");
    expect(bloques[4]!.texto).toBe("un ítem numerado");
  });

  it("la cita es un párrafo; las tablas, el código y las reglas no se leen", () => {
    const textos = bloques.map((b) => b.texto);
    expect(textos).toContain("una cita se lee como su texto");
    expect(textos.join(" ")).not.toMatch(/col|git status|---/);
    expect(textos.at(-1)).toBe("El final.");
  });

  it("un bloque de código sin cerrar tampoco se lee", () => {
    expect(bloquesDe("Antes.\n\n```\nnpm test\nsigue sin cerrar").map((b) => b.texto)).toEqual(["Antes."]);
  });
});

describe("elegirFrases", () => {
  const frases = (md: string, letras = 400, clave = true) => elegirFrases(bloquesDe(md), letras, clave);

  it("la entradilla: las frases del primer párrafo", () => {
    expect(frases("Ya quedó lista la nueva portada. Cambié los colores y la tipografía.\n\nUn segundo párrafo de relleno que no pesa.")).toEqual([
      "Ya quedó lista la nueva portada.",
      "Cambié los colores y la tipografía.",
    ]);
  });

  it("lo que pesa al decidir entra solo si va al principio de su párrafo", () => {
    const f = frases("Resumen del avance de hoy.\n\nCambié los colores. Falta que el equipo apruebe el texto final. Cambié los márgenes.\n\nFalta revisar los enlaces del pie.");
    expect(f).toEqual(["Resumen del avance de hoy.", "Falta revisar los enlaces del pie."]);
    // Sin la clave (la descripción de una tarea) solo queda la entradilla.
    expect(frases("Resumen del avance de hoy.\n\nFalta revisar los enlaces del pie.", 400, false)).toEqual(["Resumen del avance de hoy."]);
  });

  it("lo operativo (worktree, rama, comandos) queda fuera; lo demás se lee", () => {
    expect(frases("Listo el cambio.\n\nTrabaja en un worktree aparte y crea una rama nueva. Corre git status antes de empezar.\n\nFalta que alguien lo apruebe.")).toEqual([
      "Listo el cambio.",
      "Falta que alguien lo apruebe.",
    ]);
  });

  it("los ítems que anuncia una frase con «:» entran (hasta 3); un cuarto, no", () => {
    expect(frases("Cuando la crees:\n\n- Avísame por el chat\n- Pon la fecha en el calendario\n- Cierra la tarea vieja\n- Un cuarto paso más")).toEqual([
      "Cuando la crees:",
      "Avísame por el chat.",
      "Pon la fecha en el calendario.",
      "Cierra la tarea vieja.",
    ]);
  });

  it("una frase que anuncia una lista y queda sola se quita (si hay otra cosa que decir)", () => {
    const larga = "un ítem larguísimo que no cabe entre los que se leen porque pasa de las ciento sesenta letras, y por eso no entra en lo que se dice en voz alta, aunque la frase que lo anuncia sea útil";
    expect(larga.length).toBeGreaterThan(160);
    expect(frases(`Todo quedó listo.\n\nFalta revisar lo siguiente:\n\n- ${larga}`)).toEqual(["Todo quedó listo."]);
    // Si es lo único que hay, se queda: es la entradilla.
    expect(frases("Lo revisé, solo leyendo:")).toEqual(["Lo revisé, solo leyendo:"]);
  });

  it("nunca corta una frase a la mitad y respeta el tope de letras", () => {
    const f = frases("Primera frase corta. Segunda frase de relleno que sigue. Tercera frase de relleno que sigue. Cuarta frase de relleno que sigue.", 70);
    expect(f).toEqual(["Primera frase corta.", "Segunda frase de relleno que sigue."]);
    expect(f.join(" ").length).toBeLessThanOrEqual(70);
    for (const x of f) expect(x).toMatch(/[.!?…:]$/);
  });

  it("una frase larguísima se acorta en una pausa, con «…»", () => {
    const f = frases(`Una frase larguísima, ${"con muchas palabras que siguen y siguen sin parar, ".repeat(8)}hasta el final.`);
    expect(f).toHaveLength(1);
    expect(f[0]!.length).toBeLessThanOrEqual(262);
    expect(f[0]).toMatch(/…$/);
    expect(f[0]).not.toMatch(/,…$/);
  });

  it("sin nada que decir, ninguna", () => {
    expect(frases("")).toEqual([]);
    expect(frases("# Solo un título")).toEqual([]);
    expect(frases("Algo que decir.", 0)).toEqual([]);
  });

  it("las menciones sueltas, el inglés y las exclamaciones vacías no se leen", () => {
    expect(frases("¡Listo!\n\n[@QA](agent://qa) [@Dev](agent://dev)\n\nQuedó publicada la guía.")).toEqual(["Quedó publicada la guía."]);
  });
});

describe("frasesDeDescripcion", () => {
  it("prefiere la sección «Por qué» y salta «Cómo trabajar»", () => {
    const md = "## Cómo trabajar\nUsa la rama nueva y corre las pruebas.\n\n## Por qué\nLos clientes no encuentran la guía de inicio. Hay que publicarla.\n";
    expect(frasesDeDescripcion(md, 300)).toEqual(["Los clientes no encuentran la guía de inicio.", "Hay que publicarla."]);
  });

  it("sin una sección que explique, lee las que no son para quien la trabaja", () => {
    const md = "## Cómo trabajar\nUsa la rama nueva.\n\n## Detalles del cliente\nLos socios piden más claridad en el sitio.\n\n## Verificación\nCorre los tests.";
    expect(frasesDeDescripcion(md, 300)).toEqual(["Los socios piden más claridad en el sitio."]);
  });

  it("sin secciones, lo que diga el texto", () => {
    expect(frasesDeDescripcion("Hay que entregar la guía de inicio. Es importante hacerlo antes del viernes.", 300)).toEqual([
      "Hay que entregar la guía de inicio.",
      "Es importante hacerlo antes del viernes.",
    ]);
  });
});

// ---------------------------------------------------------------------------
// El informe armado
// ---------------------------------------------------------------------------

const tarea = (extra: Partial<TareaInforme> = {}): TareaInforme => ({
  id: "t1",
  identifier: "ABC-12",
  title: "Publicar la guía de inicio",
  description: null,
  status: "in_review",
  assigneeAgentId: "a1",
  ...extra,
});
const tarjeta = (extra: Partial<Interaccion>): Interaccion =>
  ({ id: "i1", kind: "request_confirmation", status: "pending", title: null, summary: null, payload: {}, createdAt: iso(3 * HORA), createdByAgentId: "a1", ...extra }) as Interaccion;
const coment = (id: string, body: string, ms: number, extra: Partial<ComentarioInforme> = {}): ComentarioInforme => ({ id, body, createdAt: iso(ms), authorType: "agent", ...extra });
const agentes = { a1: "Marta Redacción", a2: "Lucho Revisor" };
const informe = (d: Partial<DatosInforme>, nivel: "corto" | "completo" = "completo") =>
  componerInforme({ tarea: tarea(), comentarios: [], tarjetas: [], agentes, ahora, ...d }, nivel);
const claves = (d: Partial<DatosInforme>, nivel: "corto" | "completo" = "completo") => informe(d, nivel).secciones.map((s) => s.clave);
const frasesDe = (d: Partial<DatosInforme>, nivel: "corto" | "completo" = "completo") => frasesDeInforme(informe(d, nivel));
const seccion = (d: Partial<DatosInforme>, clave: string, nivel: "corto" | "completo" = "completo") => informe(d, nivel).secciones.find((s) => s.clave === clave)?.frases ?? [];

describe("una pregunta con ayuda y opciones (ask_user_questions)", () => {
  const preguntas = tarjeta({
    kind: "ask_user_questions",
    title: "Preguntas",
    payload: {
      questions: [
        {
          prompt: "¿Qué tono usamos para la guía?",
          helpText: "Piensa en quien la lee por primera vez. Es un lector nuevo.",
          selectionMode: "single",
          options: [
            { label: "Formal", description: "Más serio y largo" },
            { label: "Cercano", description: "Más breve" },
          ],
        },
      ],
    },
  });

  it("quién te espera, la pregunta entera, su ayuda y cada opción con su explicación", () => {
    const i = informe({ tarjetas: [preguntas] });
    expect(i.secciones.map((s) => s.clave)).toEqual(["pide", "pregunta"]);
    expect(i.secciones[0]!.titulo).toBe("Quién te espera");
    expect(i.secciones[0]!.frases).toEqual(["Marta Redacción te espera desde hace 3 horas.", "Es por la tarea ABC-12: Publicar la guía de inicio."]);
    expect(i.secciones[1]!.titulo).toBe("Qué te pregunta");
    expect(i.secciones[1]!.frases).toEqual([
      "Te pregunta: ¿Qué tono usamos para la guía?",
      "Piensa en quien la lee por primera vez.",
      "Es un lector nuevo.",
      "Hay 2 opciones.",
      "Formal: Más serio y largo.",
      "Cercano: Más breve.",
    ]);
  });

  it("en corto, sin la ayuda ni la explicación de cada opción: las opciones en una frase", () => {
    const f = seccion({ tarjetas: [preguntas] }, "pregunta", "corto");
    expect(f).toEqual(["Te pregunta: ¿Qué tono usamos para la guía?", "Puedes responder «Formal» o «Cercano»."]);
  });

  it("con varias preguntas (ask_user_questions) las cuenta y las numera; la de opción múltiple dice «Puedes marcar»", () => {
    const dos = tarjeta({
      kind: "ask_user_questions",
      payload: {
        questions: [
          { prompt: "¿Qué tono usamos?", options: [{ label: "Formal" }, { label: "Cercano" }] },
          { prompt: "¿Qué secciones incluimos?", selectionMode: "multi", options: [{ label: "Portada" }, { label: "Índice" }] },
        ],
      },
    });
    expect(seccion({ tarjetas: [dos] }, "pregunta")).toEqual([
      "Te pregunta 2 cosas.",
      "Primera: ¿Qué tono usamos?",
      "Puedes responder «Formal» o «Cercano».",
      "Segunda: ¿Qué secciones incluimos?",
      "Puedes marcar «Portada» o «Índice».",
    ]);
  });
});

describe("una confirmación (request_confirmation)", () => {
  const confirmacion = tarjeta({
    title: "Confirmar la publicación",
    summary: "Publicar la guía hoy mismo.",
    payload: { prompt: "¿Publico la guía hoy?", acceptLabel: "Sí, publica", rejectLabel: "Espera", detailsMarkdown: "Falta solo la revisión final de los enlaces. Recomiendo publicar antes del viernes." },
  });

  it("la pregunta con los dos botones; el resumen y los detalles, en «Lo que te explica»", () => {
    expect(seccion({ tarjetas: [confirmacion] }, "pregunta")).toEqual(["Te pregunta: ¿Publico la guía hoy?", "Puedes responder «Sí, publica» o «Espera»."]);
    expect(informe({ tarjetas: [confirmacion] }).secciones.find((s) => s.clave === "explica")!.titulo).toBe("Lo que te explica");
    expect(seccion({ tarjetas: [confirmacion] }, "explica")).toEqual(["Te explica: Publicar la guía hoy mismo.", "Falta solo la revisión final de los enlaces.", "Recomiendo publicar antes del viernes."]);
  });

  it("el resumen que repite la pregunta no se dice dos veces", () => {
    const repite = tarjeta({ summary: "¿Publico la guía hoy?", payload: { prompt: "¿Publico la guía hoy?" } });
    expect(claves({ tarjetas: [repite] })).toEqual(["pide", "pregunta"]);
  });

  it("corto deja el resumen pero no los detalles", () => {
    const f = seccion({ tarjetas: [confirmacion] }, "explica", "corto");
    expect(f).toEqual(["Te explica: Publicar la guía hoy mismo."]);
  });

  it("sin pregunta clara, la tarjeta pide confirmar (no «te pregunta»)", () => {
    const f = seccion({ tarjetas: [tarjeta({ payload: { prompt: "Publicar la guía hoy." } })] }, "pregunta");
    expect(f[0]).toBe("Te pide confirmar: Publicar la guía hoy.");
  });

  it("de varias tarjetas lee la más nueva y avisa que hay otra", () => {
    const vieja = tarjeta({ id: "i0", createdAt: iso(2 * DIA), payload: { prompt: "¿Cambio el logo?" } });
    const i = informe({ tarjetas: [vieja, confirmacion] });
    expect(i.secciones[0]!.frases).toContain("Hay otra tarjeta esperando tu respuesta.");
    expect(frasesDeInforme(i).join(" ")).not.toContain("logo");
  });

  it("las tarjetas ya respondidas no cuentan: se informa de la tarea", () => {
    expect(claves({ tarjetas: [tarjeta({ status: "accepted", payload: { prompt: "¿Publico la guía hoy?" } })] })).toEqual(["tarea", "estado"]);
  });
});

describe("casillas con opciones y su explicación (request_checkbox_confirmation)", () => {
  it("dice qué puedes marcar y qué explica cada opción", () => {
    const casillas = tarjeta({
      kind: "request_checkbox_confirmation",
      payload: { prompt: "Marca lo que quieres incluir.", options: [{ label: "Portada", description: "Con logo" }, { label: "Índice" }] },
    });
    expect(seccion({ tarjetas: [casillas] }, "pregunta")).toEqual(["Te pide: Marca lo que quieres incluir.", "Hay 2 opciones.", "Portada: Con logo.", "Índice."]);
  });

  it("opciones cortas y sin explicación van en una sola frase", () => {
    const casillas = tarjeta({ kind: "request_checkbox_confirmation", payload: { prompt: "¿Qué incluimos?", options: [{ label: "Portada" }, { label: "Índice" }] } });
    expect(seccion({ tarjetas: [casillas] }, "pregunta")).toEqual(["Te pregunta: ¿Qué incluimos?", "Puedes marcar «Portada» o «Índice»."]);
  });

  it("de más de cinco opciones dice cuántas faltan", () => {
    const opciones = ["Uno", "Dos", "Tres", "Cuatro", "Cinco", "Seis", "Siete"].map((label) => ({ label, description: `La opción ${label}` }));
    const f = seccion({ tarjetas: [tarjeta({ kind: "request_checkbox_confirmation", payload: { prompt: "Marca las que quieras.", options: opciones } })] }, "pregunta");
    expect(f).toContain("Hay 7 opciones.");
    expect(f.at(-1)).toBe("Y 2 opciones más.");
    expect(f.filter((x) => x.startsWith("La opción") || /^\w+: La opción/.test(x))).toHaveLength(5);
  });
});

describe("aprobar un plan", () => {
  const plan = {
    title: "Plan: guía de inicio",
    body: "## Objetivo\nTener la guía lista para el equipo nuevo.\n\n## Pasos\n- Escribir el borrador\n- Revisar los enlaces\n- Publicar\n\n## Riesgos\nPuede faltar tiempo para la revisión.",
  };
  const aprobar = tarjeta({ title: "Plan approval - Guía", payload: { prompt: "¿Apruebas el plan?", target: { type: "issue_document", key: "plan" } } });

  it("dice el objetivo, cuántos pasos tiene y cuáles, y los riesgos", () => {
    const f = seccion({ tarea: tarea({ planDocument: plan }), tarjetas: [aprobar] }, "plan");
    expect(informe({ tarea: tarea({ planDocument: plan }), tarjetas: [aprobar] }).secciones.find((s) => s.clave === "plan")!.titulo).toBe("El plan");
    expect(f).toEqual([
      "El plan: guía de inicio.",
      "Tener la guía lista para el equipo nuevo.",
      "Tiene 3 pasos.",
      "1: Escribir el borrador.",
      "2: Revisar los enlaces.",
      "3: Publicar.",
      "Riesgos: Puede faltar tiempo para la revisión.",
    ]);
  });

  it("en corto, solo el objetivo y cuántos pasos", () => {
    const f = seccion({ tarea: tarea({ planDocument: plan }), tarjetas: [aprobar] }, "plan", "corto");
    expect(f).toEqual(["El plan: guía de inicio.", "Tener la guía lista para el equipo nuevo.", "Tiene 3 pasos."]);
  });

  it("una tarjeta que no es de plan no lleva la parte del plan", () => {
    expect(claves({ tarea: tarea({ planDocument: plan }), tarjetas: [tarjeta({ payload: { prompt: "¿Publico la guía hoy?" } })] })).not.toContain("plan");
  });
});

describe("tareas sugeridas (suggest_tasks)", () => {
  it("cuántas propone y cuáles", () => {
    const sugiere = tarjeta({ kind: "suggest_tasks", title: "Siguientes pasos", payload: { tasks: [{ title: "Traducir la guía" }, { title: "Grabar un video" }] } });
    expect(seccion({ tarjetas: [sugiere] }, "pregunta")).toEqual(["Te propone 2 tareas para que elijas cuáles crear: Siguientes pasos.", "Son: Traducir la guía; Grabar un video."]);
  });

  it("con muchas, nombra las primeras: tres en corto y seis en completo", () => {
    const tasks = Array.from({ length: 8 }, (_, i) => ({ title: `Tarea número ${i + 1}` }));
    const sugiere = tarjeta({ kind: "suggest_tasks", payload: { tasks } });
    expect(seccion({ tarjetas: [sugiere] }, "pregunta", "corto")[1]!.split(";")).toHaveLength(3);
    expect(seccion({ tarjetas: [sugiere] }, "pregunta")[1]!.split(";")).toHaveLength(6);
    expect(seccion({ tarjetas: [sugiere] }, "pregunta")[1]).toMatch(/^Entre ellas:/);
  });
});

describe("un «🙋 Te toca» del hilo, sin tarjeta", () => {
  const teToca = coment("c1", "🙋 Te toca: ¿publico la guía hoy? Falta tu visto bueno.", 2 * HORA, { authorAgentId: "a2" });

  it("lo dice como pregunta, con quien la hizo y desde cuándo; el resto, como explicación", () => {
    const i = informe({ comentarios: [teToca] });
    expect(i.secciones.map((s) => s.clave)).toEqual(["pide", "pregunta", "explica"]);
    expect(i.secciones[0]!.frases[0]).toBe("Lucho Revisor te espera desde hace 2 horas.");
    expect(i.secciones[1]!.frases).toEqual(["Te toca: ¿publico la guía hoy?"]);
    expect(i.secciones[2]!.frases).toEqual(["Te explica: Falta tu visto bueno."]);
  });

  it("si después vino otro comentario, ya no te toca eso", () => {
    const despues = coment("c2", "Gracias, sigo yo con los enlaces.", 1 * HORA, { authorType: "user" });
    expect(claves({ comentarios: [teToca, despues] })).not.toContain("pregunta");
  });

  it("una tarjeta pendiente manda sobre el «Te toca» del hilo", () => {
    const d = { comentarios: [teToca], tarjetas: [tarjeta({ payload: { prompt: "¿Cambio el logo?" } })] };
    expect(seccion(d, "pregunta")).toEqual(["Te pregunta: ¿Cambio el logo?"]);
    expect(seccion(d, "pide")[0]).toMatch(/^Marta Redacción te espera/);
  });
});

describe("una tarea sin pregunta", () => {
  const bloqueada = tarea({
    status: "blocked",
    blockedTransitionAt: iso(5 * DIA),
    blockedBy: [{ identifier: "ABC-3", title: "Aprobar el presupuesto", status: "in_progress", assigneeAgentId: "a2" }],
    blockerAttention: { terminalBlocker: { identifier: "ABC-1", title: "Elegir proveedor" } },
  });

  it("qué es y en qué está: quién la tiene, desde cuándo, qué la frena y qué hay en el fondo", () => {
    const i = informe({ tarea: bloqueada });
    expect(i.secciones.map((s) => s.clave)).toEqual(["tarea", "estado"]);
    expect(i.secciones[0]!.titulo).toBe("La tarea");
    expect(i.secciones[1]!.titulo).toBe("En qué está");
    expect(i.secciones[0]!.frases).toEqual(["Tarea ABC-12: Publicar la guía de inicio."]);
    expect(i.secciones[1]!.frases).toEqual([
      "Está bloqueada desde hace 5 días, la tiene Marta Redacción.",
      "La frena ABC-3: Aprobar el presupuesto, que está en curso y la tiene Lucho Revisor.",
      "En el fondo, todo espera a ABC-1: Elegir proveedor.",
    ]);
  });

  it("lo que la tarea bloquea va en «Qué depende de ella» y su padre, como parte de", () => {
    const t = tarea({ blocks: [{ identifier: "ABC-20", title: "Enviar el boletín", status: "blocked" }], ancestors: [{ identifier: "ABC-2", title: "Lanzamiento de otoño" }] });
    const dep = informe({ tarea: t }).secciones.find((s) => s.clave === "depende")!;
    expect(dep.titulo).toBe("Qué depende de ella");
    expect(dep.frases).toEqual(["De esta tarea depende ABC-20: Enviar el boletín, que está bloqueada.", "Es parte de ABC-2: Lanzamiento de otoño."]);
  });

  it("con una pregunta, lo que depende es «de tu respuesta» y el rótulo «Qué depende de ti»", () => {
    const t = tarea({ blocks: [{ identifier: "ABC-20", title: "Enviar el boletín", status: "todo" }] });
    const dep = informe({ tarea: t, tarjetas: [tarjeta({ payload: { prompt: "¿Publico la guía hoy?" } })] }).secciones.find((s) => s.clave === "depende")!;
    expect(dep.titulo).toBe("Qué depende de ti");
    expect(dep.frases[0]).toBe("De tu respuesta depende ABC-20: Enviar el boletín.");
  });

  it("lo bloqueado que ya terminó no se menciona", () => {
    const t = tarea({ blocks: [{ identifier: "ABC-20", title: "Enviar el boletín", status: "done" }] });
    expect(claves({ tarea: t })).not.toContain("depende");
  });

  it("la descripción aporta «La tarea dice:» (la sección que explica el porqué)", () => {
    const t = tarea({ description: "## Cómo trabajar\nUsa la rama nueva.\n\n## Por qué\nLos clientes no encuentran la guía." });
    expect(seccion({ tarea: t }, "tarea")).toEqual(["Tarea ABC-12: Publicar la guía de inicio.", "La tarea dice: Los clientes no encuentran la guía."]);
  });

  it("sin agente nombrado, sin nombre; sin estado conocido, sin esa frase", () => {
    expect(seccion({ tarea: tarea({ assigneeAgentId: "zz" }) }, "estado")).toEqual(["Está en revisión."]);
    expect(claves({ tarea: tarea({ status: "otro" }) })).toEqual(["tarea"]);
  });

  it("una tarea quieta hace días lo dice (solo completo)", () => {
    const t = tarea({ updatedAt: iso(4 * DIA) });
    expect(seccion({ tarea: t }, "estado").at(-1)).toBe("No se mueve desde hace 4 días.");
    expect(seccion({ tarea: t }, "estado", "corto").join(" ")).not.toContain("No se mueve");
  });
});

describe("dónde va: lo último del hilo", () => {
  it("lo último escrito por la persona: «Lo último lo escribiste tú…»", () => {
    const f = seccion({ comentarios: [coment("c1", "Sigo con los enlaces, ya voy a la mitad.", 1 * HORA, { authorType: "user" })] }, "va");
    expect(f).toEqual(["Lo último lo escribiste tú, hace una hora: Sigo con los enlaces, ya voy a la mitad."]);
  });

  it("lo último de un agente: «Dónde va, según …»; lo de hace más de un día lleva cuánto hace", () => {
    const reciente = seccion({ comentarios: [coment("c1", "Terminé el borrador de la guía.", 2 * HORA, { authorAgentId: "a2" })] }, "va");
    expect(reciente[0]).toBe("Dónde va, según Lucho Revisor: Terminé el borrador de la guía.");
    const viejo = seccion({ comentarios: [coment("c1", "Terminé el borrador de la guía.", 3 * DIA, { authorAgentId: "a2" })] }, "va");
    expect(viejo[0]).toBe("Dónde va, según Lucho Revisor, hace 3 días: Terminé el borrador de la guía.");
  });

  it("con una persona que escribió lo último y un agente antes, lee las dos cosas", () => {
    const f = seccion(
      {
        comentarios: [coment("c1", "Terminé el borrador.", 5 * HORA, { authorAgentId: "a2" }), coment("c2", "Perfecto, gracias.", 1 * HORA, { authorType: "user" })],
      },
      "va",
    );
    expect(f).toEqual(["Lo último lo escribiste tú, hace una hora: Perfecto, gracias.", "Antes, Lucho Revisor dijo: Terminé el borrador."]);
  });

  it("los avisos automáticos, lo vacío y lo escrito en inglés no se leen", () => {
    const f = seccion(
      {
        comentarios: [
          coment("c1", "👍", 1 * HORA, { authorType: "user" }),
          coment("c2", "The agent moved this issue to review because the build was green and there was nothing else to do.", 2 * HORA),
          coment("c3", "Avisamos que la ejecución terminó.", 3 * HORA, { presentation: { kind: "system_notice" } }),
        ],
      },
      "va",
    );
    expect(f).toEqual([]);
  });
});

describe("quién te espera, con y sin nombre", () => {
  const pendiente = tarjeta({ payload: { prompt: "¿Publico la guía hoy?" } });

  it("con el nombre del agente: «Marta Redacción te espera…»; sin él: «Te esperan…»", () => {
    expect(seccion({ tarjetas: [pendiente] }, "pide")[0]).toBe("Marta Redacción te espera desde hace 3 horas.");
    expect(seccion({ tarjetas: [pendiente], agentes: {} }, "pide")[0]).toBe("Te esperan desde hace 3 horas.");
  });

  it("quien creó la tarjeta es quien espera; si no consta, quien tiene la tarea", () => {
    expect(seccion({ tarjetas: [tarjeta({ createdByAgentId: "a2", payload: { prompt: "¿Publico?" } })] }, "pide")[0]).toMatch(/^Lucho Revisor te espera/);
    expect(seccion({ tarjetas: [tarjeta({ createdByAgentId: null, payload: { prompt: "¿Publico?" } })] }, "pide")[0]).toMatch(/^Marta Redacción te espera/);
  });

  it("la tarea sin código se dice solo con su título", () => {
    expect(seccion({ tarea: tarea({ identifier: null }), tarjetas: [pendiente] }, "pide")[1]).toBe("Es por la tarea Publicar la guía de inicio.");
  });
});

describe("corto contra completo", () => {
  const datos: Partial<DatosInforme> = {
    tarea: tarea({ updatedAt: iso(4 * DIA), blocks: [{ identifier: "ABC-20", title: "Enviar el boletín", status: "todo" }, { identifier: "ABC-21", title: "Avisar al equipo", status: "todo" }] }),
    comentarios: [coment("c1", "Terminé el borrador de la guía y falta la revisión.", 2 * HORA, { authorAgentId: "a2" })],
    tarjetas: [
      tarjeta({
        summary: "Publicar la guía hoy mismo.",
        payload: { prompt: "¿Publico la guía hoy?", detailsMarkdown: "Falta solo la revisión final de los enlaces. Recomiendo publicar antes del viernes.", acceptLabel: "Sí", rejectLabel: "No" },
      }),
    ],
  };

  it("el corto deja quién pide, la pregunta, el resumen de la tarjeta y una frase de qué depende; sin estado ni «Dónde va»", () => {
    expect(claves(datos, "corto")).toEqual(["pide", "pregunta", "explica", "depende"]);
    expect(seccion(datos, "depende", "corto")).toHaveLength(1);
  });

  it("el completo suma los detalles, todo lo que depende y dónde va", () => {
    expect(claves(datos)).toEqual(["pide", "pregunta", "explica", "depende", "va"]);
    expect(seccion(datos, "depende")[0]).toMatch(/^De tu respuesta dependen ABC-20/);
    expect(seccion(datos, "va")[0]).toMatch(/^Dónde va, según Lucho Revisor/);
  });

  it("el corto es más corto que el completo", () => {
    expect(segundosDeInforme(informe(datos, "corto"))).toBeLessThan(segundosDeInforme(informe(datos)));
    expect(frasesDe(datos, "corto").length).toBeLessThan(frasesDe(datos).length);
  });

  it("sin pregunta, el corto deja qué es, en qué está y lo último en una frase", () => {
    const sin: Partial<DatosInforme> = { comentarios: [coment("c1", "Terminé el borrador.", 2 * HORA, { authorAgentId: "a2" })] };
    expect(claves(sin, "corto")).toEqual(["tarea", "estado", "va"]);
    expect(seccion(sin, "va", "corto")).toHaveLength(1);
  });
});

describe("el inglés se mira en lo que se lee (JST-310)", () => {
  const plantilla =
    "Paperclip detected an unusual productivity pattern on an assigned issue and there is a lot of work on it.\n\n## Source\n- Source issue: [ABC-9](/ABC/issues/ABC-9)\n- Trigger reasons: the runs were in a loop and the comments were the same in the last hour.\n\n## Latest comments\n" +
    "- Avance: ya está el arreglo del caso, falta que la QA lo vea en la copia y que el usuario lo apruebe en la tarjeta.";

  it("una descripción que empieza en inglés no se lee, ni sus restos cortos", () => {
    expect(frasesDe({ tarea: tarea({ description: plantilla }) }).join(" ")).not.toMatch(/La tarea dice|Source/);
  });

  it("un comentario que empieza en inglés no se lee, aunque termine en español; el anterior en español sí", () => {
    const enIngles = coment("c1", "The agent moved this issue to review because the build was green and there was nothing else to do. Después lo revisé yo: está bien, y falta que la QA lo pruebe en la copia.", 1 * HORA);
    const f = seccion({ comentarios: [enIngles, coment("c2", "Sí, dale.", 2 * HORA, { authorType: "user" })] }, "va");
    expect(f).toEqual(["Lo último lo escribiste tú, hace 2 horas: Sí, dale."]);
  });
});

describe("el informe como un todo", () => {
  it("frasesDeInforme junta las frases de todas las partes, en orden", () => {
    const i = informe({ tarjetas: [tarjeta({ payload: { prompt: "¿Publico la guía hoy?" } })] });
    expect(frasesDeInforme(i)).toEqual(i.secciones.flatMap((s) => s.frases));
    expect(frasesDeInforme({ secciones: [] })).toEqual([]);
  });

  it("segundosDeInforme: unas 16 letras por segundo", () => {
    expect(segundosDeInforme({ secciones: [{ clave: "va", titulo: "x", frases: ["x".repeat(160)] }] })).toBe(10);
    expect(segundosDeInforme({ secciones: [] })).toBe(0);
  });

  it("los rótulos son los de cada parte (para traducirlos), y las frases no se repiten entre partes", () => {
    const i = informe({
      tarea: tarea({ blocks: [{ identifier: "ABC-20", title: "Enviar el boletín", status: "todo" }] }),
      comentarios: [coment("c1", "Terminé el borrador de la guía.", 2 * HORA, { authorAgentId: "a2" })],
      tarjetas: [tarjeta({ summary: "¿Publico la guía hoy?", payload: { prompt: "¿Publico la guía hoy?" } })],
    });
    expect(i.secciones.map((s) => s.titulo)).toEqual(["Quién te espera", "Qué te pregunta", "Qué depende de ti", "Dónde va"]);
    const todas = frasesDeInforme(i);
    expect(new Set(todas).size).toBe(todas.length);
  });
});

describe("lo que ya se dijo no se repite, y la cabeza no se pierde", () => {
  it("la primera frase de «Dónde va» que repite la pregunta se salta y la cabeza queda en la que sigue", () => {
    const d: Partial<DatosInforme> = {
      tarjetas: [tarjeta({ payload: { prompt: "¿Publico la guía hoy?" } })],
      comentarios: [coment("c1", "¿Publico la guía hoy? Falta revisar los enlaces.", 1 * HORA, { authorAgentId: "a2" })],
    };
    const todas = frasesDe(d);
    expect(todas.filter((f) => f.includes("Publico la guía hoy"))).toHaveLength(1);
    expect(seccion(d, "va")).toEqual(["Dónde va, según Lucho Revisor: Falta revisar los enlaces."]);
  });

  it("«La tarea dice:» deja fuera lo que repite el título y lleva la cabeza en lo que queda", () => {
    const d: Partial<DatosInforme> = { tarea: tarea({ title: "Publicar la guía", description: "Publicar la guía. Hay que revisar los enlaces." }) };
    expect(seccion(d, "tarea")).toEqual(["Tarea ABC-12: Publicar la guía.", "La tarea dice: Hay que revisar los enlaces."]);
  });

  it("con una pregunta, «La tarea dice:» tampoco repite lo ya dicho", () => {
    const d: Partial<DatosInforme> = {
      tarea: tarea({ title: "Publicar la guía", description: "Publicar la guía. Hay que revisar los enlaces." }),
      tarjetas: [tarjeta({ payload: { prompt: "¿Publico?" } })],
    };
    expect(seccion(d, "tarea")).toEqual(["La tarea dice: Hay que revisar los enlaces."]);
  });
});

describe("el plan respeta el tope de largo", () => {
  const aprobar = tarjeta({ title: "Plan approval - Guía", payload: { prompt: "¿Apruebas el plan?", target: { key: "plan" } } });
  const pasosLargos = Array.from({ length: 6 }, (_x, k) => `- Paso número ${k + 1} que explica con bastante detalle lo que hay que hacer en esta etapa del trabajo con el equipo de redacción y de revisión`).join("\n");
  const plan = { title: "Plan: guía de inicio", body: `## Objetivo\nTener la guía lista para el equipo nuevo.\n\n## Pasos\n${pasosLargos}\n\n## Riesgos\nPuede faltar tiempo para la revisión.` };

  it("en corto y en completo no pasa del tope, y los pasos y las secciones extra son lo primero que se va", () => {
    const corto = seccion({ tarea: tarea({ planDocument: plan }), tarjetas: [aprobar] }, "plan", "corto");
    expect(corto.join(" ").length).toBeLessThanOrEqual(220);
    const completo = seccion({ tarea: tarea({ planDocument: plan }), tarjetas: [aprobar] }, "plan");
    expect(completo.join(" ").length).toBeLessThanOrEqual(600);
    expect(completo[0]).toBe("El plan: guía de inicio.");
    expect(completo).toContain("Tiene 6 pasos.");
    expect(completo.some((f) => f.startsWith("Riesgos"))).toBe(false);
    expect(completo.filter((f) => /^\d: /.test(f)).length).toBeLessThan(6);
  });

  it("un plan titulado solo «Plan» no dice «El plan: Plan.»", () => {
    const f = seccion({ tarea: tarea({ planDocument: { title: "Plan", body: "## Objetivo\nTener la guía lista." } }), tarjetas: [aprobar] }, "plan");
    expect(f).toEqual(["Tener la guía lista."]);
  });

  it("una sección «Qué haría» con ítems se dice una sola vez, como pasos", () => {
    const f = seccion({ tarea: tarea({ planDocument: { title: "Plan: otra guía", body: "## Qué haría\n- Escribir el borrador\n- Publicar" } }), tarjetas: [aprobar] }, "plan");
    expect(f).toEqual(["El plan: otra guía.", "Tiene 2 pasos.", "1: Escribir el borrador.", "2: Publicar."]);
  });
});

describe("datos con forma rara", () => {
  const raro = (extra: Record<string, unknown>) => ({ ...tarea(), ...extra }) as unknown as TareaInforme;

  it("las relaciones que no son listas o traen null no rompen ni dicen «depende .»", () => {
    const d = { tarea: raro({ blocks: "x", blockedBy: { a: 1 }, ancestors: [null, {}, { identifier: null, title: null }], status: "blocked" }) };
    const f = frasesDe(d);
    expect(f.join(" ")).not.toMatch(/depende \.|Tarea \.|parte de \./);
  });

  it("una relacionada sin código ni título se salta, y la que sí se puede nombrar se dice", () => {
    const d = { tarea: raro({ blocks: [null, { status: "todo" }, { identifier: "ABC-30", title: "Enviar el boletín", status: "todo" }] }) };
    expect(seccion(d, "depende")).toEqual(["De esta tarea depende ABC-30: Enviar el boletín."]);
  });

  it("los comentarios y las tarjetas que no son listas o traen null se ignoran", () => {
    const d = { comentarios: [null, coment("c1", "Terminé el borrador.", HORA, { authorAgentId: "a2" })] as unknown as ComentarioInforme[], tarjetas: [null] as unknown as Interaccion[] };
    expect(seccion(d, "va")[0]).toMatch(/Terminé el borrador/);
    expect(() => informe({ comentarios: "no" as unknown as ComentarioInforme[], tarjetas: {} as unknown as Interaccion[] })).not.toThrow();
  });

  it("una tarea sin título dice «Tarea {código}.» o «Tarea sin título.»", () => {
    expect(seccion({ tarea: raro({ title: null }) }, "tarea")[0]).toBe("Tarea ABC-12.");
    expect(seccion({ tarea: raro({ title: null, identifier: null }) }, "tarea")[0]).toBe("Tarea sin título.");
  });
});

describe("texto que no se lee", () => {
  it("las etiquetas HTML se quitan antes de armar las frases", () => {
    const f = elegirFrases(bloquesDe("<details><summary>Detalle</summary>\nFalta revisar los enlaces.<br>Hay que publicar hoy.\n</details>"), 300);
    expect(f.join(" ")).not.toMatch(/[<>]|details|summary/);
    expect(f.join(" ")).toMatch(/Falta revisar los enlaces/);
  });

  it("una frase con && o ||, o con una ruta absoluta, es operativa y no se lee", () => {
    const f = elegirFrases(bloquesDe("Falta revisar los enlaces de la guía. Corre cd guia && npm test para probarlo. Abre /Users/usuario/guia/index.md en el editor. Mira ~/notas/guia.md también. Usa a || b si falla."), 400);
    expect(f).toEqual(["Falta revisar los enlaces de la guía."]);
  });

  it("un bloque con rutas que empiezan con / o ~/ es técnico: solo se lee si es la entradilla", () => {
    const f = elegirFrases(bloquesDe("Hay una novedad de la guía.\n\nFalta mirar el archivo en /srv/guia/index y /srv/guia/otro."), 400);
    expect(f).toEqual(["Hay una novedad de la guía."]);
  });

  it("«la tiene una persona» cuando la tarea es de una persona, sin decir que eres tú", () => {
    expect(seccion({ tarea: tarea({ assigneeAgentId: null, assigneeUserId: "u1" }) }, "estado")[0]).toBe("Está en revisión, la tiene una persona.");
  });

  it("la pregunta con varias frases con «?» no pasa del doble del tope", () => {
    const largo = Array.from({ length: 30 }, (_x, k) => `¿Quieres que revisemos juntos el punto número ${k + 1} de la guía?`).join(" ");
    const f = seccion({ tarjetas: [tarjeta({ payload: { prompt: largo } })] }, "pregunta", "corto");
    expect(f.join(" ").length).toBeLessThanOrEqual(220 * 2 + 40);
  });
});
