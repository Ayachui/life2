const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { createWorld } = require("./harness.cjs");

function makeKoala(world, x, y, T, opts = {}) {
  const a = world.makeAgent(x, y, T.HERB);
  a.trait = "коала";
  a.energy = opts.energy ?? 20;
  a.thresh = opts.thresh ?? 14;
  a.drain = opts.drain ?? 0.28;
  a.vision = opts.vision ?? 8;
  a.moveInterval = opts.moveInterval ?? 2;
  a.bornGen = opts.bornGen ?? world.generation - 30;
  a.cool = opts.cool ?? 0;
  world.agents.push(a);
  return a;
}

describe("коала: размножение", () => {
  test("не размножается с земли", () => {
    const { world, T } = createWorld(16, 16);
    world.setPlant(8, 8, T.STAGE_TREE, 0);
    world.set(9, 8, T.EMPTY);
    const koala = makeKoala(world, 9, 8, T);
    world.generation = 100;
    const before = world.koalaCount();
    world.stepAgents();
    assert.equal(world.koalaCount(), before);
  });

  test("размножается на дереве", () => {
    const { world, T } = createWorld(16, 16);
    world.setSeed(4242);
    world.setPlant(8, 8, T.STAGE_TREE, 0);
    world.setPlant(9, 8, T.STAGE_TREE, 0);
    const koala = makeKoala(world, 8, 8, T, { energy: 24, bornGen: 10 });
    world.set(7, 8, T.EMPTY);
    world.set(8, 7, T.EMPTY);
    world.generation = 80;
    for (let i = 0; i < 120; i++) {
      world.stepAgents();
      world.generation++;
      if (world.koalaCount() > 1) break;
    }
    assert.ok(world.koalaCount() > 1, "ожидали потомков на дереве");
  });

  test("популяция ограничена ёмкостью леса", () => {
    const { world, T } = createWorld(20, 20);
    for (let y = 6; y < 14; y++) {
      for (let x = 6; x < 14; x++) {
        world.setPlant(x, y, T.STAGE_TREE, 0);
      }
    }
    const koala = makeKoala(world, 8, 8, T);
    world.set(9, 8, T.EMPTY);
    world.generation = 50;
    for (let g = 50; g < 320; g++) {
      world.step();
    }
    const cap = world.koalaPerchCapacity();
    assert.ok(cap > 0);
    assert.ok(
      world.koalaCount() <= cap + 4,
      `коал ${world.koalaCount()} при ёмкости ${cap}`
    );
  });
});

describe("коала: поведение и ⚡", () => {
  test("findNearestEmptyPerch избегает занятых деревьев", () => {
    const { world, T } = createWorld(12, 12);
    world.setPlant(5, 5, T.STAGE_TREE, 0);
    world.setPlant(7, 5, T.STAGE_TREE, 0);
    makeKoala(world, 5, 5, T);
    const spot = world.findNearestEmptyPerch(6, 5, 4);
    assert.ok(spot);
    assert.equal(spot.x, 7);
    assert.equal(spot.y, 5);
  });

  test("укус листвы даёт ⚡ в аркаде", () => {
    const { world, T } = createWorld(12, 12);
    world.arcade = true;
    world.setPlant(5, 5, T.STAGE_TREE, 0);
    const koala = makeKoala(world, 5, 5, T, { energy: 5, thresh: 20 });
    world.feedHungryKoala(koala);
    assert.ok(world.pendingEnergy >= 1, "ожидали ⚡ за укус с дерева");
  });
});
