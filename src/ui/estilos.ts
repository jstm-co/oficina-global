// Hoja de estilos propia del plugin, portada del CSS de la propuesta A de
// JST-65 (`comun.css` y `a.css`) según su design-spec. El host solo trae las
// clases de Tailwind que usa el núcleo, así que el plugin trae la suya.
//
// - Clases con prefijo `of-` y tokens `--of-*`, para no pisar los del host.
// - Los tokens viven en `.of` (página, widget y modo TV) y `.of-layer` (ficha,
//   tooltip y avisos, que van en un portal). El tema sigue la clase `.dark` del host.
// - Todas las medidas de los sprites van en pixeles de arte por `--px`, la
//   escala entera (1, 2 o 3), con `image-rendering: pixelated`.
// - Los personajes y efectos se animan con `transform: translateX` y
//   `steps(n)` sobre una tira de cuadros (lo hace el compositor, JST-66 §3).
import { CSS_3D } from "./estilos3d.js";
import { CSS_AVISOS } from "./estilosAvisos.js";
import { CSS_LISTA } from "./estilosLista.js";
import { CSS_RESUMEN } from "./estilosResumen.js";
import { CSS_CONTEXTO } from "./estilosContexto.js";
import { CSS_ROTULO } from "./estilosRotulo.js";
import { CSS_VENTANA } from "./estilosVentana.js";
import { CSS_VOCES } from "./estilosVoces.js";
import { CSS_VIDA } from "./estilosVida.js";
import { HOJAS, BALDOSAS } from "./sprites.js";

const baldosas = (tema: "claro" | "oscuro") =>
  Object.entries(BALDOSAS)
    .filter(([nombre]) => nombre.endsWith(`-${tema}`))
    .map(([nombre, url]) => `--of-t-${nombre.replace(`-${tema}`, "")}: url("${url}");`)
    .join(" ");

const CSS = /* css */ `
.of, .of-layer {
  --of-bg: #ffffff; --of-fg: #0a0a0a; --of-card: #ffffff; --of-popover: #ffffff;
  --of-muted: #f5f5f5; --of-muted-fg: #737373;
  --of-border: #e5e5e5; --of-border-strong: #d4d4d4; --of-input: #e5e5e5; --of-ring: #a3a3a3;
  --of-hover-strong: rgba(0,0,0,.07);
  --of-primary: #171717; --of-primary-fg: #fafafa;
  --of-shadow-pop: 0 8px 24px rgba(0,0,0,.12), 0 0 0 1px rgba(0,0,0,.04);
  --of-st-backlog: #52585d; --of-st-todo: #cc7a00; --of-st-in_progress: #2563eb; --of-st-in_review: #7c3aed;
  --of-st-done: #16a34a; --of-st-blocked: #dc2626; --of-st-cancelled: #52585d;
  --of-danger-bg: rgba(220,38,38,.07); --of-danger-border: rgba(220,38,38,.35); --of-danger-fg: #b91c1c;
  --of-co-bet: #b07400; --of-co-bet-fg: #7a5000; --of-co-bet-on: #0a0a0a;
  --of-co-elm: #b8459f; --of-co-elm-fg: #8f2f7b; --of-co-elm-on: #ffffff;
  --of-co-jst: #007a00; --of-co-jst-fg: #006000; --of-co-jst-on: #ffffff;
  --of-co-mig: #1f78c0; --of-co-mig-fg: #155c94; --of-co-mig-on: #ffffff;
  --of-chip-alpha: 12%;
  --of-skel: #ededed; --of-skel-hi: #f6f6f6;
  --of-s-trabaja: #2563eb; --of-s-trabaja-fg: #1d4ed8;
  --of-s-toca: #7c3aed; --of-s-toca-fg: #6d28d9;
  --of-s-error: #dc2626; --of-s-error-fg: #b91c1c;
  --of-s-pausa: #ca8a04; --of-s-pausa-fg: #92400e;
  --of-s-libre: #6b7280; --of-s-libre-fg: #4b5563;
  --of-s-alpha: 10%; --of-backdrop: rgba(0,0,0,.4);
  --of-room-line: #4a4552; --of-room-shadow: rgba(60,40,20,.12);
  --of-code-bg: #f6f6f4; --of-log-bg: #fbfaf7; --of-log-fg: #2a2a2e; --of-log-dim: #8a8a92;
  --of-risk-bg: rgba(234,88,12,.07); --of-risk-bd: rgba(234,88,12,.35); --of-risk-fg: #9a3412;
  --of-img-pj: url("${HOJAS.personajes}");
  --of-img-mu: url("${HOJAS.muebles}");
  --of-img-ef: url("${HOJAS.efectos}");
  ${baldosas("claro")}
  color: var(--of-fg);
  font-family: inherit; font-size: 14px; line-height: 20px;
  font-feature-settings: "cv11", "ss01"; -webkit-font-smoothing: antialiased;
}
.dark .of, .dark .of-layer, .of.dark {
  --of-bg: #0a0a0a; --of-fg: #fafafa; --of-card: #171717; --of-popover: #171717;
  --of-muted: #262626; --of-muted-fg: #a1a1a1;
  --of-border: rgba(255,255,255,.10); --of-border-strong: rgba(255,255,255,.16); --of-input: rgba(255,255,255,.15); --of-ring: #737373;
  --of-hover-strong: rgba(255,255,255,.07);
  --of-primary: #e5e5e5; --of-primary-fg: #171717;
  --of-shadow-pop: 0 12px 32px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.08);
  --of-st-backlog: #9a958a; --of-st-todo: #fbbf24; --of-st-in_progress: #3b82f6; --of-st-in_review: #9474f0;
  --of-st-done: #34d06f; --of-st-blocked: #ef4444; --of-st-cancelled: #9a958a;
  --of-danger-bg: rgba(239,68,68,.08); --of-danger-border: rgba(239,68,68,.45); --of-danger-fg: #fca5a5;
  --of-co-bet: #c98500; --of-co-bet-fg: #f2b544; --of-co-bet-on: #0a0a0a;
  --of-co-elm: #cc5cc0; --of-co-elm-fg: #e895de; --of-co-elm-on: #0a0a0a;
  --of-co-jst: #008300; --of-co-jst-fg: #5fd07a; --of-co-jst-on: #ffffff;
  --of-co-mig: #2f8fd8; --of-co-mig-fg: #84bdf2; --of-co-mig-on: #0a0a0a;
  --of-chip-alpha: 18%;
  --of-skel: #1f1f1f; --of-skel-hi: #2a2a2a;
  --of-s-trabaja: #3b82f6; --of-s-trabaja-fg: #93c5fd;
  --of-s-toca: #9474f0; --of-s-toca-fg: #c4b5fd;
  --of-s-error: #ef4444; --of-s-error-fg: #fca5a5;
  --of-s-pausa: #facc15; --of-s-pausa-fg: #fde68a;
  --of-s-libre: #9ca3af; --of-s-libre-fg: #d1d5db;
  --of-s-alpha: 16%; --of-backdrop: rgba(0,0,0,.6);
  --of-room-line: #050507; --of-room-shadow: rgba(0,0,0,.4);
  --of-code-bg: #1f1f22; --of-log-bg: #111113; --of-log-fg: #e4e4e7; --of-log-dim: #71717a;
  --of-risk-bg: rgba(251,146,60,.08); --of-risk-bd: rgba(251,146,60,.4); --of-risk-fg: #fdba74;
  ${baldosas("oscuro")}
}
:where(.of, .of-layer) * { box-sizing: border-box; }
:where(.of, .of-layer) :where(button) { font: inherit; color: inherit; letter-spacing: inherit; cursor: pointer; background: transparent; }
:where(.of, .of-layer) :where(a) { color: inherit; text-decoration: none; }
:where(.of, .of-layer) :where(h1, p) { margin: 0; }
svg.of-i { display: inline-block; vertical-align: middle; width: 16px; height: 16px; flex: none; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
svg.of-i.of-s12 { width: 12px; height: 12px; } svg.of-i.of-s14 { width: 14px; height: 14px; } svg.of-i.of-s18 { width: 18px; height: 18px; }
.of-sp { flex: 1; }
.of-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
.of-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

/* Estados: color del ícono (--sc) y del texto (--sfg) */
.of-c-trabaja { --sc: var(--of-s-trabaja); --sfg: var(--of-s-trabaja-fg); }
.of-c-toca { --sc: var(--of-s-toca); --sfg: var(--of-s-toca-fg); }
.of-c-error { --sc: var(--of-s-error); --sfg: var(--of-s-error-fg); }
.of-c-pausa { --sc: var(--of-s-pausa); --sfg: var(--of-s-pausa-fg); }
.of-c-libre { --sc: var(--of-s-libre); --sfg: var(--of-s-libre-fg); }

/* Empresa: prefijo + color (nunca solo color), como Board global */
.of-co-bet { --cc: var(--of-co-bet); --cfg: var(--of-co-bet-fg); --con: var(--of-co-bet-on); }
.of-co-elm { --cc: var(--of-co-elm); --cfg: var(--of-co-elm-fg); --con: var(--of-co-elm-on); }
.of-co-jst { --cc: var(--of-co-jst); --cfg: var(--of-co-jst-fg); --con: var(--of-co-jst-on); }
.of-co-mig { --cc: var(--of-co-mig); --cfg: var(--of-co-mig-fg); --con: var(--of-co-mig-on); }
.of-co-none { --cc: var(--of-muted-fg); --cfg: var(--of-muted-fg); --con: var(--of-bg); }
.of-cotag { display: inline-flex; align-items: center; flex: none; height: 16px; padding: 0 4px; border-radius: 4px; font: 600 10px/16px ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .02em;
  color: var(--cfg); background: color-mix(in srgb, var(--cc) var(--of-chip-alpha), transparent); }
.of-cotag.is-solid { background: var(--cc); color: var(--con); }

/* ---------- Primitivas ---------- */
.of-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 32px; padding: 0 12px; border-radius: 8px; border: 1px solid var(--of-input); background: transparent; font-size: 13px; font-weight: 500; white-space: nowrap; color: var(--of-fg); }
.of-btn:hover { background: var(--of-hover-strong); }
.of-btn.is-sm { height: 28px; padding: 0 10px; font-size: 12.5px; }
.of-btn.is-ghost { border-color: transparent; }
.of-btn.is-primary { background: var(--of-primary); color: var(--of-primary-fg); border-color: var(--of-primary); }
.of-btn.is-toca { background: var(--of-s-toca); border-color: var(--of-s-toca); color: #fff; }
.of-btn[aria-disabled="true"] { opacity: .55; pointer-events: none; }
.of-ibtn { width: 32px; height: 32px; display: inline-grid; place-items: center; padding: 0; border-radius: 8px; border: 1px solid var(--of-input); background: transparent; color: var(--of-fg); }
.of-ibtn:hover { background: var(--of-hover-strong); }
.of-ibtn.is-ghost { border-color: transparent; }
/* 0.2.0 (JST-95): botones xs, violeta, rojo y a lo ancho; interruptor; chips de estado; personaje en una caja */
.of-btn.is-xs { height: 24px; padding: 0 8px; font-size: 12px; gap: 4px; border-radius: 6px; }
.of-btn:disabled, .of-btn[aria-disabled="true"] { opacity: .55; cursor: default; }
.of-btn.is-primary:disabled, .of-btn.is-toca:disabled { opacity: .7; }
/* El hover del primario va antes: un primario violeta (is-toca) o rojo (is-danger) no se vuelve gris */
.of-btn.is-primary:not(:disabled):hover { background: var(--of-primary); filter: brightness(1.08); }
.of-btn.is-toca:not(:disabled):hover { background: var(--of-s-toca); filter: brightness(1.08); }
.of-btn.is-danger { background: var(--of-s-error); border-color: var(--of-s-error); color: #fff; }
.of-btn.is-danger:not(:disabled):hover { background: var(--of-s-error); filter: brightness(1.08); }
.of-btn.is-wide { width: 100%; height: 36px; }
.of-sw { position: relative; width: 34px; height: 20px; flex: none; border-radius: 10px; border: 0; padding: 0; background: var(--of-border-strong); transition: background .15s; }
.of-sw i { position: absolute; left: 2px; top: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.25); transition: transform .15s; }
.of-sw[aria-checked="true"] { background: var(--of-s-toca); }
.of-sw[aria-checked="true"] i { transform: translateX(14px); }
.of-nchip { display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 8px; border-radius: 11px; font-size: 12px; font-weight: 500; white-space: nowrap;
  color: var(--sfg); background: color-mix(in srgb, var(--sc) var(--of-s-alpha), transparent); border: 1px solid color-mix(in srgb, var(--sc) 30%, transparent); }
.of-nchip svg { color: var(--sc); }
.of-av { position: relative; flex: none; display: block; width: 44px; height: 52px; border-radius: 8px; overflow: hidden;
  background: color-mix(in srgb, var(--cc) 16%, var(--of-muted)); box-shadow: inset 0 -10px 0 color-mix(in srgb, var(--cc) 28%, var(--of-muted)); }
.of-av > .of-avs { position: absolute; left: 50%; bottom: 2px; width: calc(16px * var(--px)); height: calc(24px * var(--px)); transform: translateX(-50%); }
.of-av.is-sm { width: 28px; height: 32px; border-radius: 6px; box-shadow: inset 0 -6px 0 color-mix(in srgb, var(--cc) 28%, var(--of-muted)); }
.of-av.is-sm > .of-avs { bottom: 1px; }
.of-av.is-rw { border-radius: 9px; background: color-mix(in srgb, var(--cc) 18%, var(--of-muted)); box-shadow: inset 0 -10px 0 color-mix(in srgb, var(--cc) 30%, var(--of-muted)); }
:where(.of, .of-layer) :focus-visible { outline: 2px solid var(--of-ring); outline-offset: 2px; }
/* En pantallas táctiles el host da 44 px de alto mínimo a todo botón (pointer: coarse) y estiraría los
   interruptores, los botones chicos y las pastillas. La Oficina usa las medidas del diseño; donde hace falta,
   el área táctil de 44 px va aparte (JST-95 §6) o el control ya mide 44 en el celular. */
@media (pointer: coarse) { .of :where(button, [role="button"]), .of-layer :where(button, [role="button"]) { min-height: 0; } }

/* ---------- Página ---------- */
.of { display: flex; flex-direction: column; min-width: 0; background: var(--of-bg); }
.of-scroll { overflow-x: auto; padding: 2px calc(24px - var(--of-sb, 0px)) 16px 24px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.of-scroll > * { flex: none; }
.of-msgs { padding: 0 calc(24px - var(--of-sb, 0px)) 0 24px; display: flex; flex-direction: column; gap: 8px; }
.of-msgs + .of-scroll { padding-top: 10px; }

/* ---------- Sprites pixel ---------- */
.of-spr { position: absolute; display: block; pointer-events: none;
  left: calc(var(--x) * var(--px) * 1px); top: calc(var(--y) * var(--px) * 1px);
  width: calc(var(--w) * var(--px) * 1px); height: calc(var(--h) * var(--px) * 1px);
  background-image: var(--img); background-repeat: no-repeat; image-rendering: pixelated;
  background-size: calc(var(--iw) * var(--px) * 1px) calc(var(--ih) * var(--px) * 1px);
  background-position: calc(var(--sx) * var(--px) * -1px) calc(var(--sy) * var(--px) * -1px); }
/* Animado: una caja con overflow oculto y, dentro, la tira de cuadros que se corre con transform */
.of-spr.of-an { background: none; overflow: hidden; }
.of-tira { position: absolute; left: 0; top: 0; height: 100%; width: calc(var(--n) * var(--w) * var(--px) * 1px);
  background-image: var(--img); background-repeat: no-repeat; image-rendering: pixelated;
  background-size: calc(var(--iw) * var(--px) * 1px) calc(var(--ih) * var(--px) * 1px);
  background-position: calc(var(--sx) * var(--px) * -1px) calc(var(--sy) * var(--px) * -1px);
  animation: of-tira calc(var(--n) * var(--ms) * 1ms) steps(var(--n)) infinite; animation-delay: calc(var(--d, 0) * -1ms); will-change: transform; }
@keyframes of-tira { to { transform: translateX(-100%); } }
/* Pantallas: capas sueltas que se turnan */
.of-scr { opacity: 0; }
.of-scr.of-f0 { opacity: 1; }
.of-scr.of-of5 { animation: of-scr5 1.6s step-end infinite; }
.of-scr.of-of2 { animation: of-scr2 .9s step-end infinite; }
.of-scr.of-of5.of-f1 { animation-delay: .32s; } .of-scr.of-of5.of-f2 { animation-delay: .64s; } .of-scr.of-of5.of-f3 { animation-delay: .96s; } .of-scr.of-of5.of-f4 { animation-delay: 1.28s; }
.of-scr.of-of2.of-f1 { animation-delay: .45s; }
@keyframes of-scr5 { 0% { opacity: 1; } 20% { opacity: 0; } 100% { opacity: 0; } }
@keyframes of-scr2 { 0% { opacity: 1; } 50% { opacity: 0; } 100% { opacity: 0; } }

/* Movimiento reducido y pestaña oculta. Llevan !important porque reglas que vienen después
   (p. ej. .of-bub.of-b-toca, con la misma especificidad) usan el atajo «animation», que
   vuelve a poner play-state en running. */
.of-rm .of-tira, .of-rm .of-scr, .of-rm .of-pulse, .of-rm .of-bub, .of-rm .of-bnd, .of-rm .of-sk, .of-rm .of-spin { animation: none !important; }
.of-rm .of-scr.of-f0 { opacity: 1; }
.of-rm .of-sw, .of-rm .of-sw i { transition: none; }
.of-oculta .of-tira, .of-oculta .of-scr, .of-oculta .of-pulse, .of-oculta .of-bub, .of-oculta .of-bnd, .of-oculta .of-sk, .of-oculta .of-spin { animation-play-state: paused !important; }
@media (prefers-reduced-motion: reduce) { .of-tira, .of-scr, .of-pulse, .of-bub, .of-bnd, .of-sk { animation: none !important; } .of-scr.of-f0 { opacity: 1; } }

/* Piso, pasillo y salas */
.of-piso { position: relative; flex: none; width: calc(var(--fw) * var(--px) * 1px); height: calc(var(--fh) * var(--px) * 1px);
  border-radius: calc(2px * var(--px)); box-shadow: 0 0 0 calc(2px * var(--px)) var(--of-room-line), 0 10px 30px var(--of-room-shadow); }
.of-pasillo { position: absolute; inset: 0; background-image: var(--of-t-piso-baldosa); background-size: calc(16px * var(--px)) calc(16px * var(--px)); image-rendering: pixelated; border-radius: inherit; }
.of-sala { position: absolute; left: calc(var(--x) * var(--px) * 1px); top: calc(var(--y) * var(--px) * 1px);
  width: calc(var(--w) * var(--px) * 1px); height: calc(var(--h) * var(--px) * 1px);
  box-shadow: 0 0 0 calc(3px * var(--px)) var(--of-room-line); transition: opacity .2s, filter .2s; }
.of-zona, .of-muro { position: absolute; left: calc(var(--x) * var(--px) * 1px); top: calc(var(--y) * var(--px) * 1px);
  width: calc(var(--w) * var(--px) * 1px); height: calc(var(--h) * var(--px) * 1px); background-size: calc(16px * var(--px)) calc(16px * var(--px)); image-rendering: pixelated; }
.of-zona.of-madera { background-image: var(--of-t-piso-madera); background-size: calc(32px * var(--px)) calc(16px * var(--px)); }
.of-zona.of-alfombra { box-shadow: inset calc(-1px * var(--px)) 0 0 color-mix(in srgb, var(--cc) 35%, transparent); }
.of-co-bet .of-alfombra { background-image: var(--of-t-alfombra-bet); } .of-co-bet .of-muro { background-image: var(--of-t-pared-bet); }
.of-co-elm .of-alfombra { background-image: var(--of-t-alfombra-elm); } .of-co-elm .of-muro { background-image: var(--of-t-pared-elm); }
.of-co-jst .of-alfombra { background-image: var(--of-t-alfombra-jst); } .of-co-jst .of-muro { background-image: var(--of-t-pared-jst); }
.of-co-mig .of-alfombra { background-image: var(--of-t-alfombra-mig); } .of-co-mig .of-muro { background-image: var(--of-t-pared-mig); }
.of-co-none .of-alfombra { background-image: var(--of-t-alfombra-jst); filter: grayscale(1); } .of-co-none .of-muro { background-image: var(--of-t-pared-jst); filter: grayscale(1); }
.of-spr.of-gris { filter: grayscale(1); }
.of-muro { background-size: calc(16px * var(--px)) calc(22px * var(--px)); background-repeat: repeat-x; z-index: 1; }
.of-globos { position: absolute; inset: 0; pointer-events: none; z-index: 900; }
.of-sala.is-dim { opacity: .28; filter: grayscale(.85); }
.of-sala.is-dim:hover { opacity: .5; }
.of-sala.is-zoom { cursor: pointer; }
.of-sala.is-zoom .of-ws, .of-sala.is-zoom .of-lc { pointer-events: none; }
.of-sala.is-zoom:active { filter: brightness(1.08); }
.of-sala.is-zoom:focus-visible { outline: 2px solid var(--of-ring); outline-offset: 4px; }

/* Placa con el nombre de la empresa */
.of-placa { position: absolute; z-index: 3; left: calc(5px * var(--px)); top: calc(3px * var(--px));
  display: inline-flex; align-items: center; gap: calc(2px * var(--px)); height: calc(10px * var(--px)); padding: 0 calc(3px * var(--px)) 0 calc(1px * var(--px));
  background: #fffdf7; border: calc(1px * var(--px)) solid var(--of-room-line); border-radius: calc(1px * var(--px));
  font-size: calc(3px * var(--px) + 5px); line-height: 1; font-weight: 600; color: #2a2230; white-space: nowrap; box-shadow: 0 calc(1px * var(--px)) 0 rgba(0,0,0,.25); }
.of-placa .of-cotag { height: calc(6px * var(--px)); line-height: calc(6px * var(--px)); font-size: calc(2px * var(--px) + 6px); }
.of-placa em { font-style: normal; font-weight: 500; color: #6b6470; font-variant-numeric: tabular-nums; }
.dark .of-placa, .of.dark .of-placa { background: #1d1d22; color: #ececec; border-color: #050507; }
.dark .of-placa em, .of.dark .of-placa em { color: #9a9aa6; }
.of-piso.is-x1 .of-placa { gap: 3px; height: 13px; padding: 0 4px 0 2px; font-size: 9px; border-width: 1px; left: 5px; top: 3px; }
.of-piso.is-x1 .of-placa .of-cotag { height: 11px; line-height: 11px; font-size: 8.5px; padding: 0 2px; }
.of-piso.is-x1 .of-placa em { display: none; }
.of-piso.is-x3 .of-placa { font-size: 15px; }

/* Sala a oscuras (no se pudo leer) y cargando */
.of-cover { position: absolute; inset: 0; z-index: 950; display: grid; place-items: center; }
.of-cover.is-off { background: rgba(30, 30, 40, .62); }
.dark .of-cover.is-off, .of.dark .of-cover.is-off { background: rgba(8, 8, 14, .72); }
.of-offmsg { display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; color: #f4f4f5; font-size: 12.5px; max-width: 80%; }
.of-offmsg b { font-size: 14px; }
.of-offmsg span { color: #c4c4cc; }
.of-offmsg .of-btn { margin-top: 4px; color: #f4f4f5; border-color: rgba(255,255,255,.3); }
.of-piso.is-x1 .of-offmsg span, .of-piso.is-x1 .of-offmsg .of-btn { display: none; }
.of-piso.is-x1 .of-offmsg { font-size: 10px; }
.of-piso.is-x1 .of-offmsg b { font-size: 11px; }
.of-cover.is-load { background: color-mix(in srgb, var(--of-bg) 45%, transparent); }
.of-sk { background: linear-gradient(90deg, var(--of-skel) 0%, var(--of-skel-hi) 40%, var(--of-skel) 80%); background-size: 300% 100%; animation: of-sk 1.4s ease-in-out infinite; border-radius: 6px; }
@keyframes of-sk { from { background-position: 100% 0; } to { background-position: -100% 0; } }
.of-sk.of-skd, .of-sk.of-skc { position: absolute; z-index: 960; left: calc(var(--x) * var(--px) * 1px); top: calc(var(--y) * var(--px) * 1px);
  width: calc(var(--w) * var(--px) * 1px); height: calc(var(--h) * var(--px) * 1px); border-radius: calc(2px * var(--px)); }
.of-sk.of-skc { border-radius: 50%; }

/* Puesto y personaje: botones con área de toque amplia */
.of-ws, .of-lc, .of-desk { position: absolute; padding: 0; margin: 0; border: 0; background: transparent; cursor: pointer;
  left: calc(var(--x) * var(--px) * 1px); top: calc(var(--y) * var(--px) * 1px);
  width: calc(var(--w) * var(--px) * 1px); height: calc(var(--h) * var(--px) * 1px); }
.of-desk { cursor: default; pointer-events: none; }
.of-ws:focus-visible, .of-lc:focus-visible { outline: 2px solid var(--of-ring); outline-offset: 2px; border-radius: 4px; }
.of-who { transition: filter .12s; }
.of-ws:hover .of-who, .of-lc:hover .of-who { filter: drop-shadow(1px 0 0 var(--of-fg)) drop-shadow(-1px 0 0 var(--of-fg)) drop-shadow(0 1px 0 var(--of-fg)) drop-shadow(0 -1px 0 var(--of-fg)); }
.of-ws.is-sel .of-who, .of-lc.is-sel .of-who { filter: drop-shadow(2px 0 0 #171717) drop-shadow(-2px 0 0 #171717) drop-shadow(0 2px 0 #171717) drop-shadow(0 -2px 0 #171717); }
.dark .of-ws.is-sel .of-who, .dark .of-lc.is-sel .of-who, .of.dark .of-ws.is-sel .of-who, .of.dark .of-lc.is-sel .of-who { filter: drop-shadow(2px 0 0 #fff) drop-shadow(-2px 0 0 #fff) drop-shadow(0 2px 0 #fff) drop-shadow(0 -2px 0 #fff) drop-shadow(0 0 3px rgba(0,0,0,.6)); }
.of-ws.of-st-pausa .of-who { filter: saturate(.45) brightness(.92); }
.of-dot { position: absolute; left: calc(var(--x) * var(--px) * 1px); top: calc(var(--y) * var(--px) * 1px); width: 5px; height: 5px; border-radius: 50%; background: var(--of-s-trabaja); box-shadow: 0 0 0 1px var(--of-bg); }

/* Resaltar un estado (contadores) */
.of[data-hl] .of-ws .of-spr, .of[data-hl] .of-lc .of-spr { opacity: .22; filter: grayscale(1); }
.of[data-hl] .of-bub { opacity: .12; }
.of[data-hl="trabaja"] .of-st-trabaja .of-spr, .of[data-hl="toca"] .of-st-toca .of-spr, .of[data-hl="error"] .of-st-error .of-spr,
.of[data-hl="pausa"] .of-st-pausa .of-spr, .of[data-hl="libre"] .of-st-libre .of-spr { opacity: 1; filter: none; }
.of[data-hl="trabaja"] .of-bub.of-st-trabaja, .of[data-hl="toca"] .of-bub.of-st-toca, .of[data-hl="error"] .of-bub.of-st-error { opacity: 1; }
.of[data-hl="toca"] .is-need .of-spr, .of[data-hl="toca"] .of-bub.is-need { opacity: 1; filter: none; }
.of[data-hl="toca"] .is-need .of-spr.of-who,
.of[data-hl="trabaja"] .of-st-trabaja .of-spr.of-who, .of[data-hl="toca"] .of-st-toca .of-spr.of-who, .of[data-hl="error"] .of-st-error .of-spr.of-who,
.of[data-hl="pausa"] .of-st-pausa .of-spr.of-who, .of[data-hl="libre"] .of-st-libre .of-spr.of-who { filter: drop-shadow(2px 0 0 var(--hlc)) drop-shadow(-2px 0 0 var(--hlc)) drop-shadow(0 2px 0 var(--hlc)) drop-shadow(0 -2px 0 var(--hlc)); }
.of[data-hl="trabaja"] { --hlc: var(--of-s-trabaja); } .of[data-hl="toca"] { --hlc: var(--of-s-toca); } .of[data-hl="error"] { --hlc: var(--of-s-error); }
.of[data-hl="pausa"] { --hlc: var(--of-s-pausa); } .of[data-hl="libre"] { --hlc: var(--of-s-libre); }

/* Globos (HTML, nítidos) */
.of-bub { position: absolute; z-index: 900; transform: translate(-50%, -100%); pointer-events: none;
  left: calc(var(--x) * var(--px) * 1px + var(--gx, 0px)); top: calc(var(--y) * var(--px) * 1px + var(--gy, 0px));
  display: inline-flex; align-items: center; gap: 3px; height: calc(7px * var(--px) + 4px); padding: 0 calc(2px * var(--px));
  font: 600 calc(4px * var(--px) + 2px)/1 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: nowrap; letter-spacing: .01em;
  border-radius: 3px; border: 1px solid var(--of-room-line); background: #fffdf7; color: #2a2230; box-shadow: 0 1px 0 var(--of-room-line); }
.of-bub::after { content: ""; position: absolute; left: 50%; bottom: -4px; width: 6px; height: 6px; margin-left: calc(var(--gc, 0px) - 3px); background: inherit; border-right: 1px solid var(--of-room-line); border-bottom: 1px solid var(--of-room-line); transform: rotate(45deg) scale(.8); }
.of-bub svg.of-i { width: calc(4px * var(--px) + 3px); height: calc(4px * var(--px) + 3px); }
.of-bub.of-b-toca { background: #7c3aed; color: #fff; border-color: #3b1a80; animation: of-bob 1.1s ease-in-out infinite; }
.of-bub.of-b-error { background: #dc2626; color: #fff; border-color: #6b1010; }
.of-bub em { font-style: normal; opacity: .85; margin-left: 1px; }
.of-bub.is-q { border-style: dashed; background: color-mix(in srgb, #fffdf7 78%, transparent); }
.of-bnd { display: inline-flex; align-items: center; gap: 1px; align-self: stretch; margin: -1px calc(-2px * var(--px) - 1px) -1px calc(1px * var(--px)); padding: 0 calc(1.5px * var(--px)); background: #7c3aed; color: #fff; border-radius: 0 3px 3px 0; animation: of-nudge 1.1s ease-in-out infinite; }
.of-bub.is-need:not(.of-b-toca) { transform: translate(-30%, -100%); }
.of-bub.is-need:not(.of-b-toca)::after { left: 30%; }
.of-bub.of-b-solo { padding: 0; border-color: #3b1a80; background: #7c3aed; }
.of-bub.of-b-solo .of-bnd { margin: 0; border-radius: 3px; }
@keyframes of-nudge { 50% { transform: translateY(-1px); } }
@keyframes of-bob { 50% { transform: translate(-50%, calc(-100% - 2px)); } }
.of-piso.is-x3 .of-bub { font-size: 15px; height: 25px; padding: 0 7px; }

/* ---------- Encabezado ---------- */
.of-hd { flex: none; display: flex; flex-direction: column; gap: 10px; padding: 16px calc(24px - var(--of-sb, 0px)) 12px 24px; container-type: inline-size; }
@container (max-width: 1150px) { .of-hd:not(.is-m) .of-cof .of-nm { display: none; } }
.of-hdr { display: flex; align-items: center; gap: 10px; min-width: 0; flex-wrap: wrap; }
.of-hd h1 { font-size: 20px; line-height: 28px; font-weight: 600; letter-spacing: -.01em; }
.of-hd .of-sub { color: var(--of-muted-fg); font-size: 13px; }
.of-sub[tabindex], .of-wsub[tabindex], .of-tvsub[tabindex] { cursor: default; border-radius: 4px; }
.of-live { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--of-muted-fg); white-space: nowrap; }
.of-live.is-warn { color: var(--of-danger-fg); }
.of-live.is-warn svg { color: var(--of-s-error); }
.of-pulse { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 0 0 rgba(34,197,94,.5); animation: of-pulse 2s infinite; }
@keyframes of-pulse { 70% { box-shadow: 0 0 0 6px rgba(34,197,94,0); } 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); } }
.of-spin { animation: of-spin 1s linear infinite; }
@keyframes of-spin { to { transform: rotate(360deg); } }
.of-rmchip { display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 8px; border-radius: 12px; border: 1px solid var(--of-border-strong); font-size: 12px; color: var(--of-muted-fg); white-space: nowrap; }
.of-rmchip.is-ic { padding: 0 6px; }
.of-cnts { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.of-cnt { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px 0 10px; border-radius: 16px; border: 1px solid color-mix(in srgb, var(--sc) 35%, var(--of-border)); background: color-mix(in srgb, var(--sc) var(--of-s-alpha), transparent); font-size: 13px; color: var(--of-fg); white-space: nowrap; }
.of-cnt svg { color: var(--sc); }
.of-cnt b { font-weight: 650; font-variant-numeric: tabular-nums; font-size: 14px; }
.of-cnt span { color: var(--of-muted-fg); }
.of-cnt:hover { border-color: var(--sc); }
.of-cnt.is-on { background: var(--sc); border-color: var(--sc); color: #fff; }
.of-cnt.is-on svg, .of-cnt.is-on span { color: #fff; }
.dark .of-cnt.is-on.of-c-pausa, .dark .of-cnt.is-on.of-c-libre, .of.dark .of-cnt.is-on.of-c-pausa, .of.dark .of-cnt.is-on.of-c-libre { color: #111; }
.dark .of-cnt.is-on.of-c-pausa :is(svg, span), .dark .of-cnt.is-on.of-c-libre :is(svg, span), .of.dark .of-cnt.is-on.of-c-pausa :is(svg, span), .of.dark .of-cnt.is-on.of-c-libre :is(svg, span) { color: #111; }
.of-cnt.is-sm { height: 28px; padding: 0 10px 0 8px; font-size: 12.5px; border-color: var(--of-border); background: transparent; }
.of-cnt.is-sm.is-on { background: var(--sc); border-color: var(--sc); }
.of-cnt.is-sm b { font-size: 13px; }
.of-cnt.is-xs { height: 24px; padding: 0 8px 0 6px; font-size: 12px; gap: 4px; }
.of-cnt.is-xs b { font-size: 12px; }
.of-cnt-sep { width: 1px; height: 18px; background: var(--of-border); margin: 0 4px; }
.of-cnts.is-m { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.of-cnt.is-tile { height: 52px; flex-direction: column; align-items: flex-start; justify-content: center; gap: 0; padding: 0 10px; border-radius: 10px; }
.of-cnt.is-tile .of-tn { display: inline-flex; align-items: center; gap: 6px; }
.of-cnt.is-tile b { font-size: 18px; line-height: 24px; }
.of-cnt.is-tile .of-tl { font-size: 12px; line-height: 16px; color: var(--of-muted-fg); }
.of-cnt.is-tile.is-on .of-tl { color: #fff; }
.of-cnts.is-w .of-cnt { height: 28px; font-size: 12.5px; padding: 0 10px 0 8px; }
.of-cofs { display: inline-flex; align-items: center; gap: 4px; padding: 2px; border-radius: 10px; background: var(--of-muted); margin-left: auto; }
.of-cof { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 9px 0 6px; border: 0; border-radius: 8px; background: transparent; font-size: 13px; color: var(--of-muted-fg); white-space: nowrap; }
.of-cof.is-all { padding: 0 10px; }
.of-cof:hover { color: var(--of-fg); }
.of-cof.is-on { background: var(--of-bg); color: var(--of-fg); box-shadow: 0 0 0 1px var(--of-border-strong); }
.of-cof .of-n { font-size: 12px; color: var(--of-muted-fg); font-variant-numeric: tabular-nums; display: inline-flex; }
.of-cof .of-n svg { color: var(--of-s-error); }
/* Con 5 o más empresas: solo prefijo y número, para que quepa junto a los contadores (el nombre va en el tooltip) */
.of-cofs.is-cmp .of-cof:not(.is-all) { gap: 5px; padding: 0 8px 0 6px; }
.of-hd.is-m { padding: 10px 12px 10px; gap: 8px; }
/* La fila del estado en vivo llega al borde del piso, más ancha que las fichas, como en los diseños de JST-95 y JST-96:
   con «Mascotas», la campanita y las voces no cabe en los 334 px de adentro. Si aun así no cabe (dos cifras, animación
   reducida, «Reconectando…»), la campanita y las voces bajan a una segunda línea, a la derecha: nunca se cortan. */
.of-hd.is-m .of-hdr { min-height: 20px; margin: 0 -12px; gap: 8px; row-gap: 8px; flex-wrap: wrap; }
.of-hd.is-m .of-hdr > .of-sp { display: none; }
.of-hd.is-m .of-hdr > .of-sp + *, .of-hd.is-m .of-hdr > .of-hbtns { margin-left: auto; }
.of-cofs.is-m { display: flex; margin-left: 0; overflow-x: auto; scrollbar-width: none; }
.of-cofs.is-m::-webkit-scrollbar { display: none; }
.of-cofs.is-m .of-cof { flex: 1; justify-content: center; height: 32px; padding: 0 6px; }

/* Banners */
.of-banner { display: flex; align-items: center; gap: 10px; border: 1px solid var(--of-danger-border); background: var(--of-danger-bg); color: var(--of-fg); border-radius: 8px; padding: 7px 8px 7px 12px; font-size: 13px; line-height: 18px; }
.of-banner > svg { color: var(--of-st-blocked); flex: none; }
.of-banner b { font-weight: 600; }
.of-banner.is-ok { border-color: color-mix(in srgb, var(--of-st-done) 40%, var(--of-border)); background: color-mix(in srgb, var(--of-st-done) 8%, transparent); }
.of-banner.is-ok > svg { color: var(--of-st-done); }

/* Leyenda y pistas */
.of-leyenda { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 16px; font-size: 12px; color: var(--of-muted-fg); max-width: 1100px; }
.of-leyenda span { display: inline-flex; align-items: center; gap: 5px; }
.of-leyenda svg { color: var(--sc); }
.of-leyenda.is-m { display: grid; grid-template-columns: 1fr; gap: 6px; justify-content: stretch; padding: 10px 12px; border: 1px solid var(--of-border); border-radius: 10px; font-size: 12.5px; width: 100%; }
.of-leyenda.is-m > span { align-items: flex-start; }
.of-leyenda.is-m > span > svg { margin-top: 3px; }
.of-leyenda.is-m span span { display: inline; }
.of-leyenda.is-m b { font-weight: 500; color: var(--of-fg); }
.of-hint { display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 12.5px; color: var(--of-muted-fg); }

/* Celular */
.of.is-m .of-msgs { padding: 0 12px 8px; }
/* El piso del celular mide la ventana menos 24 px, pero en el celular la página no puede quitarle al host sus 16 px de
   cada lado (ahí la que se desliza es la ventana): el piso se sale 16 px por lado de lo de adentro (334 px en un
   iPhone de 390) y se ve entero, a 12 px del borde de la pantalla, sin cortarse ni deslizarse de lado (JST-154). */
.of.is-m .of-scroll { padding: 4px 12px 16px; overflow: visible; }
.of-zh { display: flex; align-items: center; gap: 6px; padding: 8px 12px 6px; }
.of-zh .of-zname { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; font-size: 14px; min-width: 104px; justify-content: center; }
.of.is-m .of-cnts.is-m { padding: 0 12px 6px; }
.of-hd.is-m .of-cnts.is-m { padding: 0; }

/* ---------- Ficha del personaje ---------- */
.of-pop { position: fixed; z-index: 1000; width: 340px; max-height: calc(100vh - 72px); overflow-y: auto; background: var(--of-popover); border-radius: 12px; box-shadow: var(--of-shadow-pop); animation: of-fin .14s cubic-bezier(.16,1,.3,1); color: var(--of-fg); }
@keyframes of-fin { from { opacity: 0; transform: translateY(4px) scale(.98); } }
.of-ficha { padding: 14px; display: flex; flex-direction: column; gap: 12px; font-size: 13px; line-height: 18px; }
.of-fh { display: flex; gap: 12px; align-items: flex-start; }
.of-fav { position: relative; width: 72px; height: 80px; border-radius: 10px; flex: none; overflow: hidden; --px: 3;
  background: color-mix(in srgb, var(--cc) 18%, var(--of-muted)); box-shadow: inset 0 -14px 0 color-mix(in srgb, var(--cc) 30%, var(--of-muted)); }
.of-fav .of-spr { left: 12px; top: 6px; }
.of-fn { flex: 1; min-width: 0; padding-top: 2px; }
.of-fn .of-nm { font-size: 15px; font-weight: 600; line-height: 20px; }
.of-fn .of-cg { color: var(--of-muted-fg); font-size: 12.5px; line-height: 18px; margin-top: 1px; }
.of-fn .of-fco { display: flex; align-items: center; gap: 6px; margin-top: 6px; font-size: 12.5px; }
.of-ficha .of-x { width: 28px; height: 28px; border: 0; margin: -4px -4px 0 0; color: var(--of-muted-fg); }
.of-fsts { display: flex; gap: 6px; }
.of-fst { display: flex; align-items: center; gap: 7px; height: 32px; padding: 0 10px; border-radius: 8px; background: color-mix(in srgb, var(--sc) var(--of-s-alpha), transparent); color: var(--sfg); flex: 1; min-width: 0; white-space: nowrap; }
.of-fst.is-also { flex: none; }
.of-fst b { font-weight: 600; }
.of-fst span { color: var(--of-muted-fg); overflow: hidden; text-overflow: ellipsis; }
.of-fst svg { color: var(--sc); }
.of-fb { display: flex; flex-direction: column; gap: 6px; }
.of-fk { font-size: 11px; font-weight: 600; color: var(--of-muted-fg); letter-spacing: .03em; text-transform: uppercase; margin-top: 2px; }
.of-trow { display: grid; grid-template-columns: 16px auto 1fr; gap: 6px; align-items: start; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--of-border); color: var(--of-fg); line-height: 18px; }
.of-trow:hover { background: var(--of-hover-strong); }
.of-trow .of-st { padding-top: 2px; display: inline-flex; color: var(--stc); }
.of-trow .of-tid { font: 500 12px/18px ui-monospace, monospace; color: var(--of-muted-fg); white-space: nowrap; }
.of-trow .of-tt { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.of-facts { display: flex; flex-direction: column; gap: 2px; color: var(--of-muted-fg); font-size: 12px; }
.of-facts span { display: inline-flex; align-items: center; gap: 6px; }
.of-errbox { display: flex; gap: 8px; align-items: flex-start; padding: 8px 10px; border-radius: 8px; line-height: 18px; background: var(--of-danger-bg); border: 1px solid var(--of-danger-border); overflow-wrap: anywhere; }
.of-errbox svg { color: var(--of-s-error); margin-top: 2px; flex: none; }
.of-qlist { display: flex; flex-direction: column; gap: 4px; }
.of-qrow { display: grid; grid-template-columns: auto 1fr; gap: 2px 8px; padding: 7px 10px; border-radius: 8px; color: var(--of-fg); line-height: 18px;
  background: color-mix(in srgb, var(--of-s-toca) var(--of-s-alpha), transparent); border: 1px solid color-mix(in srgb, var(--of-s-toca) 25%, transparent); }
.of-qrow:hover { border-color: var(--of-s-toca); }
.of-qk { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600; color: var(--of-s-toca-fg); grid-row: 1; }
.of-qk svg { color: var(--of-s-toca); }
.of-qq { grid-column: 1 / -1; font-size: 13px; }
.of-qt { grid-row: 1; grid-column: 2; justify-self: end; display: inline-flex; gap: 6px; font-size: 11.5px; color: var(--of-muted-fg); }
.of-qt .of-tid { font: 500 11.5px/18px ui-monospace, monospace; }
.of-fbt { display: flex; gap: 8px; }
.of-fbt .of-btn { flex: 1; }
.of-herm { display: flex; flex-direction: column; gap: 6px; border-top: 1px solid var(--of-border); padding-top: 10px; }
.of-hrow { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
.of-hpill { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 8px 0 4px; border-radius: 8px; border: 1px solid var(--of-border); background: transparent; font-size: 12px; color: var(--of-fg); white-space: nowrap; overflow: hidden; }
.of-hpill.is-on { border-color: var(--of-border-strong); background: var(--of-muted); }
.of-sdot { display: inline-flex; color: var(--sc); }

/* Hoja inferior (celular y TV) */
.of-sheet-bg { position: fixed; inset: 0; background: var(--of-backdrop); z-index: 990; animation: of-fade .15s; }
.of-sheet { position: fixed; left: 0; right: 0; bottom: 0; z-index: 1000; background: var(--of-popover); color: var(--of-fg); border-radius: 16px 16px 0 0; box-shadow: var(--of-shadow-pop); padding-bottom: 12px; animation: of-up .2s cubic-bezier(.16,1,.3,1); max-height: 86vh; overflow: auto; }
.of-sheet .of-grab { width: 36px; height: 4px; border-radius: 2px; background: var(--of-border-strong); margin: 8px auto 0; }
.of-sheet .of-ficha { padding: 12px 16px 6px; font-size: 14px; }
.of-sheet .of-fbt .of-btn { height: 44px; font-size: 14px; }
.of-sheet .of-trow { padding: 10px 12px; }
.of-sheet.is-tv { left: 50%; right: auto; width: min(520px, 100%); transform: translateX(-50%); animation: of-fade .15s; }
@keyframes of-up { from { transform: translateY(40px); opacity: .5; } }
@keyframes of-fade { from { opacity: 0; } }

/* Tooltip y avisos */
.of-tip { position: fixed; z-index: 1100; background: var(--of-popover); color: var(--of-fg); box-shadow: var(--of-shadow-pop); border-radius: 8px; padding: 6px 9px; font-size: 12px; line-height: 16px; pointer-events: none; white-space: nowrap; }
.of-toasts { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); z-index: 1200; display: flex; flex-direction: column; gap: 8px; align-items: center; width: max-content; max-width: calc(100% - 24px); }
.of-toast { display: flex; align-items: center; gap: 10px; background: var(--of-popover); color: var(--of-fg); box-shadow: var(--of-shadow-pop); border-radius: 10px; padding: 10px 14px; font-size: 13px; animation: of-fin .16s; }
@media (max-width: 767px) { .of-toasts { bottom: 80px; } }

/* Marca «✋ 6» en el enlace del menú lateral (JST-95 §7): fuera de .of, con sus colores */
.of-marca { display: inline-flex; align-items: center; gap: 2px; flex: none; height: 18px; padding: 0 5px; border-radius: 9px; background: #7c3aed; color: #fff; font-size: 11px; font-weight: 600; line-height: 18px; font-variant-numeric: tabular-nums; }
.dark .of-marca { background: #9474f0; }
.of-marca svg.of-i { width: 11px; height: 11px; }

/* Botón «Modo TV» en la barra de arriba del host (celular): ícono fantasma de 32 px */
.of-tbtn { display: inline-grid; place-items: center; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 8px; background: transparent; color: inherit; cursor: pointer; }
.of-tbtn:hover { background: color-mix(in srgb, currentColor 8%, transparent); }
.of-tbtn svg.of-i { display: block; }

/* ---------- Widget del Dashboard ---------- */
.of-wdg { margin: -16px; background: transparent; border-radius: inherit; }
.of-wh { display: flex; align-items: center; gap: 8px; height: 44px; padding: 0 12px 0 16px; border-bottom: 1px solid var(--of-border); }
.of-wt { display: inline-flex; align-items: center; gap: 7px; font-weight: 600; font-size: 14px; }
.of-wsub { color: var(--of-muted-fg); font-size: 12px; }
.of-wlink { display: inline-flex; align-items: center; gap: 4px; color: var(--of-muted-fg); font-size: 12.5px; padding: 4px 6px; border-radius: 6px; }
.of-wlink:hover { color: var(--of-fg); background: var(--of-hover-strong); }
.of-wb { padding: 12px 16px 16px; display: flex; flex-direction: column; gap: 10px; align-items: center; overflow-x: auto; }
.of-wb > .of-cnts { align-self: stretch; }
.of-wmsg { align-self: stretch; display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--of-danger-fg); }
.of-wmsg svg { color: var(--of-s-error); }
.of-wb .of-piso { box-shadow: 0 0 0 2px var(--of-room-line); }

/* ---------- Modo TV (1920 × 1080) ---------- */
.of-tvwrap { position: fixed; inset: 0; z-index: 980; background: #000; overflow: hidden; }
/* Centrado en la ventana aunque no quepa, y escalado en torno a su centro (JST-81: con grid se corría si la ventana era más chica) */
.of-tv { width: 1920px; height: 1080px; position: absolute; left: 50%; top: 50%; margin: -540px 0 0 -960px; background: var(--of-bg); display: flex; flex-direction: column; transform-origin: center; }
.of-tvh { height: 112px; flex: none; display: flex; align-items: center; gap: 18px; padding: 0 48px; border-bottom: 1px solid var(--of-border); }
.of-tvt { display: flex; align-items: center; gap: 14px; font-size: 30px; font-weight: 650; margin-right: 18px; letter-spacing: -.01em; white-space: nowrap; }
.of-tvt svg.of-i { width: 30px; height: 30px; }
.of-tvt .of-tvsub { font-weight: 400; font-size: 18px; color: var(--of-muted-fg); }
.of-tvc { display: inline-flex; align-items: center; gap: 12px; height: 60px; padding: 0 24px 0 18px; border-radius: 30px; background: color-mix(in srgb, var(--sc) var(--of-s-alpha), transparent); border: 1px solid color-mix(in srgb, var(--sc) 40%, var(--of-border)); font-size: 20px; white-space: nowrap; }
.of-tvc svg.of-i { width: 26px; height: 26px; color: var(--sc); }
.of-tvc b { font-size: 32px; font-weight: 700; font-variant-numeric: tabular-nums; }
.of-tvc span { color: var(--of-muted-fg); }
.of-tvsm { font-size: 18px; color: var(--of-muted-fg); margin-left: 6px; white-space: nowrap; }
.of-tvclock { font-size: 34px; font-weight: 600; font-variant-numeric: tabular-nums; }
.of-tvh .of-live { font-size: 16px; }
/* La cabecera se ve siempre: si el cuerpo no cabe, se recorta abajo (safe center), nunca encima de la cabecera */
.of-tvb { flex: 1; min-height: 0; position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; justify-content: safe center; gap: 8px; overflow: hidden; }
/* El lugar del banner (38 + los 8 de separación) va siempre, aunque esté vacío: el piso se centra igual con o sin aviso (JST-122) */
.of-tvmsg { width: 1872px; min-height: 38px; flex: none; display: flex; flex-direction: column; gap: 8px; }
/* 38 de alto con el borde (el botón Reintentar es de 28): cabe sobre el piso a 3x (113 + 38 + 8 + 918 = 1077) */
.of-tvmsg .of-banner { font-size: 18px; line-height: 24px; padding: 4px 8px 4px 16px; }
.of-tvb .of-piso.is-x2 .of-bub { font-size: 12px; height: 20px; padding: 0 5px; }
.of-tvb .of-piso.is-x2 .of-placa { font-size: 13px; }
.of-tvbtns { position: absolute; right: 24px; bottom: 20px; display: flex; gap: 8px; z-index: 950; }
.of-tvexit { display: inline-flex; align-items: center; gap: 8px; height: 36px; padding: 0 14px; border-radius: 18px; border: 1px solid var(--of-border-strong); background: color-mix(in srgb, var(--of-bg) 80%, transparent); font-size: 14px; color: var(--of-muted-fg); opacity: .7; }
.of-tvexit:hover { opacity: 1; }
.of-tvexit kbd { font: 12px ui-monospace, monospace; border: 1px solid var(--of-border-strong); border-radius: 4px; padding: 0 5px; }
`;

/** La hoja entera: la de la 0.1.x, las piezas de la 0.2.0 (JST-95), la vida de la 0.3.0 (JST-96) y el Resumen de la 0.9.0 (JST-246), cada una en su archivo. */
const HOJA = CSS + CSS_LISTA + CSS_VENTANA + CSS_AVISOS + CSS_VIDA + CSS_ROTULO + CSS_RESUMEN + CSS_CONTEXTO + CSS_VOCES + CSS_3D;

const STYLE_ID = "jstm-oficina-pixel-estilos";

/** Inserta (o actualiza tras una actualización del plugin) la hoja de estilos una sola vez. */
export function asegurarEstilos(): void {
  if (typeof document === "undefined") return;
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  if (style.textContent !== HOJA) style.textContent = HOJA;
}
