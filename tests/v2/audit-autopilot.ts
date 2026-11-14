import { createSim, controls } from './fixtures';
import { routePosition } from '../../app/airrun/trick-path';
import { AIRCRAFT, clamp } from '../../app/airrun/data';
import assert from 'node:assert/strict';
import { obstacleContact } from '../../app/airrun/collision';
import { proxies, catalog } from './fixtures';
const results: any[] = [];
for (const plane of AIRCRAFT)
    for (const level of [1, 10, 20]) {
        const sim = createSim({ plane: plane.id, level, seed: 731 });
        const input = controls();
        let last = { x: 0, y: 24, z: 0 };
        let previous = { x: 0, y: 24, z: 0 };
        // Exercise steering AND the real hold-to-brake control through the first theme transition.
        // Upgraded jets cannot follow a turning route safely using steering alone at full speed.
        for (let f = 0; f < 60 * 240 && !sim.failed; f++) {
            const routes = sim.encounters.flatMap(e => e.route), target = routePosition(routes, sim.z + sim.speed * .30, { x: last.x, y: last.y, z: Math.max(0, sim.encounters[0].start - 90) });
            const dx = target.x - sim.x, dy = target.y - sim.y;
            const raw = (v: number) => Math.sign(v) * (.12 + .88 * Math.pow(Math.min(1, Math.abs(v)), 1 / 1.22));
            input.x = raw(clamp(dx * 3 / (18 * sim.performance.handling), -1, 1));
            input.y = raw(clamp(dy * 3 / (12 * sim.performance.handling), -1, 1));
            input.brake = Math.abs(dx) > 5 || Math.abs(dy) > 4;
            previous = { x: sim.x, y: sim.y, z: sim.z }; sim.step(1 / 60, input);
            last = sim.encounters[0].route.at(-1)!;
        }
        const hit = sim.failed ? sim.obstacles.find(o => obstacleContact(o, catalog.get(o.model)!, proxies.get(o.model), previous, sim, { x: plane.span * .34, y: 1.05, z: plane.length * .25 }, undefined, sim.motionTime)) : undefined;
        results.push({ plane: plane.id, level, time: Math.round(sim.time), distance: Math.round(sim.z), failed: sim.failed, reason: sim.reason, x: sim.x, y: sim.y, collider: hit && { model: hit.model, role: hit.role, position: hit.position }, route: sim.failed ? sim.encounters.flatMap(e => e.route).filter(r => Math.abs(r.z - sim.z) < 230) : undefined });
    }
console.log(JSON.stringify({earlyFailures:results.filter(r => r.time < 240)}));
assert.equal(results.length, AIRCRAFT.length * 3);
assert(results.every(r => r.time >= 240), 'A route-following controller using steering and braking can continue through the first theme transition in every aircraft and tested level.');
console.log(JSON.stringify({ controlledFlights: results.length, minSurvivalSeconds: Math.min(...results.map(r => r.time)), maxSurvivalSeconds: Math.max(...results.map(r => r.time)), humanFunVerified: false, status: 'passed' }));
