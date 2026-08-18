const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");

function loadEngine() {
  const sandbox = { window: {} };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  const data = fs.readFileSync(path.join(ROOT, "js/data.js"), "utf8");
  const engine = fs.readFileSync(path.join(ROOT, "js/engine.js"), "utf8");
  vm.runInContext(`${data}\nthis.LIFE_DATA = LIFE_DATA;`, sandbox);
  vm.runInContext(engine, sandbox);
  return sandbox;
}

function createWorld(w = 24, h = 24) {
  const ctx = loadEngine();
  const world = new ctx.World(w, h);
  return {
    world,
    T: ctx.LIFE_TYPES,
    PLANT_CFG: ctx.PLANT_CFG,
    KROL_LIFESPAN: ctx.KROL_LIFESPAN,
    ARCADE_STALE_AFTER: ctx.ARCADE_STALE_AFTER,
    ARCADE_LONELY_MAX: ctx.ARCADE_LONELY_MAX,
    CHAIN_SUSTAIN_GENS: ctx.CHAIN_SUSTAIN_GENS,
    LIFE_DATA: ctx.LIFE_DATA
  };
}

function placeKrol(world, x, y, T) {
  const krol = world.makeAgent(x, y, T.HERB);
  krol.trait = "крол-душегуб";
  world.occupyAgentCells(krol);
  return krol;
}

module.exports = { loadEngine, createWorld, placeKrol };
