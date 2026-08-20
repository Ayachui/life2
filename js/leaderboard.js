const LifeLeaderboard = (() => {
  const API = "/api/leaderboard";
  const LOCAL_KEY = "life-arcade-local-scores-v4";
  const LOCAL_LEGACY = "life-arcade-local-scores-v2";

  const DIFFICULTIES = ["easy", "medium", "hard", "hardcore"];

  const DIFF_LABELS = {
    easy: "Лёгкий",
    medium: "Средний",
    hard: "Сложный",
    hardcore: "Хардкор"
  };

  function emptyGrouped() {
    return { easy: [], medium: [], hard: [], hardcore: [] };
  }

  function normalizeDifficulty(difficulty) {
    return DIFFICULTIES.includes(difficulty) ? difficulty : "medium";
  }

  function sortGrouped(grouped) {
    for (const difficulty of DIFFICULTIES) {
      grouped[difficulty].sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
      grouped[difficulty] = grouped[difficulty].slice(0, 50);
    }
    return grouped;
  }

  function migrateLocal() {
    try {
      if (localStorage.getItem(LOCAL_KEY)) return;
      const raw = localStorage.getItem(LOCAL_LEGACY);
      if (!raw) return;
      const list = JSON.parse(raw) || [];
      const grouped = emptyGrouped();
      for (const score of list) {
        const difficulty = normalizeDifficulty(score.difficulty);
        grouped[difficulty].push({ ...score, difficulty });
      }
      localStorage.setItem(LOCAL_KEY, JSON.stringify(sortGrouped(grouped)));
      localStorage.removeItem(LOCAL_LEGACY);
    } catch {
      /* ignore corrupt local data */
    }
  }

  function loadLocalGrouped() {
    migrateLocal();
    try {
      const data = JSON.parse(localStorage.getItem(LOCAL_KEY));
      if (!data) return emptyGrouped();
      const grouped = emptyGrouped();
      for (const difficulty of DIFFICULTIES) {
        if (Array.isArray(data[difficulty])) grouped[difficulty] = data[difficulty];
      }
      return grouped;
    } catch {
      return emptyGrouped();
    }
  }

  function saveLocalGrouped(grouped) {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(sortGrouped(grouped)));
  }

  function saveLocalEntry(entry) {
    const grouped = loadLocalGrouped();
    const difficulty = normalizeDifficulty(entry.difficulty);
    grouped[difficulty].push(entry);
    saveLocalGrouped(grouped);
  }

  function isGroupedScores(scores) {
    return scores && typeof scores === "object" && Array.isArray(scores.easy);
  }

  async function fetchScores() {
    migrateLocal();
    try {
      const res = await fetch(API);
      const data = await res.json();
      if (data.ok && !data.offline && isGroupedScores(data.scores)) {
        return { scores: data.scores, source: "server" };
      }
      return { scores: loadLocalGrouped(), source: "local" };
    } catch {
      return { scores: loadLocalGrouped(), source: "local" };
    }
  }

  async function submitScore({ name, points, cycles, difficulty }) {
    const entry = {
      name: String(name || "Аноним").trim().slice(0, 16),
      points: Number(points) || 0,
      cycles: Number(cycles) || 0,
      difficulty: normalizeDifficulty(difficulty),
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

  return {
    fetchScores,
    submitScore,
    DIFF_LABELS,
    DIFFICULTIES,
    loadLocalGrouped,
    emptyGrouped
  };
})();

window.LifeLeaderboard = LifeLeaderboard;
