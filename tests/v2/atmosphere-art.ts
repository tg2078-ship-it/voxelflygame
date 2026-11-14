import assert from 'node:assert/strict';
import * as T from 'three';
import { skyHorizonColor } from '../../app/airrun/atmosphere';
import { buildCloudCells, cloudField } from '../../app/airrun/cloud-field';
import { createSky, createWater } from '../../app/airrun/shaders';

let checks = 0;
const check = (condition: unknown, message: string) => { assert(condition, message); checks++; };
const luminance = (c: T.Color) => c.r * .2126 + c.g * .7152 + c.b * .0722;
const day = skyHorizonColor(0, .12, 0, 0), sunset = skyHorizonColor(0, .12, 1, 0), dawn = skyHorizonColor(0, .12, 1, 1), night = skyHorizonColor(1, .12, 0, 0);
check(day.b > day.r * 2 && day.g > day.r * 1.7, 'clear atmosphere retains a blue maritime horizon rather than white wash');
check(sunset.r > sunset.g * 2 && dawn.g > sunset.g * 1.35, 'sunrise and sunset have distinct amber/rose light');
check(luminance(night) < luminance(day) * .15, 'night aerial perspective is dark enough to preserve illuminated silhouettes');
check(luminance(skyHorizonColor(0, 1, 0, 0)) < luminance(day), 'storm atmosphere is visibly darker than clear sky');

const inventory = [];
for (const [budget, expectedFormations] of [[650, 20], [900, 24], [2600, 32], [5200, 32]]) {
    const started = performance.now(), cells = buildCloudCells(44171, budget);
    const buildMs = performance.now() - started;
    check(cells.length <= budget && cells.length > budget * .55, 'fixed voxel budget at ' + budget);
    check(new Set(cells.map(c => c.cloud)).size === expectedFormations, 'complete formation count at ' + budget);
    const heights: number[] = [];
    for (let cloud = 0; cloud < expectedFormations; cloud++) {
        const group = cells.filter(c => c.cloud === cloud), visited = new Set([0]), queue = [0];
        while (queue.length) {
            const a = group[queue.pop()!];
            group.forEach((b, i) => {
                if (visited.has(i)) return;
                const adjacent = Math.abs(a.x - b.x) / a.sx + Math.abs(a.y - b.y) / a.sy + Math.abs(a.z - b.z) / a.sz;
                if (adjacent < 1.01) { visited.add(i); queue.push(i); }
            });
        }
        check(visited.size === group.length, 'cloud silhouette remains a solid connected volume');
        const min = Math.min(...group.map(c => c.y - c.sy / 2)), max = Math.max(...group.map(c => c.y + c.sy / 2));
        check(min > 90 && max - min > 26, 'cloud volume has substantial depth above the flight corridor');
        heights.push(max);
    }
    check(Math.max(...heights) - Math.min(...heights) > 100, 'cumulus and high anvil layers have distinct skyline heights');
    inventory.push({ budget, cells: cells.length, triangles: cells.length * 12, buildMs: +buildMs.toFixed(2) });
}
const field = cloudField(44171); field.setQuality(5200); field.update(0, .12, 0, 0, 0, 0);
check(field.mesh.count <= 5200 && field.mesh.instanceMatrix.array.byteLength === 5200 * 16 * 4, 'all cloud quality levels share one fixed GPU instance buffer');
check(field.mesh.geometry.index!.count / 3 * field.mesh.count <= 62400, 'cloud triangle cost remains bounded independently of flight distance');
const color = new T.Color(), colors = field.mesh.instanceColor!, brightness: number[] = [];
for (let i = 0; i < field.mesh.count; i++) { color.fromBufferAttribute(colors, i); brightness.push(luminance(color)); }
check(Math.max(...brightness) - Math.min(...brightness) > .55, 'rendered voxel colors contain illuminated crowns and shaded bases');
const cloudMaterial = field.mesh.material as T.MeshStandardMaterial, daylightFill = cloudMaterial.emissiveIntensity;
check(daylightFill > .5 && luminance(cloudMaterial.emissive) > .9, 'daylight multiple-scatter fill keeps downward cloud faces readable');
field.update(0, .12, 0, 0, 1, 0);
check(cloudMaterial.emissiveIntensity > daylightFill * 1.3, 'low golden sun retains luminous cloud crowns and violet bases');
field.update(0, .12, 1, 0, 0, 0);
check(cloudMaterial.emissiveIntensity < daylightFill * .25, 'night scatter fill follows the dark moonlit palette');
field.dispose();

const sky = createSky(), water = createWater();
check(sky.uniforms.uSun.value instanceof T.Vector3 && water.uniforms.uSun.value instanceof T.Vector3, 'sky and water keep shared sunlight direction controls');
check(water.uniforms.uCoastal.value === 1 && water.uniforms.uShorePhase.value === 0, 'shoreline shader controls have deterministic standalone defaults');
check(water.mesh.geometry.index!.count / 3 === 20000, 'richer water keeps the original single 20000 triangle grid');
sky.mesh.geometry.dispose(); sky.material.dispose(); water.mesh.geometry.dispose(); water.material.dispose();
console.log(JSON.stringify({ atmosphereArtChecks: checks, cloudInventory: inventory, gpuVerified: false, status: 'passed' }));
