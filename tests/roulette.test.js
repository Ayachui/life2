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
  test("стрелка сверху: какой сектор лежит на 12 часах после поворота", () => {
    assert.equal(rouletteSliceAtPointer(315), "earthquake");
    assert.equal(rouletteSliceAtPointer(225), "flood");
    assert.equal(rouletteSliceAtPointer(135), "plague");
    assert.equal(rouletteSliceAtPointer(45), "evolution");
    assert.equal(rouletteSliceAtPointer(0), "earthquake");
  });

  test("спин события ставит его иконку под стрелку", () => {
    for (const event of Object.keys(ROULETTE_SLICE_CENTER)) {
      let i = 0;
      const rng = () => [0.25, 0.5, 0.75][i++ % 3];
      const spin = rouletteSpinDegrees(event, rng);
      assert.equal(rouletteSliceAtPointer(spin), event, `${event} → ${rouletteSliceAtPointer(spin)} при ${spin}`);
    }
  });

  test("старый ход (450 − center) показывал соседа", () => {
    const broken = (event) => {
      const center = ROULETTE_SLICE_CENTER[event];
      return (450 - center) % 360;
    };
    assert.equal(rouletteSliceAtPointer(broken("earthquake")), "evolution");
    assert.equal(rouletteSliceAtPointer(broken("flood")), "earthquake");
    assert.equal(rouletteSliceAtPointer(broken("plague")), "flood");
    assert.equal(rouletteSliceAtPointer(broken("evolution")), "plague");
  });
});
