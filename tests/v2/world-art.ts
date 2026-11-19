import assert from 'node:assert/strict';
import * as T from 'three';
import { THEMES } from '../../app/airrun/data';
import { GRAPHICS, AIRSPACE } from '../../app/airrun/graphics';
import { terrainGeometry } from '../../app/airrun/terrain';
import { terrainSurfaceColor } from '../../app/airrun/terrain-palette';
import { harborAt, offshoreIslandX, terrainElevation, renderedTerrainHeight, WATER_LEVEL } from '../../app/airrun/world-ground';
import { landscapePlacements } from '../../app/airrun/landscape';
import { catalog } from './fixtures';

let checks = 0, maximumVertices = 0;
const check = (value: unknown, label: string) => { assert(value, label); checks++; };
const builds: { theme: string; quality: string; vertices: number; milliseconds: number }[] = [];
for (const theme of THEMES) for (const quality of ['balanced', 'high', 'ultra'] as const) {
    const profile = GRAPHICS[quality], start = performance.now();
    const geometry = terrainGeometry(128, theme.id, 42, 0, profile.terrainCell);
    const positions = geometry.getAttribute('position'), colors = geometry.getAttribute('color');
    const elapsed = performance.now() - start;
    check(positions.count <= (quality === 'balanced' ? 10000 : quality === 'high' ? 20000 : 35000), 'art detail keeps the existing bounded terrain topology');
    check(positions.array.every(Number.isFinite) && colors.array.every(value => Number.isFinite(value) && value >= 0 && value <= 1), 'valid terrain positions and linear colors');
    maximumVertices = Math.max(maximumVertices, positions.count);
    const material = new T.MeshBasicMaterial({ side: T.DoubleSide }), mesh = new T.Mesh(geometry, material);
    mesh.position.z = -128; mesh.updateMatrixWorld(true);
    for (const x of [-370.1, -180.3, -24.1, 0, 31.4, 41.7, 94.3, 237.8, 416.1]) {
        const z = 173.2, hit = new T.Raycaster(new T.Vector3(x, 300, -z), new T.Vector3(0, -1, 0)).intersectObject(mesh)[0];
        check(hit && Math.abs(hit.point.y - renderedTerrainHeight(x, z, theme.id, 42, 0, profile.terrainCell)) < .0001, 'art relief remains the actual rooted terrain triangle');
    }
    const props = landscapePlacements(1, theme.id, 0, 42, quality, catalog);
    check(props.length <= profile.landscapePlacements && props.length > 0, 'natural scenery obeys its explicit instance cap');
    assert.deepEqual(props, landscapePlacements(1, theme.id, 0, 42, quality, catalog)); checks++;
    for (const p of props) {
        const meta = catalog.get(p.model)!, reach = (Math.abs(Math.cos(p.yaw)) * meta.bounds.size[0] + Math.abs(Math.sin(p.yaw)) * meta.bounds.size[2]) * p.sx / 2;
        check(!p.collision && p.role === 'landscape' && Math.abs(p.x) - reach >= AIRSPACE.halfWidth + 13.99, 'layered backdrop never steals playable airspace or adds hidden collision');
        check(p.y + meta.bounds.min[1] * p.sy <= renderedTerrainHeight(p.x, p.z, theme.id, 42, 0, profile.terrainCell) + .001, 'landscape feet remain planted in their actual geometry');
    }
    builds.push({ theme: theme.id, quality, vertices: positions.count, milliseconds: Math.round(elapsed * 100) / 100 });
    geometry.dispose(); material.dispose();
}
for (const seed of [13, 42, 44171]) {
    const exposed = [0, 0, 0];
    for (let z = 0; z < 6000; z += 96) {
        for (const x of [-28, -14, 0, 14]) check(terrainElevation(x, z, 'coast', seed) === -3.6, 'offshore relief never moves into the mandatory flight corridor');
        for (let chain = 0; chain < 3; chain++) {
            const x = offshoreIslandX(z, seed, chain);
            check(x < -112, 'every island chain is geographically outside the route');
            if (terrainElevation(x, z, 'coast', seed) > WATER_LEVEL + 1) exposed[chain]++;
        }
    }
    check(exposed.every(value => value > 10), 'all three distinct island chains appear along the coast');
}
const grass = terrainSurfaceColor('coast', 0, 42, 130, 180, 16, .1), cliff = terrainSurfaceColor('coast', 0, 42, 130, 180, 16, 1.3);
check(grass.g > grass.r * 1.5 && Math.hypot(grass.r - cliff.r, grass.g - cliff.g, grass.b - cliff.b) > .1, 'coast separates saturated vegetation from exposed geological faces');
const snow = terrainSurfaceColor('ice', 0, 42, 100, 180, 2, .1), sand = terrainSurfaceColor('desert', 0, 42, 100, 180, 2, .1);
check(snow.b > snow.r && sand.r > sand.b * 2, 'glacial banks use cold material instead of global beach sand');
const coast = landscapePlacements(1, 'coast', 0, 42, 'high', catalog);
check(coast.some(p => p.x > 0 && p.x < 110) && coast.some(p => p.x > 110 && p.x < 220) && coast.some(p => p.x > 220) && coast.some(p => p.x < -112), 'coastal art occupies foreground, midground, far ridges and offshore islands');
// A quay must have one physical top face, not two coplanar depth competitors.
const quaySeed = [13, 42, 731, 44171].find(seed => harborAt(0, seed))!;
check(quaySeed !== undefined, 'sample includes an actual working quay');
const quayGeometry = terrainGeometry(0, 'coast', quaySeed, 0, 8), quayMaterial = new T.MeshBasicMaterial({ side: T.DoubleSide });
const quayMesh = new T.Mesh(quayGeometry, quayMaterial); quayMesh.updateMatrixWorld(true);
for (let x = 26.3; x < 70; x += 1.3) for (let z = 1.1; z < 127; z += 3.7) {
    const hits = new T.Raycaster(new T.Vector3(x, 10, -z), new T.Vector3(0, -1, 0), 0, 20).intersectObject(quayMesh);
    check(hits.filter(hit => Math.abs(hit.point.y - 2.2) < 1e-4).length === 1, 'quay has exactly one top surface without z-fighting');
}
quayGeometry.dispose(); quayMaterial.dispose();
console.log(JSON.stringify({ worldArtChecks: checks, terrainBuilds: builds, maximumVertices, sceneryCaps: Object.fromEntries(Object.entries(GRAPHICS).map(([quality, profile]) => [quality, profile.landscapePlacements])), gpuVerified: false, fpsMeasured: false, status: 'passed' }));
