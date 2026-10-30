"""Re-encode existing source textures only; Pillow is supplied by the local toolchain."""
from pathlib import Path
from PIL import Image
import hashlib
import json

root = Path(__file__).resolve().parents[2]
assets = root / 'office3d/assets'
records = []
old_manifest = assets / 'compact/conversion-textures.json'
if old_manifest.exists():
    for row in json.loads(old_manifest.read_text(encoding='utf-8')):
        old = (root / row['target']).resolve()
        if not old.is_relative_to((assets / 'compact').resolve()):
            raise ValueError('Generated texture outside output directory')
        old.unlink(missing_ok=True)
for source in sorted((assets / 'models/people').glob('*/*')) + sorted((assets / 'models/characters/tex').glob('*')):
    if source.suffix.lower() not in ('.png', '.jpg', '.jpeg') or source.name == 'preview.png':
        continue
    relative = source.relative_to(assets / 'models')
    for size in (1024, 512):
        target = (assets / 'compact' / str(size) / relative).with_suffix('.webp')
        target.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(source) as original:
            image = original.copy()
            image.thumbnail((size, size), Image.Resampling.LANCZOS)
            image.save(target, format='WEBP', quality=95 if 'Normal' in source.name else 80, method=6)
            dimensions = image.size
        data = target.read_bytes()
        records.append(dict(source=str(source.relative_to(root)).replace('\\', '/'),
                            sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),
                            target=str(target.relative_to(root)).replace('\\', '/'),
                            dimensions=dimensions, bytes=len(data), sha256=hashlib.sha256(data).hexdigest()))
(assets / 'compact/conversion-textures.json').write_text(json.dumps(records, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(json.dumps(dict(files=len(records), bytes=sum(x['bytes'] for x in records))))
