import { nativeFetch } from './image-runtime';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as T from 'three';
import { createCanvas } from '@napi-rs/canvas';
import { ModelLibrary, parkAircraft } from '../../app/airrun/assets';
import { AirrunRenderer } from '../../app/airrun/renderer';
import { AirportView } from '../../app/airrun/airport';
import { inspectionPoints, inspectionFit } from '../../app/airrun/inspection';
import { WorldView } from '../../app/airrun/world-view';
import { GRAPHICS, AIRSPACE } from '../../app/airrun/graphics';
import { FlightFX } from '../../app/airrun/fx';
import { cloudField, terrainGeometry } from '../../app/airrun/terrain';
import { lightAt } from '../../app/airrun/weather';
import { AIRCRAFT, DEFAULT_SETTINGS, freshSave } from '../../app/airrun/data';
import { ensureQuests, QUESTS, QUEST_REWARDS, CAREER } from '../../app/airrun/progression';
import { useAirrun } from '../../app/airrun/state';
import { createSim, controls, catalog } from './fixtures';

let checks = 0;
const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
globalThis.fetch = async (url) => { if (/^(blob:|data:)/.test(String(url))) return nativeFetch(url); try { return new Response(await fs.readFile(path.join('public', String(url).split('?')[0]))); } catch { return new Response(null, { status: 404 }); } };
Object.defineProperty(globalThis, 'document', { configurable:true, writable:true, value: { createElement: () => createCanvas(1024, 256) } });
const library = new ModelLibrary(); await library.init(() => {});
const scene = new T.Scene(), airport = new AirportView(scene, library);
const floor = new T.Box3().setFromObject(airport.root);
check(floor.min.y <= 0 && floor.max.y >= 21, 'complete grounded hangar structure');
check(airport.lights.filter(l => l instanceof T.SpotLight && l.castShadow).length === 2, 'contact shadow lights');
airport.update(1);
check(airport.doorLeaves.length === 6 && airport.doorLeaves.every(leaf => {
    const b = new T.Box3().setFromObject(leaf);
    return b.max.x < -32 || b.min.x > 32;
}), 'parked door panels leave a 64-metre runway opening');
airport.dispose(); check(airport.root.parent === null, 'airport disposal releases scene');

const viewports = [
    { width: 1920, height: 1080, left: 181, right: 339, top: 181, bottom: 253 },
    { width: 1366, height: 768, left: 158, right: 339, top: 181, bottom: 235 },
    { width: 1280, height: 720, left: 158, right: 339, top: 147, bottom: 220 },
    { width: 844, height: 390, left: 75, right: 240, top: 112, bottom: 127 },
    { width: 736, height: 320, left: 75, right: 240, top: 90, bottom: 114 },
];
let fitCases = 0, maxRadius = 0;
for (const aircraft of AIRCRAFT) {
    const instance = await library.instance(aircraft.model, 0);
    parkAircraft(instance);
    const points = inspectionPoints(instance.root), localCenter = new T.Box3().setFromPoints(points).getCenter(new T.Vector3()), baseY = .52;
    for (const viewport of viewports) for (let yaw = 0; yaw < Math.PI * 2 - .1; yaw += Math.PI / 4) for (const pitch of [.1, .25, .6]) {
        const rectWidth = viewport.width - viewport.left - viewport.right, rectHeight = viewport.height - viewport.top - viewport.bottom;
        const direction = new T.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
        const { fov, radius, target, center } = inspectionFit(points, localCenter, direction, viewport.width / viewport.height, rectHeight / viewport.height * .80, rectWidth / viewport.width * .88, baseY);
        maxRadius = Math.max(maxRadius, radius);
        const camera = new T.PerspectiveCamera(fov, viewport.width / viewport.height, .25, 2000);
        camera.position.copy(target);
        camera.setViewOffset(viewport.width, viewport.height, viewport.width / 2 - viewport.left - rectWidth / 2, viewport.height / 2 - viewport.top - rectHeight / 2, viewport.width, viewport.height);
        camera.lookAt(center); camera.updateMatrixWorld(true);
        check(Math.abs(camera.position.x) < 41 && Math.abs(camera.position.z) < 34 && camera.position.y < 21, 'camera stays inside the hangar');
        const point = new T.Vector3();
        for (const vertex of points) {
            point.copy(vertex); point.y += baseY; point.project(camera);
            const x = (point.x + 1) * viewport.width / 2, y = (1 - point.y) * viewport.height / 2;
            check(x >= viewport.left - 2 && x <= viewport.width - viewport.right + 2 && y >= viewport.top - 2 && y <= viewport.height - viewport.bottom + 2, 'visible aircraft silhouette fits ' + aircraft.id + '/' + viewport.width + '/' + yaw + '/' + pitch);
        }
        fitCases++;
    }
    instance.dispose();
}

check(lightAt(0).phase === 'dawn' && lightAt(40).phase === 'day' && lightAt(115).phase === 'sunset' && lightAt(150).phase === 'night', 'dawn/day/sunset/night phases');
const cloud = cloudField(321); cloud.setQuality(650); cloud.update(30, .2, 0, 10); const neutral = cloud.mesh.instanceColor!.array.slice();
cloud.update(115, .2, .25, 10, 1, 0); check(cloud.mesh.count <= 650 && cloud.mesh.count >= 400 && neutral.some((v, i) => Math.abs(v - cloud.mesh.instanceColor!.array[i]) > .1), 'warm cloud gradients are applied');
cloud.drift(116, 20); check(Math.abs(cloud.mesh.position.z - 12) < .0001, 'cloud movement continues between color refreshes'); cloud.dispose();
const terrainCounts = Object.values(GRAPHICS).map(profile => { const g = terrainGeometry(0, 'coast', 1, 0, profile.terrainCell); const count = g.getAttribute('position').count; g.dispose(); return count; });
check(terrainCounts[0] < terrainCounts[1] && terrainCounts[1] < terrainCounts[2], 'graphics settings change terrain density');

const sim = createSim({mode: 'daily'}); sim.obstacles = []; sim.encounters = []; sim.pickups = []; sim.nextStart = 1e9;
const control = controls(); control.boost = true;
for (let frame = 0; frame < 300; frame++) sim.step(1 / 60, control);
check(sim.boost > .99 && sim.boostHeat > .7 && sim.hp === sim.maxHp && !sim.failed, 'sustained boost builds heat and exhaust without hull damage before lockout');
const fx = new FlightFX(scene); fx.update(sim, .1, new T.Group(), [], 'balanced');
check(fx.exhaust.visible && fx.vapourHistory.length > 0 && fx.rainGeometry.drawRange.count === GRAPHICS.balanced.rainDrops, 'blue boost and quality particle budgets');
control.boost = false; for (let frame = 0; frame < 660; frame++) sim.step(1 / 60, control);
check(sim.boost < .01 && sim.boostHeat < .01, 'released boost fades to normal output'); fx.dispose();
for (const sensitivity of [.5, 1, 1.5]) {
    const test = createSim({ settings: { ...DEFAULT_SETTINGS, sensitivity } }); test.obstacles = []; test.encounters = []; test.pickups = []; test.nextStart = 1e9;
    const move = controls(); move.x = move.y = 1; for (let frame = 0; frame < 1200; frame++) test.step(1 / 60, move);
    check(test.x <= AIRSPACE.halfWidth && test.y <= AIRSPACE.ceiling && test.vx > 17.9, 'control response changes without reducing full steering authority');
}
const world = new WorldView(scene, library), moving = { model: 'city_train', x: 32, y: 1.8, z: 200, sx: 1, sy: 1, sz: 1, yaw: 0, collision: true, role: 'moving', move: { axis: 'z' as const, amplitude: 30, frequency: .3, phase: .2 } };
sim.motionTime = 0; const firstPose = world.placementPose(moving, sim); sim.motionTime = 1 / 60; const secondPose = world.placementPose(moving, sim);
check(firstPose.z !== secondPose.z && Math.abs(firstPose.z - secondPose.z) < 1, 'whole-model movement is smooth and includes forward rail motion'); world.dispose();

// State transactions validate settings and never double-pay the presentation overlay.
const pilot = ensureQuests(freshSave()); const spec = QUESTS.find(q => q.id === pilot.quests[0].id)!; pilot.quests[0].progress = spec.target;
useAirrun.setState({ phase: 'hangar', save: pilot, celebration: null });
const oldSettings = useAirrun.getState().save.settings;
useAirrun.getState().settings({ volume: 2 }); check(useAirrun.getState().save.settings === oldSettings, 'reject invalid volume');
const uid = pilot.quests[0].uid; useAirrun.getState().claimQuest(uid); const paid = useAirrun.getState();
check(paid.save.coins === QUEST_REWARDS[spec.tier - 1] && paid.celebration?.coins === QUEST_REWARDS[spec.tier - 1], 'quest celebration reflects the actual reward');
useAirrun.getState().claimQuest(uid); check(useAirrun.getState().save.coins === paid.save.coins, 'repeated claims do not pay twice');
const careerSave = structuredClone(paid.save); careerSave.careerProgress = CAREER[careerSave.career].target; useAirrun.setState({ save: careerSave }); useAirrun.getState().claimCareer();
check(useAirrun.getState().celebration?.kind === 'career', 'career reward presentation is connected');
useAirrun.getState().start(); check(useAirrun.getState().phase === 'preflight' && useAirrun.getState().practice === null, 'preflight preparation precedes physics');
useAirrun.getState().airport(); check(useAirrun.getState().phase === 'hangar', 'preflight can be cancelled');
let release!: () => void;
const gate = new Promise<void>(resolve => { release = resolve; });
const preparation = Object.create(AirrunRenderer.prototype) as AirrunRenderer;
Object.assign(preparation, { sim: createSim(), preparing: false, warmGeneration: 0, disposed: false, planeId: 'skyhawk:0', library: { byId: catalog, cache: new Map(), ensureProxies: async () => {}, peek: () => undefined, load: () => gate }, selectPlane: async () => {}, world: { update: () => {} } });
useAirrun.setState({ phase: 'preflight' }); const outstanding = preparation.prepareFlight(); await Promise.resolve(); useAirrun.getState().airport(); release(); await outstanding;
check(useAirrun.getState().phase === 'hangar' && !preparation.preparing, 'late preflight completion cannot restart a cancelled run');
const originalFetch = globalThis.fetch; let failedRequests = 0;
globalThis.fetch = async (url) => { if (/^(blob:|data:)/.test(String(url))) return nativeFetch(url); if (String(url).includes('cargo_drone')) { failedRequests++; return new Response(null, { status: 503 }); } return originalFetch(url); };
await assert.rejects(library.load('cargo_drone', 1), /503/); await assert.rejects(library.load('cargo_drone', 1), /503/);
check(failedRequests === 1 && !library.canRequest('cargo_drone', 1), 'failed downloads have a bounded retry window');
globalThis.fetch = originalFetch; library.retry('cargo_drone'); await library.load('cargo_drone', 1); check(!library.failures.has('cargo_drone:1'), 'manual retry recovers a failed model');
check([...library.references.values()].every(n => n === 0), 'inspected models release cache pins'); library.dispose();
console.log(JSON.stringify({ revisionChecks: checks, aircraftOrbitCases: fitCases, maxRadius, sustainedBoostEffects: true, settingsValidated: true, gpuVerified: false, status: 'passed' }));
