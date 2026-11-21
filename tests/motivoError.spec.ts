import { describe, expect, it } from "vitest";
import { motivoDeError } from "../src/avisos.js";
import { motivoError, TEXTO_ERROR } from "../src/charlas.js";
import { categoriaError, MOTIVO_VOZ, type CategoriaError } from "../src/motivoError.js";

describe("un solo clasificador de motivos de error (JST-415)", () => {
  it("la categoría sale del código o del texto", () => {
    expect(categoriaError("Claude usage limit reached", null)).toBe("limite");
    expect(categoriaError(null, "provider_quota")).toBe("limite");
    expect(categoriaError("Run timed out after 3600s", null)).toBe("tiempo");
    expect(categoriaError(null, "timeout")).toBe("tiempo");
    expect(categoriaError(null, "timed_out")).toBe("tiempo");
    expect(categoriaError(null, "acpx_session_init_failed")).toBe("inicio");
    expect(categoriaError("tests failed", null)).toBe("pruebas");
    expect(categoriaError("HTTP 403 forbidden", null)).toBe("acceso");
    expect(categoriaError(null, "hermes_gateway_auth_failed")).toBe("acceso");
    expect(categoriaError("Process exited with exit code 1", null)).toBe("caida");
    expect(categoriaError(null, "process_lost")).toBe("caida");
    expect(categoriaError(null, "setup_failed")).toBe("carpeta");
    expect(categoriaError("The computer went to sleep", null)).toBe("dormida");
  });

  it("lo que no se reconoce es nada: ni la voz ni la charla inventan", () => {
    expect(categoriaError("generate failed", null)).toBeNull();
    expect(categoriaError(null, null)).toBeNull();
    expect(categoriaError(42, {})).toBeNull();
    expect(motivoDeError("generate failed", null)).toBeNull();
    expect(motivoDeError(null, null)).toBeNull();
  });

  it("para lo mismo, la voz y la charla coinciden en la categoría: pasarse del tiempo", () => {
    const entrada = { error: "Timed out after 3s", code: "timeout" };
    expect(motivoDeError(entrada.error, entrada.code)).toBe("se le acabó el tiempo");
    expect(motivoError(entrada.error)).toBe("Se le acabó el tiempo.");
  });

  it("y en las demás que las dos tienen", () => {
    const pares: Array<[string, CategoriaError, string]> = [
      ["Claude usage limit reached", "limite", "Se quedó sin cupo, parece."],
      ["HTTP 403 forbidden", "acceso", "Un tema de permisos."],
      ["Process exited with exit code 1", "caida", "Se le cayó el proceso."],
    ];
    for (const [texto, cat, charla] of pares) {
      expect(categoriaError(texto, null)).toBe(cat);
      expect(motivoDeError(texto, null)).toBe(MOTIVO_VOZ[cat]);
      expect(motivoError(texto)).toBe(charla);
    }
  });

  it("sin motivo conocido, la charla no inventa uno: da null (las variantes sin motivo no lo mencionan)", () => {
    expect(motivoError(null)).toBeNull();
    expect(motivoError("generate failed")).toBeNull();
    for (const texto of Object.values(TEXTO_ERROR)) expect(texto).not.toMatch(/no dice|no sé/i);
  });
});

describe("el clasificador no inventa motivos (JST-415, revisión)", () => {
  it("«limit» suelto no es límite de uso: contexto, recursión y tokens dan desconocido", () => {
    for (const texto of ["context length limit exceeded", "Maximum recursion limit", "max tokens limit reached"]) {
      expect(categoriaError(texto, null), texto).toBeNull();
      expect(motivoDeError(texto, null), texto).toBeNull();
    }
  });

  it("«límite de uso» sí es de cupo: rate limit, usage limit, quota, 429, too many requests", () => {
    for (const texto of ["rate limit hit", "usage limit reached", "quota exceeded", "HTTP 429", "Too many requests"]) expect(categoriaError(texto, null), texto).toBe("limite");
  });

  it("«permission denied» de un archivo no es de conexión", () => {
    expect(categoriaError("EACCES: permission denied", null)).toBeNull();
    expect(motivoDeError("EACCES: permission denied", null)).toBeNull();
  });

  it("un 401 o 403 suelto (una línea del código) no es de conexión; como estado HTTP sí", () => {
    expect(categoriaError("Error at line 401", null)).toBeNull();
    expect(categoriaError("Error at line 403 of main.ts", null)).toBeNull();
    for (const texto of ["status 401", "HTTP 403", "401 Unauthorized", "403 Forbidden"]) expect(categoriaError(texto, null), texto).toBe("acceso");
  });

  it("«Command failed with exit code 1» no es que se cortó", () => {
    expect(categoriaError("Command failed with exit code 1", null)).toBeNull();
    expect(motivoDeError("Command failed with exit code 1", null)).toBeNull();
  });

  it("el código manda sobre el texto", () => {
    expect(categoriaError("rate limit", "process_lost")).toBe("caida");
    expect(categoriaError("tests failed", "setup_failed")).toBe("carpeta");
    expect(categoriaError("lo que sea", "provider_quota")).toBe("limite");
  });
});
