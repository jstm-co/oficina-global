// Estilos del Resumen (0.9.0, design-spec de JST-245, A · Menú y reproductor):
// el botón, el menú (popover de 360 px u hoja inferior), el reproductor, el
// avance, «Texto» y la Oficina mientras lee. Los del prototipo `propuesta-a.html`
// con el prefijo `of-` y los tokens `--of-*` de `estilos.ts`.
export const CSS_RESUMEN = /* css */ `
.of, .of-layer { --of-hover: rgba(0,0,0,.04); }
.dark .of, .dark .of-layer, .of.dark { --of-hover: rgba(255,255,255,.04); }

/* ---------- El botón (§1): como «Voces»; mientras lee, las barras de audio-lines suben y bajan ---------- */
.of-rsw { position: relative; display: inline-flex; flex: none; }
.of-rsbtn .of-rs-cv { margin-left: -2px; color: var(--of-muted-fg); }
.of-rsbtn.is-lee { border-color: var(--of-border-strong); background: var(--of-muted); }
.of-rsbtn.is-open, .of-rsbtn.is-open:hover { background: var(--of-muted); }
.of-rsbtn.is-lee > svg:first-child path { transform-box: fill-box; transform-origin: center; animation: of-rs-eq .9s ease-in-out infinite; }
.of-rsbtn.is-lee > svg:first-child path:nth-child(2) { animation-delay: -.3s; }
.of-rsbtn.is-lee > svg:first-child path:nth-child(3) { animation-delay: -.6s; }
.of-rsbtn.is-lee > svg:first-child path:nth-child(4) { animation-delay: -.15s; }
.of-rsbtn.is-lee > svg:first-child path:nth-child(5) { animation-delay: -.45s; }
@keyframes of-rs-eq { 0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(.45); } }
/* Celular: en la barra de arriba de Paperclip, antes de «Modo TV» (44 × 44) */
.of-rstop { width: 44px; height: 44px; display: inline-grid; place-items: center; padding: 0; margin-right: -4px; border: 0; border-radius: 8px; background: transparent; color: inherit; cursor: pointer; }
.of-rstop.is-lee { background: var(--of-muted, rgba(127,127,127,.18)); }

/* ---------- El menú (§2): el armazón de «Conversaciones» ---------- */
.of-hpop.is-resumen { width: 360px; max-height: calc(100vh - 120px); }
.of-rsp { gap: 12px; }
.of-rsp .of-avp-h > svg { color: var(--of-fg); }
.of-rs-dur { font-size: 12px; color: var(--of-muted-fg); font-variant-numeric: tabular-nums; }
.of-rs-k { display: flex; align-items: baseline; gap: 8px; white-space: nowrap; font-size: 11px; font-weight: 600; color: var(--of-muted-fg); letter-spacing: .03em; text-transform: uppercase; margin-bottom: -4px; }
.of-rs-hint { font-size: 12px; line-height: 16px; color: var(--of-muted-fg); margin-top: -4px; }
.of-rs-hint b { color: var(--of-fg); font-weight: 500; }
.of-rs-seg { display: flex; gap: 2px; padding: 2px; border-radius: 10px; background: var(--of-muted); }
.of-rs-seg button { flex: 1; min-width: 0; height: 28px; padding: 0 6px; border: 0; border-radius: 8px; background: transparent; color: var(--of-muted-fg); font-size: 12.5px; font-weight: 500;
  display: inline-flex; align-items: center; justify-content: center; gap: 5px; white-space: nowrap; cursor: pointer; }
.of-rs-seg button:hover { color: var(--of-fg); }
.of-rs-seg button[aria-checked="true"] { background: var(--of-bg); color: var(--of-fg); box-shadow: 0 0 0 1px var(--of-border-strong); }
.of-rs-seg button em { font-style: normal; font-weight: 400; color: var(--of-muted-fg); }
.of-rs-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.of-rs-chip { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 7px; border: 1px solid var(--of-border); border-radius: 8px; background: transparent; color: var(--of-muted-fg); font-size: 12.5px; cursor: pointer; white-space: nowrap; }
.of-rs-chip.is-todas { padding: 0 10px; }
.of-rs-chip:hover { color: var(--of-fg); }
.of-rs-chip[aria-pressed="true"] { color: var(--of-fg); border-color: var(--of-border-strong); background: var(--of-hover-strong); box-shadow: inset 0 0 0 1px var(--of-border-strong); }
.of-rs-chip.is-falla { border-style: dashed; }
.of-rs-partes { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.of-rs-parte { display: flex; align-items: center; gap: 6px; height: 36px; padding: 0 9px 0 8px; border: 1px solid var(--of-border); border-radius: 8px; background: transparent; color: var(--of-muted-fg); font-size: 12.5px; text-align: left; cursor: pointer; min-width: 0; }
.of-rs-parte:hover { color: var(--of-fg); }
.of-rs-parte[aria-checked="true"] { color: var(--of-fg); border-color: var(--of-border-strong); background: var(--of-hover); }
.of-rs-ck { width: 16px; height: 16px; flex: none; box-sizing: border-box; border-radius: 4px; border: 1.5px solid var(--of-border-strong); display: grid; place-items: center; }
.of-rs-parte[aria-checked="true"] .of-rs-ck { background: var(--of-fg); border-color: var(--of-fg); color: var(--of-bg); }
.of-rs-ck svg.of-i { width: 12px; height: 12px; stroke-width: 3; }
.of-rs-pi { flex: none; }
.of-rs-parte.is-toca .of-rs-pi { color: var(--of-s-toca); } .of-rs-parte.is-hecho .of-rs-pi { color: var(--of-st-done); }
.of-rs-parte.is-trabajan .of-rs-pi { color: var(--of-s-trabaja); } .of-rs-parte.is-cola .of-rs-pi { color: var(--of-st-todo); }
.of-rs-parte:not([aria-checked="true"]) .of-rs-pi { opacity: .6; }
.of-rs-pt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.of-rs-pn { margin-left: auto; padding-left: 2px; font-size: 11.5px; color: var(--of-muted-fg); font-variant-numeric: tabular-nums; }
.of-rs-go { width: 100%; height: 40px; justify-content: center; font-size: 14px; gap: 8px; border-radius: 10px; margin-top: 2px; }
.of-rs-go svg.of-i { fill: currentColor; }
.of-rsp .of-avp-note { margin-top: -4px; }
.of-rs-error { display: flex; flex-direction: column; gap: 8px; padding: 10px; border-radius: 10px; background: var(--of-danger-bg); border: 1px solid var(--of-danger-border); font-size: 12.5px; line-height: 18px; }
.of-rs-error .of-btn { align-self: flex-start; }
.of-rs-sinvoz { display: flex; gap: 8px; align-items: flex-start; font-size: 12px; line-height: 17px; color: var(--of-muted-fg); }
.of-rs-sinvoz b { color: var(--of-fg); font-weight: 500; }
/* Hoja inferior (celular, §7): objetivos de 44 px */
.of-rssheet .of-hsheet-b { padding: 12px 16px calc(16px + env(safe-area-inset-bottom)); }
.of-rssheet .of-avp { font-size: 14px; line-height: 20px; }
.of-rssheet .of-rs-seg button { height: 40px; font-size: 13.5px; }
.of-rssheet .of-rs-chip { height: 40px; padding: 0 12px; }
/* Se ven de 40 px (§7) y se tocan en 44 px */
.of-rssheet .of-rs-seg button, .of-rssheet .of-rs-chip { position: relative; }
.of-rssheet .of-rs-seg button::before, .of-rssheet .of-rs-chip::before { content: ""; position: absolute; inset: -2px 0; }
.of-rssheet .of-rs-parte { height: 44px; font-size: 13.5px; }
.of-rssheet .of-rs-go { height: 48px; font-size: 15px; }

/* ---------- Esqueleto y giro ---------- */
.of-rs-sk { display: inline-block; vertical-align: middle; height: 10px; border-radius: 5px; background: linear-gradient(90deg, var(--of-skel) 0, var(--of-skel-hi) 40%, var(--of-skel) 80%); background-size: 300% 100%; animation: of-rs-sk 1.2s linear infinite; }
.of-rs-sk.is-num { width: 24px; }
@keyframes of-rs-sk { from { background-position: 100% 0; } to { background-position: -50% 0; } }
.of-rs-spin { animation: of-rs-spin 1s linear infinite; }
@keyframes of-rs-spin { to { transform: rotate(360deg); } }

/* ---------- El reproductor (§4): abajo, centrado sobre la Oficina, encima de la leyenda ---------- */
.of-rs-a { position: fixed; bottom: 14px; z-index: 45; display: flex; justify-content: center; pointer-events: none; }
/* Sobre el piso de la Oficina (sus rótulos y globos van hasta 960), debajo de sus menús y hojas (990+); en las otras páginas, debajo de los diálogos del host */
.of-rs-a.is-piso { z-index: 970; }
/* Sobre la vista 3D (975), que tapa la ventana entera; debajo de sus fichas y menús */
.of-rs-a.is-3d { z-index: 980; }
.of-rsa-dock { width: min(880px, calc(100% - 48px)); display: flex; flex-direction: column; gap: 8px; pointer-events: auto; }
.of-rsa-bar { position: relative; display: flex; align-items: center; gap: 6px; min-height: 64px; padding: 12px 10px 10px 12px; box-sizing: border-box; color: var(--of-fg);
  background: var(--of-popover); border: 1px solid var(--of-border); border-radius: 14px; box-shadow: var(--of-shadow-pop); animation: of-rs-up .2s cubic-bezier(.16,1,.3,1); font-size: 14px; line-height: 20px; }
@keyframes of-rs-up { from { opacity: 0; transform: translateY(8px); } }
.of-rsa-play { width: 40px; height: 40px; flex: none; display: grid; place-items: center; border: 0; border-radius: 50%; background: var(--of-primary); color: var(--of-primary-fg); cursor: pointer; margin-right: 2px; padding: 0; }
.of-rsa-play svg.of-i { width: 16px; height: 16px; }
.of-rsa-play:hover { filter: brightness(1.08); }
.of-rs-fill svg.of-i, svg.of-i.of-rs-fill { fill: currentColor; }
/* El arco del \`loader\` no se rellena: sin esto el ▶ de «Armando» y «Esperando» sale como un círculo (JST-314) */
.of-rs-fill svg.of-i.of-rs-spin { fill: none; }
.of-rsa-play:focus-visible, .of-rsa-bar .of-ibtn:focus-visible, .of-rsa-bar .of-btn:focus-visible, .of-rs-tid:focus-visible { outline: 2px solid var(--of-ring); outline-offset: 2px; }
.of-rsa-bar .of-ibtn { width: 32px; height: 32px; flex: none; }
.of-rsa-bar .of-ibtn:disabled { opacity: .35; cursor: default; }
.of-rsa-c { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; padding: 0 8px 0 6px; }
.of-rsa-sec { display: flex; align-items: center; gap: 5px; font-size: 11px; line-height: 16px; font-weight: 600; letter-spacing: .03em; text-transform: uppercase; color: var(--of-muted-fg); white-space: nowrap; overflow: hidden; }
.of-rsa-si.is-toca { color: var(--of-s-toca); } .of-rsa-si.is-hecho { color: var(--of-st-done); } .of-rsa-si.is-trabajan { color: var(--of-s-trabaja); } .of-rsa-si.is-cola { color: var(--of-st-todo); }
/* La parte y «En pausa»: en la misma línea (11 px entre los dos) y, si no caben, «En pausa» entero abajo, sin sangría (JST-291) */
.of-rsa-sec.is-parte { flex-wrap: wrap; column-gap: 11px; row-gap: 3px; }
.of-rsa-sn { display: flex; align-items: center; gap: 5px; min-width: 0; overflow: hidden; }
/* El texto de la cabecera, si no cabe ni solo en su línea, termina en «…» en vez de cortarse a media letra (JST-299) */
.of-rsa-nom { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
/* «k de N» nunca se corta: si no cabe junto al nombre, baja entero (JST-295). Su «·» va en los 11 px entre los dos;
   al bajar, queda a la izquierda del borde y la cabecera lo esconde (overflow), así la línea empieza con el número */
.of-rsa-k { flex: none; margin-left: -11px; }
.of-rsa-k::before { content: "·"; content: "·" / ""; display: inline-block; width: 11px; text-align: center; letter-spacing: 0; }
.of-rsa-pz { padding: 0 6px; border-radius: 4px; background: var(--of-muted); color: var(--of-fg); letter-spacing: 0; text-transform: none; font-weight: 500; white-space: normal; }
.of-rsa-sub { font-size: 14px; line-height: 20px; font-weight: 500; color: var(--of-fg); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.of-rsa-sub .of-cotag { vertical-align: 1px; margin-right: 4px; }
.of-rsa-sub.is-mut { color: var(--of-muted-fg); font-weight: 400; display: flex; align-items: center; gap: 6px; }
.of-rsa-sub.is-fin { color: var(--of-muted-fg); font-weight: 400; -webkit-line-clamp: 1; }
.of-rsa-sub.is-aviso { color: var(--of-danger-fg); }
.of-rsa-sub .of-rs-sk { display: block; margin-top: 5px; }
.of-rsa-vel { min-width: 44px; font-variant-numeric: tabular-nums; }
.of-rsa-bar .of-btn.is-sm.is-ghost.is-on { border-color: var(--of-input); }
/* Las piezas del reproductor que no se usan en el celular */
.of-rsa-bar .of-btn.is-sm { flex: none; }

/* El avance: un tramo de 3 px por parte, arriba de la caja */
.of-rsa-prog { position: absolute; left: 14px; right: 14px; top: 5px; height: 3px; display: flex; gap: 3px; }
.of-rsa-prog i { position: relative; height: 3px; border-radius: 2px; background: var(--of-border-strong); overflow: hidden; min-width: 4px; }
.of-rsa-prog i > b { position: absolute; left: 0; top: 0; bottom: 0; background: var(--of-fg); }
.of-rsa-prog i > b.is-ahora { width: 0; animation: of-rs-fill var(--d) linear forwards; animation-delay: var(--t); }
.of-rsa-prog.is-quieto i > b.is-ahora { animation-play-state: paused; }
@keyframes of-rs-fill { from { width: var(--w0); } to { width: var(--w1); } }

/* «Texto» (§5): todo el resumen, encima del reproductor */
.of-rsa-texto { max-height: min(46vh, 420px); overflow: auto; padding: 10px 8px 12px; box-sizing: border-box; color: var(--of-fg); background: var(--of-popover); border: 1px solid var(--of-border); border-radius: 14px; box-shadow: var(--of-shadow-pop); animation: of-rs-up .18s cubic-bezier(.16,1,.3,1); font-size: 14px; line-height: 20px; }
.of-rsa-th { display: flex; align-items: baseline; gap: 8px; padding: 2px 8px 10px; font-size: 13px; }
.of-rsa-th b { font-weight: 600; white-space: nowrap; }
.of-rsa-tm { font-size: 12px; color: var(--of-muted-fg); }
.of-rsa-warn, .of-rsa-nv { display: flex; gap: 8px; align-items: flex-start; margin: 0 8px 10px; padding: 8px 10px; border-radius: 8px; background: var(--of-danger-bg); border: 1px solid var(--of-danger-border); font-size: 12.5px; line-height: 18px; color: var(--of-fg); }
.of-rsa-warn > svg { color: var(--of-s-error); flex: none; margin-top: 1px; }
.of-rsa-nv { margin: 0; background: var(--of-popover); border-color: var(--of-border); box-shadow: var(--of-shadow-pop); }
.of-rs-guion { display: flex; flex-direction: column; gap: 14px; }
.of-rs-gsec { display: flex; flex-direction: column; gap: 2px; }
.of-rs-gh { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600; letter-spacing: .03em; text-transform: uppercase; color: var(--of-muted-fg); padding: 0 8px 4px; }
.of-rs-gh.is-toca svg { color: var(--of-s-toca); } .of-rs-gh.is-hecho svg { color: var(--of-st-done); } .of-rs-gh.is-trabajan svg { color: var(--of-s-trabaja); } .of-rs-gh.is-cola svg { color: var(--of-st-todo); }
.of-rs-fr { position: relative; display: block; width: 100%; padding: 6px 8px 6px 10px; border: 0; border-radius: 8px; background: transparent; color: var(--of-fg); font-size: 13.5px; line-height: 20px; text-align: left; cursor: pointer; }
.of-rs-fr:hover { background: var(--of-hover); }
.of-rs-fr.is-fut { color: var(--of-muted-fg); }
.of-rs-fr.is-cur { background: var(--of-hover-strong); }
.of-rs-fr.is-cur::before { content: ""; position: absolute; left: 0; top: 6px; bottom: 6px; width: 3px; border-radius: 2px; background: var(--of-fg); }
.of-rs-fr .of-cotag { margin-right: 6px; vertical-align: 1px; }
.of-rs-fr.is-aviso { color: var(--of-danger-fg); }
.of-rs-fr:focus-visible { outline: 2px solid var(--of-ring); outline-offset: -2px; }
.of-rs-gsk { display: flex; flex-direction: column; gap: 8px; padding: 6px 8px 6px 10px; }
/* El chip de una tarea (§4): abre la tarea en la misma pestaña */
.of-rs-tid { display: inline-flex; align-items: center; height: 18px; padding: 0 5px; margin-left: 6px; border: 1px solid var(--of-border); border-radius: 5px; background: transparent; color: var(--of-muted-fg);
  font: 500 11px/16px ui-monospace, SFMono-Regular, Menlo, monospace; vertical-align: 1px; cursor: pointer; white-space: nowrap; text-decoration: none; }
.of-rs-tid:hover { color: var(--of-fg); border-color: var(--of-border-strong); }

/* Celular (§7): sobre la barra de abajo de Paperclip, a lo ancho; sin anterior, siguiente ni velocidad */
.of-rs-a.is-m { left: 0 !important; width: 100% !important; bottom: calc(64px + 8px + env(safe-area-inset-bottom)); }
.of-rs-a.is-m .of-rsa-dock { width: calc(100% - 16px); }
.of-rs-a.is-m .of-rsa-bar { gap: 4px; padding: 12px 6px 8px 10px; }
.of-rs-a.is-m .of-rsa-sub { font-size: 13.5px; line-height: 19px; -webkit-line-clamp: 2; }
.of-rs-a.is-m .of-rsa-bar .of-ibtn { width: 44px; height: 44px; }
.of-rs-a.is-m .of-rsa-play { width: 44px; height: 44px; }
.of-rs-a.is-m .of-rsa-texto { max-height: 52vh; }
.of-rs-a.is-m .of-rsa-th { flex-direction: column; align-items: flex-start; gap: 2px; }

/* Angosto (JST-314, C de JST-305): con el reproductor de menos de 600 px (se mide él, no la ventana; solo en el
   computador) la caja pasa a dos filas: arriba la parte y la frase a lo ancho, abajo los mismos 6 botones. El DOM no
   cambia (el Tab sigue ▶ ⏮ ⏭, chip, 1×, Texto, ✕); el alto queda entre 111 y 151 px. */
.of-rs-a:not(.is-m) .of-rsa-dock { container: rsa / inline-size; }
@container rsa (width < 600px) {
  .of-rsa-bar { display: grid; grid-template-columns: 42px 32px 32px minmax(0, 1fr) auto auto 32px; grid-template-areas: "c c c c c c c" "pl pv nx . vl tx x"; column-gap: 6px; row-gap: 8px; align-items: center; }
  .of-rsa-c { grid-area: c; padding: 0 2px; }
  .of-rsa-play { grid-area: pl; }
  .of-rsa-prev { grid-area: pv; } .of-rsa-next { grid-area: nx; }
  .of-rsa-vel { grid-area: vl; } .of-rsa-txt { grid-area: tx; } .of-rsa-x { grid-area: x; }
  .of-rsa-th { flex-direction: column; align-items: flex-start; gap: 2px; }
}

/* Mientras está el reproductor, el piso se puede bajar 128 px más (§4), o lo que mida el reproductor si es más (JST-314) */
.of.of-rs-on .of-scroll { padding-bottom: calc(16px + max(128px, var(--of-rs-piso, 0px))); }
/* Y en las páginas de Paperclip, lo justo para que lo último (en una tarea, el cuadro de comentario) quede 8 px arriba
   del reproductor (JST-298); el alto lo mide el reproductor (huecoAbajo) */
html[data-of-rs-hueco] #main-content::after { content: ""; display: block; height: var(--of-rs-hueco, 0px); }

/* El anillo del agente del que se habla (§6); la regla con su id la pone resumen.ts */
@keyframes of-rs-anillo { 0%, 100% { opacity: 1; } 50% { opacity: .45; } }
[data-oficina-pagina] .of-piso .of-sala { transition: opacity .25s, filter .25s, box-shadow .25s; }

/* Movimiento reducido (§10): sin barras, anillo, avance ni esqueleto; el avance salta por frase */
@media (prefers-reduced-motion: reduce) {
  .of-rsbtn.is-lee > svg:first-child path, .of-rs-sk, .of-rs-spin, .of-rsa-bar, .of-rsa-texto { animation: none !important; }
  .of-rsa-prog i > b.is-ahora { animation: none !important; width: var(--w1); opacity: .5; }
  [data-oficina-pagina] .of-piso :is(.of-ws, .of-lc)::after { animation: none !important; }
  [data-oficina-pagina] .of-piso .of-sala { transition: none; }
}
`;
