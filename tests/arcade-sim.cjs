const { loadEngine, createWorld } = require("./harness.cjs");

function toolCost(LIFE_DATA, id) {
  return LIFE_DATA.tools.find((t) => t.id === id).cost;
}

function toolCosts(ctx) {
  const { LIFE_DATA } = ctx;
  return {
    PLANT_COST: toolCost(LIFE_DATA, "plant"),
    HERB_COST: toolCost(LIFE_DATA, "herb"),
    PRED_COST: toolCost(LIFE_DATA, "pred")
  };
}

function emptyCells(world, cx, cy, radius = 6) {
  const spots = [];
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      if (world.inDish(x, y) && world.get(x, y) === 0) spots.push([x, y]);
    }
  }
  return spots;
}

/**
 * Простой бот аркады: сначала зайц, остальное в траву, подсаживает при возможности.
 */
function simulateArcade(ctx, {
  startEnergy,
  herbCost,
  plantCost,
  predCost,
  maxGens = 200,
  cx = 16,
  cy = 16,
  withPred = false,
  seed
}) {
  const costs = toolCosts(ctx);
  herbCost = herbCost ?? costs.HERB_COST;
  plantCost = plantCost ?? costs.PLANT_COST;
  predCost = predCost ?? costs.PRED_COST;
  const { World, LIFE_TYPES: T } = ctx;
  const world = new World(32, 32);
  if (seed != null) world.setSeed(seed);
  world.arcade = true;
  world.makeDish();

  let energy = startEnergy;

  function spend() {
    if (withPred && world.live(T.PRED).length === 0 && energy >= predCost && world.live(T.HERB).length > 0) {
      const spots = emptyCells(world, cx, cy);
      if (spots.length) {
        const [x, y] = spots[0];
        world.set(x, y, T.PRED);
        world.agents.push(world.makeAgent(x, y, T.PRED));
        energy -= predCost;
      }
    }
    if (world.live(T.HERB).length === 0 && energy >= herbCost) {
      const spots = emptyCells(world, cx, cy);
      if (spots.length) {
        const [x, y] = spots[0];
        world.set(x, y, T.HERB);
        world.agents.push(world.makeAgent(x, y, T.HERB));
        energy -= herbCost;
      }
    }
    let planted = true;
    while (planted && energy >= plantCost) {
      planted = false;
      const spots = emptyCells(world, cx, cy);
      if (!spots.length) break;
      const [x, y] = spots[0];
      world.setPlant(x, y, T.STAGE_GRASS, 0);
      energy -= plantCost;
      planted = true;
    }
  }

  spend();

  for (let g = 0; g < maxGens; g++) {
    world.step();
    energy += world.pendingEnergy;
    world.pendingEnergy = 0;
    if (g % 2 === 0) spend();
    world.checkArcadeEnd(energy, herbCost);
    if (world.gameOver) {
      return {
        survived: g + 1,
        gameOver: true,
        reason: world.gameOverReason,
        energy,
        herbs: world.live(T.HERB).length,
        preds: world.live(T.PRED).length,
        sustainedChain: world.sustainedChain,
        alive: world.isAlive()
      };
    }
  }

  return {
    survived: maxGens,
    gameOver: false,
    energy,
    herbs: world.live(T.HERB).length,
    preds: world.live(T.PRED).length,
    sustainedChain: world.sustainedChain,
    alive: world.isAlive()
  };
}

function simulatePlantsOnly(ctx, { startEnergy, maxGens = 50, herbCost, plantCost }) {
  const costs = toolCosts(ctx);
  herbCost = herbCost ?? costs.HERB_COST;
  plantCost = plantCost ?? costs.PLANT_COST;
  const { World, LIFE_TYPES: T } = ctx;
  const world = new World(28, 28);
  world.arcade = true;
  world.makeDish();
  let energy = startEnergy;
  let gainedEnergy = 0;
  const cy = 14;
  for (let x = 10; x < 22 && energy >= plantCost; x++) {
    if (world.inDish(x, cy) && world.get(x, cy) === T.EMPTY) {
      world.setPlant(x, cy, T.STAGE_GRASS, 0);
      energy -= plantCost;
    }
  }
  for (let g = 0; g < maxGens; g++) {
    world.step();
    gainedEnergy += world.pendingEnergy;
    energy += world.pendingEnergy;
    world.pendingEnergy = 0;
    world.checkArcadeEnd(energy, herbCost);
    if (world.gameOver) return { died: g + 1, reason: world.gameOverReason, energy, gainedEnergy };
  }
  return { survived: maxGens, energy, gainedEnergy };
}

module.exports = {
  toolCost,
  toolCosts,
  simulateArcade,
  simulatePlantsOnly
};
