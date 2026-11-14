#!/usr/bin/env python3
"""Prepare the attached AeroForge pack without changing its original archive.

Runtime geometry keeps every source triangle, per-vertex colour, material,
authored pivot and animation key. 16-bit positions have a recorded small error.
Meshopt-encoded GLB files are transported in standard deterministic gzip.
Gameplay proxies are deliberately inscribed subsets of source occupied cuboids,
never enclosing AABBs that fill an arch or hangar entrance.
"""
from __future__ import annotations

import argparse
import collections
import gzip
import json
import math
from pathlib import Path
import struct
import subprocess
import zipfile

import numpy as np

NODE_ENCODER = r"""
import fs from 'node:fs';
import path from 'node:path';
import {MeshoptEncoder} from '/workspace/sites/voxel-airrun/node_modules/.pnpm/meshoptimizer@1.1.1/node_modules/meshoptimizer/meshopt_encoder.js';
import {MeshoptDecoder} from '/workspace/sites/voxel-airrun/node_modules/.pnpm/meshoptimizer@1.1.1/node_modules/meshoptimizer/meshopt_decoder.mjs';
await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
const sizes={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
const widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
const types={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array};

function optimize(srcFile,dstFile){
 const src=fs.readFileSync(srcFile),jlen=src.readUInt32LE(12);
 const input=JSON.parse(src.subarray(20,20+jlen)),bin=src.subarray(28+jlen);
 const json=structuredClone(input),chunks=[],accessors=[],views=[];
 let offset=0,fallback=0,maxPositionError=0,vertices=0,triangles=0;
 const read=ai=>{
  const a=input.accessors[ai],v=input.bufferViews[a.bufferView],w=widths[a.type],C=types[a.componentType];
  const bytes=new Uint8Array(bin.subarray((v.byteOffset??0)+(a.byteOffset??0),(v.byteOffset??0)+(a.byteOffset??0)+a.count*w*sizes[a.componentType]));
  return new C(bytes.buffer,bytes.byteOffset,a.count*w);
 };
 const write=(raw,count,stride,accessor,mode='ATTRIBUTES',target)=>{
  const encoded=MeshoptEncoder.encodeGltfBuffer(raw,count,stride,mode);
  const decoded=new Uint8Array(raw.length);MeshoptDecoder.decodeGltfBuffer(decoded,count,stride,encoded,mode);
  if(mode==='ATTRIBUTES'&&!Buffer.from(decoded).equals(Buffer.from(raw)))throw new Error('Attribute roundtrip mismatch');
  if(mode==='TRIANGLES'){
   const C=stride===2?Uint16Array:Uint32Array;
   const a=new C(raw.buffer,raw.byteOffset,raw.length/stride),b=new C(decoded.buffer,decoded.byteOffset,decoded.length/stride);
   for(let i=0;i<a.length;i+=3){
    let ok=false;for(let r=0;r<3;r++)if(a[i]===b[i+r]&&a[i+1]===b[i+(r+1)%3]&&a[i+2]===b[i+(r+2)%3])ok=true;
    if(!ok)throw new Error('Triangle winding mismatch');
   }
  }
  const pad=(4-offset%4)%4;if(pad){chunks.push(Buffer.alloc(pad));offset+=pad;}
  const fi=(4-fallback%4)%4;
  const v={buffer:1,byteOffset:fallback+fi,byteLength:raw.length,extensions:{EXT_meshopt_compression:{buffer:0,byteOffset:offset,byteLength:encoded.length,byteStride:stride,count,mode}}};
  if(target)v.target=target;
  if(mode==='ATTRIBUTES'&&target)v.byteStride=stride;
  chunks.push(Buffer.from(encoded));offset+=encoded.length;fallback+=fi+raw.length;
  const vi=views.length;views.push(v);
  const ai=accessors.length;accessors.push({...accessor,bufferView:vi,byteOffset:0,count});return ai;
 };
 const newMeshes=[];
 for(let mi=0;mi<input.meshes.length;mi++){
  const mesh=input.meshes[mi],bmin=[Infinity,Infinity,Infinity],bmax=[-Infinity,-Infinity,-Infinity];
  const hasMorph=mesh.primitives.some(p=>p.targets?.length);
  for(const p of mesh.primitives){const a=input.accessors[p.attributes.POSITION];for(let k=0;k<3;k++){bmin[k]=Math.min(bmin[k],a.min[k]);bmax[k]=Math.max(bmax[k],a.max[k]);}}
  const scale=Math.max(...bmax.map((v,k)=>v-bmin[k]))/65535||1;
  const primitives=[];
  for(const primitive of mesh.primitives){
   const sourceIndex=read(primitive.indices),index=new Uint32Array(sourceIndex);
   const [remap,unique]=MeshoptEncoder.reorderMesh(index,true,true);
   vertices+=unique;triangles+=index.length/3;
   const attributes={};
   for(const [semantic,oldAi] of Object.entries(primitive.attributes)){
    const oldA=input.accessors[oldAi],source=read(oldAi),w=widths[oldA.type];
    if(semantic==='POSITION'&&hasMorph){
     const out=new Float32Array(unique*3),mins=[Infinity,Infinity,Infinity],maxs=[-Infinity,-Infinity,-Infinity];
     for(let i=0;i<remap.length;i++)if(remap[i]!==0xffffffff)for(let k=0;k<3;k++){
      const v=source[i*3+k];out[remap[i]*3+k]=v;mins[k]=Math.min(mins[k],v);maxs[k]=Math.max(maxs[k],v);
     }
     attributes[semantic]=write(new Uint8Array(out.buffer),unique,12,{componentType:5126,type:'VEC3',min:mins,max:maxs},'ATTRIBUTES',34962);
    }else if(semantic==='POSITION'){
     const out=new Uint16Array(unique*4),mins=[65535,65535,65535],maxs=[0,0,0];
     for(let i=0;i<remap.length;i++)if(remap[i]!==0xffffffff){
      const r=remap[i];for(let k=0;k<3;k++){
       const q=Math.min(65535,Math.max(0,Math.round((source[i*3+k]-bmin[k])/scale)));
       out[r*4+k]=q;mins[k]=Math.min(mins[k],q);maxs[k]=Math.max(maxs[k],q);
       maxPositionError=Math.max(maxPositionError,Math.abs(bmin[k]+q*scale-source[i*3+k]));
      }
     }
     attributes[semantic]=write(new Uint8Array(out.buffer),unique,8,{componentType:5123,type:'VEC3',min:mins,max:maxs},'ATTRIBUTES',34962);
    }else if(semantic==='NORMAL'){
     const cardinal=source.every(v=>v===0||v===1||v===-1);
     if(cardinal){
      const out=new Int8Array(unique*4);
      for(let i=0;i<remap.length;i++)if(remap[i]!==0xffffffff)for(let k=0;k<3;k++)out[remap[i]*4+k]=source[i*3+k]*127;
      attributes[semantic]=write(new Uint8Array(out.buffer),unique,4,{componentType:5120,type:'VEC3',normalized:true},'ATTRIBUTES',34962);
     }else{
      const out=new Float32Array(unique*w);for(let i=0;i<remap.length;i++)if(remap[i]!==0xffffffff)for(let k=0;k<w;k++)out[remap[i]*w+k]=source[i*w+k];
      attributes[semantic]=write(new Uint8Array(out.buffer),unique,w*4,{componentType:5126,type:oldA.type},'ATTRIBUTES',34962);
     }
    }else{
     const C=types[oldA.componentType],out=new C(unique*w);
     for(let i=0;i<remap.length;i++)if(remap[i]!==0xffffffff)for(let k=0;k<w;k++)out[remap[i]*w+k]=source[i*w+k];
     const stride=w*sizes[oldA.componentType];if(stride%4)throw new Error('Unaligned semantic '+semantic);
     const a={componentType:oldA.componentType,type:oldA.type};if(oldA.normalized)a.normalized=true;
     attributes[semantic]=write(new Uint8Array(out.buffer),unique,stride,a,'ATTRIBUTES',34962);
    }
   }
   const indexOut=unique<=65535?new Uint16Array(index):index;
   const ai=write(new Uint8Array(indexOut.buffer),index.length,indexOut.BYTES_PER_ELEMENT,{componentType:unique<=65535?5123:5125,type:'SCALAR'},'TRIANGLES',34963);
   const nextPrimitive={...primitive,attributes,indices:ai};
   if(primitive.targets){
    nextPrimitive.targets=primitive.targets.map(target=>{
     const outTarget={};
     for(const [semantic,oldAi] of Object.entries(target)){
      const oldA=input.accessors[oldAi],source=read(oldAi),w=widths[oldA.type],out=new Float32Array(unique*w);
      const mins=Array(w).fill(Infinity),maxs=Array(w).fill(-Infinity);
      for(let i=0;i<remap.length;i++)if(remap[i]!==0xffffffff)for(let k=0;k<w;k++){
       const v=source[i*w+k];out[remap[i]*w+k]=v;mins[k]=Math.min(mins[k],v);maxs[k]=Math.max(maxs[k],v);
      }
      const a={componentType:5126,type:oldA.type};if(semantic==='POSITION'){a.min=mins;a.max=maxs;}
      outTarget[semantic]=write(new Uint8Array(out.buffer),unique,w*4,a,'ATTRIBUTES',34962);
     }
     return outTarget;
    });
   }
   primitives.push(nextPrimitive);
  }
  newMeshes.push({...mesh,primitives});
  // Keep authored pivot nodes unchanged. Decode transforms live on mesh children.
  for(let ni=0;ni<input.nodes.length;ni++)if(input.nodes[ni].mesh===mi&&!hasMorph){
   const n=json.nodes[ni];delete n.mesh;const child=json.nodes.length;
   json.nodes.push({name:(n.name??'part')+'_quantized_surface',mesh:mi,translation:bmin,scale:[scale,scale,scale],extras:{role:'quantized_surface'}});
   n.children=[...(n.children??[]),child];
  }
 }
 const oldAiMap=new Map();
 const copyAccessor=oldAi=>{
  if(oldAiMap.has(oldAi))return oldAiMap.get(oldAi);
  const oldA=input.accessors[oldAi],raw=read(oldAi),stride=widths[oldA.type]*sizes[oldA.componentType];
  const a=structuredClone(oldA);delete a.bufferView;delete a.byteOffset;delete a.count;
  const ai=write(new Uint8Array(raw.buffer,raw.byteOffset,raw.byteLength),oldA.count,stride,a);
  oldAiMap.set(oldAi,ai);return ai;
 };
 for(const animation of json.animations??[])for(const sampler of animation.samplers){sampler.input=copyAccessor(sampler.input);sampler.output=copyAccessor(sampler.output);}
 json.meshes=newMeshes;json.accessors=accessors;json.bufferViews=views;
 json.buffers=[{byteLength:offset},{byteLength:fallback,extensions:{EXT_meshopt_compression:{fallback:true}}}];
 json.extensionsUsed=[...new Set([...(json.extensionsUsed??[]),'KHR_mesh_quantization','EXT_meshopt_compression'])];
 json.extensionsRequired=[...new Set([...(json.extensionsRequired??[]),'KHR_mesh_quantization','EXT_meshopt_compression'])];
 json.asset.generator+=' / runtime meshopt+16bit quantization (authored pivots preserved)';
 const js=Buffer.from(JSON.stringify(json));const jp=(4-js.length%4)%4;
 const binary=Buffer.concat(chunks);const bp=(4-binary.length%4)%4;
 const total=12+8+js.length+jp+8+binary.length+bp;
 const head=Buffer.alloc(20);head.write('glTF');head.writeUInt32LE(2,4);head.writeUInt32LE(total,8);head.writeUInt32LE(js.length+jp,12);head.write('JSON',16);
 const bh=Buffer.alloc(8);bh.writeUInt32LE(binary.length+bp);bh.writeUInt32LE(0x004e4942,4);
 fs.mkdirSync(path.dirname(dstFile),{recursive:true});fs.writeFileSync(dstFile,Buffer.concat([head,js,Buffer.alloc(jp,32),bh,binary,Buffer.alloc(bp)]));
 return {source:src.length,optimized:total,ratio:total/src.length,maxPositionError,colorsExact:true,normalsExact:true,animationsExact:true,vertices,triangles};
}
if(process.argv[2].endsWith('.json')){
 const jobs=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),stats=[];
 for(let i=0;i<jobs.length;i++){
  const job=jobs[i];stats.push({...job,...optimize(job.sourceFile,job.destFile)});
  if(i%20===0)console.log('Optimized '+(i+1)+'/'+jobs.length);
 }
 fs.writeFileSync(process.argv[3],JSON.stringify(stats,null,2));
}else console.log(JSON.stringify(optimize(process.argv[2],process.argv[3])));
"""

ENVELOPE_NODE = r"""
import fs from 'node:fs';
import path from 'node:path';
import {GLTFLoader} from '/workspace/sites/voxel-airrun/node_modules/.pnpm/three@0.186.1/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {Vector3,Quaternion,Matrix4,QuaternionKeyframeTrack,VectorKeyframeTrack} from '/workspace/sites/voxel-airrun/node_modules/.pnpm/three@0.186.1/node_modules/three/build/three.module.js';

const modelDir=process.argv[2]??'/workspace/sites/voxel-airrun/public/models';
const sourceDir=process.argv[3]??'/workspace/scratch/aa6be72e6984/asset-audit/source';
const reportFile=process.argv[4]??'/workspace/scratch/aa6be72e6984/asset-audit/envelope-validation.json';
const catalog=JSON.parse(fs.readFileSync(path.join(modelDir,'catalog.json'),'utf8'));
const loader=new GLTFLoader(),phases=48;
const stats={models:0,boxes:0,minPhasesPerClip:phases,cartesianPoseSamples:0,keyframePoseSamples:0,validationPoseSamples:0,cornerChecks:0,failures:0,maxGuardM:0,modelsDetail:[],method:'Independent relevant ancestor-clip phases + full source hierarchy + analytic velocity guard'};
let randomState=0x7646f2a1;
function random(){randomState^=randomState<<13;randomState^=randomState>>>17;randomState^=randomState<<5;return(randomState>>>0)/4294967296;}
function boxCorners(box){
 const out=[],q=new Quaternion().fromArray(box.q??[0,0,0,1]);
 for(let x=-1;x<=1;x+=2)for(let y=-1;y<=1;y+=2)for(let z=-1;z<=1;z+=2)out.push(new Vector3(x*box.s[0]/2,y*box.s[1]/2,z*box.s[2]/2).applyQuaternion(q).add(new Vector3().fromArray(box.c)));
 return out;
}
const readAccessor=(j,bin,index)=>{
 const a=j.accessors[index],v=j.bufferViews[a.bufferView];
 const w={SCALAR:1,VEC3:3,VEC4:4}[a.type];
 if(a.componentType!==5126)throw new Error('Expected floating animation data');
 const bytes=new Uint8Array(bin.subarray((v.byteOffset??0)+(a.byteOffset??0),(v.byteOffset??0)+(a.byteOffset??0)+a.count*w*4));
 return new Float32Array(bytes.buffer,bytes.byteOffset,a.count*w);
};

for(const asset of catalog.assets){
 const proxyPath=path.join(modelDir,asset.proxy.replace(/^\/models\//,''));
 const original=fs.readFileSync(proxyPath,'utf8'),proxy=JSON.parse(original);
 if(!proxy.dynamic.length)continue;
 const originalStatic=JSON.stringify(proxy.static),originalDynamic=proxy.dynamic.map(d=>JSON.stringify(Object.fromEntries(Object.entries(d).filter(([k])=>k!=='envelope'))));
 const sourcePath=path.join(sourceDir,asset.exports.lod1.replace(/^\/models\//,'').replace(/\.gz$/,''));
 const bytes=fs.readFileSync(sourcePath),jl=bytes.readUInt32LE(12),j=JSON.parse(bytes.subarray(20,20+jl)),bin=bytes.subarray(28+jl);
 const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const objects=await Promise.all(j.nodes.map((_node,index)=>gltf.parser.getDependency('node',index)));
 const root=objects.find((_o,index)=>j.nodes[index].name===asset.id)??gltf.scene;
 const indexByObject=new Map(objects.map((o,i)=>[o,i]));
 const defaults=objects.map(o=>({p:o.position.clone(),q:o.quaternion.clone(),s:o.scale.clone()}));
 const maxTranslation=defaults.map(d=>d.p.length()),maxScale=defaults.map(d=>Math.max(Math.abs(d.s.x),Math.abs(d.s.y),Math.abs(d.s.z)));
 const clips=(j.animations??[]).map(a=>{
  const channels=a.channels.map(channel=>{
   const sampler=a.samplers[channel.sampler];
   if((sampler.interpolation??'LINEAR')!=='LINEAR')throw new Error('Unsupported envelope interpolation '+sampler.interpolation);
   const times=readAccessor(j,bin,sampler.input),values=readAccessor(j,bin,sampler.output),nodeIndex=channel.target.node,property=channel.target.path;
   const keyTimes=Array.from(times);
   if(property==='weights')return{nodeIndex,property,keyTimes,duration:times.at(-1),speed:0};
   const track=property==='rotation'?new QuaternionKeyframeTrack('pose',times,values):new VectorKeyframeTrack('pose',times,values);
   const interpolant=track.createInterpolant();
   const width=property==='rotation'?4:3;
   let speed=0;
   for(let i=0;i<times.length;i++){
    const v=values.subarray(i*width,(i+1)*width);
    if(property==='translation')maxTranslation[nodeIndex]=Math.max(maxTranslation[nodeIndex],Math.hypot(...v));
    if(property==='scale')maxScale[nodeIndex]=Math.max(maxScale[nodeIndex],...Array.from(v,Math.abs));
    if(i){
     const previous=values.subarray((i-1)*width,i*width),dt=times[i]-times[i-1];
     if(!(dt>0))throw new Error('Non-increasing clip keys');
     if(property==='rotation'){
      const p=new Quaternion().fromArray(previous).normalize(),q=new Quaternion().fromArray(v).normalize();
      speed=Math.max(speed,2*Math.acos(Math.min(1,Math.abs(p.dot(q))))/dt);
     }else if(property==='translation')speed=Math.max(speed,Math.hypot(...Array.from(v,(x,k)=>x-previous[k]))/dt);
     else speed=Math.max(speed,...Array.from(v,(x,k)=>Math.abs(x-previous[k])/dt));
    }
   }
   return{nodeIndex,property,keyTimes,duration:times.at(-1),speed,interpolant};
  });
  return{name:a.name,channels,duration:Math.max(...channels.map(c=>c.duration)),autoplay:asset.animations.find(info=>info.name===a.name)?.autoplay??false};
 });
 function restore(){for(let i=0;i<objects.length;i++){const o=objects[i],d=defaults[i];o.position.copy(d.p);o.quaternion.copy(d.q);o.scale.copy(d.s);}}
 function apply(clip,time){
  for(const c of clip.channels){
   if(c.property==='weights')continue;
   const value=c.interpolant.evaluate(time),o=objects[c.nodeIndex];
   if(c.property==='rotation')o.quaternion.fromArray(value);
   else if(c.property==='translation')o.position.fromArray(value);
   else o.scale.fromArray(value);
  }
 }
 const groups=new Map();
 for(let i=0;i<proxy.dynamic.length;i++){
  const b=proxy.dynamic[i];if(!groups.has(b.node))groups.set(b.node,[]);
  groups.get(b.node).push({box:b,index:i,corners:boxCorners(b),min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]});
 }
 const detail={id:asset.id,dynamicBoxes:proxy.dynamic.length,groups:[],maxGuardM:0,largestEnvelope:null};
 for(const[nodeName,entries]of groups){
  const leaf=objects[j.nodes.findIndex(n=>n.name===nodeName)];if(!leaf)throw new Error('Missing dynamic pivot '+asset.id+'/'+nodeName);
  const chain=[];let node=leaf;
  while(node&&node!==gltf.scene){if(indexByObject.has(node))chain.push(indexByObject.get(node));if(node===root)break;node=node.parent;}
  const ancestorSet=new Set(chain),relevant=clips.filter(c=>c.channels.some(ch=>ancestorSet.has(ch.nodeIndex)));
  // All channels in a single clip share its phase; separate clip phases are
  // combined to contain every reachable synchronized run, even with offsets.
  const groupInfo={node:nodeName,clips:relevant.map(c=>c.name),phaseCombinations:Math.pow(phases+1,relevant.length),guardMaxM:0};
  detail.groups.push(groupInfo);
  const parentScale=new Map();let parentProduct=1;
  for(let i=chain.length-1;i>=0;i--){parentScale.set(chain[i],parentProduct);parentProduct*=maxScale[chain[i]];}
  for(const entry of entries){
   const radius=new Map();let r=Math.max(...entry.corners.map(c=>c.length()));
   for(const index of chain){radius.set(index,r);r=maxTranslation[index]+maxScale[index]*r;}
   let guard=.002;
   for(const clip of relevant){
    let velocity=0;
    for(const c of clip.channels){
     if(!ancestorSet.has(c.nodeIndex))continue;
     const before=parentScale.get(c.nodeIndex),localRadius=radius.get(c.nodeIndex);
     if(c.property==='rotation')velocity+=before*maxScale[c.nodeIndex]*localRadius*c.speed;
     else if(c.property==='translation')velocity+=before*c.speed;
     else if(c.property==='scale')velocity+=before*localRadius*c.speed;
     // Morph targets deform geometry rather than pivot matrices; include the
     // full authored additive displacement range as a separate safe guard.
     else if(c.property==='weights'){
      const mesh=j.meshes[j.nodes[c.nodeIndex].mesh];
      let displacement=0;
      for(const target of mesh.primitives[0].targets??[]){
       if(target.POSITION===undefined)continue;
       const a=j.accessors[target.POSITION];
       displacement+=Math.hypot(...a.min.map((v,k)=>Math.max(Math.abs(v),Math.abs(a.max[k]))));
      }
      guard+=before*maxScale[c.nodeIndex]*displacement;
     }
    }
    guard+=velocity*clip.duration/(2*phases);
   }
   entry.guard=guard;
   groupInfo.guardMaxM=Math.max(groupInfo.guardMaxM,guard);detail.maxGuardM=Math.max(detail.maxGuardM,guard);stats.maxGuardM=Math.max(stats.maxGuardM,guard);
  }
  const matrix=new Matrix4(),inverse=new Matrix4(),point=new Vector3();
  function measure(validate=false){
   root.updateWorldMatrix(true,false);inverse.copy(root.matrixWorld).invert();leaf.updateWorldMatrix(true,false);matrix.copy(leaf.matrixWorld).premultiply(inverse);
   for(const entry of entries)for(const corner of entry.corners){
    point.copy(corner).applyMatrix4(matrix);const v=[point.x,point.y,point.z];
    for(let k=0;k<3;k++){
     if(validate){if(v[k]<entry.envelope.min[k]-1e-7||v[k]>entry.envelope.max[k]+1e-7)throw new Error('Envelope missed corner '+asset.id+'/'+nodeName);}
     else{entry.min[k]=Math.min(entry.min[k],v[k]);entry.max[k]=Math.max(entry.max[k],v[k]);}
    }
    if(validate)stats.cornerChecks++;
   }
  }
  restore();measure();
  function enumerate(index){
   if(index===relevant.length){measure();stats.cartesianPoseSamples++;return;}
   const clip=relevant[index];
   for(let phase=0;phase<=phases;phase++){apply(clip,clip.duration*phase/phases);enumerate(index+1);}
  }
  enumerate(0);
  // Sample each authored key at several baseline phases of other clips. The
  // analytic speed guard already covers all times between the Cartesian grid.
  for(let c=0;c<relevant.length;c++)for(const key of new Set(relevant[c].channels.flatMap(ch=>ch.keyTimes)))for(const phase of [0,.25,.5,.75,1]){
   relevant.forEach((clip,k)=>apply(clip,k===c?key:clip.duration*phase));measure();stats.keyframePoseSamples++;
  }
  for(const entry of entries){
   const lo=entry.min.map(v=>Math.floor((v-entry.guard)*1000)/1000),hi=entry.max.map(v=>Math.ceil((v+entry.guard)*1000)/1000);
   const c=lo.map((v,k)=>Math.round((v+hi[k])*500)/1000),s=lo.map((v,k)=>Math.ceil((hi[k]-v+.002)*1000)/1000);
   entry.box.envelope={c,s};entry.envelope={min:c.map((v,k)=>v-s[k]/2),max:c.map((v,k)=>v+s[k]/2)};
   const volume=s[0]*s[1]*s[2];
   if(!detail.largestEnvelope||volume>detail.largestEnvelope.volume)detail.largestEnvelope={node:nodeName,c,s,volume};
  }
  // Independently chosen off-grid phases check ancestor composition and bounds.
  for(let sample=0;sample<1024;sample++){
   restore();relevant.forEach(clip=>apply(clip,clip.duration*random()));measure(true);stats.validationPoseSamples++;
  }
  // Also check synchronized game time across many cycles of every rig clip.
  const maxDuration=Math.max(1,...relevant.map(c=>c.duration));
  for(let sample=0;sample<512;sample++){
   restore();const t=maxDuration*17*(sample+.381)/512;relevant.forEach(clip=>apply(clip,t%clip.duration));measure(true);stats.validationPoseSamples++;
  }
 }
 if(JSON.stringify(proxy.static)!==originalStatic)throw new Error('Static proxy changed');
 if(proxy.dynamic.some((d,i)=>JSON.stringify(Object.fromEntries(Object.entries(d).filter(([k])=>k!=='envelope')))!==originalDynamic[i]))throw new Error('Source dynamic fields changed');
 fs.writeFileSync(proxyPath,JSON.stringify(proxy));
 stats.models++;stats.boxes+=proxy.dynamic.length;stats.modelsDetail.push(detail);
 console.log('Swept envelopes: '+asset.id+' ('+proxy.dynamic.length+' boxes, guard '+detail.maxGuardM.toFixed(3)+'m)');
}
stats.proxyBytes=fs.readdirSync(path.join(modelDir,'proxies')).reduce((n,f)=>n+fs.statSync(path.join(modelDir,'proxies',f)).size,0);
fs.writeFileSync(reportFile,JSON.stringify(stats,null,2));
console.log(JSON.stringify({...stats,modelsDetail:undefined},null,2));
"""

HEROES = {
    'cessna_skyhawk', 'dhc2_beaver', 'stearman_model_75', 'pitts_s2c',
    'extra_330lx', 'p51d_mustang', 'l39_albatros', 'f16_fighting_falcon',
}


def save_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')))


def glb_json(data: bytes) -> dict:
    assert data[:4] == b'glTF' and struct.unpack_from('<I', data, 4)[0] == 2
    length = struct.unpack_from('<I', data, 12)[0]
    return json.loads(data[20:20 + length])


def round_vec(values) -> list[float]:
    return [round(float(v), 6) for v in values]


def compact_clearance(clearance: dict, index: int) -> dict:
    size = clearance.get('size_m') or [
        clearance.get('width_m', 0), clearance.get('height_m', 0),
        clearance.get('depth_m', 0),
    ]
    return {'name': clearance.get('name', f'passage_{index}'),
            'axis': clearance.get('axis', 'Z'),
            'c': round_vec(clearance.get('center_m', [0, 0, 0])),
            's': round_vec(size)}


def compact_box(box: dict, dynamic: bool = False) -> dict:
    out = {'c': round_vec(box['center_local_m'] if dynamic else box['center_m']),
           's': round_vec(box['size_m']), 'zone': box.get('zone', 'structure')}
    if dynamic:
        out['node'] = box['node']
    q = box.get('rotation_xyzw', [0, 0, 0, 1])
    if q != [0, 0, 0, 1]:
        out['q'] = round_vec(q)
    return out


def greedy_cuboids(mask: np.ndarray, max_count: int = 384) -> list[tuple]:
    """Merge only fully occupied cells; no empty portal can be filled."""
    remaining = mask.copy()
    cells = np.argwhere(remaining)
    boxes = []
    nx, ny, nz = remaining.shape
    for x, y, z in cells:
        if not remaining[x, y, z]:
            continue
        ex = x + 1
        while ex < nx and remaining[ex, y, z]:
            ex += 1
        ez = z + 1
        while ez < nz and remaining[x:ex, y, ez].all():
            ez += 1
        ey = y + 1
        while ey < ny and remaining[x:ex, ey, z:ez].all():
            ey += 1
        remaining[x:ex, y:ey, z:ez] = False
        boxes.append((int(x), int(y), int(z), int(ex), int(ey), int(ez)))
        if len(boxes) > max_count:
            # Unvisited cells are smaller leftovers. Keep completed cuboids only.
            break
    return boxes


def reduce_boxes(boxes: list[dict], limit: int = 128) -> tuple[list[dict], dict]:
    if not boxes:
        return [], {'staticVolume': 1, 'maxCellM': 0, 'method': 'source-empty'}
    # Exact source boxes are already occupied-grid cuboids. Largest source
    # cuboids are a useful fallback for thin cranes that a coarse grid loses.
    ordered = sorted(boxes, key=lambda b: math.prod(b['size_m']), reverse=True)
    source_volume = sum(math.prod(b['size_m']) for b in ordered)
    selected = ordered[:limit]
    best_boxes = [compact_box(b) for b in selected]
    best_coverage = sum(math.prod(b['size_m']) for b in selected) / source_volume
    best_method = 'source-subset' if len(boxes) > limit else 'source-complete'
    best_cell = 0.0
    if len(boxes) <= limit:
        return best_boxes, {'staticVolume': 1, 'maxCellM': 0, 'method': best_method}
    if any(b.get('rotation_xyzw', [0, 0, 0, 1]) != [0, 0, 0, 1] for b in boxes):
        return best_boxes, {'staticVolume': round(best_coverage, 5),
                            'maxCellM': 0, 'method': best_method}
    sizes = np.asarray([b['size_m'] for b in boxes], dtype=np.float64)
    centers = np.asarray([b['center_m'] for b in boxes], dtype=np.float64)
    mins, maxs = centers - sizes / 2, centers + sizes / 2
    origin = mins.min(axis=0)
    pitch = float(sizes.min())
    cell_bounds_low = (mins - origin) / pitch
    cell_bounds_high = (maxs - origin) / pitch
    # Inscribed grid reduction is valid only when all box faces align exactly.
    alignment_error = max(float(np.abs(cell_bounds_low - np.rint(cell_bounds_low)).max()),
                          float(np.abs(cell_bounds_high - np.rint(cell_bounds_high)).max()))
    dims = np.rint((maxs.max(axis=0) - origin) / pitch).astype(int)
    if alignment_error > 1e-4 or np.prod(dims) > 24_000_000:
        return best_boxes, {'staticVolume': round(best_coverage, 5),
                            'maxCellM': 0, 'method': best_method}
    grid = np.zeros(tuple(dims), dtype=np.bool_)
    for low, high in zip(np.rint(cell_bounds_low).astype(int), np.rint(cell_bounds_high).astype(int)):
        grid[low[0]:high[0], low[1]:high[1], low[2]:high[2]] = True
    # Source boxes are disjoint within most parts, but occasionally overlap.
    occupied_volume = int(grid.sum()) * pitch ** 3
    source_volume = max(source_volume, occupied_volume)
    for block in (2, 3, 4, 6, 8):
        coarse_dims = (dims + block - 1) // block
        padded_dims = coarse_dims * block
        padded = np.zeros(tuple(padded_dims), dtype=np.bool_)
        padded[:dims[0], :dims[1], :dims[2]] = grid
        coarse = padded.reshape(coarse_dims[0], block, coarse_dims[1], block,
                                coarse_dims[2], block).all(axis=(1, 3, 5))
        cuboids = greedy_cuboids(coarse, max_count=512)
        cuboids.sort(key=lambda b: (b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]), reverse=True)
        cuboids = cuboids[:limit]
        volume_cells = sum((b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]) for b in cuboids)
        covered = volume_cells * (block * pitch) ** 3 / source_volume
        if covered <= best_coverage:
            continue
        best_coverage, best_cell, best_method = covered, block * pitch, 'occupied-only-grid'
        best_boxes = []
        for x, y, z, ex, ey, ez in cuboids:
            lo = origin + np.asarray([x, y, z]) * best_cell
            hi = origin + np.asarray([ex, ey, ez]) * best_cell
            c = (lo + hi) / 2
            # Keep source zone of the cell centre. Large mixed-zone regions
            # remain a coarse proxy; gameplay should classify by model category.
            contained = ((c >= mins - 1e-8) & (c <= maxs + 1e-8)).all(axis=1)
            index = int(np.flatnonzero(contained)[0]) if contained.any() else 0
            best_boxes.append({'c': round_vec(c), 's': round_vec(hi - lo),
                               'zone': boxes[index].get('zone', 'structure')})
    return best_boxes, {'staticVolume': round(min(1.0, best_coverage), 5),
                        'maxCellM': round(best_cell, 6), 'method': best_method}


def animation_info(glb: dict, autoplay: list[str]) -> list[dict]:
    out = []
    for clip in glb.get('animations', []):
        duration = max((glb['accessors'][s['input']].get('max', [0])[0]
                        for s in clip['samplers']), default=0)
        out.append({'name': clip['name'], 'duration': round(float(duration), 4),
                    'autoplay': clip['name'] in autoplay or clip.get('extras', {}).get('autoplay', False),
                    'targets': sorted({glb['nodes'][c['target']['node']]['name']
                                       for c in clip['channels']})})
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'public/models')
    parser.add_argument('--audit', type=Path, required=True)
    parser.add_argument('--encoder', type=Path, help='Optional override for the bundled encoder')
    args = parser.parse_args()
    args.audit.mkdir(parents=True, exist_ok=True)
    args.output.mkdir(parents=True, exist_ok=True)
    if args.encoder is None:
        project_root = Path(__file__).resolve().parents[1]
        package = next((project_root / 'node_modules/.pnpm').glob('meshoptimizer@*/node_modules/meshoptimizer'), None)
        if package is None:
            raise RuntimeError('Install the project dependencies before preparing models')
        code = NODE_ENCODER
        code = code.replace('/workspace/sites/voxel-airrun/node_modules/.pnpm/meshoptimizer@1.1.1/node_modules/meshoptimizer/meshopt_encoder.js', (package / 'meshopt_encoder.js').as_uri())
        code = code.replace('/workspace/sites/voxel-airrun/node_modules/.pnpm/meshoptimizer@1.1.1/node_modules/meshoptimizer/meshopt_decoder.mjs', (package / 'meshopt_decoder.mjs').as_uri())
        args.encoder = args.audit / 'runtime-encoder.mjs'
        args.encoder.write_text(code)
    archive = zipfile.ZipFile(args.archive)
    prefix = next(n for n in archive.namelist() if n.endswith('/catalog.json')).rsplit('/', 1)[0] + '/'
    source_catalog = json.loads(archive.read(prefix + 'catalog.json'))
    models = source_catalog['assets']
    assert len(models) == 150 and len({m['id'] for m in models}) == 150
    jobs, runtime, proxy_stats = [], [], []
    for index, asset in enumerate(models):
        model_dir = asset['exports']['lod1'].rsplit('/', 1)[0]
        meta = json.loads(archive.read(prefix + model_dir + '/metadata.json'))
        exports = {}
        for lod in (('lod0', 'lod1', 'lod2') if asset['id'] in HEROES else ('lod1', 'lod2')):
            relative = asset['exports'][lod]
            source_file = args.audit / 'source' / relative
            source_file.parent.mkdir(parents=True, exist_ok=True)
            source_file.write_bytes(archive.read(prefix + relative))
            optimized_file = args.audit / 'optimized' / relative
            jobs.append({'id': asset['id'], 'lod': lod,
                         'sourceFile': str(source_file), 'destFile': str(optimized_file),
                         'runtimeFile': str(args.output / (relative + '.gz'))})
            exports[lod] = '/models/' + relative + '.gz'
        original_glb = glb_json(archive.read(prefix + asset['exports']['lod1']))
        autoplay = meta.get('motion', {}).get('autoplay', [])
        clearances = [compact_clearance(c, i) for i, c in enumerate(meta.get('clearances', []))]
        static, coverage = reduce_boxes(meta.get('colliders', []))
        dynamic_source = meta.get('motion', {}).get('dynamic_colliders', [])
        # One independent subset per rig node preserves moving collision zones
        # and pivots. Skip tiny hardware cuboids rather than enclosing emptiness.
        by_node = collections.defaultdict(list)
        for b in dynamic_source:
            by_node[b['node']].append(b)
        dynamic = []
        for node, boxes in by_node.items():
            chosen = sorted(boxes, key=lambda b: math.prod(b['size_m']), reverse=True)[:16]
            dynamic.extend(compact_box(b, dynamic=True) for b in chosen)
        proxy = {'schema': 1, 'id': asset['id'], 'sourceBoxes': len(meta.get('colliders', [])),
                 'sourceDynamicBoxes': len(dynamic_source), 'static': static,
                 'dynamic': dynamic, 'clearances': clearances, 'coverage': coverage}
        save_json(args.output / 'proxies' / (asset['id'] + '.json'), proxy)
        stats = asset['statistics']['lod1']
        runtime.append({'id': asset['id'], 'title': asset['title'], 'category': asset['category'],
                        'exports': exports,
                        'bounds': {'min': stats['bounds_min_m'], 'max': stats['bounds_max_m'], 'size': stats['size_m']},
                        'sockets': meta.get('sockets', {}),
                        'animations': animation_info(original_glb, autoplay),
                        'moving': bool(original_glb.get('animations')),
                        'clearances': clearances, 'proxy': '/models/proxies/' + asset['id'] + '.json',
                        'geometry': {lod: {'triangles': asset['statistics'][lod]['triangles'],
                                           'drawCalls': asset['statistics'][lod]['draw_calls']}
                                     for lod in exports}})
        proxy_stats.append({'id': asset['id'], 'static': len(static), 'dynamic': len(dynamic), **coverage})
        if index % 20 == 0:
            print(f'Prepared catalog/proxy {index + 1}/150', flush=True)
    assert sum(a['moving'] for a in runtime) == 50
    catalog = {'schema': 1, 'source': 'AeroForge 4.1', 'units': 'm', 'up': '+Y',
               'forward': '-Z', 'encoding': 'gzip',
               'extensionsRequired': ['EXT_meshopt_compression', 'KHR_mesh_quantization'],
               'assets': runtime}
    save_json(args.output / 'catalog.json', catalog)
    jobs_file, stats_file = args.audit / 'jobs.json', args.audit / 'optimization.json'
    save_json(jobs_file, jobs)
    subprocess.run(['node', str(args.encoder), str(jobs_file), str(stats_file)], check=True)
    optimization = json.loads(stats_file.read_text())
    for job in optimization:
        runtime_path = Path(job['runtimeFile'])
        runtime_path.parent.mkdir(parents=True, exist_ok=True)
        data = Path(job['destFile']).read_bytes()
        compressed = gzip.compress(data, compresslevel=9, mtime=0)
        runtime_path.write_bytes(compressed)
        assert gzip.decompress(compressed) == data
        job['gzipBytes'] = len(compressed)
    # Dynamic proxies are local to authored articulated/controller pivots.
    # Cache root-space swept envelopes for pure simulation and E path planning.
    project_root = Path(__file__).resolve().parents[1]
    three_package = (project_root / 'node_modules/three').resolve()
    if not (three_package / 'examples/jsm/loaders/GLTFLoader.js').is_file():
        raise RuntimeError('Install the project Three.js dependency before envelope preparation')
    envelope_code = ENVELOPE_NODE.replace('/workspace/sites/voxel-airrun/node_modules/.pnpm/three@0.186.1/node_modules/three/examples/jsm/loaders/GLTFLoader.js', (three_package / 'examples/jsm/loaders/GLTFLoader.js').as_uri())
    envelope_code = envelope_code.replace('/workspace/sites/voxel-airrun/node_modules/.pnpm/three@0.186.1/node_modules/three/build/three.module.js', (three_package / 'build/three.module.js').as_uri())
    envelope_script = args.audit / 'augment-envelopes.mjs'
    envelope_script.write_text(envelope_code)
    subprocess.run(['node', str(envelope_script), str(args.output), str(args.audit / 'source'), str(args.audit / 'envelope-validation.json')], check=True)
    by_id = {a['id']: a for a in runtime}
    for job in optimization:
        by_id[job['id']]['geometry'][job['lod']]['bytes'] = job['gzipBytes']
        by_id[job['id']]['geometry'][job['lod']]['positionErrorM'] = round(job['maxPositionError'], 8)
    save_json(args.output / 'catalog.json', catalog)
    save_json(stats_file, optimization)
    save_json(args.audit / 'proxy-audit.json', proxy_stats)
    report = {
        'modelCount': len(runtime), 'movingModels': sum(a['moving'] for a in runtime),
        'heroModels': sorted(HEROES), 'glbCount': len(jobs),
        'categories': dict(collections.Counter(a['category'] for a in runtime)),
        'sourceRuntimeBytes': sum(j['source'] for j in optimization),
        'meshoptBytes': sum(j['optimized'] for j in optimization),
        'gzipGeometryBytes': sum(j['gzipBytes'] for j in optimization),
        'catalogBytes': (args.output / 'catalog.json').stat().st_size,
        'proxyBytes': sum(p.stat().st_size for p in (args.output / 'proxies').glob('*.json')),
        'maxPositionErrorM': max(j['maxPositionError'] for j in optimization),
        'sourceTrianglesPreserved': sum(j['triangles'] for j in optimization),
        'staticProxyCoverageMin': min(p['staticVolume'] for p in proxy_stats),
        'staticProxyCoverageMedian': float(np.median([p['staticVolume'] for p in proxy_stats])),
        'dynamicEnvelopeValidation': json.loads((args.audit / 'envelope-validation.json').read_text()),
        'qualification': 'Numerical geometry/material/animation validation; no GPU render or device FPS certification.',
    }
    save_json(args.audit / 'summary.json', report)
    print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)


if __name__ == '__main__':
    main()
