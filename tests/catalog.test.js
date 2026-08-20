const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { createWorld } = require("./harness.cjs");
const { LIFE_BOOT_SCRIPTS } = require("../js/boot-order.cjs");

describe("каталог таблиц", () => {
  test("домены LIFE_TABLES на месте", () => {
    const { LIFE_TABLES, LIFE_BALANCE, LIFE_DATA } = createWorld();
    for (const key of ["meta", "economy", "scoring", "species", "ecology", "arcade"]) {
      assert.ok(LIFE_TABLES[key], `нет домена ${key}`);
    }
    assert.equal(LIFE_BALANCE.version.patch, 2);
    assert.equal(LIFE_BALANCE.version.minor, 15);
    assert.equal(LIFE_BALANCE.tools.herb, LIFE_TABLES.economy.tools.herb);
    assert.equal(LIFE_BALANCE.species.rabbit.drain, LIFE_TABLES.species.units.rabbit.drain);
    assert.equal(LIFE_BALANCE.plants.treeLife, LIFE_TABLES.ecology.plants.treeLife);
    assert.equal(LIFE_BALANCE.scoring.huntEnergyGain, LIFE_TABLES.scoring.formulas.huntEnergyGain);
    assert.equal(LIFE_BALANCE.arcadeEnd.staleAfter, LIFE_TABLES.arcade.arcadeEnd.staleAfter);
    assert.equal(LIFE_BALANCE.arcadeEnd.eraAfterChain, 300);
    assert.equal(LIFE_BALANCE.arcadeEconomy.surplusDecay, 0);
    assert.equal(LIFE_BALANCE.arcadeEconomy.pulsePerGen, 1);
    assert.equal(LIFE_BALANCE.arcadeEconomy.pulseCap, 90);
    assert.equal(LIFE_BALANCE.arcadeEconomy.pulseCapApex, 175);
    assert.equal(LIFE_DATA.tools.find((t) => t.id === "herb").cost, 45);
    assert.equal(LIFE_DATA.difficulties.find((d) => d.id === "medium").energy, 500);
  });

  test("index.html грузит boot-order", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
    let last = -1;
    for (const rel of LIFE_BOOT_SCRIPTS) {
      const i = html.indexOf(`src="${rel}"`);
      assert.ok(i >= 0, `нет ${rel} в index.html`);
      assert.ok(i > last, `${rel} идёт раньше предыдущего`);
      last = i;
    }
  });
});
