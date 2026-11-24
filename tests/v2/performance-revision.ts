import { nativeFetch } from './image-runtime';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as T from 'three';
import { catalog, proxies } from './fixtures';
import { ModelLibrary } from '../../app/airrun/assets';
import { WorldView } from '../../app/airrun/world-view';
import { shouldRenderModelSurface } from '../../app/airrun/model-surface';
import { ActorBatching } from '../../app/airrun/actor-batching';
import { compatibleModelLOD, flightModelLOD, flightHorizon, GRAPHICS, requiresHeroSurface } from '../../app/airrun/graphics';
import { collisionBounds, obstacleContact } from '../../app/airrun/collision';
import { PointerOwner } from '../../app/airrun/pointer-owner';
import { PATTERNS, buildEncounter } from '../../app/airrun/patterns';
import type { Obstacle, Placement } from '../../app/airrun/types';
globalThis.fetch = async (url) => { if (/^(blob:|data:)/.test(String(url))) return nativeFetch(url); try { return new Response(await fs.readFile(path.join('public', String(url).split('?')[0]))); } catch { return new Response(null, { status: 404 }); } };
let checks = 0; const check = (value: unknown, label: string) => { assert(value, label); checks++; };
const owners = [new PointerOwner(), new PointerOwner(), new PointerOwner()];
owners.forEach((owner, i) => check(owner.claim(i + 10), 'three fingers may steer/boost/brake independently'));
check(!owners[0].release(11) && owners[0].owns(10), 'another finger cannot reset steering');
check(!owners[1].claim(99) && !owners[1].release(12), 'duplicate press/cancel cannot steal boost');
check(owners[1].release(11) && owners[0].owns(10) && owners[2].owns(12), 'releasing boost preserves steering and brake');
owners[2].reset(); check(!owners[2].owns(12) && owners[2].claim(88), 'blur permits a new touch');
for (const quality of ['balanced','high','ultra'] as const) check(flightHorizon(100000,quality)===GRAPHICS[quality].viewDistance,'unbounded speed retains a bounded render horizon');
const farFullModel = [...catalog.values()].find(meta => !!meta.exports.lod0 && compatibleModelLOD(meta,2)===0)!;
check(!requiresHeroSurface(farFullModel,{model:farFullModel.id,x:300,y:0,z:1000,sx:1,sy:1,sz:1,yaw:0,role:'scenery',collision:true},{x:0,y:24,z:0,speed:80,span:11},'high'),'a silhouette fallback does not make distant geometry a contact emergency');
const boat = catalog.get('rescue_tug')!;
check(compatibleModelLOD(boat, 2) !== 2, 'narrow source boat LOD cannot replace hero hull');
let upgraded = 0;
for (const meta of catalog.values()) for (const preferred of [1, 2] as const) {
    const lod = compatibleModelLOD(meta, preferred), bounds = meta.lodBounds?.[('lod' + lod) as 'lod0'|'lod1'|'lod2'];
    if (lod < preferred) upgraded++;
    if (bounds && lod !== 0) check(Math.abs(bounds.min[1] - meta.bounds.min[1]) <= .35 && [0, 1, 2].every(axis => Math.max(Math.abs(bounds.min[axis] - meta.bounds.min[axis]), Math.abs(bounds.max[axis] - meta.bounds.max[axis])) <= Math.max(.6, meta.bounds.size[axis] * .12)), 'chosen LOD keeps source ground and silhouette: ' + meta.id);
}
const meta = catalog.get('pine_cluster')!, p: Placement = { model: meta.id, x: 300, y: 0, z: 20, sx: 1, sy: 1, sz: 1, yaw: 0, role: 'landscape', collision: false };
check(flightModelLOD(meta, p, { x: 0, y: 24, z: 0, speed: 80, span: 11 }, 'high') !== 0, 'lateral distance keeps small landscape out of hero detail');
check(flightModelLOD(meta, { ...p, x: 2000 }, { x: 0, y: 24, z: 0, speed: 80, span: 11 }, 'high') === compatibleModelLOD(meta, meta.exports.lod3 ? 3 : 2), 'far lateral landscape retains a bounded LOD');
const o: Obstacle = { id: 1, model: boat.id, position: { x: 0, y: 0, z: 100 }, scale: { x: 1, y: 1, z: 1 }, yaw: 0, size: {x:1,y:1,z:1}, role:'test', small:false,hit:false,scored:false };
const before = collisionBounds(o, boat, proxies.get(boat.id));
o.position.x = 25; const moved = collisionBounds(o, boat, proxies.get(boat.id));
check(Math.abs(moved.min.x - before.min.x - 25) < 1e-6, 'broad collision cache follows translation');
o.yaw = Math.PI / 2; const rotated = collisionBounds(o, boat, proxies.get(boat.id));
const freshRotation = collisionBounds({ ...o, position: { ...o.position }, scale: { ...o.scale } }, boat, proxies.get(boat.id));
check(rotated !== moved && JSON.stringify(rotated) === JSON.stringify(freshRotation), 'broad collision cache follows rotation even for symmetric motion envelopes');
o.scale.x = 2; check(collisionBounds(o, boat, proxies.get(boat.id)) !== rotated, 'collision cache follows scale');
const variety: Record<string, number> = {};
for (const theme of ['coast','village','city','ice','desert','forest','farm','korea'] as const) {
    const ids = new Set<string>(), pool = PATTERNS.filter(p => p.theme === theme && p.variant === 0);
    for (let serial = 1; serial <= 24; serial++) {
        const encounter = buildEncounter(pool[(serial - 1) % pool.length], (serial - 1) * 750, 44171, { byId: catalog }, 11, serial);
        for (const placed of encounter.placements.filter(p => p.course)) {
            ids.add(placed.model);
            if (placed.passage) check(placed.sx <= 2.7, 'portals retain bounded source scale');
        }
        let structuralIndex = 0;
        for (const route of encounter.route) {
            const action = route.role === 'orientation' ? 'orientation' : pool[(serial - 1) % pool.length].steps[structuralIndex++][0];
            check(!['wall','cross'].includes(action) || !encounter.placements.some(p => p.passage && p.role === action), 'walls and crossings do not reuse arches');
            const start = { x:route.x,y:route.y,z:route.z-35 }, end = {...start,z:route.z+35};
            for (const placed of encounter.placements.filter(p=>p.course && p.collision)) {
                const obstacle: Obstacle = { ...o, model:placed.model,position:{x:placed.x,y:placed.y,z:placed.z},scale:{x:placed.sx,y:placed.sy,z:placed.sz},yaw:placed.yaw,animationPhase:placed.animationPhase };
                check(!obstacleContact(obstacle, catalog.get(placed.model)!, proxies.get(placed.model), start, end, {x:3.74,y:1.05,z:2}), 'actual source solids clear revised course centre: ' + placed.model);
            }
        }
    }
    variety[theme] = ids.size; check(ids.size >= 6, 'theme has distinct source course models');
}
const library = new ModelLibrary(); library.byId = catalog;
let vertices = 0, maxPositionError = 0, maxNormalError = 0; const actorCosts = [];
for (const id of ['airport_flipdot_arrivals','forest_log_loader','snowcat','bucket_wheel_excavator','polar_tracked_science_rover']) for (const lod of [0,1,2] as const) {
    if (!catalog.has(id)) continue;
    const instance = await library.instance(id, lod), batching = new ActorBatching(instance.model);
    const saved = batching.batches.reduce((n, b) => n + b.sources.length - 1, 0);
    check(saved > 0 || catalog.get(id)!.edition === 12 && (catalog.get(id)!.renderCosts?.[('lod' + lod) as 'lod0']?.draws ?? Infinity) <= 12, 'source parts share draws or already use Edition12 bone batching: ' + id);
    for (const time of [0,.43,2.1,7.7]) {
        instance.mixer.setTime(time); batching.sync(); instance.root.updateMatrixWorld(true);
        for (const {mesh,sources} of batching.batches) for (const [index,source] of sources.entries()) {
            if (source.visible) continue; // Sheared poses deliberately retain their native renderer.
            const local = new T.Matrix4(); mesh.getMatrixAt(index,local); const batchWorld = new T.Matrix4().multiplyMatrices(mesh.matrixWorld,local);
            const sourceNormal = new T.Matrix3().getNormalMatrix(source.matrixWorld), batchNormal = new T.Matrix3().getNormalMatrix(mesh.matrixWorld);
            const basis = new T.Matrix3().setFromMatrix4(local), e = local.elements;
            const scaleSquared = new T.Vector3(e[0]**2+e[1]**2+e[2]**2,e[4]**2+e[5]**2+e[6]**2,e[8]**2+e[9]**2+e[10]**2);
            const positions = source.geometry.getAttribute('position'), normals = source.geometry.getAttribute('normal');
            for (let vertex=0;vertex<positions.count;vertex++) {
                const point = new T.Vector3().fromBufferAttribute(positions,vertex);
                maxPositionError = Math.max(maxPositionError,point.clone().applyMatrix4(source.matrixWorld).distanceTo(point.clone().applyMatrix4(batchWorld)));
                if (normals) { const normal = new T.Vector3().fromBufferAttribute(normals,vertex); maxNormalError = Math.max(maxNormalError, normal.clone().applyNormalMatrix(sourceNormal).distanceTo(normal.clone().divide(scaleSquared).applyMatrix3(basis).applyNormalMatrix(batchNormal))); }
                vertices++;
            }
        }
    }
    actorCosts.push({id,lod,savedDraws:saved}); batching.dispose(); instance.dispose(); library.trim(4);
}
check(maxPositionError < 1e-5 && maxNormalError < 1e-5, 'native vertex positions and normals survive animated batching');
check([...library.references.values()].every(n=>n===0), 'actor batches release their source references');
await library.load('lighthouse', 0);
const cloning = library.instance('lighthouse', 0); library.trim(0);
check(library.cache.has('lighthouse:0'), 'in-flight clone protects source textures across the await boundary');
const cloneA = await cloning, cloneB = await library.instance('lighthouse', 0);
cloneA.dispose(); cloneA.dispose();
check(library.references.get('lighthouse:0') === 1, 'disposing twice cannot release another live actor');
cloneB.dispose(); library.trim(0); check(library.cache.size === 0, 'last live actor releases the protected source');
const world = new WorldView(new T.Scene(), library); let staticVertices = 0, maxStaticError = 0, partialPasses = 0;
for (const id of ['coastal_fishing_hamlet','pine_cluster','weathered_coastal_arch','large_dam']) {
    const lod=compatibleModelLOD(catalog.get(id)!,2), source=await library.load(id,lod);
    let compiled: ReturnType<WorldView['compile']> = null;
    for(let pass=0;pass<1000&&!compiled;pass++) { world.compileDeadline=performance.now()+.05; compiled=world.compile(id,lod); if(!compiled) partialPasses++; }
    check(compiled,'incremental source compile reaches completion');
    const offsets = new Map<T.Material,number>();
    source.scene.updateMatrixWorld(true);
    source.scene.traverse(node=>{
        if(!(node instanceof T.Mesh)||(node as T.SkinnedMesh).isSkinnedMesh||!shouldRenderModelSurface(node)) return;
        const materials=Array.isArray(node.material)?node.material:[node.material];
        materials.forEach((material,slot)=>{
            if(materials.length>1&&!node.geometry.groups.some((group: {materialIndex?:number})=>group.materialIndex===slot)) return;
            const geometry=compiled!.find(part=>part.material===material)!.geometry, points=node.geometry.getAttribute('position'), output=geometry.getAttribute('position'), offset=offsets.get(material)??0;
            const expected=new T.Vector3(),actual=new T.Vector3();
            for(let vertex=0;vertex<points.count;vertex++) { expected.fromBufferAttribute(points,vertex).applyMatrix4(node.matrixWorld);actual.fromBufferAttribute(output,offset+vertex);maxStaticError=Math.max(maxStaticError,expected.distanceTo(actual));staticVertices++; }
            offsets.set(material,offset+points.count);
        });
    });
}
check(partialPasses>0 && maxStaticError<1e-4,'incremental quantized/interleaved compile preserves source positions');
world.dispose(); check([...library.references.values()].every(n=>n===0),'partial/complete geometry work releases every source lease');library.dispose();
console.log(JSON.stringify({ performanceRevisionChecks:checks, silhouetteFallbacks:upgraded, courseModelVariety:variety, animatedVertexComparisons:vertices,staticVertexComparisons:staticVertices,maxStaticError,partialCompilePasses:partialPasses,maxPositionError,maxNormalError,actorCosts,gpuVerified:false,fpsMeasured:false,status:'passed' }));
