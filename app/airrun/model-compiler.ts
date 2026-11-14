import type { CompileRequest, CompileReply, CompiledBuffer } from './model-compile-protocol';
export class ModelCompiler {
    worker:Worker|null=null;serial=0;disposed=false;
    jobs=new Map<number,{resolve:(geometries:CompiledBuffer[])=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
    constructor(public factory=()=>new Worker(new URL('./model-compiler-worker.ts',import.meta.url),{type:'module',name:'airrun-model-batches'}),public enabled=typeof Worker!=='undefined'){}
    compile(parts:CompileRequest['parts']):Promise<CompiledBuffer[]>{
        if(this.disposed||!this.enabled)return Promise.reject(new Error('Model compiler unavailable'));
        if(!this.worker){try{this.worker=this.factory();this.worker.onmessage=(event:MessageEvent<CompileReply>)=>{const job=this.jobs.get(event.data.id);if(!job)return;clearTimeout(job.timer);this.jobs.delete(event.data.id);if(event.data.geometries)job.resolve(event.data.geometries);else job.reject(new Error(event.data.error??'Invalid model buffers'));};this.worker.onerror=this.worker.onmessageerror=()=>this.fail();}catch{this.enabled=false;return Promise.reject(new Error('Model worker unavailable'));}}
        return new Promise((resolve,reject)=>{const id=++this.serial,timer=setTimeout(()=>this.fail(),20000);this.jobs.set(id,{resolve,reject,timer});try{const buffers=new Set<ArrayBuffer>();for(const part of parts){for(const a of Object.values(part.attributes))buffers.add(a.array.buffer as ArrayBuffer);if(part.index)buffers.add(part.index.buffer as ArrayBuffer);}this.worker!.postMessage({id,parts},[...buffers]);}catch{this.fail();}});
    }
    fail(){this.enabled=false;this.worker?.terminate();this.worker=null;for(const job of this.jobs.values()){clearTimeout(job.timer);job.reject(new Error('Model compilation unavailable'));}this.jobs.clear();}
    dispose(){this.disposed=true;this.fail();}
}
