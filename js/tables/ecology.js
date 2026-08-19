/**
 * Экология поля: растения, падаль, удобрение, грибы, вода, кап террейна.
 */
(function (root) {
  const T = root.LIFE_TABLES || (root.LIFE_TABLES = {});
  T.ecology = {
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
      treeEnergyPerBiteKoala: 0.85
    },

    decay: {
      herb: { radius: 2, strength: 0.08, ttl: 35 },
      pred: { radius: 4, strength: 0.14, ttl: 55 },
      bear: { radius: 5, strength: 0.16, ttl: 62 }
    },

    fertilizer: { ttl: 5, strength: 0.3 },

    mushrooms: { cowInterval: 18, cowChance: 0.12, energy: 2.5 },

    water: { slowMul: 2, growthMul: 2 },

    terrain: { waterMax: 0.10, wallMax: 0.05 }
  };
})(typeof window !== "undefined" ? window : globalThis);
