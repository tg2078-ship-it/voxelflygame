// Offline fitting jig. Sample the opaque, fixed shell rather than the swept
// box of a moving propeller, open door or retracted landing gear.
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

globalThis.self ??= globalThis;
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
loader.register(() => ({name:'FITTING_JIG', loadTexture: () => Promise.resolve(new T.Texture())}));
const N = 224;
class Projection {
    constructor(low, high) {
        this.low = low;
        this.high = high;
        this.values = new Float32Array(N*N).fill(-Infinity);
    }
    pixel(u,v) { return [(u-this.low[0])/(this.high[0]-this.low[0])*(N-1), (v-this.low[1])/(this.high[1]-this.low[1])*(N-1)]; }
    triangle(a,b,c) {
        const [x,y]=this.pixel(a[0],a[1]), [x1,y1]=this.pixel(b[0],b[1]), [x2,y2]=this.pixel(c[0],c[1]);
        const ux=x1-x, uy=y1-y, vx=x2-x, vy=y2-y, area=ux*vy-uy*vx;
        if (Math.abs(area)<1e-7) return;
        const xMin=Math.max(0,Math.ceil(Math.min(x,x1,x2))), xMax=Math.min(N-1,Math.floor(Math.max(x,x1,x2)));
        const yMin=Math.max(0,Math.ceil(Math.min(y,y1,y2))), yMax=Math.min(N-1,Math.floor(Math.max(y,y1,y2)));
        for(let row=yMin;row<=yMax;row++) for(let col=xMin;col<=xMax;col++){
            const s=((col-x)*vy-(row-y)*vx)/area, t=(ux*(row-y)-uy*(col-x))/area;
            if(s<-.001 || t<-.001 || s+t>1.001) continue;
            const i=row*N+col;
            this.values[i]=Math.max(this.values[i],a[2]+s*(b[2]-a[2])+t*(c[2]-a[2]));
        }
    }
    sample(a,b) {
        const [x,y]=this.pixel(a,b).map(Math.round);
        if (x<0 || y<0 || x>=N || y>=N) return undefined;
        const value=this.values[y*N+x];
        return Number.isFinite(value) ? value : undefined;
    }
}
export async function fitShell(meta, beam) {
    const bytes=gunzipSync(await readFile('public'+meta.exports.lod0));
    const {scene}=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'');
    scene.updateMatrixWorld(true);
    const {min,max,size}=meta.bounds, [sx,sy,sz]=size, top=new Projection([min[0],min[2]],[max[0],max[2]]),
        belly=new Projection([min[0],min[2]],[max[0],max[2]]), side=new Projection([min[2],min[1]],[max[2],max[1]]),
        front=new Projection([-sx*beam,min[1]],[sx*beam,max[1]]);
    scene.traverse(mesh=>{
        if(!mesh.isMesh) return;
        const names=mesh.parent?.name+' '+mesh.geometry.name+' '+mesh.name;
        let shell=false;
        for(let p=mesh;p;p=p.parent) if(/static_shell/.test(p.name)) shell=true;
        if(!shell && !mesh.isSkinnedMesh && !/static_shell/.test(names)) return;
        const index=mesh.geometry.index, pos=mesh.geometry.attributes.position, joints=mesh.geometry.attributes.skinIndex;
        const points=new Array(pos.count), v=new T.Vector3();
        if(mesh.isSkinnedMesh)mesh.skeleton.update();
        for(let i=0;i<pos.count;i++){
            if(mesh.isSkinnedMesh && joints && !/static_shell/i.test(mesh.skeleton.bones[joints.getX(i)]?.name ?? '')) continue;
            mesh.getVertexPosition(i,v).applyMatrix4(mesh.matrixWorld);
            points[i]=[v.x,v.y,v.z];
        }
        for(let i=0;i<(index?.count ?? pos.count);i+=3) {
            const a=points[index?index.getX(i):i], b=points[index?index.getX(i+1):i+1], c=points[index?index.getX(i+2):i+2];
            if(!a || !b || !c) continue;
            const tri=[a,b,c];
            top.triangle(...tri.map(([x,y,z])=>[x,z,y]));
            belly.triangle(...tri.map(([x,y,z])=>[x,z,-y]));
            if(tri.every(v=>v[2]<min[2]+sz*.42)) front.triangle(...tri.map(([x,y,z])=>[x,y,-z]));
            if(tri.every(v=>v[0]<sx*beam && v[0]>=-.001))side.triangle(...tri.map(([x,y,z])=>[z,y,x]));
        }
    });
    function hull(t, optional=false) {
        const z=min[2]+t*sz, rows=[];
        for(let i=0;i<N;i++){
            const y=min[1]+sy*i/(N-1), x=side.sample(z,y);
            if(x!==undefined && x>sx*beam*.08) rows.push([y,x]);
        }
        if(!rows.length && optional)return null;
        if(!rows.length)throw Error(meta.id+' has no hull section at '+t);
        const width=Math.max(...rows.map(r=>r[1]));
        const body=rows.filter(r=>r[1]>=width*.40);
        return {z,bottom:body[0][0],top:body.at(-1)[0],width};
    }
    const hubs=[];
    scene.traverse(pivot=>{
        if(!/^(main_rotor(?:_\d+)?|tail_rotor|propeller(?:_\d+)?|pusher_propeller|rear_pusher)$/.test(pivot.name))return;
        const axis=pivot.name==='tail_rotor'?'x':pivot.name.startsWith('main_rotor')?'y':'z';
        const inverse=pivot.matrixWorld.clone().invert(), point=new T.Vector3();
        let radius=0, axialMin=Infinity, axialMax=-Infinity;
        pivot.traverse(mesh=>{
            if(!mesh.isMesh || mesh.isSkinnedMesh)return;
            const positions=mesh.geometry.getAttribute('position'), transform=inverse.clone().multiply(mesh.matrixWorld);
            for(let i=0;i<positions.count;i++){
                point.fromBufferAttribute(positions,i).applyMatrix4(transform);
                axialMin=Math.min(axialMin,point[axis]);axialMax=Math.max(axialMax,point[axis]);
                point[axis]=0;radius=Math.max(radius,point.length());
            }
        });
        if(radius>.12)hubs.push({name:pivot.name,axis,radius,centre:(axialMin+axialMax)*.5});
    });
    const eye=scene.getObjectByName('socket_pilot_eye')?.getWorldPosition(new T.Vector3());
    return {min,max,size,top,belly,hull,side,hubs,front,eye};
}
