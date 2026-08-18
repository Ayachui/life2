const LifeSound = (() => {
  let ctx = null;
  let enabled = true;
  const throttle = {};
  const STORAGE_KEY = "life-sound-on-v1";

  const THROTTLE_MS = {
    eat_grass: 70,
    eat_bush: 100,
    sprout: 120,
    evolve_bush: 180,
    evolve_tree: 220,
    wilt: 350,
    hunt: 280,
    death_herb: 320,
    death_pred: 400,
    birth: 200,
    decay: 380,
    mutate: 0,
    paint: 45
  };

  function loadEnabled() {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === "1") enabled = true;
      else if (v === "0") enabled = false;
    } catch {}
  }
  loadEnabled();

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }

  function ensure() {
    if (!enabled) return null;
    const c = getCtx();
    if (c.state === "suspended") c.resume();
    return c;
  }

  function canPlay(name) {
    const ms = THROTTLE_MS[name];
    if (ms === 0) return true;
    const gap = ms ?? 50;
    const now = performance.now();
    if (throttle[name] && now - throttle[name] < gap) return false;
    throttle[name] = now;
    return true;
  }

  function env(g, t, peak, attack, release) {
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + release);
  }

  function tone(freq, dur, type = "sine", vol = 0.04, detune = 0) {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.detune.value = detune;
    env(g, t, vol, 0.01, dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function slide(freqFrom, freqTo, dur, type = "sine", vol = 0.035) {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freqFrom, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(40, freqTo), t + dur);
    env(g, t, vol, 0.008, dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function chord(freqs, dur, vol = 0.028) {
    freqs.forEach((f, i) => {
      setTimeout(() => tone(f, dur * 0.9, "sine", vol * (1 - i * 0.15)), i * 25);
    });
  }

  function noiseBurst(dur, vol = 0.05, freq = 800) {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const filter = c.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq;
    filter.Q.value = 0.8;
    const g = c.createGain();
    env(g, t, vol, 0.005, dur);
    src.connect(filter).connect(g).connect(c.destination);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  const SFX = {
    ui() {
      tone(660, 0.07, "sine", 0.03);
    },
    paint(brush) {
      const map = {
        plant: [520, 0.06],
        herb: [380, 0.09, "triangle"],
        pred: [290, 0.1, "triangle"],
        bear: [150, 0.14, "sawtooth"],
        water: [480, 0.08, "sine"],
        wall: [220, 0.07, "square"],
        erase: [180, 0.05, "sine"]
      };
      const p = map[brush] || [440, 0.06];
      tone(p[0], p[1], p[2] || "sine", 0.032);
    },
    play() {
      chord([392, 494, 587], 0.18, 0.025);
    },
    pause() {
      slide(440, 330, 0.12, "sine", 0.028);
    },
    sprout() {
      slide(320, 620, 0.1, "sine", 0.022);
    },
    evolve_bush() {
      chord([330, 415, 494], 0.14, 0.02);
    },
    evolve_tree() {
      chord([220, 277, 330, 415], 0.22, 0.022);
    },
    wilt() {
      slide(300, 140, 0.2, "triangle", 0.018);
    },
    eat_grass() {
      noiseBurst(0.04, 0.035, 1200);
      tone(180, 0.05, "triangle", 0.015);
    },
    eat_bush() {
      noiseBurst(0.06, 0.04, 600);
      tone(120, 0.07, "square", 0.012);
    },
    hunt() {
      slide(520, 180, 0.08, "sawtooth", 0.025);
      setTimeout(() => noiseBurst(0.05, 0.04, 400), 40);
    },
    death_herb() {
      slide(440, 220, 0.15, "sine", 0.03);
    },
    death_pred() {
      slide(330, 110, 0.22, "triangle", 0.032);
    },
    decay() {
      tone(90, 0.25, "sine", 0.018);
      noiseBurst(0.12, 0.015, 300);
    },
    birth() {
      slide(440, 660, 0.1, "sine", 0.026);
      setTimeout(() => tone(880, 0.08, "sine", 0.018), 60);
    },
    mutate() {
      slide(300, 900, 0.15, "sawtooth", 0.022);
      setTimeout(() => slide(900, 400, 0.12, "square", 0.015), 80);
    },
    energy_bonus() {
      slide(520, 880, 0.1, "sine", 0.028);
      setTimeout(() => tone(1046, 0.08, "sine", 0.02), 50);
    },
    krol_dushegub() {
      slide(55, 38, 0.55, "sawtooth", 0.07);
      setTimeout(() => {
        chord([146, 185, 220], 0.55, 0.045);
        noiseBurst(0.35, 0.09, 180);
      }, 120);
      setTimeout(() => slide(920, 160, 0.4, "square", 0.05), 220);
      setTimeout(() => tone(55, 0.5, "sine", 0.04), 380);
    },
    krol_hunt() {
      slide(420, 90, 0.12, "sawtooth", 0.04);
      noiseBurst(0.08, 0.06, 320);
    },
    krol_fade() {
      slide(280, 70, 0.35, "triangle", 0.03);
      setTimeout(() => tone(110, 0.4, "sine", 0.02), 150);
    },
    bear_hunt() {
      slide(180, 70, 0.18, "sawtooth", 0.045);
      noiseBurst(0.1, 0.055, 260);
    },
    death_bear() {
      slide(220, 55, 0.35, "triangle", 0.038);
    },
    game_over() {
      chord([392, 349, 294], 0.35, 0.03);
      setTimeout(() => slide(294, 147, 0.4, "sine", 0.028), 200);
    },
    score() {
      chord([523, 659, 784], 0.25, 0.028);
    },
    tutorial() {
      tone(523, 0.08, "sine", 0.025);
    }
  };

  function play(name, opts = {}) {
    if (!enabled) return;
    if (name !== "ui" && name !== "mutate" && name !== "game_over" && name !== "score"
      && name !== "energy_bonus" && name !== "krol_dushegub" && name !== "krol_fade" && !canPlay(name)) return;
    const fn = SFX[name];
    if (fn) fn(opts);
  }

  function flush(queue) {
    if (!enabled || !queue?.length) return;
    for (const item of queue) {
      if (typeof item === "string") play(item);
      else play(item.name, item);
    }
  }

  function setEnabled(on) {
    enabled = !!on;
    try { localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0"); } catch {}
    if (enabled) {
      const c = getCtx();
      if (c.state === "suspended") c.resume();
      play("ui");
    }
  }

  function isEnabled() {
    return enabled;
  }

  return { play, flush, setEnabled, isEnabled };
})();

window.LifeSound = LifeSound;
