import assert from 'node:assert/strict';
import { RushDrive } from '../../app/airrun/rush';
import { journeyThemes, journeyTheme } from '../../app/airrun/journey';
import { clamp, DEFAULT_SETTINGS } from '../../app/airrun/data';
import { routePosition } from '../../app/airrun/trick-path';
import { releaseInput, input, validateResult } from '../../app/airrun/state';
import { createSim, controls } from './fixtures';
let checks=0;
const check=(v:unknown,label:string)=>{assert.ok(v,label);checks++;};
const drive=new RushDrive();
check(!drive.activate(),'Rush cannot activate before earned');
check(!drive.credit('bad',Infinity) && !drive.credit('',100),'Invalid skill events cannot grant charge');
drive.credit('gate',75);check(drive.hud().ready,'Actual charge threshold arms the ability');
check(!drive.credit('gate',75),'Duplicate feat cannot charge twice');
check(drive.activate() && !drive.activate(),'One charge authorizes exactly one burst');
drive.credit('during-burst',100);check(drive.hud().charge===0,'Active burst cannot recharge itself');
for(let i=0;i<300;i++)drive.advance(1/60,1,false);
check(drive.hud().remaining<1e-8 && drive.result().uses===1,'Burst expires after five simulation seconds');
check(drive.result().distance<=300 && drive.result().distance>=299,'Rush distance is physical and bounded');
drive.credit('again',100);drive.activate();drive.advance(1/60,1,true);
check(drive.hud().remaining===0,'Hyper cinematic cannot prolong manual Rush');
drive.credit('third',100);drive.damage();check(drive.hud().charge===70 && !drive.activate(),'A hit cancels readiness and costs thirty charge');
input.rush=true;releaseInput();check(!input.rush,'Pause/blur clears a queued ability input');
const flight=createSim({settings:{...DEFAULT_SETTINGS,control:'hold'}}), normal=createSim({settings:{...DEFAULT_SETTINGS,control:'hold'}});
for(let i=0;i<5;i++)flight.collect('ring','earned:'+i,true);
check(flight.hud(controls()).rush?.ready,'Real precise ring collections charge the HUD');
const command=controls();command.rush=true;
for(let n=0;n<60;n++){flight.step(1/60,command);normal.step(1/60,controls());}
check(flight.speed>normal.speed && flight.rush.result().uses===1,'Q consumes charge and accelerates actual physics once');
check(validateResult(flight.result()),'Rush result passes persistent record validation');
check(!validateResult({...flight.result(),rush:{uses:1,distance:flight.result().distance+1}}),'Impossible Rush distance is rejected');
const braking=controls();braking.brake=true;const fast=flight.speed;
for(let n=0;n<30;n++)flight.step(1/60,braking);
check(flight.speed<fast,'Brake takes priority over Rush');
flight.fail('충돌', 'IMPACT', flight);
check(flight.rush.hud().remaining===0,'A fatal collision immediately stops Rush feedback');
for(const seed of [0,13,42,731]){
 const themes=journeyThemes(seed);check(new Set(themes).size===4,'A sortie offers four different regions');
 check(journeyTheme(seed,0).theme.id==='coast' && journeyTheme(seed,90).theme.id==='city','A short sortie reaches city well before 180 seconds');
 const sim=createSim({mode:'sortie',seed});sim.generate(15000);
 const encoded=new Set(sim.encounters.map(e=>e.theme));check(themes.every(t=>encoded.has(t)),'Actual generated geometry contains every planned region');
 for(const e of sim.encounters){check(e.start%128===0 && e.length%128===0,'Terrain chunks and encounter boundaries align');check(e.theme===sim.courseTheme(e.start).theme.id,'Generation uses the reproducible distance-based journey');}
}
const rushFlights=[];
for(const seed of [10,11,12,13,14]){
 const sim=createSim({mode:'sortie',seed,settings:{...DEFAULT_SETTINGS,control:'hold'}}), command=controls();
 let last={x:0,y:24,z:0};
 for(let frame=0;frame<60*181&&!sim.failed&&!sim.completed;frame++){
  const target=routePosition(sim.encounters.flatMap(e=>e.route),sim.z+sim.speed*.30,{x:last.x,y:last.y,z:Math.max(0,sim.encounters[0].start-90)});
  const dx=target.x-sim.x,dy=target.y-sim.y;
  const axis=(v:number)=>Math.sign(v)*(.12+.88*Math.pow(Math.min(1,Math.abs(v)),1/1.22));
  command.x=axis(clamp(dx*3/(18*sim.performance.handling),-1,1));
  command.y=axis(clamp(dy*3/(12*sim.performance.handling),-1,1));
  command.brake=Math.abs(dx)>5||Math.abs(dy)>4;
  command.rush=sim.rush.hud().ready&&!command.brake;
  sim.step(1/60,command);last=sim.encounters[0].route.at(-1)!;
 }
 const result=sim.result(),regions=Object.keys(result.metrics.themeTime);
 check(sim.completed&&!sim.failed,`Earned Rush can complete the native course for seed ${seed}: ${sim.reason}`);
 check(result.rush!.uses>0&&result.rush!.distance>0,'Native passages earn and consume real Rush bursts');
 check(regions.length===4&&journeyThemes(seed).every(t=>regions.includes(t)),'Rush flight visits all four actual regions');
 check(validateResult(result),'Complete Rush journey remains a valid stored record');
 rushFlights.push({seed,regions,uses:result.rush!.uses,rushDistance:result.rush!.distance});
}
console.log(JSON.stringify({aceChecks:checks,rushFlights,humanFunVerified:false,status:'passed'}));
