import * as T from 'three';
import type { ThemeId } from './types';
import { shorelineAt } from './world-ground';

interface TerrainPalette { ground: string; upland: string; rock: string; highlight: string; sand: string; bed: string }
const palettes: Record<ThemeId, TerrainPalette> = {
    coast: { ground: '#4c895b', upland: '#638d57', rock: '#939887', highlight: '#d2ccb1', sand: '#eed7a2', bed: '#164e61' },
    village: { ground: '#7a9c57', upland: '#587d45', rock: '#8b8071', highlight: '#b7ad90', sand: '#d6c38d', bed: '#34565a' },
    city: { ground: '#64806c', upland: '#4a7357', rock: '#859092', highlight: '#b9b7a6', sand: '#c3b997', bed: '#315f70' },
    ice: { ground: '#dcf0ed', upland: '#f5f7ed', rock: '#77a7b8', highlight: '#b5d8dd', sand: '#a9d9df', bed: '#214c6d' },
    desert: { ground: '#d9ad72', upland: '#e8ba7b', rock: '#ad6347', highlight: '#e1b27a', sand: '#ecc98a', bed: '#694f42' },
    forest: { ground: '#376b4c', upland: '#578151', rock: '#7e8e83', highlight: '#a7ad97', sand: '#c6c58f', bed: '#1e5960' },
    farm: { ground: '#87a55a', upland: '#667e47', rock: '#8b8970', highlight: '#b6ad89', sand: '#d2bf86', bed: '#3b6970' },
    korea: { ground: '#5d8c54', upland: '#3c7052', rock: '#87958a', highlight: '#c0bda0', sand: '#d9c994', bed: '#245e6b' },
    river: { ground: '#53885d', upland: '#3a7253', rock: '#7a9189', highlight: '#b4bda5', sand: '#d8ce9a', bed: '#205d69' },
    landmark: { ground: '#67895c', upland: '#4f7652', rock: '#91917f', highlight: '#cbc1a1', sand: '#d6c28e', bed: '#2c6172' },
    aurora: { ground: '#d4e9ee', upland: '#e8eff2', rock: '#6d8fae', highlight: '#bed3e8', sand: '#94c7d6', bed: '#1b3c5e' },
    volcano: { ground: '#3c4845', upland: '#53554e', rock: '#6e6355', highlight: '#a68161', sand: '#5c5147', bed: '#2f3434' },
    waterfall: { ground: '#3f7b57', upland: '#62945a', rock: '#657e78', highlight: '#a4b0a0', sand: '#d2c99c', bed: '#1a5d68' },
};
const colors = new Map<TerrainPalette, Record<keyof TerrainPalette, T.Color>>();
function paletteFor(theme: ThemeId, variant: number) {
    const id = theme === 'korea' ? variant === 0 ? 'city' : variant === 2 ? 'farm' : variant === 3 ? 'coast' : 'korea' : theme;
    const palette = palettes[id];
    if (!colors.has(palette)) colors.set(palette, Object.fromEntries(Object.entries(palette).map(([key, value]) => [key, new T.Color(value)])) as Record<keyof TerrainPalette, T.Color>);
    return colors.get(palette)!;
}

/** Terrain materials follow geology and slope instead of tinting every biome
 * with the same sand/gray. Coherent large patches avoid random voxel speckles. */
export function terrainSurfaceColor(theme: ThemeId, variant: number, seed: number, x: number, z: number, height: number, slope: number, out = new T.Color()) {
    const p = paletteFor(theme, variant), coastal = theme === 'coast' || theme === 'korea' && variant === 3;
    const frozen = theme === 'ice' || theme === 'aurora';
    out.copy(p.ground).lerp(p.upland, Math.min(.85, Math.max(0, height - 15) / 100));
    const exposure = Math.min(1, Math.max(0, (slope - .34) / .85));
    out.lerp(p.rock, exposure);
    if (exposure > .25) {
        const strata = .12 + .14 * Math.sin(height * .31 + Math.sin(z * .004) * .5);
        out.lerp(p.highlight, Math.max(0, strata) * exposure);
    }
    if (coastal && height < 3.5) out.copy(p.sand).lerp(p.rock, Math.max(0, (slope - .35) * .5));
    if (coastal && x > shorelineAt(z, seed) + 12 && height > 2) out.lerp(p.ground, .40 * (1 - exposure));
    if (frozen) out.lerp(p.highlight, Math.min(.65, Math.max(0, height) / 120) * (1 - exposure));
    if ((theme === 'farm' || theme === 'korea' && variant === 2) && Math.abs(x) > 65 && Math.abs(x) < 195) {
        const plot = ((Math.floor((x + 336) / 42) + Math.floor(z / 60)) % 3 + 3) % 3;
        out.set(['#a7ae53', '#d2b86b', '#6a9650'][plot]);
        if (theme === 'korea' && (Math.abs((x + 336) % 42) < 2 || Math.abs(z % 60) < 2)) out.set('#568c89');
    }
    const patch = Math.sin(x * .031 + seed * .007) * Math.sin(z * .019 - seed * .003);
    out.multiplyScalar(.965 + patch * .045);
    if (height < -.2) out.copy(p.bed);
    return out;
}
