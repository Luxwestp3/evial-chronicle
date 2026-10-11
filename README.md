# Хроники Эвиала

Сайт-вики нашей кампании D&D: хроника сессий, герои, интерактивная карта, связи, правила мастера.
Собран на [Quartz 4](https://quartz.jzhao.xyz) и публикуется на GitHub Pages: https://luxwestp3.github.io/evial-chronicle/

## Как это устроено

- `content/` — копия архива кампании (markdown с YAML-шапками). Главный источник правды — архив в проекте Claude, `content/` обновляется из него скриптом `scripts/sync-archive.sh`. Расшифровки на сайт не попадают.
- `scripts/prepare.mjs` собирает `.site-content/`: копирует `content/` и добавляет генерируемые страницы — главную, «Хронику» (из шапок `type: session`), «Героев» (из `type: pc`, `npc`, `faction`) и «Карту».
- Интерактивная карта: `scripts/map.template.html` (Leaflet лежит в `quartz/static/leaflet`). Метки берутся из поля `map: [x, y]` у мест (`type: place`), координаты в пикселях картинки `maps/evial.jpg` (1114×945, отсчёт от левого верхнего угла).
- Портрет героя: положи картинку рядом с карточкой и укажи в шапке `portrait: имя-файла.jpg`.
- При каждом пуше в `main` GitHub Actions пересобирает и выкладывает сайт (`.github/workflows/deploy.yml`).

## Локальная сборка

```bash
npm ci
scripts/sync-archive.sh /путь/к/campaign   # по умолчанию /mnt/project-files/campaign
node scripts/prepare.mjs
npx quartz build -d .site-content --serve
```
