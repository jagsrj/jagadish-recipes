"""Builds the Spice Sticker logo files for the recipe site, with all text turned into paths."""
import math, os, subprocess, sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

FONT = sys.argv[1]
OUT = sys.argv[2]
font = TTFont(FONT)
gs = font.getGlyphSet()
cmap = font.getBestCmap()
upm = font["head"].unitsPerEm
hmtx = font["hmtx"]

def glyph_path(ch, size, x, y, rot=0.0, cx=0.0):
    """Path for one character: baseline at (x, y), rotated by rot degrees around its centre."""
    name = cmap[ord(ch)]
    s = size / upm
    adv = hmtx[name][0] * s
    pen = SVGPathPen(gs)
    a = math.radians(rot)
    ca, sa = math.cos(a), math.sin(a)
    # glyph space -> scale, flip y, shift so glyph centre is at origin, rotate, translate
    ox = -adv / 2
    t = (s * ca, s * sa, s * sa * 1, -s * ca, 0, 0)
    # build matrix manually: p' = R * (S * p + (ox, 0)) + (x, y)
    m = (s * ca, s * sa, -(-s) * sa * -1, -s * ca, 0, 0)
    xx, xy, yx, yy = s * ca, s * sa, s * sa, -s * ca
    # columns: glyph x-axis -> (s*ca, s*sa); glyph y-axis (flipped) -> (s*sa, -s*ca)
    dx = x + ox * ca
    dy = y + ox * sa
    tp = TransformPen(pen, (xx, xy, yx, yy, dx, dy))
    gs[name].draw(tp)
    return pen.getCommands(), adv

def text_width(txt, size, spacing=0):
    s = size / upm
    return sum(hmtx[cmap[ord(c)]][0] * s for c in txt) + spacing * (len(txt) - 1)

def line(txt, size, cx, y, spacing=0):
    w = text_width(txt, size, spacing)
    x = cx - w / 2
    out = []
    for c in txt:
        if c == " ":
            x += hmtx[cmap[32]][0] * size / upm + spacing
            continue
        d, adv = glyph_path(c, size, x + hmtx[cmap[ord(c)]][0] * size / upm / 2, y)
        out.append(d)
        x += adv + spacing
    return " ".join(out)

def ring(txt, size, cx, cy, r, total=None):
    """Characters spread evenly around a full circle, reading clockwise from the top."""
    s = size / upm
    advs = [hmtx[cmap[ord(c)]][0] * s for c in txt]
    circ = 2 * math.pi * r
    gap = (circ - sum(advs)) / len(txt)
    pos = -math.pi / 2 * 0  # start at left (like the canvas textPath), then go clockwise over the top
    start = math.pi  # angle of left point
    dist = 0.0
    out = []
    for c, adv in zip(txt, advs):
        mid = dist + adv / 2
        ang = start + mid / r
        x = cx + r * math.cos(ang)
        y = cy + r * math.sin(ang)
        rot = math.degrees(ang) + 90
        if c != " ":
            # baseline sits slightly outside centre line so letters look centred on the ring
            bx = cx + (r - size * 0.35) * math.cos(ang)
            by = cy + (r - size * 0.35) * math.sin(ang)
            d, _ = glyph_path(c, size, bx, by, rot)
            out.append(d)
        dist += adv + gap
    return " ".join(out)

SCALLOP = "M350.0 200.0 Q377.5 231.3 341.0 251.3 Q356.1 290.1 314.9 296.4 Q315.8 338.0 275.0 329.9 Q261.6 369.3 226.0 347.7 Q200.0 380.2 174.0 347.7 Q138.4 369.3 125.0 329.9 Q84.2 338.0 85.1 296.4 Q43.9 290.1 59.0 251.3 Q22.5 231.3 50.0 200.0 Q22.5 168.7 59.0 148.7 Q43.9 109.9 85.1 103.6 Q84.2 62.0 125.0 70.1 Q138.4 30.7 174.0 52.3 Q200.0 19.8 226.0 52.3 Q261.6 30.7 275.0 70.1 Q315.8 62.0 314.9 103.6 Q356.1 109.9 341.0 148.7 Q377.5 168.7 350.0 200.0 Z"
INK, CHILI, SUN, LEAF, RICE = "#1E1B16", "#FF4F2E", "#FFE14D", "#2F8F4E", "#FFF8EE"
CHILI_BODY = "M170 146 C186 166 214 168 234 146 C228 174 190 182 166 156 Z"
CHILI_STEM = "M167 154 C160 146 158 138 163 130"

def badge(full=True, stroke=5, inner_r=112, jm_size=78, jm_y=240, shadow=True, chili=True, tagline=True):
    parts = []
    if shadow:
        parts.append(f'<path transform="translate(10 10)" d="{SCALLOP}" fill="{INK}"/>')
    parts.append(f'<path d="{SCALLOP}" fill="{CHILI}" stroke="{INK}" stroke-width="{stroke}" stroke-linejoin="round"/>')
    if full:
        parts.append(f'<path d="{ring("JAGADISH & MANJU’S • KITCHEN • JAGADISH & MANJU’S • KITCHEN • ".replace("’", chr(39)), 19, 200, 200, 134)}" fill="{RICE}"/>')
    parts.append(f'<circle cx="200" cy="200" r="{inner_r}" fill="{RICE}" stroke="{INK}" stroke-width="{stroke}"/>')
    if chili:
        parts.append(f'<path d="{CHILI_BODY}" fill="{CHILI}" stroke="{INK}" stroke-width="3" stroke-linejoin="round"/>')
        parts.append(f'<path d="{CHILI_STEM}" fill="none" stroke="{LEAF}" stroke-width="5" stroke-linecap="round"/>')
    parts.append(f'<path d="{line("J&M", jm_size, 200, jm_y)}" fill="{INK}"/>')
    if tagline:
        parts.append(f'<path d="{line("HOME · HEAT · HEART", 11, 200, 270, 1.6)}" fill="{INK}"/>')
    return "".join(parts)

def svg(body, w=400, h=400, vb="0 0 400 400", label="Jagadish &amp; Manju&#39;s Kitchen"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="{w}" height="{h}" role="img" aria-label="{label}">'
            f'<title>{label}</title>{body}</svg>\n')

os.makedirs(OUT, exist_ok=True)
def write(name, content):
    with open(os.path.join(OUT, name), "w") as f:
        f.write(content)

# Full sticker logo (for sharing, about page, print)
write("logo.svg", svg(badge(), vb="0 0 412 412", w=412, h=412))
# Small badge for the site bar: no rim text, bigger J&M
write("logo-badge.svg", svg(badge(full=False, stroke=10, inner_r=122, jm_size=100, jm_y=240, shadow=True, chili=False, tagline=False), vb="0 0 412 412", w=412, h=412))

# App icons: full-bleed sunny square (phones round the corners themselves), badge kept inside the safe zone
icon_badge = badge(full=False, stroke=6, inner_r=122, jm_size=92, jm_y=252, shadow=True, chili=True, tagline=False)
icon_badge = icon_badge.replace(CHILI_BODY, "M168 140 C186 162 214 164 236 140 C230 170 188 180 164 152 Z").replace(CHILI_STEM, "M165 150 C157 141 155 132 161 123")
icon = svg(f'<rect width="512" height="512" fill="{SUN}"/><g transform="translate(86 86) scale(0.83)">{icon_badge}</g>', w=512, h=512, vb="0 0 512 512")
write("icon.svg", icon)

# Favicon: tiny sizes keep only the badge and chili
fav = svg(f'<rect x="2" y="2" width="60" height="60" rx="14" fill="{SUN}" stroke="{INK}" stroke-width="3"/>'
          f'<g transform="translate(7 7) scale(0.125)"><path d="{SCALLOP}" fill="{CHILI}" stroke="{INK}" stroke-width="18" stroke-linejoin="round"/>'
          f'<circle cx="200" cy="200" r="118" fill="{RICE}" stroke="{INK}" stroke-width="16"/>'
          f'<path d="M128 176 C168 232 238 236 282 172 C272 252 172 270 118 200 Z" fill="{CHILI}" stroke="{INK}" stroke-width="16" stroke-linejoin="round"/>'
          f'<path d="M122 194 C102 170 100 146 114 124" fill="none" stroke="{LEAF}" stroke-width="24" stroke-linecap="round"/></g>',
          w=64, h=64, vb="0 0 64 64")
write("favicon.svg", fav)

def png(src, name, size):
    subprocess.run(["rsvg-convert", "-w", str(size), "-h", str(size), "-o", os.path.join(OUT, name), os.path.join(OUT, src)], check=True)

png("icon.svg", "icon-512.png", 512)
png("icon.svg", "icon-192.png", 192)
png("icon.svg", "apple-touch-icon.png", 180)
png("favicon.svg", "favicon.png", 64)
png("logo.svg", "logo.png", 800)
print("done")
