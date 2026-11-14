import * as T from 'three';
import { terrainElevation, WORLD_HALF_WIDTH, harborAt } from './world-ground';
import { terrainSurfaceColor } from './terrain-palette';
import type { ThemeId } from './types';
export function terrainGeometry(start: number, theme: ThemeId, seed: number, variant = 0, cellSize = 8) {
    const positions: number[] = [], colors: number[] = [], top = new T.Color();
    const minX = -WORLD_HALF_WIDTH, maxX = WORLD_HALF_WIDTH, N = Math.ceil((maxX - minX) / cellSize), M = Math.ceil(128 / cellSize), cell = (maxX - minX) / N, stepZ = 128 / M;
    const heights: number[][] = [];
    for (let i = 0; i <= N; i++) {
        heights[i] = [];
        for (let j = 0; j <= M; j++) {
            const x = minX + i * cell, z = start + j * stepZ;
            heights[i][j] = terrainElevation(x, z, theme, seed, variant);
        }
    }
    const coastal = theme === 'coast' || theme === 'korea' && variant === 3;
    function triangle(vertices: number[][], color: T.Color) {
        for (const v of vertices) {
            positions.push(...v);
            colors.push(color.r, color.g, color.b);
        }
    }
    function clipped(vertices: number[][], edge: number, left: boolean) {
        const result: number[][] = [];
        for (let n = 0; n < vertices.length; n++) {
            const a = vertices[n], b = vertices[(n + 1) % vertices.length];
            const insideA = left ? a[0] <= edge : a[0] >= edge, insideB = left ? b[0] <= edge : b[0] >= edge;
            if (insideA) result.push(a);
            if (insideA !== insideB) {
                const t = (edge - a[0]) / (b[0] - a[0]);
                result.push([edge, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
            }
        }
        return result;
    }
    function quad(a: number[], b: number[], c: number[], d: number[], color: T.Color, quay = false) {
        if (!quay) { triangle([a, b, c, a, c, d], color); return; }
        // Remove the underlying triangles rather than layering two coplanar
        // surfaces. This keeps the exact quay height without z-fighting marks.
        for (const face of [[a, b, c], [a, c, d]]) for (const side of [-1, 1]) {
            const polygon = clipped(face, side < 0 ? 26 : 70, side < 0);
            for (let n = 1; n + 1 < polygon.length; n++) triangle([polygon[0], polygon[n], polygon[n + 1]], color);
        }
    }
    for (let i = 0; i < N; i++)
        for (let j = 0; j < M; j++) {
            const x = minX + i * cell, z = j * stepZ, h = heights[i][j];
            const slope = Math.max(Math.abs(heights[i + 1][j] - h) / cell, Math.abs(heights[i][j + 1] - h) / stepZ);
            terrainSurfaceColor(theme, variant, seed, x, start + z, h, slope, top);
            if ((theme === 'coast' || theme === 'korea' && variant === 3) && x >= 26 && x < 50 && harborAt(start + z, seed)) top.set('#7a8c85');
            const quay = coastal && x < 70 && x + cell > 26 && harborAt(start + z + stepZ / 2, seed);
            quad([x, h, -z], [x + cell, heights[i + 1][j], -z], [x + cell, heights[i + 1][j + 1], -z - stepZ], [x, heights[i][j + 1], -z - stepZ], top, quay);
        }
    // Broad, coarse ridges continue past the detailed play space instead of ending in a cut edge.
    for (const side of [-1, 1])
        for (let x = WORLD_HALF_WIDTH; x < 2304; x += 128)
            for (let j = 0; j < M; j++) {
                const z = j * stepZ, a = side * x, b = side * (x + 128);
                const h = terrainElevation(a, start + z, theme, seed, variant);
                const c = terrainSurfaceColor(theme, variant, seed, a, start + z, h, .6);
                const vertices = [[a, h, -z], [b, terrainElevation(b, start + z, theme, seed, variant), -z], [b, terrainElevation(b, start + z + stepZ, theme, seed, variant), -z - stepZ], [a, terrainElevation(a, start + z + stepZ, theme, seed, variant), -z - stepZ]];
                if (side < 0) vertices.reverse();
                quad(vertices[0], vertices[1], vertices[2], vertices[3], c);
            }
    // Continuous streets and quays give nearby structures a shared physical setting.
    const urban = theme === 'city' || theme === 'korea' && variant === 0;
    const village = theme === 'village' || theme === 'farm' || theme === 'korea' && (variant === 1 || variant === 2);
    for (let j = 0; j < M; j++) {
        const z = j * stepZ, worldZ = start + z;
        if (coastal && harborAt(worldZ + stepZ / 2, seed)) {
            // An exact flat quay and seawall, independent of the quality grid's cell edges.
            // Otherwise a 31m crane would hover over the 24–32m interpolated shore ramp.
            quad([26, 2.2, -z], [70, 2.2, -z], [70, 2.2, -z - stepZ], [26, 2.2, -z - stepZ], new T.Color('#83938c'));
            quad([26, -3.6, -z], [26, 2.2, -z], [26, 2.2, -z - stepZ], [26, -3.6, -z - stepZ], new T.Color('#617e7c'));
        }
        const strips = urban ? [{ x: 0, w: 18, c: '#435059' }, { x: -13, w: 6, c: '#a1a69a' }, { x: 13, w: 6, c: '#a1a69a' }] : village ? [{ x: 0, w: 10, c: '#9a8d72' }] : coastal && harborAt(worldZ + stepZ / 2, seed) ? [{ x: 28, w: 3.2, c: '#45565b' }, { x: 42, w: 1.2, c: '#cfbf96' }] : [];
        for (const strip of strips) {
            const a = strip.x - strip.w / 2, b = strip.x + strip.w / 2;
            const h = coastal ? 2.25 : 1.55;
            quad([a, h, -z], [b, h, -z], [b, h, -z - stepZ], [a, h, -z - stepZ], new T.Color(strip.c));
        }
        if (urban && Math.floor(worldZ / 8) % 2 === 0)
            quad([-.10, 1.565, -z], [.10, 1.565, -z], [.10, 1.565, -z - stepZ * .55], [-.10, 1.565, -z - stepZ * .55], new T.Color('#dec78a'));
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    g.computeVertexNormals();
    g.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    g.computeBoundingSphere();
    return g;
}
export { cloudField } from './cloud-field';
