import { themeFamily } from './scenery';
import type { ThemeId, AssetMeta } from './types';
export interface ScenicDistrict {
    id: string;
    buildings: string[];
    working: string[];
    accents: string[];
    family?: Partial<ReturnType<typeof themeFamily>>;
}
// These are places, not collections of every model assigned to a theme. An
// encounter borrows one architectural vocabulary and one focal silhouette.
const COAST_DISTRICTS: ScenicDistrict[] = [
    { id: 'working-harbour', buildings: ['cargo_warehouse', 'brick_warehouse_loading_court', 'fishmarket_jetty'], working: ['harbor_working_container_crane', 'working_capstan_berth', 'drydock_service_crane'], accents: ['cargo_container', 'buoy_markers', 'rescue_tug'], family: { wall: 'harbor_structure', roof: 'cargo_warehouse', crane: 'harbor_working_container_crane', mover: 'coastal_rescue_patrol_boat', spire: 'offshore_navigation_beacon', gate: 'harbor_breakwater_portal' } },
    { id: 'fishing-market', buildings: ['coastal_fishing_hamlet', 'coastal_town_clockmarket', 'fishmarket_jetty'], working: ['working_capstan_berth', 'marina_fuel_station'], accents: ['fishing_boat', 'buoy_markers', 'lifeguard_tower'], family: { wall: 'coastal_fishing_hamlet', roof: 'coastal_town_clockmarket', crane: 'working_capstan_berth', mover: 'fishing_boat', spire: 'lifeguard_tower', gate: 'harbor_breakwater_portal' } },
    { id: 'bridge-estuary', buildings: ['fishmarket_jetty', 'coastal_fishing_hamlet'], working: ['harbor_double_bascule', 'working_capstan_berth'], accents: ['buoy_markers', 'coastal_rescue_patrol_boat', 'modular_seawall'], family: { wall: 'harbor_structure', roof: 'fishmarket_jetty', bridge: 'coastal_bridge', crane: 'harbor_double_bascule', mover: 'coastal_rescue_patrol_boat', spire: 'offshore_navigation_beacon', gate: 'rocky_arch' } },
    { id: 'rocky-cape', buildings: ['lighthouse_keeper_estate', 'clifftop_coastal_villa'], working: ['offshore_navigation_beacon'], accents: ['sea_stacks', 'weathered_coastal_arch', 'bird_flock'], family: { wall: 'sea_stacks', roof: 'lighthouse_keeper_estate', gate: 'weathered_coastal_arch', crane: 'offshore_navigation_beacon', mover: 'fishing_boat', spire: 'lighthouse' } },
];
const VILLAGE_DISTRICTS: ScenicDistrict[] = [
    { id: 'market-quarter', buildings: ['covered_market_arcade', 'half_timber_townhall', 'village_bakery_clockwork'], working: ['smithy_dual_bellows', 'village_pottery_drying_carousel'], accents: ['covered_well', 'plaza_fountain', 'decorative_tree'], family: { wall: 'village_houses', roof: 'covered_market_arcade', spire: 'bell_tower', mover: 'clockwork_gazebo' } },
    { id: 'mill-river', buildings: ['hillside_coaching_inn', 'village_houses', 'village_bakery'], working: ['village_windmill_miller', 'village_grain_mill', 'watermill'], accents: ['timber_fence', 'stone_wall_segment', 'decorative_tree'], family: { wall: 'village_houses', roof: 'hillside_coaching_inn', spire: 'windmill', mover: 'windmill', crane: 'watermill' } },
    { id: 'chapel-hill', buildings: ['stone_chapel_courtyard', 'village_hill_terrace_houses', 'half_timber_townhall'], working: ['village_grain_mill'], accents: ['stone_wall_segment', 'covered_well', 'decorative_tree'], family: { wall: 'village_houses', roof: 'stone_chapel_courtyard', spire: 'village_church', mover: 'clockwork_gazebo' } },
    { id: 'orchard-lane', buildings: ['hillside_coaching_inn', 'village_houses', 'village_bakery'], working: ['village_windmill_miller'], accents: ['timber_fence', 'decorative_tree', 'covered_well'], family: { wall: 'village_houses', roof: 'village_houses', spire: 'windmill', mover: 'watermill' } },
];
const CITY_DISTRICTS: ScenicDistrict[] = [
    { id: 'glass-downtown', buildings: ['skyscraper', 'curved_glass_office_plaza', 'triangular_office_tower'], working: ['tower_rooftop_ventilation'], accents: ['city_billboard', 'road_car'], family: { wall: 'skyscraper', roof: 'curved_glass_office_plaza', spire: 'tower_block', mover: 'cargo_drone' } },
    { id: 'rail-quarter', buildings: ['art_deco_rail_station', 'city_metro_canopy_hub', 'brick_warehouse_loading_court'], working: ['freight_terminal_lift'], accents: ['urban_street_tram', 'city_billboard'], family: { wall: 'tower_block', roof: 'art_deco_rail_station', spire: 'city_water_tower', mover: 'cargo_drone' } },
    { id: 'construction-docks', buildings: ['factory_building', 'brick_warehouse_loading_court', 'tower_block'], working: ['construction_crane', 'freight_terminal_lift'], accents: ['cargo_container', 'road_car'], family: { wall: 'tower_block', roof: 'factory_building', crane: 'construction_crane', spire: 'radio_mast', mover: 'cargo_drone' } },
    { id: 'civic-square', buildings: ['civic_colonnade_library', 'city_clock_civic_square', 'curved_glass_office_plaza'], working: ['vertical_parking_carousel'], accents: ['city_billboard', 'articulated_city_bus'], family: { wall: 'tower_block', roof: 'civic_colonnade_library', spire: 'city_water_tower', mover: 'cargo_drone' } },
];
const COAST_ORDER = [0, 2, 1, 0, 3, 3, 0, 1, 0, 2, 3, 2];
const VILLAGE_ORDER = [3, 1, 0, 2, 1, 3, 2, 3, 0, 0, 3, 1];
const CITY_ORDER = [0, 0, 2, 1, 0, 2, 1, 0, 2, 0, 3, 1];
export function scenicDistrict(theme: ThemeId, variant: number, patternIndex: number): ScenicDistrict {
    const n = Math.max(0, patternIndex);
    if (theme === 'coast' || theme === 'korea' && variant === 3) {
        const place = COAST_DISTRICTS[COAST_ORDER[n % COAST_ORDER.length]];
        return theme === 'korea' ? { ...place, family: { ...place.family, bridge: 'gwangan_bridge' } } : place;
    }
    if (theme === 'village') return VILLAGE_DISTRICTS[VILLAGE_ORDER[n % VILLAGE_ORDER.length]];
    if (theme === 'city' || theme === 'korea' && variant === 0) {
        const place = CITY_DISTRICTS[CITY_ORDER[n % CITY_ORDER.length]];
        return theme === 'korea' ? { ...place, buildings: ['riverside_apartments', ...place.buildings], family: { ...place.family, bridge: 'gwangan_bridge', ...(n % 6 === 2 ? { spire: 'seoul_tower' } : {}) } } : place;
    }
    return { id: theme + '-' + variant, buildings: districtPalette(theme, variant), working: workingPalette(theme, variant), accents: [] };
}
export const DISTRICT_PALETTES: Record<ThemeId, string[]> = {
    coast: ['coastal_fishing_hamlet','fishmarket_jetty','coastal_town_clockmarket','lighthouse_keeper_estate','clifftop_coastal_villa'],
    village: ['half_timber_townhall','covered_market_arcade','hillside_coaching_inn','village_hill_terrace_houses','village_bakery_clockwork','stone_chapel_courtyard'],
    city: ['art_deco_rail_station','civic_colonnade_library','triangular_office_tower','curved_glass_office_plaza','brick_warehouse_loading_court','city_metro_canopy_hub'],
    ice: ['ski_resort_chalet','polar_geodesic_dome','snow_lodge_and_sauna','aurora_science_habitat'],
    desert: ['adobe_caravanserai','oasis_palm_courtyard','desert_stepwell_courtyard','dune_caravan_outpost'],
    forest: ['alpine_timber_lodge','lakeside_boathouse','mountain_forest_firewatch','lakeside_stone_abbey'],
    farm: ['stone_farm_estate','tile_roof_granary','orchard_packing_shed','red_barn_courtyard','hilltop_stone_silo_farm'],
    korea: ['korean_palace_throne_hall','korean_hanok_courtyard_estate','korean_river_seowon_academy','royal_ancestral_hall'],
    river: ['lakeside_boathouse','alpine_timber_lodge','lakeside_stone_abbey','woodland_lookout_windstation'],
    landmark: ['royal_ancestral_hall','civic_colonnade_library','wind_carved_canyon_citadel','stone_chapel_courtyard'],
    aurora: ['aurora_science_habitat','polar_geodesic_dome','snow_lodge_and_sauna'],
    volcano: ['rocky_headland_lighthouse','offshore_navigation_beacon','lighthouse_keeper_estate'],
    waterfall: ['alpine_timber_lodge','mountain_forest_firewatch','lakeside_stone_abbey'],
};
const WORKING: Partial<Record<ThemeId, string[]>> = {
    coast: ['harbor_working_container_crane','working_capstan_berth','harbor_double_bascule'],
    village: ['village_windmill_miller','smithy_dual_bellows','village_grain_mill','village_pottery_drying_carousel'],
    city: ['tower_rooftop_ventilation','freight_terminal_lift','vertical_parking_carousel'],
    ice: ['ski_resort_cable_gondola','polar_observatory_shutter','polar_tracking_array'],
    desert: ['desert_solar_tracking_field','oasis_windpowered_noria','desert_excavation_crane'],
    forest: ['timber_sawmill_complex','woodland_piston_pump','mountain_suspension_gondola'],
    farm: ['working_crop_harvester','farm_pivot_windmill','orchard_cherry_sorter'],
    korea: ['korean_temple_bell_and_striker','korean_astronomical_waterclock','hanok_courtyard_rotating_grain_mill'],
    river: ['forest_spillway_sluice','lake_counterweight_bridge'],
    aurora: ['polar_observatory_shutter','ski_resort_cable_gondola'],
    volcano: ['offshore_navigation_beacon','working_capstan_berth'],
    waterfall: ['forest_spillway_sluice','hydro_turbine_gallery'],
};
export function districtPalette(theme: ThemeId, variant: number) {
    if (theme === 'korea' && variant === 0) return DISTRICT_PALETTES.city;
    if (theme === 'korea' && variant === 2) return ['terraced_rice_farm','korean_hanok_courtyard_estate','hilltop_stone_silo_farm','mountain_temple_main_hall'];
    if (theme === 'korea' && variant === 3) return DISTRICT_PALETTES.coast;
    return DISTRICT_PALETTES[theme];
}
export const workingPalette = (theme: ThemeId, variant: number) => theme === 'korea' && variant === 0 ? WORKING.city! : theme === 'korea' && variant === 3 ? WORKING.coast! : WORKING[theme] ?? WORKING.village!;
export function encounterFamily(theme: ThemeId, variant: number, serial: number, catalog: Map<string, AssetMeta>, patternIndex = serial) {
    const family = { ...themeFamily(theme, variant) };
    const place = scenicDistrict(theme, variant, patternIndex), district = place.buildings, working = place.working;
    family.roof = district[serial % district.length]; family.crane = working[serial % working.length];
    Object.assign(family, place.family);
    if ((theme === 'coast' || theme === 'korea' && variant === 3) && !place.family?.mover) family.mover = 'coastal_rescue_patrol_boat';
    const candidates = theme === 'coast' || theme === 'volcano' || theme === 'korea' && variant === 3 ? ['rocky_arch','weathered_coastal_arch','harbor_breakwater_portal','stormworn_sea_cave'] : theme === 'ice' || theme === 'aurora' ? ['ice_arch','icy_cave_gate','ice_shelf_tunnel'] : theme === 'desert' ? ['natural_arch','canyon_gate','red_mesa_sky_arch'] : theme === 'forest' || theme === 'waterfall' || theme === 'river' ? ['narrow_bridge_arch','cedar_canopy_arch'] : theme === 'korea' && variant !== 0 ? ['fortress_wall_gate','hanok_gate','korean_fortress_arch_gate'] : theme === 'city' || theme === 'korea' ? ['gantry_frame','aeroway_gantry','danger_gate'] : theme === 'farm' ? ['roof_bridge','danger_gate'] : ['stone_arch_gate','roof_bridge'];
    const gate = candidates[serial % candidates.length];
    // Small/solid arches remain actual obstacles with flyover routes. Never silently
    // substitute the same old arch just because a new model lacks clearance metadata.
    if (!place.family?.gate && catalog.has(gate)) family.gate = gate;
    return family;
}
