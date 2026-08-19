const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const {
  createWorld,
  loadEngine,
  simulateArcade,
  diff,
  runSeeded,
  lifeSelfCheck
} = require("./scenarios.cjs");

describe("сценарии: растения", () => {
  test("лес без зверей не даёт ⚡", () => {
    runSeeded(({ world, T }) => {
      world.arcade = true;
      for (let i = 0; i < 8; i++) world.setPlant(8 + i, 8, T.STAGE_GRASS, 0);
      let total = 0;
      for (let g = 0; g < 80; g++) {
        world.step();
        total += world.pendingEnergy;
      }
      assert.equal(total, 0);
    });
  });

  test("вода ускоряет рост (sandbox)", () => {
    const a = createWorld(16, 16);
    const b = createWorld(16, 16);
    a.world.set(4, 4, a.T.WATER);
    a.world.setPlant(5, 4, a.T.STAGE_GRASS, 0);
    b.world.setPlant(5, 4, b.T.STAGE_GRASS, 0);
    a.world.growPlants();
    b.world.growPlants();
    assert.ok(a.world.plantAge[a.world.idx(5, 4)] >= b.world.plantAge[b.world.idx(5, 4)]);
  });
});

describe("сценарии: аркада бот", () => {
  for (const id of ["easy", "medium", "hard", "hardcore"]) {
    test(`${id}: устойчивая цепочка`, () => {
      const ctx = loadEngine();
      const d = diff(ctx.LIFE_DATA, id);
      const r = simulateArcade(ctx, { startEnergy: d.energy, maxGens: 160, seed: 42 });
      assert.ok(r.sustainedChain, JSON.stringify(r));
    });
  }

  test("easy/medium: бот с лисой не мгновенный wipe", () => {
    for (const id of ["easy", "medium"]) {
      const ctx = loadEngine();
      const d = diff(ctx.LIFE_DATA, id);
      const r = simulateArcade(ctx, {
        startEnergy: d.energy,
        maxGens: 100,
        withPred: true
      });
      assert.ok(r.survived >= 40, `${id}: ${r.survived}`);
    }
  });
});

describe("сценарии: виды", () => {
  test("медведь не размножается", () => {
    const { world, T } = createWorld();
    const bear = world.makeAgent(4, 4, T.BEAR);
    bear.energy = bear.thresh * 3;
    bear.cool = 0;
    bear.bornGen = 0;
    world.generation = 50;
    world.agents = [bear];
    world.set(4, 4, T.BEAR);
    const before = world.agents.length;
    world.stepAgents();
    assert.equal(world.agents.filter((a) => !a.dead && a.kind === T.BEAR).length, before);
  });

  test("крол: effectiveChance gen1 = 0.25%", () => {
    const { world, LIFE_BALANCE } = createWorld();
    assert.equal(world.effectiveChance(LIFE_BALANCE.mutationChance.krol, 1), 0.0025);
    assert.equal(world.effectiveChance(LIFE_BALANCE.mutationChance.krol, 3), 0.01);
  });

  test("tierPoints совпадает с таблицей", () => {
    const { world, LIFE_BALANCE } = createWorld();
    world.arcade = true;
    const tier = LIFE_BALANCE.evolutionTiers.agent.rabbit;
    const sc = LIFE_BALANCE.lifePointScale;
    const expected = Math.max(1, Math.round(sc.base * tier * sc.birth * 1));
    assert.equal(world.tierPoints("birth", tier, 1), expected);
  });
});

describe("сценарии: sandbox vs arcade", () => {
  test("песочница без game over по энергии", () => {
    const { world } = createWorld();
    world.arcade = false;
    world.checkArcadeEnd(0, 45);
    assert.equal(world.gameOver, false);
  });
});

describe("сценарии: ecoMul", () => {
  test("нет травоядных → mul 0", () => {
    const { world, T } = createWorld();
    world.set(2, 2, T.PRED);
    world.agents = [world.makeAgent(2, 2, T.PRED)];
    assert.equal(world.ecosystemRewardMul(), 0);
  });
});

describe("сценарии: debug selfcheck", () => {
  test("lifeSelfCheck на harness", () => {
    const { world, T } = createWorld();
    world.arcade = true;
    world.setPlant(3, 3, T.STAGE_GRASS, 0);
    const rows = lifeSelfCheck(world, { T });
    assert.ok(rows.every((r) => typeof r.ok === "boolean"));
  });
});
