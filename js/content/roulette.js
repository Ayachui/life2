/** Колесо рулетки: подписи и UI-математика угла. Симуляция события — js/sim/arcade.js.
 *
 * Геометрия (как CSS): стрелка сверху, conic-gradient from 0deg = 12 часов,
 * сектора по часовой, transform: rotate() тоже по часовой.
 * Чтобы центр сектора C оказался под стрелкой, колесо крутят на (360 − C).
 */
(function (root) {
  const C = root.LIFE_CONTENT || (root.LIFE_CONTENT = {});
  C.rouletteLabels = {
    earthquake: { icon: "🌋", title: "Землетрясение", desc: "Экран трясётся. Пропадает 10–30% всех растений." },
    flood: { icon: "🌊", title: "Наводнение", desc: "Вода заполняет 10–50% свободных клеток в чашке." },
    plague: { icon: "☠️", title: "Мор", desc: "Зелёный туман. Погибает 10–30% зверей." },
    evolution: { icon: "🧬", title: "Эволюционный скачок", desc: "Редко: 50–100% зайцев и лис мутируют на уровень выше." }
  };

  const ROULETTE_SLICE_CENTER = {
    earthquake: 45,
    flood: 135,
    plague: 225,
    evolution: 315
  };

  function rouletteAngleAtPointer(rotationDeg) {
    const rot = ((rotationDeg % 360) + 360) % 360;
    return (360 - rot) % 360;
  }

  function rouletteSliceAtPointer(rotationDeg) {
    const local = rouletteAngleAtPointer(rotationDeg);
    if (local < 90) return "earthquake";
    if (local < 180) return "flood";
    if (local < 270) return "plague";
    return "evolution";
  }

  function rouletteSpinDegrees(event, rng = Math.random) {
    const center = ROULETTE_SLICE_CENTER[event] ?? ROULETTE_SLICE_CENTER.earthquake;
    const turns = 5 + Math.floor(rng() * 2);
    const jitter = (rng() - 0.5) * 36;
    const stop = (360 - center) % 360;
    return turns * 360 + stop + jitter;
  }

  C.ROULETTE_SLICE_CENTER = ROULETTE_SLICE_CENTER;
  C.rouletteAngleAtPointer = rouletteAngleAtPointer;
  C.rouletteSliceAtPointer = rouletteSliceAtPointer;
  C.rouletteSpinDegrees = rouletteSpinDegrees;

  if (typeof window !== "undefined") {
    window.ROULETTE_SLICE_CENTER = ROULETTE_SLICE_CENTER;
    window.rouletteAngleAtPointer = rouletteAngleAtPointer;
    window.rouletteSliceAtPointer = rouletteSliceAtPointer;
    window.rouletteSpinDegrees = rouletteSpinDegrees;
  }
})(typeof window !== "undefined" ? window : globalThis);
