// «Preparar voces» en el panel «Voces» (0.13.0, issue #9): se eligen los
// motores (con lo que cuesta cada uno), el worker baja lo que falte y graba las
// frases de los agentes que se ven, y el panel muestra cómo va. Después, con
// las voces al día, la página le manda al worker los agentes nuevos o con otro
// nombre (`mantenerAlDia`), sin ningún comando.
import { useEffect, useRef, useState } from "react";
import { GRUPOS_MOTOR, vocesDe, type GrupoMotor } from "../eleccionVoces.js";
import { msg, t } from "../i18n.js";
import type { AgenteVista } from "../vista.js";
import type { EstadoMotores } from "../vozViva.js";
import { useAjustes } from "./ajustes.js";
import { useVocesSinGenerar } from "./audiosVoces.js";
import { mantenerAlDia, prepararVoces, useEleccion, useErrorPreparar, useEstadoMotores, type AgenteParaVoz } from "./eleccion.js";
import { tx } from "./i18n.js";
import { cx, Icono } from "./piso.js";

/** Lo que se dice de cada motor al elegirlo: qué voces trae y lo que cuesta. */
const MOTORES: Record<GrupoMotor, { nombre: string; voces: string; costo: (bajar: number) => string }> = {
  supertonic: {
    nombre: "Supertonic",
    voces: msg("10 voces"),
    costo: (bajar) => (bajar > 0 ? t("Corre en este computador, sin instalar nada más. Baja {mb} una vez y usa ~0,5 GB de memoria mientras graba.", { mb: mb(bajar) }) : t("Corre en este computador, sin instalar nada más. Ya está bajado y usa ~0,5 GB de memoria mientras graba.")),
  },
  kokoro: {
    nombre: "Kokoro",
    voces: msg("Alex, Dora y Santa"),
    costo: (bajar) => (bajar > 0 ? t("Corre en este computador. Necesita uv y ffmpeg, y baja {mb} una vez.", { mb: mb(bajar) }) : t("Corre en este computador. Necesita uv y ffmpeg.")),
  },
  edge: {
    nombre: "Edge",
    voces: msg("Lorenzo y Catalina (y 16 más de otros países, que se graban al elegirlas)"),
    costo: () => t("Las voces de Edge (Lorenzo, Catalina y las de otros países) mandan el texto a Microsoft: cada frase (con el nombre del agente y, al momento, la tarea) va a sus servidores. Necesita uv, ffmpeg e internet."),
  },
  clones: {
    nombre: msg("Clones chilenos"),
    voces: msg("4 voces"),
    costo: () => t("Las más naturales y las más pesadas: usan 4 a 5 GB de memoria, bajan sus modelos la primera vez y tardan ~10 min por agente. Necesitan uv y ffmpeg."),
  },
};

const mb = (bytes: number) => `${Math.round(bytes / 1e6)} MB`;

/** Por qué no se puede usar ese motor ahora (para elegir la voz de un agente): falta con qué correrlo o su modelo. */
export function motivoNoDisponible(est: EstadoMotores | null, g: GrupoMotor): string | null {
  if (!est) return null;
  const motivo = est.motores[g];
  if (motivo) return motivo;
  if ((g === "supertonic" || g === "kokoro") && est.porBajar[g] > 0) return t("falta bajar su modelo (con «Preparar voces»)");
  return null;
}

/** Cada cuánto se le recuerdan al worker los agentes (si se reinició, ahí los vuelve a conocer). */
const RECORDAR_MS = 30 * 60_000;

/**
 * En la página, con las voces prendidas: los agentes de cada empresa van al
 * worker cuando cambian (uno nuevo, otro nombre) y cada 30 min. Solo si las
 * voces están al día (`mantenerAlDia` lo revisa); si no, no manda nada.
 */
export function useVocesAlDia(agentes: readonly AgenteVista[]): void {
  const prendidas = useAjustes().voces;
  const firma = agentes.map((a) => `${a.companyId}|${a.id}|${a.nombre}|${a.empresa}`).join("\n");
  const ultimos = useRef(agentes);
  ultimos.current = agentes;
  useEffect(() => {
    if (!prendidas) return;
    const mandar = () => {
      const porEmpresa = new Map<string, AgenteParaVoz[]>();
      for (const a of ultimos.current) {
        const lista = porEmpresa.get(a.companyId) ?? [];
        lista.push({ id: a.id, nombre: a.nombre, empresa: a.empresa });
        porEmpresa.set(a.companyId, lista);
      }
      for (const [companyId, lista] of porEmpresa) void mantenerAlDia(companyId, lista);
    };
    mandar();
    const reloj = setInterval(mandar, RECORDAR_MS);
    return () => clearInterval(reloj);
  }, [prendidas, firma]);
}

/** Lo que queda marcado al abrir: lo elegido antes o, la primera vez, Supertonic (si se puede). */
function marcadosAlAbrir(antes: readonly GrupoMotor[] | null, est: EstadoMotores): GrupoMotor[] {
  if (antes) return antes.filter((g) => !est.motores[g]);
  return est.motores.supertonic ? [] : ["supertonic"];
}

const nombres = (gs: readonly GrupoMotor[]) => gs.map((g) => t(MOTORES[g].nombre)).join(", ");

export function PrepararVoces({ agentes, companyId }: { agentes: readonly AgenteVista[]; companyId: string }) {
  const est = useEstadoMotores();
  const e = useEleccion();
  const sinGenerar = useVocesSinGenerar();
  const fallo = useErrorPreparar();
  const [eligiendo, setEligiendo] = useState(false);
  const [marcados, setMarcados] = useState<GrupoMotor[] | null>(null);
  const [mandando, setMandando] = useState(false);
  // Se vuelve a marcar lo de antes cada vez que se abre.
  useEffect(() => {
    if (!eligiendo) setMarcados(null);
  }, [eligiendo]);

  // Un worker de antes de la 0.13.0 (o todavía no respondió): como antes, con `npm run voces`.
  if (!est) return null;
  const p = est.preparar;
  const preparar = async (gs: readonly GrupoMotor[]) => {
    setMandando(true);
    const ok = await prepararVoces(
      companyId,
      agentes.map((a) => ({ id: a.id, nombre: a.nombre, empresa: a.empresa })),
      gs,
    );
    setMandando(false);
    if (ok) setEligiendo(false);
  };

  if (p.fase === "bajando" || p.fase === "grabando") {
    const pct = p.fase === "bajando" ? (p.pesa > 0 ? Math.round((p.bajado / p.pesa) * 100) : 0) : p.total > 0 ? Math.round(((p.hechas + p.fallas) / p.total) * 100) : 0;
    return (
      <div className="of-avp-note is-box of-pv" role="status">
        <Icono nombre={p.fase === "bajando" ? "download" : "volume-2"} tam={12} />
        <span className="of-pv-c">
          <span>
            {p.fase === "bajando" ? (
              <>
                {tx("{bajando} · {pct} % de {peso}. Se baja una sola vez.", { bajando: <b>{p.modelo ? t("Bajando {modelo}", { modelo: p.modelo }) : t("Bajando el modelo")}</b>, pct, peso: mb(p.pesa) })}
              </>
            ) : (
              <>
                {tx("{grabando}{fallas}. Ya hablan con lo que está listo; lo demás, con la voz del navegador.", { grabando: <b>{t("Grabando las voces · {hechas} de {total}", { hechas: p.hechas, total: p.total })}</b>, fallas: p.fallas > 0 ? ` (${t("{n} no se pudieron", { n: p.fallas })})` : "" })}
              </>
            )}
          </span>
          <span className="of-ia-bar" role="progressbar" aria-label={p.fase === "bajando" ? (p.modelo ? t("Bajando {modelo}", { modelo: p.modelo }) : t("Bajando el modelo")) : t("Grabando las voces")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <i style={{ width: `${pct}%` }} />
          </span>
        </span>
      </div>
    );
  }

  const elegidos = e.alDia ? e.motores : null;
  if (!eligiendo && p.fase === "error") {
    return (
      <div className="of-avp-note is-box of-pv is-err" role="alert">
        <Icono nombre="triangle-alert" tam={12} />
        <span className="of-pv-c">
          <span>
            <b>{t("No se pudieron preparar las voces.")}</b> {p.motivo ?? ""}
          </span>
          <span className="of-pv-acc">
            {elegidos ? (
              <button type="button" className="of-btn is-xs" disabled={mandando} onClick={() => void preparar(elegidos)}>
                {t("Reintentar")}
              </button>
            ) : null}
            <button type="button" className="of-btn is-xs" onClick={() => setEligiendo(true)}>
              {t("Elegir otros motores")}
            </button>
          </span>
        </span>
      </div>
    );
  }

  // Al día y sin nada en curso: una fila corta, con «Cambiar».
  if (!eligiendo && elegidos) {
    return (
      <>
        <div className="of-avp-row of-pv-fila">
          <span className="of-avp-l">
            <Icono nombre="check" tam={14} />
            <span>
              <b>{t("Voces al día con {motores}", { motores: nombres(elegidos) })}</b>
              <em>{t("Los agentes nuevos o con otro nombre se graban solos, en el computador donde corre Paperclip.")}</em>
            </span>
          </span>
          <button type="button" className="of-btn is-xs" onClick={() => setEligiendo(true)}>
            {t("Cambiar")}
          </button>
        </div>
        {p.sinMotor > 0 ? (
          <div className="of-avp-note">
            <Icono nombre="info" tam={12} />
            <span>
              {p.sinMotor === 1 ? t("1 frase es de una voz de un motor que no elegiste o que no se puede usar aquí: esa la dice la voz del navegador.") : t("{n} frases son de una voz de un motor que no elegiste o que no se puede usar aquí: esas las dice la voz del navegador.", { n: p.sinMotor })}
            </span>
          </div>
        ) : null}
      </>
    );
  }

  // Con audios de `npm run voces` pero sin «al día»: una fila para empezar.
  if (!eligiendo && !sinGenerar) {
    return (
      <div className="of-avp-row of-pv-fila">
        <span className="of-avp-l">
          <Icono nombre="rotate-ccw" tam={14} />
          <span>
            <b>{t("Mantener las voces al día")}</b>
            <em>{t("Que los agentes nuevos o con otro nombre se graben solos, sin correr ningún comando.")}</em>
          </span>
        </span>
        <button type="button" className="of-btn is-xs" onClick={() => setEligiendo(true)}>
          {t("Preparar voces")}
        </button>
      </div>
    );
  }

  const lista = marcados ?? marcadosAlAbrir(e.motores, est);
  const cambiar = (g: GrupoMotor) => setMarcados(lista.includes(g) ? lista.filter((x) => x !== g) : GRUPOS_MOTOR.filter((x) => x === g || lista.includes(x)));
  const cuantas = vocesDe(lista).length;
  return (
    <div className="of-avp-note is-box of-pv">
      <Icono nombre="volume-2" tam={12} />
      <span className="of-pv-c">
        <span>
          {sinGenerar ? <b>{t("Todavía no hay audios en este Paperclip.")} </b> : null}
          {t("Elige con qué motores se graban las voces. Se graban una vez, en el computador donde corre Paperclip, y después se mantienen al día solas. Lo que falte lo dice la voz del navegador.")}
        </span>
        <span className="of-pv-motores" role="group" aria-label={t("Motores de voz")}>
          {GRUPOS_MOTOR.map((g) => {
            const m = MOTORES[g];
            const no = est.motores[g];
            const on = lista.includes(g) && !no;
            const bajar = g === "supertonic" || g === "kokoro" ? est.porBajar[g] : 0;
            return (
              <label key={g} className={cx("of-vz-ev", on && "is-on", no && "is-no")} title={no ? t("No se puede en este computador: {motivo}", { motivo: no }) : undefined}>
                <input type="checkbox" checked={on} disabled={!!no || mandando} onChange={() => cambiar(g)} />
                <span className="of-vz-mk">{on ? <Icono nombre="check" tam={12} /> : null}</span>
                <span>
                  <b>
                    {t(m.nombre)} · {t(m.voces)}
                  </b>
                  <em>{no ? t("No se puede en este computador: {motivo}", { motivo: no }) : m.costo(bajar)}</em>
                </span>
              </label>
            );
          })}
        </span>
        {fallo ? <span className="of-pv-err">{t("No respondió el servidor de Paperclip. Vuelve a intentarlo en un momento.")}</span> : null}
        <span className="of-pv-acc">
          <button type="button" className="of-btn is-xs is-primary" disabled={lista.length === 0 || mandando} onClick={() => void preparar(lista)}>
            <Icono nombre="download" tam={12} />
            {mandando ? t("Empezando…") : t("Preparar voces")}
          </button>
          {elegidos || !sinGenerar ? (
            <button type="button" className="of-btn is-xs" disabled={mandando} onClick={() => setEligiendo(false)}>
              {t("Cancelar")}
            </button>
          ) : null}
          <span className="of-pv-n">{lista.length === 0 ? t("Elige al menos uno") : cuantas === 1 ? t("1 voz para repartir") : t("{n} voces para repartir", { n: cuantas })}</span>
        </span>
      </span>
    </div>
  );
}
