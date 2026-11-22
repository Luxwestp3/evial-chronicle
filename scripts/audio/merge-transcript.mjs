#!/usr/bin/env node
// Склеивает две части транскрипта в один файл: сдвигает таймкоды второй части
// на абсолютное время и выбрасывает дубли из перекрытия.
//
//   node scripts/audio/merge-transcript.mjs private/transcripts/session-002 \
//     [--offset 7200] [--overlap 10] [--force]
//
// Смещение по умолчанию считается из длительности part1.mp3:
// offset = длительность(part1) - overlap.
import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { pathToFileURL } from "node:url"

const TIMESTAMP = /^\[(?:(\d{1,3}):)?(\d{1,2}):(\d{2})\] */

/** Секунды из таймкода в начале строки; null, если его нет. */
export function parseTimestamp(line) {
  const m = TIMESTAMP.exec(line)
  if (!m) return null
  const h = m[1] === undefined ? 0 : Number(m[1])
  return h * 3600 + Number(m[2]) * 60 + Number(m[3])
}

export function formatTimestamp(seconds) {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `[${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}]`
}

/**
 * Режет текст на блоки: блок начинается со строки с таймкодом и тянется
 * до следующего таймкода. Строки до первого таймкода — преамбула.
 */
export function parseTranscript(text) {
  const preamble = []
  const blocks = []
  let current = null
  for (const line of text.split(/\r?\n/)) {
    const t = parseTimestamp(line)
    if (t !== null) {
      current = { t, lines: [line] }
      blocks.push(current)
    } else if (current) {
      current.lines.push(line)
    } else {
      preamble.push(line)
    }
  }
  return { preamble, blocks }
}

function shiftLine(line, offset) {
  const t = parseTimestamp(line)
  if (t === null) return line
  return line.replace(TIMESTAMP, `${formatTimestamp(t + offset)} `)
}

/**
 * part1 — без изменений; part2 сдвигается на offset и теряет блоки, попавшие
 * в перекрытие (абсолютное время меньше границы конца part1).
 */
export function mergeParts({ part1, part2, offset, overlap }) {
  const a = parseTranscript(part1)
  const b = parseTranscript(part2)

  if (!a.blocks.length) throw new Error("в part1.md нет ни одного таймкода")
  if (!b.blocks.length) throw new Error("в part2.md нет ни одного таймкода")

  const boundary = offset + 2 * overlap
  const kept = []
  let dropped = 0

  for (const block of b.blocks) {
    const absolute = block.t + offset
    if (absolute < boundary) {
      dropped++
      continue
    }
    kept.push(
      block.lines
        .map((line) => shiftLine(line, offset))
        .join("\n")
        .trimEnd(),
    )
  }

  if (!kept.length) {
    throw new Error(
      `после сдвига на ${offset}s и отбрасывания перекрытия до ${boundary}s не осталось блоков`,
    )
  }

  const head = a.blocks.map((block) => block.lines.join("\n").trimEnd())
  return {
    text: [...head, ...kept].join("\n\n") + "\n",
    stats: {
      part1Blocks: a.blocks.length,
      part2Kept: kept.length,
      dropped,
      boundary,
      firstPart2: parseTimestamp(kept[0]),
    },
  }
}

function usage() {
  console.error("usage: merge-transcript.mjs <session-dir> [--offset N] [--overlap N] [--force]")
  process.exit(2)
}

function audioDuration(file) {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
    { encoding: "utf8" },
  )
  return Math.round(Number.parseFloat(out))
}

function main(argv) {
  let dir = null
  let offsetArg = null
  let overlap = 10
  let force = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--offset") offsetArg = Number(argv[++i])
    else if (arg === "--overlap") overlap = Number(argv[++i])
    else if (arg === "--force") force = true
    else if (!arg.startsWith("--") && dir === null) dir = arg
    else usage()
  }
  if (!dir) usage()

  const part1Path = path.join(dir, "part1.md")
  const part2Path = path.join(dir, "part2.md")
  for (const file of [part1Path, part2Path]) {
    if (!fs.existsSync(file)) {
      console.error(`нет файла: ${file}`)
      process.exit(1)
    }
  }

  let offset = offsetArg
  if (offset === null) {
    const audioDir = path.join(dir, "audio")
    const part1Audio = fs.existsSync(audioDir)
      ? fs.readdirSync(audioDir).find((name) => name.endsWith("-part1.mp3"))
      : undefined
    if (!part1Audio) {
      console.error(
        "не нашёл audio/*-part1.mp3, чтобы вычислить смещение; укажи --offset в секундах",
      )
      process.exit(1)
    }
    const duration = audioDuration(path.join(audioDir, part1Audio))
    offset = duration - 2 * overlap
    console.error(
      `смещение из длительности ${part1Audio}: ${duration}s - ${2 * overlap}s = ${offset}s`,
    )
  }

  const result = mergeParts({
    part1: fs.readFileSync(part1Path, "utf8"),
    part2: fs.readFileSync(part2Path, "utf8"),
    offset,
    overlap,
  })

  const outPath = path.join(dir, "dnd_transcript.md")
  if (fs.existsSync(outPath) && !force) {
    console.error(`${outPath} уже существует; --force, чтобы перезаписать`)
    process.exit(1)
  }
  fs.writeFileSync(outPath, result.text)

  const first = result.stats.firstPart2
  console.error(
    `готово: ${outPath}\n` +
      `  блоков: part1 ${result.stats.part1Blocks}, part2 ${result.stats.part2Kept}\n` +
      `  отброшено дублей из перекрытия: ${result.stats.dropped}\n` +
      `  первый блок part2: ${first === null ? "?" : formatTimestamp(first)} (граница ${formatTimestamp(result.stats.boundary)})`,
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2))
}
