"""Muebles, pantallas y baldosas de «Oficina global» (atlas con nombre). Lo usa sprites.py."""
import json
from PIL import Image

O = (42, 34, 48, 255)


def hx(c, a=255):
    c = c.lstrip("#")
    return (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16), a)


def mix(a, b, t):
    return tuple(round(a[i] * (1 - t) + b[i] * t) for i in range(3)) + (255,)


def dark(c, t=.25):
    return mix(c, (0, 0, 0), t)


def light(c, t=.25):
    return mix(c, (255, 255, 255), t)


CO = {"bet": hx("#b07400"), "elm": hx("#b8459f"), "jst": hx("#007a00"), "mig": hx("#1f78c0")}


class Pic:
    def __init__(self, w, h):
        self.im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        self.w, self.h = w, h

    def px(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.im.putpixel((x, y), c)

    def rect(self, x, y, w, h, c):
        for j in range(h):
            for i in range(w):
                self.px(x + i, y + j, c)

    def box(self, x, y, w, h, fill, line=O):
        self.rect(x, y, w, h, line)
        self.rect(x + 1, y + 1, w - 2, h - 2, fill)

    def hline(self, x, y, w, c):
        self.rect(x, y, w, 1, c)

    def vline(self, x, y, h, c):
        self.rect(x, y, 1, h, c)

    def rows(self, rows, ox, oy, pal):
        for j, r in enumerate(rows):
            for i, ch in enumerate(r):
                if ch not in ". ":
                    self.px(ox + i, oy + j, pal[ch])


WOOD, WOOD2, WOOD3 = hx("#c99a62"), hx("#a97a47"), hx("#e3bd88")
METAL, METAL2 = hx("#8b8f9c"), hx("#5f6370")


def escritorio():
    """Escritorio de frente con monitor a la izquierda. 28x20. Pantalla en (2,1) de 8x5."""
    p = Pic(28, 20)
    # monitor
    p.box(1, 0, 10, 7, hx("#3a3f4b"))
    p.rect(2, 1, 8, 5, hx("#1c2230"))
    p.rect(5, 7, 2, 2, hx("#3a3f4b")); p.vline(4, 7, 2, O); p.vline(7, 7, 2, O)
    p.box(3, 8, 6, 2, hx("#4a505e"))
    # tablero
    p.rect(0, 9, 28, 1, O)
    p.rect(0, 10, 28, 3, WOOD3); p.hline(1, 12, 26, WOOD)
    p.vline(0, 9, 11, O); p.vline(27, 9, 11, O)
    p.rect(1, 13, 26, 1, O)
    # frente
    p.rect(1, 14, 26, 5, WOOD2); p.hline(1, 14, 26, WOOD)
    p.box(16, 15, 9, 3, WOOD2)
    p.px(20, 16, hx("#e3bd88"))
    p.rect(0, 19, 28, 1, O)
    # monitor encima del tablero: base
    p.box(3, 8, 6, 2, hx("#4a505e"))
    # teclado y taza
    p.box(13, 9, 10, 3, hx("#dfe2ea")); p.hline(14, 10, 8, hx("#b5bac6"))
    p.box(24, 8, 3, 3, hx("#f6f2ea"))
    return p.im


def silla(c):
    """Silla de oficina con el respaldo del color de la empresa. 14x14 (se ve sobre el escritorio cuando no hay nadie)."""
    p = Pic(14, 14)
    p.box(2, 0, 10, 9, c)
    p.rect(3, 1, 8, 1, light(c, .3))
    p.rect(3, 7, 8, 1, dark(c, .2))
    p.box(0, 8, 14, 3, dark(c, .1))
    p.rect(6, 11, 2, 3, METAL2)
    return p.im


def pantalla(tipo, f):
    """Contenido de la pantalla del monitor, 8x5."""
    p = Pic(8, 5)
    if tipo == "apagada":
        p.rect(0, 0, 8, 5, hx("#1c2230")); p.px(6, 1, hx("#2c3446"))
    elif tipo == "codigo":
        p.rect(0, 0, 8, 5, hx("#13261c"))
        lines = [[(0, 4, "#5fd07a"), (5, 2, "#84bdf2")], [(1, 3, "#f2b544"), (5, 2, "#5fd07a")], [(1, 5, "#84bdf2")], [(0, 2, "#e895de"), (3, 4, "#5fd07a")], [(1, 3, "#5fd07a")]]
        for j in range(5):
            for x, w, c in lines[(j + f) % 5]:
                p.hline(x, j, w, hx(c))
    elif tipo == "error":
        p.rect(0, 0, 8, 5, hx("#e0443e") if f == 0 else hx("#a8282a"))
        for (x, y) in [(2, 0), (5, 0), (3, 1), (4, 1), (3, 2), (4, 2), (2, 3), (5, 3)]:
            p.px(x, y + (1 if f else 0) - (1 if f else 0), hx("#fbf9f3"))
    elif tipo == "espera":
        p.rect(0, 0, 8, 5, hx("#5b21b6") if f == 0 else hx("#7c3aed"))
        p.rect(3, 1, 2, 2, hx("#fbf9f3")); p.px(3, 3, hx("#fbf9f3")); p.px(4, 3, hx("#fbf9f3"))
    elif tipo == "dormida":
        p.rect(0, 0, 8, 5, hx("#1a2140"))
        p.rows(["......", "..ww..", "...w..", "..ww.."], 1, 0, {"w": hx("#5f739c")})
    return p.im


def sofa(c):
    """Sofá de frente para dos, 34x15."""
    p = Pic(34, 15)
    p.box(3, 0, 28, 8, c)
    p.rect(4, 1, 26, 1, light(c, .25))
    p.vline(17, 1, 6, dark(c, .25))
    p.box(0, 3, 5, 12, dark(c, .1)); p.box(29, 3, 5, 12, dark(c, .1))
    p.rect(1, 4, 3, 1, light(c, .2)); p.rect(30, 4, 3, 1, light(c, .2))
    p.box(4, 7, 26, 4, light(c, .1))
    p.vline(17, 8, 2, dark(c, .2))
    p.box(4, 10, 26, 5, dark(c, .25))
    return p.im


def cafetera():
    """Mueble con máquina de café y tazas, 20x24."""
    p = Pic(20, 24)
    # máquina
    p.box(3, 0, 11, 13, hx("#3a3f4b"))
    p.rect(4, 1, 9, 2, hx("#555c6b"))
    p.px(5, 2, hx("#5fd07a")); p.px(7, 2, hx("#e0443e"))
    p.box(6, 5, 5, 3, hx("#262a33"))
    p.rect(8, 8, 1, 2, hx("#5b3a24"))
    p.box(6, 10, 5, 3, hx("#f6f2ea"))
    # mueble
    p.rect(0, 12, 20, 1, O)
    p.rect(0, 13, 20, 2, WOOD3); p.vline(0, 12, 12, O); p.vline(19, 12, 12, O)
    p.rect(1, 15, 18, 1, O)
    p.rect(1, 16, 18, 7, WOOD2); p.vline(10, 16, 7, O)
    p.px(8, 19, WOOD3); p.px(12, 19, WOOD3)
    p.rect(0, 23, 20, 1, O)
    p.box(15, 10, 3, 3, hx("#f6f2ea"))
    return p.im


def planta(big=False):
    w, h = (14, 24) if big else (12, 18)
    p = Pic(w, h)
    G, G2, G3 = hx("#3f9a5a"), hx("#2e6b40"), hx("#7fd393")
    if big:
        leaves = [
            "......oo......", ".....oggo.....", "..oo.ogGo.oo..", ".oggooggoogglo", ".ogGgogggoggGo", "..oggggggggo..", ".oggGgglgggGgo",
            "ogggggggggggg.", "ogGgglgggGgggo", ".ogggggggggo..", "..oogggggoo...", "....ogggo.....", ".....ogo......", ".....ogo......",
        ]
        p.rows(leaves, 0, 0, {"o": O, "g": G, "G": G2, "l": G3})
        p.box(3, 14, 8, 10, hx("#c86f4b")); p.rect(4, 15, 6, 1, hx("#e08c66"))
    else:
        leaves = ["....oo......", "...oggo.oo..", "..oggGoogo..", ".ogglgggGgo.", "ogGgggglggo.", ".oggGgggggo.", "..oogggggo..", "....ogggo...", ".....ogo...."]
        p.rows(leaves, 0, 0, {"o": O, "g": G, "G": G2, "l": G3})
        p.box(2, 9, 8, 9, hx("#c86f4b")); p.rect(3, 10, 6, 1, hx("#e08c66"))
    return p.im


def dispensador():
    p = Pic(10, 24)
    p.box(1, 0, 8, 9, hx("#9fd2f2")); p.rect(2, 1, 2, 6, hx("#d8f0ff"))
    p.box(0, 8, 10, 16, hx("#e8e8ef")); p.rect(1, 9, 8, 1, hx("#fbf9f3"))
    p.px(3, 11, hx("#3f7fd0")); p.px(6, 11, hx("#e0443e"))
    p.box(2, 13, 6, 3, hx("#c9cbd6"))
    return p.im


def mesita():
    p = Pic(18, 10)
    p.box(0, 0, 18, 5, WOOD3); p.rect(1, 3, 16, 1, WOOD)
    p.box(3, 1, 5, 2, hx("#3f7fd0")); p.box(10, 0, 3, 3, hx("#f6f2ea"))
    p.vline(2, 5, 5, O); p.vline(15, 5, 5, O)
    return p.im


def estante():
    p = Pic(22, 26)
    p.box(0, 0, 22, 26, WOOD2)
    cols = ["#c8413b", "#3f7fd0", "#e2b23c", "#3f9a5a", "#7c3aed", "#e8e8ef", "#d1467e", "#2f8a83"]
    for s, y in enumerate((2, 10, 18)):
        x = 2
        k = s * 3
        while x < 19:
            w = 2 + (k % 2)
            h = 6 - (k % 3 == 0)
            p.rect(x, y + (6 - h), w, h, hx(cols[k % len(cols)]))
            p.vline(x + w, y + (6 - h), h, O)
            x += w + 1
            k += 1
        p.hline(1, y + 6, 20, O)
    return p.im


def pizarra():
    p = Pic(26, 16)
    p.box(0, 0, 26, 14, hx("#f4f6f8"), METAL2)
    for (x, y, c) in [(3, 3, "#f2b544"), (8, 3, "#84bdf2"), (13, 3, "#e895de"), (3, 8, "#5fd07a"), (8, 8, "#f2b544")]:
        p.rect(x, y, 4, 4, hx(c))
    p.hline(18, 4, 5, hx("#3f7fd0")); p.hline(18, 6, 4, hx("#3f7fd0")); p.hline(18, 9, 5, hx("#e0443e"))
    p.rect(4, 14, 18, 2, METAL2)
    return p.im


def ventana(noche):
    p = Pic(24, 16)
    sky = hx("#1d2a4d") if noche else hx("#9fd2f2")
    p.box(0, 0, 24, 16, sky, hx("#e8e8ef") if not noche else hx("#8b8f9c"))
    p.vline(12, 1, 14, hx("#e8e8ef") if not noche else hx("#8b8f9c"))
    p.hline(1, 8, 22, hx("#e8e8ef") if not noche else hx("#8b8f9c"))
    if noche:
        for (x, y) in [(3, 3), (8, 5), (16, 2), (20, 6), (5, 11), (18, 12)]:
            p.px(x, y, hx("#fde68a"))
        p.rect(15, 10, 3, 3, hx("#f6f2ea"))
    else:
        p.rect(3, 3, 5, 2, hx("#ffffff")); p.rect(2, 4, 7, 1, hx("#ffffff"))
        p.rect(15, 11, 6, 2, hx("#ffffff"))
    p.rect(0, 15, 24, 1, O)
    return p.im


def reloj():
    p = Pic(9, 9)
    p.rows([".ooooooo.", "owwwwwwwo", "owwwowwwo", "owwwowwwo", "owwwoooow", "owwwwwwwo", "owwwwwwwo", ".ooooooo.", "........."], 0, 0, {"o": O, "w": hx("#f6f2ea")})
    p.px(8, 4, O)
    return p.im


def cuadro(c):
    p = Pic(12, 10)
    p.box(0, 0, 12, 10, hx("#f6f2ea"), WOOD2)
    p.rect(2, 5, 8, 3, c); p.rect(4, 3, 4, 2, light(c, .3)); p.px(8, 2, hx("#f2b544"))
    return p.im


def puff(c):
    p = Pic(14, 10)
    p.rows(["...oooooooo...", ".ooccccccccoo.", "occllcccccccco", "occcccccccccco", "occcccccccccco", "oCcccccccccCCo", ".oCCCCCCCCCCo.", "..oooooooooo.."], 0, 2, {"o": O, "c": c, "C": dark(c), "l": light(c, .35)})
    return p.im


def lampara():
    p = Pic(10, 24)
    p.rows(["..oooooo..", ".oyyyyyyo.", "oyyyyyyyyo", "oooooooooo"], 0, 0, {"o": O, "y": hx("#f6dc85")})
    p.rect(4, 4, 2, 18, METAL2)
    p.box(2, 21, 6, 3, METAL)
    return p.im


def alfombra_sala(c):
    """Alfombra de la sala de descanso vista desde arriba, 60x30."""
    p = Pic(60, 30)
    p.box(0, 0, 60, 30, c)
    p.rect(2, 2, 56, 26, light(c, .18))
    p.rect(4, 4, 52, 22, c)
    for x in range(6, 54, 6):
        p.px(x, 6, light(c, .3)); p.px(x + 3, 23, light(c, .3))
    p.rect(26, 12, 8, 6, light(c, .25)); p.rect(28, 13, 4, 4, c)
    return p.im


def pingpong():
    """Mesa de ping-pong en perspectiva, 40x24."""
    p = Pic(40, 24)
    G, G2 = hx("#2f7d5b"), hx("#24624a")
    p.box(0, 0, 40, 16, G)
    p.vline(20, 1, 14, hx("#f4f6f8"))
    p.hline(1, 1, 38, light(G, .2))
    p.rect(19, 0, 3, 16, hx("#dfe2ea")); p.vline(19, 0, 16, O); p.vline(21, 0, 16, O)
    p.rect(1, 15, 38, 3, G2); p.hline(0, 18, 40, O)
    for x in (3, 35):
        p.rect(x, 18, 2, 6, METAL2)
    p.box(8, 6, 3, 3, hx("#f2b544"))
    p.box(30, 8, 5, 4, hx("#c8413b"))
    return p.im


def arcade():
    """Máquina arcade, 16x28."""
    p = Pic(16, 28)
    p.box(0, 0, 16, 28, hx("#4b3a8f"))
    p.rect(1, 1, 14, 4, hx("#e2b23c")); p.hline(3, 3, 10, hx("#c8413b"))
    p.box(2, 6, 12, 9, hx("#1c2230"))
    p.rect(4, 8, 3, 2, hx("#5fd07a")); p.rect(9, 10, 3, 2, hx("#e895de")); p.px(7, 12, hx("#84bdf2"))
    p.rect(1, 15, 14, 4, hx("#3a2c70")); p.px(5, 16, hx("#c8413b")); p.px(10, 16, hx("#f2b544")); p.px(11, 17, hx("#5fd07a"))
    p.rect(1, 19, 14, 8, hx("#3f3080")); p.box(5, 21, 6, 4, hx("#2a2060"))
    return p.im


def ascensor():
    """Puerta de ascensor (edificio, propuesta B), 20x30."""
    p = Pic(20, 30)
    p.box(0, 0, 20, 30, hx("#8b8f9c"))
    p.box(2, 4, 16, 26, hx("#c9cbd6"))
    p.vline(10, 5, 25, METAL2)
    p.box(7, 0, 6, 4, hx("#262a33"))
    p.px(9, 1, hx("#f2b544")); p.px(10, 2, hx("#f2b544"))
    return p.im


# ---------------------------------------------------------------- baldosas 16x16 (se repiten)
def piso_madera(t):
    """Tablas largas de madera (32x16: las uniones no se repiten cada 16 px)."""
    a, b, c = (hx("#d9b07c"), hx("#cda06a"), hx("#c39662")) if not t else (hx("#4f3e2f"), hx("#46372a"), hx("#3f3125"))
    p = Pic(32, 16)
    p.rect(0, 0, 32, 16, a)
    for y in (3, 7, 11, 15):
        p.hline(0, y, 32, b)
    for (x, y) in [(9, 0), (25, 4), (3, 8), (18, 12)]:
        p.vline(x, y, 3, c)
    for (x, y) in [(14, 1), (5, 5), (29, 9), (11, 13), (22, 2), (16, 10)]:
        p.hline(x, y, 2, mix(a, b, .6))
    return p.im


def piso_alfombra(c, t):
    base = mix(c, (255, 255, 255), .78) if not t else mix(c, (16, 16, 18), .78)
    p = Pic(16, 16)
    p.rect(0, 0, 16, 16, base)
    dot = mix(c, (255, 255, 255), .62) if not t else mix(c, (16, 16, 18), .66)
    for (x, y) in [(2, 2), (10, 2), (6, 6), (14, 6), (2, 10), (10, 10), (6, 14), (14, 14)]:
        p.px(x, y, dot)
    return p.im


def piso_baldosa(t):
    a, b = (hx("#e9e6df"), hx("#d8d3c8")) if not t else (hx("#2b2b31"), hx("#232328"))
    p = Pic(16, 16)
    p.rect(0, 0, 16, 16, a)
    p.hline(0, 15, 16, b); p.vline(15, 0, 16, b)
    p.rect(0, 0, 8, 8, mix(a, b, .35)); p.rect(8, 8, 7, 7, mix(a, b, .35))
    return p.im


def pared(c, t):
    """Muro del fondo visto de frente (salas de la propuesta A). 16x22, franja del color de la empresa."""
    wall = hx("#f1ece2") if not t else hx("#2a2a30")
    wall2 = hx("#e4ddcf") if not t else hx("#232328")
    p = Pic(16, 22)
    p.rect(0, 0, 16, 2, hx("#4a4552") if not t else hx("#141417"))
    p.rect(0, 2, 16, 15, wall)
    p.hline(0, 9, 16, wall2)
    p.rect(0, 14, 16, 3, c if not t else dark(c, .25))
    p.hline(0, 14, 16, light(c, .25) if not t else c)
    p.rect(0, 17, 16, 5, wall2)
    p.hline(0, 21, 16, hx("#bdb5a5") if not t else hx("#18181b"))
    return p.im


def pared_lateral(c, t):
    """Pared con papel (edificio, propuesta B): 16x16 con rayas del color de la empresa."""
    base = mix(c, (255, 255, 255), .86) if not t else mix(c, (20, 20, 24), .82)
    stripe = mix(c, (255, 255, 255), .74) if not t else mix(c, (20, 20, 24), .74)
    p = Pic(16, 16)
    p.rect(0, 0, 16, 16, base)
    p.vline(3, 0, 16, stripe); p.vline(11, 0, 16, stripe)
    return p.im


def losa(t):
    a, b = (hx("#9a958a"), hx("#7c776d")) if not t else (hx("#3a3a42"), hx("#2b2b31"))
    p = Pic(16, 8)
    p.rect(0, 0, 16, 8, a); p.hline(0, 0, 16, light(a, .3)); p.hline(0, 7, 16, b)
    p.px(5, 3, b); p.px(12, 5, b)
    return p.im


def ladrillo(t):
    a, b = (hx("#b5654a"), hx("#93503a")) if not t else (hx("#5a3a33"), hx("#432b26"))
    p = Pic(16, 16)
    p.rect(0, 0, 16, 16, a)
    for y in (3, 7, 11, 15):
        p.hline(0, y, 16, b)
    for y, xs in [(0, (7, 15)), (4, (3, 11)), (8, (7, 15)), (12, (3, 11))]:
        for x in xs:
            p.vline(x, y, 3, b)
    return p.im


# ---------------------------------------------------------------- vista 3D
def pliegues():
    """Dónde se dobla cada mueble, como un papel, para pararlo en el suelo de la vista 3D.

    Filas del dibujo donde cambia de cara, de arriba abajo. Desde abajo, la primera franja va de pie
    (el frente), la siguiente acostada (la tapa) y así, alternando. Sin pliegues, el mueble va entero
    de pie; con su alto como único pliegue, entero acostado (una alfombra). Visto desde arriba en
    diagonal, el mueble doblado se ve igual que el dibujo.
    """
    p = {
        "escritorio": [9, 14],  # monitor | tablero | frente
        "sofa": [7, 10],  # respaldo | cojines | frente
        "sofa-calido": [7, 10],
        "cafetera": [12, 15],  # máquina | cubierta | mueble
        "mesita": [5],  # tapa | patas
        "puff": [6],
        "puff-2": [6],
        "pingpong": [16],  # mesa | patas
        "alfombra-sala": [30],
        "alfombra-sala-2": [30],
    }
    for k in CO:
        p[f"silla-{k}"] = [8, 11]  # respaldo | asiento | pata
    return p


# Los que giran para mirarte en la vista 3D, como los personajes: una planta o una lámpara se ven igual desde todos lados.
GIRAN = ["planta", "planta-grande", "lampara"]


def build(OUT):
    items = {}
    items["escritorio"] = escritorio()
    for k, c in CO.items():
        items[f"silla-{k}"] = silla(c)
    for tipo, n in [("apagada", 1), ("codigo", 5), ("error", 2), ("espera", 2), ("dormida", 1)]:
        for f in range(n):
            items[f"pantalla-{tipo}-{f}"] = pantalla(tipo, f)
    items["sofa"] = sofa(hx("#5b6b8c"))
    items["sofa-calido"] = sofa(hx("#b0645a"))
    items["cafetera"] = cafetera()
    items["planta"] = planta()
    items["planta-grande"] = planta(True)
    items["dispensador"] = dispensador()
    items["mesita"] = mesita()
    items["estante"] = estante()
    items["pizarra"] = pizarra()
    items["ventana-dia"] = ventana(False)
    items["ventana-noche"] = ventana(True)
    items["reloj"] = reloj()
    for k, c in CO.items():
        items[f"cuadro-{k}"] = cuadro(c)
    items["puff"] = puff(hx("#e2b23c"))
    items["puff-2"] = puff(hx("#2f8a83"))
    items["lampara"] = lampara()
    items["ascensor"] = ascensor()
    items["alfombra-sala"] = alfombra_sala(hx("#a35a4a"))
    items["alfombra-sala-2"] = alfombra_sala(hx("#3f6f8f"))
    items["pingpong"] = pingpong()
    items["arcade"] = arcade()
    for t, tn in ((0, "claro"), (1, "oscuro")):
        items[f"piso-madera-{tn}"] = piso_madera(t)
        items[f"piso-baldosa-{tn}"] = piso_baldosa(t)
        items[f"losa-{tn}"] = losa(t)
        items[f"ladrillo-{tn}"] = ladrillo(t)
        for k, c in CO.items():
            items[f"alfombra-{k}-{tn}"] = piso_alfombra(c, t)
            items[f"pared-{k}-{tn}"] = pared(c, t)
            items[f"papel-{k}-{tn}"] = pared_lateral(c, t)
    # las baldosas también van sueltas: se repiten con background-repeat
    tiles = OUT / "baldosas"
    tiles.mkdir(exist_ok=True)
    for k, im in items.items():
        if k.split("-")[0] in ("piso", "alfombra", "pared", "papel", "losa", "ladrillo"):
            im.save(tiles / f"{k}.png")
    # empaquetado en filas simples
    W = 256
    x = y = rowh = 0
    atlas = {}
    for k, im in items.items():
        if x + im.width > W:
            x, y, rowh = 0, y + rowh + 1, 0
        atlas[k] = (x, y, im.width, im.height)
        x += im.width + 1
        rowh = max(rowh, im.height)
    sheet = Image.new("RGBA", (W, y + rowh), (0, 0, 0, 0))
    for k, (ax, ay, w, h) in atlas.items():
        sheet.paste(items[k], (ax, ay))
    sheet.save(OUT / "muebles.png")
    meta = {"imagen": "muebles.png", "ancho": W, "alto": y + rowh, "piezas": {k: {"x": a[0], "y": a[1], "w": a[2], "h": a[3]} for k, a in atlas.items()},
            "nota": "escritorio: pantalla en (2,1) 8x5; el personaje va en (10,-8) respecto del escritorio y la silla en (11,-3) detrás del personaje.",
            "pliegues": pliegues(), "giran": GIRAN}
    (OUT / "muebles.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    return sheet, meta
