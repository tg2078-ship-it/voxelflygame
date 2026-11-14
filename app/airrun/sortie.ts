import type { Difficulty } from './encounter-director';

export const SORTIE_DURATION = 180 as const;
export const SORTIE_COMPLETION_BONUS = 1200 as const;
export type SortieStageId = 'departure' | 'build' | 'breather' | 'challenge' | 'extraction';
export interface SortieStage {
    id: SortieStageId;
    index: number;
    label: string;
    en: string;
    start: number;
    end: number;
    /** Only adds breathing room; the configured difficulty remains the challenge floor. */
    spacingMultiplier: number;
}
export const SORTIE_STAGES: readonly Readonly<SortieStage>[] = Object.freeze([
    Object.freeze({ id: 'departure', index: 0, label: '출격 항로', en: 'DEPARTURE', start: 0, end: 25, spacingMultiplier: 1.2 }),
    Object.freeze({ id: 'build', index: 1, label: '흐름 연결', en: 'BUILD FLOW', start: 25, end: 70, spacingMultiplier: 1.08 }),
    Object.freeze({ id: 'breather', index: 2, label: '재정비 구간', en: 'BREATHER', start: 70, end: 90, spacingMultiplier: 1.45 }),
    Object.freeze({ id: 'challenge', index: 3, label: '최종 도전', en: 'FINAL CHALLENGE', start: 90, end: 155, spacingMultiplier: 1 }),
    Object.freeze({ id: 'extraction', index: 4, label: '귀환 항로', en: 'EXTRACTION', start: 155, end: SORTIE_DURATION, spacingMultiplier: 1.25 }),
] satisfies SortieStage[]);

export function sortieStageAt(seconds: number): Readonly<SortieStage> {
    const elapsed = Number.isFinite(seconds) ? Math.max(0, Math.min(SORTIE_DURATION, seconds)) : 0;
    return SORTIE_STAGES.find(stage => elapsed < stage.end) ?? SORTIE_STAGES[SORTIE_STAGES.length - 1];
}
export interface SortieSummary { operations: number; perfectPasses: number }
export interface SortieHUD extends SortieSummary {
    elapsed: number;
    duration: typeof SORTIE_DURATION;
    remaining: number;
    progress: number;
    stage: Readonly<SortieStage>;
    completed: boolean;
}
export interface SortieResult extends SortieSummary {
    version: 1;
    elapsed: number;
    duration: typeof SORTIE_DURATION;
    completed: boolean;
    /** Already included in RunResult.bonus; this field never authorizes another payout. */
    bonus: 0 | typeof SORTIE_COMPLETION_BONUS;
}
const validCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 1e6;
export function validSortieResult(value: unknown): value is SortieResult {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const result = value as Record<string, unknown>;
    return result.version === 1 && result.duration === SORTIE_DURATION
        && typeof result.elapsed === 'number' && Number.isFinite(result.elapsed) && result.elapsed >= 0 && result.elapsed <= SORTIE_DURATION
        && typeof result.completed === 'boolean' && result.completed === (result.elapsed === SORTIE_DURATION)
        && result.bonus === (result.completed ? SORTIE_COMPLETION_BONUS : 0)
        && validCount(result.operations) && validCount(result.perfectPasses);
}

/** A manual-flight clock. Pauses are caller-owned; Hyper Trick cannot finish a sortie. */
export class SortieDirector {
    private elapsed = 0;
    private operations = 0;
    private perfectPasses = 0;
    private completed = false;

    /** Returns true only on the completion edge. It never awards score itself. */
    advance(dt: number, hyper: boolean, summary: SortieSummary): boolean {
        // Physics advances in bounded frames. Reject a suspended-tab catch-up,
        // invalid clock value or repeated finished update before changing state.
        if (this.completed || hyper || !Number.isFinite(dt) || dt <= 0 || dt > 1) return false;
        if (validCount(summary.operations)) this.operations = Math.max(this.operations, summary.operations);
        if (validCount(summary.perfectPasses)) this.perfectPasses = Math.max(this.perfectPasses, summary.perfectPasses);
        this.elapsed = Math.min(SORTIE_DURATION, this.elapsed + dt);
        if (this.elapsed < SORTIE_DURATION - 1e-7) return false;
        this.elapsed = SORTIE_DURATION;
        this.completed = true;
        return true;
    }
    hud(): SortieHUD {
        return { elapsed: this.elapsed, duration: SORTIE_DURATION, remaining: SORTIE_DURATION - this.elapsed,
            progress: this.elapsed / SORTIE_DURATION, stage: sortieStageAt(this.elapsed), completed: this.completed,
            operations: this.operations, perfectPasses: this.perfectPasses };
    }
    result(): SortieResult {
        return { version: 1, elapsed: this.elapsed, duration: SORTIE_DURATION, completed: this.completed,
            bonus: this.completed ? SORTIE_COMPLETION_BONUS : 0, operations: this.operations, perfectPasses: this.perfectPasses };
    }
}

/** Finite, paced sorties never replace endless/daily records or another difficulty. */
export function sortieBestKey(difficulty: Difficulty = 'standard', hyper = false, planeId?: string) {
    return `sortie:${difficulty}:${planeId ? planeId + ':' : ''}${hyper ? 'e' : 'normal'}`;
}
