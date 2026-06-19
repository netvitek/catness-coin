# Чистим слабый полупрозрачный ореол вокруг кота
from PIL import Image
import numpy as np

img = Image.open("assets/cat.png").convert("RGBA")
arr = np.array(img).astype(np.float32)
a = arr[:, :, 3]

# Всё, что слабее 60 по альфе — это ореол/мусор -> полностью прозрачно
a[a < 60] = 0
# Плавно дожимаем полупрозрачные пиксели к непрозрачным (резче край, без серого гало)
mask = (a >= 60) & (a < 200)
a[mask] = np.clip((a[mask] - 60) / (200 - 60) * 255, 0, 255)
arr[:, :, 3] = a

out = Image.fromarray(arr.astype(np.uint8), "RGBA")
bbox = out.getbbox()
if bbox:
    out = out.crop(bbox)
out.save("assets/cat.png")
print("OK alpha cleaned ->", out.size)
