import * as T from 'three';
/**
 * Runtime hygiene for the supplied AeroForge material vocabulary.
 *
 * rocky_arch is AF_stone + AF_leaf in static_shell. Its stone feet are
 * structural geometry, not an identifiable preview/water pad. Never delete
 * static_shell, low triangles, AF_stone or AF_water to disguise shading.
 */
export type ModelSurfaceRole = 'body' | 'glass' | 'signal' | 'water' | 'other';
const BODY_MATERIALS = new Set(['AF_paint', 'AF_metal', 'AF_rubber', 'AF_stone', 'AF_wood', 'AF_leaf']);
const SIGNAL_MATERIALS = new Set(['AF_light_warm', 'AF_light_cyan', 'AF_light_red']);
export function modelSurfaceRole(material: T.Material): ModelSurfaceRole {
    if (SIGNAL_MATERIALS.has(material.name))
        return 'signal';
    if (/^AF_glass(?:_|$)/.test(material.name) || material.name === 'E12_SHARED_GLAZING')
        return 'glass';
    if (material.name === 'AF_water')
        return 'water';
    if (BODY_MATERIALS.has(material.name))
        return 'body';
    return 'other';
}
export function isSignalSurface(material: T.Material): boolean {
    return modelSurfaceRole(material) === 'signal';
}
/** Only explicit authored preview metadata can exclude a surface. */
export function isExplicitPreviewSurface(node: T.Object3D): boolean {
    return node.userData.previewOnly === true || node.userData.role === 'preview_base' || node.userData.role === 'display_base';
}
/** Geometry compilation must honor the same explicit metadata as visibility. */
export function shouldRenderModelSurface(node: T.Object3D): boolean {
    for (let current: T.Object3D | null = node; current; current = current.parent)
        if (isExplicitPreviewSurface(current))
            return false;
    return true;
}
export interface ModelSurfaceReport {
    materials: number;
    bodyMaterials: number;
    preservedSignals: number;
    preservedGlass: number;
    correctedBodyEmission: number;
    explicitPreviewNodes: string[];
}
/**
 * Apply once to the loaded cache model before collecting baseEmissive values.
 * Vertex palettes, PBR reflectance, meshes, pivots and contact remain intact.
 * Unknown materials, lamps, glass and water retain authored emission. A zero
 * body baseEmissive prevents weather from amplifying stale maintenance glow.
 * This is not an exposure/bloom fix: native aircraft paint does not emit light.
 */
export function normalizeModelSurfaces(root: T.Object3D): ModelSurfaceReport {
    const report: ModelSurfaceReport = { materials: 0, bodyMaterials: 0, preservedSignals: 0,
        preservedGlass: 0, correctedBodyEmission: 0, explicitPreviewNodes: [] };
    const seen = new Set<T.Material>();
    root.traverse(node => {
        if (isExplicitPreviewSurface(node)) {
            report.explicitPreviewNodes.push(node.name);
            node.visible = false;
        }
        if (!(node instanceof T.Mesh))
            return;
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
            if (seen.has(material))
                continue;
            seen.add(material);
            report.materials++;
            const role = modelSurfaceRole(material);
            material.userData.airrunSurfaceRole = role;
            if (role === 'signal')
                report.preservedSignals++;
            if (role === 'glass')
                report.preservedGlass++;
            if (role !== 'body' || !(material instanceof T.MeshStandardMaterial))
                continue;
            report.bodyMaterials++;
            if (material.emissive.r || material.emissive.g || material.emissive.b)
                report.correctedBodyEmission++;
            material.emissive.setRGB(0, 0, 0);
            material.emissiveIntensity = 0;
            material.userData.baseEmissive = 0;
            if (!material.toneMapped) {
                material.toneMapped = true;
                material.needsUpdate = true;
            }
        }
    });
    return report;
}
export interface RockyArchBasePaletteReport {
    applied: boolean;
    verticesAdjusted: number;
    cutoffY: number;
    height: number;
}
/** Legacy AF_stone feet only; Edition 8/9 V8_rock and V8_slate retain their new palette. */
export const AUDITED_STONE_BASE_MODELS = new Set([
    'rocky_arch', 'sea_stacks', 'mountain_peak', 'rocky_ridge', 'waterfall_cliff',
]);
/**
 * Optional correction for those five audited grey natural-rock feet.
 * rocky_arch bottom10% has 3.33x p90/p10 luminance contrast: blue-grey
 * RGB[21,26,31] is interspersed with grey[60,67,66] and bright accents.
 * Compress that foot's AF_stone contrast toward existing upper-stone
 * median[50,55,54]; full correction below7% fades to zero at10% height.
 * sea_stacks/rocky_ridge/waterfall_cliff are comparable (3.16-3.33x),
 * mountain_peak is2.82x with the same grey palette. Desert strata, ice,
 * architecture and aircraft are deliberately outside this measured allowlist.
 * Run on the unposed loaded cache model. Opt-in and idempotent.
 */
export function smoothAuditedStoneBasePalette(root: T.Object3D, assetId: string, enabled = false): RockyArchBasePaletteReport {
    const report = { applied: false, verticesAdjusted: 0, cutoffY: 0, height: 0 };
    if (!enabled || !AUDITED_STONE_BASE_MODELS.has(assetId))
        return report;
    root.updateMatrixWorld(true);
    const inverseRoot = root.matrixWorld.clone().invert(), point = new T.Vector3(), meshes: T.Mesh[] = [];
    let minY = Infinity, maxY = -Infinity;
    root.traverse(node => {
        if (!(node instanceof T.Mesh))
            return;
        const position = node.geometry.getAttribute('position');
        if (!position)
            return;
        const matrix = node.matrixWorld.clone().premultiply(inverseRoot);
        for (let i = 0; i < position.count; i++) {
            point.fromBufferAttribute(position, i).applyMatrix4(matrix);
            minY = Math.min(minY, point.y);
            maxY = Math.max(maxY, point.y);
        }
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        if (materials.every(material => material.name === 'AF_stone'))
            meshes.push(node);
    });
    const height = maxY - minY;
    if (!Number.isFinite(height) || height <= 0)
        return report;
    report.height = height;
    report.cutoffY = minY + height * .10;
    const fadeStart = minY + height * .07, target = [50 / 255, 55 / 255, 54 / 255];
    const targetLuma = .2126 * target[0] + .7152 * target[1] + .0722 * target[2];
    for (const mesh of meshes) {
        const geometry = mesh.geometry;
        if (geometry.userData.airrunStoneFootPalette || geometry.userData.airrunRockyFootPalette)
            continue;
        const original = geometry.getAttribute('color');
        if (!original)
            continue;
        const color = original.clone(), position = geometry.getAttribute('position');
        const matrix = mesh.matrixWorld.clone().premultiply(inverseRoot);
        for (let i = 0; i < position.count; i++) {
            point.fromBufferAttribute(position, i).applyMatrix4(matrix);
            if (point.y >= report.cutoffY)
                continue;
            const t = T.MathUtils.clamp((point.y - fadeStart) / (report.cutoffY - fadeStart), 0, 1);
            const weight = 1 - t * t * (3 - 2 * t);
            const r = original.getX(i), g = original.getY(i), b = original.getZ(i);
            const detail = T.MathUtils.clamp((.2126 * r + .7152 * g + .0722 * b - targetLuma) * .08, -.02, .02);
            color.setXYZ(i, T.MathUtils.lerp(r, target[0] + detail, weight), T.MathUtils.lerp(g, target[1] + detail, weight), T.MathUtils.lerp(b, target[2] + detail, weight));
            report.verticesAdjusted++;
        }
        color.needsUpdate = true;
        geometry.setAttribute('color', color);
        geometry.userData.airrunStoneFootPalette = true;
        report.applied = true;
    }
    return report;
}
/** Compatibility entry point restricted to the originally audited arch. */
export function smoothRockyArchBasePalette(root: T.Object3D, assetId: string, enabled = false): RockyArchBasePaletteReport {
    return smoothAuditedStoneBasePalette(root, assetId, enabled && assetId === 'rocky_arch');
}
