// Estilos de «Leer contexto» en la barra de arriba (JST-276, design-spec de
// JST-282 rev 2 §3 a §5): los del prototipo `propuesta-a.html` (`.lc-a*`) con el
// prefijo `of-ctx` (`.of-lc` ya es de los personajes del descanso) y los tokens
// `--of-*` de `estilos.ts`. El botón va en la barra de Paperclip dentro de un
// `.of-layer` (para tener los tokens); el panel «sin voz» y el aviso del
// celular, en una capa sobre la página.
export const CSS_CONTEXTO = /* css */ `
.of-ctxw { position: relative; display: inline-flex; align-items: center; flex: none; }
.of-ctx { height: 30px; min-width: 132px; display: inline-flex; align-items: center; gap: 7px; padding: 0 10px 0 9px; border: 1px solid var(--of-input); border-radius: 8px;
  background: transparent; color: var(--of-fg); font-family: inherit; font-size: 13px; font-weight: 500; line-height: 1; white-space: nowrap; cursor: pointer; }
.of-ctx > svg.of-i { width: 15px; height: 15px; flex: none; }
.of-ctx:hover { background: var(--of-hover-strong); }
.of-ctx.is-cargando { cursor: progress; }
.of-ctx.is-cargando > svg.of-i { color: var(--of-muted-fg); }
.of-ctx.is-leyendo { background: var(--of-muted); border-color: var(--of-border-strong); }
.of-ctx-n { margin-left: auto; padding-left: 6px; font-size: 12px; color: var(--of-muted-fg); font-variant-numeric: tabular-nums; }
.of-ctx.is-fin > svg.of-i { color: var(--of-st-done); }
.of-ctx.is-error > svg.of-i { color: var(--of-s-error); }
.of-ctx.is-error .of-ctx-t { color: var(--of-danger-fg); }
/* Celular: solo el ícono, 44 × 44 (como el «Resumen» de la barra en la Oficina, .of-rstop) */
.of-ctx.is-m { min-width: 0; width: 44px; height: 44px; padding: 0; justify-content: center; border: 0; margin-right: -4px; }
.of-ctx.is-m > svg.of-i { width: 19px; height: 19px; }
.of-ctx.is-m:hover { background: transparent; }
.of-ctx.is-m.is-leyendo, .of-ctx.is-m.is-cargando { background: var(--of-muted); }
/* Celular, último de la barra (JST-290, design-spec de JST-294 rev 2 §2): la zona de 44 × 44 empieza donde termina el
   botón de al lado (se come los 4 px entre botones) y llega al borde de la pantalla (se come los 16 px de margen de la
   barra): en la fila ocupa 28 px en vez de 44. El ícono va a 14,5 px del borde. El fondo de «Cargando» y «Leyendo» y el
   foco van en una ficha de 32 × 32, a 4 px del botón de al lado y a 8 px del borde. */
.of-ctx.is-m.is-borde { margin: 0 -16px 0 -4px; padding: 0 8px 0 4px; position: relative; isolation: isolate; }
.of-ctx.is-m.is-borde::before { content: ""; position: absolute; inset: 6px 8px 6px 4px; z-index: -1; border-radius: 8px; pointer-events: none; }
.of-ctx.is-m.is-borde.is-leyendo, .of-ctx.is-m.is-borde.is-cargando { background: transparent; }
.of-ctx.is-m.is-borde.is-leyendo::before, .of-ctx.is-m.is-borde.is-cargando::before { background: var(--of-muted); }
.of-ctx.is-m.is-borde:focus-visible { outline: none; }
.of-ctx.is-m.is-borde:focus-visible::before { outline: 2px solid var(--of-ring); outline-offset: 2px; }

/* El informe escrito (JST-414): siempre que se lee, con sus partes y la frase que va marcada. Flota bajo el botón
   (computador) o bajo la barra (celular); en la ventana de responder y en el modal va dentro (is-in); desde la
   franja «Te necesitan» flota bajo ella. Alto máximo con scroll propio: la cabecera queda a la vista. */
.of-ctx-esc { position: fixed; z-index: 1150; width: 400px; max-width: calc(100vw - 16px); max-height: min(540px, calc(100vh - 120px)); display: flex; flex-direction: column; overflow: hidden; background: var(--of-popover);
  border: 1px solid var(--of-border-strong); border-radius: 12px; box-shadow: var(--of-shadow-pop); font-size: 13.5px; line-height: 20px; color: var(--of-fg); text-align: left; }
.of-ctx-ph { flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; padding: 6px 6px 6px 12px; border-bottom: 1px solid var(--of-border); }
.of-ctx-pt { font-size: 13px; font-weight: 600; }
.of-ctx-dur { font-size: 12px; color: var(--of-muted-fg); font-variant-numeric: tabular-nums; }
.of-ctx-bts { flex: none; display: flex; align-items: center; gap: 2px; margin-left: auto; }
.of-ctx-niv { display: inline-flex; gap: 2px; padding: 2px; border-radius: 8px; background: var(--of-muted); }
.of-ctx-niv button { height: 24px; padding: 0 9px; border: 0; border-radius: 6px; background: transparent; color: var(--of-muted-fg); font: inherit; font-size: 12px; font-weight: 500; line-height: 1; cursor: pointer; }
.of-ctx-niv button:hover:not(:disabled) { color: var(--of-fg); }
.of-ctx-niv button[aria-pressed="true"] { background: var(--of-bg); color: var(--of-fg); box-shadow: 0 0 0 1px var(--of-border); }
.of-ctx-niv button:focus-visible, .of-ctx-fr:focus-visible { outline: 2px solid var(--of-ring); outline-offset: -2px; }
.of-ctx-niv button:disabled, .of-ctx-ib:disabled, .of-ctx-fr:disabled { cursor: progress; opacity: .6; }
.of-ctx-ib { width: 28px; height: 28px; flex: none; }
.of-ctx-sv { flex: none; display: flex; align-items: flex-start; gap: 8px; padding: 6px 12px; font-size: 12.5px; line-height: 17px; color: var(--of-muted-fg); border-bottom: 1px solid var(--of-border); }
.of-ctx-sv > svg { margin-top: 1px; flex: none; }
.of-ctx-sv b { color: var(--of-fg); font-weight: 500; }
.of-ctx-pc { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 2px 6px 8px; }
.of-ctx-sh { margin: 8px 0 1px; padding: 0 10px; font-size: 11.5px; font-weight: 600; line-height: 16px; color: var(--of-muted-fg); }
.of-ctx-fr { display: block; width: 100%; box-sizing: border-box; margin: 0; padding: 5px 8px 5px 10px; border: 0; border-radius: 8px; position: relative; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.of-ctx-fr:hover:not(:disabled) { background: var(--of-hover-strong); }
.of-ctx-fr.is-fut { color: var(--of-muted-fg); }
.of-ctx-fr.is-cur { background: var(--of-hover-strong); }
.of-ctx-fr.is-cur::before { content: ""; position: absolute; left: 0; top: 6px; bottom: 6px; width: 3px; border-radius: 2px; background: var(--of-fg); }
.of-ctx-esc.is-m { width: auto; max-width: none; max-height: 52vh; font-size: 14px; }
.of-ctx-esc.is-m .of-ctx-ph { padding: 4px 4px 4px 12px; }
.of-ctx-esc.is-m .of-ctx-ib { width: 40px; height: 40px; }
.of-ctx-esc.is-m .of-ctx-niv button { height: 32px; padding: 0 12px; font-size: 13px; }

/* Celular: «No se pudo», 8 px bajo la barra, 4 s */
.of-ctx-toast { position: fixed; z-index: 1150; display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 10px; background: var(--of-popover); border: 1px solid var(--of-danger-border);
  box-shadow: var(--of-shadow-pop); font-size: 13.5px; line-height: 19px; color: var(--of-fg); }
.of-ctx-toast > svg { color: var(--of-s-error); flex: none; }

/* ---------- En la ventana de responder (JST-321, design-spec de JST-320 rev 2, A · En la fila de la tarea) ---------- */
/* Al final de la fila de la tarea, a la derecha */
.of-rmeta .of-ctx-fila { margin-left: auto; }
/* Celular: zona 44 × 44, ficha visible 32 × 32 (la fila sigue en 22 px) */
.of-rw .of-rmeta .of-ctx.is-m.of-ctx-fila { margin: -11px -6px -11px auto; position: relative; isolation: isolate; border: 0; background: transparent; }
.of-rw .of-ctx.is-m.of-ctx-fila::before { content: ""; position: absolute; inset: 6px; z-index: -1; border: 1px solid var(--of-input); border-radius: 8px; }
.of-rw .of-ctx.is-m.of-ctx-fila.is-leyendo, .of-rw .of-ctx.is-m.of-ctx-fila.is-cargando { background: transparent; }
.of-rw .of-ctx.is-m.of-ctx-fila.is-leyendo::before, .of-rw .of-ctx.is-m.of-ctx-fila.is-cargando::before { background: var(--of-muted); border-color: var(--of-border-strong); }
.of-rw .of-ctx.is-m.of-ctx-fila.is-error > svg { color: var(--of-s-error); }
.of-rw .of-ctx.is-m.of-ctx-fila:focus-visible { outline: none; }
.of-rw .of-ctx.is-m.of-ctx-fila:focus-visible::before { outline: 2px solid var(--of-ring); outline-offset: 2px; }
/* «Detener» con ■ (la ✕ de la ventana la cierra) */
.of-ctx > svg.of-ctx-stop { width: 15px; height: 15px; }
.of-rw .of-ctx.is-m > svg.of-ctx-stop { width: 19px; height: 19px; }
/* Dentro de la ventana de responder o del modal, bajo la fila de la tarea. «flex: none» porque .of-rw-b es una columna que baja y, sin eso, lo aplasta a una línea en el celular. */
.of-ctx-esc.is-in { flex: none; position: static; z-index: auto; width: auto; max-width: none; max-height: 260px; box-shadow: none; border-color: var(--of-border); background: var(--of-muted); }
.of-ctx-esc.is-in.is-m { max-height: 42vh; }
.of-ctx-esc.is-in .of-ctx-fr.is-cur { background: var(--of-popover); }
.of-ctx-esc.is-in .of-ctx-niv { background: var(--of-border); }
/* «Leer contexto» en cada tarjeta de «Te necesitan» y en el modal de tarea: solo el ícono */
.of-ctx.of-ctx-chico { min-width: 0; width: 24px; height: 24px; padding: 0; justify-content: center; border-color: transparent; border-radius: 7px; flex: none; }
.of-ctx.of-ctx-chico.is-g { width: 36px; height: 36px; }
.of-ctx.of-ctx-chico:focus-visible { outline: 2px solid var(--of-ring); outline-offset: -2px; }
.of-ctx.of-ctx-chico.is-leyendo { border-color: var(--of-border-strong); }
/* La pestaña que se lee */
.of-rw-step .of-ctx-pil { color: var(--of-s-toca); margin-left: -2px; animation: of-ctx-late 1.2s ease-in-out infinite; }
@keyframes of-ctx-late { 50% { opacity: .45; } }
@media (prefers-reduced-motion: reduce) { .of-rw-step .of-ctx-pil { animation: none; } }
.of-rw.is-quieto .of-ctx-pil { animation: none; }
`;
