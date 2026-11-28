/** A deliberate braking turn through a real gate primes a single exit burst.
 * Charge uses actual lateral travel so holding the stick against a wall fails. */
export class BankExit {
    private travel = 0;
    private side = 0;
    private readyUntil = 0;
    private burstUntil = 0;
    private lastTurn = -Infinity;
    exits = 0;

    steer(time: number, dx: number, stick: number, braking: boolean) {
        if (braking) this.burstUntil = 0;
        const side = Math.sign(stick);
        if (!braking || Math.abs(stick) < .32 || side * dx <= 0) {
            if (!braking || time - this.lastTurn > .20) this.travel = 0;
            return;
        }
        if (this.side !== side) this.travel = 0;
        this.side = side;
        this.lastTurn = time;
        this.travel += Math.abs(dx);
    }
    cross(time: number) {
        if (this.travel < 2.2 || time - this.lastTurn > .20 || time < this.burstUntil || time < this.readyUntil) return false;
        this.travel = 0;
        this.readyUntil = time + 1.6;
        return true;
    }
    release(time: number, throttle: number) {
        if (time >= this.readyUntil || throttle < 1) return false;
        this.readyUntil = 0;
        this.burstUntil = time + 1.35;
        this.exits++;
        return true;
    }
    ready(time: number) { return time < this.readyUntil; }
    active(time: number) { return time < this.burstUntil; }
    reset() { this.readyUntil = this.burstUntil = this.travel = 0; }
}
