import * as T from 'three';
import { buildTerrainBuffers, type TerrainReply, type TerrainRequest } from './terrain-protocol';
type Job = { request: TerrainRequest; resolve: (geometry: T.BufferGeometry) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
function geometryFrom(reply: TerrainReply) {
    if (!reply.position?.length || !reply.normal || !reply.color || reply.position.length !== reply.normal.length || reply.position.length !== reply.color.length) throw new Error(reply.error ?? 'Invalid terrain buffers');
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(reply.position, 3)); geometry.setAttribute('normal', new T.BufferAttribute(reply.normal, 3)); geometry.setAttribute('color', new T.BufferAttribute(reply.color, 3)); geometry.computeBoundingSphere();
    return geometry;
}
export class TerrainBuilder {
    worker: Worker | null = null; broken = false; disposed = false; serial = 0;
    jobs = new Map<number, Job>();
    constructor(public factory = () => new Worker(new URL('./terrain-worker.ts', import.meta.url), { type: 'module', name: 'airrun-terrain' })) {}
    build(request: Omit<TerrainRequest, 'id'>): Promise<T.BufferGeometry> {
        if (this.disposed) return Promise.reject(new Error('Terrain builder disposed'));
        const data = { ...request, id: ++this.serial };
        if (!this.worker && !this.broken) {
            try {
                this.worker = this.factory();
                this.worker.onmessage = (event: MessageEvent<TerrainReply>) => {
                    const job = this.jobs.get(event.data.id); if (!job) return;
                    try { const geometry = geometryFrom(event.data); clearTimeout(job.timer); this.jobs.delete(event.data.id); job.resolve(geometry); }
                    catch { this.fallback(); }
                };
                this.worker.onerror = this.worker.onmessageerror = () => this.fallback();
            }
            catch { this.broken = true; }
        }
        if (!this.worker) return Promise.resolve(geometryFrom(buildTerrainBuffers(data)));
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => this.fallback(), 8000); this.jobs.set(data.id, { request: data, resolve, reject, timer });
            try { this.worker!.postMessage(data); } catch { this.fallback(); }
        });
    }
    fallback() {
        this.broken = true; this.worker?.terminate(); this.worker = null;
        for (const job of this.jobs.values()) {
            clearTimeout(job.timer);
            try { job.resolve(geometryFrom(buildTerrainBuffers(job.request))); } catch (error) { job.reject(error instanceof Error ? error : new Error(String(error))); }
        }
        this.jobs.clear();
    }
    dispose() {
        this.disposed = true; this.worker?.terminate(); this.worker = null;
        for (const job of this.jobs.values()) { clearTimeout(job.timer); job.reject(new Error('Terrain builder disposed')); } this.jobs.clear();
    }
}
