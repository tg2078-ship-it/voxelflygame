/** Edition12: preserve skin bind matrices, morph targets, atlas bytes and quantized attributes.
 * Lossless accessor transport. No simplification, position quantization or image recompression. */
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { MeshoptEncoder } from '../node_modules/.pnpm/meshoptimizer@1.1.1/node_modules/meshoptimizer/meshopt_encoder.js';
import { MeshoptDecoder } from '../node_modules/.pnpm/meshoptimizer@1.1.1/node_modules/meshoptimizer/meshopt_decoder.mjs';
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const widths = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
const sizes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const indexTypes = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array };
const componentArrays = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function encode(job) {
    const source = fs.readFileSync(job.sourceFile), jlen = source.readUInt32LE(12);
    if (source.toString('ascii', 0, 4) !== 'glTF' || source.readUInt32LE(4) !== 2 || source.readUInt32LE(8) !== source.length) throw Error('Invalid GLB');
    const original = JSON.parse(source.subarray(20, 20 + jlen)), binary = source.subarray(28 + jlen), doc = structuredClone(original);
    const chunks = [], views = [], accessors = [], textureHashes = {}, images = [];
    let physical = 0, fallback = 0;
    function sourceRows(ai) {
        const a = original.accessors[ai];
        if (a.sparse || a.bufferView === undefined) throw Error('Sparse/empty accessor unsupported: ' + ai);
        const v = original.bufferViews[a.bufferView];
        if (v.buffer !== undefined && v.buffer !== 0) throw Error('Nonembedded buffer');
        const width = widths[a.type], rawStride = width * sizes[a.componentType], sourceStride = v.byteStride ?? rawStride;
        const stride = a.type === 'SCALAR' ? rawStride : Math.ceil(rawStride / 4) * 4;
        if (!width || !stride || stride > 256) throw Error('Unsupported accessor ' + ai);
        const raw = Buffer.alloc(a.count * stride), sourceOffset = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
        for (let i = 0; i < a.count; i++) binary.copy(raw, i * stride, sourceOffset + i * sourceStride, sourceOffset + i * sourceStride + rawStride);
        return { a, v, raw, stride, rawStride };
    }
    function write(a, raw, count, stride, mode = 'ATTRIBUTES', target) {
        const encoded = MeshoptEncoder.encodeGltfBuffer(raw, count, stride, mode);
        const decoded = new Uint8Array(raw.length);
        MeshoptDecoder.decodeGltfBuffer(decoded, count, stride, encoded, mode);
        if (mode === 'ATTRIBUTES') {
            if (!raw.equals(Buffer.from(decoded))) throw Error('Accessor bytes changed');
        } else {
            const C = indexTypes[a.componentType], aa = new C(raw.buffer, raw.byteOffset, count), bb = new C(decoded.buffer, decoded.byteOffset, count);
            for (let i = 0; i < count; i += 3) {
                let okay = false;
                for (let r = 0; r < 3; r++) if (aa[i] === bb[i + r] && aa[i + 1] === bb[i + (r + 1) % 3] && aa[i + 2] === bb[i + (r + 2) % 3]) okay = true;
                if (!okay) throw Error('Triangle topology/winding changed');
            }
        }
        const pad = (-physical) & 3; if (pad) { chunks.push(Buffer.alloc(pad)); physical += pad; }
        fallback += (-fallback) & 3;
        const view = { buffer: 1, byteOffset: fallback, byteLength: raw.length,
            extensions: { EXT_meshopt_compression: { buffer: 0, byteOffset: physical, byteLength: encoded.length, byteStride: stride, count, mode } } };
        if (target) view.target = target;
        if (mode === 'ATTRIBUTES' && (target === 34962 || stride !== widths[a.type] * sizes[a.componentType])) view.byteStride = stride;
        const next = structuredClone(a); next.bufferView = views.length; next.byteOffset = 0; next.count = count;
        if (a.min || a.max) {
            const C = componentArrays[a.componentType], values = new C(raw.buffer, raw.byteOffset, raw.length / sizes[a.componentType]);
            const width = widths[a.type], step = stride / sizes[a.componentType], minimum = Array(width).fill(Infinity), maximum = Array(width).fill(-Infinity);
            for (let i = 0; i < count; i++) for (let k = 0; k < width; k++) { const value = values[i * step + k]; minimum[k] = Math.min(minimum[k], value); maximum[k] = Math.max(maximum[k], value); }
            next.min = minimum; next.max = maximum;
        }
        const index = accessors.length;
        views.push(view); accessors.push(next); chunks.push(Buffer.from(encoded)); physical += encoded.length; fallback += raw.length;
        return index;
    }
    function copyRemapped(ai, remap, count) {
        const { a, raw: source, stride } = sourceRows(ai), out = Buffer.alloc(count * stride);
        if (remap.length > a.count) throw Error('Index outside source accessor');
        for (let old = 0; old < remap.length; old++) if (remap[old] !== 0xffffffff) source.copy(out, remap[old] * stride, old * stride, (old + 1) * stride);
        return write(a, out, count, stride, 'ATTRIBUTES', 34962);
    }
    function faceKey(a, b, c) {
        if (a <= b && a <= c) return `${a},${b},${c}`;
        if (b <= a && b <= c) return `${b},${c},${a}`;
        return `${c},${a},${b}`;
    }
    // Discard only unreferenced vertex storage, while retaining every indexed
    // triangle and every source attribute bit on each referenced vertex.
    doc.meshes = original.meshes.map(mesh => ({ ...mesh, primitives: mesh.primitives.map(primitive => {
        if ((primitive.mode ?? 4) !== 4 || primitive.indices === undefined) throw Error('Expected indexed triangle source');
        const row = sourceRows(primitive.indices), C = indexTypes[row.a.componentType];
        if (!C) throw Error('Unsupported index type');
        const before = new C(row.raw.buffer, row.raw.byteOffset, row.a.count), index = new Uint32Array(before);
        // Weld only byte-identical referenced vertices, including every morph,
        // joint, weight, UV and normal. This changes storage, never any surface.
        const streams = [...Object.values(primitive.attributes), ...(primitive.targets ?? []).flatMap(target => Object.values(target))].map(sourceRows);
        const vertexCount = streams[0].a.count, welded = new Uint32Array(vertexCount).fill(0xffffffff), buckets = new Map();
        const same = (a, b) => streams.every(({ raw, stride, rawStride }) => {
            for (let k = 0; k < rawStride; k++) if (raw[a * stride + k] !== raw[b * stride + k]) return false;
            return true;
        });
        let unique = 0;
        for (const old of before) {
            if (welded[old] !== 0xffffffff) continue;
            let hash = 2166136261;
            for (const { raw, stride, rawStride } of streams) for (let k = 0; k < rawStride; k++) hash = Math.imul(hash ^ raw[old * stride + k], 16777619);
            const bucket = buckets.get(hash) ?? [];
            const equivalent = bucket.find(candidate => same(candidate, old));
            if (equivalent !== undefined) welded[old] = welded[equivalent];
            else { welded[old] = unique++; bucket.push(old); buckets.set(hash, bucket); }
        }
        for (let i = 0; i < index.length; i++) index[i] = welded[before[i]];
        const [reorder, count] = MeshoptEncoder.reorderMesh(index, true, true), remap = new Uint32Array(vertexCount).fill(0xffffffff);
        for (let i = 0; i < vertexCount; i++) if (welded[i] !== 0xffffffff) remap[i] = reorder[welded[i]];
        const expected = new Map();
        for (let i = 0; i < before.length; i += 3) { const key = faceKey(remap[before[i]], remap[before[i + 1]], remap[before[i + 2]]); expected.set(key, (expected.get(key) ?? 0) + 1); }
        for (let i = 0; i < index.length; i += 3) { const key = faceKey(index[i], index[i + 1], index[i + 2]), left = expected.get(key) ?? 0; if (!left) throw Error('Source triangle changed'); expected.set(key, left - 1); }
        if ([...expected.values()].some(Boolean)) throw Error('Source triangle omitted');
        const attributes = Object.fromEntries(Object.entries(primitive.attributes).map(([semantic, ai]) => [semantic, copyRemapped(ai, remap, count)]));
        const typed = count <= 65535 ? new Uint16Array(index) : index;
        const indices = write({ componentType: typed.BYTES_PER_ELEMENT === 2 ? 5123 : 5125, type: 'SCALAR' }, Buffer.from(typed.buffer), typed.length, typed.BYTES_PER_ELEMENT, 'TRIANGLES', 34963);
        const next = { ...primitive, attributes, indices };
        if (primitive.targets) next.targets = primitive.targets.map(target => Object.fromEntries(Object.entries(target).map(([semantic, ai]) => [semantic, copyRemapped(ai, remap, count)])));
        return next;
    }) }));
    const copied = new Map();
    function copyAccessor(ai) {
        if (!copied.has(ai)) { const { a, raw, stride } = sourceRows(ai); copied.set(ai, write(a, raw, a.count, stride)); }
        return copied.get(ai);
    }
    for (const animation of doc.animations ?? []) for (const sampler of animation.samplers) {
        sampler.input = copyAccessor(sampler.input); sampler.output = copyAccessor(sampler.output);
    }
    for (const skin of doc.skins ?? []) if (skin.inverseBindMatrices !== undefined) skin.inverseBindMatrices = copyAccessor(skin.inverseBindMatrices);
    for (const image of doc.images ?? []) {
        let bytes;
        if (image.uri) {
            const sourceImage = path.resolve(path.dirname(job.sourceFile), image.uri);
            const allowed = path.resolve(job.sourceRoot) + path.sep;
            if (!sourceImage.startsWith(allowed)) throw Error('Image outside supplied source');
            bytes = fs.readFileSync(sourceImage);
            image.mimeType = image.uri.endsWith('.png') ? 'image/png' : 'image/jpeg';
        } else {
            const view = original.bufferViews[image.bufferView];
            bytes = binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
        }
        const hash = digest(bytes), suffix = image.mimeType === 'image/jpeg' ? '.jpg' : image.mimeType === 'image/png' ? '.png' : null;
        if (!suffix || (suffix === '.jpg' ? bytes[0] !== 255 || bytes[1] !== 216 : bytes.toString('hex', 0, 8) !== '89504e470d0a1a0a')) throw Error('Invalid source image');
        delete image.bufferView; image.uri = '/models/textures/' + hash + suffix;
        const target = path.join(job.textureDir, hash + suffix); fs.mkdirSync(path.dirname(target), { recursive: true });
        if (!fs.existsSync(target)) fs.writeFileSync(target, bytes);
        images.push({ hash, bytes: bytes.length, uri: image.uri });
    }
    for (let i = 0; i < (doc.textures?.length ?? 0); i++) textureHashes[i] = images[doc.textures[i].source].hash;
    doc.accessors = accessors; doc.bufferViews = views;
    doc.buffers = [{ byteLength: physical }, { byteLength: fallback, extensions: { EXT_meshopt_compression: { fallback: true } } }];
    doc.extensionsUsed = [...new Set([...(doc.extensionsUsed ?? []), 'EXT_meshopt_compression'])];
    doc.extensionsRequired = [...new Set([...(doc.extensionsRequired ?? []), 'EXT_meshopt_compression'])];
    for (const key of ['nodes', 'materials', 'textures', 'samplers', 'scenes', 'scene']) if (JSON.stringify(original[key]) !== JSON.stringify(doc[key])) throw Error('Definition changed: ' + key);
    const jb = Buffer.from(JSON.stringify(doc)), jp = (-jb.length) & 3, bb = Buffer.concat(chunks), bp = (-bb.length) & 3;
    const head = Buffer.alloc(20); head.write('glTF'); head.writeUInt32LE(2, 4); head.writeUInt32LE(28 + jb.length + jp + bb.length + bp, 8); head.writeUInt32LE(jb.length + jp, 12); head.write('JSON', 16);
    const bh = Buffer.alloc(8); bh.writeUInt32LE(bb.length + bp); bh.write('BIN\0', 4);
    const raw = Buffer.concat([head, jb, Buffer.alloc(jp, 32), bh, bb, Buffer.alloc(bp)]), compressed = gzipSync(raw, { level: 6, mtime: 0 });
    fs.mkdirSync(path.dirname(job.runtimeFile), { recursive: true }); fs.writeFileSync(job.runtimeFile, compressed);
    return { id: job.id, lod: job.lod, sourceBytes: source.length, bytes: compressed.length,
        triangles: original.meshes.reduce((s, m) => s + m.primitives.reduce((v, p) => v + ((p.mode ?? 4) === 4 ? original.accessors[p.indices ?? p.attributes.POSITION].count / 3 : 0), 0), 0),
        drawCalls: original.meshes.reduce((s, m) => s + m.primitives.length, 0), textureHashes, externalImages: images.length,
        externalImageBytes: images.reduce((s, i) => s + i.bytes, 0), addedPositionErrorM: 0,
        sourceSha256: digest(source), runtimeSha256: digest(compressed), accessorsVerified: accessors.length,
        skins: (doc.skins ?? []).length, clips: (doc.animations ?? []).length,
        nativeNodeMaterialSamplerDefinitionsUnchanged: true, everyIndexedTriangleAndAttributePreserved: true };
}
const jobs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), output = process.argv[3], rows = [];
for (let i = 0; i < jobs.length; i++) { rows.push(encode(jobs[i])); if (i % 10 === 0) console.log(`Losslessly encoded ${i + 1}/${jobs.length}`); }
fs.writeFileSync(output, JSON.stringify(rows));
console.log(JSON.stringify({ exports: rows.length, gzipBytes: rows.reduce((s, r) => s + r.bytes, 0), accessors: rows.reduce((s, r) => s + r.accessorsVerified, 0) }));
