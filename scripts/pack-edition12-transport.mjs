/** Repack Edition12 without changing topology, positions, UVs, rigs or images.
 * Only normalized 16-bit vertex colors use the standard KHR meshopt COLOR filter.
 * Every decoded component is checked before a file is written.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { MeshoptEncoder } from '../node_modules/.pnpm/meshoptimizer@1.1.1/node_modules/meshoptimizer/meshopt_encoder.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const [inputArg, outputArg, bitsArg = '12', aircraftBitsArg = '14'] = process.argv.slice(2);
if (!inputArg || !outputArg) throw Error('Usage: node scripts/pack-edition12-transport.mjs INPUT_MODELS OUTPUT_MODELS [COLOR_BITS] [AIRCRAFT_COLOR_BITS]');
const input = path.resolve(inputArg), output = path.resolve(outputArg), environmentBits = Number(bitsArg), aircraftBits = Number(aircraftBitsArg);
if (input === output || ![environmentBits, aircraftBits].every(n => [12, 14, 16].includes(n))) throw Error('Use separate input/output directories and 12, 14 or 16 color bits');
const catalog = JSON.parse(fs.readFileSync(path.join(input, 'catalog.json'), 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const rows = [];
function sameTriangles(a, b, width) {
    const C = width === 2 ? Uint16Array : Uint32Array;
    const aa = new C(a.buffer, a.byteOffset, a.byteLength / width), bb = new C(b.buffer, b.byteOffset, b.byteLength / width);
    for (let i = 0; i < aa.length; i += 3) {
        let same = false;
        for (let r = 0; r < 3; r++) if (aa[i] === bb[i + r] && aa[i + 1] === bb[i + (r + 1) % 3] && aa[i + 2] === bb[i + (r + 2) % 3]) same = true;
        if (!same) throw Error('Triangle or winding changed');
    }
}
for (const asset of catalog.assets.filter(a => a.edition === 12)) for (const [lod, url] of Object.entries(asset.exports)) {
    const bits = asset.category === 'aircraft' ? aircraftBits : environmentBits;
    const relative = url.replace(/^\/models\//, ''), sourcePath = path.resolve(input, relative), destination = path.resolve(output, relative);
    if (!sourcePath.startsWith(input + path.sep) || !destination.startsWith(output + path.sep)) throw Error('Invalid model path');
    const source = fs.readFileSync(sourcePath), raw = gunzipSync(source), length = raw.readUInt32LE(12);
    const original = JSON.parse(raw.subarray(20, 20 + length)), doc = structuredClone(original), binary = raw.subarray(28 + length);
    const colors = new Set();
    for (const mesh of doc.meshes) for (const primitive of mesh.primitives) if (primitive.attributes.COLOR_0 !== undefined) {
        const a = doc.accessors[primitive.attributes.COLOR_0];
        if (a.componentType !== 5123 || !a.normalized || a.type !== 'VEC4') throw Error('Unexpected vertex color format');
        colors.add(a.bufferView);
    }
    const chunks = []; let offset = 0, maximumColorError = 0, colorComponents = 0, changedColorComponents = 0, verifiedAttributes = 0;
    for (let i = 0; i < doc.bufferViews.length; i++) {
        const view = doc.bufferViews[i], extension = view.extensions?.EXT_meshopt_compression;
        if (!extension) throw Error('Expected the preceding lossless Edition12 import');
        const compressed = binary.subarray(extension.byteOffset, extension.byteOffset + extension.byteLength), decoded = new Uint8Array(extension.count * extension.byteStride);
        MeshoptDecoder.decodeGltfBuffer(decoded, extension.count, extension.byteStride, compressed, extension.mode, extension.filter);
        let transformed = decoded;
        if (colors.has(i)) {
            if (extension.byteStride !== 8 || extension.mode !== 'ATTRIBUTES') throw Error('Unexpected color stride');
            const values = new Uint16Array(decoded.buffer);
            transformed = MeshoptEncoder.encodeFilterColor(Float32Array.from(values, n => n / 65535), extension.count, 8, bits);
            extension.filter = 'COLOR';
        }
        const encoded = extension.mode === 'ATTRIBUTES'
            ? MeshoptEncoder.encodeVertexBufferLevel(transformed, extension.count, extension.byteStride, 3, 1)
            : MeshoptEncoder.encodeGltfBuffer(transformed, extension.count, extension.byteStride, extension.mode, 1);
        const check = new Uint8Array(decoded.length);
        // Use the exact decoder shipped by the game's Three.js installation.
        MeshoptDecoder.decodeGltfBuffer(check, extension.count, extension.byteStride, encoded, extension.mode, extension.filter);
        if (colors.has(i)) {
            const a = new Uint16Array(decoded.buffer), b = new Uint16Array(check.buffer);
            for (let k = 0; k < a.length; k++) {
                const error = Math.abs(a[k] - b[k]);
                if (k % 4 === 3 && error) throw Error('Opacity changed');
                maximumColorError = Math.max(maximumColorError, error); colorComponents++;
                if (error) changedColorComponents++;
            }
            if (maximumColorError > (bits === 16 ? 1 : bits === 14 ? 6 : 24)) throw Error('Color precision exceeds its bound');
        } else if (extension.mode === 'TRIANGLES') sameTriangles(decoded, check, extension.byteStride);
        else if (!Buffer.from(decoded).equals(Buffer.from(check))) throw Error('Non-color attribute changed');
        verifiedAttributes++;
        const pad = (-offset) & 3; if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
        extension.byteOffset = offset; extension.byteLength = encoded.length;
        view.extensions = { ...view.extensions, KHR_meshopt_compression: extension }; delete view.extensions.EXT_meshopt_compression;
        chunks.push(Buffer.from(encoded)); offset += encoded.length;
    }
    doc.buffers[0].byteLength = offset;
    doc.buffers[1].extensions = { KHR_meshopt_compression: { fallback: true } };
    for (const key of ['extensionsUsed', 'extensionsRequired']) doc[key] = doc[key].map(name => name === 'EXT_meshopt_compression' ? 'KHR_meshopt_compression' : name);
    for (const key of ['accessors', 'nodes', 'meshes', 'animations', 'skins', 'materials', 'textures', 'images', 'samplers', 'scenes', 'scene']) if (JSON.stringify(doc[key]) !== JSON.stringify(original[key])) throw Error('Model definition changed: ' + key);
    const json = Buffer.from(JSON.stringify(doc)), jp = (-json.length) & 3, bin = Buffer.concat(chunks), bp = (-bin.length) & 3;
    const header = Buffer.alloc(20); header.write('glTF'); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + json.length + jp + bin.length + bp, 8); header.writeUInt32LE(json.length + jp, 12); header.write('JSON', 16);
    const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length + bp); bh.write('BIN\0', 4);
    const result = gzipSync(Buffer.concat([header, json, Buffer.alloc(jp, 32), bh, bin, Buffer.alloc(bp)]), { level: 9 });
    fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, result);
    rows.push({ id: asset.id, lod, sourceBytes: source.length, bytes: result.length, sourceSha256: sha(source), runtimeSha256: sha(result), colorBits: bits, maximumColorErrorU16: maximumColorError, colorComponents, changedColorComponents, verifiedAttributes, alphaUnchanged: true, allNonColorAttributesExact: true, triangleWindingPreserved: true, addedPositionErrorM: 0 });
    if (rows.length % 40 === 0) console.log(JSON.stringify({ modelsPacked: rows.length, bytes: rows.reduce((s, r) => s + r.bytes, 0) }));
}
const summary = { exports: rows.length, sourceBytes: rows.reduce((s, r) => s + r.sourceBytes, 0), bytes: rows.reduce((s, r) => s + r.bytes, 0), maximumColorErrorU16: Math.max(...rows.map(r => r.maximumColorErrorU16)), colorBits: { environment: environmentBits, aircraft: aircraftBits }, rows };
fs.writeFileSync(path.join(output, 'transport-report.json'), JSON.stringify(summary));
console.log(JSON.stringify({ ...summary, rows: undefined }));
