import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import { PAGE_ROUTE, PLUGIN_KEY } from "./shared.js";

// La UI lee todo con la sesión del usuario (API nativa y canal en vivo de cada
// empresa, ver JST-66), así que el plugin no pide capacidades de datos: solo
// registra el menú, la página, el widget del Dashboard y el botón del modo TV.
//
// Desde la 0.2.0 (JST-97) ya no es solo de lectura: responde tarjetas y
// aprobaciones a nombre del usuario, con su sesión y solo cuando toca enviar
// en la ventana para responder (un POST por respuesta, JST-94). Nunca responde
// sola ni cambia tareas o agentes. No pide capacidades nuevas.
//
// La 0.3.0 (JST-100, «Vida en la oficina») tampoco: el sobre usa eventos que
// ya llegan por el canal en vivo y las conversaciones leen `/issues` con la
// sesión del usuario, como el resto de la oficina.
//
// La 0.3.1 (JST-124) tampoco: las 9 voces son audios que se generan una vez en
// la Mac (`npm run voces`) y quedan en `dist/ui/voces/`; la página solo los lee
// de la carpeta del plugin, sin modelos ni llamadas a internet.
//
// La 0.3.2 (JST-135) tampoco: solo deja de contar los bloqueos como «te necesita».
//
// La 0.3.3 (JST-137) tampoco: solo cambia cuándo caminan los personajes.
//
// La 0.3.4 (JST-138/139) tampoco: el rótulo de cada sala dice de qué se trata
// cada tarea con los nombres que la página ya lee, sin lecturas nuevas.
//
// La 0.3.5 (JST-148) tampoco: solo cambia cuándo se pide y se espera el audio
// de un resumen de las voces.
//
// La 0.3.6 (JST-150) tampoco: solo cambia el generador de las voces, que corre
// en la Mac.
//
// La 0.3.7 (arreglos del QA de JST-140) tampoco: solo cambia cómo se ve el
// rótulo de cada sala.
//
// La 0.3.8 (JST-158) tampoco: solo cambia el rótulo al volver a la pestaña.
//
// La 0.4.0 (JST-162/164) tampoco: las conversaciones del descanso hablan de lo
// que la Oficina ya lee (con las mismas lecturas de temas, guardadas 10 min) y
// las mascotas responden al clic; un botón «Conversaciones» las oculta.
//
// La 0.5.0 (JST-163/167) tampoco: la hora estimada lee los últimos 30 runs de
// cada agente con la sesión del usuario (1 vez por agente al cargar), y la voz
// que dice de qué se trata usa `ctx.actions`, que no pide capacidades. Lo nuevo
// es que el worker corre en la Mac los motores de las voces (uv, Python, los
// modelos y ffmpeg) y escribe audios en su carpeta (`dist/ui/voces/vivo/`).
//
// La 0.6.0 (JST-225/226) tampoco: lo que se lee de la oficina usa otra acción
// del worker (`voz-oficina`), que no pide capacidades, y los mismos motores.
//
// La 0.7.0 (JST-231/232) tampoco: la IA de Chrome (Gemini Nano) corre en el
// navegador del usuario, y el worker solo responde si la Mac está libre
// (`ia-permiso`, otra acción). Lo único nuevo es el flag de Chrome para la
// dirección de Paperclip (README, «Instalación»).
//
// La 0.8.0 (JST-241) tampoco: solo cambia lo que dicen las voces.
//
// La 0.9.0 (JST-245/246) tampoco: el Resumen lee lo terminado y las abiertas
// de cada empresa con la sesión del usuario (solo al abrir su menú y al apretar
// «Leer»), y su voz usa otra acción del worker (`voz-resumen`).
//
// La 0.9.6 (JST-276) tampoco: «Leer contexto» pasa de la fila bajo el título
// (`toolbarButton`) a la barra de arriba, que ya dibujaba `OficinaTvBoton`.
//
// La 0.11.0 (JST-325) tampoco: elegir las voces usa acciones del worker
// (`voz-elegir`, `voz-reiniciar`, `voz-calentar`) y deja lo elegido en
// `voces/eleccion.json`, junto a los audios.
//
// La 0.12.0 tampoco: la vista 3D muestra lo que la página ya lee, y su visor
// (three.js) va en su propio archivo, `dist/ui/oficina3d.js`, que la página
// carga solo al abrirla.
const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_KEY,
  apiVersion: 1,
  version: "0.12.0",
  displayName: "Oficina global",
  description: "Oficina pixel con los agentes de todas las empresas: quién trabaja, quién te necesita (hace fila frente a tu escritorio), con error, en pausa o libre. Responde tarjetas sin salir, con avisos y 9 voces. Caminan, se entregan las tareas en la mesa, conversan en el descanso (en Chrome, la IA de Chrome escribe cómo terminan) y las mascotas responden al clic. Un rótulo dice de qué se trata cada tarea. «Resumen» te lee lo que se hizo, lo que te toca, en qué trabajan y lo que está en cola.",
  author: "JSTM",
  categories: ["ui"],
  capabilities: ["ui.page.register", "ui.sidebar.register", "ui.dashboardWidget.register", "ui.action.register"],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  ui: {
    slots: [
      {
        type: "page",
        id: "oficina-global-page",
        displayName: "Oficina global",
        exportName: "OficinaGlobalPage",
        routePath: PAGE_ROUTE,
      },
      {
        type: "sidebar",
        id: "oficina-global-sidebar",
        displayName: "Oficina global",
        exportName: "OficinaGlobalSidebarLink",
      },
      {
        type: "dashboardWidget",
        id: "oficina-global-widget",
        displayName: "Oficina global",
        exportName: "OficinaGlobalWidget",
      },
      {
        type: "globalToolbarButton",
        id: "oficina-global-tv",
        displayName: "Modo TV",
        exportName: "OficinaTvBoton",
      },
    ],
  },
};

export default manifest;
