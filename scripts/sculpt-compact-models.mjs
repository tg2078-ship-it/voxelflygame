// Build attachment frames on the actual native surfaces of every compact scenery model.
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const library = ['catalog','traffic-catalog'].flatMap(name => JSON.parse(fs.readFileSync('public/models/'+name+'.json', 'utf8')).assets);
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const output = {};
for (const asset of library.filter(a => a.category !== 'aircraft' && Math.max(...a.bounds.size) <= 12)) {
    const levels = {};
    for (const [lod, url] of Object.entries(asset.exports)) {
        const glb = gunzipSync(fs.readFileSync('public' + url));
        const length = glb.readUInt32LE(12);
        const doc = JSON.parse(glb.subarray(20, 20 + length));
        // Sampling needs positions, indices and native pivots only.
        delete doc.images; delete doc.textures; delete doc.materials;
        for (const mesh of doc.meshes) for (const primitive of mesh.primitives) delete primitive.material;
        const json = Buffer.from(JSON.stringify(doc)), padded = Math.ceil(json.length / 4) * 4;
        const bytes = Buffer.concat([glb.subarray(0, 20), json, Buffer.alloc(padded - json.length, 32), glb.subarray(20 + length)]);
        bytes.writeUInt32LE(bytes.length, 8); bytes.writeUInt32LE(padded, 12);
        const { scene } = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), '');
        scene.updateMatrixWorld(true);
        const box = new T.Box3().setFromObject(scene, true), size = box.getSize(new T.Vector3()), centre = box.getCenter(new T.Vector3());
        const anchors = [], ray = new T.Raycaster();
        for (const side of [new T.Vector3(1,0,0), new T.Vector3(0,0,-1), new T.Vector3(-1,0,0), new T.Vector3(0,0,1)]) {
            for (const y of [.58, .36, .72, .22]) {
                const origin = centre.clone().addScaledVector(side, size.length() + 2); origin.y = box.min.y + y * size.y;
                ray.set(origin, side.clone().negate());
                const hit = ray.intersectObject(scene, true).find(h => h.face && h.object.isMesh && !h.object.isSkinnedMesh);
                if (!hit) continue;
                const normal = hit.face.normal.clone().applyNormalMatrix(new T.Matrix3().getNormalMatrix(hit.object.matrixWorld));
                if (normal.dot(side) < .65) continue;
                const tangent = new T.Vector3(0, 1, 0).cross(normal).normalize();
                const up = normal.clone().cross(tangent);
                const span = Math.abs(side.x) ? size.z : size.x;
                const extent = Math.min(1.5, span * .24, size.y * .26);
                // Require nearby contact around each anchor. Reduce the fitting until
                // both ends sit on the same rigid component, including moving machinery.
                let radius = extent;
                while (radius > .08) {
                    const seated = [[-.46,0],[.46,0],[0,.22],[0,-.22]].every(([dx,dy]) => {
                        const probe = hit.point.clone().addScaledVector(tangent, dx*radius).addScaledVector(up, dy*radius).addScaledVector(normal,.09);
                        ray.set(probe, normal.clone().negate());
                        const near = ray.intersectObject(hit.object,false)[0];
                        return near && Math.abs(near.distance-.09) < .09;
                    });
                    if (seated) break;
                    radius *= .65;
                }
                if (radius <= .08) continue;
                const frame = new T.Matrix4().makeBasis(tangent,up,normal).scale(new T.Vector3(radius,radius,radius))
                    .setPosition(hit.point.clone().addScaledVector(normal, .004));
                const local = hit.object.matrixWorld.clone().invert().multiply(frame);
                anchors.push([hit.object.name,...local.elements.slice(0,15).filter((_,i)=>i%4!==3).map(v=>+v.toFixed(6))]);
                break;
            }
        }
        if (!anchors.length) {
            // Slender beacons and open frames have no continuous rectangular side.
            // Inscribe the detail in their broadest native triangle instead.
            let best = 0, seat;
            scene.traverse(mesh => {
                if (!mesh.isMesh) return;
                const g = mesh.geometry, pos = g.attributes.position, index = g.index;
                for (let j = 0; j + 2 < (index?.count ?? pos.count); j += 3) {
                    const ids = [0,1,2].map(k => index ? index.getX(j+k) : j+k);
                    const [a,b,c] = ids.map(i => mesh.getVertexPosition(i, new T.Vector3()).applyMatrix4(mesh.matrixWorld));
                    const ab = a.distanceTo(b), bc = b.distanceTo(c), ca = c.distanceTo(a), perimeter = ab+bc+ca;
                    const normal = b.clone().sub(a).cross(c.clone().sub(a)), radius = normal.length()/perimeter;
                    if (!(radius > best)) continue;
                    best = radius; normal.normalize();
                    const tangent = b.clone().sub(a).normalize(), up = normal.clone().cross(tangent);
                    const mid = a.multiplyScalar(bc/perimeter).addScaledVector(b,ca/perimeter).addScaledVector(c,ab/perimeter);
                    const scale = Math.min(1.5, radius*1.7);
                    const frame = new T.Matrix4().makeBasis(tangent,up,normal).scale(new T.Vector3(scale,scale,scale)).setPosition(mid.addScaledVector(normal,.003));
                    let parent = mesh;
                    if (mesh.isSkinnedMesh) {
                        const weights = new Map();
                        for (const id of ids) for (let c=0; c<4; c++) {
                            const joint = g.attributes.skinIndex.getComponent(id,c);
                            weights.set(joint,(weights.get(joint) ?? 0)+g.attributes.skinWeight.getComponent(id,c));
                        }
                        parent = mesh.skeleton.bones[[...weights].sort((a,b)=>b[1]-a[1])[0][0]];
                    }
                    const local = parent.matrixWorld.clone().invert().multiply(frame);
                    seat = [parent.name,...local.elements.slice(0,15).filter((_,i)=>i%4!==3).map(v=>+v.toFixed(6))];
                }
            });
            if (seat) anchors.push(seat);
        }
        if (!anchors.length) throw Error(asset.id + '/' + lod + ' has no seated detail');
        levels[lod] = anchors;
        scene.traverse(node=>{if(node.isMesh){node.geometry.dispose();node.material.dispose();}});
    }
    output[asset.id] = levels;
}
fs.writeFileSync('app/airrun/compact-fittings.json',JSON.stringify(output)+'\n');
console.log('Sculpted surface frames for',Object.keys(output).length,'models.');
