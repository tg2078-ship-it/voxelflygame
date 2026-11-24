import { nativeFetch } from './image-runtime';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import * as T from 'three';
import { ModelLibrary } from '../../app/airrun/assets';
import { updateModelPose, posedGeometry } from '../../app/airrun/model-pose';
import { packModelCompile, compileModelBuffers, unpackCompiled } from '../../app/airrun/model-compile-protocol';
import { isPaintVertex } from '../../app/airrun/livery-surface';
import { catalog, suppliedAssets, proxies } from './fixtures';
import { rigPose } from '../../app/airrun/rig-motion';
let checks = 0, skins = 0, morphs = 0, sampled = 0, maximumPoseError = 0;
const check = (value: unknown, message: string) => { assert(value, message); checks++; };
globalThis.fetch = async (url) => { if (/^(blob:|data:)/.test(String(url))) return nativeFetch(url); try { return new Response(fs.readFileSync(path.join('public', String(url).split('?')[0]))); } catch { return new Response(null, { status: 404 }); } };
const library = new ModelLibrary(); library.byId = new Map(catalog);
check(suppliedAssets.length === 403 && suppliedAssets.every(m => m.edition === 12 && m.exports.lod3), 'all supplied models have four Edition12 LODs');
check(suppliedAssets.filter(m => m.moving).length === 271 && suppliedAssets.reduce((n, m) => n + m.animations.length, 0) === 891, 'complete upgraded motion inventory');
for (const meta of suppliedAssets) {
    const source = await library.load(meta.id, 1), instance = await library.instance(meta.id, 1);
    const skinNodes: T.SkinnedMesh[] = [], morphNodes: T.Mesh[] = [];
    instance.model.traverse(n => { if ((n as T.SkinnedMesh).isSkinnedMesh) skinNodes.push(n as T.SkinnedMesh); if ((n as T.Mesh).morphTargetInfluences?.length) morphNodes.push(n as T.Mesh); });
    if (skinNodes.length) skins++;
    if (morphNodes.length) morphs++;
    check(instance.actions.size === meta.animationsByLod?.lod1?.length, meta.id + ' every LOD1 action is bound');
    if (skinNodes.length || morphNodes.length) {
        const reference = new T.AnimationMixer(source.scene);
        source.animations.filter(c => meta.animations.some(a => a.name === c.name && a.autoplay)).forEach(c => reference.clipAction(c).play());
        // Move the clone under a different world origin. Its skeleton must not
        // refer back to cached bones or another instance.
        const parent = new T.Group(); parent.position.set(53, 17, -142); parent.rotation.y = .67; parent.add(instance.root);
        for (const time of [0, .43, 2.1, 7.7]) {
            reference.setTime(time); instance.mixer.setTime(time); updateModelPose(source.scene); updateModelPose(parent);
            const inverse = instance.root.matrixWorld.clone().invert();
            for (const node of [...skinNodes, ...morphNodes.filter(n => !skinNodes.includes(n as T.SkinnedMesh))]) {
                const original = source.scene.getObjectByName(node.name) as T.Mesh;
                check(!!original, meta.id + ' original deforming mesh exists');
                const position = node.geometry.getAttribute('position'), frozen = posedGeometry(node);
                for (let i = 0; i < position.count; i += Math.max(1, Math.floor(position.count / 51))) {
                    const a = node.getVertexPosition(i, new T.Vector3()).applyMatrix4(node.matrixWorld).applyMatrix4(inverse);
                    const b = original.getVertexPosition(i, new T.Vector3()).applyMatrix4(original.matrixWorld);
                    maximumPoseError = Math.max(maximumPoseError, a.distanceTo(b));
                    check(a.distanceTo(b) < .0001, meta.id + ' clone skin/morph follows its own origin');
                    const rest = new T.Vector3().fromBufferAttribute(frozen.geometry.getAttribute('position'), i);
                    check(rest.distanceTo(node.getVertexPosition(i, new T.Vector3())) < .0001, meta.id + ' frozen instance retains skin/morph silhouette');
                    sampled++;
                }
                if (frozen.owned) frozen.geometry.dispose();
            }
        }
        reference.stopAllAction(); reference.uncacheRoot(source.scene);
        // Far batching must contain every primitive, including skinned bodies.
        const packed = packModelCompile(instance.model), sourceTriangles = (() => { let n = 0; instance.model.traverse(node => { if (node instanceof T.Mesh) n += (node.geometry.index?.count ?? node.geometry.getAttribute('position').count) / 3; }); return n; })();
        const reply = compileModelBuffers({ id: 1, parts: packed.parts });
        check(reply.geometries!.reduce((n, part) => n + (part.index?.length ?? part.attributes.position.count) / 3, 0) === sourceTriangles, meta.id + ' no far geometry disappears');
        for (const buffer of reply.geometries!) { const g = unpackCompiled(buffer); check(Number.isFinite(g.boundingSphere!.radius) && g.boundingSphere!.radius > 0, meta.id + ' frozen bounds valid'); g.dispose(); }
    }
    instance.dispose(); library.trim(0);
}
check(skins === 26 && morphs === 115, 'every skin and morph model was exercised');
check(library.atlasLoads.size === 4 && library.textures.pinned.size === 4, 'four atlas images decoded once across all 403 models');
for (const meta of suppliedAssets) for (const box of Object.values(meta.lodBounds ?? {})) check(box.size.every((v, i) => Math.abs(v - (box.max[i] - box.min[i])) < 1e-12), 'metadata extents stay consistent after rounded authoring bounds');
const first = [...library.textures.pinned];
await library.load('cessna_skyhawk', 0); library.trim(0); await library.load('windmill', 3);
check(first.every(texture => library.textures.pinned.has(texture)), 'trimming and reloading keeps the atlas alive');
const aircraft = await library.instance('cessna_skyhawk', 1, true); let paint = 0, protectedVertices = 0;
aircraft.model.traverse(node => { if (!(node instanceof T.Mesh)) return; for (let i = 0; i < node.geometry.getAttribute('position').count; i++) { if (isPaintVertex(node, i)) paint++; else protectedVertices++; } });
check(paint > 1000 && protectedVertices > 1000, 'livery targets paint and protects glass/metal/rubber/lamps'); aircraft.dispose();
const banner = proxies.get('vista_banner_plane')!, mesh = banner.meshes!.find(m => m.morphTargets?.length)!;
check(!!mesh && mesh.animated && !!mesh.envelope, 'animated banner keeps its nonrigid collider');
const poses = [.13, 1.1].map(t => [...((rigPose(banner.rig!, t).get(mesh.node) as T.Mesh).morphTargetInfluences ?? [])]);
check(JSON.stringify(poses[0]) !== JSON.stringify(poses[1]), 'collision samples native morph weights');
const pinned = await library.instance('cessna_skyhawk', 0);
await library.loadProxy('windmill'); check(library.ready('windmill'), 'the available far LOD and its collider are ready');
library.geometryBudget = 1; library.trim(1000); check(library.cache.size === 1 && library.cache.has('cessna_skyhawk:0'), 'byte pressure evicts unused geometry while the current instance survives');
pinned.dispose(); library.trim(1000); check(library.cache.size === 0, 'released geometry obeys the byte budget');
library.dispose(); check(library.textures.entries.size === 0 && library.textures.pinned.size === 0 && library.atlasLoads.size === 0, 'all shared atlas resources released');
console.log(JSON.stringify({ edition12Checks: checks, skinModels: skins, morphModels: morphs, sampledVertices: sampled, maximumPoseError, gpuVerified: false, status: 'passed' }));
