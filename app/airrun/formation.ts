import { clamp, hash, mix, smooth } from './data';
import type { Difficulty } from './encounter-director';
import type { Vec } from './types';

const ENVELOPE_WIDTH = { relaxed: 12, rookie: 9.5, standard: 8.7, expert: 7.5 } as const;
export const SIGNAL_SECONDS = [4, 8, 12] as const;
export const SIGNAL_POINTS = [240, 600, 1100] as const;
export const FLIGHT_PATTERNS = ['trail', 'weave', 'swell'] as const;
export type FormationPattern = typeof FLIGHT_PATTERNS[number];
export interface FormationLog {
    contacts: number;
    transmissions: [number, number, number];
    points: number;
}
export interface FormationHUD {
    pattern: FormationPattern;
    signal: number;
    secondsLeft: number;
    aligned: boolean;
    offer: number;
}
type RadioEvent = 'contact' | 'lock' | 'sent' | 'ace' | 'lost';
export interface FormationEvent { radio: RadioEvent; points: number }

export function validFormation(value: unknown, manualSeconds: number): value is FormationLog {
    if (!value || typeof value !== 'object') return false;
    const log = value as FormationLog;
    const count = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n < 1e9;
    if (!count(log.contacts) || !count(log.points) || !Array.isArray(log.transmissions) ||
        log.transmissions.length !== 3 || !log.transmissions.every(count)) return false;
    const lockSeconds = log.transmissions.reduce((sum, count, i) => sum + count * SIGNAL_SECONDS[i], 0);
    const minimumTime = log.contacts ? 3 + 22 * (log.contacts - 1) + lockSeconds : 0;
    return minimumTime <= manualSeconds + .001 &&
        log.transmissions.reduce((a, b) => a + b, 0) <= log.contacts &&
        log.transmissions.reduce((total, n, i) => total + n * SIGNAL_POINTS[i], 0) === log.points;
}

/** Formation envelopes follow the same passage centres the generator checked.
 * Between passages the two later patterns arc sideways or climb. All deviations
 * taper to zero before the aircraft enters the protected opening. */
export class FormationFlight {
    private route: Vec[] = [{ x: 0, y: 24, z: 0 }];
    private cooldown = 3;
    private remaining = 0;
    private signal = 0;
    private aligned = false;
    private tier = 0;
    private contacts = 0;
    private transmissions: [number, number, number] = [0, 0, 0];
    pattern: FormationPattern = 'trail';
    constructor(private seed: number, private difficulty: Difficulty) {}
    get approachIn() { return !this.active && this.cooldown > 0 && this.cooldown <= 3 ? this.cooldown : undefined; }
    get joinSide() { return (this.seed + this.contacts) % 2 ? -1 : 1; }
    get active() { return this.remaining > 0; }
    addRoute(points: Vec[]) {
        for (const point of points) {
            if (point.z > this.route[this.route.length - 1].z) this.route.push(point);
        }
    }
    sample(z: number, output: Vec) {
        let i = 1;
        while (i < this.route.length && this.route[i].z < z) i++;
        const a = this.route[i - 1], b = this.route[i] ?? a;
        const span = b.z - a.z, hold = Math.min(60, span * .24);
        const t = smooth(clamp((z - a.z - hold) / Math.max(1, span - 2 * hold), 0, 1));
        const arc = Math.sin(Math.PI * t) ** 2;
        output.x = mix(a.x, b.x, t);
        output.y = mix(a.y, b.y, t);
        if (this.pattern === 'weave') output.x += 4 * arc * Math.sin((a.z + this.seed % 997) * .027);
        if (this.pattern === 'swell') output.y += 3 * arc;
        output.z = z;
        return output;
    }
    private target = { x: 0, y: 24, z: 0 };
    private close() {
        this.remaining = 0;
        this.cooldown = 22 + 12 * hash(this.seed % 65536 + this.contacts * 157);
        this.aligned = false;
    }
    interrupt() {
        if (this.active) this.close();
    }
    private transmit(): FormationEvent {
        const points = SIGNAL_POINTS[this.tier - 1];
        this.transmissions[this.tier - 1]++;
        this.close();
        return { radio: this.tier === 3 ? 'ace' : 'sent', points };
    }
    advance(dt: number, pilot: Vec, hyper: boolean, send: boolean): FormationEvent | undefined {
        while (this.route.length > 2 && this.route[1].z < pilot.z - 50) this.route.shift();
        if (!Number.isFinite(dt) || dt <= 0 || dt > .25) return;
        if (hyper) { this.interrupt(); return; }
        if (!this.active) {
            this.cooldown -= dt;
            if (this.cooldown > 1e-8) return;
            this.pattern = this.contacts === 0 ? 'trail' : FLIGHT_PATTERNS[(this.contacts + (this.seed >>> 0) % 2) % 3];
            this.contacts++;
            this.remaining = 20;
            this.tier = 0;
            this.signal = 0;
            this.aligned = false;
            return { radio: 'contact', points: 0 };
        }
        if (send && this.tier > 0) return this.transmit();
        const target = this.sample(pilot.z, this.target);
        const width = ENVELOPE_WIDTH[this.difficulty] - this.tier * 1.2;
        this.aligned = ((pilot.x - target.x) / width) ** 2 + ((pilot.y - target.y) / (width * .75)) ** 2 <= 1;
        this.signal += this.aligned ? Math.min(dt, this.remaining) : 0;
        this.remaining -= dt;
        if (this.signal + 1e-7 >= SIGNAL_SECONDS[this.tier]) {
            this.tier++;
            if (this.tier === 3) return this.transmit();
            if (this.remaining > 1e-7) return { radio: 'lock', points: 0 };
        }
        if (this.remaining <= 1e-7) {
            this.close();
            return { radio: 'lost', points: 0 };
        }
    }
    hud(): FormationHUD | undefined {
        if (!this.active) return;
        return { pattern: this.pattern, signal: this.signal, secondsLeft: Math.ceil(this.remaining),
            aligned: this.aligned, offer: this.tier > 0 ? SIGNAL_POINTS[this.tier - 1] : 0 };
    }
    result(): FormationLog {
        const points = this.transmissions.reduce((total, n, i) => total + n * SIGNAL_POINTS[i], 0);
        return { contacts: this.contacts, transmissions: [...this.transmissions], points };
    }
}
