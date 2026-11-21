import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CORREO_LIMPIO, CORREO_PERSONAL, IP_PRIVADA, RAIZ, RUTA_PERSONAL, apiFalsa, borrar, carpetaTemporal, configPrivada, configurarGit, copiarScripts,
  datosEjemplo, entornoAislado, escribir, git as gitEn, lanzar, sesionFalsa, type DatosApi,
} from "./ayudasScripts.js";

interface Repo {
  carpeta: string;
  env: NodeJS.ProcessEnv;
  remoto: string;
  repo: string;
  /** La caché de los datos de la instancia que deja el control (dentro del .git). */
  cache: string;
  /** La API falsa de la instancia, si hay sesión. */
  api: Awaited<ReturnType<typeof apiFalsa>> | null;
  enRemoto: (...args: string[]) => string;
}

interface Opciones {
  /** Con `api`: deja la sesión del CLI apuntando a esta API falsa. */
  api?: DatosApi;
  /** `revisar.json` de la carpeta privada; sin esto no hay archivo. */
  config?: unknown;
}

/**
 * Repo temporal con remoto bare local, `core.hooksPath` a una copia de scripts/hooks, y develop ya subido.
 * El control instalado va sin commitear, como una carpeta de trabajo normal (sin `oficina_revisar.py`: usa scripts/revisar.py del repo).
 */
async function conRepo(opciones: Opciones, fn: (r: Repo) => Promise<void>) {
  const carpeta = carpetaTemporal("pre-push");
  const api = opciones.api ? await apiFalsa(opciones.api) : null;
  try {
    const { casa, privado, env } = entornoAislado(carpeta);
    if (api) sesionFalsa(casa, api.url);
    if (opciones.config !== undefined) configPrivada(privado, opciones.config);
    const remoto = join(carpeta, "remoto.git");
    const repo = join(carpeta, "repo");
    execFileSync("git", ["init", "--bare", "--initial-branch=develop", remoto], { stdio: "pipe", env });
    execFileSync("git", ["init", "--initial-branch=develop", repo], { stdio: "pipe", env });
    configurarGit(repo, env);
    gitEn(repo, env, "remote", "add", "origin", remoto);
    escribir(repo, "archivo.txt", "base\n");
    gitEn(repo, env, "add", "-A");
    gitEn(repo, env, "commit", "-m", "base");
    copiarScripts(repo, "scripts/revisar.py", "scripts/hooks");
    chmodSync(join(repo, "scripts/hooks/pre-push"), 0o755);
    gitEn(repo, env, "config", "core.hooksPath", join(repo, "scripts/hooks"));
    // A develop no se sube directo, aunque no traiga nada privado: entra por pull request.
    const directo = spawnSync("git", ["push", "origin", "develop"], { cwd: repo, env, encoding: "utf8" });
    expect(directo.status, directo.stdout + directo.stderr).not.toBe(0);
    expect(directo.stdout + directo.stderr).toContain("no se sube directo a develop");
    expect(gitEn(carpeta, env, "--git-dir", remoto, "branch", "--list", "develop")).toBe("");
    gitEn(repo, env, "push", "--no-verify", "origin", "develop");
    await fn({ carpeta, env, remoto, repo, cache: join(repo, ".git/oficina-revisar-cache.json"), api, enRemoto: (...args) => gitEn(carpeta, env, "--git-dir", remoto, ...args) });
  } finally {
    await api?.cerrar();
    borrar(carpeta);
  }
}

/** Un commit en una rama nueva `rama` a partir de develop. */
function commitEnRama(r: Repo, rama: string, archivo: [string, string | Uint8Array] = ["tarea.txt", "cambio limpio de la tarea\n"], mensaje = "JST-1: cambio", env = r.env) {
  gitEn(r.repo, r.env, "checkout", "-b", rama, "develop");
  escribir(r.repo, archivo[0], archivo[1]);
  gitEn(r.repo, r.env, "add", "-A");
  gitEn(r.repo, env, "commit", "-m", mensaje);
}

describe("control pre-push", () => {
  interface Caso {
    archivo?: [string, string | Uint8Array];
    mensaje?: string;
    correoAutor?: string;
    empujarDosVeces?: boolean;
    /** Commits previos de la rama; lo que dejen en el índice entra en el commit principal. */
    antes?: (repo: string, env: NodeJS.ProcessEnv) => void;
    gitattributes?: string;
  }

  async function empujar(caso: Caso, opciones: Opciones = {}) {
    let resultado!: Awaited<ReturnType<typeof lanzar>> & { rama: string; segundo: Awaited<ReturnType<typeof lanzar>> | null };
    await conRepo(opciones, async (r) => {
      gitEn(r.repo, r.env, "checkout", "-b", "jst-1");
      if (caso.gitattributes) {
        escribir(r.repo, ".gitattributes", caso.gitattributes);
        gitEn(r.repo, r.env, "add", "-A");
        gitEn(r.repo, r.env, "commit", "-m", "JST-1: atributos");
      }
      caso.antes?.(r.repo, r.env);
      const [ruta, texto] = caso.archivo ?? ["tarea.txt", "cambio limpio de la tarea\n"];
      escribir(r.repo, ruta, texto);
      gitEn(r.repo, r.env, "add", "-A");
      gitEn(r.repo, caso.correoAutor ? { ...r.env, GIT_AUTHOR_EMAIL: caso.correoAutor } : r.env, "commit", "-m", caso.mensaje ?? "JST-1: cambio");
      const empuje = await lanzar("git", ["push", "origin", "jst-1"], { cwd: r.repo, env: r.env });
      const rama = r.enRemoto("branch", "--list", "jst-1");
      let segundo = null;
      if (caso.empujarDosVeces) {
        escribir(r.repo, "tarea.txt", "segundo cambio limpio\n");
        gitEn(r.repo, r.env, "commit", "-am", "JST-1: otro");
        segundo = await lanzar("git", ["push", "origin", "jst-1"], { cwd: r.repo, env: r.env });
      }
      resultado = { ...empuje, rama, segundo };
    });
    return resultado;
  }

  it("un push de una rama limpia sale bien y la rama llega al remoto", async () => {
    const r = await empujar({});
    expect(r.estado, r.todo).toBe(0);
    expect(r.rama).toContain("jst-1");
    // sin sesión ni configuración privada el control lo avisa y revisa con los patrones fijos
    expect(r.todo).toContain("reviso solo con los patrones fijos");
  }, 60000);

  it("un segundo push (rama que ya existe en el remoto) también sale bien", async () => {
    const r = await empujar({ empujarDosVeces: true });
    expect(r.estado, r.todo).toBe(0);
    expect(r.segundo?.estado, r.segundo?.todo).toBe(0);
  }, 60000);

  it("se rechaza un push con un archivo que trae un dato privado y el remoto no recibe la rama", async () => {
    const r = await empujar({ archivo: ["notas.txt", `servidor en ${IP_PRIVADA}\n`] });
    expect(r.estado, r.todo).not.toBe(0);
    expect(r.todo).toContain("notas.txt:1: IP privada");
    expect(r.todo).toContain("No subí nada");
    expect(r.rama).toBe("");
  }, 60000);

  it("se rechaza un push con una ruta de la carpeta personal en un archivo", async () => {
    const r = await empujar({ archivo: ["notas.txt", `abre ${RUTA_PERSONAL}/x\n`] });
    expect(r.estado, r.todo).not.toBe(0);
    expect(r.todo).toContain("ruta de la carpeta personal");
    expect(r.rama).toBe("");
  }, 60000);

  it("se rechaza un push con un commit firmado con un correo no permitido", async () => {
    const r = await empujar({ correoAutor: CORREO_PERSONAL });
    expect(r.estado, r.todo).not.toBe(0);
    expect(r.todo).toContain("correo del autor");
    expect(r.todo).toContain("No subí nada");
    expect(r.rama).toBe("");
  }, 60000);

  it("se rechaza un push con un correo en el mensaje de un commit", async () => {
    const r = await empujar({ mensaje: `JST-1: avisar a ${CORREO_PERSONAL}` });
    expect(r.estado, r.todo).not.toBe(0);
    expect(r.todo).toMatch(/commit [0-9a-f]{7}:1: correo/);
    expect(r.rama).toBe("");
  }, 60000);

  it("acepta la firma noreply de GitHub", async () => {
    const r = await empujar({ correoAutor: CORREO_LIMPIO });
    expect(r.estado, r.todo).toBe(0);
    expect(r.rama).toContain("jst-1");
  }, 60000);

  it("borrar una rama del remoto no dispara el control", async () => {
    await conRepo({}, async (r) => {
      gitEn(r.repo, r.env, "push", "--no-verify", "origin", "develop:jst-9");
      const borrado = await lanzar("git", ["push", "origin", ":jst-9"], { cwd: r.repo, env: r.env });
      expect(borrado.estado, borrado.todo).toBe(0);
      expect(r.enRemoto("branch", "--list", "jst-9")).toBe("");
    });
  }, 60000);

  // ---- regresiones que encontró la revisión independiente (JST-419) ----

  it("commit intermedio: un commit agrega un archivo con un dato privado y el siguiente lo borra → el push se rechaza", async () => {
    const r = await empujar({
      antes: (repo, env) => {
        escribir(repo, "secreto.txt", `servidor en ${IP_PRIVADA}\n`);
        gitEn(repo, env, "add", "-A");
        gitEn(repo, env, "commit", "-m", "JST-1: agrega");
        gitEn(repo, env, "rm", "-q", "secreto.txt");
      },
    });
    expect(r.estado, r.todo).not.toBe(0);
    expect(r.todo).toContain("secreto.txt:1: IP privada");
    expect(r.todo).toContain("No subí nada");
    expect(r.rama).toBe("");
  }, 60000);

  it("export-ignore en .gitattributes no esconde una carpeta con un dato privado", async () => {
    const r = await empujar({ gitattributes: "interno export-ignore\n", archivo: ["interno/notas.txt", `servidor en ${IP_PRIVADA}\n`] });
    expect(r.estado, r.todo).not.toBe(0);
    expect(r.todo).toContain("interno/notas.txt:1: IP privada");
    expect(r.rama).toBe("");
  }, 60000);

  it("un nombre de archivo con un dato privado y un binario fuera de las carpetas permitidas se rechazan", async () => {
    const nombre = await empujar({ archivo: [`servidor-${IP_PRIVADA}.txt`, "limpio\n"] });
    expect(nombre.estado, nombre.todo).not.toBe(0);
    expect(nombre.todo).toContain(`servidor-${IP_PRIVADA}.txt: en el nombre: IP privada`);
    const binario = await empujar({ archivo: ["datos.bin", new Uint8Array([0x00, 0xff, 0x10])] });
    expect(binario.estado, binario.todo).not.toBe(0);
    expect(binario.todo).toContain("datos.bin: no es texto UTF-8");
    const permitido = await empujar({ archivo: ["src/ui/assets/imagen.png", new Uint8Array([0x89, 0x50, 0xff, 0x00])] });
    expect(permitido.estado, permitido.todo).toBe(0);
  }, 120000);

  it("segundo remoto: un commit que ya está en otro remoto (interno) se revisa igual al subirlo a origin", async () => {
    await conRepo({}, async (r) => {
      const interno = join(r.carpeta, "interno.git");
      execFileSync("git", ["init", "--bare", "--initial-branch=develop", interno], { stdio: "pipe", env: r.env });
      gitEn(r.repo, r.env, "remote", "add", "interno", interno);
      gitEn(r.repo, r.env, "push", "--no-verify", "interno", "develop");
      commitEnRama(r, "jst-1", ["tarea.txt", "cambio\n"], "JST-1: firmado mal", { ...r.env, GIT_AUTHOR_EMAIL: CORREO_PERSONAL });
      gitEn(r.repo, r.env, "push", "--no-verify", "interno", "jst-1");
      // ya existe en refs/remotes/interno/jst-1, así que `--not --remotes` (de todos) lo daría por publicado
      expect(gitEn(r.repo, r.env, "branch", "-r", "--list", "interno/jst-1")).toContain("interno/jst-1");
      const r1 = await lanzar("git", ["push", "origin", "jst-1"], { cwd: r.repo, env: r.env });
      expect(r1.estado, r1.todo).not.toBe(0);
      expect(r1.todo).toContain("correo del autor");
      expect(r.enRemoto("branch", "--list", "jst-1")).toBe("");
      // al propio interno sí puede subirse (ya lo tiene: no hay nada nuevo para él)
      const r2 = await lanzar("git", ["push", "interno", "jst-1"], { cwd: r.repo, env: r.env });
      expect(r2.estado, r2.todo).toBe(0);
    });
  }, 60000);

  it("segundo remoto: un archivo con un dato privado que ya está en otro remoto también se rechaza al subirlo a origin", async () => {
    await conRepo({}, async (r) => {
      const interno = join(r.carpeta, "interno.git");
      execFileSync("git", ["init", "--bare", "--initial-branch=develop", interno], { stdio: "pipe", env: r.env });
      gitEn(r.repo, r.env, "remote", "add", "interno", interno);
      commitEnRama(r, "jst-1", ["notas.txt", `servidor en ${IP_PRIVADA}\n`]);
      gitEn(r.repo, r.env, "push", "--no-verify", "interno", "jst-1");
      const r1 = await lanzar("git", ["push", "origin", "jst-1"], { cwd: r.repo, env: r.env });
      expect(r1.estado, r1.todo).not.toBe(0);
      expect(r1.todo).toContain("notas.txt:1: IP privada");
      expect(r.enRemoto("branch", "--list", "jst-1")).toBe("");
    });
  }, 60000);

  it("el nombre de la rama con el nombre de una empresa de la instancia se rechaza", async () => {
    await conRepo({ api: datosEjemplo(), config: {} }, async (r) => {
      commitEnRama(r, "empresa-confidencial-arreglo");
      const r1 = await lanzar("git", ["push", "origin", "empresa-confidencial-arreglo"], { cwd: r.repo, env: r.env });
      expect(r1.estado, r1.todo).not.toBe(0);
      expect(r1.todo).toContain("empresa-confidencial-arreglo: en el nombre: empresa Empresa Confidencial");
      expect(r1.todo).toContain("No subí nada");
      expect(r.enRemoto("branch", "--list")).not.toContain("empresa-confidencial");
      // una rama con otro nombre sale bien con la misma sesión
      gitEn(r.repo, r.env, "branch", "-m", "jst-1");
      const r2 = await lanzar("git", ["push", "origin", "jst-1"], { cwd: r.repo, env: r.env });
      expect(r2.estado, r2.todo).toBe(0);
    });
  }, 60000);

  it("un tag anotado con un dato privado en su mensaje se rechaza; uno limpio sale", async () => {
    await conRepo({}, async (r) => {
      gitEn(r.repo, r.env, "tag", "-a", "v1", "-m", `versión de ${IP_PRIVADA}`, "develop");
      const malo = await lanzar("git", ["push", "origin", "v1"], { cwd: r.repo, env: r.env });
      expect(malo.estado, malo.todo).not.toBe(0);
      expect(malo.todo).toMatch(/tag [0-9a-f]{7}:\d+: IP privada/);
      expect(r.enRemoto("tag", "--list")).toBe("");
      gitEn(r.repo, r.env, "tag", "-a", "v2", "-m", "versión limpia", "develop");
      const bueno = await lanzar("git", ["push", "origin", "v2"], { cwd: r.repo, env: r.env });
      expect(bueno.estado, bueno.todo).toBe(0);
      expect(r.enRemoto("tag", "--list")).toBe("v2");
    });
  }, 60000);

  it("el nombre de un tag con el nombre de una empresa se rechaza", async () => {
    await conRepo({ api: datosEjemplo(), config: {} }, async (r) => {
      gitEn(r.repo, r.env, "tag", "-a", "empresa-confidencial-v1", "-m", "limpio", "develop");
      const malo = await lanzar("git", ["push", "origin", "empresa-confidencial-v1"], { cwd: r.repo, env: r.env });
      expect(malo.estado, malo.todo).not.toBe(0);
      expect(malo.todo).toContain("empresa-confidencial-v1: en el nombre: empresa Empresa Confidencial");
      expect(r.enRemoto("tag", "--list")).toBe("");
    });
  }, 60000);

  describe("falla cerrado", () => {
    it("con sesión del CLI pero sin revisar.json el push se rechaza", async () => {
      await conRepo({ api: datosEjemplo() }, async (r) => {
        commitEnRama(r, "jst-1");
        const r1 = await lanzar("git", ["push", "origin", "jst-1"], { cwd: r.repo, env: r.env });
        expect(r1.estado, r1.todo).not.toBe(0);
        expect(r1.todo).toContain("falta la configuración privada");
        expect(r1.todo).toContain("No reviso a ciegas");
        expect(r.enRemoto("branch", "--list", "jst-1")).toBe("");
      });
    }, 60000);

    it("con revisar.json pero sin sesión del CLI el push se rechaza", async () => {
      await conRepo({ config: {} }, async (r) => {
        commitEnRama(r, "jst-1");
        const r1 = await lanzar("git", ["push", "origin", "jst-1"], { cwd: r.repo, env: r.env });
        expect(r1.estado, r1.todo).not.toBe(0);
        expect(r1.todo).toContain("no hay sesión del CLI");
        expect(r.enRemoto("branch", "--list", "jst-1")).toBe("");
      });
    }, 60000);

    it("si la API devuelve 0 empresas el push se rechaza y no queda caché", async () => {
      await conRepo({ api: { empresas: [] }, config: {} }, async (r) => {
        commitEnRama(r, "jst-1");
        const r1 = await lanzar("git", ["push", "origin", "jst-1"], { cwd: r.repo, env: r.env });
        expect(r1.estado, r1.todo).not.toBe(0);
        expect(r1.todo).toContain("no devolvió ninguna empresa");
        expect(r.enRemoto("branch", "--list", "jst-1")).toBe("");
        expect(existsSync(r.cache)).toBe(false);
      });
    }, 60000);
  });

  describe("caché de los datos de la instancia", () => {
    it("un push sin sesión no deja caché", async () => {
      await conRepo({}, async (r) => {
        commitEnRama(r, "jst-1");
        const r1 = await lanzar("git", ["push", "origin", "jst-1"], { cwd: r.repo, env: r.env });
        expect(r1.estado, r1.todo).toBe(0);
        expect(existsSync(r.cache)).toBe(false);
      });
    }, 60000);

    it("un push con sesión deja oficina-revisar-cache.json dentro del .git, con permisos 600 y con empresas", async () => {
      await conRepo({ api: datosEjemplo(), config: {} }, async (r) => {
        commitEnRama(r, "jst-1");
        const r1 = await lanzar("git", ["push", "origin", "jst-1"], { cwd: r.repo, env: r.env });
        expect(r1.estado, r1.todo).toBe(0);
        expect(existsSync(r.cache)).toBe(true);
        expect(statSync(r.cache).mode & 0o777).toBe(0o600);
        const datos = JSON.parse(readFileSync(r.cache, "utf8"));
        expect(datos.empresas).toHaveLength(1);
        expect(datos.empresas[0].nombre).toBe("Empresa Confidencial");
        expect(r.cache.startsWith(join(r.repo, ".git"))).toBe(true);
        // no queda ningún temporal al lado
        expect(execFileSync("ls", [join(r.repo, ".git")], { encoding: "utf8" })).not.toMatch(/\.tmp/);
      });
    }, 60000);

    it("una caché vacía o sin empresas que ya existía no se usa: se lee la instancia y se reescribe", async () => {
      await conRepo({ api: datosEjemplo(), config: {} }, async (r) => {
        writeFileSync(r.cache, JSON.stringify({ empresas: [], agentes: [], titulos: [] }));
        commitEnRama(r, "empresa-confidencial-x");
        const r1 = await lanzar("git", ["push", "origin", "empresa-confidencial-x"], { cwd: r.repo, env: r.env });
        expect(r1.estado, r1.todo).not.toBe(0); // con la caché vacía no habría visto la empresa
        expect(r1.todo).toContain("empresa Empresa Confidencial");
        expect(JSON.parse(readFileSync(r.cache, "utf8")).empresas).toHaveLength(1);
        // y una caché que ni siquiera tiene la clave tampoco
        writeFileSync(r.cache, "{}");
        gitEn(r.repo, r.env, "branch", "-m", "empresa-confidencial-y");
        const r2 = await lanzar("git", ["push", "origin", "empresa-confidencial-y"], { cwd: r.repo, env: r.env });
        expect(r2.estado, r2.todo).not.toBe(0);
        expect(r2.todo).toContain("empresa Empresa Confidencial");
      });
    }, 60000);

    it("una caché reciente con empresas sí se usa y no se llama a la API", async () => {
      await conRepo({ api: datosEjemplo(), config: {} }, async (r) => {
        writeFileSync(r.cache, JSON.stringify({ empresas: [{ id: "00000000-0000-0000-0000-0000000000cc", prefijo: "CAC", nombre: "Nombre Cacheado" }], agentes: [], titulos: [] }));
        commitEnRama(r, "nombre-cacheado-x");
        const r1 = await lanzar("git", ["push", "origin", "nombre-cacheado-x"], { cwd: r.repo, env: r.env });
        expect(r1.estado, r1.todo).not.toBe(0);
        expect(r1.todo).toContain("empresa Nombre Cacheado");
        expect(r.api?.urls).toEqual([]);
      });
    }, 60000);
  });

  describe("Python demasiado viejo", () => {
    it("la comprobación de versión va antes de cualquier import que no sea sys (por lectura del archivo)", () => {
      const lineas = readFileSync(join(RAIZ, "scripts/hooks/pre-push"), "utf8").split("\n");
      const version = lineas.findIndex((l) => l.includes("sys.version_info"));
      const primerImport = lineas.findIndex((l) => /^\s*(?:import|from)\s+(?!sys\b)/.test(l));
      const importSys = lineas.findIndex((l) => /^import sys\s*$/.test(l));
      expect(importSys).toBeGreaterThanOrEqual(0);
      expect(version).toBeGreaterThan(importSys);
      expect(primerImport).toBeGreaterThan(version);
      // y la comprobación corta con un mensaje y sale con 1
      expect(lineas.slice(version, primerImport).join("\n")).toMatch(/sys\.exit\(1\)/);
      expect(lineas.slice(version, primerImport).join("\n")).toContain("necesita Python 3.10");
    });

    it("el control usa la sintaxis de tipos de Python 3.10 solo después de esa comprobación (las anotaciones no se evalúan antes)", () => {
      const texto = readFileSync(join(RAIZ, "scripts/hooks/pre-push"), "utf8");
      const antes = texto.slice(0, texto.indexOf("sys.version_info"));
      expect(antes).not.toMatch(/\bdef \w+\(/);
      expect(antes).not.toMatch(/\|\s*None/);
    });
  });
});
