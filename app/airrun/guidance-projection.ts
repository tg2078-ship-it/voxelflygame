import * as T from 'three';
const target = new T.Vector3();
export function projectGuidance(camera: T.PerspectiveCamera, point: { x: number; y: number; z: number }, origin: number, offset: number, speed: number) {
    const distance = point.z - origin;
    camera.updateMatrixWorld();
    target.set(point.x, point.y, origin - point.z + offset).project(camera);
    return { x: (target.x * .5 + .5) * 100, y: (-target.y * .5 + .5) * 100,
        visible: distance > 45 && distance < Math.max(180, speed * 6) && target.z > -1 && target.z < 1 && Math.abs(target.x) < .82 && Math.abs(target.y) < .65 };
}

export function projectRingSight(camera: T.PerspectiveCamera, ring: {x:number; y:number; z:number; speedGate?:boolean}, origin:number, offset:number, distance:number) {
    camera.updateMatrixWorld();
    target.set(ring.x,ring.y,origin-ring.z+offset).applyMatrix4(camera.matrixWorldInverse);
    if (target.z >= -camera.near || distance < 0) return;
    target.applyMatrix4(camera.projectionMatrix);
    const dx = target.x*50, dy = -target.y*50;
    const bound = Math.max(1, Math.abs(dx)/40, dy/(dy<0?-31:32));
    return { x:50+dx/bound, y:50+dy/bound, edge:bound>1, angle:Math.atan2(dy,dx*camera.aspect)*180/Math.PI,
        distance, speedGate:!!ring.speedGate };
}
