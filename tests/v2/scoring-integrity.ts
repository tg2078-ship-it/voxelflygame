import assert from 'node:assert/strict';
import { createSim, controls, catalog, proxies } from './fixtures';
import { obstacleContact } from '../../app/airrun/collision';
import { freshSave } from '../../app/airrun/data';
import { questProgress } from '../../app/airrun/progression';
import type { FlightSimulation } from '../../app/airrun/simulation';
import type { RoutePoint } from '../../app/airrun/types';
let checks = 0;
const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
const equal = (actual: unknown, expected: unknown, label: string) => { assert.deepEqual(actual, expected, label); checks++; };

function cross(sim: FlightSimulation, point: RoutePoint, risk = false) {
    sim.nextStart = 1e9;
    sim.pickups = [];
    sim.x = risk ? point.dangerX : point.x;
    sim.y = risk ? point.dangerY : point.y;
    sim.z = point.z - .25;
    sim.vx = sim.vy = 0;
    sim.step(1 / 60, controls());
    check(!sim.failed, 'Tested route crossing clears its real source collision geometry');
    check(sim.z > point.z, 'The actual physics step crosses the scoring plane');
}

// Exercise actual generated opening geometry, rather than inventing an empty
// route fixture with no obstacles. Coin/ring events are isolated so that route
// classification itself is measured.
for (const seed of [13, 42, 731]) {
    const sim = createSim({ seed });
    const orientation = sim.encounters[0].route.filter(point => point.role === 'orientation');
    equal(orientation.length, 3, 'Procedural departure keeps three interactive control lessons');
    sim.effects.set('slow', 100);
    for (const [index, point] of orientation.entries()) {
        cross(sim, point);
        equal(sim.metrics.narrow, 0, 'Clear-air orientation cannot pay a narrow-passage bonus');
        equal(sim.metrics.riskPaths, 0, 'Clear-air orientation cannot advance risk-route challenges');
        equal(sim.metrics.slowPass, 0, 'A slow effect cannot turn a training marker into a narrow route');
        equal(sim.combo, 0, 'Training route crossings cannot create a free risk combo');
        equal(sim.metrics.directionPass, index + 1, 'Successful training control still advances passage goals');
        equal(sim.metrics.safePaths, index + 1, 'Successful training control remains a safe passage');
    }
    for (const id of ['C07', 'I04']) {
        const quest = { uid: 'integrity-' + id, id, progress: 0, detail: {}, acceptedAt: 0 };
        equal(questProgress(quest, sim.result(), freshSave()).progress, 0, 'Risk and narrow-route quests require an actual challenge: ' + id);
    }
}

// Coincident tutorial ring/marker is one physical skill action, while both
// ring and direction objectives can still observe that action.
const lesson = createSim({ seed: 42 });
const marker = lesson.encounters[0].route.find(point => point.role === 'orientation')!;
lesson.nextStart = 1e9;
lesson.pickups = lesson.pickups.filter(pickup => pickup.kind === 'ring' && Math.abs(pickup.z - marker.z) < .01);
lesson.x = marker.x; lesson.y = marker.y; lesson.z = marker.z - .25;
lesson.step(1 / 60, controls());
check(!lesson.failed, 'Coincident lesson remains physically passable');
equal(lesson.metrics.rings, 1, 'Lesson collects its actual ring');
equal(lesson.metrics.directionPass, 1, 'Lesson also progresses its direction goal');
equal(lesson.adventure.debrief().perfectPasses, 1, 'One physical lesson earns one precision award');
equal(lesson.adventure.debrief().flowActions, 1, 'Coincident markers cannot manufacture a flow chain');

// Approach, cross and depart at real simulation speed. The camera trails the aircraft.
for (const seed of [13, 42, 731]) {
    const early = createSim({ seed });
    const marker = early.encounters[0].route.find(point => point.role === 'orientation')!;
    early.nextStart = 1e9;
    early.pickups = early.pickups.filter(pickup => pickup.kind === 'ring' && Math.abs(pickup.z - marker.z) < .01);
    early.x = marker.x; early.y = marker.y; early.z = marker.z - 4;
    let collectedBeforeCentre = false;
    for (let frame = 0; frame < 60 && early.z <= marker.z + 1; frame++) {
        early.step(1 / 60, controls());
        if (early.metrics.rings === 1 && early.z < marker.z) collectedBeforeCentre = true;
    }
    check(!collectedBeforeCentre, 'A ring cannot disappear or score before the centre crosses');
    equal(early.metrics.rings, 1, 'Crossing pays exactly once');
    check(early.pickups.some(p => p.collected && p.kind === 'ring'), 'The chase camera can still see the crossed hoop');
    equal(early.metrics.directionPass, 1, 'Later route-plane crossing still progresses its direction goal');
    equal(early.adventure.debrief().perfectPasses, 1, 'Pruned ring cannot produce a second perfect award');
    equal(early.adventure.debrief().flowActions, 1, 'Pruned ring cannot produce a second flow action');
}

// Fly a string of measured passes in clear air. A miss or a rim crossing
// breaks the sequence, and coincident scoring frames cannot repeat its payout.
const series = createSim({ seed: 42 });
series.nextStart = 1e9;
series.pickups = [0, 0, 0, 7, 0, 5, 0].map((offset, index) => ({
    id: 900 + index, kind: 'ring', x: offset, y: 24, z: 2 + index * 3, radius: 6, collected: false, risk: true,
}));
const credits: number[] = [];
for (let frame = 0; series.z < 24 && frame < 120; frame++) {
    const previous = series.metrics.rings;
    series.step(1 / 60, controls());
    if (series.metrics.rings > previous) credits.push(series.hud(controls()).ringPass!.award);
}
equal(credits, [0, 0, 300, 0, 0, 0], 'Three consecutive central hits pay one measured bonus');
equal(series.result().bestRingStreak, 3, 'Debrief records the best measured central streak');
equal(series.hud(controls()).ringPass?.streak, 1, 'A rim pass resets the streak');

// A real generated bridge's risky line remains valid, pays once, and does not
// also emit a near-miss for the same physical feature.
const risk = createSim({ seed: 42 });
const encounter = risk.encounters[0];
const passage = encounter.route.find(point => point.role === 'bridge')!;
check(!!passage, 'Seeded bridge provides a physical challenge fixture');
check(encounter.placements.some(placement => placement.collision && Math.abs(placement.z - passage.z) < 80), 'Risk fixture contains real collision geometry');
const a = { x: passage.dangerX, y: passage.dangerY, z: passage.z - .25 };
const b = { ...a, z: passage.z + 1 };
for (const obstacle of risk.obstacles)
    check(!obstacleContact(obstacle, catalog.get(obstacle.model)!, proxies.get(obstacle.model), a, b, { x: risk.plane.span * .34, y: 1.05, z: risk.plane.length * .25 }), 'Physical risk line remains passable');
risk.effects.set('slow', 100);
cross(risk, passage, true);
equal(risk.metrics.riskPaths, 1, 'Actual risky bridge passage advances its challenge');
equal(risk.metrics.narrow, 1, 'Actual risky bridge passage grants one narrow event');
equal(risk.metrics.near, 0, 'One bridge crossing is not counted as both narrow and near');
equal(risk.metrics.slowPass, 1, 'Slow-time narrow passage remains meaningful');
const before = { bonus: risk.bonus, narrow: risk.metrics.narrow, riskPaths: risk.metrics.riskPaths, slowPass: risk.metrics.slowPass };
cross(risk, passage, true);
equal({ bonus: risk.bonus, narrow: risk.metrics.narrow, riskPaths: risk.metrics.riskPaths, slowPass: risk.metrics.slowPass }, before, 'Revisiting a scored plane cannot duplicate a physical challenge payout');

// A steady hand is valid manual flying. The same flight distance must count
// while boosting straight and while steering, without rewarding pointless wiggle.
for (const steering of [0, .4]) {
    const sim = createSim({ seed: 42 });
    sim.encounters = []; sim.obstacles = []; sim.pickups = []; sim.nextStart = 1e9;
    const input = controls(); input.boost = true; input.x = steering;
    for (let step = 0; step < 360; step++) sim.step(1 / 60, input);
    check(sim.metrics.boost > 300, 'Boost physics covers a meaningful distance');
    check(Math.abs(sim.adventure.debrief().boostDistance - Math.floor(sim.metrics.boost)) <= 1, 'All manual boosted distance counts without a steering requirement');
    if (steering === 0) equal(sim.adventure.debrief().controlDistance, 0, 'Straight-flight boost credit does not fabricate steering telemetry');
}

const hyper = createSim({ seed: 42 });
hyper.z = 140; hyper.generate();
check(hyper.activateE(), 'Real cinematic can activate in the available airspace');
const input = controls(); input.boost = true;
for (let step = 0; step < 900; step++) hyper.step(1 / 60, input);
check(!hyper.failed && hyper.eRemaining === 0, 'Real cinematic returns safely at fifteen seconds');
equal(hyper.metrics.narrow, 0, 'Cinematic passage cannot farm narrow bonuses');
equal(hyper.metrics.riskPaths, 0, 'Cinematic passage cannot farm risk-route challenges');
equal(hyper.adventure.debrief().boostDistance, 0, 'Cinematic movement cannot farm manual boost credit');
console.log(JSON.stringify({ scoringIntegrityChecks: checks, realProceduralTrainingSeeds: 3, realBridgeChallenge: true, duplicateChallengeBlocked: true, steadyBoostSupported: true, hyperExcluded: true, status: 'passed' }));
