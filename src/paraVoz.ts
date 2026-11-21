// Cómo dice la voz el nombre de una tarea y lo que un agente te pregunta (0.8.0,
// JST-241), sin React, navegador ni Node: lo usan la página y el worker, que
// tienen que armar el mismo texto (el nombre del audio sale de él).
//
// - `tareaParaVoz`: el nombre de la tarea sin el código, sin lo que va entre
//   paréntesis o corchetes, sin comillas, markdown ni emojis, hasta ~14
//   palabras o ~90 letras. Si no cabe entero, se corta en un límite natural:
//   un signo (dos puntos, coma, punto y coma), una raya o antes de «cuando»,
//   «para que», «porque»…; si así queda muy corto, antes de una preposición o
//   de una «y». Nunca termina en un conector («en cada»), ni deja solo la
//   condición del principio («Oficina global 0.1.2: si Personal no responde al
//   recargar,»): sigue hasta lo principal si cabe o va lo de antes de los dos
//   puntos (0.9.1, JST-253). Antes, 8 palabras y 60 letras, donde cayera.
//   «50 %» se dice «50 por ciento». Una dirección web se dice «la dirección»
//   (0.9.2, JST-259: la voz la leía número por número).
// - `sinRolDelante`: quita un «Ingeniero:» (o «Integración y CI —», JST-266)
//   al principio del título si es el nombre de un rol de esa empresa («QA de
//   X» se queda: dice qué se hizo).
// - `preguntaParaVoz`: la primera pregunta (o, si no hay, la primera oración)
//   de una tarjeta, con el mismo corte, y con «¿…?» si es una pregunta.

/** Cuánto puede durar lo que se dice: palabras y letras. */
export interface Topes {
  palabras: number;
  letras: number;
}

/**
 * «Terminé», «empecé» y «te necesito» (0.8.0): ~90 letras, unos 5 s de voz. Con
 * palabras cortas caben hasta 16 («QA de Oficina global 0.6.0: la voz lee las
 * conversaciones y los globos elegidos en Voces» entera, sin cortar el final).
 */
export const TOPES_AVISO: Topes = { palabras: 16, letras: 90 };
/** Lo de la oficina (la entrega, el sobre, las frases con la tarea) sigue con lo de la 0.5.0: tiene que caber mientras se juntan. */
export const TOPES_OFICINA: Topes = { palabras: 8, letras: 60 };

/**
 * «Ingeniero/a» → «Ingeniero», «UX/UI» → «UX UI» (JST-239): la voz leía «barra a».
 * La barra pegada a dos letras se cambia por un espacio.
 */
export function sinBarras(texto: string): string {
  return texto.replace(/(?<=\p{L}\p{Ll})\/(?:as?|os?)(?![\p{L}\p{N}])/gu, "").replace(/(?<=\p{L})\/(?=\p{L})/gu, " ");
}

/** Un código de tarea («JST-12», «BT-7546», «KAN-188»). */
const CODIGO = /\b[A-Z][A-Z0-9]{1,9}-\d+\b/g;

/** Hasta dónde llega una dirección: lo que no es espacio, comillas ni paréntesis. */
const RESTO_DIR = String.raw`[^\s<>«»"“”'()[\]{}]`;
/**
 * Una dirección web (JST-259): «http://192.0.2.15:3100», «https://claude.ai/x»,
 * «www.x.cl/y», «localhost:3100/JST» o una IP («192.0.2.15:3100»).
 */
const DIRECCION = new RegExp(
  String.raw`(?<![\p{L}\p{N}@./])(?:(?:https?|wss?|ftp|file):\/\/${RESTO_DIR}*|www\.${RESTO_DIR}+|localhost:\d{2,5}${RESTO_DIR}*|(?:\d{1,3}\.){3}\d{1,3}(?![\p{N}.]\d)(?::\d{2,5})?(?:\/${RESTO_DIR}*)?)`,
  "giu",
);
/** Otra dirección con su «://» («chrome://flags/#prompt-api»): se dice su nombre, «chrome flags». */
const OTRO_ESQUEMA = new RegExp(String.raw`(?<![\p{L}\p{N}])([a-z][a-z0-9+.-]{1,15}):\/\/([\p{L}\p{N}-]*)${RESTO_DIR}*`, "giu");
/** Lo que ya dice que viene una dirección («la URL», «el enlace»): ahí se quita sin más. */
const YA_NOMBRADA = /(?:^|[\s(¿¡])(?:la|una|esta|esa|tu|su)\s+(?:url|dirección|direccion|ip|página|pagina|web)\s*:?\s*$|(?:^|[\s(¿¡])(?:el|un|este|ese|tu|su)\s+(?:enlace|link|sitio|dominio|host|servidor)\s*:?\s*$/iu;
/** Lo de puntuación que queda pegado al final («…:3100?»), que no es de la dirección. */
const FIN_DIR = /[.,;:!?…]+$/u;

/** Una IP que no lo es: «1.2.3.4» sin puerto suele ser una versión (las IPs de la oficina empiezan con 10, 100, 127, 172 o 192). */
function esVersion(x: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(:\d+)?/.exec(x);
  if (!m) return false;
  return m.slice(1, 5).some((o) => Number(o) > 255) || (!m[5] && Number(m[1]) < 10);
}

/**
 * Sin direcciones web (JST-259): la voz las leía número por número («http 100
 * .108 .92 .101, 3100»). Una dirección pasa a «la dirección», o se quita si ya
 * se dijo («abre el enlace https://…» → «abre el enlace»); otra con «://» dice
 * su nombre («chrome://flags» → «chrome flags»).
 */
export function sinDirecciones(texto: string): string {
  return String(texto ?? "")
    .replace(DIRECCION, (x: string, i: number, todo: string) => {
      const fin = FIN_DIR.exec(x)?.[0] ?? "";
      const dir = fin ? x.slice(0, -fin.length) : x;
      if (esVersion(dir)) return x;
      return `${YA_NOMBRADA.test(todo.slice(0, i)) ? "" : "la dirección"}${fin}`;
    })
    .replace(OTRO_ESQUEMA, (x: string, esquema: string, nombre: string) => `${esquema} ${nombre}`.trim() + (FIN_DIR.exec(x)?.[0] ?? ""));
}

/** Hay una dirección web en el texto (para el worker: no la lee). */
export function tieneDireccion(texto: string): boolean {
  return sinDirecciones(texto) !== texto;
}

/**
 * Lo que la voz no puede decir: markdown, códigos, paréntesis y corchetes,
 * comillas, emojis y símbolos. « · » y « + » pasan a «, » y « y », y el «%» de
 * un número a « por ciento», y una dirección web a «la dirección» (JST-259).
 * Deja los signos que marcan pausas (, ; : . ¿ ? ¡ !) y las rayas.
 */
function limpiar(texto: string): string {
  let t = String(texto)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1");
  t = sinDirecciones(t)
    .replace(/\([^)]*\)?/g, " ")
    .replace(/\[[^\]]*\]?/g, " ")
    .replace(/\{[^}]*\}?/g, " ")
    .replace(/(?<=\d)\s*×\s*(?=\d)/g, " por ")
    // «el 50 % de» → «el 50 por ciento de» (JST-253: el «%» se borraba con los demás símbolos).
    .replace(/(?<=\p{N})\s*%/gu, " por ciento")
    .replace(CODIGO, " ");
  t = sinBarras(t)
    .replace(/\s+[·•|]\s+/g, ", ")
    .replace(/\s+[+&]\s+/g, " y ")
    .replace(/[«»"“”„]/g, "")
    .replace(/\.{3,}|…/g, " ")
    .replace(/[^\p{L}\p{N}\s.,:;¿?¡!/&+\-—–'·]/gu, " ")
    .replace(/·/g, " ")
    .replace(/\s+/g, " ")
    .replace(/(?<=\p{L})-(?=\s|$|[,;:.?])/gu, "")
    .replace(/\s+\/\s+/g, ", ")
    .replace(/\s+([,.;:!?])(?=\s|$)/g, "$1")
    .replace(/([¿¡])\s+/g, "$1")
    .trim();
  // Lo que quedó sin nada al quitar un código o un emoji: «los textos de UI-9 y» → «los textos y», «vacíos de BET-49 y BET-50?» → «vacíos?».
  for (let i = 0; i < 3; i++) {
    const antes = t;
    t = t
      .replace(/(^|\s)(?:de|del|en|al|a|con|para|por|sin)(?=\s+(?:y|e|o|u|de|del|en|con|contra|para|por|a|al)\s|[,;:.?]|$)/gu, "$1")
      .replace(/\s(?:y|e|o|u)(?=[,;:.?]|$)/gu, "")
      .replace(/\s+/g, " ")
      .replace(/\s+([,.;:!?])(?=\s|$)/g, "$1")
      .trim();
    if (t === antes) break;
  }
  // Lo que queda adelante de quitar el código («BET-117 · H2 Login»): «, H2 Login».
  return t.replace(/^[\s.,:;—–\-/&+]+/, "").trim();
}

/**
 * Cuántas palabras dice la voz de un texto (JST-272): sin el código, el « · »,
 * las rayas ni lo que va entre paréntesis. «BET-250 · commit» es 1.
 */
export function palabrasDichas(texto: string): number {
  return limpiar(texto)
    .split(" ")
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/**
 * No puede terminar en estas: artículos, preposiciones, conjunciones y lo que
 * pide una palabra después («cada», «todos»). «Sobre» no está: en la oficina es
 * casi siempre el sobre de una entrega.
 */
const NO_TERMINA = new Set(
  (
    "a al ante bajo cabe con contra de del desde durante e el en entre hacia hasta la las le les lo los me mediante mi mis ni no nos o para pero por que se según sin sino su sus te tras tu tus u un una unas unos y ya " +
    "aunque cada como cual cuales cuando cuya cuyo donde mientras muy más menos porque pues si tan tanto toda todas todo todos este esta estos estas ese esa esos esas aquel aquella aquellos aquellas otro otra otros otras " +
    "nuestro nuestra nuestros nuestras mucho mucha muchos muchas poco poca pocos pocas varios varias algún alguna algunos algunas ningún ninguna qué cuál cuáles cómo cuándo dónde quién quiénes " +
    // Los títulos que pone Paperclip en inglés («Review release notes for BET-479»).
    "and at by for from in of on the to with"
  ).split(" "),
);
/** Una cláusula nueva empieza aquí: se corta antes («…no suena | si los dos ya estaban…»). */
const ABRE_CLAUSULA = new Set("aunque cuando donde mientras pero porque pues si sino".split(" "));
const ABRE_CLAUSULA_2 = new Set(["para que", "sin que", "hasta que", "ya que", "así que", "a fin", "en vez", "de modo", "antes de", "después de"]);
/** Un trozo nuevo de la frase empieza aquí: se puede cortar antes si no hay nada mejor («…la voz lee las conversaciones | y los globos…»). */
const ABRE_TROZO = new Set("a al como con contra de del desde e en entre hacia hasta ni o para por que según sin sobre tras u y".split(" "));

const base = (w: string) => w.toLowerCase().replace(/^[¿¡]+/, "").replace(/[.,;:!?]+$/, "");
const termina = (w: string) => !NO_TERMINA.has(base(w)) && !/^[\p{P}\p{S}]+$/u.test(w);
const largo = (ws: readonly string[]) => ws.join(" ").replace(/[\s,;:—–\-]+$/, "").length;

/**
 * Con esto empieza una condición o un complemento que va antes de lo principal
 * y no se entiende solo: «si Personal no responde al recargar,», «al abrir
 * un reporte,», «en el modo TV…,», «sin Te toca…,», «siguiendo el documento…,»
 * (JST-253).
 */
const ABRE_DEPENDIENTE = new Set(
  "a al ante antes apenas aunque bajo como con cuando de del desde después durante en entre hacia hasta luego mediante mientras para por porque pues salvo según si sin sobre tras".split(" "),
);
const ABRE_DEPENDIENTE_2 = new Set(["ya que", "una vez", "dado que", "puesto que", "a pesar"]);
/** Puede ir delante de lo anterior: «justo después de cargar,», «solo si…,». */
const ANTES_DE_DEPENDIENTE = new Set("justo solo sólo recién incluso aun aún".split(" "));
/** Gerundio («siguiendo», «usando», «leyendo»), salvo los sustantivos que terminan igual. */
const GERUNDIO = /^\p{L}{2,}(?:ando|iendo|yendo)$/u;
const NO_GERUNDIO = new Set(["comando", "mando", "bando", "contrabando", "remiendo"]);
/** Lo principal tiene que traer al menos estas palabras para cortar después de una condición («…, aparece su sala»; «…, la vuelve» no). */
const MIN_PRINCIPAL = 3;

/**
 * Desde la palabra i va una condición: empieza con «si», «al», «en»… y termina
 * en coma. Sin la coma es lo principal («en la app el modo oscuro queda
 * disponible…», «Sin resultados:»).
 */
function abreDependiente(ws: readonly string[], i: number): boolean {
  let j = i;
  if (ANTES_DE_DEPENDIENTE.has(base(ws[j]!)) && j + 1 < ws.length) j++;
  const w = base(ws[j]!);
  if (!ABRE_DEPENDIENTE.has(w) && !ABRE_DEPENDIENTE_2.has(`${w} ${base(ws[j + 1] ?? "")}`) && !(GERUNDIO.test(w) && !NO_GERUNDIO.has(w))) return false;
  for (let m = i; m < ws.length; m++) {
    if (/,$/.test(ws[m]!)) return true;
    if (/[:;.!?]$/.test(ws[m]!) || /^[—–-]$/.test(ws[m + 1] ?? "")) return false;
  }
  return false;
}

/**
 * Para cada corte k (las k primeras palabras), si deja solo la condición o el
 * complemento del principio de un trozo, sin lo principal: «Oficina global
 * 0.1.2: si Personal no responde al recargar», «En el panel, al abrir un
 * reporte». Un trozo empieza al principio y después de dos puntos, punto y
 * coma, punto o raya; lo principal, en la primera coma que no abre otra
 * condición. Cortar después de los dos puntos («Oficina global 0.1.2») sí se
 * puede: es lo que queda si no cabe nada que se entienda.
 */
function cortesSoloCondicion(ws: readonly string[]): boolean[] {
  const malo = new Array<boolean>(ws.length + 1).fill(false);
  let empiezaTrozo = true;
  let empiezaClausula = true;
  let conCondicion = false; // el trozo empezó con «si», «al», «en»…
  let principal = -1; // dónde empieza lo principal del trozo (-1: todavía no llega)
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i]!;
    const raya = /^[—–-]$/.test(w);
    if (raya) {
      empiezaTrozo = true;
      continue;
    }
    if (empiezaTrozo) {
      conCondicion = abreDependiente(ws, i);
      principal = conCondicion ? -1 : i;
    } else if (empiezaClausula && principal < 0 && !abreDependiente(ws, i)) principal = i;
    empiezaTrozo = false;
    empiezaClausula = false;
    malo[i + 1] = conCondicion && (principal < 0 || i + 1 - principal < MIN_PRINCIPAL);
    if (/[:;.!?]$/.test(w)) empiezaTrozo = true;
    else if (/,$/.test(w)) empiezaClausula = true;
  }
  return malo;
}

/** El corte k separa «50 por ciento» (JST-253): «…por sobre 80» perdería el «por ciento». */
function separaPorCiento(ws: readonly string[], k: number): boolean {
  const antes = ws[k - 1] ?? "";
  const sigue = base(ws[k] ?? "");
  return (/\p{N}$/u.test(antes) && sigue === "por" && base(ws[k + 1] ?? "") === "ciento") || (base(antes) === "por" && sigue === "ciento");
}

/** Saca lo que no se dice al final: signos sueltos, y «?» o «!» que no abrieron. */
function cerrar(t: string): string {
  let r = t.replace(/[\s.,;:·—–\-/&+]+$/, "");
  if (/[?!]$/.test(r) && !/[¿¡]/.test(r)) r = r.replace(/[?!]+$/, "");
  return r;
}

/**
 * Corta en un límite natural. Entero si cabe. Si no, el corte más largo que
 * cabe entre los fuertes (después de un signo o una raya, o antes de «cuando»,
 * «si», «para que»…); si es muy corto al lado del mejor corte débil (antes de
 * una preposición o una «y»), el débil. Ninguno termina en un conector ni
 * deja solo la condición del principio (`cortesSoloCondicion`): esos, solo si
 * no hay otro. Si no hay ninguno, hasta donde quepa sin terminar en un conector.
 */
export function cortarNatural(texto: string, topes: Topes): string {
  const ws = texto.split(" ").filter(Boolean);
  if (ws.length === 0) return "";
  if (ws.length <= topes.palabras && largo(ws) <= topes.letras) return cerrar(sinConectorAlFinal(ws).join(" "));
  // Los cortes que dejan solo la condición del principio van aparte: se usan solo si no hay otro (JST-253).
  const soloCondicion = cortesSoloCondicion(ws);
  const cortes = { fuerte: 0, debil: 0 };
  const deCondicion = { fuerte: 0, debil: 0 };
  for (let k = 1; k < ws.length && k <= topes.palabras; k++) {
    const antes = ws.slice(0, k);
    if (largo(antes) > topes.letras) break;
    const ultima = ws[k - 1]!;
    const sigue = base(ws[k]!);
    const dos = `${sigue} ${base(ws[k + 1] ?? "")}`;
    const signo = /[,;:.!?]$/.test(ultima) || /^[—–-]$/.test(ws[k]!) || /^[—–]$/.test(ultima);
    const sinSigno = ultima.replace(/[,;:.!?—–-]+$/, "");
    if (!sinSigno || !termina(sinSigno) || separaPorCiento(ws, k)) continue;
    const c = soloCondicion[k] ? deCondicion : cortes;
    if (signo || ABRE_CLAUSULA.has(sigue) || ABRE_CLAUSULA_2.has(dos)) c.fuerte = k;
    else if (ABRE_TROZO.has(sigue)) c.debil = k;
  }
  const k = elegirCorte(cortes) || elegirCorte(deCondicion);
  if (k > 0) return cerrar(ws.slice(0, k).join(" "));
  // Sin límite natural a la vista: hasta donde quepa, sin terminar en un conector.
  const r: string[] = [];
  for (const w of ws) {
    if (r.length >= topes.palabras || largo([...r, w]) > topes.letras) break;
    r.push(w);
  }
  while (r.length > 1 && separaPorCiento(ws, r.length)) r.pop();
  return cerrar(sinConectorAlFinal(r).join(" "));
}

/** Entre el corte fuerte y el débil más largos que caben: un fuerte de 1 palabra solo si no hay otro; uno débil, desde 3; el fuerte, salvo que el débil sea más del doble. */
function elegirCorte({ fuerte, debil }: { fuerte: number; debil: number }): number {
  const f = fuerte >= 2 || (fuerte === 1 && debil < 3) ? fuerte : 0;
  const d = debil >= 3 ? debil : 0;
  return f && (!d || f >= d * 0.5) ? f : d || f;
}

/** Sin los conectores del final («…de la revisión de»): pasa si se quitó un código que iba al final. */
function sinConectorAlFinal(ws: readonly string[]): string[] {
  const r = [...ws];
  // Una pregunta entera termina donde termina («¿Por qué?», «¿Lo mergeas o no?»).
  while (r.length > 1 && !/[?!]$/.test(r[r.length - 1]!) && !termina(r[r.length - 1]!.replace(/[,;:.—–-]+$/, ""))) r.pop();
  return r;
}

/**
 * El nombre de una tarea como lo dice la voz (0.8.0): limpio y cortado en un
 * límite natural (`cortarNatural`). Una pregunta («¿Instalo ya la 0.5.1?») se
 * queda con su «¿…?». Sin nada que decir, «».
 */
export function tareaParaVoz(titulo: string | null | undefined, topes: Topes = TOPES_AVISO): string {
  const t = limpiar(String(titulo ?? ""));
  if (!/\p{L}/u.test(t)) return "";
  return cortarNatural(t, topes);
}

/** Para comparar nombres de roles: minúsculas, sin tildes, sin «/a» ni lo que va entre paréntesis. */
export function normalizarRol(t: string): string {
  return sinBarras(t.replace(/\([^)]*\)?/g, " "))
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[«»"“”.]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Delante del rol puede ir el código («KAN-188 · ») o el número de la spec con su « · » («038 · »).
const ANTES_DEL_ROL = String.raw`^((?:\s*(?:\b[A-Z][A-Z0-9]{1,9}-\d+\b\s*[·:—–-]?|\d{2,4}\s*[·—–-])\s*)*)`;
/** «‹Rol›:» o, si no, «‹Rol› — » (JST-266: «BET-508 · Plataforma y CI — commit…»). La raya con espacios: «CEO - CTO» es un rol. */
const ROLES_DELANTE = [new RegExp(`${ANTES_DEL_ROL}([^:·]{1,40}):\\s*`, "u"), new RegExp(`${ANTES_DEL_ROL}([^:·—–]{1,40}?)\\s+[—–]\\s+`, "u")];

/**
 * Sin el «‹Rol›:» (o «‹Rol› —») del principio, si es el nombre de un rol de
 * esa empresa (`roles`, ya normalizados con `normalizarRol`): «KAN-188 ·
 * Ingeniero: el nombre…» → «KAN-188 · el nombre…». Lo demás queda igual
 * («QA de X:», «Spec:», «Plan:»).
 */
export function sinRolDelante(titulo: string, roles: ReadonlySet<string>): string {
  for (const re of ROLES_DELANTE) {
    const m = re.exec(titulo);
    if (m && roles.has(normalizarRol(m[2]!))) return `${m[1]}${titulo.slice(m[0].length)}`;
  }
  return titulo;
}

/** Al principio de una pregunta, una etiqueta como «P1 · », «D-1 y D-9 · », «R-03 · », «Q1 · » o «1 · ». */
const ETIQUETA = /^\s*(?:(?:[A-Z]{1,4}-?\d{1,3}|\d{1,2})(?:\s+y\s+(?:[A-Z]{1,4}-?\d{1,3}|\d{1,2}))*)\s*[·:.)]\s+/u;
/** Las palabras con que empieza una pregunta sin signos («Qué IA escribe las conversaciones»). */
const INTERROGATIVAS = /^(?:qué|cómo|cuál|cuáles|cuándo|dónde|quién|quiénes|cuánto|cuánta|cuántos|cuántas)(?=[\s,]|$)/iu;

/** Las oraciones: termina una en «.», «?» o «!» seguido de un espacio y de una mayúscula, «¿» o «¡». */
function oraciones(t: string): string[] {
  return t.split(/(?<=[.?!])\s+(?=[¿¡\p{Lu}])/u).filter((x) => /\p{L}/u.test(x));
}

export interface PreguntaVoz {
  texto: string;
  /** Es una pregunta (termina en «?»). */
  pregunta: boolean;
  /** Hubo que cortarla (no cabía entera). */
  cortada: boolean;
  /** Empieza en el «¿» porque la oración entera no cabía («Cuando mandas la foto…, ¿quieres…?» → «¿Quieres…?»). */
  desdeSigno: boolean;
  palabras: number;
}

/** Un texto entre comillas: «…», “…”, „…“ o "…". */
const CITA = /«[^«»]*»|“[^“”]*”|„[^„“”]*[“”]|"[^"]*"/gu;

/**
 * Lo que va entre comillas no pregunta nada (JST-254): es el nombre de una
 * casilla o lo que dice la pantalla. «Casilla «¿Es usuario invitado?»
 * sincronizada» → «Casilla «Es usuario invitado» sincronizada»; «la línea «¿No
 * le llegó? Podrá reenviarlo»» → «la línea «No le llegó podrá reenviarlo»».
 * Si todo el texto está entre comillas, queda igual.
 */
export function sinPreguntasCitadas(texto: string): string {
  if (!/[¿?¡!]/u.test(texto) || !/\p{L}/u.test(texto.replace(CITA, "").replace(CODIGO, ""))) return texto;
  return texto.replace(CITA, (cita) => {
    const dentro = cita.slice(1, -1);
    if (!/[¿?¡!]/u.test(dentro)) return cita;
    const limpio = dentro
      .replace(/[¿¡]/gu, "")
      // Lo que termina adentro sigue sin signo, para que no se corte ahí («…la línea No le llegó?»): «¿No le llegó? Podrá…» → «No le llegó podrá…».
      .replace(/\s*[?!.]+\s+(\p{Lu})(?=\p{Ll})/gu, (_m, letra: string) => ` ${letra.toLowerCase()}`)
      .replace(/\s*[?!]+/gu, "")
      .trim();
    return `${cita[0]}${limpio}${cita[cita.length - 1]}`;
  });
}

/**
 * La pregunta breve de una tarjeta (0.8.0): sin códigos, paréntesis, markdown
 * ni emojis; la primera pregunta, o la primera oración si no hay; si es muy
 * larga y la pregunta empieza más adentro («Cuando mandas la foto…, ¿quieres
 * que…?»), desde el «¿»; cortada como `tareaParaVoz`. Una pregunta termina en
 * «?» y empieza con «¿»; la que va entre comillas no cuenta
 * (`sinPreguntasCitadas`). `null` si no queda nada que decir.
 */
export function analizarPregunta(texto: string | null | undefined, topes: Topes = TOPES_AVISO): PreguntaVoz | null {
  const t = limpiar(sinPreguntasCitadas(String(texto ?? "").replace(ETIQUETA, "")));
  if (!/\p{L}/u.test(t)) return null;
  const todas = oraciones(t);
  let o = todas.find((x) => x.includes("?")) ?? todas[0] ?? t;
  const cabe = (x: string) => x.split(" ").length <= topes.palabras && x.replace(/[\s,;:]+$/, "").length <= topes.letras;
  const desde = o.indexOf("¿");
  const desdeSigno = desde > 0 && !cabe(o);
  if (desdeSigno) o = o.slice(desde);
  let pregunta = o.includes("?") || o.startsWith("¿");
  if (pregunta) o = o.slice(0, o.indexOf("?") < 0 ? undefined : o.indexOf("?") + 1);
  else {
    pregunta = INTERROGATIVAS.test(o);
    o = o.replace(/[.!]+$/, "");
  }
  if (!/\p{L}/u.test(o)) return null;
  // Con su «¿…?» (si cabe entera, «¿Por qué?» no pierde el «qué»); el «¿» que abre más adentro («Hotfix de web-admin: ¿commit y PR?») queda donde estaba.
  const cortado = cortarNatural(o, topes);
  if (!/\p{L}/u.test(cortado)) return null;
  const sinSignos = (x: string) => x.replace(/[¿?]/g, "").trim();
  const cortada = sinSignos(cortado) !== sinSignos(o);
  let r = cortado.replace(/^([¿¡]*)(\p{L})/u, (_m, signo: string, letra: string) => `${signo}${letra.toUpperCase()}`);
  if (pregunta) {
    r = r.replace(/\?+$/, "");
    if (!r.includes("¿")) r = `¿${r}`;
    r = `${r}?`;
  }
  return { texto: r, pregunta, cortada, desdeSigno, palabras: r.split(" ").length };
}

/** El texto de `analizarPregunta`, o «» si no queda nada. */
export function preguntaParaVoz(texto: string | null | undefined, topes: Topes = TOPES_AVISO): string {
  return analizarPregunta(texto, topes)?.texto ?? "";
}
