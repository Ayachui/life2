/** Метаданные билда. Числа механик — в остальных таблицах. */
(function (root) {
  const T = root.LIFE_TABLES || (root.LIFE_TABLES = {});
  T.meta = {
    version: { stage: "alpha", major: 0, minor: 18, patch: 0 }
  };
})(typeof window !== "undefined" ? window : globalThis);
