import { catalog, proxies, createSim, controls } from './fixtures';
import { PATTERNS, buildEncounter } from '../../app/airrun/patterns';
import { obstacleContact } from '../../app/airrun/collision';
import type { Obstacle } from '../../app/airrun/types';
const errors = [];
for (const p of PATTERNS) {
    const e = buildEncounter(p, 0, 42, { byId: catalog }, 11, 1);
    const obs: Obstacle[] = e.placements.filter(p => p.collision).map((p, i) => ({ id: i, model: p.model, position: { x: p.x, y: p.y, z: p.z }, scale: { x: p.sx, y: p.sy, z: p.sz }, yaw: p.yaw, size: { x: catalog.get(p.model)!.bounds.size[0] * p.sx, y: catalog.get(p.model)!.bounds.size[1] * p.sy, z: catalog.get(p.model)!.bounds.size[2] * p.sz }, small: !!p.small, role: p.role, hit: false, scored: false }));
    for (const [j, r] of e.route.entries()) {
        const from = { x: r.x, y: r.y, z: r.z - 30 }, to = { x: r.x, y: r.y, z: r.z + 30 };
        for (const o of obs) {
            const hit = obstacleContact(o, catalog.get(o.model)!, proxies.get(o.model), from, to, { x: 3.74, y: 1.05, z: 2 });
            if (hit)
                errors.push({ pattern: p.id, action: p.steps[j][0], model: o.model, x: r.x, y: r.y, t: hit.t });
        }
    }
}
let dead = 0;
let first = 0;
let latest = 0;
for (let seed = 0; seed < 100; seed++) {
    const sim = createSim({ seed });
    const input = controls();
    for (let n = 0; n < 2700 && !sim.failed; n++)
        sim.step(1 / 60, input);
    if (sim.failed) {
        dead++;
        first += sim.time;
        latest = Math.max(latest, sim.time);
    }
}
console.log(JSON.stringify({ centerSweepErrors: errors.length, examples: errors.slice(0, 30), noInput: { failedWithin45s: dead, mean: first / dead, latest } }, null, 2));
import assert from 'node:assert/strict';
assert.equal(errors.length, 0, 'Every required opening must have a collision-free central passage.');
assert(dead >= 95, 'At least 95 of 100 unattended runs must fail within 45 seconds.');
