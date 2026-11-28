import assert from 'node:assert/strict';
import { baseSpeed, freshSave } from '../../app/airrun/data';
import { PassageRally, validRally } from '../../app/airrun/passage-rally';
import { controls, createSim } from './fixtures';
import { parseSave, validateResult } from '../../app/airrun/state';
import { sameFlight } from '../../app/airrun/rematch';
import { ensureQuests } from '../../app/airrun/progression';

const race = new PassageRally(1);
race.cross(200, 12, true);
assert.equal(race.hud(12,200).split?.elapsedMs, 0);
const first = 200/baseSpeed(300), second = 240/baseSpeed(520);
race.cross(400,12 + first-.3,true);
const split = race.hud(12 + first-.3,400).split!;
assert.equal(split.targetMs-split.elapsedMs,300);
assert.equal(race.cross(640,12+first+second-.55,true),1000);
race.cross(700,35,false);
race.cross(900,43,true);
assert.equal(race.cross(1100,50,true),450);
const log = race.result()!;
assert.equal(log.wins,1);
assert.equal(log.timed,2);
assert(validRally(log,2,1450,60));
assert(!validRally({...log,paceBonus:1000},2,1450,60));
race.cross(1200,56,true); race.reset();
assert.equal(race.hud(57,1250).split,undefined);

function track() {
    const sim=createSim();
    sim.obstacles=[]; sim.pickups=[]; sim.nextStart=1e8;
    sim.encounters=[sim.encounters[0]]; sim.encounters[0].route=[];
    return sim;
}
const pilot=track(), flat=track();
const turn={...controls(),brake:true,x:1};
for(let i=0;i<25;i++) { pilot.step(1/60,{...turn}); flat.step(1/60,{...turn}); }
function nextGate(sim:typeof pilot,offset=0,role='slalom') {
    sim.encounters[0].route.push({z:sim.z+.1,x:sim.x+offset,y:sim.y,width:22,height:16,dangerX:sim.x+16,dangerY:sim.y,role});
}
nextGate(pilot); nextGate(flat,0,'orientation');
pilot.step(1/60,{...turn}); flat.step(1/60,{...turn});
assert(pilot.corner.ready(pilot.time)); assert(!flat.corner.ready(flat.time));
for(let i=0;i<50;i++) {pilot.step(1/60,controls());flat.step(1/60,controls());}
assert(pilot.speed>flat.speed*1.15);
assert.equal(pilot.result().bankExits,1);
nextGate(pilot,80);pilot.step(1/60,controls());assert.equal(pilot.rally?.chain,0);
pilot.damage(2);assert(!pilot.corner.active(pilot.time));
for(let i=0;i<120;i++)pilot.step(1/60,controls());
assert.equal(pilot.corner.exits,1);
pilot.fail('테스트 종료','TEST FINISH',{x:pilot.x,y:pilot.y,z:pilot.z});
const gearPilot=track();
gearPilot.config.settings={...gearPilot.config.settings,control:'gear'};
for(let i=0;i<26;i++) gearPilot.step(1/60,{...controls(),gear:2,x:-1});
nextGate(gearPilot);gearPilot.step(1/60,{...controls(),gear:2,x:-1});
assert(gearPilot.corner.ready(gearPilot.time));
gearPilot.step(1/60,{...controls(),gear:3,boost:true,brake:true});
assert(!gearPilot.corner.active(gearPilot.time));
gearPilot.step(1/60,{...controls(),gear:3});
assert.equal(gearPilot.corner.exits,1);
gearPilot.step(1/60,{...controls(),gear:1});assert(!gearPilot.corner.active(gearPilot.time));
const result=pilot.result();assert(validateResult(result));
const trace=result.trace!;
const previous={...trace,edition:8};
const save=ensureQuests(freshSave());save.personalFlights={endless:previous};
assert(parseSave(save));assert(!sameFlight(previous,trace));
console.log(JSON.stringify({paceBonus:log.paceBonus, clockLeadMs:550, measuredCornerExit:true, cleanRestart:true, previousPilotReadable:true}));
