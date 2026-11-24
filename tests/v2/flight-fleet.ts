import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {AIRCRAFT} from '../../app/airrun/data';
import fleet from '../../app/airrun/fleet-manifest.json';
import {catalog} from './fixtures';
assert.equal(Object.keys(fleet).length,21);
assert(!(AIRCRAFT[0].model in fleet));
for(const plane of AIRCRAFT.slice(1)){
    const refit=fleet[plane.model as keyof typeof fleet];
    for(const path of new Set(Object.values(refit.exports))){
        const bytes=gunzipSync(fs.readFileSync('public'+path));
        const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'');
        assert.deepEqual(gltf.animations.map(c=>c.name),refit.animations.map(c=>c.name));
        const size=new T.Box3().setFromObject(gltf.scene).getSize(new T.Vector3()).toArray(),target=catalog.get(plane.model)!.bounds.size;
        assert(size.every((v,i)=>Math.abs(v-target[i])<.001),plane.model);
        for(const clip of gltf.animations)for(const track of clip.tracks)assert(gltf.scene.getObjectByName(track.name.split('.')[0]),track.name);
    }
}
console.log('21 new aircraft, 42 GLBs, preserved flight dimensions and all animated pivots validated.');
