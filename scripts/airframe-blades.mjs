// Build airfoil sections around the original animated shaft, in its local frame.
import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
const bladeCounts={dhc2_beaver:3,stearman_model_75:2,pitts_s2c:2,extra_330lx:3,p51d_mustang:4,
    canard_pusher_scout:3,twin_engine_commuter:4,heavy_transport:4,autogyro_patrol:2,coaxial_utility_helicopter:3,rescue_helicopter:4};
export function makeRotor(hub,id,accent,fine){
    const {radius:r,axis}=hub, rotor=axis==='y', tail=axis==='x';
    const count=tail?4:bladeCounts[id] ?? 3, pieces=[];
    // Work in a frame with +Y along the shaft, then rotate the finished rotor.
    function add(geometry,color){
        const g=geometry.index?geometry.toNonIndexed():geometry, p=g.getAttribute('position'), c=new T.Color(color);
        const v=new Uint8Array(p.count*3);
        for(let i=0;i<v.length;i+=3){v[i]=Math.round(c.r*255);v[i+1]=Math.round(c.g*255);v[i+2]=Math.round(c.b*255);}
        g.deleteAttribute('uv');g.setAttribute('color',new T.Uint8BufferAttribute(v,3,true));pieces.push(g);
    }
    const cuff=rotor?.052:.14, bladeWidth=rotor?.070:.152;
    for(let k=0;k<count;k++){
        const phase=k*Math.PI*2/count+(hub.name==='main_rotor_1'?Math.PI/count:0);
        // Leading edge, crown, tapered trailing edge and underside of a twisted blade.
        const stations=[[.07,.22,0],[.18,.50,0],[.32,1,0],[.64,.90,.014],[.83,.80,.026],[.89,.77,.030],[.965,.62,.047],[1,.31,.062]];
        const ring=([length,width,sweep])=>[[0,0],[.18,.12],[.54,.10],[1,0],[.36,-.08]].map(([chord,h])=>{
            const w=r*bladeWidth*width;
            return [length*r,(h+(chord-.4)*(.32-.29*length))*w,(chord-.4)*w+sweep*r];
        });
        for(let i=1;i<stations.length;i++){
            const a=ring(stations[i-1]), b=ring(stations[i]), p=[];
            for(let j=0;j<a.length;j++){
                const h=(j+1)%a.length;
                p.push(...a[j],...b[h],...b[j],...a[j],...a[h],...b[h]);
            }
            if(i===stations.length-1)for(let n=1;n<b.length-1;n++)p.push(...b[0],...b[n],...b[n+1]);
            const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.computeVertexNormals();g.rotateY(phase);
            add(g,i===6?'#e8ddac':i===7?accent:i===1?'#9ea8a3':rotor?'#324048':'#384047');
        }
        const collar=new T.BoxGeometry(r*cuff*1.2,r*cuff*.58,r*cuff*.66);collar.translate(r*.14,0,0).rotateY(phase);add(collar,'#8b9694');
        if(fine){
            const bolt=new T.CylinderGeometry(r*.014,r*.014,r*.022,8);bolt.translate(r*.14,r*cuff*.32,0).rotateY(phase);add(bolt,'#d8ddd3');
        }
    }
    if(rotor && fine){
        const plate=new T.CylinderGeometry(r*.068,r*.054,r*.014,16);plate.translate(0,-r*.035,0);add(plate,'#626c70');
        for(let k=0;k<count;k++){
            const a=k*Math.PI*2/count, arm=new T.CylinderGeometry(r*.006,r*.006,r*.051,6);
            arm.rotateZ(-.45);arm.translate(r*.079,-r*.014,r*.021);arm.rotateY(a);add(arm,'#acb7b2');
        }
    }
    add(new T.CylinderGeometry(r*cuff*.72,r*cuff*1.08,r*cuff, fine?16:8),'#a2aca8');
    const spinner=new T.ConeGeometry(r*cuff*.8,r*cuff*(rotor?.55:1.60),fine?16:8);
    spinner.translate(0,r*cuff*(rotor?.56:1.08),0);add(spinner,rotor?'#697679':accent);
    const g=mergeGeometries(pieces,false);
    if(axis==='z')g.rotateX(-Math.PI/2);else if(axis==='x')g.rotateZ(-Math.PI/2);
    g.translate(axis==='x'?hub.centre:0,axis==='y'?hub.centre:0,axis==='z'?hub.centre:0);
    const mesh=new T.Mesh(g,new T.MeshStandardMaterial({name:'Blade laminates',vertexColors:true,metalness:.28,roughness:.47,side:T.DoubleSide}));
    mesh.name='Shaft__'+hub.name;return mesh;
}
