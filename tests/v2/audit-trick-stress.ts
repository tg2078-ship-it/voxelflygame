import { createSim, controls, catalog, proxies } from './fixtures';
import { THEMES, AIRCRAFT } from '../../app/airrun/data';
import { pointClear, obstacleContact } from '../../app/airrun/collision';
import { checkTrickHandoff } from './trick-checks';
const report = [];
let rejected = 0, startsInsideGeometry = 0;
for (const speed of [40, 90, 180, 250, 400, 600])
    for (const plane of [AIRCRAFT[0], AIRCRAFT[1], AIRCRAFT[7]])
        for (const theme of [THEMES[0], THEMES[2], THEMES[7]])
            for (const offset of [-130, -40, -12, 20]) {
                const sim = createSim({ seed: 771, plane: plane.id, level: 20, practice: { theme: theme.id, variant: theme.id === 'korea' ? 3 : 0, plane: plane.id, level: 20, night: true, weather: 'rain' } });
                sim.speed = speed;
                sim.z = sim.encounters[0].route[0].z + offset;
                sim.x = sim.encounters[0].route[0].x;
                sim.y = sim.encounters[0].route[0].y;
                sim.generate();
                const r = { x: plane.span * .34, y: 1.05, z: plane.length * .25 };
                if (!pointClear({ x: sim.x, y: sim.y, z: sim.z }, sim.obstacles, catalog, proxies, r)) {
                    startsInsideGeometry++;
                    continue;
                }
                const before = { x: sim.x, y: sim.y, z: sim.z, time: sim.time };
                if (!sim.activateE()) {
                    // A clear point does not prove that a 600m/s aircraft has
                    // enough forward clearance for a collision-free cinematic.
                    assert(!sim.eUsed && sim.eRemaining === 0 && !sim.failed, 'Unsafe activation preserves E');
                    assert.deepEqual({ x: sim.x, y: sim.y, z: sim.z, time: sim.time }, before, 'Refusal cannot move or advance the aircraft');
                    assert(sim.message.length > 0, 'Unsafe activation explains how to retry');
                    rejected++;
                    continue;
                }
                checkTrickHandoff(sim);
                let collision = 0;
                let old = { x: sim.x, y: sim.y, z: sim.z };
                for (let i = 0; i < 900; i++) {
                    sim.step(1 / 60, controls());
                    for (const o of sim.obstacles)
                        if (obstacleContact(o, catalog.get(o.model)!, proxies.get(o.model), old, { x: sim.x, y: sim.y, z: sim.z }, r))
                            collision++;
                    old = { x: sim.x, y: sim.y, z: sim.z };
                }
                report.push({ speed, plane: plane.id, theme: theme.id, offset, clear: sim.ePathClear, collision });
            }
console.log(JSON.stringify({ candidates: report.length + rejected + startsInsideGeometry, activated: report.length, rejectedWithoutSpending: rejected, startsInsideGeometry, failures: report.filter(x => !x.clear || x.collision) }, null, 2));
import assert from 'node:assert/strict';
assert.equal(report.length + rejected + startsInsideGeometry, 216);
assert(report.length >= 100, 'A wide range of high-speed starts must remain available');
assert.equal(report.filter(x => !x.clear || x.collision).length, 0, 'High-speed E paths must clear static and articulated envelopes.');
