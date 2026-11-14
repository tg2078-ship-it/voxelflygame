// Independent meshopt decode and original-image check after container repacking.
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
await MeshoptDecoder.ready;
const checkpoint=process.argv[2];
if(!checkpoint)throw new Error('Usage: node scripts/audit-shared-textures.mjs /path/to/asset-audit-400');
function glb(file){let b=fs.readFileSync(file);if(file.endsWith('.gz'))b=gunzipSync(b);const n=b.readUInt32LE(12);return {json:JSON.parse(b.subarray(20,20+n)),bin:b.subarray(28+n)};}
function decode(view,bin){const e=view.extensions.EXT_meshopt_compression;const result=new Uint8Array(e.count*e.byteStride);MeshoptDecoder.decodeGltfBuffer(result,e.count,e.byteStride,bin.subarray(e.byteOffset??0,(e.byteOffset??0)+e.byteLength),e.mode,e.filter);return Buffer.from(result);}
const report={status:'passed',models:400,visualExports:0,decodedMeshoptViews:0,decodedBytes:0,externalImageOccurrences:0,uniqueImages:0,gpuRenderedOrVerified:false};
const hashes=new Set();
for(const job of JSON.parse(fs.readFileSync(path.join(checkpoint,'jobs.json')))){
 const relative=job.destFile.split('/optimized/')[1];
 const before=glb(path.join(checkpoint,'optimized',relative));
 const after=glb(path.join('public/models',relative+'.gz'));
 const imageIndices=new Set((before.json.images??[]).map(i=>i.bufferView));
 const originalViews=before.json.bufferViews.filter((_,i)=>!imageIndices.has(i));
 if(originalViews.length!==after.json.bufferViews.length)throw new Error('View count mismatch '+job.id);
 for(let i=0;i<originalViews.length;i++){
  const a=originalViews[i],b=after.json.bufferViews[i];
  if(a.extensions?.EXT_meshopt_compression){
   const x=decode(a,before.bin),y=decode(b,after.bin);
   if(!x.equals(y))throw new Error('Decoded geometry/animation differs '+job.id+' '+job.lod+' '+i);
   report.decodedMeshoptViews++;report.decodedBytes+=x.length;
  }
 }
 for(let i=0;i<(before.json.images??[]).length;i++){
  const a=before.json.images[i],b=after.json.images[i],v=before.json.bufferViews[a.bufferView];
  const original=before.bin.subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength);
  if(!b.uri.startsWith('/models/textures/'))throw new Error('Unexpected image URI');
  const external=fs.readFileSync('public'+b.uri);
  if(!original.equals(external))throw new Error('Source image bytes differ '+job.id+' '+i);
  const hash=createHash('sha256').update(external).digest('hex');
  if(path.parse(b.uri).name!==hash)throw new Error('Image digest mismatch');
  hashes.add(hash);report.externalImageOccurrences++;
 }
 report.visualExports++;
}
report.uniqueImages=hashes.size;
if(report.visualExports!==1200||report.uniqueImages!==49||report.externalImageOccurrences!==11400)throw new Error('Incomplete source coverage');
fs.writeFileSync('docs/validation/asset-400-shared-texture-decode.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
