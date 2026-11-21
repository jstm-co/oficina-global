// El aviso en pantalla de «mientras no estabas» (JST-415): lo mismo que dice la voz, pero este texto SÍ se ve, así
// que va por `t()` con su inglés. Los números salen de `textoVolver` (`src/dichos.ts`).
import { hayQueContar, type DatosVolver } from "../dichos.js";
import { cuantoLleva } from "../hora.js";
import { t } from "../i18n.js";

const DIA_MS = 86_400_000;

const unir = (partes: string[]) => (partes.length <= 1 ? (partes[0] ?? "") : t("{varios} y {ultimo}", { varios: partes.slice(0, -1).join(", "), ultimo: partes.at(-1)! }));
const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

const diasAtras = (a: number, ahora: number) => {
  const dia = (x: number) => new Date(new Date(x).getFullYear(), new Date(x).getMonth(), new Date(x).getDate()).getTime();
  return Math.round((dia(ahora) - dia(a)) / DIA_MS);
};

/** «Desde las 15:30: 5 terminaron, 2 te esperan y hubo 1 error.» Vacío si no hay nada que contar. */
export function cuerpoVolver(d: DatosVolver, desde: number, ahora: number): string {
  if (!hayQueContar(d)) return "";
  const partes: string[] = [];
  if (d.terminaron > 0) partes.push(d.terminaron === 1 ? t("1 terminó") : t("{n} terminaron", { n: d.terminaron }));
  if (d.bloqueados > 0) partes.push(d.bloqueados === 1 ? t("1 quedó bloqueado") : t("{n} quedaron bloqueados", { n: d.bloqueados }));
  if (d.esperan > 0) partes.push(d.esperan === 1 ? t("1 te espera") : t("{n} te esperan", { n: d.esperan }));
  if (d.errores > 0) partes.push(d.errores === 1 ? t("hubo 1 error") : t("hubo {n} errores", { n: d.errores }));
  const hora = new Date(desde);
  const reloj = `${hora.getHours()}:${String(hora.getMinutes()).padStart(2, "0")}`;
  const cuando = sameDay(desde, ahora) && ahora - desde < DIA_MS ? reloj : "";
  // JST-415: de ayer se dice «ayer a las 19:00»; de más atrás, «hace 3 días».
  if (!cuando && diasAtras(desde, ahora) === 1) return hora.getHours() === 1 ? t("Desde ayer a la {hora}: {resumen}.", { hora: reloj, resumen: unir(partes) }) : t("Desde ayer a las {hora}: {resumen}.", { hora: reloj, resumen: unir(partes) });
  // De 1:00 a 1:59 el español dice «la» y no «las»: «Desde la 1:05».
  if (cuando) return hora.getHours() === 1 ? t("Desde la {hora}: {resumen}.", { hora: cuando, resumen: unir(partes) }) : t("Desde las {hora}: {resumen}.", { hora: cuando, resumen: unir(partes) });
  return t("Desde hace {tiempo}: {resumen}.", { tiempo: cuantoLleva(ahora - desde), resumen: unir(partes) });
}
