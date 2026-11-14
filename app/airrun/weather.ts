import { smooth, mix, hash } from './data';
import type { Weather, WeatherKind, ThemeId, PracticeConfig } from './types';
const targets: Record<WeatherKind, {
    cloud: number;
    rain: number;
    fog: number;
    wind: number;
}> = { clear: { cloud: .12, rain: 0, fog: .04, wind: .1 }, cloudy: { cloud: .82, rain: 0, fog: .16, wind: .28 }, rain: { cloud: .92, rain: .68, fog: .26, wind: .45 }, storm: { cloud: 1, rain: 1, fog: .38, wind: .8 }, fog: { cloud: .62, rain: 0, fog: .72, wind: .12 } };
export function nightAt(t: number) {
    const c = t % 180;
    if (c < 10)
        return t < 180 ? 0 : 1 - smooth((c + 10) / 20);
    if (c < 110)
        return 0;
    if (c < 130)
        return smooth((c - 110) / 20);
    if (c < 170)
        return 1;
    return 1 - smooth((c - 170) / 20);
}
export function lightAt(t: number) {
    const cycle = ((t % 180) + 180) % 180;
    const dawn = cycle < 28 ? 1 - smooth(cycle / 28) : cycle > 168 ? smooth((cycle - 168) / 12) : 0;
    const sunset = smooth((cycle - 92) / 18) * (1 - smooth((cycle - 122) / 18));
    const night = nightAt(t);
    return { night, dawn, warm: Math.max(dawn, sunset), phase: dawn > .2 ? 'dawn' : sunset > .2 ? 'sunset' : night > .5 ? 'night' : 'day' } as const;
}
export class WeatherController {
    wet = 0;
    cycleSeed = -1;
    cycleIndex = 0;
    cycleStart = 180;
    lastKind: WeatherKind = 'clear';
    log: {
        t: number;
        kind: WeatherKind;
    }[] = [];
    get(t: number, dt: number, theme: ThemeId, seed: number, practice: PracticeConfig | null): Weather {
        let a: WeatherKind = 'clear', b: WeatherKind = 'clear', blend = 0;
        if (practice) {
            a = b = practice.weather;
        }
        else if (t < 180) {
            if (t < 20)
                a = b = 'clear';
            else if (t < 35) {
                a = 'clear';
                b = 'cloudy';
                blend = smooth((t - 20) / 15);
            }
            else if (t < 55)
                a = b = 'cloudy';
            else if (t < 70) {
                a = 'cloudy';
                b = 'rain';
                blend = smooth((t - 55) / 15);
            }
            else if (t < 100)
                a = b = 'rain';
            else if (t < 115) {
                a = 'rain';
                b = 'cloudy';
                blend = smooth((t - 100) / 15);
            }
            else if (t < 145)
                a = b = 'cloudy';
            else if (t < 165) {
                a = 'cloudy';
                b = 'clear';
                blend = smooth((t - 145) / 20);
            }
            else
                a = b = 'clear';
        }
        else {
            const cycle: WeatherKind[] = ['clear', 'cloudy', 'rain', 'storm', 'rain', 'fog', 'cloudy'];
            if (seed !== this.cycleSeed || t < this.cycleStart) {
                this.cycleSeed = seed;
                this.cycleIndex = 0;
                this.cycleStart = 180;
            }
            for (;;) {
                const index = this.cycleIndex, hold = 40 + hash(seed + index * 887) * 45, transition = 12 + hash(seed + index * 1397) * 13, remain = t - this.cycleStart;
                if (remain < hold + transition) {
                    a = cycle[index % cycle.length];
                    b = cycle[(index + 1) % cycle.length];
                    blend = remain < hold ? 0 : smooth((remain - hold) / transition);
                    break;
                }
                this.cycleStart += hold + transition;
                this.cycleIndex++;
            }
        }
        const A = targets[a], B = targets[b], kind = blend > .55 ? b : a;
        const rain = mix(A.rain, B.rain, blend);
        this.wet = rain > 0 ? Math.min(1, this.wet + rain * dt * .13) : Math.max(0, this.wet - dt / 45);
        if (kind !== this.lastKind) {
            this.log.push({ t, kind });
            this.log = this.log.slice(-64);
            this.lastKind = kind;
        }
        const storm = kind === 'storm';
        const lightning = storm && Math.sin(t * 1.9 + seed) > .993 ? Math.pow(Math.max(0, Math.sin(t * 1.9 + seed)), 50) : 0;
        return { kind, cloud: mix(A.cloud, B.cloud, blend), rain, fog: mix(A.fog, B.fog, blend), wind: mix(A.wind, B.wind, blend), wet: this.wet, night: practice ? +practice.night : nightAt(t), lightning, snow: theme === 'ice' || theme === 'aurora' };
    }
}
