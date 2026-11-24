import assert from 'node:assert/strict';
import { AIRCRAFT, DEFAULT_SETTINGS, freshSave, stats } from '../../app/airrun/data';
import { systemSpec } from '../../app/airrun/airframe-systems';
import { FlightSchool } from '../../app/airrun/flight-school';
import { ensureQuests } from '../../app/airrun/progression';
import { parseSave } from '../../app/airrun/state';
import { controls, createSim } from './fixtures';

const old = ensureQuests(freshSave());
delete old.balanceEdition;
old.coins = 1240;
old.owned.push('beaver');
old.levels.beaver = 3;
const migrated = parseSave(old)!;
assert.equal(migrated.settings.difficulty, 'rookie');
assert.equal(migrated.coins, 1240);
assert.equal(migrated.levels.beaver, 3);
assert.deepEqual(parseSave(migrated)?.settings, migrated.settings);
const rookie = createSim({ settings: { ...DEFAULT_SETTINGS, difficulty: 'rookie' } });
const normal = createSim();
assert.equal(Math.round(rookie.speed * 3.6), 144);
assert.equal(Math.round(normal.speed * 3.6), 166);
assert.equal(rookie.hud(controls()).relay, undefined);
for (const plane of AIRCRAFT) {
    assert.equal(!!systemSpec(plane), ['A', 'S'].includes(plane.grade));
    const stock = stats(plane, 1), improved = stats(plane, 2);
    for (const key of ['speed', 'accel', 'handling', 'hp'] as const) assert(improved[key] > stock[key]);
}

const school = new FlightSchool(), inputs = controls();
school.advance(1, inputs, 1, 12);
school.pass();
assert.equal(school.lesson, 'bank');
inputs.x = 1;
school.advance(.5, inputs, 1, 5);
assert.equal(school.lesson, 'throttle');
school.advance(.4, inputs, .8, 1);
assert.equal(school.hud().progress, 0);
school.advance(.5, inputs, 1.2, 1);
assert(school.hud().braking);
school.advance(.35, inputs, .8, 1);
assert.equal(school.lesson, 'passage');
school.pass();
assert.equal(school.lesson, 'complete');

function isolated(plane: string) {
    const sim = createSim({ plane, coach: true });
    sim.nextStart = 100000;
    sim.encounters[0].route = [];
    sim.encounters = [sim.encounters[0]];
    sim.obstacles = [];
    sim.pickups = [];
    return sim;
}
function tick(sim: typeof normal, frames = 7) {
    for (let i = 0; i < frames; i++) sim.step(1 / 60, controls());
}
function cross(sim: typeof normal, x = sim.x, role = 'slalom') {
    sim.encounters[0].route.push({ x, y: sim.y, z: sim.z + 1, width: 20, height: 16, dangerX: x + 20, dangerY: sim.y, role });
    tick(sim);
}
const ship = (id: string) => AIRCRAFT.find(p => p.grade==='S' && systemSpec(p)?.id===id)!.id;
const cap = isolated(ship('capacitor')), stock = isolated('skyhawk');
for (const sim of [cap, stock]) {
    sim.pickups.push({ id: 901, x: 0, y: 24, z: 2, kind: 'ring', radius: 5, risk: false, collected: false });
    tick(sim);
    assert.equal(sim.metrics.rings, 1);
}
assert(cap.hud(controls()).module?.active);
assert.equal(cap.rush.hud().charge - stock.rush.hud().charge, 22);

const jet = isolated(ship('turbine')), twin = isolated(jet.plane.id);
jet.risk(300, 'near', 'clearance');
tick(jet, 90); tick(twin, 90);
assert(jet.hud(controls()).module?.active);
assert(jet.speed > twin.speed * 1.1);
tick(jet, 95);
assert(!jet.hud(controls()).module?.active);

const tanker = isolated(ship('repair'));
tanker.hp = tanker.maxHp - 40;
cross(tanker, 0, 'orientation');
assert.equal(tanker.hud(controls()).relay?.chain, 0);
cross(tanker);
assert.equal(tanker.hud(controls()).module?.progress, .5);
cross(tanker);
assert.equal(tanker.hp, tanker.maxHp - 40 + Math.ceil(tanker.maxHp * .1));
cross(tanker, 40);
assert.equal(tanker.hud(controls()).relay?.chain, 0);
for (let i=0; i<3; i++) cross(tanker);
assert.equal(tanker.hud(controls()).relay?.lastAward, 750);
assert.equal(tanker.result().relayClears, 1);
cross(tanker); cross(tanker, 7); cross(tanker);
assert.equal(tanker.hud(controls()).relay?.lastAward, 450);
assert.equal(tanker.result().relayClears, 2);
assert.equal(createSim({ mode:'daily', coach:true }).coach, undefined);
console.log('Flight school, save migration, real passage relays and all three in-flight A/S systems passed.');
