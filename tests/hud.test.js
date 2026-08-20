const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { loadEngine } = require("./harness.cjs");
const engine = loadEngine();
global.LIFE_BALANCE = engine.LIFE_BALANCE;
global.LIFE_DATA = engine.LIFE_DATA;
const {
  hudNum, hudEnergyBand, hudThreat, hudChain, hudObjective, hudModel, hudRouletteEta,
  hudSpecials, hudTrophic
} = require("../js/hud.js");

describe("HUD: взгляд за секунду", () => {
  test("числа с неразрывным пробелом", () => {
    assert.equal(hudNum(100182), "100\u00a0182");
    assert.equal(hudNum(Infinity), "∞");
  });

  test("⚡ broke только если нельзя посадить траву", () => {
    assert.equal(hudEnergyBand(5, 45, 90, 8), "broke");
    assert.equal(hudEnergyBand(40, 45, 90, 8), "tight");
    assert.equal(hudEnergyBand(50, 45, 90, 8), "ok");
    assert.equal(hudEnergyBand(500, 45, 90, 8), "ok");
    assert.equal(hudEnergyBand(Infinity, 45, 90, 8), "sandbox");
  });

  test("угроза: нет зайцев — таймер поражения", () => {
    const world = {
      arcade: true,
      noHerbGens: 48,
      herbivoreCount: () => 0,
      noHerbEndLimit: () => 60
    };
    const t = hudThreat(world, { gameType: "arcade", started: true });
    assert.equal(t.kind, "no_herb");
    assert.equal(t.left, 12);
    assert.equal(t.level, "warn");
  });

  test("до старта пустая чашка не орёт таймером", () => {
    const world = { arcade: true, generation: 0, noHerbGens: 0, herbivoreCount: () => 0, noHerbEndLimit: () => 60 };
    assert.equal(hudThreat(world, { gameType: "arcade", started: false }), null);
  });

  test("цепочка 12/25 и лок", () => {
    const open = hudChain({ herbStreak: 12, sustainedChain: false });
    assert.equal(open.current, 12);
    assert.equal(open.locked, false);
    const locked = hudChain({ herbStreak: 40, sustainedChain: true });
    assert.equal(locked.current, 25);
    assert.equal(locked.locked, true);
  });

  test("до старта цель напоминает: ⚡ не сгорает", () => {
    const o = hudObjective({
      herbStreak: 0,
      sustainedChain: false,
      arcade: true,
      herbivoreCount: () => 0
    }, { gameType: "arcade", started: false });
    assert.match(o.line, /не сгорает/);
  });

  test("цель аркады до цепочки — про зайцев", () => {
    const o = hudObjective({
      herbStreak: 3,
      sustainedChain: false,
      arcade: true,
      herbivoreCount: () => 2
    }, {
      gameType: "arcade", started: true
    });
    assert.match(o.line, /3\/25/);
  });

  test("рулетка: сколько циклов до события", () => {
    assert.equal(hudRouletteEta({ generation: 80 }), 20);
    assert.equal(hudRouletteEta({ generation: 100 }), 0);
  });

  test("модель содержит trophic и viability", () => {
    const world = {
      arcade: true,
      generation: 10,
      lifePoints: 80,
      herbStreak: 10,
      sustainedChain: false,
      noHerbGens: 0,
      arcadeBudget: 500,
      herbivoreCount: () => 2,
      analytics: () => ({
        grass: 4, bush: 1, tree: 0, herbs: 2, preds: 0, bears: 0,
        score: 50, label: "устойчиво", note: "Зайцы сыты.", herbSat: 70, foodPerHerb: 2
      }),
      agents: []
    };
    const m = hudModel(world, { gameType: "arcade", started: true, energy: 400, herbCost: 45, predCost: 90 });
    assert.equal(m.energyBand, "ok");
    assert.equal(m.trophic.core[3].value, 2);
    assert.equal(m.viability.tone, "good");
    assert.equal(m.energyRatio, 0.8);
  });

  test("редкие виды — только если живы", () => {
    const an = { grass: 1, bush: 0, tree: 0, herbs: 1, preds: 0, bears: 0 };
    const empty = hudTrophic(an, hudSpecials({ agents: [] }));
    assert.equal(empty.extra.length, 0);
    const withKoala = hudTrophic(an, hudSpecials({
      agents: [{ trait: "коала", dead: false }, { trait: "коала", dead: true }]
    }));
    assert.equal(withKoala.extra.length, 1);
    assert.equal(withKoala.extra[0].id, "koala");
    assert.equal(withKoala.extra[0].value, 1);
  });

  test("после цепочки цель про пирамиду", () => {
    const o = hudObjective({
      sustainedChain: true,
      generation: 80,
      arcade: true,
      herbivoreCount: () => 3,
      counts: () => ({ preds: 0, herbs: 3, plants: 5 }),
      predatorCount: () => 0
    }, { gameType: "arcade", started: true });
    assert.equal(o.title, "Цепочка жива");
    assert.match(o.line, /4 зайца/);
    assert.match(o.line, /без потолка/);
    assert.equal(o.line.includes("Эра"), false);
    assert.equal(o.line.includes("cap"), false);
  });
});
