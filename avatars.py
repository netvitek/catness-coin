# Аватарки для бота и канала Catness Coin (640x640, кроп в круг)
from PIL import Image, ImageDraw, ImageFilter
import numpy as np
import os

S = 640
os.makedirs("assets", exist_ok=True)
cat = Image.open("assets/cat.png").convert("RGBA")

def radial_bg(center, edge):
    """Радиальный градиент center -> edge."""
    yy, xx = np.mgrid[0:S, 0:S]
    d = np.sqrt((xx - S/2)**2 + (yy - S/2)**2) / (S/2 * 1.1)
    d = np.clip(d, 0, 1)[..., None]
    c0 = np.array(center, dtype=np.float32)
    c1 = np.array(edge, dtype=np.float32)
    arr = (c0 * (1 - d) + c1 * d).astype(np.uint8)
    a = np.full((S, S, 1), 255, np.uint8)
    return Image.fromarray(np.concatenate([arr, a], axis=2), "RGBA")

def coin(draw, cx, cy, r, a=255):
    draw.ellipse([cx-r, cy-r, cx+r, cy+r], fill=(245, 197, 66, a))
    draw.ellipse([cx-r+r//3, cy-r+r//4, cx+r//4, cy+r//4], fill=(255, 217, 122, a))

def place_cat(bg, height, dy=0):
    h = height
    w = int(cat.width * h / cat.height)
    c = cat.resize((w, h), Image.LANCZOS)
    # мягкая тень под котом
    sh = Image.new("RGBA", (S, S), (0,0,0,0))
    sd = ImageDraw.Draw(sh)
    sd.ellipse([S//2-w//2, S//2+h//2-40+dy, S//2+w//2, S//2+h//2+20+dy], fill=(0,0,0,120))
    sh = sh.filter(ImageFilter.GaussianBlur(16))
    bg = Image.alpha_composite(bg, sh)
    bg.alpha_composite(c, ((S - w)//2, (S - h)//2 + dy))
    return bg

# ===== Аватар бота: тёплое золотое свечение =====
bot = radial_bg((58, 44, 20), (18, 16, 22))
d = ImageDraw.Draw(bot, "RGBA")
glow = Image.new("RGBA", (S, S), (0,0,0,0))
ImageDraw.Draw(glow).ellipse([120, 120, 520, 520], fill=(245,197,66,70))
glow = glow.filter(ImageFilter.GaussianBlur(70))
bot = Image.alpha_composite(bot, glow)
bot = place_cat(bot, 470, dy=10)
bot.convert("RGB").save("assets/bot_avatar.png", quality=95)
print("OK -> assets/bot_avatar.png")

# ===== Аватар канала: фиолетово-золотой, с монетками =====
ch = radial_bg((52, 40, 72), (16, 14, 24))
glow = Image.new("RGBA", (S, S), (0,0,0,0))
ImageDraw.Draw(glow).ellipse([130, 150, 510, 530], fill=(245,197,66,60))
glow = glow.filter(ImageFilter.GaussianBlur(75))
ch = Image.alpha_composite(ch, glow)
ch = place_cat(ch, 450, dy=20)
d = ImageDraw.Draw(ch, "RGBA")
coin(d, 120, 130, 34, 230)
coin(d, 520, 160, 26, 210)
coin(d, 95, 470, 22, 200)
coin(d, 540, 470, 30, 220)
ch.convert("RGB").save("assets/channel_avatar.png", quality=95)
print("OK -> assets/channel_avatar.png")
