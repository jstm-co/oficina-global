import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import { carpetaAlmacen } from "./almacenVoces.js";
import { PreparadorVoces } from "./vozViva.js";

// La oficina lee todo desde la UI, con la sesión del usuario: el worker no lee
// ni escribe nada en Paperclip.
//
// 0.5.0 (JST-167, opción B del spike de JST-161): el worker prepara las frases
// de las voces que dicen de qué se trata («terminé. Diseño de Oficina global
// 0.5.0.»), cuando una Oficina con ese interruptor prendido se lo pide. Corre
// los motores de las voces (uv, Python, los modelos y ffmpeg) en la Mac y deja
// los audios en su carpeta (`dist/ui/voces/vivo/`). `ctx.actions` no pide
// capacidades. La 0.9.0 (JST-246) le suma el Resumen en voz alta (`voz-resumen`) y la 0.11.0 (JST-325),
// elegir las voces (`voz-elegir`).
//
// 0.13.0 (issue #9): «Preparar voces» desde la oficina (`voz-al-dia`), con Supertonic, que corre con
// Node. Los audios viven en la carpeta de datos del usuario (`carpetaAlmacen`) y se publican en
// `dist/ui/voces/`: una actualización desde npm ya no se los lleva.
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let voces: PreparadorVoces | null = null;

const plugin = definePlugin({
  async setup(ctx) {
    voces = new PreparadorVoces({ raiz: RAIZ, almacen: carpetaAlmacen(RAIZ), log: (mensaje, datos) => ctx.logger.info(mensaje, datos) });
    // «prepara estas frases»: responde al tiro (el RPC corta a los 30 s) y las hace en segundo plano.
    ctx.actions.register("voz-preparar", async (params) => {
      const pedidos = Array.isArray(params.pedidos) ? params.pedidos : [];
      return voces!.preparar(pedidos);
    });
    // «empecé» con la tarea (JST-194): la prepara delante y responde cuando está, o a los `ms` (≤ 25 s).
    ctx.actions.register("voz-esperar", async (params) => ({ estado: await voces!.esperar(params.pedido, Number(params.ms) || 0) }));
    // 0.6.0 (JST-226): lo que se lee de la oficina; responde cuando están, cuando alguna no se puede o a los `ms` (≤ 25 s).
    ctx.actions.register("voz-oficina", async (params) => {
      const pedidos = Array.isArray(params.pedidos) ? params.pedidos : [];
      return { estados: await voces!.esperarOficina(pedidos, Number(params.ms) || 0) };
    });
    // Si en esta Mac se puede (hay `uv` y `ffmpeg`): el panel «Voces» lo muestra.
    // 0.11.0 (JST-325): además, lo elegido y lo que se está grabando al cambiar una voz.
    ctx.actions.register("voz-estado", async () => voces!.estadoElegir());
    // 0.7.0 (JST-232): si la IA de Chrome de la página puede escribir ahora (la Mac no está cargada ni hay un clon generando).
    // 0.8.1 (JST-249): con `ms`, si hay un clon generando espera a que termine (≤ 15 s) antes de decir que no.
    ctx.actions.register("ia-permiso", async (params) => voces!.esperarPermisoIa(Number(params?.ms) || 0));
    // 0.9.0 (JST-246): el Resumen con la voz del Chief of staff; responde cuando está la primera frase, cuando no se puede o a los `ms` (≤ 20 s).
    ctx.actions.register("voz-resumen", async (params) => ({ estados: await voces!.esperarResumen(params, Number(params.ms) || 0) }));
    // 0.11.0 (JST-325): elegir la voz del Resumen, la de «Leer contexto» o la de un agente; volver a como estaba; abrir el motor de una voz antes de leer.
    ctx.actions.register("voz-elegir", async (params) => voces!.elegir(params));
    ctx.actions.register("voz-reiniciar", async () => voces!.reiniciar());
    ctx.actions.register("voz-calentar", async (params) => ({ ok: voces!.calentar(params.voz) }));
    // 0.13.0 (issue #9): «Preparar voces» (con `empezar` y los motores) y, desde ahí, los agentes que ve la página:
    // responde al tiro y graba lo que falta en segundo plano (el avance va en `voz-estado`).
    ctx.actions.register("voz-al-dia", async (params) => voces!.alDia(params));
    // Lo que quedó grabándose cuando se apagó el worker sigue, y los «3 agentes te necesitan» van con la voz del Resumen.
    voces.reanudar();
  },
  async onHealth() {
    return { status: "ok", message: "Oficina global activa" };
  },
  async onShutdown() {
    voces?.cerrar();
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
