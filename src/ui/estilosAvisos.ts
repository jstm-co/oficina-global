// Estilos de los botones y paneles «Avisos» y «Voces» (§6–§8), el subtítulo, el widget (§9) y el TV (§10), design-spec de JST-95. Mismos tokens `--of-*` de `estilos.ts`.
export const CSS_AVISOS = /* css */ `
/* ---------- Botones del encabezado (§6) ---------- */
.of-hbtns { display: inline-flex; align-items: center; gap: 8px; flex: none; }
.of-hbtns.is-m { gap: 10px; }
.of-hbtn { position: relative; }
.of-hbtn .of-hdot { position: absolute; top: -3px; right: -3px; width: 7px; height: 7px; border-radius: 50%; background: var(--of-s-toca); box-shadow: 0 0 0 2px var(--of-bg); }
.of-hbtn.is-on { border-color: color-mix(in srgb, var(--of-s-toca) 45%, var(--of-border)); color: var(--of-s-toca-fg); }
.of-hbtn.is-on svg { color: var(--of-s-toca); }
.of-hbtn.is-open, .of-hbtn.is-open:hover { background: var(--of-muted); }
.of-ibtn.of-hbtn { width: 28px; height: 28px; border-radius: 7px; }
/* Área táctil de 44 px en el celular */
.of-ibtn.of-hbtn::before { content: ""; position: absolute; inset: -8px; }
.of-ibtn.of-hbtn .of-hdot { top: -2px; right: -2px; }

/* Panel: popover de 364 px (computador) u hoja inferior (celular) */
.of-hpop { position: fixed; z-index: 1150; width: 364px; max-width: calc(100vw - 24px); max-height: calc(100vh - 80px); overflow-y: auto; background: var(--of-popover); color: var(--of-fg);
  border-radius: 12px; box-shadow: var(--of-shadow-pop); padding: 14px; animation: of-fin .14s cubic-bezier(.16,1,.3,1); }
.of-hsheet-b { padding: 12px 16px 16px; }

/* ---------- Contenido de los paneles (§7 y §8) ---------- */
.of-avp { display: flex; flex-direction: column; gap: 10px; font-size: 13px; line-height: 19px; }
.of-avp p { margin: 0; color: var(--of-muted-fg); }
.of-avp p b { color: var(--of-fg); font-weight: 500; }
.of-avp-h { display: flex; align-items: center; gap: 8px; font-size: 14px; line-height: 20px; }
.of-avp-h b { font-weight: 600; }
.of-avp-h > svg { color: var(--of-s-toca); }
.of-avp-note { display: flex; gap: 6px; align-items: flex-start; font-size: 12px; line-height: 17px; color: var(--of-muted-fg); }
.of-avp-note > svg { margin-top: 2px; flex: none; }
.of-avp-note .of-btn { flex: none; }
.of-avp-note.is-box { padding: 8px 10px; border-radius: 8px; background: var(--of-muted); color: var(--of-fg); }
.of-avp-note.is-box b { font-weight: 600; }
.of-avp-note.is-box span svg { vertical-align: -2px; }
.of-avp-row { display: flex; align-items: center; gap: 8px; }
.of-avp-l { flex: 1; min-width: 0; display: flex; gap: 8px; align-items: flex-start; }
.of-avp-l > svg { margin-top: 2px; color: var(--of-muted-fg); flex: none; }
.of-avp-l > span { display: flex; flex-direction: column; min-width: 0; }
.of-avp-l b { font-weight: 500; }
.of-avp-l em { font-style: normal; font-size: 12px; line-height: 16px; color: var(--of-muted-fg); }
.of-avp-ch { display: flex; flex-direction: column; gap: 10px; border-top: 1px solid var(--of-border); padding-top: 10px; }
.of-avp-ch.is-off { opacity: .55; }
.of-avp-st { display: inline-flex; align-items: center; gap: 4px; flex: none; font-size: 12px; color: var(--of-muted-fg); white-space: nowrap; }
.of-avp-st.is-ok { color: var(--of-st-done); }
.of-avp-st.is-warn { color: var(--of-s-error-fg); }
.of-avp-st.is-off { height: 22px; padding: 0 8px; border-radius: 11px; background: var(--of-muted); }

/* Ejemplo del aviso de Paperclip (usePluginToast, 2026.824.1): tono «info», celeste, punto de 8 px */
.of-hst { display: flex; align-items: flex-start; gap: 12px; padding: 10px 12px; border-radius: 4px; border: 1px solid #7dd3fc; background: #f0f9ff; color: #0c4a6e; }
.dark .of-hst, .of.dark .of-hst { border-color: rgba(14,165,233,.25); background: rgba(8,47,73,.6); color: #e0f2fe; }
.of-hst-dot { width: 8px; height: 8px; margin-top: 6px; border-radius: 50%; flex: none; background: #0ea5e9; }
.dark .of-hst-dot, .of.dark .of-hst-dot { background: #38bdf8; }
.of-hst-tx { flex: 1; min-width: 0; }
.of-hst-ti { font-size: 14px; line-height: 20px; font-weight: 600; }
.of-hst-b { margin-top: 4px; font-size: 12px; line-height: 16px; opacity: .7; }
.of-hst-a { display: inline-flex; margin-top: 8px; font-size: 12px; font-weight: 500; text-decoration: underline; text-underline-offset: 4px; }

/* Voces: casillas de las frases y control segmentado */
.of-vz-list { display: flex; flex-direction: column; gap: 2px; }
.of-vz-ev { position: relative; display: flex; gap: 10px; align-items: flex-start; padding: 6px 8px; border-radius: 7px; cursor: pointer; line-height: 18px; }
.of-vz-ev:hover { background: var(--of-hover-strong); }
.of-vz-ev input { position: absolute; left: 8px; top: 7px; width: 16px; height: 16px; margin: 0; opacity: 0; }
.of-vz-mk { width: 16px; height: 16px; flex: none; margin-top: 1px; border-radius: 4px; border: 1.5px solid var(--of-border-strong); display: grid; place-items: center; color: #fff; }
.of-vz-ev.is-on .of-vz-mk { background: var(--of-s-toca); border-color: var(--of-s-toca); }
.of-vz-mk svg.of-i { width: 11px; height: 11px; stroke-width: 3; }
.of-vz-ev input:focus-visible + .of-vz-mk { outline: 2px solid var(--of-ring); outline-offset: 2px; }
.of-vz-ev > span:last-child { display: flex; flex-direction: column; }
.of-vz-ev b { font-weight: 500; }
.of-vz-ev em { font-style: normal; font-size: 12px; color: var(--of-muted-fg); }
.of-vz-fmt { display: flex; flex-direction: column; gap: 6px; }
.of-vz-k { font-size: 11px; font-weight: 600; color: var(--of-muted-fg); letter-spacing: .03em; text-transform: uppercase; }
.of-seg { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px; padding: 2px; border-radius: 8px; background: var(--of-muted); }
.of-seg button { height: 28px; padding: 0 4px; border: 0; border-radius: 6px; background: transparent; color: var(--of-muted-fg); font-size: 12px; font-weight: 500; white-space: nowrap; }
.of-seg button:hover { color: var(--of-fg); }
.of-seg button[aria-pressed="true"] { background: var(--of-bg); color: var(--of-fg); box-shadow: 0 0 0 1px var(--of-border); }

/* ---------- Subtítulo de la voz (§8): igual en los dos temas ---------- */
.of-subt { position: fixed; z-index: 1250; left: 50%; bottom: 22px; transform: translateX(-50%); display: flex; align-items: center; gap: 10px; max-width: calc(100% - 24px);
  padding: 8px 14px 8px 12px; border-radius: 12px; background: rgba(17,17,20,.88); color: #fafafa; font-size: 14px; line-height: 20px; box-shadow: 0 8px 24px rgba(0,0,0,.3);
  pointer-events: none; animation: of-subt .18s cubic-bezier(.16,1,.3,1); }
@keyframes of-subt { from { opacity: 0; transform: translate(-50%, 6px); } }
.of-subt > svg.of-i { color: #c4b5fd; flex: none; }
.of-subt-c { position: relative; flex: none; display: block; width: 16px; height: 22px; overflow: hidden; --px: 1; }
.of-subt b { font-weight: 500; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.of-subt.is-rm { animation: none; }

/* ---------- «Te esperan» del widget (§9) ---------- */
.of-wl { align-self: stretch; display: flex; flex-direction: column; gap: 2px; border-top: 1px solid var(--of-border); padding-top: 8px; }
.of-wl-h { display: flex; align-items: center; gap: 6px; padding: 0 2px 4px; font-size: 12px; font-weight: 600; color: var(--of-s-toca-fg); }
.of-wl-h .of-wlink { font-weight: 400; padding: 2px 6px; }
.of-wl-row { display: flex; align-items: center; gap: 10px; padding: 5px 6px; border-radius: 8px; cursor: pointer; }
.of-wl-row:hover { background: var(--of-hover-strong); }
.of-wl-row:focus-visible { outline: 2px solid var(--of-ring); outline-offset: -2px; }
.of-wl-m { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 17px; }
.of-wl-n { display: flex; align-items: center; gap: 6px; font-size: 12.5px; }
.of-wl-n b { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.of-wl-q { font-size: 12px; color: var(--of-muted-fg); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.of-wl-q .of-tid { font: 500 11.5px/17px ui-monospace, SFMono-Regular, Menlo, monospace; margin-right: 6px; }
.of-wl-row > svg { color: var(--of-muted-fg); }
.of-wl-row > .of-btn { flex: none; pointer-events: none; }

/* ---------- TV (§10): banner «te necesita» y botones de abajo ---------- */
.of-banner.is-toca { border-color: color-mix(in srgb, var(--of-s-toca) 55%, transparent); background: color-mix(in srgb, var(--of-s-toca) 14%, var(--of-bg)); }
.of-banner.is-toca > svg { color: var(--of-s-toca); }
/* Mide lo mismo que los otros banners del TV (38 px con el borde): no mueve el piso */
.of-tvmsg .of-banner.is-toca { min-height: 38px; }
.of-tvmsg .of-banner.is-toca svg.of-i { width: 18px; height: 18px; }
.of-tvb-ago { color: var(--of-muted-fg); font-size: 16px; padding-right: 8px; white-space: nowrap; }
.of-tvexit.of-tvi.is-on { color: var(--of-s-toca-fg); border-color: color-mix(in srgb, var(--of-s-toca) 50%, var(--of-border)); }
.of-tvexit.of-tvi.is-on svg { color: var(--of-s-toca); }

@media (prefers-reduced-motion: reduce) { .of-hpop, .of-subt, .of-hsheet { animation: none !important; } }

/* ---------- 0.5.0 (JST-163): «Voces» suma «Y de qué se trata», un interruptor chico por frase ---------- */
.of-hpop.is-voces { width: 392px; max-height: calc(100vh - 140px); }
.of-vz-cab, .of-vz-fila { display: grid; grid-template-columns: minmax(0, 1fr) 118px; column-gap: 8px; align-items: start; }
.of-vz-cab { margin: 2px 0 -6px; padding: 0 8px; }
.of-vz-cab span { white-space: nowrap; font-size: 11px; font-weight: 600; color: var(--of-muted-fg); letter-spacing: .03em; text-transform: uppercase; }
.of-vz-cab span:last-child { padding-left: 8px; }
.of-vz-fila { min-height: 32px; border-radius: 7px; }
.of-vz-fila:hover { background: var(--of-hover-strong); }
.of-vz-fila .of-vz-ev:hover { background: transparent; }
.of-vz-det { display: inline-flex; align-items: center; gap: 7px; height: 30px; padding: 0 8px; border: 0; border-radius: 7px; background: transparent; color: var(--of-muted-fg);
  font-family: inherit; font-weight: 500; font-size: 12.5px; line-height: 1; cursor: pointer; text-align: left; white-space: nowrap; }
.of-vz-det.is-on { color: var(--of-fg); }
.of-vz-swm { position: relative; width: 26px; height: 16px; flex: none; border-radius: 8px; background: var(--of-border-strong); transition: background .15s; }
.of-vz-swm i { position: absolute; left: 2px; top: 2px; width: 12px; height: 12px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.25); transition: transform .15s; }
.of-vz-det.is-on .of-vz-swm { background: var(--of-s-toca); }
.of-vz-det.is-on .of-vz-swm i { transform: translateX(10px); }
/* Su frase apagada: gris al 45 %, no se puede tocar y conserva su valor */
.of-vz-det:disabled { cursor: not-allowed; opacity: .45; }
.of-vz-det:focus-visible { outline: 2px solid var(--of-ring); outline-offset: 1px; }
.of-rm .of-vz-swm, .of-rm .of-vz-swm i { transition: none; }
/* Voces apagadas: lo de abajo del encabezado se ve al 60 % y se puede cambiar igual */
.of-vzp.is-apagadas .of-vz-list, .of-vzp.is-apagadas .of-vz-cab, .of-vzp.is-apagadas .of-vz-fmt { opacity: .6; }
.of-vzp.is-apagadas .of-avp-h > svg { color: var(--of-muted-fg); }
.of-vzp .of-avp-note b { color: var(--of-fg); font-weight: 600; }
/* Celular (hoja inferior): todo lo que se toca mide 44 px; el interruptor, 44 × 26; «Probar», 40 */
.of-hsheet .of-vzp .of-vz-cab, .of-hsheet .of-vzp .of-vz-fila { grid-template-columns: minmax(0, 1fr) 112px; }
.of-hsheet .of-vzp .of-vz-fila { min-height: 44px; }
.of-hsheet .of-vzp .of-vz-ev { min-height: 44px; box-sizing: border-box; padding: 10px 8px; }
.of-hsheet .of-vzp .of-vz-det { height: 44px; }
.of-hsheet .of-vzp .of-sw { width: 44px; height: 26px; border-radius: 13px; }
.of-hsheet .of-vzp .of-sw i { width: 22px; height: 22px; }
.of-hsheet .of-vzp .of-sw[aria-checked="true"] i { transform: translateX(18px); }
.of-hsheet .of-vzp .of-avp-row .of-btn.is-xs { height: 40px; padding: 0 14px; }

/* ---------- 0.6.0 (JST-225 A · Dos listas): «La oficina» y «Cómo se presentan y más» ---------- */
.of-vz-cab.is-of { margin-top: 4px; }
.of-vz-fila.of-vz-tf { min-height: 30px; align-items: center; }
.of-vz-tf .of-vz-ev { box-sizing: border-box; width: 100%; padding: 5px 8px; border: 0; background: transparent; color: var(--of-fg); font: inherit; text-align: left; align-items: center; }
.of-vz-tf .of-vz-ev b { font-size: 13px; font-weight: 500; }
.of-vz-tf .of-vz-ev:focus-visible { outline: 2px solid var(--of-ring); outline-offset: -2px; }
.of-vz-tf .of-vz-mk { margin-top: 0; transition: background .12s, border-color .12s; }
.of-vz-tf .of-vz-mk svg.of-i { width: 12px; height: 12px; }
.of-vz-ej { align-self: center; min-width: 0; padding: 0 8px; font-size: 12px; line-height: 16px; color: var(--of-muted-fg); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.of-vz-tf:not(.is-on) .of-vz-ej { opacity: .7; }
.of-vz-tf.is-oculta { opacity: .5; }
.of-rm .of-vz-tf .of-vz-mk { transition: none; }
.of-vz-mas { display: flex; align-items: center; gap: 6px; height: 28px; margin: -2px 0 -4px; padding: 0 6px; border: 0; border-radius: 7px; background: transparent; color: var(--of-muted-fg);
  font: 500 12.5px/1 Inter, system-ui, sans-serif; cursor: pointer; text-align: left; }
.of-vz-mas:hover { background: var(--of-hover-strong); color: var(--of-fg); }
.of-vz-mas:focus-visible { outline: 2px solid var(--of-ring); outline-offset: 1px; }
.of-vzp.is-apagadas .of-vz-mas { opacity: .6; }
/* Celular: todo de 44 px; «Conversaciones del descanso» pasa a 2 líneas y el ejemplo queda centrado en la fila */
.of-hsheet .of-vzp .of-vz-fila.of-vz-tf { min-height: 44px; }
.of-hsheet .of-vzp .of-vz-tf .of-vz-ev { min-height: 44px; padding: 10px 8px; }
.of-hsheet .of-vzp .of-vz-ej { font-size: 12.5px; }
.of-hsheet .of-vzp .of-vz-mas { height: 44px; font-size: 13.5px; }

/* ---------- 0.13.0 (issue #9): «Preparar voces» en el panel «Voces» ---------- */
.of-pv .of-pv-c { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.of-pv.is-err { background: var(--of-danger-bg); box-shadow: inset 0 0 0 1px var(--of-danger-border); }
.of-pv.is-err > svg { color: var(--of-danger-fg); }
.of-pv-motores { display: flex; flex-direction: column; gap: 2px; margin: 0 -8px; }
.of-pv-motores .of-vz-ev:hover { background: var(--of-hover-strong); }
.of-pv-motores .of-vz-ev em { line-height: 16px; }
.of-pv-motores .of-vz-ev.is-no { cursor: not-allowed; opacity: .55; }
.of-pv-motores .of-vz-ev.is-no:hover { background: transparent; }
.of-pv-acc { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.of-pv-n { font-size: 12px; color: var(--of-muted-fg); }
.of-pv-err { font-size: 12px; color: var(--of-danger-fg); }
.of-pv-fila > .of-avp-l > svg { color: var(--of-s-toca); }
.of-hsheet .of-vzp .of-pv-motores .of-vz-ev { min-height: 44px; }
.of-hsheet .of-vzp .of-pv-acc .of-btn.is-xs { height: 40px; padding: 0 14px; }

/* ---------- 0.7.0 (JST-231 A · Menú en «Conversaciones»): quién escribe las conversaciones ---------- */
.of-iaw { position: relative; display: inline-flex; flex: none; }
/* El botón: con chevron; ✦ cuando escribe la IA, «42 %» y una línea de 2 px mientras baja, ⏸ en pausa, ⚠ si no se pudo */
.of-iabtn { position: relative; overflow: visible; }
.of-iabtn .of-iaa-cv { margin-left: -2px; color: var(--of-muted-fg); }
.of-iabtn .of-iaa-sp { margin-left: -1px; color: var(--of-fg); }
.of-iabtn .of-iaa-sp.is-mut { color: var(--of-muted-fg); }
.of-iaa-pc { font-size: 12px; font-weight: 500; color: var(--of-muted-fg); }
.of-iaa-bl { position: absolute; left: 7px; right: 7px; bottom: 2px; height: 2px; border-radius: 1px; background: var(--of-border-strong); overflow: hidden; }
.of-iaa-bl > i { position: absolute; left: 0; top: 0; bottom: 0; background: var(--of-fg); transition: width .3s linear; }
.of-ia-num { font-variant-numeric: tabular-nums; }
.of-ia-ok { color: var(--of-st-done); }
.of-ia-warn { color: var(--of-st-blocked); }
.of-iabtn .of-iaa-sp.of-ia-warn { color: var(--of-st-blocked); }
/* El menú: 360 px (el armazón de «Voces») */
.of-hpop.is-charlas { width: 360px; max-height: calc(100vh - 140px); }
.of-iaa .of-avp-h > svg { color: var(--of-fg); }
.of-iaa.is-ocultas .of-avp-h > svg { color: var(--of-muted-fg); }
.of-iaa .of-vz-k { margin-bottom: -4px; }
.of-iaa .of-avp-note b { color: var(--of-fg); font-weight: 600; }
/* Las 2 tarjetas con radio; la elegida con borde de 2 px */
.of-iaa-ops { display: flex; flex-direction: column; gap: 6px; }
.of-iaa.is-ocultas .of-iaa-ops { opacity: .6; }
.of-iaa-op { border: 1px solid var(--of-border); border-radius: 10px; background: transparent; }
.of-iaa-op.is-on { border-color: var(--of-border-strong); background: var(--of-hover-strong); box-shadow: inset 0 0 0 1px var(--of-border-strong); }
.of-iaa-r { display: flex; gap: 10px; width: 100%; box-sizing: border-box; padding: 10px 10px 8px; border: 0; border-radius: 10px; background: transparent; color: var(--of-fg); text-align: left; font: inherit; cursor: pointer; }
.of-iaa-r:focus-visible { outline: 2px solid var(--of-ring); outline-offset: -2px; }
.of-iaa-op.is-off .of-iaa-r { cursor: not-allowed; }
.of-iaa-op.is-off .of-iaa-tx { opacity: .55; }
.of-iaa-rd { width: 16px; height: 16px; flex: none; margin-top: 2px; box-sizing: border-box; border-radius: 50%; border: 1.5px solid var(--of-border-strong); display: grid; place-items: center; }
.of-iaa-op.is-on .of-iaa-rd { border-color: var(--of-fg); }
.of-iaa-op.is-on .of-iaa-rd i { width: 8px; height: 8px; border-radius: 50%; background: var(--of-fg); }
.of-iaa-tx { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.of-iaa-tx b { display: inline-flex; align-items: center; gap: 6px; font-weight: 500; font-size: 13px; }
.of-iaa-tx em { font-style: normal; font-size: 12px; line-height: 16px; color: var(--of-muted-fg); }
.of-iaa-ej { margin-top: 3px; font-size: 12px; line-height: 16px; color: var(--of-fg); opacity: .8; font-style: italic; }
/* El estado de la IA, dentro de su tarjeta (con la sangría del radio) */
.of-iaa-st { display: flex; gap: 8px; align-items: flex-start; margin: 0 10px 10px 36px; padding-top: 8px; border-top: 1px solid var(--of-border); font-size: 12px; line-height: 17px; color: var(--of-muted-fg); }
.of-iaa-st > svg { flex: none; margin-top: 1px; }
.of-iaa-st b { color: var(--of-fg); font-weight: 500; }
.of-iaa-st.is-col { flex-direction: column; gap: 6px; }
.of-iaa-st.is-col > span svg { vertical-align: -2px; margin-right: 5px; }
.of-iaa-st .of-btn.is-xs { align-self: flex-start; }
.of-iaa-op.is-off .of-iaa-st { opacity: .9; }
.of-iaa-bt { display: flex; justify-content: space-between; width: 100%; }
/* La barra de avance: 6 px, sin brillo ni animación propia; con movimiento normal crece en 300 ms */
.of-ia-bar { position: relative; display: block; width: 100%; height: 6px; border-radius: 3px; background: var(--of-muted); overflow: hidden; box-shadow: inset 0 0 0 1px var(--of-border); }
.of-ia-bar > i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 3px; background: var(--of-fg); transition: width .3s linear; }
@media (prefers-reduced-motion: reduce) { .of-ia-bar > i, .of-iaa-bl > i { transition: none; } }
.of-rm .of-iaa-bl > i { transition: none; }
/* Celular (hoja inferior): todo de 44 px */
.of-iasheet .of-iaa { font-size: 14px; line-height: 20px; }
.of-iasheet .of-avp-h { min-height: 44px; }
.of-iasheet .of-iaa-r { min-height: 44px; padding: 12px; }
.of-iasheet .of-iaa-tx b { font-size: 14px; }
.of-iasheet .of-iaa-tx em, .of-iasheet .of-iaa-ej, .of-iasheet .of-iaa-st { font-size: 13px; line-height: 18px; }
.of-iasheet .of-sw { width: 44px; height: 26px; border-radius: 13px; }
.of-iasheet .of-sw i { width: 22px; height: 22px; }
.of-iasheet .of-sw[aria-checked="true"] i { transform: translateX(18px); }
`;
