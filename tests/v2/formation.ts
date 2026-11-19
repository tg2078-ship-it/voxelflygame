import assert from 'node:assert/strict';
import { FormationFlight, SIGNAL_POINTS } from '../../app/airrun/formation';
import { FormationVisual } from '../../app/airrun/formation-visual';
import { applyRun, ensureQuests } from '../../app/airrun/progression';
import { validateResult, parseSave, useAirrun } from '../../app/airrun/state';
import { freshSave, clamp } from '../../app/airrun/data';
import { createSim, controls } from './fixtures';

const centre = { x: 0, y: 24, z: 0 };
function approach() {
    const wing = new FormationFlight(17, 'standard');
    wing.addRoute([{ x: 0, y: 24, z: 500 }]);
    for (let i = 0; i < 180; i++) wing.advance(1 / 60, centre, false, false);
    assert.equal(wing.active, true);
    return wing;
}
for (const dt of [1 / 30, 1 / 60, 1 / 144]) {
    for (const [i, duration] of [4, 8, 12].entries()) {
        const wing = approach();
        for (let step = 0; step < Math.round(duration / dt); step++) wing.advance(dt, centre, false, false);
        wing.advance(dt, centre, false, true);
        wing.advance(dt, centre, false, true);
        assert.equal(wing.result().points, SIGNAL_POINTS[i]);
        assert.equal(wing.result().transmissions[i], 1);
    }
}
const lost = approach();
for (let f = 0; f < 1201; f++) lost.advance(1 / 60, { ...centre, x: 30 }, false, true);
assert.equal(lost.active, false);
assert.equal(lost.result().points, 0);
const interrupted = approach();
for (let f = 0; f < 300; f++) interrupted.advance(1 / 60, centre, false, false);
assert.equal(interrupted.hud()?.offer, 240);
interrupted.advance(1 / 60, centre, true, true);
assert.equal(interrupted.result().points, 0);
const damaged = approach();
for (let f = 0; f < 300; f++) damaged.advance(1 / 60, centre, false, false);
damaged.interrupt();
assert.equal(damaged.hud(), undefined);
assert.equal(damaged.advance(1 / 60, centre, false, true), undefined);
assert.equal(damaged.result().points, 0);
const artwork = new FormationVisual();
artwork.update(lost, 10, 10, 40);
assert.equal(artwork.root.visible, false);
artwork.update(approach(), 10, 10, 40);
assert.equal(artwork.root.visible, true);
assert.equal(artwork.root.children.length, 2);

for (const mode of ['sortie', 'daily'] as const) assert.equal(createSim({ mode }).formation, undefined);
const cases = [];
for (const difficulty of ['relaxed', 'standard', 'expert'] as const) {
    const events: string[] = [];
    const sim = createSim({ mode: 'endless', settings: { ...freshSave().settings, difficulty },
        personalDistances: { manual: 100, hyper: 900 }, onEvent: event => events.push(event) });
    assert.equal(sim.recordLine, 101);
    const input = controls(), wing = sim.formation!;
    const target = { ...centre }, raw = (v: number) => Math.sign(v) * (.12 + .88 * Math.pow(Math.min(1, Math.abs(v)), 1 / 1.22));
    const patterns = new Set<string>();
    for (let frame = 0; frame < 60 * 200 && !sim.failed; frame++) {
        wing.sample(sim.z + sim.speed * .3, target);
        const dx = target.x - sim.x, dy = target.y - sim.y;
        input.x = raw(clamp(dx * 3 / (18 * sim.performance.handling), -1, 1));
        input.y = raw(clamp(dy * 3 / (12 * sim.performance.handling), -1, 1));
        input.brake = Math.abs(dx) > 5 || Math.abs(dy) > 4;
        const hud = wing.hud();
        if (hud) patterns.add(hud.pattern);
        // Send the first contact early, then try for the full escort.
        input.transmit = wing.result().contacts === 1 && hud?.offer === 240;
        sim.step(1 / 60, input);
    }
    const result = sim.result();
    assert.equal(sim.failed, false, sim.reason);
    assert.equal(patterns.size, 3);
    assert.equal(sim.theme, 'village');
    assert.equal(events.filter(kind => kind === 'record-pass').length, 1);
    assert.equal(result.formation!.transmissions[0], 1);
    assert(result.formation!.transmissions[2] > 0);
    assert(validateResult(result));
    assert(!validateResult({ ...result, formation: { ...result.formation, points: result.bonus + 1000 } }));
    const old = { ...result }; delete old.formation;
    assert(validateResult(old));
    const save = ensureQuests(freshSave());
    const settled = applyRun(save, result);
    assert(settled.skins.skyhawk.includes('courier'));
    assert.deepEqual(applyRun(settled, result), settled);
    assert(parseSave(settled));
    useAirrun.setState({ phase: 'hangar', save });
    useAirrun.getState().applySkin('courier');
    assert.equal(useAirrun.getState().save.skinSelected.skyhawk, undefined);
    useAirrun.setState({ save: settled });
    useAirrun.getState().applySkin('courier');
    assert.equal(useAirrun.getState().save.skinSelected.skyhawk, 'courier');
    assert.equal(useAirrun.getState().save.coins, settled.coins);
    assert(parseSave(useAirrun.getState().save));
    assert.equal(sim.result().bonus, result.bonus);
    sim.eUsed = true;
    assert.equal(sim.recordLine, 901);
    cases.push({ difficulty, patterns: [...patterns], ...result.formation });
}
console.log(JSON.stringify({ cases, status: 'passed' }));
