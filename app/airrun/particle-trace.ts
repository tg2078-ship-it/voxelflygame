import type { Vec } from './types';

export interface PlumeSample extends Vec { born: number; life: number }

/** Fixed-time emission along the displayed path, independent of presentation FPS.
 * Samples keep their world position; only their age changes after leaving the engine. */
export class ParticleTrace {
    samples: PlumeSample[] = [];
    private previous: { source: Vec; time: number; emitting: boolean } | null = null;
    private next = 0;
    constructor(private interval: number, private duration: number, private capacity: number) {}
    update(source: Vec, time: number, emitting: boolean) {
        if (this.previous && time < this.previous.time) { this.previous = null; this.samples = []; }
        const previous = this.previous;
        if (!previous || !previous.emitting || !emitting) this.next = time;
        if (emitting) {
            // A stalled frame cannot enqueue expired particles or unbounded work.
            this.next = Math.max(this.next, time - Math.min(this.duration, this.interval * this.capacity));
            while (this.next <= time + 1e-8) {
                const alpha = previous ? Math.min(1, Math.max(0, (this.next - previous.time) / Math.max(1e-8, time - previous.time))) : 1;
                const from = previous?.source ?? source;
                this.samples.unshift({ x: from.x + (source.x - from.x) * alpha, y: from.y + (source.y - from.y) * alpha,
                    z: from.z + (source.z - from.z) * alpha, born: this.next, life: 1 });
                this.next += this.interval;
            }
        }
        this.samples = this.samples.filter(sample => { sample.life = Math.max(0, 1 - (time - sample.born) / this.duration); return sample.life > 1e-8; }).slice(0, this.capacity);
        this.previous = { source: { ...source }, time, emitting };
        return this.samples;
    }
}
