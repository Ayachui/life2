const LifeMusic = (() => {
  const PLAYLIST = [
    "music/1.mp3",
    "music/2.mp3",
    "music/3.mp3",
    "music/4.mp3",
    "music/5.mp3"
  ];
  const STORAGE_KEY = "life-music-on-v1";

  let enabled = true;
  let index = 0;
  let audio = null;
  let started = false;
  let unlockHandler = null;
  let errorStreak = 0;
  let alarmCtx = null;
  let alarmNodes = null;
  let musicDucked = false;

  function loadEnabled() {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === "0") enabled = false;
      else if (v === "1") enabled = true;
    } catch {}
  }
  loadEnabled();

  function bindUnlock() {
    if (unlockHandler) return;
    unlockHandler = () => {
      unlockHandler = null;
      if (enabled) playCurrent();
    };
    document.addEventListener("pointerdown", unlockHandler, { once: true });
    document.addEventListener("keydown", unlockHandler, { once: true });
  }

  function createAudio() {
    if (!audio) {
      audio = new Audio();
      audio.preload = "auto";
      audio.addEventListener("ended", () => {
        errorStreak = 0;
        index = (index + 1) % PLAYLIST.length;
        playCurrent();
      });
      audio.addEventListener("error", () => {
        errorStreak++;
        if (errorStreak >= PLAYLIST.length) return;
        index = (index + 1) % PLAYLIST.length;
        playCurrent();
      });
      audio.addEventListener("playing", () => { errorStreak = 0; });
    }
    return audio;
  }

  function playCurrent() {
    if (!enabled || !PLAYLIST.length) return;
    const a = createAudio();
    a.src = PLAYLIST[index];
    a.volume = 0.42;
    const p = a.play();
    if (p && typeof p.catch === "function") {
      p.catch(() => bindUnlock());
    }
  }

  function start() {
    if (started) return;
    started = true;
    if (enabled) playCurrent();
  }

  function setEnabled(on) {
    enabled = !!on;
    try { localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0"); } catch {}
    if (enabled) {
      playCurrent();
    } else {
      stopAlarm();
      if (audio) audio.pause();
    }
  }

  function isEnabled() {
    return enabled;
  }

  function duckMusic() {
    if (!audio || musicDucked) return;
    musicDucked = true;
    audio.volume = 0.05;
  }

  function unduckMusic() {
    if (!audio || !musicDucked) return;
    musicDucked = false;
    audio.volume = 0.42;
  }

  function stopAlarm() {
    if (alarmNodes) {
      for (const node of alarmNodes) {
        try { node.stop?.(); node.disconnect?.(); } catch {}
      }
      alarmNodes = null;
    }
    if (alarmCtx) {
      try { alarmCtx.close(); } catch {}
      alarmCtx = null;
    }
    unduckMusic();
  }

  function playAlarm() {
    if (!enabled) return;
    stopAlarm();
    duckMusic();
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    alarmCtx = new AC();
    const c = alarmCtx;
    const t = c.currentTime;
    const master = c.createGain();
    master.gain.value = 0.22;
    master.connect(c.destination);

    const drone = c.createOscillator();
    const droneGain = c.createGain();
    drone.type = "sawtooth";
    drone.frequency.setValueAtTime(82, t);
    droneGain.gain.setValueAtTime(0.35, t);
    drone.connect(droneGain).connect(master);

    const pulse = c.createOscillator();
    const pulseGain = c.createGain();
    pulse.type = "square";
    pulse.frequency.setValueAtTime(196, t);
    pulseGain.gain.setValueAtTime(0.001, t);
    pulseGain.gain.setValueAtTime(0.18, t + 0.04);
    pulseGain.gain.setValueAtTime(0.001, t + 0.55);
    pulseGain.gain.setValueAtTime(0.18, t + 0.59);
    pulseGain.gain.setValueAtTime(0.001, t + 1.1);
    pulse.connect(pulseGain).connect(master);

    const lfo = c.createOscillator();
    const lfoGain = c.createGain();
    lfo.frequency.value = 0.45;
    lfoGain.gain.value = 0.12;
    lfo.connect(lfoGain);
    lfoGain.connect(master.gain);

    drone.start(t);
    pulse.start(t);
    lfo.start(t);
    pulseGain.gain.setValueAtTime(0.001, t + 1.1);
    const loopPulse = () => {
      if (!alarmCtx) return;
      const now = c.currentTime;
      pulseGain.gain.cancelScheduledValues(now);
      pulseGain.gain.setValueAtTime(0.001, now);
      pulseGain.gain.setValueAtTime(0.2, now + 0.05);
      pulseGain.gain.setValueAtTime(0.001, now + 0.55);
      pulseGain.gain.setValueAtTime(0.2, now + 0.6);
      pulseGain.gain.setValueAtTime(0.001, now + 1.1);
    };
    const pulseTimer = setInterval(loopPulse, 1100);
    alarmNodes = [drone, pulse, lfo, { stop: () => clearInterval(pulseTimer) }];
    const resume = c.resume?.();
    if (resume && typeof resume.catch === "function") resume.catch(() => {});
  }

  return { start, setEnabled, isEnabled, playAlarm, stopAlarm };
})();

window.LifeMusic = LifeMusic;
