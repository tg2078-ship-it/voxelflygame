import { residentModelLOD } from './graphics';
import { scenicDistrict, encounterFamily } from './environment-palette';
import type { ModelLibrary } from './assets';
import type { FlightSimulation } from './simulation';
import type { AssetMeta, ThemeId } from './types';

const decks = new WeakMap<Map<string, AssetMeta>, Map<string, string[]>>();
/** A resident, collision-compatible visual floor; hero LODs are optional refinements. */
export function flightDeckAssets(theme: ThemeId, variant: number, catalog: Map<string, AssetMeta>) {
    let cache = decks.get(catalog); if (!cache) { cache = new Map(); decks.set(catalog, cache); }
    const key = `${theme}:${variant}`, cached = cache.get(key); if (cached) return cached;
    // A compact visual floor plus the actual generated encounters (added below)
    // is enough. Downloading an entire catalogue to show the first harbour delays
    // departure and competes with the approaching collision models.
    const ids = new Set<string>(), family = encounterFamily(theme, variant, 0, catalog, 0), place = scenicDistrict(theme, variant, 0);
    for (const value of Object.values(family)) for (const id of Array.isArray(value) ? value : [value]) ids.add(id);
    for (const id of [...place.buildings, ...place.working, ...place.accents, 'modular_pier_deck']) ids.add(id);
    if (theme === 'city' || theme === 'korea' && variant === 0)
        for (const id of ['rail_track', 'urban_street_tram', 'city_train', 'road_car', 'articulated_city_bus']) ids.add(id);
    const result = [...ids].filter(id => catalog.has(id)); cache.set(key, result); return result;
}

export class FlightStream {
    retained = new Set<string>();
    proxyIds = new Set<string>();
    pending = new Map<string, Promise<void>>();
    failures = new Set<string>();
    lastUpdate = -Infinity;
    lastQuality = '';
    disposed = false;
    constructor(readonly library: ModelLibrary) {}
    update(sim: FlightSimulation, force = false) {
        if (this.disposed || !force && this.lastQuality === sim.config.settings.quality && sim.time - this.lastUpdate < 1) return;
        this.lastUpdate = sim.time;
        this.lastQuality = sim.config.settings.quality;
        const current = sim.sortie ? { theme: { id: sim.theme }, variant: sim.variant } : sim.courseTheme(sim.z);
        // The next full theme gets 45 seconds of background download time, rather
        // than being discovered by the renderer two seconds before a collision.
        // Start downloading the next region once airborne; departure only waits for its visible course.
        const lookahead = sim.time > 1 ? 45 : 0;
        const next = sim.courseTheme(sim.z + sim.speed * lookahead, sim.time + lookahead);
        const ids = new Set([...flightDeckAssets(current.theme.id, current.variant, this.library.byId), ...flightDeckAssets(next.theme.id, next.variant, this.library.byId)]);
        for (const e of sim.encounters) for (const p of e.placements) if (p.z > sim.z - 180) ids.add(p.model);
        const keys = new Set<string>(); this.proxyIds = ids;
        // Nearby collision models enter the priority queue before the rest of a deck.
        const near = new Set(sim.encounters.flatMap(e => e.placements).filter(p => p.collision && p.z > sim.z - 60 && p.z < sim.z + Math.max(400, sim.speed * 6)).map(p => p.model));
        for (const id of [...ids].sort((a, b) => Number(near.has(b)) - Number(near.has(a)))) {
            const meta = this.library.byId.get(id); if (!meta) continue;
            const lod = residentModelLOD(meta, sim.config.settings.quality), key = this.library.cacheKey(id, lod); keys.add(key);
            if (!this.retained.has(key)) this.library.retain(key);
            if (this.pending.has(key) || this.library.ready(id) && this.library.cache.has(key) || !this.library.canRequest(id, lod) || !this.library.canRequestProxy(id)) continue;
            const request = this.library.load(id, lod, 0).then(() => { if (!this.disposed) return this.library.loadProxy(id); }).then(() => { if (!this.disposed) this.failures.delete(id); }).catch(() => { if (!this.disposed) this.failures.add(id); }).finally(() => this.pending.delete(key));
            this.pending.set(key, request);
        }
        for (const key of this.retained) if (!keys.has(key)) this.library.release(key);
        this.retained = keys;
    }
    async prepare(sim: FlightSimulation, onProgress?: (ready: number, total: number) => void) {
        this.update(sim, true);
        const total = this.retained.size; let done = total - this.pending.size;
        onProgress?.(done, total);
        await Promise.all([...this.pending.values()].map(request => request.then(() => onProgress?.(++done, total))));
        const missing = [...this.retained].filter(key => { const split = key.lastIndexOf(':'); return !this.library.ready(key.slice(0, split)) || !this.library.cache.has(key); });
        if (this.disposed) throw new Error('Flight preparation cancelled');
        if (missing.length) throw new Error('비행 환경 다운로드 실패 · ' + missing.length + ' · 다시 시도해 주세요');
    }
    dispose() {
        this.disposed = true;
        for (const key of this.retained) this.library.release(key);
        this.retained.clear(); this.proxyIds.clear(); this.failures.clear();
    }
}
