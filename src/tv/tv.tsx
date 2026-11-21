// Modo TV suelto (design-spec de JST-65 §14): `tv.html`, servido por el host en
// `/_plugins/<uuid-de-la-instalación>/ui/tv.html`, fuera del layout de
// Paperclip, para dejarlo abierto en un televisor. Es la misma vista TV de la
// página, con los canales en vivo de todas las empresas y la cookie de sesión
// del mismo origen. El host no le da React a esta página: va en el bundle.
import { createRoot } from "react-dom/client";
import { idInstalacion } from "../fuentes.js";
import { t } from "../i18n.js";
import { PLUGIN_KEY } from "../shared.js";
import { asegurarEstilos } from "../ui/estilos.js";
import type { Enlazar } from "../ui/ficha.js";
import { useOficina } from "../ui/useOficina.js";
import { VistaTv } from "../ui/vistaTv.js";
import { useEffect, useState } from "react";

/** El mismo tema que Paperclip: `paperclip.theme` del almacenamiento local o el del sistema. */
function aplicarTema(): void {
  let tema: string | null = null;
  try {
    tema = localStorage.getItem("paperclip.theme");
  } catch {
    tema = null;
  }
  const oscuro = tema === "dark" || (tema !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", oscuro);
  document.documentElement.style.colorScheme = oscuro ? "dark" : "light";
}

/** En el TV los enlaces abren otra pestaña, para no perder la vista. */
const enlazar: Enlazar = (href) => ({ href, target: "_blank", rel: "noopener" });

/** Sin el SDK: copia con la API del portapapeles o, en HTTP plano, con un textarea. */
async function copiar(texto: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(texto);
    return;
  }
  const area = document.createElement("textarea");
  area.value = texto;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand("copy");
  area.remove();
  if (!ok) throw new Error(t("No se pudo copiar"));
}

function Tv() {
  const oficina = useOficina();
  const [urlTv, setUrlTv] = useState<string | null>(null);
  useEffect(() => {
    void idInstalacion({ base: "" }, PLUGIN_KEY)
      .then((id) => id && setUrlTv(`/_plugins/${encodeURIComponent(id)}/ui/tv.html`))
      .catch(() => undefined);
  }, []);
  return <VistaTv oficina={oficina} enlazar={enlazar} urlTv={urlTv} copiar={copiar} onSalir={null} pantallaCompleta={false} />;
}

aplicarTema();
window.addEventListener("storage", (e) => e.key === "paperclip.theme" && aplicarTema());
asegurarEstilos();
createRoot(document.getElementById("oficina-tv")!).render(<Tv />);
