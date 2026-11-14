import { AIRSPACE } from './graphics';
import { baseSpeed, clamp, damp, mix, smooth } from './data';
import { collisionBounds, obstacleContact, sweepAABB, type ProxyData } from './collision';
import type { AssetMeta, Box, Obstacle, RoutePoint, Vec } from './types';
export interface TrickKnot extends Vec {
    t: number;
}
export interface PathContext {
    start: Vec;
    speed: number;
    performance: {
        speed: number;
        handling: number;
    };
    span: number;
    length: number;
    routes: RoutePoint[];
    obstacles: Obstacle[];
    catalog: Map<string, AssetMeta>;
    proxies: Map<string, ProxyData>;
    ground: (x: number, z: number) => number;
}
interface State {
    point: TrickKnot;
    cost: number;
    parent: State | null;
}
interface Solid {
    box: Box;
    moving?: Obstacle['moving'];
    obstacle: Obstacle; meta: AssetMeta; proxy?: ProxyData;
}
// A route holds its line through the complete model, then bends in open space.
export function routePosition(routes: RoutePoint[], z: number, start: Vec): {
    x: number;
    y: number;
} {
    const knots = [{ ...start, z: start.z - 1 }, ...routes.filter(r => r.z > start.z - 60).flatMap(r => [
            { x: r.x, y: r.y, z: r.z - 60 }, { x: r.x, y: r.y, z: r.z + 60 }
        ])].sort((a, b) => a.z - b.z);
    for (let i = 1; i < knots.length; i++)
        if (z <= knots[i].z) {
            const a = knots[i - 1], b = knots[i];
            const t = smooth((z - a.z) / Math.max(1, b.z - a.z));
            return { x: mix(a.x, b.x, t), y: mix(a.y, b.y, t) };
        }
    return knots.at(-1) ?? start;
}
export function predictTrickDistances(c: Pick<PathContext, 'start' | 'speed' | 'performance'>): TrickKnot[] {
    const points: TrickKnot[] = [{ ...c.start, t: 0 }];
    let z = c.start.z, v = c.speed;
    for (let frame = 1; frame <= 1080; frame++) {
        const t = frame / 60;
        v = damp(v, baseSpeed(z) * c.performance.speed * (t <= 15 ? 1.2 : 1), t <= 15 ? 4 : 2.2, 1 / 60);
        z += v / 60;
        if (frame % 6 === 0)
            points.push({ x: 0, y: 0, z, t });
    }
    return points;
}
function solids(c: PathContext): Solid[] {
    const result: Solid[] = [];
    for (const o of c.obstacles) {
        const meta = c.catalog.get(o.model)!;
        const proxy = c.proxies.get(o.model);
        result.push({ box: collisionBounds(o, meta, proxy), moving: o.moving, obstacle: o, meta, proxy });
    }
    return result;
}
function segmentClear(a: Vec, b: Vec, boxes: Solid[], radius: Vec, c: PathContext): boolean {
    if (b.y < c.ground(b.x, b.z) + radius.y + 2)
        return false;
    for (const s of boxes) {
        let box = s.box;
        if (s.moving) {
            const axis = s.moving.axis, amplitude = s.moving.amplitude;
            box = { min: { ...box.min, [axis]: box.min[axis] - amplitude }, max: { ...box.max, [axis]: box.max[axis] + amplitude } };
        }
        if (box.min.z - radius.z > Math.max(a.z, b.z) || box.max.z + radius.z < Math.min(a.z, b.z))
            continue;
        if (box.min.x - radius.x > Math.max(a.x, b.x) || box.max.x + radius.x < Math.min(a.x, b.x) || box.min.y - radius.y > Math.max(a.y, b.y) || box.max.y + radius.y < Math.min(a.y, b.y))
            continue;
        const expanded = { ...radius };
        if (s.moving) expanded[s.moving.axis] += s.moving.amplitude + Math.abs(s.obstacle.position[s.moving.axis] - (s.obstacle.home?.[s.moving.axis] ?? s.obstacle.position[s.moving.axis]));
        if (sweepAABB(a, b, box, radius) && obstacleContact(s.obstacle, s.meta, s.proxy, a, b, expanded)) return false;
    }
    return true;
}
export interface TrickPathResult { knots: TrickKnot[]; strength: number; clear: boolean; failureAt?: number[]; method?: 'direct-validated' | 'beam' }
function trickRadius(c: PathContext, t: number, strength: number) {
    const acrobat = strength > 0 && t >= .7 && t < 14.2, envelope = smooth((t - .7) / 1.5);
    return { x: acrobat ? mix(c.span * .34, Math.max(c.span * .48, c.length * .48), envelope) : c.span * .34,
        y: acrobat ? mix(1.05, Math.max(c.span * .51, c.length * .54), envelope) : 1.05,
        z: acrobat ? mix(c.length * .25, c.length * .48, envelope) : c.length * .25 };
}
/** Prove a whole continuous candidate before spending a beam search on it.
 * Every segment uses the same exact geometry and rolling-body envelope as the
 * fallback. The final three seconds retain the normal-flight handoff proof. */
interface RecoveryProfile { descentAt: number; intermediateHeight: number; finalAt: number; finalHeight: number }
function directCandidate(c: PathContext, predicted: TrickKnot[], boxes: Solid[], strength: number, side: number, elevated = false, climbAt = 0, lane?: number, holdHeight?: number, recovery?: RecoveryProfile): TrickPathResult | null {
    const knots = [predicted[0]];
    for (let i = 1; i < predicted.length; i++) {
        const sample = predicted[i], t = sample.t, dt = t - predicted[i - 1].t, previous = knots[i - 1];
        const route = routePosition(c.routes, sample.z, c.start), arc = Math.sin(Math.PI * clamp(t / 15, 0, 1));
        const normal = t >= 14.2, maxX = (normal ? 18 * c.performance.handling : 85) * dt, maxY = (normal ? 12 * c.performance.handling : 85) * dt;
        const ceiling = t < 10.1 ? AIRSPACE.trickCeiling : mix(AIRSPACE.trickCeiling, AIRSPACE.normalTrickCeiling, smooth((t - 10.1) / 4.1));
        // Return through distinct altitude bands before manual control resumes.
        // Staying above a bridge until 15s can leave too little normal handling
        // to descend under a later moving object, despite a clear lower route.
        const height = recovery ? t < recovery.descentAt ? ceiling - 1 : t < recovery.finalAt ? recovery.intermediateHeight : recovery.finalHeight : holdHeight ?? (elevated && t > climbAt ? ceiling - 1 : route.y + 19 * strength * arc);
        const point = { t, z: sample.z,
            x: clamp((lane === undefined ? route.x : mix(c.start.x, lane, smooth(t / 1.5))) + Math.sin(t * .78) * 15 * strength * arc * side, Math.max(-AIRSPACE.trickHalfWidth, previous.x - maxX), Math.min(AIRSPACE.trickHalfWidth, previous.x + maxX)),
            y: clamp(height, Math.max(7, previous.y - maxY), Math.min(ceiling, previous.y + maxY)) };
        const radius = trickRadius(c, t, strength);
        if (!segmentClear(previous, point, boxes, radius, c)) return null;
        knots.push(point);
    }
    return { knots, strength, clear: true, method: 'direct-validated' };
}
export function createTrickPath(c: PathContext): TrickPathResult {
    const predicted = predictTrickDistances(c), boxes = solids(c);
    for (const strength of [1, .55, .18, 0]) for (const side of strength ? [1, -1, 0] : [0]) {
        const candidate = directCandidate(c, predicted, boxes, strength, side);
        if (candidate) return candidate;
    }
    // Dense urban streets may have no room to roll at roof height. Prove an
    // ascent through open air as well; delayed variants first leave an opening.
    for (const strength of [1, 0]) for (const climbAt of [0, .8, 1.6]) {
        const candidate = directCandidate(c, predicted, boxes, strength, 0, true, climbAt);
        if (candidate) return candidate;
    }
    // A moving obstacle can occupy the authored line during the return to
    // manual flight. Prove alternative flight lanes through the entire 18s
    // window before a cost-driven search commits to the obstructed line.
    for (const strength of [1, .55, 0]) for (const lane of [-24, 24, -16, 16]) for (const height of [undefined, 38, 26]) {
        const candidate = directCandidate(c, predicted, boxes, strength, 0, true, 0, lane, height);
        if (candidate) return candidate;
    }
    // A compact recovery bank avoids an expensive beam search when the high
    // approach and low handoff are individually clear but no fixed-height lane
    // connects them. Every segment retains the original geometry/body proof.
    for (const strength of [1, .55, 0]) for (const lane of [24, -24, 16, -16]) for (const intermediateHeight of [20, 24]) {
        const candidate = directCandidate(c, predicted, boxes, strength, 0, true, 0, lane, undefined, { descentAt: 12.5, intermediateHeight, finalAt: 16, finalHeight: 8 });
        if (candidate) return candidate;
    }
    const failures: number[] = [];
    for (const strength of [1, .55, .18, 0]) {
        let states: State[] = [{ point: predicted[0], cost: 0, parent: null }], failed = false;
        for (let i = 1; i < predicted.length; i++) {
            const sample = predicted[i], t = sample.t, dt = t - predicted[i - 1].t, route = routePosition(c.routes, sample.z, c.start);
            const arc = Math.sin(Math.PI * clamp(t / 15, 0, 1));
            const desired = { x: route.x + Math.sin(t * .78) * 15 * strength * arc, y: route.y + 19 * strength * arc };
            const normal = t >= 14.2, maxX = (normal ? 18 * c.performance.handling : 85) * dt, maxY = (normal ? 12 * c.performance.handling : 85) * dt;
            // Match the actual normal-flight envelope until the roll starts;
            // instant inflation could reject an otherwise escapable near-wall start.
            const radius = trickRadius(c, t, strength);
            const travelZ = (s: Solid) => s.moving?.axis === 'z' ? s.moving.amplitude : 0;
            const activeBoxes = boxes.filter(s => s.box.min.z - travelZ(s) - radius.z <= sample.z && s.box.max.z + travelZ(s) + radius.z >= predicted[i - 1].z);
            const future = predicted[Math.min(predicted.length - 1, i + 24)], futureBoxes = boxes.filter(s => s.box.min.z - travelZ(s) - radius.z <= future.z && s.box.max.z + travelZ(s) + radius.z >= sample.z);
            const next: State[] = [], dedupe = new Set<string>();
            for (const previous of states) {
                const a = previous.point;
                const forecast = routePosition(c.routes, future.z, c.start);
                const targets = [desired, route, forecast, { x: route.x, y: route.y + 6 }, { x: route.x - 6, y: route.y }, { x: route.x + 6, y: route.y }, { x: a.x, y: a.y }, { x: a.x, y: Math.min(t < 10.1 ? AIRSPACE.trickCeiling : mix(AIRSPACE.trickCeiling, AIRSPACE.normalTrickCeiling, smooth((t - 10.1) / 4.1)), a.y + maxY) }, { x: a.x, y: Math.max(8, a.y - maxY) }, { x: a.x - maxX, y: a.y }, { x: a.x + maxX, y: a.y }];
                for (const target of targets) {
                    const p: TrickKnot = { t, z: sample.z, x: clamp(target.x, Math.max(-AIRSPACE.trickHalfWidth, a.x - maxX), Math.min(AIRSPACE.trickHalfWidth, a.x + maxX)), y: clamp(target.y, Math.max(7, a.y - maxY), Math.min(t < 10.1 ? AIRSPACE.trickCeiling : mix(AIRSPACE.trickCeiling, AIRSPACE.normalTrickCeiling, smooth((t - 10.1) / 4.1)), a.y + maxY)) };
                    const key = p.x.toFixed(2) + ':' + p.y.toFixed(2);
                    if (dedupe.has(key) || !segmentClear(a, p, activeBoxes, radius, c))
                        continue;
                    dedupe.add(key);
                    const error = (p.x - desired.x) ** 2 + (p.y - desired.y) ** 2, travel = (p.x - a.x) ** 2 + (p.y - a.y) ** 2;
                    const impending = segmentClear(p, { ...p, z: future.z }, futureBoxes, radius, c) ? 0 : 45;
                    next.push({ point: p, cost: previous.cost + error * .015 + travel * .035 + impending, parent: previous });
                }
            }
            next.sort((a, b) => a.cost - b.cost);
            // Keeping only the cheapest nearby points collapses the beam into
            // one lane. Retain escape lanes/heights before a moving obstruction
            // arrives, especially during the constrained normal-flight handoff.
            const budget = strength === 0 ? 32 : 16, regions = new Set<string>();
            states = [];
            for (const candidate of next) {
                const region = Math.floor((candidate.point.x + AIRSPACE.trickHalfWidth) / 6) + ':' + Math.floor(candidate.point.y / 7);
                if (regions.has(region)) continue;
                regions.add(region); states.push(candidate);
                if (states.length >= budget) break;
            }
            for (const candidate of next) {
                if (states.length >= budget) break;
                if (!states.includes(candidate)) states.push(candidate);
            }
            if (!states.length) {
                failures.push(t);
                failed = true;
                break;
            }
        }
        if (!failed) {
            const knots: TrickKnot[] = [];
            let last: State | null = states[0];
            while (last) {
                knots.push(last.point);
                last = last.parent;
            }
            return { knots: knots.reverse(), strength, clear: true, method: 'beam' };
        }
    }
    // A failed proof must never substitute a path through solid geometry.
    return { knots: [], strength: 0, clear: false, failureAt: failures };
}
export function sampleTrickPath(knots: TrickKnot[], t: number, z: number): Vec {
    const i = Math.min(knots.length - 1, Math.max(1, Math.ceil(t * 10))), a = knots[i - 1], b = knots[i];
    const q = clamp((t - a.t) / Math.max(.001, b.t - a.t), 0, 1);
    return { x: mix(a.x, b.x, q), y: mix(a.y, b.y, q), z };
}
