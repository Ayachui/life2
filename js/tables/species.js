/**
 * Виды: статы, шансы мутации, размножение, видовое поведение.
 * Шанс мутации: min(1, base * mutationGenBase^(gen-1)).
 */
(function (root) {
  const T = root.LIFE_TABLES || (root.LIFE_TABLES = {});
  T.species = {
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

    units: {
      rabbit: { energy: 8, drain: 0.4, thresh: 13, vision: 7, moveInterval: 1, litter: 1, hueMin: 38, hueRange: 22 },
      fox: { energy: 10, drain: 0.48, thresh: 14, vision: 10, moveInterval: 1, litter: 1, hueMin: 350, hueRange: 20 },
      bear: { energy: 22, drain: 0.36, thresh: 19, vision: 5, moveInterval: 1, litter: 0, hueMin: 28, hueRange: 16 },
      koala: { energy: 12, drain: 0.28, thresh: 14, vision: 8, moveInterval: 2, litter: 1, litterOnTree: 2, hue: 145 },
      cow: { energy: 50, drain: 1.2, thresh: 22, vision: 6, moveInterval: 4, litter: 1, hue: 52 },
      wolf: { energy: 14, drain: 0.52, thresh: 15, vision: 12, moveInterval: 1, litter: 1, hue: 220 },
      elk: { energy: 25, drain: 0.32, thresh: 17, vision: 9, moveInterval: 1, litter: 1, hue: 185 },
      krol: {
        energy: 15, drain: 0.5, thresh: 12, vision: 18, moveInterval: 1, litter: 1,
        movesPerTick: 6, lifespan: 15, deathSpawn: 3, size: 2, hue: 312
      }
    },

    breed: {
      minAge: { herb: 12, pred: 18, koala: 22, cow: 22, wolf: 20 },
      coolInit: { herb: 10, pred: 14 },
      coolAfter: { herb: 36, pred: 48, koala: 52 },
      energyRetain: 0.5,
      herbCrowd: { soft: 0.55, hard: 0.85, chanceSoft: 0.55, chanceHard: 0.25 },
      koalaCrowd: { soft: 0.65, hard: 0.9, chanceSoft: 0.45, chanceHard: 0.12 },
      predRatio: { r1: 1, c1: 0.12, r05: 0.5, c05: 0.3, r025: 0.25, c025: 0.5 }
    },

    behavior: {
      wolfSolitude: 10,
      elkPoopInterval: 5,
      koalaHideRange: 1,
      koalaPerchCapacity: { tree: 1, bush: 0.5 },
      skillBoostMul: 2
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
