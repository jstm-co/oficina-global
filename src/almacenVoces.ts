// Dónde quedan los audios de las voces (0.13.0, issue #9). Hasta la 0.12 iban
// solo en `dist/ui/voces/`, dentro de la carpeta del plugin: instalado desde
// npm, cada actualización reemplaza esa carpeta y se los llevaba.
//
// Paperclip sirve la interfaz del plugin solo desde su `dist/ui/` y rechaza lo
// que salga de ahí, también por un enlace simbólico (`plugin-ui-static`). Así
// que los audios viven en una carpeta de datos del usuario, fuera del plugin, y
// se publican en `dist/ui/voces/` (con un enlace duro, o una copia si no se
// puede): al arrancar el worker se vuelve a publicar todo, y una actualización
// no pierde nada.
//
// - La carpeta de datos es la del sistema: `~/Library/Application Support` en
//   la Mac, `%LOCALAPPDATA%` en Windows y `~/.local/share` en Linux. No se leen
//   variables de entorno (`XDG_DATA_HOME`, `LOCALAPPDATA`): Paperclip no se las
//   pasa al worker y `npm run voces` tiene que llegar a la misma carpeta.
// - Una carpeta por instalación del plugin (por su ruta): dos Paperclip en el
//   mismo computador no se pisan los índices. Instalado desde npm, la ruta no
//   cambia entre versiones.
// - La primera vez, si ya había audios en `dist/ui/voces/` (los de antes de la
//   0.13.0), se adoptan.
import { copyFileSync, existsSync, linkSync, mkdirSync, readdirSync, realpathSync, renameSync, rmSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

/** Las carpetas que se publican: la de las voces y la de lo que se prepara al momento (`vivo/`). */
const CARPETAS = ["", "vivo"] as const;
const PUBLICABLE = /\.(mp3|wav|json)$/;

/** La carpeta de datos de la Oficina en este sistema. */
export function carpetaDatos(plataforma: NodeJS.Platform = process.platform, casa = homedir()): string {
  if (plataforma === "darwin") return join(casa, "Library", "Application Support", "oficina-global");
  if (plataforma === "win32") return join(casa, "AppData", "Local", "oficina-global");
  return join(casa, ".local", "share", "oficina-global");
}

/** La carpeta de los audios de esta instalación del plugin: `<datos>/voces/<carpeta del plugin>-<8 del hash de su ruta>`. */
export function carpetaAlmacen(raiz: string, datos = carpetaDatos()): string {
  let ruta = resolve(raiz);
  try {
    ruta = realpathSync(ruta);
  } catch {
    // Sin la carpeta: su ruta tal cual.
  }
  const nombre = basename(ruta).replace(/[^\w.-]+/g, "-").slice(0, 60) || "plugin";
  return join(datos, "voces", `${nombre}-${createHash("sha1").update(ruta).digest("hex").slice(0, 8)}`);
}

/** ¿Son el mismo archivo (dos enlaces duros)? */
function mismoArchivo(a: string, b: string): boolean {
  try {
    const x = statSync(a, { bigint: true });
    const y = statSync(b, { bigint: true });
    return x.ino === y.ino && x.dev === y.dev;
  } catch {
    return false;
  }
}

/**
 * Deja `rel` del almacén en la carpeta pública: un enlace duro (no ocupa más) o
 * una copia, escritos aparte y renombrados. `false` si ya estaba (el mismo
 * archivo): ahí `rename` no haría nada y dejaría el temporal.
 */
export function publicar(almacen: string, publico: string, rel: string): boolean {
  const origen = join(almacen, rel);
  const destino = join(publico, rel);
  if (mismoArchivo(origen, destino)) return false;
  const tmp = `${destino}.publicando`;
  mkdirSync(dirname(destino), { recursive: true });
  rmSync(tmp, { force: true });
  try {
    linkSync(origen, tmp);
  } catch {
    // Otro disco, o un sistema sin enlaces duros.
    copyFileSync(origen, tmp);
  }
  renameSync(tmp, destino);
  return true;
}

/** Saca `rel` de la carpeta pública (se borró del almacén). */
export function despublicar(publico: string, rel: string): void {
  rmSync(join(publico, rel), { force: true });
}

function archivos(dir: string): Map<string, number> {
  const lista = new Map<string, number>();
  for (const sub of CARPETAS) {
    let nombres: string[];
    try {
      nombres = readdirSync(join(dir, sub));
    } catch {
      continue;
    }
    for (const f of nombres) {
      if (!PUBLICABLE.test(f)) continue;
      const rel = sub ? `${sub}/${f}` : f;
      try {
        const s = statSync(join(dir, rel));
        if (s.isFile()) lista.set(rel, s.size);
      } catch {
        // Se borró mientras se leía.
      }
    }
  }
  return lista;
}

/**
 * La carpeta pública queda igual que el almacén: se publica lo que falta o
 * cambió de tamaño (los JSON, que se reescriben, siempre que no sean ya el
 * mismo archivo) y se borra lo que el almacén ya no tiene.
 */
export function sincronizar(almacen: string, publico: string): { publicados: number; borrados: number } {
  const hay = archivos(almacen);
  const publicos = archivos(publico);
  let publicados = 0;
  let borrados = 0;
  for (const [rel, tam] of hay) {
    if (publicos.get(rel) === tam && !rel.endsWith(".json")) continue;
    if (publicar(almacen, publico, rel)) publicados += 1;
  }
  for (const rel of publicos.keys()) {
    if (hay.has(rel)) continue;
    despublicar(publico, rel);
    borrados += 1;
  }
  return { publicados, borrados };
}

/**
 * La primera vez (el almacén no tiene `indice.json` ni `eleccion.json`): lo que
 * ya había en la carpeta pública pasa al almacén. `true` si adoptó algo.
 */
export function adoptar(almacen: string, publico: string): boolean {
  if (existsSync(join(almacen, "indice.json")) || existsSync(join(almacen, "eleccion.json"))) return false;
  const hay = archivos(publico);
  if (hay.size === 0) return false;
  for (const rel of hay.keys()) publicar(publico, almacen, rel);
  return true;
}

/** Al arrancar: adopta lo de antes de la 0.13.0 (si toca) y publica todo. */
export function prepararAlmacen(almacen: string, publico: string): { adoptado: boolean; publicados: number; borrados: number } {
  mkdirSync(almacen, { recursive: true });
  const adoptado = adoptar(almacen, publico);
  return { adoptado, ...sincronizar(almacen, publico) };
}
