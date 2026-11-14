import type { Material, Mesh } from 'three';
/** Edition12's paint/ivory atlas cell. Metal, glazing, rubber and lamps stay native. */
export function isPaintMaterial(material: Material) {
    return /paint/i.test(material.name) || material.name === 'E12_SHARED_SURFACE';
}
export function isPaintVertex(mesh: Mesh, index: number) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (materials.some(m => /paint/i.test(m.name))) return true;
    if (!materials.some(m => m.name === 'E12_SHARED_SURFACE')) return false;
    const uv = mesh.geometry.getAttribute('uv');
    return !!uv && uv.getX(index) >= 0 && uv.getX(index) < .25 && uv.getY(index) >= 0 && uv.getY(index) < .25;
}
