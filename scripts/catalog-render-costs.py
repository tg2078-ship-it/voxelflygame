"""Record source mesh cost without rewriting any original GLB or collision asset."""
import gzip
import json
import struct
from pathlib import Path

root = Path(__file__).resolve().parents[1] / 'public'
for name in ['catalog.json', 'traffic-catalog.json']:
    target = root / 'models' / name
    catalog = json.loads(target.read_text())
    for asset in catalog['assets']:
        costs = {}
        for lod, url in asset['exports'].items():
            if lod not in ('lod0', 'lod1', 'lod2'):
                continue
            data = (root / url.lstrip('/')).read_bytes()
            if data[:2] == b'\x1f\x8b':
                data = gzip.decompress(data)
            length = struct.unpack_from('<I', data, 12)[0]
            gltf = json.loads(data[20:20 + length])
            draws = triangles = 0
            for node in gltf.get('nodes', []):
                if 'mesh' not in node:
                    continue
                for primitive in gltf['meshes'][node['mesh']]['primitives']:
                    draws += 1
                    accessor = primitive.get('indices', primitive['attributes']['POSITION'])
                    if primitive.get('mode', 4) == 4:
                        triangles += gltf['accessors'][accessor]['count'] // 3
            costs[lod] = {'draws': draws, 'triangles': triangles}
        asset['renderCosts'] = costs
    target.write_text(json.dumps(catalog, separators=(',', ':'), ensure_ascii=False))
    print(name, len(catalog['assets']), 'cost profiles; original files unchanged')
