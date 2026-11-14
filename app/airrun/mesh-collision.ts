import * as T from 'three';
import type { Box, Vec } from './types';
import type { CollisionBVH, Contact } from './collision';

/** Vertices retain the collider node's authored coordinates and pivot. */
export interface TriangleCollider {
    node: string;
    positions: number[];
    indices: number[];
    bvh: CollisionBVH;
    animated?: boolean;
    envelope?: { c: number[]; s: number[] };
    morphTargets?: number[][];
    morphWeights?: number[];
}
const epsilon = 1e-9;
interface FrozenSurface { collider: TriangleCollider; elements: number[]; inverse: T.Matrix4; positions: Float64Array }
const frozenSurfaces = new WeakMap<T.Matrix4, FrozenSurface>();
function frozenSurface(collider: TriangleCollider, matrix: T.Matrix4) {
    const cached = frozenSurfaces.get(matrix);
    if (cached?.collider === collider && matrix.elements.every((value, i) => value === cached.elements[i])) return cached;
    const positions = new Float64Array(collider.positions.length), point = new T.Vector3();
    for (let i = 0; i < positions.length; i += 3) point.fromArray(collider.positions, i).applyMatrix4(matrix).toArray(positions, i);
    const result = { collider, elements: [...matrix.elements], inverse: matrix.clone().invert(), positions };
    frozenSurfaces.set(matrix, result); return result;
}
function firstRoot(a: number, b: number, c: number, limit: number) {
    if (Math.abs(a) < epsilon) {
        const t = Math.abs(b) > epsilon ? -c / b : Infinity;
        return t >= 0 && t <= limit ? t : null;
    }
    const d = b * b - 4 * a * c;
    if (d < 0) return null;
    const root = Math.sqrt(d), t = (-b - root) / (2 * a), u = (-b + root) / (2 * a);
    return t >= 0 && t <= limit ? t : u >= 0 && u <= limit ? u : null;
}
/** Exact continuous unit-sphere/triangle contact, including edges and vertices. */
export function sweepUnitTriangle(start: T.Vector3, end: T.Vector3, a: T.Vector3, b: T.Vector3, c: T.Vector3): Contact | null {
    const triangle = new T.Triangle(a, b, c), normal = triangle.getNormal(new T.Vector3());
    if (normal.lengthSq() < .5) return null;
    const distance = normal.x * (start.x - a.x) + normal.y * (start.y - a.y) + normal.z * (start.z - a.z);
    const endDistance = normal.x * (end.x - a.x) + normal.y * (end.y - a.y) + normal.z * (end.z - a.z);
    // A unit sphere cannot touch any edge or vertex while its entire centre
    // segment stays more than one unit from the triangle's infinite plane.
    if (distance > 1 + 1e-8 && endDistance > 1 + 1e-8 || distance < -1 - 1e-8 && endDistance < -1 - 1e-8) return null;
    const velocity = end.clone().sub(start), closest = triangle.closestPointToPoint(start, new T.Vector3());
    if (closest.distanceToSquared(start) <= 1 + 1e-8) {
        const n = start.clone().sub(closest);
        if (n.lengthSq() < epsilon) n.copy(normal).multiplyScalar(velocity.dot(normal) > 0 ? -1 : 1);
        n.normalize(); return { t: 0, normal: { x: n.x, y: n.y, z: n.z } };
    }
    let hit: Contact | null = null, limit = 1;
    const save = (time: number, point: T.Vector3) => {
        if (time < 0 || time > limit) return;
        const n = start.clone().addScaledVector(velocity, time).sub(point).normalize();
        limit = time; hit = { t: time, normal: { x: n.x, y: n.y, z: n.z } };
    };
    const rate = normal.dot(velocity);
    if (Math.abs(rate) > epsilon) for (const side of [-1, 1]) {
        const time = (side - distance) / rate;
        if (time < 0 || time > limit) continue;
        const point = start.clone().addScaledVector(velocity, time).addScaledVector(normal, -side);
        if (triangle.containsPoint(point)) save(time, point);
    }
    for (const point of [a, b, c]) {
        const delta = start.clone().sub(point);
        const time = firstRoot(velocity.lengthSq(), 2 * delta.dot(velocity), delta.lengthSq() - 1, limit);
        if (time !== null) save(time, point);
    }
    for (const [p, q] of [[a, b], [b, c], [c, a]]) {
        const edge = q.clone().sub(p), length = edge.lengthSq();
        if (length < epsilon) continue;
        const delta = start.clone().sub(p), dv = delta.dot(edge), vv = velocity.dot(edge);
        const perpendicularVelocity = velocity.clone().addScaledVector(edge, -vv / length);
        const perpendicularStart = delta.clone().addScaledVector(edge, -dv / length);
        const time = firstRoot(perpendicularVelocity.lengthSq(), 2 * perpendicularStart.dot(perpendicularVelocity), perpendicularStart.lengthSq() - 1, limit);
        if (time === null) continue;
        const fraction = (dv + vv * time) / length;
        if (fraction >= 0 && fraction <= 1) save(time, p.clone().addScaledVector(edge, fraction));
    }
    return hit;
}

export function queryTriangleIndices(collider: TriangleCollider, query: Box) {
    const found: number[] = [], pending = [collider.bvh.root];
    while (pending.length) {
        const node = collider.bvh.nodes[pending.pop()!];
        if (!node || node.min[0] > query.max.x || node.max[0] < query.min.x || node.min[1] > query.max.y || node.max[1] < query.min.y || node.min[2] > query.max.z || node.max[2] < query.min.z) continue;
        if (node.indices) found.push(...node.indices);
        else { if (node.left !== undefined) pending.push(node.left); if (node.right !== undefined) pending.push(node.right); }
    }
    return found;
}

/** Transform the sphere to world-axis ellipsoid space without inflating apertures. */
export function sweepTriangleCollider(collider: TriangleCollider, matrix: T.Matrix4, start: Vec, end: Vec, radius: Vec, weights = collider.morphWeights, cacheTransform = false): Contact | null {
    const r = new T.Vector3(Math.max(.001, radius.x), Math.max(.001, radius.y), Math.max(.001, radius.z));
    const frozen = cacheTransform && !collider.morphTargets?.length ? frozenSurface(collider, matrix) : undefined;
    const query = new T.Box3(new T.Vector3(Math.min(start.x, end.x) - r.x, Math.min(start.y, end.y) - r.y, Math.min(start.z, end.z) - r.z), new T.Vector3(Math.max(start.x, end.x) + r.x, Math.max(start.y, end.y) + r.y, Math.max(start.z, end.z) + r.z)).applyMatrix4(frozen?.inverse ?? matrix.clone().invert());
    const candidates = queryTriangleIndices(collider, { min: query.min, max: query.max });
    const a = new T.Vector3(start.x, start.y, start.z).divide(r), b = new T.Vector3(end.x, end.y, end.z).divide(r);
    const minX = Math.min(a.x, b.x) - 1 - 1e-8, maxX = Math.max(a.x, b.x) + 1 + 1e-8;
    const minY = Math.min(a.y, b.y) - 1 - 1e-8, maxY = Math.max(a.y, b.y) + 1 + 1e-8;
    const minZ = Math.min(a.z, b.z) - 1 - 1e-8, maxZ = Math.max(a.z, b.z) + 1 + 1e-8;
    let first: Contact | null = null;
    const vertices = [new T.Vector3(), new T.Vector3(), new T.Vector3()];
    for (const index of candidates) {
        for (let j = 0; j < 3; j++) {
            const at = collider.indices[index * 3 + j] * 3, vertex = vertices[j];
            if (frozen) vertex.fromArray(frozen.positions, at).divide(r);
            else {
                vertex.fromArray(collider.positions, at);
                collider.morphTargets?.forEach((target, k) => { if (weights?.[k]) vertex.addScaledVector(new T.Vector3().fromArray(target, at), weights[k]); });
                vertex.applyMatrix4(matrix).divide(r);
            }
        }
        if (Math.min(vertices[0].x, vertices[1].x, vertices[2].x) > maxX || Math.max(vertices[0].x, vertices[1].x, vertices[2].x) < minX ||
            Math.min(vertices[0].y, vertices[1].y, vertices[2].y) > maxY || Math.max(vertices[0].y, vertices[1].y, vertices[2].y) < minY ||
            Math.min(vertices[0].z, vertices[1].z, vertices[2].z) > maxZ || Math.max(vertices[0].z, vertices[1].z, vertices[2].z) < minZ) continue;
        const hit = sweepUnitTriangle(a, b, vertices[0], vertices[1], vertices[2]);
        if (!hit || first && hit.t >= first.t) continue;
        const normal = new T.Vector3(hit.normal.x, hit.normal.y, hit.normal.z).divide(r).normalize();
        first = { t: hit.t, normal: { x: normal.x, y: normal.y, z: normal.z } };
    }
    return first;
}
