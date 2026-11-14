import { hash } from './data';
import { AIRSPACE, GRAPHICS } from './graphics';
import { themeFamily } from './scenery';
import { renderedTerrainHeight, shorelineAt, offshoreIslandX, WATER_LEVEL } from './world-ground';
import type { AssetMeta, Placement, Settings, ThemeId } from './types';

/** Layered natural shoulders: detailed foreground groves, middle-distance rock
 * silhouettes and distant ridges. Architecture stays in the authored route. */
export function landscapePlacements(index: number, theme: ThemeId, variant: number, seed: number, quality: Settings['quality'], catalog: Map<string, AssetMeta>): Placement[] {
    const profile = GRAPHICS[quality], pool = [...themeFamily(theme, variant).landscape];
    const coastal = theme === 'coast' || theme === 'korea' && variant === 3;
    const snowy = theme === 'ice' || theme === 'aurora';
    if (['forest', 'river', 'waterfall', 'volcano'].includes(theme) && catalog.has('columnar_basalt_outcrop')) pool.push('columnar_basalt_outcrop');
    if ((theme === 'forest' || theme === 'waterfall') && catalog.has('mountain_peak')) pool.push('mountain_peak');
    const wood = pool.filter(model => /pine|tree|fir|orchard/.test(model));
    const stone = pool.filter(model => /rock|stack|glacier|ice|mesa|spire|peak|basalt/.test(model));
    const placements: Placement[] = [], footprints: { x: number; z: number; radius: number }[] = [];
    const heightAt = (x: number, z: number) => renderedTerrainHeight(x, z, theme, seed, variant, profile.terrainCell);
    for (let attempt = 0; attempt < profile.landscapePlacements * 9 && placements.length < profile.landscapePlacements; attempt++) {
        const grove = attempt % 6, salt = seed + index * 7919 + grove * 1049;
        const distant = grove === 3 || grove === 5, middle = grove === 2 || grove === 4;
        const centreZ = index * 128 + 20 + hash(salt + 53) * 88;
        const z = Math.max(index * 128 + 2, Math.min(index * 128 + 126, centreZ + (hash(salt + attempt * 43) - .5) * 66));
        const preferred = distant && stone.length ? stone : !middle && wood.length ? wood : pool;
        let model = preferred[Math.min(preferred.length - 1, Math.floor(hash(salt + attempt * 307) * preferred.length))];
        if (['pine_cluster', 'decorative_tree', 'orchard_windbreak'].includes(model) && !middle && !distant && !snowy && catalog.has('pine_tree_single')) model = 'pine_tree_single';
        const meta = catalog.get(model); if (!meta) continue;
        const woody = /pine|tree|fir|orchard/.test(model), rock = /rock|stack|glacier|ice|mesa|spire|peak/.test(model);
        let scale = (woody ? .9 : distant ? 1.55 : .85) + hash(salt + attempt * 89) * (woody ? .8 : distant ? 1.5 : .95);
        scale = Math.min(scale, (woody ? middle || distant ? 38 : 20 : distant ? 100 : 54) / Math.max(1, meta.bounds.size[1]));
        const yaw = (hash(salt + attempt * 197) - .5) * Math.PI * 2;
        const reachX = (Math.abs(Math.cos(yaw)) * meta.bounds.size[0] + Math.abs(Math.sin(yaw)) * meta.bounds.size[2]) * scale * .5;
        const reachZ = (Math.abs(Math.sin(yaw)) * meta.bounds.size[0] + Math.abs(Math.cos(yaw)) * meta.bounds.size[2]) * scale * .5;
        const side = grove % 2 ? -1 : 1, scatter = (hash(salt + attempt * 211) - .5) * (distant ? 78 : 30);
        let x = side * (distant ? 250 + hash(salt + 41) * 95 : middle ? 126 + hash(salt + 41) * 55 : 62 + hash(salt + 41) * 28) + scatter;
        if (coastal) x = grove >= 4 ? offshoreIslandX(z, seed, grove - 4) + scatter * .4 : shorelineAt(z, seed) + (distant ? 218 : middle ? 92 : 28) + scatter;
        const minimum = AIRSPACE.halfWidth + 14 + reachX;
        if (Math.abs(x) < minimum) x = Math.sign(x || 1) * minimum;
        const surface = heightAt(x, z);
        const contact = Math.min(surface, ...[-1, 1].flatMap(a => [-1, 1].map(b => heightAt(x + a * reachX * .65, z + b * reachZ * .65))));
        if (contact < WATER_LEVEL + .5 && !rock) continue;
        const radius = Math.max(3, Math.min(distant ? 38 : 24, Math.min(reachX, reachZ) * .66));
        if (footprints.some(p => Math.hypot(p.x - x, p.z - z) < radius + p.radius)) continue;
        const y = contact - meta.bounds.min[1] * scale - Math.min(.65, meta.bounds.size[1] * scale * .025);
        placements.push({ model, x, y, z, sx: scale, sy: scale, sz: scale, yaw, collision: false, role: 'landscape' });
        footprints.push({ x, z, radius });
    }
    return placements;
}
