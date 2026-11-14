import assert from 'node:assert/strict';
import { groundAt, type FlightSimulation } from '../../app/airrun/simulation';
import { obstacleContact } from '../../app/airrun/collision';
// Independently sweep the prepared route after immunity ends. This checks
// the available passage, not a promise that a player can ignore steering.
export function checkTrickHandoff(sim: FlightSimulation) {
    const exit = sim.ePath.findIndex(p => Math.abs(p.t - 15) < 1e-8);
    assert(exit > 0, 'Exit knot at exactly 15 seconds');
    assert(sim.ePath.at(-1)!.t >= 18, 'At least three seconds of route after E');
    const radius = { x: sim.plane.span * .34, y: 1.05, z: sim.plane.length * .25 };
    for (let i = exit + 1; i < sim.ePath.length; i++) {
        const a = sim.ePath[i - 1], b = sim.ePath[i], dt = b.t - a.t;
        assert(Math.abs(b.x - a.x) <= 18 * sim.performance.handling * dt + 1e-8, 'Exit route lateral handling');
        assert(Math.abs(b.y - a.y) <= 12 * sim.performance.handling * dt + 1e-8, 'Exit route vertical handling');
        assert(b.y >= groundAt(b.x, b.z, sim.theme, sim.config.seed, sim.variant) + radius.y + 2, 'Exit route terrain clearance');
        for (const o of sim.obstacles) {
            // Motion envelopes include every animation phase. Translate the
            // whole-object envelope both ways to include its reserved travel.
            const variants = o.moving ? [-1, 0, 1] : [0];
            for (const direction of variants) {
                const pose = { ...o, position: { ...o.position } };
                if (o.moving)
                    pose.position[o.moving.axis] += direction * o.moving.amplitude;
                assert(!obstacleContact(pose, sim.config.catalog.get(o.model)!, sim.config.proxies.get(o.model), a, b, radius), `Exit route intersects ${o.model} at ${b.t}s`);
            }
        }
    }
}
