import assert from 'node:assert/strict';
import { DIFFICULTIES, proceduralPattern, type Difficulty } from '../../app/airrun/encounter-director';
import { THEMES } from '../../app/airrun/data';

let checks = 0;
const check = (value: unknown, message: string) => { assert.ok(value, message); checks++; };
const equal = (actual: unknown, expected: unknown, message: string) => { assert.deepEqual(actual, expected, message); checks++; };
const modes = Object.keys(DIFFICULTIES) as Difficulty[];
const vertical = new Set(['over', 'roof', 'under', 'bridge', 'arch', 'tunnel']);
const allowedActions = new Set(['arch', 'bridge', 'wall', 'slalom', 'over', 'under', 'crane', 'mover', 'tunnel', 'roof', 'spire', 'cross']);
const firstSignatures = new Set<string>();
const firstActions = new Set<string>();
const directions = new Set<number>();
const altitudes = new Set<number>();

for (const theme of THEMES) {
    const variants = theme.id === 'korea' ? [0, 1, 2, 3] : [0];
    for (const variant of variants) for (const mode of modes) for (let seed = 0; seed < 32; seed++) {
        const first = proceduralPattern(theme.id, variant, seed, 0, 0, 0, mode);
        const repeated = proceduralPattern(theme.id, variant, seed, 0, 0, 0, mode);
        equal(first, repeated, 'same route inputs repeat exactly including the opening');
        check(first.id.startsWith(`proc:${seed}:0:0:`), 'first segment is identified as procedural');
        check(first.steps.length === 3 && first.steps.every(([action, x, y]) => allowedActions.has(action) && Number.isFinite(x) && Number.isFinite(y)), 'grammar emits exactly three concrete actions');
        check(first.steps.some(([action]) => vertical.has(action)) && first.steps.some(([action]) => !vertical.has(action)), 'route requires vertical and lateral skills');
        check(new Set(first.steps.map(([action]) => action)).size === 3, 'route is not one repeated action');
        check(first.steps.some(([, x]) => x < 0) && first.steps.some(([, x]) => x > 0), 'route does not preserve a single common side');
        check(first.steps.every(([, x, y]) => Math.abs(x * .53) + 1 < 23 && y >= 14 && y <= 46), 'requested waypoints respect corridor and altitude margins');
        const heights = first.steps.map(([, , y]) => y);
        check(Math.max(...heights) - Math.min(...heights) >= DIFFICULTIES[mode].altitudeDelta, 'every generated route contains an actual altitude rhythm');
        check(first.generation.spacing === first.spacing && first.spacing >= 150 && first.generation.lead > first.spacing, 'generation contains physical opening and spacing metadata');
        check(first.generation.difficulty === mode && first.generation.intensity === 0, 'profile is frozen into the generated route');
        check(Number(first.id.split(':').at(-1)) >= 1 && Number(first.id.split(':').at(-1)) <= 12, 'procedural district remains compatible with art indexing');
        check(first.name.includes(theme.name) && first.en.includes(theme.en) && first.name.includes('→'), 'briefing names describe the actual action sequence');
        const later = proceduralPattern(theme.id, variant, seed, 4, 60000, 0, mode);
        const openingAtDistance = proceduralPattern(theme.id, variant, seed, 0, 60000, 0, mode);
        check(openingAtDistance.spacing <= first.spacing && later.generation.lead < first.generation.lead, 'distance increases pressure and subsequent segments remove the opening grace');
        equal(proceduralPattern(theme.id, variant, seed, 4, 1e12, 0, mode), later, 'procedural intensity remains bounded at extreme distances');
        const retry = proceduralPattern(theme.id, variant, seed, 0, 0, 1, mode);
        check(JSON.stringify(retry.steps) !== JSON.stringify(first.steps), 'a failed geometry attempt has a distinct deterministic retry');
        if (theme.id === 'volcano') check(first.steps.every(([action]) => action !== 'crane' && action !== 'mover' && action !== 'roof'), 'volcano grammar excludes industrial or residential obstacles');
        if (theme.id === 'korea' && variant === 1) check(first.steps.every(([action]) => action !== 'crane' && action !== 'mover'), 'traditional Korea keeps industrial traffic out of its flight grammar');
        if (theme.id === 'coast' && mode === 'standard') {
            firstSignatures.add(first.steps.map(([action]) => action).join(',')); firstActions.add(first.steps[0][0]);
            directions.add(Math.sign(first.steps[0][1])); altitudes.add(first.steps[0][2]);
        }
    }
}
check(firstSignatures.size >= 16 && firstActions.size >= 7 && directions.size === 2 && altitudes.size >= 20, 'the first coastal segment actually varies in grammar, side and height across seeds');
for (let seed = 0; seed < 64; seed++) {
    const routes = modes.map(mode => proceduralPattern('coast', 0, seed, 3, 12000, 0, mode));
    const [relaxed, standard, expert] = routes;
    equal(routes.map(route => route.steps.map(([action]) => action)), [relaxed, relaxed, relaxed].map(route => route.steps.map(([action]) => action)), 'difficulty preserves seeded route vocabulary for fair profile comparison');
    check(relaxed.spacing > standard.spacing && standard.spacing > expert.spacing, 'difficulty materially changes physical decision intervals');
    check(Math.abs(relaxed.steps[0][1]) < Math.abs(standard.steps[0][1]) && Math.abs(standard.steps[0][1]) < Math.abs(expert.steps[0][1]), 'difficulty materially changes lateral displacement');
    check(relaxed.generation.lead > standard.generation.lead && standard.generation.lead > expert.generation.lead, 'difficulty materially changes encounter breathing room');
}
check(DIFFICULTIES.relaxed.speedMultiplier < 1 && DIFFICULTIES.standard.speedMultiplier === 1 && DIFFICULTIES.expert.speedMultiplier > 1, 'difficulty exposes distinct simulation speed multipliers');
equal(proceduralPattern('coast', 0, 42, NaN, Infinity), proceduralPattern('coast', 0, 42, 0, 0), 'non-finite generation counters cannot poison route geometry');
assert.throws(() => proceduralPattern('missing' as 'coast', 0, 1, 0, 0), RangeError); checks++;
assert.throws(() => proceduralPattern('coast', 0, 1, 0, 0, 0, 'missing' as Difficulty), RangeError); checks++;

console.log(JSON.stringify({ proceduralDirectorChecks: checks, firstCoastalActionSequences: firstSignatures.size, openingActionKinds: firstActions.size, themes: THEMES.length, difficulties: modes.length, status: 'passed' }));
