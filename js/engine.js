const EMPTY = 0, PLANT = 1, HERB = 2, PRED = 3, WALL = 4, WATER = 5, BEAR = 6;

const STAGE_GRASS = 1;
const STAGE_BUSH = 2;
const STAGE_TREE = 3;

const PLANT_CFG = {
  grassToBush: 10,
  bushToTree: 28,
  treeLife: 75,
  bushSpread: 0.055,
  grassBites: 2,
  bushBites: 4,
  grassEnergy: 3.5,
  bushEnergyPerBite: 0.85,
  treeBitesCow: 10,
  treeBitesElk: 8,
  treeEnergyPerBite: 0.45,
  bushToTreeGrass: 2
};

const DECAY_CFG = {
  herb: { radius: 2, strength: 0.08, ttl: 35 },
  pred: { radius: 4, strength: 0.14, ttl: 55 },
  bear: { radius: 5, strength: 0.16, ttl: 62 }
};

const FERTILIZER_CFG = { ttl: 5, strength: 0.3 };

const TRAIT = {
  KROL: "крол-душегуб",
  KOALA: "коала",
  COW: "корова",
  WOLF: "волк",
  ELK: "лось"
};

const MUT_CHANCE = {
  krol: 0.0025,
  koala: 0.02,
  cow: 0.01,
  wolf: 0.02,
  elk: 0.02
};

const KROL_LIFESPAN = 15;
const KROL_DEATH_SPAWN = 3;
const KROL_MOVES_PER_TICK = 3;
const KROL_SIZE = 2;
const WOLF_SOLITUDE = 10;
const ELK_POOP_INTERVAL = 5;
const SPECIES_CFG = {
  [TRAIT.KOALA]: { energy: 12, drain: 0.28, thresh: 14, vision: 8, hue: 145, litter: 2, moveInterval: 2 },
  [TRAIT.COW]: { energy: 50, drain: 1.2, thresh: 22, vision: 6, hue: 52, litter: 1, moveInterval: 4 },
  [TRAIT.WOLF]: { energy: 14, drain: 0.52, thresh: 15, vision: 12, hue: 220, litter: 1, moveInterval: 1 },
  [TRAIT.ELK]: { energy: 25, drain: 0.32, thresh: 17, vision: 9, hue: 185, litter: 1, moveInterval: 1 },
  [TRAIT.KROL]: { energy: 15, drain: 0.5, thresh: 12, vision: 9, hue: 312, litter: 1, moveInterval: 1, movesPerTick: 3 }
};

const NO_ANIMAL_RENEWAL_GENS = 90;
const ARCADE_STALE_AFTER = 40;
const ARCADE_LONELY_MAX = 120;
const CHAIN_SUSTAIN_GENS = 25;

const SPECIAL_TRAITS = new Set([TRAIT.KROL, TRAIT.KOALA, TRAIT.COW, TRAIT.WOLF, TRAIT.ELK]);

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
    this.sounds = [];
  }

  chime(name, opts = {}) {
    this.sounds.push({ name, ...opts });
  }

  idx(x, y) { return y * this.w + x; }
  inside(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x, y) { return this.inside(x, y) ? this.cells[this.idx(x, y)] : WALL; }
  set(x, y, v) { if (this.inside(x, y)) this.cells[this.idx(x, y)] = v; }

  /** Множитель шанса мутации: 2^(поколение − 1). Поколение 1 — базовый шанс. */
  mutationMultForGen(gen) {
    const g = Math.max(1, gen || 1);
    return Math.pow(2, g - 1);
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
    for (const c of agentFootprint(a)) {
      if (this.get(c.x, c.y) === PLANT) this.clearPlant(c.x, c.y);
      this.set(c.x, c.y, a.kind);
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
      const j = Math.floor(Math.random() * (i + 1));
      [anchors[i], anchors[j]] = [anchors[j], anchors[i]];
    }
    return anchors;
  }

  canPlaceKrolBirthAt(ax, ay, parent, baby) {
    for (const c of krolFootprintAt(ax, ay)) {
      if (!this.inside(c.x, c.y)) return false;
      const t = this.get(c.x, c.y);
      if (t === WALL && !(this.arcade && this.inDish(c.x, c.y))) return false;
      for (const o of this.agents) {
        if (o.dead || o === baby || o === parent) continue;
        if (agentOccupies(o, c.x, c.y) && isKrolDushegub(o)) return false;
      }
    }
    return true;
  }

  krolDevourFootprint(a, exempt = []) {
    const exemptSet = new Set(exempt);
    const footprint = agentFootprint(a);
    let ate = false;

    const victims = [];
    for (const o of this.agents) {
      if (o.dead || o === a || exemptSet.has(o)) continue;
      if (footprint.some((c) => agentOccupies(o, c.x, c.y)) && this.canHunt(a, o)) victims.push(o);
    }
    for (const victim of victims) {
      this.killAgent(victim, a, this.krolHuntGain(victim));
      ate = true;
    }

    for (const c of footprint) {
      if (this.get(c.x, c.y) !== PLANT) continue;
      a.energy += this.plantEnergyRemaining(c.x, c.y);
      this.clearPlant(c.x, c.y);
      this.spark(c.x, c.y, "#ffc14d");
      ate = true;
    }

    if (ate) this.chime(victims.length ? "krol_hunt" : "eat_grass");
    return ate;
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

  canAgentMoveTo(a, x, y) {
    if (isKrolDushegub(a)) {
      for (const c of krolFootprintAt(x, y)) {
        if (!this.inside(c.x, c.y)) return false;
        const t = this.get(c.x, c.y);
        if (t !== EMPTY && !agentOccupies(a, c.x, c.y)) {
          if (!(this.arcade && this.inDish(c.x, c.y) && (t === WATER || t === WALL))) return false;
        }
        const other = this.agentAt(c.x, c.y);
        if (other && other !== a) return false;
      }
      return true;
    }
    if (!this.isWalkable(x, y)) return false;
    const other = this.agentAt(x, y);
    return !other || other === a;
  }

  krolEatRingCells(a) {
    const cells = [];
    for (let dy = -1; dy <= KROL_SIZE; dy++) {
      for (let dx = -1; dx <= KROL_SIZE; dx++) {
        if (dx >= 0 && dx < KROL_SIZE && dy >= 0 && dy < KROL_SIZE) continue;
        const cx = a.x + dx;
        const cy = a.y + dy;
        if (this.inside(cx, cy)) cells.push({ x: cx, y: cy });
      }
    }
    return cells;
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

  krolDevourRing(a) {
    const ring = this.krolEatRingCells(a);
    let ate = false;

    const victims = [];
    for (const o of this.agents) {
      if (o.dead || o === a) continue;
      if (ring.some((c) => agentOccupies(o, c.x, c.y)) && this.canHunt(a, o)) victims.push(o);
    }
    for (const victim of victims) {
      this.killAgent(victim, a, this.krolHuntGain(victim));
      ate = true;
    }

    for (const c of ring) {
      if (this.get(c.x, c.y) !== PLANT) continue;
      a.energy += this.plantEnergyRemaining(c.x, c.y);
      this.clearPlant(c.x, c.y);
      this.spark(c.x, c.y, "#ffc14d");
      ate = true;
    }

    if (ate) this.chime(victims.length ? "krol_hunt" : "eat_grass");
    return ate;
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
      const j = Math.floor(Math.random() * (i + 1));
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
    if (this.get(x, y) !== PLANT) return null;
    const stage = this.plantStageAt(x, y);
    if (stage === STAGE_GRASS || stage === STAGE_BUSH) return { x, y, stage };
    if (stage === STAGE_TREE && (isCow(a) || isElk(a) || isKrolDushegub(a))) return { x, y, stage };
    return null;
  }

  startEating(a, meal) {
    a.eating = { x: meal.x, y: meal.y };
    if (meal.stage === STAGE_TREE && this.plantBites[this.idx(meal.x, meal.y)] <= 0) {
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
    if (t === EMPTY) return true;
    if (this.arcade && this.inDish(x, y) && (t === WATER || t === WALL)) return true;
    return false;
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

  plantRenewalMul() {
    if (this.hasAnimals()) return 1;
    return Math.max(0, 1 - this.noAnimalGens / NO_ANIMAL_RENEWAL_GENS);
  }

  checkArcadeEnd(energy, herbCost) {
    if (!this.arcade || this.gameOver) return;
    const broke = energy < herbCost;

    if (this.noHerbGens >= ARCADE_LONELY_MAX) {
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
    return 1 + this.fertilizerBoost(x, y);
  }

  distCheb(ax, ay, bx, by) {
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
  }

  distMan(ax, ay, bx, by) {
    return Math.abs(ax - bx) + Math.abs(ay - by);
  }

  perceive(agent) {
    const range = agent.vision || 7;
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

        if (this.get(nx, ny) === PLANT) {
          const stage = this.plantStageAt(nx, ny);
          if (stage === STAGE_GRASS || stage === STAGE_BUSH) {
            food.push({ x: nx, y: ny, stage, dist: cheb, man });
          } else if (stage === STAGE_TREE && (isCow(agent) || isElk(agent) || isKrolDushegub(agent))) {
            food.push({ x: nx, y: ny, stage, dist: cheb, man });
          }
        }

        if (this.isWalkable(nx, ny)) exits.push({ x: nx, y: ny, dist: cheb });
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

    food.sort((a, b) => a.man - b.man);
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

  findNearestEdible(x, y, range, metric = "scout", eater = null) {
    const distAt = metric === "touch"
      ? (dx, dy) => Math.max(Math.abs(dx), Math.abs(dy))
      : (dx, dy) => Math.abs(dx) + Math.abs(dy);
    let bestGrass = null, bestGrassD = 99;
    let bestBush = null, bestBushD = 99;
    let bestTree = null, bestTreeD = 99;
    const canEatTree = eater && (isCow(eater) || isElk(eater) || isKrolDushegub(eater));
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
      const d = dirs[Math.floor(Math.random() * 4)];
      return { x: ax + d[0], y: ay + d[1] };
    }
    if (Math.abs(dx) >= Math.abs(dy)) return { x: ax + Math.sign(dx), y: ay };
    return { x: ax, y: ay + Math.sign(dy) };
  }

  moveAgentTo(a, x, y) {
    this.clearAgentCells(a);
    a.x = x;
    a.y = y;
    this.occupyAgentCells(a);
    if (isElk(a)) a.stepsSincePoop = (a.stepsSincePoop || 0) + 1;
  }

  wanderAgent(a) {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
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
    const step = this.stepAway(a.x, a.y, tx, ty);
    if (step && this.canAgentMoveTo(a, step.x, step.y)) {
      this.moveAgentTo(a, step.x, step.y);
      return true;
    }
    return this.wanderAgent(a);
  }

  moveTowardTarget(a, tx, ty) {
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

  wanderBiasChance() {
    return 0.35;
  }

  shouldMoveThisTick(a) {
    const interval = a.moveInterval || 1;
    a.movePhase = (a.movePhase || 0) + 1;
    return a.movePhase % interval === 0;
  }

  stepSated(a) {
    if (isKrolDushegub(a)) {
      this.feedKrolDushegub(a);
      return;
    }
    if (a.kind === BEAR) {
      if (Math.random() < 0.15) this.wanderAgent(a);
      return;
    }
    if (isWolf(a)) {
      const other = this.nearestWolf(a.x, a.y, a);
      if (other && this.distMan(a.x, a.y, other.x, other.y) <= WOLF_SOLITUDE) {
        this.fleeFrom(a, other.x, other.y);
        return;
      }
    }
    if (!this.shouldMoveThisTick(a)) return;
    if (Math.random() >= this.wanderBiasChance()) return;
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
    if (this.krolDevourRing(a)) return;

    for (let m = 0; m < KROL_MOVES_PER_TICK; m++) {
      if (this.krolDevourRing(a)) return;

      const aware = this.perceive(a);
      const nearbyPrey = aware.prey.filter((p) => p.dist <= 1.5);
      if (nearbyPrey.length) {
        this.nudgeToward(a, nearbyPrey[0].x, nearbyPrey[0].y);
        if (this.krolDevourRing(a)) return;
        continue;
      }

      const food = this.krolSortFood(aware.food);
      if (food.length) {
        this.nudgeToward(a, food[0].x, food[0].y);
        if (this.krolDevourRing(a)) return;
        continue;
      }

      this.wanderAgent(a);
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

  feedHungryHerb(a) {
    if (isKrolDushegub(a)) {
      this.feedKrolDushegub(a);
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
      this.eatPlant(a, continuing);
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
      this.eatPlant(a, continuing);
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
      this.eatPlant(a, continuing);
      return;
    }
    if (a.eating) a.eating = null;

    if (aware.touchFood) {
      this.startEating(a, aware.touchFood);
      return;
    }

    const prey = this.findNearestAgent(a.x, a.y, a.vision || 5, preyKinds, a);
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

  findNeighbor(x, y, type) {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
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

  paint(x, y, brush) {
    if (!this.inside(x, y)) return false;
    if (this.get(x, y) === WALL && brush !== "erase") {
      if (this.dish && !this.inDish(x, y)) return false;
    }
    this.removeAgentAt(x, y);
    if (brush === "erase") {
      if (this.dish && !this.inDish(x, y)) return false;
      this.clearPlant(x, y);
      this.set(x, y, EMPTY);
      return true;
    }
    if (brush === "plant") {
      if (this.get(x, y) !== EMPTY) return false;
      this.setPlant(x, y, STAGE_GRASS, 0);
      return true;
    }
    if (brush === "water" || brush === "wall") {
      if (this.arcade) return false;
    }
    if (brush === "water") {
      this.clearPlant(x, y);
      this.set(x, y, WATER);
      return true;
    }
    if (brush === "wall") {
      this.clearPlant(x, y);
      this.set(x, y, WALL);
      return true;
    }
    if (brush === "herb" || brush === "pred" || brush === "bear") {
      if (this.get(x, y) !== EMPTY) return false;
      const kind = brush === "herb" ? HERB : brush === "pred" ? PRED : BEAR;
      this.set(x, y, kind);
      this.agents.push(this.makeAgent(x, y, kind));
      return true;
    }
    return false;
  }

  defaultsFor(kind) {
    if (kind === BEAR) {
      return { energy: 22, hue: 28 + Math.random() * 16, vision: 5, drain: 0.36, thresh: 19, moveInterval: 1 };
    }
    return kind === PRED
      ? { energy: 10, hue: 350 + Math.random() * 20, vision: 10, drain: 0.48, thresh: 14, moveInterval: 1 }
      : { energy: 8, hue: 38 + Math.random() * 22, vision: 7, drain: 0.4, thresh: 13, moveInterval: 1 };
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
      bornGen: null,
      cool: 0,
      dead: false,
      eating: null,
      moveInterval: parent ? (parent.moveInterval || 1) : d.moveInterval,
      movePhase: 0,
      stepsSincePoop: 0
    };
    return agent;
  }

  applySpeciesTrait(baby, trait, x, y, parent = null) {
    const cfg = SPECIES_CFG[trait];
    if (!cfg) return false;
    baby.trait = trait;
    baby.energy = cfg.energy;
    baby.drain = cfg.drain;
    baby.thresh = cfg.thresh;
    baby.vision = cfg.vision;
    baby.hue = cfg.hue + Math.random() * 8;
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

  grantMutationEnergy(trait) {
    if (!this.arcade || !trait) return 0;
    const table = (typeof LIFE_DATA !== "undefined" && LIFE_DATA.mutationEnergy) || {};
    const gain = table[trait] ?? 5;
    this.pendingEnergy += gain;
    return gain;
  }

  grantEvolutionEnergy() {
    if (!this.arcade) return 0;
    const gain = (typeof LIFE_DATA !== "undefined" && LIFE_DATA.plantEvolutionEnergy) ?? 1;
    this.pendingEnergy += gain;
    return gain;
  }

  tryHerbSpeciesMutation(baby, x, y, parent = null) {
    if (baby.kind !== HERB) return false;
    const roll = Math.random();
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
    const roll = Math.random();
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
    return { grass, bush, tree, plants, herbs, preds, bears, water, walls, total: plants + herbs + preds + bears };
  }

  analytics() {
    const c = this.counts();
    const herbSat = this.satietyOf(HERB);
    const predSat = this.satietyOf(PRED);
    const edible = c.grass + c.bush * 0.5;
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
    this.lastMutation = null;
    this.pendingEnergy = 0;
    this.sounds = [];
    this.tickAnimalMetrics();
    this.tickDecays();
    this.tickFertilizers();
    this.growPlants();
    this.stepAgents();
    this.generation++;
    if (this.arcade && !this.isAlive() && !this.sustainedChain) this.gameOver = true;
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

  addFertilizer(x, y) {
    this.fertilizers.push({
      x, y,
      ttl: FERTILIZER_CFG.ttl,
      strength: FERTILIZER_CFG.strength
    });
    this.fx.push({ x, y, color: "#8b6914", t: 1.4, fert: true });
    this.chime("fertilize");
  }

  addDecay(x, y, kind) {
    const cfg = kind === BEAR ? DECAY_CFG.bear : kind === PRED ? DECAY_CFG.pred : DECAY_CFG.herb;
    const color = kind === BEAR ? "#a88458" : kind === PRED ? "#c8a86a" : "#8abf6a";
    this.decays.push({ x, y, radius: cfg.radius, strength: cfg.strength, ttl: cfg.ttl, kind, pulse: 0 });
    this.fx.push({ x, y, color, t: 1.2, bone: true });
  }

  trySpawnGrass(x, y, baseChance) {
    if (this.get(x, y) !== EMPTY) return false;
    const wet = !this.arcade && this.countType(x, y, WATER);
    const boost = this.decayBoost(x, y);
    const fert = this.fertilizerBoost(x, y);
    let p = baseChance * (1 + fert) + boost;
    if (wet) p += 0.03;
    if (Math.random() >= p) return false;
    this.setPlant(x, y, STAGE_GRASS, 0);
    this.births++;
    this.spark(x, y, "#5dff8a");
    this.chime("sprout");
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
        } else if (stage === STAGE_BUSH) {
          if (this.plantAge[i] >= PLANT_CFG.bushToTree) {
            this.setPlant(x, y, STAGE_TREE, 0);
            this.spawnGrassAround(x, y, PLANT_CFG.bushToTreeGrass);
            this.grantEvolutionEnergy();
            this.spark(x, y, "#2a9e50");
            this.chime("evolve_tree");
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
        }
      }
    }
  }

  seekHerb(a) {
    const target = this.findNearestEdible(a.x, a.y, a.vision || 7, "scout", a);
    if (!target) {
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const d = dirs[Math.floor(Math.random() * 4)];
      return { x: d[0], y: d[1] };
    }
    const step = this.stepToward(a.x, a.y, target.x, target.y);
    if (!step) return { x: 0, y: 0 };
    return { x: step.x - a.x, y: step.y - a.y };
  }

  seekPred(a) {
    const target = this.findNearestPrey(a.x, a.y, a.vision || 10, a);
    if (!target) {
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const d = dirs[Math.floor(Math.random() * 4)];
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
      this.plantBites[i]--;
      a.energy += perBite * mult;
      if (this.plantBites[i] <= 0) {
        this.clearPlant(meal.x, meal.y);
        a.eating = null;
      } else if (a.energy >= a.thresh && !isKrolDushegub(a)) {
        a.eating = null;
      }
      this.chime(stage === STAGE_GRASS ? "eat_grass" : "eat_bush");
    } else if (stage === STAGE_TREE && (isCow(a) || isElk(a) || isKrolDushegub(a))) {
      this.plantBites[i]--;
      a.energy += PLANT_CFG.treeEnergyPerBite * (isKrolDushegub(a) ? 1.2 : 1);
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
      this.births++;
      this.chime("birth");
    }
  }

  killAgent(victim, killer, energyGain) {
    const gain = energyGain ?? 7.2;
    this.clearAgentCells(victim);
    victim.dead = true;
    this.deaths++;
    this.addDecay(victim.x, victim.y, victim.kind);
    killer.energy += gain;
    this.spark(killer.x + (isKrolDushegub(killer) ? 1 : 0), killer.y + (isKrolDushegub(killer) ? 1 : 0), "#ff5d7a");
    if (isKrolDushegub(killer)) {
      this.chime("krol_hunt");
    } else if (killer.kind === BEAR) {
      this.chime("bear_hunt");
    } else {
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
    if (isKoala(a)) return 2;
    if (isCow(a)) return 1;
    return 1;
  }

  stepAgents() {
    const order = this.agents.filter((a) => !a.dead);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const babies = [];
    const c = this.counts();

    for (const a of order) {
      if (a.dead) continue;

      if (isKrolDushegub(a) && a.bornGen != null && this.generation - a.bornGen >= KROL_LIFESPAN) {
        this.dieAgent(a, "krol_burnout");
        continue;
      }

      if (isElk(a) && (a.stepsSincePoop || 0) >= ELK_POOP_INTERVAL) {
        this.addFertilizer(a.x, a.y);
        a.stepsSincePoop = 0;
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

      if (a.kind !== BEAR && !isElk(a) && !isKrolDushegub(a) && a.energy >= a.thresh && a.cool <= 0) {
        let breedChance = 1;
        if (a.kind === HERB && c.herbs > 0) {
          const edible = c.grass + c.bush * 0.6;
          if (c.herbs > edible * 0.85) breedChance = 0.25;
          else if (c.herbs > edible * 0.55) breedChance = 0.55;
        }
        if (Math.random() < breedChance) {
          const litter = this.litterSize(a);
          let bred = false;
          for (let n = 0; n < litter; n++) {
            const spot = this.findNeighbor(a.x, a.y, EMPTY);
            if (!spot) break;
            if (!bred) {
              a.energy *= 0.5;
              a.cool = a.kind === PRED ? 24 : 36;
              bred = true;
            }
            const baby = this.makeAgent(spot.x, spot.y, a.kind, a);
            baby.energy = a.energy;
            baby.cool = a.cool;
            if (baby.kind === HERB) this.tryHerbSpeciesMutation(baby, spot.x, spot.y, a);
            else if (baby.kind === PRED) this.tryPredSpeciesMutation(baby, spot.x, spot.y);
            if (!isKrolDushegub(baby)) this.set(spot.x, spot.y, a.kind);
            babies.push(baby);
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
window.LIFE_TYPES = { EMPTY, PLANT, HERB, PRED, WALL, WATER, BEAR, STAGE_GRASS, STAGE_BUSH, STAGE_TREE };
window.PLANT_CFG = PLANT_CFG;
window.KROL_LIFESPAN = KROL_LIFESPAN;
window.KROL_SIZE = KROL_SIZE;
window.TRAIT = TRAIT;
window.SPECIES_CFG = SPECIES_CFG;
window.MUT_CHANCE = MUT_CHANCE;
window.ARCADE_STALE_AFTER = ARCADE_STALE_AFTER;
window.ARCADE_LONELY_MAX = ARCADE_LONELY_MAX;
window.CHAIN_SUSTAIN_GENS = CHAIN_SUSTAIN_GENS;
