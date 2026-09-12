"""Catalog the local ForestVillage package without importing Unity scripts.

Writes the original PNG sprites and their Unity metadata into ignored vendor
storage. Runtime maps must explicitly promote the sprites they use.
"""
from collections import Counter
import json
from pathlib import Path, PurePosixPath
import tarfile

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'art-source/2D Minimal World - ForestVillage.unitypackage'
OUTPUT = ROOT / 'art-source/vendor/forest-village'
PREFIX = 'Assets/Layer Lab/2D Minimal World/'


def main():
    entries = []
    with tarfile.open(SOURCE) as archive:
        members = {member.name: member for member in archive.getmembers()}
        for member in members.values():
            if not member.name.endswith('/pathname'):
                continue
            source = archive.extractfile(member).read().decode('utf-8').strip()
            if not source.startswith(PREFIX):
                continue
            relative = PurePosixPath(source[len(PREFIX):])
            if relative.is_absolute() or '..' in relative.parts:
                raise ValueError(f'Unsafe asset path: {source}')
            base = member.name.rsplit('/', 1)[0]
            asset = members.get(base + '/asset')
            if asset is None:
                continue
            entries.append({'path': str(relative), 'bytes': asset.size})
            if relative.suffix.lower() != '.png':
                continue
            target = OUTPUT / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.extractfile(asset).read())
            metadata = members.get(base + '/asset.meta')
            if metadata:
                target.with_suffix('.png.meta').write_bytes(archive.extractfile(metadata).read())
    entries.sort(key=lambda entry: entry['path'])
    OUTPUT.mkdir(parents=True, exist_ok=True)
    (OUTPUT / 'catalog.json').write_text(json.dumps(entries, indent=2) + '\n')
    print(json.dumps(Counter(Path(entry['path']).suffix for entry in entries), indent=2))
    print(f'Catalog and original sprites: {OUTPUT}')


if __name__ == '__main__':
    main()
