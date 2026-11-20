import { assetUrl } from './asset-url';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { gunzipSync } from 'three/addons/libs/fflate.module.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import type { AssetMeta } from './types';
import { fitCompactScenery } from './compact-scenery';
import { updateModelPose } from './model-pose';
import { compatibleModelLOD, resolveModelLOD } from './graphics';
import { normalizeModelSurfaces, smoothAuditedStoneBasePalette } from './model-surface';
import type { ProxyData } from './collision';
import { ModelTexturePool } from './texture-pool';
import { prepareRigidPlan, releaseRigidPlan, measureAnimationDraws, type RigidPlan } from './rigid-batching';
export interface ModelInstance {
    lod: 0 | 1 | 2 | 3;
    root: THREE.Group;
    model: THREE.Object3D;
    mixer: THREE.AnimationMixer;
    actions: Map<string, THREE.AnimationAction>;
    meta: AssetMeta;
    materials: THREE.MeshStandardMaterial[];
    parkedOffsetY?: number;
    dispose: () => void;
}
/** Missing/forbidden files need an explicit retry after repair, not a request
 * every world rebuild. Temporary network/server failures get two retries. */
export class AssetRequestError extends Error {
    constructor(message: string, readonly retryable = true) { super(message); this.name = 'AssetRequestError'; }
}
interface AssetFailure { attempts: number; retryAt: number; message: string }
function assetFailure(error: unknown, previous?: AssetFailure, delay = 1200): AssetFailure {
    const attempts = (previous?.attempts ?? 0) + 1;
    const retryable = !(error instanceof AssetRequestError) || error.retryable;
    return { attempts, retryAt: retryable && attempts < 3 ? performance.now() + Math.min(30000, delay * 2 ** (attempts - 1)) : Infinity,
        message: error instanceof Error ? error.message : String(error) };
}
export class ModelLibrary {
    loader = new GLTFLoader(new THREE.LoadingManager().setURLModifier(url => assetUrl(url))).setMeshoptDecoder(MeshoptDecoder);
    byId = new Map<string, AssetMeta>();
    proxies = new Map<string, ProxyData>();
    cache = new Map<string, GLTF>();
    textures = new ModelTexturePool();
    textureAnisotropy = 1;
    animationDraws = new Map<string, number>();
    animationPending = new Map<string, Promise<RigidPlan>>();
    proxyPending = new Map<string, Promise<void>>();
    proxyFailures = new Map<string, AssetFailure>();
    proxyLastUsed = new Map<string, number>();
    pending = new Map<string, Promise<GLTF>>();
    references = new Map<string, number>();
    lastUsed = new Map<string, number>();
    jobs: { key: string; priority: number; run: () => void }[] = [];
    active = 0;
    failed = new Set<string>();
    failures = new Map<string, AssetFailure>();
    wet = 0;
    night = 0;
    allMaterials = new Set<THREE.MeshStandardMaterial>();
    disposed = false;
    abortController = new AbortController();
    atlasLoads = new Map<string, Promise<THREE.Texture>>();
    geometryBudget = 256 * 1024 * 1024;
    geometrySizes = new WeakMap<GLTF, number>();
    constructor() {
        // Edition12's four atlas images are decoded once per library. Sharing
        // promises also prevents four concurrent GLBs decoding four 2K copies.
        this.loader.register(parser => ({ name: 'AIRRUN_EDITION12_ATLAS', loadTexture: index => {
            const def = parser.json.textures?.[index], image = parser.json.images?.[def?.source];
            if (!/^surface-(color|orm|normal|emission)$/.test(image?.name ?? '') || !image.uri?.startsWith('/models/textures/')) return null;
            const key = image.uri + ':' + JSON.stringify(parser.json.samplers?.[def.sampler] ?? {});
            let promise = this.atlasLoads.get(key);
            if (!promise) {
                promise = parser.loadTexture(index).then(texture => {
                    if (this.disposed) { texture.dispose(); (texture.image as { close?: () => void } | undefined)?.close?.(); throw new Error('Model library disposed'); }
                    this.textures.pin(texture); return texture;
                }).catch(error => { this.atlasLoads.delete(key); throw error; });
                this.atlasLoads.set(key, promise);
            }
            return promise.then(texture => { parser.associations.set(texture, { textures: index }); return texture; });
        } }));
    }
    resolveLOD(id: string, lod: 0 | 1 | 2 | 3) {
        const meta = this.byId.get(id);
        return meta ? resolveModelLOD(meta, lod) : lod;
    }
    cacheKey(id: string, lod: 0 | 1 | 2 | 3) { return id + ':' + this.resolveLOD(id, lod); }
    private referenceKey(key: string) {
        const split = key.lastIndexOf(':'), level = key.slice(split + 1);
        return /^[0-3]$/.test(level) ? this.cacheKey(key.slice(0, split), +level as 0 | 1 | 2 | 3) : key;
    }
    async init(onProgress: (n: number, label: string) => void) {
        const res = await fetch(assetUrl('/models/catalog.json?v=5.0-edition12'), { signal: this.abortController.signal });
        if (!res.ok)
            throw new Error('Model catalog unavailable');
        const cat = await res.json() as {
            assets: AssetMeta[];
        };
        const traffic = await fetch(assetUrl('/models/traffic-catalog.json'), { signal: this.abortController.signal });
        if (!traffic.ok)
            throw new Error('Traffic catalog unavailable');
        cat.assets.push(...(await traffic.json() as {
            assets: AssetMeta[];
        }).assets);
        for (const a of cat.assets)
            this.byId.set(a.id, a);
        // Registration and the hangar need the aircraft and native airport props.
        // Coastal structures are loaded by FlightStream.prepare before takeoff.
        const initial = ['cessna_skyhawk', 'airport_control_tower', 'airport_windsock_gimbal'].filter(id => this.byId.has(id));
        let done = 0;
        onProgress(.04, '정밀 충돌 지도와 네이티브 동작 준비');
        await this.ensureProxies(initial);
        onProgress(.20, '충돌 형상 준비');
        await Promise.all(initial.map(async (id) => { try {
            await this.load(id, id === 'cessna_skyhawk' ? 0 : compatibleModelLOD(this.byId.get(id)!, 2));
        }
        catch (error) {
            if (id === 'cessna_skyhawk')
                await this.load(id, 1);
            else if (this.disposed)
                throw error;
        } done++; onProgress(.2 + .8 * done / initial.length, id === 'cessna_skyhawk' ? 'Skyhawk 정비 중' : '공항과 해안 준비'); }));
    }
    async ensureProxies(ids: string[]) {
        const wanted = [...new Set(ids)].filter(id => this.byId.get(id)?.proxy); let cursor = 0;
        await Promise.all(Array.from({ length: Math.min(6, wanted.length) }, async () => { while (cursor < wanted.length) await this.loadProxy(wanted[cursor++]); }));
    }
    async loadProxy(id: string) {
        if (this.disposed) throw new Error('Model library has been disposed');
        this.proxyLastUsed.set(id, performance.now());
        if (this.proxies.has(id)) return;
        const pending = this.proxyPending.get(id); if (pending) return pending;
        const previous = this.proxyFailures.get(id); if (previous && performance.now() < previous.retryAt) throw new Error(previous.message);
        const path = this.byId.get(id)?.proxy; if (!path) return;
        const job = (async () => {
            try {
                let bytes = await this.download(path, id); if (bytes[0] === 31 && bytes[1] === 139) bytes = gunzipSync(bytes);
                const proxy = JSON.parse(new TextDecoder().decode(bytes)) as ProxyData;
                if (proxy.id !== id || !Array.isArray(proxy.static) || !Array.isArray(proxy.dynamic)) throw new Error('Invalid collision rig · ' + id);
                if (!this.disposed) this.proxies.set(id, proxy); this.proxyFailures.delete(id);
            }
            catch (error) { if (!this.disposed) this.proxyFailures.set(id, assetFailure(error, this.proxyFailures.get(id), 2500)); throw error; }
            finally { this.proxyPending.delete(id); }
        })();
        this.proxyPending.set(id, job); return job;
    }
    ready(id: string, lod?: 0 | 1 | 2 | 3) { return !!(lod === 0 ? this.cache.get(this.cacheKey(id, 0)) : this.peek(id)) && (!this.byId.get(id)?.proxy || this.proxies.has(id)); }
    trimProxies(wanted: Set<string>, max = 80) {
        const removable = [...this.proxies.keys()].filter(id => !wanted.has(id)).sort((a, b) => (this.proxyLastUsed.get(a) ?? 0) - (this.proxyLastUsed.get(b) ?? 0));
        for (const id of removable) { if (this.proxies.size <= max) break; this.proxies.delete(id); this.proxyLastUsed.delete(id); }
    }
    async load(id: string, lod: 0 | 1 | 2 | 3 = 2, priority = 1): Promise<GLTF> {
        if (this.disposed)
            throw new Error('Model library has been disposed');
        const meta = this.byId.get(id);
        if (!meta)
            throw new Error('Unknown model ' + id);
        lod = this.resolveLOD(id, lod);
        const key = this.cacheKey(id, lod);
        const cached = this.cache.get(key);
        this.lastUsed.set(key, performance.now());
        if (cached)
            return cached;
        const existing = this.pending.get(key);
        if (existing) {
            const queued = this.jobs.find(job => job.key === key);
            if (queued && priority < queued.priority) { queued.priority = priority; this.jobs.sort((a, b) => a.priority - b.priority); }
            this.pump();
            return existing;
        }
        const failure = this.failures.get(key);
        if (failure && performance.now() < failure.retryAt)
            throw new Error(failure.message);
        const path = (lod === 0 ? meta.exports.lod0 : lod === 1 ? meta.exports.lod1 : lod === 3 ? meta.exports.lod3 : meta.exports.lod2) ?? meta.exports.lod1;
        const promise = new Promise<GLTF>((resolve, reject) => {
            const run = async () => {
                this.active++;
                try {
                    if (this.disposed)
                        throw new Error('Model library has been disposed');
                    let bytes = await this.download(path, id);
                    if (bytes[0] === 31 && bytes[1] === 139)
                        bytes = gunzipSync(bytes);
                    const gltf = await this.loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, '');
                    this.textures.adopt(gltf, meta.textureHashesByLod?.[('lod' + lod) as 'lod0' | 'lod1' | 'lod2' | 'lod3'] ?? meta.textureHashes);
                    this.setTextureAnisotropy(this.textureAnisotropy);
                    normalizeModelSurfaces(gltf.scene);
                    smoothAuditedStoneBasePalette(gltf.scene, id, true);
                    updateModelPose(gltf.scene);
                    fitCompactScenery(gltf.scene, id, meta.category, lod);
                    const registeredMaterials = new Set<THREE.Material>();
                    gltf.scene.traverse(node => {
                        if (node instanceof THREE.Mesh) {
                            node.castShadow = true;
                            node.receiveShadow = true;
                            node.frustumCulled = !(node as THREE.SkinnedMesh).isSkinnedMesh && !node.morphTargetInfluences?.length;
                            const materials = Array.isArray(node.material) ? node.material : [node.material];
                            for (const material of materials)
                                if (material instanceof THREE.MeshStandardMaterial && !registeredMaterials.has(material)) {
                                    registeredMaterials.add(material);
                                    material.envMapIntensity = .58;
                                    material.userData.baseRoughness = material.roughness;
                                    material.userData.baseMetalness = material.metalness;
                                    material.userData.baseEmissive = material.emissiveIntensity;
                                    material.userData.wettable = !/glass|glazing|water|foam|light|emissi/i.test(material.name);
                                    this.allMaterials.add(material);
                                    this.applyEnvironment(material);
                                }
                        }
                    });
                    if (this.disposed) {
                        gltf.scene.traverse(n => {
                            if (n instanceof THREE.Mesh) {
                                n.geometry.dispose();
                                for (const material of Array.isArray(n.material) ? n.material : [n.material]) {
                                    this.allMaterials.delete(material as THREE.MeshStandardMaterial);
                                    material.dispose();
                                }
                            }
                        });
                        this.textures.release(gltf);
                        reject(new Error('Disposed'));
                        return;
                    }
                    this.failures.delete(key);
                    this.failed.delete(id);
                    this.cache.set(key, gltf);
                    resolve(gltf);
                }
                catch (e) {
                    if (!this.disposed) {
                        this.failures.set(key, assetFailure(e, this.failures.get(key)));
                        this.failed.add(id);
                    }
                    reject(e);
                }
                finally {
                    this.active--;
                    this.pending.delete(key);
                    this.pump();
                }
            };
            if (this.active < (priority === 0 ? 4 : 3))
                void run();
            else
                this.jobs.push({ key, priority, run: () => void run() });
            this.jobs.sort((a, b) => a.priority - b.priority);
        });
        this.pending.set(key, promise);
        return promise;
    }
    pump() {
        while (this.active < 4 && this.jobs.length) {
            const index = this.active < 3 ? 0 : this.jobs.findIndex(job => job.priority === 0);
            if (index < 0) break;
            this.jobs.splice(index, 1)[0].run();
        }
    }
    canRequest(id: string, lod: 0 | 1 | 2 | 3 = 2) { const failure = this.failures.get(this.cacheKey(id, lod)); return !this.disposed && (!failure || performance.now() >= failure.retryAt); }
    canRequestProxy(id: string) { const failure = this.proxyFailures.get(id); return !this.disposed && (!failure || performance.now() >= failure.retryAt); }
    retry(id?: string) {
        for (const key of this.proxyFailures.keys()) if (!id || id === key) this.proxyFailures.delete(key);
        for (const key of this.failures.keys())
            if (!id || key.startsWith(id + ':'))
                this.failures.delete(key);
        if (id)
            this.failed.delete(id);
        else
            this.failed.clear();
    }
    async download(path: string, id: string) {
        const controller = new AbortController(), abort = () => controller.abort();
        this.abortController.signal.addEventListener('abort', abort, { once: true });
        if (this.abortController.signal.aborted)
            abort();
        const bytes = Object.entries(this.byId.get(id)?.exports ?? {}).find(([, value]) => value === path)?.[0];
        const size = bytes ? (this.byId.get(id) as AssetMeta & { geometry?: Record<string, { bytes?: number }> })?.geometry?.[bytes]?.bytes ?? 0 : 0;
        const timer = setTimeout(abort, Math.min(90000, 22000 + Math.ceil(size / 1e6) * 3500));
        try {
            const response = await fetch(assetUrl(path) + (path.includes('?') ? '&' : '?') + 'rev=5.0-edition12', { signal: controller.signal });
            if (!response.ok)
                throw new AssetRequestError('HTTP ' + response.status + ' · ' + id, response.status === 408 || response.status === 429 || response.status >= 500);
            const data = new Uint8Array(await response.arrayBuffer());
            // Some hosts send their SPA/login page with status 200 for a missing
            // asset. Report the real response instead of opaque GLTF/JSON errors.
            if (!data.length) throw new AssetRequestError('Empty model response · ' + id);
            const start = new TextDecoder().decode(data.subarray(0, 128)).trimStart();
            if (start.startsWith('<')) throw new AssetRequestError('Expected a model file, received an HTML page · ' + id, false);
            return data;
        }
        catch (error) {
            if (controller.signal.aborted && !this.disposed)
                throw new Error('Model request timed out · ' + id);
            throw error;
        }
        finally {
            clearTimeout(timer);
            this.abortController.signal.removeEventListener('abort', abort);
        }
    }
    peek(id: string, lod: 0 | 1 | 2 | 3 = 2) { return this.cache.get(this.cacheKey(id, lod)) ?? this.cache.get(this.cacheKey(id, 0)) ?? this.cache.get(this.cacheKey(id, 2)) ?? this.cache.get(this.cacheKey(id, 1)) ?? this.cache.get(this.cacheKey(id, 3)); }
    availableLOD(id: string, preferred: 0 | 1 | 2 | 3): 0 | 1 | 2 | 3 | null {
        const meta = this.byId.get(id); if (!meta) return null;
        return ([this.resolveLOD(id, preferred), compatibleModelLOD(meta, 1), compatibleModelLOD(meta, 2), compatibleModelLOD(meta, 3), this.resolveLOD(id, 0)] as const).find(lod => this.cache.has(this.cacheKey(id, lod))) ?? null;
    }
    setTextureAnisotropy(value: number) {
        this.textureAnisotropy = Math.max(1, value);
        for (const { texture } of this.textures.entries.values()) if (texture.anisotropy !== this.textureAnisotropy) {
            texture.anisotropy = this.textureAnisotropy;
            texture.needsUpdate = true;
        }
    }
    async instance(id: string, lod: 0 | 1 | 2 | 3 = 1, uniqueMaterials = false): Promise<ModelInstance> {
        lod = this.resolveLOD(id, lod);
        const cacheKey = this.cacheKey(id, lod);
        // Protect the cached buffers before yielding: a world trim can run between
        // load() resolving and this continuation cloning its scene.
        this.retain(cacheKey);
        let gltf: GLTF;
        try { gltf = await this.load(id, lod); if (this.disposed) throw new Error('Model library has been disposed'); }
        catch (error) { this.release(cacheKey); throw error; }
        let disposed = false;
        const ownedGeometry: THREE.BufferGeometry[] = [];
        const root = new THREE.Group(), model = skeletonClone(gltf.scene), mixer = new THREE.AnimationMixer(model), actions = new Map<string, THREE.AnimationAction>(), materials: THREE.MeshStandardMaterial[] = [];
        root.add(model);
        model.traverse(node => {
            if (node instanceof THREE.Mesh) {
                if (uniqueMaterials && ((Array.isArray(node.material) ? node.material : [node.material]).some(m => (/paint/i.test(m.name) || m.name === 'E12_SHARED_SURFACE')))) {
                    node.geometry = node.geometry.clone();
                    ownedGeometry.push(node.geometry);
                }
                if (uniqueMaterials) {
                    node.material = Array.isArray(node.material) ? node.material.map(m => m.clone()) : node.material.clone();
                }
                for (const m of (Array.isArray(node.material) ? node.material : [node.material]))
                    if (m instanceof THREE.MeshStandardMaterial) {
                        materials.push(m);
                        if (uniqueMaterials) {
                            this.allMaterials.add(m);
                            this.applyEnvironment(m);
                        }
                    }
            }
        });
        const meta = this.byId.get(id)!;
        for (const clip of gltf.animations) {
            const action = mixer.clipAction(clip);
            actions.set(clip.name, action);
            const spec = meta.animations.find(a => a.name === clip.name);
            if (spec?.autoplay)
                action.play();
        }
        return { lod, root, model, mixer, actions, meta, materials: [...new Set(materials)], dispose: () => {
                if (disposed) return; disposed = true;
                this.release(cacheKey);
                for (const g of ownedGeometry)
                    g.dispose();
                mixer.stopAllAction();
                mixer.uncacheRoot(model);
                const skeletons = new Set<THREE.Skeleton>();
                model.traverse(node => { if ((node as THREE.SkinnedMesh).isSkinnedMesh) skeletons.add((node as THREE.SkinnedMesh).skeleton); });
                for (const skeleton of skeletons) skeleton.dispose();
                if (uniqueMaterials)
                    for (const m of new Set(materials)) {
                        this.allMaterials.delete(m);
                        m.dispose();
                    }
                root.removeFromParent();
            } };
    }
    prepareAnimation(id: string, lod: 0 | 1 | 2 | 3): Promise<RigidPlan> {
        if (this.disposed) return Promise.reject(new Error('Model library has been disposed'));
        lod = this.resolveLOD(id, lod);
        const key = this.cacheKey(id, lod), pending = this.animationPending.get(key); if (pending) return pending;
        this.retain(key);
        const promise = (async () => {
            try {
                const gltf = await this.load(id, lod);
                if (this.disposed) throw new Error('Model library has been disposed');
                const plan = await prepareRigidPlan(gltf.scene, gltf.animations);
                if (!this.disposed && !this.animationDraws.has(key)) {
                    const autoplay = new Set(this.byId.get(id)!.animations.filter(clip => clip.autoplay).map(clip => clip.name));
                    this.animationDraws.set(key, measureAnimationDraws(gltf.scene, gltf.animations.filter(clip => autoplay.has(clip.name)), plan));
                }
                return plan;
            } finally { this.release(key); this.animationPending.delete(key); }
        })();
        this.animationPending.set(key, promise); return promise;
    }
    retain(key: string) { key = this.referenceKey(key); this.references.set(key, (this.references.get(key) ?? 0) + 1); }
    release(key: string) { key = this.referenceKey(key); this.references.set(key, Math.max(0, (this.references.get(key) ?? 0) - 1)); }
    geometryBytes(gltf: GLTF) {
        const cached = this.geometrySizes.get(gltf); if (cached !== undefined) return cached;
        const buffers = new Set<ArrayBufferLike>();
        gltf.scene.traverse(node => { if (node instanceof THREE.Mesh) {
            for (const a of [...Object.values(node.geometry.attributes), ...Object.values(node.geometry.morphAttributes).flat(), node.geometry.index]) if (a) buffers.add(a.array.buffer);
        } });
        const bytes = [...buffers].reduce((sum, buffer) => sum + buffer.byteLength, 0);
        this.geometrySizes.set(gltf, bytes); return bytes;
    }
    trim(max = 52) {
        let bytes = [...this.cache.values()].reduce((sum, gltf) => sum + this.geometryBytes(gltf), 0);
        const removable = [...this.cache.keys()].filter(key => !this.references.get(key)).sort((a, b) => (this.lastUsed.get(a) ?? 0) - (this.lastUsed.get(b) ?? 0));
        for (const key of removable) {
            if (this.cache.size <= max && bytes <= this.geometryBudget)
                break;
            const gltf = this.cache.get(key)!;
            bytes -= this.geometryBytes(gltf);
            releaseRigidPlan(gltf.scene); this.animationDraws.delete(key);
            const geometry = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
            gltf.scene.traverse(n => {
                if (n instanceof THREE.Mesh) {
                    geometry.add(n.geometry);
                    for (const m of Array.isArray(n.material) ? n.material : [n.material])
                        materials.add(m);
                }
            });
            for (const g of geometry)
                g.dispose();
            for (const m of materials) {
                this.allMaterials.delete(m as THREE.MeshStandardMaterial);
                m.dispose();
            }
            this.textures.release(gltf);
            this.cache.delete(key);
            this.lastUsed.delete(key);
            this.references.delete(key);
        }
    }
    environment(wet: number, night: number) {
        if (Math.abs(wet - this.wet) < .025 && Math.abs(night - this.night) < .03)
            return;
        this.wet = wet;
        this.night = night;
        for (const m of this.allMaterials) this.applyEnvironment(m);
    }
    private applyEnvironment(material: THREE.MeshStandardMaterial) {
        const rough = material.userData.baseRoughness ?? material.roughness;
        material.roughness = material.userData.wettable ? THREE.MathUtils.lerp(rough, Math.min(.2, rough), this.wet * .75) : rough;
        const emissive = material.userData.baseEmissive ?? material.emissiveIntensity;
        material.emissiveIntensity = material.emissive.getHex() ? emissive * (.8 + this.night * 2) : emissive;
    }
    dispose() {
        this.disposed = true;
        this.abortController.abort();
        for (const gltf of this.cache.values()) {
            releaseRigidPlan(gltf.scene);
            gltf.scene.traverse(n => {
                if (n instanceof THREE.Mesh)
                    n.geometry.dispose();
            });
        }
        for (const m of this.allMaterials)
            m.dispose();
        this.textures.dispose();
        this.atlasLoads.clear();
        this.proxies.clear(); this.proxyLastUsed.clear();
        this.cache.clear();
        this.animationDraws.clear();
        this.allMaterials.clear();
    }
}
/** Resolve the actual resting silhouette after the authored taildragger pitch. */
export function parkAircraft(instance: ModelInstance) {
    instance.model.rotation.x = instance.meta.groundRotationX ?? 0;
    instance.model.position.y = 0;
    updateModelPose(instance.root);
    const inverse = instance.root.matrixWorld.clone().invert(), point = new THREE.Vector3();
    let lowest = Infinity;
    instance.model.traverse(node => {
        if (!(node instanceof THREE.Mesh) || !node.visible) return;
        const positions = node.geometry.getAttribute('position'), matrix = inverse.clone().multiply(node.matrixWorld);
        for (let i = 0; i < positions.count; i++) {
            node.getVertexPosition(i, point).applyMatrix4(matrix);
            lowest = Math.min(lowest, point.y);
        }
    });
    instance.parkedOffsetY = Number.isFinite(lowest) ? -lowest : instance.meta.groundOffsetY ?? 0;
    instance.model.position.y = instance.parkedOffsetY;
    updateModelPose(instance.root);
    return instance.parkedOffsetY;
}
export function poseAircraft(instance: ModelInstance, time: number, x: number, y: number, parked = false, gear = 0) {
    for (const [name, action] of instance.actions) {
        if (name.includes('gear') && name.includes('retract')) { action.play(); action.paused = true; action.setEffectiveWeight(1); action.time = action.getClip().duration * THREE.MathUtils.clamp(gear, 0, .99999); }
        else if (name.includes('deflect')) {
            action.play();
            action.paused = true;
            action.setEffectiveWeight(1);
            const duration = action.getClip().duration;
            const direction = name.includes('aileron') ? (name.includes('left') ? x : -x) : name.includes('rudder') ? x : y;
            action.time = duration * (.5 - .25 * THREE.MathUtils.clamp(direction, -1, 1));
        }
    }
    instance.mixer.update(0);
    for (const [name, action] of instance.actions)
        if (name.includes('spin'))
            action.timeScale = parked ? .15 : 1;
    instance.mixer.update(time);
}
