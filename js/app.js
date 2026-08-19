(() => {
  const COLS = 48;
  const ROWS = 48;
  const RULES_KEY = "life-rules-seen-v1";

  const $ = (id) => document.getElementById(id);
  const app = {
    screen: "menu",
    gameType: null,
    difficulty: null,
    energy: Infinity,
    tool: "plant",
    playing: false,
    started: false,
    speed: 0,
    speedLabels: ["×1", "×2", "×3", "×5", "×10"],
    speedTicks: [0.66, 1.34, 2, 3.34, 6.66],
    world: null,
    painting: false,
    lastPaintCell: null,
    inspect: null,
    gameEnded: false,
    krolResumePlaying: false,
    resumeGameOverAfterModal: false,
    lbTab: "easy",
    scoreSubmitted: false,
    rouletteResume: false,
    statsCacheKey: "",
    energyLedger: { spent: 0, earned: 0, upkeep: 0 },
    energyHistory: [],
    hudPrev: { score: 0, energy: null, chainLocked: false }
  };

  const canvas = $("world");
  const ctx = canvas.getContext("2d");
  const menuBg = $("menu-bg");
  const menuCtx = menuBg.getContext("2d");

  function isMobileUi() {
    return window.innerWidth <= 980;
  }

  function toolEmoji(label) {
    const m = label.match(/^(\p{Extended_Pictographic}+)/u);
    return m ? m[1] : label;
  }

  let layoutObserver = null;
  function watchLayout() {
    const stage = $("stage");
    if (!stage || layoutObserver) return;
    layoutObserver = new ResizeObserver(() => resize());
    layoutObserver.observe(stage);
    layoutObserver.observe($("screen-game"));
  }

  function syncAudioBtn(btn, kind, on) {
    if (!btn) return;
    if (kind === "sound") {
      btn.textContent = on ? "🔊" : "🔇";
      btn.title = on ? "Звук включён" : "Звук выключен";
    } else {
      btn.textContent = "🎵";
      btn.title = on ? "Музыка включена" : "Музыка выключена";
    }
    btn.classList.toggle("off", !on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function syncAudioUi() {
    const soundOn = LifeSound.isEnabled();
    const musicOn = LifeMusic.isEnabled();
    for (const btn of document.querySelectorAll("#btn-sound, #btn-sound-menu")) {
      syncAudioBtn(btn, "sound", soundOn);
    }
    for (const btn of document.querySelectorAll("#btn-music, #btn-music-menu")) {
      syncAudioBtn(btn, "music", musicOn);
    }
  }

  function toggleSound() {
    LifeSound.setEnabled(!LifeSound.isEnabled());
    syncAudioUi();
  }

  function toggleMusic() {
    LifeMusic.setEnabled(!LifeMusic.isEnabled());
    syncAudioUi();
    LifeSound.play("ui");
  }

  function toolCost(id) {
    if (app.gameType !== "arcade") return 0;
    const t = LIFE_DATA.tools.find((x) => x.id === id);
    return t ? t.cost : 0;
  }

  function showScreen(id) {
    if (id !== "screen-game") {
      dismissKrolOverlay(false);
      hideGameOverOverlay();
    }
    for (const el of document.querySelectorAll(".screen")) el.classList.add("hidden");
    $(id).classList.remove("hidden");
    app.screen = id;
    const menuAudio = $("audio-controls-menu");
    if (menuAudio) menuAudio.classList.toggle("hidden", id === "screen-game");
    if (id === "screen-game") {
      watchLayout();
      requestAnimationFrame(() => {
        resize();
        renderTools();
      });
    }
  }

  function toast(text, opts = {}) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = text;
    $("toasts").appendChild(el);
    setTimeout(() => el.remove(), 2200);
    if (opts.log !== false && opts.log !== "skip") {
      if (opts.log === true || opts.important) log(text);
    }
    LifeSound.play("ui");
  }

  function log(text) {
    const box = $("log");
    const line = document.createElement("div");
    line.textContent = text;
    box.prepend(line);
    while (box.childNodes.length > 6) box.lastChild.remove();
  }

  function flushWorldSounds(world) {
    if (world?.sounds?.length) LifeSound.flush(world.sounds);
  }

  function openModal(html, wide) {
    hideGameOverOverlay();
    dismissKrolOverlay(false);
    $("modal-card").innerHTML = html;
    $("modal-card").classList.toggle("wide", !!wide);
    $("modal").classList.remove("hidden");
  }
  function arcadeOverTitle(reason) {
    if (reason === "era_complete") return "Эксперимент завершён";
    if (reason === "no_chain") return "Лесу не хватило живых зверей";
    return "Экосистема остановилась";
  }

  function closeModal() {
    $("modal").classList.add("hidden");
    $("modal-card").classList.remove("wide");
    $("modal-card").classList.remove("krol-alert");
    $("modal-card").classList.remove("rules-info-card");
    if (app.resumeGameOverAfterModal && app.gameEnded && app.gameType === "arcade" && app.world) {
      app.resumeGameOverAfterModal = false;
      showGameOverOverlay(arcadeOverTitle(app.world.gameOverReason), app.world.lifePoints, app.world.generation, app.difficulty);
    }
  }

  function isModalOpen() {
    return !$("modal").classList.contains("hidden");
  }

  function isGameOverOverlayOpen() {
    return !$("gameover-overlay").classList.contains("hidden");
  }

  function hideGameOverOverlay() {
    $("gameover-overlay").classList.add("hidden");
  }

  function showGameOverOverlay(title, points, cycles, diff) {
    $("gameover-title").textContent = title;
    $("gameover-score").innerHTML = `${points} <span>очков</span>`;
    $("gameover-meta").textContent = `${diff.label} · ${cycles} циклов · осталось ⚡ ${app.energy}`;
    updateGameOverSubmitState();
    $("gameover-overlay").classList.remove("hidden");
  }

  function updateGameOverSubmitState() {
    const btn = $("go-submit");
    const nameInput = $("go-name");
    if (!btn) return;
    const done = app.scoreSubmitted;
    btn.disabled = done;
    btn.classList.toggle("disabled", done);
    btn.textContent = done ? "Уже записано" : "В таблицу";
    if (nameInput) nameInput.disabled = done;
  }

  function isKrolOverlayOpen() {
    return !$("krol-overlay").classList.contains("hidden");
  }

  function isRouletteOpen() {
    return !$("roulette-overlay").classList.contains("hidden");
  }

  function updatePlagueFog() {
    const fog = $("plague-fog");
    const w = app.world;
    if (!fog || !w) return;
    if (w.plagueFogTicks > 0) {
      fog.classList.remove("hidden");
      fog.style.opacity = String(Math.min(0.7, (w.plagueFogTicks / (window.PLAGUE_FOG_TICKS || 45)) * 0.7));
    } else {
      fog.classList.add("hidden");
    }
  }

  function shakeOffset() {
    const w = app.world;
    if (!w?.screenShake) return { x: 0, y: 0 };
    const mag = w.screenShake * 0.4;
    return { x: (Math.random() - 0.5) * mag * 2, y: (Math.random() - 0.5) * mag * 2 };
  }

  function resetRouletteWheel() {
    const wheel = $("roulette-wheel");
    wheel.classList.remove("spinning");
    wheel.style.transition = "none";
    wheel.style.removeProperty("transform");
    void wheel.offsetWidth;
    wheel.style.transition = "";
  }

  function openRouletteOverlay() {
    if (isRouletteOpen() || !app.world?.roulettePending) return;
    app.rouletteResume = app.playing;
    app.playing = false;
    $("btn-play").textContent = "▶ Старт";
    $("roulette-result").classList.add("hidden");
    $("roulette-spin").disabled = false;
    resetRouletteWheel();
    const lead = document.querySelector(".roulette-lead");
    if (lead) {
      const n = LIFE_DATA.roulette?.interval ?? 100;
      lead.textContent = `Прошло ${n} циклов — крути рулетку и узнай, что случится с миром.`;
    }
    $("roulette-overlay").classList.remove("hidden");
  }

  function closeRouletteOverlay() {
    $("roulette-overlay").classList.add("hidden");
    if (app.rouletteResume) {
      app.playing = true;
      $("btn-play").textContent = "⏸ Пауза";
    }
    app.rouletteResume = false;
  }

  function spinRoulette() {
    if (!app.world?.roulettePending) return;
    const event = app.world.pickRouletteEvent();
    const labels = LIFE_DATA.roulette?.labels?.[event] || { icon: "?", title: event, desc: "" };
    const wheel = $("roulette-wheel");
    const spinBtn = $("roulette-spin");
    spinBtn.disabled = true;
    const spinDeg = typeof rouletteSpinDegrees === "function"
      ? rouletteSpinDegrees(event)
      : 2160;
    resetRouletteWheel();
    wheel.style.setProperty("--spin-deg", `${spinDeg}deg`);
    requestAnimationFrame(() => {
      wheel.classList.add("spinning");
    });
    LifeSound.play("ui");
    setTimeout(() => {
      wheel.classList.remove("spinning");
      wheel.style.transition = "none";
      wheel.style.transform = `rotate(${spinDeg}deg)`;
      void wheel.offsetWidth;
      wheel.style.transition = "";
      const result = app.world.applyRouletteEvent(event);
      flushWorldSounds(app.world);
      const resultEl = $("roulette-result");
      resultEl.textContent = `${labels.icon} ${labels.title}: ${result.detail}`;
      resultEl.classList.remove("hidden");
      log(`Рулетка: ${labels.title} — ${result.detail}`);
      toast(`${labels.icon} ${labels.title}`);
      updatePlagueFog();
      draw();
      setTimeout(closeRouletteOverlay, 2000);
    }, 2400);
  }

  function agentIcon(a) {
    const T = LIFE_TYPES;
    if (a.kind === T.BEAR) return "🐻";
    if (a.trait === "волк") return "🐺";
    if (a.trait === "лось") return "🦌";
    if (a.kind === T.PRED) return "🦊";
    if (a.trait === "крол-душегуб") return "🐇";
    if (a.trait === "коала") return "🐨";
    if (a.trait === "корова") return "🐮";
    return "🐰";
  }

  function agentLabel(a) {
    const T = LIFE_TYPES;
    if (a.kind === T.BEAR) return "Медведь";
    if (a.trait === "волк") return "Волк";
    if (a.trait === "лось") return "Лось";
    if (a.kind === T.PRED) return "Лиса";
    if (a.trait === "крол-душегуб") return "Крол-душегуб";
    if (a.trait === "коала") return "Коала";
    if (a.trait === "корова") return "Корова";
    return "Заяц";
  }

  function notifyMutation(energyGain) {
    const m = app.world?.lastMutation;
    if (!m) return;
    const bonus = energyBonusLabel(energyGain);
    toast(`Новый вид: ${m.trait}${bonus}`, { important: true });
    app.mutToastAt = performance.now();
    if (app.world) app.world.lastMutation = null;
  }

  function dismissKrolOverlay(resume = true) {
    if (!isKrolOverlayOpen()) return;
    $("krol-overlay").classList.add("hidden");
    try { LifeMusic.stopAlarm(); } catch {}
    if (resume && app.krolResumePlaying && !app.gameEnded) {
      app.playing = true;
      $("btn-play").textContent = "⏸ Пауза";
      LifeSound.play("play");
    }
    app.krolResumePlaying = false;
  }

  function handleKrolSpawn(energyGain) {
    if (!app.world?.pendingKrolAlert) return;
    app.world.pendingKrolAlert = null;
    const bonus = energyBonusLabel(energyGain);
    app.krolResumePlaying = app.playing;
    app.playing = false;
    $("btn-play").textContent = "▶ Старт";

    const desc = LIFE_DATA.speciesHelp["крол-душегуб"] || "2×2, жрёт всё вокруг";
    $("krol-overlay-desc").textContent = `${desc}. Живёт 15 циклов, оставляет 3 зайцев.`;
    const bonusEl = $("krol-overlay-bonus");
    if (bonus) {
      bonusEl.textContent = `Награда:${bonus}`;
      bonusEl.classList.remove("hidden");
    } else {
      bonusEl.classList.add("hidden");
    }
    $("krol-overlay").classList.remove("hidden");
    log(`Крол-душегуб появился!${bonus}`);
    try { LifeMusic.playAlarm(); } catch {}
  }

  function afterWorldStep(ts, energyGain) {
    handleKrolSpawn(energyGain);
    if (isKrolOverlayOpen()) return true;
    if (app.world.lastMutation && (!app.mutToastAt || ts - app.mutToastAt > 1800)) {
      notifyMutation(energyGain);
    }
    return false;
  }

  function rulesFlowHtml() {
    const flow = LIFE_DATA.rulesInfographic?.flow || [];
    return flow.map((step, i) => {
      const arrow = i > 0 ? '<span class="rules-arrow" aria-hidden="true">→</span>' : "";
      const icon = step.icon === "water"
        ? '<canvas class="tile-icon tile-icon--water tile-icon--rules" width="32" height="32" aria-hidden="true"></canvas>'
        : step.icon;
      return `${arrow}<div class="rules-step">${icon}<small>${step.label}</small></div>`;
    }).join("");
  }

  function rulesCardsHtml(gameType) {
    const cards = LIFE_DATA.rulesInfographic?.cards || [];
    return cards.map((card) => `
      <article class="rules-card">
        <h4><span class="rules-card-ico">${card.icon}</span> ${card.title}</h4>
        <ul>${card.items.map((item) => `<li>${item}</li>`).join("")}</ul>
      </article>
    `).join("") + (gameType === "sandbox"
      ? `<article class="rules-card rules-card--accent"><h4><span class="rules-card-ico">🏖</span> Песочница</h4><p>${LIFE_DATA.rulesInfographic.sandboxNote}</p></article>`
      : "");
  }

  function buildRulesHtml(gameType, difficulty, showSkip = true) {
    const isArcade = gameType === "arcade";
    const modeLabel = isArcade
      ? `Аркада · ${difficulty?.label || ""}${difficulty ? ` · ⚡${difficulty.energy}` : ""}`
      : "Песочница · свободный режим";
    const skipHtml = showSkip
      ? '<label class="rules-skip"><input type="checkbox" id="rules-dont-show" /> Больше не показывать при старте</label>'
      : "";
    const btnLabel = showSkip ? "Понятно, начать!" : "Понятно";
    return `
      <div class="rules-info">
        <header class="rules-info-header">
          <span class="rules-mode-tag">${modeLabel}</span>
          <h3>Правила мира</h3>
          <p class="rules-lead">Цепочка эволюции, очки, энергия и условия конца раунда — на одной схеме.</p>
        </header>
        <div class="rules-flow" aria-label="Цепочка эволюции">${rulesFlowHtml()}</div>
        <div class="rules-grid">${rulesCardsHtml(gameType)}</div>
        ${skipHtml}
        <div class="modal-actions">
          <button class="btn primary" type="button" id="rules-start">${btnLabel}</button>
        </div>
      </div>
    `;
  }

  function showRulesIntro(gameType, difficulty, onDone, { persistSkip = true } = {}) {
    $("modal-card").innerHTML = buildRulesHtml(gameType, difficulty, persistSkip);
    $("modal-card").classList.add("rules-info-card", "wide");
    $("modal").classList.remove("hidden");
    refreshToolIcons();
    $("rules-start").onclick = () => {
      if (persistSkip && $("rules-dont-show")?.checked) {
        localStorage.setItem(RULES_KEY, "1");
      }
      LifeSound.play("tutorial");
      closeModal();
      onDone();
    };
  }

  function maybeRulesIntro(gameType, difficulty, onDone) {
    if (localStorage.getItem(RULES_KEY)) onDone();
    else showRulesIntro(gameType, difficulty, onDone);
  }

  function toolIconHtml(t) {
    if (t.glyph === "water") return '<canvas class="tile-icon tile-icon--water" width="28" height="28" aria-hidden="true"></canvas>';
    if (t.glyph === "stone") return '<canvas class="tile-icon tile-icon--stone" width="28" height="28" aria-hidden="true"></canvas>';
    return toolEmoji(t.label);
  }

  function refreshToolIcons() {
    if (!window.TerrainArt) return;
    for (const canvas of document.querySelectorAll(".tile-icon--water")) {
      TerrainArt.paintTileIcon(canvas, "water", canvas.width || 28);
    }
    for (const canvas of document.querySelectorAll(".tile-icon--stone")) {
      TerrainArt.paintTileIcon(canvas, "stone", canvas.width || 28);
    }
  }

  function renderTools() {
    const grid = $("tool-grid");
    grid.innerHTML = "";
    for (const t of LIFE_DATA.tools) {
      if (app.gameType === "arcade" && t.id === "erase") continue;
      const b = document.createElement("button");
      const cost = toolCost(t.id);
      const cantAfford = app.gameType === "arcade" && cost > 0 && app.energy < cost;
      b.className = "tool" + (app.tool === t.id ? " active" : "") + (cantAfford ? " disabled" : "");
      const costHtml = cost ? `<small>⚡${cost}</small>` : "";
      const icon = toolIconHtml(t);
      b.innerHTML = isMobileUi()
        ? icon + costHtml
        : (t.glyph ? `${icon} ${t.label.replace(/^[^\s]+\s*/, "")}` : t.label) + costHtml;
      b.title = LIFE_DATA.toolHelp[t.id] || "";
      b.onclick = () => {
        if (cantAfford) { toast("Не хватает энергии", { log: "skip" }); return; }
        if (app.tool === "inspect" && t.id !== "inspect") app.inspect = null;
        app.tool = t.id;
        renderTools();
        renderInspect();
      };
      grid.appendChild(b);
    }
    refreshToolIcons();
    $("tool-help").textContent = firstToolLine(LIFE_DATA.toolHelp[app.tool] || "");
  }

  function updateEnergy() {
    const pill = $("energy-pill");
    const pillPlay = $("energy-pill-play");
    if (app.gameType === "arcade") {
      pill.classList.remove("hidden");
      if ($("energy-val")) $("energy-val").textContent = LifeHud.hudNum(app.energy);
      pillPlay?.classList.remove("hidden");
      if ($("energy-val-play")) $("energy-val-play").textContent = LifeHud.hudNum(app.energy);
      recordEnergyHistory();
    } else {
      pill.classList.add("hidden");
      pillPlay?.classList.add("hidden");
    }
    renderTools();
  }

  function firstToolLine(text) {
    const cut = text.split(/(?<=\.)\s/)[0];
    return cut || text;
  }

  function spawnHudPop(text, kind) {
    const box = $("hud-pops");
    if (!box) return;
    const el = document.createElement("div");
    el.className = "hud-pop" + (kind === "energy" ? " is-energy" : "");
    el.textContent = text;
    box.appendChild(el);
    setTimeout(() => el.remove(), 950);
  }

  function flashStat(el, cls) {
    if (!el) return;
    el.classList.remove("is-up", "is-down");
    void el.offsetWidth;
    el.classList.add(cls);
  }

  function chipClass(id, value, an) {
    if (!value) return "is-zero";
    if (id === "herb" && an.label === "голод") return "is-hot";
    if (id === "pred" && an.label === "слишком много лис") return "is-hot";
    if (id === "herb" && (an.label === "баланс" || an.label === "устойчиво")) return "is-ok";
    return "";
  }

  function renderTrophic(listEl, trophic, an) {
    if (!listEl) return;
    const chips = [...trophic.core, ...trophic.extra].map((s) => (
      `<span class="hud-chip ${chipClass(s.id, s.value, an)}" title="${s.label}">${s.icon} ${s.value}</span>`
    )).join("");
    listEl.innerHTML = chips;
  }

  let hudDeltaTimer = 0;

  function showScoreDelta(delta) {
    const deltaEl = $("hud-score-delta");
    if (!deltaEl) return;
    deltaEl.textContent = `+${delta}`;
    deltaEl.classList.remove("hidden");
    clearTimeout(hudDeltaTimer);
    hudDeltaTimer = setTimeout(() => deltaEl.classList.add("hidden"), 1200);
  }

  function updateStats() {
    const w = app.world;
    if (!w || !window.LifeHud) return;
    const a = w.analytics();
    canvas.style.cursor = app.tool === "inspect" ? "help" : "crosshair";
    const herbCost = herbCostSafe();
    const predCost = LIFE_DATA.tools.find((t) => t.id === "pred")?.cost ?? 90;
    const plantCost = LIFE_DATA.tools.find((t) => t.id === "plant")?.cost ?? 8;
    const model = LifeHud.hudModel(w, {
      gameType: app.gameType,
      started: app.started,
      energy: app.energy,
      budget: app.difficulty?.energy ?? w.arcadeBudget,
      herbCost,
      predCost,
      plantCost,
      analytics: a
    });

    const cycleLabel = app.gameType === "arcade" ? "Циклы" : "Ход";
    const cycleIco = $("cycle-ico");
    const cycleVal = $("cycle-val");
    const cycleName = $("cycle-label");
    if (cycleIco) cycleIco.textContent = app.gameType === "arcade" ? "⏱" : "🧬";
    if (cycleVal) cycleVal.textContent = LifeHud.hudNum(model.cycles);
    if (cycleName) cycleName.textContent = cycleLabel;
    const cycleBadge = $("cycle-badge");
    if (cycleBadge) cycleBadge.title = cycleLabel;

    const lifeBadge = $("life-badge");
    const lifePointsVal = $("life-points-val");
    if (lifeBadge && lifePointsVal) {
      if (app.gameType === "arcade") {
        lifeBadge.classList.remove("hidden");
        const next = model.score;
        const prev = app.hudPrev.score || 0;
        lifePointsVal.textContent = LifeHud.hudNum(next);
        if (next > prev) {
          const d = next - prev;
          flashStat(lifeBadge, "is-up");
          showScoreDelta(d);
          if (d >= 8) spawnHudPop(`+${d}`, "score");
        }
        app.hudPrev.score = next;
      } else {
        lifeBadge.classList.add("hidden");
      }
    }

    const energyPill = $("energy-pill-play");
    if (energyPill) {
      if (app.gameType === "arcade") {
        energyPill.classList.remove("hidden");
        energyPill.classList.remove("band-ok", "band-tight", "band-broke", "band-sandbox");
        energyPill.classList.add(`band-${model.energyBand}`);
        const bar = $("hud-energy-bar");
        if (bar && model.energyRatio != null) bar.style.width = `${Math.round(model.energyRatio * 100)}%`;
        energyPill.title = model.budget != null
          ? `⚡ ${LifeHud.hudNum(app.energy)} из ${LifeHud.hudNum(model.budget)}`
          : `⚡ ${LifeHud.hudNum(app.energy)}`;
        const prevE = app.hudPrev.energy;
        if (Number.isFinite(app.energy) && prevE != null && app.energy !== prevE) {
          const dE = app.energy - prevE;
          if (dE > 0) {
            flashStat(energyPill, "is-up");
            spawnHudPop(`+${Math.round(dE)} ⚡`, "energy");
          } else if (dE <= -20) {
            flashStat(energyPill, "is-down");
          }
        }
        app.hudPrev.energy = app.energy;
      } else {
        energyPill.classList.add("hidden");
      }
    }

    const chainEl = $("hud-chain");
    if (chainEl) {
      if (app.gameType === "arcade") {
        chainEl.classList.remove("hidden");
        chainEl.classList.toggle("is-locked", model.chain.locked && !model.era);
        chainEl.classList.toggle("is-era", !!model.era);
        chainEl.classList.toggle("is-era-late", !!(model.era && model.era.late));
        if (model.chain.locked && !app.hudPrev.chainLocked) {
          flashStat(chainEl, "is-up");
          spawnHudPop("Цепочка жива!", "score");
          toast("Цепочка жива — копи ⚡ на правки, эра ограничена", { important: true });
        }
        app.hudPrev.chainLocked = model.chain.locked;
        const bar = $("hud-chain-bar");
        if (bar) {
          const ratio = model.era ? model.era.ratio : (model.chain.locked ? 1 : model.chain.ratio);
          bar.style.width = `${Math.round(ratio * 100)}%`;
        }
        const val = $("hud-chain-val");
        if (val) {
          val.textContent = model.era
            ? `ещё ${model.era.left}`
            : (model.chain.locked ? "жива" : `${model.chain.current}/${model.chain.need}`);
        }
        const lab = $("hud-chain-label");
        if (lab) lab.textContent = model.era ? "Эра" : "Цепочка";
        chainEl.title = model.era
          ? `До записи результата ${model.era.left} циклов`
          : "Живая цепочка";
      } else {
        chainEl.classList.add("hidden");
      }
    }

    const obj = $("hud-objective");
    if (obj) {
      obj.innerHTML = `<small>${model.objective.title}</small>${model.objective.line}`;
    }
    const threat = $("hud-threat");
    if (threat) {
      if (model.threat) {
        threat.classList.remove("hidden");
        threat.className = `hud-threat level-${model.threat.level}`;
        threat.textContent = model.threat.text;
      } else if (model.showRoulette) {
        threat.classList.remove("hidden");
        threat.className = "hud-threat level-info";
        threat.textContent = model.rouletteIn === 0 ? "🎰 Рулетка" : `🎰 через ${model.rouletteIn}`;
      } else {
        threat.classList.add("hidden");
        threat.textContent = "";
      }
    }

    renderTrophic($("hud-trophic"), model.trophic, a);

    const extraKey = model.trophic.extra.map((s) => `${s.id}${s.value}`).join(",");
    const statsKey = `${model.cycles}|${model.score}|${a.label}|${a.score}|${a.grass},${a.bush},${a.tree},${a.herbs},${a.preds},${a.bears}|${a.herbSat}|${a.predSat}|${extraKey}|${model.chain.current}|${model.era?.left ?? ""}|${model.threat?.text || ""}`;
    if (statsKey !== app.statsCacheKey) {
      app.statsCacheKey = statsKey;
      const grid = $("stats-grid");
      if (grid) {
        const rows = [...model.trophic.core, ...model.trophic.extra];
        grid.innerHTML = rows.map((s) => (
          `<div class="stat-chip" title="${s.label}">`
          + `<span class="stat-ico" aria-hidden="true">${s.icon}</span>`
          + `<span class="stat-label">${s.label}</span>`
          + `<strong>${s.value}</strong></div>`
        )).join("");
      }
      const live = $("hud-viability");
      if (live) {
        live.className = `hud-viability tone-${model.viability.tone}`;
        const food = model.viability.herbs ? ` · корм ${model.viability.foodPerHerb}` : "";
        const prey = model.viability.preds ? ` · добыча ${model.viability.preyPerFox}` : "";
        live.innerHTML = `
          <div class="row"><span>Мир</span><strong>${model.viability.label} · ${model.viability.score}%</strong></div>
          <div class="bar"><i style="width:${model.viability.score}%"></i></div>
          <p class="note">${model.viability.note}${food}${prey}</p>
          ${model.viability.herbs ? `<div class="meter" style="margin-top:8px;padding:0;background:none"><div class="row"><span>Сытость зайцев</span><strong>${model.viability.herbSat}%</strong></div><div class="bar sat"><i style="width:${model.viability.herbSat}%"></i></div></div>` : ""}
          ${model.viability.preds ? `<div class="meter" style="margin-top:8px;padding:0;background:none"><div class="row"><span>Сытость лис</span><strong>${model.viability.predSat}%</strong></div><div class="bar sat fox"><i style="width:${model.viability.predSat}%"></i></div></div>` : ""}
        `;
      }
    }
    renderInspect();
  }

  function herbCostSafe() {
    return LIFE_DATA.tools.find((t) => t.id === "herb")?.cost ?? 45;
  }

  function setupWorld(gameType, difficulty) {
    app.gameType = gameType;
    app.difficulty = difficulty;
    app.playing = false;
    app.started = false;
    app.gameEnded = false;
    app.scoreSubmitted = false;
    app.krolResumePlaying = false;
    app.resumeGameOverAfterModal = false;
    dismissKrolOverlay(false);
    hideGameOverOverlay();
    app.inspect = null;
    app.tool = "plant";
    app.statsCacheKey = "";
    app.energyLedger = { spent: 0, earned: 0, upkeep: 0 };
    app.energyHistory = [];
    app.hudPrev = {
      score: 0,
      energy: gameType === "arcade" ? (difficulty?.energy ?? 0) : null,
      chainLocked: false
    };

    if (gameType === "arcade" && difficulty) {
      app.energy = difficulty.energy;
    } else {
      app.energy = Infinity;
    }

    const world = new World(COLS, ROWS);
    world.makeDish();
    world.arcade = gameType === "arcade";
    if (gameType === "arcade") {
      world.arcadeBudget = difficulty?.energy ?? null;
      world.playerEnergy = app.energy;
    }
    if (gameType === "arcade" && window.TerrainArt) {
      TerrainArt.scatterArcadeTerrain(world);
    }
    app.world = world;

    if (gameType === "arcade" && difficulty?.id === "hardcore") {
      const cx = Math.floor(world.w / 2);
      const cy = Math.floor(world.h / 2);
      const ring = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dy] of ring) {
        const x = cx + dx;
        const y = cy + dy;
        if (world.inDish(x, y) && world.get(x, y) === LIFE_TYPES.EMPTY) {
          world.setPlant(x, y, LIFE_TYPES.STAGE_GRASS, 0);
        }
      }
    }

    $("btn-play").textContent = "▶ Старт";
    $("energy-pill").classList.toggle("hidden", gameType !== "arcade");

    if (gameType === "arcade") {
      $("game-title").textContent = "Аркада";
      $("game-subtitle").textContent = difficulty.label;
    } else {
      $("game-title").textContent = "Песочница";
      $("game-subtitle").textContent = "Свободный опыт";
    }

    renderTools();
    updateEnergy();
    renderInspect();
    $("log").innerHTML = "";
    resize();
    draw();
    updateStats();
  }

  function startArcade(diff) {
    maybeRulesIntro("arcade", diff, () => {
      showScreen("screen-game");
      setupWorld("arcade", diff);
    });
  }

  function startSandbox() {
    maybeRulesIntro("sandbox", null, () => {
      showScreen("screen-game");
      setupWorld("sandbox", null);
    });
  }

  function renderDifficulty() {
    const grid = $("diff-grid");
    grid.innerHTML = "";
    for (const d of LIFE_DATA.difficulties) {
      const card = document.createElement("button");
      card.className = "diff-card";
      card.innerHTML = `
        <div class="diff-emoji">${d.emoji}</div>
        <h3>${d.label}</h3>
        <p>⚡ ${d.energy} энергии</p>
      `;
      card.onclick = () => startArcade(d);
      grid.appendChild(card);
    }
  }

  function cellSize() {
    const stage = $("stage");
    const pad = 8;
    const availW = Math.max(1, stage.clientWidth - pad);
    const availH = Math.max(1, stage.clientHeight - pad);
    return Math.max(4, Math.floor(Math.min(availW / COLS, availH / ROWS)));
  }

  function dishRect(dish, s) {
    const side = dish.half * 2 + 1;
    return {
      x: (dish.cx - dish.half) * s,
      y: (dish.cy - dish.half) * s,
      w: side * s,
      h: side * s,
      radius: Math.min(s * 0.65, 14)
    };
  }

  function fillRoundRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function resize() {
    if (!app.world) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const s = cellSize();
    const w = COLS * s;
    const h = ROWS * s;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    app.cell = s;
  }

  function isAnimalTool(tool = app.tool) {
    return tool === "herb" || tool === "pred" || tool === "bear";
  }

  function krolCellKeys(w) {
    const keys = new Set();
    for (const a of w.agents) {
      if (a.dead || a.trait !== "крол-душегуб") continue;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) keys.add(`${a.x + dx},${a.y + dy}`);
      }
    }
    return keys;
  }

  function cellFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    const pt = e.touches ? e.touches[0] : e;
    return {
      x: Math.floor((pt.clientX - rect.left) / app.cell),
      y: Math.floor((pt.clientY - rect.top) / app.cell)
    };
  }

  function canPaint() {
    if (app.gameEnded) return false;
    if (app.gameType === "arcade" && app.tool !== "inspect" && app.tool !== "erase") {
      const cost = toolCost(app.tool);
      if (cost > app.energy) return false;
    }
    return true;
  }

  function paintAt(e) {
    const { x, y } = cellFromEvent(e);
    if (app.tool === "inspect") {
      app.inspect = { x, y };
      draw();
      updateStats();
      return;
    }
    const cellKey = `${app.tool}:${x},${y}`;
    if (app.lastPaintCell === cellKey) return;
    if (!canPaint()) {
      toast("Не хватает энергии", { log: "skip" });
      return;
    }
    const cost = toolCost(app.tool);
    const ok = app.world.paint(x, y, app.tool);
    if (ok) app.lastPaintCell = cellKey;
    if (ok && cost > 0) {
      app.energy -= cost;
      app.energyLedger.spent += cost;
      updateEnergy();
    }
    if (ok && app.tool !== "inspect") LifeSound.play("paint", { brush: app.tool });
    if (ok) draw();
    updateStats();
  }

  function drawDecays(w, s) {
    const t = performance.now() / 1000;
    for (const d of w.decays) {
      const pulse = 0.55 + 0.45 * Math.sin(d.pulse + t * 3);
      const cx = (d.x + 0.5) * s;
      const cy = (d.y + 0.5) * s;
      const r = d.radius * s * pulse;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = d.kind === LIFE_TYPES.BEAR ? "rgba(168,132,88,0.5)"
        : d.kind === LIFE_TYPES.PRED ? "rgba(200,168,106,0.45)" : "rgba(120,200,100,0.4)";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.35 * (d.ttl / 55);
      ctx.fillStyle = d.kind === LIFE_TYPES.BEAR ? "rgba(168,132,88,0.14)"
        : d.kind === LIFE_TYPES.PRED ? "rgba(200,168,106,0.12)" : "rgba(120,200,100,0.1)";
      ctx.fill();
      ctx.globalAlpha = 1;
      drawEmojiInCell("🦴", d.x, d.y, s, 0.7 + 0.3 * pulse, 0.85);
    }
  }

  function drawFxParticle(p, s) {
    const span = p.krol ? 2 : 1;
    ctx.save();
    ctx.beginPath();
    ctx.rect(p.x * s, p.y * s, span * s, span * s);
    ctx.clip();
    ctx.globalAlpha = p.t;
    if (p.bone) {
      drawEmoji("🦴", p.x, p.y, s, p.t, 1.1);
    } else if (p.krol) {
      const cx = (p.x + 0.5) * s;
      const cy = (p.y + 0.5) * s;
      const pulse = 0.45 + (2.4 - p.t) * 0.55;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, s * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(224,64,251,0.18)";
      ctx.beginPath();
      ctx.arc(cx, cy, s * pulse * 0.65, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc((p.x + 0.5) * s, (p.y + 0.5) * s, s * 0.35 * p.t, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function draw() {
    const w = app.world;
    if (!w) return;
    const s = app.cell;
    const T = LIFE_TYPES;
    const shake = shakeOffset();
    ctx.clearRect(0, 0, COLS * s, ROWS * s);
    ctx.save();
    ctx.translate(shake.x, shake.y);
    ctx.fillStyle = "#08151d";
    ctx.fillRect(0, 0, COLS * s, ROWS * s);

    if (w.dish) {
      const dr = dishRect(w.dish, s);
      fillRoundRect(dr.x, dr.y, dr.w, dr.h, dr.radius);
      ctx.fillStyle = "#0d2430";
      ctx.fill();
      ctx.strokeStyle = "rgba(180, 230, 255, 0.35)";
      ctx.lineWidth = Math.max(3, s * 0.14);
      ctx.stroke();
    }

    drawDecays(w, s);

    const krolMask = krolCellKeys(w);
    const waterTime = performance.now() / 1000;

    for (let y = 0; y < w.h; y++) {
      for (let x = 0; x < w.w; x++) {
        const t = w.get(x, y);
        if (t === T.EMPTY) continue;
        if (krolMask.has(`${x},${y}`)) continue;
        if (t === T.WALL) {
          if (w.dish && !w.inDish(x, y)) {
            ctx.fillStyle = "#0a1820";
            ctx.fillRect(x * s, y * s, s, s);
          } else if (window.TerrainArt) {
            TerrainArt.drawStoneTile(ctx, x * s, y * s, s);
          } else {
            drawEmoji("🪨", x, y, s);
          }
        } else if (t === T.WATER) {
          if (window.TerrainArt) {
            const mask = TerrainArt.waterNeighborMask(w, x, y);
            TerrainArt.drawWaterTile(ctx, x * s, y * s, s, mask, waterTime);
          } else {
            drawEmoji("💧", x, y, s, 0.95);
          }
        } else if (t === T.MUSHROOM) {
          ctx.fillStyle = w.dish && w.inDish(x, y) ? "#0d2430" : "#08151d";
          ctx.fillRect(x * s, y * s, s, s);
          drawEmojiInCell("🍄", x, y, s);
        } else if (t === T.PLANT) {
          ctx.fillStyle = w.dish && w.inDish(x, y) ? "#0d2430" : "#08151d";
          ctx.fillRect(x * s, y * s, s, s);
          drawEmojiInCell(w.stageEmoji(x, y), x, y, s);
        }
      }
    }

    for (const a of w.agents) {
      if (a.dead || a.trait === "крол-душегуб") continue;
      const sat = Math.min(1, a.energy / Math.max(0.2, a.thresh || 11));
      const icon = agentIcon(a);
      const scale = a.trait === "корова" ? 1.05
        : a.trait === "лось" ? 1.02
        : 0.88 + 0.1 * sat;
      drawEmojiInCell(icon, a.x, a.y, s, 0.45 + 0.55 * sat, scale);
    }

    for (const a of w.agents) {
      if (a.dead || a.trait !== "крол-душегуб") continue;
      const sat = Math.min(1, a.energy / Math.max(0.2, a.thresh || 11));
      drawSpanEmojiInCell(agentIcon(a), a.x, a.y, 2, s, 0.45 + 0.55 * sat);
    }

    if (app.inspect) {
      const inspected = w.agentAt(app.inspect.x, app.inspect.y);
      ctx.strokeStyle = "#7dffc2";
      ctx.lineWidth = 2;
      if (inspected?.trait === "крол-душегуб") {
        ctx.strokeRect(inspected.x * s + 1, inspected.y * s + 1, s * 2 - 2, s * 2 - 2);
      } else {
        ctx.strokeRect(app.inspect.x * s + 1, app.inspect.y * s + 1, s - 2, s - 2);
      }
    }

    for (const p of w.fx) drawFxParticle(p, s);
    ctx.restore();
    updatePlagueFog();
  }

  function drawSpanEmoji(emoji, x, y, span, s, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const cx = (x + span / 2) * s;
    const cy = (y + span / 2) * s;
    const fontSize = Math.max(12, Math.floor(s * 0.92));
    ctx.font = `${fontSize}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.translate(cx, cy);
    ctx.scale(span * 0.95, span * 0.95);
    ctx.fillText(emoji, 0, 0);
    ctx.restore();
  }

  function drawSpanEmojiInCell(emoji, x, y, span, s, alpha = 1) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x * s, y * s, span * s, span * s);
    ctx.clip();
    drawSpanEmoji(emoji, x, y, span, s, alpha);
    ctx.restore();
  }

  function drawEmoji(emoji, x, y, s, alpha = 1, scale = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `${Math.max(10, Math.floor(s * 0.92 * scale))}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emoji, (x + 0.5) * s, (y + 0.55) * s);
    ctx.restore();
  }

  function drawEmojiInCell(emoji, x, y, s, alpha = 1, scale = 1) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x * s, y * s, s, s);
    ctx.clip();
    drawEmoji(emoji, x, y, s, alpha, scale);
    ctx.restore();
  }

  function renderInspect() {
    const html = app.inspect ? describeCell(app.inspect.x, app.inspect.y) : "";
    const desk = $("inspect-card");
    const stage = $("inspect-card-stage");
    const show = !!app.inspect;
    if (desk) {
      desk.classList.toggle("hidden", !show);
      if (show) desk.innerHTML = html;
    }
    if (stage) {
      stage.classList.toggle("hidden", !show);
      if (show) stage.innerHTML = html;
    }
  }

  function describeCell(x, y) {
    const w = app.world;
    const T = LIFE_TYPES;
    const a = w.agentAt(x, y);
    if (a) {
      const who = agentLabel(a);
      const sat = Math.round(Math.min(1, a.energy / Math.max(0.2, a.thresh)) * 100);
      const mood = a.energy >= a.thresh ? "сыт" : "голоден";
      let note = a.trait && LIFE_DATA.speciesHelp[a.trait]
        ? `<br><span class="note">${LIFE_DATA.speciesHelp[a.trait]}</span>` : "";
      if (a.trait === "крол-душегуб" && a.bornGen != null) {
        const left = Math.max(0, KROL_LIFESPAN - (w.generation - a.bornGen));
        note += `<br><span class="note">Осталось ~${left} циклов</span>`;
      }
      const vision = w.effectiveVision ? w.effectiveVision(a) : a.vision;
      const moveNote = a.kind === T.BEAR ? "медленный, не размножается"
        : a.trait === "корова" ? `медленный (×4), восприятие ${vision} кл.`
        : a.trait === "коала" ? `висит на деревьях, прячется в чаще, восприятие ${vision} кл.`
        : a.trait === "крол-душегуб" ? `2×2, зона разрушения 4×4, ×6 действий/цикл, восприятие ${vision} кл.`
        : a.trait === "волк" ? `одиночка, восприятие ${vision} кл.`
        : `восприятие ${vision} кл.`;
      const boostNote = a.skillBoost ? "<br><span class=\"note\">🍄 Бонус гриба: навыки ×2 (время жизни без изменений)</span>" : "";
      return `<b>${who}</b><br>Сытость ${sat}% — ${mood}<br>${moveNote} · поколение ${a.gen}${note}${boostNote}`;
    }
    const t = w.get(x, y);
    if (t === T.PLANT) {
      const i = w.idx(x, y);
      const name = w.stageName(x, y);
      const age = w.plantAge[i];
      if (w.plantStage[i] === T.STAGE_BUSH) {
        const left = PLANT_CFG.bushToTree - age;
        return `<b>${name}</b><br>Возраст ${age}/${PLANT_CFG.bushToTree} тиков. Укусов: ${w.plantBites[i]}. До дерева ~${Math.max(0, left)}. Сеет траву рядом.`;
      }
      if (w.plantStage[i] === T.STAGE_TREE) {
        return `<b>${name}</b><br>Возраст ${age}/${PLANT_CFG.treeLife}. Едят корова, лось и коала (не убивая). После гибели — 1 трава.`;
      }
      const toBush = PLANT_CFG.grassToBush - age;
      return `<b>${name}</b><br>Возраст ${age}/${PLANT_CFG.grassToBush} тиков. Укусов: ${w.plantBites[i]}. До куста ~${Math.max(0, toBush)}.`;
    }
    if (t === T.WATER) return "<b>Водоём</b><br>У берега растения растут вдвое быстрее. По воде можно идти, но вдвое медленнее.";
    if (t === T.MUSHROOM) return "<b>Гриб</b><br>Корова сажает редко. Съешь — навыки и бонусы ×2, время жизни не меняется.";
    if (t === T.WALL) return "<b>Камень</b><br>Через камень никто не проходит.";
    return "<b>Пусто</b><br>Можно посадить траву или поставить зверя.";
  }

  function herbCost() {
    return LIFE_DATA.tools.find((t) => t.id === "herb").cost;
  }

  function ticksPerSec() {
    return app.speedTicks[app.speed] || app.speedTicks[0];
  }

  function updateSpeedButton() {
    const btn = $("btn-speed");
    if (btn) btn.textContent = app.speedLabels[app.speed] || app.speedLabels[0];
  }

  function renderLeaderboardRows(scores) {
    if (!scores?.length) {
      return '<tr><td colspan="4" class="empty-lb">Пока пусто — сыграй на этом уровне!</td></tr>';
    }
    return scores.map((s, i) => {
      const pts = s.points ?? s.cycles ?? 0;
      const cycles = s.cycles ?? 0;
      return `<tr><td>${i + 1}</td><td>${escapeHtml(s.name)}</td><td>${pts}</td><td>${cycles}</td><td>${s.date || ""}</td></tr>`;
    }).join("");
  }

  function renderLeaderboardTabs(activeId) {
    return LIFE_DATA.difficulties.map((d) => (
      `<button type="button" class="lb-tab${d.id === activeId ? " active" : ""}" data-lb-tab="${d.id}">${d.emoji} ${d.label}</button>`
    )).join("");
  }

  function bindLeaderboardTabs(scores, activeId) {
    const tbody = $("lb-tbody");
    const update = (tabId) => {
      app.lbTab = tabId;
      document.querySelectorAll(".lb-tab").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.lbTab === tabId);
      });
      if (tbody) tbody.innerHTML = renderLeaderboardRows(scores[tabId] || []);
    };
    document.querySelectorAll(".lb-tab").forEach((btn) => {
      btn.onclick = () => update(btn.dataset.lbTab);
    });
    update(activeId);
  }

  async function showLeaderboard(resumeGameOver = false) {
    app.resumeGameOverAfterModal = resumeGameOver;
    const { scores, source } = await LifeLeaderboard.fetchScores();
    const activeTab = app.difficulty?.id && LifeLeaderboard.DIFFICULTIES.includes(app.difficulty.id)
      ? app.difficulty.id
      : (app.lbTab || "easy");

    const note = source === "local"
      ? '<p class="lb-note">Показаны записи только с этого устройства. Общая таблица появится, когда сервер подключён.</p>'
      : "";

    openModal(`
      <h3>🏆 Таблица лидеров</h3>
      ${note}
      <div class="lb-tabs" role="tablist">${renderLeaderboardTabs(activeTab)}</div>
      <table class="lb-table">
        <thead><tr><th>#</th><th>Имя</th><th>Очки</th><th>Циклы</th><th>Дата</th></tr></thead>
        <tbody id="lb-tbody">${renderLeaderboardRows(scores[activeTab] || [])}</tbody>
      </table>
      <div class="modal-actions"><button class="btn primary" type="button" id="lb-close">Закрыть</button></div>
    `, true);

    bindLeaderboardTabs(scores, activeTab);
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  async function gameOver() {
    if (app.gameType !== "arcade") return;
    const cycles = app.world.generation;
    const points = app.world.lifePoints;
    const diff = app.difficulty;
    const title = arcadeOverTitle(app.world.gameOverReason);

    if (!app.gameEnded) {
      app.gameEnded = true;
      LifeSound.play("game_over");
    }
    app.playing = false;
    app.krolResumePlaying = false;
    dismissKrolOverlay(false);
    $("btn-play").textContent = "▶ Старт";
    showGameOverOverlay(title, points, cycles, diff);
  }

  function reset() {
    const gt = app.gameType;
    const diff = app.difficulty;
    setupWorld(gt, diff);
  }

  function flushArcadeEnergy() {
    if (app.gameType !== "arcade" || !app.world) return 0;
    const gain = app.world.pendingEnergy || 0;
    app.world.pendingEnergy = 0;
    if (!gain) {
      return 0;
    }
    if (gain > 0) {
      app.energy += gain;
      app.energyLedger.earned += gain;
    } else {
      const lost = Math.min(app.energy, -gain);
      app.energy -= lost;
      app.energyLedger.upkeep += lost;
    }
    app.world.playerEnergy = app.energy;
    updateEnergy();
    return gain;
  }

  function recordEnergyHistory() {
    if (app.gameType !== "arcade" || !Number.isFinite(app.energy)) return;
    const hist = app.energyHistory || (app.energyHistory = []);
    hist.push(app.energy);
    if (hist.length > 80) hist.splice(0, hist.length - 80);
  }

  function energyBonusLabel(stepGain) {
    return stepGain > 0 ? ` · +${stepGain} ⚡` : "";
  }

  let acc = 0, last = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    if (app.screen === "screen-menu") drawMenu(ts);
    if (!app.world || app.screen !== "screen-game") return;
    if (!last) last = ts;
    const dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    if (app.playing && !app.gameEnded) {
      acc += dt * ticksPerSec();
      while (acc >= 1) {
        if (app.world) app.world.playerEnergy = app.energy;
        app.world.step();
        flushWorldSounds(app.world);
        const energyGain = flushArcadeEnergy();
        if (app.gameType === "arcade" && app.started) {
          app.world.checkArcadeEnd(app.energy, herbCost());
        }
        if (energyGain > 0 && app.world.lastMutation) LifeSound.play("energy_bonus");
        acc -= 1;
        if (afterWorldStep(ts, energyGain)) break;
        if (app.world.gameOver) {
          gameOver();
          break;
        }
        if (app.world.roulettePending && app.gameType === "arcade") {
          openRouletteOverlay();
          break;
        }
      }
      app.world.tickFx();
      updateStats();
    }
    draw();
  }

  function drawMenu(ts) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (menuBg.width !== innerWidth * dpr) {
      menuBg.width = innerWidth * dpr;
      menuBg.height = innerHeight * dpr;
      menuBg.style.width = innerWidth + "px";
      menuBg.style.height = innerHeight + "px";
      menuCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    menuCtx.fillStyle = "rgba(7,16,24,0.18)";
    menuCtx.fillRect(0, 0, innerWidth, innerHeight);
    const t = ts / 1000;
    for (let i = 0; i < 40; i++) {
      const x = (Math.sin(t * 0.3 + i) * 0.5 + 0.5) * innerWidth;
      const y = (Math.cos(t * 0.2 + i * 0.7) * 0.5 + 0.5) * innerHeight;
      menuCtx.fillStyle = i % 3 === 0 ? "#46e88755" : i % 3 === 1 ? "#ffc14d55" : "#ff5d7a55";
      menuCtx.beginPath();
      menuCtx.arc(x, y, 3 + (i % 4), 0, Math.PI * 2);
      menuCtx.fill();
    }
  }

  canvas.addEventListener("mousedown", (e) => {
    app.painting = true;
    app.lastPaintCell = null;
    paintAt(e);
  });
  canvas.addEventListener("mousemove", (e) => {
    if (app.painting && !isAnimalTool()) paintAt(e);
  });
  window.addEventListener("mouseup", () => {
    app.painting = false;
    app.lastPaintCell = null;
  });
  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    app.painting = true;
    app.lastPaintCell = null;
    paintAt(e);
  }, { passive: false });
  canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    if (app.painting && !isAnimalTool()) paintAt(e);
  }, { passive: false });
  canvas.addEventListener("touchend", () => {
    app.painting = false;
    app.lastPaintCell = null;
  });

  $("btn-arcade").onclick = () => { LifeSound.play("ui"); renderDifficulty(); showScreen("screen-difficulty"); };
  $("btn-sandbox").onclick = () => { LifeSound.play("ui"); startSandbox(); };
  $("btn-leaderboard").onclick = () => { LifeSound.play("ui"); showLeaderboard(); };
  $("btn-diff-back").onclick = () => showScreen("screen-menu");
  $("btn-game-back").onclick = () => {
    app.playing = false;
    closeModal();
    hideGameOverOverlay();
    if (app.gameType === "arcade") showScreen("screen-difficulty");
    else showScreen("screen-menu");
  };
  $("btn-play").onclick = () => {
    if (isModalOpen() || isGameOverOverlayOpen()) return;
    if (app.gameEnded) {
      gameOver();
      return;
    }
    if (isKrolOverlayOpen()) {
      dismissKrolOverlay(true);
      return;
    }
    app.playing = !app.playing;
    if (app.playing) {
      app.started = true;
      LifeSound.play("play");
    } else {
      LifeSound.play("pause");
    }
    $("btn-play").textContent = app.playing ? "⏸ Пауза" : "▶ Старт";
  };
  $("btn-step").onclick = () => {
    if (app.gameEnded || isKrolOverlayOpen()) return;
    if (app.world) app.world.playerEnergy = app.energy;
    app.world.step();
    flushWorldSounds(app.world);
    const energyGain = flushArcadeEnergy();
    if (app.gameType === "arcade" && app.started) {
      app.world.checkArcadeEnd(app.energy, herbCost());
    }
    if (energyGain > 0 && app.world.lastMutation) LifeSound.play("energy_bonus");
    afterWorldStep(performance.now(), energyGain);
    if (app.world.gameOver) gameOver();
    updateStats();
    draw();
  };
  $("btn-reset").onclick = reset;
  $("btn-speed").onclick = () => {
    app.speed = (app.speed + 1) % app.speedLabels.length;
    updateSpeedButton();
    LifeSound.play("ui");
  };
  $("btn-sound").onclick = toggleSound;
  $("btn-music").onclick = toggleMusic;
  $("btn-sound-menu").onclick = toggleSound;
  $("btn-music-menu").onclick = toggleMusic;
  $("btn-help").onclick = () => {
    showRulesIntro(app.gameType || "sandbox", app.difficulty, () => {}, { persistSkip: false });
  };
  $("go-menu").onclick = () => { hideGameOverOverlay(); showScreen("screen-menu"); };
  $("go-retry").onclick = () => { hideGameOverOverlay(); startArcade(app.difficulty); };
  $("go-submit").onclick = async () => {
    if (app.scoreSubmitted) return;
    const name = $("go-name").value.trim() || "Аноним";
    const cycles = app.world.generation;
    const points = app.world.lifePoints;
    const result = await LifeLeaderboard.submitScore({ name, points, cycles, difficulty: app.difficulty.id });
    app.scoreSubmitted = true;
    updateGameOverSubmitState();
    hideGameOverOverlay();
    if (result.saved) {
      LifeSound.play("score");
      toast("Записано в общую таблицу!");
    } else if (result.localOnly) {
      toast("Сохранено только на этом устройстве — сервер таблицы недоступен");
    } else {
      toast("Не удалось записать результат");
    }
    showLeaderboard(true);
  };
  $("krol-ok").onclick = () => dismissKrolOverlay(true);
  $("roulette-spin").onclick = () => spinRoulette();
  $("modal").addEventListener("click", (e) => {
    if (e.target.id === "modal") closeModal();
    if (e.target.id === "lb-close") closeModal();
  });
  window.addEventListener("keydown", (e) => {
    if (e.code === "Escape" && isModalOpen()) {
      e.preventDefault();
      closeModal();
      return;
    }
    if (isKrolOverlayOpen() && (e.code === "Enter" || e.code === "Space" || e.code === "Escape")) {
      e.preventDefault();
      dismissKrolOverlay(true);
      return;
    }
    if (e.code === "Space" && app.screen === "screen-game") {
      if (isModalOpen() || isGameOverOverlayOpen() || isKrolOverlayOpen()) return;
      e.preventDefault();
      $("btn-play").click();
    }
  });
  window.addEventListener("resize", () => {
    resize();
    if (app.screen === "screen-game") renderTools();
  });

  function renderGameVersion() {
    const label = formatGameVersion();
    for (const id of ["game-version", "diff-version"]) {
      const el = $(id);
      if (el) el.textContent = label;
    }
  }

  syncAudioUi();
  updateSpeedButton();
  renderGameVersion();
  LifeMusic.start();
  window.LifeApp = app;
  requestAnimationFrame(loop);
})();
