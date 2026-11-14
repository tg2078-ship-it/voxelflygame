import * as T from 'three';
const target = new T.Vector3();
export function projectGuidance(camera: T.PerspectiveCamera, point: { x: number; y: number; z: number }, origin: number, offset: number, speed: number) {
    const distance = point.z - origin;
    camera.updateMatrixWorld();
    target.set(point.x, point.y, origin - point.z + offset).project(camera);
    return { x: (target.x * .5 + .5) * 100, y: (-target.y * .5 + .5) * 100,
        visible: distance > 45 && distance < Math.max(180, speed * 6) && target.z > -1 && target.z < 1 && Math.abs(target.x) < .82 && Math.abs(target.y) < .65 };
}
