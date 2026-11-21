"""Deja la carpeta de instalación en el release publicado y la compila; no instala en Paperclip (JST-383, JST-419).

Uso, después de que el merge a main y GitHub Actions hayan creado vAAAA.MDD.N:
  python3 -I scripts/instalar.py [--seco]

Paperclip carga el plugin desde una carpeta local. Para no instalar nunca desde la copia
de trabajo, esa carpeta es otra copia de este mismo repo: `../_instalado` (o la que diga
`OFICINA_INSTALADO`), siempre parada en el tag de un release. El comando la lleva al tag
`vAAAA.MDD.N` que está en main, pone lo propio de la instancia y corre `npm ci` y
`npm run build`. La actualización en Paperclip (`paperclipai plugin upgrade`) queda aparte.

Lo propio de la instancia: si en la carpeta privada del equipo (`OFICINA_PRIVADO` o
`../_privado`, fuera de git) hay un `instancia.local.ts`, se copia a la raíz de la carpeta
de instalación y el build lo usa en lugar de `src/instancia.ts` (ver esbuild.config.mjs).

--seco no escribe nada.
"""
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
INSTALADO = Path(os.environ["OFICINA_INSTALADO"]) if os.environ.get("OFICINA_INSTALADO") else REPO.parent / "_instalado"
PRIVADO = Path(os.environ["OFICINA_PRIVADO"]) if os.environ.get("OFICINA_PRIVADO") else REPO.parent / "_privado"
INSTANCIA = "instancia.local.ts"


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


def instalar(seco: bool = False) -> int:
    env = entorno_gh()
    version = version_publicada(env)
    tag = f"v{version}"
    commit = git("rev-parse", f"{tag}^{{commit}}")
    instancia = PRIVADO / INSTANCIA
    if seco:
        print(f"[seco] {INSTALADO}: checkout --detach {tag} ({commit[:12]}); npm ci; npm run build\n"
              f"[seco] lo propio de la instancia: {'se copia ' + INSTANCIA if instancia.is_file() else 'no hay (queda el de ejemplo)'}\n"
              "[seco] no se instala ni actualiza Paperclip")
        return 0

    if not (INSTALADO / ".git").exists():
        raise Alto(f"Falta la carpeta de instalación en {INSTALADO}: créala una vez con "
                   f"`git worktree add --detach {INSTALADO} {tag}`; el comando no la crea ni instala Paperclip.")
    sucio = git("status", "--porcelain", "--untracked-files=no", cwd=INSTALADO)
    if sucio:
        raise Alto(f"La carpeta de instalación tiene cambios sin commit; revísalos antes de cambiar de tag:\n{sucio}")
    if git("rev-parse", "--verify", "-q", f"{tag}^{{commit}}", cwd=INSTALADO, ok=(0, 1)) != commit:
        git("fetch", "origin", f"refs/tags/{tag}:refs/tags/{tag}", cwd=INSTALADO, env=env)
    git("checkout", "--detach", tag, cwd=INSTALADO)
    if instancia.is_file():
        shutil.copyfile(instancia, INSTALADO / INSTANCIA)
        print(f"Lo propio de la instancia: {INSTANCIA} (no entra a git).")
    elif (INSTALADO / INSTANCIA).exists():
        (INSTALADO / INSTANCIA).unlink()
    for cmd in (["npm", "ci"], ["npm", "run", "build"]):
        print("$", " ".join(cmd), flush=True)
        r = subprocess.run(cmd, cwd=INSTALADO)
        if r.returncode != 0:
            raise Alto(f"Falló {' '.join(cmd)} en la carpeta de instalación.")
    build = json.loads(correr(["node", "scripts/version.mjs"], cwd=INSTALADO).stdout)
    if build["version"] != version:
        raise Alto(f"El build dio {build['version']}, pero el release es {version}.")
    print(f"{INSTALADO.name} compilado en {tag}: {build['version']} ({build['sha']}).\n"
          "Falta actualizar el plugin en Paperclip (`paperclipai plugin upgrade`), con aviso.")
    return 0


def main() -> int:
    try:
        return instalar("--seco" in sys.argv[1:])
    except Alto as e:
        print(e)
        return 1


if __name__ == "__main__":
    sys.exit(main())
