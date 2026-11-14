import * as T from 'three';
import { AIRCRAFT, DEFAULT_SETTINGS, THEMES, WORLD_IMAGE_REVISION } from './data';
import { inspectionPoints, inspectionRadius } from './inspection';
import { ModelLibrary, parkAircraft, type ModelInstance } from './assets';
import { FlightSimulation } from './simulation';
import { WorldView } from './world-view';
import { createSky, createWater } from './shaders';
import { cloudField } from './terrain';
import { EnvironmentFX } from './environment-fx';
import type { ThemeId } from './types';
export const PREVIEW_CACHE_PREFIX = 'preview:' + WORLD_IMAGE_REVISION + ':';
const PREVIEW_VERSION = WORLD_IMAGE_REVISION;
const MAX_JPEG_BYTES = 240000;
const THEME_IDS = new Set(THEMES.map(theme => theme.id));
const HEROES: Record<ThemeId, string> = {
    coast: 'lighthouse', village: 'windmill', city: 'skyscraper', ice: 'ice_arch',
    desert: 'natural_arch', forest: 'large_dam', farm: 'red_barn', korea: 'seoul_tower',
    river: 'river_lock', landmark: 'cliffside_castle', aurora: 'polar_lighthouse',
    volcano: 'rocky_arch', waterfall: 'waterfall_cliff',
};
const KOREAN_HEROES = ['seoul_tower', 'palace_wall_pavilion', 'traditional_pavilion', 'gwangan_bridge'];
export interface PreviewRecord {
    version: typeof PREVIEW_VERSION;
    id: string;
    source: 'three-rendered-staged-scene';
    image: string;
    width: number;
    height: number;
    createdAt: number;
}
export type PreviewOutcome = {
    id: string;
    status: 'captured' | 'cached';
    record: PreviewRecord;
} | {
    id: string;
    status: 'error' | 'cancelled';
    reason: string;
    retry: boolean;
};
function validPreviewId(id: string) {
    return /^(?:aircraft|model):[a-z0-9_]{1,80}$/.test(id) || /^theme:[a-z_]{1,30}(?::[0-3])?$/.test(id);
}
export function previewCacheKey(id: string) {
    if (!validPreviewId(id))
        throw new Error('Invalid preview identifier');
    return PREVIEW_CACHE_PREFIX + id;
}
/** Parse actual JPEG frame dimensions, not merely a data-URL prefix. */
export function jpegPreviewDimensions(image: unknown): {
    width: number;
    height: number;
} | null {
    if (typeof image !== 'string' || !image.startsWith('data:image/jpeg;base64,') || image.length > MAX_JPEG_BYTES * 4 / 3 + 100)
        return null;
    const encoded = image.slice('data:image/jpeg;base64,'.length);
    if (!encoded || encoded.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))
        return null;
    let bytes: Uint8Array;
    try {
        bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
    }
    catch {
        return null;
    }
    if (bytes.length < 200 || bytes.length > MAX_JPEG_BYTES || bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217)
        return null;
    let offset = 2, dimensions: {
        width: number;
        height: number;
    } | null = null;
    while (offset < bytes.length - 2) {
        if (bytes[offset++] !== 255)
            return null;
        while (bytes[offset] === 255)
            offset++;
        const marker = bytes[offset++];
        if (marker === 217)
            return null;
        if (marker === 1 || marker >= 208 && marker <= 215)
            continue;
        if (offset + 2 > bytes.length)
            return null;
        const length = bytes[offset] * 256 + bytes[offset + 1];
        if (length < 2 || offset + length > bytes.length)
            return null;
        if ([192, 193, 194].includes(marker)) {
            if (length < 8 || bytes[offset + 2] !== 8)
                return null;
            dimensions = { height: bytes[offset + 3] * 256 + bytes[offset + 4], width: bytes[offset + 5] * 256 + bytes[offset + 6] };
        }
        if (marker === 218)
            return dimensions;
        offset += length;
    }
    return null;
}
export function validPreviewRecord(value: unknown, expectedId?: string): value is PreviewRecord {
    if (!value || typeof value !== 'object')
        return false;
    const record = value as Partial<PreviewRecord>;
    if (record.version !== PREVIEW_VERSION || record.source !== 'three-rendered-staged-scene' ||
        typeof record.id !== 'string' || !validPreviewId(record.id) || expectedId && record.id !== expectedId ||
        !Number.isFinite(record.createdAt) || (record.createdAt ?? 0) <= 0 || (record.createdAt ?? 0) > Date.now() + 60000)
        return false;
    const frame = jpegPreviewDimensions(record.image);
    return !!frame && frame.width >= 160 && frame.width <= 640 && frame.height >= 90 && frame.height <= 360 &&
        frame.width * 9 === frame.height * 16 && frame.width === record.width && frame.height === record.height;
}
let cacheDatabase: Promise<IDBDatabase> | null = null;
function previewDatabase() {
    if (typeof indexedDB === 'undefined')
        return Promise.reject<IDBDatabase>(new Error('Preview storage unavailable'));
    if (!cacheDatabase)
        cacheDatabase = new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('voxel-airrun');
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains('pilot'))
                    request.result.createObjectStore('pilot');
            };
            request.onsuccess = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains('pilot')) {
                    db.close();
                    cacheDatabase = null;
                    reject(new Error('Preview object store unavailable'));
                    return;
                }
                db.onversionchange = () => { db.close(); cacheDatabase = null; };
                resolve(db);
            };
            request.onerror = () => { cacheDatabase = null; reject(request.error); };
            request.onblocked = () => { cacheDatabase = null; reject(new Error('Preview storage blocked')); };
        });
    return cacheDatabase;
}
export async function readPreviewRecord(id: string): Promise<PreviewRecord | null> {
    const key = previewCacheKey(id);
    try {
        const db = await previewDatabase();
        const value = await new Promise<unknown>((resolve, reject) => {
            const request = db.transaction('pilot', 'readonly').objectStore('pilot').get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        return validPreviewRecord(value, id) ? value : null;
    }
    catch {
        return null;
    }
}
export async function writePreviewRecord(record: PreviewRecord): Promise<boolean> {
    if (!validPreviewRecord(record))
        return false;
    try {
        const db = await previewDatabase();
        await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction('pilot', 'readwrite');
            transaction.objectStore('pilot').put(record, previewCacheKey(record.id));
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
        });
        return true;
    }
    catch {
        return false;
    }
}
/** Deletes this preview namespace only; pilot save/backup keys are untouched. */
export async function clearPreviewCache(): Promise<void> {
    try {
        const db = await previewDatabase();
        await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction('pilot', 'readwrite');
            const cursor = transaction.objectStore('pilot').openCursor();
            cursor.onsuccess = () => {
                const entry = cursor.result;
                if (!entry)
                    return;
                if (String(entry.key).startsWith(PREVIEW_CACHE_PREFIX))
                    entry.delete();
                entry.continue();
            };
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
        });
    }
    catch { /* Storage is optional; captured frames remain usable in memory. */ }
}
interface StagedShot {
    scene: T.Scene;
    camera: T.PerspectiveCamera;
    clear: T.Color;
    dispose: () => void;
}
interface ShotJob {
    id: string;
    kind: 'aircraft' | 'theme' | 'model';
    model?: string;
    theme?: ThemeId;
    variant?: number;
    promise: Promise<PreviewOutcome>;
    resolve: (outcome: PreviewOutcome) => void;
    done: boolean;
}
/** Gameplay uses OutputPass; the staged direct-canvas materials need its output chunks. */
function directShaderOutput(material: T.ShaderMaterial) {
    material.fragmentShader = material.fragmentShader.replace(/}\s*$/, '\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}');
    material.toneMapped = true;
}
function stageLighting(scene: T.Scene, target: T.Vector3, night = false) {
    const key = new T.DirectionalLight(night ? '#9cb9de' : '#fff0d7', night ? .45 : 2.05);
    key.position.copy(target).add(new T.Vector3(-75, 120, -60));
    key.target.position.copy(target);
    key.castShadow = true;
    key.shadow.mapSize.set(512, 512);
    Object.assign(key.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 1, far: 320 });
    key.shadow.normalBias = .12;
    key.shadow.bias = -.00015;
    const fill = new T.HemisphereLight(night ? '#819bbc' : '#bed4e3', '#4e5145', night ? .38 : .72);
    scene.add(key, key.target, fill);
    return () => { key.shadow.dispose(); key.removeFromParent(); key.target.removeFromParent(); fill.removeFromParent(); };
}
/** CPU preparation only: rendering/capture occurs exclusively in tick(). */
export async function prepareAircraftPreviewScene(library: ModelLibrary, modelId: string, environment: T.Texture | null, stale: () => boolean = () => false, lod: 0 | 1 = 0): Promise<StagedShot> {
    let instance: ModelInstance | null = null;
    const scene = new T.Scene();
    scene.background = new T.Color('#283842');
    scene.environment = environment;
    const floorGeometry = new T.BoxGeometry(58, .2, 46);
    const floorMaterial = new T.MeshStandardMaterial({ color: '#283339', roughness: .9, metalness: .08 });
    const floor = new T.Mesh(floorGeometry, floorMaterial);
    floor.position.y = -.1;
    floor.receiveShadow = true;
    scene.add(floor);
    let removeLights = () => { };
    const cleanup = () => { instance?.dispose(); floorGeometry.dispose(); floorMaterial.dispose(); removeLights(); scene.clear(); };
    try {
        instance = await library.instance(modelId, library.byId.get(modelId)?.exports.lod0 ? lod : 1);
        if (stale())
            throw new Error('Stale preview request');
        scene.add(instance.root);
        parkAircraft(instance);
        instance.root.position.y = .12;
        instance.mixer.setTime(.20);
        scene.updateMatrixWorld(true);
        const box = new T.Box3().setFromObject(instance.root, true), center = box.getCenter(new T.Vector3());
        const camera = new T.PerspectiveCamera(36, 16 / 9, .1, 10000), direction = new T.Vector3(.9, .55, -1.2).normalize();
        const points = inspectionPoints(instance.root);
        const localCenter = center.clone();
        localCenter.y -= instance.root.position.y;
        const distance = inspectionRadius(points, localCenter, direction, camera.aspect, .84, .90, camera.fov);
        camera.position.copy(center).addScaledVector(direction, distance);
        camera.lookAt(center);
        camera.updateMatrixWorld(true);
        removeLights = stageLighting(scene, center);
        return { scene, camera, clear: scene.background, dispose: cleanup };
    }
    catch (error) {
        cleanup();
        throw error;
    }
}
/** Isolated internal simulation; no store, achievements, rewards or save calls. */
export async function prepareThemePreviewScene(library: ModelLibrary, themeId: ThemeId, variant: number, environment: T.Texture | null, stale: () => boolean = () => false): Promise<StagedShot> {
    const theme = THEMES.find(item => item.id === themeId);
    if (!theme)
        throw new Error('Unknown preview theme');
    const scene = new T.Scene(), world = new WorldView(scene, library), night = themeId === 'aurora';
    scene.environment = environment;
    const sky = createSky(), water = createWater(), clouds = cloudField(9173 + variant * 131);
    const effectsRoot = new T.Group(), effects = new EnvironmentFX(effectsRoot, library.byId);
    directShaderOutput(sky.material);
    directShaderOutput(water.material);
    directShaderOutput(effects.ash.material);
    directShaderOutput(effects.spray.material);
    directShaderOutput(effects.steam.material);
    const clear = new T.Color(night ? '#17243b' : theme.sky);
    scene.background = clear;
    scene.fog = new T.FogExp2(clear, night ? .00075 : .00055);
    scene.add(sky.mesh, clouds.mesh, effectsRoot);
    if (theme.water && !(themeId === 'korea' && (variant === 1 || variant === 2)))
        scene.add(water.mesh);
    let hero: ModelInstance | null = null, removeLights = () => { }, disposed = false;
    const cleanup = () => {
        if (disposed)
            return;
        disposed = true;
        hero?.dispose();
        world.dispose();
        removeLights();
        sky.mesh.geometry.dispose();
        sky.material.dispose();
        water.mesh.geometry.dispose();
        water.material.dispose();
        clouds.dispose();
        effects.dispose();
        scene.clear();
    };
    try {
        const seed = 14093 + THEMES.findIndex(item => item.id === themeId) * 911 + variant * 311;
        const sim = new FlightSimulation({ id: 'preview-only', seed, plane: 'skyhawk', level: 1,
            practice: { theme: themeId, variant, night, weather: 'clear', plane: 'skyhawk', level: 1 },
            settings: { ...DEFAULT_SETTINGS, quality: 'balanced' }, catalog: library.byId, proxies: library.proxies });
        sim.z = 350;
        sim.time = 24;
        sim.motionTime = 24;
        sim.generate();
        sim.weather = sim.weatherController.get(24, 0, themeId, seed, sim.config.practice!);
        if (stale())
            throw new Error('Stale preview request');
        // A downloaded GLB is not yet a drawable scene: wait for native
        // animation preparation, static batches and terrain workers as well.
        await world.prepare(sim, 'balanced');
        if (stale())
            throw new Error('Stale preview request');
        const missing = world.modelPlacements.filter(placement => !library.peek(placement.model));
        if (missing.length || world.pending.size)
            throw new Error('Scenery models are not ready; retry the preview');
        const heroId = themeId === 'korea' ? KOREAN_HEROES[variant] ?? HEROES.korea : HEROES[themeId];
        hero = await library.instance(heroId, 1);
        if (stale())
            throw new Error('Stale preview request');
        // A staged native landmark gives small cards a readable focal point.
        const heroScale = themeId === 'city' || themeId === 'korea' && variant === 0 ? .9 : 1.65;
        hero.root.scale.setScalar(heroScale);
        hero.root.position.set(25, -hero.meta.bounds.min[1] * heroScale + .5, -130);
        hero.mixer.setTime(sim.motionTime);
        scene.add(hero.root);
        const height = hero.meta.bounds.size[1] * heroScale, camera = new T.PerspectiveCamera(57, 16 / 9, .5, 1900);
        camera.position.set(-52, Math.min(85, 28 + height * .28), 48);
        camera.lookAt(22, Math.min(55, 7 + height * .38), -180);
        camera.updateMatrixWorld(true);
        sky.mesh.position.copy(camera.position);
        sky.uniforms.uTime.value = sim.motionTime;
        sky.uniforms.uNight.value = night ? 1 : 0;
        sky.uniforms.uCloud.value = themeId === 'volcano' ? .5 : .15;
        sky.uniforms.uAurora.value = night ? 1 : 0;
        sky.uniforms.uSky.value.copy(clear);
        water.mesh.position.set(0, .13, -390);
        water.uniforms.uTime.value = sim.motionTime;
        water.uniforms.uNight.value = night ? 1 : 0;
        water.uniforms.uCamera.value.copy(camera.position);
        water.uniforms.uFog.value.copy(clear);
        water.uniforms.uVolcano.value = themeId === 'volcano' ? 1 : 0;
        clouds.update(sim.motionTime, themeId === 'volcano' ? .55 : .12, night ? 1 : 0, sim.z);
        effects.update(sim, [...world.modelPlacements, { model: heroId, x: 25, y: hero.root.position.y, z: sim.z + 130,
                sx: heroScale, sy: heroScale, sz: heroScale, yaw: 0, collision: false, role: 'preview landmark' }]);
        removeLights = stageLighting(scene, new T.Vector3(15, 15, -120), night);
        scene.updateMatrixWorld(true);
        return { scene, camera, clear, dispose: cleanup };
    }
    catch (error) {
        cleanup();
        throw error;
    }
}
/**
 * One actual GPU canvas shot per idle/lobby frame; call tick BEFORE the main
 * scene is repainted in the same RAF. No canvas resize, second WebGL context,
 * float-target readback, generated illustration or CPU-projected substitute.
 */
export class ThumbnailStudio {
    private jobs: ShotJob[] = [];
    private requests = new Map<string, ShotJob>();
    private active: ShotJob | null = null;
    private ready: {
        job: ShotJob;
        shot: StagedShot;
    } | null = null;
    private generation = 0;
    private disposed = false;
    private lastCapture = -Infinity;
    private canvas: HTMLCanvasElement | null = null;
    private memory = new Map<string, PreviewRecord>();
    constructor(private renderer: T.WebGLRenderer, private library: ModelLibrary, private environment: T.Texture | null, private onCapture: (outcome: PreviewOutcome) => void) { }
    requestAircraft(planeIdOrModelId: string): Promise<PreviewOutcome> {
        const plane = AIRCRAFT.find(item => item.id === planeIdOrModelId || item.model === planeIdOrModelId);
        if (!plane)
            return Promise.resolve({ id: 'aircraft:' + planeIdOrModelId, status: 'error', reason: 'Unknown aircraft', retry: false });
        return this.request('aircraft:' + plane.id, 'aircraft', plane.model);
    }
    requestModel(modelId: string): Promise<PreviewOutcome> {
        return this.request('model:' + modelId, 'model', modelId);
    }
    requestTheme(theme: ThemeId, variant?: number): Promise<PreviewOutcome> {
        if (!THEME_IDS.has(theme) || variant !== undefined && (!Number.isInteger(variant) || variant < 0 || variant > 3 || theme !== 'korea' && variant !== 0))
            return Promise.resolve({ id: 'theme:' + theme, status: 'error', reason: 'Unknown theme variant', retry: false });
        const id = 'theme:' + theme + (theme === 'korea' && variant !== undefined ? ':' + variant : '');
        return this.request(id, 'theme', undefined, theme, variant ?? 0);
    }
    private request(id: string, kind: ShotJob['kind'], model?: string, theme?: ThemeId, variant?: number) {
        if (this.disposed)
            return Promise.resolve<PreviewOutcome>({ id, status: 'cancelled', reason: 'Preview studio disposed', retry: false });
        const existing = this.requests.get(id);
        if (existing)
            return existing.promise;
        const remembered = this.memory.get(id);
        if (remembered) {
            const outcome: PreviewOutcome = { id, status: 'cached', record: remembered };
            this.onCapture(outcome);
            return Promise.resolve(outcome);
        }
        let resolve!: (outcome: PreviewOutcome) => void;
        const promise = new Promise<PreviewOutcome>(done => { resolve = done; });
        const job = { id, kind, model, theme, variant, promise, resolve, done: false };
        this.requests.set(id, job);
        this.jobs.push(job);
        return promise;
    }
    private finish(job: ShotJob, outcome: PreviewOutcome) {
        if (job.done)
            return;
        job.done = true;
        this.requests.delete(job.id);
        job.resolve(outcome);
        if (outcome.status === 'captured' || outcome.status === 'cached') {
            this.memory.set(job.id, outcome.record);
            if (this.memory.size > 32)
                this.memory.delete(this.memory.keys().next().value!);
        }
        this.onCapture(outcome);
    }
    private start(job: ShotJob) {
        this.active = job;
        const generation = this.generation, stale = () => this.disposed || this.generation !== generation || job.done;
        void (async () => {
            const cached = await readPreviewRecord(job.id);
            if (stale())
                return;
            if (cached) {
                this.finish(job, { id: job.id, status: 'cached', record: cached });
                this.active = null;
                return;
            }
            const shot = job.kind === 'model'
                ? await prepareAircraftPreviewScene(this.library, job.model!, this.environment, stale, 1)
                : job.kind === 'aircraft'
                ? await prepareAircraftPreviewScene(this.library, job.model!, this.environment, stale)
                : await prepareThemePreviewScene(this.library, job.theme!, job.variant!, this.environment, stale);
            if (stale()) {
                shot.dispose();
                return;
            }
            this.ready = { job, shot };
        })().catch(error => {
            if (!stale()) {
                this.finish(job, { id: job.id, status: 'error', reason: error instanceof Error ? error.message : 'Preview preparation failed', retry: true });
                this.active = null;
            }
        });
    }
    /** Keep only the currently selected and visible cards. A scrolled-away
     * native preview must not occupy the single preparation/capture slot. */
    retainRequests(ids: readonly string[]) {
        const wanted = new Set(ids), order = new Map([...wanted].map((id, i) => [id, i]));
        this.jobs = this.jobs.filter(job => {
            if (wanted.has(job.id)) return true;
            this.finish(job, { id: job.id, status: 'cancelled', reason: 'Preview card left the viewport', retry: true });
            return false;
        }).sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity));
        if (this.active && !wanted.has(this.active.id)) {
            this.generation++;
            this.ready?.shot.dispose(); this.ready = null;
            const job = this.active; this.active = null;
            this.finish(job, { id: job.id, status: 'cancelled', reason: 'Preview card left the viewport', retry: true });
        }
    }
    tick(inLobby: boolean, frameTime = performance.now(), allowWork = true): boolean {
        if (this.disposed)
            return false;
        if (!inLobby) {
            this.cancelPending('Returned to flight');
            return false;
        }
        // A canvas readback is deliberately kept out of input/drag frames.
        // Queued work remains pending and resumes after the user is idle.
        if (!allowWork) return false;
        if (this.ready && frameTime - this.lastCapture >= 600) {
            if (this.renderer.getRenderTarget() !== null)
                return false;
            const { job, shot } = this.ready;
            this.ready = null;
            this.active = null;
            this.lastCapture = frameTime;
            try {
                const record = this.capture(job.id, shot);
                this.finish(job, { id: job.id, status: 'captured', record });
                void writePreviewRecord(record);
            }
            catch (error) {
                this.finish(job, { id: job.id, status: 'error', reason: error instanceof Error ? error.message : 'Actual GPU preview unavailable', retry: true });
            }
            finally {
                shot.dispose();
                this.library.trim(52);
            }
            return true; // Repaint the main scene even if capture failed.
        }
        if (!this.active && this.jobs.length)
            this.start(this.jobs.shift()!);
        return false;
    }
    private capture(id: string, shot: StagedShot): PreviewRecord {
        const renderer = this.renderer;
        if (renderer.getContext().isContextLost())
            throw new Error('GPU context unavailable; retry after recovery');
        const size = renderer.getDrawingBufferSize(new T.Vector2());
        const blocks = Math.floor(Math.min(480, size.x, size.y * 16 / 9) / 16), width = blocks * 16, height = blocks * 9;
        if (width < 160)
            throw new Error('Viewport too small for a landscape preview');
        const viewport = renderer.getViewport(new T.Vector4()), scissor = renderer.getScissor(new T.Vector4());
        const scissorTest = renderer.getScissorTest(), target = renderer.getRenderTarget(), face = renderer.getActiveCubeFace(), mip = renderer.getActiveMipmapLevel();
        const clear = renderer.getClearColor(new T.Color()), alpha = renderer.getClearAlpha();
        const exposure = renderer.toneMappingExposure, toneMapping = renderer.toneMapping, output = renderer.outputColorSpace;
        const auto = [renderer.autoClear, renderer.autoClearColor, renderer.autoClearDepth, renderer.autoClearStencil], ratio = renderer.getPixelRatio();
        try {
            renderer.setRenderTarget(null);
            renderer.setViewport(0, 0, width / ratio, height / ratio);
            renderer.setScissor(0, 0, width / ratio, height / ratio);
            renderer.setScissorTest(true);
            renderer.setClearColor(shot.clear, 1);
            renderer.autoClear = true;
            renderer.autoClearColor = true;
            renderer.autoClearDepth = true;
            renderer.autoClearStencil = true;
            renderer.toneMapping = T.ACESFilmicToneMapping;
            renderer.toneMappingExposure = 1;
            renderer.outputColorSpace = T.SRGBColorSpace;
            shot.camera.aspect = width / height;
            shot.camera.updateProjectionMatrix();
            renderer.render(shot.scene, shot.camera);
            this.canvas ??= document.createElement('canvas');
            this.canvas.width = width;
            this.canvas.height = height;
            const context = this.canvas.getContext('2d', { alpha: false });
            if (!context)
                throw new Error('Image capture unavailable');
            // WebGL bottom-left viewport versus Canvas2D top-left source coordinates.
            context.drawImage(renderer.domElement, 0, size.y - height, width, height, 0, 0, width, height);
            const record: PreviewRecord = { version: PREVIEW_VERSION, id, source: 'three-rendered-staged-scene',
                image: this.canvas.toDataURL('image/jpeg', .82), width, height, createdAt: Date.now() };
            if (!validPreviewRecord(record, id))
                throw new Error('Captured JPEG did not pass validation');
            return record;
        }
        finally {
            renderer.toneMappingExposure = exposure;
            renderer.toneMapping = toneMapping;
            renderer.outputColorSpace = output;
            [renderer.autoClear, renderer.autoClearColor, renderer.autoClearDepth, renderer.autoClearStencil] = auto;
            renderer.setClearColor(clear, alpha);
            renderer.setRenderTarget(target, face, mip);
            renderer.setViewport(viewport);
            renderer.setScissor(scissor);
            renderer.setScissorTest(scissorTest);
        }
    }
    cancelPending(reason = 'Preview request superseded') {
        if (!this.requests.size && !this.active && !this.ready && !this.jobs.length) return;
        this.generation++;
        this.ready?.shot.dispose();
        this.ready = null;
        const jobs = [...this.requests.values()];
        this.jobs = [];
        this.active = null;
        for (const job of jobs)
            this.finish(job, { id: job.id, status: 'cancelled', reason, retry: !this.disposed });
    }
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.cancelPending('Preview studio disposed');
        this.canvas = null;
        this.memory.clear();
    }
}
