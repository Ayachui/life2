const LifeLeaderboard = (() => {
  const API = "/api/leaderboard";
  const LOCAL_KEY = "life-arcade-local-scores-v1";

  const DIFF_LABELS = {
    easy: "Лёгкий",
    medium: "Средний",
    hard: "Сложный",
    hardcore: "Хардкор"
  };

  function loadLocal() {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_KEY)) || [];
    } catch {
      return [];
    }
  }

  function saveLocal(scores) {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(scores.slice(0, 50)));
  }

  async function fetchScores() {
    try {
      const res = await fetch(API);
      const data = await res.json();
      if (data.ok && data.scores?.length) return data.scores;
      if (data.offline) return loadLocal();
      return data.scores || [];
    } catch {
      return loadLocal();
    }
  }

  async function submitScore({ name, cycles, difficulty }) {
    const entry = {
      name: String(name || "Аноним").trim().slice(0, 16),
      cycles: Number(cycles),
      difficulty,
      date: new Date().toISOString().slice(0, 10)
    };
    const local = loadLocal();
    local.push(entry);
    local.sort((a, b) => b.cycles - a.cycles);
    saveLocal(local);

    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry)
      });
      return await res.json();
    } catch {
      return { ok: true, offline: true };
    }
  }

  return { fetchScores, submitScore, DIFF_LABELS, loadLocal };
})();

window.LifeLeaderboard = LifeLeaderboard;
