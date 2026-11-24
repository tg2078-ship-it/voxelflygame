import * as T from 'three';
import { ActorBatching } from './actor-batching';
import { RigidActorBatching } from './rigid-batching';
import { posedGeometry, updateModelPose } from './model-pose';
import { ModelCompiler } from './model-compiler';
import { modelDrawGroups, packModelCompileAsync, unpackCompiled } from './model-compile-protocol';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ModelLibrary, type ModelInstance } from './assets';
import { FlightStream } from './flight-stream';
import { TerrainBuilder } from './terrain-builder';
import { landscapePlacements } from './landscape';
import { GRAPHICS, requiresHeroSurface, flightModelLOD, compatibleModelLOD, residentModelLOD, nativeAnimationDistance, flightHorizon } from './graphics';
import { shouldRenderModelSurface } from './model-surface';
import type { Settings } from './types';
import type { FlightSimulation } from './simulation';
import { adSlot, type AdSlot } from './ads';
import { BeaconFX } from './beacon-fx';
import type { Placement, ThemeId, Obstacle } from './types';
interface Compiled {
    geometry: T.BufferGeometry;
    material: T.Material;
}
interface CompileWork {
    parts: { node: T.Mesh; material: T.Material; range?: { start: number; count: number } }[];
    cursor: number;
    groups: Map<T.Material, T.BufferGeometry[]>;
}
interface Batch {
    root: T.Group;
    meshes: T.InstancedMesh[];
    capacity: number;
    placements: Placement[];
}
interface Chunk {
    index: number;
    theme: ThemeId;
    mesh: T.Mesh;
    props: Placement[];
}
export class WorldView {
    root = new T.Group();
    advertSlots = new Map<string, AdSlot>();
    chunks = new Map<number, Chunk>();
    terrain = new TerrainBuilder();
    terrainPending = new Set<Promise<void>>();
    batches = new Map<string, Batch>();
    compiled = new Map<string, Compiled[]>();
    animated = new Map<string, ModelInstance>();
    actorBatches = new Map<string, ActorBatching | RigidActorBatching>();
    animationPreparing = new Set<string>();
    compileDeadline = Infinity;
    compileWork = new Map<string, CompileWork>();
    compiler = new ModelCompiler();
    compilePending = new Map<string, Promise<void>>();
    compileFallback = new Set<string>();
    warmups = new Set<string>();
    deferredCompile = false;
    preparingScene = false;
    pending = new Map<string, number>();
    wanted = new Set<string>();
    quality: Settings['quality'] = 'high';
    lastUsed = new Map<string, number>();
    lastTrim = 0;
    dirty = true;
    lastBuild = -1;
    lastBuildClock = -Infinity;
    matrixObject = new T.Object3D();
    origin = 0;
    terrainMaterial = new T.MeshStandardMaterial({ vertexColors: true, roughness: .94, side: T.DoubleSide });
    modelPlacements: Placement[] = [];
    placementByKey = new Map<string, Placement>();
    generation = 0;
    catalog: ModelLibrary;
    stream: FlightStream;
    presented = new Set<string>();
    collisionApproach = new Map<string, boolean>();
    scene: T.Scene;
    disposed = false;
    beacons: BeaconFX;
    constructor(scene: T.Scene, catalog: ModelLibrary) { this.scene = scene; this.catalog = catalog; this.stream = new FlightStream(catalog); scene.add(this.root); this.beacons = new BeaconFX(this.root); }
    canObstructCamera(obstacle: Obstacle) {
        const p = obstacle.home ?? obstacle.position;
        const key=this.placementKey({model:obstacle.model,x:p.x,z:p.z} as Placement);
        return this.presented.has(key) && this.catalog.proxies.has(obstacle.model);
    }
    canCollide(obstacle: Obstacle) {
        const home = obstacle.home ?? obstacle.position;
        const key = this.placementKey({ model: obstacle.model, x: home.x, z: home.z } as Placement);
        return this.presented.has(key) && this.collisionApproach.get(key) === true && this.catalog.ready(obstacle.model);
    }
    syncPresented(sim: FlightSimulation) {
        const visible = new Set<string>();
        for (const batch of this.batches.values()) if (batch.root.visible && batch.meshes.length)
            for (const p of batch.placements) visible.add(this.placementKey(p));
        for (const key of this.animated.keys()) visible.add(key);
        for (const key of visible) {
            const p = this.placementByKey.get(key); if (!p) continue;
            // A static fallback cannot represent the moving parts of a rig.
            // Reapply the approach window when its visible animation becomes available.
            if (this.catalog.proxies.get(p.model)?.dynamic.length && !this.animated.has(key)) {
                this.collisionApproach.delete(key);
                continue;
            }
            // A model that only arrives in the player's face cannot suddenly arm a collider.
            if (this.preparingScene || !this.collisionApproach.has(key))
                this.collisionApproach.set(key, this.preparingScene || p.z - sim.z > Math.max(55, sim.speed * 1.3));
        }
        for (const key of this.collisionApproach.keys()) if (!this.placementByKey.has(key)) this.collisionApproach.delete(key);
        this.presented = visible;
    }
    makeChunk(index: number, sim: FlightSimulation) {
        const start = index * 128;
        const e = sim.encounters.find(e => start >= e.start && start < e.start + e.length);
        const theme = e?.theme ?? sim.theme;
        const mesh = this.chunks.get(index)?.mesh ?? new T.Mesh(new T.BufferGeometry(), this.terrainMaterial);
        mesh.receiveShadow = true;
        mesh.castShadow = false;
        this.root.add(mesh);
        const props = landscapePlacements(index, theme, e?.variant ?? sim.variant, sim.config.seed, this.quality, this.catalog.byId);
        if ((theme === 'coast' || theme === 'city' || theme === 'korea' && (e?.variant ?? sim.variant) === 0) && index % 12 === 0)
            props.push({ model: index % 24 === 0 ? 'skyline_blimp' : 'vista_banner_plane', x: 110, y: 112, z: start + 65, sx: 1.2, sy: 1.2, sz: 1.2, yaw: Math.PI / 2, collision: false, role: 'advert' });
        const chunk = { index, theme, mesh, props }; this.chunks.set(index, chunk);
        const build = this.terrain.build({ start, theme, seed: sim.config.seed, variant: e?.variant ?? sim.variant, cell: GRAPHICS[this.quality].terrainCell }).then(geometry => {
            if (this.disposed || this.chunks.get(index) !== chunk) { geometry.dispose(); return; }
            mesh.geometry.dispose(); mesh.geometry = geometry;
        }).catch(() => {}).finally(() => this.terrainPending.delete(build));
        this.terrainPending.add(build);
        this.dirty = true;
    }
    compile(id: string, lod: 0 | 1 | 2 | 3, urgent = false) {
        lod = this.catalog.resolveLOD(id, lod);
        const key = this.catalog.cacheKey(id, lod);
        if (this.compiled.has(key))
            return this.compiled.get(key)!;
        if (this.compiler.enabled && !this.compileFallback.has(key)) {
            if (!this.compilePending.has(key)) {
                const source = this.catalog.cache.get(key); if (!source) return null;
                this.catalog.retain(key);
                const promise = packModelCompileAsync(source.scene, () => this.disposed).then(async ({ parts, materials }) => {
                    const buffers = await this.compiler.compile(parts);
                    if (this.disposed) { this.catalog.release(key); return; }
                    this.compiled.set(key, buffers.map(buffer => ({ geometry: unpackCompiled(buffer), material: materials[buffer.material] })));
                    this.dirty = true;
                }).catch(() => { this.catalog.release(key); this.compileFallback.add(key); this.dirty = true; }).finally(() => this.compilePending.delete(key));
                this.compilePending.set(key, promise);
            }
            this.deferredCompile = true; return null;
        }
        if (!urgent && performance.now() > this.compileDeadline) { this.deferredCompile = true; return null; }
        let work = this.compileWork.get(key);
        if (!work) {
            const gltf = this.catalog.cache.get(key); if (!gltf) return null;
            updateModelPose(gltf.scene);
            const parts: CompileWork['parts'] = [];
            gltf.scene.traverse(node => {
                if (!(node instanceof T.Mesh) || !shouldRenderModelSurface(node)) return;
                const materials = Array.isArray(node.material) ? node.material : [node.material];
                for (const { slot, range } of modelDrawGroups(node.geometry, Array.isArray(node.material)))
                    if (materials[slot]) parts.push({ node, material: materials[slot], range });
            });
            work = { parts, cursor: 0, groups: new Map() }; this.compileWork.set(key, work); this.catalog.retain(key);
        }
        const groups = work.groups;
        while (work.cursor < work.parts.length) {
            if (!urgent && performance.now() > this.compileDeadline) { this.deferredCompile = true; return null; }
            const { node, material, range } = work.parts[work.cursor++], source = node.geometry;
            const baked = posedGeometry(node);
            const geometry = baked.owned ? baked.geometry : source.clone();
            for (const name of ['position', 'normal']) {
                const a = geometry.getAttribute(name);
                if (!a || !(a as T.InterleavedBufferAttribute).isInterleavedBufferAttribute && a.array instanceof Float32Array && !a.normalized) continue;
                const interleaved = (a as T.InterleavedBufferAttribute).isInterleavedBufferAttribute ? a as T.InterleavedBufferAttribute : null;
                const sourceArray = a.array, stride = interleaved?.data.stride ?? a.itemSize, offset = interleaved?.offset ?? 0;
                const signed = sourceArray instanceof Int8Array || sourceArray instanceof Int16Array;
                const divisor = !a.normalized ? 1 : sourceArray instanceof Uint16Array ? 65535 : sourceArray instanceof Int16Array ? 32767 : sourceArray instanceof Uint8Array ? 255 : sourceArray instanceof Int8Array ? 127 : 1;
                const arr = new Float32Array(a.count * a.itemSize);
                for (let i = 0; i < a.count; i++) for (let j = 0; j < a.itemSize; j++) {
                    const value = sourceArray[i * stride + offset + j] / divisor;
                    arr[i * a.itemSize + j] = signed && a.normalized ? Math.max(-1, value) : value;
                }
                geometry.setAttribute(name, new T.Float32BufferAttribute(arr, a.itemSize));
            }
            if (range) {
                geometry.setIndex(Array.from({ length: range.count }, (_, i) => source.index ? source.index.getX(range.start + i) : range.start + i));
            }
            else if (!geometry.index) geometry.setIndex(Array.from({ length: geometry.getAttribute('position').count }, (_, i) => i));
            geometry.clearGroups(); geometry.setDrawRange(0, Infinity); geometry.applyMatrix4(node.matrixWorld);
            if (geometry.morphAttributes.position) geometry.morphAttributes = {};
            geometry.morphTargetsRelative = false;
            const list = groups.get(material) ?? []; list.push(geometry); groups.set(material, list);
        }
        const compiled: Compiled[] = [];
        for (const [material, geometries] of groups) {
            const merged = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false);
            if (merged) {
                compiled.push({ geometry: merged, material });
                if (geometries.length > 1)
                    for (const g of geometries)
                        g.dispose();
            }
        }
        this.compiled.set(key, compiled);
        this.compileWork.delete(key);
        return compiled;
    }
    update(sim: FlightSimulation, dt: number, quality: string, motionTime = sim.motionTime) {
        this.stream.update(sim);
        const selected = quality in GRAPHICS ? quality as Settings['quality'] : 'high';
        this.catalog.geometryBudget = (selected === 'balanced' ? 128 : selected === 'ultra' ? 384 : 256) * 1024 * 1024;
        if (selected !== this.quality) {
            this.quality = selected;
            this.lastBuildClock = -Infinity;
            this.generation++;
            this.wanted.clear();
            // Keep the current ground visible until its new quality tile arrives.
            for (const index of [...this.chunks.keys()]) this.makeChunk(index, sim);
            for (const instance of this.animated.values())
                instance.dispose();
            for (const batch of this.actorBatches.values()) batch.dispose();
            this.actorBatches.clear();
            this.animated.clear();
            this.dirty = true;
        }
        const visibleAhead = flightHorizon(sim.speed, this.quality), first = Math.max(0, Math.floor((sim.z - 180) / 128)), last = Math.ceil((sim.z + visibleAhead) / 128);
        for (let i = first; i <= last; i++)
            if (!this.chunks.has(i))
                this.makeChunk(i, sim);
        for (const [idx, ch] of this.chunks) {
            if (idx < first || idx > last) {
                ch.mesh.removeFromParent();
                ch.mesh.geometry.dispose();
                this.chunks.delete(idx);
                this.dirty = true;
            }
            else
                ch.mesh.position.z = sim.z - idx * 128;
        }
        const newOrigin = Math.floor(sim.z / 1024) * 1024;
        if (newOrigin !== this.origin) {
            this.origin = newOrigin;
            this.dirty = true;
        }
        if (this.dirty && performance.now() - this.lastBuildClock >= 30 || sim.time - this.lastBuild > .24) {
            this.compileDeadline = this.preparingScene ? Infinity : performance.now() + 4;
            this.deferredCompile = false;
            this.rebuild(sim, quality);
            this.lastBuild = sim.time;
            this.lastBuildClock = performance.now();
            this.dirty = this.deferredCompile;
        }
        for (const batch of this.batches.values())
            batch.root.position.z = sim.z - this.origin;
        for (const [key, instance] of this.animated) {
            const p = this.placementByKey.get(key);
            if (!p)
                continue;
            const pose = this.placementPose(p, sim, motionTime);
            instance.root.position.set(pose.x, pose.y, sim.z - pose.z);
            instance.mixer.setTime(motionTime + (p.animationPhase ?? 0));
            this.actorBatches.get(key)?.sync();

        }
        const object = this.matrixObject;
        for (const batch of this.batches.values()) {
            if (!batch.root.visible)
                continue;
            for (let i = 0; i < batch.placements.length; i++) {
                const p = batch.placements[i];
                if (!p.move && p.role !== 'advert')
                    continue;
                const pose = this.placementPose(p, sim, motionTime);
                object.position.set(pose.x, pose.y, -(pose.z - this.origin));
                object.rotation.set(0, p.yaw, 0);
                object.scale.set(p.sx, p.sy, p.sz);
                object.updateMatrix();
                for (const m of batch.meshes) {
                    m.setMatrixAt(i, object.matrix);
                    m.instanceMatrix.needsUpdate = true;
                }
            }
        }
        for (const p of this.modelPlacements) {
            if (p.z - sim.z > 130 || p.z - sim.z < -25 || !this.presented.has(this.placementKey(p)))
                continue;
            if (Math.abs(p.x - sim.x) < 76) sim.observeModel(p.model);
            const real = ['seoul_tower', 'gwangan_bridge', 'palace_wall_pavilion', 'pagoda_five_story'].includes(p.model), fiction = ['cliffside_castle', 'desert_observatory', 'waterfall_cliff', 'natural_arch'].includes(p.model);
            if (real || fiction)
                sim.observeLandmark(p.model, real);
        }
        const activeAds = new Set<string>();
        for (const p of this.modelPlacements.filter(p => p.role === 'advert')) {
            const id = `ad:${p.model}:${p.z.toFixed(2)}`;
            activeAds.add(id);
            const slot = this.advertSlots.get(id) ?? adSlot(p, sim.theme, this.catalog.byId.get(p.model)!);
            if (p.z > sim.z && p.z - sim.z < Math.max(900, sim.speed * 8) && Math.abs(p.x) < (p.z - sim.z) * .8)
                slot.visibleSeconds += dt;
            this.advertSlots.set(id, slot);
        }
        for (const id of this.advertSlots.keys())
            if (!activeAds.has(id))
                this.advertSlots.delete(id);
        this.terrainMaterial.roughness = .94 - sim.weather.wet * .5;
        this.beacons.update(sim, this.modelPlacements, this.animated, p => this.placementKey(p));
    }
    placementPose(p: Placement, sim: FlightSimulation, motionTime = sim.motionTime) {
        const pose = { x: p.x, y: p.y, z: p.z };
        if (p.move)
            pose[p.move.axis] += Math.sin(motionTime * p.move.frequency + p.move.phase) * p.move.amplitude;
        if (p.role === 'advert')
            pose.x += Math.sin(motionTime * .035 + p.z * .01) * 25;
        return pose;
    }
    placementKey(p: Placement) { return `${p.model}:${p.x.toFixed(2)}:${p.z.toFixed(2)}`; }
    rebuild(sim: FlightSimulation, quality: string) {
        const placements = [...sim.encounters.flatMap(e => e.placements), ...[...this.chunks.values()].flatMap(c => c.props)].filter(p => p.z > sim.z - 160 && p.z < sim.z + flightHorizon(sim.speed, this.quality) + 50);
        this.modelPlacements = placements;
        this.placementByKey = new Map(placements.map(p => [this.placementKey(p), p]));
        const physicalModels = new Set(sim.encounters.flatMap(e => e.placements).filter(p => p.collision).map(p => p.model));
        void this.catalog.ensureProxies([...physicalModels]).catch(() => {});
        const profile = GRAPHICS[this.quality];
        const grouped = new Map<string, Placement[]>(), animatedKeys = new Set<string>();
        this.wanted = animatedKeys;
        let animatedCount = 0, animatedDraws = 0, heroTriangles = 0;
        const focus = { x: sim.x, y: sim.y, z: sim.z, speed: sim.speed, span: sim.plane.span };
        const ranked = placements.flatMap(p => {
            const meta = this.catalog.byId.get(p.model);
            if (!meta) return [];
            const dist = p.z - sim.z;
            const hero = requiresHeroSurface(meta,p,focus,this.quality);
            const nearActor = meta.moving && dist > -30 && dist < Math.max(125,sim.speed*2.5);
            return [{p,meta,dist,hero,priority:Number(hero)*4 + Number(nearActor)*2 + Number(p.collision)}];
        });
        const heroPlacements = new Set(ranked.filter(row => row.hero).map(row => row.p));
        ranked.sort((a,b) => b.priority-a.priority || Math.abs(a.dist)-Math.abs(b.dist));
        for (const {p,meta,dist,hero} of ranked) {
            const highestLOD = this.catalog.resolveLOD(p.model, 0), highestKey = this.catalog.cacheKey(p.model, 0);
            let requestedLOD = flightModelLOD(meta, p, focus, this.quality);
            if (requestedLOD === 0) {
                const triangles = meta.renderCosts?.lod0?.triangles ?? 0;
                const contact = hero && dist > -45 && dist < Math.max(55, sim.speed * .8);
                if (!contact && heroTriangles + triangles > profile.heroTriangleBudget) requestedLOD = compatibleModelLOD(meta, 1);
                else heroTriangles += triangles;
            }
            if (!this.catalog.cache.has(p.model + ':' + requestedLOD) && this.catalog.canRequest(p.model, requestedLOD))
                void this.catalog.load(p.model, requestedLOD, hero ? 1 : 2).then(() => this.dirty = true).catch(() => {});
            // Animate and render the resident silhouette now; refining it never waits
            // for a network request and never freezes the simulation.
            let lod = this.catalog.availableLOD(p.model, requestedLOD) ?? compatibleModelLOD(meta, 2);
            if (!meta.moving && requestedLOD === highestLOD && lod === highestLOD && !this.compiled.has(highestKey)) {
                this.warmups.add(p.model);
                const baseline = residentModelLOD(meta, this.quality);
                if (baseline !== highestLOD && this.compiled.has(this.catalog.cacheKey(p.model, baseline))) lod = baseline;
            }
            const upcoming = { ...focus, z: sim.z + Math.max(120, sim.speed * 2) };
            const preview = { ...focus, z: sim.z + Math.max(180, sim.speed * 4) };
            if (dist > 0 && flightModelLOD(meta, p, preview, this.quality) === highestLOD && !this.catalog.cache.has(highestKey) && this.catalog.canRequest(p.model, highestLOD))
                void this.catalog.load(p.model, 0, 1).then(() => this.dirty = true).catch(() => {});
            if (p.collision && meta.exports.lod0 && dist > 0 && requiresHeroSurface(meta, p, upcoming, this.quality) && !this.compiled.has(highestKey)) this.warmups.add(p.model);
            if (p.collision && meta.exports.lod0 && dist > 0 && requiresHeroSurface(meta, p, upcoming, this.quality) && !this.catalog.cache.has(highestKey) && this.catalog.canRequest(p.model, highestLOD))
                void this.catalog.load(p.model, 0).then(() => this.dirty = true).catch(() => {});
            const assetKey = p.model + ':' + lod, key = this.placementKey(p);
            const actor = this.actorBatches.get(key);
            if (this.animated.get(key)?.lod === lod && actor instanceof RigidActorBatching && actor.draws > (this.catalog.animationDraws.get(assetKey) ?? 0)) this.catalog.animationDraws.set(assetKey, actor.draws);
            const draws = this.catalog.animationDraws.get(assetKey) ?? meta.renderCosts?.[('lod' + lod) as 'lod0' | 'lod1' | 'lod2' | 'lod3']?.draws ?? 12;
            const distance = Math.hypot(p.x - sim.x, p.y - sim.y, dist);
            if (meta.moving && distance < profile.animationDistance + Math.min(200, sim.speed * 3) && this.catalog.cache.has(assetKey) && !this.catalog.animationDraws.has(assetKey) && !this.animationPreparing.has(assetKey)) {
                this.animationPreparing.add(assetKey);
                void this.catalog.prepareAnimation(p.model, lod).then(() => this.dirty = true).catch(() => {}).finally(() => this.animationPreparing.delete(assetKey));
            }
            const contact = hero && dist > -45 && dist < Math.max(55, sim.speed * .8);
            const nativeWhileCompiling = contact && this.compiler.enabled && !this.compiled.has(p.model + ':' + lod);
            const animationRange = nativeAnimationDistance(meta, lod, this.quality, draws) * (this.animated.has(key) ? 1.15 : 1);
            const animated = nativeWhileCompiling || meta.moving && dist > -100 && (contact || distance < animationRange && animatedCount < profile.animatedModels && animatedDraws + draws <= profile.animationDraws);
            if (animated) {
                animatedCount++; animatedDraws += draws;
                animatedKeys.add(key);
                if ((!this.animated.has(key) || lod !== this.animated.get(key)!.lod) && this.pending.get(key) !== this.generation && this.catalog.canRequest(p.model, lod)) {
                    this.pending.set(key, this.generation);
                    const generation = this.generation;
                    void this.catalog.instance(p.model, lod).then(instance => {
                        if (this.pending.get(key) === generation)
                            this.pending.delete(key);
                        if (this.disposed || generation !== this.generation || !this.wanted.has(key)) {
                            instance.dispose();
                            return;
                        }
                        instance.root.scale.set(p.sx, p.sy, p.sz);
                        instance.root.rotation.y = p.yaw;
                        const pose = this.placementPose(p, sim);
                        instance.root.position.set(pose.x, pose.y, sim.z - pose.z);
                        instance.mixer.setTime(sim.motionTime + (p.animationPhase ?? 0));
                        this.actorBatches.get(key)?.dispose();
                        // Present native motion immediately. Optimization preparation
                        // must never delay the actual moving collision surface.
                        if (meta.moving && draws >= 30) this.actorBatches.set(key, new ActorBatching(instance.model));
                        else this.actorBatches.delete(key);
                        this.animated.get(key)?.dispose();
                        this.root.add(instance.root);
                        this.animated.set(key, instance);
                        this.syncPresented(sim);
                        this.dirty = true;
                        if (meta.moving) void this.catalog.prepareAnimation(p.model, lod).then(plan => {
                            if (this.disposed || generation !== this.generation || this.animated.get(key) !== instance) return;
                            this.actorBatches.get(key)?.dispose(); this.actorBatches.delete(key);
                            const batching = new RigidActorBatching(instance.model, plan);
                            batching.sync(); this.actorBatches.set(key, batching); this.dirty = true;
                        }).catch(() => {});
                    }).catch(() => { if (this.pending.get(key) === generation)
                        this.pending.delete(key); });
                }
                if (this.animated.has(key))
                    continue;
            }
            if (meta.moving && lod === 0 && this.catalog.cache.has(p.model + ':1')) lod = 1;
            const requested = p.model + ':' + lod;
            if (!this.catalog.cache.has(requested) && this.catalog.canRequest(p.model, lod))
                void this.catalog.load(p.model, lod).then(() => this.dirty = true).catch(() => { });
            const effective = this.catalog.cache.has(requested) ? lod : ([compatibleModelLOD(meta, 2), compatibleModelLOD(meta, 1), highestLOD] as const).find(level => this.catalog.cache.has(this.catalog.cacheKey(p.model, level))) ?? null;
            if (effective === null)
                continue;
            const groupKey = p.model + ':' + effective;
            this.lastUsed.set(groupKey, sim.time);
            const list = grouped.get(groupKey) ?? [];
            list.push(p);
            grouped.set(groupKey, list);
        }
        for (const [key, instance] of this.animated)
            if (!animatedKeys.has(key)) {
                this.actorBatches.get(key)?.dispose(); this.actorBatches.delete(key);
                instance.dispose();
                this.animated.delete(key);
            }
        for (const [key, batch] of this.batches)
            batch.root.visible = grouped.has(key);
        for (const [key, batch] of this.batches)
            // With the complete theme deck, keeping inactive compiled LODs for 20 seconds
            // retained almost a second district of geometry. A short reuse window is enough.
            if (!grouped.has(key) && sim.time - (this.lastUsed.get(key) ?? 0) > 5) {
                batch.root.removeFromParent();
                for (const m of batch.meshes)
                    m.dispose();
                this.batches.delete(key);
                for (const c of this.compiled.get(key) ?? [])
                    c.geometry.dispose();
                this.compiled.delete(key);
                this.catalog.release(key);
                this.lastUsed.delete(key);
            }
        for (const [key, compiled] of this.compiled) {
            const id = key.slice(0, key.lastIndexOf(':'));
            if (!this.batches.has(key) && !this.warmups.has(id) && sim.time - (this.lastUsed.get(key) ?? 0) > 5) {
                compiled.forEach(part => part.geometry.dispose()); this.compiled.delete(key); this.catalog.release(key); this.lastUsed.delete(key);
            }
        }
        for (const [key, work] of this.compileWork) {
            const id = key.slice(0, key.lastIndexOf(':'));
            if (!placements.some(p => p.model === id)) {
                for (const geometries of work.groups.values()) for (const g of geometries) g.dispose();
                this.catalog.release(key); this.compileWork.delete(key);
            }
        }
        if (sim.time - this.lastTrim > 5) {
            this.catalog.trim(52 + this.stream.retained.size);
            this.catalog.trimProxies(new Set([...physicalModels, ...this.stream.proxyIds]));
            this.lastTrim = sim.time;
        }
        const object = this.matrixObject;
        for (const id of this.warmups) {
            if (!placements.some(p => p.model === id)) { this.warmups.delete(id); continue; }
            const key = this.catalog.cacheKey(id, 0);
            if (this.catalog.cache.has(key)) this.lastUsed.set(key, sim.time);
            if (this.catalog.cache.has(key) && this.compile(id, 0)) this.warmups.delete(id);
        }
        for (const [key, ps] of grouped) {
            const split = key.lastIndexOf(':'), id = key.slice(0, split), lod = +key.slice(split + 1) as 0 | 1 | 2 | 3;
            let drawKey = key;
            let compiled = this.compile(id, lod, lod === 0 && ps.some(p => heroPlacements.has(p)));
            if (!compiled) {
                // Keep the previous compatible silhouette while a noncritical LOD
                // waits for its compile slot. Rebase its matrices too; never blink out.
                const oldKey = [...this.batches.keys()].find(candidate => candidate.startsWith(id + ':') && !grouped.has(candidate) && compatibleModelLOD(this.catalog.byId.get(id)!, +candidate.slice(candidate.lastIndexOf(':') + 1) as 0 | 1 | 2 | 3) === +candidate.slice(candidate.lastIndexOf(':') + 1));
                if (!oldKey) continue;
                drawKey = oldKey; compiled = this.compiled.get(oldKey)!;
            }
            this.lastUsed.set(drawKey, sim.time);
            let batch = this.batches.get(drawKey);
            if (!batch || batch.capacity < ps.length) {
                if (batch) {
                    batch.root.removeFromParent();
                    for (const m of batch.meshes)
                        m.dispose();
                }
                const capacity = Math.max(8, Math.ceil(ps.length / 8) * 8), root = new T.Group();
                const meshes = compiled.map(c => { const mesh = new T.InstancedMesh(c.geometry, c.material, capacity); mesh.castShadow = quality !== 'balanced' && lod < 2; mesh.receiveShadow = true; mesh.frustumCulled = true; root.add(mesh); return mesh; });
                batch = { root, meshes, capacity, placements: ps };
                this.batches.set(drawKey, batch);
                this.root.add(root);
            }
            batch.root.visible = true;
            batch.placements = ps;
            for (let i = 0; i < ps.length; i++) {
                const p = ps[i];
                const pose = this.placementPose(p, sim);
                object.position.set(pose.x, pose.y, -(pose.z - this.origin));
                object.rotation.set(0, p.yaw, 0);
                object.scale.set(p.sx, p.sy, p.sz);
                object.updateMatrix();
                for (const m of batch.meshes)
                    m.setMatrixAt(i, object.matrix);
            }
            for (const m of batch.meshes) {
                m.count = ps.length;
                m.instanceMatrix.needsUpdate = true;
                m.computeBoundingSphere();
            }
        }
        this.syncPresented(sim);
    }
    async prepare(sim: FlightSimulation, quality: Settings['quality']) {
        // Downloads are not readiness: settle native clones and static batches before flight.
        this.preparingScene = true;
        for (let pass = 0; pass < 5 && !this.disposed; pass++) {
            this.dirty = true; this.lastBuildClock = -Infinity; this.update(sim, 0, quality);
            await Promise.allSettled([...this.catalog.pending.values(), ...this.catalog.animationPending.values(), ...this.catalog.proxyPending.values(), ...this.terrainPending, ...this.compilePending.values()]);
            await new Promise(resolve => setTimeout(resolve, 0));
        }
        if (!this.disposed) { this.lastBuildClock = -Infinity; this.dirty = true; this.update(sim, 0, quality); }
        this.preparingScene = false;
    }
    dispose() {
        this.stream.dispose(); this.presented.clear(); this.collisionApproach.clear();
        this.terrain.dispose(); this.compiler.dispose();
        for (const batch of this.actorBatches.values()) batch.dispose(); this.actorBatches.clear();
        for (const [key, work] of this.compileWork) { for (const geometries of work.groups.values()) for (const g of geometries) g.dispose(); this.catalog.release(key); }
        this.compileWork.clear(); this.warmups.clear();
        this.disposed = true;
        this.generation++;
        this.wanted.clear();
        for (const ch of this.chunks.values())
            ch.mesh.geometry.dispose();
        for (const instance of this.animated.values())
            instance.dispose();
        for (const b of this.batches.values())
            for (const m of b.meshes)
                m.dispose();
        for (const [key, c] of this.compiled) {
            for (const g of c)
                g.geometry.dispose();
            this.catalog.release(key);
        }
        this.terrainMaterial.dispose();
        this.beacons.dispose();
        this.root.removeFromParent();
    }
}
