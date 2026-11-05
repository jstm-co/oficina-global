import { COMMIT_PLUGIN, VERSION_PLUGIN } from "../version.js";

export function PieVersion() {
  return (
    <p className="of-hint of-version" data-oficina-version={VERSION_PLUGIN} data-oficina-commit={COMMIT_PLUGIN}>
      Oficina {VERSION_PLUGIN} · {COMMIT_PLUGIN}
    </p>
  );
}
