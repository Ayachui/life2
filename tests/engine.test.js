const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { createWorld, placeKrol } = require("./harness.cjs");

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
    for (let g = 0; g < 8; g++) {
      world.feedHungryHerb(herb);
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
    let totalGrass = 0;
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
      totalGrass += grass;
      if (grass >= 1) successes++;
    }
    const avgGrass = totalGrass / trials;
    assert.ok(successes >= trials * 0.9, `кусты сеют редко: ${successes}/${trials}`);
    assert.ok(avgGrass >= 2, `мало соседней травы от куста: ${avgGrass.toFixed(2)}`);
  });

  test("дерево после гибели оставляет 1 траву", () => {
    const { world, T, PLANT_CFG } = createWorld();
    world.setPlant(5, 5, T.STAGE_TREE, PLANT_CFG.treeLife - 1);
    world.growPlants();
    assert.equal(world.plantStageAt(5, 5), T.STAGE_GRASS);
  });

  test("куст → дерево сеет 2 травы на соседних клетках", () => {
    const { world, T, PLANT_CFG } = createWorld(10, 10);
    world.setPlant(5, 5, T.STAGE_BUSH, PLANT_CFG.bushToTree - 1);
    world.growPlants();
    assert.equal(world.plantStageAt(5, 5), T.STAGE_TREE);
    let grass = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        if (world.plantStageAt(5 + dx, 5 + dy) === T.STAGE_GRASS) grass++;
      }
    }
    assert.equal(grass, 2);
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
  function withHerb(world, T, x = 5, y = 6) {
    world.set(x, y, T.HERB);
    world.agents = [world.makeAgent(x, y, T.HERB)];
  }

  test("куст → дерево не даёт пассивный ⚡", () => {
    const { world, T, PLANT_CFG } = createWorld();
    world.arcade = true;
    withHerb(world, T);
    world.setPlant(5, 5, T.STAGE_BUSH, PLANT_CFG.bushToTree - 1);
    world.step();
    assert.equal(world.plantStageAt(5, 5), T.STAGE_TREE);
    assert.equal(world.energyAudit.plantEvolveBush || 0, 0);
    assert.equal(world.pendingEnergy, world.energyAudit.pulse || 0);
  });

  test("полный цикл трава → куст → дерево без пассивного ⚡", () => {
    const { world, T, PLANT_CFG } = createWorld();
    world.arcade = true;
    withHerb(world, T, 3, 4);
    world.setPlant(3, 3, T.STAGE_GRASS, PLANT_CFG.grassToBush - 1);
    world.step();
    assert.equal(world.plantStageAt(3, 3), T.STAGE_BUSH);
    for (let i = 0; i < PLANT_CFG.bushToTree; i++) world.growPlants();
    assert.equal(world.plantStageAt(3, 3), T.STAGE_TREE);
    assert.equal(world.energyAudit.plantEvolveGrass || 0, 0);
    assert.equal(world.energyAudit.plantEvolveBush || 0, 0);
    assert.equal(world.pendingEnergy, world.energyAudit.pulse || 0);
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

describe("энергия за мутации видов", () => {
  test("начисление с учётом экосистемы", () => {
    const { world, T, LIFE_DATA } = createWorld();
    world.arcade = true;
    world.set(1, 1, T.HERB);
    world.agents = [world.makeAgent(1, 1, T.HERB)];
    const raw = LIFE_DATA.mutationEnergy["коала"];
    const gain = world.grantMutationEnergy("коала");
    assert.equal(gain, Math.max(1, Math.floor(raw * 0.5)));
    assert.equal(world.pendingEnergy, gain);
  });

  test("без травоядных мутации не дают ⚡", () => {
    const { world } = createWorld();
    world.arcade = true;
    assert.equal(world.grantMutationEnergy("коала"), 0);
  });

  test("без аркады мутации не дают ⚡", () => {
    const { world } = createWorld();
    world.arcade = false;
    assert.equal(world.grantMutationEnergy("коала"), 0);
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

  test("крол-душегуб охотится на всех зверей", () => {
    const { world, T } = createWorld();
    const krol = world.makeAgent(0, 0, T.HERB);
    krol.trait = "крол-душегуб";
    const pred = world.makeAgent(1, 0, T.PRED);
    const herb = world.makeAgent(0, 1, T.HERB);
    const bear = world.makeAgent(1, 1, T.BEAR);
    assert.equal(world.canHunt(krol, pred), true);
    assert.equal(world.canHunt(krol, herb), true);
    assert.equal(world.canHunt(krol, bear), true);
  });

  test("лиса не может есть крол-душегуба", () => {
    const { world, T } = createWorld();
    world.set(0, 0, T.PRED);
    const fox = world.makeAgent(0, 0, T.PRED);
    world.agents.push(fox);
    const krol = world.makeAgent(1, 0, T.HERB);
    krol.trait = "крол-душегуб";
    world.set(1, 0, T.HERB);
    world.agents.push(krol);
    const herb = world.makeAgent(0, 1, T.HERB);
    world.set(0, 1, T.HERB);
    world.agents.push(herb);
    assert.equal(world.canHunt(fox, krol), false);
    assert.equal(world.canHunt(fox, herb), true);
    const prey = world.findNearestPrey(0, 0, 3, fox);
    assert.ok(prey);
    assert.equal(prey.x, 0);
    assert.equal(prey.y, 1);
    assert.equal(world.pouncePrey(fox, { x: 1, y: 0 }), false);
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

  test("устойчивая цепочка снимает лимит при живом лесе", () => {
    const { world, T } = createWorld();
    world.arcade = true;
    world.setPlant(5, 5, T.STAGE_GRASS, 0);
    world.lonelyGens = 200;
    world.sustainedChain = true;
    world.checkArcadeEnd(0, 45);
    assert.equal(world.gameOver, false);
  });

  test("устойчивая цепочка не спасает от полного вымирания", () => {
    const { world, ARCADE_LONELY_MAX } = createWorld();
    world.arcade = true;
    world.sustainedChain = true;
    world.lonelyGens = ARCADE_LONELY_MAX;
    world.noAnimalGens = ARCADE_LONELY_MAX;
    world.checkArcadeEnd(6, 45);
    assert.equal(world.gameOver, true);
    assert.equal(world.gameOverReason, "no_chain");
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
  test("охотится даже когда сыт", () => {
    const { world, T } = createWorld();
    const krol = placeKrol(world, 2, 2, T);
    krol.energy = 50;
    krol.thresh = 12;
    world.set(4, 2, T.HERB);
    const prey = world.makeAgent(4, 2, T.HERB);
    prey.trait = "коала";
    world.agents = [krol, prey];
    world.feedKrolDushegub(krol);
    assert.equal(prey.dead, true);
  });

  test("ест растения если нет добычи", () => {
    const { world, T } = createWorld();
    const krol = placeKrol(world, 2, 2, T);
    krol.energy = 5;
    krol.thresh = 12;
    world.agents = [krol];
    world.setPlant(4, 2, T.STAGE_GRASS, 0);
    world.krolDevourZone(krol);
    assert.equal(world.get(4, 2), T.EMPTY);
  });

  test("ест дерево если звери не рядом", () => {
    const { world, T } = createWorld();
    const krol = placeKrol(world, 2, 2, T);
    krol.energy = 50;
    krol.thresh = 12;
    world.setPlant(4, 2, T.STAGE_TREE, 0);
    world.set(22, 2, T.HERB);
    const far = world.makeAgent(22, 2, T.HERB);
    world.agents = [krol, far];
    world.krolDevourZone(krol);
    assert.equal(world.get(4, 2), T.EMPTY);
  });

  test("преследует добычу в поле зрения, а не уходит к траве", () => {
    const { world, T } = createWorld();
    const krol = placeKrol(world, 2, 2, T);
    krol.energy = 20;
    krol.vision = 18;
    world.setPlant(4, 2, T.STAGE_GRASS, 0);
    world.set(10, 2, T.HERB);
    const prey = world.makeAgent(10, 2, T.HERB);
    prey.trait = "коала";
    world.agents = [krol, prey];
    const startX = krol.x;
    world.feedKrolDushegub(krol);
    assert.ok(krol.x > startX || prey.dead);
  });

  test("поле зрения 18 клеток", () => {
    const { world, T } = createWorld();
    const parent = world.makeAgent(5, 5, T.HERB);
    world.set(5, 5, T.HERB);
    world.agents = [parent];
    const baby = world.makeAgent(5, 5, T.HERB, parent);
    world.applySpeciesTrait(baby, "крол-душегуб", 5, 5, parent);
    assert.equal(baby.vision, 18);
  });

  test("не перестаёт есть будучи сыт", () => {
    const { world, T } = createWorld();
    const krol = placeKrol(world, 2, 2, T);
    krol.energy = 50;
    krol.thresh = 12;
    world.agents = [krol];
    world.setPlant(4, 2, T.STAGE_GRASS, 0);
    world.krolDevourZone(krol);
    assert.equal(world.get(4, 2), T.EMPTY);
  });

  test("может съесть волка", () => {
    const { world, T } = createWorld();
    const krol = placeKrol(world, 2, 2, T);
    krol.energy = 20;
    world.set(4, 2, T.PRED);
    const wolf = world.makeAgent(4, 2, T.PRED);
    wolf.trait = "волк";
    world.agents = [krol, wolf];
    world.feedKrolDushegub(krol);
    assert.equal(wolf.dead, true);
  });

  test("съедает всё в зоне 4×4 за один раз", () => {
    const { world, T } = createWorld();
    const krol = placeKrol(world, 4, 4, T);
    world.agents = [krol];
    world.setPlant(3, 4, T.STAGE_GRASS, 0);
    world.setPlant(6, 4, T.STAGE_BUSH, 0);
    world.setPlant(4, 3, T.STAGE_GRASS, 0);
    world.setPlant(5, 5, T.STAGE_TREE, 0);
    world.set(6, 6, T.HERB);
    const prey = world.makeAgent(6, 6, T.HERB);
    world.agents.push(prey);
    world.krolDevourZone(krol);
    assert.equal(prey.dead, true);
    assert.equal(world.get(3, 4), T.EMPTY);
    assert.equal(world.get(6, 4), T.EMPTY);
    assert.equal(world.get(4, 3), T.EMPTY);
    assert.equal(world.get(5, 5), T.EMPTY);
  });

  test("6 действий за цикл и зона разрушения в симуляции", () => {
    const { world, T } = createWorld();
    const krol = placeKrol(world, 8, 8, T);
    krol.movesPerTick = 6;
    world.set(10, 8, T.HERB);
    const prey1 = world.makeAgent(10, 8, T.HERB);
    world.set(12, 8, T.HERB);
    const prey2 = world.makeAgent(12, 8, T.HERB);
    world.setPlant(9, 9, T.STAGE_GRASS, 0);
    world.setPlant(10, 9, T.STAGE_BUSH, 0);
    world.agents = [krol, prey1, prey2];
    world.feedKrolDushegub(krol);
    assert.ok(prey1.dead || prey2.dead || world.get(9, 9) === T.EMPTY || world.get(10, 9) === T.EMPTY);
    assert.equal(krol.movesPerTick, 6);
  });

  test("проходит сквозь зверей, съедая их", () => {
    const { world, T } = createWorld();
    const krol = placeKrol(world, 4, 4, T);
    world.set(6, 4, T.HERB);
    const prey = world.makeAgent(6, 4, T.HERB);
    world.agents = [krol, prey];
    assert.ok(world.canAgentMoveTo(krol, 5, 4));
    world.moveAgentTo(krol, 5, 4);
    assert.equal(prey.dead, true);
    assert.equal(krol.x, 5);
    assert.equal(krol.y, 4);
  });

  test("после смерти оставляет 3 зайцев", () => {
    const { world, T, KROL_LIFESPAN } = createWorld();
    const krol = placeKrol(world, 2, 2, T);
    krol.bornGen = 0;
    krol.energy = 20;
    krol.thresh = 10;
    world.agents = [krol];
    world.generation = KROL_LIFESPAN;
    world.stepAgents();
    assert.equal(krol.dead, true);
    const herbs = world.agents.filter((a) => !a.dead && a.kind === T.HERB && a.trait !== "крол-душегуб");
    assert.equal(herbs.length, 3);
  });

  test("никто не может убить крол-душегуба", () => {
    const { world, T } = createWorld();
    const krol = placeKrol(world, 5, 5, T);
    krol.energy = 1;
    world.set(8, 5, T.BEAR);
    const bear = world.makeAgent(8, 5, T.BEAR);
    world.set(4, 5, T.PRED);
    const fox = world.makeAgent(4, 5, T.PRED);
    world.agents = [krol, bear, fox];
    assert.equal(world.canHunt(bear, krol), false);
    assert.equal(world.canHunt(fox, krol), false);
    assert.equal(world.pounceVictim(bear, { x: 5, y: 5 }), false);
    assert.equal(krol.dead, false);
  });

  test("не умирает от голода", () => {
    const { world, T } = createWorld();
    const krol = placeKrol(world, 2, 2, T);
    krol.bornGen = 0;
    krol.energy = 0.1;
    krol.thresh = 12;
    world.agents = [krol];
    world.generation = 5;
    world.stepAgents();
    assert.equal(krol.dead, false);
  });

  test("не наследуется потомкам", () => {
    const { world, T } = createWorld();
    const parent = placeKrol(world, 0, 0, T);
    const baby = world.makeAgent(3, 0, T.HERB, parent);
    assert.notEqual(baby.trait, "крол-душегуб");
  });

  test("при рождении занимает 2×2 вокруг родителя и съедает содержимое", () => {
    const { world, T } = createWorld();
    const parent = world.makeAgent(5, 5, T.HERB);
    parent.energy = 20;
    parent.thresh = 13;
    world.set(5, 5, T.HERB);
    world.setPlant(6, 5, T.STAGE_GRASS, 0);
    world.setPlant(5, 6, T.STAGE_BUSH, 0);
    world.set(7, 5, T.HERB);
    const snack = world.makeAgent(7, 5, T.HERB);
    world.agents = [parent, snack];

    const baby = world.makeAgent(4, 5, T.HERB, parent);
    baby.trait = "крол-душегуб";
    assert.ok(world.birthKrolAroundParent(baby, parent));

    const footprint = [
      { x: baby.x, y: baby.y },
      { x: baby.x + 1, y: baby.y },
      { x: baby.x, y: baby.y + 1 },
      { x: baby.x + 1, y: baby.y + 1 }
    ];
    const nearParent = footprint.some((c) =>
      Math.max(Math.abs(c.x - parent.x), Math.abs(c.y - parent.y)) <= 1
    );
    assert.ok(nearParent);
    for (const c of footprint) {
      assert.equal(world.get(c.x, c.y), T.HERB);
    }
    assert.equal(parent.dead, false);
    if (footprint.some((c) => c.x === 7 && c.y === 5)) assert.equal(snack.dead, true);
  });
});

describe("размещение животных", () => {
  test("нельзя поставить зайца на занятую клетку", () => {
    const { world, T } = createWorld();
    world.set(3, 3, T.HERB);
    world.agents.push(world.makeAgent(3, 3, T.HERB));
    assert.equal(world.paint(3, 3, "herb"), false);
    assert.equal(world.agents.filter((a) => !a.dead && a.kind === T.HERB).length, 1);
  });

  test("нельзя поставить на клетку крол-душегуба", () => {
    const { world, T } = createWorld();
    const krol = placeKrol(world, 4, 4, T);
    world.agents = [krol];
    assert.equal(world.paint(5, 4, "herb"), false);
    assert.equal(world.paint(4, 5, "pred"), false);
    assert.equal(world.paint(2, 2, "herb"), true);
  });

  test("крол-душегуб проходит через растения", () => {
    const { world, T } = createWorld();
    const krol = placeKrol(world, 4, 4, T);
    world.agents = [krol];
    world.setPlant(6, 4, T.STAGE_GRASS, 0);
    world.setPlant(6, 5, T.STAGE_BUSH, 0);
    world.setPlant(5, 6, T.STAGE_TREE, 0);
    world.setPlant(6, 6, T.STAGE_GRASS, 0);
    assert.ok(world.canAgentMoveTo(krol, 5, 4));
    world.moveAgentTo(krol, 5, 4);
    assert.equal(krol.x, 5);
    assert.equal(krol.y, 4);
    assert.equal(world.get(6, 4), T.HERB);
    assert.equal(world.get(6, 5), T.HERB);
  });
});

describe("лес без зверей", () => {
  test("прорастание падает без травоядных", () => {
    const { world } = createWorld();
    world.noHerbGens = 90;
    assert.equal(world.plantRenewalMul(), 0);
  });

  test("медведь без травоядных не удерживает полный рост леса", () => {
    const { world, T } = createWorld();
    const bear = world.makeAgent(5, 5, T.BEAR);
    world.agents = [bear];
    world.noHerbGens = 45;
    assert.ok(world.plantRenewalMul() < 1);
    assert.equal(world.ecosystemRewardMul(), 0);
  });

  test("перевес хищников снижает награды", () => {
    const { world, T } = createWorld();
    world.set(0, 0, T.HERB);
    world.agents = [world.makeAgent(0, 0, T.HERB)];
    for (let i = 0; i < 4; i++) {
      world.set(i + 1, 0, T.PRED);
      world.agents.push(world.makeAgent(i + 1, 0, T.PRED));
    }
    const mul = world.ecosystemRewardMul();
    assert.ok(mul > 0 && mul < 1, `ожидали частичный штраф, получили ${mul}`);
  });

  test("очки за выживание только при устойчивой цепочке", () => {
    const { world, T, SURVIVAL_POINT_INTERVAL } = createWorld();
    world.arcade = true;
    world.generation = SURVIVAL_POINT_INTERVAL;
    world.set(1, 1, T.HERB);
    world.agents = [world.makeAgent(1, 1, T.HERB)];
    world.tickSurvivalPoints();
    assert.equal(world.lifePoints, 0);
    world.sustainedChain = true;
    world.setPlant(2, 2, T.STAGE_GRASS, 0);
    world.set(3, 3, T.PRED);
    world.agents.push(world.makeAgent(3, 3, T.PRED));
    world.tickSurvivalPoints();
    assert.ok(world.lifePoints > 0);
  });

  test("растения не дают энергию без травоядных", () => {
    const { world, T, PLANT_CFG } = createWorld();
    world.arcade = true;
    world.setPlant(4, 4, T.STAGE_BUSH, PLANT_CFG.bushToTree - 1);
    world.step();
    assert.equal(world.pendingEnergy, 0);
  });
});

describe("аркада: вода, камень и стирание", () => {
  test("можно ставить воду и камень", () => {
    const { world, T } = createWorld();
    world.arcade = true;
    world.makeDish();
    const cx = Math.floor(world.w / 2);
    const cy = Math.floor(world.h / 2);
    assert.equal(world.paint(cx, cy, "water"), true);
    assert.equal(world.get(cx, cy), T.WATER);
    assert.equal(world.paint(cx + 1, cy, "wall"), true);
    assert.equal(world.get(cx + 1, cy), T.WALL);
  });

  test("нельзя стирать в аркаде", () => {
    const { world, T } = createWorld();
    world.arcade = true;
    world.makeDish();
    world.setPlant(5, 5, T.STAGE_GRASS, 0);
    assert.equal(world.paint(5, 5, "erase"), false);
    assert.equal(world.get(5, 5), T.PLANT);
  });

  test("вода проходима и замедляет в песочнице", () => {
    const { world, T } = createWorld();
    world.arcade = false;
    world.set(8, 8, T.WATER);
    world.set(8, 9, T.HERB);
    const herb = world.makeAgent(8, 9, T.HERB);
    world.agents = [herb];
    assert.ok(world.moveTowardTarget(herb, 8, 8));
    assert.equal(herb.x, 8);
    assert.equal(herb.y, 8);
    herb.moveInterval = 1;
    assert.ok(world.agentOnWater(herb));
    assert.equal(world.moveIntervalFor(herb), 2);
  });

  test("вода в аркаде замедляет движение вдвое", () => {
    const { world, T } = createWorld();
    world.arcade = true;
    world.makeDish();
    world.set(5, 5, T.WATER);
    const herb = world.makeAgent(5, 5, T.HERB);
    herb.moveInterval = 1;
    world.agents = [herb];
    assert.ok(world.agentOnWater(herb));
    assert.equal(world.moveIntervalFor(herb), 2);

    let waterTicks = 0;
    for (let phase = 1; phase <= 8; phase++) {
      herb.movePhase = phase;
      if (world.canMoveThisTick(herb)) waterTicks++;
    }
    assert.equal(waterTicks, 4);

    world.set(5, 5, T.EMPTY);
    world.set(5, 5, T.HERB);
    herb.x = 5;
    herb.y = 5;
    assert.equal(world.agentOnWater(herb), false);
    let landTicks = 0;
    for (let phase = 1; phase <= 8; phase++) {
      herb.movePhase = phase;
      if (world.canMoveThisTick(herb)) landTicks++;
    }
    assert.equal(landTicks, 8);
  });

  test("камень непроходим в аркаде", () => {
    const { world, T } = createWorld();
    world.arcade = true;
    world.makeDish();
    world.set(8, 8, T.WALL);
    world.set(8, 9, T.HERB);
    const herb = world.makeAgent(8, 9, T.HERB);
    world.agents = [herb];
    assert.equal(world.moveTowardTarget(herb, 8, 8), false);
    assert.equal(herb.x, 8);
    assert.equal(herb.y, 9);
  });

  test("вода у берега ускоряет рост растений вдвое", () => {
    const { world, T } = createWorld();
    world.set(4, 4, T.WATER);
    world.setPlant(5, 4, T.STAGE_GRASS, 0);
    world.setPlant(5, 8, T.STAGE_GRASS, 0);
    const wetIdx = world.idx(5, 4);
    const dryIdx = world.idx(5, 8);
    const wetBefore = world.plantAge[wetIdx];
    const dryBefore = world.plantAge[dryIdx];
    world.growPlants();
    const wetGain = world.plantAge[wetIdx] - wetBefore;
    const dryGain = world.plantAge[dryIdx] - dryBefore;
    assert.equal(wetGain, dryGain * 2);
  });
});

describe("квадратная чашка", () => {
  test("inDish по углам", () => {
    const { world } = createWorld(48, 48);
    world.makeDish();
    const d = world.dish;
    assert.equal(d.square, true);
    assert.ok(world.inDish(d.cx, d.cy));
    assert.ok(world.inDish(d.cx - d.half, d.cy - d.half));
    assert.ok(world.inDish(d.cx + d.half, d.cy + d.half));
    assert.equal(world.inDish(d.cx - d.half - 1, d.cy), false);
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

describe("очки жизни", () => {
  test("в песочнице очки не начисляются", () => {
    const { world, T } = createWorld();
    world.arcade = false;
    world.setPlant(2, 2, T.STAGE_GRASS, 0);
    world.awardLifePoints(100);
    assert.equal(world.lifePoints, 0);
  });

  test("эволюция растений даёт очки по тиру", () => {
    const { world, T } = createWorld();
    world.arcade = true;
    world.set(2, 3, T.HERB);
    world.agents = [world.makeAgent(2, 3, T.HERB)];
    world.setPlant(2, 2, T.STAGE_GRASS, 0);
    world.plantAge[world.idx(2, 2)] = 10;
    world.growPlants();
    assert.equal(world.lifePoints, world.tierPoints("plant", 2));
    assert.equal(world.plantStageAt(2, 2), T.STAGE_BUSH);
  });

  test("ручная посадка не даёт очков", () => {
    const { world } = createWorld();
    world.arcade = true;
    world.paint(3, 3, "herb");
    world.paint(4, 4, "plant");
    assert.equal(world.lifePoints, 0);
  });

  test("охота даёт больше очков у эволюционировавших хищников", () => {
    const { world, T } = createWorld();
    world.arcade = true;

    function huntAs(killer, preyX, preyY) {
      const w = createWorld().world;
      w.arcade = true;
      w.set(preyX, preyY, T.HERB);
      const prey = w.makeAgent(preyX, preyY, T.HERB);
      w.set(preyX + 1, preyY, T.HERB);
      const grazer = w.makeAgent(preyX + 1, preyY, T.HERB);
      w.set(preyX, preyY + 1, T.PRED);
      const hunter = w.makeAgent(preyX, preyY + 1, T.PRED);
      hunter.trait = killer.trait;
      w.agents = [prey, grazer, hunter];
      w.killAgent(prey, hunter, 7.2);
      return w.lifePoints;
    }

    const foxPoints = huntAs({ trait: null }, 3, 3);
    const wolfPoints = huntAs({ trait: "волк" }, 8, 3);
    assert.ok(wolfPoints > foxPoints, `волк ${wolfPoints} vs лиса ${foxPoints}`);
  });

  test("мутация и поколение усиливают очки", () => {
    const { world, T } = createWorld();
    world.arcade = true;

    function mutateKoala(parentGen) {
      const w = createWorld().world;
      w.arcade = true;
      w.set(3, 3, T.HERB);
      const parent = w.makeAgent(3, 3, T.HERB);
      parent.gen = parentGen;
      w.set(4, 3, T.HERB);
      const grazer = w.makeAgent(4, 3, T.HERB);
      const baby = w.makeAgent(5, 3, T.HERB, parent);
      w.agents = [parent, grazer, baby];
      w.applySpeciesTrait(baby, "коала", 5, 3, parent);
      return w.lifePoints;
    }

    const withGen = mutateKoala(3);
    const fresh = mutateKoala(1);
    assert.ok(withGen > fresh, `поколение 4 vs 2: ${withGen} > ${fresh}`);
  });
});

describe("аркада: энергия за действия", () => {
  test("дерево живёт на 50% дольше", () => {
    const { PLANT_CFG } = createWorld();
    assert.equal(PLANT_CFG.treeLife, 113);
  });

  test("эволюция растений не даёт пассивный ⚡", () => {
    const { world, T, PLANT_CFG } = createWorld();
    world.arcade = true;
    world.set(2, 3, T.HERB);
    world.agents = [world.makeAgent(2, 3, T.HERB)];
    world.setPlant(2, 2, T.STAGE_GRASS, 0);
    world.plantAge[world.idx(2, 2)] = PLANT_CFG.grassToBush;
    world.growPlants();
    assert.equal(world.pendingEnergy, 0);
    world.plantAge[world.idx(2, 2)] = PLANT_CFG.bushToTree;
    world.growPlants();
    assert.equal(world.pendingEnergy, 0);
  });

  test("рождение и смерть: таблица arcadeEnergy = 0", () => {
    const { world, T, LIFE_DATA } = createWorld();
    world.arcade = true;
    assert.equal(LIFE_DATA.arcadeEnergy.animalBirth, 0);
    assert.equal(LIFE_DATA.arcadeEnergy.animalDeath, 0);
    assert.equal(world.grantArcadeEnergy("animalBirth"), 0);
    assert.equal(world.grantArcadeEnergy("animalDeath"), 0);
    world.set(3, 3, T.HERB);
    const herb = world.makeAgent(3, 3, T.HERB);
    world.agents = [herb];
    world.dieAgent(herb);
    assert.equal(world.pendingEnergy, 0);
  });

  test("охота даёт очки, не ⚡", () => {
    const { world, T } = createWorld();
    world.arcade = true;
    world.set(2, 3, T.HERB);
    world.agents = [world.makeAgent(2, 3, T.HERB)];
    const prey = world.makeAgent(3, 3, T.HERB);
    const fox = world.makeAgent(4, 3, T.PRED);
    world.agents.push(prey, fox);
    world.set(3, 3, T.HERB);
    world.set(4, 3, T.PRED);
    const pointsBefore = world.lifePoints;
    world.killAgent(prey, fox, 7.2);
    assert.equal(world.pendingEnergy, 0);
    assert.ok(world.lifePoints > pointsBefore);
  });
});

describe("террейн и рулетка", () => {
  test("звери не уничтожают воду и камень", () => {
    const { world, T } = createWorld();
    world.arcade = true;
    world.makeDish();
    const cx = Math.floor(world.w / 2);
    const cy = Math.floor(world.h / 2);
    world.set(cx, cy, T.WATER);
    world.set(cx + 1, cy, T.WALL);
    const elk = world.makeAgent(cx - 1, cy, T.HERB);
    elk.trait = "лось";
    world.agents = [elk];
    world.set(cx - 1, cy, T.HERB);
    assert.ok(world.canAgentMoveTo(elk, cx, cy));
    world.moveAgentTo(elk, cx, cy);
    assert.equal(world.get(cx, cy), T.WATER);
    assert.equal(world.canAgentMoveTo(elk, cx + 1, cy), false);
    assert.equal(elk.x, cx);
    assert.equal(elk.y, cy);
    assert.equal(world.get(cx + 1, cy), T.WALL);
  });

  test("рулетка: землетрясение убирает часть растений", () => {
    const { world, T } = createWorld(12, 12);
    world.arcade = true;
    for (let i = 0; i < 20; i++) world.setPlant(i % 10, Math.floor(i / 10), T.STAGE_GRASS, 0);
    const before = world.counts().plants;
    world.applyRouletteEvent("earthquake");
    assert.ok(world.counts().plants < before);
    assert.ok(world.screenShake > 0);
  });

  test("рулетка: наводнение добавляет воду", () => {
    const { world, T } = createWorld(12, 12);
    world.arcade = true;
    world.makeDish();
    world.applyRouletteEvent("flood");
    assert.ok(world.counts().water > 0);
  });

  test("каждые N циклов помечается рулетка", () => {
    const { world, LIFE_BALANCE } = createWorld();
    const n = LIFE_BALANCE.roulette.interval;
    world.arcade = true;
    world.generation = n - 1;
    world.step();
    assert.equal(world.generation, n);
    assert.equal(world.roulettePending, true);
  });
});

describe("корова и наследование мутантов", () => {
  test("корова насыщается от дерева за ~4 цикла", () => {
    const { world, T, PLANT_CFG } = createWorld();
    const cow = world.makeAgent(5, 5, T.HERB);
    world.applySpeciesTrait(cow, "корова", 5, 5);
    cow.energy = 12;
    world.set(5, 5, T.HERB);
    world.setPlant(6, 5, T.STAGE_TREE, 0);
    world.plantBites[world.idx(6, 5)] = PLANT_CFG.treeBitesCow;
    world.agents = [cow];
    let peak = cow.energy;
    for (let i = 0; i < 5; i++) {
      world.stepAgents();
      peak = Math.max(peak, cow.energy);
      if (peak >= cow.thresh) break;
    }
    assert.ok(peak >= cow.thresh, `peak energy ${peak} < thresh ${cow.thresh}`);
    assert.ok(world.plantBites[world.idx(6, 5)] < PLANT_CFG.treeBitesCow, "дерево должно быть частично съедено");
  });

  test("мутант передаёт вид потомству", () => {
    const { world, T } = createWorld();
    const parent = world.makeAgent(5, 5, T.HERB);
    world.applySpeciesTrait(parent, "корова", 5, 5);
    const baby = world.makeAgent(6, 5, T.HERB, parent);
    assert.ok(world.inheritSpeciesTrait(baby, parent));
    assert.equal(baby.trait, "корова");
    assert.equal(baby.moveInterval, 4);
    assert.equal(baby.drain, 1.2);
  });

  test("коала и волк наследуются потомством", () => {
    const { world, T } = createWorld();
    const koalaParent = world.makeAgent(2, 2, T.HERB);
    world.applySpeciesTrait(koalaParent, "коала", 2, 2);
    const koalaBaby = world.makeAgent(3, 2, T.HERB, koalaParent);
    assert.ok(world.inheritSpeciesTrait(koalaBaby, koalaParent));
    assert.equal(koalaBaby.trait, "коала");

    const wolfParent = world.makeAgent(5, 5, T.PRED);
    world.applySpeciesTrait(wolfParent, "волк", 5, 5);
    const wolfBaby = world.makeAgent(6, 5, T.PRED, wolfParent);
    assert.ok(world.inheritSpeciesTrait(wolfBaby, wolfParent));
    assert.equal(wolfBaby.trait, "волк");
  });

  test("крол-душегуб не наследуется при размножении", () => {
    const { world, T } = createWorld();
    const parent = world.makeAgent(5, 5, T.HERB);
    parent.trait = "крол-душегуб";
    const baby = world.makeAgent(6, 5, T.HERB, parent);
    assert.equal(world.inheritSpeciesTrait(baby, parent), false);
    assert.equal(baby.trait, null);
  });
});

describe("размножение: зрелость", () => {
  test("лиса не плодится в цикл появления и охоты", () => {
    const { world, T } = createWorld();
    world.generation = 20;
    world.set(5, 5, T.HERB);
    const hare = world.makeAgent(5, 5, T.HERB);
    world.set(7, 5, T.PRED);
    const fox = world.makeAgent(7, 5, T.PRED);
    hare.energy = 8;
    fox.energy = 10;
    world.agents = [hare, fox];
    world.stepAgents();
    const preds = world.agents.filter((a) => !a.dead && a.kind === T.PRED);
    assert.equal(preds.length, 1, "лиса не должна сразу дать потомство");
  });

  test("заяц не плодится в цикл появления и кормёжки", () => {
    const { world, T } = createWorld();
    world.generation = 30;
    world.set(5, 5, T.HERB);
    const hare = world.makeAgent(5, 5, T.HERB);
    world.setPlant(6, 5, T.STAGE_GRASS, 0);
    hare.energy = 8;
    world.agents = [hare];
    world.stepAgents();
    const herbs = world.agents.filter((a) => !a.dead && a.kind === T.HERB);
    assert.equal(herbs.length, 1);
  });

  test("посаженный зверь получает стартовый кулдаун", () => {
    const { world, T } = createWorld();
    world.generation = 5;
    const fox = world.makeAgent(3, 3, T.PRED);
    const hare = world.makeAgent(4, 4, T.HERB);
    assert.ok(fox.cool > 0);
    assert.ok(hare.cool > 0);
    assert.equal(fox.bornGen, 5);
  });

  test("зрелая лиса может размножиться", () => {
    const { world, T } = createWorld();
    world.generation = 50;
    world.set(5, 5, T.PRED);
    const fox = world.makeAgent(5, 5, T.PRED);
    fox.bornGen = 20;
    fox.energy = 20;
    fox.cool = 0;
    world.set(6, 5, T.EMPTY);
    world.set(5, 6, T.EMPTY);
    world.set(4, 5, T.HERB);
    world.setPlant(7, 5, T.STAGE_GRASS, 0);
    world.agents = [fox, world.makeAgent(4, 5, T.HERB)];
    let bred = false;
    for (let i = 0; i < 80; i++) {
      world.stepAgents();
      if (world.agents.filter((a) => !a.dead && a.kind === T.PRED).length > 1) {
        bred = true;
        break;
      }
    }
    assert.ok(bred, "взрослая лиса должна когда-нибудь размножиться");
  });
});

describe("коала", () => {
  test("ходит по дереву, не уничтожая его", () => {
    const { world, T } = createWorld();
    const koala = world.makeAgent(5, 5, T.HERB);
    world.applySpeciesTrait(koala, "коала", 5, 5);
    world.setPlant(6, 5, T.STAGE_TREE, 0);
    world.agents = [koala];
    assert.ok(world.canAgentMoveTo(koala, 6, 5));
    world.moveAgentTo(koala, 6, 5);
    assert.equal(koala.x, 6);
    assert.equal(world.get(6, 5), T.PLANT);
    assert.equal(world.plantStageAt(6, 5), T.STAGE_TREE);
  });

  test("грызёт дерево, не убивая его", () => {
    const { world, T } = createWorld();
    const koala = world.makeAgent(6, 5, T.HERB);
    world.applySpeciesTrait(koala, "коала", 6, 5);
    koala.energy = 1;
    koala.thresh = 99;
    world.setPlant(6, 5, T.STAGE_TREE, 0);
    world.agents = [koala];
    world.feedHungryKoala(koala);
    assert.equal(world.get(6, 5), T.PLANT);
    assert.equal(world.plantStageAt(6, 5), T.STAGE_TREE);
    assert.ok(koala.energy > 1);
  });

  test("в чаще почти невидима для волка", () => {
    const { world, T } = createWorld();
    world.setPlant(8, 5, T.STAGE_TREE, 0);
    const koala = world.makeAgent(8, 5, T.HERB);
    world.applySpeciesTrait(koala, "коала", 8, 5);
    world.moveAgentTo(koala, 8, 5);
    const wolf = world.makeAgent(5, 5, T.PRED);
    world.applySpeciesTrait(wolf, "волк", 5, 5);
    world.agents = [koala, wolf];
    assert.equal(world.findNearestPrey(5, 5, 12, wolf), null);
    world.set(6, 5, T.EMPTY);
    world.moveAgentTo(koala, 6, 5);
    const near = world.findNearestPrey(5, 5, 12, wolf);
    assert.ok(near);
    assert.equal(near.x, 6);
  });

  test("потомство коалы даёт очки жизни", () => {
    const { world, T } = createWorld();
    world.arcade = true;
    world.set(4, 4, T.HERB);
    const parent = world.makeAgent(4, 4, T.HERB);
    world.applySpeciesTrait(parent, "коала", 4, 4);
    const baby = world.makeAgent(5, 4, T.HERB, parent);
    world.inheritSpeciesTrait(baby, parent);
    world.agents = [parent, world.makeAgent(6, 4, T.HERB)];
    const before = world.lifePoints;
    world.awardBirthPoints(baby);
    assert.ok(world.lifePoints > before);
    assert.equal(baby.trait, "коала");
  });

  test("коала даёт больше очков за рождение, чем заяц", () => {
    const { world, T } = createWorld();
    world.arcade = true;
    world.set(3, 3, T.HERB);
    world.set(4, 3, T.HERB);
    const rabbit = world.makeAgent(3, 3, T.HERB);
    const koala = world.makeAgent(4, 3, T.HERB);
    world.applySpeciesTrait(koala, "коала", 4, 3);
    world.agents = [rabbit, world.makeAgent(5, 3, T.HERB)];
    world.awardBirthPoints(rabbit);
    const rabbitPts = world.lifePoints;
    world.awardBirthPoints(koala);
    assert.ok(world.lifePoints > rabbitPts, "коала должна давать больше очков, чем заяц");
  });
});

describe("грибы", () => {
  test("корова сажает гриб на соседнюю пустую клетку", () => {
    const { world, T } = createWorld();
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        world.set(5 + dx, 5 + dy, T.EMPTY);
      }
    }
    assert.ok(world.tryPlantMushroomNear(5, 5));
    let mushrooms = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        if (world.get(5 + dx, 5 + dy) === T.MUSHROOM) mushrooms++;
      }
    }
    assert.equal(mushrooms, 1, "гриб должен появиться рядом с коровой");
  });

  test("съеденный гриб удваивает зрение и скорость хода", () => {
    const { world, T, MUSHROOM_CFG } = createWorld();
    const herb = world.makeAgent(5, 5, T.HERB);
    herb.vision = 6;
    herb.moveInterval = 4;
    herb.energy = 1;
    herb.thresh = 99;
    world.agents = [herb];
    world.set(6, 5, T.MUSHROOM);
    assert.equal(world.effectiveVision(herb), 6);
    assert.equal(world.moveIntervalFor(herb), 4);
    world.feedHungryHerb(herb);
    assert.equal(world.get(6, 5), T.EMPTY);
    assert.equal(herb.skillBoost, true);
    assert.equal(world.effectiveVision(herb), 12);
    assert.equal(world.moveIntervalFor(herb), 2);
    assert.ok(herb.energy >= MUSHROOM_CFG.energy);
  });

  test("гриб не продлевает жизнь крол-душегуба", () => {
    const { world, T, KROL_LIFESPAN } = createWorld();
    const krol = placeKrol(world, 5, 5, T);
    krol.bornGen = 0;
    world.generation = KROL_LIFESPAN - 1;
    world.agents = [krol];
    world.set(6, 5, T.MUSHROOM);
    world.krolDevourCells(krol, [{ x: 6, y: 5 }]);
    assert.equal(krol.skillBoost, true);
    assert.equal(krol.bornGen, 0);
    world.generation = KROL_LIFESPAN;
    world.stepAgents();
    assert.ok(krol.dead, "крол должен умереть по сроку жизни несмотря на гриб");
  });

  test("потомок не наследует бонус гриба", () => {
    const { world, T } = createWorld();
    const parent = world.makeAgent(5, 5, T.HERB);
    parent.skillBoost = true;
    const baby = world.makeAgent(6, 5, T.HERB, parent);
    assert.equal(baby.skillBoost, false);
  });
});
