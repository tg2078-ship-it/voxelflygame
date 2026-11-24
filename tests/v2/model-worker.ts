import {nativeFetch} from './image-runtime';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as T from 'three';
import {catalog} from './fixtures';
import {ModelLibrary} from '../../app/airrun/assets';
import {WorldView} from '../../app/airrun/world-view';
import {ModelCompiler} from '../../app/airrun/model-compiler';
import {packModelCompile,packModelCompileAsync,unpackCompiled} from '../../app/airrun/model-compile-protocol';
import {ModelWorkerAdapter} from './model-worker-adapter';
import {compatibleModelLOD} from '../../app/airrun/graphics';
globalThis.fetch=async(url)=>{if(/^(blob:|data:)/.test(String(url)))return nativeFetch(url);try{return new Response(await fs.readFile(path.join('public',String(url).split('?')[0])));}catch{return new Response(null,{status:404});}};
const library=new ModelLibrary();library.byId=catalog;const world=new WorldView(new T.Scene(),library),compiler=new ModelCompiler(()=>new ModelWorkerAdapter() as unknown as Worker,true);
let checks=0,values=0,maxAttributeError=0;const check=(value:unknown,label:string)=>{assert(value,label);checks++;};
for(const [id,lod]of [['coastal_bridge',0],['cloudpeak_balloon',0],['large_dam',0],['airport_flipdot_arrivals',2]] as const){
    const gltf=await library.load(id,lod),packed=await packModelCompileAsync(gltf.scene),buffers=await compiler.compile(packed.parts);
    world.compileDeadline=Infinity;const expected=world.compile(id,lod)!;
    check(buffers.length===expected.length,'worker retains every material group');
    for(const buffer of buffers){
        const actual=unpackCompiled(buffer),reference=expected.find(part=>part.material===packed.materials[buffer.material])!.geometry;
        check(Object.keys(actual.attributes).sort().join()===Object.keys(reference.attributes).sort().join(),'worker retains UV/colour/normal attribute layout');
        for(const [name,a]of Object.entries(actual.attributes)){
            const b=reference.getAttribute(name);check(a.itemSize===b.itemSize&&a.count===b.count&&a.normalized===b.normalized,'worker retains attribute interpretation');
            for(let vertex=0;vertex<a.count;vertex++)for(let component=0;component<a.itemSize;component++){maxAttributeError=Math.max(maxAttributeError,Math.abs(a.getComponent(vertex,component)-b.getComponent(vertex,component)));values++;}
        }
        check(actual.index?.count===reference.index?.count,'worker retains every source triangle');
        if(actual.index&&reference.index)for(let i=0;i<actual.index.count;i++)check(actual.index.getX(i)===reference.index.getX(i),'triangle topology');
        reference.computeBoundingSphere();
        check(Math.abs(actual.boundingSphere!.radius-reference.boundingSphere!.radius)<1e-5,'worker supplies correct culling bounds');actual.dispose();
    }
}
let worldModels=0;
for(const meta of catalog.values()) {
    if(meta.category==='aircraft')continue;
    const lod=compatibleModelLOD(meta,2),source=await library.load(meta.id,lod),packed=packModelCompile(source.scene);
    const triangles=packed.parts.reduce((n,part)=>n+(part.range?.count??part.index?.length??part.attributes.position.count)/3,0);
    const output=await compiler.compile(packed.parts);
    check(output.length===packed.materials.length,'every supplied environmental material compiles: '+meta.id);
    check(output.reduce((n,g)=>n+(g.index?.length??g.attributes.position.count)/3,0)===triangles,'no source triangles disappear: '+meta.id);
    check(output.every(g=>Number.isFinite(g.sphere.radius)&&g.sphere.radius>0),'every source group has valid culling bounds: '+meta.id);
    worldModels++;library.trim(6);
}
check(maxAttributeError<1e-5&&compiler.jobs.size===0,'worker matches source positions, normals, colours and UVs');compiler.dispose();world.dispose();library.dispose();
const cancelled=new ModelCompiler(()=>new ModelWorkerAdapter() as unknown as Worker,true),wait=cancelled.compile([]);cancelled.dispose();await assert.rejects(wait);checks++;
check(cancelled.jobs.size===0&&!cancelled.worker,'cancellation releases queued model work');
const source=new T.Group(),data=new T.InterleavedBuffer(new Float32Array(600000),6),geometry=new T.BufferGeometry();
geometry.setAttribute('position',new T.InterleavedBufferAttribute(data,3,0));geometry.setAttribute('normal',new T.InterleavedBufferAttribute(data,3,3));
geometry.setIndex([0,1,2,3,4,5]);geometry.addGroup(0,3,0);geometry.addGroup(3,3,1);
source.add(new T.Mesh(geometry,[new T.MeshStandardMaterial(),new T.MeshStandardMaterial()]));
const shared=await packModelCompileAsync(source);
check(shared.parts[0].attributes.position.array===shared.parts[0].attributes.normal.array,'interleaved attributes share one private transfer copy');
check(shared.parts[0].index===shared.parts[1].index,'material groups share one private index copy');
check(shared.parts[0].attributes.position.array.buffer!==data.array.buffer,'source decoder buffers remain owned and attached');
let cancelPacking=false;setTimeout(()=>cancelPacking=true,0);
await assert.rejects(packModelCompileAsync(source,()=>cancelPacking,0));checks++;
geometry.dispose();for(const material of (source.children[0] as T.Mesh).material as T.Material[])material.dispose();
console.log(JSON.stringify({modelWorkerChecks:checks,comparedAttributeValues:values,maxAttributeError,realCpuWorkerCases:4,environmentModelsCompiled:worldModels,browserWorkerTransportVerified:false,gpuVerified:false,status:'passed'}));
