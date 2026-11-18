import { THEMES } from './data';
import type { ThemeId } from './types';

export const JOURNEY_MARKS = [0, 38, 85, 130] as const;
export function journeyThemes(seed: number): ThemeId[] {
    const finales: ThemeId[] = ['forest', 'ice', 'desert', 'river', 'waterfall'];
    return ['coast', 'village', 'city', finales[(seed >>> 0) % finales.length]];
}
export function journeyTheme(seed: number, cruiseSeconds: number) {
    const index = Math.max(0, JOURNEY_MARKS.findLastIndex(mark => cruiseSeconds >= mark));
    return { theme: THEMES.find(t => t.id === journeyThemes(seed)[index])!, variant: 0 };
}
export interface JourneyHUD { themes: ThemeId[]; index: number; progress: number; arrival: boolean }
