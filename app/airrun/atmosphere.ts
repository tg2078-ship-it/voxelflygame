import * as T from 'three';
import { clamp, mix } from './data';

// Linear-light values shared by sky, aerial perspective and water. The old
// almost-white horizon removed the coast's color before objects reached the fog.
export const ATMOSPHERE = {
    horizon: [.25, .53, .68], overcast: [.23, .32, .43], night: [.016, .036, .080],
    sunset: [.98, .29, .105], dawn: [1, .51, .24],
} as const;

/** Linear-light horizon used by the sky shader, distance fog and water reflection. */
export function skyHorizonColor(night: number, cloud: number, warm: number, dawn: number) {
    const color = new T.Color().setRGB(...ATMOSPHERE.horizon);
    const golden = new T.Color().setRGB(mix(ATMOSPHERE.sunset[0], ATMOSPHERE.dawn[0], dawn), mix(ATMOSPHERE.sunset[1], ATMOSPHERE.dawn[1], dawn), mix(ATMOSPHERE.sunset[2], ATMOSPHERE.dawn[2], dawn));
    color.lerp(golden, clamp(warm, 0, 1) * .84);
    color.lerp(new T.Color().setRGB(...ATMOSPHERE.overcast), clamp(cloud, 0, 1) * .48);
    return color.lerp(new T.Color().setRGB(...ATMOSPHERE.night), clamp(night, 0, 1));
}
export function sunLightColor(night: number, warm: number) {
    return new T.Color('#fff4dc').lerp(new T.Color('#ffac6c'), clamp(warm, 0, 1) * .78).lerp(new T.Color('#a9c5f4'), clamp(night, 0, 1));
}
