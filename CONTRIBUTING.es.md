# Contribuir a la Oficina global

*[Read in English](CONTRIBUTING.md)*

Gracias por ayudar. Los issues y pull requests pueden ir en español o en inglés.

## Cómo entra un cambio

1. Haz un fork del repositorio y una rama desde `develop`.
2. Haz tu cambio y corre, con Node 22.14 o más nuevo:

   ```sh
   npm ci
   npm test
   npm run typecheck
   npm run build
   ```

3. Abre un pull request contra `develop`. No subas `package.json.version`: las versiones se calculan solas. GitHub Actions corre las pruebas, los tipos y el build, e informa si fusionar publicará una versión. La primera vez que contribuyes, un mantenedor tiene que autorizar que corran.
4. Un mantenedor lo revisa. Nada llega a `develop` ni a `main` sin pull request, y solo los mantenedores fusionan. `main` solo recibe releases: un pull request desde `develop`.

## Versiones

Los builds locales usan `AAAA.MDD.0-dev+<sha7>` en UTC, con `.dirty` si hay cambios sin commit. El pie muestra esa versión y el commit corto.

Fusionar cambios del paquete en `main` es publicar: el workflow [Publish to npm](.github/workflows/publish.yml) calcula `AAAA.MDD.N` en UTC, donde N es la cantidad de versiones ya publicadas ese día. Pone esa versión solo dentro del runner, arma y prueba el paquete, lo publica con procedencia (trusted publishing de npm, sin tokens) y crea el Release `vAAAA.MDD.N` en GitHub. Los cambios solo de textos, pruebas o CI no publican nada.

## Para saber

- Los mantenedores trabajan en este mismo repositorio, en ramas `jst-123`; sus commits empiezan con el código de una tarea de su propio tablero (`JST-123: …`), que no es público. Los comentarios del código están en español y también nombran esas tareas.
- La lógica de `src/` va sin React ni DOM y tiene pruebas en `tests/`; la interfaz está en `src/ui/`.
- Los datos de una instancia real nunca van en el repositorio. Cada instancia guarda el personaje fijo de sus agentes, sus nombres cortos y cómo se pronuncian en su propio `instancia.json`, fuera del repositorio; el plugin lo lee al arrancar ([README](README.es.md#adaptarla-a-tu-instancia)).
- Nunca subas tokens, correos, direcciones de servidores ni títulos de tareas de una instancia real de Paperclip.

## Mantenedores

Los mantenedores trabajan aquí desde un equipo que corre una instancia real de Paperclip, así que las herramientas cuidan que nada de esa instancia se publique. Hacen falta Python 3.12 o más nuevo y el CLI de GitHub (`gh`).

- **Una rama por tarea.** Crea `jst-123` desde `origin/develop` y commitea ahí. Firma los commits con tu dirección noreply de GitHub (`git config user.email`): el correo del autor queda público.
- **Súbela** con `python3 -I subir.py JST-123 -m "JST-123: what changes"`. Comprueba que la rama contenga el `develop` actual, pasa el control de datos privados ([scripts/revisar.py](scripts/revisar.py)) por todo lo que quedaría público, sube la rama y abre o actualiza el pull request contra `develop`. En tu equipo no se compila nada: las pruebas, los tipos, el build y la revisión del paquete corren en el CI del pull request. El pull request queda como borrador; con `--listo` el comando espera ese CI y lo marca listo solo si todo pasa. `--seco` muestra lo que haría, y `--local` además corre las pruebas y el build en tu equipo antes de subir.
- **Nada sube sin revisar.** La primera vez, `subir.py` prepara tu clon: instala el control [pre-push](scripts/hooks/pre-push) para todas sus copias de trabajo y desactiva el `git push` a secas hacia `origin`, así que subir a mano (con o sin `--no-verify`) no publica nada. Lo que llega a este repositorio no se puede retirar, aunque un commit posterior lo borre: el control mira todos los archivos de todos los commits nuevos, sus nombres, los mensajes y las firmas de los commits y el nombre de la rama.
- **El release** se prepara con `python3 -I scripts/release.py`: abre o actualiza el pull request de `develop` a `main`. Al fusionarlo se publica en npm.
- **Instala** tu propia copia con `python3 -I scripts/instalar.py`: baja de npm el paquete que GitHub Actions compiló y publicó para el release que está en `main`, lo comprueba y lo deja en la carpeta desde donde Paperclip carga el plugin (`../_instalado`). En tu equipo no se compila nada. Actualizar el plugin en Paperclip es un paso aparte.
- **Lo privado queda fuera de git**, en una carpeta junto a la copia de trabajo (`../_privado`, o donde apunte `OFICINA_PRIVADO`): `revisar.json`, con tus propios patrones para el control y qué nombres de empresas y prefijos de tareas son públicos. La cabecera de [scripts/revisar.py](scripts/revisar.py) explica el formato. El `instancia.json` de tu instancia vive en la carpeta de datos del plugin, no en la copia de trabajo.

Al contribuir aceptas que tu aporte queda con la licencia [MIT](LICENSE).
