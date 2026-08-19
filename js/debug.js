(() => {
  const $ = (id) => document.getElementById(id);
  const lib = () => window.LifeDebugLib;
  const app = () => window.LifeApp;
  let visible = false;

  function ensurePanel() {
    let el = $("debug-panel");
    if (el) return el;
    el = document.createElement("aside");
    el.id = "debug-panel";
    el.className = "debug-panel hidden";
    el.innerHTML = `
      <header class="debug-head">
        <strong>Отладка баланса</strong>
        <span class="debug-hint">F3 / \`</span>
        <button type="button" class="btn ghost" id="debug-close">✕</button>
      </header>
      <div class="debug-body" id="debug-body"></div>
      <div class="debug-actions">
        <button type="button" class="btn" id="debug-snapshot">JSON-снимок</button>
        <button type="button" class="btn" id="debug-selfcheck">Самопроверка</button>
        <button type="button" class="btn" id="debug-copy-seed">Копировать сид</button>
      </div>
    `;
    document.body.appendChild(el);
    $("debug-close").onclick = () => toggle(false);
    $("debug-snapshot").onclick = () => {
      const snap = lib().lifeWorldSnapshot(app()?.world, meta());
      console.log(snap);
      navigator.clipboard?.writeText(JSON.stringify(snap, null, 2));
    };
    $("debug-selfcheck").onclick = () => runSelfCheckUi();
    $("debug-copy-seed").onclick = () => {
      const w = app()?.world;
      const seed = w?.getRngSeed?.();
      if (seed != null) navigator.clipboard?.writeText(String(seed));
    };
    return el;
  }

  function meta() {
    const a = app();
    return {
      mode: a?.gameType,
      difficulty: a?.difficulty?.id,
      energy: a?.energy,
      ledger: a?.energyLedger
    };
  }

  function tablesSummary() {
    const b = window.LIFE_BALANCE;
    if (!b) return "LIFE_BALANCE не загружен";
    return [
      `tools: plant ${b.tools.plant} herb ${b.tools.herb} pred ${b.tools.pred}`,
      `mut krol ${b.mutationChance.krol} koala ${b.mutationChance.koala}`,
      `arcade stale ${b.arcadeEnd.staleAfter} chain ${b.arcadeEnd.chainSustainGens}`,
      `roulette ${b.roulette.interval}`
    ].join("\n");
  }

  function render() {
    if (!visible) return;
    const a = app();
    const w = a?.world;
    const body = $("debug-body");
    if (!body || !w) {
      if (body) body.textContent = "Запустите игру на экране симуляции.";
      return;
    }
    const an = w.analytics();
    const mul = w.ecosystemRewardMul();
    const inv = lib().lifeInvariantChecks(w);
    const ledger = a.energyLedger || { spent: 0, earned: 0 };
    const net = ledger.earned - ledger.spent;
    body.innerHTML = `
      <div class="debug-section">
        <div>Сид: <code>${w.getRngSeed?.() ?? "—"}</code></div>
        <div>Режим: ${a.gameType || "—"} · ${a.difficulty?.label || "—"}</div>
        <div>Цикл: ${w.generation} · chain ${w.herbStreak}/${CHAIN_SUSTAIN_GENS} · noHerb ${w.noHerbGens}</div>
        <div>⚡ ${a.energy} (spent ${ledger.spent}, earned ${ledger.earned}, net ${net}) · ecoMul ${mul.toFixed(2)}</div>
        <div>Очки: ${w.lifePoints || 0} · pending ⚡ ${w.pendingEnergy}</div>
      </div>
      <div class="debug-section">
        <div>Трофика: 🌱${an.grass} 🌿${an.bush} 🌳${an.tree} · 🐰${an.herbs} 🦊${an.preds} 🐻${an.bears}</div>
        <div>Корм/заяц: ${an.foodPerHerb} · зайцы/лиса: ${an.preyPerFox}</div>
        <div>Жизнесп.: ${an.label} ${an.score}%</div>
      </div>
      <div class="debug-section">
        <strong>Инварианты</strong>
        <ul class="debug-warn">${inv.length
          ? inv.map((i) => `<li class="${i.level}">${i.text}</li>`).join("")
          : "<li class=\"ok\">Нет предупреждений</li>"}</ul>
      </div>
      <div class="debug-section">
        <strong>Таблицы</strong>
        <pre class="debug-pre">${tablesSummary()}</pre>
      </div>
      <div class="debug-section hidden" id="debug-selfcheck-out"></div>
    `;
  }

  function runSelfCheckUi() {
    const w = app()?.world;
    const out = $("debug-selfcheck-out");
    if (!w || !out) return;
    const rows = lib().lifeSelfCheck(w, { T: LIFE_TYPES });
    out.classList.remove("hidden");
    out.innerHTML = `<strong>Самопроверка (клон)</strong><ul>${
      rows.map((r) => `<li class="${r.ok ? "ok" : "error"}">${r.name}: ${r.detail}</li>`).join("")
    }</ul>`;
  }

  function toggle(force) {
    visible = force ?? !visible;
    const panel = ensurePanel();
    panel.classList.toggle("hidden", !visible);
    if (visible) render();
  }

  window.addEventListener("keydown", (e) => {
    if (app()?.screen !== "screen-game") return;
    if (e.code === "F3" || e.code === "Backquote") {
      e.preventDefault();
      toggle();
    }
  });

  setInterval(() => { if (visible) render(); }, 500);
  window.LifeDebug = { toggle, render };
})();
