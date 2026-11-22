"""Deja en la carpeta de instalación el paquete que publicó GitHub; no compila ni instala en Paperclip (JST-383, JST-425).

Uso, después de que el merge a main y GitHub Actions hayan publicado vAAAA.MDD.N:
  python3 -I scripts/instalar.py [--seco]

Paperclip carga el plugin desde una carpeta local: `../_instalado` (o la que diga
`OFICINA_INSTALADO`). El comando baja de npm el paquete de la versión que está en main
(`npm pack`, que comprueba su integridad contra el registro), revisa que sea ese paquete
y esa versión, y lo deja en esa carpeta. Lo que corre es, byte por byte, lo que compiló y
publicó GitHub Actions: aquí no hay `npm ci` ni `npm run build`.
La actualización en Paperclip (`paperclipai plugin upgrade`) queda aparte.

Qué toca en la carpeta de instalación:
  - Copia encima todos los archivos del paquete.
  - Dentro de `dist/` y `generador/` borra lo que el paquete ya no trae, salvo lo que el
    plugin escribe ahí mientras corre: `dist/ui/voces/` (los audios publicados) y
    `dist/ui/instancia.json`.
  - Si cambió una dependencia opcional (el motor de voz de Node), la instala con
    `npm install --omit=dev`, sin scripts. Es una descarga, no una compilación.
  - Nada más: lo que haya fuera de eso no se toca.

Lo propio de la instancia (aspecto fijo de los agentes, nombres cortos, pronunciación) ya
no se compila: el plugin lo lee al arrancar de `instancia.json`, en la carpeta de datos
del usuario (ver README › «Datos de tu instancia»).

--seco no baja ni escribe nada.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
INSTALADO = Path(os.environ["OFICINA_INSTALADO"]) if os.environ.get("OFICINA_INSTALADO") else REPO.parent / "_instalado"
PRIVADO = Path(os.environ["OFICINA_PRIVADO"]) if os.environ.get("OFICINA_PRIVADO") else REPO.parent / "_privado"
# Lo mínimo que tiene que traer el paquete para que Paperclip lo cargue.
NECESARIOS = ("package.json", "dist/manifest.js", "dist/worker.js", "dist/ui/index.js")
# Dónde se borra lo que el paquete ya no trae, y lo que ahí escribe el plugin en marcha (no se borra).
SE_LIMPIAN = ("dist", "generador")
DEL_PLUGIN = ("dist/ui/voces", "dist/ui/voces/", "dist/ui/instancia.json")


class Alto(Exception):
    pass


def correr(cmd: list[str], cwd: Path | None = None, env: dict | None = None, ok=(0,)) -> subprocess.CompletedProcess:
    r = subprocess.run(cmd, cwd=REPO if cwd is None else cwd, env=env, capture_output=True)
    if r.returncode not in ok:
        raise Alto(f"Falló: {' '.join(cmd)}\n{r.stderr.decode(errors='replace')}{r.stdout.decode(errors='replace')}")
    return r


def git(*args: str, cwd: Path | None = None, env: dict | None = None, ok=(0,)) -> str:
    return correr(["git", *args], cwd, env, ok).stdout.decode().strip()


def entorno_gh() -> dict:
    """El entorno con el token de `gh`, por si el remoto lo pide (la cuenta de la configuración privada, si la nombra)."""
    config = {}
    if (PRIVADO / "revisar.json").is_file():
        config = json.loads((PRIVADO / "revisar.json").read_text(encoding="utf-8"))
    cmd = ["gh", "auth", "token"] + (["--user", config["gh_cuenta"]] if config.get("gh_cuenta") else [])
    r = subprocess.run(cmd, cwd=REPO, capture_output=True)
    return {**os.environ, "GH_TOKEN": r.stdout.decode().strip()} if r.returncode == 0 else dict(os.environ)


def version_publicada(env: dict) -> str:
    """La versión del release que está en main (el tag que creó la publicación en npm)."""
    git("fetch", "origin", "main", "--tags", env=env)
    tag = git("describe", "--exact-match", "--tags", "--match", "v*", "origin/main", ok=(0, 128))
    if not re.fullmatch(r"v\d{4}\.\d{3,4}\.\d+", tag):
        raise Alto("main no está exactamente en un tag de release con versión por fecha: "
                   "espera a que termine la publicación en npm (GitHub Actions) y vuelve a intentarlo.")
    return tag[1:]


def nombre_del_paquete() -> str:
    return json.loads((REPO / "package.json").read_text(encoding="utf-8"))["name"]


def bajar(nombre: str, version: str, tmp: Path) -> Path:
    """El paquete publicado, bajado de npm y desempaquetado en `tmp`. Devuelve la carpeta con sus archivos."""
    r = subprocess.run(["npm", "pack", f"{nombre}@{version}", "--pack-destination", str(tmp), "--json", "--ignore-scripts"],
                       cwd=tmp, capture_output=True, text=True)
    if r.returncode != 0:
        raise Alto(f"No pude bajar {nombre}@{version} de npm. Si el release acaba de salir, el registro puede tardar "
                   f"unos minutos en mostrarlo: vuelve a intentarlo.\n{r.stderr.strip()[-600:]}")
    try:
        archivo = tmp / json.loads(r.stdout)[0]["filename"]
    except (ValueError, KeyError, IndexError, TypeError) as error:
        raise Alto(f"npm pack respondió algo que no entiendo: {r.stdout.strip()[:300]}") from error
    if not archivo.is_file():
        raise Alto(f"npm pack dijo que bajó {archivo.name}, pero el archivo no está.")
    destino = tmp / "desempaquetado"
    try:
        with tarfile.open(archivo) as t:
            t.extractall(destino, filter="data")
    except (tarfile.TarError, OSError) as error:
        raise Alto(f"No pude desempaquetar {archivo.name} ({error}). No instalo nada.") from error
    paquete = destino / "package"
    faltan = [n for n in NECESARIOS if not (paquete / n).is_file()]
    if faltan:
        raise Alto(f"Al paquete de npm le falta: {', '.join(faltan)}. No instalo nada.")
    datos = json.loads((paquete / "package.json").read_text(encoding="utf-8"))
    if datos.get("name") != nombre or datos.get("version") != version:
        raise Alto(f"Pedí {nombre}@{version} y el paquete dice {datos.get('name')}@{datos.get('version')}. No instalo nada.")
    if version not in (paquete / "dist" / "manifest.js").read_text(encoding="utf-8", errors="replace"):
        raise Alto(f"El manifiesto compilado del paquete no dice la versión {version}. No instalo nada.")
    return paquete


def archivos_de(carpeta: Path) -> list[str]:
    return sorted(p.relative_to(carpeta).as_posix() for p in carpeta.rglob("*") if p.is_file() or p.is_symlink())


def revisar_destino(nombre: str) -> None:
    """La carpeta de instalación es una del plugin (o no existe, o está vacía): no se escribe en una carpeta cualquiera."""
    if not INSTALADO.exists():
        return
    if not INSTALADO.is_dir():
        raise Alto(f"{INSTALADO} no es una carpeta.")
    if not any(INSTALADO.iterdir()):
        return
    if (INSTALADO / ".git").exists():
        raise Alto(f"{INSTALADO} es una copia de git (un clon o una copia de trabajo del repo). Ahí no instalo: se borrarían archivos "
                   "del código que el paquete no trae. La carpeta de instalación tiene solo el paquete publicado; si es la de antes de "
                   "JST-425, quítale el `.git` y el código fuente una vez, o apunta OFICINA_INSTALADO a una carpeta vacía.")
    try:
        actual = json.loads((INSTALADO / "package.json").read_text(encoding="utf-8")).get("name")
    except (OSError, ValueError):
        actual = None
    if actual != nombre:
        raise Alto(f"{INSTALADO} tiene archivos y no es una instalación de {nombre} (su package.json dice «{actual}»). "
                   "No escribo ahí: revisa OFICINA_INSTALADO.")


def poner(paquete: Path) -> tuple[int, list[str]]:
    """Copia el paquete encima de la instalación y borra de `dist/` y `generador/` lo que ya no trae. Devuelve (copiados, borrados)."""
    nuevos = archivos_de(paquete)
    INSTALADO.mkdir(parents=True, exist_ok=True)
    for rel in nuevos:
        destino = INSTALADO / rel
        destino.parent.mkdir(parents=True, exist_ok=True)
        temporal = destino.with_name(destino.name + ".instalando")
        shutil.copyfile(paquete / rel, temporal)
        shutil.copymode(paquete / rel, temporal)
        os.replace(temporal, destino)  # de una vez: Paperclip nunca lee un archivo a medias
    trae = set(nuevos)
    borrados = []
    for carpeta in SE_LIMPIAN:
        base = INSTALADO / carpeta
        if not base.is_dir():
            continue
        for rel in (f"{carpeta}/{r}" for r in archivos_de(base)):
            if rel in trae:
                continue
            if any(rel == propio or (propio.endswith("/") and rel.startswith(propio)) for propio in DEL_PLUGIN):
                continue
            (INSTALADO / rel).unlink()
            borrados.append(rel)
    return len(nuevos), borrados


def opcionales_por_instalar(paquete: Path) -> list[str]:
    """Las dependencias opcionales del paquete que en la instalación faltan o están en otra versión."""
    pedidas = json.loads((paquete / "package.json").read_text(encoding="utf-8")).get("optionalDependencies") or {}
    faltan = []
    for nombre, version in pedidas.items():
        try:
            puesta = json.loads((INSTALADO / "node_modules" / nombre / "package.json").read_text(encoding="utf-8")).get("version")
        except (OSError, ValueError):
            puesta = None
        if puesta != str(version).lstrip("^~="):
            faltan.append(f"{nombre}@{version}")
    return faltan


def instalar(seco: bool = False) -> int:
    env = entorno_gh()
    version = version_publicada(env)
    nombre = nombre_del_paquete()
    revisar_destino(nombre)
    if seco:
        print(f"[seco] bajaría {nombre}@{version} de npm (el paquete que publicó GitHub) y lo dejaría en {INSTALADO}\n"
              "[seco] no compila nada aquí\n"
              "[seco] no se instala ni actualiza Paperclip")
        return 0

    tmp = Path(tempfile.mkdtemp(prefix="oficina-instalar-"))
    try:
        paquete = bajar(nombre, version, tmp)
        faltan = opcionales_por_instalar(paquete)
        try:
            copiados, borrados = poner(paquete)
        except OSError as error:
            raise Alto(f"No pude terminar de copiar el paquete en {INSTALADO} ({error}). Puede haber quedado a medias: "
                       "arregla la causa y vuelve a correr el comando, que copia todo de nuevo.") from error
        print(f"{INSTALADO.name}: {copiados} archivos de {nombre}@{version}"
              + (f"; borré {len(borrados)} que el paquete ya no trae" if borrados else "") + ".")
        if faltan:
            cmd = ["npm", "install", "--omit=dev", "--omit=peer", "--ignore-scripts", "--no-audit", "--no-fund", "--no-package-lock"]
            print(f"$ {' '.join(cmd)}  (dependencias opcionales: {', '.join(faltan)})", flush=True)
            if subprocess.run(cmd, cwd=INSTALADO).returncode != 0:
                raise Alto("El paquete quedó copiado, pero falló la instalación de las dependencias opcionales en la carpeta de instalación. "
                           "Sin ellas el motor de voz de Node no corre; el resto del plugin sí.")
        if (PRIVADO / "instancia.local.ts").is_file():
            print("Ojo: en la carpeta privada hay un `instancia.local.ts` de antes. Ya no se usa: los datos de la instancia van en "
                  "`instancia.json`, en la carpeta de datos del plugin (ver README). Si no lo pasaste, el plugin arranca sin ellos.")
        print(f"{INSTALADO.name} quedó en {version}: el paquete publicado por GitHub, sin compilar nada aquí.\n"
              "Falta actualizar el plugin en Paperclip (`paperclipai plugin upgrade`), con aviso.")
        return 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def main() -> int:
    try:
        return instalar("--seco" in sys.argv[1:])
    except Alto as e:
        print(e)
        return 1


if __name__ == "__main__":
    sys.exit(main())
