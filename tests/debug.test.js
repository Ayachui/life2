const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { createWorld } = require("./harness.cjs");

function loadDebugLib() {
  const sandbox = { window: {} };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "debug-lib.js"), "utf8"), sandbox);
  return sandbox.LifeDebugLib;
}

describe("debug-lib", () => {
  test("snapshot содержит generation и counts", () => {
    const lib = loadDebugLib();
    const { world, T } = createWorld();
    world.setPlant(2, 2, T.STAGE_GRASS, 0);
    const snap = lib.lifeWorldSnapshot(world, { mode: "sandbox" });
    assert.equal(snap.counts.grass, 1);
    assert.equal(snap.meta.mode, "sandbox");
  });

  test("инварианты: охотники без добычи", () => {
    const lib = loadDebugLib();
    const { world, T } = createWorld();
    world.set(2, 2, T.PRED);
    world.agents = [world.makeAgent(2, 2, T.PRED)];
    const inv = lib.lifeInvariantChecks(world);
    assert.ok(inv.some((w) => w.text.includes("без добычи")));
  });

  test("selfCheck возвращает массив проверок", () => {
    const lib = loadDebugLib();
    const { world, T } = createWorld();
    world.arcade = true;
    world.setPlant(1, 1, T.STAGE_GRASS, 0);
    const rows = lib.lifeSelfCheck(world, { T });
    assert.ok(rows.length >= 2);
  });
});

describe("LIFE_BALANCE snapshot", () => {
  test("версия 0.12.0", () => {
    const { LIFE_BALANCE } = createWorld();
    assert.equal(LIFE_BALANCE.version.minor, 12);
    assert.equal(LIFE_BALANCE.version.patch, 0);
    assert.equal(LIFE_BALANCE.tools.herb, 45);
    assert.equal(LIFE_BALANCE.plants.treeLife, 113);
    assert.equal(LIFE_BALANCE.arcadeEnergy.hunt, 0);
    assert.equal(LIFE_BALANCE.arcadeEconomy.discoveryOnlyMutation, true);
  });
});

describe("debug-lib экономика", () => {
  test("sparkline не падает на пустом ряде", () => {
    const lib = loadDebugLib();
    assert.equal(lib.sparkline([]), "—");
    assert.ok(lib.sparkline([10, 20, 5]).length > 0);
  });
});
