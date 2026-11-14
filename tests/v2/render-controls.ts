import assert from 'node:assert/strict';
import * as T from 'three';
import { AirrunRenderer } from '../../app/airrun/renderer';
import { DEFAULT_SETTINGS } from '../../app/airrun/data';
import { renderPixelRatio, resolutionFloor } from '../../app/airrun/graphics';
import { useAirrun } from '../../app/airrun/state';
import { createSim } from './fixtures';

// At 100% on a standard display the old floor equalled the starting resolution,
// so enabling adaptive resolution could never recover from sustained GPU load.
const adaptive = { ...DEFAULT_SETTINGS, resolutionScale: 1 as const, adaptiveResolution: true };
assert.equal(renderPixelRatio(adaptive, 1), 1);
assert(resolutionFloor(adaptive, 1) < 1);
for (const quality of ['balanced', 'high', 'ultra'] as const) {
    for (const dpr of [1, 1.5, 2, 3]) {
        const settings = { ...adaptive, quality };
        assert(resolutionFloor(settings, dpr) >= .65);
        assert(resolutionFloor(settings, dpr) < renderPixelRatio(settings, dpr));
        assert.equal(renderPixelRatio(settings, dpr), renderPixelRatio({ ...settings, adaptiveResolution: false }, dpr));
    }
}

// Exercise the real camera method at two world origins. Camera and look target
// must translate together throughout the cinematic, including entry and exit.
useAirrun.setState({ save: { ...useAirrun.getState().save, settings: { ...DEFAULT_SETTINGS, reducedMotion: false } } });
const sim = createSim();
sim.obstacles = [];
sim.eRemaining = 10;
const cameraAt = (offset: number, time: number) => {
    sim.eTime = time;
    const renderer = Object.assign(Object.create(AirrunRenderer.prototype), {
        camera: new T.PerspectiveCamera(60, 16 / 9, .25, 2000),
        planeRoot: new T.Group(), sky: { mesh: new T.Object3D() },
        flightOffset: offset, flightLook: new T.Vector3(), flightCameraReady: false,
        renderPose: null, world: null,
    }) as AirrunRenderer;
    renderer.flightCamera(sim, 1 / 60, 'flying');
    return { position: renderer.camera.position.clone(), look: renderer.flightLook.clone() };
};
for (const time of [0, .7, 2.2, 5, 10, 12.5, 14.2, 15]) {
    const origin = cameraAt(0, time), translated = cameraAt(-80, time);
    assert(Math.abs(translated.position.z - origin.position.z + 80) < 1e-6, 'camera follows floating origin');
    assert(Math.abs(translated.look.z - origin.look.z + 80) < 1e-6, 'cinematic target follows floating origin');
    assert(Math.abs(translated.position.distanceTo(translated.look) - origin.position.distanceTo(origin.look)) < 1e-6, 'cinematic framing is invariant');
}
console.log(JSON.stringify({ adaptiveResolutionCases: 12, cinematicOriginCases: 8, status: 'passed', gpuVerified: false }));
