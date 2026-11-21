import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CORREO_LIMPIO, CORREO_PERSONAL, apiFalsa, borrar, carpetaTemporal, configPrivada, configurarGit, conModulo, copiarScripts, datosEjemplo,
  entornoAislado, escribir, ghFalso, git as gitEn, lanzar, python, sesionFalsa, EMPRESA_ID, RAIZ,
} from "./ayudasScripts.js";

/** Un repo con remoto bare local (`remoto`) y la rama main con un commit; `repo` es su copia de trabajo. */
function repoConRemoto(carpeta: string, env: NodeJS.ProcessEnv, correo = CORREO_LIMPIO) {
  const remoto = join(carpeta, "remoto.git");
  const repo = join(carpeta, "repo");
  execFileSync("git", ["init", "--bare", "--initial-branch=main", remoto], { stdio: "pipe", env });
  execFileSync("git", ["init", "--initial-branch=main", repo], { stdio: "pipe", env });
  configurarGit(repo, env, correo);
  gitEn(repo, env, "remote", "add", "origin", remoto);
  escribir(repo, "archivo.txt", "base\n");
  gitEn(repo, env, "add", "-A");
  gitEn(repo, env, "commit", "-m", "base");
  gitEn(repo, env, "push", "origin", "main");
  return { remoto, repo };
}

const enRemoto = (carpeta: string, env: NodeJS.ProcessEnv, remoto: string, ...args: string[]) => gitEn(carpeta, env, "--git-dir", remoto, ...args);

const ESTA_EN_PRS = 'if [ "$1" = "pr" ] && [ "$2" = "list" ]; then cat "$PRS_JSON"; exit 0; fi';

describe("release con GitFlow", () => {
  /** Prepara el repo (main < develop con un commit) y la API falsa, y corre `release.py --seco` con los PRs que se le den. */
  async function releaseSeco(prs: unknown[], sinConfig = false) {
    const carpeta = carpetaTemporal("release-seco");
    const api = await apiFalsa(datosEjemplo());
    try {
      const bin = join(carpeta, "bin");
      ghFalso(bin, ESTA_EN_PRS);
      const prsJson = join(carpeta, "prs.json");
      const { casa, privado, env } = entornoAislado(carpeta, bin, { PRS_JSON: prsJson });
      sesionFalsa(casa, api.url);
      if (!sinConfig) configPrivada(privado); // con sesión hace falta la configuración privada (aquí, vacía)
      const { repo } = repoConRemoto(carpeta, env);
      gitEn(repo, env, "checkout", "-b", "develop");
      escribir(repo, "archivo.txt", "cambio\n");
      gitEn(repo, env, "commit", "-am", "cambio");
      gitEn(repo, env, "push", "origin", "develop");
      const sha = gitEn(repo, env, "rev-parse", "HEAD");
      writeFileSync(prsJson, JSON.stringify(prs.map((pr) => ({ ...(pr as object), mergeCommit: { oid: sha } }))));
      copiarScripts(repo, "scripts/release.py", "scripts/revisar.py");
      const r = await python([join(repo, "scripts/release.py"), "--seco"], { cwd: carpeta, env });
      return { ...r, api, consultasTitulos: api.llamadas.get(`/api/companies/${EMPRESA_ID}/issues`) };
    } finally {
      await api.cerrar();
      borrar(carpeta);
    }
  }

  it("ejecuta release --seco con el revisor real contra una API falsa y arma el cuerpo con los PRs que entran", async () => {
    const r = await releaseSeco([{ number: 7, title: "JST-5: Fix the header", url: "https://example.invalid/pull/7" }]);
    expect(r.estado, r.todo).toBe(0);
    expect(r.consultasTitulos).toBe(3);
    expect(r.salida).toContain("[seco] PR develop → main");
    expect(r.salida).toMatch(/\[seco\] título: Release \d{4}-\d{2}-\d{2}/);
    expect(r.salida).toContain("[#7: JST-5: Fix the header](https://example.invalid/pull/7)");
    expect(r.salida).not.toContain("hallazgos");
  }, 60000);

  it("release --seco se detiene si el texto del PR trae un título real de la instancia", async () => {
    const r = await releaseSeco([{ number: 8, title: "Migrar la base de clientes antiguos", url: "https://example.invalid/pull/8" }]);
    expect(r.estado, r.todo).toBe(1);
    expect(r.todo).toContain("título real: migrar la base de clientes");
    expect(r.todo).toContain("tiene algo privado");
    expect(r.salida).not.toContain("[seco] PR develop → main");
  }, 60000);

  it("release se detiene si hay sesión del CLI pero falta revisar.json (no revisa a ciegas)", async () => {
    const r = await releaseSeco([], true);
    expect(r.estado, r.todo).toBe(1);
    expect(r.todo).toContain("falta la configuración privada");
    expect(r.todo).toContain("No reviso a ciegas");
    expect(r.salida).not.toContain("[seco] PR develop → main");
  }, 60000);

  it("abre el PR de release develop → main sin fusionar", async () => {
    const carpeta = carpetaTemporal("release-pr");
    try {
      const { env } = entornoAislado(carpeta);
      const codigo = `
comandos = []
class Resultado:
    def __init__(self, stdout):
        self.stdout = stdout
def falso_correr(cmd, **kwargs):
    comandos.append(cmd)
    if cmd[:3] == ["gh", "pr", "list"]:
        return Resultado(b"[]")
    return Resultado(b"https://example.invalid/pull/1\\n")
m.correr = falso_correr
url = m.abrir_o_actualizar_pr("Release 2026-11-07", "## Included pull requests\\n", {}, Path(sys.argv[2]))
print(json.dumps([url, comandos[-1]]))`;
      const r = await python([...conModulo(join(RAIZ, "scripts/release.py"), codigo), carpeta], { env });
      expect(r.estado, r.todo).toBe(0);
      const [url, comando] = JSON.parse(r.salida);
      expect(url).toBe("https://example.invalid/pull/1");
      expect(comando).toEqual(expect.arrayContaining(["pr", "create", "--base", "main", "--head", "develop"]));
      expect(comando).not.toContain("merge");
    } finally {
      borrar(carpeta);
    }
  }, 60000);

  it("si ya hay un PR develop → main abierto, lo actualiza por la API REST en vez de crear otro", async () => {
    const carpeta = carpetaTemporal("release-pr-existe");
    try {
      const { env } = entornoAislado(carpeta);
      const codigo = `
comandos = []
class Resultado:
    def __init__(self, stdout):
        self.stdout = stdout
def falso_correr(cmd, **kwargs):
    comandos.append(cmd)
    if cmd[:3] == ["gh", "pr", "list"]:
        return Resultado(b'[{"number": 12, "url": "https://example.invalid/pull/12"}]')
    return Resultado(b"")
m.correr = falso_correr
url = m.abrir_o_actualizar_pr("Release 2026-11-07", "cuerpo", {}, Path(sys.argv[2]))
print(json.dumps([url, comandos[-1], Path(sys.argv[2], "release.json").read_text()]))`;
      const r = await python([...conModulo(join(RAIZ, "scripts/release.py"), codigo), carpeta], { env });
      expect(r.estado, r.todo).toBe(0);
      const [url, comando, datos] = JSON.parse(r.salida);
      expect(url).toBe("https://example.invalid/pull/12");
      expect(comando).toEqual(expect.arrayContaining(["api", "-X", "PATCH"]));
      expect(comando.join(" ")).toContain("/pulls/12");
      expect(comando).not.toContain("create");
      expect(JSON.parse(datos)).toEqual({ title: "Release 2026-11-07", body: "cuerpo" });
    } finally {
      borrar(carpeta);
    }
  }, 60000);

  it("adelanta develop a main con fast-forward cuando el release anterior lo dejó atrás", async () => {
    const carpeta = carpetaTemporal("release-ff");
    try {
      const { env } = entornoAislado(carpeta);
      const { remoto, repo } = repoConRemoto(carpeta, env);
      gitEn(repo, env, "branch", "develop");
      gitEn(repo, env, "push", "origin", "develop");
      escribir(repo, "archivo.txt", "release\n");
      gitEn(repo, env, "commit", "-am", "release");
      gitEn(repo, env, "push", "origin", "main");
      gitEn(repo, env, "fetch", "origin", "main", "develop");
      copiarScripts(repo, "scripts/release.py", "scripts/revisar.py");

      const r = await python([...conModulo(join(repo, "scripts/release.py"), "m.adelantar_develop(dict(__import__('os').environ), False)")], { env });
      expect(r.todo).toBe("");
      expect(r.estado).toBe(0);
      expect(enRemoto(carpeta, env, remoto, "rev-parse", "develop")).toBe(enRemoto(carpeta, env, remoto, "rev-parse", "main"));
    } finally {
      borrar(carpeta);
    }
  }, 60000);

  it("el push que adelanta develop lleva --no-follow-tags: un tag anotado local de main no sube con push.followTags=true", async () => {
    const carpeta = carpetaTemporal("release-tags");
    try {
      const { env } = entornoAislado(carpeta);
      const { remoto, repo } = repoConRemoto(carpeta, env);
      gitEn(repo, env, "branch", "develop");
      gitEn(repo, env, "push", "origin", "develop");
      escribir(repo, "archivo.txt", "release\n");
      gitEn(repo, env, "commit", "-am", "release");
      gitEn(repo, env, "push", "origin", "main");
      gitEn(repo, env, "config", "push.followTags", "true");
      gitEn(repo, env, "tag", "-a", "v-interno", "-m", "nota solo de este equipo");
      gitEn(repo, env, "fetch", "origin", "main", "develop");
      copiarScripts(repo, "scripts/release.py", "scripts/revisar.py");
      const r = await python([...conModulo(join(repo, "scripts/release.py"), "m.adelantar_develop(dict(__import__('os').environ), False)")], { env });
      expect(r.estado, r.todo).toBe(0);
      expect(enRemoto(carpeta, env, remoto, "rev-parse", "develop")).toBe(enRemoto(carpeta, env, remoto, "rev-parse", "main"));
      expect(enRemoto(carpeta, env, remoto, "tag", "--list")).toBe("");
    } finally {
      borrar(carpeta);
    }
  }, 60000);

  describe("con main y develop divergidos", () => {
    async function divergidos(correo: string) {
      const carpeta = carpetaTemporal("release-merge");
      const { env } = entornoAislado(carpeta);
      const { remoto, repo } = repoConRemoto(carpeta, env, correo);
      gitEn(repo, env, "checkout", "-b", "develop");
      escribir(repo, "develop.txt", "solo en develop\n");
      gitEn(repo, env, "add", "-A");
      gitEn(repo, env, "commit", "-m", "avance de develop");
      gitEn(repo, env, "push", "origin", "develop");
      gitEn(repo, env, "checkout", "main");
      escribir(repo, "main.txt", "solo en main\n"); // p. ej. el commit del release que cambia versión o notas
      gitEn(repo, env, "add", "-A");
      gitEn(repo, env, "commit", "-m", "release en main");
      gitEn(repo, env, "push", "origin", "main");
      gitEn(repo, env, "fetch", "origin", "main", "develop");
      copiarScripts(repo, "scripts/release.py", "scripts/revisar.py");
      const antes = enRemoto(carpeta, env, remoto, "rev-parse", "develop");
      const codigo = `
m.REVISOR = m.cargar_revisar().Revisor({"empresas": [], "agentes": [], "titulos": []}, {})
try:
    m.adelantar_develop(dict(__import__('os').environ), False)
except m.Alto as e:
    print(e)
    sys.exit(1)`;
      const r = await python([...conModulo(join(repo, "scripts/release.py"), codigo)], { env });
      return { carpeta, env, remoto, repo, antes, r };
    }

    it("incorpora main en develop con un merge y develop del remoto queda conteniendo main", async () => {
      const { carpeta, env, remoto, antes, r } = await divergidos(CORREO_LIMPIO);
      try {
        expect(r.estado, r.todo).toBe(0);
        const despues = enRemoto(carpeta, env, remoto, "rev-parse", "develop");
        expect(despues).not.toBe(antes);
        // develop contiene main (esto falla con exit 1 si no) y conserva su propio avance
        enRemoto(carpeta, env, remoto, "merge-base", "--is-ancestor", "main", "develop");
        enRemoto(carpeta, env, remoto, "merge-base", "--is-ancestor", antes, "develop");
        expect(enRemoto(carpeta, env, remoto, "rev-list", "--parents", "-n", "1", "develop").split(" ")).toHaveLength(3);
        expect(enRemoto(carpeta, env, remoto, "log", "-1", "--format=%ae", "develop")).toBe(CORREO_LIMPIO);
        // no deja el árbol de trabajo auxiliar registrado
        expect(gitEn(join(carpeta, "repo"), env, "worktree", "list").split("\n")).toHaveLength(1);
      } finally {
        borrar(carpeta);
      }
    }, 60000);

    it("si `git worktree add` falla, el error que se ve es ese y no otro (el finally no lo tapa)", async () => {
      const carpeta = carpetaTemporal("release-wt-falla");
      try {
        const { env: base } = entornoAislado(carpeta);
        const { remoto, repo } = repoConRemoto(carpeta, base, CORREO_LIMPIO);
        gitEn(repo, base, "checkout", "-b", "develop");
        escribir(repo, "develop.txt", "solo en develop\n");
        gitEn(repo, base, "add", "-A");
        gitEn(repo, base, "commit", "-m", "avance de develop");
        gitEn(repo, base, "push", "origin", "develop");
        gitEn(repo, base, "checkout", "main");
        escribir(repo, "main.txt", "solo en main\n");
        gitEn(repo, base, "add", "-A");
        gitEn(repo, base, "commit", "-m", "release en main");
        gitEn(repo, base, "push", "origin", "main");
        gitEn(repo, base, "fetch", "origin", "main", "develop");
        copiarScripts(repo, "scripts/release.py", "scripts/revisar.py");
        const antes = enRemoto(carpeta, base, remoto, "rev-parse", "develop");
        // Un `git` que falla solo en `worktree add`, con un mensaje propio, y en lo demás es el de verdad.
        const bin = join(carpeta, "bin-git");
        const gitReal = execFileSync("sh", ["-c", "command -v git"], { env: base, encoding: "utf8" }).trim();
        ghFalso(bin);
        writeFileSync(join(bin, "git"), `#!/bin/sh
if [ "$1" = "worktree" ] && [ "$2" = "add" ]; then echo "fallo-simulado-de-worktree-add" >&2; exit 128; fi
exec "${gitReal}" "$@"
`);
        chmodSync(join(bin, "git"), 0o755);
        const { env } = entornoAislado(carpeta, bin);
        const codigo = `
m.REVISOR = m.cargar_revisar().Revisor({"empresas": [], "agentes": [], "titulos": []}, {})
try:
    m.adelantar_develop(dict(__import__('os').environ), False)
except m.Alto as e:
    print(e)
    sys.exit(1)`;
        const r = await python([...conModulo(join(repo, "scripts/release.py"), codigo)], { env });
        expect(r.estado, r.todo).toBe(1);
        expect(r.todo).toContain("worktree add");
        expect(r.todo).toContain("fallo-simulado-de-worktree-add");
        expect(r.todo).not.toContain("worktree remove");
        expect(r.todo).not.toContain("Traceback");
        expect(enRemoto(carpeta, base, remoto, "rev-parse", "develop")).toBe(antes);
      } finally {
        borrar(carpeta);
      }
    }, 60000);

    it("no sube el merge si quedaría firmado con un correo que no se puede publicar", async () => {
      const { carpeta, env, remoto, antes, r } = await divergidos(CORREO_PERSONAL);
      try {
        expect(r.estado, r.todo).toBe(1);
        expect(r.salida).toContain("no se puede publicar");
        expect(enRemoto(carpeta, env, remoto, "rev-parse", "develop")).toBe(antes);
      } finally {
        borrar(carpeta);
      }
    }, 60000);
  });
});

describe("scripts/solo-ci.mjs (prepublishOnly)", () => {
  const SOLO_CI = join(RAIZ, "scripts/solo-ci.mjs");

  async function correr(carpeta: string, enActions: boolean, conInstancia: boolean) {
    const { env } = entornoAislado(carpeta, undefined, enActions ? { GITHUB_ACTIONS: "true" } : {});
    if (!enActions) delete env.GITHUB_ACTIONS;
    const trabajo = join(carpeta, "trabajo");
    escribir(trabajo, "package.json", "{}\n");
    if (conInstancia) escribir(trabajo, "instancia.local.ts", "export const propio = 1;\n");
    return lanzar(process.execPath, [SOLO_CI], { cwd: trabajo, env });
  }

  it("sale 1 sin GITHUB_ACTIONS=true", async () => {
    const carpeta = carpetaTemporal("solo-ci");
    try {
      const r = await correr(carpeta, false, false);
      expect(r.estado, r.todo).toBe(1);
      expect(r.errores).toContain("only published by the");
    } finally {
      borrar(carpeta);
    }
  }, 60000);

  it("sale 1 con GITHUB_ACTIONS=true si hay un instancia.local.ts en la carpeta", async () => {
    const carpeta = carpetaTemporal("solo-ci");
    try {
      const r = await correr(carpeta, true, true);
      expect(r.estado, r.todo).toBe(1);
    } finally {
      borrar(carpeta);
    }
  }, 60000);

  it("sale 1 con GITHUB_ACTIONS distinto de «true» (por ejemplo «1») aunque no haya instancia.local.ts", async () => {
    const carpeta = carpetaTemporal("solo-ci");
    try {
      const { env } = entornoAislado(carpeta, undefined, { GITHUB_ACTIONS: "1" });
      const r = await lanzar(process.execPath, [SOLO_CI], { cwd: carpeta, env });
      expect(r.estado, r.todo).toBe(1);
    } finally {
      borrar(carpeta);
    }
  }, 60000);

  it("sale 0 con GITHUB_ACTIONS=true y sin instancia.local.ts", async () => {
    const carpeta = carpetaTemporal("solo-ci");
    try {
      const r = await correr(carpeta, true, false);
      expect(r.estado, r.todo).toBe(0);
      expect(r.todo).toBe("");
    } finally {
      borrar(carpeta);
    }
  }, 60000);

  it("package.json lo corre como prepublishOnly", () => {
    const paquete = JSON.parse(readFileSync(join(RAIZ, "package.json"), "utf8"));
    expect(paquete.scripts.prepublishOnly).toBe("node scripts/solo-ci.mjs");
  });
});

describe("instalación con GitFlow", () => {
  const TAG = "v2026.1107.3";

  /** Remoto con main en el tag, `repo` (la carpeta de los scripts) y `instalado`, un clon que quedó en un commit anterior. */
  async function entorno() {
    const carpeta = carpetaTemporal("instalar");
    const bin = join(carpeta, "bin");
    ghFalso(bin);
    const npmLog = join(carpeta, "npm.log");
    writeFileSync(npmLog, "");
    writeFileSync(join(bin, "npm"), "#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"$NPM_LOG\"\n");
    chmodSync(join(bin, "npm"), 0o755);
    const instalado = join(carpeta, "instalado");
    const { privado, env } = entornoAislado(carpeta, bin, { NPM_LOG: npmLog, OFICINA_INSTALADO: instalado });
    const { remoto, repo } = repoConRemoto(carpeta, env);
    // scripts/version.mjs real: el build comprueba la versión con él.
    copiarScripts(repo, "scripts/version.mjs");
    gitEn(repo, env, "add", "-A");
    gitEn(repo, env, "commit", "-m", "versión");
    gitEn(repo, env, "push", "origin", "main");
    execFileSync("git", ["clone", remoto, instalado], { stdio: "pipe", env });
    escribir(repo, "archivo.txt", "release\n");
    gitEn(repo, env, "commit", "-am", "release");
    gitEn(repo, env, "tag", TAG);
    gitEn(repo, env, "push", "origin", "main", TAG);
    copiarScripts(repo, "scripts/instalar.py");
    const instalar = () => python([join(repo, "scripts/instalar.py")], { cwd: carpeta, env });
    const llamadasNpm = () => readFileSync(npmLog, "utf8").trim().split("\n").filter(Boolean);
    return { carpeta, env, repo, instalado, privado, instalar, llamadasNpm };
  }

  it("deja la carpeta de instalación en el tag, copia instancia.local.ts desde la privada y corre npm ci y npm run build", async () => {
    const e = await entorno();
    try {
      escribir(e.privado, "instancia.local.ts", "export const propio = 1;\n");
      const r = await e.instalar();
      expect(r.estado, r.todo).toBe(0);
      expect(r.salida).toContain("2026.1107.3");
      expect(gitEn(e.instalado, e.env, "rev-parse", "HEAD")).toBe(gitEn(e.repo, e.env, "rev-parse", `${TAG}^{commit}`));
      expect(gitEn(e.instalado, e.env, "describe", "--exact-match", "--tags")).toBe(TAG);
      expect(readFileSync(join(e.instalado, "instancia.local.ts"), "utf8")).toBe("export const propio = 1;\n");
      expect(e.llamadasNpm()).toEqual(["ci", "run build"]);
    } finally {
      borrar(e.carpeta);
    }
  }, 60000);

  it("borra instancia.local.ts de la instalación cuando ya no existe en la carpeta privada", async () => {
    const e = await entorno();
    try {
      escribir(e.privado, "instancia.local.ts", "export const propio = 1;\n");
      expect((await e.instalar()).estado).toBe(0);
      expect(existsSync(join(e.instalado, "instancia.local.ts"))).toBe(true);
      borrar(join(e.privado, "instancia.local.ts"));
      const r = await e.instalar();
      expect(r.estado, r.todo).toBe(0);
      expect(existsSync(join(e.instalado, "instancia.local.ts"))).toBe(false);
      expect(e.llamadasNpm()).toEqual(["ci", "run build", "ci", "run build"]);
    } finally {
      borrar(e.carpeta);
    }
  }, 60000);

  it("sin instancia.local.ts en la privada deja el de ejemplo y no copia nada", async () => {
    const e = await entorno();
    try {
      const r = await e.instalar();
      expect(r.estado, r.todo).toBe(0);
      expect(existsSync(join(e.instalado, "instancia.local.ts"))).toBe(false);
    } finally {
      borrar(e.carpeta);
    }
  }, 60000);

  it("no instala nada si main no está exactamente en un tag de release", async () => {
    const e = await entorno();
    try {
      escribir(e.repo, "archivo.txt", "después del release\n");
      gitEn(e.repo, e.env, "commit", "-am", "sin tag");
      gitEn(e.repo, e.env, "push", "origin", "main");
      const r = await e.instalar();
      expect(r.estado, r.todo).toBe(1);
      expect(r.salida).toContain("main no está exactamente en un tag de release");
      expect(e.llamadasNpm()).toEqual([]);
    } finally {
      borrar(e.carpeta);
    }
  }, 60000);

  it("--seco no escribe nada", async () => {
    const e = await entorno();
    try {
      escribir(e.privado, "instancia.local.ts", "export const propio = 1;\n");
      const antes = gitEn(e.instalado, e.env, "rev-parse", "HEAD");
      const r = await python([join(e.repo, "scripts/instalar.py"), "--seco"], { cwd: e.carpeta, env: e.env });
      expect(r.estado, r.todo).toBe(0);
      expect(r.salida).toContain("[seco]");
      expect(gitEn(e.instalado, e.env, "rev-parse", "HEAD")).toBe(antes);
      expect(existsSync(join(e.instalado, "instancia.local.ts"))).toBe(false);
      expect(e.llamadasNpm()).toEqual([]);
    } finally {
      borrar(e.carpeta);
    }
  }, 60000);
});
