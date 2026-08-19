/**
 * Порядок загрузки. Браузер: те же пути в index.html.
 * Канон data-driven: таблицы → каталог → контент → системы симуляции → UI.
 */
const LIFE_BOOT_SCRIPTS = [
  "js/tables/meta.js",
  "js/tables/economy.js",
  "js/tables/scoring.js",
  "js/tables/species.js",
  "js/tables/ecology.js",
  "js/tables/arcade.js",
  "js/balance.js",
  "js/content/tools.js",
  "js/content/rules.js",
  "js/content/help.js",
  "js/content/roulette.js",
  "js/data.js",
  "js/sim/types.js",
  "js/sim/world.js",
  "js/sim/scoring.js",
  "js/sim/economy.js",
  "js/sim/ecology.js",
  "js/sim/arcade.js",
  "js/sim/life.js",
  "js/engine.js"
];

if (typeof module !== "undefined" && module.exports) {
  module.exports = { LIFE_BOOT_SCRIPTS };
}
