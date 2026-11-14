#!/usr/bin/env python3
"""Independent source-record and BVH completeness audit for the Edition9 import."""
import collections, gzip, json, random, zipfile
from pathlib import Path
import numpy as np
from scipy.spatial.transform import Rotation

ROOT=Path(__file__).resolve().parents[1]
ARCHIVE=Path('/workspace/scratch/aa6be72e6984/update-v4/VOXEL-AIRRUN-400-Models-GLB.zip')
rng=random.Random(99403)
counts={'models':0,'trees':0,'nodes':0,'boxLeafReferences':0,'triangleLeafReferences':0,'queries':0,
        'structuralSourceBoxes':0,'additionalSourceSolids':0,'sourceAdditionalKinds':collections.Counter(),
        'gpuRenderedOrVerified':False}

def limits(box):
    c=np.array(box['c']);s=np.array(box['s'])/2;q=Rotation.from_quat(box.get('q',[0,0,0,1])).as_matrix()
    points=np.array([[x,y,z] for x in [-s[0],s[0]] for y in [-s[1],s[1]] for z in [-s[2],s[2]]])@q.T+c
    return points.min(axis=0),points.max(axis=0)

def intersect(lo,hi,a,b):return bool(np.all(lo<=b) and np.all(hi>=a))

def audit_tree(tree,minimum,maximum,wanted,triangle=False):
    nodes=tree['nodes'];seen=set();leaves=[];stack=[tree['root']];minimum=np.array(minimum);maximum=np.array(maximum)
    while stack:
        index=stack.pop();assert index not in seen,'BVH cycle';seen.add(index);node=nodes[index];lo=np.array(node['min']);hi=np.array(node['max']);assert np.all(lo<=hi)
        if 'indices' in node:
            for i in node['indices']:
                assert i in wanted and np.all(lo<=minimum[i]+1e-7) and np.all(hi>=maximum[i]-1e-7);leaves.append(i)
        else:
            for child in [node['left'],node['right']]:
                row=nodes[child];assert np.all(lo<=np.array(row['min'])+1e-7) and np.all(hi>=np.array(row['max'])-1e-7);stack.append(child)
    assert len(seen)==len(nodes) and len(leaves)==len(set(leaves)) and set(leaves)==wanted
    counts['trees']+=1;counts['nodes']+=len(nodes);counts['triangleLeafReferences' if triangle else 'boxLeafReferences']+=len(leaves)
    root=nodes[tree['root']]
    for _ in range(8):
        center=np.array([rng.uniform(root['min'][k],root['max'][k]) for k in range(3)]);half=np.array([rng.uniform(.001,max(.002,(root['max'][k]-root['min'][k])*.13)) for k in range(3)]);lo=center-half;hi=center+half
        expected={i for i in wanted if intersect(minimum[i],maximum[i],lo,hi)};found=set();stack=[tree['root']]
        while stack:
            node=nodes[stack.pop()]
            if not intersect(np.array(node['min']),np.array(node['max']),lo,hi):continue
            if 'indices' in node:found.update(node['indices'])
            else:stack.extend([node['left'],node['right']])
        assert expected<=found,'BVH omitted intersecting primitive';counts['queries']+=1

catalog=json.loads((ROOT/'public/models/catalog.json').read_text());archive=zipfile.ZipFile(ARCHIVE);source=json.loads(archive.read('VOXEL-AIRRUN-400/catalog.json'));by_id={a['id']:a for a in source['assets']}
for asset in catalog['assets']:
    proxy=json.loads(gzip.decompress((ROOT/'public'/asset['proxy'].lstrip('/')).read_bytes()));assert proxy['id']==asset['id'];original=json.loads(archive.read('VOXEL-AIRRUN-400/'+by_id[asset['id']]['collision_file']))
    if original.get('schema_version')!=6:
        static=[b for b in original.get('colliders',[]) if b.get('layer','solid')=='solid'];dynamic=[b for b in original.get('dynamic_colliders',[]) if b.get('layer','solid')=='solid'];extra=original.get('additional_solids',[])
        assert len(proxy['static'])+len(proxy['dynamic'])==len(static)+len(dynamic)+sum(b['solid']['type']=='box' for b in extra)
        for a,b in zip(static,proxy['static']):assert a['center_m']==b['c'] and a['size_m']==b['s']
        for a,b in zip(dynamic,proxy['dynamic']):assert a['center_local_m']==b['c'] and a['size_m']==b['s'] and a['node']==b['node']
        assert proxy.get('sourceAdditionalSolids',0)==len(extra)
        kinds=collections.Counter(b['solid']['type'] for b in extra);assert proxy.get('sourceAdditionalSolidKinds',{})==dict(kinds)
        counts['structuralSourceBoxes']+=len(static)+len(dynamic);counts['additionalSourceSolids']+=len(extra);counts['sourceAdditionalKinds'].update(kinds)
    else:assert proxy.get('meshes') and not proxy['static'] and not proxy['dynamic']
    for kind in ['static','dynamic']:
        boxes=proxy[kind]
        if not boxes:continue
        bounds=[limits(b) for b in boxes];minimum=[b[0] for b in bounds];maximum=[b[1] for b in bounds]
        if kind=='static':audit_tree(proxy['staticBVH'],minimum,maximum,set(range(len(boxes))))
        else:
            for tree in proxy['dynamicBVH']:audit_tree(tree,minimum,maximum,{i for i,b in enumerate(boxes) if b['node']==tree['node']})
    rig=proxy['rig'];names={n['name'] for n in rig['nodes']};assert len(names)==len(rig['nodes'])
    for mesh in proxy.get('meshes',[]):
        assert mesh['node'] in names and len(mesh['indices'])%3==0
        points=np.array(mesh['positions']).reshape(-1,3);indices=np.array(mesh['indices']).reshape(-1,3);assert indices.min()>=0 and indices.max()<len(points)
        triangles=points[indices];audit_tree(mesh['bvh'],triangles.min(axis=1),triangles.max(axis=1),set(range(len(indices))),True)
        assert bool(mesh.get('envelope'))==mesh['animated']
    counts['models']+=1
assert counts['models']==403;assert counts['structuralSourceBoxes']==436671;assert counts['additionalSourceSolids']==72776
counts['status']='passed';counts['sourceAdditionalKinds']=dict(counts['sourceAdditionalKinds'])
(ROOT/'docs/validation/asset-edition9-physics.json').write_text(json.dumps(counts,indent=2)+'\n');print(json.dumps(counts))
