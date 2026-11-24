import { CourseBeacons } from './course-beacons';
import { personalRival } from './mastery';
import { projectGuidance, projectRingSight } from './guidance-projection';
import * as T from 'three';
import { isPaintMaterial, isPaintVertex } from './livery-surface';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { ModelLibrary, poseAircraft, parkAircraft, type ModelInstance } from './assets';
import { AirportView } from './airport';
import { WorldView } from './world-view';
import { FlightFX } from './fx';
import { ChapterInsignia } from './insignia';
import { GameAudio } from './audio';
import { obstacleContact } from './collision';
import { FlightSimulation } from './simulation';
import { TrickPlanner } from './trick-planner';
import { createSky, createWater, GradeShader } from './shaders';
import { cloudField } from './terrain';
import { useAirrun, input, releaseInput } from './state';
import { AIRCRAFT, THEMES, SKINS, WORLD_IMAGE_REVISION, smooth, damp, mix, clamp, hash } from './data';
import { GRAPHICS, requiresHeroSurface, compatibleModelLOD, renderPixelRatio, resolutionFloor, supportedSamples } from './graphics';
import { inspectionPoints, inspectionFit } from './inspection';
import { lightAt } from './weather';
import { skyHorizonColor, sunLightColor } from './atmosphere';
import { flightFraming } from './flight-framing';
import { ThumbnailStudio } from './previews';

/** Rectangle clipping, including scroll containers, governs thumbnail work. */
export function previewIntersects(rect: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom' | 'width' | 'height'>, clip: { left: number; right: number; top: number; bottom: number }) {
    return rect.width > 0 && rect.height > 0 && Math.min(rect.right, clip.right) > Math.max(rect.left, clip.left) && Math.min(rect.bottom, clip.bottom) > Math.max(rect.top, clip.top);
}
function previewVisible(element: HTMLElement) {
    const rect = element.getBoundingClientRect(), clip = { left: 0, right: innerWidth, top: 0, bottom: innerHeight };
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent), bounds = parent.getBoundingClientRect();
        if (/auto|scroll|hidden|clip/.test(style.overflowX)) { clip.left = Math.max(clip.left, bounds.left); clip.right = Math.min(clip.right, bounds.right); }
        if (/auto|scroll|hidden|clip/.test(style.overflowY)) { clip.top = Math.max(clip.top, bounds.top); clip.bottom = Math.min(clip.bottom, bounds.bottom); }
    }
    return previewIntersects(rect, clip);
}
import { DEPARTURE, takeoffDistance, readFlightPose, interpolateFlightPose, presentsFlight, airportVisible, type FlightPose } from './flight-presentation';
import type { Phase } from './types';
export class AirrunRenderer {
    insignia: ChapterInsignia | null = null;
    renderer: T.WebGLRenderer;
    scene = new T.Scene();
    camera = new T.PerspectiveCamera(55, 1, .25, 2000);
    library = new ModelLibrary();
    audio = new GameAudio();
    composer: EffectComposer;
    ao: GTAOPass;
    bloom: UnrealBloomPass;
    grade: ShaderPass;
    smaa: SMAAPass;
    sun: T.DirectionalLight;
    hemi: T.HemisphereLight;
    headlight: T.SpotLight;
    sky = createSky();
    water = createWater();
    clouds = cloudField(73119);
    airport: AirportView | null = null;
    world: WorldView | null = null;
    fx: FlightFX | null = null;
    plane: ModelInstance | null = null;
    planeId = '';
    planeRequest = '';
    planeLoad: Promise<void> | null = null;
    planeGeneration = 0;
    planeRoot = new T.Group();
    sim: FlightSimulation | null = null;
    beacons: CourseBeacons | null = null;
    trickPlanner = new TrickPlanner();
    hyperPreparing = false;
    hyperGeneration = 0;
    initialized = false;
    disposed = false;
    raf = 0;
    lastFrame = 0;
    presentationElapsed = 0;
    accumulator = 0;
    lastHUD = 0;
    lastCloud = -1;
    cloudClock: 'flight' | 'lobby' | '' = '';
    gearRetraction = 0;
    lastQuality = '';
    takeoffTime = 0;
    crashTime = 0;
    lastPhase: Phase = 'loading';
    lastRun = '';
    lastERequest = 0;
    lastBankRequest = 0;
    resumeTime = 0;
    lastCountdown = 0;
    frames = 0;
    fpsStart = 0;
    fps = 0;
    pixelScale = 1;
    fpsLowTime = 0;
    frameTimes: number[] = [];
    held = new Set<string>();
    cleanupListeners: (() => void)[] = [];
    pmrem: T.WebGLRenderTarget;
    lastSkin = '';
    lobbyFit: { key: string; fit: ReturnType<typeof inspectionFit> } | null = null;
    lastScreenshotKey = '';
    scrubSaving = false;
    modelLoading = false;
    inspectorActive = false;
    photoTimer = 0;
    studio: ThumbnailStudio | null = null;
    previewRequests = new Map<string, number>();
    lastFleetPreview = -Infinity;
    lastPreviewPanel = '';
    previewQuietUntil = 0;
    lastPreviewWork = -Infinity;
    lastRenderMilliseconds = 0;
    silhouette: T.Vector3[] = [];
    orbit = { yaw: .72, pitch: .25, zoom: 1, yawVelocity: 0, pitchVelocity: 0 };
    dragPoints = new Map<number, {
        x: number;
        y: number;
    }>();
    pinch = 0;
    selectionRetryAt = 0;
    warmGeneration = 0;
    preparing = false;
    streamResume = false;
    pauseAfterPreparation = false;
    fpsGoodTime = 0;
    takeoffCamera = new T.Vector3();
    previousPose: FlightPose | null = null;
    renderPose: FlightPose | null = null;
    flightLook = new T.Vector3();
    flightCameraReady = false;
    flightOffset: number = DEPARTURE.flightOffset;
    constructor(canvas: HTMLCanvasElement) {
        // The composer owns MSAA/SMAA. Multisampling its final full-screen blit
        // again adds cost without improving the rendered scene's edges.
        this.renderer = new T.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
        this.renderer.setPixelRatio(renderPixelRatio(useAirrun.getState().save.settings, window.devicePixelRatio));
        this.renderer.outputColorSpace = T.SRGBColorSpace;
        this.renderer.toneMapping = T.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = .98;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = T.PCFShadowMap;
        this.renderer.info.autoReset = false;
        this.scene.background = new T.Color('#b1cbd2');
        this.scene.fog = new T.FogExp2('#b1cbd2', .0008);
        this.scene.add(this.sky.mesh, this.water.mesh, this.clouds.mesh, this.planeRoot);
        const pmrem = new T.PMREMGenerator(this.renderer), room = new RoomEnvironment();
        this.pmrem = pmrem.fromScene(room, .05);
        this.scene.environment = this.pmrem.texture;
        room.dispose();
        pmrem.dispose();
        this.sun = new T.DirectionalLight('#fff0d6', 2.05);
        this.sun.position.set(-90, 150, -90);
        this.sun.castShadow = true;
        this.sun.shadow.mapSize.set(2048, 2048);
        this.sun.shadow.camera.left = -100;
        this.sun.shadow.camera.right = 100;
        this.sun.shadow.camera.top = 100;
        this.sun.shadow.camera.bottom = -100;
        this.sun.shadow.camera.near = .1;
        this.sun.shadow.camera.far = 380;
        this.sun.shadow.normalBias = .025;
        this.sun.shadow.bias = -.00008;
        this.scene.add(this.sun, this.sun.target);
        this.hemi = new T.HemisphereLight('#c5e7f3', '#786448', .66);
        this.scene.add(this.hemi);
        this.headlight = new T.SpotLight('#e3f1ff', 0, 210, .34, .7, 2);
        this.scene.add(this.headlight, this.headlight.target);
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        this.ao = new GTAOPass(this.scene, this.camera, 512, 512);
        this.ao.output = GTAOPass.OUTPUT.Default;
        this.ao.blendIntensity = .38;
        this.composer.addPass(this.ao);
        this.bloom = new UnrealBloomPass(new T.Vector2(640, 360), .10, .30, 2.4);
        this.composer.addPass(this.bloom);
        this.grade = new ShaderPass(GradeShader);
        this.composer.addPass(this.grade);
        this.smaa = new SMAAPass();
        // Three r186 SMAA expects linear-sRGB input, before output conversion.
        this.composer.addPass(this.smaa);
        this.composer.addPass(new OutputPass());
        this.camera.position.set(30, 15, -52);
        this.camera.lookAt(0, 7, -12);
        this.bind();
        this.applyQuality();
        void this.init();
        this.raf = requestAnimationFrame(t => this.frame(t));
    }
    async init() {
        try {
            await this.library.init((n, label) => {
                if (!this.disposed)
                    useAirrun.setState({ progress: n * .9, loadingLabel: label });
            });
            if (this.disposed)
                return;
            this.airport = new AirportView(this.scene, this.library);
            await Promise.all([this.airport.init(), this.selectPlane('skyhawk')]);
            if (this.disposed)
                return;
            this.studio = new ThumbnailStudio(this.renderer, this.library, this.pmrem.texture, outcome => {
                if (this.disposed || (outcome.status !== 'captured' && outcome.status !== 'cached'))
                    return;
                const key = outcome.id.startsWith('theme:') ? outcome.id.slice(6) : outcome.id;
                useAirrun.setState({ previewImages: { ...useAirrun.getState().previewImages, [key]: outcome.record.image, ...(key === 'korea:0' ? { korea: outcome.record.image } : {}) } });
            });
            this.initialized = true;
            useAirrun.setState({ assetsReady: true, progress: 1 });
            this.completeLoading();
        }
        catch (error) {
            if (!this.disposed)
                useAirrun.setState({ renderError: error instanceof Error ? error.message : String(error), loadingLabel: '모델을 준비하지 못했습니다.' });
        }
    }
    completeLoading() {
        const s = useAirrun.getState();
        if (this.initialized && s.ready && s.phase === 'loading')
            useAirrun.setState({ phase: s.save.nickname ? 'hangar' : 'registration' });
    }
    bind() {
        const resize = () => {
            this.resize();
            const s = useAirrun.getState();
            if (matchMedia('(pointer:coarse)').matches && innerHeight > innerWidth)
                s.pause();
        };
        const clear = () => { this.held.clear(); this.dragPoints.clear(); this.pinch = 0; this.orbit.yawVelocity = this.orbit.pitchVelocity = 0; releaseInput(); if (useAirrun.getState().phase === 'preflight')
            this.pauseAfterPreparation = true; useAirrun.getState().pause(); };
        const visibility = () => {
            this.lastFrame = 0; this.accumulator = 0; this.presentationElapsed = 0;
            if (document.hidden) { clear(); this.studio?.cancelPending('Page hidden'); this.audio.update(useAirrun.getState().save.settings, this.sim, true); }
        };
        const keydown = (e: KeyboardEvent) => {
            this.previewQuietUntil = performance.now() + 220;
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            if ((e.target as HTMLElement)?.matches('input,select,textarea'))
                return;
            const code = e.code, s = useAirrun.getState();
            if ((e.target as HTMLElement)?.closest('button') && ['Space', 'Enter'].includes(code)) return;
            if (['flying', 'takeoff', 'crashing'].includes(s.phase) && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'Escape'].includes(code))
                e.preventDefault();
            if (code === 'Escape') {
                if (s.phase === 'flying' || s.phase === 'takeoff')
                    s.pause();
                else if (s.phase === 'paused')
                    s.resume();
                return;
            }
            if (code === 'KeyR' && !e.repeat && s.phase === 'flying' && this.sim?.formation?.hud()?.offer) {
                e.preventDefault();
                input.transmit = true;
                return;
            }
            if (code === 'KeyQ' && !e.repeat && s.phase === 'flying' && !this.sim?.eRemaining) { e.preventDefault(); input.rush = true; return; }
            if (code === 'KeyF' && !e.repeat && s.phase === 'flying') {
                e.preventDefault(); s.bankFlow(); return;
            }
            if (code === 'KeyE' && !e.repeat) {
                s.hyper();
                return;
            }
            if (code === 'Enter' && s.phase === 'takeoff') {
                s.skipTakeoff();
                return;
            }
            if (s.phase !== 'flying' || this.sim?.eRemaining || e.repeat && !this.held.has(code))
                return;
            if (s.save.settings.control === 'gear' && !e.repeat) {
                if (code === 'ShiftLeft' || code === 'ShiftRight') {
                    if (!this.held.has('Space'))
                        input.pendingGear = (input.pendingGear ?? 0) + 1;
                }
                if (code === 'Space' && !this.held.has('ShiftLeft') && !this.held.has('ShiftRight'))
                    input.pendingGear = (input.pendingGear ?? 0) - 1;
            }
            this.held.add(code);
            this.syncKeys();
        };
        const keyup = (e: KeyboardEvent) => { this.held.delete(e.code); this.syncKeys(); };
        window.addEventListener('resize', resize);
        window.addEventListener('blur', clear);
        document.addEventListener('visibilitychange', visibility);
        window.addEventListener('keydown', keydown, { passive: false });
        window.addEventListener('keyup', keyup);
        this.cleanupListeners.push(() => { window.removeEventListener('resize', resize); window.removeEventListener('blur', clear); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); });
        const contextLost = (e: Event) => { e.preventDefault(); clear(); useAirrun.setState({ renderError: '그래픽 연결이 중단되었습니다. 다시 불러오면 기록은 유지됩니다.' }); };
        const stageAt = (target: EventTarget | null) => target instanceof Element && !!target.closest('[data-hangar-stage]') && !target.closest('button');
        const pointerDown = (e: PointerEvent) => {
            this.previewQuietUntil = performance.now() + 220;
            if (!stageAt(e.target) || useAirrun.getState().phase !== 'hangar' || e.pointerType === 'mouse' && e.button !== 0)
                return;
            e.preventDefault();
            this.dragPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            if (this.dragPoints.size === 2) {
                const [a, b] = [...this.dragPoints.values()];
                this.pinch = Math.hypot(a.x - b.x, a.y - b.y);
            }
        };
        const pointerMove = (e: PointerEvent) => {
            if (this.dragPoints.has(e.pointerId)) this.previewQuietUntil = performance.now() + 220;
            const old = this.dragPoints.get(e.pointerId);
            if (!old)
                return;
            const dx = e.clientX - old.x, dy = e.clientY - old.y;
            this.dragPoints.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (this.dragPoints.size >= 2) {
                const [a, b] = [...this.dragPoints.values()], distance = Math.hypot(a.x - b.x, a.y - b.y);
                if (this.pinch > 0)
                    this.orbit.zoom = clamp(this.orbit.zoom * this.pinch / Math.max(1, distance), .78, 1.22);
                this.pinch = distance;
            }
            else {
                this.orbit.yaw += dx * .006;
                this.orbit.pitch = clamp(this.orbit.pitch + dy * .004, .10, .60);
                this.orbit.yawVelocity = dx * .045;
                this.orbit.pitchVelocity = dy * .015;
            }
        };
        const pointerUp = (e: PointerEvent) => { this.dragPoints.delete(e.pointerId); if (e.type === 'pointercancel') this.orbit.yawVelocity = this.orbit.pitchVelocity = 0; if (this.dragPoints.size < 2)
            this.pinch = 0; };
        const wheel = (e: WheelEvent) => { this.previewQuietUntil = performance.now() + 220; if (!stageAt(e.target))
            return; e.preventDefault(); this.orbit.zoom = clamp(this.orbit.zoom * Math.exp(e.deltaY * .001), .78, 1.22); };
        window.addEventListener('pointerdown', pointerDown, { passive: false });
        window.addEventListener('pointermove', pointerMove);
        window.addEventListener('pointerup', pointerUp);
        window.addEventListener('pointercancel', pointerUp);
        window.addEventListener('lostpointercapture', pointerUp);
        window.addEventListener('wheel', wheel, { passive: false });
        this.cleanupListeners.push(() => { window.removeEventListener('pointerdown', pointerDown); window.removeEventListener('pointermove', pointerMove); window.removeEventListener('pointerup', pointerUp); window.removeEventListener('pointercancel', pointerUp); window.removeEventListener('lostpointercapture', pointerUp); window.removeEventListener('wheel', wheel); });
        this.renderer.domElement.addEventListener('webglcontextlost', contextLost);
        this.cleanupListeners.push(() => this.renderer.domElement.removeEventListener('webglcontextlost', contextLost));
    }
    syncKeys() {
        const h = this.held;
        input.x = (h.has('KeyD') || h.has('ArrowRight') ? 1 : 0) - (h.has('KeyA') || h.has('ArrowLeft') ? 1 : 0);
        input.y = (h.has('KeyW') || h.has('ArrowUp') ? 1 : 0) - (h.has('KeyS') || h.has('ArrowDown') ? 1 : 0);
        input.boost = h.has('ShiftLeft') || h.has('ShiftRight');
        input.brake = h.has('Space');
        if (input.boost && input.brake)
            input.pendingGear = 0;
    }
    resize() {
        if (this.disposed)
            return;
        const w = this.renderer.domElement.clientWidth || innerWidth, h = this.renderer.domElement.clientHeight || innerHeight;
        this.renderer.setSize(w, h, false);
        this.composer.setSize(w, h);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        const ratio = this.renderer.getPixelRatio();
        const scale = GRAPHICS[useAirrun.getState().save.settings.quality].aoScale;
        this.ao.setSize(Math.max(256, Math.floor(w * ratio * scale)), Math.max(144, Math.floor(h * ratio * scale)));
    }
    requestPreview(key: string, request: () => Promise<unknown>) {
        if (useAirrun.getState().previewImages[key] || performance.now() < (this.previewRequests.get(key) ?? 0))
            return;
        this.previewRequests.set(key, performance.now() + 8000);
        void request().then(outcome => {
            if (outcome && typeof outcome === 'object' && 'status' in outcome && outcome.status === 'cancelled') this.previewRequests.delete(key);
        }).catch(() => { this.previewRequests.set(key, performance.now() + 2000); });
    }
    syncLobbyPreviews(s: ReturnType<typeof useAirrun.getState>, ms: number) {
        if (!this.studio || ms - this.lastFleetPreview < 350 && this.lastPreviewPanel === s.panel) return;
        this.lastFleetPreview = ms; this.lastPreviewPanel = s.panel;
        const wanted: string[] = [];
        const theme = (id: string, variant?: number) => {
            if (!THEMES.some(t => t.id === id)) return;
            const resolvedVariant = id === 'korea' ? variant ?? 0 : undefined, key = id === 'korea' ? 'korea:' + resolvedVariant : id;
            wanted.push('theme:' + key); this.requestPreview(key, () => this.studio!.requestTheme(id as typeof THEMES[number]['id'], resolvedVariant));
        };
        if (s.panel === 'atlas') {
            const selected = document.querySelector<HTMLElement>('.atlas-detail[data-theme-id]');
            if (selected?.dataset.themeId) theme(selected.dataset.themeId, selected.dataset.themeVariant === undefined ? undefined : Number(selected.dataset.themeVariant));
            const cards = document.querySelectorAll<HTMLElement>('.atlas-card');
            cards.forEach((card, index) => { if (previewVisible(card)) theme(card.dataset.themeId ?? THEMES[index]?.id); });
            for (const card of document.querySelectorAll<HTMLElement>('.korea-pages [data-theme-variant]'))
                if (previewVisible(card)) theme('korea', Number(card.dataset.themeVariant));
        }
        this.studio.retainRequests(wanted);
    }
    setView(view: 'front' | 'side' | 'rear' | 'top' | 'reset') {
        this.orbit.yaw = view === 'side' ? Math.PI / 2 : view === 'rear' ? Math.PI : view === 'front' ? 0 : .72;
        this.orbit.pitch = view === 'top' ? .60 : .25;
        this.orbit.zoom = 1;
        this.orbit.yawVelocity = this.orbit.pitchVelocity = 0;
    }
    zoom(amount: number) { this.orbit.zoom = clamp(this.orbit.zoom + amount, .78, 1.22); }
    selectPlane(id: string, force = false): Promise<void> {
        if (this.planeRequest === id && this.planeLoad)
            return this.planeLoad;
        const promise = this.loadAircraft(id, force);
        this.planeLoad = promise;
        return promise;
    }
    private async loadAircraft(id: string, force = false) {
        if (this.planeId.startsWith(id + ':') || this.planeRequest === id || !force && performance.now() < this.selectionRetryAt)
            return;
        const request = ++this.planeGeneration;
        this.planeRequest = id;
        this.modelLoading = true;
        useAirrun.setState({ modelBusy: true });
        const aircraft = AIRCRAFT.find(p => p.id === id) ?? AIRCRAFT[0];
        let instance: ModelInstance | null = null, lastError: unknown;
        try {
            for (const lod of [0, 1, 2] as const) {
                if (!force && !this.library.canRequest(aircraft.model, lod))
                    continue;
                try {
                    instance = await this.library.instance(aircraft.model, lod, true);
                    this.planeId = request === this.planeGeneration ? id + ':' + lod : this.planeId;
                    break;
                }
                catch (error) {
                    lastError = error;
                }
            }
            if (!instance)
                throw lastError ?? new Error('Aircraft is waiting for a retry · ' + aircraft.model);
            if (this.disposed || request !== this.planeGeneration) {
                instance.dispose();
                return;
            }
            this.insignia?.dispose();
            this.plane?.dispose();
            this.plane = instance;
            this.planeRoot.add(instance.root);
            parkAircraft(instance);
            this.silhouette = inspectionPoints(instance.root);
            this.insignia = new ChapterInsignia(instance);
            this.lastSkin = '';
            this.selectionRetryAt = 0;
            useAirrun.setState({ modelError: '' });
        }
        catch (error) {
            if (!this.disposed && request === this.planeGeneration) {
                this.selectionRetryAt = performance.now() + 6000;
                useAirrun.setState({ modelError: error instanceof Error ? error.message : String(error) });
            }
        }
        finally {
            if (request === this.planeGeneration) {
                this.planeRequest = '';
                this.modelLoading = false;
                useAirrun.setState({ modelBusy: false });
            }
        }
    }
    async begin(retry = false) { await this.audio.unlock(); if (this.disposed)
        return; this.library.retry(); this.selectionRetryAt = 0; if (retry) useAirrun.getState().retryRoute(); else useAirrun.getState().start(); }
    newRun() {
        this.cancelHyper();
        const s = useAirrun.getState();
        this.lastRun = s.runId;
        this.warmGeneration++;
        this.preparing = false;
        this.streamResume = false;
        this.pauseAfterPreparation = false;
        this.takeoffTime = this.crashTime = this.accumulator = this.lastHUD = this.lastERequest = 0;
        this.lastCloud = -1;
        this.held.clear();
        releaseInput();
        this.studio?.cancelPending('Flight departure');
        this.takeoffCamera.copy(this.camera.position);
        this.camera.clearViewOffset();
        const plane = s.save.selected, level = s.runLevel ?? s.save.levels[plane] ?? 1;
        const rival = s.flightMode === 'sortie' ? personalRival(s.save.runs, { seed: s.seed, plane, level, difficulty: s.save.settings.difficulty ?? 'standard', contractId: s.contractId }) : undefined;
        this.sim = new FlightSimulation({
            personalDistances: { manual: s.save.bests.all?.distance ?? 0, hyper: s.save.bests.allE?.distance ?? 0 },
            coach:s.flightMode==='endless' && (s.save.settings.flightCoach==='on' || (s.save.settings.flightCoach===undefined && s.save.runs.length===0)), id: s.runId, seed: s.seed, mode: s.flightMode, dailyKey: s.dailyKey ?? undefined, plane, level, contractId: s.contractId, rival: rival?.replay ? { replay: rival.replay, score: rival.score } : undefined, practice: null, settings: s.save.settings, catalog: this.library.byId, proxies: this.library.proxies, onEvent: (kind, p) => {
                if (kind === 'e-end') {
                    this.held.clear();
                    releaseInput();
                }
                this.audio.event(kind);
                this.fx?.event(kind, p, this.sim);
            } });
        this.beacons?.dispose(); this.beacons = new CourseBeacons(this.scene, this.sim.plane.span, this.sim.plane.length);
        this.previousPose = this.renderPose = readFlightPose(this.sim);
        this.flightCameraReady = false;
        this.flightOffset = -takeoffDistance(DEPARTURE.duration, this.sim.speed);
        this.world?.dispose();
        this.fx?.dispose();
        this.world = new WorldView(this.scene, this.library);
        this.sim.config.isObstacleVisible = obstacle => this.world?.canCollide(obstacle) ?? false;
        this.fx = new FlightFX(this.scene, this.library.byId);
        this.world.update(this.sim, 0, s.save.settings.quality);
        this.world.root.visible = this.fx.root.visible = false;
        this.lastScreenshotKey = '';
        this.photoTimer = 0;
        useAirrun.setState({ hud: this.sim.hud(input) });
        void this.prepareFlight(false);
    }
    cancelHyper() {
        this.hyperGeneration++; this.hyperPreparing = false; this.trickPlanner?.cancel();
        const hud = useAirrun.getState().hud; if (hud.ePreparing) useAirrun.setState({ hud: { ...hud, ePreparing: false } });
    }
    async prepareHyper() {
        const sim = this.sim; if (!sim || sim.eUsed || sim.failed || this.hyperPreparing || useAirrun.getState().phase !== 'flying') return;
        const generation = ++this.hyperGeneration; this.hyperPreparing = true; this.accumulator = 0; releaseInput(); this.held.clear();
        useAirrun.setState({ hud: { ...sim.hud(input), ePreparing: true } });
        try {
            const request = sim.trickSnapshot(); if (!request) return;
            const [path] = await Promise.all([this.trickPlanner.plan(request), (async () => {
                await this.library.ensureProxies(request.assets.map(meta => meta.id));
                await Promise.all(request.assets.map(meta => this.library.load(meta.id, compatibleModelLOD(meta, 2))));
            })()]);
            if (this.disposed || generation !== this.hyperGeneration || this.sim !== sim || useAirrun.getState().phase !== 'flying') return;
            sim.engageTrick(request, path); this.previousPose = this.renderPose = readFlightPose(sim); this.accumulator = 0;
        }
        catch { if (!this.disposed && generation === this.hyperGeneration && this.sim === sim) sim.notify('하이퍼 준비 실패 · E로 다시 시도', 'HYPER PREPARATION FAILED · PRESS E TO RETRY', 'warning'); }
        finally { if (generation === this.hyperGeneration) { this.trickPlanner.cancel(); this.hyperPreparing = false; useAirrun.setState({ hud: { ...sim.hud(input), ePreparing: false } }); } }
    }
    async prepareFlight(resume = false) {
        if (!this.sim || this.preparing)
            return;
        const generation = ++this.warmGeneration, sim = this.sim;
        this.preparing = true;
        this.streamResume = resume;
        useAirrun.setState({ progress: 0, modelError: '', loadingLabel: resume ? '다음 비행 구간 준비' : '기체와 비행 경로 준비' });
        try {
            await this.selectPlane(sim.plane.id, true);
            if (!this.planeId.startsWith(sim.plane.id + ':'))
                throw new Error(useAirrun.getState().modelError || 'Selected aircraft unavailable');
            useAirrun.setState({ progress: .08, loadingLabel: useAirrun.getState().save.settings.language === 'ko' ? '첫 출격 지역 준비' : 'Preparing the first region' });
            await this.world?.stream.prepare(sim, (ready, total) => {
                if (!this.disposed && generation === this.warmGeneration)
                    useAirrun.setState({ progress: .08 + .45 * ready / Math.max(1, total), loadingLabel: (useAirrun.getState().save.settings.language === 'ko' ? '출격 지역 준비 ' : 'Preparing your departure ') + `${ready} / ${total}` });
            });
            const ids = [...new Set(sim.encounters.flatMap(e => e.placements).filter(p => p.collision && p.z > sim.z - 30 && p.z < sim.z + Math.max(1050, sim.speed * 8)).map(p => p.model))];
            let done = 0;
            const loads = await Promise.allSettled(ids.map(async (id) => {
                const meta = this.library.byId.get(id)!;
                const focus = { x: sim.x, y: sim.y, z: sim.z, speed: sim.speed, span: sim.plane.span };
                await this.library.load(id, compatibleModelLOD(meta, 2));
                if (sim.encounters.flatMap(e => e.placements).some(p => p.collision && p.model === id && requiresHeroSurface(meta, p, focus, sim.config.settings.quality))) await this.library.load(id, 0);
                done++;
                if (generation === this.warmGeneration && !this.disposed)
                    useAirrun.setState({ progress: .53 + .22 * done / Math.max(1, ids.length), loadingLabel: '비행 경로 ' + done + ' / ' + ids.length });
            }));
            const failures = loads.filter(r => r.status === 'rejected');
            if (failures.length)
                throw new Error((failures[0] as PromiseRejectedResult).reason?.message ?? 'Flight scenery unavailable');
            if (this.disposed || generation !== this.warmGeneration || this.sim !== sim || useAirrun.getState().phase !== 'preflight')
                return;
            useAirrun.setState({ progress: .78, loadingLabel: useAirrun.getState().save.settings.language === 'ko' ? '풍경과 비행 경로 정리' : 'Preparing the horizon' });
            await this.world?.prepare(sim, useAirrun.getState().save.settings.quality);
            await this.warmFlightGPU(generation);
            if (this.disposed || generation !== this.warmGeneration || this.sim !== sim || useAirrun.getState().phase !== 'preflight') return;
            this.accumulator = 0;
            const readyPhase = resume || useAirrun.getState().save.settings.skipTakeoff ? 'flying' : 'takeoff';
            useAirrun.setState({ phase: document.hidden || this.pauseAfterPreparation ? 'paused' : readyPhase, pausedPhase: readyPhase, progress: 1, modelError: '' });
        }
        catch (error) {
            if (!this.disposed && generation === this.warmGeneration && useAirrun.getState().phase === 'preflight')
                useAirrun.setState({ phase: resume ? 'paused' : 'hangar', pausedPhase: 'flying', progress: 0, modelError: error instanceof Error ? error.message : String(error) });
        }
        finally {
            if (generation === this.warmGeneration)
                this.preparing = false;
        }
    }
    async warmFlightGPU(generation: number) {
        const world = this.world;
        if (!world || !this.renderer?.initTexture || !this.renderer?.compileAsync) return;
        const textures = new Set<T.Texture>();
        const collect = (root: T.Object3D) => root.traverse(node => {
            if (!(node instanceof T.Mesh) || !node.visible) return;
            for (const material of Array.isArray(node.material) ? node.material : [node.material])
                for (const value of Object.values(material)) if (value instanceof T.Texture) textures.add(value);
        });
        for (const batch of world.batches.values()) if (batch.root.visible) collect(batch.root);
        for (const instance of world.animated.values()) collect(instance.root);
        if (this.plane) collect(this.plane.root);
        useAirrun.setState({ progress: .92, loadingLabel: useAirrun.getState().save.settings.language === 'ko' ? '마지막 출격 점검' : 'Final departure checks' });
        let n = 0;
        for (const texture of textures) {
            if (this.disposed || generation !== this.warmGeneration || world !== this.world) return;
            this.renderer.initTexture(texture);
            if (++n % 4 === 0) await new Promise(resolve => setTimeout(resolve, 0));
        }
        if (!this.disposed && generation === this.warmGeneration && world === this.world)
            await this.renderer.compileAsync(world.root, this.camera, this.scene);
    }
    retryFlight() {
        this.library.retry();
        this.selectionRetryAt = 0;
        const s = useAirrun.getState();
        if (s.phase === 'paused' && this.sim && this.streamResume) {
            useAirrun.setState({ phase: 'preflight' });
            void this.prepareFlight(true);
        }
        else if (s.phase === 'hangar' && this.planeId.startsWith(s.save.selected + ':'))
            void this.begin();
        else
            void this.selectPlane(s.save.selected, true);
    }
    applyQuality() {
        const s = useAirrun.getState().save.settings, key = s.quality + ':' + s.adaptiveResolution + ':' + s.targetFPS + ':' + s.resolutionScale + ':' + devicePixelRatio;
        if (key === this.lastQuality)
            return;
        this.lastQuality = key;
        const p = GRAPHICS[s.quality];
        const shadowsChanged = this.renderer.shadowMap.enabled !== p.shadows;
        this.renderer.shadowMap.enabled = p.shadows;
        if (shadowsChanged) {
            // Three r186 does not invalidate an existing material program when
            // shadowMap.enabled changes. Otherwise its old sampler2DShadow
            // shader can sample the non-shadow fallback texture after a toggle.
            const materials = new Set<T.Material>(this.library.allMaterials ?? []);
            this.scene?.traverse(node => {
                if (node instanceof T.Mesh)
                    for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
            });
            for (const material of materials) material.needsUpdate = true;
        }
        this.ao.enabled = p.ambientOcclusion;
        if (this.sun.shadow.mapSize.x !== p.shadowSize || this.sun.shadow.mapSize.y !== p.shadowSize) {
            this.sun.shadow.map?.dispose();
            this.sun.shadow.map = null;
        }
        this.sun.shadow.mapSize.set(p.shadowSize, p.shadowSize);
        this.bloom.strength = p.bloom;
        this.clouds.setQuality(p.cloudCells);
        this.library.setTextureAnisotropy(Math.min(p.anisotropy, this.renderer.capabilities.getMaxAnisotropy()));
        const gl = this.renderer.getContext() as WebGL2RenderingContext;
        let samples: number[] = [];
        try { samples = Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA16F, gl.SAMPLES) as Int32Array); } catch { /* SMAA is the non-MSAA path. */ }
        const count = supportedSamples(p.samples, samples);
        for (const target of [this.composer.renderTarget1, this.composer.renderTarget2]) if (target.samples !== count) {
            target.samples = count;
            target.dispose();
        }
        this.smaa.enabled = count === 0;
        this.lastCloud = -1;
        this.pixelScale = renderPixelRatio(s, devicePixelRatio);
        this.renderer.setPixelRatio(this.pixelScale);
        this.composer.setPixelRatio(this.pixelScale);
        this.resize();
        this.fpsLowTime = this.fpsGoodTime = 0;
    }
    livery() {
        const s = useAirrun.getState();
        const planeKey = this.sim && ['flying', 'paused', 'takeoff', 'crashing', 'results'].includes(s.phase) ? this.sim.plane.id : s.save.selected;
        const id = (s.phase === 'hangar' ? s.skinPreview : null) ?? s.save.skinSelected[planeKey] ?? 'default';
        if (!this.plane || this.lastSkin === id)
            return;
        this.lastSkin = id;
        const skin = SKINS.find(v => v.id === id)!, body = new T.Color(skin.color), accent = new T.Color(skin.accent);
        this.plane.model.traverse(n => {
            if (!(n instanceof T.Mesh))
                return;
            const mats = Array.isArray(n.material) ? n.material : [n.material];
            if (!mats.some(isPaintMaterial))
                return;
            const color = n.geometry.getAttribute('color');
            if (!color) {
                for (const material of mats) {
                    if (!(material instanceof T.MeshStandardMaterial) || !isPaintMaterial(material)) continue;
                    material.userData.stockColor ??= material.color.getHex();
                    if (id === 'default') material.color.setHex(material.userData.stockColor);
                    else material.color.copy(material.name === 'paint_stripe' ? accent : body);
                }
                return;
            }
            let original = n.geometry.userData.paintOriginal as Float32Array | undefined;
            if (!original) {
                original = new Float32Array(color.count * 3);
                for (let i = 0; i < color.count; i++) {
                    original[i * 3] = color.getX(i);
                    original[i * 3 + 1] = color.getY(i);
                    original[i * 3 + 2] = color.getZ(i);
                }
                n.geometry.userData.paintOriginal = original;
            }
            for (let i = 0; i < color.count; i++) {
                const r = original[i * 3], g = original[i * 3 + 1], b = original[i * 3 + 2], hi = Math.max(r, g, b), lo = Math.min(r, g, b), saturation = (hi - lo) / (hi || 1);
                if (id === 'default' || hi < .095 || !isPaintVertex(n, i)) {
                    color.setXYZ(i, r, g, b);
                    continue;
                }
                const pigment = saturation > .3 ? accent : body, shade = clamp(.60 + hi * .56, .60, 1.15);
                color.setXYZ(i, pigment.r * shade, pigment.g * shade, pigment.b * shade);
            }
            color.needsUpdate = true;
        });
    }
    frame(ms: number) {
        if (this.disposed)
            return;
        this.raf = requestAnimationFrame(t => this.frame(t));
        if (typeof document !== 'undefined' && document.hidden) {
            this.lastFrame = ms; this.accumulator = 0; this.presentationElapsed = 0; return;
        }
        let dt = Math.min(.12, Math.max(0, (ms - (this.lastFrame || ms)) / 1000));
        this.lastFrame = ms;
        this.completeLoading();
        let s = useAirrun.getState();
        if (this.inspectorActive) return;
        if (!this.initialized) {
            if (!s.renderError)
                this.render(ms / 1000);
            return;
        }
        this.applyQuality();
        if (this.hyperPreparing && s.phase !== 'flying') this.cancelHyper();
        if (s.runId && s.runId !== this.lastRun && s.phase === 'preflight')
            this.newRun();
        if (['flying', 'takeoff'].includes(s.phase) && matchMedia('(pointer:coarse)').matches && innerHeight > innerWidth) {
            s.pause();
            s = useAirrun.getState();
        }
        if (s.phase !== this.lastPhase) {
            if (s.phase === 'flying' && this.lastPhase === 'paused' && document.activeElement instanceof HTMLElement) document.activeElement.blur();
            if (s.phase === 'hangar') this.airport?.openBay(s.save.settings.reducedMotion);
            if (s.phase === 'preflight' || s.phase === 'takeoff') this.airport?.openBay(true);
            if (s.phase === 'paused') {
                this.held.clear();
                releaseInput();
                this.accumulator = 0;
            }
            if (s.phase === 'hangar' && !!this.sim) {
                this.warmGeneration++;
                this.preparing = false;
                this.world?.dispose();
                this.world = null;
                this.fx?.dispose();
                this.fx = null;
                this.sim = null;
            }
            this.lastPhase = s.phase;
        }
        if (s.phase === 'paused' && s.resumeCountdown > 0) {
            this.resumeTime += dt;
            if (this.resumeTime >= 1) {
                this.resumeTime -= 1;
                const next = s.resumeCountdown - 1;
                useAirrun.setState({ resumeCountdown: next, ...(next <= 0 ? { phase: s.pausedPhase } : {}) });
            }
        }
        else
            this.resumeTime = 0;
        const live = ['flying', 'takeoff', 'crashing'].includes(s.phase), sim = this.sim;
        if (sim && (s.bankRequest ?? 0) !== (this.lastBankRequest ?? 0)) {
            this.lastBankRequest = s.bankRequest;
            if (s.phase === 'flying') sim.bankFlow();
        }
        if (sim && s.eRequest !== this.lastERequest) {
            this.lastERequest = s.eRequest;
            if (s.phase === 'flying')
                void this.prepareHyper();
        }
        if (sim && s.phase === 'takeoff') {
            this.takeoffTime += dt;
            if (this.takeoffTime >= 4)
                useAirrun.setState({ phase: 'flying' });
        }
        if (sim)
            sim.config.settings = s.save.settings;
        if (sim && s.phase === 'flying' && !this.hyperPreparing) {
            this.accumulator += dt;
            while (this.accumulator >= 1 / 60) {
                this.previousPose = readFlightPose(sim);
                sim.step(1 / 60, input);
                this.accumulator -= 1 / 60;
                if (sim.completed) {
                    this.accumulator = 0;
                    s.settle(sim.result());
                    break;
                }
                if (sim.failed) {
                    useAirrun.setState({ phase: 'crashing' });
                    this.crashTime = 0;
                    break;
                }
            }
            if (sim.time - sim.lastCheckpoint >= 10) {
                sim.lastCheckpoint = sim.time;
                s.checkpoint(sim.result(true));
            }
        }
        if (sim && s.phase === 'crashing') {
            this.crashTime += dt;
            if (this.crashTime >= 1.4)
                s.settle(sim.result());
        }
        this.presentationElapsed += dt;
        if (s.save.settings.targetFPS === 30 && Math.floor(ms / 33.333) === Math.floor((ms - dt * 1000) / 33.333)) return;
        dt = Math.min(.16, this.presentationElapsed); this.presentationElapsed = 0;
        const running = !!sim && (presentsFlight(s.phase, this.streamResume) || s.phase === 'paused' && s.pausedPhase !== 'takeoff');
        const takingOff = s.phase === 'takeoff' || s.phase === 'paused' && s.pausedPhase === 'takeoff';
        if (sim && s.phase === 'flying')
            this.renderPose = interpolateFlightPose(this.previousPose ?? readFlightPose(sim), readFlightPose(sim), this.accumulator * 60);
        const pose = this.renderPose;
        this.planeRoot.visible = true;
        if (this.airport) {
            this.airport.root.visible = airportVisible(s.phase, this.streamResume, sim?.z ?? 0, s.pausedPhase);
            this.airport.root.position.z = running && sim ? (pose?.z ?? sim.z) : 0;
        }
        if (this.world) {
            this.world.root.visible = running || takingOff;
            this.world.root.position.z = this.flightOffset + (running && sim ? (pose?.z ?? sim.z) - sim.z : 0);
        }
        if (this.fx) {
            this.fx.root.visible = !!running;
            this.fx.root.position.z = this.flightOffset + (running && sim ? (pose?.z ?? sim.z) - sim.z : 0);
        }
        if (this.beacons) { this.beacons.root.visible = !!running; if (running && sim) this.beacons.update(sim, pose?.z ?? sim.z, this.flightOffset); }
        if (running && sim) {
            this.camera.clearViewOffset();
            if (s.phase === 'flying')
                this.world?.update(sim, dt, s.save.settings.quality, pose?.motionTime ?? sim.motionTime);
            if (s.phase === 'flying' || s.phase === 'crashing')
                this.flightCamera(sim, dt, s.phase);
            if (s.phase === 'flying' && !this.hyperPreparing && sim.time - this.lastHUD > .10) {
                const hud = sim.hud(input);
                if (!sim.eRemaining) {
                    let nearest;
                    for (const pickup of sim.pickups) {
                        if (pickup.kind !== 'ring' || pickup.collected || pickup.z < sim.z || pickup.z - sim.z > Math.min(480, Math.max(160, sim.speed * 5.5))) continue;
                        if (!nearest || pickup.z < nearest.z) nearest = pickup;
                    }
                    if (nearest) hud.ringSight = projectRingSight(this.camera, nearest, pose?.z ?? sim.z, this.flightOffset, nearest.z - sim.z);
                }
                if (hud.navigation) {
                    const next = hud.navigation;
                    next.screen = projectGuidance(this.camera, { x: sim.x + next.dx, y: sim.y + next.dy, z: sim.z + next.distance }, pose?.z ?? sim.z, this.flightOffset, sim.speed);
                }
                if (hud.choice) for (const lane of [hud.choice.safe, hud.choice.risk])
                    lane.screen = projectGuidance(this.camera, { x: lane.x, y: lane.y, z: sim.z + hud.choice.distance }, pose?.z ?? sim.z, this.flightOffset, sim.speed);
                hud.fps = this.fps;
                hud.draws = this.renderer.info.render.calls;
                hud.triangles = this.renderer.info.render.triangles;
                useAirrun.setState({ hud });
                this.lastHUD = sim.time;
            }
            if (s.phase === 'flying' || s.phase === 'crashing')
                this.fx?.update(sim, s.phase === 'crashing' ? dt * .28 : dt, this.planeRoot, this.world?.modelPlacements, s.save.settings.quality, pose ?? undefined, pose?.motionTime ?? sim.motionTime, this.camera);
        }
        else {
            void this.selectPlane(sim && s.phase === 'takeoff' ? sim.plane.id : s.save.selected);
            this.airport?.update(s.phase === 'paused' ? 0 : dt);
            if (s.phase !== 'paused')
                this.hangarCamera(dt, s.phase);
            this.livery();
        }
        const inLobby = s.phase === 'hangar' && !this.modelLoading;
        if (inLobby) this.syncLobbyPreviews(s, ms);
        if (this.plane) {
            const centreY = (this.plane.meta.bounds.min[1] + this.plane.meta.bounds.max[1]) / 2;
            const airborne = running ? 1 : takingOff ? smooth((this.takeoffTime - 1.5) / 2) : 0;
            this.plane.model.position.y = mix(this.plane.parkedOffsetY ?? 0, -centreY, airborne);
            this.plane.model.rotation.x = (this.plane.meta.groundRotationX ?? 0) * (1 - airborne);
            this.gearRetraction = damp(this.gearRetraction, running || takingOff && this.takeoffTime > 2.7 ? 1 : 0, 1.8, dt);
            poseAircraft(this.plane, s.phase === 'paused' || s.phase === 'preflight' && this.streamResume ? 0 : live ? dt * (sim?.effects.has('slow') ? .65 : 1) : dt * .45, running && !sim?.eRemaining ? input.x : 0, running && !sim?.eRemaining ? input.y : 0, !running && !takingOff, this.gearRetraction);
        }
        const maintenanceAge = (performance.now() - s.maintenanceAt) / 1000;
        if (this.plane)
            for (const material of this.plane.materials)
                if (/paint/i.test(material.name)) {
                    if (maintenanceAge < 1.3 && s.maintenanceAt > 0 && s.phase === 'hangar') {
                        material.emissive.set('#d7a76e');
                        material.emissiveIntensity = Math.sin(maintenanceAge * Math.PI / 1.3) * .32;
                    }
                    else {
                        material.emissive.set(0);
                        material.emissiveIntensity = 0;
                    }
                }
        this.livery();
        this.insignia?.update(s.save.career);
        this.environment(running || takingOff ? sim : null, ms / 1000);
        this.audio.update(s.save.settings, running ? sim : null, s.phase === 'paused');
        const hasInput = typeof navigator !== 'undefined' && !!(navigator as Navigator & { scheduling?: { isInputPending?: () => boolean } }).scheduling?.isInputPending?.();
        const quiet = ms >= (this.previewQuietUntil ?? 0) && !this.dragPoints?.size && !this.held?.size && !hasInput;
        const previewBudget = (this.lastRenderMilliseconds ?? 0) < 1000 / s.save.settings.targetFPS * .7 || ms - (this.lastPreviewWork ?? -Infinity) >= 1800;
        if (this.studio?.tick(inLobby, ms, quiet && previewBudget)) this.lastPreviewWork = ms;
        const targetFPS = s.save.settings.targetFPS;
        this.render(ms / 1000);
        this.frames++;
        if (ms - this.fpsStart >= 1000) {
            this.fps = this.frames * 1000 / (ms - this.fpsStart);
            this.fpsStart = ms;
            this.frames = 0;
            if (s.save.settings.adaptiveResolution && s.phase === 'flying') {
                this.fpsLowTime = this.fps < targetFPS * .78 ? this.fpsLowTime + 1 : Math.max(0, this.fpsLowTime - 1);
                const floor = resolutionFloor(s.save.settings, devicePixelRatio);
                if (this.fpsLowTime >= 3 && this.pixelScale > floor) {
                    this.pixelScale = Math.max(floor, this.pixelScale - .12);
                    this.renderer.setPixelRatio(this.pixelScale);
                    this.composer.setPixelRatio(this.pixelScale);
                    this.resize();
                    this.fpsLowTime = 0;
                }
                this.fpsGoodTime = this.fps > targetFPS * .93 ? this.fpsGoodTime + 1 : 0;
                const max = renderPixelRatio(s.save.settings, devicePixelRatio);
                if (this.fpsGoodTime >= 12 && this.pixelScale < max) {
                    this.pixelScale = Math.min(max, this.pixelScale + .08);
                    this.renderer.setPixelRatio(this.pixelScale);
                    this.composer.setPixelRatio(this.pixelScale);
                    this.resize();
                    this.fpsGoodTime = 0;
                }
            }
        }
        if (sim && !sim.config.practice && s.phase === 'flying' && sim.metrics.themeTime[sim.theme === 'korea' ? `korea:${sim.variant}` : sim.theme] >= 20 && this.lastScreenshotKey !== (sim.theme === 'korea' ? `korea:${sim.variant}` : sim.theme)) {
            this.photoTimer += dt;
            if (this.photoTimer > 1)
                this.captureDiscovery();
        }
    }
    hangarCamera(dt: number, phase: Phase) {
        const baseY = .52;
        this.planeRoot.position.set(0, baseY, 0);
        this.planeRoot.rotation.set(0, 0, 0);
        this.camera.far = 2000;
        this.sky.mesh.scale.setScalar(1);
        if (phase === 'takeoff') {
            this.camera.clearViewOffset();
            const progress = clamp(this.takeoffTime / DEPARTURE.duration, 0, 1), t = smooth(progress);
            this.planeRoot.position.z = -takeoffDistance(this.takeoffTime, this.sim?.speed ?? 40);
            this.planeRoot.position.y = mix(baseY, this.sim?.y ?? 24, smooth((progress - .44) / .56));
            this.planeRoot.rotation.x = Math.sin(smooth((progress - .3) / .7) * Math.PI) * .17;
            const end = new T.Vector3(0, this.planeRoot.position.y + 6.5, this.planeRoot.position.z + 18);
            this.camera.position.copy(this.takeoffCamera).lerp(end, t);
            this.camera.position.x += Math.sin(Math.PI * t) * 13;
            const lookAhead = smooth((progress - .45) / .55);
            this.flightLook.set(0, this.planeRoot.position.y - 1.2 * lookAhead, this.planeRoot.position.z - 29 * lookAhead);
            this.camera.lookAt(this.flightLook);
            this.flightCameraReady = progress > .98;
            this.camera.fov = damp(this.camera.fov, 60, 3, dt);
            this.camera.updateProjectionMatrix();
            return;
        }
        const stage = document.querySelector<HTMLElement>('[data-hangar-stage]'), rect = phase === 'hangar' ? stage?.getBoundingClientRect() : null;
        if (!rect || rect.width < 10 || rect.height < 10) {
            this.lobbyFit = null;
            this.camera.clearViewOffset();
            this.camera.position.lerp(new T.Vector3(30, 14, -55), 1 - Math.exp(-dt * 4));
            this.camera.lookAt(0, 8, -20);
            this.camera.fov = damp(this.camera.fov, 48, 4, dt);
            this.camera.updateProjectionMatrix();
            return;
        }
        if (!this.dragPoints.size && !useAirrun.getState().save.settings.reducedMotion) {
            this.orbit.yaw += this.orbit.yawVelocity * dt;
            this.orbit.pitch = clamp(this.orbit.pitch + this.orbit.pitchVelocity * dt, .1, .6);
        }
        this.orbit.yawVelocity = damp(this.orbit.yawVelocity, 0, 9, dt);
        this.orbit.pitchVelocity = damp(this.orbit.pitchVelocity, 0, 9, dt);
        const width = this.renderer.domElement.clientWidth, height = this.renderer.domElement.clientHeight;
        // Thousands of silhouette points need refitting only after the camera,
        // aircraft or viewport changes, not on every idle animation frame.
        const fitKey = [this.planeId, this.silhouette.length, width, height, rect.width, rect.height,
            this.orbit.yaw.toFixed(5), this.orbit.pitch.toFixed(5), this.orbit.zoom, baseY].join(':');
        const firstView = !this.lobbyFit;
        if (!this.lobbyFit || this.lobbyFit.key !== fitKey) {
            const center = this.silhouette.length ? new T.Box3().setFromPoints(this.silhouette).getCenter(new T.Vector3()) : new T.Vector3(0, 1.8, 0);
            const direction = new T.Vector3(Math.sin(this.orbit.yaw) * Math.cos(this.orbit.pitch), Math.sin(this.orbit.pitch), -Math.cos(this.orbit.yaw) * Math.cos(this.orbit.pitch));
            this.lobbyFit = { key: fitKey, fit: inspectionFit(this.silhouette, center, direction, width / height, rect.height / height * .80, rect.width / width * .88, baseY, this.orbit.zoom) };
        }
        const { target, center: worldCenter, fov } = this.lobbyFit.fit;
        this.camera.setViewOffset(width, height, width / 2 - rect.x - rect.width / 2, height / 2 - rect.y - rect.height / 2, width, height);
        const reveal = this.airport?.entryReveal ?? 0;
        let view = target;
        if (reveal > 0) {
            const offset = target.clone().sub(worldCenter);
            const radius = Math.hypot(offset.x,offset.z)*(1+.13*reveal);
            const bearing = Math.atan2(offset.x,offset.z)-1.55*reveal;
            view = new T.Vector3(worldCenter.x+radius*Math.sin(bearing),target.y+1.6*reveal,worldCenter.z+radius*Math.cos(bearing));
        }
        this.camera.position.lerp(view, firstView ? 1 : 1 - Math.exp(-dt * 7));
        this.camera.lookAt(worldCenter);
        this.camera.fov = firstView ? fov : damp(this.camera.fov, fov, 5, dt);
        this.camera.updateProjectionMatrix();
    }
    flightCamera(sim: FlightSimulation, dt: number, phase: Phase) {
        const flightOffset = this.flightOffset, pose = this.renderPose ?? readFlightPose(sim);
        this.planeRoot.position.set(pose.x, pose.y, flightOffset);
        this.planeRoot.rotation.set(pose.pitch + pose.trickPitch, pose.yaw + pose.trickYaw, pose.roll + pose.trickRoll, 'YXZ');
        const frame = flightFraming(sim.plane.span, sim.plane.length);
        const offset = new T.Vector3(0, frame.height, frame.distance + sim.boost * 1.3), look = new T.Vector3(pose.x + sim.vx * .14, pose.y - 1.2 + sim.vy * .12, -29 + flightOffset);
        const reduced = useAirrun.getState().save.settings.reducedMotion;
        if (sim.eRemaining > 0 && !reduced) {
            const t = sim.eTime;
            const entry = smooth((t - .7) / 1.5), exit = 1 - smooth((t - 12.5) / 2.4), side = entry * exit;
            const turn = sim.ePath[65]?.x >= sim.eStart.x ? 1 : -1;
            offset.x = turn * Math.sin(t * .36 - .55) * frame.orbitWidth * side;
            offset.z = mix(frame.distance, frame.orbitDistance, side);
            offset.y += side * (1.7 - Math.cos(t * .65) * 2.7);
            look.z = mix(-23, -5, side) + flightOffset;
        }
        const cameraTarget = new T.Vector3(pose.x * .94 + offset.x, pose.y + offset.y, offset.z + flightOffset);
        if (!this.flightCameraReady) {
            this.camera.position.copy(cameraTarget);
            this.flightLook.copy(look);
            this.flightCameraReady = true;
        }
        this.camera.position.lerp(cameraTarget, 1 - Math.exp(-dt * (sim.eRemaining > 0 ? 4.5 : 8)));
        this.flightLook.lerp(look, 1 - Math.exp(-dt * 10));
        if (sim.shake && !reduced) {
            this.camera.position.x += Math.sin(pose.motionTime * 80) * sim.shake * .26;
            this.camera.position.y += Math.cos(pose.motionTime * 110) * sim.shake * .18;
        }
        if (sim.boost > .02 && !reduced) {
            const intensity = (.008 + sim.boostHeat * .018) * sim.boost;
            this.camera.position.x += Math.sin(sim.motionTime * 71) * intensity;
            this.camera.position.y += Math.cos(sim.motionTime * 83) * intensity * .7;
        }
        const cameraPoint = { x: this.camera.position.x, y: this.camera.position.y, z: pose.z - this.camera.position.z + flightOffset };
        let safe = 1;
        for (const o of sim.obstacles) {
            if (this.world && !this.world.canObstructCamera(o)) continue;
            const meta = this.library.byId.get(o.model)!, b = meta.motionBounds ?? meta.bounds;
            const radius = Math.hypot(...b.size.map((size, axis) => size * [o.scale.x, o.scale.y, o.scale.z][axis])) + 2;
            if (o.position.z + radius < Math.min(sim.z, cameraPoint.z) || o.position.z - radius > Math.max(sim.z, cameraPoint.z) || Math.abs(o.position.x - sim.x) > radius + Math.abs(cameraPoint.x - sim.x)) continue;
            const hit = obstacleContact(o, this.library.byId.get(o.model)!, this.library.proxies.get(o.model), { x: sim.x, y: sim.y, z: sim.z }, cameraPoint, { x: .7, y: .7, z: .7 }, undefined, sim.motionTime);
            if (hit && hit.t > 0) {
                // A grazing wall must not push the camera inside the aircraft's opaque fuselage.
                const chaseLength=this.camera.position.distanceTo(this.planeRoot.position);
                const airframeClearance=Math.min(.8,(sim.plane.length*.55+1.5)/Math.max(1,chaseLength));
                safe = Math.min(safe, Math.max(airframeClearance, hit.t - .04));
            }
        }
        if (safe < 1) {
            this.camera.position.set(mix(sim.x, cameraPoint.x, safe), mix(sim.y, cameraPoint.y, safe), mix(flightOffset, this.camera.position.z, safe));
        }
        if (phase === 'crashing') {
            const t = smooth(this.crashTime / 1.4);
            this.planeRoot.rotation.z += t * .85;
            this.planeRoot.rotation.x -= t * .35;
            this.planeRoot.position.y -= t * 3;
            this.camera.position.z += t * 4;
        }
        this.camera.lookAt(this.flightLook);
        if (!reduced && !sim.eRemaining) this.camera.rotateZ(pose.roll * .055);
        const targetFov = 60 + Math.min(12, (sim.speed - 40) * .09) + (sim.eRemaining > 0 ? 4 : 0) + sim.boost * 6;
        this.camera.fov = damp(this.camera.fov, targetFov, 3, dt);
        this.camera.far = Math.min(GRAPHICS[sim.config.settings.quality].viewDistance + 1000, Math.max(1600, sim.speed * 9 + 500));
        this.camera.updateProjectionMatrix();
        this.sky.mesh.scale.setScalar(this.camera.far / 2000);
    }
    environment(sim: FlightSimulation | null, time: number) {
        const w = sim?.weather ?? { night: .10, cloud: .2, rain: 0, fog: .04, wet: 0, lightning: 0, snow: false }, theme = THEMES.find(t => t.id === (sim?.theme ?? 'coast'))!;
        const pose = sim && this.renderPose, displayDistance = pose?.z ?? sim?.z ?? 0, displayTime = pose?.motionTime ?? sim?.motionTime ?? time;
        const lighting = lightAt(sim?.time ?? 40);
        const warm = sim ? lighting.warm : .15, dawn = sim ? lighting.dawn : 0;
        this.sky.mesh.position.copy(this.camera.position);
        const u = this.sky.uniforms;
        u.uTime.value = sim?.time ?? time;
        u.uNight.value = w.night;
        u.uWarm.value = warm;
        u.uDawn.value = dawn;
        u.uCloud.value = w.cloud;
        u.uAurora.value = sim?.theme === 'aurora' ? 1 : 0;
        u.uFlash.value = w.lightning * (useAirrun.getState().save.settings.reducedMotion ? .2 : 1);
        u.uSky.value.lerp(new T.Color(theme.sky), .045);
        const day = ((sim?.time ?? 40) % 180) / 120, solar = Math.PI * clamp(day, 0, 1);
        u.uSun.value.set(-Math.cos(solar) * .78, .08 + Math.sin(solar) * .88, -.35).normalize();
        const fog = this.scene.fog as T.FogExp2;
        fog.color.copy(skyHorizonColor(w.night, w.cloud, warm, dawn));
        if (this.scene.background instanceof T.Color) this.scene.background.copy(fog.color);
        const viewDistance = GRAPHICS[useAirrun.getState().save.settings.quality].viewDistance;
        fog.density = Math.max(.00042 + w.fog * .0007, sim && sim.speed * 8 >= viewDistance ? 1.8 / viewDistance : 0);
        this.scene.background = fog.color;
        this.sun.intensity = (sim ? mix(2.05, .38, w.night) : 1.2) * (1 - w.cloud * .48) + w.lightning * 3;
        this.sun.color.copy(sunLightColor(w.night, warm));
        this.hemi.intensity = (sim ? mix(.66, .40, w.night) : .46) * (1 - w.cloud * .18);
        this.hemi.color.set('#cbe8f4').lerp(new T.Color('#f5c8aa'), warm * .25).lerp(new T.Color('#99b6d9'), w.night);
        this.hemi.groundColor.set('#87785d').lerp(new T.Color('#344357'), w.night);
        this.scene.environmentIntensity = mix(.85, .24, w.night) * (1 - w.cloud * .18);
        const sunDirection = u.uSun.value.clone(); sunDirection.y = Math.max(.22, sunDirection.y);
        this.sun.target.position.set(sim?.x ?? 0, sim?.y ?? 0, sim ? this.flightOffset : -65);
        this.sun.position.copy(this.sun.target.position).addScaledVector(sunDirection.normalize(), 190);
        this.headlight.position.set(pose?.x ?? sim?.x ?? 0, (pose?.y ?? sim?.y ?? 0) + .5, -5);
        this.headlight.target.position.set((pose?.x ?? sim?.x ?? 0) - Math.sin(pose?.yaw ?? 0) * 145, (pose?.y ?? sim?.y ?? 0) + Math.sin(pose?.pitch ?? 0) * 145, -150);
        if (sim) {
            this.headlight.position.z += this.flightOffset;
            this.headlight.target.position.z += this.flightOffset;
        }
        this.headlight.intensity = sim ? w.night * 960 : 0;
        this.water.mesh.visible = !!sim && THEMES.find(t => t.id === sim.theme)!.water;
        const waterScale = Math.max(1, this.camera.far / 2000);
        this.water.mesh.scale.set(waterScale, waterScale, 1);
        this.water.mesh.position.set(this.camera.position.x, .15, -430 * waterScale);
        this.water.uniforms.uTime.value = displayTime;
        this.water.uniforms.uDistance.value = displayDistance;
        this.water.uniforms.uOrigin.value = sim ? this.flightOffset : 0;
        this.water.uniforms.uNight.value = w.night;
        this.water.uniforms.uRain.value = w.rain;
        this.water.uniforms.uFlash.value = w.lightning;
        this.water.uniforms.uVolcano.value = sim?.theme === 'volcano' ? 1 : 0;
        this.water.uniforms.uCamera.value.copy(this.camera.position);
        this.water.uniforms.uFog.value.copy(fog.color);
        if (this.water.uniforms.uFogDensity) this.water.uniforms.uFogDensity.value = fog.density;
        this.water.uniforms.uSun.value.copy(u.uSun.value);
        this.water.uniforms.uWarm.value = warm;
        this.water.uniforms.uCoastal.value = sim && (sim.theme === 'coast' || sim.theme === 'korea' && sim.variant === 3) ? 1 : 0;
        this.water.uniforms.uShorePhase.value = sim ? hash(sim.config.seed) * Math.PI * 2 : 0;
        this.water.uniforms.uRange.value = Math.min(viewDistance, this.camera.far);
        const clock = sim ? 'flight' : 'lobby';
        if (clock !== this.cloudClock) { this.cloudClock = clock; this.lastCloud = -1; }
        if (this.lastCloud < 0 || (sim?.time ?? time) - this.lastCloud > .20) {
            this.clouds.update(displayTime, w.cloud, w.night, displayDistance, sim ? lighting.warm : .15, sim ? lighting.dawn : 0);
            this.lastCloud = sim?.time ?? time;
        }
        this.clouds.drift(displayTime, displayDistance);
        if (sim)
            this.clouds.mesh.position.z += this.flightOffset;
        this.library.flightLensClearance.value = sim ? 3.8 : 0;
        this.library.environment(w.wet, w.night);
        this.renderer.toneMappingExposure = sim ? mix(.96, 1.05, w.night) : .98;
        this.grade.uniforms.uSpeed.value = sim ? Math.min(1, (sim.speed - 40) / 140) : 0;
        this.grade.uniforms.uBoost.value = sim?.boost ?? 0;
        this.grade.uniforms.uDamage.value = sim?.shake ?? 0;
        this.grade.uniforms.uE.value = sim?.eRemaining ? Math.min(1, sim.eRemaining) : 0;
        this.grade.uniforms.uRain.value = w.rain;
        this.grade.uniforms.uReduced.value = +useAirrun.getState().save.settings.reducedMotion;
    }
    render(time: number) { const began = performance.now(); this.grade.uniforms.uTime.value = time; this.renderer.info.reset(); this.composer.render(); this.lastRenderMilliseconds = performance.now() - began; }
    captureDiscovery() {
        if (!this.sim || this.scrubSaving)
            return;
        this.scrubSaving = true;
        const key = this.sim.theme === 'korea' ? `korea:${this.sim.variant}` : this.sim.theme;
        try {
            this.render(this.sim.time);
            const canvas = document.createElement('canvas');
            canvas.width = 480;
            canvas.height = 270;
            const ctx = canvas.getContext('2d')!;
            const source = this.renderer.domElement, cropWidth = Math.min(source.width, source.height * 16 / 9), cropHeight = cropWidth * 9 / 16;
            ctx.drawImage(source, (source.width - cropWidth) / 2, (source.height - cropHeight) / 2, cropWidth, cropHeight, 0, 0, 480, 270);
            let image = canvas.toDataURL('image/jpeg', .82);
            if (image.length > 180000)
                image = canvas.toDataURL('image/jpeg', .65);
            const state = useAirrun.getState(), save = structuredClone(state.save), old = save.discoveries[key];
            if (old) {
                save.discoveries[key] = { ...old, image, imageRevision: WORLD_IMAGE_REVISION };
                useAirrun.setState({ save });
                state.persist();
            }
            else {
                this.sim.metrics.themeTime[key] = Math.max(this.sim.metrics.themeTime[key], 20);
                this.sim.discoveryImages[key] = image;
            }
            this.lastScreenshotKey = key;
            this.photoTimer = 0;
        }
        catch { }
        finally {
            this.scrubSaving = false;
        }
    }
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.cancelHyper();
        cancelAnimationFrame(this.raf);
        this.planeGeneration++;
        for (const fn of this.cleanupListeners)
            fn();
        this.world?.dispose();
        this.beacons?.dispose();
        this.warmGeneration++;
        this.studio?.dispose();
        this.fx?.dispose();
        this.insignia?.dispose();
        this.plane?.dispose();
        this.airport?.dispose();
        this.clouds.dispose();
        this.sky.material.dispose();
        this.sky.mesh.geometry.dispose();
        this.water.material.dispose();
        this.water.mesh.geometry.dispose();
        this.pmrem.dispose();
        this.sun.shadow.dispose();
        this.headlight.shadow.dispose();
        for (const pass of this.composer.passes)
            pass.dispose();
        this.composer.dispose();
        this.library.dispose();
        this.audio.dispose();
        this.renderer.dispose();
        // React reuses this canvas during effect replay and hot updates. Losing
        // its context here makes the next renderer's precision queries fail.
        if (!this.renderer.domElement.isConnected) this.renderer.forceContextLoss();
    }
}
