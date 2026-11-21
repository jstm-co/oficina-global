# Contributing to Oficina global

*[Leer en español](CONTRIBUTING.es.md)*

Thanks for helping. Issues and pull requests can be in English or Spanish.

## How changes get in

1. Fork the repository and create a branch from `develop`.
2. Make your change and run, with Node 22.14 or later:

   ```sh
   npm ci
   npm test
   npm run typecheck
   npm run build
   ```

3. Open a pull request against `develop`. Do not bump `package.json.version`: releases are calculated automatically. GitHub Actions runs the tests, the type check and the build, and reports whether merging will publish. The first time you contribute, a maintainer has to allow the checks to run.
4. A maintainer reviews it. Nothing reaches `develop` or `main` without a pull request, and only maintainers merge. `main` only receives releases: a pull request from `develop`.

## Releases

Local builds use `YYYY.MDD.0-dev+<sha7>` in UTC, plus `.dirty` when the worktree has uncommitted changes. The footer shows that version and the short commit hash.

Merging package changes into `main` is the release: the [Publish to npm](.github/workflows/publish.yml) workflow calculates `YYYY.MDD.N` in UTC, where N is the number of versions already published that day. It sets that version only inside the runner, builds and tests the package, publishes it with provenance (npm trusted publishing, no tokens), and creates the `vYYYY.MDD.N` GitHub Release. Changes only to docs, tests or CI publish nothing.

## Good to know

- The maintainers work in this same repository, on `jst-123` branches; their commits start with an issue id from their own board (`JST-123: …`), which is not public. Code comments are in Spanish and mention those issues too.
- The logic in `src/` stays free of React and the DOM, and it has tests in `tests/`; the interface is in `src/ui/`.
- `src/instancia.ts` is empty on purpose: it shows where each instance sets its own agents' fixed characters and name pronunciations. Please don't add data from your instance to it. To use yours, copy it to `instancia.local.ts` at the root: git ignores that file and `npm run build` uses it instead.
- Never commit tokens, emails, server addresses or task titles from a real Paperclip instance.

## Maintainers

Maintainers work here from a machine that runs a real Paperclip instance, so the tooling makes sure nothing from that instance gets published. Python 3.12 or later and the GitHub CLI (`gh`) are needed.

- **One branch per issue.** Create `jst-123` from `origin/develop` and commit there. Sign commits with your GitHub noreply address (`git config user.email`): the author's email becomes public.
- **Upload it** with `python3 -I subir.py JST-123 -m "JST-123: what changes"`. It checks that the branch contains the current `develop`, runs the private-data check ([scripts/revisar.py](scripts/revisar.py)) on everything that would be published, runs the tests, the type check, the build and the package check on a clean copy, pushes the branch and opens or updates the pull request against `develop`. It stays a draft until you pass `--listo`; `--rapido` skips the local tests (drafts only) and `--seco` shows what it would do.
- **Nothing goes up unchecked.** The first time, `subir.py` prepares your clone: it installs the [pre-push](scripts/hooks/pre-push) check for every worktree and disables a plain `git push` to `origin`, so pushing by hand (with or without `--no-verify`) publishes nothing. What reaches this repository cannot be taken back, even if a later commit deletes it: the check looks at every file of every new commit, their names, the commit messages and signatures, and the branch name.
- **Release** with `python3 -I scripts/release.py`: it opens or updates the pull request from `develop` to `main`. Merging it publishes to npm.
- **Install** your own copy with `python3 -I scripts/instalar.py`: it moves a second checkout of this repository (`../_instalado`) to the released tag and builds it there. Updating the plugin in Paperclip is a separate step.
- **What is private stays outside git**, in a folder next to the checkout (`../_privado`, or wherever `OFICINA_PRIVADO` points): `revisar.json` (your own patterns for the check, and which company names and issue prefixes are public) and `instancia.local.ts` (your instance's `src/instancia.ts`). The header of [scripts/revisar.py](scripts/revisar.py) describes the format.

By contributing you agree that your contribution is licensed under the [MIT](LICENSE) license.
