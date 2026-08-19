#!/usr/bin/env node
/**
 * Длинные партии: кривая ⚡, ферма, непроигрываемость.
 *   npm run playtest
 */
const assert = require("node:assert/strict");
const { runBattery } = require("./playtest.cjs");
const { loadEngine } = require("./harness.cjs");
const { simulateArcade } = require("./arcade-sim.cjs");

function printAudit(runs) {
  const acc = {};
  for (const r of runs) {
    for (const [k, v] of Object.entries(r.audit || {})) {
      acc[k] = (acc[k] || 0) + v;
    }
  }
  const n = Math.max(1, runs.length);
  const rows = Object.entries(acc)
    .filter(([, v]) => v)
    .map(([k, v]) => ({ source: k, avg: Math.round((v / n) * 10) / 10, sum: Math.round(v) }));
  if (rows.length) console.table(rows);
  else console.log("источники ⚡: пусто (повторяющегося дохода нет)");
}

function runReport() {
  const { rows, runs } = runBattery({
    seeds: [1, 7, 13, 21, 42],
    diffs: ["hardcore", "medium", "easy"],
    maxGens: 400
  });

  console.log("Playtest / economy (Alpha 0.15.0)");
  console.table(rows.map((r) => ({
    diff: r.diff,
    strategy: r.strategy,
    start: r.start,
    eP50: r.energyP50,
    eP90: r.energyP90,
    eMax: r.energyMax,
    ratioP90: r.ratioP90,
    earnedP90: r.earnedP90,
    unlose: Math.round(r.unlosableRate * 100) + "%",
    lose: Math.round(r.loseRate * 100) + "%",
    chain: Math.round(r.chainRate * 100) + "%"
  })));

  console.log("\nИсточники ⚡ (среднее за партию):");
  printAudit(runs);

  const greedy = rows.filter((r) => r.strategy === "greedy");
  for (const row of greedy) {
    assert.ok(row.unlosableRate <= 0.2,
      `${row.diff}/greedy unlosable ${row.unlosableRate}`);
    assert.ok(row.ratioP90 <= 1.35,
      `${row.diff}/greedy energy ratio p90 ${row.ratioP90} — ⚡ всё ещё растёт`);
  }

  const ctx = loadEngine();
  const medium = ctx.LIFE_DATA.difficulties.find((d) => d.id === "medium");
  const bot = simulateArcade(ctx, { startEnergy: medium.energy, maxGens: 200, seed: 3 });
  console.log("\nбазовый бот (medium, 200 циклов)", {
    energy: Math.round(bot.energy),
    start: medium.energy,
    gameOver: bot.gameOver,
    chain: bot.sustainedChain
  });
  assert.ok(bot.energy <= medium.energy * 1.25, `базовый бот раздул ⚡: ${bot.energy}`);

  return rows;
}

if (require.main === module) {
  try {
    runReport();
    console.log("OK");
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

module.exports = { runReport };
