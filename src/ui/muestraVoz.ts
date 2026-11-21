// El ▶ de cada voz en «Voces» (0.11.0, JST-325; design-spec de JST-324 §1.2):
// una muestra corta, una a la vez. Las de la lista suenan con el audio que se
// grabó al instalar («Instalar la Oficina global en la real.», la misma de «▶
// Probar»); la del navegador, con su voz. Mientras suena una, la voz de la
// oficina no empieza frases (como con «Leer contexto») y la que sonaba se calla.
import { useSyncExternalStore } from "react";
import { TEXTO_MUESTRA } from "../avisos.js";
import { t } from "../i18n.js";
import { vozParaResumen } from "../resumen/voz.js";
import { accionPlugin } from "../fuentes.js";
import { archivoVivo, claveAudio, vozPorId, type VozId } from "../voces.js";
import { cargarIndice, instalacion, pedirArchivo } from "./audiosVoces.js";
import { callarOficina, desbloquearAudio, fijarMuestraSonando, tocarOficina, vocesDisponibles } from "./sonido.js";

export type VozMuestra = VozId | "navegador";

/** JST-412: id del «resumen» con que se le pide al worker la muestra de una voz que no se grabó al instalar. */
const RESUMEN_MUESTRA = "muestra-voz";
/** Lo más que se espera a que el worker grabe la muestra (Edge tarda de 0,3 a 2,5 s; un motor que arranca, más). */
const ESPERA_MUESTRA_MS = 20_000;

let sonando: VozMuestra | null = null;
let empresa: string | null = null;
let fallo: { voz: VozMuestra; texto: string } | null = null;
let version = 0;
let cortarNavegador: (() => void) | null = null;
const oyentes = new Set<() => void>();

const avisar = () => {
  version += 1;
  for (const o of oyentes) o();
};

/** La empresa con que se le pide la muestra al worker (el host revisa que el usuario la vea); la fija el panel «Voces». */
export function fijarEmpresaMuestra(companyId: string | null): void {
  empresa = companyId;
}

/** JST-412: por qué no sonó la última muestra (se ve en la lista), o `null`. */
export function useFalloMuestra(): { voz: VozMuestra; texto: string } | null {
  useSyncExternalStore(
    (o) => {
      oyentes.add(o);
      return () => oyentes.delete(o);
    },
    () => version,
  );
  return fallo;
}

export function useMuestra(): VozMuestra | null {
  useSyncExternalStore(
    (o) => {
      oyentes.add(o);
      return () => oyentes.delete(o);
    },
    () => version,
  );
  return sonando;
}

function terminar(voz: VozMuestra): void {
  if (sonando !== voz) return;
  sonando = null;
  cortarNavegador = null;
  fijarMuestraSonando(false);
  avisar();
}

/** Calla la muestra que suena (también al cerrar el panel). */
export function detenerMuestra(): void {
  const voz = sonando;
  if (fallo) {
    fallo = null;
    avisar();
  }
  if (!voz) return;
  cortarNavegador?.();
  callarOficina(0);
  terminar(voz);
}

/** ▶: toca la muestra de esa voz; si ya suena, la detiene. Una a la vez. */
export async function tocarMuestra(voz: VozMuestra): Promise<void> {
  if (sonando === voz) {
    detenerMuestra();
    return;
  }
  detenerMuestra();
  // Dentro del toque, para que el iPhone deje sonar.
  desbloquearAudio();
  sonando = voz;
  fijarMuestraSonando(true);
  avisar();
  if (voz === "navegador") {
    const synth = typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
    if (!synth) return terminar(voz);
    const u = new SpeechSynthesisUtterance(TEXTO_MUESTRA);
    const v = vocesDisponibles()[0];
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    } else u.lang = "es-MX";
    u.onend = () => terminar(voz);
    u.onerror = () => terminar(voz);
    cortarNavegador = () => {
      try {
        synth.cancel();
      } catch {
        // Ya no sonaba.
      }
    };
    try {
      synth.cancel();
      synth.speak(u);
    } catch {
      terminar(voz);
    }
    return;
  }
  const indice = await cargarIndice().catch(() => null);
  const grabada = indice?.audios[claveAudio(voz, TEXTO_MUESTRA)];
  const blob = grabada ? (sonando === voz ? await pedirArchivo(grabada) : null) : await grabarMuestra(voz);
  // Si el toque ya no es el último, no suena nada (y tampoco se avisa).
  if (sonando !== voz) return;
  if (blob && tocarOficina(blob, () => undefined, () => terminar(voz))) return;
  if (!fallo) fijarFallo(voz, grabada ? t("No pude reproducir la muestra.") : t("No hay muestra de esa voz y no se pudo grabar ahora."));
  terminar(voz);
}

function fijarFallo(voz: VozMuestra, texto: string): void {
  fallo = { voz, texto };
  avisar();
}

/**
 * JST-412: una voz sin muestra pregrabada (las de Edge de otros países, o las de un motor que no se eligió al
 * preparar las voces): el worker la graba al momento, como las frases del Resumen (`voz-resumen`, la misma frase
 * de «▶ Probar»), y esta pestaña la baja. Los clones no (tardan 14 a 30 s). Si no se puede, deja dicho por qué.
 */
async function grabarMuestra(voz: VozMuestra): Promise<Blob | null> {
  if (voz === "navegador") return null;
  const nombre = vozPorId(voz)?.nombre ?? t("esa voz");
  if (!vozParaResumen(voz)) {
    fijarFallo(voz, t("{nombre} es un clon: su muestra no se graba al momento.", { nombre }));
    return null;
  }
  const id = await instalacion().catch(() => null);
  if (!id || !empresa) {
    fijarFallo(voz, t("No pude pedirle a la Mac la muestra de {nombre}.", { nombre }));
    return null;
  }
  const fin = Date.now() + ESPERA_MUESTRA_MS;
  while (sonando === voz && Date.now() < fin) {
    const r = await accionPlugin<{ estados: string[] }>({ base: "" }, id, "voz-resumen", empresa, { voz, resumen: RESUMEN_MUESTRA, frases: [TEXTO_MUESTRA], ms: Math.min(8_000, fin - Date.now()) }).catch(() => null);
    const estado = r?.estados?.[0];
    if (estado === "lista") return sonando === voz ? pedirArchivo(archivoVivo(voz, TEXTO_MUESTRA)) : null;
    if (estado === "no") {
      fijarFallo(voz, t("La Mac no puede grabar la muestra de {nombre} ahora (Edge necesita uv, ffmpeg e internet).", { nombre }));
      return null;
    }
    if (!r) await new Promise((ok) => setTimeout(ok, 400));
  }
  if (sonando === voz) fijarFallo(voz, t("La muestra de {nombre} tarda en grabarse. Prueba de nuevo en un momento.", { nombre }));
  return null;
}
