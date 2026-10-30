// Estilos de la vista 3D en primera persona (`vista3d.tsx`): el visor a toda la
// ventana, dibujado chico y agrandado sin suavizar; los globos de la 2D encima,
// con su `--px` según la distancia (de lejos, solo un punto del color de su
// estado) y que se pueden tocar; lo que dice cada uno (de lejos, un «…»); el
// ancla de la ficha, la indicación que sigue al puntero, la mira del centro
// (con el puntero capturado), el texto de los monitores (una pantallita de
// terminal en perspectiva), las flechas hacia quien te necesita, y la barra con
// las salas y el botón para salir.
export const CSS_3D = /* css */ `
.of-3d { position: fixed; inset: 0; z-index: 975; overflow: hidden; background: var(--of-bg); color: var(--of-fg); user-select: none; -webkit-user-select: none; }
.of-3d-lienzo { position: absolute; inset: 0; cursor: default; touch-action: none; }
.of-3d-lienzo.is-drag { cursor: grabbing; }
.of-3d-lienzo canvas { display: block; width: 100%; height: 100%; image-rendering: pixelated; }
.of-3d-globos { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.of-3d-g { position: absolute; left: 0; top: 0; will-change: transform; }
.of-3d-g[data-vista="no"] { visibility: hidden; }
.of-3d-g > .of-bub, .of-3d-punto { transition: opacity .18s; }
.of-3d-g[data-vista="lejos"] > .of-bub { opacity: 0; }
.of-3d-g[data-vista="cerca"] > .of-3d-punto { opacity: 0; }
/* El globo (de cerca) o el punto (de lejos) se tocan como el personaje. */
.of-3d-g[data-vista="cerca"] > .of-bub, .of-3d-g[data-vista="lejos"] > .of-3d-punto { pointer-events: auto; cursor: pointer; }
/* Lo que dicen (la conversación, la frase suelta, la entrega): los globos de la 2D sobre su cabeza, que no se tocan.
   De lejos, solo un «…» con la frase de ahora (o el 🔊 mientras suena); la anterior, de lejos, no va. */
.of-3d-d { position: absolute; left: 0; top: 0; will-change: transform; pointer-events: none; }
.of-3d-d[data-vista="no"] { visibility: hidden; }
.of-3d-d > .of-hilo, .of-3d-d > .of-ent, .of-3d-dice { transition: opacity .18s; }
.of-3d-d[data-vista="lejos"] > .of-hilo, .of-3d-d[data-vista="lejos"] > .of-ent, .of-3d-d[data-vista="cerca"] > .of-3d-dice { opacity: 0; }
.of-3d-dice { position: absolute; left: 0; top: 0; display: grid; place-items: center; box-sizing: border-box; width: 18px; height: 14px; margin: -16px 0 0 -9px;
  border-radius: 7px; background: var(--of-chat-bg); color: var(--of-chat-fg); border: 1px solid var(--of-chat-line); }
.of-3d-dice svg.of-i { width: 10px; height: 10px; margin: 0; }
.of-3d-dice.is-voz { background: #18181b; color: #fafafa; border-color: #fafafa; }
/* Cada parte del hilo (o de la entrega) hacia el lado de quien la dice, visto desde donde estás, como en un chat; con su cola de ese lado */
.of-3d-parte { display: flex; flex-direction: column; align-self: center; max-width: 100%; }
.of-3d-parte[data-lado="izq"] { align-self: flex-start; margin-right: calc(8px * var(--px)); --tx: 22%; }
.of-3d-parte[data-lado="der"] { align-self: flex-end; margin-left: calc(8px * var(--px)); --tx: 70%; }
/* La entrega va en el hilo: sus globos, uno sobre el otro en vez de sobre cada cabeza */
.of-3d-ent .of-ent { position: relative; left: auto; top: auto; transform: none; max-width: 100%; }
.of-3d .of-vzm svg.of-i { width: 64%; height: 64%; stroke-width: 2.4; color: #fafafa; margin: 0; }
.of-3d-ancla { position: fixed; left: 0; top: 0; width: 0; height: 0; pointer-events: none; will-change: transform; }
.of-3d-pista { left: 0; top: 0; will-change: transform; }
/* De lejos: un punto sobre la cabeza, del color de su estado; si te necesita, morado y saltando. */
.of-3d-punto { position: absolute; left: 0; top: 0; width: 8px; height: 8px; margin: -10px 0 0 -4px; border-radius: 50%; background: var(--of-s-libre); box-shadow: 0 0 0 2px var(--of-bg); }
.of-3d-punto.of-st-trabaja { background: var(--of-s-trabaja); }
.of-3d-punto.of-st-error { background: var(--of-s-error); }
.of-3d-punto.of-st-pausa { background: var(--of-s-pausa); }
.of-3d-punto.of-st-toca, .of-3d-punto.is-need { background: var(--of-s-toca); animation: of-3d-salta 1.1s ease-in-out infinite; }
@keyframes of-3d-salta { 50% { transform: translateY(-3px); } }
.of-3d-barra { position: absolute; top: 14px; left: 14px; right: 14px; display: flex; align-items: center; gap: 8px; pointer-events: none; }
.of-3d-barra > * { pointer-events: auto; }
/* Con muchas empresas, sus etiquetas siguen en otra línea: no empujan «Resumen» ni «Salir» fuera de la pantalla. */
.of-3d-salas { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
.of-3d-sala { appearance: none; margin: 0; padding: 0; border: 0; background: none; cursor: pointer; border-radius: 4px; }
.of-3d-sala:focus-visible { outline: 2px solid var(--of-ring); outline-offset: 2px; }
.of-3d .of-tvexit { cursor: pointer; }
/* La mira: una cruz de pixeles al centro, con un borde del fondo (sin difuminar) para verse sobre todo; sobre alguien que se puede tocar, más grande. */
.of-3d-mira { position: absolute; left: 50%; top: 50%; width: 0; height: 0; pointer-events: none; color: var(--of-fg); filter: drop-shadow(1px 0 0 var(--of-bg)) drop-shadow(-1px 0 0 var(--of-bg)) drop-shadow(0 1px 0 var(--of-bg)) drop-shadow(0 -1px 0 var(--of-bg)); }
.of-3d-mira::before, .of-3d-mira::after { content: ""; position: absolute; background: currentColor; }
.of-3d-mira::before { left: -7px; top: -1px; width: 14px; height: 2px; }
.of-3d-mira::after { left: -1px; top: -7px; width: 2px; height: 14px; }
.of-3d-mira.is-on::before { left: -11px; width: 22px; }
.of-3d-mira.is-on::after { top: -11px; height: 22px; }
.of-3d-aviso { position: absolute; left: 50%; top: 50%; margin: 0; transform: translate(-50%, -50%); font-size: 14px; color: var(--of-muted-fg); }
.of-3d-ayuda { position: absolute; left: 50%; bottom: 18px; margin: 0; transform: translateX(-50%); display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; pointer-events: none; transition: opacity .4s; }
.of-3d-ayuda span { padding: 5px 10px; border-radius: 999px; border: 1px solid var(--of-border-strong); background: color-mix(in srgb, var(--of-bg) 82%, transparent); color: var(--of-fg); font-size: 12px; white-space: nowrap; }
.of-3d-ayuda.is-off { opacity: 0; }
/* El monitor de cerca: una pantallita oscura con líneas de barrido, que la página lleva encima de la del escritorio (matrix3d). */
.of-3d-pantalla { position: absolute; left: 0; top: 0; width: 160px; height: 100px; box-sizing: border-box; padding: 9px 11px; overflow: hidden; transform-origin: 0 0; pointer-events: none;
  background: #0d1117 repeating-linear-gradient(180deg, rgb(255 255 255 / .035) 0 1px, transparent 1px 3px); color: #e5e7eb;
  font: 500 12px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace; transition: opacity .2s; }
.of-3d-pantalla[data-vista="no"] { opacity: 0; visibility: hidden; }
.of-3d-pantalla b { display: flex; flex-wrap: wrap; gap: 0 6px; margin-bottom: 5px; font-size: 13px; font-weight: 700; }
.of-3d-pantalla-cod { color: var(--of-3d-tono); text-shadow: 0 0 6px color-mix(in srgb, var(--of-3d-tono) 60%, transparent); }
.of-3d-pantalla-st { color: color-mix(in srgb, var(--of-3d-tono) 75%, #e5e7eb); font-weight: 500; }
.of-3d-pantalla p { margin: 0; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
.of-3d-pantalla-cursor { display: inline-block; width: 7px; height: 12px; margin-top: 3px; background: var(--of-3d-tono); animation: of-3d-parpadeo 1s steps(1) infinite; }
@keyframes of-3d-parpadeo { 50% { opacity: 0; } }
.of-3d-pantalla.of-st-trabaja { --of-3d-tono: #4ade80; }
.of-3d-pantalla.of-st-toca { --of-3d-tono: #c4b5fd; }
.of-3d-pantalla.of-st-error { --of-3d-tono: #f87171; }
.of-3d-pantalla.of-st-pausa { --of-3d-tono: #fbbf24; }
.of-3d-pantalla.of-st-libre { --of-3d-tono: #9ca3af; }
/* Hacia quien te necesita y no se ve: en el borde, una etiqueta morada con un pico que apunta hacia él; detrás de un muro, sobre él. */
.of-3d-flechas { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.of-3d-flecha { position: absolute; left: 0; top: 0; will-change: transform; }
.of-3d-flecha[data-modo="no"] { visibility: hidden; }
.of-3d-flecha-chip { position: absolute; left: 0; top: 0; display: inline-flex; align-items: center; gap: 4px; height: 22px; padding: 0 7px; transform: translate(-50%, -50%); white-space: nowrap;
  border-radius: 4px; border: 1px solid #3b1a80; background: var(--of-s-toca); color: #fff; box-shadow: 0 1px 0 #3b1a80; font: 600 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
.of-3d-flecha-pico { position: absolute; left: 0; top: -6px; width: 0; height: 0; border-top: 6px solid transparent; border-bottom: 6px solid transparent; border-left: 9px solid var(--of-s-toca);
  transform-origin: 0 50%; transform: rotate(var(--a, 0rad)) translateX(var(--d, 40px)); filter: drop-shadow(0 1px 0 #3b1a80); }
.of-3d-flecha[data-modo="muro"] .of-3d-flecha-chip { transform: translate(-50%, calc(-100% - 9px)); opacity: .92; }
.of-3d-flecha[data-modo="muro"] .of-3d-flecha-pico { transform: rotate(90deg) translateX(-9px); }
@media (prefers-reduced-motion: reduce) {
  .of-3d-punto.of-st-toca, .of-3d-punto.is-need { animation: none; }
  .of-3d-pantalla-cursor { animation: none; }
}
`;
