// Catálogo en inglés: «texto en español del código → traducción». Va en partes
// por zona de la interfaz. Para sumar un idioma: copiar esta carpeta, traducir
// los valores y registrarlo en `LOCALES` y `CATALOGS` de `src/i18n.ts`.
import { core } from "./core.js";
import { ficha } from "./ficha.js";
import { pagina } from "./pagina.js";
import { piso } from "./piso.js";
import { resumen } from "./resumen.js";
import { ventana } from "./ventana.js";
import { vista3d } from "./vista3d.js";
import { voces } from "./voces.js";

/** Las partes, por separado: la prueba del catálogo revisa que no se contradigan. */
export const EN_PARTS: Readonly<Record<string, Readonly<Record<string, string>>>> = { core, pagina, piso, vista3d, ficha, ventana, voces, resumen };

export const en: Readonly<Record<string, string>> = Object.assign({}, ...Object.values(EN_PARTS));
