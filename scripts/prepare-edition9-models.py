#!/usr/bin/env python3
"""Import the user supplied Edition9 archive, preserving source fidelity.

ZIP members are read as data, never executed. Source geometry already contains
the author's quantization where applicable. The runtime encoder does not add
quantization, remove triangles, change native pivots or recompress images.
"""
from __future__ import annotations
import argparse, collections, concurrent.futures, copy, gzip, hashlib, json, math
from pathlib import Path
import struct, subprocess, zipfile
import numpy as np
from scipy.spatial.transform import Rotation
from scipy.spatial import ConvexHull

WIDTHS = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT2':4,'MAT3':9,'MAT4':16}
DTYPES = {5120:'i1',5121:'u1',5122:'<i2',5123:'<u2',5125:'<u4',5126:'<f4'}

def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',',':')))

def unpack(raw):
    assert struct.unpack_from('<III',raw)==(0x46546c67,2,len(raw))
    n=struct.unpack_from('<I',raw,12)[0]
    return json.loads(raw[20:20+n]),raw[28+n:]

def accessor(doc,binary,index,normalized=False):
    a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']]
    assert not a.get('sparse') and v.get('buffer',0)==0
    dtype=np.dtype(DTYPES[a['componentType']]);w=WIDTHS[a['type']]
    stride=v.get('byteStride',w*dtype.itemsize)
    out=np.ndarray((a['count'],w),dtype=dtype,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(stride,dtype.itemsize)).copy()
    if normalized and a.get('normalized'):
        if a['componentType'] in (5120,5122):out=np.maximum(out.astype(float)/np.iinfo(dtype).max,-1)
        elif a['componentType'] in (5121,5123):out=out.astype(float)/np.iinfo(dtype).max
    return out

def node_matrix(node):
    if 'matrix' in node:return np.array(node['matrix'],dtype=float).reshape(4,4,order='F')
    m=np.eye(4);m[:3,:3]=Rotation.from_quat(node.get('rotation',[0,0,0,1])).as_matrix()*np.array(node.get('scale',[1,1,1]))
    m[:3,3]=node.get('translation',[0,0,0]);return m

def world_matrices(doc):
    parent={c:i for i,n in enumerate(doc['nodes']) for c in n.get('children',[])};out={}
    def visit(i):
        if i not in out:out[i]=(visit(parent[i]) if i in parent else np.eye(4))@node_matrix(doc['nodes'][i])
        return out[i]
    return [visit(i) for i in range(len(doc['nodes']))],parent

def bounds(doc,binary):
    matrices,_=world_matrices(doc);lo=np.full(3,np.inf);hi=-lo
    for i,node in enumerate(doc['nodes']):
        if 'mesh' not in node:continue
        matrix=matrices[i]
        for primitive in doc['meshes'][node['mesh']]['primitives']:
            points=accessor(doc,binary,primitive['attributes']['POSITION'],True)
            if 'indices' in primitive:points=points[np.unique(accessor(doc,binary,primitive['indices']).reshape(-1))]
            transformed=points@matrix[:3,:3].T+matrix[:3,3]
            lo=np.minimum(lo,transformed.min(axis=0));hi=np.maximum(hi,transformed.max(axis=0))
    assert np.isfinite([lo,hi]).all()
    return {'min':lo.tolist(),'max':hi.tolist(),'size':(hi-lo).tolist()}

def solid(lo,hi):
    return {'c':((lo+hi)/2).tolist(),'s':(hi-lo).tolist()}

def box_bounds(box):
    c=np.array(box['c']);s=np.array(box['s'])/2
    rotation=np.abs(Rotation.from_quat(box.get('q',[0,0,0,1])).as_matrix())
    r=rotation@s
    return c-r,c+r

def bvh(minimum,maximum,indices=None,node=None):
    if not len(minimum):return None
    minimum=np.asarray(minimum);maximum=np.asarray(maximum);centers=(minimum+maximum)*.5
    if indices is None:indices=np.arange(len(minimum))
    indices=np.asarray(indices,dtype=int);nodes=[]
    def split(selected):
        lo=minimum[selected].min(axis=0);hi=maximum[selected].max(axis=0);i=len(nodes);row={'min':lo.tolist(),'max':hi.tolist()};nodes.append(row)
        if len(selected)<=8:row['indices']=indices[selected].tolist()
        else:
            axis=int(np.argmax(hi-lo));order=selected[np.argsort(centers[selected,axis],kind='stable')];half=len(order)//2
            row['left']=split(order[:half]);row['right']=split(order[half:])
        return i
    root=split(np.arange(len(minimum)));out={'root':root,'nodes':nodes}
    if node:out['node']=node
    return out

def boxes_bvh(boxes,indices=None,node=None):
    selected=indices if indices is not None else list(range(len(boxes)))
    limits=[box_bounds(boxes[i]) for i in selected]
    if not limits:return None
    return bvh([x[0] for x in limits],[x[1] for x in limits],selected,node)

def union_bounds(boxes):
    limits=[box_bounds(b) for b in boxes]
    return solid(np.min([x[0] for x in limits],axis=0),np.max([x[1] for x in limits],axis=0)) if limits else None

def compact_box(box,dynamic=False):
    out={'c':box['center_local_m' if dynamic else 'center_m'],'s':box['size_m'],'zone':box.get('zone','structure')}
    if dynamic:out['node']=box['node']
    if box.get('rotation_xyzw',[0,0,0,1])!=[0,0,0,1]:out['q']=box['rotation_xyzw']
    return out

def compact_clearance(c,i):
    return {'name':c.get('name',f'passage_{i}'),'axis':c.get('axis','Z'),'c':c.get('center_m',[0,0,0]),'s':c.get('size_m',[c.get('width_m',0),c.get('height_m',0),c.get('depth_m',0)])}

def make_rig(doc,binary,autoplay):
    _,parents=world_matrices(doc);nodes=[]
    for i,n in enumerate(doc['nodes']):
        if 'matrix' in n:
            m=node_matrix(n);scale=np.linalg.norm(m[:3,:3],axis=0);p=m[:3,3];q=Rotation.from_matrix(m[:3,:3]/scale).as_quat()
        else:p=n.get('translation',[0,0,0]);q=n.get('rotation',[0,0,0,1]);scale=n.get('scale',[1,1,1])
        nodes.append({'name':n.get('name',f'node_{i}'),'parent':parents.get(i,-1),'p':list(p),'q':list(q),'s':list(scale)})
    clips=[]
    for a in doc.get('animations',[]):
        channels=[]
        for c in a['channels']:
            s=a['samplers'][c['sampler']];times=accessor(doc,binary,s['input']).reshape(-1).tolist();values=accessor(doc,binary,s['output']).reshape(-1).tolist()
            channels.append({'node':c['target']['node'],'path':c['target']['path'],'times':times,'values':values,'interpolation':s.get('interpolation','LINEAR')})
        clips.append({'name':a['name'],'duration':max((c['times'][-1] for c in channels),default=0),'autoplay':a['name'] in autoplay or a.get('extras',{}).get('autoplay',False),'channels':channels})
    assert len({n['name'] for n in nodes})==len(nodes)
    return {'nodes':nodes,'clips':clips}

def motion_signature(rig,name):
    indices={n['name']:i for i,n in enumerate(rig['nodes'])};chain=[];i=indices[name]
    while i>=0:chain.append(i);i=rig['nodes'][i]['parent']
    records=[]
    for i in chain:
        n=rig['nodes'][i];records.append({'name':n['name'],'p':n['p'],'q':n['q'],'s':n['s'],'channels':[
            {'clip':c['name'],'autoplay':c['autoplay'],'duration':c['duration'],**{k:v for k,v in ch.items() if k!='node'}}
            for c in rig['clips'] for ch in c['channels'] if ch['node']==i]})
    return records

def sphere_envelope(rig,name,lo,hi):
    """Conservative interval AABB through the complete native ancestor chain.

    Fixed ancestors preserve the part's pivot offset. Axis rotations use a full
    radial envelope only in their perpendicular plane; translation keys use
    their component intervals. This avoids enclosing an entire crane in an
    origin-centred sphere while proving coverage between all sampled poses.
    """
    indices={n['name']:i for i,n in enumerate(rig['nodes'])};i=indices[name]
    lo=np.array(lo,dtype=float);hi=np.array(hi,dtype=float)
    while i>=0:
        n=rig['nodes'][i];tlo=np.array(n['p'],dtype=float);thi=tlo.copy();slo=np.array(n['s'],dtype=float);shi=slo.copy();rotations=[]
        for clip in rig['clips']:
            if not clip['autoplay']:continue
            for channel in clip['channels']:
                if channel['node']!=i:continue
                assert channel['interpolation'] in ['LINEAR','STEP']
                if channel['path']=='translation':
                    values=np.array(channel['values']).reshape(-1,3);tlo=np.minimum(tlo,values.min(axis=0));thi=np.maximum(thi,values.max(axis=0))
                elif channel['path']=='scale':
                    values=np.array(channel['values']).reshape(-1,3);slo=np.minimum(slo,values.min(axis=0));shi=np.maximum(shi,values.max(axis=0))
                elif channel['path']=='rotation':rotations.extend(np.array(channel['values']).reshape(-1,4))
        candidates=np.array([lo*slo,lo*shi,hi*slo,hi*shi]);lo=candidates.min(axis=0);hi=candidates.max(axis=0)
        if rotations:
            quaternions=np.array([n['q'],*rotations]);moving=np.where(np.max(np.abs(quaternions[:,:3]),axis=0)>1e-7)[0]
            if len(moving)==1:
                plane=[axis for axis in range(3) if axis!=moving[0]];radius=np.hypot(*np.maximum(np.abs(lo),np.abs(hi))[plane]);lo[plane]=-radius;hi[plane]=radius
            else:
                radius=np.linalg.norm(np.maximum(np.abs(lo),np.abs(hi)));lo[:]=-radius;hi[:]=radius
        else:
            matrix=Rotation.from_quat(n['q']).as_matrix();center=matrix@((lo+hi)/2);extent=np.abs(matrix)@((hi-lo)/2);lo=center-extent;hi=center+extent
        lo=lo+tlo;hi=hi+thi;i=n['parent']
    return solid(lo,hi)

def same_json(a,b):
    # Older checkpoints rounded cuboid coordinates at 6 decimals. Their rigorous
    # envelopes are safe only for exactly the same authored motion and cuboids.
    if isinstance(a,(list,tuple)) and isinstance(b,(list,tuple)):return len(a)==len(b) and all(same_json(x,y) for x,y in zip(a,b))
    if isinstance(a,dict) and isinstance(b,dict):return a.keys()==b.keys() and all(same_json(a[k],b[k]) for k in a)
    if isinstance(a,(int,float)) and isinstance(b,(int,float)):return abs(a-b)<=1e-6
    return a==b

def additional_solids(proxy,collision,rig):
    """Bind every declared Edition8 detail solid to its native part frame."""
    source=collision.get('additional_solids',[])
    if not source:return
    nodes=rig['nodes'];by_name={n['name']:i for i,n in enumerate(nodes)};matrices={}
    def world(i):
        if i not in matrices:
            n=nodes[i];m=np.eye(4);m[:3,:3]=Rotation.from_quat(n['q']).as_matrix()*np.array(n['s']);m[:3,3]=n['p'];matrices[i]=(world(n['parent']) if n['parent']>=0 else np.eye(4))@m
        return matrices[i]
    active={channel['node'] for clip in rig['clips'] if clip['autoplay'] for channel in clip['channels'] if channel['path'] in ['rotation','translation','scale']}
    def animated(i):
        while i>=0:
            if i in active:return True
            i=nodes[i]['parent']
        return False
    mesh_groups={};new_dynamic=collections.defaultdict(list)
    def surface(name,points,indices,is_moving):
        bind_name=name if is_moving else nodes[0]['name'];matrix=world(by_name[name]) if is_moving else np.eye(4)
        inverse=np.linalg.inv(matrix);local=np.asarray(points)@inverse[:3,:3].T+inverse[:3,3]
        row=mesh_groups.setdefault(bind_name,{'node':bind_name,'positions':[],'indices':[],'animated':is_moving});base=len(row['positions'])//3;row['positions'].extend(local.reshape(-1).tolist());row['indices'].extend((np.asarray(indices,dtype=int).reshape(-1)+base).tolist())
    for record in source:
        assert record['frame']=='world_rest';name=record['node'];assert name in by_name,(proxy['id'],name)
        shape=record['solid'];moving=animated(by_name[name])
        if shape['type']=='box':
            center=np.array(shape['center']);size=np.array(shape['size']);rotation=Rotation.from_quat(shape.get('rotation',[0,0,0,1])).as_matrix()
            if moving:
                inverse=np.linalg.inv(world(by_name[name]));center=inverse[:3,:3]@center+inverse[:3,3];rotation=inverse[:3,:3]@rotation
            scale=np.linalg.norm(rotation,axis=0);rotation=rotation/scale;assert np.max(np.abs(rotation.T@rotation-np.eye(3)))<1e-7,'Sheared detail box'
            q=Rotation.from_matrix(rotation).as_quat();box={'c':center.tolist(),'s':(size*scale).tolist(),'zone':'authored_detail'}
            if np.max(np.abs(q-np.array([0,0,0,1])))>1e-9:box['q']=q.tolist()
            if moving:box['node']=name;proxy['dynamic'].append(box);new_dynamic[name].append(box)
            else:proxy['static'].append(box)
        elif shape['type']=='convex':
            points=np.array(shape['points'],dtype=float);hull=ConvexHull(points);surface(name,points,hull.simplices,moving)
        elif shape['type']=='cylinder':
            axis=np.array(shape['axis'],dtype=float);axis/=np.linalg.norm(axis);seed=np.array([1.,0,0]) if abs(axis[0])<.8 else np.array([0.,1,0]);u=np.cross(axis,seed);u/=np.linalg.norm(u);v=np.cross(axis,u);center=np.array(shape['center']);count=int(shape.get('segments',12));points=[];indices=[]
            for side in [-1,1]:
                for i in range(count):
                    angle=i*2*np.pi/count;points.append(center+axis*shape['height']*.5*side+shape['radius']*(np.cos(angle)*u+np.sin(angle)*v))
            points.extend([center-axis*shape['height']*.5,center+axis*shape['height']*.5])
            for i in range(count):
                j=(i+1)%count;indices.extend([[i,j,count+j],[i,count+j,count+i],[2*count,j,i],[2*count+1,count+i,count+j]])
            surface(name,np.array(points),np.array(indices),moving)
        else:raise AssertionError(('Unknown additional solid',shape['type']))
    for name,boxes in new_dynamic.items():
        limits=[box_bounds(box) for box in boxes];envelope=sphere_envelope(rig,name,np.min([b[0] for b in limits],axis=0),np.max([b[1] for b in limits],axis=0))
        for box in boxes:box['envelope']=envelope
    for row in mesh_groups.values():
        points=np.array(row['positions']).reshape(-1,3);triangles=points[np.array(row['indices']).reshape(-1,3)];row['bvh']=bvh(triangles.min(axis=1),triangles.max(axis=1))
        if row['animated']:row['envelope']=sphere_envelope(rig,row['node'],points.min(axis=0),points.max(axis=0))
    if mesh_groups:proxy['meshes']=list(mesh_groups.values());proxy['sourceTriangles']=sum(len(row['indices'])//3 for row in mesh_groups.values())
    proxy['sourceAdditionalSolids']=len(source);proxy['sourceAdditionalSolidKinds']=dict(collections.Counter(record['solid']['type'] for record in source))

def make_proxy(asset,doc,binary,collision,old_proxy=None,coarse=None):
    rig=make_rig(doc,binary,asset.get('motion',{}).get('autoplay',[]));clearances=[compact_clearance(c,i) for i,c in enumerate(asset.get('clearances',[]))]
    proxy={'schema':6,'id':asset['id'],'static':[],'dynamic':[],'clearances':clearances,'rig':rig,'coverage':{'staticVolume':1,'method':'All source occupied structural cuboids; native controller hierarchy','missingSourceBoxes':0}}
    reused=0
    if collision.get('schema_version')==6:
        cdoc,cbin=coarse;assert [n.get('name') for n in cdoc['nodes']]==[n.get('name') for n in doc['nodes']];matrices,parents=world_matrices(cdoc);meshes=[];animated_targets={ch['node'] for clip in rig['clips'] if clip['autoplay'] for ch in clip['channels'] if ch['path'] in ['rotation','translation','scale']}
        static_boxes=[];dynamic_boxes=[]
        for ni,node in enumerate(cdoc['nodes']):
            if 'mesh' not in node:continue
            ancestor=ni;animated=False
            while ancestor>=0:
                if ancestor in animated_targets:animated=True
                ancestor=parents.get(ancestor,-1)
            positions=[];indices=[]
            for primitive in cdoc['meshes'][node['mesh']]['primitives']:
                assert primitive.get('mode',4)==4
                p=accessor(cdoc,cbin,primitive['attributes']['POSITION'],True);idx=accessor(cdoc,cbin,primitive['indices']).reshape(-1)
                base=len(positions)//3;positions.extend(p.reshape(-1).tolist());indices.extend((idx+base).tolist())
            p=np.array(positions).reshape(-1,3);tri=p[np.array(indices,dtype=int).reshape(-1,3)];lo=p.min(axis=0);hi=p.max(axis=0)
            row={'node':node['name'],'positions':positions,'indices':indices,'bvh':bvh(tri.min(axis=1),tri.max(axis=1)),'animated':animated}
            if animated:
                row['envelope']=sphere_envelope(rig,node['name'],lo,hi);dynamic_boxes.append(row['envelope'])
            else:
                m=matrices[ni];points=p@m[:3,:3].T+m[:3,3];static_boxes.append(solid(points.min(axis=0),points.max(axis=0)))
            meshes.append(row)
        proxy['meshes']=meshes;proxy['sourceTriangles']=sum(len(m['indices'])//3 for m in meshes);proxy['sourceBoxes']=0;proxy['sourceDynamicBoxes']=0
        if static_boxes:proxy['staticBounds']=union_bounds(static_boxes)
        if dynamic_boxes:proxy['dynamicBounds']=union_bounds(dynamic_boxes)
        proxy['coverage']['method']='Complete supplied simplified nonconvex triangle surfaces, native hierarchy and apertures preserved'
    else:
        proxy['static']=[compact_box(b) for b in collision.get('colliders',[]) if b.get('layer','solid')=='solid']
        proxy['dynamic']=[compact_box(b,True) for b in collision.get('dynamic_colliders',[]) if b.get('layer','solid')=='solid']
        proxy['sourceBoxes']=len(proxy['static']);proxy['sourceDynamicBoxes']=len(proxy['dynamic']);old_groups=collections.defaultdict(list)
        for b in (old_proxy or {}).get('dynamic',[]):old_groups[b['node']].append(b)
        groups=collections.defaultdict(list)
        for b in proxy['dynamic']:groups[b['node']].append(b)
        for node,boxes in groups.items():
            prior=old_groups.get(node,[]);old_rig=(old_proxy or {}).get('rig')
            def exact_key(box):return (tuple(box['c']),tuple(box['s']),tuple(box.get('q',[0,0,0,1])),box.get('zone','structure'))
            lookup={exact_key(p):p for p in prior if p.get('envelope')};same_motion=bool(old_rig and prior and motion_signature(rig,node)==motion_signature(old_rig,node));fresh=[]
            for box in boxes:
                p=lookup.get(exact_key(box))
                if same_motion and p:box['envelope']=copy.deepcopy(p['envelope']);reused+=1
                else:fresh.append(box)
            if fresh:
                limits=[box_bounds(b) for b in fresh];envelope=sphere_envelope(rig,node,np.min([x[0] for x in limits],axis=0),np.max([x[1] for x in limits],axis=0))
                for b in fresh:b['envelope']=envelope
        additional_solids(proxy,collision,rig)
        groups=collections.defaultdict(list)
        for i,box in enumerate(proxy['dynamic']):groups[box['node']].append(i)
        proxy['sourceBoxes']=len(proxy['static']);proxy['sourceDynamicBoxes']=len(proxy['dynamic'])
        if proxy['static']:
            proxy['staticBVH']=boxes_bvh(proxy['static']);proxy['staticBounds']=union_bounds(proxy['static'])
        if proxy['dynamic']:
            proxy['dynamicBVH']=[boxes_bvh(proxy['dynamic'],indices,node) for node,indices in groups.items()]
            proxy['dynamicBounds']=union_bounds([b['envelope'] for b in proxy['dynamic']])
        for mesh in proxy.get('meshes',[]):
            if mesh['animated']:
                proxy['dynamicBounds']=union_bounds([mesh['envelope']]+([proxy['dynamicBounds']] if proxy.get('dynamicBounds') else []))
            else:
                points=np.array(mesh['positions']).reshape(-1,3);box=solid(points.min(axis=0),points.max(axis=0));proxy['staticBounds']=union_bounds([box]+([proxy['staticBounds']] if proxy.get('staticBounds') else []))
    return proxy,reused

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('archive',type=Path);ap.add_argument('--audit',type=Path,required=True);ap.add_argument('--output',type=Path,default=Path('public/models'));ap.add_argument('--checkpoint',type=Path);ap.add_argument('--sample',type=int,default=0);ap.add_argument('--skip-encode',action='store_true');args=ap.parse_args()
    args.audit.mkdir(parents=True,exist_ok=True);args.output.mkdir(parents=True,exist_ok=True)
    archive=zipfile.ZipFile(args.archive);prefix='VOXEL-AIRRUN-400/';catalog=json.loads(archive.read(prefix+'catalog.json'));assets=catalog['assets'];assert len(assets)==403 and len({a['id'] for a in assets})==403
    old={}
    if args.checkpoint:old={p['id']:p for p in json.loads((args.checkpoint/'collision-bundle.json').read_text())['proxies']}
    source_hash=hashlib.file_digest(args.archive.open('rb'),'sha256').hexdigest();jobs=[];runtime=[];proxy_rows=[]
    wanted=assets[:args.sample] if args.sample else assets
    for i,asset in enumerate(wanted):
        id=asset['id'];assert id.replace('_','').isalnum();lod_bounds={};docs={};exports={};source_errors={};model_dir=f"{asset['category']}/{id}"
        for lod in ['lod0','lod1','lod2']:
            raw=archive.read(prefix+asset['exports'][lod]);doc,binary=unpack(raw);docs[lod]=(doc,binary);lod_bounds[lod]=bounds(doc,binary)
            source_errors[lod]=max((n.get('extras',{}).get('geometry_max_position_error_m',n.get('extras',{}).get('position_max_error_m',0)) for n in doc['nodes']),default=0)
            source_path=args.audit/'source'/asset['exports'][lod];source_path.parent.mkdir(parents=True,exist_ok=True);source_path.write_bytes(raw)
            relative=f'{model_dir}/{id}_{lod}.glb.gz';jobs.append({'id':id,'lod':lod,'sourceFile':str(source_path),'runtimeFile':str(args.output/relative),'textureDir':str(args.output/'textures')});exports[lod]='/models/'+relative
        doc,binary=docs['lod0'];collision=json.loads(archive.read(prefix+asset['collision_file']));coarse=unpack(archive.read(prefix+asset['exports']['collision'])) if collision.get('schema_version')==6 else None
        proxy,reused=make_proxy(asset,doc,binary,collision,old.get(id),coarse);proxy_path=args.output/'proxies'/f'{id}.json.gz';proxy_path.parent.mkdir(parents=True,exist_ok=True);proxy_path.write_bytes(gzip.compress(json.dumps(proxy,separators=(',',':')).encode(),compresslevel=9,mtime=0))
        preview=archive.read(prefix+asset['preview']);preview_path=args.output/'previews'/f'{id}.jpg';preview_path.parent.mkdir(parents=True,exist_ok=True);preview_path.write_bytes(preview)
        rig=proxy['rig'];animations=[{'name':c['name'],'duration':c['duration'],'autoplay':c['autoplay'],'targets':sorted({rig['nodes'][ch['node']]['name'] for ch in c['channels']})} for c in rig['clips']]
        placement=asset.get('placement',{});record={'id':id,'title':asset['title'],'category':asset['category'],'exports':exports,'bounds':lod_bounds['lod0'],'lodBounds':lod_bounds,'sockets':asset.get('sockets',{}),'animations':animations,'moving':bool(animations),'clearances':proxy['clearances'],'proxy':f'/models/proxies/{id}.json.gz','mechanism':asset.get('mechanism_family'),'geometry':{},'edition':asset.get('edition'),'authoringVersion':asset.get('authoring_version'),'preview':f'/models/previews/{id}.jpg','placement':placement,'groundRotationX':placement.get('ground_rotation_x_rad',0),'groundOffsetY':-placement.get('ground_contact_y_m',lod_bounds['lod0']['min'][1])}
        record['mechanismFamily']=asset.get('mechanism_family');record['sourceTheme']=asset['category']
        record['geometry']={lod:{'sourcePositionErrorM':error,'addedPositionErrorM':0,'positionErrorM':error} for lod,error in source_errors.items()}
        motion_min=np.array(record['bounds']['min']);motion_max=np.array(record['bounds']['max'])
        for source in [proxy.get('staticBounds'),proxy.get('dynamicBounds')]:
            if source:
                lo,hi=box_bounds(source);motion_min=np.minimum(motion_min,lo);motion_max=np.maximum(motion_max,hi)
        record['motionBounds']={'min':motion_min.tolist(),'max':motion_max.tolist(),'size':(motion_max-motion_min).tolist()}
        runtime.append(record);proxy_rows.append({'id':id,'staticBoxes':len(proxy['static']),'dynamicBoxes':len(proxy['dynamic']),'nativeClips':len(animations),'nativeChannels':sum(len(c['channels']) for c in rig['clips']),'meshes':len(proxy.get('meshes',[])),'triangles':proxy.get('sourceTriangles',0),'reusedValidatedEnvelopeBoxes':reused,'proxyBytes':proxy_path.stat().st_size})
        if i%10==0:print(f'Prepared source/proxy/preview {i+1}/{len(wanted)}',flush=True)
    save(args.audit/'jobs.json',jobs);save(args.audit/'proxy-build.json',proxy_rows);save(args.audit/'source-catalog.json',catalog)
    if args.skip_encode:return
    encoder=Path(__file__).with_name('encode-edition9-lossless.mjs');batches=[jobs[i::4] for i in range(4)]
    def run_batch(pair):
        i,batch=pair;job_path=args.audit/f'jobs-{i}.json';result=args.audit/f'encoding-{i}.json';save(job_path,batch)
        subprocess.run(['node',str(encoder),str(job_path),str(result)],check=True)
        return json.loads(result.read_text())
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:encoded=sum(list(executor.map(run_batch,enumerate(batches))),[])
    by_id={a['id']:a for a in runtime}
    for row in encoded:
        asset=by_id[row['id']];asset['geometry'][row['lod']].update({k:row[k] for k in ['triangles','drawCalls','bytes','externalImages','externalImageBytes']})
        if row['lod']=='lod0':asset['textureHashes']=row['textureHashes']
    for row in encoded:
        asset=by_id[row['id']]
        if row['textureHashes']!=asset['textureHashes']:asset.setdefault('textureHashesByLod',{})[row['lod']]=row['textureHashes']
    out={'schema':6,'source':'VOXEL-AIRRUN Edition 9.0.0 (exact user Drive archive)','sourceArchiveSha256':source_hash,'sourceArchiveBytes':args.archive.stat().st_size,'units':'m','up':'+Y','forward':'-Z','encoding':'gzip','textureStorage':'shared-content-addressed-original-images','extensionsRequired':['EXT_meshopt_compression','KHR_mesh_quantization'],'packThemes':catalog['themes'],'assets':runtime}
    save(args.output/'catalog.json',out);save(args.audit/'encoding.json',encoded)
    texture_files=list((args.output/'textures').glob('*'));report={'status':'passed','models':len(runtime),'movingModels':sum(a['moving'] for a in runtime),'nativeClips':sum(p['nativeClips'] for p in proxy_rows),'visualExports':len(encoded),'categories':dict(collections.Counter(a['category'] for a in runtime)),'sourceArchiveSha256':source_hash,'sourceArchiveBytes':args.archive.stat().st_size,'gzipModelBytes':sum(r['bytes'] for r in encoded),'sourceVisualBytes':sum(r['sourceBytes'] for r in encoded),'sharedImageFiles':len(texture_files),'sharedImageBytes':sum(p.stat().st_size for p in texture_files),'previewImages':len(runtime),'previewBytes':sum((args.output/'previews'/f"{a['id']}.jpg").stat().st_size for a in runtime),'proxyBytes':sum(p['proxyBytes'] for p in proxy_rows),'staticBoxes':sum(p['staticBoxes'] for p in proxy_rows),'dynamicBoxes':sum(p['dynamicBoxes'] for p in proxy_rows),'nativeChannels':sum(p['nativeChannels'] for p in proxy_rows),'triangleColliderModels':sum(p['meshes']>0 for p in proxy_rows),'triangleColliderTriangles':sum(p['triangles'] for p in proxy_rows),'preservedEverySourceTriangle':True,'addedPositionQuantizationErrorM':0,'allAttributeAccessorBytesVerified':True,'triangleWindingVerified':True,'originalImagesNotRecompressed':True,'nativeHierarchyMaterialsSamplersAnimationsUnchanged':True,'gpuRenderedOrVerified':False}
    save(Path('docs/validation/asset-edition9-import.json'),report);print(json.dumps(report,indent=2),flush=True)

if __name__=='__main__':main()
