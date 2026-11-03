// La voz de la oficina en la página y el TV (0.6.0, design-spec de JST-225, A
// · Dos listas, con la opción C del spike de JST-224): lo que la vida cuenta
// (`HechoVoz`) suena con la voz de cada agente, una voz a la vez (`TurnoVoz`).
//
// - La conversación con voz: la vida la prepara un minuto antes; aquí se le
//   piden al worker sus audios (todas sus frases juntas), se bajan y se le
//   avisa a la vida cuánto dura cada uno. Si alguno no se puede hacer, se le
//   avisa y prepara otra. Cada frase suena cuando aparece su globo.
// - La frase suelta, la mascota y la entrega suenan si su audio ya está (o
//   llega en un momento) y les toca el turno; si no, se botan. Su audio se pide
//   igual, para la próxima vez. La entrega en la mesa espera sus audios
//   mientras están juntos (JST-237); la hora, su audio y el canal hasta 30 s.
// - Los avisos pasan primero: cuando uno empieza a sonar (aquí o en otra
//   pestaña) lo de la oficina se calla en 150 ms, y si era una conversación, lo
//   que le queda se ve sin voz.
// - El 🔊 (`useMarcaVoz`) va en el globo que suena mientras suena su audio;
//   para los avisos, en «✓ listo» o en la mano.
// - Apagado no gasta nada: sin las voces o sin su casilla, la vida no le cuenta
//   nada de ese tipo y aquí no se pide ningún audio. El widget no habla.
import { useSyncExternalStore } from "react";
import { accionPlugin } from "../fuentes.js";
import { ESPERA_HORA_MS, TurnoVoz, type LoOficina, type Ocupa } from "../turnoVoz.js";
import { VOZ_EXTRA_MS, type HechoVoz, type TipoMascota, type Vida, type VozVida } from "../vida.js";
import { archivoVivo, duracionAudio, vozDeAgente, type IndiceVoces } from "../voces.js";
import { conLetras, horaParaVoz, paraLeer, pedidosDeCharla, textoOficina, VOCES_MASCOTA, type PedidoOficina } from "../vozOficina.js";
import { DICEN } from "../charlas.js";
import { ajustes, alCambiarAjustes, leeOficina, type TipoLeer } from "./ajustes.js";
import { archivoDeBlob, cargarIndice, instalacion, pedirArchivo, yaBajado } from "./audiosVoces.js";
import { alCambiarAvisos, alHablarAviso, audioDesbloqueado, avisoActivo, callarOficina, cuandoSeDesbloquee, tocarOficina } from "./sonido.js";
import { escucharVoz, publicarVoz } from "./vigia.js";
import { estadoVozViva } from "./vozViva.js";

/** Lo más que se espera un audio que debería estar (la frase suelta, la mascota) antes de botarla. */
const ESPERA_ARCHIVO_MS = 1_000;
/** La entrega con sobre: su audio tiene hasta 3 s (lo que vuela el sobre). */
const ESPERA_SOBRE_MS = 3_000;
/** La entrega en la mesa: lo que el worker tiene para preparar sus audios mientras caminan (después esta pestaña los baja). */
const ESPERA_MESA_MS = 10_000;
/** Lo que dicen las mascotas: lo que se espera al worker la primera vez (son 9 frases cortas de Edge). */
const ESPERA_MASCOTAS_MS = 20_000;
/** «¡Dale!» va a los 1,5 s, o cuando termina quien entrega (JST-225 §4). */
const DALE_MS = 1_500;
/** Un aviso de otra pestaña que no avisó que terminó (se cerró): se da por terminado a los 30 s. */
const AVISO_AJENO_MS = 30_000;
/** Si el worker no puede hacer nada (sin `uv` o `ffmpeg` en esta Mac), lo de la oficina no se lee en 5 min: no se le sigue pidiendo. */
const SIN_WORKER_MS = 5 * 60_000;
let sinWorkerHasta = 0;

/** Una sola por pestaña: la vigía y la Oficina pueden estar en pestañas distintas (eso llega por `escucharVoz`). */
export const turno = new TurnoVoz();

// ---------------------------------------------------------------------------
// El 🔊 de quien habla (JST-225 §2)
// ---------------------------------------------------------------------------

/** Qué globo lleva el 🔊: el de la frase que suena. */
export interface MarcaVoz {
  tipo: "charla" | "suelta" | "mascota" | "entrega" | "sobre" | "hora" | "listo" | "mano";
  /** `charla`: «<id>:<frase>»; `suelta`: «t:<id>»; `mascota`: su id; `entrega`: «e:<id>:de» o «e:<id>:a»; `sobre`: «s:<id>»; los demás: el agente. */
  clave: string;
}

let marca: MarcaVoz | null = null;
let relojMarca: ReturnType<typeof setTimeout> | null = null;
const oyentesMarca = new Set<() => void>();

function fijarMarca(m: MarcaVoz | null, ms: number | null = null): void {
  if (relojMarca) clearTimeout(relojMarca);
  relojMarca = m && ms !== null ? setTimeout(() => fijarMarca(null), ms) : null;
  if (m?.tipo === marca?.tipo && m?.clave === marca?.clave) return;
  marca = m;
  // Fuera del dibujo en curso: la vida le cuenta cosas a la voz también mientras React dibuja el piso.
  queueMicrotask(() => {
    for (const o of oyentesMarca) o();
  });
}

const esLaMarca = (m: MarcaVoz) => marca?.tipo === m.tipo && marca.clave === m.clave;

export function useMarcaVoz(): MarcaVoz | null {
  return useSyncExternalStore(
    (o) => {
      oyentesMarca.add(o);
      return () => oyentesMarca.delete(o);
    },
    () => marca,
  );
}

/** Para el banco y las pruebas en la copia: qué suena ahora. */
export function marcaVoz(): MarcaVoz | null {
  return marca;
}

/** Lo que sonó (los últimos 300), para las pruebas en la copia: cuándo, qué globo, de qué archivo y cuánto duró. */
const registro: Array<{ t: number; tipo: MarcaVoz["tipo"]; clave: string; archivo: string | null; ms: number | null }> = [];

/** El audio ya puede sonar en esta pestaña (hubo un toque). */
export function useAudioDesbloqueado(): boolean {
  return useSyncExternalStore(cuandoSeDesbloquee, audioDesbloqueado, () => false);
}

// ---------------------------------------------------------------------------
// Los avisos pasan primero
// ---------------------------------------------------------------------------

const pisos = new Set<VozDePiso>();
let avisoLocal = false;
let avisoAjenoHasta = 0;
let relojAjeno: ReturnType<typeof setTimeout> | null = null;

/** Lo que estaba sonando en esta pestaña se calla (lo cortó un aviso o la mascota que tocas). */
function cortar(o: Ocupa, ms = 150): void {
  callarOficina(ms);
  fijarMarca(null);
  publicarVoz({ t: "oficina", o: null });
  for (const p of pisos) p.cortado(o);
}

function revisarAvisos(): void {
  const activo = avisoLocal || Date.now() < avisoAjenoHasta;
  const cortado = turno.avisos(activo);
  if (cortado) cortar(cortado);
}

/** Lo que suena ahora y su tipo del panel: si se apaga su casilla (o las voces), se calla. */
const TIPO_DE: Readonly<Record<LoOficina, TipoLeer>> = { charla: "charlas", mascota: "mascotas", entrega: "entregas", suelta: "sueltas", hora: "hora" };

if (typeof window !== "undefined") {
  alCambiarAvisos((activo) => {
    avisoLocal = activo;
    revisarAvisos();
  });
  escucharVoz((m) => {
    if (m.t === "avisos") {
      avisoAjenoHasta = m.activo ? Date.now() + AVISO_AJENO_MS : 0;
      if (relojAjeno) clearTimeout(relojAjeno);
      relojAjeno = m.activo ? setTimeout(revisarAvisos, AVISO_AJENO_MS + 50) : null;
      revisarAvisos();
    } else if (m.t === "oficina") turno.ajeno(m.o);
  });
  // El 🔊 de los avisos: en «✓ listo» (terminé) o en la mano (te necesito), mientras dura su voz.
  alHablarAviso((s) => {
    const tipo = s.frase === "fin" ? "listo" : s.frase === "toca" ? "mano" : null;
    if (!tipo || !s.agenteId) return;
    fijarMarca({ tipo, clave: s.agenteId }, s.voz ?? Math.max(0, s.hasta - Date.now()));
  });
  alCambiarAjustes(() => {
    const a = ajustes();
    const o = turno.actual();
    if (o && !leeOficina(a, TIPO_DE[o.lo])) {
      turno.termina(o.clave);
      cortar(o, 0);
    }
  });
}

// ---------------------------------------------------------------------------
// La voz de un piso (la página o el TV)
// ---------------------------------------------------------------------------

interface Preparando {
  companyId: string;
  pedidos: PedidoOficina[];
  blobs: Blob[] | null;
}

const espera = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));

/** Cuánto dura un audio (ms), de sus cuadros. */
async function duracionDe(b: Blob): Promise<number | null> {
  try {
    return duracionAudio(new Uint8Array(await b.arrayBuffer()));
  } catch {
    return null;
  }
}

/** El archivo de un pedido (o `null` si ese agente no tiene voz o no hay nada que decir). */
function archivoDe(p: PedidoOficina, indice: IndiceVoces): string | null {
  const voz = p.mascota ? VOCES_MASCOTA[p.mascota].id : vozDeAgente(indice, p.agenteId);
  const texto = textoOficina(p);
  return voz && texto ? archivoVivo(voz, texto) : null;
}

export class VozDePiso implements VozVida {
  private readonly preparando = new Map<number, Preparando>();
  /** Las conversaciones con voz que ya tomaron el turno una vez (al salir a juntarse). */
  private readonly empezadas = new Set<number>();
  private mascotasPedidas = false;
  /** Las horas que ya se dijeron (agente y tarea), y las que había al abrir. */
  readonly horasDichas = new Set<string>();

  constructor(private readonly vida: Vida) {}

  /** Se prende (la oficina a la vista, con las voces) o se apaga: apagada, se calla y suelta todo. */
  activar(on: boolean): void {
    if (on) {
      pisos.add(this);
      this.pedirMascotas();
      return;
    }
    pisos.delete(this);
    this.preparando.clear();
    const o = turno.actual();
    if (o) {
      turno.termina(o.clave);
      cortar(o, 0);
    }
  }

  lee(t: "charlas" | "entregas" | "mascotas" | "sueltas"): boolean {
    return Date.now() >= sinWorkerHasta && leeOficina(ajustes(), t);
  }

  libreParaCharla(): boolean {
    return turno.puede("charla");
  }

  /** Un aviso (o la mascota que tocas) cortó lo que sonaba: si era una conversación, lo que le queda va sin voz. */
  cortado(o: Ocupa): void {
    if (o.lo === "charla") this.vida.callarCharla(Number(o.clave.slice(2)));
  }

  private accion(companyId: string, pedidos: readonly PedidoOficina[], ms: number): Promise<{ estados: string[] } | null> {
    return instalacion()
      .then((id) => (id ? accionPlugin<{ estados: string[] }>({ base: "" }, id, "voz-oficina", companyId, { pedidos, ms }) : null))
      .catch(() => null)
      .then((r) => {
        // Todo «no»: si en esta Mac el worker no puede (sin `uv` o `ffmpeg`), se deja de pedir un rato.
        if (r && r.estados.length > 0 && r.estados.every((e) => e === "no")) {
          void estadoVozViva(companyId).then((e) => {
            if (e && !e.disponible) sinWorkerHasta = Date.now() + SIN_WORKER_MS;
          });
        }
        return r;
      });
  }

  /**
   * Le pide al worker esos audios (esperando hasta `ms`) y baja a esta pestaña los que ya están: cuando toque decirlos,
   * suenan al tiro aunque la Mac esté cargada (con carga ~50, bajar un MP3 en el momento tardaba más de 1 s y se botaba).
   */
  private async bajar(companyId: string, pedidos: readonly PedidoOficina[], ms: number): Promise<void> {
    const [r, indice] = await Promise.all([this.accion(companyId, pedidos, ms), cargarIndice()]);
    if (!r || !indice) return;
    pedidos.forEach((p, i) => {
      const archivo = r.estados[i] === "lista" ? archivoDe(p, indice) : null;
      if (archivo) void pedirArchivo(archivo);
    });
  }

  /** Empieza a sonar algo de la oficina con su 🔊; al terminar suelta el turno. `alEmpezar`: con lo que dura el audio. */
  private sonar(lo: LoOficina, clave: string, blob: Blob, m: MarcaVoz, o: { hasta: number; sola?: boolean; alEmpezar?: (ms: number) => void; alTerminar?: () => void }): void {
    const cortado = turno.empieza(lo, clave, o.hasta, { sola: o.sola });
    if (cortado) cortar(cortado);
    publicarVoz({ t: "oficina", o: { lo, clave, hasta: o.hasta, desde: Date.now() } });
    this.tocar(blob, m, (ms) => o.alEmpezar?.(ms), () => {
      if (lo !== "charla") {
        turno.termina(clave);
        if (!turno.actual()) publicarVoz({ t: "oficina", o: null });
      }
      o.alTerminar?.();
    });
  }

  /** Toca un audio con el 🔊 en su globo mientras suena. */
  private tocar(blob: Blob, m: MarcaVoz, alEmpezar: (ms: number) => void, alTerminar: () => void): void {
    const ok = tocarOficina(
      blob,
      (ms) => {
        fijarMarca(m);
        registro.push({ t: Date.now(), tipo: m.tipo, clave: m.clave, archivo: archivoDeBlob(blob), ms });
        if (registro.length > 300) registro.shift();
        alEmpezar(ms ?? 0);
      },
      () => {
        if (esLaMarca(m)) fijarMarca(null);
        alTerminar();
      },
    );
    if (!ok) alTerminar();
  }

  hecho(h: HechoVoz): void {
    switch (h.tipo) {
      case "preparar":
        this.preparando.set(h.id, { companyId: h.companyId, pedidos: pedidosDeCharla(h.lineas), blobs: null });
        void this.prepararCharla(h.id, Date.now() + h.plazo);
        return;
      case "soltar":
        this.preparando.delete(h.id);
        return;
      case "charla": {
        const clave = `c:${h.id}`;
        if (!this.preparando.get(h.id)?.blobs) {
          this.vida.callarCharla(h.id);
          return;
        }
        const hasta = Date.now() + h.ms;
        // La primera vez toma el turno (lo cuenta el tope de 1 por minuto); al juntarse, lo ajusta. Si se le venció
        // esperando su turno para caminar y otra cosa tomó el canal, lo que dice va sin voz.
        if (turno.actual()?.clave === clave) turno.alargar(clave, hasta);
        else if (!this.empezadas.has(h.id) || (!turno.ocupado() && !turno.avisoSonando())) {
          this.empezadas.add(h.id);
          turno.empieza("charla", clave, hasta);
        } else {
          this.vida.callarCharla(h.id);
          return;
        }
        publicarVoz({ t: "oficina", o: { lo: "charla", clave, hasta, desde: Date.now() } });
        return;
      }
      case "frase": {
        const blob = this.preparando.get(h.id)?.blobs?.[h.i];
        if (!blob || turno.actual()?.clave !== `c:${h.id}` || !this.lee("charlas")) {
          this.vida.callarCharla(h.id);
          return;
        }
        this.tocar(blob, { tipo: "charla", clave: `${h.id}:${h.i}` }, () => undefined, () => undefined);
        return;
      }
      case "fin-charla": {
        this.preparando.delete(h.id);
        this.empezadas.delete(h.id);
        const clave = `c:${h.id}`;
        if (turno.actual()?.clave === clave) {
          turno.termina(clave);
          publicarVoz({ t: "oficina", o: null });
          // Si la cortó otra cosa (alguien cambió de estado), su voz también.
          if (marca?.tipo === "charla" && marca.clave.startsWith(`${h.id}:`)) {
            callarOficina();
            fijarMarca(null);
          }
        }
        return;
      }
      case "suelta":
        void this.suelta(h);
        return;
      case "mascota":
        void this.mascota(h.id, h.texto, h.sola);
        return;
      case "entrega":
        void this.entrega(h);
        return;
    }
  }

  /**
   * Los audios de la conversación preparada: se le piden al worker (que hace
   * lo que falte) hasta el plazo, se bajan y la vida sabe cuánto dura cada uno.
   * Si alguno no se puede hacer, la vida prepara otra.
   */
  private async prepararCharla(id: number, plazo: number): Promise<void> {
    const pr = this.preparando.get(id);
    const indice = await cargarIndice();
    if (!pr || this.preparando.get(id) !== pr) return;
    const archivos = indice ? pr.pedidos.map((p) => archivoDe(p, indice)) : [];
    if (!indice || archivos.some((a) => !a)) {
      this.vida.preparadaNo(id);
      return;
    }
    // Lo que ya bajó esta pestaña no se vuelve a pedir; lo demás se le pregunta al worker (sin buscar a ciegas MP3 que no están).
    let listos = (await Promise.all(archivos.map((a) => yaBajado(a!)))).every(Boolean);
    while (!listos && Date.now() < plazo) {
      if (this.preparando.get(id) !== pr) return;
      const r = await this.accion(pr.companyId, pr.pedidos, Math.min(25_000, plazo - Date.now()));
      if (this.preparando.get(id) !== pr) return;
      if (!r) {
        await espera(2_000);
        continue;
      }
      if (r.estados.includes("no")) {
        this.vida.preparadaNo(id);
        return;
      }
      listos = r.estados.every((e) => e === "lista");
    }
    if (!listos) return;
    const blobs = await Promise.all(archivos.map((a) => pedirArchivo(a!)));
    if (this.preparando.get(id) !== pr) return;
    if (blobs.some((b) => !b)) {
      this.vida.preparadaNo(id);
      return;
    }
    const ms = await Promise.all(blobs.map((b) => duracionDe(b!)));
    if (this.preparando.get(id) !== pr) return;
    pr.blobs = blobs as Blob[];
    this.vida.preparadaLista(id, ms.map((x) => x ?? -1));
  }

  /**
   * Un audio que debería estar: el que ya bajó esta pestaña o, si el worker dice que está, lo baja (como mucho 1 s). Si
   * no está, el worker lo pone en su fila: con `esperar`, lo espera ese rato; si no, queda para la próxima vez.
   */
  private async buscar(p: PedidoOficina, companyId: string, esperar = 0): Promise<Blob | null> {
    const indice = await cargarIndice();
    const archivo = indice ? archivoDe(p, indice) : null;
    if (!archivo) return null;
    const ya = yaBajado(archivo);
    if (ya) return ya;
    const r = await this.accion(companyId, [p], esperar);
    if (r?.estados[0] !== "lista") return null;
    return Promise.race([pedirArchivo(archivo), espera(ESPERA_ARCHIVO_MS).then(() => null)]);
  }

  /**
   * Un audio de la entrega en la mesa: el que bajó esta pestaña (lo pidió al salir) o, si no está, se le pregunta al
   * worker y se espera hasta `hasta`. Desde el descanso se juntan en 1–3 s y una frase nueva tarda más (JST-237).
   */
  private async esperarMesa(p: PedidoOficina, companyId: string, hasta: number): Promise<Blob | null> {
    const indice = await cargarIndice();
    const archivo = indice ? archivoDe(p, indice) : null;
    if (!archivo) return null;
    const plazo = () => espera(Math.max(0, hasta - Date.now())).then(() => null);
    while (Date.now() < hasta) {
      const ya = yaBajado(archivo);
      const blob = ya ? await Promise.race([ya, plazo()]) : null;
      if (blob) return blob;
      const r = await this.accion(companyId, [p], Math.round(hasta - Date.now()));
      if (r?.estados[0] === "lista") return Promise.race([pedirArchivo(archivo), plazo()]);
      if (r?.estados[0] === "no") return null;
      // Sin respuesta del worker: se vuelve a preguntar.
      if (!r) await espera(Math.min(500, Math.max(0, hasta - Date.now())));
    }
    return null;
  }

  /** Una frase suelta: solo en un hueco y una por minuto; si su audio no está, se bota (y se pide para la próxima). */
  private async suelta(h: Extract<HechoVoz, { tipo: "suelta" }>): Promise<void> {
    const p: PedidoOficina = { clase: "suelta", agenteId: h.quien, texto: h.linea.texto, tarea: h.linea.codigo ? h.linea.titulo : null };
    const texto = textoOficina(p);
    if (!texto || !conLetras(paraLeer(texto)) || !turno.puede("suelta")) return;
    const t0 = Date.now();
    const blob = await this.buscar(p, h.companyId);
    if (!blob || !turno.puede("suelta") || !this.lee("sueltas") || Date.now() - t0 > h.ms - 500) return;
    const clave = `t:${h.id}`;
    this.sonar("suelta", clave, blob, { tipo: "suelta", clave }, {
      hasta: Date.now() + h.ms + 2_000,
      alEmpezar: (ms) => {
        turno.alargar(clave, Date.now() + ms + VOZ_EXTRA_MS);
        this.vida.alargarSuelta(h.id, ms + VOZ_EXTRA_MS);
      },
    });
  }

  /** Lo que dice una mascota: la que tocas, al tiro (corta lo de la oficina); la que despierta sola en el TV, en un hueco y cada 5 min. */
  private async mascota(id: TipoMascota, dice: string, sola: boolean): Promise<void> {
    if (!conLetras(paraLeer(dice))) return;
    if (sola ? !turno.puede("mascota", { sola: true }) : turno.avisoSonando()) return;
    this.pedirMascotas();
    const p: PedidoOficina = { clase: "mascota", agenteId: null, mascota: id, texto: dice };
    const t0 = Date.now();
    const blob = await this.buscar(p, this.vida.unaEmpresa() ?? "", sola ? 0 : 1_500);
    if (!blob || !this.lee("mascotas") || Date.now() - t0 > 1_600) return;
    if (sola ? !turno.puede("mascota", { sola: true }) : turno.avisoSonando()) return;
    this.sonar("mascota", `m:${id}`, blob, { tipo: "mascota", clave: id }, { hasta: Date.now() + 4_000, sola, alEmpezar: (ms) => this.vida.alargarMascota(id, ms + VOZ_EXTRA_MS) });
  }

  /**
   * Con «Mascotas» prendida, lo que dicen las 4 se pide una vez (son 9 frases,
   * con Edge): así la que tocas suena al tiro. Apagada, no se pide nada.
   */
  pedirMascotas(): void {
    if (this.mascotasPedidas || !pisos.has(this) || !this.lee("mascotas")) return;
    const companyId = this.vida.unaEmpresa();
    if (!companyId) return;
    this.mascotasPedidas = true;
    const todas = (Object.keys(DICEN) as TipoMascota[]).flatMap((m) => DICEN[m].filter((t) => conLetras(paraLeer(t))).map((t): PedidoOficina => ({ clase: "mascota", agenteId: null, mascota: m, texto: t })));
    void this.bajar(companyId, todas, ESPERA_MASCOTAS_MS);
  }

  /**
   * Una entrega: al salir se piden sus audios (quien entrega y, en la mesa,
   * «¡Dale!» de quien recibe); en la mesa suenan cuando se juntan, si el canal
   * está libre (o cuando lleguen, si caben antes de que se separen); con sobre,
   * cuando sale el sobre (si llega en 3 s).
   */
  private async entrega(h: Extract<HechoVoz, { tipo: "entrega" }>): Promise<void> {
    const de: PedidoOficina = { clase: h.como === "mesa" ? "entrega" : "sobre", agenteId: h.de, para: h.para, tarea: h.titulo };
    const dale: PedidoOficina = { clase: "dale", agenteId: h.a };
    if (h.fase === "sale" && h.como === "mesa") {
      // Mientras caminan a la mesa, el worker los prepara y esta pestaña los baja: al juntarse suenan al tiro.
      void this.bajar(h.companyId, [de, dale], ESPERA_MESA_MS);
      return;
    }
    if (h.como === "sobre") {
      const blob = await this.buscar(de, h.companyId, ESPERA_SOBRE_MS);
      if (!blob || !this.lee("entregas") || !turno.puede("entrega") || !this.vida.haySobre(h.id)) return;
      const clave = `s:${h.id}`;
      // El sobre (y su 🔊) sigue a la vista hasta que termina su frase + 0,4 s (JST-240).
      this.sonar("entrega", clave, blob, { tipo: "sobre", clave }, { hasta: Date.now() + 8_000, alEmpezar: (ms) => this.vida.alargarSobre(h.id, ms + VOZ_EXTRA_MS) });
      return;
    }
    // En la mesa, ya juntos. Si sus audios no alcanzaron a estar mientras caminaban, se esperan: cada uno suena si
    // termina 0,4 s antes de que se separen (`fin`), el canal sigue libre y no se cortó la entrega (JST-237).
    if (!turno.puede("entrega")) return;
    const fin = () => Date.now() + this.vida.restoJunta(h.id) - VOZ_EXTRA_MS;
    const cabe = async (b: Blob) => Date.now() + ((await duracionDe(b)) ?? 0) <= fin();
    const hasta = fin();
    const daleListo = this.esperarMesa(dale, h.companyId, hasta);
    const b1 = await this.esperarMesa(de, h.companyId, hasta);
    if (!b1 || !pisos.has(this) || !this.lee("entregas") || !turno.puede("entrega") || !(await cabe(b1))) return;
    const clave = `e:${h.id}`;
    const t0 = Date.now();
    this.sonar("entrega", clave, b1, { tipo: "entrega", clave: `e:${h.id}:de` }, {
      hasta: t0 + 9_000,
      alTerminar: () => {
        void espera(Math.max(0, t0 + DALE_MS - Date.now()))
          .then(() => Promise.race([daleListo, espera(Math.max(0, fin() - Date.now())).then(() => null)]))
          .then(async (b2) => {
            // La respuesta de la misma entrega va justo después, dentro de su turno.
            if (!b2 || !pisos.has(this) || !turno.puede("entrega", { clave }) || !this.lee("entregas") || !(await cabe(b2))) return;
            this.sonar("entrega", clave, b2, { tipo: "entrega", clave: `e:${h.id}:a` }, { hasta: Date.now() + 4_000 });
          });
      },
    });
  }

  /**
   * La hora estimada (§4): una vez por tarea, cuando aparece en su globo. Espera
   * su audio y el canal libre hasta 30 s; si no, no se lee.
   */
  async hora(agenteId: string, companyId: string, fin: number): Promise<void> {
    if (!leeOficina(ajustes(), "hora")) return;
    const hasta = Date.now() + ESPERA_HORA_MS;
    const p: PedidoOficina = { clase: "hora", agenteId, hora: horaParaVoz(fin, Date.now()) };
    const blob = await this.buscar(p, companyId, Math.min(25_000, ESPERA_HORA_MS - 2_000));
    if (!blob) return;
    while (Date.now() < hasta) {
      if (!pisos.has(this) || !leeOficina(ajustes(), "hora")) return;
      if (turno.puede("hora")) {
        this.sonar("hora", `h:${agenteId}`, blob, { tipo: "hora", clave: agenteId }, { hasta: Date.now() + 8_000 });
        return;
      }
      await espera(500);
    }
  }
}

/** Para las pruebas en la copia: si suena un aviso, qué ocupa el turno y lo que sonó. */
export function estadoVozOficina() {
  return { aviso: turno.avisoSonando() || avisoActivo(), actual: turno.actual(), marca, registro: [...registro] };
}

if (typeof window !== "undefined") (window as unknown as { __oficinaVoz?: typeof estadoVozOficina }).__oficinaVoz = estadoVozOficina;

