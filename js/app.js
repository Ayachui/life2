(() => {
  const COLS = 72;
  const ROWS = 52;
  const TUTORIAL_KEY = "life-tutorial-seen-v3";

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
    speedLabels: ["×2", "×3", "×5", "×10"],
    speedTicks: [0.67, 1, 1.67, 3.33],
    world: null,
    painting: false,
    inspect: null,
    gameEnded: false,
    krolResumePlaying: false,
    resumeGameOverAfterModal: false
  };

  const canvas = $("world");
  const ctx = canvas.getContext("2d");
  const menuBg = $("menu-bg");
  const menuCtx = menuBg.getContext("2d");

  function syncAudioUi() {
    const soundBtn = $("btn-sound");
    const musicBtn = $("btn-music");
    const soundOn = LifeSound.isEnabled();
    const musicOn = LifeMusic.isEnabled();
    if (soundBtn) {
      soundBtn.textContent = soundOn ? "🔊" : "🔇";
      soundBtn.title = soundOn ? "Звук включён" : "Звук выключен";
      soundBtn.classList.toggle("off", !soundOn);
      soundBtn.setAttribute("aria-pressed", soundOn ? "true" : "false");
    }
    if (musicBtn) {
      musicBtn.textContent = "🎵";
      musicBtn.title = musicOn ? "Музыка включена" : "Музыка выключена";
      musicBtn.classList.toggle("off", !musicOn);
      musicBtn.setAttribute("aria-pressed", musicOn ? "true" : "false");
    }
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
    if (id === "screen-game") resize();
  }

  function toast(text) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = text;
    $("toasts").appendChild(el);
    setTimeout(() => el.remove(), 2200);
    log(text);
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
  function closeModal() {
    $("modal").classList.add("hidden");
    $("modal-card").classList.remove("wide");
    $("modal-card").classList.remove("krol-alert");
    if (app.resumeGameOverAfterModal && app.gameEnded && app.gameType === "arcade" && app.world) {
      app.resumeGameOverAfterModal = false;
      const title = app.world.gameOverReason === "no_chain"
        ? "Лесу не хватило живых зверей"
        : "Экосистема остановилась";
      showGameOverOverlay(title, app.world.generation, app.difficulty);
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

  function showGameOverOverlay(title, cycles, diff) {
    $("gameover-title").textContent = title;
    $("gameover-score").innerHTML = `${cycles} <span>ходов</span>`;
    $("gameover-meta").textContent = `${diff.label} · осталось ⚡ ${app.energy}`;
    $("gameover-overlay").classList.remove("hidden");
  }

  function isKrolOverlayOpen() {
    return !$("krol-overlay").classList.contains("hidden");
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
    toast(`Новый вид: ${m.trait}${bonus}`);
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

    const desc = LIFE_DATA.speciesHelp["крол-душегуб"] || "охотится на всех зверей";
    $("krol-overlay-desc").textContent = `${desc}. Живёт недолго, но приносит троих детёнышей.`;
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

  function showTutorial(onDone) {
    const cards = LIFE_DATA.tutorial;
    let step = 0;

    function render() {
      const c = cards[step];
      $("tutorial-inner").innerHTML = `
        <div class="tut-progress">${cards.map((_, i) => `<i class="${i === step ? "on" : i < step ? "done" : ""}"></i>`).join("")}</div>
        <div class="tut-icon">${c.icon}</div>
        <h2>${c.title}</h2>
        <p>${c.text}</p>
        <label class="tut-skip"><input type="checkbox" id="tut-dont-show" /> Больше не показывать</label>
        <div class="modal-actions">
          ${step > 0 ? '<button class="btn" id="tut-prev">Назад</button>' : ""}
          <button class="btn primary" id="tut-next">${step < cards.length - 1 ? "Далее" : "Понятно, начать!"}</button>
        </div>
      `;
      const prev = $("tut-prev");
      if (prev) prev.onclick = () => { step--; LifeSound.play("tutorial"); render(); };
      $("tut-next").onclick = () => {
        if ($("tut-dont-show")?.checked) localStorage.setItem(TUTORIAL_KEY, "1");
        LifeSound.play("tutorial");
        if (step < cards.length - 1) { step++; render(); }
        else { $("tutorial").classList.add("hidden"); onDone(); }
      };
    }

    $("tutorial").classList.remove("hidden");
    render();
  }

  function maybeTutorial(onDone) {
    if (localStorage.getItem(TUTORIAL_KEY)) onDone();
    else showTutorial(onDone);
  }

  function renderTools() {
    const grid = $("tool-grid");
    grid.innerHTML = "";
    for (const t of LIFE_DATA.tools) {
      if (app.gameType === "arcade" && (t.id === "water" || t.id === "wall")) continue;
      const b = document.createElement("button");
      const cost = toolCost(t.id);
      const cantAfford = app.gameType === "arcade" && cost > 0 && app.energy < cost;
      b.className = "tool" + (app.tool === t.id ? " active" : "") + (cantAfford ? " disabled" : "");
      b.innerHTML = t.label + (cost ? `<small>⚡${cost}</small>` : "");
      b.title = LIFE_DATA.toolHelp[t.id] || "";
      b.onclick = () => {
        if (cantAfford) { toast("Не хватает энергии"); return; }
        app.tool = t.id;
        renderTools();
      };
      grid.appendChild(b);
    }
    $("tool-help").textContent = LIFE_DATA.toolHelp[app.tool] || "";
  }

  function updateEnergy() {
    const pill = $("energy-pill");
    if (app.gameType === "arcade") {
      pill.classList.remove("hidden");
      $("energy-val").textContent = app.energy;
    } else {
      pill.classList.add("hidden");
    }
    renderTools();
  }

  function legend() {
    let items = [
      ["🌱", "трава"], ["🌿", "куст"], ["🌳", "дерево"],
      ["🐰", "заяц"], ["🐨", "коала"], ["🐮", "корова"], ["🐇", "крол-душегуб"],
      ["🦊", "лиса"], ["🐺", "волк"], ["🦌", "лось"], ["🐻", "медведь"],
      ["💧", "вода"], ["🪨", "камень"], ["🦴", "разложение"]
    ];
    if (app.gameType === "arcade") {
      items = items.filter(([mark]) => mark !== "💧" && mark !== "🪨");
    }
    $("legend").innerHTML = items.map(([mark, n]) => `<span>${mark} ${n}</span>`).join("");
  }

  function setupWorld(gameType, difficulty) {
    app.gameType = gameType;
    app.difficulty = difficulty;
    app.playing = false;
    app.started = false;
    app.gameEnded = false;
    app.krolResumePlaying = false;
    app.resumeGameOverAfterModal = false;
    dismissKrolOverlay(false);
    hideGameOverOverlay();
    app.inspect = null;
    app.tool = "plant";

    if (gameType === "arcade" && difficulty) {
      app.energy = difficulty.energy;
    } else {
      app.energy = Infinity;
    }

    const world = new World(COLS, ROWS);
    world.makeDish();
    world.arcade = gameType === "arcade";
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
      $("hud-goal-title").textContent = "Цель";
      $("hud-goal").textContent = `Продержись как можно дольше. Энергия на старт: ${difficulty.energy} ⚡`;
      $("hud-hint").textContent = difficulty.id === "hardcore"
        ? "На старте в центре уже растёт трава. Держи стаю зайцев живой 25 ходов подряд — за деревья и особых зверей дают энергию."
        : "Держи стаю зайцев живой 25 ходов подряд. За деревья и особых зверей дают энергию.";
    } else {
      $("game-title").textContent = "Песочница";
      $("game-subtitle").textContent = "Свободный опыт";
      $("hud-goal-title").textContent = "Эксперимент";
      $("hud-goal").textContent = "Собери свой лес и посмотри, как всё устроено. Энергии хватит на всё.";
      $("hud-hint").textContent = "Трава вырастает в куст, потом в дерево. Зайцы деревья не едят.";
    }

    renderTools();
    legend();
    updateEnergy();
    $("log").innerHTML = "";
    resize();
    draw();
    updateStats();
  }

  function startArcade(diff) {
    maybeTutorial(() => {
      showScreen("screen-game");
      setupWorld("arcade", diff);
    });
  }

  function startSandbox() {
    maybeTutorial(() => {
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
    return Math.max(8, Math.floor(Math.min(stage.clientWidth / COLS, stage.clientHeight / ROWS)));
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
    if (!canPaint()) {
      toast("Не хватает энергии");
      return;
    }
    const cost = toolCost(app.tool);
    const ok = app.world.paint(x, y, app.tool);
    if (ok && cost > 0) {
      app.energy -= cost;
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
      drawEmoji("🦴", d.x, d.y, s, 0.7 + 0.3 * pulse, 0.85);
    }
  }

  function draw() {
    const w = app.world;
    if (!w) return;
    const s = app.cell;
    const T = LIFE_TYPES;
    ctx.clearRect(0, 0, COLS * s, ROWS * s);
    ctx.fillStyle = "#08151d";
    ctx.fillRect(0, 0, COLS * s, ROWS * s);

    if (w.dish) {
      ctx.beginPath();
      ctx.arc((w.dish.cx + 0.5) * s, (w.dish.cy + 0.5) * s, w.dish.r * s, 0, Math.PI * 2);
      ctx.fillStyle = "#0d2430";
      ctx.fill();
    }

    drawDecays(w, s);

    for (let y = 0; y < w.h; y++) {
      for (let x = 0; x < w.w; x++) {
        const t = w.get(x, y);
        if (t === T.EMPTY) continue;
        if (t === T.WALL) {
          if (w.dish && !w.inDish(x, y)) {
            ctx.fillStyle = "#0a1820";
            ctx.fillRect(x * s, y * s, s, s);
          } else {
            drawEmoji("🪨", x, y, s);
          }
        } else if (t === T.WATER) {
          drawEmoji("💧", x, y, s, 0.95);
        } else if (t === T.PLANT) {
          drawEmoji(w.stageEmoji(x, y), x, y, s);
        }
      }
    }

    for (const a of w.agents) {
      if (a.dead) continue;
      const sat = Math.min(1, a.energy / Math.max(0.2, a.thresh || 11));
      const icon = agentIcon(a);
      const scale = a.trait === "крол-душегуб" ? 1.08
        : a.trait === "корова" ? 1.05
        : a.trait === "лось" ? 1.02
        : 0.88 + 0.1 * sat;
      drawEmoji(icon, a.x, a.y, s, 0.45 + 0.55 * sat, scale);
    }

    if (app.inspect) {
      ctx.strokeStyle = "#7dffc2";
      ctx.lineWidth = 2;
      ctx.strokeRect(app.inspect.x * s + 1, app.inspect.y * s + 1, s - 2, s - 2);
    }

    if (w.dish) {
      ctx.beginPath();
      ctx.arc((w.dish.cx + 0.5) * s, (w.dish.cy + 0.5) * s, w.dish.r * s, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(180, 230, 255, 0.35)";
      ctx.lineWidth = 6;
      ctx.stroke();
    }

    for (const p of w.fx) {
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
      ctx.globalAlpha = 1;
    }
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

  function updateStats() {
    const w = app.world;
    if (!w) return;
    const a = w.analytics();
    canvas.style.cursor = app.tool === "inspect" ? "help" : "crosshair";

    const cycleLabel = app.gameType === "arcade" ? "Циклы" : "Поколение";
    const grid = $("stats-grid");
    grid.innerHTML = `
      <div><span>${cycleLabel}</span><strong>${w.generation}</strong></div>
      <div><span>Трава</span><strong>${a.grass}</strong></div>
      <div><span>Кусты</span><strong>${a.bush}</strong></div>
      <div><span>Деревья</span><strong>${a.tree}</strong></div>
      <div><span>Зайцы</span><strong>${a.herbs}</strong></div>
      <div><span>Лисы</span><strong>${a.preds}</strong></div>
      <div><span>Медведи</span><strong>${a.bears}</strong></div>
    `;

    $("analytics").innerHTML = `
      <div class="meter">
        <div class="row"><span>Жизнеспособность</span><strong>${a.label} · ${a.score}%</strong></div>
        <div class="bar"><i style="width:${a.score}%"></i></div>
        <p class="note">${a.note}</p>
      </div>
      <div class="meter">
        <div class="row"><span>Сытость зайцев</span><strong>${a.herbs ? a.herbSat + "%" : "нет"}</strong></div>
        <div class="bar sat"><i style="width:${a.herbs ? a.herbSat : 0}%"></i></div>
        <p class="note">${a.herbs ? `Голодных: ${a.herbHungry}. Корм: ${a.foodPerHerb} на зайца.` : "—"}</p>
      </div>
      <div class="meter">
        <div class="row"><span>Сытость лис</span><strong>${a.preds ? a.predSat + "%" : "нет"}</strong></div>
        <div class="bar sat fox"><i style="width:${a.preds ? a.predSat : 0}%"></i></div>
      </div>
    `;
    renderInspect();
  }

  function renderInspect() {
    const card = $("inspect-card");
    if (!app.inspect) {
      card.classList.add("hidden");
      return;
    }
    card.classList.remove("hidden");
    card.innerHTML = describeCell(app.inspect.x, app.inspect.y);
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
      const moveNote = a.kind === T.BEAR ? "медленный, не размножается"
        : a.trait === "корова" ? `медленный (×4), восприятие ${a.vision} кл.`
        : a.trait === "крол-душегуб" ? `быстрый (×3), восприятие ${a.vision} кл.`
        : a.trait === "волк" ? `одиночка, восприятие ${a.vision} кл.`
        : `восприятие ${a.vision} кл.`;
      return `<b>${who}</b><br>Сытость ${sat}% — ${mood}<br>${moveNote} · поколение ${a.gen}${note}`;
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
        return `<b>${name}</b><br>Возраст ${age}/${PLANT_CFG.treeLife}. Едят корова (10 ук.) и лось (8 ук.). После гибели — 1 трава.`;
      }
      const toBush = PLANT_CFG.grassToBush - age;
      return `<b>${name}</b><br>Возраст ${age}/${PLANT_CFG.grassToBush} тиков. Укусов: ${w.plantBites[i]}. До куста ~${Math.max(0, toBush)}.`;
    }
    if (t === T.WATER) return "<b>Вода</b><br>У берега трава растёт чаще.";
    if (t === T.WALL && w.inDish(x, y)) return "<b>Камень</b><br>Стена-забор.";
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

  async function showLeaderboard(resumeGameOver = false) {
    app.resumeGameOverAfterModal = resumeGameOver;
    const { scores, source } = await LifeLeaderboard.fetchScores();
    const rows = scores.length
      ? scores.map((s, i) => {
          const diff = LifeLeaderboard.DIFF_LABELS[s.difficulty] || s.difficulty || "—";
          return `<tr><td>${i + 1}</td><td>${escapeHtml(s.name)}</td><td>${s.cycles}</td><td>${diff}</td><td>${s.date || ""}</td></tr>`;
        }).join("")
      : '<tr><td colspan="5" class="empty-lb">Пока пусто — сыграй в аркаду!</td></tr>';

    const note = source === "local"
      ? '<p class="lb-note">Показаны записи только с этого устройства. Общая таблица появится, когда сервер подключён.</p>'
      : "";

    openModal(`
      <h3>🏆 Таблица лидеров</h3>
      ${note}
      <table class="lb-table">
        <thead><tr><th>#</th><th>Имя</th><th>Ходы</th><th>Сложность</th><th>Дата</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="modal-actions"><button class="btn primary" type="button" id="lb-close">Закрыть</button></div>
    `, true);
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  async function gameOver() {
    if (app.gameType !== "arcade") return;
    const cycles = app.world.generation;
    const diff = app.difficulty;
    const title = app.world.gameOverReason === "no_chain"
      ? "Лесу не хватило живых зверей"
      : "Экосистема остановилась";

    if (!app.gameEnded) {
      app.gameEnded = true;
      LifeSound.play("game_over");
    }
    app.playing = false;
    app.krolResumePlaying = false;
    dismissKrolOverlay(false);
    $("btn-play").textContent = "▶ Старт";
    showGameOverOverlay(title, cycles, diff);
  }

  function reset() {
    const gt = app.gameType;
    const diff = app.difficulty;
    setupWorld(gt, diff);
  }

  function flushMutationEnergy() {
    if (app.gameType !== "arcade" || !app.world?.pendingEnergy) return 0;
    const gain = app.world.pendingEnergy;
    app.energy += gain;
    app.world.pendingEnergy = 0;
    updateEnergy();
    return gain;
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
        app.world.step();
        if (app.gameType === "arcade" && app.started) {
          app.world.checkArcadeEnd(app.energy, herbCost());
        }
        flushWorldSounds(app.world);
        const energyGain = flushMutationEnergy();
        if (energyGain > 0 && app.world.lastMutation) LifeSound.play("energy_bonus");
        acc -= 1;
        if (afterWorldStep(ts, energyGain)) break;
        if (app.world.gameOver) {
          gameOver();
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

  canvas.addEventListener("mousedown", (e) => { app.painting = true; paintAt(e); });
  canvas.addEventListener("mousemove", (e) => { if (app.painting) paintAt(e); });
  window.addEventListener("mouseup", () => { app.painting = false; });
  canvas.addEventListener("touchstart", (e) => { e.preventDefault(); app.painting = true; paintAt(e); }, { passive: false });
  canvas.addEventListener("touchmove", (e) => { e.preventDefault(); if (app.painting) paintAt(e); }, { passive: false });
  canvas.addEventListener("touchend", () => { app.painting = false; });

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
    app.world.step();
    flushWorldSounds(app.world);
    const energyGain = flushMutationEnergy();
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
  $("btn-sound").onclick = () => {
    LifeSound.setEnabled(!LifeSound.isEnabled());
    syncAudioUi();
  };
  $("btn-music").onclick = () => {
    LifeMusic.setEnabled(!LifeMusic.isEnabled());
    syncAudioUi();
    LifeSound.play("ui");
  };
  $("btn-help").onclick = () => {
    const h = LIFE_DATA.help[app.gameType] || LIFE_DATA.help.sandbox;
    openModal(`
      <h3>${h.title}</h3>
      <ul class="help-list">${h.body.map((p) => `<li>${p}</li>`).join("")}</ul>
      <div class="modal-actions"><button class="btn primary" type="button" id="help-ok">Понятно</button></div>
    `);
  };
  $("go-menu").onclick = () => { hideGameOverOverlay(); showScreen("screen-menu"); };
  $("go-retry").onclick = () => { hideGameOverOverlay(); startArcade(app.difficulty); };
  $("go-submit").onclick = async () => {
    const name = $("go-name").value.trim() || "Аноним";
    const cycles = app.world.generation;
    const result = await LifeLeaderboard.submitScore({ name, cycles, difficulty: app.difficulty.id });
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
  $("modal").addEventListener("click", (e) => {
    if (e.target.id === "modal") closeModal();
    if (e.target.id === "lb-close" || e.target.id === "help-ok") closeModal();
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
  window.addEventListener("resize", resize);

  syncAudioUi();
  updateSpeedButton();
  $("game-version").textContent = formatGameVersion();
  LifeMusic.start();
  requestAnimationFrame(loop);
})();
