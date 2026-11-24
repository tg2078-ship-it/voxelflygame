import { catalog, proxies } from './fixtures';
import { PATTERNS, buildEncounter } from '../../app/airrun/patterns';
import { obstacleContact } from '../../app/airrun/collision';
import type { Obstacle } from '../../app/airrun/types';
const errors: {pattern:string; segment:number; model:string; role:string; t:number}[] = [];
for (const p of PATTERNS) {
    const e = buildEncounter(p, 0, 13, { byId: catalog }, 11, 1);
    const obs: Obstacle[] = e.placements.filter(p => p.collision).map((p, i) => ({ id: i, model: p.model, position: { x: p.x, y: p.y, z: p.z }, scale: { x: p.sx, y: p.sy, z: p.sz }, yaw: p.yaw, size: { x: catalog.get(p.model)!.bounds.size[0] * p.sx, y: catalog.get(p.model)!.bounds.size[1] * p.sy, z: catalog.get(p.model)!.bounds.size[2] * p.sz }, small: !!p.small, role: p.role, hit: false, scored: false }));
    const knots = [{ x: 0, y: 24, z: 0 }, ...e.route.flatMap(r => [{ x: r.x, y: r.y, z: r.z - 60 }, { x: r.x, y: r.y, z: r.z + 60 }])];
    for (let j = 1; j < knots.length; j++) {
        const from = knots[j - 1], to = knots[j];
        for (const o of obs) {
            const hit = obstacleContact(o, catalog.get(o.model)!, proxies.get(o.model), from, to, { x: 3.74, y: 1.05, z: 2 });
            if (hit)
                errors.push({ pattern: p.id, segment: j, model: o.model, role: o.role, t: hit.t });
        }
    }
}
console.log(JSON.stringify({ failures: errors.length, examples: errors.slice(0, 24), models: Object.fromEntries([...new Set(errors.map(e => e.model))].map(model => [model, errors.filter(e => e.model === model).length])) }, null, 2));
import assert from 'node:assert/strict';
assert.equal(errors.length, 0, 'Every authored reference route must clear the model collision volumes.');
