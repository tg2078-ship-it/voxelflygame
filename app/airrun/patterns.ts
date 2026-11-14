import type { ThemeId, Placement, RoutePoint, Encounter, Pickup, ItemKind, AssetMeta } from './types';
import { encounterFamily, scenicDistrict } from './environment-palette';
import { isWatercraft } from './model-kind';
import { rng, mix, clamp, hash } from './data';
import { groundAt, WATER_LEVEL, isWaterLandscape, deckSurfaceY } from './world-ground';
import { transformBox, sweepAABB } from './collision';
import { AIRSPACE } from './graphics';
export type Action = 'arch' | 'bridge' | 'wall' | 'slalom' | 'over' | 'under' | 'crane' | 'mover' | 'tunnel' | 'roof' | 'spire' | 'cross';
export interface Pattern {
    id: string;
    theme: ThemeId;
    variant: number;
    name: string;
    en: string;
    steps: [
        Action,
        number,
        number
    ][];
    spacing: number;
    generation?: import('./encounter-director').ProceduralGeneration;
}
// Each row authors a different route, action order and vertical rhythm in metres.
// Mirror and decoration variation are deliberately not counted as another pattern.
type Row = [
    string,
    string,
    string,
    number,
    number,
    number,
    number,
    number,
    number,
    number?
];
const rows: Record<string, Row[]> = {
    coast: [
        ['방파제', 'BREAKWATER', 'wall,over,slalom', 32, 25, -25, 32, 26, 18, 240], ['연안 교량', 'COASTAL VIADUCT', 'bridge,spire,under', -26, 18, 30, 36, -18, 24, 250], ['선박 행렬', 'CONVOY', 'mover,slalom,arch', 24, 22, -32, 28, 20, 33, 230], ['크레인 부두', 'CRANE QUAY', 'crane,under,over', -30, 28, 18, 16, 28, 38, 260], ['절벽 굴곡', 'CLIFF CURVE', 'arch,wall,spire', 32, 30, -28, 38, 24, 24, 220], ['등대 곶', 'LIGHTHOUSE POINT', 'spire,bridge,wall', -24, 34, 26, 19, -32, 29, 240], ['항만 진입', 'HARBOUR APPROACH', 'wall,cross,arch', 30, 23, -20, 35, 28, 24, 240], ['해변 리조트', 'BEACH RESORT', 'roof,over,under', -28, 25, 22, 40, -18, 22, 250], ['이동 화물선', 'MOVING FREIGHT', 'mover,crane,slalom', 24, 24, -28, 32, 26, 20, 235], ['복층 교량', 'DOUBLE DECK', 'under,bridge,over', -26, 17, 28, 35, -20, 48, 255], ['해식 암주', 'SEA STACKS', 'spire,arch,wall', 30, 24, -28, 40, 32, 30, 230], ['항구 출구', 'HARBOUR EXIT', 'crane,cross,tunnel', -30, 30, 24, 21, -26, 33, 245]
    ],
    village: [
        ['지붕의 높이', 'ROOFTOP RHYTHM', 'roof,over,arch', 28, 26, -22, 40, 30, 22], ['풍차 골목', 'WINDMILL LANE', 'mover,wall,bridge', -28, 25, 30, 32, -24, 19], ['시장 회랑', 'MARKET ARCADE', 'arch,under,roof', 30, 23, -28, 18, 20, 35], ['종탑의 그림자', 'BELL TOWER', 'spire,slalom,wall', -30, 35, 22, 26, -24, 24], ['물레방아 강변', 'MILL RIVER', 'bridge,mover,over', 26, 18, -28, 28, 30, 42], ['석벽 사이', 'STONE LANES', 'wall,arch,under', -28, 25, 28, 31, -20, 19], ['교회 언덕', 'CHURCH HILL', 'over,spire,roof', 30, 42, -26, 34, 28, 26], ['구불구불 농로', 'WINDING ROAD', 'slalom,cross,wall', -28, 24, 30, 26, -32, 34], ['광장 뒤 상승', 'PLAZA CLIMB', 'under,over,arch', 26, 18, -20, 44, 28, 32], ['지붕 다리', 'ROOF BRIDGES', 'bridge,roof,tunnel', -28, 24, 26, 35, -24, 25], ['숲 마을 경계', 'WOODLAND EDGE', 'spire,wall,slalom', 30, 32, -32, 23, 24, 30], ['황혼의 마을', 'VILLAGE DEPARTURE', 'roof,mover,arch', -30, 28, 24, 23, -26, 38]
    ],
    city: [
        ['빌딩 S자', 'SKYLINE S', 'wall,slalom,wall', 30, 32, -30, 35, 25, 28, 215], ['공중 회랑', 'SKYBRIDGE', 'bridge,under,over', -30, 26, 22, 20, -26, 46, 235], ['건설 지구', 'CONSTRUCTION ZONE', 'crane,wall,cross', 30, 36, -26, 26, 22, 42, 225], ['중앙역 진입', 'CENTRAL STATION', 'roof,mover,arch', -28, 25, 30, 23, -24, 34, 245], ['드론 항로', 'DRONE AIRWAY', 'mover,cross,wall', 26, 38, -30, 27, 30, 32, 230], ['공장 지붕', 'FACTORY ROOFS', 'over,under,spire', -28, 43, 28, 23, -24, 36, 235], ['고가도로', 'ELEVATED ROAD', 'under,bridge,cross', 30, 18, -26, 30, 24, 24, 250], ['옥상 착륙장', 'HELIPAD RUN', 'roof,wall,over', -28, 36, 28, 30, -22, 48, 225], ['전력 지구', 'POWER DISTRICT', 'spire,cross,under', 28, 31, -30, 38, 24, 22, 235], ['유리 협곡', 'GLASS CANYON', 'slalom,tunnel,wall', -32, 30, 28, 40, -30, 26, 220], ['간판 아래', 'NEON CORRIDOR', 'under,wall,mover', 28, 22, -26, 33, 30, 26, 240], ['도시 출구', 'METRO EXIT', 'crane,over,arch', -30, 35, 26, 45, -28, 27, 230]
    ],
    ice: [
        ['빙벽의 균열', 'GLACIER CRACK', 'wall,tunnel,spire', 30, 28, -26, 36, 24, 25], ['푸른 얼음문', 'BLUE ICE GATE', 'arch,under,wall', -28, 24, 28, 18, -30, 34], ['빙하 교량', 'FROZEN SPAN', 'bridge,spire,over', 28, 18, -30, 31, 26, 42], ['설송의 숲', 'SNOW FIRS', 'slalom,wall,arch', -30, 24, 28, 32, -26, 26], ['빙주 행렬', 'ICE NEEDLES', 'spire,cross,spire', 30, 34, -28, 25, 26, 40], ['극지 연구소', 'POLAR OUTPOST', 'roof,mover,under', -26, 27, 28, 20, -22, 18], ['빙하 동굴', 'ICE CAVE', 'tunnel,arch,over', 28, 26, -28, 34, 24, 44], ['쇄빙선 항로', 'ICEBREAKER LINE', 'mover,bridge,wall', -30, 25, 26, 18, -28, 32], ['차가운 능선', 'COLD RIDGE', 'over,wall,spire', 28, 42, -30, 33, 26, 28], ['눈보라 회랑', 'WHITE PASS', 'wall,under,arch', -28, 32, 30, 19, -24, 27], ['케이블 계곡', 'CABLE VALLEY', 'cross,bridge,mover', 30, 36, -26, 22, 28, 28], ['빙해 출구', 'ICE SEA EXIT', 'spire,tunnel,slalom', -30, 28, 28, 35, -26, 24]
    ],
    desert: [
        ['붉은 협곡', 'RED CANYON', 'wall,spire,tunnel', 28, 28, -28, 40, 26, 32, 230], ['자연 아치', 'NATURAL ARCH', 'arch,over,wall', -30, 26, 26, 43, -28, 30], ['모래 능선', 'SAND RIDGE', 'over,slalom,spire', 30, 44, -28, 30, 24, 38], ['철도 다리', 'RAIL TRESTLE', 'bridge,cross,mover', -28, 20, 28, 33, -24, 26], ['오아시스 회전', 'OASIS TURN', 'slalom,wall,roof', 28, 24, -30, 34, 26, 27], ['메사의 문', 'MESA GATE', 'tunnel,spire,arch', -30, 30, 26, 38, -28, 26], ['층리의 길', 'STRATA LINE', 'wall,over,under', 30, 32, -28, 44, 24, 20], ['광산 컨베이어', 'MINE CONVEYOR', 'crane,under,cross', -28, 33, 28, 19, -24, 30], ['사막 관측소', 'DESERT OBSERVATORY', 'roof,spire,wall', 28, 28, -30, 40, 24, 31], ['기름 펌프 지대', 'PUMP FIELD', 'mover,wall,over', -30, 24, 28, 32, -26, 44], ['암주 미로', 'SPIRE LABYRINTH', 'spire,slalom,arch', 30, 36, -32, 25, 28, 31, 220], ['협곡 출구', 'CANYON EXIT', 'tunnel,cross,bridge', -28, 32, 26, 38, -30, 20, 240]
    ],
    forest: [
        ['능선의 리듬', 'RIDGE RHYTHM', 'over,wall,spire', 30, 44, -28, 32, 24, 38], ['호수 다리', 'LAKE BRIDGE', 'bridge,slalom,under', -30, 18, 28, 25, -26, 21], ['소나무 회랑', 'PINE CORRIDOR', 'slalom,arch,wall', 28, 27, -30, 34, 26, 30], ['댐의 수문', 'DAM GATES', 'tunnel,under,over', -28, 26, 28, 20, -24, 44], ['산장 지붕', 'CABIN ROOFS', 'roof,spire,bridge', 28, 25, -30, 36, 24, 20], ['바위 능선', 'ROCKY RIDGE', 'spire,wall,over', -30, 34, 26, 28, -28, 46], ['계곡 케이블', 'VALLEY CABLE', 'cross,mover,arch', 30, 40, -28, 28, 24, 32], ['호숫가 부두', 'LAKESIDE DOCKS', 'under,roof,slalom', -28, 18, 26, 30, -30, 25], ['흔들 다리', 'ROPE CROSSING', 'bridge,wall,spire', 28, 24, -30, 34, 26, 40], ['폭포 옆 횡단', 'WATERFALL EDGE', 'cross,tunnel,over', -30, 38, 28, 28, -26, 44], ['나무 사이', 'TREE WEAVE', 'slalom,spire,wall', 30, 26, -32, 32, 28, 24, 220], ['산악 출구', 'ALPINE EXIT', 'over,arch,bridge', -28, 44, 30, 32, -24, 22]
    ],
    farm: [
        ['붉은 헛간', 'RED BARNS', 'roof,wall,over', 30, 26, -28, 32, 24, 42], ['풍력 회랑', 'TURBINE LANE', 'mover,cross,wall', -30, 30, 28, 38, -26, 26], ['황금 들판', 'GOLDEN FIELDS', 'slalom,over,bridge', 28, 22, -30, 38, 26, 18], ['곡물 창고', 'GRAIN STORES', 'spire,roof,under', -28, 34, 28, 25, -24, 18], ['농로 건널목', 'FARM CROSSING', 'cross,mover,arch', 30, 24, -28, 28, 24, 32], ['전력선 아래', 'BELOW THE LINES', 'under,wall,cross', -30, 20, 26, 30, -28, 36], ['과수원 바람', 'ORCHARD WIND', 'slalom,wall,over', 28, 24, -30, 31, 26, 42], ['관개 수로', 'IRRIGATION RUN', 'bridge,under,spire', -28, 18, 28, 23, -24, 36], ['온실 지붕', 'GREENHOUSE ROOFS', 'roof,over,wall', 28, 27, -30, 39, 24, 31], ['수확의 길', 'HARVEST LINE', 'mover,slalom,bridge', -30, 24, 28, 28, -26, 20], ['창고 사이', 'SILO WEAVE', 'spire,tunnel,roof', 30, 34, -28, 26, 24, 30], ['초원 출구', 'MEADOW EXIT', 'over,cross,arch', -30, 40, 28, 32, -24, 26]
    ],
    river: [
        ['강의 굽이', 'RIVER BEND', 'slalom,bridge,wall', 30, 25, -28, 18, 24, 32], ['수문 사이', 'LOCK GATES', 'tunnel,under,over', -28, 27, 28, 18, -24, 38], ['모래톱 우회', 'SANDBAR TURN', 'wall,spire,slalom', 28, 24, -30, 32, 26, 20], ['여객선 교차', 'FERRY CROSSING', 'mover,cross,bridge', -30, 24, 28, 30, -26, 18], ['강변 도시', 'RIVERSIDE TOWN', 'roof,wall,under', 28, 28, -30, 34, 24, 20], ['지류 선택', 'TRIBUTARY SPLIT', 'arch,slalom,spire', -28, 26, 28, 23, -24, 36], ['대교 아래', 'BELOW THE VIADUCT', 'bridge,under,wall', 30, 17, -28, 22, 24, 32], ['나루터', 'FERRY QUAY', 'mover,roof,arch', -30, 24, 28, 29, -26, 26], ['제방의 높이', 'EMBANKMENT', 'over,wall,bridge', 28, 40, -30, 28, 24, 20], ['수력 지구', 'HYDRO DISTRICT', 'tunnel,cross,spire', -28, 28, 28, 37, -24, 32], ['강변 숲', 'RIVER WOODS', 'slalom,spire,under', 30, 24, -28, 34, 24, 19], ['강의 합류', 'CONFLUENCE', 'bridge,wall,over', -30, 20, 28, 30, -26, 42]
    ],
    landmark: [
        ['성채 절벽', 'CASTLE CLIFF', 'wall,spire,arch', 30, 30, -28, 40, 24, 28], ['기념 아치', 'MONUMENT ARCH', 'arch,under,over', -30, 28, 28, 20, -26, 44], ['타워 외곽', 'TOWER ORBIT', 'spire,slalom,wall', 28, 36, -30, 28, 26, 34], ['궁전 회랑', 'PALACE ARCADE', 'roof,tunnel,bridge', -28, 26, 28, 32, -24, 22], ['거대 대교', 'GRAND VIADUCT', 'bridge,cross,spire', 30, 22, -28, 38, 24, 30], ['돌의 도시', 'STONE CITY', 'wall,roof,over', -30, 34, 28, 27, -26, 44], ['성문 진입', 'FORTRESS GATE', 'tunnel,arch,wall', 28, 28, -30, 32, 24, 36], ['수직의 정원', 'VERTICAL GARDEN', 'over,spire,under', -28, 46, 28, 34, -24, 22], ['절벽의 사원', 'CLIFF TEMPLE', 'roof,wall,spire', 30, 30, -28, 38, 24, 44], ['고대 다리', 'ANCIENT CROSSING', 'bridge,under,arch', -30, 21, 28, 24, -26, 32], ['기념비 길', 'MONUMENT LINE', 'spire,cross,wall', 28, 34, -30, 40, 26, 28], ['시대의 경계', 'TIME PASSAGE', 'arch,over,tunnel', -28, 30, 28, 46, -24, 34]
    ],
    aurora: [
        ['빛의 빙해', 'LIGHT ON ICE', 'wall,bridge,spire', 30, 28, -28, 20, 24, 36], ['오로라 회랑', 'AURORA CORRIDOR', 'arch,wall,tunnel', -30, 26, 28, 34, -26, 30], ['푸른 바늘', 'BLUE NEEDLES', 'spire,slalom,over', 28, 36, -30, 24, 26, 44], ['극지 항로', 'POLAR ROUTE', 'mover,bridge,arch', -28, 25, 28, 20, -24, 30], ['별빛 동굴', 'STARLIT CAVE', 'tunnel,under,wall', 30, 28, -28, 20, 24, 34], ['얼음 능선', 'ICY RIDGES', 'over,spire,bridge', -30, 44, 28, 36, -26, 21], ['하늘의 커튼', 'SKY CURTAINS', 'cross,arch,slalom', 28, 40, -30, 30, 26, 25], ['빙벽의 그림자', 'GLACIER SHADOW', 'wall,tunnel,over', -28, 34, 28, 28, -24, 46], ['얼어붙은 만', 'FROZEN BAY', 'bridge,mover,spire', 30, 20, -28, 26, 24, 34], ['빛의 굴곡', 'LIGHT CURVE', 'slalom,wall,arch', -30, 25, 28, 34, -26, 30], ['설송의 밤', 'FIR NIGHT', 'spire,under,roof', 28, 32, -30, 19, 26, 28], ['북쪽의 끝', 'NORTHERN EXIT', 'tunnel,cross,over', -28, 30, 28, 40, -24, 44]
    ],
    volcano: [
        ['현무암 문', 'BASALT GATE', 'arch,wall,spire', 30, 30, -28, 36, 24, 42], ['용암의 강', 'LAVA RIVER', 'bridge,over,wall', -30, 24, 28, 44, -26, 32], ['분화구 외곽', 'CRATER RIM', 'over,slalom,spire', 28, 46, -30, 34, 26, 40], ['검은 암주', 'BLACK NEEDLES', 'spire,tunnel,wall', -28, 38, 28, 28, -24, 34], ['재 구름 사이', 'ASH PASS', 'cross,arch,over', 30, 40, -28, 30, 24, 46], ['붉은 틈', 'EMBER CRACK', 'wall,under,spire', -30, 34, 28, 22, -26, 40], ['섬의 항구', 'ISLAND HARBOUR', 'mover,crane,bridge', 28, 24, -30, 32, 26, 20], ['화산 회랑', 'VOLCANIC CORRIDOR', 'tunnel,wall,over', -28, 32, 28, 38, -24, 48], ['흑색 해안', 'BLACK COAST', 'slalom,bridge,arch', 30, 25, -28, 20, 24, 30], ['열기의 능선', 'HEAT RIDGE', 'over,cross,spire', -30, 48, 28, 38, -26, 42], ['분출의 그림자', 'ERUPTION SHADOW', 'spire,wall,tunnel', 28, 40, -30, 34, 26, 30], ['화산섬 출구', 'EMBER EXIT', 'arch,over,bridge', -28, 32, 28, 46, -24, 24]
    ],
    waterfall: [
        ['흰 물보라', 'WHITE SPRAY', 'cross,arch,wall', 30, 38, -28, 30, 24, 34], ['폭포 옆 길', 'FALLSIDE LINE', 'wall,bridge,spire', -30, 32, 28, 22, -26, 40], ['물안개 문', 'MIST GATE', 'tunnel,under,over', 28, 28, -30, 20, 26, 44], ['협곡 횡단', 'CANYON CROSSING', 'bridge,cross,wall', -28, 24, 28, 38, -24, 32], ['수문의 높이', 'SPILLWAY', 'over,tunnel,under', 30, 44, -28, 30, 24, 21], ['바위 뒤 회전', 'ROCK TURN', 'spire,slalom,arch', -30, 38, 28, 26, -26, 32], ['폭포의 심장', 'HEART OF THE FALLS', 'arch,wall,over', 28, 30, -30, 36, 26, 46], ['녹색 절벽', 'GREEN CLIFFS', 'wall,roof,spire', -28, 34, 28, 28, -24, 42], ['떠 있는 다리', 'HANGING BRIDGE', 'bridge,under,cross', 30, 24, -28, 20, 24, 38], ['푸른 물길', 'BLUE CHANNEL', 'slalom,tunnel,wall', -30, 26, 28, 32, -26, 36], ['흔들리는 계곡', 'SWAYING VALLEY', 'mover,spire,over', 28, 28, -30, 36, 26, 46], ['폭포 출구', 'FALLS EXIT', 'cross,arch,bridge', -28, 40, 28, 32, -24, 22]
    ],
    'korea:0': [
        ['한강 스카이라인', 'HANGANG SKYLINE', 'wall,bridge,slalom', 30, 34, -28, 22, 24, 28], ['아파트 협곡', 'APARTMENT CANYON', 'slalom,wall,over', -30, 30, 28, 36, -26, 46], ['남산 타워', 'NAMSAN TOWER', 'spire,arch,cross', 28, 40, -30, 30, 26, 36], ['한강 교량', 'HANGANG BRIDGES', 'bridge,under,wall', -28, 21, 28, 19, -24, 34], ['도심 회랑', 'SEOUL ARCADE', 'roof,tunnel,slalom', 30, 30, -28, 34, 24, 25], ['서울의 밤', 'SEOUL NIGHT', 'under,wall,mover', -30, 22, 28, 35, -26, 28]
    ],
    'korea:1': [
        ['궁궐의 처마', 'PALACE EAVES', 'roof,over,arch', 28, 28, -30, 42, 26, 30], ['성곽의 문', 'FORTRESS PORTAL', 'tunnel,wall,spire', -28, 30, 28, 36, -24, 40], ['한옥 골목', 'HANOK LANES', 'slalom,roof,under', 30, 24, -28, 31, 24, 20], ['사원의 종', 'TEMPLE BELL', 'spire,arch,cross', -30, 34, 28, 28, -26, 38], ['기와 다리', 'TILED CROSSING', 'bridge,roof,over', 28, 24, -30, 30, 26, 44], ['궁궐 출구', 'PALACE EXIT', 'wall,tunnel,arch', -28, 34, 28, 30, -24, 26]
    ],
    'korea:2': [
        ['산촌 논밭', 'MOUNTAIN PADDIES', 'slalom,bridge,over', 30, 24, -28, 20, 24, 44], ['산길의 마을', 'HILLSIDE VILLAGE', 'roof,wall,spire', -30, 28, 28, 34, -26, 40], ['산사의 문', 'MOUNTAIN TEMPLE', 'arch,over,tunnel', 28, 28, -30, 44, 26, 32], ['계곡 바람', 'VALLEY WIND', 'cross,spire,bridge', -28, 38, 28, 32, -24, 22], ['황금 논둑', 'GOLDEN EMBANKMENT', 'under,wall,roof', 30, 20, -28, 32, 24, 26], ['산촌 출구', 'VILLAGE EXIT', 'over,slalom,arch', -30, 44, 28, 26, -26, 30]
    ],
    'korea:3': [
        ['광안대교', 'GWANGAN VIADUCT', 'bridge,spire,wall', 28, 22, -30, 38, 26, 30], ['부산 항로', 'BUSAN HARBOUR', 'mover,crane,cross', -28, 25, 28, 34, -24, 30], ['해변 도시', 'COASTAL CITY', 'roof,wall,bridge', 30, 28, -28, 36, 24, 20], ['항구의 처마', 'HARBOUR EAVES', 'under,arch,mover', -30, 20, 28, 30, -26, 24], ['해안 타워', 'COASTAL TOWER', 'spire,slalom,over', 28, 36, -30, 26, 26, 44], ['남쪽 바다', 'SOUTHERN SEA', 'wall,bridge,arch', -28, 30, 28, 20, -24, 32]
    ]
};
export const PATTERNS: Pattern[] = Object.entries(rows).flatMap(([key, rs]) => rs.map(([name, en, actions, x1, y1, x2, y2, x3, y3, spacing], i) => ({ id: `Encounter:${key}:${String(i + 1).padStart(2, '0')}`, theme: key.split(':')[0] as ThemeId, variant: +(key.split(':')[1] ?? 0), name, en, steps: actions.split(',').map((a, j) => [a as Action, [x1, x2, x3][j], [y1, y2, y3][j]]) as Pattern['steps'], spacing: spacing ?? 240 })));
export const ENV_MODELS: Record<ThemeId, string[]> = {
    coast: ['lighthouse', 'harbor_crane', 'fishing_boat', 'pier_section', 'rocky_arch', 'coastal_bridge', 'buoy_markers', 'cargo_warehouse', 'sea_stacks', 'modular_pier_deck', 'modular_seawall', 'cargo_container', 'rescue_tug', 'marina_fuel_station', 'lifeguard_tower', 'drydock_service_crane', 'harbor_swing_bridge'],
    village: ['windmill', 'village_church', 'bell_tower', 'village_houses', 'plaza_fountain', 'stone_arch_gate', 'roof_bridge', 'decorative_tree', 'market_hall', 'timber_fence', 'stone_wall_segment', 'watermill', 'village_bakery', 'covered_well', 'clockwork_gazebo'],
    city: ['skyscraper', 'tower_block', 'construction_crane', 'radio_mast', 'elevated_road', 'factory_building', 'city_water_tower', 'cargo_drone', 'city_billboard', 'highway_span', 'gantry_frame', 'metro_station', 'rooftop_helipad', 'substation', 'traffic_signal_gantry'],
    ice: ['glacier_cliff', 'ice_arch', 'jagged_ice_spire', 'frozen_bridge', 'polar_lighthouse', 'snow_cabin', 'snowy_fir_cluster', 'frozen_lake', 'icy_cave_gate', 'glacier_wall_segment', 'polar_research_station', 'snowcat', 'cable_car_station', 'icebreaker_bow'],
    desert: ['sandstone_spire', 'mesa_cliff', 'natural_arch', 'canyon_bridge', 'railroad_trestle', 'desert_oasis', 'desert_outpost', 'canyon_gate', 'layered_rocks', 'sandstone_wall_segment', 'desert_observatory', 'oil_pumpjack', 'sandstone_watchtower', 'mining_conveyor'],
    forest: ['pine_cluster', 'mountain_peak', 'rocky_ridge', 'large_dam', 'waterfall_cliff', 'wooden_cabin', 'lakeside_dock', 'lookout_tower', 'narrow_bridge_arch', 'pine_tree_single', 'river_lock', 'rope_bridge', 'mountain_cable_car', 'park_ranger_station'],
    farm: ['red_barn', 'farmhouse', 'grain_silo', 'wind_turbine', 'power_pylon', 'tractor', 'hay_bales', 'farm_water_tower', 'tool_shed', 'field_fence', 'silo_pipe', 'combine_harvester', 'irrigation_pump', 'orchard_windbreak', 'greenhouse'],
    korea: ['hanok_gate', 'palace_wall_pavilion', 'traditional_pavilion', 'seoul_tower', 'gwangan_bridge', 'riverside_apartments', 'fortress_wall_gate', 'harbor_structure', 'cliffside_castle', 'palace_wall_segment', 'curved_roof_segment', 'hanok_workshop', 'temple_bell_pavilion', 'pagoda_five_story', 'korean_market_stall'],
    river: ['coastal_bridge', 'river_lock', 'large_dam', 'fishing_boat', 'rescue_tug', 'lakeside_dock', 'pine_cluster', 'narrow_bridge_arch', 'rope_bridge', 'riverside_apartments', 'buoy_markers', 'irrigation_pump'],
    landmark: ['cliffside_castle', 'seoul_tower', 'natural_arch', 'palace_wall_pavilion', 'pagoda_five_story', 'desert_observatory', 'gwangan_bridge', 'fortress_wall_gate', 'mountain_peak'],
    aurora: ['ice_arch', 'glacier_cliff', 'jagged_ice_spire', 'polar_lighthouse', 'icebreaker_bow', 'snowy_fir_cluster', 'icy_cave_gate', 'polar_research_station', 'frozen_bridge'],
    volcano: ['mountain_peak', 'mesa_cliff', 'rocky_ridge', 'natural_arch', 'sea_stacks', 'sandstone_spire', 'canyon_bridge'],
    waterfall: ['waterfall_cliff', 'large_dam', 'rocky_ridge', 'narrow_bridge_arch', 'rope_bridge', 'pine_cluster', 'river_lock', 'lookout_tower', 'mountain_cable_car']
};
export const KOREA_MODELS = [['seoul_tower', 'gwangan_bridge', 'riverside_apartments', 'skyscraper', 'tower_block', 'city_water_tower', 'radio_mast', 'metro_station', 'city_billboard'], ['hanok_gate', 'palace_wall_pavilion', 'traditional_pavilion', 'fortress_wall_gate', 'palace_wall_segment', 'curved_roof_segment', 'hanok_workshop', 'temple_bell_pavilion', 'pagoda_five_story', 'korean_market_stall'], ['hanok_workshop', 'traditional_pavilion', 'red_barn', 'farmhouse', 'grain_silo', 'tractor', 'field_fence', 'greenhouse', 'pine_cluster', 'rope_bridge'], ['harbor_structure', 'gwangan_bridge', 'riverside_apartments', 'lighthouse', 'fishing_boat', 'harbor_crane', 'cargo_warehouse', 'cargo_container', 'rescue_tug', 'marina_fuel_station']];
export interface Catalog {
    byId: Map<string, AssetMeta>;
}
// Conservative runtime apertures audited against source collision solids and hero
// meshes. These do not alter the supplied asset metadata. Solid models use flyovers.
const PORTAL_PROFILES: Record<string, [number, number, number, number]> = {
    rocky_arch: [0, 8, 8.70, 2.90], stone_arch_gate: [0, 4.6, 10.78, 3.59],
    gantry_frame: [0, 5.5, 12.66, 4.22], ice_arch: [0, 4.7, 10.49, 3.49],
    icy_cave_gate: [0, 8, 10.60, 3.53], natural_arch: [0, 4.4, 11.22, 3.74],
    canyon_gate: [0, 7, 9.56, 3.18], narrow_bridge_arch: [0, 5.8, 13.22, 4.40],
    danger_gate: [0, 5, 13.60, 4.53], aeroway_gantry: [0, 3.15, 14.44, 4.81],
};
export function aperture(meta: AssetMeta) {
    const audited = PORTAL_PROFILES[meta.id];
    if (audited) return { center: [audited[0], audited[1], 0], size: [audited[2], audited[3], Math.max(5, meta.bounds.size[2])], axis: 'Z' };
    if (meta.id === 'fortress_wall_gate')
        return { center: [0, 4, 0], size: [4.6, 3.4, 20], axis: 'Z' };
    // This asset's supplied X clearance describes the narrow roadway. Flight crosses
    // the actual open water below its deck; its solid proxy starts at 8.064m there.
    if (meta.id === 'gwangan_bridge')
        return { center: [0, 4.05, 0], size: [32, 7.8, 13], axis: 'Z' };
    const cs = meta.clearances as {
        axis: string;
        c: number[];
        s: number[];
    }[];
    const c = cs.filter(c => c.axis === 'Z').sort((a, b) => Math.abs(a.c[0]) - Math.abs(b.c[0]))[0] ?? cs[0];
    if (!c)
        return { center: [0, meta.bounds.min[1] - 10, 0], size: [meta.bounds.size[0] * .65, 18, Math.max(5, meta.bounds.size[2])], axis: 'Z' };
    return { center: c.c, size: c.s, axis: c.axis };
}
export function buildEncounter(p: Pattern, start: number, seed: number, catalog: Catalog, span: number, serial: number, from = { x: 0, y: 24 }): Encounter {
    const rand = rng(seed + serial * 8341), route: RoutePoint[] = [], placements: Placement[] = [], pickups: Pickup[] = [];
    const k = p.theme, variant = p.variant, patternIndex = Math.max(0, Number(p.id.split(':').at(-1)) - 1);
    const family = encounterFamily(k, variant, serial, catalog.byId, patternIndex), place = scenicDistrict(k, variant, patternIndex);
    const lead = p.generation?.lead ?? (serial === 1 ? 800 : 155), spacing = p.generation?.spacing ?? Math.max(170, p.spacing * .82), length = lead + 2 * spacing + 125;
    const city = k === 'city' || k === 'korea' && variant === 0;
    const coastal = k === 'coast' || k === 'korea' && variant === 3;
    let id = serial * 1000;
    let district = false;
    const put = (model: string, x: number, y: number, z: number, sx = 1, sy = sx, sz = sx, role = 'scenery', yaw = 0, small = false, move?: Placement['move'], anchored = false, collision = true) => {
        if (!catalog.byId.has(model)) return undefined;
        const placement: Placement = { model, x, y, z, sx, sy, sz, yaw, collision, role, small, move, anchored, course: !district };
        const meta = catalog.byId.get(model)!;
        if (meta.moving) placement.animationPhase = hash(seed + z * 13 + x * 7 + model.length * 19) * Math.max(1, ...meta.animations.filter(clip => clip.autoplay).map(clip => clip.duration));
        placements.push(placement);
        return placement;
    };
    const natural = (model: string) => /rock|cliff|arch|spire|pine|tree|peak|glacier|ice|bridge|gate|wall|dam|pylon|hay|fence|orchard/.test(model);
    const rooted = (model: string, x: number, z: number, scale: number, role: string, yaw = 0, foundation = true) => {
        const meta = catalog.byId.get(model)!;
        const group = model + ':' + x.toFixed(3) + ':' + z.toFixed(3);
        let base = groundAt(x, z, k, seed, variant);
        let supported = false;
        if (foundation && !natural(model) && base <= WATER_LEVEL + .01 && isWaterLandscape(k, variant)) {
            // A real pier with feet below the water, never a building suspended above it.
            const deck = catalog.byId.get('modular_pier_deck')!;
            const sy = (1.95 + 3.6) / (deckSurfaceY(deck) - deck.bounds.min[1]);
            const sx = Math.max(1, (meta.bounds.size[0] * scale + 3) / deck.bounds.size[0]);
            const sz = Math.max(1, (meta.bounds.size[2] * scale + 3) / deck.bounds.size[2]);
            const pier = put('modular_pier_deck', x, -3.6 - deck.bounds.min[1] * sy, z, sx, sy, sz, 'foundation', yaw, false, undefined, true)!;
            pier.group = group;
            base = 1.95;
            supported = true;
        }
        const placed = put(model, x, base - meta.bounds.min[1] * scale, z, scale, scale, scale, role, yaw, false, undefined, true)!;
        placed.supported = supported;
        placed.group = group;
        return placed;
    };
    const hero = (model: string, x: number, z: number, width: number, height: number, depth: number, role: string, yaw = 0) => {
        const m = catalog.byId.get(model)!;
        const scale = Math.min(width / m.bounds.size[0], height / m.bounds.size[1], depth / m.bounds.size[2]);
        return rooted(model, x, z, scale, role, yaw);
    };
    const mover = (x: number, y: number, z: number, phase: number) => {
        const model = family.mover, m = catalog.byId.get(model)!;
        const flying = /drone|bird|blimp/.test(model), boat = isWatercraft(model);
        if (flying) {
            const scale = /drone/.test(model) ? 1.5 : 1;
            put(model, x, y, z, scale, scale, scale, 'moving', 0, true, { axis: 'x', amplitude: 7, frequency: .28, phase });
        }
        else if (boat) {
            // Hull waterline, not the keel minimum and not the route's flight altitude.
            put(model, -24, WATER_LEVEL, z, 1.2, 1.2, 1.2, 'moving', 0, false, { axis: 'z', amplitude: 22, frequency: .18, phase });
        }
        else {
            const placed = rooted(model, x, z, 1.15, 'moving');
            if (/tractor|snowcat/.test(model)) placed.move = { axis: 'z', amplitude: 15, frequency: .22, phase };
            // Windmills, turbines and cable cars play their authored pivot animations in place.
            void m;
        }
    };
    let previous = from;
    for (let j = 0; j < 3; j++) {
        const stepFamily = family;
        const [action, safeX, safeY] = p.steps[j], z = start + lead + j * spacing;
        const x = safeX * .53 + (rand() - .5) * 2;
        let y = Math.min(AIRSPACE.ceiling - 5, safeY), width = Math.max(span * 1.65, 25), height = 18;
        let floor = 5, ceiling = AIRSPACE.ceiling - 3;
        if (['arch', 'tunnel', 'under', 'bridge'].includes(action)) {
            const model = action === 'bridge' || action === 'under' ? stepFamily.bridge : stepFamily.gate;
            const meta = catalog.byId.get(model)!, ap = aperture(meta), base = groundAt(x, z, k, seed, variant);
            const rotated = ap.axis === 'X', openingWidth = ap.size[rotated ? 2 : 0];
            const targetWidth = Math.max(span * 1.65, 18), targetHeight = 7;
            const scale = Math.max(targetWidth / Math.max(.1, openingWidth), targetHeight / Math.max(.1, ap.size[1]), (12 - base) / Math.max(1, ap.center[1] - meta.bounds.min[1]), 1);
            const realOpening = (meta.clearances.length > 0 || !!PORTAL_PROFILES[model]) && model !== 'canyon_bridge' && scale <= 2.7 && ap.size[1] > 0 && base + (ap.center[1] - meta.bounds.min[1]) * scale < AIRSPACE.ceiling - 4;
            if (realOpening) {
                const placed = rooted(model, x - ap.center[rotated ? 2 : 0] * scale, z, scale, action, rotated ? Math.PI / 2 : 0, false);
                placed.z += (rotated ? -ap.center[0] : ap.center[2]) * scale;
                placed.passage = true;
                const centerY = placed.y + ap.center[1] * scale;
                floor = centerY - ap.size[1] * scale / 2 + 1.7;
                ceiling = Math.min(AIRSPACE.ceiling - 3, centerY + ap.size[1] * scale / 2 - 1.7);
                y = clamp(centerY, floor, ceiling);
                width = openingWidth * scale; height = ap.size[1] * scale;
            }
            else {
                const bridge = rooted(model, x, z, Math.min(1.25, 38 / meta.bounds.size[0], 35 / meta.bounds.size[1]), action, 0, false);
                floor = bridge.y + meta.bounds.max[1] * bridge.sy + 4;
                ceiling = AIRSPACE.ceiling - 3; y = Math.min(ceiling, Math.max(floor + 3, safeY));
            }
        }
        else if (action === 'wall') {
            for (const side of [-1, 1])
                hero(city && side < 0 ? 'tower_block' : family.wall, x + side * (width / 2 + 12), z + side * 14, 20, 64, 22, 'wall');
        }
        else if (action === 'over' || action === 'roof') {
            const building = hero(family.roof, x, z, 31, Math.max(12, y - 7), 24, 'roof');
            const roofTop = building.y + catalog.byId.get(building.model)!.bounds.max[1] * building.sy;
            y = Math.max(roofTop + 6, Math.min(y, roofTop + 14));
            floor = roofTop + 3;
            hero(family.wall, -x, z - 16, 28, 62, 24, 'wall');
        }
        else if (action === 'crane') {
            hero(family.crane, x + (x > 0 ? -45 : 45), z, 40, Math.max(32, y + 10), 24, 'crane', x > 0 ? Math.PI : 0);
            hero(family.wall, -x, z + 25, 26, 60, 22, 'wall');
        }
        else if (action === 'mover' || action === 'cross') {
            mover(-x, Math.max(15, y - 8), z, rand() * 6);
            hero(family.wall, -x, z + 40, 27, 60, 22, 'wall');
        }
        else {
            // Slalom is a changing passage between local structures, not three
            // copies of the district's landmark. Keep a single focal silhouette.
            const obstacle = action === 'slalom' ? family.wall : family.spire;
            hero(obstacle, coastal && obstacle === 'lighthouse' ? 33 : -x, z, 28, 62, 24, 'spire');
            if (action === 'slalom') {
                hero(family.wall, x + Math.sign(x) * 23, z - 75, 17, 54, 19, 'course flank');
                hero(family.wall, -x * .65, z + 80, 18, 54, 19, 'course flank');
            }
        }
        if (j === 0 && serial === 1) {
            // A legible centre divider makes choosing a side matter, even when a
            // small solid arch is flown over. One decision per encounter, not a wall of props.
            const dividerWidth = Math.min(20, Math.abs(x) * 2 - span * .68 - 6);
            if (dividerWidth >= 2)
                hero(coastal ? 'offshore_navigation_beacon' : family.spire, 0, z - 30, coastal ? Math.min(10, dividerWidth) : dividerWidth, 54, 18, 'course divider');
        }
        const riskX = x + (x > 0 ? -Math.min(8, width * .25) : Math.min(8, width * .25));
        const riskY = clamp(y - (['over', 'roof'].includes(action) ? 3 : 5), Math.max(9, floor), Math.min(ceiling, y));
        route.push({ z, x, y, width, height, dangerX: riskX, dangerY: riskY, role: action });
        if (j === 1) {
            const light = family.small, meta = catalog.byId.get(light)!, flying = /drone|bird/.test(light);
            if (flying) {
                const m = meta.motionBounds ?? meta.bounds;
                const reach = Math.max(Math.abs(m.min[0]), Math.abs(m.max[0])) * 1.05 + 4 + span * .34 + 2;
                put(light, x - Math.sign(x || 1) * reach, riskY + 2, z + 52, 1.05, 1.05, 1.05, 'light hazard', 0, true, { axis: 'x', amplitude: 4, frequency: .6, phase: rand() * 6 });
            }
            else {
                const scale = Math.min(6 / meta.bounds.size[0], 14 / meta.bounds.size[1]);
                const planted = rooted(light, -x, z + 55, scale, 'light hazard', 0, false); planted.small = true;
            }
        }
        for (let n = 0; n < 8; n++)
            pickups.push({ id: ++id, kind: 'coin', x: mix(previous.x, x, n / 7), y: mix(previous.y, y, n / 7), z: z - 145 + n * 18, radius: 2.8, collected: false, risk: false });
        pickups.push({ id: ++id, kind: 'ring', x: riskX, y: riskY, z: z + 2, radius: Math.max(5.5, span * .6), collected: false, risk: true });
        for (let n = 0; n < 3; n++)
            pickups.push({ id: ++id, kind: 'crystal', x: riskX, y: riskY, z: z + 36 + n * 20, radius: 2.5, collected: false, risk: true });
        if (j === 1) {
            const kinds: ItemKind[] = ['shield', 'multiplier', 'slow', 'turbo', 'repair'];
            pickups.push({ id: ++id, kind: kinds[Math.floor(rand() * 5)], x: clamp(x - 8, -AIRSPACE.softEdge, AIRSPACE.softEdge), y: Math.min(AIRSPACE.ceiling - 2, y + 5), z: z + 100, radius: 3.5, collected: false, risk: true });
        }
        previous = { x, y };
    }
    if (serial === 1 && k === 'coast') {
        // Learn the controls through optional scored lines before the first
        // lethal structure. A generous grace period must still feel like play.
        const direction = hash(seed + 1709) < .5 ? -1 : 1;
        const orientation = [.22, .43, .65].map((fraction, i) => ({ z: start + lead * fraction,
            x: direction * (i % 2 ? -1 : 1) * (6 + hash(seed + i * 8191) * 6),
            y: 21 + hash(seed + i * 1777 + 71) * 10 }));
        route.unshift(...orientation.map(point => ({ ...point, width: Math.max(20, span * 1.4), height: 10, dangerX: point.x, dangerY: point.y, role: 'orientation' })));
        let previous = { x: from.x, y: from.y, z: start };
        for (const point of orientation) {
            for (let n = 1; n <= 6; n++) {
                const t = n / 7;
                pickups.push({ id: ++id, kind: 'coin', x: mix(previous.x, point.x, t), y: mix(previous.y, point.y, t), z: mix(previous.z, point.z, t), radius: 2.8, collected: false, risk: false });
            }
            pickups.push({ id: ++id, kind: 'ring', ...point, radius: Math.max(6, span * .6), collected: false, risk: false });
            previous = point;
        }
    }
    // The route is authored first. District plots and their moving traffic must leave its swept envelope open.
    district = true;
    const knots = [{ x: from.x, y: from.y, z: start }, ...route.flatMap(r => [{ x: r.x, y: r.y, z: r.z - 60 }, { x: r.x, y: r.y, z: r.z + 60 }]), { x: route.at(-1)!.x, y: route.at(-1)!.y, z: start + length }];
    const corridorClear = (placement: Placement) => {
        const meta = catalog.byId.get(placement.model)!, m = { bounds: meta.motionBounds ?? meta.bounds };
        const box = transformBox(m.bounds.min.map((v, i) => (v + m.bounds.max[i]) / 2), m.bounds.size,
            placement, { x: placement.sx, y: placement.sy, z: placement.sz }, placement.yaw);
        if (placement.move) {
            box.min[placement.move.axis] -= placement.move.amplitude;
            box.max[placement.move.axis] += placement.move.amplitude;
        }
        return knots.slice(1).every((to, i) => !sweepAABB(knots[i], to, box, { x: span * .34 + 2.4, y: 5.5, z: 12 }));
    };
    // Decorative slalom flanks must leave the entire bend open, including the
    // space after a route marker where the pilot starts changing direction.
    const rejectedFlanks = new Set(placements.filter(o => o.role === 'course flank' && !corridorClear(o)));
    const rejectedGroups = new Set([...rejectedFlanks].map(o => o.group).filter(Boolean));
    for (let i = placements.length - 1; i >= 0; i--)
        if (rejectedFlanks.has(placements[i]) || placements[i].group && rejectedGroups.has(placements[i].group)) placements.splice(i, 1);
    const plot = (model: string, x: number, z: number, scale: number, role = 'district', yaw = 0) => {
        const begin = placements.length;
        const placed = rooted(model, x, z, scale, role, yaw);
        if (placements.slice(begin).some(o => !corridorClear(o))) { placements.splice(begin); return undefined; }
        const boxFor = (p: Placement) => { const meta = catalog.byId.get(p.model)!, m = { bounds: meta.motionBounds ?? meta.bounds }; return transformBox(m.bounds.min.map((v, i) => (v + m.bounds.max[i]) / 2), m.bounds.size, p, { x: p.sx, y: p.sy, z: p.sz }, p.yaw); };
        const older = placements.slice(0, begin).filter(o => o.collision).map(boxFor);
        const overlap = placements.slice(begin).some(o => {
            const b = boxFor(o);
            return older.some(a => Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x) > .2 &&
                Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y) > .1 &&
                Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z) > .2);
        });
        if (overlap) { placements.splice(begin); return undefined; }
        return placed;
    };
    const village = k === 'village' || k === 'korea' && variant === 1;
    // Architecture is grouped into recognisable places with deliberate breathing
    // room. Opposing, evenly spaced exhibition rows flatten the entire world.
    const placeBuilding = (model: string, x: number, z: number, width: number, depth: number, high: number, role = 'district', yaw = 0) => {
        const meta = catalog.byId.get(model); if (!meta) return undefined;
        const placed = plot(model, x, z, Math.min(width / meta.bounds.size[0], depth / meta.bounds.size[2], high / meta.bounds.size[1]), role, yaw);
        if (placed && Math.abs(x) - width / 2 > AIRSPACE.halfWidth) {
            // Set-back buildings explain the district; they are scenery rather
            // than inaccessible collision targets outside the flight corridor.
            placed.collision = false;
            for (const item of placements) if (item.group === placed.group) item.collision = false;
        }
        return placed;
    };
    const clusters = serial === 1 ? 4 : 3;
    for (let cluster = 0; cluster < clusters; cluster++) {
        const centre = start + 90 + cluster * (length - 190) / clusters;
        // Every other cluster is set back, so built-up areas open onto a plaza,
        // working basin, field or water instead of continuing a wall of props.
        const side = coastal ? 1 : cluster % 2 ? -1 : 1;
        const frontage = coastal ? 32 : side * 30;
        const count = coastal ? 4 : city ? 5 : village ? 4 : 3;
        for (let n = 0; n < count; n++) {
            const model = place.buildings[(cluster + n + serial) % place.buildings.length];
            const z = centre + n * (city ? 26 : 30) + (rand() - .5) * 9;
            const x = frontage + side * (n % 3 === 2 ? 9 : 0) + (rand() - .5) * 2;
            placeBuilding(model, x, z, city ? 15 : 13, city ? 23 : 22, city ? 48 : 19, 'district', side < 0 ? Math.PI : 0);
        }
        if (cluster % 2 === 0 || !coastal) {
            const model = place.working[(cluster + serial) % place.working.length];
            placeBuilding(model, coastal ? 29 : side * 27, centre + 22, 15, 23, 29, 'working district', coastal ? Math.PI : 0);
        }
        if (coastal) {
            // A harbour has a working quay on its landward side and a distinct
            // water channel. Native boat hulls keep their authored waterline.
            if (place.id === 'working-harbour') {
                placeBuilding('cargo_container', 30, centre + 105, 7, 12, 6, 'quay cargo');
                placeBuilding('cargo_container', 37, centre + 109, 7, 12, 6, 'quay cargo');
            }
            const boat = cluster % 2 ? 'fishing_boat' : family.mover;
            if (isWatercraft(boat)) {
                const native = catalog.byId.get(boat);
                if (native) {
                    const scale = Math.min(1.15, 12 / native.bounds.size[0], 24 / native.bounds.size[2]);
                    const placed = put(boat, -23 + (rand() - .5) * 3, WATER_LEVEL, centre + 55, scale, scale, scale,
                        'harbour traffic', cluster % 2 ? Math.PI : 0, false,
                        { axis: 'z', amplitude: 16, frequency: .11, phase: rand() * Math.PI * 2 });
                    if (placed && !corridorClear(placed)) placements.pop();
                }
            }
            if (cluster === 1) put('buoy_markers', -24, WATER_LEVEL, centre + 110, 1, 1, 1, 'channel markers', 0, false, undefined, false, false);
        }
        else if (village) {
            placeBuilding('covered_well', side * 25, centre + 105, 7, 7, 8, 'village square');
            placeBuilding('decorative_tree', side * 27, centre + 125, 7, 8, 10, 'village square');
        }
    }
    if (city) {
        const track = catalog.byId.get('rail_track');
        if (track) {
            for (let n = 0; n < Math.floor(length / 12); n++)
                put('rail_track', 18, 1.5 - track.bounds.min[1], start + n * 12, 1, 1, 1, 'rail', 0, false, undefined, true, false);
            const train = plot(catalog.byId.has('urban_street_tram') ? 'urban_street_tram' : 'city_train', 18, start + length * .36, 1, 'moving');
            if (train) {
                train.y += track.bounds.size[1]; train.supported = true; train.supportModel = 'rail_track';
                train.move = { axis: 'z', amplitude: 38, frequency: .13, phase: rand() * 6 };
            }
        }
        for (let n = 0; n < 4; n++) {
            const car = plot(n === 2 && catalog.byId.has('articulated_city_bus') ? 'articulated_city_bus' : 'road_car', n % 2 ? -5 : 5, start + 70 + n * (length - 150) / 4, 1, 'moving', n % 2 ? Math.PI : 0);
            if (car) { car.small = true; car.move = { axis: 'z', amplitude: 32, frequency: .19, phase: rand() * 6 }; }
        }
    }
    return { entry: { x: from.x, y: from.y }, id: p.id, title: p.name, en: p.en, theme: k, variant, start, length, route, placements, pickups, passed: new Set() };
}
export function validateReachability(e: Encounter, speed: number, handling: number, span: number, from: {
    x: number;
    y: number;
    z: number;
}) {
    let prev = from;
    for (const route of e.route) {
        if (route.z <= from.z)
            continue;
        const travel = (route.z - prev.z) / speed, needed = Math.max(Math.abs(route.x - prev.x) / (18 * handling), Math.abs(route.y - prev.y) / (12 * handling)) + .6;
        if (travel < needed || route.width < span * 1.35 || route.height < 4.5)
            return false;
        prev = route;
    }
    return true;
}
