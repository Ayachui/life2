const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { loadEngine, createWorld } = require("./harness.cjs");
const {
  PLANT_COST,
  HERB_COST,
  PRED_COST,
  toolCost,
  simulateArcade,
  simulatePlantsOnly
} = require("./arcade-sim.cjs");

function diff(LIFE_DATA, id) {
  return LIFE_DATA.difficulties.find((d) => d.id === id);
}

describe("аркада: стартовая энергия", () => {
  test("возрастающая сложность — убывающая энергия", () => {
    const { LIFE_DATA } = createWorld();
    const levels = ["easy", "medium", "hard", "hardcore"].map((id) => diff(LIFE_DATA, id).energy);
    for (let i = 1; i < levels.length; i++) {
      assert.ok(levels[i - 1] > levels[i], `${levels[i - 1]} > ${levels[i]}`);
    }
  });

  test("хардкор: хватает на зайца и несколько трав", () => {
    const { LIFE_DATA } = createWorld();
    const hardcore = diff(LIFE_DATA, "hardcore");
    assert.ok(hardcore.energy >= HERB_COST + PLANT_COST * 3,
      "минимум зайц + 3 травы");
    assert.ok(hardcore.energy < HERB_COST + PRED_COST,
      "лиса сразу недоступна");
  });

  test("сложный: хватает на зайца, лису и траву", () => {
    const { LIFE_DATA } = createWorld();
    const hard = diff(LIFE_DATA, "hard");
    assert.ok(hard.energy >= HERB_COST + PRED_COST + PLANT_COST);
  });

  test("средний: хватает на зайца, лису и запас травы", () => {
    const { LIFE_DATA } = createWorld();
    const medium = diff(LIFE_DATA, "medium");
    assert.ok(medium.energy >= HERB_COST + PRED_COST + PLANT_COST * 5);
  });
});

describe("аркада: таймер без зверей", () => {
  test("только трава: хардкор доживает до лимита ожидания", () => {
    const ctx = loadEngine();
    const hardcore = diff(ctx.LIFE_DATA, "hardcore");
    const r = simulatePlantsOnly(ctx, {
      startEnergy: hardcore.energy,
      maxGens: ctx.ARCADE_STALE_AFTER + 5
    });
    assert.ok(!r.died || r.died >= ctx.ARCADE_STALE_AFTER,
      `слишком рано: ${JSON.stringify(r)}`);
    assert.ok(r.energy < PRED_COST, "пассивного дохода не хватает на лису");
  });

  test("устаревший хардкор 50⚡ заканчивался бы на лимите", () => {
    const ctx = loadEngine();
    const r = simulatePlantsOnly(ctx, { startEnergy: 50, maxGens: 50 });
    assert.ok(r.died <= ctx.ARCADE_STALE_AFTER + 1);
    assert.equal(r.reason, "no_chain");
  });
});

describe("аркада: симуляция бота", () => {
  test("хардкор достигает устойчивой цепочки", () => {
    const ctx = loadEngine();
    const hardcore = diff(ctx.LIFE_DATA, "hardcore");
    const r = simulateArcade(ctx, { startEnergy: hardcore.energy, maxGens: 160 });
    assert.ok(r.sustainedChain, `ожидали цепочку 25+, получили ${JSON.stringify(r)}`);
  });

  test("хардкор не заканчивается мгновенно", () => {
    const ctx = loadEngine();
    const hardcore = diff(ctx.LIFE_DATA, "hardcore");
    const r = simulateArcade(ctx, { startEnergy: hardcore.energy, maxGens: 80 });
    assert.ok(r.survived >= 50, `слишком ранний конец: ${r.survived}`);
    assert.equal(r.gameOver, false);
  });

  test("сложный: устойчивая цепочка и выживание 120+ ходов", () => {
    const ctx = loadEngine();
    const hard = diff(ctx.LIFE_DATA, "hard");
    const r = simulateArcade(ctx, { startEnergy: hard.energy, maxGens: 150 });
    assert.ok(r.sustainedChain);
    assert.ok(r.survived >= 120 || !r.gameOver);
  });

  test("средний: устойчивая цепочка", () => {
    const ctx = loadEngine();
    const medium = diff(ctx.LIFE_DATA, "medium");
    const r = simulateArcade(ctx, { startEnergy: medium.energy, maxGens: 120 });
    assert.ok(r.sustainedChain);
  });

  test("лёгкий: мир живёт после цепочки", () => {
    const ctx = loadEngine();
    const easy = diff(ctx.LIFE_DATA, "easy");
    const r = simulateArcade(ctx, { startEnergy: easy.energy, maxGens: 100 });
    assert.ok(r.sustainedChain);
    assert.ok(r.alive, "экосистема не должна обнуляться сразу после цепочки");
  });
});

describe("аркада: устойчивость после цепочки", () => {
  test("пустая чашка не завершает игру сразу при sustainedChain", () => {
    const { world } = createWorld();
    world.arcade = true;
    world.sustainedChain = true;
    world.generation = 10;
    assert.equal(world.isAlive(), false);
    world.step();
    assert.equal(world.gameOver, false, "после цепочки можно восстановить лес");
  });

  test("полное вымирание завершает игру даже после цепочки", () => {
    const { world, ARCADE_LONELY_MAX } = createWorld();
    world.arcade = true;
    world.sustainedChain = true;
    world.lonelyGens = ARCADE_LONELY_MAX;
    world.noAnimalGens = ARCADE_LONELY_MAX;
    world.noHerbGens = ARCADE_LONELY_MAX;
    world.generation = ARCADE_LONELY_MAX + 1;
    world.checkArcadeEnd(6, 45);
    assert.equal(world.gameOver, true);
  });

  test("только лес без зайцев завершает игру по таймеру", () => {
    const { world, T, ARCADE_LONELY_MAX } = createWorld();
    world.arcade = true;
    world.sustainedChain = true;
    world.setPlant(5, 5, T.STAGE_GRASS, 0);
    world.noHerbGens = ARCADE_LONELY_MAX;
    world.checkArcadeEnd(1000, 45);
    assert.equal(world.gameOver, true);
    assert.equal(world.gameOverReason, "no_chain");
  });
});
