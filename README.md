# Расхитители спален

Сайт-вики нашей кампании D&D: хроника сессий, герои, интерактивная карта, связи, правила мастера.
Собран на [Quartz 4](https://quartz.jzhao.xyz) и публикуется на GitHub Pages:
https://luxwestp3.github.io/evial-chronicle/

> **Примечание:** тексты хроник и карточек сгенерированы с помощью ИИ по аудиозаписям сессий — в деталях, цитатах и атрибуции реплик возможны неточности.

## Источник истины

`content/` — сам архив кампании, а не копия. Редактируй файлы напрямую: markdown с YAML-шапками.

- Правила ведения архива и канонические написания имён — [content/README.md](content/README.md).
- Обработка новой сессии — [docs/campaign/WORKFLOW.md](docs/campaign/WORKFLOW.md).
- Границы работы агента и порядок чтения — [AGENTS.md](AGENTS.md).
- Приоритеты развития — [docs/campaign/PLAN.md](docs/campaign/PLAN.md).

Импорт из внешнего архива Claude и `scripts/sync-archive.sh` больше не существуют:
старый скрипт удалял `content/` перед копированием.

## Как это устроено

- `scripts/prepare.mjs` собирает `.site-content/`: копирует `content/` и добавляет генерируемые
  страницы — главную, «Хронику» (из `type: session`), «Персонажей» (`type: pc`, `npc`, `faction`)
  и «Карту».
- Интерактивная карта: `scripts/map.template.html`, Leaflet лежит в `quartz/static/leaflet`.
  Метки берутся из поля `map: [x, y]` у мест (`type: place`), координаты в пикселях картинки
  `content/maps/evial.jpg` (1114×945, отсчёт от левого верхнего угла). Границы мест —
  `content/maps/areas.json`, скрипт подгонки — `scripts/fit-outline.cjs`.
- `.site-content/`, `public/`, мини-карты и `quartz/static/evial-map.html` генерируются;
  руками их не правят.
- Портрет героя: положи картинку рядом с карточкой и укажи в шапке `portrait: имя-файла.jpg`.
- Хроника сессии хранит две версии — `## Кратко` и `## Подробно`; на сайте они переключаются
  вкладками.
- При каждом пуше в `main` GitHub Actions пересобирает и выкладывает сайт
  (`.github/workflows/deploy.yml`).

## Локальная сборка

```bash
npm ci
node scripts/prepare.mjs
npx quartz build -d .site-content --serve
```

После изменения `content/` заново запусти `prepare.mjs`: Quartz наблюдает за `.site-content/`.

## Расшифровки

Исходные транскрипты в архив и на сайт не входят. Они хранятся вне `content/`,
в `private/transcripts/session-NNN/` от корня репозитория; каталог исключён из Git.
