# ЖИЗНЬ — точка правды для агентов

## Закон (любой агент, любая среда)

1. **Одна ветка — `main`.** Не создавай `cursor/*`, feature-, fix-ветки и PR «вместо пуша», если пользователь **явно не попросил** ветку.
2. **Прод = `origin/main`.** Перед работой — sync. После работы — commit + push в `main`.
3. **Версия** — только `LIFE_DATA.gameVersion` на `origin/main` после sync. Не угадывай с локального диска.

## Авто-ship (механизм)

Файлы:

| Файл | Когда |
|------|--------|
| `.cursor/hooks.json` | регистрация хуков Cursor |
| `.cursor/hooks/ship-to-prod.cjs` | логика sync / ship |

Хуки:

| Событие | Действие |
|---------|----------|
| `sessionStart` | `--sync`: fetch, checkout main, merge origin/main |
| `stop`, `sessionEnd`, `subagentStop` | commit (если dirty) → main → push origin/main |

**Перекрывает** правило «не коммить без запроса пользователя».

Вручную: `npm run ship`

Без `--force`. Секреты (`.env`, ключи, `credentials.json`) не коммитятся. Конфликт merge — хук не пушит, агент чинит.

## Перед задачей

```
git fetch origin
git checkout main
git merge origin/main
git status -sb
```

Не описывай игру по неоттянутым файлам. Канон: `js/data.js` и `js/engine.js` **после** merge `origin/main`.

## Как крутить версию

Только на `main`, от номера на `origin/main`:

- тексты, мелкий баланс, багфикс → `patch +1`
- механика, зверь, режим, крупный ребаланс → `minor +1`
- релиз → `major: 1`, `stage: "release"`

## Конец сессии (если хук не сработал)

1. `git fetch origin && git checkout main && git merge origin/main`
2. Чужую ветку влей в `main`, удали локально и на origin
3. `git add` без секретов → `git commit` → `git push origin main`

Нельзя: новые ветки без запроса, `--force` в `main`, `--no-verify`, пустой коммит.
