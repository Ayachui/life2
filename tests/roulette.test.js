const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const sandbox = { Math, window: {} };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/content/roulette.js"), "utf8"), sandbox);

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

  test("старый расчёт (360 - center) не совпадал с событием", () => {
    const legacySpin = (event) => {
      const center = ROULETTE_SLICE_CENTER[event];
      return 5 * 360 + (360 - center);
    };
    assert.notEqual(rouletteSliceAtPointer(legacySpin("earthquake")), "earthquake");
    assert.notEqual(rouletteSliceAtPointer(legacySpin("flood")), "flood");
  });
});
