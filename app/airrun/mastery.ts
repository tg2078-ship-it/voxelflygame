import { COURSE_EDITION, baseSpeed } from './data';
import type { Difficulty } from './encounter-director';
import type { RunResult, Vec } from './types';

export type ContractId = 'precision' | 'velocity' | 'daring';
export const CONTRACTS = {
    precision: { label: '정밀 비행', en: 'DEAD CENTRE', instruction: '표식과 링의 중심을 정확히 통과', instructionEn: 'Cross the centre of gates and rings', unit: '회' },
    velocity: { label: '블루 스트릭', en: 'BLUE STREAK', instruction: '직접 가속하며 비행 거리를 연결', instructionEn: 'Build distance while manually boosting', unit: 'm' },
    daring: { label: '아슬아슬한 한 수', en: 'CLOSE CALL', instruction: '실제 근접 회피와 협문 통과에 도전', instructionEn: 'Link real close calls and narrow passages', unit: '회' },
} as const;
export const CONTRACT_REWARDS = [150, 300, 600] as const;
export interface ContractResult { id: ContractId; progress: number; targets: [number, number, number]; tier: number; bonus: number }
export interface ContractEvidence { perfect: number; boost: number; risk: number }
export function contractTargets(id: ContractId, speed: number, difficulty: Difficulty): [number, number, number] {
    const scale = difficulty === 'relaxed' ? .8 : difficulty === 'expert' ? 1.15 : 1;
    const first = id === 'velocity' ? Math.round(Math.max(250, speed * 35) / 25) * 25 : Math.max(2, Math.round((id === 'precision' ? 4 : 3) * scale));
    return [first, first * 2, first * 3];
}
export class FlightContract {
    private progress = 0;
    private tier = 0;
    private bonus = 0;
    readonly targets: [number, number, number];
    constructor(readonly id: ContractId, speed: number, difficulty: Difficulty) { this.targets = contractTargets(id, speed, difficulty); }
    observe(evidence: ContractEvidence): number[] {
        const value = evidence[this.id === 'precision' ? 'perfect' : this.id === 'velocity' ? 'boost' : 'risk'];
        if (!Number.isFinite(value) || value < this.progress || value > 1e9) return [];
        this.progress = value;
        const earned: number[] = [];
        while (this.tier < 3 && this.progress + 1e-7 >= this.targets[this.tier]) {
            const reward = CONTRACT_REWARDS[this.tier++]; this.bonus += reward; earned.push(reward);
        }
        return earned;
    }
    result(): ContractResult { return { id: this.id, progress: Math.floor(this.progress), targets: [...this.targets], tier: this.tier, bonus: this.bonus }; }
}
export function validContract(value: unknown, evidence?: ContractEvidence): value is ContractResult {
    if (!value || typeof value !== 'object') return false;
    const c = value as ContractResult;
    if (!Object.hasOwn(CONTRACTS, c.id) || !Number.isSafeInteger(c.progress) || c.progress < 0 || c.progress > 1e9
        || !Number.isInteger(c.tier) || c.tier < 0 || c.tier > 3 || !Array.isArray(c.targets) || c.targets.length !== 3
        || !c.targets.every((v, i) => Number.isSafeInteger(v) && v > 0 && v <= 1e9 && (!i || v > c.targets[i - 1]))) return false;
    const tier = c.targets.filter(target => c.progress >= target).length;
    if (tier !== c.tier || c.bonus !== CONTRACT_REWARDS.slice(0, tier).reduce((a, b) => a + b, 0)) return false;
    return !evidence || c.progress <= Math.floor(evidence[c.id === 'precision' ? 'perfect' : c.id === 'velocity' ? 'boost' : 'risk']);
}

/** An input-independent cruise clock makes a seed a reproducible course. */
const cruiseSeconds = [0];
const integrate = (z: number, step: number) => step / 6 * (1 / baseSpeed(z) + 4 / baseSpeed(z + step / 2) + 1 / baseSpeed(z + step));
export function courseClock(distance: number, speedFactor: number): number {
    if (!Number.isFinite(distance) || distance <= 0 || !Number.isFinite(speedFactor) || speedFactor <= 0) return 0;
    if (distance > 1e7) return distance / (baseSpeed(distance / 2) * speedFactor);
    const cell = Math.floor(distance / 200);
    while (cruiseSeconds.length <= cell) {
        const index = cruiseSeconds.length - 1;
        cruiseSeconds.push(cruiseSeconds[index] + integrate(index * 200, 200));
    }
    return (cruiseSeconds[cell] + integrate(cell * 200, distance - cell * 200)) / speedFactor;
}

/** Half-second, rounded local samples. No input history or remote telemetry. */
export type ReplaySample = [time: number, x: number, y: number, z: number, roll: number];
export interface FlightReplay { version: 1; samples: ReplaySample[] }
export class ReplayRecorder {
    private samples: ReplaySample[] = [];
    record(time: number, position: Vec, roll: number) {
        if (this.samples.length >= 400 || ![time, position.x, position.y, position.z, roll].every(Number.isFinite)) return;
        const previous = this.samples.at(-1);
        if (previous && (time - previous[0] < .499 || position.z < previous[3])) return;
        this.samples.push([time, position.x, position.y, position.z, roll].map(n => Math.round(n * 100) / 100) as ReplaySample);
    }
    result(): FlightReplay { return { version: 1, samples: this.samples.map(s => [...s]) }; }
}
export function validReplay(value: unknown, duration: number, distance: number): value is FlightReplay {
    if (!value || typeof value !== 'object') return false;
    const replay = value as FlightReplay;
    if (replay.version !== 1 || !Array.isArray(replay.samples) || replay.samples.length < 2 || replay.samples.length > 400) return false;
    return replay.samples.every((sample, index) => Array.isArray(sample) && sample.length === 5 && sample.every(Number.isFinite)
        && sample[0] >= 0 && sample[0] <= duration + .02 && Math.abs(sample[1]) <= 100 && sample[2] >= -5 && sample[2] <= 100
        && sample[3] >= 0 && sample[3] <= distance + 1 && Math.abs(sample[4]) <= Math.PI * 4
        && (!index || sample[0] > replay.samples[index - 1][0] && sample[3] >= replay.samples[index - 1][3]));
}
export function replayPose(replay: FlightReplay, time: number): (Vec & { roll: number }) | null {
    const points = replay.samples;
    if (!Number.isFinite(time) || !points.length || time < points[0][0] || time > points.at(-1)![0] + .51) return null;
    const index = points.findIndex(point => point[0] >= time), b = points[index < 0 ? points.length - 1 : index], a = points[Math.max(0, (index < 0 ? points.length - 1 : index) - 1)];
    const t = Math.min(1, Math.max(0, (time - a[0]) / Math.max(.001, b[0] - a[0])));
    return { x: a[1] + (b[1] - a[1]) * t, y: a[2] + (b[2] - a[2]) * t, z: a[3] + (b[3] - a[3]) * t, roll: a[4] + (b[4] - a[4]) * t };
}
export interface ReplayIdentity { seed: number; plane: string; level: number; difficulty: Difficulty; contractId: ContractId }
export function personalRival(runs: RunResult[], identity: ReplayIdentity): RunResult | undefined {
    return runs.filter(run => run.courseEdition === COURSE_EDITION && run.mode === 'sortie' && run.sortie?.completed && !run.interrupted && !run.eUsed && run.replay
        && run.seed === identity.seed && run.planeId === identity.plane && run.level === identity.level
        && run.difficulty === identity.difficulty && run.contract?.id === identity.contractId)
        .sort((a, b) => b.score - a.score)[0];
}
