import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { posedGeometry, updateModelPose } from './model-pose';
import { shouldRenderModelSurface } from './model-surface';
export interface CompileAttribute { array: T.TypedArray; size: number; normalized: boolean; count: number; stride: number; offset: number; gpuType?: T.AttributeGPUType }
interface CompilePart { material: number; matrix: number[]; attributes: Record<string, CompileAttribute>; index?: T.TypedArray; range?: {start:number;count:number} }
export interface CompileRequest { id: number; parts: CompilePart[] }
export interface CompiledBuffer { material: number; attributes: Record<string, CompileAttribute>; index?: T.TypedArray; sphere: {center:number[];radius:number} }
export interface CompileReply { id: number; geometries?: CompiledBuffer[]; error?: string }
/** Match Three's material-group and draw-range intersection. A material can
 * appear in several disjoint groups; find(materialIndex) drops later faces. */
export function modelDrawGroups(geometry: T.BufferGeometry, multiMaterial: boolean) {
    const total = geometry.index?.count ?? geometry.getAttribute('position').count;
    const drawStart = Math.max(0, geometry.drawRange.start), drawEnd = Math.min(total, drawStart + geometry.drawRange.count);
    const groups = multiMaterial ? geometry.groups : [{ start: 0, count: total, materialIndex: 0 }];
    return groups.flatMap(group => {
        const start = Math.max(drawStart, group.start), end = Math.min(drawEnd, group.start + group.count);
        return end > start ? [{ slot: group.materialIndex ?? 0, range: start === 0 && end === total ? undefined : { start, count: end - start } }] : [];
    });
}
function describe(a: T.BufferAttribute | T.InterleavedBufferAttribute): CompileAttribute {
    const interleaved=(a as T.InterleavedBufferAttribute).isInterleavedBufferAttribute ? a as T.InterleavedBufferAttribute : null;
    return {array:a.array,size:a.itemSize,normalized:a.normalized,count:a.count,stride:interleaved?.data.stride??a.itemSize,offset:interleaved?.offset??0,gpuType:(a as T.BufferAttribute).gpuType};
}
function snapshot(a: T.BufferAttribute | T.InterleavedBufferAttribute) {
    const value=describe(a);
    // Decoder views may share a huge backing allocation. Copy only this accessor's
    // span, then transfer our private copy; never clone/transfer the live source heap.
    const end=value.offset+(value.count-1)*value.stride+value.size;
    return {...value,array:value.array.slice(value.offset,end),offset:0};
}
export function packModelCompile(root: T.Object3D) {
    const materials: T.Material[] = [], parts: CompilePart[] = [];
    const attributes = new WeakMap<T.BufferGeometry, Record<string,CompileAttribute>>();
    updateModelPose(root);
    root.traverse(node=>{
        if(!(node instanceof T.Mesh)||!shouldRenderModelSurface(node))return;
        const baked=posedGeometry(node), geometry=baked.geometry;
        let attrs=attributes.get(geometry);if(!attrs){attrs=Object.fromEntries(Object.entries(geometry.attributes).map(([name,a])=>[name,snapshot(a as T.BufferAttribute | T.InterleavedBufferAttribute)]));attributes.set(geometry,attrs);}
        const list=Array.isArray(node.material)?node.material:[node.material];
        for (const {slot,range} of modelDrawGroups(geometry, Array.isArray(node.material))) {
            const material=list[slot]; if(!material)continue;
            let materialIndex=materials.indexOf(material);if(materialIndex<0){materialIndex=materials.length;materials.push(material);}
            parts.push({material:materialIndex,matrix:node.matrixWorld.toArray(),attributes:attrs!,index:geometry.index?.array.slice(),range});
        }
        if(baked.owned)geometry.dispose();
    });
    return {parts,materials};
}
/** Copy private transfer buffers in short tasks. Interleaved attributes and
 * material groups share a single copy of their data instead of repeating it. */
export async function packModelCompileAsync(root: T.Object3D, cancelled = () => false, budgetMs = 3) {
    const materials: T.Material[] = [], parts: CompilePart[] = [], nodes: T.Mesh[] = [];
    const attributes = new WeakMap<T.BufferGeometry, Record<string, CompileAttribute>>();
    const indices = new WeakMap<T.BufferGeometry, T.TypedArray>();
    const interleaved = new WeakMap<T.InterleavedBuffer, T.TypedArray>();
    let deadline = performance.now() + budgetMs;
    const checkpoint = async () => {
        if (cancelled()) throw new Error('Model preparation cancelled');
        if (performance.now() >= deadline) {
            await new Promise(resolve => setTimeout(resolve, 0)); deadline = performance.now() + budgetMs;
            if (cancelled()) throw new Error('Model preparation cancelled');
        }
    };
    const copy = async (source: T.TypedArray, length: number) => {
        const Constructor = source.constructor as { new(length: number): T.TypedArray };
        const result = new Constructor(length), chunk = Math.max(1, Math.floor(262144 / source.BYTES_PER_ELEMENT));
        for (let start = 0; start < length; start += chunk) {
            await checkpoint(); result.set(source.subarray(start, Math.min(length, start + chunk)), start);
        }
        return result;
    };
    updateModelPose(root);
    root.traverse(node => { if (node instanceof T.Mesh && shouldRenderModelSurface(node)) nodes.push(node); });
    for (const node of nodes) {
        await checkpoint(); const baked = posedGeometry(node), geometry = baked.geometry;
        let attrs = attributes.get(geometry);
        if (!attrs) {
            attrs = {};
            for (const [name, a] of Object.entries(geometry.attributes)) {
                const attr = a as T.BufferAttribute | T.InterleavedBufferAttribute, value = describe(attr);
                if ((attr as T.InterleavedBufferAttribute).isInterleavedBufferAttribute) {
                    const data = (attr as T.InterleavedBufferAttribute).data;
                    let buffer = interleaved.get(data);
                    if (!buffer) { buffer = await copy(data.array, data.count * data.stride); interleaved.set(data, buffer); }
                    attrs[name] = { ...value, array: buffer };
                } else attrs[name] = { ...value, array: await copy(value.array, value.count * value.size), offset: 0 };
            }
            attributes.set(geometry, attrs);
        }
        let index = indices.get(geometry);
        if (!index && geometry.index) { index = await copy(geometry.index.array, geometry.index.count); indices.set(geometry, index); }
        const list = Array.isArray(node.material) ? node.material : [node.material];
        for (const { slot, range } of modelDrawGroups(geometry, Array.isArray(node.material))) {
            const material = list[slot]; if (!material) continue;
            let materialIndex = materials.indexOf(material);
            if (materialIndex < 0) { materialIndex = materials.length; materials.push(material); }
            parts.push({ material: materialIndex, matrix: node.matrixWorld.toArray(), attributes: attrs!, index, range });
        }
        if (baked.owned) geometry.dispose();
    }
    return { parts, materials };
}
function attribute(a: CompileAttribute, transform: boolean) {
    const Constructor=a.array.constructor as {new(length:number):T.TypedArray};
    const data=transform?new Float32Array(a.count*a.size):new Constructor(a.count*a.size);
    const signed=a.array instanceof Int8Array||a.array instanceof Int16Array;
    const divisor=!transform||!a.normalized?1:a.array instanceof Uint16Array?65535:a.array instanceof Int16Array?32767:a.array instanceof Uint8Array?255:a.array instanceof Int8Array?127:1;
    for(let i=0;i<a.count;i++)for(let j=0;j<a.size;j++){const v=a.array[i*a.stride+a.offset+j]/divisor;data[i*a.size+j]=transform&&signed&&a.normalized?Math.max(-1,v):v;}
    const result=new T.BufferAttribute(data,a.size,transform?false:a.normalized);if(!transform&&a.gpuType!==undefined)result.gpuType=a.gpuType;return result;
}
export function compileModelBuffers(request: CompileRequest): CompileReply {
    const groups=new Map<number,T.BufferGeometry[]>();
    for(const part of request.parts){
        const g=new T.BufferGeometry();for(const [name,a]of Object.entries(part.attributes))g.setAttribute(name,attribute(a,name==='position'||name==='normal'));
        if(part.index){const index=part.range?part.index.slice(part.range.start,part.range.start+part.range.count):part.index;g.setIndex(new T.BufferAttribute(index,1));}
        else g.setIndex(Array.from({length:part.range?.count??g.getAttribute('position').count},(_,i)=>(part.range?.start??0)+i));
        g.applyMatrix4(new T.Matrix4().fromArray(part.matrix));const list=groups.get(part.material)??[];list.push(g);groups.set(part.material,list);
    }
    const geometries:CompiledBuffer[]=[];
    for(const [material,list]of groups){
        const g=list.length===1?list[0]:mergeGeometries(list,false);if(!g)throw new Error('Incompatible source geometry attributes');
        g.computeBoundingSphere();geometries.push({material,attributes:Object.fromEntries(Object.entries(g.attributes).map(([name,a])=>[name,describe(a as T.BufferAttribute | T.InterleavedBufferAttribute)])),index:g.index?.array,sphere:{center:g.boundingSphere!.center.toArray(),radius:g.boundingSphere!.radius}});
        for(const source of list)source.dispose();if(list.length>1)g.dispose();
    }
    return {id:request.id,geometries};
}
export function unpackCompiled(buffer: CompiledBuffer) {
    const g=new T.BufferGeometry();for(const [name,a]of Object.entries(buffer.attributes)) {const attr=new T.BufferAttribute(a.array,a.size,a.normalized);if(a.gpuType!==undefined)attr.gpuType=a.gpuType;g.setAttribute(name,attr);}
    if(buffer.index)g.setIndex(new T.BufferAttribute(buffer.index,1));g.boundingSphere=new T.Sphere(new T.Vector3().fromArray(buffer.sphere.center),buffer.sphere.radius);return g;
}
