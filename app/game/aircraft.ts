import * as THREE from "three";
import {type Aircraft} from "./data";
import {VoxelBatch,box,materialBank} from "./voxels";
export interface AircraftModel {group:THREE.Group;propeller:THREE.Group;exhaust:THREE.Group;}
export function makeAircraft(p:Aircraft):AircraftModel{
 const group=new THREE.Group(),b=new VoxelBatch(),propeller=new THREE.Group(),exhaust=new THREE.Group();
 const jet=p.style==="jet"||p.style==="fighter";const sporty=p.style==="sport"||p.id==="pitts";const length=jet?9.8:p.style==="warbird"?8.8:7.7;const unit=.22;
 // Only the visible skin of the voxel fuselage is emitted.
 for(let z=-length/2;z<=length/2;z+=unit){
  const t=(z+length/2)/length;let width=(jet?.60:.62)*Math.pow(Math.sin(Math.PI*t),.52)+.08;
  if(t<.24)width*=.55+.45*t/.24;
  const height=width*(jet?.85:.96);
  for(let x=-Math.ceil(width/unit)*unit;x<=width;x+=unit)for(let y=-Math.ceil(height/unit)*unit;y<=height;y+=unit){
   const d=(x*x)/(width*width)+(y*y)/(height*height);const inner=((Math.abs(x)+unit*.85)**2)/(width*width)+((Math.abs(y)+unit*.85)**2)/(height*height);
   if(d<=1.09&&inner>.82){const stripe=Math.abs(y)<unit*1.15&&t>.13&&t<.85;const c=stripe?p.accent:y<-.28?"#73888d":p.color;b.add(x,y+.4,z,unit*.99,unit*.99,unit*.99,c);}
  }
 }
 const wingZ=jet?.4:.8;const high=p.style==="light"||p.style==="float";const wingY=high?1.37:p.style==="biplane"?-.1:.28;const span=jet?4.4:sporty?4.6:5.5;
 function wing(y:number,half:number,sweep:number){
  for(let x=-half;x<=half;x+=.25){if(Math.abs(x)<.4)continue;const ratio=Math.abs(x)/half;const chord=(jet?2.75:1.7)*(1-.48*ratio);const zoff=-Math.abs(x)*sweep;
   for(let z=-chord/2;z<=chord/2;z+=.25){const tip=ratio>.84,c=tip||z<-chord*.22?p.accent:p.color;b.add(x,y+Math.abs(x)*.024,wingZ+z+zoff,.25,.15,.25,c);}
  }
 }
 wing(wingY,span,jet?.55:0);
 if(p.style==="biplane"){
  wing(1.85,span,0);for(const x of [-3.55,3.55]){b.add(x,.88,wingZ-.45,.10,1.95,.12,"#41474b");b.add(x,.88,wingZ+.50,.10,1.95,.12,"#41474b");b.add(x,.88,wingZ,1.86,.065,.065,"#596468",0,Math.PI/2.8);}
 }
 if(high)for(const x of [-2.15,2.15])b.add(x,.55,.6,.10,1.9,.12,"#6a8288",0,x>0?-.65:.65);
 const tailZ=-length*.38;for(let x=-2;x<=2;x+=.25)for(let z=-.55;z<=.5;z+=.25)b.add(x,.65+Math.abs(x)*.028,tailZ+z-(jet?Math.abs(x)*.35:0),.25,.13,.25,Math.abs(x)>1.5?p.accent:p.color);
 for(let y=.55;y<2.7;y+=.24){const chord=1.2*(1-(y-.55)/3);for(let z=-chord/2;z<=chord/2;z+=.24)b.add(0,y,tailZ+z-(y-.55)*.23,.20,.24,.24,y>2.05?p.accent:p.color);}
 if(p.style==="fighter"){for(const x of [-.9,.9])for(let y=.45;y<1.35;y+=.24)b.add(x,y,-3.0,.18,.24,1.05,p.accent,0,x*.25);}
 const solid=b.build(materialBank.aircraft,true);group.add(solid);
 // Stepped transparent canopy retains the voxel silhouette.
 const canopy=new THREE.Group();const canopyWidth=jet?.97:1.13;const canopyLength=jet?2.0:sporty?1.7:1.5;
 for(let i=0;i<6;i++){const z=.25+i*.24;const h=Math.sin((i+1)/7*Math.PI)*(jet?.66:.76);canopy.add(box(0,.65+h/2,z,canopyWidth,h,canopyLength/6,materialBank.glass));}
 canopy.add(box(0,1.1,1.25,1.05,.06,.08,materialBank.dark));group.add(canopy);
 if(p.style==="float"){
  const fb=new VoxelBatch();for(const x of [-1.25,1.25])for(let z=-3;z<3;z+=.24){const taper=.18+.42*Math.sin((z+3)/6*Math.PI);fb.add(x,-1.52,z,.73,taper,.24,z>2?p.accent:"#aeb7b4");}
  for(const x of [-1.25,1.25])for(const z of [-1.4,1.35])fb.add(x*.6,-.78,z,.10,1.1,.10,"#5c7379",0,x>0?.3:-.3);group.add(fb.build(materialBank.aircraft));
 }else{
  for(const x of [-1.04,1.04]){group.add(box(x,-.55,.75,.12,.95,.12,materialBank.dark));const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.32,.32,.24,12),materialBank.dark);wheel.rotation.z=Math.PI/2;wheel.position.set(x,-1.07,.75);wheel.castShadow=true;group.add(wheel);}
  const rear=new THREE.Mesh(new THREE.CylinderGeometry(.20,.20,.15,10),materialBank.dark);rear.rotation.z=Math.PI/2;rear.position.set(0,-.6,-2.6);group.add(rear);
 }
 if(!jet){
  propeller.position.set(0,.4,length/2+.04);
  for(const a of [0,Math.PI/2]){const blade=box(0,0,0,.20,2.55,.10,materialBank.dark);blade.rotation.z=a;propeller.add(blade);}
  propeller.add(box(0,0,.10,.34,.34,.4,materialBank.orange));group.add(propeller);
 }else{
  for(const x of (p.style==="fighter"?[0]:[-.45,.45])){
   const nozzle=box(x,.34,-length/2+.2,.64,.68,.5,materialBank.dark);group.add(nozzle);
   const flame=new THREE.Mesh(new THREE.ConeGeometry(.32,2.4,8),new THREE.MeshBasicMaterial({color:"#ffa66a",transparent:true,opacity:.7,depthWrite:false}));flame.rotation.x=-Math.PI/2;flame.position.set(x,.34,-length/2-.8);exhaust.add(flame);
  }group.add(exhaust);
 }
 const lights=new THREE.Group();
 for(const x of [-span,span]){const mat=new THREE.MeshBasicMaterial({color:x<0?"#ec6655":"#87deca"});const m=new THREE.Mesh(new THREE.BoxGeometry(.13,.13,.13),mat);m.position.set(x,wingY+.15,wingZ-(jet?span*.55:0));lights.add(m);}
 group.add(lights);
 group.userData={aircraftId:p.id,voxelCount:b.boxes.length};
 return {group,propeller,exhaust};
}
