import { nativeFetch } from './image-runtime';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as T from 'three';
import { ModelLibrary, poseAircraft } from '../../app/airrun/assets';
import { obstacleContact, broadBox, obstacleSolids, sweepAABB, sweepSolid } from '../../app/airrun/collision';
import { rigPose } from '../../app/airrun/rig-motion';
import { ModelTexturePool } from '../../app/airrun/texture-pool';
import { requiredFlightLOD, GRAPHICS } from '../../app/airrun/graphics';
import { WorldView } from '../../app/airrun/world-view';
import { AIRCRAFT } from '../../app/airrun/data';
import { suppliedAssets, catalog, proxies, createSim } from './fixtures';
import type { Obstacle, AssetMeta } from '../../app/airrun/types';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
let checks = 0, matrices = 0, maxError = 0;
const check = (value: unknown, label: string) => { assert(value, label); checks++; };
globalThis.fetch = async (url) => { if (/^(blob:|data:)/.test(String(url))) return nativeFetch(url); try { return new Response(await fs.readFile(path.join('public', String(url).split('?')[0]))); } catch { return new Response(null, { status: 404 }); } };
check(suppliedAssets.length === 403 && suppliedAssets.every(m => m.exports.lod0), '403 Hero models');
check(suppliedAssets.filter(m => m.moving).length === 271 && suppliedAssets.reduce((n, m) => n + m.animations.length, 0) === 891, 'all native motion retained');
check(AIRCRAFT.length === 22 && AIRCRAFT.every(plane => catalog.has(plane.model)), '22 real selectable aircraft');
const library = new ModelLibrary(); library.byId = new Map(catalog); library.proxies = new Map(proxies);
for (const id of ['harbor_working_container_crane','harbor_double_bascule','village_windmill_miller','articulated_city_bus','wind_turbine','ski_resort_cable_gondola']) {
    const proxy = proxies.get(id)!, instance = await library.instance(id, 1);
    const parent = new T.Group(); parent.position.set(7, -3, -83); parent.add(instance.root);
    instance.root.position.set(16, 2, 123); instance.root.rotation.y = .43; instance.root.scale.setScalar(1.4);
    for (const time of [0,.137,1.317,7.93]) {
        instance.mixer.setTime(time); parent.updateMatrixWorld(true);
        const physics = rigPose(proxy.rig!, time), inverse = instance.root.matrixWorld.clone().invert();
        for (const name of new Set(proxy.rig!.clips.filter(clip => clip.autoplay).flatMap(clip => clip.channels.filter(channel => ['rotation','translation','scale'].includes(channel.path)).map(channel => proxy.rig!.nodes[channel.node].name)))) {
            const visual = instance.model.getObjectByName(name)!, physical = physics.get(name)!;
            check(visual && physical, 'native node exists');
            const matrix = visual.matrixWorld.clone().premultiply(inverse);
            const error = Math.max(...matrix.elements.map((v, i) => Math.abs(v - physical.matrixWorld.elements[i])));
            maxError = Math.max(maxError, error); matrices++; check(error < 2e-5, 'native render and physics agree independently of departure origin: '+id+'/'+name+' error='+error);
        }
    }
    instance.dispose();
}
const meta: AssetMeta = { id:'thin',title:'',category:'',bounds:{min:[-5,-1,-.1],max:[5,1,.1],size:[10,2,.2]},exports:{lod1:'',lod2:''},sockets:{},animations:[],moving:false,clearances:[] };
const obstacle: Obstacle = { id:1,model:'thin',position:{x:0,y:10,z:0},scale:{x:1,y:1,z:1},yaw:Math.PI/4,size:{x:10,y:2,z:.2},small:false,hit:false,scored:false,role:'' };
const proxy = {schema:1,id:'thin',static:[{c:[0,0,0],s:[10,2,.2],zone:'solid'}],dynamic:[],clearances:[],coverage:{staticVolume:1,method:'fixture'}};
const corner = {x:3,y:10,z:-3}, solid = {x:3,y:10,z:3}, radius = {x:.06,y:.06,z:.06};
check(sweepAABB(corner,corner,broadBox(obstacle,meta),radius), 'fixture reproduces AABB ghost');
check(!obstacleContact(obstacle,meta,proxy,corner,corner,radius), 'empty rotated corner is clear');
check(obstacleContact(obstacle,meta,proxy,solid,solid,radius), 'actual rotated solid collides');
for (const id of ['rocky_arch','canyon_bridge','korean_fortress_arch_gate','harbor_working_container_crane']) {
    const p = proxies.get(id)!, m = catalog.get(id)!, o = {...obstacle,model:id,yaw:.37,position:{x:6,y:3,z:180},scale:{x:1.35,y:1.35,z:1.35}};
    for (const time of [.237,4.31]) {
        const all = obstacleSolids(o,p,time);
        for (const offset of [-18,-4,0,5,19]) {
            const a={x:6+offset,y:8,z:145},b={...a,z:215},r={x:.3,y:.4,z:.3};
            const exhaustive = { ...p, meshes: p.meshes?.map(mesh => ({ ...mesh, bvh: { root: 0, nodes: [{ min: [-1e9,-1e9,-1e9], max: [1e9,1e9,1e9], indices: Array.from({length:mesh.indices.length/3},(_,i)=>i) }] } })) };
            check(!!obstacleContact(o,m,p,a,b,r,undefined,time) === !!obstacleContact(o,m,exhaustive,a,b,r,undefined,time), 'BVH query agrees with every authored collision triangle');
        }
    }
}
const plane = await library.instance('amphibious_twin_float',0);
poseAircraft(plane,0,0,0); const neutral = plane.model.getObjectByName('main_wing_aileron_left')!.quaternion.clone();
poseAircraft(plane,0,1,0,false,1);
check(neutral.angleTo(plane.model.getObjectByName('main_wing_aileron_left')!.quaternion) > .2, 'full stick reaches native aileron peak');
const gear = plane.actions.get('gear_left_retract')!;
check(gear.paused && gear.time > gear.getClip().duration*.98,'gear holds its final pose');
check(plane.materials.some(m => ((m.map?.image as {width?:number})?.width ?? 0)>0 && ((m.normalMap?.image as {width?:number})?.width ?? 0)>0),'real native PBR images decode'); plane.dispose();
for (const quality of ['balanced','high','ultra'] as const) check(requiredFlightLOD(catalog.get('blue_ice_cathedral')!,GRAPHICS[quality].heroDistance-1,1,quality)===0,'nearby full silhouette is required');
check(requiredFlightLOD(catalog.get('blue_ice_cathedral')!,GRAPHICS.balanced.heroDistance+200,1,'balanced',600)===0,'high-speed Hero promotion leads the presentation rebuild');
await library.load('wind_turbine',0);
const crowded=createSim(); crowded.encounters=[{...crowded.encounters[0],placements:Array.from({length:22},(_,i)=>({model:'wind_turbine',x:15+i*.1,y:1.5,z:18+i,sx:1,sy:1,sz:1,yaw:0,collision:true,role:'fixture'}))}];
const world=new WorldView(new T.Scene(),library);world.quality='balanced';world.rebuild(crowded,'balanced');await new Promise<void>(resolve=>setImmediate(resolve));
check(world.animated.size===22 && [...world.animated.values()].every(i=>i.lod===0),'nearby moving collisions cannot freeze under the distant actor budget');world.dispose();
const pool=new ModelTexturePool(), closed=[0,0,0];
const imported=(i:number,offset=0)=>{const texture=new T.Texture({close:()=>closed[i]++});texture.offset.x=offset;const material=new T.MeshStandardMaterial({map:texture}),scene=new T.Group();scene.add(new T.Mesh(new T.BoxGeometry(),material));return {gltf:{scene,parser:{associations:new Map([[texture,{textures:0}]])}} as unknown as GLTF,material};};
const a=imported(0),b=imported(1),c=imported(2,.25);for(const model of [a,b,c])pool.adopt(model.gltf,{'0':'verified-byte-hash'});
check(a.material.map===b.material.map && a.material.map!==c.material.map && closed[1]===1,'identical bytes share only with matching texture settings');pool.release(a.gltf);check(closed[0]===0,'live lease keeps bitmap alive');pool.dispose();check(closed.every(n=>n===1)&&pool.entries.size===0,'final lease releases images exactly once');
await library.load('weathered_coastal_arch',1);check(library.textures.entries.size>0,'native texture pool is active');library.dispose();check(library.textures.entries.size===0,'library releases every texture lease');
console.log(JSON.stringify({upgrade400Checks:checks,nativeRigMatrices:matrices,maxPoseError:maxError,gpuVerified:false,status:'passed'}));
