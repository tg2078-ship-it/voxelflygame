import { COURSE_EDITION } from './data';
import type { Difficulty } from './encounter-director';
import { validReplay, type FlightReplay } from './mastery';
import type { FlightMode, Input, Settings } from './types';

export interface FlightTrace {
    edition: number;
    mode: FlightMode;
    seed: number;
    plane: string;
    level: number;
    difficulty: Difficulty;
    control: Settings['control'];
    sensitivity: number;
    score: number;
    distance: number;
    seconds: number;
    frames: number;
    inputStream: string;
    replay: FlightReplay;
}
type FlightIdentity = Pick<FlightTrace, 'mode' | 'seed' | 'plane' | 'level' | 'difficulty'> & { edition?: number };
const MAX_BYTES = 64 * 1024;
const SPAN_BYTES = 5;
const FLAGS = { boost: 1, brake: 2, rush: 4, dodge: 8, transmit: 16, bank: 32 };
const packAxis = (value: number) => Math.round(Math.max(-1, Math.min(1, value)) * 127) + 127;
const unpackAxis = (byte: number) => (byte - 127) / 127;

export class InputRecorder {
    private bytes: number[] = [];
    private last = -1;
    private repeat = 0;
    frames = 0;
    complete = true;

    record(input: Input) {
        const x = packAxis(input.x), y = packAxis(input.y);
        // The original pilot and the replay fly using precisely the same inputs.
        input.x = unpackAxis(x);
        input.y = unpackAxis(y);
        if (!this.complete) return;
        const flags = (input.boost ? FLAGS.boost : 0) | (input.brake ? FLAGS.brake : 0)
            | (input.rush ? FLAGS.rush : 0) | (input.dodge ? FLAGS.dodge : 0)
            | (input.transmit ? FLAGS.transmit : 0) | (input.bank ? FLAGS.bank : 0);
        const word = x | (y << 8) | ((input.gear - 1) << 16) | (flags << 19);
        if (word === this.last && this.repeat < 255) {
            this.bytes[this.bytes.length - 1] = ++this.repeat;
        } else {
            if (this.bytes.length + SPAN_BYTES > MAX_BYTES) {
                this.complete = false;
                return;
            }
            this.bytes.push(word & 255, (word >>> 8) & 255, (word >>> 16) & 255, word >>> 24, 1);
            this.last = word;
            this.repeat = 1;
        }
        this.frames++;
    }

    encode() {
        let raw = '';
        for (let i = 0; i < this.bytes.length; i += 4096) {
            raw += String.fromCharCode(...this.bytes.slice(i, i + 4096));
        }
        return btoa(raw);
    }
}

function* spans(stream: string) {
    if (stream.length > Math.ceil(MAX_BYTES / 3) * 4) throw Error('Input stream exceeds storage limit');
    const raw = atob(stream);
    if (!raw.length || raw.length % SPAN_BYTES || raw.length > MAX_BYTES) throw Error('Invalid stream length');
    for (let i = 0; i < raw.length; i += SPAN_BYTES) {
        const x = raw.charCodeAt(i), y = raw.charCodeAt(i + 1);
        const high = raw.charCodeAt(i + 2) | (raw.charCodeAt(i + 3) << 8);
        const gear = (high & 7) + 1, flags = high >> 3, count = raw.charCodeAt(i + 4);
        if (x > 254 || y > 254 || gear > 5 || flags > 63 || !count) throw Error('Invalid input span');
        yield { x: unpackAxis(x), y: unpackAxis(y), gear, flags, count };
    }
}
export function* readControls(stream: string): Generator<Input> {
    for (const { x, y, gear, flags, count } of spans(stream)) {
        const input = {
            x, y, gear, boost: !!(flags & FLAGS.boost), brake: !!(flags & FLAGS.brake),
            rush: !!(flags & FLAGS.rush), dodge: !!(flags & FLAGS.dodge),
            transmit: !!(flags & FLAGS.transmit), bank: !!(flags & FLAGS.bank),
        };
        for (let i = 0; i < count; i++) yield { ...input };
    }
}

export function validTrace(value: unknown): value is FlightTrace {
    if (!value || typeof value !== 'object') return false;
    const t = value as FlightTrace;
    if ((t.edition !== 8 && t.edition !== COURSE_EDITION) || !['endless', 'sortie', 'daily'].includes(t.mode)
        || !Number.isInteger(t.seed) || t.seed < 0 || t.seed > 0xffffffff || typeof t.plane !== 'string'
        || !Number.isInteger(t.level) || t.level < 1 || t.level > 20
        || !['relaxed', 'rookie', 'standard', 'expert'].includes(t.difficulty)
        || !['hold', 'gear'].includes(t.control) || !Number.isFinite(t.sensitivity) || t.sensitivity < .5 || t.sensitivity > 1.5
        || !Number.isSafeInteger(t.score) || t.score < 0 || !Number.isSafeInteger(t.distance) || t.distance < 0
        || !Number.isFinite(t.seconds) || t.seconds < 0 || !Number.isSafeInteger(t.frames)
        || Math.abs(t.frames / 60 - t.seconds) > .04 || typeof t.inputStream !== 'string'
        || !validReplay(t.replay, t.seconds, t.distance)) return false;
    try {
        // Sum encoded spans without expanding a potentially very long imported recording.
        let frames = 0;
        for (const span of spans(t.inputStream)) frames += span.count;
        return frames === t.frames;
    } catch {
        return false;
    }
}

export function sameFlight(a: FlightIdentity, b: FlightIdentity) {
    return (a.edition ?? COURSE_EDITION) === (b.edition ?? COURSE_EDITION) && a.mode === b.mode && a.seed === b.seed && a.plane === b.plane
        && a.level === b.level && a.difficulty === b.difficulty;
}
