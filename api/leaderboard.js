const { Redis } = require("@upstash/redis");

const KEY = "life:arcade:leaderboard";
const MAX = 50;

function redis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sanitizeName(name) {
  return String(name || "Аноним")
    .trim()
    .slice(0, 16)
    .replace(/[<>"'&]/g, "");
}

function validDifficulty(d) {
  return ["easy", "medium", "hard", "hardcore"].includes(d);
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
      const scores = [];
      for (let i = 0; i < raw.length; i += 2) {
        try {
          scores.push({ ...JSON.parse(raw[i]), cycles: raw[i + 1] });
        } catch {
          /* skip corrupt */
        }
      }
      return res.status(200).json({ ok: true, scores });
    } catch (e) {
      return res.status(500).json({ ok: false, error: "read_failed" });
    }
  }

  if (req.method === "POST") {
    const { name, cycles, difficulty, secret } = req.body || {};
    const c = Number(cycles);
    if (!Number.isFinite(c) || c < 1 || c > 999999) {
      return res.status(400).json({ ok: false, error: "invalid_cycles" });
    }
    if (!validDifficulty(difficulty)) {
      return res.status(400).json({ ok: false, error: "invalid_difficulty" });
    }
    const expected = process.env.LEADERBOARD_SECRET;
    if (expected && secret !== expected) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    }
    if (!db) {
      return res.status(503).json({ ok: false, error: "no_storage", offline: true });
    }
    const entry = JSON.stringify({
      name: sanitizeName(name),
      difficulty,
      date: new Date().toISOString().slice(0, 10)
    });
    try {
      await db.zadd(KEY, { score: c, member: entry });
      const size = await db.zcard(KEY);
      if (size > MAX) await db.zpopmin(KEY, size - MAX);
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, error: "write_failed" });
    }
  }

  return res.status(405).json({ ok: false, error: "method_not_allowed" });
};
