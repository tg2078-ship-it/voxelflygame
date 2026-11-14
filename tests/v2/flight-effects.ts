import assert from 'node:assert/strict';
import * as T from 'three';
import { ParticleTrace } from '../../app/airrun/particle-trace';
import { FlightFX } from '../../app/airrun/fx';
import { cloudField, buildCloudCells } from '../../app/airrun/cloud-field';
import { themeCollection } from '../../app/airrun/model-collection';
import { catalog, createSim } from './fixtures';

let checks = 0;
const check = (condition: unknown, message: string) => { assert(condition, message); checks++; };
const snapshots = [30, 60, 144].map(fps => {
    const sim = createSim(), fx = new FlightFX(new T.Scene()), plane = new T.Object3D();
    sim.boost = 1; sim.hp = sim.maxHp * .4;
    for (let frame = 0; frame <= fps * 4; frame++) {
        const time = frame / fps;
        sim.z = time * 90;
        fx.update(sim, frame ? 1 / fps : 0, plane, [], 'balanced', { x: time * 2, y: 24 + time, z: sim.z }, time);
    }
    check(fx.vapourHistory.length >= 45 && fx.smokeHistory.length >= 49, 'complete engine plume and damage smoke at ' + fps + ' FPS');
    check(fx.vapour.geometry.drawRange.count === fx.vapourHistory.length, 'live particles only in GPU draw range');
    const snapshot = { vapour: structuredClone(fx.vapourHistory), smoke: structuredClone(fx.smokeHistory) };
    // Release: history must fade in place, rather than vanish or keep emitting.
    sim.boost = 0; sim.hp = sim.maxHp;
    fx.update(sim, .05, plane, [], 'balanced', { x: 8, y: 28, z: sim.z }, 4.05);
    check(fx.vapourHistory.length > 0 && fx.vapourHistory.every(p => p.born <= 4 + 1e-8), 'boost release retains only fading particles');
    fx.update(sim, 3.6, plane, [], 'balanced', { x: 8, y: 28, z: sim.z }, 7.65);
    check(fx.vapourHistory.length === 0 && fx.smokeHistory.length === 0 && fx.vapour.geometry.drawRange.count === 0, 'engine and damage effects fully expire');
    fx.dispose();
    return snapshot;
});
for (const type of ['vapour', 'smoke'] as const) for (const snapshot of snapshots.slice(1)) {
    check(snapshot[type].length === snapshots[0][type].length, type + ' particle count is independent of frame rate');
    snapshot[type].forEach((p, i) => {
        const expected = snapshots[0][type][i];
        check(Math.abs(p.x - expected.x) < 1e-7 && Math.abs(p.y - expected.y) < 1e-7 && Math.abs(p.z - expected.z) < 1e-7 && Math.abs(p.life - expected.life) < 1e-7, type + ' traces the same world positions and ages');
    });
}
const trace = new ParticleTrace(.035, 1.6, 64);
trace.update({ x: 0, y: 0, z: 0 }, 0, false);
trace.update({ x: 100, y: 50, z: 500 }, 1, true);
check(trace.samples.length === 1 && trace.samples[0].x === 100 && trace.samples[0].born === 1, 'reactivation does not emit a phantom trace across idle motion');
const paused = JSON.stringify(trace.samples);
trace.update({ x: 100, y: 50, z: 500 }, 1, true);
check(JSON.stringify(trace.samples) === paused, 'same active clock does not age or duplicate particles');
trace.update({ x: 500, y: 80, z: 50000 }, 1000, true);
check(trace.samples.length <= 64 && trace.samples.every(p => p.life > 0 && Number.isFinite(p.z)), 'stalled frame has bounded live work');
trace.update({ x: 0, y: 0, z: 0 }, 0, true);
check(trace.samples.length === 1 && trace.samples[0].z === 0, 'new run resets a rewound clock without old flight particles');

const sim = createSim(), fx = new FlightFX(new T.Scene()), plane = new T.Object3D();
sim.motionTime = 100; sim.z = 6000; sim.speed = 40;
fx.update(sim, 0, plane, [], 'high', { x: 0, y: 24, z: 6000 }, 100);
const rainTravel = fx.rainMaterial.uniforms.uTravel.value, ashTravel = fx.environment.ash.material.uniforms.uTravel.value;
sim.speed = 250;
fx.update(sim, 0, plane, [], 'high', { x: 0, y: 24, z: 6000 }, 100);
check(fx.rainMaterial.uniforms.uTravel.value === rainTravel && fx.environment.ash.material.uniforms.uTravel.value === ashTravel, 'speed change without travel cannot teleport rain or volcanic ash');
fx.update(sim, 1 / 60, plane, [], 'high', { x: 0, y: 24, z: 6003 }, 100 + 1 / 60);
check(Math.abs(fx.rainMaterial.uniforms.uTravel.value - rainTravel - 2.1) < 1e-8, 'rain follows actual interpolated distance');
check(Math.abs(fx.environment.ash.material.uniforms.uTravel.value - ashTravel - 2.4) < 1e-8, 'ash follows actual interpolated distance');
check(!fx.rain.visible, 'clear sky skips transparent precipitation draw');
sim.weather.rain = .68; fx.update(sim, 0, plane);
check(fx.rain.visible && fx.rainMaterial.uniforms.uAmount.value === .68, 'rain state enables visible precipitation');
sim.weather.snow = true; sim.weather.rain = 0; fx.update(sim, 0, plane);
check(fx.rain.visible && fx.rainMaterial.uniforms.uSnow.value === 1, 'snow remains visible in polar weather');
fx.dispose();

const clouds = cloudField(73119), cells = buildCloudCells(73119, 900), matrix = new T.Matrix4(); clouds.setQuality(900);
const extent = (amount: number, warm = 0, dawn = 0) => {
    clouds.update(10, amount, 0, 400, warm, dawn);
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < cells.length; i++) if (cells[i].cloud === 0) {
        clouds.mesh.getMatrixAt(i, matrix); min = Math.min(min, matrix.elements[12] - matrix.elements[0] / 2); max = Math.max(max, matrix.elements[12] + matrix.elements[0] / 2);
    }
    return max - min;
};
check(extent(.92) > extent(.12) * 1.5, 'overcast expands actual complete cloud coverage');
extent(.3); const daylight = clouds.mesh.instanceColor!.array.slice();
extent(.3, 1, 0); const sunset = clouds.mesh.instanceColor!.array.slice();
extent(.3, 1, 1); const dawn = clouds.mesh.instanceColor!.array.slice();
check(daylight.some((value, i) => Math.abs(value - sunset[i]) > .05), 'sunset changes rendered cloud gradient');
check(dawn.some((value, i) => Math.abs(value - sunset[i]) > .02), 'sunrise and sunset have distinct rendered cloud colors');
clouds.dispose();
const volcanic = themeCollection('volcano', catalog);
check(volcanic.length >= 8 && volcanic.some(m => m.id === 'columnar_basalt_outcrop'), 'volcanic deck contains actual basalt and geological variety');
check(!volcanic.some(m => /excavator|solar|caravan|pump|outpost|mine|oil/.test(m.id)), 'volcano does not inherit unrelated desert machinery and settlements');
check(themeCollection('desert', catalog).some(m => m.id === 'desert_solar_tracking_field'), 'desert machinery remains in its proper theme');
console.log(JSON.stringify({ flightEffectsChecks: checks, testedFPS: [30, 60, 144], gpuVerified: false, status: 'passed' }));
