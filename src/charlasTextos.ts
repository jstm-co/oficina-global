// Los textos fijos de la oficina que conversa (JST-415), sin lógica: las bromas, las frases sueltas (generales y según el
// estado de quien las dice) y lo que dicen las mascotas, al tocarlas y al reaccionar a lo que pasa cerca. Es español de Chile,
// corto y sin datos: lo que lleva un dato (una tarea, un nombre, un número) está en las variantes de `charlas.ts`. Estos
// textos se OYEN y se ven en el globo: van en español, sin `t()`.

/** Quién dice cada frase de una broma: «S» abre, «O» responde; siempre por turnos. */
type Rol = "S" | "O";

/** 24 bromas de 2 a 4 frases (JST-415: eran 12). Ninguna se burla de alguien: las bromas son de la pega, no de las personas. */
export const BROMAS: ReadonlyArray<ReadonlyArray<readonly [Rol, string]>> = [
  [["S", "¿Quién rompió el build?"], ["O", "Yo no, estaba en el descanso."]],
  [["S", "Funciona en mi máquina."], ["O", "Entonces mandemos tu máquina a producción."]],
  [["S", "¿Probaste apagarlo y prenderlo?"], ["O", "Tres veces."], ["S", "¿Y?"], ["O", "Ahora no prende."]],
  [["S", "¿Otra reunión?"], ["O", "Pudo haber sido un correo."]],
  [["S", "No es un bug."], ["O", "¿Ah, no?"], ["S", "Es una funcionalidad sorpresa."]],
  [["S", "¿Quién escribió este código?"], ["O", "Yo, hace un mes."], ["S", "¿Y qué hace?"], ["O", "Ya no me acuerdo."]],
  [["S", "Actualicé las dependencias."], ["O", "¿Y?"], ["S", "Ahora no compila nada."]],
  [["S", "¿Deploy el viernes?"], ["O", "Ni en broma."]],
  [["S", "Me falta un café para funcionar."], ["O", "A mí me faltan dos."]],
  [["S", "¿Comentaste el código?"], ["O", "// algún día"]],
  [["S", "¿Cuántas pestañas tienes abiertas?"], ["O", "Las suficientes para que suene el ventilador."]],
  [["S", "Este café está más cargado que el servidor."], ["O", "Por eso todos teclean tan rápido."]],
  [["S", "Hice un cambio chiquitito."], ["O", "Esas son las frases que dan miedo."]],
  [["S", "¿Hiciste el respaldo?"], ["O", "Estaba por hacerlo."], ["S", "Esa frase me preocupa."]],
  [["S", "El código no tiene errores."], ["O", "¿Lo corriste?"], ["S", "Ese es otro tema."]],
  [["S", "Dejé un TODO en el código."], ["O", "Tranquilo, ya es parte del paisaje."]],
  [["S", "¿Probaste en producción?"], ["O", "Es el único lugar con datos reales."], ["S", "Qué valiente."]],
  [["S", "Se cayó el wifi."], ["O", "¿Reiniciaste el router?"], ["S", "Reinicié hasta mis ganas."]],
  [["S", "¿Cómo se llama esta variable?"], ["O", "x."], ["S", "¿Y esta otra?"], ["O", "x2."]],
  [["S", "Prometo escribir pruebas mañana."], ["O", "Dijiste lo mismo ayer."]],
  [["S", "Me salió un conflicto de merge."], ["O", "Uno solo, qué suerte."], ["S", "Del tamaño de la oficina."]],
  [["S", "¿Y si lo dejamos así?"], ["O", "Eso no es una estrategia."]],
  [["S", "Alguien borró mi commit."], ["O", "Era el que rompía todo."]],
  [["S", "¿Qué estás leyendo?"], ["O", "Stack Overflow."], ["S", "Ah, lo de siempre."]],
];

/** Lo que piensa alguien solo en el descanso, sin relación con su estado (§1.6). */
export const SUELTAS_GENERALES: readonly string[] = [
  "☕",
  "Pausa para el café.",
  "Mmm…",
  "¿Y ahora qué?",
  "A ver qué sale.",
  "Cinco minutos más…",
  "♪ ♫",
  "Un estirón y sigo.",
  "Qué silencio tan rico.",
  "Me quedo mirando la ventana.",
];

/** Según cómo está quien las dice (JST-415). */
export type EstadoSuelta = "libre" | "recien" | "espera" | "cola";

/**
 * `libre`: lleva un buen rato sin tarea. `recien`: terminó algo hace poco. `espera`: hay quien espera a la persona hace
 * rato. `cola`: tiene algo en su cola.
 */
export const SUELTAS_POR_ESTADO: Readonly<Record<EstadoSuelta, readonly string[]>> = {
  libre: ["Llevo un buen rato sin tarea.", "Ya conozco cada rincón del descanso.", "Qué ganas de que llegue algo.", "Me estoy durmiendo en el sofá."],
  recien: ["Se siente rico terminar una.", "Cerrar una da paz.", "Misión cumplida, por ahora.", "Una menos. Qué alivio."],
  espera: ["Ojalá contesten pronto.", "Hay gente esperando una respuesta.", "Alguien debería mirar las pendientes.", "Se nota que hay pendientes."],
  cola: ["Estoy atento a mi turno.", "Tengo tarea esperando.", "Me queda pega, qué bueno.", "Descanso corto y vuelvo a lo mío."],
};

/** Las que llevan una tarea en la línea de abajo (§1.6): del que terminó algo y del que tiene algo en cola. */
export const SUELTAS_CON_DATO_RECIEN: readonly string[] = ["Esta ya está. Me gané el café.", "Terminé esta. Qué bien se siente.", "Cerré esta. Respiro un rato."];
export const SUELTAS_CON_DATO_COLA: readonly string[] = ["Después viene esta.", "Me toca esta apenas me llamen.", "Voy con esta cuando me llamen."];
export const SUELTAS_CON_DATO: readonly string[] = [...SUELTAS_CON_DATO_RECIEN, ...SUELTAS_CON_DATO_COLA];

/** Todas las frases sueltas sin tarea. */
export const SUELTAS: readonly string[] = [...SUELTAS_GENERALES, ...Object.values(SUELTAS_POR_ESTADO).flat()];

// --- Mascotas (§3)
export type IdMascota = "gato" | "perro" | "conejo" | "robot";

/** Lo que dice cada una al tocarla: 8 frases, elegidas sin repetir la anterior. */
export const DICEN: Readonly<Record<IdMascota, readonly string[]>> = {
  gato: ["¡Miau!", "Mrrr…", "¡Miau! ♥", "Prrr, prrr.", "Miau, qué sueño.", "Miau… ¿hay atún?", "Mrrr, qué rico el sol.", "Miau, miau."],
  perro: ["¡Guau!", "¡Guau, guau!", "♥", "¡Guau! ¿Salimos?", "Guau, guau, guau.", "¿Me tiras la pelota?", "Guau, qué buen día.", "¡Guau! ♥"],
  conejo: ["♥", "♥ ♥", "*snif, snif*", "*snif* ¿hay zanahoria?", "Boing, boing.", "Qué rica la zanahoria.", "*snif, snif* ♥", "Mmm, zanahoria."],
  robot: ["Bip bup", "Bip bip bup", "Limpiando…", "Bup, todo en orden.", "Bip. Piso limpio.", "Escaneando…", "Bip bup, voy por la esquina.", "Bip. Batería suficiente."],
};

/** Lo que pasa cerca y una mascota comenta (JST-415): alguien termina, un error, alguien espera hace rato, una entrega. */
export type Reaccion = "termina" | "error" | "espera" | "entrega";

/** Quién reacciona a cada cosa: el perro celebra, el robot avisa del error, el gato nota a quien espera, el conejo ve la entrega. */
export const MASCOTA_DE_REACCION: Readonly<Record<Reaccion, IdMascota>> = { termina: "perro", error: "robot", espera: "gato", entrega: "conejo" };

export const REACCIONES: Readonly<Record<IdMascota, readonly string[]>> = {
  perro: ["¡Guau! ¡Terminaron una!", "¡Guau, guau! Una menos.", "¡Guau! Eso se celebra."],
  robot: ["Bip bup. Error detectado.", "Alerta: algo falló. Bip.", "Bup. Aviso rojo.", "Bip bip. Hay un error."],
  gato: ["Miau. Alguien espera respuesta.", "Mrrr… te están esperando.", "Miau. Hay alguien esperando."],
  conejo: ["*snif* ¡Pasó una tarea!", "♥ Entrega a la vista.", "*snif, snif* Llegó un sobre."],
};

/** ¿Es una frase de esa mascota (al tocarla o al reaccionar)? «de otra»: es de otra mascota; «ninguna»: no es de ninguna. */
export function fraseDeMascota(id: IdMascota, texto: string): "propia" | "de otra" | "ninguna" {
  if (DICEN[id].includes(texto) || REACCIONES[id].includes(texto)) return "propia";
  for (const otra of Object.keys(DICEN) as IdMascota[]) if (otra !== id && (DICEN[otra].includes(texto) || REACCIONES[otra].includes(texto))) return "de otra";
  return "ninguna";
}
