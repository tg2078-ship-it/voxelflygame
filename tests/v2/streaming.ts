import assert from 'node:assert/strict';
import { createSim, controls, catalog } from './fixtures';
import { AIRCRAFT, baseSpeed, THEMES } from '../../app/airrun/data';
import { PATTERNS, buildEncounter } from '../../app/airrun/patterns';
import { sweepAABB } from '../../app/airrun/collision';
// The first encounter has a longer onboarding lead. Resident bounds must use
// the shorter continuing encounters too, rather than treating every tile as an intro.
const authored = PATTERNS.flatMap(p => [1, 2, 3].map(serial => buildEncounter(p, 0, 1, { byId: catalog }, 11, serial)));
const shortest = Math.min(...authored.map(e => e.length));
const mostObstacles = Math.max(...authored.map(e => e.placements.filter(p => p.collision).length));
const mostPickups = Math.max(...authored.map(e => e.pickups.length));
const summary = [];
let checks = 0;
for (const speed of [40, 60, 90, 120, 180, 250, 400, 600]) {
    const sim = createSim({ seed: 74011, plane: speed >= 180 ? 'falcon' : 'skyhawk', level: speed >= 180 ? 20 : 1 });
    let maxEncounters = 0, maxObstacles = 0, maxPickups = 0;
    const started = performance.now();
    for (let step = 0; step < 30 * 60 * 10; step++) {
        sim.time = step * .1;
        sim.speed = speed;
        sim.z += speed * .1;
        sim.generate();
        assert(sim.nextStart >= sim.z + Math.max(1050, speed * 8), 'ahead horizon at ' + speed);
        assert(sim.encounters.every(e => e.placements.every(p => catalog.has(p.model))), 'all loaded model IDs');
        assert(sim.obstacles.every(o => Number.isFinite(o.position.x) && Number.isFinite(o.position.y) && Number.isFinite(o.position.z)), 'finite obstacle transforms');
        assert(sim.encounters[0].start + sim.encounters[0].length > sim.z - 160, 'behind retention bounded');
        checks += 4;
        maxEncounters = Math.max(maxEncounters, sim.encounters.length);
        maxObstacles = Math.max(maxObstacles, sim.obstacles.length);
        maxPickups = Math.max(maxPickups, sim.pickups.length);
    }
    const encounterBudget = Math.ceil((Math.max(1050, speed * 8) + 320) / shortest) + 2;
    assert(maxEncounters <= encounterBudget && maxObstacles <= encounterBudget * mostObstacles && maxPickups <= encounterBudget * mostPickups, '30 minute arrays remain bounded by the authored horizon: ' + JSON.stringify({ speed, encounterBudget, maxEncounters, maxObstacles, maxPickups, mostObstacles, mostPickups }));
    checks++;
    summary.push({ speed, minutes: 30, distance: Math.round(sim.z), maxEncounters, maxObstacles, maxPickups, cpuMilliseconds: Math.round(performance.now() - started) });
}
for (const speed of [40, 60, 90, 120, 180, 250, 400, 600]) {
    const hit = sweepAABB({ x: 0, y: 10, z: 0 }, { x: 0, y: 10, z: speed / 60 }, { min: { x: -1, y: 9, z: speed / 120 }, max: { x: 1, y: 11, z: speed / 120 + .01 } }, { x: .5, y: .5, z: .5 });
    assert(hit, 'continuous sweep at ' + speed);
    checks++;
}
console.log(JSON.stringify({ streamingChecks: checks, summary, status: 'passed' }, null, 2));
