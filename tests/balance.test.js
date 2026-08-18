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
  test("дерево окупает меньше половины травы", () => {
    const { LIFE_DATA, PLANT_CFG } = createWorld();
    const plant = toolCost(LIFE_DATA, "plant");
    const evo = LIFE_DATA.plantEvolutionEnergy;
    const ticks = PLANT_CFG.grassToBush + PLANT_CFG.bushToTree;
    assert.ok(evo < plant * 0.5, "1 дерево не должно полностью окупать посадку");
    assert.ok(ticks >= 30, "эволюция занимает заметное время");
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
    assert.ok(avg < herb * 0.75);
    assert.ok(LIFE_DATA.mutationEnergy["крол-душегуб"] >= herb * 0.75);
    assert.ok(LIFE_DATA.mutationEnergy["крол-душегуб"] <= herb);
  });

  test("симуляция: лес из 8 трав не даёт быстрый бесконечный доход", () => {
    const { world, T } = createWorld(16, 16);
    world.arcade = true;
    world.makeDish();
    for (let i = 0; i < 8; i++) world.setPlant(8 + i, 8, T.STAGE_GRASS, 0);

    let totalEnergy = 0;
    for (let g = 0; g < 80; g++) {
      world.step();
      totalEnergy += world.pendingEnergy;
    }

    assert.ok(totalEnergy <= 35, `за 80 циклов ожидали ≤35 ⚡, получили ${totalEnergy}`);
    assert.ok(totalEnergy >= 1, "хотя бы одно дерево должно созреть");
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
    const engineSrc = require("fs").readFileSync(require("path").join(__dirname, "..", "js", "engine.js"), "utf8");
    const match = engineSrc.match(/krol:\s*([\d.]+)/);
    assert.ok(match);
    assert.equal(Number(match[1]), 0.0025);
  });

  test("базовый шанс вида при рождении умеренный", () => {
    const engineSrc = require("fs").readFileSync(require("path").join(__dirname, "..", "js", "engine.js"), "utf8");
    const match = engineSrc.match(/koala:\s*([\d.]+)/);
    assert.ok(match);
    assert.equal(Number(match[1]), 0.02);
  });

  test("буст мутации: 30% от базового шанса за каждый цикл мира", () => {
    const { world } = createWorld();
    world.generation = 0;
    assert.equal(world.effectiveChance(0.02), 0.02);
    world.generation = 1;
    assert.ok(Math.abs(world.effectiveChance(0.02) - 0.026) < 1e-12);
    world.generation = 10;
    assert.ok(Math.abs(world.effectiveChance(0.02) - 0.08) < 1e-12);
  });

  test("буст не добавляет абсолютные процентные пункты", () => {
    const { world } = createWorld();
    world.generation = 5;
    const base = 0.0025;
    const effective = world.effectiveChance(base);
    assert.ok(Math.abs(effective - base * (1 + 0.3 * 5)) < 1e-12);
    assert.ok(effective < 0.01);
  });

  test("крол на 4-м цикле: 0.25% × 2.2 ≈ 0.55%", () => {
    const { world } = createWorld();
    world.generation = 4;
    const effective = world.effectiveChance(0.0025);
    assert.ok(Math.abs(effective - 0.0025 * 2.2) < 1e-12);
  });
});
