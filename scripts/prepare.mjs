// Builds .site-content/ from content/ (the archive mirror) and adds generated pages:
// home, chronicle, heroes, interactive map, folder index pages.
// Run before `npx quartz build -d .site-content`.
import fs from "node:fs"
import path from "node:path"
import matter from "gray-matter"

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..")
const SRC = path.join(root, "content")
const OUT = path.join(root, ".site-content")

fs.rmSync(OUT, { recursive: true, force: true })
fs.cpSync(SRC, OUT, { recursive: true })

// ---------- read the archive ----------
const pages = []
for (const rel of fs.readdirSync(OUT, { recursive: true })) {
  if (!rel.endsWith(".md")) continue
  const raw = fs.readFileSync(path.join(OUT, rel), "utf8")
  const { data, content } = matter(raw)
  const slug = rel.replace(/\\/g, "/").replace(/\.md$/, "")
  pages.push({ slug, data, body: content, title: data.title ?? path.basename(slug) })
}
const byType = (t) => pages.filter((p) => p.data.type === t)

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

// Strip markdown to plain text for short excerpts.
const plain = (md) =>
  md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, "$2")
    .replace(/[*_`]/g, "")
    .trim()

// First real paragraph after the H1.
const firstParagraph = (body) => {
  const paras = body.split(/\n\s*\n/).map((p) => p.trim())
  return paras.find((p) => p && !p.startsWith("#") && !p.startsWith("|") && !p.startsWith("```") && !p.startsWith("!")) ?? ""
}

// "**Коротко.** ..." paragraph of a session chronicle.
const sessionSummary = (body) => {
  const m = body.match(/\*\*Коротко\.?\*\*\s*([\s\S]*?)(\n\s*\n|$)/)
  return plain(m ? m[1] : firstParagraph(body))
}

const write = (rel, data, body) => {
  const file = path.join(OUT, rel)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, matter.stringify(body, data))
}

const initials = (name) => name.trim().charAt(0).toUpperCase()

// ---------- hero cards ----------
const pcs = byType("pc").sort((a, b) => a.title.localeCompare(b.title, "ru"))
const heroCard = (p) => {
  const d = p.data
  const portrait = d.portrait
    ? `<img class="hero-portrait" src="${esc(path.posix.join(path.posix.dirname(p.slug), d.portrait))}" alt="${esc(p.title)}">`
    : `<div class="hero-portrait hero-initial">${esc(initials(p.title))}</div>`
  const line = [d.species, d.class, d.subclass && !/не выбран/.test(d.subclass) ? d.subclass : null]
    .filter(Boolean)
    .join(" · ")
  return `<a class="hero-card internal" href="./${p.slug}">
${portrait}
<div class="hero-body">
<div class="hero-name">${esc(p.title)}</div>
<div class="hero-meta">${esc(line)}</div>
<div class="hero-player">игрок: ${esc(d.player ?? "?")}</div>
${d.goal ? `<div class="hero-goal">${esc(d.goal)}</div>` : ""}
</div>
</a>`
}
const heroGrid = `<div class="hero-grid">\n${pcs.map(heroCard).join("\n")}\n</div>`

// ---------- sessions ----------
const sessions = byType("session").sort((a, b) => (a.data.number ?? 0) - (b.data.number ?? 0))
const sessionEntry = (p) => {
  const d = p.data
  return `<div class="chronicle-entry">
<div class="chronicle-marker">${esc(d.number ?? "?")}</div>
<div class="chronicle-body">
<a class="chronicle-title internal" href="./${p.slug}">${esc(p.title)}</a>
<div class="chronicle-dates"><span>🗓 ${esc(d.date_real ?? "дата неизвестна")}</span><span>⏳ ${esc(d.date_world ?? "")}</span>${d.location ? `<span>📍 ${esc(d.location)}</span>` : ""}</div>
<p>${esc(sessionSummary(p.body))}</p>
</div>
</div>`
}

write(
  "chronicle.md",
  { title: "Хроника", tags: ["хроника"] },
  `Все сессии по порядку, от первой к последней. Реальное время в мире идёт вместе с нашим: неделя жизни примерно равна неделе в игре.

<div class="chronicle">
${sessions.map(sessionEntry).join("\n")}
</div>

Хронология мира и дат сессий: [[timeline|Хронология]].
`,
)

// ---------- heroes ----------
const npcs = byType("npc").sort((a, b) => a.title.localeCompare(b.title, "ru"))
const factions = byType("faction").sort((a, b) => a.title.localeCompare(b.title, "ru"))
write(
  "heroes.md",
  { title: "Герои", tags: ["персонажи"] },
  `## Партия

${heroGrid}

## Персонажи мастера

${npcs.map((p) => `- [[${p.slug}|${p.title}]]${p.data.role ? `: ${p.data.role}` : ""}`).join("\n")}

## Фракции

${factions.map((p) => `- [[${p.slug}|${p.title}]]${p.data.kind ? `: ${p.data.kind}` : ""}`).join("\n")}

Кто с кем связан: [[relationships|Связи]]. Цели героев и их статус: [[goals|Цели]].
`,
)

// ---------- interactive map ----------
const places = byType("place").filter((p) => Array.isArray(p.data.map))
const markers = places.map((p) => ({
  title: p.title,
  kind: p.data.kind ?? "",
  x: p.data.map[0],
  y: p.data.map[1],
  href: `../${p.slug}`,
  text: plain(firstParagraph(p.body)).slice(0, 260),
}))
const mapImage = "maps/evial.jpg"
const tpl = fs.readFileSync(path.join(root, "scripts/map.template.html"), "utf8")
// Quartz rewrites .html files found in content, so the map page goes to quartz/static (copied verbatim to /static).
fs.writeFileSync(
  path.join(root, "quartz/static/evial-map.html"),
  tpl.replace("__MARKERS__", JSON.stringify(markers)).replace("__IMAGE__", `../${mapImage}`),
)
write(
  "map.md",
  { title: "Карта Эвиала", tags: ["карта"] },
  `Карту можно приближать и двигать. Нажми на метку, чтобы прочитать о месте и открыть его страницу.

<iframe class="map-frame" src="static/evial-map.html" title="Карта Эвиала" loading="lazy"></iframe>

Обзор мира по регионам: [[lore/geography|География]]. Исходная картинка: [карта целиком](${mapImage}).

## Места на карте

${places
  .sort((a, b) => a.title.localeCompare(b.title, "ru"))
  .map((p) => `- [[${p.slug}|${p.title}]]${p.data.kind ? `: ${p.data.kind}` : ""}`)
  .join("\n")}
`,
)

// ---------- home ----------
const last = sessions[sessions.length - 1]
write(
  "index.md",
  { title: "Хроники Эвиала" },
  `Архив нашей кампании D&D 5.5e (правила 2024 года). Мастер: **Вазген**. Приключение начинается в [[places/egest|Эгесте]].

<div class="home-links">
<a class="internal" href="./chronicle">📜 Хроника</a>
<a class="internal" href="./heroes">🛡 Герои</a>
<a class="internal" href="./map">🗺 Карта</a>
<a class="internal" href="./relationships">🕸 Связи</a>
<a class="internal" href="./rules/homebrew">📘 Правила</a>
<a class="internal" href="./questions">❓ Вопросы</a>
</div>

## Партия

${heroGrid}

${last ? `## Последняя сессия\n\n<div class="chronicle">\n${sessionEntry(last)}\n</div>\n` : ""}
## Разделы

- [[chronicle|Хроника]]: все сессии по порядку.
- [[heroes|Герои]]: партия, персонажи мастера и фракции.
- [[map|Карта]] и [[lore/geography|география]] мира.
- [[lore/history|История]], [[lore/peoples|народы]], [[lore/religion|религия]], [[lore/economy|экономика]].
- [[rules/homebrew|Хоумбрю-правила]] и [[rules/character-sheet|настройка листа персонажа]].
- [[relationships|Связи]], [[goals|цели]], [[timeline|хронология]] и [[questions|открытые вопросы]].
- [[README|Как устроен архив]] и правильное написание имён.
`,
)

// ---------- folder index pages (Russian names in the explorer) ----------
const folderTitles = {
  sessions: "Сессии",
  characters: "Персонажи",
  "characters/pc": "Партия",
  "characters/npc": "Персонажи мастера",
  places: "Места",
  factions: "Фракции",
  lore: "Лор",
  rules: "Правила",
}
for (const [dir, title] of Object.entries(folderTitles)) {
  const rel = `${dir}/index.md`
  if (fs.existsSync(path.join(OUT, dir)) && !fs.existsSync(path.join(OUT, rel))) {
    write(rel, { title }, "")
  }
}

console.log(
  `prepared .site-content: ${pages.length} archive pages, ${sessions.length} sessions, ${pcs.length} heroes, ${markers.length} map markers`,
)
