import { collisionBounds, obstacleContact, transformBox, type ProxyData } from './collision';
import { AIRSPACE } from './graphics';
import type { Aircraft, AssetMeta, Obstacle, RoutePoint, Vec } from './types';

export const ROUTE_CHOICE_BONUS = 90;
export interface ChoiceLane { x: number; y: number; radiusX: number; radiusY: number }
export interface RouteChoice {
    id: string;
    z: number;
    role: string;
    safe: ChoiceLane;
    risk: ChoiceLane;
    /** Proven approach / departure samples, in world coordinates. */
    paths: { safe: Vec[]; risk: Vec[] };
}
export interface ChoiceHUDLane extends ChoiceLane {
    dx: number;
    dy: number;
    screen?: { x: number; y: number; visible: boolean };
}
export interface ChoiceHUD {
    id: string;
    distance: number;
    bonus: number;
    safe: ChoiceHUDLane;
    risk: ChoiceHUDLane;
}
export interface RouteChoiceContext {
    plane: Pick<Aircraft, 'span' | 'length'>;
    speed: number;
    handling: number;
    previous: Vec;
    next: Vec;
    catalog: ReadonlyMap<string, AssetMeta>;
    proxies: ReadonlyMap<string, ProxyData>;
    obstacles: readonly Obstacle[];
    ground: (x: number, z: number) => number;
}
const eligibleRoles = new Set(['arch', 'tunnel', 'under', 'bridge', 'wall', 'over', 'roof', 'slalom', 'spire']);
const finite = (...values: number[]) => values.every(Number.isFinite);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const atZ = (a: Vec, b: Vec, z: number): Vec => {
    const t = Math.min(1, Math.max(0, (z - a.z) / (b.z - a.z)));
    return { x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), z };
};

/**
 * Existing authored risk offsets are hints, not a proof of a second passage.
 * Advertise a choice only after both envelopes clear the loaded native collision
 * geometry, terrain and manoeuvring limits. Unknown or moving geometry fails
 * closed. Call after streaming and cache successful candidates for this sector.
 */
export function createRouteChoice(route: RoutePoint, id: string, context: RouteChoiceContext): RouteChoice | null {
    const { plane, previous, next, speed, handling } = context;
    if (!id || !eligibleRoles.has(route.role) || !finite(route.x, route.y, route.z, route.width, route.height, route.dangerX, route.dangerY,
        plane.span, plane.length, previous.x, previous.y, previous.z, next.x, next.y, next.z, speed, handling)
        || speed <= 0 || handling <= 0 || plane.span <= 0 || plane.length <= 0 || previous.z >= route.z || next.z <= route.z) return null;
    const separation = Math.hypot(route.dangerX - route.x, route.dangerY - route.y);
    if (separation < 5.5 || separation > 13) return null;
    const safe: ChoiceLane = { x: route.x, y: route.y, radiusX: 3.2, radiusY: 2.0 };
    const risk: ChoiceLane = { x: route.dangerX, y: route.dangerY, radiusX: 1.8, radiusY: 1.1 };
    // The narrower target must remain inside the existing scored passage. A
    // ring drawn below or outside that passage must not advertise a payout.
    if (Math.abs(risk.x - route.x) + risk.radiusX > route.width / 2
        || Math.abs(risk.y - route.y) + risk.radiusY > route.height / 2) return null;
    const body = { x: plane.span * .34, y: 1.05, z: plane.length * .25 };
    if ([safe, risk].some(lane => Math.abs(lane.x) + lane.radiusX + body.x > AIRSPACE.halfWidth
        || lane.y + lane.radiusY + body.y >= AIRSPACE.ceiling)) return null;

    const lead = Math.min(Math.max(85, speed * (1.1 + 1.5 / handling)), (route.z - previous.z) * .72, (next.z - route.z) * .72);
    const hold = Math.min(25, lead * .25);
    if (lead < 40) return null;
    const start = atZ(previous, route, route.z - lead), end = atZ(route, next, route.z + lead);
    const path = (lane: ChoiceLane) => [start, { x: lane.x, y: lane.y, z: route.z - hold }, { x: lane.x, y: lane.y, z: route.z + hold }, end];
    const paths = { safe: path(safe), risk: path(risk) };
    const lo = Math.min(...[...paths.safe, ...paths.risk].map(p => p.x)) - body.x - safe.radiusX;
    const hi = Math.max(...[...paths.safe, ...paths.risk].map(p => p.x)) + body.x + safe.radiusX;
    const lowY = Math.min(...[...paths.safe, ...paths.risk].map(p => p.y)) - body.y - safe.radiusY;
    const highY = Math.max(...[...paths.safe, ...paths.risk].map(p => p.y)) + body.y + safe.radiusY;
    const relevant: { obstacle: Obstacle; meta: AssetMeta; proxy: ProxyData }[] = [];
    for (const obstacle of context.obstacles) {
        const meta = context.catalog.get(obstacle.model);
        if (!meta) return null;
        const proxy = context.proxies.get(obstacle.model);
        // collisionBounds is shared with physics and caches its returned box.
        // Expanding a moving envelope must never mutate that shared result.
        const bounds = collisionBounds(obstacle, meta, proxy);
        const box = { min: { ...bounds.min }, max: { ...bounds.max } };
        // Before a proxy arrives, static catalog bounds can hide a turbine arm
        // or rotating mechanism whose authored motion enters the route.
        if (meta.motionBounds) {
            const motion = meta.motionBounds;
            const envelope = transformBox(motion.min.map((value, index) => (value + motion.max[index]) / 2), motion.size,
                obstacle.position, obstacle.scale, obstacle.yaw);
            for (const axis of ['x', 'y', 'z'] as const) {
                box.min[axis] = Math.min(box.min[axis], envelope.min[axis]);
                box.max[axis] = Math.max(box.max[axis], envelope.max[axis]);
            }
        }
        if (obstacle.moving) {
            const { axis, amplitude } = obstacle.moving;
            // Actors oscillate around home, not around their current pose.
            const offset = (obstacle.home?.[axis] ?? obstacle.position[axis]) - obstacle.position[axis];
            box.min[axis] = Math.min(box.min[axis], box.min[axis] + offset - amplitude);
            box.max[axis] = Math.max(box.max[axis], box.max[axis] + offset + amplitude);
        }
        if (box.max.z < start.z - body.z || box.min.z > end.z + body.z || box.max.x < lo || box.min.x > hi || box.max.y < lowY || box.min.y > highY) continue;
        if (!proxy || obstacle.moving || meta.moving || proxy.dynamic.length || proxy.meshes?.some(mesh => mesh.animated)) return null;
        relevant.push({ obstacle, meta, proxy });
    }
    // Empty air cannot become a risk choice just because a marker says so.
    if (!relevant.length) return null;
    for (const kind of ['safe', 'risk'] as const) {
        const lane = { safe, risk }[kind], knots = paths[kind];
        const radius = { x: body.x + lane.radiusX, y: body.y + lane.radiusY, z: body.z + .5 };
        for (let index = 1; index < knots.length; index++) {
            const a = knots[index - 1], b = knots[index];
            const travel = (b.z - a.z) / (speed * 1.35);
            const turn = Math.max(Math.abs(b.x - a.x) / (18 * handling), Math.abs(b.y - a.y) / (12 * handling));
            if (travel < turn + (turn > 0 ? .35 : 0)) return null;
            for (let sample = 0; sample <= 16; sample++) {
                const t = sample / 16, x = mix(a.x, b.x, t), y = mix(a.y, b.y, t), z = mix(a.z, b.z, t);
                if (Math.abs(x) + radius.x > AIRSPACE.halfWidth || y + radius.y >= AIRSPACE.ceiling) return null;
                for (const side of [-1, 0, 1]) {
                    const ground = context.ground(x + side * radius.x, z);
                    if (!Number.isFinite(ground) || y - radius.y <= ground + .65) return null;
                }
            }
            if (relevant.some(({ obstacle, meta, proxy }) => obstacleContact(obstacle, meta, proxy, a, b, radius))) return null;
        }
    }
    return { id, z: route.z, role: route.role, safe, risk, paths };
}

/** This classifier is pure; the caller owns the once-per-passage ledger. */
export function choiceCrossing(choice: RouteChoice, before: Vec, after: Vec): 'safe' | 'risk' | null {
    if (!finite(before.x, before.y, before.z, after.x, after.y, after.z) || after.z <= before.z || before.z >= choice.z || after.z < choice.z) return null;
    const t = (choice.z - before.z) / (after.z - before.z);
    const x = mix(before.x, after.x, t), y = mix(before.y, after.y, t);
    const inside = (lane: ChoiceLane) => Math.hypot((x - lane.x) / lane.radiusX, (y - lane.y) / lane.radiusY) <= 1 + 1e-9;
    return inside(choice.risk) ? 'risk' : inside(choice.safe) ? 'safe' : null;
}

export function choiceHUD(choice: RouteChoice, position: Vec, bonus = ROUTE_CHOICE_BONUS): ChoiceHUD {
    const lane = (point: ChoiceLane): ChoiceHUDLane => ({ ...point, dx: point.x - position.x, dy: point.y - position.y });
    return { id: choice.id, distance: Math.max(0, choice.z - position.z), bonus: Number.isSafeInteger(bonus) && bonus >= 0 ? bonus : ROUTE_CHOICE_BONUS, safe: lane(choice.safe), risk: lane(choice.risk) };
}
