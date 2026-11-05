# Contribuir a la Oficina global

*[Read in English](CONTRIBUTING.md)*

Gracias por ayudar. Los issues y pull requests pueden ir en español o en inglés.

## Cómo entra un cambio

1. Haz un fork del repositorio y una rama desde `main`.
2. Haz tu cambio y corre, con Node 22.14 o más nuevo:

   ```sh
   npm ci
   npm test
   npm run typecheck
   npm run build
   ```

3. Abre un pull request contra `main`. No subas `package.json.version`: las versiones se calculan solas. GitHub Actions corre las pruebas, los tipos y el build, e informa si fusionar publicará una versión. La primera vez que contribuyes, un mantenedor tiene que autorizar que corran.
4. Un mantenedor lo revisa. Nada llega a `main` sin pull request, y solo los mantenedores fusionan.

## Versiones

Los builds locales usan `AAAA.MDD.0-dev+<sha7>` en UTC, con `.dirty` si hay cambios sin commit. El pie muestra esa versión y el commit corto.

Fusionar cambios del paquete en `main` es publicar: el workflow [Publish to npm](.github/workflows/publish.yml) calcula `AAAA.MDD.N` en UTC, donde N es la cantidad de versiones ya publicadas ese día. Pone esa versión solo dentro del runner, arma y prueba el paquete, lo publica con procedencia (trusted publishing de npm, sin tokens) y crea el Release `vAAAA.MDD.N` en GitHub. Los cambios solo de textos, pruebas o CI no publican nada.

## Para saber

- Los mantenedores trabajan en un espacio interno y traen cada cambio aquí como pull request; sus commits empiezan con el código de una tarea interna (`JST-123: …`). Los comentarios del código están en español y también nombran esas tareas.
- La lógica de `src/` va sin React ni DOM y tiene pruebas en `tests/`; la interfaz está en `src/ui/`.
- `src/instancia.ts` va vacío a propósito: ahí cada instancia pone el personaje fijo de sus agentes y cómo se pronuncian sus nombres. No agregues datos de tu instancia.
- Nunca subas tokens, correos, direcciones de servidores ni títulos de tareas de una instancia real de Paperclip.

Al contribuir aceptas que tu aporte queda con la licencia [MIT](LICENSE).
