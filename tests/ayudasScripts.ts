// Ayudas compartidas por las pruebas de los scripts de mantenimiento en Python (revisar, subir, release, instalar, pre-push).
// Nada de aquí toca datos reales del equipo: cada proceso corre con un HOME y un OFICINA_PRIVADO temporales.
import { execFileSync, spawn } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

export const RAIZ = resolve(__dirname, "..");
export const CORREO_LIMPIO = "12345+prueba@users.noreply.github.com";

// Cadenas que el propio revisor marcaría si estuvieran escritas enteras en este archivo: se arman por partes.
export const IP_PRIVADA = ["192", "168", "1", "20"].join(".");
export const RUTA_PERSONAL = "/Us" + "ers/ana";
export const CORREO_PERSONAL = "ana" + "@" + "correo.cl";

export interface Resultado { estado: number | null; salida: string; errores: string; todo: string }

export interface Entorno { casa: string; privado: string; env: NodeJS.ProcessEnv }

/** El entorno de un proceso de prueba: HOME y carpeta privada temporales, git sin la configuración del equipo y `bin` antes en el PATH. */
export function entornoAislado(carpeta: string, bin?: string, extra: NodeJS.ProcessEnv = {}): Entorno {
  const casa = join(carpeta, "casa");
  const privado = join(carpeta, "privado");
  mkdirSync(join(casa, ".paperclip"), { recursive: true });
  mkdirSync(privado, { recursive: true });
  const node = dirname(process.execPath);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: casa,
    OFICINA_PRIVADO: privado,
    TMPDIR: join(carpeta, "tmp"),
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    NO_PROXY: "127.0.0.1",
    no_proxy: "127.0.0.1",
    PATH: [bin, node, process.env.PATH].filter(Boolean).join(":"),
    ...extra,
  };
  for (const clave of ["GH_TOKEN", "GITHUB_TOKEN", "OFICINA_INSTALADO", "GIT_DIR", "GIT_WORK_TREE", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_EMAIL"]) {
    if (!(clave in extra)) delete env[clave];
  }
  mkdirSync(env.TMPDIR as string, { recursive: true });
  return { casa, privado, env };
}

/** Lanza un proceso sin bloquear el bucle de eventos (la API falsa vive en este mismo proceso). */
export function lanzar(cmd: string, args: string[], opciones: { cwd?: string; env: NodeJS.ProcessEnv; entrada?: string }): Promise<Resultado> {
  return new Promise((resolver, rechazar) => {
    const proceso = spawn(cmd, args, { cwd: opciones.cwd, env: opciones.env });
    let salida = "";
    let errores = "";
    proceso.stdout.setEncoding("utf8");
    proceso.stderr.setEncoding("utf8");
    proceso.stdout.on("data", (d) => { salida += d; });
    proceso.stderr.on("data", (d) => { errores += d; });
    proceso.on("error", rechazar);
    proceso.on("close", (estado) => resolver({ estado, salida, errores, todo: salida + errores }));
    proceso.stdin.end(opciones.entrada ?? "");
  });
}

export function python(args: string[], opciones: { cwd?: string; env: NodeJS.ProcessEnv; entrada?: string }) {
  return lanzar("python3", ["-I", ...args], opciones);
}

export function git(cwd: string, env: NodeJS.ProcessEnv, ...args: string[]): string {
  return execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/** Un repo con identidad local; los casos limpios firman con una dirección noreply de GitHub. */
export function configurarGit(repo: string, env: NodeJS.ProcessEnv, correo = CORREO_LIMPIO) {
  git(repo, env, "config", "user.name", "Prueba");
  git(repo, env, "config", "user.email", correo);
  git(repo, env, "config", "commit.gpgsign", "false");
}

export function escribir(repo: string, ruta: string, texto: string | Uint8Array) {
  const destino = join(repo, ruta);
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, texto);
}

/** La configuración privada del equipo (`revisar.json` en la carpeta que dice OFICINA_PRIVADO). Con sesión del CLI hace falta, aunque sea `{}`. */
export function configPrivada(privado: string, config: unknown = {}) {
  mkdirSync(privado, { recursive: true });
  writeFileSync(join(privado, "revisar.json"), JSON.stringify(config));
}

/** Copia scripts/revisar.py (y lo que se pida) al repo temporal, sin commitearlo. */
export function copiarScripts(repo: string, ...archivos: string[]) {
  mkdirSync(join(repo, "scripts"), { recursive: true });
  for (const archivo of archivos) {
    cpSync(join(RAIZ, archivo), join(repo, archivo), { recursive: true });
  }
}

/** Un `gh` falso en `bin` que responde `auth token` y, si se pasa, el resto de las llamadas. */
export function ghFalso(bin: string, resto = ""): void {
  mkdirSync(bin, { recursive: true });
  const ruta = join(bin, "gh");
  writeFileSync(ruta, `#!/bin/sh
if [ "$1" = "auth" ] && [ "$2" = "token" ]; then printf '%s\\n' 'token-de-prueba'; exit 0; fi
${resto}
printf 'gh inesperado: %s\\n' "$*" >&2
exit 1
`);
  chmodSync(ruta, 0o755);
}

export function carpetaTemporal(prefijo: string): string {
  return mkdtempSync(join(tmpdir(), `oficina-${prefijo}-`));
}

export function borrar(carpeta: string) {
  rmSync(carpeta, { recursive: true, force: true });
}

// ---- API falsa de Paperclip ----

export interface DatosApi {
  empresas: { id: string; issuePrefix: string; name: string }[];
  agentes?: Record<string, { id: string; name: string; title?: string }[]>;
  titulos?: Record<string, { identifier: string; title: string }[]>;
}

export type Falla = (ruta: string, intento: number, respuesta: ServerResponse, solicitud: IncomingMessage) => boolean;

export interface ApiFalsa { servidor: Server; url: string; llamadas: Map<string, number>; urls: string[]; cerrar: () => Promise<void> }

/** Una API de Paperclip en 127.0.0.1. `falla` puede romper una respuesta: recibe la ruta, el número de intento (desde 1) y devuelve true si ya respondió. */
export async function apiFalsa(datos: DatosApi, falla?: Falla): Promise<ApiFalsa> {
  const llamadas = new Map<string, number>();
  const urls: string[] = [];
  const servidor = createServer((solicitud, respuesta) => {
    const ruta = (solicitud.url ?? "").split("?")[0];
    const intento = (llamadas.get(ruta) ?? 0) + 1;
    llamadas.set(ruta, intento);
    urls.push(solicitud.url ?? "");
    if (falla?.(ruta, intento, respuesta, solicitud)) return;
    respuesta.setHeader("content-type", "application/json");
    const agentes = /^\/api\/companies\/([^/]+)\/agents$/.exec(ruta);
    const issues = /^\/api\/companies\/([^/]+)\/issues$/.exec(ruta);
    if (ruta === "/api/companies") {
      respuesta.end(JSON.stringify(datos.empresas));
    } else if (agentes) {
      respuesta.end(JSON.stringify(datos.agentes?.[agentes[1]] ?? []));
    } else if (issues) {
      const parametros = new URL(solicitud.url ?? "", "http://x").searchParams;
      const estado = parametros.get("status") ?? "";
      // Los títulos salen una sola vez, en la consulta de las tareas hechas, y de a páginas como la API real:
      // sin `limit` entrega a lo más 1000, y `offset` salta las que ya se entregaron.
      const lista = estado === "done" ? datos.titulos?.[issues[1]] ?? [] : [];
      const limite = Number(parametros.get("limit") ?? 1000);
      const desde = Number(parametros.get("offset") ?? 0);
      respuesta.end(JSON.stringify(lista.slice(desde, desde + limite)));
    } else {
      respuesta.statusCode = 404;
      respuesta.end("{}");
    }
  });
  await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
  const direccion = servidor.address();
  if (!direccion || typeof direccion === "string") throw new Error("Falta el puerto de la API de prueba");
  return {
    servidor,
    url: `http://127.0.0.1:${direccion.port}`,
    llamadas,
    urls,
    cerrar: () => new Promise<void>((r) => { servidor.closeAllConnections(); servidor.close(() => r()); }),
  };
}

/** Deja en `casa` la sesión falsa del CLI de Paperclip, apuntando a la API de prueba. */
export function sesionFalsa(casa: string, url: string) {
  mkdirSync(join(casa, ".paperclip"), { recursive: true });
  writeFileSync(join(casa, ".paperclip/auth.json"), JSON.stringify({ credentials: { [url]: { token: "prueba" } } }));
}

/** Datos inventados: una empresa confidencial (prefijo EXT) con un agente y una tarea. */
export const EMPRESA_ID = "00000000-0000-0000-0000-000000000001";
export const AGENTE_ID = "00000000-0000-0000-0000-0000000000a1";
export function datosEjemplo(): DatosApi {
  return {
    empresas: [{ id: EMPRESA_ID, issuePrefix: "EXT", name: "Empresa Confidencial" }],
    agentes: { [EMPRESA_ID]: [{ id: AGENTE_ID, name: "Agente Inventado", title: "Cargo" }] },
    titulos: { [EMPRESA_ID]: [{ identifier: "EXT-1", title: "Migrar la base de clientes antiguos" }] },
  };
}

/** Carga scripts/<archivo>.py (o el que sea) como módulo `m` y corre `codigo`. */
export function conModulo(ruta: string, codigo: string): string[] {
  return ["-c", `
import importlib.util
import json
import sys
from pathlib import Path
spec = importlib.util.spec_from_file_location("m", sys.argv[1])
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
${codigo}
`, ruta];
}
