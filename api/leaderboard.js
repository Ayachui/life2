const { Redis } = require("@upstash/redis");
const {
  KEY,
  MAX,
  redisFromEnv,
  parseBody,
  validDifficulty,
  validateCycles,
  buildEntry,
  packMember,
  unpackScores
} = require("./leaderboard-lib");

function redis() {
  const cfg = redisFromEnv();
  if (!cfg) return null;
  return new Redis(cfg);
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  const db = redis();

  if (req.method === "GET") {
    if (!db) {
      return res.status(200).json({ ok: true, scores: [], offline: true });
    }
    try {
      const raw = await db.zrange(KEY, 0, MAX - 1, { rev: true, withScores: true });
      return res.status(200).json({ ok: true, scores: unpackScores(raw) });
    } catch {
      return res.status(500).json({ ok: false, error: "read_failed" });
    }
  }

  if (req.method === "POST") {
    const body = parseBody(req);
    const cycles = validateCycles(body.cycles);
    if (cycles === null) {
      return res.status(400).json({ ok: false, error: "invalid_cycles" });
    }
    if (!validDifficulty(body.difficulty)) {
      return res.status(400).json({ ok: false, error: "invalid_difficulty" });
    }
    if (!db) {
      return res.status(503).json({ ok: false, error: "no_storage", offline: true });
    }

    const entry = buildEntry({
      name: body.name,
      cycles,
      difficulty: body.difficulty
    });

    try {
      await db.zadd(KEY, { score: cycles, member: packMember(entry) });
      const size = await db.zcard(KEY);
      if (size > MAX) await db.zpopmin(KEY, size - MAX);
      return res.status(200).json({ ok: true, saved: true });
    } catch {
      return res.status(500).json({ ok: false, error: "write_failed" });
    }
  }

  return res.status(405).json({ ok: false, error: "method_not_allowed" });
};
