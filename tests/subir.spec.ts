import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const comprobacion = `
import importlib.util
import sys
from pathlib import Path

spec = importlib.util.spec_from_file_location("subir", sys.argv[1])
subir = importlib.util.module_from_spec(spec)
spec.loader.exec_module(subir)
subir.REPO = Path(sys.argv[2])
try:
    subir.revisar_rama_actual()
except subir.Alto as error:
    print(error)
    sys.exit(1)
`;

describe("publicación con GitFlow", () => {
  it("rechaza una rama que no contiene develop y acepta una rama de tarea al día", () => {
    const repo = mkdtempSync(join(tmpdir(), "oficina-subir-"));
    const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "pipe" });
    const revisar = () => spawnSync("python3", ["-I", "-c", comprobacion, resolve(__dirname, "../subir.py"), repo], { encoding: "utf8" });
    try {
      git("init", "-b", "develop");
      git("config", "user.name", "Prueba");
      git("config", "user.email", "prueba@example.invalid");
      writeFileSync(join(repo, "archivo.txt"), "base\n");
      git("add", "archivo.txt");
      git("commit", "-m", "base");
      git("checkout", "-b", "jst-383");
      writeFileSync(join(repo, "tarea.txt"), "cambio de la tarea\n");
      git("add", "tarea.txt");
      git("commit", "-m", "arreglo");
      git("checkout", "develop");
      writeFileSync(join(repo, "archivo.txt"), "develop avanzó\n");
      git("commit", "-am", "avance");
      git("checkout", "jst-383");

      const vieja = revisar();
      expect(vieja.status).toBe(1);
      expect(vieja.stdout + vieja.stderr).toContain("no contiene el develop actual");
      expect(vieja.stdout + vieja.stderr).toContain("git merge origin/develop");

      git("merge", "develop");
      const alDia = revisar();
      expect(alDia.status).toBe(0);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("crea el PR público de la tarea con base develop", () => {
    const codigo = `
import importlib.util
import json
import sys
from pathlib import Path
spec = importlib.util.spec_from_file_location("subir", sys.argv[1])
subir = importlib.util.module_from_spec(spec)
spec.loader.exec_module(subir)
print(json.dumps(subir.comando_pr_publico("jst-383", "JST-383: Test", Path(sys.argv[2]), False)))
`;
    const cuerpo = join(mkdtempSync(join(tmpdir(), "oficina-pr-")), "cuerpo.md");
    writeFileSync(cuerpo, "Test\n");
    const resultado = spawnSync("python3", ["-I", "-c", codigo, resolve(__dirname, "../subir.py"), cuerpo], { encoding: "utf8" });
    expect(resultado.status).toBe(0);
    const comando = JSON.parse(resultado.stdout);
    expect(comando).toEqual(expect.arrayContaining(["--base", "develop", "--head", "jst-383"]));
    expect(comando).not.toEqual(expect.arrayContaining(["--base", "main"]));
    rmSync(join(cuerpo, ".."), { recursive: true, force: true });
  });
});
