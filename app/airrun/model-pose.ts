import * as T from 'three';

/** CPU consumers must see the same skeleton pose as the GPU skinning shader. */
export function updateModelPose(root: T.Object3D) {
    root.updateMatrixWorld(true);
    root.traverse(node => { if ((node as T.SkinnedMesh).isSkinnedMesh) (node as T.SkinnedMesh).skeleton.update(); });
}

/** A complete frozen silhouette for distant instancing. Never omit skin meshes. */
export function posedGeometry(mesh: T.Mesh): { geometry: T.BufferGeometry; owned: boolean } {
    const skin = (mesh as T.SkinnedMesh).isSkinnedMesh ? mesh as T.SkinnedMesh : null;
    if (!skin && !mesh.morphTargetInfluences?.length) return { geometry: mesh.geometry, owned: false };
    const geometry = mesh.geometry.clone(), source = mesh.geometry;
    const count = source.getAttribute('position').count;
    const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3);
    const point = new T.Vector3(), normal = new T.Vector3(), delta = new T.Vector3();
    const bone = new T.Matrix4(), weighted = new T.Matrix4(), transform = new T.Matrix4(), linear = new T.Matrix3();
    const indices = source.getAttribute('skinIndex'), weights = source.getAttribute('skinWeight'), base = source.getAttribute('normal');
    const influences = mesh.morphTargetInfluences ?? [];
    if (skin) skin.skeleton.update();
    for (let i = 0; i < count; i++) {
        mesh.getVertexPosition(i, point); point.toArray(positions, i * 3);
        if (!base) continue;
        normal.fromBufferAttribute(base, i);
        const targets = source.morphAttributes.normal;
        if (targets) {
            if (!source.morphTargetsRelative) normal.multiplyScalar(1 - influences.reduce((a, b) => a + b, 0));
            targets.forEach((target, k) => { if (influences[k]) normal.addScaledVector(delta.fromBufferAttribute(target, i), influences[k]); });
        }
        if (skin) {
            weighted.elements.fill(0);
            for (let k = 0; k < 4; k++) {
                const w = weights.getComponent(i, k); if (!w) continue;
                bone.fromArray(skin.skeleton.boneMatrices!, indices.getComponent(i, k) * 16);
                for (let n = 0; n < 16; n++) weighted.elements[n] += bone.elements[n] * w;
            }
            transform.multiplyMatrices(skin.bindMatrixInverse, weighted).multiply(skin.bindMatrix);
            normal.applyMatrix3(linear.setFromMatrix4(transform));
        }
        normal.normalize().toArray(normals, i * 3);
    }
    geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    if (base) geometry.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
    geometry.deleteAttribute('skinIndex'); geometry.deleteAttribute('skinWeight');
    geometry.morphAttributes = {}; geometry.morphTargetsRelative = false;
    return { geometry, owned: true };
}
