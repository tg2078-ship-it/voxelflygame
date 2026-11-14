import assert from 'node:assert/strict';
import { createSim, catalog, proxies } from './fixtures';
import { THEMES } from '../../app/airrun/data';
import { groundAt } from '../../app/airrun/world-ground';
import { collisionBounds, obstacleContact, type ProxyData } from '../../app/airrun/collision';
import { createRouteChoice, choiceCrossing, choiceHUD, ROUTE_CHOICE_BONUS, type RouteChoiceContext, type RouteChoice } from '../../app/airrun/route-choice';
import type { AssetMeta, Obstacle, RoutePoint } from '../../app/airrun/types';

let checks = 0;
const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
const equal = (actual: unknown, expected: unknown, label: string) => { assert.deepEqual(actual, expected, label); checks++; };
let markers = 0, choices = 0;
let witness: { route: RoutePoint; context: RouteChoiceContext; choice: RouteChoice } | undefined;
const started = performance.now();
// Real catalog/proxies, procedural structures and terrain from every theme.
// Rejecting a candidate is expected; an unsupported risk offset is not a lane.
for (const theme of THEMES) for (const seed of [1, 42, 2781]) {
    const sim = createSim({ seed, practice: { theme: theme.id, variant: theme.id === 'korea' ? seed % 4 : 0, night: false, weather: 'clear', plane: 'skyhawk', level: 1 } });
    sim.generate(3200);
    for (const encounter of sim.encounters) for (let index = 0; index < encounter.route.length; index++) {
        const route = encounter.route[index]; markers++;
        const previous = encounter.route[index - 1] ?? { ...(encounter.entry ?? { x: 0, y: 24 }), z: encounter.start };
        const next = encounter.route[index + 1] ?? { x: route.x, y: route.y, z: encounter.start + encounter.length };
        const context: RouteChoiceContext = { plane: sim.plane, speed: sim.speed, handling: sim.performance.handling, previous, next, catalog, proxies, obstacles: sim.obstacles,
            ground: (x, z) => groundAt(x, z, encounter.theme, seed, encounter.variant) };
        const choice = createRouteChoice(route, `native:${theme.id}:${seed}:${encounter.start}:${index}`, context);
        if (!choice) continue;
        choices++;
        witness ??= { route, context, choice };
        check(route.role !== 'orientation', 'No scored choice is manufactured from an optional empty-air lesson');
        check(Math.hypot(choice.risk.x - choice.safe.x, choice.risk.y - choice.safe.y) >= 5.5, 'Both choices have visibly distinct targets');
        check(choice.risk.radiusX < choice.safe.radiusX && choice.risk.radiusY < choice.safe.radiusY, 'The bonus line requires a genuinely narrower aim');
        for (const kind of ['safe', 'risk'] as const) {
            const lane = choice[kind], path = choice.paths[kind];
            const body = { x: sim.plane.span * .34 + lane.radiusX, y: 1.05 + lane.radiusY, z: sim.plane.length * .25 + .5 };
            // Independently test against ALL native obstacles, not the helper's
            // filtered candidate set, to catch incorrect broad-phase exclusion.
            for (let knot = 1; knot < path.length; knot++) {
                check(sim.obstacles.every(obstacle => !obstacleContact(obstacle, catalog.get(obstacle.model)!, proxies.get(obstacle.model), path[knot - 1], path[knot], body)), 'Advertised envelope clears all native geometry through approach and rejoin');
            }
            const before = { x: lane.x, y: lane.y, z: choice.z - 80 }, after = { ...before, z: choice.z + 80 };
            equal(choiceCrossing(choice, before, after), kind, 'Swept high-speed passage classifies the actual chosen lane');
            equal(choiceCrossing(choice, after, before), null, 'Reverse travel cannot award a second crossing');
            equal(choiceCrossing(choice, { ...before, z: choice.z }, after), null, 'Starting on an already-crossed plane is not a second feat');
        }
    }
}
check(choices > 0 && witness, 'Real generated native structures expose conservative choices without new fake hazards');
const { route, context, choice } = witness!;
const create = (r: RoutePoint = route, c: RouteChoiceContext = context) => createRouteChoice(r, 'adversarial', c);
equal(create({ ...route, role: 'orientation' }), null, 'Orientation lines never qualify');
equal(create({ ...route, dangerX: route.x, dangerY: route.y }), null, 'Coincident targets never qualify');
equal(create({ ...route, dangerX: route.x + 30 }), null, 'Unreachable separated targets never qualify');
equal(create({ ...route, z: NaN }), null, 'Non-finite route coordinates fail closed');
equal(create(route, { ...context, speed: Infinity }), null, 'Non-finite flight speed fails closed');
equal(create(route, { ...context, speed: 10000 }), null, 'Insufficient steering time is not advertised as an option');
equal(create(route, { ...context, handling: 0 }), null, 'Invalid handling cannot produce a route');
equal(create(route, { ...context, previous: { ...context.previous, z: route.z } }), null, 'A missing approach cannot qualify');
equal(create(route, { ...context, obstacles: [] }), null, 'Empty air never earns an obstacle-choice bonus');
equal(create(route, { ...context, proxies: new Map() }), null, 'Unknown native collider geometry fails closed');
equal(create(route, { ...context, ground: () => NaN }), null, 'Unknown terrain fails closed');
equal(create(route, { ...context, ground: () => 100 }), null, 'Terrain can veto an otherwise clear path');

const prototype = catalog.values().next().value!;
const tinyBounds = { min: [-.1, -.1, -.1], max: [.1, .1, .1], size: [.2, .2, .2] };
const fixtureMeta: AssetMeta = { ...prototype, id: 'route-choice-blocker', bounds: tinyBounds, motionBounds: undefined, moving: false, clearances: [] };
const fixtureProxy: ProxyData = { schema: 1, id: fixtureMeta.id, static: [{ c: [0, 0, 0], s: [1, 1, 1] }], dynamic: [], clearances: [], coverage: { staticVolume: 1, method: 'isolated test solid' } };
const blocker: Obstacle = { id: 999999, model: fixtureMeta.id, position: { x: choice.risk.x, y: choice.risk.y, z: choice.z }, scale: { x: 1, y: 1, z: 1 }, size: { x: 1, y: 1, z: 1 }, yaw: 0, small: false, hit: false, scored: false, role: 'fixture' };
const withFixture = (meta: AssetMeta, obstacle: Obstacle, proxy?: ProxyData): RouteChoiceContext => ({ ...context,
    catalog: new Map([...catalog, [meta.id, meta]]), proxies: new Map([...proxies, ...(proxy ? [[meta.id, proxy] as const] : [])]), obstacles: [...context.obstacles, obstacle] });
equal(create(route, withFixture(fixtureMeta, blocker, fixtureProxy)), null, 'An actual solid in the bonus line disables the whole advertised choice');
const movingBlocker = { ...blocker, position: { ...blocker.position, x: choice.risk.x + 70 }, home: { ...blocker.position }, moving: { axis: 'x' as const, amplitude: 70, frequency: 1, phase: 0 } };
const cachedBefore = structuredClone(collisionBounds(movingBlocker, fixtureMeta, fixtureProxy));
equal(create(route, withFixture(fixtureMeta, movingBlocker, fixtureProxy)), null, 'Actor at its far oscillation edge still reserves the path around its home');
equal(collisionBounds(movingBlocker, fixtureMeta, fixtureProxy), cachedBefore, 'Candidate checking cannot enlarge physics cached collision bounds');
const animatedMeta = { ...fixtureMeta, moving: true, motionBounds: { min: [-80, -.5, -.5], max: [.5, .5, .5], size: [80.5, 1, 1] } };
const animatedObstacle = { ...blocker, position: { ...blocker.position, x: choice.risk.x + 70 } };
equal(create(route, withFixture(animatedMeta, animatedObstacle)), null, 'Unloaded animated motion envelope cannot hide behind a remote static pose');

const hud = choiceHUD(choice, { x: 2, y: 20, z: choice.z - 200 });
equal(hud.bonus, ROUTE_CHOICE_BONUS, 'The advertised reserve is explicit and fixed');
equal(hud.distance, 200, 'HUD range uses the actual passage plane');
equal([hud.risk.dx, hud.risk.dy], [choice.risk.x - 2, choice.risk.y - 20], 'HUD guidance points to physical target coordinates');
hud.risk.x += 100;
equal(choice.risk.x, route.dangerX, 'HUD snapshots cannot mutate the cached world proof');
equal(choiceHUD(choice, { x: 0, y: 0, z: choice.z + 1 }, NaN).bonus, ROUTE_CHOICE_BONUS, 'Invalid bonus values never enter presentation');
equal(choiceCrossing(choice, { x: NaN, y: 0, z: choice.z - 1 }, { x: 0, y: 0, z: choice.z + 1 }), null, 'Invalid crossing coordinates cannot earn reserve');
equal(choiceCrossing(choice, { x: 200, y: 200, z: choice.z - 1 }, { x: 200, y: 200, z: choice.z + 1 }), null, 'Merely passing the depth plane is not an aimed passage');
console.log(JSON.stringify({ routeChoiceChecks: checks, nativeMarkers: markers, conservativeChoices: choices, themes: THEMES.length,
    elapsedMilliseconds: Math.round(performance.now() - started), actualNativeCollisionProxies: true, hardwarePerformanceClaimed: false, status: 'passed' }));
