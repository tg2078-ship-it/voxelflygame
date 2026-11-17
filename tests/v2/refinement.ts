import assert from 'node:assert/strict';
import { THEMES, COURSE_EDITION } from '../../app/airrun/data';
import { proceduralPattern } from '../../app/airrun/encounter-director';
import { buildEncounter } from '../../app/airrun/patterns';
import { populateThemeCollection } from '../../app/airrun/model-collection';
import { obstacleContact } from '../../app/airrun/collision';
import { personalRival } from '../../app/airrun/mastery';
import type { Obstacle } from '../../app/airrun/types';
import { catalog, proxies, createSim } from './fixtures';
let checks = 0;
const summary: Record<string, { placements: number; shoulders: number; maxHeight: number }> = {};
for (const theme of THEMES) for (const seed of [13, 42, 731]) {
    const p = proceduralPattern(theme.id, 0, seed, 2, 8000);
    const e = buildEncounter(p, 1000, seed, { byId: catalog }, 11, 3, { x: 0, y: 24 });
    const shoulders = e.placements.filter(p => p.role === 'route shoulder');
    populateThemeCollection(e, catalog, seed, new Set(), 11);
    assert(shoulders.every(p => e.placements.includes(p)), 'Collection decor must not delete route-defining structures'); checks++;
    const knots = [{ x: 0, y: 24, z: e.start }, ...e.route.flatMap(r => [{ ...r, z: r.z - 60 }, { ...r, z: r.z + 60 }])];
    for (const [i, p] of e.placements.entries()) if (p.collision) {
        const meta = catalog.get(p.model)!;
        const o: Obstacle = { id: i, model: p.model, position: { x: p.x, y: p.y, z: p.z }, scale: { x: p.sx, y: p.sy, z: p.sz }, size: { x: meta.bounds.size[0]*p.sx, y: meta.bounds.size[1]*p.sy, z: meta.bounds.size[2]*p.sz }, yaw: p.yaw, role:p.role, small: !!p.small, hit: false, scored: false };
        if (p.role === 'route shoulder') for (const point of e.route) {
            assert(!obstacleContact(o, meta, proxies.get(p.model), { x:point.dangerX, y:point.dangerY, z:point.z-10 }, { x:point.dangerX, y:point.dangerY, z:point.z+10 }, { x:3.74, y:1.05, z:2 }), `${theme.id}: new structure blocks the gold reward`); checks++;
        }
        for (let k = 1; k < knots.length; k++) { assert(!obstacleContact(o, meta, proxies.get(p.model), knots[k-1], knots[k], { x:3.74, y:1.05, z:2 }), `${theme.id}/${seed}/${p.model} blocks the route`); checks++; }
    }
    const previous = summary[theme.id] ?? { placements: 0, shoulders: 0, maxHeight: 0 };
    summary[theme.id] = { placements: previous.placements + e.placements.length, shoulders: previous.shoulders + shoulders.length, maxHeight: Math.max(previous.maxHeight, ...shoulders.map(p => catalog.get(p.model)!.bounds.size[1] * p.sy)) };
}
for (const theme of ['coast', 'village', 'city']) { assert(summary[theme].shoulders >= 3 && summary[theme].maxHeight >= 30, `${theme} needs substantial flight-level structures`); checks++; }
const run = createSim({ mode: 'sortie' }).result();
assert.equal(run.courseEdition, COURSE_EDITION); checks++;
const identity = { seed:42, plane:'skyhawk', level:1, difficulty:'standard', contractId:'precision' } as const;
const completed = { ...run, sortie: { ...run.sortie!, completed:true }, replay: { version:1 as const, samples: [[0,0,24,0,0] as [number,number,number,number,number]] } };
assert.equal(personalRival([completed], identity), completed); checks++;
assert.equal(personalRival([{ ...completed, courseEdition: undefined }], identity), undefined); checks++;
console.log(JSON.stringify({ checks, themes: summary, status:'passed' }));
