/** Единый источник чисел баланса — Альфа 0.11.0. Тексты в data.js. */
const LIFE_BALANCE = {
  version: { stage: "alpha", major: 0, minor: 11, patch: 0 },

  tools: {
    plant: 8,
    herb: 45,
    pred: 90,
    bear: 175,
    water: 12,
    wall: 10,
    inspect: 0,
    erase: 0
  },

  difficulties: {
    easy: 1000,
    medium: 500,
    hard: 250,
    hardcore: 134
  },

  arcadeEnergy: {
    plantSprout: 0,
    plantEvolveGrass: 0,
    plantEvolveBush: 0,
    plantWilt: 0,
    animalBirth: 0,
    animalDeath: 0,
    hunt: 1,
    krolDevour: 0,
    fertilize: 0
  },

  mutationEnergy: {
    "крол-душегуб": 28,
    "коала": 14,
    "корова": 18,
    "волк": 20,
    "лось": 16
  },
  mutationEnergyPayoutMul: 0.5,

  evolutionTiers: {
    plant: {
      sprout: 1,
      evolveGrass: 2,
      evolveBush: 3,
      wilt: 2,
      fertilize: 2
    },
    agent: {
      rabbit: 1,
      koala: 2,
      cow: 3,
      fox: 2,
      wolf: 4,
      elk: 3,
      bear: 5,
      krol: 6
    }
  },

  lifePointScale: {
    base: 2,
    birth: 4,
    death: 2.5,
    plant: 1,
    mutation: 6,
    activity: 1,
    genBonus: 0.4,
    genCap: 5,
    survival: 4
  },

  /** Справочная таблица — движок не использует для начисления очков. */
  legacyLifePoints: {
    plant: { sprout: 2, evolveGrass: 4, evolveBush: 12, wilt: 8, place: 3 },
    birth: { rabbit: 8, koala: 12, cow: 24, fox: 14, wolf: 20, elk: 22, bear: 30, krol: 40 },
    death: { rabbit: 5, koala: 8, cow: 18, fox: 10, wolf: 16, elk: 20, bear: 35, krol: 35 },
    mutation: { "коала": 25, "корова": 32, "волк": 38, "лось": 34, "крол-душегуб": 60 },
    place: { herb: 8, pred: 14, bear: 30 },
    activity: { fertilize: 5 }
  },

  plants: {
    grassToBush: 10,
    bushToTree: 28,
    treeLife: 113,
    bushSpread: 0.037,
    bushFoodWeight: 0.4,
    bushViabilityWeight: 0.33,
    grassBites: 2,
    bushBites: 4,
    grassEnergy: 3.5,
    bushEnergyPerBite: 0.85,
    treeBitesCow: 10,
    treeBitesElk: 8,
    treeEnergyPerBite: 0.45,
    treeEnergyPerBiteCow: 2.0,
    treeBitesPerTickCow: 3,
    bushToTreeGrass: 2,
    treeEnergyPerBiteKoala: 0.55
  },

  decay: {
    herb: { radius: 2, strength: 0.08, ttl: 35 },
    pred: { radius: 4, strength: 0.14, ttl: 55 },
    bear: { radius: 5, strength: 0.16, ttl: 62 }
  },

  fertilizer: { ttl: 5, strength: 0.3 },

  mushrooms: { cowInterval: 18, cowChance: 0.12, energy: 2.5 },

  traitIds: {
    KROL: "крол-душегуб",
    KOALA: "коала",
    COW: "корова",
    WOLF: "волк",
    ELK: "лось"
  },

  mutationChance: {
    krol: 0.0025,
    koala: 0.02,
    cow: 0.01,
    wolf: 0.02,
    elk: 0.02
  },
  mutationGenBase: 2,

  species: {
    rabbit: { energy: 8, drain: 0.4, thresh: 13, vision: 7, moveInterval: 1, litter: 1, hueMin: 38, hueRange: 22 },
    fox: { energy: 10, drain: 0.48, thresh: 14, vision: 10, moveInterval: 1, litter: 1, hueMin: 350, hueRange: 20 },
    bear: { energy: 22, drain: 0.36, thresh: 19, vision: 5, moveInterval: 1, litter: 0, hueMin: 28, hueRange: 16 },
    koala: { energy: 12, drain: 0.28, thresh: 14, vision: 8, moveInterval: 2, litter: 2, hue: 145 },
    cow: { energy: 50, drain: 1.2, thresh: 22, vision: 6, moveInterval: 4, litter: 1, hue: 52 },
    wolf: { energy: 14, drain: 0.52, thresh: 15, vision: 12, moveInterval: 1, litter: 1, hue: 220 },
    elk: { energy: 25, drain: 0.32, thresh: 17, vision: 9, moveInterval: 1, litter: 1, hue: 185 },
    krol: {
      energy: 15, drain: 0.5, thresh: 12, vision: 18, moveInterval: 1, litter: 1,
      movesPerTick: 6, lifespan: 15, deathSpawn: 3, size: 2, hue: 312
    }
  },

  scoring: {
    huntEnergyGain: 7.2,
    processedEnergy: { base: 0.35, eaterTier: 0.3, foodTier: 0.35 },
    ecosystemMul: { herbShareFull: 0.4, minMul: 0.12, ratioScale: 2.5 }
  },

  breed: {
    minAge: { herb: 12, pred: 18, koala: 14, cow: 22, wolf: 20 },
    coolInit: { herb: 10, pred: 14 },
    coolAfter: { herb: 36, pred: 48 },
    energyRetain: 0.5,
    herbCrowd: { soft: 0.55, hard: 0.85, chanceSoft: 0.55, chanceHard: 0.25 },
    predRatio: { r1: 1, c1: 0.12, r05: 0.5, c05: 0.3, r025: 0.25, c025: 0.5 }
  },

  arcadeEnd: {
    staleAfter: 40,
    lonelyMax: 120,
    noHerbMax: 60,
    predOnlyMax: 35,
    chainSustainGens: 25,
    noAnimalRenewalGens: 90,
    survivalPointInterval: 100
  },

  water: { slowMul: 2, growthMul: 2 },

  terrain: { waterMax: 0.10, wallMax: 0.05 },

  roulette: {
    interval: 500,
    weights: { earthquake: 30, flood: 30, plague: 25, evolution: 15 },
    pct: {
      earthquake: [0.1, 0.3],
      flood: [0.1, 0.5],
      plague: [0.1, 0.3],
      evolution: [0.5, 1]
    },
    plagueFogTicks: 45,
    screenShake: 28
  },

  behavior: {
    wolfSolitude: 10,
    elkPoopInterval: 5,
    koalaHideRange: 1,
    skillBoostMul: 2
  }
};

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
  window.buildSpeciesCfg = buildSpeciesCfg;
  window.mulberry32 = mulberry32;
  window.balanceToolCost = balanceToolCost;
  window.balanceDifficultyEnergy = balanceDifficultyEnergy;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    LIFE_BALANCE,
    buildSpeciesCfg,
    mulberry32,
    balanceToolCost,
    balanceDifficultyEnergy
  };
}
