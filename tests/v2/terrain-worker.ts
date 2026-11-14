import assert from 'node:assert/strict';
import { TerrainBuilder } from '../../app/airrun/terrain-builder';
import { buildTerrainBuffers, type TerrainRequest, type TerrainReply } from '../../app/airrun/terrain-protocol';
import { terrainGeometry } from '../../app/airrun/terrain';
import { THEMES } from '../../app/airrun/data';
import { TerrainWorkerAdapter } from './terrain-worker-adapter';
class WorkerTransport {
    onmessage: ((event: MessageEvent<TerrainReply>) => void) | null = null;
    onerror: (() => void) | null = null;
    onmessageerror: (() => void) | null = null;
    requests: TerrainRequest[] = []; terminated = false;
    postMessage(request: TerrainRequest) { this.requests.push(request); }
    terminate() { this.terminated = true; }
    reply(index: number) { this.onmessage?.({ data: buildTerrainBuffers(this.requests[index]) } as MessageEvent<TerrainReply>); }
}
let checks=0; const check=(value:unknown,label:string)=>{assert(value,label);checks++;};
const transport = new WorkerTransport(), builder = new TerrainBuilder(() => transport as unknown as Worker);
const a=builder.build({start:128,theme:'coast',seed:42,variant:0,cell:8}), b=builder.build({start:256,theme:'forest',seed:13,variant:0,cell:12});
transport.reply(1); transport.reply(0); const [coast,forest]=await Promise.all([a,b]);
check(coast.getAttribute('position').count!==forest.getAttribute('position').count,'out-of-order replies match their quality tile');
check(builder.jobs.size===0,'successful replies clear timeout jobs'); coast.dispose();forest.dispose();builder.dispose();check(transport.terminated,'world disposal stops terrain worker');
const delayed=new WorkerTransport(), cancelled=new TerrainBuilder(()=>delayed as unknown as Worker);
const wait=cancelled.build({start:0,theme:'city',seed:1,variant:0,cell:12}); cancelled.dispose(); await assert.rejects(wait,/disposed/);checks++;
delayed.reply(0);check(cancelled.jobs.size===0,'late worker replies cannot restore a disposed tile');
const broken=new WorkerTransport(), fallback=new TerrainBuilder(()=>broken as unknown as Worker);
const first=fallback.build({start:0,theme:'farm',seed:42,variant:0,cell:8}); broken.onerror?.(); const result=await first;
check(result.getAttribute('position').count>0 && fallback.broken && broken.terminated,'worker errors retain deterministic terrain fallback');result.dispose();fallback.dispose();
let vertices=0;
for (const theme of THEMES) for(const cell of [6,8,12]) {
    const request={id:1,start:512,theme:theme.id,seed:44171,variant:theme.id==='korea'?3:0,cell};
    const output=buildTerrainBuffers(request), reference=terrainGeometry(request.start,request.theme,request.seed,request.variant,cell);
    for(const name of ['position','normal','color'] as const) {
        check(Buffer.from(output[name]!.buffer).equals(Buffer.from(reference.getAttribute(name).array.buffer)),'worker preserves exact terrain geometry: '+theme.id+'/'+cell+'/'+name);
    }
    vertices+=output.position!.length/3;reference.dispose();
}
const threaded = new TerrainBuilder(() => new TerrainWorkerAdapter() as unknown as Worker);
for (const theme of ['coast','city','forest','ice','desert','korea'] as const) {
    const request={start:768,theme,seed:42,variant:theme==='korea'?3:0,cell:8};
    const actual=await threaded.build(request), expected=buildTerrainBuffers({...request,id:0});
    for(const name of ['position','normal','color'] as const) check(Buffer.from(actual.getAttribute(name).array.buffer).equals(Buffer.from(expected[name]!.buffer)),'real CPU worker transfers exact terrain buffers');
    actual.dispose();
}
check(!threaded.broken && threaded.jobs.size===0,'real worker completes without synchronous fallback');threaded.dispose();
console.log(JSON.stringify({terrainWorkerChecks:checks,comparedVertices:vertices,realCpuWorkerCases:6,browserWorkerTransportVerified:false,gpuVerified:false,status:'passed'}));
