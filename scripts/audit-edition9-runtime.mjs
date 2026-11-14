/** CPU-only import, image and native visual/physics pose audit. No GPU claims. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
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
    try { return new Response(fs.readFileSync(path.join('public', url.split('?')[0]))); }
    catch { return new Response(null, { status: 404 }); }
};
const hash = value => createHash('sha256').update(value).digest('hex');
const catalog = JSON.parse(fs.readFileSync('public/models/catalog.json', 'utf8'));
const sourceDirectory = process.argv[2];
const source = JSON.parse(fs.readFileSync(path.join(sourceDirectory, 'source-catalog.json')));
const encoded = JSON.parse(fs.readFileSync(path.join(sourceDirectory, 'encoding.json')));
const expected = new Map(encoded.map(row => [row.id + '/' + row.lod, row]));
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const report = { status: 'passed', models: 0, visualExports: 0, nativeAnimationModels: 0, nativeClips: 0,
    poseComparisons: 0, maximumMatrixError: 0, sourceImagesVerified: 0, sharedImagesDecoded: 0,
    previewsDecoded: 0, maximumBoundsErrorM: 0, envelopeCornersVerified: 0,
    maximumEnvelopeSampleOutsideM: 0, gpuRenderedOrVerified: false };
function checkEnvelope(points, matrix, envelope, name) {
    const m = matrix.elements, c = envelope.c, s = envelope.s;
    for (let i = 0; i < points.length; i += 3) {
        const x = points[i], y = points[i + 1], z = points[i + 2];
        const out = [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
        const error = Math.max(0, ...out.map((v, k) => Math.abs(v - c[k]) - s[k] * .5));
        report.maximumEnvelopeSampleOutsideM = Math.max(report.maximumEnvelopeSampleOutsideM, error);
        assert(error < 2e-6, name + ' envelope excludes real native pose by ' + error); report.envelopeCornersVerified++;
    }
}

for (const file of fs.readdirSync('public/models/textures')) {
    const bytes = fs.readFileSync(path.join('public/models/textures', file));
    assert.equal(hash(bytes), path.parse(file).name, 'Shared image content address');
    const image = await loadImage(bytes); assert(image.width > 0 && image.height > 0); report.sharedImagesDecoded++;
}
for (const asset of catalog.assets) {
    const sourceAsset = source.assets.find(a => a.id === asset.id); assert(sourceAsset);
    const preview = await loadImage(fs.readFileSync(path.join('public', asset.preview)));
    assert(preview.width > 0 && preview.height > 0); report.previewsDecoded++;
    const proxy = JSON.parse(gunzipSync(fs.readFileSync(path.join('public', asset.proxy))));
    for (const lod of ['lod0', 'lod1', 'lod2']) {
        const transport = fs.readFileSync(path.join('public', asset.exports[lod]));
        const entry = expected.get(asset.id + '/' + lod); assert.equal(hash(transport), entry.runtimeSha256, 'Transport verified encoder output');
        const raw = gunzipSync(transport), originalRaw = fs.readFileSync(path.join(sourceDirectory, 'source', sourceAsset.exports[lod]));
        assert.equal(hash(originalRaw), entry.sourceSha256, 'Exact archived source');
        const sourceJsonLength = originalRaw.readUInt32LE(12), sourceDoc = JSON.parse(originalRaw.subarray(20, 20 + sourceJsonLength)), sourceBinary = originalRaw.subarray(28 + sourceJsonLength);
        for (const sourceImage of sourceDoc.images ?? []) {
            const view = sourceDoc.bufferViews[sourceImage.bufferView], bytes = sourceBinary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
            assert(fs.existsSync(`public/models/textures/${hash(bytes)}${sourceImage.mimeType === 'image/png' ? '.png' : '.jpg'}`)); report.sourceImagesVerified++;
        }
        const gltf = await loader.parseAsync(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), '');
        const textures = await gltf.parser.getDependencies('texture');
        assert(textures.every(texture => texture.image?.width > 0), asset.id + ' textures');
        assert.equal(gltf.animations.length, asset.animations.length, asset.id + ' native clips');
        gltf.scene.updateMatrixWorld(true);
        const bounds = new T.Box3().setFromObject(gltf.scene, true), expectedBounds = asset.lodBounds[lod];
        const boundError = Math.max(...bounds.min.toArray().map((v, i) => Math.abs(v - expectedBounds.min[i])), ...bounds.max.toArray().map((v, i) => Math.abs(v - expectedBounds.max[i])));
        report.maximumBoundsErrorM = Math.max(report.maximumBoundsErrorM, boundError);
        assert(boundError < .0001, asset.id + '/' + lod + ' actual native bounds: ' + boundError);
        if (lod === 'lod1' && asset.moving) {
            const mixer = new T.AnimationMixer(gltf.scene);
            for (const clip of gltf.animations) if (asset.animations.find(a => a.name === clip.name)?.autoplay) mixer.clipAction(clip).play();
            // GLTFLoader sanitizes punctuation in Object3D names (for example
            // snowcat wheel names containing a decimal point). Match by the
            // original JSON node index, never by a sanitized display name.
            const runtimeJson = JSON.parse(raw.subarray(20, 20 + raw.readUInt32LE(12)));
            const named = new Map(await Promise.all(runtimeJson.nodes.map(async (node, index) => [node.name, await gltf.parser.getDependency('node', index)])));
            const targetNames = new Set(proxy.rig.clips.flatMap(clip => clip.channels.map(channel => proxy.rig.nodes[channel.node].name)));
            const envelopeParts = proxy.dynamic.map(box => {
                const points = [], transform = new T.Matrix4().compose(new T.Vector3().fromArray(box.c), new T.Quaternion().fromArray(box.q ?? [0, 0, 0, 1]), new T.Vector3(1, 1, 1));
                for (const x of [-.5, .5]) for (const y of [-.5, .5]) for (const z of [-.5, .5]) points.push(...new T.Vector3(box.s[0] * x, box.s[1] * y, box.s[2] * z).applyMatrix4(transform).toArray());
                return { node: box.node, points, envelope: box.envelope };
            });
            for (const mesh of proxy.meshes ?? []) if (mesh.animated) envelopeParts.push({ node: mesh.node, points: mesh.positions, envelope: mesh.envelope });
            for (const part of envelopeParts) targetNames.add(part.node);
            for (const sample of [0, .137, .729, 2.318, 7.413, 17.823]) {
                mixer.setTime(sample); gltf.scene.updateMatrixWorld(true); const physical = rigPose(proxy.rig, sample);
                for (const name of targetNames) {
                    const visual = named.get(name), collider = physical.get(name); assert(visual && collider, asset.id + '/' + name);
                    const error = Math.max(...visual.matrixWorld.elements.map((v, i) => Math.abs(v - collider.matrixWorld.elements[i])));
                    report.maximumMatrixError = Math.max(report.maximumMatrixError, error); report.poseComparisons++;
                    assert(error < 1e-6, asset.id + '/' + name + ' native physics pose: ' + error);
                }
                for (const part of envelopeParts) { assert(part.envelope); checkEnvelope(part.points, named.get(part.node).matrixWorld, part.envelope, asset.id + '/' + part.node); }
            }
            mixer.stopAllAction(); mixer.uncacheRoot(gltf.scene);
            report.nativeAnimationModels++; report.nativeClips += gltf.animations.length;
        }
        const disposed = new Set();
        gltf.scene.traverse(node => {
            if (!node.isMesh) return; node.geometry.dispose();
            for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
                for (const value of Object.values(material)) if (value instanceof T.Texture && !disposed.has(value)) { value.dispose(); disposed.add(value); }
                material.dispose();
            }
        });
        report.visualExports++;
    }
    report.models++;
    if (report.models % 25 === 0) console.log(`Imported ${report.models}/${catalog.assets.length}, poses ${report.poseComparisons}`);
}
assert.equal(report.models, 403); assert.equal(report.visualExports, 1209); assert.equal(report.nativeAnimationModels, 203);
fs.writeFileSync('docs/validation/asset-edition9-runtime.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
