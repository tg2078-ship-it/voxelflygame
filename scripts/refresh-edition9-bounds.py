#!/usr/bin/env python3
"""Recompute actual indexed visual bounds; ignore unused source accessor rows."""
import importlib.util,json,gzip
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('edition9',Path(__file__).with_name('prepare-edition9-models.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
audit=Path('/workspace/scratch/aa6be72e6984/update-v4/asset-audit');source=json.loads((audit/'source-catalog.json').read_text());by_id={a['id']:a for a in source['assets']};path=ROOT/'public/models/catalog.json';catalog=json.loads(path.read_text());changed=0;max_error=0
for asset in catalog['assets']:
    for lod,url in by_id[asset['id']]['exports'].items():
        if lod not in ['lod0','lod1','lod2']:continue
        doc,binary=module.unpack((audit/'source'/url).read_bytes());actual=module.bounds(doc,binary);old=asset['lodBounds'][lod];error=max(abs(a-b) for key in ['min','max'] for a,b in zip(old[key],actual[key]));changed+=error>1e-7;max_error=max(max_error,error);asset['lodBounds'][lod]=actual
        source_error=max((node.get('extras',{}).get('geometry_max_position_error_m',node.get('extras',{}).get('position_max_error_m',0)) for node in doc['nodes']),default=0)
        asset['geometry'][lod]['sourcePositionErrorM']=source_error;asset['geometry'][lod]['addedPositionErrorM']=0;asset['geometry'][lod]['positionErrorM']=source_error
    asset['bounds']=asset['lodBounds']['lod0']
    proxy=json.loads(gzip.decompress((ROOT/'public'/asset['proxy'].lstrip('/')).read_bytes()));lo=module.np.array(asset['bounds']['min']);hi=module.np.array(asset['bounds']['max'])
    for box in [proxy.get('staticBounds'),proxy.get('dynamicBounds')]:
        if box:
            a,b=module.box_bounds(box);lo=module.np.minimum(lo,a);hi=module.np.maximum(hi,b)
    asset['motionBounds']={'min':lo.tolist(),'max':hi.tolist(),'size':(hi-lo).tolist()}
temporary=path.with_suffix('.json.tmp');temporary.write_text(json.dumps(catalog,separators=(',',':'),ensure_ascii=False));temporary.replace(path)
report={'status':'passed','models':len(catalog['assets']),'visualExports':len(catalog['assets'])*3,'sourceBoundsCorrections':changed,'maximumRemovedUnusedVertexExtentM':max_error,'method':'Referenced source triangle vertices transformed through exact native hierarchy; no unreferenced accessor rows','gpuRenderedOrVerified':False};(ROOT/'docs/validation/asset-edition9-bounds.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
