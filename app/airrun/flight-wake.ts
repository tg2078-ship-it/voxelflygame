import * as T from 'three';
export interface WakeSample { left: T.Vector3; right: T.Vector3; z: number; time: number }
/** Fixed-time emission keeps a three-second wing trail at 30, 60 and 144 Hz. */
export class FlightWake {
    samples: WakeSample[] = [];
    previous: WakeSample | null = null;
    next = 0;
    update(left: T.Vector3, right: T.Vector3, z: number, time: number, emitting: boolean) {
        const current = { left, right, z, time };
        if (!this.previous || time < this.previous.time) { this.previous = current; this.next = time; }
        if (!emitting) this.next = time;
        else {
            const previous = this.previous;
            this.next = Math.max(this.next, time - .16);
            while (this.next <= time + 1e-8) {
                const alpha = T.MathUtils.clamp((this.next - previous.time) / Math.max(1e-8, time - previous.time), 0, 1);
                this.samples.unshift({ left: previous.left.clone().lerp(left, alpha), right: previous.right.clone().lerp(right, alpha), z: T.MathUtils.lerp(previous.z, z, alpha), time: this.next });
                this.next += 1 / 60;
            }
        }
        this.samples = this.samples.filter(sample => time - sample.time < 3).slice(0, 180);
        this.previous = { left: left.clone(), right: right.clone(), z, time };
        return this.samples;
    }
}
