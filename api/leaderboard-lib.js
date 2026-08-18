const KEY = "life:arcade:leaderboard";
const MAX = 50;

const DIFFICULTIES = ["easy", "medium", "hard", "hardcore"];

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

function validateCycles(cycles) {
  const c = Number(cycles);
  if (!Number.isFinite(c) || c < 1 || c > 999999) return null;
  return Math.floor(c);
}

function buildEntry({ name, cycles, difficulty }) {
  return {
    name: sanitizeName(name),
    cycles,
    difficulty,
    date: new Date().toISOString().slice(0, 10)
  };
}

function packMember(entry) {
  return JSON.stringify({
    name: entry.name,
    difficulty: entry.difficulty,
    date: entry.date
  });
}

function unpackScores(raw) {
  const scores = [];
  if (!raw?.length) return scores;

  if (typeof raw[0] === "object" && raw[0] !== null && "member" in raw[0]) {
    for (const row of raw) {
      try {
        const meta = typeof row.member === "string" ? JSON.parse(row.member) : row.member;
        scores.push({ ...meta, cycles: Number(row.score) });
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
      scores.push({ ...meta, cycles: Number(raw[i + 1]) });
    } catch {
      /* skip corrupt */
    }
  }
  return scores;
}

module.exports = {
  KEY,
  MAX,
  DIFFICULTIES,
  redisFromEnv,
  parseBody,
  sanitizeName,
  validDifficulty,
  validateCycles,
  buildEntry,
  packMember,
  unpackScores
};
