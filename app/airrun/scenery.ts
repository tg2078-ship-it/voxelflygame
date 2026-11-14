import type { ThemeId } from './types';
export interface ThemeFamily {
    wall: string;
    roof: string;
    gate: string;
    bridge: string;
    crane: string;
    mover: string;
    spire: string;
    small: string;
    landscape: string[];
}
const family = (wall: string, roof: string, gate: string, bridge: string, crane: string, mover: string, spire: string, small: string, landscape: string[]): ThemeFamily => ({ wall, roof, gate, bridge, crane, mover, spire, small, landscape });
export const THEME_FAMILIES: Record<ThemeId, ThemeFamily> = {
    coast: family('harbor_structure', 'cargo_warehouse', 'rocky_arch', 'coastal_bridge', 'harbor_crane', 'fishing_boat', 'lighthouse', 'bird_flock', ['pine_tree_single', 'pine_cluster', 'decorative_tree', 'rocky_ridge', 'sea_stacks']),
    village: family('village_houses', 'village_houses', 'stone_arch_gate', 'roof_bridge', 'watermill', 'windmill', 'bell_tower', 'decorative_tree', ['decorative_tree', 'pine_cluster', 'rocky_ridge']),
    city: family('skyscraper', 'factory_building', 'gantry_frame', 'elevated_road', 'construction_crane', 'cargo_drone', 'tower_block', 'cargo_drone', ['decorative_tree', 'pine_cluster']),
    ice: family('glacier_cliff', 'snow_cabin', 'ice_arch', 'frozen_bridge', 'glacier_wall_segment', 'icebreaker_bow', 'jagged_ice_spire', 'snowy_fir_cluster', ['snowy_fir_cluster', 'glacier_cliff', 'jagged_ice_spire']),
    desert: family('mesa_cliff', 'desert_outpost', 'natural_arch', 'canyon_bridge', 'mining_conveyor', 'oil_pumpjack', 'sandstone_spire', 'layered_rocks', ['mesa_cliff', 'layered_rocks', 'sandstone_spire', 'desert_oasis']),
    forest: family('rocky_ridge', 'wooden_cabin', 'narrow_bridge_arch', 'rope_bridge', 'large_dam', 'mountain_cable_car', 'pine_cluster', 'pine_tree_single', ['pine_tree_single', 'pine_cluster', 'mountain_peak', 'rocky_ridge']),
    farm: family('grain_silo', 'red_barn', 'roof_bridge', 'rope_bridge', 'power_pylon', 'wind_turbine', 'grain_silo', 'orchard_windbreak', ['orchard_windbreak', 'hay_bales', 'decorative_tree']),
    korea: family('riverside_apartments', 'metro_station', 'gantry_frame', 'gwangan_bridge', 'construction_crane', 'cargo_drone', 'seoul_tower', 'cargo_drone', ['pine_cluster', 'decorative_tree']),
    river: family('rocky_ridge', 'lakeside_dock', 'narrow_bridge_arch', 'coastal_bridge', 'river_lock', 'rescue_tug', 'pine_cluster', 'bird_flock', ['pine_cluster', 'pine_tree_single', 'rocky_ridge']),
    landmark: family('cliffside_castle', 'palace_wall_pavilion', 'stone_arch_gate', 'gwangan_bridge', 'fortress_wall_gate', 'temple_bell_pavilion', 'seoul_tower', 'decorative_tree', ['mountain_peak', 'rocky_ridge', 'pine_cluster']),
    aurora: family('glacier_cliff', 'polar_research_station', 'ice_arch', 'frozen_bridge', 'glacier_wall_segment', 'icebreaker_bow', 'jagged_ice_spire', 'snowy_fir_cluster', ['snowy_fir_cluster', 'glacier_cliff', 'jagged_ice_spire']),
    volcano: family('rocky_ridge', 'mountain_peak', 'natural_arch', 'canyon_bridge', 'sea_stacks', 'sea_stacks', 'mountain_peak', 'layered_rocks', ['rocky_ridge', 'mountain_peak', 'sea_stacks']),
    waterfall: family('waterfall_cliff', 'wooden_cabin', 'narrow_bridge_arch', 'rope_bridge', 'large_dam', 'mountain_cable_car', 'rocky_ridge', 'pine_tree_single', ['waterfall_cliff', 'pine_cluster', 'rocky_ridge']),
};
export const KOREAN_FAMILIES: ThemeFamily[] = [
    THEME_FAMILIES.korea,
    family('palace_wall_segment', 'palace_wall_pavilion', 'fortress_wall_gate', 'roof_bridge', 'temple_bell_pavilion', 'temple_bell_pavilion', 'pagoda_five_story', 'decorative_tree', ['pine_cluster', 'decorative_tree', 'rocky_ridge']),
    family('rocky_ridge', 'hanok_workshop', 'fortress_wall_gate', 'rope_bridge', 'power_pylon', 'tractor', 'pine_cluster', 'pine_tree_single', ['pine_cluster', 'orchard_windbreak', 'rocky_ridge']),
    family('riverside_apartments', 'cargo_warehouse', 'rocky_arch', 'gwangan_bridge', 'harbor_crane', 'fishing_boat', 'lighthouse', 'bird_flock', ['pine_cluster', 'rocky_ridge', 'sea_stacks']),
];
export const themeFamily = (theme: ThemeId, variant = 0) => theme === 'korea' ? KOREAN_FAMILIES[variant] ?? KOREAN_FAMILIES[0] : THEME_FAMILIES[theme];
