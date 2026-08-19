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
      world.koalaCount() <= cap + 2,
      `коал ${world.koalaCount()} при ёмкости ${cap}`
    );
  });

  test("тысяча деревьев не даёт тысячу коал", () => {
    const { world, T, LIFE_BALANCE } = createWorld(24, 24);
    const max = LIFE_BALANCE.behavior.koalaPerchCapacity.max;
    for (let y = 2; y < 22; y++) {
      for (let x = 2; x < 22; x++) world.setPlant(x, y, T.STAGE_TREE, 0);
    }
    assert.ok(world.counts().tree > max * 4);
    assert.equal(world.koalaPerchCapacity(), max);
    makeKoala(world, 8, 8, T);
    world.set(9, 8, T.EMPTY);
    world.generation = 20;
    for (let i = 0; i < 280; i++) world.step();
    assert.ok(
      world.koalaCount() <= max + 1,
      `коал ${world.koalaCount()} при потолке ${max}`
    );
  });
});

describe("коала: поведение", () => {
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

  test("укус листвы кормит коалу, не даёт ⚡ игроку", () => {
    const { world, T } = createWorld(12, 12);
    world.arcade = true;
    world.setPlant(5, 5, T.STAGE_TREE, 0);
    const koala = makeKoala(world, 5, 5, T, { energy: 5, thresh: 20 });
    const before = koala.energy;
    world.feedHungryKoala(koala);
    assert.ok(koala.energy > before, "коала должна поесть");
    assert.equal(world.pendingEnergy, 0, "укус не должен капать ⚡ игроку");
  });

  test("лиса видит коалу на соседнем дереве", () => {
    const { world, T } = createWorld(16, 16);
    world.setPlant(8, 8, T.STAGE_TREE, 0);
    makeKoala(world, 8, 8, T);
    world.set(7, 8, T.EMPTY);
    const fox = world.makeAgent(7, 8, T.PRED);
    world.set(7, 8, T.PRED);
    world.agents.push(fox);
    const prey = world.findNearestPrey(fox.x, fox.y, 4, fox);
    assert.ok(prey, "лиса должна находить коалу");
    assert.equal(prey.x, 8);
    assert.equal(prey.y, 8);
  });

  test("на дереве ест даже если лиса рядом", () => {
    const { world, T } = createWorld(16, 16);
    world.setPlant(8, 8, T.STAGE_TREE, 0);
    const koala = makeKoala(world, 8, 8, T, { energy: 8, thresh: 14 });
    world.set(10, 8, T.PRED);
    const fox = world.makeAgent(10, 8, T.PRED);
    fox.energy = 12;
    world.agents.push(fox);
    const before = koala.energy;
    world.feedHungryKoala(koala);
    assert.ok(koala.energy > before, "коала на дереве должна есть при угрозе");
  });

  test("голодная коала не глохнет на дереве за 40 ходов", () => {
    const { world, T } = createWorld(16, 16);
    world.setPlant(8, 8, T.STAGE_TREE, 0);
    world.set(10, 8, T.PRED);
    const fox = world.makeAgent(10, 8, T.PRED);
    fox.energy = 12;
    world.agents.push(fox);
    const koala = makeKoala(world, 8, 8, T, { energy: 12, thresh: 14 });
    for (let i = 0; i < 40; i++) {
      koala.energy -= koala.drain;
      world.feedHungryKoala(koala);
    }
    assert.ok(koala.energy > 0, `коала умерла бы от голода: ${koala.energy}`);
    assert.ok(koala.energy >= koala.thresh * 0.5, "коала должна оставаться более-менее сытой");
  });
});
