const EMPTY = 0, PLANT = 1, HERB = 2, PRED = 3, WALL = 4, WATER = 5, BEAR = 6, MUSHROOM = 7;

const STAGE_GRASS = 1;
const STAGE_BUSH = 2;
const STAGE_TREE = 3;

const BAL = typeof LIFE_BALANCE !== "undefined" ? LIFE_BALANCE : {};
const PLANT_CFG = { ...BAL.plants };
const DECAY_CFG = { ...BAL.decay };
const FERTILIZER_CFG = { ...(BAL.fertilizer || { ttl: 5, strength: 0.3 }) };
const MUSHROOM_CFG = { ...(BAL.mushrooms || { cowInterval: 18, cowChance: 0.12, energy: 2.5 }) };

const TRAIT = { ...(BAL.traitIds || {
  KROL: "крол-душегуб", KOALA: "коала", COW: "корова", WOLF: "волк", ELK: "лось"
}) };

const MUT_CHANCE = { ...(BAL.mutationChance || { krol: 0.0025, koala: 0.02, cow: 0.01, wolf: 0.02, elk: 0.02 }) };

const KROL_LIFESPAN = BAL.species?.krol?.lifespan ?? 15;
const KROL_DEATH_SPAWN = BAL.species?.krol?.deathSpawn ?? 3;
const KROL_MOVES_PER_TICK = BAL.species?.krol?.movesPerTick ?? 6;
const KROL_SIZE = BAL.species?.krol?.size ?? 2;
const WOLF_SOLITUDE = BAL.behavior?.wolfSolitude ?? 10;
const ELK_POOP_INTERVAL = BAL.behavior?.elkPoopInterval ?? 5;
const KOALA_HIDE_RANGE = BAL.behavior?.koalaHideRange ?? 1;
const SPECIES_CFG = typeof buildSpeciesCfg === "function"
  ? buildSpeciesCfg(TRAIT, BAL.species || {})
  : {};

const NO_ANIMAL_RENEWAL_GENS = BAL.arcadeEnd?.noAnimalRenewalGens ?? 90;
const ARCADE_STALE_AFTER = BAL.arcadeEnd?.staleAfter ?? 40;
const ARCADE_LONELY_MAX = BAL.arcadeEnd?.lonelyMax ?? 120;
const ARCADE_NO_HERB_MAX = BAL.arcadeEnd?.noHerbMax ?? 60;
const ARCADE_PRED_ONLY_MAX = BAL.arcadeEnd?.predOnlyMax ?? 35;
const ROULETTE_INTERVAL = BAL.roulette?.interval ?? 500;
const PLAGUE_FOG_TICKS = BAL.roulette?.plagueFogTicks ?? 45;
const SURVIVAL_POINT_INTERVAL = BAL.arcadeEnd?.survivalPointInterval ?? 100;
const CHAIN_SUSTAIN_GENS = BAL.arcadeEnd?.chainSustainGens ?? 25;

const BREED_MIN_AGE = { ...(BAL.breed?.minAge || { herb: 12, pred: 18, koala: 14, cow: 22, wolf: 20 }) };
const BREED_COOL_INIT = { ...(BAL.breed?.coolInit || { herb: 10, pred: 14 }) };
const BREED_COOL_AFTER = { ...(BAL.breed?.coolAfter || { herb: 36, pred: 48, koala: 52 }) };
const KOALA_CROWD = { ...(BAL.breed?.koalaCrowd || { soft: 0.65, hard: 0.9, chanceSoft: 0.45, chanceHard: 0.12 }) };
const KOALA_PERCH_CAP = BAL.behavior?.koalaPerchCapacity || { tree: 1, bush: 0.5 };
const WATER_SLOW_MUL = BAL.water?.slowMul ?? 2;
const WATER_GROWTH_MUL = BAL.water?.growthMul ?? 2;
const SCORING = BAL.scoring || {};
const ROULETTE_PCT = BAL.roulette?.pct || {};

const SPECIAL_TRAITS = new Set([TRAIT.KROL, TRAIT.KOALA, TRAIT.COW, TRAIT.WOLF, TRAIT.ELK]);

function skillMul(a) {
  const mul = BAL.behavior?.skillBoostMul ?? 2;
  return a?.skillBoost ? mul : 1;
}

function isTrait(a, t) {
  return !!a && a.trait === t;
}

function isKrolDushegub(a) {
  return isTrait(a, TRAIT.KROL);
}

function krolFootprintAt(x, y) {
  return [
    { x, y },
    { x: x + 1, y },
    { x, y: y + 1 },
    { x: x + 1, y: y + 1 }
  ];
}

function agentFootprint(a) {
  if (isKrolDushegub(a)) return krolFootprintAt(a.x, a.y);
  return [{ x: a.x, y: a.y }];
}

function agentOccupies(a, x, y) {
  if (!a) return false;
  if (isKrolDushegub(a)) return x >= a.x && x <= a.x + 1 && y >= a.y && y <= a.y + 1;
  return a.x === x && a.y === y;
}

function isKoala(a) {
  return isTrait(a, TRAIT.KOALA);
}

function koalaPerchedOn(world, a) {
  if (!isKoala(a) || !world) return false;
  return world.isKoalaPerchCell(a.x, a.y);
}

function isCow(a) {
  return isTrait(a, TRAIT.COW);
}

function isWolf(a) {
  return isTrait(a, TRAIT.WOLF);
}

function isElk(a) {
  return isTrait(a, TRAIT.ELK);
}

function isSpecialSpecies(a) {
  return !!a && SPECIAL_TRAITS.has(a.trait);
}

function herbSpecies(a) {
  if (!a || a.kind !== HERB) return "rabbit";
  if (isKrolDushegub(a)) return "krol";
  if (isKoala(a)) return "koala";
  if (isCow(a)) return "cow";
  return "rabbit";
}

function predSpecies(a) {
  if (!a || a.kind !== PRED) return "fox";
  if (isWolf(a)) return "wolf";
  if (isElk(a)) return "elk";
  return "fox";
}

class World {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.cells = new Uint8Array(w * h);
    this.plantStage = new Uint8Array(w * h);
    this.plantAge = new Uint8Array(w * h);
    this.plantBites = new Uint8Array(w * h);
    this.agents = [];
    this.decays = [];
    this.fertilizers = [];
    this.generation = 0;
    this.births = 0;
    this.deaths = 0;
    this.mutations = 0;
    this.dish = null;
    this.fx = [];
    this.mutHerb = 0;
    this.mutPred = 0;
    this.lastMutation = null;
    this.pendingKrolAlert = null;
    this.gameOver = false;
    this.gameOverReason = null;
    this.arcade = false;
    this.noAnimalGens = 0;
    this.noHerbGens = 0;
    this.lonelyGens = 0;
    this.herbStreak = 0;
    this.sustainedChain = false;
    this.pendingEnergy = 0;
    this.lifePoints = 0;
    this.roulettePending = false;
    this.plagueFogTicks = 0;
    this.screenShake = 0;
    this.lastRouletteEvent = null;
    this.sounds = [];
    this._countsCache = null;
    this._rngSeed = null;
    this._rngFn = typeof mulberry32 === "function"
      ? mulberry32((Math.random() * 4294967296) >>> 0)
      : null;
  }

  setSeed(seed) {
    if (typeof mulberry32 !== "function") return this;
    this._rngSeed = seed >>> 0;
    this._rngFn = mulberry32(this._rngSeed);
    return this;
  }

  getRngSeed() {
    return this._rngSeed;
  }

  rng() {
    return this._rngFn ? this._rngFn() : Math.random();
  }

  invalidateCountsCache() {
    this._countsCache = null;
  }

  chime(name, opts = {}) {
    this.sounds.push({ name, ...opts });
  }

  lifePointTable() {
    return (typeof LIFE_DATA !== "undefined" && LIFE_DATA.lifePoints) || {};
  }

  tierConfig() {
    if (typeof LIFE_BALANCE !== "undefined" && LIFE_BALANCE.evolutionTiers) return LIFE_BALANCE.evolutionTiers;
    return (typeof LIFE_DATA !== "undefined" && LIFE_DATA.evolutionTiers) || { plant: {}, agent: {} };
  }

  pointScale() {
    if (typeof LIFE_BALANCE !== "undefined" && LIFE_BALANCE.lifePointScale) return LIFE_BALANCE.lifePointScale;
    return (typeof LIFE_DATA !== "undefined" && LIFE_DATA.lifePointScale) || {};
  }

  agentLifeKey(a) {
    if (!a) return "rabbit";
    if (a.kind === BEAR) return "bear";
    if (isKrolDushegub(a)) return "krol";
    if (isKoala(a)) return "koala";
    if (isCow(a)) return "cow";
    if (isWolf(a)) return "wolf";
    if (isElk(a)) return "elk";
    if (a.kind === PRED) return "fox";
    return "rabbit";
  }

  pointsFor(category, key) {
    const table = this.lifePointTable()[category];
    const v = table?.[key];
    return Number.isFinite(v) ? v : 0;
  }

  agentTier(a) {
    if (!a) return 1;
    const tiers = this.tierConfig().agent || {};
    return tiers[this.agentLifeKey(a)] ?? 1;
  }

  plantStageTier(stage) {
    if (stage === STAGE_BUSH) return 2;
    if (stage === STAGE_TREE) return 3;
    return 1;
  }

  plantEventTier(eventKey) {
    const tiers = this.tierConfig().plant || {};
    return tiers[eventKey] ?? 1;
  }

  genPointMul(gen) {
    const sc = this.pointScale();
    const cap = sc.genCap ?? 5;
    const bonus = sc.genBonus ?? 0.4;
    const g = Math.min(Math.max(1, gen || 1), cap);
    return 1 + bonus * (g - 1);
  }

  tierPoints(event, tier, gen = 1) {
    const sc = this.pointScale();
    const base = sc.base ?? 2;
    const evtMul = sc[event] ?? 1;
    return Math.max(1, Math.round(base * tier * evtMul * this.genPointMul(gen)));
  }

  awardLifePoints(amount) {
    if (!this.arcade || !amount || amount <= 0) return;
    this.lifePoints += amount;
  }

  awardScaledEcoPoints(amount) {
    const mul = this.ecosystemRewardMul();
    if (!mul || !amount) return;
    this.awardLifePoints(Math.max(1, Math.round(amount * mul)));
  }

  awardBirthPoints(agent) {
    this.awardScaledEcoPoints(this.tierPoints("birth", this.agentTier(agent), agent?.gen));
  }

  awardDeathPoints(agent) {
    this.awardScaledEcoPoints(this.tierPoints("death", this.agentTier(agent), agent?.gen));
  }

  awardMutationPoints(agent) {
    const tier = this.agentTier(agent);
    const sc = this.pointScale();
    const bonus = sc.mutation ?? 6;
    this.awardScaledEcoPoints(Math.max(1, Math.round(bonus * tier * this.genPointMul(agent?.gen))));
  }

  awardProcessedEnergy(energy, eater = null, foodTier = 1) {
    if (!this.arcade || !energy || energy <= 0) return;
    const eaterTier = eater ? this.agentTier(eater) : 1;
    const pe = SCORING.processedEnergy || {};
    const weight = (pe.base ?? 0.35) + eaterTier * (pe.eaterTier ?? 0.3) + foodTier * (pe.foodTier ?? 0.35);
    const points = Math.max(1, Math.round(energy * weight * this.genPointMul(eater?.gen)));
    this.awardScaledEcoPoints(points);
  }

  idx(x, y) { return y * this.w + x; }
  inside(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x, y) { return this.inside(x, y) ? this.cells[this.idx(x, y)] : WALL; }
  set(x, y, v) { if (this.inside(x, y)) this.cells[this.idx(x, y)] = v; }

  /** Множитель шанса мутации: 2^(поколение − 1). Поколение 1 — базовый шанс. */
  mutationMultForGen(gen) {
    const g = Math.max(1, gen || 1);
    const base = BAL.mutationGenBase ?? 2;
    return Math.pow(base, g - 1);
  }

  effectiveChance(base, gen) {
    return Math.min(1, base * this.mutationMultForGen(gen));
  }

  agentAnchor(a) {
    if (isKrolDushegub(a)) return { x: a.x + 0.5, y: a.y + 0.5 };
    return { x: a.x, y: a.y };
  }

  clearAgentCells(a) {
    for (const c of agentFootprint(a)) {
      if (this.get(c.x, c.y) === a.kind) this.set(c.x, c.y, EMPTY);
    }
  }

  occupyAgentCells(a) {
    if (isKoala(a) && this.isKoalaPerchCell(a.x, a.y)) return;
    for (const c of agentFootprint(a)) {
      const t = this.get(c.x, c.y);
      if (t === PLANT) this.clearPlant(c.x, c.y);
      if (t === EMPTY || t === PLANT) this.set(c.x, c.y, a.kind);
    }
  }

  canPlaceKrolAt(x, y, ignoreAgent = null) {
    for (const c of krolFootprintAt(x, y)) {
      if (!this.inside(c.x, c.y)) return false;
      if (this.get(c.x, c.y) !== EMPTY) return false;
      for (const o of this.agents) {
        if (o.dead || o === ignoreAgent) continue;
        if (agentOccupies(o, c.x, c.y)) return false;
      }
    }
    return true;
  }

  krolBirthAnchorsAround(px, py) {
    const anchors = [
      { x: px, y: py },
      { x: px - 1, y: py },
      { x: px, y: py - 1 },
      { x: px - 1, y: py - 1 },
      { x: px + 1, y: py },
      { x: px - 2, y: py },
      { x: px, y: py + 1 },
      { x: px, y: py - 2 },
      { x: px + 1, y: py - 1 },
      { x: px - 2, y: py - 1 },
      { x: px + 1, y: py + 1 },
      { x: px - 2, y: py + 1 }
    ];
    for (let i = anchors.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [anchors[i], anchors[j]] = [anchors[j], anchors[i]];
    }
    return anchors;
  }

  canPlaceKrolBirthAt(ax, ay, parent, baby) {
    for (const c of krolFootprintAt(ax, ay)) {
      if (!this.inside(c.x, c.y)) return false;
      const t = this.get(c.x, c.y);
      if (t === WALL) return false;
      for (const o of this.agents) {
        if (o.dead || o === baby || o === parent) continue;
        if (agentOccupies(o, c.x, c.y) && isKrolDushegub(o)) return false;
      }
    }
    return true;
  }

  krolDevourCells(a, cells, exempt = []) {
    const exemptSet = new Set(exempt);
    let ate = false;
    let hunted = false;

    const victims = [];
    for (const o of this.agents) {
      if (o.dead || o === a || exemptSet.has(o)) continue;
      if (cells.some((c) => agentOccupies(o, c.x, c.y)) && this.canHunt(a, o)) victims.push(o);
    }
    for (const victim of victims) {
      this.killAgent(victim, a, this.krolHuntGain(victim));
      ate = true;
      hunted = true;
    }

    for (const c of cells) {
      if (this.get(c.x, c.y) === MUSHROOM) {
        this.eatMushroom(a, c.x, c.y);
        ate = true;
        continue;
      }
      if (this.get(c.x, c.y) !== PLANT) continue;
      const energy = this.plantEnergyRemaining(c.x, c.y) * skillMul(a);
      a.energy += energy;
      this.awardProcessedEnergy(energy, a, this.plantStageTier(this.plantStage[this.idx(c.x, c.y)]));
      this.clearPlant(c.x, c.y);
      this.spark(c.x, c.y, "#ffc14d");
      ate = true;
    }

    if (ate) {
      this.chime("krol_eat");
      this.grantArcadeEnergy("krolDevour");
    }
    return ate;
  }

  krolDevourFootprint(a, exempt = []) {
    return this.krolDevourCells(a, agentFootprint(a), exempt);
  }

  krolDevourZoneCells(a) {
    const cells = [];
    for (let dy = -1; dy <= KROL_SIZE; dy++) {
      for (let dx = -1; dx <= KROL_SIZE; dx++) {
        const cx = a.x + dx;
        const cy = a.y + dy;
        if (this.inside(cx, cy)) cells.push({ x: cx, y: cy });
      }
    }
    return cells;
  }

  krolDevourZone(a, exempt = []) {
    return this.krolDevourCells(a, this.krolDevourZoneCells(a), exempt);
  }

  birthKrolAroundParent(baby, parent) {
    const anchors = this.krolBirthAnchorsAround(parent.x, parent.y);
    for (const anchor of anchors) {
      if (!this.canPlaceKrolBirthAt(anchor.x, anchor.y, parent, baby)) continue;
      baby.x = anchor.x;
      baby.y = anchor.y;
      baby.bornGen = this.generation;
      this.krolDevourFootprint(baby, [parent]);
      this.occupyAgentCells(baby);
      return true;
    }
    return false;
  }

  isKoalaPerchCell(x, y) {
    if (this.get(x, y) !== PLANT) return false;
    const stage = this.plantStageAt(x, y);
    return stage === STAGE_TREE || stage === STAGE_BUSH;
  }

  koalaHidden(a) {
    return koalaPerchedOn(this, a);
  }

  koalaCount() {
    return this.agents.filter((a) => !a.dead && isKoala(a)).length;
  }

  koalaPerchCapacity() {
    const c = this.counts();
    return c.tree * (KOALA_PERCH_CAP.tree ?? 1) + c.bush * (KOALA_PERCH_CAP.bush ?? 0.5);
  }

  isKoalaPerchOccupied(x, y) {
    const o = this.agentAt(x, y);
    return !!o && isKoala(o);
  }

  findNearestEmptyPerch(x, y, range) {
    return this.findNearestThicket(x, y, range, false);
  }

  canAgentMoveTo(a, x, y) {
    if (isKrolDushegub(a)) {
      for (const c of krolFootprintAt(x, y)) {
        if (!this.inside(c.x, c.y)) return false;
        const t = this.get(c.x, c.y);
        if (t === WALL) return false;
        const other = this.agentAt(c.x, c.y);
        if (t !== EMPTY && t !== PLANT && t !== WATER && !agentOccupies(a, c.x, c.y)) {
          const preyPass = other && other !== a && this.canHunt(a, other);
          if (!preyPass) return false;
        }
        if (other && other !== a && !this.canHunt(a, other)) return false;
      }
      return true;
    }
    if (isKoala(a) && this.isKoalaPerchCell(x, y)) {
      const other = this.agentAt(x, y);
      return !other || other === a;
    }
    if (!this.isWalkable(x, y)) return false;
    const other = this.agentAt(x, y);
    return !other || other === a;
  }

  krolDevourRing(a) {
    return this.krolDevourZone(a);
  }

  plantEnergyRemaining(x, y) {
    const i = this.idx(x, y);
    const stage = this.plantStage[i];
    const bites = this.plantBites[i];
    if (stage === STAGE_GRASS) return (bites / PLANT_CFG.grassBites) * PLANT_CFG.grassEnergy;
    if (stage === STAGE_BUSH) return bites * PLANT_CFG.bushEnergyPerBite;
    if (stage === STAGE_TREE) return bites * PLANT_CFG.treeEnergyPerBite * 1.2;
    return 0;
  }

  clearPlant(x, y) {
    const i = this.idx(x, y);
    this.cells[i] = EMPTY;
    this.plantStage[i] = 0;
    this.plantAge[i] = 0;
    this.plantBites[i] = 0;
  }

  setPlant(x, y, stage, age = 0) {
    const i = this.idx(x, y);
    this.cells[i] = PLANT;
    this.plantStage[i] = stage;
    this.plantAge[i] = age;
    this.plantBites[i] = stage === STAGE_BUSH ? PLANT_CFG.bushBites
      : stage === STAGE_GRASS ? PLANT_CFG.grassBites : 0;
  }

  spawnGrassAt(x, y) {
    if (this.get(x, y) !== EMPTY) return false;
    this.setPlant(x, y, STAGE_GRASS, 0);
    this.births++;
    this.spark(x, y, "#5dff8a");
    return true;
  }

  spawnGrassAround(x, y, count) {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
    }
    let spawned = 0;
    for (const [dx, dy] of dirs) {
      if (spawned >= count) break;
      if (this.spawnGrassAt(x + dx, y + dy)) spawned++;
    }
    return spawned;
  }

  mealFromEating(a) {
    if (!a.eating) return null;
    const { x, y } = a.eating;
    if (a.eating.mushroom) {
      if (this.get(x, y) === MUSHROOM) return { x, y, mushroom: true };
      return null;
    }
    if (this.get(x, y) !== PLANT) return null;
    const stage = this.plantStageAt(x, y);
    if (stage === STAGE_GRASS || stage === STAGE_BUSH) return { x, y, stage };
    if (stage === STAGE_TREE && (isCow(a) || isElk(a) || isKrolDushegub(a) || isKoala(a))) return { x, y, stage };
    return null;
  }

  startEating(a, meal) {
    if (meal.mushroom) {
      a.eating = { x: meal.x, y: meal.y, mushroom: true };
      this.eatMushroom(a, meal.x, meal.y);
      return;
    }
    a.eating = { x: meal.x, y: meal.y };
    if (meal.stage === STAGE_TREE && this.plantBites[this.idx(meal.x, meal.y)] <= 0 && !isKoala(a)) {
      const bites = isCow(a) ? PLANT_CFG.treeBitesCow
        : isKrolDushegub(a) ? 4
        : PLANT_CFG.treeBitesElk;
      this.plantBites[this.idx(meal.x, meal.y)] = bites;
    }
    this.eatPlant(a, meal);
  }

  plantStageAt(x, y) {
    if (!this.inside(x, y) || this.get(x, y) !== PLANT) return 0;
    return this.plantStage[this.idx(x, y)];
  }

  makeDish() {
    const cx = (this.w - 1) / 2;
    const cy = (this.h - 1) / 2;
    const half = Math.floor(Math.min(this.w, this.h) / 2) - 1;
    this.dish = { cx, cy, half, square: true };
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (Math.abs(x - cx) > half || Math.abs(y - cy) > half) {
          this.set(x, y, WALL);
        }
      }
    }
  }

  inDish(x, y) {
    if (!this.dish) return this.inside(x, y);
    const d = this.dish;
    if (d.square) {
      return Math.abs(x - d.cx) <= d.half && Math.abs(y - d.cy) <= d.half;
    }
    return Math.hypot(x - d.cx, y - d.cy) <= d.r;
  }

  isWalkable(x, y) {
    const t = this.get(x, y);
    return t === EMPTY || t === WATER;
  }

  clone() {
    const w = new World(this.w, this.h);
    w.cells.set(this.cells);
    w.plantStage.set(this.plantStage);
    w.plantAge.set(this.plantAge);
    w.plantBites.set(this.plantBites);
    w.agents = this.agents.map((a) => ({ ...a }));
    w.decays = this.decays.map((d) => ({ ...d }));
    w.fertilizers = this.fertilizers.map((f) => ({ ...f }));
    w.dish = this.dish ? { ...this.dish } : null;
    w.mutHerb = this.mutHerb;
    w.mutPred = this.mutPred;
    w.generation = this.generation;
    w.gameOver = this.gameOver;
    w.gameOverReason = this.gameOverReason;
    w.arcade = this.arcade;
    w.noAnimalGens = this.noAnimalGens;
    w.noHerbGens = this.noHerbGens;
    w.lonelyGens = this.lonelyGens;
    w.herbStreak = this.herbStreak;
    w.sustainedChain = this.sustainedChain;
    w.pendingEnergy = this.pendingEnergy;
    w.lifePoints = this.lifePoints;
    w._rngSeed = this._rngSeed;
    if (this._rngFn && typeof mulberry32 === "function") {
      w._rngFn = mulberry32(this._rngSeed ?? this._rngFn.getState());
      w._rngFn.setState(this._rngFn.getState());
    }
    w.sounds = [];
    return w;
  }

  hasAnimals() {
    return this.agents.some((a) => !a.dead);
  }

  tickAnimalMetrics() {
    const herbs = this.live(HERB).length;
    if (herbs > 0) {
      this.noHerbGens = 0;
      if (this.hasAnimals()) {
        this.herbStreak++;
        if (this.herbStreak >= CHAIN_SUSTAIN_GENS) this.sustainedChain = true;
      }
    } else {
      this.noHerbGens++;
      this.herbStreak = 0;
    }

    if (this.hasAnimals()) {
      this.noAnimalGens = 0;
    } else {
      this.noAnimalGens++;
      this.lonelyGens++;
    }
  }

  herbivoreCount() {
    return this.live(HERB).length;
  }

  predatorCount() {
    let n = this.live(PRED).length;
    for (const a of this.agents) {
      if (!a.dead && a.kind === BEAR) n++;
    }
    return n;
  }

  /** Пассивные награды: 0 без травоядных; частичный штраф при перевесе хищников. */
  ecosystemRewardMul() {
    const herbs = this.herbivoreCount();
    if (herbs <= 0) return 0;
    const preds = this.predatorCount();
    const total = herbs + preds;
    if (preds <= 0 || total <= 0) return 1;
    const ratio = herbs / total;
    const eco = SCORING.ecosystemMul || {};
    const full = eco.herbShareFull ?? 0.4;
    if (ratio >= full) return 1;
    return Math.max(eco.minMul ?? 0.12, Math.min(1, ratio * (eco.ratioScale ?? 2.5)));
  }

  noHerbEndLimit() {
    if (this.predatorCount() > 0) return ARCADE_PRED_ONLY_MAX;
    return ARCADE_NO_HERB_MAX;
  }

  plantRenewalMul() {
    if (this.herbivoreCount() > 0) return 1;
    return Math.max(0, 1 - this.noHerbGens / NO_ANIMAL_RENEWAL_GENS);
  }

  awardPlantLifePoints(eventKey) {
    const mul = this.ecosystemRewardMul();
    if (!mul) return;
    const tier = this.plantEventTier(eventKey);
    this.awardScaledEcoPoints(this.tierPoints("plant", tier));
  }

  grantPlantArcadeEnergy(key) {
    const mul = this.ecosystemRewardMul();
    if (!mul || !this.arcade || !key) return 0;
    const raw = this.arcadeEnergyTable()[key] ?? 0;
    if (raw <= 0) return 0;
    const gain = mul >= 1 ? raw : Math.floor(raw * mul);
    if (gain > 0) this.pendingEnergy += gain;
    return gain;
  }

  tickSurvivalPoints() {
    if (!this.arcade || !this.sustainedChain) return;
    if (this.generation <= 0 || this.generation % SURVIVAL_POINT_INTERVAL !== 0) return;
    const mul = this.ecosystemRewardMul();
    if (mul <= 0) return;
    const base = this.pointScale().survival ?? 4;
    this.awardLifePoints(Math.max(1, Math.round(base * mul)));
  }

  checkArcadeEnd(energy, herbCost) {
    if (!this.arcade || this.gameOver) return;
    const broke = energy < herbCost;

    if (this.noHerbGens >= this.noHerbEndLimit()) {
      this.gameOver = true;
      this.gameOverReason = "no_chain";
      return;
    }

    if (this.hasAnimals()) return;

    if (!this.isAlive()) {
      if (this.lonelyGens >= ARCADE_LONELY_MAX) {
        this.gameOver = true;
        this.gameOverReason = "no_chain";
        return;
      }
      if (broke && this.noAnimalGens >= ARCADE_STALE_AFTER) {
        this.gameOver = true;
        this.gameOverReason = "no_chain";
        return;
      }
    }

    if (this.sustainedChain) {
      if (broke && this.noAnimalGens >= ARCADE_STALE_AFTER) {
        this.gameOver = true;
        this.gameOverReason = "no_chain";
      }
      return;
    }

    if (this.lonelyGens >= ARCADE_LONELY_MAX) {
      this.gameOver = true;
      this.gameOverReason = "no_chain";
      return;
    }
    if (broke && this.noAnimalGens >= ARCADE_STALE_AFTER) {
      this.gameOver = true;
      this.gameOverReason = "no_chain";
    }
  }

  countType(x, y, type) {
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        if (this.get(x + dx, y + dy) === type) n++;
      }
    }
    return n;
  }

  decayBoost(x, y) {
    let boost = 0;
    for (const d of this.decays) {
      const dist = Math.hypot(x - d.x, y - d.y);
      if (dist <= d.radius) boost = Math.max(boost, d.strength * (1 - dist / (d.radius + 0.5)));
    }
    return boost;
  }

  fertilizerBoost(x, y) {
    let boost = 0;
    for (const f of this.fertilizers) {
      if (Math.abs(f.x - x) <= 1 && Math.abs(f.y - y) <= 1) boost = Math.max(boost, f.strength);
    }
    return boost;
  }

  growthMulAt(x, y) {
    let mul = 1 + this.fertilizerBoost(x, y);
    if (this.countType(x, y, WATER) > 0) mul *= WATER_GROWTH_MUL;
    return mul;
  }

  distCheb(ax, ay, bx, by) {
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
  }

  distMan(ax, ay, bx, by) {
    return Math.abs(ax - bx) + Math.abs(ay - by);
  }

  perceive(agent) {
    const range = this.effectiveVision(agent);
    const anchor = this.agentAnchor(agent);
    const px = anchor.x;
    const py = anchor.y;
    const food = [];
    const prey = [];
    const threats = [];
    const exits = [];

    for (let dy = -range; dy <= range; dy++) {
      for (let dx = -range; dx <= range; dx++) {
        if (!dx && !dy) continue;
        const nx = px + dx;
        const ny = py + dy;
        const man = this.distMan(px, py, nx, ny);
        const cheb = this.distCheb(px, py, nx, ny);
        if (man > range) continue;

        if (this.get(nx, ny) === MUSHROOM) {
          food.push({ x: nx, y: ny, mushroom: true, dist: cheb, man });
        } else if (this.get(nx, ny) === PLANT) {
          const stage = this.plantStageAt(nx, ny);
          if (stage === STAGE_GRASS || stage === STAGE_BUSH) {
            food.push({ x: nx, y: ny, stage, dist: cheb, man });
          } else if (stage === STAGE_TREE && (isCow(agent) || isElk(agent) || isKrolDushegub(agent) || isKoala(agent))) {
            food.push({ x: nx, y: ny, stage, dist: cheb, man });
          } else if (stage === STAGE_BUSH && isKoala(agent)) {
            food.push({ x: nx, y: ny, stage, dist: cheb, man });
          }
        }

        if (this.isWalkable(nx, ny) || (isKoala(agent) && this.isKoalaPerchCell(nx, ny))) {
          exits.push({ x: nx, y: ny, dist: cheb });
        }
      }
    }

    for (const o of this.agents) {
      if (o.dead || o === agent) continue;
      const oAnchor = this.agentAnchor(o);
      const man = this.distMan(px, py, oAnchor.x, oAnchor.y);
      const cheb = this.distCheb(px, py, oAnchor.x, oAnchor.y);
      if (man > range + (isKrolDushegub(o) ? 1 : 0)) continue;

      if (this.canHunt(agent, o) && cheb > 0) {
        prey.push({ agent: o, x: o.x, y: o.y, dist: cheb, man, hungry: o.energy < o.thresh });
      }
      if (this.isThreatTo(o, agent)) {
        threats.push({ agent: o, x: o.x, y: o.y, dist: cheb, man });
      }
    }

    food.sort((a, b) => {
      const rank = this.herbFoodRank(agent, a) - this.herbFoodRank(agent, b);
      if (rank !== 0) return rank;
      return a.man - b.man;
    });
    prey.sort((a, b) => this.preyPriority(agent, a.agent, px, py) - this.preyPriority(agent, b.agent, px, py));
    threats.sort((a, b) => a.man - b.man);

    const touchDist = isKrolDushegub(agent) ? 1.5 : 1;
    const touchFood = food.find((f) => f.dist <= touchDist);
    const touchPrey = prey.find((p) => p.dist <= touchDist);
    const touchThreat = threats.find((t) => t.dist <= touchDist);
    const deadEnd = exits.length <= 2;

    return { food, prey, threats, exits, touchFood, touchPrey, touchThreat, deadEnd, range };
  }

  isThreatTo(hunter, victim) {
    if (!hunter || !victim || hunter.dead || victim.dead) return false;
    return this.canHunt(hunter, victim);
  }

  herbFoodRank(agent, item) {
    if (item.mushroom) return -1;
    const stage = item.stage;
    if (isKoala(agent)) {
      if (stage === STAGE_TREE) return 0;
      if (stage === STAGE_BUSH) return 1;
      return 2;
    }
    if (isCow(agent)) {
      if (stage === STAGE_TREE) return 0;
      if (stage === STAGE_GRASS) return 1;
      return 2;
    }
    if (isElk(agent) && stage === STAGE_TREE) return 0;
    if (stage === STAGE_GRASS) return 0;
    if (stage === STAGE_BUSH) return 1;
    return 2;
  }

  effectiveVision(a) {
    return Math.max(1, Math.round((a?.vision || 7) * skillMul(a)));
  }

  findNearestMushroom(x, y, range, metric = "scout") {
    const distAt = metric === "touch"
      ? (dx, dy) => Math.max(Math.abs(dx), Math.abs(dy))
      : (dx, dy) => Math.abs(dx) + Math.abs(dy);
    let best = null;
    let bestD = 99;
    for (let dy = -range; dy <= range; dy++) {
      for (let dx = -range; dx <= range; dx++) {
        if (!dx && !dy) continue;
        const dist = distAt(dx, dy);
        if (dist > range || dist >= bestD) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (this.get(nx, ny) === MUSHROOM) {
          bestD = dist;
          best = { x: nx, y: ny, mushroom: true };
        }
      }
    }
    return best;
  }

  findNearestEdible(x, y, range, metric = "scout", eater = null) {
    const mushroom = this.findNearestMushroom(x, y, range, metric);
    if (mushroom) return mushroom;
    const distAt = metric === "touch"
      ? (dx, dy) => Math.max(Math.abs(dx), Math.abs(dy))
      : (dx, dy) => Math.abs(dx) + Math.abs(dy);
    let bestGrass = null, bestGrassD = 99;
    let bestBush = null, bestBushD = 99;
    let bestTree = null, bestTreeD = 99;
    const canEatTree = eater && (isCow(eater) || isElk(eater) || isKrolDushegub(eater) || isKoala(eater));
    for (let dy = -range; dy <= range; dy++) {
      for (let dx = -range; dx <= range; dx++) {
        if (!dx && !dy) continue;
        const dist = distAt(dx, dy);
        if (dist > range) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (this.get(nx, ny) !== PLANT) continue;
        const stage = this.plantStageAt(nx, ny);
        if (stage === STAGE_GRASS && dist < bestGrassD) {
          bestGrassD = dist;
          bestGrass = { x: nx, y: ny, stage };
        } else if (stage === STAGE_BUSH && dist < bestBushD) {
          bestBushD = dist;
          bestBush = { x: nx, y: ny, stage };
        } else if (stage === STAGE_TREE && canEatTree && dist < bestTreeD) {
          bestTreeD = dist;
          bestTree = { x: nx, y: ny, stage };
        }
      }
    }
    if (isCow(eater)) return bestTree || bestGrass || bestBush;
    if (isElk(eater)) return bestTree || bestGrass || bestBush;
    if (isKoala(eater)) return bestTree || bestBush || bestGrass;
    return bestGrass || bestBush || bestTree;
  }

  preyPriority(hunter, prey, px, py) {
    const d = Math.abs(prey.x - px) + Math.abs(prey.y - py);
    let score = d;
    if (prey.energy < prey.thresh) score -= 0.35;
    if (hunter.kind === BEAR && prey.kind === PRED) score -= 0.45;
    if (hunter.kind === BEAR && prey.energy < prey.thresh) score -= 0.2;
    if (isKrolDushegub(hunter) && prey.kind === PRED) score -= 0.15;
    if (isKrolDushegub(hunter) && prey.kind === BEAR) score -= 0.5;
    if (isKrolDushegub(hunter) && (isWolf(prey) || isElk(prey))) score -= 0.35;
    if (isKrolDushegub(hunter) && (isCow(prey) || isKoala(prey))) score -= 0.2;
    if (isWolf(hunter) && isCow(prey)) score -= 0.3;
    if (isWolf(hunter) && prey.kind === HERB) score -= 0.1;
    if (isKoala(prey) && this.koalaHidden(prey)) score += 3;
    return score;
  }

  findNearestPrey(x, y, range, hunter, metric = "scout") {
    return this.findNearestAgent(x, y, range, this.preyKindsFor(hunter), hunter, metric);
  }

  preyKindsFor(hunter) {
    if (isKrolDushegub(hunter)) return [HERB, PRED, BEAR];
    if (isWolf(hunter)) return [HERB, PRED];
    if (hunter.kind === BEAR) return [HERB, PRED];
    if (hunter.kind === PRED && !isElk(hunter)) return [HERB];
    return [];
  }

  findNearestAgent(x, y, range, kinds, hunter, metric = "scout") {
    const distAt = metric === "touch"
      ? (dx, dy) => Math.max(Math.abs(dx), Math.abs(dy))
      : (dx, dy) => Math.abs(dx) + Math.abs(dy);
    let best = null, bestScore = 99;
    for (const o of this.agents) {
      if (o.dead || !kinds.includes(o.kind)) continue;
      if (hunter?.kind === PRED && !isWolf(hunter) && !isElk(hunter) && this.isSpecialHerb(o)) continue;
      const dx = o.x - x;
      const dy = o.y - y;
      const dist = distAt(dx, dy);
      if (dist > range || dist === 0) continue;
      if (hunter && isKoala(o) && this.koalaHidden(o) && dist > KOALA_HIDE_RANGE) continue;
      if (hunter && !this.canHunt(hunter, o)) continue;
      let score = dist;
      if (hunter && (hunter.kind === PRED || hunter.kind === BEAR || isKrolDushegub(hunter) || isWolf(hunter))) {
        score = this.preyPriority(hunter, o, x, y);
      }
      if (score < bestScore) {
        bestScore = score;
        best = o;
      }
    }
    return best ? { x: best.x, y: best.y } : null;
  }

  isSpecialHerb(a) {
    return isKrolDushegub(a) || isKoala(a) || isCow(a);
  }

  nearestWolfDist(x, y, self) {
    let best = Infinity;
    for (const o of this.agents) {
      if (o.dead || o === self || !isWolf(o)) continue;
      best = Math.min(best, this.distMan(x, y, o.x, o.y));
    }
    return best;
  }

  nearestWolf(x, y, self) {
    let best = null;
    let bestD = Infinity;
    for (const o of this.agents) {
      if (o.dead || o === self || !isWolf(o)) continue;
      const d = this.distMan(x, y, o.x, o.y);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    return best;
  }

  stepToward(ax, ay, tx, ty) {
    const dx = tx - ax;
    const dy = ty - ay;
    if (!dx && !dy) return null;
    if (Math.abs(dx) >= Math.abs(dy)) return { x: ax + Math.sign(dx), y: ay };
    return { x: ax, y: ay + Math.sign(dy) };
  }

  stepAway(ax, ay, tx, ty) {
    const dx = ax - tx;
    const dy = ay - ty;
    if (!dx && !dy) {
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const d = dirs[Math.floor(this.rng() * 4)];
      return { x: ax + d[0], y: ay + d[1] };
    }
    if (Math.abs(dx) >= Math.abs(dy)) return { x: ax + Math.sign(dx), y: ay };
    return { x: ax, y: ay + Math.sign(dy) };
  }

  moveAgentTo(a, x, y) {
    if (isKrolDushegub(a)) {
      this.clearAgentCells(a);
      a.x = x;
      a.y = y;
      this.krolDevourZone(a);
      this.occupyAgentCells(a);
      return;
    }
    this.clearAgentCells(a);
    a.x = x;
    a.y = y;
    this.occupyAgentCells(a);
    if (isElk(a)) a.stepsSincePoop = (a.stepsSincePoop || 0) + 1;
  }

  agentOnWater(a) {
    if (!a) return false;
    for (const c of agentFootprint(a)) {
      if (this.get(c.x, c.y) === WATER) return true;
    }
    return false;
  }

  moveIntervalFor(a) {
    let interval = a.moveInterval || 1;
    if (this.agentOnWater(a)) interval *= WATER_SLOW_MUL;
    if (a.skillBoost) interval = Math.max(1, Math.floor(interval / 2));
    return interval;
  }

  canMoveThisTick(a) {
    return (a.movePhase || 0) % this.moveIntervalFor(a) === 0;
  }

  wanderAgent(a) {
    if (!this.canMoveThisTick(a)) return false;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
    }
    for (const [dx, dy] of dirs) {
      const nx = a.x + dx;
      const ny = a.y + dy;
      if (this.canAgentMoveTo(a, nx, ny)) {
        this.moveAgentTo(a, nx, ny);
        return true;
      }
    }
    return false;
  }

  fleeFrom(a, tx, ty) {
    if (!this.canMoveThisTick(a)) return false;
    const step = this.stepAway(a.x, a.y, tx, ty);
    if (step && this.canAgentMoveTo(a, step.x, step.y)) {
      this.moveAgentTo(a, step.x, step.y);
      return true;
    }
    return this.wanderAgent(a);
  }

  moveTowardTarget(a, tx, ty) {
    if (!this.canMoveThisTick(a)) return false;
    const steps = [];
    const primary = this.stepToward(a.x, a.y, tx, ty);
    if (primary) steps.push(primary);
    const dx = tx - a.x;
    const dy = ty - a.y;
    const alt = Math.abs(dx) >= Math.abs(dy)
      ? (dy ? { x: a.x, y: a.y + Math.sign(dy) } : null)
      : (dx ? { x: a.x + Math.sign(dx), y: a.y } : null);
    if (alt && (!primary || alt.x !== primary.x || alt.y !== primary.y)) steps.push(alt);
    for (const step of steps) {
      if (this.canAgentMoveTo(a, step.x, step.y)) {
        this.moveAgentTo(a, step.x, step.y);
        return true;
      }
    }
    return false;
  }

  nudgeToward(a, tx, ty) {
    return this.moveTowardTarget(a, tx, ty) || this.wanderAgent(a);
  }

  wanderBiasChance(a) {
    if (isKoala(a) && !koalaPerchedOn(this, a)) return 0.12;
    return 0.35;
  }

  shouldMoveThisTick(a) {
    return this.canMoveThisTick(a);
  }

  stepSated(a) {
    if (isKrolDushegub(a)) {
      this.feedKrolDushegub(a);
      return;
    }
    if (a.kind === BEAR) {
      if (this.rng() < 0.15) this.wanderAgent(a);
      return;
    }
    if (isWolf(a)) {
      const other = this.nearestWolf(a.x, a.y, a);
      if (other && this.distMan(a.x, a.y, other.x, other.y) <= WOLF_SOLITUDE) {
        this.fleeFrom(a, other.x, other.y);
        return;
      }
    }
    if (isKoala(a)) {
      if (!this.shouldMoveThisTick(a)) return;
      const perched = koalaPerchedOn(this, a);
      if (perched && this.rng() >= this.wanderBiasChance(a)) return;
      const dir = this.seekKoalaHangout(a);
      const nx = a.x + dir.x;
      const ny = a.y + dir.y;
      if (this.canAgentMoveTo(a, nx, ny)) this.moveAgentTo(a, nx, ny);
      else this.wanderAgent(a);
      return;
    }
    if (!this.shouldMoveThisTick(a)) return;
    if (this.rng() >= this.wanderBiasChance(a)) return;
    const dir = a.kind === HERB || isElk(a) ? this.seekHerb(a) : this.seekPred(a);
    const nx = a.x + dir.x;
    const ny = a.y + dir.y;
    if (this.canAgentMoveTo(a, nx, ny)) this.moveAgentTo(a, nx, ny);
    else this.wanderAgent(a);
  }

  canHunt(killer, victim) {
    if (!killer || !victim || killer.dead || victim.dead) return false;
    if (killer === victim) return false;
    if (isKrolDushegub(victim)) return false;

    if (isKrolDushegub(killer)) {
      return victim.kind === HERB || victim.kind === PRED || victim.kind === BEAR;
    }

    if (isWolf(killer)) {
      if (victim.kind === BEAR) return false;
      if (isWolf(victim)) return false;
      return victim.kind === HERB || victim.kind === PRED;
    }

    if (killer.kind === BEAR) {
      return victim.kind === HERB || victim.kind === PRED;
    }

    if (killer.kind === PRED) {
      if (isElk(killer)) return false;
      if (isWolf(victim)) return false;
      if (victim.kind !== HERB) return false;
      if (isCow(victim)) return false;
      return true;
    }

    return false;
  }

  pounceVictim(killer, spot, energyGain = 7.2) {
    if (isKrolDushegub(killer)) return false;
    const victim = this.agentAt(spot.x, spot.y);
    if (!victim || victim.dead || !this.canHunt(killer, victim)) return false;
    this.moveAgentTo(killer, spot.x, spot.y);
    this.killAgent(victim, killer, energyGain);
    return true;
  }

  pouncePrey(a, spot) {
    const victim = this.agentAt(spot.x, spot.y);
    let gain = 7.2;
    if (victim?.kind === PRED) gain = 8.5;
    if (isCow(victim)) gain = 12;
    if (isKoala(victim)) gain = 6.8;
    if (victim?.kind === BEAR) gain = 14;
    return this.pounceVictim(a, spot, gain);
  }

  krolHuntGain(victim) {
    if (!victim) return 7;
    if (victim.kind === BEAR) return 14;
    if (isWolf(victim) || isElk(victim)) return 10;
    if (isCow(victim)) return 12;
    if (isKoala(victim)) return 7;
    if (victim.kind === PRED) return 8.5;
    return 7;
  }

  feedKrolDushegub(a) {
    const moves = a.movesPerTick || KROL_MOVES_PER_TICK;
    for (let m = 0; m < moves; m++) {
      if (this.krolDevourZone(a)) continue;

      const aware = this.perceive(a);
      if (aware.prey.length) {
        this.nudgeToward(a, aware.prey[0].x, aware.prey[0].y);
        this.krolDevourZone(a);
        continue;
      }

      const food = this.krolSortFood(aware.food);
      if (food.length) {
        this.nudgeToward(a, food[0].x, food[0].y);
        this.krolDevourZone(a);
        continue;
      }

      if (this.wanderAgent(a)) this.krolDevourZone(a);
    }
  }

  krolFoodRank(stage) {
    if (stage === STAGE_TREE) return 0;
    if (stage === STAGE_BUSH) return 1;
    return 2;
  }

  krolSortFood(food) {
    return [...food].sort((a, b) => {
      const dr = this.krolFoodRank(a.stage) - this.krolFoodRank(b.stage);
      if (dr !== 0) return dr;
      return a.man - b.man;
    });
  }

  krolNearestEdible(x, y, range, eater) {
    const distAt = (dx, dy) => Math.max(Math.abs(dx), Math.abs(dy));
    let bestGrass = null, bestGrassD = 99;
    let bestBush = null, bestBushD = 99;
    let bestTree = null, bestTreeD = 99;
    for (let dy = -range; dy <= range; dy++) {
      for (let dx = -range; dx <= range; dx++) {
        if (!dx && !dy) continue;
        const dist = distAt(dx, dy);
        if (dist > range) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (this.get(nx, ny) !== PLANT) continue;
        const stage = this.plantStageAt(nx, ny);
        if (stage === STAGE_GRASS && dist < bestGrassD) {
          bestGrassD = dist;
          bestGrass = { x: nx, y: ny, stage };
        } else if (stage === STAGE_BUSH && dist < bestBushD) {
          bestBushD = dist;
          bestBush = { x: nx, y: ny, stage };
        } else if (stage === STAGE_TREE && dist < bestTreeD) {
          bestTreeD = dist;
          bestTree = { x: nx, y: ny, stage };
        }
      }
    }
    const picks = [];
    if (bestTree) picks.push({ meal: bestTree, rank: 0, d: bestTreeD });
    if (bestBush) picks.push({ meal: bestBush, rank: 1, d: bestBushD });
    if (bestGrass) picks.push({ meal: bestGrass, rank: 2, d: bestGrassD });
    picks.sort((a, b) => a.rank - b.rank || a.d - b.d);
    return picks[0]?.meal || null;
  }

  findNearestThicket(x, y, range, allowOccupied = true) {
    let best = null;
    let bestScore = -1;
    for (let dy = -range; dy <= range; dy++) {
      for (let dx = -range; dx <= range; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        const man = this.distMan(x, y, nx, ny);
        if (man > range || man === 0) continue;
        if (!this.isKoalaPerchCell(nx, ny)) continue;
        const occupied = this.isKoalaPerchOccupied(nx, ny);
        if (!allowOccupied && occupied) continue;
        const stage = this.plantStageAt(nx, ny);
        let score = stage === STAGE_TREE ? 4 : 2;
        if (occupied) score -= 5;
        for (const o of this.agents) {
          if (o.dead || !isKoala(o)) continue;
          const d = this.distMan(nx, ny, o.x, o.y);
          if (d <= 1) score -= 3;
          else if (d <= 2) score -= 1;
        }
        score -= man * 0.08;
        if (score > bestScore) {
          bestScore = score;
          best = { x: nx, y: ny };
        }
      }
    }
    return best;
  }

  seekKoalaHangout(a) {
    const perch = this.findNearestEmptyPerch(a.x, a.y, a.vision || 8)
      || this.findNearestThicket(a.x, a.y, a.vision || 8, true);
    if (perch) {
      const step = this.stepToward(a.x, a.y, perch.x, perch.y);
      if (step) return { x: step.x - a.x, y: step.y - a.y };
    }
    return this.seekHerb(a);
  }

  feedHungryKoala(a) {
    const aware = this.perceive(a);
    const hidden = this.koalaHidden(a);

    if (aware.threats.length && !hidden) {
      const hide = this.findNearestEmptyPerch(a.x, a.y, a.vision || 8)
        || this.findNearestThicket(a.x, a.y, a.vision || 8, true);
      if (hide) {
        this.nudgeToward(a, hide.x, hide.y);
        return;
      }
      if (aware.touchThreat || aware.deadEnd) {
        const t = aware.threats[0];
        this.fleeFrom(a, t.x, t.y);
        return;
      }
    }

    const continuing = this.mealFromEating(a);
    if (continuing) {
      this.eatPlant(a, continuing);
      return;
    }
    if (a.eating) a.eating = null;

    if (koalaPerchedOn(this, a)) {
      const stage = this.plantStageAt(a.x, a.y);
      if (stage === STAGE_TREE || stage === STAGE_BUSH) {
        this.startEating(a, { x: a.x, y: a.y, stage });
        return;
      }
    }

    const touchTree = aware.food.find((f) => f.stage === STAGE_TREE && f.dist <= 1);
    if (touchTree) {
      this.startEating(a, touchTree);
      return;
    }

    if (!koalaPerchedOn(this, a)) {
      const perch = this.findNearestEmptyPerch(a.x, a.y, a.vision || 8);
      if (perch) {
        this.nudgeToward(a, perch.x, perch.y);
        return;
      }
    }

    if (aware.touchFood) {
      const food = aware.touchFood;
      if (food.stage === STAGE_BUSH && koalaPerchedOn(this, a) && this.plantStageAt(a.x, a.y) === STAGE_BUSH) {
        this.startEating(a, food);
        return;
      }
    }

    const target = aware.food.find((f) => f.stage === STAGE_TREE)
      || aware.food.find((f) => f.stage === STAGE_BUSH);
    if (target) {
      this.nudgeToward(a, target.x, target.y);
      return;
    }

    this.wanderAgent(a);
  }

  feedHungryHerb(a) {
    if (isKrolDushegub(a)) {
      this.feedKrolDushegub(a);
      return;
    }

    if (isKoala(a)) {
      this.feedHungryKoala(a);
      return;
    }

    const aware = this.perceive(a);

    if (aware.threats.length && (aware.touchThreat || aware.deadEnd)) {
      const t = aware.threats[0];
      this.fleeFrom(a, t.x, t.y);
      return;
    }

    const continuing = this.mealFromEating(a);
    if (continuing) {
      if (continuing.mushroom) this.eatMushroom(a, continuing.x, continuing.y);
      else this.eatPlant(a, continuing);
      return;
    }
    if (a.eating) a.eating = null;

    if (aware.touchFood) {
      this.startEating(a, aware.touchFood);
      return;
    }

    const target = aware.food[0];
    if (target) {
      this.nudgeToward(a, target.x, target.y);
      const after = this.findNearestEdible(a.x, a.y, 1, "touch", a);
      if (after) this.startEating(a, after);
      return;
    }

    this.wanderAgent(a);
  }

  feedHungryPred(a) {
    if (isElk(a)) {
      this.feedHungryElk(a);
      return;
    }

    if (isWolf(a)) {
      this.feedHungryWolf(a);
      return;
    }

    const aware = this.perceive(a);

    if (aware.touchPrey) {
      this.pouncePrey(a, aware.touchPrey);
      return;
    }

    const target = aware.prey[0];
    if (!target) {
      const mush = aware.food.find((f) => f.mushroom);
      if (mush) {
        this.nudgeToward(a, mush.x, mush.y);
        const touch = this.findNearestMushroom(a.x, a.y, 1, "touch");
        if (touch) this.startEating(a, touch);
        return;
      }
      this.wanderAgent(a);
      return;
    }

    this.nudgeToward(a, target.x, target.y);
    const adj = this.findNearestPrey(a.x, a.y, 1, a, "touch");
    if (adj) this.pouncePrey(a, adj);
  }

  feedHungryWolf(a) {
    const other = this.nearestWolf(a.x, a.y, a);
    if (other && this.distMan(a.x, a.y, other.x, other.y) <= WOLF_SOLITUDE) {
      this.fleeFrom(a, other.x, other.y);
      return;
    }

    const aware = this.perceive(a);
    if (aware.touchPrey) {
      this.pouncePrey(a, aware.touchPrey);
      return;
    }

    const target = aware.prey[0];
    if (!target) {
      const mush = aware.food.find((f) => f.mushroom);
      if (mush) {
        this.nudgeToward(a, mush.x, mush.y);
        const touch = this.findNearestMushroom(a.x, a.y, 1, "touch");
        if (touch) this.startEating(a, touch);
        return;
      }
      this.wanderAgent(a);
      return;
    }

    this.nudgeToward(a, target.x, target.y);
    const adj = this.findNearestPrey(a.x, a.y, 1, a, "touch");
    if (adj) this.pouncePrey(a, adj);
  }

  feedHungryElk(a) {
    if (!this.shouldMoveThisTick(a)) return;

    const aware = this.perceive(a);
    if (aware.threats.length && aware.touchThreat) {
      const t = aware.threats[0];
      this.fleeFrom(a, t.x, t.y);
      return;
    }

    const continuing = this.mealFromEating(a);
    if (continuing) {
      if (continuing.mushroom) this.eatMushroom(a, continuing.x, continuing.y);
      else this.eatPlant(a, continuing);
      return;
    }
    if (a.eating) a.eating = null;

    if (aware.touchFood) {
      this.startEating(a, aware.touchFood);
      return;
    }

    const target = aware.food[0];
    if (target) {
      this.nudgeToward(a, target.x, target.y);
      const after = this.findNearestEdible(a.x, a.y, 1, "touch", a);
      if (after) this.startEating(a, after);
      return;
    }

    this.wanderAgent(a);
  }

  feedHungryBear(a) {
    const aware = this.perceive(a);
    const preyKinds = [HERB, PRED];

    if (aware.touchPrey) {
      const victim = this.agentAt(aware.touchPrey.x, aware.touchPrey.y);
      const gain = victim?.kind === PRED ? 9.5 : isCow(victim) ? 11 : 6.5;
      if (this.pounceVictim(a, aware.touchPrey, gain)) return;
    }

    const continuing = this.mealFromEating(a);
    if (continuing) {
      if (continuing.mushroom) this.eatMushroom(a, continuing.x, continuing.y);
      else this.eatPlant(a, continuing);
      return;
    }
    if (a.eating) a.eating = null;

    if (aware.touchFood) {
      this.startEating(a, aware.touchFood);
      return;
    }

    const prey = this.findNearestAgent(a.x, a.y, this.effectiveVision(a), preyKinds, a);
    if (prey) {
      this.nudgeToward(a, prey.x, prey.y);
      const adj = this.findNearestAgent(a.x, a.y, 1, preyKinds, a, "touch");
      if (adj) {
        const victim = this.agentAt(adj.x, adj.y);
        const gain = victim?.kind === PRED ? 9.5 : isCow(victim) ? 11 : 6.5;
        this.pounceVictim(a, adj, gain);
      }
      return;
    }

    const plant = aware.food[0];
    if (plant) {
      this.nudgeToward(a, plant.x, plant.y);
      const after = this.findNearestEdible(a.x, a.y, 1, "touch", a);
      if (after) this.startEating(a, after);
      return;
    }

    this.wanderAgent(a);
  }

  findBirthSpotFor(a) {
    if (!isKoala(a)) return this.findNeighbor(a.x, a.y, EMPTY);
    if (!koalaPerchedOn(this, a)) return null;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    let best = null;
    let bestScore = -1;
    for (const [dx, dy] of dirs) {
      const nx = a.x + dx;
      const ny = a.y + dy;
      if (this.get(nx, ny) !== EMPTY) continue;
      if (!this.canPlaceAnimalAt(nx, ny)) continue;
      let score = 0;
      for (const [sx, sy] of dirs) {
        const px = nx + sx;
        const py = ny + sy;
        if (!this.isKoalaPerchCell(px, py)) continue;
        score += this.plantStageAt(px, py) === STAGE_TREE ? 3 : 1;
        if (!this.isKoalaPerchOccupied(px, py)) score += 2;
      }
      if (score > bestScore) {
        bestScore = score;
        best = { x: nx, y: ny };
      }
    }
    return best;
  }

  findNeighbor(x, y, type) {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
    }
    for (const [dx, dy] of dirs) {
      if (this.get(x + dx, y + dy) === type) return { x: x + dx, y: y + dy };
    }
    return null;
  }

  removeAgentAt(x, y) {
    for (const a of this.agents) {
      if (!a.dead && agentOccupies(a, x, y)) a.dead = true;
    }
    this.agents = this.agents.filter((a) => !a.dead);
  }

  canPlaceAnimalAt(x, y) {
    if (!this.inside(x, y)) return false;
    if (this.agentAt(x, y)) return false;
    if (this.get(x, y) !== EMPTY) return false;
    return true;
  }

  paint(x, y, brush) {
    if (!this.inside(x, y)) return false;
    if (this.get(x, y) === WALL && brush !== "erase") {
      if (this.dish && !this.inDish(x, y)) return false;
    }
    if (brush === "erase") {
      if (this.arcade) return false;
      this.removeAgentAt(x, y);
      if (this.dish && !this.inDish(x, y)) return false;
      this.clearPlant(x, y);
      this.set(x, y, EMPTY);
      return true;
    }
    if (brush === "plant") {
      if (!this.canPlaceAnimalAt(x, y)) return false;
      this.setPlant(x, y, STAGE_GRASS, 0);
      return true;
    }
    if (brush === "water") {
      this.removeAgentAt(x, y);
      this.clearPlant(x, y);
      this.set(x, y, WATER);
      return true;
    }
    if (brush === "wall") {
      this.removeAgentAt(x, y);
      this.clearPlant(x, y);
      this.set(x, y, WALL);
      return true;
    }
    if (brush === "herb" || brush === "pred" || brush === "bear") {
      if (!this.canPlaceAnimalAt(x, y)) return false;
      const kind = brush === "herb" ? HERB : brush === "pred" ? PRED : BEAR;
      this.set(x, y, kind);
      const agent = this.makeAgent(x, y, kind);
      this.agents.push(agent);
      return true;
    }
    return false;
  }

  defaultsFor(kind) {
    const sp = BAL.species || {};
    if (kind === BEAR) {
      const b = sp.bear || {};
      return {
        energy: b.energy ?? 22,
        hue: (b.hueMin ?? 28) + this.rng() * (b.hueRange ?? 16),
        vision: b.vision ?? 5,
        drain: b.drain ?? 0.36,
        thresh: b.thresh ?? 19,
        moveInterval: b.moveInterval ?? 1
      };
    }
    if (kind === PRED) {
      const f = sp.fox || {};
      return {
        energy: f.energy ?? 10,
        hue: (f.hueMin ?? 350) + this.rng() * (f.hueRange ?? 20),
        vision: f.vision ?? 10,
        drain: f.drain ?? 0.48,
        thresh: f.thresh ?? 14,
        moveInterval: f.moveInterval ?? 1
      };
    }
    const r = sp.rabbit || {};
    return {
      energy: r.energy ?? 8,
      hue: (r.hueMin ?? 38) + this.rng() * (r.hueRange ?? 22),
      vision: r.vision ?? 7,
      drain: r.drain ?? 0.4,
      thresh: r.thresh ?? 13,
      moveInterval: r.moveInterval ?? 1
    };
  }

  breedMinAge(a) {
    if (isCow(a)) return BREED_MIN_AGE.cow;
    if (isKoala(a)) return BREED_MIN_AGE.koala;
    if (isWolf(a)) return BREED_MIN_AGE.wolf;
    return a.kind === PRED ? BREED_MIN_AGE.pred : BREED_MIN_AGE.herb;
  }

  canTryBreed(a, wasSatedAtTickStart) {
    if (a.kind === BEAR || isElk(a) || isKrolDushegub(a)) return false;
    if (!wasSatedAtTickStart || a.energy < a.thresh || a.cool > 0) return false;
    if (isKoala(a)) {
      if (!koalaPerchedOn(this, a)) return false;
      if (this.plantStageAt(a.x, a.y) !== STAGE_TREE) return false;
      const cap = this.koalaPerchCapacity();
      if (cap > 0 && this.koalaCount() > cap) return false;
    }
    const age = this.generation - (a.bornGen ?? this.generation);
    return age >= this.breedMinAge(a);
  }

  makeAgent(x, y, kind, parent) {
    const d = this.defaultsFor(kind);
    const agent = {
      x, y, kind,
      energy: parent ? parent.energy : d.energy,
      hue: parent ? parent.hue : d.hue,
      vision: parent ? parent.vision : d.vision,
      drain: parent ? parent.drain : d.drain,
      thresh: parent ? parent.thresh : d.thresh,
      trait: null,
      gen: parent ? parent.gen + 1 : 1,
      bornGen: this.generation,
      cool: parent ? 0 : (kind === PRED ? BREED_COOL_INIT.pred : kind === HERB ? BREED_COOL_INIT.herb : 0),
      skillBoost: false,
      dead: false,
      eating: null,
      moveInterval: parent ? (parent.moveInterval || 1) : d.moveInterval,
      movePhase: 0,
      stepsSincePoop: 0
    };
    return agent;
  }

  inheritSpeciesTrait(baby, parent) {
    const trait = parent?.trait;
    if (!trait || trait === TRAIT.KROL || !SPECIES_CFG[trait]) return false;
    const cfg = SPECIES_CFG[trait];
    baby.trait = trait;
    baby.drain = cfg.drain;
    baby.thresh = cfg.thresh;
    baby.vision = cfg.vision;
    baby.hue = parent.hue;
    baby.moveInterval = cfg.moveInterval || 1;
    baby.movesPerTick = cfg.movesPerTick || 1;
    return true;
  }

  applySpeciesTrait(baby, trait, x, y, parent = null) {
    const cfg = SPECIES_CFG[trait];
    if (!cfg) return false;
    baby.trait = trait;
    baby.energy = cfg.energy;
    baby.drain = cfg.drain;
    baby.thresh = cfg.thresh;
    baby.vision = cfg.vision;
    baby.hue = cfg.hue + this.rng() * 8;
    baby.moveInterval = cfg.moveInterval || 1;
    baby.movesPerTick = cfg.movesPerTick || 1;
    if (trait === TRAIT.KROL) {
      if (!parent || !this.birthKrolAroundParent(baby, parent)) {
        baby.trait = null;
        return false;
      }
    }
    this.mutations++;
    if (baby.kind === HERB) this.mutHerb++;
    else this.mutPred++;
    this.awardMutationPoints(baby);
    const energy = this.grantMutationEnergy(trait);
    this.lastMutation = { kind: baby.kind, trait, special: true, x: baby.x, y: baby.y, energy };
    if (trait === TRAIT.KROL) {
      this.pendingKrolAlert = { energy };
      this.fx.push({ x: baby.x, y: baby.y, color: "#e040fb", t: 2.4, krol: true });
      this.spark(baby.x, baby.y, "#ff3dff");
      this.spark(baby.x + 1, baby.y + 1, "#ffffff");
      this.chime("krol_dushegub");
    } else {
      this.chime("mutate");
      this.spark(x, y, "#7dffc2");
    }
    return true;
  }

  arcadeEnergyTable() {
    if (typeof LIFE_BALANCE !== "undefined" && LIFE_BALANCE.arcadeEnergy) return LIFE_BALANCE.arcadeEnergy;
    return (typeof LIFE_DATA !== "undefined" && LIFE_DATA.arcadeEnergy) || {};
  }

  grantArcadeEnergy(key) {
    if (!this.arcade || !key) return 0;
    let gain = this.arcadeEnergyTable()[key] ?? 0;
    if (gain <= 0) return 0;
    const mul = this.ecosystemRewardMul();
    if (mul <= 0) return 0;
    gain = Math.floor(gain * mul);
    if (gain > 0) this.pendingEnergy += gain;
    return gain;
  }

  grantMutationEnergy(trait) {
    if (!this.arcade || !trait) return 0;
    const table = (typeof LIFE_BALANCE !== "undefined" && LIFE_BALANCE.mutationEnergy)
      || (typeof LIFE_DATA !== "undefined" && LIFE_DATA.mutationEnergy) || {};
    const raw = table[trait] ?? 5;
    const mul = this.ecosystemRewardMul();
    if (mul <= 0) return 0;
    const payoutMul = BAL.mutationEnergyPayoutMul ?? 0.5;
    const gain = Math.max(1, Math.floor(raw * mul * payoutMul));
    this.pendingEnergy += gain;
    return gain;
  }

  grantEvolutionEnergy() {
    return this.grantPlantArcadeEnergy("plantEvolveBush");
  }

  tryHerbSpeciesMutation(baby, x, y, parent = null) {
    if (baby.kind !== HERB) return false;
    const roll = this.rng();
    let acc = 0;
    const order = [
      [TRAIT.KROL, MUT_CHANCE.krol],
      [TRAIT.KOALA, MUT_CHANCE.koala],
      [TRAIT.COW, MUT_CHANCE.cow]
    ];
    for (const [trait, base] of order) {
      acc += this.effectiveChance(base, baby.gen);
      if (roll < acc) return this.applySpeciesTrait(baby, trait, x, y, parent);
    }
    return false;
  }

  tryPredSpeciesMutation(baby, x, y) {
    if (baby.kind !== PRED) return false;
    const roll = this.rng();
    let acc = 0;
    const order = [
      [TRAIT.WOLF, MUT_CHANCE.wolf],
      [TRAIT.ELK, MUT_CHANCE.elk]
    ];
    for (const [trait, base] of order) {
      acc += this.effectiveChance(base, baby.gen);
      if (roll < acc) return this.applySpeciesTrait(baby, trait, x, y);
    }
    return false;
  }

  agentAt(x, y) {
    return this.agents.find((a) => !a.dead && agentOccupies(a, x, y)) || null;
  }

  live(kind) {
    return this.agents.filter((a) => !a.dead && a.kind === kind);
  }

  satietyOf(kind) {
    const list = this.live(kind);
    if (!list.length) return 0;
    const sum = list.reduce((s, a) => s + Math.min(1, a.energy / Math.max(1, a.thresh)), 0);
    return Math.round((sum / list.length) * 100);
  }

  hungryCount(kind) {
    return this.live(kind).filter((a) => a.energy < a.thresh).length;
  }

  counts() {
    if (this._countsCache) return this._countsCache;
    let grass = 0, bush = 0, tree = 0, water = 0, walls = 0;
    for (let i = 0; i < this.cells.length; i++) {
      const v = this.cells[i];
      if (v === PLANT) {
        const s = this.plantStage[i];
        if (s === STAGE_GRASS) grass++;
        else if (s === STAGE_BUSH) bush++;
        else if (s === STAGE_TREE) tree++;
      } else if (v === WATER) water++;
      else if (v === WALL) walls++;
    }
    const herbs = this.agents.filter((a) => a.kind === HERB && !a.dead).length;
    const preds = this.agents.filter((a) => a.kind === PRED && !a.dead).length;
    const bears = this.agents.filter((a) => a.kind === BEAR && !a.dead).length;
    const plants = grass + bush + tree;
    this._countsCache = { grass, bush, tree, plants, herbs, preds, bears, water, walls, total: plants + herbs + preds + bears };
    return this._countsCache;
  }

  analytics() {
    this.invalidateCountsCache();
    const c = this.counts();
    const herbSat = this.satietyOf(HERB);
    const predSat = this.satietyOf(PRED);
    const edible = c.grass + c.bush * PLANT_CFG.bushViabilityWeight;
    const foodPerHerb = c.herbs ? edible / c.herbs : edible ? Infinity : 0;
    const preyPerFox = c.preds ? c.herbs / c.preds : 0;
    let score = 0;
    let label = "пусто";
    let note = "Нарисуй траву или зверей и нажми Старт.";

    if (c.total === 0) {
      score = 0;
    } else if (c.plants && !c.herbs && !c.preds) {
      score = Math.min(70, 28 + Math.floor(c.plants / 4));
      if (this.noAnimalGens > 40) {
        score = Math.max(5, score - Math.floor((this.noAnimalGens - 40) / 4));
      }
      label = "только лес";
      if (this.noAnimalGens > 60) {
        note = "Без зверей лес перестаёт обновляться и увядает.";
      } else {
        note = "Трава растёт в кусты и деревья. Добавь зайцев для цепочки.";
      }
    } else if (c.preds && !c.herbs) {
      score = 12;
      label = "охотники без добычи";
      note = "Лисам некого есть.";
    } else if (c.herbs && foodPerHerb < 1.2) {
      score = Math.max(18, Math.round(22 + herbSat * 0.2));
      label = "голод";
      note = "Зайцам мало травы и кустов. Деревья едят только корова и лось.";
    } else if (c.preds && c.herbs && preyPerFox < 1.3) {
      score = 28;
      label = "слишком много лис";
      note = "Зайцы не успевают размножаться.";
    } else if (c.plants && c.herbs && c.preds && herbSat >= 35) {
      score = Math.min(100, Math.round(72 + herbSat * 0.22 + Math.min(10, foodPerHerb)));
      label = "баланс";
      note = "Цепочка держится: растения → зайцы → лисы.";
    } else if (c.plants && c.herbs) {
      score = Math.min(88, Math.round(48 + herbSat * 0.35));
      label = "устойчиво";
      note = herbSat >= 50 ? "Зайцы сыты." : "Зайцы голодноваты.";
    } else {
      score = 30;
      label = "нестабильно";
      note = "Попробуй пруд у леса или каменный забор.";
    }

    return {
      ...c,
      herbSat,
      predSat,
      herbHungry: this.hungryCount(HERB),
      predHungry: this.hungryCount(PRED),
      mutHerb: this.live(HERB).filter((a) => a.trait).length,
      mutPred: this.live(PRED).filter((a) => a.trait).length,
      mutEvents: this.mutations,
      foodPerHerb: c.herbs ? Math.round(foodPerHerb * 10) / 10 : "—",
      preyPerFox: c.preds ? Math.round(preyPerFox * 10) / 10 : "—",
      score,
      label,
      note
    };
  }

  isAlive() {
    const c = this.counts();
    return c.plants > 0 || c.herbs > 0 || c.preds > 0 || c.bears > 0;
  }

  step() {
    if (this.gameOver) return;
    this.invalidateCountsCache();
    this.lastMutation = null;
    this.pendingEnergy = 0;
    this.sounds = [];
    this.tickAnimalMetrics();
    this.tickDecays();
    this.tickFertilizers();
    this.growPlants();
    this.stepAgents();
    this.generation++;
    this.tickSurvivalPoints();
    if (this.plagueFogTicks > 0) this.plagueFogTicks--;
    if (this.screenShake > 0) this.screenShake--;
    if (this.arcade && this.generation > 0 && this.generation % ROULETTE_INTERVAL === 0) {
      this.roulettePending = true;
    }
    if (this.arcade && !this.isAlive() && !this.sustainedChain) this.gameOver = true;
  }

  pickRouletteEvent() {
    const weights = (typeof LIFE_DATA !== "undefined" && LIFE_DATA.roulette?.weights)
      || { earthquake: 30, flood: 30, plague: 25, evolution: 15 };
    const entries = Object.entries(weights);
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let roll = this.rng() * total;
    for (const [key, weight] of entries) {
      roll -= weight;
      if (roll <= 0) return key;
    }
    return entries[0][0];
  }

  shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  randomPct(min, max) {
    return min + this.rng() * (max - min);
  }

  roulettePct(type) {
    const range = ROULETTE_PCT[type];
    if (range && range.length >= 2) return this.randomPct(range[0], range[1]);
    return this.randomPct(0.1, 0.3);
  }

  applyRouletteEvent(type) {
    const pct = {};
    let detail = "";
    if (type === "earthquake") {
      const plants = [];
      for (let y = 0; y < this.h; y++) {
        for (let x = 0; x < this.w; x++) {
          if (this.get(x, y) === PLANT) plants.push({ x, y });
        }
      }
      pct.value = this.roulettePct("earthquake");
      const remove = Math.max(1, Math.floor(plants.length * pct.value));
      this.shuffleInPlace(plants);
      for (let i = 0; i < remove && i < plants.length; i++) {
        this.clearPlant(plants[i].x, plants[i].y);
        this.spark(plants[i].x, plants[i].y, "#8b7355");
      }
      this.screenShake = BAL.roulette?.screenShake ?? 28;
      detail = `Уничтожено ~${Math.round(pct.value * 100)}% растений`;
      this.chime("roulette_earthquake");
    } else if (type === "flood") {
      const empty = [];
      for (let y = 0; y < this.h; y++) {
        for (let x = 0; x < this.w; x++) {
          if (this.get(x, y) === EMPTY && (!this.dish || this.inDish(x, y))) empty.push({ x, y });
        }
      }
      pct.value = this.roulettePct("flood");
      const add = Math.max(1, Math.floor(empty.length * pct.value));
      this.shuffleInPlace(empty);
      for (let i = 0; i < add && i < empty.length; i++) {
        this.set(empty[i].x, empty[i].y, WATER);
      }
      detail = `Затоплено ~${Math.round(pct.value * 100)}% свободных клеток`;
      this.chime("roulette_flood");
    } else if (type === "plague") {
      const live = this.agents.filter((a) => !a.dead && !isKrolDushegub(a));
      pct.value = this.roulettePct("plague");
      const killN = Math.max(live.length > 0 ? 1 : 0, Math.floor(live.length * pct.value));
      this.shuffleInPlace(live);
      for (let i = 0; i < killN; i++) this.dieAgent(live[i]);
      this.plagueFogTicks = PLAGUE_FOG_TICKS;
      detail = `Погибло ~${Math.round(pct.value * 100)}% зверей`;
      this.chime("roulette_plague");
    } else if (type === "evolution") {
      const targets = this.agents.filter((a) => !a.dead && !a.trait
        && ((a.kind === HERB) || (a.kind === PRED)));
      pct.value = this.roulettePct("evolution");
      const evolveN = Math.max(targets.length > 0 ? 1 : 0, Math.floor(targets.length * pct.value));
      this.shuffleInPlace(targets);
      let evolved = 0;
      for (let i = 0; i < evolveN; i++) {
        const a = targets[i];
        if (a.kind === HERB) {
          const trait = this.rng() < 0.5 ? TRAIT.KOALA : TRAIT.COW;
          if (this.applySpeciesTrait(a, trait, a.x, a.y)) evolved++;
        } else if (a.kind === PRED) {
          const trait = this.rng() < 0.5 ? TRAIT.WOLF : TRAIT.ELK;
          if (this.applySpeciesTrait(a, trait, a.x, a.y)) evolved++;
        }
      }
      detail = `Эволюционный скачок: ${evolved} зверей`;
      this.chime("roulette_evolution");
    }
    this.lastRouletteEvent = { type, generation: this.generation, detail, pct: pct.value };
    this.roulettePending = false;
    this.invalidateCountsCache();
    return this.lastRouletteEvent;
  }

  tickDecays() {
    this.decays = this.decays.filter((d) => {
      d.ttl--;
      d.pulse = (d.pulse || 0) + 0.15;
      return d.ttl > 0;
    });
  }

  tickFertilizers() {
    this.fertilizers = this.fertilizers.filter((f) => {
      f.ttl--;
      return f.ttl > 0;
    });
  }

  tryPlantMushroomNear(x, y) {
    const spot = this.findNeighbor(x, y, EMPTY);
    if (!spot) return false;
    if (this.arcade && !this.inDish(spot.x, spot.y)) return false;
    this.set(spot.x, spot.y, MUSHROOM);
    this.spark(spot.x, spot.y, "#c77dff");
    this.chime("mushroom_plant");
    return true;
  }

  eatMushroom(a, x, y) {
    if (!a || this.get(x, y) !== MUSHROOM) return false;
    this.set(x, y, EMPTY);
    const firstBoost = !a.skillBoost;
    if (firstBoost) {
      a.skillBoost = true;
      this.chime("mushroom_boost");
      this.fx.push({ x, y, color: "#e040fb", t: 1.6 });
    } else {
      this.chime("mushroom_eat");
    }
    const gained = MUSHROOM_CFG.energy * skillMul(a);
    a.energy += gained;
    this.awardProcessedEnergy(gained, a, 1);
    this.spark(x, y, "#d4a5ff");
    a.eating = null;
    return true;
  }

  addFertilizer(x, y) {
    this.fertilizers.push({
      x, y,
      ttl: FERTILIZER_CFG.ttl,
      strength: FERTILIZER_CFG.strength
    });
    this.fx.push({ x, y, color: "#8b6914", t: 1.4, fert: true });
    this.chime("fertilize");
    this.awardScaledEcoPoints(this.tierPoints("activity", this.plantEventTier("fertilize")));
    this.grantArcadeEnergy("fertilize");
  }

  addDecay(x, y, kind) {
    const cfg = kind === BEAR ? DECAY_CFG.bear : kind === PRED ? DECAY_CFG.pred : DECAY_CFG.herb;
    const color = kind === BEAR ? "#a88458" : kind === PRED ? "#c8a86a" : "#8abf6a";
    this.decays.push({ x, y, radius: cfg.radius, strength: cfg.strength, ttl: cfg.ttl, kind, pulse: 0 });
    this.fx.push({ x, y, color, t: 1.2, bone: true });
  }

  trySpawnGrass(x, y, baseChance) {
    if (this.get(x, y) !== EMPTY) return false;
    const wet = this.countType(x, y, WATER);
    const boost = this.decayBoost(x, y);
    const fert = this.fertilizerBoost(x, y);
    let p = baseChance * (1 + fert) + boost;
    if (wet) p += 0.03;
    if (this.rng() >= p) return false;
    this.setPlant(x, y, STAGE_GRASS, 0);
    this.births++;
    this.spark(x, y, "#5dff8a");
    this.chime("sprout");
    this.awardPlantLifePoints("sprout");
    this.grantPlantArcadeEnergy("plantSprout");
    return true;
  }

  growPlants() {
    let decaySpawned = false;
    const renew = this.plantRenewalMul();
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y) !== PLANT) continue;
        const i = this.idx(x, y);
        const stage = this.plantStage[i];
        const growth = this.growthMulAt(x, y);
        this.plantAge[i] += growth;

        if (stage === STAGE_GRASS && this.plantAge[i] >= PLANT_CFG.grassToBush) {
          this.setPlant(x, y, STAGE_BUSH, 0);
          this.spark(x, y, "#46d070");
          this.chime("evolve_bush");
          this.awardPlantLifePoints("evolveGrass");
          this.grantPlantArcadeEnergy("plantEvolveGrass");
        } else if (stage === STAGE_BUSH) {
          if (this.plantAge[i] >= PLANT_CFG.bushToTree) {
            this.setPlant(x, y, STAGE_TREE, 0);
            this.spawnGrassAround(x, y, PLANT_CFG.bushToTreeGrass);
            this.grantEvolutionEnergy();
            this.spark(x, y, "#2a9e50");
            this.chime("evolve_tree");
            this.awardPlantLifePoints("evolveBush");
          } else {
            const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
            for (const [dx, dy] of dirs) {
              if (decaySpawned) break;
              const boost = this.decayBoost(x + dx, y + dy);
              const fert = this.fertilizerBoost(x + dx, y + dy);
              const spread = PLANT_CFG.bushSpread * renew * (1 + fert);
              if (boost > 0 && !decaySpawned) {
                decaySpawned = this.trySpawnGrass(x + dx, y + dy, spread * 0.5) || decaySpawned;
              } else {
                this.trySpawnGrass(x + dx, y + dy, spread);
              }
            }
          }
        } else if (stage === STAGE_TREE && this.plantAge[i] >= PLANT_CFG.treeLife) {
          this.clearPlant(x, y);
          this.spawnGrassAt(x, y);
          this.chime("wilt");
          this.awardPlantLifePoints("wilt");
          this.grantPlantArcadeEnergy("plantWilt");
        }
      }
    }
  }

  seekHerb(a) {
    const target = this.findNearestEdible(a.x, a.y, a.vision || 7, "scout", a);
    if (!target) {
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const d = dirs[Math.floor(this.rng() * 4)];
      return { x: d[0], y: d[1] };
    }
    const step = this.stepToward(a.x, a.y, target.x, target.y);
    if (!step) return { x: 0, y: 0 };
    return { x: step.x - a.x, y: step.y - a.y };
  }

  seekPred(a) {
    const target = this.findNearestPrey(a.x, a.y, this.effectiveVision(a), a);
    if (!target) {
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const d = dirs[Math.floor(this.rng() * 4)];
      return { x: d[0], y: d[1], target: null };
    }
    const step = this.stepToward(a.x, a.y, target.x, target.y);
    if (!step) return { x: 0, y: 0, target };
    return { x: step.x - a.x, y: step.y - a.y, target };
  }

  eatPlant(a, meal) {
    const i = this.idx(meal.x, meal.y);
    const stage = this.plantStage[i];
    const mult = a.kind === BEAR ? 0.82 : isKoala(a) ? 0.9 : 1;
    if (stage === STAGE_GRASS || stage === STAGE_BUSH) {
      const perBite = stage === STAGE_GRASS
        ? PLANT_CFG.grassEnergy / PLANT_CFG.grassBites
        : PLANT_CFG.bushEnergyPerBite;
      const gained = perBite * mult * skillMul(a);
      this.plantBites[i]--;
      a.energy += gained;
      this.awardProcessedEnergy(gained, a, this.plantStageTier(stage));
      if (this.plantBites[i] <= 0) {
        this.clearPlant(meal.x, meal.y);
        a.eating = null;
      } else if (a.energy >= a.thresh && !isKrolDushegub(a)) {
        a.eating = null;
      }
      this.chime(stage === STAGE_GRASS ? "eat_grass" : "eat_bush");
    } else if (stage === STAGE_TREE && isKoala(a)) {
      const gained = PLANT_CFG.treeEnergyPerBiteKoala * mult;
      a.energy += gained;
      this.awardProcessedEnergy(gained, a, this.plantStageTier(stage));
      this.grantArcadeEnergy("koalaTreeBite");
      if (a.energy >= a.thresh) a.eating = null;
      this.chime("eat_tree");
    } else if (stage === STAGE_TREE && (isCow(a) || isElk(a) || isKrolDushegub(a))) {
      const bitesThisTick = isCow(a) ? PLANT_CFG.treeBitesPerTickCow : 1;
      const perBite = isCow(a) ? PLANT_CFG.treeEnergyPerBiteCow
        : PLANT_CFG.treeEnergyPerBite * (isKrolDushegub(a) ? 1.2 : 1);
      for (let b = 0; b < bitesThisTick && this.plantBites[i] > 0; b++) {
        this.plantBites[i]--;
        const gained = perBite * skillMul(a);
        a.energy += gained;
        this.awardProcessedEnergy(gained, a, this.plantStageTier(stage));
      }
      if (this.plantBites[i] <= 0) {
        this.clearPlant(meal.x, meal.y);
        this.spawnGrassAt(meal.x, meal.y);
        a.eating = null;
      } else if (a.energy >= a.thresh && !isKrolDushegub(a)) {
        a.eating = null;
      }
      this.chime("eat_tree");
    }
    this.spark(meal.x, meal.y, "#ffc14d");
  }

  spawnKrolLegacy(a) {
    this.chime("krol_roar");
    this.fx.push({ x: a.x, y: a.y, color: "#e040fb", t: 2.8, krol: true });
    this.spark(a.x, a.y, "#ff66ff");
    this.spark(a.x, a.y, "#ffffff");
    for (let i = 0; i < KROL_DEATH_SPAWN; i++) {
      const spot = this.findNeighbor(a.x, a.y, EMPTY);
      if (!spot) break;
      const baby = this.makeAgent(spot.x, spot.y, HERB);
      this.set(spot.x, spot.y, HERB);
      this.agents.push(baby);
      this.awardBirthPoints(baby);
      this.grantArcadeEnergy("animalBirth");
      this.births++;
      this.chime("birth");
    }
  }

  killAgent(victim, killer, energyGain) {
    const gain = energyGain ?? (SCORING.huntEnergyGain ?? 7.2);
    this.clearAgentCells(victim);
    victim.dead = true;
    this.deaths++;
    this.addDecay(victim.x, victim.y, victim.kind);
    killer.energy += gain * skillMul(killer);
    this.awardDeathPoints(victim);
    this.awardProcessedEnergy(gain, killer, this.agentTier(victim));
    this.grantArcadeEnergy("hunt");
    this.spark(killer.x + (isKrolDushegub(killer) ? 1 : 0), killer.y + (isKrolDushegub(killer) ? 1 : 0), "#ff5d7a");
    if (!isKrolDushegub(killer) && killer.kind === BEAR) {
      this.chime("bear_hunt");
    } else if (!isKrolDushegub(killer)) {
      this.chime("hunt");
    }
    if (victim.kind === BEAR) this.chime("death_bear");
    else if (victim.kind === PRED) this.chime("death_pred");
    else this.chime("death_herb");
    this.chime("decay");
  }

  dieAgent(a, reason) {
    if (isKrolDushegub(a)) this.spawnKrolLegacy(a);
    a.dead = true;
    this.clearAgentCells(a);
    this.deaths++;
    this.addDecay(a.x, a.y, a.kind);
    this.awardDeathPoints(a);
    this.grantArcadeEnergy("animalDeath");
    if (reason === "krol_burnout") {
      this.chime("krol_fade");
      this.fx.push({ x: a.x, y: a.y, color: "#e040fb", t: 1.8, krol: true });
      this.spark(a.x, a.y, "#ff66ff");
    } else if (a.kind === BEAR) {
      this.chime("death_bear");
    } else if (a.kind === PRED) {
      this.chime("death_pred");
    } else {
      this.chime("death_herb");
    }
    this.chime("decay");
  }

  litterSize(a) {
    if (isKoala(a)) {
      const onTree = koalaPerchedOn(this, a) && this.plantStageAt(a.x, a.y) === STAGE_TREE;
      return onTree ? (BAL.species?.koala?.litterOnTree ?? 2) : (BAL.species?.koala?.litter ?? 1);
    }
    if (isCow(a)) return BAL.species?.cow?.litter ?? 1;
    return 1;
  }

  stepAgents() {
    const order = this.agents.filter((a) => !a.dead);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const babies = [];
    const c = this.counts();

    for (const a of order) {
      if (a.dead) continue;

      a.movePhase = (a.movePhase || 0) + 1;
      const wasSated = a.energy >= a.thresh;

      if (isKrolDushegub(a) && a.bornGen != null && this.generation - a.bornGen >= KROL_LIFESPAN) {
        this.dieAgent(a, "krol_burnout");
        continue;
      }

      if (isElk(a) && (a.stepsSincePoop || 0) >= ELK_POOP_INTERVAL) {
        this.addFertilizer(a.x, a.y);
        a.stepsSincePoop = 0;
      }

      if (isCow(a)) {
        a.stepsSinceMush = (a.stepsSinceMush || 0) + 1;
        if (a.stepsSinceMush >= MUSHROOM_CFG.cowInterval) {
          a.stepsSinceMush = 0;
          if (this.rng() < MUSHROOM_CFG.cowChance) this.tryPlantMushroomNear(a.x, a.y);
        }
      }

      a.energy -= a.drain;
      if (a.cool > 0) a.cool--;

      if (a.energy <= 0 && !isKrolDushegub(a)) {
        this.dieAgent(a);
        continue;
      }

      const hungry = isKrolDushegub(a) || a.energy < a.thresh;

      if (isKrolDushegub(a)) {
        this.feedKrolDushegub(a);
      } else if (a.kind === HERB && hungry) {
        this.feedHungryHerb(a);
      } else if (a.kind === PRED && hungry) {
        this.feedHungryPred(a);
      } else if (a.kind === BEAR && hungry) {
        this.feedHungryBear(a);
      } else if (!hungry) {
        a.eating = null;
        this.stepSated(a);
      }

      if (a.dead) continue;

      if (this.canTryBreed(a, wasSated)) {
        let breedChance = 1;
        const bc = BAL.breed || {};
        const hc = bc.herbCrowd || {};
        const pr = bc.predRatio || {};
        if (a.kind === HERB && c.herbs > 0 && !isKoala(a)) {
          const edible = c.grass + c.bush * PLANT_CFG.bushFoodWeight;
          if (c.herbs > edible * (hc.hard ?? 0.85)) breedChance = hc.chanceHard ?? 0.25;
          else if (c.herbs > edible * (hc.soft ?? 0.55)) breedChance = hc.chanceSoft ?? 0.55;
        } else if (isKoala(a)) {
          const cap = this.koalaPerchCapacity();
          if (cap > 0) {
            const ratio = this.koalaCount() / cap;
            if (ratio >= (KOALA_CROWD.hard ?? 0.9)) breedChance = KOALA_CROWD.chanceHard ?? 0.12;
            else if (ratio >= (KOALA_CROWD.soft ?? 0.65)) breedChance = KOALA_CROWD.chanceSoft ?? 0.45;
          }
        } else if (a.kind === PRED && c.preds > 0) {
          if (c.herbs <= 0) breedChance = 0;
          else {
            const ratio = c.preds / Math.max(1, c.herbs);
            if (ratio >= (pr.r1 ?? 1)) breedChance = pr.c1 ?? 0.12;
            else if (ratio >= (pr.r05 ?? 0.5)) breedChance = pr.c05 ?? 0.3;
            else if (ratio >= (pr.r025 ?? 0.25)) breedChance = pr.c025 ?? 0.5;
          }
        }
        if (this.rng() < breedChance) {
          const litter = this.litterSize(a);
          let bred = false;
          for (let n = 0; n < litter; n++) {
            const spot = this.findBirthSpotFor(a);
            if (!spot) break;
            if (!bred) {
              a.energy *= bc.energyRetain ?? 0.5;
              a.cool = isKoala(a) ? (BREED_COOL_AFTER.koala ?? BREED_COOL_AFTER.herb)
                : a.kind === PRED ? BREED_COOL_AFTER.pred : BREED_COOL_AFTER.herb;
              bred = true;
            }
            const baby = this.makeAgent(spot.x, spot.y, a.kind, a);
            baby.energy = a.energy;
            baby.cool = a.cool;
            if (!this.inheritSpeciesTrait(baby, a)) {
              if (baby.kind === HERB) this.tryHerbSpeciesMutation(baby, spot.x, spot.y, a);
              else if (baby.kind === PRED) this.tryPredSpeciesMutation(baby, spot.x, spot.y);
            }
            if (!isKrolDushegub(baby)) this.set(spot.x, spot.y, a.kind);
            babies.push(baby);
            this.awardBirthPoints(baby);
            this.grantArcadeEnergy("animalBirth");
            this.births++;
            this.chime("birth");
          }
        }
      }
    }
    this.agents = this.agents.filter((a) => !a.dead).concat(babies);
  }

  spark(x, y, color) {
    this.fx.push({ x, y, color, t: 1 });
  }

  tickFx() {
    this.fx = this.fx.filter((p) => (p.t -= 0.08) > 0);
  }

  stageEmoji(x, y) {
    const s = this.plantStageAt(x, y);
    if (s === STAGE_GRASS) return "🌱";
    if (s === STAGE_BUSH) return "🌿";
    if (s === STAGE_TREE) return "🌳";
    return "🌱";
  }

  stageName(x, y) {
    const s = this.plantStageAt(x, y);
    if (s === STAGE_GRASS) return "Трава";
    if (s === STAGE_BUSH) return "Куст";
    if (s === STAGE_TREE) return "Дерево";
    return "Растение";
  }
}

window.World = World;
window.LIFE_TYPES = { EMPTY, PLANT, HERB, PRED, WALL, WATER, BEAR, MUSHROOM, STAGE_GRASS, STAGE_BUSH, STAGE_TREE };
window.PLANT_CFG = PLANT_CFG;
window.MUSHROOM_CFG = MUSHROOM_CFG;
window.skillMul = skillMul;
window.KROL_LIFESPAN = KROL_LIFESPAN;
window.KROL_MOVES_PER_TICK = KROL_MOVES_PER_TICK;
window.TRAIT = TRAIT;
window.SPECIES_CFG = SPECIES_CFG;
window.MUT_CHANCE = MUT_CHANCE;
window.ARCADE_STALE_AFTER = ARCADE_STALE_AFTER;
window.ARCADE_LONELY_MAX = ARCADE_LONELY_MAX;
window.ARCADE_NO_HERB_MAX = ARCADE_NO_HERB_MAX;
window.ARCADE_PRED_ONLY_MAX = ARCADE_PRED_ONLY_MAX;
window.SURVIVAL_POINT_INTERVAL = SURVIVAL_POINT_INTERVAL;
window.PLAGUE_FOG_TICKS = PLAGUE_FOG_TICKS;
window.CHAIN_SUSTAIN_GENS = CHAIN_SUSTAIN_GENS;
window.LIFE_BALANCE = typeof LIFE_BALANCE !== "undefined" ? LIFE_BALANCE : BAL;
