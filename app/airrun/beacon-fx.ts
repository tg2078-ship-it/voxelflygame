import * as T from 'three';
import type { ModelInstance } from './assets';
import type { FlightSimulation } from './simulation';
import type { Placement } from './types';

/** Three pooled, shadow-free lighthouse optics, driven by their real animated carriage nodes. */
export class BeaconFX {
    root = new T.Group();
    geometry = new T.ConeGeometry(7.5, 90, 20, 1, true).translate(0, -45, 0).rotateZ(Math.PI / 2);
    material = new T.ShaderMaterial({
        transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
        uniforms: { uStrength: { value: 0 } },
        vertexShader: `varying vec2 vUv;varying float vDepth;void main(){vUv=uv;vec4 p=modelViewMatrix*vec4(position,1.);vDepth=-p.z;gl_Position=projectionMatrix*p;}`,
        fragmentShader: `uniform float uStrength;varying vec2 vUv;varying float vDepth;void main(){
            float a=pow(vUv.y,1.7)*smoothstep(0.,.18,1.-vUv.y)*uStrength;
            gl_FragColor=vec4(.91,.83,.64,a*smoothstep(1.,8.,vDepth));}`
    });
    beams: T.Mesh<T.BufferGeometry, T.ShaderMaterial>[] = [];
    lights: T.SpotLight[] = [];
    inverse = new T.Matrix4();
    matrix = new T.Matrix4();
    direction = new T.Vector3();
    scale = new T.Vector3();
    constructor(parent: T.Group) {
        parent.add(this.root);
        for (let i = 0; i < 3; i++) {
            const beam = new T.Mesh(this.geometry, this.material), light = new T.SpotLight('#ffe2ac', 0, 90, .083, .7, 2);
            beam.visible = false;
            light.castShadow = false;
            this.beams.push(beam); this.lights.push(light);
            this.root.add(beam, light, light.target);
        }
    }
    update(sim: FlightSimulation, placements: Placement[], actors: Map<string, ModelInstance>, key: (p: Placement) => string) {
        this.root.visible = sim.weather.night > .18;
        for (let i = 0; i < 3; i++) { this.beams[i].visible = false; this.lights[i].intensity = 0; }
        if (!this.root.visible) return;
        this.root.updateWorldMatrix(true, false);
        this.inverse.copy(this.root.matrixWorld).invert();
        this.material.uniforms.uStrength.value = sim.weather.night * (.028 + sim.weather.fog * .05);
        let count = 0;
        for (const p of placements) {
            if (count >= 3) break;
            if (!['lighthouse', 'polar_lighthouse', 'hero_clifftop_lighthouse'].includes(p.model) || p.z < sim.z - 50 || p.z > sim.z + 550) continue;
            const actor = actors.get(key(p)), node = actor?.model.getObjectByName(p.model === 'hero_clifftop_lighthouse' ? 'beacon' : 'fresnel_carriage');
            if (!node) continue;
            node.updateWorldMatrix(true, false);
            this.matrix.multiplyMatrices(this.inverse, node.matrixWorld);
            const beam = this.beams[count], light = this.lights[count++];
            this.matrix.decompose(beam.position, beam.quaternion, this.scale);
            beam.scale.setScalar(1); beam.visible = true;
            this.direction.set(1, 0, 0).applyQuaternion(beam.quaternion);
            light.position.copy(beam.position);
            light.target.position.copy(beam.position).addScaledVector(this.direction, 85);
            light.intensity = 240 * sim.weather.night;
        }
    }
    dispose() { this.geometry.dispose(); this.material.dispose(); this.root.removeFromParent(); }
}
