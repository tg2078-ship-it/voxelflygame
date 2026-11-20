import { mix, clamp } from './data';
import type { Phase } from './types';

export const DEPARTURE = { flightOffset: -80, runwayStart: -38, runwayEnd: -154, retirementDistance: 230, duration: 4 } as const;
export function takeoffDistance(time: number, flightSpeed: number) {
    const t = clamp(time, 0, DEPARTURE.duration);
    return flightSpeed * t * t / (2 * DEPARTURE.duration);
}
export interface FlightPose {
    x: number; y: number; z: number; pitch: number; yaw: number; roll: number;
    trickPitch: number; trickYaw: number; trickRoll: number; motionTime: number;
}
export function readFlightPose(p: FlightPose): FlightPose {
    return { x: p.x, y: p.y, z: p.z, pitch: p.pitch, yaw: p.yaw, roll: p.roll,
        trickPitch: p.trickPitch, trickYaw: p.trickYaw, trickRoll: p.trickRoll, motionTime: p.motionTime };
}
export function interpolateFlightPose(previous: FlightPose, current: FlightPose, alpha: number): FlightPose {
    const pose = { ...current }, t = clamp(alpha, 0, 1);
    for (const key of Object.keys(pose) as (keyof FlightPose)[]) {
        const delta = current[key] - previous[key];
        pose[key] = key.startsWith('trick') && current[key] === 0 && Math.abs(Math.abs(delta) - 2*Math.PI) < .05
            ? previous[key] + Math.atan2(Math.sin(delta),Math.cos(delta))*t : mix(previous[key], current[key], t);
    }
    return pose;
}
export function presentsFlight(phase: Phase, streamResume: boolean) {
    return ['flying', 'crashing', 'results'].includes(phase) || phase === 'preflight' && streamResume;
}
export function airportVisible(phase: Phase, streamResume: boolean, distance: number, pausedPhase: Phase = 'flying') {
    const flight = presentsFlight(phase, streamResume) || phase === 'paused' && pausedPhase !== 'takeoff';
    return !flight || distance < DEPARTURE.retirementDistance;
}
