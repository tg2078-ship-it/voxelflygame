import assert from 'node:assert/strict';
import { AIRCRAFT, THEMES, baseSpeed, stats, upgradeCost, DEFAULT_SETTINGS, emptyMetrics, freshSave, themeAt } from '../../app/airrun/data';
import { PATTERNS, buildEncounter, validateReachability } from '../../app/airrun/patterns';
import { sweepAABB, obstacleContact, transformBox } from '../../app/airrun/collision';
import { WeatherController, nightAt } from '../../app/airrun/weather';
import { QUESTS, CAREER, ACHIEVEMENTS, ensureQuests, applyRun, makeQuest, rerollCandidates, questProgress, metricValue } from '../../app/airrun/progression';
import { parseSave, useAirrun, validateResult, input as liveInput, releaseInput } from '../../app/airrun/state';
import { setTouchSpeed } from '../../app/airrun/touch-input';
import { catalog, proxies, createSim, controls } from './fixtures';
import type { Metrics, RunResult } from '../../app/airrun/types';
let checks = 0;
const check = (v: unknown, message: string) => { assert.ok(v, message); checks++; };
const eq = (a: unknown, b: unknown, label: string) => { assert.deepEqual(a, b, label); checks++; };
function run(id: string, patch: Partial<Metrics> = {}, eUsed = false): RunResult { const metrics = { ...emptyMetrics(), distance: 1000, time: 30, ...patch }; return { id, date: '2026-10-11T00:00:00.000Z', planeId: 'skyhawk', distance: metrics.distance, bonus: metrics.bonus, score: Math.floor(metrics.distance) + metrics.bonus, coins: metrics.coins, reward: Math.floor(metrics.distance / 30) + Math.floor(metrics.bonus / 180) + metrics.coins, maxCombo: metrics.maxCombo, eUsed, practice: false, interrupted: false, reason: 'test', metrics }; }
// Data and economy use the authoritative v2 values rather than the previous implementation.
eq(PATTERNS.length, 168, '168 authored patterns');
eq(new Set(PATTERNS.map(p => p.id)).size, 168, 'unique authored IDs');
eq(catalog.size, 407, '403 supplied +4 traffic assets');
eq(QUESTS.length, 64, '64 quest conditions');
eq(CAREER.length, 20, '20 career missions');
eq(ACHIEVEMENTS.length, 40, '40 achievement tiers');
eq(baseSpeed(0)*stats(AIRCRAFT[0],1).speed, 46, 'standard starter cruise');
check(baseSpeed(100000) > baseSpeed(50000), 'unbounded base speed');
const max = stats(AIRCRAFT[0], 20);
eq(max.hp, 262, 'level20 durability');
check(Math.abs(max.handling - 2.045) < 1e-10, 'level20 handling +104.5%');
check(Math.abs(max.accel - 2.425) < 1e-10, 'level20 acceleration +142.5%');
eq(upgradeCost(AIRCRAFT[0], 1), 45, 'first C upgrade');
eq(upgradeCost(AIRCRAFT[7], 19), 5230, 'S level19 upgrade');
for (const p of PATTERNS) {
    const e = buildEncounter(p, 0, 13, { byId: catalog }, 11, 1);
    check(e.route.filter(point => point.role !== 'orientation').length === 3 && e.placements.every(o => catalog.has(o.model)), 'every pattern keeps three structural actions and real assets');
    if (p.theme === 'coast') check(e.route.filter(point => point.role === 'orientation').length === 3 && e.pickups.some(pickup => pickup.kind === 'ring' && pickup.z < 200), 'first coast adds optional interactive orientation before lethal structures');
    check(validateReachability(e, 40, 1, 11, { x: 0, y: 24, z: 0 }), 'intro route reachable ' + p.id);
}
// Continuous sweeps, visual Z conversion, relative movement, and apertures.
check(sweepAABB({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 100 }, { min: { x: -1, y: -1, z: 50 }, max: { x: 1, y: 1, z: 51 } }, { x: .5, y: .5, z: .5 })?.t === .495, 'fast thin wall sweep');
const transformed = transformBox([1, 2, 3], [2, 2, 2], { x: 0, y: 0, z: 10 }, { x: 1, y: 1, z: 1 }, 0);
eq(transformed.min.z, 6, 'render -Z converted to distance +Z');
// Weather clock is independent of theme and respects the first visible transition.
const weather = new WeatherController();
const sample = (t: number) => weather.get(t, 1 / 60, 'coast', 12, null);
eq(sample(19).cloud, .12, 'clear opening');
check(sample(34).cloud > .75, 'clouds by35sec');
eq(sample(50).kind, 'cloudy', 'overcast55sec');
check(sample(62).rain > .2, 'rain entering55–70sec');
check(sample(75).rain > .6, 'rain70sec');
check(sample(160).rain === 0, 'rain ends');
check(nightAt(119) < .5 && nightAt(121) > .5 && nightAt(179) > .5 && nightAt(181) < .5, '120day60night and wrap');
for (let seed = 0; seed < 40; seed++) {
    const sequence = Array.from({ length: 30 }, (_, i) => themeAt(seed, i));
    eq(sequence.slice(0, 3).map(s => s.theme.id), ['coast', 'village', 'city'], 'fixed first nine minutes');
    for (let i = 3; i < sequence.length; i++) {
        check(sequence[i].theme.id !== sequence[i - 1].theme.id && sequence[i].theme.id !== sequence[i - 2].theme.id, 'avoid previous two themes');
        check(!(sequence[i].theme.special && sequence[i - 1].theme.special), 'no consecutive specials');
    }
}
// Idempotent settlement, cumulative discovery, segregated records and no practice rewards.
const s = ensureQuests(freshSave()), r = run('first', { coins: 20, bonus: 900, maxCombo: 8, themeTime: { coast: 12 } });
check(validateResult(r), 'valid result');
const first = applyRun(s, r);
eq(first.coins, 58, 'distance+bonus+coin reward');
eq(applyRun(first, r), first, 'idempotent settlement');
const nextCheckpoint = { ...run('ongoing-run'), interrupted: true };
const withActiveCheckpoint = { ...first, checkpoint: nextCheckpoint };
eq(applyRun(withActiveCheckpoint, r).checkpoint, nextCheckpoint, 'replayed settlement does not erase a newer flight checkpoint');
const second = applyRun(first, run('second', { themeTime: { coast: 11 } }));
eq(second.discoveries.coast.seconds, 23, 'partial discoveries accumulate');
const image = 'data:image/jpeg;base64,AA==';
const third = applyRun(second, { ...run('third', { themeTime: { village: 25 } }, true), discoveryImages: { village: image } });
eq(third.discoveries.village.image, image, 'actual scene image survives settlement');
check(!!third.bests.allE && third.bests.all.distance === 1000, 'separate E records');
eq(applyRun(third, { ...run('practice'), practice: true }), third, 'practice excluded');
check(parseSave(third) !== null, 'schema3 roundtrip');
const bad = structuredClone(third);
bad.levels.skyhawk = 21;
eq(parseSave(bad), null, 'reject impossible level');
const broken = structuredClone(third);
broken.runs[0].score++;
eq(parseSave(broken), null, 'reject inconsistent score');
for (const [label, mutate] of [
    ['unsupported future schema', (v: typeof third) => v.schema = 99 as 3],
    ['reward mismatch', (v: typeof third) => v.runs[0].reward++],
    ['NaN metric', (v: typeof third) => v.runs[0].metrics.rainDistance = NaN],
    ['unowned livery', (v: typeof third) => v.skinSelected.skyhawk = 'ocean'],
    ['invalid settings', (v: typeof third) => v.settings.sensitivity = 10],
    ['corrupted photo', (v: typeof third) => v.discoveries.village.image = 'javascript:invalid'],
    ['invalid landmark date', (v: typeof third) => v.landmarks['real:seoul_tower'] = { date: 'invalid', visits: 1 }],
] as const) {
    const invalid = structuredClone(third);
    mutate(invalid);
    eq(parseSave(invalid), null, 'backup rejects ' + label);
}
const special = QUESTS.find(q => q.id === 'C08')!, quest = { uid: 'W', id: special.id, progress: 0, detail: {}, acceptedAt: 0 };
const progress = questProgress(quest, run('rain', { weatherCoins: { rain: 20 } }), s);
eq(progress.progress, 1, 'weather coins first condition');
eq(questProgress({ ...quest, ...progress }, run('clear', { weatherCoins: { clear: 20 } }), s).progress, 2, 'weather coins second condition');
for (let slot = 0; slot < 6; slot++) {
    const q = s.quests[slot], available = rerollCandidates(s, q);
    if (available.length) {
        const spec = QUESTS.find(x => x.id === q.id)!;
        const replacement = makeQuest(s, slot, s.quests.map(q => q.id), spec.family, spec.tier);
        check(replacement.id !== q.id, 'reroll changes quest');
        eq(QUESTS.find(x => x.id === replacement.id)!.family, spec.family, 'reroll same family');
        eq(QUESTS.find(x => x.id === replacement.id)!.tier, spec.tier, 'reroll same tier');
        eq(replacement.progress, 0, 'reroll clears progress');
    }
}
// Hold controls return to baseline; items expire on active simulation time.
const sim = createSim();
sim.obstacles = [];
sim.encounters = [];
sim.pickups = [];
sim.nextStart = 1e9;
const input = controls();
input.boost = true;
for (let i = 0; i < 120; i++)
    sim.step(1 / 60, input);
check(sim.speed > baseSpeed(sim.z) * sim.performance.speed * 1.2, 'held boost');
input.boost = false;
for (let i = 0; i < 120; i++)
    sim.step(1 / 60, input);
check(Math.abs(sim.speed / (baseSpeed(sim.z)*sim.performance.speed) - 1) < .03, 'released boost returns');
sim.collect('slow');
sim.collect('turbo');
check(!sim.effects.has('slow') && sim.effects.has('turbo'), 'speed items replace');
sim.hp -= 20;
sim.collect('repair');
eq(sim.metrics.repair, 20, 'repair counts actual heal');
sim.collect('shield');
for (let i = 0; i < 610; i++)
    sim.step(1 / 60, input);
check(!sim.effects.has('shield'), 'shield expires in10active sec');
const before = sim.metrics.maxCombo;
sim.risk(120, 'near');
sim.risk(300, 'narrow');
eq(sim.combo, 2, 'risk chain');
sim.time += 8;
sim.risk(120, 'near');
eq(sim.combo, 1, 'combo ends after7sec');
const geared = createSim({ settings: { ...DEFAULT_SETTINGS, control: 'gear' } });
const gearInput = controls();
gearInput.boost = true;
gearInput.brake = true;
gearInput.pendingGear = 1;
geared.step(1 / 60, gearInput);
eq(gearInput.gear, 3, 'simultaneous speed buttons do not shift');
gearInput.brake = false;
gearInput.pendingGear = 1;
geared.step(1 / 60, gearInput);
eq(gearInput.gear, 4, 'one gear press advances once');
geared.step(1 / 60, gearInput);
eq(gearInput.gear, 4, 'held button does not repeat gear change');

// Actual touch events feed the same fixed-step controls as keyboard input.
const touchSim = createSim({ settings: { ...DEFAULT_SETTINGS, control: 'gear' } });
releaseInput();
setTouchSpeed('boost', true, 'gear'); touchSim.step(1 / 60, liveInput);
eq(liveInput.gear, 4, 'touch boost shifts the real simulation once');
setTouchSpeed('boost', true, 'gear'); touchSim.step(1 / 60, liveInput);
eq(liveInput.gear, 4, 'duplicate touch down cannot repeat a held gear change');
setTouchSpeed('boost', false, 'gear'); setTouchSpeed('brake', true, 'gear'); touchSim.step(1 / 60, liveInput);
eq(liveInput.gear, 3, 'touch brake shifts the simulation down');
setTouchSpeed('boost', true, 'gear'); touchSim.step(1 / 60, liveInput);
eq(liveInput.gear, 3, 'opposing simultaneous touch controls do not shift');
releaseInput();
setTouchSpeed('boost', true, 'hold'); touchSim.step(1 / 60, liveInput);
eq(liveInput.gear, 3, 'hold-mode touch control does not enqueue a gear change');
releaseInput();
check(!liveInput.boost && !liveInput.brake && liveInput.pendingGear === 0, 'control-mode remount neutralizes held touch inputs');

// A hit before entering snow must not permanently prevent clean-snow missions.
const snowy = createSim();
snowy.obstacles = []; snowy.encounters = []; snowy.pickups = []; snowy.nextStart = 1e9;
snowy.damage(10);
snowy.weatherController.get = () => ({ ...snowy.weather, snow: true });
for (let i = 0; i < 120; i++) snowy.step(1 / 60, controls());
check(snowy.metrics.snowSafe > 75, 'clean snow flight progresses after an earlier non-snow hit');
const firstSnowSegment = snowy.metrics.snowSafe;
snowy.damage(5);
for (let i = 0; i < 30; i++) snowy.step(1 / 60, controls());
eq(snowy.metrics.snowSafe, firstSnowSegment, 'snow mission preserves the best segment rather than combining segments across damage');
for (let i = 0; i < 180; i++) snowy.step(1 / 60, controls());
check(snowy.metrics.snowSafe > firstSnowSegment, 'a new clean snow segment can surpass the previous best');
useAirrun.setState({ phase: 'flying', resumeCountdown: 0, modelError: '', renderError: '' });
useAirrun.getState().pause();
useAirrun.getState().resume();
eq(useAirrun.getState().resumeCountdown, 3, 'resume begins a deliberate three-second countdown');
useAirrun.getState().pause();
eq(useAirrun.getState().resumeCountdown, 3, 'repeated pause does not reset countdown');
useAirrun.setState({ resumeCountdown: 1.5 });
useAirrun.getState().resume();
eq(useAirrun.getState().resumeCountdown, 1.5, 'repeated resume does not restart countdown');
useAirrun.setState({ resumeCountdown: 0 });
useAirrun.setState({ modelError: 'sector unavailable' });
useAirrun.getState().resume();
eq(useAirrun.getState().resumeCountdown, 0, 'keyboard resume cannot bypass an unresolved loading failure');
console.log(JSON.stringify({ coreChecks: checks, patterns: PATTERNS.length, quests: QUESTS.length, career: CAREER.length, achievements: ACHIEVEMENTS.length, status: 'passed' }));
