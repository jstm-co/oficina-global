"""Decorados de «Oficina global» (JST-416): una hoja de muebles y unas baldosas por decorado.

Uso:  python3.11 -I src/ui/assets/fuente/decorados.py [clasico] [madera]
      python3.11 -I src/ui/assets/fuente/decorados.py --comprobar     (no escribe nada: ve que lo guardado es lo que genera el código)
Genera en decorados/<id>/:
  muebles.png          misma disposición EXACTA que ../muebles.png (el atlas es uno solo: muebles.json), con otros colores
                       y algunas piezas redibujadas (misma huella) o nuevas (`chimenea`, que en la clásica está vacía)
  baldosas/*.png       piso de la oficina, piso del descanso y pared (con la franja de cada empresa), en claro y oscuro

La hoja clásica sale de muebles.py (`clasico`: la misma hoja y el mismo `muebles.json` que arma sprites.py, pero solo los
muebles, y con paleta); las piezas nuevas se agregan siempre al final del atlas para que las de antes no se muevan.
Para sumar un decorado se agrega una función `<id>()` que devuelve
(piezas, baldosas) y se anota en DECORADOS.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from PIL import Image  # noqa: E402

import muebles as M  # noqa: E402
from muebles import CO, O, Pic, dark, hx, light, mix  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SALIDA = ROOT / "decorados"


# ------------------------------------------------------------------------------------------------ Madera
# Cabaña o estudio: tablones, paredes de tono cálido con zócalo de madera, cuero, lana y libros.
M_MADERA = hx("#6e4626")  # marcos y patas
M_MADERA2 = hx("#8f6035")
M_MADERA3 = hx("#c08a52")  # tapas claras


def ventana_madera(noche):
    """Ventana con marco de madera y cortinas, 24x16 (misma huella que la de `muebles.ventana`)."""
    p = Pic(24, 16)
    marco = hx("#6e4626")
    cielo = hx("#1d2a4d") if noche else hx("#9fd2f2")
    p.box(0, 0, 24, 16, cielo, marco)
    p.vline(12, 1, 14, marco)
    p.hline(1, 8, 22, marco)
    if noche:
        for (x, y) in [(5, 3), (9, 5), (16, 2), (20, 6), (6, 11), (18, 12)]:
            p.px(x, y, hx("#fde68a"))
        p.rect(15, 10, 3, 3, hx("#f6f2ea"))
    else:
        p.rect(5, 3, 4, 2, hx("#ffffff")); p.rect(4, 4, 6, 1, hx("#ffffff"))
        p.rect(15, 11, 5, 2, hx("#ffffff"))
    tela = hx("#a8572f") if not noche else hx("#7a3f22")
    tela2 = light(tela, .18) if not noche else dark(tela, .1)
    # cortinas recogidas a los lados y cenefa arriba
    for x0 in (1, 19):
        p.rect(x0, 1, 4, 14, tela)
        p.vline(x0 + 1, 1, 14, tela2)
    p.rect(1, 1, 22, 2, dark(tela, .15))
    p.hline(1, 3, 22, dark(tela, .35))
    p.rect(0, 15, 24, 1, O)
    return p.im


def reloj_madera():
    p = Pic(9, 9)
    p.rows([".ooooooo.", "owwwwwwwo", "owwwowwwo", "owwwowwwo", "owwwoooow", "owwwwwwwo", "owwwwwwwo", ".ooooooo.", "........."], 0, 0, {"o": M_MADERA, "w": hx("#f3e6c8")})
    p.px(8, 4, M_MADERA)
    return p.im


def corcho():
    """Tablero de corcho con notas en el lugar de la pizarra, 26x16."""
    p = Pic(26, 16)
    p.box(0, 0, 26, 14, hx("#c89a62"), M_MADERA)
    p.rect(1, 1, 24, 12, hx("#c89a62"))
    for (x, y) in [(3, 11), (9, 2), (21, 10), (16, 6), (5, 6), (22, 3)]:
        p.px(x, y, hx("#a97a47"))
    notas = [(3, 3, 5, 4, "#f6f2ea"), (10, 3, 4, 3, "#f2d36b"), (16, 2, 5, 5, "#f2a38a"), (4, 9, 4, 3, "#f2d36b"), (11, 8, 6, 4, "#f6f2ea"), (19, 9, 4, 3, "#9fd2b0")]
    for (x, y, w, h, c) in notas:
        p.rect(x, y, w, h, hx(c))
        p.px(x + w // 2, y, hx("#c8413b"))
        p.hline(x + 1, y + h - 1, max(1, w - 2), hx("#8b6a4a"))
    p.rect(4, 14, 18, 2, M_MADERA)
    return p.im


def estante_libros():
    """Estante de madera oscura con los libros más apretados y un par de adornos, 22x26."""
    p = Pic(22, 26)
    p.box(0, 0, 22, 26, M_MADERA)
    cols = ["#9c3b2e", "#c9852f", "#3f6b4a", "#2f4a6b", "#e6d8b4", "#7a4a2a", "#b25a3a", "#5d3a63", "#d8a23c"]
    for s, y in enumerate((2, 10, 18)):
        x = 2
        k = s * 4 + 1
        while x < 19:
            w = 2 + (k % 2)
            h = 6 - (k % 4 == 0) - (k % 5 == 0)
            if s == 0 and x >= 14:
                break  # el primer estante deja un hueco para un adorno
            p.rect(x, y + (6 - h), w, h, hx(cols[k % len(cols)]))
            p.vline(x + w, y + (6 - h), h, O)
            p.px(x, y + (6 - h), light(hx(cols[k % len(cols)]), .3))
            x += w + 1
            k += 1
        p.hline(1, y + 6, 20, O)
    # un tarro con una planta chica en el primer estante
    p.box(15, 4, 4, 3, hx("#c86f4b"))
    p.px(16, 2, hx("#3f9a5a")); p.px(17, 3, hx("#3f9a5a")); p.px(18, 2, hx("#7fd393")); p.px(16, 3, hx("#2e6b40"))
    return p.im


def lampara_pie():
    """Lámpara de pie con pantalla de tela encendida y pie de madera, 10x24."""
    p = Pic(10, 24)
    luz, luz2 = hx("#ffe9a8"), hx("#f6c85f")
    p.rows(["..oooooo..", ".ollllllo.", "olllllllyo", "olllyylllo", "oyyyyyyyyo", "oooooooooo"], 0, 0, {"o": O, "l": luz, "y": luz2})
    p.px(2, 1, luz); p.px(7, 1, luz)
    p.rect(4, 6, 2, 15, M_MADERA2)
    p.vline(4, 6, 15, M_MADERA3)
    p.box(2, 21, 6, 3, M_MADERA)
    p.hline(3, 22, 4, M_MADERA2)
    return p.im


def chimenea():
    """Chimenea contra el muro, con repisa, ladrillo y fuego, 28x22."""
    p = Pic(28, 22)
    ladrillo, mortero = hx("#a85d45"), hx("#7a3f2f")
    # repisa y lo que lleva encima
    p.box(0, 3, 28, 3, M_MADERA3, M_MADERA)
    p.hline(1, 4, 26, light(M_MADERA3, .25))
    p.rect(4, 1, 2, 2, hx("#f6f2ea")); p.px(4, 0, hx("#f2b544")); p.px(5, 0, hx("#ffe9a0"))  # vela
    p.rect(20, 1, 3, 2, hx("#c86f4b")); p.px(21, 0, hx("#3f9a5a")); p.px(22, 0, hx("#7fd393"))  # maceta
    # frente de ladrillo
    p.rect(2, 6, 24, 16, O)
    p.rect(3, 6, 22, 16, ladrillo)
    for y in (9, 13, 17):
        p.hline(3, y, 22, mortero)
    for y, xs in [(6, (8, 16, 22)), (10, (5, 12, 19)), (14, (8, 16, 22)), (18, (5, 12, 19))]:
        for x in xs:
            p.vline(x, y, 3, mortero)
    # hogar: abertura oscura, brasas, llamas y troncos
    p.rect(7, 9, 14, 13, O)
    p.rect(8, 10, 12, 12, hx("#241510"))
    p.rows([
        ".....r.....",
        "....rr..r..",
        "...rryr.rr.",
        "..rryyyrry.",
        "..ryywyyyr.",
        ".rryywwyyyr",
        ".ryywwwwyyr",
    ], 8, 13, {"r": hx("#d9531e"), "y": hx("#f7b733"), "w": hx("#ffe9a0")})
    p.rect(8, 20, 12, 2, hx("#6b4226"))
    p.hline(8, 20, 12, hx("#8f5c36"))
    p.rect(11, 19, 6, 1, hx("#8f5c36"))
    p.px(9, 21, hx("#d9531e")); p.px(18, 21, hx("#d9531e"))
    # losa del suelo, un poco más ancha
    p.rect(0, 21, 28, 1, O)
    p.rect(1, 20, 1, 1, hx("#8a7a6e")); p.rect(26, 20, 1, 1, hx("#8a7a6e"))
    return p.im


def alfombra_tejida(base, borde, dibujo):
    """Alfombra tejida vista desde arriba, 60x30 (misma huella que la de la sala): franja crema y rombos."""
    p = Pic(60, 30)
    p.box(0, 0, 60, 30, base)
    p.rect(2, 2, 56, 26, borde)
    p.rect(3, 3, 54, 24, base)
    # el borde crema lleva un zigzag
    for x in range(2, 58, 2):
        p.px(x, 2, dibujo); p.px(x + 1, 27, dibujo)
    for y in range(3, 27, 2):
        p.px(2, y + 1, dibujo); p.px(57, y, dibujo)
    # rombos tenues (poco contraste: encima se paran los agentes)
    for cx in range(9, 54, 9):
        for cy in (9, 20):
            for dy in range(-3, 4):
                for dx in range(-3, 4):
                    d = abs(dx) + abs(dy)
                    if d == 3 or d == 0:
                        p.px(cx + dx, cy + dy, dibujo)
    for cx in range(13, 50, 9):
        for cy in (14,):
            p.px(cx, cy, dibujo)
    return p.im


# ---- baldosas de la Madera
def tablones(base, junta, alto_tabla, cortes, variacion, veta, semilla):
    """Tablones largos, 64x16 (JST-416). Cada fila de tablones lleva sus juntas de punta en otro lugar (`cortes`: por fila,
    las x donde termina un tablón; la tabla que cruza el borde de la baldosa es una sola). Las juntas son del color de la
    tabla apenas más oscuro (se leen como tablones y no como ladrillos), cada tabla se ve un poco distinta de la de al lado
    y lleva una veta leve (rayitas de 1 px a lo largo)."""
    W = 64
    p = Pic(W, 16)
    azar = semilla
    def sorteo(n):
        nonlocal azar
        azar = (azar * 1103515245 + 12345) & 0x7FFFFFFF
        return (azar >> 8) % n
    for f in range(16 // alto_tabla):
        y = f * alto_tabla
        xs = sorted(cortes[f])
        # tabla k: de xs[k-1] a xs[k]; la última se junta con la primera (cruza el borde de la baldosa)
        tono = {}
        for k in range(len(xs)):
            tono[k] = mix(base, variacion, (0.0, 0.3, 0.12, 0.45)[(f * 3 + k) % 4])
        def indice(x):
            for k, c in enumerate(xs):
                if x < c:
                    return k
            return 0
        for x in range(W):
            t = tono[indice(x)]
            p.rect(x, y, 1, alto_tabla - 1, t)
            p.px(x, y + alto_tabla - 1, junta)
        for c in xs:
            p.vline(c, y, alto_tabla - 1, junta)
        # veta: rayitas de 1 px de largo 4 a 8, apenas más oscuras, una o dos por tabla
        for k, c in enumerate(xs):
            ini = c
            fin = xs[(k + 1) % len(xs)] + (W if k == len(xs) - 1 else 0)
            for _ in range(1 if alto_tabla < 6 else 3):
                largo = 4 + sorteo(5)
                x0 = ini + 1 + sorteo(max(1, fin - ini - largo - 1))
                yy = y + 1 + sorteo(max(1, alto_tabla - 3))
                for dx in range(largo):
                    p.px((x0 + dx) % W, yy, mix(tono[k], veta, .5))
    return p.im


def piso_oficina(t):
    """Escritorios: tablones angostos (4 px de alto) y medianos de largo, tono miel."""
    cortes = [(6, 41), (30,), (13, 50), (22,)]
    if not t:
        return tablones(hx("#c99863"), hx("#b58a58"), 4, cortes, hx("#bd8d5a"), hx("#bd8d5a"), 7)
    return tablones(hx("#52402f"), hx("#4a3a2b"), 4, cortes, hx("#493a2b"), hx("#493a2b"), 7)


def piso_descanso(t):
    """Descanso: tablones más anchos (8 px de alto), más claros y de otro tono, para que se note otra zona."""
    cortes = [(14,), (47,)]
    if not t:
        return tablones(hx("#e3c294"), hx("#cfae7f"), 8, cortes, hx("#d6b685"), hx("#d3b17f"), 11)
    return tablones(hx("#66503b"), hx("#5a4634"), 8, cortes, hx("#5c4836"), hx("#5a4634"), 11)


def pared_madera(c, t):
    """Muro de tablas cálidas con zócalo de madera y la franja de la empresa. 16x22."""
    muro = hx("#ead7b3") if not t else hx("#4a3828")
    rayas = hx("#d6b98a") if not t else hx("#3e2f21")
    viga = hx("#5a3a24") if not t else hx("#21160f")
    zocalo = hx("#8a5a34") if not t else hx("#33261b")
    p = Pic(16, 22)
    p.rect(0, 0, 16, 2, viga)
    p.rect(0, 2, 16, 12, muro)
    for y in (5, 8, 11):
        p.hline(0, y, 16, rayas)
    p.px(3, 3, rayas); p.px(11, 6, rayas); p.px(7, 9, rayas); p.px(14, 12, rayas)
    franja = c if not t else dark(c, .25)
    p.rect(0, 14, 16, 3, franja)
    p.hline(0, 14, 16, light(c, .25) if not t else c)
    p.rect(0, 17, 16, 5, zocalo)
    p.hline(0, 17, 16, light(zocalo, .2))
    p.hline(0, 20, 16, dark(zocalo, .2))
    p.hline(0, 21, 16, dark(zocalo, .45))
    return p.im


def madera():
    """(piezas que cambian respecto de la clásica, baldosas) de la Madera."""
    # Los muebles de madera de `muebles.py` leen estos colores como globales: se cambian solo mientras se arman las piezas y se reponen siempre.
    clasicos = (M.WOOD, M.WOOD2, M.WOOD3)
    M.WOOD, M.WOOD2, M.WOOD3 = M_MADERA3, M_MADERA2, hx("#d9ad75")
    try:
        items = M.piezas({
            "sofa": "#7b4f33",
            "sofa-calido": "#a8572f",
            "puff": "#d9a441",
            "puff-2": "#8a4b34",
            "alfombra-sala": "#a0522d",
            "alfombra-sala-2": "#5f6f3f",
        })
    finally:
        M.WOOD, M.WOOD2, M.WOOD3 = clasicos
    items["ventana-dia"] = ventana_madera(False)
    items["ventana-noche"] = ventana_madera(True)
    items["reloj"] = reloj_madera()
    items["pizarra"] = corcho()
    items["estante"] = estante_libros()
    items["lampara"] = lampara_pie()
    items["chimenea"] = chimenea()
    items["alfombra-sala"] = alfombra_tejida(hx("#a0522d"), hx("#ecdcb8"), hx("#c27a4c"))
    items["alfombra-sala-2"] = alfombra_tejida(hx("#5f6f3f"), hx("#ecdcb8"), hx("#869757"))
    baldosas = {}
    for t, tn in ((0, "claro"), (1, "oscuro")):
        baldosas[f"madera-piso-{tn}"] = piso_oficina(t)
        baldosas[f"madera-descanso-{tn}"] = piso_descanso(t)
        for k, c in CO.items():
            baldosas[f"madera-pared-{k}-{tn}"] = pared_madera(c, t)
        # una empresa sin color propio: franja gris
        baldosas[f"madera-pared-none-{tn}"] = pared_madera(hx("#8a8a8a"), t)
    return items, baldosas


DECORADOS = {"madera": madera}


# ------------------------------------------------------------------------------------------------ empaquetado
def comprimir(im):
    """PNG de paleta (con el alfa de cada color en tRNS) si no pasa de 256 colores: sin perder ni un pixel y pesa menos."""
    colores = im.getcolors(maxcolors=256)
    if colores is None:
        return im, {}
    paleta = sorted(c for _, c in colores)
    indice = {c: i for i, c in enumerate(paleta)}
    q = Image.new("P", im.size)
    q.putpalette([v for c in paleta for v in c[:3]])
    q.putdata([indice[c] for c in im.getdata()])
    alfas = bytes(c[3] for c in paleta)
    return q, ({"transparency": alfas} if any(a != 255 for a in alfas) else {})


def guardar(im, ruta):
    q, extra = comprimir(im)
    q.save(ruta, optimize=True, **extra)
    assert Image.open(ruta).convert("RGBA").tobytes() == im.tobytes(), f"{ruta}: la paleta cambió un pixel"


def clasico_generado():
    """La hoja y el `muebles.json` de la clásica, armados por `muebles.py` en una carpeta temporal: (hoja, texto del json)."""
    import tempfile
    with tempfile.TemporaryDirectory() as tmp:
        hoja_, _ = M.build(Path(tmp))
        return hoja_, (Path(tmp) / "muebles.json").read_text()


def clasico():
    """Vuelve a armar `muebles.png` y `muebles.json` de la clásica (sin tocar las baldosas sueltas de `baldosas/`)."""
    hoja_, texto = clasico_generado()
    guardar(hoja_, ROOT / "muebles.png")
    (ROOT / "muebles.json").write_text(texto)
    print("clasico", hoja_.size, (ROOT / "muebles.png").stat().st_size, "bytes")


def diferencias_atlas(atlas, alto):
    """Lo que difiere entre la disposición calculada con el código y la del `muebles.json` guardado (lista de textos; vacía si es igual)."""
    meta = json.loads((ROOT / "muebles.json").read_text())
    guardado = {k: (p["x"], p["y"], p["w"], p["h"]) for k, p in meta["piezas"].items()}
    dif = []
    if meta["alto"] != alto:
        dif.append(f"alto: guardado {meta['alto']}, calculado {alto}")
    for k in sorted(set(guardado) | set(atlas)):
        if guardado.get(k) != atlas.get(k):
            dif.append(f"{k}: guardado {guardado.get(k)}, calculado {atlas.get(k)}")
    return dif


def generar(id_, f, clasicas, atlas, alto):
    """(hoja, baldosas) de un decorado, comprobando que sus piezas son las de la clásica y que la disposición no cambió."""
    items, baldosas = f()
    assert list(items) == list(clasicas), f"{id_}: las piezas no son las mismas que las de la clásica"
    for k, im in items.items():
        assert im.size == clasicas[k].size, f"{id_}: {k} mide {im.size} y en la clásica {clasicas[k].size}"
    assert M.disposicion(items)[0] == atlas, f"{id_}: la disposición del atlas cambió"
    return M.hoja(items, atlas, alto), baldosas


def build(ids=None):
    if not ids or "clasico" in ids:
        clasico()
    clasicas = M.piezas()
    atlas, alto = M.disposicion(clasicas)
    # Generar solo un decorado arma la disposición con el código de ahora: si no coincide con el `muebles.json` guardado
    # (alguien cambió el tamaño de una pieza en `muebles.py`), la hoja nueva quedaría corrida respecto del atlas.
    dif = diferencias_atlas(atlas, alto)
    if dif:
        raise SystemExit("La disposición del atlas que arma el código no es la de muebles.json guardado; regenera todo, clásico incluido (sin argumentos):\n  " + "\n  ".join(dif))
    for id_, f in DECORADOS.items():
        if ids and id_ not in ids:
            continue
        hoja_, baldosas = generar(id_, f, clasicas, atlas, alto)
        out = SALIDA / id_
        (out / "baldosas").mkdir(parents=True, exist_ok=True)
        guardar(hoja_, out / "muebles.png")
        for k, im in baldosas.items():
            guardar(im, out / "baldosas" / f"{k}.png")
        print(id_, hoja_.size, (out / "muebles.png").stat().st_size, "bytes")


def comprobar():
    """No escribe nada: ve que las hojas, las baldosas y el atlas guardados son los que genera el código. Devuelve la lista de problemas."""
    malos = []

    def igual(ruta, im):
        if not ruta.exists():
            malos.append(f"{ruta.relative_to(ROOT)}: falta")
        elif Image.open(ruta).convert("RGBA").tobytes() != im.tobytes() or Image.open(ruta).size != im.size:
            malos.append(f"{ruta.relative_to(ROOT)}: no es lo que genera el código")

    hoja_c, texto = clasico_generado()
    igual(ROOT / "muebles.png", hoja_c)
    if json.loads((ROOT / "muebles.json").read_text()) != json.loads(texto):
        malos.append("muebles.json: no es lo que genera el código")
    clasicas = M.piezas()
    atlas, alto = M.disposicion(clasicas)
    malos += [f"atlas {d}" for d in diferencias_atlas(atlas, alto)]
    for id_, f in DECORADOS.items():
        try:
            hoja_, baldosas = generar(id_, f, clasicas, atlas, alto)
        except AssertionError as e:
            malos.append(str(e))
            continue
        out = SALIDA / id_
        igual(out / "muebles.png", hoja_)
        for k, im in baldosas.items():
            igual(out / "baldosas" / f"{k}.png", im)
        sobran = {q.stem for q in (out / "baldosas").glob("*.png")} - set(baldosas)
        malos += [f"decorados/{id_}/baldosas/{k}.png: sobra (el código ya no la genera)" for k in sorted(sobran)]
    return malos


if __name__ == "__main__":
    if "--comprobar" in sys.argv[1:]:
        problemas = comprobar()
        for q in problemas:
            print("DIFERENTE:", q)
        print("todo guardado coincide con lo que genera el código" if not problemas else f"{len(problemas)} diferencias")
        sys.exit(1 if problemas else 0)
    build(sys.argv[1:] or None)
