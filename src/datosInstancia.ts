// Lo propio de cada instancia: el aspecto fijo de sus agentes por ID, su nombre corto cuando la regla lo deja
// raro y cómo se pronuncian sus nombres. No va en el código: se lee AL ARRANCAR de `instancia.json`, en la carpeta
// de datos del usuario (`src/instanciaArchivo.ts`, en el worker y en `npm run voces`) y, en el navegador, de
// `<ui>/instancia.json`, que el worker publica (`src/ui/instanciaUi.ts`). Así el paquete que compila GitHub sirve
// tal cual y nadie compila en su computador.
//
// Este módulo es solo el registro en memoria y la validación: sin Node ni navegador. Cada bundle (worker, página,
// TV, generador) tiene su propia copia del registro; arranca vacío y se llena al cargar el archivo.
//
// Formato de `instancia.json` (todas las claves son opcionales):
//   {
//     "aspectoFijo": { "<id del agente>": "direccion-1" },
//     "nombresCortos": { "Nombre largo del agente": "Corto" },
//     "pronunciarKokoro": [["\\bNombre\\b", "Cómo se dice"]]
//   }

export interface DatosInstancia {
  /** Aspecto fijo de cada agente, por ID: gana a la regla de `aspectoDe` (las filas de `personajes.png`, como «direccion-1»). */
  aspectoFijo: Readonly<Record<string, string>>;
  /** Nombre corto de los agentes que la regla de `nombreCorto` deja raros (por nombre, como están en Paperclip). Gana a `CORTOS` de avisos.ts. */
  nombresCortos: Readonly<Record<string, string>>;
  /** Lo que Kokoro (espeak-ng) dice mal de los nombres de esta instancia: se le escribe como se dice (`generador/pronunciar.ts`). */
  pronunciarKokoro: ReadonlyArray<readonly [RegExp, string]>;
}

/** El nombre del archivo, en la carpeta de datos del usuario y en la de la interfaz publicada. */
export const ARCHIVO_INSTANCIA = "instancia.json";

export const INSTANCIA_VACIA: DatosInstancia = Object.freeze({ aspectoFijo: Object.freeze({}), nombresCortos: Object.freeze({}), pronunciarKokoro: Object.freeze([]) as ReadonlyArray<readonly [RegExp, string]> });

function tablaDeTextos(valor: unknown): Record<string, string> {
  // Sin prototipo: una clave como «constructor» o «toString» no encuentra nada heredado.
  const r: Record<string, string> = Object.create(null);
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return r;
  for (const [k, v] of Object.entries(valor)) if (typeof v === "string") r[k] = v;
  return r;
}

/**
 * Lo que dice el archivo, ya validado. Tolerante: nunca lanza; lo que no sea del tipo esperado se descarta
 * (un valor que no es texto, un par mal formado, una expresión regular inválida, un JSON que no es un objeto).
 * Que un aspecto exista en la hoja de sprites lo revisa `aspectoDe` (aspecto.ts), que es quien sabe las filas.
 */
export function leerDatosInstancia(json: unknown): DatosInstancia {
  if (!json || typeof json !== "object" || Array.isArray(json)) return INSTANCIA_VACIA;
  const o = json as Record<string, unknown>;
  const pronunciarKokoro: Array<readonly [RegExp, string]> = [];
  if (Array.isArray(o.pronunciarKokoro)) {
    for (const par of o.pronunciarKokoro) {
      if (!Array.isArray(par) || par.length !== 2 || typeof par[0] !== "string" || typeof par[1] !== "string" || par[0] === "") continue;
      try {
        pronunciarKokoro.push([new RegExp(par[0], "g"), par[1]]);
      } catch {
        // Expresión inválida: se descarta.
      }
    }
  }
  return { aspectoFijo: tablaDeTextos(o.aspectoFijo), nombresCortos: tablaDeTextos(o.nombresCortos), pronunciarKokoro };
}

let actual: DatosInstancia = INSTANCIA_VACIA;

/** Deja estos datos como los de la instancia (vacíos si no hay archivo). */
export function ponerInstancia(datos: DatosInstancia): void {
  actual = datos;
}

/** Los datos de la instancia, al momento de usarlos: no se guardan en constantes de módulo. */
export function instancia(): DatosInstancia {
  return actual;
}
