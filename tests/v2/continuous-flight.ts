import { nativeFetch } from './image-runtime';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as T from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { catalog, proxies, createSim } from './fixtures';
import { ModelLibrary } from '../../app/airrun/assets';
import { FlightStream, flightDeckAssets } from '../../app/airrun/flight-stream';
import { WorldView } from '../../app/airrun/world-view';
import { AirrunRenderer } from '../../app/airrun/renderer';
import { AIRSPACE, compatibleModelLOD, residentModelLOD } from '../../app/airrun/graphics';
import { freshSave } from '../../app/airrun/data';
import { useAirrun, input } from '../../app/airrun/state';
import type { Placement, Obstacle, ThemeId } from '../../app/airrun/types';
let checks = 0;
const check = (value: unknown, label: string) => { assert(value, label); checks++; };
const fakeGLTF = () => ({ scene: new T.Group(), animations: [] } as unknown as GLTF);
const library = new ModelLibrary(); library.byId = catalog; library.proxies = new Map(proxies);
library.download = async () => new Uint8Array([0]); library.loader.parseAsync = async () => fakeGLTF();
const sim = createSim(), stream = new FlightStream(library);
await stream.prepare(sim);
for (const theme of ['coast', 'village', 'city', 'ice', 'desert', 'forest', 'farm', 'korea'] as ThemeId[])
    check(flightDeckAssets(theme, 0, catalog).every(id => catalog.has(id)), 'theme residency uses valid source IDs');
check(flightDeckAssets('coast', 0, catalog).every(id => library.ready(id)), 'whole first-theme base deck is ready before departure');
library.trim(0);
check([...stream.retained].every(key => library.cache.has(key)), 'cache pressure cannot evict the current theme baseline');
sim.time = 136; sim.encounters = []; stream.update(sim); await Promise.all(stream.pending.values());
check(flightDeckAssets('village', 0, catalog).every(id => library.ready(id)), 'next theme becomes resident 44 seconds before transition');
sim.time = 181; stream.update(sim); await Promise.all(stream.pending.values());
check([...stream.retained].every(key => !key.startsWith('rocky_arch:')), 'previous theme leases are released after transition');
const residentVillage = flightDeckAssets('village', 0, catalog).find(id => residentModelLOD(catalog.get(id)!, sim.config.settings.quality) !== 0)!;
check(!!residentVillage && library.availableLOD(residentVillage, 0) === residentModelLOD(catalog.get(residentVillage)!, sim.config.settings.quality), 'missing hero LOD resolves immediately to the actual curated resident model LOD');
stream.dispose(); check([...library.references.values()].every(n => n === 0), 'stream disposal releases every residency lease'); library.dispose();

// A busy cosmetic queue must not starve the required base deck.
const priority = new ModelLibrary(); priority.byId = catalog; priority.loader.parseAsync = async () => fakeGLTF();
const ids = [...catalog.keys()].slice(0, 6), started: string[] = [], gates: (() => void)[] = [];
priority.download = async (_path, id) => { started.push(id); if (started.length <= 4) await new Promise<void>(resolve => gates.push(resolve)); return new Uint8Array([0]); };
const requests = ids.slice(0, 5).map(id => priority.load(id, 2, 2)); requests.push(priority.load(ids[5], 2, 0));
gates.forEach(resolve => resolve()); await Promise.all(requests);
check(started[3] === ids[5] && started.indexOf(ids[5]) < started.indexOf(ids[3]) && started.indexOf(ids[5]) < started.indexOf(ids[4]), 'required geometry overtakes queued decorative requests'); priority.dispose();

// Exercise the real frame control flow without a GPU. LOD0 never arrives, and
// every obstacle starts without rendered geometry. The old frame() re-entered
// preflight and stopped here even though this was an ordinary running flight.
Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable:true, writable:true, value: () => 1 });
Object.defineProperty(globalThis, 'matchMedia', { configurable:true, writable:true, value: () => ({ matches: false }) });
const frameLibrary = new ModelLibrary(); frameLibrary.byId = catalog;
const flight = createSim({ isObstacleVisible: () => false }); flight.lastCheckpoint = Infinity;
const save = freshSave(); save.settings.targetFPS = 30;
useAirrun.setState({ phase: 'flying', save, eRequest: 0, resumeCountdown: 0 });
let departureReloads = 0;
const renderer = Object.assign(Object.create(AirrunRenderer.prototype), {
    initialized: true, disposed: false, hyperPreparing: false, library: frameLibrary, sim: flight,
    lastPhase: 'flying', lastERequest: 0, lastHUD: Infinity, accumulator: 0, presentationElapsed: 0,
    held: new Set(), completeLoading() {}, applyQuality() {}, prepareFlight() { departureReloads++; },
});
let maxX = 0, maxY = 0;
for (let frame = 1; frame <= 12000; frame++) {
    input.x = Math.sin(frame / 200) > 0 ? 1 : -1; input.y = Math.sin(frame / 320) > 0 ? .7 : -.25;
    if (flight.y < 12) input.y = .7;
    input.boost = frame % 900 < 300; input.brake = false;
    const ms = (frame * 3 + 1) * 33.333 + 20; renderer.lastFrame = ms - 16;
    renderer.frame(ms); maxX = Math.max(maxX, Math.abs(flight.x)); maxY = Math.max(maxY, flight.y);
    check(useAirrun.getState().phase === 'flying', 'missing LOD0 never changes flying to preflight');
}
check(departureReloads === 0 && flight.time > 190 && flight.z > 7000, 'over three minutes of real physics keep advancing without departure reloads');
check(maxX <= AIRSPACE.halfWidth && maxY <= AIRSPACE.ceiling, 'keyboard movement obeys the reduced corridor'); frameLibrary.dispose();

// Real source GLBs: keep hero download unresolved and prove that its coarse
// native geometry is actually committed to the CPU scene in the meantime.
globalThis.fetch = async (url) => { if (/^(blob:|data:)/.test(String(url))) return nativeFetch(url); try { return new Response(await fs.readFile(path.join('public', String(url).split('?')[0]))); } catch { return new Response(null, { status: 404 }); } };
const real = new ModelLibrary(); real.byId = catalog; real.proxies = new Map(proxies);
const actual = createSim(); actual.z = 100; actual.speed = 40;
const p: Placement = { model: 'rocky_arch', x: 0, y: 0, z: 180, sx: 1, sy: 1, sz: 1, yaw: 0, collision: true, course: true, role: 'arch' };
actual.encounters = [{ ...actual.encounters[0], placements: [p] }];
const load = real.load.bind(real); let releaseHero!: (value: GLTF) => void;
const heldHero = new Promise<GLTF>(resolve => releaseHero = resolve);
real.load = (id, lod = 2, urgency = 1) => id === p.model && lod === 0 ? heldHero : load(id, lod, urgency);
const world = new WorldView(new T.Scene(), real);
await world.stream.prepare(actual); await world.prepare(actual, 'high');
const obstacle: Obstacle = { id: 1, model: p.model, home: p, position: p, scale: { x: 1, y: 1, z: 1 }, yaw: 0, size: { x: 1, y: 1, z: 1 }, hit: false, scored: false, small: false, role: p.role };
check(!real.cache.has(p.model + ':0') && world.presented.has(world.placementKey(p)), 'real resident geometry stays visible while hero request is unresolved');
check(world.canCollide(obstacle), 'visible prepared geometry arms its matching collider');
world.presented.clear(); check(!world.canCollide(obstacle), 'unrendered obstacles never have active invisible colliders');
world.preparingScene = false; world.collisionApproach.delete(world.placementKey(p)); actual.z = 170; world.syncPresented(actual);
check(!world.canCollide(obstacle), 'a late model appearing ten metres ahead cannot suddenly arm a collider');
releaseHero(real.cache.get(p.model + ':' + residentModelLOD(catalog.get(p.model)!, 'high'))!);
world.dispose(); await new Promise(resolve => setTimeout(resolve, 0)); real.dispose();
console.log(JSON.stringify({ checks, continuousPhysicsSeconds: flight.time, distance: flight.z, departureReloads, maxX, maxY, actualGLBFallback: true, gpuVerified: false, status: 'passed' }));
