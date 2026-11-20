import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { FormationFlight } from './formation';

const segments = 12;
const skins = { trail: '#70fff4', weave: '#f3bcff', swell: '#ffdc82' };

function courierGeometry() {
    const parts: T.BufferGeometry[] = [];
    function block(w: number, h: number, l: number, x: number, y: number, z: number, paint: string, sweep = 0) {
        const box = new T.BoxGeometry(w, h, l).rotateY(sweep).translate(x, y, z);
        const color = new T.Color(paint);
        const colors = new Float32Array(box.attributes.position.count * 3);
        for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i);
        box.setAttribute('color', new T.BufferAttribute(colors, 3));
        parts.push(box);
    }
    block(1.2, .8, 5.6, 0, 0, 0, '#c9f5ed');
    block(.9, .45, 1.6, 0, .52, -.95, '#25445c');
    for (const side of [-1, 1]) {
        block(3.2, .25, 1.35, side * 1.9, -.06, .18, '#d9fcf2', -side * .23);
        block(.55, .36, 1.6, side * 3.45, -.06, .58, '#31e1d1');
        block(1.35, .19, .82, side * .9, .27, 2.05, '#71b7c4');
        block(.18, .86, .95, side * .67, .57, 1.85, '#416d88');
    }
    block(.82, .48, .17, 0, -.02, 2.81, '#94fff9');
    const geometry = mergeGeometries(parts)!;
    parts.forEach(part => part.dispose());
    return geometry;
}

/** Two draw calls for the aircraft and the twin ribbons. The same spatial
 * sampler drives the flight test and the visible trail at every speed. */
export class FormationVisual {
    root = new T.Group();
    private aircraft = new T.Mesh(courierGeometry(), new T.MeshBasicMaterial({ vertexColors: true, transparent: true }));
    private ribbons: T.Mesh<T.BufferGeometry, T.MeshBasicMaterial>;
    private positions = new T.BufferAttribute(new Float32Array((segments + 1) * 4 * 3), 3).setUsage(T.DynamicDrawUsage);
    private departure = new T.Vector3();
    private departingTime = 2.8;
    private side = 1;
    private tracking = false;
    private centre = { x: 0, y: 0, z: 0 };
    private nose = { x: 0, y: 0, z: 0 };
    constructor() {
        const mesh = new T.BufferGeometry();
        const indices: number[] = [];
        for (let i = 0; i < segments; i++) {
            for (const wing of [0, 2]) {
                const a = i * 4 + wing;
                indices.push(a, a + 1, a + 4, a + 1, a + 5, a + 4);
            }
        }
        mesh.setIndex(indices);
        mesh.setAttribute('position', this.positions);
        this.ribbons = new T.Mesh(mesh, new T.MeshBasicMaterial({ transparent: true, opacity: .72,
            side: T.DoubleSide, depthWrite: false, toneMapped: false }));
        this.ribbons.frustumCulled = false;
        this.root.add(this.ribbons, this.aircraft);
        this.root.visible = false;
    }
    update(formation: FormationFlight | undefined, z: number, worldOrigin: number, speed: number, dt = 0, reducedMotion = false) {
        const arrival = formation?.approachIn;
        if (!formation || (!formation.active && arrival === undefined)) {
            if (this.tracking) {
                this.departure.copy(this.aircraft.position);
                this.departingTime = 0;
                this.tracking = false;
            }
            this.departingTime = Math.min(2.8, this.departingTime + dt);
            this.root.visible = this.departingTime < 2.8;
            this.ribbons.visible = false;
            if (this.root.visible) {
                const u = this.departingTime/2.8, arc = u*u;
                this.aircraft.position.copy(this.departure);
                this.aircraft.position.x += this.side * 92 * arc;
                this.aircraft.position.y += 36 * arc;
                this.aircraft.position.z -= (45*u + 180*arc);
                this.aircraft.rotation.z = reducedMotion ? 0 : -this.side*.56*Math.sin(Math.PI*u);
                this.aircraft.material.opacity = 1 - T.MathUtils.smoothstep(u,.55,1);
            }
            return;
        }
        this.tracking = true;
        this.root.visible = true;
        this.ribbons.visible = formation.active;
        this.aircraft.material.opacity = arrival === undefined ? 1 : 1 - T.MathUtils.smoothstep(arrival,2,3);
        this.aircraft.scale.setScalar(1);
        const lead = Math.min(54, Math.max(27, speed * .60));
        const tint = skins[formation.pattern];
        this.ribbons.material.color.set(tint);
        for (let i = 0; i <= segments; i++) {
            const fraction = i / segments;
            formation.sample(z - 4 + fraction * (lead + 4), this.centre);
            const width = .18 + fraction * .20;
            const spread = 3.4 + (1 - fraction) * 1.4;
            for (let v = 0; v < 4; v++) {
                const side = v < 2 ? -1 : 1;
                this.positions.setXYZ(i * 4 + v, this.centre.x + side * (spread + width * (v % 2)),
                    this.centre.y - .08 + (v % 2) * width, worldOrigin - this.centre.z);
            }
        }
        this.positions.needsUpdate = true;
        const head = this.centre;
        formation.sample(head.z + 3, this.nose);
        this.aircraft.position.set(head.x, head.y, worldOrigin - head.z);
        if (arrival !== undefined) {
            this.side = formation.joinSide;
            const u = arrival/3, arc = u*u;
            this.aircraft.position.x += this.side * 83 * arc;
            this.aircraft.position.y += 31 * arc;
            this.aircraft.position.z -= 165 * arc;
        }
        const yaw = Math.atan2(head.x - this.nose.x, 3);
        this.aircraft.rotation.set(Math.atan2(this.nose.y - head.y, 3), yaw, yaw * .7 + (arrival && !reducedMotion ? this.side*.45*Math.sin(Math.PI*arrival/3) : 0), 'YXZ');
    }
}
