import type { TrickPathResult } from './trick-path';
import type { TrickPlanRequest, TrickWorkerReply } from './trick-protocol';
export class TrickPlanner {
    worker: Worker | null = null;
    reject: ((error: Error) => void) | null = null;
    timer: ReturnType<typeof setTimeout> | undefined;
    plan(request: TrickPlanRequest): Promise<TrickPathResult> {
        this.cancel();
        return new Promise((resolve, reject) => {
            this.reject = reject;
            try {
                const worker = new Worker(new URL('./trick-worker.ts', import.meta.url), { type: 'module', name: 'airrun-flight-safety' }); this.worker = worker;
                worker.onmessage = (event: MessageEvent<TrickWorkerReply>) => { if (this.worker !== worker) return; const reply = event.data; this.finish(); if (reply.path) resolve(reply.path); else reject(new Error(reply.error || 'Invalid flight plan')); };
                worker.onerror = () => { this.finish(); reject(new Error('Flight planning unavailable')); };
                worker.onmessageerror = () => { this.finish(); reject(new Error('Invalid flight-plan message')); };
                this.timer = setTimeout(() => { this.finish(); reject(new Error('Flight planning timed out')); }, 30000);
                worker.postMessage(request);
            }
            catch (error) { this.finish(); reject(error instanceof Error ? error : new Error(String(error))); }
        });
    }
    finish() { clearTimeout(this.timer); this.timer = undefined; this.worker?.terminate(); this.worker = null; this.reject = null; }
    cancel() { const reject = this.reject; this.finish(); reject?.(new Error('Flight planning cancelled')); }
}
