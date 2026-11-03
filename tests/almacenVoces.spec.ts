// Dónde quedan los audios de las voces (0.13.0, issue #9): fuera del plugin, publicados en `dist/ui/voces/`.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { adoptar, carpetaAlmacen, carpetaDatos, prepararAlmacen, publicar, sincronizar } from "../src/almacenVoces.js";

const tmp = () => mkdtempSync(join(tmpdir(), "oficina-almacen-test-"));

function escribir(dir: string, rel: string, texto: string): void {
  mkdirSync(join(dir, rel, ".."), { recursive: true });
  writeFileSync(join(dir, rel), texto);
}

describe("la carpeta de datos", () => {
  it("es la del sistema: Mac, Windows y Linux (sin leer variables de entorno)", () => {
    expect(carpetaDatos("darwin", "/Users/usuario")).toBe(join("/Users/usuario", "Library", "Application Support", "oficina-global"));
    expect(carpetaDatos("win32", "C:\\Users\\ana")).toBe(join("C:\\Users\\ana", "AppData", "Local", "oficina-global"));
    expect(carpetaDatos("linux", "/home/ana")).toBe(join("/home/ana", ".local", "share", "oficina-global"));
    expect(carpetaDatos("freebsd", "/home/ana")).toBe(join("/home/ana", ".local", "share", "oficina-global"));
  });

  it("una por instalación del plugin (por su ruta), siempre la misma para la misma ruta", () => {
    const datos = tmp();
    const a = join(tmp(), "paperclip-plugin-oficina-global");
    const b = join(tmp(), "oficina-global");
    mkdirSync(a);
    mkdirSync(b);
    expect(carpetaAlmacen(a, datos)).toBe(carpetaAlmacen(a, datos));
    expect(carpetaAlmacen(a, datos)).not.toBe(carpetaAlmacen(b, datos));
    expect(carpetaAlmacen(a, datos)).toMatch(/voces[/\\]paperclip-plugin-oficina-global-[0-9a-f]{8}$/);
    // Una ruta que no existe (todavía) también tiene la suya.
    expect(carpetaAlmacen(join(datos, "no-existe"), datos)).toMatch(/no-existe-[0-9a-f]{8}$/);
  });
});

describe("publicar", () => {
  it("deja el archivo en la carpeta pública (con un enlace duro: no ocupa más), también en vivo/", () => {
    const almacen = tmp();
    const publico = tmp();
    escribir(almacen, "vivo/a.wav", "audio");
    publicar(almacen, publico, "vivo/a.wav");
    expect(readFileSync(join(publico, "vivo", "a.wav"), "utf8")).toBe("audio");
    expect(statSync(join(publico, "vivo", "a.wav")).ino).toBe(statSync(join(almacen, "vivo", "a.wav")).ino);
  });

  it("vuelve a publicar un JSON que se reescribió", () => {
    const almacen = tmp();
    const publico = tmp();
    escribir(almacen, "indice.json", "1");
    publicar(almacen, publico, "indice.json");
    escribir(almacen, "indice.json", "22");
    publicar(almacen, publico, "indice.json");
    expect(readFileSync(join(publico, "indice.json"), "utf8")).toBe("22");
  });
});

describe("al arrancar", () => {
  it("la carpeta pública queda igual que el almacén: lo que falta se publica y lo que sobra se borra", () => {
    const almacen = tmp();
    const publico = tmp();
    escribir(almacen, "indice.json", "{}");
    escribir(almacen, "a.mp3", "a");
    escribir(almacen, "vivo/b.wav", "b");
    escribir(publico, "viejo.mp3", "x");
    escribir(publico, "otra-cosa.txt", "no es de las voces");
    expect(sincronizar(almacen, publico)).toEqual({ publicados: 3, borrados: 1 });
    expect(existsSync(join(publico, "a.mp3"))).toBe(true);
    expect(existsSync(join(publico, "vivo", "b.wav"))).toBe(true);
    expect(existsSync(join(publico, "viejo.mp3"))).toBe(false);
    expect(existsSync(join(publico, "otra-cosa.txt"))).toBe(true);
    // Otra vez: nada (el JSON público ya es el mismo archivo).
    expect(sincronizar(almacen, publico)).toEqual({ publicados: 0, borrados: 0 });
    // Reescrito aparte y renombrado (como lo guarda el worker): se vuelve a publicar.
    writeFileSync(join(almacen, "indice.json.tmp"), '{"v":2}');
    renameSync(join(almacen, "indice.json.tmp"), join(almacen, "indice.json"));
    expect(sincronizar(almacen, publico)).toEqual({ publicados: 1, borrados: 0 });
    expect(readFileSync(join(publico, "indice.json"), "utf8")).toBe('{"v":2}');
  });

  it("publicar lo que ya está publicado no deja temporales (rename entre dos enlaces del mismo archivo no hace nada)", () => {
    const almacen = tmp();
    const publico = tmp();
    escribir(almacen, "vivo.json", "{}");
    expect(publicar(almacen, publico, "vivo.json")).toBe(true);
    expect(publicar(almacen, publico, "vivo.json")).toBe(false);
    expect(readdirSync(publico)).toEqual(["vivo.json"]);
  });

  it("una actualización desde npm (carpeta pública vacía) no pierde nada", () => {
    const almacen = tmp();
    escribir(almacen, "indice.json", "{}");
    escribir(almacen, "a.mp3", "a");
    const nueva = tmp();
    expect(prepararAlmacen(almacen, nueva)).toEqual({ adoptado: false, publicados: 2, borrados: 0 });
    expect(readFileSync(join(nueva, "a.mp3"), "utf8")).toBe("a");
  });

  it("la primera vez adopta los audios de antes de la 0.13.0 (en dist/ui/voces) y no los vuelve a adoptar", () => {
    const almacen = join(tmp(), "voces", "plugin-1234");
    const publico = tmp();
    escribir(publico, "indice.json", '{"version":1}');
    escribir(publico, "a.mp3", "a");
    escribir(publico, "vivo/b.mp3", "b");
    expect(prepararAlmacen(almacen, publico).adoptado).toBe(true);
    expect(readFileSync(join(almacen, "vivo", "b.mp3"), "utf8")).toBe("b");
    expect(readFileSync(join(publico, "a.mp3"), "utf8")).toBe("a");
    escribir(publico, "c.mp3", "c");
    expect(adoptar(almacen, publico)).toBe(false);
  });
});
