import type { Placement, Settings, AssetMeta } from './types';
export interface GraphicsProfile {
    heroDistance: number;
    viewDistance: number;
    maxDPR: number;
    shadows: boolean;
    shadowSize: number;
    ambientOcclusion: boolean;
    bloom: number;
    cloudCells: number;
    terrainCell: number;
    animatedModels: number;
    detailDistance: number;
    rainDrops: number;
    landscapePlacements: number;
    animationDistance: number;
    animationDraws: number;
    samples: number;
    anisotropy: number;
    aoScale: number;
    heroTriangleBudget: number;
}
export const GRAPHICS: Record<Settings['quality'], GraphicsProfile> = {
    balanced: { heroTriangleBudget: 750000, heroDistance: 90, viewDistance: 1800, maxDPR: 1.5, shadows: false, shadowSize: 1024, ambientOcclusion: false, bloom: .05, cloudCells: 900, terrainCell: 12, animatedModels: 18, detailDistance: 200, rainDrops: 650, landscapePlacements: 22, animationDistance: 160, animationDraws: 150, samples: 0, anisotropy: 4, aoScale: .5 },
    high: { heroTriangleBudget: 1600000, heroDistance: 160, viewDistance: 2600, maxDPR: 2, shadows: true, shadowSize: 2048, ambientOcclusion: true, bloom: .06, cloudCells: 2600, terrainCell: 8, animatedModels: 28, detailDistance: 400, rainDrops: 1500, landscapePlacements: 34, animationDistance: 260, animationDraws: 260, samples: 2, anisotropy: 8, aoScale: .5 },
    ultra: { heroTriangleBudget: 2800000, heroDistance: 220, viewDistance: 3600, maxDPR: 2.5, shadows: true, shadowSize: 4096, ambientOcclusion: true, bloom: .09, cloudCells: 5200, terrainCell: 6, animatedModels: 40, detailDistance: 650, rainDrops: 2400, landscapePlacements: 48, animationDistance: 380, animationDraws: 440, samples: 4, anisotropy: 16, aoScale: 1 },
};
export const AIRSPACE = { halfWidth: 28, softEdge: 23, ceiling: 52, trickHalfWidth: 26, trickCeiling: 76, normalTrickCeiling: 49 } as const;

/** One native file can occupy several logical detail slots in a hosted build. */
export function resolveModelLOD(meta: AssetMeta, preferred: 0 | 1 | 2 | 3): 0 | 1 | 2 | 3 {
    const file = meta.exports[('lod' + preferred) as 'lod0' | 'lod1' | 'lod2' | 'lod3'] ?? meta.exports.lod1;
    for (const lod of [1, 2, 3, 0] as const)
        if (meta.exports[('lod' + lod) as 'lod0' | 'lod1' | 'lod2' | 'lod3'] === file) return lod;
    return preferred;
}

export function requiredFlightLOD(meta: AssetMeta, distance: number, scaleZ: number, quality: Settings['quality'], speed = 0): 0 | 2 {
    // Promote before the next presentation rebuild, even during very fast flight.
    return meta.exports.lod0 && distance - speed * .5 - meta.bounds.size[2] * scaleZ / 2 < GRAPHICS[quality].heroDistance && distance > -160 ? 0 : 2;
}

/** Reject source LODs whose silhouette/ground contact differs from the collision model. */
export function compatibleModelLOD(meta: AssetMeta, preferred: 0 | 1 | 2 | 3): 0 | 1 | 2 | 3 {
    if (preferred === 0 && meta.exports.lod0) return resolveModelLOD(meta, 0);
    const hero = meta.lodBounds?.lod0 ?? meta.bounds;
    for (const lod of (preferred === 3 ? [3, 2, 1, 0] : preferred === 2 ? [2, 1, 0] : [1, 0]) as (0 | 1 | 2 | 3)[]) {
        if (!meta.exports[('lod' + lod) as 'lod0' | 'lod1' | 'lod2' | 'lod3']) continue;
        const bounds = meta.lodBounds?.[('lod' + lod) as 'lod0' | 'lod1' | 'lod2' | 'lod3'];
        if (!bounds || lod === 0 || Math.abs(bounds.min[1] - hero.min[1]) <= .35 && [0, 1, 2].every(axis =>
            Math.max(Math.abs(bounds.min[axis] - hero.min[axis]), Math.abs(bounds.max[axis] - hero.max[axis])) <= Math.max(.6, hero.size[axis] * .12))) return resolveModelLOD(meta, lod);
    }
    return resolveModelLOD(meta, meta.exports.lod0 ? 0 : 1);
}
/** Keep medium detail resident without escalating an incompatible LOD1 to a costly hero. */
export function residentModelLOD(meta: AssetMeta, quality: Settings['quality']): 0 | 1 | 2 | 3 {
    const coarse = compatibleModelLOD(meta, 2);
    if (quality === 'balanced') return coarse;
    const medium = compatibleModelLOD(meta, 1);
    return medium === 0 && coarse !== 0 ? coarse : medium;
}
export function resolutionFloor(settings: Settings, deviceRatio: number) {
    const native = Math.min(Math.max(1, deviceRatio), GRAPHICS[settings.quality].maxDPR);
    // Adaptive rendering must also help a 1x display at the 100% setting.
    // Keep the explicit resolution selection unchanged until adaptation is needed.
    return settings.adaptiveResolution ? Math.max(.65, native * .6) : native;
}
export function renderPixelRatio(settings: Settings, deviceRatio: number) {
    return Math.min(Math.max(1, deviceRatio), GRAPHICS[settings.quality].maxDPR) * (settings.resolutionScale ?? 1.25);
}
/** Half-float MSAA support differs by GPU; never request an unreported format. */
export function supportedSamples(requested: number, supported: readonly number[]) {
    return Math.max(0, ...supported.filter(n => Number.isInteger(n) && n > 0 && n <= requested));
}
export interface FlightFocus { x: number; y: number; z: number; speed: number; span: number }
export function requiresHeroSurface(meta: AssetMeta, p: Placement, focus: FlightFocus, quality: Settings['quality']): boolean {
    const profile = GRAPHICS[quality], bounds = meta.motionBounds ?? meta.bounds;
    const rx = Math.max(Math.abs(bounds.min[0]), Math.abs(bounds.max[0])) * p.sx;
    const rz = Math.max(Math.abs(bounds.min[2]), Math.abs(bounds.max[2])) * p.sz;
    const c = Math.abs(Math.cos(p.yaw)), s = Math.abs(Math.sin(p.yaw));
    const reachX = rx * c + rz * s, reachZ = rz * c + rx * s, z = p.z - focus.z;
    const side = Math.max(0, Math.abs(p.x - focus.x) - reachX - focus.span * .34 - (p.move?.axis === 'x' ? p.move.amplitude : 0));
    return !!(p.collision && meta.exports.lod0 && z > -60 - reachZ && z - reachZ - focus.speed * .5 < profile.heroDistance && side < 12);
}
export function flightModelLOD(meta: AssetMeta, p: Placement, focus: FlightFocus, quality: Settings['quality']): 0 | 1 | 2 | 3 {
    if (requiresHeroSurface(meta, p, focus, quality)) return resolveModelLOD(meta, 0);
    const profile = GRAPHICS[quality], bounds = meta.motionBounds ?? meta.bounds, z = p.z - focus.z;
    const distance = Math.hypot(p.x - focus.x, p.y + bounds.size[1] * p.sy * .4 - focus.y, z);
    const size = Math.max(bounds.size[0] * p.sx, bounds.size[1] * p.sy, bounds.size[2] * p.sz * .5);
    const projected = size / Math.max(1, distance);
    if (meta.exports.lod0 && projected > .3 && distance < profile.heroDistance * 1.5 && z > -80) return resolveModelLOD(meta, 0);
    if (meta.exports.lod3 && distance > profile.detailDistance * 2 && projected < .018) return compatibleModelLOD(meta, 3);
    const detail = p.role === 'landscape' ? profile.detailDistance * .65 : profile.detailDistance;
    return compatibleModelLOD(meta, distance < detail || projected > .045 && distance < profile.detailDistance * 2 ? 1 : 2);
}
export function nativeAnimationDistance(meta: AssetMeta, lod: 0 | 1 | 2 | 3, quality: Settings['quality'], preparedDraws?: number) {
    const draws = preparedDraws ?? meta.renderCosts?.[('lod' + lod) as 'lod0' | 'lod1' | 'lod2' | 'lod3']?.draws ?? 12;
    return Math.min(GRAPHICS[quality].animationDistance, draws > 140 ? 65 : draws > 65 ? 115 : draws > 30 ? 180 : Infinity);
}

/** Unbounded flight speed must not create an unbounded render scene. */
export function flightHorizon(speed: number, quality: Settings['quality']) {
    return Math.min(GRAPHICS[quality].viewDistance, Math.max(1050, speed * 8));
}
