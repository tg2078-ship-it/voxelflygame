import { nativeFetch } from './image-runtime';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { ModelLibrary } from '../../app/airrun/assets';
import { normalizeModelSurfaces, smoothAuditedStoneBasePalette, AUDITED_STONE_BASE_MODELS } from '../../app/airrun/model-surface';
import { catalog } from './fixtures';
globalThis.fetch = async (url) => { if (/^(blob:|data:)/.test(String(url))) return nativeFetch(url); try { return new Response(await fs.readFile(path.join('public', String(url).split('?')[0]))); } catch { return new Response(null, { status: 404 }); } };
const library = new ModelLibrary(); library.byId = new Map(catalog);
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
let tested = 0, signalCount = 0, upperVertices = 0;
const contrastReports = [];
const contrast = (numbers: number[]) => { const values = numbers.sort((a,b)=>a-b); return values[Math.floor(values.length * .9)] / values[Math.floor(values.length * .1)]; };
const isStone = (mesh: T.Mesh) => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).every(material => ['AF_stone', 'V8_rock', 'V8_slate'].includes(material.name));
for (const id of AUDITED_STONE_BASE_MODELS) for (const lod of [1,2] as const) {
    const url = lod === 1 ? catalog.get(id)!.exports.lod1 : catalog.get(id)!.exports.lod2, compressed = await fs.readFile(path.join('public',url)), bytes = gunzipSync(compressed);
    const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength), ''); gltf.scene.updateMatrixWorld(true);
    const box = new T.Box3().setFromObject(gltf.scene), cutoff = box.min.y + (box.max.y - box.min.y) * .1;
    const saved: { mesh: T.Mesh; position: T.BufferAttribute | T.InterleavedBufferAttribute; color: Float32Array }[] = [], before: number[] = [], point = new T.Vector3();
    gltf.scene.traverse(n => { if (!(n instanceof T.Mesh)) return; const color = n.geometry.getAttribute('color'), position = n.geometry.getAttribute('position'); if (!color || !position) return;
        saved.push({ mesh: n, position, color: Float32Array.from({length:color.count*3},(_,i)=>color.getComponent(Math.floor(i/3),i%3)) });
        const stone = isStone(n);
        for(let i=0;i<position.count;i++) { point.fromBufferAttribute(position,i).applyMatrix4(n.matrixWorld); if(stone && point.y<cutoff) before.push(color.getX(i)*.2126+color.getY(i)*.7152+color.getZ(i)*.0722); }
    });
    const legacy = saved.some(s => (Array.isArray(s.mesh.material) ? s.mesh.material : [s.mesh.material]).every(material => material.name === 'AF_stone'));
    const result = smoothAuditedStoneBasePalette(gltf.scene,id,true);
    assert(legacy ? result.applied && result.verticesAdjusted > 0 : !result.applied, 'legacy correction never repaints the new V8 rock palette');
    const after: number[] = [];
    for(const s of saved) {
        assert.equal(s.mesh.geometry.getAttribute('position'),s.position,'native collision silhouette stays intact'); const color=s.mesh.geometry.getAttribute('color');
        const stone=isStone(s.mesh);
        for(let i=0;i<s.position.count;i++) { point.fromBufferAttribute(s.position,i).applyMatrix4(s.mesh.matrixWorld);
            if(stone && point.y<cutoff) after.push(color.getX(i)*.2126+color.getY(i)*.7152+color.getZ(i)*.0722);
            if(!legacy || !stone || point.y>=cutoff) { assert(Math.abs(color.getX(i)-s.color[i*3])<1e-6 && Math.abs(color.getY(i)-s.color[i*3+1])<1e-6 && Math.abs(color.getZ(i)-s.color[i*3+2])<1e-6,'native V8 palette, upper palette and foliage stay intact'); upperVertices++; }
        }
    }
    const nativeAtlas = saved.some(s => (Array.isArray(s.mesh.material) ? s.mesh.material : [s.mesh.material]).some(material => material.name === 'E12_SHARED_SURFACE'));
    assert(nativeAtlas ? !result.applied && before.length === 0 : before.length > 0 && (legacy ? contrast(after)<contrast(before) && contrast(after)<1.4 : contrast(after) < 1.65), 'legacy foot correction must preserve the Edition12 combined atlas palette');
    contrastReports.push({id,lod,nativeAtlas,before:before.length ? +contrast(before).toFixed(2) : null,after:after.length ? +contrast(after).toFixed(2) : null});
    assert(!smoothAuditedStoneBasePalette(gltf.scene,id,true).applied,'foot correction is idempotent');
    assert.deepEqual(new T.Box3().setFromObject(gltf.scene).min.toArray(),box.min.toArray()); assert.deepEqual(new T.Box3().setFromObject(gltf.scene).max.toArray(),box.max.toArray());
    gltf.scene.traverse(n=>{if(n instanceof T.Mesh){n.geometry.dispose();for(const m of Array.isArray(n.material)?n.material:[n.material])m.dispose();}}); tested++;
}
for (const aircraft of ['cessna_skyhawk','f16_fighting_falcon','l39_albatros','pitts_s2c']) {
    const gltf = await library.load(aircraft,0), colors = new Map<T.Mesh,unknown>(), signals = new Map<T.Material,[number,number,number,number]>();
    gltf.scene.traverse(n => { if (!(n instanceof T.Mesh)) return; colors.set(n,n.geometry.getAttribute('color')); for(const m of Array.isArray(n.material)?n.material:[n.material]) if(m instanceof T.MeshStandardMaterial && /^AF_light/.test(m.name)) signals.set(m,[m.emissive.r,m.emissive.g,m.emissive.b,m.emissiveIntensity]); });
    const report=normalizeModelSurfaces(gltf.scene); signalCount+=report.preservedSignals;
    gltf.scene.traverse(n=>{if(n instanceof T.Mesh)assert.equal(n.geometry.getAttribute('color'),colors.get(n),'aircraft palettes preserved');});
    for(const [m,values] of signals){const material=m as T.MeshStandardMaterial;assert.deepEqual([material.emissive.r,material.emissive.g,material.emissive.b,material.emissiveIntensity],values);}
    assert(!smoothAuditedStoneBasePalette(gltf.scene,aircraft,true).applied,'aircraft cannot be mistaken for terrain feet');tested++;
}
library.dispose();console.log(JSON.stringify({surfaceChecks:tested,upperVerticesPreserved:upperVertices,preservedSignals:signalCount,contrastReports,geometryPreserved:true,aircraftPalettesPreserved:true,gpuVerified:false,status:'passed'}));
