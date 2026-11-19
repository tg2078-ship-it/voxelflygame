import * as T from 'three';
import { GRAPHICS } from './graphics';
import { hash, clamp } from './data';
import type { FlightSimulation } from './simulation';
import type { AssetMeta, ItemKind, Vec, Settings } from './types';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EnvironmentFX } from './environment-fx';
import { makeRecordLine } from './record-line';
import { FormationVisual } from './formation-visual';
import { FlightWake } from './flight-wake';
import { ParticleTrace } from './particle-trace';
import type { Placement } from './types';

/** Exact ballistic integration with linear drag. A stalled presentation frame
 * must not throw debris farther than the same flight shown at 144 Hz. */
export function advanceDebris(position: T.Vector3, velocity: T.Vector3, dt: number) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const drag = .18, decay = Math.exp(-drag * dt), travel = -Math.expm1(-drag * dt) / drag;
    position.addScaledVector(velocity, travel);
    position.y -= 9 / drag * (dt - travel);
    velocity.multiplyScalar(decay);
    velocity.y -= 9 * travel;
}
export class FlightFX {
    root = new T.Group();
    items = new Map<ItemKind, T.InstancedMesh>();
    parts: T.InstancedMesh;
    rain: T.Points;
    rainGeometry = new T.BufferGeometry();
    rainMaterial: T.ShaderMaterial;
    trails: T.Mesh[] = [];
    wake = new FlightWake();
    private readonly ringWhite = new T.Color(0xffffff);
    private readonly ringPassed = new T.Color('#9ee7c2');
    private recordLine = makeRecordLine();
    private formation = new FormationVisual();
    trailHistory: {
        left: T.Vector3;
        right: T.Vector3;
        z: number;
        time: number;
    }[] = [];
    private particleCamera = new T.Vector3();
    particles: {
        p: T.Vector3;
        v: T.Vector3;
        life: number;
        color: T.Color;
        scale: number;
        absoluteZ: number;
    }[] = [];
    pulse: T.Mesh;
    flash: T.PointLight;
    shield: T.Mesh;
    shieldWire: T.Mesh;
    exhaust: T.Mesh;
    exhaustMaterial: T.ShaderMaterial;
    smoke: T.Points;
    smokeTrace = new ParticleTrace(.07, 3.5, 128);
    get smokeHistory() { return this.smokeTrace.samples; }
    vapour: T.Points;
    vapourTrace = new ParticleTrace(.035, 1.6, 256);
    get vapourHistory() { return this.vapourTrace.samples; }
    object = new T.Object3D();
    time = 0;
    disposed = false;
    private pulseOrigin: Vec | null = null;
    private pulseOpacity = .55;
    private tail = new T.Vector3();
    private wingLeft = new T.Vector3();
    private wingRight = new T.Vector3();
    private emitterOrigin = new T.Vector3();
    private exhaustRotation = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI / 2);
    environment: EnvironmentFX;
    constructor(scene: T.Scene, catalog?: Map<string, AssetMeta>) {
        scene.add(this.root);
        this.root.add(this.formation.root, this.recordLine);
        this.environment = new EnvironmentFX(this.root, catalog);
        const specs: [
            ItemKind,
            T.BufferGeometry,
            string,
            number
        ][] = [['coin', new T.CylinderGeometry(1, 1, .20, 12), '#ffd176', .45], ['crystal', new T.OctahedronGeometry(1.2), '#b3edff', .65], ['ring', new T.TorusGeometry(1, .065, 8, 48), '#ffcc63', 1.2], ['shield', new T.IcosahedronGeometry(1.5, 0), '#54e7dc', .8], ['multiplier', new T.OctahedronGeometry(1.7), '#ffd47a', .7], ['slow', new T.TorusGeometry(1.3, .32, 4, 12), '#95b7ff', .75], ['turbo', new T.ConeGeometry(1.1, 2.8, 4), '#ff9856', .75], ['repair', new T.BoxGeometry(1.6, 1.6, 1.6), '#8fe7ac', .75]];
        for (const [kind, geometry, color, glow] of specs) {
            let shape = geometry;
            if (kind === 'repair') {
                geometry.dispose();
                const bars = [new T.BoxGeometry(2.4, .8, .8), new T.BoxGeometry(.8, 2.4, .8)];
                shape = mergeGeometries(bars)!;
                for (const b of bars)
                    b.dispose();
            }
            if (kind === 'ring') {
                const pos = shape.getAttribute('position');
                const colors: number[] = [];
                const gold = new T.Color('#ffbf48'), ivory = new T.Color('#fff4c5'), edge = new T.Color('#82502c');
                for (let i = 0; i < pos.count; i++) {
                    const angle = Math.atan2(pos.getY(i), pos.getX(i));
                    const band = Math.cos(4 * angle);
                    const tint = band > .88 ? ivory : band > .72 ? edge : gold;
                    colors.push(tint.r, tint.g, tint.b);
                }
                shape.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
            }
            const material = kind === 'ring' ? new T.MeshBasicMaterial({ vertexColors: true, toneMapped: false }) : new T.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: glow, roughness: kind === 'coin' ? .22 : .38, metalness: kind === 'coin' ? .82 : .3 });
            const mesh = new T.InstancedMesh(shape, material, 220);
            mesh.frustumCulled = false;
            this.items.set(kind, mesh);
            this.root.add(mesh);
        }
        this.parts = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), new T.MeshStandardMaterial({ color: '#b9cbd0', roughness: .5, metalness: .5 }), 200);
        this.parts.count = 0;
        this.parts.frustumCulled = false;
        this.root.add(this.parts);
        const rainPositions = new Float32Array(2400 * 3), sizes = new Float32Array(2400);
        for (let i = 0; i < 2400; i++) {
            rainPositions[i * 3] = (hash(i * 79) - .5) * 170;
            rainPositions[i * 3 + 1] = hash(i * 271) * 130;
            rainPositions[i * 3 + 2] = (hash(i * 193) - .5) * 180;
            sizes[i] = 1 + hash(i * 63) * 1.4;
        }
        this.rainGeometry.setAttribute('position', new T.Float32BufferAttribute(rainPositions, 3));
        this.rainGeometry.setAttribute('aSize', new T.Float32BufferAttribute(sizes, 1));
        this.rainMaterial = new T.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uTime: { value: 0 }, uAmount: { value: 0 }, uSnow: { value: 0 }, uTravel: { value: 0 }, uWind: { value: 0 }, uHeight: { value: 24 } }, vertexShader: `uniform float uTime,uSnow,uTravel,uWind,uHeight;attribute float aSize;varying float vAlpha;void main(){vec3 p=position;p.y=mod(p.y-uTime*mix(58.,5.,uSnow),130.)-25.+uHeight;p.x+=sin(uTime*.4+p.z)*uSnow*3.+(1.-mod(p.y-uHeight+25.,130.)/130.)*uWind*18.;p.z=mod(p.z+uTravel+180.,180.)-120.;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(aSize*mix(190.,260.,uSnow)/max(1.,-mv.z),2.,15.);vAlpha=clamp(-mv.z/10.,0.,1.);}`, fragmentShader: `uniform float uAmount,uSnow;varying float vAlpha;void main(){vec2 p=gl_PointCoord-.5;float shape=mix((1.-smoothstep(0.,.3,abs(p.x)))*(1.-smoothstep(.25,.52,abs(p.y))),(1.-smoothstep(.18,.5,length(p))),uSnow);gl_FragColor=vec4(mix(vec3(.62,.78,.9),vec3(.95),uSnow),shape*uAmount*.55*vAlpha);}` });
        this.rain = new T.Points(this.rainGeometry, this.rainMaterial);
        this.rain.frustumCulled = false;
        this.root.add(this.rain);
        for (let side = 0; side < 2; side++) {
            const geometry = new T.BufferGeometry();
            geometry.setAttribute('position', new T.Float32BufferAttribute(new Float32Array(180 * 6), 3));
            geometry.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(180 * 4), 2));
            const indices: number[] = [];
            for (let i = 0; i < 179; i++)
                indices.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
            geometry.setIndex(indices);
            const material = new T.ShaderMaterial({ transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending, uniforms: { uStrength: { value: 0 } }, vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`, fragmentShader: `varying vec2 vUv;uniform float uStrength;void main(){float a=(1.-vUv.x)*(1.-smoothstep(.06,.5,abs(vUv.y-.5)));gl_FragColor=vec4(vec3(.09,.5,1.)*(1.3+a),a*uStrength);}` });
            const mesh = new T.Mesh(geometry, material);
            mesh.frustumCulled = false;
            this.trails.push(mesh);
            this.root.add(mesh);
        }
        this.pulse = new T.Mesh(new T.TorusGeometry(1, .10, 4, 36), new T.MeshBasicMaterial({ color: '#79d6ff', transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }));
        this.root.add(this.pulse);
        this.flash = new T.PointLight('#66c9ff', 0, 45, 2);
        this.root.add(this.flash);
        this.shield = new T.Mesh(new T.IcosahedronGeometry(1, 2), new T.MeshPhysicalMaterial({ color: '#79d8ed', emissive: '#218cbb', emissiveIntensity: .8, roughness: .12, metalness: .3, transparent: true, opacity: .12, depthWrite: false, side: T.DoubleSide }));
        this.shieldWire = new T.Mesh(new T.IcosahedronGeometry(1.005, 1), new T.MeshBasicMaterial({ color: '#6bdeef', wireframe: true, transparent: true, opacity: .24, blending: T.AdditiveBlending, depthWrite: false }));
        this.root.add(this.shield, this.shieldWire);
        this.exhaustMaterial = new T.ShaderMaterial({ transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide,
            uniforms: { uTime: { value: 0 }, uBlue: { value: 1 }, uHeat: { value: 0 }, uReduced: { value: 0 } },
            vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
            fragmentShader: `varying vec2 vUv;uniform float uTime,uBlue,uHeat,uReduced;
                void main(){float clock=uTime*(1.-uReduced);float axial=vUv.y;
                float taper=1.-smoothstep(.48,1.,axial);
                float bands=pow(.5+.5*cos(axial*34.-clock*19.),5.);
                float flutter=.93+.07*sin(clock*47.+axial*21.);
                vec3 cold=mix(vec3(.75,1.,1.3),vec3(.055,.38,1.1),smoothstep(.08,.88,axial));
                vec3 hot=mix(vec3(1.5,.91,.38),vec3(1.1,.18,.015),axial);
                vec3 color=mix(hot,cold,uBlue)*(1.+bands*(.22+uHeat*.24));
                gl_FragColor=vec4(color,taper*(.44+bands*.16)*flutter);}` });
        this.exhaust = new T.Mesh(new T.ConeGeometry(.52, 5, 8, 1, true), this.exhaustMaterial);
        this.root.add(this.exhaust);
        const smokeGeometry = new T.BufferGeometry();
        smokeGeometry.setAttribute('position', new T.Float32BufferAttribute(new Float32Array(128 * 3), 3));
        smokeGeometry.setAttribute('aLife', new T.Float32BufferAttribute(new Float32Array(128), 1));
        this.smoke = new T.Points(smokeGeometry, new T.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: {}, vertexShader: `attribute float aLife;varying float vLife;void main(){vLife=aLife;vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp((1.-aLife)*900./max(1.,-p.z),5.,95.);}`, fragmentShader: `varying float vLife;void main(){vec2 p=gl_PointCoord-.5;float a=(1.-smoothstep(.10,.50,length(p)))*sin(vLife*3.14159)*.32;gl_FragColor=vec4(mix(vec3(.12,.17,.19),vec3(.35,.40,.43),vLife),a);}` }));
        this.smoke.frustumCulled = false;
        this.root.add(this.smoke);
        const vapourGeometry = new T.BufferGeometry();
        vapourGeometry.setAttribute('position', new T.Float32BufferAttribute(new Float32Array(256 * 3), 3));
        vapourGeometry.setAttribute('aLife', new T.Float32BufferAttribute(new Float32Array(256), 1));
        this.vapour = new T.Points(vapourGeometry, new T.ShaderMaterial({ transparent: true, depthWrite: false, blending: T.AdditiveBlending, vertexShader: `attribute float aLife;varying float vLife;void main(){vLife=aLife;vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp((1.-aLife)*460./max(1.,-p.z),3.,50.);}`, fragmentShader: `varying float vLife;void main(){float a=(1.-smoothstep(.04,.5,length(gl_PointCoord-.5)))*sin(vLife*3.14159)*.25;gl_FragColor=vec4(.20,.58,.95,a);}` }));
        this.vapour.frustumCulled = false;
        this.root.add(this.vapour);
    }
    event(kind: string, position: Vec | undefined, sim: FlightSimulation | null) {
        if (!sim)
            return;
        const p = position ?? { x: sim.x, y: sim.y, z: sim.z };
        const success = kind === 'operation-complete' || kind === 'precision' || kind === 'flow-bank' || kind === 'choice' || kind === 'sortie-complete';
        if (['crash', 'damage', 'repair', 'shield', 'risk', 'e-start', 'ring', 'crystal'].includes(kind) || success) {
            const reduced = sim.config.settings.reducedMotion;
            const count = Math.ceil((kind === 'crash' ? 110 : kind === 'e-start' ? 64 : kind === 'flow-bank' ? 32 : kind === 'damage' ? 30 : kind === 'operation-complete' ? 24 : 16) * (reduced ? .35 : 1));
            const color = new T.Color(kind === 'crash' ? '#ffaf65' : kind === 'repair' ? '#8fedb5' : kind === 'operation-complete' ? '#9ee5be' : kind === 'flow-bank' ? '#83ddf1' : kind === 'ring' || kind === 'precision' ? '#ffd278' : '#88d9ff');
            for (let i = 0; i < count; i++) {
                const r = hash(i * 819 + Math.floor(sim.z));
                this.particles.push({ p: new T.Vector3(p.x, p.y, p.z), v: new T.Vector3((r - .5) * 25, (hash(i * 113) - .3) * 24, (hash(i * 371) - .5) * 25), life: kind === 'crash' ? 2.5 : 1.1, color: color.clone().multiplyScalar(.7 + hash(i * 39) * .5), scale: kind === 'crash' ? .3 + hash(i * 66) * .7 : .14 + hash(i * 33) * .18, absoluteZ: p.z });
            }
            this.particles = this.particles.slice(-200);
        }
        if (kind === 'e-start' || kind === 'ring' || kind === 'operation-complete' || kind === 'flow-bank') {
            this.pulseOrigin = { ...p };
            this.pulseOpacity = kind === 'flow-bank' ? .36 : .55;
            (this.pulse.material as T.MeshBasicMaterial).color.set(kind === 'operation-complete' ? '#9ee5be' : kind === 'ring' ? '#ffd278' : '#79d6ff');
            this.pulse.userData.born = this.time;
        }
    }
    update(sim: FlightSimulation, dt: number, plane: T.Object3D, placements: Placement[] = [], quality: Settings['quality'] = 'high', renderPose?: Vec, motionTime = sim.motionTime, camera?: T.Camera) {
        const emitter = renderPose ?? { x: sim.x, y: sim.y, z: sim.z };
        const localZ = sim.z - emitter.z;
        this.time += dt;
        const line = sim.recordLine;
        this.recordLine.visible = line !== undefined && line > emitter.z - 35 && line < emitter.z + Math.max(320, sim.speed * 10);
        if (this.recordLine.visible) this.recordLine.position.z = sim.z - line!;
        this.formation.update(sim.formation, emitter.z, sim.z, sim.speed, dt, sim.config.settings.reducedMotion);
        this.rainGeometry.setDrawRange(0, GRAPHICS[quality].rainDrops);
        this.environment.update(sim, placements, motionTime, emitter.z);
        const object = this.object;
        for (const [kind, mesh] of this.items) {
            let n = 0;
            for (const p of sim.pickups) {
                if (p.kind !== kind || (p.collected && kind !== 'ring') || p.z > sim.z + 1000 || p.z < sim.z - (kind === 'ring' ? 65 : 10) || n >= mesh.instanceMatrix.count)
                    continue;

                object.position.set(p.x, p.y, sim.z - p.z);
                object.rotation.set(kind === 'coin' ? Math.PI / 2 : 0, kind === 'ring' ? 0 : sim.time * 1.6 + p.id, kind === 'ring' ? sim.time * .12 : 0);
                const size = kind === 'ring' ? p.radius : 1;
                object.scale.setScalar(size);
                if (kind === 'turbo')
                    object.rotation.z = -Math.PI / 2;
                object.updateMatrix();
                if (kind === 'ring') mesh.setColorAt(n, p.collected ? this.ringPassed : this.ringWhite);
                mesh.setMatrixAt(n++, object.matrix);
            }
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
            mesh.count = n;
            mesh.visible = n > 0;
            mesh.instanceMatrix.needsUpdate = true;
        }
        const rain = this.rainMaterial.uniforms;
        rain.uTime.value = motionTime;
        rain.uAmount.value = sim.weather.snow ? Math.max(.3, sim.weather.rain) : sim.weather.rain;
        rain.uSnow.value = +sim.weather.snow;
        // Integrate actual distance, never time × instantaneous speed. Boost and
        // brake changes therefore cannot teleport the entire precipitation field.
        rain.uTravel.value = emitter.z * .7 % 180;
        rain.uWind.value = Math.sin(motionTime * .8 + sim.config.seed) * sim.weather.wind;
        rain.uHeight.value = emitter.y;
        this.rain.visible = rain.uAmount.value > .001;
        this.rain.position.x = emitter.x;
        const shield = sim.effects.has('shield');
        this.shield.visible = this.shieldWire.visible = shield;
        this.shield.position.set(emitter.x, emitter.y, localZ);
        this.shieldWire.position.copy(this.shield.position);
        const shieldRadius = sim.plane.span * .55;
        this.shield.scale.set(shieldRadius, shieldRadius * .40, shieldRadius * .78);
        this.shieldWire.scale.copy(this.shield.scale);
        this.shield.quaternion.copy(plane.quaternion);
        this.shieldWire.quaternion.copy(plane.quaternion);
        (this.shieldWire.material as T.MeshBasicMaterial).opacity = .2 + Math.sin(sim.time * 4) * .06;
        this.exhaust.visible = sim.boost > .08 || sim.eRemaining > 0 || !!sim.plane.jet && sim.speed > 65;
        const tail = this.tail.set(0, .15, sim.plane.length * .50 + 1.5).applyQuaternion(plane.quaternion);
        this.exhaust.position.set(emitter.x + tail.x, emitter.y + tail.y, localZ + tail.z);
        this.exhaust.quaternion.copy(plane.quaternion).multiply(this.exhaustRotation);
        const reduced = sim.config.settings.reducedMotion;
        this.exhaust.scale.setScalar(sim.eRemaining > 0 ? 1.1 + (reduced ? 0 : Math.sin(sim.time * 43) * .08) : .55 + sim.boost * .42);
        this.exhaustMaterial.uniforms.uTime.value = motionTime;
        this.exhaustMaterial.uniforms.uBlue.value = +(sim.eRemaining > 0 || sim.boost > .08);
        this.exhaustMaterial.uniforms.uHeat.value = sim.boostHeat;
        this.exhaustMaterial.uniforms.uReduced.value = +reduced;
        const damaged = sim.hp / sim.maxHp < .65 || sim.failed;
        this.smokeTrace.update({ x: emitter.x, y: emitter.y, z: emitter.z - 3 }, this.time, damaged);
        const smokePos = this.smoke.geometry.getAttribute('position'), smokeLife = this.smoke.geometry.getAttribute('aLife');
        let smokeN = 0;
        for (const p of this.smokeHistory) {
            const age = this.time - p.born;
            smokePos.setXYZ(smokeN, p.x + age * Math.sin(p.z) * .65, p.y + age * 1.6, sim.z - p.z);
            smokeLife.setX(smokeN++, p.life);
        }
        smokePos.needsUpdate = true;
        smokeLife.needsUpdate = true;
        this.smoke.geometry.setDrawRange(0, smokeN);
        this.smoke.visible = smokeN > 0;
        this.vapourTrace.update({ x: emitter.x + tail.x, y: emitter.y + tail.y, z: emitter.z - tail.z }, this.time, sim.boost > .1 || sim.eRemaining > 0);
        const vapourPosition = this.vapour.geometry.getAttribute('position'), vapourLife = this.vapour.geometry.getAttribute('aLife');
        let vapourCount = 0;
        for (const p of this.vapourHistory) {
            vapourPosition.setXYZ(vapourCount, p.x, p.y + (this.time - p.born) * .7, sim.z - p.z);
            vapourLife.setX(vapourCount++, p.life);
        }
        vapourPosition.needsUpdate = vapourLife.needsUpdate = true;
        this.vapour.geometry.setDrawRange(0, vapourCount);
        this.vapour.visible = vapourCount > 0;
        const q = plane.quaternion;
        const origin = this.emitterOrigin.set(emitter.x, emitter.y, 0);
        const left = this.wingLeft.set(-sim.plane.span * .46, .8, 1.4).applyQuaternion(q).add(origin), right = this.wingRight.set(sim.plane.span * .46, .8, 1.4).applyQuaternion(q).add(origin);
        this.trailHistory = this.wake.update(left, right, emitter.z, this.time, sim.boost > .12 || sim.eRemaining > 0);
        for (let side = 0; side < 2; side++) {
            const mesh = this.trails[side], pos = mesh.geometry.getAttribute('position'), uv = mesh.geometry.getAttribute('uv'), count = this.trailHistory.length;
            for (let i = 0; i < count; i++) {
                const h = this.trailHistory[i], p = side === 0 ? h.left : h.right, age = clamp((this.time - h.time) / 3, 0, 1), width = .36 * (1 - age);
                pos.setXYZ(i * 2, p.x - width, p.y, sim.z - h.z + p.z);
                pos.setXYZ(i * 2 + 1, p.x + width, p.y, sim.z - h.z + p.z);
                uv.setXY(i * 2, age, 0);
                uv.setXY(i * 2 + 1, age, 1);
            }
            pos.needsUpdate = true;
            uv.needsUpdate = true;
            mesh.geometry.setDrawRange(0, Math.max(0, count - 1) * 6);
            mesh.visible = count > 1;
            (mesh.material as T.ShaderMaterial).uniforms.uStrength.value = sim.eRemaining > 0 ? 1.1 : .25 + sim.boost * .4;
        }
        let n = 0;
        for (const p of this.particles) {
            p.life -= dt;
            advanceDebris(p.p, p.v, dt);
            if (p.life <= 0)
                continue;
            object.position.set(p.p.x, p.p.y, sim.z - p.p.z);
            object.rotation.set(p.life * 3, p.life * 5, p.life * 2);
            const cameraDistance = camera ? this.particleCamera.copy(object.position).add(this.root.position).distanceTo(camera.position) : Infinity;
            // Success confetti must not fly through the chase camera and turn
            // into screen-sized opaque cubes. Keep debris in world space but
            // cap its apparent size as it approaches the lens.
            if (cameraDistance < 3) continue;
            object.scale.setScalar(p.scale * Math.min(1, p.life * 2) * Math.min(1, cameraDistance / 14));
            object.updateMatrix();
            this.parts.setMatrixAt(n, object.matrix);
            this.parts.setColorAt(n++, p.color);
            this.particles[n - 1] = p;
        }
        this.particles.length = n;
        this.parts.count = n;
        this.parts.visible = n > 0;
        this.parts.instanceMatrix.needsUpdate = true;
        if (this.parts.instanceColor)
            this.parts.instanceColor.needsUpdate = true;
        const age = this.time - (this.pulse.userData.born ?? -100), a = clamp(age / 1.2, 0, 1);
        if (this.pulseOrigin) this.pulse.position.set(this.pulseOrigin.x, this.pulseOrigin.y, sim.z - this.pulseOrigin.z);
        this.pulse.scale.setScalar(2 + a * (reduced ? 10 : 25));
        this.pulse.visible = a < 1 && this.pulseOrigin !== null;
        (this.pulse.material as T.MeshBasicMaterial).opacity = (1 - a) * (reduced ? Math.min(.16, this.pulseOpacity * .35) : this.pulseOpacity);
        this.flash.position.set(emitter.x, emitter.y, localZ + 2);
        this.flash.intensity = sim.eRemaining > 0 ? reduced ? 14 : 80 : 0;
    }
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.root.traverse(n => {
            if (n instanceof T.InstancedMesh)
                n.dispose();
            if (n instanceof T.Mesh || n instanceof T.Points) {
                n.geometry.dispose();
                const mats = Array.isArray(n.material) ? n.material : [n.material];
                for (const m of mats)
                    m.dispose();
            }
        });
        this.root.removeFromParent();
    }
}
