/**
 * Каталог баланса для Excel: путь в LIFE_TABLES, вкладка, смысл.
 * Движок читает js/tables/* — этот файл только для выгрузки/загрузки xlsx.
 */
function p(path, label, hint, extra = {}) {
  return {
    path,
    label,
    hint,
    sheet: extra.sheet,
    type: extra.type || "number",
    unit: extra.unit || "",
    import: extra.import !== false
  };
}

const SPECIES_IDS = [
  { id: "rabbit", label: "заяц", fields: ["energy", "drain", "thresh", "vision", "moveInterval", "litter", "hueMin", "hueRange"] },
  { id: "fox", label: "лиса", fields: ["energy", "drain", "thresh", "vision", "moveInterval", "litter", "hueMin", "hueRange"] },
  { id: "bear", label: "медведь", fields: ["energy", "drain", "thresh", "vision", "moveInterval", "litter", "hueMin", "hueRange"] },
  { id: "koala", label: "коала", fields: ["energy", "drain", "thresh", "vision", "moveInterval", "litter", "litterOnTree", "hue"] },
  { id: "cow", label: "корова", fields: ["energy", "drain", "thresh", "vision", "moveInterval", "litter", "hue"] },
  { id: "wolf", label: "волк", fields: ["energy", "drain", "thresh", "vision", "moveInterval", "litter", "hue"] },
  { id: "elk", label: "лось", fields: ["energy", "drain", "thresh", "vision", "moveInterval", "litter", "hue"] },
  { id: "krol", label: "крол-душегуб", fields: ["energy", "drain", "thresh", "vision", "moveInterval", "litter", "movesPerTick", "lifespan", "deathSpawn", "size", "hue"] }
];

const SPECIES_FIELDS = [
  { key: "energy", label: "сытость", hint: "Стартовая энергия при появлении." },
  { key: "drain", label: "голод/цикл", hint: "Сколько энергии съедает каждый цикл. Выше — быстрее голодает." },
  { key: "thresh", label: "порог сытости", hint: "Ниже порога зверь ищет еду, выше — может размножаться." },
  { key: "vision", label: "зрение", hint: "Дальность поиска еды/цели в клетках." },
  { key: "moveInterval", label: "шаг", hint: "Ходит раз в N циклов. 1 = каждый цикл, 4 = вчетверо медленнее." },
  { key: "litter", label: "помёт", hint: "Сколько детёнышей за одну удачную попытку размножения." },
  { key: "litterOnTree", label: "помёт на дереве", hint: "Только коала: доп. помёт, если сидит на дереве." },
  { key: "hueMin", label: "цвет min", hint: "Нижняя граница оттенка (визуал, не баланс)." },
  { key: "hueRange", label: "цвет span", hint: "Разброс оттенка (визуал, не баланс)." },
  { key: "hue", label: "цвет", hint: "Фиксированный оттенок мутанта (визуал, не баланс)." },
  { key: "movesPerTick", label: "ходов/цикл", hint: "Только крол: сколько шагов за один цикл." },
  { key: "lifespan", label: "жизнь", hint: "Только крол: циклов до смерти." },
  { key: "deathSpawn", label: "трава при смерти", hint: "Только крол: сколько травы сеется, когда умирает." },
  { key: "size", label: "размер", hint: "Только крол: занимает size×size клеток." }
];

function speciesUnitParams() {
  const out = [];
  const byKey = Object.fromEntries(SPECIES_FIELDS.map((f) => [f.key, f]));
  for (const s of SPECIES_IDS) {
    for (const key of s.fields) {
      const f = byKey[key];
      out.push(p(
        `species.units.${s.id}.${f.key}`,
        `${s.label} · ${f.label}`,
        f.hint,
        { sheet: "Виды" }
      ));
    }
  }
  return out;
}

const PARAMS = [
  p("meta.version.stage", "стадия", "alpha / beta / release. Не трогай — версию ставит агент при выкладке.", { sheet: "Версия", type: "string", import: false }),
  p("meta.version.major", "мажор", "Крупный релиз. Не трогай.", { sheet: "Версия", import: false }),
  p("meta.version.minor", "минор", "Новая механика / зверь / крупный ребаланс. Не трогай.", { sheet: "Версия", import: false }),
  p("meta.version.patch", "патч", "Тексты, мелкий баланс, багфикс. Не трогай.", { sheet: "Версия", import: false }),

  p("economy.tools.plant", "трава", "Цена кисти растения. База пирамиды.", { sheet: "Цены", unit: "⚡" }),
  p("economy.tools.herb", "заяц", "Цена кисти зайца.", { sheet: "Цены", unit: "⚡" }),
  p("economy.tools.pred", "лиса", "Цена кисти лисы. Нельзя ставить, пока мало зайцев.", { sheet: "Цены", unit: "⚡" }),
  p("economy.tools.bear", "медведь", "Цена кисти медведя. Только после устойчивой цепочки.", { sheet: "Цены", unit: "⚡" }),
  p("economy.tools.water", "вода", "Цена водоёма. У берега растения растут быстрее.", { sheet: "Цены", unit: "⚡" }),
  p("economy.tools.wall", "камень", "Цена камня-забора.", { sheet: "Цены", unit: "⚡" }),
  p("economy.tools.inspect", "осмотр", "Цена лупы. Обычно 0.", { sheet: "Цены", unit: "⚡" }),
  p("economy.tools.erase", "ластик", "Цена стирания. Обычно 0.", { sheet: "Цены", unit: "⚡" }),

  p("economy.difficulties.easy", "лёгкий", "Стартовый запас ⚡ на лёгком.", { sheet: "Сложность", unit: "⚡" }),
  p("economy.difficulties.medium", "средний", "Стартовый запас ⚡ на среднем.", { sheet: "Сложность", unit: "⚡" }),
  p("economy.difficulties.hard", "сложный", "Стартовый запас ⚡ на сложном.", { sheet: "Сложность", unit: "⚡" }),
  p("economy.difficulties.hardcore", "хардкор", "Стартовый запас ⚡ на хардкоре. Должен едва хватать на траву+зайца+лису.", { sheet: "Сложность", unit: "⚡" }),

  p("economy.arcadeEnergy.plantSprout", "росток ⚡", "Награда ⚡ за появление травы. 0 = очки идут только через пирамиду/пульс.", { sheet: "Энергия_событий", unit: "⚡" }),
  p("economy.arcadeEnergy.plantEvolveGrass", "куст ⚡", "Награда ⚡ за эволюцию в куст. Сейчас 0.", { sheet: "Энергия_событий", unit: "⚡" }),
  p("economy.arcadeEnergy.plantEvolveBush", "дерево ⚡", "Награда ⚡ за эволюцию в дерево. Сейчас 0.", { sheet: "Энергия_событий", unit: "⚡" }),
  p("economy.arcadeEnergy.plantWilt", "увядание ⚡", "Награда ⚡ за гибель дерева. Сейчас 0.", { sheet: "Энергия_событий", unit: "⚡" }),
  p("economy.arcadeEnergy.animalBirth", "рождение ⚡", "Награда ⚡ за рождение зверя. Сейчас 0.", { sheet: "Энергия_событий", unit: "⚡" }),
  p("economy.arcadeEnergy.animalDeath", "смерть ⚡", "Награда ⚡ за смерть зверя. Сейчас 0.", { sheet: "Энергия_событий", unit: "⚡" }),
  p("economy.arcadeEnergy.hunt", "охота ⚡", "Награда ⚡ за удачную охоту. Сейчас 0 — охота даёт очки, не бюджет.", { sheet: "Энергия_событий", unit: "⚡" }),
  p("economy.arcadeEnergy.krolDevour", "крол жрёт ⚡", "Награда ⚡ за зону крола. Сейчас 0.", { sheet: "Энергия_событий", unit: "⚡" }),
  p("economy.arcadeEnergy.fertilize", "удобрение ⚡", "Награда ⚡ за помёт лося. Сейчас 0.", { sheet: "Энергия_событий", unit: "⚡" }),
  p("economy.arcadeEnergy.koalaTreeBite", "коала грызёт ⚡", "Награда ⚡ за укус коалы по дереву. Сейчас 0.", { sheet: "Энергия_событий", unit: "⚡" }),

  p("economy.arcadeEconomy.maxEnergyPerGen", "потолок ⚡/цикл", "Максимум ⚡, который можно получить за один цикл (пульс+награды).", { sheet: "Экономика_пульса", unit: "⚡" }),
  p("economy.arcadeEconomy.discoveryOnlyMutation", "мутация один раз", "true: ⚡ за мутацию только при первом открытии вида в раунде.", { sheet: "Экономика_пульса", type: "boolean" }),
  p("economy.arcadeEconomy.surplusDecay", "гниение лишнего", "Доля лишней ⚡ сверх стартового бюджета, сгорающая за цикл. 0 = выключено.", { sheet: "Экономика_пульса" }),
  p("economy.arcadeEconomy.pulsePerGen", "пульс", "⚡ за цикл, пока живы зайцы. Копится в аккумуляторе, выдаётся целыми.", { sheet: "Экономика_пульса", unit: "⚡/цикл" }),
  p("economy.arcadeEconomy.pyramidPulse", "пульс пирамиды", "Добавка к пульсу, если есть хищник и растения (живая цепочка).", { sheet: "Экономика_пульса", unit: "⚡/цикл" }),
  p("economy.arcadeEconomy.pulseCap", "потолок до лисы", "Максимум запаса ⚡, пока в устойчивой цепочке нет хищника.", { sheet: "Экономика_пульса", unit: "⚡" }),
  p("economy.arcadeEconomy.pulseCapApex", "потолок после лисы", "Максимум запаса ⚡ после лисы/медведя в устойчивой цепочке.", { sheet: "Экономика_пульса", unit: "⚡" }),
  p("economy.arcadeEconomy.upkeep.freeBiomass", "бесплатная биомасса", "Растения+звери до этого числа не жрут upkeep.", { sheet: "Экономика_пульса" }),
  p("economy.arcadeEconomy.upkeep.perExtra", "upkeep за лишнего", "Списывается floor(лишние × это), но не больше max. Только при запасе выше потолка пульса.", { sheet: "Экономика_пульса" }),
  p("economy.arcadeEconomy.upkeep.max", "upkeep потолок", "Максимум списания upkeep за цикл. 0 = выключено.", { sheet: "Экономика_пульса", unit: "⚡" }),

  p("economy.mutationEnergy.крол-душегуб", "крол ⚡", "Сырой бонус ⚡ за первое открытие крола. Реально выдаётся × payoutMul × ecoMul.", { sheet: "Мутации_энергия", unit: "⚡" }),
  p("economy.mutationEnergy.коала", "коала ⚡", "Сырой бонус ⚡ за первое открытие коалы.", { sheet: "Мутации_энергия", unit: "⚡" }),
  p("economy.mutationEnergy.корова", "корова ⚡", "Сырой бонус ⚡ за первое открытие коровы.", { sheet: "Мутации_энергия", unit: "⚡" }),
  p("economy.mutationEnergy.волк", "волк ⚡", "Сырой бонус ⚡ за первое открытие волка.", { sheet: "Мутации_энергия", unit: "⚡" }),
  p("economy.mutationEnergy.лось", "лось ⚡", "Сырой бонус ⚡ за первое открытие лося.", { sheet: "Мутации_энергия", unit: "⚡" }),
  p("economy.mutationEnergyPayoutMul", "выплата мутации", "Множитель сырого бонуса мутации. 0.5 = половина таблицы.", { sheet: "Мутации_энергия" }),

  p("scoring.evolutionTiers.plant.sprout", "тир ростка", "Тир события «появилась трава». Очки: round(base × тир × plant × genMul).", { sheet: "Тиры" }),
  p("scoring.evolutionTiers.plant.evolveGrass", "тир куста", "Тир эволюции трава→куст.", { sheet: "Тиры" }),
  p("scoring.evolutionTiers.plant.evolveBush", "тир дерева", "Тир эволюции куст→дерево.", { sheet: "Тиры" }),
  p("scoring.evolutionTiers.plant.wilt", "тир увядания", "Тир гибели дерева.", { sheet: "Тиры" }),
  p("scoring.evolutionTiers.plant.fertilize", "тир удобрения", "Тир помёта лося.", { sheet: "Тиры" }),
  p("scoring.evolutionTiers.agent.rabbit", "тир зайца", "Тир зайца в формуле очков рождения/смерти/охоты.", { sheet: "Тиры" }),
  p("scoring.evolutionTiers.agent.koala", "тир коалы", "Тир коалы.", { sheet: "Тиры" }),
  p("scoring.evolutionTiers.agent.cow", "тир коровы", "Тир коровы.", { sheet: "Тиры" }),
  p("scoring.evolutionTiers.agent.fox", "тир лисы", "Тир лисы.", { sheet: "Тиры" }),
  p("scoring.evolutionTiers.agent.wolf", "тир волка", "Тир волка.", { sheet: "Тиры" }),
  p("scoring.evolutionTiers.agent.elk", "тир лося", "Тир лося.", { sheet: "Тиры" }),
  p("scoring.evolutionTiers.agent.bear", "тир медведя", "Тир медведя.", { sheet: "Тиры" }),
  p("scoring.evolutionTiers.agent.krol", "тир крола", "Тир крол-душегуба.", { sheet: "Тиры" }),

  p("scoring.lifePointScale.base", "база очков", "База формулы: round(base × тир × множитель события × genMul).", { sheet: "Очки" }),
  p("scoring.lifePointScale.birth", "множитель рождения", "Множитель события birth.", { sheet: "Очки" }),
  p("scoring.lifePointScale.death", "множитель смерти", "Множитель события death.", { sheet: "Очки" }),
  p("scoring.lifePointScale.plant", "множитель растения", "Множитель растительных событий.", { sheet: "Очки" }),
  p("scoring.lifePointScale.mutation", "бонус мутации", "Очки мутации: round(это × тир вида × genMul), затем ecoMul.", { sheet: "Очки" }),
  p("scoring.lifePointScale.activity", "множитель активности", "Зарезервирован под activity (сейчас почти не используется).", { sheet: "Очки" }),
  p("scoring.lifePointScale.genBonus", "бонус поколения", "genMul = 1 + genBonus × (поколение−1), поколение ограничено genCap.", { sheet: "Очки" }),
  p("scoring.lifePointScale.genCap", "потолок поколения", "Максимальное поколение, которое крутит genMul.", { sheet: "Очки" }),
  p("scoring.lifePointScale.survival", "выживание", "Очки каждые survivalPointInterval циклов при живой цепочке (хищник + растения + зайцы).", { sheet: "Очки" }),
  p("scoring.lifePointScale.survivalPyramid", "пирамида выживания", "Множитель survival, если есть и хищник, и растения.", { sheet: "Очки" }),
  p("scoring.lifePointScale.survivalAgePer", "шаг возраста", "Каждые N циклов survival растёт на survivalAgeBonus, пока не упрётся в cap.", { sheet: "Очки", unit: "циклов" }),
  p("scoring.lifePointScale.survivalAgeBonus", "бонус возраста", "Добавка к множителю survival за каждый шаг возраста.", { sheet: "Очки" }),
  p("scoring.lifePointScale.survivalAgeCap", "потолок возраста", "Максимум суммарного бонуса возраста (1 + min(cap, steps×bonus)).", { sheet: "Очки" }),

  p("scoring.formulas.huntEnergyGain", "сытость с охоты", "Сколько энергии получает охотник, съев жертву (не ⚡ игрока).", { sheet: "Формулы" }),
  p("scoring.formulas.processedEnergy.base", "очки еды: база", "Вес очков за съеденную энергию: base + тирЕдока×eaterTier + тирЕды×foodTier.", { sheet: "Формулы" }),
  p("scoring.formulas.processedEnergy.eaterTier", "очки еды: едок", "Вклад тира охотника в очки за переработанную энергию.", { sheet: "Формулы" }),
  p("scoring.formulas.processedEnergy.foodTier", "очки еды: еда", "Вклад тира пищи в очки за переработанную энергию.", { sheet: "Формулы" }),
  p("scoring.formulas.ecosystemMul.herbShareFull", "полная доля зайцев", "Если зайцы/(зайцы+хищники) ≥ этого — ecoMul=1 (очки и ⚡ не режутся).", { sheet: "Формулы" }),
  p("scoring.formulas.ecosystemMul.minMul", "минимум ecoMul", "Нижний предел множителя, когда зайцев мало относительно хищников.", { sheet: "Формулы" }),
  p("scoring.formulas.ecosystemMul.ratioScale", "шкала ecoMul", "ecoMul = max(minMul, min(1, доляЗайцев × это)), если доля ниже полной.", { sheet: "Формулы" }),

  ...speciesUnitParams(),

  p("species.traitIds.KROL", "id крола", "Строковый id вида в движке. Менять нельзя — сломается код.", { sheet: "Мутации", type: "string", import: false }),
  p("species.traitIds.KOALA", "id коалы", "Строковый id вида. Не менять.", { sheet: "Мутации", type: "string", import: false }),
  p("species.traitIds.COW", "id коровы", "Строковый id вида. Не менять.", { sheet: "Мутации", type: "string", import: false }),
  p("species.traitIds.WOLF", "id волка", "Строковый id вида. Не менять.", { sheet: "Мутации", type: "string", import: false }),
  p("species.traitIds.ELK", "id лося", "Строковый id вида. Не менять.", { sheet: "Мутации", type: "string", import: false }),
  p("species.mutationChance.krol", "шанс крола", "Шанс мутации зайца в крола. Итог: min(1, шанс × mutationGenBase^(поколение−1)).", { sheet: "Мутации" }),
  p("species.mutationChance.koala", "шанс коалы", "Шанс мутации зайца в коалу. Растёт с поколением.", { sheet: "Мутации" }),
  p("species.mutationChance.cow", "шанс коровы", "Шанс мутации зайца в корову. Растёт с поколением.", { sheet: "Мутации" }),
  p("species.mutationChance.wolf", "шанс волка", "Шанс мутации лисы в волка. Растёт с поколением.", { sheet: "Мутации" }),
  p("species.mutationChance.elk", "шанс лося", "Шанс мутации лисы в лося. Растёт с поколением.", { sheet: "Мутации" }),
  p("species.mutationGenBase", "рост шанса", "Основание экспоненты: каждое следующее поколение умножает шанс на это (2 = ×2 за поколение).", { sheet: "Мутации" }),

  p("species.breed.minAge.herb", "возраст зайца", "Минимальный возраст зайца для размножения (кроме коалы/коровы).", { sheet: "Размножение", unit: "циклов" }),
  p("species.breed.minAge.pred", "возраст лисы", "Минимальный возраст лисы для размножения (кроме волка).", { sheet: "Размножение", unit: "циклов" }),
  p("species.breed.minAge.koala", "возраст коалы", "Минимальный возраст коалы. Коала плодится только на дереве/кусте.", { sheet: "Размножение", unit: "циклов" }),
  p("species.breed.minAge.cow", "возраст коровы", "Минимальный возраст коровы.", { sheet: "Размножение", unit: "циклов" }),
  p("species.breed.minAge.wolf", "возраст волка", "Минимальный возраст волка.", { sheet: "Размножение", unit: "циклов" }),
  p("species.breed.coolInit.herb", "пауза зайца", "Начальная пауза размножения у посаженного зайца.", { sheet: "Размножение", unit: "циклов" }),
  p("species.breed.coolInit.pred", "пауза лисы", "Начальная пауза размножения у посаженной лисы.", { sheet: "Размножение", unit: "циклов" }),
  p("species.breed.coolAfter.herb", "отдых зайца", "Пауза после удачного помёта у зайца.", { sheet: "Размножение", unit: "циклов" }),
  p("species.breed.coolAfter.pred", "отдых лисы", "Пауза после удачного помёта у лисы.", { sheet: "Размножение", unit: "циклов" }),
  p("species.breed.coolAfter.koala", "отдых коалы", "Пауза после удачного помёта у коалы.", { sheet: "Размножение", unit: "циклов" }),
  p("species.breed.energyRetain", "энергия после родов", "Доля сытости, которая остаётся родителю после размножения (0.5 = половина).", { sheet: "Размножение" }),
  p("species.breed.herbCrowd.soft", "зайцы soft", "Если зайцев > (трава + куст×bushFoodWeight) × это — шанс помёта = chanceSoft.", { sheet: "Размножение" }),
  p("species.breed.herbCrowd.hard", "зайцы hard", "Если зайцев > еда × это — шанс помёта = chanceHard.", { sheet: "Размножение" }),
  p("species.breed.herbCrowd.chanceSoft", "шанс soft", "Шанс размножения зайца при мягкой толпе.", { sheet: "Размножение" }),
  p("species.breed.herbCrowd.chanceHard", "шанс hard", "Шанс размножения зайца при жёсткой толпе.", { sheet: "Размножение" }),
  p("species.breed.koalaCrowd.soft", "коалы soft", "Если коалы/вместимость чащи ≥ это — шанс = chanceSoft.", { sheet: "Размножение" }),
  p("species.breed.koalaCrowd.hard", "коалы hard", "Если коалы/вместимость ≥ это — шанс = chanceHard.", { sheet: "Размножение" }),
  p("species.breed.koalaCrowd.chanceSoft", "коалы шанс soft", "Шанс помёта коалы при мягкой толпе.", { sheet: "Размножение" }),
  p("species.breed.koalaCrowd.chanceHard", "коалы шанс hard", "Шанс помёта коалы при жёсткой толпе.", { sheet: "Размножение" }),
  p("species.breed.predRatio.r1", "лисы/зайцы ≥", "Если хищники/зайцы ≥ этого (обычно 1:1) — шанс помёта = c1.", { sheet: "Размножение" }),
  p("species.breed.predRatio.c1", "шанс при 1:1", "Шанс размножения лисы, когда хищников почти столько же, сколько зайцев.", { sheet: "Размножение" }),
  p("species.breed.predRatio.r05", "лисы/зайцы ≥ 0.5", "Порог 1 лиса на 2 зайцев.", { sheet: "Размножение" }),
  p("species.breed.predRatio.c05", "шанс при 1:2", "Шанс размножения лисы на пороге 0.5.", { sheet: "Размножение" }),
  p("species.breed.predRatio.r025", "лисы/зайцы ≥ 0.25", "Порог 1 лиса на 4 зайцев.", { sheet: "Размножение" }),
  p("species.breed.predRatio.c025", "шанс при 1:4", "Шанс размножения лисы на пороге 0.25. Ниже порогов шанс = 1.", { sheet: "Размножение" }),

  p("species.behavior.wolfSolitude", "одиночество волка", "Волк держит дистанцию до других волков (клетки).", { sheet: "Поведение", unit: "клеток" }),
  p("species.behavior.elkPoopInterval", "интервал помёта", "Лось удобряет каждые N ходов.", { sheet: "Поведение", unit: "ходов" }),
  p("species.behavior.koalaHideRange", "прятки коалы", "Радиус поиска чащи, когда коала прячется.", { sheet: "Поведение", unit: "клеток" }),
  p("species.behavior.koalaPerchCapacity.tree", "слот дерева", "Одно дерево даёт столько «мест» коалам.", { sheet: "Поведение" }),
  p("species.behavior.koalaPerchCapacity.bush", "слот куста", "Один куст даёт столько «мест» коалам.", { sheet: "Поведение" }),
  p("species.behavior.koalaPerchCapacity.max", "потолок коал", "Жёсткий максимум коал на поле, даже если чаща огромная.", { sheet: "Поведение" }),
  p("species.behavior.skillBoostMul", "буст навыка", "Множитель зрения/скорости, если у зверя включён skillBoost (рулетка эволюции).", { sheet: "Поведение" }),

  p("ecology.plants.grassToBush", "трава→куст", "Возраст травы, после которого она становится кустом.", { sheet: "Растения", unit: "циклов" }),
  p("ecology.plants.bushToTree", "куст→дерево", "Возраст куста, после которого он становится деревом.", { sheet: "Растения", unit: "циклов" }),
  p("ecology.plants.treeLife", "жизнь дерева", "Возраст дерева до увядания. После смерти остаётся 1 трава.", { sheet: "Растения", unit: "циклов" }),
  p("ecology.plants.bushSpread", "сев куста", "Шанс за цикл, что куст посеет траву на соседней клетке (ещё множится обновлением поля).", { sheet: "Растения" }),
  p("ecology.plants.bushFoodWeight", "вес куста как еды", "Куст считается как эта доля «травы» в формуле толпы зайцев.", { sheet: "Растения" }),
  p("ecology.plants.bushViabilityWeight", "вес куста в жизни", "Как куст учитывается в оценке «поле живое» (HUD/витальность).", { sheet: "Растения" }),
  p("ecology.plants.grassBites", "укусы травы", "Сколько укусов, чтобы съесть клетку травы.", { sheet: "Растения" }),
  p("ecology.plants.bushBites", "укусы куста", "Сколько укусов, чтобы съесть куст.", { sheet: "Растения" }),
  p("ecology.plants.grassEnergy", "сытость с травы", "Полная энергия с клетки травы (делится на укусы).", { sheet: "Растения" }),
  p("ecology.plants.bushEnergyPerBite", "сытость с куста", "Энергия за один укус куста.", { sheet: "Растения" }),
  p("ecology.plants.treeBitesCow", "укусы коровы", "Запас укусов дерева для коровы (ещё × укусов за цикл).", { sheet: "Растения" }),
  p("ecology.plants.treeBitesElk", "укусы лося", "Запас укусов дерева для лося.", { sheet: "Растения" }),
  p("ecology.plants.treeEnergyPerBite", "сытость с дерева", "Базовая энергия за укус дерева (лось и прочие).", { sheet: "Растения" }),
  p("ecology.plants.treeEnergyPerBiteCow", "сытость коровы", "Энергия за укус дерева коровой.", { sheet: "Растения" }),
  p("ecology.plants.treeBitesPerTickCow", "укусы коровы/цикл", "Сколько укусов дерева корова делает за цикл (~4 цикла на дерево при 10×3).", { sheet: "Растения" }),
  p("ecology.plants.bushToTreeGrass", "сев при дереве", "Сколько трав куст сеет на соседей в момент превращения в дерево.", { sheet: "Растения" }),
  p("ecology.plants.treeEnergyPerBiteKoala", "сытость коалы", "Энергия коалы за укус листвы. Дерево от коалы не умирает.", { sheet: "Растения" }),

  p("ecology.decay.herb.radius", "падаль зайца R", "Радиус удобрения, когда умирает заяц/коала/корова.", { sheet: "Поле", unit: "клеток" }),
  p("ecology.decay.herb.strength", "падаль зайца %", "Сила удобрения падали травоядного.", { sheet: "Поле" }),
  p("ecology.decay.herb.ttl", "падаль зайца TTL", "Сколько циклов лежит падаль травоядного.", { sheet: "Поле", unit: "циклов" }),
  p("ecology.decay.pred.radius", "падаль лисы R", "Радиус падали лисы/волка.", { sheet: "Поле", unit: "клеток" }),
  p("ecology.decay.pred.strength", "падаль лисы %", "Сила удобрения падали хищника.", { sheet: "Поле" }),
  p("ecology.decay.pred.ttl", "падаль лисы TTL", "Время падали хищника.", { sheet: "Поле", unit: "циклов" }),
  p("ecology.decay.bear.radius", "падаль медведя R", "Радиус падали медведя.", { sheet: "Поле", unit: "клеток" }),
  p("ecology.decay.bear.strength", "падаль медведя %", "Сила падали медведя.", { sheet: "Поле" }),
  p("ecology.decay.bear.ttl", "падаль медведя TTL", "Время падали медведя.", { sheet: "Поле", unit: "циклов" }),
  p("ecology.fertilizer.ttl", "удобрение TTL", "Сколько циклов работает помёт лося.", { sheet: "Поле", unit: "циклов" }),
  p("ecology.fertilizer.strength", "удобрение %", "Бонус роста от помёта лося (0.3 = +30%).", { sheet: "Поле" }),
  p("ecology.mushrooms.cowInterval", "грибы: интервал", "Корова пытается посадить гриб каждые N циклов.", { sheet: "Поле", unit: "циклов" }),
  p("ecology.mushrooms.cowChance", "грибы: шанс", "Шанс посадки гриба в этот интервал.", { sheet: "Поле" }),
  p("ecology.mushrooms.energy", "грибы: сытость", "Энергия с гриба.", { sheet: "Поле" }),
  p("ecology.water.slowMul", "вода: медленнее", "Звери на воде ходят в это число раз реже (2 = вдвое медленнее).", { sheet: "Поле" }),
  p("ecology.water.growthMul", "вода: рост", "Растения у берега растут в это число раз быстрее.", { sheet: "Поле" }),
  p("ecology.terrain.waterMax", "лимит воды", "Максимальная доля площади чашки под водой при генерации/лимите кисти.", { sheet: "Поле" }),
  p("ecology.terrain.wallMax", "лимит камня", "Максимальная доля площади под камнем.", { sheet: "Поле" }),

  p("arcade.arcadeEnd.staleAfter", "пусто + нет ⚡", "Конец раунда: нет зверей, бюджет не тянет зайца, столько циклов подряд.", { sheet: "Конец_раунда", unit: "циклов" }),
  p("arcade.arcadeEnd.lonelyMax", "пустое поле", "Конец: поле без зверей столько циклов (даже если ⚡ ещё есть).", { sheet: "Конец_раунда", unit: "циклов" }),
  p("arcade.arcadeEnd.noHerbMax", "без зайцев", "Конец: нет зайцев столько циклов (если нет хищников — этот лимит).", { sheet: "Конец_раунда", unit: "циклов" }),
  p("arcade.arcadeEnd.predOnlyMax", "хищники без зайцев", "Конец: есть хищники, но зайцев нет столько циклов.", { sheet: "Конец_раунда", unit: "циклов" }),
  p("arcade.arcadeEnd.chainSustainGens", "цепочка", "Столько циклов подряд с зайцами = устойчивая цепочка (открывает медведя и эру).", { sheet: "Конец_раунда", unit: "циклов" }),
  p("arcade.arcadeEnd.noAnimalRenewalGens", "затухание травы", "Без зайцев рост растений линейно гаснет до нуля за столько циклов.", { sheet: "Конец_раунда", unit: "циклов" }),
  p("arcade.arcadeEnd.survivalPointInterval", "интервал выживания", "Раз в столько циклов начисляются очки survival при живой пирамиде.", { sheet: "Конец_раунда", unit: "циклов" }),
  p("arcade.arcadeEnd.eraAfterChain", "длина эры", "После устойчивой цепочки ещё столько циклов — и раунд кончается победой. 0 = бесконечная ферма.", { sheet: "Конец_раунда", unit: "циклов" }),

  p("arcade.roulette.interval", "интервал рулетки", "Рулетка давления каждые N циклов.", { sheet: "Рулетка", unit: "циклов" }),
  p("arcade.roulette.weights.earthquake", "вес землетрясения", "Относительный шанс события. Сумма весов = 100% рулетки.", { sheet: "Рулетка" }),
  p("arcade.roulette.weights.flood", "вес потопа", "Относительный шанс потопа.", { sheet: "Рулетка" }),
  p("arcade.roulette.weights.plague", "вес чумы", "Относительный шанс чумы.", { sheet: "Рулетка" }),
  p("arcade.roulette.weights.evolution", "вес эволюции", "Относительный шанс эволюции (баф зверей).", { sheet: "Рулетка" }),
  p("arcade.roulette.pct.earthquake.0", "землетрясение min", "Минимальная доля растений, которые сносит. Давление со временем поднимает факт вверх, потолок 85%.", { sheet: "Рулетка" }),
  p("arcade.roulette.pct.earthquake.1", "землетрясение max", "Максимальная доля растений до давления.", { sheet: "Рулетка" }),
  p("arcade.roulette.pct.flood.0", "потоп min", "Минимальная доля пустых клеток, которые заливает.", { sheet: "Рулетка" }),
  p("arcade.roulette.pct.flood.1", "потоп max", "Максимальная доля залива до давления.", { sheet: "Рулетка" }),
  p("arcade.roulette.pct.plague.0", "чума min", "Минимальная доля живых зверей, которых убивает.", { sheet: "Рулетка" }),
  p("arcade.roulette.pct.plague.1", "чума max", "Максимальная доля чумы до давления.", { sheet: "Рулетка" }),
  p("arcade.roulette.pct.evolution.0", "эволюция min", "Минимальная доля зверей, которые получают баф.", { sheet: "Рулетка" }),
  p("arcade.roulette.pct.evolution.1", "эволюция max", "Максимальная доля эволюции до давления.", { sheet: "Рулетка" }),
  p("arcade.roulette.pressure.perGen", "давление/цикл", "Множитель силы рулетки растёт: 1 + цикл×это, пока не упрётся в cap.", { sheet: "Рулетка" }),
  p("arcade.roulette.pressure.cap", "потолок давления", "Максимум множителя рулетки (1.8 = почти вдвое жёстче к поздней эре).", { sheet: "Рулетка" }),
  p("arcade.roulette.plagueFogTicks", "туман чумы", "Длительность визуала чумы (не сила).", { sheet: "Рулетка" }),
  p("arcade.roulette.screenShake", "тряска экрана", "Сила визуальной тряски при ударе рулетки.", { sheet: "Рулетка" })
];

const LEGACY_POINTS = [
  p("scoring.legacyLifePoints.plant.sprout", "legacy росток", "Справка. Движок эти числа не читает — очки считает по тирам и шкале.", { sheet: "Справочно_очки", import: false }),
  p("scoring.legacyLifePoints.plant.evolveGrass", "legacy куст", "Справка, не влияет.", { sheet: "Справочно_очки", import: false }),
  p("scoring.legacyLifePoints.plant.evolveBush", "legacy дерево", "Справка, не влияет.", { sheet: "Справочно_очки", import: false }),
  p("scoring.legacyLifePoints.plant.wilt", "legacy увядание", "Справка, не влияет.", { sheet: "Справочно_очки", import: false }),
  p("scoring.legacyLifePoints.plant.place", "legacy посадка", "Справка, не влияет.", { sheet: "Справочно_очки", import: false }),
  p("scoring.legacyLifePoints.birth.rabbit", "legacy рождение зайца", "Справка, не влияет.", { sheet: "Справочно_очки", import: false }),
  p("scoring.legacyLifePoints.birth.koala", "legacy рождение коалы", "Справка, не влияет.", { sheet: "Справочно_очки", import: false }),
  p("scoring.legacyLifePoints.birth.cow", "legacy рождение коровы", "Справка, не влияет.", { sheet: "Справочно_очки", import: false }),
  p("scoring.legacyLifePoints.birth.fox", "legacy рождение лисы", "Справка, не влияет.", { sheet: "Справочно_очки", import: false }),
  p("scoring.legacyLifePoints.birth.wolf", "legacy рождение волка", "Справка, не влияет.", { sheet: "Справочно_очки", import: false }),
  p("scoring.legacyLifePoints.birth.elk", "legacy рождение лося", "Справка, не влияет.", { sheet: "Справочно_очки", import: false }),
  p("scoring.legacyLifePoints.birth.bear", "legacy рождение медведя", "Справка, не влияет.", { sheet: "Справочно_очки", import: false }),
  p("scoring.legacyLifePoints.birth.krol", "legacy рождение крола", "Справка, не влияет.", { sheet: "Справочно_очки", import: false }),
  p("scoring.legacyLifePoints.death.rabbit", "legacy смерть зайца", "Справка, не влияет.", { sheet: "Справочно_очки", import: false }),
  p("scoring.legacyLifePoints.death.koala", "legacy смерть коалы", "Справка, не влияет.", { sheet: "Справочно_очки", import: false }),
  p("scoring.legacyLifePoints.death.cow", "legacy смерть коровы", "Справка, не влияет.", { sheet: "Справочно_очки", import: false }),
  p("scoring.legacyLifePoints.death.fox", "legacy смерть лисы", "Справка, не влияет.", { sheet: "Справочно_очки", import: false }),
  p("scoring.legacyLifePoints.death.wolf", "legacy смерть волка", "Справка, не влияет.", { sheet: "Справочно_очки", import: false }),
  p("scoring.legacyLifePoints.death.elk", "legacy смерть лося", "Справка, не влияет.", { sheet: "Справочно_очки", import: false }),
  p("scoring.legacyLifePoints.death.bear", "legacy смерть медведя", "Справка, не влияет.", { sheet: "Справочно_очки", import: false }),
  p("scoring.legacyLifePoints.death.krol", "legacy смерть крола", "Справка, не влияет.", { sheet: "Справочно_очки", import: false }),
  p("scoring.legacyLifePoints.mutation.коала", "legacy мутация коалы", "Справка, не влияет.", { sheet: "Справочно_очки", import: false }),
  p("scoring.legacyLifePoints.mutation.корова", "legacy мутация коровы", "Справка, не влияет.", { sheet: "Справочно_очки", import: false }),
  p("scoring.legacyLifePoints.mutation.волк", "legacy мутация волка", "Справка, не влияет.", { sheet: "Справочно_очки", import: false }),
  p("scoring.legacyLifePoints.mutation.лось", "legacy мутация лося", "Справка, не влияет.", { sheet: "Справочно_очки", import: false }),
  p("scoring.legacyLifePoints.mutation.крол-душегуб", "legacy мутация крола", "Справка, не влияет.", { sheet: "Справочно_очки", import: false }),
  p("scoring.legacyLifePoints.place.herb", "legacy посадка зайца", "Справка, не влияет.", { sheet: "Справочно_очки", import: false }),
  p("scoring.legacyLifePoints.place.pred", "legacy посадка лисы", "Справка, не влияет.", { sheet: "Справочно_очки", import: false }),
  p("scoring.legacyLifePoints.place.bear", "legacy посадка медведя", "Справка, не влияет.", { sheet: "Справочно_очки", import: false }),
  p("scoring.legacyLifePoints.activity.fertilize", "legacy удобрение", "Справка, не влияет.", { sheet: "Справочно_очки", import: false })
];

const ALL_PARAMS = [...PARAMS, ...LEGACY_POINTS];

const SHEET_META = [
  { name: "Инструкция", color: "666666" },
  { name: "Все", color: "1F4E79" },
  { name: "Цены", color: "C9A227" },
  { name: "Сложность", color: "C9A227" },
  { name: "Энергия_событий", color: "C9A227" },
  { name: "Экономика_пульса", color: "C9A227" },
  { name: "Мутации_энергия", color: "C9A227" },
  { name: "Тиры", color: "2E75B6" },
  { name: "Очки", color: "2E75B6" },
  { name: "Формулы", color: "2E75B6" },
  { name: "Виды", color: "548235" },
  { name: "Мутации", color: "548235" },
  { name: "Размножение", color: "548235" },
  { name: "Поведение", color: "548235" },
  { name: "Растения", color: "7F6000" },
  { name: "Поле", color: "7F6000" },
  { name: "Конец_раунда", color: "C00000" },
  { name: "Рулетка", color: "C00000" },
  { name: "Версия", color: "808080" },
  { name: "Справочно_очки", color: "808080" }
];

function flattenTables(tables, prefix = "") {
  const out = [];
  if (tables == null) return out;
  if (typeof tables !== "object") {
    if (prefix) out.push([prefix, tables]);
    return out;
  }
  if (Array.isArray(tables)) {
    tables.forEach((v, i) => {
      const pth = prefix ? `${prefix}.${i}` : String(i);
      if (v !== null && typeof v === "object") out.push(...flattenTables(v, pth));
      else out.push([pth, v]);
    });
    return out;
  }
  for (const [key, val] of Object.entries(tables)) {
    const pth = prefix ? `${prefix}.${key}` : key;
    if (val !== null && typeof val === "object") out.push(...flattenTables(val, pth));
    else out.push([pth, val]);
  }
  return out;
}

function getByPath(root, path) {
  const parts = path.split(".");
  let cur = root;
  for (const part of parts) {
    if (cur == null) return undefined;
    cur = cur[part];
  }
  return cur;
}

function setByPath(root, path, value) {
  const parts = path.split(".");
  let cur = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const next = parts[i + 1];
    const nextIsIndex = /^\d+$/.test(next);
    if (cur[part] == null || typeof cur[part] !== "object") {
      cur[part] = nextIsIndex ? [] : {};
    }
    cur = cur[part];
  }
  const last = parts[parts.length - 1];
  if (value === undefined) delete cur[last];
  else cur[last] = value;
}

function schemaPaths() {
  return ALL_PARAMS.map((row) => row.path);
}

function paramByPath(path) {
  return ALL_PARAMS.find((row) => row.path === path);
}

function missingFromSchema(tables) {
  const listed = new Set(schemaPaths());
  return flattenTables(tables)
    .map(([path]) => path)
    .filter((path) => !listed.has(path));
}

function extraInSchema(tables) {
  return schemaPaths().filter((path) => getByPath(tables, path) === undefined);
}

module.exports = {
  ALL_PARAMS,
  PARAMS,
  LEGACY_POINTS,
  SHEET_META,
  SPECIES_IDS,
  SPECIES_FIELDS,
  flattenTables,
  getByPath,
  setByPath,
  schemaPaths,
  paramByPath,
  missingFromSchema,
  extraInSchema
};
