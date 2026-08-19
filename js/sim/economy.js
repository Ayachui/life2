/** Экономика ⚡ игрока — tables/economy.js */
World.prototype.arcadeEnergyTable = function arcadeEnergyTable() {
    if (typeof LIFE_BALANCE !== "undefined" && LIFE_BALANCE.arcadeEnergy) return LIFE_BALANCE.arcadeEnergy;
    return (typeof LIFE_DATA !== "undefined" && LIFE_DATA.arcadeEnergy) || {};
  };

World.prototype.arcadeEconomyCfg = function arcadeEconomyCfg() {
    if (typeof LIFE_BALANCE !== "undefined" && LIFE_BALANCE.arcadeEconomy) return LIFE_BALANCE.arcadeEconomy;
    return {};
  };

World.prototype.noteEnergyAudit = function noteEnergyAudit(key, amount) {
    if (!amount) return;
    addAudit(this.energyAuditTick, key, amount);
  };

World.prototype.foldEnergyAudit = function foldEnergyAudit() {
    const tick = this.energyAuditTick || emptyEnergyAudit();
    const acc = this.energyAudit || (this.energyAudit = emptyEnergyAudit());
    for (const key of Object.keys(acc)) {
      acc[key] += tick[key] || 0;
    }
  };

World.prototype.arcadeUpkeep = function arcadeUpkeep() {
    if (!this.arcade) return 0;
    const u = this.arcadeEconomyCfg().upkeep;
    if (!u) return 0;
    const c = this.counts();
    const biomass = (c.plants || 0) + (c.herbs || 0) + (c.preds || 0) + (c.bears || 0);
    const free = u.freeBiomass ?? 48;
    if (biomass <= free) return 0;
    const extra = biomass - free;
    const raw = extra * (u.perExtra ?? 0.04);
    return Math.min(u.max ?? 4, Math.max(0, Math.floor(raw)));
  };

World.prototype.arcadeSurplusDecay = function arcadeSurplusDecay() {
    if (!this.arcade) return 0;
    const rate = this.arcadeEconomyCfg().surplusDecay ?? 0;
    const budget = this.arcadeBudget;
    const energy = this.playerEnergy;
    if (!rate || budget == null || energy == null || !Number.isFinite(energy)) return 0;
    const projected = energy + this.pendingEnergy;
    if (projected <= budget) return 0;
    return Math.max(0, Math.ceil((projected - budget) * rate));
  };

World.prototype.arcadePulseCap = function arcadePulseCap() {
    const eco = this.arcadeEconomyCfg();
    if (eco.pulseCap != null) return eco.pulseCap;
    return this.arcadeBudget ?? 90;
  };

World.prototype.clampArcadePending = function clampArcadePending() {
    const energy = Number.isFinite(this.playerEnergy) ? this.playerEnergy : 0;
    if (energy + this.pendingEnergy < 0) this.pendingEnergy = -energy;
  };

World.prototype.applyArcadePulse = function applyArcadePulse() {
    if (!this.sustainedChain) return 0;
    const eco = this.arcadeEconomyCfg();
    const per = eco.pulsePerGen;
    if (!per) return 0;
    this.pulseAcc = (this.pulseAcc || 0) + per;
    const grant = Math.floor(this.pulseAcc);
    this.pulseAcc -= grant;
    if (grant <= 0) return 0;
    const energy = Number.isFinite(this.playerEnergy) ? this.playerEnergy : 0;
    const projected = energy + this.pendingEnergy;
    const room = Math.max(0, this.arcadePulseCap() - projected);
    const add = Math.min(grant, room);
    if (add > 0) {
      this.pendingEnergy += add;
      this.noteEnergyAudit("pulse", add);
    }
    return add;
  };

World.prototype.settleArcadeEconomy = function settleArcadeEconomy() {
    if (!this.arcade) return;
    const cap = this.arcadeEconomyCfg().maxEnergyPerGen;
    if (cap != null && this.pendingEnergy > cap) {
      this.noteEnergyAudit("capped", this.pendingEnergy - cap);
      this.pendingEnergy = cap;
    }
    const upkeep = this.arcadeUpkeep();
    if (upkeep > 0) {
      this.noteEnergyAudit("upkeep", upkeep);
      this.pendingEnergy -= upkeep;
    }
    const decay = this.arcadeSurplusDecay();
    if (decay > 0) {
      this.noteEnergyAudit("surplusDecay", decay);
      this.pendingEnergy -= decay;
    }
    this.clampArcadePending();
    this.applyArcadePulse();
    this.foldEnergyAudit();
    const log = this.economyLog || (this.economyLog = []);
    log.push({
      g: this.generation,
      pending: this.pendingEnergy,
      player: this.playerEnergy,
      granted: (this.energyAuditTick.hunt || 0)
        + (this.energyAuditTick.koalaTreeBite || 0)
        + (this.energyAuditTick.mutation || 0)
        + (this.energyAuditTick.pulse || 0)
        + (this.energyAuditTick.other || 0),
      upkeep: this.energyAuditTick.upkeep || 0,
      decay: this.energyAuditTick.surplusDecay || 0,
      pulse: this.energyAuditTick.pulse || 0,
      herbs: this.herbivoreCount(),
      plants: this.counts().plants
    });
    if (log.length > 80) log.splice(0, log.length - 80);
  };

World.prototype.energyAuditTotals = function energyAuditTotals() {
    return { ...(this.energyAudit || emptyEnergyAudit()) };
  };

World.prototype.grantArcadeEnergy = function grantArcadeEnergy(key) {
    if (!this.arcade || !key) return 0;
    let gain = this.arcadeEnergyTable()[key] ?? 0;
    if (gain <= 0) return 0;
    const mul = this.ecosystemRewardMul();
    if (mul <= 0) return 0;
    gain = Math.floor(gain * mul);
    if (gain > 0) {
      this.pendingEnergy += gain;
      this.noteEnergyAudit(key, gain);
    }
    return gain;
  };

World.prototype.grantMutationEnergy = function grantMutationEnergy(trait) {
    if (!this.arcade || !trait) return 0;
    const table = (typeof LIFE_BALANCE !== "undefined" && LIFE_BALANCE.mutationEnergy)
      || (typeof LIFE_DATA !== "undefined" && LIFE_DATA.mutationEnergy) || {};
    const raw = table[trait] ?? 5;
    const mul = this.ecosystemRewardMul();
    if (mul <= 0) return 0;
    const eco = this.arcadeEconomyCfg();
    if (eco.discoveryOnlyMutation !== false) {
      const seen = this.discoveredTraits || (this.discoveredTraits = new Set());
      if (seen.has(trait)) return 0;
      seen.add(trait);
    }
    const payoutMul = BAL.mutationEnergyPayoutMul ?? 0.5;
    const gain = Math.max(1, Math.floor(raw * mul * payoutMul));
    this.pendingEnergy += gain;
    this.noteEnergyAudit("mutation", gain);
    return gain;
  };

World.prototype.grantEvolutionEnergy = function grantEvolutionEnergy() {
    return this.grantPlantArcadeEnergy("plantEvolveBush");
  };

World.prototype.grantPlantArcadeEnergy = function grantPlantArcadeEnergy(key) {
    const mul = this.ecosystemRewardMul();
    if (!mul || !this.arcade || !key) return 0;
    const raw = this.arcadeEnergyTable()[key] ?? 0;
    if (raw <= 0) return 0;
    const gain = mul >= 1 ? raw : Math.floor(raw * mul);
    if (gain > 0) {
      this.pendingEnergy += gain;
      this.noteEnergyAudit(key, gain);
    }
    return gain;
  };

World.prototype.plantRenewalMul = function plantRenewalMul() {
    if (this.herbivoreCount() > 0) return 1;
    return Math.max(0, 1 - this.noHerbGens / NO_ANIMAL_RENEWAL_GENS);
  };
