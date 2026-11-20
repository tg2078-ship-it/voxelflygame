import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import surfaceFrames from './compact-fittings.json';

type Seat = (number | string)[];
const fittings = surfaceFrames as Record<string, Record<string, Seat[]>>;

// Each template is sculpted in the tangent plane of a measured native surface.
// Depth is deliberately shallow so the flight collider still matches its silhouette.
function relief(id: string, category: string) {
    const pieces: T.BufferGeometry[] = [];
    const paint = new T.Color();
    function part(g: T.BufferGeometry, color: string, x: number, y: number, z: number) {
        g.translate(x,y,z);
        const colors = new Float32Array(g.attributes.position.count * 3);
        paint.set(color);
        for (let i=0; i<colors.length; i+=3) paint.toArray(colors,i);
        g.setAttribute('color',new T.BufferAttribute(colors,3));
        pieces.push(g);
    }
    function bar(w: number,h: number,d: number,x: number,y: number,z: number,color: string,angle=0) {
        part(new T.BoxGeometry(w,h,d).rotateZ(angle),color,x,y,z);
    }
    function boss(r: number,x: number,y: number,z: number,color: string) {
        part(new T.CylinderGeometry(r,r*1.15,.018,8).rotateX(Math.PI/2),color,x,y,z);
    }
    if (id === 'bird_flock') {
        for (const [x,y] of [[-.18,-.065],[-.05,0],[.08,.065]]) bar(.40,.028,.012,x,y,.008,'#bbbaa8',.22);
    } else if (id === 'rail_track') {
        for (const x of [-.30,.30]) {
            bar(.18,.23,.018,x,0,.009,'#574b42');
            boss(.055,x,0,.022,'#9e907d');
        }
    } else if (/rock|basalt|gorge|canyon|mesa|grotto|cave|needle|ice_shelf|coastal_arch|waterfall|tree|canopy_arch|orchard_windbreak|hay_bales/.test(id)) {
        const stone = category === 'snow_ice' ? ['#79bbc6','#d5eef1'] : category === 'desert_canyon' ? ['#995d45','#d6a071'] : /tree|canopy|orchard|hay/.test(id) ? ['#6b6442','#b0a06a'] : ['#52625c','#87907c'];
        for (const [x,y,w,h] of [[-.16,-.06,.48,.075],[.16,.04,.41,.09],[-.12,.11,.25,.04]]) {
            part(new T.CylinderGeometry(1,.86,.026,5).rotateX(Math.PI/2).scale(w*.5,h*.5,1).rotateZ(.18),stone[y>0?1:0],x,y,.014);
        }
    } else if (/beacon|signal|marker|bollard|waypoint|light|finish|neon/.test(id)) {
        bar(.82,.28,.026,0,0,.013,'#263e48');
        for (const x of [-.23,0,.23]) {
            boss(.108,x,0,.029,'#9a8465'); boss(.073,x,0,.042,x === 0 ? '#ffd38a':'#93d7bc');
        }
    } else if (/boat|berth|buoy|capstan|ferry|bulkhead/.test(id)) {
        for (const x of [-.22,.22]) {
            boss(.18,x,0,.012,'#aa9468'); boss(.138,x,0,.03,'#344d59');
            bar(.18,.018,.012,x,.045,.043,'#9cb8b1',.15);
        }
    } else if (category==='korean_landmarks' || category==='village' || /timber|barn|fence|tiled/.test(id)) {
        const korean = category==='korean_landmarks' || id.includes('tiled');
        bar(.85,.35,.016,0,0,.008,korean?'#593c36':'#5d493c');
        for (const x of [-.34,-.12,.12,.34]) bar(.035,.3,.023,x,0,.023,korean?'#bb8d60':'#be9d75');
        for (const y of [-.14,0,.14]) bar(.83,.032,.025,0,y,.026,korean?'#91a797':'#947256');
    } else {
        const accent = category==='snow_ice' ? '#e09254' : category==='farm' ? '#a3b981' : category==='coastal' ? '#d4a26b' : '#84afa9';
        bar(.8,.32,.018,0,0,.009,'#36464c');
        for (const y of [-.095,0,.095]) bar(.51,.039,.029,-.04,y,.025,accent);
        for (const x of [-.34,.34]) for (const y of [-.11,.11]) boss(.026,x,y,.02,'#c6bca8');
    }
    const shape = mergeGeometries(pieces)!;
    pieces.forEach(p=>p.dispose());
    return shape;
}
export function fitCompactScenery(root: T.Object3D, id: string, category: string, lod: number) {
    const seats = fittings[id]?.['lod'+lod];
    if (!seats?.length) return 0;
    const shape = relief(id,category), groups = new Map<T.Object3D,T.BufferGeometry[]>();
    for (const [name,...matrix] of seats) {
        const parent = root.getObjectByName(String(name));
        if (!parent) continue;
        const m = matrix as number[];
        const frame = new T.Matrix4().fromArray([...m.slice(0,3),0,...m.slice(3,6),0,...m.slice(6,9),0,...m.slice(9,12),1]);
        const pieces = groups.get(parent) ?? [];
        pieces.push(shape.clone().applyMatrix4(frame));
        groups.set(parent,pieces);
    }
    shape.dispose();
    if (!groups.size) return 0;
    const material = new T.MeshStandardMaterial({vertexColors:true, roughness:.74, metalness:.12, polygonOffset:true, polygonOffsetFactor:-1});
    material.name='Airrun surface relief';
    for (const [parent, pieces] of groups) {
        const mesh = new T.Mesh(mergeGeometries(pieces)!,material);
        mesh.name = 'AirrunRelief_'+parent.name;
        parent.add(mesh);
        pieces.forEach(p=>p.dispose());
    }
    return groups.size;
}
