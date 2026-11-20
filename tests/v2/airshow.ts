import assert from 'node:assert/strict';
import * as T from 'three';
import { projectRingSight } from '../../app/airrun/guidance-projection';
import { interpolateFlightPose, readFlightPose } from '../../app/airrun/flight-presentation';
import { FormationFlight } from '../../app/airrun/formation';
import { FormationVisual } from '../../app/airrun/formation-visual';
import { THEMES } from '../../app/airrun/data';
import { proceduralPattern } from '../../app/airrun/encounter-director';
import { buildEncounter } from '../../app/airrun/patterns';
import { obstacleContact } from '../../app/airrun/collision';
import { controls, createSim, catalog, proxies } from './fixtures';

const camera = new T.PerspectiveCamera(60,1.6,.1,1200);
camera.position.set(0,24,14);
for (const distance of [150,44,5,1.5,0]) {
    const cue = projectRingSight(camera,{x:0,y:24,z:800+distance},800,0,distance);
    assert(cue && !cue.edge && cue.x === 50 && cue.distance === distance);
}
const edge = projectRingSight(camera,{x:60,y:0,z:801,speedGate:true},800,0,1);
assert(edge && edge.edge && edge.speedGate && edge.x<=90 && edge.y<=82);
assert.equal(projectRingSight(camera,{x:0,y:24,z:775},800,0,-25),undefined);

for (const boost of [false,true]) {
    const sim = createSim(), input = controls();
    input.boost = boost;
    sim.pickups=[{id:55,kind:'ring',speedGate:true,x:0,y:24,z:4,radius:6,collected:false,risk:true}];
    for (let i=0;i<24;i++) sim.step(1/60,input);
    assert.equal(sim.hud(input).ringPass?.speedBonus,boost?250:0);
    assert.equal(sim.metrics.rings,1);
}
const pose = readFlightPose(createSim());
const last = interpolateFlightPose({...pose,trickRoll:2*Math.PI-.008},pose,.5);
assert(Math.abs(Math.sin(last.trickRoll))<.01);
const leader = new FormationFlight(42,'standard'), visual = new FormationVisual();
leader.addRoute([{x:0,y:24,z:500}]);
const centre={x:0,y:24,z:0};
let lastZ=-Infinity;
for(let i=0;i<190;i++) {
    leader.advance(1/60,centre,false,false);
    visual.update(leader,0,0,50,1/60);
    const z=visual.root.children[1].position.z;
    if(i) assert(Math.abs(z-lastZ)<3,'Courier joins continuously');
    lastZ=z;
}
leader.interrupt();
for(let i=0;i<170;i++) visual.update(leader,0,0,50,1/60);
assert.equal(visual.root.visible,false);
assert.equal(visual.root.children[1].scale.x,1);
let rings=0;
for(const theme of THEMES) for(const seed of [7,13,42,731,968]) {
    const pattern=proceduralPattern(theme.id,0,seed,3,4200);
    const e=buildEncounter(pattern,1000,seed,{byId:catalog},11,4);
    for(const ring of e.pickups.filter(p=>p.kind==='ring')) {
        for(const [id,p] of e.placements.entries()) {
            if(!p.collision) continue;
            const meta=catalog.get(p.model)!, size=meta.bounds.size;
            const obstacle={id,model:p.model,position:{x:p.x,y:p.y,z:p.z},scale:{x:p.sx,y:p.sy,z:p.sz},size:{x:size[0]*p.sx,y:size[1]*p.sy,z:size[2]*p.sz},yaw:p.yaw, role:p.role,small:!!p.small,hit:false,scored:false};
            assert(!obstacleContact(obstacle,meta,proxies.get(p.model),{...ring,z:ring.z-5},{...ring,z:ring.z+5},{x:3.74,y:1.05,z:2}),theme.id+'/'+seed+'/'+p.model+' blocks a ring');
        }
        rings++;
    }
}
console.log(JSON.stringify({nearRing:true,boostGate:true,courierContinuity:true,physicalRewardPasses:rings,status:'passed'}));
