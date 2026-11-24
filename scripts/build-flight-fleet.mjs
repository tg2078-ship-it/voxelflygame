// Original low-poly airframes. Coordinates are metres with the nose facing -Z.
// Static parts are baked per material. Propellers, rotors and flight controls retain pivots.
import * as T from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const catalog = JSON.parse(await readFile('public/models/catalog.json', 'utf8')).assets;
const fleet = [
    // model, configuration, fuselage finish, field markings, half-wing sweep, root chord, tip chord
    ['dhc2_beaver','float','#eee2b9','#ab352b',.02,.23,.15],
    ['stearman_model_75','open-biplane','#e6ae2d','#306f96',.01,.22,.17],
    ['pitts_s2c','racing-biplane','#b92b39','#ffedd0',.08,.24,.15],
    ['extra_330lx','aerobat','#153e65','#f18836',.11,.25,.10],
    ['p51d_mustang','warbird','#9caeaa','#9b3726',.07,.27,.11],
    ['l39_albatros','trainer','#3a6875','#e59a57',.13,.26,.105],
    ['f16_fighting_falcon','interceptor','#52657c','#d7aa69',.24,.34,.075],
    ['bush_stol_tundra','bush','#365e4e','#e6b654',.015,.26,.17],
    ['amphibious_twin_float','twinfloat','#c9dadd','#227e89',.06,.24,.11],
    ['canard_pusher_scout','canard','#ede3bd','#416a86',.21,.26,.12],
    ['twin_boom_cargo_scout','twinboom','#566551','#df8c42',.04,.23,.115],
    ['twin_engine_commuter','commuter','#e2dfce','#345786',.095,.26,.10],
    ['firefighting_flying_boat','waterbomber','#ebb33c','#bb4936',.05,.23,.12],
    ['delta_interceptor_jet','delta','#20394c','#8bd6ce',.40,.50,.025],
    ['forward_swept_test_jet','forward','#ece9dc','#bc4035',-.22,.29,.09],
    ['autogyro_patrol','gyro','#dfbc50','#343f51',.01,.18,.12],
    ['coaxial_utility_helicopter','coax','#3d6477','#ffb052',.03,.22,.12],
    ['rescue_helicopter','rescue','#e76736','#f1db9d',.03,.22,.12],
    ['sailplane','glider','#e9e9dc','#24747b',.055,.19,.052],
    ['heavy_transport','transport','#6d776b','#dbbf73',.13,.28,.12],
    ['tiltrotor_rescue_vtol','tiltrotor','#d5d6c8','#c45932',.025,.24,.14],
];
globalThis.FileReader = class {
    readAsArrayBuffer(blob) { blob.arrayBuffer().then(value => { this.result=value; this.onloadend?.(); }); }
};
const out = 'public/flight-fleet';
await mkdir(out,{recursive:true});
const manifest = {};
const vector = (x,y,z) => new T.Vector3(x,y,z);
function makeAirframe(spec, detail, meta) {
    const [id,kind,base,accent,sweep,chord,tip] = spec;
    const jet = ['trainer','interceptor','delta','forward'].includes(kind);
    const rotor = ['gyro','coax','rescue'].includes(kind);
    const wide = ['transport','commuter','waterbomber','coax','rescue','tiltrotor'].includes(kind);
    const twin = ['twinboom','commuter','waterbomber','twinfloat','transport','tiltrotor'].includes(kind);
    const biplane = kind.endsWith('biplane');
    const root = new T.Group(), rig = new T.Group(), clips = [], animations = [];
    root.add(rig); rig.name='Airframe';
    const palette = {};
    for (const [name,color,metalness,roughness] of [
        ['paint_main',base,.24,.44],['paint_stripe',accent,.2,.39],['aluminium','#b6c0bf',.62,.38],
        ['structure','#343f46',.42,.5],['canopy_glass','#49798e',.66,.17],['tyre','#25303a',.08,.86],
        ['port_light','#f96551',.05,.32],['starboard_light','#8edaaf',.05,.32]
    ]) palette[name]=new T.MeshStandardMaterial({name,color,metalness,roughness,flatShading:true});
    function shape(geometry, material, x=0,y=0,z=0, parent=rig) {
        const mesh=new T.Mesh(geometry,palette[material]);mesh.position.set(x,y,z);
        parent.add(mesh);return mesh;
    }
    function box(x,y,z,w,h,d,material='paint_main',parent=rig) {
        return shape(new T.BoxGeometry(w,h,d),material,x,y,z,parent);
    }
    function strut(a,b,r,material='aluminium') {
        const v=b.clone().sub(a);
        const mesh=shape(new T.CylinderGeometry(r,r,v.length(),4),material);
        mesh.position.copy(a).lerp(b,.5);mesh.quaternion.setFromUnitVectors(vector(0,1,0),v.normalize());
    }
    function loft(stations,material,dx=0,dy=0,dz=0) {
        const pos=[],rings=stations.map(([z,w,h,y])=>Array.from({length:8},(_,i)=>{
            const angle=(i+.5)*Math.PI/4;
            return [dx+w*Math.cos(angle),dy+y+h*Math.sin(angle),dz+z];
        }));
        const tri=(a,b,c)=>pos.push(...a,...b,...c);
        for(let j=1;j<rings.length;j++) for(let i=0;i<8;i++){
            const k=(i+1)%8,a=rings[j-1],b=rings[j];
            tri(a[i],a[k],b[i]);tri(a[k],b[k],b[i]);
        }
        for(let i=1;i<7;i++){tri(rings[0][0],rings[0][i+1],rings[0][i]);const e=rings.at(-1);tri(e[0],e[i],e[i+1]);}
        const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.computeVertexNormals();shape(g,material);
    }
    // Constant-thickness, bevelled polygon sections give each wing a distinct planform.
    function panel(points, y, thick, material) {
        const outline=new T.Shape(points.map(([x,z])=>new T.Vector2(x,-z)));
        const g=new T.ExtrudeGeometry(outline,{depth:thick,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:thick*.22,bevelThickness:thick*.18});
        g.rotateX(-Math.PI/2);
        return shape(g,material,0,y,0);
    }
    function motion(pivot,name,axis,angle,autoplay,duration=1) {
        const times=autoplay?[0,duration/4,duration/2,duration*.75,duration]:[0,duration/2,duration];
        const values=times.flatMap(t=>new T.Quaternion().setFromAxisAngle(axis,autoplay?angle*t/duration:angle*(2*t/duration-1)).toArray());
        clips.push(new T.AnimationClip(name,duration,[new T.QuaternionKeyframeTrack(pivot.name+'.quaternion',times,values)]));
        animations.push({name,duration,autoplay,targets:[pivot.name]});
    }
    function pivot(x,y,z,name){const group=new T.Group();group.name=name;group.position.set(x,y,z);rig.add(group);return group;}
    const w=wide?.122:jet?.085:kind==='glider'?.06:.088;
    const body=rotor?.32:wide?.29:.21, nose=jet?-.58:-.51;
    loft([[nose,.013,.014,-.004],[-.40,w*.70,.066,0],[-.25,w,.099,.006],[.04,w,.103,.004],[body,w*.73,.078,0],[.45,w*.30,.040,.026],[.53,.014,.022,.033]],'paint_main');
    const canopy=wide?.14:jet?.17:.115;
    loft([[-.35,.016,.015,.064],[-.27,w*.83,.059,.080],[-.17,w*.91,.086,.084],[canopy-.09,w*.8,.067,.079],[canopy,.026,.018,.072]],'canopy_glass');
    if(detail) {
        for (const [z,width,top] of [[-.265,.77,.135],[-.165,.86,.160],[canopy-.084,.75,.137]]) {
            for (const side of [-1,1]) {
                strut(vector(side*w*width,.099,z),vector(side*w*.36,top,z+.005),.006,'structure');
                strut(vector(side*w*.36,top,z+.005),vector(0,top+.004,z+.005),.0055,'aluminium');
            }
        }
        // Cowl vents, inset service panels and wing walks are distinct from the paint masks.
        for (const side of [-1,1]) {
            for(let i=0;i<4;i++) box(side*w*.84,.011,-.323+i*.016,.009,.008,.009,'structure');
            box(side*w*.98,.014,-.05,.007,.007,.042,'aluminium');
        }
        for(const side of [-1,1]){
            box(side*w*.947,-.006,-.07,.007,.019,.49,'paint_stripe');
            if(wide)for(let i=0;i<(kind==='transport'?9:5);i++)box(side*w*.935,.048,-.12+i*.033,.01,.025,.022,'canopy_glass');
        }
    }
    function wing(side,y,span,rootZ,rootChord,tipChord,wingSweep,mark=true){
        const rootX=w*.48, make=(frac,front)=>{
            const x=rootX+frac*(span-rootX), z=rootZ+wingSweep*frac+(front?0:rootChord+(tipChord-rootChord)*frac);
            return [side*x,z];
        };
        panel([make(0,true),make(.68,true),make(1,true),make(1,false),make(0,false)],y,.014,'paint_main');
        if(mark) {
            if(detail) {
                const inner=.24, outer=.31;
                panel([make(inner,true),make(outer,true),make(outer,false),make(inner,false)],y+.016,.002,'structure');
                for(let j=0;j<4;j++)box(side*(rootX+inner*(span-rootX)+.012),y+.019,rootZ+wingSweep*inner+.035+j*.028,.018,.002,.004,'aluminium');
            }
            panel([make(.78,true),make(.91,true),make(.91,false),make(.78,false)],y+.016,.003,'paint_stripe');
            if(detail) panel([make(.72,true),make(.74,true),make(.74,false),make(.72,false)],y+.016,.003,'aluminium');
            box(side*span,y+.014,rootZ+wingSweep+tipChord*.28,.009,.012,.02,side<0?'port_light':'starboard_light');
            const x=.66*span,z=rootZ+wingSweep*.66+rootChord*.34+tipChord*.66;
            const flap=pivot(side*x,y+.006,z,'Aileron_'+(side<0?'L':'R'));
            box(0,0,.012,span*.38,.010,.032,'paint_stripe',flap);
            motion(flap,'main_wing_aileron_'+(side<0?'left':'right')+'_deflect',vector(1,0,0),.38,false);
        }
    }
    function fin(x,y,z,size) {
        const points=[[0,0],[size*.50,size],[size*.91,size*.99],[size*.83,0]];
        const g=new T.ExtrudeGeometry(new T.Shape(points.map(([u,v])=>new T.Vector2(-u,v))),{depth:.014,bevelEnabled:false});
        g.rotateY(Math.PI/2);shape(g,'paint_stripe',x,y,z);
    }
    const wingY=wide||['float','bush','twinfloat'].includes(kind)?.07:-.026;
    if(!rotor)for(const side of [-1,1]){
        wing(side,wingY,.52,jet?-.18:-.15,chord,tip,sweep);
        if(biplane){wing(side,.195,.56,-.18,chord,tip,sweep,false);for(const x of [.21,.4]){strut(vector(side*x,.0,-.09),vector(side*(x+.028),.19,.018),.008);strut(vector(side*x,.0,.066),vector(side*(x+.028),.19,-.104),.008);}}
        if(kind==='canard'||kind==='forward') wing(side,.035,.24,-.38,.105,.045,.06,false);
        if(kind!=='canard')wing(side,kind==='glider'?.16:.05,.205,.315,.133,.065,.07,false);
    }
    if(kind==='twinboom')for(const s of [-1,1]){box(s*.215,.022,.22,.054,.06,.54);fin(s*.215,.045,.34,.18);}
    else if(kind==='delta'||kind==='tiltrotor'){for(const s of [-1,1])fin(s*.106,.054,.30,.18);}
    else fin(0,.038,.29,kind==='glider'?.22:.19);
    if (!rotor) {
        const elevator=pivot(0,kind==='glider'?.16:.056,kind==='canard'?-.285:.455,'Elevator');
        box(0,0,.011,kind==='canard'?.25:.31,.011,.037,'paint_stripe',elevator);
        motion(elevator,'elevator_deflect',vector(1,0,0),.43,false);
    }
    function rotorHub(x,y,z,r,vertical,count,name) {
        const hub=pivot(x,y,z,name);
        for(let i=0;i<count;i++){
            const angle=i*2*Math.PI/count;
            const blade=box(Math.cos(angle)*r*.5,vertical?0:Math.sin(angle)*r*.5,vertical?Math.sin(angle)*r*.5:0,r,.013,.028,'structure',hub);
            if(vertical)blade.rotation.y=-angle;else blade.rotation.z=angle;
            const tip=box(Math.cos(angle)*r*.90,vertical?.001:Math.sin(angle)*r*.90,vertical?Math.sin(angle)*r*.90:.001,r*.16,.014,.029,'paint_stripe',hub);
            if(vertical)tip.rotation.y=-angle;else tip.rotation.z=angle;
        }
        motion(hub,name+'_spin',vertical?vector(0,1,0):vector(0,0,1),Math.PI*2,true,vertical?.64:.4);
    }
    if(jet){
        for(const side of [-1,1]){
            loft([[-.23,.035,.031,-.029],[-.13,.061,.058,-.028],[.25,.048,.042,-.02],[.38,.034,.034,-.02]],'structure',side*w*.94);
            box(side*w*1.44,-.025,-.222,.047,.058,.015,'aluminium');
        }
        loft([[.285,.061,.052,0],[.46,.051,.046,.014],[.5,.040,.041,.014]],'structure');
    }else if(rotor){
        box(0,.19,-.045,.036,.11,.04,'aluminium');
        rotorHub(0,.245,-.045,.55,true,kind==='gyro'?2:4,'RotorUpper');
        if(kind==='coax')rotorHub(0,.207,-.045,.49,true,4,'RotorLower');
        else if(kind==='rescue'){const tail=pivot(.019,.128,.46,'TailFan');for(let i=0;i<3;i++){const blade=box(0,0,0,.014,.012,.14,'structure',tail);blade.rotation.x=i*Math.PI/3;}motion(tail,'tail_rotor_spin',vector(1,0,0),2*Math.PI,true,.4);}
        else rotorHub(0,.07,.155,.12,false,3,'Pusher');
    }else if(twin){
        for(const s of [-1,1])for(const x of kind==='transport'?[.17,.345]:[kind==='tiltrotor'?.49:.205]){
            loft([[-.235,.034,.035,wingY],[-.18,.05,.049,wingY],[.07,.038,.033,wingY],[.13,.016,.021,wingY]],'paint_main',s*x);
            rotorHub(s*x,wingY+(kind==='tiltrotor'?.09:0),-.24,kind==='tiltrotor'?.22:.115,kind==='tiltrotor',kind==='transport'?4:3,'Engine'+(s<0?'L':'R')+Math.round(x*100));
        }
    }else if(kind!=='glider')rotorHub(0,0,kind==='canard'?.30:-.485,.145,false,kind==='warbird'?4:2,'Propeller');
    if(['float','twinfloat','waterbomber'].includes(kind)){
        for(const s of [-1,1]){
            const x=s*(kind==='waterbomber'?.37:.17);
            loft([[-.39,.007,.013,-.165],[-.28,.040,.039,-.175],[.16,.042,.034,-.175],[.35,.014,.020,-.163]],'aluminium',x);
            for(const z of [-.19,.12])strut(vector(x*.65,-.04,z+.03),vector(x,-.16,z),.009,'structure');
        }
    }else if(rotor&&kind!=='gyro'){
        for(const s of [-1,1]){box(s*.112,-.147,-.035,.022,.022,.43,'structure');for(const z of [-.14,.105])strut(vector(s*.055,-.055,z),vector(s*.112,-.144,z),.009);}
    }else {
        for(const [x,z] of [[-.109,.005],[.109,.005],[0,jet||wide?-.28:.40]]){
            const r=kind==='bush'?.062:.038;
            const start=rig.children.length;
            strut(vector(x*.54,-.055,z),vector(x,-.126,z+.018),.009);
            const wheel=shape(new T.CylinderGeometry(r,r,.023,detail?12:6),'tyre',x,-.136,z+.019);wheel.rotation.z=Math.PI/2;
            if(detail){const hub=shape(new T.CylinderGeometry(r*.43,r*.43,.024,8),'aluminium',x,-.136,z+.019);hub.rotation.z=Math.PI/2;}
            if(jet || kind==='transport' || kind==='warbird' || kind==='commuter') {
                const parts=rig.children.slice(start), name='Gear'+(x<0?'L':x>0?'R':'N');
                const leg=pivot(0,0,0,name);
                for(const part of parts) leg.add(part);
                const duration=1, track=new T.VectorKeyframeTrack(name+'.scale',[0,duration],[1,1,1,1,.08,1]);
                clips.push(new T.AnimationClip(name+'_gear_retract',duration,[track]));
                animations.push({name:name+'_gear_retract',duration,autoplay:false,targets:[name]});
            }
        }
    }
    // Combine parts sharing a pivot without baking the animation itself.
    for(const node of [rig,...rig.children.filter(n=>n.isGroup)]){
        for(const mat of Object.values(palette)){
            const meshes=node.children.filter(n=>n.isMesh&&n.material===mat);
            if(!meshes.length)continue;
            const pieces=meshes.map(m=>{m.updateMatrix();const g=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();g.applyMatrix4(m.matrix);g.deleteAttribute('uv');return g;});
            const combined=mergeGeometries(pieces,false);node.remove(...meshes);node.add(new T.Mesh(combined,mat));
        }
    }
    const bounds=new T.Box3().setFromObject(root), size=bounds.getSize(new T.Vector3());
    rig.scale.set(...meta.bounds.size.map((v,i)=>v/size.toArray()[i]));
    rig.position.fromArray(meta.bounds.min).sub(bounds.min.multiply(rig.scale));root.updateMatrixWorld(true);
    return {root,clips,animations};
}
for(const spec of fleet){
    const meta=catalog.find(m=>m.id===spec[0]), id=spec[0],exports={};
    for(const detail of [true,false]){
        const {root,clips,animations}=makeAirframe(spec,detail,meta);
        const file=id+(detail?'':'-far')+'.glb.gz';
        const glb=await new GLTFExporter().parseAsync(root,{binary:true,animations:clips});
        await writeFile(out+'/'+file,gzipSync(Buffer.from(glb),{level:9}));
        if(detail){exports.lod0=exports.lod1='/flight-fleet/'+file;manifest[id]={animations,exports};}
        else exports.lod2=exports.lod3='/flight-fleet/'+file;
    }
}
await writeFile('app/airrun/fleet-manifest.json',JSON.stringify(manifest,null,1)+'\n');
console.log('Built 21 original airframes at two detail levels.');
