import { nativeFetch } from './image-runtime';
// Geometry/resource lifecycle only. No browser, GPU frames or device FPS measurement.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as T from 'three';
import { ModelLibrary } from '../../app/airrun/assets';
import { WorldView } from '../../app/airrun/world-view';
import { FlightFX } from '../../app/airrun/fx';
import { GRAPHICS } from '../../app/airrun/graphics';
import { createSim } from './fixtures';
globalThis.fetch = async (url: any) => { if (/^(blob:|data:)/.test(String(url))) return nativeFetch(url);
    try {
        const b = await fs.readFile(path.join('public', String(url).split('?')[0]));
        return new Response(b);
    }
    catch {
        return new Response(null, { status: 404 });
    }
};
const library = new ModelLibrary();
await library.init(() => { });
const sim = createSim({ seed: 44171, catalog: library.byId, proxies: library.proxies });
const scene = new T.Scene(), world = new WorldView(scene, library);
let maxChunks = 0, maxCached = 0, maxCompiled = 0, maxBatches = 0, maxAnimated = 0, checks = 0;
for (let i = 0; i <= 360; i++) {
    sim.time = i * 5;
    sim.motionTime = sim.time;
    sim.speed = 120;
    sim.z = i * 600;
    sim.generate();
    world.update(sim, 5, 'high');
    for (let j = 0; j < 2; j++) {
        await Promise.allSettled([...library.pending.values()]);
        world.update(sim, 0, 'high');
    }
    maxChunks = Math.max(maxChunks, world.chunks.size);
    maxCached = Math.max(maxCached, library.cache.size);
    maxCompiled = Math.max(maxCompiled, world.compiled.size);
    maxBatches = Math.max(maxBatches, world.batches.size);
    maxAnimated = Math.max(maxAnimated, world.animated.size);
    assert(world.chunks.size <= 13, 'fixed 120m/s chunk horizon');
    assert(world.animated.size <= GRAPHICS.high.animatedModels, 'animated instance budget');
    assert([...world.batches.values()].every(b => b.meshes.every(m => m.count <= m.instanceMatrix.count)), 'instancing capacity');
    assert(world.origin === Math.floor(sim.z / 1024) * 1024, 'floating origin');
    checks += 4;
}
world.dispose();
await Promise.allSettled([...library.pending.values()]);
await Promise.allSettled([...library.animationPending.values()]);
await Promise.resolve();
await Promise.resolve();
if ([...library.references.values()].some(n => n > 0))
    console.log({ references: [...library.references].filter(([, n]) => n > 0), pending: world.pending.size });
assert([...library.references.values()].every(n => n === 0), 'disposed world releases every model');
checks++;
library.trim(8);
assert(library.cache.size <= 8, 'unreferenced cache trims');
checks++;
library.dispose();
const lateLibrary = new ModelLibrary();
lateLibrary.byId = new Map(library.byId);
const lateLoad = lateLibrary.load('fishing_boat', 1);
lateLibrary.dispose();
await assert.rejects(lateLoad);
assert.equal(lateLibrary.cache.size, 0, 'late loads cannot repopulate a disposed library');
assert.equal(lateLibrary.allMaterials.size, 0, 'late materials are disposed');
checks += 3;
const fx = new FlightFX(scene), plane = new T.Group();
for (const theme of ['volcano', 'waterfall', 'ice', 'coast'] as const) {
    sim.theme = theme;
    sim.z = 150;
    sim.y = 24;
    for (let i = 0; i < 120; i++) {
        sim.motionTime = i / 60;
        fx.update(sim, 1 / 60, plane, [{ model: 'waterfall_cliff', x: 95, y: 0, z: 280, sx: 2, sy: 2, sz: 2, yaw: 0, collision: false, role: 'background' }]);
        assert([...fx.environment.spray.geometry.getAttribute('position').array].every(Number.isFinite));
        assert(fx.environment.spray.geometry.drawRange.count <= 384);
        assert(fx.particles.length <= 200 && fx.trailHistory.length <= 180);
        checks += 3;
    }
}
fx.dispose();
assert.equal(fx.root.parent, null, 'effects detach on disposal');
checks++;
console.log(JSON.stringify({ renderDataChecks: checks, simulatedMinutes: 30, maxChunks, maxCached, maxCompiled, maxBatches, maxAnimated, gpuVerified: false, status: 'passed' }));
