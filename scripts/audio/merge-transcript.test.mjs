import test from "node:test"
import assert from "node:assert/strict"
import {
  parseTimestamp,
  formatTimestamp,
  parseTranscript,
  mergeParts,
} from "./merge-transcript.mjs"

test("таймкоды: разбор", () => {
  assert.equal(parseTimestamp("[00:12:34] ГМ: текст"), 754)
  assert.equal(parseTimestamp("[12:34] реплика"), 754)
  assert.equal(parseTimestamp("[1:02:03]"), 3723)
  assert.equal(parseTimestamp("без таймкода"), null)
})

test("таймкоды: формат", () => {
  assert.equal(formatTimestamp(754), "[00:12:34]")
  assert.equal(formatTimestamp(3671), "[01:01:11]")
  assert.equal(formatTimestamp(0), "[00:00:00]")
})

test("блок тянется до следующего таймкода", () => {
  const { blocks, preamble } = parseTranscript(
    "шапка\n[00:00:01] ГМ: раз\nещё\n\n[00:00:05] Игрок: два",
  )
  assert.deepEqual(preamble, ["шапка"])
  assert.equal(blocks.length, 2)
  assert.deepEqual(blocks[0].lines, ["[00:00:01] ГМ: раз", "ещё", ""])
  assert.equal(blocks[1].t, 5)
})

test("склейка: сдвиг второй части и выброс перекрытия", () => {
  const part1 = "[00:00:05] ГМ: начало\n\n[02:00:10] ГМ: конец первой части"
  const part2 = [
    "[00:00:00] ГМ: дубль",
    "",
    "[00:00:15] ГМ: ещё дубль",
    "",
    "[00:00:20] ГМ: первая новая фраза",
    "",
    "[00:00:40] Игрок: вторая",
  ].join("\n")

  const { text, stats } = mergeParts({ part1, part2, offset: 7200, overlap: 10 })

  assert.equal(stats.dropped, 2)
  assert.equal(stats.part2Kept, 2)
  assert.equal(stats.boundary, 7220)
  assert.match(text, /\[02:00:20\] ГМ: первая новая фраза/)
  assert.match(text, /\[02:00:40\] Игрок: вторая/)
  assert.doesNotMatch(text, /дубль/)
  assert.doesNotMatch(text, /\n\n\n/)
  assert.ok(text.indexOf("начало") < text.indexOf("первая новая фраза"))
})

test("склейка: без таймкодов в первой части — ошибка", () => {
  assert.throws(
    () => mergeParts({ part1: "просто текст", part2: "[00:00:01] x", offset: 0, overlap: 10 }),
    /part1\.md/,
  )
})
