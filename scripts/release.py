"""Abre o actualiza el PR develop → main, sin fusionarlo ni publicar nada (JST-383, JST-419).

Uso, desde cualquier carpeta:
  python3 -I scripts/release.py [--seco]

Antes de preparar el PR incorpora main en develop si el merge del release anterior lo dejó
atrás. El título es Release AAAA-MM-DD (UTC) y el cuerpo lista los PRs que entran.
--seco no empuja ramas ni crea o modifica PRs.
"""
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
GH_REPO = "jstm-co/oficina-global"


class Alto(Exception):
    pass


def correr(cmd: list[str], cwd: Path | None = None, env: dict | None = None, ok=(0,)) -> subprocess.CompletedProcess:
    r = subprocess.run(cmd, cwd=REPO if cwd is None else cwd, env=env, capture_output=True)
    if r.returncode not in ok:
        raise Alto(f"Falló: {' '.join(cmd)}\n{r.stderr.decode(errors='replace')}{r.stdout.decode(errors='replace')}")
    return r


def git(*args: str, cwd: Path | None = None, env: dict | None = None, ok=(0,)) -> str:
    return correr(["git", *args], cwd, env, ok).stdout.decode().strip()


def cargar_revisar():
    spec = importlib.util.spec_from_file_location("revisar", REPO / "scripts" / "revisar.py")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def es_ancestro(antes: str, despues: str) -> bool:
    return correr(["git", "merge-base", "--is-ancestor", antes, despues], ok=(0, 1)).returncode == 0


def adelantar_develop(env: dict, seco: bool) -> None:
    if es_ancestro("origin/main", "origin/develop"):
        return
    if seco:
        print("[seco] Incorporaría origin/main en origin/develop antes del PR.")
        return
    # Se sube a la dirección de origin, nombrándola: el `git push` a secas está desactivado en los clones de los
    # mantenedores (subir.py). Lo que va es lo que ya está en main, más un merge que se revisa aquí.
    destino = git("remote", "get-url", "origin")
    if es_ancestro("origin/develop", "origin/main"):
        git("push", "--no-verify", "--no-follow-tags", destino, "origin/main:refs/heads/develop", env=env)
    else:
        tmp = Path(tempfile.mkdtemp(prefix="oficina-release-merge-"))
        creado = False
        try:
            git("worktree", "add", "--detach", str(tmp), "origin/develop")
            creado = True
            # El merge lo firma la identidad de git de este repo; el control de datos privados la revisa abajo.
            git("merge", "--no-edit", "origin/main", cwd=tmp, env=env)
            if REVISOR is None:
                raise Alto("Falta armar el revisor de datos privados antes de subir el merge.")
            # Solo el merge es nuevo (lo demás ya está en GitHub): su firma y lo que traiga que GitHub no tenga.
            hallazgos = REVISOR.commits(tmp, "-1", "HEAD") + REVISOR.objetos(tmp, "HEAD", "--not", "--remotes=origin")
            if hallazgos:
                raise Alto("El merge de main en develop no se puede publicar así (arriba dice por qué). Si es la firma, "
                           "configura `git config user.email` con tu dirección noreply de GitHub.")
            git("push", "--no-verify", "--no-follow-tags", destino, "HEAD:refs/heads/develop", cwd=tmp, env=env)
        finally:
            if creado:
                git("worktree", "remove", "--force", str(tmp), ok=(0, 1, 128))
            shutil.rmtree(tmp, ignore_errors=True)
    git("fetch", "origin", "develop", env=env)


def prs_entrantes(env: dict) -> list[dict]:
    datos = json.loads(correr([
        "gh", "pr", "list", "--repo", GH_REPO, "--base", "develop", "--state", "merged",
        "--limit", "200", "--json", "number,title,url,mergeCommit",
    ], env=env).stdout)
    salida = []
    for pr in datos:
        commit = pr.get("mergeCommit", {}).get("oid")
        if commit and es_ancestro(commit, "origin/develop") and not es_ancestro(commit, "origin/main"):
            salida.append(pr)
    return sorted(salida, key=lambda pr: pr["number"])


def cuerpo_release(prs: list[dict]) -> str:
    lineas = ["## Included pull requests", ""]
    lineas += [f"- [#{pr['number']}: {pr['title']}]({pr['url']})" for pr in prs]
    if not prs:
        lineas.append("- No merged task pull requests were found in this range.")
    lineas += ["", "Merging this pull request runs the npm publication workflow on main.", ""]
    return "\n".join(lineas)


REVISOR = None  # scripts/revisar.py armado con los datos de la instancia; lo pone release()


def revisar_textos(textos: dict[str, str]) -> None:
    hallazgos = sum(REVISOR.texto(nombre, texto) for nombre, texto in textos.items())
    if hallazgos:
        raise Alto(f"El título o el texto del PR tiene algo privado ({hallazgos} hallazgos, arriba).")


def abrir_o_actualizar_pr(titulo: str, cuerpo: str, env: dict, tmp: Path) -> str:
    abiertos = json.loads(correr([
        "gh", "pr", "list", "--repo", GH_REPO, "--base", "main", "--head", "develop",
        "--state", "open", "--json", "number,url",
    ], env=env).stdout)
    cuerpo_f = tmp / "release.md"
    cuerpo_f.write_text(cuerpo)
    if abiertos:
        pr = abiertos[0]
        datos = tmp / "release.json"
        datos.write_text(json.dumps({"title": titulo, "body": cuerpo}))
        correr(["gh", "api", "-X", "PATCH", f"repos/{GH_REPO}/pulls/{pr['number']}", "--input", str(datos)], env=env)
        return pr["url"]
    return correr([
        "gh", "pr", "create", "--repo", GH_REPO, "--base", "main", "--head", "develop",
        "--title", titulo, "--body-file", str(cuerpo_f),
    ], env=env).stdout.decode().strip().splitlines()[-1]


def release(seco: bool = False) -> int:
    global REVISOR
    revisar = cargar_revisar()
    config = revisar.leer_config(REPO)
    cuenta = ["--user", config["gh_cuenta"]] if config.get("gh_cuenta") else []
    token = correr(["gh", "auth", "token", *cuenta]).stdout.decode().strip()
    env = {**os.environ, "GH_TOKEN": token}
    try:
        REVISOR = revisar.armar(REPO)
    except revisar.SinDatos as error:
        raise Alto(str(error)) from error
    git("fetch", "origin", "main", "develop", "--tags", env=env)
    adelantar_develop(env, seco)
    if not git("rev-list", "--max-count=1", "origin/main..origin/develop"):
        print("No hay cambios en develop para publicar.")
        return 0
    prs = prs_entrantes(env)
    titulo = f"Release {datetime.now(timezone.utc).strftime('%Y-%m-%d')}"
    cuerpo = cuerpo_release(prs)
    revisar_textos({"titulo.txt": titulo, "cuerpo.md": cuerpo})
    if seco:
        print(f"[seco] PR develop → main\n[seco] título: {titulo}\n{cuerpo}")
        return 0
    tmp = Path(tempfile.mkdtemp(prefix="oficina-release-"))
    try:
        url = abrir_o_actualizar_pr(titulo, cuerpo, env, tmp)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print(f"PR de release: {url}\nNo se fusionó nada ni se publicó en npm.")
    return 0


def main() -> int:
    try:
        return release("--seco" in sys.argv[1:])
    except Alto as e:
        print(e)
        return 1


if __name__ == "__main__":
    sys.exit(main())
