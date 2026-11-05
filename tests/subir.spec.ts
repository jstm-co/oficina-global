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

describe("publicación desde main", () => {
  it("rechaza una rama vieja antes de exportar y acepta main", () => {
    const repo = mkdtempSync(join(tmpdir(), "oficina-subir-"));
    const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "pipe" });
    const revisar = () => spawnSync("python3", ["-I", "-c", comprobacion, resolve(__dirname, "../subir.py"), repo], { encoding: "utf8" });
    try {
      git("init", "-b", "main");
      git("config", "user.name", "Prueba");
      git("config", "user.email", "prueba@example.invalid");
      writeFileSync(join(repo, "archivo.txt"), "base\n");
      git("add", "archivo.txt");
      git("commit", "-m", "base");
      git("branch", "vieja");
      writeFileSync(join(repo, "archivo.txt"), "main tiene un arreglo\n");
      git("commit", "-am", "arreglo");
      git("checkout", "vieja");

      const vieja = revisar();
      expect(vieja.status).toBe(1);
      expect(vieja.stdout + vieja.stderr).toContain("Solo se puede exportar desde la rama local main");

      git("checkout", "main");
      const main = revisar();
      expect(main.status).toBe(0);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
