import { useState } from "react";
import { LOCALES, detectLocale, getLocale, isLocale, storeLocale, storedLocale, t } from "../i18n.js";
import { COMMIT_PLUGIN, VERSION_PLUGIN } from "../version.js";
import { Icono } from "./piso.js";

/**
 * Selector de idioma (JST-413), al pie de la página. La elección se guarda en
 * este navegador; «El del navegador» la borra. Cambiar de idioma recarga la
 * página, porque el idioma se fija una vez al cargar.
 */
export function SelectorIdioma() {
  const [elegido, setElegido] = useState(() => storedLocale());
  const [noGuarda, setNoGuarda] = useState(false);
  const elegir = (valor: string) => {
    const idioma = isLocale(valor) ? valor : null;
    storeLocale(idioma);
    // Sin almacenamiento (modo privado) la elección no se guarda y la página no cambiaría: se deja como estaba y se avisa.
    if (storedLocale() !== idioma) {
      setNoGuarda(true);
      return;
    }
    setNoGuarda(false);
    setElegido(idioma);
    // Si el idioma que resulta es el que ya se ve, no hace falta recargar.
    if (detectLocale() !== getLocale()) window.location.reload();
  };
  return (
    <label className="of-idioma">
      <Icono nombre="globe" tam={12} />
      <span className="of-idioma-l">{t("Idioma")}</span>
      <select value={elegido ?? ""} onChange={(e) => elegir(e.target.value)}>
        <option value="">{t("El del navegador")}</option>
        {/* Cada idioma con su propio nombre, para reconocerlo aunque la interfaz esté en otro. */}
        {LOCALES.map((idioma) => (
          <option key={idioma.id} value={idioma.id} lang={idioma.id}>
            {idioma.name}
          </option>
        ))}
      </select>
      {noGuarda ? (
        <span className="of-idioma-l" role="status">
          {t("Tu navegador no deja guardar la elección.")}
        </span>
      ) : null}
    </label>
  );
}

export function PieVersion() {
  return (
    <p className="of-hint of-version" data-oficina-version={VERSION_PLUGIN} data-oficina-commit={COMMIT_PLUGIN}>
      Oficina {VERSION_PLUGIN} · {COMMIT_PLUGIN}
      <SelectorIdioma />
    </p>
  );
}
