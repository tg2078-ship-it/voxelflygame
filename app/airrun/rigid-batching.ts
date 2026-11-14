import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { ActorBatching } from './actor-batching';
import { shouldRenderModelSurface } from './model-surface';

interface Part { geometry: T.BufferGeometry; controller: number[]; sources: number[][] }
export interface RigidPlan { parts: Part[]; draws: number; sourceDraws: number; disposed: boolean }
const plans = new WeakMap<T.Object3D, Promise<RigidPlan>>();
function pathOf(node: T.Object3D, root: T.Object3D) {
    const path: number[] = [];
    while (node !== root && node.parent) { path.unshift(node.parent.children.indexOf(node)); node = node.parent; }
    return path;
}
function resolve(root: T.Object3D, path: number[]) { return path.reduce((node, i) => node.children[i], root); }
function visible(node: T.Object3D, root: T.Object3D) {
    for (let current: T.Object3D | null = node; current; current = current.parent) {
        if (!current.visible || !shouldRenderModelSurface(current)) return false;
        if (current === root) break;
    }
    return true;
}
/** Merge rigid leaves only inside the same animated pivot. Preserve authored
 * hierarchy, clips, PBR materials, UVs and per-vertex palettes. */
export function prepareRigidPlan(root: T.Object3D, clips: readonly T.AnimationClip[]): Promise<RigidPlan> {
    const cached = plans.get(root); if (cached) return cached;
    const promise = (async () => {
        root.updateMatrixWorld(true);
        const animated = new Set<T.Object3D>(), excluded = new Set<T.Object3D>();
        for (const clip of clips) for (const track of clip.tracks) {
            const parsed = T.PropertyBinding.parseTrackName(track.name);
            const node = T.PropertyBinding.findNode(root, parsed.nodeName) as T.Object3D | null;
            if (!node) continue;
            if (!parsed.objectName && ['position', 'quaternion', 'rotation', 'scale'].includes(parsed.propertyName)) animated.add(node);
            else excluded.add(node);
        }
        const bins = new Map<string, { controller: T.Object3D; sources: T.Mesh[] }>();
        let sourceDraws = 0;
        root.traverse(node => {
            if (!(node instanceof T.Mesh) || !visible(node, root)) return;
            sourceDraws += Array.isArray(node.material) ? Math.max(1, node.geometry.groups.length) : 1;
            if (node.children.length || animated.has(node) || excluded.has(node) || node instanceof T.InstancedMesh || (node as T.SkinnedMesh).isSkinnedMesh || node.morphTargetInfluences?.length || Object.keys(node.geometry.morphAttributes).length || Array.isArray(node.material) || node.material.transparent || node.geometry.groups.length > 1 || node.matrixWorld.determinant() <= 0 || node.geometry.drawRange.start !== 0 || Number.isFinite(node.geometry.drawRange.count)) return;
            let controller = node.parent ?? root;
            for (let ancestor: T.Object3D | null = node.parent; ancestor; ancestor = ancestor.parent) {
                if (excluded.has(ancestor) || !ancestor.visible) return;
                if (animated.has(ancestor) || ancestor === root) { controller = ancestor; break; }
            }
            if (controller.matrixWorld.determinant() <= 0) return;
            const layout = Object.keys(node.geometry.attributes).sort().map(key => key + ':' + node.geometry.getAttribute(key).itemSize).join(',');
            const key = [controller.uuid, node.material.uuid, node.castShadow, node.receiveShadow, layout].join('|');
            const bin = bins.get(key) ?? { controller, sources: [] }; bin.sources.push(node); bins.set(key, bin);
        });
        const plan: RigidPlan = { parts: [], draws: sourceDraws, sourceDraws, disposed: false };
        let deadline = performance.now() + 3;
        try {
            for (const { controller, sources } of bins.values()) {
                if (sources.length < 3) continue;
                const inverse = controller.matrixWorld.clone().invert(), transformed: T.BufferGeometry[] = [];
                try {
                    for (const source of sources) {
                        const g = new T.BufferGeometry(); transformed.push(g);
                        // Accessors decode normalized/interleaved data before transforms.
                        for (const name of Object.keys(source.geometry.attributes)) {
                            const attr = source.geometry.getAttribute(name), values = new Float32Array(attr.count * attr.itemSize);
                            for (let i = 0; i < attr.count; i++) for (let j = 0; j < attr.itemSize; j++) values[i * attr.itemSize + j] = attr.getComponent(i, j);
                            g.setAttribute(name, new T.Float32BufferAttribute(values, attr.itemSize));
                        }
                        const index = source.geometry.index;
                        g.setIndex(index ? Array.from(index.array) : Array.from({ length: g.getAttribute('position').count }, (_, i) => i));
                        g.applyMatrix4(inverse.clone().multiply(source.matrixWorld));
                        if (performance.now() > deadline) { await new Promise(resolve => setTimeout(resolve, 0)); deadline = performance.now() + 3; }
                    }
                    const geometry = mergeGeometries(transformed, false);
                    if (!geometry) continue;
                    geometry.computeBoundingSphere();
                    plan.parts.push({ geometry, controller: pathOf(controller, root), sources: sources.map(node => pathOf(node, root)) });
                    plan.draws -= sources.length - 1;
                } finally { transformed.forEach(g => g.dispose()); }
            }
            return plan;
        } catch (error) { plan.parts.forEach(part => part.geometry.dispose()); plans.delete(root); throw error; }
    })();
    plans.set(root, promise); return promise;
}
export function releaseRigidPlan(root: T.Object3D) {
    const promise = plans.get(root); plans.delete(root);
    void promise?.then(plan => { if (!plan.disposed) { plan.disposed = true; plan.parts.forEach(part => part.geometry.dispose()); } }).catch(() => {});
}
export class RigidActorBatching {
    parts: { mesh: T.Mesh; sources: T.Mesh[] }[] = [];
    leaves: ActorBatching;
    baseDraws: number;
    constructor(root: T.Object3D, plan: RigidPlan) {
        this.baseDraws = plan.draws;
        const groups = plan.parts.map(part => ({ part, parent: resolve(root, part.controller), sources: part.sources.map(path => resolve(root, path) as T.Mesh) }));
        for (const { part, parent, sources } of groups) {
            const first = sources[0], mesh = new T.Mesh(part.geometry, first.material);
            mesh.name = 'airrun-rigid-pivot'; mesh.castShadow = first.castShadow; mesh.receiveShadow = first.receiveShadow;
            sources.forEach(source => source.visible = false);
            parent.add(mesh); this.parts.push({ mesh, sources });
        }
        this.leaves = new ActorBatching(root);
    }
    sync() { this.leaves.sync(); }
    get draws() { return this.baseDraws - this.leaves.batches.reduce((n, group) => n + group.sources.length - 1 - group.sources.filter(source => source.visible).length, 0); }
    dispose() {
        this.leaves.dispose();
        for (const { mesh, sources } of this.parts) { mesh.removeFromParent(); sources.forEach(source => source.visible = true); }
        this.parts = [];
    }
}
/** CPU scene cost after both optimizations, including native shear fallbacks.
 * This is not a GPU timing measurement. */
export function measureAnimationDraws(source: T.Object3D, clips: readonly T.AnimationClip[], plan: RigidPlan) {
    const root = skeletonClone(source), mixer = new T.AnimationMixer(root), batch = new RigidActorBatching(root, plan);
    clips.forEach(clip => mixer.clipAction(clip).play());
    let draws = 0;
    for (const time of [0, .43, 2.1, 7.7]) { mixer.setTime(time); batch.sync(); draws = Math.max(draws, batch.draws); }
    batch.dispose(); mixer.stopAllAction(); mixer.uncacheRoot(root);
    return draws;
}
