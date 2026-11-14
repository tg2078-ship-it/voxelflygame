import * as THREE from "three";
export const UNIT_BOX=new THREE.BoxGeometry(1,1,1);
export const COLORS={steel:"#364952",floor:"#293b43",orange:"#e59248",glass:"#69b4bc"};
export const materialBank={
 solid:new THREE.MeshStandardMaterial({roughness:.86,metalness:.04,vertexColors:true}),
 aircraft:new THREE.MeshStandardMaterial({roughness:.35,metalness:.26,vertexColors:true}),
 window:new THREE.MeshStandardMaterial({vertexColors:true,color:"#ffffff",emissive:"#ffb853",emissiveIntensity:.05,roughness:.3,metalness:.12}),
 glass:new THREE.MeshPhysicalMaterial({color:"#749dae",roughness:.08,metalness:.18,transparent:true,opacity:.76,clearcoat:1,depthWrite:true}),
 dark:new THREE.MeshStandardMaterial({color:"#1d303c",roughness:.64,metalness:.45}),
 white:new THREE.MeshStandardMaterial({color:"#e5e3ce",roughness:.74}),
 orange:new THREE.MeshStandardMaterial({color:"#e28a43",roughness:.45,metalness:.15}),
};
// Instance colour also controls emission, preserving unlit windows after dusk.
materialBank.window.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace("#include <emissivemap_fragment>","#include <emissivemap_fragment>\n#if defined(USE_COLOR) || defined(USE_INSTANCING_COLOR)\ntotalEmissiveRadiance *= vColor.rgb;\n#endif");};
materialBank.window.customProgramCacheKey=()=>"window-emission-v1";
interface Box {x:number;y:number;z:number;sx:number;sy:number;sz:number;color:THREE.Color;rx:number;ry:number;rz:number;}
export class VoxelBatch{
 boxes:Box[]=[];
 add(x:number,y:number,z:number,sx:number,sy:number,sz:number,color:string|number,ry=0,rz=0,rx=0){
  this.boxes.push({x,y,z,sx,sy,sz,color:new THREE.Color(color),rx,ry,rz});return this;
 }
 build(material:THREE.Material=materialBank.solid,shadow=true){
  const mesh=new THREE.InstancedMesh(UNIT_BOX,material,this.boxes.length);const dummy=new THREE.Object3D();
  this.boxes.forEach((b,i)=>{dummy.position.set(b.x,b.y,b.z);dummy.scale.set(b.sx,b.sy,b.sz);dummy.rotation.set(b.rx,b.ry,b.rz);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,b.color);});
  mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
  mesh.castShadow=shadow;mesh.receiveShadow=true;mesh.computeBoundingSphere();return mesh;
 }
}
export function box(x:number,y:number,z:number,sx:number,sy:number,sz:number,mat:THREE.Material){
 const m=new THREE.Mesh(UNIT_BOX,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;m.receiveShadow=true;return m;
}
export function textTexture(label:string,bg="#18343e",fg="#eadfc6",width=512,height=128){
 const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;const c=canvas.getContext("2d")!;c.fillStyle=bg;c.fillRect(0,0,width,height);c.fillStyle=fg;c.textAlign="center";c.textBaseline="middle";c.font="700 "+Math.floor(height*.44)+"px Arial";c.fillText(label,width/2,height/2,width*.94);
 const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;return t;
}
export function placard(label:string,width:number,height:number,bg?:string,fg?:string){
 const texture=textTexture(label,bg,fg);const m=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshStandardMaterial({map:texture,roughness:.56,emissive:"#b3c4ba",emissiveMap:texture,emissiveIntensity:.15,side:THREE.DoubleSide}));return m;
}
export function disposeGroup(group:THREE.Object3D){
 const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
 const shared=new Set<THREE.Material>(Object.values(materialBank));
 group.traverse(o=>{if(o instanceof THREE.InstancedMesh)o.dispose();if(o instanceof THREE.Mesh||o instanceof THREE.Points||o instanceof THREE.Line){if(o.geometry!==UNIT_BOX)geometries.add(o.geometry);for(const m of (Array.isArray(o.material)?o.material:[o.material]))if(!shared.has(m))materials.add(m);}});
 for(const g of geometries)g.dispose();for(const m of materials){const mm=m as THREE.MeshStandardMaterial;if(mm.map)mm.map.dispose();m.dispose();}
}
