# Вырезаем фон у персонажа Catness Coin
from rembg import remove
from PIL import Image
import io, os

SRC = "cat-original.png.webp"
OUT = "assets/cat.png"

os.makedirs("assets", exist_ok=True)

img = Image.open(SRC).convert("RGBA")

# alpha_matting даёт более чистые края на шерсти
out = remove(
    img,
    alpha_matting=True,
    alpha_matting_foreground_threshold=240,
    alpha_matting_background_threshold=10,
    alpha_matting_erode_size=8,
)

# Обрезаем по непрозрачной области (убираем лишние поля)
bbox = out.getbbox()
if bbox:
    out = out.crop(bbox)

out.save(OUT)
print("OK ->", OUT, out.size)
