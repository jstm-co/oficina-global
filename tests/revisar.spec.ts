import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CORREO_LIMPIO, CORREO_PERSONAL, EMPRESA_ID, IP_PRIVADA, RAIZ, RUTA_PERSONAL, apiFalsa, borrar, carpetaTemporal, configPrivada, configurarGit,
  conModulo, datosEjemplo, entornoAislado, escribir, git, python, sesionFalsa, type DatosApi, type Falla,
} from "./ayudasScripts.js";
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";

const REVISAR = join(RAIZ, "scripts/revisar.py");
// Las IPs privadas se arman por partes: el revisor pasa también por este archivo.
const ip = (...partes: number[]) => partes.join(".");
const IP_SDK = ip(10, 0, 0, 0);
const TOKEN_PCP = "pcp_" + "a1b2c3d4e5f6g7h8";
const TOKEN_GH = "ghp_" + "A1b2C3d4E5f6G7h8I9";
const BEARER = "Bearer " + "abcdefghij0123456789xyz";

interface Contexto { carpeta: string; casa: string; privado: string; env: NodeJS.ProcessEnv }

async function conContexto<T>(fn: (c: Contexto) => Promise<T>): Promise<T> {
  const carpeta = carpetaTemporal("revisar");
  try {
    const { casa, privado, env } = entornoAislado(carpeta);
    return await fn({ carpeta, casa, privado, env });
  } finally {
    borrar(carpeta);
  }
}

/** Los hallazgos que da `Revisor.linea` para cada línea, con los datos de la instancia y la configuración dados. */
async function hallazgosDeLineas(
  c: Contexto,
  lineas: string[],
  real: unknown = { empresas: [], agentes: [], titulos: [] },
  config: unknown = {},
  enDist = false,
): Promise<string[][]> {
  const entrada = JSON.stringify({ lineas, real, config, enDist });
  const r = await python(conModulo(REVISAR, `
d = json.load(sys.stdin)
rev = m.Revisor(d["real"], d["config"])
print(json.dumps([rev.linea(x, d["enDist"]) for x in d["lineas"]]))`), { env: c.env, entrada });
  expect(r.estado, r.todo).toBe(0);
  return JSON.parse(r.salida);
}

/** Lo que imprime `Revisor.texto` para cada texto (sin el «donde:línea: » del comienzo): ahí están los títulos reales, que no salen de `linea`. */
async function hallazgosDeTexto(c: Contexto, textos: string[], real: unknown, config: unknown = {}): Promise<string[][]> {
  const r = await python(conModulo(REVISAR, `
import contextlib
import io
d = json.load(sys.stdin)
rev = m.Revisor(d["real"], d["config"])
salida = []
for t in d["textos"]:
    b = io.StringIO()
    with contextlib.redirect_stdout(b):
        rev.texto("x", t)
    salida.append([l.split(": ", 1)[1] for l in b.getvalue().splitlines()])
print(json.dumps(salida))`), { env: c.env, entrada: JSON.stringify({ textos, real, config }) });
  expect(r.estado, r.todo).toBe(0);
  return JSON.parse(r.salida);
}

const realEjemplo = (titulos: { empresa: string; id: string; titulo: string }[] = []) => ({
  empresas: [{ id: "00000000-0000-0000-0000-000000000001", prefijo: "EXT", nombre: "Empresa Confidencial" }],
  agentes: [{ empresa: "EXT", id: "00000000-0000-0000-0000-0000000000a1", nombre: "Agente Inventado", cargo: null }],
  titulos,
});

describe("revisor: patrones fijos", () => {
  it("marca IP privada, correo, ruta personal y tokens", async () => {
    await conContexto(async (c) => {
      const lineas = [
        `host ${IP_PRIVADA}`, `red ${ip(10, 1, 2, 3)}`, `vpn ${ip(100, 100, 1, 1)}`, `lab ${ip(172, 20, 0, 5)}`,
        `escríbeme a ${CORREO_PERSONAL}`,
        `abre ${RUTA_PERSONAL}/proyecto`,
        `clave ${TOKEN_PCP}`, `clave ${TOKEN_GH}`, `Authorization: ${BEARER}`,
      ];
      const r = await hallazgosDeLineas(c, lineas);
      expect(r[0][0]).toMatch(/^IP privada: /);
      expect(r[1][0]).toMatch(/^IP privada: /);
      expect(r[2][0]).toMatch(/^IP privada: /);
      expect(r[3][0]).toMatch(/^IP privada: /);
      expect(r[4][0]).toMatch(/^correo: /);
      expect(r[5][0]).toContain("ruta de la carpeta personal");
      expect(r[6][0]).toMatch(/^token: /);
      expect(r[7][0]).toMatch(/^token: /);
      expect(r[8].join("|")).toContain("Bearer: ");
    });
  }, 60000);

  it("no marca lo público: IPs públicas, noreply, example.com, /Users/usuario", async () => {
    await conContexto(async (c) => {
      const lineas = [
        "dns 8.8.8.8", "red 172.32.0.1",
        "noreply@github.com", "noreply@ejemplo.cl", CORREO_LIMPIO, "alguien@example.com", "alguien@example.invalid",
        "/Users/usuario/proyecto", "/Users/<tu-usuario>/proyecto",
        "texto normal sin nada",
      ];
      const r = await hallazgosDeLineas(c, lineas);
      lineas.forEach((l, i) => expect(r[i], l).toEqual([]));
    });
  }, 60000);
});

async function conApi<T>(datos: DatosApi, falla: Falla | undefined, fn: (c: Contexto, api: Awaited<ReturnType<typeof apiFalsa>>) => Promise<T>) {
  const api = await apiFalsa(datos, falla);
  try {
    return await conContexto(async (c) => {
      sesionFalsa(c.casa, api.url);
      configPrivada(c.privado); // con sesión hace falta la configuración privada (aquí, vacía)
      return fn(c, api);
    });
  } finally {
    await api.cerrar();
  }
}

describe("revisor: patrones nuevos", () => {
  // Todo se arma por partes: este archivo también lo revisa el revisor.
  const TS_NET = "mi-equipo." + "tail1b2c3" + "." + "ts" + ".net";
  const CASA_LINUX = "/ho" + "me/ana";
  const CASA_MAC = "/Us" + "ers/ana";
  const CASA_WINDOWS = "C:" + "\\" + "Us" + "ers" + "\\ana";
  const TOKEN_HF = "hf" + "_" + "abcdefgh12345678";
  const TOKEN_NPM = "npm" + "_" + "abcdefgh12345678";
  const TOKEN_PAT = "github" + "_pat_" + "11ABCDEFGH0123456789";
  const CLAVE_AWS = "AK" + "IA" + "ABCDEFGHIJKLMNOP";
  const JWT = "ey" + "J" + "hbGciOiJIUzI1NiJ9" + "." + "ey" + "J" + "zdWIiOiIxMjM0NTY3ODkwIn0";
  const CLAVE_PRIVADA = "-----BEGIN " + "RSA PRIVATE" + " KEY-----";
  const SSHPASS = "ssh" + "pass -p " + "secreto123 ssh host";

  it("marca /home/<alguien>, C:\\Users\\<alguien> y /Users/<alguien> como ruta de la carpeta personal", async () => {
    await conContexto(async (c) => {
      const r = await hallazgosDeLineas(c, [`abre ${CASA_LINUX}/x`, `abre ${CASA_MAC}/x`, `abre ${CASA_WINDOWS}\\x`]);
      r.forEach((h) => expect(h[0]).toContain("ruta de la carpeta personal"));
    });
  }, 60000);

  it("no marca los ejemplos /home/usuario, /Users/usuario ni los marcadores con <…>", async () => {
    await conContexto(async (c) => {
      const lineas = ["/ho" + "me/usuario/x", "/Us" + "ers/usuario/x", "/ho" + "me/<tu-usuario>/x", "C:" + "\\" + "Us" + "ers" + "\\usuario\\x"];
      const r = await hallazgosDeLineas(c, lineas);
      lineas.forEach((l, i) => expect(r[i], l).toEqual([]));
    });
  }, 60000);

  it("marca direcciones *.ts.net, tokens hf_, npm_, github_pat_, AKIA…, JWT, clave privada y la contraseña en un comando ssh", async () => {
    await conContexto(async (c) => {
      const esperado: [string, string][] = [
        [`ssh ${TS_NET}`, "dirección de red privada"],
        [`HF=${TOKEN_HF}`, "token"],
        [`//registry:_authToken=${TOKEN_NPM}`, "token"],
        [`${TOKEN_PAT}`, "token"],
        [`aws ${CLAVE_AWS}`, "token"],
        [`jwt ${JWT}`, "token"],
        [CLAVE_PRIVADA, "clave privada"],
        [SSHPASS, "contraseña en un comando"],
      ];
      const r = await hallazgosDeLineas(c, esperado.map(([l]) => l));
      esperado.forEach(([l, nombre], i) => expect(r[i].join("|"), l).toContain(`${nombre}: `));
    });
  }, 60000);

  it("no marca texto parecido que no es un secreto", async () => {
    await conContexto(async (c) => {
      const lineas = ["el hf_ corto", "npm_x", "usa sshpass sin contraseña en la línea", "-----BEGIN CERTIFICATE-----", "mi-equipo.ts.net sin subdominio", "eyJ solo"];
      const r = await hallazgosDeLineas(c, lineas);
      lineas.forEach((l, i) => expect(r[i], l).toEqual([]));
    });
  }, 60000);

  it("el nombre de la empresa se marca pegado o con otro separador, y el UUID también en mayúsculas", async () => {
    await conContexto(async (c) => {
      const lineas = ["EmpresaConfidencial", "empresa_confidencial", "empresa-confidencial", "Empresa   Confidencial", "EMPRESA-CONFIDENCIAL", "Empresa Otra"];
      const r = await hallazgosDeLineas(c, lineas, realEjemplo());
      lineas.slice(0, 5).forEach((l, i) => expect(r[i], l).toHaveLength(1));
      expect(r[5]).toEqual([]);
      const ids = await hallazgosDeLineas(c, ["agente 00000000-0000-0000-0000-0000000000A1", "empresa 00000000-0000-0000-0000-000000000001", "otro 00000000-0000-0000-0000-0000000000FF"], realEjemplo());
      expect(ids[0][0]).toContain("ID de la instancia real: 00000000-0000-0000-0000-0000000000A1");
      expect(ids[1]).toHaveLength(1);
      expect(ids[2]).toEqual([]);
    });
  }, 60000);
});

describe("revisor: configuración privada", () => {
  it("aplica un patrón propio de revisar.json (por CLI)", async () => {
    await conApi(datosEjemplo(), undefined, async (c) => {
      configPrivada(c.privado, { patrones: [["nombre de proyecto", "Proyecto\\s+Aurora"]] });
      escribir(c.carpeta, "datos/nota.txt", "Hablamos del Proyecto   Aurora ayer\n");
      const r = await python([REVISAR, join(c.carpeta, "datos")], { env: c.env });
      expect(r.estado, r.todo).toBe(1);
      expect(r.salida).toContain("nota.txt:1: nombre de proyecto: Proyecto   Aurora");
    });
  }, 60000);

  it("empresas_publicas deja nombrar esa empresa y las demás siguen marcadas", async () => {
    await conContexto(async (c) => {
      const real = {
        empresas: [
          { id: "00000000-0000-0000-0000-000000000001", prefijo: "EXT", nombre: "Empresa Confidencial" },
          { id: "00000000-0000-0000-0000-000000000002", prefijo: "PUB", nombre: "Empresa Publicadora" },
        ],
        agentes: [], titulos: [],
      };
      const lineas = ["trabaja con Empresa Confidencial", "la Empresa Publicadora publica esto"];
      const sinConfig = await hallazgosDeLineas(c, lineas, real, {});
      expect(sinConfig[0]).toEqual(["empresa Empresa Confidencial: Empresa Confidencial"]);
      expect(sinConfig[1]).toEqual(["empresa Empresa Publicadora: Empresa Publicadora"]);
      const conConfig = await hallazgosDeLineas(c, lineas, real, { empresas_publicas: ["Empresa Publicadora"] });
      expect(conConfig[0]).toHaveLength(1);
      expect(conConfig[1]).toEqual([]);
    });
  }, 60000);

  it("el nombre largo se marca en cualquier caja y pegado; el corto solo como palabra entera", async () => {
    await conContexto(async (c) => {
      const real = { empresas: [
        { id: "00000000-0000-0000-0000-000000000001", prefijo: "EXT", nombre: "Empresa Confidencial" },
        { id: "00000000-0000-0000-0000-000000000003", prefijo: "ACM", nombre: "Acme" },
      ], agentes: [], titulos: [] };
      const r = await hallazgosDeLineas(c, ["EMPRESA CONFIDENCIAL", "xEmpresa Confidencial", "Acme cobra", "Acmeville cobra", "acme cobra"], real);
      expect(r[0]).toHaveLength(1);
      expect(r[1]).toHaveLength(1);
      expect(r[2]).toHaveLength(1);
      expect(r[3]).toEqual([]);
      expect(r[4]).toEqual([]);
    });
  }, 60000);

  it("un título de una empresa con prefijo público no se marca, y sus tramos tampoco en otras empresas", async () => {
    await conContexto(async (c) => {
      const real = {
        empresas: [], agentes: [],
        titulos: [
          { empresa: "PUB", id: "PUB-1", titulo: "Revisar la cola de tareas antiguas" },
          { empresa: "EXT", id: "EXT-1", titulo: "Revisar la cola de tareas pendientes" },
          { empresa: "EXT", id: "EXT-2", titulo: "Ajustar el cobro mensual del cliente" },
        ],
      };
      const lineas = [
        "revisar la cola de tareas antiguas", // título público: libre
        "revisar la cola de tareas", // tramo que también sale en un título público: no se marca
        "la cola de tareas pendientes", // tramo solo de la otra empresa
        "ajustar el cobro mensual del", // tramo solo de la otra empresa
        "ajustar el cobro mensual", // solo 4 palabras
      ];
      const r = await hallazgosDeTexto(c, lineas, real, { prefijos_publicos: ["PUB"] });
      expect(r[0]).toEqual([]);
      expect(r[1]).toEqual([]);
      expect(r[2][0]).toContain("título real: la cola de tareas pendientes ← EXT-1");
      expect(r[3][0]).toContain("← EXT-2");
      expect(r[4]).toEqual([]);
      // sin declarar el prefijo público, el título de PUB también cuenta como real
      const sin = await hallazgosDeTexto(c, ["revisar la cola de tareas antiguas"], real, {});
      expect(sin[0].length).toBeGreaterThan(0);
    });
  }, 60000);
});

describe("revisor: datos de la instancia por API", () => {
  it("marca el nombre de la empresa, los IDs de agente y de empresa, y los títulos reales por tramo de 5 palabras", async () => {
    await conApi(datosEjemplo(), undefined, async (c) => {
      escribir(c.carpeta, "datos/a.txt", "cliente: Empresa Confidencial\n");
      escribir(c.carpeta, "datos/b.txt", "agente 00000000-0000-0000-0000-0000000000a1 hizo algo\n");
      escribir(c.carpeta, "datos/c.txt", "empresa 00000000-0000-0000-0000-000000000001\n");
      escribir(c.carpeta, "datos/d.txt", "hay que Migrar la base de clientes, luego descansar\n");
      escribir(c.carpeta, "datos/e.txt", "migrar la base de clientes\nmigrar la base de nuevo\n");
      escribir(c.carpeta, "datos/limpio.txt", "nada privado aquí, solo texto\n");
      const r = await python([REVISAR, join(c.carpeta, "datos")], { env: c.env });
      expect(r.estado, r.todo).toBe(1);
      expect(r.salida).toContain("a.txt:1: empresa Empresa Confidencial");
      expect(r.salida).toContain("b.txt:1: ID de la instancia real: 00000000-0000-0000-0000-0000000000a1");
      expect(r.salida).toContain("c.txt:1: ID de la instancia real: 00000000-0000-0000-0000-000000000001");
      expect(r.salida).toContain("d.txt:1: título real: migrar la base de clientes ← EXT-1");
      expect(r.salida).toContain("e.txt:1: título real");
      expect(r.salida).not.toContain("e.txt:2");
      expect(r.salida).not.toContain("limpio.txt");
      expect(r.salida).toContain("5 hallazgos");
    });
  }, 60000);

  it("no marca un tramo que sale también en un título de un prefijo público (la configuración lo dice)", async () => {
    const datos: DatosApi = {
      empresas: [
        { id: "00000000-0000-0000-0000-000000000001", issuePrefix: "EXT", name: "Empresa Confidencial" },
        { id: "00000000-0000-0000-0000-000000000002", issuePrefix: "PUB", name: "Empresa Publicadora" },
      ],
      titulos: {
        "00000000-0000-0000-0000-000000000001": [{ identifier: "EXT-1", title: "Revisar la cola de tareas pendientes" }],
        "00000000-0000-0000-0000-000000000002": [{ identifier: "PUB-1", title: "Revisar la cola de tareas antiguas" }],
      },
    };
    await conApi(datos, undefined, async (c) => {
      configPrivada(c.privado, { empresas_publicas: ["Empresa Publicadora"], prefijos_publicos: ["PUB"] });
      escribir(c.carpeta, "datos/a.txt", "revisar la cola de tareas\n");
      escribir(c.carpeta, "datos/b.txt", "la cola de tareas pendientes\n");
      escribir(c.carpeta, "datos/c.txt", "la Empresa Publicadora\n");
      const r = await python([REVISAR, join(c.carpeta, "datos")], { env: c.env });
      expect(r.estado, r.todo).toBe(1);
      expect(r.salida).not.toContain("a.txt");
      expect(r.salida).not.toContain("c.txt");
      expect(r.salida).toContain("b.txt:1: título real: la cola de tareas pendientes ← EXT-1");
      expect(r.salida).toContain("1 hallazgos");
    });
  }, 60000);

  it("--con-dist revisa dist/ (menos lo permitido del SDK); sin él se omite", async () => {
    await conApi(datosEjemplo(), undefined, async (c) => {
      escribir(c.carpeta, "paquete/src.txt", "limpio\n");
      escribir(c.carpeta, "paquete/dist/worker.js", `const sdk = "${IP_SDK}"; const t = "${"sk-" + "ant-api03-"}"; const r = "${IP_PRIVADA}";\n`);
      const sin = await python([REVISAR, join(c.carpeta, "paquete")], { env: c.env });
      expect(sin.estado, sin.todo).toBe(0);
      expect(sin.salida).toContain("0 hallazgos");
      const con = await python([REVISAR, join(c.carpeta, "paquete"), "--con-dist"], { env: c.env });
      expect(con.estado, con.todo).toBe(1);
      expect(con.salida).toContain(`dist/worker.js:1: IP privada: ${IP_PRIVADA}`);
      expect(con.salida).not.toContain(IP_SDK);
      expect(con.salida).not.toContain("api03");
      expect(con.salida).toContain("1 hallazgos");
    });
  }, 60000);

  it("reintenta cuando una ruta responde con un 500 la primera vez", async () => {
    await conApi(datosEjemplo(), (ruta, intento, respuesta) => {
      if (ruta === "/api/companies" && intento === 1) {
        respuesta.statusCode = 500;
        respuesta.end("{}");
        return true;
      }
      return false;
    }, async (c, api) => {
      escribir(c.carpeta, "datos/a.txt", "cliente: Empresa Confidencial\n");
      const r = await python([REVISAR, join(c.carpeta, "datos")], { env: c.env });
      expect(r.estado, r.todo).toBe(1);
      expect(r.salida).toContain("a.txt:1: empresa Empresa Confidencial");
      expect(api.llamadas.get("/api/companies")).toBe(2);
    });
  }, 60000);

  it("reintenta cuando una ruta responde un JSON inválido la primera vez", async () => {
    await conApi(datosEjemplo(), (ruta, intento, respuesta) => {
      if (ruta.endsWith("/agents") && intento === 1) {
        respuesta.setHeader("content-type", "application/json");
        respuesta.end('[{"id": "cortado');
        return true;
      }
      return false;
    }, async (c, api) => {
      escribir(c.carpeta, "datos/a.txt", "agente 00000000-0000-0000-0000-0000000000a1\n");
      const r = await python([REVISAR, join(c.carpeta, "datos")], { env: c.env });
      expect(r.estado, r.todo).toBe(1);
      expect(r.salida).toContain("a.txt:1: ID de la instancia real");
      expect(api.llamadas.get(`/api/companies/00000000-0000-0000-0000-000000000001/agents`)).toBe(2);
    });
  }, 60000);

  it("reintenta cuando la respuesta llega cortada (menos bytes que los anunciados)", async () => {
    await conApi(datosEjemplo(), (ruta, intento, respuesta, solicitud) => {
      if (ruta === "/api/companies" && intento === 1) {
        respuesta.writeHead(200, { "content-type": "application/json", "content-length": "500" });
        respuesta.write('[{"id": "x"');
        // Corta la conexión a media respuesta.
        setTimeout(() => solicitud.socket.destroy(), 20);
        return true;
      }
      return false;
    }, async (c, api) => {
      escribir(c.carpeta, "datos/a.txt", "cliente: Empresa Confidencial\n");
      const r = await python([REVISAR, join(c.carpeta, "datos")], { env: c.env });
      expect(r.estado, r.todo).toBe(1);
      expect(r.salida).toContain("a.txt:1: empresa Empresa Confidencial");
      expect(api.llamadas.get("/api/companies")).toBe(2);
    });
  }, 60000);
});

describe("revisor: sin sesión del CLI ni configuración", () => {
  it("revisa solo los patrones fijos: sale 0 con una carpeta limpia y 1 si hay algo", async () => {
    await conContexto(async (c) => {
      escribir(c.carpeta, "limpia/a.txt", "texto normal\n");
      escribir(c.carpeta, "limpia/b.md", `contacto: ${CORREO_LIMPIO}, ruta /Users/usuario/x\n`);
      const limpia = await python([REVISAR, join(c.carpeta, "limpia")], { env: c.env });
      expect(limpia.estado, limpia.todo).toBe(0);
      expect(limpia.salida).toContain("reviso solo con los patrones fijos");
      expect(limpia.salida).toContain("0 hallazgos");

      escribir(c.carpeta, "sucia/a.txt", `servidor ${IP_PRIVADA}\n`);
      const sucia = await python([REVISAR, join(c.carpeta, "sucia")], { env: c.env });
      expect(sucia.estado, sucia.todo).toBe(1);
      expect(sucia.salida).toContain("a.txt:1: IP privada");
    });
  }, 60000);

  it("sin argumentos muestra el uso y sale 2", async () => {
    await conContexto(async (c) => {
      const r = await python([REVISAR], { env: c.env });
      expect(r.estado).toBe(2);
      expect(r.salida).toContain("Uso:");
    });
  }, 60000);
});

describe("Revisor.commits", () => {
  /** Un repo con tres commits: limpio, con un correo en el mensaje, y firmado con un correo no permitido. */
  async function conRepo(fn: (c: Contexto, repo: string) => Promise<void>) {
    await conContexto(async (c) => {
      const repo = join(c.carpeta, "repo");
      execFileSync("git", ["init", "--initial-branch=develop", repo], { stdio: "pipe", env: c.env });
      configurarGit(repo, c.env);
      await fn(c, repo);
    });
  }

  function commitear(repo: string, env: NodeJS.ProcessEnv, mensaje: string, extra: NodeJS.ProcessEnv = {}) {
    escribir(repo, "a.txt", `${mensaje}\n`);
    git(repo, env, "add", "-A");
    git(repo, { ...env, ...extra }, "commit", "-m", mensaje);
  }

  async function revisarCommits(c: Contexto, repo: string, rango: string[], config: unknown = {}) {
    const r = await python(conModulo(REVISAR, `
rev = m.Revisor({"empresas": [], "agentes": [], "titulos": []}, json.loads(sys.argv[3]))
n = rev.commits(Path(sys.argv[2]), *sys.argv[4:])
print("@@" + json.dumps(n))`).concat(repo, JSON.stringify(config), ...rango), { env: c.env });
    expect(r.estado, r.todo).toBe(0);
    const [antes, n] = r.salida.split("@@");
    return { n: JSON.parse(n) as number, antes };
  }

  it("un commit limpio con firma noreply no da hallazgos", async () => {
    await conRepo(async (c, repo) => {
      commitear(repo, c.env, "JST-1: cambio limpio");
      const r = await revisarCommits(c, repo, ["HEAD"]);
      expect(r.n).toBe(0);
      expect(r.antes).toBe("");
    });
  }, 60000);

  it("marca un dato privado en el mensaje", async () => {
    await conRepo(async (c, repo) => {
      commitear(repo, c.env, `JST-1: servidor en ${IP_PRIVADA}`);
      const r = await revisarCommits(c, repo, ["HEAD"]);
      expect(r.n).toBe(1);
      expect(r.antes).toMatch(/commit [0-9a-f]{7}:1: IP privada/);
    });
  }, 60000);

  it("marca una firma con un correo no permitido, del autor y del committer", async () => {
    await conRepo(async (c, repo) => {
      commitear(repo, c.env, "JST-1: firmado mal", { GIT_AUTHOR_EMAIL: CORREO_PERSONAL });
      const soloAutor = await revisarCommits(c, repo, ["HEAD"]);
      expect(soloAutor.n).toBe(1);
      expect(soloAutor.antes).toContain("correo del autor");
      expect(soloAutor.antes).not.toContain(CORREO_PERSONAL);

      commitear(repo, c.env, "JST-1: otro firmado mal", { GIT_AUTHOR_EMAIL: CORREO_PERSONAL, GIT_COMMITTER_EMAIL: CORREO_PERSONAL });
      const ambos = await revisarCommits(c, repo, ["-1", "HEAD"]);
      expect(ambos.n).toBe(2);
      expect(ambos.antes).toContain("correo del committer");
    });
  }, 60000);

  it("correos_autor de la configuración SUMA a los permitidos: la firma extra vale y las noreply de GitHub siguen valiendo", async () => {
    await conRepo(async (c, repo) => {
      const permitido = ".+@" + "correo" + "\\.cl";
      commitear(repo, c.env, "JST-1: firma propia", { GIT_AUTHOR_EMAIL: CORREO_PERSONAL, GIT_COMMITTER_EMAIL: CORREO_PERSONAL });
      expect((await revisarCommits(c, repo, ["HEAD"])).n).toBe(2); // sin la configuración no vale
      const con = await revisarCommits(c, repo, ["HEAD"], { correos_autor: [permitido] });
      expect(con.n).toBe(0);
      commitear(repo, c.env, "JST-1: firma noreply de la cuenta");
      commitear(repo, c.env, "JST-1: merge hecho en la web", { GIT_AUTHOR_EMAIL: "noreply@github.com", GIT_COMMITTER_EMAIL: "noreply@github.com" });
      const sigue = await revisarCommits(c, repo, ["-3", "HEAD"], { correos_autor: [permitido] });
      expect(sigue.n).toBe(0);
      // y un correo que no está en ninguna de las dos listas sigue marcado
      commitear(repo, c.env, "JST-1: otro correo", { GIT_AUTHOR_EMAIL: "otra" + "@" + "dominio.cl" });
      expect((await revisarCommits(c, repo, ["-1", "HEAD"], { correos_autor: [permitido] })).n).toBe(1);
    });
  }, 60000);

  it("respeta el rango: solo revisa los commits nuevos", async () => {
    await conRepo(async (c, repo) => {
      commitear(repo, c.env, `JST-1: viejo con ${IP_PRIVADA}`);
      const base = git(repo, c.env, "rev-parse", "HEAD");
      commitear(repo, c.env, "JST-1: nuevo limpio");
      const r = await revisarCommits(c, repo, [`${base}..HEAD`]);
      expect(r.n).toBe(0);
    });
  }, 60000);
});

// ---- lo que git enviaría: objetos, rutas y contenido ----

const VACIO = { empresas: [], agentes: [], titulos: [] };

async function conRepoGit(fn: (c: Contexto, repo: string) => Promise<void>) {
  await conContexto(async (c) => {
    const repo = join(c.carpeta, "repo");
    execFileSync("git", ["init", "--initial-branch=develop", repo], { stdio: "pipe", env: c.env });
    configurarGit(repo, c.env);
    await fn(c, repo);
  });
}

const commitearTodo = (c: Contexto, repo: string, mensaje: string, ...extra: string[]) => {
  git(repo, c.env, "add", "-A", ...extra);
  git(repo, c.env, "commit", "-m", mensaje);
};

/** Corre `Revisor.objetos(repo, *revs)` y devuelve lo que imprimió y cuántos hallazgos dio. */
async function revisarObjetos(c: Contexto, repo: string, revs: string[] = ["HEAD"], real: unknown = VACIO, config: unknown = {}) {
  const r = await python(conModulo(REVISAR, `
d = json.loads(sys.argv[3])
rev = m.Revisor(d["real"], d["config"])
n = rev.objetos(Path(sys.argv[2]), *d["revs"])
print("@@" + json.dumps(n))`).concat(repo, JSON.stringify({ real, config, revs })), { env: c.env });
  expect(r.estado, r.todo).toBe(0);
  const [antes, n] = r.salida.split("@@");
  return { n: JSON.parse(n) as number, antes };
}

describe("Revisor.objetos: todo lo que git enviaría, con sus rutas", () => {
  it("un archivo que un commit agrega y el siguiente borra también se marca (llega a GitHub)", async () => {
    await conRepoGit(async (c, repo) => {
      escribir(repo, "base.txt", "base\n");
      commitearTodo(c, repo, "base");
      escribir(repo, "secreto.txt", `servidor en ${IP_PRIVADA}\n`);
      commitearTodo(c, repo, "JST-1: agrega");
      git(repo, c.env, "rm", "-q", "secreto.txt");
      commitearTodo(c, repo, "JST-1: borra");
      // el árbol del último commit está limpio, pero el historial que se enviaría no
      expect(git(repo, c.env, "ls-tree", "-r", "--name-only", "HEAD")).toBe("base.txt");
      const r = await revisarObjetos(c, repo, ["HEAD"]);
      expect(r.n).toBe(1);
      expect(r.antes).toContain("secreto.txt:1: IP privada");
      // y con solo el rango de los dos commits nuevos también
      const rango = await revisarObjetos(c, repo, ["HEAD", "--not", "HEAD~2"]);
      expect(rango.n).toBe(1);
    });
  }, 60000);

  it("un archivo marcado como export-ignore en .gitattributes se revisa igual", async () => {
    await conRepoGit(async (c, repo) => {
      escribir(repo, ".gitattributes", "interno export-ignore\n");
      escribir(repo, "interno/notas.txt", `servidor en ${IP_PRIVADA}\n`);
      escribir(repo, "base.txt", "base\n");
      commitearTodo(c, repo, "JST-1: cambio");
      const r = await revisarObjetos(c, repo);
      expect(r.n).toBe(1);
      expect(r.antes).toContain("interno/notas.txt:1: IP privada");
    });
  }, 60000);

  it("el nombre de un archivo o de una carpeta con un dato privado es un hallazgo", async () => {
    await conRepoGit(async (c, repo) => {
      escribir(repo, `servidor-${IP_PRIVADA}.txt`, "limpio\n");
      escribir(repo, `copia-${IP_PRIVADA}/a.txt`, "limpio\n");
      escribir(repo, "limpio.txt", "limpio\n");
      commitearTodo(c, repo, "JST-1: cambio");
      const r = await revisarObjetos(c, repo);
      expect(r.antes).toContain(`servidor-${IP_PRIVADA}.txt: en el nombre: IP privada`);
      expect(r.antes).toContain(`copia-${IP_PRIVADA}/a.txt: en el nombre: IP privada`);
      expect(r.antes).not.toContain("limpio.txt:");
      expect(r.n).toBe(3); // el archivo, la carpeta y el archivo dentro de ella
    });
  }, 60000);

  it("el nombre de un archivo con el nombre de una empresa de la instancia también se marca", async () => {
    await conRepoGit(async (c, repo) => {
      escribir(repo, "notas-empresa-confidencial.txt", "limpio\n");
      commitearTodo(c, repo, "JST-1: cambio");
      const r = await revisarObjetos(c, repo, ["HEAD"], realEjemplo());
      expect(r.antes).toContain("notas-empresa-confidencial.txt: en el nombre: empresa Empresa Confidencial");
    });
  }, 60000);

  it("no se salta dist/, node_modules/ ni lo ignorado por .gitignore si se forzó con git add -f", async () => {
    await conRepoGit(async (c, repo) => {
      escribir(repo, ".gitignore", "dist/\nnode_modules/\n");
      escribir(repo, "base.txt", "base\n");
      commitearTodo(c, repo, "base");
      escribir(repo, "dist/x.js", `const host = "${IP_PRIVADA}";\n`);
      escribir(repo, "src/node_modules/x.txt", `host ${IP_PRIVADA}\n`);
      git(repo, c.env, "add", "-f", "dist/x.js", "src/node_modules/x.txt");
      git(repo, c.env, "commit", "-m", "JST-1: forzados");
      const r = await revisarObjetos(c, repo, ["HEAD", "--not", "HEAD~1"]);
      expect(r.antes).toContain("dist/x.js:1: IP privada");
      expect(r.antes).toContain("src/node_modules/x.txt:1: IP privada");
      expect(r.n).toBe(2);
    });
  }, 60000);

  it("lo que no es UTF-8 (latin-1 o binario) es un hallazgo fuera de las carpetas de imágenes, sonidos y referencias", async () => {
    await conRepoGit(async (c, repo) => {
      escribir(repo, "notas.txt", new Uint8Array([0x63, 0x61, 0x66, 0xe9, 0x0a])); // «café» en latin-1
      escribir(repo, "datos.bin", new Uint8Array([0x00, 0x01, 0xff, 0x10, 0x80]));
      commitearTodo(c, repo, "JST-1: no texto");
      const r = await revisarObjetos(c, repo);
      expect(r.antes).toContain("notas.txt: no es texto UTF-8");
      expect(r.antes).toContain("datos.bin: no es texto UTF-8");
      expect(r.n).toBe(2);
    });
  }, 60000);

  it("el mismo contenido en dos rutas se revisa en cada ruta: un binario permitido en static/ no deja pasar su copia en otra carpeta", async () => {
    await conRepoGit(async (c, repo) => {
      const bytes = new Uint8Array([0x00, 0xff, 0xfe, 0x01]);
      escribir(repo, "static/a.bin", bytes);
      escribir(repo, "zeta/copia.bin", bytes);
      escribir(repo, ".env", ""); // vacíos: comparten el mismo contenido
      escribir(repo, "vacio.txt", "");
      commitearTodo(c, repo, "JST-1: copias");
      const r = await revisarObjetos(c, repo);
      expect(r.antes).toContain("zeta/copia.bin: no es texto UTF-8");
      expect(r.antes).not.toContain("static/a.bin");
      expect(r.antes).toContain(".env: archivo de entorno");
    });
  }, 60000);

  it("un binario en src/ui/assets/, static/ o generador/referencias/ pasa", async () => {
    await conRepoGit(async (c, repo) => {
      const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xff, 0x00, 0xfe]);
      escribir(repo, "src/ui/assets/imagen.png", bytes);
      escribir(repo, "static/sonido.ogg", bytes);
      escribir(repo, "generador/referencias/voz.wav", bytes);
      commitearTodo(c, repo, "JST-1: imágenes");
      const r = await revisarObjetos(c, repo);
      expect(r.n, r.antes).toBe(0);
    });
  }, 60000);

  it("las rutas que nunca se publican son un hallazgo, estén o no en .gitignore: instancia.local.ts, .claude/, .env, spike/, _privado/", async () => {
    await conRepoGit(async (c, repo) => {
      const prohibidas = ["instancia.local.ts", "src/instancia.local.ts", ".claude/settings.local.json", ".env.produccion", "spike/prueba.txt", "_privado/revisar.json", "pruebas/a.txt", "publico/a.txt"];
      for (const ruta of prohibidas) escribir(repo, ruta, "limpio\n");
      escribir(repo, "src/otro.ts", "limpio\n");
      commitearTodo(c, repo, "JST-1: prohibidas");
      const r = await revisarObjetos(c, repo);
      for (const ruta of prohibidas) expect(r.antes, ruta).toMatch(new RegExp(`^${ruta.replace(/\./g, "\\.")}: (carpeta que no se publica|archivo propio de una instancia|archivo de entorno)$`, "m"));
      expect(r.antes).not.toContain("otro.ts");
    });
  }, 60000);

  it("src/instancia.ts con datos es un hallazgo; el del repo (vacío, con comentarios) no", async () => {
    await conRepoGit(async (c, repo) => {
      const delRepo = readFileSync(join(RAIZ, "src/instancia.ts"), "utf8");
      escribir(repo, "src/instancia.ts", delRepo);
      commitearTodo(c, repo, "JST-1: instancia vacía");
      const vacia = await revisarObjetos(c, repo);
      expect(vacia.n, vacia.antes).toBe(0);

      escribir(repo, "src/instancia.ts", `${delRepo}\nexport const ASPECTO_FIJO: Record<string, string> = { uno: "dos" };\n`);
      commitearTodo(c, repo, "JST-1: instancia con datos");
      const con = await revisarObjetos(c, repo, ["HEAD", "--not", "HEAD~1"]);
      expect(con.antes).toContain("src/instancia.ts: trae datos de una instancia");
      expect(con.n).toBe(1);
    });
  }, 60000);

  it("un título real partido entre dos líneas de un archivo se marca; lo que no se parece, no", async () => {
    await conRepoGit(async (c, repo) => {
      const real = realEjemplo([{ empresa: "EXT", id: "EXT-1", titulo: "Migrar la base de clientes antiguos" }]);
      escribir(repo, "partido.md", "hay que migrar la base de\nclientes antiguos pronto\n");
      escribir(repo, "entero.md", "hay que migrar la base de clientes antiguos\n");
      escribir(repo, "limpio.md", "hay que migrar la base\nde datos\n");
      commitearTodo(c, repo, "JST-1: textos");
      const r = await revisarObjetos(c, repo, ["HEAD"], real);
      expect(r.antes).toContain("partido.md:1: título real: migrar la base de clientes ← EXT-1");
      expect(r.antes).toContain("entero.md:1: título real");
      expect(r.antes).not.toContain("limpio.md");
    });
  }, 60000);

  it("un título real partido entre dos líneas del cuerpo de un mensaje de commit se marca", async () => {
    await conRepoGit(async (c, repo) => {
      const real = realEjemplo([{ empresa: "EXT", id: "EXT-1", titulo: "Migrar la base de clientes antiguos" }]);
      escribir(repo, "a.txt", "a\n");
      git(repo, c.env, "add", "-A");
      git(repo, c.env, "commit", "-m", "JST-1: cambio", "-m", "Esto sale de migrar la base de\nclientes antiguos, cortado a 72 columnas.");
      const r = await python(conModulo(REVISAR, `
d = json.loads(sys.argv[3])
rev = m.Revisor(d["real"], {})
n = rev.commits(Path(sys.argv[2]), "HEAD")
print("@@" + json.dumps(n))`).concat(repo, JSON.stringify({ real })), { env: c.env });
      expect(r.estado, r.todo).toBe(0);
      expect(r.salida).toMatch(/commit [0-9a-f]{7}:\d+: título real: migrar la base de clientes ← EXT-1/);
      expect(r.salida).toContain("@@1");
    });
  }, 60000);
});

describe("Revisor.tag", () => {
  it("revisa el mensaje de un tag anotado", async () => {
    await conRepoGit(async (c, repo) => {
      escribir(repo, "a.txt", "a\n");
      commitearTodo(c, repo, "JST-1: cambio");
      git(repo, c.env, "tag", "-a", "v1", "-m", `versión de ${IP_PRIVADA}`);
      git(repo, c.env, "tag", "-a", "v2", "-m", "versión limpia");
      const salida = async (tag: string) => {
        const sha = git(repo, c.env, "rev-parse", tag);
        const r = await python(conModulo(REVISAR, `
rev = m.Revisor({"empresas": [], "agentes": [], "titulos": []}, {})
print("@@" + json.dumps(rev.tag(Path(sys.argv[2]), sys.argv[3])))`).concat(repo, sha), { env: c.env });
        expect(r.estado, r.todo).toBe(0);
        return r.salida;
      };
      expect(await salida("v1")).toMatch(/tag [0-9a-f]{7}:\d+: IP privada[^@]*@@1/);
      expect(await salida("v2")).toBe("@@0\n");
    });
  }, 60000);
});

describe("armar: falla cerrado", () => {
  const SESION_MUERTA = "http://127.0.0.1:9";
  const correrCli = (c: Contexto) => {
    escribir(c.carpeta, "datos/a.txt", "texto limpio\n");
    return python([REVISAR, join(c.carpeta, "datos")], { env: c.env });
  };

  it("con sesión del CLI pero sin revisar.json: sale 1 y no revisa a ciegas", async () => {
    await conContexto(async (c) => {
      sesionFalsa(c.casa, SESION_MUERTA);
      const r = await correrCli(c);
      expect(r.estado, r.todo).toBe(1);
      expect(r.salida).toContain("falta la configuración privada");
      expect(r.salida).toContain("No reviso a ciegas");
      expect(r.salida).not.toContain("hallazgos");
    });
  }, 60000);

  it("con revisar.json pero sin sesión del CLI: sale 1 y no revisa a ciegas", async () => {
    await conContexto(async (c) => {
      configPrivada(c.privado);
      const r = await correrCli(c);
      expect(r.estado, r.todo).toBe(1);
      expect(r.salida).toContain("no hay sesión del CLI");
      expect(r.salida).toContain("No reviso a ciegas");
      expect(r.salida).not.toContain("hallazgos");
    });
  }, 60000);

  it("sin sesión ni revisar.json avisa que revisa solo con los patrones fijos y sigue", async () => {
    await conContexto(async (c) => {
      const r = await correrCli(c);
      expect(r.estado, r.todo).toBe(0);
      expect(r.salida).toContain("Aviso: sin sesión de Paperclip ni configuración privada, reviso solo con los patrones fijos.");
      expect(r.salida).toContain("0 hallazgos");
    });
  }, 60000);

  it("si la API devuelve 0 empresas se detiene (SinDatos) y no deja caché", async () => {
    await conApi({ empresas: [] }, undefined, async (c) => {
      const cli = await correrCli(c);
      expect(cli.estado, cli.todo).toBe(1);
      expect(cli.salida).toContain("no devolvió ninguna empresa");
      expect(cli.salida).not.toContain("hallazgos");

      const cache = join(c.carpeta, "cache.json");
      const r = await python(conModulo(REVISAR, `
try:
    m.armar(Path(sys.argv[2]), cache=Path(sys.argv[3]), vale=900)
except m.SinDatos as e:
    print("SinDatos: " + str(e))`).concat(c.carpeta, cache), { env: c.env });
      expect(r.estado, r.todo).toBe(0);
      expect(r.salida).toContain("SinDatos: La instancia de Paperclip no devolvió ninguna empresa");
      expect(existsSync(cache)).toBe(false);
    });
  }, 60000);

  it("una respuesta que es un objeto sin `items` es un error, no una lista vacía silenciosa", async () => {
    await conApi(datosEjemplo(), (ruta, _i, respuesta) => {
      if (ruta === "/api/companies") {
        respuesta.setHeader("content-type", "application/json");
        respuesta.end(JSON.stringify({ error: "algo salió mal" }));
        return true;
      }
      return false;
    }, async (c) => {
      const r = await correrCli(c);
      expect(r.estado, r.todo).toBe(1);
      expect(r.salida).toContain("algo que no es una lista en /api/companies");
      expect(r.salida).not.toContain("hallazgos");
    });
  }, 60000);

  it("una respuesta con `items` sí vale como lista", async () => {
    await conApi(datosEjemplo(), (ruta, _i, respuesta) => {
      if (ruta === "/api/companies") {
        respuesta.setHeader("content-type", "application/json");
        respuesta.end(JSON.stringify({ items: datosEjemplo().empresas }));
        return true;
      }
      return false;
    }, async (c) => {
      escribir(c.carpeta, "datos/a.txt", "cliente: Empresa Confidencial\n");
      const r = await python([REVISAR, join(c.carpeta, "datos")], { env: c.env });
      expect(r.estado, r.todo).toBe(1);
      expect(r.salida).toContain("a.txt:1: empresa Empresa Confidencial");
    });
  }, 60000);

  it("si la instancia no responde se detiene con SinDatos (no revisa a ciegas)", async () => {
    const muerta = await apiFalsa(datosEjemplo());
    const url = muerta.url;
    await muerta.cerrar();
    await conContexto(async (c) => {
      sesionFalsa(c.casa, url);
      configPrivada(c.privado);
      const r = await python(conModulo(REVISAR, `
m.time.sleep = lambda s: None
try:
    m.armar(Path(sys.argv[2]), cache=Path(sys.argv[3]), vale=900)
except m.SinDatos as e:
    print("SinDatos: " + str(e))`).concat(c.carpeta, join(c.carpeta, "cache.json")), { env: c.env });
      expect(r.estado, r.todo).toBe(0);
      expect(r.salida).toContain("SinDatos: No pude leer los datos de la instancia");
      expect(r.salida).toContain("No reviso a ciegas");
      expect(existsSync(join(c.carpeta, "cache.json"))).toBe(false);
    });
  }, 60000);

  it("sin sesión (patrones fijos) no escribe la caché", async () => {
    await conContexto(async (c) => {
      const cache = join(c.carpeta, "cache.json");
      const r = await python(conModulo(REVISAR, `m.armar(Path(sys.argv[2]), cache=Path(sys.argv[3]), vale=900)`).concat(c.carpeta, cache), { env: c.env });
      expect(r.estado, r.todo).toBe(0);
      expect(existsSync(cache)).toBe(false);
    });
  }, 60000);

  it("una lectura completa con sesión deja la caché con permisos 600 y la siguiente lectura la usa sin llamar a la API", async () => {
    await conApi(datosEjemplo(), undefined, async (c, api) => {
      const cache = join(c.carpeta, "cache.json");
      const codigo = `m.armar(Path(sys.argv[2]), cache=Path(sys.argv[3]), vale=900)`;
      const primera = await python(conModulo(REVISAR, codigo).concat(c.carpeta, cache), { env: c.env });
      expect(primera.estado, primera.todo).toBe(0);
      expect(statSync(cache).mode & 0o777).toBe(0o600);
      expect(JSON.parse(readFileSync(cache, "utf8")).empresas).toHaveLength(1);
      const llamadas = api.urls.length;
      const segunda = await python(conModulo(REVISAR, codigo).concat(c.carpeta, cache), { env: c.env });
      expect(segunda.estado, segunda.todo).toBe(0);
      expect(api.urls.length).toBe(llamadas);
    });
  }, 60000);
});

describe("leer_real: paginación de las tareas", () => {
  it("pide las tareas de a 1000 con limit y offset: un título que solo está en la tarea 1.001 se marca", async () => {
    const datos = datosEjemplo();
    const titulos = Array.from({ length: 1000 }, (_, i) => ({ identifier: `EXT-${i + 1}`, title: `Tarea de relleno numero ${i + 1} sin nada`}));
    titulos.push({ identifier: "EXT-1001", title: "Cerrar el contrato con la clienta nueva" });
    datos.titulos = { [EMPRESA_ID]: titulos };
    await conApi(datos, undefined, async (c, api) => {
      escribir(c.carpeta, "datos/a.txt", "pendiente: cerrar el contrato con la clienta nueva\n");
      escribir(c.carpeta, "datos/b.txt", "pendiente: tarea de relleno numero 7 sin nada\n");
      escribir(c.carpeta, "datos/c.txt", "nada que ver\n");
      const r = await python([REVISAR, join(c.carpeta, "datos")], { env: c.env });
      expect(r.estado, r.todo).toBe(1);
      expect(r.salida).toContain("a.txt:1: título real: cerrar el contrato con la ← EXT-1001");
      expect(r.salida).toContain("b.txt:1: título real");
      expect(r.salida).not.toContain("c.txt");
      const done = api.urls.filter((u) => u.includes("status=done"));
      expect(done).toHaveLength(2);
      expect(done[0]).toContain("limit=1000&offset=0");
      expect(done[1]).toContain("limit=1000&offset=1000");
    });
  }, 60000);

  it("una lista de justo 1000 pide la página siguiente, que viene vacía, y termina", async () => {
    const datos = datosEjemplo();
    datos.titulos = { [EMPRESA_ID]: Array.from({ length: 1000 }, (_, i) => ({ identifier: `EXT-${i + 1}`, title: `Tarea de relleno numero ${i + 1} sin nada` })) };
    await conApi(datos, undefined, async (c, api) => {
      const r = await correrCliLimpio(c);
      expect(r.estado, r.todo).toBe(0);
      expect(api.urls.filter((u) => u.includes("status=done"))).toHaveLength(2);
    });
  }, 60000);
});

function correrCliLimpio(c: Contexto) {
  escribir(c.carpeta, "datos/a.txt", "texto limpio\n");
  return python([REVISAR, join(c.carpeta, "datos")], { env: c.env });
}

describe("carpeta_privada", () => {
  it("desde un worktree da la carpeta _privado junto al repo PRINCIPAL, no junto al worktree", async () => {
    await conContexto(async (c) => {
      const principal = join(c.carpeta, "principal");
      const repo = join(principal, "repo");
      mkdirSync(principal, { recursive: true });
      execFileSync("git", ["init", "--initial-branch=develop", repo], { stdio: "pipe", env: c.env });
      configurarGit(repo, c.env);
      escribir(repo, "a.txt", "a\n");
      git(repo, c.env, "add", "-A");
      git(repo, c.env, "commit", "-m", "base");
      configPrivada(join(principal, "_privado"), { gh_cuenta: "cuenta-de-prueba" });
      const arbol = join(c.carpeta, "otro", "arbol");
      mkdirSync(join(c.carpeta, "otro"), { recursive: true });
      git(repo, c.env, "worktree", "add", "-b", "rama", arbol);

      const env = { ...c.env };
      delete env.OFICINA_PRIVADO; // esta prueba se aísla sola: HOME ya es temporal
      const codigo = `print(json.dumps([str(m.carpeta_privada(Path(sys.argv[2]))), m.leer_config(Path(sys.argv[2]))]))`;
      const esperado = realpathSync(join(principal, "_privado"));
      for (const donde of [repo, arbol]) {
        const r = await python(conModulo(REVISAR, codigo).concat(donde), { env });
        expect(r.estado, r.todo).toBe(0);
        const [carpeta, config] = JSON.parse(r.salida);
        expect(realpathSync(carpeta), donde).toBe(esperado);
        expect(config).toEqual({ gh_cuenta: "cuenta-de-prueba" });
      }
      // OFICINA_PRIVADO manda sobre lo demás
      const r = await python(conModulo(REVISAR, codigo).concat(arbol), { env: c.env });
      expect(JSON.parse(r.salida)[0]).toBe(c.privado);
    });
  }, 60000);
});
