import { nativeFetch } from './image-runtime';
// Physical layout, render-coordinate and presentation-state regressions. No GPU frames.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as T from 'three';
import { catalog, proxies, createSim, controls } from './fixtures';
import { PATTERNS, buildEncounter } from '../../app/airrun/patterns';
import { groundAt, terrainElevation, renderedTerrainHeight, WATER_LEVEL, deckSurfaceY } from '../../app/airrun/world-ground';
import { GRAPHICS } from '../../app/airrun/graphics';
import { terrainGeometry } from '../../app/airrun/terrain';
import { ModelLibrary } from '../../app/airrun/assets';
import { WorldView } from '../../app/airrun/world-view';
import { AirrunRenderer } from '../../app/airrun/renderer';
import { FlightFX } from '../../app/airrun/fx';
import { DEPARTURE, takeoffDistance, readFlightPose, interpolateFlightPose } from '../../app/airrun/flight-presentation';
import { useAirrun } from '../../app/airrun/state';
import { freshSave } from '../../app/airrun/data';
import { transformBox } from '../../app/airrun/collision';
import type { Encounter, Placement, Phase } from '../../app/airrun/types';

let checks = 0, anchoredModels = 0, districtModels = 0;
const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
const bounds = (p: Placement) => { const m = catalog.get(p.model)!; return transformBox(m.bounds.min.map((v, i) => (v + m.bounds.max[i]) / 2), m.bounds.size, p, { x: p.sx, y: p.sy, z: p.sz }, p.yaw); };
function verifyAnchors(e: Encounter, seed: number, uniform = true) {
    for (const p of e.placements) {
        const box = bounds(p);
        if (/^(fishing_boat|rescue_tug|icebreaker_bow|coastal_rescue_patrol_boat|korean_river_ferryboat|lake_research_sailboat)$/.test(p.model)) {
            check(Math.abs(p.y - WATER_LEVEL) < 1e-9, 'boat is at its waterline, not its flight target');
            check(p.move?.axis !== 'y', 'ships do not travel vertically');
        }
        if (!p.anchored) continue;
        const terrain = terrainElevation(p.x, p.z, e.theme, seed, e.variant), surface = groundAt(p.x, p.z, e.theme, seed, e.variant);
        if (p.role === 'foundation') {
            check(box.min.y <= terrain + .01, 'pier feet reach the seabed');
            check(Math.abs(p.y + deckSurfaceY(catalog.get(p.model)!) * p.sy - 1.95) < 1e-7, 'pier deck, not its taller railing caps, supports its buildings');
        }
        else if (p.supported) {
            const pier = e.placements.filter(v => p.supportModel ? v.model === p.supportModel : v.role === 'foundation').find(v => {
                const b = bounds(v), surface = v.role === 'foundation' ? v.y + deckSurfaceY(catalog.get(v.model)!) * v.sy : b.max.y;
                return p.x >= b.min.x && p.x <= b.max.x && p.z >= b.min.z && p.z <= b.max.z && Math.abs(box.min.y - surface) < 1e-7;
            });
            check(pier, 'building has a physical supporting pier at its actual footprint');
        }
        else check(Math.abs(box.min.y - surface) < 1e-7, 'native model touches its physical ground: ' + p.model);
        if (p.role !== 'foundation' && (uniform || !p.passage)) check(Math.abs(p.sx - p.sy) < 1e-9 && Math.abs(p.sy - p.sz) < 1e-9, 'source silhouette uses uniform scale');
        if (p.role === 'district') {
            check(Math.abs(p.x) < 42, 'district plot is inside the playable corridor');
            districtModels++;
        }
        anchoredModels++;
    }
}
for (const seed of [13, 42, 44171]) for (const p of PATTERNS) {
    const e = buildEncounter(p, 512, seed, { byId: catalog }, 14.6, 3);
    verifyAnchors(e, seed);
}
for (const speed of [180, 400, 600]) {
    const fast = createSim({ seed: 42 }); fast.speed = speed; fast.z = 800; fast.generate(6000);
    for (const e of fast.encounters) {
        verifyAnchors(e, 42, false);
        const overlap = (a: ReturnType<typeof bounds>, b: ReturnType<typeof bounds>) => (['x', 'y', 'z'] as const).every(axis => Math.min(a.max[axis], b.max[axis]) - Math.max(a.min[axis], b.min[axis]) > .15);
        const solidBoxes = (p: Placement) => proxies.get(p.model)?.static.map(b => transformBox(b.c, b.s, p, { x: p.sx, y: p.sy, z: p.sz }, p.yaw)) ?? [bounds(p)];
        const core = e.placements.filter(p => p.course && p.collision);
        for (const p of e.placements.filter(p => !p.course && p.collision && p.role !== 'foundation')) {
            const b = bounds(p);
            check(core.every(c => !overlap(b, bounds(c)) || !solidBoxes(p).some(a => solidBoxes(c).some(b => overlap(a, b)))), 'high-speed core adaptation cannot embed a district model in a structure');
        }
    }
}
for (const theme of ['coast', 'village', 'city'] as const) {
    const es = PATTERNS.filter(p => p.theme === theme).map(p => buildEncounter(p, 0, 42, { byId: catalog }, 11, 1));
    check(es.every(e => e.placements.filter(p => p.role === 'district' || p.role === 'working quay').length >= 12), 'connected inhabited district in every opening theme');
    check(new Set(es.flatMap(e => e.placements.map(p => p.model))).size >= 8, 'native model diversity in each opening theme');
    check(es.every(e => e.length - e.route.at(-1)!.z <= 125.01), 'the end of a section does not become a long empty flight');
}

// Raycast the actual exported GLB surface. Its bounding-box top is a railing, not the floor.
globalThis.fetch = async (url) => { if (/^(blob:|data:)/.test(String(url))) return nativeFetch(url); try { return new Response(await fs.readFile(path.join('public', String(url).split('?')[0]))); } catch { return new Response(null, { status: 404 }); } };
const deckLibrary = new ModelLibrary(); deckLibrary.byId = new Map(catalog);
const nativeDeck = await deckLibrary.instance('modular_pier_deck', 1);
const harbor = buildEncounter(PATTERNS[0], 0, 42, { byId: catalog }, 11, 1);
const building = harbor.placements.find(p => p.supported)!;
const footing = harbor.placements.find(p => p.role === 'foundation' && p.group === building.group)!;
nativeDeck.root.position.set(footing.x, footing.y, -footing.z); nativeDeck.root.scale.set(footing.sx, footing.sy, footing.sz); nativeDeck.root.updateMatrixWorld(true);
const deckContact = new T.Raycaster(new T.Vector3(building.x, 20, -building.z), new T.Vector3(0, -1, 0)).intersectObject(nativeDeck.root, true)[0];
const buildingFoot = bounds(building).min.y;
check(deckContact && buildingFoot <= deckContact.point.y + .002 && buildingFoot >= deckContact.point.y - .05, 'building feet contact the real GLB deck surface within its authored snap tolerance');
nativeDeck.dispose(); deckLibrary.dispose();

// Verify real terrain triangles rather than merely comparing the height function to itself.
for (const profile of Object.values(GRAPHICS)) {
    const g = terrainGeometry(128, 'coast', 42, 0, profile.terrainCell), mesh = new T.Mesh(g, new T.MeshBasicMaterial({ side: T.DoubleSide }));
    mesh.position.z = -128; mesh.updateMatrixWorld(true);
    for (const x of [-207.3, 8.1, 31, 35, 41.9, 68.7, 101.2, 226.4, 416.7]) for (const z of [131.2, 190.6, 245.8]) {
        const hit = new T.Raycaster(new T.Vector3(x, 300, -z), new T.Vector3(0, -1, 0)).intersectObject(mesh)[0];
        check(hit && Math.abs(hit.point.y - renderedTerrainHeight(x, z, 'coast', 42, 0, profile.terrainCell)) < .0001, 'root height matches the rendered triangle');
    }
    g.dispose(); (mesh.material as T.Material).dispose();
}
const dive = createSim({ seed: 42 }); dive.obstacles = []; dive.encounters = []; dive.pickups = []; dive.nextStart = 1e9;
const diveControl = controls(); diveControl.y = -1;
for (let frame = 0; frame < 600 && !dive.failed; frame++) dive.step(1 / 60, diveControl);
check(dive.failed && dive.reasonEn === 'GROUND / WATER IMPACT', 'descending into the sea produces an impact instead of clamping above it forever');
const library = new ModelLibrary(); library.byId = new Map(catalog);
const scene = new T.Scene(), world = new WorldView(scene, library), sim = createSim({ seed: 42 });
for (let i = 0; i < 16; i++) {
    world.makeChunk(i, sim);
    for (const p of world.chunks.get(i)!.props.filter(p => p.role === 'landscape')) {
        const foot = bounds(p).min.y;
        check(foot <= renderedTerrainHeight(p.x, p.z, 'coast', 42, 0, GRAPHICS.high.terrainCell) + .0001, 'landscape model is buried into, not suspended above, its rendered tile');
        check(Math.abs(p.x) > 42, 'outside airspace contains landscape');
    }
}
world.update(sim, 0, 'high');
check([...world.chunks.keys()].every(index => index >= 0), 'negative-distance terrain cannot intrude into the takeoff hangar');
world.dispose(); library.dispose();
await Promise.allSettled([...library.pending.values()]);

const a = readFlightPose(sim), b = { ...a, x: 2, y: 25, z: 1.1, roll: .2, trickRoll: Math.PI * 2 };
for (const speed of [40, 54, 67]) {
    const h = .0001, endVelocity = (takeoffDistance(4, speed) - takeoffDistance(4 - h, speed)) / h;
    check(Math.abs(endVelocity - speed) < .002 && takeoffDistance(0, speed) === 0, 'takeoff ends at the actual flight speed, without stopping and lurching forward');
}
let previousZ = -Infinity;
for (let i = 0; i <= 20; i++) {
    const pose = interpolateFlightPose(a, b, i / 20);
    check(pose.z >= previousZ && pose.z <= b.z && Math.abs(pose.trickRoll - Math.PI * 2 * i / 20) < 1e-8, 'interpolated movement is continuous and keeps full trick turns'); previousZ = pose.z;
}

// Exercise the renderer's real phase branch with inert rendering, not a separate mock policy.
globalThis.requestAnimationFrame = () => 1;
Object.defineProperty(globalThis, 'matchMedia', { configurable:true, writable:true, value: () => ({ matches: false }) });
const renderer = Object.create(AirrunRenderer.prototype) as AirrunRenderer;
let selected = 0, cameraMoves = 0, environmentSim: unknown = null;
Object.assign(renderer, {
    disposed: false, initialized: true, lastFrame: 1000, lastRun: 'world', lastPhase: 'preflight', lastERequest: 0,
    accumulator: 0, lastHUD: 9999, frames: 0, fpsStart: 1000, sim, streamResume: true, renderPose: readFlightPose(sim), previousPose: readFlightPose(sim),
    flightOffset: DEPARTURE.flightOffset,
    camera: new T.PerspectiveCamera(), planeRoot: new T.Group(), airport: { root: new T.Group() },
    world: { root: new T.Group(), update: () => {}, modelPlacements: [] }, fx: { root: new T.Group(), update: () => {} },
    plane: null, insignia: null, studio: null, audio: { update: () => {} }, library: { byId: catalog, ready: () => true, peek: () => ({}) },
    completeLoading: () => {}, applyQuality: () => {}, livery: () => {}, render: () => {},
    selectPlane: async () => { selected++; }, hangarCamera: () => { cameraMoves++; }, flightCamera: () => { cameraMoves++; },
    environment: (s: unknown) => { environmentSim = s; },
});
sim.z = 1700; renderer.renderPose = readFlightPose(sim); renderer.previousPose = readFlightPose(sim);
renderer.planeRoot.position.set(3, 24, DEPARTURE.flightOffset);
useAirrun.setState({ save: freshSave(), runId: 'world', phase: 'preflight', eRequest: 0, resumeCountdown: 0 });
renderer.frame(1000);
check(renderer.world!.root.visible && !renderer.airport!.root.visible && environmentSim === sim, 'stream preparation preserves the actual flight scene and atmosphere');
check(selected === 0 && cameraMoves === 0 && renderer.planeRoot.position.z === DEPARTURE.flightOffset, 'stream preparation cannot switch to the hangar camera or aircraft');
for (const phase of ['paused', 'results'] as Phase[]) {
    renderer.lastPhase = phase; useAirrun.setState({ phase, pausedPhase: 'flying' }); renderer.frame(1000);
    check(renderer.world!.root.visible && !renderer.airport!.root.visible, 'late flight pause/result does not restore the runway');
}
sim.z = 100; sim.time = 100; renderer.renderPose = renderer.previousPose = readFlightPose(sim);
useAirrun.setState({ phase: 'flying' }); renderer.lastPhase = 'flying'; renderer.frame(1000);
check(renderer.airport!.root.visible && renderer.airport!.root.position.z === 100, 'departure geometry is retired by distance, never by a two-second timer');
check(renderer.world!.root.position.z === DEPARTURE.flightOffset, 'departure and flight share a constant world frame');

// Particles and wing trails must remain attached during interpolation of the world distance.
const fx = new FlightFX(scene), aircraft = new T.Group(); sim.boost = 1; sim.effects.set('shield', 3);
const pose = { x: 4, y: 25, z: sim.z - .7 }; fx.root.position.z = DEPARTURE.flightOffset - .7;
fx.update(sim, .1, aircraft, [], 'high', pose); fx.root.updateMatrixWorld(true);
const shieldPosition = fx.shield.getWorldPosition(new T.Vector3());
check(Math.abs(shieldPosition.z - DEPARTURE.flightOffset) < 1e-9 && shieldPosition.x === pose.x && shieldPosition.y === pose.y, 'shield stays on the displayed aircraft');
const tail = fx.exhaust.getWorldPosition(new T.Vector3());
check(Math.abs(tail.z - (DEPARTURE.flightOffset + sim.plane.length * .50 + 1.5)) < 1e-9, 'blue exhaust does not lag or receive the departure offset twice');
fx.dispose();
console.log(JSON.stringify({ worldRevisionChecks: checks, anchoredModels, districtModels, gpuVerified: false, status: 'passed' }));
