/** Storm strike parameters shared by adjudication and the player's warning. */
export const LIGHTNING = {
    firstPossibleSecond: 540,
    seedWindowSeconds: 80,
    chancePerWindow: .15,
    warningSeconds: 1.5,
    lateralEscapeSpeed: 2,
    damage: 35,
} as const;
