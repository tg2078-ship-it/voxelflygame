export const RUSH_DURATION = 5;
export interface RushHUD { charge: number; remaining: number; ready: boolean; uses: number }
export interface RushResult { uses: number; distance: number }
/** Skill earns a finite burst. This never grants collision immunity or score. */
export class RushDrive {
    private charge = 25;
    private remaining = 0;
    private uses = 0;
    private distance = 0;
    private seen = new Set<string>();
    credit(source: string, amount: number): boolean {
        if (!source || this.seen.has(source) || !Number.isFinite(amount) || amount <= 0 || amount > 100) return false;
        this.seen.add(source);
        if (this.seen.size > 512) this.seen.delete(this.seen.values().next().value!);
        if (this.remaining > 0) return false;
        const before = this.charge;
        this.charge = Math.min(100, this.charge + amount);
        return before < 100 && this.charge === 100;
    }
    activate(): boolean {
        if (this.charge < 100 || this.remaining > 0) return false;
        this.charge = 0; this.remaining = RUSH_DURATION; this.uses++;
        return true;
    }
    advance(dt: number, distance: number, hyper: boolean) {
        if (!Number.isFinite(dt) || dt <= 0 || dt > .25 || !Number.isFinite(distance) || distance < 0) return;
        if (hyper) { this.remaining = 0; return; }
        if (this.remaining <= 0) return;
        this.distance += distance * Math.min(1, this.remaining / dt);
        this.remaining = Math.max(0, this.remaining - dt);
    }
    damage() { this.remaining = 0; this.charge = Math.max(0, this.charge - 30); }
    hud(): RushHUD { return { charge: Math.floor(this.charge), remaining: this.remaining, ready: this.charge >= 100 && !this.remaining, uses: this.uses }; }
    result(): RushResult { return { uses: this.uses, distance: Math.floor(this.distance) }; }
}
