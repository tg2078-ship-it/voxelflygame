import assert from 'node:assert/strict';
import { createSim, controls, catalog } from './fixtures';
import { obstacleContact } from '../../app/airrun/collision';
import type { AssetMeta, Obstacle, Pickup } from '../../app/airrun/types';

let checks = 0;
const check = (value: unknown, message: string) => { assert.ok(value, message); checks++; };
const equal = (actual: unknown, expected: unknown, message: string) => { assert.deepEqual(actual, expected, message); checks++; };

// Controlled solid geometry isolates simulation event ordering from native
// asset shape. The real simulation still moves, sweeps, damages and scores.
const fixtureMeta: AssetMeta = {
    ...catalog.values().next().value!, id: 'collision-integrity-solid',
    bounds: { min: [-.5, -.5, -.05], max: [.5, .5, .05], size: [1, 1, .1] },
    clearances: [],
};
function flight() {
    const sim = createSim({ catalog: new Map([...catalog, [fixtureMeta.id, fixtureMeta]]) });
    sim.x = 0; sim.y = 24; sim.z = 100;
    sim.obstacles = []; sim.encounters = []; sim.pickups = []; sim.nextStart = 1e9;
    return sim;
}
function obstacle(id: number, z = 100.25, small = true, x = 0): Obstacle {
    return { id, model: fixtureMeta.id, position: { x, y: 24, z }, scale: { x: 1, y: 1, z: 1 },
        size: { x: 1, y: 1, z: .1 }, yaw: 0, small, hit: false, scored: false, role: 'integrity fixture' };
}
function pickup(id: number, kind: Pickup['kind']): Pickup {
    return { id, kind, x: 0, y: 24, z: 100.25, radius: 3, collected: false, risk: false };
}

const lethal = flight();
lethal.rescueUsed = true;
lethal.hp = 1;
lethal.obstacles = [obstacle(1)];
lethal.pickups = [pickup(1, 'repair'), pickup(2, 'coin'), pickup(3, 'ring')];
lethal.step(1 / 60, controls());
check(lethal.failed, 'Fatal small-object damage ends the real flight');
check(lethal.hp <= 0, 'A pickup later in the same step cannot revive a destroyed airframe');
equal(lethal.metrics.repair, 0, 'Destroyed airframe cannot collect post-impact repair');
equal(lethal.coins, 0, 'Destroyed airframe cannot collect post-impact coins');
equal(lethal.metrics.rings, 0, 'Destroyed airframe cannot collect post-impact rings');
equal(lethal.bonus, 0, 'Fatal damage stops later scoring in the same step');
const ended = { time: lethal.time, hp: lethal.hp, bonus: lethal.bonus, coins: lethal.coins };
lethal.step(1 / 60, controls());
equal({ time: lethal.time, hp: lethal.hp, bonus: lethal.bonus, coins: lethal.coins }, ended, 'Further steps cannot alter the terminated flight');

const cooldown = flight();
cooldown.hitCooldown = 1;
cooldown.obstacles = [obstacle(1)];
cooldown.step(1 / 60, controls());
check(!cooldown.failed, 'Damage cooldown keeps a second minor contact survivable');
equal(cooldown.metrics.damage, 0, 'Cooldown continues to suppress repeated damage');
equal(cooldown.metrics.near, 0, 'Physical contact during cooldown is never a close call');
equal(cooldown.bonus, 0, 'Physical contact during cooldown cannot mint a near-miss payout');

const clean = flight();
const cleanObstacle = obstacle(1, 100.25, true, clean.plane.span * .34 + .8);
clean.obstacles = [cleanObstacle];
const radius = { x: clean.plane.span * .34, y: 1.05, z: clean.plane.length * .25 };
check(!obstacleContact(cleanObstacle, fixtureMeta, undefined, { x: 0, y: 24, z: 100 }, { x: 0, y: 24, z: 101 }, radius), 'Positive control clears the real contact envelope');
check(!!obstacleContact(cleanObstacle, fixtureMeta, undefined, { x: 0, y: 24, z: 100 }, { x: 0, y: 24, z: 101 }, { ...radius, x: radius.x + 1.8, y: radius.y + 1.8 }), 'Positive control crosses the close-call envelope');
clean.step(1 / 60, controls());
equal(clean.metrics.near, 1, 'A genuinely clear close call still pays');
equal(clean.bonus, 240, 'A genuinely clear close call retains its base reward');
clean.step(1 / 60, controls());
equal(clean.metrics.near, 1, 'The same physical close call pays only once');

// Native obstacle arrays are built by encounter/model construction order, not
// chronological impact time. Reversing that array must not change damage or
// consume a shield on a feature that lies beyond an already-fatal impact.
for (const shield of [false, true]) for (const reverse of [false, true]) {
    const sim = flight(), r = { x: sim.plane.span * .34, y: 1.05, z: sim.plane.length * .25 };
    const major = obstacle(1, sim.z + r.z + .15, false);
    const minor = obstacle(2, sim.z + r.z + .45);
    const a = { x: 0, y: 24, z: sim.z }, b = { ...a, z: sim.z + 2 / 3 };
    const first = obstacleContact(major, fixtureMeta, undefined, a, b, r);
    const second = obstacleContact(minor, fixtureMeta, undefined, a, b, r);
    check(first && second && first.t < second.t, 'Swept contacts establish a real earlier fatal impact');
    sim.obstacles = reverse ? [major, minor] : [minor, major];
    sim.rescueUsed = true;
    if (shield) sim.effects.set('shield', 10);
    sim.step(1 / 60, controls());
    equal(sim.failed, !shield, 'First major contact consumes a shield or ends a spent-rescue run');
    equal(sim.metrics.damage, 0, 'A later minor contact cannot apply damage before an earlier major impact');
    equal(sim.metrics.minorHits, 0, 'A later minor contact cannot count after the earlier fatal impact');
    equal(sim.metrics.shieldBlocks, Number(shield), 'Only the earlier structure can consume shield protection');
    equal(sim.effects.has('shield'), false, 'Structure protection resolves regardless of obstacle array order');
    check(Math.abs(sim.impact.z - 100.1) < .0001, 'Reported crash location is the first actual swept contact');
}

console.log(JSON.stringify({ collisionIntegrityChecks: checks, realSimulation: true, isolatedSolidGeometry: true,
    postImpactRewardsBlocked: true, contactCannotScoreNear: true, chronologicalFatalContacts: true, status: 'passed' }));
