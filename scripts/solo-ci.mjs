// `npm publish` solo desde GitHub Actions (JST-419): el paquete lo compila y lo publica el flujo
// «Publish to npm», nunca la copia de trabajo de alguien.
if (process.env.GITHUB_ACTIONS !== "true") {
  console.error("This package is only published by the «Publish to npm» workflow on GitHub Actions, never from a local checkout.");
  process.exit(1);
}
