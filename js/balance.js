/**
 * Каталог баланса: плоский LIFE_BALANCE для движка и тестов.
 * Источник — js/tables/* (домены). Не дублировать числа здесь.
 */
function assembleLifeBalance(tables) {
  const meta = tables.meta || {};
  const economy = tables.economy || {};
  const scoring = tables.scoring || {};
  const species = tables.species || {};
  const ecology = tables.ecology || {};
  const arcade = tables.arcade || {};
  return {
    version: meta.version,
    tools: economy.tools,
    difficulties: economy.difficulties,
    arcadeEnergy: economy.arcadeEnergy,
    arcadeEconomy: economy.arcadeEconomy,
    mutationEnergy: economy.mutationEnergy,
    mutationEnergyPayoutMul: economy.mutationEnergyPayoutMul,
    evolutionTiers: scoring.evolutionTiers,
    lifePointScale: scoring.lifePointScale,
    legacyLifePoints: scoring.legacyLifePoints,
    scoring: scoring.formulas,
    plants: ecology.plants,
    decay: ecology.decay,
    fertilizer: ecology.fertilizer,
    cowManure: ecology.cowManure,
    mushrooms: ecology.mushrooms,
    water: ecology.water,
    terrain: ecology.terrain,
    traitIds: species.traitIds,
    mutationChance: species.mutationChance,
    mutationGenBase: species.mutationGenBase,
    species: species.units,
    breed: species.breed,
    behavior: species.behavior,
    arcadeEnd: arcade.arcadeEnd,
    roulette: arcade.roulette
  };
}

const LIFE_TABLES_ROOT = typeof window !== "undefined" ? window : globalThis;
const LIFE_BALANCE = assembleLifeBalance(LIFE_TABLES_ROOT.LIFE_TABLES || {});

function buildSpeciesCfg(traitIds, species) {
  const t = traitIds;
  const s = species;
  return {
    [t.KOALA]: { energy: s.koala.energy, drain: s.koala.drain, thresh: s.koala.thresh, vision: s.koala.vision, hue: s.koala.hue, litter: s.koala.litter, moveInterval: s.koala.moveInterval },
    [t.COW]: { energy: s.cow.energy, drain: s.cow.drain, thresh: s.cow.thresh, vision: s.cow.vision, hue: s.cow.hue, litter: s.cow.litter, moveInterval: s.cow.moveInterval },
    [t.WOLF]: { energy: s.wolf.energy, drain: s.wolf.drain, thresh: s.wolf.thresh, vision: s.wolf.vision, hue: s.wolf.hue, litter: s.wolf.litter, moveInterval: s.wolf.moveInterval },
    [t.ELK]: { energy: s.elk.energy, drain: s.elk.drain, thresh: s.elk.thresh, vision: s.elk.vision, hue: s.elk.hue, litter: s.elk.litter, moveInterval: s.elk.moveInterval },
    [t.KROL]: {
      energy: s.krol.energy, drain: s.krol.drain, thresh: s.krol.thresh, vision: s.krol.vision,
      hue: s.krol.hue, litter: s.krol.litter, moveInterval: s.krol.moveInterval, movesPerTick: s.krol.movesPerTick
    }
  };
}

function mulberry32(seed) {
  let s = seed >>> 0;
  const fn = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  fn.getState = () => s;
  fn.setState = (v) => { s = v >>> 0; };
  fn.seed = seed >>> 0;
  return fn;
}

function balanceToolCost(id) {
  return LIFE_BALANCE.tools[id] ?? 0;
}

function balanceDifficultyEnergy(id) {
  return LIFE_BALANCE.difficulties[id] ?? 0;
}

if (typeof window !== "undefined") {
  window.LIFE_BALANCE = LIFE_BALANCE;
  window.assembleLifeBalance = assembleLifeBalance;
  window.buildSpeciesCfg = buildSpeciesCfg;
  window.mulberry32 = mulberry32;
  window.balanceToolCost = balanceToolCost;
  window.balanceDifficultyEnergy = balanceDifficultyEnergy;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    LIFE_BALANCE,
    assembleLifeBalance,
    buildSpeciesCfg,
    mulberry32,
    balanceToolCost,
    balanceDifficultyEnergy
  };
}
