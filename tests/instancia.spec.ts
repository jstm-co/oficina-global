// Los datos de la instancia (aspecto fijo, nombres cortos, pronunciación): validación, registro, archivo y publicación.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { paraDecir } from "../generador/pronunciar.js";
import { aspectoDe } from "../src/aspecto.js";
import { nombreCorto } from "../src/avisos.js";
import { ARCHIVO_INSTANCIA, INSTANCIA_VACIA, instancia, leerDatosInstancia, ponerInstancia } from "../src/datosInstancia.js";
import { cargarInstanciaDeArchivo, publicarInstancia, rutaInstancia } from "../src/instanciaArchivo.js";

const tmp = () => mkdtempSync(join(tmpdir(), "oficina-instancia-test-"));
const agente = { id: "agente-1", nombre: "Ingeniera de Datos y Reportes", cargo: null, rolApi: "engineer", adapterType: "claude_local" };

afterEach(() => ponerInstancia(INSTANCIA_VACIA));

describe("leerDatosInstancia", () => {
  it("lo que no es un objeto da datos vacíos, sin lanzar", () => {
    for (const malo of [null, undefined, 3, "texto", true, [], [1, 2]]) expect(leerDatosInstancia(malo), String(malo)).toEqual(INSTANCIA_VACIA);
  });

  it("lee las tres tablas buenas; las claves son opcionales", () => {
    const d = leerDatosInstancia({ aspectoFijo: { "agente-1": "direccion-1" }, nombresCortos: { "Ingeniera de Datos y Reportes": "Datos" }, pronunciarKokoro: [["\\bNombre\\b", "Cómo se dice"]] });
    expect(d.aspectoFijo).toEqual({ "agente-1": "direccion-1" });
    expect(d.nombresCortos).toEqual({ "Ingeniera de Datos y Reportes": "Datos" });
    expect(d.pronunciarKokoro).toHaveLength(1);
    expect(d.pronunciarKokoro[0]![0]).toBeInstanceOf(RegExp);
    expect(d.pronunciarKokoro[0]![0].flags).toBe("g");
    expect(d.pronunciarKokoro[0]![1]).toBe("Cómo se dice");
    expect(leerDatosInstancia({}).nombresCortos).toEqual({});
  });

  it("descarta valores que no son texto, tablas que no son objetos y pares mal formados", () => {
    const d = leerDatosInstancia({
      aspectoFijo: { a: "qa-1", b: 3, c: null, d: ["x"] },
      nombresCortos: ["no", "es", "objeto"],
      pronunciarKokoro: [["ok", "bien"], ["solo uno"], ["a", "b", "c"], [1, "x"], ["x", 2], "texto", null, ["", "vacía"], ["(", "inválida"]],
    });
    expect(d.aspectoFijo).toEqual({ a: "qa-1" });
    expect(d.nombresCortos).toEqual({});
    expect(d.pronunciarKokoro.map(([re, por]) => [re.source, por])).toEqual([["ok", "bien"]]);
    expect(leerDatosInstancia({ aspectoFijo: "x", pronunciarKokoro: "y" })).toEqual({ aspectoFijo: {}, nombresCortos: {}, pronunciarKokoro: [] });
  });
});

describe("el registro", () => {
  it("parte vacío, se pone y se vuelve a vaciar", () => {
    expect(instancia()).toBe(INSTANCIA_VACIA);
    const d = leerDatosInstancia({ nombresCortos: { X: "Y" } });
    ponerInstancia(d);
    expect(instancia()).toBe(d);
    ponerInstancia(INSTANCIA_VACIA);
    expect(instancia().nombresCortos).toEqual({});
  });

  it("aspectoDe, nombreCorto y la pronunciación de Kokoro cambian con los datos y vuelven a lo fijo al vaciar", () => {
    const aspectoRegla = aspectoDe(agente);
    const cortoRegla = nombreCorto(agente.nombre);
    const fraseKokoro = paraDecir("Plugins, de Nombre Raro: empecé.", "kokoro");
    ponerInstancia(leerDatosInstancia({ aspectoFijo: { "agente-1": "hermes-1" }, nombresCortos: { [agente.nombre]: "Datos", "Líder Técnico": "El líder" }, pronunciarKokoro: [["\\bRaro\\b", "Raaro"]] }));
    expect(aspectoDe(agente)).toBe("hermes-1");
    expect(nombreCorto(agente.nombre)).toBe("Datos");
    expect(nombreCorto("  Ingeniera de Datos y Reportes ")).toBe("Datos");
    // Los de la instancia ganan a los fijos del repo.
    expect(nombreCorto("Líder Técnico")).toBe("El líder");
    expect(paraDecir("Plugins, de Nombre Raro: empecé.", "kokoro")).toBe("Plaguins, de Nombre Raaro: empecé.");
    expect(paraDecir("Plugins, de Nombre Raro: empecé.", "edge")).toBe("Plugins, de Nombre Raro: empecé.");
    ponerInstancia(INSTANCIA_VACIA);
    expect(aspectoDe(agente)).toBe(aspectoRegla);
    expect(nombreCorto(agente.nombre)).toBe(cortoRegla);
    expect(nombreCorto("Líder Técnico")).toBe("Líder técnico");
    expect(paraDecir("Plugins, de Nombre Raro: empecé.", "kokoro")).toBe(fraseKokoro);
  });

  it("sin datos, el resultado es el de siempre", () => {
    expect(nombreCorto("Ingeniero Backend Java / REST")).toBe("Ingeniero backend");
    expect(paraDecir("Plugins", "kokoro")).toBe("Plaguins");
  });
});

describe("cargar desde el archivo", () => {
  it("la ruta está en la carpeta de datos", () => {
    expect(rutaInstancia("/Users/usuario/datos")).toBe(join("/Users/usuario/datos", ARCHIVO_INSTANCIA));
  });

  it("sin archivo: datos vacíos y sin error", () => {
    ponerInstancia(leerDatosInstancia({ nombresCortos: { X: "Y" } }));
    const r = cargarInstanciaDeArchivo(rutaInstancia(tmp()));
    expect(r.error).toBeUndefined();
    expect(r.datos).toEqual(INSTANCIA_VACIA);
    expect(instancia().nombresCortos).toEqual({});
  });

  it("JSON malo: datos vacíos y el motivo en `error`, sin lanzar", () => {
    const dir = tmp();
    writeFileSync(rutaInstancia(dir), "{ esto no es json");
    ponerInstancia(leerDatosInstancia({ nombresCortos: { X: "Y" } }));
    const r = cargarInstanciaDeArchivo(rutaInstancia(dir));
    expect(r.error).toBeTruthy();
    expect(r.datos).toEqual(INSTANCIA_VACIA);
    expect(instancia().nombresCortos).toEqual({});
    // Una ruta que es una carpeta tampoco lanza.
    expect(cargarInstanciaDeArchivo(dir).error).toBeTruthy();
  });

  it("datos buenos: los valida y los deja puestos", () => {
    const dir = tmp();
    writeFileSync(rutaInstancia(dir), JSON.stringify({ aspectoFijo: { "agente-1": "qa-2", "agente-2": 7 }, nombresCortos: { [agente.nombre]: "Datos" }, pronunciarKokoro: [["\\bRaro\\b", "Raaro"]] }));
    const r = cargarInstanciaDeArchivo(rutaInstancia(dir));
    expect(r.error).toBeUndefined();
    expect(r.ruta).toBe(rutaInstancia(dir));
    expect(r.datos.aspectoFijo).toEqual({ "agente-1": "qa-2" });
    expect(instancia()).toBe(r.datos);
    expect(aspectoDe(agente)).toBe("qa-2");
    expect(nombreCorto(agente.nombre)).toBe("Datos");
  });

  it("un archivo con una lista (no un objeto) deja los datos vacíos sin error", () => {
    const dir = tmp();
    writeFileSync(rutaInstancia(dir), "[1, 2]");
    const r = cargarInstanciaDeArchivo(rutaInstancia(dir));
    expect(r.error).toBeUndefined();
    expect(r.datos).toEqual(INSTANCIA_VACIA);
  });
});

describe("publicar para la interfaz", () => {
  it("escribe solo el aspecto y los nombres cortos, sin dejar temporales", () => {
    const ui = join(tmp(), "dist", "ui");
    const d = leerDatosInstancia({ aspectoFijo: { "agente-1": "qa-1" }, nombresCortos: { A: "B" }, pronunciarKokoro: [["x", "y"]] });
    expect(publicarInstancia(ui, d)).toBe(true);
    expect(JSON.parse(readFileSync(join(ui, ARCHIVO_INSTANCIA), "utf8"))).toEqual({ aspectoFijo: { "agente-1": "qa-1" }, nombresCortos: { A: "B" } });
    expect(readdirSync(ui)).toEqual([ARCHIVO_INSTANCIA]);
  });

  it("escribe también cuando está vacío (la interfaz no recibe un 404) y reemplaza lo anterior", () => {
    const ui = tmp();
    publicarInstancia(ui, leerDatosInstancia({ nombresCortos: { A: "B" } }));
    expect(publicarInstancia(ui, INSTANCIA_VACIA)).toBe(true);
    expect(JSON.parse(readFileSync(join(ui, ARCHIVO_INSTANCIA), "utf8"))).toEqual({ aspectoFijo: {}, nombresCortos: {} });
  });

  it("si no puede escribir, devuelve false sin lanzar", () => {
    const dir = tmp();
    const archivo = join(dir, "archivo");
    writeFileSync(archivo, "x");
    expect(publicarInstancia(join(archivo, "ui"), INSTANCIA_VACIA)).toBe(false);
    mkdirSync(join(dir, "ui", ARCHIVO_INSTANCIA), { recursive: true });
    expect(publicarInstancia(join(dir, "ui"), INSTANCIA_VACIA)).toBe(false);
    expect(existsSync(join(dir, "ui", `${ARCHIVO_INSTANCIA}.${process.pid}.tmp`))).toBe(false);
  });
});
