import { nativeFetch } from './image-runtime';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import * as T from 'three';
import { ModelLibrary } from '../../app/airrun/assets';
import { compatibleModelLOD, flightModelLOD } from '../../app/airrun/graphics';
import type { AssetMeta } from '../../app/airrun/types';

const root = process.env.AIRRUN_ASSET_ROOT ?? 'public';
const assets: AssetMeta[] = JSON.parse(fs.readFileSync(path.join(root, 'models/catalog.json'), 'utf8')).assets;
const original = assets.find(a => a.id === 'windmill')!;
let downloads = 0, failDownload = false;
globalThis.fetch = async (url: any) => {
    const address = String(url);
    if (/^(blob:|data:)/.test(address)) return nativeFetch(url);
    if (address.includes('.glb.gz')) {
        downloads++;
        if (failDownload) return new Response(null, { status: 503 });
    }
    try { return new Response(fs.readFileSync(path.join(root, address.split('?')[0]))); }
    catch { return new Response(null, { status: 404 }); }
};
const alias = () => {
    const meta = structuredClone(original);
    meta.exports.lod0 = meta.exports.lod1;
    meta.sourceLods = { lod0: 1, lod1: 1, lod2: 2, lod3: 3 };
    return meta;
};
const library = (meta = alias()) => { const value = new ModelLibrary(); value.byId.set(meta.id, meta); return value; };
const cases: { name: string; run: () => Promise<void> }[] = [];
const test = (name: string, run: () => Promise<void>) => cases.push({ name, run });
let checks = 0;
const check = (value: unknown, label: string) => { assert(value, label); checks++; };

test('concurrent aliases download and decode a model once', async () => {
    const lib = library(); downloads = 0;
    let parses = 0; const parse = lib.loader.parseAsync.bind(lib.loader);
    lib.loader.parseAsync = (...args) => { parses++; return parse(...args); };
    try {
        const [high, medium] = await Promise.all([lib.load(original.id, 0), lib.load(original.id, 1)]);
        check(downloads === 1, `expected one model download, received ${downloads}`);
        check(parses === 1 && high === medium && lib.cache.size === 1, 'aliases share one decoded GLTF and one cache entry');
        await lib.loadProxy(original.id);
        check(lib.ready(original.id, 0) && lib.peek(original.id, 0) === medium, 'a resident medium model satisfies the aliased highest level');
    } finally { lib.dispose(); }
});

test('both aliases keep live actors and animation buffers pinned', async () => {
    const lib = library(); downloads = 0;
    const first = await lib.instance(original.id, 0), second = await lib.instance(original.id, 1);
    try {
        const [planA, planB] = await Promise.all([lib.prepareAnimation(original.id, 0), lib.prepareAnimation(original.id, 1)]);
        check(downloads === 1 && planA === planB, 'aliases reuse model and animation preparation');
        first.model.position.x = 27;
        check(second.model.position.x !== first.model.position.x, 'actors retain independent transforms');
        const geometry = new Set<T.BufferGeometry>(); first.model.traverse(n => { if (n instanceof T.Mesh) geometry.add(n.geometry); });
        const disposed = new Map<T.BufferGeometry, number>();
        for (const g of geometry) g.addEventListener('dispose', () => disposed.set(g, (disposed.get(g) ?? 0) + 1));
        lib.trim(0); check(lib.cache.size === 1 && disposed.size === 0, 'cache pressure keeps both live actors intact');
        first.dispose(); first.dispose(); lib.trim(0);
        check(lib.cache.size === 1 && disposed.size === 0, 'disposing one alias twice preserves the other actor');
        second.dispose(); lib.trim(0);
        check(lib.cache.size === 0 && [...geometry].every(g => disposed.get(g) === 1), 'the final lease releases each shared geometry exactly once');
        await Promise.resolve();
        check([...lib.references.values()].every(n => n === 0) && planA.disposed, 'animation plans and all model leases are released');
    } finally { first.dispose(); second.dispose(); lib.dispose(); }
});

test('aliases share failure backoff and recover together', async () => {
    const lib = library(); downloads = 0; failDownload = true;
    try {
        const failures = await Promise.allSettled([lib.load(original.id, 0), lib.load(original.id, 1)]);
        check(failures.every(r => r.status === 'rejected') && downloads === 1, 'one failed physical request rejects both aliases');
        check(!lib.canRequest(original.id, 0) && !lib.canRequest(original.id, 1), 'both aliases observe the same retry delay');
        failDownload = false; lib.retry(original.id);
        const [a, b] = await Promise.all([lib.load(original.id, 1), lib.load(original.id, 0)]);
        check(a === b && downloads === 2, 'one retry restores both aliases');
    } finally { failDownload = false; lib.dispose(); }
});

test('different native files keep their full detail', async () => {
    const lib = library(structuredClone(original)); downloads = 0;
    try {
        const [high, medium] = await Promise.all([lib.load(original.id, 0), lib.load(original.id, 1)]);
        check(high !== medium && downloads === 2 && lib.cache.size === 2, 'distinct native LODs are never collapsed');
    } finally { lib.dispose(); }
});

test('flight detail resolves an alias without another promotion', async () => {
    const meta = alias();
    const placement = { model: meta.id, x: 0, y: 0, z: 60, sx: 1, sy: 1, sz: 1, yaw: 0, collision: true, role: 'landmark' as const };
    check(compatibleModelLOD(meta, 0) === 1, 'highest available file is the native medium file');
    check(flightModelLOD(meta, placement, { x: 0, y: 24, z: 0, speed: 80, span: 11 }, 'ultra') === 1, 'nearby scenery uses its resident file without swapping identical geometry');
    for (const supplied of assets.filter(a => a.exports.lod0 === a.exports.lod1)) {
        check(compatibleModelLOD(supplied, 0) === 1, supplied.id + ' deployed alias resolves to the resident native level');
        check(flightModelLOD(supplied, { ...placement, model: supplied.id }, { x: 0, y: 24, z: 0, speed: 80, span: 11 }, 'ultra') === 1, supplied.id + ' has no redundant near-detail promotion');
    }
});

test('models arriving in rain and at night match resident materials', async () => {
    const before = library(), after = library();
    const materials = (scene: T.Object3D) => {
        const values = new Set<T.MeshStandardMaterial>(); scene.traverse(n => { if (n instanceof T.Mesh) for (const m of Array.isArray(n.material) ? n.material : [n.material]) if (m instanceof T.MeshStandardMaterial) values.add(m); });
        return [...values].sort((a, b) => a.name.localeCompare(b.name));
    };
    try {
        const resident = await before.load(original.id, 1); before.environment(1, 1);
        after.environment(1, 1); const arriving = await after.load(original.id, 1);
        const expected = materials(resident.scene), actual = materials(arriving.scene);
        check(expected.length === actual.length && actual.length > 0, 'both loading orders retain every material');
        for (let i = 0; i < actual.length; i++) {
            check(Math.abs(actual[i].roughness - expected[i].roughness) < 1e-12, 'new scenery immediately receives current wetness');
            check(Math.abs(actual[i].emissiveIntensity - expected[i].emissiveIntensity) < 1e-12, 'new scenery immediately receives current night lighting');
        }
        const actor = await after.instance(original.id, 0, true);
        try { check(actor.materials.every(m => actual.some(a => a.name === m.name && a.roughness === m.roughness && a.emissiveIntensity === m.emissiveIntensity)), 'unique actor materials inherit the current environment'); }
        finally { actor.dispose(); }
        before.environment(0, 0); after.environment(0, 0);
        check(actual.every((m, i) => m.roughness === expected[i].roughness && m.emissiveIntensity === expected[i].emissiveIntensity), 'weather changes restore matching original material baselines');
    } finally { before.dispose(); after.dispose(); }
});

const failures: string[] = [];
for (const item of cases) {
    try { await item.run(); }
    catch (error) { failures.push(item.name + ': ' + (error instanceof Error ? error.message : String(error))); }
}
console.log(JSON.stringify({ modelResidencyChecks: checks, cases: cases.length, productionAliasModels: assets.filter(a => a.exports.lod0 === a.exports.lod1).length, failures, gpuVerified: false, status: failures.length ? 'failed' : 'passed' }));
assert.equal(failures.length, 0, failures.join('\n'));
