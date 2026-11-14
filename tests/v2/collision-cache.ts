import assert from 'node:assert/strict';
import * as T from 'three';
import { catalog, proxies } from './fixtures';
import { obstacleContact, orientedSolid, sweepSolid, type Contact } from '../../app/airrun/collision';
import { sweepTriangleCollider } from '../../app/airrun/mesh-collision';
import { rigPose } from '../../app/airrun/rig-motion';
import type { Obstacle, Vec } from '../../app/airrun/types';
// Oracle visits every original collider surface with uncached transforms. This
// exercises the new model-level BVH and invalidation, not its internal nodes.
let checks = 0, maximumError = 0;
for (const id of ['airport_flipdot_arrivals','forest_log_loader','snowcat','bucket_wheel_excavator','harbor_working_container_crane','korean_palace_throne_hall','rocky_arch','vista_banner_plane']) {
    const meta = catalog.get(id)!, proxy = proxies.get(id)!;
    assert(!proxy.static.length && !proxy.dynamic.length, 'Edition12 oracle uses the complete supplied triangle surfaces');
    const obstacle: Obstacle = { id: 1, model: id, position: { x: 0, y: 3, z: 100 }, scale: { x: 1, y: 1, z: 1 }, yaw: 0, size: {x:1,y:1,z:1}, role: 'audit', small: false, hit: false, scored: false };
    for (const variant of [0, 1, 2]) {
        Object.assign(obstacle.position, { x: variant * 13, y: 3 + variant, z: 100 + variant * 23 });
        Object.assign(obstacle.scale, { x: 1 + variant * .23, y: 1 + variant * .11, z: 1 - variant * .07 }); obstacle.yaw = variant * .67;
        const root = new T.Matrix4().makeRotationY(obstacle.yaw).scale(new T.Vector3(obstacle.scale.x, obstacle.scale.y, obstacle.scale.z)).premultiply(new T.Matrix4().makeScale(1,1,-1)); root.setPosition(obstacle.position.x, obstacle.position.y, obstacle.position.z);
        for (const time of [undefined, .43, 3.1]) for (const horizontal of [-1.1,-.7,-.3,0,.3,.7,1.1]) for (const vertical of [.15,.5,.85]) {
            const x = obstacle.position.x + horizontal * Math.max(4, meta.bounds.size[0]) * .5;
            const y = obstacle.position.y + meta.bounds.min[1] + meta.bounds.size[1] * vertical;
            const start: Vec = { x, y, z: obstacle.position.z - Math.max(15, meta.bounds.size[2]) }, end = { ...start, z: obstacle.position.z + Math.max(15, meta.bounds.size[2]) };
            const radius = { x: .39, y: .57, z: .46 }, pose = rigPose(proxy.rig!, time ?? 0);
            let expected: Contact | null = null;
            for (const mesh of proxy.meshes!) {
                const node = pose.get(mesh.node) as T.Mesh | undefined;
                const result = mesh.animated && time === undefined && mesh.envelope
                    ? sweepSolid(start, end, orientedSolid(mesh.envelope, root), radius)
                    : sweepTriangleCollider(mesh, node ? root.clone().multiply(node.matrixWorld) : root, start, end, radius, node?.morphTargetInfluences ?? mesh.morphWeights, false);
                if (result && (!expected || result.t < expected.t)) expected = result;
            }
            const actual = obstacleContact(obstacle, meta, proxy, start, end, radius, undefined, time);
            assert.equal(!!actual, !!expected, id + ' accelerated surface selection matches every source surface');
            if (actual && expected) { const error = Math.abs(actual.t - expected.t); maximumError = Math.max(maximumError, error); assert(error < 1e-9, id + ' exact contact time unchanged'); }
            checks++;
        }
    }
}
console.log(JSON.stringify({ collisionCacheCases: checks, maximumContactTimeError: maximumError, transformInvalidation: true, sourceSurfaceOracle: true, gpuVerified: false, status: 'passed' }));
