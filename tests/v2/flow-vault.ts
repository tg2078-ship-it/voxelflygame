import assert from 'node:assert/strict';
import { FLOW_VAULT_LIMIT, FlowVault, type VaultBankReason, type VaultLossReason, type VaultSnapshot } from '../../app/airrun/flow-vault';

let checks = 0;
const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
const equal = (actual: unknown, expected: unknown, label: string) => { assert.deepEqual(actual, expected, label); checks++; };
const zero = { pending: 0, secured: 0, lost: 0, banks: 0, peak: 0 };
const vault = new FlowVault();
equal(vault.snapshot(), zero, 'A new run has no money or bank count');
check(vault.deposit(75) && vault.deposit(125), 'Valid flow extras enter the reserve');
equal(vault.snapshot(), { pending: 200, secured: 0, lost: 0, banks: 0, peak: 200 }, 'Deposits do not pay actual score prematurely');
equal(vault.bank('manual'), 200, 'Manual banking returns the exact score payout');
equal(vault.bank('manual'), 0, 'Holding or repeating the bank action cannot pay twice');
equal(vault.snapshot(), { pending: 0, secured: 200, lost: 0, banks: 1, peak: 200 }, 'Only a nonempty manual bank counts');
vault.deposit(30);
equal(vault.lose('damage'), 30, 'Damage loses only the live reserve');
equal(vault.lose('crash'), 0, 'A subsequent crash cannot lose secured money or double-count loss');
equal(vault.snapshot(), { pending: 0, secured: 200, lost: 30, banks: 1, peak: 200 }, 'Secured awards survive future damage');
vault.deposit(250);
const live = vault.snapshot();
equal(vault.projection(false), live, 'A normal checkpoint leaves the reserve at risk');
const finished = { pending: 0, secured: 450, lost: 30, banks: 1, peak: 250 };
equal(vault.projection(true), finished, 'A safe-end preview includes the reserve once');
for (let i = 0; i < 50; i++) equal(vault.projection(true), finished, 'Repeated checkpoint previews cannot compound the score');
equal(vault.snapshot(), live, 'Settlement previews do not mutate the actual ledger');
const detached = vault.snapshot(); detached.pending = 9000; detached.secured = 9000;
equal(vault.snapshot(), live, 'Editing a returned snapshot cannot edit the run');
const detachedProjection = vault.projection(true); detachedProjection.banks++;
equal(vault.snapshot(), live, 'Editing a returned projection cannot count a manual bank');
equal(vault.bank('finish'), 250, 'The eventual safe end pays the pending score once');
equal(vault.snapshot(), finished, 'Finish never pretends a manual decision occurred');
vault.deposit(50);
equal(vault.bank('hyper'), 50, 'A caller-authorized Hyper boundary returns the exact reserve');
equal(vault.snapshot().banks, 1, 'Automatic boundaries do not inflate manual decision counts');

for (const invalid of [0, -0, -1, .1, 3.75, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, FLOW_VAULT_LIMIT + 1, '10', null, undefined, {}, true]) {
    const before = vault.snapshot();
    check(!vault.deposit(invalid as number), 'Malformed or out-of-budget award is rejected');
    equal(vault.snapshot(), before, 'An invalid award cannot change any balance or peak');
}
for (const reason of ['', 'damage', 'timeout', 'crash', 'MANUAL', null, undefined]) {
    const before = vault.snapshot();
    equal(vault.bank(reason as VaultBankReason), 0, 'Unknown bank reason cannot pay');
    equal(vault.snapshot(), before, 'Unknown bank reason has no effect');
}
for (const reason of ['', 'manual', 'finish', 'hyper', 'DAMAGE', null, undefined]) {
    const before = vault.snapshot();
    equal(vault.lose(reason as VaultLossReason), 0, 'Unknown loss reason cannot lose score');
    equal(vault.snapshot(), before, 'Unknown loss reason has no effect');
}

const capped = new FlowVault();
check(capped.deposit(FLOW_VAULT_LIMIT - 1), 'A valid large run remains exact');
check(!capped.deposit(2), 'An overflowing award is rejected in full');
check(capped.deposit(1), 'The final point of budget remains usable');
equal(capped.bank('manual'), FLOW_VAULT_LIMIT, 'A maximum reserve pays exactly');
check(!capped.deposit(1), 'Banking does not reset the lifetime accounting budget');
equal(capped.snapshot(), { pending: 0, secured: FLOW_VAULT_LIMIT, lost: 0, banks: 1, peak: FLOW_VAULT_LIMIT }, 'All fields remain bounded at the integer limit');
const lostCap = new FlowVault();
lostCap.deposit(FLOW_VAULT_LIMIT - 10); lostCap.lose('timeout');
lostCap.deposit(10); lostCap.bank('finish');
check(!lostCap.deposit(1), 'Losing and redepositing cannot overflow lifetime counters');
equal(lostCap.snapshot().secured + lostCap.snapshot().lost, FLOW_VAULT_LIMIT, 'Loss and payout conserve the accepted total at the boundary');

// Independent state-machine model: arbitrary orderings of skill deposits,
// checkpoints, player decisions, crashes and recovery boundaries must conserve
// every accepted point. A replay of the same event stream must match exactly.
for (let seed = 1; seed <= 64; seed++) {
    let random = seed >>> 0;
    const next = () => { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; return random; };
    const a = new FlowVault(), replay = new FlowVault();
    const model: VaultSnapshot = { ...zero };
    let accepted = 0, payouts = 0, losses = 0;
    for (let step = 0; step < 600; step++) {
        const event = next() % 12;
        if (event < 5) {
            const points = next() % 501 + 1;
            check(a.deposit(points) && replay.deposit(points), 'Seeded valid awards are accepted');
            model.pending += points; accepted += points; model.peak = Math.max(model.peak, model.pending);
        } else if (event < 8) {
            const reason = (['manual', 'finish', 'hyper'] as const)[event - 5];
            equal(a.bank(reason), model.pending, 'Arbitrary bank returns only the current reserve');
            equal(replay.bank(reason), model.pending, 'Seeded replay returns the same exact bank payout');
            payouts += model.pending; model.secured += model.pending;
            if (reason === 'manual' && model.pending > 0) model.banks++;
            model.pending = 0;
        } else if (event < 11) {
            const reason = (['damage', 'timeout', 'crash'] as const)[event - 8];
            equal(a.lose(reason), model.pending, 'Arbitrary failure loses only the current reserve');
            equal(replay.lose(reason), model.pending, 'Replay loss is deterministic');
            losses += model.pending; model.lost += model.pending; model.pending = 0;
        } else {
            const before = a.snapshot(), expected = { ...model, pending: 0, secured: model.secured + model.pending };
            equal(a.projection(true), expected, 'Arbitrary checkpoint projects safe settlement correctly');
            equal(a.snapshot(), before, 'Checkpoint cannot bank, discard or duplicate live flow');
        }
        equal(a.snapshot(), model, 'Implementation matches the independent event ledger');
        equal(replay.snapshot(), model, 'Same seed and decisions reproduce the run exactly');
        equal(model.pending + model.secured + model.lost, accepted, 'Pending, secured and lost points equal all accepted skill points');
        equal(model.secured, payouts, 'Actual payouts equal secured points only');
        equal(model.lost, losses, 'Reported losses equal discarded reserve only');
        check(Object.values(model).every(value => Number.isSafeInteger(value) && value >= 0 && value <= FLOW_VAULT_LIMIT), 'Every telemetry value remains a bounded safe integer');
    }
}
console.log(JSON.stringify({ flowVaultChecks: checks, modelSeeds: 64, modelEvents: 38400, scoreConserved: true, gpuVerified: false, status: 'passed' }));
