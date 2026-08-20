/**
 * Экономика игрока: цены кисти, стартовый бюджет, ⚡.
 * Пирамида: трава(8) → заяц(45) → лиса(90) → медведь(175).
 * Импульс копится без потолка запаса, пока живы зайцы. Очки — от живой пирамиды.
 */
(function (root) {
  const T = root.LIFE_TABLES || (root.LIFE_TABLES = {});
  T.economy = {
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
      hunt: 0,
      krolDevour: 0,
      fertilize: 0,
      koalaTreeBite: 0
    },

    arcadeEconomy: {
      maxEnergyPerGen: 8,
      discoveryOnlyMutation: true,
      surplusDecay: 0,
      /** ⚡ копится, пока живы зайцы. Потолка запаса нет. */
      pulsePerGen: 1,
      pyramidPulse: 0.5,
      upkeep: { freeBiomass: 96, perExtra: 0.03, max: 2 }
    },

    mutationEnergy: {
      "крол-душегуб": 28,
      "коала": 14,
      "корова": 18,
      "волк": 20,
      "лось": 16
    },
    mutationEnergyPayoutMul: 0.5
  };
})(typeof window !== "undefined" ? window : globalThis);
