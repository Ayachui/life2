const { Redis } = require("@upstash/redis");
const {
  LEGACY_KEY,
  MIGRATED_FLAG,
  MAX,
  DIFFICULTIES,
  keyForDifficulty,
  emptyGrouped,
  redisFromEnv,
  parseBody,
  validDifficulty,
  validateCycles,
  validatePoints,
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

async function trimKey(db, key) {
  const size = await db.zcard(key);
  if (size > MAX) await db.zpopmin(key, size - MAX);
}

async function migrateLegacy(db) {
  if (await db.get(MIGRATED_FLAG)) return;

  const raw = await db.zrange(LEGACY_KEY, 0, -1, { rev: true, withScores: true });
  const scores = unpackScores(raw || []);
  for (const score of scores) {
    const entry = buildEntry({
      name: score.name,
      points: score.points,
      cycles: score.cycles,
      difficulty: score.difficulty
    });
    const key = keyForDifficulty(entry.difficulty);
    await db.zadd(key, { score: entry.points, member: packMember(entry) });
    await trimKey(db, key);
  }

  if (scores.length) await db.del(LEGACY_KEY);
  await db.set(MIGRATED_FLAG, "1");
}

async function readGrouped(db) {
  await migrateLegacy(db);
  const grouped = emptyGrouped();
  for (const difficulty of DIFFICULTIES) {
    const raw = await db.zrange(keyForDifficulty(difficulty), 0, MAX - 1, {
      rev: true,
      withScores: true
    });
    grouped[difficulty] = unpackScores(raw || []);
  }
  return grouped;
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  const db = redis();

  if (req.method === "GET") {
    if (!db) {
      return res.status(200).json({ ok: true, scores: emptyGrouped(), offline: true });
    }
    try {
      const scores = await readGrouped(db);
      return res.status(200).json({ ok: true, scores });
    } catch {
      return res.status(500).json({ ok: false, error: "read_failed" });
    }
  }

  if (req.method === "POST") {
    const body = parseBody(req);
    const points = validatePoints(body.points);
    const cycles = validateCycles(body.cycles);
    if (points === null) {
      return res.status(400).json({ ok: false, error: "invalid_points" });
    }
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
      points,
      cycles,
      difficulty: body.difficulty
    });

    try {
      const key = keyForDifficulty(entry.difficulty);
      await db.zadd(key, { score: points, member: packMember(entry) });
      await trimKey(db, key);
      return res.status(200).json({ ok: true, saved: true });
    } catch {
      return res.status(500).json({ ok: false, error: "write_failed" });
    }
  }

  return res.status(405).json({ ok: false, error: "method_not_allowed" });
};
