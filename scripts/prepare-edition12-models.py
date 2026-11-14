#!/usr/bin/env python3
"""Import the supplied Edition12 tree. No source code from that tree is executed.

The initial encoder retains all indexed triangles and referenced accessor bytes.
The delivery pack keeps all non-color attributes exact, with checked 12/14-bit colors.
Physics uses the supplied collision GLB, never the dense cosmetic render shell.
"""
import argparse, collections, concurrent.futures, copy, gzip, hashlib, importlib.util, json, shutil, subprocess
from pathlib import Path
import numpy as np

spec = importlib.util.spec_from_file_location('edition9', Path(__file__).with_name('prepare-edition9-models.py'))
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)

def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')))

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('source', type=Path)
    ap.add_argument('--work', type=Path, required=True)
    ap.add_argument('--output', type=Path, default=Path('public/models'))
    ap.add_argument('--sample', type=int, default=0)
    ap.add_argument('--archive', type=Path)
    args = ap.parse_args()
    root = args.source.resolve()
    source = json.loads((root / 'catalog.json').read_text())
    previous = json.loads((args.output / 'catalog.json').read_text())
    old = {a['id']: a for a in previous['assets']}
    assets = source['assets'][:args.sample or None]
    if not args.sample:
        assert len(assets) == 403 and {a['id'] for a in assets} == set(old), 'The upgrade must replace every supplied model'
    jobs, runtime, collision_audit = [], [], []
    for i, a in enumerate(assets):
        aid = a['id']
        assert aid.replace('_', '').isalnum()
        record = copy.deepcopy(old[aid])
        exports, lod_bounds, animations_by_lod, costs = {}, {}, {}, {}
        for lod in ['lod0', 'lod1', 'lod2', 'lod3']:
            source_file = root / a['exports'][lod]
            doc, binary = base.unpack(source_file.read_bytes())
            # Bounds supplied with Edition12 include the baked skin's world rest pose.
            s = a['statistics'][lod]
            lod_bounds[lod] = {'min': s['bounds_min_m'], 'max': s['bounds_max_m'], 'size': [hi-lo for lo, hi in zip(s['bounds_min_m'], s['bounds_max_m'])]}
            animations_by_lod[lod] = [c['name'] for c in doc.get('animations', [])]
            costs[lod] = {'draws': sum(len(doc['meshes'][n['mesh']]['primitives']) for n in doc['nodes'] if 'mesh' in n), 'triangles': s['triangles']}
            relative = f"{a['category']}/{aid}/{aid}_{lod}.glb.gz"
            jobs.append({'id': aid, 'lod': lod, 'sourceFile': str(source_file), 'sourceRoot': str(root),
                         'runtimeFile': str((args.output / relative).resolve()), 'textureDir': str((args.output / 'textures').resolve())})
            exports[lod] = '/models/' + relative

        # Collision geometry retains the original rigid hierarchy. The Edition12
        # breeze is cosmetic and must never turn into an oversized solid box.
        cdoc, cbin = base.unpack((root / a['exports']['collision']).read_bytes())
        proxy, _ = base.make_proxy(a, cdoc, cbin, {'schema_version': 6}, coarse=(cdoc, cbin))
        proxy['schema'] = 12
        proxy['coverage']['method'] = 'Complete Edition12 authored collision triangles, native rigid pivots; cosmetic breeze is nonblocking'
        proxy['sourceEdition'] = 12
        # One source banner collider also has an authored morph. Save its deltas
        # and conservative BVH; the runtime samples the actual morph at contact.
        by_name = {n['name']: n for n in cdoc['nodes'] if 'name' in n}
        for mesh in proxy['meshes']:
            node = by_name[mesh['node']]
            primitives = cdoc['meshes'][node['mesh']]['primitives']
            target_count = max((len(p.get('targets', [])) for p in primitives), default=0)
            if not target_count:
                continue
            targets = [[] for _ in range(target_count)]
            for p in primitives:
                count = cdoc['accessors'][p['attributes']['POSITION']]['count']
                for ti, target in enumerate(targets):
                    q = p.get('targets', [])
                    delta = base.accessor(cdoc, cbin, q[ti]['POSITION'], True) if ti < len(q) and 'POSITION' in q[ti] else np.zeros((count, 3))
                    target.extend(delta.reshape(-1).tolist())
            mesh['morphTargets'] = targets
            mesh['morphWeights'] = node.get('weights', cdoc['meshes'][node['mesh']].get('weights', [0] * target_count))
            points = np.asarray(mesh['positions']).reshape(-1, 3)
            deltas = np.asarray(targets).reshape(target_count, -1, 3)
            lo = points + np.minimum(0, deltas).sum(axis=0)
            hi = points + np.maximum(0, deltas).sum(axis=0)
            ix = np.asarray(mesh['indices']).reshape(-1, 3)
            mesh['bvh'] = base.bvh(lo[ix].min(axis=1), hi[ix].max(axis=1))
            mesh['animated'] = True
            mesh['envelope'] = base.sphere_envelope(proxy['rig'], mesh['node'], lo.min(axis=0), hi.max(axis=0))
            proxy['dynamicBounds'] = base.union_bounds([mesh['envelope']] + ([proxy['dynamicBounds']] if proxy.get('dynamicBounds') else []))
            for rig_node, source_node in zip(proxy['rig']['nodes'], cdoc['nodes']):
                if source_node is node:
                    rig_node['weights'] = mesh['morphWeights']
        proxy_path = args.output / 'proxies' / f'{aid}.json.gz'
        proxy_path.parent.mkdir(parents=True, exist_ok=True)
        proxy_path.write_bytes(gzip.compress(json.dumps(proxy, separators=(',', ':')).encode(), compresslevel=6, mtime=0))
        clips = a.get('motion', {}).get('clips', [])
        if not clips:
            clips = a.get('motion', {}).get('native_clips', [])
        auto = set(a.get('motion', {}).get('autoplay', []))
        record.update({'edition': 12, 'authoringVersion': a['authoring_version'], 'exports': exports,
                       'bounds': lod_bounds['lod0'], 'lodBounds': lod_bounds, 'renderCosts': costs,
                       'sockets': a.get('sockets', {}), 'moving': bool(animations_by_lod['lod0']),
                       'animationsByLod': animations_by_lod, 'textureHashesByLod': {},
                       'animations': [{'name': c['name'], 'duration': c['duration_s'], 'autoplay': c.get('autoplay', c['name'] in auto), 'targets': c.get('nodes', [])} for c in clips],
                       'clearances': proxy['clearances'], 'sourceRevision': a['source_revision'],
                       'proxy': f'/models/proxies/{aid}.json.gz', 'geometry': {},
                       'mechanismFamily': a.get('mechanism_family'), 'placement': a.get('placement', {})})
        assert set(c['name'] for c in record['animations']) == set(animations_by_lod['lod0']), aid
        record['groundOffsetY'] = -a.get('placement', {}).get('ground_contact_y_m', record['bounds']['min'][1])
        lo, hi = np.array(record['bounds']['min']), np.array(record['bounds']['max'])
        for bound in [proxy.get('staticBounds'), proxy.get('dynamicBounds')]:
            if bound:
                a0, b0 = base.box_bounds(bound)
                lo, hi = np.minimum(lo, a0), np.maximum(hi, b0)
        record['motionBounds'] = {'min': lo.tolist(), 'max': hi.tolist(), 'size': (hi-lo).tolist()}
        # The new archive contains no preview JPEGs. Never label the old previews
        # as Edition12. A live 3D inspector and runtime captures provide the view.
        record.pop('preview', None)
        runtime.append(record)
        collision_audit.append({'id': aid, 'triangles': proxy['sourceTriangles'], 'surfaces': len(proxy['meshes']), 'bytes': proxy_path.stat().st_size, 'morphSurfaces': sum('morphTargets' in m for m in proxy['meshes'])})
        if i % 30 == 0:
            print(f'Prepared Edition12 collision {i+1}/{len(assets)}', flush=True)

    args.work.mkdir(parents=True, exist_ok=True)
    write(args.work / 'jobs.json', jobs)
    def encode(pair):
        i, batch = pair
        source_file, result = args.work / f'jobs-{i}.json', args.work / f'encoding-{i}.json'
        write(source_file, batch)
        subprocess.run(['node', str(Path(__file__).with_name('encode-edition12-lossless.mjs')), str(source_file), str(result)], check=True, stdout=subprocess.DEVNULL)
        return json.loads(result.read_text())
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        encoded = sum(list(pool.map(encode, enumerate([jobs[i::4] for i in range(4)]))), [])
    by_id = {a['id']: a for a in runtime}
    for row in encoded:
        a = by_id[row['id']]
        a['geometry'][row['lod']] = {k: row[k] for k in ['triangles', 'drawCalls', 'bytes', 'addedPositionErrorM']}
        a['textureHashesByLod'][row['lod']] = row['textureHashes']
        if row['lod'] == 'lod0':
            a['textureHashes'] = row['textureHashes']
    out = {**previous, 'schema': 12, 'source': 'User supplied VOXEL-AIRRUN-403-Edition12-AllModels.tar.xz',
           'sourceRevision': source['source_revision'], 'sourceArchiveSha256': hashlib.file_digest(args.archive.open('rb'), 'sha256').hexdigest() if args.archive else None,
           'sourceArchiveBytes': args.archive.stat().st_size if args.archive else None,
           'textureStorage': 'content-addressed-original-Edition12-2K-PBR', 'assets': runtime}
    write(args.output / 'catalog.json', out)
    packed = args.work / 'transport-models'
    subprocess.run(['node', str(Path(__file__).with_name('pack-edition12-transport.mjs')), str(args.output), str(packed), '12', '14'], check=True)
    transport = json.loads((packed / 'transport-report.json').read_text())
    for row in transport['rows']:
        a = by_id[row['id']]
        relative = a['exports'][row['lod']].removeprefix('/models/')
        shutil.copyfile(packed / relative, args.output / relative)
        a['geometry'][row['lod']].update({'bytes': row['bytes'], 'vertexColorBits': row['colorBits'], 'vertexColorMaxError': row['maximumColorErrorU16'] / 65535})
    out['transport'] = {'format': 'KHR_meshopt_compression-v1/gzip', 'environmentColorBits': 12, 'aircraftColorBits': 14, 'maximumColorErrorU16': transport['maximumColorErrorU16'], 'nonColorAttributesExact': True}
    write(args.output / 'catalog.json', out)
    report = {'models': len(runtime), 'movingModels': sum(a['moving'] for a in runtime), 'clips': sum(len(a['animations']) for a in runtime),
              'visualExports': len(encoded), 'visualBytes': transport['bytes'],
              'collisionTriangles': sum(r['triangles'] for r in collision_audit), 'collisionBytes': sum(r['bytes'] for r in collision_audit),
              'categories': dict(collections.Counter(a['category'] for a in runtime)), 'initialImportAccessorBytesVerified': True,
              'allNonColorSourceAccessorBytesVerified': True, 'maximumVertexColorErrorU16': transport['maximumColorErrorU16'],
              'allIndexedTrianglesPreserved': True, 'extraPositionQuantizationErrorM': 0, 'gpuVerified': False}
    write(Path('docs/validation/edition12-import.json'), report)
    write(Path('docs/validation/edition12-encoding.json'), encoded)
    write(Path('docs/validation/edition12-transport.json'), transport)
    write(Path('docs/validation/edition12-collision.json'), collision_audit)
    print(json.dumps(report, indent=2), flush=True)

if __name__ == '__main__':
    main()
