import assert from 'node:assert/strict';
import { SortieDirector, SORTIE_DURATION, SORTIE_COMPLETION_BONUS, SORTIE_STAGES, sortieStageAt, sortieBestKey, validSortieResult } from '../../app/airrun/sortie';
import { emptyMetrics, freshSave } from '../../app/airrun/data';
import { applyRun, ensureQuests } from '../../app/airrun/progression';
import { parseSave, useAirrun, validateResult } from '../../app/airrun/state';
import type { RunResult } from '../../app/airrun/types';

let checks = 0;
const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
const equal = (a: unknown, b: unknown, label: string) => { assert.deepEqual(a, b, label); checks++; };
const summary = { operations: 3, perfectPasses: 8 };

for (const fps of [30, 60, 144]) {
    const clock = new SortieDirector();
    let finishEdges = 0;
    for (let i = 0; i < fps * 90; i++) finishEdges += +clock.advance(1 / fps, false, summary);
    const beforeE = clock.hud();
    for (let i = 0; i < fps * 15; i++) check(!clock.advance(1 / fps, true, { operations: 999, perfectPasses: 999 }), 'Hyper never advances completion');
    equal(clock.hud(), beforeE, 'Hyper duration and automated events cannot advance the manual sortie clock or goals');
    for (let i = 0; i < fps * 90; i++) finishEdges += +clock.advance(1 / fps, false, summary);
    equal(finishEdges, 1, 'Manual flight reaches one completion edge at different frame rates');
    equal(clock.hud().elapsed, SORTIE_DURATION, 'Completion is exactly 180 manual seconds');
    equal(clock.hud().remaining, 0, 'A finished clock never displays negative time');
    equal(clock.result().bonus, SORTIE_COMPLETION_BONUS, 'Completed metadata reports the fixed finish bonus');
    check(validSortieResult(clock.result()), 'Completed metadata validates');
    const finished = clock.result();
    for (let i = 0; i < 60; i++) check(!clock.advance(1 / fps, false, { operations: 50, perfectPasses: 50 }), 'Finished updates never retrigger a payout');
    equal(clock.result(), finished, 'Finished summaries and payout metadata stay frozen');
}
const invalid = new SortieDirector(), original = invalid.hud();
for (const dt of [0, -1, NaN, Infinity, -Infinity, 1.001, 180]) check(!invalid.advance(dt, false, summary), 'Invalid or catch-up frame cannot complete a sortie');
equal(invalid.hud(), original, 'Rejected frames do not change goals or clock');
invalid.advance(.5, false, summary);
invalid.advance(.5, false, { operations: -1, perfectPasses: NaN });
equal([invalid.hud().operations, invalid.hud().perfectPasses], [3, 8], 'Invalid summaries cannot corrupt counters');
const detached = invalid.hud(); detached.elapsed = 180; detached.operations = 1000;
equal(invalid.hud().elapsed, 1, 'HUD snapshots cannot mutate the running director');
for (const stage of SORTIE_STAGES) {
    equal(sortieStageAt(stage.start).id, stage.id, 'Each stage begins at its documented boundary');
    equal(sortieStageAt(stage.end - .001).id, stage.id, 'Each stage lasts until its boundary');
    check(stage.spacingMultiplier >= 1, 'Pacing never compresses the selected difficulty below its safe base');
    check(Object.isFrozen(stage), 'Stage configuration cannot be changed through HUD snapshots');
}
equal(sortieStageAt(NaN).id, 'departure', 'Invalid progress has a safe initial stage');
equal(sortieStageAt(10000).id, 'extraction', 'Completed progress retains the last stage');

function run(id: string, completed = true): RunResult {
    const elapsed = completed ? 180 : 20, bonus = completed ? 1600 : 400;
    return { id, date: '2026-11-07T00:00:00.000Z', planeId: 'skyhawk', mode: 'sortie', difficulty: 'relaxed',
        distance: 8000, bonus, score: 8000 + bonus, coins: 5, reward: Math.floor(8000 / 30) + Math.floor(bonus / 180) + 5,
        maxCombo: 2, eUsed: false, practice: false, interrupted: !completed, reason: completed ? 'SORTIE COMPLETE' : 'ABORTED',
        metrics: { ...emptyMetrics(), distance: 8000, bonus, coins: 5, maxCombo: 2, time: elapsed },
        debrief: { version: 1, manualSeconds: elapsed, medal: 'bronze', rating: 20, operationsCompleted: 3, operationsExpired: 0, perfectPasses: 8,
            bestFlow: 2, flowActions: 8, operationBonus: 250, precisionBonus: 150, flowBonus: 0, controlDistance: 8000, lowDistance: 0, boostDistance: 0, cleanDistance: 8000,
            vault: { pending: 0, secured: 0, lost: 0, banks: 0, peak: 0 } },
        sortie: { version: 1, duration: 180, elapsed, completed, bonus: completed ? 1200 : 0, operations: 3, perfectPasses: 8 } };
}
const complete = run('complete'), aborted = run('aborted', false);
check(validateResult(complete) && validateResult(aborted), 'Completed and interrupted sorties have valid conserved score records');
for (const patch of [
    { elapsed: 179, completed: true }, { elapsed: 180, completed: false }, { bonus: 0 }, { bonus: 2400 },
    { duration: 90 }, { elapsed: Infinity }, { operations: -1 }, { perfectPasses: .5 }, { version: 2 },
]) check(!validSortieResult({ ...complete.sortie, ...patch }), 'Malformed or unearned sortie metadata is rejected');
check(!validateResult({ ...complete, sortie: undefined }), 'A new sortie record cannot silently omit its clock metadata');
check(!validateResult({ ...complete, mode: 'endless' }), 'Endless cannot borrow sortie bonus metadata');
check(!validateResult({ ...complete, practice: true }), 'Legacy practice cannot masquerade as a paid sortie result');
check(!validateResult({ ...complete, sortie: { ...complete.sortie!, operations: 4 } }), 'Sortie operation summary must match actual debrief');
check(!validateResult({ ...complete, sortie: { ...complete.sortie!, perfectPasses: 9 } }), 'Sortie precision summary must match actual debrief');
check(!validateResult({ ...complete, metrics: { ...complete.metrics, time: 179 } }), 'Completion cannot exceed the flight clock');
check(!validateResult({ ...complete, debrief: { ...complete.debrief!, manualSeconds: 179 } }), 'Hyper time cannot supply missing manual completion time');
const underpaid = { ...complete, bonus: 1599, score: 9599, reward: Math.floor(8000 / 30) + Math.floor(1599 / 180) + 5, metrics: { ...complete.metrics, bonus: 1599 } };
check(!validateResult(underpaid), 'Completion and skill subtotals cannot exceed the conserved total');
check(!validateResult({ ...aborted, sortie: { ...aborted.sortie!, bonus: 1200 } }), 'An interrupted incomplete run cannot claim the finish bonus');
const old = { ...aborted, mode: 'endless' as const }; delete old.sortie;
check(validateResult(old), 'Old endless records remain accepted without sortie metadata');

let save = ensureQuests(freshSave());
save.bests = { all: { distance: 20, score: 30, combo: 1 }, 'skyhawk:normal': { distance: 20, score: 30, combo: 1 } };
const oldBests = structuredClone(save.bests);
save = applyRun(save, complete);
equal(save.bests.all, oldBests.all, 'Finite pacing cannot replace endless global records');
equal(save.bests['skyhawk:normal'], oldBests['skyhawk:normal'], 'Finite pacing cannot replace endless aircraft records');
equal(save.bests[sortieBestKey('relaxed', false)].score, complete.score, 'Sortie score persists in its own difficulty record');
equal(save.bests[sortieBestKey('relaxed', false, 'skyhawk')].distance, complete.distance, 'Aircraft sortie record is isolated too');
equal([save.totals.sortieAttempts, save.totals.sortieCompletions], [1, 1], 'Only genuine completion increments the finish counter');
check(parseSave(save), 'A saved completed sortie round-trips through the backup validator');
equal(applyRun(save, complete), save, 'Repeated settlement cannot duplicate coins, attempts or completions');
save = applyRun(save, { ...aborted, difficulty: 'expert', eUsed: true });
equal([save.totals.sortieAttempts, save.totals.sortieCompletions], [2, 1], 'Interrupted sortie advances attempts but not completion count');
check(!!save.bests[sortieBestKey('expert', true)] && !save.bests[sortieBestKey('expert', false)], 'Expert Hyper record does not leak into normal or relaxed records');
check(parseSave(save), 'Mixed old and new records preserve backup compatibility');

useAirrun.setState({ save: ensureQuests(freshSave()), phase: 'hangar', flightMode: 'endless' });
useAirrun.getState().setFlightMode('sortie');
equal(useAirrun.getState().flightMode, 'sortie', 'Hangar mode selector reaches the new mode');
useAirrun.setState({ phase: 'flying' }); useAirrun.getState().setFlightMode('daily');
equal(useAirrun.getState().flightMode, 'sortie', 'Mode cannot change halfway through a flight');
const checkpoint = run('recovered', false);
checkpoint.debrief!.vault = { pending: 22, secured: 0, lost: 0, banks: 0, peak: 22 };
useAirrun.setState({ phase: 'airport' }); useAirrun.getState().settle(checkpoint);
const recovered = useAirrun.getState().result!;
check(!recovered.sortie!.completed && recovered.sortie!.bonus === 0, 'Checkpoint recovery cannot turn an unfinished flight into completion');
equal(recovered.debrief!.vault, { pending: 0, secured: 0, lost: 22, banks: 0, peak: 22 }, 'Recovery loses pending flow without inventing payout');
const recoveredSave = useAirrun.getState().save;
useAirrun.getState().settle(checkpoint);
equal(useAirrun.getState().save, recoveredSave, 'Recovery settlement is idempotent');
check(parseSave(recoveredSave), 'Recovered unfinished sorties remain valid backups');

console.log(JSON.stringify({ sortieChecks: checks, frameRates: [30, 60, 144], hyperClockExcluded: true, oldSavesPreserved: true, isolatedRecords: true, actualFlightGeometryTested: false, status: 'passed' }));
