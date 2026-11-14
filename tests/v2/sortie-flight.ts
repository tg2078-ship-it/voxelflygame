import assert from 'node:assert/strict';
import { createSim, controls } from './fixtures';
import { routePosition } from '../../app/airrun/trick-path';
import { clamp, DEFAULT_SETTINGS, freshSave } from '../../app/airrun/data';
import { validateResult, parseSave } from '../../app/airrun/state';
import { ensureQuests, applyRun } from '../../app/airrun/progression';
import { SORTIE_COMPLETION_BONUS } from '../../app/airrun/sortie';
import type { Difficulty } from '../../app/airrun/encounter-director';

let checks = 0;
const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
const flights: unknown[] = [];
for (const difficulty of ['relaxed', 'standard', 'expert'] as Difficulty[])
    for (const plane of ['skyhawk', 'beaver', 'falcon', 'amphibian']) {
        const sim = createSim({ mode: 'sortie', plane, seed: 731, settings: { ...DEFAULT_SETTINGS, difficulty } });
        const input = controls();
        let last = { x: 0, y: 24, z: 0 };
        const stages = new Set<string>();
        for (let frame = 0; frame < 60 * 181 && !sim.failed && !sim.completed; frame++) {
            const routes = sim.encounters.flatMap(e => e.route);
            const target = routePosition(routes, sim.z + sim.speed * .30, { x: last.x, y: last.y, z: Math.max(0, sim.encounters[0].start - 90) });
            const dx = target.x - sim.x, dy = target.y - sim.y;
            const raw = (v: number) => Math.sign(v) * (.12 + .88 * Math.pow(Math.min(1, Math.abs(v)), 1 / 1.22));
            input.x = raw(clamp(dx * 3 / (18 * sim.performance.handling), -1, 1));
            input.y = raw(clamp(dy * 3 / (12 * sim.performance.handling), -1, 1));
            input.brake = Math.abs(dx) > 5 || Math.abs(dy) > 4;
            sim.step(1 / 60, input);
            last = sim.encounters[0].route.at(-1)!;
            stages.add(sim.sortie!.hud().stage.id);
        }
        const result = sim.result();
        check(sim.completed && !sim.failed, `${difficulty}/${plane} follows native geometry to the real finish: ${sim.reason} @${sim.time}`);
        check(stages.size === 5, 'The controller flies through all five stages');
        check(result.sortie?.elapsed === 180 && result.sortie.completed && result.sortie.bonus === SORTIE_COMPLETION_BONUS, 'Real flight emits one fixed completion award');
        check(!result.interrupted && validateResult(result), 'A natural finish passes the real save validator');
        const before = { time: sim.time, bonus: sim.bonus, z: sim.z, flow: result.debrief?.vault };
        sim.step(1, input); sim.bankFlow(); sim.observeModel('rocky_arch');
        check(JSON.stringify(before) === JSON.stringify({ time: sim.time, bonus: sim.bonus, z: sim.z, flow: sim.result().debrief?.vault }), 'Completed flight cannot continue physics, bank twice or discover new score');
        const save = ensureQuests(freshSave()), settled = applyRun(save, result);
        check(applyRun(settled, result).coins === settled.coins && parseSave(settled) !== null, 'Completed sortie settles once and round-trips through storage');
        check(!settled.bests.all && !settled.bests.allE, 'Paced sortie cannot overwrite endless records');
        flights.push({ difficulty, plane: sim.plane.id, seconds: sim.time, score: result.score, stages: [...stages] });
    }

// Failure/controlled exit are real integration paths, never completion shortcuts.
const early = createSim({ mode: 'sortie' });
early.step(1 / 60, controls());
const exit = early.result(true, true);
check(!exit.sortie?.completed && exit.sortie?.bonus === 0 && validateResult(exit), 'Early return does not receive a finish bonus');
early.fail('테스트 충돌', 'TEST IMPACT', early);
check(!early.result().sortie?.completed && validateResult(early.result()), 'A failed sortie remains a valid incomplete record');

// Pure ledger timing is independent of the visual bank affordance.
const bonus = createSim({ mode: 'sortie' });
check(bonus.adventure.routeChoice('native-gate', 90), 'Verified alternate passage creates an exposed reserve');
check(!bonus.adventure.routeChoice('native-gate', 90) && bonus.adventure.hud()!.vault!.pending === 90, 'Same alternate passage cannot deposit twice');
bonus.effects.set('multiplier', 5);
check(bonus.adventure.routeChoice('second-native-gate', 90) && bonus.adventure.hud()!.vault!.pending === 270, 'Choice value uses the multiplier at the time of crossing');
bonus.effects.delete('multiplier');
const paid = bonus.adventure.finish(), again = bonus.adventure.finish();
check(paid === 270 && again === 0 && bonus.adventure.hud()!.vault!.banks === 0 && bonus.bonus === 270, 'Automatic finish secures flow exactly once without manufacturing a manual bank');
const hyper = createSim({ mode: 'sortie' });
hyper.adventure.hyperStart();
check(!hyper.adventure.routeChoice('cinematic', 90), 'Cinematic cannot farm route-choice reserves');

console.log(JSON.stringify({ sortieFlightChecks: checks, controlledNativeFlights: flights, humanFunVerified: false, status: 'passed' }));
