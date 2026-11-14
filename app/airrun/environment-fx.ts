import * as T from 'three';
import { hash } from './data';
import type { FlightSimulation } from './simulation';
import type { AssetMeta, Placement } from './types';
/** Source sockets transformed by the exact placement pose, including local scale, yaw and travel. */
export function effectSocket(p: Placement, point: readonly number[], time: number, origin: number, out = new T.Vector3()) {
    const x = point[0] * p.sx, z = point[2] * p.sz, c = Math.cos(p.yaw), s = Math.sin(p.yaw);
    out.set(p.x + c * x + s * z, p.y + point[1] * p.sy, origin - p.z - s * x + c * z);
    if (p.move) out[p.move.axis] += Math.sin(time * p.move.frequency + p.move.phase) * p.move.amplitude * (p.move.axis === 'z' ? -1 : 1);
    return out;
}
/** Fixed particle pools for authored water, chimney exhaust, and volcanic atmosphere. */
export class EnvironmentFX {
    root = new T.Group();
    ash: T.Points<T.BufferGeometry, T.ShaderMaterial>;
    spray: T.Points<T.BufferGeometry, T.ShaderMaterial>;
    steam: T.Points<T.BufferGeometry, T.ShaderMaterial>;
    point = new T.Vector3();
    constructor(parent: T.Group, private catalog: Map<string, AssetMeta> = new Map()) {
        parent.add(this.root);
        const geometry = new T.BufferGeometry();
        const positions = new Float32Array(480 * 3), seeds = new Float32Array(480);
        for (let i = 0; i < 480; i++) {
            positions.set([(hash(i * 179) - .5) * 220, hash(i * 937) * 90, (hash(i * 673) - .5) * 230], i * 3);
            seeds[i] = hash(i * 419);
        }
        geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('aSeed', new T.Float32BufferAttribute(seeds, 1));
        const ashMaterial = new T.ShaderMaterial({
            transparent: true, depthWrite: false,
            uniforms: { uTime: { value: 0 }, uHeight: { value: 24 }, uTravel: { value: 0 }, uNight: { value: 0 }, uWind: { value: 0 } },
            vertexShader: `attribute float aSeed;uniform float uTime,uHeight,uTravel,uWind;varying float vSeed,vDepth;
                void main(){vec3 p=position;p.y=mod(p.y-uTime*(1.4+aSeed*2.),90.)+uHeight-18.;
                p.x+=sin(uTime*.16+aSeed*9.)*8.+uWind*8.;p.z=mod(p.z+uTravel+230.,230.)-150.;
                vec4 mv=modelViewMatrix*vec4(p,1.);vSeed=aSeed;vDepth=-mv.z;gl_Position=projectionMatrix*mv;
                gl_PointSize=clamp((1.+aSeed*2.)*180./max(1.,-mv.z),1.,7.);}`,
            fragmentShader: `uniform float uNight;varying float vSeed,vDepth;void main(){
                float shape=1.-smoothstep(.12,.5,length(gl_PointCoord-.5));
                vec3 gray=mix(vec3(.56,.58,.59),vec3(.32,.37,.41),uNight);
                vec3 color=mix(gray,vec3(1.,.37,.07),step(.975,vSeed));
                gl_FragColor=vec4(color,shape*.30*smoothstep(3.,18.,vDepth)*(1.-smoothstep(100.,190.,vDepth)));}`
        });
        this.ash = new T.Points(geometry, ashMaterial);
        this.ash.frustumCulled = false;
        this.root.add(this.ash);
        const sprayGeometry = new T.BufferGeometry();
        sprayGeometry.setAttribute('position', new T.Float32BufferAttribute(new Float32Array(384 * 3), 3));
        sprayGeometry.setAttribute('aLife', new T.Float32BufferAttribute(new Float32Array(384), 1));
        sprayGeometry.setAttribute('aSize', new T.Float32BufferAttribute(new Float32Array(384), 1));
        this.spray = new T.Points(sprayGeometry, new T.ShaderMaterial({
            transparent: true, depthWrite: false,
            uniforms: { uNight: { value: 0 } },
            vertexShader: `attribute float aLife,aSize;varying float vLife,vDepth;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);
                vLife=aLife;vDepth=-mv.z;gl_Position=projectionMatrix*mv;gl_PointSize=clamp(aSize*420./max(1.,-mv.z),1.,52.);}`,
            fragmentShader: `uniform float uNight;varying float vLife,vDepth;void main(){float a=1.-smoothstep(.03,.5,length(gl_PointCoord-.5));
                gl_FragColor=vec4(mix(vec3(.74,.91,.96),vec3(.28,.48,.66),uNight),a*vLife*.38*smoothstep(2.,12.,vDepth)*(1.-smoothstep(340.,520.,vDepth)));}`
        }));
        this.spray.frustumCulled = false;
        this.root.add(this.spray);
        const steamGeometry = new T.BufferGeometry();
        steamGeometry.setAttribute('position', new T.Float32BufferAttribute(new Float32Array(192 * 3), 3));
        steamGeometry.setAttribute('aLife', new T.Float32BufferAttribute(new Float32Array(192), 1));
        this.steam = new T.Points(steamGeometry, new T.ShaderMaterial({
            transparent: true, depthWrite: false, uniforms: { uNight: { value: 0 } },
            vertexShader: `attribute float aLife;varying float vLife,vDepth;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);
                vLife=aLife;vDepth=-mv.z;gl_Position=projectionMatrix*mv;gl_PointSize=clamp((.6+aLife*2.3)*450./max(1.,-mv.z),1.,65.);}`,
            fragmentShader: `uniform float uNight;varying float vLife,vDepth;void main(){float a=1.-smoothstep(.02,.5,length(gl_PointCoord-.5));
                vec3 color=mix(vec3(.48,.52,.53),vec3(.13,.19,.24),uNight);
                gl_FragColor=vec4(color,a*sin(vLife*3.14159)*.27*smoothstep(2.,12.,vDepth)*(1.-smoothstep(300.,470.,vDepth)));}`
        }));
        this.steam.frustumCulled = false;
        this.root.add(this.steam);
        this.spray.geometry.setDrawRange(0, 0);
        this.steam.geometry.setDrawRange(0, 0);
    }
    update(sim: FlightSimulation, placements: Placement[], motionTime = sim.motionTime, renderDistance = sim.z) {
        this.ash.visible = sim.theme === 'volcano';
        this.ash.position.x = sim.x;
        const u = this.ash.material.uniforms;
        u.uTime.value = motionTime;
        u.uHeight.value = sim.y;
        u.uTravel.value = renderDistance * .8 % 230;
        u.uNight.value = sim.weather.night;
        u.uWind.value = Math.sin(motionTime * .8 + sim.config.seed) * sim.weather.wind;
        const attr = this.spray.geometry.getAttribute('position'), lifeAttr = this.spray.geometry.getAttribute('aLife'), sizes = this.spray.geometry.getAttribute('aSize');
        const smokePos = this.steam.geometry.getAttribute('position'), smokeLife = this.steam.geometry.getAttribute('aLife');
        let n = 0, smokeN = 0;
        // A bounded source pool. No particles, geometries or materials are allocated per frame.
        for (const p of placements) {
            if (p.z < sim.z - 45 || p.z > sim.z + 480 || Math.abs(p.x - sim.x) > 130) continue;
            const sockets = this.catalog.get(p.model)?.sockets;
            if (!sockets) continue;
            for (const [name, socket] of Object.entries(sockets)) {
                const fountain = name === 'fountain_emitter', stream = name === 'flow_top' || name === 'spillway_flow', mist = name.startsWith('spray_') || name === 'cold_mist';
                const exhaust = name === 'chimney_smoke' || name === 'exhaust';
                if (!fountain && !stream && !mist && !exhaust) continue;
                effectSocket(p, socket, motionTime, sim.z, this.point);
                const salt = Math.floor(p.z) + name.length * 271, scale = Math.max(.3, Math.min(1.8, (p.sx + p.sy + p.sz) / 3));
                if (exhaust) {
                    for (let i = 0; i < 24 && smokeN < 192; i++) {
                        const life = (motionTime * .16 + hash(i * 739 + salt)) % 1, angle = hash(i * 433 + salt) * Math.PI * 2;
                        smokePos.setXYZ(smokeN, this.point.x + Math.cos(angle) * life * 1.8 * scale + life * life * (2 + sim.weather.wind * 6), this.point.y + life * 9 * scale, this.point.z + Math.sin(angle) * life * 1.5 * scale);
                        smokeLife.setX(smokeN++, life);
                    }
                    continue;
                }
                for (let i = 0; i < 48 && n < 384; i++) {
                    const seed = hash(i * 739 + salt), life = (motionTime * (fountain ? .7 : stream ? .35 : .24) + seed) % 1;
                    const angle = hash(i * 173 + salt) * Math.PI * 2;
                    let dx = 0, dy = 0, dz = 0;
                    if (fountain) {
                        // Ballistic jets return into the basin rather than rising as an unbounded cloud.
                        dx = Math.cos(angle) * life * 2.8 * scale; dz = Math.sin(angle) * life * 2.8 * scale;
                        dy = (4.5 * life - 7 * life * life) * scale;
                    } else if (stream) {
                        const height = Math.max(2, socket[1] - .6) * p.sy;
                        dx = (seed - .5) * 2.4 * scale; dz = Math.sin(angle) * .22 * scale;
                        dy = -life * life * height;
                    } else {
                        const spread = (1 + life * 5) * scale;
                        dx = Math.cos(angle) * spread; dz = Math.sin(angle) * spread;
                        dy = life * (p.model === 'icy_cave_gate' ? 1.4 : 3) * scale;
                    }
                    attr.setXYZ(n, this.point.x + dx, this.point.y + dy, this.point.z + dz);
                    lifeAttr.setX(n, mist ? Math.sin(life * Math.PI) * .38 : .55 + .45 * (1 - life));
                    sizes.setX(n++, mist ? (1.3 + life * 2.8) * scale : (stream ? .2 : .14) * scale);
                }
            }
        }
        this.spray.visible = n > 0;
        this.spray.material.uniforms.uNight.value = sim.weather.night;
        this.spray.geometry.setDrawRange(0, n);
        attr.needsUpdate = true;
        lifeAttr.needsUpdate = sizes.needsUpdate = true;
        this.steam.visible = smokeN > 0;
        this.steam.material.uniforms.uNight.value = sim.weather.night;
        this.steam.geometry.setDrawRange(0, smokeN);
        smokePos.needsUpdate = smokeLife.needsUpdate = true;
    }
    dispose() {
        for (const points of [this.ash, this.spray, this.steam]) { points.geometry.dispose(); points.material.dispose(); }
        this.root.removeFromParent();
    }
}
