/**
 * Экономика игрока: цены кисти, стартовый бюджет, ⚡.
 * Закон: живой мир платит очками, не бесконечной энергией.
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
      maxEnergyPerGen: 6,
      discoveryOnlyMutation: true,
      surplusDecay: 0.04,
      /** Импульс вмешательства: после налога леса, не выше cap. Не ферма. */
      pulsePerGen: 0.5,
      pulseCap: 90,
      upkeep: {
        freeBiomass: 48,
        perExtra: 0.04,
        max: 4
      }
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
