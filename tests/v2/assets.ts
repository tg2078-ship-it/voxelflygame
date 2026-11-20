import { nativeFetch } from './image-runtime';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { gunzipSync } from 'node:zlib';
import { fitCompactScenery } from '../../app/airrun/compact-scenery';
import { catalog, suppliedAssets } from './fixtures';
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const assetRoot = process.env.AIRRUN_ASSET_ROOT ?? 'public';
globalThis.fetch = async (url: any) => {
    if (/^(blob:|data:)/.test(String(url))) return nativeFetch(url);
    try { return new Response(fs.readFileSync(path.join(assetRoot, String(url).split('?')[0]))); }
    catch { return new Response(null, { status: 404 }); }
};
let count = 0, clips = 0, bytes = 0, trafficPoses = 0;
for (const asset of catalog.values())
    for (const [lod, url] of Object.entries(asset.exports)) {
        const zip = fs.readFileSync(path.join(assetRoot, url)), raw = gunzipSync(zip);
        bytes += zip.length;
        const gltf = await loader.parseAsync(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), '');
        const textures = await gltf.parser.getDependencies('texture') as T.Texture[];
        assert(textures.every(texture => texture instanceof T.Texture && ((texture.image as { width?: number })?.width ?? 0) > 0), asset.id + ' all referenced images decode');
        assert.equal(gltf.animations.length, asset.animationsByLod?.[lod as 'lod0']?.length ?? asset.animations.length, asset.id + ' ' + lod + ' clips');
        if (asset.category !== 'aircraft' && Math.max(...asset.bounds.size)<=12) {
            const groups = fitCompactScenery(gltf.scene,asset.id,asset.category,Number(lod.slice(3)));
            assert(groups>0, asset.id+'/'+lod+' has native surface geometry with a matching parent');
        }
        count++;
        clips += gltf.animations.length;
        if (asset.category === 'traffic' && asset.moving) {
            gltf.scene.updateMatrixWorld(true);
            const positions: T.Matrix4[] = [];
            gltf.scene.traverse(n => {
                if (/^(wheel|wing)_/.test(n.name))
                    positions.push(n.matrixWorld.clone());
            });
            const mixer = new T.AnimationMixer(gltf.scene);
            for (const clip of gltf.animations)
                mixer.clipAction(clip).play();
            mixer.setTime(.13);
            gltf.scene.updateMatrixWorld(true);
            let i = 0, changed = 0;
            gltf.scene.traverse(n => {
                if (/^(wheel|wing)_/.test(n.name)) {
                    if (!n.matrixWorld.equals(positions[i++]))
                        changed++;
                }
            });
            assert(changed > 0, asset.id + ' exported motion changes pose');
            trafficPoses += changed;
            mixer.stopAllAction();
        }
        gltf.scene.traverse(n => {
            if (n instanceof T.Mesh) {
                n.geometry.dispose();
                for (const mat of Array.isArray(n.material) ? n.material : [n.material])
                    mat.dispose();
            }
        });
    }
// Every supplied model remains available; theme/collision checks govern actual placement.
// Do not require unrelated airport infrastructure to appear in every flight environment.
for (const asset of suppliedAssets) assert(catalog.has(asset.id) && asset.exports.lod1 && asset.exports.lod2, asset.id + ' available');
console.log(JSON.stringify({ suppliedModels: suppliedAssets.length, supplementaryModels: catalog.size - suppliedAssets.length, exports: count, animationClips: clips, trafficPoseChanges: trafficPoses, compressedBytes: bytes, status: 'passed' }));
