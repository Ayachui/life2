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

  function saveLocalEntry(entry) {
    const local = loadLocal();
    local.push(entry);
    local.sort((a, b) => b.cycles - a.cycles);
    saveLocal(local);
  }

  async function fetchScores() {
    try {
      const res = await fetch(API);
      const data = await res.json();
      if (data.ok && !data.offline) {
        return { scores: data.scores || [], source: "server" };
      }
      return { scores: loadLocal(), source: "local" };
    } catch {
      return { scores: loadLocal(), source: "local" };
    }
  }

  async function submitScore({ name, cycles, difficulty }) {
    const entry = {
      name: String(name || "Аноним").trim().slice(0, 16),
      cycles: Number(cycles),
      difficulty,
      date: new Date().toISOString().slice(0, 10)
    };
    saveLocalEntry(entry);

    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry)
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        return { ok: true, saved: true, localOnly: false };
      }
      if (data.offline || data.error === "no_storage") {
        return { ok: true, saved: false, localOnly: true, error: data.error };
      }
      return { ok: false, saved: false, localOnly: true, error: data.error || "submit_failed" };
    } catch {
      return { ok: true, saved: false, localOnly: true, error: "network" };
    }
  }

  return { fetchScores, submitScore, DIFF_LABELS, loadLocal };
})();

window.LifeLeaderboard = LifeLeaderboard;
