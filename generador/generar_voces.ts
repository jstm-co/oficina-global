// Genera, una vez y en esta Mac, los audios de las voces de la Oficina
// (JST-124). La página solo los reproduce: no carga modelos ni sale a internet.
//
// - Lee (solo GET) los agentes de todas las empresas de la instancia, le da a
//   cada uno su voz (las 9 repartidas, ver `plan.ts`) y arma todas las frases
//   que la Oficina puede decir, con los mismos textos que la página.
// - Genera solo lo que falta: cada audio se guarda por voz + texto. Correrlo de
//   nuevo cuando llega un agente o cambia un nombre hace solo lo nuevo.
// - Un motor a la vez, cada uno en su propio proceso (con `uv`), que libera la
//   memoria al terminar: Edge, Kokoro, Qwen3 y Chatterbox.
// - Deja MP3 de 48 kbit/s, sin silencio en las puntas y todos al mismo volumen
//   (~−19 LUFS), en `<plugin>/dist/ui/voces/`, con `indice.json`. El host los
//   sirve con la UI: sumar un agente no obliga a sacar otra versión.
// - 0.13.0 (issue #9): las voces se preparan también desde la oficina, sin este
//   comando. Los audios quedan en la carpeta de datos del usuario
//   (`src/almacenVoces.ts`) y se publican en `dist/ui/voces/`, así que una
//   actualización desde npm ya no se los lleva. Supertonic corre con Node (WAV,
//   sin `uv` ni ffmpeg). Sin `--motores`, usa los elegidos en la oficina (o, si
//   nunca se eligieron, los 4 de siempre).
//
// Uso, desde la carpeta del plugin (después de `npm run build`):
//   node dist/generar_voces.mjs --api http://127.0.0.1:3210 --sesion <sesion.json>   # la copia
//   node dist/generar_voces.mjs --api http://192.0.2.15:3100                         # la real, con ~/.paperclip/auth.json
// Opciones: --plugin <carpeta> (por omisión, esta) · --motores supertonic,edge,kokoro,qwen3,chatterbox · --solo-plan · --tabla <archivo.md>
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { carpetaAlmacen, despublicar, prepararAlmacen, publicar } from "../src/almacenVoces.js";
import { grupoDe, leerEleccion, vocesDe, type GrupoMotor } from "../src/eleccionVoces.js";
import { claveAudio, leerIndice, VOCES, VOZ_RESUMEN, type IndiceVoces, type Motor } from "../src/voces.js";
import { bajarModelo, comandoMotor, datosDeVoz, dejarListo, hayModelo, modeloKokoro, MODELO_SUPERTONIC, pesoModelo, PRUEBA_FFMPEG, revisar } from "./motores.js";
import { asignarVoces, plan, type AgentePlan, type Trabajo } from "./plan.js";
import { paraDecir } from "./pronunciar.js";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]!;
  if (!a.startsWith("--")) continue;
  const sig = process.argv[i + 1];
  if (sig && !sig.startsWith("--")) {
    args.set(a.slice(2), sig);
    i++;
  } else args.set(a.slice(2), "1");
}
const API = (args.get("api") ?? "").replace(/\/+$/, "").replace(/\/api$/, "");
if (!API) throw new Error("falta --api (por ejemplo, --api http://127.0.0.1:3210)");
const PLUGIN = resolve(args.get("plugin") ?? REPO);
/** Donde se escriben los audios (0.13.0, fuera del plugin) y donde los sirve Paperclip. */
const DIR = carpetaAlmacen(PLUGIN);
const PUBLICO = join(PLUGIN, "dist", "ui", "voces");
const ORDEN: readonly Motor[] = ["supertonic", "edge", "kokoro", "qwen3", "chatterbox"];
/** Hasta la 0.12, sin `--motores` iban estos 4 (y así sigue si nunca se eligieron en la oficina). */
const DE_SIEMPRE: readonly Motor[] = ["edge", "kokoro", "qwen3", "chatterbox"];

function encabezados(): Record<string, string> {
  const sesion = args.get("sesion");
  if (sesion) {
    const cookies = (JSON.parse(readFileSync(sesion, "utf8")) as { cookies: Array<{ name: string; value: string }> }).cookies;
    return { Cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; ") };
  }
  const auth = JSON.parse(readFileSync(args.get("auth") ?? join(homedir(), ".paperclip", "auth.json"), "utf8")) as { credentials?: Record<string, { token?: string }> };
  const token = auth.credentials?.[API]?.token;
  if (!token) throw new Error(`sin sesión para ${API}: usa --sesion o inicia sesión con el CLI (paperclipai auth login)`);
  return { Authorization: `Bearer ${token}` };
}

async function get<T>(ruta: string): Promise<T> {
  const r = await fetch(`${API}/api${ruta}`, { headers: encabezados() });
  if (!r.ok) throw new Error(`GET ${ruta} -> ${r.status}`);
  return (await r.json()) as T;
}

async function agentes(): Promise<AgentePlan[]> {
  const lista: AgentePlan[] = [];
  for (const e of await get<Array<{ id: string; name: string }>>("/companies")) {
    for (const a of await get<Array<{ id: string; name: string; status: string; createdAt: string }>>(`/companies/${e.id}/agents`)) {
      if (a.status !== "terminated") lista.push({ id: a.id, nombre: a.name, empresa: e.name, creado: a.createdAt });
    }
  }
  return lista;
}

interface Resultado {
  frases: number;
  hechas: number;
  fallas: string[];
  segundos: number;
  /** Lo que tardó en cargar el modelo y la mediana por frase (con los reintentos), en segundos. */
  carga?: number;
  porFrase?: number;
}

async function generar(m: Motor, pendientes: Trabajo[], alHacer: (t: Trabajo) => void): Promise<Resultado> {
  const t0 = Date.now();
  const tmp = mkdtempSync(join(tmpdir(), `oficina-voces-${m}-`));
  const porSalida = new Map<string, Trabajo>();
  const trabajos = pendientes
    .map((t) => {
      const salida = join(tmp, t.archivo.replace(/\.(mp3|wav)$/, m === "edge" ? ".edge.mp3" : ".wav"));
      porSalida.set(salida, t);
      return { texto: paraDecir(t.texto, m), salida, ...datosDeVoz(REPO, m, t.voz.clave) };
    })
    // Chatterbox prepara la voz de referencia una vez: juntas las de cada voz.
    .sort((a, b) => a.referencia.localeCompare(b.referencia));
  const archivo = join(tmp, "trabajos.json");
  writeFileSync(archivo, JSON.stringify(trabajos));
  const res: Resultado = { frases: pendientes.length, hechas: 0, fallas: [], segundos: 0 };
  const tiempos: number[] = [];
  const { programa, args: argumentos } = comandoMotor(REPO, m, archivo);
  const hijo = spawn(programa, argumentos, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  let error = "";
  hijo.stderr.on("data", (b: Buffer) => (error = `${error}${b.toString()}`.slice(-2000)));
  for await (const linea of createInterface({ input: hijo.stdout })) {
    let r: { salida?: string; error?: string; carga_s?: number; s?: number };
    try {
      r = JSON.parse(linea) as typeof r;
    } catch {
      continue;
    }
    if (r.carga_s !== undefined) {
      res.carga = r.carga_s;
      console.log(`  ${m}: modelo cargado en ${r.carga_s} s`);
    }
    if (r.s !== undefined && !r.error) tiempos.push(r.s);
    const t = r.salida ? porSalida.get(r.salida) : undefined;
    if (!t) continue;
    if (r.error) {
      res.fallas.push(`${t.voz.id} «${t.texto}»: ${r.error}`);
      continue;
    }
    try {
      dejarListo(m, r.salida!, join(DIR, t.archivo));
      publicar(DIR, PUBLICO, t.archivo);
      res.hechas++;
      alHacer(t);
      if (res.hechas % 10 === 0) console.log(`  ${m}: ${res.hechas} de ${res.frases}`);
    } catch (e) {
      res.fallas.push(`${t.voz.id} «${t.texto}»: ${(e as Error).message}`);
    }
  }
  const codigo = await new Promise<number | null>((ok) => (hijo.exitCode !== null ? ok(hijo.exitCode) : hijo.on("close", ok)));
  if (codigo !== 0) res.fallas.push(`${m} terminó con ${codigo}: ${error.trim().split("\n").slice(-3).join(" ")}`);
  rmSync(tmp, { recursive: true, force: true });
  res.segundos = Math.round((Date.now() - t0) / 1000);
  tiempos.sort((a, b) => a - b);
  if (tiempos.length) res.porFrase = tiempos[Math.floor(tiempos.length / 2)];
  return res;
}

// ---------------------------------------------------------------------------

function guardarIndice(indice: IndiceVoces): void {
  writeFileSync(join(DIR, "indice.json.parcial"), JSON.stringify(indice));
  renameSync(join(DIR, "indice.json.parcial"), join(DIR, "indice.json"));
  publicar(DIR, PUBLICO, "indice.json");
}

if (!existsSync(join(PLUGIN, "dist", "ui"))) throw new Error(`${PLUGIN} no tiene dist/ui: corre npm run build en el plugin primero`);
// Lo de antes de la 0.13.0 (en `dist/ui/voces/`) pasa a la carpeta de datos, y todo queda publicado.
const almacen = prepararAlmacen(DIR, PUBLICO);
console.log(`audios en ${DIR}${almacen.adoptado ? " (se trajeron los que había en dist/ui/voces)" : ""}`);
const previo = existsSync(join(DIR, "indice.json")) ? leerIndice(JSON.parse(readFileSync(join(DIR, "indice.json"), "utf8"))) : null;
const elegidos = existsSync(join(DIR, "eleccion.json")) ? leerEleccion(JSON.parse(readFileSync(join(DIR, "eleccion.json"), "utf8"))).motores : null;
const MOTORES: readonly Motor[] = args.get("motores")
  ? args.get("motores")!.split(",").filter((m): m is Motor => (ORDEN as readonly string[]).includes(m))
  : elegidos
    ? ORDEN.filter((m) => elegidos.includes(grupoDe(m)))
    : DE_SIEMPRE;
const grupos = [...new Set(MOTORES.map(grupoDe))] as GrupoMotor[];
const lista = await agentes();
// Los nuevos reciben una voz de los motores que se van a correr.
const voces = asignarVoces(previo?.agentes ?? {}, lista, vocesDe(grupos));
// 0.11.0 (JST-325): la voz de los «3 agentes te necesitan» es la que el usuario eligió para el Resumen (la que ya está en el índice).
const vozResumen = previo?.resumen ?? VOZ_RESUMEN;
const todos = plan(lista, voces, vozResumen, vocesDe(grupos));
const hecho = (t: Trabajo) => existsSync(join(DIR, t.archivo));
const indice: IndiceVoces = { version: 1, generado: new Date().toISOString(), resumen: vozResumen, agentes: voces, audios: {} };
for (const t of todos) if (hecho(t)) indice.audios[claveAudio(t.voz.id, t.texto)] = t.archivo;

const tabla = [
  "| Empresa | Agente | Voz |",
  "|---|---|---|",
  ...[...lista].sort((a, b) => a.empresa.localeCompare(b.empresa) || a.nombre.localeCompare(b.nombre)).map((a) => `| ${a.empresa} | ${a.nombre} | ${VOCES.find((v) => v.id === voces[a.id])!.nombre} |`),
].join("\n");
if (args.get("tabla")) writeFileSync(args.get("tabla")!, `${tabla}\n`);
const faltan = todos.filter((t) => !hecho(t));
console.log(`${lista.length} agentes, ${todos.length} frases; faltan ${faltan.length}: ${ORDEN.map((m) => `${m} ${faltan.filter((t) => t.voz.motor === m).length}`).join(", ")}`);
console.log(VOCES.map((v) => `${v.nombre} ${Object.values(voces).filter((x) => x === v.id).length}`).join(" · "));

if (args.has("solo-plan")) {
  console.log(tabla);
  process.exit(0);
}

if (faltan.some((t) => MOTORES.includes(t.voz.motor) && t.voz.motor !== "supertonic")) {
  revisar("uv", ["--version"], "Instálalo: https://docs.astral.sh/uv/");
  // Un MP3 de prueba como los de `convertir`.
  revisar("ffmpeg", PRUEBA_FFMPEG, "Con Homebrew: brew reinstall ffmpeg (o brew install ffmpeg si no está)");
}
guardarIndice(indice);
const resumen: Record<string, Resultado> = {};
for (const m of MOTORES) {
  const pendientes = faltan.filter((t) => t.voz.motor === m);
  if (pendientes.length === 0) continue;
  if (m === "kokoro") await modeloKokoro();
  if (m === "supertonic" && !hayModelo(MODELO_SUPERTONIC)) {
    console.log(`bajando Supertonic (Hugging Face, ${Math.round(pesoModelo(MODELO_SUPERTONIC) / 1e6)} MB, una vez)…`);
    let ultimo = -1;
    await bajarModelo(MODELO_SUPERTONIC, (b, total) => {
      const p = Math.floor((b / total) * 10) * 10;
      if (p !== ultimo) console.log(`  ${(ultimo = p)} %`);
    });
  }
  console.log(`${m}: ${pendientes.length} frases…`);
  resumen[m] = await generar(m, pendientes, (t) => {
    indice.audios[claveAudio(t.voz.id, t.texto)] = t.archivo;
  });
  // Después de cada motor, para que lo hecho ya se pueda usar aunque el siguiente falle.
  guardarIndice(indice);
  const r = resumen[m]!;
  console.log(`${m}: ${r.hechas} de ${r.frases} en ${r.segundos} s${r.porFrase !== undefined ? ` (${r.porFrase} s por frase)` : ""}${r.fallas.length ? `; ${r.fallas.length} fallas` : ""}`);
  for (const f of r.fallas) console.log(`  ✗ ${f}`);
}

// Lo que ya no se usa (un agente que se fue o cambió de nombre) se borra. Las frases que prepara el worker al
// momento (0.5.0) van en su carpeta, `vivo/`, y las limpia el worker.
const usados = new Set(Object.values(indice.audios));
let borrados = 0;
for (const f of readdirSync(DIR)) {
  if (/\.(mp3|wav)$/.test(f) && !usados.has(f)) {
    rmSync(join(DIR, f));
    despublicar(PUBLICO, f);
    borrados++;
  }
}
const mp3 = readdirSync(DIR).filter((f) => /\.(mp3|wav)$/.test(f));
const bytes = mp3.reduce((s, f) => s + statSync(join(DIR, f)).size, 0);
console.log(JSON.stringify({ audios: mp3.length, mb: Math.round(bytes / 1e5) / 10, borrados, motores: resumen }, null, 1));
