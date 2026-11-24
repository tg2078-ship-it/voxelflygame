import * as THREE from "three";
import {hash,seeded,themeTimeline,EFFECTS,type Theme,type ThemeId,type PickupKind,type EffectKind} from "./data";
import {VoxelBatch,materialBank,box,placard,disposeGroup} from "./voxels";
export const CHUNK=128;
export interface HitBox {x:number;y:number;z:number;sx:number;sy:number;sz:number;kind:"small"|"large";id:number;}
export interface Pickup {x:number;y:number;z:number;kind:PickupKind;collected:boolean;mesh:THREE.Object3D;}
export interface Gate {id:number;x:number;y:number;z:number;width:number;height:number;hitIds:number[];passed:boolean;}
export interface AdSlot {id:string;position:{x:number;y:number;z:number};width:number;height:number;creative:string;collision:boolean;exposureSeconds:number;}
export interface MovingObject {group:THREE.Group;base:THREE.Vector3;kind:"windmill"|"car"|"bird"|"boat"|"drone"|"train"|"blimp";phase:number;hit?:HitBox;}
export interface WorldChunk {index:number;theme:Theme;group:THREE.Group;collisions:HitBox[];pickups:Pickup[];gates:Gate[];adSlots:AdSlot[];moving:MovingObject[];ground:(x:number,z:number)=>number;}
export function makePickupModel(kind:PickupKind):THREE.Object3D{
 if(kind==="ring")return new THREE.Mesh(new THREE.TorusGeometry(3.4,.18,4,40),new THREE.MeshStandardMaterial({color:"#e4b35c",emissive:"#a87020",emissiveIntensity:.55,roughness:.25,metalness:.65}));
 if(kind==="coin"){const mesh=new THREE.Mesh(new THREE.CylinderGeometry(.48,.48,.13,8),new THREE.MeshStandardMaterial({color:"#f2c56e",emissive:"#8a531e",emissiveIntensity:.25,roughness:.28,metalness:.65}));mesh.rotation.x=Math.PI/2;return mesh;}
 const group=new THREE.Group(),color=kind==="crystal"?"#ead292":EFFECTS[kind].color;
 const material=new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.65,roughness:.3,metalness:.28});
 if(kind==="crystal"){const crystal=new THREE.Mesh(new THREE.OctahedronGeometry(.8,0),material);group.add(crystal);}
 else{
  const frame=new THREE.Mesh(new THREE.BoxGeometry(1.7,1.7,.22),new THREE.MeshStandardMaterial({color:"#234959",roughness:.4,metalness:.4}));group.add(frame);
  const bars=new VoxelBatch();
  if(kind==="repair"){bars.add(0,0,-.18,.35,1.1,.15,color);bars.add(0,0,-.18,1.1,.35,.15,color);}
  else if(kind==="shield"){for(let i=0;i<4;i++)bars.add((i<2?-1:1)*.36,(i%2?-.15:.25),-.18,.16,.55,.15,color);bars.add(0,-.5,-.18,.55,.16,.15,color);}
  else if(kind==="slow"){bars.add(0,0,-.18,.18,.95,.15,color);bars.add(.25,-.3,-.18,.55,.18,.15,color);}
  else if(kind==="turbo"){for(let i=0;i<3;i++){bars.add((i-1)*.28,.25,-.18,.25,.25,.15,color);bars.add((i-1)*.28,-.25,-.18,.25,.25,.15,color);}}
  else {bars.add(-.28,0,-.18,.18,1,.15,color);bars.add(.28,0,-.18,.18,1,.15,color);bars.add(0,0,-.18,.75,.18,.15,color);}
  group.add(bars.build(new THREE.MeshBasicMaterial({vertexColors:true}),false));
  const halo=new THREE.Mesh(new THREE.TorusGeometry(1.3,.07,4,24),material);group.add(halo);
 }
 return group;
}
function smoothNoise(x:number,z:number,seed:number){
 const wave=Math.sin(x*.019+seed*.001)*Math.cos(z*.011+seed*.003)+.5*Math.sin(z*.027+x*.015)+.28*Math.cos(x*.06-z*.04);return wave;
}
export function groundHeight(x:number,z:number,theme:ThemeId,seed:number,variant?:number){
 const n=smoothNoise(x,z,seed);const side=Math.max(0,Math.abs(x)-42);
 switch(theme){
  case "coast":{const edge=28+Math.sin(z*.008)*13+Math.cos(z*.019)*6;if(x<edge)return 0;const d=x-edge;return Math.floor((1+Math.min(22,d*.09)+n*3)/2)*2;}
  case "village":return Math.max(0,Math.floor((2+side*.025+n*2)/2)*2);
  case "city":return Math.abs(x)<62?1:Math.max(1,Math.floor((4+side*.014+n)/2)*2);
  case "ice":case "aurora":return Math.max(0,Math.floor((Math.abs(x)<36?1:5+side*.08+n*4)/2)*2);
  case "desert":return Math.max(0,Math.floor((Math.abs(x)<42?1:8+side*.23+n*9)/3)*3);
  case "forest":{const lake=Math.hypot((x+106)/70,Math.sin(z*.009)*.8);if(lake<.82)return 0;return Math.max(0,Math.floor((Math.abs(x)<35?2:8+side*.20+n*8)/2)*2);}
  case "farm":return Math.max(0,Math.floor((2+side*.012+n*1.6)/2)*2);
  case "korea":{const v=variant??Math.floor(hash(seed^0x772)*4);if(v===0||v===3){if(x<-26+Math.sin(z*.014)*5)return 0;}return Math.max(1,Math.floor((3+side*(v===2?.14:.022)+n*3)/2)*2);}
  case "river":return Math.abs(x)<31+Math.sin(z*.01)*8?0:Math.max(2,Math.floor((5+side*.018+n*2)/2)*2);
  case "landmark":return Math.max(1,Math.floor((3+side*.085+n*4)/2)*2);
  case "volcano":return Math.abs(x)<30?0:Math.max(2,Math.floor((6+side*.15+n*6)/3)*3);
  case "waterfall":return Math.abs(x)<26?0:Math.max(4,Math.floor((18+side*.17+n*5)/3)*3);
 }
}
function jitterColor(color:string,r:number){return new THREE.Color(color).multiplyScalar(.89+r*.20).getHex();}
function tree(b:VoxelBatch,x:number,y:number,z:number,scale:number,rng:()=>number,theme:Theme){
 const pine=["forest","ice","aurora"].includes(theme.id);const h=(pine?13:8)*scale;const trunk=theme.id==="ice"?"#718783":"#715342";
 b.add(x,y+h*.36,z,1.1*scale,h*.72,1.1*scale,trunk);
 if(pine){
  for(let level=0;level<5;level++){const w=(5.6-level*.84)*scale;const cy=y+4*scale+level*2.1*scale;
   b.add(x,cy,z,w,1.5*scale,w,jitterColor(theme.foliage,rng()));
   for(let side=0;side<4;side++){const a=side*Math.PI/2;b.add(x+Math.cos(a)*w*.28,cy+scale,z+Math.sin(a)*w*.28,w*.43,scale,w*.43,jitterColor(theme.foliage,rng()));}
   if(theme.id==="ice"||theme.id==="aurora")b.add(x,cy+scale*1.1,z,w*.65,.45*scale,w*.65,"#d8e8e3");
  }
 }else{
  for(let k=0;k<24;k++){const a=rng()*Math.PI*2,rad=Math.sqrt(rng())*3.7*scale;b.add(x+Math.cos(a)*rad,y+h+(rng()-.5)*4*scale,z+Math.sin(a)*rad,1.6*scale,1.6*scale,1.6*scale,jitterColor(theme.foliage,rng()));}
 }
}
function house(b:VoxelBatch,w:VoxelBatch,x:number,y:number,z:number,rng:()=>number,traditional=false){
 const width=8+rng()*6,depth=9+rng()*7,height=5+rng()*3;
 b.add(x,y+height/2,z,width,height,depth,traditional?"#d8c2a1":["#d0c6a9","#d4cbb8","#bba995"][Math.floor(rng()*3)]);
 const roof=traditional?"#4a6065":["#a96147","#6c7f77","#786455"][Math.floor(rng()*3)];
 for(let i=0;i<5;i++){const f=1-i/6;const extra=traditional?(i===0?2.4:1):0;b.add(x,y+height+i*.62,z,width*f+extra,.65,depth+(traditional?2:1),roof);}
 for(const side of [-1,1])for(let k=-1;k<=1;k++)w.add(x+k*width*.27,y+height*.6,z+side*(depth/2+.02),1.1,1.4,.07,"#edbf7d");
 b.add(x,y+1.65,z-depth/2-.06,1.9,3.3,.14,"#56666a");
 if(traditional){for(const side of [-1,1])for(let k=-2;k<=2;k++)b.add(x+k*width*.21,y+height*.51,z+side*depth*.42,.3,height,.3,"#94574b");}
}
function building(b:VoxelBatch,w:VoxelBatch,x:number,y:number,z:number,rng:()=>number,height?:number){
 const width=10+rng()*12,depth=10+rng()*13,h=height??(15+rng()*65);const palette=["#65767a","#9caaa6","#b2b7a9","#657e82","#a4aaa1"];
 const color=palette[Math.floor(rng()*palette.length)];
 b.add(x,y+h/2,z,width,h,depth,color);
 b.add(x,y+h+1,z,width+1,2,depth+1,"#4d646b");
 if(h>40)b.add(x,y+h+6,z,.6,10,.6,"#c6c9b4");
 for(let level=4;level<h-2;level+=4.3){
  for(let j=-Math.floor((width-2)/6.8);j<=Math.floor((width-2)/6.8);j++)for(const side of [-1,1]){const col=rng()>.23?"#dbbf7e":"#497681";w.add(x+j*3.4,y+level,z+side*(depth/2+.03),1.8,2,.08,col);}
  for(let j=-Math.floor((depth-2)/6.8);j<=Math.floor((depth-2)/6.8);j++)for(const side of [-1,1])w.add(x+side*(width/2+.03),y+level,z+j*3.4,.08,2,1.8,rng()>.3?"#dcc38c":"#4e7780");
  if(h>35)b.add(x,y+level+1.5,z,width+.2,.22,depth+.2,"#506a70");
 }
 b.add(x,y+1.7,z-depth/2-.06,width*.6,3.4,.1,"#5e9aa3");
 return {width,depth,height:h};
}
function mountain(b:VoxelBatch,x:number,y:number,z:number,radius:number,h:number,color:string,rng:()=>number,snow=false){
 for(let i=0;i<10;i++){const t=i/10;const r=radius*(1-t*.9);b.add(x+Math.sin(i*.7)*3,y+h*t+h/20,z+Math.cos(i*.45)*2,r*2,h/10,r*1.6,snow&&t>.65?"#d3e0d8":jitterColor(color,rng()));}
}
function bridge(b:VoxelBatch,w:VoxelBatch,x:number,y:number,z:number,width:number,suspension=true){
 const h=y+13;b.add(x,h,z,width,2.2,12,"#87988e");
 for(const side of [-1,1]){
  b.add(x,h+1.7,z+side*5.6,width,.35,.4,"#c0c5b1");
  for(let dx=-width/2+10;dx<width/2;dx+=20){b.add(x+dx,h/2,z+side*4,2.4,h,2.4,"#73877e");w.add(x+dx,h+1.7,z+side*5.7,.28,.28,.28,"#ffd085");}
 }
 if(suspension){for(const dx of [-width*.32,width*.32]){
  for(const side of [-1,1])b.add(x+dx,h+12,z+side*5,1.4,26,1.4,"#dbba83");
  b.add(x+dx,h+25,z,1.4,1.6,13,"#c2ad7d");
 }
 for(let dx=-width/2;dx<=width/2;dx+=4){const cableY=h+5+Math.abs(Math.sin((dx/width+.5)*Math.PI*2))*18;for(const side of [-1,1]){b.add(x+dx,(cableY+h)/2,z+side*5,.18,cableY-h,.18,"#d1b981");b.add(x+dx,cableY,z+side*5,4.4,.24,.24,"#d1b981");}}
 }
}
function windmill(b:VoxelBatch,x:number,y:number,z:number,rng:()=>number):MovingObject{
 for(let i=0;i<8;i++)b.add(x,y+i*1.7+.85,z,5.3-i*.35,1.7,5.3-i*.35,"#d9d1af");
 b.add(x,y+14.5,z,4.4,2,4.4,"#8c6450");
 const rotor=new THREE.Group(),rot=new VoxelBatch();rot.add(0,0,0,.8,.8,.8,"#735747");
 for(let i=0;i<4;i++){const a=i*Math.PI/2;rot.add(Math.cos(a)*4,Math.sin(a)*4,0,1.2,7,.35,"#d0c7a2",0,a-Math.PI/2);}
 rotor.add(rot.build());rotor.position.set(x,y+12.8,z-2.9);
 return {group:rotor,base:rotor.position.clone(),kind:"windmill",phase:rng()*Math.PI*2};
}
function vehicle(kind:MovingObject["kind"],x:number,y:number,z:number,rng:()=>number):MovingObject{
 const group=new THREE.Group(),b=new VoxelBatch();const phase=rng()*Math.PI*2;
 if(kind==="boat"){
  for(let i=0;i<5;i++)b.add(0,.45+i*.30,0,4+i*.35,.32,12-i*.3,i<2?"#517680":"#dbd7be");
  b.add(0,2.7,-1.7,3.4,2.6,4.5,"#e0dbbe");b.add(0,4.1,-1.7,3.8,.4,4.8,"#b8c9c3");
  b.add(0,5.7,-1.5,.15,4,.15,"#8fa3a2");b.add(0,6.8,-1.6,2,.65,.10,"#db994e");
  for(const side of [-1,1])b.add(side*1.74,3,-1.7,.08,1.2,3,"#5b909d");
 }else if(kind==="car"||kind==="train"){
  const long=kind==="train"?24:5.3;b.add(0,.9,0,2.9,1.4,long,kind==="train"?"#547b78":["#d69653","#8baba4","#d7d9bc"][Math.floor(rng()*3)]);
  b.add(0,1.95,0,2.3,1.0,long*.60,"#668b91");
  for(const side of [-1,1])for(const dz of [-long*.32,long*.32])b.add(side*1.4,.35,dz,.55,.65,.95,"#304247");
  if(kind==="train")for(let dz=-long/2+2;dz<long/2;dz+=3)b.add(0,2.1,dz,2.6,.6,1.9,"#b1cabf");
 }else if(kind==="bird"){
  for(const dx of [-2.8,0,2.8]){b.add(dx,0,Math.abs(dx)*.5,.22,.18,.66,"#d5dcd3");b.add(dx-.45,.12,Math.abs(dx)*.5,.75,.08,.24,"#c7d3ce",0,.18);b.add(dx+.45,.12,Math.abs(dx)*.5,.75,.08,.24,"#c7d3ce",0,-.18);}
 }else if(kind==="drone"){
  b.add(0,0,0,.65,.28,.65,"#c4d4c7");for(const a of [-1,1])for(const c of [-1,1]){b.add(a*.55,.05,c*.55,.7,.10,.20,"#536f76");b.add(a*.7,.15,c*.7,.55,.05,.55,"#88b1b3");}
 }else if(kind==="blimp"){
  for(let i=-8;i<=8;i++){const r=Math.sqrt(Math.max(0,1-(i/9)**2));b.add(0,0,i*1.5,9*r,8*r,1.5,i<-4?"#d7b975":i>4?"#c3d6d1":"#e4ddc1");}
  b.add(0,-4.7,0,3.4,1.8,5.5,"#436b77");b.add(0,3.2,-11.2,.4,6,4,"#c59359");b.add(0,0,-11.8,10,.4,4,"#bf9566");
  const sign=placard("AIRRUN",10,2.3,"#cfb678","#365760");sign.position.set(-4.4,0,0);sign.rotation.y=-Math.PI/2;group.add(sign);
 }
 group.add(b.build());group.position.set(x,y,z);
 return {group,base:group.position.clone(),kind,phase};
}
export function makeChunk(index:number,theme:Theme,seed:number,quality:string,timing?:{startTime:number;secondsPerMeter:number;next?:Theme;fullHP?:boolean}):WorldChunk{
 const group=new THREE.Group();group.position.z=index*CHUNK;const b=new VoxelBatch(),terrain=new VoxelBatch(),windows=new VoxelBatch();const rng=seeded((Math.imul(index,45191)^seed)>>>0);
 const collisions:HitBox[]=[],pickups:Pickup[]=[],gates:Gate[]=[],adSlots:AdSlot[]=[],moving:MovingObject[]=[];const baseZ=index*CHUNK;
 const next=timing?.next??(timing?themeTimeline(seed,Math.floor(Math.max(0,timing.startTime)/180)+1):theme);
 const blendAt=(z:number)=>timing?THREE.MathUtils.smoothstep(Math.max(0,timing.startTime)+(z-baseZ)*timing.secondsPerMeter-Math.floor(Math.max(0,timing.startTime)/180)*180,160,180):0;
 const heightAt=(x:number,z:number)=>THREE.MathUtils.lerp(groundHeight(x,z,theme.id,seed,theme.variant),groundHeight(x,z,next.id,seed,next.variant),blendAt(z));
 const addHit=(x:number,y:number,z:number,sx:number,sy:number,sz:number,kind:"small"|"large"="large")=>{collisions.push({x,y,z:z+baseZ,sx,sy,sz,kind,id:index*1000+collisions.length});};
 const track=(m:MovingObject)=>{
  if(!m.hit&&["car","train","boat"].includes(m.kind)){
   const boat=m.kind==="boat",train=m.kind==="train";const hit:HitBox={x:m.base.x,y:m.base.y+(boat?2.8:1.25),z:baseZ+m.base.z,sx:boat?4.7:2.9,sy:boat?5.6:2.5,sz:train?24:boat?12:5.3,kind:"large",id:index*1000+910+moving.length};m.hit=hit;collisions.push(hit);
  }
  moving.push(m);group.add(m.group);
 };
 const detail=quality==="balanced"?12:8;const width=quality==="balanced"?288:352;
 for(let x=-width;x<=width;x+=detail)for(let z=detail/2;z<CHUNK;z+=detail){
  const h=heightAt(x,z+baseZ);if(h<=0)continue;
  const shade=hash(Math.floor(x*79)+Math.floor((z+baseZ)*11)+seed);
  let color=theme.ground;if(theme.id==="coast"&&h<5)color="#d8c49a";if(theme.id==="forest"&&h>26)color="#82928a";
  if(theme.id==="volcano"&&h>30)color="#4e5552";if(theme.id==="desert"&&h>25)color="#aa6c49";
  const mixed=new THREE.Color(color).lerp(new THREE.Color(next.ground),blendAt(z+baseZ)).multiplyScalar(.89+shade*.20);
  terrain.add(x,h/2-.8,z,detail+.02,h+1.6,detail+.02,mixed.getHex());
  if((theme.id==="farm"||theme.id==="korea"&&theme.variant===2)&&Math.abs(x)>40&&Math.abs(x)<170&&Math.floor((z+baseZ)/48)%2===0)terrain.add(x,h+.28,z,detail,.5,detail,Math.floor(x/40)%2?"#bbc078":"#7c995d");
 }
 const koreanVariant=theme.variant??Math.floor(hash(seed^0x772)*4);
 const forests=["forest","village","farm","river","waterfall","korea","ice","aurora"].includes(theme.id);
 if(forests||theme.id==="coast"){
  const count=quality==="balanced"?14:25;for(let i=0;i<count;i++){
   const sign=rng()<.5?-1:1;const x=sign*(45+rng()*210),z=rng()*CHUNK;const y=heightAt(x,z+baseZ);if(y<=0)continue;
   tree(b,x,y,z,.8+rng()*.8,rng,theme);
   if(Math.abs(x)<90)addHit(x,y+5.5,z,1.4,11,1.4,"large");
  }
 }
 if(["village","farm"].includes(theme.id)||theme.id==="korea"&&(koreanVariant===1||koreanVariant===2||koreanVariant===3)){
  for(let i=0;i<8;i++){const x=(i%2===0?-1:1)*(46+rng()*105),z=10+rng()*105,y=heightAt(x,z+baseZ);house(b,windows,x,y,z,rng,theme.id==="korea"&&koreanVariant===1);if(Math.abs(x)<80)addHit(x,y+5,z,13,10,15);}
  if(index%3===1){const x=-42,y=heightAt(x,62+baseZ);const mill=windmill(b,x,y,62,rng);moving.push(mill);group.add(mill.group);addHit(x,y+7,62,5,14,5);}
 }
 if(theme.id==="city"||theme.id==="korea"&&(koreanVariant===0||koreanVariant===3)){
  for(const sign of [-1,1]){
   for(let i=0;i<(theme.id==="korea"&&koreanVariant===3?4:7);i++){const x=sign*(55+Math.floor(i/3)*26+rng()*12),z=10+(i%3)*40+rng()*8,y=heightAt(x,z+baseZ);const dimensions=building(b,windows,x,y,z,rng);if(Math.abs(x)-dimensions.width/2<91)addHit(x,y+dimensions.height/2,z,dimensions.width,dimensions.height,dimensions.depth);}
   for(let k=0;k<CHUNK;k+=8){b.add(sign*34,2,k,1.3,.2,4,"#c4bea0");b.add(sign*34,5,k+4,.24,6,.24,"#566f73");windows.add(sign*34,8,k+4,.9,.22,1.8,"#e5c48f");}
   terrain.add(sign*38,1.2,64,20,.15,128,"#4d6164");
   const car=vehicle("car",sign*37,1.35,30+rng()*70,rng);track(car);
  }
  if(index%4===2){
   const x=17*(rng()<.5?-1:1),z=82,craneY=1;b.add(x,craneY+18,z,1.1,36,1.1,"#d3a14b");b.add(x-10,craneY+34,z,27,1.2,1.2,"#d5af61");b.add(x-17,craneY+24,z,.12,20,.12,"#b19a6c");addHit(x,19,z,1.8,36,1.8);addHit(x-10,35,z,27,1.2,1.2);
  }
 }
 if(["forest","ice","aurora","desert","landmark","volcano","waterfall"].includes(theme.id)){
  for(let i=0;i<4;i++){const x=(i%2===0?-1:1)*(150+rng()*130),z=rng()*128,y=heightAt(x,z+baseZ);mountain(b,x,y,z,35+rng()*32,45+rng()*70,theme.id==="desert"?"#b2734b":theme.ground,rng,["ice","aurora","forest"].includes(theme.id));}
 }
 // Optional variations include a readable canyon canopy that brings high flight back down.
 if(["desert","forest","ice"].includes(theme.id)&&index>2&&index%8===3){
  const z=86,color=theme.id==="desert"?"#b27b55":theme.id==="ice"?"#b9d6d3":"#7a9183";
  for(let layer=0;layer<10;layer++){const y=52+layer*6;const jitter=Math.sin(layer*1.6)*4;b.add(jitter,y,z,205+Math.cos(layer)*5,6,30+Math.sin(layer*2.1)*4,jitterColor(color,rng()));}
  for(const side of [-1,1]){for(let layer=0;layer<8;layer++)b.add(side*86,3+layer*6,z,19+Math.sin(layer)*5,6,35,jitterColor(color,rng()));addHit(side*86,24,z,19,48,35);}
  addHit(0,79,z,200,60,28);
 }
 // Composed local landmarks keep each region recognisable.
 if(theme.id==="village"&&index%6===2){
  const x=112,z=58,y=heightAt(x,z+baseZ);house(b,windows,x,y,z,rng);b.add(x,y+14,z-3,5,22,5,"#c8c4a6");
  for(let i=0;i<5;i++)b.add(x,y+25+i,z-3,6-i,.95,6-i,"#587978");windows.add(x,y+18,z-5.55,1.5,3,.08,"#e2c792");b.add(x,y+31,z-3,.24,3,.24,"#bdad76");
 }
 if(theme.id==="city"&&index%7===4){
  const x=156,z=64,y=heightAt(x,z+baseZ);b.add(x,y+7,z,52,14,46,"#938e7b");b.add(x,y+15,z,54,2,48,"#556d6d");
  for(let k=-2;k<=2;k++){b.add(x+k*8,y+25,z+14,3,22,3,"#b2ada0");windows.add(x+k*8,y+35,z+14,3.1,.5,3.1,"#ddad65");}
  for(let k=0;k<6;k++)b.add(x-8+k*3,y+39+k*5,z+14+k*3,7+k,3,7+k,"#9fada5");
 }
 if(theme.id==="korea"&&koreanVariant===2){
  for(let k=0;k<3;k++){const x=-102-k*18,z=20+k*31,y=heightAt(x,z+baseZ);mountain(b,x,y,z,18+k*9,30+k*16,"#6e8873",rng);}
  for(let k=0;k<3;k++){const x=48+k*22,z=88,y=heightAt(x,z+baseZ);b.add(x,y+.4,z,20,.7,27,"#93a16c");for(let row=0;row<7;row++)b.add(x-9+row*3,y+.9,z,.6,.6,24,"#b1b976");}
 }
 if(theme.id==="korea"&&koreanVariant===3&&index%3===1){
  for(let k=0;k<4;k++){b.add(-25,1.6,20+k*25,35,3,10,"#ada58e");b.add(-30,9,20+k*25,1.3,18,1.3,"#c8b486");b.add(-39,17.5,20+k*25,22,1.3,1.3,"#cbae72");}
  if(index%6===1){bridge(b,windows,0,0,72,215);addHit(0,13,72,215,2.2,12);}
 }
 if(theme.id==="korea"&&koreanVariant===1&&index%6===4){
  const x=87,z=68,y=heightAt(x,z+baseZ);b.add(x,y+1,z,45,2,37,"#b5b3a0");
  for(const dx of [-17,0,17])house(b,windows,x+dx,y+2,z,rng,true);
  b.add(x,y+8,z,39,2,27,"#bdac85");for(let level=0;level<5;level++)b.add(x,y+10+level*.8,z,43-level*5,.8,29,"#455e63");
  for(let k=0;k<6;k++)b.add(x,y+2+k*.25,z-21-k,15-k*.6,.3,1.1,"#c1bc9f");
 }
 if(theme.id==="landmark"&&index%6===3){
  const x=-119,z=58,y=heightAt(x,z+baseZ);mountain(b,x,y,z,37,37,"#8d9a7e",rng);
  b.add(x,y+45,z,43,15,28,"#afa992");for(const dx of [-18,18])for(const dz of [-11,11]){b.add(x+dx,y+53,z+dz,8,25,8,"#c6bca0");for(let i=0;i<4;i++)b.add(x+dx,y+66+i,z+dz,10-i*2,.9,10-i*2,"#667e7d");}
  for(let k=-3;k<=3;k++)windows.add(x+k*5,y+46,z-14.05,1.3,2,.1,"#e7c98f");
 }
 // Hand-authored signatures recur with varied surroundings.
 if(theme.id==="coast"){
  if(index%5===1){const x=88,z=76,y=heightAt(x,z+baseZ);
   for(let i=0;i<12;i++)b.add(x,y+i*1.75+.9,z,6.2-i*.19,1.75,6.2-i*.19,i%5===2?"#ce7052":"#eee1ba");
   b.add(x,y+22,z,5.8,1.5,5.8,"#506d72");windows.add(x,y+23.3,z,4,1.1,4,"#ffd78b");b.add(x,y+24.4,z,6,.5,6,"#ab6249");
   for(let dx=-12;dx<12;dx+=4)b.add(x+dx,y+.6,z-10,3.8,1.2,18,"#c0b58f");
  }
  const boat=vehicle("boat",-55-rng()*100,.1,rng()*128,rng);track(boat);
  if(index>1&&index%6===3){bridge(b,windows,0,0,74,185);addHit(0,13,74,185,2.2,12);for(const x of [-59,59])addHit(x,26,74,3,30,12);}
  if(index%5===4){for(let z=22;z<115;z+=18){b.add(36,1.5,z,34,2.8,8,"#a69b7e");b.add(26,6.5,z,1.2,10,1.2,"#ba9b68");b.add(18,10.9,z,17,1,1,"#cca95e");}}
 }
 if(["river","waterfall"].includes(theme.id)){
  const boat=vehicle("boat",-8+rng()*16,.1,rng()*128,rng);track(boat);
  if(index%4===2){bridge(b,windows,0,1,70,160,true);addHit(0,14,70,160,2.2,12);}
 }
 if(theme.id==="waterfall"&&index%3===0){
  for(const side of [-1,1]){
   const x=side*45,y=heightAt(x,70+baseZ);
   b.add(x,y+25,70,20,50,34,"#547d70");
   for(let k=0;k<6;k++)b.add(x+side*k*1.2,y+25-k*4,56,7,42-k*3,.55,k%2?"#c0e5df":"#85bfbf");
   b.add(x,y+48,70,22,2,35,"#96bfb0");
   addHit(x,y+25,70,20,50,34);
  }
 }
 if(theme.id==="volcano"&&index%4===0){
  mountain(b,160,10,68,90,170,"#59625b",rng);for(let i=0;i<9;i++){const dz=40+i*8;windows.add(143-i*3,22+i*12,dz,3,1.2,8,"#f28543");}
  for(let i=0;i<9;i++)b.add(155+(rng()-.5)*13,191+i*5,68+(rng()-.5)*9,15+i*1.7,4,15+i*1.7,"#7a8480");
 }
 if(theme.id==="korea"){
  if(koreanVariant===1&&index%3===1){
   for(let k=0;k<3;k++){const x=62+k*19,z=63;house(b,windows,x,3,z,rng,true);b.add(x,2.5,z-12,18,3,2,"#879286");}
   for(let k=0;k<12;k++)b.add(38,5,k*10,2.3,7,9.8,"#9ba593");
  }else if(koreanVariant===0&&index%4===0){
   bridge(b,windows,-30,1,78,210);addHit(-30,14,78,210,2.2,12);
   b.add(125,42,60,5,75,5,"#d0d3bd");b.add(125,78,60,19,5,19,"#809ba2");b.add(125,85,60,11,9,11,"#bcc8be");b.add(125,97,60,.7,20,.7,"#c2caba");
  }else if(koreanVariant===3){const boat=vehicle("boat",-65,.1,70,rng);track(boat);}
 }
 if(theme.id==="landmark"&&index%4===1){
  const x=75,z=60;for(let side=-1;side<=1;side+=2)b.add(x+side*14,18,z,8,34,12,"#c9b887");
  for(let i=0;i<6;i++)b.add(x,36+i*1.2,z,36-i*2,1.3,14,"#cbb98e");
  for(let i=0;i<3;i++)b.add(x,2+i*.65,z-12,45-i*4,.6,35-i*5,"#ad9f7a");
  addHit(x,20,z,36,40,14);
 }
 if(theme.id==="farm"&&index%4===2){
  const x=49,z=66,y=heightAt(x,z+baseZ);b.add(x,y+18,z,1.4,36,1.4,"#d2d7c5");
  const rotor=new THREE.Group(),rb=new VoxelBatch();for(let j=0;j<3;j++){const a=j*Math.PI*2/3;rb.add(Math.cos(a)*7,Math.sin(a)*7,0,.7,13,.22,"#d9dece",0,a-Math.PI/2);}
  rotor.add(rb.build());rotor.position.set(x,y+34,z-1.2);group.add(rotor);moving.push({group:rotor,base:rotor.position.clone(),phase:rng()*6,kind:"windmill"});addHit(x,y+18,z,2,36,2);
 }
 if(["village","farm","desert"].includes(theme.id)&&index%5===0){const train=vehicle("train",-60,3.0,96,rng);track(train);b.add(0,1.8,96,210,.4,6,"#6d7569");for(const dz of [-1.9,1.9])b.add(0,2.1,96+dz,210,.13,.16,"#adb5a3");}
 // Readable obstacles. The centre has a viable passage at typical altitude.
 if(index>1){
  for(let i=0;i<2;i++){
   const x=(rng()-.5)*58,z=34+i*57+rng()*10;const h=heightAt(x,z+baseZ);
   if(h===0){b.add(x,1.2,z,2.8,2.4,2.8,"#bc9d61");b.add(x,13.3,z,.48,23.8,.48,"#d8d2b5");windows.add(x,25.3,z,.70,.70,.70,"#f4c075");addHit(x,13.3,z,.70,23.8,.70,"small");}
   else if(theme.id==="desert"||theme.id==="ice"){b.add(x,h+7,z,4,14,4,theme.id==="desert"?"#bd8359":"#a4d6d5");addHit(x,h+7,z,4,14,4);}
   else {const scale=1.65+rng()*.45,pine=["forest","aurora"].includes(theme.id),height=(pine?13:8)*scale;tree(b,x,h,z,scale,rng,theme);addHit(x,h+height*.36,z,1.1*scale,height*.72,1.1*scale);addHit(x,h+height*.93,z,4.9*scale,5.4*scale,4.9*scale,"small");}
  }
 }
 if(index>2&&index%3===0){const bird=vehicle("bird",(rng()-.5)*45,19+rng()*47,70,rng);const hit:HitBox={x:bird.base.x,y:bird.base.y,z:baseZ+bird.base.z,sx:7,sy:.7,sz:2.8,kind:"small",id:index*1000+900};bird.hit=hit;collisions.push(hit);moving.push(bird);group.add(bird.group);}
 if(theme.id==="city"&&index%5===3){
  const z=44,h=22+rng()*7;b.add(0,h,z,126,2.4,8,"#799089");b.add(0,h+3.4,z,126,.45,8.4,"#607b7a");
  for(const side of [-1,1]){windows.add(0,h+1.9,z+side*3.85,122,2.0,.10,"#a8c7ba");for(let x=-58;x<60;x+=6)b.add(x,h+1.9,z+side*4,.18,2.4,.2,"#829791");}
  addHit(0,h+1.2,z,126,4.8,8);
 }
 if(theme.id==="city"&&index%4===1){const drone=vehicle("drone",(rng()-.5)*55,26+rng()*18,85,rng);const hit:HitBox={x:drone.base.x,y:drone.base.y,z:baseZ+85,sx:2,sy:.7,sz:2,kind:"small",id:index*1000+901};drone.hit=hit;collisions.push(hit);moving.push(drone);group.add(drone.group);}
 if(index%9===5){const blimp=vehicle("blimp",-70+rng()*140,80+rng()*20,72,rng);const hit:HitBox={x:blimp.base.x,y:blimp.base.y,z:baseZ+72,sx:8,sy:7,sz:23,kind:"large",id:index*1000+902};blimp.hit=hit;collisions.push(hit);moving.push(blimp);group.add(blimp.group);adSlots.push({id:`blimp-${index}`,position:{x:hit.x,y:hit.y,z:hit.z},width:10,height:2.3,creative:"AIRRUN",collision:true,exposureSeconds:0});}
 if(index%6===2){
  const ad=placard("EXPLORE THE SKY",18,5,"#e0c181","#3b5c63");ad.position.set(95,21,48);ad.rotation.y=Math.PI-Math.PI/7;group.add(ad);b.add(95,10,48,1.4,20,1.4,"#68827c");
  adSlots.push({id:`billboard-${index}`,position:{x:95,y:21,z:baseZ+48},width:18,height:5,creative:"EXPLORE THE SKY",collision:false,exposureSeconds:0});
 }
 if(index>2&&index%4===1){
  const x=index%8===1?-25:25,z=103,y=heightAt(x,z+baseZ)+22,width=16,height=11;
  const hitStart=collisions.length;
  for(const side of [-1,1]){b.add(x+side*width/2,y,z,1.1,height+2,1.3,"#d6b774");addHit(x+side*width/2,y,z,1.1,height+2,1.3);}
  for(const side of [-1,1]){b.add(x,y+side*height/2,z,width+1.1,1.1,1.3,"#d6b774");addHit(x,y+side*height/2,z,width+1.1,1.1,1.3);}
  windows.add(x,y+height/2+.7,z-.1,2.5,.15,.15,"#87d3c7");
  gates.push({id:index*1000+950,x,y,z:baseZ+z,width:width-1.1,height:height-1.1,hitIds:collisions.slice(hitStart).map(h=>h.id),passed:false});
 }
 // Optional collection path never occupies an unavoidable collision.
 if(index>=0){
  const safe=(x:number,y:number,z:number,r=3)=>y>heightAt(x,baseZ+z)+r+1&&!collisions.some(h=>Math.abs(h.z-baseZ-z)<h.sz/2+r+3&&Math.abs(h.x-x)<h.sx/2+r+3&&Math.abs(h.y-y)<h.sy/2+r+1);
  const put=(kind:PickupKind,x:number,y:number,z:number)=>{
   let found=false;const radius=kind==="ring"?4:1.6;
   for(const lift of [0,7,15,-7,23]){const cy=Math.max(heightAt(x,baseZ+z)+6,y+lift);if(safe(x,cy,z,radius)){y=cy;found=true;break;}}
   if(!found)return;const mesh=makePickupModel(kind);mesh.position.set(x,y,z);group.add(mesh);pickups.push({x,y,z:baseZ+z,kind,collected:false,mesh});
  };
  const ringX=Math.sin(index*.75+hash(seed)*4)*18,ringY=23+Math.sin(index*.8)*6;
  put("ring",ringX,ringY,68);
  for(let k=0;k<6;k++)put("coin",ringX+(k<3?-1:1)*Math.sin(k)*2,ringY,32+k*11);
  put("crystal",-ringX*.7,ringY+5,112);
  const effectSlots:number[]=timing?Array.from({length:Math.max(0,Math.ceil((timing.startTime+CHUNK*timing.secondsPerMeter)/8)-Math.ceil(timing.startTime/8))},(_,k)=>Math.ceil(timing.startTime/8)+k):index%2===1?[index]:[];
  for(const slot of effectSlots){
   const r=hash(seed^Math.imul(slot,74191));let kind:EffectKind=r<.3?"repair":r<.55?"shield":r<.75?"multiplier":r<.9?"slow":"turbo";
   if(kind==="repair"&&timing?.fullHP)kind=hash(slot^seed)<.5?"shield":"multiplier";
   const z=timing?(slot*8-timing.startTime)/timing.secondsPerMeter:93;const x=(hash(seed+slot*718)-.5)*38;
   if(z>=0&&z<CHUNK)put(kind,x,24+hash(slot*441)*10,z);
  }
 }
 group.add(terrain.build(materialBank.solid,false));group.add(b.build(materialBank.solid,quality!=="balanced"));
 if(windows.boxes.length)group.add(windows.build(materialBank.window,false));
 return {index,theme,group,collisions,pickups,gates,adSlots,moving,ground:heightAt};
}
export class WorldStreamer{
 root=new THREE.Group();chunks=new Map<number,WorldChunk>();origin=0;seed=0;quality="high";queue:number[]=[];themeOverride:Theme|null=null;private lastBuild=0;
 reset(seed:number,quality:string,theme:Theme|null=null){this.clear();this.seed=seed;this.quality=quality;this.themeOverride=theme;this.origin=0;this.root.position.z=0;}
 prepare(distance:number,time:number,speed:number,fullHP=false){
  const current=Math.floor(distance/CHUNK);const ahead=Math.max(this.quality==="balanced"?7:10,Math.ceil(speed*7/CHUNK)+2);
  const wanted=new Set<number>();for(let i=current-2;i<=current+ahead;i++)wanted.add(i);
  for(const [index,c] of this.chunks)if(!wanted.has(index)){this.root.remove(c.group);disposeGroup(c.group);this.chunks.delete(index);}
  this.queue=this.queue.filter(i=>wanted.has(i)&&!this.chunks.has(i));
  for(const index of wanted)if(!this.chunks.has(index)&&!this.queue.includes(index))this.queue.push(index);
  this.queue.sort((a,b)=>Math.abs(a-current)-Math.abs(b-current));
  if(this.queue.length){const i=this.queue.shift()!;const forecast=Math.max(0,time+(i*CHUNK-distance)/Math.max(1,speed));const theme=this.themeOverride??themeTimeline(this.seed,Math.floor(forecast/180));const c=makeChunk(i,theme,this.seed,this.quality,{startTime:forecast,secondsPerMeter:1/Math.max(1,speed),next:this.themeOverride??undefined,fullHP});c.group.position.z=i*CHUNK-this.origin;this.root.add(c.group);this.chunks.set(i,c);this.lastBuild=performance.now();}
 }
 updateOrigin(origin:number){this.origin=origin;for(const c of this.chunks.values())c.group.position.z=c.index*CHUNK-origin;}
 update(time:number,dt:number){
  for(const c of this.chunks.values()){
   for(const slot of c.adSlots)if(slot.collision){const blimp=c.moving.find(m=>m.kind==="blimp");if(blimp?.hit)slot.position={x:blimp.hit.x,y:blimp.hit.y,z:blimp.hit.z};}
   for(const p of c.pickups)if(!p.collected){p.mesh.rotation.z+=dt*.5;if(p.kind==="coin")p.mesh.rotation.y+=dt*1.5;}
   for(const m of c.moving){
    switch(m.kind){
     case "windmill":m.group.rotation.z=time*.45+m.phase;break;
     case "car":m.group.position.z=m.base.z+Math.sin(time*.09+m.phase)*35;break;
     case "train":m.group.position.x=Math.sin(time*.10+m.phase)*100;break;
     case "boat":m.group.position.z=m.base.z+Math.sin(time*.04+m.phase)*17;m.group.rotation.z=Math.sin(time*1.7+m.phase)*.025;break;
     case "bird":m.group.position.x=m.base.x+Math.sin(time*.27+m.phase)*15;m.group.position.y=m.base.y+Math.sin(time*2+m.phase)*1.2;break;
     case "drone":m.group.position.x=m.base.x+Math.sin(time*.45+m.phase)*10;m.group.position.y=m.base.y+Math.cos(time*.8+m.phase)*2;break;
     case "blimp":m.group.position.x=m.base.x+Math.sin(time*.025+m.phase)*22;m.group.position.y=m.base.y+Math.sin(time*.08)*2;break;
    }
    if(m.hit){m.hit.x=m.group.position.x;m.hit.y=m.group.position.y+(m.kind==="boat"?2.8:m.kind==="car"||m.kind==="train"?1.25:0);m.hit.z=c.index*CHUNK+m.group.position.z;}
   }
  }
 }
 ground(x:number,z:number,time:number){const chunk=this.chunks.get(Math.floor(z/CHUNK));if(chunk)return chunk.ground(x,z);const theme=this.themeOverride??themeTimeline(this.seed,Math.floor(time/180));return groundHeight(x,z,theme.id,this.seed,theme.variant);}
 clear(){for(const c of this.chunks.values()){this.root.remove(c.group);disposeGroup(c.group);}this.chunks.clear();this.queue=[];}
}
