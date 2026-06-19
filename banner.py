# Баннер 640x360 для Catness Coin
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

W, H = 640, 360
os.makedirs("assets", exist_ok=True)

# --- Фон: диагональный градиент тёмный -> тёплый ---
bg = Image.new("RGB", (W, H), (15, 15, 20))
top = (26, 22, 40)      # фиолетово-тёмный
bot = (32, 24, 12)      # тёплый тёмный
for y in range(H):
    t = y / H
    r = int(top[0] + (bot[0]-top[0]) * t)
    g = int(top[1] + (bot[1]-top[1]) * t)
    b = int(top[2] + (bot[2]-top[2]) * t)
    for_line = (r, g, b)
    ImageDraw.Draw(bg).line([(0, y), (W, y)], fill=for_line)

draw = ImageDraw.Draw(bg, "RGBA")

# --- Золотое свечение справа за котом ---
glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
gd.ellipse([330, 40, 660, 370], fill=(245, 197, 66, 90))
glow = glow.filter(ImageFilter.GaussianBlur(60))
bg = Image.alpha_composite(bg.convert("RGBA"), glow)
draw = ImageDraw.Draw(bg, "RGBA")

# --- Декоративные монетки ---
def coin(cx, cy, r, a=255):
    draw.ellipse([cx-r, cy-r, cx+r, cy+r], fill=(245, 197, 66, a))
    draw.ellipse([cx-r+r//3, cy-r+r//4, cx+r//4, cy+r//4], fill=(255, 217, 122, a))
coin(70, 70, 16, 180)
coin(40, 250, 11, 150)
coin(300, 300, 13, 160)

# --- Кот справа ---
cat = Image.open("assets/cat.png").convert("RGBA")
ch = 300
cw = int(cat.width * ch / cat.height)
cat = cat.resize((cw, ch), Image.LANCZOS)
# мягкая тень под котом
shadow = Image.new("RGBA", (W, H), (0,0,0,0))
sd = ImageDraw.Draw(shadow)
sd.ellipse([W-cw-20, H-70, W-20, H-20], fill=(0,0,0,140))
shadow = shadow.filter(ImageFilter.GaussianBlur(14))
bg = Image.alpha_composite(bg, shadow)
bg.alpha_composite(cat, (W - cw - 10, H - ch - 5))
draw = ImageDraw.Draw(bg, "RGBA")

# --- Шрифты ---
def font(size, bold=True):
    path = "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"
    return ImageFont.truetype(path, size)

GOLD = (245, 197, 66)
WHITE = (255, 255, 255)
DIM = (180, 180, 195)

# Заголовок
draw.text((44, 96), "CATNESS", font=font(64), fill=WHITE)
draw.text((44, 162), "COIN", font=font(64), fill=GOLD)

# Подзаголовок
draw.text((46, 238), "Тапай кота — качай Котость", font=font(20, False), fill=DIM)

# Бейдж "TAP TO EARN"
bx, by = 46, 274
btext = "TAP TO EARN"
f = font(16)
tb = draw.textbbox((0,0), btext, font=f)
tw, th = tb[2]-tb[0], tb[3]-tb[1]
draw.rounded_rectangle([bx, by, bx+tw+28, by+th+16], radius=14, fill=GOLD)
draw.text((bx+14, by+6), btext, font=f, fill=(20, 18, 12))

bg.convert("RGB").save("assets/banner.png", quality=95)
print("OK -> assets/banner.png", bg.size)
