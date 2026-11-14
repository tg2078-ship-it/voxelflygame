import assert from 'node:assert/strict';
import { Worker as NodeWorker } from 'node:worker_threads';
import { TrickPlanner } from '../../app/airrun/trick-planner';
import { createTrickPath } from '../../app/airrun/trick-path';
import { trickContext } from '../../app/airrun/trick-protocol';
import { AirrunRenderer } from '../../app/airrun/renderer';
import { useAirrun } from '../../app/airrun/state';
import { createSim, controls, proxies } from './fixtures';
let active = 0, checks = 0;
const check = (value: unknown, label: string) => { assert(value,label);checks++; };
class WorkerAdapter {
    node: NodeWorker; dead=false;
    onmessage?: (event:{data:unknown})=>void; onerror?:()=>void; onmessageerror?:()=>void;
    constructor(){active++;this.node=new NodeWorker(new URL('./trick-worker-node.ts',import.meta.url),{execArgv:['--import','tsx']});this.node.on('message',data=>this.onmessage?.({data}));this.node.on('error',error=>{console.error(error);this.onerror?.();});this.node.on('messageerror',()=>this.onmessageerror?.());}
    postMessage(data:unknown){this.node.postMessage(data);}
    terminate(){if(!this.dead){this.dead=true;active--;void this.node.terminate();}}
}
globalThis.Worker=WorkerAdapter as unknown as typeof Worker;
const planner=new TrickPlanner();
for(const [plane,theme] of [['skyhawk','coast'],['delta','city'],['amphibian','korea']] as const){
    const sim=createSim({plane,seed:771,practice:{plane,theme,variant:theme==='korea'?3:0,level:1,weather:'rain',night:false}}),request=sim.trickSnapshot()!;
    check(!sim.eUsed,'planning does not spend E');const expected=createTrickPath(trickContext(request,proxies)),actual=await planner.plan(request);assert.deepEqual(actual,expected);checks++;
    check(active===0,'worker releases its copied collision sector');check(sim.engageTrick(request,actual)&&sim.eRemaining===15,'worker path begins exactly15 seconds');check(!sim.engageTrick(request,actual),'cannot activate twice');
}
const sim=createSim(),request=sim.trickSnapshot()!,cancelled=planner.plan(request);planner.cancel();await assert.rejects(cancelled,/cancelled/);checks++;
const path=createTrickPath(trickContext(request,proxies));sim.step(1/60,controls());check(!sim.engageTrick(request,path)&&!sim.eUsed,'moved flight rejects stale response');
let complete!:(value:typeof path)=>void;const gate=new Promise<typeof path>(resolve=>{complete=resolve;}),renderer=Object.create(AirrunRenderer.prototype) as AirrunRenderer,flight=createSim();
Object.assign(renderer,{sim:flight,hyperPreparing:false,hyperGeneration:0,disposed:false,held:new Set(),trickPlanner:{plan:()=>gate,cancel:()=>{}},library:{ensureProxies:async()=>{},load:async()=>{}},accumulator:0});
useAirrun.setState({phase:'flying',hud:flight.hud(controls())});const pending=renderer.prepareHyper();check(renderer.hyperPreparing&&useAirrun.getState().hud.ePreparing&&!flight.eUsed,'charge remains renderable');renderer.cancelHyper();useAirrun.setState({phase:'paused'});complete(path);await pending;check(!flight.eUsed&&!renderer.hyperPreparing&&!useAirrun.getState().hud.ePreparing,'pause cancels late activation');
console.log(JSON.stringify({workerChecks:checks,realWorkerCases:3,gpuVerified:false,status:'passed'}));
