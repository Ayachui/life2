var EMPTY = 0, PLANT = 1, HERB = 2, PRED = 3, WALL = 4, WATER = 5, BEAR = 6, MUSHROOM = 7;

var STAGE_GRASS = 1;
var STAGE_BUSH = 2;
var STAGE_TREE = 3;

var BAL = typeof LIFE_BALANCE !== "undefined" ? LIFE_BALANCE : {};
var PLANT_CFG = { ...BAL.plants };
var DECAY_CFG = { ...BAL.decay };
var FERTILIZER_CFG = { ...(BAL.fertilizer || { ttl: 5, strength: 0.3 }) };
var COW_MANURE_CFG = { ...(BAL.cowManure || { ttl: 8, strength: 0.5, radius: 1 }) };
var MUSHROOM_CFG = { ...(BAL.mushrooms || { cowInterval: 18, cowChance: 0.12, energy: 2.5 }) };

var TRAIT = { ...(BAL.traitIds || {
  KROL: "крол-душегуб", KOALA: "коала", COW: "корова", WOLF: "волк", ELK: "лось"
}) };

var MUT_CHANCE = { ...(BAL.mutationChance || { krol: 0.0025, koala: 0.01, cow: 0.01, wolf: 0.02, elk: 0.02 }) };

var KROL_LIFESPAN = BAL.species?.krol?.lifespan ?? 15;
var KROL_DEATH_SPAWN = BAL.species?.krol?.deathSpawn ?? 3;
var KROL_MOVES_PER_TICK = BAL.species?.krol?.movesPerTick ?? 6;
var KROL_SIZE = BAL.species?.krol?.size ?? 2;
var WOLF_SOLITUDE = BAL.behavior?.wolfSolitude ?? 10;
var WOLF_COW_PRIORITY = BAL.behavior?.wolfCowPriority ?? 12;
var ELK_POOP_INTERVAL = BAL.behavior?.elkPoopInterval ?? 5;
var KOALA_HIDE_RANGE = BAL.behavior?.koalaHideRange ?? 1;
var KOALA_TREE_DOWNGRADE_GENS = BAL.behavior?.koalaTreeDowngradeGens ?? 5;
var SPECIES_CFG = typeof buildSpeciesCfg === "function"
  ? buildSpeciesCfg(TRAIT, BAL.species || {})
  : {};

var NO_ANIMAL_RENEWAL_GENS = BAL.arcadeEnd?.noAnimalRenewalGens ?? 90;
var ARCADE_STALE_AFTER = BAL.arcadeEnd?.staleAfter ?? 40;
var ARCADE_LONELY_MAX = BAL.arcadeEnd?.lonelyMax ?? 120;
var ARCADE_NO_HERB_MAX = BAL.arcadeEnd?.noHerbMax ?? 60;
var ARCADE_PRED_ONLY_MAX = BAL.arcadeEnd?.predOnlyMax ?? 35;
var ARCADE_ERA_AFTER_CHAIN = BAL.arcadeEnd?.eraAfterChain ?? 0;
var ROULETTE_INTERVAL = BAL.roulette?.interval ?? 100;
var PLAGUE_FOG_TICKS = BAL.roulette?.plagueFogTicks ?? 45;
var SURVIVAL_POINT_INTERVAL = BAL.arcadeEnd?.survivalPointInterval ?? 100;
var CHAIN_SUSTAIN_GENS = BAL.arcadeEnd?.chainSustainGens ?? 25;

function emptyEnergyAudit() {
  return {
    hunt: 0,
    koalaTreeBite: 0,
    mutation: 0,
    plantSprout: 0,
    plantEvolveGrass: 0,
    plantEvolveBush: 0,
    plantWilt: 0,
    animalBirth: 0,
    animalDeath: 0,
    krolDevour: 0,
    fertilize: 0,
    upkeep: 0,
    capped: 0,
    surplusDecay: 0,
    pulse: 0,
    other: 0
  };
}

function addAudit(audit, key, amount) {
  if (!audit || !amount) return;
  if (Object.prototype.hasOwnProperty.call(audit, key)) audit[key] += amount;
  else audit.other += amount;
}

var BREED_MIN_AGE = { ...(BAL.breed?.minAge || { herb: 12, pred: 18, koala: 14, cow: 22, wolf: 20 }) };
var BREED_COOL_INIT = { ...(BAL.breed?.coolInit || { herb: 10, pred: 14 }) };
var BREED_COOL_AFTER = { ...(BAL.breed?.coolAfter || { herb: 36, pred: 48, koala: 52 }) };
var KOALA_CROWD = { ...(BAL.breed?.koalaCrowd || { soft: 0.65, hard: 0.9, chanceSoft: 0.45, chanceHard: 0.12 }) };
var KOALA_PERCH_CAP = BAL.behavior?.koalaPerchCapacity || { tree: 1, bush: 0.5 };
var WATER_SLOW_MUL = BAL.water?.slowMul ?? 2;
var WATER_GROWTH_MUL = BAL.water?.growthMul ?? 2;
var SCORING = BAL.scoring || {};
var ROULETTE_PCT = BAL.roulette?.pct || {};

var SPECIAL_TRAITS = new Set([TRAIT.KROL, TRAIT.KOALA, TRAIT.COW, TRAIT.WOLF, TRAIT.ELK]);

function skillMul(a) {
  const mul = BAL.behavior?.skillBoostMul ?? 2;
  return a?.skillBoost ? mul : 1;
}

function isTrait(a, t) {
  return !!a && a.trait === t;
}

function isKrolDushegub(a) {
  return isTrait(a, TRAIT.KROL);
}

function krolFootprintAt(x, y) {
  return [
    { x, y },
    { x: x + 1, y },
    { x, y: y + 1 },
    { x: x + 1, y: y + 1 }
  ];
}

function agentFootprint(a) {
  if (isKrolDushegub(a)) return krolFootprintAt(a.x, a.y);
  return [{ x: a.x, y: a.y }];
}

function agentOccupies(a, x, y) {
  if (!a) return false;
  if (isKrolDushegub(a)) return x >= a.x && x <= a.x + 1 && y >= a.y && y <= a.y + 1;
  return a.x === x && a.y === y;
}

function isKoala(a) {
  return isTrait(a, TRAIT.KOALA);
}

function koalaPerchedOn(world, a) {
  if (!isKoala(a) || !world) return false;
  return world.isKoalaPerchCell(a.x, a.y);
}

function isCow(a) {
  return isTrait(a, TRAIT.COW);
}

function isWolf(a) {
  return isTrait(a, TRAIT.WOLF);
}

function isElk(a) {
  return isTrait(a, TRAIT.ELK);
}

function isSpecialSpecies(a) {
  return !!a && SPECIAL_TRAITS.has(a.trait);
}

function herbSpecies(a) {
  if (!a || a.kind !== HERB) return "rabbit";
  if (isKrolDushegub(a)) return "krol";
  if (isKoala(a)) return "koala";
  if (isCow(a)) return "cow";
  return "rabbit";
}

function predSpecies(a) {
  if (!a || a.kind !== PRED) return "fox";
  if (isWolf(a)) return "wolf";
  if (isElk(a)) return "elk";
  return "fox";
}
