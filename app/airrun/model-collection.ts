import { hash, THEMES } from './data';
import { transformBox, sweepAABB } from './collision';
import { groundAt, WATER_LEVEL, isWaterLandscape, deckSurfaceY } from './world-ground';
import { isWatercraft } from './model-kind';
import { AIRSPACE } from './graphics';
import { scenicDistrict } from './environment-palette';
import type { AssetMeta, Encounter, Placement, ThemeId, Box } from './types';

/** Every supplied non-aircraft asset has an explicit environmental home. */
export function modelHome(meta: AssetMeta): ThemeId {
    const category = THEMES.find(theme => theme.category === meta.category)?.id;
    if (category) return category;
    const id = meta.id;
    if (/korean/.test(id)) return 'korea';
    if (/mountain|cloudpeak|arched_viaduct|curved_stone/.test(id)) return 'forest';
    if (/pipe|bulkhead|pressure_door|hydraulic|radar|fuel_pylon/.test(id)) return 'desert';
    if (/retro|windsock|warning_bollard/.test(id)) return 'farm';
    if (/glass|gantry|neon|brand|information|flipdot|wayfinding|tri_vision|departure|directional|barrier|stair|drain/.test(id)) return 'city';
    if (/airlock|tunnel|truss|balcony|chain_hoist|lift_platform/.test(id)) return 'village';
    return 'coast';
}
const collections = new WeakMap<Map<string, AssetMeta>, Map<ThemeId, AssetMeta[]>>();
// A volcanic island is not a second desert industrial district. Reuse only
// geological silhouettes; the original industrial assets keep their desert home.
const VOLCANIC_LANDSCAPE = new Set(['rocky_arch', 'sea_stacks', 'rocky_ridge', 'mountain_peak',
    'columnar_basalt_outcrop', 'mesa_cliff', 'layered_rocks', 'natural_arch', 'sandstone_spire',
    'striped_slot_canyon', 'red_mesa_sky_arch']);
export function themeCollection(theme: ThemeId, catalog: Map<string, AssetMeta>) {
    let cache = collections.get(catalog); if (!cache) { cache = new Map(); collections.set(catalog, cache); }
    const existing = cache.get(theme); if (existing) return existing;
    const primary: ThemeId = theme === 'aurora' ? 'ice' : theme === 'river' || theme === 'waterfall' ? 'forest' : theme === 'landmark' ? 'korea' : theme === 'volcano' ? 'desert' : theme;
    const result = [...catalog.values()].filter(meta => meta.category !== 'aircraft' && meta.category !== 'traffic' &&
        (theme === 'volcano' ? VOLCANIC_LANDSCAPE.has(meta.id) : modelHome(meta) === primary));
    cache.set(theme, result); return result;
}
function bounds(p: Placement, catalog: Map<string, AssetMeta>): Box {
    const m = catalog.get(p.model)!, physical = m.motionBounds ?? m.bounds;
    const b = transformBox(physical.min.map((v, i) => (v + physical.max[i]) / 2), physical.size, p, { x: p.sx, y: p.sy, z: p.sz }, p.yaw);
    if (p.move) { b.min[p.move.axis] -= p.move.amplitude; b.max[p.move.axis] += p.move.amplitude; }
    return b;
}
function overlaps(a: Box, b: Box) { return (['x', 'y', 'z'] as const).every(axis => Math.min(a.max[axis], b.max[axis]) - Math.max(a.min[axis], b.min[axis]) > .15); }

/** A small, district-compatible discovery rotation. It never attempts to
 * exhibit the entire catalogue in one short flight; the archive keeps every
 * supplied model available independently of the route's art direction. */
export function curatedDistrictModels(theme: ThemeId, variant: number, patternIndex: number, catalog: Map<string, AssetMeta>) {
    const place = scenicDistrict(theme, variant, patternIndex);
    const explicit = new Set([...place.buildings, ...place.working, ...place.accents]);
    const affinity: Record<string, RegExp> = {
        'working-harbour': /harbor|cargo|pier|capstan|drydock|rescue|buoy|container|freight/,
        'fishing-market': /coastal|fishing|fishmarket|marina|lifeguard|buoy|boat|clockmarket/,
        'bridge-estuary': /bridge|bascule|buoy|harbor|pier|rescue/,
        'rocky-cape': /lighthouse|rock|sea_stack|sea_cave|coastal_villa|navigation|bird/,
        'market-quarter': /market|bakery|townhall|gazebo|well|fountain|pottery|smithy/,
        'mill-river': /mill|village_house|inn|timber|well|fence/,
        'chapel-hill': /chapel|church|bell|terrace|stone_wall|well/,
        'orchard-lane': /tree|village|inn|timber|well|fence/,
        'glass-downtown': /skyscraper|tower|glass|office|billboard|drone/,
        'rail-quarter': /rail|metro|station|freight|warehouse|tram/,
        'construction-docks': /crane|factory|warehouse|cargo|construction|freight/,
        'civic-square': /civic|library|clock|plaza|parking|billboard/,
    };
    const incidental = themeCollection(theme, catalog).filter(meta =>
        !/^(airport_|modular_|runway|taxiway|danger_gate|aeroway_|repair_|warning_bollard|retro_)/.test(meta.id) &&
        (!affinity[place.id] || affinity[place.id].test(meta.id)));
    return [...new Map([...incidental, ...[...explicit].flatMap(id => catalog.has(id) ? [catalog.get(id)!] : [])].map(meta => [meta.id, meta])).values()];
}
export function populateThemeCollection(encounter: Encounter, catalog: Map<string, AssetMeta>, seed: number, seen: Set<string>, span: number) {
    const patternIndex = Math.max(0, Number(encounter.id.split(':').at(-1)) - 1);
    const deck = curatedDistrictModels(encounter.theme, encounter.variant, patternIndex, catalog).sort((a, b) => hash(seed + encounter.start + [...a.id].reduce((n, c) => n * 31 + c.charCodeAt(0) | 0, 0)) - hash(seed + encounter.start + [...b.id].reduce((n, c) => n * 31 + c.charCodeAt(0) | 0, 0)));
    for (const p of encounter.placements) if (deck.some(meta => meta.id === p.model)) seen.add(p.model);
    // A new session/seed chooses a different compatible detail. Once the current
    // district inventory is exhausted, keep its authored scene instead of filling
    // the path with repeated landmark displays.
    const firstRoute = encounter.route[0], lastRoute = encounter.route.at(-1)!;
    const knots = [{ ...(encounter.entry ?? firstRoute), z: encounter.start }, ...encounter.route.flatMap(point => [{ x: point.x, y: point.y, z: point.z - 62 }, { x: point.x, y: point.y, z: point.z + 62 }]), { x: lastRoute.x, y: lastRoute.y, z: encounter.start + encounter.length }];
    const reserved = encounter.placements.filter(p => (p.course || p.role === 'route shoulder') && p.collision).map(p => bounds(p, catalog));
    const added: Box[] = [], water = isWaterLandscape(encounter.theme, encounter.variant);
    let count = 0;
    for (const meta of deck.filter(meta => !seen.has(meta.id))) {
        if (count >= 2) break;
        const natural = /rock|cliff|arch|tree|pine|ice|glacier|peak|mesa|spire|boulder|cactus/.test(meta.id);
        const flying = /airship|blimp|balloon|banner_plane|bird|drone/.test(meta.id);
        const vessel = isWatercraft(meta.id);
        const variation = .82 + hash(seed + encounter.start + meta.id.length * 271) * .36;
        const widthCap = vessel && encounter.theme === 'korea' ? 7.5 : 11;
        const scale = Math.min(1.5 * variation, widthCap * variation / Math.max(.1, meta.bounds.size[0]), 26 * variation / Math.max(.1, meta.bounds.size[1]), 31 * variation / Math.max(.1, meta.bounds.size[2]));
        const first = Math.floor(hash(seed + meta.id.length * 937 + encounter.start) * 24);
        for (let attempt = 0; attempt < 48; attempt++) {
            const slot = (first + attempt) % 24, coastal = encounter.theme === 'coast' || encounter.theme === 'korea' && encounter.variant === 3;
            const side = coastal ? vessel ? -1 : 1 : (attempt < 24 ? 1 : -1) * (hash(seed + first * 97 + encounter.start) < .5 ? -1 : 1);
            const z = encounter.start + 42 + slot * (encounter.length - 90) / 24 + (hash(first + slot * 93) - .5) * 10, x = side * Math.min(16 + hash(seed + slot * 521 + first) * 8, AIRSPACE.halfWidth - 1.7 - Math.max(Math.abs(meta.bounds.min[0]), Math.abs(meta.bounds.max[0])) * scale);
            const surface = groundAt(x, z, encounter.theme, seed, encounter.variant);
            const group = `collection:${meta.id}:${encounter.start}`;
            const plots: Placement[] = [];
            let base = surface;
            if (vessel) {
                if (!water || surface > WATER_LEVEL + .15) continue;
                base = WATER_LEVEL;
            }
            else if (!flying && !natural && water && surface <= WATER_LEVEL + .01) {
                const pier = catalog.get('modular_pier_deck'); if (!pier) continue;
                const sy = 5.55 / Math.max(.1, deckSurfaceY(pier) - pier.bounds.min[1]);
                plots.push({ model: pier.id, x, y: -3.6 - pier.bounds.min[1] * sy, z, sx: Math.max(1, (meta.bounds.size[0] * scale + 2) / pier.bounds.size[0]), sy, sz: Math.max(1, (meta.bounds.size[2] * scale + 2) / pier.bounds.size[2]), yaw: 0, collision: true, anchored: true, supported: true, course: false, role: 'foundation', group });
                base = 1.95;
            }
            const yaw = vessel || flying ? (side < 0 ? Math.PI : 0) : (hash(seed + z * 11) < .5 ? Math.PI : 0);
            const p: Placement = { model: meta.id, x, y: flying ? 38 : vessel ? base : base - meta.bounds.min[1] * scale, z, sx: scale, sy: scale, sz: scale, yaw, collision: true, anchored: !flying && !vessel, supported: plots.length > 0, course: false, role: 'collection', group };
            if (meta.moving) p.animationPhase = hash(seed + z * 13 + x * 7 + meta.id.length * 19) * Math.max(1, ...meta.animations.filter(clip => clip.autoplay).map(clip => clip.duration));
            if (flying) p.move = { axis: 'x', amplitude: 3, frequency: .19, phase: hash(z) * 6 };
            if (vessel) p.move = { axis: 'z', amplitude: 7, frequency: .15, phase: hash(z) * 6 };
            if (vessel) {
                const envelope = bounds(p, catalog);
                if ([envelope.min.x, envelope.max.x].some(px => [envelope.min.z, envelope.max.z].some(pz => groundAt(px, pz, encounter.theme, seed, encounter.variant) > WATER_LEVEL + .15))) continue;
            }
            plots.push(p);
            const boxes = plots.map(plot => bounds(plot, catalog));
            if (boxes.some(box => reserved.some(r => overlaps(box, r)) || added.some(r => overlaps(box, r)) || knots.slice(1).some((to, i) => !!sweepAABB(knots[i], to, box, { x: span * .34 + 2.4, y: 5.5, z: 12 })))) continue;
            const removed = new Set<string>();
            encounter.placements = encounter.placements.filter(old => {
                if (old.course || old.role === 'route shoulder' || old.role === 'collection') return true;
                const hit = boxes.some(box => overlaps(box, bounds(old, catalog)));
                if (hit && old.group) removed.add(old.group);
                return !hit;
            }).filter(old => !old.group || !removed.has(old.group));
            encounter.placements.push(...plots); added.push(...boxes); seen.add(meta.id); count++; break;
        }
    }
    return count;
}
