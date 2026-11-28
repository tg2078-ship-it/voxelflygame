import * as T from 'three';
import { replayPose } from './mastery';
import type { FlightSimulation } from './simulation';

/** Shared geometry and a bounded pool: approach guidance costs one draw call. */
export class CourseBeacons {
    readonly root = new T.Group();
    private geometry = new T.BoxGeometry(1, 1, 1);
    private material = new T.MeshBasicMaterial({ transparent: true, opacity: .52, depthWrite: false, toneMapped: false });
    private marks = new T.InstancedMesh(this.geometry, this.material, 100);
    private dummy = new T.Object3D();
    private mint = new T.Color('#96ffe1');
    private gold = new T.Color('#ffd17b');
    private flags = [new T.Color('#65ffda'), new T.Color('#ffb35c'), new T.Color('#f3f9ff')];
    private dark = new T.Color('#192834');
    private ghostMaterial = new T.MeshBasicMaterial({ color: '#87d9ff', transparent: true, opacity: .22, depthWrite: false, wireframe: true, toneMapped: false });
    private ghost = new T.Group();
    private disposed = false;
    constructor(scene: T.Scene, span: number, length: number) {
        this.marks.frustumCulled = false; this.marks.count = 0;
        this.marks.instanceMatrix.setUsage(T.DynamicDrawUsage);
        this.root.add(this.marks, this.ghost); scene.add(this.root);
        for (const [x, y, z, sx, sy, sz] of [[0,0,0,1.1,1.1,length], [0,.05,.4,span,.2,1.7], [0,.4,length*.34,span*.35,.18,.8], [0,1,length*.34,.18,1.8,1]]) {
            const part = new T.Mesh(this.geometry, this.ghostMaterial); part.position.set(x,y,z); part.scale.set(sx,sy,sz); this.ghost.add(part);
        }
    }
    update(sim: FlightSimulation, renderZ = sim.z, flightOffset = 0) {
        if (this.disposed) return;
        this.root.visible = !sim.failed && !sim.completed && sim.eRemaining <= 0;
        if (!this.root.visible) return;
        this.root.position.z = flightOffset + renderZ - sim.z;
        let index = 0;
        const mint = this.mint, gold = this.gold;
        const segment = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: T.Color) => {
            if (index >= 100) return;
            this.dummy.position.set(x,y,sim.z-z); this.dummy.scale.set(sx,sy,sz); this.dummy.updateMatrix();
            this.marks.setMatrixAt(index,this.dummy.matrix); this.marks.setColorAt(index++,color);
        };
        const gate = (x: number, y: number, z: number, rx: number, ry: number, color: T.Color) => {
            for (const side of [-1,1]) for (const vertical of [-1,1]) {
                segment(x+side*(rx-.6),y+vertical*ry,z,1.2,.12,.16,color);
                segment(x+side*rx,y+vertical*(ry-.35),z,.12,.7,.16,color);
            }
        };
        const choice = sim.hudChoice();
        let shown = 0, gateIndex = sim.rally?.chain ?? 0;
        const horizon = sim.z + Math.max(480, sim.speed * 8);
        for (const encounter of sim.encounters) {
            for (const route of encounter.route) {
                if (route.z <= sim.z || route.z > horizon || shown >= 2) continue;
                const race = !!sim.rally && !sim.training && route.role !== 'orientation';
                const stage = gateIndex % 3;
                if (race) gateIndex++;
                const colour = race ? this.flags[stage] : mint;
                const rx = Math.max(3,Math.min(6,route.width/4)), ry = Math.max(2,Math.min(4,route.height/3));
                gate(route.x,route.y,route.z,rx,ry,colour);
                if (race) {
                    // Twin flags stay outside the marked centre and share the same draw call.
                    for (const side of [-1, 1]) {
                        const x = route.x + side * (rx + 1.2);
                        segment(x,route.y + ry - .45,route.z,.24,2.8,.24,colour);
                        for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
                            const ink = stage === 2 && (row + col) % 2 ? this.dark : colour;
                            segment(x + side * (.43 + .82 * col),route.y + ry + .69 - .44 * row,route.z,.82,.44,.15,ink);
                        }
                    }
                }
                if (choice && Math.abs(choice.z-route.z)<.01) gate(choice.risk.x,choice.risk.y,route.z,choice.risk.radiusX,choice.risk.radiusY,gold);
                for (let n=1;n<=4;n++) segment(route.x,route.y-2,route.z-n*12,.18,.1,3,colour);
                shown++;
            }
            if (shown >= 2) break;
        }
        this.marks.count=index; this.marks.instanceMatrix.needsUpdate=true;
        if (this.marks.instanceColor) this.marks.instanceColor.needsUpdate=true;
        const rival = !sim.eUsed && sim.config.rival ? replayPose(sim.config.rival.replay,sim.time) : null;
        // The chase camera sits behind the pilot. A nearby trailing ghost can
        // surround its lens; keep that comparison in the HUD and fade in ahead.
        const gap = rival ? rival.z - sim.z : 0;
        this.ghost.visible = !!rival && gap > 10 && gap < 350;
        this.ghostMaterial.opacity = .22 * Math.max(0, Math.min(1, (gap - 10) / 18, (350 - gap) / 50));
        if (rival) { this.ghost.position.set(rival.x,rival.y,sim.z-rival.z); this.ghost.rotation.z=rival.roll; }
    }
    dispose() { if(this.disposed)return;this.disposed=true;this.root.removeFromParent();this.geometry.dispose();this.material.dispose();this.ghostMaterial.dispose(); }
}
