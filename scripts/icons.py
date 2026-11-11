"""Regenerate the committed install and Windows icons using Pillow."""
from PIL import Image, ImageDraw

def icon(size):
    factor = size / 192
    image = Image.new("RGBA", (size, size))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=round(36 * factor), fill="#192324")
    draw.ellipse(tuple(round(v * factor) for v in (34, 34, 158, 158)), outline="#9ce8c8", width=round(5 * factor))
    points = [(50,98),(71,98),(81,77),(96,121),(109,87),(117,98),(142,98)]
    draw.line([(round(x*factor),round(y*factor)) for x,y in points], fill="#9ce8c8", width=round(6*factor), joint="curve")
    return image

for size in (192, 512):
    icon(size).save(f"public/icon-{size}.png")
icon(256).save("desktop/icon.ico", sizes=[(16,16),(32,32),(48,48),(128,128),(256,256)])

