// Cuánto habla la oficina (JST-415), sin React ni navegador. Un solo ajuste, `nivel`, que mandan las
// voces de los avisos (esta mitad) y, después, las conversaciones y las mascotas (la otra): cada nivel
// dice qué frases suenan, si caben los extras (recordatorio, «mientras no estabas», rachas e hitos) y un
// factor de frecuencia. Los interruptores finos siguen mandando: suena si el nivel Y la casilla lo permiten.

export type Nivel = "tranquilo" | "normal" | "conversador";
export const NIVELES: readonly Nivel[] = ["tranquilo", "normal", "conversador"];
export const NIVEL_POR_OMISION: Nivel = "normal";

/** Lo guardado, tolerante: cualquier otra cosa vuelve a «normal». */
export function leerNivel(v: unknown): Nivel {
  return NIVELES.includes(v as Nivel) ? (v as Nivel) : NIVEL_POR_OMISION;
}

/**
 * Por cuánto se multiplica el tiempo entre una cosa y la siguiente: tranquilo 2 (la mitad de seguido),
 * normal 1, conversador 0,5 (el doble de seguido). Las conversaciones y las mascotas lo usan después.
 */
export const FACTOR_FRECUENCIA: Readonly<Record<Nivel, number>> = { tranquilo: 2, normal: 1, conversador: 0.5 };

export function factorFrecuencia(n: Nivel): number {
  return FACTOR_FRECUENCIA[n];
}

/** Los extras (recordatorio, «mientras no estabas», rachas e hitos; y «quedé bloqueado»): solo en normal y conversador. */
export function permiteExtras(n: Nivel): boolean {
  return n !== "tranquilo";
}

/**
 * Las frases que suenan en «tranquilo»: te necesito, tengo un error, terminé o te lo dejo para revisar. «Quedé bloqueado»
 * es un extra (los agentes dejan tareas bloqueadas a propósito) y «empecé» tampoco suena.
 */
export type FraseDeAviso = "toca" | "error" | "fin" | "rev" | "bloq" | "emp";
const EN_TRANQUILO: ReadonlySet<string> = new Set(["toca", "error", "fin", "rev"]);

/** El nivel deja decir esa frase («empecé» no suena en «tranquilo»). */
export function permiteFrase(n: Nivel, f: FraseDeAviso): boolean {
  return n !== "tranquilo" || EN_TRANQUILO.has(f);
}

/** Cada cuántos minutos se repite el recordatorio de espera, o `null` si nunca: tranquilo nunca, normal 60, conversador 20. */
export const MINUTOS_RECORDATORIO: Readonly<Record<Nivel, number | null>> = { tranquilo: null, normal: 60, conversador: 20 };

export function intervaloRecordatorioMs(n: Nivel): number | null {
  const m = MINUTOS_RECORDATORIO[n];
  return m == null ? null : m * 60_000;
}

/** Un intervalo `[mín, máx]` (ms) escalado por el nivel: tranquilo el doble de largo, conversador la mitad (JST-415). */
export function escalarIntervalo(rango: readonly [number, number], n: Nivel): readonly [number, number] {
  const f = factorFrecuencia(n);
  return [rango[0] * f, rango[1] * f];
}

/**
 * Cada cuánto como mucho reacciona una mascota a lo que pasa cerca (JST-415): tranquilo nunca, normal cada 2 minutos y
 * conversador cada minuto (o `null`: nunca).
 */
export const MS_REACCION_MASCOTA: Readonly<Record<Nivel, number | null>> = { tranquilo: null, normal: 120_000, conversador: 60_000 };

export function intervaloReaccionMascotaMs(n: Nivel): number | null {
  return MS_REACCION_MASCOTA[n];
}
