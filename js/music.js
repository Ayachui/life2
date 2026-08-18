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
    } else if (audio) {
      audio.pause();
    }
  }

  function isEnabled() {
    return enabled;
  }

  return { start, setEnabled, isEnabled };
})();

window.LifeMusic = LifeMusic;
