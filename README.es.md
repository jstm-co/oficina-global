# Oficina global

[English](README.md) · **Español**

Plugin para [Paperclip](https://github.com/paperclipai/paperclip) que dibuja a los agentes de **todas las empresas** de tu instancia en una oficina pixel: quién trabaja, quién te necesita, quién tiene un error, quién está en pausa y quién está libre. Puedes responder sus preguntas sin salir de la oficina, recibir avisos con voz y dejarla en un TV.

- Clave del plugin: `jstm.oficina-pixel` · paquete npm: `paperclip-plugin-oficina-global` · versión `0.9.7`
- Probado con Paperclip `2026.824.1`.

## Qué hace

- **Un piso con una sala por empresa.** Cada agente tiene su escritorio y su personaje. Trabajando teclea con el código de su tarea en un globo; si te necesita, levanta la mano y hace fila frente a tu escritorio; con error se pone rojo; en pausa duerme; libre va a la sala de descanso.
- **Se mueve.** Los agentes caminan entre su escritorio y el descanso. Una tarea que pasa de un agente a otro viaja en un sobre o se entrega en la mesa. Los libres conversan sobre lo que de verdad pasa en la oficina, y hay mascotas en el pasillo que responden al clic.
- **Responder sin salir.** Las preguntas, confirmaciones, tareas sugeridas y aprobaciones que te dejan los agentes («Te toca») se responden en una ventana de la oficina, con tu sesión. La oficina solo escribe cuando tú envías una respuesta.
- **Avisos y voces** (apagados hasta que los actives). Cuando un agente empieza a necesitarte suena una campanita y su voz dice qué necesita («te necesito», «tengo un error», «terminé», «empecé»), con una voz distinta por agente.
- **Elegir las voces** (0.11.0). En «Voces», «Quién habla» define la voz del **Resumen**, la de **«Leer contexto»** (lee una tarea en voz alta) y, en su propia página, la de **cada agente**, con un ▶ para oír cada una antes. Las dos que leen al momento solo aceptan voces que responden en pocos segundos (Lorenzo, Catalina, Alex, Dora, Santa) o la del navegador; los 4 clones solo se pueden elegir para los agentes. Cambiar la voz de un agente graba sus frases en segundo plano y cambia cuando están todas, así que nunca queda mudo en el intertanto.
- **Rótulo de la sala.** Bajo cada sala, un rótulo cuenta de qué se trata cada tarea, una a la vez.
- **Resumen.** El botón «Resumen» te lee en voz alta qué se hizo, qué te toca, en qué se trabaja y qué está en cola.
- **Leer contexto.** En la barra de arriba de cada tarea, un botón lee en voz alta de qué se trata y qué te preguntan.
- **Vista 3D** (0.12.0). En el computador, el botón «Vista 3D» te deja caminar por la misma oficina en primera persona, desde tu escritorio: con el mouse miras y con W A S D caminas. Cada sala tiene sus paredes, sus puertas al pasillo y su techo con lámparas; los monitores se leen de cerca, una flecha te lleva a quien te necesita y un clic en alguien abre su ficha, como en la 2D. Sobre los agentes se ven sus conversaciones y entregas, y la luz sigue la hora de quien mira: el cielo por las ventanas, el sol que entra hasta el piso y, de noche, la oficina más apagada.
- **Modo TV.** Pantalla completa en 1920×1080, y un enlace para abrirla en un TV con sesión.
- **Celular.** El piso entero y, al tocar una sala, esa sala acercada.

Se ve en el menú lateral («Oficina global»), en su página, en un widget del Dashboard y en la barra de arriba (en el celular; en las tareas, también en el computador).

## Requisitos

- Paperclip con plugins (probado con `paperclipai` **2026.824.1**; el SDK está fijado a esa versión).
- Para instalar desde npm: npm en la máquina donde corre Paperclip, que lo usa para bajar el paquete.
- Para instalar desde el código: Node 22 y npm.
- Opcional, para las voces grabadas: `uv`, `ffmpeg` e internet (ver [Voces](#voces)). Sin ellas, la oficina usa la voz del navegador.
- Opcional, para que la IA de Chrome escriba parte de las conversaciones y del resumen: Chrome de escritorio con Gemini Nano (ver [IA de Chrome](#ia-de-chrome)).

## Instalación

Una vez, antes de instalar: el CLI necesita un usuario dueño de la instancia (instalar pide acceso de board).

```sh
npx paperclipai@2026.824.1 auth login --instance-admin --api-base http://<tu-servidor>:3100
```

Si lo corres desde la sesión de un agente de Paperclip, quita sus variables (`env -u PAPERCLIP_API_KEY -u PAPERCLIP_RUN_ID npx paperclipai …`): instalar necesita tu sesión, no la del agente.

### Desde npm

```sh
npx paperclipai plugin install paperclip-plugin-oficina-global --api-base http://<tu-servidor>:3100
```

Paperclip lo baja a `~/.paperclip/plugins/node_modules/paperclip-plugin-oficina-global` en la máquina donde corre.

### Desde el código

Paperclip carga el plugin desde una carpeta local y sirve la interfaz desde su `dist/ui/`. Conviene instalarlo desde una copia aparte de la que usas para modificarlo.

```sh
git clone https://github.com/jstm-co/oficina-global.git
cd oficina-global
npm ci
npm run build
npx paperclipai plugin install "$PWD" --local --api-base http://<tu-servidor>:3100
```

### Actualizar

Si la instalaste desde npm, `upgrade` baja la última versión publicada:

```sh
npx paperclipai plugin upgrade jstm.oficina-pixel --api-base http://<tu-servidor>:3100
```

Si la instalaste desde el código:

```sh
git pull && npm ci && npm run build
npx paperclipai plugin upgrade jstm.oficina-pixel --api-base http://<tu-servidor>:3100
```

### Desinstalar

```sh
npx paperclipai plugin disable jstm.oficina-pixel     # la oculta sin desinstalar
npx paperclipai plugin uninstall jstm.oficina-pixel   # la quita; no guarda datos en Paperclip
```

El plugin pide solo capacidades de interfaz (`ui.page.register`, `ui.sidebar.register`, `ui.dashboardWidget.register` y `ui.action.register`). Todo lo lee la interfaz con la sesión del usuario, como el Inbox de Paperclip.

## Voces

Las voces son opcionales. Los audios se generan **una vez, en tu computador**, y la página solo los reproduce. Sin audios, habla la voz del navegador.

El generador se corre en la carpeta del plugin: la del clon si la instalaste desde el código, o `~/.paperclip/plugins/node_modules/paperclip-plugin-oficina-global` si la instalaste desde npm.

```sh
npm run voces -- --api http://<tu-servidor>:3100              # lee los agentes con la sesión del CLI (~/.paperclip/auth.json), solo GET
npm run voces -- --api http://<tu-servidor>:3100 --solo-plan  # sin generar: qué voz le toca a cada uno y cuántas frases faltan
```

| Voz | Motor | Licencia |
|---|---|---|
| Lorenzo y Catalina (chilenos) | Edge TTS de Microsoft (`edge-tts`) | Servicio gratuito no oficial: **a Microsoft le llega el texto de cada frase** (nombres de agentes y de tareas) |
| Alex, Dora y Santa | Kokoro-82M (`kokoro-onnx`) | Apache 2.0 |
| 2 clones chilenos | Chatterbox Multilingual (`chatterbox-tts`) | MIT |
| 2 clones chilenos | Qwen3-TTS 0.6B (`qwen-tts`) | Apache 2.0 |

- Necesita `uv` (cada motor corre con `uv run --with <paquete>`), `ffmpeg` e internet para Edge y para bajar los modelos la primera vez. Corre un motor a la vez; los clones usan ~4–5 GB de memoria y tardan más.
- Los audios quedan en `dist/ui/voces/` con su `indice.json`. Al llegar un agente nuevo, vuelve a correr el generador: hace solo lo que falta.
- Si la instalaste desde npm, cada actualización reemplaza la carpeta del plugin y se lleva los audios: vuelve a correr el generador después de `upgrade`.
- Desde la 0.5.0, el worker del plugin también arma en el momento las frases que dicen el nombre de la tarea (en `dist/ui/voces/vivo/`, se borran a los 7 días). Para eso `uv` y `ffmpeg` tienen que estar en el `PATH` con que arranca Paperclip.
- Los audios se sirven junto a la interfaz del plugin, sin pedir sesión: dicen el nombre de cada agente y de su empresa. Tenlo en cuenta si tu Paperclip está abierto a internet.

## IA de Chrome

En Chrome de escritorio, Gemini Nano (gratis y local) puede escribir el final de las conversaciones del descanso y partes del Resumen. Se elige en el menú «Conversaciones». Una revisión bota lo que cambie el sentido o traiga palabras que no existen; si no hay IA, van las frases de siempre.

La IA de Chrome solo existe en páginas seguras: si abres Paperclip con `http://`, agrega su dirección en `chrome://flags/#unsafely-treat-insecure-origin-as-secure` y relanza Chrome.

## Adaptarla a tu instancia

Para esto hay que instalarla desde el código.

- `src/instancia.ts`: el personaje fijo de algunos agentes (por ID) y cómo se pronuncian nombres propios en las voces. En esta copia va vacío: cada agente recibe un personaje según su nombre, cargo y rol.
- `src/plano.ts`: cuántas columnas tiene cada sala y qué empresas tienen color propio, por prefijo. Viene ajustado para las salas de nuestra instancia (prefijos `BET`, `ELM`, `JST` y `MIG`); las demás se dibujan con las medidas por omisión y en gris.

## Desarrollo

```sh
npm ci
npm test            # pruebas (vitest)
npm run typecheck
npm run build       # dist/: worker, manifiesto, interfaz, tv.html y el generador de voces
```

El código está en `src/` (la lógica, sin React ni DOM, separada de `src/ui/`), las pruebas en `tests/` y el generador de voces en `generador/`. Los comentarios están en español y nombran tareas de nuestro tablero interno («JST-123»), que no son públicas.

## Límites conocidos

- Las rutas de la API de Paperclip que lee no son parte del SDK (están juntas en `src/fuentes.ts`): pueden cambiar con una versión nueva de Paperclip.
- El aviso del sistema operativo necesita `https://`; con `http://` avisa Paperclip dentro de la página.
- El sonido y las voces empiezan con tu primer clic en la pestaña después de abrirla.
- En iPhone no hay pantalla completa para una página: el modo TV explica cómo agregarla a la pantalla de inicio. No se probó en Safari ni en un iPhone real.
- La vista 3D necesita WebGL 2 y es solo para el computador (no en el celular ni en el modo TV).
- Edge TTS es un servicio no oficial: si Microsoft lo cambia, las voces de Lorenzo y Catalina dejan de generarse hasta actualizar `edge-tts`.

## Contribuir y versiones

Los pull requests son bienvenidos: ver [CONTRIBUTING.es.md](CONTRIBUTING.es.md). Cada pull request corre las pruebas, los tipos y el build en GitHub Actions. Cuando un mantenedor fusiona uno que sube la versión de `package.json`, GitHub Actions publica esa versión en npm por su cuenta, con [procedencia](https://docs.npmjs.com/generating-provenance-statements) (provenance), y crea su Release en GitHub. Nadie publica desde su computador.

## Licencia y atribuciones

El código es de JSTM, con licencia [MIT](LICENSE). Los sprites y el sonido del aviso son propios (los arman los scripts de `src/ui/assets/fuente/`).

Hay dos excepciones, con licencia **CC BY-SA 4.0**:

- `generador/referencias/ref_hombre_cl.wav` y `ref_mujer_cl.wav`: frases del set **Google Crowdsourced Chilean Spanish** (OpenSLR 71, en Hugging Face `ylacombe/google-chilean-spanish`), © Google. Los clones de voz salen de ellas.
- `src/ia/palabrasFiltro.ts`: un filtro con las palabras en español más frecuentes de los subtítulos de OpenSubtitles 2018, de [FrequencyWords](https://github.com/hermitdave/FrequencyWords) (Hermit Dave).

Ver [AVISOS.md](AVISOS.md). Este proyecto no está afiliado a Paperclip.
