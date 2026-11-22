// «Bloqueadas sin nadie moviéndolas» (JST-426): las tareas que Paperclip marca como `blocker_attention` porque su
// árbol de bloqueos no avanza solo. No son «te necesita» (`tipoEspera` las deja fuera a propósito: no siempre te
// toca a ti): se muestran aparte y callados. Sin React ni navegador, para poder probarlo.
import type { ItemAtencion, SujetoAtencion } from "./shared.js";

export interface Bloqueada {
  companyId: string;
  prefijo: string;
  empresa: string;
  /** Id de la tarea. */
  issueId: string;
  /** Código de la tarea (`AAA-12`), si lo trae el feed. */
  identifier: string | null;
  titulo: string;
  href: string | null;
  /** El agente a cargo de la tarea (si hay). */
  agenteId: string | null;
  /** Desde cuándo (ms): `activityAt`, o `updatedAt`, o `createdAt`; `null` si el feed no trae ninguno. */
  desde: number | null;
  /** Estado de la tarea (`blocked`, `todo`, `backlog`…): la que frena no siempre está bloqueada. */
  estado: string | null;
  /** Cuántas otras tareas esperan detrás de esta: lo que cuenta Paperclip, o su cadena en el feed si es más larga. */
  frena: number;
  /** Sin agente a cargo, pero asignada a una persona. */
  dePersona: boolean;
}

export interface EmpresaBloqueos {
  id: string;
  prefijo: string;
  nombre: string;
  /** Ítems de «Te toca» de la empresa (`null`: no se pudo leer). */
  atencion: readonly ItemAtencion[] | null;
  /** Tareas con un run vivo ahora: ya las está moviendo alguien, no se listan. */
  conRunVivo?: ReadonlySet<string>;
}

function ms(texto: string | null | undefined): number | null {
  if (!texto) return null;
  const n = Date.parse(texto);
  return Number.isFinite(n) ? n : null;
}

type Tarea = SujetoAtencion & { id: string };
function tareaDe(sujeto: SujetoAtencion | null | undefined): Tarea | null {
  return sujeto?.kind === "issue" && sujeto.id ? (sujeto as Tarea) : null;
}

/**
 * El feed trae un ítem por tarea que frena a otras: `subject` es la que frena, `relatedIssue` una de las que esperan
 * por ella y `detail.blockedTaskCount` cuántas esperan en total. Una tarea bloqueada que no depende de otra (pide algo
 * a alguien) llega con ella misma de `relatedIssue`, o sin `relatedIssue`. Las que frenan suelen estar encadenadas
 * (una espera a la otra), así que se lista solo la cabeza de cada cadena: la que no espera a otra de la lista. Una
 * tarea con bloqueo propio siempre tiene su fila, aunque además espere a otra. Fuera las descartadas vigentes y las
 * cadenas cuya cabeza tiene un run vivo. Primero la que más frena; a igualdad, la más antigua (sin fecha, al final).
 */
export function armarBloqueos(empresas: readonly EmpresaBloqueos[]): Bloqueada[] {
  const vistas = new Set<string>();
  const lista: Bloqueada[] = [];
  for (const e of empresas) {
    const tareas = new Map<string, Tarea>();
    const fechas = new Map<string, number | null>();
    /** La que frena → las que esperan por ella. */
    const esperan = new Map<string, Set<string>>();
    const conFreno = new Set<string>();
    /** Las que tienen un bloqueo propio (no solo esperan a otra): nunca se funden en la fila de otra. */
    const propias = new Set<string>();
    const cuenta = new Map<string, number>();
    for (const item of e.atencion ?? []) {
      // Paperclip ya deja fuera las descartadas vigentes; una que vuelve (actividad nueva, venció la posposición) trae `isActive: false`.
      if (item.sourceKind !== "blocker_attention" || (item.dismissal as { isActive?: unknown } | null | undefined)?.isActive === true) continue;
      const espera = tareaDe(item.relatedIssue);
      const frena = tareaDe(item.subject) ?? espera;
      if (!frena) continue;
      // Los datos más completos ganan (el sujeto trae a quién está asignada).
      if (!tareas.has(frena.id) || frena.metadata) tareas.set(frena.id, frena);
      if (!esperan.has(frena.id)) esperan.set(frena.id, new Set());
      const fecha = ms(item.activityAt) ?? ms(item.updatedAt) ?? ms(item.createdAt);
      const antes = fechas.get(frena.id);
      if (!fechas.has(frena.id) || (fecha != null && (antes == null || fecha < antes))) fechas.set(frena.id, fecha);
      cuenta.set(frena.id, Math.max(cuenta.get(frena.id) ?? 0, item.detail?.blockedTaskCount ?? 0));
      if (espera && espera.id !== frena.id) {
        esperan.get(frena.id)!.add(espera.id);
        conFreno.add(espera.id);
      } else {
        propias.add(frena.id);
      }
    }
    const detras = (cabeza: string): Set<string> => {
      const alcanzadas = new Set<string>([cabeza]);
      const cola = [cabeza];
      while (cola.length > 0) for (const x of esperan.get(cola.pop()!) ?? []) if (!alcanzadas.has(x)) (alcanzadas.add(x), cola.push(x));
      return alcanzadas;
    };
    const cabezas = [...esperan.keys()].filter((x) => !conFreno.has(x) || propias.has(x));
    // Un ciclo no tiene cabeza: la primera de sus tareas hace de cabeza, para que no se pierda.
    const cubiertas = new Set<string>();
    for (const c of cabezas) for (const x of detras(c)) cubiertas.add(x);
    for (const x of esperan.keys()) {
      if (cubiertas.has(x)) continue;
      cabezas.push(x);
      for (const y of detras(x)) cubiertas.add(y);
    }
    for (const cabeza of cabezas) {
      if (vistas.has(cabeza) || e.conRunVivo?.has(cabeza)) continue;
      vistas.add(cabeza);
      const tarea = tareas.get(cabeza)!;
      lista.push({
        companyId: e.id,
        prefijo: e.prefijo,
        empresa: e.nombre,
        issueId: cabeza,
        identifier: tarea.identifier ?? null,
        titulo: tarea.title ?? "",
        href: tarea.href ?? null,
        agenteId: tarea.metadata?.assigneeAgentId ?? null,
        desde: fechas.get(cabeza) ?? null,
        estado: tarea.status ?? null,
        frena: Math.max(detras(cabeza).size - 1, cuenta.get(cabeza) ?? 0),
        dePersona: !tarea.metadata?.assigneeAgentId && !!tarea.metadata?.assigneeUserId,
      });
    }
  }
  return lista.sort((a, b) => b.frena - a.frena || (a.desde ?? Infinity) - (b.desde ?? Infinity));
}

/** Solo las de las empresas visibles, por prefijo (el filtro de la página; vacío: todas). */
export function bloqueosDe(lista: readonly Bloqueada[], prefijos: readonly string[]): Bloqueada[] {
  return prefijos.length === 0 ? [...lista] : lista.filter((b) => prefijos.includes(b.prefijo));
}

/** Las que se muestran (20) y cuántas quedan fuera. */
export const MAX_BLOQUEOS_MOSTRADAS = 20;
export function recortarBloqueos<T>(lista: readonly T[], max = MAX_BLOQUEOS_MOSTRADAS): { vistas: T[]; mas: number } {
  return { vistas: lista.slice(0, max), mas: Math.max(0, lista.length - max) };
}

/** El motivo con tope de largo y «…». */
export function recortarMotivo(texto: string, max = 240): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  return limpio.length <= max ? limpio : `${limpio.slice(0, max - 1).trimEnd()}…`;
}

/** La clave con que se recuerda el motivo: cambia si el bloqueo se mueve, para no mostrar uno viejo. */
export function claveMotivo(b: Pick<Bloqueada, "issueId" | "desde">): string {
  return `${b.issueId}@${b.desde ?? ""}`;
}
const tareaDeClave = (clave: string): string => clave.split("@")[0]!;

/**
 * Lector perezoso de motivos: uno por clave (`claveMotivo`), con memoria del motivo y del «sin motivo», y con tope de
 * pedidos simultáneos. Un fallo o un pedido que no vuelve a tiempo no se recuerda: se reintenta la próxima vez que se
 * pida (al volver a abrir el panel). `leer` recibe el id de la tarea y nunca debe cambiar nada en Paperclip.
 */
export class LectorMotivos {
  private readonly memoria = new Map<string, string | null>();
  private readonly enCurso = new Set<string>();
  private readonly cola: string[] = [];
  private readonly oyentes = new Set<() => void>();
  private libres: number;

  constructor(
    private readonly leer: (issueId: string) => Promise<string | null>,
    simultaneos = 3,
    private readonly esperaMs = 15_000,
  ) {
    this.libres = simultaneos;
  }

  /** El motivo ya leído: `undefined` si todavía no se sabe (o falló), `null` si no hay. */
  motivo(clave: string): string | null | undefined {
    return this.memoria.get(clave);
  }

  /** Pide los motivos que falten; avisa a los oyentes a medida que llegan. */
  pedir(ids: readonly string[]): void {
    for (const id of ids) {
      if (this.memoria.has(id) || this.enCurso.has(id) || this.cola.includes(id)) continue;
      this.cola.push(id);
    }
    this.avanzar();
  }

  alCambiar(oyente: () => void): () => void {
    this.oyentes.add(oyente);
    return () => this.oyentes.delete(oyente);
  }

  private avanzar(): void {
    while (this.libres > 0 && this.cola.length > 0) {
      const id = this.cola.shift()!;
      this.libres--;
      this.enCurso.add(id);
      let reloj: ReturnType<typeof setTimeout> | undefined;
      const tarde = new Promise<undefined>((r) => (reloj = setTimeout(() => r(undefined), this.esperaMs)));
      void Promise.race([this.leer(tareaDeClave(id)).then((m) => (typeof m === "string" && m.trim() ? m : null), () => undefined), tarde])
        .then((m) => {
          clearTimeout(reloj);
          if (m !== undefined) this.memoria.set(id, m);
          this.enCurso.delete(id);
          this.libres++;
          for (const o of this.oyentes) o();
          this.avanzar();
        });
    }
  }
}
