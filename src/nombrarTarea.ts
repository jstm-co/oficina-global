// Cómo se nombra una tarea dentro de una frase que se oye (JST-415), sin React ni navegador. Los globos dicen
// «Acabo de terminar esta.» y el código con el título van en otra línea; en voz, el título entra en la frase:
// «Acabo de terminar el re-QA de la Oficina.», no «Acabo de terminar esta: Re-QA de la Oficina.».
//
// Regla: el título limpio de `tareaParaVoz`, con artículo solo cuando se sabe (el primer sustantivo está en la lista o
// termina en -ción, -dad…) y, si no, «lo de …». Sin título, «esta tarea». Una frase con tarea que no tiene «esta» no
// lleva el título (nunca se pega al final).
import { tareaParaVoz, TOPES_OFICINA, type Topes } from "./paraVoz.js";

/** El «esta» o «esa» suelto de un globo con tarea (no «está», no «estas»). */
const DEMOSTRATIVO = /(?<![\p{L}\p{N}])(esta|esa)(?![\p{L}\p{N}])/iu;

const lista = (txt: string) => txt.split(/\s+/).filter(Boolean);
const EL = new Set(lista("diseño informe reporte arreglo cambio plan análisis estudio spike bug error fix hotfix test build deploy release plugin widget panel menú botón modo sistema módulo componente flujo proceso backlog documento manual readme script servicio agente run resumen proyecto qa re-qa pedido ticket issue sprint rediseño refactor problema tema mapa día lanzamiento seguimiento reemplazo ajuste borrador esquema catálogo calendario código texto aviso paquete archivo informe tablero estado soporte"));
const LA = new Set(lista("revisión mejora prueba auditoría investigación tarea página pantalla vista ficha lista guía ventana oficina empresa función sala voz api oficina carpeta migración configuración instalación actualización versión documentación limpieza corrección implementación optimización propuesta integración reunión conversación extensión traducción exportación importación notificación sincronización validación automatización preparación publicación planificación organización base herramienta nota plantilla cola barra mesa fila"));
const LOS = new Set(lista("diseños cambios tests errores bugs informes reportes textos avisos ajustes arreglos agentes módulos paquetes archivos"));
const LAS = new Set(lista("pruebas mejoras pantallas correcciones tareas notificaciones versiones fichas listas guías páginas vistas salas voces"));

/** Un sustantivo que se sabe por cómo termina. */
function porTerminacion(p: string): "la" | "las" | null {
  if (/(ción|sión|dad|tad|tud|umbre)$/.test(p)) return "la";
  if (/(ciones|siones|dades|tades)$/.test(p)) return "las";
  return null;
}

/** Un título que ya empieza con artículo se dice tal cual («una tarea rara»), sin «lo de» delante. */
const ARTICULOS = new Set(lista("un una unos unas el la los las"));

const bajaInicial = (t: string) => (t ? t.charAt(0).toLowerCase() + t.slice(1) : t);
const subeInicial = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

/**
 * La tarea dicha como parte de una frase: «el re-QA de la Oficina global», «la revisión de la página», «lo de instalar
 * la versión». `""` si no hay nada que decir (sin título, o de él no queda nada).
 */
export function sintagmaDeTarea(titulo: string | null | undefined, topes: Topes = TOPES_OFICINA): string {
  const t = tareaParaVoz(titulo, topes);
  if (!t) return "";
  const primera = t.split(/\s+/)[0]!;
  // «Oficina: …» o «Hermes, …»: lo que va antes del signo es un rótulo, no un sustantivo con artículo.
  if (/[:,;]$/.test(primera)) return `lo de ${t}`;
  const palabra = primera.toLowerCase().replace(/[^\p{L}-]/gu, "");
  // JST-415: «Una tarea rara» → «una tarea rara»; no «lo de Una tarea rara».
  if (ARTICULOS.has(palabra)) return bajaInicial(t);
  // Un infinitivo («Instalar la versión») va con «lo de».
  if (/^[a-záéíóúñü]{3,}(?:ar|er|ir)$/.test(palabra) && !EL.has(palabra) && !LA.has(palabra)) return `lo de ${bajaInicial(t)}`;
  const art = LOS.has(palabra) ? "los" : LAS.has(palabra) ? "las" : LA.has(palabra) ? "la" : EL.has(palabra) ? "el" : porTerminacion(palabra);
  if (!art) return `lo de ${t}`;
  // Una sigla («QA», «UI») no se baja a minúscula; «Re-QA» sí, porque es una palabra con prefijo.
  const sigla = /^\p{Lu}{2,}$/u.test(primera);
  return `${art} ${sigla ? t : bajaInicial(t)}`;
}

/**
 * La frase de un globo con tarea, lista para decirla: el primer «esta» o «esa» pasa a nombrar la tarea. `sinTitulo`: la
 * frase lleva tarea pero su título no se conoce («esta» pasa a «esta tarea»). Sin `esta`, la frase queda igual.
 */
export function nombrarTarea(texto: string, titulo: string | null | undefined, sinTitulo = false): string {
  const m = DEMOSTRATIVO.exec(texto);
  if (!m) return texto;
  const sint = sintagmaDeTarea(titulo);
  if (!sint && !(sinTitulo || (titulo ?? "").trim())) return texto;
  const dem = m[0];
  let antes = texto.slice(0, m.index);
  const despues = texto.slice(m.index + dem.length);
  // Sin título: «esta tarea», «esa tarea».
  if (!sint) return `${antes}${dem} tarea${despues}`;
  // Las frases pueden traer «de esta» o «a esta» (la IA las reescribe así): con «el» se contrae abajo.
  let dicha = /^\p{Lu}/u.test(dem) ? subeInicial(sint) : sint;
  // JST-415: «de» y «a» delante de «el» se contraen: «Me olvidé del plan», «Volví al plan» (nunca «de el», «a el»).
  const contraer = /^el\s/i.test(dicha) ? /(^|[^\p{L}\p{N}])(de|a)(\s+)$/iu.exec(antes) : null;
  if (contraer) {
    const prep = contraer[2]!;
    const unida = prep.toLowerCase() === "de" ? "del" : "al";
    antes = `${antes.slice(0, contraer.index + contraer[1]!.length)}${prep.charAt(0) === prep.charAt(0).toUpperCase() ? subeInicial(unida) : unida}${contraer[3]}`;
    dicha = dicha.slice(3);
  }
  return `${antes}${dicha}${despues}`;
}
