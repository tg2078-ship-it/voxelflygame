import assert from 'node:assert/strict';
import * as T from 'three';
import { catalog, createSim } from './fixtures';
import { themeCollection, curatedDistrictModels } from '../../app/airrun/model-collection';
import { flightDeckAssets, FlightStream } from '../../app/airrun/flight-stream';
import { scenicDistrict, encounterFamily } from '../../app/airrun/environment-palette';
import { PATTERNS, buildEncounter } from '../../app/airrun/patterns';
import { flightFraming } from '../../app/airrun/flight-framing';
import { routePosition } from '../../app/airrun/trick-path';
import { AIRSPACE } from '../../app/airrun/graphics';
import { isWatercraft } from '../../app/airrun/model-kind';
import { groundAt, WATER_LEVEL } from '../../app/airrun/world-ground';
import { AIRCRAFT, THEMES, themeAt } from '../../app/airrun/data';
import type { ModelLibrary } from '../../app/airrun/assets';
const cases = [], matrix = new T.Matrix4(), transform = new T.Object3D(); let checks = 0;
for (const { id: theme } of THEMES)
    for (const variant of theme === 'korea' ? [0, 1, 2, 3] : [0]) for (const seed of [13, 42]) for (const plane of ['skyhawk', 'transport']) {
        const sim = createSim({ seed, plane, practice: { theme, variant, plane, level: 1, night: false, weather: 'clear' } });
        const inventory = themeCollection(theme, catalog);
        const deck = [...new Map([...inventory, ...Array.from({ length: 12 }, (_, i) => curatedDistrictModels(theme, variant, i, catalog)).flat()].map(meta => [meta.id, meta])).values()];
        const seen = new Set<string>(), placed = new Set<string>();
        const framing = flightFraming(sim.plane.span, sim.plane.length), camera = new T.PerspectiveCamera(60, 16 / 9, .25, 2000), frustum = new T.Frustum();
        for (let second = 0; second < 180; second++) {
            // A deliberately slow traversal verifies that real thematic models
            // enter the chase-camera frustum even without a high-speed run.
            sim.time = second; sim.z = second * 28; sim.speed = 28; sim.generate();
            const pose = routePosition(sim.encounters.flatMap(e => e.route), sim.z, { ...(sim.encounters[0].entry ?? { x: 0, y: 24 }), z: sim.encounters[0].start });
            camera.position.set(pose.x, pose.y + framing.height, framing.distance); camera.lookAt(pose.x, pose.y - 1.2, -32); camera.updateMatrixWorld(true);
            matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(matrix);
            for (const encounter of sim.encounters) for (const p of encounter.placements) {
                if (!deck.some(meta => meta.id === p.model) || p.z > sim.z + 150 || p.z < sim.z + 20) continue;
                placed.add(p.model);
                const meta = catalog.get(p.model)!, bounds = meta.bounds;
                transform.position.set(p.x, p.y, sim.z - p.z); transform.rotation.set(0, p.yaw, 0); transform.scale.set(p.sx, p.sy, p.sz); transform.updateMatrix();
                const box = new T.Box3(new T.Vector3(...bounds.min), new T.Vector3(...bounds.max)).applyMatrix4(transform.matrix);
                if (frustum.intersectsBox(box)) seen.add(p.model);
                if (p.role === 'collection') { assert(Math.abs(p.x) <= AIRSPACE.halfWidth, 'collection remains in the reduced corridor'); checks++; }
                if (p.role === 'collection' && isWatercraft(p.model)) {
                    const physical = meta.motionBounds ?? meta.bounds;
                    for (const px of [physical.min[0], physical.max[0]]) for (const pz of [physical.min[2] - 7 / p.sz, physical.max[2] + 7 / p.sz]) {
                        const sample = new T.Vector3(px * p.sx, 0, pz * p.sz).applyAxisAngle(new T.Vector3(0, 1, 0), p.yaw);
                        assert(groundAt(p.x + sample.x, p.z + sample.z, theme, seed, variant) <= WATER_LEVEL + .15, 'the complete moving vessel footprint stays on water'); checks++;
                    }
                }
            }
            for (const encounter of sim.encounters) {
                assert(encounter.placements.filter(p => p.role === 'collection').length <= 4, 'a district has at most four discovery accents'); checks++;
                assert(!encounter.placements.some(p => p.role === 'collection' && /^(airport_|runway|taxiway|aeroway_)/.test(p.model)), 'airport exhibition pieces do not leak into the local district'); checks++;
            }
        }
        assert(seen.size >= Math.min(8, deck.length), `${theme}/${variant}/${seed}/${plane}: authored scenery must appear ahead of the actual chase camera, saw ${seen.size}`); checks++;
        assert(flightDeckAssets(theme, variant, catalog).every(id => catalog.has(id)), 'every compact resident asset resolves to a native export'); checks++;
        cases.push({ theme, variant, seed, plane, inventory: inventory.length, placed: placed.size, inCameraFrustum: seen.size });
    }

// Every authored family resolves, has only one focal landmark, and keeps the
// shoreline/channel split instead of repeating three lighthouses in two rows.
for (const pattern of PATTERNS) {
    const index = Number(pattern.id.split(':').at(-1)) - 1;
    const district = scenicDistrict(pattern.theme, pattern.variant, index);
    for (const id of [...district.buildings, ...district.working, ...district.accents,
        ...Object.values(encounterFamily(pattern.theme, pattern.variant, 2, catalog, index)).flat()]) {
        assert(catalog.has(id), `${pattern.id}: missing native model ${id}`); checks++;
    }
    const e = buildEncounter(pattern, 0, 42, { byId: catalog }, 11, 2);
    assert(e.placements.filter(p => p.model === 'lighthouse').length <= 1, 'a lighthouse is a single focal landmark'); checks++;
    if (pattern.theme === 'coast' || pattern.theme === 'korea' && pattern.variant === 3) {
        assert(e.placements.filter(p => p.role === 'district').every(p => p.x > 24), 'coastal architecture follows the landward quay'); checks++;
        assert(e.placements.filter(p => p.role === 'harbour traffic').every(p => p.x < -20 && p.y === WATER_LEVEL), 'harbour traffic has its own water channel'); checks++;
    }
    assert(curatedDistrictModels(pattern.theme, pattern.variant, index, catalog).length >= 3, 'the district retains a real native discovery vocabulary'); checks++;
}

// Removing whole-catalogue preloads must still pin every generated collision
// model and preserve the 45-second next-theme warm-up.
const prepared = createSim(), requested: string[] = [], held = new Set<string>(), cache = new Map();
const library = {
    byId: catalog, cache, cacheKey: (id: string, lod: number) => `${id}:${lod}`,
    retain: (key: string) => held.add(key), release: (key: string) => held.delete(key),
    ready: () => true, canRequest: () => true, canRequestProxy: () => true,
    load: async (id: string, lod: number) => { requested.push(id); cache.set(`${id}:${lod}`, {}); },
    loadProxy: async () => ({}),
} as unknown as ModelLibrary;
const stream = new FlightStream(library); stream.update(prepared, true);
for (const p of prepared.encounters.flatMap(e => e.placements)) { assert(stream.proxyIds.has(p.model), 'actual first-section model is pinned before flight'); checks++; }
assert(flightDeckAssets('coast', 0, catalog).length < themeCollection('coast', catalog).length * .5, 'coastal departure does not download the entire catalogue'); checks++;
await Promise.all(stream.pending.values());
prepared.time = 150; stream.update(prepared, true);
const next = themeAt(prepared.config.seed, 1);
assert(flightDeckAssets(next.theme.id, next.variant, catalog).every(id => stream.proxyIds.has(id)), 'the next theme is still prefetched 45 seconds ahead'); checks++;
await Promise.all(stream.pending.values()); stream.dispose();
assert(held.size === 0, 'curated streaming releases every retained model'); checks++;
const rewards = createSim(), deck = themeCollection('coast', catalog);
for (const meta of deck.slice(0, 8)) rewards.observeModel(meta.id);
assert(rewards.bonus === 600 && rewards.metrics.bonus === 600, 'eight new visible theme models grant a real survey score reward'); checks++;
for (const meta of deck.slice(0, 8)) rewards.observeModel(meta.id);
assert.equal(rewards.bonus, 600, 're-observing a model cannot farm the survey reward'); checks++;
assert(AIRCRAFT.every(plane => plane.span * .34 < AIRSPACE.softEdge), 'all source aircraft retain room to steer'); checks++;
console.log(JSON.stringify({ checks, cases, method: 'CPU generation, source bounds and chase-camera frustum; no GPU visibility or human enjoyment claim', gpuVerified: false, status: 'passed' }));
