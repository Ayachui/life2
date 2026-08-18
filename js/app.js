(() => {
  const COLS = 72;
  const ROWS = 52;
  const SAVE = "life-lab-progress-v1";

  const $ = (id) => document.getElementById(id);
  const app = {
    screen: "menu",
    mode: "eco",
    mission: null,
    tool: "plant",
    stamp: null,
    playing: false,
    speed: 2,
    sound: false,
    world: null,
    snapshot: null,
    timer: 0,
    peakHerbs: 0,
    startHerbs: 0,
    startPlants: 0,
    holdAlive: 0,
    painting: false,
    audio: null,
    inspect: null
  };

  const canvas = $("world");
  const ctx = canvas.getContext("2d");
  const menuBg = $("menu-bg");
  const menuCtx = menuBg.getContext("2d");

  function loadProgress() {
    try { return JSON.parse(localStorage.getItem(SAVE)) || { stars: {} }; }
    catch { return { stars: {} }; }
  }
  function saveProgress(p) { localStorage.setItem(SAVE, JSON.stringify(p)); }
  let progress = loadProgress();

  function showScreen(id) {
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
    blip(520, 0.08);
  }

  function log(text) {
    const box = $("log");
    const line = document.createElement("div");
    line.textContent = text;
    box.prepend(line);
    while (box.childNodes.length > 6) box.lastChild.remove();
  }

  function blip(freq, dur) {
    if (!app.sound) return;
    try {
      app.audio = app.audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = app.audio.createOscillator();
      const g = app.audio.createGain();
      o.frequency.value = freq;
      o.type = "sine";
      g.gain.value = 0.035;
      g.gain.exponentialRampToValueAtTime(0.001, app.audio.currentTime + dur);
      o.connect(g).connect(app.audio.destination);
      o.start();
      o.stop(app.audio.currentTime + dur);
    } catch {}
  }

  function openModal(html) {
    $("modal-card").innerHTML = html;
    $("modal").classList.remove("hidden");
  }
  function closeModal() { $("modal").classList.add("hidden"); }

  function toolsFor(mode) {
    return mode === "classic" ? LIFE_DATA.toolsClassic : LIFE_DATA.toolsEco;
  }

  function renderTools() {
    const grid = $("tool-grid");
    grid.innerHTML = "";
    const tools = toolsFor(app.mode).filter((t) => t.id !== "inspect" || !app.mission);
    for (const t of tools) {
      const b = document.createElement("button");
      b.className = "tool" + (app.tool === t.id ? " active" : "");
      b.textContent = t.label;
      b.title = LIFE_DATA.toolHelp[t.id] || "";
      b.onclick = () => {
        app.tool = t.id;
        app.stamp = null;
        renderTools();
        renderStamps();
      };
      grid.appendChild(b);
    }
    $("stamp-box").classList.toggle("hidden", app.mode !== "classic");
    renderStamps();
    $("tool-help").textContent = currentHelp();
  }

  function currentHelp() {
    if (app.stamp) {
      const s = LIFE_DATA.stamps.find((x) => x.id === app.stamp);
      return s ? s.help : "";
    }
    return LIFE_DATA.toolHelp[app.tool] || "";
  }

  function renderStamps() {
    const row = $("stamp-row");
    row.innerHTML = "";
    for (const s of LIFE_DATA.stamps) {
      const b = document.createElement("button");
      b.className = "stamp" + (app.stamp === s.id ? " active" : "");
      b.textContent = s.name;
      b.onclick = () => { app.stamp = s.id; app.tool = "life"; renderTools(); renderStamps(); };
      b.title = s.help;
      row.appendChild(b);
    }
  }

  function legend() {
    const items = app.mode === "classic"
      ? [["✨", "живая клетка"], ["★", "цель"]]
      : [
        ["🌱", "растения"], ["🐰", "зайцы"], ["🦊", "лисы"], ["💧", "вода"], ["🪨", "камень"],
        ["ring:#ffd45c", "зоркий"], ["ring:#ff5d7a", "прожорливый"], ["ring:#3ee0a2", "экономный"], ["ring:#8ea0d8", "близорукий"]
      ];
    $("legend").innerHTML = items.map(([mark, n]) => {
      if (mark.startsWith("ring:")) return `<span><i class="ring" style="border-color:${mark.slice(5)}"></i>${n}</span>`;
      return `<span>${mark} ${n}</span>`;
    }).join("");
  }

  function setupWorld(mode, mission) {
    app.mode = mode;
    app.mission = mission;
    app.playing = false;
    app.inspect = null;
    app.timer = 0;
    app.holdAlive = 0;
    app.tool = mode === "classic" ? "life" : "plant";
    app.stamp = null;
    const world = new World(COLS, ROWS, mode);
    if (mode === "eco") world.makeDish();
    if (mission) applyMissionSetup(world, mission);
    app.world = world;
    app.snapshot = world.clone();
    app.peakHerbs = world.counts().herbs;
    app.startHerbs = world.counts().herbs;
    app.startPlants = world.counts().plants;
    $("btn-play").textContent = "▶ Старт";
    if (mission) {
      $("game-title").textContent = mission.title;
      $("game-subtitle").textContent = mission.subtitle;
      $("hud-goal-title").textContent = "Цель миссии";
      $("hud-goal").textContent = mission.goal;
      $("hud-hint").textContent = mission.hint;
    } else if (mode === "classic") {
      $("game-title").textContent = "Классика Конвея";
      $("game-subtitle").textContent = "Три правила и никаких зверей";
      $("hud-goal-title").textContent = "Что делать";
      $("hud-goal").textContent = "Поставь штамп или нарисуй клетки и нажми Старт. Смотри, что выживет.";
      $("hud-hint").textContent = "Живая клетка держится при 2–3 соседях и рождается при 3. Глайдер летит, мигалка моргает.";
    } else {
      $("game-title").textContent = "Песочница";
      $("game-subtitle").textContent = "Лабораторный журнал";
      $("hud-goal-title").textContent = "Свободный опыт";
      $("hud-goal").textContent = "Собери пищевую цепь и следи за приборами: сытость, жизнеспособность, мутанты.";
      $("hud-hint").textContent = "Вода ускоряет лес у берега и делит чашку как река. Камень — забор. Цветное кольцо у зайца или лисы — мутация.";
    }
    renderStarsPreview();
    renderTools();
    legend();
    $("log").innerHTML = "";
    resize();
    draw();
    updateStats();
  }

  function applyMissionSetup(world, mission) {
    if (mission.id === "ship") {
      world.target = { x: 60, y: 20, w: 8, h: 12 };
    }
    if (mission.id === "breakfast") {
      sprinkle(world, "plant", 90);
    }
    if (mission.id === "chain") {
      sprinkle(world, "plant", 70);
    }
    if (mission.id === "wall") {
      sprinkle(world, "plant", 55, 42, 8, 24, 36);
      for (let i = 0; i < 10; i++) world.paint(18 + (i % 5), 22 + Math.floor(i / 5) * 2, "herb");
    }
    if (mission.id === "mutants") {
      world.mutateRate = 0.42;
      sprinkle(world, "plant", 80);
      for (let i = 0; i < 6; i++) world.paint(30 + i, 26, "herb");
    }
    if (mission.id === "planet") sprinkle(world, "water", 18, 28, 20, 16, 16);
  }

  function sprinkle(world, brush, n, x = 20, y = 14, w = 32, h = 24) {
    let k = 0, guard = 0;
    while (k < n && guard++ < 2000) {
      const px = x + Math.floor(Math.random() * w);
      const py = y + Math.floor(Math.random() * h);
      if (world.get(px, py) === EMPTY && world.inDish(px, py)) {
        world.paint(px, py, brush);
        k++;
      }
    }
  }

  function renderStarsPreview() {
    const m = app.mission;
    if (!m) {
      $("star-row").textContent = "приборы: сытость и жизнеспособность";
      return;
    }
    const got = progress.stars[m.id] || 0;
    $("star-row").textContent = "★".repeat(got) + "☆".repeat(3 - got) + "  " + m.stars[Math.max(0, got - 1) | 0];
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

  function paintAt(e) {
    const { x, y } = cellFromEvent(e);
    if (app.tool === "inspect") {
      app.inspect = { x, y };
      draw();
      updateStats();
      return;
    }
    if (app.stamp) app.world.stamp(x, y, app.stamp);
    else app.world.paint(x, y, app.tool);
    draw();
    updateStats();
  }

  function draw() {
    const w = app.world;
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

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${Math.max(11, Math.floor(s * 0.92))}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;

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
          if (app.mode === "classic") drawEmoji("✨", x, y, s);
          else drawEmoji(plantEmoji(x, y), x, y, s);
        }
      }
    }

    for (const a of w.agents) {
      if (a.dead) continue;
      const sat = Math.min(1, a.energy / Math.max(0.2, a.thresh || 11));
      if (a.trait) drawTraitRing(a.x, a.y, s, a.trait);
      const icon = a.kind === T.PRED ? "🦊" : "🐰";
      drawEmoji(icon, a.x, a.y, s, 0.45 + 0.55 * sat, 0.88 + 0.1 * sat);
    }

    if (app.inspect && app.mode === "eco") {
      ctx.strokeStyle = "#7dffc2";
      ctx.lineWidth = 2;
      ctx.strokeRect(app.inspect.x * s + 1, app.inspect.y * s + 1, s - 2, s - 2);
    }

    if (w.target) {
      ctx.strokeStyle = "#ffd45c";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(w.target.x * s, w.target.y * s, w.target.w * s, w.target.h * s);
      ctx.setLineDash([]);
      drawEmoji("⭐", w.target.x + w.target.w / 2 - 0.5, w.target.y + w.target.h / 2 - 0.5, s);
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
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc((p.x + 0.5) * s, (p.y + 0.5) * s, s * 0.35 * p.t, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function plantEmoji(x, y) {
    const plants = LIFE_DATA.plants;
    return plants[Math.abs(x * 13 + y * 7) % plants.length];
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

  function drawTraitRing(x, y, s, trait) {
    const color = LIFE_DATA.traitRing[trait];
    if (!color) return;
    const cx = (x + 0.5) * s;
    const cy = (y + 0.5) * s;
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.48, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2.2, s * 0.16);
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function updateStats() {
    const w = app.world;
    const grid = $("stats-grid");
    const analytics = $("analytics");
    const inspect = $("inspect-card");
    canvas.style.cursor = app.tool === "inspect" ? "help" : "crosshair";

    if (app.mode === "classic") {
      const c = w.counts();
      grid.innerHTML = `
        <div><span>Поколение</span><strong>${w.generation}</strong></div>
        <div><span>Живые клетки</span><strong>${c.plants}</strong></div>
        <div><span>Циклы ритма</span><strong>${w.cycles}</strong></div>
      `;
      analytics.classList.add("hidden");
      inspect.classList.add("hidden");
      return;
    }

    const a = w.analytics();
    app.peakHerbs = Math.max(app.peakHerbs, a.herbs);
    grid.innerHTML = `
      <div><span>Поколение</span><strong>${w.generation}</strong></div>
      <div><span>Растения</span><strong>${a.plants}</strong></div>
      <div><span>Зайцы</span><strong>${a.herbs}</strong></div>
      <div><span>Лисы</span><strong>${a.preds}</strong></div>
    `;
    analytics.classList.remove("hidden");
    analytics.innerHTML = `
      <div class="meter">
        <div class="row"><span>Жизнеспособность</span><strong>${a.label} · ${a.score}%</strong></div>
        <div class="bar"><i style="width:${a.score}%"></i></div>
        <p class="note">${a.note}</p>
      </div>
      <div class="meter">
        <div class="row"><span>Сытость зайцев</span><strong>${a.herbs ? a.herbSat + "%" : "нет"}</strong></div>
        <div class="bar sat"><i style="width:${a.herbs ? a.herbSat : 0}%"></i></div>
        <p class="note">${a.herbs ? `Голодных: ${a.herbHungry} из ${a.herbs}. Корм: ${a.foodPerHerb} растений на зайца.` : "Добавь зайцев — появится шкала сытости."}</p>
      </div>
      <div class="meter">
        <div class="row"><span>Сытость лис</span><strong>${a.preds ? a.predSat + "%" : "нет"}</strong></div>
        <div class="bar sat fox"><i style="width:${a.preds ? a.predSat : 0}%"></i></div>
        <p class="note">${a.preds ? `Голодных: ${a.predHungry} из ${a.preds}. Добыча: ${a.preyPerFox} зайца на лису.` : "Лиса живёт только охотой. Без зайцев она вымрет."}</p>
      </div>
      <div class="meter">
        <div class="row"><span>Мутанты сейчас</span><strong>зайцы ${a.mutHerb} · лисы ${a.mutPred}</strong></div>
        <p class="note">Растения не мутируют. Кольцо у зверя — характер: жёлтое зоркий, красное прожорливый, зелёное экономный, синее близорукий. Всего событий: ${a.mutEvents}.</p>
      </div>
    `;
    renderInspect();
  }

  function renderInspect() {
    const card = $("inspect-card");
    if (app.mode !== "eco" || !app.inspect) {
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
      const who = a.kind === T.HERB ? "Заяц" : "Лиса";
      const sat = Math.round(Math.min(1, a.energy / Math.max(0.2, a.thresh)) * 100);
      const mood = a.energy >= a.thresh ? "сыт и сейчас не ест" : "голоден, ищет еду";
      const trait = a.trait
        ? `${a.trait}: ${traitHint(a.trait)}`
        : "обычный — как родители";
      return `<b>${who}${a.mutated ? " · мутант" : ""}</b><br>Сытость ${sat}% — ${mood}<br>Характер: ${trait}<br>Зоркость ${a.vision} клеток · поколение ${a.gen}`;
    }
    const t = w.get(x, y);
    if (t === T.PLANT) return "<b>Растение</b><br>Не мутирует. Растёт кучкой. Голодные зайцы его едят. У воды всходит чаще.";
    if (t === T.WATER) return "<b>Вода</b><br>Пруд или река: у берега лес гуще. Зайцы и лисы воду не переходят.";
    if (t === T.WALL && w.inDish(x, y)) return "<b>Камень</b><br>Стена. Никто не проходит и не ест сквозь него. Из камня делают забор и заповедник.";
    if (t === T.WALL) return "<b>Край чашки</b><br>Снаружи жизнь не рисуется.";
    return "<b>Пусто</b><br>Сюда можно посадить растение, зверя, воду или камень.";
  }

  function traitHint(trait) {
    return {
      "зоркий": "дальше видит еду",
      "близорукий": "хуже замечает еду",
      "прожорливый": "быстрее голодает и чаще ест",
      "экономный": "дольше остаётся сытым"
    }[trait] || "";
  }

  function starCount(mission) {
    const w = app.world;
    const c = w.counts();
    const t = app.timer;
    switch (mission.id) {
      case "spark":
        return c.plants >= 120 ? 3 : c.plants >= 80 ? 2 : c.plants >= 40 ? 1 : 0;
      case "ship":
        if (!w.reachedTarget()) return 0;
        return w.generation <= 55 ? 3 : w.generation <= 80 ? 2 : 1;
      case "pulse":
        return w.cycles >= 24 ? 3 : w.cycles >= 16 ? 2 : w.cycles >= 8 ? 1 : 0;
      case "breakfast":
        if (t < 20) return 0;
        if (c.herbs >= 3 && c.plants >= 10 && app.peakHerbs >= (app.herbBaseline || 0) + 2) return 3;
        if (c.herbs >= 6 && c.plants >= 20) return 2;
        if (c.herbs >= 3 && c.plants >= 10) return 1;
        return 0;
      case "chain":
        if (c.plants && c.herbs && c.preds) app.holdAlive += 1 / ticksPerSec();
        else app.holdAlive = 0;
        if (app.holdAlive >= 40 && c.total >= 50) return 3;
        if (app.holdAlive >= 40) return 2;
        if (app.holdAlive >= 25) return 1;
        return 0;
      case "wall":
        if (t < 15) return 0;
        const saved = c.plants >= app.startPlants * 0.7;
        if (c.plants >= 20 && saved && c.herbs >= 1) return 3;
        if (c.plants >= 20 && saved) return 2;
        if (c.plants >= 20) return 1;
        return 0;
      case "mutants":
        return w.mutations >= 5 ? 3 : w.mutations >= 3 ? 2 : w.mutations >= 1 ? 1 : 0;
      case "planet":
        if (c.plants && c.herbs && c.preds && c.total >= 70) app.holdAlive += 1 / ticksPerSec();
        else app.holdAlive = 0;
        if (app.holdAlive >= 45) return 3;
        if (app.holdAlive >= 30 && c.total >= 100) return 2;
        if (app.holdAlive >= 30) return 1;
        return 0;
      default:
        return 0;
    }
  }

  function ticksPerSec() {
    return [2, 4, 7, 11, 16][app.speed - 1];
  }

  function checkMission() {
    const m = app.mission;
    if (!m) return;
    const stars = starCount(m);
    const timed = ["breakfast", "chain", "wall", "planet"].includes(m.id);
    $("star-row").textContent = "★".repeat(stars) + "☆".repeat(3 - stars) + (timed ? `  ·  ${Math.floor(app.timer)} с` : "");
    if (stars > (progress.stars[m.id] || 0)) {
      progress.stars[m.id] = stars;
      saveProgress(progress);
    }
    if (stars > lastWin) {
      lastWin = stars;
      if (stars === 1) toast("Первая звезда! Можно добыть ещё");
      if (stars === 2) toast("Две звезды!");
      if (stars === 3) win(3);
    }
  }

  let lastWin = 0;

  function win(stars) {
    const m = app.mission;
    app.playing = false;
    $("btn-play").textContent = "▶ Старт";
    blip(660, 0.12);
    const idx = LIFE_DATA.missions.findIndex((x) => x.id === m.id);
    const next = LIFE_DATA.missions[idx + 1];
    openModal(`
      <h3>Есть жизнь!</h3>
      <p>${m.title}: ${"★".repeat(stars)}${"☆".repeat(3 - stars)}</p>
      <p>Ты собрал полный комплект звёзд этой миссии.</p>
      <div class="modal-actions">
        <button class="btn" id="win-again">Ещё раз</button>
        <button class="btn primary" id="win-next">${next ? "Дальше" : "К миссиям"}</button>
      </div>
    `);
    $("win-again").onclick = () => { closeModal(); reset(); };
    $("win-next").onclick = () => {
      closeModal();
      if (next) startMission(next);
      else { renderMissions(); showScreen("screen-missions"); }
    };
  }

  function reset() {
    lastWin = 0;
    app.lastMut = 0;
    app.world = app.snapshot.clone();
    app.playing = false;
    app.inspect = null;
    app.timer = 0;
    app.holdAlive = 0;
    app.peakHerbs = app.world.counts().herbs;
    $("btn-play").textContent = "▶ Старт";
    draw();
    updateStats();
  }

  let acc = 0, last = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    if (app.screen === "screen-menu") drawMenu(ts);
    if (!app.world || app.screen !== "screen-game") return;
    if (!last) last = ts;
    const dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    if (app.playing) {
      acc += dt * ticksPerSec();
      while (acc >= 1) {
        const herbs = app.world.counts().herbs;
        const preds = app.world.counts().preds;
        app.world.step();
        app.timer += 1 / ticksPerSec();
        acc -= 1;
        if (app.world.lastMutation && (!app.mutToastAt || ts - app.mutToastAt > 1800)) {
          const m = app.world.lastMutation;
          const who = m.kind === LIFE_TYPES.HERB ? "заяц" : "лиса";
          toast(`Мутант: ${m.trait} ${who}`);
          app.mutToastAt = ts;
        }
        if (app.mode === "eco") {
          if (herbs > 0 && app.world.counts().herbs === 0) toast("Зайцы вымерли");
          if (preds > 0 && app.world.counts().preds === 0) toast("Лисы вымерли");
        }
        checkMission();
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

  function renderMissions() {
    const grid = $("mission-grid");
    grid.innerHTML = "";
    LIFE_DATA.missions.forEach((m, i) => {
      const stars = progress.stars[m.id] || 0;
      const open = i === 0 || (progress.stars[LIFE_DATA.missions[i - 1].id] || 0) > 0;
      const card = document.createElement("button");
      card.className = "mission-card-btn" + (open ? "" : " locked");
      card.innerHTML = `
        <div class="num">${m.num}</div>
        <h3>${open ? m.title : "Закрыто"}</h3>
        <p>${open ? m.goal : "Пройди предыдущую миссию"}</p>
        <div class="stars">${open ? "★".repeat(stars) + "☆".repeat(3 - stars) : "🔒"}</div>
      `;
      if (open) card.onclick = () => startMission(m);
      grid.appendChild(card);
    });
    $("stars-total").textContent = `Звёзды: ${Object.values(progress.stars).reduce((a, b) => a + b, 0)} / 24`;
  }

  function startMission(m) {
    lastWin = 0;
    showScreen("screen-game");
    setupWorld(m.mode, m);
  }

  canvas.addEventListener("mousedown", (e) => { app.painting = true; paintAt(e); });
  canvas.addEventListener("mousemove", (e) => { if (app.painting && !app.stamp) paintAt(e); });
  window.addEventListener("mouseup", () => { app.painting = false; });
  canvas.addEventListener("touchstart", (e) => { e.preventDefault(); app.painting = true; paintAt(e); }, { passive: false });
  canvas.addEventListener("touchmove", (e) => { e.preventDefault(); if (app.painting && !app.stamp) paintAt(e); }, { passive: false });
  canvas.addEventListener("touchend", () => { app.painting = false; });

  $("btn-campaign").onclick = () => { renderMissions(); showScreen("screen-missions"); };
  $("btn-sandbox").onclick = () => { showScreen("screen-game"); setupWorld("eco", null); };
  $("btn-classic").onclick = () => { showScreen("screen-game"); setupWorld("classic", null); };
  $("btn-missions-back").onclick = () => showScreen("screen-menu");
  $("btn-game-back").onclick = () => {
    if (app.mission) { renderMissions(); showScreen("screen-missions"); }
    else showScreen("screen-menu");
  };
  $("btn-play").onclick = () => {
    app.playing = !app.playing;
    if (app.playing) app.herbBaseline = app.world.counts().herbs;
    $("btn-play").textContent = app.playing ? "⏸ Пауза" : "▶ Старт";
    if (app.sound && app.audio && app.audio.state === "suspended") app.audio.resume();
  };
  $("btn-step").onclick = () => { app.world.step(); updateStats(); draw(); checkMission(); };
  $("btn-reset").onclick = reset;
  $("speed").oninput = (e) => { app.speed = Number(e.target.value); };
  $("btn-sound").onclick = () => {
    app.sound = !app.sound;
    $("btn-sound").textContent = app.sound ? "🔊" : "🔇";
    if (app.sound) blip(440, 0.1);
  };
  $("btn-help").onclick = () => {
    const key = app.mission ? "mission" : (app.mode === "classic" ? "classic" : "eco");
    const h = LIFE_DATA.help[key];
    openModal(`
      <h3>${h.title}</h3>
      <ul class="help-list">${h.body.map((p) => `<li>${p}</li>`).join("")}</ul>
      <div class="modal-actions"><button class="btn primary" id="help-ok">Понятно</button></div>
    `);
  };
  $("modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
  document.addEventListener("click", (e) => { if (e.target.id === "help-ok") closeModal(); });
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && app.screen === "screen-game") {
      e.preventDefault();
      $("btn-play").click();
    }
    if (e.key === "1") app.tool = toolsFor(app.mode)[0].id;
    if (e.key === "2") app.tool = toolsFor(app.mode)[1]?.id || app.tool;
    renderTools();
  });
  window.addEventListener("resize", resize);

  $("btn-sound").textContent = "🔇";
  requestAnimationFrame(loop);
})();
