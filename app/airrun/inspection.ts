import * as T from 'three';
import { updateModelPose } from './model-pose';
/** Sample actual visible silhouette; a rotated AABB adds empty corners and undersizes aircraft. */
export function inspectionPoints(root: T.Object3D, maxPoints = 4096): T.Vector3[] {
    updateModelPose(root);
    const inverse = root.matrixWorld.clone().invert(), meshes: T.Mesh[] = [];
    root.traverse(n => { if (n instanceof T.Mesh && n.visible && n.geometry.getAttribute('position'))
        meshes.push(n); });
    const total = meshes.reduce((sum, n) => sum + n.geometry.getAttribute('position').count, 0);
    const stride = Math.max(1, Math.ceil(total / maxPoints));
    const points: T.Vector3[] = [];
    for (const mesh of meshes) {
        const position = mesh.geometry.getAttribute('position'), matrix = inverse.clone().multiply(mesh.matrixWorld);
        for (let i = 0; i < position.count; i += stride)
            points.push(mesh.getVertexPosition(i, new T.Vector3()).applyMatrix4(matrix));
    }
    return points;
}
export function inspectionRadius(points: T.Vector3[], center: T.Vector3, direction: T.Vector3, aspect: number, heightFraction: number, widthFraction: number, fov = 48) {
    const forward = direction.clone().normalize(), right = new T.Vector3().crossVectors(new T.Vector3(0, 1, 0), forward).normalize();
    const up = new T.Vector3().crossVectors(forward, right).normalize();
    const tan = Math.tan(T.MathUtils.degToRad(fov / 2)), vertical = Math.max(.05, heightFraction) * tan, horizontal = Math.max(.05, widthFraction) * tan * Math.max(.1, aspect);
    let radius = 3;
    for (const point of points) {
        const x = point.x - center.x, y = point.y - center.y, z = point.z - center.z;
        const depth = x * forward.x + y * forward.y + z * forward.z;
        radius = Math.max(radius, depth + Math.abs(x * right.x + y * right.y + z * right.z) / horizontal, depth + Math.abs(x * up.x + y * up.y + z * up.z) / vertical, depth + .7);
    }
    return radius * 1.045;
}
/** Fit the silhouette while respecting the hangar ceiling and finite bay size. */
export function inspectionFit(points: T.Vector3[], localCenter: T.Vector3, desiredDirection: T.Vector3, aspect: number, heightFraction: number, widthFraction: number, baseY: number, zoom = 1) {
    const direction = desiredDirection.clone().normalize(), desiredPitch = Math.asin(direction.y), yaw = Math.atan2(direction.x, -direction.z);
    const worldCenter = localCenter.clone();
    worldCenter.y += baseY;
    let fov = 48, radius = 8;
    for (let iteration = 0; iteration < 40; iteration++) {
        radius = inspectionRadius(points, localCenter, direction, aspect, heightFraction, widthFraction, fov);
        if (radius > 31.5 && fov < 104) {
            fov += 2;
            continue;
        }
        radius = T.MathUtils.clamp(radius * zoom, 8, 31.5);
        const maxPitch = Math.asin(T.MathUtils.clamp((18.4 - worldCenter.y) / radius, .08, .99));
        const pitch = Math.min(desiredPitch, maxPitch);
        const nextDirection = new T.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
        if (nextDirection.distanceToSquared(direction) < 1e-8)
            break;
        direction.copy(nextDirection);
    }
    // Resolve once more after the ceiling constrained the final angle.
    radius = T.MathUtils.clamp(inspectionRadius(points, localCenter, direction, aspect, heightFraction, widthFraction, fov) * zoom, 8, 31.5);
    const target = worldCenter.clone().addScaledVector(direction, radius);
    target.y = Math.min(18.4, target.y);
    return { center: worldCenter, target, radius, fov };
}
