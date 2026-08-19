const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { loadEngine, createWorld } = require("./harness.cjs");
const {
  toolCost,
  toolCosts,
  simulateArcade,
  simulatePlantsOnly
} = require("./arcade-sim.cjs");

function costs(ctx) {
  return toolCosts(ctx);
}

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
    const ctx = loadEngine();
    const { PLANT_COST, HERB_COST, PRED_COST } = costs(ctx);
    const { LIFE_DATA } = ctx;
    const hardcore = diff(LIFE_DATA, "hardcore");
    assert.ok(hardcore.energy >= HERB_COST + PLANT_COST * 3,
      "минимум зайц + 3 травы");
    assert.ok(hardcore.energy < HERB_COST + PRED_COST,
      "лиса сразу недоступна");
  });

  test("сложный: хватает на зайца, лису и траву", () => {
    const ctx = loadEngine();
    const { PLANT_COST, HERB_COST, PRED_COST } = costs(ctx);
    const hard = diff(ctx.LIFE_DATA, "hard");
    assert.ok(hard.energy >= HERB_COST + PRED_COST + PLANT_COST);
  });

  test("средний: хватает на зайца, лису и запас травы", () => {
    const ctx = loadEngine();
    const { PLANT_COST, HERB_COST, PRED_COST } = costs(ctx);
    const medium = diff(ctx.LIFE_DATA, "medium");
    assert.ok(medium.energy >= HERB_COST + PRED_COST + PLANT_COST * 5);
  });
});

describe("аркада: таймер без зверей", () => {
  test("только трава: хардкор доживает до лимита ожидания", () => {
    const ctx = loadEngine();
    const { PRED_COST } = costs(ctx);
    const hardcore = diff(ctx.LIFE_DATA, "hardcore");
    const r = simulatePlantsOnly(ctx, {
      startEnergy: hardcore.energy,
      maxGens: ctx.ARCADE_STALE_AFTER + 5
    });
    assert.ok(!r.died || r.died >= ctx.ARCADE_STALE_AFTER,
      `слишком рано: ${JSON.stringify(r)}`);
    assert.ok(r.gainedEnergy < PRED_COST, "пассивного дохода не хватает на лису");
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
    const { world, T, ARCADE_NO_HERB_MAX } = createWorld();
    world.arcade = true;
    world.sustainedChain = true;
    world.setPlant(5, 5, T.STAGE_GRASS, 0);
    world.noHerbGens = ARCADE_NO_HERB_MAX;
    world.checkArcadeEnd(1000, 45);
    assert.equal(world.gameOver, true);
    assert.equal(world.gameOverReason, "no_chain");
  });

  test("только хищники без травоядных — быстрый конец", () => {
    const { world, T, ARCADE_PRED_ONLY_MAX } = createWorld();
    world.arcade = true;
    world.set(3, 3, T.PRED);
    world.agents = [world.makeAgent(3, 3, T.PRED)];
    world.setPlant(5, 5, T.STAGE_TREE, 0);
    world.noHerbGens = ARCADE_PRED_ONLY_MAX;
    world.checkArcadeEnd(1000, 45);
    assert.equal(world.gameOver, true);
  });
});

describe("аркада: импульс ⚡ и эра", () => {
  test("густой лес не съедает импульс у нуля", () => {
    const { world, T, LIFE_BALANCE } = createWorld(16, 16);
    world.arcade = true;
    world.playerEnergy = 0;
    world.arcadeBudget = 134;
    world.sustainedChain = true;
    for (let y = 1; y < 15; y++) {
      for (let x = 1; x < 15; x++) world.setPlant(x, y, T.STAGE_GRASS, 0);
    }
    assert.ok(world.arcadeUpkeep() > 0);
    let pulsed = 0;
    for (let i = 0; i < 6; i++) {
      world.playerEnergy = 0;
      world.step();
      pulsed += world.pendingEnergy;
      world.pendingEnergy = 0;
    }
    assert.ok(pulsed >= 2, `импульс ${pulsed}`);
    assert.ok((world.energyAudit.pulse || 0) >= 2);
    assert.ok(pulsed <= LIFE_BALANCE.arcadeEconomy.pulseCap);
  });

  test("импульс не копится выше cap", () => {
    const { world, LIFE_BALANCE } = createWorld();
    const cap = LIFE_BALANCE.arcadeEconomy.pulseCap;
    world.arcade = true;
    world.arcadeBudget = 134;
    world.sustainedChain = true;
    world.playerEnergy = cap;
    for (let i = 0; i < 8; i++) {
      world.playerEnergy = cap;
      world.step();
      assert.equal(world.pendingEnergy, 0, `pending ${world.pendingEnergy} на шаге ${i}`);
      world.pendingEnergy = 0;
    }
  });

  test("живая чашка с 0⚡ заканчивает эру, не зрителя", () => {
    const { world, T, LIFE_BALANCE } = createWorld();
    const era = LIFE_BALANCE.arcadeEnd.eraAfterChain;
    world.arcade = true;
    world.set(4, 4, T.HERB);
    world.agents = [world.makeAgent(4, 4, T.HERB)];
    world.setPlant(5, 5, T.STAGE_GRASS, 0);
    world.sustainedChain = true;
    world.chainLockGen = 10;
    world.generation = 10 + era;
    world.checkArcadeEnd(0, 45);
    assert.equal(world.gameOver, true);
    assert.equal(world.gameOverReason, "era_complete");
  });

  test("эра не режет старт цепочки", () => {
    const { world, T, LIFE_BALANCE } = createWorld();
    world.arcade = true;
    world.set(4, 4, T.HERB);
    world.agents = [world.makeAgent(4, 4, T.HERB)];
    world.sustainedChain = true;
    world.chainLockGen = 20;
    world.generation = 20 + LIFE_BALANCE.arcadeEnd.eraAfterChain - 1;
    world.checkArcadeEnd(0, 45);
    assert.equal(world.gameOver, false);
  });
});
