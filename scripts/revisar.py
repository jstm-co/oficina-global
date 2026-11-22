"""Revisa que lo que se va a subir no tenga datos privados (JST-284, JST-419).

Uso:
  python3 -I scripts/revisar.py <carpeta> [--real real.json] [--guardar-real real.json] [--con-dist]

Con --con-dist revisa también `dist/` (para el paquete de npm, que lo trae armado).

Este repo es público y los mantenedores trabajan en él desde un equipo que corre una
instancia real de Paperclip. El revisor busca lo que no debe salir de ese equipo:

  1. Patrones fijos: IPs privadas, correos, rutas de la carpeta personal, claves y tokens.
  2. Lo que diga la configuración privada del equipo, que vive fuera de git (ver abajo):
     patrones propios, y qué empresas y prefijos de tarea sí se pueden nombrar.
  3. Lo de la instancia de Paperclip, con la sesión del CLI (`~/.paperclip/auth.json`,
     solo GET) o con `--real`: los nombres de las empresas, los IDs de las empresas y de
     los agentes, y los títulos de las tareas (cualquier tramo de 5 palabras seguidas de
     un título).
  4. Rutas que no se publican (`.claude/`, el `instancia.json` de una instancia…) y
     archivos que no se pueden leer como texto fuera de las carpetas de imágenes y sonidos.

`subir.py` y el control `pre-push` no revisan una carpeta sino los objetos de git que
se van a enviar (`Revisor.objetos`): todos los archivos de todos los commits nuevos, con
sus rutas, además de los mensajes y las firmas de esos commits (`Revisor.commits`). Lo
que llega a GitHub no se puede retirar, aunque un commit posterior lo borre.

Sale con 1 si encuentra algo.

Configuración privada: `revisar.json` en la carpeta que diga `OFICINA_PRIVADO` o, si no
está, en `_privado/` junto a la carpeta del repo principal. Todos sus campos son opcionales:

  {
    "empresas_publicas": ["Nombre de la empresa que publica"],
    "prefijos_publicos": ["ABC"],
    "patrones": [["cómo se llama el hallazgo", "expresión regular"]],
    "correos_autor": ["expresión regular de otro correo de autor permitido"],
    "permitidos_dist": [["cómo se llama el hallazgo", "texto exacto que sí puede ir en dist/"]],
    "gh_cuenta": "cuenta de GitHub con la que se sube"
  }

Un equipo con sesión del CLI o con carpeta privada es el de un mantenedor: ahí hacen
falta las dos cosas y, si falta una o la instancia no responde, el revisor se detiene en
vez de revisar a ciegas. Sin ninguna de las dos (quien aporta desde un fork) revisa con
los patrones fijos y lo dice.
"""
import http.client
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

PATRONES = [
    ("IP privada", r"\b(?:100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b"),
    ("correo", r"(?<![A-Za-z0-9._%+-])(?!noreply@)[A-Za-z0-9._%+-]+@(?!ejemplo\.|example\.|users\.noreply\.github\.com)[A-Za-z0-9-]+\.[A-Za-z0-9.-]*[A-Za-z]{2,}"),
    ("ruta de la carpeta personal", r"(?:/Users|/home|[A-Za-z]:\\Users)[/\\](?!usuario\b|<)[A-Za-z0-9._-]+"),
    ("dirección de red privada", r"\b[a-z0-9-]+\.[a-z0-9-]+\.ts\.net\b"),
    ("token", r"\b(?:pcp_|gh[pousr]_|github_pat_|sk-|xox[bap]-|AIza|hf_|npm_)[A-Za-z0-9_-]{8,}|\bAKIA[0-9A-Z]{16}\b|\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}"),
    ("clave privada", r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    ("Bearer", r"Bearer\s+[A-Za-z0-9._-]{20,}"),
    ("contraseña en un comando", r"\bsshpass\s+-p\s*\S+"),
]

# Rutas que nunca van al repo, estén o no en .gitignore (alguien puede forzarlas con `git add -f`).
RUTAS_PROHIBIDAS = [
    ("carpeta que no se publica", r"^(?:\.claude|spike|pruebas|publico|_privado)(?:/|$)"),
    # Lo propio de una instancia: el `instancia.json` que el plugin lee al arrancar (JST-425) y el `instancia.local.ts` de antes.
    ("archivo propio de una instancia", r"(?i)(?:^|/)instancia(?:\.local)?\.(?:ts|json)(?:\.[^/]*)?$"),
    ("archivo de entorno", r"(?:^|/)\.env(?:\.|$)"),
]
# Donde sí puede haber archivos que no son texto (imágenes, sonidos y la voz de referencia).
BINARIOS_PERMITIDOS = re.compile(r"^(?:src/ui/assets/|generador/referencias/|static/)|^(?:package/)?(?:dist/|generador/referencias/)")

# Quién puede firmar un commit que va a un repo público: las direcciones «noreply» de GitHub (las de cada
# cuenta y la de los merges hechos en la web). La configuración puede sumar otras.
CORREOS_AUTOR = [r".+@users\.noreply\.github\.com", r"noreply@github\.com"]

OMITIR_CARPETAS = {".git", "node_modules", "dist", "__pycache__"}

# En dist/ va el SDK de Paperclip (@paperclipai/shared): un texto de ejemplo para la clave de un
# proveedor de IA y los rangos de red que bloquea. No son nuestros. (Van partidos para que este
# archivo no se marque a sí mismo.)
PERMITIDOS_DIST = {
    ("token", "sk-" + "ant-api03-"),
    ("IP privada", "10." + "0.0.0"),
    ("IP privada", "100." + "64.0.0"),
    ("IP privada", "172." + "16.0.0"),
    ("IP privada", "192." + "168.0.0"),
}

INTENTOS_API = 5
PAGINA_API = 1000
SESION = "~/.paperclip/auth.json"
UUID = re.compile(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")


class SinDatos(Exception):
    """No se pudo armar el revisor con todo lo que hace falta: no se revisa a ciegas."""


def carpeta_privada(repo: Path = REPO) -> Path:
    """Donde vive lo privado del equipo, fuera de git: junto al repo principal, también desde un worktree."""
    if os.environ.get("OFICINA_PRIVADO"):
        return Path(os.environ["OFICINA_PRIVADO"])
    r = subprocess.run(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], cwd=repo, capture_output=True, text=True)
    principal = Path(r.stdout.strip()).parent if r.returncode == 0 and r.stdout.strip() else repo
    return principal.parent / "_privado"


def leer_config(repo: Path = REPO) -> dict:
    ruta = carpeta_privada(repo) / "revisar.json"
    if not ruta.is_file():
        return {}
    return json.loads(ruta.read_text(encoding="utf-8"))


def palabras(texto: str) -> list[str]:
    return re.findall(r"[0-9a-záéíóúüñ]+", texto.lower())


def hay_sesion() -> bool:
    return Path(os.path.expanduser(SESION)).is_file()


def leer_real(ruta: str | None = None, guardar: str | None = None) -> dict:
    """Los nombres, IDs y títulos de la instancia de Paperclip de este equipo (o de `ruta`)."""
    if ruta:
        return json.loads(Path(ruta).read_text(encoding="utf-8"))
    real = {"empresas": [], "agentes": [], "titulos": []}
    if not hay_sesion():
        return real
    auth = json.loads(Path(os.path.expanduser(SESION)).read_text(encoding="utf-8"))
    base, cred = next(iter(auth["credentials"].items()))

    def get(path: str) -> list:
        # Con el equipo cargado la respuesta de las listas largas llega cortada: se reintenta.
        for intento in range(INTENTOS_API):
            try:
                req = urllib.request.Request(base.rstrip("/") + path, headers={"Authorization": f"Bearer {cred['token']}"})
                with urllib.request.urlopen(req, timeout=60) as r:
                    d = json.load(r)
                lista = d if isinstance(d, list) else d.get("items") if isinstance(d, dict) else None
                if not isinstance(lista, list):
                    raise SinDatos(f"La instancia respondió algo que no es una lista en {path.split('?')[0]}.")
                return lista
            except (OSError, ValueError, EOFError, http.client.HTTPException):  # HTTPException: IncompleteRead, la respuesta cortada
                if intento == INTENTOS_API - 1:
                    raise
                time.sleep(1 + intento)
        return []

    def todas(path: str) -> list:
        """Una lista larga, de a páginas: con `limit` solo, lo que pasa de la primera página no llegaría."""
        salida, desde = [], 0
        while True:
            pagina = get(f"{path}&limit={PAGINA_API}&offset={desde}")
            salida += pagina
            if len(pagina) < PAGINA_API:
                return salida
            desde += PAGINA_API

    for c in get("/api/companies"):
        pre = c.get("issuePrefix")
        real["empresas"].append({"id": c["id"], "prefijo": pre, "nombre": c["name"]})
        for a in get(f"/api/companies/{c['id']}/agents"):
            real["agentes"].append({"empresa": pre, "id": a["id"], "nombre": a["name"], "cargo": a.get("title")})
        for st in ("backlog,todo,in_progress,in_review,blocked", "done", "cancelled"):
            for i in todas(f"/api/companies/{c['id']}/issues?status={st}&view=compact"):
                real["titulos"].append({"empresa": pre, "id": i.get("identifier"), "titulo": i.get("title") or ""})
    if not real["empresas"]:
        raise SinDatos("La instancia de Paperclip no devolvió ninguna empresa: no puedo saber qué es privado.")
    if guardar:
        destino = Path(guardar)
        temporal = destino.with_name(f"{destino.name}.{os.getpid()}.tmp")
        with open(os.open(temporal, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w", encoding="utf-8") as f:
            json.dump(real, f, ensure_ascii=False)
        os.replace(temporal, destino)
    return real


def armar(repo: Path = REPO, real_ruta: str | None = None, guardar: str | None = None, cache: Path | None = None, vale: int = 0) -> "Revisor":
    """El revisor de este equipo. En el de un mantenedor exige la sesión y la configuración; en un fork, avisa.

    `cache` (con `vale` segundos) guarda los datos de la instancia entre un push y el siguiente: leerlos tarda.
    Solo se escribe después de una lectura completa con sesión, nunca una lista vacía.
    """
    privada = carpeta_privada(repo)
    config = leer_config(repo)
    if real_ruta:
        return Revisor(leer_real(real_ruta), config)
    tiene_sesion, tiene_config = hay_sesion(), (privada / "revisar.json").is_file()
    if tiene_sesion and not tiene_config:
        raise SinDatos(f"Este equipo tiene sesión de Paperclip pero falta la configuración privada ({privada}/revisar.json): "
                       "sin ella no sé qué empresas y prefijos se pueden nombrar. No reviso a ciegas.")
    if tiene_config and not tiene_sesion:
        raise SinDatos(f"Este equipo tiene configuración privada pero no hay sesión del CLI de Paperclip ({SESION}): "
                       "sin ella no puedo leer los nombres y títulos de la instancia. No reviso a ciegas.")
    if not tiene_sesion:
        print("Aviso: sin sesión de Paperclip ni configuración privada, reviso solo con los patrones fijos.")
        return Revisor(leer_real(), config)
    if cache and cache.is_file() and time.time() - cache.stat().st_mtime < vale:
        try:
            real = leer_real(str(cache))
        except (OSError, ValueError):  # una caché a medio escribir o rota: se lee de nuevo
            real = {}
        if real.get("empresas"):
            return Revisor(real, config)
    try:
        return Revisor(leer_real(None, str(cache) if cache else guardar), config)
    except (OSError, ValueError, EOFError, http.client.HTTPException) as error:
        raise SinDatos(f"No pude leer los datos de la instancia de Paperclip ({error}). No reviso a ciegas: vuelve a intentarlo.") from error


def nombre_flexible(nombre: str) -> str:
    """El nombre de una empresa aunque venga pegado o con otro separador («Mi Empresa», «MiEmpresa», «mi_empresa»)."""
    partes = [re.escape(p) for p in re.split(r"[\s_\- ]+", nombre) if p]
    return r"[\s_\- ]*".join(partes)


class Revisor:
    """Lo que hay que buscar, armado una vez con la configuración y los datos de la instancia."""

    def __init__(self, real: dict, config: dict | None = None):
        config = config or {}
        publicas = set(config.get("empresas_publicas", []))
        prefijos = set(config.get("prefijos_publicos", []))
        self.patrones = [(n, re.compile(p)) for n, p in PATRONES + [tuple(x) for x in config.get("patrones", [])]]
        for e in real["empresas"]:
            if e["nombre"] not in publicas:
                # Los nombres largos, aunque vayan pegados a otra cosa («\bNombre» en una regex) y en cualquier caja.
                largo = len(e["nombre"]) >= 6
                rx = nombre_flexible(e["nombre"]) if largo else rf"\b{re.escape(e['nombre'])}\b"
                self.patrones.append((f"empresa {e['nombre']}", re.compile(rx, re.I if largo else 0)))
        self.ids = {e["id"].lower() for e in real["empresas"]} | {a["id"].lower() for a in real["agentes"]}
        # Tramos de 5 palabras de los títulos de las otras empresas que no salen en ningún título público.
        publicos = set()
        for t in real["titulos"]:
            if t["empresa"] in prefijos:
                p = palabras(t["titulo"])
                publicos.update(tuple(p[i:i + 5]) for i in range(len(p) - 4))
        self.tramos: dict[tuple, str] = {}
        for t in real["titulos"]:
            if t["empresa"] in prefijos:
                continue
            p = palabras(t["titulo"])
            for i in range(len(p) - 4):
                tramo = tuple(p[i:i + 5])
                if tramo not in publicos:
                    self.tramos.setdefault(tramo, f"{t['id']} «{t['titulo'][:80]}»")
        self.correos_autor = [re.compile(p) for p in CORREOS_AUTOR + list(config.get("correos_autor", []))]
        self.permitidos_dist = PERMITIDOS_DIST | {tuple(x) for x in config.get("permitidos_dist", [])}
        self.prohibidas = [(n, re.compile(p)) for n, p in RUTAS_PROHIBIDAS]

    def linea(self, linea: str, en_dist: bool = False) -> list[str]:
        """Los hallazgos de una línea de texto (sin los títulos, que pueden venir partidos entre líneas)."""
        hallazgos = []
        for nombre, rx in self.patrones:
            for m in rx.finditer(linea):
                if en_dist and (nombre, m.group(0)) in self.permitidos_dist:
                    continue
                hallazgos.append(f"{nombre}: {m.group(0)}")
        for uid in UUID.findall(linea):
            if uid.lower() in self.ids:
                hallazgos.append(f"ID de la instancia real: {uid}")
        return hallazgos

    def texto(self, donde: str, texto: str, en_dist: bool = False) -> int:
        n = 0
        lineas = texto.splitlines()
        for n_linea, linea in enumerate(lineas, 1):
            for h in self.linea(linea, en_dist):
                print(f"{donde}:{n_linea}: {h}")
                n += 1
        # Los títulos, sobre el texto entero: un mensaje de commit cortado a 72 columnas parte el título en dos líneas.
        if self.tramos:
            todas, de_linea = [], []
            for n_linea, linea in enumerate(lineas, 1):
                p = palabras(linea)
                todas += p
                de_linea += [n_linea] * len(p)
            vistos = set()
            for i in range(len(todas) - 4):
                origen = self.tramos.get(tuple(todas[i:i + 5]))
                if origen and origen not in vistos:
                    vistos.add(origen)
                    print(f"{donde}:{de_linea[i]}: título real: {' '.join(todas[i:i + 5])} ← {origen}")
                    n += 1
        return n

    def ruta(self, ruta: str) -> int:
        """El nombre de un archivo, una carpeta, una rama o un tag: también queda público."""
        n = 0
        for nombre, rx in self.prohibidas:
            if rx.search(ruta):
                print(f"{ruta}: {nombre}")
                n += 1
        for h in self.linea(ruta):
            print(f"{ruta}: en el nombre: {h}")
            n += 1
        # Un título real en el nombre: las palabras de la ruta, separadas por lo que sea.
        p = palabras(re.sub(r"[/_.\-]+", " ", ruta))
        for i in range(len(p) - 4):
            origen = self.tramos.get(tuple(p[i:i + 5]))
            if origen:
                print(f"{ruta}: en el nombre: título real ← {origen}")
                n += 1
                break
        return n

    def contenido(self, ruta: str, datos: bytes, en_dist: bool = False) -> int:
        """El contenido de un archivo. Lo que no es texto solo se acepta en las carpetas de imágenes y sonidos."""
        try:
            texto = datos.decode("utf-8")
        except UnicodeDecodeError:
            if BINARIOS_PERMITIDOS.search(ruta):
                return 0
            print(f"{ruta}: no es texto UTF-8 y no está en una carpeta de imágenes o sonidos: no lo puedo revisar")
            return 1
        return self.texto(ruta, texto, en_dist)

    def carpeta(self, carpeta: Path, con_dist: bool = False) -> int:
        """Una carpeta en disco (el paquete de npm ya armado). Para lo que se sube a git, ver `objetos`."""
        omitir = OMITIR_CARPETAS - {"dist"} if con_dist else OMITIR_CARPETAS
        n = 0
        for archivo in sorted(carpeta.rglob("*")):
            rel = archivo.relative_to(carpeta)
            if not archivo.is_file() or any(parte in omitir for parte in rel.parts):
                continue
            n += self.ruta(str(rel))
            n += self.contenido(str(rel), archivo.read_bytes(), rel.parts[0] == "dist")
        return n

    def objetos(self, repo: Path, *revisiones: str) -> int:
        """Todos los archivos que git enviaría con esas revisiones (`<commit> --not --remotes=origin`).

        No el árbol del último commit: cada versión de cada archivo de cada commit nuevo, con su ruta y sin
        saltarse carpetas. Un archivo que un commit agrega y el siguiente borra también llega a GitHub.
        """
        lista = subprocess.run(["git", "rev-list", "--objects", *revisiones], cwd=repo, capture_output=True, text=True, check=True).stdout
        con_ruta = [linea.split(" ", 1) for linea in lista.splitlines() if " " in linea]
        if not con_ruta:
            return 0
        tipos = subprocess.run(["git", "cat-file", "--batch-check=%(objectname) %(objecttype)"], cwd=repo, capture_output=True, text=True, check=True,
                               input="".join(f"{sha}\n" for sha, _ in con_ruta)).stdout.split("\n")
        pares = [(sha, ruta) for (sha, ruta), tipo in zip(con_ruta, tipos) if tipo.endswith(" blob")]
        nuevos = {sha for sha, _ in pares}  # los contenidos que el remoto todavía no tiene
        # `rev-list --objects` nombra cada contenido una sola vez, con la primera ruta que encuentra: dos archivos con el
        # mismo contenido (dos vacíos, una copia en otra carpeta) quedarían con una sola ruta, y con ella la decisión de
        # si «no es texto» vale. Los pares (contenido, ruta) completos salen de lo que cambia cada commit.
        cambios = subprocess.run(["git", "log", "-m", "--no-renames", "--format=", "--raw", "--no-abbrev", "-z", *revisiones],
                                 cwd=repo, capture_output=True).stdout.decode("utf-8", "replace").split("\0")
        nombres: list[str] = []
        for i, campo in enumerate(cambios[:-1]):
            partes = campo.lstrip("\n").split()
            if len(partes) >= 5 and partes[0].startswith(":") and not partes[1].startswith("16") and set(partes[3]) != {"0"}:
                # El nombre se revisa siempre (una copia de algo que ya es público puede llevar un nombre que no lo es);
                # el contenido, solo si es nuevo: lo que un merge trae de develop ya está en GitHub.
                nombres.append(cambios[i + 1])
                if partes[3] in nuevos:
                    pares.append((partes[3], cambios[i + 1]))
        n, rutas_vistas = 0, set()
        for ruta in dict.fromkeys(nombres + [r for _, r in pares]):
            rutas_vistas.add(ruta)
            n += self.ruta(ruta)
        for sha, ruta in dict.fromkeys(pares):
            datos = subprocess.run(["git", "cat-file", "blob", sha], cwd=repo, capture_output=True, check=True).stdout
            n += self.contenido(ruta, datos)
        # Las carpetas también tienen nombre (y pueden no tener ningún archivo propio en `pares`).
        for ruta in (r for sha, r in con_ruta if r not in rutas_vistas):
            n += self.ruta(ruta)
        return n

    def commits(self, repo: Path, *rango: str) -> int:
        """Los mensajes y las firmas de los commits de `rango` (`base..punta`, o lo que entienda `git log`): todo eso queda público."""
        salida = subprocess.run(["git", "log", "--format=%H%x1f%an%x1f%ae%x1f%cn%x1f%ce%x1f%B%x1e", *rango],
                                cwd=repo, capture_output=True, text=True, check=True).stdout
        n = 0
        for registro in filter(str.strip, salida.split("\x1e")):
            sha, autor, correo_a, confirma, correo_c, mensaje = registro.strip("\n").split("\x1f", 5)
            donde = f"commit {sha[:7]}"
            n += self.texto(donde, mensaje)
            # El nombre de quien firma es público por definición; el correo tiene que ser uno de los permitidos.
            for quien, nombre, correo in (("autor", autor, correo_a), ("committer", confirma, correo_c)):
                if not any(rx.fullmatch(correo) for rx in self.correos_autor):
                    print(f"{donde}: correo del {quien} ({nombre}): no es de los permitidos")
                    n += 1
        return n

    def tag(self, repo: Path, sha: str) -> int:
        """El mensaje de un tag anotado."""
        r = subprocess.run(["git", "cat-file", "tag", sha], cwd=repo, capture_output=True, text=True)
        return self.texto(f"tag {sha[:7]}", r.stdout) if r.returncode == 0 else 0


def main() -> int:
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return 2
    carpeta = Path(args[0])
    real_ruta = args[args.index("--real") + 1] if "--real" in args else None
    guardar = args[args.index("--guardar-real") + 1] if "--guardar-real" in args else None
    try:
        revisor = armar(REPO, real_ruta, guardar)
    except SinDatos as e:
        print(e)
        return 1
    hallazgos = revisor.carpeta(carpeta, "--con-dist" in args)
    print(f"\n{hallazgos} hallazgos en {carpeta}")
    return 1 if hallazgos else 0


if __name__ == "__main__":
    sys.exit(main())
