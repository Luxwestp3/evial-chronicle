#!/usr/bin/env bash
# Copies the campaign archive into content/ (the archive in the project folder is the source of truth).
# Raw transcripts stay out of the site.
set -euo pipefail
SRC="${1:-/mnt/project-files/campaign}"
DEST="$(cd "$(dirname "$0")/.." && pwd)/content"
rm -rf "$DEST"
mkdir -p "$DEST"
(cd "$SRC" && tar --exclude='./transcripts' --exclude='*/.*' -cf - .) | (cd "$DEST" && tar -xf -)
echo "synced $SRC -> $DEST"
