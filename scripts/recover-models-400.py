#!/usr/bin/env python3
"""Restore runtime assets from the retained, audited AeroForge 400-model checkpoint.

Does not re-encode meshes or edit the source archive. The checkpoint contains
the optimized GLBs and complete source-derived collision/rig data. This script
independently checks all embedded image bytes, texture index maps and materials
against the retained original GLBs, then writes deterministic gzip transports.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import gzip
import hashlib
import json
from pathlib import Path
import struct


def read_glb(path):
    data = path.read_bytes()
    magic, version, length = struct.unpack_from('<III', data)
    assert magic == 0x46546C67 and version == 2 and length == len(data), path
    jlen, kind = struct.unpack_from('<II', data, 12)
    assert kind == 0x4E4F534A
    doc = json.loads(data[20:20+jlen])
    blen, kind = struct.unpack_from('<II', data, 20+jlen)
    assert kind == 0x004E4942
    binary = data[28+jlen:28+jlen+blen]
    images = []
    for image in doc.get('images', []):
        view = doc['bufferViews'][image['bufferView']]
        assert view.get('buffer', 0) == 0
        offset = view.get('byteOffset', 0)
        images.append(hashlib.sha256(binary[offset:offset+view['byteLength']]).hexdigest())
    textures = {str(i): images[t['source']] for i,t in enumerate(doc.get('textures', []))}
    return data, doc, textures, images


def compact_write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = json.dumps(value, separators=(',', ':'), ensure_ascii=False).encode()
    path.write_bytes(raw)
    return raw


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--checkpoint', type=Path, required=True)
    ap.add_argument('--output', type=Path, default=Path('public/models'))
    ap.add_argument('--report', type=Path, default=Path('docs/validation/asset-400-recovery.json'))
    args = ap.parse_args()
    checkpoint, output = args.checkpoint, args.output
    catalog = json.loads((checkpoint/'catalog-before-texture-hashes.json').read_text())
    jobs = json.loads((checkpoint/'jobs.json').read_text())
    assert len(jobs) == 1200 and len(catalog['assets']) == 400

    def restore(job):
        saved_parts = Path(job['destFile']).parts
        relative = Path(*saved_parts[saved_parts.index('optimized')+1:])
        source_path = checkpoint/'source'/relative
        optimized_path = checkpoint/'optimized'/relative
        _, original, original_textures, original_images = read_glb(source_path)
        data, optimized, textures, images = read_glb(optimized_path)
        assert textures == original_textures and images == original_images, (job['id'], job['lod'], 'image bytes/index')
        for field in ['materials', 'textures', 'samplers']:
            assert optimized.get(field, []) == original.get(field, []), (job['id'], job['lod'], field)
        destination = output/relative.with_suffix('.glb.gz')
        destination.parent.mkdir(parents=True, exist_ok=True)
        compressed = gzip.compress(data, compresslevel=9, mtime=0)
        destination.write_bytes(compressed)
        return job['id'], job['lod'], textures, len(compressed), len(images)

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
        results = list(executor.map(restore, jobs))
    by_id = {}
    for model_id, lod, hashes, _, _ in results:
        by_id.setdefault(model_id, {})[lod] = hashes
    overrides = 0
    for asset in catalog['assets']:
        maps = by_id[asset['id']]
        asset['textureHashes'] = maps['lod0']
        different = {lod: hashes for lod, hashes in maps.items() if hashes != maps['lod0']}
        if different:
            asset['textureHashesByLod'] = different
            overrides += len(different)
    compact_write(output/'catalog.json', catalog)
    bundle = json.loads((checkpoint/'collision-bundle.json').read_text())
    assert len(bundle['proxies']) == 400
    raw_bundle = json.dumps(bundle, separators=(',', ':')).encode()
    (output/'collision-bundle.json.gz').write_bytes(gzip.compress(raw_bundle, compresslevel=9, mtime=0))
    for proxy in bundle['proxies']:
        assert proxy['coverage']['missingSourceBoxes'] == 0
        raw = compact_write(output/'proxies'/f"{proxy['id']}.json", proxy)
        (output/'proxies'/f"{proxy['id']}.json.gz").write_bytes(gzip.compress(raw, compresslevel=9, mtime=0))
    report = {
        'status': 'passed', 'models': 400, 'visualExports': len(results),
        'sourceArchiveSha256': catalog['sourceArchiveSha256'],
        'modelGzipBytes': sum(r[3] for r in results),
        'embeddedImageOccurrencesVerified': sum(r[4] for r in results),
        'textureHashLodOverrides': overrides,
        'uniqueEmbeddedImageHashes': len({h for _,_,m,_,_ in results for h in m.values()}),
        'sourceMaterialsSamplersTexturesUnchanged': True,
        'staticBoxes': sum(len(p['static']) for p in bundle['proxies']),
        'dynamicBoxes': sum(len(p['dynamic']) for p in bundle['proxies']),
        'nativeRigModels': sum(bool(p.get('rig', {}).get('clips')) for p in bundle['proxies']),
        'gpuRenderedOrVerified': False,
        'scope': 'Fresh binary/container and image/material preservation verification during checkpoint recovery; historical geometry/rig/collision audit reports are retained separately.',
    }
    compact_write(args.report, report)
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
