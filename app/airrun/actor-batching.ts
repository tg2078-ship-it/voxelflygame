import * as T from 'three';
import { shouldRenderModelSurface } from './model-surface';

// Original named meshes remain animation controllers. Only byte-identical opaque
// leaf renderers share draws; morphs, skins, transparent sorting and children stay native.
const signatures = new WeakMap<T.BufferGeometry, string>();
const attributeData = new WeakMap<T.BufferAttribute | T.InterleavedBufferAttribute, Uint8Array>();
function attributeBytes(a: T.BufferAttribute | T.InterleavedBufferAttribute) {
    const cached = attributeData.get(a); if (cached) return cached;
    let bytes: Uint8Array;
    if ((a as T.InterleavedBufferAttribute).isInterleavedBufferAttribute) {
        const attr = a as T.InterleavedBufferAttribute, data = attr.data.array, size = data.BYTES_PER_ELEMENT;
        bytes = new Uint8Array(a.count * a.itemSize * size);
        for (let i = 0; i < a.count; i++) bytes.set(new Uint8Array(data.buffer, data.byteOffset + (i * attr.data.stride + attr.offset) * size, a.itemSize * size), i * a.itemSize * size);
    }
    else bytes = new Uint8Array(a.array.buffer, a.array.byteOffset, a.array.byteLength);
    attributeData.set(a, bytes); return bytes;
}
function buffers(g: T.BufferGeometry) {
    return [...Object.keys(g.attributes).sort().map(name => [name, g.getAttribute(name)] as const), ['index', g.index] as const].filter(([, a]) => a !== null);
}
function signature(g: T.BufferGeometry) {
    const cached = signatures.get(g); if (cached) return cached;
    let h = 2166136261; let layout = JSON.stringify([g.groups, g.drawRange]);
    for (const [name, a] of buffers(g)) {
        if (!a) return '';
        layout += `${name}:${a.array.constructor.name}:${a.itemSize}:${a.normalized}:${a.count};`;
        const bytes = attributeBytes(a);
        for (const b of bytes) h = Math.imul(h ^ b, 16777619);
    }
    const key = layout + h; signatures.set(g, key); return key;
}
function equalGeometry(a: T.BufferGeometry, b: T.BufferGeometry) {
    if (a === b) return true;
    const aa = buffers(a), bb = buffers(b); if (aa.length !== bb.length) return false;
    return aa.every(([name, attr], i) => {
        const other = bb[i]; if (!attr || !other?.[1] || name !== other[0]) return false;
        const x = attributeBytes(attr), y = attributeBytes(other[1]);
        return x.length === y.length && x.every((v, j) => v === y[j]);
    });
}
function orthogonal(matrix: T.Matrix4) {
    const e = matrix.elements;
    const dot = (a: number, b: number) => Math.abs(e[a]*e[b]+e[a+1]*e[b+1]+e[a+2]*e[b+2]) / Math.max(1e-20, Math.hypot(e[a],e[a+1],e[a+2])*Math.hypot(e[b],e[b+1],e[b+2]));
    return dot(0,4) < 1e-6 && dot(0,8) < 1e-6 && dot(4,8) < 1e-6;
}
function visibleParents(node: T.Object3D, root: T.Object3D) {
    for (let parent = node.parent; parent && parent !== root; parent = parent.parent)
        if (!parent.visible) return false;
    return shouldRenderModelSurface(node);
}
export class ActorBatching {
    batches: { mesh: T.InstancedMesh; sources: T.Mesh[] }[] = [];
    inverse = new T.Matrix4(); matrix = new T.Matrix4();
    constructor(public root: T.Object3D) {
        const candidates = new Map<string, T.Mesh[][]>();
        root.updateMatrixWorld(true);
        root.traverse(node => {
            if (!(node instanceof T.Mesh) || node instanceof T.InstancedMesh || (node as T.SkinnedMesh).isSkinnedMesh || node.children.length || !node.visible || !visibleParents(node, root) || node.morphTargetInfluences?.length || Object.keys(node.geometry.morphAttributes).length || Array.isArray(node.material) || node.material.transparent || node.geometry.groups.length > 1 || node.matrixWorld.determinant() <= 0) return;
            const key = signature(node.geometry); if (!key) return;
            const id = key + ':' + node.material.uuid + ':' + node.castShadow + ':' + node.receiveShadow;
            const bins = candidates.get(id) ?? []; let list = bins.find(bin => equalGeometry(bin[0].geometry, node.geometry));
            if (!list) { list = []; bins.push(list); candidates.set(id, bins); }
            list.push(node);
        });
        for (const bins of candidates.values()) for (const sources of bins) {
            if (sources.length < 2) continue;
            const first = sources[0], mesh = new T.InstancedMesh(first.geometry, first.material, sources.length);
            mesh.name = 'native-leaf-batch'; mesh.castShadow = first.castShadow; mesh.receiveShadow = first.receiveShadow;
            mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); mesh.frustumCulled = false;
            for (const source of sources) source.visible = false;
            root.add(mesh); this.batches.push({ mesh, sources });
        }
        this.sync();
    }
    sync() {
        if (!this.batches.length) return;
        this.root.updateMatrixWorld(true); this.inverse.copy(this.root.matrixWorld).invert();
        for (const { mesh, sources } of this.batches) {
            sources.forEach((source, i) => {
                this.matrix.multiplyMatrices(this.inverse, source.matrixWorld);
                // Instanced normal transforms assume orthogonal basis columns. If a
                // native pose introduces shear, render that controller normally.
                const visible = visibleParents(source, this.root), native = visible && !orthogonal(this.matrix); source.visible = native;
                if (!visible || native) this.matrix.makeTranslation(1e9, 1e9, 1e9);
                mesh.setMatrixAt(i, this.matrix);
            });
            mesh.instanceMatrix.needsUpdate = true;
        }
    }
    dispose() {
        for (const { mesh, sources } of this.batches) { sources.forEach(source => source.visible = true); mesh.removeFromParent(); mesh.dispose(); }
        this.batches = [];
    }
}
