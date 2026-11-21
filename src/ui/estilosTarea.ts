// Estilos del modal de tarea (JST-411), portados de `.gb-task…` de Board global.
// Mismos tokens `--of-*` de `estilos.ts`; los colores de estado son `--of-st-*`.
export const CSS_TAREA = /* css */ `
.of-tk-bg { position: fixed; inset: 0; z-index: 1090; display: flex; justify-content: center; align-items: flex-start; padding: 5vh 16px; background: var(--of-backdrop); animation: of-fade .15s; }
.of-tk { display: flex; flex-direction: column; width: min(1000px, 100%); max-height: 90vh; background: var(--of-popover); color: var(--of-fg); border-radius: 14px; box-shadow: var(--of-shadow-pop);
  font-size: 14px; line-height: 20px; overflow: hidden; outline: none; animation: of-tkin .16s cubic-bezier(.16,1,.3,1); }
@keyframes of-tkin { from { opacity: 0; transform: translateY(8px); } }
.of-tk-h { display: flex; align-items: center; gap: 8px; padding: 10px 12px 10px 16px; border-bottom: 1px solid var(--of-border); flex: none; }
.of-tk-h .of-ibtn { color: var(--of-muted-fg); }
.of-tk-cod { font: 500 12px/18px ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--of-muted-fg); }
.of-tk-b { display: grid; grid-template-columns: minmax(0, 1fr) 260px; min-height: 0; overflow: auto; }
.of-tk-main { padding: 18px 20px 24px; min-width: 0; }
.of-tk-titulo { margin: 0 0 12px; font-size: 19px; line-height: 26px; font-weight: 600; letter-spacing: -.01em; overflow-wrap: anywhere; text-wrap: pretty; }
.of-tk-sec { margin-top: 20px; }
.of-tk-sec > h4 { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; font-size: 13px; font-weight: 600; }
.of-tk-sec p { margin: 0; font-size: 13px; }
.of-tk-n { font-weight: 400; font-size: 12px; color: var(--of-muted-fg); }
.of-tk-quieto { color: var(--of-muted-fg); font-size: 12px; }
.of-tk-sinc { margin-top: 12px !important; }
.of-tk-md { font-size: 13.5px; line-height: 21px; overflow-wrap: anywhere; }
.of-tk-md a { text-decoration: underline; text-underline-offset: 2px; }
.of-tk-plano { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13.5px; line-height: 21px; }
.of-tk-desc.is-cortada { overflow: hidden; -webkit-mask-image: linear-gradient(#000 72%, transparent); mask-image: linear-gradient(#000 72%, transparent); }
.of-tk-mas { border: 0; background: none; padding: 0; margin-top: 4px; font-size: 12.5px; font-weight: 500; color: var(--of-fg); text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
.of-tk-esq { display: grid; gap: 8px; padding: 2px 0; }
.of-tk-esq .of-sk, .of-tk-sk { display: block; border-radius: 4px; }
.of-tk-err { color: var(--of-danger-fg); font-size: 12.5px; }
.of-tk-enlace { display: inline-flex; align-items: center; gap: 2px; font-size: 12.5px; font-weight: 500; text-decoration: underline; text-underline-offset: 2px; color: var(--of-fg); }

/* Caja para comentar */
.of-tk-caja { border: 1px solid var(--of-input); border-radius: 8px; background: var(--of-card); }
.of-tk-caja:focus-within { border-color: var(--of-ring); }
.of-tk-caja textarea { display: block; width: 100%; border: 0; outline: 0; resize: vertical; min-height: 44px; max-height: 240px; padding: 10px 12px 4px; background: transparent; color: var(--of-fg); font: inherit; font-size: 13.5px; line-height: 20px; }
.of-tk-pie { display: flex; align-items: center; gap: 8px; padding: 6px 8px 8px 12px; font-size: 11.5px; }

/* Comentarios */
.of-tk-coms { display: grid; gap: 16px; margin-top: 16px; }
.of-tk-com { display: flex; gap: 10px; align-items: flex-start; min-width: 0; }
.of-tk-ini { flex: none; width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; background: var(--of-muted); color: var(--of-fg); font-size: 11px; font-weight: 600; }
.of-tk-com.is-yo .of-tk-ini { background: var(--of-primary); color: var(--of-primary-fg); }
.of-tk-cb { flex: 1; min-width: 0; }
.of-tk-ch { display: flex; align-items: center; gap: 6px; height: 24px; font-size: 12.5px; }
.of-tk-ch b { font-weight: 600; }
.of-tk-ch svg { color: var(--of-muted-fg); }
.of-tk-ch span { color: var(--of-muted-fg); }

/* Columna lateral */
.of-tk-lado { padding: 18px 16px 24px; border-left: 1px solid var(--of-border); background: color-mix(in srgb, var(--of-muted) 45%, transparent); display: flex; flex-direction: column; gap: 12px; align-content: start; }
.of-tk-campo { display: grid; grid-template-columns: 82px minmax(0, 1fr); align-items: center; gap: 8px; min-height: 28px; font-size: 12.5px; }
.of-tk-campo > span { color: var(--of-muted-fg); }
.of-tk-campo > b { display: flex; align-items: center; gap: 6px; min-width: 0; font-weight: 400; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.of-tk-campo > b svg { flex: none; color: var(--of-muted-fg); }
.of-tk-estado { position: relative; justify-self: start; max-width: 100%; }
.of-tk-estbtn { background: var(--of-card); max-width: 100%; }
.of-tk-estbtn.is-on { background: var(--of-hover-strong); }
.of-tk-punto { display: inline-flex; flex: none; color: var(--stc, var(--of-muted-fg)); }
.of-tk-menu { position: absolute; z-index: 5; top: calc(100% + 4px); left: 0; width: 184px; padding: 4px; background: var(--of-popover); border: 1px solid var(--of-border); border-radius: 10px; box-shadow: var(--of-shadow-pop); animation: of-fin .14s cubic-bezier(.16,1,.3,1); }
.of-tk-mi { display: flex; align-items: center; gap: 8px; width: 100%; height: 30px; padding: 0 8px; border: 0; border-radius: 6px; background: transparent; color: var(--of-fg); font-size: 13px; text-align: left; }
.of-tk-mi > span:not(.of-tk-punto) { flex: 1; min-width: 0; }
.of-tk-mi:hover, .of-tk-mi:focus-visible { background: var(--of-hover-strong); }
.of-tk-fechas { display: grid; gap: 2px; margin-top: 4px; padding-top: 12px; border-top: 1px solid var(--of-border); font-size: 11.5px; color: var(--of-muted-fg); }

/* La tarea no se pudo leer */
.of-tk-fallo { display: flex; gap: 8px; align-items: flex-start; padding: 9px 12px; border-radius: 8px; font-size: 13px; line-height: 19px; border: 1px solid var(--of-danger-border); background: var(--of-danger-bg); }
.of-tk-fallo > svg { margin-top: 2px; flex: none; color: var(--of-s-error); }
.of-tk-fallo b { font-weight: 600; }
.of-tk-acciones { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }

/* Celular: pantalla entera, en una columna */
.of-tk.is-m, .of-tk-bg:has(> .of-tk.is-m) { padding: 0; }
.of-tk.is-m { width: 100%; height: 100%; max-height: none; border-radius: 0; animation: of-rwup .2s cubic-bezier(.16,1,.3,1); }
.of-tk.is-m .of-tk-b { display: block; flex: 1; }
.of-tk.is-m .of-tk-main { padding: 14px 14px 18px; }
.of-tk.is-m .of-tk-lado { border-left: 0; border-top: 1px solid var(--of-border); padding: 14px 14px calc(24px + env(safe-area-inset-bottom)); }
.of-tk.is-m .of-tk-full { display: none; }
.of-tk.is-m .of-tk-titulo { font-size: 18px; line-height: 24px; }
.of-tk.is-m .of-tk-caja textarea { font-size: 16px; }
@media (prefers-reduced-motion: reduce) { .of-tk-bg, .of-tk, .of-tk-menu { animation: none; } .of-tk .of-sk { animation: none; } }
`;
