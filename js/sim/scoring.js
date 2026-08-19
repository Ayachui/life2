/** Очки жизни — формулы из tables/scoring.js */
World.prototype.lifePointTable = function lifePointTable() {
    return (typeof LIFE_DATA !== "undefined" && LIFE_DATA.lifePoints) || {};
  };

World.prototype.tierConfig = function tierConfig() {
    if (typeof LIFE_BALANCE !== "undefined" && LIFE_BALANCE.evolutionTiers) return LIFE_BALANCE.evolutionTiers;
    return (typeof LIFE_DATA !== "undefined" && LIFE_DATA.evolutionTiers) || { plant: {}, agent: {} };
  };

World.prototype.pointScale = function pointScale() {
    if (typeof LIFE_BALANCE !== "undefined" && LIFE_BALANCE.lifePointScale) return LIFE_BALANCE.lifePointScale;
    return (typeof LIFE_DATA !== "undefined" && LIFE_DATA.lifePointScale) || {};
  };

World.prototype.agentLifeKey = function agentLifeKey(a) {
    if (!a) return "rabbit";
    if (a.kind === BEAR) return "bear";
    if (isKrolDushegub(a)) return "krol";
    if (isKoala(a)) return "koala";
    if (isCow(a)) return "cow";
    if (isWolf(a)) return "wolf";
    if (isElk(a)) return "elk";
    if (a.kind === PRED) return "fox";
    return "rabbit";
  };

World.prototype.pointsFor = function pointsFor(category, key) {
    const table = this.lifePointTable()[category];
    const v = table?.[key];
    return Number.isFinite(v) ? v : 0;
  };

World.prototype.agentTier = function agentTier(a) {
    if (!a) return 1;
    const tiers = this.tierConfig().agent || {};
    return tiers[this.agentLifeKey(a)] ?? 1;
  };

World.prototype.plantStageTier = function plantStageTier(stage) {
    if (stage === STAGE_BUSH) return 2;
    if (stage === STAGE_TREE) return 3;
    return 1;
  };

World.prototype.plantEventTier = function plantEventTier(eventKey) {
    const tiers = this.tierConfig().plant || {};
    return tiers[eventKey] ?? 1;
  };

World.prototype.genPointMul = function genPointMul(gen) {
    const sc = this.pointScale();
    const cap = sc.genCap ?? 5;
    const bonus = sc.genBonus ?? 0.4;
    const g = Math.min(Math.max(1, gen || 1), cap);
    return 1 + bonus * (g - 1);
  };

World.prototype.tierPoints = function tierPoints(event, tier, gen = 1) {
    const sc = this.pointScale();
    const base = sc.base ?? 2;
    const evtMul = sc[event] ?? 1;
    return Math.max(1, Math.round(base * tier * evtMul * this.genPointMul(gen)));
  };

World.prototype.awardLifePoints = function awardLifePoints(amount) {
    if (!this.arcade || !amount || amount <= 0) return;
    this.lifePoints += amount;
  };

World.prototype.awardScaledEcoPoints = function awardScaledEcoPoints(amount) {
    const mul = this.ecosystemRewardMul();
    if (!mul || !amount) return;
    this.awardLifePoints(Math.max(1, Math.round(amount * mul)));
  };

World.prototype.awardBirthPoints = function awardBirthPoints(agent) {
    this.awardScaledEcoPoints(this.tierPoints("birth", this.agentTier(agent), agent?.gen));
  };

World.prototype.awardDeathPoints = function awardDeathPoints(agent) {
    this.awardScaledEcoPoints(this.tierPoints("death", this.agentTier(agent), agent?.gen));
  };

World.prototype.awardMutationPoints = function awardMutationPoints(agent) {
    const tier = this.agentTier(agent);
    const sc = this.pointScale();
    const bonus = sc.mutation ?? 6;
    this.awardScaledEcoPoints(Math.max(1, Math.round(bonus * tier * this.genPointMul(agent?.gen))));
  };

World.prototype.awardProcessedEnergy = function awardProcessedEnergy(energy, eater = null, foodTier = 1) {
    if (!this.arcade || !energy || energy <= 0) return;
    const eaterTier = eater ? this.agentTier(eater) : 1;
    const pe = SCORING.processedEnergy || {};
    const weight = (pe.base ?? 0.35) + eaterTier * (pe.eaterTier ?? 0.3) + foodTier * (pe.foodTier ?? 0.35);
    const points = Math.max(1, Math.round(energy * weight * this.genPointMul(eater?.gen)));
    this.awardScaledEcoPoints(points);
  };

World.prototype.awardPlantLifePoints = function awardPlantLifePoints(eventKey) {
    const mul = this.ecosystemRewardMul();
    if (!mul) return;
    const tier = this.plantEventTier(eventKey);
    this.awardScaledEcoPoints(this.tierPoints("plant", tier));
  };

World.prototype.tickSurvivalPoints = function tickSurvivalPoints() {
    if (!this.arcade || !this.sustainedChain) return;
    if (this.generation <= 0 || this.generation % SURVIVAL_POINT_INTERVAL !== 0) return;
    const mul = this.ecosystemRewardMul();
    if (mul <= 0) return;
    const base = this.pointScale().survival ?? 4;
    this.awardLifePoints(Math.max(1, Math.round(base * mul)));
  };

World.prototype.ecosystemRewardMul = function ecosystemRewardMul() {
    const herbs = this.herbivoreCount();
    if (herbs <= 0) return 0;
    const preds = this.predatorCount();
    const total = herbs + preds;
    if (preds <= 0 || total <= 0) return 1;
    const ratio = herbs / total;
    const eco = SCORING.ecosystemMul || {};
    const full = eco.herbShareFull ?? 0.4;
    if (ratio >= full) return 1;
    return Math.max(eco.minMul ?? 0.12, Math.min(1, ratio * (eco.ratioScale ?? 2.5)));
  };

World.prototype.herbivoreCount = function herbivoreCount() {
    return this.live(HERB).length;
  };

World.prototype.predatorCount = function predatorCount() {
    let n = this.live(PRED).length;
    for (const a of this.agents) {
      if (!a.dead && a.kind === BEAR) n++;
    }
    return n;
  };
