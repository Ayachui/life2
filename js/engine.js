const EMPTY = 0, PLANT = 1, HERB = 2, PRED = 3, WALL = 4, WATER = 5, BEAR = 6;

const STAGE_GRASS = 1;
const STAGE_BUSH = 2;
const STAGE_TREE = 3;

const PLANT_CFG = {
  grassToBush: 10,
  bushToTree: 28,
  treeLife: 75,
  bushSpread: 0.04,
  grassBites: 2,
  bushBites: 4,
  grassEnergy: 3.5,
  bushEnergyPerBite: 0.85
};

const DECAY_CFG = {
  herb: { radius: 2, strength: 0.08, ttl: 35 },
  pred: { radius: 4, strength: 0.14, ttl: 55 },
  bear: { radius: 5, strength: 0.16, ttl: 62 }
};

const KROL_CHANCE = 0.03;
const KROL_LIFESPAN = 52;
const KROL_LITTER = 3;
const KROL_TRAIT = "крол-душегуб";

function isKrolDushegub(a) {
  return !!a && a.kind === HERB && a.trait === KROL_TRAIT;
}

const NO_ANIMAL_RENEWAL_GENS = 90;
const ARCADE_STALE_AFTER = 40;
const ARCADE_LONELY_MAX = 120;
const CHAIN_SUSTAIN_GENS = 25;

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
    this.generation = 0;
    this.births = 0;
    this.deaths = 0;
    this.mutations = 0;
    this.dish = null;
    this.mutateRate = 0.18;
    this.fx = [];
    this.mutHerb = 0;
    this.mutPred = 0;
    this.lastMutation = null;
    this.gameOver = false;
    this.gameOverReason = null;
    this.arcade = false;
    this.noAnimalGens = 0;
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

  mealFromEating(a) {
    if (!a.eating) return null;
    const { x, y } = a.eating;
    if (this.get(x, y) !== PLANT) return null;
    const stage = this.plantStageAt(x, y);
    if (stage !== STAGE_GRASS && stage !== STAGE_BUSH) return null;
    return { x, y, stage };
  }

  startEating(a, meal) {
    a.eating = { x: meal.x, y: meal.y };
    this.eatPlant(a, meal);
  }

  plantStageAt(x, y) {
    if (!this.inside(x, y) || this.get(x, y) !== PLANT) return 0;
    return this.plantStage[this.idx(x, y)];
  }

  makeDish() {
    const cx = (this.w - 1) / 2;
    const cy = (this.h - 1) / 2;
    const r = Math.min(this.w, this.h) / 2 - 1.2;
    this.dish = { cx, cy, r };
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (Math.hypot(x - cx, y - cy) > r) this.set(x, y, WALL);
      }
    }
  }

  inDish(x, y) {
    if (!this.dish) return this.inside(x, y);
    return Math.hypot(x - this.dish.cx, y - this.dish.cy) <= this.dish.r;
  }

  clone() {
    const w = new World(this.w, this.h);
    w.cells.set(this.cells);
    w.plantStage.set(this.plantStage);
    w.plantAge.set(this.plantAge);
    w.plantBites.set(this.plantBites);
    w.agents = this.agents.map((a) => ({ ...a }));
    w.decays = this.decays.map((d) => ({ ...d }));
    w.dish = this.dish ? { ...this.dish } : null;
    w.mutateRate = this.mutateRate;
    w.mutHerb = this.mutHerb;
    w.mutPred = this.mutPred;
    w.generation = this.generation;
    w.gameOver = this.gameOver;
    w.gameOverReason = this.gameOverReason;
    w.arcade = this.arcade;
    w.noAnimalGens = this.noAnimalGens;
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
    if (this.hasAnimals()) {
      if (herbs > 0) {
        this.herbStreak++;
        if (this.herbStreak >= CHAIN_SUSTAIN_GENS) this.sustainedChain = true;
      } else {
        this.herbStreak = 0;
      }
      this.noAnimalGens = 0;
    } else {
      this.herbStreak = 0;
      this.noAnimalGens++;
      this.lonelyGens++;
    }
  }

  plantRenewalMul() {
    if (this.hasAnimals()) return 1;
    return Math.max(0, 1 - this.noAnimalGens / NO_ANIMAL_RENEWAL_GENS);
  }

  checkArcadeEnd(energy, herbCost) {
    if (!this.arcade || this.gameOver || this.sustainedChain) return;
    if (this.hasAnimals()) return;
    const broke = energy < herbCost;
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

  findNearestEdible(x, y, range, metric = "scout") {
    const distAt = metric === "touch"
      ? (dx, dy) => Math.max(Math.abs(dx), Math.abs(dy))
      : (dx, dy) => Math.abs(dx) + Math.abs(dy);
    let bestGrass = null, bestGrassD = 99;
    let bestBush = null, bestBushD = 99;
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
        }
      }
    }
    return bestGrass || bestBush;
  }

  preyPriority(hunter, prey, px, py) {
    const d = Math.abs(prey.x - px) + Math.abs(prey.y - py);
    let score = d;
    if (prey.energy < prey.thresh) score -= 0.35;
    if (prey.trait === "близорукий") score -= 0.25;
    if (prey.trait === "экономный") score -= 0.15;
    if (hunter.trait === "прожорливый") score -= 0.2;
    return score;
  }

  findNearestPrey(x, y, range, hunter, metric = "scout") {
    return this.findNearestAgent(x, y, range, [HERB], hunter, metric);
  }

  findNearestAgent(x, y, range, kinds, hunter, metric = "scout") {
    const distAt = metric === "touch"
      ? (dx, dy) => Math.max(Math.abs(dx), Math.abs(dy))
      : (dx, dy) => Math.abs(dx) + Math.abs(dy);
    let best = null, bestScore = 99;
    for (const o of this.agents) {
      if (o.dead || !kinds.includes(o.kind)) continue;
      if (hunter?.kind === PRED && isKrolDushegub(o)) continue;
      const dx = o.x - x;
      const dy = o.y - y;
      const dist = distAt(dx, dy);
      if (dist > range || dist === 0) continue;
      let score = dist;
      if (hunter?.kind === PRED) score = this.preyPriority(hunter, o, x, y);
      else if (hunter?.kind === BEAR) {
        if (o.kind === PRED) score -= 0.45;
        if (o.energy < o.thresh) score -= 0.2;
      } else if (hunter?.trait === "крол-душегуб" && o.kind === PRED) {
        score -= 0.15;
      }
      if (score < bestScore) {
        bestScore = score;
        best = o;
      }
    }
    return best ? { x: best.x, y: best.y } : null;
  }

  stepToward(ax, ay, tx, ty) {
    const dx = tx - ax;
    const dy = ty - ay;
    if (!dx && !dy) return null;
    if (Math.abs(dx) >= Math.abs(dy)) return { x: ax + Math.sign(dx), y: ay };
    return { x: ax, y: ay + Math.sign(dy) };
  }

  moveAgentTo(a, x, y) {
    this.set(a.x, a.y, EMPTY);
    a.x = x;
    a.y = y;
    this.set(a.x, a.y, a.kind);
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
      if (this.get(nx, ny) === EMPTY) {
        this.moveAgentTo(a, nx, ny);
        return true;
      }
    }
    return false;
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
      if (this.get(step.x, step.y) === EMPTY) {
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
    if (a.trait === "прожорливый") return 0.52;
    if (a.trait === "экономный") return 0.22;
    return 0.35;
  }

  stepSated(a) {
    if (a.kind === BEAR) {
      if (Math.random() < 0.15) this.wanderAgent(a);
      return;
    }
    if (Math.random() >= this.wanderBiasChance(a)) return;
    const dir = a.kind === HERB ? this.seekHerb(a) : this.seekPred(a);
    const nx = a.x + dir.x;
    const ny = a.y + dir.y;
    if (this.get(nx, ny) === EMPTY) this.moveAgentTo(a, nx, ny);
    else this.wanderAgent(a);
  }

  canHunt(killer, victim) {
    if (killer.kind === PRED) return victim.kind === HERB && !isKrolDushegub(victim);
    if (killer.kind === BEAR) return victim.kind === HERB || victim.kind === PRED;
    if (isKrolDushegub(killer)) return victim.kind === PRED;
    return false;
  }

  pounceVictim(killer, spot, energyGain = 7.2) {
    const victim = this.agentAt(spot.x, spot.y);
    if (!victim || victim.dead || !this.canHunt(killer, victim)) return false;
    this.moveAgentTo(killer, spot.x, spot.y);
    this.killAgent(victim, killer, energyGain);
    return true;
  }

  pouncePrey(a, spot) {
    return this.pounceVictim(a, spot, 7.2);
  }

  feedHungryHerb(a) {
    const isKrol = a.trait === "крол-душегуб";

    if (isKrol) {
      const foxTouch = this.findNearestAgent(a.x, a.y, 1, [PRED], a, "touch");
      if (foxTouch && this.pounceVictim(a, foxTouch, 8.5)) return;
    }

    const continuing = this.mealFromEating(a);
    if (continuing) {
      this.eatPlant(a, continuing);
      return;
    }
    if (a.eating) a.eating = null;

    const touch = this.findNearestEdible(a.x, a.y, 1, "touch");
    if (touch) {
      this.startEating(a, touch);
      return;
    }

    const target = this.findNearestEdible(a.x, a.y, a.vision || 7);
    if (target) {
      this.nudgeToward(a, target.x, target.y);
      const after = this.findNearestEdible(a.x, a.y, 1, "touch");
      if (after) this.startEating(a, after);
      return;
    }

    if (isKrol) {
      const fox = this.findNearestAgent(a.x, a.y, a.vision || 8, [PRED], a);
      if (fox) {
        this.nudgeToward(a, fox.x, fox.y);
        const adj = this.findNearestAgent(a.x, a.y, 1, [PRED], a, "touch");
        if (adj) this.pounceVictim(a, adj, 8.5);
        return;
      }
    }

    this.wanderAgent(a);
  }

  feedHungryBear(a) {
    const preyKinds = [HERB, PRED];
    const touchPrey = this.findNearestAgent(a.x, a.y, 1, preyKinds, a, "touch");
    if (touchPrey) {
      const victim = this.agentAt(touchPrey.x, touchPrey.y);
      const gain = victim?.kind === PRED ? 9.5 : 6.5;
      if (this.pounceVictim(a, touchPrey, gain)) return;
    }

    const continuing = this.mealFromEating(a);
    if (continuing) {
      this.eatPlant(a, continuing);
      return;
    }
    if (a.eating) a.eating = null;

    const touch = this.findNearestEdible(a.x, a.y, 1, "touch");
    if (touch) {
      this.startEating(a, touch);
      return;
    }

    const prey = this.findNearestAgent(a.x, a.y, a.vision || 5, preyKinds, a);
    if (prey) {
      this.nudgeToward(a, prey.x, prey.y);
      const adj = this.findNearestAgent(a.x, a.y, 1, preyKinds, a, "touch");
      if (adj) {
        const victim = this.agentAt(adj.x, adj.y);
        const gain = victim?.kind === PRED ? 9.5 : 6.5;
        this.pounceVictim(a, adj, gain);
      }
      return;
    }

    const plant = this.findNearestEdible(a.x, a.y, a.vision || 5);
    if (plant) {
      this.nudgeToward(a, plant.x, plant.y);
      const after = this.findNearestEdible(a.x, a.y, 1, "touch");
      if (after) this.startEating(a, after);
      return;
    }

    this.wanderAgent(a);
  }

  feedHungryPred(a) {
    const touch = this.findNearestPrey(a.x, a.y, 1, a, "touch");
    if (touch) {
      this.pouncePrey(a, touch);
      return;
    }

    const target = this.findNearestPrey(a.x, a.y, a.vision || 10, a);
    if (!target) {
      this.wanderAgent(a);
      return;
    }

    this.nudgeToward(a, target.x, target.y);
    const adj = this.findNearestPrey(a.x, a.y, 1, a, "touch");
    if (adj) this.pouncePrey(a, adj);
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
      if (!a.dead && a.x === x && a.y === y) a.dead = true;
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
      return { energy: 22, hue: 28 + Math.random() * 16, vision: 5, drain: 0.36, thresh: 19 };
    }
    return kind === PRED
      ? { energy: 10, hue: 350 + Math.random() * 20, vision: 10, drain: 0.48, thresh: 14 }
      : { energy: 8, hue: 38 + Math.random() * 22, vision: 7, drain: 0.4, thresh: 13 };
  }

  makeAgent(x, y, kind, parent) {
    const d = this.defaultsFor(kind);
    return {
      x, y, kind,
      energy: parent ? parent.energy : d.energy,
      hue: parent ? parent.hue : d.hue,
      vision: parent ? parent.vision : d.vision,
      drain: parent ? parent.drain : d.drain,
      thresh: parent ? parent.thresh : d.thresh,
      trait: parent && parent.trait && parent.trait !== "крол-душегуб" ? parent.trait : null,
      mutated: false,
      gen: parent ? parent.gen + 1 : 0,
      bornGen: null,
      cool: 0,
      dead: false,
      eating: null
    };
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

  tryKrolDushegub(baby, x, y) {
    if (baby.kind !== HERB || Math.random() >= KROL_CHANCE) return false;
    baby.trait = "крол-душегуб";
    baby.vision = Math.max(baby.vision, 8);
    baby.drain = Math.min(0.72, baby.drain * 1.12);
    baby.thresh = Math.max(9, baby.thresh - 1);
    baby.hue = 312;
    baby.bornGen = this.generation;
    baby.mutated = true;
    this.mutations++;
    this.mutHerb++;
    const energy = this.grantMutationEnergy("крол-душегуб");
    this.lastMutation = { kind: HERB, trait: "крол-душегуб", special: true, x, y, energy };
    this.fx.push({ x, y, color: "#e040fb", t: 2.4, krol: true });
    this.spark(x, y, "#ff3dff");
    this.spark(x, y, "#ffffff");
    this.chime("krol_dushegub");
    return true;
  }

  applyMutation(baby, parent) {
    if (baby.trait === "крол-душегуб") return false;
    if (Math.random() >= this.mutateRate) return false;
    const roll = Math.random();
    if (roll < 0.34) {
      const up = Math.random() < 0.55;
      baby.vision = Math.max(4, Math.min(12, parent.vision + (up ? 2 : -2)));
      baby.trait = up ? "зоркий" : "близорукий";
      baby.hue = (parent.hue + (up ? 42 : -28) + 360) % 360;
    } else if (roll < 0.67) {
      baby.drain = Math.max(0.18, Math.min(0.85, parent.drain * 1.3));
      baby.thresh = Math.max(8, parent.thresh - 1);
      baby.trait = "прожорливый";
      baby.hue = (parent.hue + 330) % 360;
    } else {
      baby.drain = Math.max(0.16, parent.drain * 0.7);
      baby.trait = "экономный";
      baby.hue = (parent.hue + 28) % 360;
    }
    baby.mutated = true;
    this.mutations++;
    if (baby.kind === HERB) this.mutHerb++;
    else this.mutPred++;
    const energy = this.grantMutationEnergy(baby.trait);
    this.lastMutation = { kind: baby.kind, trait: baby.trait, gen: this.generation, energy };
    this.chime("mutate");
    return true;
  }

  agentAt(x, y) {
    return this.agents.find((a) => !a.dead && a.x === x && a.y === y) || null;
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
      note = "Зайцам мало травы и кустов. Деревья они не едят.";
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
    this.growPlants();
    this.stepAgents();
    this.generation++;
    if (!this.isAlive() && !this.sustainedChain) this.gameOver = true;
  }

  tickDecays() {
    this.decays = this.decays.filter((d) => {
      d.ttl--;
      d.pulse = (d.pulse || 0) + 0.15;
      return d.ttl > 0;
    });
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
    let p = baseChance + boost;
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
        this.plantAge[i]++;

        if (stage === STAGE_GRASS && this.plantAge[i] >= PLANT_CFG.grassToBush) {
          this.setPlant(x, y, STAGE_BUSH, 0);
          this.spark(x, y, "#46d070");
          this.chime("evolve_bush");
        } else if (stage === STAGE_BUSH) {
          if (this.plantAge[i] >= PLANT_CFG.bushToTree) {
            this.setPlant(x, y, STAGE_TREE, 0);
            this.grantEvolutionEnergy();
            this.spark(x, y, "#2a9e50");
            this.chime("evolve_tree");
          } else {
            const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
            for (const [dx, dy] of dirs) {
              if (decaySpawned) break;
              const boost = this.decayBoost(x + dx, y + dy);
              if (boost > 0 && !decaySpawned) {
                decaySpawned = this.trySpawnGrass(x + dx, y + dy, PLANT_CFG.bushSpread * 0.5 * renew) || decaySpawned;
              } else {
                this.trySpawnGrass(x + dx, y + dy, PLANT_CFG.bushSpread * renew);
              }
            }
          }
        } else if (stage === STAGE_TREE && this.plantAge[i] >= PLANT_CFG.treeLife) {
          this.clearPlant(x, y);
          this.chime("wilt");
        }
      }
    }
  }

  seekHerb(a) {
    const target = this.findNearestEdible(a.x, a.y, a.vision || 7);
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
    const mult = a.kind === BEAR ? 0.82 : 1;
    if (stage === STAGE_GRASS || stage === STAGE_BUSH) {
      const perBite = stage === STAGE_GRASS
        ? PLANT_CFG.grassEnergy / PLANT_CFG.grassBites
        : PLANT_CFG.bushEnergyPerBite;
      this.plantBites[i]--;
      a.energy += perBite * mult;
      if (this.plantBites[i] <= 0) {
        this.clearPlant(meal.x, meal.y);
        a.eating = null;
      } else if (a.energy >= a.thresh) {
        a.eating = null;
      }
      this.chime(stage === STAGE_GRASS ? "eat_grass" : "eat_bush");
    }
    this.spark(meal.x, meal.y, "#ffc14d");
  }

  killAgent(victim, killer, energyGain) {
    const gain = energyGain ?? 7.2;
    this.set(victim.x, victim.y, EMPTY);
    victim.dead = true;
    this.deaths++;
    this.addDecay(victim.x, victim.y, victim.kind);
    killer.energy += gain;
    this.spark(killer.x, killer.y, "#ff5d7a");
    if (killer.trait === "крол-душегуб" && victim.kind === PRED) {
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
    a.dead = true;
    this.set(a.x, a.y, EMPTY);
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

      if (a.trait === "крол-душегуб" && a.bornGen != null && this.generation - a.bornGen >= KROL_LIFESPAN) {
        this.dieAgent(a, "krol_burnout");
        continue;
      }

      a.energy -= a.drain;
      if (a.cool > 0) a.cool--;

      if (a.energy <= 0) {
        this.dieAgent(a);
        continue;
      }

      const hungry = a.energy < a.thresh;

      if (a.kind === HERB && hungry) {
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

      if (a.kind !== BEAR && a.energy >= a.thresh && a.cool <= 0) {
        let breedChance = 1;
        if (a.kind === HERB && c.herbs > 0) {
          const edible = c.grass + c.bush * 0.6;
          if (c.herbs > edible * 0.85) breedChance = 0.25;
          else if (c.herbs > edible * 0.55) breedChance = 0.55;
        }
        if (Math.random() < breedChance) {
          const litter = a.trait === "крол-душегуб" ? KROL_LITTER : 1;
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
            if (baby.kind === HERB) {
              if (!this.tryKrolDushegub(baby, spot.x, spot.y)) this.applyMutation(baby, a);
            } else {
              this.applyMutation(baby, a);
            }
            this.set(spot.x, spot.y, a.kind);
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
window.ARCADE_STALE_AFTER = ARCADE_STALE_AFTER;
window.ARCADE_LONELY_MAX = ARCADE_LONELY_MAX;
window.CHAIN_SUSTAIN_GENS = CHAIN_SUSTAIN_GENS;
