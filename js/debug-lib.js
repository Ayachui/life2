/** Хелперы отладки баланса — без DOM. */
function lifeInvariantChecks(world) {
  if (!world) return [{ level: "warn", text: "Мир не создан" }];
  const a = world.analytics();
  const warnings = [];

  if (a.plants && !a.herbs && !a.preds && world.noHerbGens > 20) {
    warnings.push({ level: "warn", text: "Лес без травоядных — renewal падает" });
  }
  if (a.preds && !a.herbs) {
    warnings.push({ level: "error", text: "Охотники без добычи" });
  }
  if (a.label === "перенаселение" || (a.herbs >= 8 && a.foodPerHerb !== "—" && Number(a.foodPerHerb) < 1)) {
    warnings.push({ level: "warn", text: "Перенаселение / мало корма" });
  }
  if (a.preds && a.herbs && a.preyPerFox !== "—" && Number(a.preyPerFox) < 1.3) {
    warnings.push({ level: "warn", text: "Слишком много лис относительно зайцев" });
  }
  if (world.arcade && world.noHerbGens >= (world.noHerbEndLimit?.() ?? 60) - 5) {
    warnings.push({ level: "error", text: `Нет травоядных ${world.noHerbGens} циклов` });
  }
  return warnings;
}

function lifeWorldSnapshot(world, meta = {}) {
  if (!world) return { meta, error: "no world" };
  const a = world.analytics();
  const mul = typeof world.ecosystemRewardMul === "function" ? world.ecosystemRewardMul() : null;
  return {
    meta,
    generation: world.generation,
    arcade: world.arcade,
    sustainedChain: world.sustainedChain,
    herbStreak: world.herbStreak,
    noHerbGens: world.noHerbGens,
    noAnimalGens: world.noAnimalGens,
    lonelyGens: world.lonelyGens,
    lifePoints: world.lifePoints,
    pendingEnergy: world.pendingEnergy,
    ecosystemMul: mul,
    counts: {
      grass: a.grass,
      bush: a.bush,
      tree: a.tree,
      herbs: a.herbs,
      preds: a.preds,
      bears: a.bears
    },
    foodPerHerb: a.foodPerHerb,
    preyPerFox: a.preyPerFox,
    viability: { label: a.label, score: a.score },
    rngSeed: world.getRngSeed?.() ?? null,
    agents: world.agents.filter((x) => !x.dead).map((x) => ({
      kind: x.kind,
      trait: x.trait,
      x: x.x,
      y: x.y,
      energy: Math.round(x.energy * 10) / 10,
      gen: x.gen
    }))
  };
}

function lifeSelfCheck(world, ctx = {}) {
  const results = [];
  const clone = world.clone();
  clone.setSeed?.(42);
  const T = ctx.T || (typeof LIFE_TYPES !== "undefined" ? LIFE_TYPES : null);
  if (!T) return [{ ok: false, name: "types", detail: "LIFE_TYPES missing" }];

  clone.arcade = true;
  clone.setPlant(5, 5, T.STAGE_GRASS, 0);
  for (let i = 0; i < 80; i++) clone.step();
  const passive = clone.pendingEnergy;
  results.push({
    ok: passive === 0,
    name: "plants_only_no_passive_energy",
    detail: `pending=${passive}`
  });

  const w2 = world.clone();
  w2.setSeed?.(99);
  w2.arcade = false;
  w2.set(4, 4, T.HERB);
  w2.agents = [w2.makeAgent(4, 4, T.HERB)];
  w2.set(4, 5, T.PRED);
  w2.agents.push(w2.makeAgent(4, 5, T.PRED));
  for (let i = 0; i < 60; i++) {
    w2.stepAgents();
    w2.generation++;
  }
  const foxDead = w2.agents.every((a) => a.dead || a.kind !== T.PRED);
  results.push({ ok: foxDead, name: "fox_starves_without_herb", detail: String(foxDead) });

  const inv = lifeInvariantChecks(world);
  results.push({
    ok: !inv.some((w) => w.level === "error"),
    name: "live_invariants",
    detail: inv.map((w) => w.text).join("; ") || "ok"
  });

  return results;
}

if (typeof window !== "undefined") {
  window.LifeDebugLib = { lifeInvariantChecks, lifeWorldSnapshot, lifeSelfCheck };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { lifeInvariantChecks, lifeWorldSnapshot, lifeSelfCheck };
}
