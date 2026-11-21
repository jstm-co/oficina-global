// «Mientras no estabas» al abrir la página (JST-415): si la última visita fue hace una hora o más, un aviso en pantalla con lo
// que pasó (por la capa de datos del Resumen, sin IA) y un botón «Resumen» que abre el reproductor; con voces encendidas y el
// audio desbloqueado, además lo dice. Una vez por apertura, después de la carga inicial. Solo con los avisos o las voces
// encendidos y la frase «volver» permitida (casilla y nivel): si no, ni siquiera lee la API. La lógica está en `src/visita.ts`.
import { useEffect, useRef, type ReactNode } from "react";
import { esperanDesde, textoVolver } from "../dichos.js";
import { t } from "../i18n.js";
import type { Oficina } from "./useOficina.js";
import { ajustes } from "./ajustes.js";
import { cuerpoVolver } from "./avisoVolver.js";
import { erroresSilenciados } from "./erroresSilenciados.js";
import { resumen } from "./resumen.js";
import { decirAlAbrir } from "./vigia.js";
import { cuentaAlAbrir, datosAlAbrir, erroresDesde, guardadorDeVisita, guardarVisita, visitaGuardada } from "../visita.js";

const TTL_MS = 20_000;

const visible = () => typeof document === "undefined" || document.visibilityState !== "hidden";

export function useAvisoAlAbrir(oficina: Pick<Oficina, "agentes" | "cargando" | "iniciando">, mostrar: (c: ReactNode, ms?: number) => void): void {
  const hecho = useRef(false);
  /** Si leer lo que pasó falló en todas las empresas, la visita anterior se deja como está para que el próximo intento cuente. */
  const fallo = useRef(false);
  const pasos = useRef({ oficina, mostrar });
  pasos.current = { oficina, mostrar };
  const listo = !oficina.cargando && !oficina.iniciando;

  // La hora de esta visita se va guardando mientras la página está abierta: al ocultarse, al volver a verse, cada minuto
  // mientras se ve (un solo reloj) y al cerrarse. Cualquier pestaña visible la guarda: `alVolver` y la próxima apertura la leen.
  useEffect(() => {
    const guardar = () => {
      if (hecho.current && !fallo.current) guardarVisita();
    };
    const g = guardadorDeVisita({ guardar, visible });
    const alCambiar = () => g.cambioDeVisibilidad();
    g.arrancar();
    document.addEventListener("visibilitychange", alCambiar);
    window.addEventListener("pagehide", guardar);
    return () => {
      document.removeEventListener("visibilitychange", alCambiar);
      window.removeEventListener("pagehide", guardar);
      g.detener();
      guardar();
    };
  }, []);

  useEffect(() => {
    if (!listo || hecho.current) return;
    const ahora = Date.now();
    const ultima = visitaGuardada();
    const aj = ajustes();
    const cuenta = cuentaAlAbrir({ ultima, ahora, nivel: aj.nivel, activo: aj.avisos || aj.voces, casilla: aj.frases.volver });
    if (!cuenta) {
      // Nada que contar: esta es la visita de ahora.
      hecho.current = true;
      guardarVisita(ahora);
      return;
    }
    hecho.current = true;
    fallo.current = true; // hasta que se lea bien (mientras tanto, la visita anterior no se pisa)
    void (async () => {
      const hechas = await resumen.hechasDesde(cuenta.desde).catch(() => null);
      // Si fallaron todas las empresas no se avisa ni se guarda: el próximo intento cuenta desde la misma visita.
      if (hechas === null) return;
      fallo.current = false;
      guardarVisita();
      const agentes = pasos.current.oficina.agentes;
      const datos = datosAlAbrir({ hechas, esperan: esperanDesde(agentes, cuenta.desde), errores: erroresDesde(agentes, cuenta.desde, Date.now(), erroresSilenciados()) });
      const cuerpo = cuerpoVolver(datos, cuenta.desde, Date.now());
      if (!cuerpo) return;
      pasos.current.mostrar(
        <>
          <div>
            <strong>{t("Mientras no estabas")}</strong>
            <div>{cuerpo}</div>
          </div>
          <button type="button" className="of-btn is-sm" onClick={() => resumen.leer()}>
            {t("Resumen")}
          </button>
        </>,
        TTL_MS,
      );
      const voz = textoVolver(datos, cuenta.desde, Date.now());
      if (voz) decirAlAbrir(voz);
    })();
  }, [listo]);
}
