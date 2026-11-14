import { clamp, smooth, hash } from './data';
import type { ThemeId, AssetMeta } from './types';

export const WATER_LEVEL = .15;
export const WORLD_HALF_WIDTH = 640;
/** Bounds include the pier's railing caps; snap points describe its actual walking deck. */
export function deckSurfaceY(meta: AssetMeta) {
    return meta.sockets.snap_front?.[1] ?? meta.sockets.snap_top?.[1] ?? meta.bounds.max[1];
}
export const isWaterLandscape = (theme: ThemeId, variant = 0) => {
    // Every Korean subregion includes water, including the village/rice rivers.
    // Keep the subregion argument in the shared terrain API.
    void variant;
    return ['coast', 'ice', 'forest', 'korea', 'river', 'aurora', 'volcano', 'waterfall'].includes(theme);
};

/** Geographic districts stay fixed in world metres as chunks stream past. */
export function harborAt(z: number, seed: number) {
    const block = Math.floor(Math.max(0, z) / 640);
    return block < 2 || hash(block * 271 + seed) > .26;
}
export function shorelineAt(z: number, seed: number) {
    const phase = hash(seed) * Math.PI * 2;
    return 57 + Math.sin(z * .005 + phase) * 13 + Math.sin(z * .017 + phase * 2) * 5;
}

/** Three independent island chains, entirely outside the normal flight corridor. */
export function offshoreIslandX(z: number, seed: number, chain = 0) {
    const phase = hash(seed + chain * 977) * Math.PI * 2;
    return -174 - chain * 164 - Math.sin(z * (.0038 + chain * .0007) + phase) * (25 + chain * 10);
}

/** One physical surface for terrain, collision and rooted models. No rendered-only mountains. */
export function terrainElevation(x: number, z: number, theme: ThemeId, seed: number, variant = 0): number {
    const phase = hash(seed + 417) * Math.PI * 2;
    const a = Math.abs(x), water = isWaterLandscape(theme, variant);
    if (theme === 'coast' || theme === 'korea' && variant === 3) {
        // An inhabited quay, irregular beaches, green headlands and offshore islands.
        if (harborAt(z, seed) && x >= 26 && x <= 70)
            return 2.2;
        const shore = shorelineAt(z, seed), inland = x - shore;
        if (inland >= 0) {
            const beach = smooth(inland / 12) * 2.2;
            const hills = smooth((inland - 19) / 67) * (13 + 17 * Math.sin(z * .0056 + x * .018 + phase) ** 2);
            // Green shelves and pale exposed headland faces give the coastline
            // a readable foreground/midground silhouette rather than one ramp.
            const headland = smooth((inland - 68) / 35) * (12 + 23 * Math.sin(z * .0031 + phase * .7) ** 4);
            const ridges = smooth((inland - 170) / 210) * (35 + 65 * Math.sin(z * .0019 - x * .0055 + phase) ** 2);
            return beach + hills + headland + ridges;
        }
        if (x < -112) {
            let islands = 0;
            for (let chain = 0; chain < 3; chain++) {
                const centre = offshoreIslandX(z, seed, chain), width = 46 + chain * 18;
                const longitudinal = smooth((Math.sin(z * (.0052 - chain * .0009) + phase + chain * 2.1) + .34) / .96);
                const profile = Math.exp(-(((x - centre) / width) ** 2));
                islands = Math.max(islands, profile * longitudinal * (32 + chain * 25));
            }
            return -3.6 + islands;
        }
        return -3.6;
    }
    const city = theme === 'city' || theme === 'korea' && variant === 0;
    // A continuous river channel beside Seoul's urban flight corridor.
    if (theme === 'korea' && variant === 0 && x > -51 && x < -16) return -3.6;
    // Traditional villages and rice terraces have a narrow river on their left,
    // so ferries and the historical ship can appear on water in every Korean route.
    if (theme === 'korea' && (variant === 1 || variant === 2) && a <= 54)
        return x > -35 && x < -16 ? -3.6 : 1.5;
    if (a <= 54)
        return water && !city ? -3.6 : 1.5;
    const bank = smooth((a - 54) / 15) * 4.5;
    if (city)
        return 1.5 + smooth((a - 95) / 130) * (8 + 20 * Math.sin(z * .005 + x * .012 + phase) ** 2);
    const lowland = theme === 'farm' || theme === 'korea' && variant === 2;
    const hills = smooth((a - (lowland ? 170 : 84)) / 95) * (lowland ? 12 : 33) *
        (.38 + .62 * Math.sin(z * .006 + x * .018 + phase) ** 2);
    const ridges = smooth((a - 170) / 150) * (lowland ? 23 : 80) *
        (.45 + .55 * Math.sin(z * .0033 - x * .009 + phase) ** 2);
    if (theme === 'volcano') {
        const crater = Math.hypot((a - 210) * .82, (z % 1024 - 512) * .30);
        return 1.5 + bank + hills + Math.max(0, 82 - Math.abs(crater - 64) * 1.3);
    }
    if (theme === 'desert') {
        const shelf = smooth((a - 82) / 28) * (18 + 8 * Math.sin(z * .003 + phase) ** 2);
        const mesa = smooth((a - 153) / 34) * (27 + 24 * Math.sin(z * .0022 + x * .003 + phase) ** 4);
        return 1.5 + bank + shelf + mesa + hills * .35 + ridges * .65;
    }
    if (theme === 'waterfall') {
        const gorge = smooth((a - 66) / 23) * (22 + 17 * Math.sin(z * .0041 + phase) ** 2);
        return -3.6 + bank + gorge + hills * .75 + ridges;
    }
    if (theme === 'ice' || theme === 'aurora') {
        const shelf = smooth((a - 61) / 34) * (11 + 12 * Math.sin(z * .0036 + phase) ** 2);
        return -3.6 + bank + shelf + hills * .75 + ridges * 1.25;
    }
    return (water ? -3.6 : 1.5) + bank + hills + ridges;
}
export function groundAt(x: number, z: number, theme: ThemeId, seed: number, variant = 0) {
    return Math.max(isWaterLandscape(theme, variant) ? WATER_LEVEL : -Infinity, terrainElevation(x, z, theme, seed, variant));
}

/** Match the actual two triangles of a rendered terrain cell when planting a prop. */
export function renderedTerrainHeight(x: number, z: number, theme: ThemeId, seed: number, variant = 0, cellSize = 8) {
    const cell = WORLD_HALF_WIDTH * 2 / Math.ceil(WORLD_HALF_WIDTH * 2 / cellSize);
    const step = 128 / Math.ceil(128 / cellSize);
    const x0 = -WORLD_HALF_WIDTH + Math.floor((x + WORLD_HALF_WIDTH) / cell) * cell;
    const z0 = Math.floor(z / 128) * 128 + Math.floor((z % 128 + 128) % 128 / step) * step;
    const u = clamp((x - x0) / cell, 0, 1), v = clamp((z - z0) / step, 0, 1);
    const h00 = terrainElevation(x0, z0, theme, seed, variant), h10 = terrainElevation(x0 + cell, z0, theme, seed, variant);
    const h01 = terrainElevation(x0, z0 + step, theme, seed, variant), h11 = terrainElevation(x0 + cell, z0 + step, theme, seed, variant);
    const triangle = u >= v ? h00 + u * (h10 - h00) + v * (h11 - h10) : h00 + v * (h01 - h00) + u * (h11 - h01);
    const quay = (theme === 'coast' || theme === 'korea' && variant === 3) && harborAt(z, seed) && x >= 26 && x <= 70;
    if (quay) {
        const road = Math.abs(x - 28) <= 1.6 || Math.abs(x - 42) <= .6;
        return Math.max(road ? 2.25 : 2.2, triangle);
    }
    const urban = theme === 'city' || theme === 'korea' && variant === 0;
    if (urban && (Math.abs(x) <= 9 || Math.abs(Math.abs(x) - 13) <= 3)) {
        const marking = Math.abs(x) <= .10 && Math.floor(z0 / 8) % 2 === 0 && z - z0 <= step * .55;
        return Math.max(marking ? 1.565 : 1.55, triangle);
    }
    const village = theme === 'village' || theme === 'farm' || theme === 'korea' && (variant === 1 || variant === 2);
    return village && Math.abs(x) <= 5 ? Math.max(1.55, triangle) : triangle;
}
