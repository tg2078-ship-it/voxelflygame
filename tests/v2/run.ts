import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
// Separate processes keep storage mocks and resource loading isolated.
const suites = ['core', 'assets', 'storage', 'progression', 'audit-route', 'audit-course', 'audit-autopilot', 'streaming', 'continuous-flight', 'theme-coverage', 'render-data', 'audit-trick', 'audit-trick-stress', 'surface-audit', 'preview-cache', 'revision', 'world-revision', 'interface', 'visual-quality', 'scene-quality', 'upgrade-400', 'trick-worker', 'expedition', 'performance-revision', 'terrain-worker', 'model-worker', 'edition12', 'collision-cache', 'model-residency', 'render-controls', 'asset-reliability', 'flight-effects', 'adventure', 'daily-route', 'world-art', 'atmosphere-art', 'procedural-director', 'difficulty', 'trick-recovery', 'flow-vault', 'flow-banking', 'scoring-integrity', 'render-responsiveness', 'visual-readability', 'commercial-ui', 'sortie', 'sortie-ui', 'sortie-flight', 'route-choice', 'collision-integrity', 'mastery', 'refinement', 'ace'];
const started = performance.now();
for (const suite of suites) {
    const result = spawnSync(process.execPath, ['--import', 'tsx', `tests/v2/${suite}.${['interface', 'expedition', 'visual-quality', 'scene-quality', 'commercial-ui', 'sortie-ui', 'mastery'].includes(suite) ? 'tsx' : 'ts'}`], { encoding: 'utf8', stdio: 'pipe', timeout: suite.startsWith('audit-trick') || suite === 'assets' ? 600000 : 240000 });
    process.stdout.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    assert(!result.error, `${suite}: ${result.error?.message}`);
    assert.equal(result.status, 0, `${suite} failed`);
}
console.log(JSON.stringify({ suites: suites.length, elapsedSeconds: Math.round((performance.now() - started) / 1000), gpuVerified: false, status: 'passed' }));
