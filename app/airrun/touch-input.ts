import { input } from './state';

/** Pointer ownership lives in the touch surface; simulation input lives here. */
export function setTouchSpeed(kind: 'boost' | 'brake', down: boolean, control: 'hold' | 'gear') {
    const wasDown = input[kind];
    input[kind] = down;
    if (!down || wasDown || control !== 'gear') return;
    // The second of simultaneous opposing inputs cancels a queued gear step.
    input.pendingGear = input[kind === 'boost' ? 'brake' : 'boost']
        ? 0
        : (input.pendingGear ?? 0) + (kind === 'boost' ? 1 : -1);
}
