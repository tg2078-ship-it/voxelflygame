import * as THREE from "three";
import {VoxelBatch,box,materialBank,placard} from "./voxels";
export function makeHangar(){
 const root=new THREE.Group(),b=new VoxelBatch(),lights=new VoxelBatch(),door=new THREE.Group();
 const floorMat=new THREE.MeshStandardMaterial({color:"#344953",metalness:.16,roughness:.48});
 const floor=box(0,-.35,0,76,.7,92,floorMat);root.add(floor);
 b.add(-30,11,0,1.6,22,54,"#263f4a");b.add(30,11,0,1.6,22,54,"#263f4a");b.add(0,11,-26,60,22,1.6,"#304d58");b.add(0,22,0,62,1.5,54,"#314a53");
 for(const x of [-27,-15,0,15,27]){b.add(x,21,0,.9,1.4,54,"#536872");for(let z=-20;z<26;z+=9){b.add(x,21,z,.6,.8,3,"#5b747a");lights.add(x,20.5,z,.35,.18,3,"#d7d6a9");}}
 for(const side of [-1,1])for(let z=-20;z<=20;z+=10){b.add(side*29,11,z,.9,22,.9,"#61787e");b.add(side*25,6.5,z,6,.7,.7,"#536f77");}
 b.add(0,20.8,27,62,2.7,2,"#536a73");for(const x of [-30,30])b.add(x,10.4,27,2.4,20.8,3,"#425d67");
 for(let z=-18;z<=70;z+=8){b.add(-9,.03,z,.12,.07,4,"#b49b69");b.add(9,.03,z,.12,.07,4,"#b49b69");}
 for(let x=-10;x<10;x+=2){b.add(x,.04,10,1,.08,2,"#bb9d62",-.55);b.add(x,.04,-8,1,.08,2,"#bb9d62",-.55);}
 const pad=new THREE.Mesh(new THREE.CylinderGeometry(8.8,9,.20,64),new THREE.MeshStandardMaterial({color:"#4c626c",metalness:.32,roughness:.4}));pad.position.y=.03;pad.receiveShadow=true;root.add(pad);
 const stripe=new THREE.Mesh(new THREE.RingGeometry(8.15,8.3,64),new THREE.MeshBasicMaterial({color:"#c0a36e",side:THREE.DoubleSide}));stripe.rotation.x=-Math.PI/2;stripe.position.y=.16;root.add(stripe);
 // Workshop fittings and cabinets are all 3D geometry.
 for(let z=-16;z<=16;z+=8){
  b.add(-25,1.8,z,4,3.6,5.8,"#435e65");b.add(-25,3.75,z,4.3,.3,6.1,"#7a918e");
  for(let dz=-2;dz<=2;dz+=2)b.add(-22.96,2,z+dz,.1,1.7,1.5,"#a3a993");
  b.add(25,1.3,z,4,2.6,5.8,"#5c736d");b.add(25,2.72,z,4.3,.24,6.2,"#b29c75");
 }
 for(let j=0;j<4;j++){b.add(-18,1+j*.43,-21,3,.3,1.6,"#b6baaa");b.add(18,.4+j*.6,-22,4,.55,3,"#64796d");}
 const doorB=new VoxelBatch();
 for(let y=1;y<20;y+=1.2){doorB.add(0,y,27.4,58,1.08,1.1,"#3b5661");doorB.add(0,y+.3,28.0,58,.06,.10,"#5c7279");}
 for(const x of [-24,-12,0,12,24])doorB.add(x,10,28.06,.10,19,.12,"#87988f");
 door.add(doorB.build(materialBank.solid));root.add(door);
 const label=placard("AIRRUN  /  HANGAR 01",21,1.8,"#354f58","#c8bd94");label.position.set(0,22.6,28.2);root.add(label);
 const stencil=placard("01",8,4,"#304d58","#91a59e");stencil.position.set(-16,8,-25.05);stencil.rotation.y=0;root.add(stencil);
 const exit=placard("FLIGHT LINE",9,1.5,"#2c444c","#b6c5aa");exit.position.set(15,5.5,-25.1);exit.rotation.y=0;root.add(exit);
 // Outside apron and runway.
 b.add(0,-.35,120,58,.7,190,"#4a6468");
 for(let z=38;z<206;z+=13)b.add(0,.04,z,1.1,.08,6.4,"#d7d4af");
 for(const x of [-26,26])for(let z=38;z<208;z+=13)lights.add(x,.25,z,.38,.18,.38,"#efcd86");
 root.add(b.build(materialBank.solid),lights.build(materialBank.window,false));
 const lightA=new THREE.PointLight("#ffd99a",65,45,2);lightA.position.set(0,10,4);root.add(lightA);
 const lightB=new THREE.PointLight("#95d6de",45,40,2);lightB.position.set(-10,6,-6);root.add(lightB);
 return {root,door,floorMat};
}
