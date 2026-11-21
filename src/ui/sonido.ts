// Sonido del aviso y voces en el navegador (design-spec de JST-95 §7 y §8).
//
// - Chrome y Safari no dejan sonar ni hablar hasta que el usuario toca la
//   página después de abrirla. Paperclip no recarga al navegar, así que basta
//   el primer `pointerdown` o `keydown` en cualquier parte: ahí se crea el audio
//   (y se toca en silencio) y se dice una frase vacía (JST-94). Sin ese toque no
//   suena, pero el aviso dentro de Paperclip sale igual.
// - Una sola cola para el sonido y las voces: la voz espera a que termine la
//   campanita, más 250 ms, y dice una frase cada 3 s como máximo.
// - Mientras habla, el subtítulo (equivalente visual) se ve en la página de la
//   Oficina y en el TV, en esta pestaña o en otra (lo pasa la vigía).
// - Desde la 0.3.1 (JST-124) las voces son 9 (Lorenzo, Catalina, Alex, Dora,
//   Santa y 4 clones chilenos), con audios que se generaron antes en la Mac:
//   aquí solo se tocan, con un `<audio>` que se desbloquea en el mismo primer
//   toque. Si falta el de una frase (un agente nuevo) o no se puede leer, esa
//   vez habla la voz del navegador, como antes: nunca queda mudo.
// - Desde la 0.5.0 (JST-167) la frase puede decir de qué se trata («terminé.
//   Diseño de Oficina global 0.5.0.»): suena si su audio ya está (lo preparó el
//   worker o se grabó al instalar); si no, se dice la frase de siempre.
// - 0.8.0 (JST-241): «te necesito» dice la pregunta. Prueba su audio y, si no
//   está, el de la frase con la tarea, y al final el de siempre; el subtítulo
//   dice la pregunta igual.
// - 0.6.0 (JST-226): lo de la oficina suena en otro `<audio>` (`tocarOficina`),
//   desbloqueado en el mismo toque. Los avisos pasan primero: mientras uno
//   suena o espera su turno (`alCambiarAvisos`), lo de la oficina se calla en
//   150 ms (`callarOficina`).
// - 0.9.0 (JST-246): mientras suena el Resumen (en esta pestaña o en otra), los
//   avisos no suenan ni se dicen (el aviso de Paperclip sale igual) y lo de la
//   oficina se calla como con un aviso. Al terminar, vuelve a como estaba. El
//   Resumen suena en su propio `<audio>`, desbloqueado al apretar «Leer».
// - 0.9.1 (JST-255): si un `<audio>` no avisa que terminó, se da por terminado
//   según lo que dura (`vigilarFin`), no a los 15 s: una frase larga suena
//   entera y la siguiente espera, sin botarse por vieja (`relojCola`). Lo de
//   la oficina y el Resumen también se miden así.
import { useSyncExternalStore } from "react";
import { cadenaDetalle, ColaVoces, DESPUES_DEL_SONIDO_MS, ENTRE_FRASES_MS, textoPendiente, textoVoz, vocesEspanol, vozDe, type DetalleVoz, type Frase, type Presentacion } from "../avisos.js";
import campana from "./assets/aviso-campana.mp3";
import { pedidoDesde, pedirAudio, pedirAudioDetalle } from "./audiosVoces.js";
import { audioDeFraseLibre, ESPERA_VOZ_LIBRE_MS, generacionDeAvisos } from "./libreVoz.js";

/** La campanita dura 0,94 s; se toca a volumen 0,8. */
export const DURACION_CAMPANA_MS = 940;
const VOLUMEN = 0.8;
/**
 * El subtítulo dura 4 s desde que empieza la frase, o hasta que empieza la
 * siguiente. Desde la 0.8.0 (JST-241), si su audio dura más (la tarea o la
 * pregunta enteras: 6–10 s), lo que dura el audio + 0,4 s, como los globos.
 */
export const DURACION_SUBTITULO_MS = 4_000;
const DESPUES_DEL_AUDIO_MS = 400;

let audio: HTMLAudioElement | null = null;
/** El `<audio>` de las voces: uno solo, desbloqueado en el primer toque (Safari en el iPhone lo pide así). */
let audioVoz: HTMLAudioElement | null = null;
/** 0.6.0: el de lo que se lee de la oficina (conversaciones, mascotas…), aparte: un aviso lo corta sin esperar. */
let audioOficina: HTMLAudioElement | null = null;
let desbloqueado = false;
const alDesbloquear = new Set<() => void>();

/** El sonido y las voces ya pueden empezar en esta pestaña (hubo un toque). */
export function audioDesbloqueado(): boolean {
  return desbloqueado;
}

export function cuandoSeDesbloquee(fn: () => void): () => void {
  alDesbloquear.add(fn);
  return () => alDesbloquear.delete(fn);
}

function desbloquear(): void {
  if (desbloqueado) return;
  desbloqueado = true;
  document.removeEventListener("pointerdown", desbloquear, true);
  document.removeEventListener("keydown", desbloquear, true);
  try {
    audio = new Audio(campana);
    audio.preload = "auto";
    audio.volume = 0;
    void audio.play().then(
      () => {
        audio?.pause();
        if (audio) {
          audio.currentTime = 0;
          audio.volume = VOLUMEN;
        }
      },
      () => {
        if (audio) audio.volume = VOLUMEN;
      },
    );
  } catch {
    audio = null;
  }
  try {
    audioVoz = new Audio(silencio());
    void audioVoz.play().catch(() => undefined);
  } catch {
    audioVoz = null;
  }
  try {
    audioOficina = new Audio(silencio());
    void audioOficina.play().catch(() => undefined);
  } catch {
    audioOficina = null;
  }
  try {
    if ("speechSynthesis" in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
  } catch {
    // Sin voces en este navegador.
  }
  for (const fn of alDesbloquear) fn();
}

/** 50 ms de silencio (WAV), para desbloquear el `<audio>` de las voces dentro del toque. */
function silencio(): string {
  const n = 400;
  const b = new Uint8Array(44 + n).fill(128);
  const v = new DataView(b.buffer);
  const txt = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  txt(0, "RIFF");
  v.setUint32(4, 36 + n, true);
  txt(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true);
  v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  txt(36, "data");
  v.setUint32(40, n, true);
  return URL.createObjectURL(new Blob([b], { type: "audio/wav" }));
}

/** Desbloquea el sonido y las voces desde un toque propio (los botones del TV, «Escuchar», «Probar»). */
export function desbloquearAudio(): void {
  if (typeof document !== "undefined") desbloquear();
}

let escuchando = false;

/** Se llama una vez por pestaña (lo hacen el menú, la barra, la página y el TV). */
export function escucharPrimerToque(): void {
  if (escuchando || typeof document === "undefined") return;
  escuchando = true;
  document.addEventListener("pointerdown", desbloquear, true);
  document.addEventListener("keydown", desbloquear, true);
}

/** Hasta cuándo suena la campanita (las voces esperan). */
let sonandoHasta = 0;

/** Toca la campanita una vez. `forzar`: el botón «Escuchar» o «Probar» (ese clic también desbloquea). Mientras suena el Resumen, no. */
export function tocarCampana(forzar = false): boolean {
  if (forzar) desbloquear();
  if (!desbloqueado || (!forzar && resumenSonando())) return false;
  try {
    audio ??= new Audio(campana);
    audio.volume = VOLUMEN;
    audio.currentTime = 0;
    void audio.play().catch(() => undefined);
    sonandoHasta = Date.now() + DURACION_CAMPANA_MS;
    revisarAvisos();
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Voces
// ---------------------------------------------------------------------------

/** Voces del navegador en español (Chrome las da tarde: hay que esperar a `voiceschanged`). */
export function vocesDisponibles(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  return vocesEspanol(window.speechSynthesis.getVoices());
}

function suscribirVoces(oyente: () => void): () => void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return () => undefined;
  window.speechSynthesis.addEventListener("voiceschanged", oyente);
  return () => window.speechSynthesis.removeEventListener("voiceschanged", oyente);
}

let cuantasVoces = -1;
/** Cuántas voces en español hay (0: solo se verá el subtítulo). */
export function useHayVoces(): boolean {
  return (
    useSyncExternalStore(suscribirVoces, () => {
      cuantasVoces = vocesDisponibles().length;
      return cuantasVoces;
    }) > 0
  );
}

export interface Subtitulo {
  agenteId: string | null;
  aspecto: string | null;
  texto: string;
  /** Hasta cuándo se ve (ms). */
  hasta: number;
  /** 0.6.0: qué frase es (el 🔊 va en «✓ listo» o en la mano) y cuánto dura su voz (ms), si se sabe. */
  frase?: Frase | null;
  voz?: number | null;
}

let subtitulo: Subtitulo | null = null;
let timerSubtitulo: ReturnType<typeof setTimeout> | null = null;
const oyentesSubtitulo = new Set<() => void>();

const oyentesHabla = new Set<(s: Subtitulo) => void>();

/** 0.6.0: cada frase de un aviso que empieza a decirse (en esta pestaña o en otra): el 🔊 de su globo. */
export function alHablarAviso(fn: (s: Subtitulo) => void): () => void {
  oyentesHabla.add(fn);
  return () => oyentesHabla.delete(fn);
}

/** Muestra el subtítulo (lo llama esta pestaña al hablar, o la vigía de otra). */
export function mostrarSubtitulo(s: Subtitulo | null): void {
  subtitulo = s;
  if (timerSubtitulo) clearTimeout(timerSubtitulo);
  timerSubtitulo = s ? setTimeout(() => mostrarSubtitulo(null), Math.max(0, s.hasta - Date.now())) : null;
  for (const o of oyentesSubtitulo) o();
  if (s) for (const o of oyentesHabla) o(s);
}

export function useSubtitulo(): Subtitulo | null {
  return useSyncExternalStore(
    (o) => {
      oyentesSubtitulo.add(o);
      return () => oyentesSubtitulo.delete(o);
    },
    () => subtitulo,
  );
}

/** Lo que dice cada frase, para el subtítulo de las otras pestañas. */
export type AlHablar = (s: Subtitulo) => void;

export interface AgenteVoz {
  id: string;
  corto: string;
  empresa: string;
  aspecto: string;
  /** JST-415: su empresa, para pedirle al worker el audio de una frase libre (el host revisa que el usuario la vea). */
  companyId?: string | null;
}

/**
 * Lo más que se espera el audio de una frase desde que se pidió (la vigía lo
 * pide apenas llega el evento, mientras suena la campanita, y el de un resumen
 * apenas se juntan las frases). Es un archivo de Paperclip: llega en
 * milisegundos; si falta, se sabe al tiro.
 */
export const ESPERA_AUDIO_MS = 2_500;

/** Mientras se espera el audio o mientras suena: la cola no dice otra frase encima. */
let esperandoAudio = 0;
let sonandoAudio = false;
/** Si el `<audio>` no empieza a sonar ni avisa nada en este rato, la cola sigue igual. */
export const MAX_EMPEZAR_MS = 15_000;
/** Pasado lo que dura el audio, cuánto más se espera a que avise que terminó. */
export const MARGEN_FIN_MS = 1_000;

/**
 * Da un audio por terminado si el `<audio>` no avisa (JST-255). Antes era un
 * tope fijo de 15 s, y una frase más larga (un clon de 16–18 s, con la tarea o
 * la pregunta) se daba por terminada mientras sonaba: la siguiente la cortaba
 * en el mismo `<audio>`. Ahora: a los 15 s si no empezó a sonar; si suena,
 * pasado lo que le queda (a su velocidad) más 1 s, y nunca mientras siga
 * avanzando. `empezo()`: ya suena (se mide desde ahí); `parar()`: terminó.
 */
export function vigilarFin(a: HTMLAudioElement, fin: () => void): { empezo: () => void; parar: () => void } {
  let reloj: ReturnType<typeof setTimeout> | null = null;
  let visto = 0;
  const armar = (ms: number) => {
    if (reloj) clearTimeout(reloj);
    reloj = setTimeout(mirar, ms);
  };
  // Sin saber cuánto dura, se vuelve a mirar al segundo.
  const queda = () => {
    const d = a.duration;
    const v = a.playbackRate > 0 ? a.playbackRate : 1;
    return (Number.isFinite(d) && d > 0 ? (Math.max(0, d - a.currentTime) * 1000) / v : 0) + MARGEN_FIN_MS;
  };
  function mirar(): void {
    reloj = null;
    const t = a.currentTime;
    if (!a.ended && !a.paused && t > visto) {
      visto = t;
      armar(queda());
      return;
    }
    fin();
  }
  armar(MAX_EMPEZAR_MS);
  return {
    empezo: () => armar(queda()),
    parar: () => {
      if (reloj) clearTimeout(reloj);
      reloj = null;
    },
  };
}

function mostrarFrase(texto: string, agente: AgenteVoz | null, alHablar?: AlHablar, frase: Frase | null = null, voz: number | null = null): void {
  const dura = Math.max(DURACION_SUBTITULO_MS, voz ? voz + DESPUES_DEL_AUDIO_MS : 0);
  const s: Subtitulo = { agenteId: agente?.id ?? null, aspecto: agente?.aspecto ?? null, texto, hasta: Date.now() + dura, frase, voz };
  mostrarSubtitulo(s);
  alHablar?.(s);
}

/**
 * Habla una frase ya armada con la voz del agente (o sin voz: solo el
 * subtítulo). La espera de `ESPERA_AUDIO_MS` cuenta desde que se pidió su
 * audio: antes, si se pidió por adelantado, o recién ahora (JST-148: un
 * resumen que se decía 3 s después de la frase anterior ya no esperaba nada).
 * `sub`: lo que dice el subtítulo, si no es lo que suena (0.8.0: la pregunta).
 */
export function decir(texto: string, agente: AgenteVoz | null, alHablar?: AlHablar, frase: Frase | null = null, sub: string | null = null): void {
  if (!desbloqueado || typeof window === "undefined") {
    mostrarFrase(sub ?? texto, agente, alHablar, frase);
    return;
  }
  esperandoAudio++;
  const id = agente?.id ?? null;
  const pedido = pedirAudio(id, texto);
  const desde = pedidoDesde(id, texto) ?? Date.now();
  const plazo = new Promise<null>((ok) => setTimeout(() => ok(null), Math.max(0, desde + ESPERA_AUDIO_MS - Date.now())));
  void Promise.race([pedido, plazo]).then((blob) => {
    esperandoAudio--;
    if (blob) tocarVoz(blob, texto, agente, alHablar, frase, sub);
    else hablarConElNavegador(texto, agente, alHablar, frase, sub);
    revisarAvisos();
  });
}

/**
 * JST-415: una frase armada al momento (el recordatorio, «mientras no estabas», «ya no queda nadie trabajando», la racha
 * de errores): suena con la voz elegida para el Resumen, grabada por el worker como las frases libres del Resumen y de
 * «Leer contexto»; si ese audio no llega en `ESPERA_VOZ_LIBRE_MS`, con la voz del navegador, como antes.
 */
/** Cambia cuando se callan los avisos: una frase libre que esperaba su audio y ve otra generación ya no suena (JST-415). */
const generacionLibre = generacionDeAvisos();

export function decirLibre(texto: string, agente: AgenteVoz | null, alHablar?: AlHablar): void {
  if (!desbloqueado || typeof window === "undefined") {
    mostrarFrase(texto, agente, alHablar, null);
    return;
  }
  esperandoAudio++;
  const generacion = generacionLibre.actual();
  // El audio se pidió al ponerla en la cola; aquí se le da un respiro más y, si no llegó, habla el navegador.
  const plazo = new Promise<null>((ok) => setTimeout(() => ok(null), ESPERA_VOZ_LIBRE_MS));
  void Promise.race([audioDeFraseLibre(texto, agente?.companyId ?? null, ESPERA_VOZ_LIBRE_MS * 2).catch(() => null), plazo])
    .then((blobs) => {
      esperandoAudio--;
      // Si mientras esperaba empezó el Resumen o «Leer contexto» (se callaron los avisos), ya no suena encima.
      if (!generacionLibre.vigente(generacion) || resumenSonando()) {
        revisarAvisos();
        return;
      }
      if (blobs && blobs.length > 0) tocarVoz(blobs, texto, agente, alHablar, null, null);
      else hablarConElNavegador(texto, agente, alHablar, null, null);
      revisarAvisos();
    });
}

/**
 * Con de qué se trata (0.5.0): si su audio ya está (lo preparó el worker, o se
 * grabó al instalar, como el motivo de un error), suena ese, con su subtítulo;
 * si no, la frase de siempre (`decir`), con su espera de siempre. 0.8.0: se
 * prueban en orden los de `cadena` («te necesito» con la pregunta, después con
 * la tarea) y el subtítulo dice `sub` si se le pasa (la pregunta, suene la que
 * suene).
 */
export function decirConDetalle(cadena: string | readonly string[], base: string, agente: AgenteVoz | null, alHablar?: AlHablar, frase: Frase | null = null, sub: string | null = null): void {
  const textos = typeof cadena === "string" ? [cadena] : cadena;
  if (!desbloqueado || typeof window === "undefined") {
    mostrarFrase(sub ?? base, agente, alHablar, frase);
    return;
  }
  esperandoAudio++;
  const id = agente?.id ?? null;
  const pedidos = textos.map((t) => pedirAudioDetalle(id, t));
  const desde = Math.min(...textos.map((t) => pedidoDesde(id, t) ?? Date.now()));
  const plazo = new Promise<null>((ok) => setTimeout(() => ok(null), Math.max(0, desde + ESPERA_AUDIO_MS - Date.now())));
  void (async () => {
    // En orden: el primero que esté (pasado el plazo, uno que ya llegó igual gana: va primero en la carrera).
    for (const [i, t] of textos.entries()) {
      const blob = await Promise.race([pedidos[i]!, plazo]);
      if (blob) {
        esperandoAudio--;
        tocarVoz(blob, t, agente, alHablar, frase, sub);
        return;
      }
    }
    esperandoAudio--;
    decir(base, agente, alHablar, frase, sub);
  })();
}

function tocarVoz(blob: Blob | Blob[], texto: string, agente: AgenteVoz | null, alHablar?: AlHablar, frase: Frase | null = null, sub: string | null = null): void {
  // Varios audios seguidos («Diseño, de JSTM: terminé.» + la muestra de «Probar»): uno tras otro, un solo subtítulo.
  const lista = Array.isArray(blob) ? blob : [blob];
  const url = URL.createObjectURL(lista[0]!);
  const a = audioVoz ?? new Audio();
  audioVoz = a;
  sonandoAudio = true;
  const fin = () => {
    reloj.parar();
    if (a.src !== url) return;
    URL.revokeObjectURL(url);
    if (lista.length > 1) {
      tocarSiguiente(lista.slice(1));
      return;
    }
    sonandoAudio = false;
    revisarAvisos();
  };
  const reloj = vigilarFin(a, fin);
  a.onended = fin;
  a.onerror = fin;
  a.src = url;
  a.volume = 1;
  a.play().then(
    // Cuánto dura la voz (el 🔊 de su globo, 0.6.0): lo que dura el audio; con varios seguidos, se estima.
    () => {
      reloj.empezo();
      mostrarFrase(sub ?? texto, agente, alHablar, frase, Number.isFinite(a.duration) && a.duration > 0 && lista.length === 1 ? Math.round(a.duration * 1000) : null);
    },
    () => {
      // El navegador no dejó tocarlo: la voz del navegador.
      sonandoAudio = false;
      reloj.parar();
      URL.revokeObjectURL(url);
      hablarConElNavegador(texto, agente, alHablar, frase, sub);
    },
  );
}

/** El resto de los audios seguidos (sin otro subtítulo). */
function tocarSiguiente(lista: Blob[]): void {
  const a = audioVoz!;
  const url = URL.createObjectURL(lista[0]!);
  const fin = () => {
    reloj.parar();
    if (a.src !== url) return;
    URL.revokeObjectURL(url);
    if (lista.length > 1) tocarSiguiente(lista.slice(1));
    else {
      sonandoAudio = false;
      revisarAvisos();
    }
  };
  const reloj = vigilarFin(a, fin);
  a.onended = fin;
  a.onerror = fin;
  a.src = url;
  a.play().then(() => reloj.empezo(), fin);
}

/** La voz del navegador (la de la 0.3.0): el respaldo si falta el audio. */
function hablarConElNavegador(texto: string, agente: AgenteVoz | null, alHablar?: AlHablar, frase: Frase | null = null, sub: string | null = null): void {
  mostrarFrase(sub ?? texto, agente, alHablar, frase);
  if (!("speechSynthesis" in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(texto);
    const voces = vocesDisponibles();
    const v = vozDe(agente?.id ?? "oficina", voces);
    if (v.voz) {
      u.voice = v.voz;
      u.lang = v.voz.lang;
    } else {
      u.lang = "es-MX";
    }
    u.pitch = v.pitch;
    u.rate = v.rate;
    u.onend = () => revisarAvisos();
    window.speechSynthesis.speak(u);
  } catch {
    // Sin voz: queda el subtítulo.
  }
}

/**
 * «▶ Probar» del panel «Voces»: desbloquea y dice la frase dentro del mismo
 * toque (en el iPhone la primera frase tiene que salir dentro del toque).
 */
export function probarVoz(texto: string, agente: AgenteVoz | null): void {
  desbloquearAudio();
  decir(texto, agente);
}

/**
 * «▶ Probar» con de qué se trata (0.5.0, JST-163): la frase de siempre y,
 * seguida, la muestra fija («Instalar la Oficina global en la real.», grabada
 * una vez por voz al instalar); o la frase entera con el motivo («tengo un
 * error: límite de uso.», también grabada). Suena al tiro; si falta un audio,
 * la voz del navegador dice la frase entera.
 */
export function probarVozDetalle(entera: string, partes: readonly string[], agente: AgenteVoz | null): void {
  desbloquearAudio();
  esperandoAudio++;
  const id = agente?.id ?? null;
  const plazo = new Promise<null>((ok) => setTimeout(() => ok(null), ESPERA_AUDIO_MS));
  void Promise.race([Promise.all(partes.map((t) => pedirAudio(id, t))), plazo]).then((blobs) => {
    esperandoAudio--;
    if (blobs && blobs.every((b): b is Blob => !!b)) tocarVoz(blobs, entera, agente);
    else hablarConElNavegador(entera, agente);
  });
}

/** La voz habla o se está esperando su audio. */
function hablando(): boolean {
  if (esperandoAudio > 0 || sonandoAudio) return true;
  return typeof window !== "undefined" && "speechSynthesis" in window && window.speechSynthesis.speaking;
}

const cola = new ColaVoces();
const agentesCola = new Map<string, AgenteVoz>();
let ultimaFrase = 0;
let timerCola: ReturnType<typeof setTimeout> | null = null;
let presentacionCola: Presentacion = "nombre-empresa";
let alHablarCola: AlHablar | undefined;

/**
 * El reloj de la cola (JST-255) no corre mientras se dice una frase de un
 * aviso: lo que espera detrás de una frase larga no se bota por viejo (los
 * 20 s de `COLA_VIEJA_MS` cuentan solo la espera sin voz) y se dice después.
 */
let ocupadoMs = 0;
let ocupadoDesde: number | null = null;

function relojCola(ahora = Date.now()): number {
  return ahora - ocupadoMs - (ocupadoDesde !== null ? ahora - ocupadoDesde : 0);
}

function marcarOcupado(): void {
  const on = hablando();
  const ahora = Date.now();
  if (on && ocupadoDesde === null) ocupadoDesde = ahora;
  else if (!on && ocupadoDesde !== null) {
    ocupadoMs += ahora - ocupadoDesde;
    ocupadoDesde = null;
  }
}

function siguiente(): void {
  timerCola = null;
  const ahora = Date.now();
  marcarOcupado();
  const espera = Math.max(ultimaFrase + ENTRE_FRASES_MS, sonandoHasta > 0 ? sonandoHasta + DESPUES_DEL_SONIDO_MS : 0) - ahora;
  if (espera > 0) {
    timerCola = setTimeout(siguiente, espera);
    return;
  }
  if (hablando()) {
    timerCola = setTimeout(siguiente, 300);
    return;
  }
  const p = cola.sacar(relojCola(ahora));
  if (!p) {
    revisarAvisos();
    return;
  }
  ultimaFrase = ahora;
  const uno = p.agentes.length === 1 ? (agentesCola.get(p.agentes[0]!.id) ?? null) : null;
  // El 🔊 va en el globo de quien lo dice: con un resumen («3 agentes terminaron») no hay uno.
  // JST-415: una frase libre (recordatorio, «mientras no estabas», hitos) no es «✓ listo» ni la mano: sin 🔊 en el globo.
  const frase = uno && !p.libre ? p.frase : null;
  const det = cadenaDetalle(p, presentacionCola);
  if (p.libre) decirLibre(textoPendiente(p, presentacionCola), uno, alHablarCola);
  else if (det) decirConDetalle(det.cadena, textoPendiente(p, presentacionCola), uno, alHablarCola, frase, det.subtitulo);
  else decir(textoPendiente(p, presentacionCola), uno, alHablarCola, frase);
  if (cola.largo > 0) timerCola = setTimeout(siguiente, ENTRE_FRASES_MS);
}

/**
 * Pone una frase en la cola (solo la pestaña vigía habla). `detalle`: de qué se trata, si esa frase lo lleva prendido (0.5.0).
 * Mientras suena el Resumen (0.9.0), no se dice: el aviso de Paperclip sale igual.
 */
export function ponerFrase(frase: Frase, agente: AgenteVoz, presentacion: Presentacion, alHablar?: AlHablar, detalle: DetalleVoz | null = null): void {
  if (resumenSonando()) return;
  presentacionCola = presentacion;
  alHablarCola = alHablar;
  agentesCola.set(agente.id, agente);
  // El audio se pide al tiro, mientras suena la campanita: llega antes de su turno.
  const base = textoVoz(agente.corto, agente.empresa, frase, presentacion);
  if (desbloqueado) void pedirAudio(agente.id, base);
  // Con de qué se trata: sus audios («te necesito» con la pregunta y con la tarea, 0.8.0) también.
  const det = detalle ? cadenaDetalle({ frase, agentes: [agente], creado: 0, detalle }, presentacion) : null;
  if (desbloqueado && det) for (const t of det.cadena) void pedirAudioDetalle(agente.id, t);
  cola.poner(frase, agente, relojCola(), detalle);
  // 0.6.0: un aviso que espera su turno ya corta lo de la oficina (no suena encima de la campanita).
  revisarAvisos();
  // Un resumen («3 agentes te necesitan.») recién existe al juntarse: su audio también se pide ahí.
  if (desbloqueado) for (const p of cola.pendientes) if (p.agentes.length > 1) void pedirAudio(null, textoPendiente(p, presentacion));
  if (!timerCola) timerCola = setTimeout(siguiente, 0);
}

/**
 * JST-415: pone en la cola una frase ya armada (el recordatorio de espera, «mientras no estabas», «ya no queda nadie
 * trabajando»), con la voz de `agente`. Pasa por la misma cola y los mismos límites que las demás (3 como mucho,
 * 3 s entre una y otra, no se junta con otras). Suena con la voz elegida para el Resumen (`decirLibre`); si su audio no
 * llega en unos segundos, habla la voz del navegador.
 */
export function ponerLibre(texto: string, agente: AgenteVoz, presentacion: Presentacion, alHablar?: AlHablar): void {
  if (resumenSonando()) return;
  presentacionCola = presentacion;
  alHablarCola = alHablar;
  agentesCola.set(agente.id, agente);
  // Su audio se pide ahora, mientras espera su turno: llega antes de que le toque (JST-415).
  if (desbloqueado) void audioDeFraseLibre(texto, agente.companyId ?? null, ESPERA_VOZ_LIBRE_MS * 2);
  cola.poner("fin", agente, relojCola(), null, texto);
  revisarAvisos();
  if (!timerCola) timerCola = setTimeout(siguiente, 0);
}

// ---------------------------------------------------------------------------
// 0.6.0 (JST-226): los avisos pasan primero, y lo que se lee de la oficina
// ---------------------------------------------------------------------------

let avisosActivos = false;
let relojAvisos: ReturnType<typeof setInterval> | null = null;
const oyentesAvisos = new Set<(activo: boolean) => void>();

/** Suena un aviso, la campanita o hay alguno esperando su turno (en esta pestaña). 0.9.0: o suena el Resumen (aquí o en otra pestaña). */
export function avisoActivo(): boolean {
  return resumenSonando() || cola.largo > 0 || timerCola !== null || hablando() || Date.now() < sonandoHasta;
}

// ---------------------------------------------------------------------------
// 0.9.0 (JST-246): el Resumen
// ---------------------------------------------------------------------------

let resumenLocal = false;
let contextoLocal = false;
/** 0.11.0 (JST-325): suena la muestra (▶) de una voz en «Voces». */
let muestraLocal = false;
let resumenAjenoHasta = 0;
let relojResumenAjeno: ReturnType<typeof setTimeout> | null = null;
let audioResumen: HTMLAudioElement | null = null;

/** Suena el Resumen en esta pestaña o en otra, o se lee el contexto de una tarea aquí: los avisos y lo de la oficina callan. */
export function resumenSonando(): boolean {
  return resumenLocal || contextoLocal || muestraLocal || Date.now() < resumenAjenoHasta;
}

/**
 * «Leer contexto» (barra de arriba y ventana de responder, JST-321 §2.6): mientras lee, la voz de la oficina no empieza
 * frases nuevas, igual que con el Resumen. Se llama al pasar a Cargando, antes de la primera frase.
 */
export function fijarContextoSonando(on: boolean): void {
  if (on === contextoLocal) return;
  contextoLocal = on;
  if (on) callarAvisos();
  revisarAvisos();
}

/** La muestra de una voz en el panel «Voces» (JST-325 §1.2): mientras suena, la voz de la oficina no empieza frases. */
export function fijarMuestraSonando(on: boolean): void {
  if (on === muestraLocal) return;
  muestraLocal = on;
  if (on) callarAvisos();
  revisarAvisos();
}

/** Empieza (o termina) el Resumen en esta pestaña. Al empezar, se callan el aviso que suena y los que esperan. */
export function fijarResumenSonando(on: boolean): void {
  if (on === resumenLocal) return;
  resumenLocal = on;
  if (on) callarAvisos();
  revisarAvisos();
}

/** El Resumen suena en otra pestaña hasta `hasta` (0: terminó). */
export function resumenAjeno(hasta: number): void {
  resumenAjenoHasta = hasta;
  if (relojResumenAjeno) clearTimeout(relojResumenAjeno);
  relojResumenAjeno = hasta > Date.now() ? setTimeout(revisarAvisos, hasta - Date.now() + 50) : null;
  if (hasta > Date.now()) callarAvisos();
  revisarAvisos();
}

/** Corta el aviso que suena (su audio o la voz del navegador) y bota los que esperan. */
function callarAvisos(): void {
  generacionLibre.cancelar();
  cola.vaciar();
  if (timerCola) clearTimeout(timerCola);
  timerCola = null;
  try {
    audioVoz?.pause();
  } catch {
    // No estaba sonando.
  }
  sonandoAudio = false;
  try {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  } catch {
    // Sin voces.
  }
}

/**
 * El `<audio>` del Resumen, desbloqueado dentro del clic en «Leer» (Safari en
 * el iPhone lo pide así): se crea una vez y se reusa. También desbloquea el
 * resto de las voces de la pestaña.
 */
export function audioDelResumen(): HTMLAudioElement | null {
  if (typeof document === "undefined") return null;
  desbloquear();
  try {
    audioResumen ??= new Audio();
    audioResumen.src = silencio();
    void audioResumen.play().catch(() => undefined);
    return audioResumen;
  } catch {
    return null;
  }
}

/** Cuando empieza a sonar algún aviso y cuando ya no queda ninguno (en esta pestaña). */
export function alCambiarAvisos(fn: (activo: boolean) => void): () => void {
  oyentesAvisos.add(fn);
  return () => oyentesAvisos.delete(fn);
}

/** Mira si cambió; mientras haya avisos, cada 300 ms (la voz del navegador no siempre avisa que terminó). */
function revisarAvisos(): void {
  if (typeof window === "undefined") return;
  marcarOcupado();
  const activo = avisoActivo();
  if (activo && !relojAvisos) relojAvisos = setInterval(revisarAvisos, 300);
  if (!activo && relojAvisos) {
    clearInterval(relojAvisos);
    relojAvisos = null;
  }
  if (activo === avisosActivos) return;
  avisosActivos = activo;
  for (const o of oyentesAvisos) o(activo);
}

/** Cuánto tarda en callarse lo de la oficina cuando llega un aviso (punto 4 del spike de JST-224). */
export const CALLAR_OFICINA_MS = 150;

let sonandoOficina: { url: string; fin: () => void } | null = null;
let fundido: ReturnType<typeof setInterval> | null = null;

/**
 * Toca un audio de la oficina (0.6.0). `alEmpezar`: cuando de verdad empieza
 * a sonar (con lo que dura); `alTerminar`: cuando termina, falla o se calla.
 * Lo que sonaba antes en este `<audio>` se calla.
 */
export function tocarOficina(blob: Blob, alEmpezar: (ms: number | null) => void, alTerminar: () => void): boolean {
  if (!desbloqueado || typeof window === "undefined") return false;
  callarOficina(0);
  const a = audioOficina ?? new Audio();
  audioOficina = a;
  const url = URL.createObjectURL(blob);
  let listo = false;
  const fin = () => {
    if (listo) return;
    listo = true;
    reloj.parar();
    if (sonandoOficina?.url === url) sonandoOficina = null;
    URL.revokeObjectURL(url);
    alTerminar();
  };
  const reloj = vigilarFin(a, fin);
  sonandoOficina = { url, fin };
  a.onended = fin;
  a.onerror = fin;
  a.src = url;
  a.volume = 1;
  a.play().then(() => {
    reloj.empezo();
    alEmpezar(Number.isFinite(a.duration) && a.duration > 0 ? Math.round(a.duration * 1000) : null);
  }, fin);
  return true;
}

/** Calla lo de la oficina: baja el volumen en `ms` (150 ms si llega un aviso) y lo detiene. */
export function callarOficina(ms = CALLAR_OFICINA_MS): void {
  const s = sonandoOficina;
  const a = audioOficina;
  if (fundido) {
    clearInterval(fundido);
    fundido = null;
  }
  if (!s || !a) return;
  sonandoOficina = null;
  const parar = () => {
    try {
      a.pause();
    } catch {
      // Ya no estaba sonando.
    }
    a.volume = 1;
    s.fin();
  };
  if (ms <= 0) {
    parar();
    return;
  }
  const t0 = Date.now();
  fundido = setInterval(() => {
    const k = Math.max(0, 1 - (Date.now() - t0) / ms);
    a.volume = k;
    if (k > 0) return;
    if (fundido) clearInterval(fundido);
    fundido = null;
    parar();
  }, 25);
}
