import { nativeFetch } from './image-runtime';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as T from 'three';
import { AIRCRAFT } from '../../app/airrun/data';
import { ModelLibrary, parkAircraft, poseAircraft } from '../../app/airrun/assets';
import { assetUrl } from '../../app/airrun/asset-url';
import { equipmentPath, setAirframeFinish } from '../../app/airrun/airframe-finish';
import fleet from '../../app/airrun/fleet-manifest.json';
import { catalog } from './fixtures';

globalThis.fetch = async url => {
    if (/^(blob:|data:)/.test(String(url))) return nativeFetch(url);
    try { return new Response(await fs.readFile(path.join('public',String(url).split('?')[0]))); }
    catch { return new Response(null,{status:404}); }
};
assert.equal(Object.keys(fleet).length,21);
const lib=new ModelLibrary();
await lib.init(()=>{});
const starter=await lib.load(AIRCRAFT[0].model,0);
assert.equal(equipmentPath(AIRCRAFT[0].model,0),undefined);
starter.scene.traverse(node=>{if(node instanceof T.Mesh)assert(!node.geometry.hasAttribute('airframeCoord'));});

let levels=0, rigs=0, painted=0;
for(const plane of AIRCRAFT.slice(1)){
    const meta=catalog.get(plane.model)!;
    for(const lod of [0,2] as const){
        const kit=equipmentPath(plane.model,lod)!;
        assert.equal(assetUrl(kit,'/voxelflygame/'),'/voxelflygame'+kit);
        const instance=await lib.instance(plane.model,lod,true);
        assert.deepEqual([...instance.actions.keys()],meta.animationsByLod!['lod'+lod as 'lod0'|'lod2']);
        assert.equal(instance.meta.groundRotationX,meta.groundRotationX);
        assert(Number.isFinite(parkAircraft(instance)));
        const initial=new Map<T.Object3D,T.Quaternion>();
        instance.model.traverse(node=>{
            if(node.name.startsWith('Shaft__')){
                assert.equal(node.parent?.name,node.name.slice('Shaft__'.length));
                initial.set(node.parent!,node.parent!.quaternion.clone());rigs++;
            }
            if(!(node instanceof T.Mesh))return;
            const uvw=node.geometry.getAttribute('airframeCoord');
            if(uvw){
                assert.equal(uvw.count,node.geometry.getAttribute('position').count);
                assert(setAirframeFinish(node.material,new T.Color('#ffbb00'),new T.Color('#235cab')));
                assert(setAirframeFinish(node.material));
                painted++;
            }
        });
        poseAircraft(instance,.137,.52,-.4,false,.3);
        for(const [pivot,rotation] of initial)assert(pivot.quaternion.angleTo(rotation)>.01,plane.id+' spinning shaft');
        const parts=instance.model.getObjectByName(plane.model+'_metal') as T.Mesh;
        assert(parts?.isMesh,plane.id+' fitted hardware');
        parts.geometry.computeBoundingBox();
        const box=parts.geometry.boundingBox!;
        for(let axis=0;axis<3;axis++){
            assert(box.min.getComponent(axis)>=meta.bounds.min[axis]-.001);
            assert(box.max.getComponent(axis)<=meta.bounds.max[axis]+.001);
        }
        assert(instance.materials.some(m=>m.name==='E12_SHARED_SURFACE' && m.map && m.normalMap));
        instance.dispose();lib.trim(2);levels++;
    }
}
assert(rigs>15 && painted>=levels);
lib.dispose();

const fallback = new ModelLibrary();
const model = 'pitts_s2c';
fallback.byId = catalog;
const download = fallback.download.bind(fallback);
fallback.download = (url, id) => url.startsWith('/flight-fleet/') ? Promise.reject(new Error('Offline fittings')) : download(url, id);
const flyable = await fallback.instance(model, 0);
assert(flyable.materials.some(m => m.userData.airframeDesign === model));
assert(!flyable.model.getObjectByName(model + '_metal'));
assert.deepEqual([...flyable.actions.keys()], catalog.get(model)!.animationsByLod!.lod0);
flyable.dispose();
fallback.dispose();
console.log(JSON.stringify({airframes:21,detailLevels:levels,workingShafts:rigs,paintedSurfaces:painted,starterOriginal:true}));
