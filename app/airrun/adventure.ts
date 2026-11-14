import type { ThemeId, WeatherKind } from './types';
import { FlowVault, type VaultSnapshot } from './flow-vault';
import { MEDAL_GOALS } from './debrief-insight';

export type OperationKind = 'pathfinder' | 'rings' | 'precision' | 'low-line' | 'boost-line' | 'collector' | 'risk-line' | 'clean-route';
export type AdventureEvent = 'route' | 'ring' | 'near' | 'narrow' | 'coin';
export interface AdventureOperation {
    id: string; kind: OperationKind; title: string; titleEn: string;
    instruction: string; instructionEn: string; progress: number; target: number;
    unit: 'count' | 'm'; remaining: number; duration: number; reward: number;
    status: 'active' | 'completed' | 'expired';
}
export interface AdventureHUD {
    operation: AdventureOperation; completed: number; expired: number; earnedBonus: number;
    flow: { value: number; tier: 0 | 1 | 2 | 3; chain: number; multiplier: number; remaining: number; bestChain: number };
    vault?: VaultSnapshot;
    callout?: string; calloutEn?: string;
}
export interface RunDebrief {
    manualSeconds?: number;
    vault?: VaultSnapshot;
    version: 1; medal: 'bronze' | 'silver' | 'gold' | 'ace'; rating: number;
    operationsCompleted: number; operationsExpired: number; perfectPasses: number;
    bestFlow: number; flowActions: number; operationBonus: number; precisionBonus: number;
    flowBonus: number; controlDistance: number; lowDistance: number; boostDistance: number; cleanDistance: number;
}
export interface AdventureFrame {
    time: number; distance: number; speed: number; altitude: number;
    controlling: boolean; boosting: boolean; hyper: boolean; theme: ThemeId; weather: WeatherKind;
    availablePassages: number; availableRings: number; availableCoins: number;
}
export interface AdventureAward { kind: 'operation' | 'precision' | 'flow'; points: number; title: string; titleEn: string }
export function validDebrief(value: unknown): value is RunDebrief {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const data = value as Record<string, unknown>;
    if (data.manualSeconds !== undefined && (typeof data.manualSeconds !== 'number' || !Number.isFinite(data.manualSeconds) || data.manualSeconds < 0 || data.manualSeconds > 1e9)) return false;
    if (data.vault !== undefined) {
        if (!data.vault || typeof data.vault !== 'object' || Array.isArray(data.vault)) return false;
        const vault = data.vault as Record<string, number>;
        if (!['pending', 'secured', 'lost', 'banks', 'peak'].every(key => Number.isSafeInteger(vault[key]) && vault[key] >= 0 && vault[key] <= 1e9)
            || vault.pending + vault.secured + vault.lost > 1e9 || vault.peak < vault.pending) return false;
    }
    return data.version === 1 && typeof data.medal === 'string' && ['bronze', 'silver', 'gold', 'ace'].includes(data.medal) && Number.isInteger(data.rating) && Number(data.rating) >= 0 && Number(data.rating) <= 100 &&
        ['operationsCompleted', 'operationsExpired', 'perfectPasses', 'bestFlow', 'flowActions', 'operationBonus', 'precisionBonus', 'flowBonus', 'controlDistance', 'lowDistance', 'boostDistance', 'cleanDistance'].every(key => typeof data[key] === 'number' && Number.isSafeInteger(data[key]) && Number(data[key]) >= 0 && Number(data[key]) < 1e12);
}
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const seeded = (seed: number) => {
    let value = (seed | 0) ^ 0x6d2b79f5;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
};
const LABELS: Record<OperationKind, [string, string, string, string]> = {
    pathfinder: ['항로 개척', 'PATHFINDER', '전방에 표시된 통과 경로를 연결하세요.', 'Link the marked passages ahead.'],
    rings: ['링 러너', 'RING RUNNER', '링의 안쪽을 통과하며 비행하세요.', 'Fly through the rings ahead.'],
    precision: ['정밀 비행', 'DEAD CENTRE', '링 또는 통과 경로의 중심을 정확히 통과하세요.', 'Cross the centre of a ring or marked passage.'],
    'low-line': ['로우 라이더', 'LOW LINE', '지면 위 5–12m의 저공 경로를 이어가세요.', 'Hold a low line 5–12 m above the terrain.'],
    'boost-line': ['블루 스트릭', 'BLUE STREAK', '가속 상태로 수동 비행 거리를 확보하세요.', 'Boost in manual flight to build your blue streak.'],
    collector: ['골든 루트', 'GOLDEN ROUTE', '항로의 코인 흐름을 따라 수집하세요.', 'Follow and collect the coin trail.'],
    'risk-line': ['리스크 메이커', 'RISK MAKER', '근접 또는 좁은 경로 통과를 연결하세요.', 'Connect close calls or narrow passages.'],
    'clean-route': ['클린 윙', 'CLEAN WINGS', '피격 없이 연속으로 통과 경로를 완주하세요.', 'Clear consecutive passages without taking damage.'],
};

/** Run-local goals driven by real gameplay. The clock pauses during Hyper Trick. */
export class FlightAdventure {
    private operation: AdventureOperation | null = null;
    private vault = new FlowVault();
    private serial = 0; private clock = 0; private lastTime = 0; private lastDistance = 0;
    private operationStarted = 0; private statusUntil = 0; private lastFlow = -Infinity;
    private flowValue = 0; private chain = 0; private bestChain = 0;
    private completed = 0; private expired = 0; private perfectPasses = 0; private flowActions = 0;
    private operationBonus = 0; private precisionBonus = 0; private flowBonus = 0;
    private controlDistance = 0; private lowDistance = 0; private boostDistance = 0;
    private cleanDistance = 0; private currentCleanDistance = 0; private lowFlowDistance = 0;
    private callout = ''; private calloutEn = ''; private calloutUntil = 0;
    private hyper = false; private seen = new Set<string>(); private pending: AdventureAward[] = [];
    constructor(private seed: number, private onAward?: (award: AdventureAward) => number | void, private quoteFlow: (points: number) => number = points => points) { }
    private tier(): 0 | 1 | 2 | 3 { return this.flowValue >= 80 ? 3 : this.flowValue >= 50 ? 2 : this.flowValue >= 20 ? 1 : 0; }
    private announce(title: string, titleEn: string) { this.callout = title; this.calloutEn = titleEn; this.calloutUntil = this.clock + 2.4; }
    private award(award: AdventureAward) {
        const result = this.onAward?.(award);
        const points = typeof result === 'number' && Number.isFinite(result) ? Math.max(0, Math.floor(result)) : award.points;
        if (!this.onAward) this.pending.push(award);
        if (award.kind === 'operation') this.operationBonus += points;
        else if (award.kind === 'precision') this.precisionBonus += points;
        else this.flowBonus += points;
    }
    takeAwards() { const awards = this.pending; this.pending = []; return awards; }
    private start(frame: AdventureFrame) {
        const previous = this.operation?.kind, duration = 26 + Math.floor(seeded(this.seed + this.serial * 7919) * 10);
        const options: OperationKind[] = ['low-line', 'boost-line'];
        if (frame.availablePassages >= 2) options.push('pathfinder', 'clean-route');
        if (frame.availablePassages + frame.availableRings >= 1) options.push('precision');
        if (frame.availableRings >= 2) options.push('rings');
        if (frame.availableCoins >= 8) options.push('collector');
        if (this.serial > 1 && frame.availablePassages >= 2) options.push('risk-line');
        const pool = options.filter(kind => kind !== previous);
        const kind: OperationKind = this.serial === 0 && frame.availablePassages > 0 ? 'pathfinder' : pool[Math.floor(seeded(this.seed + (this.serial + 1) * 3253) * pool.length)];
        const target = kind === 'pathfinder' ? Math.min(2, frame.availablePassages) : kind === 'clean-route' || kind === 'rings' || kind === 'risk-line' ? 2 : kind === 'precision' ? 1 : kind === 'collector' ? Math.min(12, frame.availableCoins) : Math.round(clamp(frame.speed * (kind === 'low-line' ? 4 : 5), kind === 'low-line' ? 150 : 200, kind === 'low-line' ? 360 : 500) / 10) * 10;
        const [title, titleEn, instruction, instructionEn] = LABELS[kind];
        this.operation = { id: `OP-${++this.serial}`, kind, title, titleEn, instruction, instructionEn, progress: 0, target, unit: ['low-line', 'boost-line'].includes(kind) ? 'm' : 'count', remaining: duration, duration, reward: 250 + Math.min(12, this.completed) * 60, status: 'active' };
        this.operationStarted = this.clock;
    }
    advance(frame: AdventureFrame) {
        if (!Number.isFinite(frame.time) || !Number.isFinite(frame.distance) || frame.time < this.lastTime || frame.distance < this.lastDistance || frame.time === this.lastTime && frame.distance > this.lastDistance) return;
        const dt = Math.max(0, frame.time - this.lastTime), dz = Math.max(0, frame.distance - this.lastDistance);
        this.lastTime = frame.time; this.lastDistance = frame.distance; this.hyper = frame.hyper;
        if (frame.hyper) { this.breakFlow(); return; }
        this.clock += dt;
        if (!this.operation || this.operation.status !== 'active' && this.clock >= this.statusUntil - 1e-8) this.start(frame);
        if (Number.isFinite(this.lastFlow)) {
            const before = Math.max(0, this.clock - dt - this.lastFlow - 3), after = Math.max(0, this.clock - this.lastFlow - 3);
            this.flowValue = Math.max(0, this.flowValue - (after - before) * 8);
        }
        if (this.clock - this.lastFlow >= 8) {
            if (this.vault.lose('timeout')) this.announce('플로우 만료 · 다음 체인을 준비하세요', 'FLOW EXPIRED · BUILD YOUR NEXT CHAIN');
            this.chain = 0;
        }
        if (this.flowValue <= 0) this.chain = 0;
        this.currentCleanDistance += dz; this.cleanDistance = Math.max(this.cleanDistance, this.currentCleanDistance);
        if (frame.controlling) this.controlDistance += dz;
        const low = frame.altitude >= 5 && frame.altitude <= 12;
        if (low) {
            this.lowDistance += dz; this.lowFlowDistance += dz;
            if (this.lowFlowDistance >= 80) { this.lowFlowDistance %= 80; this.flow('low', 6, 0); }
        } else this.lowFlowDistance = 0;
        if (frame.boosting) this.boostDistance += dz;
        const op = this.operation!;
        if (op.status !== 'active') return;
        op.remaining = Math.max(0, op.duration - (this.clock - this.operationStarted));
        if (op.remaining <= 1e-8) { op.remaining = 0; op.status = 'expired'; this.expired++; this.statusUntil = this.clock + 2; return; }
        if (op.kind === 'low-line' && low || op.kind === 'boost-line' && frame.boosting) this.progress(dz);
    }
    private flow(kind: AdventureEvent | 'low', value: number, base: number, perfect = false) {
        if (this.clock - this.lastFlow > 8) this.chain = 0;
        this.chain++; this.bestChain = Math.max(this.bestChain, this.chain); this.flowActions++;
        this.flowValue = clamp(this.flowValue + value + (perfect ? 8 : 0), 0, 100); this.lastFlow = this.clock;
        const points = Math.floor(base * ([1, 1.15, 1.3, 1.5][this.tier()] - 1) + 1e-8);
        if (points > 0) this.vault.deposit(this.quoteFlow(points));
        if (kind !== 'low' && perfect) {
            this.perfectPasses++; this.award({ kind: 'precision', points: 75, title: '정밀 통과 +75', titleEn: 'PERFECT LINE +75' });
            this.announce('PERFECT · 정밀 통과', 'PERFECT · DEAD CENTRE');
        }
    }
    event(kind: AdventureEvent, source: string, perfect = false, flowCredit = true) {
        if (!this.operation || this.hyper || !source || this.seen.has(`${kind}:${source}`)) return;
        this.seen.add(`${kind}:${source}`);
        if (this.seen.size > 512) this.seen.delete(this.seen.values().next().value!);
        if (kind !== 'coin' && flowCredit) this.flow(kind, { route: 6, ring: 10, near: 15, narrow: 22 }[kind], { route: 40, ring: 150, near: 120, narrow: 300 }[kind], perfect);
        const op = this.operation;
        if (!op || op.status !== 'active') return;
        if ((op.kind === 'pathfinder' || op.kind === 'clean-route') && kind === 'route' || op.kind === 'precision' && perfect && (kind === 'ring' || kind === 'route') || op.kind === 'rings' && kind === 'ring' || op.kind === 'collector' && kind === 'coin' || op.kind === 'risk-line' && (kind === 'near' || kind === 'narrow')) this.progress(1);
    }
    private progress(amount: number) {
        const op = this.operation;
        if (!op || op.status !== 'active') return;
        op.progress = Math.min(op.target, op.progress + amount);
        if (op.progress < op.target - 1e-8) return;
        op.progress = op.target; op.status = 'completed'; this.completed++; this.statusUntil = this.clock + 2;
        this.award({ kind: 'operation', points: op.reward, title: op.title + ' 완료', titleEn: op.titleEn + ' COMPLETE' });
        this.announce(op.title + ' 완료 · +' + op.reward, op.titleEn + ' COMPLETE · +' + op.reward);
    }
    /** Banking trades the current multiplier for score that a later hit cannot erase. */
    bankFlow(): boolean {
        if (this.hyper || this.vault.snapshot().pending <= 0) return false;
        const points = this.secureFlow('manual');
        if (!points) return false;
        this.breakFlow();
        this.announce(`플로우 확정 +${points}`, `FLOW BANKED +${points}`);
        return true;
    }
    /** A proved alternate passage risks an explicit reserve, without inventing
     * another precision feat or multiplying the existing chain twice. */
    routeChoice(source: string, points: number): boolean {
        const key = `choice:${source}`;
        if (this.hyper || !source || this.seen.has(key) || !Number.isSafeInteger(points) || points <= 0) return false;
        if (!this.vault.deposit(this.quoteFlow(points))) return false;
        this.seen.add(key);
        if (this.seen.size > 512) this.seen.delete(this.seen.values().next().value!);
        this.lastFlow = this.clock;
        this.announce('정밀 경로 · F로 보너스를 확정하세요', 'PRECISION LINE · BANK YOUR BONUS WITH F');
        return true;
    }
    finish() { const points = this.secureFlow('finish'); this.breakFlow(); return points; }
    private secureFlow(reason: 'manual' | 'hyper' | 'finish') {
        const points = this.vault.bank(reason);
        if (points) this.award({ kind: 'flow', points, title: '플로우 확정', titleEn: 'FLOW BANKED' });
        return points;
    }
    crash() { this.vault.lose('crash'); this.breakFlow(); }
    private breakFlow() { this.chain = 0; this.flowValue = 0; this.lastFlow = -Infinity; this.lowFlowDistance = 0; }
    damage() { this.vault.lose('damage'); this.breakFlow(); this.currentCleanDistance = 0; if (this.operation?.kind === 'clean-route' && this.operation.status === 'active') this.operation.progress = 0; }
    hyperStart() { this.secureFlow('hyper'); this.hyper = true; this.breakFlow(); this.currentCleanDistance = 0; }
    hud(): AdventureHUD | undefined {
        if (!this.operation) return undefined;
        return { vault: this.vault.snapshot(), operation: { ...this.operation, progress: this.operation.unit === 'm' ? Math.floor(this.operation.progress) : this.operation.progress }, completed: this.completed, expired: this.expired, earnedBonus: this.operationBonus + this.precisionBonus + this.flowBonus,
            flow: { value: this.flowValue, tier: this.tier(), chain: this.chain, multiplier: [1, 1.15, 1.3, 1.5][this.tier()], remaining: Math.max(0, 8 - (this.clock - this.lastFlow)), bestChain: this.bestChain },
            ...(this.clock < this.calloutUntil ? { callout: this.callout, calloutEn: this.calloutEn } : {}) };
    }
    debrief(settleVault = false): RunDebrief {
        const vault = this.vault.projection(settleVault), extra = settleVault ? this.vault.snapshot().pending : 0;
        const rating = Math.round(clamp(Math.min(20, this.clock / 6) + Math.min(30, this.completed * 10) + Math.min(20, this.perfectPasses * 4) + Math.min(15, this.bestChain * 1.5) + Math.min(15, this.cleanDistance / 100), 0, 100));
        const reached = (goal: typeof MEDAL_GOALS[keyof typeof MEDAL_GOALS]) => this.clock >= goal.manualSeconds && this.completed >= goal.operations && rating >= goal.rating;
        const medal = reached(MEDAL_GOALS.ace) ? 'ace' : reached(MEDAL_GOALS.gold) ? 'gold' : reached(MEDAL_GOALS.silver) ? 'silver' : 'bronze';
        return { version: 1, manualSeconds: this.clock, vault, medal, rating, operationsCompleted: this.completed, operationsExpired: this.expired, perfectPasses: this.perfectPasses, bestFlow: this.bestChain, flowActions: this.flowActions,
            operationBonus: this.operationBonus, precisionBonus: this.precisionBonus, flowBonus: this.flowBonus + extra, controlDistance: Math.floor(this.controlDistance), lowDistance: Math.floor(this.lowDistance), boostDistance: Math.floor(this.boostDistance), cleanDistance: Math.floor(this.cleanDistance) };
    }
}
