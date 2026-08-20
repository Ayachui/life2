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

function tickWallet(world, gens) {
  for (let i = 0; i < gens; i++) {
    world.step();
    world.playerEnergy = Math.max(0, (world.playerEnergy || 0) + world.pendingEnergy);
    world.pendingEnergy = 0;
  }
}

describe("аркада: импульс ⚡ без налога леса", () => {
  test("густой лес не сжигает стартовый запас", () => {
    const { world, T } = createWorld(16, 16);
    world.arcade = true;
    world.playerEnergy = 80;
    world.arcadeBudget = 134;
    for (let y = 1; y < 15; y++) {
      for (let x = 1; x < 15; x++) world.setPlant(x, y, T.STAGE_GRASS, 0);
    }
    assert.equal(world.arcadeUpkeep(), 0);
    tickWallet(world, 20);
    assert.equal(world.playerEnergy, 80);
    assert.equal(world.energyAudit.upkeep || 0, 0);
    assert.equal(world.energyAudit.surplusDecay || 0, 0);
    assert.equal(world.energyAudit.pulse || 0, 0);
  });

  test("остаток выше бюджета тоже не сгорает", () => {
    const { world } = createWorld();
    world.arcade = true;
    world.playerEnergy = 400;
    world.arcadeBudget = 134;
    tickWallet(world, 25);
    assert.equal(world.playerEnergy, 400);
    assert.equal(world.energyAudit.surplusDecay || 0, 0);
  });

  test("при зайцах ⚡ копится даже в густом лесу", () => {
    const { world, T } = createWorld(16, 16);
    world.arcade = true;
    world.playerEnergy = 0;
    world.arcadeBudget = 134;
    world.set(4, 4, T.HERB);
    world.agents = [world.makeAgent(4, 4, T.HERB)];
    for (let y = 1; y < 15; y++) {
      for (let x = 1; x < 15; x++) {
        if (x === 4 && y === 4) continue;
        world.setPlant(x, y, T.STAGE_GRASS, 0);
      }
    }
    let energy = 0;
    for (let i = 0; i < 12; i++) {
      world.playerEnergy = energy;
      world.step();
      energy = Math.max(0, energy + world.pendingEnergy);
      world.pendingEnergy = 0;
    }
    assert.ok(energy >= 8, `накопили ${energy}`);
    assert.ok((world.energyAudit.pulse || 0) >= 8);
  });

  test("после цепочки густой лес не блокирует ⚡", () => {
    const { world, T } = createWorld(16, 16);
    world.arcade = true;
    world.sustainedChain = true;
    world.playerEnergy = 5;
    world.arcadeBudget = 500;
    world.set(4, 4, T.HERB);
    world.agents = [world.makeAgent(4, 4, T.HERB)];
    for (let y = 1; y < 15; y++) {
      for (let x = 1; x < 15; x++) {
        if (x === 4 && y === 4) continue;
        world.setPlant(x, y, T.STAGE_GRASS, 0);
      }
    }
    let energy = 5;
    for (let i = 0; i < 20; i++) {
      world.playerEnergy = energy;
      world.step();
      energy = Math.max(0, energy + world.pendingEnergy);
      world.pendingEnergy = 0;
    }
    assert.ok(energy > 5, `⚡ должна расти, получили ${energy}`);
    assert.equal(world.energyAudit.upkeep || 0, 0);
  });

  test("импульс копится без потолка запаса", () => {
    const { world, T } = createWorld();
    world.arcade = true;
    world.arcadeBudget = 134;
    world.playerEnergy = 90;
    world.set(4, 4, T.HERB);
    world.agents = [world.makeAgent(4, 4, T.HERB)];
    let energy = 90;
    for (let i = 0; i < 12; i++) {
      world.playerEnergy = energy;
      world.step();
      energy = Math.max(0, energy + world.pendingEnergy);
      world.pendingEnergy = 0;
    }
    assert.ok(energy > 90, `запас должен расти выше 90, получили ${energy}`);
    assert.equal(world.arcadePulseCap(), Infinity);
  });

  test("лиса не ставит потолок запаса", () => {
    const { world, T } = createWorld();
    world.arcade = true;
    world.sustainedChain = true;
    world.set(4, 4, T.HERB);
    world.set(5, 5, T.PRED);
    world.agents = [world.makeAgent(4, 4, T.HERB), world.makeAgent(5, 5, T.PRED)];
    assert.equal(world.arcadePulseCap(), Infinity);
    world.agents.pop();
    world.set(5, 5, 0);
    assert.equal(world.arcadePulseCap(), Infinity);
  });

  test("лису нельзя купить при <4 зайцах", () => {
    const { world, T } = createWorld();
    world.arcade = true;
    world.setPlant(3, 3, T.STAGE_GRASS, 0);
    world.set(4, 4, T.HERB);
    world.agents = [world.makeAgent(4, 4, T.HERB)];
    assert.equal(world.arcadeToolGate("pred").ok, false);
    for (let i = 0; i < 3; i++) {
      world.set(5 + i, 4, T.HERB);
      world.agents.push(world.makeAgent(5 + i, 4, T.HERB));
    }
    world.invalidateCountsCache();
    assert.equal(world.arcadeToolGate("pred").ok, true);
  });

  test("устойчивая цепочка не кончает партию по таймеру", () => {
    const { world, T } = createWorld();
    world.arcade = true;
    world.set(4, 4, T.HERB);
    world.agents = [world.makeAgent(4, 4, T.HERB)];
    world.setPlant(5, 5, T.STAGE_GRASS, 0);
    world.sustainedChain = true;
    world.chainLockGen = 10;
    world.generation = 800;
    world.checkArcadeEnd(90, 45);
    assert.equal(world.gameOver, false);
  });

  test("давление рулетки растёт со временем", () => {
    const { world } = createWorld();
    world.rng = () => 0;
    world.generation = 0;
    const early = world.roulettePct("plague");
    world.generation = 800;
    const late = world.roulettePct("plague");
    assert.equal(world.roulettePressure(), 1.8);
    assert.ok(late > early, `early ${early} late ${late}`);
    assert.ok(late <= 0.85);
  });
});
