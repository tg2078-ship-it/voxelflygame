import * as THREE from "three";
import {WorldStreamer} from "./world";

export const TRICK_SECONDS=15;
export interface SafeRoute {x:number;y:number;clear:boolean;}
export function routeClear(world:WorldStreamer,x:number,y:number,z:number,time:number,speed:number,horizon=1.8){
 const length=Math.max(12,speed*horizon);
 for(let d=0;d<=length;d+=Math.min(8,length/6)){
  const ground=world.ground(x,z+d,time+d/Math.max(1,speed));if(y<ground+3||y>ground+82)return false;
 }
 for(const chunk of world.chunks.values())for(const h of chunk.collisions){
  if(h.z+h.sz/2+3<z||h.z-h.sz/2-3>z+length)continue;
  const moving=h.id%1000>=900&&h.id%1000<950;
  // Leave room for the whole visual wingspan and the mover's future sway.
  if(Math.abs(x-h.x)<h.sx/2+5.8+(moving?12:0)&&Math.abs(y-h.y)<h.sy/2+2+(moving?2:0))return false;
 }
 return true;
}
export function findSafeRoute(world:WorldStreamer,position:THREE.Vector3,z:number,time:number,speed:number):SafeRoute{
 const candidates:SafeRoute[]=[];
 for(const x of [THREE.MathUtils.clamp(position.x,-64,64),0,-18,18,-36,36,-54,54,-65,65]){
  const g=world.ground(x,z,time);
  for(const y of [position.y,g+22,g+35,g+43,g+55,g+72,g+12])if(routeClear(world,x,y,z,time,speed))candidates.push({x,y,clear:true});
 }
 candidates.sort((a,b)=>(Math.abs(a.x-position.x)*1.2+Math.abs(a.y-position.y))-(Math.abs(b.x-position.x)*1.2+Math.abs(b.y-position.y)));
 if(candidates.length)return candidates[0];
 // This shorter fallback is only needed when two distant formations overlap.
 for(const x of [0,-18,18,-36,36,-54,54])for(const y of [12,22,35,43,55,72]){
  const height=world.ground(x,z,time)+y;if(routeClear(world,x,height,z,time,speed,.65))return {x,y:height,clear:true};
 }
 return {x:0,y:world.ground(0,z,time)+35,clear:false};
}
export function trickPose(elapsed:number,reducedMotion:boolean){
 if(reducedMotion)return {pitch:0,roll:0,yaw:0,camera:0};
 const enter=THREE.MathUtils.smoothstep(elapsed,0,1),leave=1-THREE.MathUtils.smoothstep(elapsed,13.5,15),camera=enter*leave;
 const flip=THREE.MathUtils.smoothstep(elapsed,2,5)*Math.PI*2;
 const back=THREE.MathUtils.smoothstep(elapsed,6,9)*Math.PI*2;
 const roll=THREE.MathUtils.smoothstep(elapsed,10,13.2)*Math.PI*2;
 return {pitch:flip-back,roll,yaw:Math.sin(elapsed*.5)*.13*camera,camera};
}
