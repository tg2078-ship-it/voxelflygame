import assert from 'node:assert/strict';
import { AIRCRAFT, DEFAULT_SETTINGS, freshSave, stats } from '../../app/airrun/data';
import { DIFFICULTIES, type Difficulty } from '../../app/airrun/encounter-director';
import { parseSave, validateResult, useAirrun } from '../../app/airrun/state';
import { ensureQuests } from '../../app/airrun/progression';
import { validateReachability } from '../../app/airrun/patterns';
import { obstacleContact } from '../../app/airrun/collision';
import { catalog, proxies, createSim } from './fixtures';
let checks = 0;
const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
const fingerprints = new Set<string>();
for (const difficulty of Object.keys(DIFFICULTIES) as Difficulty[])
    for (const plane of AIRCRAFT)
        for (const seed of [13, 42, 731]) {
            const sim = createSim({ seed, plane: plane.id, settings: { ...DEFAULT_SETTINGS, difficulty } });
            check(Math.abs(sim.performance.speed - stats(plane, 1).speed * DIFFICULTIES[difficulty].speedMultiplier) < 1e-9, 'Difficulty changes actual physical speed');
            check(sim.difficulty === difficulty && sim.result().difficulty === difficulty, 'Run freezes and records chosen difficulty');
            check(validateResult(sim.result()), 'New run result passes strict save validation');
            const first = sim.encounters[0];
            check(first.id.startsWith('proc:'), 'The first encounter uses the seeded grammar');
            check(validateReachability(first, sim.speed, sim.performance.handling, plane.span, { x: 0, y: 24, z: 0 }), 'Every sampled aircraft can reach its first procedural route');
            if (plane.id === AIRCRAFT[0].id) fingerprints.add(JSON.stringify(first.route));
            // Independently sweep the opening's actual collision proxies, including
            // all motion envelope phases, rather than trusting generator flags.
            const knots = [{ x: 0, y: 24, z: 0 }, ...first.route.flatMap(r => [{ x: r.x, y: r.y, z: r.z - 60 }, { x: r.x, y: r.y, z: r.z + 60 }])];
            for (let j = 1; j < knots.length; j++) for (const obstacle of sim.obstacles) {
                if (obstacle.position.z > first.start + first.length) continue;
                for (const direction of obstacle.moving ? [-1, 0, 1] : [0]) {
                    const pose = { ...obstacle, position: { ...obstacle.position } };
                    if (pose.moving) pose.position[pose.moving.axis] += direction * pose.moving.amplitude;
                    check(!obstacleContact(pose, catalog.get(pose.model)!, proxies.get(pose.model), knots[j - 1], knots[j], { x: plane.span * .34, y: 1.05, z: plane.length * .25 }), `Procedural opening clears ${pose.model}: ${difficulty}/${plane.id}/${seed}`);
                }
            }
        }
check(fingerprints.size === 9, 'Different seeds and profiles create different first routes');
const easy = createSim({ settings: { ...DEFAULT_SETTINGS, difficulty: 'relaxed' } });
const expert = createSim({ settings: { ...DEFAULT_SETTINGS, difficulty: 'expert' } });
check(easy.speed < expert.speed && easy.encounters[0].length > expert.encounters[0].length, 'Relaxed provides slower speed and more reaction distance');
const daily = createSim({ mode: 'daily', dailyKey: '2026-11-04', settings: { ...DEFAULT_SETTINGS, difficulty: 'expert' } });
check(daily.difficulty === 'standard' && daily.performance.speed === stats(daily.plane, 1).speed, 'Daily ignores lobby difficulty and locks standard physics');
check(validateResult(daily.result()) && !validateResult({ ...daily.result(), difficulty: 'expert' }), 'Daily integrity rejects nonstandard records');
const legacy = ensureQuests(freshSave());
delete legacy.settings.difficulty;
check(parseSave(legacy)?.settings.difficulty === 'standard', 'Existing saves migrate without losing progress');
check(parseSave({ ...legacy, settings: { ...legacy.settings, difficulty: 'impossible' } }) === null, 'Corrupt difficulty is rejected');
useAirrun.setState({ save: ensureQuests(freshSave()), phase: 'hangar' });
useAirrun.getState().settings({ difficulty: 'relaxed' });
check(useAirrun.getState().save.settings.difficulty === 'relaxed', 'UI setting changes persist in state');
useAirrun.getState().settings({ difficulty: 'invalid' as Difficulty });
check(useAirrun.getState().save.settings.difficulty === 'relaxed', 'Unsupported runtime setting is rejected');
// A live settings object may change for graphics and audio. Difficulty is fixed
// until the next run, preventing midflight speed or generation exploits.
easy.config.settings.difficulty = 'expert';
easy.generate(2200);
check(easy.difficulty === 'relaxed' && easy.performance.speed === stats(easy.plane, 1).speed * .88, 'Midflight settings cannot relabel or accelerate a run');
console.log(JSON.stringify({ difficultyChecks: checks, sampledOpenings: 198, distinctFirstRoutes: fingerprints.size, gpuVerified: false, status: 'passed' }));
