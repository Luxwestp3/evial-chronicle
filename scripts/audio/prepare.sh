#!/usr/bin/env bash
# Перекодирует запись сессии в mp3 и режет её на две части для загрузки.
#
#   scripts/audio/prepare.sh <файл.m4a> <номер сессии>
#
# Результат:
#   <каталог исходника>/session-NNN/session-NNN{,-part1,-part2}.mp3 — аудио,
#     вне репозитория, рядом с оригиналом (переопределяется DUNGEONS_AUDIO);
#   private/transcripts/session-NNN/prepare.json — длительности для склейки.
# Части перекрываются на OVERLAP секунд, чтобы на стыке не потерялась фраза.
set -euo pipefail

OVERLAP=10

usage() {
  echo "usage: $0 <input-audio> <session-number>" >&2
  exit 2
}

[ $# -eq 2 ] || usage

INPUT="$1"
SESSION="$2"

command -v ffmpeg >/dev/null 2>&1 || {
  echo "ffmpeg не найден. macOS: brew install ffmpeg" >&2
  exit 1
}
command -v ffprobe >/dev/null 2>&1 || {
  echo "ffprobe не найден. macOS: brew install ffmpeg" >&2
  exit 1
}
[ -f "$INPUT" ] || {
  echo "нет файла: $INPUT" >&2
  exit 1
}
[[ "$SESSION" =~ ^[0-9]+$ ]] || {
  echo "номер сессии должен быть целым числом, получено: $SESSION" >&2
  exit 2
}

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
NNN=$(printf "%03d" "$((10#$SESSION))")

# Аудио живёт вне репозитория: рядом с оригиналом, в подкаталоге сессии.
AUDIO_ROOT="${DUNGEONS_AUDIO:-$(cd "$(dirname "$INPUT")" && pwd)}"
ADIR="$AUDIO_ROOT/session-$NNN"
BASE="$ADIR/session-$NNN"
TDIR="$ROOT/private/transcripts/session-$NNN"
mkdir -p "$ADIR" "$TDIR"

duration() {
  ffprobe -v error -show_entries format=duration -of csv=p=0 "$1" |
    awk '{ printf "%d\n", $1 }'
}

# ---------- 1. перекодирование ----------
if [ -f "$BASE.mp3" ] && [ "${FORCE:-0}" != "1" ]; then
  echo "уже есть: $BASE.mp3 (FORCE=1 — перезаписать)"
else
  echo "перекодирую $INPUT -> $BASE.mp3"
  ffmpeg -hide_banner -loglevel error -y -i "$INPUT" -vn -map_metadata -1 \
    -ac 1 -ar 16000 -c:a libmp3lame -b:a 64k \
    -af "loudnorm=I=-16:TP=-1.5:LRA=11" \
    "$BASE.mp3"
fi

DUR=$(duration "$BASE.mp3")
[ "$DUR" -gt 60 ] || {
  echo "подозрительно короткая запись: ${DUR}s" >&2
  exit 1
}

CHANNELS=$(ffprobe -v error -select_streams a:0 \
  -show_entries stream=channels -of csv=p=0 "$BASE.mp3")
RATE=$(ffprobe -v error -select_streams a:0 \
  -show_entries stream=sample_rate -of csv=p=0 "$BASE.mp3")
[ "$CHANNELS" = "1" ] && [ "$RATE" = "16000" ] || {
  echo "ожидался моно 16 кГц, получено: каналов $CHANNELS, частота $RATE" >&2
  exit 1
}

# ---------- 2. разбиение ----------
HALF=$((DUR / 2))
P1_END=$((HALF + OVERLAP))
P2_START=$((HALF - OVERLAP))

for n in 1 2; do
  PART="$BASE-part$n.mp3"
  if [ -f "$PART" ] && [ "${FORCE:-0}" != "1" ]; then
    echo "уже есть: $PART"
  elif [ "$n" = 1 ]; then
    ffmpeg -hide_banner -loglevel error -y -i "$BASE.mp3" -ss 0 -t "$P1_END" \
      -c:a libmp3lame -b:a 64k "$PART"
  else
    ffmpeg -hide_banner -loglevel error -y -i "$BASE.mp3" -ss "$P2_START" \
      -c:a libmp3lame -b:a 64k "$PART"
  fi
done

D1=$(duration "$BASE-part1.mp3")
D2=$(duration "$BASE-part2.mp3")

# ---------- 3. отчёт ----------
human() { awk -v s="$1" 'BEGIN { printf "%d:%02d:%02d", s/3600, (s%3600)/60, s%60 }'; }

echo
echo "сессия $NNN"
echo "  оригинал:      $(human "$DUR")  ($(du -h "$BASE.mp3" | cut -f1))"
echo "  часть 1:       $(human "$D1")  ($(du -h "$BASE-part1.mp3" | cut -f1))"
echo "  часть 2:       $(human "$D2")  ($(du -h "$BASE-part2.mp3" | cut -f1))"
echo "  перекрытие:    ${OVERLAP}s, часть 2 начинается на $(human "$P2_START")"

LOST=$((DUR - (D1 + D2)))
if [ "$LOST" -lt -60 ] || [ "$LOST" -gt 60 ]; then
  echo "  ВНИМАНИЕ: сумма частей расходится с оригиналом на ${LOST}s" >&2
  exit 1
fi

# Длительности нужны склейке: она не должна зависеть от того, где лежит аудио.
cat >"$TDIR/prepare.json" <<JSON
{
  "session": "$NNN",
  "source": "$INPUT",
  "audio_dir": "$ADIR",
  "duration": $DUR,
  "overlap": $OVERLAP,
  "part1_duration": $D1,
  "part2_duration": $D2
}
JSON

echo
echo "Дальше:"
echo "  1. загрузить $BASE-part1.mp3 и $BASE-part2.mp3 с промптом из docs/campaign/PLAN.md (приложение A)"
echo "  2. положить ответы в private/transcripts/session-$NNN/part1.md и part2.md"
echo "  3. собрать: node scripts/audio/merge-transcript.mjs private/transcripts/session-$NNN"
