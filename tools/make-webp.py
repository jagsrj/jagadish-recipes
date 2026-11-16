"""Make smaller WebP copies of the dish photos (about half the size of the JPGs).

Run from the repo root after adding or replacing a photo:  python3 tools/make-webp.py
Keep the .jpg as well: the site sends the .webp to browsers that support it and the
.jpg to everything else (and to Google and WhatsApp previews). Needs Pillow.
"""
import glob, os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for jpg in sorted(glob.glob(os.path.join(ROOT, "images", "*.jpg"))):
    webp = jpg[:-4] + ".webp"
    if os.path.exists(webp) and os.path.getmtime(webp) >= os.path.getmtime(jpg):
        continue
    Image.open(jpg).convert("RGB").save(webp, "WEBP", quality=78, method=6)
    print(f"{os.path.basename(webp)}: {os.path.getsize(jpg)//1024} KB -> {os.path.getsize(webp)//1024} KB")
