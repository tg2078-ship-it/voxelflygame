import { assetUrl } from './asset-url';
import type { Settings } from './types';
import type { FlightSimulation } from './simulation';
export class GameAudio {
    private failures = new Set<string>();
    constructor(private readonly onFailure?: (files: string[]) => void) {}
    private missing(name: string) {
        if (this.disposed || this.failures.has(name)) return;
        this.failures.add(name);
        this.onFailure?.([...this.failures]);
    }
    context: AudioContext | null = null;
    master: GainNode | null = null;
    music: GainNode | null = null;
    sfx: GainNode | null = null;
    buffers = new Map<string, AudioBuffer>();
    layers = new Map<string, {
        source: AudioBufferSourceNode;
        gain: GainNode;
    }>();
    ready = false;
    started = false;
    disposed = false;
    lastCoin = 0;
    streams = new Map<string, {
        element: HTMLAudioElement;
        source: MediaElementAudioSourceNode;
        gain: GainNode;
    }>();
    async unlock() {
        if (this.disposed)
            return;
        if (!this.context) {
            const Constructor = window.AudioContext ?? (window as Window & {
                webkitAudioContext?: typeof AudioContext;
            }).webkitAudioContext;
            if (!Constructor)
                return;
            this.context = new Constructor();
            const c = this.context!;
            this.master = c.createGain();
            this.music = c.createGain();
            this.sfx = c.createGain();
            const compressor = c.createDynamicsCompressor();
            compressor.threshold.value = -14;
            compressor.ratio.value = 3;
            this.music.connect(this.master);
            this.sfx.connect(this.master);
            this.master.connect(compressor);
            compressor.connect(c.destination);
            this.music.gain.value = 0;
            this.sfx.gain.value = 0;
            for (const name of ['horizon', 'velocity']) {
                const element = new Audio(assetUrl('/audio/' + name + '.mp3'));
                element.addEventListener('error', () => this.missing(name), { once: true });
                element.loop = true;
                element.preload = 'auto';
                const source = c.createMediaElementSource(element), gain = c.createGain();
                gain.gain.value = 0;
                source.connect(gain);
                gain.connect(this.music);
                this.streams.set(name, { element, source, gain });
                void element.play().catch(() => { });
            }
            void this.load();
        }
        try {
            await this.context?.resume();
        }
        catch { /* A muted audio context must not prevent flight. */ }
        for (const stream of this.streams.values())
            if (stream.element.paused)
                void stream.element.play().catch(() => { });
    }
    async load() {
        const c = this.context;
        if (!c)
            return;
        await Promise.all(['rain', 'wind', 'propeller', 'jet', 'waves', 'city', 'forest'].map(async (name) => {
            try {
                const r = await fetch(assetUrl('/audio/' + name + '.mp3'));
                if (!r.ok) throw new Error(String(r.status));
                this.buffers.set(name, await c.decodeAudioData(await r.arrayBuffer()));
            }
            catch { this.missing(name); }
        }));
        if (!this.disposed) {
            this.ready = true;
            this.begin();
        }
    }
    begin() {
        if (this.started || !this.ready || !this.context)
            return;
        this.started = true;
        const start = this.context.currentTime + .08;
        for (const [name, buffer] of this.buffers) {
            const source = this.context.createBufferSource(), gain = this.context.createGain();
            source.buffer = buffer;
            source.loop = true;
            source.connect(gain);
            gain.connect(['horizon', 'velocity'].includes(name) ? this.music! : this.sfx!);
            gain.gain.value = 0;
            source.start(start);
            this.layers.set(name, { source, gain });
        }
    }
    update(settings: Settings, sim: FlightSimulation | null, paused: boolean) {
        if (!this.context || !this.master)
            return;
        const c = this.context, now = c.currentTime;
        const set = (g: GainNode | null | undefined, v: number) => {
            if (g)
                g.gain.setTargetAtTime(v, now, .18);
        };
        set(this.master, settings.volume);
        set(this.music, settings.music * (paused ? .25 : 1));
        set(this.sfx, settings.sfx * (paused ? .15 : 1));
        const flow = sim?.adventure.hud()?.flow.value ?? 0;
        const musicIntensity = sim ? Math.min(1, Math.max((sim.speed - 40) / 75, sim.combo / 18, flow / 100 * .85, sim.rush.hud().remaining > 0 ? 1 : 0)) : .05;
        set(this.streams.get('horizon')?.gain, sim ? .34 : .22);
        set(this.streams.get('velocity')?.gain, sim ? (musicIntensity * .3 + (sim.eRemaining > 0 ? .32 : 0)) : 0);
        set(this.layers.get('rain')?.gain, sim ? sim.weather.rain * .45 : 0);
        set(this.layers.get('wind')?.gain, sim ? Math.min(.30, sim.speed / 250 + sim.boost * .07) : .025);
        set(this.layers.get('propeller')?.gain, sim && !sim.plane.jet ? .16 + sim.boost * .055 : 0);
        set(this.layers.get('jet')?.gain, sim?.plane.jet ? .19 + (sim?.boost ?? 0) * .08 : 0);
        set(this.layers.get('waves')?.gain, sim && ['coast', 'river', 'waterfall'].includes(sim.theme) ? .12 : 0);
        set(this.layers.get('city')?.gain, sim && (sim.theme === 'city' || sim.theme === 'korea' && sim.variant === 0) ? .09 : 0);
        set(this.layers.get('forest')?.gain, sim && ['forest', 'village', 'farm'].includes(sim.theme) ? .09 : 0);
        for (const name of ['propeller', 'jet']) {
            const layer = this.layers.get(name);
            if (layer)
                layer.source.playbackRate.setTargetAtTime(sim ? Math.min(2, Math.max(.6, sim.speed / 60)) : .7, now, .15);
        }
    }
    event(kind: string) {
        const c = this.context;
        if (!c || !this.sfx || c.state !== 'running')
            return;
        const now = c.currentTime;
        if (kind === 'coin' && now - this.lastCoin < .065)
            return;
        if (kind === 'coin')
            this.lastCoin = now;
        const pitches: Record<string, number[]> = {
            'record-pass': [523, 659, 784, 1046], 'formation-contact': [440, 554, 740], 'formation-lock': [740, 988],
            'formation-sent': [554, 740, 988, 1109], 'formation-ace': [554, 740, 880, 1109, 1480],
            'formation-lost': [554, 415], 'rush-ready': [659, 988, 1318], rush: [196, 392, 784, 1568], coin: [1046, 1568], crystal: [1318, 1975], ring: [784, 1175, 1568], repair: [523, 659, 784], shield: [440, 880], risk: [330, 660], theme: [523, 784, 1046], discover: [659, 880, 1318], 'sortie-complete': [392, 523, 659, 784, 1046, 1318, 1568], 'sortie-stage': [523, 784, 1046], choice: [784, 1175, 1568], 'operation-complete': [392, 587, 784, 988, 1175, 1568], precision: [1175, 1568, 2349], 'flow-bank': [659, 988, 1318, 1975], 'e-start': [110, 220, 440, 880], 'e-end': [880, 659, 523], damage: [80, 51], crash: [47, 32], pass: [587], ui: [740, 988], approval: [523, 659, 784, 1046], reward: [523, 659, 784, 1046, 1318, 1568], upgrade: [392, 523, 659, 784, 1046], notice: [] };
        const notes = pitches[kind] ?? [];
        for (let i = 0; i < notes.length; i++) {
            const o = c.createOscillator(), g = c.createGain();
            o.type = ['crash', 'damage'].includes(kind) ? 'sawtooth' : kind === 'e-start' ? 'triangle' : 'sine';
            const start = now + i * .055, duration = kind === 'e-start' ? .7 : kind === 'crash' ? .8 : .23;
            o.frequency.setValueAtTime(notes[i], start);
            o.frequency.exponentialRampToValueAtTime(notes[i] * (kind === 'crash' ? .25 : 1.003), start + duration);
            g.gain.setValueAtTime(0, start);
            g.gain.linearRampToValueAtTime(.12 / Math.max(1, notes.length * .5), start + .01);
            g.gain.exponentialRampToValueAtTime(.0001, start + duration);
            o.connect(g);
            g.connect(this.sfx);
            o.start(start);
            o.stop(start + duration + .02);
        }
        if (['crash', 'damage', 'e-start', 'shield'].includes(kind)) {
            const size = c.sampleRate * .45, buffer = c.createBuffer(1, size, c.sampleRate), a = buffer.getChannelData(0);
            for (let i = 0; i < a.length; i++)
                a[i] = (Math.random() * 2 - 1) * Math.exp(-i / a.length * 5);
            const source = c.createBufferSource(), filter = c.createBiquadFilter(), g = c.createGain();
            source.buffer = buffer;
            filter.type = 'lowpass';
            filter.frequency.value = kind === 'crash' ? 1400 : 4500;
            g.gain.value = .16;
            source.connect(filter);
            filter.connect(g);
            g.connect(this.sfx);
            source.start(now);
        }
    }
    dispose() {
        this.disposed = true;
        for (const stream of this.streams.values()) {
            stream.element.pause();
            stream.element.removeAttribute('src');
            stream.element.load();
            stream.source.disconnect();
            stream.gain.disconnect();
        }
        this.streams.clear();
        for (const l of this.layers.values())
            l.source.stop();
        this.layers.clear();
        void this.context?.close();
    }
}
