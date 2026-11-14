import assert from 'node:assert/strict';
import * as T from 'three';
import { buildCloudCells, cloudField } from '../../app/airrun/cloud-field';
import { skyHorizonColor } from '../../app/airrun/atmosphere';
import { createWater } from '../../app/airrun/shaders';
import { FlightFX, advanceDebris } from '../../app/airrun/fx';
import { createSim } from './fixtures';
let checks = 0;
const check = (condition: unknown, label: string) => { assert.ok(condition, label); checks++; };
const luminance = (c: T.Color) => c.r * .2126 + c.g * .7152 + c.b * .0722;
const day = luminance(skyHorizonColor(0, .25, 0, 0)), night = luminance(skyHorizonColor(1, .25, 0, 0));
check(night > .025 && night < day * .15, 'Night horizon preserves a navigable blue silhouette while remaining distinct from day');
const water = createWater();
check(water.uniforms.uFogDensity.value > 0 && water.uniforms.uFogDensity.value < .001, 'Water accepts the same aerial density as the physical scene');
check(water.uniforms.uRange.value >= 1600, 'Standalone water no longer turns to solid horizon fog at 850 m');
water.mesh.geometry.dispose(); water.material.dispose();
for (const budget of [650, 900, 2600, 5200]) {
    const data = buildCloudCells(73119, budget), groups = new Set(data.map(cell => cell.cloud));
    check(data.length <= budget && groups.size >= 20 && groups.size <= 32, 'Complete cloud volume stays inside the fixed quality budget');
    check(data.length / groups.size >= 28, 'Lower quality retains enough cells per formation to avoid flat slabs');
    const field = cloudField(73119); field.setQuality(budget); field.update(40, 1, 1, 400, 0, 0);
    const matrix = new T.Matrix4(); let bottom = Infinity;
    for (let n = 0; n < field.mesh.count; n++) { field.mesh.getMatrixAt(n, matrix); bottom = Math.min(bottom, matrix.elements[13] - matrix.elements[5] / 2); }
    check(bottom > 110, 'Even storm clouds leave clear vertical space above the 76 m cinematic envelope');
    field.dispose();
}
const references = [30, 60, 144].map(fps => {
    const p = new T.Vector3(4, 28, -12), v = new T.Vector3(18, 14, -25);
    for (let frame = 0; frame < fps; frame++) advanceDebris(p, v, 1 / fps);
    return { p, v };
});
for (const sample of references.slice(1)) {
    check(sample.p.distanceTo(references[0].p) < 1e-9 && sample.v.distanceTo(references[0].v) < 1e-9, 'Ballistic feedback follows the same trajectory at 30, 60 and 144 Hz');
}
const stalled = new T.Vector3(4, 28, -12), velocity = new T.Vector3(18, 14, -25);
advanceDebris(stalled, velocity, 1);
check(stalled.distanceTo(references[0].p) < 1e-9, 'A long frame cannot exaggerate the debris trajectory');
const unchanged = stalled.clone(); advanceDebris(stalled, velocity, NaN); advanceDebris(stalled, velocity, -1);
check(stalled.equals(unchanged), 'Invalid or reversed presentation time cannot corrupt particles');
const sim = createSim(), fx = new FlightFX(new T.Scene()), plane = new T.Object3D();
sim.pickups = []; fx.update(sim, 0, plane);
check([...fx.items.values()].every(mesh => !mesh.visible) && !fx.parts.visible && !fx.smoke.visible && !fx.vapour.visible && !fx.pulse.visible && fx.trails.every(mesh => !mesh.visible), 'Idle flight omits empty pickup, debris, plume, wake and pulse draws');
fx.event('operation-complete', { x: 5, y: 27, z: 100 }, sim);
check(fx.particles.length === 24, 'A completed operation creates actual visible world feedback');
sim.z = 150; fx.update(sim, .05, plane);
check(fx.parts.visible && fx.pulse.visible && fx.pulse.position.x === 5 && fx.pulse.position.y === 27 && fx.pulse.position.z === 50, 'Success pulse stays anchored where earned across floating origin motion');
fx.update(sim, 4, plane);
check(!fx.parts.visible && !fx.pulse.visible && fx.particles.length === 0, 'Expired success feedback releases all live submissions');
fx.event('precision', { x: 3, y: 26, z: 160 }, sim);
check(fx.particles.length === 16, 'Precision is distinguished from an ordinary passage by real feedback');
fx.particles.length = 0;
fx.event('flow-bank', { x: 3, y: 26, z: 160 }, sim); fx.update(sim, .05, plane);
check(fx.particles.length === 32 && (fx.pulse.material as T.MeshBasicMaterial).opacity <= .36 && fx.flash.intensity === 0, 'Banking flow produces a distinct blue payoff without an extra light flash');
fx.dispose();
const reducedSim = createSim({ settings: { ...sim.config.settings, reducedMotion: true } }), reduced = new FlightFX(new T.Scene());
reduced.event('operation-complete', { x: 0, y: 24, z: 0 }, reducedSim); reducedSim.eRemaining = 15; reduced.update(reducedSim, .05, plane);
check(reduced.particles.length < 12 && reduced.flash.intensity <= 14 && (reduced.pulse.material as T.MeshBasicMaterial).opacity <= .16, 'Reduced motion scales burst count, flash and pulse together without hiding gameplay pickups');
reduced.dispose();
console.log(JSON.stringify({ visualReadabilityChecks: checks, debrisRates: [30, 60, 144], emptySubmissionsSkipped: true, gpuVerified: false, status: 'passed' }));
