#!/usr/bin/env node
const assert = require("node:assert/strict");
const { loadEngine } = require("./harness.cjs");
const { simulateArcade, toolCosts } = require("./arcade-sim.cjs");

const SEEDS = [1, 7, 13, 21, 42];
const DIFFS = ["hardcore", "hard", "medium", "easy"];
const THRESHOLDS = {
  hardcore: { chain: true, minSurvival: 50 },
  hard: { chain: true, minSurvival: 120 },
  medium: { chain: true, minSurvival: 80 },
  easy: { chain: true, minSurvival: 80 }
};

function pct(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const i = Math.floor((p / 100) * (s.length - 1));
  return s[i];
}

function runReport() {
  const ctx = loadEngine();
  const rows = [];

  for (const diffId of DIFFS) {
    const d = ctx.LIFE_DATA.difficulties.find((x) => x.id === diffId);
    const surv = [];
    const chains = [];
    for (const seed of SEEDS) {
      const r = simulateArcade(ctx, {
        startEnergy: d.energy,
        maxGens: 160,
        seed
      });
      surv.push(r.survived);
      chains.push(r.sustainedChain ? 1 : 0);
    }
    const row = {
      diff: diffId,
      survivalP50: pct(surv, 50),
      survivalMin: Math.min(...surv),
      chainRate: chains.reduce((a, b) => a + b, 0) / chains.length
    };
    rows.push(row);
    const th = THRESHOLDS[diffId];
    if (th.chain) assert.ok(row.chainRate >= 0.6, `${diffId} chain rate ${row.chainRate}`);
    assert.ok(row.survivalMin >= th.minSurvival * 0.5,
      `${diffId} survival min ${row.survivalMin} < ${th.minSurvival * 0.5}`);
  }

  console.log("Balance report (Alpha 0.11.0)");
  console.table(rows);
  console.log("tools", toolCosts(ctx));
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

module.exports = { runReport, pct };
