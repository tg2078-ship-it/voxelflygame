// Build purpose-specific equipment and surface-following paint for each playable
// aircraft. All dimensions are in metres in the native skeleton's rest space.
import * as T from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { fitShell } from './airframe-surface.mjs';
import { makeRotor } from './airframe-blades.mjs';

const catalog=JSON.parse(await readFile('public/models/catalog.json','utf8')).assets;
const designs=[
    // Hull paint, squadron colour, keyline, pattern, number, half-beam fitting limit, equipment.
    ['dhc2_beaver','#eee5c9','#ad392d','#312e2d','expedition','27',.092,['mooring','portage','boarding']],
    ['stearman_model_75','#f7bf39','#204e77','#fbebc7','heritage','75',.105,['radial','sight','bracing']],
    ['pitts_s2c','#b62739','#fdf1d9','#283947','checker','26',.13,['racing','bracing','sight']],
    ['extra_330lx','#f3eee1','#245d9c','#eb6734','flash','33',.13,['racing','louvers','fence']],
    ['p51d_mustang','#b9c3c6','#a63930','#232d38','heritage','51',.11,['stacks','radiator','mirror']],
    ['l39_albatros','#f0e3c6','#bb5635','#31526a','trainer','39',.135,['scoops','mirror','avionics']],
    ['f16_fighting_falcon','#708395','#283c52','#f2a94d','sweep','16',.123,['petals','duct','mirror']],
    ['bush_stol_tundra','#e4dfb8','#346653','#c67433','expedition','08',.105,['portage','boarding','baffles']],
    ['amphibious_twin_float','#e5e7dc','#247d89','#e69a53','tide','42',.082,['mooring','boarding','radome']],
    ['canard_pusher_scout','#faf1d9','#276877','#dd7143','flash','09',.092,['camera','avionics','fence']],
    ['twin_boom_cargo_scout','#bac2a9','#466455','#eca246','freight','24',.103,['freight','boarding','louvers']],
    ['twin_engine_commuter','#e9e7da','#355b80','#be7850','tide','62',.088,['stairs','radome','avionics']],
    ['firefighting_flying_boat','#f3c346','#b9382e','#333c45','rescue','28',.079,['waterdoors','intakes','mooring']],
    ['delta_interceptor_jet','#37505d','#a5d7ce','#ed9f48','sweep','07',.115,['doublejet','scoops','spine']],
    ['forward_swept_test_jet','#e9ebe1','#a92e3c','#394d63','flash','29',.127,['doublejet','spine','mirror']],
    ['autogyro_patrol','#f3cb60','#38545b','#c65635','expedition','12',.13,['camera','hoop','boarding']],
    ['coaxial_utility_helicopter','#e3e4d1','#366b7b','#e2a342','freight','48',.112,['winch','intakes','steprail']],
    ['rescue_helicopter','#e56635','#ece8ce','#314c5b','rescue','06',.093,['searchlight','winch','steprail']],
    ['sailplane','#f2f1e8','#247f86','#d7573b','sweep','73',.054,['winglet','probe','avionics']],
    ['heavy_transport','#b3baab','#52665b','#dfa853','freight','84',.076,['sponsons','freight','baffles']],
    ['tiltrotor_rescue_vtol','#ece6cb','#c35236','#415865','rescue','52',.089,['searchlight','sponsons','intakes']],
];
const glyphs=['111101101101111','010110010010111','111001111100111','111001111001111','101101111001001','111100111001111','111100111101111','111001010010010','111101111101111','111101111001111'];
const vector=(x,y,z)=>new T.Vector3(x,y,z);
globalThis.FileReader=class { readAsArrayBuffer(blob){blob.arrayBuffer().then(data=>{this.result=data;this.onloadend?.()});} };

function buildParts(design,surface,fine){
    const [id,base,accent,keyline,,number,,equipment]=design;
    const {min,max,size}=surface, [span,height,length]=size;
    const u=Math.min(1.55,Math.max(.65,length/10)), root=new T.Group();
    const groups={enamel:[],metal:[],glass:[],ink:[]};
    const hardware='#58656a', alloy='#b7c0bb', rubber='#28343a';
    const mat=(name,props)=>new T.MeshStandardMaterial({name,vertexColors:true,...props});
    const materials={enamel:mat('Equipment enamel',{roughness:.52,metalness:.14}),metal:mat('Machined fittings',{roughness:.43,metalness:.52}),
        glass:mat('Optical lens',{roughness:.15,metalness:.45}),ink:mat('Aircraft registration',{roughness:.56,metalness:.12,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,side:T.DoubleSide})};
    function add(geometry,color,group,position,rotation){
        const g=geometry.index?geometry.toNonIndexed():geometry;
        if(rotation)g.applyQuaternion(rotation);
        if(position)g.translate(position.x,position.y,position.z);
        const p=g.getAttribute('position'), rgb=new T.Color(color), values=new Uint8Array(p.count*3);
        for(let i=0;i<p.count;i++){
            // All fittings stay within the certified exterior envelope.
            p.setXYZ(i,T.MathUtils.clamp(p.getX(i),min[0]+.002,max[0]-.002),T.MathUtils.clamp(p.getY(i),min[1]+.002,max[1]-.002),T.MathUtils.clamp(p.getZ(i),min[2]+.002,max[2]-.002));
            values.set([Math.round(rgb.r*255),Math.round(rgb.g*255),Math.round(rgb.b*255)],i*3);
        }
        g.deleteAttribute('uv');g.setAttribute('color',new T.Uint8BufferAttribute(values,3,true));groups[group].push(g);
    }
    function box(p,w,h,d,col,group='metal'){add(new T.BoxGeometry(w*u,h*u,d*u),col,group,p);}
    function rod(a,b,r,col=alloy,group='metal',r2=r){
        const axis=b.clone().sub(a);
        add(new T.CylinderGeometry(r2*u,r*u,axis.length(),fine?10:6),col,group,a.clone().lerp(b,.5),new T.Quaternion().setFromUnitVectors(vector(0,1,0),axis.normalize()));
    }
    const shift=(p,x,y,z)=>vector(p.x+x*u,p.y+y*u,p.z+z*u);
    function mount(t,frac,sign){
        const h=surface.hull(t), y=T.MathUtils.lerp(h.bottom,h.top,frac);
        const x=surface.side.sample(h.z,y) ?? h.width;
        return vector(sign*x,y,h.z);
    }
    function hullPod(t,frac,sign,stations,col,group='enamel'){
        // Cross-sections have a flat inboard flange with stepped outboard shoulders.
        const p=mount(t,frac,sign), coords=[], rings=[];
        for(const [dz,rise,radius] of stations){
            const ring=[];
            for(let i=0;i<10;i++){const a=2*Math.PI*i/10;ring.push(shift(p,sign*(radius*.52+radius*Math.cos(a)),rise+radius*.84*Math.sin(a),dz));}
            rings.push(ring);
        }
        const tri=(a,b,c)=>{for(const v of sign>0?[a,b,c]:[a,c,b])coords.push(...v.toArray());};
        for(let k=1;k<rings.length;k++)for(let j=0;j<10;j++){const n=(j+1)%10,A=rings[k-1],B=rings[k];tri(A[j],A[n],B[j]);tri(A[n],B[n],B[j]);}
        for(let i=1;i<9;i++){tri(rings[0][0],rings[0][i+1],rings[0][i]);const end=rings.at(-1);tri(end[0],end[i],end[i+1]);}
        const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(coords,3));g.computeVertexNormals();add(g,col,group);return p;
    }
    function ladder(sign,steps){
        const p=mount(.43,.22,sign), lower=shift(p,sign*.25,-.32,0);
        for(const dz of [-.38,.38])rod(shift(p,-sign*.06,.09,dz),shift(lower,0,0,dz),.028);
        rod(shift(lower,0,0,-.45),shift(lower,0,0,.45),.041,hardware);
        if(fine)for(let i=0;i<steps;i++)box(shift(lower,0,.022,(i/(steps-1)-.5)*.73),.09,.036,.045,keyline);
    }
    function gills(t,sign,count){
        const p=mount(t,.56,sign);
        box(shift(p,sign*.025,0,0),.11,.29,.60,rubber);
        for(let i=0;i<count;i++){
            const a=shift(p,sign*.09,-.105,(i/(count-1)-.5)*.48);
            rod(a,shift(a,0,.21,.047),.019,alloy);
        }
    }
    function light(sign,big){
        const p=mount(.275,.18,sign), tip=shift(p,sign*.23,-.29,-.12),r=big?.205:.14;
        rod(shift(p,-sign*.09,.08,0),tip,.054,hardware);
        rod(shift(tip,0,0,.11),shift(tip,0,-.045,-.13),r,hardware,'metal',r*.86);
        rod(shift(tip,0,-.045,-.13),shift(tip,0,-.052,-.156),r*.78,big?'#fff0ad':'#75b4bf','glass');
        if(fine)rod(shift(tip,0,-.052,-.156),shift(tip,0,-.054,-.168),r*.37,'#dbf2eb','glass');
    }
    function fairing(t,sign,big){
        hullPod(t,.28,sign,[[-.92,.01,.028],[-.58,.015,.21],[.28,.008,big?.32:.225],[.65,0,.18],[.89,0,.035]],base);
        const p=mount(t,.28,sign);
        if(fine)for(const z of [-.42,.12,.44])box(shift(p,sign*.28,.12,z),.055,.05,.065,keyline);
    }
    function crown(t){
        const h=surface.hull(t);return vector(0,surface.top.sample(0,h.z) ?? h.top,h.z);
    }
    function antenna(t,slant){
        const p=crown(t);
        box(p,.13,.06,.25,hardware);
        rod(p,shift(p,0,.32,slant),.052,base,'enamel',.022);
    }
    function exhaust(sign,multiple){
        const count=multiple?6:3;
        for(let i=0;i<count;i++){
            const p=mount(.215+i*.012,.54,sign), end=shift(p,sign*.17,-.048,.08);
            rod(shift(p,-sign*.055,0,0),end,.068,'#8c6f59');rod(end,shift(end,sign*.012,-.005,.01),.044,rubber);
        }
    }
    function tailCone(twin){
        let h;
        for(let t=.97;t>.63;t-=.012){
            h=surface.hull(t,true);
            if(h && h.width>span*.025)break;
        }
        if(!h)throw Error('Missing exhaust station on '+id);
        const y=(h.top+h.bottom)*.5;
        for(const sign of twin?[-1,1]:[0]){
            const r=Math.min(height*.1,h.width*(twin?.42:.81)), x=sign*r*.9, end=Math.min(max[2]-.09,h.z+.36*u);
            const center=vector(x,y,end);
            rod(vector(x,y,h.z-.45*u),center,r/u*1.05,hardware,'metal',r/u);
            rod(center,shift(center,0,0,.018),r/u*.75,rubber);
            const n=fine?16:8;
            for(let i=0;i<n;i++){
                const a=i*Math.PI*2/n,p=vector(x+Math.cos(a)*r,y+Math.sin(a)*r,end);
                rod(vector(x+Math.cos(a)*r*1.08,y+Math.sin(a)*r*1.08,h.z-.20*u),p,.018,alloy);
            }
        }
    }
    function equipmentKit(code){
        for(const sign of [-1,1]){
            const p=mount(.46,.37,sign);
            switch(code){
            case 'boarding': case 'stairs': case 'steprail': ladder(sign,code==='stairs'?8:4);break;
            case 'freight': case 'portage': {
                const large=code==='freight', t=large?.54:.48;
                const pc=hullPod(t,.26,sign,[[-.81,0,.045],[-.63,0,.19],[.48,0,.19],[.7,0,.10],[.79,0,.035]],large?base:'#82664c');
                for(const z of [-.43,.34])box(shift(pc,sign*.235,.015,z),.08,.27,.065,large?hardware:'#4d4336');
                if(fine)for(const z of [-.40,.37])box(shift(pc,sign*.284,.012,z),.026,.08,.075,alloy);break; }
            case 'waterdoors':case 'sponsons':fairing(code==='waterdoors'?.55:.47,sign,true);break;
            case 'baffles':case 'louvers':case 'intakes':gills(code==='intakes'?.5:.26,sign,fine?7:3);break;
            case 'scoops':case 'duct':case 'radiator':{
                const pc=hullPod(code==='radiator'?.50:.395,.37,sign,[[-.55,0,.15],[-.40,0,.215],[.20,.01,.16],[.49,0,.03]],accent);
                rod(shift(pc,sign*.092,0,-.55),shift(pc,sign*.092,0,-.566),.105,rubber);break;}
            case 'stacks':case 'radial':exhaust(sign,code==='stacks');break;
            case 'bracing':{
                const chord=wingLine(.55);if(!chord)break;
                const top=vector(sign*span*.275,chord.y-.07*u,chord.z), foot=shift(p,0,-.1,.05);
                rod(foot,top,.019,hardware);if(fine)rod(shift(foot,0,0,.34),shift(top,0,0,-.26),.012,alloy);break;}
            case 'mooring':{
                const pc=mount(.34,.20,sign);for(let k=0;k<(fine?5:2);k++){
                    const center=shift(pc,sign*.035,.0,(k-2)*.049);
                    const g=new T.TorusGeometry(.132*u,.022*u,5,14);g.rotateY(Math.PI/2);add(g,'#ad8553','enamel',center);
                }break;}
            case 'winglet':case 'fence':{
                const edge=wingLine(code==='winglet'?.94:.78);if(!edge)break;
                const pt=vector(sign*edge.x,edge.y,edge.z);
                rod(shift(pt,0,-.02,0),shift(pt,sign*.10,code==='winglet'?.38:.14,.12),.07,accent,'enamel',.025);break;}
            case 'racing':{const pc=mount(.43,.42,sign);for(let i=0;i<3;i++)box(shift(pc,sign*.04,0,i*.11),.07,.17,.055,keyline);break;}
            case 'radome':if(sign===1)light(sign,false);break;
            case 'camera':case 'searchlight':if(sign===-1)light(sign,code==='searchlight');break;
            case 'winch':if(sign===1){
                const pc=mount(.44,.73,sign), tip=shift(pc,.34,.015,.08);
                rod(shift(pc,-.08,0,-.22),tip,.05);rod(shift(pc,-.08,0,.26),tip,.05);
                rod(shift(tip,0,0,-.17),shift(tip,0,0,.17),.145,accent,'enamel');
                for(const z of [-.17,.17])rod(shift(tip,0,0,z-.02),shift(tip,0,0,z+.02),.17,hardware);
                rod(tip,shift(tip,0,-.31,0),.016);box(shift(tip,0,-.32,0),.07,.085,.05,alloy);
            }break;
            case 'spine':case 'avionics':case 'probe':case 'hoop':case 'sight':case 'mirror':case 'petals':case 'doublejet':break;
            default:throw Error('Unknown equipment '+code);
            }
        }
        if(code==='spine'){
            for(let i=0;i<8;i++){const p=crown(.49+i*.025);box(p,.32-.024*i,.18-i*.014,.38,base,'enamel');}
        }else if(code==='hoop'||code==='sight'||code==='mirror'){
            const p=crown(.30),rise=code==='hoop'?.21:.085;
            for(const s of [-1,1])rod(shift(p,s*.10,0,0),shift(p,s*.065,rise,0),.017,hardware);
            box(shift(p,0,rise,0),.17,.052,.04,code==='mirror'?alloy:keyline);
        }else if(code==='avionics'||code==='probe')antenna(code==='probe'?.38:.55,code==='probe'?-.12:.16);
        else if(code==='petals'||code==='doublejet')tailCone(code==='doublejet');
    }
    function wingLine(fraction){
        const x=span*fraction*.5;
        let best=[],line=[];
        for(let i=8;i<=82;i++){
            const z=min[2]+length*i/100,y=surface.top.sample(x,z);
            if(y!==undefined)line.push({z,y});else{if(line.length>best.length)best=line;line=[];}
        }
        if(line.length>best.length)best=line;
        if(best.length<4)return null;
        const mid=best[Math.floor(best.length*.48)];
        return {x,...mid,chord:best.at(-1).z-best[0].z};
    }
    function cockpitWindows() {
        const eye=surface.eye;
        if(!eye)return;
        const cabinWidth=surface.hull(.26).width;
        const sample=(x,y)=>{
            const depth=surface.front.sample(x,y);
            return depth===undefined ? null : vector(x,y,-depth-.038*u);
        };
        const low=eye.y-.27*u, high=eye.y+.17*u;
        for(const sign of [-1,1]){
            const pane=(s,t)=>{
                const width=cabinWidth*(.73-.14*t),x=sign*(.035*u+width*s);
                return sample(x,low+(high-low)*t+s*.065*u);
            };
            const pts=[], cols=fine?8:4, rows=fine?5:3;
            for(let ix=0;ix<cols;ix++)for(let iy=0;iy<rows;iy++){
                const a=pane(ix/cols,iy/rows), b=pane(ix/cols,(iy+1)/rows);
                const c=pane((ix+1)/cols,(iy+1)/rows), d=pane((ix+1)/cols,iy/rows);
                if(!a||!b||!c||!d || Math.max(a.z,b.z,c.z,d.z)-Math.min(a.z,b.z,c.z,d.z)>.6*u)continue;
                for(const v of sign>0?[a,b,c,a,c,d]:[a,c,b,a,d,c])pts.push(...v.toArray());
            }
            if(!pts.length)continue;
            const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pts,3));g.computeVertexNormals();
            add(g,'#284e61','glass');
            // The rubber seals and wiper follow the same fitted shell as the glass.
            for(let edge=0;edge<4;edge++)for(let k=0;k<6;k++){
                const at=f=>edge<2?pane(edge,f):pane(f,edge-2);
                const a=at(k/6),b=at((k+1)/6);
                if(a&&b&&a.distanceTo(b)<.65*u)rod(a,b,.022,hardware);
            }
            if(fine){const a=pane(.70,.10),b=pane(.24,.48);if(a&&b)rod(shift(a,0,0,-.025),shift(b,0,0,-.025),.016,rubber);}
        }
    }
    if(['rescue_helicopter','coaxial_utility_helicopter','heavy_transport','tiltrotor_rescue_vtol','firefighting_flying_boat','twin_engine_commuter'].includes(id))cockpitWindows();
    for(const code of equipment)equipmentKit(code);

    // Race numerals are individually projected onto the voxel steps. They stay
    // on the wing when viewed from the pilot's chase camera.
    if(!['autogyro_patrol','coaxial_utility_helicopter','rescue_helicopter'].includes(id)){
        const line=wingLine(.58);
        if(line){
            const cell=Math.min(line.chord*.14,span*.022), vertices=[];
            for(let digit=0;digit<2;digit++)for(let j=0;j<15;j++){
                if(glyphs[Number(number[digit])][j]!=='1')continue;
                const x=-line.x+(digit*4+j%3-3.5)*cell,z=line.z+(Math.floor(j/3)-2.5)*cell;
                const corners=[[x,z],[x,z+cell],[x+cell,z+cell],[x+cell,z]].map(([xx,zz])=>[xx,surface.top.sample(xx,zz),zz]);
                if(corners.some(p=>p[1]===undefined)||Math.max(...corners.map(p=>p[1]))-Math.min(...corners.map(p=>p[1]))>cell*.8)continue;
                for(const index of [0,1,2,0,2,3]){const [xx,yy,zz]=corners[index];vertices.push(xx,yy+.011*u,zz);}
            }
            if(vertices.length){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.computeVertexNormals();add(g,keyline,'ink');}
        }
    }
    for(const [name,parts] of Object.entries(groups)){
        if(!parts.length)continue;
        const geometry=mergeGeometries(parts,false), mesh=new T.Mesh(geometry,materials[name]);
        mesh.name=id+'_'+name;root.add(mesh);
    }
    for(const hub of surface.hubs)root.add(makeRotor(hub,id,accent,fine));
    return root;
}

const directory='public/flight-fleet';await mkdir(directory,{recursive:true});const manifest={};
for(const spec of designs){
    const [id,body,accent,trim,pattern,number,beam,kits]=spec;
    const meta=catalog.find(m=>m.id===id), surface=await fitShell(meta,beam);
    for(const fine of [true,false]){
        const scene=buildParts(spec,surface,fine);
        const glb=await new GLTFExporter().parseAsync(scene,{binary:true});
        await writeFile(directory+'/'+id+(fine?'':'-far')+'.glb.gz',gzipSync(Buffer.from(glb),{level:9}));
    }
    manifest[id]={body,accent,trim,pattern,number,kits};
    console.log(id,kits.join(', '));
}
await writeFile('app/airrun/fleet-manifest.json',JSON.stringify(manifest,null,2)+'\n');
