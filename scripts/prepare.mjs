// Builds .site-content/ from content/ (the archive mirror) and adds generated pages:
// home, chronicle, heroes, interactive map, folder index pages.
// Run before `npx quartz build -d .site-content`.
import fs from "node:fs"
import path from "node:path"
import matter from "gray-matter"
import sharp from "sharp"

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..")
const SRC = path.join(root, "content")
const OUT = path.join(root, ".site-content")

fs.rmSync(OUT, { recursive: true, force: true })
fs.cpSync(SRC, OUT, { recursive: true })
// Working notes for the archive keepers, not for readers of the site.
for (const f of ["README.md", "questions.md"]) fs.rmSync(path.join(OUT, f), { force: true })

// ---------- read the archive ----------
const pages = []
for (const rel of fs.readdirSync(OUT, { recursive: true })) {
  if (!rel.endsWith(".md")) continue
  const raw = fs.readFileSync(path.join(OUT, rel), "utf8")
  const { data, content } = matter(raw)
  // The archive starts each page with "# Title"; Quartz already prints the title, so drop it on the site.
  if (/^\s*# /.test(content)) {
    fs.writeFileSync(path.join(OUT, rel), matter.stringify(content.replace(/^\s*# .*\n/, ""), data))
  }
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

// Link from a generated page in `fromDir` to an archive slug.
const rel = (fromDir, slug) => {
  const r = path.posix.relative(fromDir, slug)
  return r.startsWith(".") ? r : `./${r}`
}

// Archive page body without its H1 (to reuse a page as a section of an overview).
const bodyOf = (slug) => {
  const p = pages.find((x) => x.slug === slug)
  return p ? p.body.replace(/^\s*# .*\n/, "").trim() : ""
}

// ---------- hero cards ----------
const pcs = byType("pc").sort((a, b) => a.title.localeCompare(b.title, "ru"))
const heroCard = (fromDir) => (p) => {
  const d = p.data
  const portrait = d.portrait
    ? `<img class="hero-portrait" src="${esc(rel(fromDir, path.posix.join(path.posix.dirname(p.slug), d.portrait)))}" alt="${esc(p.title)}">`
    : `<div class="hero-portrait hero-initial">${esc(initials(p.title))}</div>`
  const line = [d.species, d.class, d.subclass && !/не выбран/.test(d.subclass) ? d.subclass : null]
    .filter(Boolean)
    .join(" · ")
  return `<a class="hero-card internal" href="${rel(fromDir, p.slug)}">
${portrait}
<div class="hero-body">
<div class="hero-name">${esc(p.title)}</div>
<div class="hero-meta">${esc(line)}</div>
<div class="hero-player">игрок: ${esc(d.player ?? "?")}</div>
</div>
</a>`
}

// ---------- sessions ----------
const sessions = byType("session").sort((a, b) => (a.data.number ?? 0) - (b.data.number ?? 0))
const sessionEntry = (fromDir) => (p) => {
  const d = p.data
  return `<div class="chronicle-entry">
<div class="chronicle-marker">${esc(d.number ?? "?")}</div>
<div class="chronicle-body">
<a class="chronicle-title internal" href="${rel(fromDir, p.slug)}">${esc(p.title)}</a>
<div class="chronicle-dates"><span>🗓 ${esc(d.date_real ?? "дата неизвестна")}</span><span>⏳ ${esc(d.date_world ?? "")}</span>${d.location ? `<span>📍 ${esc(d.location)}</span>` : ""}</div>
<p>${esc(sessionSummary(p.body))}</p>
</div>
</div>`
}

// Sessions grouped for the chronicle. A session can set `arc:` in its frontmatter to join a named
// group (e.g. an act or a journey); otherwise played sessions go under «Сессии».
// Session 0 (character creation) always stands apart, at the bottom.
const played = sessions.filter((p) => (p.data.number ?? 0) > 0)
const zero = sessions.filter((p) => (p.data.number ?? 0) === 0)
const chronicleGroups = (fromDir) => {
  const groups = new Map()
  for (const p of [...played].reverse()) {
    const key = p.data.arc ?? "Сессии"
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(p)
  }
  const block = (title, list) =>
    `## ${title}\n\n<div class="chronicle">\n${list.map(sessionEntry(fromDir)).join("\n")}\n</div>\n`
  const out = [...groups].map(([title, list]) => block(title, list))
  if (!played.length) out.push("## Сессии\n\nИгра ещё не началась.\n")
  if (zero.length) out.push(block("Нулевая сессия", zero))
  return out.join("\n")
}

// Sections of the site, in menu order. Each is an archive folder whose index page we generate.
// Root-level archive files (goals, relationships, timeline, questions, README) are folded into these.

// Хроника = sessions/
write(
  "sessions/index.md",
  { title: "Хроника", hideListing: true },
  `Время в мире идёт вместе с реальным: неделя жизни примерно равна неделе в игре.

${chronicleGroups("sessions")}

## История мира

${bodyOf("timeline").replace(/^## Сессии[\s\S]*?(?=^## )/m, "").replace(/^## История мира\s*/m, "")}
`,
)

// Персонажи = characters/
const npcs = byType("npc").sort((a, b) => a.title.localeCompare(b.title, "ru"))
write(
  "characters/index.md",
  { title: "Персонажи", hideListing: true },
  `## Партия

<div class="hero-grid">
${pcs.map(heroCard("characters")).join("\n")}
</div>

## Цели

${bodyOf("goals")}

## Персонажи мастера

${npcs.map((p) => `- [${p.title}](${rel("characters", p.slug)}.md)${p.data.role ? `: ${p.data.role}` : ""}`).join("\n")}

## Связи

${bodyOf("relationships")}
`,
)

// Места = places/ (with the interactive map)
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

// Mini-map on every place page: a crop of the world map around the place, with a pin.
const MINI_W = 360
const MINI_H = 240
const mapSrc = path.join(OUT, mapImage)
const { width: MAP_W, height: MAP_H } = await sharp(mapSrc).metadata()
for (const p of places) {
  const [x, y] = p.data.map
  const left = Math.min(Math.max(Math.round(x - MINI_W / 2), 0), MAP_W - MINI_W)
  const top = Math.min(Math.max(Math.round(y - MINI_H / 2), 0), MAP_H - MINI_H)
  const px = x - left
  const py = y - top
  const pin = Buffer.from(
    `<svg width="${MINI_W}" height="${MINI_H}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${px}" cy="${py}" r="26" fill="none" stroke="#fff6e0" stroke-width="5" opacity="0.8"/>
      <circle cx="${px}" cy="${py}" r="26" fill="none" stroke="#9b2c1c" stroke-width="3"/>
    </svg>`,
  )
  const name = path.posix.basename(p.slug)
  const outFile = path.join(OUT, "places/minimaps", `${name}.jpg`)
  fs.mkdirSync(path.dirname(outFile), { recursive: true })
  await sharp(mapSrc)
    .extract({ left, top, width: MINI_W, height: MINI_H })
    .composite([{ input: pin }])
    .resize(MINI_W * 2, MINI_H * 2, { kernel: "lanczos3" })
    .jpeg({ quality: 85 })
    .toFile(outFile)
  // Insert the mini-map right after the page's H1.
  const file = path.join(OUT, `${p.slug}.md`)
  const raw = fs.readFileSync(file, "utf8")
  const fig = `\n<div class="minimap"><img src="minimaps/${name}.jpg" alt="${esc(p.title)} на карте"></div>\n`
  const { data, content } = matter(raw)
  fs.writeFileSync(file, matter.stringify(`${fig}\n${content.trimStart()}`, data))
}
const tpl = fs.readFileSync(path.join(root, "scripts/map.template.html"), "utf8")
// Quartz rewrites .html files found in content, so the map page goes to quartz/static (copied verbatim to /static).
fs.writeFileSync(
  path.join(root, "quartz/static/evial-map.html"),
  tpl.replace("__MARKERS__", JSON.stringify(markers)).replace("__IMAGE__", `../${mapImage}`),
)
write(
  "places/index.md",
  { title: "Карта", hideListing: true },
  `Карту можно приближать и двигать. Нажми на метку, чтобы прочитать о месте и открыть его страницу.

<iframe class="map-frame" src="../static/evial-map.html" title="Карта Эвиала" loading="lazy"></iframe>

Обзор мира по регионам: [География](../lore/geography.md). [Карта целиком](../${mapImage}).
`,
)

// Folders that keep Quartz's automatic page list.
const folderTitles = {
  "characters/pc": "Партия",
  "characters/npc": "Персонажи мастера",
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

// ---------- home ----------
const last = played[played.length - 1]
const tile = (href, icon, name, text) =>
  `<a class="home-tile internal" href="${href}"><span class="home-tile-name">${icon} ${name}</span><span>${text}</span></a>`
write(
  "index.md",
  { title: "Хроники Эвиала" },
  `Летопись нашей кампании D&D 5.5e (правила 2024 года). Мастер: **Вазген**. Приключение начинается в [Эгесте](places/egest.md).

<div class="home-tiles">
${tile("./sessions/", "📜", "Хроника", "пересказ каждой сессии и история мира")}
${tile("./characters/", "🛡", "Персонажи", "партия, цели, персонажи мастера и связи")}
${tile("./places/", "🗺", "Карта", "интерактивная карта Эвиала и все места")}
${tile("./factions/", "⚔", "Фракции", "организации и банды")}
${tile("./lore/", "📖", "Лор", "история, народы, религия, экономика")}
${tile("./rules/", "📘", "Правила", "хоумбрю мастера и настройка листа")}
</div>

${last ? `## Последняя сессия\n\n<div class="chronicle">\n${sessionEntry("")(last)}\n</div>\n` : zero.length ? `## Перед началом игры\n\n<div class="chronicle">\n${sessionEntry("")(zero[0])}\n</div>\n` : ""}
`,
)

console.log(
  `prepared .site-content: ${pages.length} archive pages, ${sessions.length} sessions, ${pcs.length} heroes, ${markers.length} map markers`,
)
