import fs from 'node:fs';
import {createSim,controls} from '/workspace/voxelflygame/tests/v2/fixtures';
import {routePosition} from '/workspace/voxelflygame/app/airrun/trick-path';
import {clamp,DEFAULT_SETTINGS,freshSave} from '/workspace/voxelflygame/app/airrun/data';
import {validateResult,parseSave} from '/workspace/voxelflygame/app/airrun/state';
import {ensureQuests,applyRun} from '/workspace/voxelflygame/app/airrun/progression';
const sim=createSim({id:'verified-sortie-master',mode:'sortie',seed:731,settings:{...DEFAULT_SETTINGS,difficulty:'relaxed'}}), input=controls();
let last={x:0,y:24,z:0};
for(let frame=0;frame<60*181&&!sim.failed&&!sim.completed;frame++){
 const target=routePosition(sim.encounters.flatMap(e=>e.route),sim.z+sim.speed*.30,{x:last.x,y:last.y,z:Math.max(0,sim.encounters[0].start-90)});
 const dx=target.x-sim.x,dy=target.y-sim.y,raw=(v:number)=>Math.sign(v)*(.12+.88*Math.pow(Math.min(1,Math.abs(v)),1/1.22));
 input.x=raw(clamp(dx*3/(18*sim.performance.handling),-1,1));input.y=raw(clamp(dy*3/(12*sim.performance.handling),-1,1));input.brake=Math.abs(dx)>5||Math.abs(dy)>4;
 sim.step(1/60,input);last=sim.encounters[0].route.at(-1)!;
}
const result=sim.result();if(!sim.completed||!validateResult(result))throw Error('Unverified completion');
const save=ensureQuests(freshSave());save.nickname='AIRRUN QA';save.settings={...save.settings,difficulty:'relaxed',skipTakeoff:true,control:'hold',quality:'balanced',resolutionScale:1,targetFPS:30};
let settled=applyRun(save,result);
for(let i=0;i<22;i++)settled=applyRun(settled,{...result,id:'attempt-'+i,interrupted:true,replay:undefined});
if(!settled.runs.some(r=>r.id===result.id&&r.replay)||settled.runs.length!==20||!parseSave(settled))throw Error('Personal rival eviction or invalid save');
fs.writeFileSync('/workspace/site-audit/v8/completed-flight.json',JSON.stringify(result,null,2));
fs.writeFileSync('/workspace/site-audit/v8/ghost-profile.json',JSON.stringify(applyRun(save,result)));
console.log(JSON.stringify({completed:true,score:result.score,contract:result.contract,replaySamples:result.replay?.samples.length,preservedAfter22Attempts:true,validated:true}));
