import { afterEach, describe, expect, it } from "vitest";
import { checkCatalog, placeholders, scanSources } from "../scripts/i18n-scan.mjs";
import { CATALOGS, LOCALES, getLocale, msg, pickLocale, plural, setLocale, t } from "../src/i18n.js";
import { EN_PARTS, en } from "../src/i18n/en/index.js";

afterEach(() => setLocale("es"));

describe("idiomas (JST-413)", () => {
  it("fuera del navegador queda el idioma del código", () => {
    expect(getLocale()).toBe("es");
    expect(t("Sin asignar")).toBe("Sin asignar");
  });

  it("elige el idioma guardado, después el del navegador y si no, inglés", () => {
    expect(pickLocale("en", ["es-CL"])).toBe("en");
    expect(pickLocale(null, ["es-CL", "en-US"])).toBe("es");
    expect(pickLocale(null, ["pt-BR", "EN-gb"])).toBe("en");
    expect(pickLocale("xx", ["es"])).toBe("es");
    expect(pickLocale(undefined, ["fr-FR"])).toBe("en");
    expect(pickLocale(null, [])).toBe("en");
  });

  it("rellena los marcadores y deja los que no conoce", () => {
    expect(t("Ver {n} más · quedan {left}", { n: 5, left: 12 })).toBe("Ver 5 más · quedan 12");
    expect(t("Hola {quien}", {})).toBe("Hola {quien}");
  });

  it("la nota de contexto no se muestra", () => {
    expect(t("Abrir§verbo")).toBe("Abrir");
    expect(msg("Abrir§verbo")).toBe("Abrir§verbo");
  });

  it("traduce con el catálogo y deja el español si falta la entrada", () => {
    setLocale("en");
    const [source, translated] = Object.entries(en)[0]!;
    expect(t(source)).toBe(translated.split("§")[0]);
    expect(t("Texto que no está en ningún catálogo")).toBe("Texto que no está en ningún catálogo");
  });

  it("los plurales salen en el idioma de la interfaz", () => {
    expect(plural(1, "día", "días")).toBe("1 día");
    expect(plural(3, "día", "días")).toBe("3 días");
    setLocale("en");
    expect(plural(1, "día", "días")).toBe("1 day");
    expect(plural(3, "día", "días")).toBe("3 days");
  });

  it("cada idioma tiene nombre y etiqueta de formato", () => {
    for (const locale of LOCALES) {
      expect(locale.name.length).toBeGreaterThan(0);
      expect(() => new Intl.NumberFormat(locale.tag)).not.toThrow();
    }
  });
});

describe("textos traducibles del código", () => {
  const { sources, problems } = scanSources();

  it("son literales, sin ${…}", () => {
    expect(problems).toEqual([]);
  });

  it("se encuentran", () => {
    expect(sources.size).toBeGreaterThan(300);
  });

  // Un idioma nuevo entra a estas pruebas con solo registrarlo en `CATALOGS`.
  const catalogs = Object.entries(CATALOGS).flatMap(([locale, catalog]) => (catalog ? [[locale, catalog] as const] : []));

  describe.each(catalogs)("catálogo «%s»", (_locale, catalog) => {
    const report = checkCatalog(sources, catalog);

    it("tiene todos los textos del código", () => {
      expect(report.missing).toEqual([]);
    });

    it("no guarda textos que el código ya no usa", () => {
      expect(report.unused).toEqual([]);
    });

    it("cada traducción conserva los marcadores de su texto", () => {
      expect(report.mismatched.map((text) => `${text} → ${catalog[text]} (${placeholders(text).join()})`)).toEqual([]);
    });

    it("no deja traducciones vacías ni notas de contexto en el valor", () => {
      expect(Object.entries(catalog).filter(([, value]) => !value.trim() || value.includes("§"))).toEqual([]);
    });
  });

  it("las partes del inglés no se contradicen", () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const [part, entries] of Object.entries(EN_PARTS)) {
      for (const [text, value] of Object.entries(entries)) {
        const before = seen.get(text);
        if (before !== undefined && before !== value) clashes.push(`${part}: ${text} → «${value}» y «${before}»`);
        seen.set(text, value);
      }
    }
    expect(clashes).toEqual([]);
  });
});
