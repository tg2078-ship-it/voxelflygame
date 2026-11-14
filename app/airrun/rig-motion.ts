import * as T from 'three';
export interface RigDefinition {
    nodes: { name: string; parent: number; p: number[]; q: number[]; s: number[]; weights?: number[] }[];
    clips: { name: string; duration: number; autoplay: boolean; channels: { node: number; path: string; times: number[]; values: number[]; interpolation: string }[] }[];
}
interface RigState { root: T.Group; mixer: T.AnimationMixer; nodes: Map<string, T.Object3D>; time: number }
const rigs = new WeakMap<RigDefinition, RigState>();
/** Sample authored pivots without any camera, floating-origin or departure transform. */
export function rigPose(definition: RigDefinition, time: number) {
    let rig = rigs.get(definition);
    if (!rig) {
        const root = new T.Group(), objects = definition.nodes.map(node => {
            const object = new T.Object3D() as T.Object3D & { morphTargetInfluences?: number[] }; object.name = node.name;
            if (node.weights) object.morphTargetInfluences = [...node.weights];
            object.position.fromArray(node.p); object.quaternion.fromArray(node.q); object.scale.fromArray(node.s); return object;
        });
        definition.nodes.forEach((node, i) => (node.parent < 0 ? root : objects[node.parent]).add(objects[i]));
        const mixer = new T.AnimationMixer(root);
        for (const clip of definition.clips) {
            if (!clip.autoplay) continue;
            const tracks = clip.channels.filter(channel => ['rotation', 'translation', 'scale', 'weights'].includes(channel.path)).map(channel => {
                const property = channel.path === 'weights' ? 'morphTargetInfluences' : channel.path === 'rotation' ? 'quaternion' : channel.path === 'translation' ? 'position' : 'scale';
                const Track = channel.path === 'weights' ? T.NumberKeyframeTrack : channel.path === 'rotation' ? T.QuaternionKeyframeTrack : T.VectorKeyframeTrack;
                return new Track(objects[channel.node].uuid + '.' + property, channel.times, channel.values, channel.interpolation === 'STEP' ? T.InterpolateDiscrete : T.InterpolateLinear);
            });
            mixer.clipAction(new T.AnimationClip(clip.name, clip.duration, tracks)).play();
        }
        rig = { root, mixer, nodes: new Map(objects.map(object => [object.name, object])), time: NaN }; rigs.set(definition, rig);
    }
    if (time !== rig.time) { rig.mixer.setTime(time); rig.root.updateMatrixWorld(true); rig.time = time; }
    return rig.nodes;
}
