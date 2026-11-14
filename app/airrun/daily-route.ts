import { AIRCRAFT } from './data';
import type { DailyBest, DailyRouteRecord, RunResult, Save } from './types';

/** The daily boundary is explicit so a device's locale or timezone cannot change its route. */
export const DAILY_TIME_ZONE = 'America/New_York';
export const DAILY_RECORD_LIMIT = 31;
const calendar = new Intl.DateTimeFormat('en-US', {
    timeZone: DAILY_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function calendarParts(date: Date) {
    if (!Number.isFinite(date.getTime())) throw new RangeError('Invalid daily route date');
    const parts = Object.fromEntries(calendar.formatToParts(date).filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
    return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute, second: parts.second };
}

export function validDailyKey(key: unknown): key is string {
    if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
    const date = new Date(`${key}T12:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === key;
}

/** Stable FNV-1a instead of Math.random, with a versioned namespace for future route editions. */
export function dailySeed(key: string) {
    if (!validDailyKey(key)) throw new RangeError('Invalid daily route key');
    let hash = 0x811c9dc5;
    for (const char of `voxel-airrun:daily:v1:${key}`) hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193);
    return hash >>> 0;
}

export function dailyRoute(now = new Date()) {
    const p = calendarParts(now);
    const key = `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
    // Resolve tomorrow's local midnight with the timezone's offset at that midnight,
    // rather than adding 24 hours (which is wrong on daylight-saving boundaries).
    const localTomorrow = Date.UTC(p.year, p.month - 1, p.day + 1);
    let midnight = localTomorrow;
    for (let i = 0; i < 3; i++) {
        const at = calendarParts(new Date(midnight));
        const local = Date.UTC(at.year, at.month - 1, at.day, at.hour, at.minute, at.second);
        midnight += localTomorrow - local;
    }
    const seed = dailySeed(key);
    return { key, seed, code: `AR-${key.replaceAll('-', '')}-${seed.toString(16).padStart(8, '0').slice(0, 4).toUpperCase()}`, resetsAt: new Date(midnight).toISOString() };
}

export function dailyBest(save: Pick<Save, 'dailyRecords'>, key: string, eUsed = false): DailyBest | undefined {
    return save.dailyRecords?.[key]?.[eUsed ? 'hyper' : 'normal'];
}

const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v < 1e12;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function validBest(value: unknown): value is DailyBest {
    return object(value) && ['distance', 'score', 'combo'].every(k => count(value[k])) && Number(value.score) >= Number(value.distance)
        && AIRCRAFT.some(p => p.id === value.planeId) && typeof value.runId === 'string' && value.runId.length > 0 && value.runId.length <= 120;
}

/** Invalid backup additions are rejected; old saves without this optional field remain valid. */
export function validDailyRecords(value: unknown): value is Record<string, DailyRouteRecord> {
    return object(value) && Object.keys(value).length <= DAILY_RECORD_LIMIT && Object.entries(value).every(([key, entry]) => validDailyKey(key)
        && object(entry) && count(entry.attempts) && entry.attempts > 0 && typeof entry.updatedAt === 'string' && Number.isFinite(Date.parse(entry.updatedAt))
        && (entry.normal !== undefined || entry.hyper !== undefined)
        && (entry.normal === undefined || validBest(entry.normal)) && (entry.hyper === undefined || validBest(entry.hyper)));
}

/** Called only for newly settled results. Does not alter rewards, quests or general records. */
export function recordDailyRun(save: Save, result: RunResult): Save {
    if (result.mode !== 'daily' || result.practice || !validDailyKey(result.dailyKey)) return save;
    const key = result.dailyKey;
    const previous = save.dailyRecords?.[key];
    const section = result.eUsed ? 'hyper' : 'normal';
    const best = previous?.[section];
    const improves = !best || result.distance > best.distance || (result.distance === best.distance && result.score > best.score);
    const entry: DailyRouteRecord = {
        ...previous, attempts: (previous?.attempts ?? 0) + 1, updatedAt: result.date,
        ...(improves ? { [section]: { distance: result.distance, score: result.score, combo: result.maxCombo, planeId: result.planeId, runId: result.id } } : {}),
    };
    const dailyRecords = Object.fromEntries(Object.entries({ ...save.dailyRecords, [key]: entry }).sort(([a], [b]) => b.localeCompare(a)).slice(0, DAILY_RECORD_LIMIT));
    return { ...save, dailyRecords };
}
