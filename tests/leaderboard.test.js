const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const {
  redisFromEnv,
  sanitizeName,
  validDifficulty,
  validateCycles,
  validatePoints,
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

  test("validatePoints принимает разумные значения", () => {
    assert.equal(validatePoints(420), 420);
    assert.equal(validatePoints(0), 0);
    assert.equal(validatePoints(-1), null);
    assert.equal(validatePoints("x"), null);
  });

  test("validateCycles принимает разумные значения", () => {
    assert.equal(validateCycles(42), 42);
    assert.equal(validateCycles(0), 0);
    assert.equal(validateCycles("x"), null);
  });

  test("validDifficulty", () => {
    assert.equal(validDifficulty("hardcore"), true);
    assert.equal(validDifficulty("impossible"), false);
  });

  test("pack/unpack roundtrip", () => {
    const entry = buildEntry({ name: "Тест", points: 1200, cycles: 100, difficulty: "easy" });
    const raw = [packMember(entry), 1200];
    const scores = unpackScores(raw);
    assert.equal(scores[0].name, "Тест");
    assert.equal(scores[0].points, 1200);
    assert.equal(scores[0].cycles, 100);
    assert.equal(scores[0].difficulty, "easy");
  });

  test("unpackScores поддерживает формат объектов Upstash", () => {
    const entry = buildEntry({ name: "Облако", points: 777, cycles: 77, difficulty: "hard" });
    const raw = [{ member: packMember(entry), score: 777 }];
    const scores = unpackScores(raw);
    assert.equal(scores[0].name, "Облако");
    assert.equal(scores[0].points, 777);
    assert.equal(scores[0].cycles, 77);
  });
});
