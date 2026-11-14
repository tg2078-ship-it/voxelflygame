const VESSELS = new Set(['fishing_boat', 'rescue_tug', 'icebreaker_bow', 'coastal_rescue_patrol_boat', 'korean_river_ferryboat', 'lake_research_sailboat', 'turtle_ship_rudder_rig']);
export const isWatercraft = (model: string) => VESSELS.has(model);
