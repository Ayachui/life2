const { loadEngine, createWorld } = require("./harness.cjs");
const { simulateArcade, toolCosts } = require("./arcade-sim.cjs");
const { lifeSelfCheck } = require("../js/debug-lib.js");

function diff(LIFE_DATA, id) {
  return LIFE_DATA.difficulties.find((d) => d.id === id);
}

function runSeeded(fn, seed = 42) {
  const ctx = createWorld(32, 32);
  ctx.world.setSeed(seed);
  return fn(ctx);
}

function countKrolTrials(trials = 800, seed = 7) {
  const { world, T } = createWorld(24, 24);
  world.setSeed(seed);
  world.arcade = true;
  let krol = 0;
  let births = 0;
  for (let t = 0; t < trials; t++) {
    world.set(5, 5, T.HERB);
    const parent = world.makeAgent(5, 5, T.HERB);
    parent.energy = parent.thresh * 2;
    parent.cool = 0;
    world.agents = [parent];
    world.generation = 1;
    world.stepAgents();
    const baby = world.agents.find((a) => !a.dead && a !== parent);
    if (baby) {
      births++;
      if (baby.trait === "крол-душегуб") krol++;
    }
    world.agents = [];
  }
  return { krol, births, rate: births ? krol / births : 0 };
}

module.exports = {
  diff,
  runSeeded,
  countKrolTrials,
  simulateArcade,
  toolCosts,
  loadEngine,
  createWorld,
  lifeSelfCheck
};
