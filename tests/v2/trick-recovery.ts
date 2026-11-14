import assert from 'node:assert/strict';
import fs from 'node:fs';
import { catalog, proxies, createSim, controls } from './fixtures';
import { createTrickPath, type PathContext } from '../../app/airrun/trick-path';
import { groundAt } from '../../app/airrun/world-ground';
import { obstacleContact } from '../../app/airrun/collision';
import { AIRCRAFT, THEMES, DEFAULT_SETTINGS } from '../../app/airrun/data';
import { checkTrickHandoff } from './trick-checks';
import type { Difficulty } from '../../app/airrun/encounter-director';

// Snapshot the physical geometry, not the generator: the production grammar is
// intentionally free to evolve while this alternating-obstacle regression stays.
const pinned = JSON.parse(fs.readFileSync(new URL('./fixtures/trick-korea-handoff.json', import.meta.url), 'utf8'));
const context: PathContext = { ...pinned, catalog, proxies, ground: (x, z) => groundAt(x, z, pinned.theme, pinned.seed, pinned.variant) };
const started = performance.now(), path = createTrickPath(context), pinnedMilliseconds = performance.now() - started;
assert(path.clear && path.method === 'direct-validated', 'High bridge and low handoff connect through a continuously proven recovery candidate');
assert(path.strength > 0, 'Recovery can preserve the cinematic when geometry permits its rolling envelope');
const sim = createSim({ plane: 'amphibian', practice: { theme: 'korea', variant: 0, plane: 'amphibian', level: 1, night: false, weather: 'clear' } });
Object.assign(sim, { x: pinned.start.x, y: pinned.start.y, z: pinned.start.z, speed: pinned.speed, obstacles: structuredClone(pinned.obstacles), encounters: [], pickups: [], nextStart: 1e9, ePath: path.knots, ePathClear: true, eUsed: true, eRemaining: 15 });
sim.performance = { ...sim.performance, ...pinned.performance };
checkTrickHandoff(sim);
const radius = { x: sim.plane.span * .34, y: 1.05, z: sim.plane.length * .25 };
for (let frame = 0; frame < 900; frame++) {
    const previous = { x: sim.x, y: sim.y, z: sim.z };
    sim.step(1 / 60, controls());
    for (const obstacle of sim.obstacles)
        assert(!obstacleContact(obstacle, catalog.get(obstacle.model)!, proxies.get(obstacle.model), previous, sim, radius), 'Recovered cinematic never intersects the actual moving geometry');
}
assert(sim.eRemaining === 0 && !sim.failed, 'Recovery preserves the exact fifteen-second immunity boundary');

const cases: { difficulty: Difficulty; theme: string; variant: number; plane: string; milliseconds: number }[] = [];
for (const difficulty of ['relaxed', 'expert'] as const)
    for (const theme of THEMES)
        for (let variant = 0; variant < (theme.id === 'korea' ? 4 : 1); variant++)
            for (const plane of ['sailplane', 'amphibian', 'falcon']) {
                assert(AIRCRAFT.some(aircraft => aircraft.id === plane));
                const flight = createSim({ plane, settings: { ...DEFAULT_SETTINGS, difficulty }, practice: { theme: theme.id, variant, plane, level: 1, night: false, weather: 'clear' } });
                assert.equal(flight.difficulty, difficulty, 'Requested difficulty reaches the actual frozen simulation profile');
                flight.z = 140; flight.generate(); flight.x = flight.encounters[0].route[0].x * .45;
                const began = performance.now();
                assert(flight.activateE(), `Initial recovery remains available: ${difficulty}/${theme.id}/${variant}/${plane}`);
                checkTrickHandoff(flight);
                cases.push({ difficulty, theme: theme.id, variant, plane, milliseconds: performance.now() - began });
            }
assert.equal(cases.length, 96);
console.log(JSON.stringify({ recoveryCases: cases.length, pinnedRecoveryMilliseconds: Math.round(pinnedMilliseconds), maximumPlanMilliseconds: Math.round(Math.max(...cases.map(result => result.milliseconds))), fullCinematicSteps: 900, independentHandoffs: cases.length + 1, status: 'passed' }));
