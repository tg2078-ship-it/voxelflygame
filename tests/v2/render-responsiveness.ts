import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as T from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { AirrunRenderer, previewIntersects } from '../../app/airrun/renderer';
import { ThumbnailStudio } from '../../app/airrun/previews';
import { ModelLibrary, type ModelInstance } from '../../app/airrun/assets';
import { FlightStream, flightDeckAssets } from '../../app/airrun/flight-stream';
import { compatibleModelLOD } from '../../app/airrun/graphics';
import { catalog, createSim } from './fixtures';
import { useAirrun } from '../../app/airrun/state';
let checks = 0;
const check = (value: unknown, message: string) => { assert.ok(value, message); checks++; };
const nativeFetch = globalThis.fetch;
const rect = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom, width: right - left, height: bottom - top });
for (const [bounds, expected] of [
    [rect(10, 10, 60, 60), true], [rect(-20, 10, 10, 50), true], [rect(100, 10, 150, 50), false],
    [rect(10, 101, 60, 150), false], [rect(10, -30, 60, -1), false], [rect(0, 0, 0, 20), false],
    [rect(10, 60, 60, 110), true], [rect(-100, -100, 200, 200), true],
] as const) check(previewIntersects(bounds, { left: 0, top: 0, right: 100, bottom: 100 }) === expected, 'Preview work respects real viewport intersection');
check(!previewIntersects(rect(10, 10, 60, 60), { left: 0, top: 70, right: 100, bottom: 100 }), 'Scroll container clipping excludes otherwise onscreen cards');

// Use the actual renderer scheduling method against nested scroll rectangles.
// Only visible cards and the selected detail may enter the native shot queue.
const globals = ['document', 'innerWidth', 'innerHeight', 'getComputedStyle'] as const;
const descriptors = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const element = (bounds: ReturnType<typeof rect>, dataset: Record<string, string> = {}, parentElement: unknown = null, overflowY = 'visible') => ({ dataset, parentElement, style: { overflowX: 'visible', overflowY }, getBoundingClientRect: () => bounds });
try {
    const scroller = element(rect(0, 200, 400, 260), {}, null, 'auto');
    const cards = [element(rect(0, 10, 80, 60), { themeId: 'coast' }), element(rect(0, 350, 80, 400), { themeId: 'village' }),
        element(rect(0, 120, 80, 180), { themeId: 'ice' }, scroller), element(rect(0, 280, 80, 340), { themeId: 'desert' })];
    const selected = element(rect(200, 10, 390, 200), { themeId: 'city' });
    const variant = element(rect(200, 210, 250, 260), { themeVariant: '1' });
    Object.defineProperty(globalThis, 'innerWidth', { configurable: true, value: 400 }); Object.defineProperty(globalThis, 'innerHeight', { configurable: true, value: 300 });
    Object.defineProperty(globalThis, 'getComputedStyle', { configurable: true, value: (node: typeof scroller) => node.style });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { querySelector: () => selected,
        querySelectorAll: (selector: string) => selector === '.atlas-card' ? cards : selector.startsWith('.korea-pages') ? [variant] : [] } });
    const requested: string[] = [], retained: string[] = [];
    const renderer = Object.assign(Object.create(AirrunRenderer.prototype), { previewRequests: new Map(), lastFleetPreview: -Infinity, lastPreviewPanel: '', studio: {
        requestTheme: (id: string, variant?: number) => { requested.push(id + (variant === undefined ? '' : ':' + variant)); return Promise.resolve({ status: 'cancelled' }); },
        retainRequests: (ids: string[]) => retained.push(...ids),
    } });
    renderer.syncLobbyPreviews({ ...useAirrun.getState(), panel: 'atlas' }, 1000);
    check(JSON.stringify(requested) === JSON.stringify(['city', 'coast', 'desert', 'korea:1']), 'Selected detail comes first; clipped, below-screen and unrelated themes never prepare');
    check(retained.length === 4 && retained.every(id => id.startsWith('theme:')), 'Exactly the selected/visible atlas IDs retain preview work');
    await Promise.resolve();
} finally {
    for (const key of globals) { const descriptor = descriptors.get(key); if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
}

// Moving offscreen cancels queued jobs without decoding models. Inputs retain
// their queued requests until a later quiet frame, rather than losing images.
let preparations = 0;
const preparationLibrary = new ModelLibrary();
preparationLibrary.byId = catalog;
preparationLibrary.instance = async () => { preparations++; throw new Error('test preparation boundary'); };
const outcomes: string[] = [];
const studio = new ThumbnailStudio({} as T.WebGLRenderer, preparationLibrary, null, outcome => outcomes.push(outcome.id + ':' + outcome.status));
const offscreen = studio.requestAircraft('skyhawk'), visible = studio.requestAircraft('beaver');
studio.retainRequests(['aircraft:beaver']);
check((await offscreen).status === 'cancelled', 'Offscreen queued work settles immediately');
for (let frame = 0; frame < 20; frame++) studio.tick(true, frame * 20, false);
await Promise.resolve(); check(preparations === 0, 'Busy interaction frames perform no native preparation or capture');
studio.tick(true, 800, true);
check((await visible).status === 'error' && preparations === 1, 'The same queued request starts once after quiet admission');
studio.dispose(); preparationLibrary.dispose();

// Cancel during an async model load, then deliver its model late. It must be
// released once and never become a ready GPU shot or an image callback.
let resolveModel!: (instance: ModelInstance) => void, lateDisposals = 0;
const lateLibrary = new ModelLibrary(); lateLibrary.byId = catalog;
lateLibrary.instance = () => new Promise(resolve => { resolveModel = resolve; });
const lateStudio = new ThumbnailStudio({} as T.WebGLRenderer, lateLibrary, null, () => {});
const late = lateStudio.requestAircraft('skyhawk'); lateStudio.tick(true, 0);
for (let i = 0; i < 8 && !resolveModel; i++) await Promise.resolve();
check(!!resolveModel, 'A real asynchronous preparation has started');
lateStudio.retainRequests([]); check((await late).status === 'cancelled', 'Active offscreen request settles before its model arrives');
resolveModel({ dispose: () => { lateDisposals++; } } as ModelInstance);
for (let i = 0; i < 8; i++) await Promise.resolve();
check(lateDisposals === 1, 'Late cancelled native instance is disposed exactly once');
lateStudio.dispose(); lateLibrary.dispose();

const oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const oldRAF = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');
let raf = 0, renders = 0, loadingChecks = 0;
try {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { hidden: true } });
    Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, value: () => ++raf });
    const renderer = Object.assign(Object.create(AirrunRenderer.prototype), { disposed: false, lastFrame: 2, accumulator: .1, presentationElapsed: .1,
        render: () => renders++, completeLoading: () => loadingChecks++ });
    renderer.frame(1000);
    check(raf === 1 && renders === 0 && loadingChecks === 0, 'A hidden tab schedules its next callback without GPU or loading-loop work');
    check(renderer.lastFrame === 1000 && renderer.accumulator === 0 && renderer.presentationElapsed === 0, 'Hidden time cannot accumulate a physics or presentation catch-up');
} finally {
    if (oldDocument) Object.defineProperty(globalThis, 'document', oldDocument); else Reflect.deleteProperty(globalThis, 'document');
    if (oldRAF) Object.defineProperty(globalThis, 'requestAnimationFrame', oldRAF); else Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
}

// Keyboard banking must respect browser shortcuts and input focus. Exercise
// the actual registered handler, not a duplicate mapping of key codes.
const priorWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const priorDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const stateBeforeKeys = useAirrun.getState();
const handlers = new Map<string, (event: KeyboardEvent) => void>();
const documentHandlers = new Map<string, EventListener>();
let pausedAudio = false;
const keyRenderer = Object.assign(Object.create(AirrunRenderer.prototype), { cleanupListeners: [], held: new Set<string>(), dragPoints: new Map(), orbit: {},
    renderer: { domElement: { addEventListener() {}, removeEventListener() {} } }, audio: { update: (_settings: unknown, _sim: unknown, paused: boolean) => { pausedAudio = paused; } } });
try {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { addEventListener: (type: string, handler: (event: KeyboardEvent) => void) => handlers.set(type, handler), removeEventListener() {} } });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { hidden: false, addEventListener: (type: string, handler: EventListener) => documentHandlers.set(type, handler), removeEventListener() {} } });
    keyRenderer.bind();
    let requests = 0, prevented = 0;
    useAirrun.setState({ phase: 'flying', bankFlow: () => requests++ });
    const event = (patch = {}) => ({ target: null, code: 'KeyF', repeat: false, ctrlKey: false, metaKey: false, altKey: false, preventDefault: () => prevented++, ...patch } as unknown as KeyboardEvent);
    handlers.get('keydown')!(event({ ctrlKey: true })); handlers.get('keydown')!(event({ metaKey: true })); handlers.get('keydown')!(event({ altKey: true }));
    check(requests === 0 && prevented === 0, 'Browser and system shortcuts cannot accidentally bank flow');
    handlers.get('keydown')!(event());
    check(requests === 1 && prevented === 1, 'F dispatches one live banking request and consumes the gameplay key');
    handlers.get('keydown')!(event({ repeat: true }));
    check(requests === 1, 'Key repeat never duplicates a bank request');
    useAirrun.setState({ phase: 'hangar' }); handlers.get('keydown')!(event());
    check(requests === 1, 'F cannot bank from a lobby menu');
    useAirrun.setState({ phase: 'flying' }); Reflect.set(document, 'hidden', true);
    documentHandlers.get('visibilitychange')!(new Event('visibilitychange'));
    check(pausedAudio && useAirrun.getState().phase === 'paused', 'Hiding pauses audio immediately before the frame loop stops running');
} finally {
    for (const cleanup of keyRenderer.cleanupListeners) cleanup();
    useAirrun.setState(stateBeforeKeys, true);
    if (priorWindow) Object.defineProperty(globalThis, 'window', priorWindow); else Reflect.deleteProperty(globalThis, 'window');
    if (priorDocument) Object.defineProperty(globalThis, 'document', priorDocument); else Reflect.deleteProperty(globalThis, 'document');
}

// The stream owns leases, not the shared library. Work that resolves after its
// world was disposed must not initiate fresh collision downloads or failures.
for (const fail of [false, true]) {
    const library = new ModelLibrary(); library.byId = catalog;
    const gates: { resolve: (value: GLTF) => void; reject: (error: Error) => void }[] = [];
    let proxyRequests = 0;
    library.load = () => new Promise<GLTF>((resolve, reject) => gates.push({ resolve, reject }));
    library.loadProxy = async () => { proxyRequests++; };
    const stream = new FlightStream(library), sim = createSim(); stream.update(sim);
    const pending = [...stream.pending.values()]; check(pending.length > 0, 'A stream really has outstanding loads');
    stream.dispose();
    for (const gate of gates) if (fail) gate.reject(new Error('late failure')); else gate.resolve({ scene: new T.Group(), animations: [] } as unknown as GLTF);
    await Promise.all(pending);
    check(proxyRequests === 0 && stream.failures.size === 0 && stream.pending.size === 0, 'Disposed stream never starts late proxy work or resurrects state');
    check([...library.references.values()].every(n => n === 0), 'Disposal releases every lease despite pending shared loads'); library.dispose();
}

let startupBytes = 0, originalStartupBytes = 0;
const oldStartup = ['cessna_skyhawk', 'airport_control_tower', 'airport_windsock_gimbal', 'rocky_arch', 'sea_stacks', 'lighthouse', 'coastal_fishing_hamlet', 'coastal_bridge', 'coastal_rescue_patrol_boat', 'harbor_working_container_crane'];
const nativeBytes = (id: string) => {
    const meta = catalog.get(id)!, lod = id === 'cessna_skyhawk' ? 0 : compatibleModelLOD(meta, 2);
    return fs.statSync(path.join('public', meta.exports[('lod' + lod) as 'lod0']!)).size + fs.statSync(path.join('public', meta.proxy!)).size;
};
try {
    globalThis.fetch = async url => { const bytes = fs.readFileSync(path.join('public', String(url).split('?')[0])); return new Response(bytes); };
    const library = new ModelLibrary(), loaded: string[] = [];
    library.download = async (_url, id) => { loaded.push(id); return new Uint8Array([0]); };
    library.loader.parseAsync = async () => ({ scene: new T.Group(), animations: [] }) as unknown as GLTF;
    library.loadProxy = async id => { library.proxies.set(id, { id, static: [], dynamic: [] } as never); };
    await library.init(() => {});
    check(library.byId.size === 407, 'Startup optimization preserves all 403 supplied and 4 traffic catalogue entries');
    check(loaded.length === 3 && loaded.includes('cessna_skyhawk') && !loaded.includes('lighthouse'), 'Only aircraft and actual native airport props block initial entry');
    originalStartupBytes = oldStartup.reduce((sum, id) => sum + nativeBytes(id), 0); startupBytes = loaded.reduce((sum, id) => sum + nativeBytes(id), 0);
    check(startupBytes < originalStartupBytes, 'Unrelated coast geometry and collision bytes move out of the entry path');
    const flight = createSim({ catalog: library.byId, proxies: library.proxies }), stream = new FlightStream(library); await stream.prepare(flight);
    check(flightDeckAssets('coast', 0, library.byId).every(id => library.ready(id)), 'Actual first-flight base geometry and collision data remain ready before takeoff');
    stream.dispose(); library.dispose();
} finally { globalThis.fetch = nativeFetch; }
console.log(JSON.stringify({ renderResponsivenessChecks: checks, originalEntryBytes: originalStartupBytes, optimizedEntryBytes: startupBytes, softwareOrHardwareFPSMeasured: false, status: 'passed' }));
