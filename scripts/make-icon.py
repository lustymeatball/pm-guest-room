# Builds the app icons from assets/logo-source.webp. Run: python scripts/make-icon.py
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent
src = Image.open(root / 'assets' / 'logo-source.webp').convert('RGBA')
src = src.crop(src.getbbox())
side = max(src.size)
sq = Image.new('RGBA', (side, side))
sq.paste(src, ((side - src.width) // 2, (side - src.height) // 2))

sq.resize((512, 512), Image.LANCZOS).save(root / 'assets' / 'icon.png')
sq.resize((256, 256), Image.LANCZOS).save(root / 'assets' / 'icon.ico', sizes=[(s, s) for s in (16, 24, 32, 48, 64, 128, 256)])
sq.resize((128, 128), Image.LANCZOS).save(root / 'src' / 'renderer' / 'logo.png')
print('icons written')
