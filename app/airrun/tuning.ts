/** Storm strike parameters shared by adjudication and the player's warning. */
export const LIGHTNING = {
    firstPossibleSecond: 540,
    seedWindowSeconds: 80,
    chancePerWindow: .15,
    warningSeconds: 1.5,
    lateralEscapeSpeed: 2,
    damage: 35,
} as const;

export const FLIGHT = {
    start: 40, growth: 12, growthDistance: 600, distanceGrowth: .0006,
    baseLimit: 90 / 1.15, maxBurstFactor: 1.42, difficultyDistance: 35000,
    boost: 1.35, brake: .7,
} as const;
export const BOOST = {
    heatPerSecond: .155, passiveCooling: .078, brakeCooling: .16, slipstreamCooling: .10,
    lockout: 3, restartHeat: .40, nearCooling: .25, narrowCooling: .18, ringStreakCooling: .28,
} as const;
export const DODGE = {
    active: .35, cooldown: 4, perfect: .15, perfectCooling: .36, slowTime: .32, timeScale: .55,
} as const;
export const IMPACT = {
    grace: 1.5, slowTime: .48, recoveryHeight: 5, groundThreshold: 1.5,
    smallBase: 18, smallSpeed: .38, maxSmall: 95, lookahead: .95, scanPeriod: .13,
} as const;
export const POINTS = { near: 240, boostedNear: 420, narrow: 390, perfectRoll: 550, survey: 75, metresPerCoin: 36, pointsPerCoin: 115 } as const;
export const flightReward = (distance:number, bonus:number, coins:number) => Math.floor(distance/POINTS.metresPerCoin)+Math.floor(bonus/POINTS.pointsPerCoin)+coins;
export const difficultyIndex = (distance:number) => 1-Math.exp(-Math.max(0,distance)/FLIGHT.difficultyDistance);
