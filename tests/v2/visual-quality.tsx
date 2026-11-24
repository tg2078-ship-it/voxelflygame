import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as T from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { DEFAULT_SETTINGS, freshSave } from '../../app/airrun/data';
import { parseSave, useAirrun } from '../../app/airrun/state';
import { ensureQuests } from '../../app/airrun/progression';
import { GRAPHICS, residentModelLOD, compatibleModelLOD, renderPixelRatio, resolutionFloor, supportedSamples, flightModelLOD } from '../../app/airrun/graphics';
import { AirrunRenderer } from '../../app/airrun/renderer';
import { ModelLibrary } from '../../app/airrun/assets';
import { FlightStream } from '../../app/airrun/flight-stream';
import { DisplayQualityControls } from '../../app/airrun/display-quality-controls';
import { createSky, createWater } from '../../app/airrun/shaders';
import { skyHorizonColor } from '../../app/airrun/atmosphere';
import { catalog, proxies, createSim } from './fixtures';
import type { Settings, Placement } from '../../app/airrun/types';
let checks = 0;
const check = (value: unknown, label: string) => { assert(value, label); checks++; };
const memory = new Map<string, string>();
Object.assign(globalThis, { devicePixelRatio: 1, innerWidth: 1920, innerHeight: 1080,
    localStorage: { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value) } });

// Old saves get a one-time display migration without losing pilot progress.
const legacy = ensureQuests(freshSave()); legacy.nickname = 'DETAIL PILOT'; legacy.coins = 17891;
legacy.levels.skyhawk = 7; legacy.bests.all = { distance: 9217, score: 15400, combo: 9 };
legacy.settings.quality = 'balanced'; legacy.settings.adaptiveResolution = true;
delete (legacy.settings as Partial<Settings>).resolutionScale;
const migrated = parseSave(legacy)!;
check(migrated?.settings.quality === 'high' && migrated.settings.resolutionScale === 1.25 && !migrated.settings.adaptiveResolution, 'old automatic low-quality settings migrate once');
check(migrated.coins === legacy.coins && migrated.levels.skyhawk === 7 && migrated.bests.all.score === 15400 && migrated.nickname === legacy.nickname, 'display migration preserves records, currency and upgrades');
check(legacy.settings.quality === 'balanced' && legacy.settings.adaptiveResolution, 'import validation does not mutate the input backup');
const invalidLegacy = structuredClone(legacy); (invalidLegacy.settings as any).adaptiveResolution = 'broken';
check(parseSave(invalidLegacy) === null, 'migration does not conceal corrupt legacy fields');
const explicit = ensureQuests(freshSave()); explicit.settings.quality = 'balanced'; explicit.settings.resolutionScale = 1;
check(parseSave(explicit)?.settings.quality === 'balanced' && parseSave(explicit)?.settings.resolutionScale === 1, 'subsequent explicit performance choices survive loading');
for (const invalid of [0, .8, 1.1, 2, '1.5', null, NaN]) {
    const save = structuredClone(explicit); (save.settings as any).resolutionScale = invalid;
    check(parseSave(save) === null, 'invalid resolution rejected: ' + invalid);
}
useAirrun.setState({ save: explicit }); useAirrun.getState().settings({ resolutionScale: 1.5 });
check(useAirrun.getState().save.settings.resolutionScale === 1.5, 'live settings apply a valid display selection');
useAirrun.getState().settings({ resolutionScale: .5 } as any);
check(useAirrun.getState().save.settings.resolutionScale === 1.5, 'live settings reject an invalid resolution');
for (const quality of ['balanced', 'high', 'ultra'] as const) for (const dpr of [.8, 1, 1.25, 2, 3]) {
    const values = ([1, 1.25, 1.5] as const).map(resolutionScale => renderPixelRatio({ ...DEFAULT_SETTINGS, quality, resolutionScale }, dpr));
    check(values[0] >= 1 && values[1] > values[0] && values[2] > values[1], 'each clarity choice has a distinct render resolution');
    check(values.every(value => resolutionFloor({ ...DEFAULT_SETTINGS, quality }, dpr) <= value), 'adaptive floor never exceeds requested resolution');
}
check(supportedSamples(2, [4]) === 0 && supportedSamples(4, [4, 2]) === 4 && supportedSamples(4, []) === 0, 'half-float format support determines real MSAA or fallback');

// Call the actual quality/resize methods using renderer boundary stubs, no WebGL.
const save = ensureQuests(freshSave()); useAirrun.setState({ save });
let ratio = 1, aoSize: number[] = [], aniso = 0, resized = 0;
const targets = [new T.WebGLRenderTarget(16, 16), new T.WebGLRenderTarget(16, 16)];
const qualityScene = new T.Scene(), sceneMaterial = new T.MeshStandardMaterial(), cachedMaterial = new T.MeshStandardMaterial();
qualityScene.add(new T.Mesh(new T.BoxGeometry(), sceneMaterial));
let formats = [4, 2];
const graphics = Object.assign(Object.create(AirrunRenderer.prototype), {
    disposed: false, lastQuality: '', camera: new T.PerspectiveCamera(), scene: qualityScene,
    renderer: { domElement: { clientWidth: 1920, clientHeight: 1080 }, shadowMap: {},
        capabilities: { getMaxAnisotropy: () => 8 }, getContext: () => ({ RENDERBUFFER: 1, RGBA16F: 2, SAMPLES: 3, getInternalformatParameter: () => new Int32Array(formats) }),
        setPixelRatio: (value: number) => ratio = value, getPixelRatio: () => ratio, setSize: () => resized++ },
    composer: { renderTarget1: targets[0], renderTarget2: targets[1], setPixelRatio: () => {}, setSize: () => {} },
    sun: new T.DirectionalLight(), ao: { enabled: false, setSize: (...size: number[]) => aoSize = size },
    bloom: { strength: 0 }, smaa: { enabled: true }, clouds: { setQuality: () => {} },
    library: { allMaterials: new Set([cachedMaterial]), setTextureAnisotropy: (value: number) => aniso = value },
});
graphics.applyQuality();
check(ratio === 1.25 && targets.every(target => target.samples === 2) && !graphics.smaa.enabled, 'HIGH configures supersampling and actual composer MSAA');
check(aniso === 8 && aoSize[0] === 1200 && aoSize[1] === 675, 'textures and contact occlusion use the selected physical resolution');
const initialResize = resized; graphics.applyQuality(); check(resized === initialResize, 'unchanged settings do not reallocate framebuffers each frame');
save.settings = { ...save.settings, quality: 'ultra', resolutionScale: 1.5 }; useAirrun.setState({ save }); graphics.applyQuality();
check(ratio === 1.5 && targets.every(target => target.samples === 4) && aoSize[0] === 2880, 'ULTRA applies its own samples and full-resolution occlusion');
formats = []; save.settings.resolutionScale = 1; useAirrun.setState({ save }); graphics.applyQuality();
check(targets.every(target => target.samples === 0) && graphics.smaa.enabled, 'unsupported half-float MSAA uses SMAA without an invalid target');
const versions = [sceneMaterial.version, cachedMaterial.version];
save.settings.quality = 'balanced'; useAirrun.setState({ save }); graphics.applyQuality();
check(sceneMaterial.version > versions[0] && cachedMaterial.version > versions[1], 'disabling shadows rebuilds live and cached shaders instead of retaining invalid shadow samplers');
const balancedVersions = [sceneMaterial.version, cachedMaterial.version];
save.settings.targetFPS = 30; useAirrun.setState({ save }); graphics.applyQuality();
check(sceneMaterial.version === balancedVersions[0] && cachedMaterial.version === balancedVersions[1], 'frame target changes preserve compatible material programs');
save.settings.quality = 'high'; useAirrun.setState({ save }); graphics.applyQuality();
check(sceneMaterial.version > balancedVersions[0] && cachedMaterial.version > balancedVersions[1], 'reenabling shadows also rebuilds both material groups');
qualityScene.traverse(node => { if (node instanceof T.Mesh) node.geometry.dispose(); });
sceneMaterial.dispose(); cachedMaterial.dispose();
targets.forEach(target => target.dispose());

// UI handlers and SSR accessibility are checked separately from browser layout.
let patch: Partial<Settings> = {};
const element = DisplayQualityControls({ settings: DEFAULT_SETTINGS, ko: true, onChange: value => patch = value });
const buttons: any[] = [];
function walk(node: React.ReactNode) { React.Children.forEach(node, child => { if (!React.isValidElement(child)) return; const props = child.props as any; if (child.type === 'button') buttons.push(child); walk(props.children); }); }
walk(element);
buttons[2].props.onClick(); check(patch.resolutionScale === 1.5 && patch.adaptiveResolution === false, '150% selection immediately disables adaptive downscaling');
buttons[3].props.onClick(); check(patch.quality === 'ultra' && patch.resolutionScale === 1.25 && patch.adaptiveResolution === false, 'quality preset updates all three display controls');
for (const ko of [true, false]) {
    const html = renderToStaticMarkup(<DisplayQualityControls settings={DEFAULT_SETTINGS} ko={ko} onChange={() => {}}/>);
    check(html.includes('100%') && html.includes('125%') && html.includes('150%') && html.includes('aria-pressed="true"'), 'both languages expose the selected resolution accessibly');
}

for (const meta of catalog.values()) for (const quality of ['balanced', 'high', 'ultra'] as const) {
    const lod = residentModelLOD(meta, quality);
    check(!!meta.exports[('lod' + lod) as 'lod0' | 'lod1' | 'lod2'], 'resident detail exists in the actual source pack');
    check(lod === compatibleModelLOD(meta, lod), 'resident detail preserves original silhouette and ground');
}
const library = new ModelLibrary(); library.byId = catalog; library.proxies = new Map(proxies);
library.download = async () => new Uint8Array([0]); library.loader.parseAsync = async () => ({ scene: new T.Group(), animations: [] } as unknown as GLTF);
const sim = createSim(); sim.config.settings.quality = 'balanced'; const stream = new FlightStream(library);
await stream.prepare(sim); const oldKeys = new Set(stream.retained);
sim.config.settings.quality = 'high'; stream.update(sim); await Promise.all(stream.pending.values());
check([...stream.retained].some(key => !oldKeys.has(key) && key.endsWith(':1')), 'quality changes promote the theme deck immediately at the same flight time');
library.trim(0); check([...stream.retained].every(key => library.cache.has(key)), 'higher-quality resident deck cannot be evicted under cache pressure');
stream.dispose(); check([...library.references.values()].every(value => value === 0), 'promoted residency releases old and new leases'); library.dispose();
const arch = catalog.get('rocky_arch')!;
const p: Placement = { model: arch.id, x: 32, y: 0, z: 75, sx: 2, sy: 2, sz: 2, yaw: 0, collision: false, role: 'landscape' };
check(flightModelLOD(arch, p, { x: 0, y: 24, z: 0, speed: 80, span: 11 }, 'high') === 0, 'large nearby scenery can use hero detail without a collision flag');

// Existing and newly arriving texture maps receive anisotropy without changing UV/filter choices.
const textures = new ModelLibrary(); textures.byId = catalog; textures.setTextureAnisotropy(8);
const texture = new T.Texture(); texture.repeat.set(2, 3); const beforeUV = texture.repeat.toArray();
const textured = { scene: new T.Group(), animations: [], parser: { associations: new Map() } } as unknown as GLTF;
textured.scene.add(new T.Mesh(new T.BoxGeometry(), new T.MeshStandardMaterial({ map: texture })));
textures.download = async () => new Uint8Array([0]); textures.loader.parseAsync = async () => textured;
await textures.load('lighthouse', 1);
check(texture.anisotropy === 8 && texture.repeat.toArray().join() === beforeUV.join(), 'arriving source textures receive clarity settings without changing UVs');
textures.setTextureAnisotropy(4); check(texture.anisotropy === 4, 'quality reductions update already-loaded textures'); textures.dispose();

// Real environment control flow: horizon, water and day/night lighting stay linked.
const sky = createSky(), water = createWater();
const lighting = Object.assign(Object.create(AirrunRenderer.prototype), {
    camera: new T.PerspectiveCamera(), scene: new T.Scene(), sky, water,
    sun: new T.DirectionalLight(), hemi: new T.HemisphereLight(), headlight: new T.SpotLight(),
    renderer: {}, grade: { uniforms: { uSpeed: {}, uBoost: {}, uDamage: {}, uE: {}, uRain: {}, uReduced: {} } },
    library: { flightLensClearance: { value: 0 }, environment: () => {} }, clouds: { mesh: new T.Object3D(), update: () => {}, drift: () => {} },
    lastCloud: -1, cloudClock: '', flightOffset: 0,
});
lighting.scene.fog = new T.FogExp2('#ffffff'); let dayEnvironment = 0;
for (const time of [0, 40, 98, 120, 150, 178]) {
    sim.time = sim.motionTime = time; sim.weather = sim.weatherController.get(time, 1, 'coast', 42, null);
    lighting.environment(sim, time);
    const horizon = skyHorizonColor(sky.uniforms.uNight.value, sky.uniforms.uCloud.value, sky.uniforms.uWarm.value, sky.uniforms.uDawn.value);
    check(lighting.scene.fog.color.equals(horizon) && water.uniforms.uFog.value.equals(horizon), 'water and fog match the live sky horizon throughout the day');
    check(water.uniforms.uSun.value.equals(sky.uniforms.uSun.value), 'sunlight direction is shared by sky and water');
    if (time === 40) dayEnvironment = lighting.scene.environmentIntensity;
    if (time === 150) check(lighting.scene.environmentIntensity < dayEnvironment, 'night reflections no longer retain full indoor daylight intensity');
}
sky.mesh.geometry.dispose(); sky.material.dispose(); water.mesh.geometry.dispose(); water.material.dispose();
console.log(JSON.stringify({ visualQualityChecks: checks, importedModels: catalog.size, renderBoundaryStubs: true, gpuVerified: false, browserLayoutVerified: false, fpsMeasured: false, status: 'passed' }));
