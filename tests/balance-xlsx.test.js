const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const ExcelJS = require("exceljs");
const { createWorld } = require("./harness.cjs");
const schema = require("../tools/balance-schema.cjs");
const { exportXlsx, importXlsx, tablesFromEngine } = require("../tools/balance-xlsx.cjs");

describe("xlsx баланса", () => {
  test("схема покрывает все ключи LIFE_TABLES", () => {
    const { LIFE_TABLES } = createWorld();
    const missing = schema.missingFromSchema(LIFE_TABLES);
    const extra = schema.extraInSchema(LIFE_TABLES);
    assert.deepEqual(missing, [], `нет в схеме: ${missing.join(", ")}`);
    assert.deepEqual(extra, [], `лишнее в схеме: ${extra.join(", ")}`);
  });

  test("выгрузка, правка цены и импорт", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "life-xlsx-"));
    const file = path.join(dir, "LIFE-баланс.xlsx");
    const { tables } = tablesFromEngine();
    await exportXlsx(file, tables);

    const clean = await importXlsx(file, { dry: true });
    assert.deepEqual(clean.applied, []);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const sheet = wb.getWorksheet("Цены");
    let edited = false;
    sheet.eachRow((row, n) => {
      if (n === 1) return;
      if (row.getCell(1).value === "economy.tools.plant") {
        row.getCell(3).value = 9;
        edited = true;
      }
    });
    assert.equal(edited, true);
    await wb.xlsx.writeFile(file);

    const result = await importXlsx(file, { dry: true });
    assert.equal(result.applied.length, 1);
    assert.equal(result.applied[0].path, "economy.tools.plant");
    assert.equal(result.applied[0].from, 8);
    assert.equal(result.applied[0].to, 9);
  });
});
