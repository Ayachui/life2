const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { createWorld } = require("./harness.cjs");

describe("поедание растений", () => {
  test("трава съедается за 2 укуса с соседней клетки", () => {
    const { world, T, PLANT_CFG } = createWorld();
    world.set(5, 5, T.HERB);
    const herb = world.makeAgent(5, 5, T.HERB);
    herb.energy = 5;
    herb.thresh = 13;
    world.agents = [herb];
    world.setPlant(6, 5, T.STAGE_GRASS, 0);
    const e0 = herb.energy;
    world.feedHungryHerb(herb);
    assert.equal(world.get(6, 5), T.PLANT);
    assert.equal(world.plantBites[world.idx(6, 5)], PLANT_CFG.grassBites - 1);
    world.feedHungryHerb(herb);
    assert.equal(world.get(6, 5), T.EMPTY);
    assert.ok(herb.energy > e0);
  });

  test("заяц не заходит на клетку травы", () => {
    const { world, T } = createWorld();
    world.set(5, 5, T.HERB);
    const herb = world.makeAgent(5, 5, T.HERB);
    herb.energy = 5;
    world.agents = [herb];
    world.setPlant(6, 5, T.STAGE_GRASS, 0);
    world.feedHungryHerb(herb);
    assert.equal(herb.x, 5);
    assert.equal(herb.y, 5);
  });

  test("куст съедается за 4 укуса", () => {
    const { world, T, PLANT_CFG } = createWorld();
    const herb = world.makeAgent(5, 5, T.HERB);
    herb.energy = 1;
    herb.thresh = 99;
    world.agents = [herb];
    world.setPlant(6, 5, T.STAGE_BUSH, 0);
    for (let i = 0; i < PLANT_CFG.bushBites; i++) world.feedHungryHerb(herb);
    assert.equal(world.get(6, 5), T.EMPTY);
    assert.equal(herb.eating, null);
  });

  test("энергия с травы и куста около 3.5", () => {
    const { world, T, PLANT_CFG } = createWorld();
    const herb = world.makeAgent(5, 5, T.HERB);
    herb.energy = 0;
    herb.thresh = 99;
    world.agents = [herb];
    world.setPlant(6, 5, T.STAGE_GRASS, 0);
    for (let i = 0; i < PLANT_CFG.grassBites; i++) world.feedHungryHerb(herb);
    const grassGain = herb.energy;
    herb.energy = 0;
    herb.eating = null;
    world.setPlant(6, 5, T.STAGE_BUSH, 0);
    for (let i = 0; i < PLANT_CFG.bushBites; i++) world.feedHungryHerb(herb);
    const bushGain = herb.energy;
    assert.ok(Math.abs(grassGain - PLANT_CFG.grassEnergy) < 0.01);
    const bushTotal = PLANT_CFG.bushBites * PLANT_CFG.bushEnergyPerBite;
    assert.ok(Math.abs(bushGain - bushTotal) < 0.01);
  });
});

describe("эволюция кустов", () => {
  test("куст → дерево ровно за bushToTree тиков", () => {
    const { world, T, PLANT_CFG } = createWorld();
    world.setPlant(4, 4, T.STAGE_BUSH, 0);
    for (let i = 0; i < PLANT_CFG.bushToTree - 1; i++) world.growPlants();
    assert.equal(world.plantStageAt(4, 4), T.STAGE_BUSH);
    world.growPlants();
    assert.equal(world.plantStageAt(4, 4), T.STAGE_TREE);
  });

  test("полный цикл трава → куст → дерево за grassToBush + bushToTree", () => {
    const { world, T, PLANT_CFG } = createWorld();
    world.setPlant(3, 3, T.STAGE_GRASS, 0);
    const total = PLANT_CFG.grassToBush + PLANT_CFG.bushToTree;
    for (let i = 0; i < total; i++) world.step();
    assert.equal(world.plantStageAt(3, 3), T.STAGE_TREE);
  });

  test("две соседние травы возвращают зайца к сытости", () => {
    const { world, T } = createWorld(10, 10);
    world.set(5, 5, T.HERB);
    const herb = world.makeAgent(5, 5, T.HERB);
    herb.energy = 8;
    herb.thresh = 13;
    world.agents = [herb];
    world.setPlant(6, 5, T.STAGE_GRASS, 0);
    world.setPlant(5, 6, T.STAGE_GRASS, 0);
    for (let g = 0; g < 10; g++) {
      world.stepAgents();
      world.generation++;
      if (herb.energy >= herb.thresh) break;
    }
    assert.ok(herb.energy >= herb.thresh, `энергия ${herb.energy}, нужно ${herb.thresh}`);
  });

  test("кольцо из 8 трав кормит зайца в среднем 50+ циклов", () => {
    const { T } = createWorld();
    let total = 0;
    const trials = 16;
    for (let t = 0; t < trials; t++) {
      const w = createWorld(14, 14).world;
      w.makeDish();
      const cx = 7;
      const cy = 7;
      w.set(cx, cy, T.HERB);
      const herb = w.makeAgent(cx, cy, T.HERB);
      w.agents = [herb];
      const spots = [[cx + 2, cy], [cx - 2, cy], [cx, cy + 2], [cx, cy - 2],
        [cx + 2, cy + 2], [cx - 2, cy - 2], [cx + 2, cy - 2], [cx - 2, cy + 2]];
      for (const [x, y] of spots) {
        if (w.get(x, y) === T.EMPTY) w.setPlant(x, y, T.STAGE_GRASS, 0);
      }
      let lived = 80;
      for (let g = 0; g < 80; g++) {
        w.step();
        if (herb.dead) {
          lived = g + 1;
          break;
        }
      }
      total += lived;
    }
    assert.ok(total / trials >= 50, `средняя жизнь ${(total / trials).toFixed(1)} циклов, ожидали ≥50`);
  });

  test("куст за жизнь до дерева обычно сеет траву", () => {
    const { T, PLANT_CFG } = createWorld(12, 12);
    let successes = 0;
    const trials = 24;
    for (let t = 0; t < trials; t++) {
      const w = createWorld(12, 12).world;
      w.setPlant(6, 6, T.STAGE_BUSH, 0);
      for (let i = 0; i < PLANT_CFG.bushToTree; i++) w.growPlants();
      let grass = 0;
      for (let y = 0; y < w.h; y++) {
        for (let x = 0; x < w.w; x++) {
          if (w.plantStageAt(x, y) === T.STAGE_GRASS) grass++;
        }
      }
      if (grass >= 1) successes++;
    }
    assert.ok(successes >= trials * 0.6, `кусты сеют редко: ${successes}/${trials}`);
  });

  test("без зверей куст успевает созреть до дерева", () => {
    const { world, T, PLANT_CFG } = createWorld();
    world.setPlant(5, 5, T.STAGE_GRASS, PLANT_CFG.grassToBush - 1);
    world.step();
    assert.equal(world.plantStageAt(5, 5), T.STAGE_BUSH);
    for (let i = 0; i < PLANT_CFG.bushToTree; i++) world.step();
    assert.equal(world.plantStageAt(5, 5), T.STAGE_TREE);
  });
});

describe("энергия за эволюцию", () => {
  test("куст → дерево даёт 1 ⚡ в аркаде", () => {
    const { world, T, PLANT_CFG } = createWorld();
    world.arcade = true;
    world.setPlant(5, 5, T.STAGE_BUSH, PLANT_CFG.bushToTree - 1);
    world.step();
    assert.equal(world.plantStageAt(5, 5), T.STAGE_TREE);
    assert.equal(world.pendingEnergy, 1);
  });

  test("полный цикл трава → куст → дерево даёт 1 ⚡", () => {
    const { world, T, PLANT_CFG } = createWorld();
    world.arcade = true;
    world.setPlant(3, 3, T.STAGE_GRASS, PLANT_CFG.grassToBush - 1);
    world.step();
    assert.equal(world.plantStageAt(3, 3), T.STAGE_BUSH);
    for (let i = 0; i < PLANT_CFG.bushToTree; i++) world.step();
    assert.equal(world.plantStageAt(3, 3), T.STAGE_TREE);
    assert.equal(world.pendingEnergy, 1);
  });

  test("в песочнице эволюция не даёт ⚡", () => {
    const { world, T, PLANT_CFG } = createWorld();
    world.arcade = false;
    world.setPlant(5, 5, T.STAGE_BUSH, PLANT_CFG.bushToTree - 1);
    world.step();
    assert.equal(world.pendingEnergy, 0);
  });

  test("трава → куст без ⚡", () => {
    const { world, T, PLANT_CFG } = createWorld();
    world.arcade = true;
    world.setPlant(5, 5, T.STAGE_GRASS, PLANT_CFG.grassToBush - 1);
    world.step();
    assert.equal(world.plantStageAt(5, 5), T.STAGE_BUSH);
    assert.equal(world.pendingEnergy, 0);
  });
});

describe("энергия за мутации", () => {
  test("начисление по таблице", () => {
    const { world, LIFE_DATA } = createWorld();
    world.arcade = true;
    assert.equal(world.grantMutationEnergy("зоркий"), LIFE_DATA.mutationEnergy["зоркий"]);
    assert.equal(world.pendingEnergy, 8);
    world.pendingEnergy = 0;
    assert.equal(world.grantMutationEnergy("крол-душегуб"), 40);
  });

  test("без аркады мутации не дают ⚡", () => {
    const { world } = createWorld();
    world.arcade = false;
    assert.equal(world.grantMutationEnergy("зоркий"), 0);
  });
});

describe("поиск корма и охота", () => {
  test("соседняя трава по диагонали видна", () => {
    const { world, T } = createWorld();
    world.setPlant(6, 6, T.STAGE_GRASS, 0);
    const meal = world.findNearestEdible(5, 5, 1, "touch");
    assert.ok(meal);
    assert.equal(meal.x, 6);
    assert.equal(meal.y, 6);
  });

  test("лиса видит зайца по диагонали", () => {
    const { world, T } = createWorld();
    world.set(5, 5, T.HERB);
    world.agents.push(world.makeAgent(5, 5, T.HERB));
    world.set(4, 4, T.PRED);
    const fox = world.makeAgent(4, 4, T.PRED);
    const prey = world.findNearestAgent(4, 4, 1, [T.HERB], fox, "touch");
    assert.ok(prey);
    assert.equal(prey.x, 5);
    assert.equal(prey.y, 5);
  });

  test("медведь может охотиться на лису и зайца", () => {
    const { world, T } = createWorld();
    const bear = world.makeAgent(0, 0, T.BEAR);
    const herb = world.makeAgent(1, 0, T.HERB);
    const pred = world.makeAgent(0, 1, T.PRED);
    assert.equal(world.canHunt(bear, herb), true);
    assert.equal(world.canHunt(bear, pred), true);
    assert.equal(world.canHunt(herb, pred), false);
  });

  test("крол-душегуб охотится только на лис", () => {
    const { world, T } = createWorld();
    const krol = world.makeAgent(0, 0, T.HERB);
    krol.trait = "крол-душегуб";
    const pred = world.makeAgent(1, 0, T.PRED);
    const herb = world.makeAgent(0, 1, T.HERB);
    assert.equal(world.canHunt(krol, pred), true);
    assert.equal(world.canHunt(krol, herb), false);
  });
});

describe("аркада: конец раунда", () => {
  test("лимит циклов без зверей", () => {
    const { world } = createWorld();
    world.arcade = true;
    world.lonelyGens = 120;
    world.sustainedChain = false;
    world.checkArcadeEnd(100, 45);
    assert.equal(world.gameOver, true);
    assert.equal(world.gameOverReason, "no_chain");
  });

  test("устойчивая цепочка снимает лимит", () => {
    const { world } = createWorld();
    world.arcade = true;
    world.lonelyGens = 200;
    world.sustainedChain = true;
    world.checkArcadeEnd(0, 45);
    assert.equal(world.gameOver, false);
  });

  test("без энергии на зайца и 40+ пустых циклов — конец", () => {
    const { world, ARCADE_STALE_AFTER } = createWorld();
    world.arcade = true;
    world.noAnimalGens = ARCADE_STALE_AFTER;
    world.lonelyGens = ARCADE_STALE_AFTER;
    world.checkArcadeEnd(10, 45);
    assert.equal(world.gameOver, true);
  });
});

describe("крол-душегуб", () => {
  test("умирает по таймеру", () => {
    const { world, T, KROL_LIFESPAN } = createWorld();
    world.set(2, 2, T.HERB);
    const krol = world.makeAgent(2, 2, T.HERB);
    krol.trait = "крол-душегуб";
    krol.bornGen = 0;
    krol.energy = 20;
    krol.thresh = 10;
    world.agents = [krol];
    world.generation = KROL_LIFESPAN;
    world.stepAgents();
    assert.equal(krol.dead, true);
  });

  test("не наследуется потомкам", () => {
    const { world, T } = createWorld();
    const parent = world.makeAgent(0, 0, T.HERB);
    parent.trait = "крол-душегуб";
    const baby = world.makeAgent(1, 0, T.HERB, parent);
    assert.notEqual(baby.trait, "крол-душегуб");
  });
});

describe("лес без зверей", () => {
  test("прорастание падает без животных", () => {
    const { world } = createWorld();
    world.noAnimalGens = 90;
    assert.equal(world.plantRenewalMul(), 0);
  });
});

describe("isAlive", () => {
  test("медведь держит игру", () => {
    const { world, T } = createWorld();
    world.set(1, 1, T.BEAR);
    world.agents.push(world.makeAgent(1, 1, T.BEAR));
    assert.equal(world.isAlive(), true);
  });
});
