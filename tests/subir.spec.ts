import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CORREO_LIMPIO, CORREO_PERSONAL, IP_PRIVADA, RAIZ, RUTA_PERSONAL, apiFalsa, borrar, carpetaTemporal, configPrivada, configurarGit, conModulo,
  copiarScripts, datosEjemplo, entornoAislado, escribir, ghFalso, git as gitEn, lanzar, python, sesionFalsa, type DatosApi,
} from "./ayudasScripts.js";

const comprobacion = `
import importlib.util
import sys
from pathlib import Path

spec = importlib.util.spec_from_file_location("subir", sys.argv[1])
subir = importlib.util.module_from_spec(spec)
spec.loader.exec_module(subir)
subir.REPO = Path(sys.argv[2])
try:
    subir.revisar_rama_actual()
except subir.Alto as error:
    print(error)
    sys.exit(1)
`;

describe("publicación con GitFlow", () => {
  it("rechaza una rama que no contiene develop y acepta una rama de tarea al día", () => {
    const repo = mkdtempSync(join(tmpdir(), "oficina-subir-"));
    const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "pipe" });
    const revisar = () => spawnSync("python3", ["-I", "-c", comprobacion, resolve(__dirname, "../subir.py"), repo], { encoding: "utf8" });
    try {
      git("init", "-b", "develop");
      git("config", "user.name", "Prueba");
      git("config", "user.email", "prueba@example.invalid");
      writeFileSync(join(repo, "archivo.txt"), "base\n");
      git("add", "archivo.txt");
      git("commit", "-m", "base");
      git("checkout", "-b", "jst-383");
      writeFileSync(join(repo, "tarea.txt"), "cambio de la tarea\n");
      git("add", "tarea.txt");
      git("commit", "-m", "arreglo");
      git("checkout", "develop");
      writeFileSync(join(repo, "archivo.txt"), "develop avanzó\n");
      git("commit", "-am", "avance");
      git("checkout", "jst-383");

      const vieja = revisar();
      expect(vieja.status).toBe(1);
      expect(vieja.stdout + vieja.stderr).toContain("no contiene el develop actual");
      expect(vieja.stdout + vieja.stderr).toContain("git merge origin/develop");

      git("merge", "develop");
      const alDia = revisar();
      expect(alDia.status).toBe(0);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("crea el PR público de la tarea con base develop", () => {
    const codigo = `
import importlib.util
import json
import sys
from pathlib import Path
spec = importlib.util.spec_from_file_location("subir", sys.argv[1])
subir = importlib.util.module_from_spec(spec)
spec.loader.exec_module(subir)
print(json.dumps(subir.comando_pr_publico("jst-383", "JST-383: Test", Path(sys.argv[2]), False)))
`;
    const cuerpo = join(mkdtempSync(join(tmpdir(), "oficina-pr-")), "cuerpo.md");
    writeFileSync(cuerpo, "Test\n");
    const resultado = spawnSync("python3", ["-I", "-c", codigo, resolve(__dirname, "../subir.py"), cuerpo], { encoding: "utf8" });
    expect(resultado.status).toBe(0);
    const comando = JSON.parse(resultado.stdout);
    expect(comando).toEqual(expect.arrayContaining(["--base", "develop", "--head", "jst-383"]));
    expect(comando).not.toEqual(expect.arrayContaining(["--base", "main"]));
    rmSync(join(cuerpo, ".."), { recursive: true, force: true });
  });

  it("arma el texto del PR: borrador o listo, y si publica versión o no", async () => {
    const carpeta = carpetaTemporal("subir-texto");
    try {
      const { env } = entornoAislado(carpeta);
      const r = await python([...conModulo(join(RAIZ, "subir.py"), `
print(json.dumps([
  m.texto_del_pr(["JST-1: uno", "JST-1: dos"], True, False),
  m.texto_del_pr(["JST-1: uno"], True, True),
  m.texto_del_pr(["JST-1: uno"], False, False),
  [m.sin_version(x) for x in (".github/workflows/ci.yml", "tests/a.spec.ts", "README.md", "LICENSE", ".gitignore", "src/worker.ts", "package.json")],
]))`)], { env });
      expect(r.estado, r.todo).toBe(0);
      const [borradorConVersion, listo, borradorSinVersion, sinVersion] = JSON.parse(r.salida);
      expect(borradorConVersion).toContain("publishes a new UTC date-based version");
      expect(borradorConVersion).toContain("draft: QA is still pending");
      expect(borradorConVersion).toContain("- JST-1: uno\n- JST-1: dos");
      expect(listo).toContain("ready for approval");
      expect(listo).not.toContain("draft");
      expect(borradorSinVersion).toContain("publishes nothing");
      expect(borradorSinVersion).not.toContain("date-based");
      expect(sinVersion).toEqual([true, true, true, true, true, false, false]);
    } finally {
      borrar(carpeta);
    }
  }, 60000);

  describe("subir de principio a fin", () => {
    interface Caso {
      archivo?: [string, string | Uint8Array];
      mensaje?: string;
      correoAutor?: string;
      tarea?: string;
      /** Commits previos de la rama (antes del commit principal); lo que dejen en el índice entra en el commit principal. */
      antes?: (repo: string, env: NodeJS.ProcessEnv) => void;
      /** Se corre después del commit principal y antes de lanzar `subir.py`. */
      despues?: (repo: string, env: NodeJS.ProcessEnv) => void;
      /** Contenido de `.gitattributes` (va en el commit previo de la rama). */
      gitattributes?: string;
      config?: unknown;
      api?: DatosApi;
      /** Sube de verdad (a un remoto bare local) con un `gh` falso que no encuentra PR y crea uno. */
      subirDeVerdad?: boolean;
      /** El resto del `gh` falso (en vez del de siempre). Tiene `$GH_LOG` para anotar y `$GH_DIR` para leer respuestas. */
      gh?: string;
      /** Deja en `$GH_DIR` las respuestas que va a dar el `gh` falso. */
      prepararGh?: (dir: string) => void;
      /** Las banderas de `subir.py` después del mensaje (por omisión, `--rapido`). */
      banderas?: string[];
      env?: NodeJS.ProcessEnv;
    }

    const GH_DE_VERDAD = `if [ "$1" = "pr" ] && [ "$2" = "list" ]; then echo '[]'; exit 0; fi
if [ "$1" = "pr" ] && [ "$2" = "create" ]; then echo 'https://example.invalid/pull/1'; exit 0; fi`;

    async function correrSubir(caso: Caso) {
      const carpeta = carpetaTemporal("subir-e2e");
      const bin = join(carpeta, "bin");
      ghFalso(bin, caso.gh ?? (caso.subirDeVerdad ? GH_DE_VERDAD : ""));
      // Un `npm` que solo anota: subir.py no lo llama salvo con --local.
      writeFileSync(join(bin, "npm"), `#!/bin/sh\nprintf '%s\\n' "$*" >> "$NPM_LOG"\nexit 1\n`, { mode: 0o755 });
      const ghLog = join(carpeta, "gh.log");
      const npmLog = join(carpeta, "npm.log");
      const ghDir = join(carpeta, "gh");
      mkdirSync(ghDir, { recursive: true });
      caso.prepararGh?.(ghDir);
      const api = caso.api ? await apiFalsa(caso.api) : null;
      try {
        const { casa, privado, env } = entornoAislado(carpeta, bin, { GH_LOG: ghLog, GH_DIR: ghDir, NPM_LOG: npmLog, ...caso.env });
        if (api) sesionFalsa(casa, api.url);
        if (api || caso.config) configPrivada(privado, caso.config ?? {}); // con sesión hace falta; la configuración sola la rechaza el revisor
        const remoto = join(carpeta, "remoto.git");
        const repo = join(carpeta, "repo");
        execFileSync("git", ["init", "--bare", "--initial-branch=develop", remoto], { stdio: "pipe", env });
        execFileSync("git", ["init", "--initial-branch=develop", repo], { stdio: "pipe", env });
        configurarGit(repo, env);
        gitEn(repo, env, "remote", "add", "origin", remoto);
        escribir(repo, "archivo.txt", "base\n");
        gitEn(repo, env, "add", "-A");
        gitEn(repo, env, "commit", "-m", "base");
        gitEn(repo, env, "push", "origin", "develop");
        gitEn(repo, env, "checkout", "-b", "jst-1");
        if (caso.gitattributes) {
          escribir(repo, ".gitattributes", caso.gitattributes);
          gitEn(repo, env, "add", "-A");
          gitEn(repo, env, "commit", "-m", "JST-1: atributos");
        }
        caso.antes?.(repo, env);
        const [ruta, texto] = caso.archivo ?? ["tarea.txt", "cambio limpio de la tarea\n"];
        escribir(repo, ruta, texto);
        gitEn(repo, env, "add", "-A");
        const firma = caso.correoAutor ? { ...env, GIT_AUTHOR_EMAIL: caso.correoAutor } : env;
        gitEn(repo, firma, "commit", "-m", caso.mensaje ?? "JST-1: cambio");
        caso.despues?.(repo, env);
        // Los scripts se copian después del commit: no van en él, pero subir.py usa su propia carpeta como repo y
        // `preparar_clon` copia de ahí el control pre-push.
        copiarScripts(repo, "subir.py", "scripts/revisar.py", "scripts/hooks");
        const tarea = caso.tarea ?? "JST-1";
        const r = await python(["subir.py", tarea, "-m", `${tarea}: Change something`, ...(caso.subirDeVerdad ? [] : ["--seco"]), ...(caso.banderas ?? ["--rapido"])], { cwd: repo, env });
        const enRemoto = execFileSync("git", ["--git-dir", remoto, "branch", "--list", "jst-1"], { env, encoding: "utf8" }).trim();
        const tags = execFileSync("git", ["--git-dir", remoto, "tag", "--list"], { env, encoding: "utf8" }).trim();
        const leer = (ruta: string) => (existsSync(ruta) ? readFileSync(ruta, "utf8").trim().split("\n").filter(Boolean) : []);
        const cuerpos = leer(join(ghDir, "cuerpos.txt")).map((linea) => JSON.parse(linea) as { title: string; body: string });
        return { ...r, enRemoto, tags, gh: leer(ghLog), npm: leer(npmLog), cuerpos };
      } finally {
        await api?.cerrar();
        borrar(carpeta);
      }
    }

    it("termina en 0 con un commit limpio y no sube nada por ser --seco", async () => {
      const r = await correrSubir({});
      expect(r.estado, r.todo).toBe(0);
      expect(r.salida).toContain("0 hallazgos de datos privados");
      expect(r.salida).toContain("[seco] rama jst-1");
      expect(r.salida).toContain("**Status:** draft");
      expect(r.enRemoto).toBe("");
    }, 60000);

    it("sin sesión ni configuración privada avisa que revisa solo con los patrones fijos y sigue", async () => {
      const r = await correrSubir({});
      expect(r.estado, r.todo).toBe(0);
      expect(r.salida).toContain("reviso solo con los patrones fijos");
    }, 60000);

    it(`termina en 1 si un archivo commiteado trae una IP privada`, async () => {
      const r = await correrSubir({ archivo: ["notas.txt", `servidor en ${IP_PRIVADA}\n`] });
      expect(r.estado, r.todo).toBe(1);
      expect(r.salida).toContain("notas.txt:1: IP privada");
      expect(r.todo).toContain("No subí nada");
    }, 60000);

    it("termina en 1 si un archivo commiteado trae una ruta de la carpeta personal", async () => {
      const r = await correrSubir({ archivo: ["notas.txt", `abre ${RUTA_PERSONAL}/proyecto\n`] });
      expect(r.estado, r.todo).toBe(1);
      expect(r.salida).toContain("notas.txt:1: ruta de la carpeta personal");
      expect(r.todo).toContain("No subí nada");
    }, 60000);

    it("termina en 1 si el mensaje de un commit trae un correo", async () => {
      const r = await correrSubir({ mensaje: `JST-1: cambio, avisar a ${CORREO_PERSONAL}` });
      expect(r.estado, r.todo).toBe(1);
      expect(r.salida).toMatch(/commit [0-9a-f]{7}:1: correo/);
      expect(r.todo).toContain("No subí nada");
    }, 60000);

    it("termina en 1 si el autor del commit firma con un correo que no es noreply de GitHub", async () => {
      const r = await correrSubir({ correoAutor: CORREO_PERSONAL });
      expect(r.estado, r.todo).toBe(1);
      expect(r.salida).toContain("correo del autor");
      expect(r.todo).toContain("No subí nada");
    }, 60000);

    it("acepta el correo noreply de GitHub como firma", async () => {
      const r = await correrSubir({ correoAutor: CORREO_LIMPIO });
      expect(r.estado, r.todo).toBe(0);
    }, 60000);

    // ---- regresiones que encontró la revisión independiente (JST-419) ----

    it("commit intermedio: un commit agrega un archivo con un dato privado y el siguiente lo borra → sale 1 y no sube", async () => {
      const r = await correrSubir({
        antes: (repo, env) => {
          escribir(repo, "secreto.txt", `servidor en ${IP_PRIVADA}\n`);
          gitEn(repo, env, "add", "-A");
          gitEn(repo, env, "commit", "-m", "JST-1: agrega");
          gitEn(repo, env, "rm", "-q", "secreto.txt");
        },
      });
      expect(r.estado, r.todo).toBe(1);
      expect(r.salida).toContain("secreto.txt:1: IP privada");
      expect(r.todo).toContain("No subí nada");
      expect(r.enRemoto).toBe("");
    }, 60000);

    it("export-ignore en .gitattributes no esconde una carpeta con un dato privado", async () => {
      const r = await correrSubir({ gitattributes: "interno export-ignore\n", archivo: ["interno/notas.txt", `servidor en ${IP_PRIVADA}\n`] });
      expect(r.estado, r.todo).toBe(1);
      expect(r.salida).toContain("interno/notas.txt:1: IP privada");
      expect(r.enRemoto).toBe("");
    }, 60000);

    it("un nombre de archivo con un dato privado (una IP privada) es un hallazgo", async () => {
      const r = await correrSubir({ archivo: [`servidor-${IP_PRIVADA}.txt`, "limpio\n"] });
      expect(r.estado, r.todo).toBe(1);
      expect(r.salida).toContain(`servidor-${IP_PRIVADA}.txt: en el nombre: IP privada`);
    }, 60000);

    it("un archivo latin-1 (no UTF-8) fuera de las carpetas de imágenes es un hallazgo", async () => {
      const r = await correrSubir({ archivo: ["notas.txt", new Uint8Array([0x63, 0x61, 0x66, 0xe9, 0x0a])] });
      expect(r.estado, r.todo).toBe(1);
      expect(r.salida).toContain("notas.txt: no es texto UTF-8");
    }, 60000);

    it("un binario en src/ui/assets/ pasa", async () => {
      const r = await correrSubir({ archivo: ["src/ui/assets/imagen.png", new Uint8Array([0x89, 0x50, 0xff, 0x00])] });
      expect(r.estado, r.todo).toBe(0);
    }, 60000);

    it("rechaza una tarea cuyo prefijo no está en prefijos_publicos cuando la configuración los define", async () => {
      const r = await correrSubir({ tarea: "EXT-1", config: { prefijos_publicos: ["JST"] } });
      expect(r.estado, r.todo).toBe(1);
      expect(r.salida).toContain("«EXT-1» no es una tarea de un tablero que se pueda nombrar aquí (JST)");
      expect(r.todo).toContain("No subí nada");
    }, 60000);

    it("acepta una tarea cuyo prefijo sí está en prefijos_publicos (con sesión y configuración)", async () => {
      const r = await correrSubir({ config: { prefijos_publicos: ["JST"] }, api: datosEjemplo() });
      expect(r.estado, r.todo).toBe(0);
      expect(r.salida).not.toContain("reviso solo con los patrones fijos");
      expect(r.salida).toContain("0 hallazgos de datos privados");
    }, 60000);

    it("con sesión pero sin revisar.json se detiene sin subir", async () => {
      const carpeta = carpetaTemporal("subir-sin-config");
      const api = await apiFalsa(datosEjemplo());
      try {
        const bin = join(carpeta, "bin");
        ghFalso(bin);
        const { casa, env } = entornoAislado(carpeta, bin);
        sesionFalsa(casa, api.url);
        const repo = join(carpeta, "repo");
        const remoto = join(carpeta, "remoto.git");
        execFileSync("git", ["init", "--bare", "--initial-branch=develop", remoto], { stdio: "pipe", env });
        execFileSync("git", ["init", "--initial-branch=develop", repo], { stdio: "pipe", env });
        configurarGit(repo, env);
        gitEn(repo, env, "remote", "add", "origin", remoto);
        escribir(repo, "a.txt", "base\n");
        gitEn(repo, env, "add", "-A");
        gitEn(repo, env, "commit", "-m", "base");
        gitEn(repo, env, "push", "origin", "develop");
        gitEn(repo, env, "checkout", "-b", "jst-1");
        escribir(repo, "b.txt", "cambio\n");
        gitEn(repo, env, "add", "-A");
        gitEn(repo, env, "commit", "-m", "JST-1: cambio");
        copiarScripts(repo, "subir.py", "scripts/revisar.py", "scripts/hooks");
        const r = await python(["subir.py", "JST-1", "-m", "JST-1: Change something", "--seco", "--rapido"], { cwd: repo, env });
        expect(r.estado, r.todo).toBe(1);
        expect(r.salida).toContain("falta la configuración privada");
        expect(r.todo).toContain("No subí nada");
      } finally {
        await api.cerrar();
        borrar(carpeta);
      }
    }, 60000);

    it("con push.followTags=true el push de subir.py no lleva el tag anotado que apunta a un commit de la rama", async () => {
      const r = await correrSubir({
        subirDeVerdad: true,
        despues: (repo, env) => {
          gitEn(repo, env, "config", "push.followTags", "true");
          gitEn(repo, env, "tag", "-a", "v-interno", "-m", `notas de ${IP_PRIVADA}`);
          expect(gitEn(repo, env, "config", "push.followTags")).toBe("true");
        },
      });
      expect(r.estado, r.todo).toBe(0);
      expect(r.salida).toContain("PR: https://example.invalid/pull/1");
      expect(r.enRemoto).toContain("jst-1"); // la rama sí llegó
      expect(r.tags).toBe(""); // el tag, no
    }, 60000);

    describe("el CI lo corre GitHub (JST-425)", () => {
      // Un `gh` falso que anota cada llamada y contesta las corridas de GitHub Actions desde archivos:
      // `corridas-1.json` la primera vez que se pregunta, `corridas-2.json` la segunda… y la última se repite.
      const GH_CON_CI = `printf '%s\\n' "$*" >> "$GH_LOG"
if [ "$1" = "pr" ] && [ "$2" = "list" ]; then if [ -f "$GH_DIR/pr-list.json" ]; then cat "$GH_DIR/pr-list.json"; else echo '[]'; fi; exit 0; fi
if [ "$1" = "pr" ] && [ "$2" = "create" ]; then echo 'https://example.invalid/pull/7'; exit 0; fi
if [ "$1" = "pr" ] && [ "$2" = "ready" ]; then exit 0; fi
if [ "$1" = "api" ] && [ "$2" = "-X" ]; then tr -d '\\n' < "$6" >> "$GH_DIR/cuerpos.txt"; echo >> "$GH_DIR/cuerpos.txt"; exit 0; fi
if [ "$1" = "api" ] && [ "\${2#*pulls/}" != "$2" ]; then
  if [ -f "$GH_DIR/cabeza" ]; then sha=$(cat "$GH_DIR/cabeza"); else sha=$(git --git-dir "$GH_DIR/../remoto.git" rev-parse jst-1); fi
  printf '{"head":{"sha":"%s"}}\\n' "$sha"; exit 0
fi
if [ "$1" = "api" ]; then
  n=$(cat "$GH_DIR/veces" 2>/dev/null || echo 0); n=$((n + 1)); echo "$n" > "$GH_DIR/veces"
  while [ "$n" -gt 1 ] && [ ! -f "$GH_DIR/corridas-$n.json" ]; do n=$((n - 1)); done
  if [ -f "$GH_DIR/corridas-$n.json" ]; then cat "$GH_DIR/corridas-$n.json"; else echo '{"workflow_runs": []}'; fi
  exit 0
fi`;
      const corridas = (...lista: [string, string, string | null][]) =>
        JSON.stringify({ workflow_runs: lista.map(([name, status, conclusion]) => ({ name, status, conclusion, html_url: `https://example.invalid/runs/${name}` })) });
      const RAPIDO = { OFICINA_CI_CADA: "0.05", OFICINA_CI_APARECE: "1.5", OFICINA_CI_TERMINA: "3" };
      const preguntasCi = (gh: string[]) => gh.filter((l) => l.includes("actions/runs?head_sha="));

      it("sin --listo sube, deja el PR como borrador y no espera el CI ni corre npm", async () => {
        const r = await correrSubir({ subirDeVerdad: true, gh: GH_CON_CI, banderas: [], env: RAPIDO });
        expect(r.estado, r.todo).toBe(0);
        expect(r.enRemoto).toContain("jst-1");
        expect(r.gh.some((l) => l.startsWith("pr create") && l.includes("--draft"))).toBe(true);
        expect(preguntasCi(r.gh)).toEqual([]);
        expect(r.gh.some((l) => l.startsWith("pr ready"))).toBe(false);
        expect(r.npm).toEqual([]);
        expect(r.salida).toContain("borrador (falta QA)");
      }, 60000);

      it("con --listo crea el PR como borrador, espera el CI y solo cuando pasa lo marca listo", async () => {
        const r = await correrSubir({
          subirDeVerdad: true, gh: GH_CON_CI, banderas: ["--listo"], env: RAPIDO,
          prepararGh: (dir) => {
            writeFileSync(join(dir, "corridas-1.json"), corridas());
            writeFileSync(join(dir, "corridas-2.json"), corridas(["CI", "in_progress", null]));
            writeFileSync(join(dir, "corridas-3.json"), corridas(["CI", "completed", "success"]));
          },
        });
        expect(r.estado, r.todo).toBe(0);
        const crear = r.gh.findIndex((l) => l.startsWith("pr create"));
        const listo = r.gh.findIndex((l) => l === "pr ready 7 --repo jstm-co/oficina-global");
        expect(r.gh[crear]).toContain("--draft");
        expect(preguntasCi(r.gh)).toHaveLength(4); // sin corridas, corriendo, terminó, y una mirada más para confirmar
        expect(listo).toBeGreaterThan(r.gh.map((l) => l.includes("actions/runs?head_sha=")).lastIndexOf(true));
        expect(preguntasCi(r.gh)[0]).toMatch(/head_sha=[0-9a-f]{40}/);
        expect(r.salida).toContain(`CI de GitHub en verde para ${/head_sha=([0-9a-f]{7})/.exec(preguntasCi(r.gh)[0]!)![1]}`);
        expect(r.cuerpos.at(-1)?.body).toContain("ready for approval");
        expect(r.salida).toContain("CI de GitHub en verde");
        expect(r.salida).toContain("listo para aprobar");
        expect(r.npm).toEqual([]);
      }, 60000);

      it("con --listo y el CI en rojo termina en 1, dice qué falló y el PR queda como borrador", async () => {
        const r = await correrSubir({
          subirDeVerdad: true, gh: GH_CON_CI, banderas: ["--listo"], env: RAPIDO,
          prepararGh: (dir) => writeFileSync(join(dir, "corridas-1.json"), corridas(["CI", "completed", "failure"], ["Otra", "completed", "success"])),
        });
        expect(r.estado, r.todo).toBe(1);
        expect(r.enRemoto).toContain("jst-1"); // la rama sí subió: el CI corre sobre ella
        expect(r.salida).toContain("El CI de GitHub no pasó");
        expect(r.salida).toContain("CI: failure https://example.invalid/runs/CI");
        expect(r.salida).toContain("Subí jst-1");
        expect(r.gh.some((l) => l.startsWith("pr ready"))).toBe(false);
        expect(r.cuerpos.every((c) => !c.body.includes("ready for approval"))).toBe(true);
      }, 60000);

      it("una corrida cancelada cuenta como falla", async () => {
        const r = await correrSubir({
          subirDeVerdad: true, gh: GH_CON_CI, banderas: ["--listo"], env: RAPIDO,
          prepararGh: (dir) => writeFileSync(join(dir, "corridas-1.json"), corridas(["CI", "completed", "cancelled"])),
        });
        expect(r.estado, r.todo).toBe(1);
        expect(r.salida).toContain("CI: cancelled");
        expect(r.gh.some((l) => l.startsWith("pr ready"))).toBe(false);
      }, 60000);

      it("si todas las corridas se saltaron, nada se probó: termina en 1 sin marcar listo", async () => {
        const r = await correrSubir({
          subirDeVerdad: true, gh: GH_CON_CI, banderas: ["--listo"], env: RAPIDO,
          prepararGh: (dir) => writeFileSync(join(dir, "corridas-1.json"), corridas(["CI", "completed", "skipped"])),
        });
        expect(r.estado, r.todo).toBe(1);
        expect(r.salida).toContain("no probó nada");
        expect(r.gh.some((l) => l.startsWith("pr ready"))).toBe(false);
      }, 60000);

      it("si aparece otra corrida cuando las primeras ya terminaron, la espera también", async () => {
        const r = await correrSubir({
          subirDeVerdad: true, gh: GH_CON_CI, banderas: ["--listo"], env: RAPIDO,
          prepararGh: (dir) => {
            writeFileSync(join(dir, "corridas-1.json"), corridas(["Rápida", "completed", "success"]));
            writeFileSync(join(dir, "corridas-2.json"), corridas(["Rápida", "completed", "success"], ["CI", "in_progress", null]));
            writeFileSync(join(dir, "corridas-3.json"), corridas(["Rápida", "completed", "success"], ["CI", "completed", "failure"]));
          },
        });
        expect(r.estado, r.todo).toBe(1);
        expect(r.salida).toContain("CI: failure");
        expect(r.gh.some((l) => l.startsWith("pr ready"))).toBe(false);
      }, 60000);

      it("si alguien subió otro commit a la rama mientras corría el CI, no marca listo", async () => {
        const r = await correrSubir({
          subirDeVerdad: true, gh: GH_CON_CI, banderas: ["--listo"], env: RAPIDO,
          prepararGh: (dir) => {
            writeFileSync(join(dir, "corridas-1.json"), corridas(["CI", "completed", "success"]));
            writeFileSync(join(dir, "cabeza"), "f".repeat(40));
          },
        });
        expect(r.estado, r.todo).toBe(1);
        expect(r.salida).toContain("alguien subió otro commit");
        expect(r.gh.some((l) => l.startsWith("pr ready"))).toBe(false);
        expect(r.cuerpos.every((c) => !c.body.includes("ready for approval"))).toBe(true);
      }, 60000);

      it("con --listo, si el CI no empieza, termina en 1 sin marcar listo", async () => {
        const r = await correrSubir({ subirDeVerdad: true, gh: GH_CON_CI, banderas: ["--listo"], env: RAPIDO });
        expect(r.estado, r.todo).toBe(1);
        expect(r.salida).toContain("no empezó");
        expect(r.gh.some((l) => l.startsWith("pr ready"))).toBe(false);
      }, 60000);

      it("con --listo, si el CI no termina a tiempo, termina en 1 sin marcar listo", async () => {
        const r = await correrSubir({
          subirDeVerdad: true, gh: GH_CON_CI, banderas: ["--listo"], env: { ...RAPIDO, OFICINA_CI_TERMINA: "0.6" },
          prepararGh: (dir) => writeFileSync(join(dir, "corridas-1.json"), corridas(["CI", "queued", null])),
        });
        expect(r.estado, r.todo).toBe(1);
        expect(r.salida).toContain("sigue corriendo");
        expect(r.gh.some((l) => l.startsWith("pr ready"))).toBe(false);
      }, 60000);

      it("un PR que ya estaba listo vuelve a borrador mientras el CI prueba el commit nuevo, y queda listo si pasa", async () => {
        const r = await correrSubir({
          subirDeVerdad: true, gh: GH_CON_CI, banderas: ["--listo"], env: RAPIDO,
          prepararGh: (dir) => {
            writeFileSync(join(dir, "pr-list.json"), JSON.stringify([{ number: 7, url: "https://example.invalid/pull/7", isDraft: false }]));
            writeFileSync(join(dir, "corridas-1.json"), corridas(["CI", "completed", "success"], ["Docs", "completed", "skipped"]));
          },
        });
        expect(r.estado, r.todo).toBe(0);
        const aBorrador = r.gh.findIndex((l) => l === "pr ready 7 --repo jstm-co/oficina-global --undo");
        const aListo = r.gh.findIndex((l) => l === "pr ready 7 --repo jstm-co/oficina-global");
        expect(aBorrador).toBeGreaterThan(-1);
        expect(aListo).toBeGreaterThan(aBorrador);
        expect(r.gh.some((l) => l.startsWith("pr create"))).toBe(false);
        expect(r.cuerpos[0]?.body).toContain("draft: QA is still pending");
        expect(r.cuerpos.at(-1)?.body).toContain("ready for approval");
      }, 60000);

      it("--seco con --listo no sube ni pregunta por el CI", async () => {
        const r = await correrSubir({ gh: GH_CON_CI, banderas: ["--listo"], env: RAPIDO });
        expect(r.estado, r.todo).toBe(0);
        expect(r.enRemoto).toBe("");
        expect(preguntasCi(r.gh)).toEqual([]);
        expect(r.salida).toContain("esperaría el CI de GitHub");
      }, 60000);

      it("--rapido se sigue aceptando y no cambia nada", async () => {
        const r = await correrSubir({ subirDeVerdad: true, gh: GH_CON_CI, banderas: ["--rapido"], env: RAPIDO });
        expect(r.estado, r.todo).toBe(0);
        expect(r.npm).toEqual([]);
      }, 60000);

      it("--local corre npm aquí antes de subir, y si falla no sube", async () => {
        const r = await correrSubir({ subirDeVerdad: true, gh: GH_CON_CI, banderas: ["--local"], env: RAPIDO });
        expect(r.estado, r.todo).toBe(1);
        expect(r.npm).toEqual(["ci"]);
        expect(r.enRemoto).toBe("");
        expect(r.todo).toContain("No subí nada");
      }, 60000);
    });

    it("el comando de push de subir.py nombra la dirección de origin y lleva --no-verify y --no-follow-tags", () => {
      const fuente = readFileSync(join(RAIZ, "subir.py"), "utf8");
      const linea = fuente.split("\n").find((l) => l.includes('git("push"')) ?? "";
      expect(linea).toContain('"--no-verify"');
      expect(linea).toContain('"--no-follow-tags"');
      expect(linea).toContain("url_de_origin()");
    });
  });

  describe("preparar_clon", () => {
    /** Repo con remoto bare local, la rama jst-1 con un commit y los scripts copiados (sin commitear). */
    function clon(carpeta: string, env: NodeJS.ProcessEnv) {
      const remoto = join(carpeta, "remoto.git");
      const repo = join(carpeta, "repo");
      execFileSync("git", ["init", "--bare", "--initial-branch=develop", remoto], { stdio: "pipe", env });
      execFileSync("git", ["init", "--initial-branch=develop", repo], { stdio: "pipe", env });
      configurarGit(repo, env);
      gitEn(repo, env, "remote", "add", "origin", remoto);
      escribir(repo, "archivo.txt", "base\n");
      gitEn(repo, env, "add", "-A");
      gitEn(repo, env, "commit", "-m", "base");
      gitEn(repo, env, "push", "origin", "develop");
      gitEn(repo, env, "checkout", "-b", "jst-1");
      copiarScripts(repo, "subir.py", "scripts/revisar.py", "scripts/hooks");
      return { remoto, repo };
    }
    const preparar = (repo: string, env: NodeJS.ProcessEnv) => python(conModulo(join(RAIZ, "subir.py"), `
m.REPO = Path(sys.argv[2])
try:
    m.preparar_clon()
    print("listo")
except m.Alto as e:
    print("ALTO: " + str(e))
    sys.exit(1)`).concat(repo), { cwd: repo, env });

    it("deja pre-push y oficina_revisar.py en la carpeta de hooks común, quita core.hooksPath local y desactiva el push directo a origin", async () => {
      const carpeta = carpetaTemporal("preparar");
      try {
        const { env } = entornoAislado(carpeta);
        const { remoto, repo } = clon(carpeta, env);
        gitEn(repo, env, "config", "--local", "core.hooksPath", join(repo, "scripts/hooks"));
        const r = await preparar(repo, env);
        expect(r.estado, r.todo).toBe(0);
        expect(r.salida).toContain("Clon preparado");
        const ganchos = join(repo, ".git/hooks");
        expect(readFileSync(join(ganchos, "pre-push"), "utf8")).toBe(readFileSync(join(RAIZ, "scripts/hooks/pre-push"), "utf8"));
        expect(readFileSync(join(ganchos, "oficina_revisar.py"), "utf8")).toBe(readFileSync(join(RAIZ, "scripts/revisar.py"), "utf8"));
        expect(statSync(join(ganchos, "pre-push")).mode & 0o111).not.toBe(0);
        expect(spawnSyncGit(repo, env, ["config", "--local", "--get", "core.hooksPath"]).status).toBe(1);
        expect(gitEn(repo, env, "config", "--local", "--get", "remote.origin.pushurl")).toBe("sin-push-directo--usa-subir.py");

        // `git push` a secas falla, también con --no-verify, y el remoto no recibe nada
        const directo = await lanzar("git", ["push", "--no-verify", "origin", "jst-1"], { cwd: repo, env });
        expect(directo.estado, directo.todo).not.toBe(0);
        expect(directo.todo).toContain("sin-push-directo--usa-subir.py");
        expect(gitEn(carpeta, env, "--git-dir", remoto, "branch", "--list", "jst-1")).toBe("");

        // volver a prepararlo no cambia nada ni avisa de nuevo
        const otra = await preparar(repo, env);
        expect(otra.estado, otra.todo).toBe(0);
        expect(otra.salida).not.toContain("Clon preparado");
      } finally {
        borrar(carpeta);
      }
    }, 60000);

    it("desde un worktree el control queda en la carpeta común del clon (vale para todas sus copias de trabajo)", async () => {
      const carpeta = carpetaTemporal("preparar-wt");
      try {
        const { env } = entornoAislado(carpeta);
        const { repo } = clon(carpeta, env);
        const arbol = join(carpeta, "arbol");
        gitEn(repo, env, "worktree", "add", "-b", "otra", arbol, "develop");
        copiarScripts(arbol, "subir.py", "scripts/revisar.py", "scripts/hooks");
        const r = await python(conModulo(join(RAIZ, "subir.py"), "m.REPO = Path(sys.argv[2])\nm.preparar_clon()").concat(arbol), { cwd: arbol, env });
        expect(r.estado, r.todo).toBe(0);
        expect(existsSync(join(repo, ".git/hooks/pre-push"))).toBe(true);
        expect(existsSync(join(repo, ".git/hooks/oficina_revisar.py"))).toBe(true);
        expect(existsSync(join(repo, ".git/worktrees/arbol/hooks"))).toBe(false);
      } finally {
        borrar(carpeta);
      }
    }, 60000);

    it("copia de develop de origin (no de la rama) el control y el revisor si develop ya los tiene", async () => {
      const carpeta = carpetaTemporal("preparar-develop");
      try {
        const { env } = entornoAislado(carpeta);
        const { repo } = clon(carpeta, env);
        gitEn(repo, env, "checkout", "develop");
        escribir(repo, "scripts/hooks/pre-push", "#!/bin/sh\n# el de develop\nexit 0\n");
        escribir(repo, "scripts/revisar.py", "MARCA = 'el de develop'\n");
        gitEn(repo, env, "add", "-A");
        gitEn(repo, env, "commit", "-m", "scripts en develop");
        gitEn(repo, env, "push", "origin", "develop");
        gitEn(repo, env, "checkout", "jst-1");
        // en la rama los scripts son otros (los reales, sin commitear)
        copiarScripts(repo, "subir.py", "scripts/revisar.py", "scripts/hooks");
        const r = await preparar(repo, env);
        expect(r.estado, r.todo).toBe(0);
        expect(readFileSync(join(repo, ".git/hooks/pre-push"), "utf8")).toContain("# el de develop");
        expect(readFileSync(join(repo, ".git/hooks/oficina_revisar.py"), "utf8")).toBe("MARCA = 'el de develop'\n");

        // y cargar_revisar usa el revisor de develop, no el de la rama
        const carga = await python(conModulo(join(RAIZ, "subir.py"), `
m.REPO = Path(sys.argv[2])
tmp = Path(sys.argv[3])
tmp.mkdir()
print(m.cargar_revisar(tmp).MARCA if hasattr(m.cargar_revisar(tmp), "MARCA") else "SIN MARCA")`).concat(repo, join(carpeta, "tmpcarga")), { cwd: repo, env });
        expect(carga.estado, carga.todo).toBe(0);
        expect(carga.salida.trim()).toBe("el de develop");
      } finally {
        borrar(carpeta);
      }
    }, 60000);

    it("si el git tiene un core.hooksPath global falla con un mensaje que lo dice", async () => {
      const carpeta = carpetaTemporal("preparar-global");
      try {
        const global = join(carpeta, "gitconfig-global");
        writeFileSync(global, `[core]\n\thooksPath = ${join(carpeta, "ganchos-globales")}\n`);
        const { env } = entornoAislado(carpeta, undefined, { GIT_CONFIG_GLOBAL: global });
        const { repo } = clon(carpeta, env);
        const r = await preparar(repo, env);
        expect(r.estado, r.todo).toBe(1);
        expect(r.salida).toContain("ALTO: Tu git tiene `core.hooksPath =");
        expect(r.salida).toContain("ganchos-globales");
        expect(r.salida).toContain("configuración global");
      } finally {
        borrar(carpeta);
      }
    }, 60000);

    it("con el control instalado por preparar_clon, un push a la dirección del remoto con un dato privado se rechaza", async () => {
      const carpeta = carpetaTemporal("preparar-hook");
      try {
        const { env } = entornoAislado(carpeta);
        const { remoto, repo } = clon(carpeta, env);
        expect((await preparar(repo, env)).estado).toBe(0);
        escribir(repo, "notas.txt", `servidor en ${IP_PRIVADA}\n`);
        gitEn(repo, env, "add", "-A");
        gitEn(repo, env, "commit", "-m", "JST-1: cambio");
        const r = await lanzar("git", ["push", remoto, "jst-1"], { cwd: repo, env });
        expect(r.estado, r.todo).not.toBe(0);
        expect(r.todo).toContain("notas.txt:1: IP privada");
        expect(r.todo).toContain("No subí nada");
        expect(gitEn(carpeta, env, "--git-dir", remoto, "branch", "--list", "jst-1")).toBe("");
        // y uno limpio, nombrando la dirección, sí sale (así sube subir.py)
        gitEn(repo, env, "reset", "-q", "--hard", "HEAD~1");
        escribir(repo, "limpio.txt", "cambio limpio\n");
        gitEn(repo, env, "add", "-A");
        gitEn(repo, env, "commit", "-m", "JST-1: limpio");
        const bien = await lanzar("git", ["push", remoto, "jst-1"], { cwd: repo, env });
        expect(bien.estado, bien.todo).toBe(0);
        expect(gitEn(carpeta, env, "--git-dir", remoto, "branch", "--list", "jst-1")).toContain("jst-1");
      } finally {
        borrar(carpeta);
      }
    }, 60000);
  });
});

function spawnSyncGit(cwd: string, env: NodeJS.ProcessEnv, args: string[]) {
  return spawnSync("git", args, { cwd, env, encoding: "utf8" });
}
