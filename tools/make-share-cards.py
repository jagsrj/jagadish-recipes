"""Make app icons and link-preview cards (shown when a recipe is shared on WhatsApp etc.).

Run from the repo root after adding a recipe:  python3 tools/make-share-cards.py
Recipes with their own photo use the photo as the preview, so cards are only drawn
for recipes without one. Needs Pillow (pip install pillow).
"""
import os, re
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BG, INK, ACCENT, SOFT, MUTED = "#fbf6ef", "#2b1d14", "#b5401f", "#f6e3d6", "#7a6455"

def font(names, size):
    for n in names:
        for d in ("/usr/share/fonts/truetype/liberation", "/usr/share/fonts/truetype/dejavu",
                  "/Library/Fonts", "/System/Library/Fonts/Supplemental", "C:/Windows/Fonts"):
            p = os.path.join(d, n)
            if os.path.exists(p): return ImageFont.truetype(p, size)
    return ImageFont.load_default()

SERIF = ["LiberationSerif-Bold.ttf", "Georgia Bold.ttf", "georgiab.ttf", "DejaVuSerif-Bold.ttf"]
SANS = ["LiberationSans-Bold.ttf", "Arial Bold.ttf", "arialbd.ttf", "DejaVuSans-Bold.ttf"]

def wrap(draw, text, f, width):
    lines, line = [], ""
    for w in text.split():
        t = (line + " " + w).strip()
        if draw.textlength(t, font=f) <= width: line = t
        else: lines.append(line); line = w
    lines.append(line)
    return lines

def icon(size, path, pad=0.0):
    s = size * 4
    im = Image.new("RGB", (s, s), ACCENT)
    d = ImageDraw.Draw(im)
    # a simple bowl with steam
    cx, cy, r = s / 2, s * 0.56, s * 0.30
    d.pieslice([cx - r, cy - r, cx + r, cy + r], 0, 180, fill=BG)
    d.rectangle([cx - r * 1.08, cy - s * 0.018, cx + r * 1.08, cy + s * 0.018], fill=BG)
    for i, dx in enumerate((-0.12, 0, 0.12)):
        x = cx + dx * s
        pts = [(x + (s * 0.025 if (k % 2) else -s * 0.025), cy - s * 0.08 - k * s * 0.045) for k in range(5)]
        d.line(pts, fill=SOFT, width=int(s * 0.022), joint="curve")
    im = im.resize((size, size), Image.LANCZOS)
    im.save(path)

def card(title, kicker, path):
    W, H = 1200, 630
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 24, H], fill=ACCENT)
    fk, fb = font(SANS, 30), font(SANS, 30)
    d.text((90, 80), kicker.upper(), font=fk, fill=ACCENT)
    size = 96
    while True:
        ft = font(SERIF, size)
        lines = wrap(d, title, ft, W - 180)
        if len(lines) <= 3 or size <= 60: break
        size -= 8
    y = 140
    for ln in lines:
        d.text((90, y), ln, font=ft, fill=INK); y += int(size * 1.12)
    d.line([(90, H - 130), (W - 90, H - 130)], fill="#eadccf", width=3)
    d.text((90, H - 100), "Jagadish & Manju's Kitchen", font=font(SERIF, 40), fill=INK)
    im.save(path, optimize=True)

def main():
    os.makedirs(os.path.join(ROOT, "images", "og"), exist_ok=True)
    icon(512, os.path.join(ROOT, "images", "icon-512.png"))
    icon(192, os.path.join(ROOT, "images", "icon-192.png"))
    icon(180, os.path.join(ROOT, "images", "apple-touch-icon.png"))
    icon(48, os.path.join(ROOT, "images", "favicon.png"))
    card("Home-style recipes that scale to what you cook", "Weekday keto · Weekend village style · Festival sweets",
         os.path.join(ROOT, "images", "og", "home.png"))
    src = open(os.path.join(ROOT, "assets", "recipes.js"), encoding="utf-8").read()
    for block in re.split(r"\n  \{", src)[1:]:   # one block per recipe entry
        g = lambda k: (re.search(k + r':\s*"([^"]*)"', block) or [None, ""])[1]
        if g("hero") or re.search(r'\bimage:\s*"', block):
            continue
        card(g("title"), g("kicker") or "Recipe", os.path.join(ROOT, "images", "og", g("slug") + ".png"))
        print("card", g("slug"))

if __name__ == "__main__":
    main()
