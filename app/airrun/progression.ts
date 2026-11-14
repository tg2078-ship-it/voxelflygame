import { AIRCRAFT, WORLD_IMAGE_REVISION, hash } from './data';
import type { QuestSpec, Quest, Save, Metrics, RunResult } from './types';
import { recordDailyRun } from './daily-route';
import { sortieBestKey } from './sortie';
import { personalRival } from './mastery';
const q = (id: string, label: string, en: string, tier: 1 | 2 | 3 | 4, target: number, key: string, mode: QuestSpec['mode'] = 'sum', gate?: string): QuestSpec => ({ id, family: id[0], label, en, tier, target, key, mode, gate });
export const QUESTS: QuestSpec[] = [
    q('F01', '누적 3km 비행', 'Fly 3 km in total', 1, 3000, 'distance'), q('F02', '한 판 2km 비행', 'Fly 2 km in one run', 1, 2000, 'distance', 'max'), q('F03', '손상 없이 첫 1km', 'Fly the first kilometre undamaged', 2, 1000, 'cleanStart', 'max'), q('F04', '한 판 5km 비행', 'Fly 5 km in one run', 2, 5000, 'distance', 'max'), q('F05', '가속으로 누적 2km', 'Boost over 2 km in total', 2, 2000, 'boost'), q('F06', '감속 중 지정 통과 3회', 'Pass 3 routes while braking', 2, 3, 'brakePass'), q('F07', '한 판 2개 테마 진입', 'Enter 2 themes in one run', 3, 2, 'themeCount', 'max'), q('F08', '한 판 9분 생존', 'Survive 9 minutes in one run', 4, 540, 'time', 'max'),
    q('T01', '근접 통과 5회 누적', 'Make 5 near misses in total', 1, 5, 'near'), q('T02', '한 판 근접 통과 5회', 'Make 5 near misses in one run', 2, 5, 'near', 'max'), q('T03', '좁은 공간 3회 누적', 'Fly through 3 narrow passages', 2, 3, 'narrow'), q('T04', '콤보 5 달성', 'Reach a 5 combo', 1, 5, 'maxCombo', 'max'), q('T05', '콤보 10 달성', 'Reach a 10 combo', 2, 10, 'maxCombo', 'max'), q('T06', '고속 위험 행동 5회', 'Complete 5 high-speed risk moves', 3, 5, 'highRisk'), q('T07', '저공 누적 500m', 'Fly low over 500 m', 1, 500, 'low'), q('T08', '한 판 저공 300m + 좁은 통과 2회', 'One run: 300 m low + 2 narrow passes', 3, 1, 'lowNarrow', 'special'),
    q('C01', '코인 50개 누적', 'Collect 50 coins', 1, 50, 'coins'), q('C02', '한 판 코인 25개', 'Collect 25 coins in one run', 2, 25, 'coins', 'max'), q('C03', '링 8개 누적', 'Collect 8 rings', 1, 8, 'rings'), q('C04', '한 판 링 5개, 작은 충돌 0회', 'One run: 5 rings, no minor collision', 2, 1, 'cleanRings', 'special'), q('C05', '크리스털 10개 수집', 'Collect 10 crystals', 1, 10, 'crystals'), q('C06', '한 판 링·크리스털·코인 모두 수집', 'Collect a ring, crystal and coin in one run', 1, 1, 'allCollect', 'special'), q('C07', '위험 분기 3개 완주', 'Finish 3 risk routes', 3, 3, 'riskPaths'), q('C08', '날씨 2종에서 각각 코인 20개', 'Collect 20 coins in 2 weather states', 3, 2, 'weatherCoins', 'special'),
    q('I01', '수리로 실제 HP 35 회복', 'Repair 35 points of actual damage', 1, 35, 'repair'), q('I02', '보호막으로 피해 1회 방어', 'Block a hit with a shield', 1, 1, 'shieldBlocks'), q('I03', '배율 중 링 3회', 'Pass 3 rings with a multiplier', 2, 3, 'multRings'), q('I04', '슬로우 중 좁은 통과 2회', 'Pass 2 narrow routes in slow time', 2, 2, 'slowPass'), q('I05', '터보 중 근접 통과 2회', 'Make 2 near misses with turbo', 2, 2, 'turboNear'), q('I06', '한 판 서로 다른 효과 3종 획득', 'Collect 3 different effects in one run', 2, 3, 'effectCount', 'max'), q('I07', '보호막 종료 뒤 손상 없이 500m', 'Fly 500 m undamaged after a shield ends', 3, 500, 'postShield', 'max'), q('I08', '수리 후 손상 없이 1km 추가', 'Fly 1 km undamaged after repairing', 3, 1000, 'postRepair', 'max'),
    q('W01', '해안 수면 저공 누적 500m', 'Fly low over the coast for 500 m', 1, 500, 'coastLow'), q('W02', '마을 지붕 경로 3회', 'Complete 3 village rooftop routes', 2, 3, 'roofPass'), q('W03', '도시 구조물 통과 3회', 'Pass 3 city structures', 3, 3, 'cityPass'), q('W04', '협곡 경로 3회', 'Complete 3 canyon routes', 2, 3, 'canyonPass'), q('W05', '숲·산악에서 근접 5회', 'Make 5 near misses in alpine forests', 2, 5, 'forestNear'), q('W06', '강·항구 교량 아래 3회', 'Fly under 3 river or harbour bridges', 2, 3, 'bridgePass'), q('W07', '실제 명소 참고 랜드마크 발견', 'Discover a real-world inspired landmark', 3, 1, 'landmarkCount', 'max'), q('W08', '한국 하위 풍경 2종 발견', 'Discover 2 Korean landscapes', 4, 2, 'koreaVariants', 'special'),
    q('A01', '비에서 누적 1km', 'Fly 1 km through rain', 1, 1000, 'rainDistance'), q('A02', '야간 링 5회', 'Pass 5 rings at night', 2, 5, 'nightRings'), q('A03', '안개 속 지정 통과 2회', 'Pass 2 routes through fog', 3, 2, 'fogPass'), q('A04', '눈 속 손상 없이 500m', 'Fly 500 m undamaged through snow', 2, 500, 'snowSafe', 'max'), q('A05', '한 판 날씨 3상태 경험', 'Experience 3 weather states in one run', 2, 3, 'weatherCount', 'max'), q('A06', '한 판 낮·밤 각각 500m', 'One run: 500 m each in day and night', 3, 1, 'dayNight', 'special'), q('A07', '폭풍에서 근접 3회', 'Make 3 near misses in a storm', 3, 3, 'stormNear'), q('A08', '오로라·화산·폭포 중 2종 발견', 'Discover 2 special environments', 4, 2, 'specialThemes', 'special'),
    q('P01', '현재 해금 기체로 유효 비행 2판', 'Finish 2 valid flights with an owned plane', 1, 2, 'validFlights'), q('P02', '해금 기체 2종으로 각 1km', 'Fly 1 km in 2 owned aircraft', 2, 2, 'twoPlanes', 'special', 'twoPlanes'), q('P03', '기체 레벨 1회 강화', 'Upgrade an aircraft once', 1, 1, 'upgrade'), q('P04', '기체별 최고 거리 갱신', 'Set a new aircraft distance record', 2, 1, 'planeRecord'), q('P05', '강화 후 손상 없이 1km', 'Fly 1 km undamaged after upgrading', 2, 1000, 'afterUpgrade', 'max', 'upgraded'), q('P06', '경비행기로 저공 500m', 'Fly low for 500 m in a light aircraft', 2, 500, 'lightLow'), q('P07', '복엽기·곡예기로 콤보 8', 'Reach combo 8 in a biplane or aerobat', 3, 8, 'aeroCombo', 'max', 'aerobat'), q('P08', '해금한 제트로 5km', 'Fly 5 km in an owned jet', 4, 5000, 'jetDistance', 'max', 'jet'),
    q('H01', 'E 종료 후 손상 없이 500m', 'Fly 500 m undamaged after Hyper Trick', 1, 500, 'postE', 'max'), q('H02', 'E 없이 한 판 3km', 'Fly 3 km without Hyper Trick', 2, 3000, 'normalDistance', 'max'), q('H03', '일반 비행 콤보 8 + 링 3', 'Normal flight: combo 8 + 3 rings', 3, 1, 'normalComboRings', 'special'), q('H04', '작은 충돌 뒤 수리하고 500m 생존', 'Repair after a hit and survive 500 m', 2, 1, 'recover', 'special'), q('H05', '한 판 안전·위험 분기 각각 2회', 'One run: 2 safe and 2 risk routes', 2, 1, 'bothPaths', 'special'), q('H06', 'E 사용 기록의 개인 최고 갱신', 'Set a new Hyper Trick record', 3, 1, 'eRecord'), q('H07', '일반 비행 2개 테마 + 콤보 10', 'Normal flight: 2 themes + combo 10', 4, 1, 'normalThemesCombo', 'special'), q('H08', '한 판 고속·저공·좁은 통과 성공', 'One run: fast risk, low flight and narrow pass', 3, 1, 'allRisk', 'special')
];
export const QUEST_REWARDS = [120, 220, 360, 540];
export const QUEST_GROUPS = [['F', 'C', 'I'], ['F', 'C', 'I'], ['T', 'H'], ['T', 'H'], ['W', 'A'], ['P']];
export function availableQuest(q: QuestSpec, s: Save) {
    if (q.gate === 'twoPlanes')
        return s.owned.length >= 2;
    if (q.gate === 'jet')
        return s.owned.some(id => AIRCRAFT.find(p => p.id === id)?.jet);
    if (q.gate === 'aerobat')
        return s.owned.some(id => ['stearman', 'pitts', 'extra'].includes(id));
    if (q.gate === 'upgraded')
        return Object.values(s.levels).some(l => l > 1);
    if (['W03'].includes(q.id))
        return !!s.discoveries.city;
    if (['W04', 'W05', 'W07', 'W08', 'A03', 'A04', 'A07', 'A08'].includes(q.id))
        return (s.bests.all?.distance ?? 0) >= 15000 || Object.keys(s.discoveries).some(t => !['coast', 'village', 'city'].includes(t));
    if (q.id === 'W02')
        return !!s.discoveries.village;
    return true;
}
export function rerollCandidates(s: Save, current: Quest) { const spec = QUESTS.find(q => q.id === current.id)!; return QUESTS.filter(q => q.family === spec.family && q.tier === spec.tier && availableQuest(q, s) && !s.quests.some(a => a.id === q.id)); }
export function makeQuest(s: Save, slot: number, exclude: string[] = [], family?: string, tier?: number): Quest {
    let pool = QUESTS.filter(q => availableQuest(q, s) && !exclude.includes(q.id) && (family ? q.family === family : QUEST_GROUPS[slot].includes(q.family)) && (!tier || q.tier === tier));
    if (!pool.length && family)
        throw new Error('No matching reroll candidate');
    if (!pool.length)
        pool = QUESTS.filter(q => availableQuest(q, s) && !exclude.includes(q.id) && QUEST_GROUPS[slot].includes(q.family));
    const id = pool[Math.floor(hash(s.questSerial * 719 + slot * 113) * pool.length)].id;
    return { uid: `Q${s.questSerial++}`, id, progress: 0, detail: {}, acceptedAt: Date.now() };
}
export function ensureQuests(s: Save) {
    while (s.quests.length < 6)
        s.quests.push(makeQuest(s, s.quests.length, s.quests.map(q => q.id)));
    return s;
}
export function metricValue(key: string, r: RunResult, s: Save, detail: Record<string, number>): number {
    const m = r.metrics, p = AIRCRAFT.find(p => p.id === r.planeId)!;
    switch (key) {
        case 'cleanStart': return m.damage === 0 ? m.distance : Math.min(m.distance, m.cleanDistance ?? 0);
        case 'themeCount': return new Set(m.themes.map(t => t.split(':')[0])).size;
        case 'weatherCount': return m.weathers.length;
        case 'effectCount': return m.effects.length;
        case 'landmarkCount': return m.landmarks.filter(l => l.startsWith('real:')).length;
        case 'highRisk': return m.highRisk ?? 0;
        case 'lowNarrow': return +(m.low >= 300 && m.narrow >= 2);
        case 'cleanRings': return +(m.rings >= 5 && m.minorHits === 0);
        case 'allCollect': return +(m.rings > 0 && m.crystals > 0 && m.coins > 0);
        case 'weatherCoins':
            for (const [k, v] of Object.entries(m.weatherCoins))
                detail[k] = (detail[k] ?? 0) + v;
            return Object.values(detail).filter(v => v >= 20).length;
        case 'koreaVariants':
            for (const t of m.themes.filter(t => t.startsWith('korea:')))
                detail[t] = 1;
            return Object.keys(detail).length;
        case 'specialThemes':
            for (const t of m.themes.filter(t => ['aurora', 'volcano', 'waterfall'].includes(t)))
                detail[t] = 1;
            return Object.keys(detail).length;
        case 'dayNight': return +(m.dayDistance >= 500 && m.nightDistance >= 500);
        case 'validFlights': return +(m.distance >= 500 || m.time >= 30);
        case 'twoPlanes':
            detail[r.planeId] = (detail[r.planeId] ?? 0) + m.distance;
            return Object.values(detail).filter(v => v >= 1000).length;
        case 'upgrade': return 0;
        case 'planeRecord': return +(!r.eUsed && r.distance > (s.bests[r.mode === 'sortie' ? sortieBestKey(r.difficulty, false, r.planeId) : r.planeId + ':normal']?.distance ?? 0));
        case 'afterUpgrade': return s.upgraded[r.planeId] && m.damage === 0 ? m.distance : 0;
        case 'lightLow': return ['skyhawk', 'beaver'].includes(r.planeId) ? m.low : 0;
        case 'aeroCombo': return ['stearman', 'pitts', 'extra'].includes(r.planeId) ? m.maxCombo : 0;
        case 'jetDistance': return p.jet ? m.distance : 0;
        case 'normalDistance': return r.eUsed ? 0 : m.distance;
        case 'normalComboRings': return +(!r.eUsed && m.maxCombo >= 8 && m.rings >= 3);
        case 'recover': return +(m.minorHits > 0 && m.repair > 0 && m.recoveryDistance >= 500);
        case 'bothPaths': return +(m.safePaths >= 2 && m.riskPaths >= 2);
        case 'eRecord': return +(r.eUsed && r.distance > (s.bests[r.mode === 'sortie' ? sortieBestKey(r.difficulty, true) : 'allE']?.distance ?? 0));
        case 'normalThemesCombo': return +(!r.eUsed && new Set(m.themes.map(t => t.split(':')[0])).size >= 2 && m.maxCombo >= 10);
        case 'allRisk': return +((m.highRisk ?? 0) > 0 && m.low > 0 && m.narrow > 0);
        default: return Number((m as unknown as Record<string, unknown>)[key] ?? 0);
    }
}
export function questProgress(q: Quest, r: RunResult, s: Save) { const spec = QUESTS.find(p => p.id === q.id)!; const detail = { ...q.detail }; const v = metricValue(spec.key, r, s, detail); return { progress: Math.min(spec.target, spec.mode === 'sum' ? q.progress + v : spec.mode === 'special' && ['weatherCoins', 'koreaVariants', 'specialThemes', 'twoPlanes'].includes(spec.key) ? v : Math.max(q.progress, v)), detail }; }
const careerRows: [
    string,
    string,
    number,
    string,
    string?
][] = [
    ['첫 500m', 'Your first 500 m', 500, 'distance'], ['방향 변경 경로 3회', '3 direction-changing routes', 3, 'directionPass'], ['링 3개', '3 score rings', 3, 'rings'], ['감속 통과 1회', '1 passage while braking', 1, 'brakePass'], ['손상 없이 1km', '1 km undamaged', 1000, 'cleanStart'],
    ['저공 500m', '500 m low flight', 500, 'low'], ['교량 아래 2회', 'Under 2 bridges', 2, 'bridgePass'], ['근접 통과 5회', '5 near misses', 5, 'near'], ['비에서 500m', '500 m through rain', 500, 'rainDistance'], ['한 판 3분', '3 minutes in one run', 180, 'time'],
    ['마을 발견', 'Discover the village', 1, 'discoverVillage'], ['좁은 통과 5회', '5 narrow passages', 5, 'narrow'], ['콤보 10', 'A 10 combo', 10, 'maxCombo'], ['야간 링 5회', '5 rings at night', 5, 'nightRings'], ['도시 발견', 'Discover the city', 1, 'discoverCity'],
    ['한 판 9분', '9 minutes in one run', 540, 'time'], ['일반 기록 10km', '10 km without Hyper Trick', 10000, 'normalDistance'], ['테마 5종 발견', 'Discover 5 themes', 5, 'discoverThemes'], ['한국 2변형 발견', 'Discover 2 Korean landscapes', 2, 'koreaVariants'], ['특별 테마 1종 발견', 'Discover a special environment', 1, 'specialThemes']
];
export const CAREER = careerRows.map(([label, en, target, key], i) => ({ id: `M${i + 1}`, label, en, target, key, chapter: Math.floor(i / 5), reward: [150, 250, 400, 650][Math.floor(i / 5)] }));
export const CHAPTERS = [['첫 출격', 'FIRST FLIGHT'], ['해안 조종사', 'COASTAL PILOT'], ['정밀 비행', 'PRECISION FLIGHT'], ['장거리 비행', 'LONG RANGE']];
export const ACHIEVEMENTS = [
    ...[['distance', '장거리', 'DISTANCE', [1000, 3000, 8000, 15000, 30000]], ['combo', '콤보', 'COMBO', [5, 10, 20, 35, 50]], ['near', '근접', 'CLOSE CALLS', [10, 30, 80, 200, 500]], ['narrow', '좁은 통과', 'NARROW LINES', [5, 15, 40, 100, 250]], ['low', '저공', 'LOW FLIGHT', [1000, 3000, 8000, 20000, 50000]], ['rings', '링', 'RING HUNTER', [10, 30, 80, 200, 500]], ['world', '세계 탐험', 'EXPLORER', [1, 3, 5, 9, 13]], ['level', '기체 정비', 'ENGINEER', [2, 5, 10, 15, 20]]].flatMap(([key, label, en, targets]) => (targets as number[]).map((target, i) => ({ id: `${key}-${i + 1}`, key: key as string, label: label as string, en: en as string, target, reward: [100, 200, 350, 600, 1000][i], tier: i + 1 })))
];
export function achievementValue(key: string, s: Save) {
    switch (key) {
        case 'distance': return Math.max(s.bests.all?.distance ?? 0, s.bests.allE?.distance ?? 0);
        case 'combo': return s.totals.maxCombo ?? 0;
        case 'world': return new Set(Object.keys(s.discoveries).map(t => t.split(':')[0])).size;
        case 'level': return Math.max(...Object.values(s.levels));
        default: return s.totals[key] ?? 0;
    }
}
export function applyRun(s: Save, r: RunResult): Save {
    if (r.practice || s.settled.includes(r.id))
        return s.checkpoint?.id === r.id ? { ...s, checkpoint: null } : s;
    const next = structuredClone(s);
    next.coins += r.reward;
    next.checkpoint = null;
    next.settled = [...s.settled, r.id];
    next.runs = [r, ...s.runs].slice(0, 20);
    if (r.mode === 'sortie' && r.seed !== undefined && r.level !== undefined && r.contract) {
        const rival = personalRival([r, ...s.runs], { seed: r.seed, plane: r.planeId, level: r.level, difficulty: r.difficulty ?? 'standard', contractId: r.contract.id });
        // Repeated attempts must not evict the very record being challenged.
        // Keep the history bounded, retaining one matching best flight.
        if (rival && !next.runs.some(run => run.id === rival.id)) next.runs[next.runs.length - 1] = rival;
    }
    for (const q of next.quests) {
        const v = questProgress(q, r, s);
        q.progress = v.progress;
        q.detail = v.detail;
    }
    const m = r.metrics;
    next.modelDiscoveries = [...new Set([...(next.modelDiscoveries ?? []), ...(r.discoveredModels ?? [])])];
    if (m.distance >= 500 || m.time >= 30) {
        next.tickets = Math.min(3, next.tickets + 1);
        next.validFlights[r.planeId] = (next.validFlights[r.planeId] ?? 0) + 1;
    }
    next.planeDistance[r.planeId] = (next.planeDistance[r.planeId] ?? 0) + r.distance;
    for (const key of ['distance', 'coins', 'rings', 'crystals', 'near', 'narrow', 'low', 'boost', 'repair', 'shieldBlocks'])
        next.totals[key] = (next.totals[key] ?? 0) + Number(m[key as keyof Metrics] ?? 0);
    next.totals.maxCombo = Math.max(next.totals.maxCombo ?? 0, r.maxCombo);
    next.totals.flights = (next.totals.flights ?? 0) + 1;
    if (r.mode === 'sortie') {
        next.totals.sortieAttempts = (next.totals.sortieAttempts ?? 0) + 1;
        if (r.sortie?.completed) next.totals.sortieCompletions = (next.totals.sortieCompletions ?? 0) + 1;
    }
    for (const [key, seconds] of Object.entries(m.themeTime)) {
        const prev = next.discoveries[key];
        const total = (prev?.seconds ?? next.totals['theme:' + key] ?? 0) + seconds;
        if (total >= 20) {
            next.discoveries[key] = { date: prev?.date ?? r.date, seconds: total, flights: (prev?.flights ?? 0) + 1, ...(prev?.image ? { image: prev.image, imageRevision: prev.imageRevision } : {}), ...(r.discoveryImages?.[key] ? { image: r.discoveryImages[key], imageRevision: WORLD_IMAGE_REVISION } : {}) };
            delete next.totals['theme:' + key];
        }
        else
            next.totals['theme:' + key] = total;
    }
    for (const id of m.landmarks) {
        const prev = next.landmarks[id];
        next.landmarks[id] = { date: prev?.date ?? r.date, visits: (prev?.visits ?? 0) + 1 };
    }
    const mission = CAREER[s.career];
    if (mission) {
        let v = 0;
        let mode = 'sum';
        switch (mission.key) {
            case 'discoverVillage':
                v = +m.themes.includes('village');
                mode = 'max';
                break;
            case 'discoverCity':
                v = +m.themes.includes('city');
                mode = 'max';
                break;
            case 'discoverThemes':
                for (const key of m.themes)
                    next.careerDetail[key.split(':')[0]] = 1;
                v = Object.keys(next.careerDetail).length;
                mode = 'max';
                break;
            default:
                v = metricValue(mission.key, r, s, next.careerDetail);
                if (['time', 'cleanStart', 'maxCombo', 'normalDistance', 'koreaVariants', 'specialThemes'].includes(mission.key))
                    mode = 'max';
        }
        next.careerProgress = Math.min(mission.target, mode === 'sum' ? s.careerProgress + v : Math.max(s.careerProgress, v));
    }
    const recordKeys = r.mode === 'sortie'
        ? [sortieBestKey(r.difficulty, r.eUsed), sortieBestKey(r.difficulty, r.eUsed, r.planeId)]
        : [r.eUsed ? 'allE' : 'all', r.planeId + (r.eUsed ? ':e' : ':normal')];
    for (const key of recordKeys) {
        const b = next.bests[key] ?? { distance: 0, score: 0, combo: 0 };
        next.bests[key] = { distance: Math.max(b.distance, r.distance), score: Math.max(b.score, r.score), combo: Math.max(b.combo, r.maxCombo) };
    }
    return recordDailyRun(next, r);
}
export function upgradeEvents(s: Save) {
    for (const q of s.quests)
        if (q.id === 'P03')
            q.progress = 1;
    return s;
}
