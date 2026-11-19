import type { AdventureHUD, RunDebrief } from './adventure';
export type ThemeId = 'coast' | 'village' | 'city' | 'ice' | 'desert' | 'forest' | 'farm' | 'korea' | 'river' | 'landmark' | 'aurora' | 'volcano' | 'waterfall';
export type FlightMode = 'endless' | 'daily' | 'sortie';
export interface DailyBest { distance: number; score: number; combo: number; planeId: string; runId: string }
export interface DailyRouteRecord { normal?: DailyBest; hyper?: DailyBest; attempts: number; updatedAt: string }
export type Phase = 'loading' | 'registration' | 'airport' | 'opening' | 'hangar' | 'preflight' | 'takeoff' | 'flying' | 'paused' | 'crashing' | 'results';
export type Panel = 'hangar' | 'challenges' | 'atlas' | 'collection' | 'livery' | 'records' | 'settings' | 'controls';
export type ItemKind = 'coin' | 'crystal' | 'ring' | 'shield' | 'multiplier' | 'slow' | 'turbo' | 'repair';
export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog';
export type Language = 'ko' | 'en';
export type Grade = 'C' | 'B' | 'A' | 'S';
export interface Aircraft {
    id: string;
    model: string;
    name: string;
    kind: string;
    kindEn: string;
    grade: Grade;
    price: number;
    speed: number;
    accel: number;
    handling: number;
    hp: number;
    role: string;
    roleEn: string;
    span: number;
    length: number;
    jet?: boolean;
}
export interface Theme {
    id: ThemeId;
    name: string;
    en: string;
    color: string;
    ground: string;
    rock: string;
    sky: string;
    water: boolean;
    special?: boolean;
    category: string;
    description: string;
    descriptionEn: string;
    landmarks: string;
    obstacles: string;
}
export interface Settings {
    /** Optional for backups made before the 6.0 flight director. */
    difficulty?: import('./encounter-director').Difficulty;
    control: 'hold' | 'gear';
    quality: 'balanced' | 'high' | 'ultra';
    resolutionScale: 1 | 1.25 | 1.5;
    volume: number;
    music: number;
    sfx: number;
    sensitivity: number;
    reducedMotion: boolean;
    skipTakeoff: boolean;
    leftHanded: boolean;
    language: Language;
    targetFPS: 30 | 60;
    adaptiveResolution: boolean;
}
export interface PracticeConfig {
    theme: ThemeId;
    variant: number;
    night: boolean;
    weather: WeatherKind;
    plane: string;
    level: number;
}
export interface Metrics {
    minorHits: number;
    recoveryDistance: number;
    highRisk: number;
    cleanDistance: number;
    distance: number;
    bonus: number;
    coins: number;
    rings: number;
    crystals: number;
    near: number;
    narrow: number;
    low: number;
    boost: number;
    maxCombo: number;
    damage: number;
    repair: number;
    shieldBlocks: number;
    brakePass: number;
    directionPass: number;
    riskPaths: number;
    safePaths: number;
    nightRings: number;
    multRings: number;
    slowPass: number;
    turboNear: number;
    bridgePass: number;
    roofPass: number;
    cityPass: number;
    canyonPass: number;
    forestNear: number;
    coastLow: number;
    postShield: number;
    postRepair: number;
    postE: number;
    rainDistance: number;
    snowSafe: number;
    fogPass: number;
    stormNear: number;
    dayDistance: number;
    nightDistance: number;
    weatherCoins: Record<string, number>;
    effects: string[];
    weathers: string[];
    themes: string[];
    landmarks: string[];
    themeTime: Record<string, number>;
    time: number;
}
export interface RunResult {
    formation?: import('./formation').FormationLog;
    rush?: import('./rush').RushResult;
    courseEdition?: number;
    seed?: number;
    level?: number;
    contract?: import('./mastery').ContractResult;
    replay?: import('./mastery').FlightReplay;
    sortie?: import('./sortie').SortieResult;
    difficulty?: import('./encounter-director').Difficulty;
    mode?: FlightMode;
    dailyKey?: string;
    debrief?: RunDebrief;
    id: string;
    date: string;
    planeId: string;
    distance: number;
    bonus: number;
    score: number;
    coins: number;
    reward: number;
    maxCombo: number;
    eUsed: boolean;
    practice: boolean;
    interrupted: boolean;
    reason: string;
    reasonEn?: string;
    metrics: Metrics;
    discoveredModels?: string[];
    discoveryImages?: Record<string, string>;
    legacyReward?: boolean;
    newBest?: boolean;
}
export interface QuestSpec {
    id: string;
    family: string;
    tier: 1 | 2 | 3 | 4;
    label: string;
    en: string;
    target: number;
    key: string;
    mode: 'sum' | 'max' | 'special';
    gate?: string;
}
export interface Quest {
    uid: string;
    id: string;
    progress: number;
    detail: Record<string, number>;
    acceptedAt: number;
}
export interface Discovery {
    date: string;
    seconds: number;
    flights: number;
    image?: string;
    imageRevision?: string;
}
export interface Best {
    distance: number;
    score: number;
    combo: number;
}
export interface Save {
    dailyRecords?: Record<string, DailyRouteRecord>;
    schema: 3;
    nickname: string;
    coins: number;
    owned: string[];
    levels: Record<string, number>;
    selected: string;
    skins: Record<string, string[]>;
    skinSelected: Record<string, string>;
    settings: Settings;
    quests: Quest[];
    questSerial: number;
    tickets: number;
    career: number;
    careerProgress: number;
    careerDetail: Record<string, number>;
    achievements: string[];
    legacyPaid: string[];
    landmarks: Record<string, {
        date: string;
        visits: number;
    }>;
    discoveries: Record<string, Discovery>;
    modelDiscoveries?: string[];
    totals: Record<string, number>;
    bests: Record<string, Best>;
    runs: RunResult[];
    settled: string[];
    checkpoint: RunResult | null;
    upgraded: Record<string, boolean>;
    validFlights: Record<string, number>;
    planeDistance: Record<string, number>;
}
export interface Input {
    x: number;
    y: number;
    boost: boolean;
    brake: boolean;
    gear: number;
    pendingGear?: number;
    transmit?: boolean;
    rush?: boolean;
}
export interface Weather {
    kind: WeatherKind;
    cloud: number;
    rain: number;
    fog: number;
    wind: number;
    wet: number;
    night: number;
    lightning: number;
    snow: boolean;
}
export interface HUD {
    recordLine?: number;
    formation?: import('./formation').FormationHUD;
    rush?: import('./rush').RushHUD;
    journey?: import('./journey').JourneyHUD;
    contract?: import('./mastery').ContractResult;
    ghost?: { delta: number; score: number };
    sortie?: import('./sortie').SortieHUD;
    choice?: import('./route-choice').ChoiceHUD;
    difficulty?: import('./encounter-director').Difficulty;
    adventure?: AdventureHUD;
    distance: number;
    score: number;
    bonus: number;
    coins: number;
    combo: number;
    maxCombo: number;
    speed: number;
    hp: number;
    maxHp: number;
    altitude: number;
    time: number;
    theme: ThemeId;
    variant: number;
    weather: Weather;
    gear: number;
    boost: number;
    heat: number;
    eUsed: boolean;
    eRemaining: number;
    ePreparing?: boolean;
    effects: {
        kind: ItemKind;
        remaining: number;
    }[];
    message: string;
    messageEn: string;
    messageUntil: number;
    route: string;
    routeEn: string;
    navigation?: { distance: number; dx: number; dy: number; role: string; screen?: { x: number; y: number; visible: boolean } };
    fps: number;
    draws: number;
    triangles: number;
    metrics: Metrics;
    collection?: { found: number; total: number; latest: string };
}
export interface Vec {
    x: number;
    y: number;
    z: number;
}
export interface Box {
    min: Vec;
    max: Vec;
}
export interface Obstacle {
    animationPhase?: number;
    id: number;
    model: string;
    position: Vec;
    scale: Vec;
    yaw: number;
    size: Vec;
    small: boolean;
    role: string;
    moving?: {
        axis: 'x' | 'y' | 'z';
        amplitude: number;
        frequency: number;
        phase: number;
    };
    hit: boolean;
    scored: boolean;
    home?: Vec;
    proxyPosition?: Vec;
    proxy?: Box[];
}
export interface Pickup {
    id: number;
    kind: ItemKind;
    x: number;
    y: number;
    z: number;
    radius: number;
    collected: boolean;
    risk: boolean;
}
export interface RoutePoint {
    z: number;
    x: number;
    y: number;
    width: number;
    height: number;
    dangerX: number;
    dangerY: number;
    role: string;
}
export interface Placement {
    animationPhase?: number;
    /** Physical anchors survive high-speed route adaptation without lifting entire buildings. */
    anchored?: boolean;
    passage?: boolean;
    supported?: boolean;
    supportModel?: string;
    course?: boolean;
    group?: string;
    model: string;
    x: number;
    y: number;
    z: number;
    sx: number;
    sy: number;
    sz: number;
    yaw: number;
    collision: boolean;
    small?: boolean;
    role: string;
    move?: Obstacle['moving'];
}
export interface Encounter {
    entry?: { x: number; y: number };
    id: string;
    title: string;
    en: string;
    theme: ThemeId;
    variant: number;
    start: number;
    length: number;
    route: RoutePoint[];
    placements: Placement[];
    pickups: Pickup[];
    passed: Set<number>;
}
export interface AssetMeta {
    sourceLods?: { lod0: 0 | 1; lod1: 1; lod2: 2; lod3: 3 };
    id: string;
    title: string;
    category: string;
    exports: {
        lod0?: string;
        lod1: string;
        lod2: string;
        lod3?: string;
    };
    bounds: {
        min: number[];
        max: number[];
        size: number[];
    };
    lodBounds?: Partial<Record<'lod0' | 'lod1' | 'lod2' | 'lod3', { min: number[]; max: number[]; size: number[] }>>;
    renderCosts?: Partial<Record<'lod0' | 'lod1' | 'lod2' | 'lod3', { draws: number; triangles: number }>>;
    sockets: Record<string, number[]>;
    animations: {
        name: string;
        duration: number;
        autoplay: boolean;
        targets: string[];
    }[];
    animationsByLod?: Partial<Record<'lod0' | 'lod1' | 'lod2' | 'lod3', string[]>>;
    moving: boolean;
    clearances: unknown[];
    proxy?: string;
    textureHashes?: Record<string, string>;
    textureHashesByLod?: Partial<Record<'lod0' | 'lod1' | 'lod2' | 'lod3', Record<string, string>>>;
    preview?: string;
    edition?: number;
    authoringVersion?: string;
    mechanismFamily?: string;
    groundRotationX?: number;
    groundOffsetY?: number;
    motionBounds?: { min: number[]; max: number[]; size: number[] };
}
export interface Celebration {
    id: string;
    kind: 'quest' | 'career' | 'achievement' | 'aircraft' | 'upgrade';
    title: string;
    titleEn: string;
    coins: number;
    tier: number;
    detail?: string;
}
