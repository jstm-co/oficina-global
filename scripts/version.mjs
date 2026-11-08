import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function prefijoFecha(fecha = new Date()) {
  const mesDia = (fecha.getUTCMonth() + 1) * 100 + fecha.getUTCDate();
  return `${fecha.getUTCFullYear()}.${mesDia}`;
}

export function versionPublicada(versiones, fecha = new Date()) {
  const prefijo = prefijoFecha(fecha);
  const mismoDia = versiones.filter((version) => version.split(/[-+]/, 1)[0].match(new RegExp(`^${prefijo}\\.\\d+$`)));
  return `${prefijo}.${mismoDia.length}`;
}

export function versionLocal({ fecha = new Date(), sha, dirty = false }) {
  if (!/^[0-9a-f]{7}$/i.test(sha)) throw new Error("The build needs a seven-character commit hash.");
  return `${prefijoFecha(fecha)}.0-dev+${sha}${dirty ? ".dirty" : ""}`;
}

export function archivosQuePublican(rutas) {
  return rutas.filter(
    (ruta) => !ruta.startsWith(".github/") && !ruta.startsWith("tests/") && !ruta.endsWith(".md") && !["LICENSE", ".gitignore"].includes(ruta),
  );
}

function git(args, cwd = process.cwd()) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

export function versionEnTag(cwd = process.cwd()) {
  try {
    const tag = execFileSync("git", ["describe", "--exact-match", "--tags", "--match", "v*", "--match", "oficina-pixel-v*", "HEAD"], {
      cwd,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
    const version = tag.match(/^(?:oficina-pixel-)?v(\d{4}\.\d{3,4}\.\d+)$/)?.[1];
    return version || null;
  } catch {
    return null;
  }
}

export function versionDeBuild({ env = process.env, fecha = new Date(), cwd = process.cwd() } = {}) {
  const sha = env.OFICINA_SHA || git(["rev-parse", "--short=7", "HEAD"], cwd);
  const dirty = env.OFICINA_DIRTY === undefined ? Boolean(git(["status", "--porcelain"], cwd)) : env.OFICINA_DIRTY === "1";
  return {
    version: env.OFICINA_VERSION || versionEnTag(cwd) || versionLocal({ fecha, sha, dirty }),
    sha,
    dirty,
  };
}

function esAntecesor(commit) {
  if (!commit) return false;
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", commit, "HEAD"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function ultimoTag() {
  try {
    return git(["describe", "--tags", "--abbrev=0", "--match", "v*", "HEAD"]);
  } catch {
    return null;
  }
}

function cambiosDesde(base) {
  const args = base ? ["diff", "--name-only", `${base}...HEAD`] : ["ls-tree", "-r", "--name-only", "HEAD"];
  return git(args).split("\n").filter(Boolean);
}

function valor(args, nombre) {
  const i = args.indexOf(nombre);
  return i < 0 ? null : args[i + 1];
}

async function metadataNpm(nombre, archivo) {
  if (archivo) return JSON.parse(readFileSync(archivo, "utf8"));
  const respuesta = await fetch(`https://registry.npmjs.org/${nombre}`);
  if (respuesta.status === 404) return { versions: {}, "dist-tags": {} };
  if (!respuesta.ok) throw new Error(`npm registry returned HTTP ${respuesta.status}.`);
  return respuesta.json();
}

function salir(datos) {
  console.log(JSON.stringify(datos));
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(datos).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
  }
}

async function publicacion(args) {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const meta = await metadataNpm(pkg.name, valor(args, "--metadata"));
  const latest = meta["dist-tags"]?.latest ?? null;
  const publicadas = Object.keys(meta.versions ?? {});
  const forzado = args.includes("--assume-changed");
  const gitHead = latest ? meta.versions?.[latest]?.gitHead : null;
  const base = forzado ? null : esAntecesor(gitHead) ? gitHead : ultimoTag();
  const cambios = forzado ? ["src/"] : cambiosDesde(base);
  const delPaquete = archivosQuePublican(cambios);
  const summary = (texto) => process.env.GITHUB_STEP_SUMMARY && appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${texto}\n`);

  if (!delPaquete.length) {
    const msg = "Only docs, tests or CI changed since the last release: nothing to publish.";
    console.error(msg);
    summary(msg);
    salir({ name: pkg.name, version: "", publish: "false", latest: latest ?? "" });
    return;
  }

  const fechaTexto = valor(args, "--at");
  const fecha = fechaTexto ? new Date(fechaTexto) : new Date();
  if (Number.isNaN(fecha.getTime())) throw new Error("--at must be a valid date.");
  const version = versionPublicada(publicadas, fecha);
  summary(`Package changes detected: **${pkg.name}@${version}** will be published after the build and tests pass.`);
  salir({ name: pkg.name, version, publish: "true", latest: latest ?? "", base: base ?? "" });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args[0] === "release") {
    await publicacion(args.slice(1));
  } else {
    console.log(JSON.stringify(versionDeBuild()));
  }
}
