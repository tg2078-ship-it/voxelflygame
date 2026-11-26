import * as T from 'three';
import designs from './fleet-manifest.json';
import { AIRFRAME_REVISION } from './data';
import type { AssetMeta } from './types';

type Design = (typeof designs)[keyof typeof designs];
const fleet: Record<string, Design> = designs;
const patterns = ['expedition', 'heritage', 'checker', 'flash', 'trainer', 'sweep', 'tide', 'freight', 'rescue'];
export function equipmentPath(model: string, lod: number) {
    return Object.hasOwn(fleet,model) ? '/flight-fleet/' + model + (lod >= 2 ? '-far' : '') + '.glb.gz?v=' + AIRFRAME_REVISION : undefined;
}

const enamelShader = `
varying vec4 vAirframe;
uniform vec3 airColor, airAccent, airTrim;
uniform int airPattern;
vec3 enamel(vec3 grain) {
    float x=abs(vAirframe.x*2.0-1.0), y=vAirframe.y, z=vAirframe.z;
    vec3 paint=airColor;
    if(x>.25){
        if(airPattern==2 && x>.55){
            if(mod(floor(x*18.)+floor(z*26.),2.)>.5)paint=airAccent;
        }else if(airPattern==1){
            if(x>.89 || (x>.65 && x<.70))paint=airAccent;
            else if(x>.83 && x<.855)paint=airTrim;
        }else{
            float slash=x+(airPattern==3?-.88:airPattern==5?.92:-.30)*(z-.42);
            if(slash>.82 || (slash>.60 && slash<.645))paint=airAccent;
            else if(slash>.765 && slash<.797)paint=airTrim;
        }
    }else if(z>.77 && y>.59){
        float tail=z-.22*y;
        if(tail>.66 && tail<.73)paint=airAccent;
        else if(tail>.63 && tail<=.65)paint=airTrim;
    }else{
        float line=airPattern==3?.39+.45*abs(z-.49):airPattern==6?.51-.10*cos(z*6.283185):
            airPattern==5?.30+.46*z:airPattern==7?.34+.12*z:.40+.17*z;
        float d=y-line;
        if(abs(d)<.060 || (airPattern==0 && d<-.19))paint=airAccent;
        else if(d>.068 && d<.098)paint=airTrim;
        if(airPattern==8){
            if((z>.48 && z<.64)||(z>.22 && z<.27))paint=airAccent;
            else if((z>.45 && z<.465)||(z>.65 && z<.666))paint=airTrim;
        }
    }
    float peak=max(grain.r,max(grain.g,grain.b));
    return mix(grain,paint*(.70+.32*peak),step(.5,vAirframe.w)*smoothstep(.072,.105,peak));
}
`;
interface Paint { body: T.Color; accent: T.Color; trim: T.Color }
const inks=new WeakMap<T.Material,Paint>();

// Called on each private skin material as well as the shared gallery finish.
// Shader hooks are not copied by Three's Material.clone().
export function bindAirframeFinish(material: T.MeshStandardMaterial) {
    const design=fleet[material.userData.airframeDesign];
    if(!design || inks.has(material)) return;
    const ink={body:new T.Color(design.body),accent:new T.Color(design.accent),trim:new T.Color(design.trim)};
    inks.set(material,ink);
    material.onBeforeCompile = shader => {
        shader.uniforms.airColor={value:ink.body}; shader.uniforms.airAccent={value:ink.accent};
        shader.uniforms.airTrim={value:ink.trim}; shader.uniforms.airPattern={value:patterns.indexOf(design.pattern)};
        shader.vertexShader='attribute vec4 airframeCoord; varying vec4 vAirframe;\n'+shader.vertexShader
            .replace('#include <begin_vertex>', '#include <begin_vertex>\n vAirframe=airframeCoord;');
        shader.fragmentShader=enamelShader+shader.fragmentShader.replace('#include <color_fragment>',
            '#ifdef USE_COLOR_ALPHA\n diffuseColor *= vec4(enamel(vColor.rgb),vColor.a);\n#elif defined(USE_COLOR)\n diffuseColor.rgb *= enamel(vColor.rgb);\n#endif');
    };
    material.customProgramCacheKey=()=>AIRFRAME_REVISION;
}
export function setAirframeFinish(material:T.Material, body?:T.Color, accent?:T.Color) {
    const ink=inks.get(material);
    if(!ink)return false;
    const design=fleet[material.userData.airframeDesign];
    if(body && accent){ink.body.copy(body);ink.accent.copy(accent);}
    else {ink.body.set(design.body);ink.accent.set(design.accent);}
    return true;
}
export function finishAirframe(scene: T.Group, meta: AssetMeta) {
    if (!Object.hasOwn(fleet,meta.id)) return;
    const [width,height,length]=meta.bounds.size,[minX,minY,minZ]=meta.bounds.min;
    const point=new T.Vector3(), unit=(v:number)=>Math.round(T.MathUtils.clamp(v,0,1)*65535);
    scene.updateMatrixWorld(true);
    scene.traverse(mesh=>{
        if (!(mesh instanceof T.Mesh) || mesh.material.name!=='E12_SHARED_SURFACE') return;
        const geometry=mesh.geometry, uv=geometry.getAttribute('uv'), vertices=geometry.getAttribute('position');
        if (!uv || !geometry.getAttribute('color')) return;
        if(mesh instanceof T.SkinnedMesh)mesh.skeleton.update();
        const coords=new Uint16Array(vertices.count*4);
        for(let i=0;i<vertices.count;i++){
            mesh.getVertexPosition(i,point).applyMatrix4(mesh.matrixWorld);
            coords[i*4]=unit((point.x-minX)/width);coords[i*4+1]=unit((point.y-minY)/height);
            coords[i*4+2]=unit((point.z-minZ)/length);
            coords[i*4+3]=uv.getX(i)<.25 && uv.getY(i)<.25 ? 65535 : 0;
        }
        geometry.setAttribute('airframeCoord',new T.Uint16BufferAttribute(coords,4,true));
        mesh.material.userData.airframeDesign=meta.id;
        bindAirframeFinish(mesh.material);
    });
}

/** Install replacement blades on the moving source pivot. Some distant files
 * already batch their blades into a skinned mesh. Keep that driven surface. */
export function installEquipment(scene: T.Group, kit: T.Group) {
    const retired = new Set<T.BufferGeometry>();
    const blades: T.Mesh[] = [];
    kit.traverse(node => { if (node instanceof T.Mesh && node.name.startsWith('Shaft__')) blades.push(node); });
    for (const blade of blades) {
        const pivot = scene.getObjectByName(blade.name.slice('Shaft__'.length));
        const replaced: T.Mesh[] = [];
        pivot?.traverse(node => { if (node instanceof T.Mesh && !(node instanceof T.SkinnedMesh)) replaced.push(node); });
        if (pivot && replaced.length) {
            for (const mesh of replaced) { mesh.removeFromParent(); retired.add(mesh.geometry); }
            pivot.add(blade);
        } else {
            blade.removeFromParent();
            if (blade instanceof T.Mesh) {
                retired.add(blade.geometry);
                for (const m of Array.isArray(blade.material)?blade.material:[blade.material]) m.dispose();
            }
        }
    }
    scene.add(kit);
    scene.traverse(node => { if (node instanceof T.Mesh) retired.delete(node.geometry); });
    for (const g of retired) g.dispose();
}
