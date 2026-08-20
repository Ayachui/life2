/** Существа: ИИ, охота, размножение, мутации — tables/species.js */
World.prototype.mutationMultForGen = function mutationMultForGen(gen) {
    const g = Math.max(1, gen || 1);
    const base = BAL.mutationGenBase ?? 2;
    return Math.pow(base, g - 1);
  };

World.prototype.effectiveChance = function effectiveChance(base, gen) {
    return Math.min(1, base * this.mutationMultForGen(gen));
  };

World.prototype.agentAnchor = function agentAnchor(a) {
    if (isKrolDushegub(a)) return { x: a.x + 0.5, y: a.y + 0.5 };
    return { x: a.x, y: a.y };
  };

World.prototype.clearAgentCells = function clearAgentCells(a) {
    for (const c of agentFootprint(a)) {
      if (this.get(c.x, c.y) === a.kind) this.set(c.x, c.y, EMPTY);
    }
  };

World.prototype.occupyAgentCells = function occupyAgentCells(a) {
    if (isKoala(a) && this.isKoalaPerchCell(a.x, a.y)) return;
    for (const c of agentFootprint(a)) {
      const t = this.get(c.x, c.y);
      if (t === PLANT) this.clearPlant(c.x, c.y);
      if (t === EMPTY || t === PLANT) this.set(c.x, c.y, a.kind);
    }
  };

World.prototype.canPlaceKrolAt = function canPlaceKrolAt(x, y, ignoreAgent = null) {
    for (const c of krolFootprintAt(x, y)) {
      if (!this.inside(c.x, c.y)) return false;
      if (this.get(c.x, c.y) !== EMPTY) return false;
      for (const o of this.agents) {
        if (o.dead || o === ignoreAgent) continue;
        if (agentOccupies(o, c.x, c.y)) return false;
      }
    }
    return true;
  };

World.prototype.krolBirthAnchorsAround = function krolBirthAnchorsAround(px, py) {
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
  };

World.prototype.canPlaceKrolBirthAt = function canPlaceKrolBirthAt(ax, ay, parent, baby) {
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
  };

World.prototype.krolDevourCells = function krolDevourCells(a, cells, exempt = []) {
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
  };

World.prototype.krolDevourFootprint = function krolDevourFootprint(a, exempt = []) {
    return this.krolDevourCells(a, agentFootprint(a), exempt);
  };

World.prototype.krolDevourZoneCells = function krolDevourZoneCells(a) {
    const cells = [];
    for (let dy = -1; dy <= KROL_SIZE; dy++) {
      for (let dx = -1; dx <= KROL_SIZE; dx++) {
        const cx = a.x + dx;
        const cy = a.y + dy;
        if (this.inside(cx, cy)) cells.push({ x: cx, y: cy });
      }
    }
    return cells;
  };

World.prototype.krolDevourZone = function krolDevourZone(a, exempt = []) {
    return this.krolDevourCells(a, this.krolDevourZoneCells(a), exempt);
  };

World.prototype.birthKrolAroundParent = function birthKrolAroundParent(baby, parent) {
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
  };

World.prototype.isKoalaPerchCell = function isKoalaPerchCell(x, y) {
    if (this.get(x, y) !== PLANT) return false;
    const stage = this.plantStageAt(x, y);
    return stage === STAGE_TREE || stage === STAGE_BUSH;
  };

World.prototype.koalaHidden = function koalaHidden(a) {
    return koalaPerchedOn(this, a);
  };

World.prototype.tickKoalaTreeChew = function tickKoalaTreeChew(a) {
    if (!isKoala(a) || a.dead) return false;
    const x = a.x;
    const y = a.y;
    if (!koalaPerchedOn(this, a) || this.plantStageAt(x, y) !== STAGE_TREE) {
      a.treeChew = 0;
      return false;
    }
    const need = KOALA_TREE_DOWNGRADE_GENS;
    a.treeChew = (a.treeChew || 0) + 1;
    if (a.treeChew < need) return false;
    this.setPlant(x, y, STAGE_BUSH, 0);
    a.treeChew = 0;
    a.eating = null;
    this.spark(x, y, "#46d070");
    this.chime("evolve_bush");
    const next = this.findNearestEmptyPerch(x, y, this.effectiveVision(a));
    if (next && (next.x !== x || next.y !== y)) {
      const step = this.stepToward(x, y, next.x, next.y);
      if (step && this.canAgentMoveTo(a, step.x, step.y)) this.moveAgentTo(a, step.x, step.y);
    }
    return true;
  };

World.prototype.koalaCount = function koalaCount() {
    return this.agents.filter((a) => !a.dead && isKoala(a)).length;
  };

World.prototype.koalaPerchCapacity = function koalaPerchCapacity() {
    const c = this.counts();
    const raw = c.tree * (KOALA_PERCH_CAP.tree ?? 1) + c.bush * (KOALA_PERCH_CAP.bush ?? 0.5);
    const max = KOALA_PERCH_CAP.max;
    if (max == null) return raw;
    return Math.min(raw, max);
  };

World.prototype.isKoalaPerchOccupied = function isKoalaPerchOccupied(x, y) {
    const o = this.agentAt(x, y);
    return !!o && isKoala(o);
  };

World.prototype.findNearestEmptyPerch = function findNearestEmptyPerch(x, y, range) {
    return this.findNearestThicket(x, y, range, false);
  };

World.prototype.canAgentMoveTo = function canAgentMoveTo(a, x, y) {
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
  };

World.prototype.krolDevourRing = function krolDevourRing(a) {
    return this.krolDevourZone(a);
  };

World.prototype.distCheb = function distCheb(ax, ay, bx, by) {
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
  };

World.prototype.distMan = function distMan(ax, ay, bx, by) {
    return Math.abs(ax - bx) + Math.abs(ay - by);
  };

World.prototype.perceive = function perceive(agent) {
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
          } else if (stage === STAGE_TREE && (isElk(agent) || isKrolDushegub(agent) || isKoala(agent))) {
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
  };

World.prototype.isThreatTo = function isThreatTo(hunter, victim) {
    if (!hunter || !victim || hunter.dead || victim.dead) return false;
    return this.canHunt(hunter, victim);
  };

World.prototype.herbFoodRank = function herbFoodRank(agent, item) {
    if (item.mushroom) return -1;
    const stage = item.stage;
    if (isKoala(agent)) {
      if (stage === STAGE_TREE) return 0;
      if (stage === STAGE_BUSH) return 1;
      return 2;
    }
    if (isCow(agent)) {
      if (stage === STAGE_BUSH) return 0;
      if (stage === STAGE_GRASS) return 1;
      return 2;
    }
    if (isElk(agent) && stage === STAGE_TREE) return 0;
    if (stage === STAGE_GRASS) return 0;
    if (stage === STAGE_BUSH) return 1;
    return 2;
  };

World.prototype.effectiveVision = function effectiveVision(a) {
    return Math.max(1, Math.round((a?.vision || 7) * skillMul(a)));
  };

World.prototype.findNearestMushroom = function findNearestMushroom(x, y, range, metric = "scout") {
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
  };

World.prototype.findNearestEdible = function findNearestEdible(x, y, range, metric = "scout", eater = null) {
    const mushroom = this.findNearestMushroom(x, y, range, metric);
    if (mushroom) return mushroom;
    const distAt = metric === "touch"
      ? (dx, dy) => Math.max(Math.abs(dx), Math.abs(dy))
      : (dx, dy) => Math.abs(dx) + Math.abs(dy);
    let bestGrass = null, bestGrassD = 99;
    let bestBush = null, bestBushD = 99;
    let bestTree = null, bestTreeD = 99;
    const canEatTree = eater && (isElk(eater) || isKrolDushegub(eater) || isKoala(eater));
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
    if (isCow(eater)) return bestBush || bestGrass;
    if (isElk(eater)) return bestTree || bestGrass || bestBush;
    if (isKoala(eater)) return bestTree || bestBush || bestGrass;
    return bestGrass || bestBush || bestTree;
  };

World.prototype.preyPriority = function preyPriority(hunter, prey, px, py) {
    const d = Math.abs(prey.x - px) + Math.abs(prey.y - py);
    let score = d;
    if (prey.energy < prey.thresh) score -= 0.35;
    if (hunter.kind === BEAR && prey.kind === PRED) score -= 0.45;
    if (hunter.kind === BEAR && prey.energy < prey.thresh) score -= 0.2;
    if (isKrolDushegub(hunter) && prey.kind === PRED) score -= 0.15;
    if (isKrolDushegub(hunter) && prey.kind === BEAR) score -= 0.5;
    if (isKrolDushegub(hunter) && (isWolf(prey) || isElk(prey))) score -= 0.35;
    if (isKrolDushegub(hunter) && (isCow(prey) || isKoala(prey))) score -= 0.2;
    if (isWolf(hunter) && isCow(prey)) score -= WOLF_COW_PRIORITY;
    if (isWolf(hunter) && prey.kind === HERB && !isCow(prey)) score -= 0.1;
    if (isKoala(prey) && this.koalaHidden(prey)) score += 1.2;
    return score;
  };

World.prototype.findNearestPrey = function findNearestPrey(x, y, range, hunter, metric = "scout") {
    return this.findNearestAgent(x, y, range, this.preyKindsFor(hunter), hunter, metric);
  };

World.prototype.preyKindsFor = function preyKindsFor(hunter) {
    if (isKrolDushegub(hunter)) return [HERB, PRED, BEAR];
    if (isWolf(hunter)) return [HERB, PRED];
    if (hunter.kind === BEAR) return [HERB, PRED];
    if (hunter.kind === PRED && !isElk(hunter)) return [HERB];
    return [];
  };

World.prototype.findNearestAgent = function findNearestAgent(x, y, range, kinds, hunter, metric = "scout") {
    const distAt = metric === "touch"
      ? (dx, dy) => Math.max(Math.abs(dx), Math.abs(dy))
      : (dx, dy) => Math.abs(dx) + Math.abs(dy);
    let best = null, bestScore = 99;
    for (const o of this.agents) {
      if (o.dead || !kinds.includes(o.kind)) continue;
      if (hunter?.kind === PRED && !isWolf(hunter) && !isElk(hunter) && isCow(o)) continue;
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
  };

World.prototype.isSpecialHerb = function isSpecialHerb(a) {
    return isKrolDushegub(a) || isKoala(a) || isCow(a);
  };

World.prototype.nearestWolfDist = function nearestWolfDist(x, y, self) {
    let best = Infinity;
    for (const o of this.agents) {
      if (o.dead || o === self || !isWolf(o)) continue;
      best = Math.min(best, this.distMan(x, y, o.x, o.y));
    }
    return best;
  };

World.prototype.nearestWolf = function nearestWolf(x, y, self) {
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
  };

World.prototype.stepToward = function stepToward(ax, ay, tx, ty) {
    const dx = tx - ax;
    const dy = ty - ay;
    if (!dx && !dy) return null;
    if (Math.abs(dx) >= Math.abs(dy)) return { x: ax + Math.sign(dx), y: ay };
    return { x: ax, y: ay + Math.sign(dy) };
  };

World.prototype.stepAway = function stepAway(ax, ay, tx, ty) {
    const dx = ax - tx;
    const dy = ay - ty;
    if (!dx && !dy) {
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const d = dirs[Math.floor(this.rng() * 4)];
      return { x: ax + d[0], y: ay + d[1] };
    }
    if (Math.abs(dx) >= Math.abs(dy)) return { x: ax + Math.sign(dx), y: ay };
    return { x: ax, y: ay + Math.sign(dy) };
  };

World.prototype.moveAgentTo = function moveAgentTo(a, x, y) {
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
  };

World.prototype.agentOnWater = function agentOnWater(a) {
    if (!a) return false;
    for (const c of agentFootprint(a)) {
      if (this.get(c.x, c.y) === WATER) return true;
    }
    return false;
  };

World.prototype.moveIntervalFor = function moveIntervalFor(a) {
    let interval = a.moveInterval || 1;
    if (this.agentOnWater(a)) interval *= WATER_SLOW_MUL;
    if (a.skillBoost) interval = Math.max(1, Math.floor(interval / 2));
    return interval;
  };

World.prototype.canMoveThisTick = function canMoveThisTick(a) {
    return (a.movePhase || 0) % this.moveIntervalFor(a) === 0;
  };

World.prototype.wanderAgent = function wanderAgent(a) {
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
  };

World.prototype.fleeFrom = function fleeFrom(a, tx, ty) {
    if (!this.canMoveThisTick(a)) return false;
    const step = this.stepAway(a.x, a.y, tx, ty);
    if (step && this.canAgentMoveTo(a, step.x, step.y)) {
      this.moveAgentTo(a, step.x, step.y);
      return true;
    }
    return this.wanderAgent(a);
  };

World.prototype.moveTowardTarget = function moveTowardTarget(a, tx, ty) {
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
  };

World.prototype.nudgeToward = function nudgeToward(a, tx, ty) {
    return this.moveTowardTarget(a, tx, ty) || this.wanderAgent(a);
  };

World.prototype.wanderBiasChance = function wanderBiasChance(a) {
    if (isKoala(a) && !koalaPerchedOn(this, a)) return 0.12;
    return 0.35;
  };

World.prototype.shouldMoveThisTick = function shouldMoveThisTick(a) {
    return this.canMoveThisTick(a);
  };

World.prototype.stepSated = function stepSated(a) {
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
      if (perched && this.plantStageAt(a.x, a.y) === STAGE_TREE) return;
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
  };

World.prototype.canHunt = function canHunt(killer, victim) {
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
  };

World.prototype.pounceVictim = function pounceVictim(killer, spot, energyGain = 7.2) {
    if (isKrolDushegub(killer)) return false;
    const victim = this.agentAt(spot.x, spot.y);
    if (!victim || victim.dead || !this.canHunt(killer, victim)) return false;
    this.moveAgentTo(killer, spot.x, spot.y);
    this.killAgent(victim, killer, energyGain);
    return true;
  };

World.prototype.pouncePrey = function pouncePrey(a, spot) {
    const victim = this.agentAt(spot.x, spot.y);
    let gain = 7.2;
    if (victim?.kind === PRED) gain = 8.5;
    if (isCow(victim)) gain = 12;
    if (isKoala(victim)) gain = 6.8;
    if (victim?.kind === BEAR) gain = 14;
    return this.pounceVictim(a, spot, gain);
  };

World.prototype.krolHuntGain = function krolHuntGain(victim) {
    if (!victim) return 7;
    if (victim.kind === BEAR) return 14;
    if (isWolf(victim) || isElk(victim)) return 10;
    if (isCow(victim)) return 12;
    if (isKoala(victim)) return 7;
    if (victim.kind === PRED) return 8.5;
    return 7;
  };

World.prototype.feedKrolDushegub = function feedKrolDushegub(a) {
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
  };

World.prototype.krolFoodRank = function krolFoodRank(stage) {
    if (stage === STAGE_TREE) return 0;
    if (stage === STAGE_BUSH) return 1;
    return 2;
  };

World.prototype.krolSortFood = function krolSortFood(food) {
    return [...food].sort((a, b) => {
      const dr = this.krolFoodRank(a.stage) - this.krolFoodRank(b.stage);
      if (dr !== 0) return dr;
      return a.man - b.man;
    });
  };

World.prototype.krolNearestEdible = function krolNearestEdible(x, y, range, eater) {
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
  };

World.prototype.findNearestThicket = function findNearestThicket(x, y, range, allowOccupied = true) {
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
  };

World.prototype.seekKoalaHangout = function seekKoalaHangout(a) {
    const perch = this.findNearestEmptyPerch(a.x, a.y, a.vision || 8)
      || this.findNearestThicket(a.x, a.y, a.vision || 8, true);
    if (perch) {
      const step = this.stepToward(a.x, a.y, perch.x, perch.y);
      if (step) return { x: step.x - a.x, y: step.y - a.y };
    }
    return this.seekHerb(a);
  };

World.prototype.feedHungryKoala = function feedHungryKoala(a) {
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
  };

World.prototype.feedHungryHerb = function feedHungryHerb(a) {
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
  };

World.prototype.feedHungryPred = function feedHungryPred(a) {
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
  };

World.prototype.feedHungryWolf = function feedHungryWolf(a) {
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
  };

World.prototype.feedHungryElk = function feedHungryElk(a) {
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
  };

World.prototype.feedHungryBear = function feedHungryBear(a) {
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
  };

World.prototype.breedMinAge = function breedMinAge(a) {
    if (isCow(a)) return BREED_MIN_AGE.cow;
    if (isKoala(a)) return BREED_MIN_AGE.koala;
    if (isWolf(a)) return BREED_MIN_AGE.wolf;
    return a.kind === PRED ? BREED_MIN_AGE.pred : BREED_MIN_AGE.herb;
  };

World.prototype.canTryBreed = function canTryBreed(a, wasSatedAtTickStart) {
    if (a.kind === BEAR || isElk(a) || isKrolDushegub(a)) return false;
    if (!wasSatedAtTickStart || a.energy < a.thresh || a.cool > 0) return false;
    if (isKoala(a)) {
      if (!koalaPerchedOn(this, a)) return false;
      const cap = this.koalaPerchCapacity();
      if (cap > 0 && this.koalaCount() >= cap) return false;
    }
    const age = this.generation - (a.bornGen ?? this.generation);
    return age >= this.breedMinAge(a);
  };

World.prototype.inheritSpeciesTrait = function inheritSpeciesTrait(baby, parent) {
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
  };

World.prototype.applySpeciesTrait = function applySpeciesTrait(baby, trait, x, y, parent = null) {
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
  };

World.prototype.tryHerbSpeciesMutation = function tryHerbSpeciesMutation(baby, x, y, parent = null) {
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
  };

World.prototype.tryPredSpeciesMutation = function tryPredSpeciesMutation(baby, x, y) {
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
  };

World.prototype.seekHerb = function seekHerb(a) {
    const target = this.findNearestEdible(a.x, a.y, a.vision || 7, "scout", a);
    if (!target) {
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const d = dirs[Math.floor(this.rng() * 4)];
      return { x: d[0], y: d[1] };
    }
    const step = this.stepToward(a.x, a.y, target.x, target.y);
    if (!step) return { x: 0, y: 0 };
    return { x: step.x - a.x, y: step.y - a.y };
  };

World.prototype.seekPred = function seekPred(a) {
    const target = this.findNearestPrey(a.x, a.y, this.effectiveVision(a), a);
    if (!target) {
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const d = dirs[Math.floor(this.rng() * 4)];
      return { x: d[0], y: d[1], target: null };
    }
    const step = this.stepToward(a.x, a.y, target.x, target.y);
    if (!step) return { x: 0, y: 0, target };
    return { x: step.x - a.x, y: step.y - a.y, target };
  };

World.prototype.spawnKrolLegacy = function spawnKrolLegacy(a) {
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
  };

World.prototype.killAgent = function killAgent(victim, killer, energyGain) {
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
  };

World.prototype.dieAgent = function dieAgent(a, reason) {
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
  };

World.prototype.litterSize = function litterSize(a) {
    if (isKoala(a)) {
      const onTree = koalaPerchedOn(this, a) && this.plantStageAt(a.x, a.y) === STAGE_TREE;
      return onTree ? (BAL.species?.koala?.litterOnTree ?? 2) : (BAL.species?.koala?.litter ?? 1);
    }
    if (isCow(a)) return BAL.species?.cow?.litter ?? 1;
    return 1;
  };

World.prototype.stepAgents = function stepAgents() {
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

      if (isKoala(a)) this.tickKoalaTreeChew(a);
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
            if (isKoala(a)) {
              const cap = this.koalaPerchCapacity();
              const incoming = babies.filter((b) => isKoala(b)).length;
              if (cap > 0 && this.koalaCount() + incoming >= cap) break;
            }
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
  };
