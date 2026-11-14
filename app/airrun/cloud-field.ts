import * as T from 'three';
import { hash } from './data';
export interface CloudCell { cloud: number; x: number; y: number; z: number; sx: number; sy: number; sz: number; layer: number; shade: number }
function formation(seed: number, cloud: number) {
    const salt = seed + cloud * 7919, anvil = cloud % 4 === 3;
    const near = cloud % 8 === 0;
    return {
        x: (hash(salt + 239) - .5) * (near ? 460 : 1500),
        z: near ? 1550 + hash(salt + 631) * 320 : 100 + hash(salt + 631) * 1700,
        y: (anvil ? 248 : 156) + hash(salt + 97) * (anvil ? 74 : 92),
        rx: (anvil ? 78 : 30) + hash(salt + 773) * (anvil ? 60 : 44),
        ry: (anvil ? 58 : 64) + hash(salt + 881) * (anvil ? 34 : 38),
        rz: 38 + hash(salt + 913) * 57, anvil,
    };
}
/** Complete voxel silhouettes at every quality, never sparse samples of a dense cloud. */
export function buildCloudCells(seed: number, budget: number): CloudCell[] {
    // A low-quality cloud still needs enough connected voxels to describe a
    // rounded crown. Keep fewer complete formations rather than coarse slabs.
    const formations = Math.min(32, Math.max(1, Math.min(Math.floor(budget / 8), Math.floor(Math.sqrt(budget) * .8)))), cells: CloudCell[] = [];
    for (let cloud = 0; cloud < formations; cloud++) {
        const perCloud = Math.floor((budget - cells.length) / (formations - cloud));
        const salt = seed + cloud * 7919, skew = (hash(salt + 41) - .5) * .32, form = formation(seed, cloud);
        let shape: { x: number; y: number; z: number; nx: number; ny: number; nz: number }[] = [];
        for (let nx = 1; nx <= 15; nx++) {
            const ny = Math.max(3, Math.ceil(nx * .90)), nz = Math.max(2, Math.round(nx * .85)), candidate: typeof shape = [];
            for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) {
                const x = -1 + (i + .5) * 2 / nx, y = (j + .5) / ny, z = -1 + (k + .5) * 2 / nz;
                const body = (x / .98) ** 2 + ((y - .24) / .27) ** 2 + (z / .89) ** 2;
                const tower = ((x - .18 - skew) / .53) ** 2 + ((y - .55) / .45) ** 2 + ((z - .08) / .67) ** 2;
                const shoulder = ((x + .43) / .48) ** 2 + ((y - .42) / .33) ** 2 + ((z + .12 + skew) / .64) ** 2;
                const crown = form.anvil ? ((x + .04) / 1.03) ** 2 + ((y - .76) / .20) ** 2 + ((z + .03) / .88) ** 2 : Infinity;
                if (Math.min(body, tower, shoulder, crown) <= 1) candidate.push({ x, y, z, nx, ny, nz });
            }
            if (candidate.length > perCloud) break;
            // Keep a complete connected volume even at the smallest quality grid.
            if (candidate.length) {
                const connected = new Set([0]), queue = [0];
                while (queue.length) {
                    const a = candidate[queue.pop()!];
                    for (let i = 0; i < candidate.length; i++) if (!connected.has(i)) {
                        const b = candidate[i];
                        if (Math.abs(a.x - b.x) * nx / 2 + Math.abs(a.y - b.y) * ny + Math.abs(a.z - b.z) * nz / 2 < 1.001) { connected.add(i); queue.push(i); }
                    }
                }
                shape = candidate.filter((_, i) => connected.has(i));
            }
        }
        for (const p of shape) cells.push({ cloud, x: form.x + p.x * form.rx, y: form.y + p.y * form.ry, z: form.z + p.z * form.rz,
            sx: form.rx * 2 / p.nx * 1.005, sy: form.ry / p.ny * 1.005, sz: form.rz * 2 / p.nz * 1.005,
            layer: p.y, shade: .94 + hash(salt + p.x * 271 + p.z * 173) * .06 });
    }
    return cells;
}
export function cloudField(seed: number) {
    const capacity = 5200, geometry = new T.BoxGeometry(1, 1, 1);
    const material = new T.MeshStandardMaterial({ color: '#ffffff', roughness: 1, envMapIntensity: .15, emissive: '#ffffff', emissiveIntensity: .54 });
    // A cloud scatters light through its volume. Standard surface lighting alone
    // turns downward faces black, especially with an orange sun at the horizon.
    // Reuse the crown/base instance gradient for a small multiple-scatter fill;
    // direct light still provides face definition, without an extra draw/pass.
    material.onBeforeCompile = shader => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
            #if defined(USE_COLOR) || defined(USE_INSTANCING_COLOR) || defined(USE_COLOR_ALPHA)
                totalEmissiveRadiance *= vColor.rgb;
            #endif`);
    };
    material.customProgramCacheKey = () => 'airrun-cloud-scatter-7';
    const mesh = new T.InstancedMesh(geometry, material, capacity), object = new T.Object3D();
    let data = buildCloudCells(seed, 2600), budget = 2600, lastTime = 0, lastDistance = 0;
    const centres = Array.from({ length: 32 }, (_, cloud) => formation(seed, cloud));
    const top = new T.Color(), middle = new T.Color(), base = new T.Color(), color = new T.Color(), sunlight = new T.Color();
    const palette = { top: new T.Color('#fff6df'), middle: new T.Color('#b5d3e9'), base: new T.Color('#6384a9'),
        sunset: new T.Color('#ffac73'), dawn: new T.Color('#ffd3a0'), middleWarm: new T.Color('#b28caf'), baseWarm: new T.Color('#675b91'),
        topNight: new T.Color('#7899bf'), middleNight: new T.Color('#4b6a92'), baseNight: new T.Color('#2b456d') };
    mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true;
    const drift = (time: number, distance = 0) => mesh.position.set((Math.sin(time * .012) - Math.sin(lastTime * .012)) * 30, 0, distance - lastDistance + (time - lastTime) * 2);
    const update = (time: number, cloud: number, night: number, distance = 0, warm = 0, dawn = 0) => {
        material.emissiveIntensity = (.56 + warm * .22) * (1 - night * .76) * (1 - cloud * .28);
        sunlight.copy(palette.sunset).lerp(palette.dawn, dawn);
        top.copy(palette.top).lerp(sunlight, warm * .82).lerp(palette.topNight, night * .87);
        middle.copy(palette.middle).lerp(palette.middleWarm, warm * .88).lerp(palette.middleNight, night * .86);
        base.copy(palette.base).lerp(palette.baseWarm, warm * .82).lerp(palette.baseNight, night * .8);
        // Weather changes actual sky coverage, not only a label or a gray tint.
        // Expand complete formations about their centres, preserving every silhouette.
        const coverage = .72 + cloud * .82;
        data.forEach((d, n) => {
            const centre = centres[d.cloud];
            // Whole formations wrap beyond the normal far plane, without tearing.
            const wrapped = ((centre.z + time * 2 + distance) % 2800 + 2800) % 2800 - 2100;
            const swell = 1 + Math.sin(time * .045 + d.cloud * 1.7) * .012;
            object.position.set(centre.x + (d.x - centre.x) * coverage + Math.sin(time * .012) * 30, centre.y - cloud * 22 + (d.y - centre.y) * swell, wrapped + (d.z - centre.z) * coverage);
            object.scale.set(d.sx * coverage, d.sy * (1 + cloud * .22) * swell, d.sz * coverage); object.updateMatrix(); mesh.setMatrixAt(n, object.matrix);
            const layer = d.layer * d.layer * (3 - 2 * d.layer);
            color.copy(layer > .5 ? middle : base).lerp(layer > .5 ? top : middle, layer > .5 ? (layer - .5) * 2 : layer * 2);
            const sunward = Math.max(0, (d.x - centre.x) / centre.rx * (dawn > .5 ? -1 : 1));
            color.lerp(sunlight, warm * (1 - night) * sunward * layer * .35).multiplyScalar(d.shade * (1 - cloud * .25));
            mesh.setColorAt(n, color);
        });
        mesh.count = data.length; mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        lastTime = time; lastDistance = distance; mesh.position.set(0, 0, 0);
    };
    update(0, .12, 0);
    return { mesh, update, drift, setQuality: (n: number) => {
        const next = Math.max(8, Math.min(capacity, Math.floor(n)));
        if (next !== budget) { budget = next; data = buildCloudCells(seed, budget); }
    }, dispose: () => { mesh.dispose(); geometry.dispose(); material.dispose(); } };
}
