"""Sube la rama de una tarea a GitHub y abre o actualiza su pull request a develop (JST-284, JST-419).

Uso, desde la carpeta del repo y con el cambio ya commiteado (es pesado: corre todo antes de subir):
  python3 -I subir.py JST-NN -m "JST-NN: what changes" [--listo] [--rapido] [--seco]

  -m        título del pull request, en inglés como el README principal. Lo ve cualquiera.
  --listo   el PR queda listo para que lo aprueben (la QA pasó o no hace falta).
            Sin --listo queda como borrador, que GitHub no deja fusionar.
  --rapido  no corre pruebas, tipos ni build aquí (el CI de GitHub los corre igual). Solo
            para borradores: con --listo se corre todo.
  --seco    hace todo menos subir: muestra la rama, el título y el texto del PR.

Qué hace:
  1. Exige que la rama contenga el develop actual; así una rama vieja no puede borrar
     arreglos que ya están en GitHub.
  2. Pasa el revisor de datos privados (scripts/revisar.py) por lo que va a quedar público:
     todos los archivos de todos los commits nuevos (también los que un commit posterior
     borra) con sus nombres, los mensajes y las firmas de esos commits, el nombre de la
     rama, y el título y el texto del PR. Este repo es público: lo que se sube no se puede
     retirar. Usa el revisor que está en develop, no el de la rama: nadie es juez de su
     propio cambio.
  3. Sin --rapido, en una copia limpia del commit: `npm ci`, pruebas, tipos, build y la
     revisión de lo que trae el paquete de npm (`dist/` incluido).
  4. Sube la rama `jst-NN` y abre o actualiza el PR a develop. El release posterior
     develop → main (scripts/release.py) calcula y publica una versión por fecha en npm
     (.github/workflows/publish.yml); no hay que subir ninguna versión a mano.

Nunca hace push a develop ni a main, ni fusiona: los merges conservan sus aprobaciones.

La primera vez deja este clon preparado: instala el control `pre-push` para todas sus
copias de trabajo y desactiva el `git push` a secas de `origin` (solo sube este comando,
que ya revisó). Así un push a mano, con o sin `--no-verify`, no publica nada sin revisar.
"""
import importlib.util
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parent
GH_REPO = "jstm-co/oficina-global"
BASE = "develop"
# Lo que tiene que traer el paquete de npm (también lo revisa el CI de GitHub).
EN_EL_PAQUETE = ("package.json", "README.md", "README.es.md", "LICENSE", "AVISOS.md", "dist/worker.js", "dist/manifest.js",
                 "dist/ui/index.js", "dist/ui/tv.html", "dist/generar_voces.mjs", "generador/motor_kokoro.py",
                 "generador/referencias/ref_hombre_cl.wav")


class Alto(Exception):
    pass


SUBIDO: list[str] = []  # la rama que ya se subió, si algo falla después (para no decir «no subí nada»)


def correr(cmd: list[str], cwd: Path | None = None, env: dict | None = None, ok=(0,)) -> subprocess.CompletedProcess:
    r = subprocess.run(cmd, cwd=REPO if cwd is None else cwd, env=env, capture_output=True)
    if r.returncode not in ok:
        raise Alto(f"Falló: {' '.join(cmd)}\n{r.stderr.decode(errors='replace')}{r.stdout.decode(errors='replace')}")
    return r


def git(*args: str, cwd: Path | None = None, env: dict | None = None, ok=(0,)) -> str:
    return correr(["git", *args], cwd, env, ok).stdout.decode().strip()


def de_develop(ruta: str) -> bytes | None:
    """Un archivo tal como está en el develop de GitHub, o None si ahí todavía no existe."""
    r = subprocess.run(["git", "show", f"refs/remotes/origin/{BASE}:{ruta}"], cwd=REPO, capture_output=True)
    return r.stdout if r.returncode == 0 else None


def cargar_revisar(tmp: Path | None = None):
    """El revisor de develop (el que ya pasó por un PR); el de la copia de trabajo solo si develop aún no lo tiene."""
    ruta = REPO / "scripts" / "revisar.py"
    oficial = de_develop("scripts/revisar.py") if tmp else None
    if oficial is not None:
        ruta = tmp / "revisar.py"
        ruta.write_bytes(oficial)
    spec = importlib.util.spec_from_file_location("revisar", ruta)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def entorno_gh(config: dict) -> dict:
    """El entorno con el token de `gh` (el de la cuenta de la configuración privada, si la nombra)."""
    cmd = ["gh", "auth", "token"] + (["--user", config["gh_cuenta"]] if config.get("gh_cuenta") else [])
    return {**os.environ, "GH_TOKEN": correr(cmd).stdout.decode().strip()}


def desarrollo_actual() -> tuple[str, str]:
    for ref in ("refs/remotes/origin/develop", "refs/heads/develop"):
        sha = git("rev-parse", "--verify", "-q", ref, ok=(0, 1))
        if sha:
            return ref, sha
    raise Alto("No encuentro develop. Tráelo con `git fetch origin develop` y vuelve a intentarlo.")


def revisar_rama_actual(actual: str | None = None) -> None:
    actual = actual or git("rev-parse", "HEAD")
    _, desarrollo = desarrollo_actual()
    if correr(["git", "merge-base", "--is-ancestor", desarrollo, actual], ok=(0, 1)).returncode != 0:
        raise Alto(f"La rama de la tarea no contiene el develop actual ({desarrollo[:12]}). "
                   "Tráelo con `git fetch origin develop && git merge origin/develop` "
                   "(o `git rebase origin/develop`), resuelve los choques y vuelve a intentarlo.")


def sin_version(ruta: str) -> bool:
    """Lo que no publica una versión (igual que .github/scripts/check-version.mjs)."""
    return ruta.startswith(".github/") or ruta.startswith("tests/") or ruta.endswith(".md") or ruta in ("LICENSE", ".gitignore")


def copia_limpia(destino: Path, ref: str) -> None:
    """Los archivos del commit, sin nada de la copia de trabajo: lo que de verdad queda en GitHub."""
    tar = correr(["git", "archive", "--format=tar", ref]).stdout
    destino.mkdir(parents=True, exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(tar)) as t:
        t.extractall(destino, filter="data")


def probar(copia: Path, revisor, commit: str) -> None:
    """Pruebas, tipos, build y lo que trae el paquete de npm, en la copia limpia."""
    sha = commit[:7]
    entorno = {**os.environ, "OFICINA_SHA": sha, "OFICINA_DIRTY": "0"}
    for paso in (["npm", "ci"], ["npm", "test"], ["npm", "run", "typecheck"], ["npm", "run", "build"]):
        print("\n$", " ".join(paso), flush=True)
        if subprocess.run(paso, cwd=copia, env=entorno).returncode != 0:
            raise Alto(f"Falló: {' '.join(paso)}")
    print("\n$ npm pack", flush=True)
    salida = subprocess.run(["npm", "pack", "--json"], cwd=copia, capture_output=True, text=True)
    if salida.returncode != 0:
        raise Alto(salida.stderr)
    tgz = copia / json.loads(salida.stdout)[0]["filename"]
    paquete = copia.parent / "paquete"
    with tarfile.open(tgz) as t:
        t.extractall(paquete, filter="data")
    faltan = [r for r in EN_EL_PAQUETE if not (paquete / "package" / r).exists()]
    if faltan:
        raise Alto(f"Al paquete de npm le falta: {', '.join(faltan)}")
    hallazgos = revisor.carpeta(paquete / "package", con_dist=True)
    if hallazgos:
        raise Alto(f"El paquete de npm tiene algo privado ({hallazgos} hallazgos): no lo publiques.")
    print(f"Paquete de npm: {tgz.name} ({tgz.stat().st_size // 1024} KB)")


def comando_pr_publico(rama: str, titulo: str, cuerpo: Path, listo: bool) -> list[str]:
    return ["gh", "pr", "create", "--repo", GH_REPO, "--base", BASE, "--head", rama,
            "--title", titulo, "--body-file", str(cuerpo)] + ([] if listo else ["--draft"])


def texto_del_pr(subidos: list[str], del_paquete: bool, listo: bool) -> str:
    return "\n".join([
        "Changes to Oficina global.",
        "",
        ("**Release:** the next develop → main release publishes a new UTC date-based version (`YYYY.MDD.N`) to npm." if del_paquete else
         "**Release:** only docs, tests or CI changed; the next release publishes nothing for this pull request."),
        ("**Status:** ready for approval." if listo else
         "**Status:** draft: QA is still pending. Do not merge yet."),
        "",
        "**Commits**",
        *[f"- {s}" for s in subidos],
        "",
    ])


NO_PUSH = "sin-push-directo--usa-subir.py"


def url_de_origin() -> str:
    return git("remote", "get-url", "origin")


def preparar_clon() -> None:
    """Deja el clon de modo que nada salga a GitHub sin revisar, tampoco con un `git push` a mano.

    - El control `pre-push` y su revisor van a la carpeta de hooks común del clon (vale para todos sus
      worktrees, estén en la rama que estén), copiados de develop si ya los tiene.
    - `origin` queda sin dirección de push: `git push` falla aunque lleve `--no-verify`. Este comando y
      scripts/release.py suben a la dirección de `origin` nombrándola, después de revisar.
    """
    comun = Path(git("rev-parse", "--path-format=absolute", "--git-common-dir"))
    ganchos = comun / "hooks"
    ganchos.mkdir(exist_ok=True)
    cambio = False
    for origen, destino in (("scripts/hooks/pre-push", "pre-push"), ("scripts/revisar.py", "oficina_revisar.py")):
        datos = de_develop(origen)
        if datos is None:
            datos = (REPO / origen).read_bytes()
        archivo = ganchos / destino
        if not archivo.is_file() or archivo.read_bytes() != datos:
            archivo.write_bytes(datos)
            cambio = True
        archivo.chmod(0o755)
    if git("config", "--local", "--get", "core.hooksPath", ok=(0, 1)):
        git("config", "--local", "--unset", "core.hooksPath")  # el de antes apuntaba a la copia de trabajo
    otro = git("config", "--get", "core.hooksPath", ok=(0, 1))
    if otro:
        raise Alto(f"Tu git tiene `core.hooksPath = {otro}` (configuración global): con eso el control antes del push no corre. "
                   "Quítalo o apúntalo a la carpeta de hooks de este clon.")
    if git("config", "--local", "--get", "remote.origin.pushurl", ok=(0, 1)) != NO_PUSH:
        git("config", "--local", "remote.origin.pushurl", NO_PUSH)
        cambio = True
    if cambio:
        print("Clon preparado: control antes de cada push instalado y `git push` directo a origin desactivado.")


def subir(args: list[str]) -> int:
    if not args or not re.fullmatch(r"[A-Z]+-\d+", args[0]) or "-m" not in args:
        print(__doc__)
        return 2
    tarea = args[0]
    mensaje = args[args.index("-m") + 1].strip()
    if not mensaje.startswith(f"{tarea}: "):
        raise Alto(f"El mensaje empieza con «{tarea}: ».")
    listo, rapido, seco = "--listo" in args, "--rapido" in args, "--seco" in args
    if listo and rapido:
        raise Alto("--listo va sin --rapido: lo que se puede fusionar (y publicar) pasa antes por pruebas, build y la revisión del paquete.")

    commit = git("rev-parse", "HEAD")  # lo que se revisa y lo que se sube: este commit, aunque HEAD se mueva después
    sucio = git("status", "--porcelain", "--", ".")
    if sucio:
        print(f"Ojo: hay cambios sin commit en este repo; no van al PR:\n{sucio}\n")

    tmp = Path(tempfile.mkdtemp(prefix="subir-"))
    try:
        config = cargar_revisar().leer_config(REPO)
        env_gh = entorno_gh(config)
        git("fetch", "origin", env=env_gh)
        preparar_clon()
        revisar = cargar_revisar(tmp)
        if config.get("prefijos_publicos") and tarea.split("-")[0] not in config["prefijos_publicos"]:
            raise Alto(f"«{tarea}» no es una tarea de un tablero que se pueda nombrar aquí ({', '.join(config['prefijos_publicos'])}).")
        revisar_rama_actual(commit)
        ref_base, _ = desarrollo_actual()
        rama = tarea.lower()
        nuevo = [commit, "--not", "--remotes=origin"]  # lo que GitHub todavía no tiene
        subidos = git("log", "--no-merges", "--reverse", "--format=%s", f"{ref_base}..{commit}").splitlines()
        if not subidos:
            raise Alto("Esta rama no tiene commits nuevos sobre develop: no hay nada que subir.")
        try:
            revisor = revisar.armar(REPO)
        except revisar.SinDatos as error:
            raise Alto(str(error)) from error
        del_paquete = any(not sin_version(ruta) for ruta in git("diff", "--name-only", "--no-renames", ref_base, commit).splitlines())
        titulo = mensaje
        cuerpo = texto_del_pr(subidos, del_paquete, listo)

        hallazgos = revisor.objetos(REPO, *nuevo)
        hallazgos += revisor.commits(REPO, *nuevo)
        hallazgos += revisor.ruta(rama)
        hallazgos += revisor.texto("título del PR", titulo) + revisor.texto("texto del PR", cuerpo)
        if hallazgos:
            raise Alto(f"Hay algo privado en lo que se iba a subir ({hallazgos} hallazgos, arriba). Corrígelo y vuelve a intentarlo; "
                       "si está en el mensaje o la firma de un commit, reescríbelo (`git rebase -i` o `git commit --amend --reset-author`).")
        print("0 hallazgos de datos privados en los archivos, los commits y el texto del PR.")
        if not rapido:
            copia = tmp / "copia"
            copia_limpia(copia, commit)
            probar(copia, revisor, commit)

        hay_remota = git("ls-remote", "--heads", "origin", rama, env=env_gh)
        if hay_remota:
            remota = hay_remota.split()[0]
            git("fetch", "origin", rama, env=env_gh)
            if correr(["git", "merge-base", "--is-ancestor", remota, commit], ok=(0, 1)).returncode == 1:
                raise Alto(f"La rama {rama} en GitHub tiene commits que no están aquí (alguien la actualizó allá). "
                           f"Tráelos con `git pull origin {rama}` y vuelve a intentarlo.")
        if seco:
            print(f"\n[seco] rama {rama}; PR {rama} → {BASE} ({'existe' if hay_remota else 'nueva'}), commit {commit[:7]}"
                  f"\n[seco] título: {titulo}\n{cuerpo}")
            print(git("diff", "--stat", ref_base, commit))
            return 0

        # A la dirección de origin, nombrándola (el push a secas está desactivado), sin el control (ya corrió aquí arriba)
        # y sin tags que vengan pegados a estos commits.
        git("push", "--no-verify", "--no-follow-tags", url_de_origin(), f"{commit}:refs/heads/{rama}", env=env_gh)
        SUBIDO.append(f"{rama} ({commit[:7]})")

        abiertos = json.loads(correr(["gh", "pr", "list", "--repo", GH_REPO, "--head", rama, "--state", "open",
                                      "--json", "number,url,isDraft"], env=env_gh).stdout)
        cuerpo_f = tmp / "cuerpo.md"
        cuerpo_f.write_text(cuerpo)
        if abiertos:
            pr = abiertos[0]
            # Por la API REST: `gh pr edit` pide los «Projects (classic)» que GitHub ya cerró y falla (JST-295).
            cuerpo_j = tmp / "cuerpo.json"
            cuerpo_j.write_text(json.dumps({"title": titulo, "body": cuerpo}))
            correr(["gh", "api", "-X", "PATCH", f"repos/{GH_REPO}/pulls/{pr['number']}", "--input", str(cuerpo_j)], env=env_gh)
            if listo and pr["isDraft"]:
                correr(["gh", "pr", "ready", str(pr["number"]), "--repo", GH_REPO], env=env_gh)
            elif not listo and not pr["isDraft"]:
                correr(["gh", "pr", "ready", str(pr["number"]), "--repo", GH_REPO, "--undo"], env=env_gh)
            url = pr["url"]
        else:
            url = correr(comando_pr_publico(rama, titulo, cuerpo_f, listo), env=env_gh).stdout.decode().strip().splitlines()[-1]
        print(f"\nPR: {url}\n  rama {rama} → {BASE}, commit {commit[:7]}, "
              f"{'entra al próximo release con versión por fecha' if del_paquete else 'no cambia el paquete'}, "
              f"{'listo para aprobar' if listo else 'borrador (falta QA)'}")
        return 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def main() -> int:
    try:
        return subir(sys.argv[1:])
    except Alto as e:
        if SUBIDO:
            print(f"\nSubí {', '.join(SUBIDO)}, pero después falló el PR: hay que revisarlo a mano. {e}")
        else:
            print(f"\nNo subí nada. {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
