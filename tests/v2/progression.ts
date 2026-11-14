import assert from 'node:assert/strict';
import { freshSave, emptyMetrics, AIRCRAFT } from '../../app/airrun/data';
import { QUESTS, CAREER, ACHIEVEMENTS, metricValue, questProgress, ensureQuests, applyRun, upgradeEvents } from '../../app/airrun/progression';
import type { Metrics, RunResult, Quest } from '../../app/airrun/types';
const save = ensureQuests(freshSave());
save.owned = AIRCRAFT.map(p => p.id);
save.levels = Object.fromEntries(save.owned.map(id => [id, 2]));
save.upgraded = { skyhawk: true };
let checks = 0;
const baseMetrics = { ...emptyMetrics() };
for (const [key, v] of Object.entries(baseMetrics))
    if (typeof v === 'number')
        (baseMetrics as unknown as Record<string, unknown>)[key] = 100000;
baseMetrics.damage = 0;
baseMetrics.minorHits = 0;
baseMetrics.themes = ['coast', 'village', 'city', 'korea:0', 'korea:1', 'aurora', 'volcano'];
baseMetrics.landmarks = ['real:seoul_tower'];
baseMetrics.effects = ['shield', 'turbo', 'repair'];
baseMetrics.weathers = ['clear', 'rain', 'cloudy'];
baseMetrics.weatherCoins = { clear: 20, rain: 20 };
function run(id: string, patch: Partial<Metrics> = {}, planeId = 'skyhawk', eUsed = false): RunResult { const metrics = { ...structuredClone(baseMetrics), ...patch }; return { id, date: '2026-10-11T00:00:00Z', planeId, distance: metrics.distance, bonus: metrics.bonus, score: metrics.distance + metrics.bonus, coins: metrics.coins, reward: Math.floor(metrics.distance / 30) + Math.floor(metrics.bonus / 180) + metrics.coins, maxCombo: metrics.maxCombo, eUsed, practice: false, interrupted: false, reason: 'test', metrics }; }
for (const spec of QUESTS) {
    const quest: Quest = { id: spec.id, uid: 'Q-test', progress: 0, detail: {}, acceptedAt: 0 };
    const plane = spec.id === 'P07' ? 'extra' : spec.id === 'P08' ? 'falcon' : 'skyhawk';
    const patch = spec.id === 'H04' ? { minorHits: 1, damage: 20 } : {};
    const result = run('quest-' + spec.id, patch, plane, spec.id === 'H06');
    let progress = questProgress(quest, result, save).progress;
    if (spec.id === 'P02') {
        const first = questProgress(quest, result, save);
        progress = questProgress({ ...quest, ...first }, run('beaver', {}, 'beaver'), save).progress;
    }
    if (spec.id === 'P01') {
        const first = questProgress(quest, result, save);
        progress = questProgress({ ...quest, ...first }, run('second-valid'), save).progress;
    }
    if (spec.id === 'P03') {
        const withUpgrade = upgradeEvents({ ...save, quests: [structuredClone(quest)] });
        progress = withUpgrade.quests[0].progress;
    }
    assert.equal(progress, spec.target, spec.id + ' real condition can complete');
    checks++;
    const absent = run('absent-' + spec.id, emptyMetrics(), plane, spec.id === 'H06');
    absent.distance = absent.score = absent.reward = 0;
    const zero = questProgress(quest, absent, save);
    assert.equal(zero.progress, 0, spec.id + ' absent events do not progress');
    checks++;
}
let career = ensureQuests(freshSave());
for (let i = 0; i < CAREER.length; i++) {
    career.career = i;
    career.careerProgress = 0;
    career.careerDetail = {};
    const progressed = applyRun(career, run('career-' + i));
    assert.equal(progressed.careerProgress, CAREER[i].target, 'career ' + i + ' exact condition');
    assert.equal(progressed.career, i, 'claim required before next mission');
    checks += 2;
    career = progressed;
}
assert.equal(ACHIEVEMENTS.reduce((s, a) => s + a.reward, 0), 18000);
assert.equal(CAREER.reduce((s, c) => s + c.reward, 0), 7250);
checks += 2;
const lowThenHit = run('hit-before-repair', { minorHits: 1, damage: 20, repair: 0, recoveryDistance: 0 });
assert.equal(metricValue('recover', lowThenHit, save, {}), 0, 'a collision alone is not recovery');
assert.equal(metricValue('recover', run('lightning', { minorHits: 0, damage: 35, repair: 35, recoveryDistance: 500 }), save, {}), 0, 'lightning is not a minor obstacle collision');
checks += 2;
console.log(JSON.stringify({ progressionChecks: checks, questConditions: 64, careerConditions: 20, status: 'passed' }));
