/** Keep the chase camera behind the entire airframe, including the new heavy transport. */
export function flightFraming(span: number, length: number) {
    const distance = Math.max(20, length * .75 + 8, span * .8 + 7);
    return { distance, height: 6.5 + Math.max(0, span - 20) * .12, orbitDistance: Math.max(11, length * .5 + 5), orbitWidth: Math.max(28, span * .95) };
}
