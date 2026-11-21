// El Resumen en la página (0.9.0, design-spec de JST-245, A · Menú y
// reproductor): uno por pestaña. Junta los datos, arma las frases, las hace
// escribir a la IA, las lee con la voz del Chief of staff y enciende la sala de
// la que habla. Lo dibujan `menuResumen.tsx` (el botón y el menú) y
// `reproductorResumen.tsx` (el reproductor y «Texto»).
//
// - Las opciones (`of-resumen-op`) y la hora en que se armó el último resumen
//   escuchado (`of-resumen-ultima`) quedan en el navegador (§9).
// - Con el resumen cerrado no se pide nada. Al abrir el menú se piden, por
//   empresa, lo terminado del período y las abiertas (para la cola y para subir
//   hasta el pedido de origen); lo que ya llegó sirve 1 min. Lo que la Oficina ya
//   tiene (lo que te toca y quién trabaja) se usa tal cual.
// - Lo que dura (la cabecera del menú) se cuenta con el pedido de origen de cada
//   tarea, como al leer (JST-262): al abrir el menú, cuando llega lo terminado y
//   la cola, se sube hasta él (`completarArbol`, como mucho 40 lecturas). Lo que
//   se lee de más arriba sirve 10 min, también para «Leer».
// - Al apretar «Leer»: los números, lo que te toca y el cierre salen al tiro;
//   lo que se hizo, quién trabaja y la cola, cuando se sabe el pedido de origen
//   de cada tarea.
// - Mientras lee (también en pausa), la Oficina calla: lo de la oficina y los
//   avisos, en esta pestaña y en las otras (`fijarResumenSonando`, y un latido a
//   las otras pestañas cada 10 s).
// - Sigue sonando al ir a otra página de Paperclip (el chip de una tarea): el
//   reproductor lo dibuja el botón de la barra de arriba, que está en todas.
// - Una voz a la vez con «Leer contexto» (JST-276, design-spec de JST-282 §7):
//   leer el contexto pausa el Resumen (y queda en pausa al terminar); si el
//   Resumen sigue o vuelve a leer, el contexto se calla (`alHablar`).
import { useSyncExternalStore } from "react";
import { rolesDeEmpresa } from "../avisos.js";
import { getLocale, localeTag, msg, opcionesHora, SOURCE_LOCALE, t } from "../i18n.js";
import type { AgenteOficina } from "../estado.js";
import { leerAbiertas, leerCadena, leerTerminadas, type Conexion, type FilaTarea } from "../fuentes.js";
import { agenteParaVoz, Arbol, armarDatos, completarArbol, contarPartes, elegidasDe, idsParaArbol, MAX_PADRES, tituloParaVoz, type DatosResumen, type EmpresaRes, type Insumos, type Nodo, type TareaViva } from "../resumen/datos.js";
import { duracionTotal, frasesDeSeccion, leerOpciones, seccionesDe, textoDuracion, type Contexto, type FraseResumen, type OpcionesResumen, type Seccion, type Titulo } from "../resumen/frases.js";
import { Lector } from "../resumen/lector.js";
import { diasAtras, explicacionDesde, inicioDe, nuevoDe, periodoTexto, type Desde } from "../resumen/tiempo.js";
import { calentarVoz, vozParaLeer } from "./eleccion.js";
import { escribirResumen, iaParaResumen, type RegistroIa } from "./resumenIa.js";
import { VozResumen } from "./resumenVoz.js";
import { audioDelResumen, fijarResumenSonando, resumenAjeno } from "./sonido.js";
import type { Oficina } from "./useOficina.js";
import { escucharVoz, publicarVoz } from "./vigia.js";

export const CLAVE_OPCIONES = "of-resumen-op";
export const CLAVE_ULTIMA = "of-resumen-ultima";

/**
 * Los nombres de las partes del resumen tal como se MUESTRAN (JST-413): mismo texto que `NOMBRE_SECCION` de
 * `resumen/frases.ts`, que no se toca (es de lo que se oye); aquí van marcados para traducir.
 */
const SECCION_MSG: Readonly<Record<Seccion, string>> = {
  intro: msg("Los números"),
  toca: msg("Lo que te toca"),
  hecho: msg("Lo que se hizo"),
  trabajan: msg("En qué trabajan"),
  cola: msg("Lo que está en cola"),
  cierre: msg("Para terminar"),
};
export const nombreSeccion = (s: Seccion): string => t(SECCION_MSG[s]);

/**
 * La explicación del menú («Desde cuándo») en el idioma de la interfaz (JST-413). En español es la de
 * `explicacionDesde`, que también abre el resumen hablado y por eso no pasa por `t()`; en otro idioma se arma aquí
 * con las mismas reglas.
 */
export function explicacionMenu(desde: Desde, ahora: number, ultima: number | null): string {
  if (getLocale() === SOURCE_LOCALE) return explicacionDesde(desde, ahora, ultima);
  const fecha = (ms: number, opciones: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(localeTag(), opciones).format(ms);
  switch (desde) {
    case "nuevo": {
      const n = nuevoDe(ultima, ahora);
      if (n.k === "primera") return t("Es la primera vez: te cuento lo de hoy");
      if (n.k === "semana") return t("Hace más de una semana: te cuento los últimos 7 días");
      const dias = diasAtras(n.ultima, ahora);
      const hora = { hour: "numeric", minute: "2-digit", ...opcionesHora() } as const;
      const cuando = fecha(n.ultima, dias <= 0 ? hora : dias < 7 ? { weekday: "long", ...hora } : { day: "numeric", month: "long", ...hora });
      return t("Desde {cuando}, la última vez que lo escuchaste", { cuando });
    }
    case "hoy":
      return t("Desde las 0:00 de hoy");
    case "24h":
      return t("Desde ayer a esta hora");
    case "7d":
      return t("Desde el {dia} pasado a esta hora", { dia: fecha(ahora, { weekday: "long" }) });
  }
}
/**
 * El encabezado del panel «Texto» (JST-413): en español, exactamente `periodoTexto` (que alimenta la voz);
 * en otro idioma, se arma con `t()`. Ese encabezado no se oye.
 */
export function periodoEncabezado(desde: Desde, ahora: number, ultima: number | null): string {
  if (getLocale() === SOURCE_LOCALE) return periodoTexto(desde, ahora, ultima);
  if (desde === "nuevo") {
    const n = nuevoDe(ultima, ahora);
    if (n.k === "primera") return t("Lo de hoy, la primera vez que lo escuchas");
    if (n.k === "semana") return t("Los últimos 7 días");
  }
  return explicacionMenu(desde, ahora, ultima);
}
/** Lo leído al abrir el menú sirve este rato (después se vuelve a pedir). */
export const FRESCO_MS = 60_000;
/** Lo leído de más arriba (el pedido de origen) sirve este rato; lo que no se pudo leer, `FRESCO_MS`. */
export const PADRES_MS = 10 * 60_000;
/** Cada cuánto se les recuerda a las otras pestañas que suena el Resumen (y hasta cuándo, si esta se cierra sin avisar). */
const LATIDO_MS = 10_000;
const LATIDO_VALE_MS = 15_000;

const cx: Conexion = { base: "" };

interface Carga {
  terminadas?: { desde: number; filas: FilaTarea[]; en: number };
  abiertas?: { filas: FilaTarea[]; en: number };
  /** La última lectura falló (y desde cuándo). */
  error?: number;
}

/** Los números del menú (§2): `null` mientras llegan, y también si no responde ninguna (entonces van sin número, JST-262). */
export interface NumerosMenu {
  toca: number | null;
  trabajan: number | null;
  hecho: number | null;
  cola: number | null;
  /** «~1 min» (o `null` mientras faltan datos o se sube hasta el pedido de origen). */
  dura: string | null;
  /** Lo mismo en ms, como «Listo · 3:42» (para la QA). */
  duraMs: number | null;
  /** La explicación de «desde cuándo», sin el número. */
  explicacion: string;
  /** Prefijos de las empresas que no responden. */
  fallan: string[];
  /** No responde ninguna de las elegidas. */
  ninguna: boolean;
  /** Se está pidiendo algo (al abrir el menú o con «Reintentar»). */
  pidiendo: boolean;
}

function leerJson(clave: string): unknown {
  try {
    const t = localStorage.getItem(clave);
    return t ? (JSON.parse(t) as unknown) : null;
  } catch {
    return null;
  }
}

function guardar(clave: string, valor: unknown): void {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    // Sin almacenamiento local: vale para esta pestaña.
  }
}

/** Las empresas que el usuario ve (las que tienen sala y las que no, como Personal), en el orden de la Oficina. */
export function empresasDe(o: Pick<Oficina, "empresas" | "ocultas">): EmpresaRes[] {
  return [...o.empresas, ...o.ocultas].map((e) => ({ id: e.id, prefijo: e.prefijo, nombre: e.nombre })).sort((a, b) => a.prefijo.localeCompare(b.prefijo));
}

const normal = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

/** La empresa con que se le habla al worker de las voces (el host revisa que el usuario la vea): la primera con sala, o la primera. */
function companyIdDeVoz(o: Pick<Oficina, "empresas" | "ocultas">): string | null {
  const empresas = empresasDe(o);
  return empresas.find((e) => o.empresas.some((x) => x.id === e.id))?.id ?? empresas[0]?.id ?? null;
}

const esCelular = () => typeof window !== "undefined" && !!window.matchMedia?.("(max-width: 767px)").matches;

interface Diferida<T> {
  promesa: Promise<T>;
  ok: (v: T) => void;
}
function diferida<T>(): Diferida<T> {
  let ok!: (v: T) => void;
  const promesa = new Promise<T>((r) => (ok = r));
  return { promesa, ok };
}

export class ControlResumen {
  op: OpcionesResumen = leerOpciones(leerJson(CLAVE_OPCIONES));
  ultima: number | null = (() => {
    const u = leerJson(CLAVE_ULTIMA);
    return typeof u === "number" && Number.isFinite(u) ? u : null;
  })();
  version = 0;
  oficina: Oficina | null = null;
  readonly carga = new Map<string, Carga>();
  private readonly enCamino = new Map<string, Promise<void>>();
  /** Cambia con cada lectura de lo terminado o de las abiertas (o su error). */
  private versionCarga = 0;
  /** Las tareas de más arriba ya leídas (`leerCadena`), para el menú y para «Leer», y hasta cuándo sirven. */
  private readonly padres = new Map<string, { nodo: Nodo; hasta: number }>();
  /** Con qué lectura y opciones ya se subió hasta el pedido de origen para el menú (`claveMenu`), y con cuál se está subiendo. */
  private subidoPara = "";
  private subiendoPara = "";
  lector: Lector | null = null;
  voz: VozResumen | null = null;
  /** «Texto» abierto (§5). */
  texto = false;
  /** Cuándo se armó el resumen que suena (lo que se guarda como «la última vez», §9). */
  armadoEn = 0;
  /** El período del resumen que suena, para «Texto». */
  periodo: { desde: OpcionesResumen["desde"]; ahora: number; ultima: number | null } | null = null;
  /** Las empresas elegidas que no respondieron en el resumen que suena (§8). */
  fallanResumen: EmpresaRes[] = [];
  /** Quién escribe el resumen que suena. */
  conIa = false;
  /** «Leer contexto» está cargando o leyendo: en pausa, el reproductor dice «En pausa · lees el contexto» (JST-276). */
  contextoLee = false;
  /** Lo que se calla justo antes de que el Resumen diga una frase («Leer contexto»). */
  private readonly callarAntes = new Set<() => void>();
  readonly registroIa: RegistroIa[] = [];
  private readonly oyentes = new Set<() => void>();
  private abortar: AbortController | null = null;
  private sonandoAntes = false;
  private latido: ReturnType<typeof setInterval> | null = null;
  private guardadoFin = false;
  private focoAntes = "";
  private firmaOficina = "";

  suscribir = (o: () => void): (() => void) => {
    this.oyentes.add(o);
    return () => this.oyentes.delete(o);
  };

  avisar(): void {
    this.version += 1;
    this.revisarSonando();
    this.aplicarFoco();
    for (const o of this.oyentes) o();
  }

  /** La página le pasa la Oficina en cada pasada (no pide nada). */
  fijarOficina(o: Oficina): void {
    this.oficina = o;
    const firma = `${o.agentes.reduce((n, a) => n + a.teNecesita.length, 0)}:${o.agentes.filter((a) => a.base === "trabajando").length}:${o.empresas.length}:${o.caidas.length}`;
    if (firma !== this.firmaOficina) {
      this.firmaOficina = firma;
      this.avisar();
    }
  }

  // -------------------------------------------------------------------------
  // Las opciones y los números del menú
  // -------------------------------------------------------------------------

  cambiarOpciones(cambio: Partial<OpcionesResumen>): void {
    this.op = leerOpciones({ ...this.op, ...cambio });
    guardar(CLAVE_OPCIONES, this.op);
    if (cambio.desde || cambio.co) this.pedirParaMenu();
    this.avisar();
  }

  /** La empresa con que se le habla al worker de las voces, cuando la Oficina ya cargó (si no, `null`). */
  empresaDeVoz(): string | null {
    return this.oficina ? companyIdDeVoz(this.oficina) : null;
  }

  /** Al abrir el menú: lo terminado del período y las abiertas de las empresas elegidas (lo que ya llegó, si es de hace menos de 1 min); después, el pedido de origen de cada una (para lo que dura). */
  pedirParaMenu(): void {
    const o = this.oficina;
    if (!o) return;
    // 0.11.0 (JST-325): el motor de la voz elegida se abre ahora, no al tocar ▶ (con Alex son 3 a 5 s menos de espera).
    calentarVoz("resumen", companyIdDeVoz(o));
    const elegidas = elegidasDe(empresasDe(o), this.op.co);
    void this.pedirDatos(elegidas, inicioDe(this.op.desde, Date.now(), this.ultima)).then(() => this.subirParaMenu());
  }

  /** «Reintentar» del menú: vuelve a pedir todo (también a las que fallaron). */
  reintentar(): void {
    const o = this.oficina;
    if (!o) return;
    o.reintentar();
    void this.pedirDatos(elegidasDe(empresasDe(o), this.op.co), inicioDe(this.op.desde, Date.now(), this.ultima), true).then(() => this.subirParaMenu());
  }

  /** Lo que el menú ya contó con el pedido de origen: la lectura y las opciones de las que depende. */
  private claveMenu(): string {
    return `${this.versionCarga}|${this.op.desde}|${this.op.co.join(",")}`;
  }

  /**
   * Para lo que dura (§2 y §14, JST-262): sube hasta el pedido de origen de lo
   * que se cuenta con lo elegido, como al leer. Sin eso, lo terminado y la cola
   * salen con una frase por tarea y el completo de 4 min decía «~3 min».
   */
  private async subirParaMenu(): Promise<void> {
    const o = this.oficina;
    const clave = this.claveMenu();
    if (!o || this.subidoPara === clave || this.subiendoPara === clave) return;
    this.subiendoPara = clave;
    try {
      const arbol = this.arbolDeCarga();
      const d = armarDatos(this.insumos(o, empresasDe(o), arbol, inicioDe(this.op.desde, Date.now(), this.ultima)), this.op.co);
      if (d.empresas.length > 0) await this.completarPadres(arbol, idsParaArbol(d));
    } finally {
      if (this.subiendoPara === clave) this.subiendoPara = "";
      // Si mientras tanto cambió lo leído o lo elegido, lo cuenta la vuelta que corresponde.
      if (clave === this.claveMenu()) this.subidoPara = clave;
      this.avisar();
    }
  }

  /** El árbol de pedidos con lo leído: lo de más arriba que ya se leyó y las filas de lo terminado y de las abiertas (más frescas). */
  private arbolDeCarga(ahora = Date.now()): Arbol {
    const a = new Arbol();
    for (const [id, p] of this.padres) {
      if (p.hasta > ahora) a.sumar(p.nodo);
      else this.padres.delete(id);
    }
    for (const c of this.carga.values()) {
      for (const f of c.abiertas?.filas ?? []) a.sumarFila(f);
      for (const f of c.terminadas?.filas ?? []) a.sumarFila(f);
    }
    return a;
  }

  /** Sube hasta el pedido de origen de esas tareas (como mucho `MAX_PADRES` lecturas) y guarda lo leído para el menú y para «Leer». */
  private async completarPadres(arbol: Arbol, ids: readonly string[]): Promise<void> {
    const anotar = (nodo: Nodo, ms: number) => this.padres.set(nodo.id, { nodo, hasta: Date.now() + ms });
    await completarArbol(cx, arbol, ids, MAX_PADRES, async (c, id) => {
      try {
        const cadena = await leerCadena(c, id);
        for (const n of cadena) anotar(n, PADRES_MS);
        return cadena;
      } catch (e) {
        // Como en `completarArbol`: queda como pedido de origen la que la nombra (y se vuelve a probar en 1 min).
        anotar({ id, identifier: null, titulo: "", parentId: null, rutina: false }, FRESCO_MS);
        throw e;
      }
    }).catch(() => 0);
  }

  private listaTerminadas(id: string, inicio: number, ahora = Date.now()): boolean {
    const t = this.carga.get(id)?.terminadas;
    return !!t && t.desde <= inicio && ahora - t.en < FRESCO_MS;
  }

  private listaAbiertas(id: string, ahora = Date.now()): boolean {
    const a = this.carga.get(id)?.abiertas;
    return !!a && ahora - a.en < FRESCO_MS;
  }

  /**
   * JST-415: cuántas tareas se terminaron desde `inicio` en las empresas que responden, con la misma capa de datos del
   * Resumen (sin IA; una lectura de lo terminado y otra de lo abierto por empresa, que el menú reutiliza si abres el
   * Resumen). `null` si todavía no hay Oficina o no respondió ninguna empresa.
   */
  async hechasDesde(inicio: number): Promise<number | null> {
    const o = this.oficina;
    if (!o) return null;
    const empresas = empresasDe(o);
    await this.pedirDatos(empresas, inicio);
    const d = armarDatos(this.insumos(o, empresas, this.arbolDeCarga(), inicio), []);
    return d.empresas.length > 0 ? d.hechas.length : null;
  }

  /** Pide lo que falte de esas empresas (una lectura por empresa a la vez). */
  async pedirDatos(empresas: readonly EmpresaRes[], inicio: number, forzar = false): Promise<void> {
    await Promise.all(empresas.map((e) => this.pedirEmpresa(e.id, inicio, forzar)));
  }

  private async pedirEmpresa(id: string, inicio: number, forzar: boolean): Promise<void> {
    for (let vuelta = 0; vuelta < 2; vuelta++) {
      const ya = this.enCamino.get(id);
      if (ya) {
        await ya;
        forzar = false;
        continue;
      }
      const ter = forzar || !this.listaTerminadas(id, inicio);
      const ab = forzar || !this.listaAbiertas(id);
      if (!ter && !ab) return;
      const p = (async () => {
        const en = Date.now();
        try {
          const [t, a] = await Promise.all([ter ? leerTerminadas(cx, id, inicio) : null, ab ? leerAbiertas(cx, id) : null]);
          const c = this.carga.get(id) ?? {};
          if (t) c.terminadas = { desde: inicio, filas: t, en };
          if (a) c.abiertas = { filas: a, en };
          delete c.error;
          this.carga.set(id, c);
        } catch {
          const c = this.carga.get(id) ?? {};
          c.error = Date.now();
          this.carga.set(id, c);
        }
      })().finally(() => {
        this.enCamino.delete(id);
        this.versionCarga += 1;
        this.avisar();
      });
      this.enCamino.set(id, p);
      this.avisar();
      await p;
      return;
    }
  }

  /** Las que no responden: su sala está a oscuras o la última lectura del Resumen falló. */
  private fallanDe(o: Oficina, empresas: readonly EmpresaRes[]): Set<string> {
    const caidas = new Set(o.caidas.map((e) => e.id));
    return new Set(empresas.filter((e) => caidas.has(e.id) || !!this.carga.get(e.id)?.error).map((e) => e.id));
  }

  /** Las tareas de los runs vivos de un agente (lo que la Oficina ya leyó). */
  private tareasVivas(o: Oficina): (a: AgenteOficina) => TareaViva[] {
    return (a) => {
      const runs = o.sync?.datos.get(a.companyId)?.runs ?? [];
      return runs
        .filter((r) => r.agentId === a.id && (r.status === "running" || r.status === "queued") && r.issueId)
        .map((r) => {
          const t = o.sync?.tareas.get(r.issueId!);
          return { id: r.issueId, identifier: t?.identifier ?? null, titulo: t?.title ?? "" };
        });
    };
  }

  private insumos(o: Oficina, empresas: readonly EmpresaRes[], arbol: Arbol, inicio: number): Insumos {
    const terminadas = new Map<string, FilaTarea[]>();
    const abiertas = new Map<string, FilaTarea[]>();
    for (const [id, c] of this.carga) {
      if (c.terminadas) terminadas.set(id, c.terminadas.filas);
      if (c.abiertas) abiertas.set(id, c.abiertas.filas);
    }
    return { empresas, agentes: o.agentes, tareasVivas: this.tareasVivas(o), terminadas, abiertas, fallan: this.fallanDe(o, empresas), arbol, inicio };
  }

  private tituloDe(o: Oficina, empresas: readonly EmpresaRes[]): Titulo {
    const roles = new Map<string, Set<string>>();
    return (t, prefijo) => {
      const id = empresas.find((e) => e.prefijo === prefijo)?.id ?? "";
      let r = roles.get(id);
      if (!r) roles.set(id, (r = rolesDeEmpresa(o.agentes, id)));
      return tituloParaVoz(t, r);
    };
  }

  /**
   * Los números del menú con lo elegido (§2): los de la Oficina al tiro; lo
   * terminado y la cola, cuando llegan; lo que dura, cuando además se sabe el
   * pedido de origen de cada tarea (las mismas frases que al leer, JST-262). Si
   * no responde ninguna de las elegidas, van sin número: no es que haya 0.
   */
  numeros(): NumerosMenu | null {
    const o = this.oficina;
    if (!o) return null;
    const ahora = Date.now();
    const empresas = empresasDe(o);
    const inicio = inicioDe(this.op.desde, ahora, this.ultima);
    const elegidas = elegidasDe(empresas, this.op.co);
    const arbol = this.arbolDeCarga(ahora);
    const d = armarDatos(this.insumos(o, empresas, arbol, inicio), this.op.co);
    const vivas = d.empresas;
    const base = { explicacion: explicacionMenu(this.op.desde, ahora, this.ultima), fallan: d.fallan.map((e) => e.prefijo), pidiendo: this.enCamino.size > 0 };
    if (elegidas.length > 0 && vivas.length === 0) return { ...base, toca: null, trabajan: null, hecho: null, cola: null, dura: null, duraMs: null, ninguna: true };
    const k = contarPartes(d);
    // Lo de antes sirve mientras se vuelve a pedir; si cambió el «desde» a uno más atrás, esqueleto hasta que llegue.
    const hecho = vivas.every((e) => (this.carga.get(e.id)?.terminadas?.desde ?? Infinity) <= inicio) ? k.hecho : null;
    const cola = vivas.every((e) => !!this.carga.get(e.id)?.abiertas) ? k.cola : null;
    let duraMs: number | null = null;
    if (hecho !== null && cola !== null && this.subidoPara === this.claveMenu()) {
      const ctx: Contexto = { ahora, ultima: this.ultima, op: this.op, conIa: false };
      const titulo = this.tituloDe(o, empresas);
      duraMs = duracionTotal(seccionesDe(this.op).flatMap((s) => frasesDeSeccion(s, d, ctx, titulo, elegidas)));
    }
    return { ...base, toca: k.toca, trabajan: k.trabajan, hecho, cola, dura: duraMs === null ? null : textoDuracion(duraMs), duraMs, ninguna: false };
  }

  // -------------------------------------------------------------------------
  // Leer
  // -------------------------------------------------------------------------

  /** «Leer el resumen» (o «Volver a leer con esto»): desde el clic, que desbloquea el audio. */
  leer(): void {
    const o = this.oficina;
    if (!o) return;
    this.cerrar();
    const audio = audioDelResumen();
    const ahora = Date.now();
    const op: OpcionesResumen = { ...this.op, co: [...this.op.co], partes: [...this.op.partes] };
    const ultima = this.ultima;
    const inicio = inicioDe(op.desde, ahora, ultima);
    const empresas = empresasDe(o);
    const elegidas = elegidasDe(empresas, op.co);
    const conIa = !esCelular() && iaParaResumen();
    const ctx: Contexto = { ahora, ultima, op, conIa };
    const id = `r${ahora.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const companyId = companyIdDeVoz(o);
    this.armadoEn = ahora;
    this.periodo = { desde: op.desde, ahora, ultima };
    this.fallanResumen = [];
    this.conIa = conIa;
    this.guardadoFin = false;
    this.texto = false;
    const voz = new VozResumen({ voz: vozParaLeer("resumen", companyId), resumen: id, companyId, audio, alCambiar: () => this.avisar() });
    const lector = new Lector({
      voz,
      ahora: Date.now,
      programar: (fn, ms) => {
        const t = setTimeout(fn, ms);
        return () => clearTimeout(t);
      },
      alCambiar: () => {
        if (this.lector === lector) this.avisar();
      },
      antesDeHablar: () => {
        if (this.lector === lector) for (const fn of this.callarAntes) fn();
      },
    });
    this.voz = voz;
    this.lector = lector;
    const abortar = new AbortController();
    this.abortar = abortar;
    const secs = seccionesDe(op);
    lector.empezar(secs, conIa);
    this.avisar();
    void this.armar({ lector, o, op, ctx, inicio, empresas, elegidas, secs, companyId, signal: abortar.signal }).catch(() => {
      // Si algo falla al armar, lo que falte va vacío (el lector sigue con lo que hay).
      for (const s of secs) lector.fijarArmadas(s, []);
    });
  }

  private async armar(a: {
    lector: Lector;
    o: Oficina;
    op: OpcionesResumen;
    ctx: Contexto;
    inicio: number;
    empresas: EmpresaRes[];
    elegidas: EmpresaRes[];
    secs: Seccion[];
    companyId: string | null;
    signal: AbortSignal;
  }): Promise<void> {
    const { lector, o, op, ctx, inicio, empresas, elegidas, secs } = a;
    const vigente = () => this.lector === lector && !a.signal.aborted;
    const armadas = new Map<Seccion, Diferida<FraseResumen[] | null>>(secs.map((s) => [s, diferida<FraseResumen[] | null>()]));
    await this.pedirDatos(elegidas, inicio);
    if (!vigente()) return;
    const arbol = this.arbolDeCarga();
    const ins = this.insumos(o, empresas, arbol, inicio);
    let d: DatosResumen = armarDatos(ins, op.co);
    this.fallanResumen = d.fallan;
    const titulo = this.tituloDe(o, empresas);
    const ninguna = d.empresas.length === 0 && d.fallan.length > 0;
    const fijar = (s: Seccion) => {
      if (!secs.includes(s)) return;
      let fr: FraseResumen[];
      if (ninguna) fr = s === "intro" ? [{ sec: "intro", texto: `No pude leer ${d.fallan.length === 1 ? d.fallan[0]!.nombre : "Paperclip"}. Revisa la conexión y vuelve a probar.`, aviso: true }] : [];
      else fr = frasesDeSeccion(s, d, ctx, titulo, elegidas);
      lector.fijarArmadas(s, fr);
      armadas.get(s)?.ok(fr);
    };
    // 1 · Lo que no necesita el pedido de origen: al tiro.
    for (const s of ["intro", "toca", "cierre"] as const) fijar(s);
    // La IA, parte por parte, en paralelo con la lectura.
    if (ctx.conIa && !ninguna) {
      const nombres = [...new Set([...o.agentes.map((x) => agenteParaVoz(x.nombre)), ...empresas.map((e) => e.nombre)])];
      void escribirResumen({
        partes: secs.filter((s) => s !== "intro").map((sec) => ({ sec, armadas: () => armadas.get(sec)!.promesa })),
        nombres,
        companyId: a.companyId,
        signal: a.signal,
        alParte: (sec, fr) => {
          if (this.lector === lector) lector.fijarIa(sec, fr);
        },
        anotar: (r) => {
          this.registroIa.push(r);
          if (this.registroIa.length > 100) this.registroIa.shift();
        },
      }).catch(() => {
        for (const s of secs) lector.fijarIa(s, false);
      });
    } else for (const s of secs) lector.fijarIa(s, false);
    // 2 · Lo que se cuenta por pedido: después de subir hasta el pedido de origen.
    if (!ninguna) {
      // Lo que el menú ya subió no se vuelve a leer.
      await this.completarPadres(arbol, idsParaArbol(d));
      if (!vigente()) return;
      d = armarDatos(ins, op.co);
    }
    for (const s of ["hecho", "trabajan", "cola"] as const) fijar(s);
    // Lo terminado y las abiertas quedaron más frescos: los números del menú también.
    this.avisar();
  }

  // -------------------------------------------------------------------------
  // El reproductor
  // -------------------------------------------------------------------------

  /** Suena o está en pausa: el reproductor está, la Oficina calla. */
  sonando(): boolean {
    const l = this.lector;
    return !!l && (l.activo() || l.fase === "pausa");
  }

  /** El reproductor se ve (también «Listo»). */
  abierto(): boolean {
    return !!this.lector && this.lector.fase !== "off";
  }

  /** «Leer contexto» (JST-276 §7): si el Resumen suena, se pausa (no se cierra); ▶ lo retoma. */
  pausarPorContexto(): void {
    const l = this.lector;
    if (l?.activo()) l.pausar();
  }

  fijarContextoLee(on: boolean): void {
    if (this.contextoLee === on) return;
    this.contextoLee = on;
    this.avisar();
  }

  /** `fn` se llama justo antes de cada frase del Resumen (para callar «Leer contexto»). Devuelve cómo quitarlo. */
  alHablar(fn: () => void): () => void {
    this.callarAntes.add(fn);
    return () => this.callarAntes.delete(fn);
  }

  alternarTexto(on?: boolean): void {
    this.texto = on ?? !this.texto;
    this.avisar();
  }

  /** Cierra el reproductor: «Lo nuevo» cuenta desde este resumen si se escuchó más de la mitad (§9; lo que de verdad sonó, JST-261). */
  cerrar(): void {
    const l = this.lector;
    if (!l) return;
    if (l.fase !== "off" && !this.guardadoFin && l.escuchado()) this.guardarUltima();
    this.abortar?.abort();
    this.abortar = null;
    l.cerrar();
    this.lector = null;
    this.voz = null;
    this.texto = false;
    this.avisar();
  }

  private guardarUltima(): void {
    if (!this.armadoEn) return;
    this.ultima = this.armadoEn;
    guardar(CLAVE_ULTIMA, this.ultima);
  }

  private revisarSonando(): void {
    const on = this.sonando();
    // Al terminar, solo si se oyó la mitad: llegar al final saltando no cuenta (JST-261). Si no, «Otra vez» todavía puede contar.
    if (this.lector?.fase === "fin" && !this.guardadoFin && this.lector.escuchado()) {
      this.guardadoFin = true;
      this.guardarUltima();
    }
    if (on === this.sonandoAntes) return;
    this.sonandoAntes = on;
    fijarResumenSonando(on);
    publicarVoz({ t: "resumen", hasta: on ? Date.now() + LATIDO_VALE_MS : 0 });
    if (on && !this.latido) this.latido = setInterval(() => publicarVoz({ t: "resumen", hasta: Date.now() + LATIDO_VALE_MS }), LATIDO_MS);
    if (!on && this.latido) {
      clearInterval(this.latido);
      this.latido = null;
    }
  }

  /** La frase que suena: su empresa (la sala encendida) y su agente (el anillo), §6. */
  foco(): { co: string | null; ag: string | null } | null {
    const l = this.lector;
    if (!l || (l.fase !== "leyendo" && l.fase !== "pausa")) return null;
    const f = l.actual();
    return f && (f.co || f.ag) ? { co: f.co ?? null, ag: f.ag ?? null } : null;
  }

  private aplicarFoco(): void {
    if (typeof document === "undefined") return;
    const f = this.foco();
    const clave = f ? `${f.co ?? ""}|${f.ag ?? ""}` : "";
    if (clave === this.focoAntes) return;
    this.focoAntes = clave;
    let st = document.getElementById(ID_FOCO) as HTMLStyleElement | null;
    if (!st) {
      st = document.createElement("style");
      st.id = ID_FOCO;
      document.head.appendChild(st);
    }
    st.textContent = f ? cssFoco(f.co, f.ag) : "";
  }

  /** Para la QA y las pruebas en la copia (`window.__oficinaResumen()`). */
  paraPruebas() {
    const l = this.lector;
    return {
      op: this.op,
      ultima: this.ultima,
      fase: l?.fase ?? "off",
      pos: l?.pos ?? null,
      /** Cuánto se oyó de verdad (0 a 1): «Lo nuevo» cuenta desde la mitad (JST-261). */
      oido: l ? Math.round(l.oido() * 1000) / 1000 : null,
      velocidad: l?.velocidad ?? 1,
      conIa: this.conIa,
      modoVoz: this.voz?.modo ?? null,
      vozId: this.voz?.vozId ?? null,
      sinVoces: this.voz?.sinVoces ?? false,
      secciones: (l?.secciones ?? []).map((s) => ({ sec: s.sec, armadas: s.armadas?.map((f) => f.texto) ?? null, ia: s.ia === false ? false : (s.ia?.map((f) => f.texto) ?? null), usadas: s.usadas?.map((f) => ({ ...f })) ?? null, audioTarde: !!s.audioTarde })),
      foco: this.foco(),
      sonado: this.voz?.sonado.slice() ?? [],
      registroIa: this.registroIa.slice(),
      numeros: this.numeros(),
      carga: [...this.carga].map(([id, c]) => ({ id, terminadas: c.terminadas ? { desde: c.terminadas.desde, n: c.terminadas.filas.length, en: c.terminadas.en } : null, abiertas: c.abiertas ? { n: c.abiertas.filas.length, en: c.abiertas.en } : null, error: c.error ?? null })),
    };
  }
}

const ID_FOCO = "jstm-oficina-pixel-resumen-foco";

/** La sala encendida y las demás tenues (§6), y el anillo del agente del que se habla. Solo en la página (no en el widget ni el TV). */
export function cssFoco(co: string | null, ag: string | null): string {
  const sel = (x: string) => x.replace(/["\\]/g, "");
  const reglas: string[] = [];
  if (co) {
    reglas.push(
      `[data-oficina-pagina] .of-piso .of-sala[data-sala]:not([data-sala="${sel(co)}"]) { opacity: .38; filter: saturate(.55); }`,
      `[data-oficina-pagina] .of-piso .of-sala[data-sala="${sel(co)}"] { z-index: 2; box-shadow: 0 0 0 calc(3px * var(--px)) var(--of-room-line), 0 0 0 calc(3px * var(--px) + 3px) var(--cc), 0 0 24px 4px color-mix(in srgb, var(--cc) 45%, transparent); }`,
    );
  }
  if (ag) reglas.push(`[data-oficina-pagina] .of-piso :is(.of-ws, .of-lc)[data-agente="${sel(ag)}"] { z-index: 60 !important; } [data-oficina-pagina] .of-piso :is(.of-ws, .of-lc)[data-agente="${sel(ag)}"]::after { content: ""; position: absolute; left: calc(-4px * var(--px)); top: calc(-4px * var(--px)); right: calc(-4px * var(--px)); bottom: calc(-2px * var(--px)); border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 0 2px var(--of-room-line), 0 0 12px 2px rgba(255,255,255,.55); animation: of-rs-anillo 1.6s ease-in-out infinite; pointer-events: none; z-index: 20; }`);
  return reglas.join("\n");
}

/** Uno por pestaña. */
export const resumen = new ControlResumen();

if (typeof window !== "undefined") {
  // El Resumen de otra pestaña también calla los avisos y lo de la oficina de esta.
  escucharVoz((m) => {
    if (m.t === "resumen") resumenAjeno(m.hasta);
  });
  window.addEventListener("pagehide", () => {
    if (resumen.sonando()) publicarVoz({ t: "resumen", hasta: 0 });
  });
  (window as unknown as { __oficinaResumen?: () => unknown }).__oficinaResumen = () => resumen.paraPruebas();
}

/** Para React: se vuelve a dibujar con cada cambio del resumen. */
export function useResumen(): ControlResumen {
  useSyncExternalStore(resumen.suscribir, () => resumen.version);
  return resumen;
}

/** Solo si cambia que el reproductor esté abierto (el padding de abajo del piso). */
export function useResumenAbierto(): boolean {
  return useSyncExternalStore(resumen.suscribir, () => resumen.abierto());
}
