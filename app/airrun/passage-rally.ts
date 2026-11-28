import { baseSpeed } from './data';

export interface RallySplit {
    elapsedMs: number;
    targetMs: number;
}
export interface RallyResult {
    timed: number;
    wins: number;
    paceBonus: number;
    best: RallySplit;
}
export interface RelayHUD {
    chain: number;
    clears: number;
    reveal: boolean;
    lastAward: number;
    split?: RallySplit;
}

export const PACE_BONUS = 250;

/** Clocks run from the first structural crossing to the third, including both
 * bends. Each leg is priced at the aircraft's local cruise speed. */
export class PassageRally {
    chain = 0;
    clears = 0;
    private precise = 0;
    private startTime = 0;
    private startZ = 0;
    private lastZ = 0;
    private par = 0;
    private revealUntil = 0;
    private lastAward = 0;
    private finish?: RallySplit;
    private timed = 0;
    private wins = 0;
    private best?: RallySplit;

    constructor(private readonly paceFactor: number) {}

    reset() {
        this.chain = this.precise = this.par = 0;
        this.revealUntil = 0;
    }
    private legTime(z: number) {
        const cruise = baseSpeed((this.lastZ + z) / 2) * this.paceFactor;
        return Math.max(0, z - this.lastZ) / cruise;
    }
    private split(time: number, target: number): RallySplit {
        return { elapsedMs: Math.round((time - this.startTime) * 1000), targetMs: Math.round(target * 1000) };
    }
    cross(z: number, time: number, precise: boolean) {
        if (this.chain === 0) {
            this.startTime = time;
            this.startZ = z;
            this.par = this.precise = this.revealUntil = 0;
        } else {
            this.par += this.legTime(z);
        }
        this.lastZ = z;
        this.chain++;
        if (precise) this.precise++;
        if (this.chain < 3) return 0;

        this.finish = z - this.startZ >= 100 ? this.split(time, this.par) : undefined;
        const beatPace = this.finish && this.finish.elapsedMs <= this.finish.targetMs;
        if (this.finish) {
            this.timed++;
            if (beatPace) this.wins++;
            if (!this.best || this.finish.elapsedMs / this.finish.targetMs < this.best.elapsedMs / this.best.targetMs)
                this.best = this.finish;
        }
        this.lastAward = (this.precise === 3 ? 750 : 450) + (beatPace ? PACE_BONUS : 0);
        this.chain = 0;
        this.clears++;
        this.revealUntil = time + 2.6;
        return this.lastAward;
    }
    hud(time: number, z: number): RelayHUD {
        const reveal = time < this.revealUntil;
        const split = reveal ? this.finish : this.chain ? this.split(time, this.par + this.legTime(z)) : undefined;
        return { chain: this.chain, clears: this.clears, reveal, lastAward: this.lastAward, split };
    }
    result(): RallyResult | undefined {
        return this.best && { timed: this.timed, wins: this.wins, paceBonus: this.wins * PACE_BONUS, best: { ...this.best } };
    }
}

export function validRally(log: RallyResult, clears: number, bonus: number, duration: number) {
    if (!log || !log.best) return false;
    const { elapsedMs, targetMs } = log.best;
    return Number.isSafeInteger(log.timed) && log.timed > 0 && log.timed <= clears
        && Number.isSafeInteger(log.wins) && log.wins >= 0 && log.wins <= log.timed
        && log.paceBonus === log.wins * PACE_BONUS && clears * 450 + log.paceBonus <= bonus
        && Number.isSafeInteger(elapsedMs) && elapsedMs > 0 && elapsedMs <= Math.ceil(duration * 1000)
        && Number.isSafeInteger(targetMs) && targetMs > 0 && ((elapsedMs <= targetMs) === (log.wins > 0));
}
