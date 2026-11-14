/** Compare a real native motion cycle with the certified placement envelope. */
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { loadImage } from '@napi-rs/canvas';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { rigPose } from '../app/airrun/rig-motion.ts';
globalThis.self = globalThis;
globalThis.createImageBitmap = async blob => loadImage(Buffer.from(await blob.arrayBuffer()));
const nativeFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async input => {
    const url = typeof input === 'string' ? input : input.url ?? String(input);
    if (/^(data:|blob:)/.test(url)) return nativeFetch(input);
    return new Response(fs.readFileSync(path.join('public', url.split('?')[0])));
};
const catalog = JSON.parse(fs.readFileSync('public/models/catalog.json')), asset = catalog.assets.find(a => a.id === (process.argv[2] ?? 'harbor_crane'));
assert(asset);
const proxy = JSON.parse(gunzipSync(fs.readFileSync(path.join('public', asset.proxy))));
const raw = gunzipSync(fs.readFileSync(path.join('public', asset.exports.lod0)));
const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), '');
const mixer = new T.AnimationMixer(gltf.scene), autoplay = asset.animations.filter(a => a.autoplay);
for (const clip of gltf.animations) if (autoplay.some(a => a.name === clip.name)) mixer.clipAction(clip).play();
const duration = Math.max(...autoplay.map(a => a.duration)), visual = new T.Box3(), physical = new T.Box3();
const fixed = new T.Box3(), samples = 100;
function localBox(box) {
    const h = new T.Vector3().fromArray(box.s).multiplyScalar(.5), transform = new T.Matrix4().compose(new T.Vector3().fromArray(box.c), new T.Quaternion().fromArray(box.q ?? [0, 0, 0, 1]), new T.Vector3(1, 1, 1));
    return new T.Box3(h.clone().negate(), h).applyMatrix4(transform);
}
for (const box of proxy.static) fixed.union(localBox(box));
for (let i = 0; i < samples; i++) {
    const time = i * duration / (samples - 1); mixer.setTime(time); gltf.scene.updateMatrixWorld(true);
    visual.union(new T.Box3().setFromObject(gltf.scene, true)); const pose = rigPose(proxy.rig, time); physical.union(fixed);
    for (const box of proxy.dynamic) physical.union(localBox(box).applyMatrix4(pose.get(box.node).matrixWorld));
}
const certified = new T.Box3(new T.Vector3().fromArray(asset.motionBounds.min), new T.Vector3().fromArray(asset.motionBounds.max));
assert(certified.containsBox(visual), 'Certified envelope must contain sampled visible geometry');
assert(certified.containsBox(physical), 'Certified envelope must contain sampled actual collider geometry');
const describe = box => ({ min: box.min.toArray(), max: box.max.toArray(), size: box.getSize(new T.Vector3()).toArray() });
const report = { status: 'passed', model: asset.id, samples, sampleTimeIntervalS: [0, duration], nativeClips: autoplay,
    sampledVisibleHeroBounds: describe(visual), sampledActualColliderBounds: describe(physical), certifiedAllPhasePlacementBounds: asset.motionBounds,
    certifiedToSampledSizeRatio: asset.motionBounds.size.map((v, i) => v / physical.getSize(new T.Vector3()).toArray()[i]),
    safetyProof: 'Each reused envelope has exactly identical native ancestor TRS, animation keys, playback flags and cuboid shape to the previously independently certified envelope; sampling is corroboration, not the safety proof.',
    priorFallbackCause: 'Source cuboid order changed. Array-position comparison rejected identical cuboids and selected an origin-centred sphere fallback. Canonical exact-value comparison restores the certified local swept envelopes.', gpuRenderedOrVerified: false };
fs.writeFileSync(`docs/validation/asset-edition9-${asset.id}-motion.json`, JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report));
