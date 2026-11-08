import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { archivosQuePublican, prefijoFecha, versionDeBuild, versionLocal, versionPublicada } from "../scripts/version.mjs";

describe("versión por fecha", () => {
  it("usa UTC y MDD sin cero delante", () => {
    expect(prefijoFecha(new Date("2026-11-03T23:59:59-03:00"))).toBe("2026.1104");
    expect(prefijoFecha(new Date("2027-01-05T12:00:00Z"))).toBe("2027.105");
    expect(prefijoFecha(new Date("2026-12-31T23:59:59Z"))).toBe("2026.1231");
    expect(prefijoFecha(new Date("2027-01-01T00:00:00Z"))).toBe("2027.101");
  });

  it("cuenta 0, 1 o 2 versiones ya publicadas ese día", () => {
    const dia = new Date("2026-11-04T12:00:00Z");
    expect(versionPublicada(["0.14.5", "2026.1103.4"], dia)).toBe("2026.1104.0");
    expect(versionPublicada(["2026.1104.0"], dia)).toBe("2026.1104.1");
    expect(versionPublicada(["2026.1104.0", "2026.1104.1", "2026.1104.10-malformada"], dia)).toBe("2026.1104.3");
  });

  it("distingue builds locales limpios y con cambios", () => {
    const fecha = new Date("2026-11-04T12:00:00Z");
    expect(versionLocal({ fecha, sha: "a1b2c3d" })).toBe("2026.1104.0-dev+a1b2c3d");
    expect(versionLocal({ fecha, sha: "a1b2c3d", dirty: true })).toBe("2026.1104.0-dev+a1b2c3d.dirty");
  });

  it("usa la versión de publicación calculada por el runner", () => {
    const build = versionDeBuild({
      fecha: new Date("2026-11-04T12:00:00Z"),
      env: { OFICINA_VERSION: "2026.1104.2", OFICINA_SHA: "a1b2c3d", OFICINA_DIRTY: "0" },
    });
    expect(build).toEqual({ version: "2026.1104.2", sha: "a1b2c3d", dirty: false });
  });

  it("mantiene el mismo criterio para omitir textos, pruebas y CI", () => {
    expect(archivosQuePublican(["README.md", "tests/version.spec.ts", ".github/workflows/ci.yml", "src/ui/pagina.tsx"])).toEqual(["src/ui/pagina.tsx"]);
  });

  it("calcula en seco la siguiente versión con metadatos de npm de mentira", () => {
    const carpeta = mkdtempSync(join(tmpdir(), "oficina-version-"));
    try {
      const metadata = join(carpeta, "npm.json");
      const salida = join(carpeta, "github-output");
      writeFileSync(metadata, JSON.stringify({ versions: { "2026.1104.0": {}, "2026.1104.1": {} }, "dist-tags": { latest: "2026.1104.1" } }));
      const resultado = JSON.parse(
        execFileSync(
          process.execPath,
          ["scripts/version.mjs", "release", "--metadata", metadata, "--assume-changed", "--at", "2026-11-04T23:59:59Z"],
          { encoding: "utf8", env: { ...process.env, GITHUB_OUTPUT: salida, GITHUB_STEP_SUMMARY: "" } },
        ),
      );
      expect(resultado).toMatchObject({ version: "2026.1104.2", publish: "true" });
    } finally {
      rmSync(carpeta, { recursive: true, force: true });
    }
  });

  it("usa la versión exacta solo en un tag de release y -dev+sha fuera de él", () => {
    const repo = mkdtempSync(join(tmpdir(), "oficina-version-tag-"));
    const git = (...args: string[]) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
    try {
      git("init", "-b", "develop");
      git("config", "user.name", "Prueba");
      git("config", "user.email", "prueba@example.invalid");
      writeFileSync(join(repo, "archivo.txt"), "base\n");
      git("add", "archivo.txt");
      git("commit", "-m", "base");
      const sha = git("rev-parse", "--short=7", "HEAD");
      const fecha = new Date("2026-11-07T12:00:00Z");
      expect(versionDeBuild({ cwd: repo, env: {}, fecha }).version).toBe(`2026.1107.0-dev+${sha}`);

      git("tag", "v2026.1107.2");
      expect(versionDeBuild({ cwd: repo, env: {}, fecha })).toMatchObject({ version: "2026.1107.2", dirty: false });
      git("tag", "-d", "v2026.1107.2");
      git("tag", "oficina-pixel-v2026.1107.2");
      expect(versionDeBuild({ cwd: repo, env: {}, fecha }).version).toBe("2026.1107.2");

      writeFileSync(join(repo, "archivo.txt"), "después del tag\n");
      git("commit", "-am", "después");
      const nuevoSha = git("rev-parse", "--short=7", "HEAD");
      expect(versionDeBuild({ cwd: repo, env: {}, fecha }).version).toBe(`2026.1107.0-dev+${nuevoSha}`);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
