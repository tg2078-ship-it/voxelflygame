/** Keep every Edition12 model, motion and distant LOD inside the hosting limit.
 * The canonical public/ tree and the user's original source are never changed.
 */
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd(), source = path.join(root, 'public/models'), output = path.join(root, 'dist/client/models');
const catalog = JSON.parse(fs.readFileSync(path.join(source, 'catalog.json'), 'utf8'));
const budget = 235 * 1024 * 1024;
const local = (base, url) => {
    const file = path.resolve(base, url.replace(/^\/models\//, ''));
    if (!file.startsWith(base + path.sep)) throw Error('Invalid model path');
    return file;
};
const files = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
const source0 = new Set(catalog.assets.map(a => local(output, a.exports.lod0)));
const baseBytes = files(output).reduce((sum, file) => sum + (source0.has(file) ? 0 : fs.statSync(file === path.join(output, 'catalog.json') ? path.join(source, 'catalog.json') : file).size), 0);
const kept = new Set(), costs = new Map(catalog.assets.map(a => [a.id, fs.statSync(local(source, a.exports.lod0)).size]));
let bytes = baseBytes;
const add = a => { const size = costs.get(a.id); if (kept.has(a.id)) return true; if (bytes + size > budget) return false; kept.add(a.id); bytes += size; return true; };
for (const a of catalog.assets) if (a.category === 'aircraft' || JSON.stringify(a.animationsByLod.lod0) !== JSON.stringify(a.animationsByLod.lod1)) {
    if (!add(a)) throw Error('Required aircraft or complete motion inventory exceeds the model budget');
}
const heroes = ['cliffside_castle', 'lighthouse', 'windmill', 'seoul_tower', 'korean_palace_throne_hall', 'art_deco_rail_station', 'city_clock_civic_square', 'blue_ice_cathedral', 'waterfall_cliff', 'red_barn', 'canyon_bridge', 'large_dam', 'coastal_bridge', 'airport_control_tower', 'airport_windsock_gimbal', 'airport_flipdot_arrivals', 'air_race_motorized_finish_gate', 'fortress_wall_gate'];
for (const id of heroes) { const a = catalog.assets.find(a => a.id === id); if (a) add(a); }
const candidates = [...catalog.assets].sort((a, b) => {
    const rank = a => a.category === 'korean_landmarks' ? 0 : a.moving ? 1 : 2;
    return rank(a) - rank(b) || costs.get(a.id) - costs.get(b.id) || a.id.localeCompare(b.id);
});
for (const a of candidates) add(a);
const originalClips = catalog.assets.reduce((sum, a) => sum + a.animationsByLod.lod0.length, 0);
for (const a of catalog.assets) {
    a.sourceLods = { lod0: kept.has(a.id) ? 0 : 1, lod1: 1, lod2: 2, lod3: 3 };
    const old = local(output, a.exports.lod0);
    if (kept.has(a.id)) {
        if (!fs.existsSync(old)) fs.copyFileSync(local(source, a.exports.lod0), old);
    } else {
        fs.rmSync(old, { force: true });
        a.exports.lod0 = a.exports.lod1;
        for (const key of ['geometry', 'renderCosts', 'lodBounds', 'textureHashesByLod', 'animationsByLod']) a[key].lod0 = structuredClone(a[key].lod1);
        a.bounds = structuredClone(a.lodBounds.lod1);
    }
}
if (catalog.assets.reduce((sum, a) => sum + a.animationsByLod.lod0.length, 0) !== originalClips) throw Error('A native motion was removed');
const categories = {};
for (const a of catalog.assets) { const c = categories[a.category] ??= { models: 0, sourceLod0: 0 }; c.models++; if (kept.has(a.id)) c.sourceLod0++; }
const report = {
    profile: 'edition12-sites-256MiB', models: catalog.assets.length,
    highestNativeDetailModels: kept.size, nativeLod1NearModels: catalog.assets.length - kept.size,
    highestNativeDetailAircraft: catalog.assets.filter(a => a.category === 'aircraft' && kept.has(a.id)).length,
    movingModels: catalog.assets.filter(a => a.animationsByLod.lod0.length).length,
    clips: originalClips, allDistantLodsPreserved: true, allCollisionModelsPreserved: true,
    canonicalSourceLod0FilesPreserved: true, modelBudgetBytes: budget,
    categories, nativeLod0Ids: [...kept].sort(), nativeLod1Ids: catalog.assets.filter(a => !kept.has(a.id)).map(a => a.id).sort(), gpuVerified: false,
};
catalog.delivery = { ...report, nativeLod0Ids: undefined, nativeLod1Ids: undefined };
fs.writeFileSync(path.join(output, 'catalog.json'), JSON.stringify(catalog));
for (const a of catalog.assets) for (const url of [...Object.values(a.exports), a.proxy]) if (!fs.existsSync(local(output, url))) throw Error('Missing deployed model file: ' + url);
report.actualModelBytes = files(output).reduce((sum, file) => sum + fs.statSync(file).size, 0);
if (report.actualModelBytes > budget + 1024 * 1024) throw Error('Model delivery exceeds its reserved budget');
fs.writeFileSync(path.join(root, 'docs/validation/edition12-delivery.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, nativeLod0Ids: undefined, nativeLod1Ids: undefined }));
