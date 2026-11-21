// Un solo clasificador de por qué falló un run (JST-415), para la voz (`motivoDeError` de `avisos.ts`) y
// para las conversaciones del descanso (`motivoError` de `charlas.ts`). Antes cada una tenía su regex y
// para lo mismo la voz decía «no alcanzó a empezar» y la charla «se le acabó el tiempo». Aquí se decide la
// categoría; cada una sigue diciéndola con sus palabras. Función pura, sin navegador.

export type CategoriaError =
  | "limite" //     se quedó sin cupo (cuota, límite de uso)
  | "dormida" //    la Mac se durmió
  | "caida" //      se cortó o se cayó el proceso
  | "carpeta" //    problema con la carpeta de trabajo
  | "acceso" //     permisos o autenticación
  | "inicio" //     no alcanzó a empezar (falló al abrir su sesión)
  | "tiempo" //     se pasó del tiempo
  | "pruebas"; //   fallaron las pruebas

/**
 * La categoría de un run que falló, con su `error` (texto) y su `errorCode` (los dos pueden faltar), o `null`
 * si no se reconoce. El código manda sobre el texto, y entre los textos el orden es el de los casos de aquí.
 */
export function categoriaError(error: unknown, errorCode: unknown): CategoriaError | null {
  const e = typeof error === "string" ? error : "";
  const c = typeof errorCode === "string" ? errorCode : "";
  // Primero lo que dice el código (es lo más firme: un texto «rate limit» con el código `process_lost` es una caída),
  // después lo que dice el texto.
  if (c === "provider_quota") return "limite";
  if (c === "process_lost" || c === "orphaned_running_run") return "caida";
  if (c === "workspace_validation_failed" || c === "setup_failed") return "carpeta";
  if (c.includes("auth")) return "acceso";
  if (c === "acpx_session_init_failed") return "inicio";
  if (c === "timeout" || c === "timed_out") return "tiempo";
  // «Límite de uso» es solo de cupo: ni «context length limit» ni «recursion limit» lo son.
  if (/quota|rate.?limit|usage limit|session limit|hit your (?:usage |session |rate |weekly |daily )?limit|too many requests|\bcupo\b|\b429\b/i.test(e)) return "limite";
  if (/asleep|went to sleep/i.test(e)) return "dormida";
  if (/timeout|timed out|tiempo/i.test(e)) return "tiempo";
  if (/\btests?\b|prueba/i.test(e)) return "pruebas";
  // Un 401 o 403 solo cuenta como estado HTTP («status 401», «HTTP 403», «401 Unauthorized»), no cualquier «401» suelto.
  if (/\bauth|unauthori[sz]ed|forbidden|(?:status|http|code)\W{0,3}40[13]\b|\b40[13]\s+(?:unauthori[sz]ed|forbidden)/i.test(e)) return "acceso";
  // Un «exit code 1» suelto no dice que se cortó: solo lo que habla de una caída o de un proceso que salió.
  if (/disconnected|process_exit|process exited with exit code|crash|se cayó|sigkill|sigterm/i.test(e)) return "caida";
  return null;
}

/** Lo que dice la voz de cada categoría (los audios de «tengo un error: …» se graban con estas palabras); `null`: no dice motivo. */
export const MOTIVO_VOZ: Readonly<Record<CategoriaError, string | null>> = {
  limite: "límite de uso",
  carpeta: "problema con la carpeta de trabajo",
  caida: "se cortó",
  acceso: "no pudo conectarse",
  dormida: "la Mac se durmió",
  inicio: "no alcanzó a empezar",
  tiempo: "se le acabó el tiempo",
  pruebas: null,
};
