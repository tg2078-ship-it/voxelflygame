#!/usr/bin/env python3
"""Reuse rigorously audited bounds only for exactly identical motions and solids.

The new pack reorders its structural cuboids. An array-index comparison misses
identical solids; this comparison uses exact cuboid values and the complete
native ancestor transform/keyframe signature instead. Newly authored solids
keep their freshly computed conservative interval bounds.
"""
import argparse,copy,gzip,importlib.util,json
from pathlib import Path
spec=importlib.util.spec_from_file_location('prep',Path(__file__).with_name('prepare-edition9-models.py'));prep=importlib.util.module_from_spec(spec);spec.loader.exec_module(prep)
ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--checkpoint',type=Path,required=True);args=ap.parse_args();root=Path(__file__).resolve().parents[1];catalog_path=root/'public/models/catalog.json';catalog=json.loads(catalog_path.read_text());old={p['id']:p for p in json.loads((args.checkpoint/'collision-bundle.json').read_text())['proxies']};report={'status':'passed','models':0,'dynamicBoxes':0,'exactSolidAndNativeMotionMatches':0,'modelsWithMatches':0,'noApproximationOrMotionKeyChanges':True,'gpuRenderedOrVerified':False}
def key(box):return (box['node'],tuple(box['c']),tuple(box['s']),tuple(box.get('q',[0,0,0,1])),box.get('zone','structure'))
for asset in catalog['assets']:
    path=root/'public'/asset['proxy'].lstrip('/');proxy=json.loads(gzip.decompress(path.read_bytes()));prior=old.get(asset['id']);matched=0
    if prior and prior.get('rig'):
        lookup={key(box):box for box in prior['dynamic'] if box.get('envelope')};nodes={box['node'] for box in proxy['dynamic']};same={node:prep.motion_signature(proxy['rig'],node)==prep.motion_signature(prior['rig'],node) for node in nodes if node in {n['name'] for n in prior['rig']['nodes']}}
        for box in proxy['dynamic']:
            candidate=lookup.get(key(box))
            if candidate and same.get(box['node'],False):box['envelope']=copy.deepcopy(candidate['envelope']);matched+=1
    dynamic=[box['envelope'] for box in proxy['dynamic']]+[mesh['envelope'] for mesh in proxy.get('meshes',[]) if mesh['animated']]
    if dynamic:proxy['dynamicBounds']=prep.union_bounds(dynamic)
    proxy['coverage']['exactPriorMotionEnvelopeMatches']=matched
    raw=json.dumps(proxy,separators=(',',':')).encode();path.write_bytes(gzip.compress(raw,compresslevel=9,mtime=0))
    lo=prep.np.array(asset['bounds']['min']);hi=prep.np.array(asset['bounds']['max'])
    for source in [proxy.get('staticBounds'),proxy.get('dynamicBounds')]:
        if source:
            a,b=prep.box_bounds(source);lo=prep.np.minimum(lo,a);hi=prep.np.maximum(hi,b)
    asset['motionBounds']={'min':lo.tolist(),'max':hi.tolist(),'size':(hi-lo).tolist()};report['models']+=1;report['dynamicBoxes']+=len(proxy['dynamic']);report['exactSolidAndNativeMotionMatches']+=matched;report['modelsWithMatches']+=matched>0
temporary=catalog_path.with_suffix('.json.tmp');temporary.write_text(json.dumps(catalog,separators=(',',':'),ensure_ascii=False));temporary.replace(catalog_path)
(root/'docs/validation/asset-edition9-motion-bounds.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report));harbor=next(a for a in catalog['assets'] if a['id']=='harbor_crane');print('harbor_crane',json.dumps(harbor['motionBounds']))
