"""Export the skinny ribbon artwork from the local Game Elements PSD.

Authoring-only dependency: pip install 'psd-tools[composite]'.
The PSD's ribbon subgroups contain artwork separately from the sample titles.
"""
from pathlib import Path
from psd_tools import PSDImage

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'art-source/Game Button Elements PSD 03.psd'
OUTPUT = ROOT / 'public/assets/wildstat/ui/window-banners'


def main():
    psd = PSDImage.open(SOURCE)
    elements = next(layer for layer in psd if layer.name == 'Elements')
    titles = next(layer for layer in elements if layer.name == 'title_02')
    # The three identically named title_bg groups are ordered gold, orange, green.
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for color, title in zip(('gold', 'orange', 'green'), titles, strict=True):
        ribbon = next(layer for layer in title if layer.name == 'ribbon')
        left, top, right, bottom = ribbon.bbox
        # A little transparent breathing room includes the outside stroke.
        image = ribbon.composite(viewport=(left - 8, top - 8, right + 8, bottom + 8))
        target = OUTPUT / f'ribbon-{color}.webp'
        image.save(target, 'WEBP', lossless=True, method=6)
        print(f'{target.relative_to(ROOT)}: {image.width}x{image.height}, {target.stat().st_size} bytes')


if __name__ == '__main__':
    main()
