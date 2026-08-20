#!/usr/bin/env node
/**
 * Баланс ЖИЗНИ ↔ Excel.
 *
 *   node tools/balance-xlsx.cjs              выгрузить js/tables → xlsx
 *   node tools/balance-xlsx.cjs export [файл]
 *   node tools/balance-xlsx.cjs import [файл]  влить правки обратно в js/tables
 */
const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const { loadEngine } = require("../tests/harness.cjs");
const schema = require("./balance-schema.cjs");

const ROOT = path.join(__dirname, "..");
const DEFAULT_XLSX = path.join(ROOT, "balance", "LIFE-баланс.xlsx");
const TABLE_DOMAINS = ["meta", "economy", "scoring", "species", "ecology", "arcade"];
const KV_HEADERS = ["ключ", "название", "значение", "тип", "единица", "смысл", "вкладка", "импортировать"];
const YELLOW = "FFF6D887";
const HEADER_FILL = "FF1F4E79";
const HEADER_FONT = "FFFFFFFF";
const SKIP_EMPTY = Symbol("skip");

function tablesFromEngine() {
  const ctx = loadEngine();
  const tables = ctx.LIFE_TABLES;
  if (!tables) throw new Error("LIFE_TABLES не загрузились");
  return { ctx, tables };
}

function cloneTables(tables) {
  return JSON.parse(JSON.stringify(tables));
}

function formatGameVersion(v) {
  if (!v) return "?";
  const labels = { alpha: "Альфа", beta: "Бета", release: "Релиз" };
  const num = `${v.major}.${v.minor}.${v.patch}`;
  return labels[v.stage] ? `${labels[v.stage]} ${num}` : num;
}

function rawCell(value) {
  if (value == null || value === "") return "";
  if (typeof value === "object") {
    if (Array.isArray(value.richText)) return value.richText.map((t) => t.text).join("");
    if (value.result != null) return value.result;
    if (value.text != null) return value.text;
    if (value.hyperlink && value.text) return value.text;
    if (value instanceof Date) return value;
  }
  return value;
}

function valuesEqual(a, b) {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") {
    if (!Number.isFinite(a) && !Number.isFinite(b)) return true;
    return Math.abs(a - b) < 1e-9;
  }
  if (typeof a === "boolean" || typeof b === "boolean") return Boolean(a) === Boolean(b);
  return String(a) === String(b);
}

function parseTyped(raw, type) {
  if (raw === "" || raw == null) return SKIP_EMPTY;
  if (type === "boolean") {
    if (typeof raw === "boolean") return raw;
    const s = String(raw).trim().toLowerCase();
    if (["true", "1", "да", "yes", "истина"].includes(s)) return true;
    if (["false", "0", "нет", "no", "ложь"].includes(s)) return false;
    throw new Error(`ожидали да/нет, получили «${raw}»`);
  }
  if (type === "string") return String(raw).trim();
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "boolean") return raw ? 1 : 0;
  const s = String(raw).trim().replace(",", ".");
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error(`ожидали число, получили «${raw}»`);
  return n;
}

function jsLiteral(value, indent) {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "0";
    return Number.isInteger(value) ? String(value) : String(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => jsLiteral(v, indent)).join(", ")}]`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value);
    if (!keys.length) return "{}";
    const compact = keys.every((k) => {
      const v = value[k];
      return v == null || typeof v !== "object";
    }) && JSON.stringify(value).length <= 88;
    if (compact) {
      const inner = keys.map((k) => {
        const key = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
        return `${key}: ${jsLiteral(value[k], indent)}`;
      });
      return `{ ${inner.join(", ")} }`;
    }
    const pad = " ".repeat(indent);
    const next = " ".repeat(indent + 2);
    const lines = keys.map((k, i) => {
      const key = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
      const comma = i < keys.length - 1 ? "," : "";
      return `${next}${key}: ${jsLiteral(value[k], indent + 2)}${comma}`;
    });
    return `{\n${lines.join("\n")}\n${pad}}`;
  }
  return JSON.stringify(value);
}

function tableFilePath(domain) {
  return path.join(ROOT, "js", "tables", `${domain}.js`);
}

function writeDomainFile(domain, object) {
  const file = tableFilePath(domain);
  const prev = fs.readFileSync(file, "utf8");
  const idx = prev.indexOf("(function");
  if (idx < 0) throw new Error(`нет IIFE в ${file}`);
  const nl = prev.includes("\r\n") ? "\r\n" : "\n";
  const header = prev.slice(0, idx).replace(/\r\n/g, "\n").trimEnd();
  const body = `${header}\n(function (root) {\n  const T = root.LIFE_TABLES || (root.LIFE_TABLES = {});\n  T.${domain} = ${jsLiteral(object, 2)};\n})(typeof window !== "undefined" ? window : globalThis);\n`
    .replace(/\n/g, nl);
  fs.writeFileSync(file, body);
}

function styleHeader(row) {
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.font = { bold: true, color: { argb: HEADER_FONT }, name: "Calibri", size: 11 };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  row.height = 22;
}

function styleValueCell(cell, type) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: YELLOW } };
  cell.alignment = { vertical: "middle" };
  cell.protection = { locked: false };
  if (type === "number") cell.numFmt = "0.##########";
}

function applySheetLook(ws, color) {
  ws.properties.tabColor = { argb: `FF${color}` };
  ws.views = [{ state: "frozen", ySplit: 1, showGridLines: true }];
  ws.autoFilter = undefined;
}

function writeKvSheet(wb, name, color, rows, intro) {
  const ws = wb.addWorksheet(name, { properties: { tabColor: { argb: `FF${color}` } } });
  applySheetLook(ws, color);
  ws.columns = [
    { header: KV_HEADERS[0], key: "path", width: 42 },
    { header: KV_HEADERS[1], key: "label", width: 24 },
    { header: KV_HEADERS[2], key: "value", width: 14 },
    { header: KV_HEADERS[3], key: "type", width: 10 },
    { header: KV_HEADERS[4], key: "unit", width: 12 },
    { header: KV_HEADERS[5], key: "hint", width: 78 },
    { header: KV_HEADERS[6], key: "sheet", width: 18 },
    { header: KV_HEADERS[7], key: "import", width: 16 }
  ];
  styleHeader(ws.getRow(1));
  for (const row of rows) {
    const r = ws.addRow([
      row.path,
      row.label,
      row.value,
      row.type,
      row.unit || "",
      row.hint,
      row.sheet,
      row.import ? "да" : "нет"
    ]);
    r.alignment = { vertical: "middle", wrapText: true };
    styleValueCell(r.getCell(3), row.type);
    if (!row.import) {
      r.getCell(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
      r.getCell(3).protection = { locked: true };
    }
    r.height = 32;
  }
  if (rows.length) ws.autoFilter = { from: "A1", to: `H${rows.length + 1}` };
  if (intro) ws.getRow(1).note = intro;
  return ws;
}

function paramValue(tables, row) {
  return schema.getByPath(tables, row.path);
}

function toKvRows(tables, list) {
  return list.map((row) => ({
    ...row,
    value: paramValue(tables, row)
  }));
}

function writeSpeciesSheet(wb, tables) {
  const ws = wb.addWorksheet("Виды", { properties: { tabColor: { argb: "FF548235" } } });
  applySheetLook(ws, "548235");
  const fields = schema.SPECIES_FIELDS;
  const headers = ["id", "название", ...fields.map((f) => f.key)];
  const hints = ["не менять", "", ...fields.map((f) => f.hint)];
  ws.addRow(headers);
  styleHeader(ws.getRow(1));
  const hintRow = ws.addRow(hints);
  hintRow.font = { italic: true, color: { argb: "FF666666" }, size: 9 };
  hintRow.alignment = { wrapText: true, vertical: "top" };
  hintRow.height = 48;
  for (const spec of schema.SPECIES_IDS) {
    const unit = schema.getByPath(tables, `species.units.${spec.id}`) || {};
    const values = [spec.id, spec.label, ...fields.map((f) => (spec.fields.includes(f.key) ? unit[f.key] : ""))];
    const r = ws.addRow(values);
    r.alignment = { vertical: "middle" };
    for (let c = 3; c <= headers.length; c++) {
      const key = fields[c - 3].key;
      if (spec.fields.includes(key)) styleValueCell(r.getCell(c), "number");
      else {
        r.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEEEEE" } };
      }
    }
  }
  ws.getColumn(1).width = 14;
  ws.getColumn(2).width = 18;
  for (let c = 3; c <= headers.length; c++) ws.getColumn(c).width = 16;
  ws.views = [{ state: "frozen", ySplit: 2, xSplit: 2 }];
  return ws;
}

function writeInstruction(wb, tables) {
  const ws = wb.addWorksheet("Инструкция", { properties: { tabColor: { argb: "FF666666" } } });
  const v = formatGameVersion(tables.meta?.version);
  const lines = [
    ["ЖИЗНЬ — таблица баланса"],
    [`Версия выгрузки: ${v}`],
    [`Дата: ${new Date().toISOString().slice(0, 10)}`],
    [""],
    ["Как править"],
    ["1. Меняй только жёлтые ячейки колонки «значение». Серые — справочные, в код не попадут."],
    ["2. Не переименовывай ключи, не удаляй строки, не меняй id видов."],
    ["3. Не ставь формат процентов (0.02 должно остаться 0.02, не 2%)."],
    ["4. Можно править и вкладку «Все», и тематическую — если числа разъедутся, импорт остановится."],
    ["5. Сохрани как .xlsx (Google Таблицы: Файл → Скачать → xlsx) и верни файл."],
    [""],
    ["Как влить обратно"],
    ["Отдай файл в чат — агент прогонит: npm run balance-xlsx:import"],
    ["Или сам: node tools/balance-xlsx.cjs import balance/LIFE-баланс.xlsx"],
    ["Канон после импорта — js/tables/*.js (economy, scoring, species, ecology, arcade)."],
    [""],
    ["Что где"],
    ["Все — полный список ключей, удобно искать (Ctrl+F, область: книга)."],
    ["Цены / Сложность / Экономика_пульса — ⚡ игрока."],
    ["Энергия_событий — сейчас почти всё 0: бюджет идёт импульсом, не с каждого чиха."],
    ["Тиры / Очки / Формулы — очки жизни. Формула: round(base × тир × событие × genMul), потом ecoMul."],
    ["Виды — статы зверей таблицей. Пустая серая клетка = этого поля у вида нет."],
    ["Мутации / Размножение / Поведение — шансы, толпа, коалы, волк, лось."],
    ["Растения / Поле — рост, укусы, падаль, грибы, вода, лимиты террейна."],
    ["Конец_раунда / Рулетка — когда кончается матч и как бьёт давление."],
    ["Версия — не трогать. Справочно_очки — старые цифры, движок их не читает."],
    [""],
    ["Пирамида цен сейчас: трава 8 → заяц 45 → лиса 90 → медведь 175. Импульс ⚡: 1/цикл (+0.5 с хищником), потолок 90 → 175."]
  ];
  ws.getColumn(1).width = 120;
  lines.forEach((line, i) => {
    const row = ws.addRow(line);
    row.alignment = { wrapText: true, vertical: "top" };
    if (i === 0) {
      row.font = { bold: true, size: 16, color: { argb: "FF1F4E79" } };
      row.height = 24;
    } else if (line[0] && !line[0].match(/^\d/) && line[0].length < 40 && !line[0].includes("—") && !line[0].includes(".")) {
      row.font = { bold: true, size: 12, color: { argb: "FF1F4E79" } };
    } else {
      row.font = { size: 11 };
      row.height = 18;
    }
  });
  ws.views = [{ showGridLines: false }];
}

async function exportXlsx(outPath, tables) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "LIFE";
  wb.created = new Date();
  const colorOf = Object.fromEntries(schema.SHEET_META.map((s) => [s.name, s.color]));

  writeInstruction(wb, tables);

  const allRows = toKvRows(tables, schema.ALL_PARAMS);
  writeKvSheet(wb, "Все", colorOf["Все"], allRows, "Полный каталог. Жёлтое можно менять.");

  const bySheet = new Map();
  for (const row of allRows) {
    if (row.sheet === "Виды") continue;
    if (!bySheet.has(row.sheet)) bySheet.set(row.sheet, []);
    bySheet.get(row.sheet).push(row);
  }
  for (const meta of schema.SHEET_META) {
    if (meta.name === "Инструкция" || meta.name === "Все") continue;
    if (meta.name === "Виды") {
      writeSpeciesSheet(wb, tables);
      continue;
    }
    writeKvSheet(wb, meta.name, meta.color, bySheet.get(meta.name) || []);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await wb.xlsx.writeFile(outPath);
  return outPath;
}

function readKvSheet(ws) {
  const found = [];
  const header = [];
  ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    header[col] = String(rawCell(cell.value) || "").trim().toLowerCase();
  });
  const col = {};
  for (let i = 1; i < header.length; i++) {
    if (header[i]) col[header[i]] = i;
  }
  if (!col["ключ"] || !col["значение"]) return found;
  ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum === 1) return;
    const pathKey = String(rawCell(row.getCell(col["ключ"]).value) || "").trim();
    if (!pathKey || pathKey === "ключ") return;
    found.push({
      path: pathKey,
      value: rawCell(row.getCell(col["значение"]).value),
      type: col["тип"] ? String(rawCell(row.getCell(col["тип"]).value) || "") : "",
      importFlag: col["импортировать"] ? String(rawCell(row.getCell(col["импортировать"]).value) || "") : "да",
      sheet: ws.name
    });
  });
  return found;
}

function readSpeciesSheet(ws) {
  const found = [];
  const headers = [];
  ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    headers[col] = String(rawCell(cell.value) || "").trim();
  });
  if (headers[1] !== "id") return found;
  ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum <= 2) return;
    const id = String(rawCell(row.getCell(1).value) || "").trim();
    if (!id || id === "не менять") return;
    const spec = schema.SPECIES_IDS.find((s) => s.id === id);
    if (!spec) throw new Error(`вкладка Виды: неизвестный id «${id}»`);
    for (let c = 3; c < headers.length; c++) {
      const key = headers[c];
      if (!key || !spec.fields.includes(key)) continue;
      found.push({
        path: `species.units.${id}.${key}`,
        value: rawCell(row.getCell(c).value),
        type: "number",
        importFlag: "да",
        sheet: "Виды"
      });
    }
  });
  return found;
}

function collectWorkbookEdits(wb) {
  const edits = [];
  for (const ws of wb.worksheets) {
    if (ws.name === "Инструкция") continue;
    if (ws.name === "Виды") edits.push(...readSpeciesSheet(ws));
    else edits.push(...readKvSheet(ws));
  }
  return edits;
}

function resolveEdits(tables, edits) {
  const groups = new Map();
  for (const edit of edits) {
    const meta = schema.paramByPath(edit.path);
    if (!meta) continue;
    if (!meta.import) continue;
    const flag = String(edit.importFlag || "да").trim().toLowerCase();
    if (["нет", "no", "false", "0"].includes(flag)) continue;
    let parsed;
    try {
      parsed = parseTyped(edit.value, meta.type || edit.type || "number");
    } catch (err) {
      throw new Error(`${edit.sheet} · ${edit.path}: ${err.message}`);
    }
    if (parsed === SKIP_EMPTY) continue;
    if (!groups.has(edit.path)) groups.set(edit.path, []);
    groups.get(edit.path).push({ ...edit, parsed, meta });
  }

  const applied = [];
  const conflicts = [];
  for (const [pathKey, list] of groups) {
    const original = schema.getByPath(tables, pathKey);
    const uniq = [];
    for (const item of list) {
      if (!uniq.some((v) => valuesEqual(v, item.parsed))) uniq.push(item.parsed);
    }
    let next;
    if (uniq.length === 1) next = uniq[0];
    else {
      const changed = uniq.filter((v) => !valuesEqual(v, original));
      if (changed.length === 1) next = changed[0];
      else {
        conflicts.push({
          path: pathKey,
          values: list.map((i) => `${i.sheet}=${i.parsed}`).join(", ")
        });
        continue;
      }
    }
    if (!valuesEqual(next, original)) {
      applied.push({ path: pathKey, from: original, to: next, meta: list[0].meta });
    }
  }
  if (conflicts.length) {
    const msg = conflicts.map((c) => `  ${c.path}: ${c.values}`).join("\n");
    throw new Error(`Конфликт: одно и то же поле поправлено по-разному.\n${msg}`);
  }
  return applied;
}

function applyEdits(tables, applied) {
  const next = cloneTables(tables);
  for (const edit of applied) schema.setByPath(next, edit.path, edit.to);
  return next;
}

async function importXlsx(inPath, options = {}) {
  if (!fs.existsSync(inPath)) throw new Error(`нет файла ${inPath}`);
  const { tables } = tablesFromEngine();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(inPath);
  const edits = collectWorkbookEdits(wb);
  const applied = resolveEdits(tables, edits);
  const next = applyEdits(tables, applied);
  if (!options.dry) {
    const changed = new Set(applied.map((row) => row.path.split(".")[0]));
    for (const domain of TABLE_DOMAINS) {
      if (!changed.has(domain) || !next[domain]) continue;
      writeDomainFile(domain, next[domain]);
    }
  }
  return { applied, tables: next, file: inPath };
}

async function main(argv) {
  const args = argv.slice(2);
  const cmd = args[0] === "import" || args[0] === "export" ? args[0] : "export";
  const fileArg = args[0] === "import" || args[0] === "export" ? args[1] : args[0];
  const file = path.resolve(fileArg || DEFAULT_XLSX);
  if (cmd === "export") {
    const { tables } = tablesFromEngine();
    const missing = schema.missingFromSchema(tables);
    if (missing.length) {
      console.warn("В схеме нет ключей (добавь в tools/balance-schema.cjs):");
      for (const key of missing) console.warn(`  ${key}`);
    }
    await exportXlsx(file, tables);
    const n = schema.ALL_PARAMS.filter((p) => p.import).length;
    console.log(`Выгружено ${n} живых параметров → ${file}`);
    return;
  }
  const result = await importXlsx(file);
  if (!result.applied.length) {
    console.log("Изменений нет.");
    return;
  }
  console.log(`Влито ${result.applied.length} правок из ${file}:`);
  for (const row of result.applied) {
    console.log(`  ${row.path}: ${row.from} → ${row.to}`);
  }
}

module.exports = {
  DEFAULT_XLSX,
  exportXlsx,
  importXlsx,
  tablesFromEngine,
  resolveEdits,
  applyEdits,
  collectWorkbookEdits,
  writeDomainFile
};

if (require.main === module) {
  main(process.argv).catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
