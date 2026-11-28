import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ModelLibrary, type ModelInstance } from './assets';
import { DEPARTURE, HANGAR_ENTRY_SECONDS } from './flight-presentation';
/** A solid maintenance hangar, independent of all flight water and terrain. */
export class AirportView {
    root = new T.Group();
    private doorTime = HANGAR_ENTRY_SECONDS;
    private thresholdSignal: T.MeshStandardMaterial;
    get entryProgress() { return this.doorTime / HANGAR_ENTRY_SECONDS; }
    readonly doorLeaves: T.Mesh[] = [];
    lights: T.Light[] = [];
    instances: ModelInstance[] = [];
    disposed = false;
    private geometry = new Set<T.BufferGeometry>();
    private materials = new Set<T.Material>();
    private textures = new Set<T.Texture>();
    constructor(scene: T.Scene, public library: ModelLibrary) {
        scene.add(this.root);
        const make = (color: string, roughness = .7, metalness = .1, emission?: string) => {
            const m = new T.MeshStandardMaterial({ color, roughness, metalness, emissive: emission ?? '#000000', emissiveIntensity: emission ? 2.6 : 0 });
            this.materials.add(m);
            return m;
        };
        const deck = make('#283740', .58, .28), steel = make('#1c2a35', .48, .65), rib = make('#516c79', .4, .7), wall = make('#192a36', .8), gold = make('#c4a36c', .5, .36), ivory = make('#dedccf', .65), led = make('#c5e7f1', .25, .35, '#b5dfea'), orange = make('#df9a58', .5);
        this.floorFinish(deck);
        const seams = make('#14232e', .9), workzone = make('#354851', .76, .16), amber = make('#e3b96f', .45, .15, '#a06720');
        const batches = new Map<T.Material, T.BufferGeometry[]>();
        const box = (x: number, y: number, z: number, w: number, h: number, d: number, m: T.Material, rotation = 0) => {
            const g = new T.BoxGeometry(w, h, d);
            g.rotateZ(rotation);
            g.translate(x, y, z);
            const list = batches.get(m) ?? [];
            list.push(g);
            batches.set(m, list);
        };
        box(0, .16, 1, 86, .4, 72, deck);
        this.airfieldIsland(make('#687f51', 1), make('#6c6e5b', 1));
        box(0, .28, 0, 84, .16, 70, deck); // top .36
        // Cast floor panels and a restrained inspection lane, not a water plane.
        for (let x = -36; x <= 36; x += 9) box(x, .366, 0, .035, .01, 68, seams);
        for (let z = -27; z <= 27; z += 9) box(0, .367, z, 82, .01, .035, seams);
        for (const x of [-15, 15]) {
            box(x, .379, 0, .07, .012, 25, amber);
            for (const z of [-13, 13]) box(x - Math.sign(x) * 1.5, .379, z, 3, .012, .07, amber);
        }
        for (const x of [-37.5, 37.5]) {
            box(x, .38, 0, 4.8, .025, 52, workzone);
            box(x, 8.1, 0, .14, .18, 58, led);
            for (let z = -26; z < 27; z += 8) {
                box(x, 3, z, .13, 5.9, .14, gold);
                box(x, 5.8, z, .3, .5, .25, led);
            }
        }
        box(0, 1.0, 34.5, 84, 1.25, 1, steel);
        for (const x of [-41, 41]) {
            box(x, 10.6, 0, 1.1, 21, 70, wall);
            box(x * .985, 2, 0, .35, 3, 70, steel);
        }
        box(0, 10.6, 34.6, 82, 21, 1.2, wall);
        box(0, 21.35, 0, 85, .8, 71, wall);
        for (let z = -30; z <= 30; z += 10) {
            for (const x of [-40, 40])
                box(x, 10.5, z, .65, 21, .8, rib);
            box(0, 20.5, z, 80, .7, .8, rib);
            for (let x = -35; x <= 35; x += 10) {
                box(x, 19.6, z, 10.5, .35, .45, steel, x % 20 ? .17 : -.17);
                box(x, 21, z, .3, 2, .35, rib);
            }
        }
        for (const x of [-18, 18]) {
            box(x, 20.5, 0, .3, .12, 49, steel);
            box(x, 20.38, 0, .13, .10, 48, led);
            box(x * 2.15, 6.3, 0, .1, .12, 56, led);
        }
        // Suspended service gantry and alternating ceiling light bays give depth.
        box(0, 18.6, 24, 78, .9, 1.8, steel);
        box(-22, 17.8, 24, 5, .7, 3.4, orange);
        box(-22, 14.6, 24, .09, 5.8, .09, rib);
        box(-22, 11.7, 24, .9, .45, .3, gold);
        for (const z of [-22, -4, 14]) {
            box(0, 20.15, z, 14, .18, 2.4, steel);
            box(0, 20.03, z, 11.8, .04, 1.3, led);
        }
        for (const x of [-22, 22]) {
            box(x, .375, 2, .12, .025, 52, gold);
            for (let z = -24; z < 28; z += 5)
                box(x + Math.sign(x) * 1.5, .375, z, 1.4, .025, .13, gold);
        }
        // Real service equipment forms the silhouette around the hero aircraft.
        for (let i = 0; i < 6; i++) {
            const x = -33 + i * 3.5;
            box(x, 2.2, 31.7, 3, 3.65, 1.4, i % 2 ? steel : rib);
            for (let y = .8; y < 3.8; y += .55) {
                box(x, y, 30.94, 2.7, .03, .03, gold);
                box(x + 1, y + .17, 30.92, .3, .05, .035, ivory);
            }
        }
        box(30, 1.8, 28.5, 15, .35, 3.3, gold);
        for (const x of [24, 30, 36])
            box(x, 1, 28.5, .3, 1.7, 2.8, steel);
        for (let i = 0; i < 9; i++)
            box(24 + i * 1.5, 2.22, 28.8, .85, .5 + i % 3 * .2, .8, i % 2 ? rib : orange);
        for (let y = 1.2; y < 7; y += 1.6) {
            box(37, y, 16, 6, .2, 9, rib);
            for (let i = 0; i < 3; i++)
                box(37, y + .7, 13 + i * 2.7, 3.9, 1.1, 1.9, i % 2 ? steel : gold);
        }
        for (const z of [11, 21])
            box(34, 3.4, z, .3, 7, .4, rib);
        box(-35, .8, 12, 6, 1, 3, steel);
        box(-35, 1.6, 12, 6, .3, 3, orange);
        // Runway extends naturally from the bay, above the apron.
        box(0, .27, (DEPARTURE.runwayStart + DEPARTURE.runwayEnd) / 2, 32, .16, DEPARTURE.runwayStart - DEPARTURE.runwayEnd, steel);
        for (let z = DEPARTURE.runwayStart - 14; z > DEPARTURE.runwayEnd + 9; z -= 24)
            box(0, .37, z, .4, .04, 8, ivory);
        for (const x of [-20, 20])
            for (let z = DEPARTURE.runwayStart - 4; z > DEPARTURE.runwayEnd; z -= 18)
                box(x, .45, z, .2, .25, .5, led);
        // Folded door panels park under a fixed rail at either side of the aperture.
        box(0, 20.9, -34.3, 83, .55, 1.1, rib);
        this.thresholdSignal = make('#a4efd9', .3, .25, '#50d6a4');
        for (const side of [-1, 1]) {
            box(side * 18, 20.7, -35.1, 2.4, .76, .48, steel);
            box(side * 18, 20.7, -35.39, 1.76, .31, .18, this.thresholdSignal);
            for (let i = 0; i < 4; i++) box(side * 12, .51, -34 - i * 4, .30, .07, 1.25, this.thresholdSignal);
        }
        const glazing = make('#9cb8b5', .28, .28, '#434f49');
        for (const side of [-1, 1]) {
            for (let leaf = 0; leaf < 3; leaf++) {
                const panelGeometry = new T.BoxGeometry(13.32, 20, .32);
                const panel = new T.Mesh(panelGeometry, steel);
                panel.position.set(side * (39.6 + leaf * .85), 10.5, -34.7 + leaf * .44);
                const braces = [new T.BoxGeometry(.22, 19.7, .12), new T.BoxGeometry(12.6, .18, .13), new T.BoxGeometry(11.8, 1.3, .12)];
                for (const [i,geometry] of braces.entries()) {
                    this.geometry.add(geometry);
                    const fitting = new T.Mesh(geometry, [gold,rib,glazing][i]);
                    fitting.position.set(i === 0 ? -side*6.48 : 0, [0,-3,4.3][i], .20);
                    panel.add(fitting);
                }
                // Exterior rail ribs and latch markings are fixed to each sliding leaf.
                const ribs: T.BufferGeometry[] = [];
                for (let y = -8; y <= 8; y += 4) ribs.push(new T.BoxGeometry(12.9,.16,.20).translate(0,y,-.23));
                const ribGeometry = mergeGeometries(ribs);
                for (const part of ribs) part.dispose();
                this.geometry.add(ribGeometry);
                panel.add(new T.Mesh(ribGeometry, rib));
                const latch = new T.BoxGeometry(.28,18.8,.17).translate(-side*6.18,0,-.24);
                this.geometry.add(latch);
                panel.add(new T.Mesh(latch, gold));
                if (leaf === 0) {
                    const stencil = this.sign(side > 0 ? 'BAY' : '01', 512, 176, 8.4, true);
                    stencil.rotation.y = Math.PI;
                    stencil.position.set(-side * .8, 2, -.35);
                    panel.add(stencil);
                }
                panel.castShadow = true;
                this.geometry.add(panelGeometry);
                this.doorLeaves.push(panel);
                this.root.add(panel);
            }
            for (let z = -25; z <= 25; z += 10) {
                box(side * 40.33, 14.6, z, .18, 3.7, 8.4, rib);
                box(side * 40.17, 14.6, z, .16, 3.2, 7.9, glazing);
                box(side * 40.04, 14.6, z, .13, 3.25, .16, steel);
            }
        }
        for (const [m, list] of batches) {
            const g = mergeGeometries(list, false)!;
            this.geometry.add(g);
            for (const part of list)
                part.dispose();
            const mesh = new T.Mesh(g, m);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.root.add(mesh);
        }
        const standGeometry = new T.CylinderGeometry(11.7, 11.7, .12, 96), stand = new T.Mesh(standGeometry, make('#182b37', .52, .28));
        stand.position.y = .43;
        stand.receiveShadow = true;
        this.geometry.add(standGeometry);
        this.root.add(stand);
        const circleGeometry = new T.TorusGeometry(11.8, .035, 4, 96), circle = new T.Mesh(circleGeometry, gold);
        circle.rotation.x = -Math.PI / 2;
        circle.position.y = .495;
        this.geometry.add(circleGeometry);
        this.root.add(circle);
        for (const [x, color] of [[-15, '#ffe5bb'], [17, '#b3d3ee']] as const) {
            const light = new T.SpotLight(color, 190, 60, Math.PI / 3, .7, 2);
            light.position.set(x, 19, 6);
            light.target.position.set(0, 1, 0);
            light.castShadow = true;
            light.shadow.mapSize.set(1024, 1024);
            light.shadow.normalBias = .035;
            this.root.add(light, light.target);
            this.lights.push(light);
        }
        const fill = new T.PointLight('#bedcea', 30, 35, 2);
        fill.position.set(0, 7, -18);
        this.root.add(fill);
        this.lights.push(fill);
        const sign = this.sign('AIRRUN   /   FLIGHT OPERATIONS   /   BAY 01', 1536, 128, 42);
        sign.position.set(0, 18.8, -34.65);
        this.root.add(sign);
        const rear = this.sign('AIRRUN   •   ENGINEERING DIVISION', 1024, 128, 24);
        rear.position.set(0, 9, 33.91);
        rear.rotation.y = Math.PI;
        this.root.add(rear);
        const mark = this.sign('01   /   AIRFRAME INSPECTION', 1024, 128, 12);
        mark.rotation.x = -Math.PI / 2;
        mark.position.set(0, .501, 13);
        this.root.add(mark);
    }
    private airfieldIsland(grass: T.Material, soil: T.Material) {
        const outline = [[-48, 43], [81, 43], [85, -65], [60, -135], [38, -165], [8, -178], [-34, -163], [-49, -126], [-45, -48]];
        const shape = new T.Shape(outline.map(([x, z]) => new T.Vector2(x, -z)));
        const sideGeometry = new T.ExtrudeGeometry(shape, { depth: 3.8, bevelEnabled: false, steps: 1 }); sideGeometry.rotateX(-Math.PI / 2);
        // Keep the soil cap below the grass; a 5 mm gap caused stripes at flight-camera distances.
        const side = new T.Mesh(sideGeometry, soil); side.position.y = -3.64; side.receiveShadow = true; this.geometry.add(sideGeometry); this.root.add(side);
        const topGeometry = new T.ShapeGeometry(shape); topGeometry.rotateX(-Math.PI / 2);
        const top = new T.Mesh(topGeometry, grass); top.position.y = .265; top.receiveShadow = true; this.geometry.add(topGeometry); this.root.add(top);
    }
    private floorFinish(material: T.MeshStandardMaterial) {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
        const context = canvas.getContext('2d'); if (!context) return;
        const data = context.createImageData(256, 256); let seed = 1729;
        for (let i = 0; i < data.data.length; i += 4) {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            const shade = 198 + (seed >>> 27);
            data.data[i] = data.data[i + 1] = data.data[i + 2] = shade; data.data[i + 3] = 255;
        }
        context.putImageData(data, 0, 0);
        const texture = new T.CanvasTexture(canvas); texture.wrapS = texture.wrapT = T.RepeatWrapping;
        texture.repeat.set(16, 14); texture.colorSpace = T.SRGBColorSpace;
        material.map = texture; this.textures.add(texture);
    }
    private sign(text: string, width: number, height: number, worldWidth: number, stencil = false) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        if (!stencil) {
            ctx.fillStyle = '#1c2a33';
            ctx.fillRect(0, 0, width, height);
            ctx.strokeStyle = '#5a727d';
            ctx.lineWidth = 3;
            ctx.strokeRect(8, 8, width - 16, height - 16);
        }
        ctx.font = stencil ? 'bold 145px monospace' : '600 ' + height * .31 + 'px Arial';
        ctx.fillStyle = stencil ? '#c4c7b6' : '#ded4b4';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, width / 2, height / 2);
        const map = new T.CanvasTexture(canvas);
        map.colorSpace = T.SRGBColorSpace;
        this.textures.add(map);
        const geometry = new T.PlaneGeometry(worldWidth, worldWidth * height / width), material = new T.MeshBasicMaterial({ map, toneMapped: false, transparent: stencil, depthWrite: !stencil, opacity: stencil ? .80 : 1 });
        this.geometry.add(geometry);
        this.materials.add(material);
        return new T.Mesh(geometry, material);
    }
    async init() {
        const placements: [
            string,
            number,
            number,
            number,
            number,
            number
        ][] = [
            ['airport_control_tower', -34, .22, -59, .8, .5], ['airport_windsock_gimbal', -32, .26, -110, 1, 0], ['cargo_warehouse', 57, .22, 22, 1.3, 0], ['service_stair_module', 27, .37, 10, .8, 0], ['radar_station', 85, .22, -110, 1.1, 0], ['cargo_container', -32, .37, 24, .8, 0]
        ];
        await Promise.allSettled(placements.map(async ([id, x, y, z, scale, yaw]) => {
            const instance = await this.library.instance(id, 2);
            if (this.disposed) {
                instance.dispose();
                return;
            }
            instance.root.position.set(x, y - instance.meta.bounds.min[1] * scale, z);
            instance.root.scale.setScalar(scale);
            instance.root.rotation.y = yaw;
            this.root.add(instance.root);
            this.instances.push(instance);
        }));
    }
    openBay(reducedMotion: boolean) {
        this.doorTime = reducedMotion ? HANGAR_ENTRY_SECONDS : 0;
        this.positionDoors();
    }
    private positionDoors() {
        this.doorLeaves.forEach((panel, index) => {
            const leaf = index % 3, side = index < 3 ? -1 : 1;
            const phase = T.MathUtils.smootherstep(this.doorTime, .24 + leaf * .09, 2.45 + leaf * .10);
            panel.position.x = side * T.MathUtils.lerp(6.66 + leaf * 13.32, 39.6 + leaf * .85, phase);
        });
        const clear = this.doorTime >= 2.1;
        this.thresholdSignal.color.setHex(clear ? 0x9ff0cf : 0xffba70);
        this.thresholdSignal.emissive.setHex(clear ? 0x50d6a4 : 0xf58b39);
        this.thresholdSignal.emissiveIntensity = clear ? 2.2 : 1.7 + .6 * Math.cos(this.doorTime * 9);
        const reveal = T.MathUtils.smootherstep(this.doorTime, .42, 2.75);
        for (const light of this.lights)
            light.intensity = light instanceof T.SpotLight ? 85 + 105 * reveal : 11 + 19 * reveal;
    }
    update(dt: number) {
        if (this.doorTime < HANGAR_ENTRY_SECONDS) {
            this.doorTime = Math.min(HANGAR_ENTRY_SECONDS, this.doorTime + dt);
            this.positionDoors();
        }
        for (const instance of this.instances) instance.mixer.update(dt);
    }
    dispose() {
        this.disposed = true;
        this.root.traverse(n => { if (n instanceof T.InstancedMesh)
            n.dispose(); });
        for (const instance of this.instances)
            instance.dispose();
        for (const geometry of this.geometry)
            geometry.dispose();
        for (const material of this.materials)
            material.dispose();
        for (const texture of this.textures)
            texture.dispose();
        for (const light of this.lights)
            if (light instanceof T.SpotLight)
                light.shadow.dispose();
        this.root.removeFromParent();
    }
}
