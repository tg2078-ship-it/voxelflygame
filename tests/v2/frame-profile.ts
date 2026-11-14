import { nativeFetch } from './image-runtime';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import * as T from 'three';
import { ModelLibrary } from '../../app/airrun/assets';
import { WorldView } from '../../app/airrun/world-view';
import { catalog, proxies, createSim } from './fixtures';
import { TerrainWorkerAdapter } from './terrain-worker-adapter';
import { ModelWorkerAdapter } from './model-worker-adapter';
globalThis.fetch = async (url: any) => {
    if (/^(blob:|data:)/.test(String(url))) return nativeFetch(url);
    try { return new Response(await fs.readFile(path.join('public', String(url).split('?')[0]))); }
    catch { return new Response(null, { status: 404 }); }
};
const results = [];
for (const theme of ['coast', 'city', 'forest'] as const) {
    const library = new ModelLibrary(); library.byId = catalog; library.proxies = new Map(proxies);
    const sim = createSim({ seed: 44171, catalog, proxies: library.proxies, practice: { theme, variant: 0, plane: 'skyhawk', level: 1, night: false, weather: 'clear' } });
    sim.theme = theme; sim.time = sim.motionTime = sim.z = 0; sim.speed = 80;
    sim.encounters = []; sim.obstacles = []; sim.pickups = []; sim.nextStart = sim.serial = 0; sim.modelCycle.clear(); sim.generate();
    const world = new WorldView(new T.Scene(), library);
    world.terrain.factory = () => new TerrainWorkerAdapter() as unknown as Worker;
    world.compiler.factory = () => new ModelWorkerAdapter() as unknown as Worker; world.compiler.enabled = true;
    for (let pass = 0; pass < 6; pass++) { world.dirty = true; world.update(sim, 0, 'high'); await Promise.allSettled([...library.pending.values()]); await new Promise(resolve => setTimeout(resolve, 0)); }
    await world.prepare(sim, 'high');
    const operations: Record<string, {calls:number,totalMs:number,maxMs:number}> = {};
    for (const method of ['makeChunk','compile','rebuild'] as const) { const original = world[method].bind(world); (world as any)[method] = (...args:any[]) => { const start=performance.now(); const result=(original as any)(...args); const elapsed=performance.now()-start; const record=operations[method]??={calls:0,totalMs:0,maxMs:0}; record.calls++;record.totalMs+=elapsed;if(elapsed>record.maxMs) (record as any).maxArgs=args.slice(0,3).map(arg=>typeof arg==='object'?'simulation':arg);record.maxMs=Math.max(record.maxMs,elapsed); return result; }; }
    const times = [];
    for (let frame = 0; frame < 360; frame++) {
        sim.time = sim.motionTime = frame / 60; sim.z = frame * sim.speed / 60;
        const start = performance.now(); world.update(sim, 1 / 60, 'high'); times.push(performance.now() - start);
        if (frame % 60 === 0) await Promise.allSettled([...library.pending.values()]);
    }
    await world.prepare(sim, 'high');
    assert.equal(world.compilePending.size,0,'flight preparation settles compiled geometry');
    assert.equal(world.terrainPending.size,0,'flight preparation settles terrain tiles');
    world.root.updateMatrixWorld(true);
    let nodes = 0, draws = 0, triangles = 0; const geometry = new Set<T.BufferGeometry>();
    world.root.traverseVisible(node => { nodes++; if (!(node instanceof T.Mesh)) return;
        const count = node instanceof T.InstancedMesh ? node.count : 1; if (!count) return;
        draws += Math.max(1, node.geometry.groups.length); triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3 * count; geometry.add(node.geometry);
    });
    let bytes = 0; for (const g of geometry) { for (const a of Object.values(g.attributes)) bytes += a.array.byteLength; bytes += g.index?.array.byteLength ?? 0; }
    times.sort((a,b) => a-b);
    results.push({ theme, nodes, potentialMainPassDraws: draws, triangles, geometryMiB: +(bytes / 1048576).toFixed(2), workerFallbacks:[...world.compileFallback], operations, actors: world.animated.size, compiled: world.compiled.size, cachedModels: library.cache.size, cpuMedianMs: times[180], cpuP95Ms: times[342], cpuMaxMs: times[359] });
    world.dispose(); await Promise.allSettled([...library.pending.values(), ...library.animationPending.values(), ...world.compilePending.values()]); await Promise.resolve(); assert([...library.references.values()].every(n=>n===0),'worker/native/static world leases release on disposal'); library.dispose();
}
console.log(JSON.stringify({ results, gpuVerified: false, fpsMeasured: false, terrainTransport: 'Node worker; browser transport unverified', note: 'CPU scene inventory; no frustum, shadows or postprocess draw measurement' }, null, 2));
