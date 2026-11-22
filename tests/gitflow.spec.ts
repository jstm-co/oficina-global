import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
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

  async function correr(carpeta: string, actions: string | null) {
    const { env } = entornoAislado(carpeta, undefined, actions === null ? {} : { GITHUB_ACTIONS: actions });
    if (actions === null) delete env.GITHUB_ACTIONS;
    const trabajo = join(carpeta, "trabajo");
    escribir(trabajo, "package.json", "{}\n");
    return lanzar(process.execPath, [SOLO_CI], { cwd: trabajo, env });
  }

  it("sale 1 sin GITHUB_ACTIONS=true", async () => {
    const carpeta = carpetaTemporal("solo-ci");
    try {
      const r = await correr(carpeta, null);
      expect(r.estado, r.todo).toBe(1);
      expect(r.errores).toContain("only published by the");
    } finally {
      borrar(carpeta);
    }
  }, 60000);

  it("sale 1 con GITHUB_ACTIONS distinto de «true» (por ejemplo «1»)", async () => {
    const carpeta = carpetaTemporal("solo-ci");
    try {
      const r = await correr(carpeta, "1");
      expect(r.estado, r.todo).toBe(1);
    } finally {
      borrar(carpeta);
    }
  }, 60000);

  it("sale 0 con GITHUB_ACTIONS=true", async () => {
    const carpeta = carpetaTemporal("solo-ci");
    try {
      const r = await correr(carpeta, "true");
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

describe("instalación: el paquete que publicó GitHub, sin compilar (JST-425)", () => {
  const VERSION = "2026.1107.3";
  const TAG = `v${VERSION}`;
  const NOMBRE = "paperclip-plugin-prueba";

  // Un `npm` falso: anota cada llamada; `pack` arma el .tgz desde la carpeta `$NPM_PAQUETE` (que trae `package/…`),
  // como lo bajaría del registro; lo demás (`install`) termina con `$NPM_INSTALL_ESTADO`.
  const NPM_FALSO = `#!/bin/sh
printf '%s\\n' "$*" >> "$NPM_LOG"
if [ "$1" = "pack" ]; then
  if [ -n "$NPM_SIN_PAQUETE" ]; then echo "npm error code E404" >&2; exit 1; fi
  tar -czf "$4/paquete.tgz" -C "$NPM_PAQUETE" package
  printf '[{"filename":"paquete.tgz"}]\\n'
  exit 0
fi
exit \${NPM_INSTALL_ESTADO:-0}
`;

  interface Paquete { nombre?: string; version?: string; versionManifiesto?: string; archivos?: Record<string, string>; sin?: string[]; opcionales?: Record<string, string> }

  /** Deja en `dir/package/` un paquete como el que publica el CI: package.json, dist/ y lo que se pida. */
  function armarPaquete(dir: string, p: Paquete = {}) {
    borrar(dir);
    const version = p.version ?? VERSION;
    const archivos: Record<string, string> = {
      "package.json": JSON.stringify({ name: p.nombre ?? NOMBRE, version, optionalDependencies: p.opcionales }),
      "dist/manifest.js": `export default { id: "prueba", version: "${p.versionManifiesto ?? version}" };\n`,
      "dist/worker.js": "// worker\n",
      "dist/ui/index.js": "// interfaz\n",
      "generador/motor.py": "# motor\n",
      "README.md": "# Prueba\n",
      ...p.archivos,
    };
    for (const [ruta, texto] of Object.entries(archivos)) if (!p.sin?.includes(ruta)) escribir(join(dir, "package"), ruta, texto);
  }

  /** Remoto con main en el tag, `repo` (la carpeta de los scripts, con su package.json) y la carpeta de instalación, que todavía no existe. */
  async function entorno(extra: NodeJS.ProcessEnv = {}) {
    const carpeta = carpetaTemporal("instalar");
    const bin = join(carpeta, "bin");
    ghFalso(bin);
    const npmLog = join(carpeta, "npm.log");
    writeFileSync(npmLog, "");
    writeFileSync(join(bin, "npm"), NPM_FALSO);
    chmodSync(join(bin, "npm"), 0o755);
    const instalado = join(carpeta, "instalado");
    const paquete = join(carpeta, "registro");
    armarPaquete(paquete);
    const { privado, env } = entornoAislado(carpeta, bin, { NPM_LOG: npmLog, NPM_PAQUETE: paquete, OFICINA_INSTALADO: instalado, ...extra });
    const { repo } = repoConRemoto(carpeta, env);
    escribir(repo, "package.json", JSON.stringify({ name: NOMBRE, version: "0.0.0" }));
    gitEn(repo, env, "add", "-A");
    gitEn(repo, env, "commit", "-m", "release");
    gitEn(repo, env, "tag", TAG);
    gitEn(repo, env, "push", "origin", "main", TAG);
    copiarScripts(repo, "scripts/instalar.py");
    const instalar = (...args: string[]) => python([join(repo, "scripts/instalar.py"), ...args], { cwd: carpeta, env });
    const llamadasNpm = () => readFileSync(npmLog, "utf8").trim().split("\n").filter(Boolean);
    const leer = (ruta: string) => readFileSync(join(instalado, ruta), "utf8");
    return { carpeta, env, repo, instalado, privado, paquete, instalar, llamadasNpm, leer };
  }

  it("deja el paquete publicado en una carpeta de instalación nueva, sin npm ci ni npm run build", async () => {
    const e = await entorno();
    try {
      const r = await e.instalar();
      expect(r.estado, r.todo).toBe(0);
      expect(r.salida).toContain(`quedó en ${VERSION}`);
      expect(r.salida).toContain("sin compilar nada aquí");
      expect(e.leer("dist/worker.js")).toBe("// worker\n");
      expect(JSON.parse(e.leer("package.json")).version).toBe(VERSION);
      const npm = e.llamadasNpm();
      expect(npm).toHaveLength(1);
      expect(npm[0]).toMatch(new RegExp(`^pack ${NOMBRE}@${VERSION.replace(/\./g, "\\.")} --pack-destination \\S+ --json --ignore-scripts$`));
      expect(existsSync(join(e.instalado, "dist/worker.js.instalando"))).toBe(false);
    } finally {
      borrar(e.carpeta);
    }
  }, 60000);

  it("sobre una instalación anterior: actualiza, borra de dist/ y generador/ lo que el paquete ya no trae y no toca lo demás", async () => {
    const e = await entorno();
    try {
      // Lo que había: una versión anterior, audios publicados, los datos de la instancia publicados y cosas ajenas al paquete.
      escribir(e.instalado, "package.json", JSON.stringify({ name: NOMBRE, version: "2026.1101.0" }));
      escribir(e.instalado, "dist/worker.js", "// worker viejo\n");
      escribir(e.instalado, "dist/trozo-viejo.js", "// ya no existe\n");
      escribir(e.instalado, "dist/ui/viejo.css", "x\n");
      escribir(e.instalado, "generador/motor_viejo.py", "# ya no existe\n");
      escribir(e.instalado, "dist/ui/voces/indice.json", "{}\n");
      escribir(e.instalado, "dist/ui/voces/vivo/frase.mp3", "audio\n");
      escribir(e.instalado, "dist/ui/instancia.json", '{"aspectoFijo":{}}\n');
      escribir(e.instalado, "node_modules/algo/index.js", "// dependencia\n");
      escribir(e.instalado, "notas.txt", "mías\n");
      const r = await e.instalar();
      expect(r.estado, r.todo).toBe(0);
      expect(e.leer("dist/worker.js")).toBe("// worker\n");
      expect(JSON.parse(e.leer("package.json")).version).toBe(VERSION);
      for (const borrado of ["dist/trozo-viejo.js", "dist/ui/viejo.css", "generador/motor_viejo.py"]) expect(existsSync(join(e.instalado, borrado)), borrado).toBe(false);
      expect(r.salida).toContain("borré 3 que el paquete ya no trae");
      expect(e.leer("dist/ui/voces/indice.json")).toBe("{}\n");
      expect(e.leer("dist/ui/voces/vivo/frase.mp3")).toBe("audio\n");
      expect(e.leer("dist/ui/instancia.json")).toBe('{"aspectoFijo":{}}\n');
      expect(e.leer("node_modules/algo/index.js")).toBe("// dependencia\n");
      expect(e.leer("notas.txt")).toBe("mías\n");
      expect(e.llamadasNpm()).toHaveLength(1); // solo `pack`
    } finally {
      borrar(e.carpeta);
    }
  }, 60000);

  it("instala una dependencia opcional solo si falta o cambió de versión, con npm install --omit=dev y sin scripts", async () => {
    const e = await entorno();
    try {
      armarPaquete(e.paquete, { opcionales: { "motor-de-voz": "2.0.1" } });
      const primera = await e.instalar();
      expect(primera.estado, primera.todo).toBe(0);
      expect(e.llamadasNpm()[1]).toBe("install --omit=dev --omit=peer --ignore-scripts --no-audit --no-fund --no-package-lock");
      // Ya está en esa versión: no se vuelve a instalar.
      escribir(e.instalado, "node_modules/motor-de-voz/package.json", JSON.stringify({ name: "motor-de-voz", version: "2.0.1" }));
      const segunda = await e.instalar();
      expect(segunda.estado, segunda.todo).toBe(0);
      expect(e.llamadasNpm().filter((l) => l.startsWith("install"))).toHaveLength(1);
      // Cambió la versión pedida: se instala.
      armarPaquete(e.paquete, { opcionales: { "motor-de-voz": "2.1.0" } });
      const tercera = await e.instalar();
      expect(tercera.estado, tercera.todo).toBe(0);
      expect(e.llamadasNpm().filter((l) => l.startsWith("install"))).toHaveLength(2);
      expect(e.llamadasNpm().some((l) => l === "ci" || l.startsWith("run"))).toBe(false);
    } finally {
      borrar(e.carpeta);
    }
  }, 60000);

  it("si falla la instalación de la dependencia opcional termina en 1 y lo dice", async () => {
    const e = await entorno({ NPM_INSTALL_ESTADO: "1" });
    try {
      armarPaquete(e.paquete, { opcionales: { "motor-de-voz": "2.0.1" } });
      const r = await e.instalar();
      expect(r.estado, r.todo).toBe(1);
      expect(r.salida).toContain("falló la instalación de las dependencias opcionales");
    } finally {
      borrar(e.carpeta);
    }
  }, 60000);

  it("no escribe en una carpeta con archivos que no es una instalación del plugin", async () => {
    const e = await entorno();
    try {
      escribir(e.instalado, "package.json", JSON.stringify({ name: "otra-cosa" }));
      escribir(e.instalado, "dist/importante.js", "no tocar\n");
      const r = await e.instalar();
      expect(r.estado, r.todo).toBe(1);
      expect(r.salida).toContain("no es una instalación de");
      expect(e.leer("dist/importante.js")).toBe("no tocar\n");
      expect(existsSync(join(e.instalado, "dist/worker.js"))).toBe(false);
      expect(e.llamadasNpm()).toEqual([]);

      borrar(join(e.instalado, "package.json"));
      const sinPaquete = await e.instalar();
      expect(sinPaquete.estado, sinPaquete.todo).toBe(1);
      expect(e.leer("dist/importante.js")).toBe("no tocar\n");
    } finally {
      borrar(e.carpeta);
    }
  }, 60000);

  it("no instala sobre una copia de git del repo: ahí borraría código fuente", async () => {
    const e = await entorno();
    try {
      escribir(e.instalado, "package.json", JSON.stringify({ name: NOMBRE, version: "0.0.0" }));
      escribir(e.instalado, ".git", "gitdir: en-otra-parte\n");
      escribir(e.instalado, "generador/plan.ts", "// código fuente\n");
      const r = await e.instalar();
      expect(r.estado, r.todo).toBe(1);
      expect(r.salida).toContain("es una copia de git");
      expect(e.leer("generador/plan.ts")).toBe("// código fuente\n");
      expect(e.llamadasNpm()).toEqual([]);
    } finally {
      borrar(e.carpeta);
    }
  }, 60000);

  it("si dist/ui/voces es un enlace simbólico (a los audios, en otra carpeta), no lo borra", async () => {
    const e = await entorno();
    try {
      escribir(e.instalado, "package.json", JSON.stringify({ name: NOMBRE, version: "2026.1101.0" }));
      escribir(e.carpeta, "audios/indice.json", "{}\n");
      escribir(e.instalado, "dist/ui/otro.js", "x\n");
      symlinkSync(join(e.carpeta, "audios"), join(e.instalado, "dist/ui/voces"));
      const r = await e.instalar();
      expect(r.estado, r.todo).toBe(0);
      expect(e.leer("dist/ui/voces/indice.json")).toBe("{}\n");
      expect(existsSync(join(e.instalado, "dist/ui/otro.js"))).toBe(false);
    } finally {
      borrar(e.carpeta);
    }
  }, 60000);

  it("avisa si en la carpeta privada quedó un instancia.local.ts de antes", async () => {
    const e = await entorno();
    try {
      escribir(e.privado, "instancia.local.ts", "export const viejo = 1;\n");
      const r = await e.instalar();
      expect(r.estado, r.todo).toBe(0);
      expect(r.salida).toContain("instancia.local.ts");
      expect(r.salida).toContain("instancia.json");
    } finally {
      borrar(e.carpeta);
    }
  }, 60000);

  for (const [caso, paquete, mensaje] of [
    ["otro nombre", { nombre: "paquete-de-otro" }, "el paquete dice paquete-de-otro@"],
    ["otra versión", { version: "2026.1101.0" }, "el paquete dice paperclip-plugin-prueba@2026.1101.0"],
    ["un manifiesto compilado con otra versión", { versionManifiesto: "0.0.1" }, "El manifiesto compilado del paquete no dice la versión"],
    ["sin dist/worker.js", { sin: ["dist/worker.js"] }, "le falta: dist/worker.js"],
  ] as [string, Paquete, string][]) {
    it(`no instala nada si lo que baja de npm viene con ${caso}`, async () => {
      const e = await entorno();
      try {
        escribir(e.instalado, "package.json", JSON.stringify({ name: NOMBRE, version: "2026.1101.0" }));
        escribir(e.instalado, "dist/worker.js", "// worker viejo\n");
        armarPaquete(e.paquete, paquete);
        const r = await e.instalar();
        expect(r.estado, r.todo).toBe(1);
        expect(r.salida).toContain(mensaje);
        expect(r.salida).toContain("No instalo nada");
        expect(e.leer("dist/worker.js")).toBe("// worker viejo\n");
      } finally {
        borrar(e.carpeta);
      }
    }, 60000);
  }

  it("si npm todavía no tiene la versión, termina en 1 y pide volver a intentarlo", async () => {
    const e = await entorno({ NPM_SIN_PAQUETE: "1" });
    try {
      const r = await e.instalar();
      expect(r.estado, r.todo).toBe(1);
      expect(r.salida).toContain("No pude bajar");
      expect(r.salida).toContain("vuelve a intentarlo");
      expect(existsSync(e.instalado)).toBe(false);
    } finally {
      borrar(e.carpeta);
    }
  }, 60000);

  it("no instala nada si main no está exactamente en un tag de release", async () => {
    const e = await entorno();
    try {
      escribir(e.repo, "archivo.txt", "después del release\n");
      gitEn(e.repo, e.env, "add", "archivo.txt");
      gitEn(e.repo, e.env, "commit", "-m", "sin tag");
      gitEn(e.repo, e.env, "push", "origin", "main");
      const r = await e.instalar();
      expect(r.estado, r.todo).toBe(1);
      expect(r.salida).toContain("main no está exactamente en un tag de release");
      expect(e.llamadasNpm()).toEqual([]);
    } finally {
      borrar(e.carpeta);
    }
  }, 60000);

  it("--seco no baja ni escribe nada", async () => {
    const e = await entorno();
    try {
      const r = await e.instalar("--seco");
      expect(r.estado, r.todo).toBe(0);
      expect(r.salida).toContain("[seco]");
      expect(r.salida).toContain(`${NOMBRE}@${VERSION}`);
      expect(existsSync(e.instalado)).toBe(false);
      expect(e.llamadasNpm()).toEqual([]);
    } finally {
      borrar(e.carpeta);
    }
  }, 60000);

  it("el instalador no compila: su código no llama a npm ci ni a npm run build", () => {
    const fuente = readFileSync(join(RAIZ, "scripts/instalar.py"), "utf8").replace(/"""[\s\S]*?"""/, "");
    expect(fuente).not.toMatch(/"ci"|"build"/);
  });
});
