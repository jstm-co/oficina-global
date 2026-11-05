# Contributing to Oficina global

*[Leer en español](CONTRIBUTING.es.md)*

Thanks for helping. Issues and pull requests can be in English or Spanish.

## How changes get in

1. Fork the repository and create a branch from `main`.
2. Make your change and run, with Node 22.14 or later:

   ```sh
   npm ci
   npm test
   npm run typecheck
   npm run build
   ```

3. Open a pull request against `main`. Do not bump `package.json.version`: releases are calculated automatically. GitHub Actions runs the tests, the type check and the build, and reports whether merging will publish. The first time you contribute, a maintainer has to allow the checks to run.
4. A maintainer reviews it. Nothing reaches `main` without a pull request, and only maintainers merge.

## Releases

Local builds use `YYYY.MDD.0-dev+<sha7>` in UTC, plus `.dirty` when the worktree has uncommitted changes. The footer shows that version and the short commit hash.

Merging package changes into `main` is the release: the [Publish to npm](.github/workflows/publish.yml) workflow calculates `YYYY.MDD.N` in UTC, where N is the number of versions already published that day. It sets that version only inside the runner, builds and tests the package, publishes it with provenance (npm trusted publishing, no tokens), and creates the `vYYYY.MDD.N` GitHub Release. Changes only to docs, tests or CI publish nothing.

## Good to know

- The maintainers work in an internal workspace and bring each change here as a pull request; their commits start with an internal issue id (`JST-123: …`). Code comments are in Spanish and mention those issues too.
- The logic in `src/` stays free of React and the DOM, and it has tests in `tests/`; the interface is in `src/ui/`.
- `src/instancia.ts` is empty on purpose: it is where each instance sets its own agents' fixed characters and name pronunciations. Please don't add data from your instance.
- Never commit tokens, emails, server addresses or task titles from a real Paperclip instance.

By contributing you agree that your contribution is licensed under the [MIT](LICENSE) license.
