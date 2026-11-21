// JST-415: la tarea dentro de la frase que se oye («Acabo de terminar el re-QA de la Oficina.», no «esta: …»). Que ninguna
// variante ponga «de esta» o «a esta» lo cuida `tests/charlas.spec.ts`.
import { describe, expect, it } from "vitest";
import { nombrarTarea, sintagmaDeTarea } from "../src/nombrarTarea.js";

describe("el sintagma de una tarea", () => {
  it("con artículo cuando se sabe: por la lista o por cómo termina el sustantivo", () => {
    expect(sintagmaDeTarea("Re-QA de la Oficina global")).toBe("el re-QA de la Oficina global");
    expect(sintagmaDeTarea("Revisión de la página")).toBe("la revisión de la página");
    expect(sintagmaDeTarea("Prueba de login en la app")).toBe("la prueba de login en la app");
    expect(sintagmaDeTarea("Pruebas de carga")).toBe("las pruebas de carga");
    expect(sintagmaDeTarea("Diseño de la ficha")).toBe("el diseño de la ficha");
    expect(sintagmaDeTarea("Migración de la base")).toBe("la migración de la base");
    expect(sintagmaDeTarea("Disponibilidad del servicio")).toBe("la disponibilidad del servicio");
  });

  it("un infinitivo, un rótulo o una palabra que no se sabe van con «lo de»", () => {
    expect(sintagmaDeTarea("Instalar la versión nueva")).toBe("lo de instalar la versión nueva");
    expect(sintagmaDeTarea("Oficina: mostrar el estado")).toBe("lo de Oficina: mostrar el estado");
    expect(sintagmaDeTarea("Zorro y el puente")).toBe("lo de Zorro y el puente");
  });

  it("una sigla no se baja a minúscula; sin título no hay nada que decir", () => {
    expect(sintagmaDeTarea("QA de la 0.5.0")).toBe("el QA de la 0.5.0");
    expect(sintagmaDeTarea(null)).toBe("");
    expect(sintagmaDeTarea("   ")).toBe("");
  });
});

describe("nombrar la tarea en una frase", () => {
  it("el primer «esta» o «esa» pasa a nombrarla; con mayúscula al comienzo de la frase", () => {
    expect(nombrarTarea("Acabo de terminar esta.", "Re-QA de la Oficina global")).toBe("Acabo de terminar el re-QA de la Oficina global.");
    expect(nombrarTarea("Esta ya está. Me gané el café.", "Prueba de login")).toBe("La prueba de login ya está. Me gané el café.");
    expect(nombrarTarea("¿Por esta?", "Instalar la versión")).toBe("¿Por lo de instalar la versión?");
    expect(nombrarTarea("Esa. Ojalá le contesten luego.", "Revisión del panel")).toBe("La revisión del panel. Ojalá le contesten luego.");
  });

  it("«está» y «estas» no se confunden con «esta»", () => {
    expect(nombrarTarea("Todo está listo.", "Re-QA de la Oficina")).toBe("Todo está listo.");
    expect(nombrarTarea("¿Dónde estás?", "Re-QA de la Oficina")).toBe("¿Dónde estás?");
  });

  it("sin título pero con tarea, «esta tarea»; una frase sin «esta» queda igual", () => {
    expect(nombrarTarea("Acabo de terminar esta.", null, true)).toBe("Acabo de terminar esta tarea.");
    expect(nombrarTarea("Esa me tomó 3 horas.", null, true)).toBe("Esa tarea me tomó 3 horas.");
    expect(nombrarTarea("Acabo de terminar esta.", null)).toBe("Acabo de terminar esta.");
    expect(nombrarTarea("¿Quién rompió el build?", "Re-QA de la Oficina", true)).toBe("¿Quién rompió el build?");
  });
});

describe("artículos y contracciones (JST-415)", () => {
  it("un título que ya empieza con artículo se usa tal cual, con la inicial en minúscula", () => {
    expect(sintagmaDeTarea("Una tarea rara")).toBe("una tarea rara");
    expect(sintagmaDeTarea("Las pruebas de humo")).toBe("las pruebas de humo");
    expect(sintagmaDeTarea("El plan de limpieza")).toBe("el plan de limpieza");
    expect(sintagmaDeTarea("Unos ajustes menores")).toBe("unos ajustes menores");
    expect(sintagmaDeTarea("Los logs de ayer")).toBe("los logs de ayer");
    expect(nombrarTarea("Acabo de terminar esta.", "Una tarea rara")).toBe("Acabo de terminar una tarea rara.");
    expect(nombrarTarea("¿Por esta?", "Las pruebas de humo")).toBe("¿Por las pruebas de humo?");
  });

  it("«de» y «a» delante de «el» se contraen en «del» y «al», en cualquier camino que nombra la tarea", () => {
    expect(nombrarTarea("Me olvidé de esta.", "Diseño del logo")).toBe("Me olvidé del diseño del logo.");
    expect(nombrarTarea("Volví a esta.", "Plan de migración")).toBe("Volví al plan de migración.");
    expect(nombrarTarea("¿Y si hablamos de esta?", "Informe de ventas")).toBe("¿Y si hablamos del informe de ventas?");
    expect(nombrarTarea("De esta ya me ocupé.", "Plan de migración")).toBe("Del plan de migración ya me ocupé.");
    // Con un título que ya trae su artículo.
    expect(nombrarTarea("Me olvidé de esta.", "El logo nuevo")).toBe("Me olvidé del logo nuevo.");
    expect(nombrarTarea("Volví a esta.", "El logo nuevo")).toBe("Volví al logo nuevo.");
    // Nunca «de él» ni «a él».
    expect(nombrarTarea("Me olvidé de esta.", "Diseño del logo")).not.toMatch(/\bél\b|de el|a el\b/i);
  });

  it("lo que no es «el» no se toca: la, los, las, «lo de», «para esta», «esta tarea»", () => {
    expect(nombrarTarea("Me olvidé de esta.", "Revisión de la página")).toBe("Me olvidé de la revisión de la página.");
    expect(nombrarTarea("Me olvidé de esta.", "Pruebas de carga")).toBe("Me olvidé de las pruebas de carga.");
    expect(nombrarTarea("Me olvidé de esta.", "Instalar la versión")).toBe("Me olvidé de lo de instalar la versión.");
    expect(nombrarTarea("Voy para esta.", "Plan de migración")).toBe("Voy para el plan de migración.");
    expect(nombrarTarea("Volví a esta.", null, true)).toBe("Volví a esta tarea.");
  });
});

