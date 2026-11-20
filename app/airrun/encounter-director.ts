import { clamp, rng, THEMES } from './data';
import type { Action, Pattern } from './patterns';
import type { ThemeId } from './types';

export type Difficulty = 'relaxed' | 'standard' | 'expert';
export interface DifficultyProfile {
    label: string;
    en: string;
    description: string;
    descriptionEn: string;
    /** Desired X before buildEncounter's .53 corridor conversion. */
    xAmplitude: number;
    altitudeDelta: number;
    /** Effective metres between actions; do not apply the authored-pattern .82 scale. */
    spacing: number;
    initialLead: number;
    lead: number;
    speedMultiplier: number;
}
export const DIFFICULTIES: Record<Difficulty, DifficultyProfile> = {
    relaxed: {
        label: '여유 비행', en: 'RELAXED', description: '넓은 반응 여유와 완만한 고도 변화. 충돌과 보상은 그대로.',
        descriptionEn: 'More reaction room and gentler altitude changes. Collisions and rewards remain active.',
        xAmplitude: 26, altitudeDelta: 7, spacing: 242, initialLead: 600, lead: 190, speedMultiplier: .88,
    },
    standard: {
        label: '정밀 비행', en: 'STANDARD', description: '첫 구간부터 좌우·상하를 연결하는 기본 도전.',
        descriptionEn: 'Link lateral and vertical decisions from the very first section.',
        xAmplitude: 36, altitudeDelta: 12, spacing: 185, initialLead: 420, lead: 125, speedMultiplier: 1,
    },
    expert: {
        label: '극한 비행', en: 'EXPERT', description: '짧은 판단 간격과 큰 경로 변화. 정확한 감속·회피가 필요합니다.',
        descriptionEn: 'Shorter decision gaps and stronger route changes. Brake and dodge precisely.',
        xAmplitude: 40, altitudeDelta: 16, spacing: 160, initialLead: 360, lead: 105, speedMultiplier: 1.15,
    },
};

export interface ProceduralGeneration {
    procedural: true;
    difficulty: Difficulty;
    intensity: number;
    lead: number;
    spacing: number;
    beats?: number[];
    minimumSpacing?: number;
}
export type ProceduralPattern = Pattern & { generation: ProceduralGeneration };

// Grammar vocabularies describe the theme's plausible structures. Action order,
// turn direction, altitude rhythm and spacing are generated independently.
const GRAMMARS: Record<ThemeId, readonly Action[]> = {
    coast: ['wall', 'bridge', 'mover', 'crane', 'under', 'arch', 'slalom', 'spire', 'roof', 'over', 'cross'],
    village: ['roof', 'wall', 'arch', 'bridge', 'mover', 'over', 'under', 'spire', 'slalom', 'cross'],
    city: ['wall', 'slalom', 'bridge', 'under', 'over', 'crane', 'roof', 'mover', 'cross', 'spire', 'tunnel', 'arch'],
    ice: ['wall', 'arch', 'tunnel', 'spire', 'bridge', 'over', 'under', 'slalom', 'mover', 'cross'],
    desert: ['wall', 'arch', 'spire', 'over', 'tunnel', 'slalom', 'bridge', 'cross', 'under', 'roof'],
    forest: ['wall', 'spire', 'over', 'slalom', 'arch', 'bridge', 'under', 'cross', 'roof', 'tunnel'],
    farm: ['roof', 'mover', 'slalom', 'over', 'under', 'spire', 'wall', 'bridge', 'cross'],
    korea: ['wall', 'slalom', 'bridge', 'under', 'over', 'crane', 'roof', 'mover', 'cross', 'spire', 'tunnel', 'arch'],
    river: ['wall', 'bridge', 'under', 'mover', 'arch', 'cross', 'roof', 'slalom', 'spire', 'over'],
    landmark: ['wall', 'arch', 'spire', 'roof', 'bridge', 'tunnel', 'under', 'over', 'cross', 'slalom'],
    aurora: ['wall', 'arch', 'tunnel', 'spire', 'bridge', 'over', 'under', 'slalom', 'mover', 'cross'],
    volcano: ['wall', 'arch', 'spire', 'over', 'tunnel', 'slalom', 'bridge', 'under', 'cross'],
    waterfall: ['arch', 'wall', 'bridge', 'spire', 'tunnel', 'under', 'over', 'cross', 'slalom', 'mover'],
};
const KOREAN_GRAMMARS: readonly (readonly Action[])[] = [
    GRAMMARS.city,
    ['arch', 'tunnel', 'wall', 'roof', 'over', 'under', 'spire', 'bridge', 'slalom'],
    ['roof', 'wall', 'slalom', 'over', 'bridge', 'spire', 'cross', 'under', 'arch'],
    GRAMMARS.coast,
];
const VERTICAL = new Set<Action>(['over', 'roof', 'under', 'bridge', 'arch', 'tunnel']);
const CLIMB = new Set<Action>(['over', 'roof']);
const DESCEND = new Set<Action>(['under', 'bridge']);
const LABELS: Record<Action, [string, string]> = {
    arch: ['아치 통과', 'ARCHWAY'], bridge: ['교량 항로', 'BRIDGE LINE'], wall: ['벽 사이 회피', 'WALL WEAVE'],
    slalom: ['연속 선회', 'SLALOM'], over: ['능선 상승', 'RIDGE CLIMB'], under: ['하부 통과', 'LOW PASS'],
    crane: ['크레인 회피', 'CRANE TURN'], mover: ['이동 항로', 'MOVING CROSSING'], tunnel: ['협문 진입', 'NARROW GATE'],
    roof: ['지붕 넘기', 'ROOFTOP CLIMB'], spire: ['암주 선회', 'SPIRE TURN'], cross: ['교차 회피', 'CROSSING'],
};
const THEME_LABELS: Partial<Record<ThemeId, Partial<Record<Action, [string, string]>>>> = {
    coast: { mover: ['선박 항로', 'SHIP CHANNEL'], crane: ['부두 크레인', 'QUAYSIDE CRANE'], bridge: ['연안 교량', 'COASTAL SPAN'], spire: ['해식 암주', 'SEA STACKS'] },
    village: { mover: ['풍차 항로', 'WINDMILL LINE'], roof: ['마을 지붕', 'VILLAGE ROOFTOPS'], spire: ['종탑 선회', 'BELL TOWER'] },
    city: { wall: ['빌딩 회랑', 'SKYLINE CORRIDOR'], spire: ['타워 선회', 'TOWER TURN'], mover: ['드론 교차', 'DRONE CROSSING'] },
    ice: { wall: ['빙벽 회랑', 'GLACIER CORRIDOR'], spire: ['빙주 선회', 'ICE NEEDLES'], tunnel: ['빙하의 틈', 'GLACIER CRACK'] },
    desert: { arch: ['자연 아치', 'SANDSTONE ARCH'], wall: ['협곡 회랑', 'CANYON LINE'], spire: ['사암 기둥', 'SANDSTONE NEEDLES'] },
    forest: { wall: ['능선 회랑', 'RIDGE CORRIDOR'], roof: ['산장 지붕', 'CABIN ROOFS'], slalom: ['숲 사이 선회', 'WOODLAND WEAVE'] },
    farm: { roof: ['헛간 지붕', 'BARN ROOFS'], mover: ['풍력 항로', 'TURBINE LINE'], spire: ['곡물 창고', 'SILO TURN'] },
    river: { mover: ['여객선 교차', 'FERRY CROSSING'], bridge: ['강변 교량', 'RIVER SPAN'] },
    landmark: { tunnel: ['성문 진입', 'FORTRESS GATE'], spire: ['기념탑 선회', 'MONUMENT TURN'] },
    aurora: { spire: ['별빛 빙주', 'STARLIT NEEDLES'], wall: ['빙해 회랑', 'POLAR CORRIDOR'] },
    volcano: { over: ['용암 능선', 'LAVA RIDGE'], spire: ['현무암 기둥', 'BASALT NEEDLES'], arch: ['화산 암문', 'VOLCANIC ARCH'] },
    waterfall: { cross: ['폭포 횡단', 'FALLSIDE CROSSING'], wall: ['물안개 절벽', 'MIST CLIFFS'], bridge: ['협곡 교량', 'GORGE SPAN'] },
};

function salt(text: string) {
    let value = 0x811c9dc5;
    for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 0x01000193);
    return value;
}

/**
 * A seeded three-action grammar, including serial zero. This does not sample
 * PATTERNS or provide a safe fixed opening. Simulation validates the built
 * geometry and retries with attempt+1 when a particular aircraft cannot pass.
 */
export function proceduralPattern(theme: ThemeId, variant: number, seed: number, serial: number, progressMeters: number, attempt = 0, difficulty: Difficulty = 'standard'): ProceduralPattern {
    const themeInfo = THEMES.find(t => t.id === theme);
    if (!themeInfo) throw new RangeError('Unknown procedural theme');
    const profile = DIFFICULTIES[difficulty];
    if (!profile) throw new RangeError('Unknown flight difficulty');
    const counter = Number.isFinite(serial) ? Math.max(0, Math.floor(serial)) : 0;
    const retry = Number.isFinite(attempt) ? Math.max(0, Math.floor(attempt)) : 0;
    const resolvedVariant = theme === 'korea' ? Math.round(clamp(Number.isFinite(variant) ? variant : 0, 0, 3)) : 0;
    const progress = Number.isFinite(progressMeters) ? Math.max(0, progressMeters) : 0;
    const intensity = Math.sqrt(clamp(progress / 60000, 0, 1));
    const random = rng((seed >>> 0) ^ salt(`${theme}:${resolvedVariant}`) ^ Math.imul(counter + 1, 0x45d9f3b) ^ Math.imul(retry + 1, 0x27d4eb2d));
    const vocabulary = theme === 'korea' ? KOREAN_GRAMMARS[resolvedVariant] : GRAMMARS[theme];
    const choose = <T,>(options: readonly T[]) => options[Math.floor(random() * options.length)];
    const first = choose(vocabulary);
    // Deliberately switch the required skill: a lateral opening leads into
    // a height decision, and a height opening into a lateral decision.
    const second = choose(vocabulary.filter(action => VERTICAL.has(action) !== VERTICAL.has(first)));
    const verticalAction = VERTICAL.has(first) ? first : second;
    const third = choose(vocabulary.filter(action => action !== first && action !== second
        && (!CLIMB.has(verticalAction) || !CLIMB.has(action)) && (!DESCEND.has(verticalAction) || !DESCEND.has(action))));
    const actionCount = counter === 0 ? 3 : 2 + Math.floor(random() * 4);
    const actions = [first, second, third].slice(0, actionCount);
    while (actions.length < actionCount) actions.push(choose(vocabulary.filter(action => !actions.includes(action))));
    const direction = random() < .5 ? -1 : 1;
    // Draw a bend, then allow it to tighten, reverse or hold a bank.
    // Approach lengths are sampled separately from lateral directions.
    const signs = [direction];
    let turnBias = .22 + random() * .53;
    for (let i = 1; i < actionCount; i++) {
        const reverse = counter === 0 && i === 2 && signs[1] === direction || random() < turnBias;
        signs.push(reverse ? -signs[i - 1] : signs[i - 1]);
        turnBias = reverse ? .20 + random() * .45 : Math.min(.92, turnBias + .23);
    }
    const amplitude = profile.xAmplitude * (1 + intensity * .08);
    const vertical = profile.altitudeDelta * (1 + intensity * .2);
    let previousY = random() < .5 ? 24 : 32;
    const steps: Pattern['steps'] = actions.map((action, index) => {
        const magnitude = index === 0 && counter === 0 ? .74 + random() * .26 : random() < .65 ? .67 + random() * .33 : .32 + random() * .35;
        const x = Math.round(signs[index] * amplitude * magnitude * 10) / 10;
        const lift = vertical * (.7 + random() * .3);
        const y = CLIMB.has(action) ? 28 + lift : DESCEND.has(action) ? 28 - lift
            : counter === 0 ? (previousY >= 28 ? 28 - lift : 28 + lift)
            : previousY + (random() - .46) * vertical * 1.95;
        previousY = clamp(y, 14, 46);
        return [action, x, Math.round(previousY * 10) / 10];
    });
    const spacing = Math.round(Math.max(150, profile.spacing * (1 - intensity * .16) * (.94 + random() * .12)));
    const lead = Math.round((counter === 0 ? profile.initialLead : profile.lead * (1 - intensity * .12)) * (.84 + random() * .36));
    const district = 1 + Math.floor(random() * 12);
    const labels = actions.map(action => THEME_LABELS[theme]?.[action] ?? LABELS[action]);
    return {
        id: `proc:${seed >>> 0}:${counter}:${retry}:${district}`,
        theme, variant: resolvedVariant,
        name: `${themeInfo.name} · ${labels.map(label => label[0]).join(' → ')}`,
        en: `${themeInfo.en} · ${labels.map(label => label[1]).join(' → ')}`,
        steps, spacing,
        generation: { procedural: true, difficulty, intensity, lead, spacing,
            beats: actions.slice(1).map(() => .73 + random() ** 1.45 * .95) },
    };
}
