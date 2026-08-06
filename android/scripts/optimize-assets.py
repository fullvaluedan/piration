# Converts extracted PNG art to WebP (max 512px) and updates assets/manifest.json.
# Run: python scripts/optimize-assets.py

import json
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "www", "assets")
MANIFEST = os.path.join(ASSETS, "manifest.json")
MAX_EDGE = 512
QUALITY = 82

with open(MANIFEST, "r", encoding="utf-8") as f:
    manifest = json.load(f)

changed = 0
saved = 0

def convert(rel):
    global changed, saved
    if not rel:
        return rel
    out_rel = rel[:-4] + ".webp" if rel.endswith(".png") else rel
    out = os.path.join(ASSETS, out_rel)
    if out_rel.endswith(".webp") and os.path.exists(out):
        return out_rel
    src = os.path.join(ASSETS, rel)
    if not os.path.exists(src):
        return rel
    im = Image.open(src)
    im.load()
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
    else:
        im = im.convert("RGB")
    w, h = im.size
    scale = min(1.0, MAX_EDGE / max(w, h))
    if scale < 1.0:
        im = im.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)
    im.save(out, "WEBP", quality=QUALITY, method=4)
    saved += os.path.getsize(src) - os.path.getsize(out)
    changed += 1
    return out_rel

for group in ("cards", "ships", "mobs", "captains", "zones"):
    for key, rel in list(manifest[group].items()):
        manifest[group][key] = convert(rel)

# remove leftover PNGs after manifest points to webp
for dirpath, _, files in os.walk(ASSETS):
    for f in files:
        if f.endswith(".png"):
            os.remove(os.path.join(dirpath, f))

with open(MANIFEST, "w", encoding="utf-8") as f:
    json.dump(manifest, f, indent=2)

total = sum(
    os.path.getsize(os.path.join(dirpath, f))
    for dirpath, _, files in os.walk(ASSETS)
    for f in files
    if not f.endswith(".json")
)
print(f"converted {changed} images, saved {saved/1e6:.1f} MB, assets now {total/1e6:.1f} MB")
