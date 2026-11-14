import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import {AIRCRAFT,aircraftStats,baseSpeed,GEAR_RATIOS,themeTimeline,hash,THEMES,EFFECTS,paintedAircraft,emptyMetrics,type RunResult,type Theme,type RunMetrics,type EffectKind} from "./data";
import {input,useGame,emptyHUD,resetInput} from "./store";
import {makeAircraft,type AircraftModel} from "./aircraft";
import {Atmosphere} from "./atmosphere";
import {makeHangar} from "./hangar";
import {WorldStreamer,CHUNK,type HitBox} from "./world";
import {VoxelBatch,materialBank,disposeGroup} from "./voxels";
import {flightAudio} from "./audio";
import {FlightEffects} from "./effects";
import {TRICK_SECONDS,findSafeRoute,routeClear,trickPose} from "./trick";
let ready:Promise<void>|null=null;
export function physicsReady(){if(!ready)ready=RAPIER.init();return ready;}
interface CollisionRecord {collider:RAPIER.Collider;hit:HitBox;old:THREE.Vector3;}
export class FlightEngine{
 scene:THREE.Scene;camera:THREE.PerspectiveCamera;renderer:THREE.WebGLRenderer;
 world=new WorldStreamer();atmosphere=new Atmosphere();hangar=makeHangar();model:AircraftModel;
 physics=new RAPIER.World({x:0,y:0,z:0});colliders=new Map<number,CollisionRecord>();handles=new Map<number,CollisionRecord>();playerShape=new RAPIER.Cuboid(2.15,.63,2.4);
 position=new THREE.Vector3(0,22,0);velocity=new THREE.Vector3();distance=0;time=0;speed=32;hp=100;coins=0;bonus=0;combo=0;maxCombo=0;
 takeoffTime=0;crashTime=0;accumulator=0;origin=0;pathOffset=80;lastPlane="";runId="";gearRatio=1;lastHit=-100;lastRisk=-100;checkpointTime=0;
 collected=new Set<string>();nearScored=new Set<number>();clock=0;hudTime=0;fpsSmooth=60;doorOpen=0;lastPhase="loading";
 eUsed=false;eStart=-100;eEnd=-100;eJustEnded=false;exitTarget=new THREE.Vector3();trickFX=new THREE.Group();shieldFX:THREE.Mesh;
 effects=new FlightEffects();metrics:RunMetrics=emptyMetrics();lowDistance=0;movingTime=0;hitScored=new Set<number>();
 debris=new THREE.Group();debrisV:THREE.Vector3[]=[];isDisposed=false;stormSlot=-1;lightningAt=-1;lightningPoint=new THREE.Vector3();frameDt=1/60;
 private tmp=new THREE.Vector3();private camPos=new THREE.Vector3();private camLook=new THREE.Vector3();private tempQuaternion={x:0,y:0,z:0,w:1};
 private headlight=new THREE.SpotLight("#fff0c0",0,170,.20,.65,1.2);private headlightsTarget=new THREE.Object3D();
 constructor(scene:THREE.Scene,camera:THREE.PerspectiveCamera,renderer:THREE.WebGLRenderer){
  this.scene=scene;this.camera=camera;this.renderer=renderer;const state=useGame.getState();this.model=makeAircraft(paintedAircraft(AIRCRAFT[state.save.selected],state.save.skinSelected[AIRCRAFT[state.save.selected].id]));this.lastPlane=AIRCRAFT[state.save.selected].id+":"+(state.save.skinSelected[AIRCRAFT[state.save.selected].id]??"default");
  scene.add(this.world.root,this.atmosphere.root,this.hangar.root,this.model.group,this.debris,this.headlight,this.headlightsTarget);this.headlight.target=this.headlightsTarget;
  this.world.reset(173018,state.save.settings.quality);
  for(let i=0;i<4;i++)this.world.prepare(0,0,32);
  this.camera.position.set(31,14,69);this.camera.lookAt(0,8,16);this.scene.fog=new THREE.Fog("#adc6c7",220,1350);
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.04;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.enabled=true;
  const shield=new THREE.Mesh(new THREE.IcosahedronGeometry(4.2,1),new THREE.MeshBasicMaterial({color:"#85dcf1",wireframe:true,transparent:true,opacity:.23,depthWrite:false}));shield.scale.set(1.45,.66,1.13);shield.visible=false;this.shieldFX=shield;scene.add(shield,this.trickFX);
  for(const x of [-4.6,0,4.6]){const flame=new THREE.Mesh(new THREE.ConeGeometry(x===0?.65:.18,x===0?7.5:9,6),new THREE.MeshBasicMaterial({color:x===0?"#66ceff":"#b4f5ff",transparent:true,opacity:x===0?.38:.45,depthWrite:false}));flame.rotation.x=-Math.PI/2;flame.position.set(x,.25,-6.2);this.trickFX.add(flame);}
  this.trickFX.visible=false;
  this.physics.timestep=1/60;this.syncColliders();this.physics.step();
 }
 aircraft(){const state=useGame.getState();return ["takeoff","flying","paused","crashing","results"].includes(state.phase)?AIRCRAFT.find(p=>p.id===state.runPlaneId)??AIRCRAFT[state.save.selected]:AIRCRAFT[state.save.selected];}
 stats(){const s=useGame.getState(),p=this.aircraft();return aircraftStats(p,s.save.levels[p.id]??1);}
 theme(slot=Math.floor(this.time/180)):Theme{const state=useGame.getState();return state.mode==="practice"?{...THEMES.find(t=>t.id===state.practice.theme)!,variant:state.practice.variant}:themeTimeline(state.seed,slot);}
 changeAircraft(){
  const state=useGame.getState(),p=this.aircraft(),skin=(state.phase==="hangar"?state.skinPreview:null)??state.save.skinSelected[p.id]??"default",key=p.id+":"+skin;if(key===this.lastPlane)return;
  this.scene.remove(this.model.group);disposeGroup(this.model.group);this.model=makeAircraft(paintedAircraft(p,skin));this.lastPlane=key;this.scene.add(this.model.group);
 }
 beginRun(){
  const state=useGame.getState(),stats=this.stats();
  this.changeAircraft();this.runId=state.runId;this.distance=0;this.time=0;this.speed=32*stats.speed;this.hp=stats.hp;this.coins=0;this.bonus=0;this.combo=0;this.maxCombo=0;this.origin=0;this.takeoffTime=0;this.crashTime=0;this.lastRisk=-100;this.lastHit=-100;this.checkpointTime=0;this.accumulator=0;this.gearRatio=1;this.stormSlot=-1;this.lightningAt=-1;
  disposeGroup(this.debris);this.debris.clear();this.atmosphere.warning.visible=false;
  this.position.set(0,22,this.pathOffset);this.velocity.set(0,0,0);this.collected.clear();this.nearScored.clear();this.hitScored.clear();this.effects.reset();this.eUsed=false;this.eStart=-100;this.eEnd=-100;this.eJustEnded=false;this.trickFX.visible=false;this.shieldFX.visible=false;this.metrics=emptyMetrics();this.lowDistance=0;this.movingTime=0;
  for(const r of this.colliders.values())this.physics.removeCollider(r.collider,false);this.colliders.clear();this.handles.clear();this.world.reset(state.seed,state.save.settings.quality,state.mode==="practice"?this.theme():null);
  for(let i=0;i<3;i++)this.world.prepare(0,0,this.speed,true);
  this.syncColliders();this.hangar.root.visible=true;this.model.group.visible=true;this.debris.visible=false;flightAudio.start();
 }
 syncColliders(){
  const needed=new Map<number,HitBox>();
  for(const c of this.world.chunks.values())for(const hit of c.collisions)needed.set(hit.id,hit);
  for(const [id,r] of this.colliders)if(!needed.has(id)){this.physics.removeCollider(r.collider,false);this.handles.delete(r.collider.handle);this.colliders.delete(id);}
  for(const [id,hit] of needed){
   let r=this.colliders.get(id);if(!r){const descriptor=RAPIER.ColliderDesc.cuboid(hit.sx/2,hit.sy/2,hit.sz/2).setTranslation(hit.x,hit.y,hit.z-this.origin);const collider=this.physics.createCollider(descriptor);r={collider,hit,old:new THREE.Vector3(hit.x,hit.y,hit.z)};this.colliders.set(id,r);this.handles.set(collider.handle,r);}
   else {r.hit=hit;r.collider.setTranslation({x:hit.x,y:hit.y,z:hit.z-this.origin});}
  }
 }
 get trickActive(){return this.eUsed&&this.time<this.eEnd-1e-8;}
 startTrick(){
  if(this.eUsed||useGame.getState().phase!=="flying")return false;
  this.eUsed=true;this.eStart=this.time;this.eEnd=this.time+TRICK_SECONDS;this.combo=0;this.lastRisk=-100;this.velocity.set(0,0,0);this.gearRatio=1;resetInput();input.gear=3;
  useGame.setState(s=>({eRequest:false,hud:{...s.hud,eUsed:true,eRemaining:TRICK_SECONDS}}));flightAudio.effect("trick");this.alert("무적 트릭 · 자동 비행 15초");return true;
 }
 autopilot(dt:number,ending:boolean){
  const z=this.distance+this.pathOffset;
  const safe=findSafeRoute(this.world,this.position,z,this.time,this.speed);this.exitTarget.set(safe.x,safe.y,this.position.z);
  const strength=ending?8:2.8;this.position.x=THREE.MathUtils.damp(this.position.x,safe.x,strength,dt);this.position.y=THREE.MathUtils.damp(this.position.y,safe.y,strength,dt);this.velocity.x=0;this.velocity.y=0;
  if(this.eEnd-this.time<.05&&!routeClear(this.world,this.position.x,this.position.y,z,this.time,this.speed,.8)){this.position.x=safe.x;this.position.y=safe.y;}
 }
 alert(text:string){useGame.setState(s=>({hud:{...s.hud,message:text,messageUntil:this.time+2.3}}));}
 step(dt:number){
  const state=useGame.getState(),stats=this.stats();if(state.eRequest)this.startTrick();
  const protectedStep=this.trickActive;this.time=Math.round((this.time+dt)*1e9)/1e9;
  const trick=protectedStep;
  if(protectedStep&&!this.trickActive){this.time=this.eEnd;this.eJustEnded=true;resetInput();input.gear=3;this.gearRatio=1;this.velocity.set(0,0,0);this.model.group.rotation.set(0,0,0);this.alert("무적 종료 · 조종을 이어가세요");}
  const theme=this.theme(),themeKey=theme.id==="korea"?"korea:"+(theme.variant??0):theme.id;
  const seconds=this.metrics.themeTimes[themeKey]??0;this.metrics.themeTimes[themeKey]=seconds+dt;
  if(state.mode==="endless"&&seconds<20&&seconds+dt>=20&&!state.save.discoveries[themeKey])this.alert("풍경 발견 · "+theme.name);
  const k=input.keys;let ix=(k.has("KeyD")||k.has("ArrowRight")?1:0)-(k.has("KeyA")||k.has("ArrowLeft")?1:0)+input.x;
  let iy=(k.has("KeyW")||k.has("ArrowUp")?1:0)-(k.has("KeyS")||k.has("ArrowDown")?1:0)+input.y;
  ix=trick?0:THREE.MathUtils.clamp(ix,-1,1);iy=trick?0:THREE.MathUtils.clamp(iy,-1,1);
  const boost=input.boost||k.has("ShiftLeft")||k.has("ShiftRight"),brake=input.brake||k.has("Space");
  let ratio=1;if(state.save.settings.control==="gear")ratio=GEAR_RATIOS[input.gear-1];else if(boost!==brake)ratio=boost?1.35:.70;
  this.gearRatio=trick?1:THREE.MathUtils.damp(this.gearRatio,ratio,(boost?1.8:brake?3:4)*stats.acceleration,dt);
  const targetSpeed=baseSpeed(this.distance)*stats.speed*this.gearRatio*(trick?1:this.effects.speed(this.time));
  this.speed=THREE.MathUtils.damp(this.speed,targetSpeed,4*stats.acceleration,dt);
  const targetX=-ix*18*stats.handling*state.save.settings.sensitivity,targetY=iy*12*stats.handling*state.save.settings.sensitivity;
  this.velocity.x=THREE.MathUtils.damp(this.velocity.x,targetX,5.1,dt);this.velocity.y=THREE.MathUtils.damp(this.velocity.y,targetY,5.1,dt);
  this.tmp.copy(this.position);const previousDistance=this.distance;
  const wind=this.atmosphere.weather*.75;this.position.x+=this.velocity.x*dt+Math.sin(this.time*1.7)*wind*dt;this.position.y+=this.velocity.y*dt+Math.cos(this.time*1.2)*wind*.35*dt;this.distance+=this.speed*dt;this.position.z=this.distance+this.pathOffset-this.origin;
  if(Math.abs(this.position.x)>75)this.position.x=THREE.MathUtils.damp(this.position.x,Math.sign(this.position.x)*75,1.8,dt);this.position.x=THREE.MathUtils.clamp(this.position.x,-88,88);
  const ground=this.world.ground(this.position.x,this.distance+this.pathOffset,this.time),ceiling=ground+85;
  if(this.position.y>ceiling){this.position.y=THREE.MathUtils.damp(this.position.y,ceiling,4,dt);this.velocity.y=Math.min(0,this.velocity.y);}
  if(trick)this.autopilot(dt,this.eEnd-this.time<1.5);else if(this.collide(previousDistance,dt))return;
  this.collect(previousDistance,trick);
  const gateIds=new Set<number>();
  for(const c of this.world.chunks.values())for(const gate of c.gates){
   gate.hitIds.forEach(id=>gateIds.add(id));
   if(gate.passed||this.distance+this.pathOffset<gate.z)continue;gate.passed=true;
   if(previousDistance+this.pathOffset>=gate.z)continue;
   const fraction=(gate.z-previousDistance-this.pathOffset)/Math.max(.0001,this.distance-previousDistance);
   const x=THREE.MathUtils.lerp(this.tmp.x,this.position.x,fraction),y=THREE.MathUtils.lerp(this.tmp.y,this.position.y,fraction);
   if(!trick&&Math.abs(x-gate.x)<gate.width/2-2.4&&Math.abs(y-gate.y)<gate.height/2-.9&&this.time-this.lastHit>.65){this.metrics.narrowPasses++;this.risk(250,"좁은 공간 통과");}
  }
  for(const [id,r] of this.colliders){
   if(gateIds.has(id)||this.hitScored.has(id)||this.nearScored.has(id)||this.distance+this.pathOffset<r.hit.z+r.hit.sz/2+2)continue;
   this.nearScored.add(id);if(previousDistance+this.pathOffset>r.hit.z+r.hit.sz/2+2)continue;
   const dx=Math.max(0,Math.abs(this.position.x-r.hit.x)-r.hit.sx/2-2.15),dy=Math.max(0,Math.abs(this.position.y-r.hit.y)-r.hit.sy/2-.63),gap=Math.hypot(dx,dy);
   if(!trick&&gap>=.75&&gap<=2&&this.time-this.lastHit>.65){this.metrics.nearMisses++;this.risk(100,"근접 통과");}
  }
  if(this.time-this.lastRisk>5)this.combo=0;
  const altitude=this.position.y-ground;
  if(!trick&&altitude>=5&&altitude<=12){const old=Math.floor(this.lowDistance/10);this.lowDistance+=this.distance-previousDistance;this.metrics.lowDistance=Math.floor(this.lowDistance);const units=Math.floor(this.lowDistance/10)-old;this.addBonus(units*2*(this.combo>0?1+.15*Math.min(this.combo-1,10):1));}
  if(this.distance+this.pathOffset-this.origin>1024){const newOrigin=Math.floor((this.distance+this.pathOffset)/1024)*1024,shift=newOrigin-this.origin;this.origin=newOrigin;this.position.z-=shift;this.camera.position.z-=shift;this.world.updateOrigin(newOrigin);this.syncColliders();this.physics.step();}
  if(state.mode==="endless"&&this.time-this.checkpointTime>10){this.checkpointTime=this.time;const result=this.result();useGame.setState(s=>({save:{...s.save,checkpoint:result}}));void useGame.getState().persist();}
 }
 collide(previousDistance:number,dt:number){
  const steps=Math.max(1,Math.ceil((this.distance-previousDistance)/3));
  for(let j=1;j<=steps;j++){const t=j/steps,x=THREE.MathUtils.lerp(this.tmp.x,this.position.x,t),y=THREE.MathUtils.lerp(this.tmp.y,this.position.y,t),z=THREE.MathUtils.lerp(previousDistance,this.distance,t);if(y-.62<=this.world.ground(x,z+this.pathOffset,this.time)+.12){this.crash();return true;}}
  const velocity={x:(this.position.x-this.tmp.x)/dt,y:(this.position.y-this.tmp.y)/dt,z:this.speed};
  const hit=this.physics.castShape(this.tmp,this.tempQuaternion,velocity,this.playerShape,0,dt,true,undefined,undefined,undefined,undefined,c=>{
   const r=this.handles.get(c.handle);return !!r&&(r.hit.kind==="large"||(!this.hitScored.has(r.hit.id)&&this.time-this.lastHit>.6));
  });
  if(hit){const r=this.handles.get(hit.collider.handle);if(r){if(r.hit.kind==="large"){this.crash();return true;}this.hitScored.add(r.hit.id);this.damage(this.speed<50?25:this.speed<80?50:75,this.speed>=90&&Math.abs(hit.normal1.z)>=.75);if(useGame.getState().phase==="crashing")return true;}}
  for(const r of this.colliders.values()){
   if((r.hit.kind==="small"&&(this.hitScored.has(r.hit.id)||this.time-this.lastHit<.6))||Math.abs(r.hit.z-this.distance-this.pathOffset)>r.hit.sz/2+15)continue;
   const movement={x:(r.hit.x-r.old.x)/Math.max(this.frameDt,1/60),y:(r.hit.y-r.old.y)/Math.max(this.frameDt,1/60),z:(r.hit.z-r.old.z)/Math.max(this.frameDt,1/60)};
   if(Math.abs(movement.x)+Math.abs(movement.y)+Math.abs(movement.z)<.01)continue;
   const shape=new RAPIER.Cuboid(r.hit.sx/2,r.hit.sy/2,r.hit.sz/2);
   const swept=this.playerShape.castShape(this.tmp,this.tempQuaternion,velocity,shape,{x:r.old.x,y:r.old.y,z:r.old.z-this.origin},this.tempQuaternion,movement,0,dt,true);
   if(swept){if(r.hit.kind==="large"){this.crash();return true;}this.hitScored.add(r.hit.id);this.damage(this.speed<50?25:this.speed<80?50:75,this.speed>=90&&Math.abs(swept.normal1.z)>=.75);}
  }
  return useGame.getState().phase==="crashing";
 }
 addBonus(points:number){if(this.trickActive)return;this.bonus+=Math.floor(points*this.effects.score(this.time));}
 risk(points:number,label:string){
  if(this.trickActive)return;this.combo=this.time-this.lastRisk<5?this.combo+1:1;this.lastRisk=this.time;this.maxCombo=Math.max(this.maxCombo,this.combo);
  const high=this.speed>=baseSpeed(this.distance)*this.stats().speed*1.15;this.addBonus((points+(high?50:0))*(1+.15*Math.min(this.combo-1,10)));
  flightAudio.effect("near");this.alert(label+(high?" · 고속":"")+" · "+this.combo+" COMBO");
 }
 collect(previousDistance:number,trick=false){
  const before=previousDistance+this.pathOffset,after=this.distance+this.pathOffset;
  for(const c of this.world.chunks.values())for(const item of c.pickups){
   if(item.collected||item.z>after+3)continue;
   if(item.z>=before-3){
    const fraction=THREE.MathUtils.clamp((item.z-before)/Math.max(.0001,after-before),0,1),x=THREE.MathUtils.lerp(this.tmp.x,this.position.x,fraction),y=THREE.MathUtils.lerp(this.tmp.y,this.position.y,fraction),gap=Math.hypot(x-item.x,y-item.y);
    const crossing=item.kind==="ring"?before<item.z&&after>=item.z:Math.abs(THREE.MathUtils.lerp(before,after,fraction)-item.z)<2.2;
    if((!trick||item.kind==="coin")&&crossing&&gap<(item.kind==="ring"?3.2:2.1)){
     item.collected=true;item.mesh.visible=false;
     if(item.kind==="coin"){this.coins++;flightAudio.effect("coin");}
     else if(item.kind==="ring"){this.metrics.rings++;this.addBonus(100);flightAudio.effect("ring");this.alert("링 통과 +"+100*this.effects.score(this.time));}
     else if(item.kind==="crystal"){this.addBonus(50);flightAudio.effect("ring");this.alert("크리스털 +"+50*this.effects.score(this.time));}
     else this.acquire(item.kind);
    }
   }
   if(item.z<after-3)item.mesh.visible=false;
  }
 }
 acquire(kind:EffectKind){
  if(this.trickActive)return;
  if(kind==="repair"){this.hp=Math.min(this.stats().hp,this.hp+35);flightAudio.effect("repair");}
  else {this.effects.apply(kind,this.time);flightAudio.effect("item");}
  this.alert(EFFECTS[kind].name+(EFFECTS[kind].seconds?" · "+EFFECTS[kind].seconds+"초":""));
 }
 damage(amount:number,fatal=false){
  if(this.trickActive||this.time-this.lastHit<.6)return;this.lastHit=this.time;this.combo=0;
  if(this.effects.defend(this.time)){flightAudio.effect("shield");this.alert("보호막 방어");return;}
  if(fatal){this.crash();return;}
  this.hp=Math.max(0,this.hp-amount);flightAudio.effect("hit");this.alert("기체 손상 −"+amount);if(this.hp<=0)this.crash();
 }
 crash(){
  if(useGame.getState().phase!=="flying"||this.trickActive)return;resetInput();useGame.setState({phase:"crashing"});this.crashTime=0;flightAudio.effect("hit");this.debris.visible=true;disposeGroup(this.debris);this.debris.clear();this.debrisV=[];
  for(let i=0;i<24;i++){const m=new THREE.Mesh(new THREE.BoxGeometry(.15+hash(i*17)*.4,.15+hash(i*27)*.5,.15+hash(i*47)*.6),new THREE.MeshStandardMaterial({color:i%3===0?"#c2b593":"#5b7478",roughness:.6}));m.position.copy(this.position).add(new THREE.Vector3((hash(i*113)-.5)*3,0,(hash(i*143)-.5)*3));this.debris.add(m);this.debrisV.push(new THREE.Vector3((hash(i*31)-.5)*12,4+hash(i*73)*9,(hash(i*97)-.5)*12));}
 }
 updateStorm(){
  const slot=Math.floor(this.time/90),seed=useGame.getState().seed;
  if(this.time>=540&&this.atmosphere.weather>.65&&slot!==this.stormSlot){
   this.stormSlot=slot;
   if(hash(seed^Math.imul(slot,9187))<.15){this.lightningAt=this.time+1.5;this.lightningPoint.set(this.position.x,Math.max(5,this.position.y-2),this.distance+this.pathOffset+this.speed*1.5);this.alert("번개 예고 · 표시된 공간을 피하세요");this.atmosphere.warning.visible=true;flightAudio.effect("warning");}
   else {this.atmosphere.flash(this.position.clone().add(new THREE.Vector3(90,0,120)),false);flightAudio.effect("thunder");}
  }
  if(this.lightningAt>0){
   this.atmosphere.warning.position.set(this.lightningPoint.x,this.lightningPoint.y,this.lightningPoint.z-this.origin);
   this.atmosphere.warning.scale.setScalar(1+.06*Math.sin(this.time*16));
   if(this.time>=this.lightningAt){const point=this.lightningPoint.clone();point.z-=this.origin;this.atmosphere.flash(point,true);flightAudio.effect("thunder");this.atmosphere.warning.visible=false;this.lightningAt=-1;if(Math.abs(this.position.x-point.x)<5.5&&Math.abs(this.position.z-point.z)<8&&Math.abs(this.position.y-point.y)<9)this.damage(35);}
  }
 }
 result():RunResult{const state=useGame.getState(),distance=Math.floor(this.distance);return {id:this.runId,date:new Date().toISOString(),planeId:state.runPlaneId,distance,score:distance+this.bonus,bonus:this.bonus,coins:this.coins,maxCombo:this.maxCombo,reward:state.mode==="practice"?0:Math.floor(distance/40)+Math.floor(this.bonus/150)+this.coins,theme:this.theme().id,mode:state.mode,eUsed:this.eUsed,metrics:structuredClone(this.metrics)};}
 update(delta:number){
  if(this.isDisposed)return;const dt=Math.min(delta,.15);this.frameDt=dt;this.clock+=dt;const s=useGame.getState();this.changeAircraft();this.world.quality=s.save.settings.quality;
  if(!["loading","profile","menu","hangar"].includes(this.lastPhase)&&["menu","hangar"].includes(s.phase)){this.world.reset(173018,s.save.settings.quality);this.origin=0;this.distance=0;this.time=0;for(let i=0;i<4;i++)this.world.prepare(0,0,32);this.camera.fov=58;this.camera.updateProjectionMatrix();}
  this.renderer.shadowMap.enabled=s.save.settings.quality!=="balanced";
  if(s.phase==="takeoff"&&this.runId!==s.runId)this.beginRun();
  if(s.phase==="paused"){
   if(s.resumeAt>0&&performance.now()>=s.resumeAt){useGame.setState({phase:this.takeoffTime<4&&!s.save.settings.skipTakeoff?"takeoff":"flying",resumeAt:0});}
   flightAudio.update(0,s.save.settings.volume,false);return;
  }
  const active=["takeoff","flying","crashing"].includes(s.phase);const flying=s.phase==="flying";if(!flying){this.shieldFX.visible=false;this.trickFX.visible=false;}
  if(!active&&s.phase!=="results"){
   this.doorOpen=THREE.MathUtils.damp(this.doorOpen,s.phase==="hangar"?1:0,2.0,dt);this.hangar.door.position.y=this.doorOpen*23;
   this.hangar.root.visible=true;this.model.group.visible=true;this.model.group.position.set(0,this.aircraft().style==="float"?2.0:1.4,0);this.model.group.rotation.set(0,.18+Math.sin(this.clock*.11)*.12,0);this.model.propeller.rotation.z+=dt*.3;
   if(s.phase==="hangar"){this.camPos.set(-12,5.5,13);this.camLook.set(-2.5,1.7,0);}else{this.camPos.set(31,14,69);this.camLook.set(0,8,16);}
   this.camera.fov=THREE.MathUtils.damp(this.camera.fov,s.phase==="hangar"?48:58,2,dt);this.camera.updateProjectionMatrix();this.camera.position.lerp(this.camPos,1-Math.exp(-dt*2));this.camera.lookAt(this.camLook);
  }else if(s.phase==="takeoff"){
   this.takeoffTime+=dt;const progress=s.save.settings.skipTakeoff?1:Math.min(1,this.takeoffTime/4);const eased=THREE.MathUtils.smoothstep(progress,0,1);this.hangar.door.position.y=23;
   this.model.group.position.set(0,1.4+eased*20.6,progress*80);this.model.group.rotation.set(-.09*Math.sin(progress*Math.PI),0,0);this.model.propeller.rotation.z+=dt*75;
   this.camPos.set(-9*(1-eased),8+eased*20,20+progress*38);this.camera.position.lerp(this.camPos,1-Math.exp(-dt*4));this.camera.lookAt(0,2+eased*19,progress*80+4);
   this.world.prepare(0,0,this.speed);
   if(progress>=1){this.position.set(0,22,this.pathOffset);this.camera.position.set(0,28,this.pathOffset-22);this.takeoffTime=4;this.hangar.root.visible=false;useGame.setState({phase:"flying"});}
  }else if(flying){
   this.hangar.root.visible=false;if(s.eRequest)this.startTrick();this.updateStorm();this.world.prepare(this.distance+this.pathOffset,this.time,this.speed,this.hp>=this.stats().hp);this.movingTime+=dt*this.effects.speed(this.time);this.world.update(this.movingTime,dt);this.syncColliders();this.physics.step();
   const oldest=(Math.floor((this.distance+this.pathOffset)/CHUNK)-3)*1000;for(const set of [this.nearScored,this.hitScored])for(const id of set)if(id<oldest)set.delete(id);
   this.accumulator+=dt;let count=0;while(this.accumulator>=1/60&&count<9&&useGame.getState().phase==="flying"){this.step(1/60);this.accumulator-=1/60;count++;}
   this.model.group.position.copy(this.position);this.model.group.rotation.z=THREE.MathUtils.damp(this.model.group.rotation.z,-this.velocity.x*.018,4,dt);this.atmosphere.smoke.visible=this.hp<this.stats().hp*.5;this.atmosphere.smoke.position.copy(this.position).add(new THREE.Vector3(0,.4,-3.5));this.model.group.rotation.x=THREE.MathUtils.damp(this.model.group.rotation.x,-this.velocity.y*.014,4,dt);this.model.group.rotation.y=THREE.MathUtils.damp(this.model.group.rotation.y,this.velocity.x*.008,4,dt);
   const pose=trickPose(this.time-this.eStart,s.save.settings.reducedMotion);
   if(this.trickActive){this.model.group.rotation.set(pose.pitch,pose.yaw,pose.roll);}
   this.shieldFX.visible=this.effects.active("shield",this.time)||this.trickActive;this.shieldFX.position.copy(this.position);this.shieldFX.rotation.y+=dt*.5;
   this.trickFX.visible=this.trickActive;this.trickFX.position.copy(this.position);this.trickFX.quaternion.copy(this.model.group.quaternion);this.trickFX.scale.z=1+Math.sin(this.time*13)*.10;
   this.model.propeller.rotation.z+=dt*(60+this.speed);this.model.exhaust.scale.z=1+Math.max(0,this.gearRatio-1)*2;
   const shake=!s.save.settings.reducedMotion&&this.time-this.lastHit<.4?(1-(this.time-this.lastHit)/.4)*.4:0;
   this.camPos.set(this.position.x*.9+Math.sin(this.clock*58)*shake,this.position.y+5.8+Math.cos(this.clock*44)*shake,this.position.z-23-Math.max(0,this.gearRatio-1)*5);if(this.trickActive&&pose.camera>0){const side=this.position.clone().add(new THREE.Vector3(-18,7,-9));this.camPos.lerp(side,pose.camera);}
   if(this.eJustEnded){this.camera.position.copy(this.camPos);this.eJustEnded=false;}else this.camera.position.lerp(this.camPos,1-Math.exp(-dt*5.5));
   this.camLook.set(this.position.x+this.velocity.x*.1,this.position.y+1.8,this.position.z+28);if(this.trickActive)this.camLook.lerp(this.position.clone().add(new THREE.Vector3(0,1,6)),pose.camera);this.camera.lookAt(this.camLook);
   const targetFov=58+(this.gearRatio-1)*17;this.camera.fov=THREE.MathUtils.damp(this.camera.fov,targetFov,2.2,dt);this.camera.updateProjectionMatrix();
  }else if(s.phase==="crashing"){
   this.crashTime+=dt;this.atmosphere.smoke.visible=true;this.atmosphere.smoke.position.copy(this.position);this.model.group.rotation.z+=dt*.4;this.model.group.rotation.x+=dt*.25;this.model.group.position.y-=dt*1.2;
   this.debris.children.forEach((m,i)=>{this.debrisV[i].y-=dt*9;m.position.addScaledVector(this.debrisV[i],dt*.6);m.rotation.x+=dt*3;m.rotation.y+=dt*1.8;});
   if(this.crashTime>1.4)void useGame.getState().settle(this.result());
  }
  const theme=this.theme();const environmentActive=active||s.phase==="results";this.atmosphere.smoke.visible=environmentActive&&this.atmosphere.smoke.visible;const envPos=environmentActive?this.position:this.tmp.set(0,5,0);const fog=this.atmosphere.update(dt,this.time,this.camera,envPos,environmentActive?theme:themeTimeline(173018,0),s.save.settings.quality,!environmentActive,environmentActive?this.theme(Math.floor(this.time/180)+1):undefined,environmentActive&&s.mode==="practice"?s.practice:undefined,s.save.settings.reducedMotion);
  if(this.scene.fog instanceof THREE.Fog){this.scene.fog.color.copy(fog);this.scene.fog.near=Math.max(100,this.speed*3.5);const visibility=this.atmosphere.weatherName==="안개"?.5:1-this.atmosphere.weather*.32;this.scene.fog.far=Math.max((s.save.settings.quality==="balanced"?1050:1450)*visibility,this.speed*6.5);}
  this.headlight.position.copy(this.position).add(new THREE.Vector3(0,-.25,2.8));this.headlightsTarget.position.copy(this.position).add(new THREE.Vector3(0,-1,95));this.headlight.intensity=flying?this.atmosphere.night*3600:0;
  if(flying)for(const chunk of this.world.chunks.values())for(const slot of chunk.adSlots){const dz=slot.position.z-this.distance-this.pathOffset;if(dz>-20&&dz<280&&Math.abs(slot.position.x-this.position.x)<Math.max(25,dz*.55))slot.exposureSeconds+=dt;}
  flightAudio.update(this.speed,s.save.settings.volume,flying,pjet(this.aircraft().style),s.save.settings.music,this.atmosphere.weather,this.atmosphere.night,this.trickActive);
  this.fpsSmooth=THREE.MathUtils.damp(this.fpsSmooth,Math.min(120,1/Math.max(delta,.001)),2,dt);
  this.hudTime+=dt;if(this.hudTime>.10){this.hudTime=0;const stats=this.stats();useGame.setState(state=>({hud:{...state.hud,distance:this.distance,score:Math.floor(this.distance)+this.bonus,speed:this.speed*3.6,hp:this.hp,maxHp:stats.hp,coins:this.coins,combo:this.combo,maxCombo:this.maxCombo,time:this.time,theme:theme.id,night:this.atmosphere.night,weather:this.atmosphere.weatherName,gear:s.save.settings.control==="gear"?input.gear:Math.max(1,Math.min(5,Math.round((this.gearRatio-.7)/.1625)+1)),fps:Math.round(this.fpsSmooth),altitude:this.position.y-this.world.ground(this.position.x,this.distance+this.pathOffset,this.time),chunks:this.world.chunks.size,effects:this.effects.hud(this.time),metrics:structuredClone(this.metrics),eUsed:this.eUsed,eRemaining:this.trickActive?Math.max(0,this.eEnd-this.time):0}}));}
  for(const r of this.colliders.values())r.old.set(r.hit.x,r.hit.y,r.hit.z);this.lastPhase=s.phase;
 }
 dispose(){this.isDisposed=true;this.physics.free();this.world.clear();this.scene.remove(this.world.root);for(const root of [this.atmosphere.root,this.hangar.root,this.model.group,this.debris]){this.scene.remove(root);disposeGroup(root);}this.scene.remove(this.headlight,this.headlightsTarget,this.shieldFX,this.trickFX);disposeGroup(this.shieldFX);disposeGroup(this.trickFX);}
}
function pjet(style:string){return style==="jet"||style==="fighter";}
