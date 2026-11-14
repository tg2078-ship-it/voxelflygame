import assert from 'node:assert/strict';
import * as T from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { ActorBatching } from '../../app/airrun/actor-batching';
import { AssetRequestError, ModelLibrary } from '../../app/airrun/assets';
import { compileModelBuffers, packModelCompile, packModelCompileAsync } from '../../app/airrun/model-compile-protocol';
import { WorldView } from '../../app/airrun/world-view';
import type { AssetMeta } from '../../app/airrun/types';

const nativeFetch = globalThis.fetch;
let checks = 0;
const check = (condition: unknown, label: string) => { assert(condition, label); checks++; };
const meta = { id: 'test', exports: { lod0: '/test.glb', lod1: '/test.glb', lod2: '/test-low.glb' }, animations: [], proxy: '/test-proxy.json' } as unknown as AssetMeta;
const gltf = (scene = new T.Group()) => ({ scene, animations: [], parser: { associations: new Map() } }) as unknown as GLTF;
function library() {
    const lib = new ModelLibrary(); lib.byId.set(meta.id, meta);
    lib.loader.parseAsync = async () => gltf();
    return lib;
}

try {
    const lib = library(); let requests = 0;
    globalThis.fetch = async () => { requests++; return new Response(null, { status: 404 }); };
    await assert.rejects(lib.load('test', 0), /HTTP 404/); checks++;
    check(!lib.canRequest('test', 0) && !lib.canRequest('test', 1), 'a missing physical file stops automatic retries for both LOD aliases');
    await assert.rejects(lib.load('test', 1), /HTTP 404/); checks++;
    check(requests === 1, 'retrying an unavailable alias does not issue more network traffic');
    lib.retry('test');
    globalThis.fetch = async () => { requests++; return new Response(new Uint8Array([1, 2, 3])); };
    await lib.load('test', 1);
    check(lib.ready('test', 0) === false && lib.cache.size === 1 && !lib.failed.has('test'), 'explicit retry restores the visual file while collision readiness remains separate');
    lib.dispose();

    const temporary = library(); requests = 0;
    globalThis.fetch = async () => { requests++; return new Response(null, { status: 503 }); };
    for (let attempt = 1; attempt <= 3; attempt++) {
        await assert.rejects(temporary.load('test', 0), /HTTP 503/); checks++;
        const failure = temporary.failures.get(temporary.cacheKey('test', 0))!;
        check(failure.attempts === attempt, 'transient model failures retain a shared attempt count');
        if (attempt < 3) { check(Number.isFinite(failure.retryAt), 'temporary failure has a bounded delay'); failure.retryAt = 0; }
        else check(failure.retryAt === Infinity && !temporary.canRequest('test', 0), 'three failed attempts stop background request churn until explicit retry');
    }
    check(requests === 3, 'the physical request count is bounded');
    temporary.dispose();

    const proxy = library(); requests = 0;
    globalThis.fetch = async () => { requests++; return new Response(null, { status: 403 }); };
    await assert.rejects(proxy.loadProxy('test'), /HTTP 403/); checks++;
    check(!proxy.canRequestProxy('test'), 'forbidden collision data is not retried every stream update');
    proxy.retry('test');
    globalThis.fetch = async () => new Response(JSON.stringify({ id: 'test', static: [], dynamic: [] }));
    await proxy.loadProxy('test');
    check(proxy.proxies.has('test') && proxy.canRequestProxy('test'), 'explicit retry recovers collision data');
    proxy.dispose();

    const html = library();
    globalThis.fetch = async () => new Response('  <!doctype html><title>Login required</title>', { headers: { 'Content-Type': 'text/html' } });
    await assert.rejects(html.download('/test.glb', 'test'), error => error instanceof AssetRequestError && !error.retryable && /HTML page/.test(error.message)); checks++;
    globalThis.fetch = async () => new Response(new Uint8Array());
    await assert.rejects(html.download('/test.glb', 'test'), /Empty model response/); checks++;
    html.dispose();
} finally { globalThis.fetch = nativeFetch; }

// Hoisting instanced leaves to the actor root must not resurrect hidden bases.
const root = new T.Group(), shown = new T.Group(), hidden = new T.Group(), preview = new T.Group();
root.add(shown, hidden, preview); hidden.visible = false; preview.userData.previewOnly = true;
const box = new T.BoxGeometry(), material = new T.MeshStandardMaterial();
box.clearGroups();
for (const group of [shown, hidden, preview]) for (let i = 0; i < 2; i++) { const mesh = new T.Mesh(box, material); mesh.position.x = i; group.add(mesh); }
const batch = new ActorBatching(root);
check(batch.batches.length === 1 && batch.batches[0].sources.length === 2, 'only leaves of the visible non-preview branch are instanced');
shown.visible = false; batch.sync();
const matrix = new T.Matrix4(); batch.batches[0].mesh.getMatrixAt(0, matrix);
check(matrix.elements[12] > 1e8, 'hiding an animated parent hides its hoisted instances');
shown.visible = true; batch.sync(); batch.batches[0].mesh.getMatrixAt(0, matrix);
check(Math.abs(matrix.elements[12]) < 1e-6, 'showing the parent restores its existing instances');
batch.dispose(); box.dispose(); material.dispose();

// Four disjoint groups reuse two materials. Only the middle two triangles lie
// in the source draw range, including the second occurrence of material zero.
for (const indexed of [true, false]) {
    const scene = new T.Group(), geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(Array.from({ length: 36 }, (_, i) => i % 3 === 1 ? (i % 7) : i / 10), 3));
    if (indexed) geometry.setIndex(Array.from({ length: 12 }, (_, i) => i));
    for (let i = 0; i < 4; i++) geometry.addGroup(i * 3, 3, i % 2);
    geometry.setDrawRange(3, 6);
    const materials = [new T.MeshStandardMaterial(), new T.MeshStandardMaterial()];
    scene.add(new T.Mesh(geometry, materials));
    const library = new ModelLibrary(); library.byId.set('test', meta); library.cache.set(library.cacheKey('test', 1), gltf(scene));
    const world = new WorldView(new T.Scene(), library); world.compiler.enabled = false;
    const fallback = world.compile('test', 1)!;
    for (const packed of [packModelCompile(scene), await packModelCompileAsync(scene)]) {
        const result = compileModelBuffers({ id: 1, parts: packed.parts }).geometries!;
        check(result.length === 2 && result.every(part => part.index?.length === 3), 'each selected material keeps exactly its visible triangle');
        check(result.reduce((sum, part) => sum + (part.index?.length ?? 0), 0) === 6, 'disjoint groups and source draw range preserve the exact topology');
        for (const part of result) {
            const expected = fallback.find(value => value.material === packed.materials[part.material])!.geometry;
            check(expected.index?.count === part.index?.length && Array.from(expected.index!.array).join() === Array.from(part.index!).join(), 'worker and fallback retain matching indexed and unindexed faces');
        }
    }
    world.dispose(); library.dispose();
}
console.log(JSON.stringify({ assetReliabilityChecks: checks, gpuVerified: false, status: 'passed' }));
