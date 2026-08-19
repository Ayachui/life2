const LEGACY_KEY = "life:arcade:leaderboard-v2";
const KEY_PREFIX = "life:arcade:leaderboard-v3";
const MIGRATED_FLAG = `${KEY_PREFIX}:migrated`;
const MAX = 50;

const DIFFICULTIES = ["easy", "medium", "hard", "hardcore"];

function keyForDifficulty(difficulty) {
  return `${KEY_PREFIX}:${normalizeDifficulty(difficulty)}`;
}

function normalizeDifficulty(difficulty) {
  return DIFFICULTIES.includes(difficulty) ? difficulty : "medium";
}

function emptyGrouped() {
  return Object.fromEntries(DIFFICULTIES.map((d) => [d, []]));
}

function groupScores(scores) {
  const grouped = emptyGrouped();
  for (const score of scores) {
    const difficulty = normalizeDifficulty(score.difficulty);
    grouped[difficulty].push({ ...score, difficulty });
  }
  for (const difficulty of DIFFICULTIES) {
    grouped[difficulty].sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
    grouped[difficulty] = grouped[difficulty].slice(0, MAX);
  }
  return grouped;
}

function redisFromEnv(env = process.env) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  if (Buffer.isBuffer(req.body)) {
    try {
      return JSON.parse(req.body.toString("utf8"));
    } catch {
      return {};
    }
  }
  return req.body;
}

function sanitizeName(name) {
  return String(name || "Аноним")
    .trim()
    .slice(0, 16)
    .replace(/[<>"'&]/g, "") || "Аноним";
}

function validDifficulty(d) {
  return DIFFICULTIES.includes(d);
}

function validatePoints(points) {
  const p = Number(points);
  if (!Number.isFinite(p) || p < 0 || p > 99999999) return null;
  return Math.floor(p);
}

function validateCycles(cycles) {
  const c = Number(cycles);
  if (!Number.isFinite(c) || c < 0 || c > 999999) return null;
  return Math.floor(c);
}

function buildEntry({ name, points, cycles, difficulty }) {
  const level = normalizeDifficulty(difficulty);
  return {
    name: sanitizeName(name),
    points,
    cycles: cycles ?? 0,
    difficulty: level,
    date: new Date().toISOString().slice(0, 10)
  };
}

function packMember(entry) {
  return JSON.stringify({
    name: entry.name,
    difficulty: entry.difficulty,
    date: entry.date,
    cycles: entry.cycles ?? 0
  });
}

function unpackScores(raw) {
  const scores = [];
  if (!raw?.length) return scores;

  if (typeof raw[0] === "object" && raw[0] !== null && "member" in raw[0]) {
    for (const row of raw) {
      try {
        const meta = typeof row.member === "string" ? JSON.parse(row.member) : row.member;
        scores.push({
          ...meta,
          points: Number(row.score),
          cycles: Number(meta.cycles ?? meta.points ?? row.score)
        });
      } catch {
        /* skip corrupt */
      }
    }
    return scores;
  }

  for (let i = 0; i < raw.length; i += 2) {
    try {
      const member = raw[i];
      const meta = typeof member === "string" ? JSON.parse(member) : member;
      scores.push({
        ...meta,
        points: Number(raw[i + 1]),
        cycles: Number(meta.cycles ?? meta.points ?? raw[i + 1])
      });
    } catch {
      /* skip corrupt */
    }
  }
  return scores;
}

module.exports = {
  LEGACY_KEY,
  KEY_PREFIX,
  MIGRATED_FLAG,
  MAX,
  DIFFICULTIES,
  keyForDifficulty,
  normalizeDifficulty,
  emptyGrouped,
  groupScores,
  redisFromEnv,
  parseBody,
  sanitizeName,
  validDifficulty,
  validateCycles,
  validatePoints,
  buildEntry,
  packMember,
  unpackScores
};
