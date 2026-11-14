/** A run-local ledger for the extra points earned by a manual flow chain.
 * Base passage scores, precision rewards and operation rewards never enter it.
 */
export const FLOW_VAULT_LIMIT = 1_000_000_000;
export type VaultBankReason = 'manual' | 'finish' | 'hyper';
export type VaultLossReason = 'damage' | 'timeout' | 'crash';
export interface VaultSnapshot {
    pending: number;
    secured: number;
    lost: number;
    banks: number;
    peak: number;
}
export type VaultHUD = VaultSnapshot;
export type VaultDebrief = VaultSnapshot;

/** The caller owns event deduplication and the actual score payout.
 * A successful bank returns the points to pay exactly once. Snapshots and
 * settlement projections cannot mutate this ledger or pay any points.
 */
export class FlowVault {
    private pending = 0;
    private secured = 0;
    private lost = 0;
    private banks = 0;
    private peak = 0;

    /** Reject a corrupt award or overflow in full; never silently truncate it.
     * The lifetime accepted-points limit keeps every transition exact and all
     * counters bounded, including after many bank/loss cycles.
     */
    deposit(points: number): boolean {
        if (!Number.isSafeInteger(points) || points <= 0
            || points > FLOW_VAULT_LIMIT - this.pending - this.secured - this.lost) return false;
        this.pending += points;
        this.peak = Math.max(this.peak, this.pending);
        return true;
    }

    bank(reason: VaultBankReason): number {
        if (reason !== 'manual' && reason !== 'finish' && reason !== 'hyper') return 0;
        const payout = this.pending;
        if (payout === 0) return 0;
        this.pending = 0;
        this.secured += payout;
        if (reason === 'manual') this.banks++;
        return payout;
    }

    lose(reason: VaultLossReason): number {
        if (reason !== 'damage' && reason !== 'timeout' && reason !== 'crash') return 0;
        const amount = this.pending;
        this.pending = 0;
        this.lost += amount;
        return amount;
    }

    snapshot(): VaultSnapshot {
        return { pending: this.pending, secured: this.secured, lost: this.lost, banks: this.banks, peak: this.peak };
    }

    /** Preview a safe end without changing live state. In particular, repeated
     * checkpoints must not secure a live chain or increment the manual banks.
     */
    projection(settle: boolean): VaultSnapshot {
        const result = this.snapshot();
        if (settle === true) {
            result.secured += result.pending;
            result.pending = 0;
        }
        return result;
    }
}
