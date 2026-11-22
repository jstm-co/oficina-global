// Los datos de la instancia (`src/datosInstancia.ts`) leídos de su archivo, del lado de Node: el worker al arrancar
// y `npm run voces`. Se leen una vez; para aplicar un cambio se reinicia el plugin. Nada de esto lanza.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { carpetaDatos } from "./almacenVoces.js";
import { ARCHIVO_INSTANCIA, INSTANCIA_VACIA, leerDatosInstancia, ponerInstancia, type DatosInstancia } from "./datosInstancia.js";

/** Dónde está `instancia.json`: la carpeta de datos del usuario, la misma de las voces. */
export function rutaInstancia(datos = carpetaDatos()): string {
  return join(datos, ARCHIVO_INSTANCIA);
}

export interface InstanciaCargada {
  datos: DatosInstancia;
  ruta: string;
  /** Por qué no se pudo leer (el archivo existe pero no se entiende). Sin archivo no hay error: la instancia queda vacía. */
  error?: string;
}

/** Lee el archivo, lo valida y lo deja puesto en el registro. Sin archivo o con el JSON malo, deja los datos vacíos. */
export function cargarInstanciaDeArchivo(ruta = rutaInstancia()): InstanciaCargada {
  try {
    if (!existsSync(ruta)) {
      ponerInstancia(INSTANCIA_VACIA);
      return { datos: INSTANCIA_VACIA, ruta };
    }
    const datos = leerDatosInstancia(JSON.parse(readFileSync(ruta, "utf8")));
    ponerInstancia(datos);
    return { datos, ruta };
  } catch (e) {
    ponerInstancia(INSTANCIA_VACIA);
    return { datos: INSTANCIA_VACIA, ruta, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Deja `<carpetaUi>/instancia.json` para la interfaz, con solo lo que ella usa (el aspecto y los nombres cortos: la
 * pronunciación es del generador de voces). Escribe siempre, aunque esté vacío, para que la interfaz no reciba un 404.
 * Devuelve si pudo.
 */
export function publicarInstancia(carpetaUi: string, datos: DatosInstancia): boolean {
  const destino = join(carpetaUi, ARCHIVO_INSTANCIA);
  const temporal = `${destino}.${process.pid}.tmp`;
  try {
    mkdirSync(carpetaUi, { recursive: true });
    writeFileSync(temporal, JSON.stringify({ aspectoFijo: datos.aspectoFijo, nombresCortos: datos.nombresCortos }));
    renameSync(temporal, destino);
    return true;
  } catch {
    try {
      rmSync(temporal, { force: true });
    } catch {
      // Nada más que hacer.
    }
    return false;
  }
}
