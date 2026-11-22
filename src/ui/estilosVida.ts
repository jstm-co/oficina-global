// Estilos de la 0.3.0 «Vida en la oficina» (design-spec de JST-96 §2, §5 a
// §8): el sobre y su etiqueta, las marcas a 1x de quien camina, la capa de
// mascotas del pasillo y el botón «Mascotas». La 0.4.0 (design-spec de
// JST-162, B · Pregunta y respuesta) cambia el globo de conversación por un
// hilo de 2 globos, suma la frase suelta, el globo de las mascotas y el botón
// «Conversaciones». La 0.5.0 (design-spec de JST-163, A · En cada sala) suma
// el globo de dos pisos, «✓ listo», tu escritorio con su globo, la entrega en
// la mesa y el sobre en la mano. Todo en pixeles de arte por `--px`, como el
// resto del piso.
import { HOJAS } from "./sprites.js";

export const CSS_VIDA = /* css */ `
.of, .of-layer {
  --of-chat-bg: #f6f3ec; --of-chat-fg: #3d3842; --of-chat-code: #2a2230; --of-chat-prev: #dcd6cc; --of-piensa-bg: rgba(246, 243, 236, .92);
  --of-chat-line: color-mix(in srgb, var(--of-room-line) 70%, transparent);
  --of-sobre-bg: #fffdf7;
  --of-img-ma: url("${HOJAS.mascotas}");
}
.dark .of, .dark .of-layer, .of.dark { --of-chat-bg: #ece8df; --of-chat-prev: #d3cdc2; --of-piensa-bg: rgba(236, 232, 223, .92); }

/* Animaciones que se muestran una vez y quedan en el último cuadro (el sobre que llega y que se abre) */
.of-tira.of-una { animation: of-tira1 calc(var(--n) * var(--ms) * 1ms) steps(var(--n), jump-none) 1 forwards; animation-delay: 0ms; }
@keyframes of-tira1 { from { transform: translateX(0); } to { transform: translateX(calc(-100% + var(--w) * var(--px) * 1px)); } }

/* Quien camina sigue siendo un botón (abre su ficha) */
.of-lc.is-walk { cursor: pointer; }

/* Lo que se mueve en cada cuadro (quien camina, su globo y sus marcas, el sobre en vuelo, la mascota que pasea)
   va con transform en su propia capa, así moverlo no vuelve a pintar el piso (§14). Lo quieto usa left/top. */
.of .of-mov { left: 0; top: 0; transform: translate(calc(var(--x) * var(--px) * 1px), calc(var(--y) * var(--px) * 1px)); will-change: transform; }
.of-movb { position: absolute; width: 0; height: 0; }
.of-movb > .of-bub { left: 0; top: 0; }

/* Marcas a 1x de quien camina: la mano de «te necesita» y el punto azul de quien trabaja (§4) */
.of-vfx { position: absolute; z-index: 880; pointer-events: none; left: calc(var(--x) * var(--px) * 1px); top: calc(var(--y) * var(--px) * 1px); width: calc(16px * var(--px)); height: calc(16px * var(--px)); }
.of-vfx > .of-spr { left: 0; top: 0; }
.of-vfx.of-vchat { z-index: 890; }
.of-dot.of-vdot { z-index: 880; }

/* Sobre (§5): 16 × 16 centrado en su punto, sobre los globos (vuela menos de 1,8 s y por los pasillos) */
.of-sobre { position: absolute; z-index: 905; width: 0; height: 0; pointer-events: none; left: calc(var(--x) * var(--px) * 1px); top: calc(var(--y) * var(--px) * 1px); }
.of-sobre-tag { position: absolute; left: 0; top: calc(-5px * var(--px)); transform: translate(-50%, -100%);
  display: inline-flex; align-items: center; height: calc(5px * var(--px) + 5px); padding: 0 calc(1.5px * var(--px));
  font: 600 calc(3px * var(--px) + 4px)/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; white-space: nowrap;
  background: var(--of-sobre-bg); color: #2a2230; border: 1px solid var(--of-room-line); border-radius: 3px; box-shadow: 0 1px 0 var(--of-room-line); }
/* En el muro va debajo del sobre, para no tapar la placa ni las ventanas */
.of-sobre-tag.is-abajo { top: calc(6px * var(--px)); transform: translate(-50%, 0); }

/* Conversaciones (JST-162 §5): un hilo de hasta 2 globos sobre la pareja, más suave que los de estado y siempre
   debajo de ellos. Mide entre 44 px de arte y el ancho del descanso − 4 px, y se corre entero para no salir de él. */
.of-hilo { position: absolute; z-index: 890; pointer-events: none; display: flex; flex-direction: column; gap: calc(2px * var(--px));
  left: calc(var(--x) * var(--px) * 1px + var(--dx, 0px)); top: calc(var(--y) * var(--px) * 1px - 6px); transform: translate(-50%, -100%);
  width: max-content; min-width: calc(44px * var(--px)); max-width: calc(var(--lw) * var(--px) * 1px - 4px); transition: opacity .15s; }
.of-hilo.is-suelta { min-width: 0; }
.of-hilo.is-oculto { opacity: 0; }
.of-chat { position: relative; box-sizing: border-box; display: flex; flex-direction: column; align-items: flex-start; gap: calc(1px * var(--px));
  width: max-content; max-width: 100%; padding: calc(1.5px * var(--px)) calc(3px * var(--px));
  font-size: calc(4px * var(--px) + 2px); font-weight: 500; line-height: 1.22; letter-spacing: 0; white-space: normal; text-align: left;
  color: var(--of-chat-fg); background: var(--of-chat-bg); border: 1px solid var(--of-chat-line); border-radius: calc(3px * var(--px));
  box-shadow: 0 1px 0 color-mix(in srgb, var(--of-room-line) 50%, transparent); }
/* La frase, hasta 2 líneas; la tarea, en una línea aparte: «JST-91: Re-QA de «Oficina global» 0.1.5…» */
.of-ch-f { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; }
.of-ch-tk { display: block; font-size: .9em; color: #5b5363; }
.of-ch-tk b { font: 600 1em/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; color: var(--of-chat-code); }
/* Como en un chat: cada globo hacia el lado de quien lo dice, con 8 px de sangría hacia el otro (si el descanso es
   angosto, el globo puede llenar el hilo: la sangría solo se ve cuando sobra lugar, como en el prototipo) */
.of-chat.a-izq { align-self: flex-start; margin-right: calc(8px * var(--px)); }
.of-chat.a-der { align-self: flex-end; margin-left: calc(8px * var(--px)); }
/* La cola de cada globo apunta a los pies de quien lo dijo (--tx, aunque el hilo se corra) */
.of-chat::before, .of-chat::after { content: ""; position: absolute; }
.of-chat::before { bottom: -7px; left: calc(var(--tx, 50%) - 1px); width: 10px; height: 7px; background: var(--of-chat-line); clip-path: polygon(0 0, 100% 0, 50% 100%); }
.of-chat::after { bottom: -5px; left: var(--tx, 50%); width: 8px; height: 5px; background: var(--of-chat-bg); clip-path: polygon(0 0, 100% 0, 50% 100%); }
/* La frase anterior: atenuada con colores sólidos (sin transparencia), para que se siga leyendo */
.of-chat.is-prev { background: var(--of-chat-prev); color: #5d5663; border-color: color-mix(in srgb, var(--of-room-line) 45%, transparent); }
.of-chat.is-prev::after { background: var(--of-chat-prev); }
.of-chat.is-prev .of-ch-tk, .of-chat.is-prev .of-ch-tk b { color: #5d5663; }
.of-chat.is-prev .of-ch-tk { font-size: .85em; }
/* La nueva entra con un fundido de 150 ms y 3 px de subida; la anterior sube sin animación */
.of-chat.is-cur, .of-chat.is-piensa { animation: of-hilo-in .15s ease-out; }
@keyframes of-hilo-in { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: none; } }
/* Frase suelta: globo de pensamiento, con borde punteado y 2 burbujitas en vez de cola */
.of-chat.is-piensa { background: var(--of-piensa-bg); color: #4a4450; border-style: dashed; }
.of-chat.is-piensa::before, .of-chat.is-piensa::after { display: none; }
.of-pz1, .of-pz2 { position: absolute; border-radius: 50%; background: var(--of-piensa-bg); border: 1px dashed var(--of-chat-line); }
.of-pz1 { width: calc(3.5px * var(--px)); height: calc(3px * var(--px)); left: calc(var(--tx, 50%) - 1px * var(--px) + 2px); bottom: calc(-4.5px * var(--px)); }
.of-pz2 { width: calc(2px * var(--px)); height: calc(2px * var(--px)); left: calc(var(--tx, 50%) + 1.5px * var(--px) + 2px); bottom: calc(-7.5px * var(--px)); }
.of-rm .of-hilo, .of-rm .of-chat { animation: none; transition: none; }
@media (prefers-reduced-motion: reduce) { .of-hilo, .of-chat { animation: none; transition: none; } }

/* Mascotas: una capa sobre todo el piso; viven en el pasillo (§7). 0.4.0 (JST-162 §3): cada una es un botón con
   una zona de 44 px aunque el dibujo mida 16 px de arte, y la que habla queda encima de las otras */
.of-mascotas { position: absolute; inset: 0; z-index: 400; pointer-events: none; }
.of-mascotas .of-cama { z-index: 0; }
.of-pet { position: absolute; z-index: 1; display: block; box-sizing: border-box; margin: 0; padding: 0; border: 0; background: none; appearance: none;
  font: inherit; color: inherit; left: calc(var(--x) * var(--px) * 1px); top: calc(var(--y) * var(--px) * 1px);
  width: calc(16px * var(--px)); height: calc(16px * var(--px)); }
.of-pet > .of-spr { left: 0; top: 0; }
.of-pet.is-dice { z-index: 2; }
.of-mascotas.is-toca .of-pet { pointer-events: auto; cursor: pointer; }
.of-mascotas.is-toca .of-pet::before { content: ""; position: absolute; inset: min(0px, calc((16px * var(--px) - 44px) / 2)); }
.of-pet:focus-visible { outline: 2px solid #c9b8f0; outline-offset: 2px; border-radius: 3px; }
/* Lo que dice: al lado, hacia donde mira, dentro del pasillo */
.of-pet-dice { position: absolute; top: 50%; z-index: 2; pointer-events: none; transform: translateY(-40%); white-space: nowrap;
  padding: calc(1px * var(--px)) calc(2.5px * var(--px)); border-radius: calc(3px * var(--px));
  font-weight: 600; font-size: max(10px, calc(4px * var(--px) + 2px)); line-height: 1.15; letter-spacing: 0;
  color: #3d3842; background: #f6f3ec; border: 1px solid rgba(0, 0, 0, .25); box-shadow: 0 1px 0 rgba(0, 0, 0, .25); animation: of-pet-in .15s ease-out; }
.of-pet-dice.is-der { left: calc(100% + 3px); }
.of-pet-dice.is-izq { right: calc(100% + 3px); }
.of-pet-dice::after { content: ""; position: absolute; top: calc(50% - 3px); width: 5px; height: 6px; background: inherit; }
.of-pet-dice.is-der::after { left: -5px; clip-path: polygon(100% 0, 0 50%, 100% 100%); }
.of-pet-dice.is-izq::after { right: -5px; clip-path: polygon(0 0, 100% 50%, 0 100%); }
@keyframes of-pet-in { from { opacity: 0; } to { opacity: 1; } }
.of-rm .of-pet-dice { animation: none; }
@media (prefers-reduced-motion: reduce) { .of-pet-dice { animation: none; } }

/* Resaltar un estado: lo nuevo se atenúa como todo lo que no es de ese estado */
.of[data-hl] .of-mascotas .of-spr, .of[data-hl] .of-sobre, .of[data-hl] .of-hilo, .of[data-hl] .of-vchat { opacity: .22; filter: grayscale(1); }

/* Botones «Mascotas» (§8) y «Conversaciones» (JST-162 §4), con el mismo estilo */
.of-petbtn.is-off svg { color: var(--of-muted-fg); }
.of-ibtn.of-petbtn.is-m { position: relative; width: 24px; height: 24px; border-radius: 6px; flex: none; }
.of-ibtn.of-petbtn.is-m::before { content: ""; position: absolute; inset: -10px; }
.of-ibtn.of-petbtn.is-m:not(.is-off) { color: var(--of-fg); }

/* Leyenda: el sobre */
.of-leyenda .of-ley-sobre svg { color: var(--of-muted-fg); }

/* ---------- 0.5.0 (JST-163) ---------- */

/* «✓ listo» (§7): verde, del tamaño del globo de siempre, con un salto de 200 ms (sin salto con «reducir movimiento») */
.of-bub.of-b-listo { background: #16a34a; color: #fff; border-color: #0b5a26; font-family: Inter, system-ui, sans-serif; font-weight: 600; letter-spacing: 0;
  animation: of-listo-pop .2s cubic-bezier(.2, 1.4, .4, 1); }
.of-bub.of-b-listo svg.of-i { stroke-width: 3.2; }
@keyframes of-listo-pop { from { transform: translate(-50%, -100%) scale(.55); opacity: 0; } }
/* A 1x, un cuadrito verde de 7 × px + 2 con el ✓ blanco sobre el puesto */
.of-listo1 { position: absolute; z-index: 6; left: calc(var(--x) * var(--px) * 1px); top: calc(var(--y) * var(--px) * 1px);
  width: calc(7px * var(--px) + 2px); height: calc(7px * var(--px) + 2px); border-radius: 2px; background: #16a34a; box-shadow: 0 0 0 1px #0b5a26; }
.of-listo1::after { content: ""; position: absolute; left: 33%; top: 12%; width: 22%; height: 46%; border: solid #fff; border-width: 0 2px 2px 0; transform: rotate(45deg); }
.of-listo1.is-pop { animation: of-listo1-pop .2s cubic-bezier(.2, 1.4, .4, 1); }
@keyframes of-listo1-pop { from { transform: scale(.55); opacity: 0; } }
.of-rm .of-listo1 { animation: none; }
@media (prefers-reduced-motion: reduce) { .of-listo1 { animation: none; } }

/* El globo de dos pisos (§8): arriba lo de siempre; abajo (5 × px + 3 de alto, Inter 600 de 3 × px + 3, cifras
   tabulares) la mano con lo que te pide o la hora estimada, pegado, con el piquito del color de abajo */
.of-bub.is-2p { flex-direction: column; align-items: stretch; gap: 0; height: auto; padding: 0; }
.of-bub.is-2p > .of-p1 { display: flex; align-items: center; justify-content: center; gap: 3px; height: calc(7px * var(--px) + 2px); padding: 0 calc(2px * var(--px)); }
.of-bub.is-2p > .of-p2 { display: flex; align-items: center; justify-content: center; gap: 2px; height: calc(5px * var(--px) + 3px); padding: 0 calc(1.5px * var(--px));
  margin: 0 -1px -1px; border: 1px solid var(--of-room-line); border-radius: 0 0 3px 3px;
  font: 600 calc(3px * var(--px) + 3px)/1 Inter, system-ui, sans-serif; letter-spacing: 0; white-space: nowrap; font-variant-numeric: tabular-nums; }
.of-bub.is-2p > .of-p2 svg.of-i { width: calc(3px * var(--px) + 3px); height: calc(3px * var(--px) + 3px); }
.of-p2.is-hora { background: #ece5d6; color: #3d3546; }
/* «lleva 2 h» pasa la mitad del tiempo: mismo color, solo el texto un poco más suave (lo que destaca es la mano y el error) */
.of-p2.is-hora.is-lleva { color: #5b5262; }
.of-p2.is-mano { background: #7c3aed; color: #fff; border-color: #3b1a80; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.of-p2.is-mano em { font-style: normal; opacity: .85; margin-left: 1px; }
.of-bub.is-2p.p2-hora::after { background: #ece5d6; }
.of-bub.is-2p.p2-mano::after { background: #7c3aed; border-color: #3b1a80; }
/* Sin cabo: centrado sobre el escritorio */
.of-bub.is-2p.is-need { transform: translate(-50%, -100%); }
.of-bub.is-2p.is-need::after { left: 50%; }
.of-piso.is-x3 .of-bub.is-2p { height: auto; padding: 0; }
.of-piso.is-x3 .of-bub.is-2p > .of-p1 { height: 23px; padding: 0 7px; }
.of-tvb .of-piso.is-x2 .of-bub.is-2p { height: auto; padding: 0; }
.of-tvb .of-piso.is-x2 .of-bub.is-2p > .of-p1 { height: 18px; padding: 0 5px; }
.of-tvb .of-piso.is-x2 .of-bub.is-2p > .of-p2 { height: 14px; font-size: 10.5px; }
/* En pausa y te espera: «✋ MIG-xx» quieto */
.of-bub.of-b-toca.is-quieto { animation: none; }

/* Tu escritorio (§14): un puesto vacío con la placa «Tú»; a 1x, la pastilla con el número */
.of-ws.of-udesk.is-fijo { cursor: default; }
.of-ws.of-udesk:hover .of-spr, .of-ws.of-udesk:focus-visible .of-spr { filter: brightness(1.12); }
.of-ws.of-udesk.is-fijo:hover .of-spr { filter: none; }
.of-placa-tu { position: absolute; z-index: 5; left: calc(var(--x) * var(--px) * 1px); top: calc(var(--y) * var(--px) * 1px); transform: translate(-50%, 0);
  padding: calc(.5px * var(--px)) calc(1.5px * var(--px)); border-radius: 2px; background: #e2b23c; color: #2a1800; box-shadow: 0 0 0 1px var(--of-room-line);
  font: 700 calc(2.5px * var(--px) + 4px)/1 Inter, system-ui, sans-serif; letter-spacing: .02em; pointer-events: none; }
.of-ucnt { position: absolute; z-index: 6; left: calc(var(--x) * var(--px) * 1px); top: calc(var(--y) * var(--px) * 1px);
  min-width: 11px; height: 11px; padding: 0 2px; box-sizing: border-box; border-radius: 6px; background: #7c3aed; color: #fff; box-shadow: 0 0 0 1px var(--of-bg);
  font: 700 8px/11px ui-monospace, SFMono-Regular, Menlo, monospace; text-align: center; }
/* Tu globo: «✋ 3 esperándote», morado como la mano */
.of-bub.of-b-yo { background: #7c3aed; color: #fff; border-color: #3b1a80; font-family: Inter, system-ui, sans-serif; font-weight: 600; letter-spacing: 0; gap: 2px; }
.of-bub.of-b-yo b { font: 700 1.05em/1 ui-monospace, SFMono-Regular, Menlo, monospace; margin-right: 1px; }
.of-bub.of-b-yo.is-need { transform: translate(-50%, -100%); }
.of-bub.of-b-yo.is-need::after { left: 50%; }

/* La entrega en la mesa (§10): globos de conversación en amarillo claro; la flecha en #8a6d1e y el «🤝» en verde */
.of-ent { position: absolute; z-index: 895; pointer-events: none; box-sizing: border-box; display: inline-flex; align-items: center; white-space: nowrap;
  left: calc(var(--x) * var(--px) * 1px); top: calc(var(--y) * var(--px) * 1px - 6px + var(--dy, 0px));
  height: calc(6px * var(--px) + 4px); padding: 0 calc(2.5px * var(--px));
  font-size: calc(4px * var(--px) + 2px); font-weight: 500; letter-spacing: 0; color: var(--of-chat-fg);
  background: #fff4d6; border: 1px solid color-mix(in srgb, #8a6d1e 70%, transparent); border-radius: calc(3px * var(--px));
  box-shadow: 0 1px 0 color-mix(in srgb, var(--of-room-line) 50%, transparent); animation: of-ent-in .15s ease-out; }
/* Entra como el hilo, pero con «translate»: «of-hilo-in» le pisaba el «transform» y los 150 ms aparecía un globo más abajo, sobre otra cabeza (JST-190) */
@keyframes of-ent-in { from { opacity: 0; translate: 0 3px; } to { opacity: 1; translate: none; } }
.of-ent b { flex: none; font: 600 1em/1 ui-monospace, SFMono-Regular, Menlo, monospace; color: #2a2230; }
.of-ent-fl { flex: none; margin: 0 2px; font-family: Inter, system-ui, sans-serif; font-weight: 700; color: #8a6d1e; }
.of-ent-n { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
/* Quien entrega va a la derecha de la mesa: su frase crece hacia afuera (la cola, a 10 px de su borde) y, si no cabe en
   el descanso, se corta el nombre de quien recibe con «…» (el código nunca). Si no cabe hasta el borde, se corre
   «--corre» de arte hacia adentro y la cola sigue sobre quien entrega (JST-214) */
.of-ent.is-de { transform: translate(calc(var(--corre, 0) * var(--px) * 1px - 14px), -100%); max-width: calc((var(--fin) - var(--x) - var(--corre, 0)) * var(--px) * 1px + 14px); }
.of-ent.is-de::before { left: calc(9px - var(--corre, 0) * var(--px) * 1px); }
.of-ent.is-de::after { left: calc(10px - var(--corre, 0) * var(--px) * 1px); }
.of-ent.is-a { transform: translate(-50%, -100%); padding: 0 calc(2px * var(--px)); }
.of-ent.is-a svg.of-i { width: calc(5px * var(--px) + 2px); height: calc(5px * var(--px) + 2px); color: #15803d; }
.of-ent::before, .of-ent::after { content: ""; position: absolute; }
.of-ent::before { bottom: -7px; left: 9px; width: 10px; height: 7px; background: color-mix(in srgb, #8a6d1e 70%, transparent); clip-path: polygon(0 0, 100% 0, 50% 100%); }
.of-ent::after { bottom: -5px; left: 10px; width: 8px; height: 5px; background: #fff4d6; clip-path: polygon(0 0, 100% 0, 50% 100%); }
.of-ent.is-a::before { left: calc(50% - 5px); }
.of-ent.is-a::after { left: calc(50% - 4px); }
/* Si tuvo que subir por encima de un globo de estado o de la cabeza de alguien (JST-190), sin cola */
.of-ent.is-alta::before, .of-ent.is-alta::after, .of-ent.is-arriba::before, .of-ent.is-arriba::after { display: none; }
.of-rm .of-ent { animation: none; }
@media (prefers-reduced-motion: reduce) { .of-ent { animation: none; } }
/* La mesa de bloqueadas (JST-428): una mesita con carpetas y un número NEUTRO (ni morado ni rojo: no es un aviso) */
.of-ws.of-mesab.is-fijo { cursor: default; }
.of-ws.of-mesab:hover .of-spr, .of-ws.of-mesab:focus-visible .of-spr { filter: brightness(1.12); }
.of-ws.of-mesab.is-fijo:hover .of-spr { filter: none; }
.of-carpetas { position: absolute; z-index: 2; left: calc(var(--x) * var(--px) * 1px); top: calc(var(--y) * var(--px) * 1px);
  width: calc(8px * var(--px)); height: calc(4px * var(--px)); box-sizing: border-box; border: 1px solid #5a4410; border-radius: 1px;
  background: linear-gradient(#e2b857 0 50%, #c99a3a 50% 100%); box-shadow: 0 calc(-1px * var(--px)) 0 -1px #f0d28a, calc(1px * var(--px)) 0 0 -1px #8a6a1c; pointer-events: none; }
.of-mcnt { position: absolute; z-index: 6; left: calc(var(--x) * var(--px) * 1px); top: calc(var(--y) * var(--px) * 1px);
  min-width: 11px; height: 11px; padding: 0 2px; box-sizing: border-box; border-radius: 6px; background: #4b5563; color: #fff; box-shadow: 0 0 0 1px var(--of-bg);
  font: 700 8px/11px ui-monospace, SFMono-Regular, Menlo, monospace; text-align: center; }
.of-bub.of-b-mesa { background: #e5e7eb; color: #1f2937; border-color: #4b5563; font-family: Inter, system-ui, sans-serif; font-weight: 600; letter-spacing: 0; gap: 2px; }
.of-bub.of-b-mesa b { font: 700 1.05em/1 ui-monospace, SFMono-Regular, Menlo, monospace; margin-right: 1px; }
.of[data-hl] .of-bub.of-b-mesa { opacity: .12; }

/* El sobre en la mano (o sobre la mesa) va con quien lo lleva */
.of-sobre.is-mano { pointer-events: none; }
/* La etiqueta del sobre dice para quién va: «BET-434 → Ingeniero frontend» */
.of-sobre-para { font-family: Inter, system-ui, sans-serif; font-weight: 600; }
.of[data-hl] .of-ent { opacity: .22; filter: grayscale(1); }
.of[data-hl] .of-bub.of-b-yo { opacity: .12; }
.of[data-hl="toca"] .of-bub.of-b-yo { opacity: 1; }

/* La ficha: cuándo termina (§9) */
.of-facts .of-eta-f.is-sin { opacity: .85; }

/* La ventanita de tu escritorio (§14): 380 px al lado del escritorio, quiénes te esperan en esa sala */
.of-up { font-size: 13px; line-height: 18px; }
.of-up-h { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; gap: 8px; padding: 12px 10px 10px 14px; background: var(--of-popover); border-bottom: 1px solid var(--of-border); }
.of-up-h > svg.of-i { color: var(--of-s-toca); }
.of-up-h b { font-size: 14px; font-weight: 600; }
.of-up-n { min-width: 20px; height: 20px; padding: 0 6px; box-sizing: border-box; border-radius: 10px; background: var(--of-s-toca); color: #fff; font: 600 12px/20px ui-monospace, SFMono-Regular, Menlo, monospace; text-align: center; }
.of-up-r { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 10px; align-items: start; padding: 10px 14px; border-top: 1px solid var(--of-border); }
.of-up-h + .of-up-r { border-top: 0; }
/* El primero de la fila: fondo morado al 9 % y una barra de 3 px */
.of-up-r.is-fila1 { background: color-mix(in srgb, var(--of-s-toca) 9%, transparent); box-shadow: inset 3px 0 0 var(--of-s-toca); }
.of-up-r .of-av { margin-top: 1px; }
.of-up-m { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.of-up-who { display: flex; align-items: center; gap: 6px; min-width: 0; white-space: nowrap; }
.of-up-who > b { font-weight: 600; }
.of-up-who > span { overflow: hidden; text-overflow: ellipsis; color: var(--of-muted-fg); font-size: 12px; }
.of-up-who > span.is-fila { color: var(--of-s-toca-fg); font-weight: 600; }
.of-up-who > span.is-error { color: var(--of-s-error-fg); }
.of-up-q { display: flex; align-items: flex-start; gap: 6px; min-width: 0; }
.of-up-q svg.of-i { flex: none; margin-top: 3px; color: var(--of-muted-fg); }
/* Lo que pide: 2 líneas como mucho, con «…» */
.of-up-q span { display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.of-up-qt { display: flex; align-items: center; gap: 6px; color: var(--of-muted-fg); font-size: 12px; white-space: nowrap; min-width: 0; }
.of-up-qt > span:last-child { overflow: hidden; text-overflow: ellipsis; }
.of-up-qt em { font-style: normal; color: var(--of-fg); }
.of-up .of-tid { font: 600 11.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--of-fg); }
.of-up-r .of-btn { align-self: center; white-space: nowrap; }
.of-up-pie { display: flex; gap: 6px; align-items: flex-start; padding: 10px 14px 12px; color: var(--of-muted-fg); font-size: 12px; line-height: 17px; border-top: 1px solid var(--of-border); }
.of-up-pie svg.of-i { flex: none; margin-top: 2px; }
.of-up-vacio { display: flex; align-items: center; gap: 8px; padding: 18px 14px; color: var(--of-muted-fg); }

/* ---------- 0.6.0 (JST-225 §2): el 🔊 de quien habla, en la esquina del globo que suena ---------- */
.of-vzm { position: absolute; left: 0; top: 0; z-index: 3; display: grid; place-items: center; box-sizing: border-box; width: calc(7px + 5.5px * var(--px)); height: calc(7px + 5.5px * var(--px));
  border-radius: 50%; background: #18181b; color: #fafafa; transform: translate(-45%, -55%); box-shadow: 0 0 0 1.5px #fafafa, 0 2px 6px rgba(0,0,0,.35); pointer-events: none; animation: of-vzm-in .12s ease-out; }
.of-piso .of-vzm svg.of-i { width: 64%; height: 64%; stroke-width: 2.4; color: #fafafa; margin: 0; }
.of-vzm svg path:nth-child(2) { animation: of-onda 1.2s ease-in-out infinite; }
.of-vzm svg path:nth-child(3) { animation: of-onda 1.2s ease-in-out .3s infinite; }
@keyframes of-onda { 0%, 100% { opacity: .3; } 50% { opacity: 1; } }
@keyframes of-vzm-in { from { opacity: 0; } }
/* Con movimiento reducido: las ondas quedan fijas y aparece sin fundido */
.of-rm .of-vzm, .of-rm .of-vzm svg path { animation: none !important; opacity: 1; }
@media (prefers-reduced-motion: reduce) { .of-vzm, .of-vzm svg path { animation: none !important; opacity: 1; } }
`;
