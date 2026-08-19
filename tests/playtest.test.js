const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { loadEngine, createWorld } = require("./harness.cjs");
const { runPlaytest, runBattery } = require("./playtest.cjs");

function medium(ctx) {
  return ctx.LIFE_DATA.difficulties.find((d) => d.id === "medium");
}

describe("playtest: экономика не фермится", () => {
  test("жадный бот за 300 циклов не раздувает ⚡ выше старта", () => {
    const ctx = loadEngine();
    const start = medium(ctx).energy;
    const r = runPlaytest(ctx, {
      strategy: "greedy",
      startEnergy: start,
      maxGens: 300,
      seed: 11
    });
    assert.equal(r.unlosable, false, JSON.stringify({
      energy: r.energy, max: r.maxEnergy, earned: r.earned, audit: r.audit
    }));
    assert.ok(r.energy <= start * 1.25, `energy ${r.energy} start ${start}`);
    assert.ok(r.maxEnergy <= start * 1.5, `maxEnergy ${r.maxEnergy}`);
  });

  test("охота и коала не капают ⚡", () => {
    const ctx = loadEngine();
    const r = runPlaytest(ctx, {
      strategy: "predator",
      startEnergy: medium(ctx).energy,
      maxGens: 180,
      seed: 5
    });
    assert.equal(r.audit.hunt || 0, 0);
    assert.equal(r.audit.koalaTreeBite || 0, 0);
  });

  test("пренебрежение: партия умеет заканчиваться", () => {
    const ctx = loadEngine();
    const start = ctx.LIFE_DATA.difficulties.find((d) => d.id === "hardcore").energy;
    let losses = 0;
    for (const seed of [2, 8, 19, 31, 44]) {
      const r = runPlaytest(ctx, {
        strategy: "neglect",
        startEnergy: start,
        maxGens: 220,
        seed
      });
      if (r.gameOver) losses++;
    }
    assert.ok(losses >= 1, `ни одна neglect-партия не проиграла (${losses}/5)`);
  });
});

describe("playtest: батарея medium", () => {
  test("unlosable rate жадного бота низкий", () => {
    const { rows } = runBattery({
      seeds: [1, 7, 13],
      diffs: ["medium"],
      strategies: ["greedy", "gardener"],
      maxGens: 280
    });
    const greedy = rows.find((r) => r.strategy === "greedy");
    assert.ok(greedy.unlosableRate <= 0.34, `unlosable ${greedy.unlosableRate}`);
    assert.ok(greedy.ratioP90 <= 1.4, `ratioP90 ${greedy.ratioP90}`);
  });
});

describe("playtest: discovery-мутация", () => {
  test("вторая коала не платит ⚡", () => {
    const { world, T } = createWorld();
    world.arcade = true;
    world.set(1, 1, T.HERB);
    world.agents = [world.makeAgent(1, 1, T.HERB)];
    const first = world.grantMutationEnergy("коала");
    const second = world.grantMutationEnergy("коала");
    assert.ok(first > 0);
    assert.equal(second, 0);
    assert.equal(world.pendingEnergy, first);
  });
});
