import { LIGHTNING } from './tuning';
import { COURSE_EDITION, AIRCRAFT, baseSpeed, stats, themeAt, THEMES, damp, clamp, smooth, mix, GEAR_RATIOS, hash, emptyMetrics } from './data';
import { journeyTheme, journeyThemes, JOURNEY_MARKS } from './journey';
import { FormationFlight, type FormationEvent } from './formation';
import { RushDrive } from './rush';
import { buildEncounter, validateReachability } from './patterns';
import { FlightSchool } from './flight-school';
import { systemSpec } from './airframe-systems';
import { proceduralPattern, DIFFICULTIES, type Difficulty } from './encounter-director';
import { populateThemeCollection, themeCollection } from './model-collection';
import { AIRSPACE } from './graphics';
import { isWatercraft } from './model-kind';
import { groundAt } from './world-ground';
import { FlightContract, ReplayRecorder, courseClock, replayPose, type ContractId, type FlightReplay } from './mastery';
import { FlightAdventure, type AdventureFrame, type AdventureAward } from './adventure';
import { SortieDirector, sortieStageAt, SORTIE_COMPLETION_BONUS } from './sortie';
import { createRouteChoice, choiceCrossing, choiceHUD, ROUTE_CHOICE_BONUS, type RouteChoice } from './route-choice';
export { groundAt } from './world-ground';
import { WeatherController } from './weather';
import { createTrickPath, sampleTrickPath, predictTrickDistances, type TrickKnot, type TrickPathResult } from './trick-path';
import { trickContext, type TrickPlanRequest } from './trick-protocol';
import { obstacleContact, collisionBounds, obstacleSolids, transformBox, sweepAABB, type ProxyData } from './collision';
import type { Aircraft, Settings, PracticeConfig, AssetMeta, Encounter, Obstacle, Pickup, Vec, Weather, Input, HUD, RunResult, ThemeId, ItemKind, FlightMode } from './types';
export interface RunConfig {
    personalDistances?: { manual: number; hyper: number };
    contractId?: ContractId;
    rival?: { replay: FlightReplay; score: number };
    mode?: FlightMode;
    dailyKey?: string;
    id: string;
    seed: number;
    plane: string;
    level: number;
    practice: PracticeConfig | null;
    settings: Settings;
    catalog: Map<string, AssetMeta>;
    proxies: Map<string, ProxyData>;
    coach?: boolean;
    onEvent?: (kind: string, position?: Vec) => void;
    isObstacleVisible?: (obstacle: Obstacle) => boolean;
}
export class FlightSimulation {
    adventure: FlightAdventure;
    readonly sortie?: SortieDirector;
    completed = false;
    contract?: FlightContract;
    recorder = new ReplayRecorder();
    readonly difficulty: Difficulty;
    config: RunConfig;
    plane: Aircraft;
    performance: ReturnType<typeof stats>;
    x = 0;
    y = 24;
    z = 0;
    vx = 0;
    vy = 0;
    speed = 40;
    time = 0;
    motionTime = 0;
    roll = 0;
    pitch = 0;
    yaw = 0;
    hp: number;
    maxHp: number;
    combo = 0;
    comboUntil = 0;
    bonus = 0;
    coins = 0;
    metrics = emptyMetrics();
    weatherController = new WeatherController();
    weather: Weather = { kind: 'clear', cloud: .12, rain: 0, fog: .04, wind: .1, wet: 0, night: 0, lightning: 0, snow: false };
    theme: ThemeId = 'coast';
    variant = 0;
    encounters: Encounter[] = [];
    obstacles: Obstacle[] = [];
    pickups: Pickup[] = [];
    effects = new Map<ItemKind, number>();
    nextStart = 0;
    serial = 0;
    lastPattern = '';
    hitCooldown = 0;
    failed = false;
    reason = '';
    reasonEn = '';
    impact: Vec = { x: 0, y: 0, z: 0 };
    shake = 0;
    boost = 0;
    boostHeat = 0;
    rush = new RushDrive();
    readonly formation?: FormationFlight;
    sectorEnteredAt = 0;
    boosting = false;
    message = '';
    messageEn = '';
    messageUntil = 0;
    eUsed = false;
    eRemaining = 0;
    eTime = 0;
    eStart = { x: 0, y: 0 };
    eExit = { x: 0, y: 0 };
    trickRoll = 0;
    trickPitch = 0;
    trickYaw = 0;
    trickVariant = 1;
    shieldExpiredAt = -1;
    repairAt = -1;
    eEndedAt = -1;
    lastDamageZ = -1;
    lastWeather = '';
    lastSlot = -1;
    lastRequired = { x: 0, y: 24 };
    lastCheckpoint = 0;
    landmarkTimer = 0;
    lastMinorHitZ = -1;
    recoveryAt = -1;
    lightningWarn = 0;
    lightningDone = false;
    damageCount = 0;
    snowCleanDistance = 0;
    ePath: TrickKnot[] = [];
    ePathClear = false;
    discoveryImages: Record<string, string> = {};
    modelCycle = new Map<ThemeId, Set<string>>();
    discoveredModels = new Set<string>();
    private ringStreak = 0;
    private bestRingStreak = 0;
    private ringJudgement?: { offset: number; until: number; award: number; speedBonus: number };
    private lessonRings = new Map<number, { x: number; y: number }>();
    private choices = new Map<string, RouteChoice>();
    private choiceRetryAt = 0;
    coach?: FlightSchool;
    module: ReturnType<typeof systemSpec>;
    private moduleUntil = 0;
    private repairPasses = 0;
    private relayChain = 0;
    private relayClears = 0;
    private relayPerfect = 0;
    private relayUntil = 0;
    private relayAward = 0;
    latestModel = '';
    surveyMilestones = new Map<ThemeId, number>();
    constructor(config: RunConfig) { this.config = config; this.sortie = config.mode === 'sortie' ? new SortieDirector() : undefined; this.difficulty = config.mode === 'daily' ? 'standard' : config.settings.difficulty ?? 'standard'; this.plane = AIRCRAFT.find(p => p.id === config.plane) ?? AIRCRAFT[0]; this.performance = stats(this.plane, config.level); this.performance.speed *= DIFFICULTIES[this.difficulty].speedMultiplier; this.hp = this.maxHp = this.performance.hp; this.speed = baseSpeed(0) * this.performance.speed; this.theme = config.practice?.theme ?? 'coast'; this.variant = config.practice?.variant ?? 0; this.discoveredModels.add(this.plane.model); if (!config.practice && (config.mode ?? 'endless') === 'endless') {
            this.formation = new FormationFlight(config.seed, this.difficulty);
        }
        this.module = systemSpec(this.plane);
        if (config.coach && !this.sortie && !config.practice && config.mode!=='daily') this.coach=new FlightSchool();
        this.generate(); this.adventure = new FlightAdventure(config.seed, award => this.adventureAward(award), points => Math.floor(points * (this.effects.has('multiplier') ? 2 : 1))); this.adventure.advance(this.adventureFrame({ x: 0, y: 0, boost: false, brake: false, gear: 3 }, false)); if (this.sortie) this.contract = new FlightContract(config.contractId ?? 'precision', baseSpeed(0) * this.performance.speed, this.difficulty); this.recorder.record(0, this, this.roll); }
    private adventureAward(award: AdventureAward) {
        const before = this.bonus;
        // Flow was quoted when each action happened; banking must not apply a
        // later power-up a second time or change the amount shown in the HUD.
        if (award.kind === 'flow') { this.bonus += award.points; this.metrics.bonus = this.bonus; this.notify(award.title + ' +' + award.points, award.titleEn + ' +' + award.points, 'flow-bank'); }
        else this.addBonus(award.points, false);
        if (award.kind !== 'flow') this.notify(award.title, award.titleEn, award.kind === 'operation' ? 'operation-complete' : 'precision');
        return this.bonus - before;
    }
    private adventureFrame(input: Input, hyper: boolean, previous?: Vec): AdventureFrame {
        const horizon = this.z + Math.max(1200, this.speed * 25);
        let availablePassages = 0, availableRings = 0, availableCoins = 0;
        for (const encounter of this.encounters)
            for (const route of encounter.route) if (route.z > this.z && route.z < horizon) availablePassages++;
        for (const pickup of this.pickups) if (!pickup.collected && pickup.z > this.z && pickup.z < horizon) {
            if (pickup.kind === 'ring') availableRings++;
            if (pickup.kind === 'coin') availableCoins++;
        }
        const steering = Math.hypot(input.x, input.y) > .2 && !!previous && Math.abs(input.x * (this.x - previous.x) + input.y * (this.y - previous.y)) > .001;
        return { time: this.time, distance: this.z, speed: this.speed, altitude: this.y - groundAt(this.x, this.z, this.theme, this.config.seed, this.variant), controlling: steering, boosting: this.boosting, hyper, theme: this.theme, weather: this.weather.kind, availablePassages, availableRings, availableCoins };
    }
    notify(ko: string, en: string, kind = 'notice') { this.message = ko; this.messageEn = en; this.messageUntil = this.time + 2.1; this.config.onEvent?.(kind, { x: this.x, y: this.y, z: this.z }); }
    courseTheme(distance: number, elapsed = this.time) {
        if (this.config.practice) return { theme: THEMES.find(t => t.id === this.config.practice!.theme)!, variant: this.config.practice.variant };
        return this.sortie ? journeyTheme(this.config.seed, courseClock(distance, this.performance.speed)) : themeAt(this.config.seed, Math.floor(elapsed / 180));
    }
    private rushCredit(source: string, amount: number) {
        if (!this.eRemaining && this.rush.credit(source, amount)) this.notify('러시 준비 · Q로 발동', 'RUSH READY · PRESS Q', 'rush-ready');
    }
    journeyHUD() {
        if (!this.sortie || this.config.practice) return undefined;
        const themes = journeyThemes(this.config.seed), index = Math.max(0, themes.indexOf(this.theme));
        const clock = courseClock(this.z, this.performance.speed), start = JOURNEY_MARKS[index], end = JOURNEY_MARKS[index + 1] ?? 180;
        return { themes, index, progress: clamp((clock - start) / (end - start), 0, 1), arrival: this.time - this.sectorEnteredAt < 3.2 };
    }
    // District plots are authored per encounter. Navigation interpolates continuously
    // between gate centres, including the approach on either side of a chunk seam.
    private clearFlightLine(encounter: Encounter) {
        const previous = this.encounters.at(-1);
        const tail = previous?.route.at(-1);
        const start = tail ? { ...tail, z: tail.z + 60 } : { ...this.lastRequired, z: encounter.start };
        const samples: Vec[] = [start];
        for (const gate of encounter.route) {
            const from = samples[samples.length - 1], approachZ = gate.z - 60;
            for (let i = 1; i <= 6; i++) {
                const t = i / 6, curve = smooth(t);
                samples.push({ x: mix(from.x, gate.x, curve), y: mix(from.y, gate.y, curve), z: mix(from.z, approachZ, t) });
            }
            samples.push({ x: gate.x, y: gate.y, z: gate.z + 60 });
        }
        const clearance = { x: this.plane.span * .34 + 3.5, y: 3.5, z: this.plane.length * .25 + 2 };
        const removed = new Set<string>();
        const key = (model: string, at: Vec) => [model, at.x, at.y, at.z].join('/');
        for (const sector of previous ? [previous, encounter] : [encounter]) {
            const plots = new Set<string>();
            const blocked = new Set<typeof sector.placements[number]>();
            for (const p of sector.placements) {
                if (p.course || !p.collision) continue;
                const meta = this.config.catalog.get(p.model)!;
                const bounds = meta.motionBounds ?? meta.bounds;
                const center = bounds.min.map((v, i) => (v + bounds.max[i]) / 2);
                const box = transformBox(center, bounds.size, p, { x: p.sx, y: p.sy, z: p.sz }, p.yaw);
                if (p.move) { box.min[p.move.axis] -= p.move.amplitude; box.max[p.move.axis] += p.move.amplitude; }
                if (box.max.z < start.z - clearance.z || box.min.z > samples[samples.length - 1].z + clearance.z) continue;
                if (samples.some((b, i) => i > 0 && sweepAABB(samples[i - 1], b, box, clearance))) {
                    blocked.add(p);
                    if (p.group) plots.add(p.group);
                }
            }
            sector.placements = sector.placements.filter(p => {
                if (!blocked.has(p) && !(p.group && plots.has(p.group))) return true;
                if (sector === previous && p.collision) removed.add(key(p.model, p));
                return false;
            });
        }
        if (removed.size) this.obstacles = this.obstacles.filter(o => !removed.has(key(o.model, o.home ?? o.position)));
    }
    generate(required = 0) {
        const ahead = Math.max(1050, this.speed * 8, required);
        while (this.nextStart < this.z + ahead) {
            const courseSpeed = this.sortie ? baseSpeed(this.nextStart) * this.performance.speed * 1.6875 : this.speed;
            const { theme, variant } = this.courseTheme(this.nextStart, this.time + (this.nextStart - this.z) / Math.max(40, courseSpeed));
            let pattern = proceduralPattern(theme.id, variant, this.config.seed, this.serial, this.nextStart, 0, this.difficulty);
            const build = (p: typeof pattern) => {
                if (this.sortie) {
                    const forecast = courseClock(this.nextStart, this.performance.speed);
                    const stage = sortieStageAt(forecast);
                    p = { ...p, generation: { ...p.generation, spacing: p.generation.spacing * stage.spacingMultiplier,
                        lead: p.generation.lead * (this.serial === 0 ? 1 : stage.spacingMultiplier) } };
                }
                // As speed grows without a cap, retain time to react and steer.
                // Stretch the generated geography before moving physical openings.
                const paced = courseSpeed > 65 ? { ...p, generation: { ...p.generation,
                    minimumSpacing: courseSpeed * (.65 + 2.4 / this.performance.handling),
                    lead: Math.max(p.generation.lead, courseSpeed * (.9 + 2 / this.performance.handling)),
                    spacing: Math.max(p.generation.spacing, courseSpeed * (.65 + 2.4 / this.performance.handling)),
                } } : p;
                return buildEncounter(paced, this.nextStart, this.config.seed, { byId: this.config.catalog }, this.plane.span, this.serial + 1, this.lastRequired, !!this.sortie);
            };
            let e = build(pattern);
            const feasible = validateReachability(e, courseSpeed, this.performance.handling, this.plane.span, { ...this.lastRequired, z: this.nextStart });
            if (!feasible) {
                // Regenerate the grammar against this aircraft's actual handling.
                // The opening follows the same seed rules as every later sector.
                for (let attempt = 1; attempt <= 8; attempt++) {
                    const p = proceduralPattern(theme.id, variant, this.config.seed, this.serial, this.nextStart, attempt, this.difficulty);
                    const candidate = build(p);
                    if (validateReachability(candidate, courseSpeed, this.performance.handling, this.plane.span, { ...this.lastRequired, z: this.nextStart })) {
                        e = candidate; pattern = p; break;
                    }
                }
                // Extremely high, unbounded speeds require smaller compulsory changes, not denser hazards.
                if (!validateReachability(e, courseSpeed, this.performance.handling, this.plane.span, { x: this.lastRequired.x, y: this.lastRequired.y, z: this.nextStart })) {
                    let px = this.lastRequired.x, py = this.lastRequired.y, pz = this.nextStart;
                    for (const r of e.route) {
                        const t = (r.z - pz) / courseSpeed;
                        const nx = clamp(r.x, px - 18 * this.performance.handling * Math.max(.1, t - .8), px + 18 * this.performance.handling * Math.max(.1, t - .8));
                        const ny = clamp(r.y, py - 12 * this.performance.handling * Math.max(.1, t - .8), py + 12 * this.performance.handling * Math.max(.1, t - .8));
                        const dx = nx - r.x, dy = ny - r.y;
                        for (const o of e.placements)
                            if (o.course && Math.abs(o.z - r.z) < 110) {
                                if (isWatercraft(o.model))
                                    continue;
                                o.x += dx;
                                // Grounded architecture changes opening height through its supports.
                                // Never translate a whole bridge/building vertically at high speeds.
                                if (o.passage && o.anchored) {
                                    const m = this.config.catalog.get(o.model)!;
                                    const base = o.y + m.bounds.min[1] * o.sy;
                                    const newBase = groundAt(o.x, o.z, e.theme, this.config.seed, e.variant);
                                    const ratio = Math.max(.3, (ny - newBase) / Math.max(3, r.y - base));
                                    o.sy *= ratio;
                                    o.y = newBase - m.bounds.min[1] * o.sy;
                                }
                                else if (o.anchored && o.role === 'roof') {
                                    const m = this.config.catalog.get(o.model)!;
                                    const base = o.supported ? o.y + m.bounds.min[1] * o.sy : groundAt(o.x, o.z, e.theme, this.config.seed, e.variant);
                                    const top = o.y + m.bounds.max[1] * o.sy;
                                    const ratio = Math.min(1, Math.max(.15, (ny - base - 6) / Math.max(1, top - base)));
                                    o.sx *= ratio; o.sy *= ratio; o.sz *= ratio;
                                    o.y = base - m.bounds.min[1] * o.sy;
                                }
                                else if (o.anchored && !o.supported && o.role !== 'foundation') {
                                    const m = this.config.catalog.get(o.model)!;
                                    o.y = groundAt(o.x, o.z, e.theme, this.config.seed, e.variant) - m.bounds.min[1] * o.sy;
                                }
                                else if (!o.anchored && !isWatercraft(o.model))
                                    o.y += dy;
                            }
                        for (const p of e.pickups)
                            if (Math.abs(p.z - r.z) < 110) {
                                p.x += dx;
                                p.y += dy;
                            }
                        r.x = nx;
                        r.y = ny;
                        r.dangerX += dx;
                        r.dangerY += dy;
                        px = nx;
                        py = ny;
                        pz = r.z;
                    }
                    // Streets, rail traffic and neighborhoods stay geographically fixed.
                    // Remove an incidental plot if the adjusted high-speed passage crosses it.
                    const knots = [{ ...this.lastRequired, z: e.start }, ...e.route.flatMap(r => [{ x: r.x, y: r.y, z: r.z - 60 }, { x: r.x, y: r.y, z: r.z + 60 }]), { x: e.route.at(-1)!.x, y: e.route.at(-1)!.y, z: e.start + e.length }];
                    const boundsFor = (p: typeof e.placements[number]) => { const meta = this.config.catalog.get(p.model)!, m = { bounds: meta.motionBounds ?? meta.bounds }; return transformBox(m.bounds.min.map((v, i) => (v + m.bounds.max[i]) / 2), m.bounds.size, p, { x: p.sx, y: p.sy, z: p.sz }, p.yaw); };
                    const obstacleFor = (p: typeof e.placements[number]): Obstacle => ({ id: 0, model: p.model, position: { x: p.x, y: p.y, z: p.z }, scale: { x: p.sx, y: p.sy, z: p.sz }, yaw: p.yaw, size: { x: 1, y: 1, z: 1 }, small: false, hit: false, scored: false, role: p.role });
                    const intersects = (a: ReturnType<typeof boundsFor>, b: ReturnType<typeof boundsFor>) => (['x', 'y', 'z'] as const).every(axis => Math.min(a.max[axis], b.max[axis]) - Math.max(a.min[axis], b.min[axis]) > .15);
                    const reserved = e.placements.filter(p => p.course && p.collision).map(p => ({ bounds: boundsFor(p), placement: p }));
                    const rejectedGroups = new Set<string>();
                    e.placements = e.placements.filter(p => {
                        if (p.course || !p.collision) return true;
                        const box = boundsFor(p);
                        const overlap = reserved.some(c => {
                            if (!intersects(box, c.bounds)) return false;
                            const proxy = this.config.proxies.get(c.placement.model);
                            return proxy ? obstacleSolids(obstacleFor(c.placement), proxy, undefined, box).some(solid => intersects(box, solid.box)) : true;
                        });
                        if (p.move) { box.min[p.move.axis] -= p.move.amplitude; box.max[p.move.axis] += p.move.amplitude; }
                        const clear = !overlap && knots.slice(1).every((b, i) => !sweepAABB(knots[i], b, box, { x: this.plane.span * .34 + 1, y: 1.7, z: this.plane.length * .25 + 2 }));
                        if (!clear && p.group) rejectedGroups.add(p.group);
                        return clear;
                    });
                    e.placements = e.placements.filter(p => !p.group || !rejectedGroups.has(p.group));
                }
            }
            const cycle = this.modelCycle.get(e.theme) ?? new Set<string>();
            this.modelCycle.set(e.theme, cycle);
            populateThemeCollection(e, this.config.catalog, this.config.seed, cycle, this.plane.span);
            this.clearFlightLine(e);
            this.encounters.push(e);
            this.formation?.addRoute(e.route);
            const last = e.route[e.route.length - 1];
            this.lastRequired = { x: last.x, y: last.y };
            this.lastPattern = pattern.id;
            this.serial++;
            for (const p of e.placements) {
                if (!p.collision)
                    continue;
                const meta = this.config.catalog.get(p.model)!;
                this.obstacles.push({ id: this.serial * 1000 + this.obstacles.length % 1000, model: p.model, position: { x: p.x, y: p.y, z: p.z }, home: { x: p.x, y: p.y, z: p.z }, scale: { x: p.sx, y: p.sy, z: p.sz }, yaw: p.yaw, size: { x: meta.bounds.size[0] * p.sx, y: meta.bounds.size[1] * p.sy, z: meta.bounds.size[2] * p.sz }, small: !!p.small, role: p.role, animationPhase: p.animationPhase, moving: p.move, hit: false, scored: false });
            }
            this.pickups.push(...e.pickups);
            this.nextStart = e.start + e.length;
        }
        this.encounters = this.encounters.filter(e => e.start + e.length > this.z - 160);
        this.obstacles = this.obstacles.filter(o => o.position.z > this.z - 150);
        this.pickups = this.pickups.filter(p => p.z > this.z - 80 && (!p.collected || p.kind === 'ring'));
    }
    step(dt: number, input: Input) {
        if (this.failed || this.completed)
            return;
        if (this.config.settings.control === 'gear' && !(input.boost && input.brake))
            input.gear = clamp(input.gear + (input.pendingGear ?? 0), 1, 5);
        input.pendingGear = 0;
        if (input.rush && !this.eRemaining && this.rush.activate()) { this.boostHeat = 0; this.notify('러시 · 5초 가속 + 코인 자석', 'RUSH · 5s BOOST + COIN MAGNET', 'rush'); }
        input.rush = false;
        const old = { x: this.x, y: this.y, z: this.z };
        this.time += dt;
        this.shake = Math.max(0, this.shake - dt * 2);
        for (const [kind, left] of this.effects) {
            const remaining = left - dt;
            if (remaining <= 0) {
                this.effects.delete(kind);
                if (kind === 'shield')
                    this.shieldExpiredAt = this.z;
            }
            else
                this.effects.set(kind, remaining);
        }
        const slow = this.effects.has('slow') ? .65 : 1;
        this.motionTime += dt * slow;
        const sector = this.sortie ? this.encounters.find(e => this.z >= e.start && this.z < e.start + e.length) : undefined;
        const selected = sector ? { theme: THEMES.find(t => t.id === sector.theme)!, variant: sector.variant } : this.courseTheme(this.z);
        const nextTheme = selected.theme.id;
        if (nextTheme !== this.theme || selected.variant !== this.variant) {
            this.sectorEnteredAt = this.time;
            this.theme = nextTheme;
            this.variant = selected.variant;
            this.notify(selected.theme.name + ' 진입', selected.theme.en + ' · ENTERING', 'theme');
        }
        this.weather = this.weatherController.get(this.time, dt, this.theme, this.config.seed, this.config.practice);
        const w = this.weather;
        const baseline = baseSpeed(this.z) * this.performance.speed, control = this.config.settings.control === 'gear' ? GEAR_RATIOS[clamp(input.gear, 1, 5) - 1] : input.boost === input.brake ? 1 : input.boost ? 1.35 : .70;
        const rushing = this.rush.hud().remaining > 0 && !this.eRemaining;
        this.boosting = (control > 1 || rushing && control >= 1) && !(input.boost && input.brake);
        this.boost = damp(this.boost, this.boosting ? 1 : 0, this.boosting ? 3.5 : 5, dt);
        this.boostHeat = damp(this.boostHeat, this.boosting ? 1 : 0, this.boosting ? .36 : 1.5, dt);
        const activeE = this.eRemaining > 0;
        const modifier = activeE ? 1.2 : control * Math.max(this.effects.has('turbo') ? 1.25 : 1, rushing && control >= 1 ? 1.18 : 1) * slow;
        const slipstream = this.module?.id==='turbine' && !activeE && this.time<this.moduleUntil ? 1+this.module.strength/100 : 1;
        const target = baseline * modifier * slipstream;
        const speedK = activeE ? 4 : (target < this.speed ? 4.2 : 2.2) * this.performance.accel;
        this.speed = damp(this.speed, target, speedK, dt);
        this.z += this.speed * dt;
        if (activeE) {
            this.eTime += dt;
            if (this.eTime >= 15 - 1e-9)
                this.eTime = 15;
            this.eRemaining = Math.max(0, 15 - this.eTime);
            this.trickPosition(dt);
            if (this.eRemaining <= 0) {
                this.eEndedAt = this.z;
                this.trickRoll = this.trickPitch = this.trickYaw = 0;
                input.x = input.y = 0;
                input.boost = input.brake = false;
                input.gear = 3;
                input.pendingGear = 0;
                this.vx = this.vy = 0;
                this.notify('조종 복귀 · 다음 통로 확인', 'CONTROL RESTORED · READ THE NEXT LINE', 'e-end');
            }
        }
        else {
            const sensitivity = this.config.settings.sensitivity;
            const dead = (v: number) => Math.abs(v) < .12 ? 0 : Math.sign(v) * Math.pow((Math.abs(v) - .12) / .88, 1.22 / sensitivity);
            const tx = dead(input.x) * 18 * this.performance.handling, ty = dead(input.y) * 12 * this.performance.handling;
            this.vx = damp(this.vx, tx, 6.5 * this.performance.handling * sensitivity, dt);
            this.vy = damp(this.vy, ty, 7.5 * this.performance.handling * sensitivity, dt);
            const wind = Math.sin(this.motionTime * .8 + this.config.seed) * w.wind * .65;
            this.x += this.vx * dt + wind * dt;
            this.y += this.vy * dt;
            this.x = clamp(this.x, -AIRSPACE.halfWidth, AIRSPACE.halfWidth);
            this.y = clamp(this.y, .25, AIRSPACE.ceiling);
            if (Math.abs(this.x) > AIRSPACE.softEdge)
                this.x -= Math.sign(this.x) * (Math.abs(this.x) - AIRSPACE.softEdge) * dt * .55;
            this.roll = damp(this.roll, -input.x * .44 - clamp(this.vx / 24, -1, 1) * .10, 8, dt);
            this.pitch = damp(this.pitch, input.y * .12 + Math.atan2(this.vy, this.speed) * .45, 8, dt);
            this.yaw = damp(this.yaw, -Math.atan2(this.vx, this.speed) * .55, 6, dt);
        }
        this.generate();
        this.upcomingChoice();
        this.metrics.distance = this.z;
        this.metrics.time = this.time;
        const dz = this.z - old.z;
        this.rush.advance(dt, dz, activeE);
        const ground = groundAt(this.x, this.z, this.theme, this.config.seed, this.variant);
        this.adventure.advance(this.adventureFrame(input, activeE, old));
        const key = this.theme === 'korea' ? `korea:${this.variant}` : this.theme;
        this.metrics.themeTime[key] = (this.metrics.themeTime[key] ?? 0) + dt;
        if (!this.metrics.themes.includes(key) && this.metrics.themeTime[key] >= 20) {
            this.metrics.themes.push(key);
            this.notify('풍경 발견 · ' + selected.theme.name, 'DISCOVERED · ' + selected.theme.en, 'discover');
        }
        if (!this.metrics.weathers.includes(w.kind))
            this.metrics.weathers.push(w.kind);
        if (w.rain > .35)
            this.metrics.rainDistance += dz;
        if (w.night > .5)
            this.metrics.nightDistance += dz;
        else
            this.metrics.dayDistance += dz;
        if (w.snow) {
            this.snowCleanDistance += dz;
            this.metrics.snowSafe = Math.max(this.metrics.snowSafe, this.snowCleanDistance);
        }
        else
            this.snowCleanDistance = 0;
        if (this.shieldExpiredAt >= 0 && this.lastDamageZ < this.shieldExpiredAt)
            this.metrics.postShield = Math.max(this.metrics.postShield, this.z - this.shieldExpiredAt);
        if (this.repairAt >= 0 && this.lastDamageZ < this.repairAt)
            this.metrics.postRepair = Math.max(this.metrics.postRepair, this.z - this.repairAt);
        if (this.eEndedAt >= 0 && this.lastDamageZ < this.eEndedAt)
            this.metrics.postE = Math.max(this.metrics.postE, this.z - this.eEndedAt);
        if (this.recoveryAt >= 0 && this.lastDamageZ < this.recoveryAt)
            this.metrics.recoveryDistance = Math.max(this.metrics.recoveryDistance, this.z - this.recoveryAt);
        if (!activeE) {
            if (control > 1)
                this.metrics.boost += dz;
            const altitude = this.y - ground;
            if (altitude >= 5 && altitude <= 12) {
                const prev = Math.floor(this.metrics.low / 10);
                this.metrics.low += dz;
                if (this.theme === 'coast')
                    this.metrics.coastLow += dz;
                const earned = Math.floor(this.metrics.low / 10) - prev;
                if (earned > 0)
                    this.addBonus(earned * 4, false);
            }
            if (this.y - ground < 1.5) {
                this.fail(this.theme === 'coast' || this.theme === 'river' ? '수면 충돌' : '지면 충돌', 'GROUND / WATER IMPACT', old);
                return;
            }
        }
        const radius = { x: this.plane.span * .34, y: 1.05, z: this.plane.length * .25 };
        const contacts: { obstacle: Obstacle; meta: AssetMeta; oldPosition: Vec; hit: ReturnType<typeof obstacleContact> }[] = [];
        for (const o of this.obstacles) {
            const oldPos = o.moving ? { ...o.position } : o.position;
            if (o.moving) {
                const base = o.home;
                if (base) {
                    o.position[o.moving.axis] = base[o.moving.axis] + Math.sin(this.motionTime * o.moving.frequency + o.moving.phase) * o.moving.amplitude;
                }
            }
            if (this.config.isObstacleVisible && !this.config.isObstacleVisible(o)) continue;
            const meta = this.config.catalog.get(o.model)!, broad = collisionBounds(o, meta, this.config.proxies.get(o.model));
            const shiftZ = oldPos.z - o.position.z;
            if (broad.max.z + Math.max(0, shiftZ) < old.z - radius.z || broad.min.z + Math.min(0, shiftZ) > this.z + radius.z)
                continue;
            contacts.push({ obstacle: o, meta, oldPosition: oldPos, hit: activeE ? null : obstacleContact(o, meta, this.config.proxies.get(o.model), old, { x: this.x, y: this.y, z: this.z }, radius, oldPos, this.motionTime) });
        }
        // Construction order is unrelated to impact order. Process the first
        // swept contact before any later damage, shield use or near-miss award.
        contacts.sort((a, b) => (a.hit?.t ?? Infinity) - (b.hit?.t ?? Infinity) || Number(a.obstacle.small) - Number(b.obstacle.small) || a.obstacle.id - b.obstacle.id);
        for (const { obstacle: o, meta, oldPosition, hit } of contacts) {
            if (!activeE) {
                if (hit) {
                    if (!o.small) {
                        this.fail('대형 구조물 충돌', 'STRUCTURE IMPACT', { x: mix(old.x, this.x, hit.t), y: mix(old.y, this.y, hit.t), z: mix(old.z, this.z, hit.t) });
                        return;
                    }
                    if (!o.hit && this.time >= this.hitCooldown) {
                        o.hit = true;
                        this.metrics.minorHits++;
                        this.lastMinorHitZ = this.z;
                        const frontal = Math.abs(hit.normal.z) >= .85;
                        const fatal = this.speed >= 110 && this.speed >= baseline * 1.2 && frontal;
                        if (this.effects.has('shield')) {
                            this.effects.delete('shield');
                            this.shieldExpiredAt = this.z;
                            this.metrics.shieldBlocks++;
                            this.notify('보호막이 충격을 흡수했습니다', 'SHIELD ABSORBED THE HIT', 'shield');
                        }
                        else if (fatal) {
                            this.fail('고속 정면 충돌', 'HIGH SPEED IMPACT', old);
                            return;
                        }
                        else {
                            this.damage(Math.min(95, Math.round(18 + .38 * Math.max(0, this.speed - 40))));
                            if (this.failed) return;
                        }
                    }
                }
            }
            if (!activeE && !hit && !o.hit && !o.scored && old.z < oldPosition.z && this.z >= o.position.z) {
                const nearRadius = { x: radius.x + 1.8, y: radius.y + 1.8, z: radius.z };
                if (obstacleContact(o, meta, this.config.proxies.get(o.model), old, { x: this.x, y: this.y, z: this.z }, nearRadius, oldPosition, this.motionTime)) {
                    const narrowLine = this.encounters.some(e => e.route.some(r => Math.abs(r.z - o.position.z) < 35 && Math.hypot(this.x - r.dangerX, this.y - r.dangerY) < 6));
                    o.scored = true;
                    if (!narrowLine)
                        this.risk(120, 'near', `obstacle:${o.id}`);
                }
            }
        }
        if (!activeE) this.coach?.advance(dt,input,control,Math.hypot(this.x-old.x,this.y-old.y));
        for (const p of this.pickups) {
            const reach = p.kind === 'ring' ? 0 : radius.z;
            if (p.collected || p.z < old.z - reach || p.z > this.z + reach)
                continue;
            const t = clamp((p.z - old.z) / (this.z - old.z || 1), 0, 1), x = mix(old.x, this.x, t), y = mix(old.y, this.y, t);
            const offset = Math.hypot(x - p.x, y - p.y);
            if (p.kind === 'ring' && (activeE || offset > p.radius)) {
                this.ringStreak = 0;
                continue;
            }
            if (p.kind !== 'ring' && offset > Math.max(p.radius, rushing && p.kind === 'coin' ? 8 : 3))
                continue;
            if (activeE && p.kind !== 'coin')
                continue;
            p.collected = true;
            // Coincident orientation markers share a single precision award.
            if (p.kind === 'ring' && !p.risk) this.lessonRings.set(p.z, { x: p.x, y: p.y });
            const central = p.kind === 'ring' && offset <= p.radius * .30;
            this.collect(p.kind, `pickup:${p.id}`, central);
            if (p.kind === 'ring') {
                this.coach?.pass();
                if (central && this.module?.id==='capacitor') {
                    this.rushCredit('capacitor:'+p.id,this.module.strength);
                    this.moduleUntil=this.time+1.4;
                }
                this.ringStreak = central ? this.ringStreak + 1 : 0;
                this.bestRingStreak = Math.max(this.bestRingStreak, this.ringStreak);
                const award = central && this.ringStreak % 3 === 0 ? 300 : 0;
                const speedBonus = p.speedGate && (this.boosting || rushing) ? 250 : 0;
                this.bonus += award + speedBonus;
                this.metrics.bonus = this.bonus;
                this.ringJudgement = { offset, award, speedBonus, until: this.time + 2.5 };
            }
        }
        if (!activeE)
            for (const e of this.encounters)
                for (let i = 0; i < e.route.length; i++) {
                    const r = e.route[i];
                    if (e.passed.has(i) || old.z > r.z || this.z < r.z)
                        continue;
                    e.passed.add(i);
                    const crossing = clamp((r.z - old.z) / Math.max(1e-9, this.z - old.z), 0, 1);
                    const crossingX = mix(old.x, this.x, crossing), crossingY = mix(old.y, this.y, crossing);
                    const dx = Math.abs(crossingX - r.x), dy = Math.abs(crossingY - r.y);
                    const lessonRing = this.lessonRings.get(r.z);
                    this.lessonRings.delete(r.z);
                    if (dx > r.width / 2 || dy > r.height / 2) {
                        if (r.role !== 'orientation') this.relayChain=this.relayPerfect=0;
                        continue;
                    }
                    this.coach?.pass();
                    const candidate = this.choices.get(`${e.start}:${i}`);
                    if (candidate && choiceCrossing(candidate, old, { x: this.x, y: this.y, z: this.z }) === 'risk') {
                        if (this.adventure.routeChoice(candidate.id, ROUTE_CHOICE_BONUS))
                            this.config.onEvent?.('choice', { x: crossingX, y: crossingY, z: r.z });
                    }
                    this.rushCredit(`route:${e.start}:${i}`, dx < r.width * .18 && dy < r.height * .22 ? 14 : 5);
                    this.metrics.directionPass++;
                    if (control < .95)
                        this.metrics.brakePass++;
                    // The optional opening is a control lesson in clear air,
                    // not a hazardous narrow passage. Its coincident safe/risk
                    // marker must never pay risk bonuses or advance risk quests.
                    const danger = r.role !== 'orientation' && Math.hypot(crossingX - r.dangerX, crossingY - r.dangerY) < 6;
                    if (this.effects.has('slow') && danger)
                        this.metrics.slowPass++;
                    if (w.kind === 'fog')
                        this.metrics.fogPass++;
                    if (danger) {
                        this.metrics.riskPaths++;
                        this.risk(300, 'narrow', `passage:${e.start}:${i}`);
                    }
                    else {
                        this.metrics.safePaths++;
                        this.notify('안전 경로 통과', 'SAFE LINE CLEARED', 'pass');
                    }
                    // An orientation ring and its coincident direction marker are one
                    // physical feat. Both goal types can progress, but it earns
                    // one precision/flow award rather than manufacturing a chain.
                    const sharedLesson = r.role === 'orientation' && !!lessonRing && Math.hypot(lessonRing.x - r.x, lessonRing.y - r.y) < .01;
                    this.adventure.event('route', `passage:${e.start}:${i}`, Math.hypot(dx / Math.max(1, r.width / 2), dy / Math.max(1, r.height / 2)) <= .25, !sharedLesson);
                    if ((r.role === 'bridge' || r.role === 'under') && ['coast', 'river'].includes(this.theme))
                        this.metrics.bridgePass++;
                    if (r.role === 'roof' && this.theme === 'village')
                        this.metrics.roofPass++;
                    if (r.role!=='orientation') this.structuralPass(dx<r.width*.18 && dy<r.height*.22);
                    if (this.theme === 'city')
                        this.metrics.cityPass++;
                    if (['desert', 'waterfall'].includes(this.theme))
                        this.metrics.canyonPass++;
                }
        if (this.combo && this.time > this.comboUntil)
            this.combo = 0;
        if (w.kind === 'storm' && this.time >= LIGHTNING.firstPossibleSecond && !this.lightningDone && hash(this.config.seed + Math.floor(this.time / LIGHTNING.seedWindowSeconds)) < LIGHTNING.chancePerWindow) {
            if (!this.lightningWarn) {
                this.lightningWarn = this.time + LIGHTNING.warningSeconds;
                this.notify(`번개 접근 · 좌우로 초속 ${LIGHTNING.lateralEscapeSpeed}m 이상 회피`, `LIGHTNING · MOVE SIDEWAYS AT LEAST ${LIGHTNING.lateralEscapeSpeed} m/s`, 'warning');
            }
            else if (this.time > this.lightningWarn) {
                this.lightningDone = true;
                if (!activeE && Math.abs(this.vx) < LIGHTNING.lateralEscapeSpeed) {
                    if (this.effects.has('shield')) {
                        this.effects.delete('shield');
                        this.metrics.shieldBlocks++;
                    }
                    else
                        this.damage(LIGHTNING.damage);
                }
            }
        }
        if (w.kind !== 'storm') {
            this.lightningWarn = 0;
            this.lightningDone = false;
        }
        if (this.formation && !this.training && !this.failed) {
            const event = this.formation.advance(dt, this, activeE, !!input.transmit);
            if (event) this.formationEvent(event);
        }
        const line = this.recordLine;
        if (!this.failed && line !== undefined && old.z < line && this.z >= line) {
            this.notify('개인 거리 기록 돌파', 'PERSONAL DISTANCE RECORD', 'record-pass');
        }
        input.transmit = false;
        if (this.sortie && !this.failed) {
            if (!activeE && this.contract) {
                for (const reward of this.contract.observe({ perfect: this.adventure.debrief().perfectPasses, boost: this.metrics.boost, risk: this.metrics.near + this.metrics.narrow })) {
                    this.bonus += reward; this.metrics.bonus = this.bonus;
                    this.notify(`비행 목표 ${this.contract.result().tier}/3 · +${reward}`, `FLIGHT CONTRACT ${this.contract.result().tier}/3 · +${reward}`, 'operation-complete');
                }
            }
            this.recorder.record(this.time, this, this.roll);
            const before = this.sortie.hud().stage.id;
            const summary = this.adventure.debrief();
            if (this.sortie.advance(dt, activeE, { operations: summary.operationsCompleted, perfectPasses: summary.perfectPasses })) {
                this.completed = true;
                this.adventure.finish();
                // Completion has a fixed, one-time score. Active power-ups do
                // not multiply it and result/checkpoint reads never pay it.
                this.bonus += SORTIE_COMPLETION_BONUS;
                this.metrics.bonus = this.bonus;
                this.reason = '3분 출격 완수'; this.reasonEn = 'SORTIE COMPLETE';
                this.notify('출격 완수 · +1,200', 'SORTIE COMPLETE · +1,200', 'sortie-complete');
            } else {
                const stage = this.sortie.hud().stage;
                if (stage.id !== before) this.notify(stage.label, stage.en, 'sortie-stage');
            }
        }
    }
    get trickDirection() {
        const middle = this.ePath.find(knot => knot.t >= (this.ePath.at(-1)?.t ?? 0) * .4);
        return (middle?.x ?? this.eStart.x) >= this.eStart.x ? 1 : -1;
    }
    get recordLine(): number | undefined {
        const records = this.config.personalDistances;
        if (!records || !this.formation) return;
        const distance = this.eUsed ? records.hyper : records.manual;
        return Number.isFinite(distance) && distance > 0 ? Math.floor(distance) + 1 : undefined;
    }
    private formationEvent(event: FormationEvent) {
        if (event.points > 0) {
            this.bonus += event.points;
            this.metrics.bonus = this.bonus;
            const title = event.radio === 'ace' ? ['편대 완주', 'FORMATION COMPLETE'] : ['조기 송신', 'EARLY TRANSMISSION'];
            this.notify(title[0] + ' +' + event.points, title[1] + ' +' + event.points, 'formation-' + event.radio);
        } else if (event.radio === 'lost') {
            this.notify('선도기 이탈 · 편대 비행 종료', 'COURIER DEPARTED', 'formation-lost');
        } else {
            this.config.onEvent?.('formation-' + event.radio);
        }
    }
    get training() {return !!this.coach && this.coach.lesson!=='complete';}
    private structuralPass(precise:boolean) {
        if (this.module?.id==='repair' && ++this.repairPasses>=2) {
            this.repairPasses=0;
            const recovered=Math.min(this.maxHp-this.hp,Math.ceil(this.maxHp*this.module.strength/100));
            this.hp+=recovered; this.metrics.repair+=recovered;
            if (recovered) this.moduleUntil=this.time+1.5;
        }
        if (this.difficulty!=='standard' && this.difficulty!=='expert') return;
        this.relayChain++;
        if (precise) this.relayPerfect++;
        if (this.relayChain<3) return;
        this.relayAward=this.relayPerfect===3 ? 750 : 450;
        this.bonus+=this.relayAward; this.metrics.bonus=this.bonus; this.relayClears++;
        this.relayChain=this.relayPerfect=0; this.relayUntil=this.time+2;
        this.notify('항로 릴레이 완주 +'+this.relayAward,'RELAY CLEARED +'+this.relayAward,'relay');
    }
    addBonus(base: number, combo = true) { const factor = (combo ? 1 + .15 * Math.min(Math.max(0, this.combo - 1), 10) : 1) * (this.effects.has('multiplier') ? 2 : 1); const score = Math.floor(base * factor); this.bonus += score; this.metrics.bonus = this.bonus; }
    risk(base: number, kind: 'near' | 'narrow', source?: string) {
        this.combo = this.time <= this.comboUntil ? this.combo + 1 : 1;
        this.comboUntil = this.time + 7;
        if (this.module?.id==='turbine') this.moduleUntil=this.time+3;
        this.metrics.maxCombo = Math.max(this.metrics.maxCombo, this.combo);
        this.metrics[kind]++;
        const high = this.speed >= baseSpeed(this.z) * this.performance.speed * 1.12;
        if (high)
            this.metrics.highRisk++;
        if (kind === 'near' && this.effects.has('turbo'))
            this.metrics.turboNear++;
        if (this.theme === 'forest' && kind === 'near')
            this.metrics.forestNear++;
        if (this.weather.kind === 'storm' && kind === 'near')
            this.metrics.stormNear++;
        this.addBonus(base + (high ? 80 : 0));
        this.notify(kind === 'near' ? '근접 통과' : '좁은 통과', kind === 'near' ? 'CLOSE CALL' : 'NARROW LINE', 'risk');
        if (source && !this.eRemaining) this.adventure.event(kind, source);
    }
    collect(kind: ItemKind, source?: string, perfect = false) {
        if (kind === 'coin') {
            this.coins++;
            this.metrics.coins++;
            this.metrics.weatherCoins[this.weather.kind] = (this.metrics.weatherCoins[this.weather.kind] ?? 0) + 1;
            this.config.onEvent?.('coin');
            if (source && !this.eRemaining) { this.adventure.event('coin', source); this.rushCredit(source, .6); }
            return;
        }
        if (kind === 'ring') {
            if (source) this.rushCredit(source, perfect ? 18 : 8);
            this.metrics.rings++;
            if (this.weather.night > .5)
                this.metrics.nightRings++;
            if (this.effects.has('multiplier'))
                this.metrics.multRings++;
            this.addBonus(150);
            this.notify('링 +150', 'RING +150', 'ring');
            if (source && !this.eRemaining) this.adventure.event('ring', source, perfect);
            return;
        }
        if (kind === 'crystal') {
            this.metrics.crystals++;
            this.addBonus(75);
            this.config.onEvent?.('crystal');
            return;
        }
        if (!this.metrics.effects.includes(kind))
            this.metrics.effects.push(kind);
        if (kind === 'repair') {
            const heal = Math.min(35, this.maxHp - this.hp);
            this.hp += heal;
            this.metrics.repair += heal;
            this.repairAt = this.z;
            if (heal > 0 && this.lastMinorHitZ >= 0)
                this.recoveryAt = this.z;
            this.notify('기체 수리 +' + heal, 'AIRFRAME REPAIRED +' + heal, 'repair');
            return;
        }
        if (kind === 'slow')
            this.effects.delete('turbo');
        if (kind === 'turbo')
            this.effects.delete('slow');
        this.effects.set(kind, kind === 'shield' ? 10 : kind === 'multiplier' ? 12 : kind === 'slow' ? 6 : 5);
        this.notify({ shield: '보호막', multiplier: '점수 ×2', slow: '슬로우 타임', turbo: '터보' }[kind] ?? kind, kind.toUpperCase(), 'effect');
    }
    damage(amount: number) {
        if (this.metrics.damage === 0)
            this.metrics.cleanDistance = this.z;
        this.hp -= amount;
        this.metrics.damage += amount;
        this.damageCount++;
        this.relayChain=this.relayPerfect=0;
        this.adventure.damage(); this.rush.damage(); this.formation?.interrupt();
        this.snowCleanDistance = 0;
        this.lastDamageZ = this.z;
        this.combo = 0;
        this.hitCooldown = this.time + .6;
        this.shake = .5;
        this.notify('기체 손상 −' + amount, 'AIRFRAME DAMAGE −' + amount, 'damage');
        if (this.hp <= 0)
            this.fail('기체 내구도 소진', 'AIRFRAME DESTROYED', { x: this.x, y: this.y, z: this.z });
    }
    fail(ko: string, en: string, at: Vec) { this.adventure?.crash(); this.rush.damage(); this.formation?.interrupt(); this.failed = true; this.reason = ko; this.reasonEn = en; this.impact = at; this.shake = 1; this.config.onEvent?.('crash', at); }
    observeLandmark(id: string, real: boolean) {
        if (this.config.practice || this.failed || this.completed)
            return;
        const key = (real ? 'real:' : 'fiction:') + id;
        if (!this.metrics.landmarks.includes(key)) {
            this.metrics.landmarks.push(key);
            this.notify('랜드마크 발견', 'LANDMARK DISCOVERED', 'discover');
        }
    }
    observeModel(id: string) {
        if (this.config.practice || this.failed || this.completed || !this.config.catalog.has(id) || this.discoveredModels.has(id)) return;
        this.discoveredModels.add(id);
        this.latestModel = this.config.catalog.get(id)!.title;
        const count = themeCollection(this.theme, this.config.catalog).filter(meta => this.discoveredModels.has(meta.id)).length;
        const milestone = Math.floor(count / 8), previous = this.surveyMilestones.get(this.theme) ?? 0;
        if (milestone > previous) {
            this.surveyMilestones.set(this.theme, milestone);
            const reward = (milestone - previous) * 600; this.addBonus(reward, false);
            this.notify(`새 풍경 ${count}종 · 탐사 보너스 +${reward}`, `${count} SCENES · SURVEY BONUS +${reward}`, 'discover');
        }
    }
    /** Only the next passage is proved, at most twice per second while streaming. */
    private upcomingChoice(): RouteChoice | undefined {
        for (const [id, choice] of this.choices) if (choice.z < this.z - 80) this.choices.delete(id);
        if (this.eRemaining > 0 || this.failed || this.completed) return undefined;
        for (const encounter of this.encounters) {
            const index = encounter.route.findIndex(route => route.z > this.z + 5);
            if (index < 0) continue;
            const route = encounter.route[index], id = `${encounter.start}:${index}`;
            const existing = this.choices.get(id);
            if (existing) return existing;
            if (route.z - this.z > Math.max(380, this.speed * 8) || this.time < this.choiceRetryAt) return undefined;
            this.choiceRetryAt = this.time + .5;
            const previous = encounter.route[index - 1] ?? { ...(encounter.entry ?? { x: 0, y: 24 }), z: encounter.start };
            const next = encounter.route[index + 1] ?? { x: route.x, y: route.y, z: encounter.start + encounter.length };
            const candidate = createRouteChoice(route, id, { plane: this.plane, speed: Math.max(this.speed, baseSpeed(next.z) * this.performance.speed * 1.25), handling: this.performance.handling, previous, next, catalog: this.config.catalog, proxies: this.config.proxies, obstacles: this.obstacles, ground: (x, z) => groundAt(x, z, encounter.theme, this.config.seed, encounter.variant) });
            if (candidate) { this.choices.set(id, candidate); return candidate; }
            return undefined;
        }
        return undefined;
    }
    hudChoice() { return this.upcomingChoice(); }
    bankFlow() { return !this.failed && !this.completed && this.eRemaining <= 0 && this.adventure.bankFlow(); }
    activateE() { const request = this.trickSnapshot(); return request ? this.engageTrick(request, createTrickPath(trickContext(request, this.config.proxies))) : false; }
    trickSnapshot(): TrickPlanRequest | null {
        if (this.eUsed || this.failed || this.completed) return null;
        const start = { x: this.x, y: this.y, z: this.z };
        const future = predictTrickDistances({ start, speed: this.speed, performance: this.performance });
        this.generate(future.at(-1)!.z - this.z + 200);
        return { start, speed: this.speed, performance: this.performance, span: this.plane.span, length: this.plane.length, routes: this.encounters.flatMap(e => e.route), obstacles: this.obstacles, assets: [...new Set(this.obstacles.map(o => o.model))].map(id => this.config.catalog.get(id)!), seed: this.config.seed, theme: this.theme, variant: this.variant, atTime: this.time };
    }
    engageTrick(request: TrickPlanRequest, path: TrickPathResult) {
        if (this.eUsed || this.failed || this.completed || this.time !== request.atTime || this.x !== request.start.x || this.y !== request.start.y || this.z !== request.start.z) return false;
        if (!path.clear) {
            this.notify('안전 공간에서 다시 발동하세요', 'ACTIVATE IN CLEAR AIRSPACE', 'warning');
            return false;
        }
        this.relayChain=this.relayPerfect=0;
        this.eUsed = true;
        this.formation?.interrupt();
        this.adventure.hyperStart();
        this.eRemaining = 15;
        this.eTime = 0;
        this.eStart = { x: this.x, y: this.y };
        this.combo = 0;
        this.ePath = path.knots;
        this.ePathClear = path.clear;
        this.trickVariant = path.strength;
        const exit = sampleTrickPath(this.ePath, 15, path.knots.find(p => p.t === 15)!.z);
        this.eExit = { x: exit.x, y: exit.y };
        this.notify('하이퍼 트릭 · 15초 무적', 'HYPER TRICK · 15 SECONDS', 'e-start');
        return true;
    }
    trickPosition(dt: number) {
        const t = Math.min(this.eTime, 15), p = sampleTrickPath(this.ePath, t, this.z);
        this.x = p.x;
        this.y = p.y;
        const reduced = this.config.settings.reducedMotion;
        this.trickRoll = 0;
        this.trickPitch = 0;
        this.trickYaw = 0;
        if (!reduced && this.trickVariant > 0) {
            const lead = sampleTrickPath(this.ePath, Math.min(15,t+.32), this.z);
            const direction = this.trickDirection;
            const bank = Math.atan2(lead.x-p.x, Math.max(3,this.speed*.32));
            const climb = Math.atan2(lead.y-p.y, Math.max(3,this.speed*.32));
            const envelope = smooth(clamp(t/1.5,0,1)) * smooth(clamp((15-t)/2,0,1));
            const roll = smooth(clamp((t-3.3)/4.6,0,1));
            this.trickRoll = direction * roll * 2*Math.PI - envelope*(bank*.85+direction*.32*Math.sin(t*.69));
            this.trickYaw = -bank * envelope;
            this.trickPitch = envelope * (climb + .12*Math.sin(t*.8));
        }
        this.roll = damp(this.roll, 0, 6, dt);
        this.pitch = damp(this.pitch, 0, 6, dt);
        this.yaw = damp(this.yaw, 0, 6, dt);
    }
    hud(input: Input): HUD { const ghost = this.config.rival ? replayPose(this.config.rival.replay, this.time) : null; const choice = this.upcomingChoice(); const next = this.encounters.flatMap(e => e.route).find(point => point.z > this.z + 5); return { regionEntry: !this.sortie && this.sectorEnteredAt>0 && this.time-this.sectorEnteredAt<2.5, coach:this.coach?.hud(), module:this.module ? { id:this.module.id, name:this.module.name,en:this.module.en,strength:this.module.strength,active:this.time<this.moduleUntil,progress:this.module.id==='repair' ? this.repairPasses/2 : 0 } : undefined, relay:this.difficulty==='standard'||this.difficulty==='expert' ? {chain:this.relayChain,clears:this.relayClears,lastAward:this.relayAward,reveal:this.time<this.relayUntil} : undefined, attitude: { bank:this.roll+this.trickRoll, pitch:this.pitch+this.trickPitch, climb:this.eRemaining ? (sampleTrickPath(this.ePath, Math.min(15,this.eTime+.2),this.z).y-this.y)/.2 : this.vy }, ringPass: this.ringJudgement && this.time < this.ringJudgement.until ? { offset: this.ringJudgement.offset, award: this.ringJudgement.award, speedBonus: this.ringJudgement.speedBonus, streak: this.ringStreak } : undefined, recordLine: this.recordLine, formationIncoming: this.eRemaining || this.training ? undefined : this.formation?.approachIn, formation: this.formation?.hud(), rush: this.rush.hud(), journey: this.journeyHUD(), difficulty: this.difficulty, contract: this.contract?.result(), ghost: ghost && !this.eUsed ? { delta: this.z - ghost.z, score: this.config.rival!.score } : undefined, sortie: this.sortie?.hud(), choice: choice ? choiceHUD(choice, { x: this.x, y: this.y, z: this.z }, ROUTE_CHOICE_BONUS * (this.effects.has('multiplier') ? 2 : 1)) : undefined, adventure: this.adventure.hud(), collection: { found: themeCollection(this.theme, this.config.catalog).filter(meta => this.discoveredModels.has(meta.id)).length, total: themeCollection(this.theme, this.config.catalog).length, latest: this.latestModel }, navigation: next ? { distance: next.z - this.z, dx: next.x - this.x, dy: next.y - this.y, role: next.role } : undefined, distance: this.z, score: Math.floor(this.z) + this.bonus, bonus: this.bonus, coins: this.coins, combo: this.combo, maxCombo: this.metrics.maxCombo, speed: this.speed * 3.6, hp: Math.max(0, this.hp), maxHp: this.maxHp, altitude: this.y - groundAt(this.x, this.z, this.theme, this.config.seed, this.variant), time: this.time, theme: this.theme, variant: this.variant, weather: this.weather, gear: input.gear, boost: this.boost, heat: this.boostHeat, eUsed: this.eUsed, eRemaining: this.eRemaining, effects: [...this.effects].map(([kind, remaining]) => ({ kind, remaining })), message: this.message, messageEn: this.messageEn, messageUntil: this.messageUntil, route: this.encounters.find(e => e.start + e.length > this.z)?.title ?? '', routeEn: this.encounters.find(e => e.start + e.length > this.z)?.en ?? '', fps: 0, draws: 0, triangles: 0, metrics: { ...this.metrics } }; }
    result(interrupted = false, settleVault = false): RunResult { const secure = settleVault && !this.failed, extra = secure ? this.adventure.hud()?.vault?.pending ?? 0 : 0; const distance = Math.floor(this.z), bonus = this.bonus + extra, practice = !!this.config.practice; return { relayClears:this.relayClears, bestRingStreak: this.bestRingStreak, ...(this.formation ? { formation: this.formation.result() } : {}), rush: { ...this.rush.result(), distance: Math.min(distance, this.rush.result().distance) }, courseEdition: COURSE_EDITION, difficulty: this.difficulty, ...(this.sortie ? { seed: this.config.seed >>> 0, level: this.config.level, contract: this.contract?.result(), ...(this.completed && !this.eUsed && !interrupted ? { replay: this.recorder.result() } : {}) } : {}), ...(this.sortie ? { sortie: { ...this.sortie.result(), operations: this.adventure.debrief().operationsCompleted, perfectPasses: this.adventure.debrief().perfectPasses } } : {}), mode: this.config.mode ?? 'endless', ...(this.config.dailyKey ? { dailyKey: this.config.dailyKey } : {}), debrief: this.adventure.debrief(secure), id: this.config.id, date: new Date().toISOString(), planeId: this.plane.id, distance, bonus, score: distance + bonus, coins: this.coins, reward: practice ? 0 : Math.floor(distance / 30) + Math.floor(bonus / 180) + this.coins, maxCombo: this.metrics.maxCombo, eUsed: this.eUsed, practice, interrupted, reason: this.reason || '비행 종료', reasonEn: this.reasonEn || 'FLIGHT ENDED', metrics: structuredClone({ ...this.metrics, distance, bonus }), discoveryImages: { ...this.discoveryImages }, discoveredModels: [...this.discoveredModels] }; }
}
