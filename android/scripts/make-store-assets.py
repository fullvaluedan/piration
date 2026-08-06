# Builds Piration store assets deterministically with Pillow:
#  - store-assets/icon-512.png        (Play Store icon)
#  - store-assets/feature-graphic.png (1024x500 listing banner)
#  - www/icons/icon-512.png + icon-192.png (PWA icons)
#  - Android mipmap launcher icons (mdpi..xxxhdpi, round + foreground)
# Run: python scripts/make-store-assets.py

import math
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "store-assets")
os.makedirs(OUT, exist_ok=True)

GOLD = (230, 170, 60)
IVORY = (232, 224, 207)
DARK = (10, 20, 34)
NAVY_TOP = (22, 42, 74)
NAVY_BOT = (8, 16, 28)

ARIAL_BD = r"C:\Windows\Fonts\arialbd.ttf"
ARIAL = r"C:\Windows\Fonts\arial.ttf"


def gradient(size, c1, c2, horizontal=False):
    w, h = size
    img = Image.new("RGB", size)
    px = img.load()
    for y in range(h):
        t = y / max(1, h - 1)
        if horizontal:
            for x in range(w):
                t2 = x / max(1, w - 1)
                px[x, y] = tuple(int(c1[i] + (c2[i] - c1[i]) * t2) for i in range(3))
        else:
            row = tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))
            for x in range(w):
                px[x, y] = row
    return img


def radial_glow(size, center, radius, color, alpha):
    w, h = size
    layer = Image.new("L", size, 0)
    d = ImageDraw.Draw(layer)
    d.ellipse(
        [center[0] - radius, center[1] - radius, center[0] + radius, center[1] + radius],
        fill=alpha,
    )
    layer = layer.filter(ImageFilter.GaussianBlur(radius * 0.4))
    glow = Image.new("RGBA", size, (*color, 0))
    glow.putalpha(layer)
    return glow


def draw_emblem(scale=1.0):
    """Skull over crossed bones, transparent background."""
    S = int(512 * scale)
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c = S / 2

    def bone(length, width, angle_deg, center):
        b = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        bd = ImageDraw.Draw(b)
        x0 = c - length / 2
        y0 = c - width / 2
        bd.rounded_rectangle([x0, y0, x0 + length, y0 + width], radius=width / 2, fill=IVORY)
        # knobs
        r = width * 0.72
        for kx in (x0, x0 + length):
            bd.ellipse([kx - r, c - r, kx + r, c + r], fill=IVORY)
        b = b.rotate(angle_deg, center=(c, c), resample=Image.BICUBIC)
        img.alpha_composite(b, (0, 0))

    bone(330 * scale, 30 * scale, 45, (c, c))
    bone(330 * scale, 30 * scale, -45, (c, c))

    # skull
    cranium_r = 88 * scale
    d.ellipse(
        [c - cranium_r, c - cranium_r - 34 * scale, c + cranium_r, c + cranium_r - 34 * scale],
        fill=IVORY,
    )
    jaw_w = 130 * scale
    jaw_h = 86 * scale
    d.rounded_rectangle(
        [c - jaw_w / 2, c + 10 * scale, c + jaw_w / 2, c + 10 * scale + jaw_h],
        radius=34 * scale,
        fill=IVORY,
    )
    # eyes
    eye_r = 26 * scale
    d.ellipse([c - 58 * scale - eye_r, c - 66 * scale, c - 58 * scale + eye_r, c - 66 * scale + 2 * eye_r], fill=DARK)
    d.ellipse([c + 58 * scale - eye_r, c - 66 * scale, c + 58 * scale + eye_r, c - 66 * scale + 2 * eye_r], fill=DARK)
    # nose
    nx, ny = c, c - 12 * scale
    d.polygon([(nx, ny + 26 * scale), (nx - 12 * scale, ny + 8 * scale), (nx + 12 * scale, ny + 8 * scale)], fill=DARK)
    # teeth
    tw = 7 * scale
    ty = c + 42 * scale
    th = 44 * scale
    for dx in (-26, -8, 8, 26):
        d.rectangle([c + dx * scale - tw / 2, ty, c + dx * scale + tw / 2, ty + th], fill=DARK)
    return img


def compose_icon():
    img = gradient((512, 512), NAVY_TOP, NAVY_BOT)
    img = img.convert("RGBA")
    img.alpha_composite(radial_glow((512, 512), (256, 230), 300, (40, 74, 128), 150))
    d = ImageDraw.Draw(img)
    d.ellipse([18, 18, 494, 494], outline=GOLD, width=14)
    d.ellipse([42, 42, 470, 470], outline=(255, 214, 130), width=3)
    emblem = draw_emblem(0.52)
    img.alpha_composite(emblem, (int(256 - emblem.width / 2), int(246 - emblem.height / 2)))
    return img.convert("RGB")


def compose_feature():
    img = gradient((1024, 500), NAVY_TOP, NAVY_BOT, horizontal=True)
    img = img.convert("RGBA")
    img.alpha_composite(radial_glow((1024, 500), (790, 250), 420, (40, 74, 128), 140))
    d = ImageDraw.Draw(img)
    title_font = ImageFont.truetype(ARIAL_BD, 92)
    sub_font = ImageFont.truetype(ARIAL, 34)
    tag_font = ImageFont.truetype(ARIAL, 24)
    d.text((64, 132), "PIRATION", font=title_font, fill=IVORY)
    d.text((66, 248), "OFFLINE PIRATE RPG", font=sub_font, fill=GOLD)
    d.text((66, 306), "Random encounters · 6 captains · endless high scores", font=tag_font, fill=(150, 166, 192))
    d.rectangle([66, 232, 560, 236], fill=GOLD)
    emblem = draw_emblem(0.72)
    img.alpha_composite(emblem, (560, 92))
    d.rectangle([0, 0, 1023, 6], fill=GOLD)
    return img.convert("RGB")


def rounded(img, radius):
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1], radius=radius, fill=255)
    out = img.convert("RGBA")
    out.putalpha(mask)
    return out


def write_mipmaps(icon):
    res = os.path.join(ROOT, "android", "app", "src", "main", "res")
    sizes = {
        "mipmap-mdpi": 48,
        "mipmap-hdpi": 72,
        "mipmap-xhdpi": 96,
        "mipmap-xxhdpi": 144,
        "mipmap-xxxhdpi": 192,
    }
    for folder, px in sizes.items():
        base = os.path.join(res, folder)
        if not os.path.isdir(base):
            continue
        small = icon.resize((px, px), Image.LANCZOS)
        small.save(os.path.join(base, "ic_launcher.png"))
        round_icon = rounded(small, px * 0.18)
        round_icon.save(os.path.join(base, "ic_launcher_round.png"))
        # foreground: emblem only on transparent background (for adaptive icons)
        fg = Image.new("RGBA", (px, px), (0, 0, 0, 0))
        emblem = draw_emblem(0.72 * px / 512)
        fg.alpha_composite(emblem, (int(px / 2 - emblem.width / 2), int(px / 2 - emblem.height / 2)))
        fg.save(os.path.join(base, "ic_launcher_foreground.png"))


def main():
    icon = compose_icon()
    icon.save(os.path.join(OUT, "icon-512.png"))
    icon.save(os.path.join(ROOT, "www", "icons", "icon-512.png"))
    icon.resize((192, 192), Image.LANCZOS).save(os.path.join(ROOT, "www", "icons", "icon-192.png"))
    write_mipmaps(icon)
    compose_feature().save(os.path.join(OUT, "feature-graphic.png"))
    print("assets written to", OUT)


if __name__ == "__main__":
    main()
