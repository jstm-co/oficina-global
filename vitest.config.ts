import { defineConfig } from "vitest/config";
import { versionDeBuild } from "./scripts/version.mjs";

const build = versionDeBuild();

export default defineConfig({
  define: {
    __OFICINA_VERSION__: JSON.stringify(build.version),
    __OFICINA_SHA__: JSON.stringify(build.sha),
  },
  test: {
    include: ["tests/**/*.spec.ts"],
    environment: "node",
  },
});
