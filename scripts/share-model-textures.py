#!/usr/bin/env python3
"""Losslessly externalize repeated embedded images from retained optimized GLBs.

Compressed geometry and animation segments are copied byte-for-byte; this is
container repacking, not geometry encoding or image recompression.
"""
import argparse
import concurrent.futures
import copy
import gzip
import hashlib
import json
from pathlib import Path
import struct


def unpack(path):
    data = path.read_bytes()
    if path.suffix == '.gz':
        data = gzip.decompress(data)
    assert struct.unpack_from('<III',data) == (0x46546C67,2,len(data))
    size = struct.unpack_from('<I',data,12)[0]
    document = json.loads(data[20:20+size])
    return document, data[28+size:]


def pack(document,binary):
    raw = json.dumps(document,separators=(',',':'),ensure_ascii=False).encode()
    raw += b' '*(-len(raw)%4)
    binary += b'\0'*(-len(binary)%4)
    return (struct.pack('<III',0x46546C67,2,28+len(raw)+len(binary))+
            struct.pack('<II',len(raw),0x4E4F534A)+raw+
            struct.pack('<II',len(binary),0x004E4942)+binary)


def remap_views(value, mapping):
    if isinstance(value,dict):
        for key,item in list(value.items()):
            if key == 'bufferView':
                value[key] = mapping[item]
            else:
                remap_views(item,mapping)
    elif isinstance(value,list):
        for item in value:
            remap_views(item,mapping)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--checkpoint',type=Path,required=True)
    ap.add_argument('--output',type=Path,default=Path('public/models'))
    args = ap.parse_args()
    jobs = json.loads((args.checkpoint/'jobs.json').read_text())
    assert len(jobs) == 1200
    texture_dir = args.output/'textures'
    texture_dir.mkdir(parents=True,exist_ok=True)

    def process(job):
        parts = Path(job['destFile']).parts
        relative = Path(*parts[parts.index('optimized')+1:])
        original,binary = unpack(args.checkpoint/'optimized'/relative)
        document = copy.deepcopy(original)
        image_views = set()
        image_records = []
        for image in document.get('images',[]):
            vi = image.pop('bufferView')
            view = original['bufferViews'][vi]
            assert view.get('buffer',0) == 0
            raw = binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]
            suffix = {'image/jpeg':'.jpg','image/png':'.png'}[image['mimeType']]
            assert (raw[:2] == b'\xff\xd8' if suffix == '.jpg' else raw[:8] == b'\x89PNG\r\n\x1a\n')
            digest = hashlib.sha256(raw).hexdigest()
            image['uri'] = '/models/textures/'+digest+suffix
            # Same content may be written by independent jobs; writes are identical.
            (texture_dir/(digest+suffix)).write_bytes(raw)
            image_views.add(vi)
            image_records.append((digest,len(raw)))
        mapping = {old:new for new,old in enumerate(i for i in range(len(document['bufferViews'])) if i not in image_views)}
        document['bufferViews'] = [v for i,v in enumerate(document['bufferViews']) if i not in image_views]
        remap_views(document,mapping)
        new_binary = bytearray()
        copied = {}
        def copy_segment(segment):
            assert segment.get('buffer',0) == 0
            offset,length = segment.get('byteOffset',0),segment['byteLength']
            key = (offset,length)
            if key not in copied:
                new_binary.extend(b'\0'*(-len(new_binary)%4))
                copied[key] = len(new_binary)
                new_binary.extend(binary[offset:offset+length])
            segment['byteOffset'] = copied[key]
        for view in document['bufferViews']:
            if view.get('buffer',0) == 0:
                copy_segment(view)
            extension = view.get('extensions',{}).get('EXT_meshopt_compression')
            if extension:
                copy_segment(extension)
        document['buffers'][0]['byteLength'] = len(new_binary)
        for old_index,new_index in mapping.items():
            a,b = original['bufferViews'][old_index],document['bufferViews'][new_index]
            for old_segment,new_segment in [(a,b),(a.get('extensions',{}).get('EXT_meshopt_compression'),b.get('extensions',{}).get('EXT_meshopt_compression'))]:
                if old_segment and old_segment.get('buffer',0)==0:
                    x,y = old_segment.get('byteOffset',0),new_segment.get('byteOffset',0)
                    n = old_segment['byteLength']
                    assert binary[x:x+n] == new_binary[y:y+n], (job['id'],job['lod'],'geometry/animation segment')
        # Compare all non-storage definitions after undoing reference rebasing.
        restored = copy.deepcopy(document)
        remap_views(restored,{v:k for k,v in mapping.items()})
        for field in ['nodes','meshes','materials','textures','samplers','animations','accessors','scenes','scene','extensionsUsed','extensionsRequired']:
            assert restored.get(field) == original.get(field), (job['id'],job['lod'],field)
        packed = pack(document,bytes(new_binary))
        compressed = gzip.compress(packed,compresslevel=9,mtime=0)
        target = args.output/relative.with_suffix('.glb.gz')
        target.write_bytes(compressed)
        return {'id':job['id'],'lod':job['lod'],'path':str(relative.with_suffix('.glb.gz')),
                'gzipBytes':len(compressed),'images':image_records,'copiedSegments':len(copied)}

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(process,jobs))
    catalog_path = args.output/'catalog.json'
    catalog = json.loads(catalog_path.read_text())
    by_id = {a['id']:a for a in catalog['assets']}
    for row in results:
        stats = by_id[row['id']]['geometry'][row['lod']]
        stats['bytes'] = row['gzipBytes']
        stats['externalImages'] = len(row['images'])
        stats['externalImageBytes'] = sum(n for _,n in row['images'])
        stats['embeddedImages'] = 0
        stats['embeddedImageBytes'] = 0
    catalog['textureStorage'] = 'shared-content-addressed-original-images'
    catalog.pop('collisionBundle',None)
    for asset in catalog['assets']:
        (args.output/'proxies'/(asset['id']+'.json')).unlink(missing_ok=True)
    (args.output/'collision-bundle.json.gz').unlink(missing_ok=True)
    catalog_path.write_text(json.dumps(catalog,separators=(',',':'),ensure_ascii=False))
    textures = list(texture_dir.glob('*'))
    for texture in textures:
        assert hashlib.sha256(texture.read_bytes()).hexdigest() == texture.stem
    report = {'status':'passed','models':400,'visualExports':len(results),
              'gzipModelBytes':sum(r['gzipBytes'] for r in results),
              'sharedImageCount':len(textures),'sharedImageBytes':sum(p.stat().st_size for p in textures),
              'sourceImageOccurrencesVerified':sum(len(r['images']) for r in results),
              'compressedGeometryAnimationSegmentsUnchanged':True,
              'nodesMeshesMaterialsTexturesSamplersAccessorsAnimationsUnchangedAfterReferenceRebase':True,
              'gpuRenderedOrVerified':False}
    Path('docs/validation/asset-400-shared-textures.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))


if __name__ == '__main__':
    main()
