import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { dailyBest, dailyRoute, dailySeed, DAILY_RECORD_LIMIT, validDailyRecords } from '../../app/airrun/daily-route';
import { emptyMetrics, freshSave } from '../../app/airrun/data';
import { applyRun, ensureQuests } from '../../app/airrun/progression';
import { parseSave, persistSave, useAirrun, validateResult } from '../../app/airrun/state';
import { createSim } from './fixtures';
import type { RunResult } from '../../app/airrun/types';

const memory = new Map<string, string>();
Object.assign(globalThis, {
    localStorage: { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value), removeItem: (key: string) => memory.delete(key) },
    matchMedia: () => ({ matches: false }),
});
let checks = 0;
const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
const eq = (actual: unknown, expected: unknown, label: string) => { assert.deepEqual(actual, expected, label); checks++; };
const day = '2026-11-03';
function run(id: string, distance = 1000, patch: Partial<RunResult> = {}): RunResult {
    return { id, date: '2026-11-04T01:00:00.000Z', planeId: 'skyhawk', distance, bonus: 180, score: distance + 180, coins: 5,
        reward: Math.floor(distance / 30) + 1 + 5, maxCombo: 3, eUsed: false, practice: false, interrupted: false,
        reason: 'test', mode: 'daily', dailyKey: day, metrics: { ...emptyMetrics(), distance, bonus: 180, coins: 5, maxCombo: 3, time: 30 }, ...patch };
}

const beforeMidnight = dailyRoute(new Date('2026-11-04T04:59:59Z'));
const afterMidnight = dailyRoute(new Date('2026-11-04T05:00:00Z'));
eq(beforeMidnight.key, day, 'New York day is independent of UTC calendar rollover');
eq(afterMidnight.key, '2026-11-04', 'daily route rolls exactly at New York midnight');
eq(beforeMidnight.resetsAt, '2026-11-04T05:00:00.000Z', 'reset time identifies actual upcoming midnight');
eq(dailyRoute(new Date('2026-11-03T06:00:00Z')).seed, beforeMidnight.seed, 'same day seed is independent of time');
check(afterMidnight.seed !== beforeMidnight.seed, 'next day changes route seed');
eq(dailyRoute(new Date('2026-03-08T05:00:00Z')).resetsAt, '2026-03-09T04:00:00.000Z', 'spring DST day is 23 hours');
eq(dailyRoute(new Date('2026-11-01T04:00:00Z')).resetsAt, '2026-11-02T05:00:00.000Z', 'fall DST day is 25 hours');
eq(dailyRoute(new Date('2026-12-31T22:00:00Z')).resetsAt, '2027-01-01T05:00:00.000Z', 'calendar year rollover');
eq(dailySeed(day), beforeMidnight.seed, 'saved route key regenerates original seed');
assert.throws(() => dailySeed('2026-02-30'), RangeError); checks++;
assert.throws(() => dailyRoute(new Date(NaN)), RangeError); checks++;
check(/^AR-\d{8}-[A-F0-9]{4}$/.test(beforeMidnight.code), 'shareable briefing route code');

const shape = (seed: number) => createSim({ seed }).encounters.map(e => ({ id: e.id, route: e.route, placements: e.placements, pickups: e.pickups }));
eq(shape(beforeMidnight.seed), shape(dailyRoute(new Date('2026-11-03T12:00:00Z')).seed), 'actual generated route geometry and pickups repeat');
assert.notDeepEqual(shape(beforeMidnight.seed), shape(afterMidnight.seed), 'another day varies actual generated route'); checks++;
const modern = createSim({ seed: beforeMidnight.seed, mode: 'daily', dailyKey: day }).result();
eq(modern.mode, 'daily', 'simulation emits daily mode metadata');
eq(modern.dailyKey, day, 'simulation result preserves the original route key');
check(validateResult(modern), 'modern daily result including telemetry validates');
for (const patch of [{ rating: 101 }, { bestFlow: Infinity }, { medal: 'legend' }, { operationBonus: modern.bonus + 1 }, { controlDistance: modern.distance + 1 }])
    check(!validateResult({ ...modern, debrief: { ...modern.debrief, ...patch } }), 'corrupt or impossible debrief cannot enter a backup');

const initial = ensureQuests(freshSave());
const firstRun = run('daily-first');
check(validateResult(firstRun), 'daily result uses existing score and reward rules');
const first = applyRun(initial, firstRun);
eq(first.coins, firstRun.reward, 'daily mode awards unchanged normal flight reward');
eq(first.dailyRecords?.[day]?.attempts, 1, 'first settlement records one attempt');
eq(dailyBest(first, day)?.distance, 1000, 'daily normal personal best retained');
eq(applyRun(first, firstRun), first, 'repeated daily settlement cannot duplicate coins or attempts');
eq(first.bests.all.distance, 1000, 'daily flight still contributes to general progression');
const lower = applyRun(first, run('daily-lower', 600));
eq(dailyBest(lower, day)?.runId, firstRun.id, 'shorter run cannot replace distance personal best');
eq(lower.dailyRecords?.[day]?.attempts, 2, 'all settled attempts are counted');
const hyper = applyRun(lower, run('daily-hyper', 3000, { eUsed: true }));
eq(dailyBest(hyper, day, true)?.distance, 3000, 'E-assisted best tracked separately');
eq(dailyBest(hyper, day)?.distance, 1000, 'E-assisted result does not overwrite normal daily best');
const legacy = applyRun(hyper, { ...run('endless'), mode: 'endless', dailyKey: undefined });
eq(legacy.dailyRecords, hyper.dailyRecords, 'endless flight does not alter daily records');
check(parseSave(hyper), 'daily history and results round-trip through existing schema');
check(parseSave(initial), 'old schema3 save without daily fields remains readable');

for (const patch of [
    { mode: 'daily', dailyKey: undefined }, { mode: 'daily', dailyKey: '2026-02-30' },
    { mode: 'endless', dailyKey: day }, { mode: 'practice' }, { practice: true, reward: 0 },
]) check(!validateResult({ ...firstRun, ...patch }), 'reject inconsistent imported mode metadata');
for (const records of [
    { [day]: { ...first.dailyRecords![day], attempts: -1 } },
    { [day]: { ...first.dailyRecords![day], attempts: NaN } },
    { '2026-02-30': first.dailyRecords![day] },
    { [day]: { ...first.dailyRecords![day], normal: { ...dailyBest(first, day), distance: Infinity } } },
    { [day]: { ...first.dailyRecords![day], normal: { ...dailyBest(first, day), planeId: 'unknown' } } },
    { [day]: { attempts: 1, updatedAt: firstRun.date } },
]) check(parseSave({ ...initial, dailyRecords: records }) === null, 'reject corrupt imported daily records');

let history = initial;
for (let i = 0; i < 40; i++) {
    const key = new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10);
    history = applyRun(history, run('history-' + i, 1000, { dailyKey: key }));
}
eq(Object.keys(history.dailyRecords ?? {}).length, DAILY_RECORD_LIMIT, 'daily history is bounded to 31 date entries');
check(!history.dailyRecords?.['2026-09-01'] && !!history.dailyRecords?.['2026-10-10'], 'oldest route dates are evicted first');
check(validDailyRecords(history.dailyRecords), 'retained history is valid for backup');
check(parseSave(history), 'large rolling history remains importable');
check(!parseSave({ ...history, dailyRecords: { ...history.dailyRecords, '2026-01-01': first.dailyRecords![day] } }), 'oversized daily history cannot bypass the import bound');

useAirrun.setState({ phase: 'hangar', save: initial, flightMode: 'endless', dailyKey: null });
useAirrun.getState().setFlightMode('daily');
useAirrun.getState().start();
const started = useAirrun.getState();
eq(started.flightMode, 'daily', 'lobby mode selection feeds launch');
eq(started.seed, dailySeed(started.dailyKey!), 'start selects reproducible seed from locked route key');
useAirrun.getState().setFlightMode('endless');
eq(useAirrun.getState().flightMode, 'daily', 'mode changes are ignored during active flight');
useAirrun.getState().airport();
useAirrun.getState().start();
eq(useAirrun.getState().seed, started.seed, 'retry selects the same daily route');
const retry = useAirrun.getState();
useAirrun.setState({ save: { ...initial, bests: { all: { distance: 5000, score: 6000, combo: 10 } } } });
const legacyEngineResult = run(retry.runId, 1000, { mode: undefined, dailyKey: undefined });
useAirrun.getState().checkpoint(legacyEngineResult);
eq(useAirrun.getState().save.checkpoint?.dailyKey, retry.dailyKey, 'checkpoint metadata fallback preserves the locked current route');
useAirrun.getState().settle(legacyEngineResult);
check(useAirrun.getState().result?.newBest, 'daily best announcement compares the daily record rather than all-time distance');
eq(dailyBest(useAirrun.getState().save, retry.dailyKey!)?.runId, retry.runId, 'settlement metadata fallback records the selected daily route');
const retryCoins = useAirrun.getState().save.coins;
useAirrun.getState().settle(legacyEngineResult);
eq(useAirrun.getState().save.coins, retryCoins, 'live state settlement guard preserves one reward per run');

// Simulate a checkpoint started before midnight and resumed after reload on another date.
const checkpoint = run('daily-checkpoint', 1200, { interrupted: true });
await persistSave({ ...initial, checkpoint });
useAirrun.setState({ save: initial, flightMode: 'endless', dailyKey: null, runId: '' });
await useAirrun.getState().load();
const restored = useAirrun.getState().save;
eq(dailyBest(restored, day)?.runId, checkpoint.id, 'interrupted run settles against its original route date');
eq(restored.dailyRecords?.[day]?.attempts, 1, 'checkpoint recovery counts one daily attempt');
await useAirrun.getState().load();
eq(useAirrun.getState().save.dailyRecords?.[day]?.attempts, 1, 'reloading checkpoint recovery cannot add attempts');
await persistSave(useAirrun.getState().save);
console.log(JSON.stringify({ dailyRouteChecks: checks, deterministicGeometry: true, daylightSavingBoundaries: true, dailyCheckpointRecovery: true, status: 'passed' }));
