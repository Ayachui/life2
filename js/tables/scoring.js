/**
 * Очки жизни: тиры эволюции и веса событий.
 * Формула: round(base * tier * eventMul * genMul), затем ecoMul.
 */
(function (root) {
  const T = root.LIFE_TABLES || (root.LIFE_TABLES = {});
  T.scoring = {
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
      survival: 10,
      survivalPyramid: 1.5,
      survivalAgePer: 250,
      survivalAgeBonus: 0.25,
      survivalAgeCap: 2
    },

    /** Справка. Движок начисляет по evolutionTiers + lifePointScale. */
    legacyLifePoints: {
      plant: { sprout: 2, evolveGrass: 4, evolveBush: 12, wilt: 8, place: 3 },
      birth: { rabbit: 8, koala: 12, cow: 24, fox: 14, wolf: 20, elk: 22, bear: 30, krol: 40 },
      death: { rabbit: 5, koala: 8, cow: 18, fox: 10, wolf: 16, elk: 20, bear: 35, krol: 35 },
      mutation: { "коала": 25, "корова": 32, "волк": 38, "лось": 34, "крол-душегуб": 60 },
      place: { herb: 8, pred: 14, bear: 30 },
      activity: { fertilize: 5 }
    },

    formulas: {
      huntEnergyGain: 7.2,
      processedEnergy: { base: 0.35, eaterTier: 0.3, foodTier: 0.35 },
      ecosystemMul: { herbShareFull: 0.4, minMul: 0.12, ratioScale: 2.5 }
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
