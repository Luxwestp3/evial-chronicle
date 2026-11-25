#!/usr/bin/env bash
# Режет оригинальную запись сессии (.m4a) на короткие .mp3 куски (44.1 кГц, 128 кбит/с)
# с перекрытием для мультимодальной транскрибации и готовит 16 кГц WAV для локальной
# диаризации (sherpa-onnx + pyannote-segmentation-3.0 + TitaNet-Large).
#
#   scripts/audio/chunk.sh <input.m4a> <session-number> [chunk_sec=720] [overlap_sec=15]
set -euo pipefail

if [ $# -lt 2 ] || [ $# -gt 4 ]; then
  echo "usage: $0 <input-audio> <session-number> [chunk_sec=720] [overlap_sec=15]" >&2
  exit 2
fi

INPUT="$1"
SESSION="$2"
CHUNK_SEC="${3:-720}"
OVERLAP="${4:-15}"

[ -f "$INPUT" ] || { echo "нет файла: $INPUT" >&2; exit 1; }
[[ "$SESSION" =~ ^[0-9]+$ ]] || { echo "номер сессии должен быть целым: $SESSION" >&2; exit 2; }

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
NNN=$(printf "%03d" "$((10#$SESSION))")
TDIR="$ROOT/private/transcripts/session-$NNN"
CDIR="$TDIR/chunks"
mkdir -p "$CDIR"

DUR_FLOAT=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$INPUT")
DUR=$(awk -v d="$DUR_FLOAT" 'BEGIN { printf "%d", d }')
[ "$DUR" -gt 30 ] || { echo "подозрительно короткая запись: ${DUR}s" >&2; exit 1; }

# 1. 16 kHz mono WAV для локальной диаризации
WAV="$TDIR/audio-16k.wav"
if [ ! -f "$WAV" ] || [ "${FORCE:-0}" = "1" ]; then
  echo "готовлю 16 кГц WAV для диаризации -> $WAV"
  ffmpeg -hide_banner -loglevel error -y -i "$INPUT" -vn -ac 1 -ar 16000 "$WAV"
else
  echo "уже есть: $WAV"
fi

# 2. Нарезка на короткие .mp3 (44.1 кГц, 128 кбит/с, моно) с перекрытием
STEP="$CHUNK_SEC"
IDX=0
START=0
CHUNKS_JSON=""

while [ "$START" -lt "$DUR" ]; do
  END=$((START + CHUNK_SEC + OVERLAP))
  if [ "$END" -gt "$DUR" ]; then
    END="$DUR"
  fi
  LEN=$((END - START))
  NAME=$(printf "chunk-%02d" "$IDX")
  MP3="$CDIR/${NAME}.mp3"

  if [ ! -f "$MP3" ] || [ "${FORCE:-0}" = "1" ]; then
    ffmpeg -hide_banner -loglevel error -y -ss "$START" -t "$LEN" -i "$INPUT" \
      -vn -ac 1 -ar 44100 -c:a libmp3lame -b:a 128k "$MP3"
  fi

  ENTRY=$(printf '{"index":%d,"name":"%s","file":"chunks/%s.mp3","start_sec":%d,"end_sec":%d,"duration":%d}' \
    "$IDX" "$NAME" "$NAME" "$START" "$END" "$LEN")
  if [ -n "$CHUNKS_JSON" ]; then
    CHUNKS_JSON="${CHUNKS_JSON},\n    ${ENTRY}"
  else
    CHUNKS_JSON="    ${ENTRY}"
  fi

  START=$((START + STEP))
  IDX=$((IDX + 1))
done

printf '{\n  "session": "%s",\n  "source": "%s",\n  "duration": %d,\n  "chunk_sec": %d,\n  "overlap": %d,\n  "chunks": [\n%b\n  ]\n}\n' \
  "$NNN" "$INPUT" "$DUR" "$CHUNK_SEC" "$OVERLAP" "$CHUNKS_JSON" > "$TDIR/chunks.json"

echo "сессия $NNN: длительность ${DUR}s -> $IDX кусков по ${CHUNK_SEC}s (+${OVERLAP}s перекрытия) в $CDIR"
