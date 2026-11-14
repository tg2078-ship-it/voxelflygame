import * as T from 'three';
import { rigPose, type RigDefinition } from './rig-motion';
import { sweepTriangleCollider, type TriangleCollider } from './mesh-collision';
import type { Vec, Box, Obstacle, AssetMeta } from './types';
export interface SolidBox { c: number[]; s: number[]; q?: number[]; zone?: string }
export interface CollisionBVH { root: number; node?: string; nodes: { min: number[]; max: number[]; left?: number; right?: number; indices?: number[] }[] }
export interface ProxyData {
    schema: number; id: string;
    static: SolidBox[];
    dynamic: (SolidBox & { node: string; envelope?: SolidBox })[];
    clearances: { name: string; axis: string; c: number[]; s: number[] }[];
    coverage: { staticVolume: number; method: string };
    rig?: RigDefinition;
    staticBVH?: CollisionBVH;
    dynamicBVH?: CollisionBVH[];
    staticBounds?: SolidBox;
    dynamicBounds?: SolidBox;
    meshes?: TriangleCollider[];
}
export interface Contact {
    t: number;
    normal: Vec;
}
export function sweepAABB(start: Vec, end: Vec, box: Box, radius: Vec): Contact | null {
    let enter = 0, exit = 1, normal: Vec = { x: 0, y: 0, z: 0 };
    for (const axis of ['x', 'y', 'z'] as const) {
        const lo = box.min[axis] - radius[axis], hi = box.max[axis] + radius[axis], delta = end[axis] - start[axis];
        if (Math.abs(delta) < 1e-9) {
            if (start[axis] < lo || start[axis] > hi)
                return null;
            continue;
        }
        let a = (lo - start[axis]) / delta, b = (hi - start[axis]) / delta;
        const sign = -Math.sign(delta);
        if (a > b)
            [a, b] = [b, a];
        if (a > enter) {
            enter = a;
            normal = { x: 0, y: 0, z: 0 };
            normal[axis] = sign;
        }
        exit = Math.min(exit, b);
        if (enter > exit)
            return null;
    }
    return enter >= 0 && enter <= 1 && exit >= 0 ? { t: enter, normal } : null;
}
export function transformBox(c: number[], s: number[], position: Vec, scale: Vec, yaw: number): Box { const cos = Math.cos(yaw), sin = Math.sin(yaw), cx = c[0] * scale.x, cy = c[1] * scale.y, cz = c[2] * scale.z; const x = position.x + cx * cos + cz * sin, z = position.z + cx * sin - cz * cos; const rx = (Math.abs(s[0] * scale.x * cos) + Math.abs(s[2] * scale.z * sin)) / 2, ry = Math.abs(s[1] * scale.y) / 2, rz = (Math.abs(s[0] * scale.x * sin) + Math.abs(s[2] * scale.z * cos)) / 2; return { min: { x: x - rx, y: position.y + cy - ry, z: z - rz }, max: { x: x + rx, y: position.y + cy + ry, z: z + rz } }; }
export function broadBox(o: Obstacle, meta: AssetMeta) { return transformBox(meta.bounds.min.map((v, i) => (v + meta.bounds.max[i]) / 2), meta.bounds.size, o.position, o.scale, o.yaw); }
export interface OrientedSolid { box: Box; inverse: T.Matrix4; normalMatrix: T.Matrix3; half: Vec }
const reflection = new T.Matrix4().makeScale(1, 1, -1);
interface CollisionFrame { proxy: ProxyData; values: number[]; root: T.Matrix4; staticMeshes: Map<TriangleCollider, T.Matrix4>; envelopes: Map<TriangleCollider, OrientedSolid>; tree?: CollisionBVH; unbounded: number[] }
const collisionFrames = new WeakMap<Obstacle, CollisionFrame>();
function surfaceTree(bounds: Map<number, Box>): CollisionBVH {
    const nodes: CollisionBVH['nodes'] = [];
    const build = (indices: number[]): number => {
        const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
        for (const index of indices) { const box = bounds.get(index)!; for (const [i, axis] of (['x','y','z'] as const).entries()) { min[i] = Math.min(min[i], box.min[axis] - 1e-6); max[i] = Math.max(max[i], box.max[axis] + 1e-6); } }
        const node: CollisionBVH['nodes'][number] = { min, max }, at = nodes.length; nodes.push(node);
        if (indices.length <= 4) node.indices = indices;
        else {
            const dimension = max.map((v, i) => v - min[i]), axis = (['x','y','z'] as const)[dimension.indexOf(Math.max(...dimension))];
            indices.sort((a, b) => { const x = bounds.get(a)!, y = bounds.get(b)!; return x.min[axis] + x.max[axis] - y.min[axis] - y.max[axis]; });
            const middle = indices.length >> 1; node.left = build(indices.slice(0, middle)); node.right = build(indices.slice(middle));
        }
        return at;
    };
    return { root: bounds.size ? build([...bounds.keys()]) : 0, nodes };
}
function collisionFrame(o: Obstacle, proxy: ProxyData) {
    const values = [o.position.x, o.position.y, o.position.z, o.scale.x, o.scale.y, o.scale.z, o.yaw];
    const previous = collisionFrames.get(o);
    if (previous?.proxy === proxy && values.every((v, i) => v === previous.values[i])) return previous;
    const root = modelMatrix(o), staticMeshes = new Map<TriangleCollider, T.Matrix4>(), envelopes = new Map<TriangleCollider, OrientedSolid>();
    const pose = proxy.rig ? rigPose(proxy.rig, 0) : undefined;
    for (const mesh of proxy.meshes ?? []) if (!mesh.animated) {
        const node = pose?.get(mesh.node);
        staticMeshes.set(mesh, node ? root.clone().multiply(node.matrixWorld) : root.clone());
    }
    for (const mesh of proxy.meshes ?? []) if (mesh.animated && mesh.envelope) envelopes.set(mesh, orientedSolid(mesh.envelope, root));
    const bounds = new Map<number, Box>(), unbounded: number[] = [];
    if ((proxy.meshes?.length ?? 0) > 8) proxy.meshes!.forEach((mesh, index) => {
        const envelope = envelopes.get(mesh);
        if (envelope) bounds.set(index, envelope.box);
        else if (staticMeshes.has(mesh)) {
            const b = mesh.bvh.nodes[mesh.bvh.root];
            if (b) bounds.set(index, plainBox(new T.Box3(new T.Vector3(...b.min as [number,number,number]), new T.Vector3(...b.max as [number,number,number])).applyMatrix4(staticMeshes.get(mesh)!)));
        } else unbounded.push(index);
    });
    const frame = { proxy, values, root, staticMeshes, envelopes, tree: bounds.size ? surfaceTree(bounds) : undefined, unbounded }; collisionFrames.set(o, frame); return frame;
}
function modelMatrix(o: Obstacle) {
    const matrix = new T.Matrix4().makeRotationY(o.yaw).scale(new T.Vector3(o.scale.x, o.scale.y, o.scale.z)).premultiply(reflection);
    matrix.setPosition(o.position.x, o.position.y, o.position.z); return matrix;
}
function box3(box: Box) { return new T.Box3(new T.Vector3(box.min.x, box.min.y, box.min.z), new T.Vector3(box.max.x, box.max.y, box.max.z)); }
function plainBox(box: T.Box3): Box { return { min: { x: box.min.x, y: box.min.y, z: box.min.z }, max: { x: box.max.x, y: box.max.y, z: box.max.z } }; }
export function orientedSolid(source: SolidBox, parent: T.Matrix4): OrientedSolid {
    const matrix = new T.Matrix4().compose(new T.Vector3().fromArray(source.c), new T.Quaternion().fromArray(source.q ?? [0, 0, 0, 1]), new T.Vector3(1, 1, 1)).premultiply(parent);
    const half = { x: source.s[0] / 2, y: source.s[1] / 2, z: source.s[2] / 2 };
    const bounds = new T.Box3(new T.Vector3(-half.x, -half.y, -half.z), new T.Vector3(half.x, half.y, half.z)).applyMatrix4(matrix);
    return { box: plainBox(bounds), inverse: matrix.clone().invert(), normalMatrix: new T.Matrix3().getNormalMatrix(matrix), half };
}
export function sweepSolid(start: Vec, end: Vec, solid: OrientedSolid, radius: Vec): Contact | null {
    if (!sweepAABB(start, end, solid.box, radius)) return null;
    const a = new T.Vector3(start.x, start.y, start.z).applyMatrix4(solid.inverse), b = new T.Vector3(end.x, end.y, end.z).applyMatrix4(solid.inverse), e = solid.inverse.elements;
    const r = { x: Math.abs(e[0]) * radius.x + Math.abs(e[4]) * radius.y + Math.abs(e[8]) * radius.z,
        y: Math.abs(e[1]) * radius.x + Math.abs(e[5]) * radius.y + Math.abs(e[9]) * radius.z,
        z: Math.abs(e[2]) * radius.x + Math.abs(e[6]) * radius.y + Math.abs(e[10]) * radius.z };
    const h = solid.half, contact = sweepAABB(a, b, { min: { x: -h.x, y: -h.y, z: -h.z }, max: h }, r);
    if (!contact) return null;
    const normal = new T.Vector3(contact.normal.x, contact.normal.y, contact.normal.z).applyMatrix3(solid.normalMatrix).normalize();
    return { t: contact.t, normal: { x: normal.x, y: normal.y, z: normal.z } };
}
export function queryCollisionBVH(tree: CollisionBVH | undefined, query: Box): number[] {
    if (!tree?.nodes.length) return [];
    const found: number[] = [], pending = [tree.root];
    while (pending.length) {
        const node = tree.nodes[pending.pop()!];
        if (node.min[0] > query.max.x || node.max[0] < query.min.x || node.min[1] > query.max.y || node.max[1] < query.min.y || node.min[2] > query.max.z || node.max[2] < query.min.z) continue;
        if (node.indices) found.push(...node.indices);
        else { if (node.left !== undefined) pending.push(node.left); if (node.right !== undefined) pending.push(node.right); }
    }
    return found;
}
const envelopes = new WeakMap<ProxyData, SolidBox[]>();
function motionEnvelopes(proxy: ProxyData) {
    let cached = envelopes.get(proxy); if (cached) return cached;
    const groups = new Map<string, T.Box3>();
    for (const part of proxy.dynamic) if (part.envelope) {
        const e = part.envelope, box = new T.Box3(new T.Vector3(...e.c as [number,number,number]), new T.Vector3(...e.c as [number,number,number]));
        box.min.addScaledVector(new T.Vector3(...e.s as [number,number,number]), -.5); box.max.addScaledVector(new T.Vector3(...e.s as [number,number,number]), .5);
        const group = groups.get(part.node); if (group) group.union(box); else groups.set(part.node, box);
    }
    cached = [...groups.values()].map(box => ({ c: box.getCenter(new T.Vector3()).toArray(), s: box.getSize(new T.Vector3()).toArray() }));
    envelopes.set(proxy, cached); return cached;
}
// Static world transforms are immutable between steps; retain the conservative
// broad box instead of allocating/retransforming it at 60 Hz for every distant prop.
const broadCache = new WeakMap<Obstacle, { meta: AssetMeta; proxy?: ProxyData; x: number; y: number; z: number; sx: number; sy: number; sz: number; yaw: number; box: Box }>();
export function collisionBounds(o: Obstacle, meta: AssetMeta, proxy?: ProxyData): Box {
    const cached = broadCache.get(o), p = o.position, s = o.scale;
    if (cached && cached.meta === meta && cached.proxy === proxy && cached.x === p.x && cached.y === p.y && cached.z === p.z && cached.sx === s.x && cached.sy === s.y && cached.sz === s.z && cached.yaw === o.yaw) return cached.box;
    const result = broadBox(o, meta);
    for (const source of [proxy?.staticBounds, proxy?.dynamicBounds]) if (source) {
        const box = transformBox(source.c, source.s, o.position, o.scale, o.yaw);
        for (const axis of ['x', 'y', 'z'] as const) { result.min[axis] = Math.min(result.min[axis], box.min[axis]); result.max[axis] = Math.max(result.max[axis], box.max[axis]); }
    }
    broadCache.set(o, { meta, proxy, x: p.x, y: p.y, z: p.z, sx: s.x, sy: s.y, sz: s.z, yaw: o.yaw, box: result });
    return result;
}
export function obstacleSolids(o: Obstacle, proxy: ProxyData, time?: number, query?: Box, includeMeshes = true): OrientedSolid[] {
    const root = modelMatrix(o), localQuery = query ? plainBox(box3(query).applyMatrix4(root.clone().invert())) : undefined;
    const indices = localQuery && proxy.staticBVH ? queryCollisionBVH(proxy.staticBVH, localQuery) : proxy.static.map((_, i) => i);
    const solids = indices.map(i => orientedSolid(proxy.static[i], root));
    if (includeMeshes && proxy.meshes?.length) {
        const pose = proxy.rig ? rigPose(proxy.rig, (time ?? 0) + (o.animationPhase ?? 0)) : undefined;
        for (const mesh of proxy.meshes) {
            if (mesh.animated && time === undefined && mesh.envelope) solids.push(orientedSolid(mesh.envelope, root));
            else {
                const node = pose?.get(mesh.node), bounds = mesh.bvh.nodes[mesh.bvh.root];
                if (bounds) solids.push(orientedSolid({ c: bounds.min.map((value, i) => (value + bounds.max[i]) / 2), s: bounds.min.map((value, i) => bounds.max[i] - value) }, node ? root.clone().multiply(node.matrixWorld) : root));
            }
        }
    }
    if (time !== undefined && proxy.rig) {
        const pose = rigPose(proxy.rig, time + (o.animationPhase ?? 0));
        if (proxy.dynamicBVH) for (const tree of proxy.dynamicBVH) {
            const node = pose.get(tree.node!); if (!node) continue;
            const matrix = root.clone().multiply(node.matrixWorld);
            const candidates = query ? queryCollisionBVH(tree, plainBox(box3(query).applyMatrix4(matrix.clone().invert()))) : proxy.dynamic.map((_, i) => i).filter(i => proxy.dynamic[i].node === tree.node);
            for (const i of candidates) solids.push(orientedSolid(proxy.dynamic[i], matrix));
        }
        else for (const part of proxy.dynamic) { const node = pose.get(part.node); if (node) solids.push(orientedSolid(part, root.clone().multiply(node.matrixWorld))); }
    }
    else for (const envelope of motionEnvelopes(proxy)) solids.push(orientedSolid(envelope, root));
    return solids;
}
export function obstacleContact(o: Obstacle, meta: AssetMeta, proxy: ProxyData | undefined, start: Vec, end: Vec, radius: Vec, oldPosition?: Vec, motionTime?: number): Contact | null {
    const old = oldPosition ?? o.position, a = { x: start.x + o.position.x - old.x, y: start.y + o.position.y - old.y, z: start.z + o.position.z - old.z };
    const broad = collisionBounds(o, meta, proxy);
    if (!sweepAABB(a, end, broad, radius)) return null;
    if (proxy?.meshes?.length) {
        const frame = collisionFrame(o, proxy), root = frame.root;
        const pose = proxy.rig && proxy.meshes.some(mesh => mesh.animated && (motionTime !== undefined || !mesh.envelope)) ? rigPose(proxy.rig, (motionTime ?? 0) + (o.animationPhase ?? 0)) : undefined;
        const query = { min: { x: Math.min(a.x, end.x) - radius.x, y: Math.min(a.y, end.y) - radius.y, z: Math.min(a.z, end.z) - radius.z }, max: { x: Math.max(a.x, end.x) + radius.x, y: Math.max(a.y, end.y) + radius.y, z: Math.max(a.z, end.z) + radius.z } };
        const meshes = frame.tree ? [...queryCollisionBVH(frame.tree, query), ...frame.unbounded].sort((a, b) => a - b).map(index => proxy.meshes![index]) : proxy.meshes;
        let closest: Contact | null = null;
        for (const mesh of meshes) {
            // Unknown future motion reserves the full moving mechanism; static openings remain exact.
            if (mesh.animated && motionTime === undefined && mesh.envelope) {
                const hit = sweepSolid(a, end, frame.envelopes.get(mesh)!, radius);
                if (hit && (!closest || hit.t < closest.t)) closest = hit;
                continue;
            }
            const node = pose?.get(mesh.node);
            const matrix = frame.staticMeshes.get(mesh) ?? (node ? root.clone().multiply(node.matrixWorld) : root);
            const hit = sweepTriangleCollider(mesh, matrix, a, end, radius, (node as T.Mesh | undefined)?.morphTargetInfluences ?? mesh.morphWeights, !mesh.animated);
            if (hit && (!closest || hit.t < closest.t)) closest = hit;
        }
        for (const solid of proxy.static.length || proxy.dynamic.length ? obstacleSolids(o, proxy, motionTime, query, false) : []) {
            const hit = sweepSolid(a, end, solid, radius);
            if (hit && (!closest || hit.t < closest.t)) closest = hit;
        }
        return closest;
    }
    if (proxy && (proxy.static.length || proxy.dynamic.length)) {
        const query = { min: { x: Math.min(a.x, end.x) - radius.x, y: Math.min(a.y, end.y) - radius.y, z: Math.min(a.z, end.z) - radius.z }, max: { x: Math.max(a.x, end.x) + radius.x, y: Math.max(a.y, end.y) + radius.y, z: Math.max(a.z, end.z) + radius.z } };
        let closest: Contact | null = null;
        for (const solid of obstacleSolids(o, proxy, motionTime, query)) { const hit = sweepSolid(a, end, solid, radius); if (hit && (!closest || hit.t < closest.t)) closest = hit; }
        return closest;
    }
    // Legacy fixtures have no native rig. Preserve their explicitly supplied boxes.
    if (o.proxy?.length) { let closest: Contact | null = null; for (const box of o.proxy) { const hit = sweepAABB(a, end, box, radius); if (hit && (!closest || hit.t < closest.t)) closest = hit; } return closest; }
    for (const clearance of meta.clearances as { axis: string; c: number[]; s: number[] }[]) if (clearance.axis === 'Z') {
        const box = transformBox(clearance.c, clearance.s, o.position, o.scale, o.yaw), mid = { x: (a.x + end.x) / 2, y: (a.y + end.y) / 2 };
        if (mid.x - radius.x >= box.min.x && mid.x + radius.x <= box.max.x && mid.y - radius.y >= box.min.y && mid.y + radius.y <= box.max.y) return null;
    }
    return sweepAABB(a, end, broad, radius);
}
export function pointClear(p: Vec, obstacles: Obstacle[], catalog: Map<string, AssetMeta>, proxies: Map<string, ProxyData>, radius: Vec): boolean {
    for (const o of obstacles) {
        if (Math.abs(o.position.z - p.z) > o.size.z + 20)
            continue;
        const m = catalog.get(o.model);
        if (m && obstacleContact(o, m, proxies.get(o.model), p, p, radius))
            return false;
    }
    return true;
}
