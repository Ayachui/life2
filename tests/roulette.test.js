const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const sandbox = { Math, window: {} };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/data.js"), "utf8"), sandbox);

const { rouletteSliceAtPointer, rouletteSpinDegrees, ROULETTE_SLICE_CENTER } = sandbox.window;

describe("рулетка: угол стрелки", () => {
  test("сектор под стрелкой совпадает с событием", () => {
    for (const event of Object.keys(ROULETTE_SLICE_CENTER)) {
      let i = 0;
      const rng = () => [0.25, 0.5, 0.75][i++ % 3];
      const spin = rouletteSpinDegrees(event, rng);
      assert.equal(rouletteSliceAtPointer(spin), event, `${event} → ${rouletteSliceAtPointer(spin)}`);
    }
  });

  test("старые углы не совпадали с событием", () => {
    const legacy = { earthquake: 2025, flood: 2250, plague: 2475, evolution: 2700 };
    assert.notEqual(rouletteSliceAtPointer(legacy.earthquake), "earthquake");
    assert.notEqual(rouletteSliceAtPointer(legacy.plague), "plague");
  });
});
