// De ejemplo: sin agentes ni nombres propios. Lo de cada instancia (el aspecto fijo de sus
// agentes por ID, su nombre corto cuando la regla lo deja raro y cómo se pronuncian sus
// nombres) va en una copia de este archivo llamada `instancia.local.ts`, en la raíz del
// repo: git la ignora y `npm run build` la usa en lugar de este (esbuild.config.mjs).

/**
 * Aspecto fijo de cada agente, por ID: gana a la regla de `aspectoDe`.
 * Por ejemplo: `"<id del agente>": "direccion-1"` (las filas de `personajes.png`).
 */
export const ASPECTO_FIJO: Readonly<Record<string, string>> = {};

/**
 * Nombre corto de los agentes que la regla de `nombreCorto` deja raros (por
 * nombre, como están en Paperclip). Se suma a `CORTOS` de avisos.ts.
 * Por ejemplo: `"Ingeniera de Datos y Reportes": "Datos"`.
 */
export const CORTOS_INSTANCIA: Readonly<Record<string, string>> = {};

/**
 * Lo que Kokoro (espeak-ng) dice mal de los nombres de esta instancia: se le
 * escribe como se dice. Solo en Kokoro (generador/pronunciar.ts).
 * Por ejemplo: `[/\bNombre\b/g, "Cómo se dice"]`.
 */
export const PRONUNCIAR_KOKORO_INSTANCIA: ReadonlyArray<readonly [RegExp, string]> = [];
