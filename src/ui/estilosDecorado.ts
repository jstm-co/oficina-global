// Estilos de los decorados de las salas (JST-416, `src/decorado.ts`). La sala lleva la clase `of-dec-<id>`; el
// decorado clásico no lleva ninguna (es lo de siempre, sin una línea de más). Cada uno cambia:
//   · la hoja de muebles (`--of-img-mu`: los muebles de la sala leen esa variable, así que basta con pisarla), y
//   · las baldosas del piso de la oficina, del piso del descanso y del muro.
// Las baldosas vienen en `-claro` y `-oscuro` (`--of-t-<nombre>` las define `estilos.ts` según el tema del host).
// Para sumar un decorado: su hoja en `HOJAS_DECORADO`, sus baldosas en `BALDOSAS` y un bloque como el de abajo.
import { HOJAS_DECORADO } from "./sprites.js";

export const CSS_DECORADO = /* css */ `
/* Madera: tablones, muros cálidos con zócalo, cuero y lana. Tablones de 64x16 de arte (largos, con las juntas de punta alternadas): el piso de la oficina y el del descanso. */
.of-dec-madera { --of-img-mu: url("${HOJAS_DECORADO.madera}"); }
.of-dec-madera .of-zona.of-alfombra { background-image: var(--of-t-madera-piso); background-size: calc(64px * var(--px)) calc(16px * var(--px)); filter: none; }
.of-dec-madera .of-zona.of-madera { background-image: var(--of-t-madera-descanso); background-size: calc(64px * var(--px)) calc(16px * var(--px)); }
.of-dec-madera.of-co-bet .of-muro { background-image: var(--of-t-madera-pared-bet); }
.of-dec-madera.of-co-elm .of-muro { background-image: var(--of-t-madera-pared-elm); }
.of-dec-madera.of-co-jst .of-muro { background-image: var(--of-t-madera-pared-jst); }
.of-dec-madera.of-co-mig .of-muro { background-image: var(--of-t-madera-pared-mig); }
.of-dec-madera.of-co-none .of-muro { background-image: var(--of-t-madera-pared-none); filter: none; }

/* Luz según la hora (JST-416, etapa 2): el tinte va sobre el piso, los muebles y los agentes de la sala; los globos y los rótulos (z-index
   900) quedan encima y los estados (880) debajo, y se leen igual porque el tinte multiplica y nunca oscurece más de un 25 % (src/luzSala.ts).
   El piso ya es un contexto de apilamiento propio (isolation: isolate en piso.tsx): el tinte no sale de él ni pinta sobre los menús de la página.
   El halo de las lámparas y la chimenea va debajo de los agentes y los muebles de piso (z-index 3, sobre el piso y el muro): si no, de noche
   los lava. Y no se dibuja de día (opacidad 0): FondoSala no lo monta. */
.of-tinte { position: absolute; inset: 0; z-index: 800; pointer-events: none; mix-blend-mode: multiply; transition: background-color 2s; }
.of-halo { position: absolute; z-index: 3; pointer-events: none; border-radius: 50%; mix-blend-mode: screen; opacity: var(--of-halo, 0); transition: opacity 2s;
  left: calc((var(--x) - var(--r)) * var(--px) * 1px); top: calc((var(--y) - var(--r)) * var(--px) * 1px);
  width: calc(var(--r) * 2 * var(--px) * 1px); height: calc(var(--r) * 2 * var(--px) * 1px);
  background: radial-gradient(circle, rgba(255, 220, 130, .7) 0%, rgba(255, 196, 96, .3) 38%, rgba(255, 180, 80, 0) 70%); }
.of-halo.is-fuego { background: radial-gradient(circle, rgba(255, 150, 60, .75) 0%, rgba(255, 120, 40, .3) 40%, rgba(255, 100, 30, 0) 70%); }
.of-rm .of-tinte, .of-rm .of-halo { transition: none; }
@media (prefers-reduced-motion: reduce) { .of-tinte, .of-halo { transition: none; } }

/* Menú «Ambiente» → «Decorado» (selector de una opción) y «Por sala» */
.of-amb-sec { padding: 8px 8px 2px; font-size: 11px; font-weight: 500; color: var(--of-muted-fg); }
.of-amb-opc { display: flex; flex-direction: column; gap: 2px; }
.of-amb-row.is-on .of-amb-n { font-weight: 600; }
.of-amb-ok { margin-left: auto; flex: none; color: var(--of-fg); }

/* «Por sala»: una fila por empresa con su selector. */
.of-amb-sala { display: flex; align-items: center; gap: 8px; min-height: 32px; padding: 0 8px; font-size: 13px; }
.of-amb-sala .of-amb-n { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.of-amb-sel { flex: none; height: 26px; max-width: 150px; padding: 0 4px; border: 1px solid var(--of-border); border-radius: 6px; background: var(--of-popover); color: var(--of-fg); font: inherit; font-size: 12px; cursor: pointer; }
.of-amb-sel:focus-visible { outline: 2px solid var(--of-ring); outline-offset: 1px; }
/* En el celular el menú «Ambiente» es una hoja inferior: filas con área de toque de 44 px y selectores del mismo alto. */
.of-ambsheet .of-amb-row { height: 44px; font-size: 14px; }
.of-ambsheet .of-amb-sala { min-height: 44px; font-size: 14px; }
.of-ambsheet .of-amb-sel { height: 36px; font-size: 14px; }
.of-amb-n + .of-amb-cv { margin-left: auto; }
.of-amb-cv.is-abierto { transform: rotate(90deg); }
`;
