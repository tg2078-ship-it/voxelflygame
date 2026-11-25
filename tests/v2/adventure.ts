import assert from 'node:assert/strict';
import { FlightAdventure, validDebrief, type AdventureFrame } from '../../app/airrun/adventure';
import { createSim, controls } from './fixtures';
import { validateResult } from '../../app/airrun/state';
let checks = 0;
const check = (value: unknown, label: string) => { assert(value, label); checks++; };
const equal = (a: unknown, b: unknown, label: string) => { assert.deepEqual(a, b, label); checks++; };
const frame = (time: number, patch: Partial<AdventureFrame> = {}): AdventureFrame => ({ time, distance: time * 40, speed: 40, altitude: 24, controlling: false, boosting: false, hyper: false, theme: 'coast', weather: 'clear', availablePassages: 3, availableRings: 3, availableCoins: 24, ...patch });

for (let seed = 0; seed < 100; seed++) {
    const a = new FlightAdventure(seed), b = new FlightAdventure(seed);
    a.advance(frame(0)); b.advance(frame(0));
    const opening = a.hud()!.operation;
    check(opening.kind === 'pathfinder' && opening.target === 2 && opening.duration >= 26 && opening.duration <= 35, 'opening goal is readable and bounded');
    a.advance(frame(8)); b.advance(frame(8));
    a.event('route', 'first'); b.event('route', 'first');
    a.event('route', 'first');
    equal(a.hud()!.operation.progress, 1, 'duplicate route event cannot advance the operation twice');
    a.advance(frame(19)); b.advance(frame(19));
    a.event('route', 'second'); b.event('route', 'second');
    equal(a.hud(), b.hud(), 'same seed and physical events reproduce exactly');
    const prizes = a.takeAwards().filter(award => award.kind === 'operation');
    check(prizes.length === 1 && prizes[0].points === 250 && a.hud()!.operation.status === 'completed', 'completed operation pays once');
    a.event('route', 'extra');
    equal(a.takeAwards().filter(award => award.kind === 'operation').length, 0, 'completed operation cannot pay again');
    a.advance(frame(21));
    check(a.hud()!.operation.id === 'OP-2' && a.hud()!.operation.kind !== 'pathfinder' && a.hud()!.operation.reward === 310, 'next goal changes after a two-second result and escalates its earned reward');
}
const missed = new FlightAdventure(17);
missed.advance(frame(0));
const deadline = missed.hud()!.operation.duration;
missed.advance(frame(deadline));
check(missed.hud()!.operation.status === 'expired' && missed.hud()!.expired === 1, 'deadline rotates a missed goal without a game over');
equal(missed.takeAwards(), [], 'waiting alone cannot earn a completion reward');
missed.advance(frame(deadline + 2));
check(missed.hud()!.operation.id === 'OP-2', 'missed operation offers another goal');

const hyper = new FlightAdventure(12);
hyper.advance(frame(0)); hyper.advance(frame(5)); hyper.event('route', 'manual-route', true);
const beforeHyper = hyper.hud()!, beforeTelemetry = hyper.debrief();
hyper.hyperStart();
hyper.advance(frame(20, { hyper: true, controlling: true, boosting: true, altitude: 8 }));
for (const event of ['route', 'ring', 'near', 'narrow', 'coin'] as const) hyper.event(event, `hyper-${event}`, true);
equal(hyper.hud()!.operation.progress, beforeHyper.operation.progress, 'Hyper Trick cannot progress a skill operation');
equal(hyper.hud()!.operation.remaining, beforeHyper.operation.remaining, 'Hyper Trick pauses the operation deadline');
equal(hyper.debrief().perfectPasses, beforeTelemetry.perfectPasses, 'Hyper Trick cannot farm precision rewards');
check(hyper.hud()!.flow.value === 0 && hyper.hud()!.flow.chain === 0, 'Hyper Trick clears the manual flow chain');
hyper.advance(frame(21));
check(Math.abs(hyper.hud()!.operation.remaining - (beforeHyper.operation.remaining - 1)) < 1e-8, 'manual clock resumes without charging the Hyper interval');
check(hyper.debrief().controlDistance === 0 && hyper.debrief().boostDistance === 0 && hyper.debrief().lowDistance === 0, 'Hyper movement is excluded from manual-flight telemetry');

const flowing = new FlightAdventure(3);
flowing.advance(frame(0));
for (let i = 0; i < 30; i++) { flowing.advance(frame(i / 10)); flowing.event('ring', 'precision-' + i, true); }
check(flowing.hud()!.flow.value <= 100 && flowing.hud()!.flow.multiplier <= 1.5, 'flow values and multipliers have explicit caps');
check(flowing.debrief().medal === 'bronze', 'a one-second burst of events cannot award an ace medal');
const bestFlow = flowing.debrief().bestFlow;
flowing.damage();
check(flowing.hud()!.flow.value === 0 && flowing.hud()!.flow.chain === 0 && flowing.debrief().bestFlow === bestFlow, 'damage breaks the live chain and retains the earned record');
flowing.event('near', 'fresh-near'); flowing.advance(frame(13));
equal(flowing.hud()!.flow.chain, 0, 'flow chain expires without new skill actions');
check(validDebrief(flowing.debrief()), 'generated debrief obeys the storage contract');
check(!validDebrief({ ...flowing.debrief(), flowBonus: NaN }) && !validDebrief({ ...flowing.debrief(), rating: 101 }), 'malformed debriefs are rejected');

for (let seed = 0; seed < 100; seed++) {
    const unavailable = new FlightAdventure(seed);
    unavailable.advance(frame(0, { availablePassages: 0, availableRings: 0, availableCoins: 0 }));
    check(['low-line', 'boost-line'].includes(unavailable.hud()!.operation.kind), 'a goal requiring absent pickups or passages is never assigned');
}

// These checks cross the real simulation's physical planes; menu actions and
// synthetic background props never feed passage or precision progress.
const isolated = () => {
    const sim = createSim(); sim.obstacles = []; sim.encounters = []; sim.pickups = []; sim.nextStart = 1e9; return sim;
};
const ring = isolated();
ring.pickups = [{ id: 8001, kind: 'ring', x: 0, y: ring.y, z: .2, radius: 6, collected: false, risk: true }];
ring.step(1 / 60, controls());
check(ring.metrics.rings === 1 && ring.adventure.debrief().perfectPasses === 1 && ring.adventure.debrief().precisionBonus === 75, 'physical centre crossing earns a real precision reward');
equal(ring.bonus, 225, 'perfect ring adds 75 to its existing 150 points');
ring.step(1 / 60, controls());
equal(ring.bonus, 225, 'the same physical ring never rewards twice');
const edge = isolated();
edge.pickups = [{ id: 8002, kind: 'ring', x: 5, y: edge.y, z: .2, radius: 6, collected: false, risk: true }];
edge.step(1 / 60, controls());
check(edge.metrics.rings === 1 && edge.adventure.debrief().perfectPasses === 0 && edge.bonus === 150, 'an edge crossing collects the ring without a perfect reward');

const passage = createSim();
const encounter = passage.encounters[0], route = encounter.route[0];
passage.obstacles = []; passage.pickups = []; passage.encounters = [{ ...encounter, route: [route], passed: new Set() }]; passage.nextStart = 1e9;
passage.x = route.x; passage.y = route.y; passage.z = route.z - .2;
passage.step(1 / 60, controls());
check(passage.metrics.directionPass === 1 && passage.adventure.debrief().perfectPasses === 1, 'authored route-plane crossing feeds actual precision and mission telemetry');
passage.step(1 / 60, controls());
equal(passage.adventure.debrief().perfectPasses, 1, 'authored passage is deduplicated');

const eFlight = isolated();
check(eFlight.activateE(), 'real Hyper Trick can be planned in clear airspace');
const manualRemaining = eFlight.adventure.hud()!.operation.remaining;
for (let i = 0; i < 900; i++) eFlight.step(1 / 60, controls());
check(eFlight.eRemaining === 0 && eFlight.eUsed, 'Hyper Trick still lasts exactly fifteen active seconds');
equal(eFlight.adventure.hud()!.operation.remaining, manualRemaining, 'real fifteen-second Hyper flight leaves operation clock untouched');
check(eFlight.adventure.debrief().operationsCompleted === 0 && eFlight.adventure.debrief().flowActions === 0, 'real Hyper flight grants no skill operation or flow rewards');

const atRenderRate = (fps: number) => {
    const sim = isolated(); sim.y = 9;
    let accumulator = 0, steps = 0;
    for (let frame = 0; frame < fps * 60; frame++) {
        accumulator += 1 / fps;
        while (accumulator >= 1 / 60 - 1e-10) {
            const input = controls(); input.x = Math.sin(steps / 60 * .7) * .65; input.boost = Math.floor(steps / 300) % 2 === 1;
            sim.step(1 / 60, input); accumulator -= 1 / 60; steps++;
        }
    }
    check(steps === 3600 && !sim.failed, 'render scheduler executes the same fixed simulation steps');
    const beforePause = sim.adventure.hud();
    // A paused renderer does not run sim.step; repeated HUD reads have no side effects.
    for (let i = 0; i < 144; i++) sim.hud(controls());
    equal(sim.adventure.hud(), beforePause, 'pause and presentation reads cannot advance goals or payouts');
    const result = sim.result();
    check(validateResult(result), 'real scored result remains a valid backwards-compatible save record');
    check(result.score === result.distance + result.bonus && result.reward === Math.floor(result.distance / 36) + Math.floor(result.bonus / 115) + result.coins, 'existing score and currency formulas remain exact');
    return { hud: sim.adventure.hud(), debrief: result.debrief, distance: result.distance, score: result.score, reward: result.reward };
};
const sixty = atRenderRate(60);
equal(atRenderRate(30), sixty, '30 FPS presentation preserves all gameplay, goals and telemetry');
equal(atRenderRate(144), sixty, '144 FPS presentation preserves all gameplay, goals and telemetry');
console.log(JSON.stringify({ adventureChecks: checks, deterministicSeeds: 100, renderRates: [30, 60, 144], precisionFromRealCrossings: true, hyperExcluded: true, status: 'passed' }));
