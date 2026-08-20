/** Конец раунда и рулетка — tables/arcade.js */
World.prototype.tickAnimalMetrics = function tickAnimalMetrics() {
    const herbs = this.live(HERB).length;
    if (herbs > 0) {
      this.noHerbGens = 0;
      if (this.hasAnimals()) {
        this.herbStreak++;
        if (this.herbStreak >= CHAIN_SUSTAIN_GENS) {
          if (!this.sustainedChain) this.chainLockGen = (this.generation || 0) + 1;
          this.sustainedChain = true;
        }
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
  };

World.prototype.noHerbEndLimit = function noHerbEndLimit() {
    if (this.predatorCount() > 0) return ARCADE_PRED_ONLY_MAX;
    return ARCADE_NO_HERB_MAX;
  };

World.prototype.checkArcadeEnd = function checkArcadeEnd(energy, herbCost) {
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
  };

World.prototype.pickRouletteEvent = function pickRouletteEvent() {
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
  };

World.prototype.shuffleInPlace = function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

World.prototype.randomPct = function randomPct(min, max) {
    return min + this.rng() * (max - min);
  };

World.prototype.roulettePressure = function roulettePressure() {
    const p = (typeof LIFE_BALANCE !== "undefined" && LIFE_BALANCE.roulette?.pressure)
      || BAL.roulette?.pressure
      || {};
    const t = 1 + (this.generation || 0) * (p.perGen ?? 0);
    return Math.min(p.cap ?? 1, Math.max(1, t));
  };

World.prototype.roulettePct = function roulettePct(type) {
    const range = ROULETTE_PCT[type];
    const raw = range && range.length >= 2
      ? this.randomPct(range[0], range[1])
      : this.randomPct(0.1, 0.3);
    return Math.min(0.85, raw * this.roulettePressure());
  };

World.prototype.applyRouletteEvent = function applyRouletteEvent(type) {
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
  };
