const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");

function loadEngine() {
  const sandbox = { window: {} };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  const balance = fs.readFileSync(path.join(ROOT, "js/balance.js"), "utf8");
  const data = fs.readFileSync(path.join(ROOT, "js/data.js"), "utf8");
  const engine = fs.readFileSync(path.join(ROOT, "js/engine.js"), "utf8");
  const terrain = fs.readFileSync(path.join(ROOT, "js/terrain.js"), "utf8");
  vm.runInContext(balance, sandbox);
  vm.runInContext(`${data}\nthis.LIFE_DATA = LIFE_DATA;`, sandbox);
  vm.runInContext(engine, sandbox);
  vm.runInContext(terrain, sandbox);
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
