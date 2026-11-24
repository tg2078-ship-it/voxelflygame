import { nativeFetch } from './image-runtime';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as T from 'three';
import { catalog, createSim } from './fixtures';
import { ModelLibrary } from '../../app/airrun/assets';
import { RigidActorBatching } from '../../app/airrun/rigid-batching';
import { buildCloudCells, cloudField } from '../../app/airrun/cloud-field';
import { landscapePlacements } from '../../app/airrun/landscape';
import { AIRSPACE, GRAPHICS, nativeAnimationDistance } from '../../app/airrun/graphics';
import { renderedTerrainHeight } from '../../app/airrun/world-ground';
import { THEMES } from '../../app/airrun/data';
import { FlightWake } from '../../app/airrun/flight-wake';
import { FlightGuidance } from '../../app/airrun/flight-guidance';
import { projectGuidance } from '../../app/airrun/guidance-projection';

globalThis.fetch = async (url) => {
    if (/^(blob:|data:)/.test(String(url))) return nativeFetch(url);
    try { return new Response(await fs.readFile(path.join('public', String(url).split('?')[0]))); }
    catch { return new Response(null, { status: 404 }); }
};
let checks = 0;
const check = (value: unknown, label: string) => { assert(value, label); checks++; };
const cloudInventory = [];
for (const [budget, formations] of [[650, 20], [900, 24], [2600, 32], [5200, 32]]) {
    const cells = buildCloudCells(44171, budget);
    check(cells.length <= budget && cells.length > budget * .55, 'bounded cloud budget');
    check(new Set(cells.map(cell => cell.cloud)).size === formations, 'quality budget keeps complete connected cloud formations');
    for (let id = 0; id < formations; id++) {
        const group = cells.filter(cell => cell.cloud === id), found = new Set([0]), queue = [0];
        while (queue.length) {
            const a = group[queue.shift()!];
            for (let j = 0; j < group.length; j++) if (!found.has(j)) {
                const b = group[j];
                if (Math.abs(a.x - b.x) / a.sx + Math.abs(a.y - b.y) / a.sy + Math.abs(a.z - b.z) / a.sz < 1.01) { found.add(j); queue.push(j); }
            }
        }
        check(found.size === group.length, 'face-connected cloud silhouette');
    }
    cloudInventory.push({ budget, cells: cells.length, formations });
}
const clouds = cloudField(44171); clouds.setQuality(900); clouds.update(20, .3, 0, 800);
const matrix = new T.Matrix4(), positions: number[] = [];
for (let i = 0; i < clouds.mesh.count; i++) { clouds.mesh.getMatrixAt(i, matrix); positions.push(matrix.elements[14]); }
clouds.update(20.25, .3, 0, 830);
const cells = buildCloudCells(44171, 900), offsets = new Map<number, number>();
for (let i = 0; i < clouds.mesh.count; i++) {
    clouds.mesh.getMatrixAt(i, matrix); const delta = matrix.elements[14] - positions[i];
    if (!offsets.has(cells[i].cloud)) offsets.set(cells[i].cloud, delta);
    check(Math.abs(delta - offsets.get(cells[i].cloud)!) < .001, 'whole cloud wraps without tearing');
}
clouds.dispose();
const scenery: Record<string, number> = {};
for (const theme of THEMES) for (const variant of theme.id === 'korea' ? [0, 1, 2, 3] : [0]) for (const quality of ['balanced', 'high', 'ultra'] as const) {
    let count = 0;
    for (const index of [0, 8, 31]) {
        const props = landscapePlacements(index, theme.id, variant, 44171, quality, catalog);
        check(props.length <= GRAPHICS[quality].landscapePlacements, 'scenery budget');
        assert.deepEqual(props, landscapePlacements(index, theme.id, variant, 44171, quality, catalog));
        for (const p of props) {
            const meta = catalog.get(p.model)!;
            const rx = (Math.abs(Math.cos(p.yaw)) * meta.bounds.size[0] + Math.abs(Math.sin(p.yaw)) * meta.bounds.size[2]) * p.sx * .5;
            check(Math.abs(p.x) - rx >= AIRSPACE.halfWidth + 13.99, 'rotated landscape clears airspace');
            check(!p.collision && p.role === 'landscape', 'background has no invisible collision');
            check(p.y + meta.bounds.min[1] * p.sy <= renderedTerrainHeight(p.x, p.z, theme.id, 44171, variant, GRAPHICS[quality].terrainCell) + .001, 'no floating root');
        }
        count += props.length;
    }
    scenery[theme.id + ':' + variant + ':' + quality] = count;
}
check(scenery['coast:0:high'] >= 45, 'coastal scenery occupies actual dry headlands');
const wakes = [30, 60, 144].map(fps => {
    const wake = new FlightWake();
    for (let frame = 0; frame <= fps * 4; frame++) {
        const t = frame / fps;
        wake.update(new T.Vector3(-5 + t * 2, 24 + t, 0), new T.Vector3(5 + t * 2, 24 + t, 0), t * 90, t, true);
    }
    check(wake.samples.length === 180, 'three second bounded wake at ' + fps + 'fps');
    check(Math.abs(wake.samples[0].z - 360) < .001, 'wake attached to current wing');
    const snapshot = wake.samples.map(sample => ({ z: sample.z, x: sample.left.x }));
    wake.update(new T.Vector3(), new T.Vector3(), 360, 7.1, false);
    check(wake.samples.length === 0, 'trail fades by elapsed time'); return snapshot;
});
for (let i = 0; i < 180; i++) for (let fps = 1; fps < 3; fps++) check(Math.abs(wakes[0][i].z - wakes[fps][i].z) < .001 && Math.abs(wakes[0][i].x - wakes[fps][i].x) < .001, 'frame independent wing trace');
const camera = new T.PerspectiveCamera(65, 16 / 9, .25, 2000); camera.position.set(0, 29, -60); camera.lookAt(0, 23, -110);
const projection = projectGuidance(camera, { x: 16, y: 30, z: 200 }, 0, -80, 60);
check(projection.visible && projection.x > 50 && projection.x < 70, 'world passage projects on correct side');
check(!projectGuidance(camera, { x: 0, y: 24, z: 20 }, 0, -80, 60).visible, 'near passage does not cover aircraft');
check(!projectGuidance(camera, { x: 0, y: 24, z: 1200 }, 0, -80, 60).visible, 'distant passage stays unobtrusive');
const hud = createSim().hud({ x: 0, y: 0, boost: false, brake: false, gear: 3 });
hud.navigation = { distance: 200, dx: 16, dy: 6, role: 'arch', screen: projection };
check(renderToStaticMarkup(<FlightGuidance hud={hud} ko/>).includes('다음 경로'), 'Korean guidance');
check(renderToStaticMarkup(<FlightGuidance hud={hud} ko={false}/>).includes('NEXT PASSAGE'), 'English guidance');
hud.eRemaining = 14; check(renderToStaticMarkup(<FlightGuidance hud={hud} ko/>) === '', 'marker hidden during hyper manoeuvre');
const library = new ModelLibrary(); library.byId = catalog;
let maxPositionError = 0, maxNormalError = 0, vertices = 0, totalSource = 0, totalPrepared = 0;
const representative = ['harbor_working_container_crane', 'village_windmill_miller', 'tower_rooftop_ventilation', 'ski_resort_cable_gondola', 'oil_pumpjack', 'forest_log_loader', 'working_crop_harvester', 'korean_astronomical_waterclock', 'bucket_wheel_excavator'];
const costs: { id: string; lod: number; original: number; prepared: number }[] = [];
const cases = [...catalog.values()].filter(meta => meta.moving && meta.category !== 'aircraft').flatMap(meta => (representative.includes(meta.id) ? [0, 1, 2] as const : [1] as const).filter(lod => meta.exports[('lod' + lod) as 'lod0' | 'lod1' | 'lod2']).map(lod => ({ id: meta.id, lod })));
for (const { id, lod } of cases) {
    const instance = await library.instance(id, lod), plan = await library.prepareAnimation(id, lod);
    const batch = new RigidActorBatching(instance.model, plan);
    check(plan.draws <= plan.sourceDraws, 'rigid drawing cost bounded by source');
    for (const time of [0, .43, 2.1, 7.7]) {
        instance.mixer.setTime(time); batch.sync(); instance.root.updateMatrixWorld(true);
        for (const { mesh, sources } of batch.parts) {
            const actual = mesh.geometry.getAttribute('position'), normal = mesh.geometry.getAttribute('normal');
            const actualNormal = new T.Matrix3().getNormalMatrix(mesh.matrixWorld);
            let offset = 0;
            for (const node of sources) {
                const original = node.geometry.getAttribute('position'), originalNormal = node.geometry.getAttribute('normal');
                const expectedNormal = new T.Matrix3().getNormalMatrix(node.matrixWorld);
                for (let i = 0; i < original.count; i += Math.max(1, Math.floor(original.count / 100))) {
                    const expected = new T.Vector3().fromBufferAttribute(original, i).applyMatrix4(node.matrixWorld);
                    const point = new T.Vector3().fromBufferAttribute(actual, offset + i).applyMatrix4(mesh.matrixWorld);
                    maxPositionError = Math.max(maxPositionError, point.distanceTo(expected));
                    if (normal && originalNormal) maxNormalError = Math.max(maxNormalError, new T.Vector3().fromBufferAttribute(originalNormal, i).applyNormalMatrix(expectedNormal).distanceTo(new T.Vector3().fromBufferAttribute(normal, offset + i).applyNormalMatrix(actualNormal)));
                    for (const name of ['uv', 'color']) {
                        const a = node.geometry.getAttribute(name), b = mesh.geometry.getAttribute(name);
                        if (a) for (let j = 0; j < a.itemSize; j++) check(Math.abs(a.getComponent(i, j) - b.getComponent(offset + i, j)) < 1e-6, 'authored UV/color preserved');
                    }
                    vertices++;
                }
                offset += original.count;
            }
        }
    }
    const prepared = library.animationDraws.get(id + ':' + lod)!;
    totalSource += plan.sourceDraws; totalPrepared += prepared;
    if (representative.includes(id)) costs.push({ id, lod, original: plan.sourceDraws, prepared });
    check(nativeAnimationDistance(catalog.get(id)!, lod, 'high', prepared) >= nativeAnimationDistance(catalog.get(id)!, lod, 'high'), 'animation range never shortened');
    batch.dispose(); instance.dispose(); library.trim(0); await Promise.resolve();
    check(plan.disposed && !library.animationDraws.size, 'prepared geometry released with source');
    check([...library.references.values()].every(n => n === 0), 'all source leases released');
}
check(maxPositionError < 3e-4 && maxNormalError < 1e-5, 'native poses and normals preserved');
check(totalPrepared <= totalSource && totalPrepared / cases.length <= 8, 'upstream-batched Edition12 actors remain within the native draw budget');
library.dispose();
console.log(JSON.stringify({ sceneQualityChecks: checks, animatedModelLODs: cases.length, sampledVertices: vertices, maxPositionError, maxNormalError, sourceDraws: totalSource, preparedDraws: totalPrepared, costs, cloudInventory, scenery, gpuVerified: false, fpsMeasured: false, status: 'passed' }));
