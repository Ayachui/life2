/** Растения, падаль, грибы — tables/ecology.js */
World.prototype.plantEnergyRemaining = function plantEnergyRemaining(x, y) {
    const i = this.idx(x, y);
    const stage = this.plantStage[i];
    const bites = this.plantBites[i];
    if (stage === STAGE_GRASS) return (bites / PLANT_CFG.grassBites) * PLANT_CFG.grassEnergy;
    if (stage === STAGE_BUSH) return bites * PLANT_CFG.bushEnergyPerBite;
    if (stage === STAGE_TREE) return bites * PLANT_CFG.treeEnergyPerBite * 1.2;
    return 0;
  };

World.prototype.clearPlant = function clearPlant(x, y) {
    const i = this.idx(x, y);
    this.cells[i] = EMPTY;
    this.plantStage[i] = 0;
    this.plantAge[i] = 0;
    this.plantBites[i] = 0;
  };

World.prototype.setPlant = function setPlant(x, y, stage, age = 0) {
    const i = this.idx(x, y);
    this.cells[i] = PLANT;
    this.plantStage[i] = stage;
    this.plantAge[i] = age;
    this.plantBites[i] = stage === STAGE_BUSH ? PLANT_CFG.bushBites
      : stage === STAGE_GRASS ? PLANT_CFG.grassBites : 0;
  };

World.prototype.spawnGrassAt = function spawnGrassAt(x, y) {
    if (this.get(x, y) !== EMPTY) return false;
    this.setPlant(x, y, STAGE_GRASS, 0);
    this.births++;
    this.spark(x, y, "#5dff8a");
    return true;
  };

World.prototype.spawnGrassAround = function spawnGrassAround(x, y, count) {
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
  };

World.prototype.mealFromEating = function mealFromEating(a) {
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
  };

World.prototype.startEating = function startEating(a, meal) {
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
  };

World.prototype.plantStageAt = function plantStageAt(x, y) {
    if (!this.inside(x, y) || this.get(x, y) !== PLANT) return 0;
    return this.plantStage[this.idx(x, y)];
  };

World.prototype.tickDecays = function tickDecays() {
    this.decays = this.decays.filter((d) => {
      d.ttl--;
      d.pulse = (d.pulse || 0) + 0.15;
      return d.ttl > 0;
    });
  };

World.prototype.tickFertilizers = function tickFertilizers() {
    this.fertilizers = this.fertilizers.filter((f) => {
      f.ttl--;
      return f.ttl > 0;
    });
  };

World.prototype.tryPlantMushroomNear = function tryPlantMushroomNear(x, y) {
    const spot = this.findNeighbor(x, y, EMPTY);
    if (!spot) return false;
    if (this.arcade && !this.inDish(spot.x, spot.y)) return false;
    this.set(spot.x, spot.y, MUSHROOM);
    this.spark(spot.x, spot.y, "#c77dff");
    this.chime("mushroom_plant");
    return true;
  };

World.prototype.eatMushroom = function eatMushroom(a, x, y) {
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
  };

World.prototype.addFertilizer = function addFertilizer(x, y) {
    this.fertilizers.push({
      x, y,
      ttl: FERTILIZER_CFG.ttl,
      strength: FERTILIZER_CFG.strength
    });
    this.fx.push({ x, y, color: "#8b6914", t: 1.4, fert: true });
    this.chime("fertilize");
    this.awardScaledEcoPoints(this.tierPoints("activity", this.plantEventTier("fertilize")));
    this.grantArcadeEnergy("fertilize");
  };

World.prototype.addDecay = function addDecay(x, y, kind) {
    const cfg = kind === BEAR ? DECAY_CFG.bear : kind === PRED ? DECAY_CFG.pred : DECAY_CFG.herb;
    const color = kind === BEAR ? "#a88458" : kind === PRED ? "#c8a86a" : "#8abf6a";
    this.decays.push({ x, y, radius: cfg.radius, strength: cfg.strength, ttl: cfg.ttl, kind, pulse: 0 });
    this.fx.push({ x, y, color, t: 1.2, bone: true });
  };

World.prototype.trySpawnGrass = function trySpawnGrass(x, y, baseChance) {
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
  };

World.prototype.growPlants = function growPlants() {
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
  };

World.prototype.decayBoost = function decayBoost(x, y) {
    let boost = 0;
    for (const d of this.decays) {
      const dist = Math.hypot(x - d.x, y - d.y);
      if (dist <= d.radius) boost = Math.max(boost, d.strength * (1 - dist / (d.radius + 0.5)));
    }
    return boost;
  };

World.prototype.fertilizerBoost = function fertilizerBoost(x, y) {
    let boost = 0;
    for (const f of this.fertilizers) {
      if (Math.abs(f.x - x) <= 1 && Math.abs(f.y - y) <= 1) boost = Math.max(boost, f.strength);
    }
    return boost;
  };

World.prototype.growthMulAt = function growthMulAt(x, y) {
    let mul = 1 + this.fertilizerBoost(x, y);
    if (this.countType(x, y, WATER) > 0) mul *= WATER_GROWTH_MUL;
    return mul;
  };

World.prototype.countType = function countType(x, y, type) {
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        if (this.get(x + dx, y + dy) === type) n++;
      }
    }
    return n;
  };

World.prototype.eatPlant = function eatPlant(a, meal) {
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
  };
