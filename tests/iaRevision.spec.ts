// La revisión de lo que escribe la IA de Chrome (0.7.0, JST-232; punto 4 del spike de JST-230): ningún dato inventado
// (nombres, cargos, empresas, números, códigos, estados, cuándo, «voy a…») y el largo de las frases de hoy. Desde la
// 0.8.1 (JST-251), tampoco palabras que no existen.
import { describe, expect, it } from "vitest";
import { casiIgual, fraseIaParaVoz, LETRAS_FINAL, LETRAS_SUELTA, MAX_FINAL_PX, revisarApertura, revisarBroma, revisarFinal, revisarMascota, revisarSuelta, revisarTexto } from "../src/ia/revision.js";
import { anchoTexto } from "../src/hilo.js";

const fijas = [{ texto: "A CEO le falló el run." }, { texto: "¿Qué le pasó?" }, { texto: "Se quedó sin cupo, parece." }];
const NOMBRES = ["QA Engineer", "Ingeniero/a", "Catalina", "Betalandia", "El Mirador", "Migo", "JSTM", "Hermes"];

describe("lo que escribe la IA no trae datos (no inventa)", () => {
  it("las respuestas buenas del spike pasan", () => {
    for (const t of ["Harta pega, ¿eh?", "Uf, qué mal momento.", "¡Qué paciencia, eh!", "Ah, sí. ¡Qué bueno!", "¡Uy! Espero que no tenga problemas.", "Ya veo, nos toca té.", "¡Qué alivio, qué bueno!"]) {
      expect(revisarTexto(t, { letras: LETRAS_FINAL, px: MAX_FINAL_PX, nombres: NOMBRES }), t).toEqual([]);
    }
  });

  it("un nombre, una empresa o un cargo: se bota", () => {
    expect(revisarTexto("¡Bien ahí, Catalina!", { letras: 45 })).toContain("un nombre");
    expect(revisarTexto("¡bien ahí, catalina!", { letras: 45, nombres: NOMBRES })).toContain("nombra a alguien de la oficina");
    expect(revisarTexto("En Betalandia están rápidos.", { letras: 45 })).toContain("un nombre");
    expect(revisarTexto("¿En quién? En el diseñador.", { letras: 45 })).toContain("nombra a alguien por su cargo");
    expect(revisarTexto("Qué caos con el ceo.", { letras: 45 })).toContain("nombra a alguien por su cargo");
    expect(revisarTexto("El usuario está lento.", { letras: 45 })).toContain("nombra a alguien por su cargo");
    expect(revisarTexto("Espera a A.", { letras: 45 })).toContain("un nombre");
    expect(revisarTexto("Ya, B tiene razón.", { letras: 45 })).toContain("escribe A o B");
  });

  it("un número, en cifras o en palabras, o cuántos («todos», «nadie»): se bota", () => {
    expect(revisarTexto("Ahora somos 4.", { letras: 45 })).toContain("número");
    expect(revisarTexto("¡Treinta minutos!", { letras: 45 })).toContain("número");
    expect(revisarTexto("Y quedan tres más.", { letras: 45 })).toContain("número");
    expect(revisarTexto("Todos trabajando.", { letras: 45 })).toContain("dice cuántos");
    expect(revisarTexto("Aquí no hay nadie.", { letras: 45 })).toContain("dice cuántos");
  });

  it("un código de tarea o su alias: se bota", () => {
    expect(revisarTexto("¡La BET-250 quedó!", { letras: 45 })).toEqual(expect.arrayContaining(["código de tarea"]));
    expect(revisarTexto("Lo de T1, bacán.", { letras: 45 })).toContain("código de tarea");
  });

  it("un estado que no dijo la frase de hoy: se bota", () => {
    for (const t of ["Ojalá termine pronto.", "Ya terminé, por fin.", "Está en revisión.", "Le falló otra vez.", "Sigue en pausa, uf.", "¡Listo, cerré!", "Aquí, trabajando.", "Lleva rato esperando."]) {
      expect(revisarTexto(t, { letras: 45 }), t).toContain("dice un estado");
    }
  });

  it("las 3 reglas nuevas del spike: «voy a…», cuándo («la de ayer») y lo que no es de Chile", () => {
    expect(revisarTexto("Ah, sí, voy a ver.", { letras: 45 })).toContain("dice lo que alguien va a hacer");
    expect(revisarTexto("Sí, la de ayer.", { letras: 45 })).toContain("dice cuándo");
    expect(revisarTexto("Sí, la de antes. ¡A ver si responde!", { letras: 45 })).toContain("dice cuándo");
    expect(revisarTexto("Ojalá lo vean luego.", { letras: 45 })).toContain("dice cuándo");
    expect(revisarTexto("¡Qué quilombo!", { letras: 45 })).toContain("no es de Chile");
    expect(revisarTexto("Ah, sí, la voy a cheekear.", { letras: 45 })).toEqual(expect.arrayContaining(["dice lo que alguien va a hacer", "no es de Chile"]));
  });

  it("sin comillas, emojis, inglés ni groserías", () => {
    expect(revisarTexto("¡Bacán! 🎉", { letras: 45 })).toContain("signos, comillas o emojis");
    expect(revisarTexto("Dijo «listo».", { letras: 45 })).toContain("signos, comillas o emojis");
    expect(revisarTexto("Nice, qué bueno.", { letras: 45 })).toContain("inglés");
    expect(revisarTexto("¡Qué cagada!", { letras: 45 })).toContain("grosería");
  });

  it("una palabra que no existe, mal escrita o de otro idioma: se bota (0.8.1, JST-251)", () => {
    // El final que pasó en la QA de la 0.7.1 (JST-233) para «¿Cómo va lo de las revisiones? / Ahí vamos, de a poco.».
    expect(revisarTexto("Espero que se solven.", { letras: 45 })).toEqual(["palabra que no existe («solven»)"]);
    expect(revisarFinal(["Sí, un poco lento.", "Espero que se solven."], [{ texto: "¿Cómo va lo de las revisiones?" }, { texto: "Ahí vamos, de a poco." }])).toEqual(["palabra que no existe («solven»)"]);
    expect(revisarTexto("Ah, qué bueno. ¡Descanza!", { letras: 45 })).toContain("palabra que no existe («Descanza»)");
    expect(revisarTexto("¿Y el backlog? ¿Y el run?", { letras: 45 })).toContain("palabras que no existen («backlog», «run»)");
    expect(fraseIaParaVoz("Espero que se solven.")).toBe(false);
    // Lo mismo, bien escrito, pasa.
    expect(revisarTexto("Espero que se solucionen.", { letras: 45 })).toEqual([]);
  });

  it("las frases que escribió la IA en la QA de la 0.7.1 siguen pasando (menos la de «solven»)", () => {
    const finales = [
      "Bien, tranquilo acá. / Un poco más.", "Buenas tardes.", "Eso es bueno, ¿verdad? / Más tranquilo está que nosotros.", "Je, cómo va. / Aquí tranquilo.",
      "Pura tranquilidad, ¡qué bueno! / Me gustaría estar ahí.", "A veces siento que se detiene. / ¡Uf!", "Ya, pero el tema es... ¿y tú? / Nada nuevo por aquí.",
      "Sí, poco a poco va quedando.", "Sí, avanzando. / Completamente.", "Ah, ya veo... / Entiendo.", "Ojalá así siga.", "¡Qué alivio que no haya nada!",
      "De a poco, ¿eh? / Sí, lenta pero segura.", "Bacán, así es mejor. / Ojalá siga así.", "De a poco, avanzando poco a poco. / Un poco lento.",
      "Qué alivio, ¡sin problemas! / Eso ayuda mucho.", "Un poco complicado, ¿nada? / Sí, pero avanzando.", "Como siempre, avanzando. / No se puede esperar más.",
      "Parece que va lento. / Ojalá mejore pronto.", "Bueno, poco a poco. / Sí, va avanzando.", "De a poco, la integración va. / Como siempre.", "Sí, igual. / Mismo ritmo.",
      "¡Siempre de a poco! / Es la verdad.", "¿Qué más? / Nada especial.", "¡Uf! Qué tiempo. / Ojalá se solucione.", "¡Uf! ¡Qué largas! / Necesito un café urgente.",
      "Pues ahí va. / Siempre avanzando.", "¡Buena! ¿Qué es? / Una tarea sencilla.", "¡Qué cantidad! / Esperemos que sirvan.", "Mucho trabajo, ¿eh? / Paciencia, ya llegarán.",
      "Así es, nada nuevo.", "Sí, igual. / Otro día normal.",
    ];
    for (const f of finales) for (const t of f.split(" / ")) expect(revisarTexto(t, { letras: LETRAS_FINAL, px: MAX_FINAL_PX, nombres: NOMBRES }), t).toEqual([]);
    const sueltas = [
      "A descansar un rato.", "A seguir así.", "A veces me relajo.", "A veces pienso en salir.", "Anímate, a trabajar.", "El café ayuda mucho.", "Empieza a dar pereza.",
      "Este café da fuerzas.", "Este café me da vida.", "Este sofá es un sueño.", "Estirar las piernas, ya.", "Estirar los músculos.", "La cabeza necesita aire.",
      "La ventana da bien.", "Me estiro un poco.", "Me estiro un rato.", "Me quiero ir a casa.", "Necesito aire fresco.", "Necesito un descanso.", "Necesito un momento.",
      "Necesito un respiro.", "Otro sorbo, por favor.", "Pensamientos flotando.", "Pensando en el finde.", "Pensar en algo más.", "Pensar en otro lado.",
      "Regresar al código.", "Un café me ayudaría.", "Un café más, por favor.", "Un instante de paz.", "Un poco de aire fresco.", "Ver qué pasa ahora.",
      "Volvería a trabajar.", "¡A seguir avanzando!", "¡Qué buena jornada!",
    ];
    for (const t of sueltas) expect(revisarSuelta(t, NOMBRES), t).toEqual([]);
  });

  it("las palabras con tilde se reconocen enteras (el \\b de JavaScript no las ve)", () => {
    expect(revisarTexto("¡Ya cerré!", { letras: 45 })).toContain("dice un estado");
    expect(revisarTexto("Pasado mañana, café.", { letras: 45 })).toContain("dice cuándo");
    // «cerrado» o «hoyo» no son «cerré» ni «hoy».
    expect(revisarTexto("El hoyo del sofá.", { letras: 45 })).toEqual([]);
  });
});

describe("el largo: el de las frases de hoy", () => {
  it("el final: hasta 45 letras y lo que mide la frase más ancha de hoy", () => {
    expect(LETRAS_FINAL).toBe(45);
    expect(MAX_FINAL_PX).toBeGreaterThanOrEqual(anchoTexto("Las suficientes para que suene el ventilador."));
    expect(revisarTexto("a".repeat(46), { letras: 45 })[0]).toMatch(/^largo/);
    expect(revisarTexto("Mmm, qué rico es este café de la máquina nueva.", { letras: 45, px: MAX_FINAL_PX })[0]).toMatch(/^largo/);
    // Lo ancho también cuenta, aunque tenga pocas letras.
    expect(revisarTexto("M".repeat(45), { letras: 45, px: MAX_FINAL_PX })).toContain("largo (no cabe en el globo)");
  });

  it("las sueltas de la IA: hasta 24 letras (chocan con «2 esperándote» si son más largas)", () => {
    expect(LETRAS_SUELTA).toBe(24);
    expect(revisarSuelta("Este café me salva.")).toEqual([]);
    expect(revisarSuelta("Este descanso sí que necesito.")[0]).toMatch(/^largo/);
    // Una de siempre no se guarda como de la IA.
    expect(revisarSuelta("Pausa para el café.")).toContain("es una de siempre");
  });
});

describe("el final entero", () => {
  it("1 o 2 frases, sin pasar de 4 en total, sin repetir una fija ni repetirse", () => {
    expect(revisarFinal(["Uf, qué mal momento."], fijas)).toEqual([]);
    expect(revisarFinal([], fijas)).toContain("frases: no son 1 o 2");
    expect(revisarFinal(["Uf.", "Mal día.", "Ánimo."], [{ texto: "Hola." }])).toContain("frases: no son 1 o 2");
    expect(revisarFinal(["Uf.", "Mal día."], fijas)).toContain("frases: no son 1 o 2");
    expect(revisarFinal(["¿Qué le pasó?"], fijas)).toContain("repite una frase");
    expect(revisarFinal(["Uf, qué lata.", "uf, qué lata"], [{ texto: "Hola." }])).toContain("repite una frase");
  });

  it("ninguna frase de siempre (un modelo chico copia la de otra conversación)", () => {
    expect(revisarFinal(["Ahí vamos, de a poco."], [{ texto: "¿Cómo va el código?" }])).toEqual(["es una de siempre"]);
  });

  it("una frase mala bota el final entero (va la plantilla)", () => {
    expect(revisarFinal(["¡Qué paciencia!", "Ya casi la terminan."], [{ texto: "Esta espera a que termine otra." }]).length).toBeGreaterThan(0);
  });
});

describe("aperturas, bromas, mascotas y casi repeticiones (0.13.0)", () => {
  it("la apertura conserva exactamente los huecos y no admite datos fuera de ellos", () => {
    const plantilla = "A {agente} le falló el run.";
    expect(revisarApertura("¡Qué lata por {agente}!", plantilla)).toEqual([]);
    expect(revisarApertura("¡Qué lata!", plantilla)).toContain("huecos distintos de la plantilla");
    expect(revisarApertura("¡Qué lata por {agente} y {otro}!", plantilla)).toContain("huecos distintos de la plantilla");
    expect(revisarApertura("¡Qué lata por {agente} y Catalina!", plantilla)).toContain("un nombre");
    expect(revisarApertura("¡Son 4 con {agente}!", plantilla)).toContain("número");
    expect(revisarApertura(plantilla, plantilla)).toContain("es una de siempre");
    expect(revisarApertura("Dijo «listo» {agente}.", plantilla)).toContain("signos, comillas o emojis");
    expect(revisarApertura("Espero que {agente} se solven.", plantilla)).toContain("palabra que no existe («solven»)");
    expect(revisarApertura("¿Cómo va el {rol}?", "¿Cómo va {rol}?")).toContain("artículo de más antes de {rol}");
    expect(revisarApertura("¿Qué tal {rol}?", "¿Cómo va {rol}?")).toEqual([]);
    expect(revisarApertura("Ya lleva {n} con esta.", "{agente} lleva {n} con {tarea}.")).toContain("huecos distintos de la plantilla");
    expect(revisarApertura("{agente} trabaja en {tarea}. Ya lleva {n} días.", "{agente} lleva {n} con {tarea}.")).toContain("unidad de tiempo fuera de {n}");
    expect(revisarApertura("{agente} trabaja en {tarea}. Ya lleva {n}.", "{agente} lleva {n} con {tarea}.")).toEqual([]);
  });

  it("las bromas tienen dos frases y las mascotas no reutilizan el respaldo fijo ni suenan como otra especie", () => {
    expect(revisarBroma(["¿Café o té?", "Café, por favor."])).toEqual([]);
    expect(revisarBroma(["Solo una."])).toContain("una broma tiene 2 frases");
    expect(revisarBroma(["¿Quién rompió el build?", "Café, por favor."])).toContain("es una de siempre");
    expect(revisarMascota("gato", "Qué rico el sol.")).toEqual([]);
    expect(revisarMascota("gato", "¡Miau!")).toContain("es una de siempre");
    expect(revisarMascota("perro", "Somos 4.")).toContain("número");
    expect(revisarMascota("conejo", "Pío, qué rico el sol.")).toContain("sonido de otra mascota");
    expect(revisarMascota("gato", "Guau, a jugar!")).toEqual(expect.arrayContaining(["sonido de otra mascota", "signos de apertura"]));
  });

  it("los signos de cierre necesitan su apertura en cada frase", () => {
    for (const t of ["Necesito un momento!", "Caliente, para despertar!", "Guau, a jugar!"]) expect(revisarTexto(t, { letras: 45 }), t).toContain("signos de apertura");
    expect(revisarTexto("¡Necesito un momento! ¿Vienes?", { letras: 45 })).toEqual([]);
  });

  it("ninguna palabra queda pegada a un dato ni convierte el rol en una persona", () => {
    const empresa = "¿Cómo están en {empresa}?";
    expect(revisarApertura("¿Qué onda en {empresa} rara?", empresa)).toContain("palabra pegada a {empresa}");
    expect(revisarApertura("¿Cómo están en {empresa} rara?", empresa)).toContain("palabra pegada a {empresa}");
    expect(revisarApertura("¿Qué onda en {empresa}?", empresa)).toEqual([]);
    expect(revisarApertura("¿Cómo va {rol} definitiva?", "¿Cómo va {rol}?")).toContain("palabra pegada a {rol}");
    expect(revisarApertura("¿Cómo te encuentras, {rol}?", "¿Cómo va {rol}?")).toContain("{rol} usado como persona");
    expect(revisarApertura("Todavía queda {tarea} pendiente.", "Acabo de terminar {tarea}.")).toEqual([]);
  });

  it("una pregunta de cantidad sin referente no sirve de final", () => {
    const fijas = [{ texto: "Ingeniero Backend lleva 3 horas con esta." }];
    expect(revisarFinal(["¿Cuánto?"], fijas)).toContain("pregunta sin contexto");
    expect(revisarFinal(["¿Cuánto falta?"], fijas)).toEqual([]);
  });

  it("detecta igualdad normalizada y coincidencia de palabras muy alta", () => {
    expect(casiIgual("¡Qué lata por el café!", "qué lata por el café")).toBe(true);
    expect(casiIgual("Este café me salva.", "Este café me salva, sí.")).toBe(true);
    expect(casiIgual("Este café me salva.", "El sofá está muy rico.")).toBe(false);
  });
});

describe("nombres y datos al comenzar una frase (0.14.3)", () => {
  it("un nombre inventado se bota también al inicio de cualquier frase", () => {
    expect(revisarFinal(["Marta ayudó mucho."], fijas)).toContain("un nombre");
    expect(revisarTexto("Ah, sí. Marta ayudó mucho.", { letras: 45 })).toContain("un nombre");
    const plantilla = "{agente} lleva {n} con {tarea}.";
    expect(revisarApertura("Marta dice que {agente} lleva {n} con {tarea}.", plantilla)).toContain("un nombre");
    expect(revisarApertura("Luna sabe que {agente} lleva {n} con {tarea}.", plantilla)).toContain("un nombre");
  });

  it("los inicios comunes siguen pasando", () => {
    expect(revisarTexto("Espero que se solucionen.", { letras: 45 })).toEqual([]);
    expect(revisarTexto("Ah, sí. ¡Qué bueno!", { letras: 45 })).toEqual([]);
  });

  it("mil, cien, docena y millón también son números", () => {
    for (const t of ["Casi mil veces.", "Casi cien veces.", "Casi una docena.", "Casi un millón."]) {
      expect(revisarTexto(t, { letras: 45 }), t).toContain("número");
    }
  });

  it("noche dice cuándo y ya no puede dice un estado", () => {
    expect(revisarApertura("De noche {agente} lleva {n} con {tarea}.", "{agente} lleva {n} con {tarea}.")).toContain("dice cuándo");
    expect(revisarTexto("Ya no puede seguir.", { letras: 45 })).toContain("dice un estado");
  });
});

describe("el worker acepta para la voz lo que escribió la IA si pasa la misma revisión", () => {
  it("sin nombres, números ni códigos, solo letras y signos y hasta 50 letras", () => {
    expect(fraseIaParaVoz("¡Qué paciencia, eh!")).toBe(true);
    expect(fraseIaParaVoz("Ahora somos 4.")).toBe(false);
    expect(fraseIaParaVoz("¡Bien ahí, Catalina!")).toBe(false);
    expect(fraseIaParaVoz("Lo de BET-12.")).toBe(false);
    expect(fraseIaParaVoz("a".repeat(51))).toBe(false);
    expect(fraseIaParaVoz("hola\u0007")).toBe(false);
  });
});
