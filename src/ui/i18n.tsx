// Idiomas en la interfaz (JST-413): texto traducido con piezas de React dentro.
import { Fragment, type ReactNode } from "react";
import { t } from "../i18n.js";

/**
 * Como `t()`, pero los `{marcadores}` reciben nodos de React:
 * `tx("Bloqueada por {id}.", { id: <b>{identifier}</b> })`. La frase va entera
 * en el catálogo, así cada idioma pone el nodo donde le corresponde.
 */
export function tx(source: string, values: Readonly<Record<string, ReactNode>>): ReactNode {
  const parts = t(source).split(/\{(\w+)\}/);
  return parts.map((part, i) => {
    // Posiciones impares: el nombre de un marcador.
    if (i % 2 === 0) return part ? <Fragment key={i}>{part}</Fragment> : null;
    return <Fragment key={i}>{Object.hasOwn(values, part) ? values[part] : `{${part}}`}</Fragment>;
  });
}
