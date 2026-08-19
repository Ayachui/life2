const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { createWorld } = require("./harness.cjs");

function dishOpenCount(world) {
  let n = 0;
  for (let y = 0; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) {
      if (world.inDish(x, y) && world.get(x, y) === 0) n++;
    }
  }
  return n;
}

function countTypeInDish(world, T, type) {
  let n = 0;
  for (let y = 0; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) {
      if (world.inDish(x, y) && world.get(x, y) === type) n++;
    }
  }
  return n;
}

function avgWaterNeighbors(world, T, TerrainArt) {
  let sum = 0;
  let cells = 0;
  for (let y = 0; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) {
      if (!world.inDish(x, y) || world.get(x, y) !== T.WATER) continue;
      cells++;
      const mask = TerrainArt.waterNeighborMask(world, x, y);
      sum += Number(mask.n) + Number(mask.e) + Number(mask.s) + Number(mask.w);
    }
  }
  return cells ? sum / cells : 0;
}

describe("аркада: ландшафт", () => {
  test("генерация укладывается в 0–10% воды и 0–5% камней", () => {
    const { world, T, TerrainArt } = createWorld(32, 32);
    world.makeDish();
    const total = dishOpenCount(world);
    const rng = TerrainArt.mulberry32(42);
    const result = TerrainArt.scatterArcadeTerrain(world, { rng });

    assert.ok(result.waterFrac >= 0 && result.waterFrac <= 0.10 + 1e-6);
    assert.ok(result.wallFrac >= 0 && result.wallFrac <= 0.05 + 1e-6);
    assert.equal(result.water, countTypeInDish(world, T, T.WATER));
    assert.equal(result.walls, countTypeInDish(world, T, T.WALL));
    assert.ok(result.water + result.walls <= total);
  });

  test("вода образует связные водоёмы, а не одиночные капли", () => {
    const { world, T, TerrainArt } = createWorld(40, 40);
    world.makeDish();
    const rng = TerrainArt.mulberry32(99);
    const result = TerrainArt.scatterArcadeTerrain(world, { rng, waterMax: 0.1, wallMax: 0.03 });
    if (result.water < 6) return;
    const avg = avgWaterNeighbors(world, T, TerrainArt);
    assert.ok(avg >= 1.2, `ожидали соседство воды, среднее ${avg}`);
  });

  test("центр чашки защищён для старта", () => {
    const { world, T, TerrainArt } = createWorld(32, 32);
    world.makeDish();
    const cx = Math.floor(world.w / 2);
    const cy = Math.floor(world.h / 2);
    const rng = TerrainArt.mulberry32(7);
    TerrainArt.scatterArcadeTerrain(world, { rng, waterMax: 0.1, wallMax: 0.05 });
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const t = world.get(cx + dx, cy + dy);
        assert.notEqual(t, T.WATER);
        assert.notEqual(t, T.WALL);
      }
    }
  });

  test("детерминированный сид даёт одинаковый ландшафт", () => {
    const { TerrainArt } = createWorld(28, 28);
    function snapshot(seed) {
      const { world } = createWorld(28, 28);
      world.makeDish();
      TerrainArt.scatterArcadeTerrain(world, { rng: TerrainArt.mulberry32(seed) });
      return world.cells.join(",");
    }
    assert.equal(snapshot(123), snapshot(123));
    assert.notEqual(snapshot(123), snapshot(456));
  });
});
