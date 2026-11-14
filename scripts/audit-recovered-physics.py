#!/usr/bin/env python3
"""Independently verify restored BVH coverage and broad-phase query completeness."""
import gzip
import json
from pathlib import Path
import random

ROOT = Path(__file__).resolve().parents[1]
randomizer = random.Random(712400)
counts = {'models': 0, 'trees': 0, 'nodes': 0, 'leafReferences': 0,
          'queries': 0, 'nativeChannels': 0, 'derivedApertures': 0}


def intersects(a, b):
    return all(a['min'][k] <= b['max'][k] and a['max'][k] >= b['min'][k] for k in range(3))


def cuboid_bounds(box):
    assert not box.get('q'), 'This retained checkpoint has no rotated local cuboids'
    return {'min': [box['c'][k]-box['s'][k]/2 for k in range(3)],
            'max': [box['c'][k]+box['s'][k]/2 for k in range(3)]}


def contains(outer, inner):
    return all(outer['min'][k] <= inner['min'][k]+1e-7 and
               outer['max'][k] >= inner['max'][k]-1e-7 for k in range(3))


def audit_tree(tree, solids, wanted):
    counts['trees'] += 1
    nodes = tree['nodes']
    root = tree['root']
    seen_nodes, referenced = set(), []
    stack = [root]
    while stack:
        index = stack.pop()
        assert index not in seen_nodes, 'BVH cycle/shared descendant'
        seen_nodes.add(index)
        node = nodes[index]
        assert all(node['min'][k] <= node['max'][k] for k in range(3))
        if 'indices' in node:
            for solid_index in node['indices']:
                assert solid_index in wanted
                assert contains(node, cuboid_bounds(solids[solid_index]))
                referenced.append(solid_index)
        else:
            for child in [node['left'], node['right']]:
                assert contains(node, nodes[child])
                stack.append(child)
    assert len(seen_nodes) == len(nodes)
    assert len(set(referenced)) == len(referenced)
    assert set(referenced) == wanted, 'Source cuboid omitted from BVH'
    counts['nodes'] += len(nodes)
    counts['leafReferences'] += len(referenced)
    root_box = nodes[root]
    for _ in range(12):
        center = [randomizer.uniform(root_box['min'][k], root_box['max'][k]) for k in range(3)]
        half = [randomizer.uniform(.01, max(.02,(root_box['max'][k]-root_box['min'][k])*.18)) for k in range(3)]
        query = {'min':[center[k]-half[k] for k in range(3)],'max':[center[k]+half[k] for k in range(3)]}
        expected = {i for i in wanted if intersects(cuboid_bounds(solids[i]), query)}
        candidates, queue = set(), [root]
        while queue:
            node = nodes[queue.pop()]
            if not intersects(node, query):
                continue
            if 'indices' in node:
                candidates.update(node['indices'])
            else:
                queue.extend([node['left'], node['right']])
        assert expected <= candidates, 'Broad-phase query omitted intersecting cuboid'
        counts['queries'] += 1


catalog = json.loads((ROOT/'public/models/catalog.json').read_text())
for asset in catalog['assets']:
    proxy = json.loads(gzip.decompress((ROOT/'public'/asset['proxy'].lstrip('/')).read_bytes()))
    assert proxy['id'] == asset['id'] and len(proxy['static']) == proxy['sourceBoxes']
    assert len(proxy['dynamic']) == proxy['sourceDynamicBoxes']
    if proxy['static']:
        audit_tree(proxy['staticBVH'], proxy['static'], set(range(len(proxy['static']))))
    dynamic_seen = set()
    for tree in proxy.get('dynamicBVH', []):
        wanted = {i for i,b in enumerate(proxy['dynamic']) if b['node'] == tree['node']}
        assert not dynamic_seen.intersection(wanted)
        audit_tree(tree, proxy['dynamic'], wanted)
        dynamic_seen.update(wanted)
    assert dynamic_seen == set(range(len(proxy['dynamic'])))
    rig = proxy.get('rig', {})
    nodes = rig.get('nodes', [])
    assert len({n['name'] for n in nodes}) == len(nodes)
    for index, node in enumerate(nodes):
        ancestor, seen = index, set()
        while ancestor >= 0:
            assert ancestor not in seen, 'Rig parent cycle'
            seen.add(ancestor)
            ancestor = nodes[ancestor]['parent']
    for clip in rig.get('clips', []):
        for channel in clip['channels']:
            assert channel['interpolation'] == 'LINEAR'
            assert 0 <= channel['node'] < len(nodes)
            size = (len(channel['values'])//len(channel['times']) if channel['path'] == 'weights'
                    else 4 if channel['path'] == 'rotation' else 3)
            assert len(channel['values']) == len(channel['times'])*size
            assert all(a < b for a,b in zip(channel['times'], channel['times'][1:]))
            counts['nativeChannels'] += 1
    for aperture in asset.get('clearances', []):
        if aperture.get('provenance') != 'precision-solid-empty-rectangle':
            continue
        opening = cuboid_bounds(aperture)
        assert not any(intersects(opening,cuboid_bounds(box)) for box in proxy['static'])
        counts['derivedApertures'] += 1
    counts['models'] += 1
assert counts['models'] == 400 and counts['leafReferences'] == 542153
report = {'status':'passed', **counts, 'gpuRenderedOrVerified':False,
          'scope':'Fresh complete BVH leaf coverage, node containment, deterministic independent broad-phase queries, rig graph/channel structure and static aperture intersections.'}
(ROOT/'docs/validation/asset-400-physics-recovery.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
