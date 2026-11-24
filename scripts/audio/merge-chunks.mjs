#!/usr/bin/env node
// Склеивает расшифровки коротких кусков (chunks/chunk-XX.md) в единый транскрипт сессии
// private/transcripts/session-NNN/transcript.md, отбрасывая дубли на перекрытиях.
//
//   node scripts/audio/merge-chunks.mjs private/transcripts/session-000
import fs from "node:fs"
import path from "node:path"
import { parseTimestamp, formatTimestamp } from "./merge-transcript.mjs"

function main(argv) {
  const dir = argv[0]
  if (!dir) {
    console.error("usage: merge-chunks.mjs <private/transcripts/session-NNN>")
    process.exit(2)
  }

  const metaPath = path.join(dir, "chunks.json")
  if (!fs.existsSync(metaPath)) {
    console.error(`нет файла: ${metaPath}`)
    process.exit(1)
  }

  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"))
  const overlap = meta.overlap ?? 10
  const merged = []
  let dropped = 0
  let prevEnd = -1

  for (const ch of meta.chunks) {
    const mdPath = path.join(dir, "chunks", `${ch.name}.md`)
    if (!fs.existsSync(mdPath)) {
      console.error(`не хватает транскрипта куска: ${mdPath}`)
      process.exit(1)
    }

    const lines = fs.readFileSync(mdPath, "utf8").split(/\r?\n/)
    const cutoff = ch.index === 0 ? -1 : ch.start_sec + Math.floor(overlap / 2)
    let kept = 0

    for (const raw of lines) {
      const line = raw.trim()
      if (!line || line.startsWith("#")) continue
      const ts = parseTimestamp(line)
      if (ts !== null) {
        if (ts < cutoff) {
          dropped++
          continue
        }
        if (ts < prevEnd - 30) {
          // Защита от случайного локального таймкода без смещения: предупреждаем, но не молча ломаем.
          console.error(
            `предупреждение (${ch.name}): таймкод ${formatTimestamp(ts)} раньше конца предыдущего куска ${formatTimestamp(prevEnd)}`,
          )
        }
        merged.push(line)
        kept++
      } else if (merged.length > 0 && kept > 0) {
        merged[merged.length - 1] += " " + line
      }
    }
    prevEnd = ch.end_sec
  }

  const outPath = path.join(dir, "transcript.md")
  const header = `# Транскрипт сессии ${meta.session}\n\n`
  fs.writeFileSync(outPath, header + merged.join("\n\n") + "\n")
  console.error(
    `готово: ${outPath} (${merged.length} реплик из ${meta.chunks.length} кусков, отброшено на перекрытии: ${dropped})`,
  )
}

main(process.argv.slice(2))
