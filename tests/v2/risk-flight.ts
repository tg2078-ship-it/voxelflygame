import assert from 'node:assert/strict';
import { AIRCRAFT, baseSpeed, DEFAULT_SETTINGS, freshSave, stats } from '../../app/airrun/data';
import { BOOST, DODGE, FLIGHT, POINTS, difficultyIndex, flightReward } from '../../app/airrun/tuning';
import { readControls, validTrace } from '../../app/airrun/rematch';
import { applyRun, ensureQuests } from '../../app/airrun/progression';
import { parseSave, validateResult } from '../../app/airrun/state';
import { controls, createSim, catalog } from './fixtures';
import type { Obstacle } from '../../app/airrun/types';

const meta={...catalog.values().next().value!,id:'test-plane-wall',bounds:{min:[-.5,-.5,-.05],max:[.5,.5,.05],size:[1,1,.1]},motionBounds:undefined};
function field(){
    const sim=createSim({catalog:new Map([...catalog,[meta.id,meta]])});
    sim.obstacles=[];sim.pickups=[];sim.encounters=[];sim.nextStart=1e8;
    return sim;
}
const wall=(z:number,small=true):Obstacle=>({id:23,model:meta.id,position:{x:0,y:24,z},size:{x:1,y:1,z:.1},scale:{x:1,y:1,z:1},yaw:0,small,hit:false,scored:false,role:'test'});
const sim=field(), gas={...controls(),boost:true};
for(let i=0;i<500;i++)sim.step(1/60,gas);
assert(sim.lockedUntil>sim.time && !sim.boosting);
const lockedSpeed=sim.speed;
for(let i=0;i<20;i++)sim.step(1/60,gas);
assert(sim.speed<=lockedSpeed+1 && !sim.boosting);
while(sim.time<sim.lockedUntil+.1)sim.step(1/60,gas);
assert(sim.boosting && sim.boostHeat<.6);
const hot=sim.boostHeat;sim.risk(POINTS.near,'near','pole');
assert(sim.boostHeat<=Math.max(0,hot-BOOST.nearCooling)+1e-8);
assert.equal(Math.round(baseSpeed(1e8)*stats(AIRCRAFT[0],1).speed),90);
assert(difficultyIndex(100000)>difficultyIndex(60000));
assert(baseSpeed(60000)<FLIGHT.baseLimit && POINTS.perfectRoll>POINTS.boostedNear && POINTS.boostedNear>POINTS.near && POINTS.near>POINTS.survey);
const rolled=field();rolled.obstacles=[wall(2.5)];rolled.boostHeat=.75;
rolled.step(1/60,{...controls(),dodge:true});
assert.equal(rolled.hp,rolled.maxHp);assert.equal(rolled.bonus,POINTS.perfectRoll);assert(rolled.boostHeat<.4);
const first=rolled.rollStarted;
for(let i=0;i<40;i++)rolled.step(1/60,{...controls(),dodge:true});
assert.equal(rolled.rollStarted,first);
assert(rolled.hud(controls()).handling!.dodge<DODGE.cooldown);
const ordinary = field();
ordinary.step(1/60, {...controls(), dodge:true});
for (let i=0;i<11;i++) ordinary.step(1/60,controls());
ordinary.obstacles=[wall(ordinary.z+2.5)];
ordinary.step(1/60,controls());
assert.equal(ordinary.hp,ordinary.maxHp);
assert.equal(ordinary.bonus,0,'a roll outside the perfect window prevents light damage without a precision award');
const warning=field(), cues:string[]=[];
warning.config.onEvent=(name)=>{cues.push(name);};
warning.obstacles=[wall(30,false)];
warning.step(1/60,controls());
assert(warning.hud(controls()).handling?.warning && cues.includes('terrain-warning'));
assert(!warning.rescueUsed && !warning.failed);
const cooling=field();cooling.boostHeat=.8;
cooling.risk(POINTS.narrow,'narrow','arch');
assert(Math.abs(cooling.boostHeat-(.8-BOOST.narrowCooling))<1e-9);
for(let i=0;i<3;i++){
    cooling.pickups=[{id:100+i,kind:'ring',x:cooling.x,y:cooling.y,z:cooling.z+.35,radius:4,collected:false,risk:false}];
    cooling.step(1/60,controls());
}
assert.equal(cooling.hud(controls()).ringPass?.streak,3);
assert(Math.abs(cooling.boostHeat-(.8-BOOST.narrowCooling-BOOST.ringStreakCooling-3*BOOST.passiveCooling/60))<1e-8);
const rescue=field();rescue.obstacles=[wall(2,false)];rescue.step(1/60,{...controls(),dodge:true});
assert(rescue.rescueUsed && rescue.hp===1 && !rescue.failed);
rescue.damage(100);assert(!rescue.failed);
for(let i=0;i<92;i++)rescue.step(1/60,controls());
rescue.damage(3);assert(rescue.failed);

const flight=field();
for(let i=0;i<600;i++)flight.step(1/60,{...controls(),x:Math.sin(i/37)*.44,y:Math.cos(i/41)*.22,boost:i%93<40,dodge:i===180});
flight.fail('테스트','TEST',flight);
const result=flight.result(), trace=result.trace!;
assert(validateResult(result) && validTrace(trace));
assert.equal(flightReward(result.distance,result.bonus,result.coins),result.reward);
const replay=field();
for(const input of readControls(trace.inputStream))replay.step(1/60,input);
for(const k of ['x','y','z','speed','boostHeat','rollStarted','bonus','hp'] as const)assert.equal(replay[k],flight[k],k);
const saved=applyRun(ensureQuests(freshSave()),result);
assert(parseSave(saved) && saved.personalFlights?.endless?.seed===flight.config.seed);
assert(!saved.runs[0].trace);
assert(!validTrace({...trace,inputStream:'!!!!'}));
assert.equal(DEFAULT_SETTINGS.control,trace.control);

// Fly a generated route against the real mesh proxies until both lethal contacts occur.
const recordedEvents: string[] = [], replayEvents: string[] = [];
const live = createSim({ seed:14, onEvent: name=>recordedEvents.push(name) });
for (let frame=0; frame<3600 && !live.failed; frame++) {
    live.step(1/60,{...controls(), x:frame<120 ? .28 : 0, y:frame>=360 ? -1 : 0,
        boost:frame<410, dodge:frame===105});
}
const final = live.result(), recording = final.trace!;
assert(live.failed && live.rescueUsed && validTrace(recording) && validateResult(final));
const playback = createSim({ seed:recording.seed, onEvent: name=>replayEvents.push(name) });
for (const input of readControls(recording.inputStream)) playback.step(1/60,input);
const end = playback.result();
assert.deepEqual(end.trace,recording);
assert.deepEqual(end.metrics,final.metrics);
assert.deepEqual(playback.impact,live.impact);
assert.deepEqual(replayEvents,recordedEvents);
assert.equal(end.reward,final.reward);
assert(recordedEvents.includes('rescue') && recordedEvents.includes('crash'));
assert(!validateResult({...final,trace:{...recording,mode:'daily'}}));
console.log(JSON.stringify({overheat:true, roll:true, rescue:true, replayFrames:trace.frames,
    streamBytes:atob(trace.inputStream).length, storedTrace:true, generatedCourseFrames:recording.frames,
    replayedImpact:playback.impact, matchedEvents:replayEvents.length}));
