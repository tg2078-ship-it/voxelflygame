import type { Aircraft, Theme, Settings, PracticeConfig, Metrics, Save, ThemeId, WeatherKind } from './types';
export const VERSION = '13.0.0';
export const COURSE_EDITION = 7;
export const WORLD_IMAGE_REVISION = 'v13-flightworks';
export const AIRCRAFT: Aircraft[] = [
    {
        "id": "skyhawk",
        "model": "cessna_skyhawk",
        "name": "Cessna Skyhawk",
        "kind": "경비행기",
        "kindEn": "LIGHT AIRCRAFT",
        "grade": "C",
        "price": 0,
        "speed": 1,
        "accel": 1,
        "handling": 1,
        "hp": 100,
        "role": "당신의 첫 비행. 안정적인 균형형.",
        "roleEn": "Your first flight. A balanced all-rounder.",
        "span": 10.994,
        "length": 8.557
    },
    {
        "id": "beaver",
        "model": "dhc2_beaver",
        "name": "DHC-2 Beaver",
        "kind": "수상 경비행기",
        "kindEn": "FLOATPLANE",
        "grade": "C",
        "price": 600,
        "speed": 0.96,
        "accel": 0.94,
        "handling": 0.92,
        "hp": 125,
        "role": "단단한 동체와 여유 있는 내구도.",
        "roleEn": "Built for resilience and steady flying.",
        "span": 14.594,
        "length": 8.64
    },
    {
        "id": "stearman",
        "model": "stearman_model_75",
        "name": "Stearman Model 75",
        "kind": "클래식 복엽기",
        "kindEn": "CLASSIC BIPLANE",
        "grade": "B",
        "price": 1500,
        "speed": 1.02,
        "accel": 1.08,
        "handling": 1.1,
        "hp": 120,
        "role": "두 날개의 우아함. 안정적인 선회.",
        "roleEn": "Two wings. Elegant, dependable turns.",
        "span": 9.824,
        "length": 7.38
    },
    {
        "id": "pitts",
        "model": "pitts_s2c",
        "name": "Pitts S-2C",
        "kind": "곡예 복엽기",
        "kindEn": "AEROBATIC BIPLANE",
        "grade": "B",
        "price": 1800,
        "speed": 1.06,
        "accel": 1.16,
        "handling": 1.18,
        "hp": 105,
        "role": "작은 실루엣과 날카로운 반응.",
        "roleEn": "A compact silhouette with sharp response.",
        "span": 6.134,
        "length": 5.445
    },
    {
        "id": "extra",
        "model": "extra_330lx",
        "name": "EXTRA 330LX",
        "kind": "정밀 곡예기",
        "kindEn": "PRECISION AEROBAT",
        "grade": "A",
        "price": 4500,
        "speed": 1.08,
        "accel": 1.24,
        "handling": 1.28,
        "hp": 120,
        "role": "좁은 경로를 위한 섬세한 조종.",
        "roleEn": "Precise control for the narrowest lines.",
        "span": 8.024,
        "length": 6.892
    },
    {
        "id": "mustang",
        "model": "p51d_mustang",
        "name": "P-51D Mustang",
        "kind": "클래식 전투기",
        "kindEn": "CLASSIC WARBIRD",
        "grade": "A",
        "price": 5500,
        "speed": 1.12,
        "accel": 1.3,
        "handling": 1.12,
        "hp": 140,
        "role": "힘 있는 엔진. 속도와 내구의 조화.",
        "roleEn": "Power, speed and a resilient airframe.",
        "span": 11.264,
        "length": 9.862
    },
    {
        "id": "albatros",
        "model": "l39_albatros",
        "name": "L-39 Albatros",
        "kind": "균형 제트기",
        "kindEn": "JET TRAINER",
        "grade": "S",
        "price": 10000,
        "speed": 1.14,
        "accel": 1.36,
        "handling": 1.32,
        "hp": 140,
        "role": "제트 성능과 부드러운 궤적.",
        "roleEn": "Jet performance with a smooth flight path.",
        "span": 9.72,
        "length": 12.157,
        "jet": true
    },
    {
        "id": "falcon",
        "model": "f16_fighting_falcon",
        "name": "F-16 Fighting Falcon",
        "kind": "전투 제트기",
        "kindEn": "FIGHTER JET",
        "grade": "S",
        "price": 12000,
        "speed": 1.18,
        "accel": 1.45,
        "handling": 1.38,
        "hp": 125,
        "role": "강력한 가속과 최상급 조종성.",
        "roleEn": "Powerful acceleration. Exceptional control.",
        "span": 9.9,
        "length": 15.345,
        "jet": true
    },
    {
        "id": "tundra",
        "model": "bush_stol_tundra",
        "name": "Tundra STOL",
        "kind": "험지 경비행기",
        "kindEn": "BUSH STOL",
        "grade": "C",
        "price": 850,
        "speed": 0.98,
        "accel": 1.12,
        "handling": 1.02,
        "hp": 115,
        "role": "큰 타이어와 단단한 골격. 빠른 초기 반응.",
        "roleEn": "Rugged hardware with a quick initial response.",
        "span": 13.082,
        "length": 10.25
    },
    {
        "id": "amphibian",
        "model": "amphibious_twin_float",
        "name": "Amphibious Twin",
        "kind": "쌍발 수상기",
        "kindEn": "TWIN FLOATPLANE",
        "grade": "B",
        "price": 2400,
        "speed": 1.03,
        "accel": 1.12,
        "handling": 1.05,
        "hp": 150,
        "role": "두 엔진과 플로트. 내구도 중심의 긴 비행.",
        "roleEn": "Twin engines, floats and endurance for longer runs.",
        "span": 16.621,
        "length": 11.446
    },
    {
        "id": "canard",
        "model": "canard_pusher_scout",
        "name": "Canard Scout",
        "kind": "카나드 경비행기",
        "kindEn": "CANARD SCOUT",
        "grade": "B",
        "price": 2800,
        "speed": 1.04,
        "accel": 1.18,
        "handling": 1.2,
        "hp": 110,
        "role": "앞날개와 푸셔 엔진. 정교한 저속 선회.",
        "roleEn": "Canard wings and a pusher engine for precise turns.",
        "span": 11.603,
        "length": 9.296
    },
    {
        "id": "twinboom",
        "model": "twin_boom_cargo_scout",
        "name": "Twin Boom Scout",
        "kind": "쌍동체 정찰기",
        "kindEn": "TWIN BOOM SCOUT",
        "grade": "A",
        "price": 4800,
        "speed": 1.07,
        "accel": 1.25,
        "handling": 1.13,
        "hp": 145,
        "role": "쌍동체의 안정감. 화물기 골격과 균형 있는 기동.",
        "roleEn": "Twin-boom stability with resilient cargo hardware.",
        "span": 14.202,
        "length": 12.096
    },
    {
        "id": "commuter",
        "model": "twin_engine_commuter",
        "name": "Twin Commuter",
        "kind": "쌍발 커뮤터",
        "kindEn": "TWIN COMMUTER",
        "grade": "A",
        "price": 6200,
        "speed": 1.09,
        "accel": 1.27,
        "handling": 1.1,
        "hp": 160,
        "role": "두 엔진의 지속 출력. 속도와 내구도의 균형.",
        "roleEn": "Sustained twin-engine power with balanced endurance.",
        "span": 18.6,
        "length": 15.84
    },
    {
        "id": "fireboat",
        "model": "firefighting_flying_boat",
        "name": "Fireboat",
        "kind": "소방 비행정",
        "kindEn": "FIREFIGHTING BOAT",
        "grade": "A",
        "price": 7000,
        "speed": 1.05,
        "accel": 1.2,
        "handling": 1.04,
        "hp": 190,
        "role": "넓은 동체와 높은 내구도. 여유 있는 생존 비행.",
        "roleEn": "A broad flying-boat hull built for resilience.",
        "span": 19.981,
        "length": 14.829
    },
    {
        "id": "delta",
        "model": "delta_interceptor_jet",
        "name": "Delta Interceptor",
        "kind": "델타 요격기",
        "kindEn": "DELTA INTERCEPTOR",
        "grade": "S",
        "price": 14500,
        "speed": 1.2,
        "accel": 1.48,
        "handling": 1.3,
        "hp": 135,
        "role": "강한 추진력. 가장 빠른 직선 돌파.",
        "roleEn": "Strong thrust and the fastest straight-line performance.",
        "span": 13.574,
        "length": 13.664,
        "jet": true
    },
    {
        "id": "swept",
        "model": "forward_swept_test_jet",
        "name": "Forward Swept X",
        "kind": "전진익 실험기",
        "kindEn": "FORWARD SWEPT JET",
        "grade": "S",
        "price": 16000,
        "speed": 1.17,
        "accel": 1.42,
        "handling": 1.48,
        "hp": 130,
        "role": "전진익과 정밀 조종. 제트 기체 최고의 선회 반응.",
        "roleEn": "Forward-swept wings with exceptional turning response.",
        "span": 12.186,
        "length": 12.634,
        "jet": true
    },
    {
        "id": "gyro",
        "model": "autogyro_patrol",
        "name": "Autogyro Patrol",
        "kind": "정찰 자이로플레인",
        "kindEn": "PATROL AUTOGYRO",
        "grade": "C",
        "price": 900,
        "speed": 0.94,
        "accel": 1.09,
        "handling": 1.18,
        "hp": 100,
        "role": "낮은 속도와 민첩한 반응. 저공 탐험에 특화.",
        "roleEn": "A nimble low-altitude explorer with responsive controls.",
        "span": 11.564,
        "length": 6.25
    },
    {
        "id": "coaxial",
        "model": "coaxial_utility_helicopter",
        "name": "Coaxial Utility",
        "kind": "동축 로터 헬리콥터",
        "kindEn": "COAXIAL HELICOPTER",
        "grade": "B",
        "price": 2600,
        "speed": 1.01,
        "accel": 1.15,
        "handling": 1.22,
        "hp": 145,
        "role": "동축 로터와 높은 내구도. 안정적인 회피.",
        "roleEn": "Twin coaxial rotors with stable handling and strong endurance.",
        "span": 11.564,
        "length": 10.203
    },
    {
        "id": "rescue",
        "model": "rescue_helicopter",
        "name": "Rescue One",
        "kind": "구조 헬리콥터",
        "kindEn": "RESCUE HELICOPTER",
        "grade": "B",
        "price": 3200,
        "speed": 1.03,
        "accel": 1.19,
        "handling": 1.25,
        "hp": 140,
        "role": "구조 임무의 정밀한 조종 반응.",
        "roleEn": "Precise rescue-flight control in a forward-flight arcade profile.",
        "span": 13.851,
        "length": 10.685
    },
    {
        "id": "sailplane",
        "model": "sailplane",
        "name": "Alpine Sailplane",
        "kind": "고성능 글라이더",
        "kindEn": "PERFORMANCE GLIDER",
        "grade": "A",
        "price": 5200,
        "speed": 1.1,
        "accel": 1.12,
        "handling": 1.38,
        "hp": 105,
        "role": "긴 날개와 부드러운 선회. 넓은 경로를 읽는 비행.",
        "roleEn": "Long wings, flowing turns and deliberate passage selection.",
        "span": 22.52,
        "length": 10.14
    },
    {
        "id": "transport",
        "model": "heavy_transport",
        "name": "Heavy Transport",
        "kind": "대형 수송기",
        "kindEn": "HEAVY TRANSPORT",
        "grade": "A",
        "price": 8200,
        "speed": 1.12,
        "accel": 1.3,
        "handling": 1.06,
        "hp": 235,
        "role": "가장 넓은 날개와 강한 내구도. 통과 폭에 주의.",
        "roleEn": "The broadest wings and exceptional endurance. Read your clearance.",
        "span": 30.976,
        "length": 25.408
    },
    {
        "id": "tiltrotor",
        "model": "tiltrotor_rescue_vtol",
        "name": "Tiltrotor Rescue",
        "kind": "틸트로터 구조기",
        "kindEn": "TILTROTOR RESCUE",
        "grade": "S",
        "price": 17500,
        "speed": 1.16,
        "accel": 1.44,
        "handling": 1.41,
        "hp": 180,
        "role": "회전 나셀과 강한 출력. 속도와 조종의 균형.",
        "roleEn": "Tilting nacelles and powerful propulsion with balanced control.",
        "span": 20.3,
        "length": 12.454
    }
];
export const THEMES: Theme[] = [
    { id: 'coast', name: '해안', en: 'SUNLIT COAST', color: '#edc082', ground: '#cebd87', rock: '#766c59', sky: '#8dcbdf', water: true, category: 'coastal', description: '청록빛 바다 위, 절벽과 항구 사이를 가르는 첫 비행.', descriptionEn: 'Your first flight over turquoise seas, cliffs and harbours.', landmarks: '연안 대교 · 등대 곶 · 컨테이너 항만', obstacles: '선박 · 크레인 · 교량 · 해식 암주' },
    { id: 'village', name: '마을', en: 'WINDMILL VALLEY', color: '#b7cd86', ground: '#80965a', rock: '#7d7963', sky: '#abd0da', water: false, category: 'village', description: '붉은 지붕, 돌아가는 풍차, 골목을 잇는 돌다리.', descriptionEn: 'Red roofs, turning windmills and stone bridges over village lanes.', landmarks: '물레방아 · 시장 광장 · 종탑', obstacles: '지붕 · 풍차 · 담장 · 나무' },
    { id: 'city', name: '도시', en: 'SKYLINE DISTRICT', color: '#89c5d7', ground: '#687c73', rock: '#606675', sky: '#a2c7d4', water: false, category: 'city', description: '유리와 벽돌의 스카이라인. 빌딩 사이 새로운 경로를 찾으세요.', descriptionEn: 'Glass and brick skylines. Find your line between the towers.', landmarks: '공중 회랑 · 중앙역 · 건설 지구', obstacles: '빌딩 · 크레인 · 열차 · 드론' },
    { id: 'ice', name: '설원·빙하', en: 'GLACIER PASS', color: '#c1e8f4', ground: '#d7e5e5', rock: '#669ab4', sky: '#a7c7dc', water: true, category: 'snow_ice', description: '깊은 푸른 얼음과 눈송이. 빙벽 사이로 열린 길.', descriptionEn: 'Deep blue ice and snowflakes. An opening through the glacier.', landmarks: '빙하 아치 · 극지 연구소 · 얼어붙은 호수', obstacles: '빙벽 · 빙주 · 설송 · 쇄빙선' },
    { id: 'desert', name: '사막·협곡', en: 'REDSTONE CANYON', color: '#e0a363', ground: '#c79858', rock: '#ae6b4a', sky: '#becacb', water: false, category: 'desert_canyon', description: '황금 모래와 붉은 층리. 굽이치는 협곡의 빠른 리듬.', descriptionEn: 'Golden sands and red strata. Follow the rhythm of the canyon.', landmarks: '그랜드캐니언 참고 협곡 · 오아시스 · 철도 다리', obstacles: '암주 · 아치 · 협곡 · 열차' },
    { id: 'forest', name: '숲·산악·호수', en: 'ALPINE LAKES', color: '#95c5a8', ground: '#557b50', rock: '#788178', sky: '#a5d0da', water: true, category: 'forest_mountain_lake', description: '겹겹이 쌓인 능선, 깊은 숲, 반짝이는 산악 호수.', descriptionEn: 'Layered ridges, deep forests and glistening alpine lakes.', landmarks: '산악 댐 · 산장 · 자연 암문', obstacles: '침엽수 · 능선 · 바위 · 새 떼' },
    { id: 'farm', name: '농촌·초원', en: 'GOLDEN FIELDS', color: '#d6ce81', ground: '#97a85d', rock: '#8a8c66', sky: '#b0d2d7', water: false, category: 'farm', description: '황금빛 들판을 스치는 날개. 농로와 풍력발전기의 교차.', descriptionEn: 'Wings over golden fields, farm roads and turning turbines.', landmarks: '붉은 헛간 · 풍력 단지 · 곡물 창고', obstacles: '풍력발전기 · 트랙터 · 전선 지지대' },
    { id: 'korea', name: '한국', en: 'KOREAN LANDSCAPES', color: '#e7b098', ground: '#71976a', rock: '#71776e', sky: '#a4ced9', water: true, category: 'korean_landmarks', description: '한강의 도심, 궁궐의 처마, 산촌의 논밭, 바다의 다리.', descriptionEn: 'River skylines, palace eaves, mountain villages and coastal bridges.', landmarks: '남산서울타워 · 경복궁 · 광안대교 참고 풍경', obstacles: '한강 교량 · 성곽 · 항구 · 한옥' },
    { id: 'river', name: '강', en: 'RIVERBEND', color: '#80c7dc', ground: '#86a167', rock: '#788475', sky: '#a0cbdc', water: true, category: 'forest_mountain_lake', description: '넓은 강의 흐름. 모래톱과 수문, 지류 사이의 비행.', descriptionEn: 'Follow the broad river past sandbars, locks and tributaries.', landmarks: '수문 · 강변 대교 · 여객선', obstacles: '교량 · 선박 · 둑 · 강변 나무' },
    { id: 'landmark', name: '랜드마크', en: 'MONUMENT VALLEY', color: '#d9c0a0', ground: '#929b73', rock: '#95836d', sky: '#bdced3', water: false, category: 'korean_landmarks', description: '실제 명소의 인상과 가상의 거대한 건축이 만나는 곳.', descriptionEn: 'Real-world inspirations meet monumental fictional architecture.', landmarks: '절벽 성채 · 기념 아치 · 거대 타워', obstacles: '아치 · 성채 · 암벽 · 탑' },
    { id: 'aurora', name: '오로라 빙하 해안', en: 'NORTHERN LIGHTS', color: '#95e3cb', ground: '#cadede', rock: '#7bacbf', sky: '#859db7', water: true, category: 'snow_ice', special: true, description: '빙하 너머 하늘에 펼쳐지는 오로라의 빛.', descriptionEn: 'Aurora curtains unfold beyond a frozen coastline.', landmarks: '오로라 · 빙해 · 극지 등대', obstacles: '빙벽 · 빙주 · 얼음 아치' },
    { id: 'volcano', name: '화산섬', en: 'EMBER ISLAND', color: '#f49a64', ground: '#464a46', rock: '#575a55', sky: '#a1b0b8', water: true, category: 'special', special: true, description: '검은 현무암, 붉은 용암, 재 구름을 뚫는 비행.', descriptionEn: 'Black basalt, glowing lava and drifts of volcanic ash.', landmarks: '분화구 · 용암 강 · 현무암 절벽', obstacles: '암주 · 능선 · 분화구 외곽' },
    { id: 'waterfall', name: '거대 폭포 협곡', en: 'FALLING WATERS', color: '#a0dfdf', ground: '#537d63', rock: '#658377', sky: '#a5d0dc', water: true, category: 'special', special: true, description: '거대한 흰 물보라와 푸른 물안개가 감싸는 협곡.', descriptionEn: 'A canyon wrapped in white spray and blue water mist.', landmarks: '나이아가라 참고 폭포 · 협곡 대교', obstacles: '암벽 · 교량 · 물안개 · 숲' }
];
export const KOREA_VARIANTS = ['현대 도심·한강', '한옥·궁궐·성곽', '논밭·산촌', '항구·해안 도시'];
export const KOREA_VARIANTS_EN = ['River skyline', 'Palace & hanok', 'Mountain village', 'Coastal harbour'];
export const DEFAULT_SETTINGS: Settings = { difficulty: 'standard', control: 'hold', quality: 'high', resolutionScale: 1.25, volume: .75, music: .45, sfx: .8, sensitivity: 1, reducedMotion: false, skipTakeoff: false, leftHanded: false, language: 'ko', targetFPS: 60, adaptiveResolution: false };
export const DEFAULT_PRACTICE: PracticeConfig = { theme: 'coast', variant: 0, night: false, weather: 'clear', plane: 'skyhawk', level: 1 };
export const SKINS = [{ id: 'default', name: '오리지널', en: 'ORIGINAL', price: 0, color: '#e8e7df', accent: '#c63d32' }, { id: 'ocean', name: '오션 블루', en: 'OCEAN BLUE', price: 600, color: '#e7eef0', accent: '#138ac7' }, { id: 'sunrise', name: '선라이즈 오렌지', en: 'SUNRISE ORANGE', price: 600, color: '#f2d0a2', accent: '#ed672f' }, { id: 'midnight', name: '미드나이트 블랙', en: 'MIDNIGHT BLACK', price: 800, color: '#283343', accent: '#d3b873' },
    { id: 'courier', name: '오로라 윙', en: 'AURORA WING', price: 0, color: '#24545c', accent: '#84ffe1' }];
export const GEAR_RATIOS = [.70, .85, 1, 1.15, 1.35];
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const damp = (a: number, b: number, k: number, dt: number) => mix(a, b, 1 - Math.exp(-k * dt));
export function baseSpeed(d: number) { d = Math.max(0, d); return 40 + 12 * Math.log1p(d / 600) + .0006 * d; }
export function stats(p: Aircraft, level: number) {
    const steps = clamp(level, 1, 20) - 1;
    const grade = { C: 0, B: 1, A: 2, S: 3 }[p.grade];
    return {
        speed: 1.15 * (p.speed + grade*.035) * (1+.031*steps),
        accel: (p.accel + grade*.09) * (1+.075*steps),
        handling: (p.handling + grade*.055) * (1+.055*steps),
        hp: Math.round(p.hp * (1+.085*steps)),
    };
}
export function upgradeCost(p: Aircraft, l: number) { return 5 * Math.round(({ C: 45, B: 70, A: 110, S: 160 }[p.grade]) * l * (1 + .04 * (l - 1)) / 5); }
export function hash(n: number) { n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
export function rng(seed: number) { let n = seed >>> 0; return () => { n += 0x6d2b79f5; let t = n; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const themeCache = new Map<string, {
    theme: Theme;
    variant: number;
}>();
export function themeAt(seed: number, slot: number): {
    theme: Theme;
    variant: number;
} {
    const cacheKey = seed + ':' + slot, cached = themeCache.get(cacheKey);
    if (cached)
        return cached;
    const seq: ThemeId[] = ['coast', 'village', 'city'];
    const r = rng(seed ^ 0x16a971);
    let bag: ThemeId[] = [];
    for (let i = 3; i <= slot; i++) {
        const prev = THEMES.find(t => t.id === seq[i - 1])!;
        if (!prev.special && r() < .15) {
            const s = THEMES.filter(t => t.special && t.id !== seq[i - 2]);
            seq.push(s[Math.floor(r() * s.length)].id);
            continue;
        }
        if (!bag.length) {
            bag = THEMES.filter(t => !t.special).map(t => t.id);
            for (let j = bag.length - 1; j > 0; j--) {
                const k = Math.floor(r() * (j + 1));
                [bag[j], bag[k]] = [bag[k], bag[j]];
            }
        }
        let idx = bag.findIndex(t => t !== seq[i - 1] && t !== seq[i - 2]);
        if (idx < 0) {
            bag = THEMES.filter(t => !t.special && t.id !== seq[i - 1] && t.id !== seq[i - 2]).map(t => t.id);
            idx = Math.floor(r() * bag.length);
        }
        seq.push(bag.splice(idx, 1)[0]);
    }
    const theme = THEMES.find(t => t.id === seq[Math.max(0, slot)])!;
    const result = { theme, variant: theme.id === 'korea' ? (Math.floor(hash(seed ^ 0x772) * 4) + seq.filter(t => t === 'korea').length - 1) % 4 : 0 };
    themeCache.set(cacheKey, result);
    if (themeCache.size > 512)
        themeCache.delete(themeCache.keys().next().value!);
    return result;
}
export function emptyMetrics(): Metrics { return { minorHits: 0, recoveryDistance: 0, highRisk: 0, cleanDistance: 0, distance: 0, bonus: 0, coins: 0, rings: 0, crystals: 0, near: 0, narrow: 0, low: 0, boost: 0, maxCombo: 0, damage: 0, repair: 0, shieldBlocks: 0, brakePass: 0, directionPass: 0, riskPaths: 0, safePaths: 0, nightRings: 0, multRings: 0, slowPass: 0, turboNear: 0, bridgePass: 0, roofPass: 0, cityPass: 0, canyonPass: 0, forestNear: 0, coastLow: 0, postShield: 0, postRepair: 0, postE: 0, rainDistance: 0, snowSafe: 0, fogPass: 0, stormNear: 0, dayDistance: 0, nightDistance: 0, weatherCoins: {}, effects: [], weathers: [], themes: [], landmarks: [], themeTime: {}, time: 0 }; }
export function freshSave(): Save { return { schema: 3, balanceEdition: 7, nickname: '', coins: 0, owned: ['skyhawk'], levels: { skyhawk: 1 }, selected: 'skyhawk', skins: {}, skinSelected: {}, settings: { ...DEFAULT_SETTINGS }, quests: [], questSerial: 1, tickets: 0, career: 0, careerProgress: 0, careerDetail: {}, achievements: [], legacyPaid: [], landmarks: {}, discoveries: {}, totals: {}, bests: {}, runs: [], settled: [], checkpoint: null, upgraded: {}, validFlights: {}, planeDistance: {} }; }
export const fmt = (n: number) => Math.floor(n).toLocaleString('en-US');
export const distance = (d: number) => d < 1000 ? `${Math.floor(d)} m` : `${(d / 1000).toFixed(2)} km`;
export const duration = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
export const WEATHER_NAMES: Record<WeatherKind, [
    string,
    string
]> = { clear: ['맑음', 'CLEAR'], cloudy: ['흐림', 'OVERCAST'], rain: ['비', 'RAIN'], storm: ['폭풍', 'STORM'], fog: ['안개', 'FOG'] };
export const THEME_DETAILS_EN: Record<ThemeId, [
    string,
    string
]> = { coast: ['Lighthouses · coastal arches · harbours', 'Crane booms · seawalls · boats · coastal bridges'], village: ['Bell towers · stone gateways · watermills', 'Windmill blades · rooftops · market arcades'], city: ['Skyscrapers · metro stations · elevated roads', 'Construction cranes · drones · skybridges'], ice: ['Glaciers · polar stations · ice caves', 'Ice needles · frozen bridges · snowcats'], desert: ['Canyon arches · mesas · desert observatories', 'Rail trestles · oil pumps · layered cliffs'], forest: ['Alpine lakes · dams · mountain cabins', 'Pine forests · rope bridges · cable cars'], farm: ['Red barns · golden fields · wind farms', 'Silos · turbines · tractors · power lines'], korea: ['Seoul skyline · hanok villages · mountain paddies · Busan coast', 'Palace eaves · fortress walls · river bridges · harbours'], river: ['River locks · ferries · broad viaducts', 'Bridges · boats · riverbank structures'], landmark: ['Real-world inspired towers, palaces and fictional cliff castles', 'Monument arches · stone corridors · grand bridges'], aurora: ['Aurora above a polar coastline', 'Glacial walls · ice arches · polar infrastructure'], volcano: ['Volcanic islands · basalt cliffs · lava channels', 'Crater ridges · dark rock arches · island harbours'], waterfall: ['Grand waterfalls · misty canyons', 'Cliff walls · hanging bridges · spillways'] };
