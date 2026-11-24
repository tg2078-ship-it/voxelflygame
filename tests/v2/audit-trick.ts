import { createSim, controls, catalog, proxies } from './fixtures';
import { THEMES, AIRCRAFT } from '../../app/airrun/data';
import { obstacleContact } from '../../app/airrun/collision';
import { checkTrickHandoff } from './trick-checks';
const reports = [];
const started = performance.now();
for (const theme of THEMES)
    for (let variant = 0; variant < (theme.id === 'korea' ? 4 : 1); variant++)
        for (const aircraft of AIRCRAFT) {
            const sim = createSim({ plane: aircraft.id, practice: { theme: theme.id, variant, plane: aircraft.id, level: 1, night: false, weather: 'clear' } });
            sim.z = 140;
            sim.generate();
            sim.x = sim.encounters[0].route[0].x * .45;
            const began = performance.now();
            assert(sim.activateE(), `E activation ${theme.id}/${variant}/${aircraft.id}`);
            const planms = performance.now() - began;
            if (planms > 1000) console.log(JSON.stringify({ slowPlan: theme.id, variant, aircraft: aircraft.id, planms: Math.round(planms) }));
            checkTrickHandoff(sim);
            let solid = 0;
            const inp = controls();
            let previous = { x: sim.x, y: sim.y, z: sim.z };
            for (let f = 0; f < 900; f++) {
                sim.step(1 / 60, inp);
                for (const o of sim.obstacles) {
                    if (obstacleContact(o, catalog.get(o.model)!, proxies.get(o.model), previous, { x: sim.x, y: sim.y, z: sim.z }, { x: sim.plane.span * .34, y: 1.05, z: sim.plane.length * .25 }))
                        solid++;
                }
                previous = { x: sim.x, y: sim.y, z: sim.z };
            }
            reports.push({ theme: theme.id, variant, plane: aircraft.id, clear: sim.ePathClear, solid, eRemaining: sim.eRemaining, planms: Math.round(planms), x: sim.x, y: sim.y, failed: sim.failed });
        }
console.log(JSON.stringify({ cases: reports.length, failures: reports.filter(r => !r.clear || r.solid || r.failed), slowest: [...reports].sort((a,b) => b.planms-a.planms).slice(0,5), maxPlanMilliseconds: Math.max(...reports.map(r => r.planms)), meanPlanMilliseconds: reports.reduce((s, r) => s + r.planms, 0) / reports.length, elapsed: performance.now() - started }, null, 2));
import assert from 'node:assert/strict';
assert.equal(reports.length, AIRCRAFT.length * (THEMES.length + 3));
assert.equal(reports.filter(r => !r.clear || r.solid || r.failed || r.eRemaining !== 0).length, 0, 'E must last exactly 15 seconds without intersecting solids.');
