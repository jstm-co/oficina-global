"""Sube a GitHub, como pull request, lo que está commiteado en este repo (JST-284).

Uso, desde la carpeta del repo y con el cambio ya commiteado (es pesado: va por qa-pesado):
  ~/.paperclip/bin/qa-pesado 1800 python3 -I publico/subir.py JST-NN -m "JST-NN: qué cambia" [--listo] [--rapido] [--seco]

  -m        mensaje del commit público, en inglés como el README principal. Lo ve cualquiera:
            sin nombres ni títulos de otras empresas.
  --listo   el PR queda listo para que el usuario lo apruebe (la QA pasó o no hace falta).
            Sin --listo queda como borrador, que GitHub no deja fusionar.
  --rapido  no corre pruebas, tipos ni build aquí (el CI de GitHub los corre igual). Solo
            para borradores: con --listo se corre todo.
  --seco    hace todo menos subir: muestra la rama, el título y el texto del PR.
  --resolver-local
            si ya trajiste y resolviste a mano un merge de GitHub, conserva el árbol exportado
            y crea el commit con origin/develop como segundo padre (sin esto, se detiene al chocar).

Qué hace:
  1. Exige que la rama de la tarea contenga el develop actual; así una rama vieja no puede
     borrar arreglos que ya están en GitHub. Exporta HEAD con publico/exportar.py, que revisa
     que no haya nada privado (y, sin --rapido, corre pruebas, tipos y build, y revisa el paquete).
  2. Arma un commit en ../_publico encima de la rama local `exportado` (la exportación
     anterior), con la cuenta y el correo noreply configurados en el repo interno, en UTC.
  3. Lo junta con develop de GitHub (`git merge-tree`). Si en GitHub se fusionó algo que este
     repo no tiene (el PR de otra persona), primero lo trae aquí en un commit
     «JST-NN: trae lo que se fusionó en GitHub (#N)» y vuelve a exportar.
  4. Sube `jst-NN` al repo interno y al público, y abre o actualiza el PR público a develop.
     El release posterior develop → main calcula y publica una versión por fecha en npm
     (GitHub Actions, .github/workflows/publish.yml); no hay que subir ninguna versión a mano.

Nunca hace push a main ni fusiona: los merges conservan sus aprobaciones.
"""
import fcntl
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parent
PUBLICO = REPO / "publico"
PUB = REPO.parent / "_publico"
GH_REPO = "jstm-co/oficina-global"
BASE_PUBLICA = "develop"
AUTOR = None
GH_CUENTA = None
COAUTOR = None
EXPORTADO = "exportado"
exp = None


def revisar_rama_actual() -> None:
    actual = git("rev-parse", "HEAD", cwd=REPO)
    desarrollo = git("rev-parse", "--verify", "-q", "refs/remotes/origin/develop", cwd=REPO, ok=(0, 1))
    ref = "origin/develop"
    if not desarrollo:
        ref = "refs/heads/develop"
        desarrollo = git("rev-parse", "--verify", "-q", ref, cwd=REPO, ok=(0, 1))
    if not desarrollo:
        raise Alto("No encuentro develop. Tráelo con `git fetch origin develop` y vuelve a intentarlo.")
    if correr(["git", "merge-base", "--is-ancestor", desarrollo, actual], cwd=REPO, ok=(0, 1)).returncode != 0:
        raise Alto(f"La rama de la tarea no contiene el develop actual ({desarrollo[:12]}). "
                   "Tráelo con `git fetch origin develop && git merge origin/develop` "
                   "(o `git rebase origin/develop`), resuelve los choques y vuelve a intentarlo.")


def inicializar() -> None:
    global exp, AUTOR, GH_CUENTA, COAUTOR
    if exp is not None:
        return
    ruta_config = PUBLICO / "configuracion_subir.py"
    if not ruta_config.is_file():
        raise Alto("Este publicador solo funciona desde el repo interno, con su configuración privada.")
    spec = importlib.util.spec_from_file_location("exportar", PUBLICO / "exportar.py")
    exp = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(exp)
    spec = importlib.util.spec_from_file_location("configuracion_subir", ruta_config)
    config = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(config)
    AUTOR, GH_CUENTA, COAUTOR = config.AUTOR, config.GH_CUENTA, config.COAUTOR


class Alto(Exception):
    pass


SUBIDO: list[str] = []  # la rama que ya se subió, si algo falla después (para no decir «no subí nada»)


def correr(cmd: list[str], cwd: Path = PUB, env: dict | None = None, ok=(0,), entrada: bytes | None = None) -> subprocess.CompletedProcess:
    r = subprocess.run(cmd, cwd=cwd, env=env, input=entrada, capture_output=True)
    if r.returncode not in ok:
        raise Alto(f"Falló: {' '.join(cmd)}\n{r.stderr.decode(errors='replace')}{r.stdout.decode(errors='replace')}")
    return r


def git(*args: str, cwd: Path = PUB, env: dict | None = None, ok=(0,)) -> str:
    return correr(["git", *args], cwd, env, ok).stdout.decode().strip()


def sin_version(ruta: str) -> bool:
    """Lo que no publica una versión (igual que .github/scripts/check-version.mjs)."""
    return ruta.startswith(".github/") or ruta.startswith("tests/") or ruta.endswith(".md") or ruta in ("LICENSE", ".gitignore")


def a_privado(ruta: str) -> str | None:
    """Dónde va en este repo un archivo de la copia pública (lo contrario de exportar.py)."""
    if ruta in exp.EN_LA_RAIZ:
        return f"publico/{ruta}"
    if ruta == ".gitignore":
        return "publico/gitignore"
    if ruta.startswith(".github/"):
        return "publico/github/" + ruta[len(".github/"):]
    if ruta == "src/instancia.ts":
        return "publico/instancia.ts"
    if ruta.split("/")[0] in exp.FUERA:
        return None
    return ruta


def package_privado(pub: dict, priv: dict) -> dict:
    """package.json público → el de este repo, con los campos que pone la exportación como estaban aquí."""
    out = {}
    for k in list(priv) + [k for k in pub if k not in priv]:
        if k in exp.CAMPOS_EXPORTADOS:
            if k in priv:
                out[k] = priv[k]
        elif k == "scripts":
            s, ps = pub.get("scripts", {}), priv.get("scripts", {})
            internos = {n: v for n, v in ps.items() if n in exp.SCRIPTS_INTERNOS}
            orden = list(ps) + [n for n in s if n not in ps]
            out[k] = {n: internos.get(n, s.get(n)) for n in orden if n in internos or n in s}
        elif k in pub:
            out[k] = pub[k]
    return out


def lock_privado(pub: dict, priv: dict) -> dict:
    lock = json.loads(json.dumps(pub))
    lock["name"] = priv.get("name", lock.get("name"))
    raiz, raiz_priv = lock.get("packages", {}).get(""), priv.get("packages", {}).get("", {})
    if raiz is not None:
        raiz["name"] = raiz_priv.get("name", raiz.get("name"))
        if "license" in raiz_priv:
            raiz["license"] = raiz_priv["license"]
        else:
            raiz.pop("license", None)
    return lock


def revisar_textos(textos: dict[str, str], real: str, guardar: bool = False) -> None:
    """Pasa el revisor de datos privados por el mensaje del commit y el texto del PR."""
    carpeta = Path(tempfile.mkdtemp(prefix="subir-textos-"))
    for nombre, texto in textos.items():
        (carpeta / nombre).write_text(texto)
    cmd = [sys.executable, "-I", str(PUBLICO / "revisar.py"), str(carpeta), "--guardar-real" if guardar else "--real", real]
    r = subprocess.run(cmd, capture_output=True, text=True)
    shutil.rmtree(carpeta, ignore_errors=True)
    if r.returncode != 0:
        raise Alto(f"El mensaje o el texto del PR tiene algo privado:\n{r.stdout}")


def arbol_de(carpeta: Path, tmp: Path) -> str:
    env = {**os.environ, "GIT_DIR": str(PUB / ".git"), "GIT_WORK_TREE": str(carpeta), "GIT_INDEX_FILE": str(tmp / "indice")}
    git("read-tree", "--empty", env=env)
    git("add", "-A", env=env)
    return git("write-tree", env=env)


def json_igual(a: str, b: str) -> bool:
    try:
        return json.loads(a) == json.loads(b)
    except ValueError:
        return False


def diferencias(t1: str, t2: str) -> list[tuple[str, str]]:
    salida = git("diff", "--name-status", "--no-renames", t1, t2)
    return [tuple(linea.split("\t", 1)) for linea in salida.splitlines() if linea]


def traer_de_github(tarea: str, arbol: str, junto: str, base: str) -> str:
    """Escribe en este repo lo que GitHub tiene y la exportación no, y lo commitea."""
    cambios = diferencias(arbol, junto)
    rutas = []
    for estado, ruta in cambios:
        destino = a_privado(ruta)
        if destino is None:
            raise Alto(f"En GitHub cambió «{ruta}», que en este repo es interno: tráelo a mano.")
        archivo = REPO / destino
        if estado == "D":
            if archivo.exists():
                archivo.unlink()
        else:
            datos = correr(["git", "cat-file", "blob", f"{junto}:{ruta}"]).stdout
            if ruta in ("package.json", "package-lock.json"):
                priv = json.loads(archivo.read_text())
                pub = json.loads(datos)
                nuevo = package_privado(pub, priv) if ruta == "package.json" else lock_privado(pub, priv)
                datos = exp.a_json(nuevo).encode()
            archivo.parent.mkdir(parents=True, exist_ok=True)
            archivo.write_bytes(datos)
        rutas.append(destino)
    prs = sorted({int(n) for n in re.findall(r"#(\d+)", git("log", "--format=%s", f"{base}..origin/develop"))})
    de = f" ({', '.join(f'#{n}' for n in prs)})" if prs else ""
    mensaje = f"{tarea}: trae a este repo lo que se fusionó en GitHub{de}"
    git("add", "-A", "--", *rutas, cwd=REPO)
    git("commit", "-m", mensaje, "-m", COAUTOR, "--", *rutas, cwd=REPO)
    print(f"Traje de GitHub {len(rutas)} archivo(s): {', '.join(rutas)}\n  commit: {mensaje}")
    return mensaje


def comando_pr_publico(rama: str, titulo: str, cuerpo: Path, listo: bool) -> list[str]:
    return ["gh", "pr", "create", "--repo", GH_REPO, "--base", BASE_PUBLICA, "--head", rama,
            "--title", titulo, "--body-file", str(cuerpo)] + ([] if listo else ["--draft"])


def subir(args: list[str]) -> int:
    if not args or not re.fullmatch(r"[A-Z]+-\d+", args[0]) or "-m" not in args:
        print(__doc__)
        return 2
    tarea = args[0]
    mensaje = args[args.index("-m") + 1].strip()
    if not mensaje.startswith(f"{tarea}: "):
        raise Alto(f"El mensaje empieza con «{tarea}: ».")
    listo, rapido, seco = "--listo" in args, "--rapido" in args, "--seco" in args
    resolver_local = "--resolver-local" in args
    if listo and rapido:
        raise Alto("--listo va sin --rapido: lo que se puede fusionar (y publicar) pasa antes por pruebas, build y la revisión del paquete.")

    inicializar()
    if not (PUB / ".git").is_dir():
        raise Alto(f"Falta el clon de GitHub en {PUB}: git clone https://github.com/{GH_REPO}.git {PUB}")
    sucio = git("status", "--porcelain", "--", ".", cwd=REPO)
    if sucio:
        print(f"Ojo: hay cambios sin commit en este repo; no van al PR:\n{sucio}\n")

    token = correr(["gh", "auth", "token", "--user", GH_CUENTA], cwd=REPO).stdout.decode().strip()
    env_gh = {**os.environ, "GH_TOKEN": token}
    git("fetch", "origin", "develop", cwd=REPO, env=env_gh)
    revisar_rama_actual()

    with open(PUB / ".git" / "subir.lock", "w") as candado:
        fcntl.flock(candado, fcntl.LOCK_EX)
        git("fetch", "origin", "--prune", env=env_gh)
        anterior = git("rev-parse", "--verify", "-q", f"refs/heads/{EXPORTADO}", ok=(0, 1))
        if not anterior:
            raise Alto(f"Falta la rama `{EXPORTADO}` en {PUB} (la última exportación). Ver README interno › Publicación.")

        tmp = Path(tempfile.mkdtemp(prefix="subir-"))
        try:
            real = str(tmp / "real.json")
            revisar_textos({"mensaje.txt": mensaje}, real, guardar=True)
            traido = None
            for vuelta in range(2):
                copia = tmp / f"copia{vuelta}"
                if exp.exportar(copia, "HEAD", real, probar=not rapido) != 0:
                    raise Alto("La exportación no pasó (arriba dice por qué).")
                arbol = arbol_de(copia, tmp)
                shutil.rmtree(copia, ignore_errors=True)
                fecha = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+0000")
                env_autor = {**os.environ, "GIT_AUTHOR_NAME": AUTOR[0], "GIT_AUTHOR_EMAIL": AUTOR[1], "GIT_AUTHOR_DATE": fecha,
                             "GIT_COMMITTER_NAME": AUTOR[0], "GIT_COMMITTER_EMAIL": AUTOR[1], "GIT_COMMITTER_DATE": fecha}
                commit = correr(["git", "commit-tree", arbol, "-p", anterior, "-F", "-"], env=env_autor,
                                entrada=(mensaje + "\n\n" + COAUTOR + "\n").encode()).stdout.decode().strip()
                r = correr(["git", "merge-tree", "--write-tree", "--name-only", "origin/develop", commit], ok=(0, 1))
                lineas = r.stdout.decode().splitlines()
                if r.returncode == 1:
                    if not resolver_local:
                        choques = lineas[1:lineas.index("")] if "" in lineas else lineas[1:]
                        raise Alto("Lo de GitHub choca con este cambio en: " + ", ".join(choques) +
                                   "\nHay que resolverlo a mano (README interno › Publicación).")
                    commit = correr(["git", "commit-tree", arbol, "-p", anterior, "-p", "origin/develop", "-F", "-"], env=env_autor,
                                    entrada=(mensaje + "\n\n" + COAUTOR + "\n").encode()).stdout.decode().strip()
                    break
                junto = lineas[0]
                if junto == arbol:
                    break
                difs = diferencias(arbol, junto)
                if all(ruta.endswith(".json") and json_igual(git("show", f"{arbol}:{ruta}"), git("show", f"{junto}:{ruta}"))
                       for _, ruta in difs):
                    break
                if vuelta == 1:
                    raise Alto("Después de traer lo de GitHub la exportación sigue sin cuadrar: " + ", ".join(r for _, r in difs))
                traido = traer_de_github(tarea, arbol, junto, git("merge-base", "origin/develop", commit))
            else:
                raise Alto("No cuadró.")

            rama = tarea.lower()
            if not seco:
                git("push", "origin", f"HEAD:refs/heads/{rama}", cwd=REPO, env=env_gh)
                SUBIDO.append(f"{rama} interna")
                print(f"Rama interna: {rama}")

            if arbol == git("rev-parse", f"{anterior}^{{tree}}"):
                if not listo:
                    print("No hay nada nuevo que subir: la última exportación ya tiene esto.")
                    return 0
                commit = anterior  # solo marcar el PR como listo

            del_paquete = [ruta for _, ruta in diferencias("origin/develop", arbol) if not sin_version(ruta)]
            hay_remota = git("ls-remote", "--heads", "origin", rama, env=env_gh)
            subidos = git("log", "--no-merges", "--reverse", "--format=%s", f"origin/develop..{commit}").splitlines()
            titulo = mensaje
            cuerpo = "\n".join([
                "Changes to Oficina global from the internal workspace.",
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
            revisar_textos({"titulo.txt": titulo, "cuerpo.md": cuerpo}, real)

            if seco:
                print(f"\n[seco] ramas interna y pública {rama}; PR {rama} → {BASE_PUBLICA} "
                      f"({'existe' if hay_remota else 'nueva'}), commit {commit[:7]}"
                      f"\n[seco] título: {titulo}\n{cuerpo}")
                print(git("diff", "--stat", "origin/develop", commit))
                return 0

            empuje = ["push", "origin", f"{commit}:refs/heads/{rama}"]
            if hay_remota:
                remota = hay_remota.split()[0]
                if correr(["git", "merge-base", "--is-ancestor", remota, commit], ok=(0, 1)).returncode == 1:
                    # Si alguien tocó «Update branch» en GitHub, la rama trae un merge de develop que ya está en este commit.
                    extra = git("rev-list", f"{commit}..{remota}").split()
                    if not all(len(git("rev-list", "--parents", "-n", "1", c).split()) > 2 for c in extra):
                        raise Alto(f"La rama {rama} en GitHub tiene commits que no salieron de aquí: revísala a mano.")
                    empuje = ["push", f"--force-with-lease=refs/heads/{rama}:{remota}", "origin", f"{commit}:refs/heads/{rama}"]
            git(*empuje, env=env_gh)
            git("update-ref", f"refs/heads/{EXPORTADO}", commit, anterior)
            SUBIDO.append(f"{rama} pública ({commit[:7]})")

            abiertos = json.loads(correr(["gh", "pr", "list", "--repo", GH_REPO, "--head", rama, "--state", "open",
                                          "--json", "number,url,isDraft"], env=env_gh).stdout)
            cuerpo_f = tmp / "cuerpo.md"
            cuerpo_f.write_text(cuerpo)
            if abiertos:
                pr = abiertos[0]
                # Por la API REST: `gh pr edit` (gh 2.54) pide los «Projects (classic)» que GitHub ya cerró y falla (JST-295).
                cuerpo_j = tmp / "cuerpo.json"
                cuerpo_j.write_text(json.dumps({"body": cuerpo}))
                correr(["gh", "api", "-X", "PATCH", f"repos/{GH_REPO}/pulls/{pr['number']}", "--input", str(cuerpo_j)], env=env_gh)
                if listo and pr["isDraft"]:
                    correr(["gh", "pr", "ready", str(pr["number"]), "--repo", GH_REPO], env=env_gh)
                elif not listo and not pr["isDraft"]:
                    correr(["gh", "pr", "ready", str(pr["number"]), "--repo", GH_REPO, "--undo"], env=env_gh)
                url = pr["url"]
            else:
                crear = comando_pr_publico(rama, titulo, cuerpo_f, listo)
                url = correr(crear, env=env_gh).stdout.decode().strip().splitlines()[-1]
            print(f"\nPR: {url}\n  rama {rama} → {BASE_PUBLICA}, commit {commit[:7]}, "
                  f"{'entra al próximo release con versión por fecha' if del_paquete else 'no cambia el paquete'}, "
                  f"{'listo para aprobar' if listo else 'borrador (falta QA)'}")
            if traido:
                print(f"  antes traje de GitHub: {traido}")
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
