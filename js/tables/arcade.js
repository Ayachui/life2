/**
 * Правила аркады: конец раунда и рулетка давления.
 */
(function (root) {
  const T = root.LIFE_TABLES || (root.LIFE_TABLES = {});
  T.arcade = {
    arcadeEnd: {
      staleAfter: 40,
      lonelyMax: 120,
      noHerbMax: 60,
      predOnlyMax: 35,
      chainSustainGens: 25,
      noAnimalRenewalGens: 90,
      survivalPointInterval: 100
    },

    roulette: {
      interval: 100,
      weights: { earthquake: 30, flood: 30, plague: 25, evolution: 15 },
      pct: {
        earthquake: [0.1, 0.3],
        flood: [0.1, 0.5],
        plague: [0.1, 0.3],
        evolution: [0.5, 1]
      },
      pressure: { perGen: 0.0015, cap: 1.8 },
      plagueFogTicks: 45,
      screenShake: 28
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
