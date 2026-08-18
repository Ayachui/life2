const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const {
  redisFromEnv,
  sanitizeName,
  validDifficulty,
  validateCycles,
  buildEntry,
  packMember,
  unpackScores
} = require("../api/leaderboard-lib");

describe("лидерборд API", () => {
  test("redisFromEnv читает Upstash и KV переменные", () => {
    assert.equal(redisFromEnv({}), null);
    assert.ok(redisFromEnv({
      UPSTASH_REDIS_REST_URL: "https://x.upstash.io",
      UPSTASH_REDIS_REST_TOKEN: "tok"
    }));
    assert.ok(redisFromEnv({
      KV_REST_API_URL: "https://y.upstash.io",
      KV_REST_API_TOKEN: "tok2"
    }));
  });

  test("sanitizeName обрезает и чистит имя", () => {
    assert.equal(sanitizeName('  <script>'), "script");
    assert.equal(sanitizeName("А".repeat(20)).length, 16);
  });

  test("validateCycles принимает разумные значения", () => {
    assert.equal(validateCycles(42), 42);
    assert.equal(validateCycles(0), null);
    assert.equal(validateCycles("x"), null);
  });

  test("validDifficulty", () => {
    assert.equal(validDifficulty("hardcore"), true);
    assert.equal(validDifficulty("impossible"), false);
  });

  test("pack/unpack roundtrip", () => {
    const entry = buildEntry({ name: "Тест", cycles: 100, difficulty: "easy" });
    const raw = [packMember(entry), 100];
    const scores = unpackScores(raw);
    assert.equal(scores[0].name, "Тест");
    assert.equal(scores[0].cycles, 100);
    assert.equal(scores[0].difficulty, "easy");
  });
});
