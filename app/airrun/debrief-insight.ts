import type { RunResult } from './types';

/** Shared by the simulation and debrief so a medal cannot disagree with its UI. */
export const MEDAL_GOALS = {
    silver: { rating: 38, manualSeconds: 25, operations: 0 },
    gold: { rating: 65, manualSeconds: 60, operations: 2 },
    ace: { rating: 85, manualSeconds: 120, operations: 3 },
} as const;
export type NextMedal = keyof typeof MEDAL_GOALS;
export interface MedalRequirement {
    kind: 'rating' | 'manualSeconds' | 'operations';
    current: number | null;
    target: number;
    complete: boolean;
}
interface ExtendedDebrief {
    manualSeconds?: number;
    vault?: { pending: number; secured: number; lost: number; banks: number; peak: number };
}
export function debriefInsight(result: RunResult) {
    const d = result.debrief;
    if (!d) return null;
    const extended = d as typeof d & ExtendedDebrief;
    // Old records with E cannot reconstruct how much of its fifteen seconds
    // actually ran. Preserve that uncertainty instead of inventing a zero.
    const manualSeconds = extended.manualSeconds ?? (result.eUsed ? null : result.metrics.time);
    const next: NextMedal | null = d.medal === 'bronze' ? 'silver' : d.medal === 'silver' ? 'gold' : d.medal === 'gold' ? 'ace' : null;
    const requirements: MedalRequirement[] = next ? Object.entries(MEDAL_GOALS[next])
        .filter(([key, target]) => key !== 'operations' || target > 0)
        .map(([key, target]) => {
            const kind = key as MedalRequirement['kind'];
            const current = kind === 'manualSeconds' ? manualSeconds : kind === 'rating' ? d.rating : d.operationsCompleted;
            return { kind, current, target, complete: current !== null && current >= target };
        }) : [];
    const skillBonus = d.operationBonus + d.precisionBonus + d.flowBonus;
    const otherBonus = Math.max(0, result.bonus - skillBonus);
    const coach: keyof typeof FLIGHT_COACH = ['STRUCTURE IMPACT', 'HIGH SPEED IMPACT'].includes(result.reasonEn ?? '') ? 'impact' : extended.vault && extended.vault.lost > 0 ? 'bank'
        : d.operationsCompleted === 0 ? 'operation'
            : result.metrics.damage > 0 ? 'brake'
                : d.perfectPasses === 0 ? 'precision'
                    : d.bestFlow < 4 ? 'flow'
                        : d.operationsExpired > 0 ? 'timer'
                            : next && manualSeconds !== null && manualSeconds < MEDAL_GOALS[next].manualSeconds ? 'survive'
                                : d.medal === 'ace' ? 'ace' : 'precision';
    return { next, requirements, manualSeconds, skillBonus, otherBonus, coach, vault: extended.vault };
}
export const FLIGHT_COACH = {
    impact: ['큰 구조물은 피해야 합니다', 'BIG STRUCTURES MUST BE AVOIDED', '대형 구조물·고속 정면 충돌은 내구도나 방패로 버틸 수 없습니다. 안내 표식의 열린 경로를 읽고, 선회 전에 Space 또는 감속 버튼으로 시간을 확보하세요.', 'A large structure or high-speed head-on impact ends the flight regardless of durability or shield. Read the marked opening and brake before turning.'],
    bank: ['플로우를 확정할 타이밍', 'KNOW WHEN TO BANK', 'F 또는 확정 버튼으로 미정산 플로우를 점수로 바꾸세요. 체인을 계속하면 더 벌 수 있지만, 끊기거나 피격되면 잃습니다.', 'Press F or BANK to secure pending flow points. A longer chain can pay more, but a broken chain or hit loses the pending bonus.'],
    operation: ['먼저, 전방의 한 가지 목표부터', 'ONE OBJECTIVE AT A TIME', '작전 카드의 목표와 남은 시간을 읽으세요. 첫 작전은 표시된 두 경로를 통과하면 완료됩니다.', 'Read the operation card and its timer. Your opening objective is to cross two marked passages.'],
    brake: ['빠르기보다, 회피할 시간을', 'MAKE TIME TO TURN', '큰 방향·고도 변화 앞에서는 Space 또는 감속 버튼을 누르세요. 피격을 줄여야 플로우를 길게 이어갈 수 있습니다.', 'Hold Space or BRAKE before a sharp turn or climb. Fewer hits let you keep a longer flow chain.'],
    precision: ['표식의 중앙을 겨냥하세요', 'AIM FOR DEAD CENTRE', '링과 안내 경로의 중심을 정확히 통과하면 정밀 보너스 +75점을 추가로 받습니다.', 'Cross the centre of a ring or marked passage to earn an extra +75 precision bonus.'],
    flow: ['다음 행동으로 흐름을 연결하세요', 'LINK YOUR NEXT MOVE', '링·통과·근접 행동을 8초 안에 이어가세요. 플로우 단계가 올라가면 추가 보너스도 커집니다.', 'Link rings, passages and close calls within eight seconds. Higher flow tiers build a larger bonus.'],
    timer: ['목표가 바뀌면 비행도 바꾸세요', 'READ THE NEXT OPERATION', '작전이 전환될 때 목표와 타이머를 확인하세요. 놓친 작전은 비행을 끝내지 않으며, 곧 다음 기회가 옵니다.', 'Check the goal and timer when an operation changes. Missing one does not end the flight; another opportunity follows.'],
    survive: ['좋은 출발입니다. 더 오래 이어가세요', 'MAKE THE GOOD START LAST', '다음 훈장에는 평가점수와 수동 비행 시간이 모두 필요합니다. 안전한 경로를 읽고 비행을 이어가세요.', 'Your next medal needs both a skill rating and manual flight time. Read the safe line and keep the flight going.'],
    ace: ['에이스의 다음 도전', 'AN ACE’S NEXT CHALLENGE', '다른 기체·난이도로 항로를 다시 읽어 보세요. 오늘의 항로에서는 같은 시드의 나만의 최고 기록에 도전할 수 있습니다.', 'Read the route with another aircraft or difficulty. The daily route offers the same seed for another personal-best attempt.'],
} as const;
