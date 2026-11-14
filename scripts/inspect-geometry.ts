/** Offline geometry inspection. Uses the game's real meshes and cameras; does not claim browser rendering or FPS. */
import {mkdir,writeFile} from 'node:fs/promises';
import {createCanvas} from '@napi-rs/canvas';
import * as T from 'three';
import {UNIT_BOX} from '../app/game/voxels';
import {AIRCRAFT,THEMES,freshSave,themeTimeline} from '../app/game/data';
import {useGame} from '../app/game/store';
import {FlightEngine,physicsReady} from '../app/game/engine';
import {makeChunk} from '../app/game/world';
(globalThis as unknown as {document:object}).document={createElement:()=>createCanvas(512,128)};
await physicsReady();await mkdir('.sites-runtime/qa/geometry',{recursive:true});
const renderer={shadowMap:{type:0,enabled:false},toneMapping:0,toneMappingExposure:1} as unknown as T.WebGLRenderer;
const configs=[{name:'hangar',phase:'hangar',plane:0,theme:0,time:38,z:0},{name:'coast',phase:'flying',plane:0,theme:0,time:45,z:330},{name:'village',phase:'flying',plane:2,theme:1,time:220,z:410},{name:'city-night',phase:'flying',plane:5,theme:2,time:500,z:460},{name:'glacier',phase:'flying',plane:7,theme:3,time:38,z:350},{name:'waterfall',phase:'flying',plane:4,theme:12,time:45,z:380}];
for(const cfg of configs){
 const save=freshSave();save.selected=cfg.plane;save.settings.volume=0;useGame.setState({save,phase:'menu'});
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(58,16/9,.2,5000),engine=new FlightEngine(scene,camera,renderer);
 if(cfg.phase==='hangar'){
  useGame.setState({phase:'hangar'});for(let i=0;i<180;i++)engine.update(1/60);camera.fov=48;camera.updateProjectionMatrix();camera.position.set(-12,5.5,13);camera.lookAt(-2.5,1.7,0);
 }else{
  engine.world.clear();engine.hangar.root.visible=false;engine.position.set(0,23,cfg.z);engine.model.group.position.copy(engine.position);
  for(let i=Math.floor(cfg.z/128)-2;i<Math.floor(cfg.z/128)+11;i++){const chunk=makeChunk(i,THEMES[cfg.theme],173018,'high');engine.world.root.add(chunk.group);engine.world.chunks.set(i,chunk);}
  engine.world.update(cfg.time,0);for(const chunk of engine.world.chunks.values())for(const item of chunk.pickups)if(item.z<cfg.z-3)item.mesh.visible=false;camera.position.set(0,28.8,cfg.z-23);camera.lookAt(0,24.8,cfg.z+28);camera.updateMatrixWorld();
  for(let i=0;i<180;i++)(scene.fog as T.Fog).color.copy(engine.atmosphere.update(1/60,cfg.time,camera,engine.position,THEMES[cfg.theme],'high')); 
 }
 scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
 const boxes:number[]=[],triangles:number[]=[],transparent:number[]=[];let meshCount=0;
 const mat=new T.Matrix4(),im=new T.Matrix4(),color=new T.Color(),point=new T.Vector3(),normal=new T.Vector3(),normalMat=new T.Matrix3();
 const pushBox=(matrix:T.Matrix4,c:T.Color,e:T.Color,m:T.Material,cast:boolean)=>boxes.push(...matrix.elements,c.r,c.g,c.b,e.r*c.r,e.g*c.g,e.b*c.b,(m as T.MeshStandardMaterial).roughness??.8,m.opacity,cast?1:0);
 scene.traverseVisible(o=>{
  if(!(o instanceof T.Mesh)||o===engine.atmosphere.sky||o===engine.atmosphere.water||o===engine.atmosphere.aurora)return;
  const material=(Array.isArray(o.material)?o.material[0]:o.material) as T.MeshStandardMaterial;
  const base=material.color??new T.Color('#a9c7c8'),em=(material.emissive??new T.Color(0)).clone().multiplyScalar(material.emissiveIntensity??0);
  meshCount++;
  if(o instanceof T.InstancedMesh&&o.geometry===UNIT_BOX){
   for(let i=0;i<o.count;i++){o.getMatrixAt(i,im);mat.multiplyMatrices(o.matrixWorld,im);color.copy(base);if(o.instanceColor){o.getColorAt(i,color);color.multiply(base);}pushBox(mat,color,em,material,o.castShadow);}
  }else if(o.geometry===UNIT_BOX&&!material.transparent)pushBox(o.matrixWorld,base,em,material,o.castShadow);
  else{
   const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry,pos=g.getAttribute('position'),norm=g.getAttribute('normal'),destination=material.transparent?transparent:triangles;normalMat.getNormalMatrix(o.matrixWorld);
   for(let i=0;i<pos.count;i++){point.fromBufferAttribute(pos,i).applyMatrix4(o.matrixWorld);if(norm)normal.fromBufferAttribute(norm,i).applyMatrix3(normalMat).normalize();else normal.set(0,1,0);destination.push(point.x,point.y,point.z,normal.x,normal.y,normal.z,base.r,base.g,base.b,em.r,em.g,em.b,material.roughness??.8,material.opacity,o.castShadow?1:0);}
   if(g!==o.geometry)g.dispose();
  }
 });
 const dir=engine.atmosphere.sun.position.clone().sub(engine.atmosphere.sun.target.position).normalize(),fog=(scene.fog as T.Fog).color;
 const meta={name:cfg.name,width:1600,height:900,view:camera.matrixWorldInverse.elements,projection:camera.projectionMatrix.elements,camera:camera.position.toArray(),sunDir:dir.toArray(),sun:engine.atmosphere.sun.color.toArray(),sunIntensity:engine.atmosphere.sun.intensity,ambient:engine.atmosphere.ambient.color.toArray(),ambientIntensity:engine.atmosphere.ambient.intensity,groundLight:engine.atmosphere.ambient.groundColor.toArray(),fog:fog.toArray(),night:engine.atmosphere.night,sky:engine.atmosphere.skyMat.uniforms.uSky.value.toArray(),weather:engine.atmosphere.weather,water:engine.atmosphere.water.visible,meshCount,instances:boxes.length/25,triangles:triangles.length/45};
 const target='.sites-runtime/qa/geometry/'+cfg.name;
 await writeFile(target+'.json',JSON.stringify(meta));await writeFile(target+'-boxes.bin',new Uint8Array(new Float32Array(boxes).buffer));await writeFile(target+'-triangles.bin',new Uint8Array(new Float32Array(triangles).buffer));await writeFile(target+'-alpha.bin',new Uint8Array(new Float32Array(transparent).buffer));
 console.log(cfg.name,meta.instances,'instances',meshCount,'meshes');engine.dispose();
}
