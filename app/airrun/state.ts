import { create } from 'zustand';
import { CONTRACTS, contractTargets, validContract, validReplay, type ContractId } from './mastery';
import { AIRCRAFT, DEFAULT_SETTINGS, freshSave, emptyMetrics, stats, baseSpeed, upgradeCost, SKINS, THEMES } from './data';
import { ensureQuests, applyRun, rerollCandidates, QUESTS, QUEST_REWARDS, makeQuest, CAREER, ACHIEVEMENTS, achievementValue, upgradeEvents } from './progression';
import { parseSave as parseLegacy } from '../game/store';
import type { RunResult as LegacyRunResult } from '../game/data';
import type { Save, Settings, Phase, Panel, PracticeConfig, RunResult, HUD, Input, Celebration } from './types';
import type { FlightMode } from './types';
import { dailyBest, dailyRoute, validDailyKey, validDailyRecords } from './daily-route';
import { validFormation } from './formation';
import { validDebrief } from './adventure';
import { DIFFICULTIES } from './encounter-director';
import { sortieBestKey, validSortieResult } from './sortie';
export const input: Input = { x: 0, y: 0, boost: false, brake: false, gear: 3 };
export function releaseInput() { input.x = 0; input.y = 0; input.boost = false; input.brake = false; input.gear = 3; input.pendingGear = 0; delete input.rush; delete input.transmit; }
export const EMPTY_HUD: HUD = { distance: 0, score: 0, bonus: 0, coins: 0, combo: 0, maxCombo: 0, speed: 144, hp: 100, maxHp: 100, altitude: 23, time: 0, theme: 'coast', variant: 0, weather: { kind: 'clear', cloud: .15, rain: 0, fog: 0, wind: 0, wet: 0, night: 0, lightning: 0, snow: false }, gear: 3, boost: 0, heat: 0, eUsed: false, eRemaining: 0, effects: [], message: '', messageEn: '', messageUntil: 0, route: '', routeEn: '', fps: 0, draws: 0, triangles: 0, metrics: emptyMetrics() };
let connection: Promise<IDBDatabase> | null = null;
function database() {
    if (!connection)
        connection = new Promise((resolve, reject) => {
            const r = indexedDB.open('voxel-airrun', 1);
            r.onupgradeneeded = () => {
                if (!r.result.objectStoreNames.contains('pilot'))
                    r.result.createObjectStore('pilot');
            };
            r.onsuccess = () => resolve(r.result);
            r.onerror = () => { connection = null; reject(r.error); };
        });
    return connection;
}
let lastStorageRevision = 0;
interface StoredFallback { storageVersion: 1; revision: number; save: unknown }
function readFallback() {
    const raw = localStorage.getItem('airrun-save-v3');
    if (!raw) return { save: null as unknown, revision: 0 };
    let value: unknown;
    try { value = JSON.parse(raw); }
    catch { return { save: raw as unknown, revision: 0 }; }
    if (value && typeof value === 'object' && 'storageVersion' in value && value.storageVersion === 1 && 'revision' in value && typeof value.revision === 'number' && Number.isSafeInteger(value.revision) && value.revision > 0 && 'save' in value)
        return { save: value.save, revision: value.revision };
    return { save: value, revision: 0 };
}
let archivedPilot: unknown = null;
async function readStored() {
    let fallback: ReturnType<typeof readFallback> | null = null;
    try {
        fallback = readFallback();
        const previous = localStorage.getItem('airrun-save-v3-recovery');
        if (previous !== null) archivedPilot = JSON.parse(previous);
    } catch { /* IndexedDB can remain available when Web Storage is disabled. */ }
    try {
        const db = await database();
        const stored = await new Promise<{ save: unknown; revision: number }>((resolve, reject) => {
            const tx = db.transaction('pilot', 'readonly'), store = tx.objectStore('pilot');
            const r = store.get('save-v3'), old = store.get('save'), revision = store.get('save-v3-revision');
            const original = store.get('save-v3-recovery');
            tx.oncomplete = () => {
                archivedPilot = original.result ?? archivedPilot;
                resolve({ save: r.result ?? old.result ?? null, revision: Number.isSafeInteger(revision.result) ? revision.result : 0 });
            };
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
        lastStorageRevision = Math.max(lastStorageRevision, stored.revision, fallback?.revision ?? 0);
        // A fallback written during a temporary IndexedDB outage must win over
        // the older IndexedDB record once that database becomes available again.
        return fallback && fallback.save !== null && (stored.save === null || fallback.revision > stored.revision) ? fallback.save : stored.save;
    }
    catch (error) {
        if (!fallback) throw error;
        lastStorageRevision = Math.max(lastStorageRevision, fallback.revision);
        return fallback.save;
    }
}
let writeQueue = Promise.resolve();
let recoveryOriginal: unknown = null;
export function storageMessage(language: Settings['language'], kind: 'write' | 'access' | 'raw' | 'repaired') {
    const messages = {
        write: ['기록 저장에 실패했습니다. 설정에서 백업을 내보내 주세요.', 'Could not save progress. Export a backup in Settings.'],
        access: ['브라우저 저장소를 사용할 수 없습니다. 설정에서 백업을 내보낼 수 있습니다.', 'Browser storage is unavailable. You can export a backup in Settings.'],
        raw: ['이전 저장 원본을 보관했습니다. 설정에서 내보낼 수 있습니다.', 'The original save is available to export in Settings.'],
        repaired: ['손상된 항목을 복구했습니다. 설정에서 원본도 내보낼 수 있습니다.', 'Damaged fields were recovered. You can export the original in Settings.'],
    };
    return messages[kind][language === 'en' ? 1 : 0];
}
export function persistSave(s: Save) {
    const snapshot = structuredClone(s);
    const revision = lastStorageRevision = Math.max(Date.now(), lastStorageRevision + 1);
    writeQueue = writeQueue.catch(() => { }).then(async () => {
        try {
            const db = await database();
            await new Promise<void>((resolve, reject) => {
                const tx = db.transaction('pilot', 'readwrite');
                const store = tx.objectStore('pilot');
                if (recoveryOriginal !== null) {
                    const raw = recoveryOriginal;
                    const first = store.get('save-v3-recovery'), second = store.get('save-v3-recovery-2');
                    first.onsuccess = () => { if (first.result !== undefined) store.put(first.result, 'save-v3-recovery-2'); };
                    second.onsuccess = () => { if (second.result !== undefined) store.put(second.result, 'save-v3-recovery-3'); };
                    store.put(raw, 'save-v3-recovery');
                }
                store.put(snapshot, 'save-v3');
                store.put(revision, 'save-v3-revision');
                tx.oncomplete = () => { recoveryOriginal = null; resolve(); };
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error);
            });
            try {
                const pending = readFallback();
                if (pending.revision <= revision) localStorage.removeItem?.('airrun-save-v3');
            } catch { /* A successful IndexedDB commit does not depend on Web Storage. */ }
        }
        catch {
            if (recoveryOriginal !== null) {
                const latest = localStorage.getItem('airrun-save-v3-recovery');
                const older = localStorage.getItem('airrun-save-v3-recovery-2');
                if (older !== null) localStorage.setItem('airrun-save-v3-recovery-3', older);
                if (latest !== null) localStorage.setItem('airrun-save-v3-recovery-2', latest);
                localStorage.setItem('airrun-save-v3-recovery', JSON.stringify(recoveryOriginal));
                recoveryOriginal = null;
            }
            const fallback: StoredFallback = { storageVersion: 1, revision, save: snapshot };
            localStorage.setItem('airrun-save-v3', JSON.stringify(fallback));
        }
    });
    return writeQueue;
}
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const nonnegative = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e12;
const themeKey = (key: string) => THEMES.some(t => t.id === key) || /^korea:[0-3]$/.test(key);
const imageData = (v: unknown) => typeof v === 'string' && v.length <= 200000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(v);
export function validateResult(value: unknown): value is RunResult {
    if (!isObject(value))
        return false;
    const v = value as unknown as RunResult;
    if (typeof v.id !== 'string' || !v.id.length || v.id.length > 120 || typeof v.date !== 'string' || !Number.isFinite(Date.parse(v.date)) || !AIRCRAFT.some(p => p.id === v.planeId) || !['distance', 'bonus', 'score', 'coins', 'reward', 'maxCombo'].every(k => nonnegative(value[k]) && Number.isInteger(value[k])) || v.score !== v.distance + v.bonus || typeof v.eUsed !== 'boolean' || typeof v.practice !== 'boolean' || typeof v.interrupted !== 'boolean' || typeof v.reason !== 'string' || v.reason.length > 200 || !isObject(v.metrics))
        return false;
    const expected = v.practice ? 0 : Math.floor(v.distance / (v.legacyReward ? 40 : 30)) + Math.floor(v.bonus / (v.legacyReward ? 150 : 180)) + v.coins;
    if (v.reward !== expected)
        return false;
    const m = v.metrics as unknown as Record<string, unknown>;
    const fields = Object.entries(emptyMetrics()).filter(([, initial]) => typeof initial === 'number').map(([key]) => key);
    if (!fields.every(k => nonnegative(m[k])) || v.metrics.distance !== v.distance || v.metrics.bonus !== v.bonus || v.metrics.coins !== v.coins || !['themes', 'effects', 'weathers', 'landmarks'].every(k => Array.isArray(m[k]) && (m[k] as unknown[]).every(x => typeof x === 'string' && x.length <= 120)) || !isObject(v.metrics.themeTime) || !Object.entries(v.metrics.themeTime).every(([key, n]) => themeKey(key) && nonnegative(n)) || !isObject(v.metrics.weatherCoins) || !Object.values(v.metrics.weatherCoins).every(nonnegative))
        return false;
    if (v.reasonEn !== undefined && (typeof v.reasonEn !== 'string' || v.reasonEn.length > 256))
        return false;
    if (v.formation !== undefined && (v.mode !== 'endless' || v.practice || !validFormation(v.formation, v.debrief?.manualSeconds ?? 0) ||
        v.formation.points + (v.debrief?.operationBonus ?? 0) + (v.debrief?.precisionBonus ?? 0) + (v.debrief?.flowBonus ?? 0) > v.bonus)) return false;
    if (v.bestRingStreak !== undefined && (!Number.isSafeInteger(v.bestRingStreak) || v.bestRingStreak < 0 || v.bestRingStreak > (v.metrics?.rings ?? 0))) return false;
    if (v.rush !== undefined && (!isObject(v.rush) || !Number.isSafeInteger(v.rush.uses) || v.rush.uses < 0 || v.rush.uses > 100000 || !Number.isSafeInteger(v.rush.distance) || v.rush.distance < 0 || v.rush.distance > v.distance)) return false;
    if (v.relayClears !== undefined && (!Number.isSafeInteger(v.relayClears) || v.relayClears < 0 || v.relayClears*3>v.metrics.directionPass || v.relayClears*450>v.bonus)) return false;
    if (v.courseEdition !== undefined && (!Number.isSafeInteger(v.courseEdition) || v.courseEdition < 1 || v.courseEdition > 10000)) return false;
    if (v.seed !== undefined && (!Number.isInteger(v.seed) || v.seed < 0 || v.seed > 0xffffffff)) return false;
    if (v.level !== undefined && (!Number.isInteger(v.level) || v.level < 1 || v.level > 20)) return false;
    if (v.contract !== undefined && (v.mode !== 'sortie' || !validContract(v.contract, { perfect: v.debrief?.perfectPasses ?? 0, boost: v.metrics.boost, risk: v.metrics.near + v.metrics.narrow }) || v.contract.bonus + (v.sortie?.bonus ?? 0) + (v.debrief?.operationBonus ?? 0) + (v.debrief?.precisionBonus ?? 0) + (v.debrief?.flowBonus ?? 0) > v.bonus)) return false;
    if (v.contract !== undefined && v.level !== undefined) {
        const plane = AIRCRAFT.find(p => p.id === v.planeId)!;
        // Historical contracts were signed against the aircraft and speed table of that edition.
        const speed = (v.courseEdition ?? 1) <= 6
            ? 40 * plane.speed * (1+.015*(v.level-1)) * (v.difficulty === 'expert' ? (v.courseEdition === 6 ? 1.15 : 1.12) : v.difficulty === 'relaxed' ? .88 : 1)
            : baseSpeed(0) * stats(plane, v.level).speed * (DIFFICULTIES[v.difficulty ?? 'standard']?.speedMultiplier ?? 1);
        if (JSON.stringify(v.contract.targets) !== JSON.stringify(contractTargets(v.contract.id, speed, v.difficulty ?? 'standard'))) return false;
    }
    if (v.replay !== undefined && (v.mode !== 'sortie' || !v.sortie?.completed || v.eUsed || v.interrupted || v.seed === undefined || v.level === undefined || !validReplay(v.replay, v.metrics.time, v.distance))) return false;
    if (v.mode !== undefined && v.mode !== 'endless' && v.mode !== 'daily' && v.mode !== 'sortie') return false;
    if (v.difficulty !== undefined && !['relaxed', 'rookie', 'standard', 'expert'].includes(v.difficulty)) return false;
    if (v.mode === 'daily' && v.difficulty !== undefined && v.difficulty !== 'standard') return false;
    if (v.mode === 'daily' ? v.practice || !validDailyKey(v.dailyKey) : v.dailyKey !== undefined) return false;
    if (v.debrief !== undefined && (!validDebrief(v.debrief)
        || v.debrief.operationBonus + v.debrief.precisionBonus + v.debrief.flowBonus > v.bonus
        || !['controlDistance', 'lowDistance', 'boostDistance', 'cleanDistance'].every(key => v.debrief![key as 'controlDistance'] <= v.distance))) return false;
    if (v.debrief?.manualSeconds !== undefined && v.debrief.manualSeconds > v.metrics.time + 1e-6) return false;
    if (v.debrief?.vault && v.debrief.vault.secured !== v.debrief.flowBonus) return false;
    if (v.mode === 'sortie') {
        if (v.practice || !validSortieResult(v.sortie) || !v.debrief || v.debrief.manualSeconds === undefined
            || v.sortie.elapsed > v.metrics.time + 1e-6 || v.sortie.elapsed > v.debrief.manualSeconds + 1e-6
            || v.sortie.operations !== v.debrief.operationsCompleted || v.sortie.perfectPasses !== v.debrief.perfectPasses
            || v.sortie.bonus + v.debrief.operationBonus + v.debrief.precisionBonus + v.debrief.flowBonus > v.bonus) return false;
    } else if (v.sortie !== undefined) return false;
    if (v.discoveredModels !== undefined && (!Array.isArray(v.discoveredModels) || v.discoveredModels.length > 1000 || !v.discoveredModels.every(id => typeof id === 'string' && /^[a-z0-9_]{1,120}$/.test(id)))) return false;
    if (v.discoveryImages !== undefined && (!isObject(v.discoveryImages) || !Object.entries(v.discoveryImages).every(([key, image]) => themeKey(key) && imageData(image))))
        return false;
    return true;
}
export function parseSave(value: unknown): Save | null {
    if (!isObject(value))
        return null;
    if (value.schemaVersion === 1 || value.schemaVersion === 2) {
        const old = parseLegacy(value);
        if (!old)
            return null;
        const s = freshSave();
        Object.assign(s, { nickname: old.nickname, coins: old.coins, owned: [...old.owned], levels: { ...old.levels }, selected: AIRCRAFT[old.selected]?.id ?? 'skyhawk', settings: { ...DEFAULT_SETTINGS, ...old.settings, sfx: DEFAULT_SETTINGS.sfx, language: 'ko' }, skins: old.skins ?? {}, skinSelected: old.skinSelected ?? {}, settled: [...old.settled], discoveries: old.discoveries ?? {}, bests: { ...old.planeBests, all: { distance: old.bestDistance, score: old.bestScore, combo: old.totals.maxCombo }, allE: { distance: old.bestEDistance ?? 0, score: old.bestEScore ?? 0, combo: 0 } }, legacyPaid: old.achievements ?? [] });
        s.totals = { ...old.totals, near: old.totals.nearMisses, narrow: old.totals.narrowPasses, low: old.totals.lowDistance };
        const legacyMap: Record<string, string[]> = { distance1000: ['distance-1'], distance5000: ['distance-2'], distance10000: ['distance-3'], distance25000: ['distance-4'], distance50000: ['distance-5'], combo10: ['combo-1', 'combo-2'], rings30: ['rings-1', 'rings-2'], themes5: ['world-1', 'world-2', 'world-3'], themes13: ['world-4', 'world-5'] };
        for (const id of s.legacyPaid)
            s.achievements.push(...(legacyMap[id] ?? []));
        s.achievements = [...new Set(s.achievements)];
        const convert = (r: LegacyRunResult): RunResult => { const metrics = { ...emptyMetrics(), ...r.metrics, distance: r.distance, bonus: r.bonus, coins: r.coins, maxCombo: r.maxCombo, time: 0, near: r.metrics?.nearMisses ?? 0, narrow: r.metrics?.narrowPasses ?? 0, low: r.metrics?.lowDistance ?? 0, themeTime: r.metrics?.themeTimes ?? {}, themes: Object.keys(r.metrics?.themeTimes ?? {}), landmarks: [], effects: [], weathers: [] }; return { ...r, mode: 'endless', legacyReward: true, eUsed: !!r.eUsed, practice: r.mode === 'practice', interrupted: !!r.interrupted, reason: '이전 비행 기록', metrics }; };
        s.runs = old.runs.map(convert);
        if (old.checkpoint)
            s.checkpoint = convert(old.checkpoint);
        return ensureQuests(s);
    }
    const input = value as unknown as Save;
    if (input.schema !== 3 || typeof input.nickname !== 'string' || input.nickname.length > 16 || !Number.isSafeInteger(input.coins) || input.coins < 0 || !Array.isArray(input.owned) || !input.owned.includes('skyhawk') || new Set(input.owned).size !== input.owned.length || !input.owned.every((id) => AIRCRAFT.some(p => p.id === id)) || !isObject(input.levels) || !input.owned.every((id: string) => Number.isInteger(input.levels[id]) && input.levels[id] >= 1 && input.levels[id] <= 20) || !AIRCRAFT.some(p => p.id === input.selected) || !isObject(input.settings))
        return null;
    const legacyDisplay = input.settings.resolutionScale === undefined;
    const oldStandard = input.balanceEdition === undefined && (input.settings.difficulty ?? 'standard') === 'standard';
    const se = { ...input.settings, difficulty: oldStandard ? 'rookie' as const : input.settings.difficulty ?? 'standard' as const, resolutionScale: legacyDisplay ? 1.25 as const : input.settings.resolutionScale };
    if (!['relaxed', 'rookie', 'standard', 'expert'].includes(se.difficulty)) return null;
    if (![1, 1.25, 1.5].includes(se.resolutionScale) || !['hold', 'gear'].includes(se.control) || !['balanced', 'high', 'ultra'].includes(se.quality) || !['ko', 'en'].includes(se.language) || ![30, 60].includes(se.targetFPS) || !(['volume', 'music', 'sfx'] as const).every(k => typeof se[k] === 'number' && se[k] >= 0 && se[k] <= 1) || !(['reducedMotion', 'skipTakeoff', 'leftHanded', 'adaptiveResolution'] as const).every(k => typeof se[k] === 'boolean') || !nonnegative(se.sensitivity) || se.sensitivity < .5 || se.sensitivity > 1.5)
        return null;
    if (se.flightCoach !== undefined && !['on','done','off'].includes(se.flightCoach)) return null;
    if (!Array.isArray(input.quests) || input.quests.length !== 6 || !input.quests.every((q) => isObject(q) && typeof q.uid === 'string' && QUESTS.some(x => x.id === q.id) && nonnegative(q.progress) && isObject(q.detail) && Object.values(q.detail).every(nonnegative) && q.progress <= QUESTS.find(x => x.id === q.id)!.target && typeof q.acceptedAt === 'number' && Number.isSafeInteger(q.acceptedAt)) || new Set(input.quests.map((q) => q.uid)).size !== 6 || !Number.isInteger(input.questSerial) || input.questSerial < 1 || !Number.isInteger(input.tickets) || input.tickets < 0 || input.tickets > 3 || !Number.isInteger(input.career) || input.career < 0 || input.career > 20 || !nonnegative(input.careerProgress) || !isObject(input.careerDetail))
        return null;
    if (!Array.isArray(input.achievements) || !input.achievements.every((id) => ACHIEVEMENTS.some(a => a.id === id)) || new Set(input.achievements).size !== input.achievements.length || !Array.isArray(input.legacyPaid) || !input.legacyPaid.every(id => typeof id === 'string') || !Array.isArray(input.runs) || input.runs.length > 20 || !input.runs.every(validateResult) || !Array.isArray(input.settled) || !input.settled.every((id) => typeof id === 'string') || new Set(input.settled).size !== input.settled.length || !(input.checkpoint === null || validateResult(input.checkpoint)))
        return null;
    for (const key of ['skins', 'skinSelected', 'landmarks', 'discoveries', 'totals', 'bests', 'upgraded', 'validFlights', 'planeDistance'])
        if (!isObject(value[key]))
            return null;
    if (input.modelDiscoveries !== undefined && (!Array.isArray(input.modelDiscoveries) || input.modelDiscoveries.length > 1000 || !input.modelDiscoveries.every(id => typeof id === 'string' && /^[a-z0-9_]{1,120}$/.test(id)))) return null;
    if (input.dailyRecords !== undefined && !validDailyRecords(input.dailyRecords)) return null;
    if (!Object.entries(input.landmarks).every(([key, v]) => /^(real|fiction):[a-z0-9_]+$/.test(key) && isObject(v) && typeof v.date === 'string' && Number.isFinite(Date.parse(v.date)) && Number.isInteger(v.visits) && v.visits >= 1))
        return null;
    if (!Object.values(input.careerDetail).every(nonnegative) || !Object.values(input.upgraded).every(v => typeof v === 'boolean') || !Object.values(input.validFlights).every(nonnegative) || !Object.values(input.planeDistance).every(nonnegative) || !Object.values(input.totals).every(nonnegative) || !Object.values(input.bests).every((b) => isObject(b) && ['distance', 'score', 'combo'].every(k => nonnegative(b[k]))) || !Object.values(input.discoveries).every((d) => isObject(d) && (d.image === undefined || imageData(d.image)) && typeof d.date === 'string' && Number.isFinite(Date.parse(d.date)) && nonnegative(d.seconds) && nonnegative(d.flights)))
        return null;
    for (const [id, skins] of Object.entries(input.skins))
        if (!AIRCRAFT.some(p => p.id === id) || !Array.isArray(skins) || !skins.every(k => SKINS.some(s => s.id === k)))
            return null;
    for (const [id, skin] of Object.entries(input.skinSelected))
        if (!AIRCRAFT.some(p => p.id === id) || !SKINS.some(s => s.id === skin) || (skin !== 'default' && !input.skins[id]?.includes(skin)))
            return null;
    if (legacyDisplay) {
        se.adaptiveResolution = false;
        if (se.quality === 'balanced') se.quality = 'high';
    }
    return structuredClone({ ...input, balanceEdition: 7, settings: se });
}
/** Strict parsing still guards complete imports and score records. Recovery runs
 * only for a recognizable pilot and validates fields against the same schema. */
const recoveryNames: Record<string,string> = {
    nickname:'조종사 이름', quests:'도전 과제', owned:'보유 기체', levels:'강화 단계', selected:'선택 기체',
    settings:'설정', runs:'비행 기록', bests:'최고 기록', skins:'보유 도장', skinSelected:'선택 도장',
    discoveries:'탐사 기록', landmarks:'랜드마크', dailyRecords:'일일 기록', tickets:'미션 변경권',
    coins:'코인', achievements:'업적', settled:'정산 기록', totals:'누적 기록', checkpoint:'비행 체크포인트',
};
export function recoveredFields(fields: string[], language: Settings['language']) {
    return fields.map(field => language === 'ko' ? recoveryNames[field] ?? field : field).join(', ');
}
export function recoverPilot(raw: unknown): {save: Save; fields: string[]} | null {
    if (!isObject(raw) || raw.schema !== 3 || !Array.isArray(raw.owned) && !isObject(raw.levels)) return null;
    const base = ensureQuests(freshSave());
    if (raw.balanceEdition === undefined) delete base.balanceEdition;
    const known = new Set(AIRCRAFT.map(plane => plane.id));
    const owned = Array.isArray(raw.owned) ? raw.owned.filter((id): id is string => typeof id === 'string' && known.has(id)) : [];
    const levels = isObject(raw.levels) ? raw.levels : {};
    base.owned = [...new Set(['skyhawk', ...owned, ...Object.keys(levels).filter(id => known.has(id) && Number.isInteger(levels[id]) && Number(levels[id]) > 0)])];
    base.levels = Object.fromEntries(base.owned.map(id => [id, Number.isInteger(levels[id]) ? Math.max(1, Math.min(20, Number(levels[id]))) : 1]));
    base.selected = typeof raw.selected === 'string' && base.owned.includes(raw.selected) ? raw.selected : 'skyhawk';
    base.nickname = typeof raw.nickname === 'string' ? raw.nickname.slice(0,16) : '';
    base.coins = Number.isSafeInteger(raw.coins) && Number(raw.coins) >= 0 ? Number(raw.coins) : 0;
    const candidate = base as unknown as Record<string, unknown>;
    const changed = new Set<string>();
    for (const key of ['coins','owned','levels','selected','nickname']) {
        if (JSON.stringify(candidate[key]) !== JSON.stringify(raw[key])) changed.add(key);
    }
    const keep = (key: string, value: unknown) => {
        if (!parseSave({ ...candidate, [key]: value })) return false;
        candidate[key] = value;
        return true;
    };
    for (const key of [...Object.keys(base), 'modelDiscoveries', 'dailyRecords']) {
        if (['schema','balanceEdition','owned','levels','selected','nickname','coins'].includes(key) || raw[key] === undefined) continue;
        const value = raw[key];
        if (keep(key, value)) continue;
        changed.add(key);
        if (key === 'quests' && Array.isArray(value)) {
            const slots = [...base.quests];
            value.slice(0,slots.length).forEach((quest, i) => {
                const next = [...slots]; next[i] = quest;
                if (keep(key,next)) slots[i] = quest;
            });
        } else if (Array.isArray(value)) {
            let entries: unknown[] = [];
            for (const item of value) if (keep(key,[...entries,item])) entries = [...entries,item];
        } else if (isObject(value)) {
            const accepted = { ...(isObject(candidate[key]) ? candidate[key] : {}) };
            for (const [id, item] of Object.entries(value)) {
                if (['__proto__','constructor','prototype'].includes(id)) continue;
                if (keep(key,{...accepted,[id]:item})) accepted[id]=item;
                else if (key==='skins' && Array.isArray(item)) {
                    const skins = item.filter(s => SKINS.some(skin => skin.id === s));
                    if (keep(key,{...accepted,[id]:skins})) accepted[id]=skins;
                }
            }
        }
    }
    const save = parseSave(candidate);
    return save ? {save,fields:[...changed]} : null;
}

interface GameState {
    phase: Phase;
    panel: Panel;
    save: Save;
    progress: number;
    loadingLabel: string;
    notice: string;
    audioFailures: string[];
    saveError: string;
    renderError: string;
    modelBusy: boolean;
    modelError: string;
    celebration: Celebration | null;
    ready: boolean;
    assetsReady: boolean;
    runId: string;
    seed: number;
    runLevel: number | null;
    contractId: ContractId;
    setContractId: (id: ContractId) => void;
    retryRoute: () => void;
    flightMode: FlightMode;
    dailyKey: string | null;
    practice: PracticeConfig | null;
    comparisonLevel: number | null;
    hud: HUD;
    result: RunResult | null;
    resumeCountdown: number;
    pausedPhase: 'flying' | 'takeoff';
    eRequest: number;
    bankRequest: number;
    maintenanceAt: number;
    tracked: string;
    skinPreview: string | null;
    backupPreview: Save | null;
    recoveryData: unknown;
    previewImages: Record<string, string>;
    load: () => Promise<void>;
    profile: (name: string) => void;
    openHangar: () => void;
    setPanel: (p: Panel) => void;
    select: (id: string) => void;
    purchase: () => void;
    upgrade: () => void;
    applySkin: (id: string) => void;
    settings: (v: Partial<Settings>) => void;
    start: () => void;
    setFlightMode: (mode: FlightMode) => void;
    skipTakeoff: () => void;
    hyper: () => void;
    bankFlow: () => void;
    pause: () => void;
    resume: () => void;
    airport: () => void;
    settle: (r: RunResult) => void;
    checkpoint: (r: RunResult) => void;
    claimQuest: (uid: string) => void;
    reroll: (uid: string) => void;
    claimCareer: () => void;
    claimAchievement: (id: string) => void;
    persist: () => void;
    importBackup: () => void;
}
const inLobby = () => ['airport', 'opening', 'hangar', 'results', 'registration'].includes(useAirrun.getState().phase);
/** Old checkpoints already contain their own mode; never relabel them with today's lobby selection. */
function tagRun(result: RunResult, state: Pick<GameState, 'runId' | 'flightMode' | 'dailyKey'>): RunResult {
    if (result.mode !== undefined || result.id !== state.runId || result.practice) return result;
    return { ...result, mode: state.flightMode, ...(state.flightMode === 'daily' && state.dailyKey ? { dailyKey: state.dailyKey } : {}) };
}
function mutate(fn: (s: Save) => Save) { const s = fn(structuredClone(useAirrun.getState().save)); useAirrun.setState({ save: s }); void persistSave(s).catch(() => useAirrun.setState({ saveError: storageMessage(useAirrun.getState().save.settings.language, 'write') })); }
export const useAirrun = create<GameState>((set, get) => ({ phase: 'loading', panel: 'hangar', save: ensureQuests(freshSave()), progress: 0, loadingLabel: '격납고 준비 중', notice: '', audioFailures: [], saveError: '', renderError: '', modelBusy: false, modelError: '', celebration: null, ready: false, assetsReady: false, runId: '', seed: 1, runLevel: null, contractId: 'precision', flightMode: 'endless', dailyKey: null, practice: null, comparisonLevel: null, hud: { ...EMPTY_HUD }, result: null, resumeCountdown: 0, pausedPhase: 'flying', eRequest: 0, bankRequest: 0, maintenanceAt: 0, tracked: 'career', skinPreview: null, backupPreview: null, recoveryData: null, previewImages: {},
    load: async () => {
        try {
            const raw = await readStored(), hasRaw = raw !== null && raw !== undefined;
            if (archivedPilot !== null) set({ recoveryData: archivedPilot });
            const valid = hasRaw ? parseSave(raw) : null;
            const restored = hasRaw && !valid ? recoverPilot(raw) : null;
            const s = valid ?? restored?.save;
            if (hasRaw && !valid) {
                recoveryOriginal = raw;
                set({ recoveryData: raw, saveError: storageMessage(s?.settings.language ?? get().save.settings.language, restored ? 'repaired' : 'raw') + (restored?.fields.length ? ' (' + recoveredFields(restored.fields, restored.save.settings.language) + ')' : '') });
            }
            if (s) {
                set({ save: s });
                if (restored) await persistSave(s);
                if (s.checkpoint && !s.settled.includes(s.checkpoint.id) && !s.checkpoint.practice)
                    get().settle({ ...s.checkpoint, interrupted: true, reason: '중단된 비행' });
                else if (s.checkpoint)
                    mutate(s => ({ ...s, checkpoint: null }));
            }
            else if (!hasRaw) {
                mutate(s => ({ ...s, settings: { ...s.settings, quality: 'high', targetFPS: matchMedia('(pointer:coarse)').matches ? 30 : 60, reducedMotion: matchMedia('(prefers-reduced-motion:reduce)').matches } }));
            }
            set({ ready: true });
        }
        catch {
            set({ ready: true, saveError: storageMessage(get().save.settings.language, 'access') });
        }
    },
    profile: name => { mutate(s => ({ ...s, nickname: name.trim().slice(0, 16) || 'PILOT' })); set({ phase: 'hangar', panel: 'hangar' }); },
    openHangar: () => {
        if (get().phase === 'airport')
            set({ phase: 'hangar' });
    }, setPanel: panel => {
        if (inLobby())
            set({ panel, skinPreview: null });
    },
    select: id => {
        if (!inLobby() || !AIRCRAFT.some(p => p.id === id))
            return;
        mutate(s => ({ ...s, selected: id }));
        set({ skinPreview: null, modelError: '' });
    },
    purchase: () => {
        if (!inLobby())
            return;
        const s = get().save, p = AIRCRAFT.find(p => p.id === s.selected)!;
        if (s.owned.includes(p.id))
            return;
        if (s.coins < p.price) {
            set({ notice: '코인이 부족합니다. / Not enough coins.' });
            return;
        }
        mutate(s => ({ ...s, coins: s.coins - p.price, owned: [...s.owned, p.id], levels: { ...s.levels, [p.id]: 1 } }));
        set({ celebration: { id: crypto.randomUUID(), kind: 'aircraft', title: p.name, titleEn: p.name, coins: 0, tier: 'CBAS'.indexOf(p.grade) + 1, detail: 'UNLOCKED' } });
    },
    upgrade: () => {
        if (!inLobby())
            return;
        const s = get().save, p = AIRCRAFT.find(p => p.id === s.selected)!, l = s.levels[p.id] ?? 1, cost = upgradeCost(p, l);
        if (!s.owned.includes(p.id) || l >= 20)
            return;
        if (s.coins < cost) {
            set({ notice: '코인이 부족합니다. / Not enough coins.' });
            return;
        }
        mutate(s => upgradeEvents({ ...s, coins: s.coins - cost, levels: { ...s.levels, [p.id]: l + 1 }, upgraded: { ...s.upgraded, [p.id]: true } }));
        set({ maintenanceAt: performance.now(), celebration: { id: crypto.randomUUID(), kind: 'upgrade', title: p.name, titleEn: p.name, coins: 0, tier: 'CBAS'.indexOf(p.grade) + 1, detail: 'Lv. ' + l + ' → ' + (l + 1) } });
    },
    applySkin: id => {
        if (!inLobby())
            return;
        const s = get().save, p = s.selected, skin = SKINS.find(k => k.id === id);
        if (!skin || !s.owned.includes(p))
            return;
        const owned = id === 'default' || s.skins[p]?.includes(id);
        if (!owned && id === 'courier') return;
        if (!owned && s.coins < skin.price) {
            set({ notice: '코인이 부족합니다. / Not enough coins.' });
            return;
        }
        mutate(s => ({ ...s, coins: s.coins - (owned ? 0 : skin.price), skins: { ...s.skins, [p]: owned ? (s.skins[p] ?? []) : [...(s.skins[p] ?? []), id] }, skinSelected: { ...s.skinSelected, [p]: id } }));
        set({ skinPreview: null });
    },
    settings: patch => {
        const next = { ...get().save.settings, ...patch };
        if (next.difficulty !== undefined && !['relaxed', 'rookie', 'standard', 'expert'].includes(next.difficulty)) return;
        if (![1, 1.25, 1.5].includes(next.resolutionScale) || !['hold', 'gear'].includes(next.control) || !['balanced', 'high', 'ultra'].includes(next.quality) || !['ko', 'en'].includes(next.language) || ![30, 60].includes(next.targetFPS) || !['volume', 'music', 'sfx'].every(k => Number.isFinite(next[k as 'volume']) && next[k as 'volume'] >= 0 && next[k as 'volume'] <= 1) || !Number.isFinite(next.sensitivity) || next.sensitivity < .5 || next.sensitivity > 1.5 || !['reducedMotion', 'skipTakeoff', 'leftHanded', 'adaptiveResolution'].every(k => typeof next[k as 'reducedMotion'] === 'boolean'))
            return;
        mutate(s => ({ ...s, settings: next }));
    },
    setFlightMode: mode => {
        if (inLobby() && (mode === 'endless' || mode === 'daily' || mode === 'sortie')) set({ flightMode: mode });
    },
    setContractId: id => { if (inLobby() && Object.hasOwn(CONTRACTS, id)) set({ contractId: id }); },
    retryRoute: () => {
        const state = get(), r = state.result;
        if (state.phase !== 'results' || r?.mode !== 'sortie' || r.seed === undefined || r.level === undefined
            || !state.save.owned.includes(r.planeId) || (state.save.levels[r.planeId] ?? 1) < r.level) return;
        mutate(s => ({ ...s, selected: r.planeId, settings: { ...s.settings, difficulty: r.difficulty ?? 'standard' } }));
        set({ flightMode: 'sortie', contractId: r.contract?.id ?? 'precision' });
        get().start();
        set({ seed: r.seed, runLevel: r.level });
    },
    start: () => {
        if (!inLobby())
            return;
        const s = get().save;
        if (!s.owned.includes(s.selected)) {
            set({ notice: '이 기체를 먼저 해금하세요. / Unlock this aircraft first.' });
            return;
        }
        releaseInput();
        const route = get().flightMode === 'daily' ? dailyRoute() : null;
        set({ practice: null, comparisonLevel: null, runLevel: null, runId: crypto.randomUUID(), seed: route?.seed ?? crypto.getRandomValues(new Uint32Array(1))[0], dailyKey: route?.key ?? null, phase: 'preflight', progress: 0, loadingLabel: '비행 경로 준비', panel: 'hangar', result: null, hud: { ...EMPTY_HUD }, eRequest: 0, bankRequest: 0, skinPreview: null, modelError: '' });
    },
    skipTakeoff: () => {
        if (get().phase === 'takeoff')
            set({ phase: 'flying' });
    }, hyper: () => {
        if (get().phase === 'flying' && !get().hud.eUsed && !get().hud.ePreparing)
            set({ eRequest: get().eRequest + 1 });
    },
    bankFlow: () => {
        const state = get();
        if (state.phase === 'flying' && !state.hud.eRemaining && !state.hud.ePreparing && (state.hud.adventure?.vault?.pending ?? 0) > 0)
            set({ bankRequest: state.bankRequest + 1 });
    },
    pause: () => {
        if (['flying', 'takeoff'].includes(get().phase)) {
            const pausedPhase = get().phase as 'flying' | 'takeoff';
            releaseInput();
            set({ phase: 'paused', pausedPhase, resumeCountdown: 0 });
        }
    },
    resume: () => {
        if (get().phase === 'paused' && !get().resumeCountdown && !get().modelError && !get().renderError && !(typeof document !== 'undefined' && document.hidden)) {
            releaseInput();
            set({ resumeCountdown: 3 });
        }
    },
    airport: () => { releaseInput(); set({ phase: 'hangar', panel: 'hangar', resumeCountdown: 0, practice: null, skinPreview: null, modelBusy: false, modelError: '' }); },
    settle: r => {
        const state = get(), s = state.save;
        if (s.settled.includes(r.id)) return;
        releaseInput();
        // Interrupted checkpoints contain only secured score. Their unbanked
        // reserve is forfeited rather than silently added to a recovered record.
        const vault = r.debrief?.vault;
        const finalized = vault?.pending ? { ...r, debrief: { ...r.debrief!, vault: { ...vault, pending: 0, lost: vault.lost + vault.pending } } } : r;
        const tagged = tagRun(finalized, state);
        const previous = tagged.mode === 'daily' && tagged.dailyKey ? dailyBest(s, tagged.dailyKey, tagged.eUsed)
            : s.bests[tagged.mode === 'sortie' ? sortieBestKey(tagged.difficulty, tagged.eUsed) : tagged.eUsed ? 'allE' : 'all'];
        const newBest = !tagged.practice && (tagged.mode === 'sortie' ? tagged.score > (previous?.score ?? 0) : tagged.distance > (previous?.distance ?? 0));
        const result = { ...tagged, newBest };
        mutate(s => applyRun(s, result));
        set({ result, phase: 'results', resumeCountdown: 0 });
    },
    checkpoint: r => {
        if (!r.practice && !get().save.settled.includes(r.id))
            mutate(s => ({ ...s, checkpoint: tagRun(r, get()) }));
    },
    claimQuest: uid => {
        if (!inLobby())
            return;
        const s = get().save, idx = s.quests.findIndex(q => q.uid === uid);
        if (idx < 0)
            return;
        const current = s.quests[idx], spec = QUESTS.find(q => q.id === current.id)!;
        if (current.progress < spec.target)
            return;
        mutate(s => { s.coins += QUEST_REWARDS[spec.tier - 1]; s.quests[idx] = makeQuest(s, idx, s.quests.map(q => q.id)); return s; });
        set({ celebration: { id: crypto.randomUUID(), kind: 'quest', title: spec.label, titleEn: spec.en, coins: QUEST_REWARDS[spec.tier - 1], tier: spec.tier } });
    },
    reroll: uid => {
        if (!inLobby())
            return;
        const s = get().save, idx = s.quests.findIndex(q => q.uid === uid);
        if (idx < 0 || s.tickets < 1)
            return;
        const spec = QUESTS.find(q => q.id === s.quests[idx].id)!;
        if (s.quests[idx].progress >= spec.target || !rerollCandidates(s, s.quests[idx]).length)
            return;
        mutate(s => { s.tickets--; s.quests[idx] = makeQuest(s, idx, s.quests.map(q => q.id), spec.family, spec.tier); return s; });
    },
    claimCareer: () => {
        if (!inLobby())
            return;
        const s = get().save, m = CAREER[s.career];
        if (!m || s.careerProgress < m.target)
            return;
        mutate(s => ({ ...s, coins: s.coins + m.reward, career: s.career + 1, careerProgress: 0, careerDetail: {} }));
        set({ celebration: { id: crypto.randomUUID(), kind: 'career', title: m.label, titleEn: m.en, coins: m.reward, tier: Math.min(4, Math.floor(s.career / 5) + 1) } });
    },
    claimAchievement: id => {
        if (!inLobby())
            return;
        const s = get().save, a = ACHIEVEMENTS.find(a => a.id === id);
        if (!a || s.achievements.includes(id) || achievementValue(a.key, s) < a.target)
            return;
        mutate(s => ({ ...s, coins: s.coins + a.reward, achievements: [...s.achievements, id] }));
        set({ celebration: { id: crypto.randomUUID(), kind: 'achievement', title: a.label, titleEn: a.en, coins: a.reward, tier: Math.min(4, +id.split('-').pop()! || 1) } });
    },
    persist: () => { void persistSave(get().save).catch(() => set({ saveError: storageMessage(useAirrun.getState().save.settings.language, 'write') })); },
    importBackup: () => {
        if (!inLobby() || !get().backupPreview)
            return;
        const before = new Blob([JSON.stringify(get().save, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(before), a = document.createElement('a');
        a.href = url;
        a.download = 'airrun-before-import.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        mutate(() => get().backupPreview!);
        set({ backupPreview: null, notice: '백업 복원 완료 / BACKUP RESTORED' });
    }
}));
