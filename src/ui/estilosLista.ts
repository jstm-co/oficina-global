// Estilos de la lista de agentes (§3) y el error completo de la ficha (§4), design-spec de JST-95. Mismos tokens `--of-*` de `estilos.ts`.
export const CSS_LISTA = /* css */ `
/* ---------- 7 · Lista de agentes ---------- */
.of-al { width: 100%; max-width: 1280px; align-self: center; display: flex; flex-direction: column; margin-top: 14px; border-top: 1px solid var(--of-border); padding-top: 16px; }
.of-al-h { display: flex; align-items: baseline; gap: 10px; padding: 0 4px 10px; min-width: 0; flex-wrap: wrap; }
.of-al-h h2 { margin: 0; font-size: 16px; line-height: 24px; font-weight: 600; }
.of-al-sub { font-size: 13px; color: var(--of-muted-fg); display: inline-flex; align-items: center; gap: 6px; }
.of-al-sub svg { align-self: center; }
.of-al-f { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--of-muted-fg); }
.of-al-f svg { align-self: center; }
.of-al-link { border: 0; padding: 0 2px; margin-left: 2px; font-size: 12.5px; color: var(--of-fg); text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--of-border-strong); }
.of-al-link:hover { text-decoration-color: var(--of-fg); }
.of-al-cols, .of-alr { display: grid; grid-template-columns: 48px minmax(190px, 1.15fr) 128px 196px minmax(260px, 2fr) 132px; gap: 0 14px; align-items: center; }
.of-al-cols { padding: 0 12px 6px; font-size: 11px; line-height: 16px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--of-muted-fg); border-bottom: 1px solid var(--of-border); }
.of-als { display: flex; flex-direction: column; }
.of-al-sh { display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 8px; margin-top: 8px; border: 0; background: transparent; font-size: 13px; font-weight: 600; color: var(--of-fg); border-radius: 8px; text-align: left; white-space: nowrap; }
.of-al-sh:hover { background: var(--of-hover-strong); }
.of-al-sh > svg { color: var(--of-muted-fg); }
.of-al-sh b { font-weight: 600; color: var(--of-muted-fg); font-variant-numeric: tabular-nums; }
.of-al-sh em { font-style: normal; font-weight: 400; font-size: 12px; color: var(--of-muted-fg); overflow: hidden; text-overflow: ellipsis; }
.of-al-si { display: inline-flex; color: var(--sc); }
.of-alr { min-height: 60px; padding: 6px 12px; border-radius: 10px; border: 1px solid transparent; cursor: pointer; transition: background .1s, opacity .15s; color: var(--of-fg); }
.of-alr + .of-alr { box-shadow: 0 -1px 0 var(--of-border); }
.of-alr:hover { background: var(--of-hover-strong); box-shadow: none; }
.of-alr:hover + .of-alr { box-shadow: none; }
.of-alr:focus-visible { outline: 2px solid var(--of-ring); outline-offset: -2px; }
.of-alr.is-sel { background: var(--of-muted); border-color: var(--of-border-strong); }
.of-alr.is-dim { opacity: .35; }
.of-als.is-toca .of-alr { background: color-mix(in srgb, var(--of-s-toca) 5%, transparent); }
.of-als.is-toca .of-alr:hover { background: color-mix(in srgb, var(--of-s-toca) 10%, transparent); }
.of-als.is-toca .of-alr.is-sel { background: var(--of-muted); }
.of-al-who { display: flex; flex-direction: column; min-width: 0; line-height: 18px; }
.of-al-who b { font-weight: 600; font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.of-al-who span { font-size: 12px; color: var(--of-muted-fg); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.of-al-co { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--of-muted-fg); white-space: nowrap; min-width: 0; overflow: hidden; }
.of-al-co > span:last-child { overflow: hidden; text-overflow: ellipsis; }
.of-al-sts { display: flex; flex-wrap: wrap; gap: 4px; }
.of-al-task { display: flex; flex-direction: column; min-width: 0; line-height: 18px; }
.of-al-t { display: flex; gap: 6px; min-width: 0; font-size: 13px; }
.of-al-t .of-tid { font: 500 12px/18px ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--of-muted-fg); white-space: nowrap; }
.of-al-t .of-tt { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.of-al-ctx { font-size: 12px; color: var(--of-muted-fg); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.of-al-ctx.is-toca { color: var(--of-s-toca-fg); }
.of-al-ctx.is-error { color: var(--of-s-error-fg); }
.of-al-act { display: flex; justify-content: flex-end; min-width: 0; }
.of-al-when { font-size: 12px; color: var(--of-muted-fg); white-space: nowrap; display: inline-flex; align-items: center; gap: 4px; }
.of-al-when.is-error { color: var(--of-s-error-fg); }
/* JST-410: «Errores antiguos» atenuado (sin el rojo de alarma) y la marca «Sin uso hace N días» */
.of-c-viejos { --sc: var(--of-muted-fg); --sfg: var(--of-muted-fg); }
.of-als.is-viejos .of-al-si { opacity: .7; }
.of-alr.is-viejos, .of-alr.is-viejo { color: var(--of-muted-fg); }
.of-alr.is-viejo .of-al-who b { color: var(--of-muted-fg); }
.of-alr.is-viejo .of-nchip { color: var(--of-muted-fg); background: transparent; border-color: var(--of-border); }
.of-alr.is-viejo .of-nchip svg { color: var(--of-muted-fg); }
.of-al-sinuso { font-size: 12px; line-height: 16px; color: var(--of-muted-fg); opacity: .8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.of-fsilencio { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; font-size: 12.5px; line-height: 18px; color: var(--of-muted-fg); }
.of-fsilencio > span { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.of-al-note { display: flex; align-items: center; gap: 8px; padding: 8px 12px; font-size: 13px; color: var(--of-danger-fg); }
.of-al-note svg { color: var(--of-s-error); }
.of-al-off { display: flex; align-items: center; gap: 10px; padding: 10px 12px; margin-top: 8px; border-radius: 10px; border: 1px dashed var(--of-border-strong); font-size: 13px; line-height: 18px; color: var(--of-muted-fg); }
.of-al-off > svg { flex: none; }
.of-al-off b { color: var(--of-fg); font-weight: 600; }
.of-al-off span { flex: 1; min-width: 0; }
/* Esqueleto mientras carga: la caja del personaje y 3 barras */
.of-al-skr { cursor: default; }
.of-al-skr:hover { background: transparent; }
.of-al-skr .of-sk-av { width: 44px; height: 52px; border-radius: 8px; }
.of-al-skr .of-sk-l1, .of-al-skr .of-sk-l2, .of-al-skr .of-sk-l3 { height: 14px; border-radius: 4px; }
.of-al-skr .of-sk-l1 { width: 70%; } .of-al-skr .of-sk-l2 { width: 60%; } .of-al-skr .of-sk-l3 { width: 80%; grid-column: span 3; }
.of-al-skr.is-m .of-sk-l2, .of-al-skr.is-m .of-sk-l3 { display: none; }
.of-al-skr.is-m .of-sk-l1 { width: 80%; }
/* Celular: nombre + prefijo arriba, estado y tarea (o la pregunta) abajo, pastilla a la derecha */
.of.is-m .of-al { margin-top: 8px; padding-top: 12px; }
.of-alr.is-m { grid-template-columns: 44px 1fr auto; min-height: 64px; padding: 6px 8px; gap: 0 12px; }
.of-al-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.of-al-n { display: flex; align-items: center; gap: 6px; min-width: 0; }
.of-al-n b { font-weight: 600; font-size: 15px; line-height: 20px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.of-al-st { display: flex; align-items: center; gap: 5px; min-width: 0; font-size: 13px; line-height: 18px; color: var(--of-muted-fg); }
.of-al-st > svg { color: var(--sc); flex: none; }
.of-al-st .of-tid { font: 500 12px/18px ui-monospace, SFMono-Regular, Menlo, monospace; white-space: nowrap; }
.of-al-st .of-al-ctx { font-size: 13px; }
.of-al-st.is-toca .of-al-ctx { color: var(--of-s-toca-fg); }
.of-al-go { color: var(--of-muted-fg); display: inline-flex; align-items: center; gap: 2px; }
.of-al-go.is-toca { height: 30px; padding: 0 10px; border-radius: 15px; background: var(--of-s-toca); color: #fff; font-size: 13px; font-weight: 600; }
.of.is-m .of-al-sh { height: 44px; margin-top: 4px; font-size: 14px; }

/* ---------- 9 · Error completo en la ficha ---------- */
.of-exm { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; line-height: 20px; }
.of-exm > div { display: flex; align-items: center; gap: 6px; min-width: 0; flex-wrap: wrap; }
.of-exk { width: 54px; flex: none; color: var(--of-muted-fg); font-size: 12px; }
.of-excode, .of-exsub { font: 500 12px/20px ui-monospace, SFMono-Regular, Menlo, monospace; padding: 0 6px; border-radius: 5px; background: var(--of-code-bg); border: 1px solid var(--of-border); }
.of-excode { color: var(--of-s-error-fg); border-color: color-mix(in srgb, var(--of-s-error) 35%, var(--of-border)); background: color-mix(in srgb, var(--of-s-error) 8%, var(--of-code-bg)); }
.of-exsub { color: var(--of-muted-fg); }
.of-exrun { display: inline-flex; align-items: center; gap: 3px; color: var(--of-fg); border-bottom: 1px dashed var(--of-border-strong); line-height: 18px; }
.of-exrun:hover { border-bottom-color: var(--of-fg); }
.of-exrun .of-mono { font-size: 12px; }
.of-logbox { border: 1px solid var(--of-border); border-radius: 8px; overflow: hidden; background: var(--of-log-bg); }
.of-logh { display: flex; align-items: center; gap: 6px; height: 32px; padding: 0 4px 0 10px; border-bottom: 1px solid var(--of-border); font-size: 11px; font-weight: 600; color: var(--of-muted-fg); letter-spacing: .03em; text-transform: uppercase; background: var(--of-card); }
.of-logh .of-btn { text-transform: none; letter-spacing: 0; color: var(--of-fg); }
.of-log { max-height: 236px; overflow: auto; padding: 6px 0; font: 11.5px/17px ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--of-log-fg); }
.of-log:focus-visible { outline: 2px solid var(--of-ring); outline-offset: -2px; }
.of-ll { display: grid; grid-template-columns: 58px 1fr; gap: 8px; padding: 0 10px; }
.of-ll i { font-style: normal; color: var(--of-log-dim); user-select: none; -webkit-user-select: none; }
.of-ll span { white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere; }
.of-ll.is-err { background: color-mix(in srgb, var(--of-s-error) 7%, transparent); }
.of-ll.is-err span { color: var(--of-s-error-fg); }
.of-sklog { display: flex; flex-direction: column; gap: 7px; padding: 10px; }
.of-sklog .of-sk { height: 10px; border-radius: 3px; }
.of-lognote { display: flex; align-items: center; gap: 8px; padding: 10px; font-size: 12.5px; color: var(--of-muted-fg); }
.of-lognote > svg { color: var(--of-s-error); flex: none; }
.of-lognote.is-vacio > svg { color: var(--of-muted-fg); }
/* En la hoja (celular y TV) el log va entero, un poco más chico para que quepan más caracteres por línea */
.of-sheet .of-log { max-height: none; font-size: 11px; line-height: 16px; }
.of-sheet .of-ll { grid-template-columns: 56px 1fr; gap: 6px; padding: 0 8px; }
/* Las filas de «Espera tu respuesta» abren la ventana (botones en vez de enlaces) */
button.of-qrow { width: 100%; text-align: left; font-size: inherit; }
.of-fbt.is-3 .of-btn { padding: 0 8px; }
`;
