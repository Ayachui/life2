/**
 * HUD-модель: что игрок должен видеть за один взгляд.
 * Тексты и пороги — здесь; DOM собирает app.js.
 */
function hudBalance() {
  return (typeof LIFE_BALANCE !== "undefined" && LIFE_BALANCE) || {};
}

function hudNum(n) {
  if (!Number.isFinite(n)) return "∞";
  const v = Math.round(n);
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
}

function hudEnergyBand(energy, herbCost, predCost, plantCost = 8) {
  if (!Number.isFinite(energy)) return "sandbox";
  if (energy < plantCost) return "broke";
  if (energy < herbCost) return "tight";
  return "ok";
}

function hudSpecials(world) {
  const n = { koala: 0, cow: 0, krol: 0, wolf: 0, elk: 0 };
  if (!world?.agents) return n;
  for (const a of world.agents) {
    if (a.dead) continue;
    if (a.trait === "коала") n.koala++;
    else if (a.trait === "корова") n.cow++;
    else if (a.trait === "крол-душегуб") n.krol++;
    else if (a.trait === "волк") n.wolf++;
    else if (a.trait === "лось") n.elk++;
  }
  return n;
}

function hudTrophic(an, specials) {
  const core = [
    { icon: "🌱", label: "трава", value: an.grass || 0, id: "grass" },
    { icon: "🌿", label: "куст", value: an.bush || 0, id: "bush" },
    { icon: "🌳", label: "дерево", value: an.tree || 0, id: "tree" },
    { icon: "🐰", label: "заяц", value: an.herbs || 0, id: "herb" },
    { icon: "🦊", label: "лиса", value: an.preds || 0, id: "pred" },
    { icon: "🐻", label: "медведь", value: an.bears || 0, id: "bear" }
  ];
  const extra = [
    { icon: "🐨", label: "коала", value: specials.koala, id: "koala" },
    { icon: "🐮", label: "корова", value: specials.cow, id: "cow" },
    { icon: "🐇", label: "крол", value: specials.krol, id: "krol" },
    { icon: "🐺", label: "волк", value: specials.wolf, id: "wolf" },
    { icon: "🦌", label: "лось", value: specials.elk, id: "elk" }
  ].filter((s) => s.value > 0);
  return { core, extra };
}

function hudThreat(world, meta = {}) {
  if (!world?.arcade || meta.gameType === "sandbox") return null;
  if (!meta.started && (world.generation || 0) === 0) return null;
  const herbs = typeof world.herbivoreCount === "function"
    ? world.herbivoreCount()
    : (world.live ? world.live(2).length : 0);
  if (herbs <= 0) {
    const limit = typeof world.noHerbEndLimit === "function"
      ? world.noHerbEndLimit()
      : (hudBalance().arcadeEnd?.noHerbMax ?? 60);
    const used = world.noHerbGens || 0;
    const left = Math.max(0, limit - used);
    const level = left <= 8 ? "danger" : left <= 20 ? "warn" : "info";
    return {
      kind: "no_herb",
      level,
      used,
      limit,
      left,
      text: `Нет зайцев · ${used}/${limit}`
    };
  }
  const energy = meta.energy;
  const herbCost = meta.herbCost ?? 45;
  const stale = hudBalance().arcadeEnd?.staleAfter ?? 40;
  if (Number.isFinite(energy) && energy < herbCost && (world.noAnimalGens || 0) > 0) {
    const used = world.noAnimalGens;
    const left = Math.max(0, stale - used);
    if (used >= stale * 0.4) {
      return {
        kind: "broke",
        level: left <= 8 ? "danger" : "warn",
        used,
        limit: stale,
        left,
        text: `Нет ⚡ на зайца · ${used}/${stale}`
      };
    }
  }
  return null;
}

function hudChain(world) {
  const need = hudBalance().arcadeEnd?.chainSustainGens ?? 25;
  const current = Math.min(need, world.herbStreak || 0);
  return {
    current,
    need,
    locked: !!world.sustainedChain,
    ratio: need ? current / need : 0
  };
}

function hudRouletteEta(world) {
  const interval = hudBalance().roulette?.interval ?? 100;
  const g = world.generation || 0;
  if (g <= 0) return interval;
  const mod = g % interval;
  return mod === 0 ? 0 : interval - mod;
}

function hudObjective(world, meta = {}) {
  const arcade = meta.gameType === "arcade";
  if (!arcade) {
    return { title: "Песочница", line: meta.note || "Собери цепочку и смотри, что будет." };
  }
  if (!meta.started) {
    return { title: "Старт", line: "Посади траву и зайца. Необязательно тратить всё ⚡ — запас не сгорает." };
  }
  const threat = hudThreat(world, meta);
  if (threat?.kind === "no_herb") {
    return { title: "Цепочка рвётся", line: "Верни травоядных, пока не кончился таймер." };
  }
  const chain = hudChain(world);
  if (!chain.locked) {
    return { title: "Живая цепочка", line: `Держи зайцев ${chain.current}/${chain.need} циклов — откроются медведь и пирамида ⚡.` };
  }
  const baseCap = hudBalance().arcadeEconomy?.pulseCap ?? 90;
  const apexCap = hudBalance().arcadeEconomy?.pulseCapApex ?? 175;
  const c = world?.counts?.() || {};
  const hasPred = (c.preds || 0) > 0;
  const cap = hasPred ? apexCap : baseCap;
  return {
    title: "Цепочка жива",
    line: hasPred
      ? `⚡ копится до ${cap}. Копи на медведя (${apexCap}). Рулетка каждые 100.`
      : `⚡ до ${baseCap}. Построй пирамиду: ≥4 зайца, потом лиса — cap ${apexCap} и очки за время.`
  };
}

function hudViabilityTone(label) {
  if (label === "баланс" || label === "устойчиво") return "good";
  if (label === "голод" || label === "охотники без добычи" || label === "слишком много лис") return "bad";
  if (label === "только лес" || label === "нестабильно") return "warn";
  return "idle";
}

function hudModel(world, meta = {}) {
  const an = meta.analytics || (world && typeof world.analytics === "function" ? world.analytics() : {});
  const specials = hudSpecials(world);
  const herbCost = meta.herbCost ?? hudBalance().tools?.herb ?? 45;
  const predCost = meta.predCost ?? hudBalance().tools?.pred ?? 90;
  const plantCost = meta.plantCost ?? hudBalance().tools?.plant ?? 8;
  const energy = meta.energy;
  const budget = meta.budget ?? world?.arcadeBudget ?? null;
  const chain = world ? hudChain(world) : { current: 0, need: 25, locked: false, ratio: 0 };
  const threat = world ? hudThreat(world, { ...meta, herbCost }) : null;
  const rouletteIn = world ? hudRouletteEta(world) : 100;
  return {
    cycles: world?.generation || 0,
    score: world?.lifePoints || 0,
    energy,
    budget,
    pulseCap: world?.arcadePulseCap?.() ?? hudBalance().arcadeEconomy?.pulseCap ?? 90,
    energyBand: hudEnergyBand(energy, herbCost, predCost, plantCost),
    energyRatio: Number.isFinite(energy) && budget ? Math.min(1, energy / Math.max(1, budget)) : null,
    chain,
    threat,
    objective: hudObjective(world, { ...meta, note: an.note }),
    viability: {
      label: an.label || "пусто",
      score: an.score || 0,
      note: an.note || "",
      tone: hudViabilityTone(an.label),
      herbSat: an.herbSat || 0,
      predSat: an.predSat || 0,
      herbs: an.herbs || 0,
      preds: an.preds || 0,
      foodPerHerb: an.foodPerHerb,
      preyPerFox: an.preyPerFox
    },
    trophic: hudTrophic(an, specials),
    rouletteIn,
    showRoulette: meta.gameType === "arcade" && rouletteIn <= 25
  };
}

if (typeof window !== "undefined") {
  window.LifeHud = {
    hudNum, hudEnergyBand, hudSpecials, hudTrophic, hudThreat, hudChain,
    hudRouletteEta, hudObjective, hudViabilityTone, hudModel
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    hudNum, hudEnergyBand, hudSpecials, hudTrophic, hudThreat, hudChain,
    hudRouletteEta, hudObjective, hudViabilityTone, hudModel
  };
}
