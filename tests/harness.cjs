const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { LIFE_BOOT_SCRIPTS } = require("../js/boot-order.cjs");

const ROOT = path.join(__dirname, "..");

function runScript(sandbox, rel) {
  const code = fs.readFileSync(path.join(ROOT, rel), "utf8");
  vm.runInContext(code, sandbox, { filename: rel });
}

function loadEngine() {
  const sandbox = { window: {}, globalThis: null };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const rel of LIFE_BOOT_SCRIPTS) {
    runScript(sandbox, rel);
  }
  runScript(sandbox, "js/terrain.js");
  sandbox.LIFE_DATA = sandbox.LIFE_DATA || sandbox.window.LIFE_DATA;
  return sandbox;
}

function createWorld(w = 24, h = 24) {
  const ctx = loadEngine();
  const world = new ctx.World(w, h);
  return {
    world,
    T: ctx.LIFE_TYPES,
    PLANT_CFG: ctx.PLANT_CFG,
    MUSHROOM_CFG: ctx.MUSHROOM_CFG,
    KROL_LIFESPAN: ctx.KROL_LIFESPAN,
    KROL_MOVES_PER_TICK: ctx.KROL_MOVES_PER_TICK,
    ARCADE_STALE_AFTER: ctx.ARCADE_STALE_AFTER,
    ARCADE_LONELY_MAX: ctx.ARCADE_LONELY_MAX,
    ARCADE_NO_HERB_MAX: ctx.ARCADE_NO_HERB_MAX,
    ARCADE_PRED_ONLY_MAX: ctx.ARCADE_PRED_ONLY_MAX,
    SURVIVAL_POINT_INTERVAL: ctx.SURVIVAL_POINT_INTERVAL,
    CHAIN_SUSTAIN_GENS: ctx.CHAIN_SUSTAIN_GENS,
    LIFE_DATA: ctx.LIFE_DATA,
    LIFE_BALANCE: ctx.LIFE_BALANCE,
    LIFE_TABLES: ctx.LIFE_TABLES,
    MUT_CHANCE: ctx.MUT_CHANCE,
    TerrainArt: ctx.TerrainArt
  };
}

function placeKrol(world, x, y, T) {
  const krol = world.makeAgent(x, y, T.HERB);
  krol.trait = "крол-душегуб";
  krol.vision = 18;
  krol.movesPerTick = 6;
  krol.thresh = 12;
  krol.energy = 15;
  world.occupyAgentCells(krol);
  return krol;
}

module.exports = { loadEngine, createWorld, placeKrol };
