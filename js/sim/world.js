var World = class World {
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
    this.chainLockGen = null;
    this.pulseAcc = 0;
    this.pendingEnergy = 0;
    this.lifePoints = 0;
    this.arcadeBudget = null;
    this.playerEnergy = null;
    this.discoveredTraits = new Set();
    this.energyAudit = emptyEnergyAudit();
    this.energyAuditTick = emptyEnergyAudit();
    this.economyLog = [];
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

  idx(x, y) { return y * this.w + x;   }

  inside(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h;   }

  get(x, y) { return this.inside(x, y) ? this.cells[this.idx(x, y)] : WALL;   }

  set(x, y, v) { if (this.inside(x, y)) this.cells[this.idx(x, y)] = v;   }

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
    w.chainLockGen = this.chainLockGen;
    w.pulseAcc = this.pulseAcc;
    w.pendingEnergy = this.pendingEnergy;
    w.lifePoints = this.lifePoints;
    w.arcadeBudget = this.arcadeBudget;
    w.playerEnergy = this.playerEnergy;
    w.discoveredTraits = new Set(this.discoveredTraits || []);
    w.energyAudit = { ...(this.energyAudit || emptyEnergyAudit()) };
    w.energyAuditTick = { ...(this.energyAuditTick || emptyEnergyAudit()) };
    w.economyLog = Array.isArray(this.economyLog) ? this.economyLog.map((s) => ({ ...s })) : [];
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
      note = "Зайцам мало травы и кустов. Кусты ест корова, деревья — лось и коала.";
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
    this.energyAuditTick = emptyEnergyAudit();
    this.sounds = [];
    this.tickAnimalMetrics();
    this.tickDecays();
    this.tickFertilizers();
    this.growPlants();
    this.stepAgents();
    this.generation++;
    this.tickSurvivalPoints();
    this.settleArcadeEconomy();
    if (this.plagueFogTicks > 0) this.plagueFogTicks--;
    if (this.screenShake > 0) this.screenShake--;
    if (this.arcade && this.generation > 0 && this.generation % ROULETTE_INTERVAL === 0) {
      this.roulettePending = true;
    }
    if (this.arcade && !this.isAlive() && !this.sustainedChain) this.gameOver = true;
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
      if (this.arcade) {
        const gate = this.arcadeToolGate(brush);
        if (!gate.ok) return false;
      }
      if (!this.canPlaceAnimalAt(x, y)) return false;
      const kind = brush === "herb" ? HERB : brush === "pred" ? PRED : BEAR;
      this.set(x, y, kind);
      const agent = this.makeAgent(x, y, kind);
      this.agents.push(agent);
      return true;
    }
    return false;
    }

  canPlaceAnimalAt(x, y) {
    if (!this.inside(x, y)) return false;
    if (this.agentAt(x, y)) return false;
    if (this.get(x, y) !== EMPTY) return false;
    return true;
    }

  removeAgentAt(x, y) {
    for (const a of this.agents) {
      if (!a.dead && agentOccupies(a, x, y)) a.dead = true;
    }
    this.agents = this.agents.filter((a) => !a.dead);
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
}

