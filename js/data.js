/**
 * Презентационный каталог: тексты + числа из LIFE_BALANCE.
 * Не хранить баланс здесь — только сборка для UI.
 */
const _B = typeof LIFE_BALANCE !== "undefined" ? LIFE_BALANCE : {};
const _C = (typeof window !== "undefined" ? window.LIFE_CONTENT : globalThis.LIFE_CONTENT) || {};
const _T = _B.tools || {};
const _D = _B.difficulties || {};
const _R = _B.roulette || {};

const LIFE_DATA = {
  // Закон: номер только с origin/main после sync.
  gameVersion: _B.version || { stage: "alpha", major: 0, minor: 13, patch: 1 },
  tools: (_C.tools || []).map((tool) => ({
    ...tool,
    cost: _T[tool.id] ?? 0
  })),
  toolHelp: _C.toolHelp || {},
  speciesHelp: _C.speciesHelp || {},
  mutationEnergy: { ...(_B.mutationEnergy || {}) },
  arcadeEnergy: { ...(_B.arcadeEnergy || {}) },
  roulette: {
    interval: _R.interval ?? 500,
    weights: { ...(_R.weights || {}) },
    labels: { ...(_C.rouletteLabels || {}) }
  },
  plantEvolutionEnergy: 1,
  evolutionTiers: _B.evolutionTiers,
  lifePointScale: { ...(_B.lifePointScale || {}) },
  lifePoints: { ...(_B.legacyLifePoints || {}) },
  difficulties: (_C.difficulties || []).map((d) => ({
    ...d,
    energy: _D[d.id] ?? 0
  })),
  rulesInfographic: _C.rulesInfographic,
  tutorial: _C.tutorial,
  help: _C.help
};

function formatGameVersion(v = LIFE_DATA.gameVersion) {
  const labels = { alpha: "Альфа", beta: "Бета" };
  const num = `${v.major}.${v.minor}.${v.patch}`;
  const label = labels[v.stage];
  return label ? `${label} ${num}` : num;
}

const ROULETTE_SLICE_CENTER = _C.ROULETTE_SLICE_CENTER || {
  earthquake: 45, flood: 135, plague: 225, evolution: 315
};
const rouletteSliceAtPointer = _C.rouletteSliceAtPointer;
const rouletteSpinDegrees = _C.rouletteSpinDegrees;

if (typeof window !== "undefined") {
  window.LIFE_DATA = LIFE_DATA;
  window.formatGameVersion = formatGameVersion;
  window.ROULETTE_SLICE_CENTER = ROULETTE_SLICE_CENTER;
  window.rouletteSliceAtPointer = rouletteSliceAtPointer;
  window.rouletteSpinDegrees = rouletteSpinDegrees;
}
