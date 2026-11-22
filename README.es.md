# Oficina global

[English](README.md) · **Español**

Plugin para [Paperclip](https://github.com/paperclipai/paperclip) que dibuja a los agentes de **todas las empresas** de tu instancia en una oficina pixel: quién trabaja, quién te necesita, quién tiene un error, quién está en pausa y quién está libre. Puedes responder sus preguntas sin salir de la oficina, recibir avisos con voz y dejarla en un TV.

**La interfaz está en español e inglés.** Sigue el idioma de tu navegador y al pie de la página hay un selector para cambiarlo. Las voces, el Resumen hablado y las conversaciones de los agentes están en español (con voces de nueve países).

- Clave del plugin: `jstm.oficina-pixel` · paquete npm: `paperclip-plugin-oficina-global` · versión `0.9.7`
- Probado con Paperclip `2026.824.1`.

## Qué hace

- **Un piso con una sala por empresa.** Cada agente tiene su escritorio y su personaje. Trabajando teclea con el código de su tarea en un globo; si te necesita, levanta la mano y hace fila frente a tu escritorio; con error se pone rojo; en pausa duerme; libre va a la sala de descanso.
- **Todo en una pantalla.** En el computador el piso entero cabe bajo la cabecera, desde un notebook hasta un monitor 4K: la oficina elige la escala más grande que cabe y acomoda las salas a la forma de la pantalla. Una franja arriba muestra quién te necesita, cada uno con su botón «Responder». Un error de hace más de un día, o uno que silencias desde la ficha del agente, deja de contar en el contador rojo y baja a «Errores antiguos» en la lista.
- **Se mueve.** Los agentes caminan entre su escritorio y el descanso. Una tarea que pasa de un agente a otro viaja en un sobre o se entrega en la mesa. Los libres conversan sobre lo que de verdad pasa en la oficina, nombrando la tarea de la que hablan, y las mascotas del pasillo responden al clic y a lo que pasa (una tarea terminada, un error, alguien que espera hace rato).
- **Responder sin salir.** Las preguntas, confirmaciones, tareas sugeridas y aprobaciones que te dejan los agentes («Te toca») se responden en una ventana de la oficina, con tu sesión. La oficina solo escribe cuando tú envías una respuesta.
- **Abrir una tarea sin salir.** «Abrir tarea» en la ficha de un agente abre la tarea en una ventana de la oficina: su descripción, sus comentarios con una caja para escribir el tuyo y su estado, que puedes cambiar ahí. Ctrl o ⌘ + clic, o «Página completa», van a la página de la tarea. Abrirla la marca como leída, igual que abrir su página.
- **Avisos y voces** (apagados hasta que los actives). Cuando un agente empieza a necesitarte suena una campanita y su voz dice qué necesita («te necesito», «tengo un error», «terminé», «empecé»), con una voz distinta por agente. También dice «te lo dejo para revisar» cuando una tarea pasa a revisión, cuánto tardó la tarea si la vio empezar, un solo recordatorio agrupado de quienes te esperan (a los 30 minutos, a las 2 horas y a las 6 horas; nunca por esperas más viejas) y, cuando vuelves, lo que pasó mientras no estabas. «Cuánto habla», en el menú «Ambiente», define el nivel: «Tranquilo», «Normal» o «Conversador».
- **Elegir las voces** (0.11.0). En «Voces», «Quién habla» define la voz del **Resumen**, la de **«Leer contexto»** (lee una tarea en voz alta) y, en su propia página, la de **cada agente**, con un ▶ para oír cada una antes. Las dos que leen al momento solo aceptan voces que responden en pocos segundos (Lorenzo, Catalina, Alex, Dora, Santa) o la del navegador; los 4 clones solo se pueden elegir para los agentes. Cambiar la voz de un agente graba sus frases en segundo plano y cambia cuando están todas, así que nunca queda mudo en el intertanto.
- **Rótulo de la sala.** Bajo cada sala, un rótulo cuenta de qué se trata cada tarea, una a la vez.
- **Decorados.** En «Ambiente» → «Decorado» eliges «Clásico» o «Madera» para toda la oficina, «Repartidos» para que cada empresa tenga el suyo, o un decorado para cada sala. La luz sigue tu hora (de día entra por las ventanas; de noche la oficina se apaga un poco y se encienden sus lámparas) y en sus fechas aparecen adornos. Las dos cosas se apagan en el mismo menú.
- **Resumen.** El botón «Resumen» te lee en voz alta qué se hizo, qué te toca, en qué se trabaja y qué está en cola.
- **Leer contexto.** Un botón «Leer contexto», en la barra de arriba de cada tarea, en cada tarjeta de la franja de quienes te necesitan, en la ventana de responder y en la ventana de tarea, lee en voz alta un informe para decidir: quién te espera y desde cuándo, la pregunta con sus opciones, lo que te explica el agente, qué depende de tu respuesta y dónde va el asunto. El informe queda escrito en pantalla con la frase que va marcada: un clic en una frase salta a ella, y eliges «Corto» o «Completo».
- **Vista 3D** (0.12.0). En el computador, el botón «Vista 3D» te deja caminar por la misma oficina en primera persona, desde tu escritorio: con el mouse miras y con W A S D caminas. Cada sala tiene sus paredes, sus puertas al pasillo y su techo con lámparas; los monitores se leen de cerca, una flecha te lleva a quien te necesita y un clic en alguien abre su ficha, como en la 2D. Sobre los agentes se ven sus conversaciones y entregas, y la luz sigue la hora de quien mira: el cielo por las ventanas, el sol que entra hasta el piso y, de noche, la oficina más apagada.
- **Modo TV.** Pantalla completa en 1920×1080, y un enlace para abrirla en un TV con sesión.
- **Celular.** El piso entero y, al tocar una sala, esa sala acercada.

Se ve en el menú lateral («Oficina global»), en su página, en un widget del Dashboard y en la barra de arriba (en el celular; en las tareas, también en el computador).

## Requisitos

- Paperclip con plugins (probado con `paperclipai` **2026.824.1**; el SDK está fijado a esa versión).
- Para instalar desde npm: npm en la máquina donde corre Paperclip, que lo usa para bajar el paquete.
- Para instalar desde el código: Node 22 y npm.
- Voces grabadas: Supertonic viene con el plugin (baja su modelo una vez); los otros motores necesitan `uv`, `ffmpeg` e internet (ver [Voces](#voces)). Sin audios, la oficina usa la voz del navegador.
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

Las voces son opcionales. Los audios se graban **una vez, en el computador donde corre Paperclip**, y la página solo los reproduce. Lo que no tiene audio lo dice la voz del navegador.

En la oficina, abre el panel «Voces», elige los motores y aprieta **Preparar voces**. El panel muestra cómo va: primero baja lo que falte (una vez) y después graba las frases de los agentes que ves. Desde ahí las voces quedan **al día**: cuando llega un agente nuevo o le cambias el nombre, la página se lo cuenta al plugin y se graban solas, sin correr ningún comando.

| Voz | Motor | Qué cuesta | Licencia |
|---|---|---|---|
| 10 voces (5 de mujer y 5 de hombre) | Supertonic 3 (int8, con `sherpa-onnx-node`) | Viene con el plugin: baja 145 MB una vez y usa ~0,5 GB de memoria al grabar. Mac, Linux y Windows | OpenRAIL-M (el modelo); Apache 2.0 (`sherpa-onnx`) |
| Lorenzo y Catalina (chilenos) | Edge TTS de Microsoft (`edge-tts`) | `uv`, `ffmpeg` e internet. Servicio gratuito no oficial: **a Microsoft le llega el texto de cada frase** (nombres de agentes y de tareas) | LGPL-3.0 (la biblioteca) |
| 16 voces más de Edge en español de otros países, una mujer y un hombre de cada uno: Dalia y Jorge (México), Elvira y Álvaro (España), Elena y Tomás (Argentina), Salomé y Gonzalo (Colombia), Camila y Alex (Perú, «Alex (Perú)» en el panel), Paloma y Alonso (Estados Unidos), Paola y Sebastián (Venezuela), Valentina y Mateo (Uruguay) | Edge TTS de Microsoft (`es-MX-DaliaNeural`, `es-ES-AlvaroNeural`, …) | Igual que Lorenzo y Catalina: **a Microsoft le llega el texto**. Son solo por elección (no se reparten solas entre los agentes); su ▶ de muestra se graba al momento | LGPL-3.0 (la biblioteca) |
| Alex, Dora y Santa | Kokoro-82M (`kokoro-onnx`) | `uv` y `ffmpeg`; baja 354 MB una vez | Apache 2.0 |
| 2 clones chilenos | Chatterbox Multilingual (`chatterbox-tts`) | `uv` y `ffmpeg`; 4 a 5 GB de memoria y ~10 min por agente | MIT |
| 2 clones chilenos | Qwen3-TTS 0.6B (`qwen-tts`) | Igual que Chatterbox | Apache 2.0 |

- Solo se usan los motores que elijas. Edge (Lorenzo, Catalina y las voces de otros países) no se usa si no lo eliges: así ningún texto sale a Microsoft.
- Supertonic no necesita `uv` ni `ffmpeg`. Los demás corren con `uv run --with <paquete>` y necesitan `uv` y `ffmpeg` en el `PATH` con que arranca Paperclip; el panel dice cuál no se puede usar y por qué.
- Los modelos quedan en `~/.cache/oficina-voces/` y se revisan con su SHA-256 al bajarlos.
- Los audios quedan **fuera del plugin**, así que una actualización no los borra: en `~/Library/Application Support/oficina-global/voces/` en la Mac, `~/.local/share/oficina-global/voces/` en Linux y `%LOCALAPPDATA%\oficina-global\voces\` en Windows, en una carpeta por instalación del plugin. Al arrancar, el plugin los copia (o enlaza) a `dist/ui/voces/` para servirlos. La primera vez adopta los que ya estaban ahí.
- Supertonic graba WAV (unos 7 veces más pesados que un MP3, ~230 KB por frase de 5 s); los demás, MP3.
- El worker también arma en el momento las frases que dicen el nombre de la tarea (en `vivo/`, se borran a los 7 días), con el motor de la voz de cada agente.
- Los audios se sirven junto a la interfaz del plugin, sin pedir sesión: dicen el nombre de cada agente y de su empresa. Tenlo en cuenta si tu Paperclip está abierto a internet.

También se pueden grabar desde la terminal, en la carpeta del plugin (la del clon, o `~/.paperclip/plugins/node_modules/paperclip-plugin-oficina-global` si la instalaste desde npm). Usa los motores elegidos en el panel, o los de `--motores`:

```sh
npm run voces -- --api http://<tu-servidor>:3100                        # lee los agentes con la sesión del CLI (~/.paperclip/auth.json), solo GET
npm run voces -- --api http://<tu-servidor>:3100 --motores supertonic    # supertonic, kokoro, edge, qwen3 o chatterbox, separados por comas
npm run voces -- --api http://<tu-servidor>:3100 --solo-plan            # sin grabar: qué voz le toca a cada uno y cuántas frases faltan
```

## IA de Chrome

En Chrome de escritorio, Gemini Nano (gratis y local) puede escribir el final de las conversaciones del descanso y partes del Resumen. Se elige en el menú «Conversaciones». Una revisión bota lo que cambie el sentido o traiga palabras que no existen; si no hay IA, van las frases de siempre.

La IA de Chrome solo existe en páginas seguras: si abres Paperclip con `http://`, agrega su dirección en `chrome://flags/#unsafely-treat-insecure-origin-as-secure` y relanza Chrome.

Fuera de Chrome, el plugin usa el `LanguageModel` que tenga la página, si hay uno (la misma API), y los menús lo llaman «IA del computador». Por ejemplo, [Paperclip Dispatch](https://github.com/Javiervinus/paperclip-dispatch), la app de Mac para Paperclip, lo atiende con Apple Intelligence.

## Adaptarla a tu instancia

- **El personaje fijo de tus agentes, sus nombres cortos y cómo se pronuncian** van en un archivo `instancia.json` en la carpeta de datos del plugin, junto a las voces: `~/Library/Application Support/oficina-global/` en macOS, `%LOCALAPPDATA%\oficina-global\` en Windows y `~/.local/share/oficina-global/` en Linux. El plugin lo lee al arrancar, así que reinicia el plugin después de editarlo. No hay que compilar nada, y una actualización desde npm no lo pierde. Todas las claves son opcionales:

  ```json
  {
    "aspectoFijo": { "<id del agente>": "direccion-1" },
    "nombresCortos": { "Ingeniera de Datos y Reportes": "Datos" },
    "pronunciarKokoro": [["\\bNombre\\b", "Cómo se dice"]]
  }
  ```

  - `aspectoFijo`: el personaje de un agente, por su ID. El valor es una fila de [personajes.png](src/ui/assets/personajes.png), como `direccion-1` o `qa-2`; una que no existe se ignora.
  - `nombresCortos`: el nombre corto de un agente, por su nombre como está escrito en Paperclip, cuando el automático queda raro.
  - `pronunciarKokoro`: pares de expresión regular y reemplazo, para los nombres que el motor de voz Kokoro dice mal.

  Sin el archivo, cada agente recibe un personaje según su nombre, cargo y rol.
- `src/plano.ts` (para esto sí hay que instalarla desde el código): cuántas columnas tiene cada sala y qué empresas tienen color propio, por prefijo. Viene ajustado para las salas de nuestra instancia (prefijos `BET`, `ELM`, `JST` y `MIG`); las demás se dibujan con las medidas por omisión y en gris.

## Desarrollo

```sh
npm ci
npm test            # pruebas (vitest)
npm run typecheck
npm run build       # dist/: worker, manifiesto, interfaz, tv.html y el generador de voces
```

El código está en `src/` (la lógica, sin React ni DOM, separada de `src/ui/`), las pruebas en `tests/` y el generador de voces en `generador/`. Los comentarios están en español y nombran tareas del tablero de los mantenedores («JST-123»), que no es público.

**Idiomas.** El texto en español del código es el origen: `t("Sin asignar")` devuelve ese texto en español y su traducción en los demás idiomas (`src/i18n.ts`). El inglés está en `src/i18n/en/`, por zonas. Un texto nuevo de la pantalla pasa por `t()` (o `tx()` con nodos de React dentro, `plural()` para cantidades) y lleva su entrada en el catálogo; `tests/i18n.spec.ts` falla si falta o sobra alguna. Para sumar un idioma, copia `src/i18n/en/`, traduce los valores y regístralo en `LOCALES` y `CATALOGS`. Lo que se oye (las voces, el Resumen hablado, «Leer contexto») y lo que conversan los agentes queda en español y no pasa por `t()`.

## Límites conocidos

- Las rutas de la API de Paperclip que lee no son parte del SDK (están juntas en `src/fuentes.ts`): pueden cambiar con una versión nueva de Paperclip.
- El aviso del sistema operativo necesita `https://`; con `http://` avisa Paperclip dentro de la página.
- El sonido y las voces empiezan con tu primer clic en la pestaña después de abrirla.
- En iPhone no hay pantalla completa para una página: el modo TV explica cómo agregarla a la pantalla de inicio. No se probó en Safari ni en un iPhone real.
- La vista 3D necesita WebGL 2 y es solo para el computador (no en el celular ni en el modo TV).
- Edge TTS es un servicio no oficial: si Microsoft lo cambia, las voces de Edge (Lorenzo, Catalina y las de otros países) dejan de generarse hasta actualizar `edge-tts`.

## Contribuir y versiones

Los pull requests son bienvenidos: ver [CONTRIBUTING.es.md](CONTRIBUTING.es.md). Cada pull request corre las pruebas, los tipos y el build en GitHub Actions. Cuando un mantenedor fusiona cambios del paquete, GitHub Actions calcula una versión por fecha en UTC (`AAAA.MDD.N`), la publica en npm con [procedencia](https://docs.npmjs.com/generating-provenance-statements) (provenance) y crea su Release en GitHub. Nadie sube una versión a mano ni publica desde su computador.

## Licencia y atribuciones

El código es de JSTM, con licencia [MIT](LICENSE). Los sprites y el sonido del aviso son propios (los arman los scripts de `src/ui/assets/fuente/`).

Hay dos excepciones, con licencia **CC BY-SA 4.0**:

- `generador/referencias/ref_hombre_cl.wav` y `ref_mujer_cl.wav`: frases del set **Google Crowdsourced Chilean Spanish** (OpenSLR 71, en Hugging Face `ylacombe/google-chilean-spanish`), © Google. Los clones de voz salen de ellas.
- `src/ia/palabrasFiltro.ts`: un filtro con las palabras en español más frecuentes de los subtítulos de OpenSubtitles 2018, de [FrequencyWords](https://github.com/hermitdave/FrequencyWords) (Hermit Dave).

Ver [AVISOS.md](AVISOS.md). Este proyecto no está afiliado a Paperclip.
