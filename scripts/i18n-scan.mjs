// Textos traducibles del código (JST-413): los busca en `src/` y los compara
// con un catálogo. Lo usa la prueba `tests/i18n.spec.ts`; desde la terminal
// revisa solo los archivos que se le pasan:
//
//   node scripts/i18n-scan.mjs src/ui/filters.tsx src/ui/views.tsx
//
// Un texto traducible es el primer argumento, siempre literal, de `t()`, `tx()`
// o `msg()`, y las dos formas de `plural(n, "una", "muchas")`.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
/** La maquinaria de idiomas nombra `t()` en sus comentarios y ejemplos: no se revisa. */
const SKIP = [/^src\/i18n\.ts$/, /^src\/i18n\//, /^src\/ui\/i18n\.tsx$/];

const LITERAL = String.raw`"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|` + "`((?:[^`\\\\]|\\\\.)*)`";
const CALL = new RegExp(String.raw`(?<![\w.$])(t|tx|msg)\(\s*(?:${LITERAL})`, "g");
const PLURAL = /(?<![\w.$])plural\(/g;

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts") ? [path] : [];
  });
}

/** Sin comentarios: un ejemplo dentro de un comentario no es un texto de la interfaz. */
function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[\s;{}(),])\/\/.*$/gm, "$1");
}

function decode(double, single, backtick) {
  if (double !== undefined) return JSON.parse(`"${double}"`);
  if (single !== undefined) return JSON.parse(`"${single.replace(/\\'/g, "'").replace(/"/g, '\\"')}"`);
  if (backtick.includes("${")) return null;
  return JSON.parse(`"${backtick.replace(/\\`/g, "`").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`);
}

/** Los argumentos de una llamada, desde su paréntesis de apertura, cortados por las comas de primer nivel. */
function callArgs(code, open) {
  const args = [];
  let depth = 0;
  let start = open + 1;
  let quote = null;
  for (let i = open; i < code.length; i++) {
    const ch = code[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") {
      depth--;
      if (depth === 0) {
        args.push(code.slice(start, i).trim());
        return args;
      }
    } else if (ch === "," && depth === 1) {
      args.push(code.slice(start, i).trim());
      start = i + 1;
    }
  }
  return args;
}

const WHOLE_LITERAL = new RegExp(`^(?:${LITERAL})$`);

/**
 * @param {string[]} [files] rutas relativas a la raíz del repo; sin lista, todo `src/`.
 * @returns {{ sources: Map<string, string[]>, problems: string[] }} cada texto con los archivos que lo usan.
 */
export function scanSources(files) {
  const paths = (files ?? sourceFiles(join(ROOT, "src")).map((path) => relative(ROOT, path))).filter((path) => !SKIP.some((skip) => skip.test(path)));
  const sources = new Map();
  const problems = [];
  const add = (text, file) => {
    const list = sources.get(text) ?? [];
    if (!list.includes(file)) list.push(file);
    sources.set(text, list);
  };
  for (const file of paths) {
    const code = stripComments(readFileSync(join(ROOT, file), "utf8"));
    for (const match of code.matchAll(CALL)) {
      const text = decode(match[2], match[3], match[4]);
      if (text === null) problems.push(`${file}: ${match[1]}() con \${…} dentro del texto; usa {marcadores} y pasa los valores aparte`);
      else add(text, file);
    }
    for (const match of code.matchAll(PLURAL)) {
      const args = callArgs(code, match.index + match[0].length - 1);
      for (const arg of args.slice(1, 3)) {
        const literal = WHOLE_LITERAL.exec(arg);
        // `plural(n, one, many)` con variables: sus textos tienen que venir marcados con msg().
        if (!literal) continue;
        const text = decode(literal[1], literal[2], literal[3]);
        if (text === null) problems.push(`${file}: plural() con \${…} dentro del texto`);
        else add(text, file);
      }
    }
  }
  return { sources, problems };
}

/** Los `{marcadores}` de un texto, ordenados. */
export function placeholders(text) {
  return [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]))].sort();
}

/** Qué le falta, le sobra o no calza a un catálogo frente a los textos del código. */
export function checkCatalog(sources, catalog) {
  const missing = [...sources.keys()].filter((text) => !Object.hasOwn(catalog, text));
  const unused = Object.keys(catalog).filter((text) => !sources.has(text));
  const mismatched = Object.keys(catalog).filter((text) => placeholders(text).join() !== placeholders(catalog[text]).join());
  return { missing, unused, mismatched };
}

// Desde la terminal: los textos de los archivos dados que todavía no están en el catálogo en inglés.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error("uso: node scripts/i18n-scan.mjs <archivo>…");
    process.exit(2);
  }
  const dir = join(ROOT, "src/i18n/en");
  const catalog = {};
  for (const name of readdirSync(dir).filter((entry) => entry.endsWith(".ts") && entry !== "index.ts")) {
    const part = await import(pathToFileURL(join(dir, name)).href);
    Object.assign(catalog, ...Object.values(part));
  }
  const { sources, problems } = scanSources(files);
  const { missing, mismatched } = checkCatalog(sources, catalog);
  for (const problem of problems) console.log(`PROBLEMA  ${problem}`);
  for (const text of missing) console.log(`FALTA     ${JSON.stringify(text)}  (${sources.get(text).join(", ")})`);
  for (const text of mismatched.filter((key) => sources.has(key))) console.log(`MARCADOR  ${JSON.stringify(text)} → ${JSON.stringify(catalog[text])}`);
  console.log(`${sources.size} textos en ${files.length} archivos · faltan ${missing.length} · problemas ${problems.length}`);
  process.exit(missing.length || problems.length ? 1 : 0);
}
