const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { createWorld } = require("./harness.cjs");

function toolCost(LIFE_DATA, id) {
  return LIFE_DATA.tools.find((t) => t.id === id).cost;
}

describe("баланс: цены инструментов", () => {
  test("возрастающая стоимость по уровню цепочки", () => {
    const { LIFE_DATA } = createWorld();
    const plant = toolCost(LIFE_DATA, "plant");
    const herb = toolCost(LIFE_DATA, "herb");
    const pred = toolCost(LIFE_DATA, "pred");
    const bear = toolCost(LIFE_DATA, "bear");
    assert.ok(plant < herb);
    assert.ok(herb < pred);
    assert.ok(pred < bear);
  });

  test("хардкор: старт с зайцем и травой, без полной цепочки сразу", () => {
    const { LIFE_DATA } = createWorld();
    const hard = LIFE_DATA.difficulties.find((d) => d.id === "hardcore");
    const plant = toolCost(LIFE_DATA, "plant");
    const herb = toolCost(LIFE_DATA, "herb");
    const pred = toolCost(LIFE_DATA, "pred");
    assert.ok(hard.energy >= herb + plant * 3, "можно купить зайца и несколько трав");
    assert.ok(hard.energy < herb + pred, "полная цепочка сразу недоступна");
  });
});

describe("баланс: пассивный доход ⚡", () => {
  test("таблица arcadeEnergy: нет повторяющегося ⚡", () => {
    const { LIFE_DATA } = createWorld();
    assert.equal(LIFE_DATA.arcadeEnergy.hunt, 0);
    assert.equal(LIFE_DATA.arcadeEnergy.koalaTreeBite, 0);
    assert.equal(LIFE_DATA.arcadeEnergy.animalBirth, 0);
    assert.equal(LIFE_DATA.arcadeEnergy.animalDeath, 0);
    assert.equal(LIFE_DATA.arcadeEnergy.plantEvolveBush, 0);
    assert.equal(LIFE_DATA.arcadeEnergy.plantSprout, 0);
    assert.equal(LIFE_DATA.arcadeEnergy.plantEvolveGrass, 0);
  });

  test("дерево не окупает посадку пассивным ⚡", () => {
    const { LIFE_DATA, PLANT_CFG } = createWorld();
    const plant = toolCost(LIFE_DATA, "plant");
    const evo = LIFE_DATA.arcadeEnergy.plantEvolveBush;
    const ticks = PLANT_CFG.grassToBush + PLANT_CFG.bushToTree;
    assert.equal(evo, 0);
    assert.ok(ticks >= 30, "эволюция занимает заметное время");
    assert.ok(plant > 0);
  });

  test("мутация вида слабее зайца, крол — почти зайц", () => {
    const { LIFE_DATA } = createWorld();
    const herb = toolCost(LIFE_DATA, "herb");
    const avg = (
      LIFE_DATA.mutationEnergy["коала"] +
      LIFE_DATA.mutationEnergy["корова"] +
      LIFE_DATA.mutationEnergy["волк"] +
      LIFE_DATA.mutationEnergy["лось"]
    ) / 4;
    assert.ok(avg < herb * 0.5);
    assert.ok(LIFE_DATA.mutationEnergy["крол-душегуб"] >= herb * 0.55);
    assert.ok(LIFE_DATA.mutationEnergy["крол-душегуб"] < herb);
  });

  test("симуляция: лес из 8 трав не даёт быстрый бесконечный доход", () => {
    let peak = 0;
    for (let trial = 0; trial < 5; trial++) {
      const { world, T } = createWorld(16, 16);
      world.arcade = true;
      world.makeDish();
      for (let i = 0; i < 8; i++) world.setPlant(8 + i, 8, T.STAGE_GRASS, 0);

      let totalEnergy = 0;
      for (let g = 0; g < 80; g++) {
        world.step();
        totalEnergy += world.pendingEnergy;
      }
      if (totalEnergy > peak) peak = totalEnergy;
    }

    assert.equal(peak, 0, "без травоядных лес не даёт ⚡");
  });
});

describe("баланс: энергия экосистемы", () => {
  test("охота в цепочке даёт очки, не ⚡", () => {
    const { world, T } = createWorld();
    world.arcade = true;
    world.set(8, 9, T.HERB);
    world.agents = [world.makeAgent(8, 9, T.HERB)];
    const prey = world.makeAgent(8, 8, T.HERB);
    const fox = world.makeAgent(9, 8, T.PRED);
    world.agents.push(prey, fox);
    world.set(8, 8, T.HERB);
    world.set(9, 8, T.PRED);
    const pointsBefore = world.lifePoints;
    world.killAgent(prey, fox, 7.2);
    assert.equal(world.pendingEnergy, 0);
    assert.ok(world.lifePoints > pointsBefore);
  });
});

describe("баланс: кусты и трава", () => {
  test("кусты сеют траву в 1.5 раза реже", () => {
    const { PLANT_CFG } = createWorld();
    assert.ok(Math.abs(PLANT_CFG.bushSpread - 0.055 / 1.5) < 0.002);
    assert.equal(PLANT_CFG.bushFoodWeight, 0.4);
    assert.ok(Math.abs(PLANT_CFG.bushViabilityWeight - 0.5 / 1.5) < 0.01);
  });
});

describe("баланс: скорость экосистемы", () => {
  test("заяц голодает быстрее медведя (относительно запаса)", () => {
    const { world, T } = createWorld();
    const herb = world.makeAgent(0, 0, T.HERB);
    const bear = world.makeAgent(1, 0, T.BEAR);
    const herbTicks = herb.energy / herb.drain;
    const bearTicks = bear.energy / bear.drain;
    assert.ok(herbTicks < bearTicks * 0.6, "заяц должен быть уязвимее");
  });

  test("лиса без зайцев умирает за разумный срок", () => {
    const { world, T } = createWorld();
    world.set(3, 3, T.PRED);
    const fox = world.makeAgent(3, 3, T.PRED);
    world.agents = [fox];
    let survived = 0;
    for (let i = 0; i < 60; i++) {
      world.stepAgents();
      world.generation++;
      if (!fox.dead) survived++;
    }
    assert.ok(survived < 40, "лиса без добычи не должна жить вечно");
    assert.ok(fox.dead);
  });
});

describe("баланс: мутации", () => {
  test("шанс крола 0.25%", () => {
    const { LIFE_BALANCE, MUT_CHANCE } = createWorld();
    assert.equal(LIFE_BALANCE.mutationChance.krol, 0.0025);
    assert.equal(MUT_CHANCE.krol, 0.0025);
  });

  test("базовый шанс вида при рождении умеренный", () => {
    const { LIFE_BALANCE, MUT_CHANCE } = createWorld();
    assert.equal(MUT_CHANCE.koala, 0.01);
    assert.equal(MUT_CHANCE.cow, 0.01);
    assert.equal(LIFE_BALANCE.mutationChance.koala, LIFE_BALANCE.mutationChance.cow);
  });

  test("буст мутации: ×2 за каждое поколение существа", () => {
    const { world } = createWorld();
    assert.equal(world.effectiveChance(0.02, 1), 0.02);
    assert.ok(Math.abs(world.effectiveChance(0.02, 2) - 0.04) < 1e-12);
    assert.ok(Math.abs(world.effectiveChance(0.02, 5) - 0.32) < 1e-12);
  });

  test("поколение 3: крол 0.25% × 4 = 1%", () => {
    const { world } = createWorld();
    const effective = world.effectiveChance(0.0025, 3);
    assert.ok(Math.abs(effective - 0.01) < 1e-12);
  });

  test("посаженный зверь — поколение 1, потомок — +1", () => {
    const { world, T } = createWorld();
    const parent = world.makeAgent(0, 0, T.HERB);
    const baby = world.makeAgent(1, 0, T.HERB, parent);
    assert.equal(parent.gen, 1);
    assert.equal(baby.gen, 2);
  });

  test("крол-душегуб: 6 действий за цикл", () => {
    const { LIFE_BALANCE } = createWorld();
    assert.equal(LIFE_BALANCE.species.krol.movesPerTick, 6);
    assert.equal(LIFE_BALANCE.mutationChance.krol, 0.0025);
  });

  test("MUT_CHANCE совпадает с LIFE_BALANCE", () => {
    const { LIFE_BALANCE, MUT_CHANCE } = createWorld();
    assert.equal(MUT_CHANCE.krol, LIFE_BALANCE.mutationChance.krol);
    assert.equal(MUT_CHANCE.koala, LIFE_BALANCE.mutationChance.koala);
    assert.equal(MUT_CHANCE.cow, LIFE_BALANCE.mutationChance.cow);
    assert.equal(MUT_CHANCE.wolf, LIFE_BALANCE.mutationChance.wolf);
    assert.equal(MUT_CHANCE.elk, LIFE_BALANCE.mutationChance.elk);
  });

  test("roulette.interval единый источник", () => {
    const { LIFE_DATA, LIFE_BALANCE } = createWorld();
    assert.equal(LIFE_DATA.roulette.interval, LIFE_BALANCE.roulette.interval);
    assert.equal(LIFE_BALANCE.roulette.interval, 100);
  });
});
