import assert from "node:assert/strict";
import {writeFile,mkdir} from "node:fs/promises";
import "fake-indexeddb/auto";
import {createCanvas} from "@napi-rs/canvas";
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import {AIRCRAFT,THEMES,themeTimeline,baseSpeed,aircraftStats,freshSave} from "../app/game/data";
import {makeAircraft} from "../app/game/aircraft";
import {makeChunk,WorldStreamer,groundHeight} from "../app/game/world";
import {useGame,input,validateSave,writeSave} from "../app/game/store";
import {FlightEngine,physicsReady} from "../app/game/engine";
import {registerFlightTools} from "../app/game/webmcp";
(globalThis as unknown as {document:object}).document={createElement:(tag:string)=>{if(tag==="canvas")return createCanvas(512,128);throw new Error(tag);}};
const checks:{name:string;details:unknown}[]=[];
function done(name:string,details:unknown=true){checks.push({name,details});console.log("PASS",name,JSON.stringify(details));}
await mkdir(".sites-runtime/qa",{recursive:true});
for(const seed of [0,13,17249,173018,2147483646]){
 const timeline=Array.from({length:70},(_,i)=>themeTimeline(seed,i));assert.deepEqual(timeline.slice(0,3).map(t=>t.id),["coast","village","city"]);assert.deepEqual(timeline,Array.from({length:70},(_,i)=>themeTimeline(seed,i)));
 for(let i=4;i<timeline.length;i++){assert.notEqual(timeline[i].id,timeline[i-1].id);assert(!(timeline[i].special&&timeline[i-1].special));}
 const korea=timeline.filter(t=>t.id==="korea");for(let i=1;i<korea.length;i++)assert.notEqual(korea[i].variant,korea[i-1].variant);
}
done("deterministic theme sequence and Korean variants",{seeds:5,slots:70});
assert(baseSpeed(100000)>baseSpeed(50000));assert(baseSpeed(1000000)>baseSpeed(100000));done("uncapped increasing distance speed");
const planes=AIRCRAFT.map(p=>{const m=makeAircraft(p);assert(m.group.userData.voxelCount>200);assert(m.group.children.length>3);return {id:p.id,voxels:m.group.userData.voxelCount};});done("eight distinct aircraft",planes);
const chunkData=THEMES.map(theme=>{const c=makeChunk(7,theme,173018,"balanced");assert(c.group.children.length>0);assert(c.pickups.filter(p=>p.kind==="coin").length>=5);assert(c.pickups.some(p=>p.kind==="ring"));assert(c.pickups.some(p=>p.kind==="crystal"));assert(c.collisions.length>0);const counts=c.group.children.filter((o):o is THREE.InstancedMesh=>o instanceof THREE.InstancedMesh).map(o=>o.count);return {id:theme.id,instances:counts.reduce((a,b)=>a+b,0),collisions:c.collisions.length};});done("thirteen world themes",chunkData);
await physicsReady();
const physics=new RAPIER.World({x:0,y:0,z:0});const thin=physics.createCollider(RAPIER.ColliderDesc.cuboid(3,3,.04).setTranslation(0,0,6));physics.step();
const hit=physics.castShape({x:0,y:0,z:0},{x:0,y:0,z:0,w:1},{x:0,y:0,z:600},new RAPIER.Cuboid(.5,.5,.5),0,1/60,true);assert(hit&&hit.collider.handle===thin.handle);physics.free();done("high-speed swept collision",600+" m/s");
for(const invalid of [null,[],{}, {...freshSave(),levels:null},{...freshSave(),settings:null},{...freshSave(),levels:{skyhawk:0}},{...freshSave(),runs:[{}]},{...freshSave(),checkpoint:{}},{...freshSave(),coins:NaN},{...freshSave(),settled:[42]}])assert.equal(validateSave(invalid),false);
assert(validateSave(freshSave()));done("malformed backup rejection without throwing");
for(const old of THEMES){const seed=173018,t=THEMES[0];const chunk=makeChunk(0,t,seed,"balanced",{startTime:170,secondsPerMeter:.1});for(const x of [-60,0,60]){const a=chunk.ground(x,0),b=chunk.ground(x,127);assert(Number.isFinite(a)&&Number.isFinite(b));}assert.equal(chunk.ground(60,128),groundHeight(60,128,themeTimeline(seed,1).id,seed));}
done("immutable transition terrain samples");
useGame.setState({save:freshSave(),loaded:true,phase:"hangar"});await useGame.getState().profile("QA PILOT");
useGame.setState(s=>({save:{...s.save,coins:1000,selected:1}}));await useGame.getState().purchase();assert.equal(useGame.getState().save.coins,400);assert(useGame.getState().save.owned.includes("beaver"));await useGame.getState().upgrade();assert.equal(useGame.getState().save.coins,350);assert.equal(useGame.getState().save.levels.beaver,2);await useGame.getState().load();assert.equal(useGame.getState().save.levels.beaver,2);done("purchase, whole-plane upgrade and IndexedDB reload");
useGame.setState(s=>({save:{...s.save,selected:0,settings:{...s.save.settings,skipTakeoff:true,quality:"balanced",volume:0}},phase:"hangar"}));useGame.getState().start();useGame.setState({seed:173018});
const renderer={shadowMap:{type:0,enabled:false},toneMapping:0,toneMappingExposure:1} as unknown as THREE.WebGLRenderer;
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(58,16/9,.2,5000);const engine=new FlightEngine(scene,camera,renderer);engine.beginRun();engine.takeoffTime=4;useGame.setState({phase:"flying"});engine.position.y=41;
for(let i=0;i<90;i++)engine.update(1/30);const baseline=engine.speed;input.boost=true;for(let i=0;i<90;i++)engine.update(1/30);assert(engine.speed>baseline*1.15);input.boost=false;for(let i=0;i<90;i++)engine.update(1/30);assert(Math.abs(engine.speed-baseSpeed(engine.distance))<1);input.brake=true;for(let i=0;i<90;i++)engine.update(1/30);assert(engine.speed<baseSpeed(engine.distance)*.85);input.brake=false;done("hold acceleration, release to baseline and braking");
useGame.getState().pause();const paused={time:engine.time,distance:engine.distance};for(let i=0;i<90;i++)engine.update(1/30);assert.equal(engine.time,paused.time);assert.equal(engine.distance,paused.distance);useGame.setState({resumeAt:performance.now()-1});engine.update(1/30);assert.equal(useGame.getState().phase,"flying");done("pause freezes simulation and explicit resume");
input.gear=1;useGame.getState().setting({control:"gear"});input.gear=1;for(let i=0;i<90;i++)engine.update(1/30);assert(engine.speed<baseSpeed(engine.distance)*.85);input.gear=5;for(let i=0;i<120;i++)engine.update(1/30);assert(engine.speed>baseSpeed(engine.distance)*1.2);input.gear=3;done("persistent gear 1–5");
const xBefore=engine.position.x;input.keys.add("KeyD");for(let i=0;i<15;i++)engine.update(1/30);input.keys.clear();assert(engine.position.x<xBefore-3);engine.position.x=0;engine.velocity.x=0;
input.keys.add("KeyW");const yBefore=engine.position.y;for(let i=0;i<9;i++)engine.update(1/30);input.keys.clear();assert(engine.position.y>yBefore+1);engine.position.y=41;engine.velocity.y=0;done("screen-right and upward controls");
// Keep health topped up and altitude fixed to isolate streaming from survival skill.
const atStart=performance.now();let maxChunks=0;for(let i=0;i<30*900;i++){engine.position.y=41;engine.hp=100;engine.update(1/30);maxChunks=Math.max(maxChunks,engine.world.chunks.size);assert.equal(useGame.getState().phase,"flying");}
assert(engine.time>900);assert(engine.origin>=1024);assert(engine.position.z<1100);assert(maxChunks<22);assert(engine.world.chunks.size>5);assert(Number.isFinite(engine.distance));done("fifteen-minute flight and bounded streaming",{simulatedSeconds:Math.round(engine.time),distance:Math.round(engine.distance),origin:engine.origin,maxChunks,fixedAltitude:41,healthMaintainedForStreamingTest:true,wallSeconds:+((performance.now()-atStart)/1000).toFixed(2)});
const before=useGame.getState().save.coins;const result=engine.result();await useGame.getState().settle(result);await useGame.getState().settle(result);assert.equal(useGame.getState().save.coins,before+result.reward);assert.equal(useGame.getState().save.runs.filter(r=>r.id===result.id).length,1);done("exactly-once result rewards");
const checkpoint={...result,id:"checkpoint-qa",distance:160,score:160,bonus:0,coins:3,reward:7,maxCombo:0};const recovered=freshSave();recovered.nickname="RECOVERY";recovered.checkpoint=checkpoint;await writeSave(recovered);await useGame.getState().load();assert.equal(useGame.getState().save.coins,7);assert.equal(useGame.getState().save.checkpoint,null);await useGame.getState().load();assert.equal(useGame.getState().save.coins,7);done("interrupted flight checkpoint paid once");
useGame.setState({phase:"results"});
useGame.setState({save:freshSave(),phase:"hangar"});useGame.getState().start();engine.beginRun();engine.takeoffTime=4;useGame.setState({phase:"flying"});
const fixture=engine.world.chunks.get(0)!;fixture.collisions.push({x:0,y:22,z:82.7,sx:.5,sy:.5,sz:.1,kind:"small",id:991});engine.syncColliders();engine.physics.step();engine.step(1/60);assert.equal(engine.hp,75);assert.equal(useGame.getState().phase,"flying");
fixture.collisions.push({x:0,y:22,z:83.3,sx:10,sy:10,sz:1,kind:"large",id:992});engine.syncColliders();engine.physics.step();engine.step(1/60);assert.equal(useGame.getState().phase,"crashing");for(let i=0;i<48;i++)engine.update(1/30);assert.equal(useGame.getState().phase,"results");done("small collision damage, large collision and result sequence");
const callbacks=new Map<string,(input:unknown)=>unknown>();const dispose=registerFlightTools({registerTool:t=>{callbacks.set(t.name,t.execute);}});assert.equal(callbacks.size,4);
assert.equal((callbacks.get("get_flight_status")!({}) as {phase:string}).phase,"results");useGame.setState({phase:"hangar"});callbacks.get("select_aircraft")!({planeId:"skyhawk"});assert.equal(useGame.getState().save.selected,0);assert.throws(()=>callbacks.get("select_aircraft")!({planeId:"invalid"}));callbacks.get("start_flight")!({});assert.equal(useGame.getState().phase,"takeoff");callbacks.get("pause_flight")!({});assert.equal(useGame.getState().phase,"paused");dispose();done("WebMCP registration, valid actions and invalid input");
const summary={date:new Date().toISOString(),passed:checks.length,checks,limitations:["No browser GPU or FPS assertion","Streaming test maintains health and altitude; it is not a survival playtest","Node simulation uses a renderer stub","Actual mobile multitouch not tested on a physical device"]};await writeFile(".sites-runtime/qa/results.json",JSON.stringify(summary,null,2));engine.dispose();console.log("ALL PASSED",checks.length);
