/** Independent oracle: supplied collider GLBs through Three.js versus imported
 * runtime triangle data/CPU rig. Pass the extracted Edition12 directory. */
import '../tests/v2/image-runtime';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { rigPose } from '../app/airrun/rig-motion';
import type { ProxyData } from '../app/airrun/collision';
const source = path.resolve(process.argv[2]);
const catalog = JSON.parse(fs.readFileSync(path.join(source, 'catalog.json'), 'utf8'));
const loader = new GLTFLoader(), report: {id:string;vertices:number;maxError:number}[] = [];
let maximumError = 0, samples = 0, clips = 0;
for (const record of catalog.assets) {
    const bytes = fs.readFileSync(path.join(source, record.exports.collision));
    const native = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const proxy = JSON.parse(gunzipSync(fs.readFileSync(path.join('public/models/proxies', record.id + '.json.gz'))).toString()) as ProxyData;
    const mixer = new T.AnimationMixer(native.scene), autoplay = new Set(record.motion?.autoplay ?? []);
    native.animations.filter(c => autoplay.has(c.name)).forEach(c => mixer.clipAction(c).play());
    clips += native.animations.length;
    let count = 0, maximum = 0;
    for (const time of [0, .43, 2.1, 7.7]) {
        mixer.setTime(time); native.scene.updateMatrixWorld(true);
        const pose = rigPose(proxy.rig!, time);
        for (const surface of proxy.meshes!) {
            const object = native.scene.getObjectByName(surface.node)!;
            assert(object, record.id + '/' + surface.node + ' exists in supplied collider');
            const parts = object instanceof T.Mesh ? [object] : object.children.filter(n => n instanceof T.Mesh) as T.Mesh[];
            assert(parts.length, 'native collider primitive missing');
            const physical = pose.get(surface.node) as T.Mesh;
            let base = 0;
            for (const part of parts) {
                const position = part.geometry.getAttribute('position');
                for (let i = 0; i < position.count; i += Math.max(1, Math.floor(position.count / 33))) {
                    const nativePoint = part.getVertexPosition(i, new T.Vector3()).applyMatrix4(part.matrixWorld);
                    const at = (base + i) * 3, runtimePoint = new T.Vector3().fromArray(surface.positions, at);
                    surface.morphTargets?.forEach((target, k) => { const weight = physical.morphTargetInfluences?.[k] ?? surface.morphWeights?.[k] ?? 0; runtimePoint.addScaledVector(new T.Vector3().fromArray(target, at), weight); });
                    runtimePoint.applyMatrix4(physical.matrixWorld);
                    const error = nativePoint.distanceTo(runtimePoint); maximum = Math.max(maximum, error); samples++; count++;
                    assert(error < .0002, record.id + '/' + surface.node + ' supplied collider/runtime mismatch ' + error);
                }
                base += position.count;
            }
            assert(base * 3 === surface.positions.length, record.id + ' all supplied collider vertices retained');
        }
    }
    maximumError = Math.max(maximumError, maximum); report.push({ id: record.id, vertices: count, maxError: maximum });
    mixer.stopAllAction(); mixer.uncacheRoot(native.scene);
    native.scene.traverse(n => { if (n instanceof T.Mesh) { n.geometry.dispose(); (Array.isArray(n.material) ? n.material : [n.material]).forEach(m => m.dispose()); } });
}
const result = { models: report.length, sampledVertices: samples, nativeColliderClips: clips, maximumPositionErrorM: maximumError, method: 'Supplied original collider GLBs parsed and animated by Three.js; compare runtime CPU rig and triangle surfaces at four times', gpuVerified: false, status: 'passed', assets: report };
fs.writeFileSync('docs/validation/edition12-native-collision.json', JSON.stringify(result));
console.log(JSON.stringify({ ...result, assets: undefined }));
