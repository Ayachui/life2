/**
 * Модели игроков для аркады: длинные партии, кривая ⚡, риск «непроигрываемости».
 * Не бот для продакшена — измерительный стенд.
 */
const { loadEngine } = require("./harness.cjs");
const { toolCosts } = require("./arcade-sim.cjs");

const STRATEGIES = ["neglect", "gardener", "greedy", "predator"];

function emptyCells(world, cx, cy, radius = 8) {
  const spots = [];
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      if (world.inDish(x, y) && world.get(x, y) === 0) spots.push([x, y]);
    }
  }
  return spots;
}

function buy(world, T, energy, cost, kind, cx, cy) {
  if (energy < cost) return energy;
  const spots = emptyCells(world, cx, cy);
  if (!spots.length) return energy;
  const [x, y] = spots[Math.floor(spots.length / 3)] || spots[0];
  if (kind === "plant") {
    world.setPlant(x, y, T.STAGE_GRASS, 0);
  } else {
    world.set(x, y, kind);
    world.agents.push(world.makeAgent(x, y, kind));
  }
  return energy - cost;
}

function seedStarter(world, T, energy, costs, cx, cy) {
  energy = buy(world, T, energy, costs.HERB_COST, T.HERB, cx, cy);
  for (let i = 0; i < 6; i++) {
    energy = buy(world, T, energy, costs.PLANT_COST, "plant", cx, cy);
  }
  return energy;
}

function actNeglect() {}

function actGardener(state) {
  const { world, T, costs, cx, cy, an } = state;
  if (world.live(T.HERB).length === 0) {
    state.energy = buy(world, T, state.energy, costs.HERB_COST, T.HERB, cx, cy);
  }
  const food = typeof an.foodPerHerb === "number" ? an.foodPerHerb : 99;
  let planted = 0;
  while (food < 1.6 && planted < 4 && state.energy >= costs.PLANT_COST) {
    const before = state.energy;
    state.energy = buy(world, T, state.energy, costs.PLANT_COST, "plant", cx, cy);
    if (state.energy === before) break;
    planted++;
  }
}

function actGreedy(state) {
  const { world, T, costs, cx, cy } = state;
  const herbs = world.live(T.HERB).length;
  const preds = world.live(T.PRED).length;
  const bears = world.live(T.BEAR).length;
  let guard = 0;
  while (state.energy >= costs.PLANT_COST && guard < 12) {
    const before = state.energy;
    state.energy = buy(world, T, state.energy, costs.PLANT_COST, "plant", cx, cy);
    if (state.energy === before) break;
    guard++;
  }
  if (herbs < 10) {
    state.energy = buy(world, T, state.energy, costs.HERB_COST, T.HERB, cx, cy);
  }
  if (herbs >= 4 && preds < Math.max(1, Math.floor(herbs / 4))) {
    state.energy = buy(world, T, state.energy, costs.PRED_COST, T.PRED, cx, cy);
  }
  if (state.energy >= costs.BEAR_COST && bears < 2 && herbs >= 6) {
    state.energy = buy(world, T, state.energy, costs.BEAR_COST, T.BEAR, cx, cy);
  }
}

function actPredator(state) {
  actGardener(state);
  const { world, T, costs, cx, cy } = state;
  const herbs = world.live(T.HERB).length;
  const preds = world.live(T.PRED).length;
  if (herbs >= 3 && preds === 0) {
    state.energy = buy(world, T, state.energy, costs.PRED_COST, T.PRED, cx, cy);
  }
}

const ACTORS = {
  neglect: actNeglect,
  gardener: actGardener,
  greedy: actGreedy,
  predator: actPredator
};

function bearCostOf(ctx) {
  const { LIFE_DATA } = ctx;
  return LIFE_DATA.tools.find((t) => t.id === "bear").cost;
}

/**
 * Одна партия выбранной стратегией.
 */
function runPlaytest(ctx, opts) {
  const {
    strategy = "gardener",
    startEnergy,
    maxGens = 400,
    seed = 1,
    cx = 16,
    cy = 16,
    sampleEvery = 50
  } = opts;
  const costs = {
    ...toolCosts(ctx),
    BEAR_COST: bearCostOf(ctx)
  };
  const { World, LIFE_TYPES: T } = ctx;
  const world = new World(32, 32);
  world.setSeed(seed);
  world.arcade = true;
  world.makeDish();
  world.arcadeBudget = startEnergy;
  world.playerEnergy = startEnergy;

  let energy = startEnergy;
  let earned = 0;
  let spent = startEnergy;
  energy = seedStarter(world, T, energy, costs, cx, cy);
  spent = startEnergy - energy;

  const actor = ACTORS[strategy] || actGardener;
  const series = [];
  let maxEnergy = energy;
  const checkpoints = {};

  const state = { world, T, costs, cx, cy, energy, an: world.analytics() };

  function snapshot(g) {
    return {
      g,
      energy: state.energy,
      herbs: world.live(T.HERB).length,
      preds: world.live(T.PRED).length,
      plants: world.counts().plants,
      points: world.lifePoints,
      earned,
      spent
    };
  }

  series.push(snapshot(0));

  for (let g = 0; g < maxGens; g++) {
    state.an = world.analytics();
    actor(state);
    spent += Math.max(0, energy - state.energy);
    energy = state.energy;

    world.playerEnergy = energy;
    world.step();
    const delta = world.pendingEnergy;
    if (delta > 0) earned += delta;
    energy = Math.max(0, energy + delta);
    world.pendingEnergy = 0;
    world.playerEnergy = energy;
    state.energy = energy;
    if (energy > maxEnergy) maxEnergy = energy;

    const gen = g + 1;
    if (gen % sampleEvery === 0) {
      series.push(snapshot(gen));
      checkpoints[gen] = energy;
    }

    world.checkArcadeEnd(energy, costs.HERB_COST);
    if (world.gameOver) {
      return finish(gen, true);
    }
  }

  return finish(maxGens, false);

  function finish(survived, gameOver) {
    const audit = world.energyAuditTotals ? world.energyAuditTotals() : {};
    const buyHerb = Math.floor(energy / costs.HERB_COST);
    const buyBear = Math.floor(energy / costs.BEAR_COST);
    const unlosable = !gameOver
      && energy >= startEnergy * 1.4
      && energy >= costs.BEAR_COST;
    return {
      strategy,
      seed,
      startEnergy,
      survived,
      gameOver,
      reason: world.gameOverReason || null,
      energy: Math.round(energy * 10) / 10,
      maxEnergy: Math.round(maxEnergy * 10) / 10,
      earned: Math.round(earned * 10) / 10,
      spent: Math.round(spent * 10) / 10,
      points: world.lifePoints,
      herbs: world.live(T.HERB).length,
      preds: world.live(T.PRED).length,
      plants: world.counts().plants,
      buyHerb,
      buyBear,
      unlosable,
      energyRatio: startEnergy ? energy / startEnergy : 0,
      audit,
      checkpoints,
      series,
      sustainedChain: world.sustainedChain
    };
  }
}

function pct(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const i = Math.floor((p / 100) * (s.length - 1));
  return s[i];
}

function summarize(runs) {
  const energies = runs.map((r) => r.energy);
  const ratios = runs.map((r) => r.energyRatio);
  const unlose = runs.filter((r) => r.unlosable).length;
  const over = runs.filter((r) => r.gameOver).length;
  const earned = runs.map((r) => r.earned);
  return {
    n: runs.length,
    energyP50: Math.round(pct(energies, 50)),
    energyP90: Math.round(pct(energies, 90)),
    energyMax: Math.round(Math.max(...energies)),
    ratioP50: Math.round(pct(ratios, 50) * 100) / 100,
    ratioP90: Math.round(pct(ratios, 90) * 100) / 100,
    earnedP50: Math.round(pct(earned, 50)),
    earnedP90: Math.round(pct(earned, 90)),
    unlosableRate: unlose / runs.length,
    loseRate: over / runs.length,
    chainRate: runs.filter((r) => r.sustainedChain).length / runs.length
  };
}

function runBattery(opts = {}) {
  const ctx = loadEngine();
  const seeds = opts.seeds || [1, 7, 13, 21, 42];
  const diffs = opts.diffs || ["hardcore", "medium", "easy"];
  const strategies = opts.strategies || STRATEGIES;
  const maxGens = opts.maxGens || 400;
  const rows = [];
  const all = [];

  for (const diffId of diffs) {
    const d = ctx.LIFE_DATA.difficulties.find((x) => x.id === diffId);
    for (const strategy of strategies) {
      const runs = seeds.map((seed) => runPlaytest(ctx, {
        strategy,
        startEnergy: d.energy,
        maxGens,
        seed
      }));
      all.push(...runs.map((r) => ({ ...r, diff: diffId })));
      rows.push({
        diff: diffId,
        strategy,
        start: d.energy,
        ...summarize(runs)
      });
    }
  }

  return { ctx, rows, runs: all };
}

module.exports = {
  STRATEGIES,
  runPlaytest,
  runBattery,
  summarize,
  pct
};
