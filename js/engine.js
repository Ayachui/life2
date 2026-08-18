const EMPTY = 0, PLANT = 1, HERB = 2, PRED = 3, WALL = 4, WATER = 5;

class World {
  constructor(w, h, mode) {
    this.w = w;
    this.h = h;
    this.mode = mode;
    this.cells = new Uint8Array(w * h);
    this.next = new Uint8Array(w * h);
    this.agents = [];
    this.generation = 0;
    this.births = 0;
    this.deaths = 0;
    this.mutations = 0;
    this.cycles = 0;
    this.seen = [];
    this.dish = null;
    this.target = null;
    this.mutateRate = 0.18;
    this.fx = [];
    this.mutHerb = 0;
    this.mutPred = 0;
    this.lastMutation = null;
  }

  idx(x, y) { return y * this.w + x; }
  inside(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x, y) { return this.inside(x, y) ? this.cells[this.idx(x, y)] : WALL; }
  set(x, y, v) { if (this.inside(x, y)) this.cells[this.idx(x, y)] = v; }

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
    const w = new World(this.w, this.h, this.mode);
    w.cells.set(this.cells);
    w.agents = this.agents.map((a) => ({ ...a }));
    w.dish = this.dish ? { ...this.dish } : null;
    w.target = this.target ? { ...this.target } : null;
    w.mutateRate = this.mutateRate;
    w.mutHerb = this.mutHerb;
    w.mutPred = this.mutPred;
    return w;
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
    if (!this.inside(x, y)) return;
    if (this.get(x, y) === WALL && brush !== "erase") {
      if (this.dish && !this.inDish(x, y)) return;
    }
    this.removeAgentAt(x, y);
    if (brush === "erase") {
      if (this.dish && !this.inDish(x, y)) return;
      this.set(x, y, EMPTY);
      return;
    }
    if (brush === "plant" || brush === "life") this.set(x, y, PLANT);
    if (brush === "water") this.set(x, y, WATER);
    if (brush === "wall") this.set(x, y, WALL);
    if (brush === "herb" || brush === "pred") {
      const kind = brush === "herb" ? HERB : PRED;
      this.set(x, y, kind);
      this.agents.push(this.makeAgent(x, y, kind));
    }
  }

  defaultsFor(kind) {
    return kind === PRED
      ? { energy: 10, hue: 350 + Math.random() * 20, vision: 8, drain: 0.5, thresh: 14 }
      : { energy: 8, hue: 38 + Math.random() * 22, vision: 7, drain: 0.34, thresh: 11 };
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
      trait: parent && parent.trait ? parent.trait : null,
      mutated: false,
      gen: parent ? parent.gen + 1 : 0,
      cool: 0,
      dead: false
    };
  }

  applyMutation(baby, parent) {
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
    this.lastMutation = {
      kind: baby.kind,
      trait: baby.trait,
      gen: this.generation
    };
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

  analytics() {
    const c = this.counts();
    const herbSat = this.satietyOf(HERB);
    const predSat = this.satietyOf(PRED);
    const foodPerHerb = c.herbs ? c.plants / c.herbs : c.plants ? Infinity : 0;
    const preyPerFox = c.preds ? c.herbs / c.preds : 0;
    let score = 0;
    let label = "пусто";
    let note = "Нарисуй растения или зверей и нажми Старт.";

    if (c.total === 0) {
      score = 0;
    } else if (c.plants && !c.herbs && !c.preds) {
      score = Math.min(70, 28 + Math.floor(c.plants / 4));
      label = "только лес";
      note = "Растения держатся. Добавь зайцев, чтобы появилась пищевая цепь.";
    } else if (c.preds && !c.herbs) {
      score = 12;
      label = "охотники без добычи";
      note = "Лисам некого есть. Добавь зайцев или уберите лишних лис.";
    } else if (c.herbs && foodPerHerb < 1.6) {
      score = Math.max(18, Math.round(22 + herbSat * 0.2));
      label = "голод";
      note = "Зайцам мало растений — лес скоро съедят. Посади кущу или пруд.";
    } else if (c.preds && c.herbs && preyPerFox < 1.3) {
      score = 28;
      label = "слишком много лис";
      note = "Зайцы не успевают размножаться. Камнем можно спрятать часть леса.";
    } else if (c.plants && c.herbs && c.preds && herbSat >= 35) {
      score = Math.min(100, Math.round(72 + herbSat * 0.22 + Math.min(10, foodPerHerb)));
      label = "баланс";
      note = "Цепочка держится: растения → зайцы → лисы.";
    } else if (c.plants && c.herbs) {
      score = Math.min(88, Math.round(48 + herbSat * 0.35));
      label = "устойчиво";
      note = herbSat >= 50 ? "Зайцы сыты, лес ещё жив." : "Зайцы голодноваты. Добавь воды у леса.";
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

  stamp(x, y, id) {
    const cells = LIFE_DATA.patterns[id] || [];
    for (const [dx, dy] of cells) this.paint(x + dx, y + dy, "life");
  }

  counts() {
    let plants = 0, water = 0, walls = 0;
    for (let i = 0; i < this.cells.length; i++) {
      const v = this.cells[i];
      if (v === PLANT) plants++;
      else if (v === WATER) water++;
      else if (v === WALL) walls++;
    }
    const herbs = this.agents.filter((a) => a.kind === HERB && !a.dead).length;
    const preds = this.agents.filter((a) => a.kind === PRED && !a.dead).length;
    return { plants, herbs, preds, water, walls, total: plants + herbs + preds };
  }

  step() {
    this.lastMutation = null;
    if (this.mode === "classic") this.stepClassic();
    else this.stepEco();
    this.generation++;
    this.updateCycles();
  }

  stepClassic() {
    const { w, h, cells, next } = this;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = this.idx(x, y);
        if (cells[i] === WALL) { next[i] = WALL; continue; }
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            if (this.get(x + dx, y + dy) === PLANT) n++;
          }
        }
        const alive = cells[i] === PLANT;
        next[i] = (alive && (n === 2 || n === 3)) || (!alive && n === 3) ? PLANT : EMPTY;
      }
    }
    cells.set(next);
  }

  stepEco() {
    this.growPlants();
    this.stepAgents();
  }

  growPlants() {
    const born = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y) !== EMPTY) continue;
        const n = this.countType(x, y, PLANT);
        const wet = this.countType(x, y, WATER);
        let p = 0;
        if (n === 3) p = 0.22;
        else if (n === 2) p = 0.035;
        else if (n === 4) p = 0.02;
        if (wet) p = Math.min(1, p + 0.1);
        if (Math.random() < p) born.push([x, y]);
      }
    }
    for (const [x, y] of born) {
      this.set(x, y, PLANT);
      this.births++;
      this.spark(x, y, "#5dff8a");
    }
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y) !== PLANT) continue;
        if (this.countType(x, y, PLANT) >= 6 && Math.random() < 0.05) {
          this.set(x, y, EMPTY);
        }
      }
    }
  }

  seek(a) {
    const food = a.kind === HERB ? PLANT : HERB;
    let best = null, bestD = 9;
    const r = a.vision || 7;
    for (let y = a.y - r; y <= a.y + r; y++) {
      for (let x = a.x - r; x <= a.x + r; x++) {
        if (this.get(x, y) !== food) continue;
        const d = Math.abs(x - a.x) + Math.abs(y - a.y);
        if (d < bestD) { bestD = d; best = { x, y }; }
      }
    }
    if (!best) {
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const d = dirs[Math.floor(Math.random() * 4)];
      return { x: d[0], y: d[1] };
    }
    return {
      x: Math.sign(best.x - a.x),
      y: Math.sign(best.y - a.y)
    };
  }

  stepAgents() {
    const order = this.agents.filter((a) => !a.dead);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const babies = [];
    for (const a of order) {
      if (a.dead) continue;
      a.energy -= a.drain;
      if (a.cool > 0) a.cool--;
      if (a.energy <= 0) {
        a.dead = true;
        this.set(a.x, a.y, EMPTY);
        this.deaths++;
        continue;
      }
      const thresh = a.thresh;
      const food = a.kind === HERB ? PLANT : HERB;
      const hungry = a.energy < thresh;
      const meal = hungry ? this.findNeighbor(a.x, a.y, food) : null;
      if (meal) {
        if (food === HERB) this.removeAgentAt(meal.x, meal.y);
        this.set(meal.x, meal.y, EMPTY);
        this.set(a.x, a.y, EMPTY);
        a.x = meal.x; a.y = meal.y;
        this.set(a.x, a.y, a.kind);
        a.energy += food === PLANT ? 3.1 : 7.5;
        this.spark(a.x, a.y, food === PLANT ? "#ffc14d" : "#ff5d7a");
      } else {
        const dir = this.seek(a);
        const nx = a.x + dir.x;
        const ny = a.y + (dir.x && dir.y && Math.random() < 0.5 ? 0 : dir.y);
        if (this.get(nx, ny) === EMPTY) {
          this.set(a.x, a.y, EMPTY);
          a.x = nx; a.y = ny;
          this.set(a.x, a.y, a.kind);
        }
      }
      if (a.energy >= thresh && a.cool <= 0) {
        const spot = this.findNeighbor(a.x, a.y, EMPTY);
        if (spot) {
          a.energy *= 0.5;
          a.cool = a.kind === PRED ? 32 : 24;
          const baby = this.makeAgent(spot.x, spot.y, a.kind, a);
          baby.energy = a.energy;
          baby.cool = a.cool;
          this.applyMutation(baby, a);
          this.set(spot.x, spot.y, a.kind);
          babies.push(baby);
          this.births++;
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

  hash() {
    let h = 2166136261;
    for (let i = 0; i < this.cells.length; i++) {
      h ^= this.cells[i];
      h = Math.imul(h, 16777619);
    }
    return h;
  }

  updateCycles() {
    if (this.mode !== "classic") return;
    const h = this.hash();
    const prev = this.seen.lastIndexOf(h);
    if (prev !== -1 && this.seen.length - prev <= 4 && this.generation > 2) this.cycles++;
    this.seen.push(h);
    if (this.seen.length > 24) this.seen.shift();
  }

  reachedTarget() {
    if (!this.target) return false;
    const { x, y, w, h } = this.target;
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        if (this.get(xx, yy) === PLANT) return true;
      }
    }
    return false;
  }
}

window.World = World;
window.LIFE_TYPES = { EMPTY, PLANT, HERB, PRED, WALL, WATER };
