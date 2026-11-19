import { nativeFetch } from './image-runtime';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as T from 'three';
import { catalog, suppliedAssets, proxies, createSim } from './fixtures';
import { PATTERNS, buildEncounter } from '../../app/airrun/patterns';
import { themeCollection, modelHome, populateThemeCollection, curatedDistrictModels } from '../../app/airrun/model-collection';
import { sweepUnitTriangle } from '../../app/airrun/mesh-collision';
import { obstacleContact } from '../../app/airrun/collision';
import { AIRCRAFT, freshSave } from '../../app/airrun/data';
import { applyRun, ensureQuests } from '../../app/airrun/progression';
import { parseSave, validateResult } from '../../app/airrun/state';
import { ModelArchive } from '../../app/airrun/model-archive';
import { FlightDeck } from '../../app/airrun/flight-deck';
import { ModelLibrary, parkAircraft, poseAircraft } from '../../app/airrun/assets';
import { EnvironmentFX, effectSocket } from '../../app/airrun/environment-fx';
import { BeaconFX } from '../../app/airrun/beacon-fx';
import { flightFraming } from '../../app/airrun/flight-framing';
import { inspectionPoints } from '../../app/airrun/inspection';
import type { Obstacle, ThemeId } from '../../app/airrun/types';
globalThis.fetch = async (url: RequestInfo | URL) => { if (/^(blob:|data:)/.test(String(url))) return nativeFetch(url); try { return new Response(await fs.readFile(path.join('public', String(url).split('?')[0]))); } catch { return new Response(null, { status: 404 }); } };
let checks = 0;
function check(value: unknown, label: string) { assert(value, label); checks++; }
const triangle = [new T.Vector3(-4, -4, 0), new T.Vector3(4, -4, 0), new T.Vector3(0, 4, 0)] as const;
for (const [x, y, expected] of [[0, 0, .4], [0, -4.5, (5 - Math.sqrt(.75)) / 10], [-4.5, -4.5, (5 - Math.sqrt(.5)) / 10]]) {
    const hit = sweepUnitTriangle(new T.Vector3(x, y, 5), new T.Vector3(x, y, -5), ...triangle);
    check(hit && Math.abs(hit.t - expected) < 1e-7, 'continuous face/edge/vertex contact time');
}
check(!sweepUnitTriangle(new T.Vector3(10, 10, 5), new T.Vector3(10, 10, -5), ...triangle), 'empty triangle corner has no ghost contact');
check(sweepUnitTriangle(new T.Vector3(0, 0, .2), new T.Vector3(0, 0, .2), ...triangle)?.t === 0, 'initial overlap is reported');
check(Math.abs(sweepUnitTriangle(new T.Vector3(0, 0, 2000), new T.Vector3(0, 0, -2000), ...triangle)!.t - .49975) < 1e-9, 'fast sweep does not tunnel');
check(suppliedAssets.length === 403 && AIRCRAFT.length === 22, 'actual supplied inventory and all playable airframes');
check(AIRCRAFT.every(plane => suppliedAssets.some(meta => meta.id === plane.model)), 'every selectable aircraft uses the supplied pack');
check(new Set(suppliedAssets.filter(meta => meta.category !== 'aircraft').map(meta => modelHome(meta))).size === 8, 'every environmental asset has a thematic home');
const homes = ['coast', 'village', 'city', 'ice', 'desert', 'forest', 'farm', 'korea'] as ThemeId[];
const worldIds = new Set(homes.flatMap(theme => themeCollection(theme, catalog).map(meta => meta.id)));
check(worldIds.size === 381, 'all 381 non-aircraft models participate in the theme decks');
const coverage: { theme: string; seed: number; span: number; total: number; encounters: number }[] = [];
for (const theme of homes) for (const seed of [13, 42]) for (const span of [11, AIRCRAFT.find(plane => plane.id === 'transport')!.span]) {
    const deck = [...new Map([...themeCollection(theme, catalog), ...Array.from({ length: 12 }, (_, i) => curatedDistrictModels(theme, 0, i, catalog)).flat()].map(meta => [meta.id, meta])).values()], observed = new Set<string>(), cycle = new Set<string>();
    const pool = PATTERNS.filter(pattern => pattern.theme === theme && (theme !== 'korea' || pattern.variant === 0));
    let start = 0, from = { x: 0, y: 24 }, count = 0;
    for (; count < 12; count++) {
        const encounter = buildEncounter(pool[count % pool.length], start, seed, { byId: catalog }, span, count + 1, from);
        populateThemeCollection(encounter, catalog, seed, cycle, span);
        check(encounter.placements.filter(p => p.role === 'collection').length <= 4, 'discovery details cannot overwhelm the authored district');
        const knots = encounter.route.flatMap(point => [{ x: point.x, y: point.y, z: point.z - 62 }, { x: point.x, y: point.y, z: point.z + 62 }]);
        for (const p of encounter.placements) {
            if (deck.some(meta => meta.id === p.model)) observed.add(p.model);
            if (p.role !== 'collection') continue;
            check(Math.abs(p.x) <= 42, 'collection centres stay in the playable corridor');
            const meta = catalog.get(p.model)!;
            const obstacle: Obstacle = { id: 1, model: p.model, animationPhase: p.animationPhase, position: { x: p.x, y: p.y, z: p.z }, scale: { x: p.sx, y: p.sy, z: p.sz }, yaw: p.yaw, size: { x: 1, y: 1, z: 1 }, role: p.role, small: false, hit: false, scored: false };
            for (let i = 1; i < knots.length; i++) check(!obstacleContact(obstacle, meta, proxies.get(p.model), knots[i - 1], knots[i], { x: span * .34, y: 1.05, z: 4 }), 'full native moving collection leaves the compulsory line clear');
        }
        const last = encounter.route.at(-1)!; from = { x: last.x, y: last.y }; start += encounter.length;
    }
    // The full inventory belongs in the archive. A flight is a sequence of
    // authored places, rather than a demand to exhibit every catalogue export.
    check(observed.size >= Math.min(8, deck.length), `${theme}/${seed}/${span} uses a varied thematic vocabulary`);
    coverage.push({ theme, seed, span, total: deck.length, encounters: count });
}
const sim = createSim(); sim.observeModel('hero_clifftop_lighthouse'); sim.observeModel('hero_clifftop_lighthouse'); sim.observeModel('hero_airfield_hangar');
check(sim.discoveredModels.size === 3, 'model discoveries are idempotent including the flown aircraft');
const result = sim.result(true); check(validateResult(result), 'new discovery results retain valid accounting');
const save = applyRun(ensureQuests(freshSave()), result);
check(save.modelDiscoveries?.includes('hero_airfield_hangar') && parseSave(JSON.parse(JSON.stringify(save)))?.modelDiscoveries?.length === 3, 'discovery archive survives save/backup parsing');
check(!validateResult({ ...result, discoveredModels: ['<script>'] }), 'malformed discovery identifiers are rejected');
check(applyRun(save, result).coins === save.coins, 'repeated settlement cannot pay twice');
const archive = renderToStaticMarkup(<ModelArchive catalog={catalog} save={save} ko onAircraft={() => {}}/>);
check(archive.includes('403') && archive.includes('271') && archive.includes('Edition12'), 'archive uses the Edition12 inventory');
check(archive.includes('Edition12 실제 게임 모델 렌더') && archive.includes('움직이는 모델만'), 'preview provenance and animation filter are visible');
const hud = renderToStaticMarkup(<FlightDeck hud={sim.hud({ x: 0, y: 0, boost: false, brake: false, gear: 3 })} ko hyper={<button>E</button>} onPause={() => {}}/>);
check(hud.includes('AIRSPEED') && hud.includes('기체 상태') && hud.includes('f6-sector') && hud.includes('비행 작전') && hud.includes('FIND YOUR FLOW'), 'flight instruments are driven by the real HUD');
const library = new ModelLibrary(); library.byId = new Map(catalog);
const sourcePlacement = { model: 'plaza_fountain', x: 17, y: 2, z: 300, sx: .7, sy: 1.2, sz: .8, yaw: .7, collision: false, role: 'collection', move: { axis: 'z' as const, amplitude: 7, frequency: .4, phase: .3 } };
const transform = new T.Object3D(); transform.position.set(sourcePlacement.x, sourcePlacement.y, sim.z - sourcePlacement.z - Math.sin(sim.motionTime * .4 + .3) * 7);
transform.rotation.y = sourcePlacement.yaw; transform.scale.set(.7, 1.2, .8); transform.updateMatrix();
const sourceSocket = [3, 6, -2], expectedSocket = new T.Vector3(...sourceSocket).applyMatrix4(transform.matrix);
check(expectedSocket.distanceTo(effectSocket(sourcePlacement, sourceSocket, sim.motionTime, sim.z)) < 1e-8, 'effect sockets match rendered TRS and smooth moving source');
const fx = new EnvironmentFX(new T.Group(), catalog);
sim.z = 240; sim.weather.night = 1;
const waterSources = ['plaza_fountain', 'waterfall_cliff', 'large_dam', 'icy_cave_gate', 'factory_building', 'village_bakery'].map((model, i) => ({ ...sourcePlacement, model, x: i * 8 - 20, move: undefined }));
fx.update(sim, waterSources, 3);
check(fx.spray.geometry.drawRange.count > 0 && fx.spray.geometry.drawRange.count <= 384 && fx.steam.geometry.drawRange.count > 0 && fx.steam.geometry.drawRange.count <= 192, 'water and chimney effects use bounded source-connected pools');
const beforePause = Array.from(fx.spray.geometry.getAttribute('position').array);
fx.update(sim, waterSources, 3);
check(beforePause.every((v, i) => v === fx.spray.geometry.getAttribute('position').array[i]), 'paused environmental effects stay in the same pose');
fx.update(sim, waterSources, 3.2);
check(beforePause.some((v, i) => v !== fx.spray.geometry.getAttribute('position').array[i]), 'water particles actually move with scene time');
check(Array.from(fx.spray.geometry.getAttribute('position').array).every(Number.isFinite), 'all water emission positions are finite');
fx.dispose(); check(fx.root.parent === null, 'source effects release their scene root');
const beaconParent = new T.Group(), beacons = new BeaconFX(beaconParent), lighthouse = await library.instance('lighthouse', 1);
beaconParent.position.set(8, 0, 1200); beaconParent.add(lighthouse.root);
lighthouse.root.position.set(15, 0, -60); lighthouse.root.scale.setScalar(.7); lighthouse.mixer.setTime(0);
const lighthousePlacement = { ...sourcePlacement, model: 'lighthouse', z: sim.z + 60 };
beacons.update(sim, [lighthousePlacement], new Map([['lighthouse', lighthouse]]), p => p.model);
check(beacons.beams[0].visible && beacons.lights[0].intensity > 0, 'nighttime lighthouse optics follow an actual loaded native actor');
const beaconPosition = beacons.beams[0].getWorldPosition(new T.Vector3()), nativePosition = lighthouse.model.getObjectByName('fresnel_carriage')!.getWorldPosition(new T.Vector3());
check(beaconPosition.distanceTo(nativePosition) < 1e-7, 'beacon origin follows native node including parent floating-origin offset');
const rotation = beacons.beams[0].quaternion.clone(); lighthouse.mixer.setTime(2);
beacons.update(sim, [lighthousePlacement], new Map([['lighthouse', lighthouse]]), p => p.model);
check(rotation.angleTo(beacons.beams[0].quaternion) > .1, 'lighthouse beam rotates with the real carriage animation');
sim.weather.night = 0; beacons.update(sim, [lighthousePlacement], new Map([['lighthouse', lighthouse]]), p => p.model);
check(!beacons.root.visible && beacons.lights.every(light => light.intensity === 0), 'daytime does not create extra lighthouse light beams');
beacons.dispose(); lighthouse.dispose();
for (const id of ['cessna_skyhawk', 'pitts_s2c', 'stearman_model_75', 'heavy_transport']) {
    const instance = await library.instance(id, 0); parkAircraft(instance);
    const box = new T.Box3().setFromObject(instance.root, true);
    check(Math.abs(box.min.y) < 1e-5, 'authored parked pitch keeps the actual vertices on the hangar floor');
    instance.dispose();
}
let chasePoses = 0, maximumChaseExtent = 0;
for (const plane of AIRCRAFT) {
    const instance = await library.instance(plane.model, 0), frame = flightFraming(plane.span, plane.length);
    instance.model.position.y = -(instance.meta.bounds.min[1] + instance.meta.bounds.max[1]) / 2;
    poseAircraft(instance, 0, 0, 0, false, 1);
    const points = inspectionPoints(instance.root);
    for (const roll of [-.55, 0, .55]) for (const pitch of [-.2, .2]) {
        instance.root.rotation.set(pitch, 0, roll, 'YXZ'); instance.root.updateMatrixWorld(true);
        const camera = new T.PerspectiveCamera(60, 16 / 9, .1, 1000);
        camera.position.set(0, frame.height, frame.distance); camera.lookAt(0, -1.2, -29); camera.updateMatrixWorld(true);
        let extent = 0;
        for (const p of points) { const screen = p.clone().applyMatrix4(instance.root.matrixWorld).project(camera); extent = Math.max(extent, Math.abs(screen.x), Math.abs(screen.y)); }
        check(extent < .98, `${plane.id} remains inside the chase viewport while banking: ${extent}`);
        maximumChaseExtent = Math.max(maximumChaseExtent, extent); chasePoses++;
    }
    instance.dispose(); library.trim(8);
}
library.dispose();
console.log(JSON.stringify({ expeditionChecks: checks, districtVarietyCases: coverage, chasePoses, maximumChaseExtent, sourceModels: 403, animatedModels: 271, gpuVerified: false, status: 'passed' }));
